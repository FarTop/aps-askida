// APS — server/engine-builder/builder-handler-iconik-search.js — créé le 2026-08-05
// Port de aps_search(), server/engine/wfd-engine-handlers.js:4163-4480 — la
// façade la plus utilisée en production (20 usages, cf. pivot-catalog-iconik.js).
// Ports du pivot (facade iconik.search) : found | empty | error — remplacent
// les index 0/1/2 de WFD, mêmes conditions de branchement.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik, extractTechnical } = require('./builder-iconik-shared.js');

async function iconikSearch(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.search');

  const p          = step.params || {};
  const blocks      = p.blocks     || [];
  const expression  = (p.expression || '').trim();
  const returnBlock = p.returnBlock ?? 1;
  const limit       = p.limit      || 500;
  const resultVar   = p.resultVar  || 'search_results';
  const mode        = p.mode       || 'retrieve';

  if (!blocks.length) throw new Error('Recherche APS : aucun bloc défini');

  let activeBlocks = new Set(blocks.map(b => b.id));
  if (expression) {
    try {
      activeBlocks = _evalExpression(expression, blocks.map(b => b.id));
    } catch (e) {
      console.warn('[BUILDER iconik.search] Expression invalide, tous les blocs actifs :', e.message);
    }
  }

  const blockResults = {};

  for (const block of blocks) {
    if (!activeBlocks.has(block.id)) continue;

    let parentIds = null;
    if (block.parentBlock != null) {
      const parentRes = blockResults[block.parentBlock] || [];
      parentIds = parentRes.map(obj => obj.id).filter(Boolean);
      if (!parentIds.length) {
        blockResults[block.id] = [];
        continue;
      }
    }

    const body = _buildBody(block, parentIds, limit, ctx);

    try {
      const res = await iconikClient.post('/API/search/v1/search/', body);
      blockResults[block.id] = (res.objects || []);
    } catch (e) {
      BuilderContext.addError(ctx, step.id, 'Bloc ' + block.id + ' : ' + e.message, 'warn');
      return { port: 'error' };
    }
  }

  const finalResults = blockResults[returnBlock] || [];
  BuilderContext.storeResult(ctx, resultVar, { objects: finalResults, total: finalResults.length });
  BuilderContext.setVar(ctx, resultVar, JSON.stringify(finalResults));
  BuilderContext.setVar(ctx, resultVar + '.count', String(finalResults.length));

  if (finalResults.length === 1) {
    const only = finalResults[0];
    ['id', 'title', 'object_type', 'external_id'].forEach(f => {
      if (only[f] !== undefined && only[f] !== null) {
        BuilderContext.setVar(ctx, resultVar + '.' + f, String(only[f]));
      }
    });

    const _mdFlat = mode === 'presence' ? null : (only.metadata || null);
    const _mdVals = mode === 'presence' ? null : (only.metadata_values || null);
    const _expose = (fieldName, values) => {
      if (fieldName === '__separator__') return;
      const clean = (values || []).filter(v => v !== null && v !== undefined && v !== '');
      if (!clean.length) return;
      const exposed = clean.length === 1 ? String(clean[0]) : JSON.stringify(clean);
      BuilderContext.setVar(ctx, fieldName, exposed);
      BuilderContext.setVar(ctx, resultVar + '.' + fieldName, exposed);
    };
    if (_mdFlat && typeof _mdFlat === 'object') {
      Object.entries(_mdFlat).forEach(([f, v]) => _expose(f, Array.isArray(v) ? v : [v]));
    }
    if (_mdVals && typeof _mdVals === 'object') {
      Object.entries(_mdVals).forEach(([f, d]) => _expose(f, (d?.field_values || []).map(fv => fv.value)));
    }

    if (p.withFormats && mode !== 'presence'
        && (only.object_type === 'assets' || only.object_type === 'asset' || !only.object_type)) {
      await extractTechnical(only.id, resultVar, ctx, iconikClient);
    }
  }

  if (mode === 'presence') {
    const missing = [];
    const counts  = {};
    for (const block of blocks) {
      if (!activeBlocks.has(block.id)) continue;
      const lbl = (block.label && String(block.label).trim()) || ('bloc' + block.id);
      const n   = (blockResults[block.id] || []).length;
      counts[lbl] = n;
      BuilderContext.setVar(ctx, resultVar + '.count.' + lbl, String(n));
      if (n === 0) missing.push(lbl);
    }
    const complete = missing.length === 0;
    BuilderContext.setVar(ctx, resultVar + '.missing', missing.join(', '));
    BuilderContext.setVar(ctx, resultVar + '.complete', String(complete));
    BuilderContext.storeResult(ctx, resultVar, { objects: finalResults, total: finalResults.length, missing, complete, counts });
    return { port: complete ? 'found' : 'empty' };
  }

  return finalResults.length > 0 ? { port: 'found' } : { port: 'empty' };
}

