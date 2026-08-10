/**
 * jobs-logs-panel.js — Dock gauche, vues Jobs + Logs
 *
 * Jobs liste les BuilderRun du workflow ouvert (GET /api/builder-runs,
 * lecture seule — server/routes/builder-runs.js), avec un déclencheur de
 * test repliable en haut de la liste (POST /api/builder-engine/trigger/
 * :flowId) — Jobs est le seul endroit qui déclenche un run ; le panneau
 * Run (run-panel.js) n'en est que l'INSPECTEUR, jamais un formulaire de
 * test (retour utilisateur du 2026-08-05 : "un panneau Debug qui n'a rien
 * à faire à droite selon la logique"). Cliquer un run l'ouvre dans Logs
 * (timeline des BuilderRunEvent, GET /api/builder-runs/:runId).
 * Indépendant de workflow-canvas.js (même principe que config-sources.js) :
 * lit flowId via `aps:flow-ready` sur root, sans dépendance inverse.
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

  const runForm     = root.querySelector('[data-role="run-form"]');
  const runVersionSel = root.querySelector('[data-role="run-version"]');
  const runPayloadEl  = root.querySelector('[data-role="run-payload"]');
  const runPayloadErr = root.querySelector('[data-role="run-payload-error"]');
  const runTriggerBtn = root.querySelector('[data-role="run-trigger"]');
  const runResultEl   = root.querySelector('[data-role="run-result"]');

  let flowId = root._flowId || null;
  let runSelectionne = null;
  // true SEULEMENT sur un choix explicite (clic dans Jobs, ou son propre
  // ▶ Run) — jamais posé par un auto-suivi lui-même, sinon le tout premier
  // auto-suivi de la session bloque tous les suivants (bug trouvé le
  // 2026-08-06 : badges/Run vides pour tout run réel après le premier tant
  // qu'on ne repasse pas manuellement par Jobs → clic → Logs).
  let runChoisiParUtilisateur = false;
  let pollTimer = null;
  let dernierRunAffiche = null;
  let runIdEnAttente = null; // run qu'ON vient de déclencher depuis ce formulaire, en attente de son statut terminal
  const ETATS_TERMINAUX = { success: 1, partial: 1, failed: 1 };

  // Index plat stepId -> step (étiquette lisible), en descendant dans les
  // corps de boucle — alimenté par wf-run-poll.js via aps:run-tick (document
  // mis en cache une fois par run, partagé avec les badges/le panneau Run).
  // Reste vide tant qu'aucun tick n'est arrivé : repli sur l'affichage brut
  // existant (stepCore/stepFacade/stepId), jamais un libellé inventé.
  let indexEtapes = {};
  function _indexerEtapes(document_) {
    const out = {};
    function marcher(steps) {
      (steps || []).forEach(function (s) {
        out[s.id] = s;
        if (s.core === 'loop' && s.body) marcher(s.body.steps);
      });
    }
    if (document_) marcher(document_.steps);
    return out;
  }

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

  // ── Déclencheur de test ──────────────────────────────────────────────────
  function _peuplerVersions() {
    if (!runVersionSel || !flowId) return;
    runVersionSel.textContent = '';
    const draft = document.createElement('option');
    draft.value = ''; draft.textContent = 'Draft (current)';
    runVersionSel.appendChild(draft);

    fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/versions')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (v) {
          const o = document.createElement('option');
          o.value = String(v.version);
          o.textContent = 'v' + v.version + ' · ' + new Date(v.createdAt).toLocaleString();
          runVersionSel.appendChild(o);
        });
      }).catch(function () { /* liste vide, non bloquant */ });
  }

  function _afficherResultat(texte, etat) {
    if (!runResultEl) return;
    runResultEl.textContent = '';
    runResultEl.setAttribute('data-etat', etat || '');
    const pre = document.createElement('pre');
    pre.className = 'rn-result-texte';
    pre.textContent = texte;
    runResultEl.appendChild(pre);
    runResultEl.hidden = false;
  }

  if (runTriggerBtn) {
    runTriggerBtn.addEventListener('click', function () {
      if (!flowId) return;

      let payload = {};
      const brut = runPayloadEl ? runPayloadEl.value.trim() : '';
      if (brut) {
        try {
          payload = JSON.parse(brut);
        } catch (e) {
          if (runPayloadErr) { runPayloadErr.textContent = 'Invalid JSON: ' + e.message; runPayloadErr.hidden = false; }
          return;
        }
      }
      if (runPayloadErr) runPayloadErr.hidden = true;

      const body = { payload: payload };
      const version = runVersionSel ? runVersionSel.value : '';
      if (version) body.version = Number(version);

      runTriggerBtn.disabled = true;
      runTriggerBtn.textContent = '… Running';
      _afficherResultat('Running…', 'running');

      fetch('/api/builder-engine/trigger/' + encodeURIComponent(flowId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || ('HTTP error'));
          // Réponse immédiate = juste un runId, le run tourne encore en tâche
          // de fond — animation live sur le canevas via WfRunPoll, résultat
          // final affiché ici au prochain tick terminal pour CE runId.
          runIdEnAttente = res.data.runId;
          _chargerJobs();
          // `true` : CE navigateur vient de déclencher ce run à l'instant —
          // même son tout premier fetch (qui peut déjà contenir plusieurs
          // événements, le serveur ayant eu le temps d'avancer) est
          // authentiquement du direct, à animer sans le sauter (cf.
          // wf-run-badges.js / wf-run-poll.js `liveDepuisDebut`).
          if (window.WfRunPoll) WfRunPoll.suivre(res.data.runId, true);
        })
        .catch(function (e) {
          runIdEnAttente = null;
          _afficherResultat('Error: ' + e.message, 'failed');
          runTriggerBtn.disabled = false;
          runTriggerBtn.textContent = '▶ Run';
        });
    });
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

    // Suit automatiquement le run le plus récent (API triée startedAt desc)
    // tant que l'utilisateur n'a rien choisi lui-même — pas seulement au
    // premier chargement de CE flow : un run court (webhook Iconik réel,
    // souvent fini en quelques secondes) peut ne jamais être vu au statut
    // "running" entre deux sondages Jobs (4s), donc une règle limitée au
    // tout premier chargement + "running seulement" le laissait invisible
    // pour tout run réel suivant (retour utilisateur 2026-08-06 : badges/Run
    // vides tant qu'on ne repasse pas manuellement par Jobs → clic → Logs).
    let aSuivreAuto = null;
    if (runs.length && !runChoisiParUtilisateur && runs[0].id !== runSelectionne) {
      aSuivreAuto = runs[0].id;
    }

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
      // Trois origines réelles, pas deux : un run planifié affichait « manual »
      // avec l'ancien ternaire, qui rangeait tout ce qui n'était pas
      // custom_action du côté manuel. `triggerRef` porte le mode de minuterie
      // (cron/interval/oneshot) — cf. builder-scheduler.js.
      trig.textContent = run.triggerType === 'custom_action' ? (run.triggerRef || 'webhook')
        : run.triggerType === 'timer' ? ('⏱ ' + (run.triggerRef || 'timer'))
        : 'manual';
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

    // Sondage continu tant que le flow est ouvert — pas seulement quand un
    // run était DÉJÀ en cours au tick précédent, sinon un run déclenché hors
    // canevas (webhook Iconik réel) démarré pendant une accalmie n'est
    // jamais détecté. Coût faible (4 s, un seul flow ouvert à la fois).
    clearTimeout(pollTimer);
    if (flowId) {
      pollTimer = setTimeout(_chargerJobs, 4000);
    }

    if (aSuivreAuto) _selectionnerRun(aSuivreAuto, false);
  }

  // ── Logs : timeline d'événements d'un run sélectionné ────────────────────
  function _selectionnerRun(runId, basculerVersLogs) {
    runSelectionne = runId;
    // `basculerVersLogs` n'est true QUE sur les appels utilisateur (clic
    // Jobs, fin de son propre ▶ Run) — jamais sur l'auto-suivi ci-dessus,
    // donc réutilisable tel quel comme marqueur "choix explicite".
    if (basculerVersLogs) runChoisiParUtilisateur = true;
    if (window.WfRunPoll) WfRunPoll.suivre(runId);
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
        dernierRunAffiche = run;
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
      // Libellé lisible du nœud (ex. "Get Collection ID") si le document est
      // en cache (aps:run-tick) — sinon repli sur l'affichage brut existant,
      // jamais un libellé inventé.
      const etape = indexEtapes[ev.stepId];
      step.textContent = etape
        ? etape.label + (ev.port ? ' → ' + ev.port : '')
        : (ev.stepCore || '') + (ev.stepFacade ? ' · ' + ev.stepFacade : '') + ' (' + ev.stepId + ')' + (ev.port ? ' → ' + ev.port : '');
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

  // Document mis en cache par wf-run-poll.js (une fois par run, partagé avec
  // les badges/le panneau Run) — alimente indexEtapes dès qu'il arrive, et
  // rejoue le rendu de Logs pour que les libellés (et les événements les
  // plus récents d'un run encore en cours) apparaissent sans action. Gère
  // aussi le résultat final du DERNIER run déclenché DEPUIS ce formulaire.
  root.addEventListener('aps:run-tick', function (e) {
    if (e.detail.document) indexEtapes = _indexerEtapes(e.detail.document);

    if (runIdEnAttente && e.detail.runId === runIdEnAttente && e.detail.run && ETATS_TERMINAUX[e.detail.run.status]) {
      const runComplet = Object.assign({}, e.detail.run, { events: e.detail.allEvents });
      _afficherResultat(JSON.stringify(runComplet, null, 2), e.detail.run.status);
      if (runTriggerBtn) { runTriggerBtn.disabled = false; runTriggerBtn.textContent = '▶ Run'; }
      runIdEnAttente = null;
      _chargerJobs().then(function () { _selectionnerRun(e.detail.runId, true); });
    }

    if (e.detail.runId !== runSelectionne || !dernierRunAffiche) return;
    const runPourRendu = Object.assign({}, dernierRunAffiche, e.detail.run, { events: e.detail.allEvents });
    dernierRunAffiche = runPourRendu;
    _rendreLogs(runPourRendu);
  });

  // ── Câblage : flowId, refresh manuel ─────────────────────────────────────
  // `aps:flow-ready` se redéclenche après CHAQUE sauvegarde (y compris
  // l'auto-save silencieux sur toute édition, cf. workflow-canvas.js
  // `_declencherAutoSave`/`_annoncerFlow`), pas seulement à l'ouverture d'un
  // flow différent — un premier bug ici effaçait le run/nœud suivi à chaque
  // auto-save du MÊME flow (ex. après un Tidy ou tout autre edit), ce qui se
  // manifestait comme "le panneau Run se vide tout seul après un moment".
  // Ne réinitialiser QUE sur un vrai changement de flowId.
  root.addEventListener('aps:flow-ready', function (e) {
    const change = e.detail.flowId !== flowId;
    flowId = e.detail.flowId;
    if (runForm) runForm.hidden = !flowId;
    if (change) {
      runSelectionne = null;
      runChoisiParUtilisateur = false;
      _peuplerVersions(); _chargerJobs();
    }
  });
  if (runForm) runForm.hidden = !flowId;
  if (flowId) _peuplerVersions();

  if (jobsRefresh) {
    jobsRefresh.addEventListener('click', function () {
      jobsRefresh.classList.add('bd-spinning');
      _chargerJobs().then(function () { jobsRefresh.classList.remove('bd-spinning'); });
    });
  }

  if (flowId) _chargerJobs();
})();
