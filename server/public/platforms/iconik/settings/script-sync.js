console.log('[SYNC] script-sync LOADED — 2026-06-25 14:45');
/* =======================================================================
   WFD — Sync module extracted from script-settings.js
   Extracted region: lines 5859-8006 (1-based) of original file.
   ======================================================================= */

async function syncFetchAll(base, headers, endpoint, mapper) {
  let page = 1, all = [];
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const r = await fetch(base + endpoint + sep + 'per_page=500&page=' + page, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + endpoint);
    const data = await r.json();
    const batch = mapper(data);
    all = all.concat(batch);
    // Si l'API ne retourne aucune info de pagination → une seule page
    const total = data.total_count || data.total || 0;
    const pages = data.pages || 0;
    const hasMore = pages > 1 ? page < pages : (total > 0 ? all.length < total : false);
    if (!batch.length || !hasMore || page >= 20) break;
    page++;
  }
  return all;
}

function wfdEnsureSelectFilter(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  // Déjà installé ?
  if (sel.dataset && sel.dataset.wfdFilterReady === '1') return;
  if (sel.dataset) sel.dataset.wfdFilterReady = '1';

  // Crée un input juste au-dessus du select
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filtrer…';
  input.style.cssText =
    'width:100%;margin:6px 0;padding:4px 6px;font-size:11px;' +
    'background:var(--bg2);border:1px solid var(--border2);border-radius:3px;' +
    'color:var(--text);';

  sel.parentNode.insertBefore(input, sel);

  function snapshotOptions() {
    sel._wfdAllOptions = Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent }));
  }

  function applyFilter() {
    const q = String(input.value || '').toLowerCase().trim();
    const cur = sel.value;
    const all = sel._wfdAllOptions || [];

    sel.innerHTML = '';
    for (const o of all) {
      if (!o.value || !q || String(o.text).toLowerCase().includes(q)) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        sel.appendChild(opt);
      }
    }
    if (cur) sel.value = cur;
  }

  input.addEventListener('input', applyFilter);

  // hooks appelables après remplirListe()
  sel._wfdSnapshotOptions = snapshotOptions;
  sel._wfdApplyFilter = applyFilter;

  snapshotOptions();
  applyFilter();
}

// ══ COMPAT — anciennes fonctions appelées par HTML externe ════
// (Pour que l'ancien workflow.html / automations.html ne cassent pas)
function remplirListe(id, data, key) {
  const sel = document.getElementById(id); if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Sélectionner —</option>';
  const sorted = key ? sortAlpha(data||[],key) : sortAlpha(data||[]);
  sorted.forEach(item => {
    const val = key ? item[key] : item;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = val; sel.appendChild(opt);
  });
 
  // ✅ Filtre automatique (aucun patch HTML nécessaire)
  wfdEnsureSelectFilter(id);
  if (sel._wfdSnapshotOptions) sel._wfdSnapshotOptions();
  if (sel._wfdApplyFilter) sel._wfdApplyFilter();
  if (prev) sel.value = prev;
}

// ══ INIT ═══════════════════════════════════════════════════════
// ===========================================================================
// SCOPES COMMUNS (shared par les 3 directions)
// ===========================================================================
// ── Scopes disponibles (partagés par les 3 directions) ───────────────────────
const SYNC_SCOPES = [
  { id:'all',           label:'⚡ Tout',             deps: [] },
  { id:'teams',         label:'Teams',               deps: ['collections','metadataViews'] },
  { id:'users',         label:'Users',               deps: ['teams','roleGroups'] },
  { id:'roleGroups',    label:'Role Groups',         deps: ['roles'] },
  { id:'collections',   label:'Collections',         deps: [] },
  { id:'metadataViews', label:'MD Views',            deps: [] },
  { id:'metadata',      label:'Métadonnées',         deps: ['metadataViews'] },
  { id:'savedSearches', label:'Saved Searches',      deps: ['metadataViews'] },
  { id:'relationTypes',  label:'Relation Types',       deps: [] },
  { id:'systemSettings', label:'Share Settings',        deps: [] },
  { id:'storages',      label:'Storages',            deps: [] },
  { id:'categories',    label:'Catégories',          deps: ['metadataViews'] },
  { id:'webhooks',      label:'Webhooks',            deps: [] },
  { id:'customActions', label:'Custom Actions',      deps: [] },
  { id:'automations',   label:'Automations',         deps: [] },
  { id:'exportLocations', label:'Export Locations',    deps: ['storages','teams','users'] },
];

// ── Helpers mode de synchro ───────────────────────────────────────────────────
function onModeChange(sel, warnId) {
  const warn = document.getElementById(warnId);
  if (warn) warn.style.display = sel.value === 'overwrite' ? 'block' : 'none';
}

function getSyncMode(prefix, envId) {
  const safeId = envId.replace(/[^a-zA-Z0-9_-]/g,'_');
  const sel = document.getElementById('mode-' + prefix + '-' + safeId)
    || document.getElementById('mode-' + prefix + '-' + envId);
  return sel ? sel.value : 'add_only';
}

// Applique le mode sur un ensemble d'items :
// add_only  → POST seulement si nom absent
// add_update → POST si absent, PUT si présent
// overwrite → PUT tous + DELETE ceux qui ne sont plus en source


// =======================================================
// WFD — Fetch paginé générique (Domain ↔ Domain safe)
// =======================================================
async function fetchAllPages(base, headers, endpoint, mapFn) {
  let page = 1;
  const perPage = 500;
  const out = [];
  let ep = String(endpoint || '');
  const hasPer = /(^|[?&])per_page=/.test(ep);
  const hasPage = /(^|[?&])page=/.test(ep);

  while (true) {
    let url = ep;
    const join = url.includes('?') ? '&' : '?';
    if (!hasPer) url += join + 'per_page=' + perPage;
    if (!hasPage) url += (url.includes('?') ? '&' : '?') + 'page=' + page;

    const r = await fetch(base + url, { headers }).catch(() => null);
    if (!r || !r.ok) break;

    const j = await r.json().catch(() => ({}));
    const items = j.objects || j.results || [];
    if (!items.length) break;

    out.push(...(mapFn ? items.map(mapFn) : items));
    if (items.length < perPage) break;
    page++;
  }
  return out;
}

// =======================================================
// WFD — Collections helpers (Search is source of truth)
// =======================================================
function wfdColTitle(o){
  return String((o && (o.title || o.name || o.nom)) || '').trim();
}
function wfdColParentId(o){
  const pid = o && o.parent_id ? String(o.parent_id) : '';
  if (pid) return pid;
  const inc = o && Array.isArray(o.in_collections) ? o.in_collections : [];
  return inc && inc.length ? String(inc[0]) : null;
}
async function wfdFetchAllCollectionsSearch(base, headers){
  const out = [];
  const per = 150;
  let page = 1;
  const h = Object.assign({}, headers, { 'Content-Type': 'application/json' });
  while (true) {
    const url = base + '/API/search/v1/search/?per_page=' + per + '&page=' + page;
    const r = await fetch(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ doc_types: ['collections'] })
    }).catch(() => null);
    if (!r || !r.ok) break;
    const j = await r.json().catch(() => ({}));
    const objs = (j.objects || []).filter(c =>
      (!c.status || c.status === 'ACTIVE') && !c.date_deleted
    );
    if (!j.objects?.length) break;
    out.push(...objs);
    const pages = j.pages || 0;
    if (pages && page >= pages) break;
    if (!pages && objs.length < per) break;
    page++;
    if (page > 500) break; // guard
  }
  return out;
}

// =======================================================
// WFD — Collections hydration (fallback when Search omits parent_id)
// =======================================================
async function wfdHydrateCollectionsDetails(base, headers, ids, opts){
  opts = opts || {};
  const concurrency = opts.concurrency || 10;
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const queue = (ids || []).slice();

  async function worker(){
    while(queue.length){
      const id = queue.shift();
      if(!id) continue;
      // retry up to 3
      let last = null;
      for(let attempt=1; attempt<=3; attempt++){
        const r = await fetch(base + '/API/assets/v1/collections/' + encodeURIComponent(id) + '/', { headers: headers }).catch(() => null);
        last = r;
        if(r && r.ok){
          const j = await r.json().catch(() => null);
          if(j && j.id){ out[String(j.id)] = j; }
          break;
        }
        await delay(200 * attempt);
      }
      // keep going even if failed
    }
  }

  const workers = [];
  for(let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}


async function applySyncMode(mode, srcItems, dstItems, base, headers, ep, bodyFn, keyFn, opts={}) {
  // keyFn(item) → clé de comparaison (nom normalisé)
  if (!keyFn) keyFn = o => (o.name || o.title || o.nom || '').toLowerCase();
  if (!bodyFn) bodyFn = o => o;

  const dstMap = {};
  const _pickId = (o) =>
    (o && (o.id || o.uuid || o.field_id || o.webhook_id || o.search_id || o.action_id || o._id || o.name || o.field_name)) || null;

  (dstItems || []).forEach(o => {
    const k = keyFn(o);
    if (k) dstMap[k] = o;
  });

  const srcKeys = new Set((srcItems || []).map(o => keyFn(o)));

  let created = 0, updated = 0, deleted = 0, failed = 0;
  const failures = {}; // status → count

  // ─────────────────────────────────────────────
  // Helper: log 1 sample per status (anti-spam)
  // ─────────────────────────────────────────────
  async function logFailure(r, where, url) {
    const s = r?.status || 'ERR';
    failures[s] = (failures[s] || 0) + 1;

    if (!applySyncMode._samples) applySyncMode._samples = {};
    const key = where + ':' + s;

    if (r && !r.ok && !applySyncMode._samples[key]) {
      applySyncMode._samples[key] = true;
      const txt = await r.text().catch(() => '');
      console.warn(`[applySyncMode][${where}][${s}]`, url, txt.slice(0, 600));
    }
  }

  // ─────────────────────────────────────────────
  // Helper: POST create (returns response json if possible)
  // ─────────────────────────────────────────────
  async function doPost(url, body) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) {
      created++;
      const obj = await r.json().catch(() => null);
      return { ok: true, r, obj };
    }
    failed++;
    if (r) await logFailure(r, 'POST', url);
    else {
      failures.ERR = (failures.ERR || 0) + 1;
      console.warn('[applySyncMode][POST][ERR]', url, '(fetch failed)');
    }
    return { ok: false, r, obj: null };
  }

  // ─────────────────────────────────────────────
  // Helper: PUT update (fallback to POST on 404)
  // ─────────────────────────────────────────────
  async function doPutOrPostFallback(putUrl, postUrl, body, ctx) {
    const method = opts.usePatch ? 'PATCH' : 'PUT';
    const r = await fetch(putUrl, { method, headers, body: JSON.stringify(body) }).catch(() => null);

    if (r?.ok) {
      updated++;
      return { ok: true, r, did: 'PUT', obj: null };
    }

    // If 404 => object not found on destination, fallback POST
    if (r && r.status === 404) {
      console.warn('[applySyncMode] PUT 404 → fallback POST', { ...ctx, putUrl, postUrl });
      // note: counts => this becomes a CREATE, not UPDATE
      failed++; // count the failed PUT as failed attempt
      await logFailure(r, 'PUT', putUrl);

      const postRes = await doPost(postUrl, body);
      return { ok: postRes.ok, r: postRes.r, did: 'POST_FALLBACK', obj: postRes.obj };
    }

    // Other errors: count as failed update
    failed++;
    if (r) await logFailure(r, 'PUT', putUrl);
    else {
      failures.ERR = (failures.ERR || 0) + 1;
      console.warn('[applySyncMode][PUT][ERR]', putUrl, '(fetch failed)');
    }
    return { ok: false, r, did: 'PUT', obj: null };
  }

  // Remove query from ep for write endpoints when needed
  const epWriteBase = ep.replace(/\?.*$/, ''); // e.g. '/API/assets/v1/custom_actions/'

  // ─────────────────────────────────────────────
  // UPSERT loop
  // ─────────────────────────────────────────────
  for (const src of (srcItems || [])) {
    const key = keyFn(src);
    const dst = dstMap[key];
    const isNew = !dst;
    const body = bodyFn(src, isNew);

    try {
      // CREATE (dst missing)
      if (!dst) {
        const postUrl = base + epWriteBase; // safe: ensure trailing slash is already in ep
        const { ok, obj } = await doPost(postUrl, body);

        // If created, refresh dstMap so following operations use destination id
        if (ok && obj) {
          dstMap[key] = obj;
        }
      }
      // UPDATE (only for add_update / overwrite)
      else if (mode === 'add_update' || mode === 'overwrite') {
        const dstId = _pickId(dst);

        // If we cannot pick a destination id, treat as create
        if (!dstId) {
          console.warn('[applySyncMode] dst exists but no dstId → POST', { key, dst });
          const postUrl = base + epWriteBase;
          const { ok, obj } = await doPost(postUrl, body);
          if (ok && obj) dstMap[key] = obj;
          continue;
        }

        const putUrl = base + epWriteBase + dstId + '/';
        const postUrl = base + epWriteBase;

        const ctx = { key, mode, dstId };
        const res = await doPutOrPostFallback(putUrl, postUrl, body, ctx);

        // If fallback POST created something, refresh dstMap
        if (res.ok && res.obj) {
          dstMap[key] = res.obj;
        }
      }
    } catch (e) {
      failed++;
      failures.EXCEPTION = (failures.EXCEPTION || 0) + 1;
      console.error('[WFD][applySyncMode]', e);
    }
  }

  // ─────────────────────────────────────────────
  // DELETE extras (overwrite)
  // ─────────────────────────────────────────────
  if (mode === 'overwrite') {
    for (const dst of (dstItems || [])) {
      const key = keyFn(dst);
      if (!srcKeys.has(key)) {
        const dstId = _pickId(dst);
        if (!dstId) continue;

        const delUrl = base + epWriteBase + dstId + '/';
        const r = await fetch(delUrl, { method: 'DELETE', headers }).catch(() => null);

        if (r?.ok) deleted++;
        else {
          failed++;
          if (r) await logFailure(r, 'DELETE', delUrl);
          else {
            failures.ERR = (failures.ERR || 0) + 1;
            console.warn('[applySyncMode][DELETE][ERR]', delUrl, '(fetch failed)');
          }
        }
      }
    }
  }

  return { created, updated, deleted, failed, failures };
}

