// APS — server/engine-builder/builder-handler-lookup.js — créé le 2026-08-05
// Port de lookup(), server/engine/wfd-engine-handlers.js:927-1160 (+
// _setNestedValue:933-992, _isUnresolvedPlaceholder). `rows` vient de la
// résolution de `params.mappingId` (Mapping.rules), portée depuis
// pivot-to-wfd.js:88-91 (mappingId -> lkRows) plutôt que d'une conversion
// préalable. Ports du pivot : found | not_found.
'use strict';

const BuilderContext = require('./builder-context.js');
const Noyau          = require('./builder-lookup-noyau.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

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
    // LE NOYAU VIT AILLEURS depuis le 2026-08-14 : builder-lookup-noyau.js, pur,
    // partagé avec la Lambda `aps-lookup` que réclame AWS Step Functions. Ce
    // qui reste ici est ce qui ne peut PAS être partagé — la provenance : APS a
    // un espace de noms global et une pile de résultats, une Lambda reçoit un
    // objet plat. On les lui INJECTE.
    //
    // Même geste que builder-essences.js le 2026-08-12, et pour la même raison :
    // deux implémentations divergentes produiraient deux charges utiles à partir
    // de la même correspondance, et le partenaire en refuserait une sans qu'on
    // sache laquelle a raison.
    const vu = Noyau.appliquer({
      rows      : rows,
      entree    : inputRaw,
      variables : ctx.vars || {},
      // La pile d'ancêtres est posée par iconik.resolve_ancestors, en amont sur
      // le chemin nominal de PUBLISH. Absente — nœud non exécuté, workflow sans
      // arborescence — toute politique retombe sur `propre` et le Lookup se
      // comporte exactement comme avant.
      ancetres  : (ctx.results && ctx.results._ancetres) || [],
      niveau    : (ctx.vars && ctx.vars.TypeCollection) || '',
      horsNiveau: (ctx.results && ctx.results._hors_niveau) || [],
      resoudre  : function (gabarit) { return r(gabarit, ctx); },
    });
    const mapped  = vu.mapped;
    const trace   = vu.trace;
    const matched = vu.matched;

    // Trace de ce que CE nœud a réellement fait, ligne par ligne — consommée
    // par l'onglet Action (run-panel.js). Clé préfixée `_` : exclue des
    // variables publiques, et repérable par id de step (plusieurs Lookup
    // possibles dans un même run).
    BuilderContext.storeResult(ctx, '_lk_trace_' + step.id, trace);

    // Le RÉCAPITULATIF DES EMPRUNTS, à part de la trace ligne à ligne : c'est
    // lui que le compte rendu de livraison (iconik.history) consomme pour dire
    // « ce champ ne vient pas de ce niveau ». Sans lui, `signalee` ne vaudrait
    // pas mieux que `cascade` — la politique existerait dans la correspondance
    // sans jamais rien signaler à personne.
    BuilderContext.storeResult(ctx, '_emprunts', Noyau.empruntsDe(trace));
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
