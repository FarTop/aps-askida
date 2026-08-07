// APS — server/engine-builder/builder-context.js — créé le 2026-08-05
// ================================================================
// builder-context.js — Contexte d'exécution du moteur natif du Builder
//
// Port de server/engine/wfd-engine-context.js (voir le plan
// abstract-honking-map.md, §3) : même forme, même moteur de templates.
// Zéro require de wfd-engine*.js — code indépendant, pas un raccourci.
//
// Différences volontaires avec l'original WFD :
//   - `fluxId` → `flowId` (vocabulaire Builder, pas WFD)
//   - `_loopScopes` : pile utilisée par builder-executor.js pour scoper les
//     variables de boucle imbriquées (corrige un bug documenté de WFD, où
//     une boucle interne réutilisant le nom de variable d'une boucle externe
//     écrase silencieusement la valeur externe sans jamais la restaurer).
// ================================================================

'use strict';

function createContext(triggerPayload = {}) {
  return {
    asset      : {},
    collection : {},
    file       : {},
    event      : {},
    user       : {},

    vars    : {},
    results : {},

    status   : 'running',  // running | success | partial | failed
    errors   : [],         // [{ node, message, severity: 'info'|'warn'|'fatal', at }] — cf. computeStatus
    startedAt: new Date().toISOString(),
    flowId   : triggerPayload._flowId || '',
    runId    : triggerPayload._runId  || generateRunId(),

    _trigger    : triggerPayload,
    _loopScopes : [],
  };
}

// ── Horodatage courant dans un fuseau donné ──────────────────────
function _nowInZone(tz, fmt) {
  const d    = new Date();
  const zone = tz || process.env.APS_TIMEZONE || 'Europe/Paris';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  } catch (_) {
    throw new Error(`now() : fuseau horaire inconnu "${zone}" (attendu un identifiant IANA, ex. Europe/Paris)`);
  }
  const Y  = parts.year, M = parts.month, D = parts.day;
  const H  = parts.hour === '24' ? '00' : parts.hour;
  const mi = parts.minute, S = parts.second;

  const asUTC  = Date.UTC(+Y, +M - 1, +D, +H, +mi, +S);
  const utcSec = Math.floor(d.getTime() / 1000) * 1000;
  const offMin = Math.round((asUTC - utcSec) / 60000);
  const sign   = offMin >= 0 ? '+' : '-';
  const ao     = Math.abs(offMin);
  const off    = `${sign}${String(Math.floor(ao / 60)).padStart(2, '0')}:${String(ao % 60).padStart(2, '0')}`;

  switch ((fmt || '').toLowerCase()) {
    case 'date':      return `${Y}-${M}-${D}`;
    case 'time':      return `${H}:${mi}:${S}`;
    case 'timestamp': return String(d.getTime());
    case 'utc':       return d.toISOString();
    default:          return `${Y}-${M}-${D}T${H}:${mi}:${S}${off}`;
  }
}

