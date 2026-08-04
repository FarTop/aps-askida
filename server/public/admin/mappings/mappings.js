// APS — admin/mappings/mappings.js — 2026-08-03
//
// Écran de composition des tables de correspondance (ressource d'org, Mapping).
// Une correspondance = nom + rows[]. Chaque row : champ source (key), chemin
// destination (value), type, format, repli, et en option une traduction de
// valeur (children[]). Forme exacte lue par lookup() (wfd-engine-handlers.js) —
// cf. config-schema.js, core 'lookup', pour la même documentation côté panneau
// du Builder. `src`/`tgt` acceptés en lecture par le moteur (alias historique,
// cf. audit du 3 août) mais cet écran écrit toujours key/value — canonique.
//
// Discipline : aucun inline, event listeners, création DOM par éléments.

(function () {

  const API = '/api/mappings';
  const TYPES_LIGNE  = ['string', 'list', 'integer', 'float', 'boolean'];
  const FORMATS_LIGNE = ['', 'slug'];

  let mappings = [];   // liste chargée
  let courant = null;  // correspondance en édition { id?, name, rows[] }

  // ── Chargement / liste ───────────────────────────────────────────────────
  async function charger() {
    try {
      const r = await fetch(API);
      mappings = await r.json();
      rendreListe();
    } catch (e) {
      _feedback('Erreur de chargement : ' + e.message, true);
    }
  }

  function rendreListe() {
    const hote = document.getElementById('mp-liste-items');
    hote.textContent = '';
    if (!mappings.length) {
      const v = document.createElement('div');
      v.className = 'mp-liste-vide';
      v.textContent = 'Aucune correspondance.';
      hote.appendChild(v);
      return;
    }
    mappings.forEach(function (m) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mp-liste-item';
      if (courant && courant.id === m.id) item.classList.add('mp-liste-item-actif');
      const nom = document.createElement('div');
      nom.className = 'mp-liste-nom';
      nom.textContent = m.name;
      const meta = document.createElement('div');
      meta.className = 'mp-liste-meta';
      const nb = Array.isArray(m.rows) ? m.rows.length : 0;
      meta.textContent = nb + ' ligne' + (nb > 1 ? 's' : '');
      item.appendChild(nom);
      item.appendChild(meta);
      item.addEventListener('click', function () { editer(m); });
      hote.appendChild(item);
    });
  }

  // ── Édition ──────────────────────────────────────────────────────────────
  function nouveau() {
    courant = { name: '', rows: [] };
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
    // Copie de travail (ne pas muter la liste avant enregistrement). La liste
    // porte déjà les rows complètes (cf. mapping.js — pas de second appel).
    // BUG RÉEL corrigé le 4 août : les données stockées utilisent parfois
    // `src`/`tgt` (alias historique côté moteur, cf. l'en-tête de ce fichier)
    // plutôt que `key`/`value`. `_ligneRow()` les affichait déjà via ce repli
    // (`row.key || row.src`), mais `enregistrer()` ne regardait QUE
    // `row.key`/`row.value` — toute ligne jamais retapée à la main était donc
    // traitée comme vide et retirée au premier enregistrement, quel que soit
    // ce qu'on venait de faire (même juste supprimer UNE autre ligne).
    // Normaliser ici, une fois, à l'ouverture : tout le reste du fichier ne
    // manipule plus que key/value, la forme canonique annoncée en en-tête.
    courant = {
      id: m.id, name: m.name,
      rows: (m.rows || []).map(function (row) {
        return Object.assign({}, row, {
          key: row.key || row.src || '',
          value: row.value || row.tgt || '',
          children: (row.children || []).map(function (c) {
            return Object.assign({}, c, { key: c.key || c.src || '', value: c.value || c.tgt || '' });
          })
        });
      })
    };
    rendreListe();
    _afficherEditeur();
  }

  function _afficherEditeur() {
    document.getElementById('mp-vide').hidden = true;
    document.getElementById('mp-editeur').hidden = false;
    document.getElementById('mp-nom').value = courant.name || '';
    rendreRows();
  }

  function rendreRows() {
    const hote = document.getElementById('mp-rows');
    hote.textContent = '';
    (courant.rows || []).forEach(function (row, i) {
      hote.appendChild(_ligneRow(row, i));
    });
  }

  function _ligneRow(row, index) {
    const bloc = document.createElement('div');
    bloc.className = 'mp-row';

    const tete = document.createElement('div');
    tete.className = 'mp-row-tete';

    // Champ source (key) — accepte aussi un champ ou une expression {…}.
    const key = document.createElement('input');
    key.placeholder = 'Champ source — ex. Classification';
    key.value = row.key || row.src || '';
    key.addEventListener('input', function () { row.key = key.value; });

    // Chemin destination (value) — dotted/bracket path, ex. images.amazon.cover_art
    const value = document.createElement('input');
    value.placeholder = 'Destination — ex. images.amazon.cover_art';
    value.value = row.value || row.tgt || '';
    value.addEventListener('input', function () { row.value = value.value; });

    // Type
    const type = document.createElement('select');
    TYPES_LIGNE.forEach(function (t) {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      if ((row.type || 'string') === t) o.selected = true;
      type.appendChild(o);
    });
    type.addEventListener('change', function () { row.type = type.value; });

    // Format
    const format = document.createElement('select');
    FORMATS_LIGNE.forEach(function (f) {
      const o = document.createElement('option');
      o.value = f; o.textContent = f || '(aucun)';
      if ((row._format || '') === f) o.selected = true;
      format.appendChild(o);
    });
    format.addEventListener('change', function () { row._format = format.value; });

    // Repli
    const fallback = document.createElement('input');
    fallback.placeholder = 'Repli si vide (optionnel)';
    fallback.value = row.fallback || '';
    fallback.addEventListener('input', function () { row.fallback = fallback.value; });

    // Retirer la ligne
    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'mp-row-suppr';
    suppr.textContent = '×';
    suppr.setAttribute('aria-label', 'Retirer cette ligne');
    suppr.addEventListener('click', function () {
      courant.rows.splice(index, 1);
      rendreRows();
    });

    tete.appendChild(key);
    tete.appendChild(value);
    tete.appendChild(type);
    tete.appendChild(format);
    tete.appendChild(fallback);
    tete.appendChild(suppr);
    bloc.appendChild(tete);

    bloc.appendChild(_blocChildren(row));

    return bloc;
  }

  // Traduction de valeur (children) : optionnelle, nichée sous la ligne — ex.
  // "Drame" -> "av_genre_drama". Ajoutée seulement au clic, pour ne pas
  // surcharger une ligne simple qui n'en a pas besoin.
  function _blocChildren(row) {
    const wrap = document.createElement('div');
    wrap.className = 'mp-children';

    function rendre() {
      wrap.textContent = '';
      (row.children || []).forEach(function (child, i) {
        wrap.appendChild(_ligneChild(row, child, i, rendre));
      });
      const ajouter = document.createElement('button');
      ajouter.type = 'button';
      ajouter.className = 'mp-add-child';
      ajouter.textContent = '+ traduction de valeur';
      ajouter.addEventListener('click', function () {
        row.children = row.children || [];
        row.children.push({ key: '', value: '' });
        rendre();
      });
      wrap.appendChild(ajouter);
    }
    rendre();
    return wrap;
  }

  function _ligneChild(row, child, index, rerendre) {
    const ligne = document.createElement('div');
    ligne.className = 'mp-child';

    const de = document.createElement('input');
    de.placeholder = 'valeur source — ex. Drame';
    de.value = child.key || child.src || '';
    de.addEventListener('input', function () { child.key = de.value; });

    const fleche = document.createElement('span');
    fleche.className = 'mp-child-fleche';
    fleche.textContent = '→';

    const vers = document.createElement('input');
    vers.placeholder = 'traduite en — ex. av_genre_drama';
    vers.value = child.value || child.tgt || '';
    vers.addEventListener('input', function () { child.value = vers.value; });

    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'mp-child-suppr';
    suppr.textContent = '×';
    suppr.setAttribute('aria-label', 'Retirer cette traduction');
    suppr.addEventListener('click', function () {
      row.children.splice(index, 1);
      rerendre();
    });

    ligne.appendChild(de);
    ligne.appendChild(fleche);
    ligne.appendChild(vers);
    ligne.appendChild(suppr);
    return ligne;
  }

  function ajouterRow() {
    courant.rows = courant.rows || [];
    courant.rows.push({ key: '', value: '', type: 'string', _format: '', fallback: '', children: [] });
    rendreRows();
  }

  // ── Enregistrer / supprimer ──────────────────────────────────────────────
  async function enregistrer() {
    courant.name = document.getElementById('mp-nom').value.trim();
    if (!courant.name) { _feedback('Le nom est requis.', true); return; }

    // Nettoyage léger : une ligne sans champ source ni destination ne sert à
    // rien (lookup() l'ignore de toute façon — cf. `if (!fromKey || !toKey) return;`)
    // et une traduction vide pareillement.
    const rows = (courant.rows || [])
      .filter(function (r) { return (r.key || '').trim() || (r.value || '').trim(); })
      .map(function (r) {
        const propre = { key: r.key || '', value: r.value || '', type: r.type || 'string' };
        if (r._format) propre._format = r._format;
        if (r.fallback) propre.fallback = r.fallback;
        const children = (r.children || []).filter(function (c) { return (c.key || '').trim() && (c.value || '').trim(); });
        if (children.length) propre.children = children;
        return propre;
      });

    const corps = { name: courant.name, rows: rows };
    try {
      let r;
      if (courant.id) {
        r = await fetch(API + '/' + courant.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      } else {
        r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      }
      const data = await r.json();
      if (!r.ok) {
        _feedback(data.error || 'Erreur', true);
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
    if (!window.confirm('Supprimer la correspondance « ' + courant.name + ' » ? Cette action est irréversible.')) return;
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
    document.getElementById('mp-editeur').hidden = true;
    document.getElementById('mp-vide').hidden = false;
  }

  function _feedback(msg, erreur) {
    const el = document.getElementById('mp-feedback');
    el.textContent = msg;
    el.classList.toggle('mp-feedback-erreur', !!erreur);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('mp-nouveau').addEventListener('click', nouveau);
    document.getElementById('mp-add-row').addEventListener('click', ajouterRow);
    document.getElementById('mp-enregistrer').addEventListener('click', enregistrer);
    document.getElementById('mp-supprimer').addEventListener('click', supprimer);
    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
