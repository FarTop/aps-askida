// WFD — wfd-engine-handlers.js — modifié le 2026-06-14 20:32
// ================================================================
// wfd-engine-handlers.js — Handlers métier par famille de nœud
//
// Chaque handler reçoit : (node, ctx, iconikClient)
//   node          : le nœud WFD tel que stocké dans le flux
//   ctx           : contexte d'exécution (WfdContext)
//   iconikClient  : client HTTP Iconik (peut être null en mode dry-run)
//
// Retourne : { port } où port est l'index de sortie (0 = nominal)
//
// Convention :
//   - Utiliser WfdContext.resolve(template, ctx) pour toute valeur
//   - Stocker les résultats via WfdContext.storeResult(ctx, key, data)
//   - Poser des variables via WfdContext.setVar(ctx, key, val)
//   - Lancer une Error pour déclencher la politique onError du nœud
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

// ── Helpers ──────────────────────────────────────────────────────

function r(val, ctx) {
  return WfdContext.resolve(val, ctx);
}

function requireIconik(iconikClient, nodeFamily) {
  if (!iconikClient) throw new Error(`Handler [${nodeFamily}] : iconikClient non configuré`);
}

// Évaluer une condition (utilisé par decision et qc)
function evalCondition(actual, op, expected) {
  const a = String(actual ?? '');
  const e = String(expected ?? '');
  switch (op) {
    case 'equals'          : return a === e;
    case 'not_equals'      : return a !== e;
    case 'is_empty'        : return a === '' || actual == null;
    case 'not_empty'       : return a !== '' && actual != null;
    case 'contains'        : return a.includes(e);
    case 'not_contains'    : return !a.includes(e);
    case 'starts_with'     : return a.startsWith(e);
    case 'ends_with'       : return a.endsWith(e);
    case 'not_starts_with' : return !a.startsWith(e);
    case 'not_ends_with'   : return !a.endsWith(e);
    case 'matches_regex'   : { try { return new RegExp(e).test(a); } catch(_) { return false; } }
    case 'not_matches_regex': { try { return !new RegExp(e).test(a); } catch(_) { return true; } }
    case 'gt'              : return parseFloat(a) > parseFloat(e);
    case 'gte'             : return parseFloat(a) >= parseFloat(e);
    case 'lt'              : return parseFloat(a) < parseFloat(e);
    case 'lte'             : return parseFloat(a) <= parseFloat(e);
    case 'in_list'         : return e.split(',').map(x => x.trim()).includes(a);
    case 'not_in_list'     : return !e.split(',').map(x => x.trim()).includes(a);
    case 'present'         : return actual != null && a !== '';
    case 'absent'          : return actual == null || a === '';
    default                : return false;
  }
}

// ── DÉCISION ─────────────────────────────────────────────────────
// Lit ctx.vars[field] ou ctx.asset[field] et branche selon les conditions.
// Port 0 = condition 0 vraie, port 1 = condition 1, …, dernier port = else
async function decision(node, ctx) {
  const cfg  = node.config || {};
  const fieldRaw = cfg.field || '';

  // Si le champ est une variable simple {VarName}, extraire le nom et lire ctx.vars directement
  // Si c'est un chemin complexe {asset.metadata.X}, utiliser resolvePath
  const simpleMatch = fieldRaw.trim().match(/^\{([^}]+)\}$/);
  let actual;
  if (simpleMatch) {
    const varName = simpleMatch[1];
    actual = ctx.vars?.[varName];
    // Fallback : resolvePath pour les chemins imbriqués (asset.metadata.X)
    if (actual === undefined) actual = WfdContext.resolvePath(fieldRaw, ctx);
  } else {
    // Valeur brute ou template complexe — résoudre normalement
    const field = r(fieldRaw, ctx);
    actual = WfdContext.resolvePath(field, ctx);
    if (actual === undefined) actual = ctx.vars?.[field];
  }

  const conditions = cfg.conditions || [];

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    if (evalCondition(actual, cond.op || 'equals', r(cond.value || '', ctx))) {
      WfdContext.storeResult(ctx, '_decision', {
        field: fieldRaw, actual, matchedPort: i,
        matchedLabel: cond.label || ('Sortie ' + (i + 1)),
        matchedOp: cond.op, matchedValue: cond.value || '',
      });
      return { port: i };
    }
  }

  // Port else = dernier port disponible (conditions.length)
  const defaultLabel = cfg.defaultLabel || 'Par défaut';
  WfdContext.storeResult(ctx, '_decision', {
    field: fieldRaw, actual, matchedPort: conditions.length,
    matchedLabel: defaultLabel, matchedOp: 'default', matchedValue: '',
  });
  return { port: conditions.length };
}

// ── VARIABLE (set_var) ───────────────────────────────────────────
// Définit ou modifie une ou plusieurs variables dans ctx.vars
async function set_var(node, ctx) {
  const cfg = node.config || {};
  const assignments = cfg.assignments || [];

  for (const { key, value, mode } of assignments) {
    if (!key) continue;
    WfdContext.setVar(ctx, r(key, ctx), r(value || '', ctx), mode || 'set');
  }

  // Rétrocompat : ancienne forme key/value directe
  if (!assignments.length && cfg.key) {
    WfdContext.setVar(ctx, r(cfg.key, ctx), r(cfg.value || '', ctx), cfg.mode || 'set');
  }

  return { port: 0 };
}

// ── ID GENERATOR ─────────────────────────────────────────────────
// ── Génération/réutilisation d'un Bayard ID via BayardRegistry ──────
// Extrait de id_generator (comportement inchangé) pour être réutilisable
// par d'autres handlers (ex: create_tree) qui génèrent des IDs pour des
// objets qui ne sont ni ctx.asset ni ctx.collection (ex: une collection
// tout juste créée, à un niveau arbitraire de l'arbo).
async function _bayardIdFor(objectId, objectType, orgId, length, fallbackId) {
  let id = fallbackId;
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter  = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const _prisma  = new PrismaClient({ adapter });
  try {
    const existing = objectId ? await _prisma.bayardRegistry.findFirst({ where: { assetId: objectId } }) : null;
    if (existing) {
      id = existing.bayardId;
      console.log('[id_generator] ID existant réutilisé :', id, 'pour', objectType, objectId);
    } else {
      let attempts = 0;
      while (attempts < 10) {
        const conflict = await _prisma.bayardRegistry.findUnique({ where: { bayardId: id } });
        if (!conflict) break;
        const min = Math.pow(10, length - 1);
        const max = Math.pow(10, length) - 1;
        id = String(Math.floor(min + Math.random() * (max - min + 1)));
        attempts++;
      }
      if (objectId) {
        await _prisma.bayardRegistry.create({
          data: { id: require('crypto').randomUUID(), bayardId: id, assetId: objectId, assetType: objectType, orgId }
        });
        console.log('[id_generator] Nouvel ID enregistré :', id, 'pour', objectType, objectId);
      }
    }
  } catch(e) {
    console.warn('[id_generator] BayardRegistry :', e.message);
  } finally {
    await _prisma.$disconnect();
  }
  return id;
}

async function id_generator(node, ctx, iconikClient) {
  const cfg    = node.config || {};
  const type   = cfg.idType   || 'numeric';
  const length = Math.max(1, Math.min(64, parseInt(cfg.idLength) || 8));
  const prefix = cfg.idPrefix || '';
  const varName = cfg.varName || 'generated_id';

  // Générer l'ID selon le type
  let id = '';
  switch (type) {
    case 'numeric': {
      const min = Math.pow(10, length - 1);
      const max = Math.pow(10, length) - 1;
      id = String(Math.floor(min + Math.random() * (max - min + 1)));
      break;
    }
    case 'uuid': {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      break;
    }
    case 'hex': {
      const arr = new Array(length).fill(0).map(() => Math.floor(Math.random() * 16).toString(16));
      id = arr.join('').toUpperCase();
      break;
    }
    case 'alphanumeric': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      id = new Array(length).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
      break;
    }
    case 'prefixed': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const body = new Array(length).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
      id = prefix + body;
      break;
    }
    case 'timestamp': {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ts = now.getFullYear().toString() +
        pad(now.getMonth()+1) + pad(now.getDate()) + '-' +
        pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
      const rnd = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
      id = ts + '-' + rnd;
      break;
    }
    default:
      id = String(Math.floor(10000000 + Math.random() * 89999999));
  }

  // Garantir l'unicité via BayardRegistry
  if (type === 'numeric') {
    const assetId    = ctx.asset?.id || ctx.vars?.asset_id || '';
    const colId      = ctx.collection?.id || ctx.vars?.collection_id || '';
    const objectId   = assetId || colId;
    const objectType = assetId ? 'asset' : (colId ? 'collection' : 'asset');
    const orgId      = ctx.vars?.orgId || 'default';
    id = await _bayardIdFor(objectId, objectType, orgId, length, id);
  }

  // Stocker dans le contexte
  // Appliquer le type de sortie configuré
  const outputType = cfg.outputType || 'string';
  const finalId = outputType === 'integer' ? parseInt(id, 10) : id;
  WfdContext.setVar(ctx, varName, finalId);
  WfdContext.storeResult(ctx, '_id_generator', { type, id: finalId, varName, outputType });

  // Appels API optionnels
  const apiActions = cfg.apiActions || [];
  const apiErrors  = [];
  for (const apiAction of apiActions) {
    if (!apiAction.connexionId || !apiAction.actionId) continue;
    try {
      // Trouver la connexion et l'action
      const conn = (WfdHandlers._connexions || []).find(c => c.id === apiAction.connexionId);
      if (!conn) { apiErrors.push(`Connexion ${apiAction.connexionId} introuvable`); continue; }
      const action = (conn.actions || []).find(a => a.id === apiAction.actionId);
      if (!action) { apiErrors.push(`Action ${apiAction.actionId} introuvable`); continue; }

      // Construire le body avec l'ID injecté dans le champ spécifié
      const fieldName = apiAction.field || 'external_id';
      const body = { [fieldName]: type === 'numeric' ? Number(id) : id };

      const headers = { 'Content-Type': 'application/json' };
      if (conn.authType === 'bearer') headers['Authorization'] = 'Bearer ' + conn.authValue;
      else if (conn.authType === 'apikey') headers[conn.authHeader || 'X-Api-Key'] = conn.authValue;
      (conn.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value; });

      const url = (conn.baseUrl || conn.endpoint || '').replace(/\/$/, '') + action.endpoint;
      // node-fetch remplacé par fetch natif Node 18+
      const res = await fetch(url, {
        method : action.method || 'POST',
        headers,
        body   : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed; try { parsed = JSON.parse(text); } catch(_) { parsed = text; }
      WfdContext.storeResult(ctx, '_idgen_api_' + apiAction.actionId, { status: res.status, body: parsed });
      if (!res.ok && !(action.ignoreCodes || []).includes(res.status)) {
        apiErrors.push(`API ${action.name} → HTTP ${res.status}`);
      }
    } catch(e) {
      apiErrors.push(`API ${apiAction.actionId} : ${e.message}`);
    }
  }

  if (apiErrors.length) {
    WfdContext.addError(ctx, node.id, apiErrors.join(' | '));
    return { port: 1 }; // port erreur
  }

  return { port: 0 };
}

// ── TRANSFORMER ──────────────────────────────────────────────────
// Transforme une valeur (casse, trim, regex replace, template)
async function transform(node, ctx) {
  const cfg = node.config || {};

  // ── Mode composition (Transformer designer) — cfg.rules présent ──────────
  // Assemble plusieurs sources avec un séparateur, puis applique casse/maxLen
  if (Array.isArray(cfg.rules) && cfg.rules.length) {
    const sep    = cfg.separator || '_';
    const mode   = cfg.caseMode  || 'none';
    const maxLen = Number(cfg.maxLen) || 0;

    const parts = cfg.rules.map(rule => {
      const src = rule.source || 'literal';
      if (src === 'expression') {
        // Évaluer une expression arithmétique/ternaire avec variables résolues
        return _evalExpression(rule.value || rule.field || '', ctx);
      }
      // Résoudre selon la source
      const raw = src === 'literal' ? (rule.value || '')
                : src === 'var'     ? r(rule.field || '', ctx)
                : src === 'date'    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
                :  /* field */        _resolveMetaField(rule.field || '', ctx);
      return String(raw ?? '');
    }).filter(p => p !== '');

    let value = parts.join(sep);
    if (mode === 'upper') value = value.toUpperCase();
    if (mode === 'lower') value = value.toLowerCase();
    if (maxLen && value.length > maxLen) value = value.slice(0, maxLen) + '…';

    if (cfg.target) WfdContext.setVar(ctx, r(cfg.target, ctx), value);
    return { port: 0 };
  }

  // ── Mode simple (ancien handler) — opération sur une valeur ──────────────
  let value = r(cfg.source || cfg.value || '', ctx);

  switch (cfg.operation || cfg.caseMode) {
    case 'upper'  : value = value.toUpperCase();   break;
    case 'lower'  : value = value.toLowerCase();   break;
    case 'trim'   : value = value.trim();           break;
    case 'replace':
      if (cfg.find) value = value.replaceAll(r(cfg.find, ctx), r(cfg.replace || '', ctx));
      break;
    case 'regex_replace':
      try { value = value.replace(new RegExp(r(cfg.find, ctx), 'g'), r(cfg.replace || '', ctx)); }
      catch(_) {}
      break;
    case 'slice'  :
      value = value.slice(Number(cfg.start) || 0, cfg.end != null ? Number(cfg.end) : undefined);
      break;
    case 'pad_start':
      value = value.padStart(Number(cfg.length) || 0, cfg.char || '0');
      break;
    case 'truncate':
      if (cfg.maxLen && value.length > Number(cfg.maxLen)) {
        value = value.slice(0, Number(cfg.maxLen));
      }
      break;
    case 'separator_join':
      value = value.replace(/[\s_\-\.]+/g, cfg.separator || '_');
      break;
    case 'expression':
      // Évaluation directe d'une expression avec variables
      value = String(_evalExpression(cfg.expression || cfg.value || '', ctx) ?? '');
      break;
  }

  if (cfg.target) WfdContext.setVar(ctx, r(cfg.target, ctx), value);
  return { port: 0 };
}

// ── Résoudre un champ métadonnée depuis le contexte ──────────────────────────
// Cherche dans ctx.vars, ctx.results, ctx.asset
function _resolveMetaField(field, ctx) {
  if (!field) return '';
  // Chercher dans vars
  if (ctx.vars?.[field] !== undefined) return ctx.vars[field];
  // Chercher dans les résultats fetch (metadata_values)
  for (const key of Object.keys(ctx.results || {})) {
    const res = ctx.results[key];
    if (res?.metadata_values?.[field]?.field_values?.length) {
      return res.metadata_values[field].field_values
        .map(fv => fv.value).filter(Boolean).join(', ');
    }
    if (res?.[field] !== undefined) return res[field];
  }
  return '';
}

// ── Évaluer une expression avec substitution de variables ────────────────────
// Supporte : {vars.key}, {asset.id}, {results.asset.duration_milliseconds}
// Opérations : + - * / % Math.floor Math.round parseInt parseFloat
// Ternaires  : x > 1920 ? "HD" : "SD"
function _evalExpression(expr, ctx) {
  if (!expr) return '';
  try {
    // Substituer toutes les {references}
    const resolved = expr.replace(/\{([^}]+)\}/g, (match, path) => {
      const val = WfdContext.resolvePath(path.trim(), ctx)
               ?? ctx.vars?.[path.trim()]
               ?? _resolveMetaField(path.trim(), ctx);
      // Retourner la valeur brute (number reste number dans l'expression)
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'number') return val;
      const num = Number(val);
      if (!isNaN(num) && String(val).trim() !== '') return num;
      return JSON.stringify(String(val));
    });
    // Évaluer dans un sandbox minimal
    // eslint-disable-next-line no-new-func
    const fn = new Function('Math', 'parseInt', 'parseFloat', 'String', 'Number',
      '"use strict"; return (' + resolved + ')');
    const result = fn(Math, parseInt, parseFloat, String, Number);
    return result === null || result === undefined ? '' : result;
  } catch(e) {
    return '#ERREUR: ' + e.message;
  }
}

// ── QC (contrôle qualité) ─────────────────────────────────────────
// Port 0 = tout OK, port 1 = au moins une règle KO
async function qc(node, ctx) {
  const cfg   = node.config || {};
  const rules = cfg.rules   || [];
  const mode  = cfg.mode    || 'all'; // 'all' = toutes doivent passer, 'any' = au moins une

  const results = rules.map(rule => {
    const actual = WfdContext.resolvePath(r(rule.field || '', ctx), ctx)
                ?? ctx.vars[r(rule.field || '', ctx)];
    return evalCondition(actual, rule.op || 'present', r(rule.value || '', ctx));
  });

  const passed = mode === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);

  // Stocker les détails pour debug
  const details = rules.map((rule, i) => ({ field: rule.field, passed: results[i] }));
  WfdContext.storeResult(ctx, '_qc_' + node.id, { passed, details });

  return { port: passed ? 0 : 1 };
}

// ── BOUCLE (loop) ────────────────────────────────────────────────
// Port 0 = émettre chaque élément (executor doit gérer la répétition)
// Pour l'instant : injecte loopVar = premier élément et continue.
// Un vrai loop nécessite un mécanisme d'itération dans l'executor.
// ── SCRIPT ───────────────────────────────────────────────────────
// Exécute un script JS dans un contexte restreint
// La fonction doit retourner { port } ou une string (nom de port)
async function script(node, ctx) {
  const cfg  = node.config || {};
  const code = cfg.code    || cfg.script || '';
  if (!code) return { port: 0 };

  // Construire les variables exposées au script
  const scriptCtx = {
    asset        : ctx.asset,
    collection   : ctx.collection,
    vars         : ctx.vars,
    results      : ctx.results,
    metadata     : ctx._metadata || {},
    workflowName : ctx.fluxId || '',
    resolve      : (tpl) => WfdContext.resolve(tpl, ctx),
    setVar       : (k, v) => WfdContext.setVar(ctx, k, v),
  };

  // Exécution dans un Function isolé (pas de sandbox réel, usage interne)
  const fn = new Function(
    ...Object.keys(scriptCtx),
    `"use strict";\n${code}`
  );
  const result = await fn(...Object.values(scriptCtx));

  if (result && typeof result === 'object' && result.port !== undefined) {
    const portStr = String(result.port);
    // Résoudre le port : peut être un index ou un label
    const portsDef = cfg.ports || [];
    const portIdx  = portsDef.findIndex(p => p.label === portStr);
    return { port: portIdx >= 0 ? portIdx : (parseInt(portStr) || 0) };
  }

  return { port: 0 };
}

// ── Helper : résolution d'ID par nom (portabilité entre environnements) ────────
async function resolveByName(client, id, name, listEndpoint, nameField) {
  nameField = nameField || 'name';
  if (id) {
    try {
      const list = await client.get(listEndpoint + '?per_page=200');
      const items = list.objects || list.results || [];
      if (items.find(o => o.id === id)) return id; // ID valide
    } catch(e) { /* continuer */ }
    if (!name) throw new Error('ID "' + id + '" introuvable dans cet environnement — configurez le nom pour la résolution automatique');
  }
  if (!name) return id;
  const list = await client.get(listEndpoint + '?per_page=200');
  const items = list.objects || list.results || [];
  const found = items.find(o =>
    (o[nameField] || o.name || o.title || o.label || '').toLowerCase() === name.toLowerCase()
  );
  if (!found) throw new Error('"' + name + '" introuvable dans cet environnement (ID original: ' + (id||'—') + ')');
  console.log('[WFD] "' + name + '" résolu par nom → ' + found.id);
  return found.id;
}

