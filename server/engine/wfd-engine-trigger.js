// ================================================================
// wfd-engine-trigger.js — Sources de déclenchement WFD
//
// Responsabilités :
//   - Serveur HTTP pour les webhooks Iconik
//   - Watchfolder local (chokidar ou fs.watch natif)
//   - Déclenchement manuel
//   - Mapping payload brut → contexte métier normalisé
// ================================================================

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── Classe principale du serveur de triggers ────────────────────
class WfdTriggerServer {
  constructor(options = {}) {
    this.port      = options.port ?? 2880;
    this.executor  = options.executor;   // WfdExecutor
    this.getFluxes = options.getFluxes;  // fn() → [flux]
    this.iconikClient = options.iconikClient;
    // Permettre la mise à jour du client sans recréer le server
    this._setIconikClient = (client) => { this.iconikClient = client; };
    this.nodeHandlers = options.nodeHandlers;
    this.onEvent   = options.onEvent || (() => {});

    this._server      = null;
    this._watchers    = [];
    this._activeFluxes = new Set(); // IDs des flux activés
  }

  // ── Démarrer le serveur HTTP ─────────────────────────────────
  start() {
    // Port 0 = mode Express — pas de serveur HTTP standalone
    if (!this.port) {
      console.log('[WFD Engine] Mode Express — serveur HTTP interne désactivé');
      return this;
    }
    this._server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
    this._server.listen(this.port, () => {
      console.log(`[WFD Engine] Serveur démarré sur le port ${this.port}`);
    });
    return this;
  }

  stop() {
    this._watchers.forEach(w => { try { w.close(); } catch(_) {} });
    this._watchers = [];
    if (this._server) this._server.close();
  }

  // ── Activer / désactiver un flux ─────────────────────────────
  activateFlux(fluxId) {
    this._activeFluxes.add(fluxId);
    this.onEvent('flux:activated', { fluxId });
  }

  deactivateFlux(fluxId) {
    this._activeFluxes.delete(fluxId);
    this.onEvent('flux:deactivated', { fluxId });
  }

  isActive(fluxId) {
    return this._activeFluxes.has(fluxId);
  }

  // ── Compte/liste des flux actifs — source de vérité unique, indépendante
  // de _fluxes (qui ne reflète que le dernier chargement DB, potentiellement
  // périmé d'une activation — cf. bug activeFluxes désynchronisé 07/07/2026) ──
  getActiveCount() {
    return this._activeFluxes.size;
  }

  getActiveFluxIds() {
    return Array.from(this._activeFluxes);
  }

