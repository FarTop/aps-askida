/* ========================================================================
   WFD — Automations (Canvas-only, Settings-like)
   PART 1/3 : Core state, loaders, helpers, stats, sidebar (cassettes)
   ======================================================================== */

/* =============================== FLAGS ================================== */
const ALLOW_FREE_REFERENTIAL_INPUTS = true; // WFD offline design: autoriser saisie libre dans certains champs

/* ============================ DATA CONTAINERS ============================ */
/* SoT = Settings (mêmes clés localStorage) */
let automationsData   = { automations: [] };
let webhooksData      = { webhooks: [] };
let customActionsData = { customActions: [] };

/* Référentiels (chargés depuis Settings / WFD) */
let appTokensData     = { appTokens: [] };     // NOTE: on lit 'appTokensData' (pas 'iconikAppTokensData')
let teamsData         = { teams: [] };
let usersData         = { users: [] };
let metadataViewsData = { metadataViews: [] };
let metadonneesData   = { metadonnees: [] };
let storagesData      = { storages: [] };
let collectionsData   = { collections: [] };

/* État UI courant */
let currentKind   = null;     // 'automation' | 'webhook' | 'custom'
let currentKey    = null;     // identifiant lisible (nom/title)
let currentIsNew  = false;    // création en cours
let _suspendStats = false;    // micro-optimisation pour ne pas recalculer en rafale

/* =============================== HELPERS ================================= */
/** Échappe le HTML (sécurité et rendu correct) */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/**
 * UI helper: New path * ONLY (Iconik-like)
 * - We KEEP the existing "Use current path" checkbox already rendered by the action card.
 * - Renders "New path *" only when cfg.useCurrentPath === false.
 * - No saveCurrent() / no rerender on input (avoids canvas jump).
 */
function renderUseCurrentPathNewPathBlock(actionIndex, cfg) {
  const useCur = !!cfg.useCurrentPath;
  const val = (typeof cfg.destinationPath === 'string') ? cfg.destinationPath : '';

  if (useCur) return '';

  return `
    <div class="form-group">
      <div class="field-label">New path *</div>
      <input class="field-input" type="text"
        value="${escapeHtml(val)}"
        oninput="(function(el){
          const a = window.automationEnEdition;
          const ac = a.actions[${actionIndex}];
          ac.config.destinationPath = el.value;
          ac.config.destination_directory_path = el.value; // champ Iconik
        })(this)"
        placeholder="e.g. my/custom/path">
      <div class="section-hint">Required when Use current path is disabled.</div>
    </div>
  `;
}
// Résumé compact pour "Update metadata" : tags "Champ=Valeur (Mode)"
function renderUpdateMetadataTags(cfg){
  const wrap = _el('div', 'tags-wrap'); // classe au besoin

  const tgt = (cfg?.targets && cfg.targets[0]) ? cfg.targets[0] : null;
  const fields = Array.isArray(tgt?.fields) ? tgt.fields : [];

  // On ne montre que les champs cochés
  const checked = fields.filter(f => f && f.checked);

  if (!checked.length) {
    const hint = _el('div','section-hint');
    hint.textContent = "Aucun champ méta marqué pour mise à jour.";
    wrap.appendChild(hint);
    return wrap;
  }

  checked.forEach(f => {
    const name = f.field?.name || f.field?.id || '—';
    const val = (typeof f.value === 'undefined' || f.value === null) ? '' : String(f.value);

    // Mode : affichage seulement si présent et utile
    const mode = (f.mode && String(f.mode).trim()) ? String(f.mode).trim() : '';
    const showMode = mode && mode.toLowerCase() !== 'overwrite'; // on masque Overwrite par défaut

    const tag = _el('span','tag'); // tu peux réutiliser une classe existante si tu as déjà des tags
    tag.textContent = `${name}=${val}${showMode ? ` (${mode})` : ''}`;
    wrap.appendChild(tag);
  });

  return wrap;
}

// Re-render du canvas en conservant scroll + état des <details> (Advanced)
function rerenderCanvasAutomationPreserveScroll(name){
  const editor = document.getElementById('canvas-editor');
  const scrollTop = editor ? editor.scrollTop : 0;

  // mémoriser les <details> ouverts (Advanced)
  const detailsState = editor
    ? Array.from(editor.querySelectorAll('details')).map(d => d.open)
    : [];

  renderCanvasAutomation(name);

  // restaurer après que le DOM soit reconstruit
  requestAnimationFrame(() => {
    const ed2 = document.getElementById('canvas-editor');
    if (ed2) ed2.scrollTop = scrollTop;

    // restaurer l'état des <details>
    if (ed2 && detailsState.length) {
      const details2 = Array.from(ed2.querySelectorAll('details'));
      details2.forEach((d, i) => { if (typeof detailsState[i] !== 'undefined') d.open = detailsState[i]; });
    }
  });
}

/** Bool souple */
function toBool(v){
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['true','1','yes','y','on'].includes(s);
}
/** Normalise un objet/texte de headers vers un tableau [{key,value}] */
function normalizeHeadersToArray(h){
  if (Array.isArray(h)) return h.map(x => ({ key: String(x.key ?? ''), value: String(x.value ?? '') }));
  if (h && typeof h === 'object') return Object.entries(h).map(([k,v]) => ({ key: k, value: String(v ?? '') }));
  if (typeof h === 'string'){
    try { const obj = JSON.parse(h); if (obj && typeof obj === 'object') return normalizeHeadersToArray(obj); } catch {}
    return h.split(';').map(s => s.trim()).filter(Boolean).map(p => {
      const i = p.indexOf(':'); return i > -1 ? { key: p.slice(0,i).trim(), value: p.slice(i+1).trim() } : { key: p, value: '' };
    });
  }
  return [];
}
/** Petit comparateur alpha FR (case-insensitive) */
function cmp(a, b){ return String(a||'').localeCompare(String(b||''), 'fr', { sensitivity:'base' }); }

/* ========================== LOAD / SAVE (SoT WFD) ======================== */
function chargerDonnees(){
  // Automations
  try {
    const s = localStorage.getItem('automationsData');
    if (s) {
      const p = JSON.parse(s);
      automationsData = Array.isArray(p) ? { automations: p } :
                        Array.isArray(p?.automations) ? p :
                        Array.isArray(p?.objects) ? { automations: p.objects } :
                        { automations: [] };
    }
  } catch { automationsData = { automations: [] }; }

  // Webhooks
  try {
    const s = localStorage.getItem('webhooksData');
    if (s) {
      const p = JSON.parse(s);
      webhooksData = Array.isArray(p) ? { webhooks: p } :
                     Array.isArray(p?.webhooks) ? p :
                     Array.isArray(p?.objects) ? { webhooks: p.objects } :
                     { webhooks: [] };
      // Normaliser headers → array
      webhooksData.webhooks = (webhooksData.webhooks||[]).map(w => ({ ...w, headers: normalizeHeadersToArray(w.headers) }));
    }
  } catch { webhooksData = { webhooks: [] }; }

  // Custom Actions
  try {
    const s = localStorage.getItem('customActionsData');
    if (s) {
      const p = JSON.parse(s);
      customActionsData = Array.isArray(p) ? { customActions: p } :
                          Array.isArray(p?.customActions) ? p :
                          Array.isArray(p?.objects) ? { customActions: p.objects } :
                          { customActions: [] };
      customActionsData.customActions = (customActionsData.customActions||[]).map(ca => ({
        ...ca,
        headers: normalizeHeadersToArray(ca.headers)
      }));
    }
  } catch { customActionsData = { customActions: [] }; }

  // Référentiels Settings (lecture *non bloquante*)
  try { const s = localStorage.getItem('appTokensData');      if (s) appTokensData      = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('teamsData');          if (s) teamsData          = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('usersData');          if (s) usersData          = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('metadataViewsData');  if (s) metadataViewsData  = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('metadonneesData');    if (s) metadonneesData    = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('storagesData');       if (s) storagesData       = JSON.parse(s); } catch {}
  try { const s = localStorage.getItem('collectionsData');    if (s) collectionsData    = JSON.parse(s); } catch {}
  
  normalizeAutomationsFromIconik();
}

