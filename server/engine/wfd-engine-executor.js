// ================================================================
// wfd-engine-executor.js — Moteur d'exécution des flux WFD
//
// Responsabilités :
//   - Tri topologique des nœuds
//   - Exécution séquentielle / parallèle selon le graphe
//   - Gestion du comportement sur erreur (arrêter/continuer/noter)
//   - Émission d'événements pour les logs temps réel
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

// ── Exécuter un flux complet ─────────────────────────────────────
// flux        : objet flux WFD (nodes, connections)
// triggerPayload : payload du déclencheur
// nodeHandlers   : { family: async fn(node, ctx, iconikClient) → { port, ctx } }
// iconikClient   : client HTTP Iconik
// onEvent        : callback pour les logs temps réel (optionnel)

// ── Store des exécutions suspendues ──────────────────────────────────────────
// Clé : `${runId}:${nodeId}`  →  { resolve, reject, timeoutId, ports, assets }
const _wfdPaused = {};

// Appelé depuis l'extérieur (ipc) pour résoudre une suspension
function releaseNode(runId, nodeId, port, assetIds) {
  const key = runId + ':' + nodeId;
  let pending = _wfdPaused[key];
  let resolvedKey = key;
  if (!pending) {
    // Chercher par runId+nodeId si la clé est corrompue
    resolvedKey = Object.keys(_wfdPaused).find(k =>
      _wfdPaused[k].runId === runId && _wfdPaused[k].nodeId === nodeId
    );
    if (resolvedKey) pending = _wfdPaused[resolvedKey];
  }
  if (!pending) return false;
  pending.resolve({ port: port ?? 0, assetIds: assetIds || null });
  return true;
}

// Appelé depuis l'extérieur pour rejeter (timeout ou annulation)
function rejectNode(runId, nodeId, reason) {
  const key = runId + ':' + nodeId;
  let pending = _wfdPaused[key];
  let resolvedKey = key;
  if (!pending) {
    // Chercher par runId+nodeId
    resolvedKey = Object.keys(_wfdPaused).find(k =>
      !_wfdPaused[k].runId || (_wfdPaused[k].runId === runId && _wfdPaused[k].nodeId === nodeId)
    );
    if (resolvedKey) pending = _wfdPaused[resolvedKey];
  }
  if (!pending) {
    // Nettoyer les entrées orphelines (sans runId/nodeId)
    Object.keys(_wfdPaused).forEach(k => {
      const p = _wfdPaused[k];
      if (!p.runId || !p.nodeId) {
        try { p.reject(new Error('Orphan cleanup')); } catch(_) {}
        delete _wfdPaused[k];
      }
    });
    return false;
  }
  clearTimeout(pending.timeoutId);
  delete _wfdPaused[resolvedKey];
  try { pending.reject(new Error(reason || 'Annulé')); } catch(_) {}
  // Notifier l'UI que ce run est terminé en erreur
  const _oe = pending.onEvent;
  emit(_oe, 'node:error', {
    nodeId  : pending.nodeId || nodeId,
    runId   : pending.runId  || runId,
    fluxId  : pending.fluxId || '',
    message : reason || 'Annulé',
    severity: 'fatal',
  });
  emit(_oe, 'end', {
    runId : pending.runId  || runId,
    fluxId: pending.fluxId || '',
    status: 'failed',
  });
  return true;
}

// ── Snapshot sérialisable du contexte à un instant t ────────────────────────
function _snapshotCtx(ctx) {
  try {
    return JSON.parse(JSON.stringify({
      vars        : ctx.vars        || {},
      results     : ctx.results     || {},
      errors      : ctx.errors      || [],
      asset       : ctx.asset       || {},
      collection  : ctx.collection  || {},
      runId       : ctx.runId       || '',
      fluxId      : ctx.fluxId      || '',
      _triggerInfo: ctx._triggerInfo || null,
    }, (key, val) => {
      if (typeof val === 'function') return undefined;
      if (key === '_waitForRelease' || key === '_iconikAuth') return undefined;
      return val;
    }));
  } catch(e) {
    return { vars: {}, results: {}, errors: [], _snapshotError: e.message };
  }
}

