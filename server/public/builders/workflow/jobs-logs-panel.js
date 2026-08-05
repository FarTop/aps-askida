/**
 * jobs-logs-panel.js — Dock gauche, vues Jobs + Logs
 *
 * Jobs liste les BuilderRun du workflow ouvert (GET /api/builder-runs,
 * lecture seule — server/routes/builder-runs.js) ; cliquer un run l'ouvre
 * dans Logs (timeline des BuilderRunEvent, GET /api/builder-runs/:runId).
 * Indépendant de workflow-canvas.js (même principe que config-sources.js et
 * run-panel.js) : lit flowId via `aps:flow-ready` sur root, se rafraîchit
 * aussi sur `aps:run-finished` (émis par run-panel.js après un déclenchement
 * manuel), sans dépendance inverse.
 *
 * UX bâtie sur la critique de l'ancien panneau Jobs/Debug de WFD
 * (feedback-run-jobs-panel-ux) : Jobs est le modèle qui marchait déjà — liste
 * simple, cliquable ; tout texte affiché reste sélectionnable/copiable
 * (aucune troncature qui perdrait de l'information, `ctxSnapshot` complet
 * disponible en clair via <details>/<pre>, pas juste un résumé).
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const jobsListe  = root.querySelector('[data-role="jobs-liste"]');
  const jobsEmpty  = root.querySelector('[data-role="jobs-empty"]');
  const jobsRefresh = root.querySelector('[data-role="jobs-refresh"]');
  const logsEmpty  = root.querySelector('[data-role="logs-empty"]');
  const logsListe  = root.querySelector('[data-role="logs-liste"]');
  if (!jobsListe || !logsListe) return;

  let flowId = root._flowId || null;
  let runSelectionne = null;
  let pollTimer = null;

  // ── Formatage ─────────────────────────────────────────────────────────────
  const ETAT_DOT = { running: 'warn', success: 'ok', partial: 'warn', failed: 'err' };
  const ETAT_LABEL = { running: 'Running…', success: 'Success', partial: 'Partial', failed: 'Failed' };

  function _formaterHeure(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }
  function _formaterDuree(ms) {
    if (ms == null) return '';
    if (ms < 1000) return ms + ' ms';
    return (ms / 1000).toFixed(1) + ' s';
  }

  // ── Jobs : liste des runs du workflow ────────────────────────────────────
  function _chargerJobs() {
    if (!flowId) {
      jobsListe.textContent = '';
      if (jobsEmpty) jobsEmpty.setAttribute('data-hidden', '1');
      return Promise.resolve([]);
    }
    return fetch('/api/builder-runs?flowId=' + encodeURIComponent(flowId))
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (runs) {
        _rendreJobs(Array.isArray(runs) ? runs : []);
        return runs;
      })
      .catch(function () { /* liste vide, non bloquant */ return []; });
  }

  function _rendreJobs(runs) {
    jobsListe.textContent = '';
    if (jobsEmpty) jobsEmpty.setAttribute('data-hidden', runs.length ? '1' : '0');

    runs.forEach(function (run) {
      const row = document.createElement('div');
      row.className = 'jb-row';
      row.setAttribute('data-selected', run.id === runSelectionne ? '1' : '0');
      row.setAttribute('data-run-id', run.id);

      const dot = document.createElement('span');
      dot.className = 'bd-dot jb-status';
      dot.setAttribute('data-state', ETAT_DOT[run.status] || '');

      const corps = document.createElement('div');
      corps.className = 'jb-body';

      const titre = document.createElement('div');
      titre.className = 'jb-titre';
      const etatTxt = document.createElement('span');
      etatTxt.textContent = ETAT_LABEL[run.status] || run.status;
      const trig = document.createElement('span');
      trig.className = 'jb-trigger';
      trig.textContent = run.triggerType === 'custom_action' ? (run.triggerRef || 'webhook') : 'manual';
      titre.appendChild(etatTxt);
      titre.appendChild(trig);

      const meta = document.createElement('div');
      meta.className = 'jb-meta';
      meta.textContent = _formaterHeure(run.startedAt)
        + (run.durationMs != null ? ' · ' + _formaterDuree(run.durationMs) : '')
        + (run.flowVersion != null ? ' · v' + run.flowVersion : ' · draft');

      corps.appendChild(titre);
      corps.appendChild(meta);

      if (run.errorMessage) {
        const err = document.createElement('div');
        err.className = 'jb-err';
        err.textContent = run.errorMessage;
        corps.appendChild(err);
      }

      row.appendChild(dot);
      row.appendChild(corps);
      row.addEventListener('click', function () { _selectionnerRun(run.id, true); });

      jobsListe.appendChild(row);
    });

    // Un run encore en cours (webhook async) justifie un nouveau sondage —
    // le déclenchement manuel, lui, revient déjà terminé (cf. run-panel.js).
    clearTimeout(pollTimer);
    if (runs.some(function (r) { return r.status === 'running'; })) {
      pollTimer = setTimeout(_chargerJobs, 4000);
    }
  }

  // ── Logs : timeline d'événements d'un run sélectionné ────────────────────
  function _selectionnerRun(runId, basculerVersLogs) {
    runSelectionne = runId;
    jobsListe.querySelectorAll('.jb-row').forEach(function (row) {
      row.setAttribute('data-selected', row.getAttribute('data-run-id') === runId ? '1' : '0');
    });

    if (basculerVersLogs) {
      const ongletLogs = root.querySelector('.bd-tab[data-panel="logs"][data-side="left"]');
      if (ongletLogs && !ongletLogs.classList.contains('bd-tab-active')) ongletLogs.click();
    }

    logsListe.textContent = '';
    if (logsEmpty) { logsEmpty.textContent = 'Loading…'; logsEmpty.hidden = false; }

    fetch('/api/builder-runs/' + encodeURIComponent(runId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (run) {
        if (!run) { if (logsEmpty) logsEmpty.textContent = 'Run not found.'; return; }
        _rendreLogs(run);
      })
      .catch(function (e) {
        if (logsEmpty) { logsEmpty.hidden = false; logsEmpty.textContent = 'Error loading run: ' + e.message; }
      });
  }

  function _rendreLogs(run) {
    logsListe.textContent = '';
    if (logsEmpty) logsEmpty.hidden = true;

    const hd = document.createElement('div');
    hd.className = 'lg-run-hd';
    const hdTitre = document.createElement('div');
    hdTitre.className = 'jb-titre';
    const hdEtat = document.createElement('span');
    hdEtat.textContent = ETAT_LABEL[run.status] || run.status;
    hdTitre.appendChild(hdEtat);
    const hdMeta = document.createElement('div');
    hdMeta.className = 'jb-meta';
    hdMeta.textContent = _formaterHeure(run.startedAt)
      + (run.durationMs != null ? ' · ' + _formaterDuree(run.durationMs) : '')
      + ' · run ' + run.id;
    hd.appendChild(hdTitre);
    hd.appendChild(hdMeta);
    logsListe.appendChild(hd);

    const events = Array.isArray(run.events) ? run.events : [];
    if (!events.length) {
      const vide = document.createElement('p');
      vide.className = 'bd-empty';
      vide.textContent = 'No events recorded for this run.';
      logsListe.appendChild(vide);
      return;
    }

    events.forEach(function (ev) {
      logsListe.appendChild(_ligneEvenement(ev));
    });
  }

  const ETAT_EVENEMENT = {
    'start': 'ok', 'end': 'ok', 'step:start': '', 'step:done': 'ok',
    'step:error': 'err', 'step:skip': 'warn'
  };

  function _ligneEvenement(ev) {
    const ligne = document.createElement('div');
    ligne.className = 'lg-event';

    const dot = document.createElement('span');
    dot.className = 'bd-dot lg-dot';
    dot.setAttribute('data-state', ETAT_EVENEMENT[ev.severity === 'fatal' ? 'step:error' : ev.type] || '');

    const corps = document.createElement('div');
    corps.className = 'lg-body';

    const ligneHd = document.createElement('div');
    ligneHd.className = 'lg-ligne';
    const type = document.createElement('span');
    type.className = 'lg-type';
    type.textContent = ev.type;
    ligneHd.appendChild(type);
    if (ev.stepId) {
      const step = document.createElement('span');
      step.className = 'lg-step';
      step.textContent = (ev.stepCore || '') + (ev.stepFacade ? ' · ' + ev.stepFacade : '') + ' (' + ev.stepId + ')' + (ev.port ? ' → ' + ev.port : '');
      ligneHd.appendChild(step);
    }
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

  // ── Câblage : flowId, refresh manuel, run frais depuis Run ──────────────
  root.addEventListener('aps:flow-ready', function (e) {
    const change = e.detail.flowId !== flowId;
    flowId = e.detail.flowId;
    runSelectionne = null;
    if (change) _chargerJobs();
  });

  root.addEventListener('aps:run-finished', function (e) {
    if (e.detail.flowId !== flowId) return;
    _chargerJobs().then(function () {
      if (e.detail.runId) _selectionnerRun(e.detail.runId, true);
    });
  });

  if (jobsRefresh) {
    jobsRefresh.addEventListener('click', function () {
      jobsRefresh.classList.add('bd-spinning');
      _chargerJobs().then(function () { jobsRefresh.classList.remove('bd-spinning'); });
    });
  }

  if (flowId) _chargerJobs();
})();
