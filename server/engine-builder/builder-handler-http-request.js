// APS — server/engine-builder/builder-handler-http-request.js — créé le 2026-08-05
// Port de handleHttpRequest() + _handleHttpForeach(), server/engine/
// wfd-engine-handlers.js:2362-2725 et :2895-3076. Dispatch par
// `params.httpMode` : 'simple' (défaut, Core http_request pur) | 'foreach'
// (utilisé par les étapes Endpoint de vodfactory.partner, cf.
// builder-handler-http-sequence.js). Les modes 'action'/'verify' de WFD ne
// sont dérivés par AUCUN core/facade du catalogue pivot (iconik.action et
// verify ont chacun leur propre handler nommé, jamais handleHttpRequest) —
// non portés, absence volontaire plutôt qu'oubli : lèvent une erreur claire
// s'ils sont un jour atteints.
// Ports du pivot (core http_request) : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');

function _wfdSlugify(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _connFor(p, deps) {
  const connexionId = p.connexionId;
  const conn = connexionId && deps.resolved && deps.resolved.connexions
    ? deps.resolved.connexions[connexionId] : null;
  if (!conn && connexionId) throw new Error('Connexion introuvable : ' + connexionId);
  return conn;
}

// ── Mode simple ────────────────────────────────────────────────────────────
async function _simple(step, ctx, deps) {
  const p = step.params || {};
  const conn      = _connFor(p, deps);
  const method    = (p.method || 'GET').toUpperCase();
  const resultVar = p.resultVar || 'http_response';
  const baseUrl   = conn?.endpoint || '';

  const resolveVar = (key) => {
    return ctx.vars?.[key]
        ?? BuilderContext.resolvePath(key, ctx)
        ?? ctx.results?.[key]
        ?? '';
  };

  const interpolate = (str) => {
    if (!str) return str;
    return str.replace(/\{([^}]+)\}/g, (_, key) => {
      const val = resolveVar(key);
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  };

  const _expandDotKeys = (flat) => {
    if (!flat || typeof flat !== 'object' || Array.isArray(flat)) return flat;
    const hasDotKeys = Object.keys(flat).some(k => k.includes('.') || k.includes('['));
    if (!hasDotKeys) return flat;

    const result = {};
    Object.entries(flat).forEach(([path, value]) => {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
      if (parts.length === 1) { result[path] = value; return; }
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];
        const nextIsNum = /^\d+$/.test(nextPart);
        if (current[part] === undefined) current[part] = nextIsNum ? [] : {};
        current = current[part];
      }
      const lastPart = parts[parts.length - 1];
      if (Array.isArray(current)) current[parseInt(lastPart)] = value;
      else current[lastPart] = value;
    });
    return result;
  };

  const buildBody = (bodyTemplate) => {
    if (!bodyTemplate || bodyTemplate === '{}') return undefined;
    try {
      const varRefs = {};
      let counter = 0;
      let templateWithSentinels = bodyTemplate.replace(
        /"\{([a-zA-Z_][a-zA-Z0-9_.À-ÿ]*)\}"/g,
        (match, key) => { const sentinel = '__VAR_' + counter++ + '__'; varRefs[sentinel] = key; return '"' + sentinel + '"'; }
      );
      templateWithSentinels = templateWithSentinels.replace(
        /\{([a-zA-Z_][a-zA-Z0-9_.À-ÿ]*)\}/g,
        (match, key) => { const sentinel = '__VAR_' + counter++ + '__'; varRefs[sentinel] = key; return sentinel; }
      );

      const parsed = JSON.parse(templateWithSentinels);

      const resolveEntry = (val) => {
        if (typeof val !== 'string') return val;
        if (varRefs[val]) {
          let resolved = resolveVar(varRefs[val]);
          if (typeof resolved === 'string' && (resolved.startsWith('{') || resolved.startsWith('['))) {
            try { resolved = JSON.parse(resolved); } catch (_) {}
          }
          return resolved !== undefined && resolved !== '' ? resolved : null;
        }
        const mixed = val.replace(/__VAR_\d+__/g, (sentinel) => {
          const key = varRefs[sentinel];
          if (!key) return sentinel;
          const resolved = resolveVar(key);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        });
        return mixed !== val ? mixed : val;
      };

      const resolveDeep = (val) => {
        if (Array.isArray(val)) return val.map(resolveDeep);
        if (val && typeof val === 'object') {
          const out = {};
          Object.entries(val).forEach(([k2, v2]) => { out[k2] = resolveDeep(v2); });
          return out;
        }
        return resolveEntry(val);
      };

      const result = {};
      Object.entries(parsed).forEach(([k, v]) => {
        if (k === '__spread__') {
          const spreadVal = resolveDeep(v);
          if (spreadVal && typeof spreadVal === 'object' && !Array.isArray(spreadVal)) {
            Object.assign(result, _expandDotKeys(spreadVal));
          }
        } else {
          const resolved = resolveDeep(v);
          if (resolved !== null) result[k] = resolved;
        }
      });

      const _encodeUrlInBody = (val) => {
        if (typeof val !== 'string') return val;
        if (!val.startsWith('s3://') && !val.startsWith('https://') && !val.startsWith('http://')) return val;
        const proto = val.match(/^(s3|https?):\/\/([^/]+)\//)?.[0] || '';
        if (!proto) return val;
        const rest = val.slice(proto.length);
        return proto + rest.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
      };
      const _encodeDeepBody = (obj) => {
        if (typeof obj === 'string') return _encodeUrlInBody(obj);
        if (Array.isArray(obj)) return obj.map(_encodeDeepBody);
        if (obj && typeof obj === 'object') {
          const out = {};
          Object.entries(obj).forEach(([k, v]) => { out[k] = _encodeDeepBody(v); });
          return out;
        }
        return obj;
      };
      return JSON.stringify(_encodeDeepBody(result));
    } catch (e) {
      return interpolate(bodyTemplate);
    }
  };

  const url = baseUrl + interpolate(p.endpoint || '');

  const headers = { 'Content-Type': 'application/json' };
  if (conn?.authType === 'bearer' && conn?.authValue) headers['Authorization'] = 'Bearer ' + conn.authValue;
  else if (conn?.authType === 'apikey_header' && conn?.authValue) headers['X-API-Key'] = conn.authValue;
  else if (conn?.authType === 'basic' && conn?.authValue) headers['Authorization'] = 'Basic ' + Buffer.from(conn.authValue).toString('base64');
  (conn?.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value; });
  (p.extraHeaders || []).forEach(h => { if (h.key) headers[interpolate(h.key)] = interpolate(h.value); });

  let body;
  if (!['GET', 'DELETE'].includes(method)) {
    const bodyTpl = p.body || p.bodyTemplate || '';
    if (bodyTpl && bodyTpl !== '{}') {
      body = buildBody(bodyTpl);
      if (body) { try { JSON.parse(body); } catch (e) { throw new Error('Body JSON invalide : ' + e.message + ' → ' + body.slice(0, 100)); } }
    } else {
      const _srcVar = p.sourceVar || '';
      let _payload = null;
      if (_srcVar) {
        _payload = ctx.results?.[_srcVar] ?? null;
        if (!_payload) {
          const _raw = ctx.vars?.[_srcVar];
          if (_raw) { try { _payload = typeof _raw === 'string' ? JSON.parse(_raw) : _raw; } catch (_) {} }
        }
      }
      if (!_payload) {
        const _raw = ctx.vars?.vodFactoryPayload;
        if (_raw) { try { _payload = typeof _raw === 'string' ? JSON.parse(_raw) : _raw; } catch (_) {} }
      }
      if (!_payload) {
        const key = Object.keys(ctx.results || {}).find(k =>
          !k.startsWith('_') && ctx.results[k] && typeof ctx.results[k] === 'object' && !Array.isArray(ctx.results[k])
        );
        if (key) _payload = ctx.results[key];
      }
      if (_payload && typeof _payload === 'object' && !Array.isArray(_payload)) {
        const _encodeUrlVal = (val) => {
          if (typeof val !== 'string') return val;
          if (!val.startsWith('s3://') && !val.startsWith('https://') && !val.startsWith('http://')) return val;
          const proto = val.match(/^(s3|https?):\/\/([^/]+)\//)?.[0] || '';
          if (!proto) return val;
          const rest = val.slice(proto.length);
          return proto + rest.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
        };
        const _encodeDeepPayload = (obj) => {
          if (typeof obj === 'string') return _encodeUrlVal(obj);
          if (Array.isArray(obj)) return obj.map(_encodeDeepPayload);
          if (obj && typeof obj === 'object') {
            const out = {};
            Object.entries(obj).forEach(([k, v]) => { out[k] = _encodeDeepPayload(v); });
            return out;
          }
          return obj;
        };
        body = JSON.stringify(_encodeDeepPayload(_expandDotKeys(_payload)));
      }
    }
  }

  let response, responseBody;
  try {
    response = await globalThis.fetch(url, { method, headers, body });
    const text = await response.text();
    try { responseBody = JSON.parse(text); } catch (_) { responseBody = text; }
  } catch (e) {
    throw new Error('Erreur réseau : ' + e.message + ' → ' + url);
  }

  const result = { status: response.status, ok: response.ok, url, method, body: responseBody };
  BuilderContext.storeResult(ctx, resultVar, result);
  BuilderContext.setVar(ctx, resultVar + '_status', String(response.status));
  BuilderContext.setVar(ctx, resultVar + '_ok', response.ok ? 'true' : 'false');

  const _ignoreCodes = (p.ignoreCodes || []).map(Number);

  if (response.status === 422 && method === 'POST' && p.upsert !== false && !_ignoreCodes.includes(422)) {
    let patchUrl = url;
    if (body) {
      try {
        const parsedBody = JSON.parse(body);
        const extId = parsedBody.external_id;
        if (extId) patchUrl = url.replace(/\/+$/, '') + '/' + extId;
      } catch (_) {}
    }
    const patchResponse = await globalThis.fetch(patchUrl, { method: 'PUT', headers, body });
    const patchText = await patchResponse.text();
    let patchBody;
    try { patchBody = JSON.parse(patchText); } catch (_) { patchBody = patchText; }
    // Conserve la réponse du POST d'origine : c'est ELLE qui porte le détail
    // de validation (« The given data was invalid. » + le champ fautif), et
    // elle était jusqu'ici purement écrasée par le résultat du PUT. Quand
    // l'upsert échoue en 404 (« Content not found »), le seul message
    // remonté décrivait donc la conséquence, jamais la cause — impossible
    // de savoir POURQUOI la création avait été refusée (constaté le
    // 2026-08-06 en remontant la chaîne d'un run PUBLISH réel).
    const patchResult = {
      status: patchResponse.status, ok: patchResponse.ok, url, method: 'PUT',
      body: patchBody, upserted: true,
      postOrigine: { status: response.status, body: responseBody },
    };
    BuilderContext.storeResult(ctx, resultVar, patchResult);
    BuilderContext.setVar(ctx, resultVar + '_status', String(patchResponse.status));
    BuilderContext.setVar(ctx, resultVar + '_ok', patchResponse.ok ? 'true' : 'false');
    if (!patchResponse.ok) {
      const errMsg = typeof patchBody === 'object'
        ? (patchBody.message || patchBody.error || JSON.stringify(patchBody).slice(0, 200))
        : String(patchBody).slice(0, 200);
      const _patchWarn = patchResponse.status === 404 || (patchResponse.status >= 500);
      // Message combiné cause → conséquence : le PUT n'a été tenté QUE parce
      // que le POST a renvoyé 422, donc le motif du refus initial doit
      // apparaître, sinon un 404 « Content not found » se lit à tort comme
      // « le partenaire est injoignable / a perdu le contenu ».
      const _msgPost = typeof responseBody === 'object'
        ? (responseBody.message || responseBody.error || JSON.stringify(responseBody).slice(0, 200))
        : String(responseBody).slice(0, 200);
      BuilderContext.addError(
        ctx, step.id,
        `POST HTTP ${response.status} — ${_msgPost} → upsert PUT HTTP ${patchResponse.status} — ${errMsg}`,
        'warn'
      );
      return { port: _patchWarn ? 'out' : 'error' };
    }
    return { port: 'out' };
  }

  const _ignored = _ignoreCodes.includes(response.status);
  const _is5xx = response.status >= 500 && response.status < 600;
  if (!response.ok && !_ignored && !_is5xx) {
    const errMsg = typeof responseBody === 'object'
      ? (responseBody.message || responseBody.error || JSON.stringify(responseBody).slice(0, 200))
      : String(responseBody).slice(0, 200);
    BuilderContext.addError(ctx, step.id, `HTTP ${response.status} — ${errMsg}`, 'warn');
    return { port: 'error' };
  }
  if (_ignored || _is5xx) {
    const errMsg = typeof responseBody === 'object'
      ? (responseBody.message || responseBody.error || String(response.status))
      : String(response.status);
    BuilderContext.addError(ctx, step.id, `HTTP ${response.status} (continué) — ${errMsg}`, 'warn');
  }
  return { port: 'out' };
}

// ── Mode foreach ─────────────────────────────────────────────────────────
// Port de _handleHttpForeach(), wfd-engine-handlers.js:2895-3076.
async function _foreach(step, ctx, deps) {
  const p = step.params || {};
  const conn        = _connFor(p, deps);
  const method      = (p.method || 'POST').toUpperCase();
  const resultVar   = p.feResultVar || 'foreach_result';
  const sourceVar   = (p.feSourceVar || '').replace(/^\{|\}$/g, '');
  const separator   = p.feSeparator !== undefined ? p.feSeparator : ', ';
  const localName   = p.feLocalName || 'nom';
  const ignoreCodes = (p.feIgnoreCodes || [409, 422]).map(Number);
  const onError     = p.feOnError || 'continue';
  const baseUrl     = conn?.endpoint || '';

  const rawVal = ctx.vars?.[sourceVar] ?? BuilderContext.resolvePath(sourceVar, ctx) ?? '';

  let values;
  const rawStr = String(rawVal);
  if (rawStr.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) values = parsed.map(v => String(v).trim()).filter(Boolean);
    } catch (_) {}
  }
  if (!values) values = rawStr.split(separator).map(v => v.trim()).filter(Boolean);

  if (!values.length) {
    BuilderContext.storeResult(ctx, resultVar, []);
    BuilderContext.setVar(ctx, resultVar + '_count', '0');
    return { port: 'out' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (conn?.authType === 'bearer' && conn?.authValue) headers['Authorization'] = 'Bearer ' + conn.authValue;
  else if (conn?.authType === 'apikey_header' && conn?.authValue) headers['X-API-Key'] = conn.authValue;
  else if (conn?.authType === 'basic' && conn?.authValue) headers['Authorization'] = 'Basic ' + Buffer.from(conn.authValue).toString('base64');
  (conn?.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value; });

  const interpolateForeach = (template, val, idx) => {
    if (!template) return template;
    const slug = _wfdSlugify(val);
    return template
      .replace(/\{\{slug\([^)]+\)\}\}/g, slug)
      .replace(/\{\{index\}\}/g, String(idx))
      .replace(/\{\{[^}]+\}\}/g, val)
      .replace(/\{([a-zA-Z_][a-zA-Z0-9_.À-ÿ]*)\}/g, (_, key) => {
        const v = ctx.vars?.[key] ?? BuilderContext.resolvePath(key, ctx) ?? '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      });
  };

  const collected = [];
  const errors    = [];

  for (let i = 0; i < values.length; i++) {
    const val  = values[i];
    const slug = _wfdSlugify(val);
    const url  = baseUrl + interpolateForeach(p.endpoint || '', val, i);

    let body;
    if (!['GET', 'DELETE'].includes(method)) {
      if (Array.isArray(p.feFields) && p.feFields.length) {
        const payload = {};
        p.feFields.forEach(function (f) {
          if (!f || !f.key) return;
          if (f.src === 'slug') payload[f.key] = slug;
          else if (f.src === 'index') payload[f.key] = i;
          else if (f.src === 'job') payload[f.key] = p.feJob || null;
          else payload[f.key] = val;
        });
        body = JSON.stringify(payload);
      } else if (p.feBody) {
        body = interpolateForeach(p.feBody, val, i);
        try { JSON.parse(body); } catch (e) {
          BuilderContext.addError(ctx, step.id, `Foreach body JSON invalide pour "${val}" : ${e.message}`, 'warn');
          continue;
        }
      }
    }

    let response, responseBody;
    try {
      response = await globalThis.fetch(url, { method, headers, body });
      const text = await response.text();
      try { responseBody = JSON.parse(text); } catch (_) { responseBody = text; }
    } catch (e) {
      const msg = `Erreur réseau pour "${val}" : ${e.message}`;
      if (onError === 'stop') throw new Error(msg);
      BuilderContext.addError(ctx, step.id, msg, 'warn');
      errors.push({ val, error: e.message });
      continue;
    }

    const ignored = ignoreCodes.includes(response.status);

    if (!response.ok && !ignored) {
      const errMsg = typeof responseBody === 'object'
        ? (responseBody.message || responseBody.error || JSON.stringify(responseBody).slice(0, 100))
        : String(responseBody).slice(0, 100);
      const msg = `HTTP ${response.status} pour "${val}" : ${errMsg}`;
      if (onError === 'stop') throw new Error(msg);
      BuilderContext.addError(ctx, step.id, msg, 'warn');
      errors.push({ val, status: response.status, error: errMsg });
      continue;
    }

    const collectField = p.feCollectField || 'external_id';
    const collectedVal = typeof responseBody === 'object'
      ? (responseBody[collectField] ?? slug)
      : slug;

    collected.push({
      [localName]: val,
      external_id: String(collectedVal),
      slug,
      job: p.feJob || null,
      status: response.status,
      ignored,
    });
  }

  if (p.feAppend && ctx.results[resultVar] && Array.isArray(ctx.results[resultVar])) {
    const existing = ctx.results[resultVar];
    const merged   = existing.concat(collected);
    BuilderContext.storeResult(ctx, resultVar, merged);
    BuilderContext.setVar(ctx, resultVar, JSON.stringify(merged));
    BuilderContext.setVar(ctx, resultVar + '_count', String(merged.length));
  } else {
    BuilderContext.storeResult(ctx, resultVar, collected);
    BuilderContext.setVar(ctx, resultVar, JSON.stringify(collected));
    BuilderContext.setVar(ctx, resultVar + '_count', String(collected.length));
  }
  if (errors.length) BuilderContext.storeResult(ctx, resultVar + '_errors', errors);

  return { port: collected.length > 0 ? 'out' : 'error' };
}

async function httpRequest(step, ctx, deps) {
  const p = step.params || {};
  const mode = p.httpMode || 'simple';
  if (mode === 'foreach') return _foreach(step, ctx, deps);
  if (mode === 'simple' || !mode) return _simple(step, ctx, deps);
  throw new Error(`http_request : httpMode "${mode}" non implémenté dans le moteur Builder (hors surface du catalogue pivot)`);
}

module.exports = httpRequest;
