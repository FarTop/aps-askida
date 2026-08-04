// APS — server/engine-builder/builder-run-store.js — créé le 2026-08-05
// ================================================================
// builder-run-store.js — Persistance Prisma des runs du moteur Builder
// (BuilderRun / BuilderRunEvent, org-scopés). Remplace l'historique fichier
// JSON de WFD (wfd-run-history.js) par des tables Postgres — voir le plan
// abstract-honking-map.md, §6.
//
// `ctxSnapshot` est délibérément un snapshot COMPLET du contexte à chaque
// événement (pas un résumé) : décision explicite pour que le futur panneau
// Logs puisse inspecter l'état exact à n'importe quelle étape passée.
// ================================================================

'use strict';

function _safeJson(v) {
  if (v === undefined) return null;
  try { return JSON.parse(JSON.stringify(v)); }
  catch (e) { return { _snapshotError: e.message }; }
}

function _ctxSnapshot(ctx) {
  if (!ctx) return null;
  return _safeJson({
    asset: ctx.asset, collection: ctx.collection, file: ctx.file,
    event: ctx.event, user: ctx.user,
    vars: ctx.vars, results: ctx.results,
    status: ctx.status, errors: ctx.errors,
  });
}

async function startRun(prisma, { orgId, flowId, flowVersion, triggerType, triggerRef }) {
  return prisma.builderRun.create({
    data: {
      orgId, flowId,
      flowVersion: flowVersion ?? null,
      status: 'running',
      triggerType,
      triggerRef: triggerRef || null,
    },
  });
}

async function appendEvent(prisma, runId, seq, type, step, ctx, extra) {
  extra = extra || {};
  await prisma.builderRunEvent.create({
    data: {
      runId, seq, type,
      stepId    : step ? step.id : null,
      stepCore  : step ? step.core : null,
      stepFacade: step ? (step.facade || null) : null,
      port      : extra.port != null ? String(extra.port) : null,
      message   : extra.message || null,
      severity  : extra.severity || null,
      ctxSnapshot: _ctxSnapshot(ctx),
    },
  });
}

async function finishRun(prisma, runId, ctx) {
  const startedAtMs = ctx.startedAt ? new Date(ctx.startedAt).getTime() : null;
  const fatal = (ctx.errors || []).find(e => e.severity === 'fatal');
  return prisma.builderRun.update({
    where: { id: runId },
    data: {
      status: ctx.status,
      finishedAt: new Date(),
      durationMs: startedAtMs ? (Date.now() - startedAtMs) : null,
      vars: _safeJson(ctx.vars),
      errors: _safeJson(ctx.errors),
      errorMessage: fatal ? fatal.message : null,
    },
  });
}

module.exports = { startRun, appendEvent, finishRun };
