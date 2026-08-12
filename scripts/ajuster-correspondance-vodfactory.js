// APS — scripts/ajuster-correspondance-vodfactory.js — créé le 2026-08-12
// ================================================================
// Remettre d'aplomb la correspondance « VOD Factory | Fields » sur les trois
// champs à vocabulaire fermé, d'après les référentiels RÉELS du partenaire.
//
//   node scripts/ajuster-correspondance-vodfactory.js            montre
//   node scripts/ajuster-correspondance-vodfactory.js --ecrire   écrit
//
// Le contrôle qui a produit ces tables vit à côté :
//   node scripts/auditer-correspondance-vodfactory.js
//
// ── CE QUI A ÉTÉ MESURÉ LE 2026-08-12 ───────────────────────────
//
// GENRES (GET /api/amazon/genres — 432 codes)
//   5 des 8 traductions pointaient vers des codes INEXISTANTS
//   (av_subgenre_comedy, av_genre_animation, av_subgenre_thriller,
//   av_genre_scifi, av_subgenre_adventure). La table ne se contentait pas
//   d'être inutile : quand elle s'appliquait, elle traduisait du juste vers du
//   faux. À l'inverse, 8 des 10 options du drop_down Iconik SONT déjà des codes
//   Amazon valides et n'ont rien à traduire.
//   Deux options Iconik portaient une coquille — `av_genre_science_fictio`
//   (sans le « n ») et `av_genre_kid` (sans le « s »). Corrigées dans Iconik
//   par l'utilisateur le 2026-08-12 ; le rattrapage reste ici, il ne coûte rien
//   et protège les contenus saisis avant la correction.
//
// TYPE (schéma MCP de create_content — SIX valeurs)
//   enum program | serie | season | episode | magazine | tv_show
//   La doc p.7 n'en annonce que quatre (« send serie exactly, not series ») et
//   omet magazine et tv_show. Le schéma du serveur fait foi : il est
//   machine-lisible et daté du serveur lui-même.
//   Et `Unitaire` n'avait AUCUNE entrée, alors que la règle porte un repli
//   `{TypeCollection}` : un unitaire sans ContenuPrime saisi envoyait la chaîne
//   « Unitaire » telle quelle. Les trois autres niveaux passaient par
//   coïncidence, leurs libellés Iconik étant aussi des clés de la table.
//
// RATING (doc partenaire p.8)
//   « rating   integer   0/10/12/16/18 » — les cinq valeurs du champ Iconik
//   sont les bonnes, mais la règle était déclarée `type: 'string'` et envoyait
//   « 12 » là où la spec demande 12. Le partenaire l'a toléré jusqu'ici ; rien
//   ne dit qu'Amazon le tolère en aval, et le moteur sait convertir.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const ECRIRE = process.argv.includes('--ecrire');

// Table de RATTRAPAGE, pas de traduction : les libellés français hérités des
// données anciennes, les deux coquilles, et les valeurs déjà justes en
// identité — ces dernières pour qu'elles ne sortent pas « hors table de
// correspondance » dans la trace du run.
const GENRES = [
  ['Action',                  'av_genre_action'],
  ['Animation',               'av_genre_anime'],
  ['Aventure',                'av_genre_adventure'],
  ['Comédie',                 'av_genre_comedy'],
  ['Documentaire',            'av_genre_documentary'],
  ['Drame',                   'av_genre_drama'],
  ['Enfant',                  'av_genre_kids'],
  ['Jeune adulte',            'av_genre_young_adult_audience'],
  ['Science-Fiction',         'av_genre_science_fiction'],
  ['Thriller',                'av_genre_suspense'],
  ['av_genre_science_fictio', 'av_genre_science_fiction'],
  ['av_genre_kid',            'av_genre_kids'],
  ['av_genre_action',               'av_genre_action'],
  ['av_genre_anime',                'av_genre_anime'],
  ['av_genre_adventure',            'av_genre_adventure'],
  ['av_genre_comedy',               'av_genre_comedy'],
  ['av_genre_documentary',          'av_genre_documentary'],
  ['av_genre_drama',                'av_genre_drama'],
  ['av_genre_suspense',             'av_genre_suspense'],
  ['av_genre_young_adult_audience', 'av_genre_young_adult_audience'],
  // Les deux valeurs corrigées dans le champ Iconik le 2026-08-12, en
  // identité : ce sont désormais celles que la saisie produit. Les coquilles
  // ci-dessus restent pour les contenus saisis AVANT la correction — les deux
  // formes doivent coexister tant que d'anciennes fiches portent l'ancienne.
  ['av_genre_science_fiction',      'av_genre_science_fiction'],
  ['av_genre_kids',                 'av_genre_kids'],
];