// ── FETCH (Récupérer) ─────────────────────────────────────────────
// Appelle l'API Iconik et stocke le résultat dans ctx.results
async function fetch(node, ctx, iconikClient) {
  requireIconik(iconikClient, 'fetch');
  const cfg      = node.config || {};

  // fetchSubType est prioritaire sur fetchType (ancien format)
  const subType  = cfg.fetchSubType || (cfg.savedSearchId ? 'savedsearch'
    : cfg.fetchType === 'collection' ? 'collection'
    : cfg.fetchTarget === 'metadata' || cfg.fetchMdView ? 'metadata'
    : 'asset');

  // ── Saved Search ─────────────────────────────────────────────
  if (subType === 'savedsearch') {
    let   searchId = r(cfg.savedSearchId || '', ctx);
    const varName  = r(cfg.savedSearchVar || 'search_results', ctx);
    const limit    = cfg.savedSearchLimit || 100;
    const name     = cfg.savedSearchName  || '';
    if (!searchId && !name) throw new Error('Fetch Saved Search : savedSearchId et savedSearchName manquants');

    // Résolution par nom si l'ID n'existe pas dans cet environnement
    searchId = await resolveByName(iconikClient, searchId, name, '/API/search/v1/search/saved/', 'name');
    const data = await iconikClient.get(
      `/API/search/v1/search/saved/${searchId}/?per_page=${limit}`
    );
    WfdContext.storeResult(ctx, varName, data);
    const count = data.objects?.length || data.hits?.total || 0;
    WfdContext.setVar(ctx, varName + '_count', String(count));
    return { port: 0, count };
  }

  // ── Collection ───────────────────────────────────────────────
  if (subType === 'collection') {
    const varName = r(cfg.fetchVar || cfg.storeAs || 'collection', ctx);
    const src     = cfg.fetchSource || 'parent';
    let col;

    if (src === 'id') {
      const colId = r(cfg.fetchValue || '{collection.id}', ctx);
      col = await iconikClient.get(`/API/assets/v1/collections/${colId}/`);

    } else if (src === 'path') {
      // Corrigé le 10/07/2026 — auparavant identique à 'parent' (cfg.fetchValue
      // jamais lu). Résolution par recherche titre + vérification du chemin
      // via 'ancestors', même logique que celle historiquement prévue.
      const colPath = r(cfg.fetchValue || '', ctx);
      if (!colPath) throw new Error("Fetch collection par chemin : chemin manquant (fetchValue vide)");
      const parts = colPath.split('/').map(p => p.trim()).filter(Boolean);
      const title = parts[parts.length - 1];
      const result = await iconikClient.post('/API/search/v1/search/', {
        query: title, doc_types: ['collections'],
      });
      const candidates = result.objects || [];
      col = candidates.find(c => {
        const fullPath = (c.ancestors || []).map(a => a.title).join('/') + '/' + c.title;
        return fullPath.includes(colPath) || c.title === title;
      }) || candidates[0];
      if (!col) return { port: 1 }; // non trouvé

    } else {
      // Corrigé le 10/07/2026 — auparavant un no-op (re-fetchait la collection
      // déjà connue dans ctx.collection.id, sans jamais remonter à son parent).
      // Comportement à double entrée, selon ce qui a déclenché le flux :
      //   - déclenché par un Asset  → parent = 1ère collection contenant l'asset
      //   - déclenché par une Collection → parent = parent_id de cette collection
      // ⚠️ Logique neuve, non encore vérifiée en environnement réel (formats de
      // réponse Iconik à confirmer par un test console/curl avant mise en prod).
      const assetId = ctx.asset?.id || '';
      if (assetId) {
        const cols = await iconikClient.get(`/API/assets/v1/assets/${assetId}/collections/`);
        const list = cols.objects || cols.collections || [];
        if (!list.length) return { port: 1 };
        col = await iconikClient.get(`/API/assets/v1/collections/${list[0].id || list[0]}/`);
      } else {
        const currentId = r(ctx.collection?.id || '{collection.id}', ctx);
        if (!currentId) throw new Error('Fetch collection parent : ni asset ni collection dans le contexte');
        const current = await iconikClient.get(`/API/assets/v1/collections/${currentId}/`);
        if (!current.parent_id) return { port: 1 }; // collection racine, pas de parent
        col = await iconikClient.get(`/API/assets/v1/collections/${current.parent_id}/`);
      }
    }

    if (!col || !col.id) return { port: 1 };
    WfdContext.storeResult(ctx, varName, col);
    // Exposer quelques champs natifs a plat, meme convention que le fetch
    // metadata (varName.champ) - reference directe utilisable en aval, et
    // necessaire pour que l'apercu "derniere execution" du panneau ait
    // quelque chose a montrer pour ce sous-type (jusqu'ici seul metadata le
    // faisait).
    ['id', 'title', 'parent_id'].forEach(f => {
      if (col[f] !== undefined && col[f] !== null) WfdContext.setVar(ctx, varName + '.' + f, String(col[f]));
    });
    return { port: 0 };
  }

  // ── Métadonnées ──────────────────────────────────────────────
  if (subType === 'metadata') {
    const varName    = r(cfg.fetchVar || cfg.storeAs || 'metadata', ctx);
    // ID cible explicite (ex: {collectionData.parent_id}) — prioritaire sur tout
    // le reste. Rétrocompatible : si fetchValue est vide, comportement inchangé.
    const explicitId = cfg.fetchValue ? r(cfg.fetchValue, ctx) : '';
    const metaSource = cfg.fetchSource || 'triggered';
    let objectType, objectId;

    if (explicitId) {
      objectType = cfg.fetchTarget === 'asset' ? 'assets' : 'collections';
      objectId   = explicitId;

    } else if (metaSource === 'parent') {
      // Lire directement les metadata du PARENT du déclencheur, sans exposer
      // l'UUID intermediaire à l'utilisateur (ex: la Série d'une Saison).
      // Deux cas selon ce qui a déclenché le flux :
      //   - un Asset  -> sa 1ère collection contenante
      //   - une Collection -> le parent_id de cette collection
      const assetId = ctx.asset?.id || '';
      if (assetId) {
        const cols = await iconikClient.get(`/API/assets/v1/assets/${assetId}/collections/`);
        const list = cols.objects || cols.collections || [];
        if (!list.length) return { port: 1 }; // pas de collection parente
        objectType = 'collections';
        objectId   = list[0].id || list[0];
      } else {
        const currentId = ctx.collection?.id || '';
        if (!currentId) throw new Error('Fetch metadata (parent) : ni asset ni collection dans le contexte');
        const current = await iconikClient.get(`/API/assets/v1/collections/${currentId}/`);
        if (!current.parent_id) return { port: 1 }; // collection racine, pas de parent
        objectType = 'collections';
        objectId   = current.parent_id;
      }

    } else {
      const assetId = ctx.asset?.id || '';
      const colId   = ctx.collection?.id || '';
      objectType = colId && !assetId ? 'collections' : 'assets';
      objectId   = objectType === 'collections' ? colId : assetId;
    }
    const viewId     = r(cfg.fetchMdViewId || cfg.metadataViewId || cfg.fetchMdView || '', ctx);
    const endpoint   = viewId
      ? `/API/metadata/v1/${objectType}/${objectId}/views/${viewId}/`
      : `/API/metadata/v1/${objectType}/${objectId}/`;
    let data;
    try {
      data = await iconikClient.get(endpoint);
    } catch(e) {
      if (e.statusCode === 404 || e.message?.includes('404')) {
        // Vue non encore initialisée pour cet objet — traiter comme vide
        data = { metadata_values: {} };
      } else {
        throw e;
      }
    }
    // Filtrer les champs si spécifié
    const fields = cfg.metadataFields || [];
    if (fields.length && data.metadata_values) {
      const filtered = {};
      fields.forEach(f => { if (data.metadata_values[f]) filtered[f] = data.metadata_values[f]; });
      data.metadata_values = filtered;
    }
    WfdContext.storeResult(ctx, varName, data);
    // Exposer chaque champ MD : {varName.NomChamp}
    const _mvObj2 = data.metadata_values || {};
    Object.entries(_mvObj2).forEach(([fieldName, fieldData]) => {
      if (fieldName === '__separator__') return;
      const values = (fieldData?.field_values || [])
        .map(fv => fv.value)
        .filter(v => v !== null && v !== undefined && v !== '');
      if (!values.length) return;
      const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
      WfdContext.setVar(ctx, varName + '.' + fieldName, exposed);
    });
    return { port: 0 };
  }

  // ── Asset (défaut) ───────────────────────────────────────────
  const varName = r(cfg.fetchVar || cfg.storeAs || 'asset', ctx);
  const src     = cfg.fetchSource || 'triggered';
  let assetId;
  if (src === 'triggered' || src === 'id') {
    assetId = r(cfg.fetchValue || ctx.asset?.id || '{asset.id}', ctx);
  } else if (src === 'title') {
    // Recherche par titre
    const title = r(cfg.fetchValue || '', ctx);
    if (!title) throw new Error('Fetch asset par titre : valeur manquante');
    const results = await iconikClient.get(
      `/API/search/v1/search/?query=${encodeURIComponent(title)}&page_size=1`
    );
    const found = results.objects?.[0];
    if (!found) { return { port: 1 }; } // port Non trouvé
    WfdContext.storeResult(ctx, varName, found);
    if (cfg.withMetadata && found.id) {
      const mdViewId = r(cfg.fetchMdViewId || cfg.withMetadataViewId || cfg.fetchMdView || '', ctx)
        || ctx.vars?.metadata_view_id || '';
      const mdEndpoint = mdViewId
        ? `/API/metadata/v1/assets/${found.id}/views/${mdViewId}/`
        : `/API/metadata/v1/assets/${found.id}/`;
      const md = await iconikClient.get(mdEndpoint);
      WfdContext.storeResult(ctx, varName + '_metadata', md);
    }
    return { port: 0 };
  } else {
    assetId = r(ctx.asset?.id || '', ctx);
  }

  if (!assetId || assetId === '{asset.id}') {
    throw new Error('Fetch asset : assetId non résolu — ' + assetId);
  }

  const data = await iconikClient.get(`/API/assets/v1/assets/${assetId}/`);
  WfdContext.storeResult(ctx, varName, data);

  if (cfg.withMetadata) {
    // Priorité : viewId config → metadata_view_id du contexte (Custom Action) → sans vue
    const mdViewId = r(cfg.fetchMdViewId || cfg.withMetadataViewId || cfg.fetchMdView || '', ctx)
      || ctx.vars?.metadata_view_id || '';
    const mdEndpoint = mdViewId
      ? `/API/metadata/v1/assets/${assetId}/views/${mdViewId}/`
      : `/API/metadata/v1/assets/${assetId}/`;
    const md = await iconikClient.get(mdEndpoint);
    WfdContext.storeResult(ctx, varName + '_metadata', md);

    // ── Aplatissement automatique des metadata_values ──────────────────────
    // Expose chaque champ directement comme variable : {TypeContenu}, {Genres}…
    // L'utilisateur n'a plus besoin de connaître metadata_values.X.field_values[0].value
    const mvObj = md.metadata_values || {};
    Object.entries(mvObj).forEach(([fieldName, fieldData]) => {
      if (fieldName === '__separator__') return;
      const values = (fieldData?.field_values || [])
        .map(fv => fv.value)
        .filter(v => v !== null && v !== undefined && v !== '');
      if (!values.length) return;
      // Valeur unique → string, valeurs multiples → tableau JSON stringifié
      const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
      WfdContext.setVar(ctx, fieldName, exposed);
    });
  }

  if (cfg.withKeyframes) {
    try {
      const kf = await iconikClient.get(`/API/files/v1/assets/${assetId}/keyframes/`);
      WfdContext.storeResult(ctx, varName + '_keyframes', kf);
      const firstUrl = kf?.objects?.[0]?.url || kf?.objects?.[0]?.keyframe_url || '';
      if (firstUrl) WfdContext.setVar(ctx, varName + '_keyframe_url', firstUrl);
    } catch(e) {
      WfdContext.storeResult(ctx, varName + '_keyframes', { objects: [], error: e.message });
    }
  }

  // ── Métadonnées techniques (withFormats) ──────────────────────────────────
  // Process :
  //   1. GET /file_sets/ → récupérer le format_id du fichier original
  //   2. GET /formats/{formatId}/ → récupérer les composants et métadonnées
  // Les données techniques sont dans format.components (video = component avec codecs_video)
  // et dans format.metadata (général : frame_rate, size, overall_bit_rate)
  if (cfg.withFormats) {
    try {
      // Étape 1 : récupérer le format_id via file_sets
      const fileSetsRes = await iconikClient.get(`/API/files/v1/assets/${assetId}/file_sets/`);
      const fileSets    = fileSetsRes?.objects || [];
      const formatId    = fileSets[0]?.format_id;

      // Stocker le nom du fichier original (utile pour construire les chemins S3)
      console.log('[DEBUG filename] fileSets count:', fileSets.length, '| first name:', fileSets[0]?.name, '| first original_name:', fileSets[0]?.original_name);
      const _filename = fileSets[0]?.name || fileSets[0]?.original_name || '';
      if (_filename) {
        WfdContext.setVar(ctx, varName + '_filename', _filename);
        WfdContext.setVar(ctx, 'filename', _filename);
        // Sans extension
        const _filenameNoExt = _filename.replace(/\.[^.]+$/, '');
        WfdContext.setVar(ctx, varName + '_filename_noext', _filenameNoExt);
        WfdContext.setVar(ctx, 'filename_noext', _filenameNoExt);
      }

      if (!formatId) {
        WfdContext.storeResult(ctx, varName + '_formats', { error: 'Aucun file_set trouvé' });
      } else {
        // Étape 2 : récupérer le format complet
        const fmt = await iconikClient.get(`/API/files/v1/assets/${assetId}/formats/${formatId}/`);

        // Métadonnées générales (format.metadata = array)
        const gm = (Array.isArray(fmt.metadata) ? fmt.metadata[0] : fmt.metadata) || {};

        // Composants : sélection par kind_of_stream
        // - "Video"   → height, width, duration (ms), chroma, bit_depth, format (codec)
        // - "General" → codecs_video, audio_codecs
        // - "Audio"   → channel_s, audio_codecs
        const components = fmt.components || [];
        const vm = components.find(c => c.metadata?.kind_of_stream === 'Video')?.metadata   || {};
        const gmc= components.find(c => c.metadata?.kind_of_stream === 'General')?.metadata || {};
        const am = components.find(c =>
          c.metadata?.kind_of_stream === 'Audio' || c.metadata?.channel_s
        )?.metadata || {};

        // Durée : component vidéo → duration en ms
        if (vm.duration) {
          const durMs = parseInt(vm.duration);
          WfdContext.setVar(ctx, 'duration_ms', String(durMs));
          WfdContext.setVar(ctx, 'duration',    String(Math.round(durMs / 1000)));
        }

        // Général (depuis format.metadata[0])
        if (gm.format)           WfdContext.setVar(ctx, 'container',  gm.format);
        if (gm.overall_bit_rate) WfdContext.setVar(ctx, 'bitrate',    gm.overall_bit_rate);
        if (gm.size)             WfdContext.setVar(ctx, 'file_size',  gm.size);
        if (gm.frame_rate)       WfdContext.setVar(ctx, 'fps',        gm.frame_rate);

        // Vidéo (depuis component kind_of_stream=Video)
        if (vm.width)              WfdContext.setVar(ctx, 'width',       vm.width);
        if (vm.height)             WfdContext.setVar(ctx, 'height',      vm.height);
        // Codec vidéo : dans le component General (codecs_video) ou Video (format)
        const videoCodec = gmc.codecs_video || vm.format || vm.commercial_name || '';
        if (videoCodec)            WfdContext.setVar(ctx, 'video_codec', videoCodec);
        if (vm.chroma_subsampling) WfdContext.setVar(ctx, 'chroma',      vm.chroma_subsampling);
        if (vm.bit_depth)          WfdContext.setVar(ctx, 'bit_depth',   vm.bit_depth);

        // video_quality : max(width, height) pour couvrir portrait ET paysage
        const vw = parseInt(vm.width  || '0');
        const vh = parseInt(vm.height || '0');
        if (vw || vh) {
          const vmax = Math.max(vw, vh);
          WfdContext.setVar(ctx, 'video_quality', vmax >= 3840 ? 'UHD' : vmax >= 1280 ? 'HD' : 'SD');
        }

        // Audio
        const audioTracks = components.filter(c =>
          c.metadata?.kind_of_stream === 'Audio' || c.metadata?.channel_s
        ).length;
        if (audioTracks)             WfdContext.setVar(ctx, 'audio_tracks', String(audioTracks));
        const audioCodec = am.audio_codecs || gmc.audio_codecs || '';
        if (audioCodec)              WfdContext.setVar(ctx, 'audio_codec',  audioCodec);

        WfdContext.storeResult(ctx, varName + '_formats', {
          formatId, components: components.length, gm, vm, gmc, am
        });
      }
    } catch(e) {
      // Non bloquant
      WfdContext.storeResult(ctx, varName + '_formats', { error: e.message });
    }
  }

  return { port: 0 };
}

