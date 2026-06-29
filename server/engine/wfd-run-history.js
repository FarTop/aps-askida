// ================================================================
// wfd-run-history.js — Historique des runs WFD
//
// Architecture :
//   RunHistoryStore   → interface stable indépendante du stockage
//   JsonAdapter       → implémentation fichier JSON (aujourd'hui)
//   RunHistoryService → écoute les events engine, construit les records
//
// Migration future : remplacer JsonAdapter par SqliteAdapter ou
// HttpAdapter sans toucher au reste de l'app.
// ================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════
// JsonAdapter — stockage fichier JSON
// ════════════════════════════════════════════════════════════════

class JsonAdapter {
  constructor(filePath) {
    this._file = filePath;
    this._data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._file)) {
        return JSON.parse(fs.readFileSync(this._file, 'utf8'));
      }
    } catch(e) {
      console.warn('[RunHistory] Fichier corrompu, réinitialisation :', e.message);
    }
    return { runs: {}, index: [] }; // index = runIds triés par date desc
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this._file), { recursive: true });
      fs.writeFileSync(this._file, JSON.stringify(this._data, null, 0), 'utf8');
    } catch(e) {
      console.error('[RunHistory] Erreur sauvegarde :', e.message);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────

  create(runRecord) {
    this._data.runs[runRecord.runId] = runRecord;
    this._data.index.unshift(runRecord.runId);
    this._save();
  }

  get(runId) {
    return this._data.runs[runId] || null;
  }

  update(runId, patch) {
    if (!this._data.runs[runId]) return false;
    Object.assign(this._data.runs[runId], patch);
    this._save();
    return true;
  }

  delete(runId) {
    if (!this._data.runs[runId]) return false;
    delete this._data.runs[runId];
    this._data.index = this._data.index.filter(id => id !== runId);
    this._save();
    return true;
  }

  // ── Requêtes ─────────────────────────────────────────────────

  listByFlux(fluxId, limit = 50) {
    return this._data.index
      .filter(id => this._data.runs[id]?.fluxId === fluxId)
      .slice(0, limit)
      .map(id => this._data.runs[id]);
  }

  listByNode(nodeId, limit = 50) {
    return this._data.index
      .filter(id => this._data.runs[id]?.nodes?.some(n => n.nodeId === nodeId))
      .slice(0, limit)
      .map(id => this._data.runs[id]);
  }

  listRecent(limit = 100) {
    return this._data.index
      .slice(0, limit)
      .map(id => this._data.runs[id])
      .filter(Boolean);
  }

  // ── Rétention ────────────────────────────────────────────────

  applyRetention({ maxRuns = 500, maxAgeDays = 90 } = {}) {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    let removed = 0;

    // Supprimer par âge
    this._data.index = this._data.index.filter(id => {
      const run = this._data.runs[id];
      if (!run) return false;
      if (new Date(run.startedAt).getTime() < cutoff) {
        delete this._data.runs[id];
        removed++;
        return false;
      }
      return true;
    });

    // Supprimer par volume
    while (this._data.index.length > maxRuns) {
      const id = this._data.index.pop();
      delete this._data.runs[id];
      removed++;
    }

    if (removed > 0) {
      this._save();
      console.log('[RunHistory] Rétention : ' + removed + ' run(s) supprimé(s)');
    }
  }
}

// ════════════════════════════════════════════════════════════════
// RunHistoryStore — interface stable
// Toujours passer par cette classe, jamais par l'adapter directement
// ════════════════════════════════════════════════════════════════

class RunHistoryStore {
  constructor(adapter) {
    this._adapter = adapter;
  }

  // ── Écriture ─────────────────────────────────────────────────

  createRun(runRecord) {
    this._adapter.create(runRecord);
  }

  updateRun(runId, patch) {
    return this._adapter.update(runId, patch);
  }

  appendNodeRecord(runId, nodeRecord) {
    const run = this._adapter.get(runId);
    if (!run) return false;
    run.nodes = run.nodes || [];
    // Mettre à jour si nœud existe déjà (re-entrée sur le même nœud)
    const idx = run.nodes.findIndex(n => n.nodeId === nodeRecord.nodeId && !n.endedAt);
    if (idx >= 0) {
      Object.assign(run.nodes[idx], nodeRecord);
    } else {
      run.nodes.push(nodeRecord);
    }
    return this._adapter.update(runId, { nodes: run.nodes });
  }

  // ── Lecture ──────────────────────────────────────────────────

  getRun(runId) {
    return this._adapter.get(runId);
  }

  getRunsByFlux(fluxId, limit) {
    return this._adapter.listByFlux(fluxId, limit);
  }

  getRunsByNode(nodeId, limit) {
    return this._adapter.listByNode(nodeId, limit);
  }

  getRecentRuns(limit) {
    return this._adapter.listRecent(limit);
  }

  // ── Maintenance ──────────────────────────────────────────────

  deleteRun(runId) {
    return this._adapter.delete(runId);
  }

