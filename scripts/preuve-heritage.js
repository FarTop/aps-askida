// APS — scripts/preuve-heritage.js — créé le 2026-08-12
// ================================================================
// Preuve de la résolution de l'héritage entre niveaux
// (builder-heritage.js + builder-handler-lookup.js).
//
//   node scripts/preuve-heritage.js
//
// Ce qu'elle prouve, sur le cas réel qui a bloqué le catalogue série chez
// Amazon le 2026-08-12 : un ÉPISODE quasi vide, sous une SAISON tout aussi
// vide, sous une SÉRIE renseignée. Sans héritage, la livraison partait avec
// dix champs manquants ; avec, elle part complète — et elle DIT ce qu'elle a
// emprunté.
//
// Hors ligne : aucun réseau, aucun accès base. La pile d'ancêtres est posée à
// la main dans le contexte, exactement sous la forme que
// builder-handler-iconik-resolve-ancestors.js y écrit.
// ================================================================
'use strict';

const lookup         = require('../server/engine-builder/builder-handler-lookup.js');
const BuilderContext = require('../server/engine-builder/builder-context.js');
const Heritage       = require('../server/engine-builder/builder-heritage.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
}

// Les règles telles qu'elles sont en base sur « VOD Factory | Fields »
// (relevées le 2026-08-12), réduites à ce que cette preuve exerce.
const REGLES = [
  { key: 'Titre',           value: 'title',                             heritage: 'propre'   },
  { key: 'Studio',          value: 'owner',                             heritage: 'cascade'  },
  { key: 'Genres',          value: 'genres',                            heritage: 'cascade'  },
  { key: 'Synopsis',        value: 'synopsis',                          heritage: { saison: 'cascade', episode: 'signalee' } },
  { key: 'DatedeFindeDroits', value: 'availabilities.amazon[].ends_at',  heritage: 'signalee' },
  { key: 'Realisateur',     value: 'persons[job=director].external_id',  heritage: 'fusion'   },
  { key: 'Acteur',          value: 'persons[job=actor].external_id',     heritage: 'fusion'   },
];

// La pile posée par iconik.resolve_ancestors : parent direct d'abord.
const ANCETRES = [
  {
    id: 'c-saison', titre: 'Saison 01', niveau: 'Saison', bayardId: '63945623',
    metadata: { Titre: 'Saison 01', Acteur: ['Etienne Julien', 'Invité saison'] },
  },
  {
    id: 'c-serie', titre: 'Star Trek', niveau: 'Série', bayardId: '10675229',
    metadata: {
      Titre: 'Star Trek', Studio: 'Bayard', Genres: 'av_genre_adventure',
      Synopsis: 'La série suit un équipage stellaire.',
      DatedeFindeDroits: '2026-12-31T23:59:00+01:00',
      Realisateur: 'Etienne Julien', Acteur: ['Etienne Julien', 'Actrice récurrente'],
    },
  },
];

// L'épisode tel qu'il arrive du search Iconik : presque rien à lui.
const EPISODE = {
  id: 'c-episode',
  metadata_values: {
    Titre:       { field_values: [{ value: 'Episode 01' }] },
    Acteur:      { field_values: [{ value: 'Invité du jour' }] },
  },
};

function contexte(typeCollection, ancetres) {
  const ctx = BuilderContext.createContext({});
  ctx.vars.TypeCollection = typeCollection;
  ctx.results.search_results = { objects: [EPISODE] };
  if (ancetres) ctx.results._ancetres = ancetres;
  return ctx;
}

const ETAPE = {
  id: 'lookup-preuve',
  params: {
    lkInputVar: 'search_results.objects[0]',
    lkOutputVar: 'vodFactoryPayload',
    lkRows: REGLES,
  },
};

