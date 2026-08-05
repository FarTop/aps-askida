// APS — server/engine-builder/builder-engine.js — créé le 2026-08-05
// ================================================================
// builder-engine.js — Assemblage du moteur natif du Builder (mirroir de
// server/engine/wfd-engine.js pour l'assemblage, mais zéro dépendance
// runtime à ce fichier ni à aucun autre wfd-engine*.js).
//
// executeRun(doc, opts) : point d'entrée unique, appelé par les routes de
// déclenchement (server/routes/builder-engine.js). Voir le plan
// abstract-honking-map.md, §2.
// ================================================================

'use strict';

const BuilderContext          = require('./builder-context.js');
const { runFromStep, runLoop } = require('./builder-executor.js');
const Registry                = require('./builder-handlers-index.js');
const RunStore                = require('./builder-run-store.js');
const { resolveIconikClient, buildClientFromAuth } = require('./builder-iconik-connection.js');
const { resolveRunResources } = require('./builder-resolver.js');

// ── Seed du contexte depuis le triggerPayload ────────────────────
// Port de la logique de wfd-engine-executor.js:172-241 (executeFlux) — la
// forme du payload normalisé (asset.id, collection.id, event.viewId,
// auth_token/app_id, _metadata) est produite en amont par les appelants
// (route webhook pour un payload Custom Action réel, route manuelle pour un
// payload de test) et reste identique à celle que WFD utilise déjà.
function _seedContext(ctx, triggerPayload) {
  const tp = triggerPayload || {};

  if (tp._iconikAuth) {
    ctx._iconikAuth = tp._iconikAuth;
    BuilderContext.setVar(ctx, '_iconik_token', tp._iconikAuth.token);
    BuilderContext.setVar(ctx, '_iconik_app_id', tp._iconikAuth.appId);
  }

  const _assetId = tp.asset?.id || tp.asset_id || '';
  if (_assetId) {
    BuilderContext.setVar(ctx, 'asset_id', _assetId);
    ctx.asset = ctx.asset || {};
    ctx.asset.id = _assetId;
    if (tp.asset?.type) ctx.asset.type = tp.asset.type;
  }

  const _colId = tp.collection?.id || '';
  if (_colId) {
    BuilderContext.setVar(ctx, 'collection_id', _colId);
    ctx.collection = ctx.collection || {};
    ctx.collection.id = _colId;
  }

  const _viewId = tp.event?.viewId || tp.metadata_view_id || '';
  if (_viewId) {
    BuilderContext.setVar(ctx, 'metadata_view_id', _viewId);
    ctx.event = ctx.event || {};
    ctx.event.viewId = _viewId;
  }

  if (tp.auth_token) {
    ctx._iconikAuth = ctx._iconikAuth || { token: tp.auth_token, appId: tp.app_id || '' };
    BuilderContext.setVar(ctx, '_iconik_token', tp.auth_token);
    BuilderContext.setVar(ctx, '_iconik_app_id', tp.app_id || '');
  }

  const _triggerMeta = tp._metadata || {};
  Object.entries(_triggerMeta).forEach(([fieldName, fieldData]) => {
    if (fieldName === '__separator__') return;
    const values = (fieldData?.field_values || [])
      .map(fv => fv.value)
      .filter(v => v !== null && v !== undefined && v !== '');
    if (!values.length) return;
    const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
    BuilderContext.setVar(ctx, 'trigger.' + fieldName, exposed);
  });
}

