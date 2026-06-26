// APS — server/routes/sync-jobs.js — 2026-06-24 19:15
// Routes de gestion des jobs de synchronisation Iconik
//
// POST /api/jobs/sync       — crée et lance un job de sync DS
// GET  /api/jobs/:id        — état et progression d'un job
// GET  /api/jobs            — historique des jobs (paginated)
// GET  /api/jobs/:id/log    — journal détaillé d'un job

'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { runSyncDS, SCOPE_ORDER } = require('./sync-engine');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// DÉCHIFFREMENT TOKEN
// ─────────────────────────────────────────────

function decrypt(text) {
  if (!text) return '';
  try {
    const key      = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch { return ''; }
}

// ─────────────────────────────────────────────
// JOBS EN COURS — Map en mémoire pour le polling
// (complété par la DB pour la persistance)
// ─────────────────────────────────────────────

const _activeJobs = new Map();
// Structure : { jobId, status, currentScope, done, total, log: [] }

// ─────────────────────────────────────────────
// POST /api/jobs/sync
// Corps : { envSlug, scopes, mode }
// ─────────────────────────────────────────────

router.post('/sync', async (req, res) => {
  const { envSlug, scopes = ['all'], mode = 'merge' } = req.body || {};

  if (!envSlug) {
    return res.status(400).json({ error: 'envSlug requis' });
  }

  // Résoudre l'environnement
  const env = await prisma.environment.findFirst({
    where: {
      OR: [
        { slug: envSlug },
        { type: envSlug },
      ],
    },
    include: { organisation: true },
  }).catch(() => null);

  if (!env) {
    return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });
  }

  if (!env.appId || !env.tokenEnc) {
    return res.status(400).json({ error: `Environnement "${envSlug}" : credentials manquants` });
  }

  const token = decrypt(env.tokenEnc);
  if (!token) {
    return res.status(400).json({ error: `Environnement "${envSlug}" : token invalide` });
  }

  // Valider les scopes
  const doAll = scopes.includes('all');
  const validScopes = doAll ? ['all'] : scopes.filter(s => SCOPE_ORDER.includes(s));
  if (!validScopes.length) {
    return res.status(400).json({ error: 'Aucun scope valide fourni', valid: SCOPE_ORDER });
  }

  // Créer le SyncJob en DB
  let job;
  try {
    job = await prisma.syncJob.create({
      data: {
        orgId:     env.orgId,
        srcEnvId:  env.id,
        direction: 'DS',
        scopes:    validScopes,
        mode,
        status:    'pending',
        log:       [],
      },
    });
  } catch (e) {
    console.error('[sync-jobs] Erreur création job:', e.message);
    return res.status(500).json({ error: 'Impossible de créer le job' });
  }

  // Répondre immédiatement avec le jobId
  res.status(202).json({
    jobId:  job.id,
    status: 'pending',
    env:    { name: env.name, slug: env.slug, type: env.type },
    scopes: validScopes,
  });

  // ── Lancer le job en arrière-plan ─────────────────────────────────────
  const jobState = {
    jobId:        job.id,
    status:       'running',
    currentScope: null,
    done:         0,
    total:        doAll ? SCOPE_ORDER.length : validScopes.length,
    log:          [],
    startedAt:    Date.now(),
  };
  _activeJobs.set(job.id, jobState);

  // Marquer comme running en DB
  await prisma.syncJob.update({
    where: { id: job.id },
    data:  { status: 'running', startedAt: new Date(), totalItems: jobState.total },
  }).catch(() => {});

  // Callbacks pour le moteur
  const onProgress = (scopeId, done, total) => {
    jobState.currentScope = scopeId;
    jobState.done         = done;
    jobState.total        = total;
    // Mise à jour DB non-bloquante
    prisma.syncJob.update({
      where: { id: job.id },
      data:  { currentScope: scopeId, doneItems: done, totalItems: total },
    }).catch(() => {});
  };

  const logLines = [];
  const log = (level, msg) => {
    const entry = { ts: new Date().toISOString(), level, msg };
    logLines.push(entry);
    jobState.log.push(entry);
    console.log(`[SyncJob ${job.id}] [${level}] ${msg}`);
  };

  // Exécution
  try {
    const result = await runSyncDS({
      prisma,
      jobId:   job.id,
      env:     { ...env, token },
      scopes:  validScopes,
      onProgress,
      log,
    });

    const durationMs = Date.now() - jobState.startedAt;
    jobState.status = 'done';

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status:     'done',
        doneItems:  result.done,
        totalItems: result.total,
        finishedAt: new Date(),
        durationMs,
        log:        logLines,
      },
    }).catch(() => {});

    log('info', `✅ Job terminé en ${Math.round(durationMs / 1000)}s — snapshot: ${result.snapshotId}`);

  } catch (err) {
    const durationMs = Date.now() - jobState.startedAt;
    jobState.status = 'error';

    console.error(`[SyncJob ${job.id}] Erreur fatale:`, err.message);
    log('error', `❌ Erreur fatale : ${err.message}`);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status:       'error',
        errorMessage: err.message,
        finishedAt:   new Date(),
        durationMs,
        log:          logLines,
      },
    }).catch(() => {});
  } finally {
    // Retirer de la map active après 5 min (le polling DB prend le relais)
    setTimeout(() => _activeJobs.delete(job.id), 5 * 60 * 1000);
  }
});

