console.log('[CLEAN] script-clean LOADED — 2026-06-24 19:15');
/* =======================================================================
   WFD — Clean module (FINAL)
   Base: Clean consolidated v2 UI/UX (Target / ACL Scrub / Protection / Run)
   Adds:
   - Purge Domain: REAL delete (dry_run/apply)
   - metadata_fields included in purge (reset)
   - include_system toggle (default OFF)
   - When include_system ON: show per-scope System list with checkboxes;
     unchecked items become system_overrides (protected-from-system-delete)
   Notes:
   - This file is standalone for CLEAN only (no Sync code).
   - Requires shared helpers from Settings: sectionHtml(), escHtml(), toast(), askTypedConfirm() (optional)
   ======================================================================= */

const WFD_CLEAN_POLICY_KEY = 'WFD_CLEAN_POLICY';

/* =========================
   Policy
   ========================= */

function wfdCleanDefaultPolicy(){
  return {
    version: 4,
    default_mode: 'dry_run',
    match_priority: ['ids','names','regex'],

    purge: {
      include_system: false,
      // scope -> { ids:[] } : system entities NOT to delete even if include_system=true
      system_overrides: {}
    },

    system_filters: {
      teams: { ids: [], names: ['everyone','administrator'], regex: [] },
      role_groups: { ids: [], names: [], regex: [] },
      collections: { ids: [], names: [], regex: [] },
      metadata_views: { ids: [], names: ['segment tags'], regex: [] },
      metadata_fields: { ids: [], names: [], regex: [] },
      categories: { ids: [], names: ['default','generic','tag'], regex: [] },
      automations: { ids: [], names: [], regex: [] },
      custom_actions: { ids: [], names: [], regex: [] },
      saved_searches: { ids: [], names: [], regex: [] },
      storages: { ids: [], names: [], regex: [] },
      webhooks: { ids: [], names: [], regex: [] },
      export_locations: { ids: [], names: [], regex: [] },

      // reserved future scopes
      share_management: { ids: [], names: [], regex: [] },
      relation_types: { ids: [], names: [], regex: [] }
    },

    protected: {
      teams: { ids: [], names: [], regex: [] },
      role_groups: { ids: [], names: [], regex: [] },
      collections: { ids: [], names: [], regex: [] },
      metadata_views: { ids: [], names: [], regex: [] },
      metadata_fields: { ids: [], names: [], regex: [] },
      categories: { ids: [], names: [], regex: [] },
      automations: { ids: [], names: [], regex: [] },
      custom_actions: { ids: [], names: [], regex: [] },
      saved_searches: { ids: [], names: [], regex: [] },
      storages: { ids: [], names: [], regex: [] },
      webhooks: { ids: [], names: [], regex: [] },
      export_locations: { ids: [], names: [], regex: [] },
      share_management: { ids: [], names: [], regex: [] },
      relation_types: { ids: [], names: [], regex: [] }
    },

    enforce: {
      acl_scrub: {
        enabled: true,
        forbidden_group_ids: ['b8e95938-c615-11e7-b5ab-6c4008b85488'],
        object_types: ['metadata_views','collections','saved_searches','storages','custom_actions','webhooks','export_locations']
      }
    }
  };
}

function wfdCleanEnsurePurgePolicy(policy){
  if(!policy || typeof policy !== 'object') policy = {};

  if(!policy.purge || typeof policy.purge !== 'object') policy.purge = {};
  if(typeof policy.purge.include_system !== 'boolean') policy.purge.include_system = false;
  if(!policy.purge.system_overrides || typeof policy.purge.system_overrides !== 'object') policy.purge.system_overrides = {};

  if(!policy.system_filters || typeof policy.system_filters !== 'object') policy.system_filters = {};
  if(!policy.protected || typeof policy.protected !== 'object') policy.protected = {};

  if(!policy.enforce || typeof policy.enforce !== 'object') policy.enforce = {};
  if(!policy.enforce.acl_scrub || typeof policy.enforce.acl_scrub !== 'object'){
    policy.enforce.acl_scrub = { enabled:true, forbidden_group_ids:[], object_types:[] };
  }
  if(!Array.isArray(policy.enforce.acl_scrub.forbidden_group_ids)) policy.enforce.acl_scrub.forbidden_group_ids = [];
  if(!Array.isArray(policy.enforce.acl_scrub.object_types)) policy.enforce.acl_scrub.object_types = [];

  const scopes = [
    'teams','role_groups','collections','metadata_views','metadata_fields','categories',
    'automations','custom_actions','saved_searches','storages','webhooks','export_locations',
    'share_management','relation_types'
  ];

  // ensure per-scope selectors exist
  for(let i=0;i<scopes.length;i++){
    const sc = scopes[i];
    if(!policy.system_filters[sc]) policy.system_filters[sc] = { ids:[], names:[], regex:[] };
    if(!policy.protected[sc]) policy.protected[sc] = { ids:[], names:[], regex:[] };
    if(!policy.purge.system_overrides[sc]) policy.purge.system_overrides[sc] = { ids:[] };
    if(!Array.isArray(policy.purge.system_overrides[sc].ids)) policy.purge.system_overrides[sc].ids = [];
  }

  return policy;
}

function wfdCleanLoadPolicy(){
  try{
    const raw = localStorage.getItem(WFD_CLEAN_POLICY_KEY);
    if(!raw) return wfdCleanDefaultPolicy();
    const obj = JSON.parse(raw);
    if(!obj || typeof obj !== 'object') return wfdCleanDefaultPolicy();
    return wfdCleanEnsurePurgePolicy(obj);
  } catch(e){
    return wfdCleanDefaultPolicy();
  }
}

function wfdCleanSavePolicy(policy){
  localStorage.setItem(WFD_CLEAN_POLICY_KEY, JSON.stringify(policy, null, 2));
}

/* =========================
   Match helpers
   ========================= */

function wfdCleanNorm(s){ return String(s || '').trim().toLowerCase(); }

function wfdCleanMatch(entity, selector){
  if(!selector) return null;
  const id = (entity && (entity.id || entity.uuid || entity.object_key)) ? String(entity.id || entity.uuid || entity.object_key) : null;
  const name = String((entity && (entity.name || entity.nom || entity.title || entity.label)) || '').trim();
  const lname = wfdCleanNorm(name);

  const ids = Array.isArray(selector.ids) ? selector.ids : [];
  const names = (Array.isArray(selector.names) ? selector.names : []).map(wfdCleanNorm);
  const regex = Array.isArray(selector.regex) ? selector.regex : [];

  if(id && ids.indexOf(id) !== -1) return 'id';
  if(lname && names.indexOf(lname) !== -1) return 'name';
  for(let i=0;i<regex.length;i++){
    try{ if(new RegExp(regex[i],'i').test(name)) return 'regex'; }catch(e){}
  }
  return null;
}

function wfdCleanIsProtected(scope, entity, policy){
  return !!wfdCleanMatch(entity, policy && policy.protected ? policy.protected[scope] : null);
}

function wfdCleanIsSystem(scope, entity, policy){
  return !!wfdCleanMatch(entity, policy && policy.system_filters ? policy.system_filters[scope] : null);
}

function wfdCleanIsSystemOverridden(scope, entity, policy){
  try{
    const o = policy && policy.purge && policy.purge.system_overrides && policy.purge.system_overrides[scope];
    const ids = (o && Array.isArray(o.ids)) ? o.ids : [];
    const id = entity && entity.id ? String(entity.id) : '';
    return !!(id && ids.indexOf(id) !== -1);
  } catch(e){
    return false;
  }
}

function wfdCleanShouldDelete(scope, entity, policy){
  // Protected always wins
  if(wfdCleanIsProtected(scope, entity, policy)) return false;

  const isSys = wfdCleanIsSystem(scope, entity, policy);
  if(!isSys) return true;

  // System entity
  if(!policy.purge.include_system) return false;
  if(wfdCleanIsSystemOverridden(scope, entity, policy)) return false;
  return true;
}

/* =========================
   Environments
   ========================= */

function wfdCleanGetEnabledEnvs(){
  return (appTokensData.appTokens || []).filter(t => t && t.name && t.enabled !== false);
}

function wfdCleanEnvTokenByName(name){
  return wfdCleanGetEnabledEnvs().find(t => t.name === name);
}

/* =========================
   Cache + Fetch
   ========================= */

window.__WFD_CLEAN_CACHE__ = window.__WFD_CLEAN_CACHE__ || { env:null, loaded:false, lists:{}, lastError:null };

async function wfdCleanFetchJSON(base, headers, path){
  const r = await fetch(base + path, { headers: headers });
  const txt = await r.text().catch(()=> '');
  let j = {};
  try{ j = JSON.parse(txt); }catch(e){}
  return { ok:r.ok, status:r.status, json:j, text:txt };
}

/* =========================
   Collections: full listing (Search IDs + hydrate details)
   Rationale: /API/assets/v1/collections/?per_page=500 may miss system/tutorial collections.
   ========================= */