  // ── Gérer une requête HTTP entrante ─────────────────────────
  _handleRequest(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      // Parser le body JSON
      let payload = {};
      try { payload = JSON.parse(body); } catch(_) { payload = { raw: body }; }

      // Enrichir avec les headers
      payload._headers = req.headers;
      payload._method  = req.method;
      payload._url     = req.url;

      // Détecter le type de requête selon l'URL
      const isListener = req.url.startsWith('/wfd/listener/');
      const type       = isListener ? 'listener' : 'webhook';

      // Pour les listeners : vérifier l'auth avant de chercher les flux
      if (isListener) {
        const conn = (this._connexions || []).find(c => req.url === c.endpoint || req.url.startsWith(c.endpoint));
        if (!conn) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Endpoint listener inconnu' }));
          return;
        }
        if (!this._checkListenerAuth(conn, req, body)) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Authentification échouée' }));
          console.warn('[WFD Listener] Auth échouée pour ' + req.url);
          return;
        }
      }

      // Trouver les flux qui écoutent cette URL
      const fluxes = this._matchFluxes(req.url, type, payload);

      if (!fluxes.length) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Aucun flux actif pour cette URL' }));
        return;
      }

      // Répondre immédiatement
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, fluxes: fluxes.length }));

      // Exécuter les flux avec le bon normaliseur selon le type
      for (const flux of fluxes) {
        if (!isListener && _isCustomActionPayload(payload)) {
          // Custom Action Iconik — dispatcher selon le contexte (Asset / Collection / Segment)
          dispatchCustomAction(payload, flux, this).catch(err => {
            console.error('[WFD Engine] Erreur CustomAction "' + flux.name + '" :', err.message);
          });
        } else {
          const normalized = isListener
            ? normalizeListenerPayload(payload, req)
            : normalizeIconikPayload(payload);
          this._runFlux(flux, normalized).catch(err => {
            console.error('[WFD Engine] Erreur flux "' + flux.name + '" :', err.message);
          });
        }
      }
    });
  }

  // ── Trouver les flux qui correspondent à un déclencheur ─────
  _matchFluxes(url, type, payload) {
    const fluxes = this.getFluxes ? this.getFluxes() : [];
    return fluxes.filter(flux => {
      if (!this.isActive(flux.id)) return false;
      const trigger = flux.nodes?.find(n =>
        ['trigger','watchfolder','listener'].includes(n.family)
      );
      if (!trigger) return false;
      const cfg = trigger.config || {};

      if (type === 'webhook' && trigger.family === 'trigger') {
        const slug = cfg.wfdSlug ? cfg.wfdSlug.trim() : '';
        // Matcher par slug lisible (priorité)
        if (slug && (
          url === '/wfd/action/' + slug ||
          url === '/wfd/webhook/' + slug ||
          url.startsWith('/wfd/action/' + slug) ||
          url.startsWith('/wfd/webhook/' + slug)
        )) return true;
        // Matcher par fluxId (fallback)
        if (url === '/wfd/webhook/' + flux.id
          || url === '/wfd/action/'   + flux.id
          || url.startsWith('/wfd/webhook/' + flux.id)
          || url.startsWith('/wfd/action/'  + flux.id)
        ) return true;
        // Legacy
        return cfg.webhookId === payload.webhook_id
          || url === '/iconik'
          || url.startsWith('/iconik');
      }

      if (type === 'listener' && trigger.family === 'listener') {
        // Listener externe — matcher par endpoint de connexion
        const conn = this._getConnexion(cfg.connexionId);
        if (!conn) return false;
        return url === conn.endpoint || url.startsWith(conn.endpoint);
      }

      return false;
    });
  }

  // ── Récupérer une connexion depuis le registre ───────────────
  // Les connexions sont stockées dans localStorage côté renderer.
  // En mode Electron, elles sont passées via loadConnexions().
  _getConnexion(connexionId) {
    return (this._connexions || []).find(c => c.id === connexionId) || null;
  }

  loadConnexions(connexions) {
    this._connexions = connexions || [];
  }

  // ── Vérifier l'authentification d'une requête listener ───────
  _checkListenerAuth(conn, req, body) {
    if (!conn || conn.authType === 'none') return true;
    const headers = req.headers || {};

    switch (conn.authType) {
      case 'bearer': {
        const auth = headers['authorization'] || '';
        return auth === 'Bearer ' + conn.authValue || auth === conn.authValue;
      }
      case 'basic': {
        const auth = headers['authorization'] || '';
        const encoded = Buffer.from(conn.authValue || '').toString('base64');
        return auth === 'Basic ' + encoded;
      }
      case 'apikey_header': {
        const key = headers['x-api-key'] || headers['api-key'] || '';
        return key === conn.authValue;
      }
      case 'apikey_query': {
        const u = new URL('http://localhost' + req.url);
        return u.searchParams.get('api_key') === conn.authValue
            || u.searchParams.get('apikey')  === conn.authValue;
      }
      case 'hmac': {
        // Vérification HMAC-SHA256 basique
        try {
          const crypto = require('crypto');
          const sig = headers['x-signature'] || headers['x-hub-signature-256'] || '';
          const expected = 'sha256=' + crypto
            .createHmac('sha256', conn.authValue || '')
            .update(body || '')
            .digest('hex');
          return sig === expected;
        } catch(_) { return false; }
      }
      default: return true;
    }
  }

  // ── Exécuter un flux ─────────────────────────────────────────
  // Plusieurs runs parallèles sont autorisés sur le même flux.
  // Chaque run a son propre runId (généré dans WfdContext.createContext).
  async _runFlux(flux, payload) {
    this.onEvent('flux:start', { fluxId: flux.id, name: flux.name });
    // Résoudre le client du flux (depuis son iconikEnv ou le client global)
    const fluxClient = (this._resolveClient && this._resolveClient(null, flux))
      || this.iconikClient;
    const resolveClient = this._resolveClient
      ? (node) => this._resolveClient(node, flux)
      : null;
    const ctx = await this.executor.executeFlux(
      flux,
      payload,
      this.nodeHandlers,
      fluxClient,
      this.onEvent,
      resolveClient,
    );
    this.onEvent('flux:end', { fluxId: flux.id, runId: ctx.runId, status: ctx.status });
    return ctx;
  }

  // ── Déclenchement manuel ─────────────────────────────────────
  async triggerManual(fluxId, extraPayload = {}) {
    const fluxes = this.getFluxes ? this.getFluxes() : [];
    const flux = fluxes.find(f => f.id === fluxId);
    if (!flux) throw new Error('Flux introuvable : ' + fluxId);
    return this._runFlux(flux, {
      _manual: true,
      _triggeredAt: new Date().toISOString(),
      ...extraPayload,
    });
  }


  // ── Timer (interval / cron / oneshot) ─────────────────────────────────
  scheduleTimer(flux, cfg = {}) {
    const mode = cfg.timerMode || 'interval';

    const runFlux = () => {
      if (!this.isActive(flux.id)) return;
      const payload = { _timer: true, _mode: mode, _firedAt: new Date().toISOString() };
      this._runFlux(flux, payload).catch(err => {
        console.error('[WFD Timer] Erreur flux ' + flux.name + ':', err.message);
      });
    };

    if (mode === 'interval') {
      const units = { minutes: 60000, hours: 3600000, days: 86400000 };
      const ms    = (parseInt(cfg.intervalVal) || 30) * (units[cfg.intervalUnit] || 60000);
      const t     = setInterval(runFlux, ms);
      this._watchers.push({ close: () => clearInterval(t) });
      console.log('[WFD Timer] Interval ' + cfg.intervalVal + ' ' + cfg.intervalUnit + ' — flux "' + flux.name + '"');

    } else if (mode === 'cron') {
      const expr = cfg.cronExpr || '0 9 * * 1-5';
      const t    = _scheduleCron(expr, runFlux);
      if (t) this._watchers.push({ close: () => clearInterval(t) });
      console.log('[WFD Timer] Cron "' + expr + '" — flux "' + flux.name + '"');

    } else if (mode === 'oneshot') {
      const target = cfg.oneshotDatetime ? new Date(cfg.oneshotDatetime).getTime() : 0;
      const delay  = target - Date.now();
      if (delay > 0) {
        const t = setTimeout(runFlux, delay);
        this._watchers.push({ close: () => clearTimeout(t) });
        console.log('[WFD Timer] One-shot dans ' + Math.round(delay/1000) + 's — flux "' + flux.name + '"');
      } else {
        console.warn('[WFD Timer] One-shot ignoré — date dans le passé');
      }
    }
  }

  // ── Watchfolder local ────────────────────────────────────────
  watchFolder(folderPath, fluxId, options = {}) {
    const {
      extensions   = [],
      recursive    = false,
      debounceMs   = 2000,   // attendre 2s de stabilité fichier
      throttleSec  = 0,      // délai min entre deux exécutions (0 = désactivé)
      overflowMode = 'queue' // queue | skip | latest
    } = options;

    if (!fs.existsSync(folderPath)) {
      console.warn('[WFD Watchfolder] Dossier introuvable : ' + folderPath);
      return;
    }

    // ── État debounce / throttle par fichier ─────────────────────
    const _debounceTimers = {};   // filePath → timer debounce
    const _queue          = [];   // file d'attente overflow
    let   _running        = false;
    let   _lastRun        = 0;    // timestamp dernière exécution

    // ── Traiter un fichier (après debounce) ──────────────────────
    const processFile = async (filePath) => {
      const now      = Date.now();
      const throttleMs = (throttleSec || 0) * 1000;

      // Throttle : si trop tôt depuis la dernière exécution
      if (throttleMs > 0 && (now - _lastRun) < throttleMs) {
        const wait = throttleMs - (now - _lastRun);
        await new Promise(r => setTimeout(r, wait));
      }

      _lastRun = Date.now();

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return;

        const payload = normalizeFilePayload(filePath, stat);
        const fluxes  = this.getFluxes ? this.getFluxes() : [];
        const flux    = fluxes.find(f => f.id === fluxId);
        if (flux && this.isActive(fluxId)) {
          await this._runFlux(flux, payload);
        }
      } catch(_) {
        // Fichier supprimé ou inaccessible — ignorer
      }
    };

    // ── Drainer la file d'attente ────────────────────────────────
    const drainQueue = async () => {
      if (_running || _queue.length === 0) return;
      _running = true;
      while (_queue.length > 0) {
        const filePath = _queue.shift();
        await processFile(filePath);
      }
      _running = false;
    };

    // ── Enregistrer un fichier détecté ───────────────────────────
    const enqueue = (filePath) => {
      if (_running) {
        switch (overflowMode) {
          case 'skip':
            // Ignorer si une exécution est en cours
            console.log('[WFD Watchfolder] skip — exécution en cours : ' + path.basename(filePath));
            return;
          case 'latest':
            // Vider la file et ne garder que le dernier
            _queue.length = 0;
            _queue.push(filePath);
            return;
          case 'queue':
          default:
            _queue.push(filePath);
            return;
        }
      }
      _queue.push(filePath);
      drainQueue();
    };

    // ── Watcher fs avec debounce ─────────────────────────────────
    const watcher = fs.watch(folderPath, { recursive }, (event, filename) => {
      if (event !== 'rename' && event !== 'change') return;
      if (!filename) return;

      const filePath = path.join(folderPath, filename);

      // Filtrer par extension si défini
      if (extensions.length) {
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        if (!extensions.includes(ext)) return;
      }

      // Debounce : annuler le timer précédent pour ce fichier
      if (_debounceTimers[filePath]) {
        clearTimeout(_debounceTimers[filePath]);
      }

      _debounceTimers[filePath] = setTimeout(() => {
        delete _debounceTimers[filePath];
        enqueue(filePath);
      }, debounceMs > 0 ? debounceMs : 0);
    });

    this._watchers.push(watcher);
    console.log(
      '[WFD Watchfolder] Surveillance : ' + folderPath +
      ' | debounce: ' + debounceMs + 'ms' +
      ' | throttle: ' + throttleSec + 's' +
      ' | overflow: ' + overflowMode
    );
  }
}


