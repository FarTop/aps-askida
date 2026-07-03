const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// GET /api/aps-search — lister toutes les searches sauvegardées
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const searches = await prisma.apsSearch.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id:true, name:true, description:true, createdAt:true, updatedAt:true },
    });
    res.json(searches);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/aps-search/:id — charger une search complète
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const search = await prisma.apsSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return res.status(404).json({ error: 'Non trouvée' });
    res.json(search);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/aps-search — sauvegarder une nouvelle search
router.post('/', async (req, res) => {
  const { name, description, config } = req.body;
  if (!name || !config) return res.status(400).json({ error: 'name et config requis' });
  const prisma = getPrisma();
  try {
    const search = await prisma.apsSearch.create({
      data: { id: require('crypto').randomUUID(), name, description: description || null, config },
    });
    res.json(search);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/aps-search/:id — mettre à jour une search existante
router.put('/:id', async (req, res) => {
  const { name, description, config } = req.body;
  const prisma = getPrisma();
  try {
    const search = await prisma.apsSearch.update({
      where: { id: req.params.id },
      data: { name, description: description || null, config, updatedAt: new Date() },
    });
    res.json(search);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/aps-search/:id — supprimer une search
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.apsSearch.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