// ── Résoudre une variable dans le contexte ───────────────────────
function resolve(template, ctx) {
  if (template === null || template === undefined) return '';
  const str = String(template);

  return str.replace(/\{([^}]+)\}/g, (match, path) => {
    const p = path.trim();
    const condMatch = p.match(/^([^?]+)\?([^|]*)\|(.*)$/);
    if (condMatch) {
      const key     = condMatch[1].trim();
      const ifTrue  = condMatch[2];
      const ifFalse = condMatch[3];
      const val     = resolvePath(key, ctx);
      return (val !== undefined && val !== null && val !== '') ? ifTrue : ifFalse;
    }
    const nowMatch = p.match(/^now(?:\(([^)]*)\))?$/);
    if (nowMatch) {
      const args = (nowMatch[1] || '').split(',').map(s => s.trim()).filter(Boolean);
      return _nowInZone(args[0], args[1]);
    }
    const fnMatch = p.match(/^(slug|upper|lower|trim|add|pad|filebase)\((.+)\)$/);
    if (fnMatch) {
      const fn      = fnMatch[1];
      const argsStr = fnMatch[2];

      const resolveNum = (part) => {
        const t = part.trim();
        if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
        const v = resolvePath(t, ctx);
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
      };

      if (fn === 'add') {
        const sum = argsStr.split(',').reduce((acc, part) => acc + resolveNum(part), 0);
        return String(sum);
      }
      if (fn === 'pad') {
        const parts = argsStr.split(',');
        const t0 = parts[0].trim();
        const rawVal = /^-?\d+(\.\d+)?$/.test(t0) ? t0 : String(resolvePath(t0, ctx) ?? '');
        const width = parseInt(parts[1], 10) || 0;
        return rawVal.padStart(width, '0');
      }

      const key = argsStr.trim();
      const raw = resolvePath(key, ctx);
      const val = raw !== undefined && raw !== null ? String(raw) : '';
      switch (fn) {
        case 'slug':  return val.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                               .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
        case 'upper': return val.toUpperCase();
        case 'lower': return val.toLowerCase();
        case 'trim':  return val.trim();
        case 'filebase': {
          const noExt = val.replace(/\.[a-zA-Z0-9]{1,6}$/, '');
          return noExt.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                      .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
        }
        default:      return val;
      }
    }
    const val = resolvePath(p, ctx);
    return val !== undefined && val !== null ? String(val) : match;
  });
}

// ── Résoudre un chemin pointé dans le contexte ──────────────────
function resolvePath(path, ctx) {
  const parts = [];
  for (const segment of path.split('.')) {
    const m = segment.match(/^([^\[]+)(\[\d+\])*$/);
    if (!m) { parts.push(segment); continue; }
    parts.push(m[1]);
    const indices = segment.match(/\[(\d+)\]/g) || [];
    for (const idx of indices) parts.push(parseInt(idx.slice(1, -1)));
  }
  let val = ctx;
  for (const part of parts) {
    if (val === null || val === undefined) { val = undefined; break; }
    val = val[part];
  }
  if ((val === undefined || val === null) && ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, path)) {
    val = ctx.vars[path];
  }
  if ((val === undefined || val === null) && ctx.results) {
    let rVal = ctx.results;
    for (const part of parts) {
      if (rVal === null || rVal === undefined) break;
      rVal = rVal[part];
    }
    if (rVal !== undefined && rVal !== null) val = rVal;
  }
  return val;
}

// ── Écrire une variable utilisateur dans le contexte ────────────
function setVar(ctx, key, value, mode = 'set') {
  const resolved = resolve(value, ctx);
  switch (mode) {
    case 'set':
      ctx.vars[key] = resolved;
      break;
    case 'append':
      ctx.vars[key] = (ctx.vars[key] || '') + resolved;
      break;
    case 'push':
      if (!Array.isArray(ctx.vars[key])) ctx.vars[key] = [];
      ctx.vars[key].push(resolved);
      break;
  }
}

// ── Stocker un résultat d'étape ──────────────────────────────────
function storeResult(ctx, varName, data) {
  ctx.results[varName] = data;
}

// ── Enregistrer une erreur ───────────────────────────────────────
function addError(ctx, stepId, message, severity = 'warn') {
  ctx.errors.push({
    node     : stepId,
    message  : message,
    severity : severity,
    at       : new Date().toISOString(),
  });
  ctx.status = computeStatus(ctx);
}

// `info` : constat consigné pour le diagnostic, JAMAIS un échec — un step
// qui renvoie un port routable normal (ex. le `miss` d'un deliver : « pas
// encore là, va le chercher ») décrit un chemin nominal, pas une erreur.
// C'est le GRAPHE qui décide si ce port est un problème, pas le handler.
// Sans cette distinction, une première publication parfaitement réussie
// restait marquée `partial` à jamais : le pré-contrôle S3 initial ne PEUT
// pas trouver les fichiers avant leur upload, et ce constat attendu
// polluait le verdict final (constaté le 2026-08-06 sur un run PUBLISH
// intégralement réussi — Partner 201, Verify 3/3, History ✅ Succès).
function computeStatus(ctx) {
  if (ctx.status === 'failed') return 'failed';
  if (ctx.errors.some(e => e.severity === 'fatal')) return 'failed';
  if (ctx.errors.some(e => e.severity !== 'info')) return 'partial';
  return 'running';
}

