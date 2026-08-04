// APS — scripts/preuve-execution.js — créé le 2026-08-05
// ================================================================
// Preuve d'équivalence comportementale : exécute un même document pivot
// via (a) WFD (pivot-to-wfd.js + WfdExecutor.executeFlux, EN MÉMOIRE — pas
// de route /wfd, pas de ligne Flow/Run écrite) et (b) le moteur natif du
// Builder (server/engine-builder/builder-engine.js), puis compare.
//
// Usage :
//   node scripts/preuve-execution.js <builderFlowId> <collectionId>
//
// Pointer IMPÉRATIVEMENT vers un environnement de sandbox/QA — jamais la
// prod (cf. plan abstract-honking-map.md, §9). Ce script fait de VRAIS
// appels API (Iconik, S3, partenaire) des deux côtés : ce n'est pas un test
// à sec.
// ================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const PivotToWfd   = require('../server/public/builders/workflow/pivot-to-wfd.js');
const WfdExecutor  = require('../server/engine/wfd-engine-executor.js');
const WfdHandlers  = require('../server/engine/wfd-engine-handlers.js');
const { IconikClient: WfdIconikClient } = require('../server/engine/wfd-engine-iconik-client.js');

const { executeRun } = require('../server/engine-builder/builder-engine.js');
const { resolveRunResources } = require('../server/engine-builder/builder-resolver.js');

function _fmtConnexion(c) {
  return {
    id: c.id, name: c.name, type: c.type, direction: c.direction,
    baseUrl: c.baseUrl, endpoint: c.baseUrl, authType: c.authType,
    authValue: decrypt(c.authValueEnc),
    headers: (c.extraConfig && c.extraConfig.headers) || [],
    isActive: c.isActive,
  };
}