async function wfdCleanFetchAllCollectionIds(base, headers){
  const per = 150;
  let page = 1;
  let ids = [];
  const H = Object.assign({ 'Content-Type': 'application/json' }, headers);

  // ACTIVE-only filter: date_deleted missing
  const payload = {
    doc_types: ['collections'],
    filter: { operator: 'AND', terms: [ { name: 'date_deleted', missing: true } ] }
  };

  while(true){
    const url = base + '/API/search/v1/search/?per_page=' + per + '&page=' + page;
    const r = await fetch(url, { method:'POST', headers: H, body: JSON.stringify(payload) }).catch(() => null);
    if(!r || !r.ok) break;
    const j = await r.json().catch(() => ({}));
    const objs = j.objects || [];
    if(!objs.length) break;
    for(let i=0;i<objs.length;i++){
      const id = objs[i] && objs[i].id ? String(objs[i].id) : '';
      if(id) ids.push(id);
    }
    const pages = j.pages || 0;
    if(pages && page >= pages) break;
    if(!pages && objs.length < per) break;
    page++;
    if(page > 600) break;
  }

  const seen = {};
  const out = [];
  for(let i=0;i<ids.length;i++){
    const id = ids[i];
    if(!seen[id]){ seen[id]=1; out.push(id); }
  }
  return out;
}

async function wfdCleanHydrateCollections(base, headers, ids, opts){
  opts = opts || {};
  const concurrency = opts.concurrency || 10;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const queue = (ids || []).slice();
  const out = [];
  let done = 0;

  async function worker(){
    while(queue.length){
      const id = queue.shift();
      if(!id) continue;
      for(let attempt=1; attempt<=3; attempt++){
        const r = await fetch(base + '/API/assets/v1/collections/' + encodeURIComponent(id) + '/', { headers: headers }).catch(() => null);
        if(r && r.ok){
          const j = await r.json().catch(() => null);
          if(j && j.id){
            out.push({
              id: String(j.id),
              name: String(j.title || j.name || j.id),
              parent_id: j.parent_id ? String(j.parent_id) : null,
              date_deleted: j.date_deleted || null,
              status: j.status || null
            });
          }
          break;
        }
        await delay(150 * attempt);
      }
      done++;
      if(onProgress && (done % 25 === 0 || done === ids.length)) onProgress(done, ids.length);
      if(done % 50 === 0) await delay(0);
    }
  }

  const workers = [];
  for(let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);

  out.sort((a,b)=>{
    const ar = a.parent_id ? 1 : 0;
    const br = b.parent_id ? 1 : 0;
    if(ar !== br) return ar - br;
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  return out;
}


function wfdCleanFieldId(f){
  // Tenants may return id/field_id/uuid/etc
  return f && (f.id || f.field_id || f.uuid || f.field_uuid || f.name) ? String(f.id || f.field_id || f.uuid || f.field_uuid || f.name) : null;
}

function wfdCleanFieldName(f){
  return f ? String(f.label || f.name || f.id || f.field_id || f.uuid || '') : '';
}

async function wfdCleanLoadListsForEnv(envName){
  const tok = wfdCleanEnvTokenByName(envName);
  if(!tok) throw new Error('Env introuvable / inactif');

  const base = _ikBase(tok);
  const headers = {};

  const cache = window.__WFD_CLEAN_CACHE__;
  cache.env = envName;
  cache.loaded = false;
  cache.lastError = null;

  const statusEl = document.getElementById('clean-live-status');
  const setStatus = (m)=>{ if(statusEl) statusEl.textContent = m; };
  setStatus('Chargement listes...');

  const per = 500;
  const [teams, groups, roleGroups, cols, views, fields, catsAssets, autos, saved, storages, webhooks, exportLocs, customActions, relationTypesR] = await Promise.all([
    wfdCleanFetchJSON(base, headers, `/API/users/v1/teams/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/users/v1/groups/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/users/v1/role_groups/?per_page=${per}`),
    Promise.resolve({ok:true,status:200,json:{objects:[]},text:''}),
    wfdCleanFetchJSON(base, headers, `/API/metadata/v1/views/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/metadata/v1/fields/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/metadata/v1/assets/categories/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/automations/v1/automations/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/search/v1/search/saved/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/files/v1/storages/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/notifications/v1/webhooks/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/files/v1/export_locations/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/assets/v1/custom_actions/?per_page=${per}`),
    wfdCleanFetchJSON(base, headers, `/API/assets/v1/assets/relation_types/?per_page=${per}`),
  ]);

  

  // FULL collections list (Search+hydrate)
  setStatus('Chargement collections (Search)...');
  const allColIds = await wfdCleanFetchAllCollectionIds(base, headers).catch(() => []);
  setStatus('Hydratation collections (details)...');
  const hydratedCols = await wfdCleanHydrateCollections(base, headers, allColIds, {
    concurrency: 10,
    onProgress: (done,total) => setStatus('Hydratation collections ' + done + '/' + total)
  }).catch(() => []);
  const hydratedColsActive = (hydratedCols || []).filter(c => c && !c.date_deleted);

cache.lists = {
    teams: (teams.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.id||'') })).filter(x=>x.id),
    // Groups orphelins : group_type !== 'TEAM', pas système (Everyone/Administrator)
    orphan_groups: (groups.json.objects || []).filter(x => x.id && x.group_type !== 'TEAM'
      && !['everyone','administrator'].includes((x.name||'').toLowerCase())).map(x=>({ id:String(x.id||''), name:String(x.name||x.id||'') })),
    role_groups: (roleGroups.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.id||'') })).filter(x=>x.id),
    collections: (typeof hydratedColsActive !== 'undefined' ? hydratedColsActive : (hydratedCols || [])).filter(x=>x && x.id),
    metadata_views: (views.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.id||'') })).filter(x=>x.id),
    metadata_fields: (fields.json.objects || []).map(x=>({ id:wfdCleanFieldId(x), name:wfdCleanFieldName(x) })).filter(x=>x.id),
    categories: (catsAssets.json.objects || []).map(x => ({ id: String(x.id || x.name || ''), name: String(x.label || x.name || x.id || '')}))
  .filter(x => x.id),
    automations: (autos.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.title||x.id||'') })).filter(x=>x.id),
    saved_searches: (saved.json.objects || []).map(x=>({ id:String(x.id||x.search_id||''), name:String(x.name||x.title||x.id||x.search_id||'') })).filter(x=>x.id),
    storages: (storages.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.id||'') })).filter(x=>x.id),
    webhooks: (webhooks.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.url||x.id||'') })).filter(x=>x.id),
    export_locations: (exportLocs.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.name||x.path||x.id||'') })).filter(x=>x.id),
    custom_actions: (customActions.json.objects || []).map(x=>({ id:String(x.id||''), name:String(x.title||x.name||x.id||''), context:String(x.context||'BULK') })).filter(x=>x.id),

    // reserved future scopes
    share_management: [],
    relation_types: (relationTypesR.json.objects || []).filter(x => x.name && !x.is_system).map(x=>({ id:String(x.name||''), name:String(x.name||'') }))
  };

  cache.loaded = true;
  setStatus(`Listes chargees: teams=${cache.lists.teams.length}, role_groups=${cache.lists.role_groups.length}, cols=${cache.lists.collections.length}, views=${cache.lists.metadata_views.length}, fields=${cache.lists.metadata_fields.length}`);

  wfdCleanUiRefreshAll();
  wfdCleanRenderSystemPanel();
  wfdCleanForbiddenPickerInit();
}

/* =========================
   Protection (exclusions)
   ========================= */
function wfdCleanSyncPolicyTextarea(policy){
  try{
    const el = document.getElementById('clean-policy-json');
    if(el) el.value = JSON.stringify(policy, null, 2);
  } catch(e){}
}

function wfdCleanAddProtected(scope, kind, value){
  const policy = wfdCleanLoadPolicy();
  if(!policy.protected[scope]) policy.protected[scope] = { ids:[], names:[], regex:[] };
  const tgt = policy.protected[scope];

  if(kind === 'ids') { if(tgt.ids.indexOf(value) === -1) tgt.ids.push(value); }
  if(kind === 'names') {
    const nv = wfdCleanNorm(value);
    const exists = tgt.names.map(wfdCleanNorm).indexOf(nv) !== -1;
    if(!exists) tgt.names.push(value);
  }
  if(kind === 'regex') { if(tgt.regex.indexOf(value) === -1) tgt.regex.push(value); }

  wfdCleanSavePolicy(policy);

  // ✅ PATCH 2
  wfdCleanSyncPolicyTextarea(policy);
  if (typeof wfdCleanUiRefreshAll === 'function') wfdCleanUiRefreshAll();

  return policy;
}

function wfdCleanRemoveProtected(scope, kind, value){
  const policy = wfdCleanLoadPolicy();
  const tgt = policy.protected[scope];
  if(!tgt) return policy;
  if(kind === 'ids') tgt.ids = (tgt.ids || []).filter(x => String(x) !== String(value));
  if(kind === 'names') {
    const want = wfdCleanNorm(value);
    tgt.names = (tgt.names || []).filter(x => wfdCleanNorm(x) !== want);
  }
  if(kind === 'regex') tgt.regex = (tgt.regex || []).filter(x => String(x) !== String(value));
  wfdCleanSavePolicy(policy);
  return policy;
}

/* =========================
   UI: System include + per-scope list
   ========================= */