// ── Helper : écriture de valeurs imbriquées dans un objet ─────────
// Supporte :
//   'title'                  → obj.title = val
//   'images.amazon.cover_art'→ obj.images.amazon.cover_art = val
//   'persons[].external_id'  → obj.persons = [{external_id: v} for v in val]
//   'genres[]'               → obj.genres  = Array.isArray(val) ? val : [val]
function _setNestedValue(obj, path, val) {

  // Cas 1 : attribut fixe — persons[job=director].external_id
  const arrAttrMatch = path.match(/^([^[]+)\[([^=\]]+)=([^\]]+)\]\.(.+)$/);
  if (arrAttrMatch) {
    const listKey  = arrAttrMatch[1];
    const attrKey  = arrAttrMatch[2];
    const attrVal  = arrAttrMatch[3];
    const fieldKey = arrAttrMatch[4];
    if (!Array.isArray(obj[listKey])) obj[listKey] = [];
    // Parser si val est une string JSON de tableau
    let items = val;
    if (typeof val === 'string' && val.startsWith('[')) {
      try { items = JSON.parse(val); } catch(e) {}
    }
    items = Array.isArray(items) ? items : [items];
    items.forEach(function(v) {
      const entry = {};
      entry[attrKey]  = attrVal;
      entry[fieldKey] = v;
      obj[listKey].push(entry);
    });
    return;
  }

  // Cas 2 : tableau de scalaires — genres[]
  // [^.]+ interdit le point pour ne pas capturer availabilities.amazon
  const arrMatch = path.match(/^([^.[]+)\[\]$/);
  if (arrMatch) {
    obj[arrMatch[1]] = Array.isArray(val) ? val : [val];
    return;
  }

  // Cas 3 : tableau d'objets à fusionner — amazon[].starts_at ou amazon[0].starts_at
  const arrObjMatch = path.match(/^([^.[]+)\[(\d*)\]\.(.+)$/);
  if (arrObjMatch) {
    const listKey  = arrObjMatch[1];
    const idx      = arrObjMatch[2] !== '' ? parseInt(arrObjMatch[2]) : 0;
    const fieldKey = arrObjMatch[3];
    if (!Array.isArray(obj[listKey])) obj[listKey] = [];
    while (obj[listKey].length <= idx) obj[listKey].push({});
    _setNestedValue(obj[listKey][idx], fieldKey, val);
    return;
  }

  // Cas 4 : notation pointée — images.amazon.cover_art
  const dotIdx = path.indexOf('.');
  if (dotIdx > 0) {
    const head = path.slice(0, dotIdx);
    const tail = path.slice(dotIdx + 1);
    if (!obj[head] || typeof obj[head] !== 'object' || Array.isArray(obj[head])) {
      obj[head] = {};
    }
    _setNestedValue(obj[head], tail, val);
    return;
  }

  // Cas 5 : clé simple
  obj[path] = val;
}

// ── LOOKUP (table de correspondance) ─────────────────────────────
async function lookup(node, ctx) {
  const cfg    = node.config || {};
  // Support les deux formats : ancien (input/table/from/to) et nouveau (lkInputVar/lkRows/key/value)
  const inputVar = cfg.lkInputVar || cfg.input || '';
  const rows     = cfg.lkRows     || cfg.table || []; // [{ key, value } ou { from, to }]
  const target   = r(cfg.lkOutputVar || cfg.target || cfg.outputVar || '_lookup_result', ctx);
  const fallback = cfg.lkFallback   || cfg.default;

  // Résoudre la valeur d'entrée
  // Si c'est un chemin vers un objet (résultat Fetch), on récupère l'objet brut
  const inputStr   = inputVar.replace(/^\{|\}$/g, '');
  const inputRaw   = WfdContext.resolvePath(inputStr, ctx)
                  ?? ctx.results?.[inputStr]
                  ?? r(inputVar, ctx);
  const isObject   = inputRaw && typeof inputRaw === 'object' && !Array.isArray(inputRaw);

  if (isObject) {
    // ── Mode mapping d'objet ──────────────────────────────────────────────
    // Construit un nouvel objet en remplaçant les noms de clés selon la table
    // Si une ligne a des children, la valeur source est traduite via les enfants
    const mapped  = {};
    let   matched = 0;

    rows.forEach(row => {
      const fromKey  = (row.key || row.from || '').trim();
      const toKey    = (row.value || row.to || '').trim();
      const children = row.children || [];
      if (!fromKey || !toKey) return;

      // Chercher la valeur dans l'objet source
      // Si fromKey est une expression (contient { ou :// ), la résoudre directement
      let val;
      if (fromKey.includes('{') || fromKey.includes('://') || fromKey.includes('{{')) {
        val = r(fromKey, ctx);
      } else {
        val = inputRaw[fromKey];
      }

      // Chercher dans metadata_values (résultat Fetch Iconik)
      if (val === undefined && inputRaw.metadata_values) {
        const fv = inputRaw.metadata_values[fromKey]?.field_values;
        if (fv?.length) val = fv.length === 1 ? fv[0].value : fv.map(f => f.value);
      }

      // Chercher dans ctx.vars (variables aplaties par le Fetch)
      if (val === undefined) val = ctx.vars?.[fromKey];

      // Appliquer le fallback si la valeur est vide (r.fallback = variable WFD)
      if ((val === undefined || val === null || val === '') && row.fallback) {
        const fbKey = row.fallback.replace(/^\{|\}$/g, '');
        val = ctx.vars?.[fbKey] ?? r(row.fallback, ctx);
      }
      if (val === undefined || val === null || val === '') return;

      // Si la ligne a des sous-lignes de traduction, appliquer la traduction
      if (children.length) {
        const valStr = String(val);
        const child  = children.find(c => (c.key || c.src || '').trim() === valStr);
        if (child) {
          val = (child.value || child.tgt || '').trim();
        }
        // Si pas de correspondance trouvée, garder la valeur originale
      }
      // Si la ligne est marquée comme liste, wrapper en tableau
      // Supporte row.list = true (ancien format) et row.type = 'list' (nouveau format)
      if (row.list === true || row.list === 'true' || row.type === 'list') {
        val = Array.isArray(val) ? val : [val];
      }

      // Appliquer la conversion de type configurée sur la ligne
      const _rowType = row.type || 'string';
      if (_rowType === 'integer' && !Array.isArray(val)) {
        const _n = parseInt(String(val), 10);
        val = isNaN(_n) ? val : _n;
      } else if (_rowType === 'float' && !Array.isArray(val)) {
        const _f = parseFloat(String(val));
        val = isNaN(_f) ? val : _f;
      } else if (_rowType === 'boolean' && !Array.isArray(val)) {
        val = (val === 'true' || val === true || val === 1 || val === '1');
      }

      // Appliquer la transformation de format si configurée (ex: slug pour persons[].external_id)
      if (row._format === 'slug') {
        const _slugify = function(s) {
          return String(s).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        };
        if (Array.isArray(val)) {
          val = val.map(_slugify);
        } else if (typeof val === 'string' && val.startsWith('[')) {
          try {
            const parsed = JSON.parse(val);
            val = JSON.stringify(parsed.map(_slugify));
          } catch(e) { val = _slugify(val); }
        } else {
          val = _slugify(String(val));
        }
      }
      _setNestedValue(mapped, toKey, val);
      matched++;
    });

    WfdContext.storeResult(ctx, target, mapped);
    WfdContext.setVar(ctx, target, JSON.stringify(mapped));
    // Exposer aussi les champs plats (non imbriqués) comme variables directes
    // Ex: vodFactoryPayload.external_id → ctx.vars.external_id
    // Cela permet d'utiliser {external_id} directement dans les nœuds suivants
    Object.entries(mapped).forEach(([k, v]) => {
      if (!k.includes('.') && !k.includes('[') && typeof v !== 'object') {
        WfdContext.setVar(ctx, k, String(v ?? ''));
      }
    });

    // ── Stocker le résumé du mapping dans le snapshot pour le Run Panel ───
    if (rows.length) {
      const mappingMeta = rows
        .filter(row => (row.key || row.from) && (row.value || row.to))
        .map(row => {
          const fromKey  = (row.key  || row.from || '').trim();
          const toKey    = (row.value || row.to  || '').trim();
          const children = (row.children || []).map(c => ({
            key  : (c.key || c.src || '').trim(),
            value: (c.value || c.tgt || '').trim(),
          }));
          // Valeur source résolue
          let srcVal = inputRaw?.[fromKey];
          if (srcVal === undefined && inputRaw?.metadata_values) {
            const fv = inputRaw.metadata_values[fromKey]?.field_values;
            if (fv?.length) srcVal = fv.length === 1 ? fv[0].value : fv.map(f => f.value);
          }
          if (srcVal === undefined) srcVal = ctx.vars?.[fromKey];
          return { fromKey, toKey, children, srcVal: srcVal != null ? String(srcVal) : null };
        });
      WfdContext.storeResult(ctx, '_lk_meta_' + target, { rows: mappingMeta, outputVar: target });
    }

    return { port: matched > 0 ? 0 : 1 };
  }

  // ── Mode valeur simple ────────────────────────────────────────────────────
  const input = String(inputRaw ?? '');
  const def   = fallback != null ? r(String(fallback), ctx) : input;
  const match = rows.find(row => {
    const from = (row.key || row.from || '').trim();
    return r(from, ctx) === input || from === input;
  });
  const output = match ? r((match.value || match.to || ''), ctx) : def;
  WfdContext.setVar(ctx, target, output);
  return { port: match ? 0 : 1 };
}

// ── ACTION (Organiser / opérations Iconik) ───────────────────────
async function action(node, ctx, iconikClient) {
  requireIconik(iconikClient, 'action');
  const cfg = node.config || {};
  const type = cfg.actionType || '';

  let result;

  switch (type) {
    case 'asset_create': {
      result = await iconikClient.post('/API/assets/v1/assets/', {
        title      : r(cfg.title || '{asset.id}', ctx),
        object_type: cfg.objectType || 'assets',
        status     : cfg.status || 'ACTIVE',
      });
      if (result.id) WfdContext.setVar(ctx, 'asset_id', result.id);
      break;
    }

    case 'asset_patch': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.patch(`/API/assets/v1/assets/${aid}/`, {
        [r(cfg.field || 'title', ctx)]: r(cfg.value || '', ctx),
      });
      break;
    }

    case 'asset_delete': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/assets/${aid}/`);
      result = { deleted: true };
      break;
    }

    case 'collection_create': {
      result = await iconikClient.post('/API/assets/v1/collections/', {
        title    : r(cfg.title || 'New Collection', ctx),
        parent_id: r(cfg.parentId || '', ctx) || undefined,
      });
      if (result.id) WfdContext.setVar(ctx, 'collection_id', result.id);
      break;
    }

    case 'collection_add_asset': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      const aid   = r(cfg.assetId      || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/collections/${colId}/content/`, {
        object_id  : aid,
        object_type: 'assets',
      });
      break;
    }

    case 'collection_remove_asset': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      const aid   = r(cfg.assetId      || '{asset.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/collections/${colId}/content/${aid}/`);
      result = { removed: true };
      break;
    }

    case 'metadata_write': {
      const aid    = r(cfg.targetId || cfg.assetId || '{asset.id}', ctx);
      const viewId = r(cfg.viewId  || '', ctx);
      const fields = {};
      (cfg.fields || []).forEach(f => {
        fields[r(f.key, ctx)] = { field_values: [{ value: r(f.value || '', ctx) }] };
      });
      result = await iconikClient.put(
        `/API/metadata/v1/assets/${aid}/views/${viewId}/`,
        { metadata_values: fields }
      );
      break;
    }

    case 'metadata_patch': {
      // Résoudre l'asset ID — essayer vars.asset_id si {asset_id} ne résout pas
      let aid = r(cfg.targetId || cfg.assetId || '{asset.id}', ctx);
      if (aid && aid.startsWith('{')) {
        // Pas résolu — chercher dans ctx.vars directement
        const varName = aid.slice(1, -1);
        aid = ctx.vars?.[varName] || ctx.asset?.id || '';
      }
      const viewId = r(cfg.mdViewId || cfg.viewId || '', ctx);
      const endpoint = `/API/metadata/v1/assets/${aid}/views/${viewId}/`;
      // Iconik n'accepte que PUT pour les métadonnées de vue
      // → GET d'abord pour récupérer les valeurs existantes, merger, puis PUT
      let existing = {};
      try {
        const current = await iconikClient.get(endpoint);
        existing = current?.metadata_values || {};
      } catch(_) {}
      const fields = { ...existing };
      (cfg.fields || []).forEach(f => {
        if (!f.key) return;
        const val = r(f.value || '', ctx);
        fields[r(f.key, ctx)] = { field_values: val !== '' ? [{ value: val }] : [] };
      });
      result = await iconikClient.put(endpoint, { metadata_values: fields });
      break;
    }

    case 'acl_set_asset': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/assets/${aid}/acls/`, {
        object_id    : aid,
        object_type  : 'assets',
        group_id     : r(cfg.groupId || '', ctx),
        permissions  : cfg.permissions || ['read'],
      });
      break;
    }

    case 'format_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/formats/`, {
        name         : r(cfg.name || 'original', ctx),
        storage_id   : r(cfg.storageId || '', ctx),
      });
      if (result.id) WfdContext.setVar(ctx, 'format_id', result.id);
      break;
    }

    case 'file_set_create': {
      const aid = r(cfg.assetId  || '{asset.id}', ctx);
      const fid = r(cfg.formatId || '{vars.format_id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/file_sets/`, {
        name      : r(cfg.name || 'Original', ctx),
        format_id : fid,
        storage_id: r(cfg.storageId || '', ctx),
      });
      if (result.id) WfdContext.setVar(ctx, 'file_set_id', result.id);
      break;
    }

    case 'export_location':
    case 'export_location_trigger': {
      const aid = r(cfg.assetId || '{asset_id}', ctx);
      const elId = r(cfg.exportLocationId || cfg.target || '', ctx);
      if (!elId) throw new Error('export_location : exportLocationId requis');
      const exportPayload = {};
      if (cfg.createFolderAsset)  exportPayload.export_to_asset_folder = true;
      if (cfg.overwrite !== undefined) exportPayload.overwrite = cfg.overwrite === true || cfg.overwrite === 'true';
      if (cfg.fileName) exportPayload.file_name = r(cfg.fileName, ctx).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\/]/g, '');
      console.log('[DEBUG export] aid:', aid, '| elId:', elId, '| payload:', JSON.stringify(exportPayload));
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/export_locations/${elId}/`, exportPayload);
      console.log('[DEBUG export] result:', JSON.stringify(result));
      // Stocker le job_id pour le polling
      if (result?.job_id) WfdContext.setVar(ctx, 'exportJobId', result.job_id);
      break;
    }

    case 'file_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/files/`, {
        original_name: r(cfg.fileName || '{file.name}', ctx),
        storage_id   : r(cfg.storageId || '', ctx),
        file_set_id  : r(cfg.fileSetId || '{vars.file_set_id}', ctx),
      });
      break;
    }

    case 'proxy_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/proxies/`, {
        original_name: r(cfg.fileName || '{file.name}', ctx),
        storage_id   : r(cfg.storageId || '', ctx),
      });
      if (result.upload_url) WfdContext.setVar(ctx, 'proxy_upload_url', result.upload_url);
      if (result.id)         WfdContext.setVar(ctx, 'proxy_id', result.id);
      break;
    }

    case 'proxy_patch': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      const pid = r(cfg.proxyId || '{vars.proxy_id}', ctx);
      result = await iconikClient.patch(`/API/files/v1/assets/${aid}/proxies/${pid}/`, {
        status: 'CLOSED',
      });
      break;
    }

    case 'transcode_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/transcode/v1/jobs/', {
        asset_id : aid,
        preset_id: r(cfg.presetId || '', ctx),
        profile  : r(cfg.profile  || '', ctx),
        priority : cfg.priority || 50,
      });
      if (result.id) WfdContext.setVar(ctx, 'transcode_job_id', result.id);
      break;
    }

    case 'relation_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/relations/`, {
        related_asset_id: r(cfg.relatedAssetId || '', ctx),
        relation_type   : r(cfg.relationType   || 'related', ctx),
      });
      break;
    }

    // ── Assets complémentaires ───────────────────────────────────────────────
    case 'asset_update': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.put(`/API/assets/v1/assets/${aid}/`, {
        title      : r(cfg.title  || '', ctx),
        status     : r(cfg.status || 'ACTIVE', ctx),
        is_online  : cfg.isOnline !== undefined ? cfg.isOnline : true,
      });
      break;
    }

    case 'asset_restore': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/restore/`, {});
      break;
    }

    case 'asset_copy': {
      const aid   = r(cfg.assetId      || '{asset.id}', ctx);
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/collections/${colId}/`, {});
      break;
    }

    case 'asset_set_status': {
      // Alias pratique : patch rapide du statut
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.patch(`/API/assets/v1/assets/${aid}/`, {
        status: r(cfg.status || 'ACTIVE', ctx),
      });
      if (cfg.status) WfdContext.setVar(ctx, 'asset_status', r(cfg.status, ctx));
      break;
    }

    // ── Collections complémentaires ──────────────────────────────────────────
    case 'collection_update': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      result = await iconikClient.put(`/API/assets/v1/collections/${colId}/`, {
        title: r(cfg.title || '', ctx),
      });
      break;
    }

    case 'collection_delete': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/collections/${colId}/`);
      result = { deleted: true };
      break;
    }

    // ── Metadata complémentaires ─────────────────────────────────────────────
    case 'metadata_collection': {
      const colId  = r(cfg.collectionId || '{collection.id}', ctx);
      const viewId = r(cfg.viewId || '', ctx);
      const fields = {};
      (cfg.fields || []).forEach(f => {
        fields[r(f.key, ctx)] = { field_values: [{ value: r(f.value || '', ctx) }] };
      });
      result = await iconikClient.put(
        `/API/metadata/v1/collections/${colId}/views/${viewId}/`,
        { metadata_values: fields }
      );
      break;
    }

    case 'metadata_view_create': {
      result = await iconikClient.post('/API/metadata/v1/views/', {
        name        : r(cfg.name || 'New View', ctx),
        description : r(cfg.description || '', ctx),
        view_fields : cfg.viewFields || [],
      });
      if (result.id) WfdContext.setVar(ctx, 'metadata_view_id', result.id);
      break;
    }

    case 'metadata_field_create': {
      result = await iconikClient.post('/API/metadata/v1/fields/', {
        name        : r(cfg.name  || 'new_field', ctx),
        label       : r(cfg.label || 'New Field', ctx),
        field_type  : cfg.fieldType || 'text',
        options     : cfg.options || [],
      });
      if (result.id) WfdContext.setVar(ctx, 'metadata_field_id', result.id);
      break;
    }

    case 'acl_template_apply': {
      const objId = r(cfg.objectId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/objects/${objId}/bulk/`, {
        acl_template_id: r(cfg.aclTemplateId || '', ctx),
      });
      break;
    }

    // ── ACL complémentaires ──────────────────────────────────────────────────
    case 'acl_set_collection': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/collections/${colId}/acls/`, {
        object_id  : colId,
        object_type: 'collections',
        group_id   : r(cfg.groupId || '', ctx),
        permissions: cfg.permissions || ['read'],
      });
      break;
    }

    case 'acl_propagate': {
      const colId = r(cfg.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(
        `/API/acls/v1/collections/${colId}/acls/propagate/`, {}
      );
      break;
    }

    case 'acl_remove': {
      const objType = r(cfg.objectType || 'assets', ctx);
      const objId   = r(cfg.objectId   || '{asset.id}', ctx);
      const aclId   = r(cfg.aclId      || '', ctx);
      await iconikClient.delete(`/API/acls/v1/${objType}/${objId}/acls/${aclId}/`);
      result = { deleted: true };
      break;
    }

    // ── Fichiers complémentaires ─────────────────────────────────────────────
    case 'proxy_keyframe': {
      const aid     = r(cfg.assetId  || '{asset.id}', ctx);
      const proxyId = r(cfg.proxyId  || '{vars.proxy_id}', ctx);
      result = await iconikClient.post(
        `/API/files/v1/assets/${aid}/proxies/${proxyId}/keyframes/`, {}
      );
      break;
    }

    case 'format_delete': {
      const aid      = r(cfg.assetId   || '{asset.id}', ctx);
      const formatId = r(cfg.formatId  || '{vars.format_id}', ctx);
      await iconikClient.delete(`/API/files/v1/assets/${aid}/formats/${formatId}/`);
      result = { deleted: true };
      break;
    }

    case 'keyframe_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/transcode/v1/jobs/keyframes/', {
        asset_id: aid,
        priority: cfg.priority || 50,
      });
      if (result.id) WfdContext.setVar(ctx, 'keyframe_job_id', result.id);
      break;
    }

    // ── Recherche ────────────────────────────────────────────────────────────
    case 'saved_search_run': {
      // Exécuter une Saved Search par son ID et stocker les résultats
      const searchId  = r(cfg.savedSearchId || '', ctx);
      const varName   = r(cfg.varName || 'search_results', ctx);
      const pageSize  = cfg.pageSize || 100;
      if (!searchId) throw new Error('saved_search_run : savedSearchId manquant');
      result = await iconikClient.get(
        `/API/search/v1/search/saved/${searchId}/?per_page=${pageSize}`
      );
      WfdContext.storeResult(ctx, varName, result);
      // Exposer le nombre de résultats dans les vars
      const count = result.objects?.length || result.hits?.total || 0;
      WfdContext.setVar(ctx, varName + '_count', String(count));
      break;
    }

    case 'saved_search_create': {
      result = await iconikClient.post('/API/search/v1/search/saved/', {
        title : r(cfg.title || 'New Search', ctx),
        query : r(cfg.query || '', ctx),
        filter: cfg.filter || {},
      });
      if (result.id) WfdContext.setVar(ctx, 'saved_search_id', result.id);
      break;
    }

    // ── Jobs ─────────────────────────────────────────────────────────────────
    case 'job_get_status': {
      const jobId   = r(cfg.jobId || '{vars.transcode_job_id}', ctx);
      const varName = r(cfg.varName || 'job_status', ctx);
      if (!jobId) throw new Error('job_get_status : jobId manquant');
      result = await iconikClient.get(`/API/transcode/v1/jobs/${jobId}/`);
      WfdContext.storeResult(ctx, varName, result);
      WfdContext.setVar(ctx, varName, result.status || '');
      break;
    }

    // ── Automations ───────────────────────────────────────────────────────────
    case 'automation_trigger': {
      const autoId = r(cfg.automationId || '', ctx);
      if (!autoId) throw new Error('automation_trigger : automationId manquant');
      result = await iconikClient.post(
        `/API/automations/v1/automations/${autoId}/run/`,
        { asset_id: r(cfg.assetId || '{asset.id}', ctx) }
      );
      break;
    }

    // ── Webhooks ──────────────────────────────────────────────────────────────
    case 'webhook_create': {
      result = await iconikClient.post('/API/notifications/v1/webhooks/', {
        url        : r(cfg.url        || '', ctx),
        event_type : r(cfg.eventType  || '', ctx),
        realm      : r(cfg.realm      || 'assets', ctx),
        operation  : r(cfg.operation  || 'create', ctx),
        filter     : cfg.filter || {},
      });
      if (result.id) WfdContext.setVar(ctx, 'webhook_id', result.id);
      break;
    }

    // ── Segments ─────────────────────────────────────────────────────────────
    case 'segment_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/segments/`, {
        title      : r(cfg.title      || '', ctx),
        time_start : cfg.timeStart    || 0,
        time_end   : cfg.timeEnd      || 0,
        type       : r(cfg.type       || 'CUSTOM', ctx),
      });
      if (result.id) WfdContext.setVar(ctx, 'segment_id', result.id);
      break;
    }

    // ── Partage public ────────────────────────────────────────────────────────
    case 'share_create': {
      const aid = r(cfg.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/acls/v1/shares/', {
        object_id      : aid,
        object_type    : 'assets',
        permissions    : cfg.permissions     || ['read'],
        expiration_date: r(cfg.expirationDate || '', ctx) || undefined,
        allow_download : cfg.allowDownload   !== undefined ? cfg.allowDownload : false,
        require_email  : cfg.requireEmail    !== undefined ? cfg.requireEmail  : false,
      });
      if (result.id)         WfdContext.setVar(ctx, 'share_id', result.id);
      if (result.share_url)  WfdContext.setVar(ctx, 'share_url', result.share_url);
      break;
    }

    // ── Custom action Iconik ──────────────────────────────────────────────────
    case 'custom_action_trigger': {
      const actionId = r(cfg.customActionId || '', ctx);
      const aid      = r(cfg.assetId        || '{asset.id}', ctx);
      if (!actionId) throw new Error('custom_action_trigger : customActionId manquant');
      result = await iconikClient.post(
        `/API/assets/v1/assets/${aid}/custom_actions/${actionId}/execute/`,
        { metadata: cfg.metadata || {} }
      );
      break;
    }

    default:
      // Action inconnue — logger et passer
      WfdContext.addError(ctx, node.name, `Action inconnue : ${type}`, 'warn');
      return { port: 0 };
  }

  // Stocker le résultat brut
  if (result) WfdContext.storeResult(ctx, '_action_' + node.id, result);

  return { port: 0 };
}

// ── UPDATE_META — alias de action metadata ────────────────────────
async function update_meta(node, ctx, iconikClient) {
  const cfg = node.config || {};
  const mode = cfg.mode || 'view';

  // Mode "champ par champ" (sans vue) : appel direct sans viewId
  // Iconik n'accepte que PUT → GET d'abord pour merger les valeurs existantes
  if (mode === 'fields') {
    const aid      = r(cfg.targetId || cfg.assetId || '{asset.id}', ctx);
    const mdViewId = r(cfg.mdViewId || '', ctx);
    const endpoint = mdViewId
      ? `/API/metadata/v1/assets/${aid}/views/${mdViewId}/`
      : `/API/metadata/v1/assets/${aid}/`;
    let existing = {};
    try {
      const current = await iconikClient.get(endpoint);
      existing = current?.metadata_values || {};
    } catch(_) {}
    const fields = { ...existing };
    (cfg.fields || []).forEach(f => {
      if (!f.key) return;
      const val = r(f.value || '', ctx);
      fields[r(f.key, ctx)] = { field_values: val !== '' ? [{ value: val }] : [] };
    });
    const result = await iconikClient.put(endpoint, { metadata_values: fields });
    if (result) WfdContext.storeResult(ctx, '_action_' + node.id, result);
    return { port: 0 };
  }

  // Mode "via une vue" : déléguer au handler action
  // Si la cible est une collection, utiliser metadata_collection
  const _isCollection = cfg.target === 'collection';
  const _actionType = _isCollection ? 'metadata_collection' : (node.config?.actionType || 'metadata_patch');
  const normalized = {
    ...node,
    config: {
      ...node.config,
      actionType : _actionType,
      collectionId: _isCollection ? (cfg.targetId || '{collection.id}') : undefined,
      viewId      : _isCollection ? cfg.mdViewId : undefined,
    },
  };
  return action(normalized, ctx, iconikClient);
}

