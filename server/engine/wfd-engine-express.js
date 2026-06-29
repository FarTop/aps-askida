// ================================================================
// wfd-engine-express.js — Glue Express pour le WFD Engine
//
// Remplace wfd-engine-main.js (Electron/ipcMain) par une API
// Express + SSE pour les événements temps réel.
// ================================================================

'use strict';

const path       = require('path');
const express    = require('express');
const router     = express.Router();

const WfdEngine   = require(path.join(__dirname, 'wfd-engine.js'));
const WfdHandlers = require(path.join(__dirname, 'wfd-engine-handlers.js'));
const { createRunHistory } = require(path.join(__dirname, 'wfd-run-history.js'));

// ── État interne ─────────────────────────────────────────────────
let _engine     = null;
let _runHistory = null;
const _iconikClients = {};
const _sseClients    = [];

// ── Push événement vers tous les clients SSE ─────────────────────
function pushEvent(type, data) {
  const payload = JSON.stringify({ type, ...data, at: new Date().toISOString() });
  for (let i = _sseClients.length - 1; i >= 0; i--) {
    try { _sseClients[i].write(`data: ${payload}\n\n`); }
    catch(e) { _sseClients.splice(i, 1); }
  }
}

// ── Construire un client Iconik ──────────────────────────────────
function _buildIconikClient(cfg) {
  if (!cfg) return null;
  const https = require('https');
  const http  = require('http');

  const request = (method, ep, body) => new Promise((resolve, reject) => {
    const url     = new URL(ep, cfg.baseUrl || 'https://app.iconik.io');
    const lib     = url.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'App-ID'      : cfg.appId || '',
      'Auth-Token'  : cfg.token || cfg.appToken || '',
      'Content-Type': 'application/json',
      'Accept'      : 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = lib.request({
      hostname: url.hostname,
      port    : url.port || (url.protocol === 'https:' ? 443 : 80),
      path    : url.pathname + url.search,
      method, headers,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (res.statusCode >= 400) {
            const err = new Error(`Iconik ${method} ${ep} → ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = parsed;
            reject(err);
          } else resolve(parsed);
        } catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });

  return {
    get   : (ep)       => request('GET',    ep, null),
    post  : (ep, body) => request('POST',   ep, body),
    put   : (ep, body) => request('PUT',    ep, body),
    patch : (ep, body) => request('PATCH',  ep, body),
    delete: (ep)       => request('DELETE', ep, null),
  };
}

// ── Résoudre le client Iconik pour un flux/nœud ──────────────────
function _resolveIconikClient(node, flux) {
  // Priorité : config du nœud > env du flux > premier client disponible
  const envName = node?.config?.iconikEnv || flux?.iconikEnv || null;
  if (envName && _iconikClients[envName]) return _iconikClients[envName];
  // Fallback : premier client disponible
  const keys = Object.keys(_iconikClients);
  if (keys.length) return _iconikClients[keys[0]];
  return null;
}

// ── Initialiser le moteur ────────────────────────────────────────
function initEngine() {
  const os  = require('os');
  const fs  = require('fs');
  const dataDir = path.join(os.homedir(), '.aps', 'wfd');
  fs.mkdirSync(dataDir, { recursive: true });

  _runHistory = createRunHistory(dataDir, { maxRuns: 500, maxAgeDays: 90 });

  _engine = WfdEngine.createEngine({
    port        : 0,
    nodeHandlers: WfdHandlers,
    iconikClient: null,
    onEvent     : (type, data) => {
      pushEvent(type, data);
      if (_runHistory) _runHistory.service.handleEvent(type, data);
    },
  });

  if (_engine._trigger) {
    _engine._trigger._resolveClient = _resolveIconikClient;
  }

  _engine.start();
  console.log('[WFD Engine] Démarré (mode Express)');
}

// ── Charger les tokens Iconik via la route interne /api/environments/credentials
async function loadIconikClients() {
  try {
    // Réutilise la route qui fait déjà le déchiffrement AES
    const res  = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/environments/credentials');
    const envs = await res.json();
    if (!Array.isArray(envs)) {
      console.warn('[WFD Engine] /api/environments/credentials — réponse inattendue :', envs);
      return;
    }
    envs.forEach(env => {
      if (!env.token) return;
      _iconikClients[env.name] = _buildIconikClient({
        baseUrl: env.baseUrl || env.iconikUrl || 'https://app.iconik.io',
        appId  : env.appId  || '',
        token  : env.token,
      });
      console.log(`[WFD Engine] Client Iconik chargé : ${env.name}`);
    });
  } catch(e) {
    console.warn('[WFD Engine] Chargement clients Iconik échoué :', e.message);
  }
}

// ── Charger les flux actifs depuis la DB ─────────────────────────
async function loadActiveFluxes() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });

  try {
    const flows      = await prisma.flow.findMany({ where: { isActive: true }, include: { environment: true } });
    // Charger les connexions directement depuis Prisma + déchiffrement via module partagé
    const { decrypt } = require(path.join(__dirname, '../lib/crypto.js'));
    const connexionsRaw = await prisma.connexion.findMany();
    const connexionsFmt = connexionsRaw.map(c => ({
      id         : c.id,
      name       : c.name,
      type       : c.type,
      direction  : c.direction,
      endpoint   : c.baseUrl,
      authType   : c.authType,
      authValue  : decrypt(c.authValueEnc),
      mappings   : c.extraConfig?.mappings   || [],
      description: c.extraConfig?.description || '',
      isActive   : c.isActive,
    }));

    if (!_engine) return;

    _engine.loadFluxes(flows.map(f => ({
      id         : f.id,
      name       : f.name,
      nodes      : f.nodes       || [],
      connections: f.connections || [],
      isActive   : f.isActive,
      iconikEnv  : f.environment?.name || null,
    })));

    if (_engine._trigger?.loadConnexions) {
      _engine._trigger.loadConnexions(connexionsFmt);
    }
    WfdHandlers._connexions = connexionsFmt.filter(c => c.direction === 'outbound');

    if (_runHistory) _runHistory.service.setFluxes(flows);

    flows.forEach(f => _engine.activateFlux(f.id));
    console.log(`[WFD Engine] ${flows.length} flux actifs, ${connexionsFmt.length} connexions`);
  } catch(e) {
    console.warn('[WFD Engine] Chargement flux échoué :', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

// ── Démarrage complet ────────────────────────────────────────────
async function start() {
  initEngine();
  // Attendre que le serveur Express soit complètement prêt
  await new Promise(r => setTimeout(r, 2000));
  await loadIconikClients();
  await loadActiveFluxes();
}

function stop() {
  if (_engine) { _engine.stop(); _engine = null; }
}

// ════════════════════════════════════════════════════════════════
// ROUTES EXPRESS
// ════════════════════════════════════════════════════════════════

// ── SSE — événements temps réel vers l'UI ────────────────────────
router.get('/events', (req, res) => {
  // Désactiver la compression gzip — incompatible avec SSE (bufferisation)
  req.headers['accept-encoding'] = 'identity';
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch(_) {}
  }, 30000);

  _sseClients.push(res);
  console.log(`[WFD SSE] Client connecté (total: ${_sseClients.length})`);

  req.on('close', () => {
    clearInterval(ping);
    const idx = _sseClients.indexOf(res);
    if (idx >= 0) _sseClients.splice(idx, 1);
    console.log(`[WFD SSE] Client déconnecté (total: ${_sseClients.length})`);
  });
});

// ── POST /wfd/action/:slug — Custom Action Iconik ────────────────
router.post('/action/:slug', (req, res) => {
  const slug = req.params.slug;
  console.log(`[WFD] Custom Action reçue → /wfd/action/${slug}`);

  if (!_engine) return res.status(503).json({ error: 'WFD Engine non initialisé' });

  const fluxes  = _engine._getFluxes?.() || [];
  const matched = fluxes.filter(flux => {
    if (!_engine.isActive(flux.id)) return false;
    const trigger = flux.nodes?.find(n => ['trigger','listener'].includes(n.family));
    if (!trigger) return false;
    const cfg      = trigger.config || {};
    const fluxSlug = (cfg.wfdSlug || cfg.customActionId || '').trim();
    return fluxSlug === slug || flux.id === slug;
  });

  if (!matched.length) {
    console.warn(`[WFD] Aucun flux actif pour le slug "${slug}"`);
    return res.status(404).json({ error: `Aucun flux actif pour "${slug}"` });
  }

  // Répondre immédiatement à Iconik (timeout court)
  res.json({ received: true, fluxes: matched.length });

  const payload    = req.body || {};
  const WfdTrigger = require(path.join(__dirname, 'wfd-engine-trigger.js'));
  const WfdExecutor = require(path.join(__dirname, 'wfd-engine-executor.js'));

  const isCustomAction = !!(payload.auth_token && (
    payload.asset_ids !== undefined || payload.object_id
  ));

  for (const flux of matched) {
    const onEvent = (type, data) => {
      pushEvent(type, data);
      if (_runHistory) _runHistory.service.handleEvent(type, data);
    };

    const runFlux = (normalizedPayload) => {
      WfdExecutor.executeFlux(
        flux, normalizedPayload, WfdHandlers,
        _resolveIconikClient(null, flux),
        onEvent, _resolveIconikClient
      ).catch(err => console.error(`[WFD] Erreur flux "${flux.name}" :`, err.message));
    };

    if (isCustomAction) {
      Promise.resolve(_dispatchCustomAction(payload, flux, runFlux, WfdTrigger))
        .catch(err => console.error(`[WFD] _dispatchCustomAction erreur "${flux.name}" :`, err.message));
    } else {
      console.log(`[WFD] runFlux direct — flux "${flux.name}"`);
      runFlux(WfdTrigger.normalizeIconikPayload(payload));
    }
  }
});

// ── GET /wfd/action/:slug/test — Test de connexion env ───────────
router.get('/action/:slug/test', async (req, res) => {
  const slug = req.params.slug;
  if (!_engine) return res.json({ ok: false, error: 'Engine non initialisé' });

  const fluxes = _engine._getFluxes?.() || [];
  const flux   = fluxes.find(f => {
    const trigger  = f.nodes?.find(n => ['trigger','listener'].includes(n.family));
    const cfg      = trigger?.config || {};
    const fluxSlug = (cfg.wfdSlug || cfg.customActionId || '').trim();
    return fluxSlug === slug || f.id === slug;
  });

  if (!flux) return res.json({ ok: false, error: `Flux "${slug}" non trouvé`, active: false });

  const isActive  = _engine.isActive(flux.id);
  const envName   = flux.iconikEnv || null;
  const hasClient = envName ? !!_iconikClients[envName] : false;

  // Ping Iconik si client disponible
  let iconikReachable = null;
  if (hasClient) {
    try {
      await _iconikClients[envName].get('/API/assets/v1/assets/?per_page=1');
      iconikReachable = true;
    } catch(e) {
      iconikReachable = false;
    }
  }

  res.json({ ok: isActive && hasClient, fluxId: flux.id, fluxName: flux.name,
             active: isActive, env: envName, hasClient, iconikReachable });
});

// ── POST /wfd/trigger-manual ─────────────────────────────────────
router.post('/trigger-manual', async (req, res) => {
  const { fluxId, payload } = req.body || {};
  if (!_engine) return res.status(503).json({ error: 'Engine non initialisé' });
  try {
    const ctx = await _engine.triggerManual(fluxId, payload || {});
    res.json({ status: ctx?.status || 'success', runId: ctx?.runId || '',
               fluxId: ctx?.fluxId || fluxId, vars: ctx?.vars || {}, errors: ctx?.errors || [] });
  } catch(err) {
    res.status(500).json({ status: 'failed', error: err.message });
  }
});

// ── POST /wfd/load-fluxes ────────────────────────────────────────
router.post('/load-fluxes', async (req, res) => {
  try { await loadActiveFluxes(); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /wfd/activate/:fluxId ───────────────────────────────
router.post('/activate/:fluxId', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });
  try {
    await prisma.flow.update({ where: { id: req.params.fluxId }, data: { isActive: true } });
    if (_engine) _engine.activateFlux(req.params.fluxId);
    res.json({ ok: true, fluxId: req.params.fluxId, isActive: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// ── POST /wfd/deactivate/:fluxId ─────────────────────────────
router.post('/deactivate/:fluxId', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });
  try {
    await prisma.flow.update({ where: { id: req.params.fluxId }, data: { isActive: false } });
    if (_engine) _engine.deactivateFlux(req.params.fluxId);
    res.json({ ok: true, fluxId: req.params.fluxId, isActive: false });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// ── POST /wfd/load-connexions ────────────────────────────────────
router.post('/load-connexions', (req, res) => {
  const connexions = req.body?.connexions || [];
  WfdHandlers._connexions = connexions.filter(c => c.direction === 'outbound');
  if (_engine._trigger?.loadConnexions) _engine._trigger.loadConnexions(connexions);
  res.json({ ok: true, count: connexions.length });
});

// ── POST /wfd/set-iconik-client ──────────────────────────────────
router.post('/set-iconik-client', (req, res) => {
  const cfg = req.body || {};
  if (cfg.envName) {
    _iconikClients[cfg.envName] = _buildIconikClient(cfg);
    console.log(`[WFD Engine] Client Iconik mis à jour : ${cfg.envName}`);
  }
  res.json({ ok: true });
});

// ── GET /wfd/status ──────────────────────────────────────────────
router.get('/status', (req, res) => {
  const fluxes  = _engine?._getFluxes?.() || [];
  const actives = fluxes.filter(f => _engine?.isActive(f.id));
  res.json({ running: !!_engine, activeFluxes: actives.length,
             totalFluxes: fluxes.length, envs: Object.keys(_iconikClients),
             sseClients: _sseClients.length });
});

// ── GET /wfd/paused ──────────────────────────────────────────────
router.get('/paused', (req, res) => {
  const WfdExecutor = require(path.join(__dirname, 'wfd-engine-executor.js'));
  const paused = WfdExecutor._wfdPaused || {};
  res.json(Object.entries(paused).map(([key, p]) => ({
    key, runId: p.runId, nodeId: p.nodeId,
    ports: p.ports, assets: p.assets, timeoutMs: p.timeoutMs,
  })));
});

// ── POST /wfd/release-node ───────────────────────────────────────
router.post('/release-node', (req, res) => {
  const { runId, nodeId, port, assetIds } = req.body || {};
  const WfdExecutor = require(path.join(__dirname, 'wfd-engine-executor.js'));
  const ok = WfdExecutor.releaseNode(runId, nodeId, port ?? 0, assetIds || null);
  res.json({ ok, runId, nodeId, port });
});

// ── POST /wfd/reject-node ────────────────────────────────────────
router.post('/reject-node', (req, res) => {
  const { runId, nodeId, reason } = req.body || {};
  const WfdExecutor = require(path.join(__dirname, 'wfd-engine-executor.js'));
  const ok = WfdExecutor.rejectNode(runId, nodeId, reason || 'Annulé');
  res.json({ ok });
});

// ── Runs ─────────────────────────────────────────────────────────
router.get('/runs/:runId', (req, res) => {
  const run = _runHistory?.store.getRun(req.params.runId) || null;
  if (!run) return res.status(404).json({ error: 'Run non trouvé' });
  res.json(run);
});

router.get('/runs-by-flux/:fluxId', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(_runHistory?.store.getRunsByFlux(req.params.fluxId, limit) || []);
});

router.get('/runs-by-node/:nodeId', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(_runHistory?.store.getRunsByNode(req.params.nodeId, limit) || []);
});

router.get('/recent-runs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(_runHistory?.store.getRecentRuns(limit) || []);
});

router.delete('/runs/:runId', (req, res) => {
  const ok = _runHistory?.store.deleteRun(req.params.runId) || false;
  res.json({ ok });
});

// ── Helpers ──────────────────────────────────────────────────────
function _dispatchCustomAction(raw, flux, runFlux, WfdTrigger) {
  const context = (raw.context || raw.object_type || 'ASSET').toUpperCase();

  if (context === 'COLLECTION') {
    const collectionId = (Array.isArray(raw.collection_ids) ? raw.collection_ids[0] : null) || raw.object_id || '';
    const client = _buildTempClient(raw);
    client.get(`/API/assets/v1/collections/${collectionId}/content/?object_types=assets&per_page=200`)
      .then(data => {
        const assets = (data.objects || []).filter(o => !o.object_type || o.object_type === 'assets');
        if (!assets.length) return;
        for (const asset of assets) {
          runFlux(WfdTrigger.normalizeIconikPayload({
            ...raw, asset_ids: [asset.id || asset.object_id],
            object_type: 'assets', _collection_id: collectionId,
          }));
        }
      })
      .catch(() => runFlux(WfdTrigger.normalizeIconikPayload(raw)));
  } else {
    const assetIds = Array.isArray(raw.asset_ids) && raw.asset_ids.length
      ? raw.asset_ids : (raw.object_id ? [raw.object_id] : []);
    for (const assetId of assetIds) {
      runFlux(WfdTrigger.normalizeIconikPayload({ ...raw, asset_ids: [assetId] }));
    }
  }
}

function _buildTempClient(raw) {
  const https = require('https');
  const http  = require('http');
  const request = (method, p, body) => new Promise((resolve, reject) => {
    const url = new URL(p, 'https://app.iconik.io');
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { 'App-ID': raw.app_id || '', 'Auth-Token': raw.auth_token || '', 'Content-Type': 'application/json' };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = lib.request({
      hostname: url.hostname, port: url.port || 443,
      path: url.pathname + url.search, method, headers,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(_) { resolve(d); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
  return {
    get : p    => request('GET',  p, null),
    post: (p,b) => request('POST', p, b),
  };
}

// ── Export ───────────────────────────────────────────────────────
module.exports = { router, start, stop, pushEvent };