function wfdCleanUiApplyIncludeSystemToPolicy(){
  const policy = wfdCleanLoadPolicy();
  const el = document.getElementById('clean-include-system');
  policy.purge.include_system = !!(el && el.checked);
  wfdCleanSavePolicy(policy);
  wfdCleanRenderSystemPanel();
}

function wfdCleanSyncSystemOverridesFromUI(){
  const policy = wfdCleanLoadPolicy();
  // reset overrides
  for(const sc in policy.purge.system_overrides){
    if(policy.purge.system_overrides[sc]) policy.purge.system_overrides[sc].ids = [];
  }

  const boxes = Array.from(document.querySelectorAll('.clean-sys-item'));
  for(let i=0;i<boxes.length;i++){
    const cb = boxes[i];
    const sc = cb.getAttribute('data-scope');
    const id = cb.getAttribute('data-id');
    if(!sc || !id) continue;
    // checked = will delete; unchecked = protect => override
    if(!cb.checked){
      if(!policy.purge.system_overrides[sc]) policy.purge.system_overrides[sc] = { ids: [] };
      if(policy.purge.system_overrides[sc].ids.indexOf(id) === -1){
        policy.purge.system_overrides[sc].ids.push(id);
      }
    }
  }

  wfdCleanSavePolicy(policy);
  return policy;
}

function wfdCleanRenderSystemPanel(){
  const policy = wfdCleanLoadPolicy();
  const host = document.getElementById('clean-system-panel');
  if(!host) return;

  // hide if include_system not enabled
  if(!policy.purge.include_system){
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }

  host.style.display = 'block';
  host.innerHTML = '';

  const cache = window.__WFD_CLEAN_CACHE__;
  const lists = (cache && cache.loaded && cache.lists) ? cache.lists : {};

  const scopes = Object.keys(policy.system_filters || {}).sort();

  for(let si=0; si<scopes.length; si++){
    const sc = scopes[si];
    const list = Array.isArray(lists[sc]) ? lists[sc] : [];
    if(!list.length) continue;

    // Keep only system entities for this scope
    const sys = list.filter(ent => wfdCleanIsSystem(sc, ent, policy));
    if(!sys.length) continue;

    const title = document.createElement('div');
    title.style.marginTop = '10px';
    title.style.fontWeight = '600';
    title.textContent = sc;
    host.appendChild(title);

    for(let i=0;i<sys.length;i++){
      const ent = sys[i];
      const overridden = wfdCleanIsSystemOverridden(sc, ent, policy);
      const row = document.createElement('label');
      row.style.display = 'block';
      row.style.cursor = 'pointer';
      row.style.marginTop = '4px';

      // checked means: will be deleted
      const checked = !overridden;
      row.innerHTML =
        '<input type="checkbox" class="clean-sys-item" data-scope="' + escHtml(sc) + '" data-id="' + escHtml(ent.id) + '" ' + (checked ? 'checked' : '') + '> ' +
        escHtml(ent.name || ent.id);

      // sync on change
      row.querySelector('input').addEventListener('change', function(){
        wfdCleanSyncSystemOverridesFromUI();
      });

      host.appendChild(row);
    }
  }

  // one final sync to keep policy in sync with UI state
  wfdCleanSyncSystemOverridesFromUI();
}

/* =========================
   UI: pickers + chips
   ========================= */



// =======================================================
// WFD CLEAN — Filter for Protection picker (#clean-prot-picker)
// - No HTML patch
// - No MutationObserver (prevents freeze)
// - Inserts filter input ABOVE the picker row if the row is flex
// =======================================================
function wfdCleanProtFilterEnsure(){
  const picker = document.getElementById('clean-prot-picker');
  if(!picker) return;
  if(document.getElementById('clean-prot-filter')) return;

  const input = document.createElement('input');
  input.id = 'clean-prot-filter';
  input.type = 'text';
  input.placeholder = 'Filtrer… (nom ou id)';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.cssText = 'width:100%;margin:6px 0;padding:4px 6px;font-size:11px;' +
    'background:var(--bg2);border:1px solid var(--border2);border-radius:3px;' +
    'color:var(--text);';

  const row = picker.parentElement;
  try {
    const cs = window.getComputedStyle(row);
    if(cs && cs.display === 'flex' && row.parentNode) {
      row.parentNode.insertBefore(input, row);
    } else {
      picker.parentNode.insertBefore(input, picker);
    }
  } catch(e) {
    picker.parentNode.insertBefore(input, picker);
  }

  // restore last filter
  try{ input.value = localStorage.getItem('WFD_CLEAN_PROT_FILTER') || ''; }catch(e){}

  let t=null;
  input.addEventListener('input', function(){
    try{ localStorage.setItem('WFD_CLEAN_PROT_FILTER', input.value || ''); }catch(e){}
    if(t) clearTimeout(t);
    t = setTimeout(wfdCleanProtFilterRender, 80);
  });
}

function wfdCleanProtFilterRender(){
  const picker = document.getElementById('clean-prot-picker');
  const input = document.getElementById('clean-prot-filter');
  if(!picker) return;

  const list = picker._wfdFullList || [];
  const q = String((input && input.value) || '').toLowerCase().trim();
  const cur = picker.value;

  const html = ['<option value="">-- Choisir --</option>'];
  for(let i=0;i<list.length;i++){
    const o = list[i] || {};
    const name = String(o.name || o.title || o.id || '');
    const id = String(o.id || '');
    const hay = (name + ' ' + id).toLowerCase();
    if(!q || hay.indexOf(q) !== -1){
      html.push('<option value="' + escHtml(id) + '">' + escHtml(name || id) + '</option>');
    }
  }

  picker.innerHTML = html.join('');
  picker.disabled = false;
  if(cur) picker.value = cur;
}
function wfdCleanUiRefreshAll(){
  const policy = wfdCleanLoadPolicy();

  // Fill picker according to selected scope
  const scEl = document.getElementById('clean-prot-scope');
  const sc = scEl ? scEl.value : 'teams';
  const picker = document.getElementById('clean-prot-picker');
  if(picker){
    const cache = window.__WFD_CLEAN_CACHE__;
    const list = (cache && cache.loaded && cache.lists && cache.lists[sc]) ? cache.lists[sc] : [];

    wfdCleanProtFilterEnsure();
    picker._wfdFullList = list;
    wfdCleanProtFilterRender();
  }

  wfdCleanUiRenderProtectedChips(policy);

  // protected JSON
  const preCur = document.getElementById('clean-prot-current');
  if(preCur) preCur.textContent = JSON.stringify(policy.protected || {}, null, 2);

  // include system checkbox reflect policy
  const incEl = document.getElementById('clean-include-system');
  if(incEl) incEl.checked = !!policy.purge.include_system;
  // keep JSON textarea in sync with runtime policy (prevents Save from overwriting chips)
  const policyJsonEl = document.getElementById('clean-policy-json');
  if (policyJsonEl) policyJsonEl.value = JSON.stringify(policy, null, 2);

  // system panel
  wfdCleanRenderSystemPanel();
}


function wfdCleanUiRenderProtectedChips(policy){
  const host = document.getElementById('clean-prot-chips');
  if(!host) return;
  host.innerHTML = '';

  const prot = policy && policy.protected ? policy.protected : {};
  const cache = window.__WFD_CLEAN_CACHE__;
  const lists = (cache && cache.loaded && cache.lists) ? cache.lists : {};

  function resolveName(scope, id){
    const arr = Array.isArray(lists[scope]) ? lists[scope] : [];
    for(let i=0;i<arr.length;i++){
      if(String(arr[i].id) === String(id)) return arr[i].name || id;
    }
    return id;
  }

  function mkChip(labelText, tooltip, scope, kind, rawValue){
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);font-size:12px;';

    const txt = document.createElement('span');
    txt.textContent = labelText;
    txt.style.cssText = 'white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;';
    chip.appendChild(txt);

    if(tooltip) chip.title = tooltip;

    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = 'x';
    x.setAttribute('aria-label','Retirer');
    x.style.cssText = 'border:none;background:transparent;color:rgba(255,255,255,.7);cursor:pointer;font-size:14px;line-height:12px;padding:0 2px;margin:0;';
    x.onclick = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      wfdCleanRemoveProtected(scope, kind, rawValue);
      wfdCleanUiRefreshAll();
      toast('Protection retiree');
    };
    chip.appendChild(x);

    return chip;
  }

  const scopes = Object.keys(prot).sort();
  let count = 0;
  for(let si=0;si<scopes.length;si++){
    const sc = scopes[si];
    const ids = prot[sc] && Array.isArray(prot[sc].ids) ? prot[sc].ids : [];
    const names = prot[sc] && Array.isArray(prot[sc].names) ? prot[sc].names : [];
    const regex = prot[sc] && Array.isArray(prot[sc].regex) ? prot[sc].regex : [];

    for(let i=0;i<ids.length;i++){
      const id = ids[i];
      host.appendChild(mkChip(resolveName(sc,id), 'ID: '+id, sc, 'ids', id));
      count++;
    }
    for(let i=0;i<names.length;i++){
      const n = names[i];
      host.appendChild(mkChip(String(n), null, sc, 'names', n));
      count++;
    }
    for(let i=0;i<regex.length;i++){
      const r = regex[i];
      host.appendChild(mkChip('/'+String(r)+'/', null, sc, 'regex', r));
      count++;
    }
  }

  if(!count){
    const empty = document.createElement('span');
    empty.style.color = 'var(--text-dim)';
    empty.textContent = '-- aucune protection --';
    host.appendChild(empty);
  }
}