async function syncViewFields(base, headers) {
  if (!metadataViewsData || !Array.isArray(metadataViewsData.metadataViews)) return;

  // container (persisté)
  if (!metadataViewsData.viewFieldsById) metadataViewsData.viewFieldsById = {};

  const views = metadataViewsData.metadataViews.filter(v => v && v.id);
  const BATCH = 8;

  const norm = window.WFD_Mappers && window.WFD_Mappers.normalizeViewFields
    ? window.WFD_Mappers.normalizeViewFields
    : null;

  for (let i = 0; i < views.length; i += BATCH) {
    const chunk = views.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      chunk.map(v =>
        fetch(base + '/API/metadata/v1/views/' + encodeURIComponent(v.id) + '/', { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(j => ({ id: v.id, name: v.name || v.id, view: j }))
      )
    );

    for (const r of results) {
      const item = r.value;
      const j = item && item.view;
      if (!j || !Array.isArray(j.view_fields)) continue;

      // ✅ central mapper (keeps separators + overrides)
      metadataViewsData.viewFieldsById[item.id] = norm
        ? norm(j.view_fields)
        : j.view_fields; // fallback brut si mappers pas chargé
    }
  }

  // (DB) localStorage.setItem('metadataViewsData', JSON.stringify(metadataViewsData));
}

async function syncAclsStoragesToTeams(base, headers) {
  // Pré-requis Teams (ACL = group_id)
  if (!Array.isArray(teamsData.teams) || teamsData.teams.length === 0) {
    console.warn('[WFD] Skip ACLs Storages: no teams loaded');
    return;
  }

  // Pré-requis Storages (liste au moins)
  if (!Array.isArray(storagesData.storages) || storagesData.storages.length === 0) {
    console.warn('[WFD] Skip ACLs Storages: no storages loaded');
    return;
  }

  // Index teams par ID
  const teamById = {};
  (teamsData.teams || []).forEach(t => { if (t?.id) teamById[t.id] = t; });

  // Index storages par ID
  const stById = {};
  (storagesData.storages || []).forEach(s => { if (s?.id) stById[s.id] = s; });

  // Reset (rebuild propre)
  (teamsData.teams || []).forEach(t => { if (!Array.isArray(t.storages)) t.storages = []; });
  Object.values(stById).forEach(s => { s.teams = []; });

  const BATCH = 12;
  const stList = (storagesData.storages || []).filter(s => s && s.id);

  for (let i = 0; i < stList.length; i += BATCH) {
    const chunk = stList.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      chunk.map(s =>
        fetch(base + '/API/acls/v1/acl/storages/' + s.id + '/', { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(data => ({ st: s, data }))
      )
    );

    for (const res of results) {
      if (!res.value?.data || typeof res.value.data !== 'object') continue;

      const { st, data: aclData } = res.value;
      const stObj = stById[st.id] || st;
      const stName = stObj.nom || stObj.name || stObj.id;

      // ACL schema standard : groups_acl / inherited_groups_acl / propagating_groups_acl [1]
      const entries = [
        ...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' })),
        ...(aclData.inherited_groups_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
        ...(aclData.propagating_groups_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
      ];

      for (const ga of entries) {
        // Team (ou stub si group_id inconnu)
        let team = teamById[ga.group_id];
        if (!team) {
          team = {
            id: ga.group_id,
            nom: ga.group_id,
            name: ga.group_id,
            collections: [],
            vues: [],
            savedSearches: [],
            storages: [],
            users: [],
            source: 'acl_stub',
            raw: { acl_stub: true, group_id: ga.group_id }
          };
          teamsData.teams.push(team);
          teamById[ga.group_id] = team;
        }

        const p = (ga.permissions || []).map(x => String(x).toLowerCase());
        const perm = (p.includes('write') || p.includes('delete') || p.includes('change-acl'))
          ? 'Read & Write'
          : 'Read Only';
        const flags = [...p];
        if (ga._origin) flags.push(ga._origin);

        // Storage → Teams (NORMALISÉ)
        if (!Array.isArray(stObj.teams)) stObj.teams = [];
        if (!stObj.teams.some(x => x.id === team.id)) {
          stObj.teams.push({
            id: team.id,
            nom: team.nom || team.name || team.id,
            permission: perm,
            permission_flags: flags
          });
        }

        // Team → Storages (inverse NORMALISÉ)
        if (!Array.isArray(team.storages)) team.storages = [];
        if (!team.storages.some(x => x.id === stObj.id)) {
          team.storages.push({
            id: stObj.id,
            nom: stName,
            permission: perm,
            permission_flags: flags
          });
        }
      }
    }
  }

  // Persist
  // (DB) localStorage.setItem('storagesData', JSON.stringify(storagesData));
  // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
}

// ── Toggle connexion environnement ───────────────────────────────────────────
function toggleEnvEnabled(nom) {
  const t = appTokensData.appTokens.find(t => t.name === nom);
  if (!t) return;
  // enabled vaut undefined (actif) ou true (actif) ou false (désactivé)
  t.enabled = (t.enabled === false) ? true : false;
  sauvegarderDonnees();
  // Rafraîchir le panneau détail
  const body = document.getElementById('set-detail-body');
  if (body && currentItem === nom) body.innerHTML = detailAppToken(nom);
  toast(t.enabled === false ? 'Connexion désactivée' : 'Connexion activée');
}


function buildScopeChecks(prefix, envId) {
  // Règles par direction
  // - ds : lecture → on peut garder "all" coché par défaut
  // - sd/dd : écriture → "all" décoché par défaut, et exclusions/valeurs par défaut
  const isWrite = (prefix === 'sd' || prefix === 'dd');

  // Scopes autorisés par direction
  const allowed = new Set(SYNC_SCOPES.map(s => s.id));
  if (isWrite) {
  allowed.delete('users');     // Users = A (audit DS only)
  allowed.delete('storages');  // Storages entité = hors core en écriture (ACLs restent gérées ailleurs)
  }


  // Defaults par direction
  const defaultAllChecked = (!isWrite); // ds: true, sd/dd: false
  const defaultChecked = new Set();
  if (!isWrite) {
    // ds : tout (via all) suffit, pas besoin de pré-cocher individuellement
  } else {
    // sd/dd : par défaut, rien (sécurité)
    // Storages = B mais désactivé par défaut => surtout PAS coché
  }

  return SYNC_SCOPES
    .filter(s => allowed.has(s.id))
    .map(s => {
      const hasDeps = s.deps && s.deps.length > 0;
      const depBadge = hasDeps
        ? ` <span style="font-size:9px;color:var(--text-dim);">(incl. ${s.deps.join(', ')})</span>`
        : '';

      // all : coché uniquement sur ds
      const checked =
        (s.id === 'all')
          ? (defaultAllChecked ? 'checked' : '')
          : (defaultChecked.has(s.id) ? 'checked' : '');

      // Petit badge visuel "off par défaut" pour storages en écriture
      const offByDefaultBadge =
        (isWrite && s.id === 'storages')
          ? ` <span style="font-size:9px;color:var(--text-dim);">(désactivé par défaut)</span>`
          : '';

      const safeId = envId.replace(/[^a-zA-Z0-9_-]/g,'_');
      return `
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
          <input type="checkbox"
            class="scope-${prefix}-${safeId}"
            value="${s.id}"
            ${checked}
            onchange="onScopeChange(this,'${prefix}','${envId}')">
          ${s.label}${depBadge}${offByDefaultBadge}
        </label>
      `;
    })
    .join('');
}

// ── Adaptive detail height (désactivé : on bascule tout sur la feuille settings.css) ──
function ensureAdaptiveStyle() {
  // On n'injecte plus de CSS inline : settings.css contient désormais
  // #set-detail-body.center-short, .detail-section.flexible, etc.
  return;
}
// === AUTO-LAYOUT CARTES =======================================================
// - Marque automatiquement en ".flexible" les cartes "longues"
// - Laisse les cartes "courtes" en taille naturelle
// - Recalcule sur rendu, resize et mutations de contenu
(function(){
  const THRESH_SHORT = 240;   // px — en dessous, on considère la carte "courte"
  const LONG_FACTOR  = 1.15;  // hysteresis pour éviter les bascules inutiles
  let _ro, _mo, _timer;

  function isLong(bodyEl){
    const h = bodyEl ? bodyEl.scrollHeight : 0;
    return h > THRESH_SHORT * LONG_FACTOR;
  }

  function applyAutoLayout(){
    const canvas = document.getElementById('set-detail-body');
    if (!canvas) return;
    const sections = [...canvas.querySelectorAll('.detail-section')];
    if (!sections.length) return;

    // reset
    sections.forEach(sec => sec.classList.remove('flexible'));

    // séparer "longues" / "courtes"
    const long = [], short = [];
    sections.forEach(sec => {
      const body = sec.querySelector('.detail-section-body');
      (isLong(body) ? long : short).push(sec);
    });

    // s'il n'y a "aucune longue", désigner au moins la plus grande
    if (long.length === 0 && sections.length) {
      const biggest = sections
        .map(sec => ({ sec, h: (sec.querySelector('.detail-section-body')?.scrollHeight || 0) }))
        .sort((a,b)=>b.h-a.h)[0]?.sec;
      if (biggest) long.push(biggest);
    }

    // appliquer l'état flexible aux longues → partage équitable + mini-scroll interne
    long.forEach(sec => sec.classList.add('flexible'));
  }

  function schedule(){ clearTimeout(_timer); _timer = setTimeout(applyAutoLayout, 50); }

  function bindObservers(){
    const canvas = document.getElementById('set-detail-body');
    if (!canvas || canvas._al_bound) return;
    canvas._al_bound = true;

    // resize canvas + bodies
    _ro = new ResizeObserver(() => schedule());
    _ro.observe(canvas);
    [...canvas.querySelectorAll('.detail-section-body')].forEach(b => _ro.observe(b));

    // mutations DOM dans le canvas
    _mo = new MutationObserver(() => schedule());
    _mo.observe(canvas, { childList: true, subtree: true });
  }

  // expose une petite API
  window._autoLayoutCards = { schedule, applyNow: applyAutoLayout };
  window._autoLayoutBind  = function(){
    const canvas = document.getElementById('set-detail-body');
    if (!canvas) return;
    if (_ro) [...canvas.querySelectorAll('.detail-section-body')].forEach(b => _ro.observe(b));
    schedule();
  };

  // boot
  document.addEventListener('DOMContentLoaded', () => {
    bindObservers();
    schedule();
    window.addEventListener('resize', schedule);
  });
})();

function onScopeChange(cb, prefix, envId) {
  const cls = 'scope-' + prefix + '-' + envId;

  const allCb = document.querySelector('.' + cls + '[value="all"]');
  const allBoxes = Array.from(document.querySelectorAll('.' + cls));

  // Helper : cocher une checkbox par value
  const setChecked = (val, checked) => {
    const el = document.querySelector('.' + cls + '[value="' + val + '"]');
    if (el) el.checked = checked;
    return el;
  };

  // ── 1) Si on coche "all" : cocher TOUS les scopes (visuel + logique)
  if (cb.value === 'all' && cb.checked) {
    allBoxes.forEach(c => {
      if (c.value !== 'all') {
        c.checked = true;
        // reset des hints visuels (on ne force pas les deps ici, tout est coché)
        if (c.parentElement) {
          c.parentElement.style.opacity = '';
          c.parentElement.title = '';
        }
      }
    });
    return;
  }

  // ── 2) Si on décoche "all" : ne rien forcer, on laisse l'utilisateur choisir
  if (cb.value === 'all' && !cb.checked) {
    return;
  }

  // ── 3) Si on coche un scope individuel : décocher "all"
  if (cb.checked && cb.value !== 'all') {
    if (allCb) allCb.checked = false;
  }

  // ── 4) Auto-cocher les dépendances quand on coche un scope
  if (cb.checked) {
    const scope = SYNC_SCOPES.find(s => s.id === cb.value);
    if (scope && scope.deps && scope.deps.length > 0) {
      scope.deps.forEach(depId => {
        const depCb = setChecked(depId, true);
        if (depCb && depCb.parentElement) {
          depCb.parentElement.style.opacity = '0.7';
          depCb.parentElement.title = 'Dépendance auto-ajoutée';
        }
      });
    }
  }

  // ── 5) Si on décoche un scope : s'assurer que "all" est décoché
  if (!cb.checked) {
    if (allCb) allCb.checked = false;
  }
}

  function getCheckedScopes(prefix, envId) {
  const safeEnvId = envId.replace(/[^a-zA-Z0-9_-]/g,'_');
  const cls = 'scope-' + prefix + '-' + safeEnvId;
  const boxes = [...document.querySelectorAll('.' + cls)];
  const checked = boxes.filter(c => c.checked).map(c => c.value);

  // Si "all" est coché, on retourne ['all'] pour que le serveur utilise SCOPE_ORDER complet
  if (checked.includes('all')) {
    return ['all'];
  }

  return checked;
}

function renderSyncUI(nomCourant) {
  const t      = appTokensData.appTokens.find(x => x.name === nomCourant);
  const autres = appTokensData.appTokens.filter(x => x.name !== nomCourant && x.enabled !== false);
  const envId  = nomCourant.replace(/[^a-z0-9]/gi, '_');

  // ── Section 1 : Domaine → Site ──────────────────────────────────────────
const s1 = `
  <div style="background:var(--bg3);border-radius:5px;padding:10px;margin-bottom:8px;">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px;">
      Domaine → Site
      <span style="font-size:10px;font-weight:400;color:var(--text-dim);margin-left:6px;">lecture Iconik, écrit localement</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:10px;color:var(--text-dim);white-space:nowrap;">Mode :</span>
      <select id="mode-ds-${escHtml(envId)}"
        style="font-size:11px;padding:3px 7px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;"
        onchange="onModeChange(this,'mode-ds-${escHtml(envId)}-warn')">
        <option value="add_only">➕ Ajouter uniquement</option>
        <option value="add_update">🔄 Ajouter + Mettre à jour</option>
        <option value="overwrite">⚠️ Écraser tout</option>
      </select>

      <div id="mode-ds-${escHtml(envId)}-warn"
        style="display:none;font-size:10px;color:var(--c-danger);padding:3px 7px;background:rgba(231,76,60,.07);border:1px solid rgba(231,76,60,.2);border-radius:3px;white-space:nowrap;">
        Supprimera les éléments absents de la source
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:10px;">
      ${buildScopeChecks('ds', envId)}
    </div>

    <!-- ✅ Toggle Teams système -->
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-teams-ds-${escHtml(envId)}"
          ${wfdIncludeSystemTeams() ? 'checked' : ''}
          onchange="
            wfdSetIncludeSystemTeams(this.checked);
            if (window.currentEntity === 'teams') {
              renderListe(document.getElementById('set-list-search')?.value || '');
            }
          ">
        Inclure les teams système (Everyone / Administrator)
      </label>
    </div>

    <!-- ✅ Toggle Categories système src/dst -->
    <div style="margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-cats-src-ds-${escHtml(envId)}"
          ${wfdIncludeSystemCategories() ? 'checked' : ''}
          onchange="wfdSetIncludeSystemCategories(this.checked);document.getElementById('toggle-sys-cats-dst-ds-${escHtml(envId)}').checked=this.checked;if(window.currentEntity==='categories')renderListe(document.getElementById('set-list-search')?.value||'');">
        Inclure catégories système
      </label>
      <input type="hidden" id="toggle-sys-cats-dst-ds-${escHtml(envId)}" value="${wfdIncludeSystemCategories() ? '1' : '0'}">
    </div>

    <!-- ✅ Toggle Metadata Views système -->
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-mdv-ds-${escHtml(envId)}"
          ${wfdIncludeSystemMetadataViews() ? 'checked' : ''}
          onchange="
            wfdSetIncludeSystemMetadataViews(this.checked);
            if (window.currentEntity === 'metadataViews') {
              renderListe(document.getElementById('set-list-search')?.value || '');
            }
          ">
        Inclure les Metadata Views système (Segment Tags)
      </label>
    </div>

    <button onclick="lancerDomaineSite('${escJs(nomCourant)}','${escJs(envId)}')"
      class="assoc-add-btn" style="width:100%;justify-content:center;padding:6px;">
      Synchroniser Domaine → Site
    </button>

    <div id="ds-status-${escHtml(envId)}"
      style="font-size:11px;color:var(--text-dim);min-height:14px;margin-top:6px;line-height:1.6;">
    </div>
  </div>`;

  // ── Section 2 : Site → Domaine ──────────────────────────────────────────
// ── Section 2 : Site → Domaine ──────────────────────────────────────────
const safeEnvId = envId.replace(/[^a-zA-Z0-9_-]/g,'_');
const s2 = `
  <div style="background:var(--bg3);border-radius:5px;padding:10px;margin-bottom:8px;">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px;">
      Site → Domaine
      <span style="font-size:10px;font-weight:400;color:var(--text-dim);margin-left:6px;">pousse config locale vers Iconik</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:10px;color:var(--text-dim);white-space:nowrap;">Mode :</span>
      <select id="mode-sd-${safeEnvId}"
        style="font-size:11px;padding:3px 7px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;"
        onchange="onModeChange(this,'mode-sd-${safeEnvId}-warn')">
        <option value="add_only">➕ Ajouter uniquement</option>
        <option value="add_update">🔄 Ajouter + Mettre à jour</option>
        <option value="overwrite">⚠️ Écraser tout</option>
      </select>
      <div id="mode-sd-${safeEnvId}-warn"
        style="display:none;font-size:10px;color:var(--c-danger);padding:3px 7px;background:rgba(231,76,60,.07);border:1px solid rgba(231,76,60,.2);border-radius:3px;white-space:nowrap;">
        Supprimera les éléments absents de la source
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:10px;">
      ${buildScopeChecks('sd', envId)}
    </div>

    <!-- ✅ Toggle Teams système -->
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-teams-sd-${safeEnvId}"
          ${wfdIncludeSystemTeams() ? 'checked' : ''}
          onchange="
            wfdSetIncludeSystemTeams(this.checked);
            if (window.currentEntity === 'teams') {
              renderListe(document.getElementById('set-list-search')?.value || '');
            }
          ">
        Inclure les teams système (Everyone / Administrator)
      </label>
    </div>

    <!-- ✅ Toggle Categories système src/dst -->
    <div style="margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-cats-src-sd-${safeEnvId}"
          ${wfdIncludeSystemCategories() ? 'checked' : ''}
          onchange="wfdSetIncludeSystemCategories(this.checked);document.getElementById('toggle-sys-cats-dst-sd-${safeEnvId}').checked=this.checked;if(window.currentEntity==='categories')renderListe(document.getElementById('set-list-search')?.value||'');">
        Inclure catégories système
      </label>
      <input type="hidden" id="toggle-sys-cats-dst-sd-${safeEnvId}" value="${wfdIncludeSystemCategories() ? '1' : '0'}">
    </div>

    <!-- ✅ Toggle Metadata Views système -->
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
        <input type="checkbox"
          id="toggle-sys-mdv-sd-${safeEnvId}"
          ${wfdIncludeSystemMetadataViews() ? 'checked' : ''}
          onchange="
            wfdSetIncludeSystemMetadataViews(this.checked);
            if (window.currentEntity === 'metadataViews') {
              renderListe(document.getElementById('set-list-search')?.value || '');
            }
          ">
        Inclure les Metadata Views système (Segment Tags)
      </label>
    </div>

    <button onclick="lancerSiteDomaine('${escJs(nomCourant)}','${escJs(envId)}')"
      class="assoc-add-btn" style="width:100%;justify-content:center;padding:6px;">
      Pousser Site → Domaine
    </button>

    <div id="sd-status-${safeEnvId}"
      style="font-size:11px;color:var(--text-dim);min-height:14px;margin-top:6px;line-height:1.6;">
    </div>
  </div>`;

  // ── Section 3 : Domaine ↔ Domaine ──────────────────────────────────────
  let s3;
  if (!autres.length) {
    s3 = `<div style="background:var(--bg3);border-radius:5px;padding:10px;font-size:11px;color:var(--text-dim);">
      Ajoutez un second environnement pour activer la sync inter-domaines.
    </div>`;
  } else {
    const opts = autres.map(x => {
      const badge = x.environment==='prod'?'[PROD]':x.environment==='qa'?'[QA]':'[DEV]';
      return `<option value="${escHtml(x.name)}">${badge} ${escHtml(x.name)}</option>`;
    }).join('');
    
s3 = `
    <div style="background:var(--bg3);border-radius:5px;padding:10px;">
      <div style="font-size:11px;font-weight:600;margin-bottom:8px;">
        Domaine ↔ Domaine
        <span style="font-size:10px;font-weight:400;color:var(--text-dim);margin-left:6px;">entre deux environnements</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 32px 1fr;align-items:center;gap:6px;margin-bottom:10px;">
        <div>
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">Source</div>
          <div style="font-size:12px;font-weight:600;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(nomCourant)}
          </div>
        </div>
        <div style="text-align:center;">
          <button id="dd-dir-${escHtml(envId)}" data-rev="0" onclick="toggleDDDir('${escJs(envId)}')"
            style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-dim);padding:2px;" title="Inverser">→</button>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">Cible</div>
          <select id="dd-target-${escHtml(envId)}"
            style="width:100%;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);"
            onchange="onDDTargetChange('${escJs(envId)}',this.value)">${opts}</select>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:10px;color:var(--text-dim);white-space:nowrap;">Mode :</span>
        <select id="mode-dd-${escHtml(envId)}"
          style="font-size:11px;padding:3px 7px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;"
          onchange="onModeChange(this,'mode-dd-${escHtml(envId)}-warn')">
          <option value="add_only">➕ Ajouter uniquement</option>
          <option value="add_update">🔄 Ajouter + Mettre à jour</option>
          <option value="overwrite">⚠️ Écraser tout</option>
        </select>
        <div id="mode-dd-${escHtml(envId)}-warn" style="display:none;font-size:10px;color:var(--c-danger);padding:3px 7px;background:rgba(231,76,60,.07);border:1px solid rgba(231,76,60,.2);border-radius:3px;white-space:nowrap;">
          Supprimera les éléments absents de la source
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:10px;">
        ${buildScopeChecks('dd', envId)}
      </div>

      <!-- ✅ Toggle Teams système -->
      <div style="margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
          <input type="checkbox"
            id="toggle-sys-teams-dd-${escHtml(envId)}"
            ${wfdIncludeSystemTeams() ? 'checked' : ''}
            onchange="
              wfdSetIncludeSystemTeams(this.checked);
              if (window.currentEntity === 'teams') {
                renderListe(document.getElementById('set-list-search')?.value || '');
              }
            ">
          Inclure les teams système (Everyone / Administrator)
        </label>
      </div>

      <!-- ✅ Toggle Categories système src/dst -->
      <div style="margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
          <input type="checkbox"
            id="toggle-sys-cats-src-dd-${escHtml(envId)}"
            ${wfdIncludeSystemCategories() ? 'checked' : ''}
            onchange="wfdSetIncludeSystemCategories(this.checked);if(window.currentEntity==='categories')renderListe(document.getElementById('set-list-search')?.value||'');">
          Inclure catégories système <strong>source</strong>
        </label>
        <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
          <input type="checkbox"
            id="toggle-sys-cats-dst-dd-${escHtml(envId)}"
            ${wfdIncludeSystemCategories() ? 'checked' : ''}>
          Inclure catégories système <strong>destination</strong>
        </label>
      </div>

      <!-- ✅ Toggle Metadata Views système -->
      <div style="margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer;color:var(--text-dim);">
          <input type="checkbox"
            id="toggle-sys-mdv-dd-${escHtml(envId)}"
            ${wfdIncludeSystemMetadataViews() ? 'checked' : ''}
            onchange="
              wfdSetIncludeSystemMetadataViews(this.checked);
              if (window.currentEntity === 'metadataViews') {
                renderListe(document.getElementById('set-list-search')?.value || '');
              }
            ">
          Inclure les Metadata Views système (Segment Tags)
        </label>
      </div>

      <div id="dd-warn-${escHtml(envId)}" style="display:none;margin-bottom:8px;padding:8px 10px;
        background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.3);border-radius:5px;">
        <div style="font-size:12px;font-weight:700;color:var(--c-danger);margin-bottom:3px;">⚠ CIBLE = PRODUCTION</div>
        <div style="font-size:11px;color:var(--c-danger);">Cette opération est irréversible. Confirmez avant de continuer.</div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;">
          <input type="checkbox" id="dd-confirm-${escHtml(envId)}">
          <span style="font-size:11px;color:var(--c-danger);font-weight:600;">Je confirme l'écriture sur la Production</span>
        </label>
      </div>

      <button id="wfd-sync-progress-anchor" onclick="lancerDomaineDomaine('${escJs(nomCourant)}','${escJs(envId)}')"
        class="assoc-add-btn" style="width:100%;justify-content:center;padding:6px;">
        Lancer la synchronisation inter-domaines
      </button>

      <div id="dd-status-${escHtml(envId)}" style="font-size:11px;color:var(--text-dim);min-height:14px;margin-top:6px;line-height:1.6;"></div>
    </div>`;
}

  return s1 + s2 + s3;
}

// ─── Helpers direction DD ─────────────────────────────────────────────────────
function toggleDDDir(envId) {
  const btn = document.getElementById('dd-dir-'+envId);
  if (!btn) return;
  const rev = btn.dataset.rev === '1';
  btn.dataset.rev = rev ? '0' : '1';
  btn.textContent = rev ? '→' : '←';
  toast(rev ? 'Source → Cible' : 'Cible → Source');
}
function onDDTargetChange(envId, name) {
  const t = appTokensData.appTokens.find(x => x.name === name);
  const w = document.getElementById('dd-warn-'+envId);
  if (w) w.style.display = (t && t.environment==='prod') ? 'block' : 'none';
}

// ─── syncIconik : Pull un scope depuis Iconik → localStorage ─────────────────
// Reconstituée depuis le monolithe _Monolith_script-settings.js
async function syncIconik(nom, scope) {
  const token = appTokensData.appTokens.find(t => t.name === nom || t.nom === nom);
  if (!token) { toast('Token introuvable', true); return; }

  const base    = _ikBase(token);
  const headers = {};

  // ── 1) COLLECTIONS ────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'collections') {
    const rawCols = await wfdFetchAllCollectionsSearch(base, { ...headers, 'Content-Type': 'application/json' });
    // Normaliser : extraire nom/name depuis title (format brut Iconik search)
    const colById = {};
    rawCols.forEach(c => { if (c?.id) colById[c.id] = c; });
    function buildColPathDS(id, depth=0) {
      if (depth > 25) return id;
      const c = colById[id];
      if (!c) return id;
      const name = (c.title || c.name || c.nom || id).trim();
      const pid = c.parent_id || (Array.isArray(c.in_collections) && c.in_collections[0]) || null;
      if (!pid || !colById[pid]) return name;
      return buildColPathDS(pid, depth+1) + ' / ' + name;
    }
    const pathCache = {};
    function getColPath(id) {
      if (pathCache[id]) return pathCache[id];
      return (pathCache[id] = buildColPathDS(id));
    }
    collectionsData.collections = rawCols.map(c => {
      const name = (c.title || c.name || c.nom || c.id || '').trim();
      // Élagage volontaire : on ne garde que les champs utilisés par la sync
      // pour éviter le quota localStorage sur les grandes instances PROD
      return {
        id:             c.id,
        title:          c.title          || '',
        name,
        nom:            name,
        parent_id:      c.parent_id      || null,
        in_collections: Array.isArray(c.in_collections) ? c.in_collections : [],
        date_deleted:   c.date_deleted   || null,
        status:         c.status         || '',
        storage_id:     c.storage_id     || null,
        external_id:    c.external_id    || null,
        is_root:        c.is_root        || false,
        object_type:    c.object_type    || 'collection',
        _path:          getColPath(c.id),
      };
    });
    // (DB) localStorage.setItem('collectionsData', JSON.stringify(collectionsData));
  }

  // ── 2) METADATA VIEWS ─────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'metadataViews') {
    metadataViewsData.metadataViews = await syncFetchAll(
      base, headers,
      '/API/metadata/v1/views/?per_page=500',
      r => (r.objects || []).map(v => ({ id: v.id, name: v.name || v.id }))
    );
    // (DB) localStorage.setItem('metadataViewsData', JSON.stringify(metadataViewsData));
    await syncViewFields(base, headers);
  }

  // ── 3) METADATA FIELDS ────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'metadata') {
    const prevById = {};
    (metadonneesData.metadonnees || []).forEach(m => { if (m?.id) prevById[m.id] = m; });

    const mapFieldTypeToUI = (t) => {
      const x = String(t || '').toLowerCase();
      if (['string', 'string_exact'].includes(x)) return 'Text';
      if (['text','textarea','multiline'].includes(x)) return 'Text Area';
      if (['integer','int','long'].includes(x)) return 'Integer';
      if (['float','double','number','decimal'].includes(x)) return 'Float';
      if (['boolean','bool'].includes(x)) return 'Yes/No';
      if (['date'].includes(x)) return 'Date';
      if (['datetime','timestamp','datetimeutc'].includes(x)) return 'Datetime';
      if (['dropdown','select','choice','choices','enum','picklist','single_select','single-select','list'].includes(x)) return 'Dropdown';
      if (['tag','tags','tag_cloud','tagcloud','labels','label'].includes(x)) return 'Tag Cloud';
      if (['email','mail'].includes(x)) return 'Email';
      if (['url','link','uri'].includes(x)) return 'Url';
      return '';
    };
    const extractMultiSelect = (f) => {
      if (typeof f?.multi === 'boolean') return !!f.multi;
      const o = (f && typeof f === 'object' && !Array.isArray(f)) ? (f.options || {}) : {};
      return !!(o.multiselect || o['multi_select'] || o['is_multi_value'] || o['is_array'] || (o.cardinality > 1));
    };
    const extractValues = (f) => {
      if (Array.isArray(f?.options)) return f.options.map(c => (typeof c==='string'?c:(c.label||c.value||c.name||c.key||''))).filter(Boolean);
      const o = (f && typeof f === 'object' && !Array.isArray(f)) ? (f.options || {}) : {};
      const choices = o.options || o.choices || f?.allowed_values || f?.values || [];
      return Array.isArray(choices) ? choices.map(c => (typeof c==='string'?c:(c.label||c.value||c.name||c.key||''))).filter(Boolean) : [];
    };

    metadonneesData.metadonnees = await syncFetchAll(
      base, headers,
      '/API/metadata/v1/fields/?per_page=500',
      r => (r.objects || []).map(f => {
        let typeUI = mapFieldTypeToUI(f.field_type);
        if (!typeUI) {
          if (Array.isArray(f?.options) && f.options.length) typeUI = 'Dropdown';
          else if (typeof f?.multi === 'boolean') typeUI = 'Dropdown';
        }
        const M = window.WFD_Mappers;
        const mapped = (M && typeof M.mapMetadataField === 'function')
          ? M.mapMetadataField(f, typeUI, extractMultiSelect, extractValues)
          : {
              id: f.id, nom: f.name, name: f.name, label: f.label || '',
              type: typeUI || f.field_type || '', field_type: f.field_type || '',
              multi: extractMultiSelect(f), multiselect: extractMultiSelect(f),
              required: !!f.required, read_only: !!f.read_only,
              description: f.description || '',
              valeurs: extractValues(f), options: f.options || [],
              metadataViews: [], metadataView: null,
            };
        // Forcer nom/name = f.name (identifiant technique Iconik)
        // indépendamment de ce que WFD_Mappers a pu stocker (il met parfois le label)
        mapped.nom   = f.name;
        mapped.name  = f.name;
        mapped.label = f.label || mapped.label || '';
        // Merge WFD-only
        const prev = prevById[mapped.id];
        if (prev) {
          if (mapped.default_value == null && prev.default_value != null) mapped.default_value = prev.default_value;
          if (mapped.wfd_notes == null && prev.wfd_notes != null) mapped.wfd_notes = prev.wfd_notes;
        } else {
          if (mapped.default_value == null) mapped.default_value = null;
          if (mapped.wfd_notes == null) mapped.wfd_notes = null;
        }
        return mapped;
      })
    );
    // (DB) localStorage.setItem('metadonneesData', JSON.stringify(metadonneesData));
    await _syncViewsToMetadata(base, headers);
    // (DB) localStorage.setItem('metadonneesData', JSON.stringify(metadonneesData));
  }

  // ── 4) ROLE GROUPS ────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'roleGroups') {
    const rgObjects = await syncFetchAll(base, headers, '/API/users/v1/role_groups/?per_page=500', r => r.objects || []);
    const existingByName = {};
    (roleGroupsData.roleGroups || []).forEach(rg => { existingByName[(rg.nom||rg.name||'').toLowerCase()] = rg; });

    roleGroupsData.roleGroups = rgObjects.map(rg => {
      const key   = (rg.name || '').toLowerCase();
      const local = existingByName[key] || {};
      const rc    = rg.role_categories || {};
      const fonctionnalites = Object.entries(rc)
        .filter(([, active]) => active === true)
        .map(([k]) => ROLE_CAT_LABELS[k] || k)
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

      const rolesSlugs = rg.roles || local.roles || [];
      const itemsMap = {};
      rolesSlugs.forEach(slug => {
        const itemKey = SLUG_TO_CATALOG_KEY[slug];
        if (!itemKey) return;
        if (!itemsMap[itemKey]) itemsMap[itemKey] = { id: itemKey, nom: ICONIK_ITEMS_CATALOG[itemKey]?.label || itemKey, permissions: [], slugs: [] };
        const permLabel = slugToPermLabel(slug);
        if (!itemsMap[itemKey].permissions.includes(permLabel)) itemsMap[itemKey].permissions.push(permLabel);
        if (!itemsMap[itemKey].slugs.includes(slug)) itemsMap[itemKey].slugs.push(slug);
      });
      const assignations = Object.values(itemsMap).map(item => ({
        role: fonctionnalites[0] || 'Core Functionality',
        permissions: item.permissions, slugs: item.slugs
      }));

      return {
        id: rg.id, nom: rg.name || local.nom || '', name: rg.name || '',
        roles: rolesSlugs, fonctionnalites, role_categories: rc, assignations,
        ...Object.fromEntries(Object.entries(local).filter(([k]) =>
          !['id','nom','name','roles','fonctionnalites','role_categories','assignations'].includes(k)
        )),
      };
    });

    rolesData.roles = Object.values(ROLE_CAT_LABELS).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    // Peupler itemsAdvancedData depuis les permissions réelles
    const globalItemsMap = {};
    roleGroupsData.roleGroups.forEach(rg => {
      const rc = rg.role_categories || {};
      Object.entries(rc).filter(([, v]) => v === true).forEach(([catKey]) => {
        const rolLabel = ROLE_CAT_LABELS[catKey] || catKey;
        (rg.roles || []).forEach(slug => {
          const itemKey = SLUG_TO_CATALOG_KEY[slug];
          if (!itemKey || !ICONIK_ITEMS_CATALOG[itemKey]) return;
          if (!globalItemsMap[itemKey]) globalItemsMap[itemKey] = { id: itemKey, nom: ICONIK_ITEMS_CATALOG[itemKey].label, permissionsDisponibles: ICONIK_ITEMS_CATALOG[itemKey].perms, assignations: [] };
          let assign = globalItemsMap[itemKey].assignations.find(a => a.role === rolLabel);
          if (!assign) { assign = { role: rolLabel, permissions: [], slugs: [] }; globalItemsMap[itemKey].assignations.push(assign); }
          const permLabel = slugToPermLabel(slug);
          if (!assign.permissions.includes(permLabel)) assign.permissions.push(permLabel);
          if (!assign.slugs.includes(slug)) assign.slugs.push(slug);
        });
      });
    });
    itemsAdvancedData.items = Object.values(globalItemsMap).filter(i => i.assignations.length > 0).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

    // (DB) roleGroupsData, rolesData, itemsAdvancedData — en mémoire uniquement
  }

  // ── 5) TEAMS (liste + ACLs Collections + ACLs MDViews + ACLs Saved Searches) ─
  if (scope === 'all' || scope === 'teams') {
    // Source /groups avec fallback silencieux sur 403
    let groupsApi = [];
    try {
      groupsApi = await syncFetchAll(base, headers, '/API/users/v1/groups/?per_page=500', r => r.objects || []);
    } catch (e) {
      if (String(e?.message||'').includes('HTTP 403')) groupsApi = [];
      else throw e;
    }

    // Source canonique /teams
    let teamsApi = [], teamsFrom = 'teams';
    try {
      teamsApi = await syncFetchAll(base, headers, '/API/users/v1/teams/?per_page=500', r => r.objects || []);
    } catch (_) { teamsApi = []; }

    if (!teamsApi.length) {
      teamsFrom = 'groups(team-only)';
      teamsApi = (groupsApi || []).filter(g => String(g?.group_type||'').toUpperCase().trim() === 'TEAM');
    }

    const M = window.WFD_Mappers;
    teamsData.teams = (teamsApi || []).map(t => {
      const obj = (M && typeof M.mapTeam === 'function')
        ? M.mapTeam(t, teamsFrom)
        : { id: t.id, nom: t.name||t.title||t.id||'', name: t.name||t.title||t.id||'', collections: [], vues: [], savedSearches: [], storages: [], source: teamsFrom, raw: t };
      obj.is_system = wfdIsSystemTeam(obj);
      return obj;
    });
    // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));

    // Rebuild Teams.users ← Users.teams
    if ((usersData.users||[]).length) {
      const teamById = {};
      (teamsData.teams||[]).forEach(t => { if (t?.id) teamById[t.id] = t; });
      Object.values(teamById).forEach(t => { t.users = []; });
      (usersData.users||[]).forEach(u => {
        (u.teams||[]).forEach(mt => {
          const team = teamById[mt.id];
          if (!team) return;
          if (!team.users) team.users = [];
          if (!team.users.some(x => x.id === u.id)) team.users.push({ id: u.id, nom: u.nom||u.name||u.id, email: u.email||'' });
        });
      });
      // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
    }

    // ACLs Collections → Teams
    if ((teamsData.teams||[]).length && (collectionsData.collections||[]).length) {
      const teamById = {};
      (teamsData.teams||[]).forEach(t => { if (t?.id) teamById[t.id] = t; });
      const allCols = (collectionsData.collections||[]).filter(c => c && c.id);
      const colById = {};
      allCols.forEach(c => { colById[c.id] = c; });
      const pathMemo = {};
      function buildColPath(colId) {
        if (pathMemo[colId]) return pathMemo[colId];
        const node = colById[colId];
        if (!node) return (pathMemo[colId] = colId);
        const name = (node.name || node.nom || colId).trim();
        if (!node.parent_id || !colById[node.parent_id]) return (pathMemo[colId] = name);
        return (pathMemo[colId] = buildColPath(node.parent_id) + ' / ' + name);
      }
      const BATCH = 12;
      for (let i = 0; i < allCols.length; i += BATCH) {
        const chunk = allCols.slice(i, i + BATCH);
        const results = await Promise.allSettled(chunk.map(c =>
          fetch(base + '/API/acls/v1/acl/collections/' + c.id + '/', { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(data => ({ col: c, data }))
        ));
        for (const res of results) {
          if (!res.value?.data) continue;
          const { col, data: aclData } = res.value;
          const entries = [
            ...(aclData.groups_acl||[]).map(e => ({ ...e, _origin: 'direct' })),
            ...(aclData.inherited_groups_acl||[]).map(e => ({ ...e, _origin: 'inherited' })),
            ...(aclData.propagating_groups_acl||[]).map(e => ({ ...e, _origin: 'propagates' })),
          ];
          for (const ga of entries) {
            let team = teamById[ga.group_id];
            if (!team) {
              team = { id: ga.group_id, nom: ga.group_id, name: ga.group_id, collections: [], vues: [], savedSearches: [], storages: [], users: [], source: 'acl_stub', raw: { acl_stub: true, group_id: ga.group_id } };
              teamsData.teams.push(team);
              teamById[ga.group_id] = team;
            }
            const p = (ga.permissions||[]).map(x => String(x).toLowerCase());
            const perm = (p.includes('write')||p.includes('delete')||p.includes('change-acl')) ? 'Read & Write' : 'Read Only';
            const flags = [...p]; if (ga._origin) flags.push(ga._origin);
            if (!Array.isArray(team.collections)) team.collections = [];
            const existing = team.collections.find(x => x.id === col.id || x.chemin === col.id);
            const normalized = { id: col.id, nom: col.name||col.nom||col.id, permission: perm, permission_flags: flags, chemin: col.id, _path: buildColPath(col.id) };
            if (existing) Object.assign(existing, normalized);
            else team.collections.push(normalized);
          }
        }
      }
      // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
    }

    // ACLs Metadata Views → Teams
    if ((teamsData.teams||[]).length && (metadataViewsData.metadataViews||[]).length) {
      const teamById = {};
      (teamsData.teams||[]).forEach(t => { if (t?.id) teamById[t.id] = t; });
      const viewById = {};
      (metadataViewsData.metadataViews||[]).forEach(v => { if (v?.id) viewById[v.id] = v; });
      Object.values(viewById).forEach(v => { v.teams = []; });
      const views = (metadataViewsData.metadataViews||[]).filter(v => v && v.id);
      const BATCH = 12;
      for (let i = 0; i < views.length; i += BATCH) {
        const chunk = views.slice(i, i + BATCH);
        const results = await Promise.allSettled(chunk.map(v =>
          fetch(base + '/API/acls/v1/acl/metadata_views/' + v.id + '/', { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(data => ({ view: v, data }))
        ));
        for (const res of results) {
          if (!res.value?.data) continue;
          const { view, data: aclData } = res.value;
          const entries = [
            ...(aclData.groups_acl||[]).map(e => ({ ...e, _origin: 'direct' })),
            ...(aclData.inherited_groups_acl||[]).map(e => ({ ...e, _origin: 'inherited' })),
            ...(aclData.propagating_groups_acl||[]).map(e => ({ ...e, _origin: 'propagates' })),
          ];
          for (const ga of entries) {
            const team = teamById[ga.group_id];
            if (!team) continue;
            const p = (ga.permissions||[]).map(x => String(x).toLowerCase());
            const perm = (p.includes('write')||p.includes('delete')||p.includes('change-acl')) ? 'Read & Write' : 'Read Only';
            const flags = [...p]; if (ga._origin) flags.push(ga._origin);
            if (!Array.isArray(team.vues)) team.vues = [];
            const existing = team.vues.find(x => x.id === view.id);
            const normalized = { id: view.id, nom: view.name||view.id, permission: perm, permission_flags: flags };
            if (existing) Object.assign(existing, normalized);
            else team.vues.push(normalized);
            const vObj = viewById[view.id];
            if (vObj) {
              if (!Array.isArray(vObj.teams)) vObj.teams = [];
              if (!vObj.teams.some(x => x.id === team.id)) vObj.teams.push({ id: team.id, nom: team.nom||team.name||team.id, permission: perm, permission_flags: flags });
            }
          }
        }
      }
      // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
      // (DB) localStorage.setItem('metadataViewsData', JSON.stringify(metadataViewsData));
    }

    // ── Fetch Team ACLs (pour Mirror/APS Check) ──────────────────────────
    {
      const BATCH_TA = 8;
      const teamsForAcl = teamsData.teams.filter(t => t.id && !t.raw?.acl_stub);
      const teamAclsData = [];
      for (let i = 0; i < teamsForAcl.length; i += BATCH_TA) {
        const chunk = teamsForAcl.slice(i, i + BATCH_TA);
        const results3 = await Promise.allSettled(chunk.map(t =>
          fetch(base + '/API/acls/v1/acl/groups/' + t.id + '/', { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        ));
        results3.forEach((res, idx) => {
          if (res.value) {
            teamAclsData.push({ ...chunk[idx], groupAcls: res.value.groups_acl||[] });
          }
        });
      }
      // teamAclsData — plus de localStorage, données servies depuis DB via proxy (IkonTeam.aclFlags)
    }

    // ── Fetch Team Settings (pour SD) ─────────────────────────────────────
    // Stocker les settings de chaque team pour pouvoir les pousser via SD
    {
      const BATCH_TS = 8;
      const teams = teamsData.teams.filter(t => t.id && !t.raw?.acl_stub);
      for (let i = 0; i < teams.length; i += BATCH_TS) {
        const chunk = teams.slice(i, i + BATCH_TS);
        const results2 = await Promise.allSettled(chunk.map(t =>
          fetch(base + '/API/settings/v1/team/' + t.id + '/', { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        ));
        results2.forEach((res, idx) => {
          if (res.value) chunk[idx].teamSettings = res.value;
        });
      }
      // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
    }

    // ACLs Saved Searches → Teams
    await syncAclsSavedSearchesToTeams(base, headers);
  }

  // ── USERS ─────────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'users') {
    // Pré-requis : teams
    if (!(teamsData.teams||[]).length) {
      const teamsApi = await syncFetchAll(base, headers, '/API/users/v1/teams/?per_page=500', r => r.objects || []);
      const M = window.WFD_Mappers;
      teamsData.teams = (teamsApi||[]).map(t => {
        const obj = (M && typeof M.mapTeam === 'function') ? M.mapTeam(t,'teams') : { id: t.id, nom: t.name||t.id||'', name: t.name||t.id||'', collections:[], vues:[], savedSearches:[], storages:[], source:'teams', raw:t };
        obj.is_system = wfdIsSystemTeam(obj); return obj;
      });
      // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
    }

    const usersApi = await syncFetchAll(base, headers, '/API/users/v1/users/?per_page=500', r => r.objects || []);

    // IDP
    let idpById = {};
    try {
      const r = await fetch(base + '/API/auth/v1/auth/saml/idp/', { headers });
      const data = await r.json().catch(() => ({}));
      (data.objects||[]).forEach(p => {
        if (!p?.id) return;
        idpById[String(p.id)] = { name: String(p.settings?.name||p.name||'').trim()||'SSO', idp_entity_id: String(p.settings?.idp_entity_id||p.saml_settings?.idp?.entityId||'').trim() };
      });
    } catch (_) {}

    const M = window.WFD_Mappers;
    usersData.users = (usersApi||[]).map(u => {
      const mapped = (M && typeof M.mapUser === 'function')
        ? M.mapUser(u, { idpById })
        : { id: u.id||'', nom: ((String(u.first_name||'').trim()+' '+String(u.last_name||'').trim()).trim())||(u.email||u.id||''), name: ((String(u.first_name||'').trim()+' '+String(u.last_name||'').trim()).trim())||(u.email||u.id||''), email: u.email||'', status: u.status||'', type: u.type||'', teams:[], role_groups:[], raw: u };
      const idp_id = String(u?.identity_provider_id||'').trim();
      if (idp_id) { const info = idpById[idp_id]; mapped.idp_id=idp_id; mapped.idp_entity_id=info?.idp_entity_id||''; mapped.idp=info?.name||'SSO'; }
      else { mapped.idp_id=''; mapped.idp_entity_id=''; mapped.idp='Iconik'; }
      if (!mapped.raw) mapped.raw = u;
      return mapped;
    });

    // (DB) localStorage.setItem('usersData', JSON.stringify(usersData));
  }

  // ── SAVED SEARCHES ────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'savedSearches') {
    const list = await syncFetchAll(base, headers, '/API/search/v1/search/saved/?per_page=500', r => r.objects || []);
    const viewById = {};
    (metadataViewsData.metadataViews||[]).forEach(v => { if (v?.id) viewById[v.id] = v.name||v.id; });
    const M = window.WFD_Mappers;
    savedSearchesData.savedSearches = (list||[]).map(o =>
      (M && typeof M.mapSavedSearch === 'function') ? M.mapSavedSearch(o, viewById) : { id: o.id, nom: o.name||o.title, name: o.name||o.title, criteria: o.criteria||o.search_criteria||{} }
    );
    await syncAclsSavedSearchesToTeams(base, headers);
    // (DB) localStorage.setItem('savedSearchesData', JSON.stringify(savedSearchesData));
    // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
  }

  // ── STORAGES ──────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'storages') {
    const stList = await syncFetchAll(base, headers, '/API/files/v1/storages/?per_page=500', r => r.objects || []);
    const BATCH = 8;
    const storagesWithDetails = [];
    const M = window.WFD_Mappers;
    for (let i = 0; i < stList.length; i += BATCH) {
      const chunk = stList.slice(i, i + BATCH);
      const results = await Promise.allSettled(chunk.map(s =>
        fetch(base + '/API/files/v1/storages/' + s.id + '/', { headers }).then(r => r.ok ? r.json() : null).catch(() => null)
      ));
      for (const res of results) {
        const details = res.value;
        if (!details) continue;
        storagesWithDetails.push((M && typeof M.mapStorage === 'function') ? M.mapStorage(details) : { id: details.id, nom: details.name, name: details.name, storage_type: details.storage_type||'', status: details.status||'' });
      }
    }
    storagesData.storages = storagesWithDetails;
    // (DB) localStorage.setItem('storagesData', JSON.stringify(storagesData));
    await syncAclsStoragesToTeams(base, headers);
    // (DB) localStorage.setItem('storagesData', JSON.stringify(storagesData));
    // (DB) localStorage.setItem('teamsData', JSON.stringify(teamsData));
  }

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'categories') {
    try {
      const viewById = {};
      (metadataViewsData.metadataViews||[]).forEach(v => { if (v?.id) viewById[v.id] = v.name||v.id; });
      const catEndpoints = [
        { type: 'assets',         ep: '/API/metadata/v1/assets/categories/?per_page=500' },
        { type: 'collections',    ep: '/API/metadata/v1/collections/categories/?per_page=500' },
        { type: 'segments',       ep: '/API/metadata/v1/segments/categories/?per_page=500' },
        { type: 'custom_actions', ep: '/API/metadata/v1/custom_actions/categories/?per_page=500' },
      ];
      const byName = new Map();
      for (const { type, ep } of catEndpoints) {
        const list = await syncFetchAll(base, headers, ep, r => r.objects || []);
        (list||[]).forEach(cat => {
          // Utiliser api_name si disponible, sinon name lowercase
          const key = String(cat.api_name||cat.name||'').toLowerCase().trim();
          if (!key || key === 'none') return;
          const cur = byName.get(key) || { id: cat.id||'', name: cat.name||'', label: cat.label||cat.name||'', object_types: [], view_ids: [], raw: {} };
          if (!cur.object_types.includes(type)) cur.object_types.push(type);
          (cat.view_ids||[]).forEach(vid => { if (vid && !cur.view_ids.includes(vid)) cur.view_ids.push(vid); });
          cur.raw[type] = cat;
          if (cat.label && cat.label.length > (cur.label||'').length) cur.label = cat.label;
          byName.set(key, cur);
        });
      }
      const M = window.WFD_Mappers;
      categoriesData.categories = Array.from(byName.values()).map(agg => {
        const c = (M && typeof M.mapCategoryAgg === 'function') ? M.mapCategoryAgg(agg, viewById) : { id: agg.id, nom: agg.label||agg.name, name: agg.name, label: agg.label||agg.name, object_types: agg.object_types, metadataViews: agg.view_ids.map(id => viewById[id]||id).filter(Boolean) };
        c.is_system = wfdIsSystemCategory(c);
        return c;
      });
      // Stocker les associations Default/Generic par object_type pour APS Check
      const DEFAULT_CAT_MAP = {
        assets:         'default',
        collections:    'default',
        segments:       'generic',
        custom_actions: 'default',
        search:         'default',
      };
      categoriesData.defaultViewsByType = {};
      for (const [objType, catName] of Object.entries(DEFAULT_CAT_MAP)) {
        try {
          const r = await fetch(base+'/API/metadata/v1/'+objType+'/categories/'+catName+'/', {headers})
            .then(r=>r.ok?r.json():null).catch(()=>null);
          if (r) {
            const viewNames = (r.view_ids||[]).map(id=>viewById[id]||id).filter(Boolean);
            categoriesData.defaultViewsByType[objType] = { catName, view_ids: r.view_ids||[], viewNames };
          }
        } catch(e) {}
      }
      // (DB) localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
    } catch (e) { console.warn('Sync categories:', e.message||e); }
  }

  // ── WEBHOOKS ──────────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'webhooks') {
    const listWh = await syncFetchAll(base, headers, '/API/notifications/v1/webhooks/?per_page=500', r => r.objects || []);
    const M = window.WFD_Mappers;
    webhooksData = { webhooks: (listWh||[]).map(o => (M && typeof M.mapWebhook === 'function') ? M.mapWebhook(o) : { id: o.id, nom: o.name, name: o.name, url: o.url||'', description: o.description||'', event_type: o.event_type||'', realm: o.realm||'', operation: o.operation||'', query: o.query||'', headers: o.headers||{}, status: o.status||'' }) };
    // (DB) localStorage.setItem('webhooksData', JSON.stringify(webhooksData));
  }

  // ── AUTOMATIONS ───────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'automations') {
    const prevConditionsById = {};
    (automationsData.automations||[]).forEach(a => { if (a?.id) prevConditionsById[String(a.id)] = Array.isArray(a.conditions) ? a.conditions : []; });
    const list = await syncFetchAll(base, headers, '/API/automations/v1/automations/?per_page=500', r => r.objects || []);
    // (DB) automationsData_raw — supprimé (données en mémoire uniquement)
    const M = window.WFD_Mappers;
    automationsData = {
      automations: (list||[]).map(a => {
        const mapped = (M?.mapAutomationDeep) ? M.mapAutomationDeep(a) : (M?.mapAutomation) ? M.mapAutomation(a) : { id: a.id, nom: a.name||a.id||'', name: a.name||a.id||'', enabled: String(a.status||'').toUpperCase()==='ACTIVE', status: String(a.status||'').toUpperCase()==='ACTIVE'?'ACTIVE':'INACTIVE', status_raw: a.status||'', triggers: Array.isArray(a.triggers)?a.triggers:[], actions: Array.isArray(a.actions)?a.actions:[], conditions: [], raw: a };
        mapped.conditions = prevConditionsById[String(mapped.id||'')] || [];
        return mapped;
      })
    };
    // (DB) automationsData — en mémoire uniquement
  }

  // ── CUSTOM ACTIONS ────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'customActions') {
    const list = await syncFetchAll(base, headers, '/API/assets/v1/custom_actions/?per_page=500', r => r.objects || []);
    const M = window.WFD_Mappers;
    customActionsData = { customActions: (list||[]).map(o => {
        const viewById2 = {}; (metadataViewsData?.metadataViews||[]).forEach(v=>{if(v?.id)viewById2[v.id]=v.name||v.id;});
        const mapped = (M && typeof M.mapCustomAction === 'function') ? M.mapCustomAction(o) : { id: o.id, nom: o.title||o.name, name: o.title||o.name, title: o.title||o.name, url: o.url||'', type: o.type||'POST', context: o.context||'ASSET', headers: o.headers||{}, disabled: !!o.disabled, metadata_view: o.metadata_view||null, app_id: o.app_id||null };
        // Stocker le nom de la vue plutôt que l'ID (stable cross-domaine)
        if (mapped.metadata_view && viewById2[mapped.metadata_view]) mapped.metadata_view = viewById2[mapped.metadata_view];
        return mapped;
      }) };
    // (DB) localStorage.setItem('customActionsData', JSON.stringify(customActionsData));
    // Apps (Application Tokens)
    try {
      const r = await fetch(base + '/API/auth/v1/apps/?per_page=500&page=1', { headers });
      const data = await r.json().catch(() => null);
      const objs = (data && Array.isArray(data.objects)) ? data.objects : [];
      if (objs.length) {
        appsData.apps = objs.map(a => { const n = String(a.name||a.title||a.app_name||a.settings?.name||a.id||'').trim(); return { id: a.id||'', nom: n, name: n, raw: a }; }).filter(x => x.id && x.nom);
        // (DB) localStorage.setItem('appsData', JSON.stringify(appsData));
      }
    } catch (e) { console.warn('Sync apps:', e?.message||e); }
  }

  if (scope === 'all' || scope === 'customActions' || scope === 'teams') {
    await syncAclsCustomActionsToTeams(base, headers);
  }

  // ── RELATION TYPES ────────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'relationTypes') {
    const items = await syncFetchAll(base, headers, '/API/assets/v1/assets/relation_types/?per_page=500', r => r.objects || []);
    // (DB) localStorage.setItem('relationTypesData', JSON.stringify({ relationTypes: items.filter(o => !o.is_system), date_saved: new Date().toISOString() }));
  }

  // ── SYSTEM SETTINGS ───────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'systemSettings') {
    const r = await fetch(base + '/API/settings/v1/merged/current/', { headers });
    if (r.ok) {
      const data = await r.json();
      // (DB) systemSettingsData — en mémoire uniquement
    }
  }

  // ── Export Locations ───────────────────────────────────────────────────────
  if (scope === 'all' || scope === 'exportLocations') {
    const items = await syncFetchAll(base, headers, '/API/files/v1/export_locations/?per_page=500', r => r.objects || []);
    // Résoudre le nom du storage depuis storagesData
    const stById = {};
    (storagesData.storages || []).forEach(s => { if (s?.id) stById[s.id] = s; });
    // Index teams et users pour résolution ACLs
    const teamById = {};
    (teamsData.teams || []).forEach(t => { if (t?.id) teamById[t.id] = t; });
    const userById = {};
    (usersData.users || []).forEach(u => { if (u?.id) userById[u.id] = u; });

    // Fetcher ACLs pour chaque export location
    const BATCH_EL = 8;
    const aclMap = {};
    for (let i = 0; i < items.length; i += BATCH_EL) {
      const chunk = items.slice(i, i + BATCH_EL);
      const results = await Promise.allSettled(
        chunk.map(el =>
          fetch(base + '/API/acls/v1/acl/export_locations/' + el.id + '/', { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(data => ({ id: el.id, data }))
        )
      );
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value?.data) aclMap[r.value.id] = r.value.data;
      });
    }

    exportLocationsData = {
      exportLocations: items.map(el => {
        const acl = aclMap[el.id] || {};
        // Teams depuis groups_acl
        const teams = [
          ...(acl.groups_acl || []).map(g => ({ id: g.group_id, nom: (teamById[g.group_id]?.nom || teamById[g.group_id]?.name || g.group_name || g.group_id), permissions: g.permissions || [], _origin: 'direct' })),
          ...(acl.propagating_groups_acl || []).map(g => ({ id: g.group_id, nom: (teamById[g.group_id]?.nom || teamById[g.group_id]?.name || g.group_name || g.group_id), permissions: g.permissions || [], _origin: 'propagates' })),
          ...(acl.inherited_groups_acl || []).map(g => ({ id: g.group_id, nom: (teamById[g.group_id]?.nom || teamById[g.group_id]?.name || g.group_name || g.group_id), permissions: g.permissions || [], _origin: 'inherited' })),
        ];
        // Users depuis users_acl
        const users = [
          ...(acl.users_acl || []).map(u => ({ id: u.user_id, nom: (userById[u.user_id]?.nom || userById[u.user_id]?.name || userById[u.user_id]?.email || u.user_id), permissions: u.permissions || [], _origin: 'direct' })),
        ];
        return {
          id:                            el.id,
          nom:                           el.name,
          name:                          el.name,
          description:                   el.description || '',
          path:                          el.path || '',
          storage_id:                    el.storage_id || null,
          storage_nom:                   (el.storage_id && stById[el.storage_id]) ? (stById[el.storage_id].nom || stById[el.storage_id].name || el.storage_id) : el.storage_id || '',
          export_metadata:               !!el.export_metadata,
          metadata_view:                 el.metadata_view || null,
          metadata_format:               el.metadata_format || null,
          export_transcriptions:         !!el.export_transcriptions,
          transcription_format:          el.transcription_format || null,
          export_posters:                !!el.export_posters,
          export_original:               !!el.export_original,
          export_proxy:                  !!el.export_proxy,
          export_to_asset_folder:        el.export_to_asset_folder || null,
          include_original_extension:    !!el.include_original_extension,
          transcode_profile_ids:         el.transcode_profile_ids || [],
          teams,
          users,
          raw:                           el,
        };
      })
    };
  }

  // ── Rebuild membership Users ↔ Teams ──────────────────────────────────────
  ;(function rebuildUsersTeamsMembership() {
    const users = (usersData && Array.isArray(usersData.users)) ? usersData.users : [];
    const teams = (teamsData && Array.isArray(teamsData.teams)) ? teamsData.teams : [];
    if (!users.length || !teams.length) return;
    const teamById = {};
    teams.forEach(t => { if (t?.id && t.source !== 'acl_stub') teamById[String(t.id)] = t; });
    if (!Object.keys(teamById).length) return;
    users.forEach(u => { u.teams = []; });
    Object.values(teamById).forEach(t => { t.users = []; });
    users.forEach(u => {
      const raw = u.raw || {};
      const gids = Array.isArray(raw.groups) ? raw.groups.map(String) : [];
      const primary = raw.primary_group ? String(raw.primary_group) : null;
      gids.forEach(gid => {
        const team = teamById[gid];
        if (!team) return;
        if (!u.teams.some(x => x.id === gid)) u.teams.push({ id: gid, nom: team.nom||team.name||gid, is_primary: !!(primary && gid===primary) });
        if (!Array.isArray(team.users)) team.users = [];
        if (!team.users.some(x => x.id === u.id)) team.users.push({ id: u.id, nom: u.nom||u.name||u.id, email: u.email||'' });
      });
      if (u.teams.length && !u.teams.some(t => t.is_primary)) u.teams[0].is_primary = true;
    });
  })();

  // ── Persist final (appelé par lancerDomaineSite après la boucle) ──────────
  if (typeof window.normalizeAssociationsSweep === 'function') window.normalizeAssociationsSweep();
}