function finalizeSuccess(ctx) {
  if (ctx.status === 'running') ctx.status = 'success';
  ctx.finishedAt = new Date().toISOString();
}

function snapshot(ctx) {
  return {
    runId     : ctx.runId,
    flowId    : ctx.flowId,
    status    : ctx.status,
    startedAt : ctx.startedAt,
    finishedAt: ctx.finishedAt || null,
    asset     : ctx.asset,
    collection: ctx.collection,
    errors    : ctx.errors,
    vars      : ctx.vars,
    results   : ctx.results,
  };
}

function generateRunId() {
  return 'brun-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// ── Scope de variables de boucle (voir builder-executor.js, runLoop) ────────
// pushLoopScope/popLoopScope encadrent l'exécution COMPLETE d'un nœud loop
// (toutes ses itérations) ; scopedSetVar est utilisé uniquement pour les
// écritures faites par le mécanisme d'itération lui-même (loopVar,
// loopVar_index, champs aplatis), jamais pour un set_variable ordinaire.
function pushLoopScope(ctx) {
  (ctx._loopScopes || (ctx._loopScopes = [])).push(new Map());
}

function scopedSetVar(ctx, key, value) {
  const frame = ctx._loopScopes && ctx._loopScopes[ctx._loopScopes.length - 1];
  if (frame && !frame.has(key)) {
    frame.set(key, Object.prototype.hasOwnProperty.call(ctx.vars, key) ? ctx.vars[key] : undefined);
  }
  ctx.vars[key] = value;
}

function popLoopScope(ctx) {
  const frame = ctx._loopScopes && ctx._loopScopes.pop();
  if (!frame) return;
  for (const [key, prev] of frame) {
    if (prev === undefined) delete ctx.vars[key];
    else ctx.vars[key] = prev;
  }
}

// ── Résoudre une RÉFÉRENCE (pas un gabarit) ─────────────────────
// Un champ comme `targetId` ou `fetchValue` désigne un objet à atteindre. Il
// s'écrit normalement `{collection.id}`, mais le panneau de configuration
// stocke la nature `variable` SANS accolades (config-renderer.js : « on
// affiche {brut}, on stocke brut ») — ce qui est juste pour un `resultVar`
// (un nom qu'on définit) et destructeur pour une référence (un nom qu'on lit).
//
// Constaté en production le 2026-08-07 : entre la v16 et la v18 de PUBLISH,
// `targetId` est passé de "{collection_id}" à "collection_id", et l'appel est
// devenu /API/metadata/v1/collections/collection_id/ → 404. Le handler
// `lookup` ne souffrait pas du problème parce qu'il retire lui-même les
// accolades avant de résoudre ; les autres exigeaient qu'elles soient là.
//
// On aligne donc tout le monde sur le comportement tolérant :
//   "{collection.id}"  → gabarit, substitué comme avant
//   "collection_id"    → nom nu, cherché dans le contexte
//   "9082419a-…"       → introuvable, donc rendu tel quel (c'est un vrai id)
// Un résultat non scalaire est refusé : "collection" désigne un OBJET, le
// prendre pour une référence produirait "[object Object]" dans une URL.
function resolveRef(value, ctx) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (str.includes('{')) return resolve(str, ctx);
  const trouve = resolvePath(str, ctx);
  if (trouve === undefined || trouve === null || typeof trouve === 'object') return str;
  return String(trouve);
}

const BuilderContext = {
  createContext,
  resolve,
  resolvePath,
  resolveRef,
  setVar,
  storeResult,
  addError,
  computeStatus,
  finalizeSuccess,
  snapshot,
  pushLoopScope,
  scopedSetVar,
  popLoopScope,
};

module.exports = BuilderContext;
