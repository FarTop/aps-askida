/**
 * wf-run-status.js — Dérivation pure du statut d'un run pour l'animation
 * live des jobs sur le canevas.
 *
 * Calcul PUR : ne touche ni au DOM ni au modèle. Reçoit le document pivot
 * réellement exécuté par le run (steps+edges, y compris les corps de
 * boucle) et la liste ordonnée des BuilderRunEvent, renvoie un statut par
 * step et l'ensemble des arêtes réellement empruntées.
 *
 * Correction du bug WFD que ce module existe pour éviter : WFD figeait le
 * badge sur un nœud en erreur (`stay=true` en dur, jamais dérivé du port
 * pris ni de la présence d'une arête connectée en aval). Ici, `port` est
 * déjà enregistré sur chaque BuilderRunEvent — "est-ce que ça a continué
 * ailleurs ?" se déduit entièrement des événements réels, jamais deviné.
 */

const WfRunStatus = (() => {

  // Index plat stepId -> step, en descendant dans les corps de boucle.
  function _indexSteps(steps, out) {
    (steps || []).forEach(function (s) {
      out[s.id] = s;
      if (s.core === 'loop' && s.body) _indexSteps(s.body.steps, out);
    });
  }

  // stepId -> tableau d'arêtes de SA portée (racine ou body de la boucle qui
  // le contient) — nécessaire car un step de corps de boucle ne peut router
  // que vers les arêtes de ce même corps, jamais celles de la racine.
  function _indexScopeEdges(steps, edges, out) {
    (steps || []).forEach(function (s) {
      out[s.id] = edges;
      if (s.core === 'loop' && s.body) _indexScopeEdges(s.body.steps, s.body.edges || [], out);
    });
  }

  // Mirroring exact de _nextEdges() (builder-executor.js) : repli sur
  // params.otherwise pour une décision dont le port renvoyé n'a pas d'arête
  // propre. Sans ce mirroring, une branche empruntée via ce repli ne serait
  // jamais surlignée.
  function _aretesSuivies(step, port, edgesDuScope) {
    let next = edgesDuScope.filter(function (e) { return e.from.step === step.id && e.from.port === port; });
    if (!next.length && step.core === 'decision' && step.params && step.params.otherwise) {
      next = edgesDuScope.filter(function (e) { return e.from.step === step.id && e.from.port === step.params.otherwise; });
    }
    return next;
  }

  /**
   * document : {steps, edges} réellement exécuté par ce run.
   * events   : run.events, déjà triés par seq croissant.
   * runStatus: run.status ('running'|'success'|'partial'|'failed').
   * → { stepStatus: {stepId: 'idle'|'running'|'success'|'error'|'blocked'},
   *     stepEvent:  {stepId: dernier événement pertinent, pour l'onglet Debug},
   *     takenEdges: Set<'fromStepporttoStep'> }
   *
   * Note signature de contenu, pas d'id : wf-scope.js._ecrireCorps retire
   * l'id (valeur de session) de chaque arête en réécrivant le document —
   * un document récupéré via l'API n'a donc aucun id d'arête stable à
   * matcher. Le rendu (wf-run-overlay.js) fait le lookup inverse sur les
   * arêtes VIVANTES du canevas par ce même triplet de contenu.
   */
  function calculer(document, events, runStatus) {
    const stepsById = {};
    _indexSteps((document && document.steps) || [], stepsById);
    const scopeEdgesById = {};
    _indexScopeEdges((document && document.steps) || [], (document && document.edges) || [], scopeEdgesById);

    const parStep = {};
    (events || []).forEach(function (ev) {
      if (!ev.stepId) return; // 'start'/'end' n'ont pas de stepId
      (parStep[ev.stepId] = parStep[ev.stepId] || []).push(ev);
    });

    const stepStatus = {};
    const stepEvent = {};
    const takenEdges = new Set();

    Object.keys(parStep).forEach(function (stepId) {
      // Reconstitue les paires {start, error?, done?} en préservant l'ordre
      // seq. Boucle : le même stepId réapparaît à chaque itération —
      // prendre la DERNIÈRE paire est correct (itérations strictement
      // séquentielles et awaited) mais veut dire que le badge ne reflète
      // que le résultat de la dernière itération. Compromis assumé : un
      // échec intermédiaire sous onError:'continue' reste invisible sur le
      // badge, récupérable via l'onglet Debug en ouvrant CET événement.
      const pairs = [];
      let current = null;
      parStep[stepId].forEach(function (ev) {
        if (ev.type === 'step:start') { current = { start: ev, error: null, done: null }; }
        else if (ev.type === 'step:error') { if (current) current.error = ev; }
        else if (ev.type === 'step:done') { if (current) { current.done = ev; pairs.push(current); current = null; } }
      });
      // Un groupe resté ouvert en fin de parcours (ni error ni done) est en
      // cours ; un groupe avec `error` mais sans `done` est une erreur
      // fatale (structurel : builder-executor.js n'émet JAMAIS step:done
      // après un 'stop' — seuls 'continue_log'/'continue' le font).
      const group = current || pairs[pairs.length - 1];
      if (!group) return;

      let statut;
      if (group.done) {
        // Trois cas amènent ici à 'error', pas seulement port===null :
        // - port===null : runLoop() le renvoie quand un item échoue sous
        //   onError:'stop' — pas une exception, ça retombe sur un step:done
        //   normal, qui rendrait 'success' à tort avec la règle naïve seule.
        // - group.error présent : le step A ERRORÉ (severity 'warn') puis
        //   continué (step:done avec port:'error') — c'est exactement le
        //   cas que WFD ratait (badge qui ignorait que CE nœud avait eu une
        //   erreur, simplement parce que l'exécution avait continué).
        statut = (group.done.port === null || group.error) ? 'error' : 'success';
      } else if (group.error) {
        // Toujours vrai en pratique (runStatus==='failed') vu la garantie
        // structurelle ci-dessus ; filet défensif si jamais elle change.
        statut = (runStatus === 'failed') ? 'blocked' : 'error';
      } else {
        statut = 'running';
      }
      stepStatus[stepId] = statut;
      stepEvent[stepId] = group.done || group.error || group.start;

      if (group.done && group.done.port !== null) {
        const step = stepsById[stepId];
        const edgesDuScope = scopeEdgesById[stepId] || [];
        if (step) {
          _aretesSuivies(step, group.done.port, edgesDuScope).forEach(function (e) {
            takenEdges.add(e.from.step + '' + e.from.port + '' + e.to.step);
          });
        }
      }
    });

    return { stepStatus: stepStatus, stepEvent: stepEvent, takenEdges: takenEdges };
  }

  // Historique complet d'un step (toutes itérations si dans une boucle) —
  // pour l'onglet Debug, contrairement à `calculer()` qui ne garde que le
  // dernier statut connu.
  function evenementsDuStep(events, stepId) {
    return (events || []).filter(function (e) { return e.stepId === stepId; });
  }

  return { calculer, evenementsDuStep };

})();

if (typeof window !== 'undefined') window.WfRunStatus = WfRunStatus;
if (typeof module !== 'undefined') module.exports = WfRunStatus;
