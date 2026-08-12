// APS — scripts/construire-callback-vodfactory.js — créé le 2026-08-12
// ================================================================
// Construit BAYARD | CALLBACK | VODFACTORY — le pendant événementiel de
// BAYARD | CHECK | STATUSES | VODFACTORY.
//
//   node scripts/construire-callback-vodfactory.js [--ecrire]
//
// Sans --ecrire : affiche le document et s'arrête (aucune écriture en base).
//
// ── CE QUE C'EST ────────────────────────────────────────────────
// L'API partenaire 1.3.0 (2026-08-10) sait NOTIFIER au lieu d'être sondée :
// « Instead of polling GET /contents/{externalId}/action-statuses, you can be
// notified directly when a transfer or ingest to a partner completes. »
//
// Ce workflow est STATUSES sans sa boucle : mêmes huit contrôles, mêmes
// branches, mêmes textes d'historique. Ce qui change tient en deux points —
// il est réveillé par le partenaire au lieu d'une minuterie, et il ne regarde
// QUE le contenu désigné au lieu de balayer le catalogue.
//
// ── TROIS CHOIX, ET LEURS RAISONS ───────────────────────────────
//
// 1. LE CALLBACK EST UN DÉCLENCHEUR, PAS UNE SOURCE. Son payload ne parle que
//    d'une paire (partner, action) : « amazon_avails vient de réussir ». Or un
//    transfert en compte quatre. Agréger cet état dans APS demanderait de la
//    mémoire entre appels, donc un modèle de plus et des cas tordus (appel
//    perdu — la doc prévient qu'il n'y a AUCUNE nouvelle tentative — ou arrivé
//    dans le désordre). À réception, UN appel à action-statuses rend l'état
//    complet du contenu. On garde donc le contrôle déjà écrit et prouvé, et on
//    remplace une boucle nocturne par un appel ciblé au bon moment.
//
// 2. STATUSES SURVIT. « This is a best-effort notification: we make a single
//    attempt and do not retry on failure. » Un callback perdu est un contenu
//    jamais repris : le balayage nocturne reste le filet. Il peut s'espacer,
//    pas disparaître.
//
// 3. AUCUN `whSummaryVar`. STATUSES le pose à
//    `{vfStatus.body.results.amazon.actions}` — une variable que RIEN ne
//    produit (le nœud Verify pose `checkerResult` et `checkerSummary`, cf.
//    builder-handler-verify.js:146). Le bloc est avalé par le try/catch de
//    workflow_history et n'a jamais rien affiché. On ne reconduit pas le
//    vestige : `{checkerSummary}` est déjà dans les messages et porte
//    l'information.
//
// ── CE QUI RESTE À FAIRE CHEZ EUX ───────────────────────────────
// « This callback is configured per platform on our side (URL, HTTP method,
// optional custom headers) — contact us to set it up or change it. »
// URL à leur donner :  POST https://aps-askida.com/api/hooks/vodfactory-callback
// Tant que ce n'est pas fait, ce workflow ne se déclenchera jamais tout seul —
// il se teste en rejouant leur payload documenté (voir la fin de ce fichier).
// ================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const ECRIRE     = process.argv.includes('--ecrire');
const NOM        = 'BAYARD | CALLBACK | VODFACTORY';
const SLUG       = 'vodfactory-callback';
const ENV_QA     = 'cmqp7dk000002p8u50on1l3e7';
const CONN_VODF  = 'cmqp7eg4z0002q4u5q8c3gyej';

const BLEU  = '#3498db';
const JAUNE = '#f1c40f';

// L'external_id du callback EST le BayardID — c'est ce qu'APS a posé sur la
// collection au moment du PUBLISH. On le lit directement du payload plutôt que
// de le relire d'Iconik : STATUSES devait passer par `{item.metadata.BayardID.0}`
// parce qu'il partait d'une recherche ; ici le partenaire nous le donne.
const BAYARD_ID = '{_trigger.content.external_id}';
const ENDPOINT_STATUSES = '/api/contents/' + BAYARD_ID + '/action-statuses';

const ACTIONS = ['amazon_avails', 'amazon_data', 'amazon_pictures', 'amazon_videos'];

const checks = ACTIONS.flatMap(action => ([
  { label: action, method: 'GET', endpoint: ENDPOINT_STATUSES,
    path: `results.amazon.actions.${action}.status`,  op: 'equals',    value: 'success' },
  { label: action, method: 'GET', endpoint: ENDPOINT_STATUSES,
    path: `results.amazon.actions.${action}.sent_at`, op: 'not_empty', value: '' },
]));

// La collection visée, retrouvée par son BayardID. Indispensable : le
// partenaire ne connaît que l'external_id, alors qu'écrire dans Iconik exige
// l'UUID de la collection. C'est cette traduction qui interdit au callback
// d'aller directement de VOD Factory à Iconik.
const CIBLE = '{search_results.objects[0].id}';

