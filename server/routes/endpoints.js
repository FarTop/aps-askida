// APS — server/routes/endpoints.js — 2026-08-04
// CRUD pour Endpoint (séquence de requêtes HTTP nommée) : ressource d'org, au
// même titre que Mapping/Manifest — cf. builder-etat.md section "Ressources".
// Remplace le tableau `steps` jusqu'ici recopié dans la config du nœud
// http_sequence (façade vodfactory.partner / node "Partner", = Publication
// API de WFD). CRUD calqué sur mapping.js, scoping org via org-context.js.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function _versLApi(e) {
  return { id: e.id, name: e.name, steps: e.steps, createdAt: e.createdAt, updatedAt: e.updatedAt };
}

// GET /api/endpoints — séquences de l'organisation du contexte (repli non
// filtré pour superadmin/admin, cf. org-context.js).
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const endpoints = await prisma.endpoint.findMany({
      where: whereOrg(ctx),
      orderBy: { updatedAt: 'desc' },
    });
    res.json(endpoints.map(_versLApi));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/endpoints/:id — séquence complète (avec ses steps)
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const endpoint = await prisma.endpoint.findUnique({ where: { id: req.params.id } });
    if (!endpoint) return res.status(404).json({ error: 'Non trouvé' });
    res.json(_versLApi(endpoint));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/endpoints — créer une séquence, rattachée à l'org du contexte
router.post('/', async (req, res) => {
  const { name, steps } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const endpoint = await prisma.endpoint.create({
      data: { orgId: ctx.orgId, name, steps: steps || [] },
    });
    res.json(_versLApi(endpoint));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/endpoints/:id — mettre à jour une séquence existante
router.put('/:id', async (req, res) => {
  const { name, steps } = req.body;
  const prisma = getPrisma();
  try {
    const endpoint = await prisma.endpoint.update({
      where: { id: req.params.id },
      data: { name, steps: steps || [], updatedAt: new Date() },
    });
    res.json(_versLApi(endpoint));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/endpoints/:id
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.endpoint.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
