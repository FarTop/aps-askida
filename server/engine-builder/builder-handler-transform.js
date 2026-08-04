// APS — server/engine-builder/builder-handler-transform.js — créé le 2026-08-05
// Port de transform(), server/engine/wfd-engine-handlers.js:365-434 — SEULE
// la branche "opération unique" (upper/lower/trim/replace/slice/pad_start/
// truncate/separator_join/expression + target) : la branche `rules[]`
// (composition multi-source) appartient à l'ancien "Transformer designer" du
// WFD Designer, un outil séparé — pas au panneau du core `transform` du
// Builder (CLAUDE.md, section pivot). Port unique : out.
'use strict';

const BuilderContext = require('./builder-context.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _evalExpression(expr, ctx) {
  if (!expr) return '';
  try {
    const resolved = expr.replace(/\{([^}]+)\}/g, (match, path) => {
      const val = BuilderContext.resolvePath(path.trim(), ctx) ?? ctx.vars?.[path.trim()];
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'number') return val;
      const num = Number(val);
      if (!isNaN(num) && String(val).trim() !== '') return num;
      return JSON.stringify(String(val));
    });
    // eslint-disable-next-line no-new-func
    const fn = new Function('Math', 'parseInt', 'parseFloat', 'String', 'Number',
      '"use strict"; return (' + resolved + ')');
    const result = fn(Math, parseInt, parseFloat, String, Number);
    return result === null || result === undefined ? '' : result;
  } catch (e) {
    return '#ERREUR: ' + e.message;
  }
}

async function transform(step, ctx) {
  const p = step.params || {};
  let value = r(p.source || p.value || '', ctx);

  switch (p.operation) {
    case 'upper': value = value.toUpperCase(); break;
    case 'lower': value = value.toLowerCase(); break;
    case 'trim':  value = value.trim(); break;
    case 'replace':
      if (p.find) value = value.replaceAll(r(p.find, ctx), r(p.replace || '', ctx));
      break;
    case 'regex_replace':
      try { value = value.replace(new RegExp(r(p.find, ctx), 'g'), r(p.replace || '', ctx)); }
      catch (_) {}
      break;
    case 'slice':
      value = value.slice(Number(p.start) || 0, p.end != null ? Number(p.end) : undefined);
      break;
    case 'pad_start':
      value = value.padStart(Number(p.length) || 0, p.char || '0');
      break;
    case 'truncate':
      if (p.maxLen && value.length > Number(p.maxLen)) {
        value = value.slice(0, Number(p.maxLen));
      }
      break;
    case 'separator_join':
      value = value.replace(/[\s_\-.]+/g, p.separator || '_');
      break;
    case 'expression':
      value = String(_evalExpression(p.expression || p.value || '', ctx) ?? '');
      break;
  }

  if (p.target) BuilderContext.setVar(ctx, r(p.target, ctx), value);
  return { port: 'out' };
}

module.exports = transform;
