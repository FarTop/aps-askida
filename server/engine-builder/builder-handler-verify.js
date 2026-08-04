// APS — server/engine-builder/builder-handler-verify.js — créé le 2026-08-05
// Port de checker(), server/engine/wfd-engine-handlers.js:4048-4160. `checks`
// dérivés de `params.manifestId` (Manifest.essences filtrées sur verifyPath),
// même dérivation que pivot-to-wfd.js:137-156 (manifestId -> checks), portée
// ici plutôt qu'au moment de la conversion. `connexionId` résolu via
// deps.resolved.connexions (pas de global mutable WfdHandlers._connexions,
// cf. plan §4). Ports du pivot : ok | fail | error.
'use strict';

const BuilderContext = require('./builder-context.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _checksFromManifest(manifest) {
  const essences = (manifest && manifest.essences) || [];
  return essences
    .filter(e => e.verifyPath)
    .map(e => {
      const c = { label: e.role || '', endpoint: e.verifyEndpoint || '', path: e.verifyPath, op: 'not_empty' };
      if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
        c.appliesTo = e.appliesTo;
      }
      return c;
    });
}

function _getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((o, k) => {
    if (o === null || o === undefined) return undefined;
    const arrMatch = k.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) return o[arrMatch[1]]?.[parseInt(arrMatch[2])];
    return o[k];
  }, obj);
}

async function verify(step, ctx, deps) {
  const p = step.params || {};
  const manifest = p.manifestId && deps.resolved && deps.resolved.manifests
    ? deps.resolved.manifests[p.manifestId] : null;
  const checks = manifest ? _checksFromManifest(manifest) : (p.checks || []);

  if (!checks.length) return { port: 'ok' };

  const conn = p.connexionId && deps.resolved && deps.resolved.connexions
    ? deps.resolved.connexions[p.connexionId] : null;
  const useIconik = !conn && deps.iconikClient;

  let baseUrl = '';
  let headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (conn) {
    baseUrl = conn.endpoint || '';
    if (conn.authType === 'bearer' || conn.authType === 'token') headers['Authorization'] = 'Bearer ' + conn.authValue;
    else if (conn.authType === 'iconik') { headers['App-ID'] = conn.extraConfig?.appId || ''; headers['Auth-Token'] = conn.authValue || ''; }
    else if (conn.authValue) headers['Authorization'] = 'Bearer ' + conn.authValue;
  } else if (!deps.iconikClient) {
    throw new Error('verify : connexion introuvable — ' + p.connexionId);
  }

  const TYPE_TO_NIVEAU = { 'Série': 'serie', 'Saison': 'saison', 'Episode': 'episode', 'Unitaire': 'unitaire' };
  const niveauCourant  = TYPE_TO_NIVEAU[ctx.vars?.TypeCollection] || '';
  const checksPortee = checks.filter(chk => {
    if (!Array.isArray(chk.appliesTo) || !chk.appliesTo.length || !niveauCourant) return true;
    return chk.appliesTo.indexOf(niveauCourant) !== -1;
  });

  const failures = [];
  const results  = {};

  for (const chk of checksPortee) {
    const endpoint = r(chk.endpoint || '', ctx);
    const method   = (chk.method || 'GET').toUpperCase();
    const label    = chk.label || endpoint;

    try {
      let body;
      if (useIconik) {
        body = await deps.iconikClient.get(endpoint);
      } else {
        const url = baseUrl.replace(/\/$/, '') + endpoint;
        const res = await globalThis.fetch(url, { method, headers });
        if (!res.ok) {
          failures.push({ label, error: `HTTP ${res.status}` });
          continue;
        }
        const text = await res.text();
        try { body = JSON.parse(text); } catch (_) { body = text; }
      }

      results[label] = body;

      const op       = chk.op || 'equals';
      const expected = r(chk.value || '', ctx);
      let actual = chk.path ? _getByPath(body, chk.path) : body;
      if ((actual === undefined || actual === null || actual === '') && body?.results !== undefined) {
        actual = chk.path ? _getByPath(body.results, chk.path) : body.results;
      }
      const actualStr = actual === null || actual === undefined ? '' : String(actual);

      let pass = false;
      if (op === 'equals')          pass = actualStr === String(expected);
      else if (op === 'not_equals') pass = actualStr !== String(expected);
      else if (op === 'not_empty')  pass = actualStr !== '' && actual !== null && actual !== undefined;
      else if (op === 'contains')   pass = actualStr.includes(String(expected));
      else if (op === 'starts_with') pass = actualStr.startsWith(String(expected));

      if (!pass) {
        failures.push({ label, path: chk.path, expected, actual: actualStr, op });
      }
    } catch (e) {
      BuilderContext.addError(ctx, step.id, 'verify erreur : ' + e.message, 'warn');
      return { port: 'error' };
    }
  }

  const summary = { total: checksPortee.length, passed: checksPortee.length - failures.length, failures };
  BuilderContext.storeResult(ctx, 'checkerResult', summary);
  BuilderContext.setVar(ctx, 'checkerSummary', failures.length
    ? failures.map(f => (f.label || f.path) + ': ' + (f.error || f.actual || 'échec')).join(', ')
    : 'OK');

  return failures.length > 0 ? { port: 'fail' } : { port: 'ok' };
}

module.exports = verify;
