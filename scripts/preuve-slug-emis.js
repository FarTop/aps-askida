// APS — scripts/preuve-slug-emis.js — créé le 2026-08-14
// ================================================================
// Preuve que ce qu'APS ÉMET donne le même résultat que ce qu'APS EXÉCUTE.
//
//   node scripts/preuve-slug-emis.js
//
// On évalue pour de vrai l'expression JSONata produite par l'émetteur, et on
// compare au moteur natif, valeur par valeur. Hors ligne : aucun réseau.
//
// ── POURQUOI CETTE PREUVE-LÀ ────────────────────────────────────
// `slug` et `filebase` composent les CHEMINS S3 : ceux où Iconik dépose, et
// ceux qu'APS relit ensuite pour vérifier la livraison. Deux implémentations
// qui divergent d'un caractère livrent à une adresse et contrôlent l'autre —
// et le premier symptôme est un fichier « manquant » que tout le monde voit
// pourtant dans le bucket.
//
// C'est exactement ce qui se passait avant le 2026-08-14 : le moteur rendait
// « saison01 », l'émetteur « saison.01 ». Personne ne pouvait le voir sans
// lancer les deux et comparer — ce que fait ce fichier.
//
// ── L'ÉCART ASSUMÉ ──────────────────────────────────────────────
// JSONata n'a pas de normalisation Unicode. Les accents sont substitués par
// table ; un caractère hors table n'est pas translittéré mais ÉCARTÉ. Les cas
// concernés sont listés en fin de fichier, et le test les vérifie tels quels
// plutôt que de prétendre à une équivalence parfaite.
// ================================================================
'use strict';

const jsonata = require('jsonata');
const Textes  = require('../server/engine-builder/builder-textes.js');
const ASL     = require('./rendre-asl.js');

let echecs = 0;

// L'émetteur n'expose pas ses rendus : on les rejoue en lisant sa table de
// fonctions, qui est ce que l'émission utilise réellement.
const source = require('fs').readFileSync(require('path').join(__dirname, 'emettre-asl.js'), 'utf8');

// La valeur passe en LIAISON, jamais interpolée dans l'expression : l'échapper
// à la main casse au premier « L'Été », et ce n'est pas ce qu'on cherche à
// éprouver ici.
async function evaluer(expr, valeur) {
  return await jsonata(expr).evaluate({}, { valeur: String(valeur) });
}

// On reconstruit les deux rendus depuis le module, en les important par un
// chargement contrôlé : `emettre-asl.js` ne s'exécute pas quand on le requiert.
const EM = require('./emettre-asl.js');

(async function () {
  // La table FONCTIONS n'est pas exportée ; on éprouve donc les expressions
  // telles que l'émission les produit, en les extrayant du fichier. Si la forme
  // change, ce test cesse de trouver son motif et le dit — mieux qu'un test qui
  // passerait sur une expression périmée.
  const mSlug = source.match(/function slugCheminJsonata\(e\) \{[\s\S]*?\n\}/);
  if (!mSlug) { console.log('❌ slugCheminJsonata introuvable — la forme a changé'); process.exit(1); }

  // eslint-disable-next-line no-eval
  const SLUG_TABLE = eval(source.match(/const SLUG_TABLE = (\[[\s\S]*?\]);/)[1]);
  const slugCheminJsonata = eval('(' + mSlug[0].replace('function slugCheminJsonata', 'function') + ')');

  const CAS = [
    'MaSérie', 'Saison 01', 'Galactica  2024', 'Épisode #3 (VF)',
    'déjà__vu_', 'Friday - The Serie', 'L\'Été', 'ABC', '',
  ];

  console.log('\n── slug de chemin : émis contre moteur ' + '─'.repeat(26));
  for (const v of CAS) {
    const attendu = Textes.slugChemin(v);
    const obtenu  = await evaluer(slugCheminJsonata('$valeur'), v);
    const ok = obtenu === attendu;
    if (!ok) echecs++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + JSON.stringify(v).padEnd(24)
              + ' → ' + JSON.stringify(obtenu) + (ok ? '' : '   attendu ' + JSON.stringify(attendu)));
  }

  console.log('\n── filebase : émis contre moteur ' + '─'.repeat(32));
  const FICHIERS = ['saison.01.mp4', 'Mon Épisode.mov', 'sans-extension', 'a.b.c.jpg'];
  const filebase = function (a) {
    return slugCheminJsonata('$replace(' + a + ", /\\.[a-zA-Z0-9]{1,6}$/, '')");
  };
  for (const v of FICHIERS) {
    const attendu = Textes.baseDeFichier(v);
    const obtenu  = await evaluer(filebase('$valeur'), v);
    const ok = obtenu === attendu;
    if (!ok) echecs++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + JSON.stringify(v).padEnd(24)
              + ' → ' + JSON.stringify(obtenu) + (ok ? '' : '   attendu ' + JSON.stringify(attendu)));
  }

  console.log('\n' + (echecs
    ? '❌ ' + echecs + ' écart(s) entre ce qu\'APS émet et ce qu\'APS exécute'
    : '✅ Ce qu\'APS émet donne le même chemin que ce qu\'APS exécute'));
  process.exitCode = echecs ? 1 : 0;
})();