// ── ACL ───────────────────────────────────────────────────────────
async function acl(node, ctx, iconikClient) {
  const normalized = {
    ...node,
    config: {
      ...node.config,
      actionType: node.config?.actionType || 'acl_set_asset',
    },
  };
  return action(normalized, ctx, iconikClient);
}

// ── CREATE_ASSET ─────────────────────────────────────────────────
async function create_asset(node, ctx, iconikClient) {
  return action({ ...node, config: { ...node.config, actionType: 'asset_create' } }, ctx, iconikClient);
}

// ── CREATE_COL ────────────────────────────────────────────────────
async function create_col(node, ctx, iconikClient) {
  return action({ ...node, config: { ...node.config, actionType: 'collection_create' } }, ctx, iconikClient);
}

// ── CREATE_TREE ───────────────────────────────────────────────────
// Matérialise récursivement une arborescence de Collections à partir d'un
// template stocké (table ArboTemplate). Un template est un arbre de nœuds
// { name, generateId, children[] } — "name" est résolu comme n'importe quel
// champ WFD (peut contenir {trigger.Univers}, du texte fixe, etc.).
// Quand generateId=true sur un niveau : génère/réutilise un BayardID (même
// registre que id_generator), écrit BayardID + ParentID (chaîné depuis le
// dernier niveau généré au-dessus) sur la Vue de métadonnées configurée.
async function create_tree(node, ctx, iconikClient) {
  requireIconik(iconikClient, 'create_tree');
  const cfg        = node.config || {};
  const templateId = cfg.templateId;
  if (!templateId) throw new Error('Créer arborescence : aucun template sélectionné');

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg }     = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const _prisma = new PrismaClient({ adapter });

  let tpl;
  try {
    const row = await _prisma.arboTemplate.findUnique({ where: { id: templateId } });
    if (!row) throw new Error('Template "' + templateId + '" introuvable');
    tpl = row.config;
  } finally {
    await _prisma.$disconnect();
  }

  const rootParentId  = r(cfg.parentId || '{collection.id}', ctx);
  const viewId        = r(cfg.metadataViewId || '', ctx);
  const orgId         = ctx.vars?.orgId || 'default';
  const idLength      = Math.max(1, Math.min(64, parseInt(cfg.idLength) || 8));
  // Noms de champs configurables — un autre client peut avoir un schema de
  // metadata different (pas forcement "BayardID"/"ParentID"/"TypeCollection").
  const idFieldName     = cfg.idFieldName     || 'BayardID';
  const parentFieldName = cfg.parentFieldName || 'ParentID';
  const typeFieldName    = cfg.typeFieldName    || 'TypeCollection';
  // Amorce optionnelle : BayardID d'un ancetre créé lors d'un run PRECEDENT
  // (ex: la Série, quand ce nœud crée seulement une Saison dessus). Sans ça,
  // le chainage ParentID ne fonctionne qu'a l'interieur d'un seul run.
  const parentSeedId = r(cfg.parentBayardId || '', ctx);
  // Champs additionnels, appliques a CHAQUE collection creee (ex: Univers,
  // recupere sur la Serie parente pour une creation de Saison) - resolus
  // comme n'importe quel champ WFD, valeur figee au demarrage du run (pas
  // re-resolue par niveau).
  const extraFields = (cfg.extraFields || [])
    .filter(f => f.key)
    .map(f => ({ key: f.key, value: r(f.value || '', ctx) }));

  const created = [];
  let lastGeneratedId = parentSeedId || null; // BayardID du dernier niveau généré, pour chaîner ParentID

  async function creerNiveau(nodeDef, parentIconikId) {
    const title = r(nodeDef.name || 'Sans nom', ctx);

    const col = await iconikClient.post('/API/assets/v1/collections/', {
      title,
      parent_id: parentIconikId || undefined,
    });
    if (!col.id) throw new Error('Échec création collection "' + title + '"');

    let generatedHere = null;
    const fields = {};

    // Champs additionnels d'abord — les champs systeme (type/id/parent
    // ci-dessous) prennent le dessus en cas de collision de nom.
    extraFields.forEach(f => {
      fields[f.key] = { field_values: [{ value: f.value }] };
    });

    if (nodeDef.collectionType) {
      fields[typeFieldName] = { field_values: [{ value: r(nodeDef.collectionType, ctx) }] };
    }

    if (nodeDef.generateId) {
      const seedId = String(Math.floor(Math.pow(10, idLength - 1) + Math.random() * (Math.pow(10, idLength) * 0.9)));
      generatedHere = await _bayardIdFor(col.id, 'collection', orgId, idLength, seedId);
      fields[idFieldName] = { field_values: [{ value: generatedHere }] };
      if (lastGeneratedId) fields[parentFieldName] = { field_values: [{ value: lastGeneratedId }] };
      lastGeneratedId = generatedHere;
    }

    if (viewId && Object.keys(fields).length) {
      await iconikClient.put(`/API/metadata/v1/collections/${col.id}/views/${viewId}/`, { metadata_values: fields });
    }

    created.push({ id: col.id, title, parentIconikId, bayardId: generatedHere, collectionType: nodeDef.collectionType || null });

    for (const child of (nodeDef.children || [])) {
      await creerNiveau(child, col.id);
    }
    return col;
  }

  const rootCol = await creerNiveau(tpl, rootParentId);

  // IDs generes, exposes simplement : le premier (racine, ex: la Serie) et le
  // dernier (le plus profond, ex: la Saison) - couvre le cas a 2 niveaux
  // generateId sans obliger a indexer le tableau "created" a la main.
  const generatedOnly = created.filter(c => c.bayardId);
  const rootBayardId = generatedOnly.length ? generatedOnly[0].bayardId : '';
  const lastBayardId = generatedOnly.length ? generatedOnly[generatedOnly.length - 1].bayardId : '';

  const storeAs = cfg.storeAs || 'arbo';
  WfdContext.storeResult(ctx, storeAs, { rootId: rootCol.id, created, rootBayardId, lastBayardId });
  WfdContext.setVar(ctx, storeAs + '.rootId', rootCol.id);
  WfdContext.setVar(ctx, storeAs + '.count', String(created.length));
  WfdContext.setVar(ctx, storeAs + '.rootBayardId', rootBayardId);
  WfdContext.setVar(ctx, storeAs + '.lastBayardId', lastBayardId);
  console.log('[create_tree] Template "' + templateId + '" -> ' + created.length + ' collection(s) créée(s)');
  return { port: 0 };
}

// ── LINK_FILE ─────────────────────────────────────────────────────
async function link_file(node, ctx, iconikClient) {
  return action({ ...node, config: { ...node.config, actionType: 'file_create' } }, ctx, iconikClient);
}

// ── TRANSCODE ─────────────────────────────────────────────────────
async function transcode(node, ctx, iconikClient) {
  return action({ ...node, config: { ...node.config, actionType: 'transcode_create' } }, ctx, iconikClient);
}

// ── NOTIFICATION ─────────────────────────────────────────────────
// En mode Engine autonome, envoie via des intégrations configurées.
// Pour l'instant : log dans le contexte + webhook POST si url configurée.
async function notification(node, ctx, iconikClient) {
  const cfg        = node.config || {};
  const recipients = cfg.recipients || [];

  for (const recip of recipients) {
    const channel = recip.channel || 'email';
    const rcfg    = recip.config  || {};

    const subject = r(rcfg.subject || rcfg.title || '', ctx);
    const message = r(rcfg.message || rcfg.body  || '', ctx);

    // Stocker dans le contexte pour visibilité dans les logs
    WfdContext.storeResult(ctx, '_notif_' + node.id + '_' + channel, {
      channel, subject, message, sentAt: new Date().toISOString(),
    });

    // Webhook sortant (notify_post)
    if (channel === 'webhook' && rcfg.url) {
      const url = r(rcfg.url, ctx);
      try {
        const https = require('https');
        const http  = require('http');
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        const body = JSON.stringify({ subject, message, asset: ctx.asset, vars: ctx.vars });
        await new Promise((res, rej) => {
          const req = lib.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, r => {
            r.resume(); r.on('end', res);
          });
          req.on('error', rej);
          req.write(body);
          req.end();
        });
      } catch(e) {
        WfdContext.addError(ctx, node.name, `Webhook notif échoué : ${e.message}`, 'warn');
      }
    }
    // Email, Teams, Slack : non implémentés ici (nécessitent config SMTP/tokens)
    // → Logger comme pending pour que l'orchestrateur externe prenne le relais
  }

  return { port: 0 };
}

// ── NOTIFY_POST ───────────────────────────────────────────────────
async function notify_post(node, ctx, iconikClient) {
  const cfg = node.config || {};
  const url = r(cfg.url || '', ctx);
  if (!url) { WfdContext.addError(ctx, node.name, 'notify_post : URL manquante', 'warn'); return { port: 0 }; }

  const body = JSON.stringify({
    asset    : ctx.asset,
    vars     : ctx.vars,
    results  : ctx.results,
    fluxId   : ctx.fluxId,
    runId    : ctx.runId,
    payload  : r(cfg.payload || '', ctx),
  });

  try {
    const https = require('https');
    const http  = require('http');
    const u   = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    await new Promise((res, rej) => {
      const req = lib.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => {
        r.resume(); r.on('end', res);
      });
      req.on('error', rej);
      req.write(body);
      req.end();
    });
  } catch(e) {
    throw new Error(`notify_post vers ${url} échoué : ${e.message}`);
  }

  return { port: 0 };
}

// ── RENAME ────────────────────────────────────────────────────────
async function rename(node, ctx) {
  const cfg = node.config || {};
  const parts = cfg.parts || [];
  const sep   = cfg.separator || '_';

  let name = parts.map(p => r(p.value || '', ctx)).filter(Boolean).join(sep);

  if (cfg.caseMode === 'upper') name = name.toUpperCase();
  if (cfg.caseMode === 'lower') name = name.toLowerCase();
  if (cfg.maxLen)               name = name.slice(0, Number(cfg.maxLen));

  WfdContext.setVar(ctx, cfg.target || 'filename', name);

  return { port: 0 };
}

// ── APPROVAL ─────────────────────────────────────────────────────
// En mode autonome : ne peut pas vraiment "attendre" — marque comme pending
// et laisse le flux continuer sur port 0. L'orchestrateur devra gérer la
// reprise via un webhook de callback.
async function approval(node, ctx) {
  const cfg = node.config || {};
  WfdContext.storeResult(ctx, '_approval_' + node.id, {
    pending   : true,
    approvers : cfg.approvers || [],
    message   : r(cfg.message || '', ctx),
    requestedAt: new Date().toISOString(),
  });
  WfdContext.addError(ctx, node.name, 'Approbation requise — flux suspendu (reprise via callback)', 'warn');
  return { port: 0 };
}

// ── CAST ──────────────────────────────────────────────────────────
async function cast(node, ctx, iconikClient) {
  // "Envoyer vers" — POST vers un système tiers
  const cfg = node.config || {};
  return notify_post({ ...node, config: { url: cfg.endpoint || cfg.url, payload: cfg.payload } }, ctx, iconikClient);
}

// ── SUBFLOW ───────────────────────────────────────────────────────
// Appel d'un autre flux — nécessiterait un accès au registre de flux.
// Pour l'instant : noter dans les résultats et continuer.
async function subflow(node, ctx) {
  const cfg = node.config || {};
  WfdContext.storeResult(ctx, '_subflow_' + node.id, {
    targetFluxId: r(cfg.fluxId || '', ctx),
    note: 'Appel subflow non encore implémenté — à brancher sur WfdEngine.triggerManual',
  });
  WfdContext.addError(ctx, node.name, `Subflow ${cfg.fluxId || '?'} : appel inter-flux non implémenté`, 'warn');
  return { port: 0 };
}

// ── RELATE ────────────────────────────────────────────────────────
async function relate(node, ctx, iconikClient) {
  return action({ ...node, config: { ...node.config, actionType: 'relation_create' } }, ctx, iconikClient);
}

// ── EXPORT_FILE ───────────────────────────────────────────────────
async function export_file(node, ctx) {
  const cfg = node.config || {};
  WfdContext.storeResult(ctx, '_export_' + node.id, {
    target: cfg.target,
    path  : r(cfg.path || cfg.destination || '', ctx),
    note  : 'Export fichier : à implémenter selon la cible (S3, FTP, local…)',
  });
  return { port: 0 };
}

// ── PUBLISH ───────────────────────────────────────────────────────
async function publish(node, ctx) {
  return export_file(node, ctx); // même logique pour l'instant
}

// ── TIMER ────────────────────────────────────────────────────────
// En exécution : le timer est géré par WfdTriggerServer (setInterval/cron).
// Si un nœud timer se retrouve dans un flux en exécution directe,
// on passe simplement — le tick a déjà eu lieu pour arriver ici.
async function timer(node, ctx) {
  const cfg = node.config || {};
  WfdContext.storeResult(ctx, '_timer_' + node.id, {
    mode    : cfg.timerMode || 'interval',
    firedAt : new Date().toISOString(),
    cronExpr: cfg.cronExpr || null,
  });
  return { port: 0 };
}

// ── GATE (Contrôle de flux) ──────────────────────────────────────
// Registre de throttle partagé entre les exécutions (par nœud)
const _gateThrottleSlots = {}; // nodeId → { running: N, queue: [fn] }

async function gate(node, ctx, iconikClient) {
  const cfg  = node.config || {};
  const mode = cfg.gateMode || 'throttle';

  switch (mode) {

    // ── DÉLAI ────────────────────────────────────────────────────
    case 'delay': {
      const ms = cfg.delayMs || 5000;
      WfdContext.storeResult(ctx, '_gate_delay_' + node.id, {
        mode: 'delay', waitMs: ms, startedAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, ms));
      return { port: 0 };
    }

    // ── PAUSE manuelle ───────────────────────────────────────────
    case 'pause': {
      const msg      = WfdContext.resolve(cfg.pauseMessage || 'Pause — validation requise', ctx);
      const autoResume = cfg.pauseAutoResume || false;
      const autoMs   = (cfg.pauseAutoResumeAfterSec || 60) * 1000;

      WfdContext.storeResult(ctx, '_gate_pause_' + node.id, {
        mode: 'pause', message: msg, pausedAt: new Date().toISOString(),
        autoResume, autoResumeAfterMs: autoMs,
      });

      // Construire les ports depuis la config du nœud (définis dans le designer)
      // Les ports de gate : Continuer (0) + Bloqué (1) pour throttle, Continuer pour pause
      const _nodePorts = node.ports || [];
      const _ports = _nodePorts.length
        ? _nodePorts.map((p, i) => ({ index: i, label: p.label || 'Port ' + i, color: p.color || '#888' }))
        : [
            { index: 0, label: 'Continuer', color: '#27ae60' },
            { index: 1, label: 'Bloquer',   color: '#e74c3c' },
          ];

      // Assets en contexte — chercher dans ctx.results (storeResult) ET ctx.vars (setVar)
      let _assets = [];
      // 1. ctx.results : storeResult stocke ici (fetch, lookup, etc.)
      for (const key of Object.keys(ctx.results || {})) {
        const val = ctx.results[key];
        if (val && Array.isArray(val.objects) && val.objects.length) {
          _assets = val.objects;
          break;
        }
        if (Array.isArray(val) && val.length && val[0]?.id) {
          _assets = val;
          break;
        }
        if (val?.id) { _assets = [val]; break; } // asset unique
      }
      // 2. ctx.vars : setVar stocke ici (set_var, count, etc.)
      if (!_assets.length) {
        for (const key of Object.keys(ctx.vars || {})) {
          const val = ctx.vars[key];
          if (val && Array.isArray(val.objects) && val.objects.length) {
            _assets = val.objects; break;
          }
          if (Array.isArray(val) && val.length && val[0]?.id) {
            _assets = val; break;
          }
        }
      }
      // 3. asset unique dans le contexte racine
      if (!_assets.length && ctx.asset?.id) _assets = [ctx.asset];
      // 4. asset_id dans les vars (Custom Action) → construire un asset minimal
      if (!_assets.length && ctx.vars?.asset_id) {
        _assets = [{ id: ctx.vars.asset_id, title: ctx.vars.asset_id }];
      }
      // 5. Fallback final — garantir un placeholder pour que le Run Panel
      //    affiche toujours quelque chose et que la suspension ait bien lieu.
      if (!_assets.length) {
        const _aid = ctx.asset?.id || ctx.vars?.asset_id || ctx.runId || 'run';
        _assets = [{ id: _aid, title: msg || 'Pause' }];
      }

      let resumePort = 0;
      if (autoResume) {
        // Reprise auto après délai
        await new Promise(r => setTimeout(r, autoMs));
        WfdContext.storeResult(ctx, '_gate_pause_' + node.id + '_resumed', {
          resumedAt: new Date().toISOString(), reason: 'auto',
        });
      } else if (ctx._waitForRelease) {
        // Suspension réelle — attendre le Release depuis le Run Panel
        console.log('[WFD Gate] Pause — attente Release : ' + msg);
        const result = await ctx._waitForRelease(
          ctx.runId, node.id, _ports, _assets,
          ctx._pauseTimeoutMs || null
        );
        resumePort = result.port ?? 0;
        WfdContext.storeResult(ctx, '_gate_pause_' + node.id + '_resumed', {
          resumedAt: new Date().toISOString(), reason: result.timedOut ? 'timeout' : 'manual',
          port: resumePort,
        });
      } else {
        // Fallback : pas de mécanisme de release disponible
        console.warn('[WFD Gate] Pause — pas de mécanisme Release, continuation automatique');
        WfdContext.storeResult(ctx, '_gate_pause_' + node.id + '_resumed', {
          resumedAt: new Date().toISOString(), reason: 'auto-fallback',
        });
      }
      return { port: resumePort, warn: '⏸ ' + msg };
    }

    // ── THROTTLE de concurrence ──────────────────────────────────
    case 'throttle':
    default: {
      const maxConc = cfg.maxConcurrent || 3;
      const overflow = cfg.throttleOverflow || 'queue';
      const nid = node.id;

      if (!_gateThrottleSlots[nid]) {
        _gateThrottleSlots[nid] = { running: 0, queue: [] };
      }
      const slot = _gateThrottleSlots[nid];

      // Si un slot est disponible : exécuter immédiatement
      if (slot.running < maxConc) {
        slot.running++;
        WfdContext.storeResult(ctx, '_gate_throttle_' + nid, {
          mode: 'throttle', slot: slot.running, max: maxConc, queued: false,
        });
        // Nettoyage automatique quand le flux se termine
        ctx._gateCleanup = ctx._gateCleanup || [];
        ctx._gateCleanup.push(() => { slot.running = Math.max(0, slot.running - 1); _drainGateQueue(nid); });
        return { port: 0 }; // continuer
      }

      // Slot plein — appliquer la politique overflow
      switch (overflow) {
        case 'skip':
          WfdContext.addError(ctx, node.name, 'Gate throttle plein — job ignoré', 'warn');
          return { port: 1 }; // port Bloqué
        case 'reject':
          throw new Error('Gate throttle saturé (' + slot.running + '/' + maxConc + ' slots occupés)');
        case 'queue':
        default: {
          // Mettre en file et attendre un slot
          WfdContext.storeResult(ctx, '_gate_throttle_' + nid, {
            mode: 'throttle', slot: null, max: maxConc, queued: true,
            queuePosition: slot.queue.length + 1,
          });
          await new Promise(resolve => {
            slot.queue.push(() => {
              slot.running++;
              resolve();
            });
          });
          ctx._gateCleanup = ctx._gateCleanup || [];
          ctx._gateCleanup.push(() => { slot.running = Math.max(0, slot.running - 1); _drainGateQueue(nid); });
          return { port: 0 }; // continuer après attente
        }
      }
    }
  }
}

// Libérer le prochain job en attente dans la file
function _drainGateQueue(nodeId) {
  const slot = _gateThrottleSlots[nodeId];
  if (!slot || !slot.queue.length) return;
  if (slot.running < (slot.maxConc || 999)) {
    const next = slot.queue.shift();
    if (next) next();
  }
}

// ── POSTIT ────────────────────────────────────────────────────────
// Annotation visuelle — pas d'exécution
async function postit(node, ctx) {
  return { port: 0 };
}

// ── MANUAL (Inject / Test) ────────────────────────────────────────
// Nœud de test : injecte un payload JSON dans le contexte
async function manual(node, ctx) {
  const cfg     = node.config || {};
  const payload = cfg.payload || {};
  // Injecter les clés du payload dans vars
  Object.entries(payload).forEach(([k, v]) => {
    WfdContext.setVar(ctx, k, typeof v === 'string' ? r(v, ctx) : JSON.stringify(v));
  });
  return { port: 0 };
}

// ── Export ───────────────────────────────────────────────────────
const WfdHandlers = {
  // Données
  fetch,
  lookup,
  set_var,
  id_generator,
  transform,
  rename,
  script,

  // Logique
  decision,
  // loop retiré — géré directement par l'executor (voir wfd-engine-executor.js)
  qc,
  approval,

  // Actions
  action,
  update_meta,
  acl,
  create_asset,
  create_col,
  create_tree,
  link_file,
  cast,
  transcode,
  relate,

  // Sorties
  notification,
  notify_post,
  export_file,
  publish,

  // Utilitaires
  timer,
  gate,
  postit,
  subflow,
  manual,
  workflow_history,
  wait_for,
  aws_s3,
  checker,
};