const steps = [
  { id: 'reception', core: 'trigger', label: 'Callback VOD Factory',
    intent: 'VOD Factory nous appelle quand un transfert atteint un état final.',
    params: { kind: 'webhook', wfdSlug: SLUG, hookSecret: '' } },

  { id: 'la_collection', core: 'http_request', facade: 'iconik.search', label: 'La collection',
    intent: 'Retrouver la collection Iconik à partir du BayardID annoncé.',
    params: {
      limit: 1, resultVar: 'search_results',
      blocks: [{ id: 1, label: '', objectType: 'collection', parentBlock: null,
        criteria: [{ op: 'equals', join: '', field: 'BayardID', value: BAYARD_ID }] }],
    } },

  { id: 'statuts_vod_factory', core: 'verify', label: 'Statuts VOD Factory',
    intent: 'Demander l\'état COMPLET du contenu, pas seulement l\'action annoncée.',
    params: { connexionId: CONN_VODF, checks: checks } },

  { id: 'marquer_publie', core: 'http_request', facade: 'iconik.set_metadata', label: 'Marquer Publié',
    intent: 'Les quatre actions sont validées : le contenu est publié.',
    params: { mode: 'fields', target: 'collection', targetId: CIBLE,
      fields: [{ key: 'StatutPublication', value: 'Publié' }, { key: 'DatedePublication', value: '{now}' }] } },

  { id: 'histo_succes', core: 'history', facade: 'iconik.history', label: 'Histo Succès',
    params: { target: 'collection', targetId: CIBLE, mdField: 'StatutPrime', mdViewId: '',
      whMode: 'change', whOrder: 'newest', whWfName: 'Prime', whStatut: '✅ Succès',
      whMessage: 'Livraison Amazon Prime — ✅ Publié sur Prime. Validé par VOD Factory : avails, métadonnées, images, vidéo.',
      whShowDate: true, whShowUser: false, whShowRunId: false } },

  { id: 'pourquoi_ca_bloque', core: 'decision', label: 'Pourquoi ça bloque ?',
    intent: 'Distinguer ce qui attend encore de ce qui a vraiment échoué.',
    params: { field: '{checkerSummary}', defaultLabel: 'Echoué', conditions: [
      { op: 'contains', label: 'Reporté', value: 'parent_not_sent' },
      { op: 'contains', label: 'Echoué',  value: 'incomplete' },
      { op: 'contains', label: 'Reporté', value: 'ready' },
    ] } },

  { id: 'histo_reporte', core: 'history', facade: 'iconik.history', label: 'Histo Reporté',
    params: { target: 'collection', targetId: CIBLE, mdField: 'StatutPrime', mdViewId: '',
      whMode: 'change', whOrder: 'newest', whWfName: 'Prime', whStatut: '🕗 Reporté',
      whMessage: 'Livraison Amazon Prime — ⏳ En attente d\'envoi. Contenu prêt chez VOD Factory, pas encore transmis à Amazon. ⚠️ {checkerSummary}',
      whShowDate: true, whShowUser: false, whShowRunId: false } },

  { id: 'histo_echec', core: 'history', facade: 'iconik.history', label: 'Histo Échec',
    params: { target: 'collection', targetId: CIBLE, mdField: 'StatutPrime', mdViewId: '',
      whMode: 'change', whOrder: 'newest', whWfName: 'Prime', whStatut: '❌ Échec',
      whMessage: 'Livraison Amazon Prime — ❌ Échec de validation VOD Factory. ⚠️ {checkerSummary}',
      whShowDate: true, whShowUser: false, whShowRunId: false } },

  // ── Narration ────────────────────────────────────────────────
  { id: 'note_01', core: 'postit', label: 'Callback VOD Factory', params: { couleur: BLEU,
    text: 'VOD Factory appelle POST /api/hooks/' + SLUG + '\nquand un transfert atteint un état FINAL (success ou error).\n\nUn appel par paire (partenaire, action) : un même contenu\nen produit jusqu\'à quatre (avails, données, images, vidéo).' } },
  { id: 'note_02', core: 'postit', label: 'La collection', params: { couleur: JAUNE,
    text: 'Le partenaire ne connaît que le BayardID.\nÉcrire dans Iconik exige l\'UUID de la collection.\n\nC\'est cette traduction qui interdit au callback\nd\'aller directement de VOD Factory à Iconik.' } },
  { id: 'note_03', core: 'postit', label: 'Statuts VOD Factory', params: { couleur: BLEU,
    text: 'Le callback ne dit qu\'UNE action. On redemande l\'état\nCOMPLET : un seul appel, et on sait tout.\n\nAgréger les quatre callbacks dans APS demanderait\nde la mémoire entre appels — et l\'un d\'eux peut se perdre :\nle partenaire ne réessaie jamais.' } },
];

