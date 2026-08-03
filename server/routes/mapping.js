// APS — server/routes/mapping.js — 2026-08-03
// CRUD pour Mapping (table de correspondance) : ressource d'org, au même titre
// que Manifest — cf. builder-etat.md section "Ressources". Remplace le lkRows
// jusqu'ici embarqué dans la config du nœud Lookup (recopié à chaque usage) ;
// sert aussi HTTP Sequence côté publication. CRUD calqué sur arbo-templates.js,
// scoping org calqué sur connexions.js (Mapping est org-rooté, contrairement à
// ArboTemplate).
//
// Alias de champ : la colonne Prisma s'appelle `rules` (cohérente avec
// `Nommage`, même forme), mais l'écran admin déjà en place
// (server/public/admin/ressources/ressources.js, du 29 juillet, antérieur à
// cette route) attend `rows` en clé de contenu pour mappings ET nommages —
// c'est le contrat déjà établi côté client, pas une convention à changer côté
// route. On alias donc ici plutôt que de renommer la colonne ou de retoucher
// l'écran admin.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function _versLApi(m) {
  return { id: m.id, name: m.name, rows: m.rules, createdAt: m.createdAt, updatedAt: m.updatedAt };
}

// GET /api/mappings — mappings de l'organisation du contexte (repli non filtré
// pour superadmin/admin, cf. org-context.js).
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const mappings = await prisma.mapping.findMany({
      where: whereOrg(ctx),
      orderBy: { updatedAt: 'desc' },
    });
    res.json(mappings.map(_versLApi));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/mappings/:id — mapping complet (avec ses rows)
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const mapping = await prisma.mapping.findUnique({ where: { id: req.params.id } });
    if (!mapping) return res.status(404).json({ error: 'Non trouvé' });
    res.json(_versLApi(mapping));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/mappings — créer un mapping, rattaché à l'org du contexte
router.post('/', async (req, res) => {
  const { name, rows } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const mapping = await prisma.mapping.create({
      data: { orgId: ctx.orgId, name, rules: rows || [] },
    });
    res.json(_versLApi(mapping));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/mappings/:id — mettre à jour un mapping existant
router.put('/:id', async (req, res) => {
  const { name, rows } = req.body;
  const prisma = getPrisma();
  try {
    const mapping = await prisma.mapping.update({
      where: { id: req.params.id },
      data: { name, rules: rows || [], updatedAt: new Date() },
    });
    res.json(_versLApi(mapping));
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/mappings/:id
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.mapping.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
