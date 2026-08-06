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
  // Trace par sous-étape : une séquence est une boîte noire vue de
  // l'extérieur (un seul port `out`/`err` pour 7 appels HTTP distincts).
  // Sans ça, le panneau Run ne peut ni dire QUELLE étape a échoué, ni ce
  // qui a été envoyé à chaque endpoint — consommée par run-panel.js.
  const trace = [];

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

    const base = {
      rang: i + 1,
      nom: seqStep.name || 'Étape ' + (i + 1),
      methode: (seqStep.method || 'POST').toUpperCase(),
      endpoint: BuilderContext.resolve(seqStep.endpoint || '', ctx),
      mode: seqStep.httpMode || 'simple',
    };

    if (seqStep.skipIfEmpty) {
      const _cond = BuilderContext.resolve(seqStep.skipIfEmpty, ctx);
      if (_cond === undefined || _cond === null || _cond === ''
          || /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(String(_cond).trim())) {
        trace.push(Object.assign({}, base, {
          statut: 'ignore',
          motif: 'ignorée — ' + seqStep.skipIfEmpty + ' est vide',
        }));
        continue;
      }
    }

    // Variable où CETTE sous-étape dépose son résultat, pour retrouver son
    // issue réelle (statut HTTP, corps envoyé) après l'appel.
    const rv = base.mode === 'foreach'
      ? (seqStep.feResultVar || 'foreach_result')
      : (seqStep.resultVar || 'http_response');
    const avant = ctx.results ? ctx.results[rv] : undefined;

    try {
      const result = await httpRequest(virtualStep, ctx, deps);
      const apres = ctx.results ? ctx.results[rv] : undefined;
      const entree = Object.assign({}, base, {
        statut: (result && result.port === 'error') ? 'echec' : 'ok',
        resultVar: rv,
      });
      if (base.mode === 'foreach') {
        const liste = Array.isArray(apres) ? apres : [];
        const avantN = Array.isArray(avant) ? avant.length : 0;
        const ajoutes = seqStep.feAppend ? liste.slice(avantN) : liste;
        entree.valeurs = ajoutes.map(v => ({
          valeur: v[seqStep.feLocalName || 'nom'] ?? v.slug,
          externalId: v.external_id, statut: v.status,
        }));
        const errs = ctx.results ? ctx.results[rv + '_errors'] : null;
        if (Array.isArray(errs) && errs.length) entree.echecs = errs.slice(-10);
        if (!ajoutes.length && !entree.echecs) entree.motif = 'aucune valeur à envoyer';
      } else if (apres && typeof apres === 'object') {
        entree.httpStatut = apres.status;
        entree.envoye = apres.envoye ?? null;
        entree.reponse = apres.body ?? null;
        if (apres.upserted) entree.upsert = true;
        if (apres.postOrigine) entree.postOrigine = apres.postOrigine;
        if (apres.ok === false) entree.statut = 'echec';
      }
      trace.push(entree);

      if (result && result.port === 'error' && seqStep.onError !== 'continue') {
        lastError = 'Étape ' + (i + 1) + ' (' + virtualStep.label + ') a échoué';
        break;
      }
    } catch (e) {
      trace.push(Object.assign({}, base, { statut: 'echec', motif: e.message }));
      if (seqStep.onError !== 'continue') {
        lastError = e.message;
        break;
      }
    }
  }

  BuilderContext.storeResult(ctx, '_seq_trace_' + step.id, trace);

  if (lastError) {
    BuilderContext.addError(ctx, step.id, lastError, 'warn');
    return { port: 'err' };
  }
  return { port: 'out' };
}

module.exports = httpSequence;
