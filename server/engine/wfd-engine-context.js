// ================================================================
// wfd-engine-context.js — Gestion du contexte d'exécution WFD
// 
// Responsabilités :
//   - Créer un contexte isolé par exécution de flux
//   - Résoudre les variables {asset.title}, {vars.maVar} etc.
//   - Enregistrer les erreurs et calculer le statut
//   - Fournir un snapshot lisible pour les logs
// ================================================================

'use strict';

// ── Créer un contexte vierge pour une nouvelle exécution ─────────
function createContext(triggerPayload = {}) {
  return {
    // Objets métier — peuplés par le trigger puis enrichis par les nœuds
    asset      : {},
    collection : {},
    file       : {},
    event      : {},
    user       : {},

    // Variables utilisateur — définies par les nœuds Variable
    vars : {},

    // Résultats intermédiaires — stockés par les nœuds Récupérer
    // ex: results.destinationsPad = { id, title, metadata... }
    results : {},

    // État d'exécution — géré par le Engine
    status   : 'running',  // running | success | partial | failed
    errors   : [],         // [{ node, message, severity: 'warn'|'fatal' }]
    startedAt: new Date().toISOString(),
    fluxId   : triggerPayload._fluxId || '',
    runId    : triggerPayload._runId  || generateRunId(),

    // Payload brut du trigger — accessible en lecture seule
    _trigger : triggerPayload,
  };
}

// ── Résoudre une variable dans le contexte ───────────────────────
// Supporte :
//   {asset.id}              → ctx.asset.id
//   {vars.maVar}            → ctx.vars.maVar
//   {results.dest.title}    → ctx.results.dest.title
//   {collection.id}         → ctx.collection.id
//   Valeur fixe sans {}     → retournée telle quelle

function resolve(template, ctx) {
  if (template === null || template === undefined) return '';
  const str = String(template);

  return str.replace(/\{([^}]+)\}/g, (match, path) => {
    const p = path.trim();
    // Conditionnel : {variable?texte_si_présent|texte_si_absent}
    const condMatch = p.match(/^([^?]+)\?([^|]*)\|(.*)$/);
    if (condMatch) {
      const key     = condMatch[1].trim();
      const ifTrue  = condMatch[2];
      const ifFalse = condMatch[3];
      const val     = resolvePath(key, ctx);
      return (val !== undefined && val !== null && val !== '') ? ifTrue : ifFalse;
    }
    // Transformations inline : {slug(Titre)}, {upper(Titre)}, {lower(Titre)}, {trim(Titre)}
    const fnMatch = p.match(/^(slug|upper|lower|trim)\((.+)\)$/);
    if (fnMatch) {
      const fn  = fnMatch[1];
      const key = fnMatch[2].trim();
      const raw = resolvePath(key, ctx);
      const val = raw !== undefined && raw !== null ? String(raw) : '';
      switch (fn) {
        case 'slug':  return val.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                               .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
        case 'upper': return val.toUpperCase();
        case 'lower': return val.toLowerCase();
        case 'trim':  return val.trim();
        default:      return val;
      }
    }
    const val = resolvePath(p, ctx);
    return val !== undefined && val !== null ? String(val) : match;
  });
}

// ── Résoudre un chemin pointé dans le contexte ──────────────────
// ex: "asset.title" → ctx.asset.title
// ex: "vars.monChamp" → ctx.vars.monChamp
function resolvePath(path, ctx) {
  // Supporte la notation pointée ET les indices de tableau
  // ex: "results.asset_metadata.metadata_values.Genres.field_values[0].value"
  // Découpe d'abord sur les points, puis gère les [n] dans chaque segment
  const parts = [];
  for (const segment of path.split('.')) {
    const m = segment.match(/^([^\[]+)(\[\d+\])*$/);
    if (!m) { parts.push(segment); continue; }
    parts.push(m[1]); // nom de clé
    // Extraire tous les indices [0][1]...
    const indices = segment.match(/\[(\d+)\]/g) || [];
    for (const idx of indices) parts.push(parseInt(idx.slice(1,-1)));
  }
  let val = ctx;
  for (const part of parts) {
    if (val === null || val === undefined) { val = undefined; break; }
    val = val[part];
  }
  // Si non trouvé au niveau ctx, essayer ctx.vars en clé plate avec le chemin
  // complet (ex: {serieMetadata.BayardID} → ctx.vars['serieMetadata.BayardID'],
  // posee telle quelle par le fetch metadata pour chaque champ expose — pas un
  // chemin imbrique a parcourir, une seule cle contenant un point). Couvre au
  // passage l'ancien cas a 1 segment ({asset_id} → ctx.vars.asset_id).
  if ((val === undefined || val === null) && ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, path)) {
    val = ctx.vars[path];
  }
  // Si toujours non trouvé, essayer ctx.results (ex: {vfStatus.body.status} → ctx.results.vfStatus.body.status)
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
// mode : 'set' | 'append' | 'push'
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

// ── Stocker un résultat de nœud Récupérer ───────────────────────
// ex: storeResult(ctx, 'destinationsPad', { id, title, metadata })
function storeResult(ctx, varName, data) {
  ctx.results[varName] = data;
  // Exposer aussi à plat pour résolution directe
  // ex: {destinationsPad.id} → ctx.results.destinationsPad.id
}

// ── Enregistrer une erreur ───────────────────────────────────────
function addError(ctx, nodeName, message, severity = 'warn') {
  ctx.errors.push({
    node     : nodeName,
    message  : message,
    severity : severity,
    at       : new Date().toISOString(),
  });
  // Recalculer le statut global
  ctx.status = computeStatus(ctx);
}

// ── Calculer le statut global selon les erreurs ─────────────────
function computeStatus(ctx) {
  if (ctx.status === 'failed') return 'failed'; // fatal déjà posé
  if (ctx.errors.some(e => e.severity === 'fatal')) return 'failed';
  if (ctx.errors.length > 0) return 'partial';
  return 'running'; // sera passé à 'success' en fin de flux
}

// ── Finaliser le contexte en fin de flux réussi ─────────────────
function finalizeSuccess(ctx) {
  if (ctx.status === 'running') ctx.status = 'success';
  ctx.finishedAt = new Date().toISOString();
}

// ── Snapshot pour les logs ───────────────────────────────────────
function snapshot(ctx) {
  return {
    runId    : ctx.runId,
    fluxId   : ctx.fluxId,
    status   : ctx.status,
    startedAt: ctx.startedAt,
    finishedAt: ctx.finishedAt || null,
    asset    : ctx.asset,
    errors   : ctx.errors,
    vars     : ctx.vars,
  };
}

// ── Générer un ID d'exécution unique ────────────────────────────
function generateRunId() {
  return 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// ── Export ───────────────────────────────────────────────────────
// Compatible navigateur (window) et Node.js (module.exports)
const WfdContext = {
  createContext,
  resolve,
  resolvePath,
  setVar,
  storeResult,
  addError,
  computeStatus,
  finalizeSuccess,
  snapshot,
};

if (typeof module !== 'undefined') module.exports = WfdContext;
if (typeof window !== 'undefined') window.WfdContext = WfdContext;
