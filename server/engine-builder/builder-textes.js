// APS — server/engine-builder/builder-textes.js — créé le 2026-08-14
// ================================================================
// LES NORMALISATIONS DE TEXTE QUI COMPOSENT DES ADRESSES.
//
// Fonctions PURES. Ni contexte, ni réseau, ni base.
//
// ── DEUX SLUGS DANS APS, ET ILS NE SE CONFONDENT PAS ────────────
// Vérifié le 2026-08-14, parce que la ressemblance invite à la faute :
//
//   slugChemin      casse PRÉSERVÉE, tirets BAS. Compose les chemins S3 —
//                   « Galactica_17500196/Saison_01_40209885 ». C'est celui-ci.
//   Corresp.slugifier  minuscules, tirets HAUTS. Compose les valeurs envoyées
//                   au partenaire — « ice-cube ». Il vit dans
//                   builder-correspondance.js et n'a rien à faire ici.
//
// Les intervertir ne casserait rien de visible : la livraison partirait à une
// adresse et le contrôle en lirait une autre, et le premier symptôme serait un
// fichier « manquant » que tout le monde voit pourtant dans le bucket.
//
// ── POURQUOI CE FICHIER ─────────────────────────────────────────
// `slugChemin` existait en DEUX exemplaires identiques — builder-context.js
// (la fonction d'expression `{slug(…)}`) et le handler resolve_ancestors. Une
// Lambda en aurait fait un troisième. Quatrième application du principe qui
// gouverne ce chantier : ce qui doit tourner des deux côtés vit dans un module
// pur, embarqué à l'émission.
// ================================================================
'use strict';

// Retire les accents, remplace les espaces par des tirets bas, écarte tout ce
// qui n'est ni alphanumérique ni `_` ni `-`, réduit les tirets bas consécutifs
// et rogne ceux des extrémités. La casse est PRÉSERVÉE — « MaSérie » donne
// « MaSerie », pas « maserie ».
function slugChemin(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Le nom d'un fichier sans son extension, puis normalisé comme un chemin.
// L'extension est bornée à six caractères : « saison.01.mp4 » perd « .mp4 » et
// garde « saison.01 » — un `substringBefore` couperait au premier point.
function baseDeFichier(v) {
  return slugChemin(String(v == null ? '' : v).replace(/\.[a-zA-Z0-9]{1,6}$/, ''));
}

module.exports = { slugChemin, baseDeFichier };
