// APS — server/routes/environments.js — 2026-06-23

const express  = require('express');
const router   = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const crypto   = require('crypto');

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

function fmt(e, includeToken = false) {
  return {
    id:        e.id,
    name:      e.name,
    slug:      e.slug,
    type:      e.type,
    orgId:     e.orgId,
    platformId:e.platformId,
    baseUrl:   e.baseUrl,
    appId:     e.appId,
    token:     includeToken ? decrypt(e.tokenEnc) : undefined,
    hasToken:  !!e.tokenEnc,
    isDefault: e.isDefault,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// GET /api/environments
router.get('/', async (req, res) => {
  try {
    const envs = await prisma.environment.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(envs.map(e => fmt(e)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/environments/credentials — tous les envs actifs avec credentials déchiffrés
// Utilisé par le frontend pour alimenter appTokensData (format Iconik legacy)
// GET /api/environments/credentials — tous les envs avec credentials déchiffrés
// Utilisé par le frontend WFD pour alimenter appTokensData
router.get('/credentials', async (req, res) => {
  try {
    const envs = await prisma.environment.findMany({ orderBy: { createdAt: 'asc' } });
    const result = envs
      .filter(e => e.appId && e.tokenEnc)
      .map(e => ({
        name:        e.name,
        environment: e.type,
        iconikUrl:   e.baseUrl || 'https://app.iconik.io',
        appId:       e.appId,
        token:       decrypt(e.tokenEnc),
        envId:       e.id,
        isDefault:   e.isDefault,
      }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/environments/:id
router.get('/:id', async (req, res) => {
  try {
    const e = await prisma.environment.findUnique({ where: { id: req.params.id } });
    if (!e) return res.status(404).json({ error: 'Non trouvé' });
    res.json(fmt(e, true)); // inclure le token pour l'édition
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/environments
router.post('/', async (req, res) => {
  try {
    const { name, slug, type, orgId, platformId, baseUrl, appId, token, isDefault } = req.body;
    if (!name || !slug || !orgId) {
      return res.status(400).json({ error: 'name, slug et orgId sont obligatoires' });
    }
    if (isDefault) {
      await prisma.environment.updateMany({ where: { orgId }, data: { isDefault: false } });
    }
    const env = await prisma.environment.create({
      data: {
        name, slug, type: type || 'qa', orgId,
        platformId: platformId || null,
        baseUrl:    baseUrl   || null,
        appId:      appId     || null,
        tokenEnc:   token     ? encrypt(token) : null,
        isDefault:  !!isDefault,
      },
    });
    res.status(201).json(fmt(env));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/environments/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, slug, type, platformId, baseUrl, appId, token, isDefault } = req.body;
    const current = await prisma.environment.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Non trouvé' });
    if (isDefault) {
      await prisma.environment.updateMany({ where: { orgId: current.orgId }, data: { isDefault: false } });
    }
    // Si token vide, on conserve l'ancien
    const tokenEnc = token ? encrypt(token) : current.tokenEnc;
    const env = await prisma.environment.update({
      where: { id: req.params.id },
      data:  { name, slug, type: type || current.type, platformId: platformId || null, baseUrl: baseUrl || null, appId: appId || null, tokenEnc, isDefault: !!isDefault },
    });
    res.json(fmt(env));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/environments/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.environment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/environments/:id/test — tester la connexion Iconik
router.post('/:id/test', async (req, res) => {
  try {
    const e = await prisma.environment.findUnique({ where: { id: req.params.id } });
    if (!e) return res.status(404).json({ error: 'Non trouvé' });
    if (!e.baseUrl || !e.appId || !e.tokenEnc) {
      return res.status(400).json({ ok: false, message: 'URL, App ID et Token requis pour tester' });
    }
    const token = decrypt(e.tokenEnc);
    const r = await fetch(`${e.baseUrl}/API/assets/v1/assets/?page=1&per_page=1`, {
      headers: { 'App-ID': e.appId, 'Auth-Token': token },
    });
    if (r.ok) {
      res.json({ ok: true, message: 'Connexion Iconik réussie', status: r.status });
    } else {
      res.json({ ok: false, message: `Échec — HTTP ${r.status}`, status: r.status });
    }
  } catch(e) { res.status(500).json({ ok: false, message: e.message }); }
});

module.exports = router;
