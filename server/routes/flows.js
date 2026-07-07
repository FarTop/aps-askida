// APS — server/routes/flows.js — 2026-06-24
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

async function getDefaultEnvId() {
  const env = await prisma.environment.findFirst({ where: { isDefault: true } });
  return env?.id;
}

// GET /api/flows
router.get('/', async (req, res) => {
  try {
    const envId = await getDefaultEnvId();
    const flows = await prisma.flow.findMany({ where: { envId } });
    res.json(flows.map(f => ({
      id: f.id, name: f.name, description: f.description,
      nodes: f.nodes, connections: f.connections, isActive: f.isActive,
      iconikEnv: f.iconikEnv || null,
      createdAt: f.createdAt, updatedAt: f.updatedAt,
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/flows/:id
router.get('/:id', async (req, res) => {
  try {
    const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
    if (!flow) return res.status(404).json({ error: 'Flow non trouvé' });
    res.json(flow);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/flows — création unitaire ou bulk { items: [...] }
router.post('/', async (req, res) => {
  try {
    const envId = await getDefaultEnvId();

    if (req.body.items) {
      const items = req.body.items;
      if (!items.length) return res.json({ ok: true, count: 0 });
      const results = await Promise.allSettled(
        items.map(f => {
          const base = { name: f.name, description: f.description, nodes: f.nodes || [], connections: f.connections || [], iconikEnv: f.iconikEnv || null };
          return prisma.flow.upsert({
            where:  { id: f.id },
            // isActive : ne pas toucher au champ existant si le client ne fournit pas explicitement
            // un booléen (undefined = "pas concerné par cette sauvegarde", pas "remettre à true").
            // Évite qu'une sauvegarde en masse du canvas (nodes/connections) n'écrase silencieusement
            // un flux désactivé entre-temps via /wfd/deactivate — cf. bug flux actifs désynchronisés
            // trouvé le 07/07/2026 (le déclencheur toggle ne mettait pas à jour flux.isActive côté
            // client, donc ce champ restait périmé dans le cache local envoyé ici).
            update: { ...base, ...(typeof f.isActive === 'boolean' ? { isActive: f.isActive } : {}) },
            create: { id: f.id, envId, ...base, isActive: typeof f.isActive === 'boolean' ? f.isActive : true },
          });
        })
      );
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
      return res.json({ ok: true, count: results.length, errors: errors.length ? errors : undefined });
    }

    const { id, name, description, nodes, connections } = req.body;
    const flow = await prisma.flow.upsert({
      where:  { id: id || '' },
      update: { name, description, nodes: nodes || [], connections: connections || [] },
      create: { id, envId, name, description, nodes: nodes || [], connections: connections || [] },
    });
    res.status(201).json(flow);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/flows/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description, nodes, connections, isActive, iconikEnv } = req.body;
    const flow = await prisma.flow.update({
      where: { id: req.params.id },
      data:  { name, description, nodes, connections, isActive, iconikEnv: iconikEnv || null },
    });
    res.json(flow);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/flows/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.flow.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
