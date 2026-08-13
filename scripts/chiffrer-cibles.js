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

// ── TARIFS ──────────────────────────────────────────────────────
// Step Functions : RELEVÉ sur la page de prix AWS le 2026-08-12, région
// Europe (Paris). Mon estimation de mémoire annonçait 0,025 — soit 19 % en
// dessous. L'ordre de grandeur tenait, le chiffre non : c'est la différence
// entre « environ cinquante fois moins cher » et un montant qu'on met dans une
// proposition commerciale.
//
// UNE LIGNE DE LA PAGE QUI COMPTE : « chaque nouvelle tentative est facturée
// comme une transition d'état supplémentaire ». Un `Retry` à 3 essais sur un
// appel qui échoue coûte donc 3 transitions, pas une. L'émetteur ASL n'en pose
// AUCUN aujourd'hui (seulement des `Catch`, qui ne se facturent pas tant qu'ils
// ne se déclenchent pas) — mais le jour où on ajoutera des reprises
// automatiques, elles se paieront.
const TARIFS = {
  aslParTransition: 0.0297 / 1000,         // relevé — Europe (Paris)
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
  // La variante où c'est la Lambda qui liste le bucket, et non l'intégration
  // S3 native (`emettre-asl.js --listing lambda`). Mesurée, pas déduite : trois
  // états de moins sur PUBLISH, un par Deliver. Le nombre d'APPELS de Lambda ne
  // bouge pas — le listing rejoint une invocation qui avait déjà lieu.
  //
  // Ce qu'elle achète n'est pas là-dedans : elle est la SEULE qui sache
  // atteindre le bucket d'un client. L'intégration S3 native signe avec le rôle
  // d'exécution de la machine d'états, jamais avec des identifiants qu'on lui
  // passe — donc un bucket qui ne nous appartient pas exige une action de son
  // propriétaire, à chaque client, à chaque démo.
  aslLambda: { total: 38, sansSondage: 38 - 3, sondageParEssai: 3, lambdas: 3 },
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

function coutAsl(essais, variante) {
  // Une transition par état parcouru, plus le cycle de sondage.
  const v = PUBLISH[variante || 'asl'];
  const transitions = v.sansSondage + v.sondageParEssai * essais;
  const cout = transitions * TARIFS.aslParTransition
             + v.lambdas * TARIFS.lambdaParAppel;
  return { unites: transitions, cout: cout };
}

function euros(d) { return (d * 0.92).toFixed(4); }   // ordre de grandeur

const runs = parseInt(process.argv[2], 10) || 1000;

console.log('CE QUE COÛTE UN RUN DE BAYARD | PUBLISH | VODFACTORY\n');
console.log('Volumes mesurés   : ' + PUBLISH.make.total + ' modules chez Make · '
          + PUBLISH.asl.total + ' états chez ASL');
console.log('Tarifs            : Step Functions RELEVÉ (Europe Paris, 2026-08-12) ·');
console.log('                    Make et Lambda encore de mémoire\n');
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
const gratuit = Math.floor(4000 / coutAsl(5).unites);
console.log('  · AWS offre 4 000 transitions par mois, et cette offre N\'EXPIRE PAS.');
console.log('    À ' + coutAsl(5).unites + ' transitions par publication, cela fait ' + gratuit + ' publications');
console.log('    mensuelles GRATUITES — probablement au-dessus du régime actuel.');
console.log('  · Les trois Lambdas ne se facturent presque pas — mais elles');
console.log('    s\'écrivent, se déploient, se versionnent et se surveillent.');
console.log('    Ce coût-là est humain, il ne figure sur aucune facture, et');
console.log('    c\'est le seul qui ne baisse pas avec le volume.');
console.log('  · Le registre (aps-registry) demandera une table DynamoDB :');
console.log('    encore un service à posséder, sauvegarder et payer.');

// ── QUI LISTE LE BUCKET : le prix n'est pas l'argument ───────────
const nat = coutAsl(5, 'asl'), lam = coutAsl(5, 'aslLambda');
console.log('\n── SI LA LAMBDA LISTE LE BUCKET (--listing lambda) ─────');
console.log('  états      ' + PUBLISH.asl.total + ' → ' + PUBLISH.aslLambda.total
          + '   (un de moins par Deliver, mesuré sur PUBLISH)');
console.log('  transitions ' + nat.unites + ' → ' + lam.unites + ' par publication');
console.log('  coût        $' + nat.cout.toFixed(4) + ' → $' + lam.cout.toFixed(4)
          + '   soit ' + ((nat.cout - lam.cout) * 1000).toFixed(2) + ' $ pour 1000 publications');
console.log('  gratuité    ' + Math.floor(4000 / nat.unites) + ' → '
          + Math.floor(4000 / lam.unites) + ' publications offertes par mois');
console.log('  L\'écart d\'argent est DÉRISOIRE, et c\'est l\'information : cette');
console.log('  bascule ne s\'arbitre pas au prix. Elle s\'arbitre sur l\'autonomie —');
console.log('  la version native ne peut pas atteindre le bucket d\'un client sans');
console.log('  que ce client agisse, la version Lambda le peut avec une simple');
console.log('  ligne de connexion, comme le moteur natif d\'APS depuis toujours.');
console.log('  Ce qu\'elle coûte en revanche : l\'argument « S3 est une intégration');
console.log('  native d\'ASL » tombe, et la Lambda gagne un accès à des secrets.');
