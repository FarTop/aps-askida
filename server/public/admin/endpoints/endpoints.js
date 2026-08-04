// APS — admin/endpoints/endpoints.js — 2026-08-04
//
// Écran de composition des séquences HTTP (ressource d'org, remplace le
// tableau `steps` jusqu'ici recopié dans le nœud http_sequence / façade
// vodfactory.partner, node "Partner" du canevas). Un Endpoints = nom +
// steps[]. Chaque step est en mode `simple` (une requête) ou `foreach` (une
// requête par valeur), même vocabulaire que config-schema.js (core ===
// 'http_sequence') — c'est ce vocabulaire que le moteur (wfd-engine-handlers.js,
// handleHttpRequest/_handleHttpForeach) lit tel quel après résolution
// sequenceId -> steps (pivot-to-wfd.js).
//
// ignoreCodes/feIgnoreCodes sont stockés ici comme de VRAIS tableaux de
// nombres, jamais des chaînes "409,422" — le moteur fait `.map(Number)`
// directement dessus (parfois même un spread `[...cfg.ignoreCodes]`), sans
// jamais les splitter lui-même (contrairement à `wait`/failValues, qui lui
// fait `.split(',')`). Un champ texte comme avant aurait reproduit le bug
// trouvé le 4 août (crash en mode foreach, filtrage cassé en mode simple).
//
// Discipline : aucun inline, event listeners, création DOM par éléments.

