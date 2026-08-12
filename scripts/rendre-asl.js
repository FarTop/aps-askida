// APS — scripts/rendre-asl.js — créé le 2026-08-12
// ================================================================
// Ce qu'un verbe d'APS devient en Amazon States Language.
//
//   node scripts/rendre-asl.js        affiche la table, ne produit rien
//
// Pendant de `rendre-make.js`, et même contrat : `compositionDe(famille,
// params)` rend `{dit, pourquoi, mesure, modules[], nombre}` — l'écran
// d'interprétation ne sait pas de quelle cible il parle.
//
// ── UN AVERTISSEMENT QUI VAUT POUR TOUTE LA TABLE ───────────────
// Rien ici n'est MESURÉ. Le chantier Make a montré que la seule méthode qui
// marche est de demander à la cible — poser un objet à la main, le relire par
// l'API, comparer. Huit hypothèses à l'aveugle avaient échoué avant la
// première mesure. Cette table est donc entièrement déduite de la
// spécification ASL, et chaque entrée porte `source: 'doc'` pour le dire.
// Elle sert à ESTIMER, pas à émettre. La première machine d'états créée pour
// de vrai la corrigera.
//
// ── CE QUE ASL CHANGE PAR RAPPORT À MAKE ────────────────────────
// Trois différences renversent des coûts, et c'est pour elles qu'un chiffrage
// par cible ne se déduit pas de l'autre :
//
//   ASL SAIT BOUCLER. Un sondage n'est pas déroulé : Task → Choice → Wait →
//   retour au Task. Trois états, quel que soit le nombre d'essais, là où Make
//   en imbrique une vingtaine parce qu'il n'a pas de boucle conditionnelle.
//   C'est le poste de coût le plus lourd de PUBLISH qui s'effondre.
//
//   L'ERREUR EST NATIVE. `Retry` et `Catch` s'attachent à un état : un port
//   d'erreur d'APS ne coûte pas un état de plus, contrairement au gestionnaire
//   accroché d'un module Make.
//
//   MAIS ASL N'EXÉCUTE PAS DE LOGIQUE. Les intrinsèques (`States.Format`,
//   `States.ArrayGetItem`…) transforment, elles ne décident pas. Traduire une
//   table de correspondance, résoudre une politique d'héritage sur trente
//   règles, tenir un registre : rien de tout cela ne s'écrit en ASL. Il faut
//   une Lambda — donc du code à écrire, déployer et maintenir. C'est le prix
//   caché de cette cible, et il ne se voit pas en comptant des états.
// ================================================================
'use strict';

// `forme` reprend le vocabulaire d'ASL. `lambda: true` marque ce qui n'est PAS
// exprimable en ASL et demande du code — l'information la plus coûteuse de la
// table, donc portée par un drapeau plutôt que noyée dans une phrase.
const COMPOSITIONS = {
  wait: {
    dit: 'boucle native',
    pourquoi: 'ASL sait boucler : un sondage est un cycle Task → Choice → Wait, '
            + 'pas une chaîne déroulée — le nombre d\'essais ne change pas le nombre d\'états',
    source: 'doc',
    etats: function () {
      return [
        { etat: 'Task',   role: 'interroger l\'endpoint' },
        { etat: 'Choice', role: 'checkPath atteint ? sortir : continuer' },
        { etat: 'Wait',   role: 'attendre delaySeconds, puis revenir au Task' },
      ];
    },
  },
  lookup: {
    dit: 'Lambda',
    pourquoi: 'traduire une table de correspondance et résoudre l\'héritage entre '
            + 'niveaux n\'est pas exprimable avec les intrinsèques ASL : c\'est de '
            + 'la logique, pas de la transformation',
    source: 'doc',
    lambda: true,
    etats: function () {
      return [{ etat: 'Task', role: 'Lambda — correspondance + héritage (code à écrire)' }];
    },
  },
  verify: {
    dit: 'Map sur les essences',
    pourquoi: 'chaque essence se vérifie par son propre appel ; ASL itère nativement '
            + 'et recompose le tableau des résultats sans agrégateur explicite',
    source: 'doc',
    etats: function () {
      return [
        { etat: 'Map',  role: 'parcourir les essences du manifeste' },
        { etat: 'Task', role: 'interroger verifyEndpoint (dans l\'ItemProcessor)' },
        { etat: 'Pass', role: 'recomposer le verdict' },
      ];
    },
  },
  'aps.registry': {
    dit: 'Lambda + stockage',
    pourquoi: 'le registre et le compteur vivent dans la base d\'APS. Aucune cible ne '
            + 'les porte : il faut et le code, et une table (DynamoDB) pour l\'état',
    source: 'doc',
    lambda: true,
    etats: function () {
      return [{ etat: 'Task', role: 'Lambda — identifiant unique, adossé à une table' }];
    },
  },
};

