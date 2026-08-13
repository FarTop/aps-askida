// APS — admin/doc-assets/doc-assets.js — 2026-08-13
//
// Écran de gestion des ressources graphiques (DocAsset) : charte, logo, fontes,
// icônes. Ressource d'organisation, même paradigme que Mapping et Endpoint —
// liste à gauche, éditeur à droite, CRUD complet.
//
// POURQUOI IL EXISTE. Les exports de WFD portaient leur charte EN DUR, avec une
// représentation qui ne ressemblait pas à la vraie. Une charte dans du code ne
// se corrige que par un commit, et chaque nouveau rendu refait la faute. Elle
// devient ici une donnée. Sans cet écran, la table existait mais n'était
// remplissable qu'au `curl` — c'est-à-dire par personne.
//
// CE QUE CET ÉCRAN NE DÉCIDE PAS, et c'est délibéré : la FORME d'une charte
// (couleurs, graisses, échelles typographiques) relève de la conception du
// Documentation Builder, qui n'est pas tranchée. `meta` reste donc un JSON
// libre, validé à la frappe. Rendre corrigeable n'est pas décider.
//
// Discipline du dépôt : aucun style inline, aucun basculement d'apparence
// depuis JS (l'attribut `hidden` et les `data-*` font le travail), DOM construit
// par création d'éléments.
(function () {
  'use strict';

  const API      = '/api/doc-assets';
  const API_TPL  = '/api/doc-templates';

  const TYPES = ['brand', 'logo', 'font', 'icon', 'image'];

  // Ce qu'on propose comme type MIME quand on choisit un type : une aide, pas
  // une contrainte — le champ reste libre.
  const MIME_SUGGERE = {
    brand: 'application/json',
    logo:  'image/svg+xml',
    font:  'font/woff2',
    icon:  'image/svg+xml',
    image: 'image/png',
  };

  let liste    = [];      // les ressources de l'org
  let gabarits = [];      // les DocTemplate, pour dire qui se sert de quoi
  let courant  = null;    // la ressource éditée ; { id: null } = création

  // ── DOM ────────────────────────────────────────────────────────
  let elListe, elEditeur, elVide, elNom, elType, elMime, elChemin,
      elMeta, elMetaEtat, elUsage, elFeedback, elSupprimer;

  function dire(texte, ton) {
    elFeedback.textContent = texte || '';
    if (ton) elFeedback.setAttribute('data-ton', ton);
    else     elFeedback.removeAttribute('data-ton');
  }

  // ── Chargement ─────────────────────────────────────────────────
  async function charger() {
    try {
      const [rA, rT] = await Promise.all([fetch(API), fetch(API_TPL)]);
      if (!rA.ok) throw new Error('HTTP ' + rA.status);
      liste = await rA.json();
      // Un échec sur les gabarits ne doit pas empêcher d'éditer une charte :
      // il ne coûte que la ligne « qui s'en sert ».
      gabarits = rT.ok ? await rT.json() : [];
      rendreListe();
    } catch (e) {
      liste = [];
      rendreListe();
      dire('Chargement impossible : ' + e.message, 'erreur');
    }
  }

  function rendreListe() {
    elListe.textContent = '';
    if (!liste.length) {
      const vide = document.createElement('div');
      vide.className = 'da-liste-vide';
      vide.textContent = 'Aucune ressource.';
      elListe.appendChild(vide);
      return;
    }
    liste.forEach(function (a) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'da-liste-item';
      if (courant && courant.id === a.id) item.classList.add('da-liste-item-actif');

      const nom = document.createElement('div');
      nom.className = 'da-liste-nom';
      nom.textContent = a.name;
      item.appendChild(nom);

      const meta = document.createElement('div');
      meta.className = 'da-liste-meta';
      const pastille = document.createElement('span');
      pastille.className = 'da-pastille';
      pastille.setAttribute('data-type', a.type);
      pastille.textContent = a.type;
      meta.appendChild(pastille);
      const mime = document.createElement('span');
      mime.textContent = ' ' + (a.mimeType || '');
      meta.appendChild(mime);
      item.appendChild(meta);

      item.addEventListener('click', function () { editer(a); });
      elListe.appendChild(item);
    });
  }

  // ── Édition ────────────────────────────────────────────────────
  function editer(a) {
    courant = a;
    elNom.value    = a.name || '';
    elType.value   = TYPES.indexOf(a.type) !== -1 ? a.type : 'brand';
    elMime.value   = a.mimeType || '';
    elChemin.value = a.storagePath || '';
    elMeta.value   = a.meta ? JSON.stringify(a.meta, null, 2) : '';
    validerMeta();
    elSupprimer.hidden = !a.id;
    elEditeur.hidden = false;
    elVide.hidden = true;
    dire('');
    rendreUsage();
    rendreListe();
  }

  function nouveau() {
    editer({ id: null, name: '', type: 'brand', mimeType: MIME_SUGGERE.brand, storagePath: '', meta: null });
    elNom.focus();
  }

  // Qui référence cette ressource. La route refuse la suppression tant qu'un
  // gabarit s'en sert — autant le dire avant le clic plutôt qu'après le 409.
  function rendreUsage() {
    elUsage.textContent = '';
    if (!courant || !courant.id) { elUsage.hidden = true; return; }
    const utilisateurs = gabarits.filter(function (t) { return t.brandAssetId === courant.id; });
    elUsage.hidden = false;
    if (!utilisateurs.length) {
      elUsage.textContent = 'Aucun gabarit ne désigne cette ressource.';
      return;
    }
    const tete = document.createElement('strong');
    tete.textContent = utilisateurs.length + ' gabarit(s) l\'utilisent : ';
    elUsage.appendChild(tete);
    elUsage.appendChild(document.createTextNode(
      utilisateurs.map(function (t) { return t.name; }).join(', ')
      + ' — la suppression sera refusée tant que c\'est le cas.'));
  }

  // ── `meta` : un JSON libre, mais valide ────────────────────────
  // Le seul champ de cet écran qu'on peut casser en tapant. On le dit à la
  // frappe plutôt qu'au moment d'enregistrer.
  function validerMeta() {
    const brut = elMeta.value.trim();
    if (!brut) {
      elMeta.removeAttribute('data-invalide');
      elMetaEtat.textContent = 'vide';
      elMetaEtat.removeAttribute('data-ton');
      return { ok: true, valeur: null };
    }
    try {
      const v = JSON.parse(brut);
      elMeta.removeAttribute('data-invalide');
      elMetaEtat.textContent = 'JSON valide';
      elMetaEtat.removeAttribute('data-ton');
      return { ok: true, valeur: v };
    } catch (e) {
      elMeta.setAttribute('data-invalide', '1');
      elMetaEtat.textContent = 'JSON invalide — ' + e.message;
      elMetaEtat.setAttribute('data-ton', 'erreur');
      return { ok: false, valeur: null };
    }
  }

  // ── Enregistrer / supprimer ────────────────────────────────────
  async function enregistrer() {
    if (!courant) return;
    const nom = elNom.value.trim();
    if (!nom) { dire('Le nom est requis.', 'erreur'); elNom.focus(); return; }
    const meta = validerMeta();
    if (!meta.ok) { dire('Corrigez le JSON des métadonnées avant d\'enregistrer.', 'erreur'); return; }

    const corps = {
      name: nom,
      type: elType.value,
      mimeType: elMime.value.trim(),
      storagePath: elChemin.value.trim(),
      meta: meta.valeur,
    };
    try {
      const r = courant.id
        ? await fetch(API + '/' + courant.id, { method: 'PUT',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
        : await fetch(API, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const rep = await r.json();
      if (!r.ok) throw new Error(rep.error || ('HTTP ' + r.status));
      courant = rep;
      await charger();
      editer(liste.find(function (a) { return a.id === rep.id; }) || rep);
      dire('Enregistré.', 'ok');
    } catch (e) {
      dire('Enregistrement impossible : ' + e.message, 'erreur');
    }
  }

  async function supprimer() {
    if (!courant || !courant.id) return;
    if (!window.confirm('Supprimer « ' + courant.name + '» ?')) return;
    try {
      const r = await fetch(API + '/' + courant.id, { method: 'DELETE' });
      const rep = await r.json();
      if (!r.ok) throw new Error(rep.error || ('HTTP ' + r.status));
      courant = null;
      elEditeur.hidden = true;
      elVide.hidden = false;
      await charger();
    } catch (e) {
      dire('Suppression impossible : ' + e.message, 'erreur');
    }
  }

  // ── Démarrage ──────────────────────────────────────────────────
  function init() {
    elListe     = document.getElementById('da-liste-items');
    elEditeur   = document.getElementById('da-editeur');
    elVide      = document.getElementById('da-vide');
    elNom       = document.getElementById('da-nom');
    elType      = document.getElementById('da-type');
    elMime      = document.getElementById('da-mime');
    elChemin    = document.getElementById('da-chemin');
    elMeta      = document.getElementById('da-meta');
    elMetaEtat  = document.getElementById('da-meta-etat');
    elUsage     = document.getElementById('da-usage');
    elFeedback  = document.getElementById('da-feedback');
    elSupprimer = document.getElementById('da-supprimer');

    document.getElementById('da-nouveau').addEventListener('click', nouveau);
    document.getElementById('da-enregistrer').addEventListener('click', enregistrer);
    elSupprimer.addEventListener('click', supprimer);
    elMeta.addEventListener('input', validerMeta);

    // Le type MIME suit le type tant qu'on ne l'a pas écrit soi-même : une
    // fonte proposée en `image/png` est une faute de frappe qui se remarque
    // trois écrans plus loin.
    elType.addEventListener('change', function () {
      const suggere = MIME_SUGGERE[elType.value] || '';
      const actuel  = elMime.value.trim();
      const etaitSuggere = !actuel || Object.keys(MIME_SUGGERE).some(function (t) {
        return MIME_SUGGERE[t] === actuel;
      });
      if (etaitSuggere) elMime.value = suggere;
    });

    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
