// ================================================================
// wfd-engine.js — Point d'entrée du WFD Engine
//
// Assemble context + executor + trigger en un seul objet
// utilisable depuis Electron (main process ou renderer via preload)
// ================================================================

'use strict';

const WfdContext  = require('./wfd-engine-context.js');
const WfdExecutor = require('./wfd-engine-executor.js');
const WfdTrigger  = require('./wfd-engine-trigger.js');

// ── Créer une instance du Engine ─────────────────────────────────
function createEngine(options = {}) {
  const nodeHandlers  = options.nodeHandlers || {};
  let   iconikClient  = options.iconikClient || null;
  const onEvent       = options.onEvent      || (() => {});
  const port          = options.port !== undefined ? options.port : 2880;

  // Registre des flux actifs
  let _fluxes = [];

  const trigger = new WfdTrigger.WfdTriggerServer({
    port,
    executor     : WfdExecutor,
    getFluxes    : () => _fluxes,
    iconikClient,
    nodeHandlers,
    onEvent,
  });

  return {
    // ── Accès interne au TriggerServer (pour scheduleTimer) ────
    _trigger: trigger,
    _getFluxes: () => _fluxes,

    // ── Gestion des flux ───────────────────────────────────────
    loadFluxes(fluxes) {
      _fluxes = fluxes || [];
    },
    activateFlux(fluxId)   { trigger.activateFlux(fluxId); },
    deactivateFlux(fluxId) { trigger.deactivateFlux(fluxId); },
    isActive(fluxId)       { return trigger.isActive(fluxId); },

    // ── Démarrage / arrêt ──────────────────────────────────────
    start() { trigger.start(); return this; },
    stop()  { trigger.stop();  return this; },

    // ── Déclenchement manuel ───────────────────────────────────
    async triggerManual(fluxId, payload = {}) {
      return trigger.triggerManual(fluxId, payload);
    },

    // ── Watchfolder ────────────────────────────────────────────
    watchFolder(folderPath, fluxId, options = {}) {
      trigger.watchFolder(folderPath, fluxId, options);
    },

    // ── Exécution directe (pour tests) ────────────────────────
    async executeFlux(flux, payload = {}) {
      return WfdExecutor.executeFlux(flux, payload, nodeHandlers, iconikClient, onEvent);
    },

    // ── Configuration Iconik ─────────────────────────────────────
    setIconikClient(cfg) {
      iconikClient = cfg ? {
        get: async (path)       => _iconikRequest('GET',   path, null, cfg),
        post: async (path, body) => _iconikRequest('POST',  path, body, cfg),
        put: async (path, body)  => _iconikRequest('PUT',   path, body, cfg),
        patch: async (path, body)=> _iconikRequest('PATCH', path, body, cfg),
        delete: async (path)     => _iconikRequest('DELETE',path, null, cfg),
      } : null;
      // Propager au trigger server
      if (trigger._setIconikClient) trigger._setIconikClient(iconikClient);
    },

    // ── URL publique (ngrok) ──────────────────────────────────────
    setPublicUrl(url) { if (WfdTrigger.setPublicUrl) WfdTrigger.setPublicUrl(url); },

    // ── Accès au contexte ──────────────────────────────────────
    context: WfdContext,
  };
}

// ── Helper requête Iconik ────────────────────────────────────────
async function _iconikRequest(method, path, body, cfg) {
  const https  = require('https');
  const http   = require('http');
  const url    = new URL(path, cfg.baseUrl || 'https://app.iconik.io');
  const isHttps = url.protocol === 'https:';
  const lib    = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const headers = {
      'App-ID': cfg.appId || '',
      'Auth-Token': cfg.token || cfg.appToken || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = lib.request({
      hostname: url.hostname,
      port    : url.port || (isHttps ? 443 : 80),
      path    : url.pathname + url.search,
      method,
      headers,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error('Iconik API ' + res.statusCode + ' : ' + (parsed.message || data.slice(0,100)));
            err.statusCode = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Export ────────────────────────────────────────────────────────
const WfdEngine = { createEngine, WfdContext, WfdExecutor, WfdTrigger };

if (typeof module !== 'undefined') module.exports = WfdEngine;
if (typeof window !== 'undefined') window.WfdEngine = WfdEngine;