/* =========================
   ACL Scrub (existing behavior)
   ========================= */

function wfdCleanSetObjectTypesFromUI(policy){
  const checks = Array.from(document.querySelectorAll('.clean-ot:checked')).map(x=>x.value);
  policy.enforce.acl_scrub.object_types = checks;
}

async function wfdCleanRunAclScrub(){
  const env = (document.getElementById('clean-env') || {}).value;
  const mode = (document.getElementById('clean-mode') || {}).value || 'dry_run';
  const status = document.getElementById('clean-run-status');
  const rep = document.getElementById('clean-report');

  if(!env){ toast('Selectionne un domaine cible', true); return; }

  const policy = wfdCleanLoadPolicy();
  wfdCleanSetObjectTypesFromUI(policy);

  const forbiddenTxt = (document.getElementById('clean-forbidden') || {}).value || '';
  const forbidden = forbiddenTxt.split('\n').map(x=>String(x||'').trim()).filter(Boolean);
  policy.enforce.acl_scrub.forbidden_group_ids = forbidden;

  const policyJsonEl = document.getElementById('clean-policy-json');
  if(policyJsonEl) policyJsonEl.value = JSON.stringify(policy, null, 2);

  const dryRun = (mode !== 'apply');
  if(status) status.textContent = dryRun ? 'Dry-run...' : 'Apply...';

  const tok = wfdCleanEnvTokenByName(env);
  if(!tok){ toast('Env introuvable/inactif', true); return; }
  const base = _ikBase(tok);
  const headers = {};

  const types = (policy.enforce.acl_scrub.object_types || []).filter(Boolean);

  let checked=0, removed=0, skipped_system=0, skipped_protected=0, errors=0;
  let plannedDeletes=0;
  const failures = {};

  for(const objectType of types){
    const list = await (async()=>{
      const per=500;
      if(objectType==='metadata_views'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/metadata/v1/views/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:x.name, object_key:x.id }));
      }
      if(objectType==='collections'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/assets/v1/collections/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:(x.title||x.name||x.id), object_key:x.id }));
      }
      if(objectType==='saved_searches'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/search/v1/search/saved/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:(x.id||x.search_id), name:(x.name||x.title||x.id), object_key:(x.id||x.search_id) }));
      }
      if(objectType==='storages'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/files/v1/storages/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:(x.name||x.id), object_key:x.id }));
      }
      if(objectType==='custom_actions'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/assets/v1/custom_actions/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:(x.title||x.name||x.id), object_key:x.id }));
      }
      if(objectType==='webhooks'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/notifications/v1/webhooks/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:(x.name||x.url||x.id), object_key:x.id }));
      }
      if(objectType==='export_locations'){
        const r=await wfdCleanFetchJSON(base, headers, `/API/files/v1/export_locations/?per_page=${per}`);
        return (r.json.objects||[]).map(x=>({ id:x.id, name:(x.name||x.path||x.id), object_key:x.id }));
      }
      return [];
    })();

    for(const it of list){
      checked++;
      const ent = { id: it.id, name: it.name };
      if(wfdCleanIsSystem(objectType, ent, policy)) { skipped_system++; continue; }
      if(wfdCleanIsProtected(objectType, ent, policy)) { skipped_protected++; continue; }

      if(dryRun){ plannedDeletes += forbidden.length; continue; }

      for(const gid of forbidden){
        const url = `${base}/API/acls/v1/groups/${gid}/acl/${objectType}/${it.object_key}/`;
        try{
          const rr = await fetch(url, { method:'DELETE', headers });
          if(rr.status===204 || rr.status===200) removed++;
          else if(rr.status===404) {}
          else { errors++; failures[rr.status]=(failures[rr.status]||0)+1; }
        }catch(e){
          errors++; failures['EXC']=(failures['EXC']||0)+1;
        }
      }
    }
  }

  const out = {
    env, mode, dryRun,
    object_types: types,
    forbidden_count: forbidden.length,
    checked,
    plannedDeletes: dryRun ? plannedDeletes : undefined,
    removed,
    skipped_system,
    skipped_protected,
    errors,
    failures
  };

  if(rep){ rep.style.display='block'; rep.textContent = JSON.stringify(out, null, 2); }
  if(status) status.textContent = 'OK';
  toast('ACL scrub termine');
}

/* =========================
   Purge Domain (REAL)
   ========================= */

