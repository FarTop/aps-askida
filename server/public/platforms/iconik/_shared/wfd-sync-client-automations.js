/* =======================================================================
 WFD Sync Client — Automations page helper (Webhooks + Custom Actions only)
 - Refresh UI on sync_done (from Settings)
 - Binds ONLY when currentKind is 'webhook' or 'custom'
 - Never touches DOM when editing an 'automation' (prevents select pollution)
 - Uses localStorage as source of truth (appsData, metadataViewsData, webhooksData, customActionsData)
 - Idempotent DOM writes to prevent MutationObserver loops
 Requires: wfd-bus.js loaded before.
 ======================================================================= */
(function () {
  if (window.__WFD_SyncClientAutomationsInstalled) return;
  window.__WFD_SyncClientAutomationsInstalled = true;

  const bus = window.WFD_Bus;
  if (!bus) {
    console.warn('[WFD] SyncClient(Automations): WFD_Bus not found');
    return;
  }

  // ------------------------------------------------------------
  // Pause/resume binders from console
  // window.__WFD_PAUSE_BINDINGS = true/false
  // ------------------------------------------------------------
  window.__WFD_PAUSE_BINDINGS = window.__WFD_PAUSE_BINDINGS || false;
  const paused = () => !!window.__WFD_PAUSE_BINDINGS;

  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const pretty = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s === s.toLowerCase() ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
  };

  let bindingInProgress = false;
  let lastSig = '';
  let lastDomWrite = 0;

  // ---------- Local stores ----------
  // Lectures depuis variables globales (migration localStorage → mémoire)
  const getWebhooks      = () => (window.webhooksData?.webhooks           || []);
  const getCustomActions = () => (window.customActionsData?.customActions || []);
  const getApps          = () => (window.appsData?.apps                   || []);

  function getMetadataViewsById() {
    const out = {};
    (window.metadataViewsData?.metadataViews || []).forEach(v => {
      if (v && v.id) out[String(v.id)] = (v.name || v.nom || v.id);
    });
    return out;
  }

  function rebuildOptions(selectEl, values, current, displayFn) {
    if (!selectEl) return false;

    const cur = String(current || '').trim();
    const uniqVals = Array.from(new Set([...(values || []), cur].filter(Boolean)));

    const render = displayFn || ((v) => pretty(v));
    const nextHTML =
      ['<option value=""></option>']
        .concat(uniqVals.map(v => `<option value="${v}">${render(v)}</option>`))
        .join('');

    // Idempotent: avoid rewriting DOM if identical
    if (selectEl.innerHTML === nextHTML) return false;

    lastDomWrite = Date.now();
    selectEl.innerHTML = nextHTML;
    return true;
  }

  function setSelectTo(selectEl, value) {
    if (!selectEl) return;
    const v = String(value || '').trim();
    if (!v) { selectEl.value = ''; return; }

    // match by value first
    for (const o of Array.from(selectEl.options || [])) {
      if (String(o.value).trim() === v) { selectEl.value = o.value; return; }
    }
    // fallback match by text
    for (const o of Array.from(selectEl.options || [])) {
      if (norm(o.textContent) === norm(v)) { selectEl.value = o.value; return; }
    }
  }

  // Limit DOM scanning to canvas editor
  function canvasRoot() {
    return document.getElementById('canvas-editor') || document;
  }

  // Find selects by their label text in the same form-group
  function labelForSelect(sel) {
    if (!sel) return '';
    const wrap = sel.closest('div');
    const lbl = wrap ? wrap.querySelector('label') : null;
    return (lbl?.textContent || '').trim();
  }

  function findSelectByLabel(selects, rx) {
    return selects.find(s => rx.test(labelForSelect(s))) || null;
  }

  // ---------- Webhook binder (3 selects: event/realm/op) ----------
  const WEBHOOK_SEED = {
    events: ['assets','collections','groups','jobs','metadata','notifications','storages','users','shares'],
    realms: ['entity','metadata'],
    ops: ['create','update','delete','purge']
  };

  function bindWebhookEditor() {
    if (window.currentKind !== 'webhook') return false;

    const root = canvasRoot();
    const selects = Array.from(root.querySelectorAll('select'));
    if (selects.length < 3) return false;

    // In webhook editor, those are the 3 selects in the "Event / Realm / Operation" row.
    const eventSel = selects[0];
    const realmSel = selects[1];
    const opSel = selects[2];

    // Current webhook from localStorage by title match (best-effort)
    const title = (document.querySelector('h1')?.textContent || document.querySelector('h2')?.textContent || document.title || '').trim();
    const list = getWebhooks();
    const wh = list.find(w => w?.name && title.includes(w.name)) || list[0];
    if (!wh) return false;

    const curEvent = wh.eventType || wh.event_type || '';
    const curRealm = wh.realm || '';
    const curOp = wh.operation || '';

    const observed = {
      events: list.map(w => (w?.eventType || w?.event_type)).filter(Boolean).map(v => norm(v)),
      realms: list.map(w => w?.realm).filter(Boolean).map(v => norm(v)),
      ops: list.map(w => w?.operation).filter(Boolean).map(v => norm(v)),
    };

    const values = {
      events: Array.from(new Set([...WEBHOOK_SEED.events, ...observed.events])).filter(Boolean),
      realms: Array.from(new Set([...WEBHOOK_SEED.realms, ...observed.realms])).filter(Boolean),
      ops: Array.from(new Set([...WEBHOOK_SEED.ops, ...observed.ops])).filter(Boolean),
    };

    rebuildOptions(eventSel, values.events, norm(curEvent), v => pretty(v));
    setSelectTo(eventSel, norm(curEvent));

    rebuildOptions(realmSel, values.realms, norm(curRealm), v => pretty(v));
    setSelectTo(realmSel, norm(curRealm));

    rebuildOptions(opSel, values.ops, norm(curOp), v => pretty(v));
    setSelectTo(opSel, norm(curOp));

    return true;
  }

  // ---------- Custom Action binder (Context/Type/App/Metadata View) ----------
  function bindCustomActionEditor() {
    if (window.currentKind !== 'custom') return false;

    const root = canvasRoot();
    const selects = Array.from(root.querySelectorAll('select'));
    if (selects.length < 4) return false;

    const ctxSel  = findSelectByLabel(selects, /^context$/i);
    const typeSel = findSelectByLabel(selects, /^type$/i);
    const appSel  = findSelectByLabel(selects, /^app\s*token/i) || findSelectByLabel(selects, /^app\s*name/i);
    const mdvSel  = findSelectByLabel(selects, /^metadata\s*view/i);
    if (!ctxSel || !typeSel || !appSel || !mdvSel) return false;

    // Align label
    try {
      const lbl = appSel.closest('div')?.querySelector('label');
      if (lbl && /^app\s*token/i.test(lbl.textContent || '')) lbl.textContent = 'App name';
    } catch {}

    // Resolve current custom action from title
    const title = (document.querySelector('h1')?.textContent || document.querySelector('h2')?.textContent || document.title || '').trim();
    const list = getCustomActions();
    const ca = list.find(a => a?.title && title.includes(a.title)) || list[0];
    if (!ca) return false;

    const curContext = String(ca.context || '').trim();          // ex: BULK
    const curType    = String(ca.type || '').trim();             // ex: POST
    const curAppId   = String(ca.app_id || ca.appId || '').trim();
    const curMdvId   = String(ca.metadata_view || ca.metadataView || '').trim();

    // Context / Type values (seed + observed)
    const ctxVals = Array.from(new Set([
      'ASSET','BULK','COLLECTION','SEGMENT','METADATA',
      ...list.map(x => String(x?.context || '').trim()).filter(Boolean),
      curContext
    ].filter(Boolean)));

    const typeVals = Array.from(new Set([
      'POST','OPEN',
      ...list.map(x => String(x?.type || '').trim()).filter(Boolean),
      curType
    ].filter(Boolean)));

    rebuildOptions(ctxSel, ctxVals, curContext, v => pretty(v.toLowerCase()));
    setSelectTo(ctxSel, curContext);

    rebuildOptions(typeSel, typeVals, curType, v => pretty(v.toLowerCase()));
    setSelectTo(typeSel, curType);

    // Metadata Views: id -> name
    const viewById = getMetadataViewsById();
    const mdvIds = Array.from(new Set([...Object.keys(viewById), curMdvId].filter(Boolean)));
    rebuildOptions(mdvSel, mdvIds, curMdvId, id => viewById[String(id)] || id);
    setSelectTo(mdvSel, curMdvId);

    // Apps: id -> name (from appsData localStorage)
    const apps = getApps();
    const appsById = {};
    apps.forEach(a => { if (a?.id) appsById[String(a.id)] = (a.nom || a.name || a.id); });
    const appIds = Array.from(new Set([...Object.keys(appsById), curAppId].filter(Boolean)));
    rebuildOptions(appSel, appIds, curAppId, id => appsById[String(id)] || id);
    setSelectTo(appSel, curAppId);

    return true;
  }

  // ---------- Master bind ----------
  function bindAll() {
    if (paused()) return;

    const kind = window.currentKind || null;
    // IMPORTANT: never touch DOM when editing automations
    if (kind === 'automation' || !kind) return;

    if (bindingInProgress) return;
    bindingInProgress = true;

    try {
      if (kind === 'webhook') bindWebhookEditor();
      else if (kind === 'custom') bindCustomActionEditor();
    } finally {
      bindingInProgress = false;
    }
  }

  // Refresh on sync_done
  function refreshFromLocal() {
    try { window.chargerDonnees && window.chargerDonnees(); } catch {}
    try { window.afficherTousLesElements && window.afficherTousLesElements(); } catch {}
    try { window.mettreAJourStats && window.mettreAJourStats(); } catch {}
    try { window.renderApiPreview && window.renderApiPreview(); } catch {}
    bindAll();
  }

  bus.on((msg) => {
    if (!msg || msg.type !== 'sync_done') return;
    if (msg.payload && msg.payload.ok === false) return;
    refreshFromLocal();
  });

  // MutationObserver (debounced + ignore our own DOM writes)
  let timer = null;
  const obs = new MutationObserver(() => {
    if (paused() || bindingInProgress) return;
    if (Date.now() - lastDomWrite < 250) return;
    clearTimeout(timer);
    timer = setTimeout(bindAll, 120);
  });

  try {
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  // Initial bind
  setTimeout(bindAll, 250);
})();