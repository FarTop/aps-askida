// APS — server/engine-builder/builder-heritage.js — créé le 2026-08-12
// ================================================================
// La résolution de l'héritage entre niveaux d'une arborescence.
//
// POURQUOI. Mesuré le 2026-08-12 sur la préprod VOD Factory : une série ne
// portait que son titre, et TOUTE sa branche était bloquée chez Amazon
// (`parent_not_sent` en cascade sur la saison puis l'épisode). Exiger les dix
// attributs à chaque niveau ferait ressaisir dix valeurs par épisode ; ne rien
// exiger livrerait des fiches vides. L'arbitrage rendu avec le responsable
// Bayard : la résolution se fait À LA PUBLICATION, en remontant tant que c'est
// vide, et ce qui varie d'un champ à l'autre est le DROIT de remonter.
//
//   propre     ne remonte jamais. Chaque niveau a le sien.
//   cascade    remonte librement — constantes de l'œuvre.
//   signalee   remonte, mais la livraison DIT qu'elle a emprunté.
//   fusion     union du niveau et de ses ancêtres, dédoublonnée.
//
// `fusion` n'est PAS un repli : elle s'applique même quand le niveau courant a
// sa propre valeur. Un épisode qui déclare un invité doit GARDER le casting
// récurrent de la série ; un simple « sinon » le ferait disparaître.
//
// La politique est déclarative et vit dans la correspondance
// (`Mapping.rules[].heritage`), pas ici — ce module ne fait que l'appliquer.
// Elle accepte deux formes : une chaîne (même règle à tous les niveaux) ou un
// objet par niveau (`{saison:'cascade', episode:'signalee'}`) — la saison
// hérite normalement du synopsis quand l'épisode doit être différencié.
// ================================================================
'use strict';

const POLITIQUES = ['propre', 'cascade', 'signalee', 'fusion'];

// Les clés de politique par niveau sont écrites sans accent ni casse dans la
// correspondance (`saison`, `episode`) là où Iconik écrit `TypeCollection`
// avec sa casse et ses accents (« Série », « Saison », « Episode »).
function normaliserNiveau(type) {
  return String(type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// La politique effective d'une règle AU NIVEAU où le workflow s'exécute.
// Une politique par niveau qui ne dit rien de ce niveau-là ne se replie pas
// sur une autre : elle vaut `propre`. Hériter par défaut serait exactement le
// genre d'emprunt silencieux que l'arbitrage cherche à rendre visible.
function politiquePour(heritage, typeCollection) {
  if (!heritage) return 'propre';
  if (typeof heritage === 'string') {
    return POLITIQUES.includes(heritage) ? heritage : 'propre';
  }
  if (typeof heritage === 'object') {
    const p = heritage[normaliserNiveau(typeCollection)];
    return POLITIQUES.includes(p) ? p : 'propre';
  }
  return 'propre';
}

function estVide(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0 || v.every(estVide);
  return false;
}

// Aplatit la forme Iconik `{champ:{name,type,values:[{value,label}]}}` en
// `{champ: valeur | [valeurs]}` — mesurée le 2026-08-12 sur DEV | BAYARD.
// Une valeur unique reste scalaire, plusieurs deviennent une liste : la même
// convention que celle du Lookup sur `metadata_values[].field_values`, pour
// qu'une valeur héritée se comporte comme une valeur propre en aval
// (traduction `children`, `type`, `_format`).
function aplatirMetadonnees(md) {
  const plat = {};
  Object.entries(md || {}).forEach(function ([cle, champ]) {
    const vals = (champ && champ.values) || [];
    if (!vals.length) return;
    plat[cle] = vals.length === 1 ? vals[0].value : vals.map(v => v.value);
  });
  return plat;
}

// Premier ancêtre — du plus proche au plus lointain — qui porte une valeur
// non vide pour ce champ. `ancetres` est la pile posée par
// iconik.resolve_ancestors, déjà ordonnée parent d'abord.
function chercherChezAncetres(champ, ancetres) {
  for (const a of (ancetres || [])) {
    const v = a && a.metadata ? a.metadata[champ] : undefined;
    if (!estVide(v)) return { valeur: v, depuis: a };
  }
  return null;
}

// Une valeur multiple d'Iconik n'arrive PAS toujours en tableau : quand elle
// transite par une variable de contexte (le cas nominal — le nœud Search
// expose les métadonnées sous leur nom nu, et une variable est une chaîne),
// elle arrive sérialisée : `'["Ice Cube","Chris Tucker"]'`. Le Lookup connaît
// déjà cette forme et la déballe pour le formatage `slug` ; la fusion doit la
// connaître aussi, sans quoi elle traite deux acteurs comme une seule personne
// nommée « ["Ice Cube","Chris Tucker"] » — constaté en réel le 2026-08-12 sur
// « Friday - The Serie », qui a livré un unique `ice-cube-chris-tucker`.
function enListe(v) {
  if (Array.isArray(v)) return v;
  const d = deballerJson(v);
  return Array.isArray(d) ? d : [v];
}

// La même reconnaissance, mais NON forçante : rend le tableau quand la valeur
// en était un sérialisé, et la valeur inchangée sinon. C'est la forme dont le
// Lookup a besoin pour déballer sans transformer tout scalaire en liste.
function deballerJson(v) {
  if (typeof v !== 'string' || !v.trim().startsWith('[')) return v;
  try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch (_) {}
  return v;
}

// Union du niveau courant et de tous ses ancêtres, dédoublonnée.
//
// L'arbitrage dit « dédoublonnage sur (external_id, job) ». Le `job` est fixé
// par la règle de correspondance elle-même (`persons[job=director]
// .external_id`), donc constant sur toute la fusion : il ne reste à comparer
// que l'external_id. Et mesuré le 2026-08-12, l'external_id d'une personne EST
// la valeur du champ Iconik — un nom (« Etienne Julien ») ; Iconik ne porte pas
// d'identifiant de personne. Le dédoublonnage se fait donc sur la valeur, à
// la casse et aux espaces près. Ordre préservé, niveau courant d'abord : la
// livraison montre les personnes du niveau avant celles empruntées.
function fusionner(valeurLocale, champ, ancetres) {
  const sortie  = [];
  const vues    = new Set();
  const apports = [];

  const ajouter = function (v, provenance) {
    const items = enListe(v);
    const pris  = [];
    items.forEach(function (item) {
      if (estVide(item)) return;
      const cle = String(item).trim().toLowerCase();
      if (vues.has(cle)) return;
      vues.add(cle);
      sortie.push(item);
      pris.push(item);
    });
    if (pris.length && provenance) apports.push({ niveau: provenance.niveau, titre: provenance.titre, valeurs: pris });
  };

  ajouter(valeurLocale, null);
  (ancetres || []).forEach(function (a) {
    ajouter(a && a.metadata ? a.metadata[champ] : undefined, a);
  });

  return { valeurs: sortie, apports: apports };
}

module.exports = { POLITIQUES, normaliserNiveau, politiquePour, estVide, enListe, deballerJson, aplatirMetadonnees, chercherChezAncetres, fusionner };