// ─────────────────────────────────────────────────────────────
// Iconik → WFD normalization for Automations (types + parameters)
// - Iconik provides {type, parameters}; WFD editor expects {type, config}
// - Also maps Iconik API types (METADATA_UPDATE, ADD_TO_COLLECTION, …)
//   to WFD catalogue keys (metadata.changed, Add to collection, …)
// - Keeps WFD-only "conditions" untouched
// ─────────────────────────────────────────────────────────────
function normalizeAutomationsFromIconik() {

  // Trigger types observed in your tenant (coverage)
  const ICONIK_TRIGGER_TO_WFD = {
    'METADATA_UPDATE': 'metadata.changed',
    'ARCHIVE': 'asset.archived',
    'RESTORE': 'asset.restored',
    'OBJECT_ADDED_TO_COLLECTION': 'asset.added_to_collection',
    'VERSION_ONLINE': 'asset.has_new_version',
    'TRANSFER_TO_STORAGE': 'asset.transferred',
    'SUBTITLE_ADDED': 'subtitle.added',
  };

  // Action types observed in your tenant (coverage)
  const ICONIK_ACTION_TO_WFD = {
    'ADD_TO_COLLECTION': 'Add to collection',
    'UPDATE_ACL': 'Set ACL on asset',
    'ANALYZE': 'Analyze asset',
    'ARCHIVE': 'Archive asset',
    'RESTORE': 'Restore asset',
    'METADATA_UPDATE': 'Update metadata',
	'TRANSFER': 'Transfer asset',
    'CUSTOM_ACTION': 'Custom action',
    'TRANSCODE': 'Transcode asset',
  };

  function ensureTriggerKey(k){
    if (!k) return;
    if (!TRIGGERS_ICONIK[k]) TRIGGERS_ICONIK[k] = { label: k, fields: [] };
  }

  function ensureActionKey(k){
    if (!k) return;
    if (!ACTIONS_ICONIK[k]) ACTIONS_ICONIK[k] = { label: k, fields: [] };
  }

  // Deep clone helper to BREAK aliasing (parameters !== config)
  function deepClone(obj){
    try { return JSON.parse(JSON.stringify(obj || {})); }
    catch { return {}; }
  }

  function normAutomation(a){
    if (!a || typeof a !== 'object') return a;

    // WFD-only: do NOT overwrite conditions
    if (!Array.isArray(a.conditions)) a.conditions = [];

    // Helpers de résolution (IDs Iconik -> libellés WFD)
    function resolveMetaNameById(metaId){
      const arr = (metadonneesData && Array.isArray(metadonneesData.metadonnees)) ? metadonneesData.metadonnees : [];
      const hit = arr.find(m => String(m?.id || '') === String(metaId));
      return hit ? (hit.nom || hit.name || metaId) : metaId;
    }

    function resolveCollectionNameById(colId){
      const arr = (collectionsData && Array.isArray(collectionsData.collections)) ? collectionsData.collections : [];
      const hit = arr.find(c => c && typeof c === 'object' && String(c.id) === String(colId));
      return hit ? (hit.name || hit.nom || hit.title || hit.id) : String(colId || '');
    }

    function mapPerm(p){
      const s = String(p || '').toLowerCase();
      if (s === 'read') return 'Read';
      if (s === 'write') return 'Write';
      if (s === 'delete') return 'Delete';
      if (s === 'change-acl' || s === 'edit access' || s === 'edit_access') return 'Edit Access';
      return p;
    }

    function mapMode(m){
      const s = String(m || '').toUpperCase();
      if (s === 'OVERWRITE') return 'Overwrite';
      if (s === 'APPEND') return 'Append';
      return m;
    }

    // ─────────────────────────────────────────────
// ICONIK Filters (sync) — dissocié de WFD-only conditions
// Source: a.raw.conditions (Iconik) -> a.iconikFilters (WFD UI)
// ─────────────────────────────────────────────
(function initIconikFilters(){
  const rawConds = (a?.raw && Array.isArray(a.raw.conditions)) ? a.raw.conditions : [];
  const out = { mediaTypes: [], assetTypes: [] };

  // Iconik values -> UI labels
  const MT = { image:'Image', video:'Video', audio:'Audio' };
  const AT = {
    ASSET:'Asset', SUBCLIP:'Subclip', SEQUENCE:'Sequence',
    PLACEHOLDER:'Placeholder', LINK:'Link', NLE_PROJECT:'NLE Project'
  };

  // Iconik structure: [{operator:'AND', terms:[{name, value_in:[]}, ...]}]
  const c0 = rawConds[0];
  const terms = Array.isArray(c0?.terms) ? c0.terms : [];

  const media = terms.find(t => String(t?.name||'') === 'media_type');
  const types = terms.find(t => String(t?.name||'') === 'type');

  if (media && Array.isArray(media.value_in)) {
    out.mediaTypes = media.value_in.map(v => MT[String(v||'').toLowerCase()] || String(v)).filter(Boolean);
  }
  if (types && Array.isArray(types.value_in)) {
    out.assetTypes = types.value_in.map(v => AT[String(v||'').toUpperCase()] || String(v)).filter(Boolean);
  }

  // Always present (1 filter card max)
  a.iconikFilters = a.iconikFilters && typeof a.iconikFilters === 'object' ? a.iconikFilters : out;

  // If already present, keep existing selections unless empty
  if (!Array.isArray(a.iconikFilters.mediaTypes) || !a.iconikFilters.mediaTypes.length) a.iconikFilters.mediaTypes = out.mediaTypes;
  if (!Array.isArray(a.iconikFilters.assetTypes) || !a.iconikFilters.assetTypes.length) a.iconikFilters.assetTypes = out.assetTypes;
})();

    // ─────────────────────────────────────────────
    // TRIGGERS: parameters -> config (ALWAYS clone), type mapping
    // ─────────────────────────────────────────────
    if (!Array.isArray(a.triggers)) a.triggers = [];
    a.triggers = a.triggers.map(t => {
      if (!t || typeof t !== 'object') return t;

      const raw = String(t.type || '').trim();
      if (!raw) return t;

      t.type_raw = t.type_raw || raw;

      const mapped = ICONIK_TRIGGER_TO_WFD[raw] || raw;
      t.type = mapped;
      ensureTriggerKey(mapped);

      // ✅ Always break aliasing:
      const tParams = (t.parameters && typeof t.parameters === 'object') ? t.parameters : {};
      t.parameters = tParams;                  // keep RAW Iconik here
      t.config = deepClone(tParams);           // UI working copy (safe)

      // Projection: metadata.changed (Iconik METADATA_UPDATE)
      if (t.type === 'metadata.changed') {
        const cfg = t.config || {};
        const mv = (cfg.metadata_values && typeof cfg.metadata_values === 'object') ? cfg.metadata_values : null;

        if (mv) {
          const fieldId = Object.keys(mv)[0] || '';

          if (!cfg.metadataField && fieldId) {
            cfg.metadataField_id = fieldId;
            cfg.metadataField = resolveMetaNameById(fieldId);
          }

          if (typeof cfg.valueChangedTo === 'undefined' || cfg.valueChangedTo === '') {
            const obj = fieldId ? mv[fieldId] : null;
            let val;
            if (obj && Array.isArray(obj.field_values) && obj.field_values.length) {
              val = obj.field_values[0]?.value;
            }
            if (typeof val !== 'undefined') cfg.valueChangedTo = String(val);
          }

          t.config = cfg;
        }
      }

      // ✅ Projection triggers: asset.new + asset.has_new_version — sync "Trigger after transcode"
if (t.type === 'asset.new' || t.type === 'asset.has_new_version') {
  const cfg = t.config || {};

  // Iconik param (spec): wait_for_transcode (boolean) [1](https://preview.iconik.cloud/docs/automations/spec/)
  // UI param (WFD): triggerAfterTranscode (checkbox) [1](https://preview.iconik.cloud/docs/automations/spec/)
  const rawWait =
    (typeof cfg.wait_for_transcode !== 'undefined') ? cfg.wait_for_transcode :
    (typeof cfg.waitForTranscode !== 'undefined') ? cfg.waitForTranscode :
    (typeof cfg.trigger_after_transcode !== 'undefined') ? cfg.trigger_after_transcode :
    (typeof cfg.triggerAfterTranscode !== 'undefined') ? cfg.triggerAfterTranscode :
    undefined;

  if (typeof rawWait !== 'undefined') {
    cfg.triggerAfterTranscode = !!rawWait;
    // conserver aussi la clé Iconik (cohérence si on réexporte)
    cfg.wait_for_transcode = !!rawWait;
  }

  t.config = cfg;
}
      
	  // ✅ Projection trigger: asset.archived -> resolve storage_id to storage name for UI (robust keys)
if (t.type === 'asset.archived') {
  const cfg = t.config || {};
  const sid = cfg.storage_id;

  if (sid) {
    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(
      stor
        .filter(s => s && s.id)
        .map(s => [String(s.id), (s.nom || s.name || s.title || s.id)])
    );

    const name = storById.get(String(sid)) || String(sid);

    // ── UI-friendly (string)
    cfg.storage = name;
    cfg.storageName = name;

    // ── UI-friendly (id + variants)
    cfg.storageId = String(sid);
    cfg.storage_id = String(sid); // on garde aussi ce champ "alias" (certains renders lisent ça)

    // ── UI-friendly (array variant, au cas où le contrôle est multi)
    cfg.storages = Array.isArray(cfg.storages) ? cfg.storages : [name];
    cfg.storage_ids = Array.isArray(cfg.storage_ids) ? cfg.storage_ids : [String(sid)];
  }

  t.config = cfg;
}

      // ✅ Projection trigger: asset.restored -> resolve storage_id to storage name for UI (robust keys)
      if (t.type === 'asset.restored') {
        const cfg = t.config || {};
        const sid = cfg.storage_id;

        if (sid) {
         const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
         const storById = new Map(
         stor
        .filter(s => s && s.id)
        .map(s => [String(s.id), (s.nom || s.name || s.title || s.id)])
    );

         const name = storById.get(String(sid)) || String(sid);

    // UI-friendly (string)
    cfg.storage = name;
    cfg.storageName = name;

    // UI-friendly (id + variants)
    cfg.storageId = String(sid);
    cfg.storage_id = String(sid);

    // UI-friendly (multi variants)
    cfg.storages = Array.isArray(cfg.storages) ? cfg.storages : [name];
    cfg.storage_ids = Array.isArray(cfg.storage_ids) ? cfg.storage_ids : [String(sid)];
  }

  t.config = cfg;
}

      // ✅ Projection trigger: asset.transferred -> resolve storage_id to storage name for UI (robust keys)
  if (t.type === 'asset.transferred') {
  const cfg = t.config || {};
  const sid = cfg.storage_id;

  if (sid) {
    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(
      stor
        .filter(s => s && s.id)
        .map(s => [String(s.id), (s.nom || s.name || s.title || s.id)])
    );

    const name = storById.get(String(sid)) || String(sid);

    // UI-friendly (string)
    cfg.storage = name;
    cfg.storageName = name;

    // UI-friendly (id + variants)
    cfg.storageId = String(sid);
    cfg.storage_id = String(sid);

    // UI-friendly (multi variants) — IMPORTANT pour pré-sélectionner l’UI
    cfg.storages = Array.isArray(cfg.storages) ? cfg.storages : [name];
    cfg.storage_ids = Array.isArray(cfg.storage_ids) ? cfg.storage_ids : [String(sid)];
  }

  t.config = cfg;
}      

    // ✅ Projection trigger: asset.not_modified — sync Days since modified
if (t.type === 'asset.not_modified') {
  const cfg = t.config || {};
  // Iconik: days_since_modified ; UI: daysSinceModified
  if (typeof cfg.days_since_modified !== 'undefined' && typeof cfg.daysSinceModified === 'undefined') {
    cfg.daysSinceModified = cfg.days_since_modified;
  }
  // (optionnel) si UI a modifié daysSinceModified, on garde aussi la clé Iconik
  if (typeof cfg.daysSinceModified !== 'undefined' && typeof cfg.days_since_modified === 'undefined') {
    cfg.days_since_modified = cfg.daysSinceModified;
  }
  t.config = cfg;
}

// ✅ Projection trigger: asset.created_days_ago — sync Days since created
if (t.type === 'asset.created_days_ago') {
  const cfg = t.config || {};
  // Iconik: days_since_created ; UI: daysAgo (dans ton catalogue) → on aligne les deux
  if (typeof cfg.days_since_created !== 'undefined') {
    if (typeof cfg.daysAgo === 'undefined') cfg.daysAgo = cfg.days_since_created;
    if (typeof cfg.daysSinceCreated === 'undefined') cfg.daysSinceCreated = cfg.days_since_created; // bonus si tu l'utilises ailleurs
  }
  // Si UI a modifié daysAgo, on garde aussi la clé Iconik
  if (typeof cfg.daysAgo !== 'undefined' && typeof cfg.days_since_created === 'undefined') {
    cfg.days_since_created = cfg.daysAgo;
  }
  t.config = cfg;
}

// ✅ Projection trigger: approval.status_changed — align Iconik codes -> UI labels (chips)
if (t.type === 'approval.status_changed') {
  const cfg = t.config || {};

  // Canonical UI labels (ceux affichés dans l’UI)
  const CANON = new Set([
    'Rejected',
    'Waiting for Approval',
    'Approved',
    'Approved and Rejected'
  ]);

  // Map Iconik/API codes -> Canonical UI labels
  function mapStatus(s) {
    const raw = String(s || '').trim();
    if (!raw) return '';

    const v = raw.toUpperCase().replace(/\s+/g, '_');

    // Iconik codes observés (chez toi)
    if (v === 'APPROVED') return 'Approved';
    if (v === 'REJECTED' || v === 'NOT_APPROVED') return 'Rejected';
    if (v === 'REQUESTED' || v === 'WAITING_FOR_APPROVAL' || v === 'WAITING') return 'Waiting for Approval';
    if (v === 'MIXED' || v === 'APPROVED_AND_REJECTED' || v === 'APPROVED_REJECTED') return 'Approved and Rejected';

    // Si Iconik renvoie déjà le label UI en clair
    if (CANON.has(raw)) return raw;

    return raw; // fallback (sera filtré ci-dessous si non-canon)
  }

  // Source Iconik: parameters.statuses (array) ; compat éventuelle: status (string)
  let arr = [];
  if (Array.isArray(cfg.statuses)) arr = cfg.statuses.slice();
  else if (cfg.status) arr = [cfg.status];

  // Normaliser + dédoublonner
  const mapped = [];
  const seen = new Set();
  arr.forEach(x => {
    const m = mapStatus(x);
    if (!m) return;
    if (!seen.has(m)) { seen.add(m); mapped.push(m); }
  });

  // IMPORTANT : ne garder que les valeurs canoniques (évite chips "Mixed"/"Requested")
  cfg.statuses = mapped.filter(x => CANON.has(x));

  t.config = cfg;
}

// ✅ Projection trigger: subtitle.added — sync Language + Closed Caption (Yes/No)
if (t.type === 'subtitle.added') {
  const cfg = t.config || {};

  // --- Language (API returns e.g. 'br')
  if (typeof cfg.language !== 'undefined' && cfg.language !== null && cfg.language !== '') {
    cfg.language = String(cfg.language);
  }

  // --- Closed captions (API returns closed_captions: true/false)
  // Read candidates (plural first, then singular fallback)
  const rawCC =
    (typeof cfg.closed_captions !== 'undefined') ? cfg.closed_captions :
    (typeof cfg.closed_caption  !== 'undefined') ? cfg.closed_caption  :
    (typeof cfg.closedCaption   !== 'undefined') ? cfg.closedCaption   :
    undefined;

  // Normalize to UI string: 'Yes' | 'No' | 'Not defined'
  if (typeof rawCC !== 'undefined' && rawCC !== null && rawCC !== '') {
    const s = String(rawCC).trim().toLowerCase();
    const yes = (rawCC === true)  || ['true','yes','1','y','on'].includes(s);
    const no  = (rawCC === false) || ['false','no','0','n','off'].includes(s);
    cfg.closedCaption = yes ? 'Yes' : (no ? 'No' : 'Not defined');
  } else if (typeof cfg.closedCaption === 'undefined') {
    cfg.closedCaption = 'Not defined';
  }

  // Keep API-compatible bool (if UI edits later)
  if (cfg.closedCaption === 'Yes') cfg.closed_captions = true;
  if (cfg.closedCaption === 'No')  cfg.closed_captions = false;

  t.config = cfg;
}

      // Projection: asset.added_to_collection (Iconik OBJECT_ADDED_TO_COLLECTION)
      if (t.type === 'asset.added_to_collection') {
        const cfg = t.config || {};

        if (typeof cfg.monitorSubCollections === 'undefined') {
          cfg.monitorSubCollections = !!cfg.include_subcollections;
        }

        if (Array.isArray(cfg.collection_ids) && (!Array.isArray(cfg.collections) || cfg.collections.length === 0)) {
          cfg.collections = cfg.collection_ids.map(id => {
            const name = resolveCollectionNameById(id);
            return { id: String(id), name: String(name), path: String(name) };
          });
        }

        t.config = cfg;
      }

      return t;
    });

// ─────────────────────────────────────────────
// ACTIONS: parameters -> config (ALWAYS clone), type mapping
// ─────────────────────────────────────────────
if (!Array.isArray(a.actions)) a.actions = [];
a.actions = a.actions.map(ac => {
  if (!ac || typeof ac !== 'object') return ac;

  const raw = String(ac.type || '').trim();
  if (!raw) return ac;

  ac.type_raw = ac.type_raw || raw;

  const mapped = ICONIK_ACTION_TO_WFD[raw] || raw;
  ac.type = mapped;
  ensureActionKey(mapped);

  // ✅ Always break aliasing:
  const aParams = (ac.parameters && typeof ac.parameters === 'object') ? ac.parameters : {};
  ac.parameters = aParams;        // RAW Iconik
  ac.config = deepClone(aParams); // UI working copy

// ─────────────────────────────────────────────
// CUSTOM ACTION (Iconik CUSTOM_ACTION / TRIGGER_CUSTOM_ACTION)
// - Iconik: parameters.action_id (uuid) + parameters.metadata_values
// - UI WFD: select-custom-actions doit être prérempli + afficher les valeurs
// ─────────────────────────────────────────────
if (ac.type === 'Custom action') {
  const cfg = ac.config || {};

  // 1) Pré-sélection de la Custom Action depuis Iconik action_id
  // On stocke l'id (valeur stable) ET un label si on peut le résoudre via customActionsData.
  const actionId = cfg.action_id || cfg.custom_action_id || cfg.customActionId;
  if (actionId) {
    cfg.customActionId = String(actionId);

    // Resolve id -> title (si référentiel customActionsData chargé)
    const list = (customActionsData && Array.isArray(customActionsData.customActions))
      ? customActionsData.customActions
      : [];
    const hit = list.find(x => String(x?.id || '') === String(actionId));

    // UI: on pousse la valeur vers customActionRef (le select lira cette valeur)
    // On met l'id (robuste) ; si le select utilise les titles, on garde aussi le title en complément.
    cfg.customActionRef = String(actionId);
    if (hit && (hit.title || hit.name || hit.nom)) {
      cfg.customActionTitle = String(hit.title || hit.name || hit.nom);
    }
  }

  // 2) Exposer les metadata_values pour affichage UI (sans RAW)
const mv = (cfg.metadata_values && typeof cfg.metadata_values === 'object') ? cfg.metadata_values : null;
if (mv) {
  // Helper: resolve field label from metadonneesData if possible
  function resolveMetaLabelByKey(key) {
    const arr = (metadonneesData && Array.isArray(metadonneesData.metadonnees)) ? metadonneesData.metadonnees : [];
    const hit = arr.find(m => String(m?.id || m?.name || '') === String(key));
    return hit ? String(hit.nom || hit.name || key) : String(key);
  }

  // Helper: robust value extraction from Iconik "field_values"
  function extractValue(first) {
    if (first == null) return '';
    if (typeof first !== 'object') return String(first);

    // Most common
    if ('value' in first && first.value != null) return String(first.value);

    // Other possible payload keys (best-effort)
    const candidates = ['date_time', 'datetime', 'date', 'time', 'text', 'string', 'number', 'bool'];
    for (const k of candidates) {
      if (k in first && first[k] != null) return String(first[k]);
    }

    // Fallback: stringify minimal
    try { return JSON.stringify(first); } catch { return ''; }
  }

  const flat = [];
  Object.keys(mv).forEach(k => {
    if (!k) return;

    // ✅ Ne pas afficher __asset_category (technique)
    if (k === '__asset_category') return;

    const obj = mv[k] || {};
    const fv = Array.isArray(obj.field_values) ? obj.field_values : [];
    const first = fv.length ? fv[0] : null;

    const v = extractValue(first);

    // ✅ Afficher un label user-friendly si possible
    const label = resolveMetaLabelByKey(k);

    flat.push({ field: label, value: v });
  });

  cfg.metadataValuesFlat = flat;
}
  ac.config = cfg;
}

// ─────────────────────────────────────────────
// ANALYZE asset (Iconik ANALYZE) — UI: Force analysis checkbox
// Iconik uses parameters.force ; UI uses config.forceAnalysis
// ─────────────────────────────────────────────
if (ac.type === 'Analyze asset') {
  const cfg = ac.config || {};

  // Iconik -> UI
  if (typeof cfg.force !== 'undefined') {
    cfg.forceAnalysis = !!cfg.force;
  }

  // UI -> Iconik (si l’utilisateur coche/décoche côté WFD)
  if (typeof cfg.force === 'undefined' && typeof cfg.forceAnalysis !== 'undefined') {
    cfg.force = !!cfg.forceAnalysis;
  }

  // (optionnel) force_type existe côté Iconik, mais l’UI WFD n’en a pas besoin pour l’instant
  // cfg.force_type reste inchangé si présent.

  ac.config = cfg;
}

  // ─────────────────────────────────────────────
// DELETE FILE SET (Iconik DELETE_FILE_SET) — UI: Delete from storage + Format to delete
// - Iconik renvoie typiquement un storage_id + un format (ex: ORIGINAL)
// - UI WFD attend cfg.storage (nom, pour select-storages) + cfg.formatToDelete (texte)
// ─────────────────────────────────────────────
if (ac.type === 'Delete file set') {
  const cfg = ac.config || {};

  // 1) Storage : récupérer l'ID Iconik puis résoudre en nom (comme archived/restored)
  const sid =
    cfg.storage_id ||
    cfg.storageId ||
    cfg.storage_id_to_delete ||
    cfg.delete_from_storage_id ||
    cfg.storage; // fallback si déjà un id

  if (sid) {
    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(
      stor
        .filter(s => s && s.id)
        .map(s => [String(s.id), (s.nom || s.name || s.title || s.id)])
    );

    const name = storById.get(String(sid)) || String(sid);

    // UI-friendly (select-storages attend une string "name")
    cfg.storage = name;

    // Conserver variantes id
    cfg.storageId = String(sid);
    cfg.storage_id = String(sid);
  }

  // 2) Format : Iconik peut utiliser différentes clés (best-effort)
  const fmt =
    cfg.format_to_delete ||
    cfg.formatToDelete ||
    cfg.format ||
    cfg.format_name ||
    cfg.formatName ||
    '';

  if (fmt) {
    cfg.formatToDelete = String(fmt);
    // conserver aussi une clé API-friendly si elle existe/sert au roundtrip
    if (typeof cfg.format_to_delete === 'undefined') cfg.format_to_delete = String(fmt);
  }

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// EXPORT asset (Iconik EXPORT) — UI projections
// ─────────────────────────────────────────────
if (ac.type === 'Export asset') {
  const cfg = ac.config || {};

  // Export location id -> UI select
  if (cfg.export_location_id) {
    cfg.exportLocationId = String(cfg.export_location_id);
    cfg.exportLocation = String(cfg.export_location_id);
  }

  // Preferred source storage id -> UI select-storages (name)
  if (cfg.preferred_original_storage_id) {
    const sid = String(cfg.preferred_original_storage_id);

    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(
      stor.filter(s => s && s.id).map(s => [String(s.id), (s.nom || s.name || s.title || s.id)])
    );

    const name = storById.get(sid) || '';

    cfg.preferredSourceStorage_id = sid;
    cfg.preferredSourceStorage = name; // IMPORTANT: le select-storages attend un nom, pas un uuid
  }

  // Create folder for asset (Iconik export_to_asset_folder)
  if (typeof cfg.export_to_asset_folder !== 'undefined') {
    cfg.createFolderForAsset = !!cfg.export_to_asset_folder;
  }

  // Overwrite existing (Iconik overwrite)
  if (typeof cfg.overwrite !== 'undefined') {
    cfg.overwriteExisting = !!cfg.overwrite;
  }

  ac.config = cfg;
}

  // ─────────────────────────────────────────────
  // REMOVE RESTRICTION (Iconik REMOVE_ASSET_RESTRICTION) — UI: Blocking Field + Warning Field
  // Les champs doivent référencer des Metadata Fields flaggés "Block assets" / "Display as warning".
  // ─────────────────────────────────────────────
if (ac.type === 'Remove restriction') {
  const cfg = ac.config || {};

  // Resolve helpers (label -> id) using metadonneesData
  function resolveMetaIdByLabel(label) {
  const arr = (metadonneesData && Array.isArray(metadonneesData.metadonnees)) ? metadonneesData.metadonnees : [];
  const key = String(label || '').trim().toLowerCase();
  const hit = arr.find(m => {
    const a = String(m?.id || '').trim().toLowerCase();
    const b = String(m?.name || '').trim().toLowerCase();
    const c = String(m?.nom || '').trim().toLowerCase();
    const d = String(m?.raw?.label || '').trim().toLowerCase();
    return a === key || b === key || c === key || d === key;
  });
  return hit ? String(hit.id || hit.name || hit.nom || label) : String(label || '');
}

  // Iconik keys réellement vues chez toi
const blockingRaw = cfg.restrict_metadata_field ?? cfg.blocking_field_id ?? cfg.blockingFieldId ?? '';
const warningRaw  = cfg.warning_metadata_field  ?? cfg.warning_field_id  ?? cfg.warningFieldId  ?? '';

const b = String(blockingRaw || '').trim();
const w = String(warningRaw  || '').trim();

// Ici, chez toi les valeurs sont des "ids techniques" (ex: BlockTest, WarningText)
// Donc on les copie directement dans les champs UI.
cfg.blockingFieldId = b;
cfg.warningFieldId  = w;

// Conserver aussi les aliases API-friendly
if (b) cfg.blocking_field_id = b;
if (w) cfg.warning_field_id  = w;

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// RESTRICT ASSET (Iconik RESTRICT_ASSET) — UI: Blocking Field + Warning Field
// Même logique que Remove restriction (mêmes champs UI)
// ─────────────────────────────────────────────
if (ac.type === 'Restrict asset') {
  const cfg = ac.config || {};

  // Iconik keys observées côté Remove restriction chez toi:
  // - restrict_metadata_field : "BlockTest"
  // - warning_metadata_field  : "WarningText"
  const blockingRaw = cfg.restrict_metadata_field ?? cfg.blocking_field_id ?? cfg.blockingFieldId ?? '';
  const warningRaw  = cfg.warning_metadata_field  ?? cfg.warning_field_id  ?? cfg.warningFieldId  ?? '';

  const b = String(blockingRaw || '').trim();
  const w = String(warningRaw  || '').trim();

  // Chez toi ces valeurs sont des IDs techniques (ex: BlockTest / WarningText)
  cfg.blockingFieldId = b;
  cfg.warningFieldId  = w;

  // Aliases API-friendly (roundtrip/preview)
  if (b) cfg.blocking_field_id = b;
  if (w) cfg.warning_field_id  = w;

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// TRANSCODE asset (Iconik TRANSCODE) — UI: Cloud / ISG
// Iconik (observé) :
// - ISG => preferred_storage_method: 'FILE'
// - Cloud => prefer_any_cloud: true
// UI WFD : transcodeLocation = 'ISG' | 'Cloud'
// ─────────────────────────────────────────────
if (ac.type === 'Transcode asset') {
  const cfg = ac.config || {};

  // Iconik -> UI
  const anyCloud = (typeof cfg.prefer_any_cloud !== 'undefined') ? !!cfg.prefer_any_cloud : false;
  const m = String(cfg.preferred_storage_method || '').toUpperCase().trim();

  if (anyCloud) {
    cfg.transcodeLocation = 'Cloud';
  } else if (m === 'FILE' || m === 'LOCAL' || m === 'ISG') {
    cfg.transcodeLocation = 'ISG';
  }

  // UI -> Iconik (si l’utilisateur modifie dans WFD)
  if (typeof cfg.transcodeLocation !== 'undefined') {
    const v = String(cfg.transcodeLocation || '').toUpperCase().trim();

    if (v === 'CLOUD') {
      cfg.prefer_any_cloud = true;
      // on évite l’ambiguïté côté API
      if ('preferred_storage_method' in cfg) delete cfg.preferred_storage_method;
    } else if (v === 'ISG') {
      cfg.prefer_any_cloud = false;
      cfg.preferred_storage_method = 'FILE';
    }
  }

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// TRANSCRIBE asset (Iconik TRANSCRIBE) — UI: Language + Translate to (MULTI) + Overwrite
// Iconik (observé) : language='ar' ; translate_languages=['fr',...] ; force=true
// UI WFD : language attend codes régionaux (ar-SA, fr-FR...) ; translateTo = array de labels ; overwrite = checkbox
// ─────────────────────────────────────────────
if (ac.type === 'Transcribe asset') {
  const cfg = ac.config || {};

  // 0) Overwrite (UI) = force (Iconik)  ✅
  // Dans Iconik, "Overwrite" = re-transcribe => correspond à force=true.
  if (typeof cfg.force !== 'undefined') {
    cfg.overwrite = !!cfg.force;
  } else if (typeof cfg.overwrite !== 'undefined') {
    // fallback si jamais overwrite est déjà là
    cfg.overwrite = !!cfg.overwrite;
  } else {
    cfg.overwrite = false;
  }

  // 1) Language : Iconik code court -> UI code régional ✅
  const LANG_TO_UI = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'es': 'es-ES',
    'it': 'it-IT',
    'pt': 'pt-PT',
    'nl': 'nl-NL',
    'ja': 'ja-JP',
    'zh': 'zh-CN',
    'ar': 'ar-SA',
    'da': 'da-DK',
    'fi': 'fi-FI',
    'ko': 'ko-KR',
    'nb': 'nb-NO',
    'pl': 'pl-PL',
    'ru': 'ru-RU',
    'sv': 'sv-SE',
    'tr': 'tr-TR'
  };

  const rawLang = String(cfg.language || '').trim();
  if (!rawLang || rawLang.toLowerCase() === 'null') {
    cfg.language = '(Autodetect)';
  } else if (rawLang.includes('-')) {
    // déjà un code régional => OK
    cfg.language = rawLang;
  } else {
    // code court => map régional
    cfg.language = LANG_TO_UI[rawLang.toLowerCase()] || rawLang;
  }

  // 2) Translate to : MULTI ✅ (Iconik codes -> labels)
  const TRANS_TO_LABEL = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ar': 'Arabic'
  };

  if (Array.isArray(cfg.translate_languages)) {
    cfg.translateTo = cfg.translate_languages
      .map(x => TRANS_TO_LABEL[String(x || '').trim().toLowerCase()] || '')
      .filter(Boolean);
  } else {
    cfg.translateTo = Array.isArray(cfg.translateTo) ? cfg.translateTo : [];
  }

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// CREATE SHARE (Iconik CREATE_SHARE) — UI projection
// Iconik keys: emails[], user_id, title, message, expires_in_days, allow_* flags, show_watermark, has_password
// UI keys: users, customTitle, message, expiresInDays, allowDownload, allowDownloadProxy, allowUpload,
//          enableCustomActions, enableComments, enableApproveComments, enableViewVersions,
//          enableTranscriptions, enableWatermark, setPassword
// ─────────────────────────────────────────────
if (ac.type === 'Create share') {
  const cfg = ac.config || {};

  // Resolve user_id -> email/label (usersData). If not resolvable => return '' (no UUID in UI)
  function resolveUserEmailById(uid) {
    const arr = (usersData && Array.isArray(usersData.users)) ? usersData.users : [];
    const hit = arr.find(u => String(u?.id || '') === String(uid));
    return hit ? String(hit.email || '') : '';
  }

  // UI "Users or e-mails *" : emails + resolved user email (no UUID)
  const parts = [];
  if (Array.isArray(cfg.emails) && cfg.emails.length) parts.push(...cfg.emails.map(String));
  if (cfg.user_id) {
    const em = resolveUserEmailById(cfg.user_id);
    if (em) parts.push(em);
  }
  cfg.users = Array.from(new Set(parts.filter(Boolean))).join(', ') || 'Not selected';

  cfg.customTitle = (typeof cfg.title === 'string') ? cfg.title : (cfg.customTitle || '');
  cfg.message = (typeof cfg.message === 'string') ? cfg.message : (cfg.message || '');
  cfg.expiresInDays = (typeof cfg.expires_in_days !== 'undefined') ? String(cfg.expires_in_days) : (cfg.expiresInDays || '');

  cfg.allowDownload = !!cfg.allow_download;
  cfg.allowDownloadProxy = !!cfg.allow_download_proxy;
  cfg.allowUpload = !!cfg.allow_upload;

  cfg.enableCustomActions = !!cfg.allow_custom_actions;
  cfg.enableComments = !!cfg.allow_comments;
  cfg.enableApproveComments = !!cfg.allow_approving_comments;
  cfg.enableViewVersions = !!cfg.allow_view_versions;
  cfg.enableTranscriptions = !!cfg.allow_view_transcriptions;
  cfg.enableWatermark = !!cfg.show_watermark;

  cfg.setPassword = cfg.has_password ? '••••' : '';

  ac.config = cfg;
}

// ─────────────────────────────────────────────
// REQUEST REVIEW (Iconik REQUEST_REVIEW) — UI projection
// Iconik keys: users[] (reviewers), externals[] (emails), min_number, share{...} (same as create share payload)
// UI keys: users, requireApprovalFromAll, customTitle, message, expiresInDays,
//          allowDownload, allowDownloadProxy, allowUpload,
//          enableCustomActions, enableComments, enableApproveComments, enableViewVersions,
//          enableTranscriptions, enableWatermark, setPassword
// ─────────────────────────────────────────────
if (ac.type === 'Request review') {
  const cfg = ac.config || {};

  function resolveUserEmailById(uid) {
    const arr = (usersData && Array.isArray(usersData.users)) ? usersData.users : [];
    const hit = arr.find(u => String(u?.id || '') === String(uid));
    return hit ? String(hit.email || '') : '';
  }

  const share = (cfg.share && typeof cfg.share === 'object') ? cfg.share : {};

  // UI users field: reviewers + externals + share.emails + share.user_id (emails only, no UUID)
  const parts = [];
  const reviewers = Array.isArray(cfg.users) ? cfg.users : [];
  reviewers.forEach(id => {
    const em = resolveUserEmailById(id);
    if (em) parts.push(em);
  });
  if (Array.isArray(cfg.externals) && cfg.externals.length) parts.push(...cfg.externals.map(String));
  if (Array.isArray(share.emails) && share.emails.length) parts.push(...share.emails.map(String));
  if (share.user_id) {
    const em = resolveUserEmailById(share.user_id);
    if (em) parts.push(em);
  }

  cfg.users = Array.from(new Set(parts.filter(Boolean))).join(', ') || 'Not selected';

  // Require approval from all reviewers: min_number >= reviewers.length
  const n = reviewers.length || 0;
  cfg.requireApprovalFromAll = (typeof cfg.min_number === 'number' && n > 0) ? (cfg.min_number >= n) : false;

  // Share fields -> UI
  cfg.customTitle = (typeof share.title === 'string') ? share.title : (cfg.customTitle || '');
  cfg.message = (typeof share.message === 'string') ? share.message : (cfg.message || '');
  cfg.expiresInDays = (typeof share.expires_in_days !== 'undefined') ? String(share.expires_in_days) : (cfg.expiresInDays || '');

  cfg.allowDownload = !!share.allow_download;
  cfg.allowDownloadProxy = !!share.allow_download_proxy;
  cfg.allowUpload = !!share.allow_upload;

  cfg.enableCustomActions = !!share.allow_custom_actions;
  cfg.enableComments = !!share.allow_comments;
  cfg.enableApproveComments = !!share.allow_approving_comments;

  // ⚠️ Intentionnellement PAS de "View Versions" ici : non exposé côté Request review (évite UX trompeuse)
  // cfg.enableViewVersions = ...

  cfg.enableTranscriptions = !!share.allow_view_transcriptions;
  cfg.enableWatermark = !!share.show_watermark;

  cfg.setPassword = share.has_password ? '••••' : '';

  ac.config = cfg;
}

  // ─────────────────────────────────────────────
  // ARCHIVE asset (Iconik ARCHIVE)
  // ─────────────────────────────────────────────
  if (ac.type === 'Archive asset') {
    const cfg = ac.config || {};

    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(stor.filter(s => s && s.id).map(s => [String(s.id), (s.nom || s.name || s.title || s.id)]));

    const destId = cfg.destination_storage_id;
    const srcId  = cfg.preferred_original_storage_id;

    if (destId) {
      cfg.archiveStorage_id = String(destId);
      cfg.archiveStorage = storById.get(String(destId)) || String(destId);
    }
    if (srcId) {
      cfg.preferredSourceStorage_id = String(srcId);
      cfg.preferredSourceStorage = storById.get(String(srcId)) || String(srcId);
    }

    cfg.deleteAfterArchive = !!cfg.delete_original;
    cfg.allowTransfersThroughIconik = !!cfg.allow_host_transfer;

    const p = cfg.destination_directory_path;
    cfg.useCurrentPath = !(typeof p === 'string' && p.trim().length > 0);
    cfg.destinationPath = (typeof p === 'string') ? p : '';

    ac.config = cfg;
  }

  // ─────────────────────────────────────────────
  // RESTORE asset (Iconik RESTORE)
  // ─────────────────────────────────────────────
  if (ac.type === 'Restore asset') {
    const cfg = ac.config || {};

    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(stor.filter(s => s && s.id).map(s => [String(s.id), (s.nom || s.name || s.title || s.id)]));

    const destId = cfg.destination_storage_id;
    const srcId  = cfg.preferred_original_storage_id;

    if (destId) {
      cfg.destinationStorage_id = String(destId);
      cfg.destinationStorage = storById.get(String(destId)) || String(destId);
    }
    if (srcId) {
      cfg.preferredSourceStorage_id = String(srcId);
      cfg.preferredSourceStorage = storById.get(String(srcId)) || String(srcId);
    }

    cfg.allowTransfersThroughIconik = !!cfg.allow_host_transfer;

    const p = cfg.destination_directory_path;
    cfg.useCurrentPath = !(typeof p === 'string' && p.trim().length > 0);
    cfg.destinationPath = (typeof p === 'string') ? p : '';

    ac.config = cfg;
  }

  // ─────────────────────────────────────────────
  // TRANSFER asset (Iconik TRANSFER)
  // ─────────────────────────────────────────────
    if (ac.type === 'Transfer asset') {
    const cfg = ac.config || {};

    const stor = (storagesData && Array.isArray(storagesData.storages)) ? storagesData.storages : [];
    const storById = new Map(stor.filter(s => s && s.id).map(s => [String(s.id), (s.nom || s.name || s.title || s.id)]));

    const destId = cfg.destination_storage_id;

    if (destId) {
      cfg.destinationStorage_id = String(destId);
      cfg.destinationStorage = storById.get(String(destId)) || String(destId);
    }

    cfg.allowTransfersThroughIconik = !!cfg.allow_host_transfer;

    const p = cfg.destination_directory_path;
    cfg.useCurrentPath = !(typeof p === 'string' && p.trim().length > 0);
    cfg.destinationPath = (typeof p === 'string') ? p : '';

    cfg.formatName = cfg.format_name || cfg.formatName || '';

    ac.config = cfg;
  }

  // ─────────────────────────────────────────────
// ADD_TO_COLLECTION (Iconik ADD_TO_COLLECTION) — ID-first + full path
// Fix: avoid name-based matching (wrong branch), feed tree-picker with {id,name,path}
// ─────────────────────────────────────────────
if (ac.type === 'Add to collection') {
  const cfg = ac.config || {};
  const colId = cfg.collection_id;

  // collections referential
  const cols = (collectionsData && Array.isArray(collectionsData.collections)) ? collectionsData.collections : [];
  const byId = new Map(cols.filter(c => c && c.id).map(c => [String(c.id), c]));

  function buildPath(id) {
    const seen = new Set();
    const parts = [];
    let cur = byId.get(String(id));
    while (cur && cur.id && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name || cur.nom || cur.title || cur.id);
      cur = cur.parent_id ? byId.get(String(cur.parent_id)) : null;
    }
    return parts.join(' / ');
  }

  if (colId) {
    const node = byId.get(String(colId));
    const leafName = node ? (node.name || node.nom || node.title || node.id) : String(colId);
    const fullPath = buildPath(colId) || String(leafName);

    // ✅ Truth: selection by ID, plus path for correct display
    cfg.collections = [{ id: String(colId), name: String(leafName), path: String(fullPath) }];
    cfg.collections_ids = [ String(colId) ];
  } else {
    // keep shape consistent
    if (!Array.isArray(cfg.collections)) cfg.collections = [];
    if (!Array.isArray(cfg.collections_ids)) cfg.collections_ids = [];
  }

  ac.config = cfg;
}


// ─────────────────────────────────────────────
// UPDATE METADATA (Iconik METADATA_UPDATE) — merge metadata_values into WFD targets[0].fields[]
// Goal: show/track the actual fields being updated (checked=true) without expanding the whole view.
// ─────────────────────────────────────────────

if (ac.type === 'Update metadata') {
  const cfg = ac.config || {};

  // Ensure targets shape exists
  cfg.targets = (Array.isArray(cfg.targets) && cfg.targets.length)
    ? cfg.targets
    : [{ category:{id:'',name:''}, metadataView:{id:'',name:''}, onlyMarked:true, fields:[] }];

  const tgt = cfg.targets[0];
  tgt.onlyMarked = true; // info: only checked fields are updated

  // Resolve metadata view id -> name (optional)
  const mvId = cfg.metadata_view_id;
  if (mvId) {
    const views = (metadataViewsData && Array.isArray(metadataViewsData.metadataViews)) ? metadataViewsData.metadataViews : [];
    const byId = new Map(
      views.map(v => {
        const id = typeof v === 'string' ? v : (v.id || '');
        const name = typeof v === 'string' ? v : (v.name || v.nom || v.id || '');
        return [String(id), String(name)];
      }).filter(([id]) => id)
    );
    const mvName = byId.get(String(mvId)) || String(mvId);
    tgt.metadataView = { id: String(mvId), name: mvName };
  }

  // Helpers
  function resolveMetaLabelById(metaId) {
    const arr = (metadonneesData && Array.isArray(metadonneesData.metadonnees)) ? metadonneesData.metadonnees : [];
    const hit = arr.find(m => String(m?.id || '') === String(metaId));
    return hit ? (hit.nom || hit.name || metaId) : metaId;
  }

  function mapModeIconik(m) {
    const s = String(m || '').toLowerCase();
    if (s === 'append') return 'Append';
    if (s === 'remove') return 'Remove';
    return 'Overwrite'; // default
  }

  // Iconik truth
  const mv = (cfg.metadata_values && typeof cfg.metadata_values === 'object') ? cfg.metadata_values : {};
  const keys = Object.keys(mv).filter(k => k && k !== '__asset_category');

  // Keep __asset_category as optional info (not a field to set)
  if (mv.__asset_category && Array.isArray(mv.__asset_category.field_values) && mv.__asset_category.field_values.length) {
    const catVal = mv.__asset_category.field_values[0]?.value;
    if (catVal) {
      tgt.category = tgt.category || {id:'',name:''};
      tgt.category.id = String(catVal);
      if (!tgt.category.name) tgt.category.name = String(catVal);
    }
  }

  // Ensure tgt.fields exists in the UI-friendly shape
  tgt.fields = Array.isArray(tgt.fields) ? tgt.fields : [];

  // Build fast lookup for existing fields (by id and by name)
  const byId = new Map();
  const byName = new Map();
  tgt.fields.forEach((it, idx) => {
    const fid = it?.field?.id ? String(it.field.id) : '';
    const fname = it?.field?.name ? String(it.field.name).toLowerCase().trim() : '';
    if (fid) byId.set(fid, idx);
    if (fname) byName.set(fname, idx);
  });

  // Apply Iconik metadata_values onto tgt.fields (checked/value/mode)
  keys.forEach(fieldId => {
    const obj = mv[fieldId] || {};
    const mode = mapModeIconik(obj.mode);

    // Extract first value
    let v = '';
    if (Array.isArray(obj.field_values) && obj.field_values.length) {
      const first = obj.field_values[0];
      if (first && typeof first === 'object' && 'value' in first) v = String(first.value);
      else v = String(first);
    }

    const label = resolveMetaLabelById(fieldId);
    const labelKey = String(label).toLowerCase().trim();

    // Find existing row: prefer id match, fallback to label match
    let pos = byId.get(String(fieldId));
    if (typeof pos === 'undefined') pos = byName.get(labelKey);

    if (typeof pos === 'number') {
      const it = tgt.fields[pos] || {};
      it.field = it.field || { id:'', name:'' };

      // Fill ids/names if missing
      if (!it.field.id) it.field.id = String(fieldId);
      if (!it.field.name) it.field.name = String(label);

      it.checked = true;
      it.value = v;

      // Store mode only when meaningful (Append/Remove); keep null for Overwrite to reduce noise
      it.mode = (mode === 'Overwrite') ? null : mode;

      tgt.fields[pos] = it;
    } else {
      // Not found in prefilled view -> append minimal checked entry
      tgt.fields.push({
        field: { id: String(fieldId), name: String(label) },
        checked: true,
        value: v,
        mode: (mode === 'Overwrite') ? null : mode
      });
    }
  });

  ac.config = cfg;
}
  // ─────────────────────────────────────────────
// RUN FACE RECOGNITION (Iconik EXTRACT_FACES) — UI: Force re-run checkbox
// Iconik uses parameters.force ; UI uses config.forceRerun
// ─────────────────────────────────────────────
if (ac.type === 'Run Face Recognition') {
  const cfg = ac.config || {};

  // Iconik -> UI
  if (typeof cfg.force !== 'undefined') {
    cfg.forceRerun = !!cfg.force;
  }

  // UI -> Iconik (si l’utilisateur coche/décoche côté WFD)
  if (typeof cfg.force === 'undefined' && typeof cfg.forceRerun !== 'undefined') {
    cfg.force = !!cfg.forceRerun;
  }

  ac.config = cfg;
}
  
  // ─────────────────────────────────────────────
  // UPDATE_ACL (Iconik UPDATE_ACL)
  // ─────────────────────────────────────────────
  if (ac.type === 'Set ACL on asset') {
    const cfg = ac.config || {};
    const objs = Array.isArray(cfg.objects) ? cfg.objects : [];

    if (objs.length) {
      const mode = objs[0]?.mode;
      if (mode) cfg.applyMode = mapMode(mode);

      const teamIds = new Set();
      objs.forEach(o => (o?.group_ids || []).forEach(gid => { if (gid) teamIds.add(String(gid)); }));
      cfg.teams = Array.from(teamIds);

      const perms = new Set();
      objs.forEach(o => (o?.permissions || []).forEach(p => { if (p) perms.add(mapPerm(p)); }));
      cfg.permissions = Array.from(perms);

      if (!cfg._iconik_objects) cfg._iconik_objects = deepClone(objs);
    }

    ac.config = cfg;
  }

  return ac;
});

    return a;
  }

  (automationsData.automations || []).forEach(normAutomation);
}

function sauvegarderDonnees(){
  localStorage.setItem('automationsData',   JSON.stringify(automationsData));
  localStorage.setItem('webhooksData',      JSON.stringify(webhooksData));
  localStorage.setItem('customActionsData', JSON.stringify(customActionsData));
  // On ne touche pas aux référentiels (gérés par Settings)
}

/* ================================ STATS ================================== */
function mettreAJourStats(){
  if (_suspendStats) return;
  const autos = automationsData.automations || [];
  const whs   = webhooksData.webhooks      || [];
  const cas   = customActionsData.customActions || [];

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = String(val); };
  const activeCount = autos.filter(a => toBool(a.active)).length;
  el('statTotalAutomations', autos.length + (activeCount>0 && activeCount<autos.length ? ` (${activeCount})` : ''));
  el('statWebhooks',         whs.length);
  el('statCustomActions',    cas.length);
}

/* ============================= RENDER HELPERS ============================ */
/** Construit une cassette (DOM) homogène */
function createCassette({ kind, name, title, isActive, isLocalDraft, count, onClick }){
  const div = document.createElement('div');
  div.className = 'set-cassette' + (kind ? ' ' + kind : '');
  div.onclick = onClick;

  const left = document.createElement('span');
  left.className = 'set-cassette-name';

  // Dot d'état
  // - Automations : vert=actif Iconik, rouge=inactif Iconik, orange=LOCAL (pas d'id)
  // - Webhooks/Custom Actions : pas d'état actif Iconik → orange si local (pas d'id), sinon pas de dot
  if (kind === 'automation') {
    const dot = document.createElement('span');
    dot.className = 'cassette-dot ' + (isLocalDraft ? 'local' : (isActive ? 'on' : 'off'));
    left.appendChild(dot);
  } else if (isLocalDraft) {
    const dot = document.createElement('span');
    dot.className = 'cassette-dot local';
    left.appendChild(dot);
  }

  left.appendChild(document.createTextNode(' ' + (title || name || 'Sans nom')));

  const right = document.createElement('span');
  right.className = 'set-cassette-cnt';
  right.textContent = String(count ?? '');

  div.appendChild(left);
  if (typeof count !== 'undefined') div.appendChild(right);
  return div;
}

/* ============================ SIDEBAR RENDERERS ========================== */
function afficherAutomations(){
  const container = document.getElementById('automations-list');
  if (!container) return;
  const list = automationsData.automations || [];
  container.innerHTML = '';
  if (!list.length){
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucune automation</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => cmp(a?.nom, b?.nom));
  sorted.forEach(a => {
    const count = (a?.triggers?.length || 0) + (a?.actions?.length || 0);
    const isLocal = !a?.id; // heuristique: pas d'id => LOCAL/DRAFT
    const node = createCassette({
      kind: 'automation',
      name: a?.nom,
      title: a?.nom,
      isActive: toBool(a?.active),
      isLocalDraft: !!isLocal,
      count,
      onClick: () => openEditor('automation', a?.nom)
    });
    container.appendChild(node);
  });
}

function afficherWebhooks(){
  const container = document.getElementById('webhooks-list');
  if (!container) return;
  const list = webhooksData.webhooks || [];
  container.innerHTML = '';
  if (!list.length){
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucun webhook</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => cmp(a?.name, b?.name));
  sorted.forEach(w => {
    const isLocal = !w?.id;
    const node = createCassette({
      kind: 'webhook',
      name: w?.name,
      title: '🔔 ' + (w?.name || 'Sans nom'),
      isLocalDraft: !!isLocal,
      onClick: () => openEditor('webhook', w?.name)
    });
    container.appendChild(node);
  });
}

function afficherCustomActions(){
  const container = document.getElementById('custom-actions-list');
  if (!container) return;
  const list = customActionsData.customActions || [];
  container.innerHTML = '';
  if (!list.length){
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucune custom action</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => cmp(a?.title, b?.title));
  sorted.forEach(ca => {
    const isLocal = !ca?.id;
    const node = createCassette({
      kind: 'custom',
      name: ca?.title,
      title: '⚡ ' + (ca?.title || 'Sans titre'),
      isLocalDraft: !!isLocal,
      onClick: () => openEditor('custom', ca?.title)
    });
    container.appendChild(node);
  });
}

/** Rendu des 3 sections de la sidebar */
function afficherTousLesElements(){
  afficherAutomations();
  afficherWebhooks();
  afficherCustomActions();
}

/* ============================== CANVAS ROUTER ============================ */
/** Ouvre l’éditeur dans le canvas (le contenu sera défini en PART 2/3 & 3/3) */
function openEditor(kind, key){
  currentKind  = kind;
  currentKey   = key;
  currentIsNew = false;

  const empty  = document.getElementById('canvas-empty');
  const editor = document.getElementById('canvas-editor');
  if (empty)  empty.style.display  = 'none';
  if (editor) { editor.style.display = 'block'; editor.innerHTML = ''; }

  // Rendu différé (PART 2/3 & 3/3)
  if (kind === 'automation') {
    renderCanvasAutomation(key);   // défini en PART 2/3
  } else if (kind === 'webhook') {
    renderCanvasWebhook(key);      // défini en PART 3/3
  } else if (kind === 'custom') {
    renderCanvasCustomAction(key); // défini en PART 3/3
  }

  // Preview panel (droite)
  renderApiPreview(); // défini en PART 2/3
}

/** Ferme l’éditeur (revient à l’état vide) */
function closeEditor(){
  currentKind = null; currentKey = null; currentIsNew = false;
  

 // ✅ IMPORTANT: vider l'état d'édition en mémoire (sinon Annuler conserve les ajouts)
  automationEnEdition = null;
  indexAutomationEnEdition = -1;
  webhookEnEdition = null;
  indexWebhookEnEdition = -1;
  customActionEnEdition = null;
  indexCustomActionEnEdition = -1;

  const empty  = document.getElementById('canvas-empty');
  const editor = document.getElementById('canvas-editor');
  if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
  if (empty)  empty.style.display  = 'block';

  // Masquer preview
  const box = document.getElementById('api-calls-container');
  const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  if (emptyPrev) emptyPrev.style.removeProperty('display');
}

/* ============================== CREATE FLOWS ============================= */
/** Création rapide: prépare un brouillon puis ouvre le canvas */
function creerAutomation(){
  const draftName = 'Nouvelle automation';
  const a = { nom: draftName, active: true, triggers: [], conditions: [], actions: [] };
  automationsData.automations = automationsData.automations || [];
  automationsData.automations.push(a);
  sauvegarderDonnees();
  afficherAutomations();
  openEditor('automation', draftName);
}
function creerWebhook(){
  const w = { name:'', description:'', url:'', headers:[], eventType:'Assets', objectId:'', realm:'All', operation:'All', query:'' };
  webhooksData.webhooks = webhooksData.webhooks || [];
  webhooksData.webhooks.push(w);
  sauvegarderDonnees();
  afficherWebhooks();
  openEditor('webhook', '');
}
function creerCustomAction(){
  const ca = { title:'', context:'asset', type:'Post', url:'', headers:[], metadataView:'', appName:'', appId:'' };
  customActionsData.customActions = customActionsData.customActions || [];
  customActionsData.customActions.push(ca);
  sauvegarderDonnees();
  afficherCustomActions();
  openEditor('custom', '');
}

/* ============================== PAGE BOOTSTRAP =========================== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    chargerDonnees();
    // Badge org (SoT = Settings)
    const badge = document.getElementById('orgBadge');
    if (badge) badge.textContent = localStorage.getItem('organisationName') || '';
    afficherTousLesElements();
    mettreAJourStats();
  } catch (e) {
    console.warn('[Automations] init error:', e);
  }
});

/* ============================== EXPORT GLOBALS =========================== */
window.creerAutomation        = creerAutomation;
window.creerWebhook           = creerWebhook;
window.creerCustomAction      = creerCustomAction;
window.afficherAutomations    = afficherAutomations;
window.afficherWebhooks       = afficherWebhooks;
window.afficherCustomActions  = afficherCustomActions;
window.openEditor             = openEditor;
window.closeEditor            = closeEditor;
// Les fonctions canvas & preview arrivent en PART 2/3 et 3/3 :
/* window.renderCanvasAutomation */
/* window.renderCanvasWebhook    */
/* window.renderCanvasCustomAction */
/* window.renderApiPreview      */

/* ========================================================================
   WFD — Automations (Canvas-only, Settings-like)
   PART 2/3 : Canvas editor for Automations + dynamic fields + API preview
   ======================================================================== */

/* ===================== CATALOGUES (Iconik + WFD extensions) ============== */
/* Triggers (multi-triggers OK) */
const TRIGGERS_ICONIK = {
  'asset.not_modified': {
    label: 'Asset has not been modified',
    fields: [{ id:'daysSinceModified', label:'Days since modified', type:'text', placeholder:'e.g. 30' }]
  },
  'asset.has_new_version': {
    label: 'Asset has new version',
    fields: [
    { id: 'triggerAfterTranscode',
      label: 'For media assets, trigger when the asset has finished transcoding',
      type: 'checkbox' }
    ]
  },
  'asset.added_to_collection': {
    label: 'Asset is added to collection',
    fields: [
      { id:'collections', label:'Collections', type:'select-collections-multi' },
      { id:'monitorSubCollections', label:'Monitor sub-collections', type:'checkbox' }
    ]
  },
  'asset.archived': { label:'Asset is archived', fields:[] },
  'asset.new': { label:'Asset is new', fields:[{ id:'triggerAfterTranscode', label:'Trigger after transcode', type:'checkbox' }] },
  'asset.restored': { label:'Asset is restored', fields:[] },
  'asset.shared': { label:'Asset is shared', fields:[] },
  'asset.transferred': {
    label:'Asset is transferred',
    fields:[{ id:'storages', label:'ISG Storages', type:'select-storages-multi' }]
  },
  'approval.status_changed': {
    label:'Approval status is changed',
    fields:[{ id:'statuses', label:'Statuses', type:'chips-enum', options:['Approved','Rejected','Waiting for Approval','Approved and Rejected'] }]
  },
  'asset.created_days_ago': {
    label:'Asset was created X days ago',
    fields:[{ id:'daysAgo', label:'Days since created', type:'text', placeholder:'e.g. 7' }]
  },
  'metadata.changed': {
    label:'Metadata is changed',
    fields:[
      { id:'metadataField', label:'Metadata field', type:'select-metadata' },
      { id:'valueChangedTo', label:'Value changed to', type:'meta-value-input' }
    ]
  }, 
  'subtitle.added': {
  label:'Subtitle is added',
  fields:[
    { id:'language', label:'Language', type:'text', placeholder:'Not defined (ex: French, English, Arabic…)' },
    { id:'closedCaption', label:'Closed Caption', type:'select', options:['Not defined','Yes','No'] }
  ]
},

};

/* Actions (WFD supports multi-actions; Iconik may limit today but we keep it) */
const ACTIONS_ICONIK = {
  'Add to collection': { label:'Add to collection', fields:[{ id:'collections', label:'Collections', type:'select-collections-multi' }] },
  'Send notification': { label:'Send notification', fields:[{ id:'message', label:'Message', type:'textarea', placeholder:'...' }] },
  'Custom action': {
  label:'Custom action',
  fields:[
    { id:'customActionRef', label:'Custom Action *', type:'select-custom-actions' },
    { id:'metadataValuesFlat', label:'Fields / Values', type:'chips-kv-readonly' }
  ]
},

  'Set ACL on asset': {
    label:'Set ACL on asset',
    fields:[
      { id:'applyMode', label:'Apply mode', type:'select', options:['Append','Overwrite'] },
      { id:'users', label:'Users', type:'select-users-multi' },
      { id:'teams', label:'Teams', type:'select-teams-multi' },
      { id:'permissions', label:'Permissions', type:'checkboxes', options:['Read','Write','Delete','Edit Access'] }
    ]
  },
  'Remove restriction': {
  label:'Remove restriction',
  fields:[
    { id:'blockingFieldId', label:'Blocking Field *', type:'select-block-fields' },
    { id:'warningFieldId',  label:'Warning Field',   type:'select-warning-fields' }
  ]
},
  'Restrict asset': {
  label:'Restrict asset',
  fields:[
    { id:'blockingFieldId', label:'Blocking Field *', type:'select-block-fields' },
    { id:'warningFieldId',  label:'Warning Field',   type:'select-warning-fields' }
  ]
},
  'Update metadata': {
    label:'Update metadata',
    fields:[
      { id:'metadataView', label:'Metadata View', type:'select-mdviews' },
      { id:'metadataFields', label:'Metadata fields', type:'metadata-fields', conditional:'metadataView' }
    ]
  }
};

/* ============================== CANVAS STATE ============================= */
let automationEnEdition = null;
let indexAutomationEnEdition = -1;

/* ============================= DOM UTILITIES ============================= */
function _qs(sel, root=document){ return root.querySelector(sel); }
function _el(tag, cls){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
function _btn(label, cls, onClick){
  const b = _el('button', cls);
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function _label(text){
  const l = _el('label', 'field-label');
  l.textContent = text;
  return l;
}
function _formGroup(){
  return _el('div', 'form-group');
}
function _select(options, value){
  const s = _el('select', 'field-select');
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    s.appendChild(o);
  });
  if (typeof value !== 'undefined') s.value = value;
  return s;
}
function _inputText(value, placeholder){
  const i = _el('input', 'field-input');
  i.type = 'text';
  if (typeof value !== 'undefined') i.value = value ?? '';
  if (placeholder) i.placeholder = placeholder;
  return i;
}
function _textarea(value, placeholder){
  const t = _el('textarea', 'field-input');
  if (typeof value !== 'undefined') t.value = value ?? '';
  if (placeholder) t.placeholder = placeholder;
  return t;
}
function _checkbox(checked){
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!checked;
  return cb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Iconik API → WFD UI mapping (triggers/actions)
// But: Iconik returns types like METADATA_UPDATE / ADD_TO_COLLECTION,
// while the UI catalog uses keys like metadata.changed / Add to collection.
// ─────────────────────────────────────────────────────────────────────────────

const ICONIK_TRIGGER_TO_WFD = {
  'METADATA_UPDATE': 'metadata.changed',
  'ARCHIVE': 'asset.archived',
  'RESTORE': 'asset.restored',
  'OBJECT_ADDED_TO_COLLECTION': 'asset.added_to_collection',
  'VERSION_ONLINE': 'asset.has_new_version',
  'ASSET_SHARE': 'asset.shared',
  'ASSET_ONLINE': 'asset.new',
  'MODIFIED_AT_TRANSITION': 'asset.has_not_been_modified',
  'CREATED_AT_TRANSITION': 'asset.was_created_x_days_ago',
  'REVIEW_STATUS_CHANGED': 'approval.status_changed',
  'SUBTITLE_ADDED': 'subtitle.added',
};


const ICONIK_ACTION_TO_WFD = {
  'ADD_TO_COLLECTION':         'Add to collection',
  'ANALYZE':                   'Analyze asset',
  'ARCHIVE':                   'Archive asset',
  'RESTORE':                   'Restore asset',
  'TRANSFER':                  'Transfer asset',
  'EXPORT':                    'Export asset',
  'TRANSCODE':                 'Transcode asset',
  'TRANSCRIBE':                'Transcribe asset',
  'METADATA_UPDATE':           'Update metadata',
  'UPDATE_ACL':                'Set ACL on asset',
  'CREATE_SHARE':              'Create share',
  'REQUEST_ORIGINAL':          'Request original',
  'REQUEST_REVIEW':            'Request review',
  'RESTRICT_ASSET':            'Restrict asset',
  'REMOVE_ASSET_RESTRICTION':  'Remove restriction',
  'DELETE':                    'Delete asset',
  'DELETE_FILE_SET':           'Delete file set',
  'TRIGGER_CUSTOM_ACTION':     'Custom action',
  'EXTRACT_FACES':             'Run Face Recognition',
  'DELETE_ASSET':              'Delete asset',
};

// ─────────────────────────────────────────────
// Hide RAW Iconik keys in dropdowns (keep canonical WFD keys visible)
// ─────────────────────────────────────────────
function hideCatalogKeys(catalog, keys) {
  if (!catalog) return;
  keys.forEach(k => {
    if (catalog[k]) catalog[k].hidden = true;
  });
}

// Triggers RAW (Iconik official types)
hideCatalogKeys(typeof TRIGGERS_ICONIK !== 'undefined' ? TRIGGERS_ICONIK : null, [
  'ASSET_ONLINE',
  'ASSET_SHARE',
  'VERSION_ONLINE',
  'METADATA_UPDATE',
  'OBJECT_ADDED_TO_COLLECTION',
  'TRANSFER_TO_STORAGE',
  'ARCHIVE',
  'RESTORE',
  'MODIFIED_AT_TRANSITION',
  'CREATED_AT_TRANSITION',
  'REVIEW_STATUS_CHANGED',
  'SUBTITLE_ADDED'
]);

// Actions RAW (Iconik official types)
hideCatalogKeys(typeof ACTIONS_ICONIK !== 'undefined' ? ACTIONS_ICONIK : null, [
  'CREATE_SHARE',
  'EXTRACT_FACES',
  'ADD_TO_COLLECTION',
  'UPDATE_ACL',
  'METADATA_UPDATE',
  'ARCHIVE',
  'RESTORE',
  'ANALYZE',
  'TRANSFER',
  'TRANSCODE',
  'TRANSCRIBE',
  'EXPORT',
  'REQUEST_ORIGINAL',
  'REQUEST_REVIEW',
  'DELETE',
  'DELETE_ASSET',
  'DELETE_FILE_SET',
  'RESTRICT_ASSET',
  'REMOVE_ASSET_RESTRICTION',
  'CUSTOM_ACTION',
  'TRIGGER_CUSTOM_ACTION'
]);

// Inject unknown types so the dropdown can still show something (future-proof)
function ensureTriggerCatalogKey(key){
  if (!key) return;
  if (!TRIGGERS_ICONIK[key]) {
    TRIGGERS_ICONIK[key] = { label: key, fields: [] }; // visible fallback
  }
}
function ensureActionCatalogKey(key){
  if (!key) return;
  if (!ACTIONS_ICONIK[key]) {
    ACTIONS_ICONIK[key] = { label: key, fields: [], hidden: false }; // visible fallback
  }
}

// Normalize one automation object to WFD UI model (in-place safe)
function normalizeAutomationTypesForUI(a){
  if (!a || typeof a !== 'object') return a;

  // Triggers
  if (Array.isArray(a.triggers)) {
    a.triggers = a.triggers.map(t => {
      if (!t || typeof t !== 'object') return t;
      const raw = String(t.type || '').trim();
      if (!raw) return t;
      // Preserve raw type for export/debug
      t.type_raw = t.type_raw || raw;
      t.type_source = t.type_source || 'iconik';
      const mapped = ICONIK_TRIGGER_TO_WFD[raw] || raw; // if already WFD key, keep it
      t.type = mapped;
      ensureTriggerCatalogKey(mapped);
      // Ensure config object exists for UI
      if (!t.config || typeof t.config !== 'object') t.config = (t.config && typeof t.config === 'object') ? t.config : (t.parameters || {});
      return t;
    });
  }

  // Actions
  if (Array.isArray(a.actions)) {
    a.actions = a.actions.map(ac => {
      if (!ac || typeof ac !== 'object') return ac;
      const raw = String(ac.type || '').trim();
      if (!raw) return ac;
      ac.type_raw = ac.type_raw || raw;
      ac.type_source = ac.type_source || 'iconik';
      const mapped = ICONIK_ACTION_TO_WFD[raw] || raw;
      ac.type = mapped;
      ensureActionCatalogKey(mapped);
      if (!ac.config || typeof ac.config !== 'object') ac.config = (ac.config && typeof ac.config === 'object') ? ac.config : (ac.parameters || {});
      return ac;
    });
  }

  // Conditions are WFD-only: keep as-is (do not derive from Iconik)
  if (!Array.isArray(a.conditions)) a.conditions = [];

  return a;
}

/* ============================ CANVAS RENDER ============================== */
function renderCanvasAutomation(nom){
  const editor = document.getElementById('canvas-editor');
  if (!editor) return;

  // ─────────────────────────────────────────────
  // Preserve scroll + <details> open state BEFORE rebuild
  // ─────────────────────────────────────────────
  const prevScrollTop = editor.scrollTop;
  const prevDetailsOpen = Array.from(editor.querySelectorAll('details')).map(d => d.open);

  const autos = automationsData.automations || [];
  const idx = autos.findIndex(a => String(a?.nom ?? '') === String(nom ?? ''));

  // ✅ PRESERVE: si on est déjà en édition sur CETTE automation, ne pas recharger depuis le store
  const alreadyEditingSame =
    (currentKind === 'automation') &&
    (automationEnEdition !== null) &&
    (automationEnEdition !== undefined) &&
    (String(automationEnEdition.nom ?? '') === String(nom ?? ''));

  if (!alreadyEditingSame) {
    indexAutomationEnEdition = idx;
    automationEnEdition = idx >= 0
      ? JSON.parse(JSON.stringify(autos[idx]))
      : { nom: nom || 'Nouvelle automation', active:true, triggers:[], conditions:[], actions:[] };
    normalizeAutomationTypesForUI(automationEnEdition);
  } else {
    // Sécurité: garantir tableaux
    automationEnEdition.triggers = automationEnEdition.triggers || [];
    automationEnEdition.conditions = automationEnEdition.conditions || [];
    automationEnEdition.actions = automationEnEdition.actions || [];
  }

  // ✅ Exposer l'état courant sur window pour le preview DOM-only et debug
  window.automationEnEdition = automationEnEdition;

  // Canvas root
  editor.innerHTML = '';

  // Header
  const hdr = _el('div','editor-header');
  const h2 = document.createElement('h2');
  h2.textContent = automationEnEdition.nom || 'Sans nom';
  hdr.appendChild(h2);

  const actions = _el('div','editor-actions');

  actions.appendChild(_btn('💾 Sauvegarder', 'btn-save', () => {
    // Validation "New path *" (Iconik-like) sur Archive/Restore/Transfer
    const pathAwareTypes = new Set(['Archive asset', 'Restore asset', 'Transfer asset']);
    const acts = (automationEnEdition.actions || []);

    for (const ac of acts) {
      if (!ac || !pathAwareTypes.has(ac.type)) continue;

      const cfg = ac.config || (ac.config = {});

      // Si destinationPath absent mais destination_directory_path présent (cas sync)
      if ((typeof cfg.destinationPath === 'undefined' || cfg.destinationPath === null) &&
          typeof cfg.destination_directory_path === 'string') {
        cfg.destinationPath = cfg.destination_directory_path;
      }

      // Use current path = true -> on nettoie le champ
      if (cfg.useCurrentPath === true) {
        cfg.destinationPath = '';
        if ('destination_directory_path' in cfg) delete cfg.destination_directory_path;
        continue;
      }

      // Use current path = false -> "New path *" obligatoire
      if (cfg.useCurrentPath === false) {
        const p = String(cfg.destinationPath || '').trim();
        if (!p) {
          alert(`Le champ "New path *" est obligatoire pour l'action "${ac.type}" lorsque "Use current path" est désactivé.`);
          return;
        }
        cfg.destinationPath = p;
        cfg.destination_directory_path = p;
      }
    }

    // Si OK => exécuter la sauvegarde existante
    saveCurrent();
  }));

  actions.appendChild(_btn('✕ Annuler', 'btn-close', closeEditor));
  actions.appendChild(_btn('🗑 Supprimer', 'btn-close', deleteCurrent));
  hdr.appendChild(actions);
  editor.appendChild(hdr);

  // Sections
  editor.appendChild(_sectionInfoAutomation());
  editor.appendChild(_sectionTriggersAutomation());
  editor.appendChild(_sectionIconikFiltersAutomation());   // ✅ NEW: Filters (Iconik sync)
  editor.appendChild(_sectionConditionsAutomation());      // WFD-only
  editor.appendChild(_sectionActionsAutomation());

  // Preview right panel
  renderApiPreview();

  // ─────────────────────────────────────────────
  // Restore scroll + <details> open state AFTER rebuild
  // ─────────────────────────────────────────────
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const ed2 = document.getElementById('canvas-editor');
      if (!ed2) return;

      ed2.scrollTop = prevScrollTop;

      const details2 = Array.from(ed2.querySelectorAll('details'));
      details2.forEach((d, i) => {
        if (typeof prevDetailsOpen[i] !== 'undefined') d.open = prevDetailsOpen[i];
      });
    });
  });
}

