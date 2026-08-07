// APS — server/engine-builder/builder-executor.js — créé le 2026-08-05
// ================================================================
// builder-executor.js — Parcours du graphe pivot {steps, edges} (+ body des
// boucles). Port du modèle de server/engine/wfd-engine-executor.js (parcours
// récursif, un chemin actif à la fois, tout en `await` séquentiel) adapté aux
// différences structurelles du pivot :
//   - les ports sont des CHAÎNES (le libellé de la condition), pas des index
//     numériques — pas de traduction à faire, contrairement à WFD ;
//   - le fan-out `otherwise` d'une décision (pivot-to-wfd.js:255-272) n'a pas
//     besoin d'être synthétisé à l'avance : résolu dynamiquement ici, à la
//     recherche de l'arête suivante (voir _nextEdges) ;
//   - les corps de boucle sont imbriqués nativement (step.body), pas
//     aplatis — voir runLoop (câblé à la tâche "Boucle + pile de scope").
// ================================================================

'use strict';

const BuilderContext = require('./builder-context.js');

// ── Index et recherche d'entrée de portée ────────────────────────
function indexById(steps) {
  const map = Object.create(null);
  for (const s of steps) map[s.id] = s;
  return map;
}

// Entrées d'une portée : steps sans arête entrante EN PROVENANCE d'un step de
// cette même portée (utilisé pour le corps d'une boucle — la racine du
// document, elle, démarre explicitement sur l'unique step trigger, trouvé et
// vérifié par builder-engine.js AVANT d'appeler runFromStep).
// Cores qui ne s'exécutent pas : ce sont des annotations posées sur le
// canevas, pas des étapes. Source de vérité : PivotCatalogIconik.CORES
// (drapeau `annotation`) — recopié ici en une constante parce que le moteur
// ne dépend d'aucun fichier de `server/public/`, et qu'un `require` à travers
// l'arbre pour un seul nom serait plus fragile que cette liste.
const CORES_ANNOTATION = new Set(['postit']);

// Points d'entrée d'une portée : les étapes sans arête entrante. Un Post-it
// n'en a jamais — il serait donc pris pour un point d'entrée et exécuté, ce
// qui lèverait « Aucun handler enregistré ». On l'écarte ici, à la source.
function _entriesOf(steps, edges) {
  const targets = new Set((edges || []).map(e => e.to.step));
  return steps.filter(s => !targets.has(s.id) && !CORES_ANNOTATION.has(s.core));
}

// Arêtes sortantes d'un step pour un port donné, avec repli sur
// `params.otherwise` pour une décision dont le port 'default' n'a pas
// d'arête propre (voir l'en-tête du fichier).
function _nextEdges(step, port, edges) {
  let next = edges.filter(e => e.from.step === step.id && e.from.port === port);
  if (!next.length && step.core === 'decision' && step.params && step.params.otherwise) {
    next = edges.filter(e => e.from.step === step.id && e.from.port === step.params.otherwise);
  }
  return next;
}

// ── Exécuter un step et suivre ses arêtes ────────────────────────
// opts = { emit, registry, deps, onError, runLoop }
//   emit(type, step, ctx, extra?)      — événement de run (persisté par l'appelant)
//   registry                           — builder-handler-registry.js
//   deps(step)                         — { iconikClient, resolved } pour ce step
//   onError(ctx, step, err) → 'stop' | <nomDePort>
//   runLoop(step, byId, edges, ctx, opts) → nomDePort (câblé par la tâche boucle)
async function runStep(step, byId, edges, ctx, opts) {
  // Annotation atteinte malgré tout (arête posée à la main vers un Post-it,
  // document importé) : on ne l'exécute pas et on n'émet aucun événement —
  // elle ne doit apparaître ni dans les logs, ni dans l'animation des badges.
  if (CORES_ANNOTATION.has(step.core)) return;

  await opts.emit('step:start', step, ctx);

  let port;
  try {
    if (step.core === 'trigger') {
      // Le contexte est déjà initialisé (seedé depuis le triggerPayload) avant
      // le début du parcours, par builder-engine.js — rien à exécuter ici,
      // contrairement à un core normal. Même court-circuit que WFD
      // (wfd-engine-executor.js:284-288 : le trigger ne passe jamais par
      // nodeHandlers).
      port = 'out';
    } else if (step.core === 'loop') {
      if (typeof opts.runLoop !== 'function') {
        throw new Error("core 'loop' pas encore implémenté dans le moteur Builder");
      }
      port = await opts.runLoop(step, ctx, opts);
    } else {
      const handler = opts.registry.get(step);
      if (!handler) {
        if (opts.registry.isDeclaredInactive(step.core)) {
          throw new Error(`Core '${step.core}' hors périmètre v1 (déclaré mais non implémenté dans le moteur Builder).`);
        }
        throw new Error(`Aucun handler enregistré pour '${step.facade || step.core}'.`);
      }
      const result = await handler(step, ctx, opts.deps(step));
      port = result && result.port;
    }
  } catch (err) {
    const outcome = opts.onError(ctx, step, err);
    await opts.emit('step:error', step, ctx, { message: err.message, severity: outcome === 'stop' ? 'fatal' : 'warn' });
    if (outcome === 'stop') return;
    port = outcome;
  }

  await opts.emit('step:done', step, ctx, { port });

  const next = _nextEdges(step, port, edges);
  for (const e of next) {
    const target = byId[e.to.step];
    if (!target) continue;
    await runStep(target, byId, edges, ctx, opts);
  }
}