// ─── Domaine → Site ───────────────────────────────────────────────────────────
async function lancerDomaineSite(nom, envId) {
  // ── DS rebranché sur le moteur serveur — 2026-06-24 ──────────────────────
  // Plus de localStorage. La sync tourne côté Express + PostgreSQL.
  // Le frontend pilote via POST /api/jobs/sync et poll GET /api/jobs/:id.

  const status = document.getElementById('ds-status-'+envId);
  const scopes = getCheckedScopes('ds', envId);
  const mode   = getSyncMode('ds', envId);
  if (!scopes.length) { toast('Cochez au moins un périmètre', true); return; }

  // Résoudre l'envSlug depuis le token
  const token = appTokensData.appTokens.find(t => t.name === nom);
  if (!token) { toast('Environnement introuvable', true); return; }
  const envSlug = String(token.environment || token.env || '').toLowerCase() || 'qa';

  if (status) status.textContent = 'Synchronisation…';
  const _jmDS = window.WFD_JobManager;

  try {
    const doAll  = scopes.includes('all');
    const active = doAll ? ['all'] : scopes;
    const totalScopes = doAll ? 17 : scopes.length;

    if (_jmDS) _jmDS.start({ kind: 'DS', label: 'Domaine → Site', env: nom, scopeLabel: active.join(', '), total: totalScopes });

    // ── 1) Créer le job serveur ──────────────────────────────────────────
    const jobResp = await fetch('/api/jobs/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envSlug, scopes: active, mode }),
    });
    if (!jobResp.ok) {
      const err = await jobResp.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur création job (' + jobResp.status + ')');
    }
    const { jobId } = await jobResp.json();
    if (status) status.textContent = 'Job ' + jobId.slice(0, 8) + '… en cours';

    // ── 2) Poll progression ──────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const r = await fetch('/api/jobs/' + jobId);
          if (!r.ok) return;
          const j = await r.json();

          // Mettre à jour la barre de progression
          if (_jmDS) _jmDS.progress(j.done, j.total, j.currentScope || '');
          if (status) status.textContent = (j.currentScope || '…') + ' (' + j.done + '/' + j.total + ')';

          if (j.status === 'done') {
            clearInterval(interval);
            resolve(j);
          } else if (j.status === 'error') {
            clearInterval(interval);
            reject(new Error(j.errorMessage || 'Erreur sync serveur'));
          }
        } catch (e) {
          // Erreur réseau transitoire — on continue à poller
          console.warn('[DS] Erreur poll:', e.message);
        }
      }, 3000);
    });

    // ── 3) Succès ────────────────────────────────────────────────────────
    // Invalider le cache sessionStorage — le prochain accès à Settings rechargera depuis la DB
    const _activeSlug = window._apsActiveEnvSlug || 'prod';
    sessionStorage.removeItem('aps_settings_cache_' + _activeSlug);
    // Invalider aussi le cache proxy ACL côté serveur
    await fetch('/api/iconik/invalidate-cache', { method: 'POST' }).catch(() => {});
    // Recharger les données en mémoire pour l'env courant
    await chargerDonnees(_activeSlug);
    const results = ['✅ Sync DS terminée — données en DB'];
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof renderListe === 'function') renderListe(document.getElementById('set-list-search')?.value || '');
    if (status) { status.style.color='var(--accent)'; status.innerHTML = results.join('<br>'); }
    if (_jmDS) _jmDS.done(results);
    toast('Sync DS terminée ✓');

  } catch(e) {
    if (_jmDS) _jmDS.fail(e);
    if (status) { status.style.color='var(--c-danger)'; status.textContent = '✗ ' + e.message; }
    toast('Erreur sync DS', true);
  }
}

