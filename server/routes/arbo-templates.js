const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// GET /api/arbo-templates — lister tous les templates sauvegardés
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const templates = await prisma.arboTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id:true, name:true, description:true, createdAt:true, updatedAt:true },
    });
    res.json(templates);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/arbo-templates/:id — charger un template complet
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const template = await prisma.arboTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Non trouvé' });
    res.json(template);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/arbo-templates — sauvegarder un nouveau template
router.post('/', async (req, res) => {
  const { name, description, config } = req.body;
  if (!name || !config) return res.status(400).json({ error: 'name et config requis' });
  const prisma = getPrisma();
  try {
    const template = await prisma.arboTemplate.create({
      data: { id: require('crypto').randomUUID(), name, description: description || null, config },
    });
    res.json(template);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/arbo-templates/:id — mettre à jour un template existant
router.put('/:id', async (req, res) => {
  const { name, description, config } = req.body;
  const prisma = getPrisma();
  try {
    const template = await prisma.arboTemplate.update({
      where: { id: req.params.id },
      data: { name, description: description || null, config, updatedAt: new Date() },
    });
    res.json(template);
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/arbo-templates/:id — supprimer un template
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.arboTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