// ── Planificateur cron minimaliste (sans dépendance externe) ────────────────
function _scheduleCron(expr, fn) {
  function match(field, val) {
    if (field === '*') return true;
    return field.split(',').some(function(part) {
      if (part.indexOf('-') > -1) {
        var ab = part.split('-');
        return val >= parseInt(ab[0]) && val <= parseInt(ab[1]);
      }
      return parseInt(part) === val;
    });
  }
  function check() {
    var d     = new Date();
    var parts = expr.trim().split(' ');
    if (parts.length < 5) return;
    if (match(parts[0], d.getMinutes())  &&
        match(parts[1], d.getHours())    &&
        match(parts[2], d.getDate())     &&
        match(parts[3], d.getMonth()+1)  &&
        match(parts[4], d.getDay())) {
      fn();
    }
  }
  return setInterval(check, 30000);
}

// ── URL publique ngrok (injectée par main.js) ────────────────────
let _publicUrl = '';
function setPublicUrl(url) { _publicUrl = url || ''; }

// ── Normaliser le payload webhook Iconik ────────────────────────
// Traduit le payload brut en contexte métier lisible
function normalizeIconikPayload(raw) {
  const data = raw.data || {};
  // Métadonnées : nouveau format (metadata_values racine) ou ancien (data.metadata_values)
  const meta = raw.metadata_values || data.metadata_values || {};

  // Détection Custom Action
  const isCustomAction = _isCustomActionPayload(raw);

  // Asset ID : nouveau format = asset_ids[0], ancien = object_id
  const assetId = (Array.isArray(raw.asset_ids) && raw.asset_ids.length ? raw.asset_ids[0] : null)
    || raw.object_id || raw.asset_id || '';

  // Type de contexte : nouveau = context ("ASSET","COLLECTION"…), ancien = object_type
  const contextType = raw.context || raw.object_type || 'asset';

  // Vue MD : nouveau = metadata_view_id racine, ancien = view_id
  const viewId = raw.metadata_view_id || raw.view_id || '';

  // Collection ID : nouveau = collection_ids[0], ancien = collection_id
  const collectionId = (Array.isArray(raw.collection_ids) && raw.collection_ids.length ? raw.collection_ids[0] : null)
    || raw._collection_id || raw.collection_id || data.collection_id || '';

  return {
    asset: {
      id  : assetId,
      type: contextType,
    },
    collection: {
      id: collectionId,
    },
    segment: {
      id: raw.segment_id || '',
    },
    event: {
      type     : (raw.realm || '') + '.' + (raw.operation || ''),
      realm    : raw.realm      || '',
      operation: raw.operation  || '',
      date     : raw.date_created || new Date().toISOString(),
      viewId   : viewId,
    },
    user: { id: raw.user_id || '' },
    // Auth Iconik depuis Custom Action
    ...(isCustomAction ? {
      _iconikAuth     : { token: raw.auth_token, appId: raw.app_id || '' },
      auth_token      : raw.auth_token,
      app_id          : raw.app_id || '',
      metadata_view_id: viewId,   // exposé directement pour l'executor
    } : {}),
    _metadata : meta,
    _raw      : raw,
  };
}