// ─────────────────────────────────────────────
// GET /api/jobs/:id
// Statut et progression d'un job
// ─────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // D'abord la map mémoire (job actif — données fraîches)
  const active = _activeJobs.get(id);
  if (active) {
    return res.json({
      jobId:        active.jobId,
      status:       active.status,
      currentScope: active.currentScope,
      done:         active.done,
      total:        active.total,
      pct:          active.total > 0 ? Math.round((active.done / active.total) * 100) : 0,
      log:          active.log.slice(-20), // 20 dernières lignes
    });
  }

  // Sinon DB (job terminé ou crash récupéré)
  const job = await prisma.syncJob.findUnique({
    where: { id },
    include: {
      srcEnv: { select: { name: true, slug: true, type: true } },
      snapshots: { select: { id: true, scope: true, objectCount: true, capturedAt: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
    },
  }).catch(() => null);

  if (!job) return res.status(404).json({ error: 'Job introuvable' });

  res.json({
    jobId:        job.id,
    status:       job.status,
    direction:    job.direction,
    scopes:       job.scopes,
    currentScope: job.currentScope,
    done:         job.doneItems || 0,
    total:        job.totalItems || 0,
    pct:          job.totalItems > 0 ? Math.round(((job.doneItems || 0) / job.totalItems) * 100) : 0,
    errorMessage: job.errorMessage || null,
    durationMs:   job.durationMs || null,
    startedAt:    job.startedAt,
    finishedAt:   job.finishedAt,
    env:          job.srcEnv,
    snapshot:     job.snapshots[0] || null,
  });
});

// ─────────────────────────────────────────────
// GET /api/jobs/:id/log
// Journal détaillé d'un job
// ─────────────────────────────────────────────

router.get('/:id/log', async (req, res) => {
  const { id } = req.params;

  // Job actif — log en mémoire
  const active = _activeJobs.get(id);
  if (active) return res.json({ log: active.log });

  // Job terminé — log en DB
  const job = await prisma.syncJob.findUnique({
    where:  { id },
    select: { log: true, status: true },
  }).catch(() => null);

  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  res.json({ log: job.log || [] });
});

// ─────────────────────────────────────────────
// GET /api/jobs
// Historique des jobs (50 derniers)
// ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { envSlug, direction, limit = 50 } = req.query;

  const where = {};
  if (direction) where.direction = direction.toUpperCase();
  if (envSlug) {
    const env = await prisma.environment.findFirst({ where: { OR: [{ slug: envSlug }, { type: envSlug }] }, select: { id: true } }).catch(() => null);
    if (env) where.srcEnvId = env.id;
  }

  const jobs = await prisma.syncJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    Math.min(parseInt(limit) || 50, 200),
    include: {
      srcEnv:    { select: { name: true, slug: true, type: true } },
      snapshots: { select: { id: true, objectCount: true, capturedAt: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
    },
  }).catch(() => []);

  res.json(jobs.map(j => ({
    jobId:       j.id,
    direction:   j.direction,
    scopes:      j.scopes,
    status:      j.status,
    done:        j.doneItems || 0,
    total:       j.totalItems || 0,
    durationMs:  j.durationMs,
    startedAt:   j.startedAt,
    finishedAt:  j.finishedAt,
    env:         j.srcEnv,
    snapshot:    j.snapshots[0] || null,
    errorMessage: j.errorMessage || null,
  })));
});

module.exports = router;