// ── Handler HTTP Request ──────────────────────────────────────────────────────

// ── Utilitaire slug pour le mode foreach ─────────────────────────────────────
function _wfdSlugify(str) {
  return (str || '')
    .normalize('NFD')                        // décomposer les accents
    .replace(/[̀-ͯ]/g, '')         // supprimer les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')            // remplacer les caractères non-alphanum
    .replace(/^-+|-+$/g, '');               // nettoyer les tirets en début/fin
}

async function handleHttpRequest(node, ctx, iconikClient) {
  const cfg  = node.config || {};
  const mode = cfg.httpMode || 'simple';

  // ── Mode "Action" — lit la config depuis la connexion ────────────────────
  if (mode === 'action') {
    return _handleHttpAction(node, ctx, iconikClient);
  }

  // ── Mode "Pour chaque valeur" (foreach) ──────────────────────────────────
  if (mode === 'foreach') {
    return _handleHttpForeach(node, ctx, iconikClient);
  }

  // ── Mode "Vérifier" ───────────────────────────────────────────────────────
  if (mode === 'verify') {
    return _handleHttpVerify(node, ctx, iconikClient);
  }

  const connexionId = cfg.connexionId;
  const method      = (cfg.method || 'GET').toUpperCase();
  const resultVar   = cfg.resultVar || 'http_response';

  // Récupérer la connexion depuis le contexte global
  const allConns = WfdHandlers._connexions || [];
  const conn     = allConns.find(c => c.id === connexionId) || null;

  if (!conn && connexionId) {
    throw new Error('Connexion introuvable : ' + connexionId);
  }

  const baseUrl = conn?.baseUrl || conn?.endpoint || '';

  // Résoudre une variable depuis le contexte
  const resolveVar = (key) => {
    return ctx.vars?.[key]
        ?? WfdContext.resolvePath(key, ctx)
        ?? ctx.results?.[key]
        ?? '';
  };

  // Interpoler les variables {varName} dans une string
  const interpolate = (str) => {
    if (!str) return str;
    return str.replace(/\{([^}]+)\}/g, (_, key) => {
      const val = resolveVar(key);
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  };

  // Transformer les clés plates (dot notation + bracket notation) en objets imbriqués
  // ex: "availabilities.amazon[0].starts_at" → { availabilities: { amazon: [{ starts_at: ... }] } }
  const _expandDotKeys = (flat) => {
    if (!flat || typeof flat !== 'object' || Array.isArray(flat)) return flat;
    // Vérifier si des clés contiennent des points ou crochets
    const hasDotKeys = Object.keys(flat).some(k => k.includes('.') || k.includes('['));
    if (!hasDotKeys) return flat;

    const result = {};
    Object.entries(flat).forEach(([path, value]) => {
      // Parser le chemin : "a.b[0].c" → ['a', 'b', '0', 'c']
      const parts = path
        .replace(/\[(\d+)\]/g, '.$1')  // a[0] → a.0
        .split('.')
        .filter(Boolean);

      if (parts.length === 1) {
        result[path] = value;
        return;
      }

      // Construire l'objet imbriqué
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part     = parts[i];
        const nextPart = parts[i + 1];
        const nextIsNum = /^\d+$/.test(nextPart);
        if (current[part] === undefined) {
          current[part] = nextIsNum ? [] : {};
        }
        current = current[part];
      }
      const lastPart = parts[parts.length - 1];
      if (Array.isArray(current)) {
        current[parseInt(lastPart)] = value;
      } else {
        current[lastPart] = value;
      }
    });
    return result;
  };

  // Construire le body final depuis le template
  // Gère le marqueur spécial "__spread__" pour étendre les objets JSON à la racine
  // Construction directe en JS pour éviter les problèmes de sérialisation/désérialisation
  const buildBody = (bodyTemplate) => {
    if (!bodyTemplate || bodyTemplate === '{}') return undefined;

    // Parser le template JSON en remplaçant les {varName} par des sentinelles
    // puis reconstruire l'objet final directement
    try {
      // Étape 1 : identifier toutes les variables dans le template
      // Gérer deux cas :
      //   "{varName}" → la variable est déjà entre guillemets → remplacer juste la valeur interne
      //   {varName}   → la variable est nue → entourer de guillemets
      const varRefs = {};
      let counter = 0;
      // Cas 1 : variable seule entre guillemets "{var}" → sentinelle entre guillemets
      let templateWithSentinels = bodyTemplate.replace(
        /"\{([a-zA-Z_][a-zA-Z0-9_.\u00C0-\u00FF]*)\}"/g,
        (match, key) => {
          const sentinel = '__VAR_' + counter++ + '__';
          varRefs[sentinel] = key;
          return '"' + sentinel + '"';
        }
      );
      // Cas 2 : variable dans string mixte "texte{var}suite" → sentinelle sans guillemets
      templateWithSentinels = templateWithSentinels.replace(
        /\{([a-zA-Z_][a-zA-Z0-9_.\u00C0-\u00FF]*)\}/g,
        (match, key) => {
          const sentinel = '__VAR_' + counter++ + '__';
          varRefs[sentinel] = key;
          return sentinel;
        }
      );

      // Étape 2 : parser le template avec les sentinelles
      console.log('[DEBUG buildBody] templateWithSentinels:', templateWithSentinels.slice(0, 200));
      const parsed = JSON.parse(templateWithSentinels);

      // Étape 3 : reconstruire l'objet en résolvant les variables
      const result = {};
      const resolveEntry = (val) => {
        if (typeof val !== 'string') return val;
        // Cas 1 : la valeur est une sentinelle pure → remplacer par la valeur résolue
        if (varRefs[val]) {
          let resolved = resolveVar(varRefs[val]);
          if (typeof resolved === 'string' &&
              (resolved.startsWith('{') || resolved.startsWith('['))) {
            try { resolved = JSON.parse(resolved); } catch(_) {}
          }
          return resolved !== undefined && resolved !== '' ? resolved : null;
        }
        // Cas 2 : la valeur contient une ou plusieurs sentinelles mélangées avec du texte
        const mixed = val.replace(/__VAR_\d+__/g, (sentinel) => {
          const key = varRefs[sentinel];
          if (!key) return sentinel;
          const resolved = resolveVar(key);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        });
        return mixed !== val ? mixed : val;
      };

      // Résolution récursive des tableaux et objets imbriqués
      const resolveDeep = (val) => {
        if (Array.isArray(val)) return val.map(resolveDeep);
        if (val && typeof val === 'object') {
          const out = {};
          Object.entries(val).forEach(([k2, v2]) => { out[k2] = resolveDeep(v2); });
          return out;
        }
        return resolveEntry(val);
      };

      Object.entries(parsed).forEach(([k, v]) => {
        if (k === '__spread__') {
          const spreadVal = resolveDeep(v);
          if (spreadVal && typeof spreadVal === 'object' && !Array.isArray(spreadVal)) {
            const expanded = _expandDotKeys(spreadVal);
            Object.assign(result, expanded);
          }
        } else {
          const resolved = resolveDeep(v);
          if (resolved !== null) result[k] = resolved;
        }
      });

      // Encoder les URLs S3/HTTPS dans le résultat (espaces → %20)
      const _encodeUrlInBody = (val) => {
        if (typeof val !== 'string') return val;
        if (!val.startsWith('s3://') && !val.startsWith('https://') && !val.startsWith('http://')) return val;
        const proto = val.match(/^(s3|https?):\/\/([^/]+)\//)?.[0] || '';
        if (!proto) return val;
        const rest = val.slice(proto.length);
        return proto + rest.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
      };
      const _encodeDeepBody = (obj) => {
        if (typeof obj === 'string') return _encodeUrlInBody(obj);
        if (Array.isArray(obj)) return obj.map(_encodeDeepBody);
        if (obj && typeof obj === 'object') {
          const out = {};
          Object.entries(obj).forEach(([k, v]) => { out[k] = _encodeDeepBody(v); });
          return out;
        }
        return obj;
      };
      return JSON.stringify(_encodeDeepBody(result));
    } catch(e) {
      // Fallback : interpolation directe
      return interpolate(bodyTemplate);
    }
  };

  const url = baseUrl + interpolate(cfg.endpoint || '');

  // Headers
  const headers = { 'Content-Type': 'application/json' };
  if (conn?.authType === 'bearer' && conn?.authValue)
    headers['Authorization'] = 'Bearer ' + conn.authValue;
  else if (conn?.authType === 'apikey_header' && conn?.authValue)
    headers['X-API-Key'] = conn.authValue;
  else if (conn?.authType === 'basic' && conn?.authValue)
    headers['Authorization'] = 'Basic ' + Buffer.from(conn.authValue).toString('base64');
  (conn?.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value; });
  (cfg.extraHeaders || []).forEach(h => {
    if (h.key) headers[interpolate(h.key)] = interpolate(h.value);
  });

  // Body — construit depuis les tags (spread) ou depuis la string brute
  let body = undefined;
  if (!['GET','DELETE'].includes(method)) {
    const bodyTpl = cfg.body || cfg.bodyTemplate || '';
    console.log('[DEBUG simple] bodyTpl:', bodyTpl?.slice(0,200), '| vodFactoryPayload:', JSON.stringify(ctx.vars?.vodFactoryPayload)?.slice(0,300));
    if (bodyTpl && bodyTpl !== '{}') {
      body = buildBody(bodyTpl);
      if (body) {
        try { JSON.parse(body); } catch(e) {
          throw new Error('Body JSON invalide : ' + e.message + ' → ' + body.slice(0, 100));
        }
      }
    } else {
      // Pas de bodyTemplate — chercher automatiquement vodFactoryPayload dans le contexte
      const _srcVar = cfg.sourceVar || '';
      let _payload = null;
      if (_srcVar) {
        _payload = ctx.results?.[_srcVar] ?? null;
        if (!_payload) {
          const _raw = ctx.vars?.[_srcVar];
          if (_raw) { try { _payload = typeof _raw === 'string' ? JSON.parse(_raw) : _raw; } catch(_) {} }
        }
      }
      if (!_payload) {
        const _raw = ctx.vars?.vodFactoryPayload;
        if (_raw) { try { _payload = typeof _raw === 'string' ? JSON.parse(_raw) : _raw; } catch(_) {} }
      }
      if (!_payload) {
        const key = Object.keys(ctx.results || {}).find(k =>
          !k.startsWith('_') && ctx.results[k] && typeof ctx.results[k] === 'object' && !Array.isArray(ctx.results[k])
        );
        if (key) _payload = ctx.results[key];
      }
      if (_payload && typeof _payload === 'object' && !Array.isArray(_payload)) {
        const _encodeUrlVal = (val) => {
          if (typeof val !== 'string') return val;
          if (!val.startsWith('s3://') && !val.startsWith('https://') && !val.startsWith('http://')) return val;
          const proto = val.match(/^(s3|https?):\/\/([^/]+)\//)?.[0] || '';
          if (!proto) return val;
          const rest = val.slice(proto.length);
          return proto + rest.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
        };
        const _encodeDeepPayload = (obj) => {
          if (typeof obj === 'string') return _encodeUrlVal(obj);
          if (Array.isArray(obj)) return obj.map(_encodeDeepPayload);
          if (obj && typeof obj === 'object') {
            const out = {};
            Object.entries(obj).forEach(([k, v]) => { out[k] = _encodeDeepPayload(v); });
            return out;
          }
          return obj;
        };
        body = JSON.stringify(_encodeDeepPayload(_expandDotKeys(_payload)));
      }
    }
  }

  // Appel
  let response, responseBody;
  try {
    console.log('[DEBUG body]', body?.slice(0, 500));
    response = await globalThis.fetch(url, { method, headers, body });
    const text = await response.text();
    try { responseBody = JSON.parse(text); } catch(_) { responseBody = text; }
  } catch(e) {
    throw new Error('Erreur réseau : ' + e.message + ' → ' + url);
  }

  // Stocker le résultat
  const result = { status: response.status, ok: response.ok, url, method, body: responseBody };
  WfdContext.storeResult(ctx, resultVar, result);
  WfdContext.setVar(ctx, resultVar + '_status', String(response.status));
  WfdContext.setVar(ctx, resultVar + '_ok', response.ok ? 'true' : 'false');

  // Codes à ignorer — depuis la config du nœud OU depuis l'action
  const _ignoreCodes = [...(cfg.ignoreCodes || []), ...(action.ignoreCodes || [])].map(Number);

  // Upsert : si POST retourne 422, retenter avec PATCH sur {endpoint}/{external_id}
  // Mais pas si 422 est dans les codes ignorés
  console.log('[DEBUG 422] status:', response.status, '| body:', JSON.stringify(responseBody)?.slice(0, 300));
  if (response.status === 422 && method === 'POST' && cfg.upsert !== false && !_ignoreCodes.includes(422)) {
    try {
      // Extraire l'external_id depuis le body pour construire l'URL du PATCH
      let patchUrl = url;
      if (body) {
        try {
          const parsedBody = JSON.parse(body);
          const extId = parsedBody.external_id;
          if (extId) patchUrl = url.replace(/\/+$/, '') + '/' + extId;
        } catch(_) {}
      }
      // Utiliser PUT pour l'upsert (PATCH non supporté par certaines APIs comme VodFactory)
      const patchResponse = await globalThis.fetch(patchUrl, { method: 'PUT', headers, body });
      const patchText = await patchResponse.text();
      let patchBody;
      try { patchBody = JSON.parse(patchText); } catch(_) { patchBody = patchText; }
      const patchResult = { status: patchResponse.status, ok: patchResponse.ok, url, method: 'PUT', body: patchBody, upserted: true };
      WfdContext.storeResult(ctx, resultVar, patchResult);
      WfdContext.setVar(ctx, resultVar + '_status', String(patchResponse.status));
      WfdContext.setVar(ctx, resultVar + '_ok', patchResponse.ok ? 'true' : 'false');
      if (!patchResponse.ok) {
        const errMsg = typeof patchBody === 'object'
          ? (patchBody.message || patchBody.error || JSON.stringify(patchBody).slice(0,200))
          : String(patchBody).slice(0,200);
        // 404 ou 5xx sur le PATCH — continuer vers port 0 avec warning
        const _patchWarn = patchResponse.status === 404 || (patchResponse.status >= 500);
        WfdContext.addError(ctx, node.name, `PUT HTTP ${patchResponse.status} — ${errMsg}`, 'warn');
        if (_patchWarn) return { port: 0, warn: `PUT HTTP ${patchResponse.status} — ${errMsg}` };
        return { port: 1, warn: `PUT HTTP ${patchResponse.status} — ${errMsg}` };
      }
      return { port: 0 };
    } catch(e) {
      throw new Error('Erreur upsert PATCH : ' + e.message);
    }
  }

  const _ignored = _ignoreCodes.includes(response.status);
  // Les erreurs 5xx (serveur) et 404 upsert sont traitées comme des warnings — port 0 avec note
  const _is5xx = response.status >= 500 && response.status < 600;
  if (!response.ok && !_ignored && !_is5xx) {
    const errMsg = typeof responseBody === 'object'
      ? (responseBody.message || responseBody.error || JSON.stringify(responseBody).slice(0,200))
      : String(responseBody).slice(0,200);
    WfdContext.addError(ctx, node.name, `HTTP ${response.status} — ${errMsg}`, 'warn');
    return { port: 1, warn: `HTTP ${response.status} — ${errMsg}` };
  }
  if (_ignored || _is5xx) {
    const errMsg = typeof responseBody === 'object'
      ? (responseBody.message || responseBody.error || String(response.status))
      : String(response.status);
    WfdContext.addError(ctx, node.name, `HTTP ${response.status} (continué) — ${errMsg}`, 'warn');
  }
  return { port: 0 };
}


// ── HTTP Request — mode action ───────────────────────────────────────
// Lit la config de l'action depuis la connexion et la délègue au bon handler
async function _handleHttpAction(node, ctx, iconikClient) {
  const cfg      = node.config || {};
  const connId   = cfg.connexionId;
  const actionId = cfg.actionId;

  const allConns = WfdHandlers._connexions || [];
  const conn     = allConns.find(c => c.id === connId) || null;
  if (!conn) throw new Error('Connexion introuvable : ' + connId);

  const action = (conn.actions || []).find(a => a.id === actionId);
  if (!action) throw new Error('Action introuvable : ' + actionId);

  // Construire le body depuis le Lookup si bodyTemplate est vide
  // La variable source est configurée dans l'action (sourceVar) ou cherchée dans le contexte
  let _body = action.bodyTemplate || '';
  if (!_body) {
    const _srcVar = action.sourceVar || '';
    const _payload = (_srcVar
      ? (ctx.results?.[_srcVar] || ctx.vars?.[_srcVar])
      : null)
      || (() => {
        // Fallback : chercher le premier résultat qui ressemble à un payload objet non-interne
        const key = Object.keys(ctx.results || {}).find(k => !k.startsWith('_') && typeof ctx.results[k] === 'object');
        return key ? ctx.results[key] : null;
      })();
    // Images incluses dans le payload — URLs S3 valides via Export Location

    // ── Transformation clés aplaties → objet imbriqué ──────────────────────────────────────────
    // Ex: "availabilities.amazon[0].starts_at" → { availabilities: { amazon: [{ starts_at: ... }] } }
    if (_payload && typeof _payload === 'object') {
      const _hasDotKeys = Object.keys(_payload).some(k => k.includes('.') || k.includes('['));
      if (_hasDotKeys) {
        const _nested = {};
        Object.entries(_payload).forEach(([key, val]) => {
          if (!key.includes('.') && !key.includes('[')) {
            _nested[key] = val;
            return;
          }
          // Parser la clé aplatie
          const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
          let obj = _nested;
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            const nextIsNum = /^\d+$/.test(parts[i + 1]);
            if (obj[p] === undefined) obj[p] = nextIsNum ? [] : {};
            obj = obj[p];
          }
          const last = parts[parts.length - 1];
          if (Array.isArray(obj)) obj[parseInt(last)] = val;
          else obj[last] = val;
        });
        // Remplacer le payload aplati par l'objet imbriqué
        Object.keys(_payload).forEach(k => delete _payload[k]);
        Object.assign(_payload, _nested);
      }
    }
    // ── Encodage automatique des URLs dans les valeurs du payload ────────────────────────────────
    // Les valeurs commençant par s3:// ou https:// sont encodées (espaces → %20, etc.)
    const _encodeUrlValue = (val) => {
      if (typeof val !== 'string') return val;
      if (!val.startsWith('s3://') && !val.startsWith('https://') && !val.startsWith('http://')) return val;
      // Encoder chaque segment du chemin (après le bucket/host)
      const proto = val.match(/^(s3|https?):\/\/([^/]+)\//)?.[0] || '';
      if (!proto) return val;
      const rest = val.slice(proto.length);
      return proto + rest.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
    };
    if (_payload && typeof _payload === 'object') {
      const _encodeDeep = (obj) => {
        if (typeof obj === 'string') return _encodeUrlValue(obj);
        if (Array.isArray(obj)) return obj.map(_encodeDeep);
        if (obj && typeof obj === 'object') {
          const out = {};
          Object.entries(obj).forEach(([k, v]) => { out[k] = _encodeDeep(v); });
          return out;
        }
        return obj;
      };
      Object.assign(_payload, _encodeDeep(_payload));
    }
    // ── FIN ENCODAGE ──────────────────────────────────────────────────────────────────────────────

    // ── FIN TRANSFORMATION ────────────────────────────────────────────────────────────────────────

    // ── TODO: HARDCODE TEMPORAIRE — à remplacer par le système générique de mapping d'objets ──
    // Quand persons[] contient des strings (noms), les transformer en { external_id, job }
    // Ce code sera supprimé quand le sous-panneau ⚙ de la Lookup sera implémenté
    if (_payload && Array.isArray(_payload.persons) && _payload.persons.length &&
        typeof _payload.persons[0] === 'string') {
      const _slugify = s => (s||'').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      // Si persons[0] est un JSON stringifié (ex: '["Jean Dupont","Francis Ford Coppola"]'), le parser
      let _personsArr = _payload.persons;
      if (_personsArr.length === 1 && _personsArr[0].startsWith('[')) {
        try { _personsArr = JSON.parse(_personsArr[0]); } catch(_) {}
      }
      _payload.persons = _personsArr.map(nom => ({
        external_id: _slugify(nom),
        job        : 'director',
      }));
    }

    // ── FIN HARDCODE TEMPORAIRE ──────────────────────────────────────────────────────────────────



    // Si sourceVar est renseigné, la table de correspondance a déjà sélectionné les bons champs
    // Le filtre _specFields est redondant et peut exclure des champs valides absents de la spec importée
    const _specFields = new Set((action._specFields || []).map(f => f.path.split('.')[0].replace(/\[\]$/, '')));
    const _useSpecFilter = _specFields.size > 0 && !action.sourceVar;
    if (_payload && typeof _payload === 'object' && _useSpecFilter) {
      // Filtrer le payload pour ne garder que les champs de cet endpoint
      const _filtered = {};
      for (const [k, v] of Object.entries(_payload)) {
        if (_specFields.has(k.split('.')[0].replace(/\[\]$/, ''))) _filtered[k] = v;
      }
      if (Object.keys(_filtered).length) {
        _body = JSON.stringify(_filtered);
      }
    } else if (_payload && typeof _payload === 'object') {
      // Pas de spec ou sourceVar renseigné — envoyer tout le payload
      _body = JSON.stringify(_payload);
    }
  }

  // Construire un node virtuel avec la config de l'action
  const virtualNode = {
    ...node,
    config: {
      ...cfg,
      method        : action.method        || 'POST',
      endpoint      : action.endpoint      || '',
      httpMode      : action.mode          || 'simple',
      feSourceVar   : action.sourceVar     || '',
      feSeparator   : ', ',
      feLocalName   : 'nom',
      feBody        : action.bodyTemplate  || '',
      feJob         : action.job           || null,
      feIgnoreCodes : action.ignoreCodes   || [422],
      ignoreCodes   : action.ignoreCodes   || [],
      feOnError     : 'continue',
      feCollectField: 'external_id',
      feResultVar   : action.resultVar     || 'action_result',
      body          : _body,
      resultVar     : action.resultVar     || 'action_result',
    },
  };

  if (action.mode === 'foreach') {
    return _handleHttpForeach(virtualNode, ctx, iconikClient);
  } else if (action.mode === 'verify') {
    return _handleHttpVerify(virtualNode, ctx, iconikClient);
  } else {
    virtualNode.config.httpMode = 'simple';
    return handleHttpRequest(virtualNode, ctx, iconikClient);
  }
}

// ── HTTP Request — mode foreach ───────────────────────────────────────────────
// Pour chaque valeur d'un champ (séparée par un délimiteur) :
//   1. Interpole le body avec {{nom}} et {{slug(nom)}}
//   2. Fait un appel HTTP
//   3. Ignore les codes configurés (ex: 409)
//   4. Collecte les external_ids dans un tableau résultat
async function _handleHttpForeach(node, ctx, iconikClient) {
  const cfg          = node.config || {};
  const connexionId  = cfg.connexionId;
  const method       = (cfg.method || 'POST').toUpperCase();
  const resultVar    = cfg.feResultVar || 'foreach_result';
  const sourceVar    = (cfg.feSourceVar || '').replace(/^\{|\}$/g, '');
  const separator    = cfg.feSeparator !== undefined ? cfg.feSeparator : ', ';
  const localName    = cfg.feLocalName  || 'nom';
  const ignoreCodes  = (cfg.feIgnoreCodes || [409, 422]).map(Number);
  const onError      = cfg.feOnError     || 'continue';

  // Récupérer la connexion
  const allConns = WfdHandlers._connexions || [];
  const conn     = allConns.find(c => c.id === connexionId) || null;
  if (!conn && connexionId) throw new Error('Connexion introuvable : ' + connexionId);
  const baseUrl = conn?.baseUrl || conn?.endpoint || '';

  // Résoudre la variable source
  const rawVal = ctx.vars?.[sourceVar]
              ?? WfdContext.resolvePath(sourceVar, ctx)
              ?? '';

  // Détecter si la valeur est un tableau JSON sérialisé (ex: tag cloud multi-valeur Iconik)
  // Dans ce cas, parser directement au lieu de splitter par séparateur
  let values;
  const rawStr = String(rawVal);
  if (rawStr.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) {
        values = parsed.map(v => String(v).trim()).filter(Boolean);
      }
    } catch(_) {}
  }
  if (!values) {
    values = rawStr.split(separator).map(v => v.trim()).filter(Boolean);
  }

  if (!values.length) {
    WfdContext.storeResult(ctx, resultVar, []);
    WfdContext.setVar(ctx, resultVar + '_count', '0');
    return { port: 0 };
  }

  // Headers
  const headers = { 'Content-Type': 'application/json' };
  if (conn?.authType === 'bearer' && conn?.authValue)
    headers['Authorization'] = 'Bearer ' + conn.authValue;
  else if (conn?.authType === 'apikey_header' && conn?.authValue)
    headers['X-API-Key'] = conn.authValue;
  else if (conn?.authType === 'basic' && conn?.authValue)
    headers['Authorization'] = 'Basic ' + Buffer.from(conn.authValue).toString('base64');
  (conn?.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value; });

  // Interpolateur pour les variables {{nom}} et {{slug(nom)}}
  // Supporte aussi les {varName} du contexte WFD standard
  const interpolateForeach = (template, val, idx) => {
    if (!template) return template;
    const slug = _wfdSlugify(val);
    return template
      .replace(/\{\{slug\([^)]+\)\}\}/g, slug)      // {{slug(...)}} → slug
      .replace(/\{\{index\}\}/g, String(idx))         // {{index}} → 0, 1, 2...
      .replace(/\{\{[^}]+\}\}/g, val)                 // {{nom}} → valeur brute
      .replace(/\{([a-zA-Z_][a-zA-Z0-9_.À-ÿ]*)\}/g, (_, key) => { // {varName} → ctx.vars
        const v = ctx.vars?.[key]
               ?? (WfdContext.resolvePath ? WfdContext.resolvePath(key, ctx) : undefined)
               ?? '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      });
  };

  const collected = [];
  const errors    = [];

  for (let i = 0; i < values.length; i++) {
    const val  = values[i];
    const slug = _wfdSlugify(val);
    const url  = baseUrl + interpolateForeach(cfg.endpoint || '', val, i);

    let body = undefined;
    if (!['GET','DELETE'].includes(method) && cfg.feBody) {
      body = interpolateForeach(cfg.feBody, val, i);
      try { JSON.parse(body); } catch(e) {
        WfdContext.addError(ctx, node.name, `Foreach body JSON invalide pour "${val}" : ${e.message}`, 'warn');
        continue;
      }
    }

    let response, responseBody;
    try {
      response = await globalThis.fetch(url, { method, headers, body });
      const text = await response.text();
      try { responseBody = JSON.parse(text); } catch(_) { responseBody = text; }
    } catch(e) {
      const msg = `Erreur réseau pour "${val}" : ${e.message}`;
      if (onError === 'stop') throw new Error(msg);
      WfdContext.addError(ctx, node.name, msg, 'warn');
      errors.push({ val, error: e.message });
      continue;
    }

    // Codes ignorés (ex: 409 = déjà existant → on collecte quand même l'external_id)
    const ignored = ignoreCodes.includes(response.status);

    if (!response.ok && !ignored) {
      const errMsg = typeof responseBody === 'object'
        ? (responseBody.message || responseBody.error || JSON.stringify(responseBody).slice(0, 100))
        : String(responseBody).slice(0, 100);
      const msg = `HTTP ${response.status} pour "${val}" : ${errMsg}`;
      if (onError === 'stop') throw new Error(msg);
      WfdContext.addError(ctx, node.name, msg, 'warn');
      errors.push({ val, status: response.status, error: errMsg });
      continue;
    }

    // Collecter le résultat — on récupère le champ configuré dans la réponse
    const collectField = cfg.feCollectField || 'external_id';
    const collectedVal = typeof responseBody === 'object'
      ? (responseBody[collectField] ?? slug)  // fallback sur le slug si champ absent
      : slug;

    collected.push({
      [localName]   : val,
      external_id   : String(collectedVal),
      slug,
      job           : cfg.feJob || null,   // rôle VodFactory (director, actor...)
      status        : response.status,
      ignored,
    });
  }

  // Mode append : si cfg.feAppend = true, concaténer au résultat existant
  if (cfg.feAppend && ctx.results[resultVar] && Array.isArray(ctx.results[resultVar])) {
    const existing = ctx.results[resultVar];
    const merged   = existing.concat(collected);
    WfdContext.storeResult(ctx, resultVar, merged);
    WfdContext.setVar(ctx, resultVar, JSON.stringify(merged));
    WfdContext.setVar(ctx, resultVar + '_count', String(merged.length));
  } else {
    WfdContext.storeResult(ctx, resultVar, collected);
    WfdContext.setVar(ctx, resultVar, JSON.stringify(collected));
    WfdContext.setVar(ctx, resultVar + '_count', String(collected.length));
  }
  if (errors.length) {
    WfdContext.storeResult(ctx, resultVar + '_errors', errors);
  }
  // Stocker le résumé pour le run panel
  WfdContext.storeResult(ctx, '_http_last_' + node.id, {
    mode     : 'foreach',
    endpoint : cfg.endpoint || '',
    method   : method,
    total    : values.length,
    success  : collected.length,
    errors   : errors.length,
    calls    : collected.map(c => ({
      val    : c[localName] || c.nom || '',
      status : c.status,
      external_id: c.external_id,
      ignored: c.ignored,
    })),
    errDetails: errors,
  });

  // Port 0 = succès (même partiel), Port 1 = aucun succès du tout
  return { port: collected.length > 0 ? 0 : 1 };
}

