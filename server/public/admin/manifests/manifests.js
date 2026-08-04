// APS — admin/manifests/manifests.js — 2026-07-30
//
// Écran de composition des manifestes de livraison (ressource d'org). Un
// manifeste = nom + niveau + essences[]. Chaque essence : rôle, reconnaissance
// (fragments), cardinalité, sortie. Le résumé narratif est reconstruit à la
// volée (miroir de pivot-manifest.resumer côté client, pour feedback immédiat).
//
// Discipline : aucun inline, event listeners, création DOM par éléments.

(function () {

  const API = '/api/manifests';
  const CARDINALITES = [
    { v: 'exactement_un', label: 'exactement 1' },
    { v: 'au_moins_un',   label: 'au moins 1' },
    { v: 'optionnel',     label: 'optionnel' },
    { v: 'au_plus_n',     label: 'au plus N' }
  ];
  const ROLES = ['video', 'image', 'subtitle', 'audio', 'poster', 'artwork'];
  // Niveaux d'applicabilité par essence (3 août — pivot-manifest.js NIVEAUX) :
  // un manifeste unique couvre les 4 niveaux, chaque essence dit lesquels la
  // concernent. Toutes cochées = appliesTo absent (rétrocompatible, "tous
  // niveaux" — même sens qu'avant que ce champ existe).
  const NIVEAUX = [
    { v: 'serie',    l: 'Sé', f: 'Série' },
    { v: 'saison',   l: 'Sa', f: 'Saison' },
    { v: 'episode',  l: 'Ép', f: 'Episode' },
    { v: 'unitaire', l: 'Un', f: 'Unitaire' }
  ];

  let manifests = [];   // liste chargée
  let courant = null;   // manifeste en édition { id?, name, niveau, essences[] }

  // ── Chargement / liste ───────────────────────────────────────────────────
  async function charger() {
    try {
      const r = await fetch(API);
      manifests = await r.json();
      rendreListe();
    } catch (e) {
      _feedback('Erreur de chargement : ' + e.message, true);
    }
  }

  function rendreListe() {
    const hote = document.getElementById('mf-liste-items');
    hote.textContent = '';
    if (!manifests.length) {
      const v = document.createElement('div');
      v.className = 'mf-liste-vide';
      v.textContent = 'Aucun manifeste.';
      hote.appendChild(v);
      return;
    }
    manifests.forEach(function (m) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mf-liste-item';
      if (courant && courant.id === m.id) item.classList.add('mf-liste-item-actif');
      const nom = document.createElement('div');
      nom.className = 'mf-liste-nom';
      nom.textContent = m.name;
      const meta = document.createElement('div');
      meta.className = 'mf-liste-meta';
      const nb = Array.isArray(m.essences) ? m.essences.length : 0;
      meta.textContent = (m.niveau && m.niveau !== '*' ? m.niveau + ' · ' : '') + nb + ' essence' + (nb > 1 ? 's' : '');
      item.appendChild(nom);
      item.appendChild(meta);
      item.addEventListener('click', function () { editer(m); });
      hote.appendChild(item);
    });
  }

  // ── Édition ──────────────────────────────────────────────────────────────
  function nouveau() {
    courant = { name: '', niveau: '*', essences: [] };
    _afficherEditeur();
  }

  function editer(m) {
    // Recliquer l'item déjà ouvert le referme — évite d'avoir à remonter en
    // haut de page pour "fermer" un éditeur long avant d'en choisir un autre.
    if (courant && courant.id === m.id) {
      courant = null;
      rendreListe();
      _reset();
      return;
    }
    // Copie de travail (ne pas muter la liste avant enregistrement).
    courant = { id: m.id, name: m.name, niveau: m.niveau || '*', essences: (m.essences || []).map(function (e) { return Object.assign({}, e); }) };
    rendreListe();
    _afficherEditeur();
  }

  function _afficherEditeur() {
    document.getElementById('mf-vide').hidden = true;
    document.getElementById('mf-editeur').hidden = false;
    document.getElementById('mf-nom').value = courant.name || '';
    document.getElementById('mf-niveau').value = courant.niveau || '*';
    rendreEssences();
    rendreResume();
  }

  function rendreEssences() {
    const hote = document.getElementById('mf-essences');
    hote.textContent = '';
    (courant.essences || []).forEach(function (e, i) {
      hote.appendChild(_ligneEssence(e, i));
    });
  }

  function _ligneEssence(essence, index) {
    const ligne = document.createElement('div');
    ligne.className = 'mf-essence';

    // Rôle (liste + saisie libre via datalist)
    const role = document.createElement('input');
    role.className = 'mf-essence-role';
    role.setAttribute('list', 'mf-roles');
    role.placeholder = 'rôle';
    role.value = essence.role || '';
    role.addEventListener('input', function () { essence.role = role.value.trim(); rendreResume(); });

    // Reconnaissance (fragments séparés par virgule)
    const reco = document.createElement('input');
    reco.className = 'mf-essence-reco';
    reco.placeholder = '.mp4, .mov  ou  _poster';
    reco.value = (essence.reconnu_par || []).join(', ');
    reco.addEventListener('input', function () {
      essence.reconnu_par = reco.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    });

    // Cardinalité
    const card = document.createElement('select');
    card.className = 'mf-essence-card';
    CARDINALITES.forEach(function (c) {
      const o = document.createElement('option');
      o.value = c.v; o.textContent = c.label;
      if (essence.cardinalite === c.v) o.selected = true;
      card.appendChild(o);
    });
    card.addEventListener('change', function () {
      essence.cardinalite = card.value;
      _majN();
      rendreResume();
    });

    // N (visible seulement si au_plus_n)
    const n = document.createElement('input');
    n.className = 'mf-essence-n';
    n.type = 'number'; n.min = '1'; n.placeholder = 'N';
    n.value = essence.n != null ? essence.n : '';
    n.addEventListener('input', function () { essence.n = n.value ? parseInt(n.value, 10) : null; });
    function _majN() { n.hidden = essence.cardinalite !== 'au_plus_n'; }
    _majN();

    // Sortie
    const sortie = document.createElement('input');
    sortie.className = 'mf-essence-sortie';
    sortie.placeholder = 'clé de sortie (ex. s3_video_url)';
    sortie.value = essence.sortie || '';
    sortie.addEventListener('input', function () { essence.sortie = sortie.value.trim(); });

    // Niveaux d'applicabilité — chaque essence dit à quels niveaux elle
    // compte (Série/Saison/Épisode/Unitaire). Toutes cochées ⇔ appliesTo
    // absent (compte à tous les niveaux, rétrocompatible).
    const niveaux = document.createElement('div');
    niveaux.className = 'mf-essence-niveaux';
    niveaux.setAttribute('role', 'group');
    niveaux.setAttribute('aria-label', 'Niveaux où cette essence compte');
    const actuel = Array.isArray(essence.appliesTo) && essence.appliesTo.indexOf('*') === -1
      ? essence.appliesTo : null; // null = tous niveaux
    NIVEAUX.forEach(function (niv) {
      const lab = document.createElement('label');
      lab.className = 'mf-niveau-chip';
      lab.title = niv.f;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = actuel ? actuel.indexOf(niv.v) !== -1 : true;
      box.addEventListener('change', function () { _majAppliesTo(); });
      lab.appendChild(box);
      lab.appendChild(document.createTextNode(niv.l));
      niveaux.appendChild(lab);
    });
    function _majAppliesTo() {
      const boxes = niveaux.querySelectorAll('input[type=checkbox]');
      const coches = [];
      boxes.forEach(function (b, i) { if (b.checked) coches.push(NIVEAUX[i].v); });
      essence.appliesTo = coches.length === NIVEAUX.length ? undefined : coches;
      rendreResume();
    }

    // Retirer
    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'mf-essence-suppr';
    suppr.textContent = '×';
    suppr.setAttribute('aria-label', 'Retirer cette essence');
    suppr.addEventListener('click', function () {
      courant.essences.splice(index, 1);
      rendreEssences();
      rendreResume();
    });

    ligne.appendChild(role);
    ligne.appendChild(reco);
    ligne.appendChild(card);
    ligne.appendChild(n);
    ligne.appendChild(sortie);
    ligne.appendChild(niveaux);
    ligne.appendChild(suppr);
    return ligne;
  }

  function ajouterEssence() {
    courant.essences.push({ role: '', reconnu_par: [], cardinalite: 'au_moins_un', sortie: '' });
    rendreEssences();
    rendreResume();
  }

  // Résumé narratif (miroir de pivot-manifest.resumer, feedback immédiat).
  function rendreResume() {
    const hote = document.getElementById('mf-resume');
    const es = courant.essences || [];
    if (!es.length) { hote.textContent = ''; return; }
    const parts = es.map(function (e) {
      const card = {
        exactement_un: 'exactement 1', au_moins_un: 'au moins 1',
        optionnel: 'optionnel', au_plus_n: 'au plus ' + (e.n || '?')
      }[e.cardinalite] || e.cardinalite;
      const portee = Array.isArray(e.appliesTo) && e.appliesTo.length
        ? ' [' + e.appliesTo.join(',') + ']' : '';
      return (e.role || '?') + ' (' + card + ')' + portee;
    });
    const niv = courant.niveau && courant.niveau !== '*' ? ' au niveau ' + courant.niveau : '';
    hote.textContent = 'Livraison' + niv + ' : ' + parts.join(', ') + '.';
  }

  // ── Enregistrer / supprimer ──────────────────────────────────────────────
  async function enregistrer() {
    courant.name = document.getElementById('mf-nom').value.trim();
    courant.niveau = document.getElementById('mf-niveau').value;
    if (!courant.name) { _feedback('Le nom est requis.', true); return; }

    const corps = { name: courant.name, niveau: courant.niveau, essences: courant.essences };
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
    document.getElementById('mf-editeur').hidden = true;
    document.getElementById('mf-vide').hidden = false;
  }

  function _feedback(msg, erreur) {
    const el = document.getElementById('mf-feedback');
    el.textContent = msg;
    el.classList.toggle('mf-feedback-erreur', !!erreur);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // datalist des rôles connus
    const dl = document.createElement('datalist');
    dl.id = 'mf-roles';
    ROLES.forEach(function (r) { const o = document.createElement('option'); o.value = r; dl.appendChild(o); });
    document.body.appendChild(dl);

    document.getElementById('mf-nouveau').addEventListener('click', nouveau);
    document.getElementById('mf-add-essence').addEventListener('click', ajouterEssence);
    document.getElementById('mf-enregistrer').addEventListener('click', enregistrer);
    document.getElementById('mf-supprimer').addEventListener('click', supprimer);
    document.getElementById('mf-nom').addEventListener('input', function () { rendreResume(); });
    document.getElementById('mf-niveau').addEventListener('change', function () { if (courant) { courant.niveau = this.value; rendreResume(); } });
    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