function _makeSection(titleLeftNode, rightNode){
  const sec = _el('section','editor-section');
  const sh = _el('div','section-header');
  sh.appendChild(titleLeftNode);
  if (rightNode) sh.appendChild(rightNode);
  const sb = _el('div','section-body');
  sec.appendChild(sh);
  sec.appendChild(sb);
  return { sec, body: sb };
}

function _sectionInfoAutomation(){
  const titleWrap = document.createElement('span');

  // Dot état: local/origine vs actif iconik
  const isLocal = !automationEnEdition?.id; // heuristique: pas d'id => local/draft
  const dot = _el('span','cassette-dot ' + (isLocal ? 'local' : (toBool(automationEnEdition.active) ? 'on' : 'off')));
  titleWrap.appendChild(dot);
  titleWrap.appendChild(document.createTextNode(' Informations'));

  const { sec, body } = _makeSection(titleWrap);

  // Nom
  const g1 = _formGroup();
  g1.appendChild(_label('Nom'));
  const inp = _inputText(automationEnEdition.nom || '', "Nom de l'automation");
  inp.addEventListener('input', () => {
    automationEnEdition.nom = inp.value;
    // titre header
    const h2 = _qs('#canvas-editor .editor-header h2');
    if (h2) h2.textContent = automationEnEdition.nom || 'Sans nom';
    renderApiPreview();
  });
  g1.appendChild(inp);
  body.appendChild(g1);

  // Active (WFD) — reflète Iconik quand syncée, sinon local
  const line = _el('label','field-checkbox');
  const cb = _checkbox(toBool(automationEnEdition.active));
  cb.addEventListener('change', () => {
    automationEnEdition.active = cb.checked;
    renderApiPreview();
    // refresh dot in info section
    const d = _qs('.editor-section .cassette-dot', sec);
    if (d) d.className = 'cassette-dot ' + (isLocal ? 'local' : (cb.checked ? 'on' : 'off'));
    // refresh list cassettes
    afficherAutomations();
    mettreAJourStats();
  });
  line.appendChild(cb);
  const sp = document.createElement('span');
  sp.textContent = 'Active';
  line.appendChild(sp);
  body.appendChild(line);

  if (isLocal) {
    const hint = _el('div','section-hint');
    hint.textContent = "DRAFT local : non synchronisé Iconik";
    body.appendChild(hint);
  }

  return sec;
}

function _sectionTriggersAutomation(){
  const title = document.createElement('span');
  title.textContent = '🎯 Triggers';
  const addBtn = _btn('+ Ajouter', 'btn-add-small', addTriggerCanvas);

  const { sec, body } = _makeSection(title, addBtn);

  const list = automationEnEdition.triggers || [];
  if (!list.length) {
    const hint = _el('div','section-hint');
    hint.textContent = "Aucun trigger. Cliquez sur “Ajouter”.";
    body.appendChild(hint);
    return sec;
  }

  list.forEach((t, i) => {
    body.appendChild(_renderTriggerBlock(t, i));
  });

  return sec;
}

function _renderTriggerBlock(t, i){
  const block = _el('div','action-block');

  const num = _el('div','action-number');
  num.textContent = String(i+1);
  block.appendChild(num);

  // Select type
  const g = _formGroup();
  g.appendChild(_label('Type de trigger'));

  const keys = Object.keys(TRIGGERS_ICONIK).sort((a,b)=>cmp(TRIGGERS_ICONIK[a].label, TRIGGERS_ICONIK[b].label));
  const opts = [{ value:'', label:'-- Sélectionnez --' }].concat(keys.map(k => ({ value:k, label:TRIGGERS_ICONIK[k].label })));
  const sel = _select(opts, t.type || '');
  sel.addEventListener('change', () => {
    t.type = sel.value;
    t.config = {};
    // re-render section triggers only
    renderCanvasAutomation(automationEnEdition.nom);
  });
  g.appendChild(sel);
  block.appendChild(g);

  // Fields area
  const fields = _el('div', null);
  fields.id = `trigger-fields-${i}`;
  if (t.type && TRIGGERS_ICONIK[t.type]) {
    fields.appendChild(_renderFieldsForTrigger(t.type, t.config || {}, i));
  }
  block.appendChild(fields);

  // Remove button
  const del = _btn('✕ Supprimer', 'aut-btn del', () => {
    removeTriggerCanvas(i);
  });
  block.appendChild(del);

  return block;
}

function _renderFieldsForTrigger(type, cfg, idx){
  const wrap = document.createElement('div');
  const def = TRIGGERS_ICONIK[type];
  (def?.fields || []).forEach(f => {
    wrap.appendChild(_renderFieldControl('trigger', idx, cfg, f));
  });
  return wrap;
}

function addTriggerCanvas(){
  automationEnEdition.triggers = automationEnEdition.triggers || [];
  automationEnEdition.triggers.push({ type:'', config:{} });
  renderCanvasAutomation(automationEnEdition.nom);
}

function removeTriggerCanvas(i){
  automationEnEdition.triggers.splice(i,1);
  renderCanvasAutomation(automationEnEdition.nom);
}

function _sectionIconikFiltersAutomation(){
  // Carte Iconik sync (dissociée de conditions WFD-only)
  const title = document.createElement('span');
  title.textContent = '🧰 Filters (Iconik)';

  // pas de "+ Ajouter" : 1 seul bloc par automation
  const { sec, body } = _makeSection(title);

  // garantir la présence du container
  automationEnEdition.iconikFilters = automationEnEdition.iconikFilters || { mediaTypes: [], assetTypes: [] };
  if (!Array.isArray(automationEnEdition.iconikFilters.mediaTypes)) automationEnEdition.iconikFilters.mediaTypes = [];
  if (!Array.isArray(automationEnEdition.iconikFilters.assetTypes)) automationEnEdition.iconikFilters.assetTypes = [];

  const hint = _el('div','section-hint');
  hint.textContent = "Filtres Iconik synchronisés (media type / asset type). Indépendant des conditions WFD.";
  body.appendChild(hint);

  const cfg = automationEnEdition.iconikFilters;

  const fields = [
    { id:'mediaTypes', label:'Media type', type:'chips-enum', options:['Image','Video','Audio'] },
    { id:'assetTypes', label:'Asset type', type:'chips-enum', options:['Asset','Subclip','Sequence','Placeholder','Link','NLE Project'] }
  ];

  fields.forEach((f, i) => {
    body.appendChild(_renderFieldControl('filters', i, cfg, f));
  });

  return sec;
}

function _sectionConditionsAutomation(){
  const title = document.createElement('span');
  title.textContent = '🔀 Conditions (future)';
  const addBtn = _btn('+ Ajouter', 'btn-add-small', addConditionCanvas);

  const { sec, body } = _makeSection(title, addBtn);

  const hint = _el('div','section-hint');
  hint.textContent = "Option WFD : conservée pour compatibilité future (Iconik).";
  body.appendChild(hint);

  const list = automationEnEdition.conditions || [];
  if (!list.length) return sec;

  list.forEach((c, i) => body.appendChild(_renderConditionRow(c, i)));
  return sec;
}

function _renderConditionRow(c, i){
  const row = _el('div','action-block');
  row.classList.add('cond-block');
  const num = _el('div','action-number');
  num.classList.add('cond-num');
  num.textContent = String(i+1);
  row.appendChild(num);

  // Field
  const g1 = _formGroup();
  g1.appendChild(_label('Field'));
  const f = _inputText(c.field || '', 'e.g. status');
  f.addEventListener('input', () => { c.field = f.value; renderApiPreview(); });
  g1.appendChild(f);
  row.appendChild(g1);

  // Operator
  const g2 = _formGroup();
  g2.appendChild(_label('Operator'));
  const op = _select([
    {value:'=',label:'='},
    {value:'!=',label:'!='},
    {value:'>',label:'>'},
    {value:'<',label:'<'}
  ], c.operator || '=');
  op.addEventListener('change', () => { c.operator = op.value; renderApiPreview(); });
  g2.appendChild(op);
  row.appendChild(g2);

  // Value
  const g3 = _formGroup();
  g3.appendChild(_label('Value'));
  const v = _inputText(c.value || '', 'value');
  v.addEventListener('input', () => { c.value = v.value; renderApiPreview(); });
  g3.appendChild(v);
  row.appendChild(g3);

  row.appendChild(_btn('✕ Supprimer', 'aut-btn del', () => {
    automationEnEdition.conditions.splice(i,1);
    renderCanvasAutomation(automationEnEdition.nom);
  }));

  return row;
}

function addConditionCanvas(){
  automationEnEdition.conditions = automationEnEdition.conditions || [];
  automationEnEdition.conditions.push({ field:'', operator:'=', value:'' });
  renderCanvasAutomation(automationEnEdition.nom);
}

function _sectionActionsAutomation(){
  const title = document.createElement('span');
  title.textContent = '⚡ Actions';
  const addBtn = _btn('+ Ajouter', 'btn-add-small', addActionCanvas);

  const { sec, body } = _makeSection(title, addBtn);

  const list = automationEnEdition.actions || [];
  if (!list.length) {
    const hint = _el('div','section-hint');
    hint.textContent = "Aucune action. Cliquez sur “Ajouter”.";
    body.appendChild(hint);
    return sec;
  }

  list.forEach((a,i) => body.appendChild(_renderActionBlock(a,i)));
  return sec;
}

function _renderActionBlock(a, i){
  const block = _el('div','action-block');

  const num = _el('div','action-number');
  num.textContent = String(i+1);
  block.appendChild(num);

  const g = _formGroup();
  g.appendChild(_label("Type d'action"));

  const keys = Object.keys(ACTIONS_ICONIK).filter(k => !ACTIONS_ICONIK[k]?.hidden).sort((x,y)=>cmp(ACTIONS_ICONIK[x].label, ACTIONS_ICONIK[y].label));
  if (a.type && ACTIONS_ICONIK[a.type]?.hidden && !keys.includes(a.type)) {
  keys.unshift(a.type);
}
  const opts = [{ value:'', label:'-- Sélectionnez --' }].concat(keys.map(k => ({ value:k, label:ACTIONS_ICONIK[k].label })));
  const sel = _select(opts, a.type || '');
  sel.addEventListener('change', () => {
    a.type = sel.value;
    a.config = {};
    rerenderCanvasAutomationPreserveScroll(automationEnEdition.nom);
  });
  g.appendChild(sel);
  block.appendChild(g);

  const fields = _el('div', null);
  fields.id = `action-fields-${i}`;
  if (a.type && ACTIONS_ICONIK[a.type]) {
    fields.appendChild(_renderFieldsForAction(a.type, a.config || {}, i));
  }
  block.appendChild(fields);

  block.appendChild(_btn('✕ Supprimer', 'aut-btn del', () => {
    removeActionCanvas(i);
  }));

  return block;
}

function _renderFieldsForAction(type, cfg, idx){
  const wrap = document.createElement('div');
  const def = ACTIONS_ICONIK[type];

  // Actions "path-aware" : Archive/Restore/Transfer
  // Le champ "New path *" est injecté juste sous le checkbox "Use current path".
  const isPathAware = (type === 'Archive asset' || type === 'Restore asset' || type === 'Transfer asset');

  // ✅ Cas spécial : Update metadata = résumé tags + Avancé replié
  if (type === 'Update metadata') {
    // 1) Résumé en tags (champ=valeur (mode))
    if (typeof renderUpdateMetadataTags === 'function') {
      wrap.appendChild(renderUpdateMetadataTags(cfg));
    }

    // 2) Info (pas une option)
    const info = _el('div','section-hint');
    info.textContent = 'Only marked fields will be updated.';
    wrap.appendChild(info);

    // 3) Avancé (construction) replié
    const details = document.createElement('details');
    details.className = 'advanced-block';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced (Metadata View / Fields)';
    details.appendChild(summary);

    const inner = document.createElement('div');

    // on garde les contrôles de construction existants (md view + md fields)
    (def?.fields || []).forEach(f => {
      if (f.conditional && f.conditional === 'metadataView') {
        if (!cfg.metadataView) {
          const hint = _el('div','section-hint');
          hint.textContent = 'Sélectionnez une Metadata View pour afficher les champs.';
          inner.appendChild(hint);
          return;
        }
      }
      inner.appendChild(_renderFieldControl('action', idx, cfg, f));
    });

    details.appendChild(inner);
    wrap.appendChild(details);
    return wrap;
  }

  // ─────────────────────────────────────────────
  // Comportement standard + injection New path*
  // ─────────────────────────────────────────────
  let injectedNewPath = false;

  (def?.fields || []).forEach(f => {
    if (f.conditional && f.conditional === 'metadataView') {
      if (!cfg.metadataView) {
        const hint = _el('div','section-hint');
        hint.textContent = 'Sélectionnez une Metadata View pour afficher les champs.';
        wrap.appendChild(hint);
        return;
      }
    }

    const node = _renderFieldControl('action', idx, cfg, f);
    wrap.appendChild(node);

    // ✅ Inject New path* just after Use current path
    if (isPathAware && f.type === 'checkbox' && f.id === 'useCurrentPath') {
      if (typeof cfg.useCurrentPath === 'undefined') cfg.useCurrentPath = true;
      if (typeof cfg.destinationPath !== 'string') cfg.destinationPath = '';
      const extra = document.createElement('div');
      // renderUseCurrentPathNewPathBlock returns '' when useCurrentPath=true
      extra.innerHTML = renderUseCurrentPathNewPathBlock(idx, cfg);
      wrap.appendChild(extra);
      injectedNewPath = true;
    }
  });

  // Fallback : si le catalogue ne contient pas useCurrentPath, on injecte quand même en fin
  if (isPathAware && !injectedNewPath) {
    if (typeof cfg.useCurrentPath === 'undefined') cfg.useCurrentPath = true;
    if (typeof cfg.destinationPath !== 'string') cfg.destinationPath = '';
    const extra = document.createElement('div');
    extra.innerHTML = renderUseCurrentPathNewPathBlock(idx, cfg);
    wrap.appendChild(extra);
  }

  return wrap;
}

function addActionCanvas(){
  automationEnEdition.actions = automationEnEdition.actions || [];
  automationEnEdition.actions.push({ type:'', config:{} });
  renderCanvasAutomation(automationEnEdition.nom);
}

function removeActionCanvas(i){
  automationEnEdition.actions.splice(i,1);
  renderCanvasAutomation(automationEnEdition.nom);
}

/* ============================ FIELD CONTROLS ============================= */
/**
 * Render a field control and bind it to cfg[f.id]
 * ctx: 'trigger' | 'action'
 */