// ── HTTP Request — mode verify ────────────────────────────────────────────────
// Appelle un endpoint et vérifie un champ dans la réponse
// Port 0 = condition remplie, Port 1 = condition non remplie, Port 2 = erreur
async function _handleHttpVerify(node, ctx, iconikClient) {
  const cfg         = node.config || {};
  const connexionId = cfg.connexionId;
  const method      = (cfg.method || 'GET').toUpperCase();
  const resultVar   = cfg.resultVar || 'verify_result';

  const allConns = WfdHandlers._connexions || [];
  const conn     = allConns.find(c => c.id === connexionId) || null;
  if (!conn && connexionId) throw new Error('Connexion introuvable : ' + connexionId);
  const baseUrl = conn?.baseUrl || conn?.endpoint || '';

  const interpolate = (str) => {
    if (!str) return str;
    return str.replace(/\{([^}]+)\}/g, (_, key) => {
      const val = ctx.vars?.[key]
               ?? WfdContext.resolvePath(key, ctx)
               ?? '';
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  };

  const url = baseUrl + interpolate(cfg.endpoint || '');
  const headers = { 'Content-Type': 'application/json' };
  if (conn?.authType === 'bearer' && conn?.authValue)
    headers['Authorization'] = 'Bearer ' + conn.authValue;

  let response, responseBody;
  try {
    response = await globalThis.fetch(url, { method, headers });
    const text = await response.text();
    try { responseBody = JSON.parse(text); } catch(_) { responseBody = text; }
  } catch(e) {
    throw new Error('Verify — erreur réseau : ' + e.message);
  }

  WfdContext.storeResult(ctx, resultVar, { status: response.status, body: responseBody });
  // Stocker le résumé pour le run panel
  WfdContext.storeResult(ctx, '_http_last_' + node.id, {
    mode    : 'simple',
    method  : (cfg.method || 'GET').toUpperCase(),
    endpoint: cfg.endpoint || '',
    status  : response.status,
    ok      : response.ok,
    body    : typeof responseBody === 'object'
      ? JSON.stringify(responseBody).slice(0, 300)
      : String(responseBody).slice(0, 300),
  });

  if (!response.ok) return { port: 2 };

  // Vérifier un champ dans la réponse via un chemin pointé (ex: "results.amazon.status")
  const checkPath  = cfg.vfCheckPath  || '';
  const checkValue = cfg.vfCheckValue || '';
  if (checkPath) {
    const actual = checkPath.split('.').reduce((obj, k) =>
      obj && typeof obj === 'object' ? obj[k] : undefined, responseBody);
    WfdContext.setVar(ctx, resultVar + '_check', String(actual ?? ''));
    const ok = String(actual ?? '') === String(checkValue);
    return { port: ok ? 0 : 1 };
  }

  return { port: 0 };
}

WfdHandlers.http_request = handleHttpRequest;

// ── HTTP Sequence — exécute plusieurs étapes HTTP en séquence ─────────────────
// Chaque étape est une config complète de nœud http_request (même structure).
// Le résultat de chaque étape est stocké dans ctx sous le nom défini dans l'étape.
// Si une étape échoue (et que onError !== 'continue'), on arrête la séquence.
async function handleHttpSequence(node, ctx, iconikClient) {
  const cfg   = node.config || {};
  const steps = cfg.steps || [];

  if (!steps.length) {
    console.warn('[HTTP Sequence] Aucune étape configurée dans', node.name);
    return { port: 0 };
  }

  let lastError = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    // Construire un nœud virtuel avec la config de l'étape
    // La connexionId de l'étape override celle du nœud parent si définie
    const virtualNode = {
      id      : node.id + '_step_' + i,
      name    : (node.name || 'Séquence') + ' › ' + (step.name || 'Étape ' + (i + 1)),
      family  : 'http_request',
      config  : Object.assign({}, step, {
        connexionId: step.connexionId || cfg.connexionId,
      }),
    };

    console.log('[HTTP Sequence] Étape', i + 1, '/', steps.length, '—', virtualNode.name, '| httpMode:', step.httpMode, '| actionId:', step.actionId, '| feSourceVar:', step.feSourceVar);

    try {
      const result = await handleHttpRequest(virtualNode, ctx, iconikClient);
      // Si feAppend : concaténer au résultat existant plutôt qu'écraser
      if (step.feAppend && step.resultVar) {
        const existing = ctx.results[step.resultVar];
        if (Array.isArray(existing) && Array.isArray(ctx.results[step.resultVar])) {
          // déjà géré par handleHttpRequest — ne rien faire
        }
      }
      // Port 1 d'une étape = échec — on arrête sauf si onError = continue
      if (result && result.port === 1 && step.onError !== 'continue') {
        console.warn('[HTTP Sequence] Étape', i + 1, 'a échoué — arrêt de la séquence');
        lastError = 'Étape ' + (i + 1) + ' (' + virtualNode.name + ') a échoué';
        break;
      }
    } catch(e) {
      console.error('[HTTP Sequence] Erreur étape', i + 1, ':', e.message);
      if (step.onError !== 'continue') {
        lastError = e.message;
        break;
      }
    }
  }

  if (lastError) {
    WfdContext.addError(ctx, node.name, lastError, 'error');
    return { port: 1 };
  }
  return { port: 0 };
}

WfdHandlers.http_sequence = handleHttpSequence;

if (typeof module !== 'undefined') module.exports = WfdHandlers;
if (typeof window !== 'undefined') window.WfdHandlers = WfdHandlers;


// ── WORKFLOW HISTORY ─────────────────────────────────────────────────────────
async function workflow_history(node, ctx, iconikClient) {
  requireIconik(iconikClient, 'workflow_history');
  const cfg = node.config || {};

  // Résoudre les paramètres
  const targetId  = r(cfg.targetId  || '{asset_id}', ctx) || ctx.vars?.asset_id || ctx.asset?.id || '';
  const mdViewId  = cfg.mdViewId  || '';
  const mdField   = cfg.mdField   || '';
  const mode      = cfg.whMode    || 'add';     // 'add' | 'update'
  const order     = cfg.whOrder   || 'newest';  // 'newest' | 'oldest'
  const statut    = r(cfg.whStatut || '', ctx);
  const message   = r(cfg.whMessage || '', ctx);

  console.log('[WH DEBUG] targetId:', targetId, '| mdViewId:', mdViewId, '| mdField:', mdField);
  if (!targetId || !mdField) throw new Error('Workflow History : targetId et mdField requis');

  // Construire la ligne de log
  const now     = new Date();
  const dateStr = now.toISOString().slice(0,10) + '_' + now.toTimeString().slice(0,5);
  const runId   = ctx.runId || ctx.vars?.['run.id'] || '';
  const wfName  = cfg.whWfName || ctx.workflow?.name || ctx.vars?.['workflow.name'] || '';
  const user    = ctx.trigger?.user  || ctx.vars?.['trigger.user']  || '';

  const parts = [];
  if (cfg.whShowDate    !== false && dateStr)           parts.push(dateStr);
  if (cfg.whShowWf      !== false && wfName)            parts.push(wfName);
  if (cfg.whShowUser    !== false && user)              parts.push(user);
  if (statut)                                           parts.push(statut);
  if (message)                                          parts.push(message);

  // Résumer un objet — liste les clés dont status n'est pas complete/ready/sent
  console.log('[WH SUMMARY] whSummaryVar:', cfg.whSummaryVar);
  if (cfg.whSummaryVar) {
    try {
      const summaryPath = cfg.whSummaryVar.replace(/^\{|\}$/g, '');
      let summaryObj = ctx.results;
      for (const part of summaryPath.split('.')) {
        if (summaryObj === null || summaryObj === undefined) break;
        summaryObj = summaryObj[part];
      }
      if (summaryObj && typeof summaryObj === 'object') {
        const okStatuses = ['complete', 'ready', 'sent', 'success'];
        const issues = Object.entries(summaryObj)
          .filter(([k, v]) => v && typeof v === 'object' && v.status && !okStatuses.includes(v.status))
          .map(([k, v]) => k.replace('amazon_', '') + ': ' + (v.status_details || v.status));
        if (issues.length) parts.push(issues.join(', '));
      }
    } catch(_) {}
  }
  // Afficher le Run ID dans le message seulement si coché
  if (cfg.whShowRunId === true && runId)                parts.push(runId.slice(0,12));

  const visibleLine = parts.join(' | ');
  // En mode 'add' : ajouter le Run ID entre crochets pour permettre la recherche future
  // En mode 'update' : écrire le message final sans Run ID (la ligne est déjà retrouvée)
  const newLine = (mode === 'add' && runId)
    ? visibleLine + ' [' + runId.slice(0,12) + ']'
    : visibleLine;

  // Lire la valeur actuelle du champ
  const endpoint = mdViewId
    ? `/API/metadata/v1/assets/${targetId}/views/${mdViewId}/`
    : `/API/metadata/v1/assets/${targetId}/`;

  let existing = {};
  try {
    const current = await iconikClient.get(endpoint);
    existing = current?.metadata_values || {};
    console.log('[WH DEBUG] GET OK, fields:', Object.keys(existing).slice(0,5));
  } catch(e) { console.log('[WH DEBUG] GET error:', e.message); }

  const currentVal = (existing[mdField]?.field_values?.[0]?.value || '').trim();

  let newVal;
  if (mode === 'update' && runId) {
    // Remplacer la ligne contenant le runId courant
    const lines = currentVal ? currentVal.split('\n') : [];
    const idx = lines.findIndex(l => l.includes('[' + runId.slice(0,12) + ']') || l.includes(runId.slice(0,12)));
    if (idx !== -1) {
      lines[idx] = newLine;
      newVal = lines.join('\n');
    } else {
      // Pas trouvé — ajouter
      newVal = order === 'newest'
        ? (newLine + (currentVal ? '\n' + currentVal : ''))
        : (currentVal ? currentVal + '\n' : '') + newLine;
    }
  } else {
    // Ajouter une nouvelle ligne
    newVal = order === 'newest'
      ? (newLine + (currentVal ? '\n' + currentVal : ''))
      : (currentVal ? currentVal + '\n' : '') + newLine;
  }

  // Écrire via PUT (Iconik n'accepte que PUT pour les métadonnées de vue)
  // Exclure les champs spéciaux Iconik (__separator__, etc.)
  const merged = {};
  Object.entries(existing).forEach(([k, v]) => {
    if (!k.startsWith('__')) merged[k] = v;
  });
  merged[mdField] = { field_values: [{ value: newVal }] };
  console.log('[WH DEBUG] PUT endpoint:', endpoint, '| merged keys:', Object.keys(merged));
  await iconikClient.put(endpoint, { metadata_values: merged });

  WfdContext.storeResult(ctx, '_workflow_history', { line: newLine, field: mdField, mode });
  return { port: 0 };
}

