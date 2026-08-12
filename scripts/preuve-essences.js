// APS — scripts/preuve-essences.js — créé le 2026-08-12
// ================================================================
// Preuve de la reconnaissance des essences (builder-essences.js).
//
//   node scripts/preuve-essences.js
//
// Cette fonction décide des URL que le partenaire lira, et qu'APS ira ensuite
// vérifier. Elle sert maintenant DEUX moteurs — le natif et une Lambda AWS,
// parce qu'ASL ne sait pas reconnaître un fichier par motif de nom. Deux
// implémentations qui divergent d'un cheveu livreraient à une adresse ce
// qu'elles contrôleraient à une autre : d'où l'extraction, et d'où cette
// preuve.
//
// Les essences sont celles du manifeste réel « Livraison VOD Factory | PRIME »,
// relevées le 2026-08-12. Hors ligne : aucun réseau, aucune base.
// ================================================================
'use strict';

const { reconnaitre } = require('../server/engine-builder/builder-essences.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
}

// Forme déjà résolue (_s3MappingsFromManifest), telle que le handler la passe.
const ESSENCES = [
  { type: 'cover',      filter: 'cover',    variable: 's3_cover_url',    cardinalite: 'au_moins_un',   appliesTo: ['serie', 'saison', 'unitaire'] },
  { type: 'poster',     filter: 'poster',   variable: 's3_poster_url',   cardinalite: 'au_moins_un',   appliesTo: ['serie', 'saison', 'unitaire'] },
  { type: 'title',      filter: 'title',    variable: 's3_title_url',    cardinalite: 'optionnel',     appliesTo: ['serie'] },
  { type: 'season_box', filter: 'season',   variable: 's3_season_url',   cardinalite: 'au_moins_un',   appliesTo: ['saison'] },
  { type: 'box',        filter: 'box',      variable: 's3_box_url',      cardinalite: 'au_moins_un',   appliesTo: ['unitaire'] },
  { type: 'video',      filter: '.mp4,.mov,.mxf', variable: 's3_video_url', cardinalite: 'exactement_un', appliesTo: ['episode', 'unitaire'] },
];

const BASE = 's3://iconik-askida-stockage-hr/AmazonPrime/Friday_26080717492443/';

function main() {
  console.log('\n── Le niveau décide de ce qui est cherché ───────────────');
  const serie = reconnaitre(ESSENCES,
    ['friday_cover.png', 'friday_poster.png', 'friday_title.png'], BASE, 'Série');
  verifier('la série trouve cover, poster, title',
    Object.keys(serie.variables).sort(), ['s3_cover_url', 's3_poster_url', 's3_title_url']);
  verifier('et écarte season_box, box, video (hors niveau)',
    serie.horsNiveau.sort(), ['s3_box_url', 's3_season_url', 's3_video_url']);

  const saison = reconnaitre(ESSENCES,
    ['friday_s01_cover.png', 'friday_s01_season.png'], BASE, 'Saison');
  verifier('la saison trouve son season_box',
    saison.variables.s3_season_url, BASE + 'friday_s01_season.png');
  verifier('et title lui est refusé',
    saison.horsNiveau.indexOf('s3_title_url') !== -1, true);

  console.log('\n── Le doublon d\'upload ne gagne pas ─────────────────────');
  // Deux fichiers correspondent : l'original l'emporte sur le `-2`. Ce tri
  // décide de l'URL LIVRÉE — s'il diffère entre le moteur et la Lambda, la
  // vérification interroge une autre adresse que celle qui a été envoyée.
  const doublon = reconnaitre(ESSENCES,
    ['friday_cover-2.png', 'friday_cover.png'], BASE, 'Série');
  verifier('l\'original est retenu, pas le suffixé',
    doublon.variables.s3_cover_url, BASE + 'friday_cover.png');

  console.log('\n── La cardinalité constate, elle n\'empêche pas ──────────');
  const sansVideo = reconnaitre(ESSENCES, ['episode_cover.png'], BASE, 'Episode');
  verifier('une vidéo manquante est signalée',
    sansVideo.cardinalite, ['video : attendu exactement 1, trouvé 0']);
  const deuxVideos = reconnaitre(ESSENCES,
    ['a.mp4', 'b.mov'], BASE, 'Unitaire');
  verifier('deux vidéos aussi',
    deuxVideos.cardinalite.some(c => /exactement 1, trouvé 2/.test(c)), true);

  console.log('\n── Le repli par token respecte le niveau ────────────────');
  // Un fichier « box » égaré sous une SÉRIE ne doit pas y poser un box_art :
  // ce format est réservé à l'unitaire. C'est le filtre que le repli par token
  // ignorait avant le 2026-08-12.
  const egare = reconnaitre(ESSENCES,
    ['friday_cover.png', 'friday_box.png'], BASE, 'Série');
  verifier('un box égaré sous une série est ignoré',
    egare.variables.s3_box_url, undefined);

  console.log('\n── Sans TypeCollection, rien n\'est écarté ───────────────');
  // Un niveau inconnu ne doit pas faire disparaître les essences : le filtre ne
  // s'applique QUE si le niveau est connu (comportement du handler d'origine).
  const inconnu = reconnaitre(ESSENCES, ['friday_cover.png', 'friday_box.png'], BASE, '');
  verifier('cover ET box sont trouvés',
    [!!inconnu.variables.s3_cover_url, !!inconnu.variables.s3_box_url], [true, true]);
  verifier('aucune essence déclarée hors niveau', inconnu.horsNiveau, []);

  console.log('\n── La Lambda rend la même chose que le moteur ───────────');
  // La fonction AWS ne réimplémente rien : elle appelle le même module. Cette
  // vérification garde la porte fermée — le jour où quelqu'un « adapterait »
  // le code pour Lambda, les URL livrées cesseraient de correspondre à celles
  // qu'APS vérifie, et rien ne le signalerait.
  const lambda = require('../lambda/aps-essences/index.js');
  const listing = { KeyCount: 3, Contents: [
    { Key: 'friday_s01_cover.png' }, { Key: 'friday_s01_season.png' }, { Key: 'friday_s01_poster.png' },
  ] };
  const direct = reconnaitre(ESSENCES, listing.Contents.map(o => o.Key), BASE, 'Saison');
  lambda.handler({ essences: ESSENCES, listing: listing, base: BASE, typeCollection: 'Saison' })
    .then(function (rep) {
      verifier('mêmes variables que l\'appel direct', rep.variables, direct.variables);
      verifier('mêmes essences hors niveau',          rep.horsNiveau, direct.horsNiveau);
      verifier('le verdict de cardinalité est tranché', rep.cardinaliteRespectee, direct.cardinalite.length === 0);
      // Le listing peut arriver déjà réduit à des clés : refuser cette forme
      // obligerait à poser un état ASL pour rien.
      return lambda.handler({ essences: ESSENCES, keys: listing.Contents.map(o => o.Key),
                              base: BASE, typeCollection: 'Saison' });
    })
    .then(function (rep2) {
      verifier('accepte aussi une liste de clés brute', rep2.variables, direct.variables);
      console.log('\n' + (echecs ? `❌ ${echecs} échec(s)` : '✅ tout passe') + '\n');
      process.exit(echecs ? 1 : 0);
    });
}

main();