async function main() {
  console.log('\n── La politique, par niveau ─────────────────────────────');
  verifier('Synopsis au niveau Saison  → cascade',
    Heritage.politiquePour(REGLES[3].heritage, 'Saison'), 'cascade');
  verifier('Synopsis au niveau Episode → signalee',
    Heritage.politiquePour(REGLES[3].heritage, 'Episode'), 'signalee');
  // « Série » n'est pas nommé dans la politique par niveau : la règle ne se
  // replie pas sur une autre, elle vaut `propre`. Hériter par défaut serait
  // l'emprunt silencieux que l'arbitrage cherche justement à rendre visible.
  verifier('Synopsis au niveau Série   → propre (non nommé)',
    Heritage.politiquePour(REGLES[3].heritage, 'Série'), 'propre');

  console.log('\n── Sans ancêtres : rien ne change ───────────────────────');
  const ctxSeul = contexte('Episode', null);
  await lookup(ETAPE, ctxSeul, {});
  const seul = ctxSeul.results.vodFactoryPayload;
  verifier('titre propre conservé', seul.title, 'Episode 01');
  verifier('synopsis absent',       seul.synopsis, undefined);
  verifier('owner absent',          seul.owner, undefined);

  console.log('\n── Avec ancêtres : l\'épisode se complète ────────────────');
  const ctx = contexte('Episode', ANCETRES);
  const port = await lookup(ETAPE, ctx, {});
  const paye = ctx.results.vodFactoryPayload;
  verifier('port',                         port, { port: 'found' });
  verifier('title reste PROPRE',           paye.title, 'Episode 01');
  verifier('owner hérité (cascade)',       paye.owner, 'Bayard');
  verifier('genres hérité (cascade)',      paye.genres, 'av_genre_adventure');
  verifier('synopsis hérité (signalee)',   paye.synopsis, 'La série suit un équipage stellaire.');
  verifier('fin de droits héritée',        paye.availabilities.amazon[0].ends_at, '2026-12-31T23:59:00+01:00');

  // La fusion : l'invité de l'épisode SURVIT, le casting remonte, et
  // « Etienne Julien » — présent sur la saison ET la série — n'apparaît
  // qu'une fois.
  const acteurs = paye.persons.filter(p => p.job === 'actor').map(p => p.external_id);
  verifier('acteurs fusionnés et dédoublonnés', acteurs,
    ['Invité du jour', 'Etienne Julien', 'Invité saison', 'Actrice récurrente']);
  verifier('réalisateur hérité par fusion',
    paye.persons.filter(p => p.job === 'director').map(p => p.external_id), ['Etienne Julien']);

  console.log('\n── La forme sérialisée, telle qu\'elle arrive en réel ────');
  // Régression du 2026-08-12, trouvée par le premier run réel sur
  // « Friday - The Serie » : une métadonnée multiple qui transite par une
  // variable de contexte arrive SÉRIALISÉE, pas en tableau. La fusion la
  // prenait pour une seule personne et livrait un unique
  // `ice-cube-chris-tucker` là où Amazon attend deux entrées `persons`.
  // Le search Iconik ne pose PAS `metadata_values` sur l'objet — il expose les
  // métadonnées sous leur nom nu dans les variables. C'est ce chemin-là qu'on
  // exerce ici, d'où l'objet d'entrée sans métadonnées.
  const ctxV = contexte('Série', []);
  ctxV.results.search_results = { objects: [{ id: 'c-serie' }] };
  ctxV.vars.Acteur = '["Ice Cube","Chris Tucker"]';
  await lookup({ id: 'lk-serialise', params: { lkInputVar: 'search_results.objects[0]',
    lkOutputVar: 'p', lkRows: [REGLES[6]] } }, ctxV, {});
  verifier('deux acteurs, pas un seul nom collé',
    ctxV.results.p.persons.map(p => p.external_id), ['Ice Cube', 'Chris Tucker']);

  // Le MÊME défaut, sur un champ à table de traduction — préexistant celui-là,
  // et trouvé le 2026-08-12 en remettant les vrais genres de l'œuvre. Un seul
  // genre passait (chaîne simple, traduite) ; deux genres partaient non
  // traduits, et VOD Factory refusait l'envoi entier.
  const ctxG = contexte('Série', []);
  ctxG.results.search_results = { objects: [{ id: 'c-serie' }] };
  ctxG.vars.Genres = '["Comédie","Aventure"]';
  await lookup({ id: 'lk-genres', params: { lkInputVar: 'search_results.objects[0]',
    lkOutputVar: 'g', lkRows: [{ key: 'Genres', type: 'list', value: 'genres', heritage: 'cascade',
      children: [{ key: 'Comédie', value: 'av_genre_comedy' }, { key: 'Aventure', value: 'av_genre_adventure' }] }] } }, ctxG, {});
  verifier('deux genres traduits un par un',
    ctxG.results.g.genres, ['av_genre_comedy', 'av_genre_adventure']);

  console.log('\n── Hors périmètre du niveau ≠ repli cassé ───────────────');
  // Deux règles au repli identiquement non résolu, et deux verdicts opposés :
  // l'une désigne une essence que le manifeste écarte à ce niveau (nominal),
  // l'autre une variable que personne n'a jamais posée (faute de config).
  // Le niveau n'est déclaré qu'au manifeste ; le Lookup lit ce que Deliver a
  // écarté.
  const ctxN = contexte('Unitaire', []);
  ctxN.results.search_results = { objects: [{ id: 'c-unitaire' }] };
  ctxN.results._hors_niveau = ['s3_season_url'];
  await lookup({ id: 'lk-niveau', params: { lkInputVar: 'search_results.objects[0]', lkOutputVar: 'u', lkRows: [
    { key: 'URLSeasonArt', value: 'images.amazon.season_box_art', fallback: '{s3_season_url}' },
    { key: 'URLBoxArt',    value: 'images.amazon.box_art',        fallback: '{s3_bidon_url}' },
  ] } }, ctxN, {});
  const parNiveau = {};
  ctxN.results['_lk_trace_lk-niveau'].forEach(t => { parNiveau[t.de] = t; });
  verifier('essence écartée par le manifeste → hors_niveau',
    parNiveau.URLSeasonArt.statut, 'hors_niveau');
  verifier('variable inconnue → reste non_resolu',
    parNiveau.URLBoxArt.statut, 'non_resolu');

  console.log('\n── La trace des emprunts ────────────────────────────────');
  const trace = ctx.results['_lk_trace_lookup-preuve'];
  const parChamp = {};
  trace.forEach(t => { parChamp[t.de] = t; });
  verifier('Titre n\'a rien emprunté',      parChamp.Titre.heritage, null);
  verifier('Studio dit d\'où il vient',     parChamp.Studio.heritage.depuis, 'Série');
  verifier('Studio n\'est PAS signalé',     parChamp.Studio.heritage.signale, false);
  verifier('Synopsis EST signalé',          parChamp.Synopsis.heritage.signale, true);

  // Ce que le compte rendu de livraison affichera : les `signalee` seulement.
  // Un `cascade` hérité est la vérité de l'œuvre, l'écrire noierait le reste.
  const signales = ctx.results._emprunts.filter(e => e.signale).map(e => e.champ + ' ← ' + e.depuis);
  verifier('emprunts signalés au compte rendu', signales,
    ['Synopsis ← Série', 'DatedeFindeDroits ← Série']);

  console.log('\n── Le niveau Saison, même correspondance ────────────────');
  // La même règle Synopsis, un niveau plus haut : héritée SANS signalement.
  const ctxS = contexte('Saison', [ANCETRES[1]]);
  await lookup(ETAPE, ctxS, {});
  const traceS = {};
  ctxS.results['_lk_trace_lookup-preuve'].forEach(t => { traceS[t.de] = t; });
  verifier('synopsis hérité au niveau saison', ctxS.results.vodFactoryPayload.synopsis,
    'La série suit un équipage stellaire.');
  verifier('et NON signalé',                   traceS.Synopsis.heritage.signale, false);
  // La fin de droits, elle, est `signalee` en chaîne — donc à TOUS les
  // niveaux. Une saison qui emprunte sa fenêtre de licence à sa série le dit,
  // là où elle emprunte son synopsis en silence : c'est exactement ce que la
  // politique par niveau permet d'exprimer et qu'une politique par champ ne
  // pouvait pas.
  verifier('la fin de droits reste signalée',
    ctxS.results._emprunts.filter(e => e.signale).map(e => e.champ + ' ← ' + e.depuis),
    ['DatedeFindeDroits ← Série']);

  console.log('\n' + (echecs ? `❌ ${echecs} échec(s)` : '✅ tout passe') + '\n');
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