// ── Normaliser un payload listener (système tiers) ─────────────
function normalizeListenerPayload(raw, req) {
  return {
    // Payload brut du système tiers
    data     : raw,
    // Métadonnées de la requête
    event    : {
      type     : 'listener.call',
      date     : new Date().toISOString(),
      url      : req?.url || '',
      method   : req?.method || 'POST',
    },
    // Champs courants normalisés (si présents dans le payload)
    asset      : { id: raw.asset_id || raw.assetId || raw.id || '' },
    collection : { id: raw.collection_id || raw.collectionId || '' },
    user       : { id: raw.user_id || raw.userId || '' },
    // Payload brut conservé
    _raw       : raw,
    _listener  : true,
  };
}

// ── Normaliser un payload fichier (watchfolder) ─────────────────
function normalizeFilePayload(filePath, stat) {
  const ext  = path.extname(filePath).replace('.', '').toLowerCase();
  const name = path.basename(filePath, path.extname(filePath));
  return {
    file: {
      path : filePath,
      name : name,
      ext  : ext,
      size : stat.size,
      dir  : path.dirname(filePath),
    },
    event: {
      type: 'file.added',
      date: new Date().toISOString(),
    },
    _raw: { filePath, stat },
  };
}

// ── Détecter si le payload est une Custom Action Iconik ──────────
// Les Custom Actions ont toujours auth_token + object_id + object_type
function _isCustomActionPayload(raw) {
  // Nouveau format Iconik : asset_ids[] + context + auth_token
  // Ancien format         : object_id + object_type + auth_token
  return !!(raw.auth_token && (
    (raw.asset_ids !== undefined || raw.collection_ids !== undefined) ||
    (raw.object_id && raw.object_type)
  ));
}