// ─── Site → Domaine ───────────────────────────────────────────────────────────
async function lancerSiteDomaine(nom, envId) {
  const token  = appTokensData.appTokens.find(t => t.name === nom);
  const status = document.getElementById('sd-status-'+envId);
  if (!token) { toast('Environnement introuvable', true); return; }

  const scopes = getCheckedScopes('sd', envId);
  const mode   = getSyncMode('sd', envId);
  if (!scopes.length) { toast('Cochez au moins un périmètre', true); return; }

  // ── VERROU anti-drama (Site → Domaine) ─────────────────────────────
  // 1) overwrite => confirmation forte
  if (mode === 'overwrite') {
    const ok = await askTypedConfirm({
      title: '[WFD] Mode OVERWRITE (Site → Domaine)',
      message: 'Cette action peut SUPPRIMER des éléments sur la cible.\n\nTape exactement : OVERWRITE',
      expected: 'OVERWRITE',
      placeholder: 'OVERWRITE'
    });
    if (!ok) { toast('Annulé : confirmation OVERWRITE manquante', true); return; }
  }

  // 2) cible PROD => confirmation renforcée
  const envType = String(token.environment || '').toLowerCase();
  if (envType === 'prod') {
    const okProd = await askTypedConfirm({
      title: '[WFD] CIBLE = PRODUCTION (Site → Domaine)',
      message: `[WFD] CIBLE = PRODUCTION (Site → Domaine)
Environnement : ${nom}

Tape exactement : PROD`,
      expected: 'PROD',
      placeholder: 'PROD'
    });
    if (!okProd) { toast('Annulé : confirmation PROD manquante', true); return; }
  }

  const base    = _ikBase(token);
  const headers = { 'Content-Type':'application/json' };

  // No-op progress tick pour la SD (pas de progress bar dédiée pour l'instant)
  const _ddProgTick = (scope) => {};

  // ── Job Manager ──
  const _jm = window.WFD_JobManager;
  if (_jm) _jm.start({ kind: 'SD', label: 'Site → Domaine', env: nom, scopeLabel: scopes.join(', ') });

  // ── Chargement des données depuis le snapshot DB ─────────────────────────
  // Plus de localStorage. Source = snapshot Iconik courant en PostgreSQL.
  let _snap = null;
  try {
    if (status) status.textContent = 'Chargement données depuis DB…';
    const envSlug = String(token.environment || token.env || '').toLowerCase() || 'qa';
    const snapResp = await fetch('/api/ikon/snapshot/' + envSlug);
    if (!snapResp.ok) throw new Error('Snapshot introuvable pour ' + envSlug + ' — lancez une Sync DS');
    _snap = await snapResp.json();
  } catch(e) {
    if (_jm) _jm.fail(e);
    if (status) { status.style.color='var(--c-danger)'; status.textContent = '✗ ' + e.message; }
    toast('Erreur chargement données : ' + e.message, true);
    return;
  }

  // Données chargées depuis le snapshot
  const _snapCollections   = _snap.collections   || [];
  const _snapTeams         = _snap.teams         || [];
  const _snapRoleGroups    = _snap.roleGroups     || [];
  const _snapViews         = _snap.views          || [];
  const _snapViewFieldsById = _snap.viewFieldsById || {};
  const _snapFields        = _snap.metadonnees    || [];
  const _snapSavedSearches = _snap.savedSearches  || [];
  const _snapWebhooks      = _snap.webhooks       || [];
  const _snapCustomActions = _snap.customActions  || [];
  const _snapAutomations   = _snap.automations    || [];
  const _snapRelationTypes = _snap.relationTypes  || [];
  const _snapSystemSettings = _snap.systemSettings || null;

  const PUSH = {
    collections  : { data:()=>_snapCollections, ep:'/API/assets/v1/collections/', body:o=>({title:o.title||o.name||o.nom||''}) },
    teams        : { data:()=>_snapTeams.filter(t => !t.is_system), ep:'/API/users/v1/teams/',
      body:o=>({name:o.name||o.nom, description:o.description||'', default_user_type:o.default_user_type||'STANDARD', saml_primary_group_priority:o.saml_primary_group_priority||0}),
    },
    roleGroups   : { data:()=>_snapRoleGroups, ep:'/API/users/v1/role_groups/', body:o=>({name:o.name||o.nom, description:o.description||'', roles: o.roles?.length ? o.roles : (o.fonctionnalites||[]), role_categories:o.role_categories||{}}) },
    metadataViews: { data:()=>_snapViews, ep:'/API/metadata/v1/views/',
      body: o => {
        // view_fields depuis le snapshot DB
        const viewFields = _snapViewFieldsById[o.id] || o.view_fields || [];
        return { name: o.name, description: o.description||'', view_fields: viewFields };
      }
    },
    metadata:      { data:()=>_snapFields, usePatch:true,                                                 ep:'/API/metadata/v1/fields/',              body:o=>{ const b = {name: (o.name || o.id || ''), label: (o.label || o.nom || o.name || ''), description: (o.description || ''), field_type: (o.field_type || o.type || 'string'), options: (o.options || []), required: (o.required === true), read_only: (o.read_only === true), hide_if_not_set: (o.hide_if_not_set === true), use_in_filters: (o.use_in_filters === true || o.use_as_facet === true), multi: (o.multi === true || o.multiselect === true), display_as_warning: (o.display_as_warning === true || o.is_warning_field === true), block_assets: (o.block_assets === true || o.is_block_field === true)}; if (o.mapped_field_name) b.mapped_field_name = o.mapped_field_name; return b; } },
    webhooks     : { data:()=>_snapWebhooks,           ep:'/API/notifications/v1/webhooks/',       body:(o,isNew) => {
        // Normaliser headers : APS [{key,value}] → objet {key:value}
        let hdrs = o.headers || {};
        if (Array.isArray(hdrs)) {
          const obj={}; hdrs.forEach(({key,value})=>{ if(key) obj[key]=value||''; }); hdrs=obj;
        }
        return {name:o.name||o.nom,url:o.url,status:'DISABLED',event_type:o.eventType||o.event_type,realm:o.realm,operation:o.operation,query:o.query||'',headers:hdrs};
      } },
    customActions: { data:()=>_snapCustomActions, ep:'/API/assets/v1/custom_actions/',        body:(o,isNew, _unused, dstViewIdByName) => {
        // Résoudre metadata_view : APS peut stocker un nom ou un ID PROD
        let mvId = null;
        if (o.metadata_view && dstViewIdByName) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.metadata_view);
          if (isUuid) {
            // Ancien format : ID PROD → résoudre par nom
            const srcView = (metadataViewsData?.metadataViews||[]).find(v=>v.id===o.metadata_view);
            const viewName = srcView?.name || srcView?.nom;
            if (viewName) mvId = dstViewIdByName[viewName.toLowerCase().trim()] || null;
          } else {
            // Nouveau format : nom direct → résoudre directement
            mvId = dstViewIdByName[o.metadata_view.toLowerCase().trim()] || null;
          }
        }
        // Normaliser headers : APS [{key,value}] → objet {key:value}
        let hdrs = o.headers || {};
        if (Array.isArray(hdrs)) {
          const obj={}; hdrs.forEach(({key,value})=>{ if(key) obj[key]=value||''; }); hdrs=obj;
        }
        const b = {title:o.name||o.nom,type:o.type||'POST',context:o.context||'ASSET',url:o.url,headers:hdrs,disabled:isNew?true:(o.disabled||false)};
        if (mvId) b.metadata_view = mvId;
        return b;
      } },
    automations  : { data:()=>_snapAutomations, ep:'/API/automations/v1/automations/',
      // body reçoit colIdMap et dstViewIdByName passés par le handler spécial
      body: (o, isNew, colIdMap, dstViewIdByName, dstGroupIdByName) => {
        const resolveActions = (actions) => (actions||[]).map(a => {
          if (!a?.parameters) return a;
          const p = { ...a.parameters };
          if (p.collection_id && colIdMap) {
            const col = (_snapCollections||[]).find(c=>c.id===p.collection_id);
            const path = col?._path;
            const dstId = path ? colIdMap[path.toLowerCase().trim()] : null;
            if (dstId) p.collection_id = dstId;
          }
          if (p.metadata_view_id && dstViewIdByName) {
            const srcView = (metadataViewsData?.metadataViews||[]).find(v=>v.id===p.metadata_view_id);
            const viewName = srcView?.name||srcView?.nom;
            const dstId = viewName ? dstViewIdByName[viewName.toLowerCase().trim()] : null;
            if (dstId) p.metadata_view_id = dstId;
          }
          // Résoudre group_ids dans UPDATE_ACL : IDs PROD → noms → IDs dst
          if ((a.type_raw === 'UPDATE_ACL' || a.type === 'UPDATE_ACL') && Array.isArray(p.objects) && dstGroupIdByName) {
            p.objects = p.objects.map(obj => {
              if (!Array.isArray(obj.group_ids)) return obj;
              const resolved = obj.group_ids.map(srcGid => {
                // Chercher le nom du group dans APS (teams + roleGroups)
                const allGroups = [
                  ...(teamsData?.teams||[]),
                  ...(roleGroupsData?.roleGroups||[])
                ];
                const grp = allGroups.find(g => g.id === srcGid);
                const grpName = grp?.name || grp?.nom;
                return grpName ? (dstGroupIdByName[grpName.toLowerCase().trim()] || srcGid) : srcGid;
              });
              return { ...obj, group_ids: resolved };
            });
          }
          return { ...a, parameters: p };
        });
        return {
          name: o.name||o.nom,
          status: 'INACTIVE',
          triggers: (o.raw?.triggers||o.triggers||[]),
          conditions: (o.raw?.conditions||o.conditions||[]),
          actions: resolveActions(o.raw?.actions||o.actions||[]),
        };
      }
    },
    savedSearches: {data:()=>_snapSavedSearches,                                              ep:'/API/search/v1/search/saved/',          body:o=>({ name:(o.name||o.nom||o.title||''), criteria:(o.criteria||o.query||o.search_criteria||{}) })
},
    relationTypes: { data:()=>_snapRelationTypes, ep:'/API/assets/v1/assets/relation_types/', body:o=>({name:o.name,directional:o.is_directional||false,source_label:o.source_label||'',destination_label:o.destination_label||'',description:o.description||''}) },
    systemSettings: { data:()=>_snapSystemSettings, ep:'/API/settings/v1/system/current/',
      body:o=>{ const KEYS=['default_share_options','share_expiration_time','external_share','allow_invites_by_link',
        'allow_share_magic_link_creation','enforce_magic_link_allowlist','search_users_from_share',
        'watermark_options','watermark','search_in_transcriptions','collections_get_parent_acls',
        'lock_mapped_collections','append_asset_uuid_to_downloads','use_asset_name_on_download',
        'custom_terms','hide_favourites','home_page',
        'asset_default_sections','search_default_sections','search_display_fields',
        'required_metadata_views','facet_fields'];
        const out={}; KEYS.forEach(k=>{ if(o&&o[k]!==undefined) out[k]=o[k]; }); return out; }},
  };

  const doAll  = scopes.includes('all');
  const active = doAll ? Object.keys(PUSH) : scopes.filter(s => PUSH[s]);
  const results = [];

  // ── Phase 1 : Push des entités “simples” (existant) ─────────────────────────
  for (const sc of active) {
    const def = PUSH[sc];
    if (!def) continue;
    if (status) status.textContent = sc + '…';

    // ✅ System Settings SD : PATCH singleton
    if (sc === 'systemSettings') {
      try {
        const srcSettings = _snapSystemSettings;
        if (!srcSettings) { results.push('❌ systemSettings : données absentes du snapshot DB'); continue; }
        const body = def.body(srcSettings);
        const r = await fetch(base + '/API/settings/v1/system/current/', {
          method: 'PATCH', headers, body: JSON.stringify(body)
        }).catch(() => null);
        if (r?.ok) results.push('✅ systemSettings : mis à jour');
        else results.push('❌ systemSettings : PATCH échoué (' + (r?.status || '?') + ')');
      } catch(e) { results.push('❌ systemSettings : ' + e.message); }
      _ddProgTick('systemSettings');
      continue;
    }

    // ✅ Custom Actions SD : endpoint dynamique par context + résolution metadata_view
    if (sc === 'customActions') {
      try {
        // Fetch vues destination pour résolution metadata_view
        const dstViewsForCA = await fetch(base+'/API/metadata/v1/views/?per_page=500',{headers})
          .then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]}));
        const dstViewIdByName = {};
        (dstViewsForCA.objects||[]).forEach(v => { if(v?.name) dstViewIdByName[v.name.toLowerCase().trim()] = v.id; });

        const r = await fetch(base + def.ep + '?per_page=500', { headers }).catch(() => null);
        const existing = r?.ok ? ((await r.json().catch(() => ({}))).objects || []) : [];
        const dstByTitle = {};
        (existing || []).forEach(o => { const k = (o.title||o.name||'').toLowerCase(); if (k) dstByTitle[k] = o; });

        let created = 0, updated = 0, failed = 0;
        for (const src of (def.data() || [])) {
          const context = String(src.context || 'BULK').toUpperCase();
          const epCtx = '/API/assets/v1/custom_actions/' + context + '/';
          const key = (src.title||src.name||src.nom||'').toLowerCase();
          const dst = dstByTitle[key];
          const body = def.body(src, !dst, null, dstViewIdByName);

          if (!dst) {
            const r2 = await fetch(base + epCtx, {
              method: 'POST', headers, body: JSON.stringify(body)
            }).catch(() => null);
            if (r2?.ok) created++; else failed++;
          } else if (mode === 'add_update' || mode === 'overwrite') {
            const r2 = await fetch(base + epCtx + dst.id + '/', {
              method: 'PUT', headers, body: JSON.stringify(body)
            }).catch(() => null);
            if (r2?.ok) updated++; else failed++;
          }
        }
        const parts = [];
        if (created) parts.push(created + ' créées');
        if (updated) parts.push(updated + ' mises à jour');
        if (failed) parts.push(failed + ' échecs');
        // App Token à reconfigurer manuellement
        const withAppId = (def.data()||[]).filter(o=>o.app_id);
        if (withAppId.length) parts.push('⚠️ '+withAppId.length+' App Token(s) à reconfigurer: '+withAppId.map(o=>o.title||o.name).join(', '));
        results.push('✅ customActions' + (parts.length ? ' : ' + parts.join(', ') : ''));
      } catch(e) { results.push('❌ customActions : ' + e.message); }
      _ddProgTick('customActions');
      continue;
    }

    // ✅ Collections SD : création hiérarchique depuis APS
    if (sc === 'collections') {
      try {
        if (status) status.textContent = 'Collections — chargement destination…';

        // Fetch TOUTES les collections destination (paginé)
        if (status) status.textContent = 'Collections — chargement destination (paginé)…';
        const _dstAllDocs = await (async () => {
          let all = [], page = 1;
          while (true) {
            const r = await fetch(base+'/API/search/v1/search/?per_page=500&page='+page, {
              method:'POST', headers,
              body: JSON.stringify({doc_types:['collections']})
            }).then(r=>r.ok?r.json():{}).catch(()=>({}));
            all = all.concat(r.objects||[]);
            if (!r.objects?.length || page>=(r.pages||1) || page>50) break;
            page++;
          }
          return all;
        })();

        // Hydrater via GET /collections/{id}/ pour avoir parent_id fiable
        // (le search retourne in_collections mais pas parent_id)
        if (status) status.textContent = 'Collections — hydratation destination…';
        const dstById = {};
        const _hydBatch = 10;
        for (let _hi=0; _hi<_dstAllDocs.length; _hi+=_hydBatch) {
          const chunk = _dstAllDocs.slice(_hi, _hi+_hydBatch);
          const hydRes = await Promise.allSettled(chunk.map(c =>
            fetch(base+'/API/assets/v1/collections/'+encodeURIComponent(c.id)+'/', {headers})
              .then(r=>r.ok?r.json():null).catch(()=>null)
          ));
          hydRes.forEach(res => {
            const obj = res.value;
            if (obj?.id) dstById[obj.id] = obj;
          });
        }

        // Index destination : "parentId|title" → collection (parent_id fiable depuis hydratation)
        const dstByKey = {};
        Object.values(dstById).forEach(c => {
          const pid = c.parent_id || (Array.isArray(c.in_collections)&&c.in_collections[0]) || null;
          const k = (pid||'root')+'|'+(c.title||c.name||'').toLowerCase().trim();
          if (!dstByKey[k]) dstByKey[k] = { ...c, _pid: pid };
        });

        // Source : APS collections triées en ordre topologique
        // Garde-fou : ne jamais pousser les collections stockage
        const isStorageCol = c => /^stockage/i.test((c._path||c.name||c.nom||c.title||'').trim());
        const srcCols = (_snapCollections||[]).filter(c => c?.id && !c.date_deleted && !isStorageCol(c));
        const srcById = {};
        srcCols.forEach(c => { srcById[c.id] = c; });

        // Tri topologique : parents avant enfants
        const children = {};
        const roots = [];
        srcCols.forEach(c => {
          const pid = c.parent_id || (Array.isArray(c.in_collections)&&c.in_collections[0]) || null;
          if (pid && srcById[pid]) {
            if (!children[pid]) children[pid] = [];
            children[pid].push(c.id);
          } else roots.push(c.id);
        });
        const topo = [];
        const walk = (id) => { topo.push(id); (children[id]||[]).forEach(walk); };
        roots.forEach(walk);

        // ── Pré-remplissage sdColIdMap ────────────────────────────────────────
        // Pour les collections déjà existantes en destination, on construit
        // le mapping srcId → dstId AVANT la boucle topo, en parcourant l'arbo
        // src dans l'ordre topologique et en matchant côté dst par parentDstId+titre.
        // Sans ça, les enfants d'une collection existante ne trouvent pas leur parent
        // → dstPid = null → clé "root|titre" → doublon créé.
        const sdColIdMap = {};
        {
          for (const srcId of topo) {
            const s = srcById[srcId];
            if (!s) continue;
            const title = (s.title||s.name||s.nom||'').trim();
            if (!title) continue;
            const srcPid = s.parent_id || (Array.isArray(s.in_collections)&&s.in_collections[0]) || null;
            // dstPid : utiliser le mapping déjà construit (parents avant enfants en topo)
            const dstPid = srcPid ? (sdColIdMap[srcPid]||null) : null;
            const k = (dstPid||'root')+'|'+title.toLowerCase().trim();
            const existing = dstByKey[k];
            if (existing) {
              sdColIdMap[srcId] = String(existing.id);
            }
          }
        }

        let created=0, updated=0, skipped=0, failed=0;
        let i=0;
        if (_jm) _jm.progress(0, topo.length, '');
        for (const srcId of topo) {
          const src = srcById[srcId];
          if (!src) continue;
          i++;
          if (i%50===0 && status) status.textContent = 'Collections — '+i+'/'+topo.length+'…';
          // checkpoint pause/stop
          if (_jm) {
            _jm.progress(i, topo.length, src.title||src.name||'');
            const go = await _jm.checkpoint();
            if (!go) { results.push('⏹ Collections interrompues à '+i+'/'+topo.length); break; }
          }

          const title = (src.title||src.name||src.nom||'').trim();
          if (!title) { skipped++; continue; }

          // Résoudre parent_id destination
          const srcPid = src.parent_id || (Array.isArray(src.in_collections)&&src.in_collections[0]) || null;
          const dstPid = srcPid ? (sdColIdMap[srcPid]||null) : null;

          const k = (dstPid||'root')+'|'+title.toLowerCase().trim();
          const existing = dstByKey[k];

          if (existing) {
            // Collection déjà présente
            sdColIdMap[srcId] = String(existing.id);
            if (mode === 'add_update') {
              // Mettre à jour titre et parent si nécessaire
              const needsPatch = (existing.title||'').trim() !== title ||
                (dstPid && String(existing.parent_id||'') !== String(dstPid));
              if (needsPatch) {
                const body = { title };
                if (dstPid) body.parent_id = dstPid;
                await fetch(base+'/API/assets/v1/collections/'+existing.id+'/', {
                  method:'PATCH', headers, body: JSON.stringify(body)
                }).catch(()=>null);
                existing.title = title;
                if (dstPid) existing.parent_id = dstPid;
                updated++;
              } else {
                skipped++;
              }
            } else {
              skipped++;
            }
            continue;
          }

          // Créer la collection (absente en destination)
          const r = await fetch(base+'/API/assets/v1/collections/', {
            method:'POST', headers,
            body: JSON.stringify({ title })
          }).catch(()=>null);

          if (r?.ok) {
            const obj = await r.json().catch(()=>null);
            if (obj?.id) {
              sdColIdMap[srcId] = obj.id;
              dstByKey[(dstPid||'root')+'|'+title.toLowerCase().trim()] = obj;
              // PATCH parent_id si nécessaire
              if (dstPid) {
                for (let attempt=1; attempt<=3; attempt++) {
                  const rp = await fetch(base+'/API/assets/v1/collections/'+obj.id+'/', {
                    method:'PATCH', headers,
                    body: JSON.stringify({parent_id: dstPid})
                  }).catch(()=>null);
                  if (rp?.ok) break;
                  await new Promise(r=>setTimeout(r,300*attempt));
                }
              }
              created++;
            }
          } else {
            failed++;
            const t = await r?.text().catch(()=>'');
            console.warn('[SD collections POST]', r?.status, title, t.slice(0,100));
          }
        }

        // Stocker sdColIdMap pour les automations
        window.__aps_sd_col_id_map = sdColIdMap;

        const parts=[];
        if (created) parts.push(created+' créées');
        if (updated) parts.push(updated+' mises à jour');
        if (skipped) parts.push(skipped+' existantes');
        if (failed) parts.push(failed+' échecs');
        results.push('✅ collections : '+parts.join(', '));
        _ddProgTick('collections');
      } catch(e) { results.push('❌ collections : '+e.message); _ddProgTick('collections'); }
      continue;
    }

    // ✅ Automations SD : résolution collection_id via map path→id
    if (sc === 'automations') {
      try {
        // Fetch vues + groups destination pour résolution des IDs dans les actions
        const [dstViewsForAuto, dstGroupsForAuto, dstTeamsForAuto] = await Promise.all([
          fetch(base+'/API/metadata/v1/views/?per_page=500',{headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
          fetch(base+'/API/users/v1/role_groups/?per_page=500',{headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
          fetch(base+'/API/users/v1/teams/?per_page=500',{headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        ]);
        const dstViewIdByNameAuto = {};
        (dstViewsForAuto.objects||[]).forEach(v => { if(v?.name) dstViewIdByNameAuto[v.name.toLowerCase().trim()] = v.id; });
        const dstGroupIdByName = {};
        [...(dstGroupsForAuto.objects||[]), ...(dstTeamsForAuto.objects||[])].forEach(g => {
          if (g?.name) dstGroupIdByName[g.name.toLowerCase().trim()] = g.id;
        });

        // Utiliser sdColIdMap si disponible (créé par le handler collections SD)
        // Sinon construire map _path→id depuis la destination
        let colIdMap3 = {};
        if (window.__aps_sd_col_id_map && Object.keys(window.__aps_sd_col_id_map).length) {
          // sdColIdMap est src_id → dst_id — inverser en _path → dst_id
          const srcCols3 = _snapCollections||[];
          srcCols3.forEach(c => {
            const dstId = window.__aps_sd_col_id_map[c.id];
            if (dstId && c._path) colIdMap3[c._path.toLowerCase().trim()] = dstId;
          });
        } else {
          // Fallback : construire depuis l'API destination
          const dstColsR3 = await fetch(base+'/API/search/v1/search/', {
            method:'POST', headers,
            body: JSON.stringify({doc_types:['collections'], per_page:500})
          }).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]}));
          const dstColById3 = {};
          (dstColsR3.objects||[]).forEach(c => { if (c?.id) dstColById3[c.id] = c; });
          const memo3 = {};
          function getPath3(id, d=0) {
            if (d>25||!id||!dstColById3[id]) return '';
            if (memo3[id]) return memo3[id];
            const c = dstColById3[id];
            const name = (c.title||c.name||'').trim();
            const pid = c.parent_id||(Array.isArray(c.in_collections)&&c.in_collections[0])||null;
            if (!pid||!dstColById3[pid]) return (memo3[id]=name);
            return (memo3[id]=getPath3(pid,d+1)+' / '+name);
          }
          Object.keys(dstColById3).forEach(id => { const p=getPath3(id); if(p) colIdMap3[p.toLowerCase().trim()]=id; });
        }

        const existing3 = await fetch(base+def.ep+'?per_page=500',{headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]}));
        const keyFn3 = o => (o.name||o.nom||'').toLowerCase();
        const dstMap3 = {};
        (existing3.objects||[]).forEach(o => { const k=keyFn3(o); if(k) dstMap3[k]=o; });

        let created=0, updated=0, failed=0;
        const _autoList = def.data()||[];
        if (_jm) _jm.progress(0, _autoList.length, '');
        let _autoDone = 0;
        for (const src of _autoList) {
          // checkpoint pause/stop
          if (_jm) {
            _jm.progress(++_autoDone, _autoList.length, src.name||src.nom||'');
            const go = await _jm.checkpoint();
            if (!go) { results.push('⏹ Automations interrompues à '+_autoDone+'/'+_autoList.length); break; }
          }
          const key = keyFn3(src);
          const dst = dstMap3[key];
          const body = def.body(src, !dst, colIdMap3, dstViewIdByNameAuto, dstGroupIdByName);
          if (!dst) {
            const r2 = await fetch(base+def.ep, {method:'POST',headers,body:JSON.stringify(body)}).catch(()=>null);
            if (r2?.ok) created++; else { failed++; const t=await r2?.text().catch(()=>''); console.warn('[SD automations POST]', r2?.status, t.slice(0,200)); }
          } else if (mode==='add_update'||mode==='overwrite') {
            const r2 = await fetch(base+def.ep+dst.id+'/', {method:'PUT',headers,body:JSON.stringify(body)}).catch(()=>null);
            if (r2?.ok) updated++; else failed++;
          }
        }
        const parts=[];
        if (created) parts.push(created+' créées');
        if (updated) parts.push(updated+' mises à jour');
        if (failed) parts.push(failed+' échecs');
        results.push('✅ automations'+(parts.length?' : '+parts.join(', '):''));
      } catch(e) { results.push('❌ automations : '+e.message); }
      _ddProgTick('automations');
      continue;
    }

    try {
      // Lire existants sur la cible (via fetchExisting si défini, sinon endpoint standard)
      let existing = [];
      if (def.fetchExisting) {
        existing = await def.fetchExisting(base, headers);
      } else {
        const r = await fetch(base+def.ep+'?per_page=500',{headers}).catch(()=>null);
        existing = r?.ok ? ((await r.json().catch(()=>({}))).objects||[]) : [];
      }
      const keyFn = o => (o.name||o.title||o.nom||'').toLowerCase();
      const { created, updated, deleted } = await applySyncMode(
        mode, def.data(), existing, base, headers, def.ep, def.body, keyFn, {usePatch: !!def.usePatch}
      );
      const parts = [];
      if (created) parts.push(created + ' créés');
      if (updated) parts.push(updated + ' mis à jour');
      if (deleted) parts.push(deleted + ' supprimés');
      _ddProgTick(sc);
    results.push('✅ ' + sc + (parts.length ? ' : ' + parts.join(', ') : ''));
    } catch(e) {
      _ddProgTick(sc);
      results.push('❌ '+sc+' : '+e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
// ✅ Phase 1bis : PUSH CATEGORIES (Site → Domaine)
// Catégories = par object_type (assets/collections/segments/custom_actions),
// comme dans Domaine→Site (syncIconik scope categories).
// ─────────────────────────────────────────────────────────────
if (doAll || scopes.includes('categories')) {
  if (status) status.textContent = 'categories…';

  const SYSTEM_CAT_NAMES_SD = new Set(['default','generic','tag','tags','uncategorized','none']);
  const catsLocal = ((typeof wfdGetCategoriesForSync === 'function')
    ? wfdGetCategoriesForSync()
    : (categoriesData.categories || [])
  ).filter(c => {
    const n = (c.name||c.nom||'').toLowerCase().trim();
    return !SYSTEM_CAT_NAMES_SD.has(n);
  });

  // Endpoints par object type (aligné sur ton fetch Domaine→Site) [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-settings.js)
  const catEndpoints = {
    assets: '/API/metadata/v1/assets/categories/',
    collections: '/API/metadata/v1/collections/categories/',
    segments: '/API/metadata/v1/segments/categories/',
    custom_actions: '/API/metadata/v1/custom_actions/categories/'
  };

  // Helpers pour ton modèle local canonique + compat legacy [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-settings.js)
  const getTypes = (cat) => {
    if (Array.isArray(cat?.object_types)) return cat.object_types;
    if (Array.isArray(cat?.appliqueeA)) return cat.appliqueeA; // legacy compat
    return [];
  };
  const getViewNames = (cat) => {
    if (Array.isArray(cat?.metadataViews)) return cat.metadataViews;
    return [];
  };

  // Résolution view name -> id (pour view_ids) [3](https://github.com/arpankg/iconik-tagger)
  const viewsR = await fetch(base + '/API/metadata/v1/views/?per_page=500', { headers })
    .then(r => r.ok ? r.json() : ({objects:[]}))
    .catch(() => ({objects:[]}));

  const viewIdByName = {};
  (viewsR.objects || []).forEach(v => {
    const k = String(v.name || '').toLowerCase().trim();
    if (k) viewIdByName[k] = v.id;
  });

  // Lire l’existant par endpoint (name -> objet existant)
  const existingByType = {};
  for (const [type, ep] of Object.entries(catEndpoints)) {
    const r = await fetch(base + ep + '?per_page=500', { headers })
      .then(x => x.ok ? x.json() : ({objects:[]}))
      .catch(() => ({objects:[]}));

    const map = {};
    (r.objects || []).forEach(c => {
      const k = String(c.name || '').toLowerCase().trim();
      if (k) map[k] = c;
    });
    existingByType[type] = map;
  }

  let created = 0, updated = 0, deleted = 0, skipped = 0;

  // 1) CREATE / UPDATE
  for (const cat of (catsLocal || [])) {
    const name = cat.name || cat.nom || '';
    if (!name) { skipped++; continue; }

    const nameKey = String(name).toLowerCase().trim();
    const label = cat.label || cat.nom || cat.name || '';

    const viewNames = getViewNames(cat)
      .map(v => String(v || '').toLowerCase().trim())
      .filter(Boolean);

    const view_ids = viewNames.map(n => viewIdByName[n]).filter(Boolean);

    const body = { name, label, view_ids };

    for (const type of getTypes(cat)) {
      const ep = catEndpoints[type];
      if (!ep) continue;

      const existing = existingByType[type]?.[nameKey];

      // add_only : ne crée pas si existe, mais met quand même à jour les view_ids si vides
      if (mode === 'add_only' && existing) {
        const existingViewIds = existing.view_ids || [];
        if (existingViewIds.length === 0 && view_ids.length > 0) {
          // Mettre à jour les vues même en add_only
          const catKey = existing.name || nameKey;
          await fetch(base + ep + encodeURIComponent(catKey) + '/', {
            method: 'PUT', headers,
            body: JSON.stringify(body)
          }).catch(() => null);
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!existing) {
        // CREATE
        const r = await fetch(base + ep, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        }).catch(() => null);
        if (r && r.ok) created++;
      } else {
        // UPDATE (add_update / overwrite) — catégories : endpoint par name pas id
        if (mode === 'add_update' || mode === 'overwrite') {
          // Utiliser le nom exact Iconik (préserver la casse originale)
          const catKey = encodeURIComponent(existing.name || nameKey);
          const r = await fetch(base + ep + catKey + '/', {
            method: 'PUT',
            headers,
            body: JSON.stringify({...body, name: existing.name || body.name})
          }).catch(() => null);
          if (r && r.ok) updated++;
        }
      }
    }
  }

  // 2) DELETE extras (overwrite) — suppression par type
  // ⚠️ garde-fou : on ne supprime jamais les catégories système (default/generic/tag)
  if (mode === 'overwrite') {
    const SYSTEM_CAT_KEYS = new Set(['default', 'generic', 'tag']);

    // desiredByType[type] = Set(nameKey)
    const desiredByType = {};
    for (const cat of (catsLocal || [])) {
      const name = cat.name || cat.nom || '';
      if (!name) continue;
      const nameKey = String(name).toLowerCase().trim();

      for (const type of getTypes(cat)) {
        if (!catEndpoints[type]) continue;
        if (!desiredByType[type]) desiredByType[type] = new Set();
        desiredByType[type].add(nameKey);
      }
    }

    for (const [type, map] of Object.entries(existingByType)) {
      const desired = desiredByType[type] || new Set();
      const ep = catEndpoints[type];
      if (!ep) continue;

      for (const [nameKey, existing] of Object.entries(map || {})) {
        if (!existing?.id) continue;

        // garde-fou : ne jamais toucher aux “system cats”
        if (SYSTEM_CAT_KEYS.has(nameKey)) continue;

        if (!desired.has(nameKey)) {
          await fetch(base + ep + encodeURIComponent(existing.name || '') + '/', {
            method: 'DELETE',
            headers
          }).catch(() => null);
          deleted++;
        }
      }
    }
  }

  // 3) PUSH defaultViewsByType — associations MD Views sur catégories système (Default/Generic)
  // Garde-fou : uniquement si toggle "Inclure catégories système" actif
  // Ne crée jamais les catégories système, ne les supprime jamais — uniquement PUT view_ids
  const _sysCatToggle = document.getElementById('toggle-sys-cats-src-sd-' + (typeof safeEnvId !== 'undefined' ? safeEnvId : ''))
    || document.getElementById('toggle-sys-cats-src-dd-' + (typeof envId !== 'undefined' ? envId : ''));
  const _includeSysCatsSD = _sysCatToggle ? _sysCatToggle.checked : (wfdIncludeSystemCategories?.() ?? false);

  // Pousser toujours les associations Default (plus considérée système dans APS),
  // et les autres catégories système uniquement si le toggle est actif.
  if (true) {
    let defaultsUpdated = 0;
    const dvbt = (typeof categoriesData !== 'undefined' && categoriesData?.defaultViewsByType) || {};
    // Map catName → object_types
    const CAT_SYSTEM_ENDPOINTS = {
      assets:         { catName: 'default',  ep: '/API/metadata/v1/assets/categories/default/'         },
      collections:    { catName: 'default',  ep: '/API/metadata/v1/collections/categories/default/'    },
      segments:       { catName: 'generic',  ep: '/API/metadata/v1/segments/categories/generic/'       },
      custom_actions: { catName: 'default',  ep: '/API/metadata/v1/custom_actions/categories/default/' },
      search:         { catName: 'default',  ep: '/API/metadata/v1/search/categories/default/'         },
    };
    for (const [objType, { catName, ep }] of Object.entries(CAT_SYSTEM_ENDPOINTS)) {
      const entry = dvbt[objType];
      if (!entry || !Array.isArray(entry.view_ids) || !entry.view_ids.length) continue;
      // Résoudre les view_ids src → ids dst par nom
      const srcViewNames = entry.viewNames || [];
      const dstViewIds = srcViewNames.map(n => viewIdByName[String(n).toLowerCase().trim()]).filter(Boolean);
      if (!dstViewIds.length) continue;
      // GET d'abord pour récupérer name/label/object_type exacts (requis par l'API)
      const existing = await fetch(base + ep, { headers }).then(r=>r.ok?r.json():null).catch(()=>null);
      if (!existing) continue;
      const r = await fetch(base + ep, {
        method: 'PUT', headers,
        body: JSON.stringify({ name: existing.name, label: existing.label, object_type: existing.object_type, view_ids: dstViewIds })
      }).catch(() => null);
      if (r && r.ok) defaultsUpdated++;
    }
    if (defaultsUpdated) results.push(`✅ categories système (Default/Generic) : ${defaultsUpdated} mises à jour (view_ids)`);
  }

  _ddProgTick('categories');
  results.push(`✅ categories : ${created} créées, ${updated} mises à jour, ${deleted} supprimées, ${skipped} ignorées`);
}

  // ── Phase 2 : Associations (ACLs + Role Groups) ─────────────────────────────
const doAssoc = scopes.includes('all') || scopes.includes('teams') || scopes.includes('roleGroups');
if (doAssoc) {
  if (status) status.textContent = 'Résolution des IDs cible…';

  // Helper: permissions ACL (read/write/delete/change-acl) en fonction des flags locaux
  // L’API ACL accepte read/write/delete/change-acl. 
  const permsFromAssoc = (assoc) => {
    const flags = (assoc?.permission_flags || assoc?.permissionFlags || assoc?.flags || [])
      .map(x => String(x).toLowerCase());
    const perms = new Set();

    perms.add('read');

    const isRW = assoc?.permission === 'Read & Write';
    if (isRW || flags.includes('write') || flags.includes('delete') || flags.includes('change-acl')) perms.add('write');
    if (flags.includes('delete')) perms.add('delete');
    if (flags.includes('change-acl')) perms.add('change-acl');

    return [...perms];
  };

  // Lire index nom→id sur la cible
  const tgtTeamsR = await fetch(base + '/API/users/v1/teams/?per_page=500', { headers }).then(r=>r.json()).catch(()=>({}));
  // Charger toutes les collections destination via search (pas juste les racines)
  const _tgtColsAll = await (async () => {
    let all = [], page = 1;
    while (true) {
      const r = await fetch(base + '/API/search/v1/search/?per_page=500&page=' + page, {
        method: 'POST', headers,
        body: JSON.stringify({ doc_types: ['collections'] })
      }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      all = all.concat(r.objects || []);
      if (!r.objects?.length || page >= (r.pages || 1) || page > 50) break;
      page++;
    }
    return all;
  })();
  const tgtColsR = { objects: _tgtColsAll };
  const tgtViewsR = await fetch(base + '/API/metadata/v1/views/?per_page=500', { headers }).then(r=>r.json()).catch(()=>({}));
  const tgtRGsR   = await fetch(base + '/API/users/v1/role_groups/?per_page=500', { headers }).then(r=>r.json()).catch(()=>({}));

  // ✅ NOUVEAU : Saved Searches + Storages (pour ACLs complètes)
  const tgtSSr = await fetch(base + '/API/search/v1/search/saved/?per_page=500', { headers }).then(r=>r.json()).catch(()=>({}));
  const tgtStr = await fetch(base + '/API/files/v1/storages/?per_page=500', { headers }).then(r=>r.json()).catch(()=>({}));

  const teamIdMap = {}; (tgtTeamsR.objects||[]).forEach(t => { teamIdMap[(t.name||'').toLowerCase().trim()] = t.id; });
  // Index collections destination : chemin complet (_path) → id
  // Nécessaire car team.collections[].nom peut être un chemin type "PRODUCTION / BJ Communication / Popi"
  const _tgtColById = {};
  (tgtColsR.objects||[]).forEach(c => { if (c?.id) _tgtColById[String(c.id)] = c; });
  function _buildTgtColPath(id, depth=0) {
    if (!id || depth > 30) return '';
    const c = _tgtColById[id];
    if (!c) return '';
    const name = (c.title || c.name || '').trim();
    if (!c.parent_id || !_tgtColById[c.parent_id]) return name;
    return _buildTgtColPath(c.parent_id, depth + 1) + ' / ' + name;
  }
  const colIdMap = {};
  (tgtColsR.objects||[]).forEach(c => {
    if (!c?.id) return;
    // Index par nom court (fallback)
    const shortName = (c.title || c.name || '').toLowerCase().trim();
    if (shortName && !colIdMap[shortName]) colIdMap[shortName] = c.id;
    // Index par chemin complet (prioritaire)
    const path = _buildTgtColPath(c.id);
    if (path) colIdMap[path.toLowerCase().trim()] = c.id;
  });
  const viewIdMap = {}; (tgtViewsR.objects||[]).forEach(v => { viewIdMap[(v.name||'').toLowerCase().trim()] = v.id; });
  const rgIdMap   = {}; (tgtRGsR.objects||[]).forEach(rg  => { rgIdMap[(rg.name||'').toLowerCase().trim()]  = rg.id; });

  const ssIdMap = {};
  (tgtSSr.objects || []).forEach(s => {
    const k = String(s.name || s.title || '').toLowerCase().trim();
    if (k) ssIdMap[k] = s.id;
  });

  const stIdMap = {};
  (tgtStr.objects || []).forEach(s => {
    const k = String(s.name || '').toLowerCase().trim();
    if (k) stIdMap[k] = s.id;
  });

  // Teams → ACLs via PUT /API/acls/v1/groups/{gid}/acl/{type}/{key}/ 
  if (scopes.includes('all') || scopes.includes('teams')) {

    // A) Collections — direct ET propagating (inherited = recalculé auto par Iconik)
    if (status) status.textContent = 'ACLs Teams → Collections…';
    for (const team of wfdGetTeamsForSync()) {
      const tgtGId = teamIdMap[(team.name||team.nom||'').toLowerCase().trim()];
      if (!tgtGId) continue;

      for (const col of (team.collections||[])) {
        // Résoudre par chemin complet (_path) en priorité, fallback sur nom court
        const _colKey = (col._path || col.nom || col.name || '').toLowerCase().trim();
        const tgtColId = colIdMap[_colKey];
        if (!tgtColId) continue;

        const flags = (col.permission_flags || col.permissionFlags || col.flags || [])
          .map(x => String(x).toLowerCase());

        // inherited → recalculé automatiquement par Iconik depuis les parents, on skip
        if (flags.includes('inherited')) continue;

        const perms = permsFromAssoc(col);

        if (flags.includes('propagates')) {
          // Propagating ACL : endpoint dédié
          await fetch(base + '/API/acls/v1/acl/_propagating_collections/', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              object_keys: [String(tgtColId)],
              group_ids:   [String(tgtGId)],
              permissions: perms,
              user_ids:    []
            })
          }).catch(()=>{});
        } else {
          // Direct ACL
          await fetch(base + '/API/acls/v1/groups/' + tgtGId + '/acl/collections/' + tgtColId + '/', {
            method: 'PUT',
            headers,
            body: JSON.stringify({ permissions: perms })
          }).catch(()=>{});
        }
      }
    }

    // B) Metadata Views — skip inherited (recalculé auto), pousse direct + propagating en direct
    if (status) status.textContent = 'ACLs Teams → MD Views…';
    for (const team of wfdGetTeamsForSync()) {
      const tgtGId = teamIdMap[(team.name||team.nom||'').toLowerCase().trim()];
      if (!tgtGId) continue;

      for (const vue of (team.vues||[])) {
        const flags = (vue.permission_flags || vue.permissionFlags || vue.flags || [])
          .map(x => String(x).toLowerCase());

        // inherited → recalculé auto par Iconik, on skip
        if (flags.includes('inherited')) continue;

        const tgtViewId = viewIdMap[String(vue.nom || vue.name || '').toLowerCase().trim()];
        if (!tgtViewId) continue;

        const perms = permsFromAssoc(vue);
        await fetch(base + '/API/acls/v1/groups/' + tgtGId + '/acl/metadata_views/' + tgtViewId + '/', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ permissions: perms })
        }).catch(()=>{});
      }
    }

    // ✅ C) Saved Searches
    if (status) status.textContent = 'ACLs Teams → Saved Searches…';
    for (const team of wfdGetTeamsForSync()) {
      const tgtGId = teamIdMap[(team.name||team.nom||'').toLowerCase().trim()];
      if (!tgtGId) continue;

      for (const ss of (team.savedSearches||[])) {
        const tgtSSId = ssIdMap[String(ss.nom || ss.name || '').toLowerCase().trim()];
        if (!tgtSSId) continue;

        const perms = permsFromAssoc(ss);
        await fetch(base + '/API/acls/v1/groups/' + tgtGId + '/acl/saved_searches/' + tgtSSId + '/', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ permissions: perms })
        }).catch(()=>{});
      }
    }

    // ✅ D) Storages
    if (status) status.textContent = 'ACLs Teams → Storages…';
    for (const team of wfdGetTeamsForSync()) {
      const tgtGId = teamIdMap[(team.name||team.nom||'').toLowerCase().trim()];
      if (!tgtGId) continue;

      for (const st of (team.storages||[])) {
        const tgtStId = stIdMap[String(st.nom || st.name || '').toLowerCase().trim()];
        if (!tgtStId) continue;

        const perms = permsFromAssoc(st);
        await fetch(base + '/API/acls/v1/groups/' + tgtGId + '/acl/storages/' + tgtStId + '/', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ permissions: perms })
        }).catch(()=>{});
      }
    }

    results.push('✅ ACLs Teams (Collections/Views/SavedSearches/Storages) créées');
  }

  // Role Groups : roles + role_categories via PUT /API/users/v1/role_groups/{id}/ (membership users manuel)
  if (scopes.includes('all') || scopes.includes('roleGroups')) {
    if (status) status.textContent = 'Role Groups → Rôles…';
    for (const rg of _snapRoleGroups) {
      const tgtRGId = rgIdMap[(rg.name || rg.nom || '').toLowerCase().trim()];
      if (!tgtRGId) continue;

      await fetch(base + '/API/users/v1/role_groups/' + tgtRGId + '/', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          roles: rg.roles?.length ? rg.roles : (rg.fonctionnalites || []),
          role_categories: rg.role_categories || {},
        })
      }).catch(() => {});
    }
    results.push('✅ Role Groups → Rôles créés');
  }
}

  // ── Phase 3 : Team Settings SD ─────────────────────────────────────────────
  if (doAll || scopes.includes('teams')) {
    if (status) status.textContent = 'Team Settings…';
    try {
      // Maps de résolution destination (déjà fetchées plus haut)
      const dstTeamByName  = {};
      const dstViewIdByName = {};
      const dstStorageIdByName = {};
      const dstColPathById = {};

      // Fetch teams, views, storages destination
      const [dstTeamsR2, dstViewsR2, dstStoragesR2, dstColsR2] = await Promise.all([
        fetch(base+'/API/users/v1/teams/?per_page=500',      {headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        fetch(base+'/API/metadata/v1/views/?per_page=500',   {headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        fetch(base+'/API/files/v1/storages/?per_page=500',   {headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        fetch(base+'/API/search/v1/search/?doc_types=["collections"]&per_page=500', {headers}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
      ]);

      (dstTeamsR2.objects||[]).forEach(t => { dstTeamByName[(t.name||'').toLowerCase().trim()] = t.id; });
      (dstViewsR2.objects||[]).forEach(v => { dstViewIdByName[(v.name||'').toLowerCase().trim()] = v.id; });
      (dstStoragesR2.objects||[]).forEach(s => { dstStorageIdByName[(s.name||'').toLowerCase().trim()] = s.id; });

      // Map _path → id pour les collections destination
      const dstColByPath = {};
      const buildDstColPath = (() => {
        const colById2 = {};
        (dstColsR2.objects||[]).forEach(c => { if (c?.id) colById2[c.id] = c; });
        const memo = {};
        function getPath(id, d=0) {
          if (d>25||!id) return '';
          if (memo[id]) return memo[id];
          const c = colById2[id];
          if (!c) return (memo[id]='');
          const name = (c.title||c.name||'').trim();
          const pid = c.parent_id||(Array.isArray(c.in_collections)&&c.in_collections[0])||null;
          if (!pid||!colById2[pid]) return (memo[id]=name);
          return (memo[id]=getPath(pid,d+1)+' / '+name);
        }
        return getPath;
      })();
      (dstColsR2.objects||[]).forEach(c => {
        const p = buildDstColPath(c.id);
        if (p) dstColByPath[p.toLowerCase().trim()] = c.id;
      });

      const TEAM_SETTINGS_SKIP_SD = new Set(['group_id','system_domain_id','client_ip',
        'logo_storage_id','logo_url','jobs_dashboard','allowed_ips','delete_grace_period',
        'facet_fields','search_display_fields','search_auto_resize_title_column']);

      const TEAM_VIEW_KEYS_SD = ['search_view_id','filters_default_metadata_view_id',
        'search_results_asset_metadata_view_id','search_results_collection_metadata_view_id'];

      const NULLABLE_KEYS_SD = new Set(['search_in_transcriptions','append_asset_uuid_to_downloads',
        'use_asset_name_on_download','hide_favourites','collections_get_parent_acls',
        'acl_template_id','share_expiration_time','date_format','datetime_format']);

      let copied=0, skipped=0, failed=0;

      for (const team of (_snapTeams||[])) {
        const teamKey = String(team.name||team.nom||'').toLowerCase().trim();
        if (!teamKey) { skipped++; continue; }
        if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(teamKey)) { skipped++; continue; }

        const dstTeamId = dstTeamByName[teamKey];
        if (!dstTeamId) { skipped++; continue; }

        // team.teamSettings = settings fetchés lors de la DS
        const teamSettings = team.teamSettings;
        if (!teamSettings) { skipped++; continue; }

        const body = {};
        for (const [k, v] of Object.entries(teamSettings)) {
          if (TEAM_SETTINGS_SKIP_SD.has(k)) continue;
          if (v === undefined) continue;

          // Nullable : envoyer null explicitement
          if (v === null) {
            if (NULLABLE_KEYS_SD.has(k)) body[k] = null;
            continue;
          }

          // View ID keys : résoudre par nom
          if (TEAM_VIEW_KEYS_SD.includes(k)) {
            // APS stocke l'ID source — on cherche le nom via metadataViewsData
            const viewName = (metadataViewsData?.metadataViews||[]).find(v2=>v2.id===v)?.name;
            const dstId = viewName ? dstViewIdByName[viewName.toLowerCase().trim()] : null;
            if (dstId) body[k] = dstId;
            continue;
          }

          // required_metadata_views : tableau d'IDs → résoudre chacun par nom
          if (k === 'required_metadata_views' && Array.isArray(v)) {
            const resolved = v.map(srcId => {
              const view = (metadataViewsData?.metadataViews||[]).find(v2=>v2.id===srcId);
              const viewName = view?.name;
              return viewName ? dstViewIdByName[viewName.toLowerCase().trim()] : null;
            }).filter(Boolean);
            if (resolved.length) body[k] = resolved;
            continue;
          }

          // home_page : /collection/{srcId} → résoudre par _path
          if (k === 'home_page' && typeof v === 'string' && v.startsWith('/collection/')) {
            const srcColId = v.replace('/collection/', '');
            const col = (_snapCollections||[]).find(c=>c.id===srcColId);
            const colPath = col?._path;
            const dstColId = colPath ? dstColByPath[colPath.toLowerCase().trim()] : null;
            if (dstColId) body[k] = '/collection/' + dstColId;
            continue;
          }

          // default_upload_storage_id : résoudre par nom storage APS
          if (k === 'default_upload_storage_id') {
            const storageName = (storagesData.storages||[]).find(s=>s.id===v)?.name;
            const dstId = storageName ? dstStorageIdByName[storageName.toLowerCase().trim()] : null;
            if (dstId) body[k] = dstId;
            continue;
          }

          body[k] = v;
        }

        if (!Object.keys(body).length) { skipped++; continue; }

        const r = await fetch(base+'/API/settings/v1/team/'+dstTeamId+'/', {
          method: 'PATCH', headers, body: JSON.stringify(body)
        }).catch(()=>null);
        if (r?.ok) copied++; else failed++;
      }

      const parts = [];
      if (copied)  parts.push(copied+' copiés');
      if (skipped) parts.push(skipped+' ignorés');
      if (failed)  parts.push(failed+' échecs');
      results.push('✅ teamSettings : '+parts.join(', '));
    } catch(e) { results.push('❌ teamSettings : '+e.message); }
  }

  if (status) {
    status.style.color='var(--accent)';
    status.innerHTML=results.join('<br>');
  }
  if (_jm) _jm.done(results);
  toast('Push terminé');
}

// ─── Domaine ↔ Domaine ────────────────────────────────────────────────────────
async function lancerDomaineDomaine(nomSource, envId) {
  const dirBtn = document.getElementById('dd-dir-'+envId);
  const selEl  = document.getElementById('dd-target-'+envId);
  const status = document.getElementById('dd-status-'+envId);
  if (!selEl||!status) return;

  const isRev   = dirBtn?.dataset.rev === '1';
  const srcName = isRev ? selEl.value : nomSource;
  const dstName = isRev ? nomSource   : selEl.value;
  const src = appTokensData.appTokens.find(t=>t.name===srcName);
  const dst = appTokensData.appTokens.find(t=>t.name===dstName);
  if (!src||!dst) { toast('Environnement introuvable',true); return; }

  if (dst.environment==='prod') {
    const cb = document.getElementById('dd-confirm-'+envId);
    if (!cb?.checked) { toast('Confirmez la cible Production',true); return; }
  }

  const scopes = getCheckedScopes('dd', envId);
  const mode   = getSyncMode('dd', envId);
  if (!scopes.length) { toast('Cochez au moins un périmètre', true); return; }

  // ── VERROU anti-drama (Domaine ↔ Domaine) ─────────────────────────────
  // 1) overwrite => confirmation forte
  if (mode === 'overwrite') {
  const ok = await askTypedConfirm({
    title: '[WFD] Mode OVERWRITE (Domaine ↔ Domaine)',
    message: 'Cette action peut SUPPRIMER des éléments sur la destination.\n\nTape exactement : OVERWRITE',
    expected: 'OVERWRITE',
    placeholder: 'OVERWRITE'
  });
  if (!ok) { toast('Annulé : confirmation OVERWRITE manquante', true); return; }
}

  // 2) destination PROD => confirmation renforcée
  if (String(dst.environment || '').toLowerCase() === 'prod') {
  const ok = await askTypedConfirm({
    title: '[WFD] CIBLE = PRODUCTION (Domaine ↔ Domaine)',
    message: `Destination : ${dstName}\n\nTape exactement : PROD`,
    expected: 'PROD',
    placeholder: 'PROD'
  });
  if (!ok) { toast('Annulé : confirmation PROD manquante', true); return; }
}

const doAll  = scopes.includes('all');
const active = doAll
  ? ['collections','metadataViews','metadata','teams','roleGroups','savedSearches','storages','categories','webhooks','customActions','automations','relationTypes','systemSettings']
  : scopes;

  const srcBase = _ikBase(src);
  const dstBase = _ikBase(dst);
  const srcH = {'Content-Type':'application/json'};
  const dstH = {'Content-Type':'application/json'};

  // ── Job Manager ──
  const _jmDD = window.WFD_JobManager;
  if (_jmDD) _jmDD.start({ kind: 'DD', label: 'Domaine → Domaine', env: srcName + ' → ' + dstName, scopeLabel: scopes.join(', ') });

  // =======================================================
  // DD — Collections : création parent→enfant + mapping srcId→dstId
  // (ne supprime pas en overwrite: trop risqué; objectif = complétude)
  // =======================================================
  const ddColIdMap = {}; // srcCollectionId -> dstCollectionId

  function _colKey(parentId, name) {
    return String(parentId || 'root') + '|' + String(name || '').toLowerCase().trim();
  }

  async function syncCollectionsDD() {
  const stats = { created: 0, updated: 0, failed: 0, failures: {} };

  // 1) Get IDs via Search (fast), then hydrate via /assets/v1/collections/{id}/ (reliable parent_id)
  const srcDocs = await wfdFetchAllCollectionsSearch(srcBase, srcH).catch(() => []);
  const dstDocs = await wfdFetchAllCollectionsSearch(dstBase, dstH).catch(() => []);

  const srcIds = (srcDocs || []).map(d => d && d.id).filter(Boolean);
  const dstIds = (dstDocs || []).map(d => d && d.id).filter(Boolean);

  const srcDetailById = await wfdHydrateCollectionsDetails(srcBase, srcH, srcIds, { concurrency: 10 }).catch(() => ({}));
  const dstDetailById = await wfdHydrateCollectionsDetails(dstBase, dstH, dstIds, { concurrency: 10 }).catch(() => ({}));

  function normFromDetail(j){
    if(!j || !j.id) return null;
    return {
      id: String(j.id),
      title: String(j.title || j.name || j.nom || '').trim() || String(j.id),
      parent_id: (function(){ const pid = wfdColParentId(j); return pid ? String(pid) : null; })(),
      date_deleted: j.date_deleted || null,
      status: j.status || null,
      storage_id: j.storage_id ? String(j.storage_id) : null,
    };
  }

  const srcCols = Object.values(srcDetailById).map(normFromDetail).filter(c => c && !c.date_deleted);
  const dstColsAll = Object.values(dstDetailById).map(normFromDetail).filter(Boolean);

  // IMPORTANT: ignore soft-deleted collections on destination so they don't block recreations
  const dstCols = dstColsAll.filter(c => !c.date_deleted);

  const srcById = {};
  (srcCols || []).forEach(c => { srcById[c.id] = c; });

  // Build children map from source
  const children = {};
  const roots = [];
  (srcCols || []).forEach(c => {
    const pid = c.parent_id;
    if (pid && srcById[pid]) {
      if (!children[pid]) children[pid] = [];
      children[pid].push(c.id);
    } else {
      roots.push(c.id);
    }
  });

  // Topo order
  const topo = [];
  const walk = (id) => {
    topo.push(id);
    (children[id] || []).forEach(walk);
  };
  roots.forEach(walk);

  // --- Skip Storage-mapped collections (identified by storage_id) ---
  // We skip the whole subtree to avoid orphan children being recreated at root.
  const mappedIds = (srcCols || []).filter(c => c && c.storage_id).map(c => c.id);
  const skip = new Set();
  const markSubtree = (id) => {
    if(!id || skip.has(id)) return;
    skip.add(id);
    (children[id] || []).forEach(markSubtree);
  };
  mappedIds.forEach(markSubtree);
  const topoFiltered = topo.filter(id => !skip.has(id));


  const key = (parentId, title) => String(parentId || 'root') + '|' + String(title || '').toLowerCase().trim();

  // Destination index
  const dstByKey = {};
  (dstCols || []).forEach(c => { dstByKey[key(c.parent_id, c.title)] = c; });

  // Retry helper
  async function bumpFailure(r){
    const st = r ? r.status : 'ERR';
    stats.failed++;
    stats.failures[st] = (stats.failures[st] || 0) + 1;
  }

  async function createCollection(title){
    const r = await fetch(dstBase + '/API/assets/v1/collections/', {
      method: 'POST',
      headers: dstH,
      body: JSON.stringify({ title: title })
    }).catch(() => null);
    if (r && r.ok) {
      const obj = await r.json().catch(() => null);
      stats.created++;
      return obj;
    }
    await bumpFailure(r);
    return null;
  }

  async function patchParent(dstId, parentId){
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(dstBase + '/API/assets/v1/collections/' + encodeURIComponent(dstId) + '/', {
        method: 'PATCH',
        headers: dstH,
        body: JSON.stringify({ parent_id: parentId })
      }).catch(() => null);
      if (r && r.ok) return true;
      if (attempt === 3) { await bumpFailure(r); return false; }
      await new Promise(res => setTimeout(res, 250 * attempt));
    }
    return false;
  }

  async function patchTitle(dstId, title){
    const r = await fetch(dstBase + '/API/assets/v1/collections/' + encodeURIComponent(dstId) + '/', {
      method: 'PATCH',
      headers: dstH,
      body: JSON.stringify({ title: title })
    }).catch(() => null);
    if (r && r.ok) { stats.updated++; return true; }
    await bumpFailure(r);
    return false;
  }

  // Main
  

  // Progress (UI)
  const total = topoFiltered.length;
  let done = 0;
  const progressFn = (typeof window.wfdSyncProgressInit === 'function') ? window.wfdSyncProgressInit('DD Collections', total, 'wfd-sync-progress-anchor') : null;
  const statusEl = (typeof status !== 'undefined') ? status : null;
  if (statusEl && statusEl.textContent !== undefined) statusEl.textContent = `DD Collections : 0/${total}`;

  try {
for (const srcId of topoFiltered) {
    const s = srcById[srcId];
    if (!s) continue;

    done++;
    if (progressFn && (done % 2 === 0 || done === total)) progressFn(done);
    if (statusEl && (done % 5 === 0 || done === total)) {
      statusEl.textContent = `DD Collections : ${done}/${total} — ${String(s.title || s.name || s.id || '')}`;
    }
    if (done % 25 === 0) await new Promise(r => setTimeout(r, 0));
    // checkpoint pause/stop
    if (_jmDD) {
      _jmDD.progress(done, total, s.title || s.name || '');
      const go = await _jmDD.checkpoint();
      if (!go) { if (statusEl) statusEl.textContent = '⏹ Collections interrompues à ' + done + '/' + total; break; }
    }


    const parentDstId = s.parent_id ? (ddColIdMap[s.parent_id] || null) : null;
    const k = key(parentDstId, s.title);

    let existing = dstByKey[k];

    if (!existing) {
      // create as root then move
      const createdObj = await createCollection(s.title);
      if (!createdObj || !createdObj.id) continue;

      const newId = String(createdObj.id);
      ddColIdMap[srcId] = newId;

      if (parentDstId) {
        await patchParent(newId, parentDstId);
      }

      dstByKey[k] = { id: newId, title: s.title, parent_id: parentDstId };
      continue;
    }

    ddColIdMap[srcId] = existing.id;

    if (mode === 'add_update' || mode === 'overwrite') {
      if (String(existing.parent_id || '') !== String(parentDstId || '')) {
        if (parentDstId) {
          await patchParent(existing.id, parentDstId);
          existing.parent_id = parentDstId;
        }
      }
      if (String(existing.title || '') !== String(s.title || '')) {
        await patchTitle(existing.id, s.title);
        existing.title = s.title;
      }
    }
  }

  } finally {
    if (typeof window.wfdSyncProgressDone === 'function') window.wfdSyncProgressDone();
    if (statusEl && statusEl.textContent !== undefined) statusEl.textContent = `DD Collections : ${total}/${total} — terminé`;

    // Re-indexer les collections destination pour corriger in_collections et ACL propagation
    try {
      if (statusEl) statusEl.textContent = 'DD Collections : re-indexation…';
      const dstColIds = Object.values(ddColIdMap);
      // Batch de 200 max
      for (let i = 0; i < dstColIds.length; i += 200) {
        const batch = dstColIds.slice(i, i + 200);
        await fetch(dstBase + '/API/assets/v1/reindex/bulk/', {
          method: 'POST', headers: dstH,
          body: JSON.stringify({
            object_ids: batch, object_type: 'collections',
            realms: ['ACL', 'FORMATS', 'IN_COLLECTIONS'],
            include_assets: false, include_collections: true, sync_to_another_dc: true
          })
        }).catch(() => null);
      }
      if (statusEl) statusEl.textContent = 'DD Collections : re-indexation terminée';
    } catch(e) { console.warn('reindex failed:', e); }
  }


  stats._srcCols = srcCols;
    stats._topoFiltered = topoFiltered;
    stats._srcById = srcById;
    stats._children = children;
    stats._roots = roots;
    return stats;
}

 const EP = {
    collections  : {r:'/API/assets/v1/collections/',            w:'/API/assets/v1/collections/',   get:r=>r.objects||[], body:o=>({name:o.name,parent_id:o.parent_id||null})},
    metadataViews: {r:'/API/metadata/v1/views/?per_page=500',       w:'/API/metadata/v1/views/',        get:r=>r.objects||[], body:o=>({name:o.name,description:o.description||''})},
    metadata     : {r:'/API/metadata/v1/fields/?per_page=500',      w:'/API/metadata/v1/fields/',       get:r=>r.objects||[], body:o=>{
      const useFacet = (o.use_as_facet===true) || (o.use_in_filters===true);
      const isBlock  = (o.is_block_field===true) || (o.block_assets===true);
      const isWarn   = (o.is_warning_field===true) || (o.display_as_warning===true);
      const multiVal=(o.multi===true)||(o.multiselect===true); const b={name:o.name,label:o.label,description:o.description||'',field_type:o.field_type,options:o.options||[],required:(o.required===true),read_only:(o.read_only===true),hide_if_not_set:(o.hide_if_not_set===true),use_as_facet:useFacet,is_block_field:isBlock,is_warning_field:isWarn,multi:multiVal,multiselect:multiVal}; if (o.min_value!=null) b.min_value=o.min_value; if (o.max_value!=null) b.max_value=o.max_value; if (o.mapped_field_name) b.mapped_field_name=o.mapped_field_name; return b;}},
    teams        : {r:'/API/users/v1/teams/?per_page=500',         w:'/API/users/v1/teams/',          get:r=>r.objects||[], body:o=>({name:o.name, description:o.description||'', default_user_type:o.default_user_type||'STANDARD', saml_primary_group_priority:o.saml_primary_group_priority||0})},
    roleGroups   : {r:'/API/users/v1/role_groups/?per_page=500',    w:'/API/users/v1/role_groups/',     get:r=>r.objects||[], body:o=>({name:o.name, roles: o.roles||[], role_categories: o.role_categories||{}})},
    webhooks     : {r:'/API/notifications/v1/webhooks/?per_page=500',w:'/API/notifications/v1/webhooks/',get:r=>r.objects||[],body:(o,isNew)=>({name:o.name,description:o.description||'',url:o.url,status:'DISABLED',event_type:o.event_type,realm:o.realm,operation:o.operation,query:o.query||'',headers:o.headers||{}})},
    systemSettings: {r:'/API/settings/v1/merged/current/', w:'/API/settings/v1/system/current/', get:r=>r, body:o=>{
      const KEYS = ['default_share_options','share_expiration_time','external_share','allow_invites_by_link',
        'allow_share_magic_link_creation','enforce_magic_link_allowlist','search_users_from_share',
        'watermark_options','watermark','search_in_transcriptions','collections_get_parent_acls',
        'lock_mapped_collections','append_asset_uuid_to_downloads','use_asset_name_on_download',
        'custom_terms','hide_favourites','home_page',
        'asset_default_sections','search_default_sections','search_display_fields',
        'required_metadata_views','facet_fields'];
      const out = {};
      KEYS.forEach(k => { if (o[k] !== undefined) out[k] = o[k]; });
      return out;
    }},
    relationTypes: {r:'/API/assets/v1/assets/relation_types/?per_page=500', w:'/API/assets/v1/assets/relation_types/', get:r=>(r.objects||[]).filter(o=>!o.is_system), body:o=>({name:o.name,directional:o.is_directional||false,source_label:o.source_label||'',destination_label:o.destination_label||'',description:o.description||''})},
    customActions: {r:'/API/assets/v1/custom_actions/?per_page=500', w:'/API/assets/v1/custom_actions/', get:r=>r.objects||[], body:(o, isNew, mdvMap)=>{ const b = {title:o.title||o.name,type:o.type||'POST',context:o.context||'ASSET',url:o.url,headers:o.headers||{},disabled:true}; if (o.metadata_view) { const dstMdvId = mdvMap ? mdvMap[o.metadata_view] : null; b.metadata_view = dstMdvId || o.metadata_view; } return b; }, contextEp: true},
    automations  : {r:'/API/automations/v1/automations/?per_page=500', w:'/API/automations/v1/automations/',get:r=>r.objects||[], body:(o,isNew)=>({name:o.name,status:'INACTIVE',triggers:o.triggers||[],conditions:o.conditions||[],actions:o.actions||[]})},
    savedSearches: {r:'/API/search/v1/search/saved/?per_page=500',    w:'/API/search/v1/search/saved/',   get:r=>r.objects||[], body:o=>({name:(o.name||o.title||''), criteria:(o.criteria||o.query||o.search_criteria||{})})},
  };

  const results = [];
  const orderedActive = (active||[]).slice().sort((a,b)=>({metadata:1,metadataViews:2,collections:0}[a]??10)-({metadata:1,metadataViews:2,collections:0}[b]??10));

  // ── Progress bar globale DD ──
  let _ddDone = 0;
  const _ddTotal = orderedActive.length;
  const _ddProg = (typeof window.wfdSyncProgressInit === 'function')
    ? window.wfdSyncProgressInit('DD Synchronisation', _ddTotal, 'wfd-sync-progress-anchor')
    : null;
  const _ddProgTick = (label) => {
    _ddDone++;
    if (_ddProg) _ddProg(_ddDone);
    if (status) status.textContent = label || (orderedActive[_ddDone-1] + '…');
  };

  for (const sc of orderedActive) {
    // ✅ Collections: création hiérarchique + mapping srcId→dstId
    if (sc === 'collections') {
      if (status) status.textContent = 'collections…';
      const r = await syncCollectionsDD();
      const parts = [];
      if (r.created) parts.push(r.created + ' créés');
      if (r.updated) parts.push(r.updated + ' mis à jour');
      if (r.failed) {
        const top = Object.entries(r.failures || {}).sort((a,b)=>b[1]-a[1]).slice(0,3)
          .map(([k,v])=>k+':'+v).join(', ');
        parts.push(r.failed + ' échecs' + (top ? ' ('+top+')' : ''));
      }
      _ddProgTick(sc);
      results.push('✅ ' + sc + (parts.length ? ' : ' + parts.join(', ') : ''));
      continue;
    }

    // ✅ Metadata Views: création avec view_fields requis
    if (sc === 'metadataViews') {
      if (status) status.textContent = 'metadataViews…';
      const r = await syncMetadataViewsDD();
      const parts = [];
      if (r.created) parts.push(r.created + ' créés');
      if (r.updated) parts.push(r.updated + ' mis à jour');
      if (r.failed) {
        const top = Object.entries(r.failures || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+':'+v).join(', ');
        parts.push(r.failed + ' échecs' + (top ? ' ('+top+')' : ''));
      }
      _ddProgTick(sc);
      results.push('✅ ' + sc + (parts.length ? ' : ' + parts.join(', ') : ''));
      continue;
    }


    const def = EP[sc]; if (!def) continue;
    if (status) status.textContent = sc+'…';

    // ✅ Automations DD : résolution metadata_view_id dans actions
    if (sc === 'automations') {
      try {
        // Index vues src→dst
        const srcAutoViewsR = await fetch(srcBase + '/API/metadata/v1/views/?per_page=500', { headers: srcH }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        const dstAutoViewsR = await fetch(dstBase + '/API/metadata/v1/views/?per_page=500', { headers: dstH }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        const srcAutoViewNameById = {};
        (srcAutoViewsR.objects||[]).forEach(v=>{ if(v?.id) srcAutoViewNameById[v.id]=v.name; });
        const dstAutoViewIdByName = {};
        (dstAutoViewsR.objects||[]).forEach(v=>{ if(v?.name) dstAutoViewIdByName[v.name.toLowerCase().trim()]=v.id; });

        // Index teams src→dst (pour résolution group_ids dans actions ACL)
        const srcAutoTeamsR = await fetch(srcBase + '/API/users/v1/teams/?per_page=500', { headers: srcH }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        const dstAutoTeamsR = await fetch(dstBase + '/API/users/v1/teams/?per_page=500', { headers: dstH }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        const srcTeamNameById = {};
        (srcAutoTeamsR.objects||[]).forEach(t=>{ if(t?.id) srcTeamNameById[t.id]=t.name; });
        const dstTeamIdByName = {};
        (dstAutoTeamsR.objects||[]).forEach(t=>{ if(t?.name) dstTeamIdByName[t.name.toLowerCase().trim()]=t.id; });

        const resolveGroupId = (srcId) => {
          const name = srcTeamNameById[srcId];
          if (!name) return srcId;
          return dstTeamIdByName[name.toLowerCase().trim()] || srcId;
        };

        // Helper : résolution des IDs domaine-spécifiques dans parameters
        // Construire le mapping collections src→dst via recherche (toutes les collections)
        const fetchAllColIds = async (base, headers) => {
          const out = {}; let page = 1;
          while (true) {
            const r = await fetch(base + '/API/search/v1/search/?per_page=500&page=' + page, {
              method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
              body: JSON.stringify({doc_types: ['collections']})
            }).then(r=>r.ok?r.json():{}).catch(()=>({}));
            (r.objects||[]).forEach(c=>{ if(c?.id) out[c.id] = c.title||c.name||''; });
            if (!r.objects?.length || page >= (r.pages||1) || page > 50) break;
            page++;
          }
          return out;
        };
        const srcColNameById = await fetchAllColIds(srcBase, srcH);
        const dstColsAllR = await fetchAllColIds(dstBase, dstH);
        const dstColIdByName = {};
        Object.entries(dstColsAllR).forEach(([id, name]) => {
          if (name) dstColIdByName[name.toLowerCase().trim()] = id;
        });
        const resolveColId = (srcId) => {
          if (!srcId) return srcId;
          // D'abord ddColIdMap si disponible
          if (typeof ddColIdMap !== 'undefined' && ddColIdMap[srcId]) return ddColIdMap[srcId];
          // Sinon résolution par nom
          const name = srcColNameById[srcId];
          if (name) return dstColIdByName[name.toLowerCase().trim()] || srcId;
          return srcId;
        };

        const resolveParams = (params) => {
          const p = {...params};
          // metadata_view_id → résolution src→dst par nom
          if (p.metadata_view_id) {
            const viewName = srcAutoViewNameById[p.metadata_view_id];
            const dstId = viewName ? dstAutoViewIdByName[viewName.toLowerCase().trim()] : null;
            if (dstId) p.metadata_view_id = dstId;
          }
          // collection_id (singulier)
          if (p.collection_id) p.collection_id = resolveColId(p.collection_id);
          // collection_ids (pluriel, tableau)
          if (Array.isArray(p.collection_ids)) p.collection_ids = p.collection_ids.map(resolveColId);
          // objects → actions ACL UPDATE_ACL : résolution group_ids
          if (Array.isArray(p.objects)) {
            p.objects = p.objects.map(obj => {
              if (!Array.isArray(obj.group_ids)) return obj;
              return { ...obj, group_ids: obj.group_ids.map(resolveGroupId) };
            });
          }
          // storage_id → non mappable, conservé
          return p;
        };

        const resolveActions = (actions) => (actions||[]).map(action => ({
          ...action, parameters: resolveParams(action.parameters||{})
        }));

        const resolveTriggers = (triggers) => (triggers||[]).map(trigger => ({
          ...trigger, parameters: resolveParams(trigger.parameters||{})
        }));

        const srcAutoList = await fetch(srcBase + '/API/automations/v1/automations/?per_page=500', { headers: srcH })
          .then(r=>r.ok?r.json():{}).catch(()=>({}));
        const dstAutoList = await fetch(dstBase + '/API/automations/v1/automations/?per_page=500', { headers: dstH })
          .then(r=>r.ok?r.json():{}).catch(()=>({}));
        const dstAutoByName = {};
        (dstAutoList.objects||[]).forEach(a=>{ const k=(a.name||'').toLowerCase().trim(); if(k) dstAutoByName[k]=a; });

        let created=0, updated=0, failed=0;
        for (const src of (srcAutoList.objects||[])) {
          const key = (src.name||'').toLowerCase().trim();
          if (!key) continue;
          const body = {
            name: src.name,
            status: 'INACTIVE',
            triggers: resolveTriggers(src.triggers),
            conditions: src.conditions||[],
            actions: resolveActions(src.actions),
          };
          const dst = dstAutoByName[key];
          if (!dst) {
            const r = await fetch(dstBase + '/API/automations/v1/automations/', {
              method:'POST', headers:dstH, body:JSON.stringify(body)
            }).catch(()=>null);
            if (r?.ok) created++; else failed++;
          } else if (mode==='add_update'||mode==='overwrite') {
            const r = await fetch(dstBase + '/API/automations/v1/automations/' + dst.id + '/', {
              method:'PUT', headers:dstH, body:JSON.stringify(body)
            }).catch(()=>null);
            if (r?.ok) updated++; else failed++;
          }
        }
        const parts=[];
        if (created) parts.push(created+' créées');
        if (updated) parts.push(updated+' mises à jour');
        if (failed) parts.push(failed+' échecs');
        _ddProgTick('automations');
        results.push('✅ automations'+(parts.length?' : '+parts.join(', '):''));
      } catch(e) { _ddProgTick('automations'); results.push('❌ automations : '+e.message); }
      continue;
    }

    // ✅ System Settings DD : PATCH singleton
    if (sc === 'systemSettings') {
      try {
        // Lire depuis system/current (valeurs système brutes, pas fusionnées avec les teams)
        const srcSettings = await fetch(srcBase + '/API/settings/v1/system/current/', { headers: srcH })
          .then(r => r.ok ? r.json() : null).catch(() => null);
        if (!srcSettings) { results.push('❌ systemSettings : lecture source échouée'); continue; }

        const body = def.body(srcSettings);
        const r = await fetch(dstBase + '/API/settings/v1/system/current/', {
          method: 'PATCH', headers: dstH, body: JSON.stringify(body)
        }).catch(() => null);

        if (r?.ok) results.push('✅ systemSettings : mis à jour');
        else results.push('❌ systemSettings : PATCH échoué (' + (r?.status || '?') + ')');
      } catch(e) { results.push('❌ systemSettings : ' + e.message); }
      continue;
    }

    // ✅ Saved Searches DD : groupes + searches + nettoyage criteria + résolution metadata_view_id
    if (sc === 'savedSearches') {
      try {
        // Index vues source → destination
        const srcMdvsR = await fetch(srcBase + '/API/metadata/v1/views/?per_page=500', { headers: srcH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        const dstMdvsR = await fetch(dstBase + '/API/metadata/v1/views/?per_page=500', { headers: dstH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        const srcMdvNameById = {};
        (srcMdvsR.objects || []).forEach(v => { if (v?.id) srcMdvNameById[v.id] = v.name; });
        const dstMdvIdByName = {};
        (dstMdvsR.objects || []).forEach(v => { if (v?.name) dstMdvIdByName[v.name.toLowerCase().trim()] = v.id; });

        // Helper : nettoyer + résoudre criteria
        const cleanCriteria = (raw) => {
          const SKIP_TERMS = new Set(['created_by_user', 'files.storage_id', 'storage_id']);
          const cleanTerms = (raw.filter?.terms || []).filter(t => !SKIP_TERMS.has(t.name));
          const c = { ...raw };
          if (cleanTerms.length) c.filter = { operator: raw.filter?.operator || 'AND', terms: cleanTerms };
          else delete c.filter;
          if (c.metadata_view_id) {
            const name = srcMdvNameById[c.metadata_view_id];
            const dstId = name ? dstMdvIdByName[name.toLowerCase().trim()] : null;
            if (dstId) c.metadata_view_id = dstId; else delete c.metadata_view_id;
          }
          return c;
        };

        // Helper : upsert une saved search sur destination
        const dstSSByName = {};
        const upsertSS = async (srcSS, dstGroupId) => {
          const detail = await fetch(srcBase + '/API/search/v1/search/saved/' + srcSS.id + '/', { headers: srcH })
            .then(r => r.ok ? r.json() : null).catch(() => null);
          if (!detail) return null;
          const raw = detail.search_criteria_document?.criteria || detail.criteria || {};
          const body = { name: srcSS.name || '', criteria: cleanCriteria(raw) };
          const key = (srcSS.name || '').toLowerCase().trim();

          let dstSS = dstSSByName[key];
          if (!dstSS) {
            const r = await fetch(dstBase + '/API/search/v1/search/saved/', {
              method: 'POST', headers: dstH, body: JSON.stringify(body)
            }).catch(() => null);
            if (r?.ok) { dstSS = await r.json().catch(() => null); if (dstSS) dstSSByName[key] = dstSS; return { dstSS, isNew: true }; }
            return null;
          } else if (mode === 'add_update' || mode === 'overwrite') {
            const r = await fetch(dstBase + '/API/search/v1/search/saved/' + dstSS.id + '/', {
              method: 'PUT', headers: dstH, body: JSON.stringify(body)
            }).catch(() => null);
            if (r?.ok) return { dstSS, isNew: false };
          }
          return { dstSS, isNew: false };
        };

        // Charger destination searches existantes
        const dstListR = await fetch(dstBase + '/API/search/v1/search/saved/?per_page=500', { headers: dstH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        (dstListR.objects || []).forEach(s => { const k = (s.name||'').toLowerCase().trim(); if (k) dstSSByName[k] = s; });

        let created = 0, updated = 0, failed = 0;

        // 1) Groupes source → créer groupes destination + assigner searches
        const srcGroups = await fetch(srcBase + '/API/search/v1/search/saved/groups/?per_page=500', { headers: srcH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        const dstGroups = await fetch(dstBase + '/API/search/v1/search/saved/groups/?per_page=500', { headers: dstH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        const dstGroupByName = {};
        (dstGroups.objects || []).forEach(g => { const k = (g.name||'').toLowerCase().trim(); if (k) dstGroupByName[k] = g; });

        for (const srcGrp of (srcGroups.objects || [])) {
          const gKey = (srcGrp.name || '').toLowerCase().trim();

          // Créer groupe destination si absent
          let dstGrp = dstGroupByName[gKey];
          if (!dstGrp) {
            const r = await fetch(dstBase + '/API/search/v1/search/saved/group/', {
              method: 'POST', headers: dstH, body: JSON.stringify({ name: srcGrp.name })
            }).catch(() => null);
            if (r?.ok) { dstGrp = await r.json().catch(() => null); if (dstGrp) dstGroupByName[gKey] = dstGrp; }
          }
          if (!dstGrp?.id) continue;

          // Searches du groupe source
          const grpSearches = await fetch(srcBase + '/API/search/v1/search/saved/?group_id=' + srcGrp.id + '&per_page=500', { headers: srcH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
          for (const srcSS of (grpSearches.objects || [])) {
            const res = await upsertSS(srcSS, dstGrp.id);
            if (!res) { failed++; continue; }
            res.isNew ? created++ : updated++;
            // Assigner à groupe destination
            await fetch(dstBase + '/API/search/v1/search/saved/group/' + dstGrp.id + '/search/' + res.dstSS.id + '/', {
              method: 'POST', headers: dstH
            }).catch(() => null);
          }
        }

        // 2) Searches sans groupe (group_id=null)
        const noGrpList = await fetch(srcBase + '/API/search/v1/search/saved/?group_id=null&per_page=500', { headers: srcH }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        for (const srcSS of (noGrpList.objects || [])) {
          const res = await upsertSS(srcSS, null);
          if (!res) { failed++; continue; }
          res.isNew ? created++ : updated++;
        }

        const parts = [];
        if (created) parts.push(created + ' créées');
        if (updated) parts.push(updated + ' mises à jour');
        if (failed) parts.push(failed + ' échecs');
        results.push('✅ savedSearches' + (parts.length ? ' : ' + parts.join(', ') : ''));
      } catch(e) { results.push('❌ savedSearches : ' + e.message); }
      _ddProgTick('savedSearches');
      continue;
    }

    // ✅ Custom Actions : endpoint dynamique par context (/API/assets/v1/custom_actions/{CONTEXT}/)
    if (sc === 'customActions') {
      try {
        const itemsRaw = await fetchAllPages(srcBase, srcH, def.r).catch(()=>[]);
        const items = def.get ? def.get({ objects: itemsRaw }) : (itemsRaw || []);
        const dstRaw = await fetchAllPages(dstBase, dstH, def.r).catch(()=>[]);
        const dstItems = def.get ? def.get({ objects: dstRaw }) : (dstRaw || []);
        const dstByTitle = {};
        (dstItems || []).forEach(o => { const k = (o.title||o.name||'').toLowerCase(); if (k) dstByTitle[k] = o; });

        // Construire mdvMap : srcMdvId → dstMdvId (via nom)
        const srcMdvs = await fetchAllPages(srcBase, srcH, '/API/metadata/v1/views/').catch(()=>[]);
        const dstMdvs = await fetchAllPages(dstBase, dstH, '/API/metadata/v1/views/').catch(()=>[]);
        const srcMdvNameById = {};
        (srcMdvs || []).forEach(v => { if (v?.id) srcMdvNameById[v.id] = v.name; });
        const dstMdvIdByName = {};
        (dstMdvs || []).forEach(v => { if (v?.name) dstMdvIdByName[v.name.toLowerCase().trim()] = v.id; });
        const mdvMap = {}; // srcId -> dstId
        Object.entries(srcMdvNameById).forEach(([srcId, name]) => {
          const dstId = dstMdvIdByName[name.toLowerCase().trim()];
          if (dstId) mdvMap[srcId] = dstId;
        });

        let created = 0, updated = 0, failed = 0;
        for (const src of (items || [])) {
          const context = String(src.context || 'BULK').toUpperCase();
          const epContext = '/API/assets/v1/custom_actions/' + context + '/';
          const key = (src.title||src.name||'').toLowerCase();
          const dst = dstByTitle[key];
          const body = def.body(src, !dst, mdvMap);

          if (!dst) {
            const r = await fetch(dstBase + epContext, {
              method: 'POST', headers: dstH, body: JSON.stringify(body)
            }).catch(() => null);
            if (r?.ok) created++; else failed++;
          } else if (mode === 'add_update' || mode === 'overwrite') {
            const r = await fetch(dstBase + epContext + dst.id + '/', {
              method: 'PUT', headers: dstH, body: JSON.stringify(body)
            }).catch(() => null);
            if (r?.ok) updated++; else failed++;
          }
        }
        const parts = [];
        if (created) parts.push(created + ' créées');
        if (updated) parts.push(updated + ' mises à jour');
        if (failed) parts.push(failed + ' échecs');
        results.push('✅ customActions' + (parts.length ? ' : ' + parts.join(', ') : ''));
      } catch(e) { results.push('❌ customActions : ' + e.message); }
      continue;
    }

    try {
      const itemsRaw = await fetchAllPages(srcBase, srcH, def.r).catch(()=>[]);
      let items = def.get ? def.get({ objects: itemsRaw }) : (itemsRaw || []);
      // ✅ Filtre teams système (Everyone / Administrator) en Domaine↔Domaine
      if (sc === 'teams' && !wfdIncludeSystemTeams()) {
        items = (items || []).filter(t => !wfdIsSystemTeam(t?.name || t?.nom || ''));
      }
      // ✅ Filtre MDV système (Segment Tags) en Domaine↔Domaine
      if (sc === 'metadataViews' && typeof wfdIncludeSystemMetadataViews === 'function' && typeof wfdIsSystemMetadataView === 'function') {
      if (!wfdIncludeSystemMetadataViews()) {
      items = (items || []).filter(v => !wfdIsSystemMetadataView(v?.name || v?.nom || v?.title || v));
  }
}
      const dstRaw = await fetchAllPages(dstBase, dstH, def.r).catch(()=>[]);
      const dstItems = def.get ? def.get({ objects: dstRaw }) : (dstRaw || []);
      // metadata : keyFn case-sensitive (ActualiteEvenement ≠ Actualiteevenement)
      // Tous les autres scopes : lowercase pour matching souple
      const keyFn = (sc === 'metadata')
        ? o => (o.name || o.title || '')          // case-sensitive
        : o => (o.name || o.title || '').toLowerCase();
      // Détecter les doublons de casse dans metadata source (anomalie Iconik)
      if (sc === 'metadata') {
        const _seen = {};
        (items || []).forEach(o => {
          const k = (o.name || '').toLowerCase();
          if (_seen[k] && _seen[k] !== o.name) {
            console.warn('[WFD Sync] ⚠️ Metadata doublon de casse détecté :', _seen[k], '≠', o.name, '— les deux seront synchronisés');
          }
          _seen[k] = o.name;
        });
      }
      const { created, updated, deleted, failed, failures } = await applySyncMode(
        mode, items, dstItems, dstBase, dstH, def.w, def.body, keyFn
      );
      const parts = [];
      if (created) parts.push(created + ' créés');
      if (updated) parts.push(updated + ' mis à jour');
      if (deleted) parts.push(deleted + ' supprimés');
      if (failed) {
        const top = Object.entries(failures || {}).sort((a,b)=>b[1]-a[1]).slice(0,3)
          .map(([k,v])=>k+':'+v).join(', ');
        parts.push(failed + ' échecs' + (top ? ' ('+top+')' : ''));
      }
      results.push('✅ ' + sc + (parts.length ? ' : ' + parts.join(', ') : ''));
    } catch(e) { results.push('❌ '+sc+' : '+e.message); }
  }
  
  // =======================================================
// DD — Metadata Views : création avec view_fields (requis)
// =======================================================
async function syncMetadataViewsDD() {
  const stats = { created: 0, updated: 0, failed: 0, failures: {} };

  // 1) Charger views source + destination
  const srcViews = await fetchAllPages(srcBase, srcH, '/API/metadata/v1/views/?per_page=500').catch(()=>[]);
  const dstViews = await fetchAllPages(dstBase, dstH, '/API/metadata/v1/views/?per_page=500').catch(()=>[]);

  // 2) Charger fields source/destination pour mapper les field_id
  const srcFields = await fetchAllPages(srcBase, srcH, '/API/metadata/v1/fields/?per_page=500').catch(()=>[]);
  const dstFields = await fetchAllPages(dstBase, dstH, '/API/metadata/v1/fields/?per_page=500').catch(()=>[]);

  const srcFieldNameById = {};
  (srcFields || []).forEach(f => { if (f?.id && f?.name) srcFieldNameById[f.id] = f.name; });

  const dstFieldIdByName = {};
  (dstFields || []).forEach(f => {
    const name = String(f?.name || '').trim();
    if (!name) return;
    // Sur certains tenants, l’identifiant utilisable peut être id ou name
    dstFieldIdByName[name] = f.id || f.name;
  });

  // 3) Index destination views by name
  const dstViewIdByName = {};
  (dstViews || []).forEach(v => {
    const k = String(v?.name || '').toLowerCase().trim();
    if (k) dstViewIdByName[k] = v.id;
  });

  // helper: récupérer view_fields d’une vue source
  async function fetchViewFieldsSrc(viewId) {
    // Essai 1 : GET view detail (souvent contient view_fields)
    const d = await fetch(srcBase + '/API/metadata/v1/views/' + viewId + '/', { headers: srcH })
      .then(r => r.ok ? r.json() : null)
      .catch(()=>null);

    if (d && Array.isArray(d.view_fields) && d.view_fields.length) return d.view_fields;

    // Essai 2 : fallback endpoint fields
    const f = await fetch(srcBase + '/API/metadata/v1/views/' + viewId + '/fields/?per_page=500', { headers: srcH })
      .then(r => r.ok ? r.json() : null)
      .catch(()=>null);

    return (f && Array.isArray(f.objects)) ? f.objects : [];
  }

  // helper: mapper un view_field source -> payload destination
  function mapViewField(vf, idx) {
    // Cas séparateur : payload spécial, pas de field_id
    if (vf.field_type === '__separator__' || vf.name === '__separator__') {
      return {
        name: '__separator__',
        label: vf.label || '',
        field_type: '__separator__'
      };
    }

    // vf peut contenir field_id OU name selon endpoint
    const srcFieldId = vf.field_id || vf.id || null;
    const srcFieldName = vf.name || vf.field_name || (srcFieldId ? srcFieldNameById[srcFieldId] : null);

    if (!srcFieldName) return null;
    const dstFieldId = dstFieldIdByName[srcFieldName];
    if (!dstFieldId) return null;

    // payload minimal: field_id + name (requis par Iconik) + ordre
    const out = { field_id: dstFieldId, name: srcFieldName, sort_order: idx };

    // best-effort : conserver overrides si présents (sans forcer)
    const allow = ['required','read_only','hide_if_not_set','use_in_filters','string_exact','display_as_warning','block_assets'];
    allow.forEach(k => { if (vf[k] != null) out[k] = vf[k]; });

    // mapped_field_name (inherited from) si présent
    if (vf.mapped_field_name) out.mapped_field_name = vf.mapped_field_name;

    return out;
  }

  // 4) CREATE/UPDATE views
  for (const v of (srcViews || [])) {
    const name = String(v?.name || '').trim();
    if (!name) continue;

    const fieldsSrc = await fetchViewFieldsSrc(v.id).catch(()=>[]);
    const view_fields = (fieldsSrc || [])
      .map((vf, idx) => mapViewField(vf, idx))
      .filter(Boolean);

    // ⚠️ view_fields vide → vue système (ex: Segment Tags) → ignorer silencieusement
    if (!view_fields.length) {
      stats.skipped = (stats.skipped || 0) + 1;
      continue;
    }

    const body = { name, description: (v.description || ''), view_fields };

    const k = name.toLowerCase();
    const dstId = dstViewIdByName[k];

    try {
      if (!dstId) {
        const r = await fetch(dstBase + '/API/metadata/v1/views/', {
          method:'POST', headers: dstH, body: JSON.stringify(body)
        }).catch(()=>null);
        if (r?.ok) stats.created++;
        else {
          stats.failed++;
          const s = r?.status || 'ERR'; stats.failures[s] = (stats.failures[s]||0)+1;
        }
      } else if (mode === 'add_update' || mode === 'overwrite') {
        const r = await fetch(dstBase + '/API/metadata/v1/views/' + dstId + '/', {
          method:'PUT', headers: dstH, body: JSON.stringify(body)
        }).catch(()=>null);
        if (r?.ok) stats.updated++;
        else {
          stats.failed++;
          const s = r?.status || 'ERR'; stats.failures[s] = (stats.failures[s]||0)+1;
        }
      }
    } catch (e) {
      stats.failed++;
      stats.failures.EXCEPTION = (stats.failures.EXCEPTION || 0) + 1;
    }
  }

  // ── Synchroniser les associations vue ↔ object_type (catégorie default) ──
  // Reconstruire dstViewIdByName après création des vues (pour inclure les nouvelles)
  const dstViewsFresh = await fetchAllPages(dstBase, dstH, '/API/metadata/v1/views/?per_page=500').catch(()=>[]);
  (dstViewsFresh || []).forEach(v => {
    const n = String(v?.name || '').toLowerCase().trim();
    if (n && v?.id) dstViewIdByName[n] = v.id;
  });

  // Pour chaque object_type, lire view_ids source, résoudre vers IDs destination, PUT
  // Nom de catégorie par object_type (segments utilise 'generic' au lieu de 'default')
  const OBJ_TYPES = [
    { type: 'assets',         cat: 'default' },
    { type: 'collections',    cat: 'default' },
    { type: 'segments',       cat: 'generic' },
    { type: 'custom_actions', cat: 'default' },
    { type: 'search',         cat: 'default' },
  ];
  for (const { type: objType, cat: catName } of OBJ_TYPES) {
    try {
      const srcCat = await fetch(srcBase + '/API/metadata/v1/' + objType + '/categories/' + catName + '/views/', { headers: srcH })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (!srcCat) continue;

      // Résoudre view_ids source → noms → IDs destination
      // srcViews = liste des vues source (chargée en début de syncMetadataViewsDD)
      const srcViewNameById = {};
      (srcViews || []).forEach(v => { if (v?.id) srcViewNameById[v.id] = v.name; });

      const srcViewIds = srcCat.view_ids || (srcCat.objects || []).map(v => v.id);
      const dstViewIds = (srcViewIds || [])
        .map(srcId => {
          const name = srcViewNameById[srcId];
          if (!name) return null;
          return dstViewIdByName[name.toLowerCase().trim()];
        })
        .filter(Boolean);

      if (!dstViewIds.length) continue;

      // Lire catégorie destination pour merger (add_only) ou écraser (overwrite)
      const dstCat = await fetch(dstBase + '/API/metadata/v1/' + objType + '/categories/' + catName + '/', { headers: dstH })
        .then(r => r.ok ? r.json() : null).catch(() => null);

      let finalIds = dstViewIds;
      if (mode === 'add_only' && dstCat?.view_ids) {
        const existing = new Set(dstCat.view_ids);
        dstViewIds.forEach(id => existing.add(id));
        finalIds = [...existing];
      }

      // Utiliser le nom exact de la catégorie dst (peut être "Default" avec majuscule)
      const dstCatName = dstCat?.name || (catName === 'generic' ? 'Generic' : 'Default');
      await fetch(dstBase + '/API/metadata/v1/' + objType + '/categories/' + encodeURIComponent(dstCatName) + '/', {
        method: 'PUT',
        headers: dstH,
        body: JSON.stringify({ name: dstCatName, label: dstCatName, view_ids: finalIds })
      }).catch(() => null);

    } catch (e) { /* silencieux */ }
  }
  stats.object_types_synced = OBJ_TYPES.length; // assets/collections/segments/custom_actions/search

  return stats;
}

  
  // ─────────────────────────────────────────────────────────────
// ✅ Phase 1bis : CATEGORIES inter-domaines (Domaine ↔ Domaine)
// Source et destination = endpoints par object_type, comme Domaine→Site.
// Support modes : add_only / add_update / overwrite
// Garde-fou : ne supprime jamais default/generic/tag
// ─────────────────────────────────────────────────────────────
if (active.includes('categories')) {
  if (status) status.textContent = 'categories…';

  // Endpoints catégories par object_type (même structure que ton Domaine→Site) 
  const catEndpoints = {
    assets: '/API/metadata/v1/assets/categories/',
    collections: '/API/metadata/v1/collections/categories/',
    segments: '/API/metadata/v1/segments/categories/',
    custom_actions: '/API/metadata/v1/custom_actions/categories/'
  };

  // Helpers : lire toutes les catégories d’un domaine (agrégation par name)
  const fetchViewsMaps = async (baseUrl, H) => {
    const r = await fetch(baseUrl + '/API/metadata/v1/views/?per_page=500', { headers: H })
      .then(x => x.ok ? x.json() : ({ objects: [] }))
      .catch(() => ({ objects: [] }));
    const idToName = {};
    const nameToId = {};
    (r.objects || []).forEach(v => {
      const name = String(v.name || '').trim();
      const key = name.toLowerCase();
      if (v.id && name) {
        idToName[v.id] = name;
        nameToId[key] = v.id;
      }
    });
    return { idToName, nameToId };
  };

  const srcViews = await fetchViewsMaps(srcBase, srcH);
  const dstViews = await fetchViewsMaps(dstBase, dstH);

  // Lire catégories source et les agréger : nameKey -> {name,label,object_types[], metadataViews[]}
  const srcByName = new Map(); // nameKey -> agg
  for (const [type, ep] of Object.entries(catEndpoints)) {
    const r = await fetch(srcBase + ep + '?per_page=500', { headers: srcH })
      .then(x => x.ok ? x.json() : ({ objects: [] }))
      .catch(() => ({ objects: [] }));

    (r.objects || []).forEach(cat => {
      const name = String(cat.name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();

      const cur = srcByName.get(key) || {
        name,
        label: String(cat.label || cat.name || '').trim(),
        object_types: [],
        metadataViews: [] // NOMS de vues (pas ids)
      };

      if (!cur.object_types.includes(type)) cur.object_types.push(type);

      // Convertir view_ids -> view names via srcViews.idToName
      (cat.view_ids || []).forEach(vid => {
        const vn = srcViews.idToName[vid];
        if (vn && !cur.metadataViews.includes(vn)) cur.metadataViews.push(vn);
      });

      // conserver label le plus "riche"
      if (cat.label && String(cat.label).length > (cur.label || '').length) cur.label = String(cat.label).trim();

      srcByName.set(key, cur);
    });
  }

  // Lire catégories destination par type : type -> (nameKey -> obj)
  const dstByType = {};
  for (const [type, ep] of Object.entries(catEndpoints)) {
    const r = await fetch(dstBase + ep + '?per_page=500', { headers: dstH })
      .then(x => x.ok ? x.json() : ({ objects: [] }))
      .catch(() => ({ objects: [] }));

    const map = {};
    (r.objects || []).forEach(cat => {
      const key = String(cat.name || '').toLowerCase().trim();
      if (key) map[key] = cat;
    });
    dstByType[type] = map;
  }

  // Filtre système src/dst indépendants
  const _sysCatsEl_src = document.getElementById('toggle-sys-cats-src-dd-'+envId)
    || document.getElementById('toggle-sys-cats-src-sd-'+envId)
    || document.getElementById('toggle-sys-cats-src-ds-'+envId);
  const _sysCatsEl_dst = document.getElementById('toggle-sys-cats-dst-dd-'+envId)
    || document.getElementById('toggle-sys-cats-dst-sd-'+envId)
    || document.getElementById('toggle-sys-cats-dst-ds-'+envId);
  const includeSysCats     = _sysCatsEl_src ? _sysCatsEl_src.checked : (wfdIncludeSystemCategories?.() ?? false);
  // Dst = src (toggles fusionnés) — hidden input synchronisé ou fallback src
  const includeSysCatsDst  = _sysCatsEl_dst ? (_sysCatsEl_dst.checked ?? (_sysCatsEl_dst.value === '1')) : includeSysCats;
  const SYSTEM_CAT_KEYS = new Set(['default', 'generic', 'tag']); // garde-fou suppression

  // desiredByType[type] = Set(nameKey) pour overwrite
  const desiredByType = {};

  // CREATE / UPDATE
  let created = 0, updated = 0, deleted = 0, skipped = 0;

  for (const agg of srcByName.values()) {
    const nameKey = String(agg.name || '').toLowerCase().trim();
    if (!nameKey) { skipped++; continue; }

    // Exclusion par défaut des catégories système (source)
    if (!includeSysCats && SYSTEM_CAT_KEYS.has(nameKey)) { skipped++; continue; }

    // Construire view_ids destination à partir des view names source
    const view_ids = (agg.metadataViews || [])
      .map(vn => dstViews.nameToId[String(vn || '').toLowerCase().trim()])
      .filter(Boolean);

    const body = { name: agg.name, label: agg.label || agg.name, view_ids };

    for (const type of (agg.object_types || [])) {
      const ep = catEndpoints[type];
      if (!ep) continue;

      if (!desiredByType[type]) desiredByType[type] = new Set();
      desiredByType[type].add(nameKey);

      const existing = dstByType[type]?.[nameKey];

      // add_only : si existe, skip
      if (mode === 'add_only' && existing) { skipped++; continue; }

      if (!existing) {
        const r = await fetch(dstBase + ep, {
          method: 'POST',
          headers: dstH,
          body: JSON.stringify(body)
        }).catch(() => null);
        if (r && r.ok) created++;
      } else {
        if (mode === 'add_update' || mode === 'overwrite') {
          const r = await fetch(dstBase + ep + existing.id + '/', {
            method: 'PUT',
            headers: dstH,
            body: JSON.stringify(body)
          }).catch(() => null);
          if (r && r.ok) updated++;
        }
      }
    }
  }

  // DELETE extras (overwrite) — par type, avec garde-fou system cats
  if (mode === 'overwrite') {
    for (const [type, map] of Object.entries(dstByType)) {
      const ep = catEndpoints[type];
      if (!ep) continue;

      const desired = desiredByType[type] || new Set();

      for (const [nameKey, existing] of Object.entries(map || {})) {
        if (!existing?.id) continue;

        // Garde-fou absolu : ne jamais supprimer default/generic/tag
        if (SYSTEM_CAT_KEYS.has(nameKey)) continue;

        // Si catégories système dst exclues, ne pas les supprimer non plus
        if (!includeSysCatsDst && SYSTEM_CAT_KEYS.has(nameKey)) continue;

        // Si catégorie non désirée -> DELETE
        if (!desired.has(nameKey)) {
          await fetch(dstBase + ep + existing.id + '/', {
            method: 'DELETE',
            headers: dstH
          }).catch(() => null);
          deleted++;
        }
      }
    }
  }

  results.push(`✅ categories inter-domaines : ${created} créées, ${updated} mises à jour, ${deleted} supprimées, ${skipped} ignorées`);
}

  // ── Phase 2 : Associations inter-domaines ────────────────────────────────────
  const doAssocDD = active.includes('teams') || active.includes('roleGroups');
  if (doAssocDD) {
    if (status) status.textContent = 'Lecture source…';

    // Lire entités source avec rôles inclus (GroupWithRolesElasticSchema)
    const srcTeamsR = await fetch(srcBase+'/API/users/v1/teams/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({}));
    const srcRGsR   = await fetch(srcBase+'/API/users/v1/role_groups/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({}));
    // Charger TOUTES les collections src via recherche (pas seulement racines)
    const _srcColsAll = await (async () => {
      let all = [], page = 1;
      while (true) {
        const r = await fetch(srcBase+'/API/search/v1/search/?per_page=500&page='+page, {
          method:'POST', headers:{...srcH,'Content-Type':'application/json'},
          body:JSON.stringify({doc_types:['collections']})
        }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        all = all.concat(r.objects||[]);
        if (!r.objects?.length || page>=(r.pages||1) || page>50) break;
        page++;
      }
      return all;
    })();
    const srcColsR = {objects: _srcColsAll};
    const srcViewsR = await fetch(srcBase+'/API/metadata/v1/views/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({}));

    // Index source : id→nom (pour résolution lors de lecture ACLs)
    const srcColByid  = {}; (srcColsR.objects||[]).forEach(c=>{ srcColByid[c.id]  = c.name; });
    const srcViewById = {}; (srcViewsR.objects||[]).forEach(v=>{ srcViewById[v.id] = v.name; });

    // Index destination : nom→id
    const dstTeamsR = await fetch(dstBase+'/API/users/v1/teams/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}));
    // Charger TOUTES les collections dst via recherche
    const _dstColsAll = await (async () => {
      let all = [], page = 1;
      while (true) {
        const r = await fetch(dstBase+'/API/search/v1/search/?per_page=500&page='+page, {
          method:'POST', headers:{...dstH,'Content-Type':'application/json'},
          body:JSON.stringify({doc_types:['collections']})
        }).then(r=>r.ok?r.json():{}).catch(()=>({}));
        all = all.concat(r.objects||[]);
        if (!r.objects?.length || page>=(r.pages||1) || page>50) break;
        page++;
      }
      return all;
    })();
    const dstColsR = {objects: _dstColsAll};
    const dstViewsR = await fetch(dstBase+'/API/metadata/v1/views/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}));
    const dstRGsR   = await fetch(dstBase+'/API/users/v1/role_groups/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}));

    const dstTeamMap = {};

  // ─────────────────────────────────────────────────────────────
  // Teams settings — /API/settings/v1/team/{groupId}/
  // ─────────────────────────────────────────────────────────────
  const TEAM_SETTINGS_SKIP = new Set(['group_id','system_domain_id','client_ip','logo_storage_id','logo_url','jobs_dashboard','allowed_ips']);
  const TEAM_VIEW_KEYS = ['filters_default_metadata_view_id','search_results_asset_metadata_view_id','search_results_collection_metadata_view_id','search_view_id'];

  async function copyTeamSettingsDD() {
    if (!active.includes('teams')) return;

    const srcViewNameById = {};
    (srcViewsR.objects || []).forEach(v => { if (v?.id) srcViewNameById[v.id] = v.name; });
    const dstViewIdByName = {};
    (dstViewsR.objects || []).forEach(v => { if (v?.name) dstViewIdByName[v.name.toLowerCase().trim()] = v.id; });

    const resolveColId = (srcId) => {
      if (!srcId) return null;
      if (typeof ddColIdMap !== 'undefined' && ddColIdMap && ddColIdMap[srcId]) return ddColIdMap[srcId];
      return null;
    };

    // Maps storages src→dst par nom (pour default_upload_storage_id)
    const srcStorageNameById = {};
    const dstStorageIdByName = {};
    try {
      const [srcSt, dstSt] = await Promise.all([
        fetch(srcBase + '/API/files/v1/storages/?per_page=500', { headers: srcH }).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        fetch(dstBase + '/API/files/v1/storages/?per_page=500', { headers: dstH }).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
      ]);
      (srcSt.objects||[]).forEach(s => { if (s?.id && s?.name) srcStorageNameById[s.id] = s.name; });
      (dstSt.objects||[]).forEach(s => { if (s?.name) dstStorageIdByName[s.name.toLowerCase().trim()] = s.id; });
    } catch(_) {}

    let copied = 0, skipped = 0, failed = 0;

    for (const srcTeam of (srcTeamsR.objects || [])) {
      const teamKey = String(srcTeam?.name || '').toLowerCase().trim();
      if (!teamKey) { skipped++; continue; }
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(teamKey)) { skipped++; continue; }

      const dstTeamId = dstTeamMap[teamKey];
      if (!dstTeamId) { skipped++; continue; }

      // Fetch détail team source pour description/saml fields
      const srcTeamDetail = await fetch(srcBase + '/API/users/v1/teams/' + srcTeam.id + '/', { headers: srcH })
        .then(r => r.ok ? r.json() : null).catch(() => null);

      // PATCH team destination avec description + SAML fields
      if (srcTeamDetail) {
        const teamBody = {};
        if (srcTeamDetail.description) teamBody.description = srcTeamDetail.description;
        if (srcTeamDetail.default_user_type) teamBody.default_user_type = srcTeamDetail.default_user_type;
        if (srcTeamDetail.saml_primary_group_priority != null) teamBody.saml_primary_group_priority = srcTeamDetail.saml_primary_group_priority;
        if (Object.keys(teamBody).length) {
          teamBody.name = srcTeam.name; // requis par Iconik
          await fetch(dstBase + '/API/users/v1/teams/' + dstTeamId + '/', {
            method: 'PUT', headers: dstH, body: JSON.stringify(teamBody)
          }).catch(() => null);
        }
      }

      const srcSettings = await fetch(srcBase + '/API/settings/v1/team/' + srcTeam.id + '/', { headers: srcH })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (!srcSettings) { skipped++; continue; }

      const body = {};
      // Clés qui acceptent null explicitement (réinitialise l'héritage domaine)
      const NULLABLE_KEYS = new Set(['search_in_transcriptions','append_asset_uuid_to_downloads',
        'use_asset_name_on_download','hide_favourites','collections_get_parent_acls',
        'acl_template_id','share_expiration_time','date_format','datetime_format']);
      for (const [k, v] of Object.entries(srcSettings)) {
        if (TEAM_SETTINGS_SKIP.has(k) || v === undefined) continue;
        // Envoyer null explicitement pour les clés nullable (reset vers héritage domaine)
        if (v === null) {
          if (NULLABLE_KEYS.has(k)) body[k] = null;
          continue;
        }
        if (TEAM_VIEW_KEYS.includes(k)) {
          const viewName = srcViewNameById[v];
          const dstId = viewName ? dstViewIdByName[viewName.toLowerCase().trim()] : null;
          if (dstId) body[k] = dstId;
          continue;
        }
        if (k === 'required_metadata_views' && Array.isArray(v)) {
          const resolvedIds = v.map(srcId => {
            const viewName = srcViewNameById[srcId];
            return viewName ? dstViewIdByName[viewName.toLowerCase().trim()] : null;
          }).filter(Boolean);
          if (resolvedIds.length) body[k] = resolvedIds;
          continue;
        }
        if (k === 'home_page' && typeof v === 'string' && v.startsWith('/collection/')) {
          const dstColId = resolveColId(v.replace('/collection/', ''));
          if (dstColId) body[k] = '/collection/' + dstColId;
          continue;
        }
        if (k === 'default_upload_storage_id') {
          const storageName = srcStorageNameById[v];
          const dstStorageId = storageName ? dstStorageIdByName[storageName.toLowerCase().trim()] : null;
          if (dstStorageId) body[k] = dstStorageId;
          // Si pas d'équivalent en dst, on skip (storage propre au domaine)
          continue;
        }
        body[k] = v;
      }

      if (!Object.keys(body).length) { skipped++; continue; }

      const r = await fetch(dstBase + '/API/settings/v1/team/' + dstTeamId + '/', {
        method: 'PATCH', headers: dstH, body: JSON.stringify(body)
      }).catch(() => null);
      if (r?.ok) copied++; else failed++;
    }

    window.__wfd_dd_team_settings_stats = { copied, skipped, failed, at: new Date().toISOString() };
    if (Array.isArray(results)) {
      const parts = [];
      if (copied) parts.push(copied + ' copiés');
      if (skipped) parts.push(skipped + ' ignorés');
      if (failed) parts.push(failed + ' échecs');
      results.push('✅ Teams settings' + (parts.length ? ' : ' + parts.join(', ') : ''));
    }
  }

       (dstTeamsR.objects || []).forEach(t => {
       const key = (t.name || '').toLowerCase().trim();
       if (!key) return;
       if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(key)) return; // default OFF
       dstTeamMap[key] = t.id;
    });
    const dstColMap  = {}; (dstColsR.objects||[]).forEach(c=>{ const k = (c.title||c.name||'').toLowerCase().trim(); if (k) dstColMap[k] = c.id; });
    const dstViewMap = {}; (dstViewsR.objects || []).forEach(v => {
    const nameKey = String(v.name || '').toLowerCase().trim();
    if (!nameKey) return;
    // ✅ Filtre MDV système (Segment Tags) si toggle OFF
    if (typeof wfdIncludeSystemMetadataViews === 'function' && typeof wfdIsSystemMetadataView === 'function') {
    if (!wfdIncludeSystemMetadataViews() && wfdIsSystemMetadataView(v.name)) return;
  }

    dstViewMap[nameKey] = v.id;
});

    const dstRGMap   = {}; (dstRGsR.objects||[]).forEach(rg=>{ dstRGMap[(rg.name||'').toLowerCase()]  = rg.id; });

    // Teams → ACLs (Collections + MD Views + Saved Searches + Storages)
    // On lit les ACLs par objet sur la source (GET /API/acls/v1/acl/{type}/{key}/)
    // puis on les recrée sur la destination avec PUT /API/acls/v1/groups/{gid}/acl/{type}/{key}/
if (active.includes('teams')) {
  if (status) status.textContent = 'ACLs inter-domaines (Teams)…';

  // --- index source teams : id -> name (pour résoudre group_id -> team name)
  const srcTeamById = {};
  (srcTeamsR.objects || []).forEach(t => { if (t?.id) srcTeamById[t.id] = t.name || t.title || t.id; });

    // ── DS-like ACL stubs (ne pas perdre une ACL si group_id non résolu) ──
    const unresolvedAcls = [];
    window.__wfd_dd_acl_unresolved = unresolvedAcls;
    const normKey = (s) => String(s || '').toLowerCase().trim();

    // Étendre la résolution group_id -> name avec /groups (certains ACLs référencent groups non listés dans /teams)
    const srcGroupsR = await fetch(srcBase + '/API/users/v1/groups/?per_page=500', { headers: srcH })
      .then(r => r.ok ? r.json() : ({ objects: [] }))
      .catch(() => ({ objects: [] }));
    (srcGroupsR.objects || []).forEach(g => { if (g?.id) srcTeamById[String(g.id)] = (g.name || g.title || g.id); });

    // Étendre la map destination name->id avec /groups (en plus de /teams)
    const dstGroupsR = await fetch(dstBase + '/API/users/v1/groups/?per_page=500', { headers: dstH })
      .then(r => r.ok ? r.json() : ({ objects: [] }))
      .catch(() => ({ objects: [] }));
    (dstGroupsR.objects || []).forEach(g => {
      const k = normKey(g?.name || g?.title || '');
      if (k) dstTeamMap[k] = String(g.id);
    });

    const noteUnresolved = (kind, srcColId, srcColName, srcGroupId, srcGroupName, permissions) => {
      unresolvedAcls.push({
        kind,
        srcColId: String(srcColId || ''),
        srcColName: String(srcColName || ''),
        srcGroupId: String(srcGroupId || ''),
        srcGroupName: srcGroupName ? String(srcGroupName) : null,
        permissions: Array.isArray(permissions) ? permissions : []
      });
    };

    const ensureDstTeamId = async (name) => {
      const key = normKey(name);
      if (!key) return null;
      // Filtrer les teams système si toggle OFF
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(key)) return null;
      if (dstTeamMap[key]) return String(dstTeamMap[key]);
      // Tentative de création (Teams scope actif) — best effort
      const r = await fetch(dstBase + '/API/users/v1/teams/', {
        method: 'POST', headers: dstH, body: JSON.stringify({ name })
      }).catch(() => null);
      if (r && r.ok) {
        const obj = await r.json().catch(() => null);
        if (obj && obj.id) {
          dstTeamMap[key] = String(obj.id);
          return String(obj.id);
        }
      }
      return null;
    };


  // --- lire listes source pour SS + Storages (en plus des cols/views déjà chargés)
  const srcSSr = await fetch(srcBase + '/API/search/v1/search/saved/?per_page=500', { headers: srcH })
    .then(r => r.ok ? r.json() : ({ objects: [] }))
    .catch(() => ({ objects: [] }));

  const srcStr = await fetch(srcBase + '/API/files/v1/storages/?per_page=500', { headers: srcH })
    .then(r => r.ok ? r.json() : ({ objects: [] }))
    .catch(() => ({ objects: [] }));

  // --- index destination : saved searches name/title -> id ; storages name -> id
  const dstSSr = await fetch(dstBase + '/API/search/v1/search/saved/?per_page=500', { headers: dstH })
    .then(r => r.ok ? r.json() : ({ objects: [] }))
    .catch(() => ({ objects: [] }));

  const dstStr = await fetch(dstBase + '/API/files/v1/storages/?per_page=500', { headers: dstH })
    .then(r => r.ok ? r.json() : ({ objects: [] }))
    .catch(() => ({ objects: [] }));

  const dstSSMap = {};
  (dstSSr.objects || []).forEach(s => {
    const k = String(s.name || s.title || '').toLowerCase().trim();
    if (k) dstSSMap[k] = s.id;
  });

  const dstStMap = {};
  (dstStr.objects || []).forEach(s => {
    const k = String(s.name || '').toLowerCase().trim();
    if (k) dstStMap[k] = s.id;
  });

  // helper: extraire les entrées ACL (direct/inherited/propagates) + convertir permissions
  const getEntries = (aclData) => (aclData.groups_acl || []); // ✅ direct only (inherited/propagates recalculés)

  const toPerms = (ga) => {
    const p = (ga.permissions || []).map(x => String(x).toLowerCase());
    const perms = new Set(['read']);
    if (p.includes('write') || p.includes('delete') || p.includes('change-acl')) perms.add('write');
    if (p.includes('delete')) perms.add('delete');
    if (p.includes('change-acl')) perms.add('change-acl');
    return [...perms];
  };

  // helper: pousser une ACL group->object sur la destination
  const putGroupAcl = async (dstGId, objectType, objectId, perms) => {
    if (!dstGId || !objectId) return;
    await fetch(dstBase + '/API/acls/v1/groups/' + dstGId + '/acl/' + objectType + '/' + objectId + '/', {
      method: 'PUT',
      headers: dstH,
      body: JSON.stringify({ permissions: perms })
    }).catch(() => {});
  };

  await copyTeamSettingsDD();

 // 1) Collections ACLs (direct + propagating) — dépend du scope teams
 if (active.includes('teams') || active.includes('collections')) {
   if (status) status.textContent = 'ACLs inter-domaines : Collections…';

   // Helpers
   const normTeamKey = (s) => String(s || '').toLowerCase().trim();
   const toPermsExact = (ga) => {
     const p = (ga && ga.permissions ? ga.permissions : []).map(x => String(x).toLowerCase());
     const perms = new Set(p);
     if (!perms.has('read')) perms.add('read');
     return [...perms];
   };

   // Progress UI
   const srcColList = (srcColsR.objects || []).filter(c => c && c.id);
   const totalCols = srcColList.length;
   let doneCols = 0;
   const aclProg = (typeof window.wfdSyncProgressInit === 'function') ? window.wfdSyncProgressInit('DD ACL Collections', totalCols, 'wfd-sync-progress-anchor') : null;

   // Cache dest ACLs (only when needed)
   const dstAclCache = {}; // dstColId -> aclData
   const getDstAcl = async (dstColId) => {
     if (!dstColId) return null;
     if (dstAclCache[dstColId]) return dstAclCache[dstColId];
     const d = await fetch(dstBase + '/API/acls/v1/acl/collections/' + dstColId + '/', { headers: dstH })
       .then(r => r.ok ? r.json() : null)
       .catch(() => null);
     dstAclCache[dstColId] = d;
     return d;
   };

   // Apply direct group ACL
   const putDirect = async (dstGId, dstColId, perms) => {
     if (!dstGId || !dstColId) return false;
     const r = await fetch(dstBase + '/API/acls/v1/groups/' + dstGId + '/acl/collections/' + dstColId + '/', {
       method: 'PUT', headers: dstH, body: JSON.stringify({ permissions: perms })
     }).catch(() => null);
     return !!(r && r.ok);
   };
   const delDirect = async (dstGId, dstColId) => {
     if (!dstGId || !dstColId) return false;
     const r = await fetch(dstBase + '/API/acls/v1/groups/' + dstGId + '/acl/collections/' + dstColId + '/', {
       method: 'DELETE', headers: dstH
     }).catch(() => null);
     return !!(r && r.ok);
   };

   // Apply propagating ACL via /API/acls/v1/acl/_propagating_collections/
   // Endpoint validé sur tenant Bayard : PUT avec object_keys + group_ids + permissions + user_ids
   const putProp = async (dstGId, dstColId, perms) => {
     if (!dstGId || !dstColId) return false;
     const body = {
       object_keys: [String(dstColId)],
       group_ids: [String(dstGId)],
       permissions: perms,
       user_ids: []
     };
     const r = await fetch(dstBase + '/API/acls/v1/acl/_propagating_collections/', {
       method: 'PUT', headers: dstH, body: JSON.stringify(body)
     }).catch(() => null);
     return !!(r && r.ok);
   };
   // Suppression propagating ACL
   const delProp = async (dstGId, dstColId) => {
     if (!dstGId || !dstColId) return false;
     const body = {
       object_keys: [String(dstColId)],
       group_ids: [String(dstGId)],
       user_ids: []
     };
     const r = await fetch(dstBase + '/API/acls/v1/acl/_propagating_collections/', {
       method: 'DELETE', headers: dstH, body: JSON.stringify(body)
     }).catch(() => null);
     return !!(r && r.ok);
   };

   // Main per-collection
   for (const srcCol of srcColList) {
     doneCols++;
     if (aclProg && (doneCols % 2 === 0 || doneCols === totalCols)) aclProg(doneCols);
     if (status && (doneCols % 5 === 0 || doneCols === totalCols)) status.textContent = `ACLs inter-domaines : Collections ${doneCols}/${totalCols}…`;
     if (doneCols % 25 === 0) await new Promise(r => setTimeout(r, 0));

     const _srcColKey = (srcCol.title||srcCol.name||'').toLowerCase().trim();
     const dstColId = (ddColIdMap && ddColIdMap[srcCol.id]) || dstColMap[_srcColKey];
     if (!dstColId) continue;

     // Read ACL source
     const aclData = await fetch(srcBase + '/API/acls/v1/acl/collections/' + srcCol.id + '/', { headers: srcH })
       .then(r => r.ok ? r.json() : null)
       .catch(() => null);
     if (!aclData) continue;

     // Desired sets
     const desiredDirect = new Map(); // dstGId -> perms
     const desiredProp = new Map();   // dstGId -> perms
     // direct
     for (const ga of (aclData.groups_acl || [])) {
       const perms = toPermsExact(ga);
       const srcGroupId = ga && ga.group_id;
       const srcName = srcTeamById[String(srcGroupId)] || null;
       if (!srcName) { noteUnresolved('direct', srcCol.id, (srcCol.name || srcCol.title || ''), srcGroupId, null, perms); continue; }
       // Filtrer les teams système si toggle OFF
       if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcName))) continue;
       let dstGId = dstTeamMap[normKey(srcName)] || null;
       if (!dstGId) dstGId = await ensureDstTeamId(srcName);
       if (!dstGId) { noteUnresolved('direct', srcCol.id, (srcCol.name || srcCol.title || ''), srcGroupId, srcName, perms); continue; }
       desiredDirect.set(String(dstGId), perms);
     }
     // propagating
     for (const ga of (aclData.propagating_groups_acl || [])) {
       const perms = toPermsExact(ga);
       const srcGroupId = ga && ga.group_id;
       const srcName = srcTeamById[String(srcGroupId)] || null;
       if (!srcName) { noteUnresolved('propagates', srcCol.id, (srcCol.name || srcCol.title || ''), srcGroupId, null, perms); continue; }
       // Filtrer les teams système si toggle OFF
       if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcName))) continue;
       let dstGId = dstTeamMap[normKey(srcName)] || null;
       if (!dstGId) dstGId = await ensureDstTeamId(srcName);
       if (!dstGId) { noteUnresolved('propagates', srcCol.id, (srcCol.name || srcCol.title || ''), srcGroupId, srcName, perms); continue; }
       desiredProp.set(String(dstGId), perms);
     }

     // Destination ACL snapshot (needed for add_only checks and overwrite deletes)
     const dstAcl = await getDstAcl(dstColId);
     const dstDirectSet = new Set(((dstAcl && dstAcl.groups_acl) || []).map(x => String(x.group_id)));
     const dstPropSet = new Set(((dstAcl && dstAcl.propagating_groups_acl) || []).map(x => String(x.group_id)));

     // OVERWRITE: delete extras (direct)
     if (mode === 'overwrite') {
       for (const gid of dstDirectSet) {
         if (!desiredDirect.has(gid)) await delDirect(gid, dstColId);
       }
       for (const gid of dstPropSet) {
         if (!desiredProp.has(gid)) await delProp(gid, dstColId);
       }
     }

     // Apply direct
     for (const [gid, perms] of desiredDirect.entries()) {
       if (mode === 'add_only' && dstDirectSet.has(gid)) continue;
       await putDirect(gid, dstColId, perms);
     }

     // Apply propagation at the exact level
     for (const [gid, perms] of desiredProp.entries()) {
       if (mode === 'add_only' && dstPropSet.has(gid)) continue;
       await putProp(gid, dstColId, perms);
     }
   }
 }

 // 2) Metadata Views
 if (active.includes('metadataViews')) {
  if (status) status.textContent = 'ACLs inter-domaines : Metadata Views…';
  for (const srcView of (srcViewsR.objects || [])) {
    const dstViewId = dstViewMap[(srcView.name || '').toLowerCase().trim()];
    if (!dstViewId) continue;

    const aclData = await fetch(srcBase + '/API/acls/v1/acl/metadata_views/' + srcView.id + '/', { headers: srcH })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
    if (!aclData) continue;

    // Direct ACLs
    for (const ga of (aclData.groups_acl || [])) {
      const srcTeamName = srcTeamById[ga.group_id];
      if (!srcTeamName) continue;
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcTeamName))) continue;
      const dstGId = dstTeamMap[String(srcTeamName).toLowerCase().trim()];
      if (!dstGId) continue;
      await putGroupAcl(dstGId, 'metadata_views', dstViewId, toPerms(ga));
    }
    // Propagating ACLs (si présentes sur la source)
    for (const ga of (aclData.propagating_groups_acl || [])) {
      const srcTeamName = srcTeamById[ga.group_id];
      if (!srcTeamName) continue;
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcTeamName))) continue;
      const dstGId = dstTeamMap[String(srcTeamName).toLowerCase().trim()];
      if (!dstGId) continue;
      await putGroupAcl(dstGId, 'metadata_views', dstViewId, toPerms(ga));
    }
  }
 } // end metadataViews ACLs

 // 3) Saved Searches
 if (active.includes('savedSearches')) {
  if (status) status.textContent = 'ACLs inter-domaines : Saved Searches…';

  // Recharger dstSSMap pour inclure les searches créées pendant la synchro
  const dstSSrFresh = await fetch(dstBase + '/API/search/v1/search/saved/?per_page=500', { headers: dstH })
    .then(r => r.ok ? r.json() : ({ objects: [] })).catch(() => ({ objects: [] }));
  (dstSSrFresh.objects || []).forEach(s => {
    const k = String(s.name || s.title || '').toLowerCase().trim();
    if (k) dstSSMap[k] = s.id;
  });

  // Aussi charger les searches des groupes destination
  const dstGrpsACL = await fetch(dstBase + '/API/search/v1/search/saved/groups/?per_page=500', { headers: dstH })
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));
  for (const dstGrp of (dstGrpsACL.objects || [])) {
    const grpSS = await fetch(dstBase + '/API/search/v1/search/saved/?group_id=' + dstGrp.id + '&per_page=500', { headers: dstH })
      .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    (grpSS.objects || []).forEach(s => {
      const k = String(s.name || '').toLowerCase().trim();
      if (k && !dstSSMap[k]) dstSSMap[k] = s.id;
    });
  }

  // Source : aussi lire les searches des groupes
  const allSrcSS = [...(srcSSr.objects || [])];
  const srcGrpsACL = await fetch(srcBase + '/API/search/v1/search/saved/groups/?per_page=500', { headers: srcH })
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));
  for (const srcGrp of (srcGrpsACL.objects || [])) {
    const grpSS = await fetch(srcBase + '/API/search/v1/search/saved/?group_id=' + srcGrp.id + '&per_page=500', { headers: srcH })
      .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    (grpSS.objects || []).forEach(s => { if (!allSrcSS.find(x => x.id === s.id)) allSrcSS.push(s); });
  }

  for (const srcSS of allSrcSS) {
    const ssName = String(srcSS.name || srcSS.title || '').trim();
    if (!ssName) continue;

    const dstSSId = dstSSMap[ssName.toLowerCase().trim()];
    if (!dstSSId) continue;

    const aclData = await fetch(srcBase + '/API/acls/v1/acl/saved_searches/' + srcSS.id + '/', { headers: srcH })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
    if (!aclData) continue;

    // Direct ACLs
    for (const ga of (aclData.groups_acl || [])) {
      const srcTeamName = srcTeamById[ga.group_id];
      if (!srcTeamName) continue;
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcTeamName))) continue;
      const dstGId = dstTeamMap[String(srcTeamName).toLowerCase().trim()];
      if (!dstGId) continue;
      await putGroupAcl(dstGId, 'saved_searches', dstSSId, toPerms(ga));
    }
    // Propagating ACLs
    for (const ga of (aclData.propagating_groups_acl || [])) {
      const srcTeamName = srcTeamById[ga.group_id];
      if (!srcTeamName) continue;
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcTeamName))) continue;
      const dstGId = dstTeamMap[String(srcTeamName).toLowerCase().trim()];
      if (!dstGId) continue;
      await putGroupAcl(dstGId, 'saved_searches', dstSSId, toPerms(ga));
    }
  }
 } // end savedSearches ACLs

 // 4) Custom Actions ACLs
 if (active.includes('customActions')) {
  if (status) status.textContent = 'ACLs inter-domaines : Custom Actions…';

  // Index source custom actions id -> title
  const srcCAList = (await fetchAllPages(srcBase, srcH, '/API/assets/v1/custom_actions/?per_page=500').catch(()=>[]));
  // Index destination custom actions title -> id
  const dstCAList = (await fetchAllPages(dstBase, dstH, '/API/assets/v1/custom_actions/?per_page=500').catch(()=>[]));
  const dstCAMap = {};
  (dstCAList || []).forEach(a => {
    const k = String(a.title || a.name || '').toLowerCase().trim();
    if (k) dstCAMap[k] = a.id;
  });

  for (const srcCA of (srcCAList || [])) {
    const dstCAId = dstCAMap[String(srcCA.title || srcCA.name || '').toLowerCase().trim()];
    if (!dstCAId) continue;

    const aclData = await fetch(srcBase + '/API/acls/v1/acl/custom_actions/' + srcCA.id + '/', { headers: srcH })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
    if (!aclData) continue;

    for (const ga of (aclData.groups_acl || [])) {
      const srcTeamName = srcTeamById[ga.group_id];
      if (!srcTeamName) continue;
      if (!wfdIncludeSystemTeams() && wfdIsSystemTeam(normKey(srcTeamName))) continue;
      const dstGId = dstTeamMap[normKey(srcTeamName)];
      if (!dstGId) continue;
      await putGroupAcl(dstGId, 'custom_actions', dstCAId, toPerms(ga));
    }
  }
 } // end customActions ACLs

 // 5) Storages — volontairement ignoré en DD (pas de partage storages PROD↔DEV/QA)
 if (unresolvedAcls.length) { results.push('⚠️ ACL non résolues : ' + unresolvedAcls.length + ' (voir window.__wfd_dd_acl_unresolved)'); }
    results.push('✅ ACLs inter-domaines Teams : Collections/Views/SavedSearches');

    // ── ACLs de gestion des Teams (qui peut gérer quelle team) ──────────────
    if (active.includes('teams')) {
      if (status) status.textContent = 'ACLs Teams (gestion)…';
      try {
        // Fetch teams src et dst
        const [srcTeamsR2, dstTeamsR2] = await Promise.all([
          fetch(srcBase+'/API/users/v1/teams/?per_page=500',{headers:srcH}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
          fetch(dstBase+'/API/users/v1/teams/?per_page=500',{headers:dstH}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        ]);
        // Maps nom → id pour src et dst (teams + role_groups)
        const [srcRGsForAcl, dstRGsForAcl] = await Promise.all([
          fetch(srcBase+'/API/users/v1/role_groups/?per_page=500',{headers:srcH}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
          fetch(dstBase+'/API/users/v1/role_groups/?per_page=500',{headers:dstH}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]})),
        ]);
        const srcGroupIdByName = {};
        [...(srcTeamsR2.objects||[]), ...(srcRGsForAcl.objects||[])].forEach(g=>{if(g?.name) srcGroupIdByName[g.name.toLowerCase().trim()]=g.id;});
        const dstGroupIdByName2 = {};
        // D'abord role_groups, puis teams (teams écrasent en priorité)
        [...(dstRGsForAcl.objects||[]), ...(dstTeamsR2.objects||[])].forEach(g=>{if(g?.name) dstGroupIdByName2[g.name.toLowerCase().trim()]=g.id;});
        const dstTeamIdByName = {};
        (dstTeamsR2.objects||[]).forEach(t=>{if(t?.name) dstTeamIdByName[t.name.toLowerCase().trim()]=t.id;});

        let copied=0, skipped=0;
        for (const srcTeam of (srcTeamsR2.objects||[])) {
          const teamName = (srcTeam.name||'').toLowerCase().trim();
          if (!teamName) continue;
          const dstTeamId = dstTeamIdByName[teamName];
          if (!dstTeamId) { skipped++; continue; }

          // Fetch ACLs source
          const srcAcl = await fetch(srcBase+'/API/acls/v1/acl/groups/'+srcTeam.id+'/',{headers:srcH})
            .then(r=>r.ok?r.json():null).catch(()=>null);
          if (!srcAcl) { skipped++; continue; }

          const srcGroups = srcAcl.groups_acl||[];
          if (!srcGroups.length) { skipped++; continue; }

          // Résoudre group_ids src → noms → dst
          const srcGroupNameById = {};
          [...(srcTeamsR2.objects||[]), ...(srcRGsForAcl.objects||[])].forEach(g=>{if(g?.id) srcGroupNameById[g.id]=g.name;});

          const dstGroups = srcGroups.map(a => {
            const grpName = srcGroupNameById[a.group_id];
            if (!grpName) return null;
            const dstGid = dstGroupIdByName2[grpName.toLowerCase().trim()];
            if (!dstGid) return null;
            return { group_id: dstGid, permissions: a.permissions||[] };
          }).filter(Boolean);

          if (!dstGroups.length) { skipped++; continue; }

          // 1) Supprimer les ACLs groups existantes sur la team destination
          const existingAcl = await fetch(dstBase+'/API/acls/v1/acl/groups/'+dstTeamId+'/',{headers:dstH})
            .then(r=>r.ok?r.json():null).catch(()=>null);
          // Supprimer TOUS les groups existants (y compris auto-ACL si absente en PROD)
          for (const eg of (existingAcl?.groups_acl||[])) {
            await fetch(dstBase+'/API/acls/v1/acl/groups/', {
              method:'DELETE', headers:dstH,
              body: JSON.stringify({ object_keys:[dstTeamId], group_ids:[eg.group_id], user_ids:[] })
            }).catch(()=>null);
          }
          // 2) Pousser les ACLs source résolues
          // Endpoint : PUT /API/acls/v1/acl/groups/ (sans ID dans l'URL)
          let allOk = true;
          for (const dstGroup of dstGroups) {
            const r2 = await fetch(dstBase+'/API/acls/v1/acl/groups/', {
              method:'PUT', headers:dstH,
              body: JSON.stringify({
                object_keys: [dstTeamId],
                group_ids: [dstGroup.group_id],
                permissions: dstGroup.permissions||['read','write','delete','change-acl'],
                user_ids: []
              })
            }).catch(()=>null);
            if (!r2?.ok) allOk = false;
          }
          if (allOk) copied++; else skipped++;
        }
        const parts=[];
        if (copied) parts.push(copied+' copiées');
        if (skipped) parts.push(skipped+' ignorées');
        results.push('✅ ACLs Teams (gestion)'+(parts.length?' : '+parts.join(', '):''));
      } catch(e) { results.push('❌ ACLs Teams (gestion) : '+e.message); }
    }
}

    // Role Groups → roles + role_categories via PUT /API/users/v1/role_groups/{id}/
    if (active.includes('roleGroups')) {
      if (status) status.textContent = 'Role Groups → Rôles inter-domaines…';
      for (const srcRG of (srcRGsR.objects||[])) {
        const dstRGId = dstRGMap[(srcRG.name||'').toLowerCase()];
        if (!dstRGId) continue;
        await fetch(dstBase+'/API/users/v1/role_groups/'+dstRGId+'/',{
          method:'PUT', headers:dstH,
          body: JSON.stringify({
            roles          : srcRG.roles || [],
            role_categories: srcRG.role_categories || {},
          })
        }).catch(()=>{});
      }
      results.push('✅ Role Groups → Rôles créés');
    }
  }

  // ── Nettoyage post-DD : supprimer les teams système créées par erreur ──
  if (!wfdIncludeSystemTeams()) {
    try {
      const postDstTeams = await fetch(dstBase+'/API/users/v1/teams/?per_page=500',{headers:dstH}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]}));
      for (const t of (postDstTeams.objects||[])) {
        if (wfdIsSystemTeam(t.name||'')) {
          await fetch(dstBase+'/API/users/v1/teams/'+t.id+'/',{method:'DELETE',headers:dstH}).catch(()=>null);
          results.push('🧹 Team système supprimée post-DD : '+t.name);
        }
      }
    } catch(e) {}
  }

  if (typeof window.wfdSyncProgressDone === 'function') window.wfdSyncProgressDone();
  if (status) { status.style.color='var(--accent)'; status.innerHTML=results.join('<br>'); }
  if (_jmDD) _jmDD.done(results);
  toast('Sync inter-domaines terminée');
}

function wfdAttachSelectFilter(inputId, selectId){
  const input = document.getElementById(inputId);
  const sel   = document.getElementById(selectId);
  if(!input || !sel) return;

  // snapshot des options “complètes”
  const all = Array.from(sel.options).map(o => ({ value:o.value, text:o.textContent }));

  function apply(){
    const q = String(input.value||'').toLowerCase().trim();
    const cur = sel.value;
    sel.innerHTML = '';
    for(const o of all){
      if(!q || String(o.text).toLowerCase().includes(q)){
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        sel.appendChild(opt);
      }
    }
    // rétablir la sélection si possible
    if(cur) sel.value = cur;
  }

  input.addEventListener('input', apply);
  apply();
}


// =======================================================
// WFD — Progress UI helpers (safe, no-op if already defined)
// =======================================================
if (typeof window.wfdSyncProgressInit !== 'function') {
  window.wfdSyncProgressInit = function(label, total, anchorId){
    try{
      total = total || 0;
      // Ancre dans le conteneur de synchro si fourni, sinon fallback inline
      const anchor = anchorId ? document.getElementById(anchorId) : null;
      const containerId = 'wfd-sync-progress';
      let box = document.getElementById(containerId);
      if(!box){
        box = document.createElement('div');
        box.id = containerId;
        box.style.cssText = [
          'margin-top:8px',
          'padding:8px 10px',
          'background:var(--bg3,rgba(0,0,0,.35))',
          'border:1px solid var(--border2,rgba(255,255,255,.1))',
          'border-radius:5px',
          'font-size:11px',
          'color:var(--text-mid,#aaa)',
        ].join(';');
        box.innerHTML =
          '<div id="wfd-sync-label" style="margin-bottom:6px;font-weight:600;color:var(--text,#fff);"></div>' +
          '<div style="height:4px;background:var(--bg2,#222);border-radius:2px;overflow:hidden;">' +
            '<div id="wfd-sync-bar" style="height:100%;width:0%;background:var(--accent,#00d4aa);transition:width .2s ease;border-radius:2px;"></div>' +
          '</div>' +
          '<div id="wfd-sync-pct" style="margin-top:4px;font-size:10px;color:var(--text-dim,#888);text-align:right;">0%</div>';
        if(anchor) anchor.insertAdjacentElement('afterend', box);
        else document.body.appendChild(box);
      }
      const labelEl = document.getElementById('wfd-sync-label');
      const barEl   = document.getElementById('wfd-sync-bar');
      const pctEl   = document.getElementById('wfd-sync-pct');
      if(labelEl) labelEl.textContent = (label || 'Sync') + ' — 0 / ' + total;
      if(barEl)   barEl.style.width = '0%';
      if(pctEl)   pctEl.textContent = '0%';
      return function(done){
        done = done || 0;
        const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
        if(labelEl) labelEl.textContent = (label || 'Sync') + ' — ' + done + ' / ' + total;
        if(barEl)   barEl.style.width = pct + '%';
        if(pctEl)   pctEl.textContent = pct + '%';
      };
    }catch(e){
      return function(){};
    }
  };
}
if (typeof window.wfdSyncProgressDone !== 'function') {
  window.wfdSyncProgressDone = function(){
    try{
      const box = document.getElementById('wfd-sync-progress');
      if(box){
        box.style.transition = 'opacity .4s ease';
        box.style.opacity = '0';
        setTimeout(()=>{ try{ box.remove(); }catch(e){} }, 450);
      }
    }catch(e){}
  };
}