function _renderFieldControl(ctx, idx, cfg, f){
  const wrap = _formGroup();

  // Checkbox has its own label line
  if (f.type !== 'checkbox') wrap.appendChild(_label(f.label || f.id));

  if (f.type === 'text') {
    const inp = _inputText(cfg[f.id] ?? '', f.placeholder || '');
    inp.addEventListener('input', () => { cfg[f.id] = inp.value; renderApiPreview(); });
    wrap.appendChild(inp);
    return wrap;
  }

  if (f.type === 'textarea') {
    const ta = _textarea(cfg[f.id] ?? '', f.placeholder || '');
    ta.addEventListener('input', () => { cfg[f.id] = ta.value; renderApiPreview(); });
    wrap.appendChild(ta);
    return wrap;
  }

  if (f.type === 'checkbox') {
    const line = _el('label','field-checkbox');
    const cb = _checkbox(toBool(cfg[f.id]));
    cb.addEventListener('change', () => {
    cfg[f.id] = cb.checked;
    renderApiPreview();
    // ✅ Si on est sur une action et que ce checkbox pilote l'affichage "New path *"
    if (ctx === 'action' && f.id === 'useCurrentPath') {
      if (cb.checked) {
      // Use current path = true -> cacher + nettoyer New path
      cfg.destinationPath = '';
      if ('destination_directory_path' in cfg) delete cfg.destination_directory_path;
    } else {
      // Use current path = false -> montrer New path *
      if (typeof cfg.destinationPath !== 'string') cfg.destinationPath = '';
    }

    // Re-render pour afficher/masquer le champ New path *
    rerenderCanvasAutomationPreserveScroll(automationEnEdition.nom);
    }
  });
    line.appendChild(cb);
    const sp = document.createElement('span'); sp.textContent = f.label || f.id;
    line.appendChild(sp);
    return line;
  }

  if (f.type === 'select') {
    const options = [{value:'',label:'-- Sélectionnez --'}].concat((f.options||[]).map(o=>({value:o,label:o})));
    const sel = _select(options, cfg[f.id] ?? '');
    sel.addEventListener('change', () => { cfg[f.id] = sel.value; renderApiPreview(); });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-metadata') {
    const metas = (metadonneesData.metadonnees || []).map(m => m.nom || m.name || '').filter(Boolean).sort(cmp);
    const options = [{value:'',label:'-- Sélectionnez --'}].concat(metas.map(n=>({value:n,label:n})));
    const sel = _select(options, cfg[f.id] ?? '');
    sel.addEventListener('change', () => {
      cfg[f.id] = sel.value;
      // refresh meta-value-input if needed
      rerenderCanvasAutomationPreserveScroll(automationEnEdition.nom);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'meta-value-input') {
    const metaName = cfg.metadataField || '';
    const meta = (metadonneesData.metadonnees || []).find(m => (m.nom||m.name) === metaName);
    if (meta && String(meta.type||'').toLowerCase() === 'yes/no') {
      const sel = _select(
        [{value:'',label:'-- Sélectionnez --'},{value:'true',label:'Yes'},{value:'false',label:'No'}],
        cfg[f.id] ?? ''
      );
      sel.addEventListener('change', () => { cfg[f.id] = sel.value; renderApiPreview(); });
      wrap.appendChild(sel);
    } else {
      const inp = _inputText(cfg[f.id] ?? '', f.placeholder || '');
      inp.addEventListener('input', () => { cfg[f.id] = inp.value; renderApiPreview(); });
      wrap.appendChild(inp);
    }
    return wrap;
  }

  if (f.type === 'select-mdviews') {
    const views = (metadataViewsData.metadataViews || []).map(v => typeof v === 'string' ? v : (v.name || v.id || '')).filter(Boolean).sort(cmp);
    const options = [{value:'',label:'-- Sélectionnez --'}].concat(views.map(v=>({value:v,label:v})));
    const sel = _select(options, cfg[f.id] ?? '');
    sel.addEventListener('change', () => {
      cfg[f.id] = sel.value;
      rerenderCanvasAutomationPreserveScroll(automationEnEdition.nom);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'metadata-fields') {
    // Affiche une liste de champs méta pour la view choisie (simple)
    const mv = cfg.metadataView || '';
    const metas = (metadonneesData.metadonnees || []).filter(m => {
      const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
      return views.includes(mv);
    }).map(m => m.nom || m.name).filter(Boolean).sort(cmp);

    if (!metas.length) {
      const hint = _el('div','section-hint');
      hint.textContent = "Aucun champ méta trouvé pour cette view (ou référentiel non chargé).";
      wrap.appendChild(hint);
      return wrap;
    }

    const sel = _el('select','field-select');
    sel.multiple = true;
    metas.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });

    const cur = Array.isArray(cfg.metadataFields) ? cfg.metadataFields : [];
    Array.from(sel.options).forEach(o => { if (cur.includes(o.value)) o.selected = true; });

    sel.addEventListener('change', () => {
      cfg.metadataFields = Array.from(sel.selectedOptions).map(o => o.value);
      renderApiPreview();
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-storages-multi') {
    const st = (storagesData.storages || []).map(s => (s.nom||s.name||s)).filter(Boolean).sort(cmp);
    const sel = _el('select','field-select');
    sel.multiple = true;
    st.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    const cur = Array.isArray(cfg[f.id]) ? cfg[f.id] : [];
    Array.from(sel.options).forEach(o => { if (cur.includes(o.value)) o.selected = true; });
    sel.addEventListener('change', () => {
      cfg[f.id] = Array.from(sel.selectedOptions).map(o => o.value);
      renderApiPreview();
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-collections-multi') {
    const cols = (collectionsData.collections || []).map(c => {
      if (typeof c === 'string') return c;
      return c.name || c.nom || c.id || '';
    }).filter(Boolean).sort(cmp);

    const sel = _el('select','field-select');
    sel.multiple = true;
    cols.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    const cur = Array.isArray(cfg[f.id]) ? cfg[f.id] : [];
    Array.from(sel.options).forEach(o => { if (cur.includes(o.value)) o.selected = true; });
    sel.addEventListener('change', () => {
      cfg[f.id] = Array.from(sel.selectedOptions).map(o => o.value);
      renderApiPreview();
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-users-multi') {
    const us = (usersData.users || []).map(u => ({ id:u.id||'', email:u.email||'', name:u.name||u.nom||'' }))
      .filter(u => u.id || u.email || u.name)
      .sort((a,b)=>cmp(a.name||a.email, b.name||b.email));

    // Select multiple, values = ids when available, else email/name
    const sel = _el('select','field-select');
    sel.multiple = true;
    us.forEach(u => {
      const o = document.createElement('option');
      o.value = u.id || u.email || u.name;
      o.textContent = u.name || u.email || u.id;
      sel.appendChild(o);
    });

    const cur = Array.isArray(cfg[f.id]) ? cfg[f.id] : [];
    Array.from(sel.options).forEach(o => { if (cur.includes(o.value)) o.selected = true; });

    sel.addEventListener('change', () => {
      cfg[f.id] = Array.from(sel.selectedOptions).map(o => o.value);
      renderApiPreview();
    });

    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-teams-multi') {
    const ts = (teamsData.teams || []).map(t => ({ id:t.id||'', name:t.nom||t.name||'' }))
      .filter(t => t.id || t.name)
      .sort((a,b)=>cmp(a.name, b.name));

    const sel = _el('select','field-select');
    sel.multiple = true;
    ts.forEach(t => {
      const o = document.createElement('option');
      o.value = t.id || t.name;
      o.textContent = t.name || t.id;
      sel.appendChild(o);
    });

    const cur = Array.isArray(cfg[f.id]) ? cfg[f.id] : [];
    Array.from(sel.options).forEach(o => { if (cur.includes(o.value)) o.selected = true; });

    sel.addEventListener('change', () => {
      cfg[f.id] = Array.from(sel.selectedOptions).map(o => o.value);
      renderApiPreview();
    });

    wrap.appendChild(sel);
    return wrap;
  }

  if (f.type === 'select-custom-actions') {
  const list = (customActionsData && Array.isArray(customActionsData.customActions))
    ? customActionsData.customActions
    : [];

  const opts = [{ value:'', label:'-- Sélectionnez --' }]
    .concat(
      list
        .map(ca => {
          const id = String(ca?.id || '');
          const label = String(ca?.title || ca?.name || ca?.nom || id);
          return id ? { value: id, label } : null;
        })
        .filter(Boolean)
        .sort((a,b)=>String(a.label).localeCompare(String(b.label),'fr',{sensitivity:'base'}))
    );

  const cur = String(cfg.customActionId || cfg[f.id] || '');

  const sel = _select(opts, cur);
  sel.addEventListener('change', () => {
    cfg[f.id] = sel.value;      // customActionRef (id)
    cfg.customActionId = sel.value;
    renderApiPreview();
  });

  wrap.appendChild(sel);
  return wrap;
}

  if (f.type === 'chips-kv-readonly') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';

  const lab = document.createElement('label');
  lab.className = 'field-label';
  lab.textContent = f.label || 'Fields / Values';
  wrap.appendChild(lab);

  const arr = Array.isArray(cfg[f.id]) ? cfg[f.id] : [];
  if (!arr.length) {
    const hint = document.createElement('div');
    hint.className = 'section-hint';
    hint.textContent = 'No values.';
    wrap.appendChild(hint);
    return wrap;
  }

  const box = document.createElement('div');
  box.className = 'chips-tags';

  arr.forEach(it => {
    const field = String(it?.field ?? '');
    const value = String(it?.value ?? '');

    const chip = document.createElement('span');
    chip.className = 'chips-tag enum';

    const txt = document.createElement('span');
    txt.className = 'chips-tag-text';
    txt.textContent = `${field} = ${value}`;
    chip.appendChild(txt);

    box.appendChild(chip);
  });

  wrap.appendChild(box);
  return wrap;
}
  if (f.type === 'select-export-locations') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  if (f.label) wrap.appendChild(_label(f.label));

  // Source: localStorage exportLocationsData = { exportLocations:[{id,name,path,storageName,...}] }
  let rows = [];
  try {
    const d = JSON.parse(localStorage.getItem('exportLocationsData') || '');
    rows = (d && Array.isArray(d.exportLocations)) ? d.exportLocations : [];
  } catch {}

  const opts = [{ value:'', label:'-- Sélectionnez --' }].concat(
    rows
      .map(x => {
        const id = String(x?.id || '');
        if (!id) return null;
        const name = String(x?.name || x?.nom || x?.title || id);
        // label enrichi (facultatif) : "name — storageName — path"
        const storageName = String(x?.storageName || x?.storage || '');
        const path = String(x?.path || '');
        const label = [name, storageName, path].filter(Boolean).join(' — ');
        return { value: id, label };
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label))
  );

  const cur = String(cfg.exportLocationId || cfg[f.id] || '');
  const sel = _select(opts, cur);

  sel.addEventListener('change', () => {
    cfg[f.id] = sel.value;        // exportLocation (id)
    cfg.exportLocationId = sel.value;
    renderApiPreview();
  });

  wrap.appendChild(sel);
  return wrap;
}
  if (f.type === 'select-block-fields') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  if (f.label) wrap.appendChild(_label(f.label));

  // ✅ Source fiable: localStorage (évite metadonneesData stale)
  let arr = [];
  try {
    const d = JSON.parse(localStorage.getItem('metadonneesData') || '');
    arr = (d && Array.isArray(d.metadonnees)) ? d.metadonnees : [];
  } catch {}

  // ✅ Flag "Block assets" à la racine ou dans raw [1](https://pegasus-frontend.org/docs/user-guide/meta-files/)
  const rows = arr.filter(m => !!(
    m?.is_block_field || m?.block_assets ||
    m?.raw?.is_block_field || m?.raw?.block_assets || m?.raw?.is_block_assets
  ));

  // options value = id technique
  const opts = [{ value:'', label:'-- Sélectionnez --' }].concat(
    rows
      .map(m => {
        const id = String(m?.id || m?.name || m?.raw?.name || '');
        const label = String(m?.nom || m?.name || m?.raw?.label || m?.raw?.name || id);
        return id ? { value: id, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label))
  );

  // ✅ Sélection courante (id)
  const cur = String(cfg[f.id] || '').trim();

  // fallback: si cur pas dans opts, on l’injecte pour affichage
  if (cur && !opts.some(o => o.value === cur)) {
    opts.splice(1, 0, { value: cur, label: `[Missing in metadonneesData] ${cur}` });
  }

  const sel = _select(opts, cur);
  sel.addEventListener('change', () => {
    cfg[f.id] = sel.value;
    renderApiPreview();
  });

  wrap.appendChild(sel);
  return wrap;
}

  if (f.type === 'select-warning-fields') {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  if (f.label) wrap.appendChild(_label(f.label));

  // ✅ Source fiable: localStorage (évite metadonneesData stale)
  let arr = [];
  try {
    const d = JSON.parse(localStorage.getItem('metadonneesData') || '');
    arr = (d && Array.isArray(d.metadonnees)) ? d.metadonnees : [];
  } catch {}

  // ✅ Flag "Display as warning" à la racine ou dans raw [1](https://pegasus-frontend.org/docs/user-guide/meta-files/)
  const rows = arr.filter(m => !!(
    m?.is_warning_field || m?.display_as_warning ||
    m?.raw?.is_warning_field || m?.raw?.display_as_warning || m?.raw?.is_warning
  ));

  const opts = [{ value:'', label:'-- Sélectionnez --' }].concat(
    rows
      .map(m => {
        const id = String(m?.id || m?.name || m?.raw?.name || '');
        const label = String(m?.nom || m?.name || m?.raw?.label || m?.raw?.name || id);
        return id ? { value: id, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label))
  );

  const cur = String(cfg[f.id] || '').trim();

  if (cur && !opts.some(o => o.value === cur)) {
    opts.splice(1, 0, { value: cur, label: `[Missing in metadonneesData] ${cur}` });
  }

  const sel = _select(opts, cur);
  sel.addEventListener('change', () => {
    cfg[f.id] = sel.value;
    renderApiPreview();
  });

  wrap.appendChild(sel);
  return wrap;
}

  // Fallback: unknown field type → text
  const fallback = _inputText(cfg[f.id] ?? '', '');
  fallback.addEventListener('input', () => { cfg[f.id] = fallback.value; renderApiPreview(); });
  wrap.appendChild(fallback);
  return wrap;
}

/* =============================== SAVE ==================================== */
function saveCurrent(){
  if (currentKind !== 'automation') return;

  // Validation légère
  const newName = String(automationEnEdition.nom || '').trim();
  if (!newName) {
    alert("Le nom de l'automation est obligatoire.");
    return;
  }

  const autos = automationsData.automations || [];
  // Si on renomme, éviter collision simple
  const existingIndexSameName = autos.findIndex((a, i) =>
    i !== indexAutomationEnEdition && String(a?.nom||'') === newName
  );
  if (existingIndexSameName >= 0) {
    alert("Une automation avec ce nom existe déjà.");
    return;
  }

  // ─────────────────────────────────────────────
  // Validation "New path *" (Iconik-like) :
  // - Obligatoire si Use current path = false
  // - Pour Archive/Restore/Transfer
  // ─────────────────────────────────────────────
  const pathAwareTypes = new Set(['Archive asset', 'Restore asset', 'Transfer asset']);
  const actions = (automationEnEdition.actions || []);

  for (const ac of actions) {
    if (!ac || !pathAwareTypes.has(ac.type)) continue;

    const cfg = ac.config || (ac.config = {});

    // On considère que l'option existe si la clé est présente (checkbox du haut)
    const hasToggle = ('useCurrentPath' in cfg);
    const useCur = hasToggle ? toBool(cfg.useCurrentPath) : true;

    // Si destinationPath absent mais destination_directory_path présent (cas sync)
    if ((typeof cfg.destinationPath === 'undefined' || cfg.destinationPath === null) &&
        typeof cfg.destination_directory_path === 'string') {
      cfg.destinationPath = cfg.destination_directory_path;
    }

    if (useCur) {
      // Use current path = true -> on nettoie
      cfg.destinationPath = '';
      if ('destination_directory_path' in cfg) delete cfg.destination_directory_path;
      continue;
    }

    // Use current path = false -> New path * obligatoire
    const p = String(cfg.destinationPath || '').trim();
    if (!p) {
      alert(`Le champ "New path *" est obligatoire pour l'action "${ac.type}" lorsque "Use current path" est désactivé.`);
      return;
    }

    // Aligner le champ Iconik raw
    cfg.destinationPath = p;
    cfg.destination_directory_path = p;
  }
 
  // Mettre à jour / remplacer
  if (indexAutomationEnEdition >= 0) {
    autos[indexAutomationEnEdition] = automationEnEdition;
  } else {
    autos.push(automationEnEdition);
    indexAutomationEnEdition = autos.length - 1;
  }
  automationsData.automations = autos;

  sauvegarderDonnees();
  afficherTousLesElements();
  mettreAJourStats();

  // Mettre à jour la clé courante si rename
  currentKey = newName;

  // Rester dans l’éditeur, re-render propre
  renderCanvasAutomation(newName);
}

/* ============================ API PREVIEW (RIGHT) ========================= */
function renderApiPreview(){
  const box = document.getElementById('api-calls-container');
  const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
  if (!box) return;

  box.innerHTML = '';
  box.style.display = 'none';
  if (emptyPrev) emptyPrev.style.display = '';

  if (!currentKind) return;

  // Pour l'instant on fait un preview utile surtout pour Automations
  if (currentKind !== 'automation') {
    // Part 3/3 complètera webhook/custom
    return;
  }

  const a = automationEnEdition;
  if (!a) return;

  const calls = [];

  // Exemple: Set ACL on asset → preview d’un POST (pseudo)
  (a.actions || []).forEach((ac, idx) => {
    if (ac.type === 'Set ACL on asset') {
      const cfg = ac.config || {};
      const body = {
        applyMode: cfg.applyMode || 'Overwrite',
        teams: cfg.teams || [],
        users: cfg.users || [],
        permissions: cfg.permissions || []
      };
      calls.push({
        method: 'POST',
        url: '/API/acls/v1/acl/assets/{ASSET_ID}/', // placeholder (conceptuel)
        body
      });
    }
    if (ac.type === 'Add to collection') {
      const cfg = ac.config || {};
      calls.push({
        method: 'POST',
        url: '/API/assets/v1/assets/{ASSET_ID}/collections/',
        body: { collections: cfg.collections || [] }
      });
    }
    if (ac.type === 'Update metadata') {
      const cfg = ac.config || {};
      calls.push({
        method: 'PUT',
        url: '/API/metadata/v1/assets/{ASSET_ID}/',
        body: { metadataView: cfg.metadataView || '', metadataFields: cfg.metadataFields || [] }
      });
    }
    if (ac.type === 'Custom action') {
      const cfg = ac.config || {};
      calls.push({
        method: 'POST',
        url: '/API/assets/v1/custom_actions/{CUSTOM_ACTION_ID}/run',
        body: { customActionRef: cfg.customActionRef || '' }
      });
    }
  });

  // Aucun appel : garder empty
  if (!calls.length) return;

  // Afficher
  if (emptyPrev) emptyPrev.style.display = 'none';
  box.style.display = 'block';

  calls.forEach((c, i) => {
    const block = _el('div','api-call-block');

    const method = _el('div','api-method');
    method.textContent = `${c.method} #${i+1}`;
    block.appendChild(method);

    const url = _el('div','api-url');
    url.textContent = c.url;
    block.appendChild(url);

    const headers = _el('div','api-headers');
    headers.innerHTML = `
      <div class="header-line"><span class="lbl">Content-Type:</span> <span class="val">application/json</span></div>
      <div class="header-line"><span class="lbl">App-ID:</span> <span class="val">{app_id}</span></div>
      <div class="header-line"><span class="lbl">Auth-Token:</span> <span class="val">{auth_token}</span></div>
    `;
    block.appendChild(headers);

    const bodyWrap = document.createElement('details');
    bodyWrap.className = 'api-body';
    const sum = document.createElement('summary');
    sum.textContent = 'Body JSON';
    bodyWrap.appendChild(sum);
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(c.body || {}, null, 2);
    bodyWrap.appendChild(pre);
    block.appendChild(bodyWrap);

    box.appendChild(block);
  });
}

/* ============================= EXPORT GLOBALS ============================ */
window.renderCanvasAutomation = renderCanvasAutomation;
window.renderApiPreview = renderApiPreview;
window.saveCurrent = saveCurrent;

// Canvas action helpers used by DOM handlers
window.addTriggerCanvas = addTriggerCanvas;
window.removeTriggerCanvas = removeTriggerCanvas;
window.addConditionCanvas = addConditionCanvas;
window.addActionCanvas = addActionCanvas;
window.removeActionCanvas = removeActionCanvas;

/* ========================================================================
   WFD — Automations (Canvas-only, Settings-like)
   PART 3/3 : Canvas editor for Webhooks + Custom Actions + preview + saves
   ======================================================================== */

/* ============================== ID UTIL ================================== */
function _wfdUid(prefix='wfd'){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

/* ======================= SIDEBAR OVERRIDES (stable keys) ================== */
/* On override afficherWebhooks / afficherCustomActions pour utiliser _wfdId
   → évite collisions quand name/title est vide (offline draft). */
function afficherWebhooks(){
  const container = document.getElementById('webhooks-list');
  if (!container) return;
  const list = webhooksData.webhooks || [];
  container.innerHTML = '';
  if (!list.length){
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucun webhook</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => cmp(a?.name, b?.name));
  sorted.forEach(w => {
    const key = w?._wfdId || w?.id || w?.name || '';
    const isLocal = !w?.id; // heuristique: pas d'id => local/draft
    const node = createCassette({
      kind: 'webhook',
      name: w?.name,
      title: '🔔 ' + (w?.name || 'Sans nom'),
      isLocalDraft: !!isLocal,
      onClick: () => openEditor('webhook', key)
    });
    container.appendChild(node);
  });
}

function afficherCustomActions(){
  const container = document.getElementById('custom-actions-list');
  if (!container) return;
  const list = customActionsData.customActions || [];
  container.innerHTML = '';
  if (!list.length){
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucune custom action</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => cmp(a?.title, b?.title));
  sorted.forEach(ca => {
    const key = ca?._wfdId || ca?.id || ca?.title || '';
    const isLocal = !ca?.id;
    const node = createCassette({
      kind: 'custom',
      name: ca?.title,
      title: '⚡ ' + (ca?.title || 'Sans titre'),
      isLocalDraft: !!isLocal,
      onClick: () => openEditor('custom', key)
    });
    container.appendChild(node);
  });
}

/* On rebranche afficherTousLesElements sur les versions override */
function afficherTousLesElements(){
  afficherAutomations();
  afficherWebhooks();
  afficherCustomActions();
}
window.afficherWebhooks = afficherWebhooks;
window.afficherCustomActions = afficherCustomActions;
window.afficherTousLesElements = afficherTousLesElements;

/* ========================= CREATE FLOWS OVERRIDES ========================= */
/* On override creerWebhook / creerCustomAction pour générer une clé _wfdId stable */
function creerWebhook(){
  const w = {
    _wfdId: _wfdUid('wh'),
    id: '',
    name: '',
    description: '',
    url: '',
    eventType: 'Assets',
    realm: 'All',
    operation: 'All',
    objectId: '',
    query: '',
    headers: []
  };
  webhooksData.webhooks = webhooksData.webhooks || [];
  webhooksData.webhooks.push(w);
  sauvegarderDonnees();
  afficherWebhooks();
  openEditor('webhook', w._wfdId);
}

function creerCustomAction(){
  const ca = {
    _wfdId: _wfdUid('ca'),
    id: '',
    title: '',
    context: 'asset',
    type: 'Post',
    url: '',
    appId: '',
    appName: '',
    metadataView: '',
    description: '',
    headers: []
  };
  customActionsData.customActions = customActionsData.customActions || [];
  customActionsData.customActions.push(ca);
  sauvegarderDonnees();
  afficherCustomActions();
  openEditor('custom', ca._wfdId);
}

window.creerWebhook = creerWebhook;
window.creerCustomAction = creerCustomAction;

/* ============================ CANVAS: WEBHOOK ============================= */
let webhookEnEdition = null;
let indexWebhookEnEdition = -1;

function _findWebhookIndexByKey(key){
  const list = webhooksData.webhooks || [];
  return list.findIndex(w =>
    String(w?._wfdId||'') === String(key||'') ||
    String(w?.id||'')     === String(key||'') ||
    String(w?.name||'')   === String(key||'')
  );
}

function renderCanvasWebhook(key){
  const editor = document.getElementById('canvas-editor');
  if (!editor) return;

  const idx = _findWebhookIndexByKey(key);
  indexWebhookEnEdition = idx;
  webhookEnEdition = idx >= 0
    ? JSON.parse(JSON.stringify((webhooksData.webhooks||[])[idx]))
    : { _wfdId:_wfdUid('wh'), id:'', name:'', description:'', url:'', eventType:'Assets', realm:'All', operation:'All', objectId:'', query:'', headers:[] };

  editor.innerHTML = '';

  const hdr = _el('div','editor-header');
  const h2 = document.createElement('h2');
  h2.textContent = webhookEnEdition.name ? `Webhook — ${webhookEnEdition.name}` : 'Webhook — (sans nom)';
  hdr.appendChild(h2);

  const actions = _el('div','editor-actions');
  actions.appendChild(_btn('💾 Sauvegarder','btn-save', saveCurrent));
  actions.appendChild(_btn('✕ Annuler','btn-close', closeEditor));
  actions.appendChild(_btn('🗑 Supprimer', 'btn-close', deleteCurrent));
  hdr.appendChild(actions);
  editor.appendChild(hdr);

  // Informations
  const { sec, body } = _makeSection((() => {
    const s = document.createElement('span');
    const isLocal = !webhookEnEdition.id;
    const dot = _el('span','cassette-dot ' + (isLocal ? 'local' : 'on'));
    s.appendChild(dot);
    s.appendChild(document.createTextNode(' Webhook'));
    return s;
  })());

  // Name
  const g1 = _formGroup();
  g1.appendChild(_label('Nom *'));
  const name = _inputText(webhookEnEdition.name || '', 'Ex: Notification Slack');
  name.addEventListener('input', () => {
    webhookEnEdition.name = name.value;
    const t = _qs('#canvas-editor .editor-header h2');
    if (t) t.textContent = webhookEnEdition.name ? `Webhook — ${webhookEnEdition.name}` : 'Webhook — (sans nom)';
    renderApiPreview();
  });
  g1.appendChild(name);
  body.appendChild(g1);

  // Description
  const g2 = _formGroup();
  g2.appendChild(_label('Description'));
  const desc = _inputText(webhookEnEdition.description || '', 'Optionnelle');
  desc.addEventListener('input', () => { webhookEnEdition.description = desc.value; renderApiPreview(); });
  g2.appendChild(desc);
  body.appendChild(g2);

  // URL
  const g3 = _formGroup();
  g3.appendChild(_label('URL *'));
  const url = _inputText(webhookEnEdition.url || '', 'https://...');
  url.addEventListener('input', () => { webhookEnEdition.url = url.value; renderApiPreview(); });
  g3.appendChild(url);
  body.appendChild(g3);

  // Event / Realm / Operation
  const row = document.createElement('div');
  row.className = 'form-group';
  row.appendChild(_label('Event / Realm / Operation'));

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr 1fr';
  grid.style.gap = '10px';

  const selEvent = _select(
    [{value:'Assets',label:'Assets'},{value:'Collections',label:'Collections'},{value:'Shares',label:'Shares'},{value:'Users',label:'Users'}],
    webhookEnEdition.eventType || 'Assets'
  );
  selEvent.addEventListener('change', () => { webhookEnEdition.eventType = selEvent.value; renderApiPreview(); });

  const selRealm = _select(
    [{value:'All',label:'All'},{value:'Organization',label:'Organization'},{value:'User',label:'User'}],
    webhookEnEdition.realm || 'All'
  );
  selRealm.addEventListener('change', () => { webhookEnEdition.realm = selRealm.value; renderApiPreview(); });

  const selOp = _select(
    [{value:'All',label:'All'},{value:'Create',label:'Create'},{value:'Update',label:'Update'},{value:'Delete',label:'Delete'}],
    webhookEnEdition.operation || 'All'
  );
  selOp.addEventListener('change', () => { webhookEnEdition.operation = selOp.value; renderApiPreview(); });

  grid.appendChild(selEvent);
  grid.appendChild(selRealm);
  grid.appendChild(selOp);
  row.appendChild(grid);
  body.appendChild(row);

  // Object ID + Query
  const g4 = _formGroup();
  g4.appendChild(_label('Object ID (optionnel)'));
  const oid = _inputText(webhookEnEdition.objectId || '', 'ID de l’objet à filtrer');
  oid.addEventListener('input', () => { webhookEnEdition.objectId = oid.value; renderApiPreview(); });
  g4.appendChild(oid);
  body.appendChild(g4);

  const g5 = _formGroup();
  g5.appendChild(_label('Query / Filter (optionnel)'));
  const qry = _inputText(webhookEnEdition.query || '', 'Filtre avancé');
  qry.addEventListener('input', () => { webhookEnEdition.query = qry.value; renderApiPreview(); });
  g5.appendChild(qry);
  body.appendChild(g5);

  // Headers editor (simple)
  const g6 = _formGroup();
  g6.appendChild(_label('Headers personnalisés'));
  const headersBox = document.createElement('div');
  (webhookEnEdition.headers || []).forEach((h, i) => {
    headersBox.appendChild(_renderHeaderRow('wh', i, h, () => {
      webhookEnEdition.headers.splice(i,1);
      renderCanvasWebhook(webhookEnEdition._wfdId || webhookEnEdition.name || key);
      renderApiPreview();
    }));
  });
  g6.appendChild(headersBox);

  const addH = _btn('+ Ajouter un header', 'btn-add-small', () => {
    webhookEnEdition.headers = webhookEnEdition.headers || [];
    webhookEnEdition.headers.push({ key:'', value:'' });
    renderCanvasWebhook(webhookEnEdition._wfdId || webhookEnEdition.name || key);
    renderApiPreview();
  });
  g6.appendChild(addH);
  body.appendChild(g6);

  editor.appendChild(sec);
  renderApiPreview();
}

/* ========================= CANVAS: CUSTOM ACTION ========================== */
let customActionEnEdition = null;
let indexCustomActionEnEdition = -1;

function _findCustomActionIndexByKey(key){
  const list = customActionsData.customActions || [];
  return list.findIndex(ca =>
    String(ca?._wfdId||'')  === String(key||'') ||
    String(ca?.id||'')      === String(key||'') ||
    String(ca?.title||'')   === String(key||'')
  );
}

function renderCanvasCustomAction(key){
  const editor = document.getElementById('canvas-editor');
  if (!editor) return;

  const idx = _findCustomActionIndexByKey(key);
  indexCustomActionEnEdition = idx;
  customActionEnEdition = idx >= 0
    ? JSON.parse(JSON.stringify((customActionsData.customActions||[])[idx]))
    : { _wfdId:_wfdUid('ca'), id:'', title:'', context:'asset', type:'Post', url:'', headers:[], metadataView:'', appId:'', appName:'', description:'' };

  editor.innerHTML = '';

  const hdr = _el('div','editor-header');
  const h2 = document.createElement('h2');
  h2.textContent = customActionEnEdition.title ? `Custom Action — ${customActionEnEdition.title}` : 'Custom Action — (sans titre)';
  hdr.appendChild(h2);

  const actions = _el('div','editor-actions');
  actions.appendChild(_btn('💾 Sauvegarder','btn-save', saveCurrent));
  actions.appendChild(_btn('✕ Annuler','btn-close', closeEditor));
  actions.appendChild(_btn('🗑 Supprimer', 'btn-close', deleteCurrent));
  hdr.appendChild(actions);
  editor.appendChild(hdr);

  const { sec, body } = _makeSection((() => {
    const s = document.createElement('span');
    const isLocal = !customActionEnEdition.id;
    const dot = _el('span','cassette-dot ' + (isLocal ? 'local' : 'on'));
    s.appendChild(dot);
    s.appendChild(document.createTextNode(' Custom Action'));
    return s;
  })());

  // Title
  const g1 = _formGroup();
  g1.appendChild(_label('Titre *'));
  const title = _inputText(customActionEnEdition.title || '', 'Ex: Export Audio');
  title.addEventListener('input', () => {
    customActionEnEdition.title = title.value;
    const t = _qs('#canvas-editor .editor-header h2');
    if (t) t.textContent = customActionEnEdition.title ? `Custom Action — ${customActionEnEdition.title}` : 'Custom Action — (sans titre)';
    renderApiPreview();
  });
  g1.appendChild(title);
  body.appendChild(g1);

  // Context / Type
  const g2 = _formGroup();
  g2.appendChild(_label('Context'));
  const ctx = _select(
    [{value:'asset',label:'Asset'},{value:'collection',label:'Collection'},{value:'share',label:'Share'}],
    customActionEnEdition.context || 'asset'
  );
  ctx.addEventListener('change', () => { customActionEnEdition.context = ctx.value; renderApiPreview(); });
  g2.appendChild(ctx);
  body.appendChild(g2);

  const g3 = _formGroup();
  g3.appendChild(_label('Type'));
  const typ = _select([{value:'Post',label:'Post'},{value:'Open',label:'Open'}], customActionEnEdition.type || 'Post');
  typ.addEventListener('change', () => { customActionEnEdition.type = typ.value; renderApiPreview(); });
  g3.appendChild(typ);
  body.appendChild(g3);

  // URL
  const g4 = _formGroup();
  g4.appendChild(_label('URL *'));
  const url = _inputText(customActionEnEdition.url || '', 'https://...');
  url.addEventListener('input', () => { customActionEnEdition.url = url.value; renderApiPreview(); });
  g4.appendChild(url);
  body.appendChild(g4);

  // App Token (depuis appTokensData Settings) — optionnel
  const g5 = _formGroup();
  g5.appendChild(_label('App Token (WFD Settings)'));
  const tokList = (appTokensData.appTokens || []).map(t => ({
    value: t.appId || '',
    label: t.name ? `${t.name} (${t.environment||''})` : (t.appId||'')
  })).filter(o => o.value);

  const tokSel = _select([{value:'',label:'-- Aucun --'}].concat(tokList), customActionEnEdition.appId || '');
  tokSel.addEventListener('change', () => {
    customActionEnEdition.appId = tokSel.value;
    const t = (appTokensData.appTokens || []).find(x => (x.appId||'') === tokSel.value);
    customActionEnEdition.appName = t?.name || '';
    renderApiPreview();
  });
  g5.appendChild(tokSel);
  body.appendChild(g5);

  // Metadata View
  const g6 = _formGroup();
  g6.appendChild(_label('Metadata View'));
  const views = (metadataViewsData.metadataViews || []).map(v => typeof v==='string' ? v : (v.name||v.id||'')).filter(Boolean).sort(cmp);
  const mvSel = _select([{value:'',label:'-- Aucune --'}].concat(views.map(v=>({value:v,label:v}))), customActionEnEdition.metadataView || '');
  mvSel.addEventListener('change', () => { customActionEnEdition.metadataView = mvSel.value; renderApiPreview(); });
  g6.appendChild(mvSel);
  body.appendChild(g6);

  // Headers
  const g7 = _formGroup();
  g7.appendChild(_label('Headers personnalisés'));
  const headersBox = document.createElement('div');
  (customActionEnEdition.headers || []).forEach((h, i) => {
    headersBox.appendChild(_renderHeaderRow('ca', i, h, () => {
      customActionEnEdition.headers.splice(i,1);
      renderCanvasCustomAction(customActionEnEdition._wfdId || customActionEnEdition.title || key);
      renderApiPreview();
    }));
  });
  g7.appendChild(headersBox);

  const addH = _btn('+ Ajouter un header', 'btn-add-small', () => {
    customActionEnEdition.headers = customActionEnEdition.headers || [];
    customActionEnEdition.headers.push({ key:'', value:'' });
    renderCanvasCustomAction(customActionEnEdition._wfdId || customActionEnEdition.title || key);
    renderApiPreview();
  });
  g7.appendChild(addH);
  body.appendChild(g7);

  editor.appendChild(sec);
  renderApiPreview();
}

/* ============================== HEADER ROWS ============================== */
function _renderHeaderRow(prefix, idx, h, onRemove){
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.marginBottom = '8px';
  row.style.alignItems = 'center';

  const k = _inputText(h.key || '', 'Header');
  k.addEventListener('input', () => { h.key = k.value; renderApiPreview(); });

  const v = _inputText(h.value || '', 'Value');
  v.addEventListener('input', () => { h.value = v.value; renderApiPreview(); });

  const del = _btn('✕', 'aut-btn del', onRemove);

  row.appendChild(k);
  row.appendChild(v);
  row.appendChild(del);
  return row;
}

/* =============================== SAVE ALL ================================ */
/* On override saveCurrent pour gérer automation + webhook + custom */
function saveCurrent(){
  if (currentKind === 'automation') return _saveAutomation();
  if (currentKind === 'webhook')    return _saveWebhook();
  if (currentKind === 'custom')     return _saveCustomAction();
}

function buildIconikConditionsFromIconikFilters(iconikFilters){
  const f = iconikFilters || { mediaTypes: [], assetTypes: [] };

  const MT = { Image:'image', Video:'video', Audio:'audio' };
  const AT = {
    Asset:'ASSET', Subclip:'SUBCLIP', Sequence:'SEQUENCE',
    Placeholder:'PLACEHOLDER', Link:'LINK', 'NLE Project':'NLE_PROJECT'
  };

  const terms = [];

  if (Array.isArray(f.mediaTypes) && f.mediaTypes.length) {
    terms.push({
      name: 'media_type',
      value_in: f.mediaTypes.map(v => MT[v] || String(v).toLowerCase())
    });
  }

  if (Array.isArray(f.assetTypes) && f.assetTypes.length) {
    terms.push({
      name: 'type',
      value_in: f.assetTypes.map(v => AT[v] || String(v).toUpperCase())
    });
  }

  return terms.length ? [{ operator: 'AND', terms }] : [];
}

function _saveAutomation(){
  const newName = String(automationEnEdition?.nom || '').trim();
  if (!newName) { alert("Le nom de l'automation est obligatoire."); return; }

  const autos = automationsData.automations || [];
  const collision = autos.findIndex((a,i) => i !== indexAutomationEnEdition && String(a?.nom||'') === newName);
  if (collision >= 0) { alert("Une automation avec ce nom existe déjà."); return; }

  // ✅ Sync Filters (Iconik) -> raw.conditions (API shape)
  // ⚠️ Ne touche pas automationEnEdition.conditions (WFD-only)
  automationEnEdition.raw = automationEnEdition.raw || {};
  automationEnEdition.raw.conditions = buildIconikConditionsFromIconikFilters(automationEnEdition.iconikFilters);

  if (indexAutomationEnEdition >= 0) autos[indexAutomationEnEdition] = automationEnEdition;
  else autos.push(automationEnEdition);

  automationsData.automations = autos;
  sauvegarderDonnees();
  afficherTousLesElements();
  mettreAJourStats();
  currentKey = newName;
  renderCanvasAutomation(newName);
}

function _saveWebhook(){
  const name = String(webhookEnEdition?.name || '').trim();
  const url  = String(webhookEnEdition?.url  || '').trim();
  if (!name) { alert("Le nom du webhook est obligatoire."); return; }
  if (!url)  { alert("L'URL du webhook est obligatoire."); return; }

  const list = webhooksData.webhooks || [];
  if (indexWebhookEnEdition >= 0) list[indexWebhookEnEdition] = webhookEnEdition;
  else list.push(webhookEnEdition);
  webhooksData.webhooks = list;

  sauvegarderDonnees();
  afficherTousLesElements();
  mettreAJourStats();

  currentKey = webhookEnEdition._wfdId || webhookEnEdition.id || webhookEnEdition.name;
  renderCanvasWebhook(currentKey);
}

function _saveCustomAction(){
  const title = String(customActionEnEdition?.title || '').trim();
  const url   = String(customActionEnEdition?.url   || '').trim();
  if (!title) { alert("Le titre de la custom action est obligatoire."); return; }
  if (!url)   { alert("L'URL de la custom action est obligatoire."); return; }

  const list = customActionsData.customActions || [];
  if (indexCustomActionEnEdition >= 0) list[indexCustomActionEnEdition] = customActionEnEdition;
  else list.push(customActionEnEdition);
  customActionsData.customActions = list;

  sauvegarderDonnees();
  afficherTousLesElements();
  mettreAJourStats();

  currentKey = customActionEnEdition._wfdId || customActionEnEdition.id || customActionEnEdition.title;
  renderCanvasCustomAction(currentKey);
}

window.saveCurrent = saveCurrent;

/* ============================ API PREVIEW OVERRIDE ======================== */
/* On override renderApiPreview pour couvrir automation + webhook + custom */
function renderApiPreview(){
  const box = document.getElementById('api-calls-container');
  const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
  if (!box) return;

  box.innerHTML = '';
  box.style.display = 'none';
  if (emptyPrev) emptyPrev.style.display = '';

  if (!currentKind) return;

  const calls = [];

  if (currentKind === 'automation' && automationEnEdition) {
    // Reprend la logique PART 2 (actions -> calls)
    const a = automationEnEdition;
    (a.actions || []).forEach((ac) => {
      if (ac.type === 'Set ACL on asset') {
        const cfg = ac.config || {};
        calls.push({ method:'POST', url:'/API/acls/v1/acl/assets/{ASSET_ID}/', body:{
          applyMode: cfg.applyMode || 'Overwrite',
          teams: cfg.teams || [],
          users: cfg.users || [],
          permissions: cfg.permissions || []
        }});
      }
      if (ac.type === 'Add to collection') {
        const cfg = ac.config || {};
        calls.push({ method:'POST', url:'/API/assets/v1/assets/{ASSET_ID}/collections/', body:{ collections: cfg.collections || [] }});
      }
      if (ac.type === 'Update metadata') {
        const cfg = ac.config || {};
        calls.push({ method:'PUT', url:'/API/metadata/v1/assets/{ASSET_ID}/', body:{ metadataView: cfg.metadataView || '', metadataFields: cfg.metadataFields || [] }});
      }
      if (ac.type === 'Custom action') {
        const cfg = ac.config || {};
        calls.push({ method:'POST', url:'/API/assets/v1/custom_actions/{CUSTOM_ACTION_ID}/run', body:{ customActionRef: cfg.customActionRef || '' }});
      }
    });
  }

  if (currentKind === 'webhook' && webhookEnEdition) {
    const w = webhookEnEdition;
    calls.push({
      method: w.id ? 'PUT' : 'POST',
      url: w.id ? `/API/notifications/v1/webhooks/${w.id}/` : '/API/notifications/v1/webhooks/',
      body: {
        name: w.name || '',
        description: w.description || '',
        url: w.url || '',
        event_type: w.eventType || 'Assets',
        realm: w.realm || 'All',
        operation: w.operation || 'All',
        object_id: w.objectId || '',
        query: w.query || '',
        headers: normalizeHeadersToArray(w.headers || [])
      }
    });
  }

  if (currentKind === 'custom' && customActionEnEdition) {
    const ca = customActionEnEdition;
    calls.push({
      method: ca.id ? 'PUT' : 'POST',
      url: ca.id ? `/API/assets/v1/custom_actions/${ca.id}/` : '/API/assets/v1/custom_actions/',
      body: {
        title: ca.title || '',
        type: ca.type || 'Post',
        context: (ca.context || 'asset').toUpperCase(),
        url: ca.url || '',
        description: ca.description || '',
        application_token_id: ca.appId || '',
        metadata_view: ca.metadataView || '',
        headers: normalizeHeadersToArray(ca.headers || [])
      }
    });
  }

  if (!calls.length) return;

  if (emptyPrev) emptyPrev.style.display = 'none';
  box.style.display = 'block';

  calls.forEach((c, i) => {
    const block = _el('div','api-call-block');

    const method = _el('div','api-method');
    method.textContent = `${c.method} #${i+1}`;
    block.appendChild(method);

    const url = _el('div','api-url');
    url.textContent = c.url;
    block.appendChild(url);

    const headers = _el('div','api-headers');
    headers.innerHTML = `
      <div class="header-line"><span class="lbl">Content-Type:</span> <span class="val">application/json</span></div>
      <div class="header-line"><span class="lbl">App-ID:</span> <span class="val">{app_id}</span></div>
      <div class="header-line"><span class="lbl">Auth-Token:</span> <span class="val">{auth_token}</span></div>
    `;
    block.appendChild(headers);

    const bodyWrap = document.createElement('details');
    bodyWrap.className = 'api-body';
    const sum = document.createElement('summary');
    sum.textContent = 'Body JSON';
    bodyWrap.appendChild(sum);
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(c.body || {}, null, 2);
    bodyWrap.appendChild(pre);
    block.appendChild(bodyWrap);

    box.appendChild(block);
  });
}
window.renderApiPreview = renderApiPreview;

/* ============================= EXPORT GLOBALS ============================ */
window.renderCanvasWebhook = renderCanvasWebhook;
window.renderCanvasCustomAction = renderCanvasCustomAction;

/* ========================================================================
   WFD — Preview API DOM-only (no innerHTML)
   Add at end of script-automations.js
   ======================================================================== */

(function(){
  function el(tag, className, text){
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (typeof text !== 'undefined') n.textContent = text;
    return n;
  }

  function headerLine(label, value){
    const line = el('div', 'header-line');
    line.appendChild(el('span', 'lbl', label));
    line.appendChild(document.createTextNode(' '));
    line.appendChild(el('span', 'val', value));
    return line;
  }

  function renderApiCallBlock(call, idx){
    const block = el('div', 'api-call-block');

    const method = el('div', 'api-method', `${call.method} #${idx+1}`);
    block.appendChild(method);

    const url = el('div', 'api-url', call.url);
    block.appendChild(url);

    const headers = el('div', 'api-headers');
    headers.appendChild(headerLine('Content-Type:', 'application/json'));
    headers.appendChild(headerLine('App-ID:', '{app_id}'));
    headers.appendChild(headerLine('Auth-Token:', '{auth_token}'));
    block.appendChild(headers);

    const details = document.createElement('details');
    details.className = 'api-body';

    const summary = document.createElement('summary');
    summary.textContent = 'Body JSON';
    details.appendChild(summary);

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(call.body || {}, null, 2);
    details.appendChild(pre);

    block.appendChild(details);
    return block;
  }

  function buildCallsForCurrentSelection(){
    const calls = [];

    // Automations
    if (window.currentKind === 'automation' && window.automationEnEdition) {
      const a = window.automationEnEdition;
      (a.actions || []).forEach(ac => {
        if (ac.type === 'Set ACL on asset') {
          const cfg = ac.config || {};
          calls.push({
            method: 'POST',
            url: '/API/acls/v1/acl/assets/{ASSET_ID}/',
            body: {
              applyMode: cfg.applyMode || 'Overwrite',
              teams: cfg.teams || [],
              users: cfg.users || [],
              permissions: cfg.permissions || []
            }
          });
        }
        if (ac.type === 'Add to collection') {
          const cfg = ac.config || {};
          calls.push({
            method: 'POST',
            url: '/API/assets/v1/assets/{ASSET_ID}/collections/',
            body: { collections: cfg.collections || [] }
          });
        }
        if (ac.type === 'Update metadata') {
          const cfg = ac.config || {};
          calls.push({
            method: 'PUT',
            url: '/API/metadata/v1/assets/{ASSET_ID}/',
            body: {
              metadataView: cfg.metadataView || '',
              metadataFields: cfg.metadataFields || []
            }
          });
        }
        if (ac.type === 'Custom action') {
          const cfg = ac.config || {};
          calls.push({
            method: 'POST',
            url: '/API/assets/v1/custom_actions/{CUSTOM_ACTION_ID}/run',
            body: { customActionRef: cfg.customActionRef || '' }
          });
        }
      });
    }

    // Webhooks
    if (window.currentKind === 'webhook' && window.webhookEnEdition) {
      const w = window.webhookEnEdition;
      calls.push({
        method: w.id ? 'PUT' : 'POST',
        url: w.id ? `/API/notifications/v1/webhooks/${w.id}/` : '/API/notifications/v1/webhooks/',
        body: {
          name: w.name || '',
          description: w.description || '',
          url: w.url || '',
          event_type: w.eventType || 'Assets',
          realm: w.realm || 'All',
          operation: w.operation || 'All',
          object_id: w.objectId || '',
          query: w.query || '',
          headers: window.normalizeHeadersToArray ? window.normalizeHeadersToArray(w.headers || []) : (w.headers || [])
        }
      });
    }

    // Custom Actions
    if (window.currentKind === 'custom' && window.customActionEnEdition) {
      const ca = window.customActionEnEdition;
      calls.push({
        method: ca.id ? 'PUT' : 'POST',
        url: ca.id ? `/API/assets/v1/custom_actions/${ca.id}/` : '/API/assets/v1/custom_actions/',
        body: {
          title: ca.title || '',
          type: ca.type || 'Post',
          context: (ca.context || 'asset').toUpperCase(),
          url: ca.url || '',
          description: ca.description || '',
          application_token_id: ca.appId || '',
          metadata_view: ca.metadataView || '',
          headers: window.normalizeHeadersToArray ? window.normalizeHeadersToArray(ca.headers || []) : (ca.headers || [])
        }
      });
    }

    return calls;
  }

  function renderApiPreviewDom(){
    const box = document.getElementById('api-calls-container');
    const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
    if (!box) return;

    // vider sans innerHTML
    box.replaceChildren();
    box.style.display = 'none';
    if (emptyPrev) emptyPrev.style.display = '';

    if (!window.currentKind) return;

    const calls = buildCallsForCurrentSelection();
    if (!calls.length) return;

    if (emptyPrev) emptyPrev.style.display = 'none';
    box.style.display = 'block';

    calls.forEach((call, i) => box.appendChild(renderApiCallBlock(call, i)));
  }

  // Override propre
  window.renderApiPreview = renderApiPreviewDom;
})();

/* ========================================================================
   Stats override: actifs/inactifs + parse état (active/enabled/status)
   ======================================================================== */
(function(){
  function parseActiveStatus(obj){
    // bool direct
    if (typeof obj?.active === 'boolean')  return obj.active;
    if (typeof obj?.enabled === 'boolean') return obj.enabled;

    // chaine / numérique
    const s = String(obj?.status ?? obj?.state ?? '').trim().toLowerCase();
    if (s === 'active' || s === 'enabled' || s === 'on' || s === 'true')   return true;
    if (s === 'inactive' || s === 'disabled' || s === 'off' || s === 'false') return false;

    // inconnu (synchro n'a pas ramené l'info)
    return null;
  }
  function countActiveInactive(list){
    let a = 0, i = 0;
    (list || []).forEach(o => {
      const st = parseActiveStatus(o);
      if (st === true)  a++;
      if (st === false) i++;
    });
    return [a, i];
  }

  // Override de la fonction stats (appelée au chargement et après sauvegarde)
  window.mettreAJourStats = function(){
    const [aA, aI] = countActiveInactive(automationsData.automations);
    const [wA, wI] = countActiveInactive(webhooksData.webhooks);
    const [cA, cI] = countActiveInactive(customActionsData.customActions);

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = String(v); };

    set('statAutomationsActive',   aA); set('statAutomationsInactive',   aI);
    set('statWebhooksActive',      wA); set('statWebhooksInactive',      wI);
    set('statCustomActionsActive', cA); set('statCustomActionsInactive', cI);
  };
})();

/* ========================================================================
   Delete current entity (automation / webhook / custom)
   ======================================================================== */
function deleteCurrent(){
  if (!confirm('Supprimer cet élément ?')) return;

  if (currentKind === 'automation') {
    if (indexAutomationEnEdition >= 0) {
      automationsData.automations.splice(indexAutomationEnEdition, 1);
    }
  } else if (currentKind === 'webhook') {
    if (indexWebhookEnEdition >= 0) {
      webhooksData.webhooks.splice(indexWebhookEnEdition, 1);
    }
  } else if (currentKind === 'custom') {
    if (indexCustomActionEnEdition >= 0) {
      customActionsData.customActions.splice(indexCustomActionEnEdition, 1);
    }
  }

  sauvegarderDonnees();
  afficherTousLesElements();
  mettreAJourStats();
  closeEditor();
}
window.deleteCurrent = deleteCurrent;

/* ========================================================================
   WFD — Draft cancel fix
   - Create adds a draft immediately (visible in list)
   - Cancel removes draft if not saved
   ======================================================================== */
(function(){
  // Id helper (already exists in Part 3, but safe fallback)
  function uid(prefix='wfd'){
    if (typeof window._wfdUid === 'function') return window._wfdUid(prefix);
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  // Track the pending draft by stable id + kind
  let pending = null; // { kind:'automation'|'webhook'|'custom', wfdId:string }

  // Helpers to find & remove draft by wfdId
  function removeDraftIfPending(){
    if (!pending) return false;

    const { kind, wfdId } = pending;
    let removed = false;

    if (kind === 'automation') {
      const list = automationsData.automations || [];
      const i = list.findIndex(a => a && a._wfdId === wfdId && a._wfdDraft === true);
      if (i >= 0) { list.splice(i, 1); removed = true; }
    } else if (kind === 'webhook') {
      const list = webhooksData.webhooks || [];
      const i = list.findIndex(w => w && w._wfdId === wfdId && w._wfdDraft === true);
      if (i >= 0) { list.splice(i, 1); removed = true; }
    } else if (kind === 'custom') {
      const list = customActionsData.customActions || [];
      const i = list.findIndex(ca => ca && ca._wfdId === wfdId && ca._wfdDraft === true);
      if (i >= 0) { list.splice(i, 1); removed = true; }
    }

    if (removed) {
      sauvegarderDonnees();
      afficherTousLesElements();
      if (typeof mettreAJourStats === 'function') mettreAJourStats();
    }

    pending = null;
    window.currentIsNew = false;
    return removed;
  }

  /* ---------- Override CREATE functions ---------- */

  const _creerAutomationPrev = window.creerAutomation;
  window.creerAutomation = function(){
    // On crée un draft immédiatement (visible)
    const wfdId = uid('au');
    const base = 'Nouvelle automation';

    // nom unique simple (évite collisions)
    const names = new Set((automationsData.automations || []).map(a => String(a?.nom || '').trim()));
    let nom = base;
    let n = 2;
    while (names.has(nom)) { nom = `${base} ${n++}`; }

    const a = { _wfdId: wfdId, _wfdDraft: true, nom, active: true, triggers: [], conditions: [], actions: [] };
    automationsData.automations = automationsData.automations || [];
    automationsData.automations.push(a);

    sauvegarderDonnees();
    afficherAutomations();
    if (typeof mettreAJourStats === 'function') mettreAJourStats();

    pending = { kind:'automation', wfdId };
    window.currentIsNew = true;
    openEditor('automation', nom);
  };

  const _creerWebhookPrev = window.creerWebhook;
  window.creerWebhook = function(){
    const wfdId = uid('wh');
    const w = {
      _wfdId: wfdId, _wfdDraft: true,
      id:'', name:'', description:'', url:'',
      eventType:'Assets', realm:'All', operation:'All',
      objectId:'', query:'', headers:[]
    };
    webhooksData.webhooks = webhooksData.webhooks || [];
    webhooksData.webhooks.push(w);

    sauvegarderDonnees();
    afficherWebhooks();
    if (typeof mettreAJourStats === 'function') mettreAJourStats();

    pending = { kind:'webhook', wfdId };
    window.currentIsNew = true;
    openEditor('webhook', wfdId);
  };

  const _creerCustomPrev = window.creerCustomAction;
  window.creerCustomAction = function(){
    const wfdId = uid('ca');
    const ca = {
      _wfdId: wfdId, _wfdDraft: true,
      id:'', title:'', context:'asset', type:'Post', url:'',
      appId:'', appName:'', metadataView:'', description:'',
      headers:[]
    };
    customActionsData.customActions = customActionsData.customActions || [];
    customActionsData.customActions.push(ca);

    sauvegarderDonnees();
    afficherCustomActions();
    if (typeof mettreAJourStats === 'function') mettreAJourStats();

    pending = { kind:'custom', wfdId };
    window.currentIsNew = true;
    openEditor('custom', wfdId);
  };

  /* ---------- Override SAVE: mark draft as saved ---------- */
  const _saveCurrentPrev = window.saveCurrent;
  window.saveCurrent = function(){
    const beforePending = pending ? { ...pending } : null;
    const res = _saveCurrentPrev();

    // Si on avait un draft pending, on le marque “non draft” après save
    if (beforePending) {
      const { kind, wfdId } = beforePending;
      if (kind === 'automation') {
        const a = (automationsData.automations || []).find(x => x && x._wfdId === wfdId);
        if (a) a._wfdDraft = false;
      } else if (kind === 'webhook') {
        const w = (webhooksData.webhooks || []).find(x => x && x._wfdId === wfdId);
        if (w) w._wfdDraft = false;
      } else if (kind === 'custom') {
        const ca = (customActionsData.customActions || []).find(x => x && x._wfdId === wfdId);
        if (ca) ca._wfdDraft = false;
      }
      sauvegarderDonnees();
      pending = null;
      window.currentIsNew = false;
    }
    return res;
  };

  /* ---------- Override CLOSE: cancel removes draft ---------- */
  const _closePrev = window.closeEditor;
  window.closeEditor = function(){
    // Si un draft est en cours, annuler = supprimer draft
    removeDraftIfPending();
    return _closePrev();
  };

})();

/* ========================================================================
   Sidebar coherence: no emoji in cassette text + status dot for webhook/custom
   ======================================================================== */
(function(){
  // Parse état : true/false/null (inconnu)
  function parseActiveStatus(obj){
    if (typeof obj?.active === 'boolean')  return obj.active;
    if (typeof obj?.enabled === 'boolean') return obj.enabled;

    const s = String(obj?.status ?? obj?.state ?? '').trim().toLowerCase();
    if (['active','enabled','on','true'].includes(s)) return true;
    if (['inactive','disabled','off','false'].includes(s)) return false;

    return null;
  }

  // Override createCassette : dot pour tous les kinds (automation/webhook/custom)
  const _createCassettePrev = window.createCassette;
  window.createCassette = function({ kind, name, title, isActive, isLocalDraft, count, onClick, raw }){
    const div = document.createElement('div');
    div.className = 'set-cassette' + (kind ? ' ' + kind : '');
    div.onclick = onClick;

    const left = document.createElement('span');
    left.className = 'set-cassette-name';

    // Déterminer dot class
    // - local draft => orange
    // - sinon si état connu => vert/rouge
    // - sinon => gris (unknown)
    let dotClass = 'unknown';
    if (isLocalDraft) dotClass = 'local';
    else {
      const st = (typeof isActive === 'boolean') ? isActive : parseActiveStatus(raw);
      if (st === true) dotClass = 'on';
      if (st === false) dotClass = 'off';
    }

    const dot = document.createElement('span');
    dot.className = 'cassette-dot ' + dotClass;
    left.appendChild(dot);

    left.appendChild(document.createTextNode(' ' + (title || name || 'Sans nom')));

    div.appendChild(left);

    if (typeof count !== 'undefined') {
      const right = document.createElement('span');
      right.className = 'set-cassette-cnt';
      right.textContent = String(count ?? '');
      div.appendChild(right);
    }

    return div;
  };

  // Override afficherWebhooks : supprimer l’emoji dans le titre (on garde l’emoji dans le header de section HTML)
  window.afficherWebhooks = function(){
    const container = document.getElementById('webhooks-list');
    if (!container) return;
    const list = webhooksData.webhooks || [];
    container.innerHTML = '';

    if (!list.length){
      container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucun webhook</div>';
      return;
    }

    const sorted = [...list].sort((a,b) => (a?.name||'').localeCompare(b?.name||'','fr',{sensitivity:'base'}));
    sorted.forEach(w => {
      const key = w?._wfdId || w?.id || w?.name || '';
      const isLocal = !w?.id && w?._wfdDraft === true; // orange uniquement si draft

      const node = window.createCassette({
        kind: 'webhook',
        name: w?.name,
        title: (w?.name || 'Sans nom'),
        isLocalDraft: !!isLocal,
        raw: w,
        onClick: () => openEditor('webhook', key)
      });

      container.appendChild(node);
    });
  };

  // Override afficherCustomActions : supprimer l’emoji dans le titre
  window.afficherCustomActions = function(){
    const container = document.getElementById('custom-actions-list');
    if (!container) return;
    const list = customActionsData.customActions || [];
    container.innerHTML = '';

    if (!list.length){
      container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:11px;">Aucune custom action</div>';
      return;
    }

    const sorted = [...list].sort((a,b) => (a?.title||'').localeCompare(b?.title||'','fr',{sensitivity:'base'}));
    sorted.forEach(ca => {
      const key = ca?._wfdId || ca?.id || ca?.title || '';
      const isLocal = !ca?.id && ca?._wfdDraft === true;

      const node = window.createCassette({
        kind: 'custom',
        name: ca?.title,
        title: (ca?.title || 'Sans titre'),
        isLocalDraft: !!isLocal,
        raw: ca,
        onClick: () => openEditor('custom', key)
      });

      container.appendChild(node);
    });
  };

  // Re-render sidebar now (optional)
  try { window.afficherTousLesElements && window.afficherTousLesElements(); } catch {}
})();

/* ========================================================================
   EXTENSION CATALOGUE — Triggers & Actions (Iconik coverage)
   - Add missing trigger: Asset has new version
   - Expand action list (baseline)
   ======================================================================== */
(function(){
  // --- Trigger: Asset has new version (slug à confirmer si besoin)
  if (!TRIGGERS_ICONIK['asset.has_new_version']) {
    TRIGGERS_ICONIK['asset.has_new_version'] = {
      label: 'Asset has new version',
      fields: [] // à compléter dès que tu m’envoies la capture des champs (si il y en a)
    };
  }

  // --- Actions: étendre la liste (champs à compléter avec tes captures)
  // NOTE: on garde le format { label, fields } compatible avec notre renderer.
  const ADD = (key, label, fields) => {
    if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label, fields: fields || [] };
  };

  ADD('Analyze asset', 'Analyze asset', [
    { id:'forceAnalysis', label:'Force analysis', type:'checkbox' },
    { id:'analysisMode', label:'Mode', type:'select', options:['Overwrite','Append'], conditional:'forceAnalysis=true' }
  ]);

  ADD('Archive asset', 'Archive asset', [
    { id:'archiveStorage', label:'Archive storage', type:'select-storages' },
    { id:'preferredSourceStorage', label:'Preferred source storage', type:'select-storages' },
    { id:'useCurrentPath', label:'Use current path', type:'checkbox' },
    { id:'deleteAfterArchive', label:'Delete after archive', type:'checkbox' },
    { id:'allowTransfersThroughIconik', label:'Allow transfers through Iconik', type:'checkbox' }
  ]);

  ADD('Create share', 'Create share', [
    { id:'users', label:'Users or e-mails', type:'text', placeholder:'Not selected' },
    { id:'customTitle', label:'Custom title', type:'text' },
    { id:'message', label:'Message', type:'textarea' },
    { id:'expiresInDays', label:'Expires in days', type:'text', placeholder:'60' },
    { id:'allowDownload', label:'Allow Download', type:'checkbox' },
    { id:'allowDownloadProxy', label:'Allow Download Proxy', type:'checkbox' },
    { id:'allowUpload', label:'Allow Upload', type:'checkbox' },
    { id:'setPassword', label:'Set password', type:'text' }
  ]);

  ADD('Delete asset', 'Delete asset', []);

  ADD('Delete file set', 'Delete file set', [
    { id:'storage', label:'Delete from storage', type:'select-storages' },
    { id:'formatToDelete', label:'Format to delete', type:'text', placeholder:'e.g., ORIGINAL' }
  ]);

  ADD('Export asset', 'Export asset', [
    { id:'exportLocation', label:'Export Location', type:'select-export-locations' },
    { id:'preferredSourceStorage', label:'Preferred Source Storage', type:'select-storages' },
    { id:'createFolderForAsset', label:'Create folder for asset', type:'checkbox' },
    { id:'overwriteExisting', label:'Overwrite existing', type:'checkbox' }
  ]);

  // “Restrict asset” apparaît chez toi : champs à confirmer avec capture
  ADD('Restrict asset', 'Restrict asset', [
    { id:'blockingField', label:'Blocking Field', type:'select-metadata' },
    { id:'warningField', label:'Warning Field', type:'select-metadata' }
  ]);

  ADD('Remove restriction', 'Remove restriction', [
    { id:'blockingField', label:'Blocking Field', type:'select-metadata' },
    { id:'warningField', label:'Warning Field', type:'select-metadata' }
  ]);

  ADD('Request original', 'Request original', []);

  ADD('Request review', 'Request review', [
    { id:'users', label:'Users or e-mails', type:'text', placeholder:'Not selected' },
    { id:'requireApprovalFromAll', label:'Require approval from all reviewers', type:'checkbox' },
    { id:'customTitle', label:'Custom title', type:'text' },
    { id:'message', label:'Message', type:'textarea' },
    { id:'expiresInDays', label:'Expires in days', type:'text', placeholder:'60' }
  ]);

  ADD('Restore asset', 'Restore asset', [
    { id:'destinationStorage', label:'Destination Storage', type:'select-storages' },
    { id:'preferredSourceStorage', label:'Preferred source storage', type:'select-storages' },
    { id:'useCurrentPath', label:'Use current path', type:'checkbox' },
    { id:'allowTransfersThroughIconik', label:'Allow transfers through Iconik', type:'checkbox' }
  ]);

  ADD('Run Face Recognition', 'Run Face Recognition', [
    { id:'forceRerun', label:'Force re-run', type:'checkbox' }
  ]);

  ADD('Transcode asset', 'Transcode asset', [
    { id:'transcodeLocation', label:'Preferred transcode location', type:'radio', options:['Cloud','ISG'] }
  ]);

  ADD('Transcribe asset', 'Transcribe asset', [
    { id:'language', label:'Language', type:'select', options:[
      '(Autodetect)','en-US','fr-FR','de-DE','es-ES','it-IT','pt-PT','nl-NL','ja-JP','zh-CN',
      'ar-SA','da-DK','fi-FI','ko-KR','nb-NO','pl-PL','ru-RU','sv-SE','tr-TR'
    ] },
    { id:'translateTo', label:'Translate to', type:'chips-enum', options:['English','French','German','Spanish','Italian','Portuguese','Dutch','Japanese','Chinese','Arabic'] },
    { id:'overwrite', label:'Overwrite', type:'checkbox' }
    ]);

  ADD('Transfer asset', 'Transfer asset', [
    { id:'destinationStorage', label:'Destination', type:'select-storages' },
    { id:'useCurrentPath', label:'Use current path', type:'checkbox' },
    { id:'allowTransfersThroughIconik', label:'Allow transfers through Iconik', type:'checkbox' }
  ]);

  // Conserve ceux déjà présents (Set ACL, Update metadata, Add to collection, Custom action, etc.)
  console.log('[WFD] Catalogue étendu:', {
    triggers: Object.keys(TRIGGERS_ICONIK).length,
    actions: Object.keys(ACTIONS_ICONIK).length
  });
})();

/* ========================================================================
   Field renderer extensions: select-storages (single) + radio + chips-enum
   ======================================================================== */
(function(){
  const _prev = _renderFieldControl;

  function storageNames(){
    return (storagesData.storages || [])
      .map(s => (s.nom || s.name || s))
      .filter(Boolean)
      .sort((a,b)=>String(a).localeCompare(String(b),'fr',{sensitivity:'base'}));
  }

  _renderFieldControl = function(ctx, idx, cfg, f){

    // ---------------- select-storages (single) ----------------
    if (f.type === 'select-storages') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      if (f.label) {
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = f.label;
        wrap.appendChild(l);
      }

      const sel = document.createElement('select');
      sel.className = 'field-select';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '-- Sélectionnez --';
      sel.appendChild(opt0);

      storageNames().forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        sel.appendChild(o);
      });

      sel.value = cfg[f.id] || '';
      sel.addEventListener('change', () => {
        cfg[f.id] = sel.value;
        renderApiPreview();
      });

      wrap.appendChild(sel);
      return wrap;
    }

    // ---------------- radio ----------------
    if (f.type === 'radio') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      if (f.label) {
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = f.label;
        wrap.appendChild(l);
      }

      const box = document.createElement('div');
      box.style.display = 'flex';
      box.style.flexWrap = 'wrap';
      box.style.gap = '10px';

      (f.options || []).forEach(opt => {
        const line = document.createElement('label');
        line.className = 'field-checkbox';

        const rb = document.createElement('input');
        rb.type = 'radio';
        rb.name = `${ctx}-${idx}-${f.id}`;
        rb.value = opt;
        rb.checked = (cfg[f.id] === opt);

        rb.addEventListener('change', () => {
          if (rb.checked) {
            cfg[f.id] = opt;
            renderApiPreview();
          }
        });

        line.appendChild(rb);

        const sp = document.createElement('span');
        sp.textContent = opt;
        line.appendChild(sp);

        box.appendChild(line);
      });

      wrap.appendChild(box);
      return wrap;
    }

    // ---------------- chips-enum (strict, Iconik-like) ----------------
    // - multi selection displayed as chips (× remove)
    // - add via dropdown filtered by search (NO free typing)
    if (f.type === 'chips-enum') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      if (f.label) {
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = f.label;
        wrap.appendChild(l);
      }

      const optionsAll = Array.isArray(f.options) ? f.options.slice() : [];
      const ensureArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
      const uniq = (arr) => Array.from(new Set(ensureArray(arr).map(x => String(x))));

      cfg[f.id] = uniq(cfg[f.id]);

      const search = document.createElement('input');
      search.type = 'text';
      search.className = 'field-input';
      search.placeholder = 'Search…';
      wrap.appendChild(search);

      const sel = document.createElement('select');
      sel.className = 'field-select';
      wrap.appendChild(sel);

      const tags = document.createElement('div');
      tags.className = 'chips-tags';
      wrap.appendChild(tags);

      function rebuildSelect(){
        const q = String(search.value || '').trim().toLowerCase();
        const filtered = q
          ? optionsAll.filter(o => String(o).toLowerCase().includes(q))
          : optionsAll;

        sel.replaceChildren();

        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '-- Select --';
        sel.appendChild(opt0);

        filtered.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          sel.appendChild(opt);
        });
      }

      function redrawChips(){
        const state = ensureArray(cfg[f.id]);
        tags.replaceChildren();

        state.forEach(val => {
          const chip = document.createElement('span');
          chip.className = 'chips-tag enum';

          const txt = document.createElement('span');
          txt.className = 'chips-tag-text';
          txt.textContent = String(val);
          chip.appendChild(txt);

          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'chips-tag-del';
          del.textContent = '×';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            cfg[f.id] = ensureArray(cfg[f.id]).filter(x => String(x) !== String(val));
            redrawChips();
            renderApiPreview();
          });

          chip.appendChild(del);
          tags.appendChild(chip);
        });
      }

      sel.addEventListener('change', () => {
        const v = sel.value;
        if (!v) return;
        cfg[f.id] = uniq(ensureArray(cfg[f.id]).concat([v]));
        sel.value = '';
        redrawChips();
        renderApiPreview();
      });

      search.addEventListener('input', rebuildSelect);

      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const q = String(search.value || '').trim().toLowerCase();
        if (!q) return;

        const hits = optionsAll.filter(o => String(o).toLowerCase().includes(q));
        if (hits.length === 1) {
          cfg[f.id] = uniq(ensureArray(cfg[f.id]).concat([hits[0]]));
          search.value = '';
          rebuildSelect();
          redrawChips();
          renderApiPreview();
        }
      });

      rebuildSelect();
      redrawChips();
      return wrap;
    }

    // fallback -> existing renderer
    return _prev(ctx, idx, cfg, f);
  };

  console.log('[WFD] Field renderer extensions installed: select-storages, radio, chips-enum');
})();