async function wfdCleanRunPurgeDomain(){
  const env = (document.getElementById('clean-env') || {}).value;
  const mode = (document.getElementById('clean-mode') || {}).value || 'dry_run';
  const dryRun = (mode !== 'apply');

  const status = document.getElementById('clean-run-status');
  const rep = document.getElementById('clean-report');

  if(!env){ toast('Selectionne un domaine cible', true); return; }

  const tok = wfdCleanEnvTokenByName(env);
  if(!tok){ toast('Env introuvable/inactif', true); return; }

  if(!dryRun && String(tok.environment||'').toLowerCase()==='prod'){
    toast('Refus purge destructive sur PROD', true);
    if(status) status.textContent = 'Refus PROD';
    return;
  }

  // policy
  let policy = wfdCleanLoadPolicy();
  const incEl = document.getElementById('clean-include-system');
  if(incEl) policy.purge.include_system = !!incEl.checked;
  wfdCleanSavePolicy(policy);
  // sync overrides from UI
  wfdCleanSyncSystemOverridesFromUI();
  policy = wfdCleanLoadPolicy();

  if(!dryRun){
    if(typeof askTypedConfirm === 'function'){
      const ok = await askTypedConfirm({
        title: '[WFD] Purge Domaine',
        message: `Destination : ${env}\n\nAction destructive.\nTape exactement : PURGE`,
        expected: 'PURGE',
        placeholder: 'PURGE'
      });
      if(!ok){ toast('Annule', true); if(status) status.textContent='Annule'; return; }
    } else {
      if(!confirm('PURGE DESTRUCTIVE - Continuer ?')) { toast('Annule', true); if(status) status.textContent='Annule'; return; }
    }
  }

  const base = _ikBase(tok);
  const headers = { 'Content-Type':'application/json' };

  // Feedback visuel immédiat
  if (status) {
    status.style.color = 'var(--text-dim)';
    status.textContent = dryRun ? '🔍 Analyse en cours...' : '🧹 Clean en cours — ne pas relancer...';
  }
  if (rep) rep.innerHTML = '';

  const cache = window.__WFD_CLEAN_CACHE__;
  if(!cache || !cache.loaded || !cache.lists){
    toast('Listes non chargees (choisis un env)', true);
    if (status) status.textContent = '';
    return;
  }

  const out = {
    env, mode, dryRun,
    include_system: !!policy.purge.include_system,
    plan: {
      metadata_views:{total:0,would_delete:0},
      metadata_fields:{total:0,would_delete:0},
      collections:{total:0,would_delete:0},
      teams:{total:0,would_delete:0},
      orphan_groups:{total:0,would_delete:0},
      relation_types:{total:0,would_delete:0},
      role_groups:{total:0,would_delete:0},
      automations:{total:0,would_delete:0},
      webhooks:{total:0,would_delete:0},
      custom_actions:{total:0,would_delete:0},
      saved_searches:{total:0,would_delete:0},
      categories:{total:0,would_delete:0}
    },
    done: { deleted:{}, failed:{}, skipped_system:{}, skipped_protected:{}, unsupported:{} },
    samples: { metadata_fields: [] }
  };

  function inc(obj, key){ obj[key] = (obj[key]||0)+1; }

  function handleSkip(scope, ent){
    if(wfdCleanIsProtected(scope, ent, policy)) { inc(out.done.skipped_protected, scope); return true; }
    if(wfdCleanIsSystem(scope, ent, policy) && !policy.purge.include_system) { inc(out.done.skipped_system, scope); return true; }
    if(wfdCleanIsSystem(scope, ent, policy) && policy.purge.include_system && wfdCleanIsSystemOverridden(scope, ent, policy)) { inc(out.done.skipped_protected, scope); return true; }
    return false;
  }

  async function purgeSimple(scope, list, urlOrShouldFn, deleteFnMaybe){
    list = Array.isArray(list) ? list : [];
    out.plan[scope].total = list.length;
    out.plan[scope].would_delete = 0;

    // Progress UI
    const statusRun = document.getElementById('clean-run-status');
    const setRun = (msg) => { if(statusRun) statusRun.textContent = msg; };
    const yieldUI = () => new Promise(r => setTimeout(r, 0));

    let processed = 0;
    let wouldDelete = 0;
    const byStatus = {};
    const sampleDone = {};

    const hasDeleteFn = (typeof deleteFnMaybe === 'function');
    const shouldFn = hasDeleteFn ? urlOrShouldFn : null;
    const urlFn = hasDeleteFn ? null : urlOrShouldFn;
    const delFn = hasDeleteFn ? deleteFnMaybe : null;

    for(let i=0;i<list.length;i++){
      const ent = list[i];

      if(handleSkip(scope, ent)) { processed++; continue; }

      let should = true;
      if(shouldFn) should = !!shouldFn(ent);
      else should = wfdCleanShouldDelete(scope, ent, policy);

      if(!should) { processed++; continue; }

      wouldDelete++;
      out.plan[scope].would_delete = wouldDelete;

      if(dryRun){
        processed++;
        if(processed % 50 === 0){
          setRun('[' + scope + '] ' + processed + '/' + list.length + ' — would_delete ' + wouldDelete);
          await yieldUI();
        }
        continue;
      }

      // APPLY
      if(delFn){
        let res = null;
        try{ res = await delFn(ent); } catch(e){ res = { ok:false, status:null, url:'', sample:String(e && e.message ? e.message : e) }; }
        const st = (res && res.status != null) ? res.status : 'ERR';
        byStatus[st] = (byStatus[st] || 0) + 1;
        if(res && res.ok) inc(out.done.deleted, scope);
        else {
          inc(out.done.failed, scope);
          if(!sampleDone[st]){ sampleDone[st]=true; console.warn('[CLEAN][DELETE]['+scope+']['+st+']', res && res.url ? res.url : '', (res && res.sample ? String(res.sample) : '').slice(0,300)); }
        }
      } else {
        const url = (typeof urlFn === 'function') ? urlFn(ent) : '';
        const r = await fetch(url, { method:'DELETE', headers: headers }).catch(() => null);
        const st = r ? r.status : 'ERR';
        byStatus[st] = (byStatus[st] || 0) + 1;
        if(r && r.ok) inc(out.done.deleted, scope);
        else {
          inc(out.done.failed, scope);
          if(!sampleDone[st]){ sampleDone[st]=true; console.warn('[CLEAN][DELETE]['+scope+']['+st+']', url); }
        }
      }

      processed++;

      if(processed % 25 === 0 || processed === list.length){
        const top = Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).slice(0,4)
          .map(([k,v]) => String(k)+':'+String(v)).join(' | ');
        setRun('[' + scope + '] ' + processed + '/' + list.length + ' — would_delete ' + wouldDelete + (top ? ' — ' + top : ''));
        await yieldUI();
      }
    }

    setRun('[' + scope + '] terminé — processed ' + processed + '/' + list.length + ' — would_delete ' + wouldDelete);
  }


  // 0) metadata_views detach view_fields then delete
  {
    const scope = 'metadata_views';
    const list = cache.lists.metadata_views || [];
    out.plan[scope].total = list.length;

    for(let i=0;i<list.length;i++){
      const v = list[i];
      if(handleSkip(scope, v)) continue;
      if(!wfdCleanShouldDelete(scope, v, policy)) continue;

      out.plan[scope].would_delete++;
      if(dryRun) continue;

      try{
        const rGet = await fetch(`${base}/API/metadata/v1/views/${encodeURIComponent(v.id)}/`, { headers }).catch(()=>null);
        if(!rGet || !rGet.ok){ inc(out.done.failed, scope); continue; }
        const obj = await rGet.json().catch(()=>null);
        if(!obj){ inc(out.done.failed, scope); continue; }

        if(Array.isArray(obj.view_fields) && obj.view_fields.length){
          obj.view_fields = [];
          const rPut = await fetch(`${base}/API/metadata/v1/views/${encodeURIComponent(v.id)}/`, { method:'PUT', headers, body: JSON.stringify(obj) }).catch(()=>null);
          if(!rPut || !rPut.ok){ inc(out.done.failed, scope); continue; }
        }

        const rDel = await fetch(`${base}/API/metadata/v1/views/${encodeURIComponent(v.id)}/`, { method:'DELETE', headers }).catch(()=>null);
        if(rDel && rDel.ok) inc(out.done.deleted, scope);
        else inc(out.done.failed, scope);
      }catch(e){
        inc(out.done.failed, scope);
      }
    }
  }

  // 1) metadata_fields (sample)
  {
    const list = cache.lists.metadata_fields || [];
    for(let i=0;i<Math.min(12,list.length);i++){
      out.samples.metadata_fields.push({ id:list[i].id, name:list[i].name });
    }
  }
  await purgeSimple('metadata_fields', cache.lists.metadata_fields||[], ent => `${base}/API/metadata/v1/fields/${encodeURIComponent(ent.id)}/`);

  // 2) collections (best-effort; children-first can be added later)
  await purgeSimple(
  'collections',
  cache.lists.collections,
  (ent) => {
    // réutilise tes checks existants ici (protected/system/shouldDelete)
    return wfdCleanShouldDelete('collections', ent, policy);
  },
  async (ent) => {
    // COLLE ICI TON DELETE EXISTANT (déjà fonctionnel)
    const url = base + '/API/assets/v1/collections/' + encodeURIComponent(ent.id) + '/';
    const r = await fetch(url, { method:'DELETE', headers: headers }).catch(() => null);
    if(!r) return { ok:false, status:null, url:url, sample:'fetch failed' };
    const sample = await r.text().catch(()=>'');
    return { ok:r.ok, status:r.status, url:url, sample:sample };
  }
);

  // 3) teams
  await purgeSimple('teams', cache.lists.teams||[], ent => `${base}/API/users/v1/teams/${encodeURIComponent(ent.id)}/`);

  // 3b) groups orphelins (créés via /groups/ au lieu de /teams/, ne s'affichent pas dans l'UI)
  await purgeSimple('orphan_groups', cache.lists.orphan_groups||[], ent => `${base}/API/users/v1/groups/${encodeURIComponent(ent.id)}/`);

  // 3c) relation types custom
  await purgeSimple('relation_types', cache.lists.relation_types||[], ent => `${base}/API/assets/v1/assets/relation_types/${encodeURIComponent(ent.id)}/`);

  // 4) role_groups
  await purgeSimple('role_groups', cache.lists.role_groups||[], ent => `${base}/API/users/v1/role_groups/${encodeURIComponent(ent.id)}/`);

  // 5) automations
  await purgeSimple('automations', cache.lists.automations||[], ent => `${base}/API/automations/v1/automations/${encodeURIComponent(ent.id)}/`);

  // 6) webhooks
  await purgeSimple('webhooks', cache.lists.webhooks||[], ent => `${base}/API/notifications/v1/webhooks/${encodeURIComponent(ent.id)}/`);

  // 7) custom_actions
  // custom_actions : endpoint DELETE via context (/API/assets/v1/custom_actions/{CONTEXT}/{id}/)
  await purgeSimple('custom_actions', cache.lists.custom_actions||[], null, async (ent) => {
    const context = String(ent.context || 'BULK').toUpperCase();
    const url = `${base}/API/assets/v1/custom_actions/${context}/${encodeURIComponent(ent.id)}/`;
    const r = await fetch(url, { method:'DELETE', headers }).catch(e => null);
    return { ok: r?.ok || false, status: r?.status || null, url };
  });

  // saved_searches + search groups
  // 1) Supprimer les groupes de saved searches
  const savedGroups = await fetch(`${base}/API/search/v1/search/saved/groups/?per_page=500`, { headers })
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));
  for (const grp of (savedGroups.objects || [])) {
    if (!dryRun) {
      await fetch(`${base}/API/search/v1/search/saved/group/${encodeURIComponent(grp.id)}/`, { method: 'DELETE', headers }).catch(() => null);
    }
    inc(out.plan.saved_searches, 'total');
    if (!dryRun) inc(out.done.deleted, 'saved_searches');
  }
  // 2) Supprimer les saved searches individuelles
  await purgeSimple('saved_searches', cache.lists.saved_searches||[], null, async (ent) => {
    // Essayer d'abord sans group, puis avec group si 404
    const url = `${base}/API/search/v1/search/saved/${encodeURIComponent(ent.id || ent.search_id)}/`;
    const r = await fetch(url, { method:'DELETE', headers }).catch(() => null);
    return { ok: r?.ok || false, status: r?.status || null, url };
  });

  // categories: plan only for now
  
await purgeSimple(
  'categories',
  (cache.lists.categories || []).filter(c => wfdCleanNorm((c && c.name) || '') !== 'default'),
  ent => `${base}/API/metadata/v1/assets/categories/${encodeURIComponent(ent.id || ent.name)}/`
);


  // ── Résumé final ──
  const summaryParts = [];
  for (const [scope, counts] of Object.entries(out.done || {})) {
    if (scope === 'deleted') {
      for (const [sc, n] of Object.entries(counts)) {
        if (n > 0) summaryParts.push('✅ ' + sc + ' : ' + n + ' supprimé' + (n>1?'s':''));
      }
    }
  }
  for (const [scope, counts] of Object.entries(out.plan || {})) {
    if ((counts.would_delete || 0) > 0 && dryRun) {
      summaryParts.push('🔍 ' + scope + ' : ' + counts.would_delete + ' à supprimer');
    }
  }
  const skippedSys = Object.values(out.done.skipped_system || {}).reduce((a,b)=>a+b,0);
  const skippedPro = Object.values(out.done.skipped_protected || {}).reduce((a,b)=>a+b,0);
  if (skippedSys) summaryParts.push('⏭ ' + skippedSys + ' système(s) ignoré(s)');
  if (skippedPro) summaryParts.push('🛡️ ' + skippedPro + ' protégé(s)');

  const summaryHtml = summaryParts.length
    ? summaryParts.join('<br>')
    : (dryRun ? '🔍 Aucun élément à supprimer' : '✅ Rien à nettoyer');

  if(rep){ rep.style.display='block'; rep.textContent = JSON.stringify(out, null, 2); }
  if(status) { status.style.color='var(--accent)'; status.innerHTML = summaryHtml; }
  toast(dryRun ? 'Dry-run terminé' : 'Purge terminée');
}