// ── Dispatcher Custom Action ─────────────────────────────────────
// Gère les 3 contextes : Asset → 1 run / Collection → N runs / Segment → 1 run
async function dispatchCustomAction(raw, flux, server) {
  // Support nouveau format (context) et ancien (object_type)
  const context  = (raw.context || raw.object_type || 'ASSET').toUpperCase();
  const onError  = (err) =>
    console.error('[WFD CustomAction] Erreur flux "' + flux.name + '" :', err.message);

  if (context === 'COLLECTION') {
    // ── Collection → fetch assets → N runs parallèles ──────────
    let assets = [];
    const collectionId = (Array.isArray(raw.collection_ids) ? raw.collection_ids[0] : null)
      || raw.object_id || '';
    try {
      const client = _buildTempIconikClient(raw);
      const data   = await client.get(
        '/API/assets/v1/collections/' + collectionId + '/content/?object_types=assets&per_page=200'
      );
      assets = (data.objects || []).filter(o =>
        !o.object_type || o.object_type === 'assets'
      );
    } catch (e) {
      console.error('[WFD CustomAction] Fetch collection "' + collectionId + '" échoué :', e.message);
      // Fallback : 1 run avec collection_id disponible dans ctx
      const normalized = normalizeIconikPayload(raw);
      server._runFlux(flux, normalized).catch(onError);
      return;
    }

    if (!assets.length) {
      console.warn('[WFD CustomAction] Collection "' + collectionId + '" vide ou inaccessible');
      return;
    }

    console.log('[WFD CustomAction] Collection "' + collectionId + '" → ' + assets.length + ' run(s)');
    for (const asset of assets) {
      const normalized = normalizeIconikPayload({
        ...raw,
        object_id      : asset.id || asset.object_id || '',
        object_type    : 'assets',
        _collection_id : collectionId,   // disponible via ctx.collection.id
      });
      server._runFlux(flux, normalized).catch(onError);
    }

  } else if (context === 'SEGMENT') {
    // ── Segment → 1 run avec asset_id + segment_id ─────────────
    const normalized = normalizeIconikPayload(raw);
    // segment.id est déjà dans normalized.segment.id si raw.segment_id présent.
    // Si segment_id absent : object_id peut être le segment lui-même.
    // On enrichit avec les deux IDs clairement séparés.
    normalized.segment = {
      id     : raw.segment_id  || raw.object_id || '',
      assetId: raw.asset_id    || '',
    };
    // asset.id doit pointer sur l'asset réel, pas le segment
    if (raw.asset_id) normalized.asset = { id: raw.asset_id, type: 'assets' };
    server._runFlux(flux, normalized).catch(onError);

  } else {
    // ── Asset → 1 run par asset_id (plusieurs sélections possibles) ──
    const assetIds = Array.isArray(raw.asset_ids) && raw.asset_ids.length
      ? raw.asset_ids
      : (raw.object_id ? [raw.object_id] : []);

    if (assetIds.length > 1) {
      console.log('[WFD CustomAction] ' + assetIds.length + ' assets sélectionnés → ' + assetIds.length + ' run(s)');
      for (const assetId of assetIds) {
        const normalized = normalizeIconikPayload({ ...raw, asset_ids: [assetId] });
        server._runFlux(flux, normalized).catch(onError);
      }
    } else {
      const normalized = normalizeIconikPayload(raw);
      server._runFlux(flux, normalized).catch(onError);
    }
  }
}

