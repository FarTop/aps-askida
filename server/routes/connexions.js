// APS — server/routes/connexions.js — 2026-06-24
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const crypto = require('crypto');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

function encrypt(text) {
  if (!text) return null;
  const key    = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decrypt(text) {
  if (!text) return '';
  try {
    const key      = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch { return ''; }
}

async function getDefaultEnvId() {
  const env = await prisma.environment.findFirst({ where: { isDefault: true } });
  return env?.id;
}

function fmt(c) {
  return {
    id: c.id, name: c.name, type: c.type, direction: c.direction,
    endpoint: c.baseUrl, authType: c.authType,
    authValue: decrypt(c.authValueEnc),
    mappings: c.extraConfig?.mappings || [],
    description: c.extraConfig?.description || '',
    isActive: c.isActive,
  };
}

// GET /api/connexions
router.get('/', async (req, res) => {
  try {
    const envId = await getDefaultEnvId();
    const conns = await prisma.connexion.findMany({ where: { envId } });
    res.json(conns.map(fmt));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/connexions/:id
router.get('/:id', async (req, res) => {
  try {
    const c = await prisma.connexion.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Non trouvé' });
    res.json(fmt(c));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/connexions — création unitaire ou bulk { items: [...] }
router.post('/', async (req, res) => {
  try {
    const envId = await getDefaultEnvId();

    if (req.body.items) {
      const items = req.body.items;
      if (!items.length) return res.json({ ok: true, count: 0 });
      const results = await Promise.allSettled(
        items.map(c =>
          prisma.connexion.upsert({
            where:  { id: c.id },
            update: {
              name: c.name, type: c.type || 'listener',
              direction: c.direction || 'inbound',
              baseUrl: c.endpoint || null,
              authType: c.authType,
              authValueEnc: c.authValue ? encrypt(c.authValue) : null,
              extraConfig: { mappings: c.mappings || [], description: c.description || '' },
              isActive: c.isActive !== false,
            },
            create: {
              id: c.id, envId, name: c.name, type: c.type || 'listener',
              direction: c.direction || 'inbound',
              baseUrl: c.endpoint || null,
              authType: c.authType,
              authValueEnc: c.authValue ? encrypt(c.authValue) : null,
              extraConfig: { mappings: c.mappings || [], description: c.description || '' },
              isActive: c.isActive !== false,
            },
          })
        )
      );
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
      return res.json({ ok: true, count: results.length, errors: errors.length ? errors : undefined });
    }

    const { id, name, type, direction, endpoint, authType, authValue, mappings, description } = req.body;
    const conn = await prisma.connexion.upsert({
      where:  { id: id || '' },
      update: { name, type: type || 'listener', direction: direction || 'inbound', baseUrl: endpoint, authType, authValueEnc: authValue ? encrypt(authValue) : null, extraConfig: { mappings: mappings || [], description: description || '' } },
      create: { id, envId, name, type: type || 'listener', direction: direction || 'inbound', baseUrl: endpoint, authType, authValueEnc: authValue ? encrypt(authValue) : null, extraConfig: { mappings: mappings || [], description: description || '' } },
    });
    res.status(201).json(fmt(conn));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/connexions/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, endpoint, authType, authValue, mappings, description, isActive } = req.body;
    const current = await prisma.connexion.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Non trouvé' });
    const conn = await prisma.connexion.update({
      where: { id: req.params.id },
      data: {
        name, baseUrl: endpoint, authType,
        authValueEnc: authValue ? encrypt(authValue) : current.authValueEnc,
        extraConfig: { mappings: mappings || [], description: description || '' },
        isActive,
      },
    });
    res.json(fmt(conn));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/connexions/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.connexion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
