// APS — server/engine-builder/builder-handler-lookup.js — créé le 2026-08-05
// Port de lookup(), server/engine/wfd-engine-handlers.js:927-1160 (+
// _setNestedValue:933-992, _isUnresolvedPlaceholder). `rows` vient de la
// résolution de `params.mappingId` (Mapping.rules), portée depuis
// pivot-to-wfd.js:88-91 (mappingId -> lkRows) plutôt que d'une conversion
// préalable. Ports du pivot : found | not_found.
'use strict';

const BuilderContext = require('./builder-context.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _isUnresolvedPlaceholder(v) {
  return typeof v === 'string' && /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(v.trim());
}

function _setNestedValue(obj, path, val) {
  const arrAttrMatch = path.match(/^([^[]+)\[([^=\]]+)=([^\]]+)\]\.(.+)$/);
  if (arrAttrMatch) {
    const listKey  = arrAttrMatch[1];
    const attrKey  = arrAttrMatch[2];
    const attrVal  = arrAttrMatch[3];
    const fieldKey = arrAttrMatch[4];
    if (!Array.isArray(obj[listKey])) obj[listKey] = [];
    let items = val;
    if (typeof val === 'string' && val.startsWith('[')) {
      try { items = JSON.parse(val); } catch (e) {}
    }
    items = Array.isArray(items) ? items : [items];
    items.forEach(function (v) {
      const entry = {};
      entry[attrKey]  = attrVal;
      entry[fieldKey] = v;
      obj[listKey].push(entry);
    });
    return;
  }

  const arrMatch = path.match(/^([^.[]+)\[\]$/);
  if (arrMatch) {
    obj[arrMatch[1]] = Array.isArray(val) ? val : [val];
    return;
  }

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

  obj[path] = val;
}

async function lookup(step, ctx, deps) {
  const p = step.params || {};
  const inputVar = p.lkInputVar || '';
  const mapping  = p.mappingId && deps && deps.resolved && deps.resolved.mappings
    ? deps.resolved.mappings[p.mappingId] : null;
  const rows     = (mapping && mapping.rules) || p.lkRows || [];
  const target   = r(p.lkOutputVar || '_lookup_result', ctx);
  const fallback = p.lkFallback;

  const inputStr = inputVar.replace(/^\{|\}$/g, '');
  const inputRaw = BuilderContext.resolvePath(inputStr, ctx)
                ?? ctx.results?.[inputStr]
                ?? r(inputVar, ctx);
  const isObject = inputRaw && typeof inputRaw === 'object' && !Array.isArray(inputRaw);

  if (isObject) {
    const mapped  = {};
    let   matched = 0;

    rows.forEach(row => {
      const fromKey  = (row.key || row.from || row.src || '').trim();
      const toKey    = (row.value || row.to || row.tgt || '').trim();
      const children = row.children || [];
      if (!fromKey || !toKey) return;

      let val;
      if (fromKey.includes('{') || fromKey.includes('://') || fromKey.includes('{{')) {
        val = r(fromKey, ctx);
      } else {
        val = inputRaw[fromKey];
      }

      if (val === undefined && inputRaw.metadata_values) {
        const fv = inputRaw.metadata_values[fromKey]?.field_values;
        if (fv?.length) val = fv.length === 1 ? fv[0].value : fv.map(f => f.value);
      }

      if (val === undefined) val = ctx.vars?.[fromKey];

      if ((val === undefined || val === null || val === '') && row.fallback) {
        const fbKey = row.fallback.replace(/^\{|\}$/g, '');
        val = ctx.vars?.[fbKey] ?? r(row.fallback, ctx);
      }

      if (_isUnresolvedPlaceholder(val)) return;
      if (val === undefined || val === null || val === '') return;

      if (children.length) {
        const valStr = String(val);
        const child  = children.find(c => (c.key || c.src || '').trim() === valStr);
        if (child) {
          val = (child.value || child.tgt || '').trim();
        }
      }
      if (row.list === true || row.list === 'true' || row.type === 'list') {
        val = Array.isArray(val) ? val : [val];
      }

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

      if (row._format === 'slug') {
        const _slugify = function (s) {
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
          } catch (e) { val = _slugify(val); }
        } else {
          val = _slugify(String(val));
        }
      }
      _setNestedValue(mapped, toKey, val);
      matched++;
    });

    BuilderContext.storeResult(ctx, target, mapped);
    BuilderContext.setVar(ctx, target, JSON.stringify(mapped));
    Object.entries(mapped).forEach(([k, v]) => {
      if (!k.includes('.') && !k.includes('[') && typeof v !== 'object') {
        BuilderContext.setVar(ctx, k, String(v ?? ''));
      }
    });

    return { port: matched > 0 ? 'found' : 'not_found' };
  }

  const input = String(inputRaw ?? '');
  const def   = fallback != null ? r(String(fallback), ctx) : input;
  const match = rows.find(row => {
    const from = (row.key || row.from || '').trim();
    return r(from, ctx) === input || from === input;
  });
  const output = match ? r((match.value || match.to || ''), ctx) : def;
  BuilderContext.setVar(ctx, target, output);
  return { port: match ? 'found' : 'not_found' };
}

module.exports = lookup;