// ── WAIT_FOR ─────────────────────────────────────────────────────────────────
// Polling générique sur un endpoint HTTP jusqu'à ce qu'une condition soit remplie
async function wait_for(node, ctx, iconikClient) {
  const cfg         = node.config || {};
  const connexionId = cfg.connexionId || '';
  const method      = (cfg.method || 'GET').toUpperCase();
  const endpoint    = r(cfg.endpoint || '', ctx);
  const checkPath   = cfg.checkPath  || 'status';
  const checkValue  = r(cfg.checkValue || '', ctx);
  const delayMs     = Math.max(1000, (parseInt(cfg.delaySeconds) || 5) * 1000);
  const maxTries    = Math.max(1, parseInt(cfg.maxTries) || 20);
  const resultVar   = cfg.resultVar  || 'waitResult';

  // Trouver la connexion outbound — sinon utiliser iconikClient (connexion Iconik)
  const conn = (WfdHandlers._connexions || []).find(c => c.id === connexionId);
  const useIconik = !conn && iconikClient;

  let baseUrl = '', headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (conn) {
    baseUrl = conn.baseUrl || conn.endpoint || '';
    if (conn.authType === 'bearer' || conn.authType === 'token') {
      headers['Authorization'] = 'Bearer ' + conn.authValue;
    } else if (conn.authType === 'iconik') {
      headers['App-ID']     = conn.appId     || '';
      headers['Auth-Token'] = conn.authValue || '';
    } else if (conn.authValue) {
      headers['Authorization'] = 'Bearer ' + conn.authValue;
    }
  } else if (!iconikClient) {
    throw new Error('wait_for : connexion introuvable — ' + connexionId);
  }

  // Résoudre la valeur attendue
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  // Fonction pour extraire une valeur par chemin pointé
  const getByPath = (obj, path) => {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  };

  let lastBody = null;
  for (let i = 0; i < maxTries; i++) {
    if (i > 0) await sleep(delayMs);

    try {
      let body;
      if (useIconik) {
        // Mode Iconik — utiliser iconikClient directement
        body = await iconikClient.get(endpoint);
      } else {
        const url = baseUrl.replace(/\/$/, '') + endpoint;
        const res = await globalThis.fetch(url, { method, headers });
        const text = await res.text();
        try { body = JSON.parse(text); } catch(_) { body = text; }
        if (!res.ok) {
          WfdContext.storeResult(ctx, resultVar, { status: res.status, body });
          return { port: 2, warn: `wait_for HTTP ${res.status}` };
        }
      }
      lastBody = body;

      const val = getByPath(body, checkPath);
      WfdContext.storeResult(ctx, resultVar, { body, attempt: i + 1 });

      // Sortie anticipée si valeur d'échec détectée
      const failValues = (cfg.failValues || 'FAILED,ERROR,ABORTED').split(',').map(v => v.trim());
      if (failValues.includes(String(val))) {
        return { port: 2, warn: 'wait_for : valeur d\'échec détectée — ' + val };
      }

      if (String(val) === String(checkValue)) {
        // ── Post-action S3 : lister le dossier et extraire les URLs ──────────
        if (cfg.s3ConnexionId) {
          try {
            const s3Conn = (WfdHandlers._connexions || []).find(function(c) { return c.id === cfg.s3ConnexionId; });
            if (s3Conn && s3Conn.authType === 'aws_s3') {
              const s3Prefix  = r(cfg.s3Prefix || '', ctx);
              const s3Virtual = {
                id    : node.id + '_s3post',
                name  : node.name + ' › Post-action S3',
                family: 'aws_s3',
                config: {
                  connexionId: cfg.s3ConnexionId,
                  operation  : 'list_objects',
                  objectKey  : s3Prefix,
                  resultVar  : 'wf_s3_result',
                  s3Mappings : cfg.s3Mappings && cfg.s3Mappings.length ? cfg.s3Mappings : [
                    { type:'video',    filter:'.mp4,.mov,.ts,.mpeg,.mpg', variable: cfg.s3VarVideo || 's3_video_url' },
                    { type:'image',    filter:'_poster,.jpg,.jpeg,.png',  variable: cfg.s3VarImage || 's3_image_url' },
                    { type:'subtitle', filter:'.srt,.vtt',                variable: cfg.s3VarSrt   || 's3_srt_url'  },
                  ],
                },
              };
              await aws_s3(s3Virtual, ctx, iconikClient);
              console.log('[wait_for] Post-action S3 OK — s3_video_url:', ctx.vars.s3_video_url);
            }
          } catch(e) {
            console.warn('[wait_for] Post-action S3 erreur:', e.message);
          }
        }
        return { port: 0 };
      }
    } catch(e) {
      return { port: 2, warn: 'wait_for erreur réseau : ' + e.message };
    }
  }

  // Timeout
  WfdContext.storeResult(ctx, resultVar, { timeout: true, lastBody, attempts: maxTries });
  return { port: 1, warn: `wait_for timeout après ${maxTries} essais` };
}

// ── AWS S3 ────────────────────────────────────────────────────────────────────
// Opérations sur un bucket Amazon S3 avec Signature V4
async function aws_s3(node, ctx, iconikClient) {
  const cfg         = node.config || {};
  const connexionId = cfg.connexionId || '';
  const operation   = cfg.operation   || 'head_object';
  const objectKey   = r(cfg.objectKey || '', ctx);
  const resultVar   = cfg.resultVar   || 'awsResult';

  const conn = (WfdHandlers._connexions || []).find(c => c.id === connexionId);
  if (!conn) {
    console.log('[DEBUG aws_s3] connexionId cherché :', connexionId);
    console.log('[DEBUG aws_s3] WfdHandlers._connexions actuel :',
      (WfdHandlers._connexions || []).map(c => c.id + '|' + c.name + '|' + c.direction + '|' + c.authType));
    console.log('[DEBUG aws_s3] WfdHandlers identité via typeof/keys:',
      typeof WfdHandlers, Object.keys(WfdHandlers).length, 'clés, a _connexions:', '_connexions' in WfdHandlers);
    throw new Error('aws_s3 : connexion introuvable — ' + connexionId);
  }
  if (conn.authType !== 'aws_s3') throw new Error('aws_s3 : la connexion doit être de type AWS S3');

  // Lire les credentials depuis authValue (JSON) ou depuis les champs directs (legacy)
  let _awsCreds = {};
  try { _awsCreds = JSON.parse(conn.authValue || '{}'); } catch(_) {}
  const accessKey = conn.awsAccessKey || _awsCreds.key    || '';
  const secretKey = conn.awsSecretKey || _awsCreds.secret || '';
  const region    = conn.awsRegion    || _awsCreds.region || 'eu-north-1';
  const bucket    = conn.awsBucket    || _awsCreds.bucket || '';

  if (!accessKey || !secretKey) throw new Error('aws_s3 : credentials AWS manquants');
  if (!bucket)                  throw new Error('aws_s3 : bucket S3 manquant');

  // ── Opération artwork_s3 ─────────────────────────────────────────────────
  // Récupère les artworks depuis les subjobs Iconik, les renomme via une règle
  // de nommage et les copie dans S3 avec CopyObject + DeleteObject
  if (operation === 'artwork_s3') {
    const jobId      = r(cfg.jobId      || '{exportJobId}', ctx);
    const s3Prefix   = r(cfg.objectKey  || '', ctx);
    const titreVar   = r(cfg.titreVar   || '{Titre}',       ctx);
    const nommageId  = cfg.nommageId    || '';
    const artworks   = cfg.artworks     || []; // [{ iconikName, mdField, variable }]
    const writeMd    = cfg.writeMd      !== false;
    const mdViewId   = r(cfg.mdViewId   || '', ctx);

    if (!jobId) throw new Error('artwork_s3 : jobId manquant');
    if (!artworks.length) throw new Error('artwork_s3 : aucun artwork configuré');

    // 0. Si le préfixe destination diffère du préfixe source (slugification),
    //    déplacer tous les fichiers S3 vers le nouveau préfixe avant toute opération
    const srcPrefix = ctx.results?.wf_s3_result?.prefix || '';
    if (s3Prefix && srcPrefix && s3Prefix !== srcPrefix) {
      const _mvCrypto  = require('crypto');
      const _mvNow     = new Date();
      const _mvDateStr = _mvNow.toISOString().replace(/[:\-]|\..*/g, '').slice(0, 15) + 'Z';
      const _mvDateDay = _mvDateStr.slice(0, 8);
      const _mvEmpty   = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const _mvSign    = (method, path2, query2, extraHeaders, bodyHash) => {
        const allH    = { host: `s3.${region}.amazonaws.com`, 'x-amz-date': _mvDateStr, 'x-amz-content-sha256': bodyHash, ...extraHeaders };
        const skeys   = Object.keys(allH).sort();
        const canonH  = skeys.map(k => k + ':' + allH[k]).join('\n') + '\n';
        const signedH = skeys.join(';');
        const canon   = [method, path2, query2, canonH, signedH, bodyHash].join('\n');
        const scope   = `${_mvDateDay}/${region}/s3/aws4_request`;
        const toSign  = `AWS4-HMAC-SHA256\n${_mvDateStr}\n${scope}\n` + _mvCrypto.createHash('sha256').update(canon).digest('hex');
        const hmac    = (k, d) => _mvCrypto.createHmac('sha256', k).update(d).digest();
        const sigKey  = hmac(hmac(hmac(hmac('AWS4' + secretKey, _mvDateDay), region), 's3'), 'aws4_request');
        const sig     = _mvCrypto.createHmac('sha256', sigKey).update(toSign).digest('hex');
        return { Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedH}, Signature=${sig}`, ...allH };
      };
      const _mvListQuery = 'list-type=2&prefix=' + encodeURIComponent(srcPrefix);
      const _mvListRes   = await globalThis.fetch(
        'https://s3.' + region + '.amazonaws.com/' + bucket + '?' + _mvListQuery,
        { method: 'GET', headers: _mvSign('GET', '/' + bucket, _mvListQuery, {}, _mvEmpty) }
      );
      if (_mvListRes.ok) {
        const _mvXml  = await _mvListRes.text();
        const _mvKeys = [..._mvXml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
        for (const srcKey of _mvKeys) {
          const fileName = srcKey.slice(srcPrefix.length);
          const dstKey   = s3Prefix + fileName;
          const dstPath  = '/' + bucket + '/' + dstKey.split('/').map(p => encodeURIComponent(p)).join('/');
          const srcPath  = '/' + bucket + '/' + srcKey.split('/').map(p => encodeURIComponent(p)).join('/');
          const cpSrc    = encodeURIComponent('/' + bucket + '/' + srcKey);
          await globalThis.fetch('https://s3.' + region + '.amazonaws.com' + dstPath,
            { method: 'PUT', headers: _mvSign('PUT', dstPath, '', { 'x-amz-copy-source': cpSrc }, _mvEmpty) });
          await globalThis.fetch('https://s3.' + region + '.amazonaws.com' + srcPath,
            { method: 'DELETE', headers: _mvSign('DELETE', srcPath, '', {}, _mvEmpty) });
        }
        ['s3_video_url','s3_image_url','s3_srt_url'].forEach(v => {
          const val = ctx.vars[v];
          if (val && val.includes(srcPrefix)) WfdContext.setVar(ctx, v, val.replace(srcPrefix, s3Prefix));
        });
        if (ctx.results.wf_s3_result) {
          ctx.results.wf_s3_result.prefix = s3Prefix;
          ctx.results.wf_s3_result.keys   = _mvKeys.map(k => s3Prefix + k.slice(srcPrefix.length));
        }
        console.log('[artwork_s3] Dossier renommé :', srcPrefix, '→', s3Prefix, '(', _mvKeys.length, 'fichiers)');
      }
    }

    // 1. Récupérer les subjobs Iconik pour construire la map { nom → clé S3 }
    if (!iconikClient) throw new Error('artwork_s3 : client Iconik manquant');
    const subjobsRes = await iconikClient.get(`/API/jobs/v1/jobs/?parent_id=${jobId}&per_page=100`);
    const subjobs    = subjobsRes.objects || [];

    // Construire la map { "cover" → { s3FileName: "Test hd upload 10-2.png", iconikFileName: "Cover.png" } }
    // Title format: "Exporting file Cover.png to PRIME"
    // Le titre du subjob ne donne QUE le nom original Iconik (avant renommage par
    // l'export) — le vrai nom du fichier déposé sur S3 vit dans job_context.file_name
    // (ex: "Test hd upload 10-2", sans extension). Sans ce champ, CopyObject échoue
    // en 404 NoSuchKey car "Cover.png" n'existe jamais tel quel comme clé S3.
    const subjobMap = {};
    subjobs.forEach(j => {
      const m = (j.title || '').match(/Exporting file (.+?) to /i);
      if (m) {
        const iconikFileName = m[1]; // "Cover.png"
        const baseName       = iconikFileName.replace(/\.[^.]+$/, ''); // "Cover"
        const ext            = (iconikFileName.match(/\.([^.]+)$/) || [])[1] || 'png';
        const s3BaseName      = j.job_context?.file_name || ''; // "Test hd upload 10-2"
        if (!s3BaseName) return; // pas de file_name exploitable, on ignore ce subjob
        subjobMap[baseName.toLowerCase()] = {
          s3FileName    : s3BaseName + '.' + ext,
          iconikFileName,
        };
      }
    });

    // 2. Récupérer la règle de nommage si configurée
    const nommageRule = nommageId
      ? (WfdHandlers._nommages || []).find(n => n.id === nommageId)
      : null;

    // 3. Pour chaque artwork configuré, faire CopyObject + DeleteObject
    const results   = {};
    const errors    = [];
    const assetId   = ctx.asset?.id || r('{asset.id}', ctx);
    const mdValues  = {};
    // Crypto et signature AWS — initialisés une fois pour toute la fonction
    const _crypto   = require('crypto');
    const _now      = new Date();
    const _dateStr  = _now.toISOString().replace(/[:\-]|\..*/g, '').slice(0, 15) + 'Z';
    const _dateDay  = _dateStr.slice(0, 8);
    const _emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const _signS3 = (method, path2, query2, extraHeaders, bodyHash) => {
      const allHeaders = { host: `s3.${region}.amazonaws.com`, 'x-amz-date': _dateStr, 'x-amz-content-sha256': bodyHash, ...extraHeaders };
      const sortedKeys = Object.keys(allHeaders).sort();
      const canonH     = sortedKeys.map(k => k + ':' + allHeaders[k]).join('\n') + '\n';
      const signedH    = sortedKeys.join(';');
      const canonical  = [method, path2, query2, canonH, signedH, bodyHash].join('\n');
      const scope      = `${_dateDay}/${region}/s3/aws4_request`;
      const toSign     = `AWS4-HMAC-SHA256\n${_dateStr}\n${scope}\n` + _crypto.createHash('sha256').update(canonical).digest('hex');
      const hmac       = (key, data) => _crypto.createHmac('sha256', key).update(data).digest();
      const sigKey     = hmac(hmac(hmac(hmac('AWS4' + secretKey, _dateDay), region), 's3'), 'aws4_request');
      const sig        = _crypto.createHmac('sha256', sigKey).update(toSign).digest('hex');
      return { Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedH}, Signature=${sig}`, ...allHeaders };
    };

    for (const artwork of artworks) {
      const iconikName = artwork.iconikName || ''; // ex: "Cover"
      const mdField    = artwork.mdField    || ''; // ex: "URLCoverArt"
      const variable   = artwork.variable   || ''; // ex: "s3_cover_url"

      // Trouver la clé S3 source via la map subjobs (nom réel S3, pas le nom Iconik)
      const subjobEntry = subjobMap[iconikName.toLowerCase()];
      if (!subjobEntry) {
        errors.push(`${iconikName} : non trouvé dans les subjobs`);
        continue;
      }
      const sourceFileName = subjobEntry.iconikFileName; // ex: "Cover.png" — utilisé plus bas pour l'extension

      // Clé source dans le bucket : le vrai nom du fichier déposé par l'export
      // (job_context.file_name + extension), PAS le nom original Iconik.
      const sourceKey = s3Prefix + subjobEntry.s3FileName;

      // Construire le nouveau nom selon la règle de nommage
      let newName;
      if (nommageRule) {
        const nomCtx = { ...ctx.vars, Titre: titreVar, artwork: iconikName, ext: (sourceFileName.match(/\.([^.]+)$/) || [])[1] || 'png' };
        newName = applyNommage('', nommageRule.steps, nomCtx);
      } else {
        // Nommage par défaut : {Titre}_{Type}.{ext}
        const ext = (sourceFileName.match(/\.([^.]+)$/) || [])[1] || 'png';
        newName = titreVar.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_') + '_' + iconikName + '.' + ext;
      }

      const destKey = s3Prefix + newName;

      // CopyObject S3
      const crypto  = require('crypto');
      const now     = new Date();
      const dateStr = now.toISOString().replace(/[:\-]|\..*/g, '').slice(0, 15) + 'Z';
      const dateDay = dateStr.slice(0, 8);
      const copySource = encodeURIComponent('/' + bucket + '/' + sourceKey);

      const signS3 = (method, path2, query2, extraHeaders, bodyHash) => {
        const allHeaders = { host: `s3.${region}.amazonaws.com`, 'x-amz-date': dateStr, 'x-amz-content-sha256': bodyHash, ...extraHeaders };
        const sortedKeys = Object.keys(allHeaders).sort();
        const canonH     = sortedKeys.map(k => k + ':' + allHeaders[k]).join('\n') + '\n';
        const signedH    = sortedKeys.join(';');
        const canonical  = [method, path2, query2, canonH, signedH, bodyHash].join('\n');
        const scope      = `${dateDay}/${region}/s3/aws4_request`;
        const toSign     = `AWS4-HMAC-SHA256\n${dateStr}\n${scope}\n` + require('crypto').createHash('sha256').update(canonical).digest('hex');
        const hmac       = (key, data) => require('crypto').createHmac('sha256', key).update(data).digest();
        const sigKey     = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateDay), region), 's3'), 'aws4_request');
        const sig        = require('crypto').createHmac('sha256', sigKey).update(toSign).digest('hex');
        return { Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedH}, Signature=${sig}`, ...allHeaders };
      };

      const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const destPath  = `/${bucket}/${destKey.split('/').map(p => encodeURIComponent(p)).join('/')}`;
      const copyHeaders = signS3('PUT', destPath, '', { 'x-amz-copy-source': copySource }, emptyHash);

      const copyRes = await globalThis.fetch(`https://s3.${region}.amazonaws.com${destPath}`, {
        method: 'PUT',
        headers: { ...copyHeaders, 'x-amz-copy-source': copySource },
      });

      if (!copyRes.ok) {
        const txt = await copyRes.text();
        console.error(`[artwork_s3] CopyObject échoué pour "${iconikName}" — sourceKey="${sourceKey}" destKey="${destKey}" bucket="${bucket}" status=${copyRes.status}`);
        console.error(`[artwork_s3] Réponse S3 complète : ${txt}`);
        errors.push(`${iconikName} CopyObject ${copyRes.status}: ${txt.slice(0, 100)}`);
        continue;
      }

      // DeleteObject source
      const srcPath     = `/${bucket}/${sourceKey.split('/').map(p => encodeURIComponent(p)).join('/')}`;
      const delHeaders  = signS3('DELETE', srcPath, '', {}, emptyHash);
      await globalThis.fetch(`https://s3.${region}.amazonaws.com${srcPath}`, {
        method: 'DELETE', headers: delHeaders,
      });

      // URL S3 finale
      const s3Url = `https://s3.${region}.amazonaws.com/${bucket}/${destKey}`;
      results[iconikName] = s3Url;

      if (variable) WfdContext.setVar(ctx, variable, s3Url);
      if (mdField)  mdValues[mdField] = { field_values: [{ value: s3Url }] };
    }

    // 4. Écrire les URLs dans MD Iconik si demandé
    if (writeMd && mdViewId && Object.keys(mdValues).length && iconikClient && assetId) {
      try {
        await iconikClient.put(`/API/metadata/v1/assets/${assetId}/views/${mdViewId}/`, { metadata_values: mdValues });
      } catch(e) {
        errors.push('Écriture MD Iconik : ' + e.message);
      }
    }

    // 5. Supprimer les doublons .srt (Iconik crée un .srt par fichier Original)
    try {
      const _srtListQuery = 'list-type=2&prefix=' + encodeURIComponent(s3Prefix);
      const _srtListHeaders = _signS3('GET', '/' + bucket, _srtListQuery, {}, _emptyHash);
      const _srtListRes = await globalThis.fetch(
        'https://s3.' + region + '.amazonaws.com/' + bucket + '?' + _srtListQuery,
        { method: 'GET', headers: _srtListHeaders }
      );
      if (_srtListRes.ok) {
        const _srtXml  = await _srtListRes.text();
        const _allKeys = [..._srtXml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
        const _srtDups = _allKeys.filter(k => /-\d+\.(srt|vtt)$/i.test(k));
        for (const dupKey of _srtDups) {
          const dupPath = '/' + bucket + '/' + dupKey.split('/').map(p => encodeURIComponent(p)).join('/');
          await globalThis.fetch(
            'https://s3.' + region + '.amazonaws.com' + dupPath,
            { method: 'DELETE', headers: _signS3('DELETE', dupPath, '', {}, _emptyHash) }
          );
        }
        if (_srtDups.length) console.log('[artwork_s3] Doublons .srt supprimés :', _srtDups.length);
      }
    } catch(e) {
      console.warn('[artwork_s3] Nettoyage doublons .srt échoué :', e.message);
    }
    WfdContext.storeResult(ctx, cfg.resultVar || 'artworkResult', { results, errors });

    if (errors.length && Object.keys(results).length === 0) return { port: 2, warn: errors.join(' | ') };
    if (errors.length) return { port: 1, warn: errors.join(' | ') }; // partiel
    return { port: 0 };
  }

  // ── Signature AWS V4 ──────────────────────────────────────────────────────
  const crypto = require('crypto');

  const now     = new Date();
  const dateStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // yyyymmddTHHMMSSZ
  const dateDay = dateStr.slice(0, 8); // yyyymmdd

  const methodMap = {
    head_object  : 'HEAD',
    get_object   : 'GET',
    put_object   : 'PUT',
    delete_object: 'DELETE',
    list_objects : 'GET',
  };
  const method = methodMap[operation] || 'GET';

  const encodedKey = objectKey.split('/').map(p => encodeURIComponent(p)).join('/');
  const path    = operation === 'list_objects'
    ? `/${bucket}/`
    : `/${bucket}/${encodedKey}`;
  const query   = operation === 'list_objects' ? 'list-type=2&prefix=' + encodeURIComponent(objectKey) : '';
  const host    = `s3.${region}.amazonaws.com`;
  const url     = `https://${host}${path}${query ? '?' + query : ''}`;

  // Canonical request
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA256 de body vide
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${dateStr}\n`;
  const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  // String to sign
  const credentialScope = `${dateDay}/${region}/s3/aws4_request`;
  const hashedRequest   = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign    = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${hashedRequest}`;

  // Signing key
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateDay), region), 's3'), 'aws4_request');
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'Host'                 : host,
    'x-amz-date'          : dateStr,
    'x-amz-content-sha256': payloadHash,
    'Authorization'        : authHeader,
  };

  // Exécuter la requête
  console.log('[DEBUG aws_s3 head_object] operation:', operation, '| bucket:', bucket, '| objectKey (résolu):', objectKey, '| url:', url, '| region:', region);
  const res = await globalThis.fetch(url, { method, headers });
  console.log('[DEBUG aws_s3 head_object] réponse status:', res.status);

  if (res.status === 404) {
    WfdContext.storeResult(ctx, resultVar, { status: 404, exists: false, key: objectKey });
    return { port: 1 }; // Non trouvé
  }

  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    WfdContext.storeResult(ctx, resultVar, { status: res.status, error: text, key: objectKey });
    return { port: 2, warn: `AWS S3 HTTP ${res.status}` };
  }

  // Succès
  const resText = await res.text();
  let resBody = resText;

  // Pour list_objects — parser le XML et vérifier s'il y a des objets
  if (operation === 'list_objects') {
    const keyCount = resText.match(/<KeyCount>(\d+)<\/KeyCount>/)?.[1];
    const count = parseInt(keyCount) || 0;
    // Extraire les clés
    const keyMatches = [...resText.matchAll(/<Key>([^<]+)<\/Key>/g)];
    const keys = keyMatches.map(m => m[1]);
    console.log('[DEBUG aws_s3 list_objects] prefix cherché:', objectKey, '| count:', count, '| clés trouvées:', keys.slice(0, 10));
    const result = { status: res.status, count, prefix: objectKey, keys, rawXml: resText };
    WfdContext.storeResult(ctx, resultVar, result);
    WfdContext.setVar(ctx, resultVar + '_count', String(count));
    // Port 0 = trouvé (dossier non vide), Port 1 = non trouvé (dossier vide ou inexistant)
    if (count > 0) {
      const base = 's3://' + bucket + '/';

      // ── Post-action : stocker les URLs selon les mappings configurés ────────
      // s3Mappings = [{ type, filter, variable }]
      // Rétrocompat : si pas de s3Mappings, utiliser les 3 types fixes
      const mappings = cfg.s3Mappings && cfg.s3Mappings.length
        ? cfg.s3Mappings
        : [
            { type:'video',    filter:'.mp4,.mov,.ts,.mpeg,.mpg', variable: cfg.s3VarVideo || 's3_video_url' },
            { type:'image',    filter:'_poster,.jpg,.jpeg,.png',  variable: cfg.s3VarImage || 's3_image_url' },
            { type:'subtitle', filter:'.srt,.vtt',                variable: cfg.s3VarSrt   || 's3_srt_url'  },
          ];

      mappings.forEach(function(mapping) {
        if (!mapping.variable) return;
        const filters = (mapping.filter || '').split(',').map(function(f){ return f.trim().toLowerCase(); }).filter(Boolean);
        if (!filters.length) return;
        // Chercher la clé correspondant au filtre
        // Pour les sous-titres : préférer le fichier sans suffixe numérique (-N)
        // car Iconik crée un .srt par fichier Original (doublons)
        const matchedCandidates = keys.filter(function(k) {
          const kl = k.toLowerCase();
          return filters.some(function(f){ return kl.includes(f); });
        });
        const matchedKey = matchedCandidates.length > 1
          ? (matchedCandidates.find(function(k) {
              // Préférer le fichier sans -N avant l'extension (ex: "titre.srt" vs "titre-1.srt")
              return !k.match(/-\d+\.[^.]+$/);
            }) || matchedCandidates[0])
          : matchedCandidates[0];
        if (matchedKey) {
          WfdContext.setVar(ctx, mapping.variable, base + matchedKey);
          console.log('[AWS S3] mapping', mapping.type, '→', mapping.variable, '=', matchedKey);
        }
      });

      return { port: 0 };
    }
    return { port: 1 };
  }

  const result = {
    status  : res.status,
    exists  : true,
    key     : objectKey,
    headers : {
      contentLength: res.headers.get('content-length'),
      lastModified : res.headers.get('last-modified'),
      etag         : res.headers.get('etag'),
    },
  };
  WfdContext.storeResult(ctx, resultVar, result);
  WfdContext.setVar(ctx, resultVar + '_exists', 'true');
  return { port: 0 };
}

