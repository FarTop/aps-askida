// APS — server/routes/builder-runs.js — créé le 2026-08-05
// Lecture seule de l'historique de runs du moteur natif du Builder. Sert
// aussi de source de sondage pour l'animation live des jobs sur le canevas
// (wf-run-poll.js) — pas de SSE, du sondage simple avec `?since=seq` pour
// n'envoyer que les nouveaux événements sur les ticks suivants.
'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// GET /api/builder-runs?flowId=... — liste org-scopée, sans les events (potentiellement nombreux)
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const where = whereOrg(ctx);
    if (req.query.flowId) where.flowId = String(req.query.flowId);
    const runs = await prisma.builderRun.findMany({
      where, orderBy: { startedAt: 'desc' }, take: 100,
    });
    res.json(runs);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/builder-runs/:runId?since=seq — détail + events (seq > since si fourni)
// Sans `since` : historique complet (premier sondage). Avec `since` : seulement
// les événements nouveaux depuis le dernier tick — évite de re-télécharger un
// ctxSnapshot complet par événement à chaque sondage sur un run long/en boucle.
router.get('/:runId', async (req, res) => {
  const prisma = getPrisma();
  try {
    const since = req.query.since != null ? Number(req.query.since) : null;
    const run = await prisma.builderRun.findUnique({
      where: { id: req.params.runId },
      include: { events: { where: since != null ? { seq: { gt: since } } : undefined, orderBy: { seq: 'asc' } } },
    });
    if (!run) return res.status(404).json({ error: 'Run non trouvé' });
    res.json(run);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/builder-runs/:runId/events — events seuls
router.get('/:runId/events', async (req, res) => {
  const prisma = getPrisma();
  try {
    const events = await prisma.builderRunEvent.findMany({
      where: { runId: req.params.runId }, orderBy: { seq: 'asc' },
    });
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
