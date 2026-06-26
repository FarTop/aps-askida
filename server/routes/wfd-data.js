// APS — server/routes/wfd-data.js — 2026-06-24
// Routes pour mappings, palnodes, nommages, scripts, contacts, runs

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

async function getDefaultOrgId() {
  const org = await prisma.organisation.findFirst();
  return org?.id;
}

async function getDefaultEnvId() {
  const env = await prisma.environment.findFirst({ where: { isDefault: true } });
  return env?.id;
}

// ── Upsert bulk générique ─────────────────────────────────────
// Appelé par _sauvegarderEtatVersServeur qui envoie { items: [...] }
// Pour chaque item : update si existe, create sinon
async function upsertBulk(model, items, buildData) {
  if (!items?.length) return { ok: true, count: 0 };
  const results = await Promise.allSettled(
    items.map(item =>
      prisma[model].upsert({
        where:  { id: item.id },
        update: buildData(item),
        create: buildData(item),
      })
    )
  );
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
  return { ok: true, count: results.length, errors: errors.length ? errors : undefined };
}

// ── MAPPINGS ──────────────────────────────────────────────────
router.get('/mappings', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.mapping.findMany({ where: { orgId } });
    res.json(items.map(m => ({ id: m.id, name: m.name, rows: m.rules })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/mappings/:id', async (req, res) => {
  try {
    const item = await prisma.mapping.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, rows: item.rules });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/mappings', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('mapping', req.body.items, i => ({ id: i.id, orgId, name: i.name, rules: i.rows || [] }));
      return res.json(r);
    }
    const { id, name, rows } = req.body;
    const item = await prisma.mapping.upsert({
      where:  { id: id || '' },
      update: { name, rules: rows || [] },
      create: { id, orgId, name, rules: rows || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/mappings/:id', async (req, res) => {
  try {
    const { name, rows } = req.body;
    const item = await prisma.mapping.update({ where: { id: req.params.id }, data: { name, rules: rows || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/mappings/:id', async (req, res) => {
  try {
    await prisma.mapping.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PALNODES ──────────────────────────────────────────────────
router.get('/palnodes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.palNode.findMany({ where: { orgId } });
    res.json(items.map(p => ({ id: p.id, family: p.family, name: p.name, config: p.config })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/palnodes/:id', async (req, res) => {
  try {
    const item = await prisma.palNode.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, family: item.family, name: item.name, config: item.config });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/palnodes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('palNode', req.body.items, i => ({ id: i.id, orgId, family: i.family, name: i.name, config: i.config || {} }));
      return res.json(r);
    }
    const { id, family, name, config } = req.body;
    const item = await prisma.palNode.upsert({
      where:  { id: id || '' },
      update: { family, name, config: config || {} },
      create: { id, orgId, family, name, config: config || {} },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/palnodes/:id', async (req, res) => {
  try {
    const { name, config } = req.body;
    const item = await prisma.palNode.update({ where: { id: req.params.id }, data: { name, config: config || {} } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/palnodes/:id', async (req, res) => {
  try {
    await prisma.palNode.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── NOMMAGES ──────────────────────────────────────────────────
router.get('/nommages', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.nommage.findMany({ where: { orgId } });
    res.json(items.map(n => ({ id: n.id, name: n.name, description: '', steps: n.rules })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/nommages/:id', async (req, res) => {
  try {
    const item = await prisma.nommage.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, description: '', steps: item.rules });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/nommages', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('nommage', req.body.items, i => ({ id: i.id, orgId, name: i.name, rules: i.steps || [] }));
      return res.json(r);
    }
    const { id, name, steps } = req.body;
    const item = await prisma.nommage.upsert({
      where:  { id: id || '' },
      update: { name, rules: steps || [] },
      create: { id, orgId, name, rules: steps || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/nommages/:id', async (req, res) => {
  try {
    const { name, steps } = req.body;
    const item = await prisma.nommage.update({ where: { id: req.params.id }, data: { name, rules: steps || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/nommages/:id', async (req, res) => {
  try {
    await prisma.nommage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SCRIPTS ───────────────────────────────────────────────────
router.get('/scripts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.script.findMany({ where: { orgId } });
    res.json(items.map(s => ({ id: s.id, name: s.name, lang: s.lang, code: s.content, description: '' })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/scripts/:id', async (req, res) => {
  try {
    const item = await prisma.script.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, lang: item.lang, code: item.content, description: '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/scripts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('script', req.body.items, i => ({ id: i.id, orgId, name: i.name, lang: i.lang || 'javascript', content: i.code || '' }));
      return res.json(r);
    }
    const { id, name, lang, code } = req.body;
    const item = await prisma.script.upsert({
      where:  { id: id || '' },
      update: { name, lang: lang || 'javascript', content: code || '' },
      create: { id, orgId, name, lang: lang || 'javascript', content: code || '' },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/scripts/:id', async (req, res) => {
  try {
    const { name, lang, code } = req.body;
    const item = await prisma.script.update({ where: { id: req.params.id }, data: { name, lang, content: code || '' } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/scripts/:id', async (req, res) => {
  try {
    await prisma.script.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CONTACTS ──────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.contactList.findMany({ where: { orgId } });
    res.json(items.map(c => ({ id: c.id, name: c.name, contacts: c.contacts })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/contacts/:id', async (req, res) => {
  try {
    const item = await prisma.contactList.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, contacts: item.contacts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/contacts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('contactList', req.body.items, i => ({ id: i.id, orgId, name: i.name, contacts: i.contacts || [] }));
      return res.json(r);
    }
    const { id, name, contacts } = req.body;
    const item = await prisma.contactList.upsert({
      where:  { id: id || '' },
      update: { name, contacts: contacts || [] },
      create: { id, orgId, name, contacts: contacts || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/contacts/:id', async (req, res) => {
  try {
    const { name, contacts } = req.body;
    const item = await prisma.contactList.update({ where: { id: req.params.id }, data: { name, contacts: contacts || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contacts/:id', async (req, res) => {
  try {
    await prisma.contactList.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RUNS ─────────────────────────────────────────────────────
router.get('/runs', async (req, res) => {
  try {
    const envId  = await getDefaultEnvId();
    const flows  = await prisma.flow.findMany({ where: { envId }, select: { id: true } });
    const flowIds = flows.map(f => f.id);
    const runs   = await prisma.run.findMany({
      where:   { flowId: { in: flowIds } },
      orderBy: { startedAt: 'desc' },
      take:    500,
    });
    res.json(runs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ORGANISATION ─────────────────────────────────────────────
router.get('/organisation', async (req, res) => {
  try {
    const org = await prisma.organisation.findFirst();
    if (!org) return res.status(404).json({ error: 'Organisation non trouvée' });
    res.json({ id: org.id, name: org.name, slug: org.slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
