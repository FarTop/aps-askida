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
let _fluxesReady = false; // true une fois loadActiveFluxes() terminée avec succès
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
      console.log(`[WFD Engine] Client Iconik chargé : ${env.name} | appId: ${env.appId} | token: ${env.token?.slice(0,20)}...`);
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
      roles      : c.extraConfig?.roles    || [],
      actions    : c.extraConfig?.actions  || [],
      mappings   : c.extraConfig?.mappings || [],
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
    console.log('[DEBUG loadActiveFluxes] WfdHandlers._connexions juste après affectation :',
      WfdHandlers._connexions.map(c => c.id + '|' + c.name));
    console.log('[DEBUG loadActiveFluxes] WfdHandlers === (référence identique ?) via typeof/keys:',
      typeof WfdHandlers, Object.keys(WfdHandlers).length, 'clés');

    // Charger les nommages depuis la DB
    const nommages = await prisma.nommage.findMany();
    WfdHandlers._nommages = nommages.map(n => ({
      id         : n.id,
      name       : n.name,
      description: n.description || '',
      steps      : n.rules || [],
    }));

    if (_runHistory) _runHistory.service.setFluxes(flows);

    flows.forEach(f => _engine.activateFlux(f.id));
    _fluxesReady = true;
    console.log(`[WFD Engine] pid=${process.pid} ${flows.length} flux actifs, ${connexionsFmt.length} connexions`);
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
  await _initNommageTemplates();
  await loadActiveFluxes();
}

