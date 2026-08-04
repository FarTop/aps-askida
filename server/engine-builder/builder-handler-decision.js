// APS — server/engine-builder/builder-handler-decision.js — créé le 2026-08-05
// Port de decision(), server/engine/wfd-engine-handlers.js:47-119.
// Différence structurelle avec WFD : les ports sont les LIBELLÉS des
// conditions (chaînes), pas des index numériques — pas de traduction, le
// pivot route déjà par libellé (pivot-catalog-iconik.js:50-62). Le port
// "default" est toujours retourné tel quel sur non-match ; le repli vers
// `params.otherwise` (« router comme si c'était le port X ») est résolu par
// l'exécuteur au moment de chercher l'arête suivante (builder-executor.js,
// _nextEdges), pas ici.
'use strict';

const BuilderContext = require('./builder-context.js');

function evalCondition(actual, op, expected) {
  const a = String(actual ?? '');
  const e = String(expected ?? '');
  switch (op) {
    case 'equals'           : return a === e;
    case 'not_equals'       : return a !== e;
    case 'is_empty'         : return a === '' || actual == null;
    case 'not_empty'        : return a !== '' && actual != null;
    case 'contains'         : return a.includes(e);
    case 'not_contains'     : return !a.includes(e);
    case 'starts_with'      : return a.startsWith(e);
    case 'ends_with'        : return a.endsWith(e);
    case 'not_starts_with'  : return !a.startsWith(e);
    case 'not_ends_with'    : return !a.endsWith(e);
    case 'matches_regex'    : { try { return new RegExp(e).test(a); } catch (_) { return false; } }
    case 'not_matches_regex': { try { return !new RegExp(e).test(a); } catch (_) { return true; } }
    case 'gt'               : return parseFloat(a) > parseFloat(e);
    case 'gte'              : return parseFloat(a) >= parseFloat(e);
    case 'lt'               : return parseFloat(a) < parseFloat(e);
    case 'lte'              : return parseFloat(a) <= parseFloat(e);
    case 'in_list'          : return e.split(',').map(x => x.trim()).includes(a);
    case 'not_in_list'      : return !e.split(',').map(x => x.trim()).includes(a);
    case 'present'          : return actual != null && a !== '';
    case 'absent'           : return actual == null || a === '';
    default                 : return false;
  }
}

async function decision(step, ctx) {
  const p = step.params || {};
  const fieldRaw = p.field || '';

  const simpleMatch = fieldRaw.trim().match(/^\{([^}]+)\}$/);
  let actual;
  if (simpleMatch) {
    const varName = simpleMatch[1];
    actual = ctx.vars?.[varName];
    if (actual === undefined) actual = BuilderContext.resolvePath(fieldRaw, ctx);
  } else {
    const field = BuilderContext.resolve(fieldRaw, ctx);
    actual = BuilderContext.resolvePath(field, ctx);
    if (actual === undefined) actual = ctx.vars?.[field];
  }

  const conditions = p.conditions || [];
  for (const cond of conditions) {
    if (evalCondition(actual, cond.op || 'equals', BuilderContext.resolve(cond.value || '', ctx))) {
      BuilderContext.storeResult(ctx, '_decision', {
        field: fieldRaw, actual, matchedLabel: cond.label, matchedOp: cond.op, matchedValue: cond.value || '',
      });
      return { port: cond.label };
    }
  }

  BuilderContext.storeResult(ctx, '_decision', {
    field: fieldRaw, actual, matchedLabel: 'default', matchedOp: 'default', matchedValue: '',
  });
  return { port: 'default' };
}

module.exports = decision;
