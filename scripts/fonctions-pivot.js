// APS — scripts/fonctions-pivot.js — créé le 2026-08-12
// ================================================================
// LES FONCTIONS D'EXPRESSION DU PIVOT, déclarées une fois.
//
// Un gabarit du pivot ne contient pas que des références : il contient des
// EXPRESSIONS — `{filebase(item.title)}`, `{slug(Univers)}`, `{pad(rank,2)}`.
// Le moteur d'APS les évalue (builder-context.js, `resolve()`), et jusqu'ici
// personne d'autre ne savait qu'elles existaient : l'analyse d'émission les
// comptait comme des variables introuvables, ce qui envoyait chercher une
// étape productrice qui n'a jamais eu à exister.
//
// Cette table ne les implémente pas — elle les NOMME et dit ce qu'elles font.
// C'est le même motif que `rendre-make.js` pour les verbes : une description
// que chaque cible consomme à sa façon. Sans elle, chaque émetteur
// redécouvrirait le catalogue en lisant le moteur.
//
// ── CE QUE `porte` VEUT DIRE ────────────────────────────────────
//   natif    la plupart des cibles ont un équivalent direct (majuscules,
//            minuscules, espaces en trop) — le portage est une substitution
//   composé  se reconstruit à partir de primitives (padStart, addition), donc
//            portable mais à écrire
//   propre   la sémantique est À NOUS et ne se devine pas : `slug` et
//            `filebase` appliquent une normalisation précise (accents retirés,
//            espaces en `_`, caractères non alphanumériques supprimés,
//            soulignés compressés). Une cible qui « fait à peu près pareil »
//            produit des CHEMINS S3 DIFFÉRENTS — et un fichier livré à une
//            autre adresse que celle vérifiée ensuite.
//
// Le dernier cas est le seul qui compte vraiment : c'est là qu'un portage
// approximatif casse silencieusement une livraison.
// ================================================================
'use strict';

const FONCTIONS = {
  now: {
    signature: 'now([fuseau][, format])',
    fait: 'horodatage courant, éventuellement dans un fuseau IANA et un format nommé (date, time, timestamp, utc)',
    porte: 'natif',
    note: 'toute cible a une horloge ; le FUSEAU et le format sont la seule question',
  },
  slug: {
    signature: 'slug(ref)',
    fait: 'accents retirés, espaces en « _ », tout caractère hors [A-Za-z0-9_-] supprimé, soulignés compressés, bords nettoyés',
    porte: 'propre',
    note: 'sert à composer les chemins S3 — une variante produit une autre adresse',
  },
  filebase: {
    signature: 'filebase(ref)',
    fait: 'retire l\'extension de fichier (1 à 6 caractères), puis applique exactement la normalisation de slug',
    porte: 'propre',
    note: 'même enjeu que slug, avec le retrait d\'extension en plus',
  },
  upper: { signature: 'upper(ref)', fait: 'majuscules', porte: 'natif', note: null },
  lower: { signature: 'lower(ref)', fait: 'minuscules', porte: 'natif', note: null },
  trim:  { signature: 'trim(ref)',  fait: 'espaces de bord retirés', porte: 'natif', note: null },
  add: {
    signature: 'add(a, b, …)',
    fait: 'somme numérique des arguments ; une référence non numérique vaut 0',
    porte: 'composé',
    note: 'le « non numérique vaut 0 » est une tolérance d\'APS, pas une évidence — une cible stricte lèverait une erreur',
  },
  pad: {
    signature: 'pad(ref, largeur)',
    fait: 'complète à gauche avec des zéros jusqu\'à la largeur demandée',
    porte: 'composé',
    note: 'sert aux numéros de saison/épisode (« 01 ») — une cible sans padStart demande une expression',
  },
};

// Les fonctions RÉELLEMENT employées par un document pivot, avec leur
// description. Sert l'écran d'interprétation et tout émetteur : ce qui n'est
// pas utilisé n'a pas à être porté.
function fonctionsUtilisees(doc) {
  const comptes = new Map();
  const voir = function (valeur) {
    if (typeof valeur === 'string') {
      const re = /\{([^{}"':]+)\}/g;
      let m;
      while ((m = re.exec(valeur))) {
        const appel = m[1].match(/^([a-zA-Z_][\w]*)\s*\(/) || (/^now$/.test(m[1].trim()) ? [null, 'now'] : null);
        if (appel && FONCTIONS[appel[1]]) comptes.set(appel[1], (comptes.get(appel[1]) || 0) + 1);
      }
      return;
    }
    if (Array.isArray(valeur)) { valeur.forEach(voir); return; }
    if (valeur && typeof valeur === 'object') { Object.values(valeur).forEach(voir); }
  };
  (function visiter(sousDoc) {
    ((sousDoc && sousDoc.steps) || []).forEach(function (e) {
      if (!e || e.core === 'postit') return;
      voir(e.params || {});
      if (e.body) visiter(Array.isArray(e.body) ? { steps: e.body } : e.body);
    });
  })(doc);

  return [...comptes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(function ([nom, n]) {
      return Object.assign({ nom: nom, occurrences: n }, FONCTIONS[nom]);
    });
}

module.exports = { FONCTIONS, fonctionsUtilisees };

// Appelé directement : l'inventaire complet, pour relecture.
if (require.main === module) {
  console.log('Les ' + Object.keys(FONCTIONS).length + ' fonctions d\'expression du pivot :\n');
  Object.entries(FONCTIONS).forEach(function ([nom, f]) {
    console.log('  ' + f.signature.padEnd(24) + '[' + f.porte + ']');
    console.log('    ' + f.fait);
    if (f.note) console.log('    ⚠ ' + f.note);
  });
  const propres = Object.values(FONCTIONS).filter(f => f.porte === 'propre').length;
  console.log('\n' + propres + ' à sémantique PROPRE — les seules dont un portage approximatif');
  console.log('casse silencieusement une livraison (chemins S3 divergents).');
}
