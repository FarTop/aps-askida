// APS — server/engine-builder/builder-handler-set-variable.js — créé le 2026-08-05
// Port de set_var(), server/engine/wfd-engine-handlers.js:123-138.
'use strict';

const BuilderContext = require('./builder-context.js');

async function setVariable(step, ctx) {
  const p = step.params || {};
  const assignments = p.assignments || [];

  for (const a of assignments) {
    if (!a || !a.key) continue;
    BuilderContext.setVar(
      ctx,
      BuilderContext.resolve(a.key, ctx),
      BuilderContext.resolve(a.value || '', ctx),
      a.mode || 'set'
    );
  }

  return { port: 'out' };
}

module.exports = setVariable;
