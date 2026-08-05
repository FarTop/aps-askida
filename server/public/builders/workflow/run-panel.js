/**
 * run-panel.js — Dock droit, vue Run
 *
 * Déclenche le moteur natif du Builder (server/engine-builder/, routes
 * /api/builder-engine/*) sur le workflow actuellement ouvert. Indépendant de
 * workflow-canvas.js — même principe que config-sources.js : lit l'état du
 * workflow (flowId, orgId) exposé sur root par l'événement `aps:flow-ready`
 * (root._flowId), ne connaît rien du reste du canevas.
 *
 * Le déclenchement manuel est ASYNCHRONE côté serveur (2026-08-05, pour
 * l'animation live des jobs) : la réponse arrive avec un runId dès que la
 * ligne BuilderRun existe, le run tourne encore en tâche de fond derrière —
 * WfRunPoll.suivre(runId) prend le relais pour suivre sa progression
 * (badges/arêtes sur le canevas, onglet Debug, Logs), affiché ici via
 * `aps:run-tick` plutôt que le corps de la réponse HTTP. `aps:run-finished`
 * reste émis, mais seulement une fois le run réellement terminé (statut
 * terminal reçu via le tick), pour que jobs-logs-panel.js rafraîchisse Jobs
 * au bon moment — pas juste après la réponse HTTP, qui n'est plus la fin.
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const noFlowEl   = root.querySelector('[data-role="run-no-flow"]');
  const formEl     = root.querySelector('[data-role="run-form"]');
  const versionSel = root.querySelector('[data-role="run-version"]');
  const payloadEl  = root.querySelector('[data-role="run-payload"]');
  const payloadErr = root.querySelector('[data-role="run-payload-error"]');
  const triggerBtn = root.querySelector('[data-role="run-trigger"]');
  const resultEl   = root.querySelector('[data-role="run-result"]');
  if (!formEl || !triggerBtn) return;

  let flowId = root._flowId || null;
  let runIdEnAttente = null; // runId qu'on vient de déclencher, en attente de son statut terminal
  const ETATS_TERMINAUX = { success: 1, partial: 1, failed: 1 };

  function _majDisponibilite() {
    const dispo = !!flowId;
    if (noFlowEl) noFlowEl.hidden = dispo;
    formEl.hidden = !dispo;
  }
  _majDisponibilite();

  root.addEventListener('aps:flow-ready', function (e) {
    const nouveau = e.detail.flowId;
    const change = nouveau !== flowId;
    flowId = nouveau;
    _majDisponibilite();
    if (flowId && change) _peuplerVersions();
  });
  if (flowId) _peuplerVersions();

  // ── Sélecteur de version : brouillon courant + versions publiées figées ──
  function _peuplerVersions() {
    if (!versionSel) return;
    versionSel.textContent = '';
    const draft = document.createElement('option');
    draft.value = ''; draft.textContent = 'Draft (current)';
    versionSel.appendChild(draft);

    fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/versions')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (v) {
          const o = document.createElement('option');
          o.value = String(v.version);
          o.textContent = 'v' + v.version + ' · ' + new Date(v.createdAt).toLocaleString();
          versionSel.appendChild(o);
        });
      }).catch(function () { /* liste vide, non bloquant */ });
  }

  // ── Résultat : texte SÉLECTIONNABLE/COPIABLE (feedback-run-jobs-panel-ux :
  //    « all displayed text must be selectable and copy-pasteable »). ───────
  function _afficherResultat(texte, etat) {
    if (!resultEl) return;
    resultEl.textContent = '';
    resultEl.setAttribute('data-etat', etat || '');
    const pre = document.createElement('pre');
    pre.className = 'rn-result-texte';
    pre.textContent = texte;
    resultEl.appendChild(pre);
    resultEl.hidden = false;
  }

  triggerBtn.addEventListener('click', function () {
    if (!flowId) return;

    let payload = {};
    const brut = payloadEl ? payloadEl.value.trim() : '';
    if (brut) {
      try {
        payload = JSON.parse(brut);
      } catch (e) {
        if (payloadErr) { payloadErr.textContent = 'Invalid JSON: ' + e.message; payloadErr.hidden = false; }
        return;
      }
    }
    if (payloadErr) payloadErr.hidden = true;

    const body = { payload: payload };
    const version = versionSel ? versionSel.value : '';
    if (version) body.version = Number(version);

    triggerBtn.disabled = true;
    triggerBtn.textContent = '… Running';
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
        // de fond. WfRunPoll prend le relais (badges/arêtes/Debug/Logs) ;
        // ce panneau affiche son propre résultat final au prochain tick
        // terminal pour CE runId (cf. listener aps:run-tick plus bas).
        runIdEnAttente = res.data.runId;
        if (window.WfRunPoll) WfRunPoll.suivre(res.data.runId);
      })
      .catch(function (e) {
        runIdEnAttente = null;
        _afficherResultat('Error: ' + e.message, 'failed');
        triggerBtn.disabled = false;
        triggerBtn.textContent = '▶ Run';
      });
  });

  // Le run qu'ON vient de déclencher atteint un statut terminal : affiche le
  // résultat final et redonne la main au bouton. Ignore les ticks des runs
  // d'AUTRES origines (sélectionnés dans Jobs) — ce panneau ne réagit qu'à
  // ses propres déclenchements, Jobs/Debug/les badges suivent tout le reste.
  root.addEventListener('aps:run-tick', function (e) {
    if (!runIdEnAttente || e.detail.runId !== runIdEnAttente) return;
    if (!e.detail.run || !ETATS_TERMINAUX[e.detail.run.status]) return;
    // events du tick = seulement les NOUVEAUX (since=), on réaffiche la
    // liste complète accumulée par WfRunPoll pour le résultat final.
    const runComplet = Object.assign({}, e.detail.run, { events: e.detail.allEvents });
    _afficherResultat(JSON.stringify(runComplet, null, 2), e.detail.run.status);
    triggerBtn.disabled = false;
    triggerBtn.textContent = '▶ Run';
    root.dispatchEvent(new CustomEvent('aps:run-finished', { detail: { flowId: flowId, runId: runIdEnAttente } }));
    runIdEnAttente = null;
  });
})();