/* =========================
   UI: Forbidden Groups Picker
   ========================= */

function wfdCleanForbiddenPickerInit() {
  const cache = window.__WFD_CLEAN_CACHE__;
  const teams = (cache && cache.loaded && cache.lists && cache.lists.teams) ? cache.lists.teams : [];
  const picker = document.getElementById('clean-forbidden-picker');
  if (!picker) return;
  picker._wfdFullList = teams;
  wfdCleanForbiddenFilterRender();
  wfdCleanForbiddenChipsRender();
}

function wfdCleanForbiddenFilterRender() {
  const picker = document.getElementById('clean-forbidden-picker');
  if (!picker) return;
  const q = (document.getElementById('clean-forbidden-filter')?.value || '').toLowerCase();
  const list = (picker._wfdFullList || []).filter(t => !q || (t.name||'').toLowerCase().includes(q) || (t.id||'').toLowerCase().includes(q));
  picker.innerHTML = '<option value="">— Choisir un groupe —</option>' +
    list.map(t => '<option value="' + escHtml(t.id) + '">' + escHtml(t.name || t.id) + '</option>').join('');
}

function wfdCleanForbiddenAdd() {
  const picker = document.getElementById('clean-forbidden-picker');
  if (!picker || !picker.value) return;
  const id = picker.value;
  const name = picker.options[picker.selectedIndex]?.text || id;
  // Ajouter à la textarea hidden
  const ta = document.getElementById('clean-forbidden');
  if (!ta) return;
  const current = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!current.includes(id)) {
    current.push(id);
    ta.value = current.join('\n');
    wfdCleanForbiddenChipsRender();
    picker.value = '';
    toast('Groupe ajouté');
  }
}

function wfdCleanForbiddenRemove(id) {
  const ta = document.getElementById('clean-forbidden');
  if (!ta) return;
  const current = ta.value.split('\n').map(s=>s.trim()).filter(s => s && s !== id);
  ta.value = current.join('\n');
  wfdCleanForbiddenChipsRender();
}

function wfdCleanForbiddenChipsRender() {
  const host = document.getElementById('clean-forbidden-chips');
  const ta = document.getElementById('clean-forbidden');
  if (!host || !ta) return;
  const cache = window.__WFD_CLEAN_CACHE__;
  const teams = (cache && cache.loaded && cache.lists && cache.lists.teams) ? cache.lists.teams : [];
  const teamById = {};
  teams.forEach(t => { if (t.id) teamById[t.id] = t.name || t.id; });
  const ids = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!ids.length) {
    host.innerHTML = '<span style="font-size:11px;color:var(--text-dim);padding:2px 4px;">Aucun groupe sélectionné</span>';
    return;
  }
  const chips = ids.map(id => {
    const name = escHtml(teamById[id] || id);
    return '<span class="clean-forbidden-chip" style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.3);font-size:11px;">'
      + '<span>' + name + '</span>'
      + '<button data-id="' + escHtml(id) + '" class="clean-forbidden-rm" style="border:none;background:transparent;color:var(--c-danger);cursor:pointer;font-size:12px;padding:0 2px;">x</button>'
      + '</span>';
  });
  host.innerHTML = chips.join('');
  // Bind remove buttons
  host.querySelectorAll('.clean-forbidden-rm').forEach(btn => {
    btn.addEventListener('click', function() {
      wfdCleanForbiddenRemove(this.getAttribute('data-id'));
    });
  });
}


/* =========================
   UI: Save policy
   ========================= */

function wfdCleanUiSavePolicy(){
  try{
    const policyCurrent = wfdCleanLoadPolicy();
    const txt = (document.getElementById('clean-policy-json') || {}).value || '';
    const incomingRaw = txt ? JSON.parse(txt) : {};
    const incoming = wfdCleanEnsurePurgePolicy(incomingRaw);

    // Preserve runtime protections if textarea was not refreshed
    const scopes = Object.keys(policyCurrent.protected || {});
    for(let i=0;i<scopes.length;i++){
      const sc = scopes[i];
      const cur = policyCurrent.protected && policyCurrent.protected[sc] ? policyCurrent.protected[sc] : {ids:[],names:[],regex:[]};
      const inc = incoming.protected && incoming.protected[sc] ? incoming.protected[sc] : null;
      const incEmpty = !inc || ((inc.ids||[]).length===0 && (inc.names||[]).length===0 && (inc.regex||[]).length===0);
      if(incEmpty){
        if(!incoming.protected) incoming.protected = {};
        incoming.protected[sc] = cur;
      }
    }

    // Preserve system overrides if textarea missing them
    const scopes2 = Object.keys((policyCurrent.purge && policyCurrent.purge.system_overrides) || {});
    for(let i=0;i<scopes2.length;i++){
      const sc = scopes2[i];
      const cur = policyCurrent.purge.system_overrides[sc] || { ids: [] };
      const inc = incoming.purge && incoming.purge.system_overrides ? incoming.purge.system_overrides[sc] : null;
      const incEmpty = !inc || !Array.isArray(inc.ids) || inc.ids.length===0;
      if(incEmpty){
        if(!incoming.purge) incoming.purge = {};
        if(!incoming.purge.system_overrides) incoming.purge.system_overrides = {};
        incoming.purge.system_overrides[sc] = cur;
      }
    }

    wfdCleanSavePolicy(incoming);
    toast('Reglages sauvegardes');
    wfdCleanUiRefreshAll();
  }catch(e){
    toast('JSON invalide: ' + (e && e.message ? e.message : e), true);
  }
}

/* =========================
   UI: detailClean (same structure)
   ========================= */

// =======================================================
// WFD CLEAN — Prompt replacement (prompt() not supported in WFD)
// Returns a Promise<string|null>
// =======================================================
function wfdCleanPromptText(title, placeholder, initialValue){
  return new Promise((resolve) => {
    // overlay
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;';

    // modal
    const box = document.createElement('div');
    box.style.cssText =
      'width:min(520px, 96vw);background:var(--bg3);border:1px solid var(--border2);' +
      'border-radius:10px;padding:14px 14px 12px 14px;color:var(--text);';

    const h = document.createElement('div');
    h.textContent = title || 'Saisie';
    h.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:10px;';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = placeholder || '';
    inp.value = initialValue || '';
    inp.style.cssText =
      'width:100%;padding:8px 10px;font-size:12px;background:var(--bg2);' +
      'border:1px solid var(--border2);border-radius:6px;color:var(--text);';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';

    const cancel = document.createElement('button');
    cancel.textContent = 'Annuler';
    cancel.className = 'assoc-add-btn';
    cancel.style.cssText = 'opacity:.85;';

    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.className = 'assoc-add-btn';

    function close(val){
      try { document.body.removeChild(overlay); } catch(e){}
      resolve(val);
    }

    cancel.onclick = () => close(null);
    ok.onclick = () => close(inp.value);

    overlay.addEventListener('click', (e) => { if(e.target === overlay) close(null); });
    document.addEventListener('keydown', function esc(e){
      if(e.key === 'Escape'){
        document.removeEventListener('keydown', esc);
        close(null);
      }
    });

    // enter submits
    inp.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); ok.click(); }
    });

    box.appendChild(h);
    box.appendChild(inp);
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // focus
    setTimeout(() => inp.focus(), 0);
  });
}