/* ========================================================================
   Collections Tree Picker (mode B: parents + leaves) — DOM-only
   - Replaces field type: select-collections-multi
   - Stores config[fid] as array of { id, path, name }  (Format C)
   ======================================================================== */
(function(){
  // --- UI state per picker instance (keeps expand/search across re-renders)
  const treeUI = window.__wfdTreeUI || (window.__wfdTreeUI = Object.create(null));

  // --- Build hierarchy from collectionsData.collections
  function buildCollectionsHierarchy(){
    const rows = Array.isArray(collectionsData?.collections) ? collectionsData.collections : [];
    const byId = Object.create(null);
    const children = Object.create(null);

    function getId(r){
      return r && typeof r === 'object'
        ? (r.id || r.uid || r.uuid || r.collection_id || r.nom || r.name || r.title || '')
        : String(r || '');
    }
    function getName(r){
      return r && typeof r === 'object'
        ? (r.name || r.nom || r.title || r.id || '')
        : String(r || '');
    }
    function getParentId(r){
      return r && typeof r === 'object'
        ? (r.parent_id || r.parentId || r.parent || r.parent_uuid || '')
        : '';
    }

    rows.forEach(r => {
      const id = getId(r);
      if (!id) return;
      const pid = getParentId(r);
      const name = getName(r);
      byId[id] = { id, pid, name, raw: r };
      if (!children[pid]) children[pid] = [];
      children[pid].push(id);
    });

    // roots = nodes whose pid is empty or missing
    const roots = [];
    Object.keys(byId).forEach(id => {
      const pid = byId[id].pid;
      if (!pid || !byId[pid]) roots.push(id);
    });

    // compute path (best-effort)
    const pathById = Object.create(null);
    const visiting = new Set();
    function computePath(id){
      if (!id || !byId[id]) return '';
      if (pathById[id]) return pathById[id];
      if (visiting.has(id)) return '/' + (byId[id].name || id); // cycle protection
      visiting.add(id);

      const n = byId[id];
      const parentPath = (n.pid && byId[n.pid]) ? computePath(n.pid) : '';
      const self = n.name || id;
      const p = parentPath ? `${parentPath} / ${self}` : self;
      pathById[id] = p;

      visiting.delete(id);
      return p;
    }
    Object.keys(byId).forEach(computePath);

    // sort children by name
    Object.keys(children).forEach(pid => {
      children[pid].sort((a,b) => (byId[a]?.name||'').localeCompare(byId[b]?.name||'','fr',{sensitivity:'base'}));
    });

    return { byId, children, roots, pathById };
  }

  // --- Normalize config.collections to Format C [{id,path,name}]
  function normalizeSelectedCollections(value, H){
    const arr = Array.isArray(value) ? value : (value ? [value] : []);
    const out = [];
    const seen = new Set();

    arr.forEach(v => {
      // already format C
      if (v && typeof v === 'object' && (v.id || v.path || v.name)) {
        const id = String(v.id || '');
        const path = String(v.path || '');
        const name = String(v.name || '');
        const key = id || path || name;
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({ id, path, name });
        return;
      }

      // string: could be id, name or path
      const s = String(v || '').trim();
      if (!s) return;

      // try id match
      if (H.byId[s]) {
        const id = s;
        const name = H.byId[id].name || id;
        const path = H.pathById[id] || name;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({ id, path, name });
        }
        return;
      }

      // try path/name match (case-insensitive)
      const low = s.toLowerCase();
      const foundId = Object.keys(H.byId).find(id => {
        const name = (H.byId[id].name || '').toLowerCase();
        const path = (H.pathById[id] || '').toLowerCase();
        return name === low || path === low;
      });

      if (foundId) {
        const id = foundId;
        const name = H.byId[id].name || id;
        const path = H.pathById[id] || name;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({ id, path, name });
        }
        return;
      }

      // unresolved fallback (keep as name/path, no id)
      if (!seen.has(s)) {
        seen.add(s);
        out.push({ id: '', path: s, name: s });
      }
    });

    return out;
  }

  // --- Build tags area
  function renderTags(tagsEl, selected, onRemove){
    tagsEl.replaceChildren();
    selected.forEach((it) => {
      const chip = document.createElement('span');
      chip.className = 'tree-tag' + (!it.id ? ' unresolved' : '');
      const txt = document.createElement('span');
      txt.className = 'tree-tag-text';
      txt.textContent = it.path || it.name || it.id || '';
      chip.appendChild(txt);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tree-tag-del';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(it);
      });
      chip.appendChild(del);

      tagsEl.appendChild(chip);
    });
  }

  // --- Render tree rows
  function renderTree(scrollEl, H, ui, selected, onToggleSelect){
    scrollEl.replaceChildren();

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    const selectedIds = new Set(selected.filter(x => x.id).map(x => x.id));

    // filter: show nodes matching query OR ancestors of matches
    const q = (ui.query || '').trim().toLowerCase();
    const visible = new Set();
    const forceOpen = new Set();

    if (q) {
      Object.keys(H.byId).forEach(id => {
        const name = (H.byId[id].name || '').toLowerCase();
        const path = (H.pathById[id] || '').toLowerCase();
        if (name.includes(q) || path.includes(q)) {
          // mark self and all ancestors visible + open
          let cur = id;
          while (cur && H.byId[cur]) {
            visible.add(cur);
            const pid = H.byId[cur].pid;
            if (pid && H.byId[pid]) {
              forceOpen.add(pid);
              cur = pid;
            } else break;
          }
          // also mark children visible to allow picking under match (optional)
          visible.add(id);
        }
      });
    }

    function makeRow(id, depth){
      const li = document.createElement('li');

      const row = document.createElement('div');
      row.className = 'tree-row tree-depth-' + Math.min(depth, 5) + (selectedIds.has(id) ? ' selected' : '');
      if (q && !visible.has(id)) row.classList.add('hidden');

      // indent
      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      row.appendChild(indent);

      const kids = H.children[id] || [];
      const isOpen = ui.expanded.has(id) || forceOpen.has(id);
      const hasKids = kids.length > 0;

      const caret = document.createElement('span');
      caret.className = 'tree-caret';
      caret.textContent = hasKids ? (isOpen ? '▾' : '▸') : '•';
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hasKids) return;
        if (ui.expanded.has(id)) ui.expanded.delete(id);
        else ui.expanded.add(id);
        renderTree(scrollEl, H, ui, selected, onToggleSelect);
      });
      row.appendChild(caret);

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = hasKids ? '📁' : '📄';
      row.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'tree-label';
      label.title = H.pathById[id] || H.byId[id].name || id;
      label.textContent = H.byId[id].name || id;
      row.appendChild(label);

      // Click row toggles selection (mode B: parents+leaves)
      row.addEventListener('click', () => onToggleSelect(id));

      li.appendChild(row);

      // children
      if (hasKids && isOpen) {
        kids.forEach(childId => li.appendChild(makeRow(childId, depth+1)));
      }

      return li;
    }

    // render roots
    (H.roots || []).forEach(rootId => {
      ul.appendChild(makeRow(rootId, 0));
    });

    scrollEl.appendChild(ul);
  }

  // --- Tree picker widget factory
  function renderCollectionsPicker(cfg, fid, instanceKey){
    const H = buildCollectionsHierarchy();
    const ui = treeUI[instanceKey] || (treeUI[instanceKey] = { query:'', expanded:new Set() });

    // normalize selection to format C
    cfg[fid] = normalizeSelectedCollections(cfg[fid], H);

    const root = document.createElement('div');
    root.className = 'tree-picker';

    // search
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'tree-picker-search';
    search.placeholder = 'Search...';
    search.value = ui.query || '';
    search.addEventListener('input', () => {
      ui.query = search.value;
      renderTree(scroll, H, ui, cfg[fid], toggleSelect);
    });
    root.appendChild(search);

    // tags
    const tags = document.createElement('div');
    tags.className = 'tree-picker-tags';
    root.appendChild(tags);

    // scroll area
    const scroll = document.createElement('div');
    scroll.className = 'tree-picker-scroll';
    root.appendChild(scroll);

    // hint
    const hint = document.createElement('div');
    hint.className = 'tree-picker-hint';
    hint.textContent = 'Sélectionnez une ou plusieurs collections (parents et feuilles).';
    root.appendChild(hint);

    function syncTags(){
      renderTags(tags, cfg[fid], (it) => {
        cfg[fid] = (cfg[fid] || []).filter(x => (x.id ? x.id !== it.id : (x.path || x.name) !== (it.path || it.name)));
        renderTree(scroll, H, ui, cfg[fid], toggleSelect);
        renderApiPreview();
      });
    }

    function toggleSelect(id){
      const name = H.byId[id]?.name || id;
      const path = H.pathById[id] || name;

      const cur = cfg[fid] || [];
      const exists = cur.some(x => x.id === id);
      if (exists) {
        cfg[fid] = cur.filter(x => x.id !== id);
      } else {
        cfg[fid] = cur.concat([{ id, path, name }]);
      }

      syncTags();
      renderTree(scroll, H, ui, cfg[fid], toggleSelect);
      renderApiPreview();
    }

    syncTags();
    renderTree(scroll, H, ui, cfg[fid], toggleSelect);

    return root;
  }

  // --- Override field renderer for select-collections-multi
  const prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    if (f.type === 'select-collections-multi') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const l = document.createElement('label');
      l.className = 'field-label';
      l.textContent = f.label || 'Collections';
      wrap.appendChild(l);

      const instanceKey = `${ctx}__${idx}__${f.id || 'collections'}`;
      wrap.appendChild(renderCollectionsPicker(cfg, f.id, instanceKey));

      return wrap;
    }
    return prev(ctx, idx, cfg, f);
  };

  console.log('[WFD] TreePicker collections installed');
})();

/* ===== Triggers: Storage selector for archived/restored/transferred ===== */
(function(){
  const addOrUpdate = (key, label) => {
    if (!TRIGGERS_ICONIK[key]) TRIGGERS_ICONIK[key] = { label, fields: [] };
    TRIGGERS_ICONIK[key].label = label;
    // Champ optionnel "Storage" (si non sélectionné -> any storage, comme Iconik)
    TRIGGERS_ICONIK[key].fields = [
      { id:'storage', label:'Storage (optional)', type:'select-storages' }
    ];
  };

  addOrUpdate('asset.archived',   'Asset is archived');
  addOrUpdate('asset.restored',   'Asset is restored');
  addOrUpdate('asset.transferred','Asset is transferred');
})();

/* ===== Metadata trigger value editor: bool/list/tags adaptive ===== */
(function(){
  // petit helper: récupérer options de liste depuis un objet metadonnée WFD (best-effort)
  function extractEnum(meta){
    if (!meta || typeof meta !== 'object') return [];
    const candidates = [
      meta.values, meta.valeurs, meta.options, meta.items, meta.enum, meta.list, meta.liste
    ];
    for (const c of candidates){
      if (Array.isArray(c)) return c.map(x => String(x?.value ?? x?.label ?? x)).filter(Boolean);
      if (typeof c === 'string') {
        // format "a;b;c" ou lignes
        const parts = c.split(/[\n;|,]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length) return parts;
      }
    }
    // parfois un objet { key:label }
    if (meta.values && typeof meta.values === 'object' && !Array.isArray(meta.values)) {
      return Object.values(meta.values).map(x => String(x)).filter(Boolean);
    }
    return [];
  }

  function metaType(meta){
    const t = String(meta?.type ?? meta?.field_type ?? meta?.fieldType ?? '').toLowerCase();
    if (!t) return '';
    if (t.includes('yes') || t.includes('no') || t.includes('bool')) return 'bool';
    if (t.includes('list') || t.includes('enum') || t.includes('choice')) return 'list';
    if (t.includes('tag')) return 'tags';
    return t;
  }

  // Chips editor (tags) — DOM-only, utilise les classes .tree-tag du CSS
  function renderTagsEditor(currentArr, onChange){
    const wrap = document.createElement('div');

    const tagsBox = document.createElement('div');
    tagsBox.className = 'tree-picker-tags'; // réutilise le style tags existant
    wrap.appendChild(tagsBox);

    function redraw(){
      tagsBox.replaceChildren();
      (currentArr || []).forEach((tag, idx) => {
        const chip = document.createElement('span');
        chip.className = 'tree-tag';
        const txt = document.createElement('span');
        txt.className = 'tree-tag-text';
        txt.textContent = tag;
        chip.appendChild(txt);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tree-tag-del';
        del.textContent = '×';
        del.addEventListener('click', () => {
          currentArr.splice(idx, 1);
          onChange([...currentArr]);
          redraw();
        });
        chip.appendChild(del);

        tagsBox.appendChild(chip);
      });
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-picker-search';
    input.placeholder = ALLOW_FREE_REFERENTIAL_INPUTS ? 'Add tag then Enter…' : '(strict mode)';
    input.disabled = !ALLOW_FREE_REFERENTIAL_INPUTS;

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      if (!currentArr.includes(v)) currentArr.push(v);
      onChange([...currentArr]);
      input.value = '';
      redraw();
    });

    wrap.appendChild(input);
    redraw();
    return wrap;
  }

  // Override meta-value-input rendering only
  const _prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    if (f.type !== 'meta-value-input') return _prev(ctx, idx, cfg, f);

    const wrap = document.createElement('div');
    wrap.className = 'form-group';

    const lab = document.createElement('label');
    lab.className = 'field-label';
    lab.textContent = f.label || 'Value changed to';
    wrap.appendChild(lab);

    const metaName = String(cfg.metadataField || '').trim();
    const meta = (metadonneesData.metadonnees || []).find(m => (m.nom || m.name) === metaName);
    const t = metaType(meta);

    // BOOL → select true/false
    if (t === 'bool') {
      const sel = document.createElement('select');
      sel.className = 'field-select';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Not selected';
      sel.appendChild(opt0);

      ['true','false'].forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });

      sel.value = String(cfg[f.id] ?? '');
      sel.addEventListener('change', () => { cfg[f.id] = sel.value; renderApiPreview(); });
      wrap.appendChild(sel);
      return wrap;
    }

    // LIST → dropdown with enum values
    if (t === 'list') {
      const values = extractEnum(meta);
      const sel = document.createElement('select');
      sel.className = 'field-select';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Not selected';
      sel.appendChild(opt0);

      values.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });

      sel.value = String(cfg[f.id] ?? '');
      sel.addEventListener('change', () => { cfg[f.id] = sel.value; renderApiPreview(); });
      wrap.appendChild(sel);

      return wrap;
    }

    // TAGS → chips editor
    if (t === 'tags') {
      const cur = cfg[f.id];
      const arr = Array.isArray(cur) ? [...cur] : (cur ? [String(cur)] : []);
      const editor = renderTagsEditor(arr, (next) => {
        cfg[f.id] = next;   // stocker array
        renderApiPreview();
      });
      wrap.appendChild(editor);
      return wrap;
    }

    // DEFAULT → text input
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'field-input';
    inp.value = String(cfg[f.id] ?? '');
    inp.addEventListener('input', () => { cfg[f.id] = inp.value; renderApiPreview(); });
    wrap.appendChild(inp);
    return wrap;
  };
})();

/* ===== Trigger: Subtitle is added — Language free input (Iconik-like) ===== */
(function(){
  const key = 'subtitle.added';
  if (!TRIGGERS_ICONIK[key]) TRIGGERS_ICONIK[key] = { label:'Subtitle is added', fields: [] };

  TRIGGERS_ICONIK[key].label = 'Subtitle is added';
  TRIGGERS_ICONIK[key].fields = [
    { id:'language', label:'Language', type:'text', placeholder:'Not defined (ex: French, English, Arabic…)'},
    { id:'closedCaption', label:'Closed Caption', type:'select', options: ['Not defined','Yes','No'] }
  ];
})();

/* ===== Action legacy: hide "Send notification" from UI list ===== */
(function(){
  if (ACTIONS_ICONIK['Send notification']) {
    ACTIONS_ICONIK['Send notification'] = {
      ...ACTIONS_ICONIK['Send notification'],
      hidden: true,
      label: 'Send notification (legacy)'
    };
  }
})();

/* ===== Action: Analyze asset — align Iconik (Force analysis only) ===== */
(function(){
  if (!ACTIONS_ICONIK['Analyze asset']) {
    ACTIONS_ICONIK['Analyze asset'] = { label: 'Analyze asset', fields: [] };
  }
  ACTIONS_ICONIK['Analyze asset'].label = 'Analyze asset';
  ACTIONS_ICONIK['Analyze asset'].fields = [
    { id: 'forceAnalysis', label: 'Force analysis', type: 'checkbox' }
  ];
})();

/* ===== Action: Archive asset — fields aligned with Iconik (order + labels) ===== */
(function(){
  const key = 'Archive asset';
  if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label: 'Archive asset', fields: [] };

  ACTIONS_ICONIK[key].label = 'Archive asset';
  ACTIONS_ICONIK[key].fields = [
    { id:'archiveStorage', label:'Archive storage *', type:'select-storages' },
    { id:'preferredSourceStorage', label:'Preferred source storage', type:'select-storages' },
    { id:'useCurrentPath', label:'Use current path', type:'checkbox' },
    { id:'deleteAfterArchive', label:'Delete after archive', type:'checkbox' },
    { id:'allowTransfersThroughIconik', label:'Allow transfers through iconik', type:'checkbox' }
  ];
})();

/* ===== UI Hint: Archive asset "allowTransfersThroughIconik" warning ===== */
(function(){
  const prev = window._renderFieldsForAction;
  // Si _renderFieldsForAction n'est pas global, on patch via _renderFieldControl: plus safe
  const _prevField = _renderFieldControl;

  _renderFieldControl = function(ctx, idx, cfg, f){
    const node = _prevField(ctx, idx, cfg, f);
    if (ctx === 'action' && f && f.id === 'allowTransfersThroughIconik') {
      const hint = document.createElement('div');
      hint.className = 'section-hint';
      hint.textContent = 'Transferring files through iconik can potentially lead to egress costs from your storage provider and from iconik.';
      // Ajoute juste après le contrôle
      const wrap = document.createElement('div');
      wrap.appendChild(node);
      wrap.appendChild(hint);
      return wrap;
    }
    return node;
  };
})();

/* ===== Action: Create share — add Advanced options (Iconik parity) ===== */
(function(){
  const key = 'Create share';
  if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label: 'Create share', fields: [] };

  ACTIONS_ICONIK[key].label = 'Create share';
  ACTIONS_ICONIK[key].fields = [
    // Base (déjà présent dans ton ancien catalogue) [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-automations.js)
    { id:'users',        label:'Users or e-mails *', type:'text',    placeholder:'Not selected' },
    { id:'customTitle',  label:'Custom title',       type:'text' },
    { id:'message',      label:'Message',            type:'textarea' },
    { id:'expiresInDays',label:'Expires in days',    type:'text',    placeholder:'60' },
    { id:'allowDownload',     label:'Allow Download',        type:'checkbox' },
    { id:'allowDownloadProxy',label:'Allow Download Proxy',  type:'checkbox' },
    { id:'allowUpload',       label:'Upload',               type:'checkbox' },
    { id:'setPassword',       label:'Set password',         type:'text' },

    // Advanced (nouveau)
    { type:'section-header', label:'Advanced' },

    { type:'sub-header', label:'Modify' },
    { id:'enableCustomActions', label:'Custom Actions', type:'checkbox' },

    { type:'sub-header', label:'Review & Approve' },
    { id:'enableComments',        label:'Comments',         type:'checkbox' },
    { id:'enableApproveComments', label:'Approve Comments', type:'checkbox' },
    { id:'enableViewVersions',    label:'View Versions',    type:'checkbox' },

    { type:'sub-header', label:'View' },
    { id:'enableTranscriptions', label:'Transcriptions', type:'checkbox' },
    { id:'enableWatermark',      label:'Watermark',      type:'checkbox' },

    { type:'sub-header', label:'Assets metadata' },
    { id:'assetsMetadataView', label:'Select View', type:'select-mdviews' }
  ];
})();

/* ===== Renderer support: section-header & sub-header (no inline style) ===== */
(function(){
  const prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    if (f.type === 'section-header') {
      const d = document.createElement('div');
      d.className = 'field-label';
      d.textContent = String(f.label || '').toUpperCase();
      return d;
    }
    if (f.type === 'sub-header') {
      const d = document.createElement('div');
      d.className = 'section-hint';
      d.textContent = String(f.label || '');
      return d;
    }
    return prev(ctx, idx, cfg, f);
  };
})();

/* ===== Action: Request review — add Advanced options (Iconik parity) ===== */
(function(){
  const key = 'Request review';
  if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label: 'Request review', fields: [] };

  ACTIONS_ICONIK[key].label = 'Request review';
  ACTIONS_ICONIK[key].fields = [
    // Base (déjà présent dans le catalogue initial WFD)
    { id:'users', label:'Users or e-mails *', type:'text', placeholder:'Not selected' },
    { id:'requireApprovalFromAll', label:'Require approval from all reviewers', type:'checkbox' },
    { id:'customTitle', label:'Custom title', type:'text' },
    { id:'message', label:'Message', type:'textarea' },
    { id:'expiresInDays', label:'Expires in days', type:'text', placeholder:'60' },

    // (Optionnel) Ces 4 champs apparaissent sur ta capture Iconik pour Request review
    { id:'allowDownload',      label:'Allow Download',       type:'checkbox' },
    { id:'allowDownloadProxy', label:'Download Proxy',       type:'checkbox' },
    { id:'allowUpload',        label:'Upload',              type:'checkbox' },
    { id:'setPassword',        label:'Set password',        type:'text' },

    // Advanced (comme Create share)
    { type:'section-header', label:'Advanced' },

    { type:'sub-header', label:'Modify' },
    { id:'enableCustomActions', label:'Custom Actions', type:'checkbox' },

    { type:'sub-header', label:'Review & Approve' },
    { id:'enableComments',        label:'Comments',         type:'checkbox' },
    { id:'enableApproveComments', label:'Approve Comments', type:'checkbox' },
    
    { type:'sub-header', label:'View' },
    { id:'enableTranscriptions', label:'Transcriptions', type:'checkbox' },
    { id:'enableWatermark',      label:'Watermark',      type:'checkbox' },

    { type:'sub-header', label:'Assets metadata' },
    { id:'assetsMetadataView', label:'Select View', type:'select-mdviews' }
  ];
})();

/* ========================================================================
   Set ACL on asset — Iconik-like UI (dropdown + chips), id-if-possible
   - Apply mode: radio Append/Overwrite
   - Users/Teams: dropdown adds chips
   - Permissions: chips
   ======================================================================== */
(function(){
  /* ---------- 1) Catalogue: Set ACL on asset (align Iconik layout) -------- */
  (function(){
    const key = 'Set ACL on asset';
    if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label:'Set ACL on asset', fields: [] };

    ACTIONS_ICONIK[key].label = 'Set ACL on asset';
    ACTIONS_ICONIK[key].fields = [
      { id:'applyMode', label:'Apply mode', type:'radio', options:['Append','Overwrite'] },
      { id:'users', label:'Users', type:'chips-users' },
      { id:'teams', label:'Teams', type:'chips-teams' },
      { id:'permissions', label:'Permissions', type:'chips-perms', options:['Read','Write','Delete','Edit Access'] }
    ];
  })();

  /* ---------- 2) Helpers: options + chip rendering ----------------------- */
  function cmp(a,b){ return String(a||'').localeCompare(String(b||''),'fr',{sensitivity:'base'}); }

  function userOptions(){
    const arr = (usersData?.users || [])
      .map(u => {
        const id = u.id || u.uid || u.uuid || '';
        const email = u.email || '';
        const name = u.name || u.nom || '';
        const value = id || email || name;
        const label = name || email || id || value;
        return value ? { value, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label));
    return arr;
  }

  function teamOptions(){
    const arr = (teamsData?.teams || [])
      .map(t => {
        const id = t.id || t.uid || t.uuid || '';
        const name = t.nom || t.name || '';
        const value = id || name;
        const label = name || id || value;
        return value ? { value, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label));
    return arr;
  }

  function ensureArray(v){
    return Array.isArray(v) ? v : (v ? [v] : []);
  }

  function uniquePush(arr, val){
    if (!arr.includes(val)) arr.push(val);
    return arr;
  }

  function removeValue(arr, val){
    return arr.filter(x => String(x) !== String(val));
  }

  function resolveLabel(options, value){
    const v = String(value||'');
    const hit = options.find(o => String(o.value) === v);
    return hit ? hit.label : v;
  }

  function renderChipsPicker({ kind, options, selectedValues, onChange, placeholder }){
    const root = document.createElement('div');
    root.className = 'chips-picker';

    const row = document.createElement('div');
    row.className = 'chips-picker-row';

    const sel = document.createElement('select');
    sel.className = 'chips-picker-select';

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder || '-- Select --';
    sel.appendChild(opt0);

    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });

    row.appendChild(sel);
    root.appendChild(row);

    const tags = document.createElement('div');
    tags.className = 'chips-tags';
    root.appendChild(tags);

    function redraw(){
      tags.replaceChildren();
      (selectedValues || []).forEach(val => {
        const chip = document.createElement('span');
        chip.className = 'chips-tag ' + kind;

        const txt = document.createElement('span');
        txt.className = 'chips-tag-text';
        txt.textContent = resolveLabel(options, val);
        chip.appendChild(txt);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'chips-tag-del';
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          onChange(removeValue(selectedValues, val));
        });
        chip.appendChild(del);

        tags.appendChild(chip);
      });
    }

    sel.addEventListener('change', () => {
      const v = sel.value;
      if (!v) return;
      const next = uniquePush([...selectedValues], v);
      sel.value = '';
      onChange(next);
    });

    redraw();
    return root;
  }

  /* ---------- 3) Field renderer override for our custom types ------------ */
  const prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    // only for actions
    if (ctx !== 'action') return prev(ctx, idx, cfg, f);

    // Apply mode radio already supported by your existing renderer extension
    // but if not, we handle it here safely.
    if (f.type === 'radio' && f.id === 'applyMode') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Apply mode';
      wrap.appendChild(lab);

      const row = document.createElement('div');
      row.className = 'radio-row';

      const cur = String(cfg.applyMode || '');
      (f.options || []).forEach(opt => {
        const line = document.createElement('label');
        line.className = 'field-checkbox';

        const rb = document.createElement('input');
        rb.type = 'radio';
        rb.name = `action-${idx}-applyMode`;
        rb.value = opt;
        rb.checked = (cur === opt) || (!cur && opt === 'Append'); // default Append
        rb.addEventListener('change', () => { if (rb.checked) { cfg.applyMode = opt; renderApiPreview(); } });

        const sp = document.createElement('span');
        sp.textContent = opt;

        line.appendChild(rb);
        line.appendChild(sp);
        row.appendChild(line);
      });

      wrap.appendChild(row);

      // Optional hint (Iconik note)
      const hint = document.createElement('div');
      hint.className = 'section-hint';
      hint.textContent = '“Existing asset permissions” refers to permissions already added to the asset prior to this automation.';
      wrap.appendChild(hint);

      return wrap;
    }

    // Users chips
    if (f.type === 'chips-users') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Users';
      wrap.appendChild(lab);

      const opts = userOptions();
      const selected = ensureArray(cfg.users);

      wrap.appendChild(renderChipsPicker({
        kind: 'user',
        options: opts,
        selectedValues: selected,
        placeholder: 'Users',
        onChange: (next) => { cfg.users = next; renderApiPreview(); }
      }));

      return wrap;
    }

    // Teams chips
    if (f.type === 'chips-teams') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Teams';
      wrap.appendChild(lab);

      const opts = teamOptions();
      const selected = ensureArray(cfg.teams);

      wrap.appendChild(renderChipsPicker({
        kind: 'team',
        options: opts,
        selectedValues: selected,
        placeholder: 'Teams',
        onChange: (next) => { cfg.teams = next; renderApiPreview(); }
      }));

      return wrap;
    }

    // Permissions chips
    if (f.type === 'chips-perms') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Permissions';
      wrap.appendChild(lab);

      const opts = (f.options || []).map(p => ({ value: p, label: p }));
      const selected = ensureArray(cfg.permissions);

      wrap.appendChild(renderChipsPicker({
        kind: 'perm',
        options: opts,
        selectedValues: selected,
        placeholder: 'Permissions',
        onChange: (next) => { cfg.permissions = next; renderApiPreview(); }
      }));

      return wrap;
    }

    return prev(ctx, idx, cfg, f);
  };

  console.log('[WFD] Set ACL on asset — Iconik-like chips UI enabled');
})();