const edges = [
  { from: { step: 'reception', port: 'out' },              to: { step: 'la_collection' } },
  { from: { step: 'la_collection', port: 'found' },        to: { step: 'statuts_vod_factory' } },
  { from: { step: 'statuts_vod_factory', port: 'ok' },     to: { step: 'marquer_publie' } },
  { from: { step: 'statuts_vod_factory', port: 'fail' },   to: { step: 'pourquoi_ca_bloque' } },
  { from: { step: 'statuts_vod_factory', port: 'error' },  to: { step: 'histo_echec' } },
  { from: { step: 'marquer_publie', port: 'out' },         to: { step: 'histo_succes' } },
  { from: { step: 'marquer_publie', port: 'error' },       to: { step: 'histo_succes' } },
  { from: { step: 'pourquoi_ca_bloque', port: 'Reporté' }, to: { step: 'histo_reporte' } },
  { from: { step: 'pourquoi_ca_bloque', port: 'Echoué' },  to: { step: 'histo_echec' } },
  { from: { step: 'pourquoi_ca_bloque', port: 'default' }, to: { step: 'histo_echec' } },
];

// Disposition : colonne par profondeur dans le graphe, ligne par ordre
// d'apparition ; les notes sous leur nœud. Mêmes écarts que PUBLISH et
// STATUSES pour que les trois canevas se lisent pareil.
function disposer() {
  const COL_X = 320, LIGNE_Y = 150, NOTE_DY = 96;
  const mecaniques = steps.filter(s => s.core !== 'postit');
  const cibles = new Set(edges.map(e => e.to.step));
  const prof = new Map(mecaniques.map(s => [s.id, cibles.has(s.id) ? -1 : 0]));
  for (let passe = 0; passe < mecaniques.length; passe++) {
    let bouge = false;
    for (const e of edges) {
      const pd = prof.get(e.from.step), pa = prof.get(e.to.step);
      if (pd == null || pa == null || pd < 0) continue;
      if (pa < pd + 1) { prof.set(e.to.step, pd + 1); bouge = true; }
    }
    if (!bouge) break;
  }
  mecaniques.forEach(s => { if (prof.get(s.id) < 0) prof.set(s.id, 0); });

  const parColonne = new Map();
  const positions = {};
  mecaniques.forEach(function (s) {
    const c = prof.get(s.id);
    const rang = parColonne.get(c) || 0;
    parColonne.set(c, rang + 1);
    positions[s.id] = { x: 80 + c * COL_X, y: 80 + rang * LIGNE_Y };
  });
  steps.filter(s => s.core === 'postit').forEach(function (n) {
    const cible = mecaniques.find(s => s.label === n.label);
    if (!cible) return;
    positions[n.id] = { x: positions[cible.id].x, y: positions[cible.id].y + NOTE_DY };
  });
  return positions;
}

const document = {
  pivot: '1.0',
  form: 'canonical',
  workflow: { name: NOM, intent: '', status: 'draft', version: 1, platform: '', environment: ENV_QA },
  steps, edges,
  presentation: { positions: disposer() },
};

async function main() {
  const existant = await prisma.builderFlow.findFirst({ where: { name: NOM } });

  console.log('Workflow : ' + NOM);
  console.log('Slug     : ' + SLUG + '   →   POST /api/hooks/' + SLUG);
  console.log('Étapes   : ' + steps.filter(s => s.core !== 'postit').length +
              ' mécaniques + ' + steps.filter(s => s.core === 'postit').length + ' notes');
  console.log('Contrôles: ' + checks.length + ' (4 actions Amazon × 2)');
  console.log(existant ? '\nExiste déjà (' + existant.id + ') — sera mis à jour.' : '\nN\'existe pas encore — sera créé.');
  console.log(ECRIRE ? '\n⚠  MODE ÉCRITURE' : '\nMode lecture seule — relancer avec --ecrire pour appliquer');

  if (!ECRIRE) { await prisma.$disconnect(); return; }

  let flow;
  if (existant) {
    flow = await prisma.builderFlow.update({ where: { id: existant.id }, data: { document, active: true } });
  } else {
    const org = await prisma.builderFlow.findFirst({ select: { orgId: true } });
    flow = await prisma.builderFlow.create({
      data: { name: NOM, orgId: org.orgId, document, active: true },
    });
  }
  document.workflow.id = flow.id;
  await prisma.builderFlow.update({ where: { id: flow.id }, data: { document } });

  // PUBLIÉ tout de suite : /api/hooks n'exécute jamais un brouillon (même
  // exigence que le webhook Iconik), donc un flow non publié ne répondrait
  // jamais à un appel du partenaire.
  const derniere = await prisma.builderFlowVersion.findFirst({
    where: { flowId: flow.id }, orderBy: { version: 'desc' },
  });
  const version = (derniere ? derniere.version : 0) + 1;
  await prisma.builderFlowVersion.create({ data: { flowId: flow.id, version, document } });

  console.log('\n✅ écrit — ' + flow.id + ', version ' + version + ' publiée');
  console.log('\nPour le rejouer sans le partenaire :');
  console.log("  curl -X POST http://localhost:3000/api/hooks/" + SLUG + " \\");
  console.log("    -H 'Content-Type: application/json' \\");
  console.log('    -d \'{"occurred_at":"2026-08-10T10:15:00+00:00",' +
              '"content":{"external_id":"26080717492443","title":"Friday - The Serie"},' +
              '"partner":"amazon","action":"amazon_avails","status":"success","error_message":null}\'');

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
