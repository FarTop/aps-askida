// APS — server/engine-builder/builder-handler-http-sequence.js — créé le 2026-08-05
// Port de handleHttpSequence(), server/engine/wfd-engine-handlers.js:3151-3225.
// `steps` vient de la résolution de `params.sequenceId` (Endpoint.steps),
// même dérivation que pivot-to-wfd.js:186-189 (sequenceId -> steps), portée
// ici plutôt qu'au moment de la conversion. Partagé par le core `http_sequence`
// pur et la façade `vodfactory.partner` (même fonction, cf. builder-handlers-
// index.js). Chaque étape de la séquence est un step "virtuel" exécuté via
// builder-handler-http-request.js (simple ou foreach selon son propre
// httpMode). Ports du pivot : out | err.
'use strict';

const BuilderContext = require('./builder-context.js');
const httpRequest     = require('./builder-handler-http-request.js');

async function httpSequence(step, ctx, deps) {
  const p = step.params || {};
  const sequence = p.sequenceId && deps.resolved && deps.resolved.endpoints
    ? deps.resolved.endpoints[p.sequenceId] : null;
  const steps = (sequence && sequence.steps) || p.steps || [];

  if (!steps.length) {
    return { port: 'out' };
  }

  let lastError = null;

  for (let i = 0; i < steps.length; i++) {
    const seqStep = steps[i];
    const virtualStep = {
      id: step.id + '_step_' + i,
      core: 'http_request',
      label: (step.label || 'Séquence') + ' › ' + (seqStep.name || 'Étape ' + (i + 1)),
      params: Object.assign({}, seqStep, {
        connexionId: seqStep.connexionId || p.connexionId,
      }),
    };

    if (seqStep.skipIfEmpty) {
      const _cond = BuilderContext.resolve(seqStep.skipIfEmpty, ctx);
      if (_cond === undefined || _cond === null || _cond === ''
          || /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(String(_cond).trim())) {
        continue;
      }
    }

    try {
      const result = await httpRequest(virtualStep, ctx, deps);
      if (result && result.port === 'error' && seqStep.onError !== 'continue') {
        lastError = 'Étape ' + (i + 1) + ' (' + virtualStep.label + ') a échoué';
        break;
      }
    } catch (e) {
      if (seqStep.onError !== 'continue') {
        lastError = e.message;
        break;
      }
    }
  }

  if (lastError) {
    BuilderContext.addError(ctx, step.id, lastError, 'warn');
    return { port: 'err' };
  }
  return { port: 'out' };
}

module.exports = httpSequence;