/* ========================================================================
   FIX: ACL chips do not appear after selection (redraw missing)
   - Override chips field rendering with stateful picker (redraw on change)
   ======================================================================== */
(function(){
  function cmp(a,b){ return String(a||'').localeCompare(String(b||''),'fr',{sensitivity:'base'}); }
  function ensureArray(v){ return Array.isArray(v) ? v : (v ? [v] : []); }
  function uniquePush(arr, val){ if (!arr.includes(val)) arr.push(val); return arr; }
  function removeValue(arr, val){ return arr.filter(x => String(x) !== String(val)); }

  function userOptions(){
    return (usersData?.users || [])
      .map(u => {
        const id = u.id || u.uid || u.uuid || '';
        const email = u.email || '';
        const name = u.name || u.nom || '';
        const value = id || email || name;
        const label = name || email || id || value;
        return value ? { value, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label));
  }

  function teamOptions(){
    return (teamsData?.teams || [])
      .map(t => {
        const id = t.id || t.uid || t.uuid || '';
        const name = t.nom || t.name || '';
        const value = id || name;
        const label = name || id || value;
        return value ? { value, label } : null;
      })
      .filter(Boolean)
      .sort((a,b)=>cmp(a.label,b.label));
  }

  function resolveLabel(options, value){
    const v = String(value||'');
    const hit = options.find(o => String(o.value) === v);
    return hit ? hit.label : v;
  }

  function renderChipsPickerStateful({ kind, options, getValues, setValues, placeholder }){
    const root = document.createElement('div');
    root.className = 'chips-picker';

    const row = document.createElement('div');
    row.className = 'chips-picker-row';

    const sel = document.createElement('select');
    sel.className = 'chips-picker-select';

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder || '-- Select --';
    sel.appendChild(opt0);

    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });

    row.appendChild(sel);
    root.appendChild(row);

    const tags = document.createElement('div');
    tags.className = 'chips-tags';
    root.appendChild(tags);

    // état local = miroir du cfg
    let state = ensureArray(getValues());

    function redraw(){
      // resync state from cfg (au cas où)
      state = ensureArray(getValues());
      tags.replaceChildren();

      state.forEach(val => {
        const chip = document.createElement('span');
        chip.className = 'chips-tag ' + kind;

        const txt = document.createElement('span');
        txt.className = 'chips-tag-text';
        txt.textContent = resolveLabel(options, val);
        chip.appendChild(txt);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'chips-tag-del';
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = removeValue(state, val);
          setValues(next);
          redraw();
          renderApiPreview();
        });
        chip.appendChild(del);

        tags.appendChild(chip);
      });
    }

    sel.addEventListener('change', () => {
      const v = sel.value;
      if (!v) return;
      const next = uniquePush([...state], v);
      sel.value = '';
      setValues(next);
      redraw();
      renderApiPreview();
    });

    redraw();
    return root;
  }

  // Override field renderer only for our three chip types
  const prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    if (ctx !== 'action') return prev(ctx, idx, cfg, f);

    if (f.type === 'chips-users') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Users';
      wrap.appendChild(lab);

      const opts = userOptions();
      wrap.appendChild(renderChipsPickerStateful({
        kind: 'user',
        options: opts,
        placeholder: 'Users',
        getValues: () => cfg.users,
        setValues: (next) => { cfg.users = next; }
      }));
      return wrap;
    }

    if (f.type === 'chips-teams') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Teams';
      wrap.appendChild(lab);

      const opts = teamOptions();
      wrap.appendChild(renderChipsPickerStateful({
        kind: 'team',
        options: opts,
        placeholder: 'Teams',
        getValues: () => cfg.teams,
        setValues: (next) => { cfg.teams = next; }
      }));
      return wrap;
    }

    if (f.type === 'chips-perms') {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Permissions';
      wrap.appendChild(lab);

      const opts = (f.options || []).map(p => ({ value: p, label: p }));
      wrap.appendChild(renderChipsPickerStateful({
        kind: 'perm',
        options: opts,
        placeholder: 'Permissions',
        getValues: () => cfg.permissions,
        setValues: (next) => { cfg.permissions = next; }
      }));
      return wrap;
    }

    return prev(ctx, idx, cfg, f);
  };

  console.log('[WFD] ACL chips redraw fix installed');
})();

/* ========================================================================
   Update Metadata v2 (Iconik) — Mode A (targets[])
   PART 1/2
   - Load categoriesData (SoT Settings)
   - Canonical model: config.targets[]
   - Action renderer: Update metadata -> full editor (Category, MD View, fields)
   ======================================================================== */
(function(){

  /* -------------------- 0) Load categoriesData from Settings -------------- */
  // (SoT = Settings/WFD localStorage)
  if (typeof window.categoriesData === 'undefined') {
    window.categoriesData = { categories: [] };
  }
  try {
    const s = localStorage.getItem('categoriesData');
    if (s) window.categoriesData = JSON.parse(s);
  } catch {}

  /* -------------------- 1) Helpers --------------------------------------- */
  function cmp(a,b){ return String(a||'').localeCompare(String(b||''),'fr',{sensitivity:'base'}); }

  function esc(s){ return String(s ?? ''); }

  function toType(meta){
    const t = String(meta?.type ?? meta?.field_type ?? meta?.fieldType ?? '').trim().toLowerCase();
    if (!t) return '';
    if (t.includes('tag cloud') || t.includes('tagcloud') || t.includes('tags')) return 'tagcloud';
    if (t.includes('yes') || t.includes('no') || t.includes('bool')) return 'bool';
    if (t.includes('list') || t.includes('enum') || t.includes('choice')) return 'list';
    if (t.includes('date')) return 'date';
    if (t.includes('text')) return 'text';
    return t;
  }

  function extractEnum(meta){
    if (!meta || typeof meta !== 'object') return [];
    const candidates = [
      meta.values, meta.valeurs, meta.options, meta.items, meta.enum, meta.list, meta.liste
    ];
    for (const c of candidates){
      if (Array.isArray(c)) return c.map(x => String(x?.value ?? x?.label ?? x)).filter(Boolean);
      if (typeof c === 'string') {
        const parts = c.split(/[\n;|,]+/).map(s=>s.trim()).filter(Boolean);
        if (parts.length) return parts;
      }
    }
    if (meta.values && typeof meta.values === 'object' && !Array.isArray(meta.values)) {
      return Object.values(meta.values).map(x => String(x)).filter(Boolean);
    }
    return [];
  }

  function getCategoryList(){
    const cats = (window.categoriesData?.categories || []).map(c => ({
      id: c.id || c.uid || c.uuid || '',
      name: c.nom || c.name || c.title || ''
    })).filter(c => c.name || c.id).sort((a,b)=>cmp(a.name,b.name));
    return cats;
  }

  function getViewsForCategory(catNameOrId){
    // If no categories data or no match -> return all views
    const all = (metadataViewsData?.metadataViews || []).map(v => {
      if (typeof v === 'string') return { id:'', name:v };
      return { id: v.id || '', name: v.name || v.id || '' };
    }).filter(v => v.name).sort((a,b)=>cmp(a.name,b.name));

    const cats = window.categoriesData?.categories || [];
    const key = String(catNameOrId || '').trim();
    if (!key) return all;

    const match = cats.find(c => (c.id && c.id === key) || (c.nom||c.name||'') === key);
    if (!match) return all;

    const mv = match.metadataViews || match.metadata_views || match.views || match.metadataView || match.metadata_view || [];
    const names = (Array.isArray(mv) ? mv : [mv]).map(x => (typeof x==='string'?x:(x.name||x.id||''))).filter(Boolean);
    if (!names.length) return all;

    return all.filter(v => names.includes(v.name));
  }

  function getMetasForView(viewName){
    const v = String(viewName||'').trim();
    if (!v) return [];
    const metas = (metadonneesData?.metadonnees || []).filter(m => {
      const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
      return Array.isArray(views) && views.includes(v);
    }).map(m => ({
      name: m.nom || m.name || '',
      type: m.type || m.field_type || '',
      raw: m
    })).filter(m => m.name).sort((a,b)=>cmp(a.name,b.name));
    return metas;
  }

  /* -------------------- 2) Canonical model for Update metadata ------------ */
  // config.targets[]:
  // target = { category:{id?,name?}, metadataView:{id?,name}, onlyMarked:true, fields:[{field:{id?,name},checked,value,mode?}] }

  function normalizeUpdateMetadataConfig(cfg){
    if (!cfg || typeof cfg !== 'object') cfg = {};

    // Migration from legacy fields (if present)
    // legacy: cfg.metadataView (string), cfg.metadataFields (array of names)
    if (!cfg.targets) {
      cfg.targets = [];
      if (cfg.metadataView) {
        cfg.targets.push({
          category: { id:'', name:'' },
          metadataView: { id:'', name: String(cfg.metadataView) },
          onlyMarked: true,
          fields: []
        });
      }
      // Remove legacy keys later (keep for now until saved)
    }

    if (!Array.isArray(cfg.targets)) cfg.targets = [];

    cfg.targets.forEach(t => {
      if (!t.category) t.category = { id:'', name:'' };
      if (!t.metadataView) t.metadataView = { id:'', name:'' };
      if (typeof t.onlyMarked !== 'boolean') t.onlyMarked = true;
      if (!Array.isArray(t.fields)) t.fields = [];

      // Ensure field objects shape
      t.fields = t.fields.map(f => {
        const name = f?.field?.name || f?.name || '';
        return {
          field: { id: f?.field?.id || '', name: name },
          checked: !!f?.checked,
          value: (typeof f?.value === 'undefined') ? '' : f.value,
          mode: f?.mode || null
        };
      }).filter(f => f.field.name);
    });

    return cfg;
  }

  function ensureTargetFieldsPopulated(target){
    // Populate fields list for the view (checkbox list like Iconik)
    const viewName = target?.metadataView?.name || '';
    if (!viewName) return;

    const metas = getMetasForView(viewName);
    const byName = new Map((target.fields||[]).map(f => [f.field.name, f]));
    const next = metas.map(m => {
      const existing = byName.get(m.name);
      const type = toType(m.raw);

      // Tag cloud: default mode = Append
      const defaultMode = (type === 'tagcloud') ? (existing?.mode || 'Append') : (existing?.mode || null);

      return existing ? {
        ...existing,
        mode: defaultMode
      } : {
        field: { id:'', name: m.name },
        checked: false,
        value: (type === 'tagcloud') ? [] : '',
        mode: defaultMode
      };
    });

    target.fields = next;
  }

  /* -------------------- 3) Make Update metadata action use v2 editor ------- */
  // Replace action definition to one custom field type.
  (function(){
    const key = 'Update metadata';
    if (!ACTIONS_ICONIK[key]) ACTIONS_ICONIK[key] = { label:'Update metadata', fields:[] };
    ACTIONS_ICONIK[key].label = 'Update metadata';
    ACTIONS_ICONIK[key].fields = [
      { id:'updateMetaV2', label:'Update Metadata', type:'update-metadata-v2' }
    ];
  })();

  /* -------------------- 4) UI state per action instance ------------------- */
  const uiState = window.__wfdUpdateMetaUI || (window.__wfdUpdateMetaUI = Object.create(null));
  function stateKey(actionIndex){
    // Use currentKey + actionIndex to keep state stable during re-renders
    return `${String(currentKey||'')}/action-${actionIndex}`;
  }
  function getState(actionIndex){
    const k = stateKey(actionIndex);
    if (!uiState[k]) uiState[k] = { activeTarget: 0 };
    return uiState[k];
  }

  /* -------------------- 5) DOM utilities (no innerHTML) ------------------- */
  function el(tag, cls, text){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (typeof text !== 'undefined') n.textContent = text;
    return n;
  }
  function labelSmall(text){ return el('span','um-lbl',text); }

  function selectField(options, value){
    const s = document.createElement('select');
    s.className = 'field-select';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      s.appendChild(opt);
    });
    s.value = value ?? '';
    return s;
  }

  function checkbox(checked){
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    return cb;
  }

  function tagsEditor(values, onChange){
    // Values: array of strings
    const root = el('div', null);

    const tags = el('div','tree-picker-tags');
    root.appendChild(tags);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-picker-search';
    input.placeholder = ALLOW_FREE_REFERENTIAL_INPUTS ? 'Add tag then Enter…' : '(strict mode)';
    input.disabled = !ALLOW_FREE_REFERENTIAL_INPUTS;

    function redraw(){
      tags.replaceChildren();
      (values||[]).forEach((t, idx) => {
        const chip = el('span', 'tree-tag');
        const txt = el('span','tree-tag-text', t);
        chip.appendChild(txt);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tree-tag-del';
        del.textContent = '×';
        del.addEventListener('click', () => {
          values.splice(idx,1);
          onChange([...values]);
          redraw();
        });
        chip.appendChild(del);
        tags.appendChild(chip);
      });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      if (!values.includes(v)) values.push(v);
      onChange([...values]);
      input.value = '';
      redraw();
    });

    root.appendChild(input);
    redraw();
    return root;
  }

  function renderValueControl(metaRaw, fieldObj, onChange){
    const type = toType(metaRaw);
    const v = fieldObj.value;

    // Tag Cloud -> tags editor
    if (type === 'tagcloud') {
      const arr = Array.isArray(v) ? [...v] : (v ? [String(v)] : []);
      return tagsEditor(arr, (next) => { fieldObj.value = next; onChange(); });
    }

    // Bool -> select Not selected / Yes / No
    if (type === 'bool') {
      const s = selectField(
        [{value:'',label:'Not selected'},{value:'true',label:'Yes'},{value:'false',label:'No'}],
        String(v ?? '')
      );
      s.addEventListener('change', () => { fieldObj.value = s.value; onChange(); });
      return s;
    }

    // List -> select options
    if (type === 'list') {
      const opts = extractEnum(metaRaw);
      const options = [{value:'',label:'Not selected'}].concat(opts.map(x => ({ value:x, label:x })));
      const s = selectField(options, String(v ?? ''));
      s.addEventListener('change', () => { fieldObj.value = s.value; onChange(); });
      return s;
    }

    // Date -> input date
    if (type === 'date') {
      const inp = document.createElement('input');
      inp.type = 'date';
      inp.className = 'field-input';
      inp.value = String(v ?? '');
      inp.addEventListener('input', () => { fieldObj.value = inp.value; onChange(); });
      return inp;
    }

    // Text -> textarea
    if (type === 'text') {
      const ta = document.createElement('textarea');
      ta.className = 'field-input';
      ta.value = String(v ?? '');
      ta.addEventListener('input', () => { fieldObj.value = ta.value; onChange(); });
      return ta;
    }

    // Default -> text input
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'field-input';
    inp.value = String(v ?? '');
    inp.addEventListener('input', () => { fieldObj.value = inp.value; onChange(); });
    return inp;
  }

  /* -------------------- 6) Render Update metadata v2 editor --------------- */
  function renderUpdateMetaV2(actionIndex, cfg){
    cfg = normalizeUpdateMetadataConfig(cfg);

    const st = getState(actionIndex);
    const root = el('div','um-editor');

    // Ensure at least one target exists
    if (!cfg.targets.length) {
      cfg.targets.push({
        category: { id:'', name:'' },
        metadataView: { id:'', name:'' },
        onlyMarked: true,
        fields: []
      });
      st.activeTarget = 0;
    }

    // Active target
    const t = cfg.targets[Math.min(st.activeTarget, cfg.targets.length-1)];

    // Populate fields for current view (checkbox list)
    if (t.metadataView?.name) ensureTargetFieldsPopulated(t);

    /* Targets bar */
    const targetsBar = el('div','um-targets');
    cfg.targets.forEach((tg, i) => {
      const chip = el('div','um-target-chip' + (i === st.activeTarget ? ' active' : ''));
      const nm = el('span','um-target-name', tg.metadataView?.name || '(no view)');
      chip.appendChild(nm);

      // delete target
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'um-target-del';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        cfg.targets.splice(i,1);
        if (st.activeTarget >= cfg.targets.length) st.activeTarget = Math.max(0, cfg.targets.length-1);
        renderApiPreview();
        // re-render action block
        renderCanvasAutomation(automationEnEdition.nom);
      });
      chip.appendChild(del);

      chip.addEventListener('click', () => {
        st.activeTarget = i;
        renderCanvasAutomation(automationEnEdition.nom);
      });

      targetsBar.appendChild(chip);
    });

    root.appendChild(targetsBar);

    /* Context (Category + View + Only marked) */
    const context = el('div','um-context');

    // Category
    const rowCat = el('div','um-row');
    rowCat.appendChild(labelSmall('Category'));
    const catCtrl = el('div','um-ctrl');
    const cats = getCategoryList();
    const catOptions = [{value:'',label:'-- None --'}].concat(cats.map(c => ({ value: c.name || c.id, label: c.name || c.id })));
    const catSel = selectField(catOptions, t.category?.name || t.category?.id || '');
    catSel.addEventListener('change', () => {
      const v = catSel.value;
      t.category = { id:'', name: v };
      // Reset view if not in category list? (soft)
      renderApiPreview();
      renderCanvasAutomation(automationEnEdition.nom);
    });
    catCtrl.appendChild(catSel);
    rowCat.appendChild(catCtrl);
    context.appendChild(rowCat);

    // Metadata view
    const rowView = el('div','um-row');
    rowView.appendChild(labelSmall('Metadata View'));
    const viewCtrl = el('div','um-ctrl');

    const views = getViewsForCategory(t.category?.name || t.category?.id);
    const viewOptions = [{value:'',label:'-- Select View --'}].concat(views.map(v => ({ value: v.name, label: v.name })));
    const viewSel = selectField(viewOptions, t.metadataView?.name || '');
    viewSel.addEventListener('change', () => {
      const v = viewSel.value;
      t.metadataView = { id:'', name: v };
      t.fields = []; // will be populated by ensureTargetFieldsPopulated
      ensureTargetFieldsPopulated(t);
      renderApiPreview();
      renderCanvasAutomation(automationEnEdition.nom);
    });
    viewCtrl.appendChild(viewSel);
    rowView.appendChild(viewCtrl);
    context.appendChild(rowView);

    // Only marked toggle + "Add another view"
    const rowOnly = el('div','um-row');
    rowOnly.appendChild(labelSmall(''));
    const onlyCtrl = el('div','um-ctrl');

    const onlyWrap = el('div','um-onlymarked');
    const cb = checkbox(!!t.onlyMarked);
    cb.addEventListener('change', () => {
      t.onlyMarked = cb.checked;
      renderApiPreview();
      renderCanvasAutomation(automationEnEdition.nom);
    });
    const hint = el('div','section-hint','Only marked fields will be updated');
    onlyWrap.appendChild(cb);
    onlyWrap.appendChild(hint);
    onlyCtrl.appendChild(onlyWrap);

    // Add another view button (Mode A)
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add-small';
    addBtn.textContent = '+ Add another view';
    addBtn.addEventListener('click', () => {
      cfg.targets.push({
        category: { id:'', name: t.category?.name || '' },
        metadataView: { id:'', name:'' },
        onlyMarked: true,
        fields: []
      });
      st.activeTarget = cfg.targets.length - 1;
      renderApiPreview();
      renderCanvasAutomation(automationEnEdition.nom);
    });
    onlyCtrl.appendChild(addBtn);

    rowOnly.appendChild(onlyCtrl);
    context.appendChild(rowOnly);

    root.appendChild(context);

    /* Fields list */
    const fieldsWrap = el('div','um-fields');
    fieldsWrap.appendChild(el('div','um-fields-title','Descriptive Fields'));

    if (!t.metadataView?.name) {
      const h = el('div','section-hint','Select a Metadata View to see fields.');
      fieldsWrap.appendChild(h);
      root.appendChild(fieldsWrap);
      return root;
    }

    const metas = getMetasForView(t.metadataView.name);
    const metaByName = new Map(metas.map(m => [m.name, m.raw]));

    (t.fields || []).forEach((f) => {
      const metaRaw = metaByName.get(f.field.name) || null;
      const type = toType(metaRaw);

      const fieldBox = el('div','um-field' + ((t.onlyMarked && !f.checked) ? ' disabled' : ''));
      // header
      const hdr = el('div','um-field-hdr');

      const chkBox = el('div','um-field-check');
      const ck = checkbox(!!f.checked);
      ck.addEventListener('change', () => {
        f.checked = ck.checked;
        renderApiPreview();
        renderCanvasAutomation(automationEnEdition.nom);
      });
      chkBox.appendChild(ck);
      hdr.appendChild(chkBox);

      hdr.appendChild(el('div','um-field-name', f.field.name));

      // mode (Tag Cloud only)
      const modeWrap = el('div','um-field-mode');
      if (type === 'tagcloud') {
        const modeSel = document.createElement('select');
        modeSel.className = 'um-mode-select';
        ['Append','Overwrite','Remove'].forEach(m => {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          modeSel.appendChild(o);
        });
        modeSel.value = f.mode || 'Append';
        modeSel.addEventListener('change', () => {
          f.mode = modeSel.value;
          renderApiPreview();
        });
        modeWrap.appendChild(modeSel);
      }
      hdr.appendChild(modeWrap);

      fieldBox.appendChild(hdr);

      // body: value control
      const body = el('div','um-field-body');
      const control = renderValueControl(metaRaw, f, () => renderApiPreview());
      body.appendChild(control);
      fieldBox.appendChild(body);

      fieldsWrap.appendChild(fieldBox);
    });

    root.appendChild(fieldsWrap);

    return root;
  }

  /* -------------------- 7) Hook into field renderer ---------------------- */
  const prev = _renderFieldControl;
  _renderFieldControl = function(ctx, idx, cfg, f){
    if (ctx === 'action' && f && f.type === 'update-metadata-v2') {
      // cfg is the action's config object
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      // label
      const lab = document.createElement('label');
      lab.className = 'field-label';
      lab.textContent = f.label || 'Update Metadata';
      wrap.appendChild(lab);

      // editor
      const editor = renderUpdateMetaV2(idx, cfg);
      wrap.appendChild(editor);

      return wrap;
    }
    return prev(ctx, idx, cfg, f);
  };

  console.log('[WFD] Update Metadata v2 (Mode A) installed');

})();

/* ========================================================================
   Update Metadata v2 — PART 2/2
   - Migrate legacy config (metadataView/metadataFields) -> targets[]
   - Cleanup legacy keys on save (keep only v2 canonical model)
   - Normalize existing automations after load (offline-first)
   ======================================================================== */
(function(){

  /* -------------------- Portable normalizers (no dependency on Part 1 scope) */
  function asArr(v){ return Array.isArray(v) ? v : (v ? [v] : []); }
  function str(v){ return String(v ?? '').trim(); }

  // Convert legacy config to v2 schema (targets[])
  function migrateUpdateMetaConfigToV2(cfg){
    if (!cfg || typeof cfg !== 'object') cfg = {};

    // If already v2
    if (Array.isArray(cfg.targets)) {
      cfg.targets.forEach(t => {
        if (!t.category) t.category = { id:'', name:'' };
        if (!t.metadataView) t.metadataView = { id:'', name:'' };
        if (typeof t.onlyMarked !== 'boolean') t.onlyMarked = true;
        if (!Array.isArray(t.fields)) t.fields = [];

        t.fields = t.fields.map(f => {
          const name = f?.field?.name || f?.name || '';
          return {
            field: { id: f?.field?.id || '', name: str(name) },
            checked: !!f?.checked,
            value: (typeof f?.value === 'undefined') ? '' : f.value,
            mode: f?.mode || null
          };
        }).filter(f => f.field.name);
      });
      return cfg;
    }

    // Else create targets from legacy
    const viewName = str(cfg.metadataView || cfg.metadata_view || cfg.view || cfg.mdView || '');
    const legacyFields = asArr(cfg.metadataFields || cfg.metadata_fields || cfg.fields || []);

    cfg.targets = [];
    if (viewName) {
      cfg.targets.push({
        category: { id:'', name: str(cfg.category || cfg.category_name || '') },
        metadataView: { id:'', name: viewName },
        onlyMarked: true,
        fields: legacyFields
          .map(n => str(n))
          .filter(Boolean)
          .map(n => ({ field:{ id:'', name:n }, checked:true, value:'', mode:null }))
      });
    } else {
      // No legacy info: start empty v2 container
      cfg.targets.push({
        category: { id:'', name:'' },
        metadataView: { id:'', name:'' },
        onlyMarked: true,
        fields: []
      });
    }
    return cfg;
  }

  // Remove legacy keys so v2 is single source of truth
  function cleanupLegacyKeys(cfg){
    if (!cfg || typeof cfg !== 'object') return;
    delete cfg.metadataView;
    delete cfg.metadata_view;
    delete cfg.view;
    delete cfg.mdView;

    delete cfg.metadataFields;
    delete cfg.metadata_fields;
    delete cfg.fields;

    delete cfg.category;
    delete cfg.category_name;
  }

  function normalizeUpdateMetaActionConfig(action){
    if (!action || (action.type !== 'Update metadata' && action.type !== 'Update Metadata')) return;
    action.type = 'Update metadata'; // canonical spelling
    action.config = migrateUpdateMetaConfigToV2(action.config || {});
    // Keep v2 only going forward
    cleanupLegacyKeys(action.config);
  }

  function normalizeAutomationUpdateMeta(automation){
    if (!automation) return;
    (automation.actions || []).forEach(normalizeUpdateMetaActionConfig);
  }

  function normalizeAllAutomations(){
    (automationsData.automations || []).forEach(normalizeAutomationUpdateMeta);
  }

  /* -------------------- Hook: normalize after data load (DOM ready) */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      // At this point chargerDonnees() has run in your main init
      normalizeAllAutomations();
      // Persist normalization silently (offline stable)
      sauvegarderDonnees();
    } catch (e) {
      console.warn('[WFD] UpdateMeta v2 normalizeAll failed:', e);
    }
  });

  /* -------------------- Hook: ensure save commits v2-only schema */
  // Wrap existing _saveAutomation (if present) OR saveCurrent->automation path.
  // In your current script, saveCurrent dispatches to _saveAutomation (Part 3). [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-automations.js)
  if (typeof window._saveAutomation === 'function') {
    const prev = window._saveAutomation;
    window._saveAutomation = function(){
      try { normalizeAutomationUpdateMeta(automationEnEdition); } catch {}
      return prev();
    };
  } else if (typeof window.saveCurrent === 'function') {
    const prevSave = window.saveCurrent;
    window.saveCurrent = function(){
      try {
        if (window.currentKind === 'automation' && typeof automationEnEdition !== 'undefined') {
          normalizeAutomationUpdateMeta(automationEnEdition);
        }
      } catch {}
      return prevSave();
    };
  }

  console.log('[WFD] Update Metadata v2: migration+cleanup installed');
})();

/* ========================================================================
   Electron-safe validation messaging (single, consolidated)
   - No blocking popup (prevents focus loss)
   - Inline message under the Automation Name input
   - Works even if the canvas re-renders (pending message)
   ======================================================================== */
(function(){
  window.__wfdAlertOverridden = true;

  let pendingMsg = '';

  function ensureNameAnchor(){
    // Find the "Nom" input inside the Informations section
    const labels = Array.from(document.querySelectorAll('#canvas-editor .field-label'));
    const nomLabel = labels.find(l => (l.textContent || '').trim().toLowerCase() === 'nom');
    if (!nomLabel) return null;

    const group = nomLabel.closest('.form-group');
    if (!group) return null;

    const input = group.querySelector('input.field-input');
    if (!input) return null;

    if (!input.id) input.id = 'aut-name';

    let err = document.getElementById('aut-name-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'aut-name-error';
      err.className = 'section-hint';
      err.textContent = '';
      input.insertAdjacentElement('afterend', err);

      input.addEventListener('input', () => { err.textContent = ''; });
    }
    return { input, err };
  }

  function showInline(msg){
    const anchor = ensureNameAnchor();
    if (!anchor) return false;

    anchor.err.textContent = '⚠️ ' + String(msg || '');
    setTimeout(() => {
      try { anchor.input.focus({ preventScroll:true }); anchor.input.select?.(); } catch {}
    }, 0);
    return true;
  }

  // Hook: after each canvas render, flush pending message if any
  if (typeof window.renderCanvasAutomation === 'function') {
    const prev = window.renderCanvasAutomation;
    window.renderCanvasAutomation = function(){
      const r = prev.apply(this, arguments);
      if (pendingMsg) {
        if (showInline(pendingMsg)) pendingMsg = '';
      }
      return r;
    };
  }

  // Override alert globally (no popup)
  window.alert = function(msg){
    const text = String(msg || '');
    if (!showInline(text)) pendingMsg = text;
    console.warn('[WFD alert suppressed]', text);
  };

  console.log('[WFD] Electron-safe alert override installed (single)');
})();

/* ========================================================================
   Anchor Nom input + error slot (reliable)
   - Ensures #aut-name and #aut-name-error exist after each render
   ======================================================================== */
(function(){
  function ensureAnchor(){
    // Cherche l'input "Nom" dans la section Informations (première section du canvas)
    const editor = document.getElementById('canvas-editor');
    if (!editor) return false;

    const infoSection = editor.querySelector('.editor-section'); // 1ère section = Informations
    if (!infoSection) return false;

    // Trouver le label "Nom" (peut être NOM, Nom, Nom *, etc.)
    const labels = Array.from(infoSection.querySelectorAll('.field-label'));
    const nomLabel = labels.find(l => (l.textContent || '').trim().toLowerCase().startsWith('nom'));
    if (!nomLabel) return false;

    const group = nomLabel.closest('.form-group');
    if (!group) return false;

    const input = group.querySelector('input.field-input');
    if (!input) return false;

    // Force id stable
    input.id = 'aut-name';

    // Ensure error slot right after input
    let err = document.getElementById('aut-name-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'aut-name-error';
      err.className = 'section-hint';
      err.textContent = '';
      input.insertAdjacentElement('afterend', err);

      // clear error on typing
      input.addEventListener('input', () => { err.textContent = ''; });
    }
    return true;
  }

  // Patch renderCanvasAutomation to ensure anchor is present after each render
  if (typeof window.renderCanvasAutomation === 'function') {
    const prev = window.renderCanvasAutomation;
    window.renderCanvasAutomation = function(){
      const r = prev.apply(this, arguments);
      try { ensureAnchor(); } catch {}
      return r;
    };
  }

  // Run once in case canvas already open
  try { ensureAnchor(); } catch {}

  console.log('[WFD] Nom anchor ensured (#aut-name + #aut-name-error)');
})();

/* ========================================================================
   Planner API Calls + 2 views (EASY / ENGINEER)
   - DOM-only render
   - No inline HTML/CSS
   - Uses buttons: #btnPreviewEasy / #btnPreviewTech
   - Renders into: #api-calls-container (right panel)
   ======================================================================== */