// ── Politique workflow.onError ───────────────────────────────────
// Remplace la lecture WFD `node.config?.onError` (par step) : le pivot a
// supprimé cet override, `workflow.onError` s'applique à toutes les étapes.
//   stop         → arrêt du run, échec fatal.
//   continue_log → erreur notée (warn), puis routage vers le port 'error' si
//                  l'étape en déclare un, sinon la branche s'arrête là.
//   continue     → même routage, sans lever le statut du run au-delà de
//                  l'événement enregistré.
// Retourne soit la chaîne 'stop', soit le nom du port à suivre.
function applyWorkflowOnError(ctx, onError, step, err) {
  const policy = onError || 'continue_log';

  if (policy === 'stop') {
    BuilderContext.addError(ctx, step.id, err.message, 'fatal');
    ctx.status = 'failed';
    return 'stop';
  }

  BuilderContext.addError(ctx, step.id, err.message, 'warn');
  // 'continue_log' journalise en warn (déjà fait ci-dessus) ; 'continue'
  // n'ajoute rien de plus au niveau du run — les deux routent pareil.
  return 'error';
}

async function executeRun(doc, options) {
  const {
    orgId, flowId, flowVersion,
    triggerPayload, triggerType, triggerRef,
    prisma,
    iconikClient: iconikClientOverride = null,
    resolved: resolvedOverride = null,
    // Ligne BuilderRun déjà créée par l'appelant (ex. le déclenchement manuel,
    // qui a besoin d'un runId réel AVANT de répondre au client pour permettre
    // le sondage live — cf. server/routes/builder-engine.js). Si absent,
    // comportement inchangé : la ligne est créée ici, comme avant.
    existingRun = null,
  } = options;

  const steps = (doc && doc.steps) || [];
  const edges = (doc && doc.edges) || [];

  const trigger = steps.find(s => s.core === 'trigger');
  if (!trigger) throw new Error('Aucune étape trigger trouvée dans le document pivot');

  // Résolution des ressources d'org référencées (Mapping/Manifest/Endpoint/
  // ArboTemplate), en bloc, avant tout effet de bord Iconik — override
  // possible (tests, scripts de preuve) via options.resolved.
  const resolved = resolvedOverride || await resolveRunResources(doc, prisma, orgId);

  const ctx = BuilderContext.createContext(Object.assign({}, triggerPayload, { _flowId: flowId }));
  ctx.flowId = flowId;
  _seedContext(ctx, triggerPayload);

  // Un seul client Iconik par run (pas de repli par étape pour les façades
  // Iconik natives, cf. builder-iconik-connection.js) — priorité à
  // l'environnement configuré sur le workflow ; à défaut, repli sur les
  // credentials transmis par la Custom Action elle-même (ctx._iconikAuth,
  // seedé ci-dessus) — même priorité que WFD (wfd-engine-executor.js:309-311).
  // Override explicite possible (tests, scripts de preuve) via options.iconikClient.
  const iconikClient = iconikClientOverride
    || await resolveIconikClient(prisma, orgId, doc.workflow && doc.workflow.environment)
    || buildClientFromAuth(ctx._iconikAuth);

  const run = existingRun || await RunStore.startRun(prisma, { orgId, flowId, flowVersion, triggerType, triggerRef });

  let seq = 0;
  const emit = async (type, step, ctxAtEvent, extra) => {
    seq += 1;
    await RunStore.appendEvent(prisma, run.id, seq, type, step, ctxAtEvent, extra);
  };

  const opts = {
    emit,
    registry: Registry,
    deps: () => ({ iconikClient, resolved, prisma }),
    onError: (ctxArg, step, err) => applyWorkflowOnError(ctxArg, doc.workflow && doc.workflow.onError, step, err),
    runLoop: (step, ctxArg, o) => runLoop(step, ctxArg, o),
  };

  await emit('start', trigger, ctx);
  try {
    await runFromStep(trigger, steps, edges, ctx, opts);
    BuilderContext.finalizeSuccess(ctx);
  } catch (err) {
    ctx.status = 'failed';
    BuilderContext.addError(ctx, 'engine', err.message, 'fatal');
  }
  await emit('end', null, ctx);

  await RunStore.finishRun(prisma, run.id, ctx);

  return { runId: run.id, status: ctx.status, vars: ctx.vars, errors: ctx.errors };
}

module.exports = { executeRun, applyWorkflowOnError };