// =======================================================
// UI: Add protection from picker (avoids inline onclick JS quoting issues)
// - IDs: require picker selection
// - Names: use picker label
// - Regex: prompt for pattern (no picker selection needed)
// =======================================================
async function wfdCleanUiAddProtection(){
  const scEl = document.getElementById('clean-prot-scope');
  const pickEl = document.getElementById('clean-prot-picker');
  const modeEl = document.getElementById('clean-prot-picker-mode');
  const sc = scEl ? scEl.value : 'collections';
  const mode = modeEl ? modeEl.value : 'ids';
  const pid = pickEl ? pickEl.value : '';

  let val = '';

  if(mode === 'regex'){
    const pat = prompt('Regex à protéger (ex: ^INGEST$ ou STOCKAGE.*):', '');
    if(!pat){ toast('Regex requise', true); return; }
    try { new RegExp(pat, 'i'); } catch(e){ toast('Regex invalide: ' + e.message, true); return; }
    val = pat.trim();
  } else if(mode === 'names'){
    if(!pid){ toast('Selection requise', true); return; }
    const label = (pickEl && pickEl.selectedOptions && pickEl.selectedOptions[0])
      ? pickEl.selectedOptions[0].textContent
      : '';
    val = (label || pid).trim();
  } else {
    // ids
    if(!pid){ toast('Selection requise', true); return; }
    val = String(pid);
  }

  wfdCleanAddProtected(sc, mode, val);
  if (typeof wfdCleanUiRefreshAll === 'function') wfdCleanUiRefreshAll();
  toast('Protection ajoutee');
}
function detailClean(){
  const envs = wfdCleanGetEnabledEnvs();
  const envOpts = envs
    .map(t=>`<option value="${escHtml(t.name)}">${escHtml(t.name)} (${escHtml(t.environment||'')})</option>`)
    .join('');

  const policy = wfdCleanLoadPolicy();

  const ot = (policy.enforce && policy.enforce.acl_scrub && Array.isArray(policy.enforce.acl_scrub.object_types))
    ? policy.enforce.acl_scrub.object_types
    : ['metadata_views'];

  const otList = ['metadata_views','collections','saved_searches','storages','custom_actions','webhooks','export_locations'];
  const otChecks = otList.map(k=>{
    const checked = ot.indexOf(k) !== -1 ? 'checked' : '';
    const label = k.replace(/_/g,' ');
    return `<label class="perm-checkbox-label"><input type="checkbox" class="clean-ot" value="${escHtml(k)}" ${checked}> ${escHtml(label)}</label>`;
  }).join('');

  const scopeOpts = [
    ['teams','Teams'],
    ['orphan_groups','Groups orphelins'],
    ['role_groups','Role Groups'],
    ['collections','Collections'],
    ['metadata_views','MD Views'],
    ['metadata_fields','Metadata (fields)'],
    ['categories','Categories'],
    ['automations','Automations'],
    ['custom_actions','Custom Actions'],
    ['saved_searches','Saved Searches'],
    ['storages','Storages'],
    ['webhooks','Webhooks'],
    ['export_locations','Export Locations'],
    ['share_management','Share Management (stub)'],
    ['relation_types','Relation Types custom']
  ].map(([v,l])=>`<option value="${escHtml(v)}">${escHtml(l)}</option>`).join('');

  const forbidden = (policy.enforce && policy.enforce.acl_scrub && Array.isArray(policy.enforce.acl_scrub.forbidden_group_ids))
    ? policy.enforce.acl_scrub.forbidden_group_ids.join('\n')
    : '';

  const includeSysChecked = policy.purge && policy.purge.include_system ? 'checked' : '';

  return (
    sectionHtml('TARGET','Cible','var(--c-info)',
      `<div class="detail-field">
        <label>Environnement connecté</label>
        <select id="clean-env" onchange="(async()=>{ const v=this.value; if(!v) return; await wfdCleanLoadListsForEnv(v); })()">
          <option value="">-- Selectionner (actifs uniquement) --</option>
          ${envOpts}
        </select>
        <div id="clean-live-status" style="margin-top:6px;font-size:11px;color:var(--text-dim);"></div>
      </div>`
    )
    +
    sectionHtml('ACL','Nettoyage des droits (ACL)','var(--accent)',
      `<div class="detail-field">
        <label>Types d'objets</label>
        <div class="perm-checkbox-grid" id="clean-ot-grid">${otChecks}</div>
      </div>`
    )
    +
    sectionHtml('SYSTEM','Entites systeme','var(--c-warn)',
      `<div class="detail-field">
        <label style="display:flex;align-items:center;gap:10px;">
          <input id="clean-include-system" type="checkbox" ${includeSysChecked} onchange="wfdCleanUiApplyIncludeSystemToPolicy()">
          Inclure les entites systeme (dangereux)
        </label>
        <div style="margin-top:8px;color:var(--text-dim);font-size:11px;">
          Quand active, les entites systeme ci-dessous sont SUPPRIMEES. Decoche une ligne pour la proteger.
        </div>
        <div id="clean-system-panel" style="margin-top:10px;display:none;"></div>
      </div>`
    )
    +
    sectionHtml('PROTECT','Protection (exclusions)','var(--c-warn)',
      `<div class="detail-field">
        <label>Protection active</label>
        <div id="clean-prot-chips" class="chip-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"></div>
      </div>

      <div class="detail-field" style="margin-top:10px;">
        <label>Ajouter a la protection</label>
        <div class="assoc-add-row" style="gap:6px;flex-wrap:wrap;">
          <select id="clean-prot-scope" style="max-width:240px;" onchange="wfdCleanUiRefreshAll()">${scopeOpts}</select>
          <select id="clean-prot-picker" style="min-width:320px;"></select>
          <select id="clean-prot-picker-mode" style="max-width:140px;">
            <option value="ids" selected>ID</option>
            <option value="names">Nom</option>
            <option value="regex">Regex</option>
          </select>
          <button class="assoc-add-btn" onclick="wfdCleanUiAddProtection()\">+ Ajouter</button>
        </div>

        <details style="margin-top:8px;">
          <summary style="cursor:pointer;color:var(--text-dim);">Voir la policy protected (JSON)</summary>
          <pre id="clean-prot-current" class="clean-report" style="margin-top:8px;">--</pre>
        </details>
      </div>`
    )
    +
    sectionHtml('RUN','Execution','var(--c-purple)',
      `<div class="detail-field">
        <label>Groups à retirer des ACL</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
          <input type="text" id="clean-forbidden-filter" placeholder="🔍 Filtrer…" oninput="wfdCleanForbiddenFilterRender()"
            style="font-size:11px;padding:4px 8px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;color:var(--text);min-width:130px;">
          <select id="clean-forbidden-picker"
            style="font-size:11px;padding:4px 8px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;min-width:160px;">
            <option value="">— Choisir un groupe —</option>
          </select>
          <button onclick="wfdCleanForbiddenAdd()" style="padding:4px 12px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;">+ Ajouter</button>
        </div>
        <div id="clean-forbidden-chips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:4px;background:var(--bg2);border:1px solid var(--border2);border-radius:3px;"></div>
        <textarea id="clean-forbidden" class="clean-json" style="display:none;">${escHtml(forbidden)}</textarea>
      </div>

      <div class="form-row-2" style="margin-top:10px;">
        <div class="detail-field">
          <label>Mode</label>
          <select id="clean-mode">
            <option value="dry_run">Dry-run</option>
            <option value="apply">Apply</option>
          </select>
        </div>
        <div class="detail-field">
          <label>Actions</label>
          <div class="clean-actions">
            <button class="assoc-add-btn" onclick="wfdCleanUiSavePolicy()">Save</button>
            <button class="assoc-add-btn" onclick="(async()=>{ await wfdCleanRunAclScrub(); wfdCleanUiRefreshAll(); })()">ACL Scrub</button>
            <button class="assoc-add-btn" onclick="(async()=>{ await wfdCleanRunPurgeDomain(); wfdCleanUiRefreshAll(); })()">Purger Domaine</button>
            <button class="assoc-add-btn" style="color:var(--c-danger);border-color:var(--c-danger);" onclick="(async()=>{ await wfdCleanEmptyTrash(); wfdCleanUiRefreshAll(); })()">🗑️ Vider Corbeille</button>
          </div>
          <div id="clean-run-status" style="margin-top:6px;font-size:11px;color:var(--text-dim);"></div>
        </div>
      </div>

      <details style="margin-top:10px;">
        <summary style="cursor:pointer;color:var(--text-dim);">Avance : Policy JSON</summary>
        <div class="detail-field" style="margin-top:8px;">
          <textarea id="clean-policy-json" class="clean-json">${escHtml(JSON.stringify(policy, null, 2))}</textarea>
        </div>
      </details>

      <pre id="clean-report" class="clean-report clean-warn" style="display:none;margin-top:10px;"></pre>`
    )
    +
    sectionHtml('RESET','Reset APS (données locales)','var(--c-danger)',
      '<div class="detail-field">' +
        '<p style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">' +
          '⚠️ Efface les données capturées localement par APS (localStorage).<br>' +
          "N'affecte pas Iconik. Pensez à exporter avant de réinitialiser." +
        '</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;" id="aps-reset-scopes">' +
          '<!-- peuplé par wfdCleanResetAPSInit() -->' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="assoc-add-btn" onclick="document.querySelectorAll(\'.aps-reset-scope-chk\').forEach(c=>c.checked=true)">Tout cocher</button>' +
          '<button class="assoc-add-btn" onclick="document.querySelectorAll(\'.aps-reset-scope-chk\').forEach(c=>c.checked=false)">Tout décocher</button>' +
          '<button class="assoc-add-btn" style="color:var(--c-danger);border-color:var(--c-danger);margin-left:auto;" onclick="wfdCleanResetAPS()">🗑️ Réinitialiser les scopes sélectionnés</button>' +
        '</div>' +
        '<div id="aps-reset-status" style="margin-top:6px;font-size:11px;color:var(--text-dim);min-height:14px;"></div>' +
      '</div>'
    )
  );
}

