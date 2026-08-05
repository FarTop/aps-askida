/**
 * wf-run-poll.js — Sondage partagé d'UN run "actuellement ouvert"
 *
 * Un seul minuteur, pas un par panneau. Sonde `GET /api/builder-runs/:runId`
 * (incrémental via `?since=seq` après le premier appel), calcule le statut
 * via WfRunStatus.calculer(), et rediffuse tout sur `root` via l'événement
 * `aps:run-tick` — même convention découplée que `aps:flow-ready`/
 * `aps:run-finished` déjà en place (aucune référence directe entre modules).
 *
 * Récupère aussi UNE FOIS par run le document pivot réellement exécuté
 * (brouillon ou version figée selon `run.flowVersion`) et le met en cache
 * par (flowId, flowVersion) — badges, arêtes surlignées, onglet Debug et
 * l'étiquette des nœuds dans Logs consomment tous ce même document plutôt
 * que de le refetcher chacun de leur côté.
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const CADENCE_MS = 1500;
  const ETATS_TERMINAUX = { success: 1, partial: 1, failed: 1 };

  let runIdSuivi = null;
  let timer = null;
  let evenementsAccumules = [];
  let docCache = {}; // clé `${flowId}:${flowVersion}` -> document

  function _clePourRun(run) {
    return run.flowId + ':' + (run.flowVersion == null ? '' : run.flowVersion);
  }

  function _recupererDocument(run) {
    const cle = _clePourRun(run);
    if (docCache[cle]) return Promise.resolve(docCache[cle]);
    const url = run.flowVersion == null
      ? '/api/builder-flows/' + encodeURIComponent(run.flowId)
      : '/api/builder-flows/' + encodeURIComponent(run.flowId) + '/versions/' + run.flowVersion;
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        const doc = res ? (res.document || null) : null;
        if (doc) docCache[cle] = doc;
        return doc;
      })
      .catch(function () { return null; });
  }

  function _emettreTick(runId, run, document_, nouveaux) {
    const stats = (window.WfRunStatus && document_)
      ? window.WfRunStatus.calculer(document_, evenementsAccumules, run.status)
      : { stepStatus: {}, stepEvent: {}, takenEdges: new Set() };
    root.dispatchEvent(new CustomEvent('aps:run-tick', {
      detail: {
        runId: runId, run: run, document: document_,
        newEvents: nouveaux, allEvents: evenementsAccumules,
        stepStatus: stats.stepStatus, stepEvent: stats.stepEvent, takenEdges: stats.takenEdges,
      }
    }));
  }

  function _tick() {
    if (!runIdSuivi) return;
    const runId = runIdSuivi;
    const dernierSeq = evenementsAccumules.length
      ? evenementsAccumules[evenementsAccumules.length - 1].seq : null;
    const url = '/api/builder-runs/' + encodeURIComponent(runId) + (dernierSeq != null ? '?since=' + dernierSeq : '');

    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (run) {
        if (!run || runIdSuivi !== runId) return; // run introuvable, ou on a changé de cible entre-temps
        const nouveaux = Array.isArray(run.events) ? run.events : [];
        evenementsAccumules = evenementsAccumules.concat(nouveaux);

        return _recupererDocument(run).then(function (doc) {
          if (runIdSuivi !== runId) return; // à nouveau, cible changée pendant le fetch du document
          _emettreTick(runId, run, doc, nouveaux);
          if (!ETATS_TERMINAUX[run.status]) {
            timer = setTimeout(_tick, CADENCE_MS);
          }
        });
      })
      .catch(function () {
        // Sondage non critique : silencieux, le prochain tick réessaiera.
        if (runIdSuivi === runId) timer = setTimeout(_tick, CADENCE_MS);
      });
  }

  // Démarre (ou bascule) le suivi de ce run. Effacement immédiat de l'état
  // affiché de l'ancien run AVANT le premier fetch (jamais un fondu — un
  // badge d'un AUTRE run serait trompeur, pire qu'un vide passager) : un
  // tick "vide" est émis en synchrone, la vraie donnée arrive juste après.
  function suivre(runId) {
    if (!runId || runId === runIdSuivi) return;
    if (timer) { clearTimeout(timer); timer = null; }
    runIdSuivi = runId;
    evenementsAccumules = [];
    root.dispatchEvent(new CustomEvent('aps:run-tick', {
      detail: { runId: runId, run: null, document: null, newEvents: [], allEvents: [], stepStatus: {}, stepEvent: {}, takenEdges: new Set() }
    }));
    _tick();
  }

  function arreter() {
    if (timer) { clearTimeout(timer); timer = null; }
    runIdSuivi = null;
    evenementsAccumules = [];
  }

  window.WfRunPoll = { suivre: suivre, arreter: arreter };

  // Changer de flow arrête le suivi en cours — le run d'un autre workflow
  // n'a plus de sens à animer ici.
  root.addEventListener('aps:flow-ready', function () { arreter(); });

})();
