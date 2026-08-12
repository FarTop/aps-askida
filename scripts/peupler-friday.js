// APS — scripts/peupler-friday.js — créé le 2026-08-12
// ================================================================
// Poser un jeu de valeurs éditoriales sur l'arborescence de test
// « Friday - The Serie » (QA | ASKIDA), pour prouver la résolution de
// l'héritage en réel.
//
//   node scripts/peupler-friday.js            montre, n'écrit rien
//   node scripts/peupler-friday.js --ecrire   écrit
//
// POURQUOI CE JEU-LÀ. Il n'est pas « complet partout » — il est construit pour
// que CHACUNE des quatre politiques d'héritage soit exercée par une donnée
// réelle :
//
//   SÉRIE     tout le tronc éditorial. La source unique.
//   SAISON    RIEN d'éditorial, volontairement. Tout ce qu'elle livrera sera
//             emprunté — c'est la preuve de `cascade`, et la fin de droits y
//             sera `signalee`.
//   ÉPISODE   son titre, son numéro, et UN acteur invité. Le reste remonte —
//             et son synopsis emprunté sera signalé (`signalee` au niveau
//             épisode, `cascade` au niveau saison : la même règle, deux
//             comportements).
//   FUSION    l'acteur invité de l'épisode doit SURVIVRE à côté du casting
//             récurrent de la série, sans doublon.
//
// Remplir les trois niveaux à l'identique ne prouverait rien : tout marcherait
// sans une ligne du moteur d'héritage.
//
// Les valeurs des listes déroulantes sont celles relevées sur QA le
// 2026-08-12 (scripts/sonde-champs.js) — un `drop_down` refuse tout le reste.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const { IconikClient } = require('../server/engine-builder/builder-iconik-client.js');
const { metadataValuesDepuisReponse } = require('../server/engine-builder/builder-iconik-shared.js');

const ECRIRE = process.argv.includes('--ecrire');
const ENV_QA = 'cmqp7dk000002p8u50on1l3e7';   // QA | ASKIDA — l'environnement
                                              // du workflow PUBLISH lui-même
                                              // (document.workflow.environment)

// Relevés sur QA le 2026-08-12 en descendant l'arbre (sonde-collection.js).
// Saison 01 est la seule branche qui porte un épisode avec un asset vidéo —
// Saisons 02 et 03 sont laissées telles quelles, elles servent de témoin.
const SERIE   = '9082419a-9277-11f1-930a-72019df0092c';   // Friday - The Serie
const SAISON  = '90ef4a88-9277-11f1-8558-7a5cdd9dd9b7';   // Saison 01
const EPISODE = '914c29ba-9277-11f1-b9e7-1eb2011d3f7a';   // Episode 01
const ASSET   = 'd34014c4-63f3-11f1-bff3-567532563c17';   // The Barbershop

// L'UNITAIRE, l'autre forme d'œuvre. Il est à la RACINE, comme une série :
// `resolve_ancestors` lui rend une pile vide, donc aucune politique d'héritage
// ne s'applique — mesuré le 2026-08-12, `ANCÊTRES : []`. Son asset est sa
// seule source, sans filet : les quatre métiers de personnes absents du sien
// sont sortis « source absente, et aucun ancêtre à remonter », là où un
// épisode les aurait remontés de sa série.
const UNITAIRE     = 'c2b8eee8-9277-11f1-942a-4eed745fbb26';   // Friday - The Movie
const ASSET_UNITE  = 'a87354c8-4e08-11f1-b425-2ee2884f615f';   // Back2Back