// ── Créer les templates de nommage prédéfinis s'ils n'existent pas ───────────
async function _initNommageTemplates() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });
  try {
    const existing = await prisma.nommage.findFirst({ where: { name: 'Amazon Prime' } });
    if (!existing) {
      const orgId = await _getDefaultOrgId(prisma);
      if (!orgId) return;
      await prisma.nommage.create({
        data: {
          id    : 'nom-amazon-prime',
          name  : 'Amazon Prime',
          orgId,
          rules      : [
            { type: 'template', value: '{Titre}_{artwork}.{ext}' },
            { type: 'replace',  value: ' → _' },
            { type: 'replace',  value: '. → _' },
            { type: 'remove',   value: '[^a-zA-Z0-9_.]' },
            { type: 'replace',  value: '__+ → _' },
          ],
        },
      });
      console.log('[WFD Engine] Template nommage "Amazon Prime" créé');
    }
  } catch(e) {
    console.warn('[WFD Engine] Init templates nommage :', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function _getDefaultOrgId(prisma) {
  try {
    const org = await prisma.organisation.findFirst();
    return org?.id || null;
  } catch(_) { return null; }
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
  console.log(`[WFD] pid=${process.pid} Custom Action reçue → /wfd/action/${slug}`);

  if (!_engine) return res.status(503).json({ error: 'WFD Engine non initialisé' });
  if (!_fluxesReady) {
    console.warn(`[WFD] Action reçue pendant le chargement des flux (pas encore prêt) → /wfd/action/${slug}`);
    return res.status(503).json({ error: 'WFD Engine en cours de démarrage — flux pas encore chargés, réessayez dans quelques secondes' });
  }

  const fluxes  = _engine._getFluxes?.() || [];
  console.log('[WFD DEBUG] fluxes en mémoire:', fluxes.length, '| actifs:', fluxes.filter(f => _engine.isActive(f.id)).map(f => f.name + '/' + f.nodes?.find(n=>n.family==='trigger')?.config?.wfdSlug));
  console.log('[WFD DEBUG] payload reçu:', JSON.stringify(req.body).slice(0, 300));
  console.log('[WFD DEBUG] isCustomAction sera:', !!(  (req.body.auth_token && (req.body.asset_ids !== undefined || req.body.object_id)) || (req.body.collection_ids !== undefined && req.body.context === 'COLLECTION') ));
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

  const isCustomAction = !!(
    (payload.auth_token && (payload.asset_ids !== undefined || payload.object_id)) ||
    (payload.collection_ids !== undefined && payload.context === 'COLLECTION')
  );

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
    let ctx;
    // Chemin rapide : le flux est actif, déjà dans le cache du moteur
    const activeFluxes = _engine._getFluxes?.() || [];
    if (activeFluxes.some(f => f.id === fluxId)) {
      ctx = await _engine.triggerManual(fluxId, payload || {});
    } else {
      // Le flux n'est pas actif — le recharger directement depuis la DB.
      // Permet de tester un déclencheur/run manuel SANS avoir à activer le
      // flux au préalable (l'activer aurait un effet de bord réel : le flux
      // se mettrait à écouter les vrais événements entrants).
      const { PrismaClient } = require('@prisma/client');
      const { PrismaPg }     = require('@prisma/adapter-pg');
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma  = new PrismaClient({ adapter });
      let flowRow;
      try {
        flowRow = await prisma.flow.findUnique({ where: { id: fluxId }, include: { environment: true } });
      } finally {
        await prisma.$disconnect();
      }
      if (!flowRow) return res.status(404).json({ status: 'failed', error: 'Flux introuvable — ' + fluxId });
      const flux = {
        id: flowRow.id, name: flowRow.name, nodes: flowRow.nodes || [], connections: flowRow.connections || [],
        isActive: flowRow.isActive, iconikEnv: flowRow.environment?.name || null,
      };
      ctx = await _engine._trigger._runFlux(flux, {
        _manual: true, _triggeredAt: new Date().toISOString(), ...(payload || {}),
      });
    }
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
    if (_engine) {
      _engine.activateFlux(req.params.fluxId);
      // Insérer/mettre à jour ce flux précis dans le registre du moteur (_fluxes),
      // indépendamment de tout appel loadFluxes() antérieur qui n'aurait pas pu
      // le voir actif (ordre d'appel côté client) — garantit que le moteur a bien
      // les nodes/connections à jour pour l'exécuter, pas seulement son id marqué actif.
      const full = await prisma.flow.findUnique({ where: { id: req.params.fluxId }, include: { environment: true } });
      if (full) {
        _engine.upsertFlux({
          id: full.id, name: full.name, nodes: full.nodes || [], connections: full.connections || [],
          isActive: full.isActive, iconikEnv: full.environment?.name || null,
        });
      }
    }
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
    if (_engine) { _engine.deactivateFlux(req.params.fluxId); _engine.removeFlux(req.params.fluxId); }
    res.json({ ok: true, fluxId: req.params.fluxId, isActive: false });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// ── POST /wfd/load-connexions ────────────────────────────────────
router.post('/load-connexions', (req, res) => {
  const connexions = req.body?.connexions || [];
  console.log('[DEBUG load-connexions] reçu:', connexions.map(c => c.id + '|' + c.name + '|' + c.direction + '|' + c.authType));
  WfdHandlers._connexions = connexions.filter(c => c.direction === 'outbound');
  console.log('[DEBUG load-connexions] outbound:', WfdHandlers._connexions.map(c => c.id + '|' + c.name));
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
router.get('/status', async (req, res) => {
  const activeFluxes = _engine?._trigger?.getActiveCount?.() ?? 0;
  let totalFluxes = null;
  try {
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg }     = require('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma  = new PrismaClient({ adapter });
    totalFluxes = await prisma.flow.count();
    await prisma.$disconnect();
  } catch (e) {
    // Si la DB est indisponible, on ne bloque pas le status — juste totalFluxes à null
    totalFluxes = _engine?._getFluxes?.()?.length ?? null;
  }
  res.json({ running: !!_engine, fluxesReady: _fluxesReady, activeFluxes,
             totalFluxes, envs: Object.keys(_iconikClients),
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

// ── GET /wfd/saved-searches/:envName ──────────────────────────────
// Récupère les Saved Searches DIRECTEMENT depuis Iconik (jamais depuis le
// snapshot DB) pour le bouton 'Actualiser depuis Iconik' du nœud Fetch.
// Deux raisons de passer par le serveur plutôt qu'un fetch() direct client :
//  1. CORS — Iconik n'autorise pas les appels navigateur cross-origin.
//  2. Le proxy générique /api/iconik/:env/... sert CE chemin précis depuis
//     le snapshot DB (potentiellement périmé) — on veut ici explicitement
//     la liste la plus à jour, donc un appel direct à l'API réelle.
router.get('/saved-searches/:envName', async (req, res) => {
  const client = _iconikClients[req.params.envName];
  if (!client) return res.status(404).json({ error: `Client Iconik introuvable pour l'environnement "${req.params.envName}"` });
  try {
    const data = await client.get('/API/search/v1/search/saved/?per_page=200');
    res.json({ ok: true, objects: data?.objects || [] });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ── POST /wfd/reject-node ────────────────────────────────────────
router.post('/reject-node', (req, res) => {
  const { runId, nodeId, reason } = req.body || {};
  const WfdExecutor = require(path.join(__dirname, 'wfd-engine-executor.js'));
  const ok = WfdExecutor.rejectNode(runId, nodeId, reason || 'Annulé');
  res.json({ ok });
});

// ── POST /wfd/listener-test ───────────────────────────────────────
// Simule un appel entrant réel vers un listener, en passant par le serveur
// (proxy) plutôt que depuis le navigateur directement, pour éviter le CORS
// (le serveur trigger sur le port 2880 ne pose pas d'en-têtes CORS).
router.post('/listener-test', async (req, res) => {
  const { connexionId, payload } = req.body || {};
  if (!_engine) return res.status(503).json({ error: 'Engine non initialisé' });
  const conn = _engine._trigger?._getConnexion?.(connexionId);
  if (!conn) return res.status(404).json({ error: 'Connexion introuvable — ' + connexionId });
  if (!conn.endpoint) return res.status(400).json({ error: 'Cette connexion n\'a pas d\'endpoint configuré' });

  const bodyStr = JSON.stringify(payload || {});
  const headers = { 'Content-Type': 'application/json' };
  let url = 'http://localhost:2880' + conn.endpoint;

  switch (conn.authType) {
    case 'bearer':
      headers['Authorization'] = 'Bearer ' + (conn.authValue || '');
      break;
    case 'basic':
      headers['Authorization'] = 'Basic ' + Buffer.from(conn.authValue || '').toString('base64');
      break;
    case 'apikey_header':
      headers['x-api-key'] = conn.authValue || '';
      break;
    case 'apikey_query':
      url += (conn.endpoint.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(conn.authValue || '');
      break;
    case 'hmac': {
      const crypto = require('crypto');
      headers['x-signature'] = 'sha256=' + crypto.createHmac('sha256', conn.authValue || '').update(bodyStr).digest('hex');
      break;
    }
    default: break; // 'none' — aucun en-tête supplémentaire
  }

  try {
    const response = await globalThis.fetch(url, { method: 'POST', headers, body: bodyStr });
    const text = await response.text();
    res.json({ ok: true, status: response.status, body: text });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Impossible de contacter le serveur listener (port 2880) — ' + e.message });
  }
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
    // La collection cliquée EST le contexte du run — pas de fan-out vers ses
    // assets enfants. Comportement volontaire (cf. investigation du 10/07/2026,
    // job "AJOUTER ID SERIE" : un seul run, la collection ne bouge pas ses enfants).
    const collectionId = (Array.isArray(raw.collection_ids) ? raw.collection_ids[0] : null) || raw.object_id || '';
    runFlux(WfdTrigger.normalizeIconikPayload({
      ...raw, collection_ids: [collectionId],
      object_type: 'COLLECTION', context: 'COLLECTION',
    }));
  } else {
    const assetIds = Array.isArray(raw.asset_ids) && raw.asset_ids.length
      ? raw.asset_ids : (raw.object_id ? [raw.object_id] : []);
    for (const assetId of assetIds) {
      runFlux(WfdTrigger.normalizeIconikPayload({ ...raw, asset_ids: [assetId] }));
    }
  }
}

// ── Export ───────────────────────────────────────────────────────
module.exports = { router, start, stop, pushEvent, isReady: () => _fluxesReady };
