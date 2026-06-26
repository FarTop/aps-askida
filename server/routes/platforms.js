// APS — server/routes/platforms.js — 2026-06-24

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// GET /api/platforms — liste toutes les plateformes
router.get('/', async (req, res) => {
  try {
    const platforms = await prisma.platform.findMany({
      orderBy: { name: 'asc' },
      include: {
        organisations: {
          include: {
            organisation: true,
          },
        },
        environments: {
          select: { id: true, name: true, type: true, orgId: true, isDefault: true, tokenEnc: true },
        },
      },
    });
    res.json(platforms);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/platforms/:id
router.get('/:id', async (req, res) => {
  try {
    const p = await prisma.platform.findUnique({
      where: { id: req.params.id },
      include: {
        organisations: { include: { organisation: true } },
        environments:  true,
      },
    });
    if (!p) return res.status(404).json({ error: 'Non trouvée' });
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/platforms — créer une plateforme
router.post('/', async (req, res) => {
  try {
    const { name, slug, type, description, icon, version } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name et slug obligatoires' });
    const p = await prisma.platform.create({
      data: {
        name, slug,
        type:        type        || 'integration',
        description: description || null,
        icon:        icon        || null,
        version:     version     || '1.0.0',
      },
    });
    res.status(201).json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/platforms/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, slug, type, description, icon, version, isActive } = req.body;
    const p = await prisma.platform.update({
      where: { id: req.params.id },
      data:  { name, slug, type, description, icon, version, isActive },
    });
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/platforms/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.platform.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Liens Organisation ↔ Plateforme ──────────────────────────

// POST /api/platforms/:id/organisations — lier une org à une plateforme
router.post('/:id/organisations', async (req, res) => {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'orgId obligatoire' });
    const link = await prisma.organisationPlatform.create({
      data: { orgId, platformId: req.params.id },
      include: { organisation: true, platform: true },
    });
    res.status(201).json(link);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/platforms/:id/organisations/:orgId — délier
router.delete('/:id/organisations/:orgId', async (req, res) => {
  try {
    await prisma.organisationPlatform.deleteMany({
      where: { platformId: req.params.id, orgId: req.params.orgId },
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/platforms/organisation/:orgId — plateformes d'une org
router.get('/organisation/:orgId', async (req, res) => {
  try {
    const links = await prisma.organisationPlatform.findMany({
      where: { orgId: req.params.orgId },
      include: {
        platform: {
          include: {
            environments: {
              where: { orgId: req.params.orgId },
              select: { id: true, name: true, type: true, isDefault: true, baseUrl: true, appId: true, tokenEnc: true },
            },
          },
        },
      },
    });
    res.json(links.map(l => ({
      ...l.platform,
      environments: l.platform.environments.map(e => ({
        ...e,
        hasToken: !!e.tokenEnc,
        tokenEnc: undefined,
      })),
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
