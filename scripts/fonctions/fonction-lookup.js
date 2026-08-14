// APS — aps-lookup — fonction générée.
// ================================================================
// Applique une correspondance à un objet : traduire les valeurs dans la langue
// du partenaire, résoudre l'héritage entre niveaux, dire ce qui a été emprunté.
//
// ASL ne sait pas faire ça, et pas par manque de fonctions : c'est de la
// LOGIQUE. Trente règles, un ordre de recours, une politique d'héritage par
// champ. Les intrinsèques transforment, elles ne décident pas.
//
// ── CETTE FONCTION NE CONTIENT PAS LA LOGIQUE ───────────────────
// Comme `aps-essences`, elle l'APPELLE. `builder-lookup-noyau.js` et ses deux
// dépendances sont embarqués tels quels, copiés depuis le dépôt à l'émission.
// Le noyau a été extrait du handler le 2026-08-14 pour cet usage précis, et le
// handler d'APS appelle désormais le MÊME code — vérifié par
// scripts/preuve-heritage.js, qui compare le résultat au payload attendu.
//
// L'enjeu est le même que pour les essences, en pire : deux implémentations
// divergentes produiraient deux charges utiles à partir de la même
// correspondance. Le partenaire en accepterait une et refuserait l'autre, et
// rien ne dirait laquelle a raison — on l'a vu le 2026-08-12 quand deux genres
// partaient non traduits (« The selected genres.0 is invalid »).
//
// ── CE QUE LA FONCTION FAIT, ELLE ───────────────────────────────
// La PROVENANCE, et rien d'autre. C'est la seule chose qui ne peut pas être
// partagée : APS a un espace de noms global et une pile de résultats, une
// Lambda reçoit un objet plat. Elle fournit donc au noyau son sac de variables
// et sa façon de rendre un gabarit `{…}` — une substitution simple, là où APS
// consulte son contexte.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { rows: [...], entree: {...}, variables: {...},
//     ancetres: [...], niveau: 'Série'|…, horsNiveau: [...] }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { mapped, trace, matched, emprunts, found }
//   `found` sert au port du même nom : `matched > 0`, comme dans le moteur.
// ================================================================
'use strict';

const Noyau = require('./builder-lookup-noyau.js');

// Rendre un gabarit `{nom}` depuis le sac de variables. C'est la version plate
// de ce que `BuilderContext.resolve` fait chez APS : pas de chemins pointés, pas
// de pile de résultats — une Lambda n'a ni l'un ni l'autre, et prétendre le
// contraire ferait échouer silencieusement des références qu'APS résolvait.
// Une référence introuvable est laissée TELLE QUELLE : le noyau la reconnaît
// alors comme un repli non résolu et le trace, au lieu de la remplacer par du
// vide qui se lirait comme une donnée absente.
function substituer(variables) {
  return function (gabarit) {
    if (typeof gabarit !== 'string') return gabarit;
    return gabarit.replace(/\{([^{}]+)\}/g, function (tel, nom) {
      const v = variables[nom.trim()];
      return v === undefined || v === null ? tel : String(v);
    });
  };
}

exports.handler = async function (evenement) {
  const e = evenement || {};

  const vu = Noyau.appliquer({
    rows      : e.rows || [],
    entree    : e.entree || {},
    variables : e.variables || {},
    ancetres  : e.ancetres || [],
    niveau    : e.niveau || '',
    horsNiveau: e.horsNiveau || [],
    resoudre  : substituer(e.variables || {}),
  });

  return {
    mapped  : vu.mapped,
    trace   : vu.trace,
    matched : vu.matched,
    emprunts: Noyau.empruntsDe(vu.trace),
    found   : vu.matched > 0,
  };
};