(function(){
  const LS_KEY = 'wfd_preview_mode';
  let previewMode = (localStorage.getItem(LS_KEY) || 'easy').toLowerCase();
  if (!['easy','tech'].includes(previewMode)) previewMode = 'easy';

  function $(id){ return document.getElementById(id); }

  function setActiveBtn(){
    const bEasy = $('btnPreviewEasy');
    const bTech = $('btnPreviewTech');
    if (!bEasy || !bTech) return;
    bEasy.classList.toggle('active', previewMode === 'easy');
    bTech.classList.toggle('active', previewMode === 'tech');
  }

  function setMode(mode){
    previewMode = mode;
    localStorage.setItem(LS_KEY, mode);
    setActiveBtn();
    // re-render preview with same data
    if (typeof window.renderApiPreview === 'function') window.renderApiPreview();
  }

  // Bind toggle buttons after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const bEasy = $('btnPreviewEasy');
    const bTech = $('btnPreviewTech');
    if (bEasy) bEasy.addEventListener('click', () => setMode('easy'));
    if (bTech) bTech.addEventListener('click', () => setMode('tech'));
    setActiveBtn();
  });

  /* -------------------- Step model --------------------
     step = {
       kind: 'http' | 'lookup' | 'compute' | 'note' | 'job',
       title: string,
       method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE',
       url?: string,
       body?: object,
       meta?: object
     }
  ----------------------------------------------------- */

  function planStepsForCurrent(){
    if (!window.currentKind) return [];

    if (window.currentKind === 'webhook' && typeof webhookEnEdition !== 'undefined' && webhookEnEdition) {
      // Webhooks API is well-defined (notifications/v1/webhooks) [3](https://app.iconik.io/docs/swagger.html)[4](https://trackit.io/iconik-api-basics/)
      const w = webhookEnEdition;
      return [{
        kind: 'http',
        title: w.id ? 'Update Webhook' : 'Create Webhook',
        method: w.id ? 'PUT' : 'POST',
        url: w.id ? `/API/notifications/v1/webhooks/${w.id}/` : '/API/notifications/v1/webhooks/',
        body: {
          name: w.name || '',
          url: w.url || '',
          event_type: w.eventType || 'assets',
          realm: w.realm || null,
          operation: w.operation || null,
          object_id: w.objectId || null,
          query: w.query || '',
          headers: (typeof normalizeHeadersToArray === 'function') ? normalizeHeadersToArray(w.headers || []) : (w.headers || [])
        }
      }];
    }

    if (window.currentKind === 'automation' && typeof automationEnEdition !== 'undefined' && automationEnEdition) {
      return planStepsForAutomation(automationEnEdition);
    }

    if (window.currentKind === 'custom' && typeof customActionEnEdition !== 'undefined' && customActionEnEdition) {
      // Custom actions endpoints exist under assets API (exact ops can vary) [5](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)[7](https://app.iconik.io/docs/apidocs.html?url=/docs/notifications/spec/)
      const ca = customActionEnEdition;
      return [{
        kind: 'http',
        title: ca.id ? 'Update Custom Action' : 'Create Custom Action',
        method: ca.id ? 'PUT' : 'POST',
        url: ca.id ? `/API/assets/v1/custom_actions/${ca.id}/` : '/API/assets/v1/custom_actions/',
        body: {
          title: ca.title || '',
          type: ca.type || 'Post',
          context: (ca.context || 'asset').toUpperCase(),
          url: ca.url || '',
          metadata_view: ca.metadataView || '',
          application_token_id: ca.appId || '',
          headers: (typeof normalizeHeadersToArray === 'function') ? normalizeHeadersToArray(ca.headers || []) : (ca.headers || [])
        }
      }];
    }

    return [];
  }

  function planStepsForAutomation(a){
    const steps = [];

    // Header note: multiple triggers possible, automation runs when all satisfied [1](https://help.iconik.backlight.co/hc/en-us/articles/25027351036311-Adding-Custom-Actions)
    steps.push({
      kind: 'note',
      title: `Automation: ${a.nom || '(Sans nom)'} — steps preview (placeholders)`,
      meta: { triggers: (a.triggers || []).map(t => t.type), actions: (a.actions || []).map(x => x.type) }
    });

    // Triggers are not API calls but can imply lookups; keep as notes
    (a.triggers || []).forEach((t, i) => {
      steps.push({
        kind: 'note',
        title: `Trigger #${i+1}: ${t.type || '(not set)'}`,
        meta: t.config || {}
      });
    });

    // Actions -> steps
    (a.actions || []).forEach((ac, i) => {
      const type = ac.type || '';
      const cfg = ac.config || {};

      // --- Archive asset (multi-step) ---
      if (type === 'Archive asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Archive asset`, meta: cfg });

        // Storage list lookup (storages API exists; listing storages is common) 
        steps.push({
          kind:'lookup',
          title:'Resolve storages (archive/source) by name -> id (if needed)',
          method:'GET',
          url:'/API/files/v1/storages/',
          body:null
        });

        if (cfg.allowTransfersThroughIconik) {
          // Help center: allow transfers through iconik can incur egress costs [2]
          steps.push({
            kind:'note',
            title:'Option enabled: Allow transfers through Iconik (potential egress costs)',
            meta:{ allowTransfersThroughIconik:true }
          });
        }

        // Job step (exact job endpoint/payload to be confirmed via swagger/jobs or network capture) 
        steps.push({
          kind:'job',
          title:'Create archive job (job-based operation)',
          meta:{
            archiveStorage: cfg.archiveStorage || null,
            preferredSourceStorage: cfg.preferredSourceStorage || null,
            useCurrentPath: !!cfg.useCurrentPath,
            deleteAfterArchive: !!cfg.deleteAfterArchive
          }
        });

        return;
      }

      // --- Update metadata v2 (multi-step per target) ---
      if (type === 'Update metadata') {
        steps.push({ kind:'note', title:`Action #${i+1}: Update metadata`, meta: cfg });

        const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
        if (!targets.length) {
          steps.push({ kind:'note', title:'No targets configured', meta:{} });
          return;
        }

        targets.forEach((t, ti) => {
          const viewName = t?.metadataView?.name || '';
          const onlyMarked = (typeof t.onlyMarked === 'boolean') ? t.onlyMarked : true;

          steps.push({
            kind:'compute',
            title:`Target #${ti+1}: Metadata View "${viewName || '(none)'}"`,
            meta:{ category: t?.category || null, onlyMarked }
          });

          const fields = Array.isArray(t.fields) ? t.fields : [];
          const selected = onlyMarked ? fields.filter(f => f.checked) : fields;

          // For each selected field, show one logical metadata op
          selected.forEach((f) => {
            const fname = f?.field?.name || '';
            const mode = f?.mode || null;

            steps.push({
              kind:'http',
              title: `Update field "${fname}"${mode ? ` (mode=${mode})` : ''}`,
              method: 'PATCH',
              // Metadata API exists; exact per-action payload is confirmed later (sync last) [5](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)[9](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.css)
              url: '/API/metadata/v1/assets/{ASSET_ID}/',
              body: {
                metadata_view: viewName,
                field: fname,
                value: f?.value,
                mode: mode
              }
            });
          });
        });

        return;
      }

      // --- Set ACL on asset (single logical op) ---
      if (type === 'Set ACL on asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Set ACL on asset`, meta: cfg });

        // ACL API exists; exact choice of endpoint may vary (bulk vs per subject) [10](https://eu.iconik.io/docs/notifications/spec/)[5](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)
        steps.push({
          kind:'http',
          title:'Apply ACL to asset (users/teams + permissions)',
          method:'PUT',
          url:'/API/acls/v1/acl/assets/{ASSET_ID}/',
          body:{
            applyMode: cfg.applyMode || 'Append',
            users: cfg.users || [],
            teams: cfg.teams || [],
            permissions: cfg.permissions || []
          }
        });
        return;
      }

      // --- Fallback: show action as one step (placeholder) ---
      steps.push({
        kind:'note',
        title:`Action #${i+1}: ${type || '(not set)'}`,
        meta: cfg
      });
    });

    return steps;
  }

  /* -------------------- Rendering (DOM-only) ----------------------------- */

  function clearPreview(){
    const box = $('api-calls-container');
    const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
    if (box) { box.replaceChildren(); box.style.display = 'none'; }
    if (emptyPrev) emptyPrev.style.display = '';
  }

  function showPreview(){
    const box = $('api-calls-container');
    const emptyPrev = document.querySelector('#api-preview-content .preview-empty');
    if (emptyPrev) emptyPrev.style.display = 'none';
    if (box) box.style.display = 'block';
  }

  function renderEasy(steps){
    const box = $('api-calls-container');
    if (!box) return;

    steps.forEach((s, i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      const m = s.method ? s.method : (s.kind.toUpperCase());
      head.textContent = `${m} #${i+1} — ${s.title}`;
      block.appendChild(head);

      if (s.url) {
        const url = document.createElement('div');
        url.className = 'api-url';
        url.textContent = s.url;
        block.appendChild(url);
      }

      // compact hint
      if (s.kind === 'note' || s.kind === 'compute' || s.kind === 'job' || s.kind === 'lookup') {
        const h = document.createElement('div');
        h.className = 'api-headers';
        h.textContent = s.kind === 'job' ? 'Job-based operation (sequence may include sub-steps)' :
                        s.kind === 'lookup' ? 'Lookup step (resolve ids/refs)' :
                        s.kind === 'compute' ? 'Compute step (no network call)' :
                        'Note';
        block.appendChild(h);
      }

      box.appendChild(block);
    });
  }

  function renderTech(steps){
    const box = $('api-calls-container');
    if (!box) return;

    steps.forEach((s, i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      const m = s.method ? s.method : s.kind.toUpperCase();
      head.textContent = `${m} #${i+1}`;
      block.appendChild(head);

      const url = document.createElement('div');
      url.className = 'api-url';
      url.textContent = s.url ? s.url : `(no url) — ${s.title}`;
      block.appendChild(url);

      const hdrs = document.createElement('div');
      hdrs.className = 'api-headers';
      // keep it simple: show placeholders
      const l1 = document.createElement('div'); l1.className = 'header-line'; l1.textContent = 'Content-Type: application/json';
      const l2 = document.createElement('div'); l2.className = 'header-line'; l2.textContent = 'App-ID: {app_id}';
      const l3 = document.createElement('div'); l3.className = 'header-line'; l3.textContent = 'Auth-Token: {auth_token}';
      hdrs.appendChild(l1); hdrs.appendChild(l2); hdrs.appendChild(l3);
      block.appendChild(hdrs);

      const det = document.createElement('details');
      det.className = 'api-body';
      const sum = document.createElement('summary');
      sum.textContent = s.title;
      det.appendChild(sum);

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify({
        kind: s.kind,
        method: s.method || null,
        url: s.url || null,
        body: s.body || null,
        meta: s.meta || null
      }, null, 2);
      det.appendChild(pre);

      block.appendChild(det);
      box.appendChild(block);
    });
  }

  /* -------------------- Override renderApiPreview (final) ----------------- */
  window.renderApiPreview = function(){
    clearPreview();

    const steps = planStepsForCurrent();
    if (!steps.length) return;

    showPreview();
    if (previewMode === 'easy') renderEasy(steps);
    else renderTech(steps);
  };

  // If preview already on screen, refresh once
  try { setActiveBtn(); } catch {}
})();

/* ========================================================================
   Planner bridge: expose editor state to window for the preview planner
   ======================================================================== */
(function(){
  // Wrap openEditor to mirror state on window
  const _openPrev = window.openEditor;
  if (typeof _openPrev === 'function') {
    window.openEditor = function(kind, key){
      const r = _openPrev.apply(this, arguments);

      // Mirror to window so planner can see it
      window.currentKind = kind;
      window.currentKey  = key;

      // Render preview right away
      try { window.renderApiPreview && window.renderApiPreview(); } catch {}
      return r;
    };
  }

  // Wrap closeEditor to clear mirror
  const _closePrev = window.closeEditor;
  if (typeof _closePrev === 'function') {
    window.closeEditor = function(){
      const r = _closePrev.apply(this, arguments);
      window.currentKind = null;
      window.currentKey  = null;
      try { window.renderApiPreview && window.renderApiPreview(); } catch {}
      return r;
    };
  }

  console.log('[WFD] Planner bridge installed (window.currentKind/currentKey)');
})();

/* ========================================================================
   API Calls Planner + Toggle EASY / ENGINEER (DOM-only)
   - binds #btnPreviewEasy / #btnPreviewTech
   - persists mode in localStorage
   - renders into #api-calls-container (creates it if missing)
   ======================================================================== */
(function(){
  const LS_KEY = 'wfd_preview_mode';
  let mode = (localStorage.getItem(LS_KEY) || 'easy').toLowerCase();
  if (!['easy','tech'].includes(mode)) mode = 'easy';

  const $ = (id) => document.getElementById(id);

  function ensurePreviewDom(){
    // Try to find the containers; create if missing
    let content = $('api-preview-content') || document.querySelector('.preview-content');
    if (!content) return { box:null, empty:null };

    let empty = content.querySelector('.preview-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'preview-empty';
      const p = document.createElement('p');
      p.textContent = 'Ajoutez des triggers et des actions pour voir les API calls correspondants';
      empty.appendChild(p);
      content.appendChild(empty);
    }

    let box = $('api-calls-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'api-calls-container';
      box.style.display = 'none';
      content.appendChild(box);
    }
    return { box, empty };
  }

  function setActiveButtons(){
    const bEasy = $('btnPreviewEasy');
    const bTech = $('btnPreviewTech');
    if (bEasy) bEasy.classList.toggle('active', mode === 'easy');
    if (bTech) bTech.classList.toggle('active', mode === 'tech');
  }

  function setMode(next){
    mode = next;
    localStorage.setItem(LS_KEY, next);
    setActiveButtons();
    renderApiPreview(); // refresh immediately
  }

  function bindToggle(){
    const bEasy = $('btnPreviewEasy');
    const bTech = $('btnPreviewTech');
    if (bEasy) bEasy.addEventListener('click', () => setMode('easy'));
    if (bTech) bTech.addEventListener('click', () => setMode('tech'));
    setActiveButtons();
  }

  /* ------------------ Step model ------------------
     step = {
       kind: 'http'|'lookup'|'compute'|'note'|'job',
       title: string,
       method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE',
       url?: string,
       body?: any,
       meta?: any
     }
  -------------------------------------------------- */

  function planSteps(){
    // Determine current entity from globals you already have
    if (window.currentKind === 'automation' && window.automationEnEdition) {
      return planAutomation(window.automationEnEdition);
    }
    if (window.currentKind === 'webhook' && typeof webhookEnEdition !== 'undefined' && webhookEnEdition) {
      const w = webhookEnEdition;
      return [{
        kind:'http',
        title: w.id ? 'Update Webhook' : 'Create Webhook',
        method: w.id ? 'PUT' : 'POST',
        url: w.id ? `/API/notifications/v1/webhooks/${w.id}/` : '/API/notifications/v1/webhooks/',
        body: {
          name: w.name || '',
          url: w.url || '',
          event_type: w.eventType || 'assets',
          realm: w.realm || null,
          operation: w.operation || null,
          object_id: w.objectId || null,
          query: w.query || '',
          headers: (typeof normalizeHeadersToArray === 'function') ? normalizeHeadersToArray(w.headers || []) : (w.headers || [])
        }
      }];
    }
    if (window.currentKind === 'custom' && typeof customActionEnEdition !== 'undefined' && customActionEnEdition) {
      const ca = customActionEnEdition;
      return [{
        kind:'http',
        title: ca.id ? 'Update Custom Action' : 'Create Custom Action',
        method: ca.id ? 'PUT' : 'POST',
        url: ca.id ? `/API/assets/v1/custom_actions/${ca.id}/` : '/API/assets/v1/custom_actions/',
        body: {
          title: ca.title || '',
          type: ca.type || 'Post',
          context: (ca.context || 'asset').toUpperCase(),
          url: ca.url || '',
          metadata_view: ca.metadataView || '',
          application_token_id: ca.appId || '',
          headers: (typeof normalizeHeadersToArray === 'function') ? normalizeHeadersToArray(ca.headers || []) : (ca.headers || [])
        }
      }];
    }
    return [];
  }

  function planAutomation(a){
    const steps = [];
    steps.push({
      kind:'note',
      title: `Automation: ${a.nom || '(Sans nom)'}`,
      meta: { triggers: (a.triggers||[]).map(t=>t.type), actions:(a.actions||[]).map(x=>x.type) }
    });

    (a.triggers || []).forEach((t,i) => {
      steps.push({ kind:'note', title:`Trigger #${i+1}: ${t.type || '(not set)'}`, meta: t.config || {} });
    });

    (a.actions || []).forEach((ac,i) => {
      const type = ac.type || '';
      const cfg  = ac.config || {};

      if (type === 'Archive asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Archive asset`, meta: cfg });

        steps.push({
          kind:'lookup',
          title:'Resolve storages by name → id (if needed)',
          method:'GET',
          url:'/API/files/v1/storages/'
        });

        if (cfg.allowTransfersThroughIconik) {
          steps.push({ kind:'note', title:'Allow transfers through Iconik enabled (potential egress costs)', meta:{ allowTransfersThroughIconik:true } });
        }

        steps.push({
          kind:'job',
          title:'Create archive job (job-based operation)',
          meta:{
            archiveStorage: cfg.archiveStorage || null,
            preferredSourceStorage: cfg.preferredSourceStorage || null,
            useCurrentPath: !!cfg.useCurrentPath,
            deleteAfterArchive: !!cfg.deleteAfterArchive
          }
        });
        return;
      }

      if (type === 'Update metadata') {
        steps.push({ kind:'note', title:`Action #${i+1}: Update metadata`, meta: cfg });

        const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
        targets.forEach((t,ti) => {
          const viewName = t?.metadataView?.name || '';
          const onlyMarked = (typeof t.onlyMarked === 'boolean') ? t.onlyMarked : true;

          steps.push({ kind:'compute', title:`Target #${ti+1}: View "${viewName || '(none)'}"`, meta:{ category:t?.category||null, onlyMarked } });

          const fields = Array.isArray(t.fields) ? t.fields : [];
          const selected = onlyMarked ? fields.filter(f=>f.checked) : fields;

          selected.forEach((f) => {
            const fname = f?.field?.name || '';
            const mode = f?.mode || null;
            steps.push({
              kind:'http',
              title:`Update "${fname}"${mode ? ` (mode=${mode})` : ''}`,
              method:'PATCH',
              url:'/API/metadata/v1/assets/{ASSET_ID}/',
              body:{
                metadata_view: viewName,
                field: fname,
                value: f?.value,
                mode: mode
              }
            });
          });
        });
        return;
      }

      if (type === 'Set ACL on asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Set ACL on asset`, meta: cfg });
        steps.push({
          kind:'http',
          title:'Apply ACL on asset',
          method:'PUT',
          url:'/API/acls/v1/acl/assets/{ASSET_ID}/',
          body:{
            applyMode: cfg.applyMode || 'Append',
            users: cfg.users || [],
            teams: cfg.teams || [],
            permissions: cfg.permissions || []
          }
        });
        return;
      }

      // Fallback
      steps.push({ kind:'note', title:`Action #${i+1}: ${type || '(not set)'}`, meta: cfg });
    });

    return steps;
  }

  /* ------------------ Renderers (DOM-only) ------------------ */
  function clearAndGetBox(){
    const { box, empty } = ensurePreviewDom();
    if (!box || !empty) return { box:null, empty:null };

    box.replaceChildren();
    box.style.display = 'none';
    empty.style.display = '';
    return { box, empty };
  }

  function showBox(box, empty){
    if (empty) empty.style.display = 'none';
    if (box) box.style.display = 'block';
  }

  function renderEasy(steps, box){
    steps.forEach((s, i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1} — ${s.title}`;
      block.appendChild(head);

      if (s.url) {
        const url = document.createElement('div');
        url.className = 'api-url';
        url.textContent = s.url;
        block.appendChild(url);
      }

      // compact descriptor
      if (s.kind !== 'http') {
        const note = document.createElement('div');
        note.className = 'api-headers';
        note.textContent =
          s.kind === 'job' ? 'Job-based operation (may include sub-steps)' :
          s.kind === 'lookup' ? 'Lookup step (resolve ids/refs)' :
          s.kind === 'compute' ? 'Compute step (no network call)' :
          'Note';
        block.appendChild(note);
      }

      box.appendChild(block);
    });
  }

  function renderTech(steps, box){
    steps.forEach((s, i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1}`;
      block.appendChild(head);

      const url = document.createElement('div');
      url.className = 'api-url';
      url.textContent = s.url ? s.url : `(no url) — ${s.title}`;
      block.appendChild(url);

      const hdrs = document.createElement('div');
      hdrs.className = 'api-headers';
      const l1 = document.createElement('div'); l1.className = 'header-line'; l1.textContent = 'Content-Type: application/json';
      const l2 = document.createElement('div'); l2.className = 'header-line'; l2.textContent = 'App-ID: {app_id}';
      const l3 = document.createElement('div'); l3.className = 'header-line'; l3.textContent = 'Auth-Token: {auth_token}';
      hdrs.appendChild(l1); hdrs.appendChild(l2); hdrs.appendChild(l3);
      block.appendChild(hdrs);

      const det = document.createElement('details');
      det.className = 'api-body';
      const sum = document.createElement('summary');
      sum.textContent = s.title;
      det.appendChild(sum);

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify({
        kind: s.kind,
        method: s.method || null,
        url: s.url || null,
        body: s.body || null,
        meta: s.meta || null
      }, null, 2);
      det.appendChild(pre);

      block.appendChild(det);
      box.appendChild(block);
    });
  }

  /* ------------------ Public render hook ------------------ */
  function renderApiPreview(){
    const { box, empty } = clearAndGetBox();
    if (!box || !empty) return;

    const steps = planSteps();
    if (!steps.length) return;

    showBox(box, empty);
    if (mode === 'easy') renderEasy(steps, box);
    else renderTech(steps, box);
  }

  // Export/override globally
  window.renderApiPreview = renderApiPreview;

  // Bind toggle
  document.addEventListener('DOMContentLoaded', () => {
    bindToggle();
    // initial render (if something already selected)
    try { window.renderApiPreview(); } catch {}
  });

  // Also re-render when switching editor selection (if your code calls renderApiPreview already, no harm)
  // Expose mode for debug
  window.__wfdPreviewMode = () => mode;

  console.log('[WFD] Planner+Toggle installed (EASY/ENGINEER)');
})();

/* ========================================================================
   Planner patch: Archive asset -> option-dependent steps (UseCurrentPath/DeleteAfterArchive)
   - Paste at very end of script-automations.js
   ======================================================================== */
(function(){
  const LS_KEY = 'wfd_preview_mode';

  const $ = (id) => document.getElementById(id);

  function ensurePreviewDom(){
    const content = $('api-preview-content') || document.querySelector('.preview-content');
    if (!content) return { box:null, empty:null };

    let empty = content.querySelector('.preview-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'preview-empty';
      const p = document.createElement('p');
      p.textContent = 'Ajoutez des triggers et des actions pour voir les API calls correspondants';
      empty.appendChild(p);
      content.appendChild(empty);
    }

    let box = $('api-calls-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'api-calls-container';
      box.style.display = 'none';
      content.appendChild(box);
    }

    return { box, empty };
  }

  function clearPreview(box, empty){
    box.replaceChildren();
    box.style.display = 'none';
    empty.style.display = '';
  }

  function showPreview(box, empty){
    empty.style.display = 'none';
    box.style.display = 'block';
  }

  function planAutomation(a){
    const steps = [];

    steps.push({
      kind:'note',
      title:`Automation: ${a.nom || '(Sans nom)'}`,
      meta:{ triggers:(a.triggers||[]).map(t=>t.type), actions:(a.actions||[]).map(x=>x.type) }
    });

    (a.triggers||[]).forEach((t,i) => {
      steps.push({ kind:'note', title:`Trigger #${i+1}: ${t.type || '(not set)'}`, meta:t.config||{} });
    });

    (a.actions||[]).forEach((ac,i) => {
      const type = ac.type || '';
      const cfg  = ac.config || {};

      if (type === 'Archive asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Archive asset`, meta: cfg });

        // 1) Resolve storages (documented usage pattern)
        steps.push({
          kind:'lookup',
          title:'Resolve storages (archive/source) by name → id (if needed)',
          method:'GET',
          url:'/API/files/v1/storages/'
        });

        // 2) Option: allow transfers through iconik (cost note)
        if (cfg.allowTransfersThroughIconik) {
          steps.push({
            kind:'note',
            title:'Option: Allow transfers through Iconik (potential egress costs)',
            meta:{ allowTransfersThroughIconik:true }
          });
        }

        // 3) Option: use current path -> extra mechanics
        if (cfg.useCurrentPath) {
          steps.push({
            kind:'lookup',
            title:'Get source path for the asset format (to mirror on archive storage)',
            meta:{ hint:'Job/subsystem will resolve the current path of the source format.' }
          });

          steps.push({
            kind:'compute',
            title:'Compute destinationPath = archiveStorageRoot + sourcePath',
            meta:{ useCurrentPath:true }
          });

          steps.push({
            kind:'job',
            title:'Job sub-step: apply destinationPath to archive operation',
            meta:{ destinationPath:'{ARCHIVE_ROOT}/{SOURCE_PATH}' }
          });
        }

        // 4) Core archive job (always)
        steps.push({
          kind:'job',
          title:'Create archive job (job-based operation)',
          meta:{
            archiveStorage: cfg.archiveStorage || null,
            preferredSourceStorage: cfg.preferredSourceStorage || null,
            useCurrentPath: !!cfg.useCurrentPath,
            deleteAfterArchive: !!cfg.deleteAfterArchive
          }
        });

        // 5) Option: delete after archive -> post-success cleanup
        if (cfg.deleteAfterArchive) {
          steps.push({
            kind:'job',
            title:'Job sub-step: delete source high-res after successful archive',
            meta:{ deleteAfterArchive:true }
          });
        }

        return;
      }

      // Keep other actions as-is (note-only fallback here)
      steps.push({ kind:'note', title:`Action #${i+1}: ${type || '(not set)'}`, meta: cfg });
    });

    return steps;
  }

  function planSteps(){
    if (window.currentKind === 'automation' && window.automationEnEdition) {
      return planAutomation(window.automationEnEdition);
    }
    return [];
  }

  function renderEasy(steps, box){
    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1} — ${s.title}`;
      block.appendChild(head);

      if (s.url) {
        const url = document.createElement('div');
        url.className = 'api-url';
        url.textContent = s.url;
        block.appendChild(url);
      }

      if (s.kind !== 'http' && s.kind !== 'note') {
        const h = document.createElement('div');
        h.className = 'api-headers';
        h.textContent =
          s.kind === 'job' ? 'Job-based step (can include sub-steps)' :
          s.kind === 'lookup' ? 'Lookup step' :
          s.kind === 'compute' ? 'Compute step' : s.kind;
        block.appendChild(h);
      }

      box.appendChild(block);
    });
  }

  function renderTech(steps, box){
    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1}`;
      block.appendChild(head);

      const url = document.createElement('div');
      url.className = 'api-url';
      url.textContent = s.url ? s.url : `(no url) — ${s.title}`;
      block.appendChild(url);

      const det = document.createElement('details');
      det.className = 'api-body';
      const sum = document.createElement('summary');
      sum.textContent = s.title;
      det.appendChild(sum);

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(s, null, 2);
      det.appendChild(pre);

      block.appendChild(det);
      box.appendChild(block);
    });
  }

  window.renderApiPreview = function(){
    const { box, empty } = ensurePreviewDom();
    if (!box || !empty) return;

    clearPreview(box, empty);

    const steps = planSteps();
    if (!steps.length) return;

    showPreview(box, empty);

    const mode = (localStorage.getItem(LS_KEY) || 'easy').toLowerCase();
    if (mode === 'tech') renderTech(steps, box);
    else renderEasy(steps, box);
  };

  // Refresh once after patch install (optional)
  try { window.renderApiPreview(); } catch {}

  console.log('[WFD] Planner patch applied: Archive asset option-dependent steps');
})();

/* ========================================================================
   Planner patch: Update Metadata v2 (targets[]) -> step-per-field (+ Tag Cloud mode)
   - Paste at very end of script-automations.js
   ======================================================================== */
(function(){
  const LS_KEY = 'wfd_preview_mode';
  const $ = (id) => document.getElementById(id);

  function ensurePreviewDom(){
    const content = $('api-preview-content') || document.querySelector('.preview-content');
    if (!content) return { box:null, empty:null };

    let empty = content.querySelector('.preview-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'preview-empty';
      const p = document.createElement('p');
      p.textContent = 'Ajoutez des triggers et des actions pour voir les API calls correspondants';
      empty.appendChild(p);
      content.appendChild(empty);
    }

    let box = $('api-calls-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'api-calls-container';
      box.style.display = 'none';
      content.appendChild(box);
    }

    return { box, empty };
  }

  function clearPreview(box, empty){
    box.replaceChildren();
    box.style.display = 'none';
    empty.style.display = '';
  }

  function showPreview(box, empty){
    empty.style.display = 'none';
    box.style.display = 'block';
  }

  /* ------------------ Planner ------------------ */

  function planAutomation(a){
    const steps = [];

    // Header note: multiple triggers can be combined in Iconik automations. [3](https://help.iconik.backlight.co/hc/en-us/articles/25027351036311-Adding-Custom-Actions)
    steps.push({
      kind:'note',
      title:`Automation: ${a.nom || '(Sans nom)'}`,
      meta:{ triggers:(a.triggers||[]).map(t=>t.type), actions:(a.actions||[]).map(x=>x.type) }
    });

    // Triggers -> notes (not HTTP)
    (a.triggers||[]).forEach((t,i) => {
      steps.push({ kind:'note', title:`Trigger #${i+1}: ${t.type || '(not set)'}`, meta:t.config||{} });
    });

    // Actions
    (a.actions||[]).forEach((ac,i) => {
      const type = ac.type || '';
      const cfg  = ac.config || {};

      /* ---------- Archive asset (kept from previous patch) ----------
         Job-based operations are common for transfers/copies; options change behavior. [4](https://help.iconik.backlight.co/hc/en-us/articles/25027388219415-Using-Custom-Actions)[3](https://help.iconik.backlight.co/hc/en-us/articles/25027351036311-Adding-Custom-Actions)
      */
      if (type === 'Archive asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Archive asset`, meta: cfg });

        // Storage lookup uses files/storages resource pattern. [5](https://www.iconik.io/api-first-development)[2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)
        steps.push({
          kind:'lookup',
          title:'Resolve storages (archive/source) by name → id (if needed)',
          method:'GET',
          url:'/API/files/v1/storages/'
        });

        if (cfg.allowTransfersThroughIconik) {
          // Allow transfers through Iconik can incur costs. [4](https://help.iconik.backlight.co/hc/en-us/articles/25027388219415-Using-Custom-Actions)
          steps.push({ kind:'note', title:'Option: Allow transfers through Iconik (potential egress costs)', meta:{ allowTransfersThroughIconik:true } });
        }

        if (cfg.useCurrentPath) {
          steps.push({ kind:'lookup', title:'Get source path for the asset format (to mirror on archive storage)', meta:{ useCurrentPath:true } });
          steps.push({ kind:'compute', title:'Compute destinationPath = archiveStorageRoot + sourcePath', meta:{ destinationPath:'{ARCHIVE_ROOT}/{SOURCE_PATH}' } });
          steps.push({ kind:'job', title:'Job sub-step: apply destinationPath to archive operation', meta:{ applyPath:true } });
        }

        steps.push({
          kind:'job',
          title:'Create archive job (job-based operation)',
          meta:{
            archiveStorage: cfg.archiveStorage || null,
            preferredSourceStorage: cfg.preferredSourceStorage || null,
            useCurrentPath: !!cfg.useCurrentPath,
            deleteAfterArchive: !!cfg.deleteAfterArchive
          }
        });

        if (cfg.deleteAfterArchive) {
          steps.push({ kind:'job', title:'Job sub-step: delete source high-res after successful archive', meta:{ deleteAfterArchive:true } });
        }

        return;
      }

      /* ---------- Update Metadata v2 ----------
         Iconik metadata model uses Categories, Views, Fields. [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.css)[2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)
      */
      if (type === 'Update metadata') {
        steps.push({ kind:'note', title:`Action #${i+1}: Update metadata (v2)`, meta: cfg });

        const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
        if (!targets.length) {
          steps.push({ kind:'note', title:'No targets configured (targets[] is empty)', meta:{} });
          return;
        }

        // Generic lookup note: mapping view/field names to IDs (sync later)
        steps.push({
          kind:'lookup',
          title:'Resolve metadata views/fields (name → id) using metadata resources (if needed)',
          meta:{ hint:'Metadata APIs/resources exist; exact endpoints resolved during sync (Domaine↔Site).' }
        }); // metadata resource exists in API reference list [2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)[1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.css)

        targets.forEach((t, ti) => {
          const viewName   = t?.metadataView?.name || '';
          const catName    = t?.category?.name || '';
          const onlyMarked = (typeof t.onlyMarked === 'boolean') ? t.onlyMarked : true;

          steps.push({
            kind:'compute',
            title:`Target #${ti+1}: category="${catName || '(none)'}" view="${viewName || '(none)'}"`,
            meta:{ onlyMarked }
          });

          const fields = Array.isArray(t.fields) ? t.fields : [];
          const selected = onlyMarked ? fields.filter(f => f.checked) : fields;

          // This is the key point: 1 step per selected field
          selected.forEach((f, fi) => {
            const fname = f?.field?.name || '';
            const mode  = f?.mode || null;
            const value = f?.value;

            // Tag cloud: show mode explicitly; it affects behavior
            const suffix = mode ? ` (mode=${mode})` : '';

            // Represent as HTTP-like step with placeholder endpoint
            steps.push({
              kind:'http',
              title:`Field #${fi+1}: update "${fname}"${suffix}`,
              method:'PATCH',
              // Metadata resource exists; endpoint here is a placeholder until sync pins exact payload shape. [2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)[1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.css)
              url:'/API/metadata/v1/assets/{ASSET_ID}/',
              body:{
                metadata_view: viewName,
                field: fname,
                value: value,
                mode: mode
              }
            });

            // If mode=Remove and value is empty, warn (common UX edge)
            if (String(mode||'').toLowerCase() === 'remove' && (value === '' || (Array.isArray(value) && value.length === 0))) {
              steps.push({
                kind:'note',
                title:`Warning: "${fname}" mode=Remove but value is empty (check expected behavior)`,
                meta:{ field: fname }
              });
            }
          });

          // Summarize per target
          steps.push({
            kind:'note',
            title:`Target #${ti+1} summary: ${selected.length} field(s) planned`,
            meta:{ view: viewName, onlyMarked }
          });
        });

        return;
      }

      // Fallback: keep it readable
      steps.push({ kind:'note', title:`Action #${i+1}: ${type || '(not set)'}`, meta: cfg });
    });

    // Global summary: show how many steps total (useful for “a checkbox induces N steps”)
    steps.push({ kind:'note', title:`Total planned steps: ${steps.length}`, meta:{} });

    return steps;
  }

  function planSteps(){
    if (window.currentKind === 'automation' && window.automationEnEdition) {
      return planAutomation(window.automationEnEdition);
    }
    return [];
  }

  /* ------------------ Renderers (DOM-only) ------------------ */
  function renderEasy(steps, box){
    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1} — ${s.title}`;
      block.appendChild(head);

      if (s.url) {
        const url = document.createElement('div');
        url.className = 'api-url';
        url.textContent = s.url;
        block.appendChild(url);
      }

      if (s.kind !== 'http' && s.kind !== 'note') {
        const h = document.createElement('div');
        h.className = 'api-headers';
        h.textContent =
          s.kind === 'job' ? 'Job-based step (can include sub-steps)' :
          s.kind === 'lookup' ? 'Lookup step (resolve ids/refs)' :
          s.kind === 'compute' ? 'Compute step (no network call)' : s.kind;
        block.appendChild(h);
      }

      box.appendChild(block);
    });
  }

  function renderTech(steps, box){
    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${(s.method || s.kind.toUpperCase())} #${i+1}`;
      block.appendChild(head);

      const url = document.createElement('div');
      url.className = 'api-url';
      url.textContent = s.url ? s.url : `(no url) — ${s.title}`;
      block.appendChild(url);

      const det = document.createElement('details');
      det.className = 'api-body';
      const sum = document.createElement('summary');
      sum.textContent = s.title;
      det.appendChild(sum);

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(s, null, 2);
      det.appendChild(pre);

      block.appendChild(det);
      box.appendChild(block);
    });
  }

  window.renderApiPreview = function(){
    const { box, empty } = ensurePreviewDom();
    if (!box || !empty) return;

    clearPreview(box, empty);

    const steps = planSteps();
    if (!steps.length) return;

    showPreview(box, empty);

    const mode = (localStorage.getItem(LS_KEY) || 'easy').toLowerCase();
    if (mode === 'tech') renderTech(steps, box);
    else renderEasy(steps, box);
  };

  try { window.renderApiPreview(); } catch {}

  console.log('[WFD] Planner patch applied: Update metadata v2 step-per-field');
})();

/* ========================================================================
   EASY nodes activation: set data-mode and add badge/title markup (DOM-only)
   - Paste at end of script-automations.js
   ======================================================================== */
(function(){
  const prevRender = window.renderApiPreview;
  if (typeof prevRender !== 'function') {
    console.warn('[WFD] renderApiPreview not found; cannot patch EASY nodes');
    return;
  }

  function badgeClass(step){
    const m = (step.method || '').toUpperCase();
    if (m === 'GET') return 'badge-get';
    if (m === 'POST') return 'badge-post';
    if (m === 'PUT') return 'badge-put';
    if (m === 'PATCH') return 'badge-patch';
    if (m === 'DELETE') return 'badge-delete';

    const k = (step.kind || '').toLowerCase();
    if (k === 'note') return 'badge-note';
    if (k === 'lookup') return 'badge-lookup';
    if (k === 'compute') return 'badge-compute';
    if (k === 'job') return 'badge-job';
    return 'badge-note';
  }

  function ensureEasyMarkup(){
    const box = document.getElementById('api-calls-container');
    if (!box) return;

    // Activate CSS node-like mode
    const mode = (localStorage.getItem('wfd_preview_mode') || 'easy').toLowerCase();
    if (mode === 'easy') box.dataset.mode = 'easy';
    else box.dataset.mode = '';

    // Convert existing EASY headers to badge+title if they are plain text
    if (mode !== 'easy') return;

    const blocks = Array.from(box.querySelectorAll('.api-call-block'));
    blocks.forEach((blk) => {
      const head = blk.querySelector('.api-method');
      if (!head) return;

      // If already transformed, skip
      if (head.querySelector('.step-badge')) return;

      // Parse the current text like: "GET #4 — Resolve ...", "NOTE #1 — ..."
      const txt = (head.textContent || '').trim();
      const match = txt.match(/^([A-Z]+)\s+#(\d+)\s+—\s+(.*)$/);
      const label = match ? match[1] : (txt.split(' ')[0] || 'NOTE');
      const title = match ? match[3] : txt;

      // Build DOM-only content
      head.textContent = '';
      const badge = document.createElement('span');
      badge.className = 'step-badge ' + (
        ['GET','POST','PUT','PATCH','DELETE'].includes(label) ? ('badge-' + label.toLowerCase()) : ('badge-' + label.toLowerCase())
      );
      // normalize a few non-method labels
      if (label === 'NOTE') badge.className = 'step-badge badge-note';
      if (label === 'LOOKUP') badge.className = 'step-badge badge-lookup';
      if (label === 'COMPUTE') badge.className = 'step-badge badge-compute';
      if (label === 'JOB') badge.className = 'step-badge badge-job';

      badge.textContent = label;
      head.appendChild(badge);

      const t = document.createElement('span');
      t.className = 'step-title';
      t.textContent = title;
      head.appendChild(t);
    });
  }

  // Wrap renderApiPreview to post-process DOM after it renders
  window.renderApiPreview = function(){
    const r = prevRender.apply(this, arguments);
    try { ensureEasyMarkup(); } catch(e){ console.warn('[WFD] ensureEasyMarkup failed', e); }
    return r;
  };

  // Also run once on load
  document.addEventListener('DOMContentLoaded', () => {
    try { ensureEasyMarkup(); } catch {}
  });

  console.log('[WFD] EASY nodes patch installed');
})();

/* ========================================================================
   FIX: Keep EASY node styling when toggling EASY <-> ENGINEER
   - Always sets #api-calls-container[data-mode="easy"] in EASY
   - Always rebuilds badge+title markup if missing
   - Runs after every renderApiPreview + on toggle clicks
   ======================================================================== */
(function(){
  const MODE_KEY = 'wfd_preview_mode';

  function getMode(){
    return (localStorage.getItem(MODE_KEY) || 'easy').toLowerCase();
  }

  function box(){
    return document.getElementById('api-calls-container');
  }

  function setDataMode(){
    const b = box();
    if (!b) return;
    const m = getMode();
    if (m === 'easy') b.dataset.mode = 'easy';
    else b.dataset.mode = '';
  }

  function badgeClass(label){
    const up = (label || '').toUpperCase();
    if (up === 'GET') return 'badge-get';
    if (up === 'POST') return 'badge-post';
    if (up === 'PUT') return 'badge-put';
    if (up === 'PATCH') return 'badge-patch';
    if (up === 'DELETE') return 'badge-delete';

    if (up === 'NOTE') return 'badge-note';
    if (up === 'LOOKUP') return 'badge-lookup';
    if (up === 'COMPUTE') return 'badge-compute';
    if (up === 'JOB') return 'badge-job';
    return 'badge-note';
  }

  function applyEasyMarkup(){
    const b = box();
    if (!b) return;
    if (getMode() !== 'easy') return;

    // ensure CSS selector activates
    b.dataset.mode = 'easy';

    const blocks = Array.from(b.querySelectorAll('.api-call-block'));
    blocks.forEach((blk) => {
      const head = blk.querySelector('.api-method');
      if (!head) return;

      // already converted
      if (head.querySelector('.step-badge') && head.querySelector('.step-title')) return;

      const txt = (head.textContent || '').trim();

      // expected: "GET #4 — ..." or "NOTE #1 — ..." (your planner format)
      const match = txt.match(/^([A-Z]+)\s+#(\d+)\s+—\s+(.*)$/);
      const label = match ? match[1] : (txt.split(' ')[0] || 'NOTE');
      const title = match ? match[3] : txt;

      // rebuild DOM-only
      head.replaceChildren();

      const badge = document.createElement('span');
      badge.className = 'step-badge ' + badgeClass(label);
      badge.textContent = label;
      head.appendChild(badge);

      const t = document.createElement('span');
      t.className = 'step-title';
      t.textContent = title;
      head.appendChild(t);
    });
  }

  function refreshEasyStyling(){
    // run after the DOM has been updated
    setDataMode();
    // double RAF to ensure planner finished painting
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setDataMode();
      applyEasyMarkup();
    }));
  }

  // 1) Wrap renderApiPreview (whatever version is currently active)
  if (typeof window.renderApiPreview === 'function') {
    const prev = window.renderApiPreview;
    window.renderApiPreview = function(){
      const r = prev.apply(this, arguments);
      refreshEasyStyling();
      return r;
    };
  }

  // 2) Also apply on toggle clicks (belt & suspenders)
  document.addEventListener('DOMContentLoaded', () => {
    const bEasy = document.getElementById('btnPreviewEasy');
    const bTech = document.getElementById('btnPreviewTech');
    if (bEasy) bEasy.addEventListener('click', refreshEasyStyling);
    if (bTech) bTech.addEventListener('click', refreshEasyStyling);

    refreshEasyStyling();
  });

  console.log('[WFD] EASY styling persistence installed');
})();

