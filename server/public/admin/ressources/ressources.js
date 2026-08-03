// APS — admin/ressources/ressources.js — 2026-07-29 (mis à jour 3 août)
//
// Écran unifié des ressources d'orchestration d'une organisation restant à
// migrer vers leur propre écran dédié : nommages, contacts. Les
// correspondances (mappings) ont quitté cet écran le 3 août pour
// admin/mappings/ — même parcours que les manifestes (admin/manifests/),
// partis avant cette date. Les routes consommées respectent le contexte
// d'org (cookie aps-org-id) via getOrgContext.
//
// Un type = une route REST déjà existante :
//   nommages        -> /api/nommages   { id, name, rows }
//   contacts        -> /api/contacts   { id, name, contacts }

(function () {

  // Métadonnée par type : route + libellé + clé du contenu.
  const TYPES = {
    nommages: { route: '/api/nommages', labelSingulier: 'nommage',        cle: 'rows' },
    contacts: { route: '/api/contacts', labelSingulier: 'liste de contacts', cle: 'contacts' }
  };

  let typeCourant = 'nommages';
  let recherche = '';
  let cache = [];   // dernières ressources chargées (du type courant)

  const $ = function (sel) { return document.querySelector(sel); };

  // ── Chargement + rendu ──────────────────────────────────────────────────
  async function charger() {
    const t = TYPES[typeCourant];
    const liste = $('#res-list');
    liste.textContent = '';
    liste.className = 'res-list adm-loading';
    liste.textContent = 'Chargement…';
    try {
      const r = await fetch(t.route);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cache = await r.json();
      rendre();
    } catch (e) {
      liste.className = 'res-list adm-error';
      liste.textContent = 'Erreur de chargement : ' + e.message;
    }
  }

  function rendre() {
    const t = TYPES[typeCourant];
    const liste = $('#res-list');
    liste.className = 'res-list';
    liste.textContent = '';

    const filtrees = cache.filter(function (it) {
      return !recherche || (it.name || '').toLowerCase().indexOf(recherche.toLowerCase()) >= 0;
    });

    if (!filtrees.length) {
      const vide = document.createElement('div');
      vide.className = 'adm-empty';
      vide.textContent = recherche
        ? 'Aucune ressource ne correspond à « ' + recherche + ' ».'
        : 'Aucune ' + t.labelSingulier + ' pour cette organisation.';
      liste.appendChild(vide);
      return;
    }

    filtrees.forEach(function (it) {
      liste.appendChild(_carte(it, t));
    });
  }

  function _carte(it, t) {
    const carte = document.createElement('div');
    carte.className = 'res-card';
    carte.setAttribute('data-id', it.id);

    const nom = document.createElement('span');
    nom.className = 'res-name';
    nom.textContent = it.name || '(sans nom)';

    const compte = document.createElement('span');
    compte.className = 'res-count';
    const contenu = it[t.cle];
    const n = Array.isArray(contenu) ? contenu.length : 0;
    compte.textContent = n + ' ' + (typeCourant === 'contacts' ? 'contact' : 'entrée') + (n > 1 ? 's' : '');

    carte.appendChild(nom);
    carte.appendChild(compte);
    return carte;
  }

  // ── Onglets ─────────────────────────────────────────────────────────────
  function _activerOnglet(type) {
    typeCourant = type;
    document.querySelectorAll('.res-tab').forEach(function (b) {
      b.classList.toggle('res-tab-active', b.getAttribute('data-type') === type);
    });
    charger();
  }

  // ── Init ────────────────────────────────────────────────────────────────
  function init() {
    document.querySelectorAll('.res-tab').forEach(function (b) {
      b.addEventListener('click', function () { _activerOnglet(b.getAttribute('data-type')); });
    });
    const rech = $('#search');
    if (rech) rech.addEventListener('input', function () { recherche = rech.value; rendre(); });

    _activerOnglet('nommages');   // onglet par défaut
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