// Créer une Promise suspendue qui attend un Release
// Supporte les releases partiels (asset par asset) — résout quand tous traités
function _waitForRelease(runId, nodeId, ports, assets, timeoutMs, onEvent, fluxId, ctx) {
  const key = runId + ':' + nodeId;
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    const totalAssets = assets.length;
    let   releasedCount = 0;
    let   finalPort = 0;

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        delete _wfdPaused[key];
        emit(onEvent, 'node:timeout', { nodeId, runId, fluxId });
        resolve({ port: 0, timedOut: true });
      }, timeoutMs);
    }

    // partialRelease : appelé pour chaque release (partiel ou total)
    const partialRelease = ({ port, assetIds }) => {
      finalPort = port ?? 0;
      if (!assetIds || assetIds.length === 0) {
        // Release total — résoudre immédiatement
        clearTimeout(timeoutId);
        delete _wfdPaused[key];
        resolve({ port: finalPort });
      } else {
        // Release partiel — compter les assets traités
        releasedCount += assetIds.length;
        if (releasedCount >= totalAssets || totalAssets === 0) {
          clearTimeout(timeoutId);
          delete _wfdPaused[key];
          resolve({ port: finalPort });
        }
        // Sinon : continuer à attendre les autres releases
      }
    };

    const ctxSnapshot = ctx ? _snapshotCtx(ctx) : null;
    _wfdPaused[key] = {
      resolve: partialRelease,
      reject, timeoutId, ports, assets, runId, nodeId, totalAssets, releasedCount: 0,
      ctxSnapshot, onEvent, fluxId,
    };
    emit(onEvent, 'node:paused', {
      nodeId, runId, fluxId,
      ports, assets,
      timeoutMs   : timeoutMs || null,
      ctxSnapshot,
    });
  });
}

