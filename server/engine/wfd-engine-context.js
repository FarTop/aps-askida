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

// ── Horodatage courant dans un fuseau donne ──────────────────────
// Rend un ISO 8601 AVEC decalage ("2026-07-20T18:30:00+02:00"), et non un
// UTC brut : une date de notification doit etre lisible telle quelle par
// celui qui la consulte, sans conversion mentale.
//
// S'appuie sur Intl.DateTimeFormat (natif Node) : aucune dependance, et le
// passage heure d'ete / heure d'hiver est gere automatiquement pour tout
// fuseau IANA.
//
// Un fuseau inconnu leve une ERREUR. Se rabattre silencieusement sur UTC
// produirait une date fausse de deux heures dans une notification - trahison
// pire qu'un echec visible.
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
  const H  = parts.hour === '24' ? '00' : parts.hour;   // minuit rendu "24" par certaines locales
  const mi = parts.minute, S = parts.second;

  // Decalage = heure murale du fuseau lue comme si elle etait UTC, moins l'UTC reel.
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
    // Horodatage courant : {now}, {now(Europe/Paris)}, {now(Europe/Paris,date)}
    // Un horodatage de notification doit etre exact : on ne se rabat pas sur
    // {startedAt} (debut du run), qui peut preceder l'evenement de plusieurs
    // minutes a cause des temps d'export S3.
    const nowMatch = p.match(/^now(?:\(([^)]*)\))?$/);
    if (nowMatch) {
      const args = (nowMatch[1] || '').split(',').map(s => s.trim()).filter(Boolean);
      return _nowInZone(args[0], args[1]);
    }
    // Transformations inline : {slug(Titre)}, {upper(Titre)}, {lower(Titre)}, {trim(Titre)},
    // {add(a,b,...)}, {pad(valeur,largeur)}, {filebase(NomDeFichier)}
    const fnMatch = p.match(/^(slug|upper|lower|trim|add|pad|filebase)\((.+)\)$/);
    if (fnMatch) {
      const fn      = fnMatch[1];
      const argsStr = fnMatch[2];

      // add/pad prennent plusieurs arguments separes par une virgule -
      // traites a part, avant le cas general a 1 seul argument ci-dessous.
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

      // Cas existants : 1 seul argument, un chemin simple
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
          // Retire l'extension (ex: "cover.png" -> "cover"), PUIS applique la
          // meme normalisation que slug() — evite le probleme "point disparu,
          // fusionne dans le nom" quand un titre de fichier (avec extension)
          // est utilise tel quel dans slug(). Trouve en conditions reelles :
          // "Star_Trek_..._seasonpng.png" (extension dupliquee/mal formee).
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
