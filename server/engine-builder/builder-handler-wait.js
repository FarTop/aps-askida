// APS — server/engine-builder/builder-handler-wait.js — créé le 2026-08-05
// Port de wait_for(), server/engine/wfd-engine-handlers.js:3373-3481 — SANS
// le post-action S3 embarqué (`cfg.s3ConnexionId`, :3444-3471) : le panneau
// pivot du core `wait` ne l'expose pas volontairement (config-schema.js:409-
// 415 — "une fois l'attente réussie, enchaîner sur un nœud Deliver plutôt
// que de redupliquer le mapping ici"). Ports du pivot : out | timeout | error.
'use strict';

const BuilderContext = require('./builder-context.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function _getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function wait(step, ctx, deps) {
  const p = step.params || {};
  const connexionId = p.connexionId || '';
  const method      = (p.method || 'GET').toUpperCase();
  const endpoint    = r(p.endpoint || '', ctx);
  const checkPath   = p.checkPath  || 'status';
  const checkValue  = r(p.checkValue || '', ctx);
  const delayMs     = Math.max(1000, (parseInt(p.delaySeconds) || 5) * 1000);
  const maxTries    = Math.max(1, parseInt(p.maxTries) || 20);
  const resultVar   = p.resultVar  || 'waitResult';

  const conn = connexionId && deps.resolved && deps.resolved.connexions
    ? deps.resolved.connexions[connexionId] : null;
  const useIconik = !conn && deps.iconikClient;

  let baseUrl = '', headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (conn) {
    baseUrl = conn.endpoint || '';
    if (conn.authType === 'bearer' || conn.authType === 'token') {
      headers['Authorization'] = 'Bearer ' + conn.authValue;
    } else if (conn.authType === 'iconik') {
      headers['App-ID']     = conn.extraConfig?.appId || '';
      headers['Auth-Token'] = conn.authValue || '';
    } else if (conn.authValue) {
      headers['Authorization'] = 'Bearer ' + conn.authValue;
    }
  } else if (!deps.iconikClient) {
    throw new Error('wait : connexion introuvable — ' + connexionId);
  }

  let lastBody = null;
  for (let i = 0; i < maxTries; i++) {
    if (i > 0) await _sleep(delayMs);

    try {
      let body;
      if (useIconik) {
        body = await deps.iconikClient.get(endpoint);
      } else {
        const url = baseUrl.replace(/\/$/, '') + endpoint;
        const res = await globalThis.fetch(url, { method, headers });
        const text = await res.text();
        try { body = JSON.parse(text); } catch (_) { body = text; }
        if (!res.ok) {
          BuilderContext.storeResult(ctx, resultVar, { status: res.status, body });
          BuilderContext.addError(ctx, step.id, `wait HTTP ${res.status}`, 'warn');
          return { port: 'error' };
        }
      }
      lastBody = body;

      const val = _getByPath(body, checkPath);
      BuilderContext.storeResult(ctx, resultVar, { body, attempt: i + 1 });

      const failValues = (p.failValues || 'FAILED,ERROR,ABORTED').split(',').map(v => v.trim());
      if (failValues.includes(String(val))) {
        BuilderContext.addError(ctx, step.id, 'wait : valeur d\'échec détectée — ' + val, 'warn');
        return { port: 'error' };
      }

      if (String(val) === String(checkValue)) {
        return { port: 'out' };
      }
    } catch (e) {
      BuilderContext.addError(ctx, step.id, 'wait erreur réseau : ' + e.message, 'warn');
      return { port: 'error' };
    }
  }

  BuilderContext.storeResult(ctx, resultVar, { timeout: true, lastBody, attempts: maxTries });
  BuilderContext.addError(ctx, step.id, `wait timeout après ${maxTries} essais`, 'warn');
  return { port: 'timeout' };
}

module.exports = wait;