const CONTENU_PRIME = [
  ['Emission', 'program'],
  ['Film',     'program'],
  // `magazine` EXISTE — mesuré le 2026-08-12 dans le schéma MCP de
  // create_content : enum program|serie|season|episode|magazine|tv_show. La
  // doc p.7 n'en annonce que quatre et cette table avait été ajustée sur elle,
  // ce qui perdait l'information. Le schéma du serveur fait foi sur le PDF.
  ['Magazine', 'magazine'],
  ['Série',    'serie'],
  ['Saison',   'season'],
  ['Episode',  'episode'],
  ['Unitaire', 'program'],
];

const AJUSTEMENTS = [
  { champ: 'Genres',         children: GENRES },
  { champ: 'ContenuPrime',   children: CONTENU_PRIME },
  { champ: 'Classification', type: 'integer' },
];

function _diff(avantChildren, table) {
  const avant = {};
  (avantChildren || []).forEach(c => { avant[c.key] = c.value; });
  const lignes = [];
  table.forEach(function ([cle, code]) {
    const a = avant[cle];
    lignes.push('   ' + (a === undefined ? '+' : (a === code ? '=' : '~')) + ' ' +
                cle.padEnd(30) + (a !== undefined && a !== code ? a + '  →  ' : '') + code);
  });
  Object.keys(avant).forEach(function (cle) {
    if (!table.some(t => t[0] === cle)) lignes.push('   - ' + cle.padEnd(30) + avant[cle] + '  (retirée)');
  });
  return lignes;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const m = await prisma.mapping.findFirst({ where: { name: { contains: 'VOD Factory' } } });
  if (!m) throw new Error('correspondance « VOD Factory | Fields » introuvable');

  console.log('Correspondance : ' + m.name);
  console.log(ECRIRE ? '⚠  MODE ÉCRITURE\n' : 'Mode lecture seule — relancer avec --ecrire pour appliquer\n');

  const rules = m.rules || [];
  let touche = 0;

  const nouvelles = rules.map(function (r) {
    const spec = AJUSTEMENTS.find(a => a.champ === (r.key || r.from));
    if (!spec) return r;
    const majs = {};

    console.log('── ' + spec.champ);
    if (spec.children) {
      _diff(r.children, spec.children).forEach(l => console.log(l));
      majs.children = spec.children.map(([key, value]) => ({ key, value }));
    }
    if (spec.type && r.type !== spec.type) {
      console.log('   ~ type' + ' '.repeat(27) + (r.type || '(absent)') + '  →  ' + spec.type);
      majs.type = spec.type;
    } else if (spec.type) {
      console.log('   = type' + ' '.repeat(27) + spec.type);
    }
    console.log('');
    touche++;
    return Object.assign({}, r, majs);
  });

  if (!touche) throw new Error('aucune des règles visées n\'existe dans la correspondance');

  if (ECRIRE) {
    await prisma.mapping.update({ where: { id: m.id }, data: { rules: nouvelles } });
    console.log('✅ écrit — ' + touche + ' règle(s)');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
