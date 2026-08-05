/**
 * run-panel.js — Dock droit, vue Run
 *
 * Déclenche le moteur natif du Builder (server/engine-builder/, routes
 * /api/builder-engine/*) sur le workflow actuellement ouvert. Indépendant de
 * workflow-canvas.js — même principe que config-sources.js : lit l'état du
 * workflow (flowId, orgId) exposé sur root par l'événement `aps:flow-ready`
 * (root._flowId), ne connaît rien du reste du canevas.
 *
 * Un run déclenché ici est TOUJOURS synchrone côté serveur (le déclenchement
 * manuel attend `executeRun` avant de répondre — cf. builder-engine.js) : pas
 * de polling nécessaire pour SON propre run, juste afficher le résultat reçu.
 * Émet `aps:run-finished` pour que jobs-logs-panel.js rafraîchisse Jobs sans
 * dépendance inverse.
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
        _afficherResultat(JSON.stringify(res.data, null, 2), res.data.status || 'success');
        root.dispatchEvent(new CustomEvent('aps:run-finished', { detail: { flowId: flowId, runId: res.data.runId } }));
      })
      .catch(function (e) {
        _afficherResultat('Error: ' + e.message, 'failed');
      })
      .then(function () {
        triggerBtn.disabled = false;
        triggerBtn.textContent = '▶ Run';
      });
  });
})();
