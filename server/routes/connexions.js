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
        items.map(c => {
          const base = {
            name: c.name, type: c.type || 'listener',
            direction: c.direction || 'inbound',
            baseUrl: c.endpoint || null,
            authType: c.authType,
            authValueEnc: c.authValue ? encrypt(c.authValue) : null,
            extraConfig: { mappings: c.mappings || [], description: c.description || '' },
          };
          return prisma.connexion.upsert({
            where:  { id: c.id },
            // isActive : ne pas toucher au champ existant si non fourni explicitement (même
            // raisonnement que pour les flux, cf. server/routes/flows.js, bug du 07/07/2026).
            update: { ...base, ...(typeof c.isActive === 'boolean' ? { isActive: c.isActive } : {}) },
            create: { id: c.id, envId, ...base, isActive: typeof c.isActive === 'boolean' ? c.isActive : true },
          });
        })
      );
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
      return res.json({ ok: true, count: results.length, errors: errors.length ? errors : undefined });
    }

    const { id, name, type, direction, authType, authValue, mappings, description } = req.body;
    const endpoint = (req.body.endpoint || '').replace(/^\/+/, ''); // retirer les slashes parasites en début d'URL
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
    const { name, type, direction, authType, authValue, mappings, description, isActive } = req.body;
    const endpoint = (req.body.endpoint || '').replace(/^\/+/, ''); // retirer les slashes parasites en début d'URL
    const current = await prisma.connexion.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Non trouvé' });
    const conn = await prisma.connexion.update({
      where: { id: req.params.id },
      data: {
        name, type: type || current.type, direction: direction || current.direction,
        baseUrl: endpoint, authType,
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

// POST /api/connexions/:id/test — teste la connexion (handshake d'auth).
// Repris du bouton de test WFD qui fonctionne (testerConnexion,
// script-workflow-designer.js) : on ne tape pas la racine seule, on essaie des
// endpoints connus avec repli sur '/', et surtout on considere « API joignable »
// des que le serveur repond (status < 500) — un 401/403 prouve que l'API est LA
// (token juste invalide/refuse), donc joignable, PAS rouge. Rouge seulement si
// le serveur est injoignable (exception reseau) ou en erreur 5xx.
// Ce test valide la CONNEXION, pas un endpoint precis (tests d'endpoints -> nœuds
// / futur API Builder). aws_s3 non testable par handshake HTTP -> neutre.
router.post('/:id/test', async (req, res) => {
  try {
    const c = await prisma.connexion.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ ok: false, message: 'Non trouvé' });
    if (c.isActive === false) return res.json({ ok: false, state: 'inactive', message: 'Connexion inactive' });
    if (!c.baseUrl) return res.json({ ok: false, state: 'error', message: 'Aucune URL de base à tester' });
    if (c.authType === 'aws_s3') {
      return res.json({ ok: null, state: 'untestable', message: 'Type S3 : test non couvert par le handshake HTTP' });
    }

    // En-têtes : comme WFD (Content-Type + auth selon type).
    const headers = { 'Content-Type': 'application/json' };
    const secret = c.authValueEnc ? decrypt(c.authValueEnc) : null;
    if (secret) {
      if (c.authType === 'bearer' || c.authType === 'token') headers['Authorization'] = 'Bearer ' + secret;
      else if (c.authType === 'apikey_header' || c.authType === 'apikey') headers['X-API-Key'] = secret;
      else if (c.authType === 'basic') headers['Authorization'] = 'Basic ' + secret;
      else headers['Authorization'] = secret;
    }
    // Headers fixes stockés sur la connexion (comme WFD lit ceux du formulaire).
    const extra = (c.extraConfig && c.extraConfig.headers) || [];
    if (Array.isArray(extra)) {
      extra.forEach(function (h) { if (h && h.key) headers[h.key] = h.value || ''; });
    }

    const base = String(c.baseUrl).replace(/\/+$/, '');
    // Endpoints de test connus, repli sur '/'. Le premier qui repond (< 500)
    // suffit a prouver la joignabilite.
    const endpoints = (c.extraConfig && c.extraConfig.testPath)
      ? [c.extraConfig.testPath, '/']
      : ['/api/languages', '/api/genres', '/api/countries', '/'];

    let statusCode = null, joignable = false, netErr = null;
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(function () { ctrl.abort(); }, 8000);
        const r = await fetch(base + endpoints[i], { method: 'GET', headers: headers, signal: ctrl.signal });
        clearTimeout(to);
        statusCode = r.status;
        if (r.status < 500) { joignable = true; break; }   // 401/403 inclus : API là
      } catch (e) { netErr = e.message; }
    }

    if (!joignable) {
      return res.json({ ok: false, state: 'error',
        message: netErr ? ('Serveur injoignable — ' + netErr) : ('Erreur serveur (HTTP ' + statusCode + ')'),
        status: statusCode });
    }
    // Joignable. 200 = token valide ; 401/403 = joignable mais token/accès à revoir.
    if (statusCode === 401 || statusCode === 403) {
      return res.json({ ok: true, state: 'auth',
        message: 'API joignable, mais token invalide ou accès refusé (HTTP ' + statusCode + ')',
        status: statusCode });
    }
    return res.json({ ok: true, state: 'ok', message: 'Connexion réussie — API joignable', status: statusCode });
  } catch (e) {
    res.status(500).json({ ok: false, state: 'error', message: e.message });
  }
});

module.exports = router;
