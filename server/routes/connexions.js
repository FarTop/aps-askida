// APS — server/routes/connexions.js — 2026-06-24
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const crypto = require('crypto');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const Acces = require('../lib/connexion-acces.js');
const { getOrgContext } = require('../lib/org-context');

// Org de la requête (contexte : cookie/header X-Org-Id, sinon repli première
// org). Additif : WFD sans contexte -> repli -> comportement équivalent.
async function orgIdDeContexte(req) {
  const ctx = await getOrgContext(req, prisma);
  return ctx.orgId;
}

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
    // Quel outil est au bout, et les valeurs non secrètes que son schéma
    // réclame (zone Make, App ID Iconik…). Le secret reste dans `authValue`,
    // déchiffré comme avant — même exposition qu'auparavant, pas davantage.
    platformId: c.platformId || null,
    champs: c.extraConfig?.champs || {},
    isActive: c.isActive,
  };
}

// GET /api/connexions — filtrées par l'organisation du contexte (décision A).
// Repli sur la première org pour WFD (sans contexte) : équivalent à avant, car
// l'env par défaut de WFD appartient à cette org.
router.get('/', async (req, res) => {
  try {
    const orgId = await orgIdDeContexte(req);
    const conns = await prisma.connexion.findMany({ where: { orgId } });
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
    const orgId = await orgIdDeContexte(req);   // Temps 1 : on renseigne les deux

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
            create: { id: c.id, envId, orgId, ...base, isActive: typeof c.isActive === 'boolean' ? c.isActive : true },
          });
        })
      );
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
      return res.json({ ok: true, count: results.length, errors: errors.length ? errors : undefined });
    }

    const { id, name, type, direction, authType, authValue, platformId } = req.body;
    const endpoint = (req.body.endpoint || '').replace(/^\/+/, ''); // retirer les slashes parasites en début d'URL
    const actuel = id ? await prisma.connexion.findUnique({ where: { id } }) : null;
    const extra  = _fusionnerExtra(actuel && actuel.extraConfig, req.body);
    const conn = await prisma.connexion.upsert({
      where:  { id: id || '' },
      update: { name, type: type || 'listener', direction: direction || 'inbound', baseUrl: endpoint, authType,
                platformId: platformId || null,
                authValueEnc: authValue ? encrypt(authValue) : (actuel ? actuel.authValueEnc : null),
                extraConfig: extra },
      create: { id, envId, orgId, name, type: type || 'listener', direction: direction || 'inbound', baseUrl: endpoint, authType,
                platformId: platformId || null,
                authValueEnc: authValue ? encrypt(authValue) : null,
                extraConfig: extra },
    });
    res.status(201).json(fmt(conn));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// `extraConfig` était réécrit en entier à chaque enregistrement
// (`{mappings, description}`), ce qui effaçait silencieusement tout le reste.
// On FUSIONNE désormais avec l'existant, et `champs` porte les valeurs non
// secrètes réclamées par le schéma de la plateforme (zone Make, App ID
// Iconik…) — le secret, lui, continue d'aller dans authValueEnc, chiffré.
function _fusionnerExtra(actuel, corps) {
  const base = (actuel && typeof actuel === 'object') ? { ...actuel } : {};
  if (corps.mappings    !== undefined) base.mappings    = corps.mappings || [];
  if (corps.description !== undefined) base.description = corps.description || '';
  if (corps.champs      !== undefined) base.champs      = { ...(base.champs || {}), ...(corps.champs || {}) };
  return base;
}

// PUT /api/connexions/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, type, direction, authType, authValue, isActive, platformId } = req.body;
    const endpoint = (req.body.endpoint || '').replace(/^\/+/, ''); // retirer les slashes parasites en début d'URL
    const current = await prisma.connexion.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Non trouvé' });
    const conn = await prisma.connexion.update({
      where: { id: req.params.id },
      data: {
        name, type: type || current.type, direction: direction || current.direction,
        baseUrl: endpoint, authType,
        platformId: platformId !== undefined ? (platformId || null) : current.platformId,
        authValueEnc: authValue ? encrypt(authValue) : current.authValueEnc,
        extraConfig: _fusionnerExtra(current.extraConfig, req.body),
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
    const c = await prisma.connexion.findUnique({ where: { id: req.params.id }, include: { platform: true } });
    if (!c) return res.status(404).json({ ok: false, message: 'Non trouvé' });
    if (c.isActive === false) return res.json({ ok: false, state: 'inactive', message: 'Connexion inactive' });
    if (c.authType === 'aws_s3') {
      return res.json({ ok: null, state: 'untestable', message: 'Type S3 : test non couvert par le handshake HTTP' });
    }

    // Depuis le 2026-08-10 : quand la connexion pointe vers une plateforme qui
    // déclare un schéma (Platform.authSpec), l'URL et les en-têtes en découlent.
    // Sinon, repli exact sur l'ancien comportement — aucune connexion existante
    // ne change de façon d'être testée.
    const authSpec = c.platform && c.platform.authSpec;
    const manquants = authSpec ? Acces.champsManquants({ ...c, authValue: c.authValueEnc ? decrypt(c.authValueEnc) : '' }, authSpec) : [];
    if (manquants.length) {
      return res.json({ ok: false, state: 'error',
        message: 'Champs requis non renseignés : ' + manquants.join(', ') });
    }
    const calcul = Acces.acces({
      baseUrl: c.baseUrl, authType: c.authType, extraConfig: c.extraConfig,
      authValue: c.authValueEnc ? decrypt(c.authValueEnc) : null,
      headers: (c.extraConfig && c.extraConfig.headers) || [],
    }, authSpec);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, calcul.headers);
    const base = calcul.baseUrl;
    if (!base) return res.json({ ok: false, state: 'error', message: 'Aucune URL de base à tester' });
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