// Démarre l'exécution depuis un step précis (utilisé par builder-engine.js
// pour la racine du document, dont l'entrée est TOUJOURS l'unique step
// trigger — jamais déduite par "pas d'arête entrante", ce qui exécuterait à
// tort un step orphelin/mal câblé).
async function runFromStep(entryStep, steps, edges, ctx, opts) {
  const byId = indexById(steps);
  await runStep(entryStep, byId, edges, ctx, opts);
}

// Exécute une portée entière depuis ses entrées déduites (corps de boucle).
async function runScope(steps, edges, ctx, opts) {
  const byId = indexById(steps);
  const entries = _entriesOf(steps, edges);
  for (const step of entries) {
    await runStep(step, byId, edges, ctx, opts);
  }
}

// ── Boucle ────────────────────────────────────────────────────────
// Port de executeLoopNode(), wfd-engine-executor.js:360-475 — même mécanique
// (résolution des items, aplatissement des champs, politique d'erreur par
// item), adaptée au corps imbriqué nativement (step.body) et à la pile de
// scope de builder-context.js qui corrige le bug documenté : dans WFD, une
// boucle imbriquée réutilisant le même `loopVar` qu'une boucle englobante
// écrase silencieusement sa valeur, sans jamais la restaurer à la sortie.
//
// Retourne le PORT à suivre après la boucle : 'out' (succès, comme le Core
// `loop` du catalogue pivot ne déclare qu'un seul port), ou `null` si la
// politique d'erreur de la boucle est 'stop' et qu'un item a échoué — auquel
// cas la branche s'arrête net (aucune arête ne porte jamais le port `null`),
// exactement l'effet de WFD qui ne suit alors aucun port.
//
// Pas de port dédié à l'erreur d'item (contrairement à WFD, qui a un mode
// 'port' non câblé côté panneau) : le catalogue pivot n'offre que
// stop|continue_log|continue pour `loop.params.onError` (config-schema.js).
async function runLoop(step, ctx, opts) {
  const p       = step.params || {};
  const loopVar = p.loopVar || 'item';
  const mode    = p.loopSource || 'variable';
  const body    = step.body || { steps: [], edges: [] };

  let items;
  if (mode === 'variable') {
    let sourcePath = (p.loopVariablePath || '').trim();
    const braceMatch = sourcePath.match(/^\{(.+)\}$/);
    if (braceMatch) sourcePath = braceMatch[1];

    items = BuilderContext.resolvePath(sourcePath, ctx);
    if (!Array.isArray(items)) items = ctx.vars?.[sourcePath];
    if (!Array.isArray(items)) items = [];
  } else {
    // Modes 'files'/'assets'/'collection'/'list'/'metadata' : jamais câblés
    // côté exécution, ni dans WFD ni ici — échec explicite plutôt qu'un
    // 0-élément silencieux (même principe que le Core `loop` du catalogue).
    throw new Error(`Boucle : le mode "${mode}" n'est pas encore implémenté côté exécution — utilisez "Variable existante" avec une Recherche APS en amont.`);
  }

  const loopOnError = p.onError || 'stop';
  const itemErrors  = [];
  const MAX_PROFONDEUR = 6;

  BuilderContext.pushLoopScope(ctx);
  try {
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      BuilderContext.scopedSetVar(ctx, loopVar, typeof raw === 'string' ? raw : JSON.stringify(raw));
      BuilderContext.scopedSetVar(ctx, loopVar + '_index', String(i));

      const aplatir = (valeur, prefixe, profondeur) => {
        if (profondeur > MAX_PROFONDEUR) return;
        if (Array.isArray(valeur)) {
          valeur.forEach((v, idx) => aplatir(v, prefixe + '.' + idx, profondeur + 1));
          return;
        }
        if (valeur && typeof valeur === 'object') {
          Object.entries(valeur).forEach(([k, v]) => aplatir(v, prefixe + '.' + k, profondeur + 1));
          return;
        }
        if (valeur !== null && valeur !== undefined) {
          BuilderContext.scopedSetVar(ctx, prefixe, String(valeur));
        }
      };
      if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([k, v]) => aplatir(v, loopVar + '.' + k, 1));
      }

      await runScope(body.steps || [], body.edges || [], ctx, opts);

      if (ctx.status === 'failed') {
        const lastErr = ctx.errors[ctx.errors.length - 1]?.message || 'Erreur inconnue';
        itemErrors.push({ index: i, item: raw, message: lastErr });

        if (loopOnError === 'stop') {
          return null; // branche morte — aucune arête ne porte le port `null`
        }
        // 'continue_log' / 'continue' : l'échec de CET item ne stoppe pas les
        // suivants — on relève le statut pour poursuivre l'itération.
        ctx.status = 'running';
      }
    }
  } finally {
    BuilderContext.popLoopScope(ctx);
  }

  BuilderContext.setVar(ctx, loopVar + '_errors', JSON.stringify(itemErrors));
  BuilderContext.setVar(ctx, loopVar + '_error_count', String(itemErrors.length));

  return 'out';
}

module.exports = { runFromStep, runScope, runStep, runLoop, indexById };