  applyRetention(settings) {
    this._adapter.applyRetention(settings);
  }
}

// ════════════════════════════════════════════════════════════════
// RunHistoryService — écoute les events engine, construit les records
// ════════════════════════════════════════════════════════════════

class RunHistoryService {
  constructor(store) {
    this._store    = store;
    this._fluxMap  = {}; // fluxId → { name, nodes }
  }

  // Appelé depuis wfd-engine-main.js pour référencer les flux chargés
  setFluxes(fluxes) {
    this._fluxMap = {};
    (fluxes || []).forEach(f => {
      this._fluxMap[f.id] = {
        name : f.name  || f.id,
        nodes: Object.fromEntries((f.nodes || []).map(n => [n.id, n])),
      };
    });
  }

  // ── Handler principal — branché sur engine.onEvent ────────────

  handleEvent(type, data) {
    try {
      switch(type) {

        case 'start': {
          // Nouveau run — créer le record
          const flux = this._fluxMap[data.fluxId] || {};
          this._store.createRun({
            runId    : data.runId,
            fluxId   : data.fluxId,
            fluxName : flux.name || data.fluxId,
            startedAt: data.at || new Date().toISOString(),
            endedAt  : null,
            status   : 'running',
            nodes    : [],
          });
          break;
        }

        case 'node:start': {
          const flux     = this._fluxMap[data.fluxId] || {};
          const nodeMeta = flux.nodes?.[data.nodeId] || {};
          this._store.appendNodeRecord(data.runId, {
            nodeId    : data.nodeId,
            nodeName  : data.name  || nodeMeta.name  || data.nodeId,
            nodeFamily: data.family || nodeMeta.family || '',
            nodeConfig: nodeMeta.config || null,   // config du nœud pour le Run Panel
            startedAt : data.at || new Date().toISOString(),
            endedAt   : null,
            status    : 'running',
            port      : null,
            summary   : null,
            error     : null,
            snapshot  : null,
          });
          break;
        }

        case 'node:done': {
          this._store.appendNodeRecord(data.runId, {
            nodeId    : data.nodeId,
            nodeName  : data.name   || '',
            nodeFamily: data.family || '',
            endedAt   : data.at || new Date().toISOString(),
            status    : data.warn ? 'warn' : 'done',
            port      : data.port ?? 0,
            summary   : _buildSummary(data),
            snapshot  : data.ctxSnapshot || null,
          });
          break;
        }

        case 'node:paused': {
          this._store.appendNodeRecord(data.runId, {
            nodeId     : data.nodeId,
            status     : 'paused',
            pausedAt   : data.at || new Date().toISOString(),
            assets     : data.assets || [],
            ports      : data.ports  || [],
            snapshot   : data.ctxSnapshot || null,
          });
          break;
        }

        case 'node:error': {
          this._store.appendNodeRecord(data.runId, {
            nodeId   : data.nodeId,
            endedAt  : data.at || new Date().toISOString(),
            status   : data.severity === 'fatal' ? 'error' : 'warn',
            error    : data.message,
            summary  : '⚠ ' + (data.message || ''),
            snapshot : data.ctxSnapshot || null,
          });
          break;
        }

        case 'node:skip': {
          this._store.appendNodeRecord(data.runId, {
            nodeId  : data.nodeId,
            endedAt : data.at || new Date().toISOString(),
            status  : 'skipped',
            summary : data.reason || 'Ignoré',
          });
          break;
        }

        case 'end':
        case 'flux:end': {
          this._store.updateRun(data.runId, {
            endedAt: data.at || new Date().toISOString(),
            status : data.status || 'success',
          });
          break;
        }
      }
    } catch(e) {
      console.warn('[RunHistory] handleEvent error :', e.message);
    }
  }
}

// ── Générer un résumé lisible selon la famille du nœud ──────────
// Enrichi au fil des familles connues — sans terme technique
function _buildSummary(data) {
  const name  = data.name   || '';
  const port  = data.port   ?? 0;
  const count = data.count;

  // Résumés génériques par port
  if (port === 1) return name + ' → chemin alternatif';
  if (port === 2) return name + ' → chemin erreur';
  if (count !== null && count !== undefined) {
    return name + ' — ' + count + ' élément(s) traité(s)';
  }
  return name + ' — terminé';
}

// ════════════════════════════════════════════════════════════════
// Factory — créer une instance prête à l'emploi
// ════════════════════════════════════════════════════════════════

function createRunHistory(dataDir, settings = {}) {
  const filePath = path.join(dataDir, 'run-history.json');
  const adapter  = new JsonAdapter(filePath);
  const store    = new RunHistoryStore(adapter);
  const service  = new RunHistoryService(store);

  // Appliquer la rétention au démarrage
  store.applyRetention(settings);

  return { store, service };
}

// ── Export ───────────────────────────────────────────────────────
module.exports = { createRunHistory, RunHistoryStore, RunHistoryService, JsonAdapter };