const CIBLES = [
  {
    id: SERIE, type: 'collections', libelle: 'SÉRIE  « Friday - The Serie »',
    valeurs: {
      Titre:               'Friday - The Serie',
      TitreOriginal:       'Friday - The Series',
      Synopsis:            "Craig et Smokey passent leur vendredi sur le perron de leur maison de South Central. Entre un dealer à rembourser, un voisin trop curieux et une journée qui n'en finit pas, ils improvisent de quoi survivre jusqu'au soir.",
      SynopsisCourt:       "Un vendredi ordinaire à South Central tourne à la journée sans fin.",
      DatedeSortie:        '2026-01-15',
      Classification:      '12',
      Studio:              'Askida Studios',
      LangueOriginale:     'en-US',
      Pays:                ['France'],
      // Les vrais genres de l'œuvre — et le test de non-régression de la table
      // de rattrapage posée le 2026-08-12 (ajuster-genres-vodfactory.js) :
      // ce sont EXACTEMENT les deux valeurs qui produisaient
      // « The selected genres.0 is invalid » au premier run, parce que la table
      // les traduisait vers av_subgenre_comedy et av_subgenre_adventure, deux
      // codes qui n'existent pas chez Amazon.
      Genres:              ['av_genre_comedy', 'av_genre_adventure'],
      // LES PERSONNES, et une fausse piste qu'il vaut mieux garder écrite.
      // Ice Cube est ici acteur ET auteur, DJ Pooh auteur d'origine ET auteur.
      // On a d'abord cru ce cas interdit, sur deux signaux mal lus :
      //   • les 422 de `POST /api/persons` — ils disent seulement « cette
      //     personne existe déjà ». Le corps envoyé est {external_id, name},
      //     SANS `job` : une personne est une entité globale chez VOD Factory,
      //     le métier est une relation portée par le contenu. La séquence les
      //     ignore d'ailleurs explicitement (feIgnoreCodes: [409, 422]).
      //   • « persons.1.external_id is invalid » — les index 1 et 3 étaient
      //     précisément les entrées corrompues par le défaut de déballage des
      //     valeurs multiples (`ice-cube-chris-tucker`). Ces external_id
      //     n'existaient chez personne.
      // Un seul bug, deux symptômes, et j'en avais déduit deux causes.
      // Vérifié le 2026-08-12 : ce jeu part en HTTP 200. Ne PAS interdire à la
      // saisie qu'un réalisateur soit aussi acteur — c'est courant, et le
      // partenaire l'accepte.
      Realisateur:         ['Gary Gray'],
      Acteur:              ['Ice Cube', 'Chris Tucker'],
      AuteurOrigine:       ['DJ Pooh'],
      Auteur:              ['Ice Cube', 'DJ Pooh'],
      Producteur:          ['Askida Productions'],
      DatedeDebutdeDroits: '2026-09-01T00:00:00+02:00',
      DatedeFindeDroits:   '2027-08-31T23:59:00+02:00',
      PaysdExploitation:   ['FRA'],
      ISAN:                '0000-0001-8947-0000-K-0000-0000-C',
      // La SEULE valeur de ce jeu qui ne se déduit pas du schéma : les options
      // d'Iconik sont Emission | Episode | Film | Magazine, aucune ne dit
      // « série ». `ContenuPrime` est `propre` (jamais hérité), donc il doit
      // être posé à chaque niveau. Si VOD Factory refuse ce `type`, son
      // compte rendu le dira champ par champ — c'est le mécanisme validé le
      // 2026-08-12 (« The metadata persons is required »).
      ContenuPrime:        'Emission',
    },
  },
  {
    id: SAISON, type: 'collections', libelle: 'SAISON « Saison 01 » — volontairement nue',
    valeurs: {
      Titre: 'Saison 01',
    },
  },
  {
    id: EPISODE, type: 'collections', libelle: 'ÉPISODE « Episode 01 » — le strict minimum',
    valeurs: {
      Titre:        'The Barbershop',
      ContenuPrime: 'Episode',
      // L'invité du jour, présent NULLE PART ailleurs : après fusion, il doit
      // apparaître aux côtés d'Ice Cube et Chris Tucker (hérités de la série),
      // et « Ice Cube » ne doit pas sortir en double.
      Acteur:       ['Ice Cube', 'Bernie Mac'],
    },
  },
  {
    id: ASSET, type: 'assets', libelle: 'ASSET  « The Barbershop » (vidéo)',
    // Déjà richement renseigné (52 champs relevés le 2026-08-12, dont tout le
    // technique lu du fichier). On ne réaligne que l'éditorial, pour qu'il
    // raconte la même œuvre que sa collection — un asset qui parlait d'un
    // documentaire sur l'enregistrement multipiste sous un épisode de Friday.
    // BayardID/ParentID sont laissés vides EXPRÈS : c'est le workflow qui les
    // pose.
    valeurs: {
      Titre:            'The Barbershop',
      TitreOriginal:    'The Barbershop',
      Synopsis:         "Craig accompagne Smokey chez le barbier du quartier. Ce qui devait prendre dix minutes occupe l'après-midi entier.",
      SynopsisCourt:    'Une coupe de cheveux qui dure tout un après-midi.',
      Studio:           'Askida Studios',
      Classification:   '12',
      LangueOriginale:  'en-US',
      Genres:           ['av_genre_action'],
      Realisateur:      ['Gary Gray'],
      Acteur:           ['Ice Cube', 'Bernie Mac'],
      Producteur:       ['Askida Productions'],
      NumeroEpisode:    '01',
      ContenuPrime:     'Episode',
    },
  },
  {
    id: ASSET_UNITE, type: 'assets', libelle: 'ASSET  « Back2Back » (vidéo de l\'UNITAIRE)',
    // Le cas SANS FILET. Un unitaire n'a aucun ancêtre : ce que cet asset ne
    // porte pas, rien ne le comblera. Mesuré le 2026-08-12, il partait avec
    // quatre métiers de personnes vides (« source absente, et aucun ancêtre à
    // remonter ») alors qu'Amazon exige `persons`, et avec un éditorial
    // résiduel qui ne décrivait pas l'œuvre : titre « Back2Back », titre
    // original « Pattern_Multitracks_ Tagged_.mxf », synopsis d'un
    // documentaire sur l'enregistrement multipiste.
    //
    // Les personnes reprennent les MÊMES noms et les MÊMES métiers que la
    // série : VOD Factory indexe ses personnes sur un `external_id` global, et
    // réutiliser une identité déjà créée sous le même métier est le seul cas
    // qui ne produit pas de conflit.
    valeurs: {
      Titre:            'Friday - The Movie',
      TitreOriginal:    'Friday',
      Synopsis:         "Craig vient de se faire renvoyer un jeudi. Le vendredi, resté chez lui, il regarde le quartier défiler depuis le perron — et découvre qu'une journée sans rien à faire peut être la plus longue de toutes.",
      SynopsisCourt:    "Un chômeur du vendredi découvre que ne rien faire est un travail à plein temps.",
      Studio:           'Askida Studios',
      Classification:   '12',
      LangueOriginale:  'en-US',
      Pays:             ['France'],
      PaysdExploitation: ['FRA'],
      DatedeSortie:     '2026-01-15',
      Genres:           ['av_genre_action'],
      Realisateur:      ['Gary Gray'],
      Acteur:           ['Ice Cube', 'Chris Tucker'],
      AuteurOrigine:    ['DJ Pooh'],
      Auteur:           ['Cube Ice'],
      Producteur:       ['Askida Productions'],
      // Un film unitaire, pas un magazine : « Film » se traduit en `program`
      // dans la correspondance, comme « Emission ».
      ContenuPrime:     'Film',
    },
  },
];