// ── MOTEUR DE NOMMAGE ────────────────────────────────────────────────────────
// Portage de appliquerReglesNommage() depuis le frontend
// Fonction pure — pas de dépendance DOM
function applyNommage(input, steps, context) {
  let s = String(input || '');
  for (const step of (steps || [])) {
    const v = step.value || '';
    switch (step.type) {
      case 'template': {
        s = v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? context[k] : `{${k}}`);
        break;
      }
      case 'replace': {
        const sep = v.includes(' → ') ? ' → ' : (v.includes(' > ') ? ' > ' : null);
        if (sep) {
          const [from, to] = v.split(sep);
          try { s = s.replace(new RegExp(from, 'g'), to); }
          catch(e) { s = s.split(from).join(to || ''); }
        }
        break;
      }
      case 'remove': {
        try { s = s.replace(new RegExp(v, 'g'), ''); }
        catch(e) { s = s.split(v).join(''); }
        break;
      }
      case 'extract': {
        if (v.startsWith('/') && v.includes('/', 1)) {
          const m = v.match(/^\/(.+)\/([gimu]*)$/);
          if (m) { const res = s.match(new RegExp(m[1], m[2])); if (res) s = res[1] || res[0]; }
        } else if (v.includes(':')) {
          const [a, b] = v.split(':').map(Number);
          s = s.slice(a, b || undefined);
        }
        break;
      }
      case 'lowercase':   s = s.toLowerCase(); break;
      case 'uppercase':   s = s.toUpperCase(); break;
      case 'titlecase':   s = s.replace(/\b\w/g, c => c.toUpperCase()); break;
      case 'trim':        s = s.trim(); break;
      case 'slugify':
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
             .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        break;
      case 'limit': {
        const n = parseInt(v) || 50;
        s = n > 0 ? s.slice(0, n) : s.slice(n);
        break;
      }
      case 'prefix': s = v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? String(context[k]) : `{${k}}`) + s; break;
      case 'suffix': s = s + v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? String(context[k]) : `{${k}}`); break;
      case 'regex_capture': {
        const m2 = v.match(/^\/(.+)\/(?:[gimu]*)? *(?:groupe *)?(\d+)?/i);
        if (m2) {
          const r2 = s.match(new RegExp(m2[1]));
          if (r2) s = r2[parseInt(m2[2]) || 1] || r2[0];
        }
        break;
      }
    }
  }
  return s;
}

// ── CHECKER ───────────────────────────────────────────────────────────────────
// Vérifie une liste d'endpoints et leurs valeurs attendues
async function checker(node, ctx, iconikClient) {
  const cfg         = node.config || {};
  const connexionId = cfg.connexionId || '';
  const checks      = cfg.checks || [];

  if (!checks.length) return { port: 0 }; // rien à vérifier

  // Trouver la connexion outbound ou utiliser iconikClient
  const conn    = (WfdHandlers._connexions || []).find(c => c.id === connexionId);
  const useIconik = !conn && iconikClient;

  let baseUrl = '';
  let headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (conn) {
    baseUrl = conn.baseUrl || conn.endpoint || '';
    if (conn.authType === 'bearer' || conn.authType === 'token') headers['Authorization'] = 'Bearer ' + conn.authValue;
    else if (conn.authType === 'iconik') { headers['App-ID'] = conn.appId || ''; headers['Auth-Token'] = conn.authValue || ''; }
    else if (conn.authValue) headers['Authorization'] = 'Bearer ' + conn.authValue;
  } else if (!iconikClient) {
    throw new Error('checker : connexion introuvable — ' + connexionId);
  }

  // Fonction pour extraire une valeur par chemin pointé
  const getByPath = (obj, path) => {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((o, k) => {
      if (o === null || o === undefined) return undefined;
      const arrMatch = k.match(/^(.+)\[(\d+)\]$/);
      if (arrMatch) return o[arrMatch[1]]?.[parseInt(arrMatch[2])];
      return o[k];
    }, obj);
  };

  const failures = [];
  const results  = {};

  for (const chk of checks) {
    const endpoint = r(chk.endpoint || '', ctx);
    const method   = (chk.method || 'GET').toUpperCase();
    const label    = chk.label || endpoint;

    try {
      let body;
      if (useIconik) {
        body = await iconikClient.get(endpoint);
      } else {
        const url = baseUrl.replace(/\/$/, '') + endpoint;
        const res = await globalThis.fetch(url, { method, headers });
        if (!res.ok) {
          failures.push({ label, error: `HTTP ${res.status}` });
          continue;
        }
        const text = await res.text();
        try { body = JSON.parse(text); } catch(_) { body = text; }
      }

      results[label] = body;

      // Vérifier la condition
      const op       = chk.op || 'equals';
      const expected = r(chk.value || '', ctx);
      // Essayer le chemin sur body directement, puis sur body.results si vide
      let actual = chk.path ? getByPath(body, chk.path) : body;
      console.log('[CHECKER DEBUG]', chk.label, '| path:', chk.path, '| body keys:', Object.keys(body||{}).slice(0,5), '| actual:', actual);
      if ((actual === undefined || actual === null || actual === '') && body?.results !== undefined) {
        actual = chk.path ? getByPath(body.results, chk.path) : body.results;
        console.log('[CHECKER DEBUG] fallback actual:', actual);
      }
      const actualStr = actual === null || actual === undefined ? '' : String(actual);

      let pass = false;
      if (op === 'equals')      pass = actualStr === String(expected);
      else if (op === 'not_equals')  pass = actualStr !== String(expected);
      else if (op === 'not_empty')   pass = actualStr !== '' && actual !== null && actual !== undefined;
      else if (op === 'contains')    pass = actualStr.includes(String(expected));
      else if (op === 'starts_with') pass = actualStr.startsWith(String(expected));

      if (!pass) {
        failures.push({ label, path: chk.path, expected, actual: actualStr, op });
      }

    } catch(e) {
      return { port: 2, warn: 'checker erreur : ' + e.message };
    }
  }

  // Stocker le résumé dans le contexte
  const summary = { total: checks.length, passed: checks.length - failures.length, failures };
  WfdContext.storeResult(ctx, 'checkerResult', summary);
  WfdContext.setVar(ctx, 'checkerSummary', failures.length
    ? failures.map(f => (f.label || f.path) + ': ' + (f.error || f.actual || 'échec')).join(', ')
    : 'OK');

  console.log('[CHECKER] failures:', JSON.stringify(failures));
  console.log('[CHECKER] summary:', WfdContext.getVar ? WfdContext.getVar(ctx, 'checkerSummary') : ctx.vars?.checkerSummary);
  return failures.length > 0
    ? { port: 1, warn: failures.map(f => f.label + ': ' + (f.error || f.actual)).join(' | ') }
    : { port: 0 };
}

// ── APS SEARCH ───────────────────────────────────────────────────────────────
async function aps_search(node, ctx, iconikClient) {
  requireIconik(iconikClient, 'aps_search');
  const cfg = node.config || {};
  const blocks     = cfg.blocks     || [];
  const expression = (cfg.expression || '').trim();
  const returnBlock = cfg.returnBlock ?? 1;
  const limit      = cfg.limit      || 500;
  const resultVar  = cfg.resultVar  || 'search_results';

  if (!blocks.length) throw new Error('Recherche APS : aucun bloc défini');

  // Évaluer l'expression booléenne pour déterminer les blocs actifs
  // Expression : "1 AND 2 AND (3 OR 4) AND NOT 5"
  // Si absente → tous les blocs sont actifs
  let activeBlocks = new Set(blocks.map(b => b.id));
  if (expression) {
    try {
      activeBlocks = _apsSearchEvalExpression(expression, blocks.map(b => b.id));
    } catch(e) {
      console.warn('[APS SEARCH] Expression invalide, tous les blocs actifs :', e.message);
    }
  }

  // Exécuter les blocs dans l'ordre, en injectant les résultats parents
  const blockResults = {}; // blockId → tableau d'objets Iconik

  for (const block of blocks) {
    if (!activeBlocks.has(block.id)) continue;

    // Récupérer les IDs du bloc parent si relation définie
    let parentIds = null;
    if (block.parentBlock != null) {
      const parentRes = blockResults[block.parentBlock] || [];
      parentIds = parentRes.map(obj => obj.id).filter(Boolean);
      if (!parentIds.length) {
        // Parent n'a rien retourné — ce bloc ne peut pas s'exécuter
        blockResults[block.id] = [];
        continue;
      }
    }

    // Construire le body Iconik search
    const body = _apsSearchBuildBody(block, parentIds, limit, ctx);

    try {
      const res = await iconikClient.post('/API/search/v1/search/', body);
      blockResults[block.id] = (res.objects || []);
      console.log('[APS SEARCH] Bloc', block.id, ':', blockResults[block.id].length, 'résultat(s)');
    } catch(e) {
      console.error('[APS SEARCH] Bloc', block.id, 'erreur :', e.message);
      WfdContext.addError(ctx, node.name, 'Bloc ' + block.id + ' : ' + e.message, 'error');
      return { port: 2 };
    }
  }

  // Retourner le résultat du bloc choisi
  const finalResults = blockResults[returnBlock] || [];
  WfdContext.storeResult(ctx, resultVar, { objects: finalResults, total: finalResults.length });
  WfdContext.setVar(ctx, resultVar, JSON.stringify(finalResults));
  WfdContext.setVar(ctx, resultVar + '.count', String(finalResults.length));

  // Quand il n'y a exactement qu'UN résultat, exposer ses champs usuels a
  // plat (meme convention que le fetch metadata) - evite d'obliger a ecrire
  // {resultVar.objects.0.id} partout ou une recherche ne sert qu'a retrouver
  // "l'objet unique s'il existe" (cas tres frequent : artwork trouve ou non).
  if (finalResults.length === 1) {
    const only = finalResults[0];
    ['id', 'title', 'object_type', 'external_id'].forEach(f => {
      if (only[f] !== undefined && only[f] !== null) {
        WfdContext.setVar(ctx, resultVar + '.' + f, String(only[f]));
      }
    });
  }

  console.log('[APS SEARCH] Résultat final bloc', returnBlock, ':', finalResults.length, 'objet(s)');
  return finalResults.length > 0 ? { port: 0 } : { port: 1 };
}

// Construit le body pour POST /API/search/v1/search/
function _apsSearchBuildBody(block, parentIds, limit, ctx) {
  const OBJECT_TYPE_MAP = {
    asset          : 'assets',
    collection     : 'collections',
    segment        : 'segments',
    saved_search   : 'saved_searches',
    format         : 'formats',
    storage        : 'storages',
  };

  const objectType = OBJECT_TYPE_MAP[block.objectType] || block.objectType || 'assets';
  const criteria    = block.criteria || [];
  const queryString = _apsSearchCriteriaToQuery(criteria, ctx, objectType);

  const body = {
    doc_types : [objectType],
    // Corrige le 14/07/2026 (doc_types) puis le 14/07/2026 (query au lieu de
    // filters) : confirme en direct que le tableau "filters" est ignore par
    // cet endpoint Iconik (payload envoye correctement forme, verifie en
    // isolant via la console, resultats jamais scopes) - seule la syntaxe
    // "query" (type Elasticsearch/Lucene : field:"valeur", AND/OR, wildcards)
    // produit un vrai filtrage. Confirme avec parent_id sur une vraie
    // collection (2 enfants directs exacts retournes, rien d'etranger).
    query     : queryString,
    filters   : [],  // conserve vide pour compat de forme, plus jamais peuple
    limit     : limit,
    offset    : 0,
  };

  // Relation parent → collection_ids (mecanisme distinct, PAS reverifie avec
  // le meme niveau de certitude que "query" - a tester separement si utilise)
  if (parentIds && parentIds.length) {
    body.collection_ids = parentIds;
  }

  return body;
}

// Echappe une valeur pour l'inserer dans la syntaxe query Iconik (guillemets
// et antislash, au minimum - suffisant pour les cas rencontres jusqu'ici)
function _apsSearchEscVal(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Traduit UN critère en terme de requête (chaîne), pas en objet filtre —
// le tableau "filters" natif d'Iconik s'est révélé ignoré par cet endpoint.
function _apsSearchCritToQueryTerm(crit, ctx, objectType) {
  if (!crit.field) return null;
  const field = crit.field;
  const op    = crit.op || 'equals';

  // Critère collection browse
  if (field === '__collection__') {
    let rawColVal = crit.value || '';
    if (rawColVal.includes('{')) rawColVal = WfdContext.resolve(rawColVal, ctx);

    let colIds;
    try {
      const parsed = JSON.parse(rawColVal);
      colIds = Array.isArray(parsed) ? parsed : [rawColVal];
    } catch (e) {
      colIds = rawColVal ? [rawColVal] : [];
    }
    colIds = colIds.filter(Boolean);
    if (!colIds.length) return null;

    // Le nom de champ depend de CE QU'ON CHERCHE, pas seulement de la case
    // "sous-dossiers" - bug corrige le 14/07/2026 : le champ etait toujours
    // parent_id/ancestor_collections, meme quand objectType='assets', alors
    // qu'un Asset n'a pas de parent_id (verifie en conditions reelles :
    // in_collections retrouve les assets, parent_id retrouve les collections
    // filles - deux champs Iconik distincts, pas interchangeables).
    const isCollectionSearch = objectType === 'collections';
    let fieldName;
    if (op === 'in_branch') {
      fieldName = 'ancestor_collections'; // verifie pour les assets ; pour les
                                            // collections, pas reverifie independamment
    } else {
      fieldName = isCollectionSearch ? 'parent_id' : 'in_collections';
    }
    const terms = colIds.map(id => fieldName + ':"' + _apsSearchEscVal(id) + '"');
    return terms.length === 1 ? terms[0] : '(' + terms.join(' OR ') + ')';
  }

  const rawVal = crit.value || '';
  const val   = rawVal.includes('{') ? WfdContext.resolve(rawVal, ctx) : rawVal;

  const SYSTEM_FIELDS = ['id','title','date_created','date_modified','object_type','status','archive_status','external_id'];
  const isSystem = SYSTEM_FIELDS.includes(field);
  const fname = isSystem ? field : 'metadata.' + field;
  const v = _apsSearchEscVal(val);

  switch (op) {
    case 'equals':        return fname + ':"' + v + '"';
    case 'not_equals':    return 'NOT ' + fname + ':"' + v + '"';
    case 'contains':      return fname + ':*' + v + '*';
    case 'not_contains':  return 'NOT ' + fname + ':*' + v + '*';
    case 'starts_with':   return fname + ':' + v + '*';
    case 'is_empty':      return 'NOT _exists_:' + fname;
    case 'is_not_empty':  return '_exists_:' + fname;
    case 'before':        return fname + ':<"' + v + '"';
    case 'after':         return fname + ':>"' + v + '"';
    case 'gt':             return fname + ':>' + v;
    case 'lt':             return fname + ':<' + v;
    case 'contains_any': {
      const vals = val.split(',').map(x => x.trim()).filter(Boolean);
      return vals.length ? '(' + vals.map(x => fname + ':"' + _apsSearchEscVal(x) + '"').join(' OR ') + ')' : null;
    }
    case 'contains_all': {
      const vals = val.split(',').map(x => x.trim()).filter(Boolean);
      return vals.length ? '(' + vals.map(x => fname + ':"' + _apsSearchEscVal(x) + '"').join(' AND ') + ')' : null;
    }
    case 'is_true':  return fname + ':true';
    case 'is_false': return fname + ':false';
    default:
      console.warn('[APS SEARCH] Opérateur inconnu :', op);
      return null;
  }
}

// Assemble tous les critères d'un bloc en une seule chaîne query, en
// respectant le AND/OR de chaque critère (join) vis-à-vis du précédent.
function _apsSearchCriteriaToQuery(criteria, ctx, objectType) {
  const parts = [];
  criteria.forEach(crit => {
    const term = _apsSearchCritToQueryTerm(crit, ctx, objectType);
    if (!term) return;
    if (parts.length) parts.push(crit.join === 'OR' ? 'OR' : 'AND');
    parts.push(term);
  });
  return parts.length ? '(' + parts.join(' ') + ')' : '';
}

// Évalue l'expression booléenne "1 AND 2 AND (3 OR 4) AND NOT 5"
// Retourne un Set des IDs de blocs actifs
function _apsSearchEvalExpression(expr, allIds) {
  // Remplacer les IDs par true/false temporairement pour eval partiel
  // Approche : parser l'expression en tokens et résoudre
  // Les blocs référencés dans l'expression sont "actifs si leur numéro apparaît"
  // NOT n → exclure n, le reste est inclus via AND/OR
  const active = new Set();
  const excluded = new Set();

  // Extraire les tokens NOT n
  const notMatches = expr.matchAll(/NOT\s+(\d+)/g);
  for (const m of notMatches) excluded.add(parseInt(m[1]));

  // Extraire tous les numéros de blocs mentionnés
  const numMatches = expr.matchAll(/(\d+)/g);
  for (const m of numMatches) {
    const id = parseInt(m[1]);
    if (!excluded.has(id)) active.add(id);
  }

  // Valider : seuls les IDs connus sont gardés
  return new Set([...active].filter(id => allIds.includes(id)));
}

WfdHandlers.aps_search = aps_search;