// ── Construire un client Iconik temporaire depuis un payload Custom Action ──
// Utilisé pour le fetch de collection avant de lancer les runs
function _buildTempIconikClient(raw) {
  const https = require('https');
  const http  = require('http');

  const request = (method, path, body) => new Promise((resolve, reject) => {
    const url = new URL(path, 'https://app.iconik.io');
    const lib = url.protocol === 'https:' ? https : http;
    const headers = {
      'App-ID'      : raw.app_id     || '',
      'Auth-Token'  : raw.auth_token || '',
      'Content-Type': 'application/json',
    };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = lib.request({
      hostname: url.hostname,
      port    : url.port || (url.protocol === 'https:' ? 443 : 80),
      path    : url.pathname + url.search,
      method, headers,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error('Iconik ' + res.statusCode + ' : ' + JSON.stringify(parsed).slice(0, 120));
            err.statusCode = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });

  return {
    get   : (p)    => request('GET',    p, null),
    post  : (p, b) => request('POST',   p, b),
    put   : (p, b) => request('PUT',    p, b),
    patch : (p, b) => request('PATCH',  p, b),
    delete: (p)    => request('DELETE', p, null),
  };
}


// ── Export ───────────────────────────────────────────────────────
const WfdTrigger = { WfdTriggerServer, normalizeIconikPayload, normalizeFilePayload, normalizeListenerPayload, setPublicUrl };

if (typeof module !== 'undefined') module.exports = WfdTrigger;
if (typeof window !== 'undefined') window.WfdTrigger = WfdTrigger;