function _apercu(v) {
  return Array.isArray(v) ? v.join(' · ') : String(v);
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const env = await prisma.environment.findFirst({ where: { id: ENV_QA } });
  if (!env) throw new Error('environnement QA introuvable');
  console.log('Environnement : ' + env.name + '  (' + (env.baseUrl || 'https://app.iconik.io') + ')');
  console.log(ECRIRE ? '⚠  MODE ÉCRITURE\n' : 'Mode lecture seule — relancer avec --ecrire pour appliquer\n');

  const client = new IconikClient({
    baseUrl: env.baseUrl || 'https://app.iconik.io',
    appId: env.appId,
    authToken: decrypt(env.tokenEnc),
  });

  for (const cible of CIBLES) {
    const base = '/API/metadata/v1/' + cible.type + '/' + cible.id + '/';
    let existant = {};
    try { existant = metadataValuesDepuisReponse(await client.get(base)); } catch (_) {}

    console.log('── ' + cible.libelle);
    const merged = {};
    // Les clés `__*` sont internes à Iconik (catégories) — les réécrire n'a
    // aucun sens et peut être refusé ; même filtre que builder-handler-history.
    Object.entries(existant).forEach(([k, v]) => { if (!k.startsWith('__')) merged[k] = v; });

    Object.entries(cible.valeurs).forEach(function ([champ, valeur]) {
      const avant = (existant[champ]?.field_values || []).map(f => f.value).filter(v => v !== '');
      const apres = Array.isArray(valeur) ? valeur : [valeur];
      merged[champ] = { field_values: apres.map(v => ({ value: v })) };
      const inchange = JSON.stringify(avant) === JSON.stringify(apres);
      console.log('   ' + (inchange ? '=' : (avant.length ? '~' : '+')) + ' ' + champ.padEnd(20) +
                  (inchange ? _apercu(apres) : (avant.length ? _apercu(avant) + '  →  ' : '') + _apercu(apres)));
    });

    if (ECRIRE) {
      await client.put(base, { metadata_values: merged });
      console.log('   ✅ écrit');
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