function _buildBody(block, parentIds, limit, ctx) {
  const OBJECT_TYPE_MAP = {
    asset: 'assets', collection: 'collections', segment: 'segments',
    saved_search: 'saved_searches', format: 'formats', storage: 'storages',
  };
  const objectType  = OBJECT_TYPE_MAP[block.objectType] || block.objectType || 'assets';
  const criteria     = block.criteria || [];
  const queryString  = _criteriaToQuery(criteria, ctx, objectType);

  const body = {
    doc_types: [objectType],
    query    : queryString,
    filters  : [],
    limit    : limit,
    offset   : 0,
  };
  if (parentIds && parentIds.length) body.collection_ids = parentIds;
  return body;
}

function _escVal(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _critToQueryTerm(crit, ctx, objectType) {
  if (!crit.field) return null;
  const field = crit.field;
  const op    = crit.op || 'equals';

  if (field === '__collection__') {
    let rawColVal = crit.value || '';
    if (rawColVal.includes('{')) rawColVal = BuilderContext.resolve(rawColVal, ctx);

    let colIds;
    try {
      const parsed = JSON.parse(rawColVal);
      colIds = Array.isArray(parsed) ? parsed : [rawColVal];
    } catch (e) {
      colIds = rawColVal ? [rawColVal] : [];
    }
    colIds = colIds.filter(Boolean);
    if (!colIds.length) return null;

    const isCollectionSearch = objectType === 'collections';
    let fieldName;
    if (op === 'in_branch') {
      fieldName = 'ancestor_collections';
    } else {
      fieldName = isCollectionSearch ? 'parent_id' : 'in_collections';
    }
    const terms = colIds.map(id => fieldName + ':"' + _escVal(id) + '"');
    return terms.length === 1 ? terms[0] : '(' + terms.join(' OR ') + ')';
  }

  const rawVal = crit.value || '';
  const val    = rawVal.includes('{') ? BuilderContext.resolve(rawVal, ctx) : rawVal;

  const SYSTEM_FIELDS = ['id', 'title', 'media_type', 'date_created', 'date_modified', 'object_type', 'status', 'archive_status', 'external_id'];
  const isSystem = SYSTEM_FIELDS.includes(field);
  const fname = isSystem ? field : 'metadata.' + field;
  const v = _escVal(val);

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
    case 'gt':            return fname + ':>' + v;
    case 'lt':            return fname + ':<' + v;
    case 'contains_any': {
      const vals = val.split(',').map(x => x.trim()).filter(Boolean);
      return vals.length ? '(' + vals.map(x => fname + ':"' + _escVal(x) + '"').join(' OR ') + ')' : null;
    }
    case 'contains_all': {
      const vals = val.split(',').map(x => x.trim()).filter(Boolean);
      return vals.length ? '(' + vals.map(x => fname + ':"' + _escVal(x) + '"').join(' AND ') + ')' : null;
    }
    case 'is_true':  return fname + ':true';
    case 'is_false': return fname + ':false';
    default:
      console.warn('[BUILDER iconik.search] Opérateur inconnu :', op);
      return null;
  }
}

function _criteriaToQuery(criteria, ctx, objectType) {
  const parts = [];
  criteria.forEach(crit => {
    const term = _critToQueryTerm(crit, ctx, objectType);
    if (!term) return;
    if (parts.length) parts.push(crit.join === 'OR' ? 'OR' : 'AND');
    parts.push(term);
  });
  return parts.length ? '(' + parts.join(' ') + ')' : '';
}

function _evalExpression(expr, allIds) {
  const active   = new Set();
  const excluded = new Set();

  const notMatches = expr.matchAll(/NOT\s+(\d+)/g);
  for (const m of notMatches) excluded.add(parseInt(m[1]));

  const numMatches = expr.matchAll(/(\d+)/g);
  for (const m of numMatches) {
    const id = parseInt(m[1]);
    if (!excluded.has(id)) active.add(id);
  }

  return new Set([...active].filter(id => allIds.includes(id)));
}

module.exports = iconikSearch;