/* ========================================================================
   ONE TRUE PLANNER — FINAL OVERRIDE (must be last block in file)
   Stable EASY/ENGINEER, no random step sets
   ======================================================================== */
(function(){
  const MODE_KEY = 'wfd_preview_mode';
  const $ = (id) => document.getElementById(id);

  function getMode(){
    const m = (localStorage.getItem(MODE_KEY) || 'easy').toLowerCase();
    return (m === 'tech' || m === 'engineer') ? 'tech' : 'easy';
  }

  function setMode(next){
    localStorage.setItem(MODE_KEY, next);
    setActiveButtons();
    window.renderApiPreview && window.renderApiPreview();
  }

  function setActiveButtons(){
    const easy = $('btnPreviewEasy');
    const tech = $('btnPreviewTech');
    if (easy) easy.classList.toggle('active', getMode() === 'easy');
    if (tech) tech.classList.toggle('active', getMode() === 'tech');
  }

  function ensurePreviewDom(){
    const content = $('api-preview-content') || document.querySelector('.preview-content');
    if (!content) return { box:null, empty:null };

    let empty = content.querySelector('.preview-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'preview-empty';
      const p = document.createElement('p');
      p.textContent = 'Ajoutez des triggers et des actions pour voir les API calls correspondants';
      empty.appendChild(p);
      content.appendChild(empty);
    }

    let box = $('api-calls-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'api-calls-container';
      box.style.display = 'none';
      content.appendChild(box);
    }

    return { box, empty };
  }

  function clear(box, empty){
    box.replaceChildren();
    box.style.display = 'none';
    empty.style.display = '';
  }

  function show(box, empty){
    empty.style.display = 'none';
    box.style.display = 'block';
  }

  /* ---------------- Planner ---------------- */

  function planAutomation(a){
    const steps = [];

    steps.push({
      kind: 'note',
      title: `Automation: ${a.nom || '(Sans nom)'}`,
      meta: { triggers:(a.triggers||[]).map(t=>t.type), actions:(a.actions||[]).map(x=>x.type) }
    });

    (a.triggers||[]).forEach((t,i) => {
      steps.push({ kind:'note', title:`Trigger #${i+1}: ${t.type || '(not set)'}`, meta:t.config||{} });
    });

    (a.actions||[]).forEach((ac,i) => {
      const type = ac.type || '';
      const cfg  = ac.config || {};

      // Archive asset (option-dependent)
      if (type === 'Archive asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Archive asset`, meta:cfg });

        steps.push({
          kind:'lookup',
          title:'Resolve storages (archive/source) by name → id (if needed)',
          method:'GET',
          url:'/API/files/v1/storages/'
        });

        if (cfg.allowTransfersThroughIconik) {
          steps.push({ kind:'note', title:'Option: Allow transfers through Iconik (potential egress costs)', meta:{allowTransfersThroughIconik:true} });
        }

        if (cfg.useCurrentPath) {
          steps.push({ kind:'lookup', title:'Get source path for the asset format (mirror on archive storage)', meta:{useCurrentPath:true} });
          steps.push({ kind:'compute', title:'Compute destinationPath = archiveStorageRoot + sourcePath', meta:{destinationPath:'{ARCHIVE_ROOT}/{SOURCE_PATH}'} });
          steps.push({ kind:'job', title:'Job sub-step: apply destinationPath to archive operation', meta:{applyPath:true} });
        }

        steps.push({
          kind:'job',
          title:'Create archive job (job-based operation)',
          meta:{
            archiveStorage: cfg.archiveStorage || null,
            preferredSourceStorage: cfg.preferredSourceStorage || null,
            useCurrentPath: !!cfg.useCurrentPath,
            deleteAfterArchive: !!cfg.deleteAfterArchive
          }
        });

        if (cfg.deleteAfterArchive) {
          steps.push({ kind:'job', title:'Job sub-step: delete source high-res after successful archive', meta:{deleteAfterArchive:true} });
        }

        return;
      }

      // Update metadata v2 (targets[] step-per-field)
      if (type === 'Update metadata') {
        steps.push({ kind:'note', title:`Action #${i+1}: Update metadata (v2)`, meta:cfg });

        const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
        targets.forEach((t,ti) => {
          const viewName = t?.metadataView?.name || '';
          const catName  = t?.category?.name || '';
          const onlyMarked = (typeof t.onlyMarked === 'boolean') ? t.onlyMarked : true;

          steps.push({ kind:'compute', title:`Target #${ti+1}: category="${catName||'(none)'}" view="${viewName||'(none)'}"`, meta:{onlyMarked} });

          const fields = Array.isArray(t.fields) ? t.fields : [];
          const selected = onlyMarked ? fields.filter(f=>f.checked) : fields;

          selected.forEach((f,fi) => {
            const fname = f?.field?.name || '';
            const mode  = f?.mode || null;
            steps.push({
              kind:'http',
              title:`Field #${fi+1}: update "${fname}"${mode ? ` (mode=${mode})` : ''}`,
              method:'PATCH',
              url:'/API/metadata/v1/assets/{ASSET_ID}/',
              body:{ metadata_view:viewName, field:fname, value:f?.value, mode }
            });
          });

          steps.push({ kind:'note', title:`Target #${ti+1} summary: ${selected.length} field(s) planned`, meta:{view:viewName} });
        });

        return;
      }

      // Set ACL on asset
      if (type === 'Set ACL on asset') {
        steps.push({ kind:'note', title:`Action #${i+1}: Set ACL on asset`, meta:cfg });
        steps.push({
          kind:'http',
          title:'Apply ACL on asset',
          method:'PUT',
          url:'/API/acls/v1/acl/assets/{ASSET_ID}/',
          body:{ applyMode: cfg.applyMode || 'Append', users: cfg.users||[], teams: cfg.teams||[], permissions: cfg.permissions||[] }
        });
        return;
      }

      // Fallback
      steps.push({ kind:'note', title:`Action #${i+1}: ${type || '(not set)'}`, meta:cfg });
    });

    steps.push({ kind:'note', title:`Total planned steps: ${steps.length}`, meta:{} });
    return steps;
  }

  function planSteps(){
    if (window.currentKind === 'automation' && window.automationEnEdition) {
      return planAutomation(window.automationEnEdition);
    }
    return [];
  }

  /* ---------------- Renderers ---------------- */

  function badgeClass(step){
    const m = (step.method || '').toUpperCase();
    if (m === 'GET') return 'badge-get';
    if (m === 'POST') return 'badge-post';
    if (m === 'PUT') return 'badge-put';
    if (m === 'PATCH') return 'badge-patch';
    if (m === 'DELETE') return 'badge-delete';

    const k = (step.kind || '').toLowerCase();
    if (k === 'note') return 'badge-note';
    if (k === 'lookup') return 'badge-lookup';
    if (k === 'compute') return 'badge-compute';
    if (k === 'job') return 'badge-job';
    return 'badge-note';
  }

  function label(step){
    return (step.method ? step.method.toUpperCase() : (step.kind || 'NOTE').toUpperCase());
  }

  function renderEasy(steps, box){
    box.dataset.mode = 'easy';

    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';

      const b = document.createElement('span');
      b.className = 'step-badge ' + badgeClass(s);
      b.textContent = label(s);
      head.appendChild(b);

      const t = document.createElement('span');
      t.className = 'step-title';
      t.textContent = `#${i+1} — ${s.title}`;
      head.appendChild(t);

      block.appendChild(head);

      if (s.url) {
        const url = document.createElement('div');
        url.className = 'api-url';
        url.textContent = s.url;
        block.appendChild(url);
      }

      if (s.kind !== 'http' && s.kind !== 'note') {
        const h = document.createElement('div');
        h.className = 'api-headers';
        h.textContent =
          s.kind === 'job' ? 'Job-based step (can include sub-steps)' :
          s.kind === 'lookup' ? 'Lookup step (resolve ids/refs)' :
          s.kind === 'compute' ? 'Compute step (no network call)' : s.kind;
        block.appendChild(h);
      }

      box.appendChild(block);
    });
  }

  function renderTech(steps, box){
    box.dataset.mode = '';

    steps.forEach((s,i) => {
      const block = document.createElement('div');
      block.className = 'api-call-block';

      const head = document.createElement('div');
      head.className = 'api-method';
      head.textContent = `${label(s)} #${i+1}`;
      block.appendChild(head);

      const url = document.createElement('div');
      url.className = 'api-url';
      url.textContent = s.url ? s.url : `(no url) — ${s.title}`;
      block.appendChild(url);

      const det = document.createElement('details');
      det.className = 'api-body';
      const sum = document.createElement('summary');
      sum.textContent = s.title;
      det.appendChild(sum);

      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(s, null, 2);
      det.appendChild(pre);

      block.appendChild(det);
      box.appendChild(block);
    });
  }

  // FINAL override: this must be the last assignment in the whole file
  window.renderApiPreview = function(){
    const { box, empty } = ensurePreviewDom();
    if (!box || !empty) return;

    clear(box, empty);

    const steps = planSteps();
    if (!steps.length) return;

    show(box, empty);

    if (getMode() === 'tech') renderTech(steps, box);
    else renderEasy(steps, box);
  };

  // Bind buttons (again, safe even if already bound)
  document.addEventListener('DOMContentLoaded', () => {
    const bEasy = $('btnPreviewEasy');
    const bTech = $('btnPreviewTech');
    if (bEasy) bEasy.addEventListener('click', () => setMode('easy'));
    if (bTech) bTech.addEventListener('click', () => setMode('tech'));
    setActiveButtons();
    window.renderApiPreview && window.renderApiPreview();
  });

  console.log('[WFD] ONE TRUE PLANNER installed (final override)');
})();

/* ========================================================================
   EASY Grouping (A): group by Action and Target in the preview panel
   - Inserts .step-group headers before related blocks
   - DOM-only, idempotent, does not change step count
   ======================================================================== */
(function(){
  const MODE_KEY = 'wfd_preview_mode';

  function getMode(){
    const m = (localStorage.getItem(MODE_KEY) || 'easy').toLowerCase();
    return (m === 'tech' || m === 'engineer') ? 'tech' : 'easy';
  }

  function groupEasyPreview(){
    if (getMode() !== 'easy') return;

    const box = document.getElementById('api-calls-container');
    if (!box) return;

    // Only in EASY node mode
    if (box.dataset.mode !== 'easy') return;

    // Avoid regrouping if already done
    if (box.dataset.grouped === '1') return;

    const blocks = Array.from(box.querySelectorAll('.api-call-block'));
    if (!blocks.length) return;

    // Helper: read the "human title" from the node header
    function getTitle(block){
      const t = block.querySelector('.api-method .step-title');
      if (!t) return '';
      // Our easy title is "#n — <title>"
      const s = (t.textContent || '').trim();
      const parts = s.split('—');
      return (parts.length >= 2) ? parts.slice(1).join('—').trim() : s;
    }

    // Insert group headers
    blocks.forEach((blk) => {
      const title = getTitle(blk);

      // Action group header
      if (/^Action\s+#\d+\s*:/i.test(title)) {
        const g = document.createElement('div');
        g.className = 'step-group';
        g.textContent = title;        // e.g. "Action #1: Archive asset"
        box.insertBefore(g, blk);
        return;
      }

      // Target group header
      if (/^Target\s+#\d+\s*:/i.test(title)) {
        const g = document.createElement('div');
        g.className = 'step-group';
        g.textContent = title;        // e.g. 'Target #1: category="..." view="..."'
        box.insertBefore(g, blk);
        return;
      }
    });

    box.dataset.grouped = '1';
  }

  // Wrap renderApiPreview to group after it renders
  const prev = window.renderApiPreview;
  if (typeof prev !== 'function') return;

  window.renderApiPreview = function(){
    // reset grouping marker each time (because we rebuild children)
    const box = document.getElementById('api-calls-container');
    if (box) box.dataset.grouped = '0';

    const r = prev.apply(this, arguments);
    // Let DOM settle then group
    requestAnimationFrame(() => groupEasyPreview());
    return r;
  };

  console.log('[WFD] EASY grouping installed (Action/Target)');
})();

/* ========================================================================
   C) EASY Summary: show counts (Total / HTTP / Note / Lookup / Compute / Job)
   - Post-process DOM after renderApiPreview
   - Does not modify the planner itself (safe)
   ======================================================================== */
(function(){
  if (window.__wfdEasySummaryInstalled) return;
  window.__wfdEasySummaryInstalled = true;

  const MODE_KEY = 'wfd_preview_mode';

  function getMode(){
    const m = (localStorage.getItem(MODE_KEY) || 'easy').toLowerCase();
    return (m === 'tech' || m === 'engineer') ? 'tech' : 'easy';
  }

  function getBox(){
    return document.getElementById('api-calls-container');
  }

  function removeSummary(){
    const box = getBox();
    if (!box) return;
    const s = box.querySelector('.step-summary');
    if (s) s.remove();
  }

  function badgeText(block){
    const b = block.querySelector('.api-method .step-badge');
    return (b?.textContent || '').trim().toUpperCase();
  }

  function headersText(block){
    const h = block.querySelector('.api-headers');
    return (h?.textContent || '').trim().toLowerCase();
  }

  function computeCounts(){
    const box = getBox();
    if (!box) return null;

    // Only if we are truly in EASY node mode
    if (getMode() !== 'easy') return null;
    if (box.dataset.mode !== 'easy') return null;

    const blocks = Array.from(box.querySelectorAll('.api-call-block'));
    if (!blocks.length) return null;

    const total = blocks.length;

    const httpMethods = new Set(['GET','POST','PUT','PATCH','DELETE']);
    let http = 0, note = 0, lookup = 0, compute = 0, job = 0;

    blocks.forEach(b => {
      const bt = badgeText(b);
      const ht = headersText(b);

      if (httpMethods.has(bt)) http++;
      if (bt === 'NOTE') note++;

      // Classification by the hint line in EASY (added for non-http/note kinds)
      if (ht.includes('lookup step')) lookup++;
      if (ht.includes('compute step')) compute++;
      if (ht.includes('job-based')) job++;
    });

    return { total, http, note, lookup, compute, job };
  }

  function renderSummary(){
    const box = getBox();
    if (!box) return;

    // Remove if not in EASY
    if (getMode() !== 'easy' || box.dataset.mode !== 'easy') {
      removeSummary();
      return;
    }

    const counts = computeCounts();
    if (!counts) return;

    // Build summary node
    let summary = box.querySelector('.step-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'step-group step-summary';
      // Put at very top
      box.insertBefore(summary, box.firstChild);
    }

    summary.textContent =
      `Résumé — Total: ${counts.total} | HTTP: ${counts.http} | NOTE: ${counts.note} | LOOKUP: ${counts.lookup} | COMPUTE: ${counts.compute} | JOB: ${counts.job}`;
  }

  // Wrap renderApiPreview once (safe)
  const prev = window.renderApiPreview;
  if (typeof prev !== 'function') return;

  window.renderApiPreview = function(){
    const r = prev.apply(this, arguments);
    // Let DOM settle
    requestAnimationFrame(() => requestAnimationFrame(renderSummary));
    return r;
  };

  // Also update on mode switch clicks (belt & suspenders)
  document.addEventListener('DOMContentLoaded', () => {
    const bEasy = document.getElementById('btnPreviewEasy');
    const bTech = document.getElementById('btnPreviewTech');
    if (bEasy) bEasy.addEventListener('click', () => setTimeout(renderSummary, 0));
    if (bTech) bTech.addEventListener('click', () => setTimeout(renderSummary, 0));
  });

  console.log('[WFD] EASY summary (C) installed');
})();

/* ========================================================================
   B) ENGINEER: add "curl" (copyable) for HTTP steps
   - Adds a <details> "curl" section per api-call-block when mode is TECH
   - Uses placeholders: {HOST}, {app_id}, {auth_token}
   - DOM-only, idempotent
   ======================================================================== */
(function(){
  if (window.__wfdEngineerCurlInstalled) return;
  window.__wfdEngineerCurlInstalled = true;

  const MODE_KEY = 'wfd_preview_mode';

  function getMode(){
    const m = (localStorage.getItem(MODE_KEY) || 'easy').toLowerCase();
    return (m === 'tech' || m === 'engineer') ? 'tech' : 'easy';
  }

  function isHttpMethod(m){
    return ['GET','POST','PUT','PATCH','DELETE'].includes((m||'').toUpperCase());
  }

  function parseMethodFromHeader(block){
    const head = block.querySelector('.api-method');
    const txt = (head?.textContent || '').trim().toUpperCase(); // ex: "PATCH #7"
    const m = txt.split(/\s+/)[0];
    return isHttpMethod(m) ? m : '';
  }

  function getUrlFromBlock(block){
    const urlEl = block.querySelector('.api-url');
    const u = (urlEl?.textContent || '').trim();
    return u; // ex: "/API/files/v1/storages/"
  }

  function getBodyFromBlock(block){
    // In ENGINEER, we store JSON in details pre (we printed step JSON)
    const pre = block.querySelector('.api-body pre');
    if (!pre) return null;
    try {
      const obj = JSON.parse(pre.textContent || '{}');
      return (typeof obj.body === 'undefined') ? null : obj.body;
    } catch {
      return null;
    }
  }

  function shellEscapeSingleQuotes(s){
    // For bash: close quote, escape single quote, reopen
    // ' -> '"'"'
    return String(s).replace(/'/g, `'\"'\"'`);
  }

  function buildCurl(method, url, body){
    // iconik docs show headers App-ID and Auth-Token + Content-Type in curl examples [1](https://www.iconik.io/api-first-development)
    const host = '{HOST}'; // keep as placeholder (domain/site specific) [2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/automations.html)
    const full = url.startsWith('http') ? url : `${host}${url}`;

    const lines = [];
    lines.push(`curl -X ${method} \\`);
    lines.push(`  --header 'Content-Type: application/json' \\`);
    lines.push(`  --header 'App-ID: {app_id}' \\`);
    lines.push(`  --header 'Auth-Token: {auth_token}' \\`);

    if (body && method !== 'GET') {
      const json = JSON.stringify(body, null, 2);
      const esc = shellEscapeSingleQuotes(json);
      lines.push(`  --data '${esc}' \\`);
    }

    lines.push(`  '${full}'`);
    return lines.join('\n');
  }

  function ensureCurlForBlock(block){
    // do not duplicate
    if (block.querySelector('.curl-details')) return;

    const method = parseMethodFromHeader(block);
    if (!method) return;

    const url = getUrlFromBlock(block);
    if (!url) return;

    const body = getBodyFromBlock(block);

    const details = document.createElement('details');
    details.className = 'api-body curl-details';

    const summary = document.createElement('summary');
    summary.textContent = 'curl (copiable)';
    details.appendChild(summary);

    // Copy button row
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.padding = '10px';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-add-small';
    btn.textContent = 'Copier curl';
    row.appendChild(btn);

    const hint = document.createElement('div');
    hint.className = 'section-hint';
    hint.style.margin = '0';
    hint.textContent = 'Remplacer {HOST}, {app_id}, {auth_token}.';
    row.appendChild(hint);

    details.appendChild(row);

    const pre = document.createElement('pre');
    const curl = buildCurl(method, url, body);
    pre.textContent = curl;
    details.appendChild(pre);

    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(curl);
        btn.textContent = 'Copié ✅';
        setTimeout(() => (btn.textContent = 'Copier curl'), 1200);
      } catch {
        // fallback: select text
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        btn.textContent = 'Sélectionné ⬇';
        setTimeout(() => (btn.textContent = 'Copier curl'), 1200);
      }
    });

    block.appendChild(details);
  }

  function applyEngineerCurl(){
    if (getMode() !== 'tech') return;

    const box = document.getElementById('api-calls-container');
    if (!box) return;

    const blocks = Array.from(box.querySelectorAll('.api-call-block'));
    blocks.forEach(ensureCurlForBlock);
  }

  // Wrap renderApiPreview to post-process when in TECH
  const prev = window.renderApiPreview;
  if (typeof prev !== 'function') return;

  window.renderApiPreview = function(){
    const r = prev.apply(this, arguments);
    // after DOM render
    requestAnimationFrame(() => requestAnimationFrame(applyEngineerCurl));
    return r;
  };

  // Also run on toggle click
  document.addEventListener('DOMContentLoaded', () => {
    const bTech = document.getElementById('btnPreviewTech');
    if (bTech) bTech.addEventListener('click', () => setTimeout(applyEngineerCurl, 0));
  });

  console.log('[WFD] ENGINEER curl installed');
})();

/* ========================================================================
   Sidebar global filter (ALL / ACTIVE / INACTIVE / DRAFT)
   - Filters cassettes by dot class: on/off/local/unknown
   - Persists selection in localStorage
   - Re-applies after list re-render
   ======================================================================== */
(function(){
  const LS_KEY = 'wfd_sidebar_filter';
  const MODES = ['all','active','inactive','draft'];

  function getMode(){
    const m = (localStorage.getItem(LS_KEY) || 'all').toLowerCase();
    return MODES.includes(m) ? m : 'all';
  }

  function setMode(mode){
    const m = MODES.includes(mode) ? mode : 'all';
    localStorage.setItem(LS_KEY, m);
    updateButtons(m);
    applyFilter(m);
  }

  function updateButtons(mode){
    const ids = {
      all: 'filterAll',
      active: 'filterActive',
      inactive: 'filterInactive',
      draft: 'filterDraft'
    };
    Object.entries(ids).forEach(([k, id]) => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('active', k === mode);
    });
  }

  function stateOfCassette(cassette){
    // state derived from dot class
    const dot = cassette.querySelector('.cassette-dot');
    if (!dot) return 'unknown';
    if (dot.classList.contains('local')) return 'draft';
    if (dot.classList.contains('on')) return 'active';
    if (dot.classList.contains('off')) return 'inactive';
    if (dot.classList.contains('unknown')) return 'unknown';
    return 'unknown';
  }

  function applyFilter(mode){
    const m = mode || getMode();
    const lists = [
      document.getElementById('automations-list'),
      document.getElementById('webhooks-list'),
      document.getElementById('custom-actions-list')
    ].filter(Boolean);

    lists.forEach(list => {
      const items = Array.from(list.querySelectorAll('.set-cassette'));
      items.forEach(c => {
        const st = stateOfCassette(c);
        const show =
          (m === 'all') ||
          (m === 'active' && st === 'active') ||
          (m === 'inactive' && st === 'inactive') ||
          (m === 'draft' && st === 'draft');

        c.style.display = show ? '' : 'none';
      });
    });
  }

  function bindButtons(){
    const bAll = document.getElementById('filterAll');
    const bA   = document.getElementById('filterActive');
    const bI   = document.getElementById('filterInactive');
    const bD   = document.getElementById('filterDraft');

    if (bAll) bAll.addEventListener('click', () => setMode('all'));
    if (bA)   bA.addEventListener('click', () => setMode('active'));
    if (bI)   bI.addEventListener('click', () => setMode('inactive'));
    if (bD)   bD.addEventListener('click', () => setMode('draft'));
  }

  // Hook after render of lists: wrap afficherTousLesElements if available
  function hookRerender(){
    const prev = window.afficherTousLesElements;
    if (typeof prev !== 'function') return;

    window.afficherTousLesElements = function(){
      const r = prev.apply(this, arguments);
      // allow DOM to settle, then apply filter
      setTimeout(() => applyFilter(getMode()), 0);
      return r;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindButtons();
    hookRerender();

    const m = getMode();
    updateButtons(m);
    // apply immediately
    setTimeout(() => applyFilter(m), 0);
  });

  // Also expose for debug if needed
  window.__wfdApplySidebarFilter = () => applyFilter(getMode());

  console.log('[WFD] Sidebar filter installed');
})();

/* ========================================================================
   Canvas UX polish:
   1) Inline green "Saved" message under Automation Name
   2) Canvas switch animation on automation selection
   ======================================================================== */
(function(){
  // --- (A) Helpers: ensure anchors exist (name input + error + ok slots)
  function ensureNameNodes(){
    const editor = document.getElementById('canvas-editor');
    if (!editor) return null;

    // We target the first editor-section (Informations)
    const info = editor.querySelector('.editor-section');
    if (!info) return null;

    const labels = Array.from(info.querySelectorAll('.field-label'));
    const nomLabel = labels.find(l => (l.textContent || '').trim().toLowerCase().startsWith('nom'));
    const group = nomLabel && nomLabel.closest('.form-group');
    const input = group && group.querySelector('input.field-input');
    if (!input) return null;

    // Force stable id
    input.id = 'aut-name';

    // Error node (red) if not exists
    let err = document.getElementById('aut-name-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'aut-name-error';
      err.className = 'section-hint';
      err.textContent = '';
      input.insertAdjacentElement('afterend', err);
    }

    // OK node (green) if not exists (insert after error for consistent place)
    let ok = document.getElementById('aut-name-ok');
    if (!ok) {
      ok = document.createElement('div');
      ok.id = 'aut-name-ok';
      ok.textContent = '';
      // place just after error node
      err.insertAdjacentElement('afterend', ok);
    }

    // Clear messages when typing
    if (!input.__wfdMsgHooked) {
      input.addEventListener('input', () => {
        err.textContent = '';
        ok.textContent = '';
        ok.classList.remove('fade-out');
      });
      input.__wfdMsgHooked = true;
    }

    return { input, err, ok };
  }

  function showSavedOk(text){
    const nodes = ensureNameNodes();
    if (!nodes) return;
    nodes.err.textContent = '';
    nodes.ok.textContent = text || '✅ Sauvegardé';
    nodes.ok.classList.remove('fade-out');
    // fade after a moment
    setTimeout(() => {
      nodes.ok.classList.add('fade-out');
      // clear text after animation
      setTimeout(() => { nodes.ok.textContent = ''; nodes.ok.classList.remove('fade-out'); }, 1300);
    }, 600);
  }

  // --- (B) Save feedback: wrap saveCurrent and detect "successful" saves
  const prevSave = window.saveCurrent;
  if (typeof prevSave === 'function') {
    window.saveCurrent = function(){
      // Snapshot before
      const before = localStorage.getItem('automationsData') || '';
      const r = prevSave.apply(this, arguments);
      const after = localStorage.getItem('automationsData') || '';

      // Only show for automation saves, and only if something changed
      if (window.currentKind === 'automation' && after !== before) {
        showSavedOk('✅ Sauvegardé');
      }
      return r;
    };
  }

  // --- (C) Canvas switch animation: wrap openEditor
  const prevOpen = window.openEditor;
  if (typeof prevOpen === 'function') {
    window.openEditor = function(kind, key){
      const r = prevOpen.apply(this, arguments);

      // Only animate when switching automation (your risk case)
      if (kind === 'automation') {
        const ed = document.getElementById('canvas-editor');
        if (ed) {
          ed.classList.remove('canvas-switch');
          // force reflow to restart animation
          void ed.offsetWidth;
          ed.classList.add('canvas-switch');
          ed.addEventListener('animationend', () => ed.classList.remove('canvas-switch'), { once:true });
        }
      }
      // ensure name nodes exist when editor is visible
      setTimeout(() => { try { ensureNameNodes(); } catch {} }, 0);

      return r;
    };
  }

  console.log('[WFD] Canvas UX polish installed (saved inline + switch animation)');
})();

/* ========================================================================
   Canvas UX polish:
   1) Inline green "Saved" message under Automation Name
   2) Canvas switch animation on automation selection
   ======================================================================== */
(function(){
  // --- (A) Helpers: ensure anchors exist (name input + error + ok slots)
  function ensureNameNodes(){
    const editor = document.getElementById('canvas-editor');
    if (!editor) return null;

    // We target the first editor-section (Informations)
    const info = editor.querySelector('.editor-section');
    if (!info) return null;

    const labels = Array.from(info.querySelectorAll('.field-label'));
    const nomLabel = labels.find(l => (l.textContent || '').trim().toLowerCase().startsWith('nom'));
    const group = nomLabel && nomLabel.closest('.form-group');
    const input = group && group.querySelector('input.field-input');
    if (!input) return null;

    // Force stable id
    input.id = 'aut-name';

    // Error node (red) if not exists
    let err = document.getElementById('aut-name-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'aut-name-error';
      err.className = 'section-hint';
      err.textContent = '';
      input.insertAdjacentElement('afterend', err);
    }

    // OK node (green) if not exists (insert after error for consistent place)
    let ok = document.getElementById('aut-name-ok');
    if (!ok) {
      ok = document.createElement('div');
      ok.id = 'aut-name-ok';
      ok.textContent = '';
      // place just after error node
      err.insertAdjacentElement('afterend', ok);
    }

    // Clear messages when typing
    if (!input.__wfdMsgHooked) {
      input.addEventListener('input', () => {
        err.textContent = '';
        ok.textContent = '';
        ok.classList.remove('fade-out');
      });
      input.__wfdMsgHooked = true;
    }

    return { input, err, ok };
  }

  function showSavedOk(text){
    const nodes = ensureNameNodes();
    if (!nodes) return;
    nodes.err.textContent = '';
    nodes.ok.textContent = text || '✅ Sauvegardé';
    nodes.ok.classList.remove('fade-out');
    // fade after a moment
    setTimeout(() => {
      nodes.ok.classList.add('fade-out');
      // clear text after animation
      setTimeout(() => { nodes.ok.textContent = ''; nodes.ok.classList.remove('fade-out'); }, 1300);
    }, 600);
  }

  // --- (B) Save feedback: wrap saveCurrent and detect "successful" saves
  const prevSave = window.saveCurrent;
  if (typeof prevSave === 'function') {
    window.saveCurrent = function(){
      // Snapshot before
      const before = localStorage.getItem('automationsData') || '';
      const r = prevSave.apply(this, arguments);
      const after = localStorage.getItem('automationsData') || '';

      // Only show for automation saves, and only if something changed
      if (window.currentKind === 'automation' && after !== before) {
        showSavedOk('✅ Sauvegardé');
      }
      return r;
    };
  }

  // --- (C) Canvas switch animation: wrap openEditor
  const prevOpen = window.openEditor;
  if (typeof prevOpen === 'function') {
    window.openEditor = function(kind, key){
      const r = prevOpen.apply(this, arguments);

      // Only animate when switching automation (your risk case)
      if (kind === 'automation') {
        const ed = document.getElementById('canvas-editor');
        if (ed) {
          ed.classList.remove('canvas-switch');
          // force reflow to restart animation
          void ed.offsetWidth;
          ed.classList.add('canvas-switch');
          ed.addEventListener('animationend', () => ed.classList.remove('canvas-switch'), { once:true });
        }
      }
      // ensure name nodes exist when editor is visible
      setTimeout(() => { try { ensureNameNodes(); } catch {} }, 0);

      return r;
    };
  }

  console.log('[WFD] Canvas UX polish installed (saved inline + switch animation)');
})();

/* ========================================================================
   UX polish v2:
   1) Save success uses SAME inline slot as error (green), no layout jump
   2) Canvas switch uses “volet” slide animation (no flash)
   ======================================================================== */
(function(){
  // --- helpers: find the existing inline message node (aut-name-error)
  function getNameMessageNode(){
    // ton système crée déjà aut-name-error dans le canvas
    return document.getElementById('aut-name-error');
  }

  function showInlineOk(msg){
    const n = getNameMessageNode();
    if (!n) return;

    // même slot, juste vert
    n.classList.add('is-ok');
    n.classList.remove('fade');
    n.style.opacity = '1';
    n.textContent = msg || '✅ Sauvegardé';

    // fade discret (sans changer la hauteur)
    setTimeout(() => {
      n.classList.add('fade');
      setTimeout(() => {
        n.textContent = '';
        n.classList.remove('fade');
        n.classList.remove('is-ok');
        n.style.opacity = '1';
      }, 1300);
    }, 600);
  }

  // Wrap saveCurrent: on affiche OK uniquement si ça a vraiment persisté
  const prevSave = window.saveCurrent;
  if (typeof prevSave === 'function') {
    window.saveCurrent = function(){
      const before = localStorage.getItem('automationsData') || '';
      const r = prevSave.apply(this, arguments);
      const after  = localStorage.getItem('automationsData') || '';

      if (window.currentKind === 'automation' && after !== before) {
        showInlineOk('✅ Sauvegardé');
      }
      return r;
    };
  }

  // Canvas “volet” animation on automation switch
  const prevOpen = window.openEditor;
  if (typeof prevOpen === 'function') {
    window.openEditor = function(kind, key){
      const r = prevOpen.apply(this, arguments);

      if (kind === 'automation') {
        const ed = document.getElementById('canvas-editor');
        if (ed) {
          ed.classList.remove('canvas-volet');
          // restart animation reliably
          void ed.offsetWidth;
          ed.classList.add('canvas-volet');
          ed.addEventListener('animationend', () => ed.classList.remove('canvas-volet'), { once:true });
        }
      }

      return r;
    };
  }

  console.log('[WFD] UX polish v2 installed (inline ok + volet)');
})();

/* ========================================================================
   Fix doublon "Sauvegardé":
   - Supprime l'ancien #aut-name-ok s'il est encore créé par un patch historique
   - Anti-double-trigger: évite l'affichage 2x si saveCurrent est wrappé plusieurs fois
   ======================================================================== */
(function(){
  // anti-double: limite l'affichage à 1 fois / 800ms
  let lastOkTs = 0;

  function cleanupOldOkSlot(){
    const ok = document.getElementById('aut-name-ok');
    if (ok) ok.remove();
  }

  function showOkOnce(msg){
    const now = Date.now();
    if (now - lastOkTs < 800) return; // stop double triggers
    lastOkTs = now;

    const n = document.getElementById('aut-name-error'); // slot unique
    if (!n) return;

    n.classList.add('is-ok');
    n.classList.remove('fade');
    n.style.opacity = '1';
    n.textContent = msg || '✅ Sauvegardé';

    setTimeout(() => {
      n.classList.add('fade');
      setTimeout(() => {
        n.textContent = '';
        n.classList.remove('fade');
        n.classList.remove('is-ok');
        n.style.opacity = '1';
      }, 1300);
    }, 600);
  }

  // Nettoie après chaque rendu d'automation (le canvas est recréé souvent)
  if (typeof window.renderCanvasAutomation === 'function') {
    const prev = window.renderCanvasAutomation;
    window.renderCanvasAutomation = function(){
      const r = prev.apply(this, arguments);
      cleanupOldOkSlot();
      return r;
    };
  }

  // Wrap saveCurrent (sans casser le comportement), et affiche OK une seule fois si persisté
  const prevSave = window.saveCurrent;
  if (typeof prevSave === 'function' && !window.__wfdSaveOkWrapped) {
    window.__wfdSaveOkWrapped = true;

    window.saveCurrent = function(){
      const before = localStorage.getItem('automationsData') || '';
      const r = prevSave.apply(this, arguments);
      const after  = localStorage.getItem('automationsData') || '';

      if (window.currentKind === 'automation' && after !== before) {
        cleanupOldOkSlot();
        showOkOnce('✅ Sauvegardé');
      }
      return r;
    };
  }

  // Nettoyage immédiat au chargement
  document.addEventListener('DOMContentLoaded', cleanupOldOkSlot);

  console.log('[WFD] Save OK dedup installed');
})();

/* ========================================================================
   Canvas switch animation v2 (real push transition)
   - Exit animation -> render -> enter animation
   - Prevents "flash/drop-frame" feel
   ======================================================================== */
(function(){
  if (window.__wfdCanvasTransitionInstalled) return;
  window.__wfdCanvasTransitionInstalled = true;

  const prevOpen = window.openEditor;
  if (typeof prevOpen !== 'function') return;

  const EXIT_MS = 160;   // must match CSS canvas-exit duration
  const ENTER_MS = 260;  // must match CSS canvas-enter duration

  function runExitEnter(ed, doRender){
    // Clean any previous classes
    ed.classList.remove('canvas-enter', 'canvas-exit');

    // Exit
    ed.classList.add('canvas-exit');

    // After exit ends, render, then enter
    setTimeout(() => {
      ed.classList.remove('canvas-exit');

      // Render new content
      doRender();

      // Force reflow so the enter animation reliably starts
      void ed.offsetWidth;

      ed.classList.add('canvas-enter');
      setTimeout(() => ed.classList.remove('canvas-enter'), ENTER_MS + 30);
    }, EXIT_MS + 20);
  }

  window.openEditor = function(kind, key){
    // We only animate automation switches (you can add webhook/custom if you want)
    const ed = document.getElementById('canvas-editor');
    if (!ed || kind !== 'automation') {
      return prevOpen.apply(this, arguments);
    }

    // If user clicks the same item again, no need to animate
    try {
      if (window.currentKind === kind && window.currentKey === key) {
        return prevOpen.apply(this, arguments);
      }
    } catch {}

    // Run animated transition
    let result;
    runExitEnter(ed, () => {
      result = prevOpen.apply(this, arguments);
    });

    return result;
  };

  console.log('[WFD] Canvas push transition installed');
})();






/* ========================================================================
   TAG / BUILD (capot) — WFD Automations script
   Build: CLEAN v1.7.1 (ui-regressionfix + tag) — 2026-04-12
   Notes:
   - UI regression fix: hide RAW keys + filter dropdowns
   - Freeze léger: verrouille uniquement saveCurrent + renderApiPreview
   ======================================================================== */
(function(){
  try {
    window.__WFD_AUTOMATIONS_BUILD__ = 'REFACTOR v3.1 (no-defer, ui-cloisonnee + newpath) | 2026-04-12';

    const lockFn = (name) => {
      const fn = window[name];
      if (typeof fn !== 'function') return;
      const d = Object.getOwnPropertyDescriptor(window, name);
      if (d && d.configurable === false) {
        try {
          Object.defineProperty(window, name, {
            value: fn,
            writable: false,
            enumerable: d.enumerable,
            configurable: false
          });
        } catch {}
        return;
      }
      Object.defineProperty(window, name, {
        value: fn,
        writable: false,
        enumerable: true,
        configurable: false
      });
    };

    lockFn('saveCurrent');
    lockFn('renderApiPreview');

    console.log('[WFD] build:', window.__WFD_AUTOMATIONS_BUILD__);
  } catch(e) {
    console.warn('[WFD] build/tag block failed', e);
  }
})();
