/* =======================================================================
WFD Sync Bridge — Settings side (clean + robust)

GOALS
- Wrap sync launchers when they exist:
  - lancerDomaineSite (domain_to_site)
  - lancerSiteDomaine (site_to_domain)
  - lancerDomaineDomaine (domain_to_domain)
- Keep launchers behaviour unchanged (pass-through), only adds:
  - APS → Iconik active env selection (best-effort)
  - Optional telemetry events: sync_start / sync_done

NOTES
- This file is intentionally defensive:
  - Works even if WFD_Bus is loaded after (no early return)
  - Does NOT log secrets (token/appId)
  - Does NOT enforce extra confirmations (handled in launchers)

Install flag:
  window.__WFD_SyncBridgeSettingsInstalled = true
======================================================================= */

(function () {
  'use strict';

  // Idempotent install
  if (window.__WFD_SyncBridgeSettingsInstalled) return;
  window.__WFD_SyncBridgeSettingsInstalled = true;

  const LOG_PREFIX = '[WFD] SyncBridge(Settings)';

  // ---------------------------------------------------------------------
  // Safe event emitter (WFD_Bus if present, else BroadcastChannel fallback)
  // ---------------------------------------------------------------------
  let _bc = null;
  function _getBC() {
    try {
      if (_bc) return _bc;
      if (typeof BroadcastChannel === 'function') {
        _bc = new BroadcastChannel('wfd-sync');
        return _bc;
      }
    } catch (_) {}
    return null;
  }

  function emit(eventName, payload) {
    const bus = window.WFD_Bus;
    try {
      if (bus) {
        if (typeof bus.emit === 'function') {
          bus.emit(eventName, payload);
          return;
        }
        if (typeof bus.postMessage === 'function') {
          bus.postMessage({ type: eventName, payload });
          return;
        }
      }
    } catch (_) {}

    // Fallback
    const bc = _getBC();
    try {
      bc && bc.postMessage({ type: eventName, payload });
    } catch (_) {}
  }

  // ---------------------------------------------------------------------
  // APS → Iconik: choose the "active" token based on aps:context.domain
  // ---------------------------------------------------------------------
  function readAppTokens() {
    // 1) window.appTokensData if already hydrated
    if (window.appTokensData && Array.isArray(window.appTokensData.appTokens)) {
      return window.appTokensData.appTokens;
    }
    // 2) fallback localStorage
    try {
      const raw = localStorage.getItem('appTokensData');
      const obj = raw ? JSON.parse(raw) : null;
      return Array.isArray(obj?.appTokens) ? obj.appTokens : [];
    } catch {
      return [];
    }
  }

  function getApsDomain() {
    try {
      // Priorité 1 : window._apsActiveEnvSlug (défini par script-settings.js)
      if (window._apsActiveEnvSlug) return String(window._apsActiveEnvSlug).toLowerCase().trim();
      // Priorité 2 : aps:context en localStorage
      const ctx = JSON.parse(localStorage.getItem('aps:context') || 'null');
      const d = ctx?.domain ?? ctx?.env ?? '';
      return String(d).toLowerCase().trim();
    } catch {
      return '';
    }
  }

  function normalizeDomainToken(domainRaw) {
    const s = String(domainRaw || '').toLowerCase().trim();
    if (!s) return '';
    if (s.startsWith('prod')) return 'prod';
    if (s.startsWith('dev')) return 'dev';
    if (s.startsWith('qa')) return 'qa';
    if (s.startsWith('stag')) return 'qa';
    return s;
  }

  function ensureActiveEnvFromAPS() {
    const want = normalizeDomainToken(getApsDomain());
    if (!want) return false;

    const toks = readAppTokens();
    if (!Array.isArray(toks) || toks.length === 0) return false;

    // Prefer environment match, then name match
    const pick =
      toks.find(t => t && t.enabled !== false && String(t.environment || '').toLowerCase().includes(want)) ||
      toks.find(t => t && t.enabled !== false && String(t.name || '').toLowerCase().includes(want));

    if (!pick) return false;

    try {
      localStorage.setItem('iconikAppTokensData', JSON.stringify({ appTokens: [pick] }));
      localStorage.setItem('iconik:activeEnv', want);
      // Never log token/appId; keep it non-sensitive
      console.log('[APS→Iconik] active env =', want, { name: pick.name, environment: pick.environment, enabled: pick.enabled });
    } catch (_) {}

    return true;
  }

  // ---------------------------------------------------------------------
  // Wrapping logic
  // ---------------------------------------------------------------------
  function wrapOnce(fnName, kind) {
    const original = window[fnName];
    if (typeof original !== 'function') return false;

    // If already wrapped, skip
    if (original.__wfdWrapped) return true;

    const wrapped = async function () {
      const args = Array.from(arguments);

      // Best effort: sync APS context -> active iconik env
      try { ensureActiveEnvFromAPS(); } catch (_) {}

      const startedAt = Date.now();
      const meta = {
        fn: fnName,
        kind,
        startedAt,
        // keep arguments minimal and non-sensitive
        srcName: args[0],
        envId: args[1]
      };

      emit('sync_start', meta);

      let res;
      try {
        res = original.apply(this, args);
        // Await if promise
        if (res && typeof res.then === 'function') {
          await res;
        }
        emit('sync_done', { ...meta, ok: true, durationMs: Date.now() - startedAt });
        return res;
      } catch (e) {
        emit('sync_done', { ...meta, ok: false, durationMs: Date.now() - startedAt, error: String(e?.message || e) });
        throw e;
      }
    };

    // Preserve markers
    wrapped.__wfdWrapped = true;
    wrapped.__wfdGuard = (kind === 'site_to_domain' || kind === 'domain_to_domain');
    wrapped.__wfdOrig = original;

    window[fnName] = wrapped;
    console.log(LOG_PREFIX + ': wrapped', fnName, 'guard=', wrapped.__wfdGuard);
    return true;
  }

  function tryBind() {
    const a = wrapOnce('lancerDomaineSite', 'domain_to_site');
    const b = wrapOnce('lancerSiteDomaine', 'site_to_domain');
    const c = wrapOnce('lancerDomaineDomaine', 'domain_to_domain');
    return a || b || c;
  }

  // ---------------------------------------------------------------------
  // Install sequence (order-safe)
  // ---------------------------------------------------------------------
  // 1) attempt immediately
  try { ensureActiveEnvFromAPS(); } catch (_) {}
  tryBind();

  // 2) after load
  window.addEventListener('load', function () {
    try { ensureActiveEnvFromAPS(); } catch (_) {}
    tryBind();
  });

  // 3) short retry loop for late-loaded scripts
  let n = 0;
  const timer = setInterval(function () {
    n++;
    const ok = tryBind();
    // Stop after some tries once bind succeeded at least once
    if (ok || n > 40) clearInterval(timer);
  }, 250);

})();
