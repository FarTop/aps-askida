console.log('[MAPPERS] sync-mappers LOADED — 2026-06-25 20:45');
/* ============================================================
   WFD Sync Mappers — Canonical mapping layer for Settings
   Exposes: window.WFD_Mappers
   ============================================================ */
(function () {
  if (window.WFD_Mappers) return;

  // ---------- Helpers ----------
  const U = {
    up: (v) => String(v ?? '').trim().toUpperCase(),
    bool: (v) => (v === true),
    pick: (...vals) => vals.find(v => v !== undefined && v !== null && v !== ''),
  };

  // Normalise enabled/status to WFD standard: ACTIVE/INACTIVE + enabled boolean
  function normalizeEnabledStatus(src, opts = {}) {
  const defaultEnabled = (typeof opts.defaultEnabled === 'boolean') ? opts.defaultEnabled : true;

  // Raw strings (can be health or state)
  const rawStatus = U.up(src?.status ?? src?.state ?? src?.health ?? '');

  // Helpers for status strings
  const truthy = new Set(['ACTIVE','ENABLED','ON','TRUE','YES','1']);
  const falsy  = new Set(['INACTIVE','DISABLED','OFF','FALSE','NO','0']);

  // 1) Prefer explicit disabled flag
  if (typeof src?.disabled === 'boolean') {
    const enabled = !src.disabled;
    return {
      enabled,
      status: enabled ? 'ACTIVE' : 'INACTIVE',
      status_raw: rawStatus || '',
      disabled: src.disabled,
      source: 'disabled'
    };
  }

  // 2) Prefer explicit enabled flag
  if (typeof src?.enabled === 'boolean') {
    const enabled = src.enabled;
    return {
      enabled,
      status: enabled ? 'ACTIVE' : 'INACTIVE',
      status_raw: rawStatus || '',
      source: 'enabled'
    };
  }

  // 3) Prefer explicit active flag
  if (typeof src?.active === 'boolean') {
    const enabled = src.active;
    return {
      enabled,
      status: enabled ? 'ACTIVE' : 'INACTIVE',
      status_raw: rawStatus || '',
      source: 'active'
    };
  }

  // 4) Numeric shortcuts if present (rare, but safe)
  if (typeof src?.status === 'number') {
    const enabled = src.status !== 0;
    return {
      enabled,
      status: enabled ? 'ACTIVE' : 'INACTIVE',
      status_raw: String(src.status),
      source: 'status_number'
    };
  }

  // 5) Map known string statuses
  if (truthy.has(rawStatus)) {
    return { enabled: true, status: 'ACTIVE', status_raw: rawStatus, source: 'status_string' };
  }
  if (falsy.has(rawStatus)) {
    return { enabled: false, status: 'INACTIVE', status_raw: rawStatus, source: 'status_string' };
  }

  // 6) Health-only statuses (do NOT treat as enabled/disabled)
  // Keep the raw but don’t infer a false state; fallback uses defaultEnabled.
  if (rawStatus === 'HEALTHY' || rawStatus === 'UNHEALTHY') {
    return {
      enabled: defaultEnabled,
      status: defaultEnabled ? 'ACTIVE' : 'INACTIVE',
      status_raw: rawStatus,
      source: 'health_only_assumed'
    };
  }

  // 7) Unknown -> fallback enabled
  return {
    enabled: defaultEnabled,
    status: defaultEnabled ? 'ACTIVE' : 'INACTIVE',
    status_raw: rawStatus || '',
    source: 'assumed'
  };
}

  // ---------- Metadata Field mapper (global field attributes) ----------
  // The spec includes read_only, hide_if_not_set, is_warning_field, is_block_field,
  // options, multi, source_url, use_as_facet, min/max etc. [3](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)[1](https://app.iconik.io/docs/)
  function mapMetadataField(f, typeUI, extractMultiSelect, extractValues) {
  // Options brutes Iconik (label/value) — utile pour recopie fidèle
  const options_raw = Array.isArray(f.options)
    ? f.options.map(o => ({
        label: (typeof o === 'string') ? o : (o.label ?? o.value ?? o.name ?? ''),
        value: (typeof o === 'string') ? o : (o.value ?? o.label ?? o.key ?? o.name ?? '')
      }))
    : [];

  // multi brut Iconik (différent du "multiselect" WFD)
  const multi_raw = (typeof f.multi === 'boolean') ? f.multi : null;

  // Champs spec (Iconik)
  const use_as_facet = !!f.use_as_facet;              // spec metadata field [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
  const is_warning_field = !!f.is_warning_field;      // spec metadata field [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
  const is_block_field = !!f.is_block_field;          // spec metadata field [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

  return {
    // Identité
    id: f.name,
    nom: f.label || f.name,
    name: f.label || f.name,

    // Type WFD + type API brut
    type: typeUI,                   // UI-friendly
    field_type: f.field_type || '',  // spec-native (utile recopie) [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

    // Editorial / doc
    description: f.description || '', // attribut standard metadata field [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

    // Flags spec (globaux)
    required: !!f.required,                 // [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    read_only: !!f.read_only,               // [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    hide_if_not_set: !!f.hide_if_not_set,   // [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    use_as_facet,                           // [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    is_warning_field,                       // [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    is_block_field,                         // [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

    // string_exact : field_type Iconik spécifique (Text avec exact match activé)
    string_exact: (f.field_type === 'string_exact'),

    // Alias WFD (user friendly)
    use_in_filters: use_as_facet,
    display_as_warning: is_warning_field,
    block_assets: is_block_field,

    // Numériques
    min_value: (f.min_value ?? null),       // [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    max_value: (f.max_value ?? null),       // [2](https://app.iconik.io/docs/)[1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

    // Inherit from (mapped_field_name)
    mapped_field_name: (f.mapped_field_name ?? null),

    // Options Iconik (valeurs)
    source_url: (f.source_url ?? null),     // options externalisées [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    options: options_raw,                   // brut label/value [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
    multi: multi_raw,                       // brut Iconik [1](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)

    // Valeurs WFD (compat UI existante)
    multiselect: (typeUI === 'Dropdown') ? extractMultiSelect(f) : false,
    valeurs: (typeUI === 'Dropdown' || typeUI === 'Tag Cloud') ? extractValues(f) : [],

    // Debug / futur DB
    raw: f
  };
}

  // ---------- Webhook mapper ----------
 function mapWebhook(w) {
  const st = normalizeEnabledStatus(w);

  // Headers: normaliser (null/array/object)
  let headers = {};
  if (w && typeof w.headers === 'object' && !Array.isArray(w.headers) && w.headers !== null) {
    headers = w.headers;
  } else if (Array.isArray(w.headers)) {
    headers = w.headers.reduce((acc, h) => {
      const k = h?.key ?? h?.name;
      const v = h?.value;
      if (k) acc[k] = v ?? '';
      return acc;
    }, {});
  }

  // API fields (recopie fidèle)
  const event_type = w.event_type || w.eventType || '';
  const object_id  = w.object_id  || w.objectId  || '';

  return {
    // ── Canonical WFD (UI/DB)
    id: w.id || '',
    name: w.name || '',
    description: w.description || '',
    url: w.url || '',
    eventType: event_type,
    realm: w.realm || '',
    operation: w.operation || '',
    objectId: object_id,
    query: w.query || '',
    headers,

    enabled: st.enabled,
    status: st.status,           // ACTIVE/INACTIVE
    status_raw: st.status_raw,   // valeur brute (ENABLED/DISABLED/etc.)
    status_source: st.source,    // NEW: disabled/enabled/active/status_string/assumed/... (debug utile)

    // ── Champs opérationnels utiles (si présents)
    deleted_at: w.deleted_at || null,
    date_created: w.date_created || null,
    date_modified: w.date_modified || null,
    last_error: w.last_error || null,
    last_error_date: w.last_error_date || null,
    first_failed_at: w.first_failed_at || null,
    last_payload: w.last_payload || null,

    // ── Aliases API-like (recopie fidèle)
    event_type,
    object_id,

    // ── Debug / DB
    raw: w
  };
}

  // ---------- Custom Action mapper ----------
  // Your list API returns title + disabled + status (HEALTHY), so we use disabled for state. [2](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/settings.css)
 function mapCustomAction(a) {
  const title = U.pick(a.title, a.name, a.id, '');
  const st = normalizeEnabledStatus(a); // disabled/enabled/active/status_string/assumed...

  // Headers: normaliser (null/array/object)
  let headers = {};
  if (a && typeof a.headers === 'object' && !Array.isArray(a.headers) && a.headers !== null) {
    headers = a.headers;
  } else if (Array.isArray(a.headers)) {
    headers = a.headers.reduce((acc, h) => {
      const k = h?.key ?? h?.name;
      const v = h?.value;
      if (k) acc[k] = v ?? '';
      return acc;
    }, {});
  }

  // API-like pour recopie fidèle
  const metadata_view = a.metadata_view || a.metadataView || '';
  const app_id = a.app_id || a.application_token_id || a.appId || '';

  // Chez toi: status=HEALTHY (santé), distinct de l’état enabled/disabled [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/settings.css)
  const health = U.up(a.status);

  return {
    // ── Canonical WFD (UI/DB)
    id: a.id,
    title,
    nom: title,
    name: title,

    disabled: typeof a.disabled === 'boolean' ? a.disabled : false,
    enabled: st.enabled,
    status: st.status,            // ACTIVE/INACTIVE (normalisé)
    status_raw: st.status_raw,    // brut (ex: HEALTHY)
    status_source: st.source,     // NEW: disabled/enabled/active/status_string/...

    health,

    type: a.type || 'POST',
    context: a.context || 'ASSET',
    url: a.url || '',
    description: a.description || '',
    headers,

    // ── Champs opérationnels utiles (sans fouiller dans raw)
    date_created: a.date_created || null,
    date_modified: a.date_modified || null,
    last_error: a.last_error || null,
    last_error_date: a.last_error_date || null,

    // ── Champs API-like (recopie fidèle)
    metadata_view,
    app_id,
    publish_template_id: a.publish_template_id || null,
    system_domain_id: a.system_domain_id || null,
    transcoder_id: a.transcoder_id || null,

    // ── Aliases compat existants
    metadataView: metadata_view,
    appId: app_id,

    // ── Debug / futur DB
    raw: a
  };
}

  // ---------- Automation mapper ----------
  // Automations spec uses status ACTIVE/INACTIVE; normalize from status. 
 function mapAutomation(a) {
  const st = normalizeEnabledStatus(a);

  // Champs “opérationnels” (si absents => null)
  const date_created = a.date_created || null;
  const date_modified = a.date_modified || null;
  const deleted_at = a.deleted_at || null;

  const last_error = a.last_error || null;
  const last_error_date = a.last_error_date || null;

  // Audit (souvent présents dans le payload)
  const created_by = a.created_by || null;
  const modified_by = a.modified_by || null;
  const system_domain_id = a.system_domain_id || null;

  return {
    // ── Canonical WFD (UI/DB)
    id: a.id,
    nom: a.name || a.id || '',
    name: a.name || a.id || '',

    enabled: st.enabled,
    status: st.status,            // ACTIVE/INACTIVE (normalisé)
    status_raw: st.status_raw,    // valeur brute si présente
    status_source: st.source,     // NEW: disabled/enabled/active/status_string/assumed/...

    // compat UI existante
    active: st.enabled,

    description: a.description || '',
    triggers: Array.isArray(a.triggers) ? a.triggers : [],
    conditions: Array.isArray(a.conditions) ? a.conditions : [],
    actions: Array.isArray(a.actions) ? a.actions : [],

    // ── Champs opérationnels
    date_created,
    date_modified,
    deleted_at,
    last_error,
    last_error_date,

    // ── Audit / contexte
    created_by,
    modified_by,
    system_domain_id,

    // ── Debug / futur DB
    raw: a
  };
}
  
  /* ============================================================
   Automations — Deep canonical mapper (RAW + Canonique)
   - type_raw (Iconik) conservé pour forensic/export
   - type (WFD UI key) pour toutes les pages
   FUTUR INSERT EN DESSOUS: ajouter de nouveaux types Iconik
   ============================================================ */

// Mapping Iconik RAW -> WFD UI key (Triggers)
const AUTO_TRIGGER_TYPE = {
  METADATA_UPDATE:             'metadata.changed',
  ARCHIVE:                    'asset.archived',
  RESTORE:                    'asset.restored',
  OBJECT_ADDED_TO_COLLECTION: 'asset.added_to_collection',
  VERSION_ONLINE:             'asset.has_new_version',
  ASSET_SHARE:                'asset.shared',
  ASSET_ONLINE:               'asset.new',
  TRANSFER_TO_STORAGE:        'asset.transferred',
  MODIFIED_AT_TRANSITION:     'asset.not_modified',
  CREATED_AT_TRANSITION:      'asset.created_days_ago',
  REVIEW_STATUS_CHANGED:      'approval.status_changed',
  SUBTITLE_ADDED:             'subtitle.added'
};

// Mapping Iconik RAW -> WFD UI key (Actions)
const AUTO_ACTION_TYPE = {
  ADD_TO_COLLECTION:         'Add to collection',
  UPDATE_ACL:                'Set ACL on asset',
  ANALYZE:                   'Analyze asset',
  ARCHIVE:                   'Archive asset',
  RESTORE:                   'Restore asset',
  TRANSFER:                  'Transfer asset',
  EXPORT:                    'Export asset',
  TRANSCODE:                 'Transcode asset',
  TRANSCRIBE:                'Transcribe asset',
  METADATA_UPDATE:           'Update metadata',
  CREATE_SHARE:              'Create share',
  REQUEST_ORIGINAL:          'Request original',
  REQUEST_REVIEW:            'Request review',
  RESTRICT_ASSET:            'Restrict asset',
  REMOVE_ASSET_RESTRICTION:  'Remove restriction',
  DELETE:                    'Delete asset',
  DELETE_FILE_SET:           'Delete file set',
  TRIGGER_CUSTOM_ACTION:     'Custom action',
  EXTRACT_FACES:             'Run Face Recognition'
};

function cloneSafe(x){
  try { return JSON.parse(JSON.stringify(x ?? {})); } catch { return {}; }
}

/**
 * Canonique deep pour les pages WFD.
 * Remplace les RAW Iconik par des clés UI (type), tout en conservant type_raw.
 */
function mapAutomationDeep(a){
  const base = mapAutomation(a); // conserve status/nom/etc. [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/sync-mappers.js)

  const triggers = (Array.isArray(a?.triggers) ? a.triggers : []).map(t => {
    const type_raw = String(t?.type ?? '').trim();
    const type = AUTO_TRIGGER_TYPE[type_raw] || type_raw;
    const parameters = (t && typeof t.parameters === 'object' && t.parameters) ? t.parameters : {};
    return {
      ...t,
      type_raw,
      type,
      parameters,
      config: cloneSafe(parameters)
    };
  });

  const actions = (Array.isArray(a?.actions) ? a.actions : []).map(ac => {
    const type_raw = String(ac?.type ?? '').trim();
    const type = AUTO_ACTION_TYPE[type_raw] || type_raw;
    const parameters = (ac && typeof ac.parameters === 'object' && ac.parameters) ? ac.parameters : {};
    return {
      ...ac,
      type_raw,
      type,
      parameters,
      config: cloneSafe(parameters)
    };
  });

  return {
    ...base,
    triggers,
    actions,
    raw: a
  };
}

/**
 * RAW wrapper minimal (optionnel) — utile si tu veux une liste RAW compacte.
 */
function mapAutomationRaw(a){
  return { id: a?.id ?? '', raw: a };
}

  // ---------- Metadata View fields (composition + overrides) ----------
  // Use view_fields from GET /views/{id}/ (fields endpoint may not exist). [3](https://help.iconik.backlight.co/hc/en-us/articles/25304088805399-Metadata-Field-Entities)
  function normalizeViewFields(viewFields) {
    return (viewFields || []).map(vf => {
      const isSep = (vf.field_type === '__separator__' || vf.name === '__separator__');
      return {
        kind: isSep ? 'separator' : 'field',
        label: vf.label || '',
        name: vf.name || '',
        field_type: vf.field_type || '',
        required: vf.required ?? null,
        read_only: vf.read_only ?? null,
        hide_if_not_set: vf.hide_if_not_set ?? null,
        multi: vf.multi ?? null,
        options: vf.options ?? null,
        source_url: vf.source_url ?? null,
        is_warning_field: vf.is_warning_field ?? null,
        is_block_field: vf.is_block_field ?? null,
        min_value: vf.min_value ?? null,
        max_value: vf.max_value ?? null,
        raw: vf
      };
    });
  }

  function mapCategoryAgg(agg, viewById) {
  // API: name = identifiant technique (souvent sans séparateurs)
  //      label = libellé UI (avec espaces / pipes)  ✅ => on doit afficher label
  const api_name = String(agg.name || '').trim();
  const api_label = String(agg.label || '').trim();

  // Affichage UI : label si dispo, sinon fallback sur name/id
  const display = api_label || api_name || String(agg.id || '').trim();

  // view_ids -> noms de vues (si dispo)
  const view_ids = Array.isArray(agg.view_ids) ? agg.view_ids : [];
  const metadataViews = view_ids.map(id => (viewById && viewById[id]) ? viewById[id] : id).filter(Boolean);

  // object_types (assets/collections/segments/custom_actions)
  const object_types = Array.isArray(agg.object_types) ? agg.object_types : [];

  return {
    id: agg.id || '',

    // ✅ UI / listes : on affiche le libellé lisible
    nom: display,
    name: display,

    // ✅ on conserve l'identifiant technique (utile pour debug / matching futur)
    api_name,

    // ✅ on conserve le label API (utile export / contrôle)
    label: api_label || display,

    object_types,
    view_ids,
    metadataViews,

    // debug / futur DB
    raw: agg.raw || agg
  };
}
  
function maskValue(v, keepEnd = 4) {
  if (v == null) return null;
  const s = String(v);
  if (s.length <= keepEnd) return '••••';
  return '••••' + s.slice(-keepEnd);
}

function redactSecrets(obj, depth = 0) {
  if (obj == null) return obj;
  if (depth > 3) return '[…]';

  // Primitive
  if (typeof obj !== 'object') return obj;

  // Array
  if (Array.isArray(obj)) return obj.map(x => redactSecrets(x, depth + 1));

  // Object
  const out = {};
  const secretKeyRx = /(secret|password|pass|token|credential|connection_string|private|access_key|key)/i;

  for (const [k, v] of Object.entries(obj)) {
    if (secretKeyRx.test(k)) {
      out[k] = (v == null) ? null : '••••';
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
}

function mapStorage(details) {
  const method = (details.storage_type || details.type || details.method || details.settings?.method || 'unknown');
  const storageType = String(method).toLowerCase();

  const settings = (details.settings && typeof details.settings === 'object') ? details.settings : {};

  // config canonique (toujours masquée)
  let config = {};

  if (['s3','wasabi','backblaze'].includes(storageType)) {
    config = {
      bucket: settings.bucket || details.bucket || '',
      region: settings.region || details.region || '',
      endpoint: settings.endpoint || details.endpoint || '',
      access_key: settings.access_key ? maskValue(settings.access_key) : (details.access_key ? maskValue(details.access_key) : null),
      secret_key: (settings.secret_key || details.secret_key) ? '••••' : null,
      path_style: !!(settings.path_style ?? details.path_style),
      use_ssl: (settings.use_ssl ?? details.use_ssl) !== false,
    };
  } else if (storageType === 'google_cloud') {
    config = {
      bucket: settings.bucket || details.bucket || '',
      project_id: settings.project_id || details.project_id || '',
      credentials: (settings.credentials || details.credentials) ? '••••' : null,
    };
  } else if (storageType === 'azure') {
    config = {
      container: settings.container || details.container || '',
      account_name: settings.account_name || details.account_name || '',
      connection_string: (settings.connection_string || details.connection_string) ? '••••' : null,
    };
  } else if (storageType === 'ftp' || storageType === 'sftp') {
    config = {
      host: settings.host || details.host || '',
      port: settings.port || details.port || (storageType === 'sftp' ? 22 : 21),
      path: settings.path || details.path || '/',
      username: settings.username ? maskValue(settings.username) : (details.username ? maskValue(details.username) : ''),
      password: (settings.password || details.password) ? '••••' : null,
    };
  } else {
    // fallback : on garde les infos mais on masque profondément
    config = redactSecrets(settings && Object.keys(settings).length ? settings : details);
  }

  return {
    id: details.id,
    nom: details.name || details.id,
    name: details.name || details.id,
    type: storageType,
    status: details.status || 'unknown',

    config,

    date_created: details.date_created || details.created_at || null,
    date_modified: details.date_modified || details.updated_at || null,

    teams: [],

    // raw redacted (jamais de secrets en clair)
    raw: redactSecrets(details)
  };
}

function mapSavedSearch(o, viewById) {
  const criteria = o.criteria || o.query || {};
  const viewId = criteria.metadata_view_id || criteria.view_id || '';

  return {
    id: o.id || '',
    nom: o.name || o.title || o.id || '',
    name: o.name || o.title || o.id || '',

    // Canonique WFD
    query: criteria,
    metadata_view_id: viewId || '',
    metadataView: viewId ? (viewById?.[viewId] || viewId) : '',

    teams: [],

    // Debug / futur DB
    raw: o
  };
}

function mapUser(u, ctx = {}) {
  // Label UI : "Prénom Nom" si dispo, sinon email
  const fn = String(u?.first_name || '').trim();
  const ln = String(u?.last_name  || '').trim();
  const full = (fn + ' ' + ln).trim();

  const email = String(u?.email || '').trim();
  const label = full || email || String(u?.name || u?.id || '').trim();

  // Identity Provider
  const idp_id = String(u?.identity_provider_id || '').trim();
  const idpById = ctx && ctx.idpById ? ctx.idpById : null;

  // Valeur lisible (ex: "sts.windows.net") si on a pu résoudre, sinon "SSO"
  let idp_label = 'Iconik';
  let idp_entity_id = '';

  if (idp_id) {
    idp_label = 'SSO';
    const info = idpById ? idpById[idp_id] : null;
    if (info) {
      // info peut être string ou objet
      if (typeof info === 'string') {
        idp_label = info;
      } else {
        idp_label = String(info.name || info.label || 'SSO').trim() || 'SSO';
        idp_entity_id = String(info.entity_id || info.idp_entity_id || '').trim();
      }
    }
  }

  return {
    id: u.id || '',
    email,

    // UI / liste / panneau
    nom: label,
    name: label,

    // Conserver prénom/nom
    first_name: fn,
    last_name: ln,

    status: u.status || '',
    type: u.type || '',

    // ✅ ce que l’UI consomme
    idp: idp_label,

    // ✅ debug / futur
    idp_id,
    idp_entity_id,

    teams: [],
    role_groups: [],
    raw: u
  };
}

function mapTeam(t, source = 'teams') {
  const name = t.name || t.title || t.id || '';
  return {
    id: t.id,
    nom: name,
    name: name,

    collections: [],
    vues: [],
    savedSearches: [],
    storages: [],

    source,   // ✅ NEW
    raw: t    // ✅ NEW
  };
}

// ---------- Public API ----------
window.WFD_Mappers = {
  normalizeEnabledStatus,
  mapMetadataField,
  mapWebhook,
  mapCustomAction,

  // Existing (surface)
  mapAutomation,

  /**
   * Automations — Deep canonical mapper (RAW + CANONIQUE)
   * - Conserve type_raw (Iconik) pour forensic/export
   * - Expose type (clé UI WFD) pour consommation par toutes les pages
   * - Clone parameters -> config pour éviter aliasing UI
   * FUTUR INSERT EN DESSOUS: ajouter de nouveaux types Iconik
   */
  mapAutomationDeep(a) {
    // Base (statuts / champs "surface")
    const base = mapAutomation(a); // mapAutomation existe déjà dans ce fichier [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/wfd-sync-bridge-settings.js)

    // Mapping Iconik RAW -> WFD UI key (Triggers)
    const TRIG = {
      METADATA_UPDATE:              'metadata.changed',
      ARCHIVE:                     'asset.archived',
      RESTORE:                     'asset.restored',
      OBJECT_ADDED_TO_COLLECTION:  'asset.added_to_collection',
      VERSION_ONLINE:              'asset.has_new_version',
      ASSET_SHARE:                 'asset.shared',
      ASSET_ONLINE:                'asset.new',
      TRANSFER_TO_STORAGE:         'asset.transferred',
      MODIFIED_AT_TRANSITION:      'asset.not_modified',
      CREATED_AT_TRANSITION:       'asset.created_days_ago',
      REVIEW_STATUS_CHANGED:       'approval.status_changed',
      SUBTITLE_ADDED:              'subtitle.added'
    };

    // Mapping Iconik RAW -> WFD UI key (Actions)
    const ACT = {
      ADD_TO_COLLECTION:          'Add to collection',
      UPDATE_ACL:                 'Set ACL on asset',
      ANALYZE:                    'Analyze asset',
      ARCHIVE:                    'Archive asset',
      RESTORE:                    'Restore asset',
      TRANSFER:                   'Transfer asset',
      EXPORT:                     'Export asset',
      TRANSCODE:                  'Transcode asset',
      TRANSCRIBE:                 'Transcribe asset',
      METADATA_UPDATE:            'Update metadata',
      CREATE_SHARE:               'Create share',
      REQUEST_ORIGINAL:           'Request original',
      REQUEST_REVIEW:             'Request review',
      RESTRICT_ASSET:             'Restrict asset',
      REMOVE_ASSET_RESTRICTION:   'Remove restriction',
      DELETE:                     'Delete asset',
      DELETE_FILE_SET:            'Delete file set',
      TRIGGER_CUSTOM_ACTION:      'Custom action',
      EXTRACT_FACES:              'Run Face Recognition'
    };

    const cloneSafe = (x) => {
      try { return JSON.parse(JSON.stringify(x ?? {})); }
      catch { return {}; }
    };

    // Triggers deep
    const rawTriggers = Array.isArray(a?.triggers) ? a.triggers : [];
    const triggers = rawTriggers.map(t => {
      const type_raw = String(t?.type ?? '').trim();
      const type = TRIG[type_raw] || type_raw; // si déjà canonique -> inchangé
      const parameters = (t && typeof t.parameters === 'object' && t.parameters) ? t.parameters : {};
      return {
        ...t,
        type_raw,
        type,
        parameters,
        config: cloneSafe(parameters)
      };
    });

    // Actions deep
    const rawActions = Array.isArray(a?.actions) ? a.actions : [];
    const actions = rawActions.map(ac => {
      const type_raw = String(ac?.type ?? '').trim();
      const type = ACT[type_raw] || type_raw;
      const parameters = (ac && typeof ac.parameters === 'object' && ac.parameters) ? ac.parameters : {};
      return {
        ...ac,
        type_raw,
        type,
        parameters,
        config: cloneSafe(parameters)
      };
    });

    return {
      ...base,
      triggers,
      actions,
      raw: a
    };
  },

  /**
   * RAW wrapper minimal (optionnel) — utile si tu veux une liste RAW compacte.
   */
  mapAutomationRaw(a) {
    return { id: a?.id ?? '', raw: a };
  },

  normalizeViewFields,
  mapCategoryAgg,
  mapStorage,
  redactSecrets,
  mapSavedSearch,
  mapUser,
  mapTeam
};
})();