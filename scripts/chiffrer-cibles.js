// APS — scripts/chiffrer-cibles.js — créé le 2026-08-12
// ================================================================
// CE QUE COÛTE UN RUN, CHEZ CHAQUE CIBLE.
//
//   node scripts/chiffrer-cibles.js [runsParMois]
//
// ── D'OÙ VIENNENT LES CHIFFRES ──────────────────────────────────
// Les VOLUMES sont mesurés : 118 modules émis chez Make, 41 états chez ASL,
// relevés par les deux émetteurs sur BAYARD | PUBLISH | VODFACTORY.
//
// Les TARIFS ne le sont pas. Ils sont saisis ici de mémoire, à vérifier sur les
// pages de prix — ils changent, et ils dépendent de la région. C'est pourquoi
// ils sont des CONSTANTES en tête de fichier et non des nombres noyés dans un
// calcul : corriger un tarif doit prendre dix secondes et refaire tout le
// tableau.
//
// ── LE PIÈGE DU DÉCOMPTE ────────────────────────────────────────
// « 118 modules » n'est PAS « 118 opérations facturées ». Ni Make ni AWS ne
// facturent ce qui n'est pas parcouru : la chaîne de sondage déroulée de Make
// coûte 3 modules si l'export finit au premier essai, 59 s'il va au bout. Le
// nombre émis mesure la TAILLE du scénario, pas son prix. On chiffre donc trois
// scénarios de sondage, parce que c'est lui qui domine tout le reste.
// ================================================================
'use strict';

// ── TARIFS — À VÉRIFIER, saisis de mémoire le 2026-08-12 ────────
const TARIFS = {
  // Step Functions Standard, facturé à la TRANSITION d'état.
  aslParTransition: 0.025 / 1000,          // ~0,025 $ / 1000 transitions
  // Lambda : requête + temps. À 128 Mo et quelques dizaines de ms, le temps est
  // sous le centième de centime — on garde la requête, qui domine.
  lambdaParAppel:   0.20 / 1000000,        // 0,20 $ / million de requêtes
  // Make facture des OPÉRATIONS, par abonnement. Le coût marginal dépend donc
  // du palier : ~9 $ pour 10 000 opérations sur les petits plans.
  makeParOperation: 9 / 10000,
};

// ── VOLUMES — MESURÉS par les émetteurs ─────────────────────────
const PUBLISH = {
  make: { total: 118, sansSondage: 118 - 59, sondageParEssai: 3 },
  asl:  { total: 41,  sansSondage: 41 - 3,   sondageParEssai: 3, lambdas: 3 },
};

// Trois scénarios : l'export S3 aboutit vite, moyennement, ou épuise les essais.
const SCENARIOS = [
  { nom: 'export prêt au 1er essai',  essais: 1 },
  { nom: 'export prêt au 5e essai',   essais: 5 },
  { nom: 'les 20 essais épuisés',     essais: 20 },
];

function coutMake(essais) {
  const ops = PUBLISH.make.sansSondage + PUBLISH.make.sondageParEssai * essais;
  return { unites: ops, cout: ops * TARIFS.makeParOperation };
}

function coutAsl(essais) {
  // Une transition par état parcouru, plus le cycle de sondage.
  const transitions = PUBLISH.asl.sansSondage + PUBLISH.asl.sondageParEssai * essais;
  const cout = transitions * TARIFS.aslParTransition
             + PUBLISH.asl.lambdas * TARIFS.lambdaParAppel;
  return { unites: transitions, cout: cout };
}

function euros(d) { return (d * 0.92).toFixed(4); }   // ordre de grandeur

const runs = parseInt(process.argv[2], 10) || 1000;

console.log('CE QUE COÛTE UN RUN DE BAYARD | PUBLISH | VODFACTORY\n');
console.log('Volumes mesurés   : ' + PUBLISH.make.total + ' modules chez Make · '
          + PUBLISH.asl.total + ' états chez ASL');
console.log('Tarifs            : SAISIS DE MÉMOIRE, à vérifier avant de citer\n');
console.log('  scénario                     Make            ASL           écart');
console.log('  ' + '-'.repeat(64));
SCENARIOS.forEach(function (s) {
  const m = coutMake(s.essais), a = coutAsl(s.essais);
  const facteur = (m.cout / a.cout).toFixed(0);
  console.log('  ' + s.nom.padEnd(28)
    + (m.unites + ' op · $' + m.cout.toFixed(4)).padEnd(18)
    + (a.unites + ' tr · $' + a.cout.toFixed(4)).padEnd(18)
    + '×' + facteur);
});

console.log('\nÀ ' + runs + ' publications par mois, scénario médian (5 essais) :');
const m = coutMake(5), a = coutAsl(5);
console.log('  Make  ' + ('$' + (m.cout * runs).toFixed(2)).padEnd(12) + '≈ ' + euros(m.cout * runs) + ' €');
console.log('  ASL   ' + ('$' + (a.cout * runs).toFixed(2)).padEnd(12) + '≈ ' + euros(a.cout * runs) + ' €');

console.log('\n── CE QUE CE TABLEAU NE DIT PAS ────────────────────────');
console.log('  · Make se paie par PALIER d\'abonnement, pas à l\'usage : sous le');
console.log('    plafond du plan, une publication de plus ne coûte rien de plus,');
console.log('    et au-dessus il faut changer de palier d\'un coup.');
console.log('  · AWS offre 4 000 transitions et 1 M d\'appels Lambda par mois :');
console.log('    en dessous de ~100 publications mensuelles, ASL est gratuit.');
console.log('  · Les trois Lambdas ne se facturent presque pas — mais elles');
console.log('    s\'écrivent, se déploient, se versionnent et se surveillent.');
console.log('    Ce coût-là est humain, il ne figure sur aucune facture, et');
console.log('    c\'est le seul qui ne baisse pas avec le volume.');
console.log('  · Le registre (aps-registry) demandera une table DynamoDB :');
console.log('    encore un service à posséder, sauvegarder et payer.');