async function main() {
  const flowId = process.argv[2];
  const collectionId = process.argv[3];
  if (!flowId || !collectionId) {
    console.error('Usage: node scripts/preuve-execution.js <builderFlowId> <collectionId>');
    process.exit(1);
  }

  const flow = await prisma.builderFlow.findUnique({ where: { id: flowId } });
  if (!flow) throw new Error('BuilderFlow introuvable : ' + flowId);
  const doc = flow.document;
  const orgId = flow.orgId;
  const envId = doc.workflow && doc.workflow.environment;

  console.log('═══ Document :', doc.workflow.name, '| org:', orgId, '| env:', envId, '═══\n');

  // ── Résolutions communes (Mapping/Manifest/Endpoint), ré-agencées pour
  // pivot-to-wfd.js (mappings -> rows directement, pas la ligne complète). ──
  const resolvedNative = await resolveRunResources(doc, prisma, orgId);
  const resolutionsWfd = {
    mappings: Object.fromEntries(Object.entries(resolvedNative.mappings).map(([id, row]) => [id, row.rules])),
    manifests: resolvedNative.manifests,
    endpoints: resolvedNative.endpoints,
  };

  // ── Connexions génériques (Connexion, PAS Environment) pour WFD : même
  // forme que wfd-engine-express.js loadActiveFluxes() (:159-172). ──
  const connexionsRaw = await prisma.connexion.findMany();
  WfdHandlers._connexions = connexionsRaw.map(_fmtConnexion);
  WfdHandlers._nommages = [];

  // ── Client Iconik (même Environment pour les deux moteurs) ──
  const env = await prisma.environment.findUnique({ where: { id: envId } });
  if (!env || !env.appId || !env.tokenEnc) throw new Error('Environment introuvable ou incomplet : ' + envId);
  const iconikToken = decrypt(env.tokenEnc);
  const wfdIconikClient = new WfdIconikClient({ baseUrl: env.baseUrl, appId: env.appId, authToken: iconikToken });

  // ── Conversion pivot → WFD ──
  // `forcer: true` — PUBLISH est fonctionnellement complet et déjà utilisé en
  // production, mais ne respecte pas encore toutes les règles STYLISTIQUES
  // du validateur strict (intent manquant sur plusieurs steps, ids hérités
  // du canevas au lieu d'un identifiant métier, onError encore par étape sur
  // certains nœuds plus anciens que la règle "onError = réglage de workflow"
  // du 3-4 août) — écarts de qualité de document, aucun n'affecte la
  // conversion elle-même (mêmes champs lus quel que soit le style de l'id).
  const converted = PivotToWfd.convertir(doc, { resolutions: resolutionsWfd, forcer: true });
  const flux = {
    id: 'preuve-execution-' + flow.id,
    name: doc.workflow.name,
    nodes: converted.nodes,
    connections: converted.connections,
    iconikEnv: null,
  };

  const rawPayload = { context: 'COLLECTION', collection_ids: [collectionId] };

  // ═══ RUN WFD ═══
  console.log('▶ Run WFD (en mémoire, pivot-to-wfd.js + WfdExecutor.executeFlux)...');
  const WfdTrigger = require('../server/engine/wfd-engine-trigger.js');
  const triggerPayloadWfd = WfdTrigger.normalizeIconikPayload(rawPayload);
  const wfdEvents = [];
  const ctxWfd = await WfdExecutor.executeFlux(
    flux, triggerPayloadWfd, WfdHandlers, wfdIconikClient,
    (type, data) => wfdEvents.push({ type, nodeId: data.nodeId, port: data.port })
  );
  console.log('  status:', ctxWfd.status, '| erreurs:', ctxWfd.errors.length, '| événements:', wfdEvents.length);

  // ═══ RUN MOTEUR NATIF ═══
  console.log('\n▶ Run moteur natif (server/engine-builder/builder-engine.js)...');
  const triggerPayloadNative = _normalizeIconikPayloadNative(rawPayload);
  const resultNative = await executeRun(doc, {
    orgId, flowId: flow.id, flowVersion: null,
    triggerPayload: triggerPayloadNative, triggerType: 'manual', triggerRef: 'preuve-execution',
    prisma,
  });
  console.log('  status:', resultNative.status, '| erreurs:', resultNative.errors.length, '| runId:', resultNative.runId);

  const eventsNative = await prisma.builderRunEvent.findMany({ where: { runId: resultNative.runId }, orderBy: { seq: 'asc' } });

  // ═══ COMPARAISON ═══
  console.log('\n═══ Comparaison ═══');
  console.log('Statut  — WFD:', ctxWfd.status, '| Natif:', resultNative.status, ctxWfd.status === resultNative.status ? '✅' : '⚠️');

  const portsWfd = wfdEvents.filter(e => e.type === 'node:done').map(e => `${e.nodeId}→${e.port}`);
  const portsNative = eventsNative.filter(e => e.type === 'step:done').map(e => `${e.stepId}→${e.port}`);
  console.log('\nSéquence de ports — WFD (' + portsWfd.length + ') :');
  portsWfd.forEach(p => console.log('  ' + p));
  console.log('\nSéquence de ports — Natif (' + portsNative.length + ') :');
  portsNative.forEach(p => console.log('  ' + p));

  console.log('\nVariables clés (comparaison manuelle recommandée pour {now}/timestamps) :');
  const keysToCompare = ['TypeCollection', 'BayardID', 'ancestorPath', 'search_results.count', 'assetsAExporter.count', 'checkerSummary'];
  keysToCompare.forEach(k => {
    const a = ctxWfd.vars[k];
    const b = resultNative.vars[k];
    console.log(`  ${k} — WFD: ${JSON.stringify(a)} | Natif: ${JSON.stringify(b)} ${a === b ? '✅' : (a === undefined && b === undefined ? '·' : '⚠️')}`);
  });

  await prisma.$disconnect();
}

// Port de normalizeIconikPayload() pour le moteur natif — même logique que
// server/routes/builder-engine.js (dupliquée volontairement : ce script ne
// doit dépendre d'aucune route Express).
function _normalizeIconikPayloadNative(raw) {
  const isCustomAction = !!(
    (raw.auth_token && (raw.asset_ids !== undefined || raw.object_id)) ||
    (raw.collection_ids !== undefined && raw.context === 'COLLECTION')
  );
  const assetId = (Array.isArray(raw.asset_ids) && raw.asset_ids.length ? raw.asset_ids[0] : null) || raw.object_id || '';
  const contextType = raw.context || raw.object_type || 'asset';
  const collectionId = (Array.isArray(raw.collection_ids) && raw.collection_ids.length ? raw.collection_ids[0] : null) || '';
  return {
    asset: { id: assetId, type: contextType },
    collection: { id: collectionId },
    event: { viewId: raw.metadata_view_id || '' },
    ...(isCustomAction ? { _iconikAuth: { token: raw.auth_token, appId: raw.app_id || '' } } : {}),
    _metadata: {},
  };
}

main().catch(e => { console.error('ERREUR:', e); process.exit(1); });