// Ce qu'un core devient, quand il n'a pas de composition à lui. Rendu séparé
// des compositions : une forme n'est pas un coût.
const FORMES = {
  decision:     { etat: 'Choice', dit: function (n) { return 'Choice à ' + Math.max(n, 1) + ' règle(s)'; },
                  pourquoi: 'un embranchement APS a des ports ; ASL a des règles Choice — la correspondance est directe' },
  loop:         { etat: 'Map', dit: function () { return 'Map · ItemProcessor'; },
                  pourquoi: 'le corps reste DANS la machine d\'états, contrairement à Make' },
  trigger:      { etat: '—', dit: function () { return 'EventBridge ou StartExecution'; },
                  pourquoi: 'une machine d\'états n\'a pas de déclencheur interne : il vit à côté' },
  http_request: { etat: 'Task', dit: function () { return 'Task · http:invoke'; },
                  pourquoi: 'appel HTTP natif via une EventBridge Connection, sans Lambda' },
  deliver:      { etat: 'Task', dit: function () { return 'Task · aws-sdk:s3:listObjectsV2'; },
                  pourquoi: 'S3 est une intégration native d\'ASL — c\'est la cible la mieux placée pour ce verbe' },
};

function compositionDe(famille, params) {
  const c = COMPOSITIONS[famille];
  if (!c) return null;
  const etats = c.etats(params || {});
  return { dit: c.dit, pourquoi: c.pourquoi,
           mesure: 'déduit de la spécification ASL — jamais vérifié sur un compte AWS',
           lambda: !!c.lambda,
           modules: etats.map(e => ({ module: e.etat, role: e.role })),
           nombre: etats.length };
}

module.exports = { COMPOSITIONS, FORMES, compositionDe };

if (require.main === module) {
  console.log('CE QU\'UN VERBE DEVIENT EN ASL — déduit de la spec, jamais mesuré\n');
  Object.entries(COMPOSITIONS).forEach(function ([nom, c]) {
    const etats = c.etats({});
    console.log('  ' + nom.padEnd(14) + c.dit.padEnd(22) + etats.length + ' état(s)'
              + (c.lambda ? '   ⚠ DEMANDE UNE LAMBDA' : ''));
    etats.forEach(e => console.log('      ' + e.etat.padEnd(8) + e.role));
  });
  console.log('\nFORMES');
  Object.entries(FORMES).forEach(function ([nom, f]) {
    console.log('  ' + nom.padEnd(14) + f.dit(2));
  });
  const lambdas = Object.entries(COMPOSITIONS).filter(([, c]) => c.lambda).map(([n]) => n);
  console.log('\n⚠ ' + lambdas.length + ' verbe(s) hors de portée d\'ASL seul : ' + lambdas.join(', '));
  console.log('  Du code à écrire, déployer et maintenir — le prix caché de cette');
  console.log('  cible, invisible dans un décompte d\'états.');
}
