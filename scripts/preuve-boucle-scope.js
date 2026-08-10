// APS — scripts/preuve-boucle-scope.js — créé le 2026-08-10
// ================================================================
// Preuve du scope par itération de `runLoop` (builder-executor.js).
//
//   node scripts/preuve-boucle-scope.js
//
// Le bug corrigé : `pushLoopScope` n'était appelé qu'UNE fois pour toute la
// boucle. L'aplatissement n'écrivant que les champs que l'item possède, un item
// auquel il manquait un champ héritait de la valeur du tour précédent.
// Constaté en réel sur STATUSES le 2026-08-10 — une collection sans BayardID a
// pris celui de sa voisine et APS a interrogé VOD Factory sur le mauvais
// contenu, sans lever d'erreur.
//
// Entièrement hors ligne : aucun accès base, aucun appel réseau. Le corps de
// boucle est un faux handler qui se contente d'enregistrer ce qu'il lit.
// ================================================================
'use strict';

const { runLoop }      = require('../server/engine-builder/builder-executor.js');
const BuilderContext   = require('../server/engine-builder/builder-context.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
}

// Corps de boucle minimal : une étape qui note ce que le contexte contient.
function fauxOpts(observer) {
  return {
    emit: async () => {},
    // Même interface que builder-handler-registry.js : get(step) / isDeclaredInactive(core).
    registry: {
      get: () => async (step, ctx) => { observer(ctx); return { port: 'out' }; },
      isDeclaredInactive: () => false,
    },
    deps: () => ({}),
    onError: () => 'error',
    runLoop: (s, c, o) => runLoop(s, c, o),
  };
}

const CORPS = {
  steps: [{ id: 'sonde', core: 'sonde', label: 'Sonde', params: {} }],
  edges: [],
};

function executer(items, params) {
  const ctx = BuilderContext.createContext({});
  const vu = [];
  const step = {
    id: 'boucle', core: 'loop', label: 'Boucle',
    params: Object.assign({ loopVar: 'item', loopSource: 'variable', loopVariablePath: '{source.objects}' }, params || {}),
    body: CORPS,
  };
  // Même forme qu'un aps_search réel : storeResult range { objects, total } et
  // la boucle lit `{source.objects}`. Reproduire ça plutôt qu'un tableau nu,
  // sinon on éprouverait un chemin que la production n'emprunte jamais.
  BuilderContext.storeResult(ctx, 'source', { objects: items, total: items.length });
  return runLoop(step, ctx, fauxOpts(c => vu.push({ ...c.vars }))).then(port => ({ port, vu, ctx }));
}

(async () => {
  console.log('\n── Le cas réel : un item sans le champ que le précédent avait ──');
  // Reproduit exactement STATUSES : la 2e collection n'a pas de BayardID.
  const { vu } = await executer([
    { id: 'cdc0d434', metadata: { BayardID: ['40209885'] } },
    { id: 'ce3456e8', metadata: {} },
    { id: 'c2b8eee8', metadata: { BayardID: ['26080717504935'] } },
  ], { onError: 'continue_log' });

  verifier('tour 1 — lit son propre BayardID',
    vu[0]['item.metadata.BayardID.0'], '40209885');
  verifier('tour 2 — n\'hérite PAS du BayardID du tour 1',
    vu[1]['item.metadata.BayardID.0'], undefined);
  verifier('tour 2 — voit bien son propre id',
    vu[1]['item.id'], 'ce3456e8');
  verifier('tour 3 — lit son propre BayardID',
    vu[2]['item.metadata.BayardID.0'], '26080717504935');

  console.log('\n── Ce qui ne doit PAS changer ──');
  // Un accumulateur écrit par le corps (setVar ordinaire) doit survivre d'un
  // tour à l'autre : c'est la limite exacte du nettoyage.
  const ctx = BuilderContext.createContext({});
  BuilderContext.storeResult(ctx, 'source', { objects: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  let n = 0;
  const opts = {
    emit: async () => {}, deps: () => ({}), onError: () => 'error',
    runLoop: (s, c, o) => runLoop(s, c, o),
    registry: {
      isDeclaredInactive: () => false,
      get: () => async (step, c) => {
        n += 1;
        BuilderContext.setVar(c, 'compteur', String(n));       // accumulateur
        BuilderContext.setVar(c, 'dernier_vu', c.vars['item.id']);
        return { port: 'out' };
      },
    },
  };
  const port = await runLoop({ id: 'b2', core: 'loop', label: 'B', body: CORPS,
    params: { loopVar: 'item', loopSource: 'variable', loopVariablePath: '{source.objects}' } }, ctx, opts);

  verifier('port de sortie de la boucle', port, 'out');
  verifier('accumulateur (setVar ordinaire) survit aux tours', ctx.vars.compteur, '3');
  verifier('dernière valeur écrite par le corps conservée après la boucle', ctx.vars.dernier_vu, 'c');
  verifier('variables d\'item nettoyées à la sortie', ctx.vars['item.id'], undefined);
  verifier('loopVar nettoyé à la sortie', ctx.vars.item, undefined);

  console.log('\n── Boucle imbriquée réutilisant le même nom d\'item ──');
  const ctx2 = BuilderContext.createContext({});
  BuilderContext.storeResult(ctx2, 'source', { objects: [{ id: 'ext1' }, { id: 'ext2' }] });
  BuilderContext.storeResult(ctx2, 'interne', { objects: [{ id: 'in1' }] });
  const vus = [];
  const optsImb = {
    emit: async () => {}, deps: () => ({}), onError: () => 'error',
    runLoop: (s, c, o) => runLoop(s, c, o),
    registry: {
      isDeclaredInactive: () => false,
      // La boucle interne est un vrai `loop` : le registre ne doit répondre que
      // pour la sonde, sinon il court-circuiterait l'imbrication.
      get: (s) => (s.core === 'loop' ? null : async (step, c) => { vus.push(c.vars['item.id']); return { port: 'out' }; }),
    },
  };
  const stepImb = {
    id: 'ext', core: 'loop', label: 'Ext',
    params: { loopVar: 'item', loopSource: 'variable', loopVariablePath: '{source.objects}' },
    body: {
      steps: [
        { id: 'sonde', core: 'sonde', label: 'Avant', params: {} },
        { id: 'int', core: 'loop', label: 'Int',
          params: { loopVar: 'item', loopSource: 'variable', loopVariablePath: '{interne.objects}' },
          body: { steps: [{ id: 'sonde', core: 'sonde', label: 'Dedans', params: {} }], edges: [] } },
      ],
      edges: [{ from: { step: 'sonde', port: 'out' }, to: { step: 'int' } }],
    },
  };
  await runLoop(stepImb, ctx2, optsImb);
  verifier('la boucle interne ne détruit pas l\'item de l\'externe',
    vus, ['ext1', 'in1', 'ext2', 'in1']);

  console.log(`\n${echecs === 0 ? '✅ Toutes les vérifications passent' : `❌ ${echecs} vérification(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch(e => { console.error('\n💥', e.message, '\n', e.stack); process.exit(1); });