(function () {

  const API = '/api/endpoints';
  const MODES = [
    { v: 'simple',  l: 'Single request' },
    { v: 'foreach', l: 'One request per value' }
  ];
  const METHODES = ['GET', 'POST', 'PUT', 'DELETE'];
  const SRC_OPTIONS = [
    { v: 'value', l: 'The item itself' },
    { v: 'slug',  l: 'Slug of the item' },
    { v: 'index', l: 'Index (0, 1, 2…)' },
    { v: 'job',   l: 'Role tag (set above)' }
  ];

  let endpoints = [];  // liste chargée
  let courant = null;  // séquence en édition { id?, name, steps[] }
  let connexions = []; // cache des connexions (pour l'override par étape)

  // ── Chargement / liste ───────────────────────────────────────────────────
  async function charger() {
    try {
      const r = await fetch(API);
      endpoints = await r.json();
      rendreListe();
    } catch (e) {
      _feedback('Erreur de chargement : ' + e.message, true);
    }
  }

  async function chargerConnexions() {
    try {
      const r = await fetch('/api/connexions');
      connexions = await r.json();
    } catch (e) { connexions = []; }
  }

  function rendreListe() {
    const hote = document.getElementById('ep-liste-items');
    hote.textContent = '';
    if (!endpoints.length) {
      const v = document.createElement('div');
      v.className = 'ep-liste-vide';
      v.textContent = 'Aucune séquence.';
      hote.appendChild(v);
      return;
    }
    endpoints.forEach(function (e) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ep-liste-item';
      if (courant && courant.id === e.id) item.classList.add('ep-liste-item-actif');
      const nom = document.createElement('div');
      nom.className = 'ep-liste-nom';
      nom.textContent = e.name;
      const meta = document.createElement('div');
      meta.className = 'ep-liste-meta';
      const nb = Array.isArray(e.steps) ? e.steps.length : 0;
      meta.textContent = nb + ' étape' + (nb > 1 ? 's' : '');
      item.appendChild(nom);
      item.appendChild(meta);
      item.addEventListener('click', function () { editer(e); });
      hote.appendChild(item);
    });
  }

  // ── Édition ──────────────────────────────────────────────────────────────
  function nouveau() {
    courant = { name: '', steps: [] };
    _afficherEditeur();
  }

  function editer(e) {
    // Recliquer l'item déjà ouvert le referme — même UX que Manifestes/
    // Correspondances (cf. builder-etat.md, 3 août).
    if (courant && courant.id === e.id) {
      courant = null;
      rendreListe();
      _reset();
      return;
    }
    // Copie de travail (ne pas muter la liste avant enregistrement).
    courant = { id: e.id, name: e.name, steps: (e.steps || []).map(_copieStep) };
    rendreListe();
    _afficherEditeur();
  }

  function _copieStep(s) {
    return Object.assign({}, s, {
      ignoreCodes: (s.ignoreCodes || []).slice(),
      feIgnoreCodes: (s.feIgnoreCodes || []).slice(),
      feFields: (s.feFields || []).map(function (f) { return Object.assign({}, f); })
    });
  }

  function _afficherEditeur() {
    document.getElementById('ep-vide').hidden = true;
    document.getElementById('ep-editeur').hidden = false;
    document.getElementById('ep-nom').value = courant.name || '';
    rendreSteps();
  }

  function rendreSteps() {
    const hote = document.getElementById('ep-steps');
    hote.textContent = '';
    (courant.steps || []).forEach(function (s, i) {
      hote.appendChild(_carteStep(s, i));
    });
  }

  // ── Petits constructeurs de champs (texte/select/checkbox/textarea) ──────
  function _champTexte(label, valeur, onInput, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini';
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = valeur || '';
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function _champNombres(label, valeurs, onChange, placeholder) {
    // Édition en texte "409,422" pour confort, converti en tableau de
    // nombres à chaque frappe — c'est le tableau qui est stocké, jamais la
    // chaîne (cf. en-tête de fichier).
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini';
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = (valeurs || []).join(',');
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', function () {
      const nombres = input.value.split(',').map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return !isNaN(n); });
      onChange(nombres);
    });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function _champSelect(label, valeur, options, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini';
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = label;
    const sel = document.createElement('select');
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      if (o.v === valeur) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return { wrap: wrap, sel: sel };
  }

  function _champCheckbox(label, coche, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini ep-champ-mini-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!coche;
    input.addEventListener('change', function () { onChange(input.checked); });
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = label;
    wrap.appendChild(input);
    wrap.appendChild(lab);
    return wrap;
  }

  function _champTextarea(label, valeur, onInput, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini';
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = label;
    const ta = document.createElement('textarea');
    ta.value = valeur || '';
    if (placeholder) ta.placeholder = placeholder;
    ta.addEventListener('input', function () { onInput(ta.value); });
    wrap.appendChild(lab);
    wrap.appendChild(ta);
    return wrap;
  }

  function _selectConnexion(valeur, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-champ-mini';
    const lab = document.createElement('span');
    lab.className = 'ep-champ-mini-label';
    lab.textContent = 'Connection override (optional)';
    const sel = document.createElement('select');
    const vide = document.createElement('option');
    vide.value = ''; vide.textContent = '— sequence\'s connection —';
    sel.appendChild(vide);
    connexions.forEach(function (c) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      if (c.id === valeur) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return wrap;
  }

  // ── Carte d'une étape ─────────────────────────────────────────────────────
  function _carteStep(step, index) {
    const carte = document.createElement('div');
    carte.className = 'ep-step';

    // ── Tête : nom, mode, réordonner, retirer ────────────────────────────
    const tete = document.createElement('div');
    tete.className = 'ep-step-tete';

    const nom = document.createElement('input');
    nom.className = 'ep-input ep-step-nom';
    nom.type = 'text';
    nom.placeholder = 'e.g. Persons director';
    nom.value = step.name || '';
    nom.addEventListener('input', function () { step.name = nom.value; });

    const mode = document.createElement('select');
    mode.className = 'ep-input ep-step-mode';
    MODES.forEach(function (m) {
      const o = document.createElement('option');
      o.value = m.v; o.textContent = m.l;
      if ((step.httpMode || 'simple') === m.v) o.selected = true;
      mode.appendChild(o);
    });
    mode.addEventListener('change', function () {
      step.httpMode = mode.value;
      rendreSteps();
    });

    const reorder = document.createElement('div');
    reorder.className = 'ep-step-reorder';
    const up = document.createElement('button');
    up.type = 'button'; up.className = 'ep-btn ep-btn-petit'; up.textContent = '▲';
    up.disabled = index === 0;
    up.addEventListener('click', function () { _deplacer(index, -1); });
    const down = document.createElement('button');
    down.type = 'button'; down.className = 'ep-btn ep-btn-petit'; down.textContent = '▼';
    down.disabled = index === courant.steps.length - 1;
    down.addEventListener('click', function () { _deplacer(index, 1); });
    reorder.appendChild(up);
    reorder.appendChild(down);

    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'ep-step-suppr';
    suppr.textContent = '×';
    suppr.setAttribute('aria-label', 'Retirer cette étape');
    suppr.addEventListener('click', function () {
      courant.steps.splice(index, 1);
      rendreSteps();
    });

    tete.appendChild(nom);
    tete.appendChild(mode);
    tete.appendChild(reorder);
    tete.appendChild(suppr);
    carte.appendChild(tete);

    // ── Champs communs (connexion, méthode, endpoint, condition) ─────────
    const grille = document.createElement('div');
    grille.className = 'ep-step-grille';
    grille.appendChild(_selectConnexion(step.connexionId, function (v) { step.connexionId = v; }));
    grille.appendChild(_champSelect('Method', step.method || 'POST', METHODES.map(function (m) { return { v: m, l: m }; }), function (v) { step.method = v; }).wrap);
    grille.appendChild(_champTexte('Endpoint', step.endpoint, function (v) { step.endpoint = v; }, '/api/contents/{external_id}/videos'));
    grille.appendChild(_champTexte('Skip unless set (optional)', step.skipIfEmpty, function (v) { step.skipIfEmpty = v; }, '{s3_video_url}'));
    carte.appendChild(grille);

    // ── Bloc mode "simple" ────────────────────────────────────────────────
    if ((step.httpMode || 'simple') === 'simple') {
      const tete2 = document.createElement('div');
      tete2.className = 'ep-step-bloc-tete';
      tete2.textContent = 'Single request';
      carte.appendChild(tete2);

      carte.appendChild(_champTextarea('Body template (JSON, optional)', step.bodyTemplate, function (v) { step.bodyTemplate = v; }, '{"external_id":"{external_id}", "url":"{s3_video_url}"}'));

      const ligne2 = document.createElement('div');
      ligne2.className = 'ep-step-grille-2';
      ligne2.appendChild(_champTexte('Body from variable (if no template above)', step.sourceVar, function (v) { step.sourceVar = v; }, '{vodFactoryPayload}'));
      ligne2.appendChild(_champTexte('Store as', step.resultVar, function (v) { step.resultVar = v; }, '{vodFactoryPayload}'));
      carte.appendChild(ligne2);

      const ligne3 = document.createElement('div');
      ligne3.className = 'ep-step-grille-2';
      ligne3.appendChild(_champCheckbox('Retry as PUT on 422 (upsert)', step.upsert !== false, function (v) { step.upsert = v; }));
      ligne3.appendChild(_champNombres('HTTP codes to ignore (comma-separated)', step.ignoreCodes, function (v) { step.ignoreCodes = v; }, '409,422'));
      carte.appendChild(ligne3);
    }

    // ── Bloc mode "foreach" ───────────────────────────────────────────────
    if (step.httpMode === 'foreach') {
      const tete2 = document.createElement('div');
      tete2.className = 'ep-step-bloc-tete';
      tete2.textContent = 'One request per value';
      carte.appendChild(tete2);

      const ligneA = document.createElement('div');
      ligneA.className = 'ep-step-grille';
      ligneA.appendChild(_champTexte('Iterate over', step.feSourceVar, function (v) { step.feSourceVar = v; }, '{Realisateur}'));
      ligneA.appendChild(_champTexte('Item variable name', step.feLocalName, function (v) { step.feLocalName = v; }, 'nom'));
      ligneA.appendChild(_champTexte('Role tag (optional — available as "job")', step.feJob, function (v) { step.feJob = v; }, 'director'));
      ligneA.appendChild(_champTexte('Field to collect from each response', step.feCollectField, function (v) { step.feCollectField = v; }, 'external_id'));
      carte.appendChild(ligneA);

      // feFields — sous-liste key/src
      const feTete = document.createElement('div');
      feTete.className = 'ep-champ-mini-label';
      feTete.textContent = 'Body fields';
      carte.appendChild(feTete);
      const feWrap = document.createElement('div');
      feWrap.className = 'ep-fefields';
      (step.feFields || []).forEach(function (f, fi) {
        feWrap.appendChild(_ligneFeField(step, f, fi));
      });
      carte.appendChild(feWrap);
      const addFe = document.createElement('button');
      addFe.type = 'button';
      addFe.className = 'ep-btn ep-btn-petit';
      addFe.textContent = '+ Field';
      addFe.addEventListener('click', function () {
        step.feFields = step.feFields || [];
        step.feFields.push({ key: '', src: 'value' });
        rendreSteps();
      });
      carte.appendChild(addFe);

      const ligneB = document.createElement('div');
      ligneB.className = 'ep-step-grille-2';
      ligneB.style.marginTop = '8px';
      ligneB.appendChild(_champNombres('HTTP codes to ignore (comma-separated)', step.feIgnoreCodes, function (v) { step.feIgnoreCodes = v; }, '409,422'));
      ligneB.appendChild(_champSelect('On value error', step.feOnError || 'continue', [
        { v: 'continue', l: 'Skip value, continue' }, { v: 'stop', l: 'Stop this step' }
      ], function (v) { step.feOnError = v; }).wrap);
      carte.appendChild(ligneB);

      const ligneC = document.createElement('div');
      ligneC.className = 'ep-step-grille-2';
      ligneC.appendChild(_champCheckbox('Append to existing results (don\'t overwrite)', step.feAppend, function (v) { step.feAppend = v; }));
      ligneC.appendChild(_champTexte('Store as', step.feResultVar, function (v) { step.feResultVar = v; }, '{personsResult}'));
      carte.appendChild(ligneC);
    }

    // ── Commun : onError de l'étape (contrôle de flux de la séquence) ────
    const bas = document.createElement('div');
    bas.className = 'ep-step-grille-2';
    bas.style.marginTop = '8px';
    bas.appendChild(_champSelect('On step error (sequence-level)', step.onError || 'stop', [
      { v: 'stop', l: 'Stop the sequence' }, { v: 'continue', l: 'Continue to next step' }
    ], function (v) { step.onError = v; }).wrap);
    carte.appendChild(bas);

    return carte;
  }

  function _ligneFeField(step, f, index) {
    const ligne = document.createElement('div');
    ligne.className = 'ep-fefield-ligne';

    const key = document.createElement('input');
    key.type = 'text';
    key.placeholder = 'Field (e.g. external_id)';
    key.value = f.key || '';
    key.addEventListener('input', function () { f.key = key.value; });

    const src = document.createElement('select');
    SRC_OPTIONS.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      if ((f.src || 'value') === o.v) opt.selected = true;
      src.appendChild(opt);
    });
    src.addEventListener('change', function () { f.src = src.value; });

    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'ep-fefield-suppr';
    suppr.textContent = '×';
    suppr.setAttribute('aria-label', 'Retirer ce champ');
    suppr.addEventListener('click', function () {
      step.feFields.splice(index, 1);
      rendreSteps();
    });

    ligne.appendChild(key);
    ligne.appendChild(src);
    ligne.appendChild(suppr);
    return ligne;
  }

  function _deplacer(index, delta) {
    const cible = index + delta;
    if (cible < 0 || cible >= courant.steps.length) return;
    const tmp = courant.steps[index];
    courant.steps[index] = courant.steps[cible];
    courant.steps[cible] = tmp;
    rendreSteps();
  }

  function ajouterStep() {
    courant.steps = courant.steps || [];
    courant.steps.push({ name: '', httpMode: 'simple', method: 'POST', endpoint: '', onError: 'stop', ignoreCodes: [], feIgnoreCodes: [], feFields: [] });
    rendreSteps();
  }

  // ── Enregistrer / supprimer ──────────────────────────────────────────────
  async function enregistrer() {
    courant.name = document.getElementById('ep-nom').value.trim();
    if (!courant.name) { _feedback('Le nom est requis.', true); return; }

    const corps = { name: courant.name, steps: courant.steps };
    try {
      let r;
      if (courant.id) {
        r = await fetch(API + '/' + courant.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      } else {
        r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      }
      const data = await r.json();
      if (!r.ok) {
        _feedback((data.error || 'Erreur') + (data.details ? ' : ' + data.details.join(' ; ') : ''), true);
        return;
      }
      if (!courant.id && data.id) courant.id = data.id;
      _feedback('Enregistré.', false);
      await charger();
    } catch (e) {
      _feedback('Erreur : ' + e.message, true);
    }
  }

  async function supprimer() {
    if (!courant.id) { _reset(); return; }
    try {
      await fetch(API + '/' + courant.id, { method: 'DELETE' });
      courant = null;
      _reset();
      await charger();
    } catch (e) {
      _feedback('Erreur : ' + e.message, true);
    }
  }

  function _reset() {
    document.getElementById('ep-editeur').hidden = true;
    document.getElementById('ep-vide').hidden = false;
  }

  function _feedback(msg, erreur) {
    const el = document.getElementById('ep-feedback');
    el.textContent = msg;
    el.classList.toggle('ep-feedback-erreur', !!erreur);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    document.getElementById('ep-nouveau').addEventListener('click', nouveau);
    document.getElementById('ep-add-step').addEventListener('click', ajouterStep);
    document.getElementById('ep-enregistrer').addEventListener('click', enregistrer);
    document.getElementById('ep-supprimer').addEventListener('click', supprimer);
    await chargerConnexions();
    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
