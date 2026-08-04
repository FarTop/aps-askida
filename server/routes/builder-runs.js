// APS — server/routes/builder-runs.js — créé le 2026-08-05
// Lecture seule de l'historique de runs du moteur natif du Builder — pensé
// pour la vérification par curl (pas de SSE, pas d'UI, cf. plan
// abstract-honking-map.md, §7 — les panneaux Logs/Run du canevas sont un
// chantier séparé, pas encore cadré).
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

// GET /api/builder-runs/:runId — détail + events
router.get('/:runId', async (req, res) => {
  const prisma = getPrisma();
  try {
    const run = await prisma.builderRun.findUnique({
      where: { id: req.params.runId },
      include: { events: { orderBy: { seq: 'asc' } } },
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