function wfdCleanResetAPSInit() {
  const container = document.getElementById('aps-reset-scopes');
  if (!container || !window.APS_Data) return;
  container.innerHTML = APS_Data.SCOPES.map(function(s) {
    var data = APS_Data.get(s.id);
    var count = Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : (data ? 1 : 0));
    return '<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;color:var(--text-dim);white-space:nowrap;min-width:120px;">' +
      '<input type="checkbox" class="aps-reset-scope-chk" value="' + s.id + '" checked>' +
      ' ' + s.id + ' <span style="color:var(--text-dim);font-size:10px;">(' + count + ')</span>' +
      '</label>';
  }).join('');
}

function wfdCleanResetAPS() {
  var checked = Array.from(document.querySelectorAll('.aps-reset-scope-chk:checked')).map(function(c) { return c.value; });
  if (!checked.length) { toast('Aucun scope sélectionné', true); return; }
  var st = document.getElementById('aps-reset-status');
  if (!confirm('Réinitialiser ' + checked.length + ' scope(s) APS ?\nCette action est irréversible.')) return;
  if (!window.APS_Data) { if (st) st.textContent = '❌ APS_Data non disponible'; return; }
  checked.forEach(function(id) { APS_Data.clear(id); });
  if (st) st.textContent = '✅ ' + checked.length + ' scope(s) réinitialisé(s) : ' + checked.join(', ');
  toast('Reset APS effectué');
  setTimeout(function() { location.reload(); }, 1200);
}

// =======================================================
// CLEAN — Progress logger (UI + counters)  [NON-DESTRUCTIF]
// =======================================================
function wfdCleanRunProgressInit(scope, total){
  const st = document.getElementById('clean-run-status');
  const rep = document.getElementById('clean-report');

  const ctx = {
    scope: scope,
    total: total || 0,
    done: 0,
    ok: 0,
    fail: 0,
    byStatus: {},     // {200: 10, 403: 2, 429: 5, ERR: 1}
    samples: {},      // anti-spam: { '403': true }
    stEl: st,
    repEl: rep,
    t0: Date.now()
  };

  if (ctx.stEl) ctx.stEl.textContent = '[' + scope + '] 0/' + ctx.total + '…';
  if (ctx.repEl) ctx.repEl.style.display = 'block';

  return ctx;
}

function wfdCleanRunProgressTick(ctx, statusCode, url, sampleText){
  if(!ctx) return;

  ctx.done++;

  const key = (statusCode == null) ? 'ERR' : String(statusCode);
  ctx.byStatus[key] = (ctx.byStatus[key] || 0) + 1;

  if(statusCode && statusCode >= 200 && statusCode < 300) ctx.ok++;
  else ctx.fail++;

  // UI update every 25 ops
  if(ctx.done % 25 === 0 || ctx.done === ctx.total){
    const dt = Math.max(1, Math.round((Date.now() - ctx.t0) / 1000));
    const rate = Math.round(ctx.done / dt);
    const top = Object.entries(ctx.byStatus)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,4)
      .map(([k,v])=>k+':'+v)
      .join(' | ');

    if (ctx.stEl){
      ctx.stEl.textContent =
        '[' + ctx.scope + '] ' + ctx.done + '/' + ctx.total +
        ' — OK:' + ctx.ok + ' FAIL:' + ctx.fail +
        ' — ' + top +
        ' — ' + rate + '/s';
    }
  }

  // Sample 1 per status in console (anti-spam)
  if(url && key && !ctx.samples[key] && key !== '200'){
    ctx.samples[key] = true;
    console.warn('[CLEAN]['+ctx.scope+']['+key+'] sample', url, (sampleText || '').slice(0, 300));
  }
}

function wfdCleanYieldUI(){
  return new Promise(r => setTimeout(r, 0));
}

/* =========================
   Expose
   ========================= */

/* =========================
   Empty Trash
   ========================= */

async function wfdCleanEmptyTrash() {
  const env = (document.getElementById('clean-env') || {}).value || '';
  const token = (appTokensData.appTokens || []).find(t => t.name === env);
  if (!token) { toast('Sélectionnez un environnement cible', true); return; }
  const policy = wfdCleanLoadPolicy();

  const base = _ikBase(token);
  const headers = { 'Content-Type': 'application/json' };

  // Sécurité prod
  if (token.environment === 'prod') {
    const confirm = await askTypedConfirm({
      title: '⚠️ Environnement PRODUCTION',
      message: 'Vous êtes sur le point de vider définitivement la corbeille en PRODUCTION. Cette action est irréversible.',
      expected: 'VIDER',
      placeholder: 'Tapez VIDER pour confirmer'
    });
    if (!confirm) { toast('Annulé'); return; }
  }

  const status = document.getElementById('clean-run-status');
  const setStatus = msg => { if (status) status.textContent = msg; };
  const dryRun = (document.getElementById('clean-mode') || {}).value === 'dry_run';

  setStatus('Récupération de la corbeille…');
  let totalPurged = 0;
  let totalFailed = 0;

  const searchHeaders = { ...headers, 'Content-Type': 'application/json' };

  // Purger les collections (via recherche status=DELETED)
  try {
    setStatus('Corbeille : recherche des collections supprimées…');
    let colIds = [], page = 1;
    while (true) {
      const r = await fetch(base + '/API/search/v1/search/?per_page=500&page=' + page, {
        method: 'POST', headers: searchHeaders,
        body: JSON.stringify({ doc_types: ['collections'], filter: { operator: 'AND', terms: [{ name: 'status', value: 'DELETED' }] } })
      }).then(r => r.json()).catch(() => ({}));
      const ids = (r.objects || []).map(c => c.id).filter(Boolean);
      colIds = colIds.concat(ids);
      if (!ids.length || page >= (r.pages || 1)) break;
      page++;
    }
    if (colIds.length) {
      setStatus('Corbeille : ' + colIds.length + ' collection(s)' + (dryRun ? ' (dry-run)' : ' → purge…'));
      if (!dryRun) {
        const r = await fetch(base + '/API/assets/v1/delete_queue/collections/purge/', {
          method: 'POST', headers: searchHeaders, body: JSON.stringify({ ids: colIds })
        });
        if (r.ok) totalPurged += colIds.length; else totalFailed += colIds.length;
      } else { totalPurged += colIds.length; }
    }
  } catch(e) { totalFailed++; console.error('trash collections:', e); }

  // Purger les assets (via recherche status=DELETED)
  try {
    setStatus('Corbeille : recherche des assets supprimés…');
    let assetIds = [], page = 1;
    while (true) {
      const r = await fetch(base + '/API/search/v1/search/?per_page=500&page=' + page, {
        method: 'POST', headers: searchHeaders,
        body: JSON.stringify({ doc_types: ['assets'], filter: { operator: 'AND', terms: [{ name: 'status', value: 'DELETED' }] } })
      }).then(r => r.json()).catch(() => ({}));
      const ids = (r.objects || []).map(a => a.id).filter(Boolean);
      assetIds = assetIds.concat(ids);
      if (!ids.length || page >= (r.pages || 1)) break;
      page++;
    }
    if (assetIds.length) {
      setStatus('Corbeille : ' + assetIds.length + ' asset(s)' + (dryRun ? ' (dry-run)' : ' → purge…'));
      if (!dryRun) {
        const r = await fetch(base + '/API/assets/v1/delete_queue/assets/purge/', {
          method: 'POST', headers: searchHeaders, body: JSON.stringify({ ids: assetIds })
        });
        if (r.ok) totalPurged += assetIds.length; else totalFailed += assetIds.length;
      } else { totalPurged += assetIds.length; }
    }
  } catch(e) { totalFailed++; console.error('trash assets:', e); }

  const msg = dryRun
    ? 'Dry-run : ' + totalPurged + ' élément(s) dans la corbeille'
    : totalPurged + ' élément(s) purgés' + (totalFailed ? ', ' + totalFailed + ' erreurs' : '');
  setStatus(msg);
  toast(msg);
}


window.wfdCleanLoadPolicy = wfdCleanLoadPolicy;
window.wfdCleanSavePolicy = wfdCleanSavePolicy;
window.wfdCleanLoadListsForEnv = wfdCleanLoadListsForEnv;
window.wfdCleanRunAclScrub = wfdCleanRunAclScrub;
window.wfdCleanRunPurgeDomain = wfdCleanRunPurgeDomain;
window.wfdCleanUiRefreshAll = wfdCleanUiRefreshAll;
window.wfdCleanUiSavePolicy = wfdCleanUiSavePolicy;
window.wfdCleanUiRenderProtectedChips = wfdCleanUiRenderProtectedChips;
window.wfdCleanUiApplyIncludeSystemToPolicy = wfdCleanUiApplyIncludeSystemToPolicy;
window.wfdCleanSyncSystemOverridesFromUI = wfdCleanSyncSystemOverridesFromUI;
window.wfdCleanRenderSystemPanel = wfdCleanRenderSystemPanel;
window.wfdCleanEmptyTrash = wfdCleanEmptyTrash;
window.wfdCleanForbiddenPickerInit = wfdCleanForbiddenPickerInit;
window.wfdCleanForbiddenFilterRender = wfdCleanForbiddenFilterRender;
window.wfdCleanForbiddenAdd = wfdCleanForbiddenAdd;
window.wfdCleanForbiddenRemove = wfdCleanForbiddenRemove;
window.wfdCleanForbiddenChipsRender = wfdCleanForbiddenChipsRender;
window.detailClean = detailClean;