async function executeFlux(flux, triggerPayload, nodeHandlers, iconikClient, onEvent, resolveClient = null) {
  const _fluxId = flux.id;  // Disponible pour tous les événements
  const ctx = WfdContext.createContext({
    ...triggerPayload,
    _fluxId: flux.id || flux.name,
  });

  ctx.fluxId = flux.id;

  // Injecter les credentials Iconik de la Custom Action si présents
  if (triggerPayload?._iconikAuth) {
    ctx._iconikAuth = triggerPayload._iconikAuth;
    WfdContext.setVar(ctx, '_iconik_token', triggerPayload._iconikAuth.token);
    WfdContext.setVar(ctx, '_iconik_app_id', triggerPayload._iconikAuth.appId);
  }
  // Injecter asset_id — forme normalisée (asset.id) OU brute (asset_id direct)
  const _assetId = triggerPayload?.asset?.id || triggerPayload?.asset_id || '';
  if (_assetId) {
    WfdContext.setVar(ctx, 'asset_id', _assetId);
    // Peupler ctx.asset.id pour que {asset.id} se résolve dans les handlers
    if (ctx.asset) ctx.asset.id = _assetId;
    else ctx.asset = { id: _assetId };
    if (triggerPayload?.asset?.type) ctx.asset.type = triggerPayload.asset.type;
  }

  // Injecter collection_id si présent
  const _colId = triggerPayload?.collection?.id || '';
  if (_colId) {
    WfdContext.setVar(ctx, 'collection_id', _colId);
    if (ctx.collection) ctx.collection.id = _colId;
    else ctx.collection = { id: _colId };
  }
  // Injecter metadata_view_id — forme normalisée (event.viewId) OU brute
  const _viewId = triggerPayload?.event?.viewId || triggerPayload?.metadata_view_id || '';
  if (_viewId) {
    WfdContext.setVar(ctx, 'metadata_view_id', _viewId);
    // Peupler ctx.event.viewId pour les handlers qui lisent depuis l'event
    if (ctx.event) ctx.event.viewId = _viewId;
  }

  // Injecter auth_token si présent dans le payload brut (Custom Action)
  if (triggerPayload?.auth_token) {
    ctx._iconikAuth = ctx._iconikAuth || { token: triggerPayload.auth_token, appId: triggerPayload.app_id || '' };
    WfdContext.setVar(ctx, '_iconik_token', triggerPayload.auth_token);
    WfdContext.setVar(ctx, '_iconik_app_id', triggerPayload.app_id || '');
  }

  // Exposer à plat les champs saisis via la Vue de métadonnées attachée à la
  // Custom Action (ex: formulaire "Univers" avant création d'arbo). Même
  // convention que le fetch metadata : {trigger.NomChamp} plutôt que d'obliger
  // à naviguer triggerPayload._metadata.NomChamp.field_values.0.value à la main.
  const _triggerMeta = triggerPayload?._metadata || {};
  Object.entries(_triggerMeta).forEach(([fieldName, fieldData]) => {
    if (fieldName === '__separator__') return;
    const values = (fieldData?.field_values || [])
      .map(fv => fv.value)
      .filter(v => v !== null && v !== undefined && v !== '');
    if (!values.length) return;
    const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
    WfdContext.setVar(ctx, 'trigger.' + fieldName, exposed);
  });

  // Stocker les infos de diagnostic du trigger (visible dans le snapshot)
  // Extraire le payload brut Iconik pour diagnostic
  const _rawPayload = triggerPayload?._raw || {};
  ctx._triggerInfo = {
    rawKeys        : Object.keys(triggerPayload || {}),
    rawPayloadKeys : Object.keys(_rawPayload),
    rawPayloadSample: Object.fromEntries(
      Object.entries(_rawPayload)
        .filter(([k]) => !['_headers'].includes(k))
        .map(([k, v]) => [k, typeof v === 'object' ? '(object)' : String(v).slice(0, 80)])
    ),
    assetId    : triggerPayload?.asset?.id    || triggerPayload?.asset_id    || '',
    viewId     : triggerPayload?.event?.viewId || triggerPayload?.metadata_view_id || '',
    hasAuth    : !!(triggerPayload?._iconikAuth || triggerPayload?.auth_token),
    objectType : triggerPayload?.asset?.type   || '',
    isManual   : !!(triggerPayload?._manual),
  };

  // Injecter _waitForRelease dans le contexte pour que les handlers puissent suspendre
  ctx._waitForRelease = (runId, nodeId, ports, assets, timeoutMs) =>
    _waitForRelease(runId, nodeId, ports, assets, timeoutMs, onEvent, flux.id, ctx);
  // Timeout global depuis config flux
  ctx._pauseTimeoutMs = flux.pauseTimeoutMs || null;
  emit(onEvent, 'start', { fluxId: flux.id, runId: ctx.runId, fluxName: flux.name });

  try {
    // Construire le graphe d'exécution
    const graph = buildGraph(flux.nodes, flux.connections);

    // Trouver le(s) nœud(s) de départ (triggers, sans entrée)
    const starts = flux.nodes.filter(n =>
      ['trigger','watchfolder','listener','timer','manual'].includes(n.family)
    );

    if (!starts.length) {
      throw new Error('Aucun nœud déclencheur trouvé dans le flux');
    }

    // Exécuter depuis chaque point de départ
    for (const startNode of starts) {
      await executeNode(startNode, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
    }

    WfdContext.finalizeSuccess(ctx);

  } catch (err) {
    ctx.status = 'failed';
    WfdContext.addError(ctx, 'Engine', err.message, 'fatal');
    emit(onEvent, 'error', { message: err.message, ctx });
  }

  emit(onEvent, 'end', { runId: ctx.runId, status: ctx.status, ctx });
  return ctx;
}

// ── Exécuter un nœud et suivre ses connexions ───────────────────
async function executeNode(node, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient = null) {
  emit(onEvent, 'node:start', { nodeId: node.id, name: node.name, family: node.family, fluxId: ctx.fluxId || _fluxId, runId: ctx.runId });

  // Les triggers ne font qu'initialiser le contexte — le payload est déjà là
  if (['trigger','watchfolder','listener','timer','manual'].includes(node.family)) {
    emit(onEvent, 'node:done', { nodeId: node.id, port: 0, fluxId: ctx.fluxId, runId: ctx.runId });
    return await followPort(node, 0, graph, ctx, nodeHandlers, iconikClient, onEvent);
  }

  // La Boucle a besoin de piloter elle-même le graphe (répéter le port
  // "Chaque élément" une fois par item, puis suivre "Terminé") — un handler
  // classique (appelé une fois, un seul port en retour) ne peut pas faire ça.
  // Traitée à part, avant le dispatch générique ci-dessous.
  if (node.family === 'loop') {
    return await executeLoopNode(node, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
  }

  // Trouver le handler pour cette famille
  const handler = nodeHandlers[node.family];
  if (!handler) {
    emit(onEvent, 'node:skip', { nodeId: node.id, reason: 'handler manquant', fluxId: ctx.fluxId, runId: ctx.runId });
    return await followPort(node, 0, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
  }

  // Résoudre le client Iconik pour ce nœud :
  // 1. env spécifique du nœud (node.config.iconikEnv)
  // 2. client global du flux
  // 3. credentials de la Custom Action dans le contexte (ctx._iconikAuth)
  const nodeClient = (resolveClient && resolveClient(node))
    || iconikClient
    || (ctx._iconikAuth ? _buildClientFromAuth(ctx._iconikAuth) : null);

  // Exécuter le nœud
  let port = 0;
  try {
    const result = await handler(node, ctx, nodeClient);
    port = result?.port ?? 0;
    // Si le handler signale un warn (ex: gate pause), émettre node:error warn AVANT node:done
    if (result?.warn) {
      WfdContext.addError(ctx, node.name, result.warn, 'warn');
      emit(onEvent, 'node:error', { nodeId: node.id, message: result.warn, severity: 'warn', fluxId: ctx.fluxId, runId: ctx.runId });
    }
    // Extraire le nombre d'items traités depuis le résultat ou le contexte
    const _count = result?.count
      ?? (ctx.vars?.search_results_count ? parseInt(ctx.vars.search_results_count) : null)
      ?? (Array.isArray(result?.items) ? result.items.length : null)
      ?? null;
    emit(onEvent, 'node:done', { nodeId: node.id, port, name: node.name, family: node.family, fluxId: ctx.fluxId, runId: ctx.runId, warn: !!result?.warn, count: _count, ctxSnapshot: _snapshotCtx(ctx) });

  } catch (err) {
    const onError = node.config?.onError || 'stop';

    if (onError === 'stop') {
      // Erreur fatale — arrêter le flux
      WfdContext.addError(ctx, node.name, err.message, 'fatal');
      ctx.status = 'failed';
      emit(onEvent, 'node:error', { nodeId: node.id, message: err.message, severity: 'fatal', fluxId: ctx.fluxId, runId: ctx.runId, ctxSnapshot: _snapshotCtx(ctx) });
      return; // pas de suite

    } else if (onError === 'continue_log') {
      // Erreur non critique — noter et continuer
      WfdContext.addError(ctx, node.name, err.message, 'warn');
      emit(onEvent, 'node:error', { nodeId: node.id, message: err.message, severity: 'warn', fluxId: ctx.fluxId, runId: ctx.runId });
      port = 0; // continuer sur le port normal

    } else if (onError === 'continue') {
      // Ignorer silencieusement
      emit(onEvent, 'node:skip', { nodeId: node.id, reason: 'erreur ignorée', fluxId: ctx.fluxId, runId: ctx.runId });
      port = 0;
    }
  }

  // Suivre les connexions depuis le port de sortie
  await followPort(node, port, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
}

// ── Exécuter un nœud Boucle : itère réellement sur chaque élément ────────
// Ports : 0 = "Chaque élément" (corps de boucle, répété), 1 = "Terminé"
// (suite normale du flux, une seule fois, après le dernier item).
async function executeLoopNode(node, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient) {
  emit(onEvent, 'node:start', { nodeId: node.id, name: node.name, family: node.family, fluxId: ctx.fluxId, runId: ctx.runId });

  const cfg     = node.config || {};
  const loopVar = cfg.loopVar || 'item';
  const mode    = cfg.loopSource || 'variable';

  let items;
  if (mode === 'variable') {
    // loopVariablePath peut s'écrire avec ou sans accolades
    // ({saisonAssets.objects} ou saisonAssets.objects) — on extrait le
    // chemin et on lit la valeur BRUTE via resolvePath, sans passer par
    // resolve() qui convertirait un tableau en chaîne de caractères
    // (String(array)) et le détruirait au passage.
    let sourcePath = (cfg.loopVariablePath || '').trim();
    const braceMatch = sourcePath.match(/^\{(.+)\}$/);
    if (braceMatch) sourcePath = braceMatch[1];

    items = WfdContext.resolvePath(sourcePath, ctx);
    if (!Array.isArray(items)) items = ctx.vars?.[sourcePath];
    if (!Array.isArray(items)) items = [];
  } else {
    // Modes 'files'/'assets'/'collection'/'list'/'metadata' : prévus côté
    // panneau (choix dans le menu, sélecteur de collection, etc.) mais
    // jamais câblés côté exécution — ni avant ce commit, ni maintenant.
    // Échec explicite plutôt que de faire semblant que la boucle a tourné
    // avec 0 élément silencieusement.
    const onError = cfg.onError || 'stop';
    const msg = `Boucle : le mode "${mode}" n'est pas encore implémenté côté exécution — utilisez "Variable existante" avec une Recherche APS en amont.`;
    if (onError === 'stop') {
      WfdContext.addError(ctx, node.name, msg, 'fatal');
      ctx.status = 'failed';
      emit(onEvent, 'node:error', { nodeId: node.id, message: msg, severity: 'fatal', fluxId: ctx.fluxId, runId: ctx.runId });
      return;
    }
    WfdContext.addError(ctx, node.name, msg, 'warn');
    emit(onEvent, 'node:error', { nodeId: node.id, message: msg, severity: 'warn', fluxId: ctx.fluxId, runId: ctx.runId });
    items = [];
  }

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    WfdContext.setVar(ctx, loopVar, typeof raw === 'string' ? raw : JSON.stringify(raw));
    WfdContext.setVar(ctx, loopVar + '_index', String(i));
    // Objet : exposer aussi ses champs à plat (même convention que le reste
    // du moteur), ex: {item.id}, {item.title} — sans avoir à parser du JSON.
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([k, v]) => {
        if (v !== null && v !== undefined && typeof v !== 'object') {
          WfdContext.setVar(ctx, loopVar + '.' + k, String(v));
        }
      });
    }

    await followPort(node, 0, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);

    // Une erreur fatale dans le corps de boucle arrête tout le flux, pas
    // seulement l'itération courante — cohérent avec le comportement des
    // autres nœuds (onError: 'stop').
    if (ctx.status === 'failed') {
      emit(onEvent, 'node:done', { nodeId: node.id, port: 0, name: node.name, family: node.family, fluxId: ctx.fluxId, runId: ctx.runId, count: i + 1 });
      return;
    }
  }

  emit(onEvent, 'node:done', { nodeId: node.id, port: 1, name: node.name, family: node.family, fluxId: ctx.fluxId, runId: ctx.runId, count: items.length });
  await followPort(node, 1, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
}

// ── Suivre les connexions depuis un port ────────────────────────
async function followPort(node, port, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient = null) {
  const nextNodes = graph.getNextNodes(node.id, port);

  if (!nextNodes.length) return; // fin de branche

  // Exécuter les nœuds suivants en séquence
  // (parallèle possible si besoin mais séquence plus prévisible)
  for (const nextNode of nextNodes) {
    await executeNode(nextNode, graph, ctx, nodeHandlers, iconikClient, onEvent, resolveClient);
  }
}

// ── Construire le graphe de connexions ──────────────────────────
function buildGraph(nodes, connections) {
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  // Index : fromNode + fromPort → [toNode]
  const edges = {};
  (connections || []).forEach(c => {
    const key = c.fromNode + ':' + (c.fromPort || 0);
    if (!edges[key]) edges[key] = [];
    edges[key].push(c.toNode);
  });

  return {
    getNextNodes(nodeId, port = 0) {
      const key = nodeId + ':' + port;
      return (edges[key] || []).map(id => nodeMap[id]).filter(Boolean);
    },
    getNode(nodeId) {
      return nodeMap[nodeId];
    },
  };
}

// ── Construire un client Iconik depuis les credentials ctx._iconikAuth ────────
// Utilisé comme fallback quand aucun iconikEnv n'est configuré sur le nœud/flux
// mais que la Custom Action a transmis son propre auth_token.
function _buildClientFromAuth(auth) {
  const https = require('https');
  const http  = require('http');

  const request = (method, path, body) => new Promise((resolve, reject) => {
    const url = new URL(path, 'https://app.iconik.io');
    const lib = url.protocol === 'https:' ? https : http;
    const headers = {
      'App-ID'      : auth.appId || '',
      'Auth-Token'  : auth.token || '',
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
          } else resolve(parsed);
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

// ── Émettre un événement de log ─────────────────────────────────
function emit(onEvent, type, data) {
  if (typeof onEvent === 'function') {
    try { onEvent(type, { ...data, at: new Date().toISOString() }); }
    catch (_) {}
  }
}

// ── Export ───────────────────────────────────────────────────────
const WfdExecutor = { executeFlux, buildGraph };

if (typeof module !== 'undefined') module.exports = WfdExecutor;
// Exposer les fonctions de release sur WfdExecutor
WfdExecutor.releaseNode = releaseNode;
WfdExecutor.rejectNode  = rejectNode;
WfdExecutor._wfdPaused  = _wfdPaused;
if (typeof window !== 'undefined') window.WfdExecutor = WfdExecutor;
