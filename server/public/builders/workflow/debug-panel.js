/**
 * debug-panel.js — Dock droit, vue Debug
 *
 * Détails d'UN nœud pour le run actuellement suivi (wf-run-poll.js) — cliquer
 * un nœud sur le canevas pendant/après un run affiche son historique complet
 * d'événements (toutes les itérations si le nœud est dans une boucle),
 * détails que le badge seul ne peut pas montrer (cf. wf-run-status.js : le
 * badge ne reflète que la DERNIÈRE itération). Indépendant de
 * workflow-canvas.js — même principe que run-panel.js/jobs-logs-panel.js :
 * lit `aps:run-tick` (wf-run-poll.js) et `aps:node-clicked` (workflow-
 * canvas.js) sur root, aucune dépendance inverse.
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const empty   = root.querySelector('[data-role="debug-empty"]');
  const content = root.querySelector('[data-role="debug-content"]');
  if (!content) return;

  let documentActuel = null;
  let eventsActuel = [];
  let runActuel = null;
  let stepIdSelectionne = null;

  const ETAT_DOT = { running: '', success: 'ok', error: 'err', blocked: 'warn', idle: '' };

  function _formaterHeure(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  // Index plat stepId -> step, en descendant dans les corps de boucle — même
  // forme que _indexSteps (wf-run-status.js), dupliqué ici volontairement
  // (assez petit pour ne pas justifier un partage entre modules).
  function _trouverStep(document_, stepId) {
    let trouve = null;
    function chercher(steps) {
      (steps || []).forEach(function (s) {
        if (s.id === stepId) trouve = s;
        if (s.core === 'loop' && s.body) chercher(s.body.steps);
      });
    }
    if (document_) chercher(document_.steps);
    return trouve;
  }

  function _ligneEvenement(ev) {
    const ligne = document.createElement('div');
    ligne.className = 'lg-event';

    const dot = document.createElement('span');
    dot.className = 'bd-dot lg-dot';
    dot.setAttribute('data-state', ETAT_DOT[ev.type === 'step:error' ? (ev.severity === 'fatal' ? 'blocked' : 'error') : (ev.type === 'step:done' ? (ev.port === null ? 'error' : 'success') : 'running')] || '');

    const corps = document.createElement('div');
    corps.className = 'lg-body';

    const ligneHd = document.createElement('div');
    ligneHd.className = 'lg-ligne';
    const type = document.createElement('span');
    type.className = 'lg-type';
    type.textContent = ev.type + (ev.port !== undefined && ev.port !== null ? ' → ' + ev.port : '');
    ligneHd.appendChild(type);
    const at = document.createElement('span');
    at.className = 'lg-at';
    at.textContent = _formaterHeure(ev.at);
    ligneHd.appendChild(at);
    corps.appendChild(ligneHd);

    if (ev.message) {
      const msg = document.createElement('div');
      msg.className = 'lg-msg';
      if (ev.severity) msg.setAttribute('data-severity', ev.severity);
      msg.textContent = ev.message;
      corps.appendChild(msg);
    }

    if (ev.ctxSnapshot) {
      const det = document.createElement('details');
      det.className = 'lg-snapshot';
      const sum = document.createElement('summary');
      sum.textContent = 'Context snapshot';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(ev.ctxSnapshot, null, 2);
      det.appendChild(sum);
      det.appendChild(pre);
      corps.appendChild(det);
    }

    ligne.appendChild(dot);
    ligne.appendChild(corps);
    return ligne;
  }

  function _rendre() {
    content.textContent = '';

    if (!runActuel || !stepIdSelectionne) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = runActuel
          ? 'Click a node to inspect it.'
          : 'Open a run (Jobs) and click a node to inspect it.';
      }
      content.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    content.hidden = false;

    const step = _trouverStep(documentActuel, stepIdSelectionne);
    const hd = document.createElement('div');
    hd.className = 'lg-run-hd';
    const hdTitre = document.createElement('div');
    hdTitre.className = 'jb-titre';
    hdTitre.textContent = step ? step.label : stepIdSelectionne;
    const hdMeta = document.createElement('div');
    hdMeta.className = 'jb-meta';
    hdMeta.textContent = (step ? (step.core + (step.facade ? ' · ' + step.facade : '') + ' · ') : '') + stepIdSelectionne;
    hd.appendChild(hdTitre);
    hd.appendChild(hdMeta);
    content.appendChild(hd);

    const evs = (window.WfRunStatus ? window.WfRunStatus.evenementsDuStep(eventsActuel, stepIdSelectionne) : []);
    if (!evs.length) {
      const vide = document.createElement('p');
      vide.className = 'bd-empty';
      vide.textContent = 'This node has no recorded event for this run.';
      content.appendChild(vide);
      return;
    }
    evs.forEach(function (ev) { content.appendChild(_ligneEvenement(ev)); });
  }

  root.addEventListener('aps:run-tick', function (e) {
    const d = e.detail;
    runActuel = d.run;
    documentActuel = d.document;
    eventsActuel = d.allEvents || [];
    _rendre();
  });

  root.addEventListener('aps:node-clicked', function (e) {
    stepIdSelectionne = e.detail.stepId;
    _rendre();
  });

  root.addEventListener('aps:flow-ready', function () {
    runActuel = null; documentActuel = null; eventsActuel = []; stepIdSelectionne = null;
    _rendre();
  });

  _rendre();

})();
