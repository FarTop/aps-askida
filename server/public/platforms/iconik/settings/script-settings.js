console.log('[SETTINGS] script-settings LOADED — 2026-06-25 17:47');
/* ══════════════════════════════════════════════════════════════
   SETTINGS — script principal
   Architecture : sidebar nav | liste cassettes | détail associatif
   ══════════════════════════════════════════════════════════════ */

// ── Proxy Iconik — base URL du serveur APS ────────────────────
const _APS_BASE = (typeof window !== 'undefined' && window.location.protocol !== 'file:')
  ? window.location.origin
  : 'http://localhost:3000';

function _ikBase(token) {
  const envType = String(token.environment || token.env || '').toLowerCase() || 'qa';
  return `${_APS_BASE}/api/iconik/${envType}`;
}

function _ikFetch(token, path, opts) {
  return fetch(_ikBase(token) + path, opts || {});
}

// ── Données globales ──────────────────────────────────────────
let teamsData        = { teams: [] };
let roleGroupsData   = { roleGroups: [] };
let collectionsData  = { collections: [] };
let webhooksData     = { webhooks: [] };
let customActionsData= { customActions: [] };  // ← AJOUTER CETTE LIGNE
let automationsData  = { automations: [] };
let appsData         = { apps: [] };
let setColExpanded = {};
let setColExpandedInit = false;
// ── Options UI Collections ─────────────────────────────────────
const UI_COLLECTIONS_SHOW_MDV_CARD = false;        // false = on supprime la carte “Metadata Views”
const UI_CATS_TITLE_COLOR = 'var(--accent2)';      // couleur du titre de la carte Catégories (cohérente avec le thème)
const UI_CATS_ICON = '🏷️';  

// =======================================================================
// WFD — Filtres objets système (Teams + Categories)
// Par défaut : EXCLUS des synchros + masqués dans les listes UI
// =======================================================================

// --- TEAMS système ---
const WFD_SYSTEM_TEAM_NAMES = ['everyone', 'administrator'];
const WFD_LS_INCLUDE_SYS_TEAMS = 'wfd_include_system_teams'; // '1' = inclure

// --- CATEGORIES système ---
const WFD_SYSTEM_CATEGORY_NAMES = ['generic', 'tag']; // 'default' retiré : catégorie métier visible dans APS
const WFD_LS_INCLUDE_SYS_CATS = 'wfd_include_system_categories'; // '1' = inclure

function wfdNormName(s) {
  return String(s || '').trim().toLowerCase();
}

// ----- TEAMS -----
function wfdIsSystemTeam(teamOrName) {
  const name = (typeof teamOrName === 'string')
    ? teamOrName
    : (teamOrName?.nom || teamOrName?.name || '');
  return WFD_SYSTEM_TEAM_NAMES.includes(wfdNormName(name));
}

function wfdIncludeSystemTeams() {
  return localStorage.getItem(WFD_LS_INCLUDE_SYS_TEAMS) === '1';
}

function wfdSetIncludeSystemTeams(on) {
  localStorage.setItem(WFD_LS_INCLUDE_SYS_TEAMS, on ? '1' : '0');
}

function wfdGetTeamsForSync() {
  const all = teamsData.teams || [];
  if (wfdIncludeSystemTeams()) return all;
  return all.filter(t => !(t && (t.is_system === true || wfdIsSystemTeam(t))));
}

// ----- CATEGORIES -----
function wfdIsSystemCategory(catOrName) {
  // Depuis qu'on affiche le label (nom lisible), la détection "système"
  // doit regarder l'identifiant technique (api_name) si présent. [2](https://app.iconik.io/docs/reference.html)
  const name = (typeof catOrName === 'string')
    ? catOrName
    : (
        catOrName?.api_name ||   // ✅ identifiant technique (default/generic/tag)
        catOrName?.nom ||
        catOrName?.name ||
        catOrName?.label ||
        ''
      );

  return WFD_SYSTEM_CATEGORY_NAMES.includes(wfdNormName(name));
}

function wfdIncludeSystemCategories() {
  return localStorage.getItem(WFD_LS_INCLUDE_SYS_CATS) === '1';
}

function wfdSetIncludeSystemCategories(on) {
  localStorage.setItem(WFD_LS_INCLUDE_SYS_CATS, on ? '1' : '0');
}

function wfdGetCategoriesForSync() {
  const all = categoriesData.categories || [];
  if (wfdIncludeSystemCategories()) return all;
  return all.filter(c => !(c && (c.is_system === true || wfdIsSystemCategory(c))));
}

// --- Exposer sur window (handlers inline dans renderSyncUI) ---
window.wfdNormName = wfdNormName;

window.wfdIsSystemTeam = wfdIsSystemTeam;
window.wfdIncludeSystemTeams = wfdIncludeSystemTeams;
window.wfdSetIncludeSystemTeams = wfdSetIncludeSystemTeams;
window.wfdGetTeamsForSync = wfdGetTeamsForSync;

window.wfdIsSystemCategory = wfdIsSystemCategory;
window.wfdIncludeSystemCategories = wfdIncludeSystemCategories;
window.wfdSetIncludeSystemCategories = wfdSetIncludeSystemCategories;
window.wfdGetCategoriesForSync = wfdGetCategoriesForSync;

// =======================================================================
// WFD — Filtre Metadata Views système (ex: "Segment Tags")
// Par défaut : EXCLU (toggle persistant). Activation = inclure.
// =======================================================================
const WFD_SYSTEM_MDV_NAMES = ['segment tags'];
const WFD_LS_INCLUDE_SYS_MDVS = 'wfd_include_system_mdvs'; // '1' = inclure

function wfdIsSystemMetadataView(viewOrName) {
  const name = (typeof viewOrName === 'string')
    ? viewOrName
    : (viewOrName?.nom || viewOrName?.name || viewOrName?.title || '');
  return WFD_SYSTEM_MDV_NAMES.includes(String(name || '').trim().toLowerCase());
}

function wfdIncludeSystemMetadataViews() {
  return localStorage.getItem(WFD_LS_INCLUDE_SYS_MDVS) === '1';
}

function wfdSetIncludeSystemMetadataViews(on) {
  localStorage.setItem(WFD_LS_INCLUDE_SYS_MDVS, on ? '1' : '0');
}

function wfdGetMetadataViewsForSync() {
  const all = metadataViewsData.metadataViews || [];
  if (wfdIncludeSystemMetadataViews()) return all;
  return all.filter(v => !(v && (v.is_system === true || wfdIsSystemMetadataView(v))));
}

// Exposer sur window (handlers inline + debug)
window.wfdIsSystemMetadataView = wfdIsSystemMetadataView;
window.wfdIncludeSystemMetadataViews = wfdIncludeSystemMetadataViews;
window.wfdSetIncludeSystemMetadataViews = wfdSetIncludeSystemMetadataViews;
window.wfdGetMetadataViewsForSync = wfdGetMetadataViewsForSync;

// Reconstruit le chemin complet d'une collection depuis parent_id
function setResolveColPath(idOrName) {
  // Chercher d'abord dans les associations team (qui ont un _path précalculé)
  // puis dans collectionsData
  const cols = collectionsData.collections || [];
  const byId = {};
  cols.forEach(c => { if (c.id) byId[c.id] = c; });
  // Chercher dans les collections teams pour un _path précalculé
  for (const team of (teamsData.teams || [])) {
    const tc = (team.collections || []).find(c => c.chemin === idOrName);
    if (tc && tc._path) return tc._path;
  }
  const col = byId[idOrName] || cols.find(c => c.name === idOrName || c.nom === idOrName);
  if (!col) return idOrName;
  function buildPath(c) {
    if (!c.parent_id || !byId[c.parent_id]) return c.name || c.nom || '';
    return buildPath(byId[c.parent_id]) + ' / ' + (c.name || c.nom || '');
  }
  return buildPath(col);
}

let metadataViewsData= { metadataViews: [] };
// ── Mapping officiel role_categories keys → labels lisibles Iconik ──────
const ROLE_CAT_LABELS = {
  core:               'Core Functionality',
  collaborate:        'Collaborate',
  organize:           'Organize',
  download:           'Download & Export',
  upload:             'Upload',
  assets_edit:        'Asset Full Access',
  metadata_admin:     'Metadata Administrator',
  users_groups_admin: 'Users & Groups Administrator',
  storage_admin:      'Storage Administrator',
  integrations_admin: 'Integrations Administrator',
  billing:            'Billing',
  face_recognition:   'Face Recognition',
  others:             'Others',
};

// ── Mapping slug → label permission lisible ──────────────────────────────
const PERM_LABELS = {
  can_read:    'Read',   can_write:   'Write',  can_create: 'Create',
  can_delete:  'Delete', can_purge:   'Purge',  can_reindex:'Reindex',
  can_archive: 'Archive',can_restore_archived:'Restore',can_run:'Run',
  can_manage:  'Manage', can_see_all: 'See All',can_list_all:'List All',
  can_edit_all:'Edit All',can_scan:   'Scan',   can_act_as: 'Act As',
  can_approve_without:'Approve Without Request',
  can_list_storage:'List Storage',can_list_team:'List Team Users',
  can_list_role_group:'List Role Group Users',
  web_can_upload:'Upload (web)',web_can_upload_legacy:'Upload Legacy (web)',
  web_can_top_level_upload:'Top Level Upload (web)',
  web_can_download_original:'Download Original (web)',
  web_can_download_proxy:'Download Proxy (web)',
  web_can_create_placeholder:'Create Placeholder (web)',
  web_can_create_link_asset:'Create Link Asset (web)',
  web_enable_posters:'Enable Posters (web)',
  can_use_adobe_panel:'Adobe Panel',
  can_edit_persons:'Edit Persons',
  can_create_poster:'Create Poster',
  can_transcribe_content:'Transcribe',
  can_analyze_content:'Analyze',
  is_storage_worker:'Storage Worker',
};

function slugToPermLabel(slug) {
  // Cherche le préfixe le plus long qui matche
  for (const [prefix, label] of Object.entries(PERM_LABELS)) {
    if (slug === prefix || slug.startsWith(prefix + '_') || slug.startsWith(prefix.replace(/_$/, '') + '_')) {
      return label;
    }
  }
  // Fallback : retirer can_ / web_can_ / is_ et humaniser
  return slug.replace(/^(can_|web_can_|is_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Catalogue hardcodé des ressources Iconik (vue Advanced) ─────────────
const ICONIK_ITEMS_CATALOG = {
  acl_templates:             { label: 'ACL Templates',             perms: ['can_read_acl_templates','can_write_acl_templates','can_delete_acl_templates'] },
  acls:                      { label: 'ACLs',                      perms: ['can_read_acls','can_write_acls','can_delete_acls'] },
  analysis_profiles:         { label: 'Analysis Profiles',         perms: ['can_write_analysis_profiles','can_delete_analysis_profiles'] },
  analysis_service_accounts: { label: 'Analysis Service Accounts', perms: ['can_read_analysis_service_accounts','can_write_analysis_service_accounts','can_delete_analysis_service_accounts'] },
  apps:                      { label: 'Apps',                      perms: ['can_read_apps','can_write_apps','can_delete_apps'] },
  approval_request:          { label: 'Approval Request',          perms: ['can_read_approval_request','can_write_approval_request','can_delete_approval_request','can_approve_without_request'] },
  approval_status:           { label: 'Approval Status',           perms: ['can_write_approval_status','can_delete_approval_status','can_write_approval_status_in_bulk'] },
  archived_formats:          { label: 'Archived Formats',          perms: ['can_archive_formats','can_restore_archived_formats','can_delete_archived_formats'] },
  asset_relation_types:      { label: 'Asset Relation Types',      perms: ['can_write_asset_relation_types','can_delete_asset_relation_types'] },
  asset_relations:           { label: 'Asset Relations',           perms: ['can_create_asset_relations','can_read_asset_relations','can_delete_asset_relations'] },
  asset_subtitles:           { label: 'Asset Subtitles',           perms: ['can_read_asset_subtitles','can_write_asset_subtitles'] },
  assets:                    { label: 'Assets',                    perms: ['can_read_assets','can_create_assets','can_write_assets','can_delete_assets','can_purge_assets','can_reindex_assets'] },
  assets_history:            { label: 'Assets History',            perms: ['can_read_assets_history','can_write_assets_history','can_delete_assets_history','can_reindex_assets_history'] },
  automations:               { label: 'Automations',               perms: ['can_read_automations','can_write_automations','can_run_automations','can_delete_automations'] },
  billing:                   { label: 'Billing',                   perms: ['can_read_billing','can_write_billing'] },
  collections:               { label: 'Collections',               perms: ['can_read_collections','can_create_collections','can_write_collections','can_delete_collections','can_purge_collections','can_reindex_collections','can_create_root_collections'] },
  cors_hosts:                { label: 'CORS Hosts',                perms: ['can_read_cors_hosts','can_write_cors_hosts','can_delete_cors_hosts'] },
  custom_actions:            { label: 'Custom Actions',            perms: ['can_read_custom_actions'] },
  discovery_entities:        { label: 'Discovery Entities',        perms: ['can_read_discovery_entities','can_write_discovery_entities','can_delete_discovery_entities'] },
  export_locations:          { label: 'Export Locations',          perms: ['can_read_export_locations','can_write_export_locations','can_delete_export_locations','can_reindex_export_locations'] },
  exports:                   { label: 'Exports',                   perms: ['can_write_exports'] },
  favorites:                 { label: 'Favorites',                 perms: ['can_write_favorites','can_delete_favorites'] },
  files:                     { label: 'Files',                     perms: ['can_read_files','can_write_files','can_delete_files','can_purge_files','can_list_storage_files'] },
  formats:                   { label: 'Formats',                   perms: ['can_read_formats','can_create_formats','can_write_formats','can_delete_formats','can_purge_formats'] },
  group_mappings:            { label: 'Group Mappings',            perms: ['can_read_group_mappings','can_write_group_mappings','can_delete_group_mappings'] },
  identity_providers:        { label: 'Identity Providers',        perms: ['can_read_identity_providers','can_write_identity_providers','can_delete_identity_providers'] },
  jobs:                      { label: 'Jobs',                      perms: ['can_read_jobs','can_write_jobs','can_delete_jobs','can_see_all_jobs','can_read_transcode_jobs','can_write_transcode_jobs','can_create_transcode_jobs','can_delete_transcode_jobs'] },
  keyframes:                 { label: 'Keyframes',                 perms: ['can_write_keyframes'] },
  logs_recipients:           { label: 'Logs Recipients',           perms: ['can_read_logs_recipients','can_write_logs_recipients','can_delete_logs_recipients'] },
  metadata_categories:       { label: 'Metadata Categories',       perms: ['can_read_metadata_categories','can_write_metadata_categories','can_delete_metadata_categories'] },
  metadata_fields:           { label: 'Metadata Fields',           perms: ['can_read_metadata_fields','can_write_metadata_fields','can_delete_metadata_fields'] },
  metadata_values:           { label: 'Metadata Values',           perms: ['can_read_metadata_values','can_write_metadata_values'] },
  metadata_views:            { label: 'Metadata Views',            perms: ['can_read_metadata_views','can_write_metadata_views','can_delete_metadata_views'] },
  notifications:             { label: 'Notifications',             perms: ['can_read_notifications','can_delete_notifications','can_read_notification_settings'] },
  playlists:                 { label: 'Playlists',                 perms: ['can_read_playlists','can_create_playlists','can_write_playlists','can_delete_playlists','can_reindex_playlists','can_add_playlist_items','can_update_playlist_items','can_delete_playlist_items','can_update_playlist_items_position'] },
  projects:                  { label: 'Projects',                  perms: ['can_read_projects','can_create_projects','can_write_projects','can_delete_projects','can_reindex_projects','can_add_project_members','can_delete_project_members'] },
  proxies:                   { label: 'Proxies',                   perms: ['can_read_proxies','can_write_proxies','can_delete_proxies'] },
  role_groups:               { label: 'Role Groups',               perms: ['can_read_role_groups','can_write_role_groups','can_delete_role_groups','can_list_all_role_groups','can_edit_all_role_groups'] },
  saved_searches:            { label: 'Saved Searches',            perms: ['can_read_saved_searches','can_write_saved_searches','can_delete_saved_searches','can_reindex_saved_searches'] },
  search:                    { label: 'Search',                    perms: ['can_search','can_read_search_history','can_delete_search_history'] },
  segments:                  { label: 'Segments',                  perms: ['can_read_segments','can_create_segments','can_write_segments','can_delete_segments','can_reindex_segments'] },
  sequences:                 { label: 'Sequences',                 perms: ['can_read_sequences','can_create_sequences','can_write_sequences','can_delete_sequences','can_reindex_sequences','can_add_sequence_items','can_delete_sequence_items'] },
  shares:                    { label: 'Shares',                    perms: ['can_read_shares','can_write_shares','can_manage_all_shares','can_reindex_shares','can_delete_object_shares','can_create_shares_to_upload'] },
  stats:                     { label: 'Stats',                     perms: ['can_read_stats'] },
  storages:                  { label: 'Storages',                  perms: ['can_read_storages','can_write_storages','can_delete_storages','can_reindex_storages','can_scan_bucket'] },
  subclips:                  { label: 'Subclips',                  perms: ['can_create_subclips'] },
  subscriptions:             { label: 'Subscriptions',             perms: ['can_read_subscriptions','can_write_subscriptions'] },
  teams_res:                 { label: 'Teams',                     perms: ['can_read_teams','can_write_teams','can_delete_teams','can_list_all_teams','can_edit_all_teams','can_list_team_users'] },
  transcoders:               { label: 'Transcoders',               perms: ['can_read_transcoders','can_write_transcoders','can_delete_transcoders','can_reindex_transcoders'] },
  transcriptions:            { label: 'Transcriptions',            perms: ['can_read_transcriptions','can_write_transcriptions','can_delete_transcriptions','can_transcribe_content','can_analyze_content'] },
  transfers:                 { label: 'Transfers',                 perms: ['can_read_transfers','can_write_transfers'] },
  users:                     { label: 'Users',                     perms: ['can_read_users','can_create_users','can_write_users','can_delete_users','can_reindex_users','can_list_all_users','can_list_role_group_users','can_edit_all_users','can_act_as_user','web_can_list_users'] },
  versions:                  { label: 'Versions',                  perms: ['can_read_versions','can_write_versions','can_delete_versions','web_can_view_versions'] },
  webhooks_res:              { label: 'Webhooks',                  perms: ['can_read_webhooks','can_write_webhooks','can_delete_webhooks'] },
  web_features:              { label: 'Web Features',              perms: ['web_can_upload','web_can_upload_legacy','web_can_top_level_upload','web_can_download_original','web_can_download_proxy','web_can_create_placeholder','web_can_create_link_asset','web_enable_posters','can_use_adobe_panel','can_edit_persons','can_create_poster'] },
};

// Index inversé slug → clé catalogue
const SLUG_TO_CATALOG_KEY = {};
Object.entries(ICONIK_ITEMS_CATALOG).forEach(([key, { perms }]) => {
  perms.forEach(slug => { SLUG_TO_CATALOG_KEY[slug] = key; });
});


let rolesData        = { roles: [] };
let metadonneesData  = { metadonnees: [] };
let itemsAdvancedData= { items: [] };
let workflowsData    = { workflows: [] };
let categoriesData   = { categories: [] };
let savedSearchesData= { savedSearches: [] };
let storagesData       = { storages: [] };
const RELATION_TYPES_SYSTEM = [
  { name:'PARENT_CHILD',   source_label:'Parent',        destination_label:'Child',                description:'Asset is a child',                      is_directional:true,  is_system:true },
  { name:'SIBLING',        source_label:'Sibling',        destination_label:'Sibling',              description:'Assets are siblings',                   is_directional:false, is_system:true },
  { name:'PROMO_OF',       source_label:'Promo of',       destination_label:'Promo for',            description:'Assets is a promo of',                  is_directional:true,  is_system:true },
  { name:'PRODUCT_OF',     source_label:'Product of',     destination_label:'Source for',           description:'Asset created from a project',           is_directional:true,  is_system:true },
  { name:'USED_IN',        source_label:'Used in',        destination_label:'Uses',                 description:'Assets used in a project',               is_directional:true,  is_system:true },
  { name:'COMPONENT_OF',   source_label:'Component of',   destination_label:'Component(s)',         description:'Source assets for a rendered sequence',  is_directional:true,  is_system:true },
  { name:'DUPLICATE',      source_label:'Duplicate',      destination_label:'Duplicate',            description:'Assets are a duplicate',                 is_directional:false, is_system:true },
  { name:'PUBLICATION_OF', source_label:'Publication of', destination_label:'Publication source for',description:'Asset is a publication of',             is_directional:true,  is_system:true },
];
let relationTypesData  = { relationTypes: [] };
let systemSettingsData = { settings: {} };
let usersData        = { users: [] };
let appTokensData    = { appTokens: [] };
let exportLocationsData = { exportLocations: [] };

// ── État UI ───────────────────────────────────────────────────
let currentEntity = 'teams';   // entité sélectionnée dans sidebar
let currentItem   = null;      // nom/id de l'élément sélectionné dans liste
let _modalCreateCb= null;      // callback de validation modale création
let _modalPermsCb = null;      // callback de validation modale perms

// ─── MODALE D'ASSOCIATION USERS (fonction globale) ─────────────────────
function ouvrirModalAssoc(entity, assocType, parentNom) {
  if (entity !== 'users') { toast('Association non supportée pour ' + entity, true); return; }
  const user = (usersData.users || []).find(u => u.nom === parentNom);
  if (!user) { toast('Utilisateur introuvable', true); return; }
  
  let options = [];
  let title = '';
  
  if (assocType === 'roleGroups') {
    const deja = (user.role_groups || []).map(rg => (rg.nom || rg.name));
    options = sortAlpha(roleGroupsData.roleGroups, 'nom')
      .map(rg => rg.nom)
      .filter(n => !deja.includes(n));
    title = 'Associer un Role Group';
  } else if (assocType === 'teams') {
    const deja = (user.teams || []).map(t => t.nom);
    options = sortAlpha(teamsData.teams, 'nom')
      .map(t => t.nom)
      .filter(n => !deja.includes(n));
    title = 'Ajouter une équipe';
  } else { 
    toast('Type non supporté', true); 
    return; 
  }

  const optHtml = options.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  const extra = assocType === 'teams' ? `
    <label style="display:flex;align-items:center;gap:7px;margin-top:6px;cursor:pointer;">
      <input type="checkbox" id="assoc-team-primary"> Définir comme équipe primaire
    </label>` : '';

  // Ouvre la modale "Créer" (déjà présente dans le fichier)
  document.getElementById('modalCreateTitle').textContent = title;
  document.getElementById('modalCreateBody').innerHTML = `
    <div class="form-row">
      <label>Sélection</label>
      <select id="assoc-select">
        <option value="">— Sélectionner —</option>${optHtml}
      </select>
    </div>${extra}`;
  document.getElementById('modalCreate').classList.add('open');

  // Valider l'association
  const primaryBtn = document.querySelector('#modalCreate .set-modal-ftr .primary');
  if (!primaryBtn) { toast('Bouton de validation introuvable', true); return; }
  
  primaryBtn.onclick = () => {
    const val = document.getElementById('assoc-select')?.value;
    if (!val) { toast('Sélectionnez un élément', true); return; }

    try {
      if (assocType === 'roleGroups') {
        if (!user.role_groups) user.role_groups = [];
        if (user.role_groups.some(rg => rg.nom === val)) { toast('Déjà ajouté', true); return; }
        const rg = (roleGroupsData.roleGroups || []).find(r => r.nom === val);
        user.role_groups.push({ nom: val, id: rg?.id || null });
      } else {
        if (!user.teams) user.teams = [];
        if (user.teams.some(t => t.nom === val)) { toast('Déjà ajoutée', true); return; }
        const team = (teamsData.teams || []).find(t => t.nom === val);
        const makePrimary = (user.teams.length === 0) || !!document.getElementById('assoc-team-primary')?.checked;
        if (makePrimary) (user.teams || []).forEach(t => t.is_primary = false);
        user.teams.push({ nom: val, id: team?.id || null, is_primary: !!makePrimary });
      }

      sauvegarderDonnees(); 
      updateCounters();
      fermerModalCreate();
      
      // ← CORRECTION : Mettre à jour currentItem AVANT renderDetail
      currentItem = parentNom;
      renderDetail(parentNom, true);
      
      toast('Associé ✓');
    } catch (e) {
      console.error('[assoc users]', e);
      toast('Erreur association : ' + e.message, true);
    }
  };
}
// ══ DONNÉES ═══════════════════════════════════════════════════

function initialiserDonnees() {
  // Neutralisé — données Iconik viennent de la DB via chargerDonnees()
}

async function chargerDonnees(forcedEnvSlug) {
  // 2026-06-27 — Chargement direct depuis snapshot DB, sans sessionStorage
  // sessionStorage supprimé : la source de vérité est le snapshot DB (ikon-data.js)
  // Le chargement à la demande par scope remplacera ce chargement monolithique en Phase D
  window._apsLoading = true;

  // 1) Environments depuis DB
  try {
    const envsResp = await fetch('/api/environments');
    if (envsResp.ok) {
      const envs = await envsResp.json();
      appTokensData = {
        appTokens: envs.map(e => ({
          name: e.name, environment: e.type, env: e.slug,
          iconikUrl: e.baseUrl || 'https://app.iconik.io',
          appId: e.appId || '', token: '', enabled: true,
        }))
      };
    }
  } catch(e) { console.warn('[APS] Erreur environments:', e.message); appTokensData = { appTokens: [] }; }

  // 2) Env actif
  const _activeToken = forcedEnvSlug
    ? (appTokensData.appTokens.find(t => (t.env || t.environment) === forcedEnvSlug) || appTokensData.appTokens[0])
    : (appTokensData.appTokens.find(t => t.environment === 'prod')
       || appTokensData.appTokens.find(t => t.environment === 'qa')
       || appTokensData.appTokens[0]) || null;
  if (!_activeToken) { console.warn('[APS] Aucun environnement'); window._apsLoading = false; return; }
  window._apsActiveEnvSlug = _activeToken.env || _activeToken.environment;
  try { localStorage.setItem('aps:context', JSON.stringify({ domain: window._apsActiveEnvSlug })); } catch(_) {}

  // 3) Chargement snapshot DB — un seul appel, toutes les données résolues côté serveur
  const _t0 = performance.now();
  const snap = await fetch('/api/ikon/snapshot/' + window._apsActiveEnvSlug)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!snap) { console.warn('[APS] Snapshot introuvable pour', window._apsActiveEnvSlug); window._apsLoading = false; return; }

  // 4) Distribution dans les variables globales — contrat canonique ikon-data.js
  collectionsData     = { collections:    snap.collections    || [] };
  metadataViewsData   = { metadataViews:  snap.views          || [], viewFieldsById: snap.viewFieldsById || {} };
  metadonneesData     = { metadonnees:    snap.metadonnees    || [] };
  roleGroupsData      = { roleGroups:     snap.roleGroups     || [] };
  savedSearchesData   = { savedSearches:  snap.savedSearches  || [] };
  customActionsData   = { customActions:  snap.customActions  || [] };
  teamsData           = { teams:          snap.teams          || [] };
  storagesData        = { storages:       snap.storages       || [] };
  usersData           = { users:          snap.users          || [] };
  categoriesData      = { categories:     snap.categories     || [], defaultViewsByType: {} };
  webhooksData        = { webhooks:       snap.webhooks       || [] };
  automationsData     = { automations:    snap.automations    || [] };
  relationTypesData   = { relationTypes:  snap.relationTypes  || [] };
  systemSettingsData  = snap.systemSettings ? { settings: snap.systemSettings } : null;
  exportLocationsData = { exportLocations: snap.exportLocations || [] };
  rolesData           = { roles:          snap.roles          || [] };
  appsData            = { apps:           snap.apps           || [] };

  console.log('[APS] Snapshot chargé en', Math.round(performance.now()-_t0)+'ms',
    '| teams:', (teamsData.teams||[]).length,
    '| cols:', (collectionsData.collections||[]).length,
    '| views:', (metadataViewsData.metadataViews||[]).length);

  // 5) UI — org + timestamp snapshot
  const orgName = _activeToken.name.split('|')[1]?.trim() || _activeToken.name;
  const orgInput = document.getElementById('input-org-name');
  if (orgInput) orgInput.value = orgName;
  const orgBadge = document.getElementById('orgBadge');
  if (orgBadge && orgName) orgBadge.textContent = orgName.toUpperCase();
  document.title = (orgName || 'Iconik') + ' — Settings';
  const _tsEl = document.getElementById('snapshot-ts');
  if (_tsEl && snap.capturedAt) {
    const _d = new Date(snap.capturedAt);
    const _fmt = _d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' })
      + ' ' + _d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris' });
    _tsEl.textContent = 'Snapshot : ' + _fmt;
    _tsEl.title = snap.capturedAt;
  }

  // 5b) Post-traitements — calculs dérivés depuis les données du snapshot
  // Ces calculs étaient faits par syncIconik — ils sont maintenant faits ici
  // après distribution, sans aucun appel Iconik supplémentaire

  // 5b-1) metadonnees[].metadataViews — depuis viewFieldsById du snapshot
  if (metadonneesData.metadonnees?.length && metadataViewsData.metadataViews?.length) {
    const metaByName = {};
    metadonneesData.metadonnees.forEach(m => { if (m.nom || m.name) metaByName[m.nom || m.name] = m; });
    metadataViewsData.metadataViews.forEach(v => {
      const viewName = v.nom || v.name || v.id;
      (v.view_fields || []).forEach(f => {
        const meta = metaByName[f.name || f.field_name];
        if (!meta) return;
        if (!meta.metadataViews) meta.metadataViews = meta.metadataView ? [meta.metadataView] : [];
        if (!meta.metadataViews.includes(viewName)) meta.metadataViews.push(viewName);
        meta.metadataView = meta.metadataViews[0];
      });
    });
  }

  // 5b-2) users — enrichissement teams + role_groups depuis teamIds du snapshot
  if (usersData.users?.length && teamsData.teams?.length) {
    const teamById = {};
    teamsData.teams.forEach(t => { if (t?.id) teamById[t.id] = t; });
    usersData.users.forEach(u => {
      u.teams = (Array.isArray(u.groups) ? u.groups : [])
        .map(g => { const id = g.id || g; const t = teamById[id]; return t ? { id, nom: t.nom || t.name || id } : null; })
        .filter(Boolean);
      u.role_groups = [];
    });
    // 5b-3) teams[].users — reconstruction inverse
    teamsData.teams.forEach(t => { t.users = []; });
    usersData.users.forEach(u => {
      (u.teams || []).forEach(mt => {
        const team = teamById[mt.id];
        if (!team) return;
        if (!team.users) team.users = [];
        if (!team.users.some(x => x.id === u.id))
          team.users.push({ id: u.id, nom: u.nom || u.name || u.email || u.id, email: u.email || '' });
      });
    });
  }

  // 5b-4) roleGroups — calcul fonctionnalites + rolesData + itemsAdvancedData — calcul fonctionnalites + rolesData + itemsAdvancedData
  // Ces données sont dérivées de role_categories et roles (présents dans le snapshot)
  // mais nécessitent ROLE_CAT_LABELS, SLUG_TO_CATALOG_KEY, ICONIK_ITEMS_CATALOG (constantes frontend)
  if (typeof ROLE_CAT_LABELS !== 'undefined' && typeof slugToPermLabel === 'function') {
    roleGroupsData.roleGroups = (roleGroupsData.roleGroups || []).map(rg => {
      const rc  = rg.role_categories || {};
      const fonctionnalites = Object.entries(rc)
        .filter(([, active]) => active === true)
        .map(([k]) => ROLE_CAT_LABELS[k] || k)
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
      const rolesSlugs = rg.roles || [];
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
      return { ...rg, fonctionnalites, assignations };
    });

    rolesData.roles = Object.values(ROLE_CAT_LABELS).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

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
    itemsAdvancedData.items = Object.values(globalItemsMap)
      .filter(i => i.assignations.length > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }

  _populateEnvSwitcher();
  window._apsLoading = false;
}


function sauvegarderDonnees() {
  // ────────────────────────────────────────────────────────────────
  // 0) Écrire les stores "classiques" (inchangés)
  // ────────────────────────────────────────────────────────────────
  // Données Iconik — source de vérité = DB (via proxy). Pas de setItem volumieux.

  // ────────────────────────────────────────────────────────────────
  // 1) Automations — stratégie B : RAW + CANONIQUE
  //    - automationsData_raw : brut Iconik (forensic/debug/export)
  //    - automationsData     : canonique WFD (consommé par toutes les pages)
  // ────────────────────────────────────────────────────────────────
  const M = window.WFD_Mappers;
  const now = new Date().toISOString();

  const list = (automationsData && Array.isArray(automationsData.automations))
    ? automationsData.automations
    : [];

  // 1.a) RAW : on privilégie a.raw si présent (car automationsData est déjà "mappé" côté Settings),
  // sinon on garde l'objet lui-même (best-effort).
  const rawAutomations = list.map(a => (a && a.raw) ? a.raw : a);

  // 1.b) CANONIQUE : on mappe depuis le RAW quand possible, mais on restaure les champs WFD-only
  // (ex: conditions) depuis l'objet courant (a) pour ne pas les perdre.
  const canonAutomations = list.map(a => {
    const raw = (a && a.raw) ? a.raw : a;

    let mapped = raw;
    if (M && typeof M.mapAutomationDeep === 'function') {
      mapped = M.mapAutomationDeep(raw);
    } else if (M && typeof M.mapAutomation === 'function') {
      mapped = M.mapAutomation(raw);
    }

    // ✅ Restaurer WFD-only (conditions), car Iconik ne les fournit pas
    // et elles sont maintenues localement côté Settings.
    const conditions = Array.isArray(a?.conditions) ? a.conditions : (Array.isArray(mapped?.conditions) ? mapped.conditions : []);
    mapped.conditions = conditions;

    return mapped;
  });

  // 1.c) Écrire RAW store
  // (DB) automationsData_raw — en mémoire uniquement

  // 1.d) Écrire CANONIQUE store (SoT pour les pages consommatrices)
  automationsData = { automations: canonAutomations }; // garde le modèle attendu (automations[])
  // (DB) automationsData — en mémoire uniquement

  // ────────────────────────────────────────────────────────────────
  // 2) Backup existant
  // ────────────────────────────────────────────────────────────────
  if (typeof _backupEnvs === 'function') _backupEnvs();
}

function mettreAJourOrganisation(name) {
  // (DB) organisationName — en mémoire uniquement
  const orgBadge = document.getElementById('orgBadge');
  if (orgBadge) orgBadge.textContent = name.trim().toUpperCase();
  document.title = (name.trim() || 'Iconik') + ' — Settings';
  const badge = document.getElementById('org-save-badge');
  if (badge) {
    badge.style.display = 'inline';
    clearTimeout(window._orgTimer);
    window._orgTimer = setTimeout(() => { badge.style.display = 'none'; }, 2000);
  }
}

// =======================================================================
// WFD-only : Association documentaire Team ↔ Role Group (bidirectionnelle, id-only)
// - Persistée dans teamsData.teams[*].roleGroups_doc_ids
// - Persistée dans roleGroupsData.roleGroups[*].teams_doc_ids
// - Affichage "easy reading" via résolution id → nom au rendu (pas de nom stocké)
// =======================================================================

function _ensureDocLinksContainers() {
  (teamsData.teams || []).forEach(t => {
    if (!Array.isArray(t.roleGroups_doc_ids)) t.roleGroups_doc_ids = [];
  });
  (roleGroupsData.roleGroups || []).forEach(rg => {
    if (!Array.isArray(rg.teams_doc_ids)) rg.teams_doc_ids = [];
  });
}

function _findTeamById(teamId) {
  return (teamsData.teams || []).find(t => String(t.id) === String(teamId));
}

function _findRGById(rgId) {
  return (roleGroupsData.roleGroups || []).find(rg => String(rg.id) === String(rgId));
}

// Normalisation bidirectionnelle :
// - si team a un rgId, alors rg doit contenir teamId
// - si rg a teamId, alors team doit contenir rgId
function normalizeTeamRoleGroupsDoc() {
  _ensureDocLinksContainers();

  const teamById = {};
  (teamsData.teams || []).forEach(t => { if (t?.id) teamById[String(t.id)] = t; });

  const rgById = {};
  (roleGroupsData.roleGroups || []).forEach(rg => { if (rg?.id) rgById[String(rg.id)] = rg; });

  // Team -> RG
  (teamsData.teams || []).forEach(t => {
    const tid = String(t?.id || '');
    if (!tid) return;

    t.roleGroups_doc_ids = Array.from(new Set((t.roleGroups_doc_ids || []).map(String)));

    t.roleGroups_doc_ids.forEach(rgId => {
      const rg = rgById[String(rgId)];
      if (!rg) return; // id inconnu : on garde côté team (doc), mais pas de miroir possible

      rg.teams_doc_ids = Array.from(new Set((rg.teams_doc_ids || []).map(String)));
      if (!rg.teams_doc_ids.includes(tid)) rg.teams_doc_ids.push(tid);
    });
  });

  // RG -> Team
  (roleGroupsData.roleGroups || []).forEach(rg => {
    const rgid = String(rg?.id || '');
    if (!rgid) return;

    rg.teams_doc_ids = Array.from(new Set((rg.teams_doc_ids || []).map(String)));

    rg.teams_doc_ids.forEach(tid => {
      const t = teamById[String(tid)];
      if (!t) return; // id inconnu : on garde côté RG (doc), miroir impossible

      t.roleGroups_doc_ids = Array.from(new Set((t.roleGroups_doc_ids || []).map(String)));
      if (!t.roleGroups_doc_ids.includes(rgid)) t.roleGroups_doc_ids.push(rgid);
    });
  });

  // Persist
  // (DB) teamsData — en mémoire uniquement
  // (DB) roleGroupsData — en mémoire uniquement
}

// Ajout (bidirectionnel) : teamId <-> rgId
function associerTeamRoleGroupDoc(teamId, rgId) {
  _ensureDocLinksContainers();

  const t = _findTeamById(teamId);
  const rg = _findRGById(rgId);
  if (!t || !rg) { toast('Team ou Role Group introuvable', true); return; }

  const tid  = String(t.id);
  const rgid = String(rg.id);

  if (!t.roleGroups_doc_ids.includes(rgid)) t.roleGroups_doc_ids.push(rgid);
  if (!rg.teams_doc_ids.includes(tid)) rg.teams_doc_ids.push(tid);

  // Dedup + persist (et miroir bidirectionnel)
  normalizeTeamRoleGroupsDoc();

  // Refresh UI robuste : repasse par le cycle UI complet
  (function(){
    const tName  = t.nom  || t.name  || '';
    const rgName = rg.nom || rg.name || '';

    // ⚠️ currentEntity est une variable (let), pas window.currentEntity
    const entity = (typeof currentEntity !== 'undefined') ? currentEntity : '';

    // Sauvegarder la recherche courante (si l'utilisateur a filtré)
    const searchEl = document.getElementById('set-list-search');
    const searchVal = searchEl ? (searchEl.value || '') : '';

    const forceReselect = (ent, itemName) => {
      if (!itemName) return;

      // switchEntity déclenche le cycle standard (reset + renderListe)
      if (typeof switchEntity === 'function') switchEntity(ent);

      // Restaurer recherche + rerender + selectItem (dans le bon ordre DOM)
      setTimeout(() => {
        const se = document.getElementById('set-list-search');
        if (se) se.value = searchVal;

        if (typeof renderListe === 'function') renderListe(searchVal);
        setTimeout(() => {
          if (typeof selectItem === 'function') selectItem(itemName);
        }, 0);
      }, 0);
    };

    if (entity === 'teams') return forceReselect('teams', tName);
    if (entity === 'roleGroups') return forceReselect('roleGroups', rgName);
  })();

  toast('✅ Association Team ↔ Role Group (doc) ajoutée');
}


// Retrait (bidirectionnel) : teamId <-> rgId
function retirerTeamRoleGroupDoc(teamId, rgId) {
  _ensureDocLinksContainers();

  const t = _findTeamById(teamId);
  const rg = _findRGById(rgId);
  if (!t || !rg) { toast('Team ou Role Group introuvable', true); return; }

  const tid  = String(t.id);
  const rgid = String(rg.id);

  t.roleGroups_doc_ids = (t.roleGroups_doc_ids || []).map(String).filter(x => x !== rgid);
  rg.teams_doc_ids     = (rg.teams_doc_ids || []).map(String).filter(x => x !== tid);

  // Persist
  // (DB) teamsData — en mémoire uniquement
  // (DB) roleGroupsData — en mémoire uniquement

  // Refresh UI robuste : repasse par le cycle UI complet
  (function(){
    const tName  = t.nom  || t.name  || '';
    const rgName = rg.nom || rg.name || '';

    const entity = (typeof currentEntity !== 'undefined') ? currentEntity : '';

    const searchEl = document.getElementById('set-list-search');
    const searchVal = searchEl ? (searchEl.value || '') : '';

    const forceReselect = (ent, itemName) => {
      if (!itemName) return;

      if (typeof switchEntity === 'function') switchEntity(ent);

      setTimeout(() => {
        const se = document.getElementById('set-list-search');
        if (se) se.value = searchVal;

        if (typeof renderListe === 'function') renderListe(searchVal);
        setTimeout(() => {
          if (typeof selectItem === 'function') selectItem(itemName);
        }, 0);
      }, 0);
    };

    if (entity === 'teams') return forceReselect('teams', tName);
    if (entity === 'roleGroups') return forceReselect('roleGroups', rgName);
  })();

  toast('✅ Association Team ↔ Role Group (doc) retirée');
}

// ── Tri alphabétique ──────────────────────────────────────────
function sortAlpha(arr, key) {
  if (!arr) return [];
  return [...arr].sort((a, b) => {
    const va = key ? (a[key] || '') : (a || '');
    const vb = key ? (b[key] || '') : (b || '');
    return va.toString().localeCompare(vb.toString(), 'fr', { sensitivity: 'base' });
  });
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, isError = false) {
  const el = document.getElementById('set-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'set-toast' + (isError ? ' error' : '') + ' show';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.className = 'set-toast'; }, 2800);
}

// =======================================================
// WFD — Prompt replacement (Electron-safe): type-to-confirm modal
// =======================================================
async function askTypedConfirm({ title, message, expected, placeholder }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';

    const box = document.createElement('div');
    box.style.cssText = 'width:min(520px, 100%);background:#141516;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;box-shadow:0 22px 50px rgba(0,0,0,.45);color:#eef0f1;font-family:system-ui;';

    const h = document.createElement('div');
    h.textContent = title || 'Confirmation';
    h.style.cssText = 'font-weight:900;margin-bottom:8px;';

    const p = document.createElement('div');
    p.textContent = message || '';
    p.style.cssText = 'font-size:13px;opacity:.9;white-space:pre-wrap;margin-bottom:10px;';

    const inpt = document.createElement('input');
    inpt.type = 'text';
    inpt.placeholder = placeholder || expected || '';
    inpt.style.cssText = 'width:100%;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;color:#eef0f1;font-size:13px;outline:none;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Annuler';
    btnCancel.style.cssText = 'padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#eef0f1;cursor:pointer;';

    const btnOk = document.createElement('button');
    btnOk.textContent = 'Valider';
    btnOk.style.cssText = 'padding:9px 10px;border-radius:10px;border:1px solid rgba(214,210,51,.35);background:rgba(214,210,51,.18);color:#eef0f1;cursor:pointer;';

    const done = (ok) => { ov.remove(); resolve(ok === true); };
    btnCancel.onclick = () => done(false);
    btnOk.onclick = () => done(String(inpt.value || '').trim() === String(expected || '').trim());

    inpt.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') btnOk.click();
    });

    row.appendChild(btnCancel);
    row.appendChild(btnOk);
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(inpt);
    box.appendChild(row);
    ov.appendChild(box);
    document.body.appendChild(ov);
    setTimeout(() => inpt.focus(), 30);
  });
}

// ══ SIDEBAR — Compteurs & Switch ══════════════════════════════


function updateCounters() {

  // helpers: si les filtres WFD existent, on les utilise
  const teamsCount = (typeof wfdGetTeamsForSync === 'function')
    ? (wfdGetTeamsForSync() || []).filter(t => !(t?.is_acl_stub === true || t?.source === 'acl_stub')).length
    : (teamsData.teams || []).length;

  const catsCount = (typeof wfdGetCategoriesForSync === 'function')
    ? (wfdGetCategoriesForSync() || []).length
    : (categoriesData.categories || []).length;

  const mdvCount = (typeof wfdGetMetadataViewsForSync === 'function')
    ? (wfdGetMetadataViewsForSync() || []).length
    : (metadataViewsData.metadataViews || []).length;

  const counts = {
    teams: teamsCount,
    roleGroups: (roleGroupsData.roleGroups || []).length,
    collections: (collectionsData.collections || []).length,

    // ✅ alignés avec filtres Settings
    metadataViews: mdvCount,
    categories: catsCount,

    metadonnees: (metadonneesData.metadonnees || []).length,
    roles: (rolesData.roles || []).length,
    savedSearches: (savedSearchesData.savedSearches || []).length,
    storages:       (storagesData.storages || []).length,
    relationTypes:  (relationTypesData.relationTypes || []).length,
    users: (usersData.users || []).length,
    items: (itemsAdvancedData.items || []).length,
    workflows: (workflowsData.workflows || []).length,
    appTokens: (appTokensData.appTokens || []).length,
    apps: (appsData.apps || []).length,
    exportLocations: (exportLocationsData.exportLocations || []).length,
  };

  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById('cnt-' + k);
    if (el) el.textContent = v;
  });
}

function switchEntity(entity) {
  currentEntity = entity;
  currentItem = null;

  // Sidebar highlight
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
  const sbBtn = document.getElementById('sb-' + entity);
  if (sbBtn) sbBtn.classList.add('active');

  // Titre liste
  const titles = {
    teams: 'Teams', roleGroups: 'Role Groups', collections: 'Collections',
    metadataViews: 'Metadata Views', metadonnees: 'M\u00e9tadonn\u00e9es', roles: 'R\u00f4les',
    savedSearches: 'Saved Searches', storages: 'Storages', users: 'Users', relationTypes: 'Relation Types', exportLocations: 'Export Locations', shareSettings: 'Share Settings', items: 'Items Avanc\u00e9s',
    workflows: 'Workflows', categories: 'Cat\u00e9gories', appTokens: 'Environnements Iconik', apps: 'Application Tokens', clean: 'Clean', apiCheck: 'API Check', testEndpoints: 'Test Endpoints', healthCheck: 'Health Check', jobs: 'Jobs',
  };
  document.getElementById('set-list-title').textContent = titles[entity] || entity;
  document.getElementById('set-list-search').value = '';

  // Bouton créer fixe dans le header de liste
  let creerBtnEl = document.getElementById('set-list-create-btn');
  if (!creerBtnEl) {
    creerBtnEl = document.createElement('button');
    creerBtnEl.id = 'set-list-create-btn';
    creerBtnEl.className = 'set-create-btn';
    creerBtnEl.textContent = '+ Créer';
    creerBtnEl.onclick = creerElement;
    document.getElementById('set-list-hdr').appendChild(creerBtnEl);
  }

  // Reset détail
  document.getElementById('set-detail-hdr').style.display = 'none';
  document.getElementById('set-detail-body').innerHTML = '';

  // Masquer bouton créer et header détail pour apiCheck
  const createBtn2 = document.getElementById('set-list-create-btn');
  if (createBtn2) createBtn2.style.display = (entity === 'apiCheck' || entity === 'clean' || entity === 'testEndpoints' || entity === 'healthCheck' || entity === 'jobs') ? 'none' : '';
  renderListe('');
  
  // ✅ Singletons : auto-sélectionne l'unique item pour afficher le canvas
  const _singletonMap = {
    'clean':         'CLEAN — Domaine & Reset APS',
    'apiCheck':      'Vérification API Iconik',
    'testEndpoints': 'Test Endpoints',
    'healthCheck':   'Health Check',
    'jobs':          'Jobs & Historique',
  };
  if (_singletonMap[entity]) {
    setTimeout(() => { selectItem(_singletonMap[entity]); }, 0);
  }
}

// ══ LISTE CASSETTES ═══════════════════════════════════════════

function getListItems(entity) {
  switch (entity) {
  case 'clean': return [{ nom: 'CLEAN — Domaine & Reset APS', id: 'clean' }];
    case 'jobs':         return [{ nom: 'Jobs & Historique', id: 'jobs' }];
    case 'testEndpoints': return [{ nom: 'Test Endpoints', id: 'testEndpoints' }];
    case 'healthCheck':   return [{ nom: 'Health Check', id: 'healthCheck' }];
    case 'teams': {
    const list = wfdGetTeamsForSync().filter(t => !(t && (t.is_acl_stub === true || t.source === 'acl_stub')));
    return sortAlpha(list, 'nom');
    }
    case 'roleGroups':    return sortAlpha(roleGroupsData.roleGroups, 'nom');
    case 'collections':   return sortAlpha(collectionsData.collections).map(c => typeof c==='string' ? {nom:c} : {nom:c.name||c.id||'', id:c.id, parent_id:c.parent_id||null});
    case 'metadataViews': return sortAlpha(wfdGetMetadataViewsForSync()).map(c => typeof c==='string' ? {nom:c} : { nom: c.name || c.nom || c.id || '', id: c.id });
    case 'metadonnees':   return sortAlpha(metadonneesData.metadonnees, 'nom');
    case 'roles':         return sortAlpha(rolesData.roles).map(r => ({ nom: r }));
    case 'savedSearches': return sortAlpha(savedSearchesData.savedSearches, 'nom');
    case 'storages':      return sortAlpha(storagesData.storages, 'nom');
	case 'users':         return sortAlpha(usersData.users, 'nom');
    case 'items':         return sortAlpha(itemsAdvancedData.items, 'nom');
    case 'workflows':     return sortAlpha(wfdGetCategoriesForSync(), 'nom');
    case 'categories': {
      // Dédupliquer par nom (évite doublons "Default" avec id vide)
      const seen = new Set();
      const cats = sortAlpha(wfdGetCategoriesForSync(), 'nom').filter(c => {
        const k = (c.nom||c.name||'').toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      return cats;
    }
    case 'appTokens':     return sortAlpha(appTokensData.appTokens, 'name');
    case 'apiCheck':      return [{ nom: 'Vérification API Iconik', id: 'apiCheck' }];
	case 'apps':          return sortAlpha(appsData.apps, 'nom');
    case 'relationTypes': {
      const custom = (relationTypesData.relationTypes||[]).map(r=>({...r, nom:r.name||r.id}));
      const system = RELATION_TYPES_SYSTEM.map(r=>({...r, nom:r.name}));
      // Custom d'abord, puis système (en évitant doublons)
      const customNames = new Set(custom.map(r=>r.name));
      return [...sortAlpha(custom,'nom'), ...system.filter(r=>!customNames.has(r.name))];
    }
    case 'exportLocations': return sortAlpha(exportLocationsData.exportLocations || [], 'nom').map(el => ({ nom: el.nom, id: el.id }));
    case 'shareSettings': return [{ nom: 'Share Settings', id: 'shareSettings' }];
    default: return [];
  }
}

function getItemCount(entity, item) {
  const nom = item.nom || item.name || '';
  switch (entity) {
    case 'teams':
      return (item.collections || []).length + (item.vues || []).length;
    case 'roleGroups':
      return (item.fonctionnalites || []).length;
    case 'collections':
      return teamsData.teams.filter(t => (t.collections||[]).some(c=>c.chemin===nom)).length;
    case 'metadataViews':
      return metadonneesData.metadonnees.filter(m=>(m.metadataViews||[m.metadataView]).includes(nom)).length;
    case 'metadonnees':
      return (item.metadataViews || (item.metadataView ? [item.metadataView] : [])).length;
    case 'roles':
      return roleGroupsData.roleGroups.filter(rg=>(rg.fonctionnalites||[]).includes(nom)).length;
    case 'savedSearches':
      return (item.teams || []).length;
    case 'storages':
      return (item.teams || []).length;
    case 'items':
      return (item.assignations || []).length;
    case 'workflows':
      return (item.collections || []).length + (item.metadonnees || []).length;
    case 'categories':
      return (item.metadataViews || []).length;
    case 'exportLocations':
      return 0;
    case 'appTokens':
      return 0;
    case 'apiCheck':
      return 0;
    default: return 0;
  }
}

function buildColTree(cols) {
  const items = cols.map(c => typeof c === 'string' ? { id: c, nom: c, parent_id: null, _enfants: [] }
    : { id: c.id||c.nom||'', nom: c.nom||c.name||c.id||'', parent_id: c.parent_id||null, _enfants: [] }
  );
  const byId = {};
  items.forEach(c => { byId[c.id] = c; });
  const roots = [];
  items.forEach(c => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id]._enfants.push(c);
    else roots.push(c);
  });
  const sortR = arr => { arr.sort((a,b) => a.nom.localeCompare(b.nom,'fr',{sensitivity:'base'})); arr.forEach(c => sortR(c._enfants)); };
  sortR(roots);
  return roots;
}

function renderColTree(roots, q) {
  // Initialiser tous les nœuds à false (replié) au premier rendu
  if (!setColExpandedInit) {
    setColExpandedInit = true;
    const initWalk = (nodes) => { nodes.forEach(c => { if (!(c.id in setColExpanded)) setColExpanded[c.id] = false; initWalk(c._enfants||[]); }); };
    initWalk(roots);
  }
  let html = '';
  function walk(nodes, depth, parentVisible) {
    nodes.forEach(c => {
      const hasChildren = c._enfants.length > 0;
      const expanded = !!setColExpanded[c.id];
      if (q && !c.nom.toLowerCase().includes(q)) { walk(c._enfants, depth+1, false); return; }
      const isActive = (c.id === currentItem || c.nom === currentItem) ? 'active' : '';
      const display = (!parentVisible && depth > 0) ? 'style="display:none"' : '';
      const indent = depth * 14;
      const toggleIcon = hasChildren ? (expanded ? '&#9660;' : '&#9654;') : '';
      const folder = hasChildren ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
      const cnt = getItemCount('collections', c);
      html += `<div class="set-cassette set-col-node ${isActive}" ${display}
        data-col-id="${escHtml(c.id)}" data-col-depth="${depth}"
        onclick="selectItem('${escJs(c.id)}')">
        <span style="display:inline-flex;align-items:center;gap:4px;flex:1;min-width:0;">
          <span style="display:inline-block;width:${indent}px;flex-shrink:0;"></span>
          <span style="width:14px;text-align:center;font-size:9px;color:#8899aa;${hasChildren?'cursor:pointer;':''}"
            onclick="event.stopPropagation();setColToggle('${escJs(c.id)}',${hasChildren})">${toggleIcon}</span>
          <span style="flex-shrink:0;">${folder}</span>
          <span class="set-cassette-name" title="${escHtml(c.nom)}">${escHtml(c.nom)}</span>
        </span>
        ${cnt > 0 ? `<span class="set-cassette-count">${cnt}</span>` : ''}
      </div>`;
      if (hasChildren) walk(c._enfants, depth+1, q ? true : expanded);
    });
  }
  walk(roots, 0, true);
  return html;
}

function setColToggle(id, hasChildren) {
  if (!hasChildren) return;
  setColExpanded[id] = !setColExpanded[id];
  renderListe(document.getElementById('set-list-search')?.value || '');
}

function renderListe(filter) {
  const body = document.getElementById('set-list-body');
  const q = (filter || '').toLowerCase();

  if (currentEntity === 'collections') {
    const roots = buildColTree(collectionsData.collections || []);
    const html = renderColTree(roots, q);
    body.innerHTML = html || `<div class="set-empty-list">${q ? 'Aucun résultat' : 'Aucun élément'}</div>`;
    return;
  }

  const items = getListItems(currentEntity);

  // Bandeau nettoyage si des rôles techniques sont présents
  if (currentEntity === 'roles') {
    const technical = items.filter(r => r && typeof r === 'string' && (
      /^(can|web|is|has)_/.test(r) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r) ||
      (/^[a-z][a-z0-9_]+$/.test(r) && r.includes('_'))
    ));
    if (technical.length > 0) {
      body.innerHTML = `<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.3);
        border-radius:6px;padding:10px 14px;margin-bottom:8px;font-size:11px;color:#e74c3c;">
        ⚠️ ${technical.length} rôle(s) technique(s) détecté(s) (can_*).
        <button onclick="nettoyerRolesTechniques()"
          style="margin-left:8px;padding:2px 8px;border:1px solid #e74c3c;border-radius:4px;
          background:transparent;color:#e74c3c;cursor:pointer;font-size:11px;">
          🧹 Nettoyer
        </button>
      </div>` + (body.innerHTML || '');
    }
  }

  const filtered = items.filter(it => {
    const nom = (it.nom || it.name || it || '').toLowerCase();
    return !q || nom.includes(q);
  });
  let html = '';
  if (filtered.length === 0) {
    html += `<div class="set-empty-list">${q ? 'Aucun résultat' : 'Aucun élément'}</div>`;
  } else {
    filtered.forEach(it => {
      const nom = it.nom || it.name || '';
      const cnt = getItemCount(currentEntity, it);
      const isActive = nom === currentItem ? 'active' : '';
      html += `<div class="set-cassette ${isActive}" onclick="selectItem('${escJs(nom)}')">
        <span class="set-cassette-name" title="${escHtml(nom)}">${escHtml(nom)}</span>
        ${cnt > 0 ? `<span class="set-cassette-count">${cnt}</span>` : ''}
      </div>`;
    });
  }
  body.innerHTML = html;
}

function filtrerListe(val) {
  renderListe(val);
}

function selectItem(nom) {
  currentItem = nom;
  renderListe(document.getElementById('set-list-search').value);
  renderDetail(nom);
}

// ══ DÉTAIL ════════════════════════════════════════════════════

function renderDetail(nom, _preserveScroll) {
  const hdr = document.getElementById('set-detail-hdr');
  hdr.style.display = 'flex';
  let _displayNom = nom;
  if (currentEntity === 'collections') {
    const _col = (collectionsData.collections||[]).find(c=>c.id===nom||c.nom===nom);
    _displayNom = _col ? (_col.nom||_col.name||nom) : nom;
  }
  document.getElementById('set-detail-name').textContent = _displayNom;
  // WFD_CLEAN_HDR_GUARD
  if (currentEntity === 'clean') {
    const rn = document.getElementById('btn-rename');
    const dl = document.getElementById('btn-delete');
    if (rn) rn.style.display = 'none';
    if (dl) dl.style.display = 'none';
  }

  // Certaines entités n'ont pas de rename/delete direct ici
  const noRename = ['collections','metadataViews','roles'];
  document.getElementById('btn-rename').style.display = noRename.includes(currentEntity) ? '' : '';
  document.getElementById('btn-delete').style.display = '';

  // Sauvegarder scroll + filtre rôle avant rebuild
  const detailBody = document.getElementById('set-detail-body');
  const scrollTop = _preserveScroll && detailBody ? detailBody.scrollTop : 0;
  const rgFilter = document.getElementById('rgItemsRoleFilter');
  const savedRoleFilter = rgFilter ? rgFilter.value : null;

  const body = detailBody;
  body.innerHTML = '';

  switch (currentEntity) {
    case 'teams':         body.innerHTML = detailTeam(nom);         break;
    case 'roleGroups':    body.innerHTML = detailRoleGroup(nom);    break;
    case 'collections':   body.innerHTML = detailCollection(nom);   break;
    case 'metadataViews': body.innerHTML = detailMDView(nom);       break;
    case 'metadonnees':   body.innerHTML = detailMetadonnee(nom);   break;
    case 'roles':         body.innerHTML = detailRole(nom);         break;
    case 'savedSearches': body.innerHTML = detailSavedSearch(nom);  break;
    case 'storages':       body.innerHTML = detailStorage(nom);       break;
    case 'relationTypes':  body.innerHTML = detailRelationType(nom);  break;
    case 'exportLocations': body.innerHTML = detailExportLocation(nom);  break;
    case 'shareSettings':  body.innerHTML = detailShareSettings();     break;
	case 'users':         body.innerHTML = detailUser(nom);         break;
    case 'items':         body.innerHTML = detailItem(nom);         break;
    case 'workflows':     body.innerHTML = detailWorkflow(nom);     break;
    case 'categories':    body.innerHTML = detailCategorie(nom);    break;
    case 'appTokens':     body.innerHTML = detailAppToken(nom);     break;
	case 'apps':          body.innerHTML = detailApp(nom);          break;
	case 'clean':         body.innerHTML = detailClean(); if (typeof wfdCleanRefreshPickers === 'function') setTimeout(wfdCleanRefreshPickers, 0); if (typeof wfdCleanResetAPSInit === 'function') setTimeout(wfdCleanResetAPSInit, 50); break;
    case 'apiCheck':      body.innerHTML = detailApiCheck(); setTimeout(initApiCheck, 50); break;
    case 'jobs':          body.innerHTML = detailJobs(); setTimeout(initJobs, 50); break;
    case 'testEndpoints': body.innerHTML = detailTestEndpoints(); setTimeout(initTestEndpoints, 50); break;
    case 'healthCheck':   body.innerHTML = detailHealthCheck(); setTimeout(initHealthCheck, 50); break;
  }
  if (window._autoLayoutBind) window._autoLayoutBind();
  // Restaurer le scroll et le filtre rôle après rebuild DOM
  if (_preserveScroll && detailBody) {
    requestAnimationFrame(() => {
      detailBody.scrollTop = scrollTop;
      // Restaurer le filtre rôle du Role Group si présent
      if (savedRoleFilter !== null) {
        const newFilter = document.getElementById('rgItemsRoleFilter');
        if (newFilter) {
          newFilter.value = savedRoleFilter;
          // Re-filtrer pour n'afficher que le rôle sélectionné
          if (savedRoleFilter) {
            const rgNom = nom;
            filterRGItems(rgNom);
          }
        }
      }
    });
  }
}

function detailApp(nom) {
  const a = (appsData.apps || []).find(x => x.nom === nom);
  if (!a) return '<div class="set-empty-list">Introuvable.</div>';
  return sectionHtml('🔑','Application Token','var(--c-info)',
    `<div class="detail-field"><label>Nom</label><input type="text" value="${escHtml(a.nom)}" disabled></div>` +
    `<div class="detail-field"><label>ID</label><input type="text" value="${escHtml(a.id || '')}" disabled style="font-family:monospace;"></div>`
  );
}

// ─── helpers HTML ───────────────────────────────────────────


function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Pour les arguments dans onclick="fn('...')" — encode ' en \' pour JS sans casser l'attribut HTML
function escJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ⬇︎ PATCH 2 — helpers pour normaliser les noms de vues
function _viewName(v) {
  // Retourne toujours un nom lisible, même si metadataViewsData.metadataViews contient des objets {id,name}
  return typeof v === 'string' ? v : (v && (v.name || v.id || '')) || '';
}
function _viewNames(list) {
  return (Array.isArray(list) ? list : []).map(_viewName).filter(Boolean);
}



function sectionHtml(icon, title, color, content, fullHeight) {
  // fullHeight => la section prend le restant vertical et scrolle en interne
  const growCls = fullHeight ? ' grow' : '';
  return `<div class="detail-section${growCls}">
    <div class="detail-section-hdr">
      <span class="detail-section-title" style="color:${color||'var(--text-mid)'};">${icon} ${title}</span>
    </div>
    <div class="detail-section-body">${content}</div>
  </div>`;
}
async function _syncViewsToMetadata(base, headers) {
  // 1) s’assurer qu’on a la liste des views (id + name)
  if (!metadataViewsData || !Array.isArray(metadataViewsData.metadataViews) || !metadataViewsData.metadataViews.length) {
    const all = await syncFetchAll(base, headers, '/API/metadata/v1/views/?per_page=500', r =>
      (r.objects || []).map(v => ({ id: v.id, name: v.name || v.id }))
    );
    metadataViewsData.metadataViews = all;
  }
  const views = metadataViewsData.metadataViews;

  // 2) index rapide “nom → objet méta”
  const metaById = {};
  (metadonneesData.metadonnees || []).forEach(m => { metaById[m.id] = m; });

  // 3) pour chaque view, récupérer ses fields puis associer côté “Métadonnée”
  const BATCH = 12;
  for (let i = 0; i < views.length; i += BATCH) {
    const chunk = views.slice(i, i + BATCH);
    const results = await Promise.allSettled(
       chunk.map(v =>
  // 1) Essayer la vue complète (contient "view_fields")
    fetch(base + '/API/metadata/v1/views/' + encodeURIComponent(v.id) + '/', { headers })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && Array.isArray(data.view_fields)) {
      return { view: v, fields: data.view_fields };
       }
  // 2) Fallback: endpoint /fields/ (renvoie {objects:[{name,...}]})
      return fetch(base + '/API/metadata/v1/views/' + encodeURIComponent(v.id) + '/fields/?per_page=500', { headers })
        .then(r2 => r2.ok ? r2.json() : null)
        .then(d2 => ({ view: v, fields: (d2?.objects || []) }))
        .catch(() => ({ view: v, fields: [] }));
       })
       .catch(() => ({ view: v, fields: [] }))
	    )
	);	
    for (const r of results) {
      const view = r.value?.view;
      const fields = r.value?.fields || [];
      const viewName = view?.name || view?.id;
      fields.forEach(f => {
        const meta = metaById[f.name]; // la clé de tes métadatas = f.name
        if (!meta) return;
        if (!meta.metadataViews) meta.metadataViews = meta.metadataView ? [meta.metadataView] : [];
        if (!meta.metadataViews.includes(viewName)) meta.metadataViews.push(viewName);
        // Optionnel : maintenir “metadataView” (première vue) pour compat
        meta.metadataView = meta.metadataViews[0];
      });
    }
  }
}
function assocRowHtml(nom, perm, onDel, permFlags = []) {
  // Helper : pill homogène, avec fond optionnel pour "cellule pleine"
  const mkPill = (label, txt, brd, isFirst, bg = 'transparent') =>
    `<span style="
       display:inline-block;
       font-family:inherit;
       font-weight:700;
       letter-spacing:.02em;
       text-transform:uppercase;
       font-size:10px;
       color:${txt};
       border:1px solid ${brd};
       padding:1px 6px;
       border-radius:12px;
       margin-left:${isFirst ? '0' : '6px'};
       background:${bg};
     ">${escHtml(label)}</span>`;

  // Deux groupes de chips distincts
  const permChips = [];
  const inhChips  = [];

  // Groupe PERMISSIONS : Read/Write, Edit Access, Delete
  if (perm) {
    const isRW = (perm === 'Read & Write');
    const clr  = isRW ? '#00b37a' : '#7fbaff';  // texte
    const brd  = isRW ? '#0a6642' : '#2b6cb0';  // bordure
    permChips.push(mkPill(perm, clr, brd, true));
  }
  if (Array.isArray(permFlags)) {
    if (permFlags.includes('change-acl')) {
      permChips.push(mkPill('EDIT ACCESS', '#8ff0c9', '#285', permChips.length===0));
    }
    if (permFlags.includes('delete')) {
      permChips.push(mkPill('DELETE', '#ff9a9a', '#833', permChips.length===0));
    }
  }

  // Groupe HERITAGE : INHERITED / PROPAGATES (cellule pleine)
  if (Array.isArray(permFlags)) {
    if (permFlags.includes('inherited')) {
      // orange, cellule pleine
      inhChips.push(mkPill('INHERITED', '#000', '#b3621a', inhChips.length===0, 'rgba(230,126,34,0.85)'));
    }
    if (permFlags.includes('propagates')) {
      // violet, cellule pleine
      inhChips.push(mkPill('PROPAGATES', '#000', '#7f61d4', inhChips.length===0, 'rgba(127,97,212,0.85)'));
    }
  }

  // Séparateur vertical entre les deux groupes de chips
  const sep = (permChips.length > 0 && inhChips.length > 0)
    ? `<span style="display:inline-block;width:1px;height:14px;background:var(--border2);margin:0 8px;flex-shrink:0;"></span>`
    : '';

  return `<div class="assoc-row">
    <span class="assoc-name">${escHtml(nom)}</span>
    <span style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:3px;margin-left:auto;">
      ${permChips.join('')}
      ${sep}
      ${inhChips.join('')}
    </span>
    ${onDel ? `<button class="assoc-del" onclick="${onDel}" title="Retirer">×</button>` : ''}
  </div>`;
}

function addRowHtml(selectId, options, permId, btnLabel, btnOnclick, withPerm=true) {
  const opts = options.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
  const permSel = withPerm ? `<select id="${permId}" style="max-width:110px;">
    <option value="Read Only">Read Only</option>
    <option value="Read &amp; Write">Read &amp; Write</option>
  </select>` : '';
  return `<div class="assoc-add-row">
    <select id="${selectId}"><option value="">— Sélectionner —</option>${opts}</select>
    ${permSel}
    <button class="assoc-add-btn" onclick="${btnOnclick}">${btnLabel}</button>
  </div>`;
}

// ─── TEAM ───────────────────────────────────────────────────
function detailTeam(nom) {
  const team = teamsData.teams.find(t => t.nom === nom);
  if (!team) return '<p style="color:var(--text-dim)">Introuvable.</p>';

  if (!team.collections)   team.collections   = [];
  if (!team.vues)          team.vues          = [];
  if (!team.savedSearches) team.savedSearches = [];
  if (!team.storages)      team.storages      = [];
  if (!Array.isArray(team.customActions)) team.customActions = []; 
  if (!Array.isArray(team.roleGroups_doc_ids)) team.roleGroups_doc_ids = [];

  // ── Collections ─────────────────────────────────────────────
  const sortedCols = sortAlpha(team.collections, 'nom');
  const colsRows = sortedCols.map((c,i) => {
    const label = setResolveColPath(c.chemin) || c.nom || c.chemin;
    return assocRowHtml(label, c.permission, `retirer('teamCol','${escHtml(nom)}','${escHtml(c.chemin)}')`, c.permission_flags||[]);
  }).join('') || '<div class="set-empty-list">Aucune collection</div>';

  const colOpts = sortAlpha(collectionsData.collections.map(c=>typeof c==='string'?{id:c,name:c}:c), 'name')
    .map(c=>`<option value="${escHtml(c.id||c.name)}">${escHtml(setResolveColPath(c.id||c.name))}</option>`).join('');

  const colsAdd = `<div class="assoc-add-row">
    <select id="addTeamCol"><option value="">— Sélectionner —</option>${colOpts}</select>
    <select id="addTeamColPerm" style="max-width:110px;">
      <option value="Read Only">Read Only</option>
      <option value="Read &amp; Write">Read &amp; Write</option>
    </select>
    <button class="assoc-add-btn" onclick="ajouterAssocTeam('${escHtml(nom)}','col')">+ Ajouter</button>
  </div>`;

  // ── Metadata Views ──────────────────────────────────────────
  const sortedVues = sortAlpha(team.vues, 'nom');
  const vuesRows = sortedVues.map(v =>
    assocRowHtml(v.nom, v.permission, `retirer('teamVue','${escHtml(nom)}','${escHtml(v.nom)}')`, v.permission_flags||[])
  ).join('') || '<div class="set-empty-list">Aucune MD View</div>';

  const vuesAdd = addRowHtml(
    'addTeamVue',
    sortAlpha(metadataViewsData.metadataViews.map(v=>typeof v==='string'?v:(v.name||v.id||''))),
    'addTeamVuePerm',
    '+ Ajouter',
    `ajouterAssocTeam('${escHtml(nom)}','vue')`
  );

  // ── Saved Searches ──────────────────────────────────────────
  const sortedSS = sortAlpha(team.savedSearches, 'nom');
  const ssRows = sortedSS.map(s =>
    assocRowHtml(s.nom, s.permission, `retirer('teamSS','${escHtml(nom)}','${escHtml(s.nom)}')`)
  ).join('') || '<div class="set-empty-list">Aucune Saved Search</div>';

  const ssAdd = addRowHtml(
    'addTeamSS',
    sortAlpha(savedSearchesData.savedSearches,'nom').map(s=>s.nom),
    'addTeamSSPerm',
    '+ Ajouter',
    `ajouterAssocTeam('${escHtml(nom)}','ss')`
  );

  // ── Storages (ACL) ──────────────────────────────────────────
  const sortedSt = sortAlpha(team.storages, 'nom');
  const stRows = sortedSt.map(s =>
    assocRowHtml(s.nom, s.permission, `retirer('teamSt','${escHtml(nom)}','${escHtml(s.nom)}')`)
  ).join('') || '<div class="set-empty-list">Aucun Storage</div>';

  const stAdd = addRowHtml(
    'addTeamSt',
    sortAlpha(storagesData.storages,'nom').map(s=>s.nom),
    'addTeamStPerm',
    '+ Ajouter',
    `ajouterAssocTeam('${escHtml(nom)}','st')`
  );
  
  // ── Custom Actions (ACL) ────────────────────────────────────
  
const sortedCA = sortAlpha(team.customActions, 'nom');
  const caRows = sortedCA.map(a =>
    assocRowHtml(a.nom, a.permission, `retirer('teamCA','${escHtml(nom)}','${escHtml(a.nom)}')`, a.permission_flags || [])
  ).join('') || '<div class="set-empty-list">Aucune Custom Action</div>';

  const caOpts = sortAlpha((customActionsData.customActions || []), 'title')
    .map(a => a.title || a.nom || a.name || a.id)
    .filter(Boolean);

  const caAdd = addRowHtml(
    'addTeamCA',
    caOpts,
    'addTeamCAPerm',
    '+ Ajouter',
    `ajouterAssocTeam('${escHtml(nom)}','ca')`
  );

  // ── Role Groups (doc WFD-only) ──────────────────────────────
const teamId = String(team.id || '');
const rgById = {};
(roleGroupsData.roleGroups || []).forEach(rg => { if (rg && rg.id) rgById[String(rg.id)] = rg; });

const rgDocIds = (team.roleGroups_doc_ids || []).map(String);

// ✅ Même rendu que les autres cartes : assocRowHtml() => même bouton "x"
const rgDocRows = rgDocIds.length
  ? rgDocIds.map(rgId => {
      const rg = rgById[rgId];
      const rgName = rg ? (rg.nom || rg.name || rg.id) : `(inconnu) ${rgId}`;

      // Label "easy reading" + tag WFD-only
      const label = `${rgName}  (WFD-only)`;

      // 2e colonne (permission) vide + flags vides
      return assocRowHtml(
        escHtml(label),
        '',
        `retirerTeamRoleGroupDoc('${escJs(teamId)}','${escJs(rgId)}')`,
        []
      );
    }).join('')
  : '<div class="set-empty-list">Aucun Role Group documentaire</div>';

const rgOpts = (roleGroupsData.roleGroups || [])
  .map(rg => `<option value="${escHtml(rg.id)}">${escHtml(rg.nom || rg.name || rg.id)}</option>`)
  .join('');

const rgDocAdd = `
  <div class="assoc-add-row">
    <select id="team-doc-rg-pick-${escHtml(teamId)}">
      <option value="">— Sélectionner —</option>
      ${rgOpts}
    </select>
    <button class="assoc-add-btn"
      onclick="(function(){
        const sel = document.getElementById('team-doc-rg-pick-${escHtml(teamId)}');
        const rgId = sel && sel.value;
        if (!rgId) { toast('Choisis un Role Group', true); return; }
        associerTeamRoleGroupDoc('${escJs(teamId)}', rgId);
        if (sel) sel.value='';
      })();">
      + Associer
    </button>
  </div>`;

  // ── Rendu ───────────────────────────────────────────────────
  return (
    sectionHtml('📁','Collections','var(--c-info)', colsRows + colsAdd) +
    sectionHtml('📋','Metadata Views','var(--accent)', vuesRows + vuesAdd) +
    sectionHtml('🔍','Saved Searches','var(--accent2)', ssRows + ssAdd) +
    sectionHtml('💾','Storages','var(--c-warn)', stRows + stAdd) +
	sectionHtml('🧩','Custom Actions','var(--c-purple)', caRows + caAdd) +
    sectionHtml('🧩','Role Groups (doc WFD-only)','var(--text-dim)', rgDocRows + rgDocAdd)
  );
}

function ajouterAssocTeam(teamNom, type) {
  const team = teamsData.teams.find(t => t.nom === teamNom);
  if (!team) return;

  // IDs des selects selon type
  const ids = {
    col: ['addTeamCol', 'addTeamColPerm'],
    vue: ['addTeamVue', 'addTeamVuePerm'],
    ss:  ['addTeamSS',  'addTeamSSPerm'],
    st:  ['addTeamSt',  'addTeamStPerm'],
    ca:  ['addTeamCA',  'addTeamCAPerm'], // ✅ NEW
  };

  const pair = ids[type];
  if (!pair) { toast('Type association inconnu', true); return; }
  const [selId, permId] = pair;

  const val  = document.getElementById(selId)?.value;
  const perm = document.getElementById(permId)?.value || 'Read Only';
  if (!val) { toast('Sélectionnez un élément', true); return; }

  // Helpers locaux (déjà utilisés dans ta fonction actuelle) [1](https://docs.cyberark.com/identity/latest/en/content/applications/certified-apps/iconik.htm)
  const ensureArr = (obj, key) => { if (!Array.isArray(obj[key])) obj[key] = []; return obj[key]; };
  const ensureFlags = (x) => Array.isArray(x) ? x : [];
  const upsert = (arr, matchFn, payload, mergeFn) => {
    const existing = arr.find(matchFn);
    if (existing) { mergeFn(existing); return { updated: true, existing }; }
    arr.push(payload);
    return { added: true, payload };
  };

  // ─────────────────────────────────────────────
  // COLLECTONS (Team → Collections)
  // ─────────────────────────────────────────────
  if (type === 'col') {
    const cols = ensureArr(team, 'collections');
    const selEl = document.getElementById('addTeamCol');
    const colLabelFromSelect = selEl ? selEl.options[selEl.selectedIndex]?.text : '';
    const colObj = (collectionsData.collections || []).find(c => (c && (c.id || c)) === val);
    const colNom = colLabelFromSelect || (colObj && (colObj.name || colObj.nom)) || val;
    const colPath = (typeof setResolveColPath === 'function') ? setResolveColPath(val) : null;

    const payload = { id: val, nom: colNom, permission: perm, permission_flags: [], chemin: val, _path: colPath };

    const res = upsert(
      cols,
      c => (c && (c.id === val || c.chemin === val)),
      payload,
      (c) => {
        c.id = c.id || val;
        c.chemin = c.chemin || val;
        c.nom = c.nom || colNom;
        c._path = c._path || colPath;
        c.permission = perm;
        c.permission_flags = ensureFlags(c.permission_flags);
      }
    );
    if (!res.added && !res.updated) { toast('Déjà ajoutée', true); return; }
  }

  // ─────────────────────────────────────────────
  // METADATA VIEWS (Team → Vues)
  // ─────────────────────────────────────────────
  else if (type === 'vue') {
    const vues = ensureArr(team, 'vues');
    const vObj = (metadataViewsData.metadataViews || []).find(v =>
      (typeof v === 'string' && v === val) ||
      (v && (v.name === val || v.id === val || v.nom === val))
    );

    const viewId = (vObj && typeof vObj === 'object') ? (vObj.id || val) : val;
    const viewNom = (vObj && typeof vObj === 'object') ? (vObj.name || vObj.nom || val) : val;

    const payload = { id: viewId, nom: viewNom, permission: perm, permission_flags: [] };

    const res = upsert(
      vues,
      v => (v && (v.id === viewId || v.nom === viewNom)),
      payload,
      (v) => {
        v.id = v.id || viewId;
        v.nom = v.nom || viewNom;
        v.permission = perm;
        v.permission_flags = ensureFlags(v.permission_flags);
      }
    );
    if (!res.added && !res.updated) { toast('Déjà ajoutée', true); return; }
  }

  // ─────────────────────────────────────────────
  // SAVED SEARCHES (Team ↔ SavedSearch)
  // ─────────────────────────────────────────────
  else if (type === 'ss') {
    const ssArr = ensureArr(team, 'savedSearches');
    const ssObj = (savedSearchesData.savedSearches || []).find(s =>
      s && (s.id === val || s.nom === val || s.name === val)
    );

    const ssId = ssObj?.id || val;
    const ssNom = ssObj?.nom || ssObj?.name || val;

    const payloadTeam = { id: ssId, nom: ssNom, permission: perm, permission_flags: [] };

    const res = upsert(
      ssArr,
      x => x && (x.id === ssId || x.nom === ssNom),
      payloadTeam,
      (x) => {
        x.id = x.id || ssId;
        x.nom = x.nom || ssNom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );
    if (!res.added && !res.updated) { toast('Déjà ajoutée', true); return; }

    if (ssObj) {
      const teamsInv = ensureArr(ssObj, 'teams');
      const payloadInv = {
        id: team.id || teamNom,
        nom: team.nom || team.name || teamNom,
        permission: perm,
        permission_flags: []
      };
      upsert(
        teamsInv,
        t => t && (t.id === payloadInv.id || t.nom === payloadInv.nom),
        payloadInv,
        (t) => {
          t.id = t.id || payloadInv.id;
          t.nom = t.nom || payloadInv.nom;
          t.permission = perm;
          t.permission_flags = ensureFlags(t.permission_flags);
        }
      );
    }
  }

  // ─────────────────────────────────────────────
  // STORAGES (Team ↔ Storage)
  // ─────────────────────────────────────────────
  else if (type === 'st') {
    const stArr = ensureArr(team, 'storages');
    const stObj = (storagesData.storages || []).find(s =>
      s && (s.id === val || s.nom === val || s.name === val)
    );

    const stId = stObj?.id || val;
    const stNom = stObj?.nom || stObj?.name || val;

    const payloadTeam = { id: stId, nom: stNom, permission: perm, permission_flags: [] };

    const res = upsert(
      stArr,
      x => x && (x.id === stId || x.nom === stNom),
      payloadTeam,
      (x) => {
        x.id = x.id || stId;
        x.nom = x.nom || stNom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );
    if (!res.added && !res.updated) { toast('Déjà ajouté', true); return; }

    if (stObj) {
      const teamsInv = ensureArr(stObj, 'teams');
      const payloadInv = {
        id: team.id || teamNom,
        nom: team.nom || team.name || teamNom,
        permission: perm,
        permission_flags: []
      };
      upsert(
        teamsInv,
        t => t && (t.id === payloadInv.id || t.nom === payloadInv.nom),
        payloadInv,
        (t) => {
          t.id = t.id || payloadInv.id;
          t.nom = t.nom || payloadInv.nom;
          t.permission = perm;
          t.permission_flags = ensureFlags(t.permission_flags);
        }
      );
    }
  }

  // ─────────────────────────────────────────────
  // CUSTOM ACTIONS (Team ↔ Custom Action) ✅ NEW
  // ─────────────────────────────────────────────
  else if (type === 'ca') {
    const caArr = ensureArr(team, 'customActions');

    const caObj = (customActionsData.customActions || []).find(a =>
      a && ((a.title || a.nom || a.name || a.id) === val)
    );

    const caId  = caObj?.id || val;
    const caNom = caObj?.title || caObj?.nom || caObj?.name || val;

    const payloadTeam = { id: caId, nom: caNom, permission: perm, permission_flags: [] };

    const res = upsert(
      caArr,
      x => x && (x.id === caId || x.nom === caNom),
      payloadTeam,
      (x) => {
        x.id = x.id || caId;
        x.nom = x.nom || caNom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );
    if (!res.added && !res.updated) { toast('Déjà ajoutée', true); return; }

    if (caObj) {
      const teamsInv = ensureArr(caObj, 'teams');
      const payloadInv = {
        id: team.id || teamNom,
        nom: team.nom || team.name || teamNom,
        permission: perm,
        permission_flags: []
      };
      upsert(
        teamsInv,
        t => t && (t.id === payloadInv.id || t.nom === payloadInv.nom),
        payloadInv,
        (t) => {
          t.id = t.id || payloadInv.id;
          t.nom = t.nom || payloadInv.nom;
          t.permission = perm;
          t.permission_flags = ensureFlags(t.permission_flags);
        }
      );
    }
  }

  sauvegarderDonnees();
  updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  renderDetail(teamNom);
  toast('Ajouté ✓');
}

function refreshRGItemsBody(rgNom) {
  const rgItemsBody = document.getElementById('rg-items-body');
  if (!rgItemsBody) return;

  // Sauvegarder le scroll de la section .detail-section-body qui contient rg-items-body
  const sectionBody = rgItemsBody.closest('.detail-section-body');
  const savedScroll = sectionBody ? sectionBody.scrollTop : 0;

  // Filtre rôle actif
  const filterEl = document.getElementById('rgItemsRoleFilter');
  const selectedRole = filterEl ? filterEl.value : '';

  const rg = roleGroupsData.roleGroups.find(r => r.nom === rgNom);
  if (!rg) return;
  const rolesToShow = selectedRole ? [selectedRole] : rg.fonctionnalites;

  let html = '';
  rolesToShow.forEach(role => {
    const its = itemsAdvancedData.items.filter(i => (i.assignations||[]).some(a => a.role === role));
    if (its.length > 0) {
      html += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:var(--c-purple);font-weight:700;display:block;margin-bottom:4px;">🎭 ${escHtml(role)}</span>`;
      sortAlpha(its, 'nom').forEach(item => {
        const a = item.assignations.find(a => a.role === role);
        const permsHtml = (a?.permissions||[]).map(p => `<span class="item-assig-perm">${escHtml(p)}</span>`).join('');
        html += `<div class="assoc-row" style="flex-direction:column;align-items:flex-start;gap:4px;margin-left:10px;">
          <div style="display:flex;align-items:center;width:100%;gap:6px;">
            <span class="assoc-name">${escHtml(item.nom)}</span>
            <button class="assoc-del" onclick="retirer('itemAssig','${escJs(item.nom)}','${escJs(role)}')" title="Retirer">×</button>
            <button class="assoc-add-btn" style="font-size:9px;padding:3px 7px;" onclick="ouvrirModalPermsItem('${escJs(item.nom)}','${escJs(role)}')">✏️ Perms</button>
          </div>
          <div class="item-assig-perms">${permsHtml}</div>
        </div>`;
      });
      html += '</div>';
    }
  });
  if (!html) html = '<div class="set-empty-list">Aucun item pour ce filtre</div>';

  // Mise à jour DOM sans reconstruire le panneau entier
  rgItemsBody.innerHTML = html;
window._autoLayoutCards?.schedule();
  // Restaurer le scroll — requestAnimationFrame garantit que le DOM est repeint
  requestAnimationFrame(() => {
    if (sectionBody) sectionBody.scrollTop = savedScroll;
  });
}


function retirer(type, parent, child) {
  if (type === 'teamCol') {
    const t = teamsData.teams.find(t=>t.nom===parent);
    if (t) t.collections = t.collections.filter(c=>c.chemin!==child);

  } else if (type === 'userTeam') {
    const u = usersData.users.find(u => u.nom === parent);
    if (u && u.teams) {
      const removedPrimary = u.teams.find(t => t.nom === child)?.is_primary === true;
      u.teams = u.teams.filter(t => t.nom !== child);
      if (removedPrimary && u.teams.length > 0) {
        u.teams.forEach((t, i) => t.is_primary = (i === 0));
      }
    }

  } else if (type === 'userRG') {
    const u = usersData.users.find(u => u.nom === parent);
    if (u && u.role_groups) {
      u.role_groups = u.role_groups.filter(rg => rg.nom !== child);
    }

  } else if (type === 'teamVue') {
    const t = teamsData.teams.find(t=>t.nom===parent);
    if (t) t.vues = t.vues.filter(v=>v.nom!==child);

  } else if (type === 'teamSS') {
    const t = teamsData.teams.find(t=>t.nom===parent);
    if (t) t.savedSearches = (t.savedSearches||[]).filter(s=>s.nom!==child);
    const ss = savedSearchesData.savedSearches.find(s=>s.nom===child);
    if (ss && ss.teams) ss.teams = ss.teams.filter(t=>t.nom!==parent);

  } else if (type === 'teamSt') {
    const t = teamsData.teams.find(t=>t.nom===parent);
    if (t) t.storages = (t.storages||[]).filter(s=>s.nom!==child);
    const st = storagesData.storages.find(s=>s.nom===child);
    if (st && st.teams) st.teams = st.teams.filter(t=>t.nom!==parent);

  } else if (type === 'teamCA') {
    // ✅ NEW: Team ↔ Custom Action
    const t = teamsData.teams.find(t=>t.nom===parent);
    if (t) t.customActions = (t.customActions||[]).filter(a=>a.nom!==child);

    const ca = (customActionsData.customActions || []).find(a =>
      (a.title || a.nom || a.name) === child
    );
    if (ca && Array.isArray(ca.teams)) {
      ca.teams = ca.teams.filter(x => x.nom !== parent);
    }

  } else if (type === 'rgRole') {
    const rg = roleGroupsData.roleGroups.find(r=>r.nom===parent);
    if (rg) rg.fonctionnalites = rg.fonctionnalites.filter(r=>r!==child);

  } else if (type === 'metaMDV') {
    const m = metadonneesData.metadonnees.find(m=>m.nom===parent);
    if (m) {
      if (!m.metadataViews) m.metadataViews = m.metadataView ? [m.metadataView] : [];
      m.metadataViews = m.metadataViews.filter(v=>v!==child);
      m.metadataView = m.metadataViews[0] || null;
    }

  } else if (type === 'mdvMeta') {
    const m = metadonneesData.metadonnees.find(m=>m.nom===child);
    if (m) {
      if (!m.metadataViews) m.metadataViews = m.metadataView ? [m.metadataView] : [];
      m.metadataViews = m.metadataViews.filter(v=>v!==parent);
      m.metadataView = m.metadataViews[0] || null;
    }

  } else if (type === 'ssTe') {
    const ss = savedSearchesData.savedSearches.find(s=>s.nom===parent);
    if (ss && ss.teams) ss.teams = ss.teams.filter(t=>t.nom!==child);
    const t = teamsData.teams.find(t=>t.nom===child);
    if (t && t.savedSearches) t.savedSearches = t.savedSearches.filter(s=>s.nom!==parent);

  } else if (type === 'roleRG') {
    const rg = roleGroupsData.roleGroups.find(r => r.nom === child);
    if (rg) rg.fonctionnalites = (rg.fonctionnalites||[]).filter(f => f !== parent);

  } else if (type === 'stTe') {
    const st = storagesData.storages.find(s=>s.nom===parent);
    if (st && st.teams) st.teams = st.teams.filter(t=>t.nom!==child);
    const t = teamsData.teams.find(t=>t.nom===child);
    if (t && t.storages) t.storages = t.storages.filter(s=>s.nom!==parent);

  } else if (type === 'itemAssig') {
    const item = itemsAdvancedData.items.find(i=>i.nom===parent);
    if (item && item.assignations) item.assignations = item.assignations.filter(a=>a.role!==child);

    if (currentEntity === 'roleGroups' && document.getElementById('rg-items-body')) {
      sauvegarderDonnees(); updateCounters();
      renderListe(document.getElementById('set-list-search').value);
      refreshRGItemsBody(currentItem);
      toast('Retiré');
      return;
    }

  } else if (type === 'wfCol') {
    const wf = workflowsData.workflows.find(w=>w.nom===parent);
    if (wf) wf.collections = (wf.collections||[]).filter(c=>c!==child);

  } else if (type === 'wfMeta') {
    const wf = workflowsData.workflows.find(w=>w.nom===parent);
    if (wf) wf.metadonnees = (wf.metadonnees||[]).filter(m=>m!==child);

  } else if (type === 'catMdv') {
    const cat = categoriesData.categories.find(c=>c.nom===parent);
    if (cat) cat.metadataViews = (cat.metadataViews||[]).filter(v=>v!==child);
  }

  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  if (currentItem) renderDetail(currentItem, true);
  toast('Retiré');
}

// ─── ROLE GROUP ──────────────────────────────────────────────
function detailRoleGroup(nom) {
  const rg = roleGroupsData.roleGroups.find(r => r.nom === nom);
  if (!rg) return '<p style="color:var(--text-dim)">Introuvable.</p>';
  if (!rg.fonctionnalites) rg.fonctionnalites = [];
  if (!Array.isArray(rg.teams_doc_ids)) rg.teams_doc_ids = [];

  const rows = sortAlpha(rg.fonctionnalites).map(r =>
    assocRowHtml(r, null, `retirer('rgRole','${escHtml(nom)}','${escHtml(r)}')`)
  ).join('') || '<div class="set-empty-list">Aucun rôle</div>';

  const avail = sortAlpha(rolesData.roles).filter(r => !rg.fonctionnalites.includes(r));
  const addRow = addRowHtml('addRgRole', avail, null, '+ Ajouter',
    `ajouterRoleARG('${escHtml(nom)}')`, false);

  // Items liés aux rôles — éditables avec boutons perms
  let itemsHtml = '';
  if (rg.fonctionnalites.length > 0) {
    const rgRolesSlugs = rg.roles || []; // slugs bruts depuis Iconik

    rg.fonctionnalites.forEach(role => {
      // Filtrer les items pour ne garder que ceux dont au moins UN slug est dans rg.roles
      const its = itemsAdvancedData.items.filter(i => {
        const a = (i.assignations||[]).find(x => x.role === role);
        if (!a) return false;
        return (a.slugs||[]).some(slug => rgRolesSlugs.includes(slug));
      });

      if (its.length > 0) {
        itemsHtml += `<div style="margin-bottom:8px;">` +
          `<span style="font-size:10px;color:var(--c-purple);font-weight:700;display:block;margin-bottom:4px;">🎭 ${escHtml(role)}</span>`;
        sortAlpha(its,'nom').forEach(item => {
          const a = item.assignations.find(a => a.role === role);
          // Filtrer les permissions pour n'afficher que celles dans rg.roles
          const permsToShow = (a?.permissions||[]).filter((p, idx) => {
            const slug = a.slugs?.[idx];
            return slug && rgRolesSlugs.includes(slug);
          });
          itemsHtml += `<div class="assoc-row" style="flex-direction:column;align-items:flex-start;gap:4px;margin-left:10px;">` +
            `<div style="display:flex;align-items:center;width:100%;gap:6px;">` +
              `<span class="assoc-name">${escHtml(item.nom)}</span>` +
              `<button class="assoc-del" onclick="retirer('itemAssig','${escJs(item.nom)}','${escJs(role)}')" title="Retirer">×</button>` +
              `<button class="assoc-add-btn" style="font-size:9px;padding:3px 7px;" onclick="ouvrirModalPermsItem('${escJs(item.nom)}','${escJs(role)}')">✏️ Perms</button>` +
            `</div>` +
            `<div class="item-assig-perms">${permsToShow.map(p => `<span class="item-assig-perm">${escHtml(p)}</span>`).join('')}</div>` +
          `</div>`;
        });
        itemsHtml += `</div>`;
      }
    });
  }
  if (!itemsHtml) itemsHtml = '<div class="set-empty-list">Aucun item associé aux rôles de ce groupe</div>';

  // Sélecteurs pour ajouter un item à un rôle du groupe
  const rolesInRG = rg.fonctionnalites;
  let addItemHtml = '';
  if (rolesInRG.length > 0) {
    const roleOpts = rolesInRG.map(r=>`<option value="${escHtml(r)}">${escHtml(r)}</option>`).join('');
    const itemOpts = sortAlpha(itemsAdvancedData.items,'nom').map(i=>`<option value="${escHtml(i.nom)}">${escHtml(i.nom)}</option>`).join('');
    addItemHtml = `<div class="assoc-add-row" style="flex-wrap:wrap;gap:5px;margin-top:4px;">
      <select id="addRGItemRole" style="flex:1;min-width:110px;"><option value="">— Rôle —</option>${roleOpts}</select>
      <select id="addRGItem" style="flex:2;min-width:140px;"><option value="">— Item —</option>${itemOpts}</select>
      <button class="assoc-add-btn" onclick="ouvrirModalPermsRGItem('${escJs(nom)}')">+ Ajouter</button>
    </div>`;
  }

  // Sélecteur de filtre par rôle pour la section items
  const filterRoleOpts = ['<option value="">— Tous les rôles —</option>']
    .concat(rolesInRG.map(r=>`<option value="${escJs(r)}">${escHtml(r)}</option>`)).join('');
  const filterHtml = `<div style="margin-bottom:8px;">
    <select id="rgItemsRoleFilter" style="width:100%;padding:5px 8px;background:var(--bg4);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:11px;outline:none;"
      onchange="filterRGItems('${escJs(nom)}')">
      ${filterRoleOpts}
    </select>
  </div>`;

  // ── Teams (doc WFD-only) ─────────────────────────────────────────────
  const rgid = String(rg.id || '');

  // Résolution id->team pour affichage easy reading
  const teamById = {};
  (teamsData.teams || []).forEach(t => { if (t && t.id) teamById[String(t.id)] = t; });

  const teamDocIds = (rg.teams_doc_ids || []).map(String);

  // ✅ Utilise assocRowHtml => même "x" charte
  const teamsDocRows = teamDocIds.length
    ? teamDocIds.map(teamId => {
        const t = teamById[teamId];
        const tName = t ? (t.nom || t.name || t.id) : `(inconnu) ${teamId}`;
        const label = `${tName}  (WFD-only)`;
        return assocRowHtml(
          escHtml(label),
          '',
          `retirerTeamRoleGroupDoc('${escJs(teamId)}','${escJs(rgid)}')`,
          []
        );
      }).join('')
    : '<div class="set-empty-list">Aucune Team documentaire</div>';

  const teamOpts = sortAlpha((teamsData.teams || []), 'nom')
    .map(t => `<option value="${escHtml(t.id)}">${escHtml(t.nom || t.name || t.id)}</option>`)
    .join('');

  const teamsDocAdd = `
    <div class="assoc-add-row">
      <select id="rg-doc-team-pick-${escHtml(rgid)}">
        <option value="">— Sélectionner —</option>
        ${teamOpts}
      </select>
      <button class="assoc-add-btn"
        onclick="(function(){
          const sel = document.getElementById('rg-doc-team-pick-${escHtml(rgid)}');
          const teamId = sel && sel.value;
          if (!teamId) { toast('Choisis une Team', true); return; }
          associerTeamRoleGroupDoc(teamId, '${escJs(rgid)}');
          if (sel) sel.value='';
        })();">
        + Associer
      </button>
    </div>`;

  return (
    sectionHtml('🔑','Rôles','var(--accent)', rows + addRow) +
    sectionHtml('🔧','Items associés','var(--c-purple)', filterHtml + '<div id="rg-items-body">' + itemsHtml + '</div>' + addItemHtml) +
    sectionHtml('🧩','Teams (doc WFD-only)','var(--text-dim)', teamsDocRows + teamsDocAdd)
  );
}

// Re-render la liste des items selon le rôle filtré
function filterRGItems(rgNom) {
  const rg = roleGroupsData.roleGroups.find(r => r.nom === rgNom);
  if (!rg) return;
  const selectedRole = document.getElementById('rgItemsRoleFilter')?.value || '';
  const rolesToShow = selectedRole ? [selectedRole] : rg.fonctionnalites;

  let html = '';
  rolesToShow.forEach(role => {
    const its = itemsAdvancedData.items.filter(i => (i.assignations||[]).some(a=>a.role===role));
    if (its.length > 0) {
      html += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:var(--c-purple);font-weight:700;display:block;margin-bottom:4px;">🎭 ${escHtml(role)}</span>`;
      sortAlpha(its,'nom').forEach(item => {
        const a = item.assignations.find(a=>a.role===role);
        html += `<div class="assoc-row" style="flex-direction:column;align-items:flex-start;gap:4px;margin-left:10px;">
          <div style="display:flex;align-items:center;width:100%;gap:6px;">
            <span class="assoc-name">${escHtml(item.nom)}</span>
            <button class="assoc-del" onclick="retirer('itemAssig','${escJs(item.nom)}','${escJs(role)}')" title="Retirer">×</button>
            <button class="assoc-add-btn" style="font-size:9px;padding:3px 7px;" onclick="ouvrirModalPermsItem('${escJs(item.nom)}','${escJs(role)}')">✏️ Perms</button>
          </div>
          <div class="item-assig-perms">${(a?.permissions||[]).map(p=>`<span class="item-assig-perm">${escHtml(p)}</span>`).join('')}</div>
        </div>`;
      });
      html += `</div>`;
    }
  });
  if (!html) html = '<div class="set-empty-list">Aucun item pour ce rôle</div>';
  const body = document.getElementById('rg-items-body');
  if (body) body.innerHTML = html;
window._autoLayoutCards?.schedule();
}

function ajouterRoleARG(rgNom) {
  const rg = roleGroupsData.roleGroups.find(r => r.nom === rgNom);
  if (!rg) return;
  const val = document.getElementById('addRgRole')?.value;
  if (!val) { toast('Sélectionnez un rôle', true); return; }
  if (rg.fonctionnalites.includes(val)) { toast('Déjà ajouté', true); return; }
  rg.fonctionnalites.push(val);
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value); renderDetail(rgNom);
  toast('Rôle ajouté ✓');
}

// ─── COLLECTION ──────────────────────────────────────────────
function detailCollection(nom) {
  // 1) Résoudre la collection sélectionnée (id OU nom)
  const cols = collectionsData.collections || [];
  let selected = null;
  // Chercher d'abord par id exact
  for (const c of cols) {
    if (typeof c !== 'string' && c.id === nom) { selected = c; break; }
  }
  if (!selected) {
    for (const c of cols) {
      if (typeof c === 'string') { if (c === nom) { selected = { id: c, name: c, nom: c }; break; } }
      else { if (c.name === nom || c.nom === nom) { selected = c; break; } }
    }
  }
  const colId   = (selected && selected.id) || nom;
  const colName = (selected && (selected.name || selected.nom)) || nom;

  // ─────────────────────────────────────────────────────────────
  // A. Teams utilisant cette collection (nom de la TEAM)
  const teams = (teamsData.teams || []).filter(t =>
    (t.collections || []).some(c =>
      c.chemin === colId || c.chemin === colName || c.nom === colName
    )
  );

  const rowsTeams = teams.length ? sortAlpha(teams, 'nom').map(t => {
    const col = (t.collections || []).find(c => c.chemin === colId)
      || (t.collections || []).find(c => c.chemin === colName);
    return assocRowHtml(t.nom, col?.permission, null, col?.permission_flags || []);
  }).join('') : "<div class=\"set-empty-list\">Aucune team n'utilise cette collection</div>";

  // Ligne d'ajout (Team -> Collection)
  const teamsAvail = (teamsData.teams || []).filter(t =>
    !((t.collections || []).some(c =>
      c.chemin === colId || c.chemin === colName || c.nom === colName))
  );
  const teamsAdd = addRowHtml(
    'addColTeam',
    sortAlpha(teamsAvail, 'nom').map(t => t.nom),
    'addColTeamPerm',
    '+ Ajouter',
    `ajouterTeamACollection('${escJs(colId)}','${escJs(colName)}')`
  );

  // ─────────────────────────────────────────────────────────────
  // B. Vues pertinentes pour l'objet "Collections"
  const catsRaw = categoriesData.categories || [];
  // Dédupliquer par nom (même catégorie peut exister pour plusieurs object_types)
  const _catsColRaw = catsRaw.filter(cat => {
    const applies = Array.isArray(cat.appliqueeA) ? cat.appliqueeA : null;
    return !applies ? true : applies.includes('collections');
  });
  const _colSeenNom = new Set();
  const catsCollections = _catsColRaw.filter(cat => {
    const k = (cat.nom || cat.name || '').toLowerCase().trim();
    if (_colSeenNom.has(k)) return false;
    _colSeenNom.add(k);
    return true;
  });

  let sectionViews = '';
  if (UI_COLLECTIONS_SHOW_MDV_CARD) {
    const vuesSet = new Set();
    catsCollections.forEach(cat => {
      // Utiliser uniquement viewIdsByType.collections — pas de fallback
      const vuesCol = (cat.viewIdsByType && cat.viewIdsByType.collections) || [];
      vuesCol.forEach(v => vuesSet.add(v));
    });
    const mdvRows = vuesSet.size ? [...vuesSet]
      .sort((a,b)=> String(a).localeCompare(String(b),'fr',{sensitivity:'base'}))
      .map(v => assocRowHtml(v, null, null)).join('')
      : '<div class="set-empty-list">Aucune Metadata View (objet : Collections)</div>';
    sectionViews = sectionHtml('📋', 'Metadata Views (objet : Collections)', 'var(--accent)', mdvRows);
  }

  // ─────────────────────────────────────────────────────────────
  // C. Catégories (objet : Collections) + Vues — avec badge SAVED + ajouts
  // Valeur par défaut (affichera le badge "SAVED" si correspond au nom de la catégorie)
  const savedVal = String((selected && (selected.defaultCategoryName || selected.defaultCategoryId)) || '').toLowerCase();

  // Helper pour fabriquer un id DOM safe
  const safeId = s => String(s).replace(/[^a-z0-9_]/gi, '_');

  const catRows = catsCollections.length ? catsCollections.map(cat => {
    const _vuesCol = (cat.viewIdsByType && cat.viewIdsByType.collections) || [];
    const vues = _vuesCol.slice().sort((a,b)=>
      String(a).localeCompare(String(b),'fr',{sensitivity:'base'})
    );
    const chips = vues.length
      ? vues.map(v => `<span class="item-assig-perm">${escHtml(v)}</span>`).join('')
      : '<span style="font-size:10px;color:var(--text-dim)">Aucune vue</span>';

    // Badge "SAVED" si la catégorie par défaut correspond (par nom OU par id)
    const catLabel = (cat.nom || cat.name || 'Catégorie');
    const isSaved  = savedVal && (
      String(catLabel).toLowerCase() === savedVal ||
      (cat.id && String(cat.id).toLowerCase() === savedVal)
    );
    const savedBadge = isSaved ? '<span class="pill-saved">SAVED</span>' : '';

    // Ajout d'une MD View POUR cette catégorie
    const allViews = sortAlpha(metadataViewsData.metadataViews.map(v=> typeof v==='string' ? v : (v.name||v.id||'')));
    const availForCat = allViews.filter(v => !(cat.metadataViews||[]).includes(v));
    const addSelId = 'addCatView_' + safeId(catLabel);
    const addViewRow = availForCat.length
      ? `<div class="assoc-add-row" style="margin-top:4px;">
           <select id="${addSelId}"><option value="">— MD View —</option>${availForCat.map(v=>`<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('')}</select>
           <button class="assoc-add-btn" onclick="ajouterMDVACat('${escJs(catLabel)}','${escJs(addSelId)}')">+ Ajouter MD View</button>
         </div>`
      : '';

    return `
      <div class="assoc-row" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <div style="display:flex;align-items:center;"><span class="assoc-name">${escHtml(catLabel)}</span>${savedBadge}</div>
        <div class="item-assig-perms">${chips}</div>
        ${addViewRow}
      </div>`;
  }).join('') : '<div class="set-empty-list">Aucune catégorie (objet : Collections)</div>';

  // Ligne d'ajout d'une CATEGORIE (objet : collections)
  const addCatRow = `
    <div class="assoc-add-row" style="margin-top:6px;">
      <input id="addCatName" type="text" placeholder="Nom de la catégorie (objet : collections)" />
      <button class="assoc-add-btn" onclick="creerCategorieCollections()">+ Créer catégorie</button>
    </div>`;

  // Construction finale des cartes
  return sectionHtml('👥','Teams utilisant cette collection','var(--c-info)', rowsTeams + teamsAdd)
       + (UI_COLLECTIONS_SHOW_MDV_CARD ? sectionViews : '')
       + sectionHtml(UI_CATS_ICON, 'Catégories (objet : Collections)', UI_CATS_TITLE_COLOR, catRows + addCatRow);
}

function detailMDView(nom) {
  // --- MÉTADONNÉES associées à la vue ---
  const metas = (metadonneesData.metadonnees || []).filter(m =>
    (m.metadataViews || (m.metadataView ? [m.metadataView] : [])).includes(nom)
  );
  const metaRows = metas.length
    ? sortAlpha(metas,'nom').map(m =>
        assocRowHtml(m.nom, null, `retirer('mdvMeta','${escJs(nom)}','${escJs(m.nom)}')`)
      ).join('')
    : "<div class=\"set-empty-list\">Aucune métadonnée</div>";

  // Ajout d'une métadonnée à cette vue (piloté par l'objet Métadonnée, on reste cohérent avec l’existant)
  const metasAvail = (metadonneesData.metadonnees || []).filter(m =>
    !((m.metadataViews || (m.metadataView ? [m.metadataView] : []))).includes(nom)
  );
  const metaAdd = addRowHtml(
    'addMdvMeta',
    sortAlpha(metasAvail,'nom').map(m=>m.nom),
    null,
    '+ Ajouter',
    `ajouterMetaAMDV('${escJs(nom)}')`,
    false
  );

  // --- CATÉGORIE(S) de cette vue ---
  const cats = (categoriesData.categories || []);
  // Dédupliquer par nom (une catégorie "Default" peut apparaître plusieurs fois
  // si elle couvre plusieurs object_types avec des api_names légèrement différents)
  const _catsWithRaw = cats.filter(c => (c.metadataViews || []).includes(nom));
  const _catsSeenNom = new Set();
  const catsWith = _catsWithRaw.filter(c => {
    const k = (c.nom || c.name || '').toLowerCase().trim();
    if (_catsSeenNom.has(k)) return false;
    _catsSeenNom.add(k);
    return true;
  });
  const catRows = catsWith.length
    ? sortAlpha(catsWith,'nom').map(c =>
        // Retrait = on enlève la vue de la catégorie
        assocRowHtml(c.nom, null, `retirer('catMdv','${escJs(c.nom)}','${escJs(nom)}')`)
      ).join('')
    : "<div class=\"set-empty-list\">Aucune catégorie</div>";

  // Ajout de la vue à une catégorie
  const catsAvail = cats.filter(c => !((c.metadataViews || []).includes(nom)));
  const catAdd = addRowHtml(
    'addMdvToCat',
    sortAlpha(catsAvail,'nom').map(c=>c.nom),
    null,
    '+ Ajouter',
    `ajouterMDVADansCategorie('${escJs(nom)}')`,
    false
  );

  // --- TEAMS ayant accès à cette vue ---
  const teams = (teamsData.teams || []).filter(t => (t.vues || []).some(v => v.nom === nom));
  const teamRows = teams.length
    ? sortAlpha(teams,'nom').map(t => {
        const v = (t.vues || []).find(v => v.nom === nom);
        return assocRowHtml(t.nom, v?.permission, `retirer('teamVue','${escJs(t.nom)}','${escJs(nom)}')`);
      }).join('')
    : "<div class=\"set-empty-list\">Aucune team</div>";

  // Ajout d’une Team → MD View
  const teamsAvail = (teamsData.teams || []).filter(t => !((t.vues || []).some(v => v.nom === nom)));
  const teamsAdd = addRowHtml(
    'addMdvTeam',
    sortAlpha(teamsAvail,'nom').map(t=>t.nom),
    'addMdvTeamPerm',
    '+ Ajouter',
    `ajouterTeamAMDV('${escJs(nom)}')`
  );

  // --- Objets cibles — depuis viewIdsByType des catégories ---
  const OBJ_LABELS = { assets: 'Assets', collections: 'Collections', segments: 'Segments', custom_actions: 'Custom Actions' };
  const OBJ_ICONS2 = { assets: '🎬', collections: '📁', segments: '✂️', custom_actions: '⚡' };
  const objTypesForView = new Set();
  (categoriesData.categories || []).forEach(c => {
    Object.entries(c.viewIdsByType || {}).forEach(([objType, viewNames]) => {
      if ((viewNames || []).includes(nom)) objTypesForView.add(objType);
    });
  });
  const objHtml = objTypesForView.size
    ? [...objTypesForView].map(o =>
        `<span class="perm-tag">${OBJ_ICONS2[o] || ''} ${OBJ_LABELS[o] || o}</span>`
      ).join('')
    : '<div class="set-empty-list">Non défini</div>';

  // --- Construction (éviter les "line breaks" ambigus sur ? : +) ---
  return sectionHtml('🎯','Objets cibles','var(--text-mid)', `<div class="perm-checkbox-grid">${objHtml}</div>`)
       + sectionHtml('🏷️','Métadonnées','var(--accent)', metaRows + metaAdd)
       + sectionHtml('🗂️','Catégorie','var(--accent2)', catRows + catAdd)
       + sectionHtml('👥','Teams ayant accès','var(--c-info)', teamRows + teamsAdd);
}

function ajouterMetaAMDV(mdvNom) {
  const val = document.getElementById('addMdvMeta')?.value;
  if (!val) { toast('Sélectionnez une métadonnée', true); return; }
  const m = metadonneesData.metadonnees.find(m=>m.nom===val);
  if (!m) return;
  if (!m.metadataViews) m.metadataViews = m.metadataView ? [m.metadataView] : [];
  if (!m.metadataViews.includes(mdvNom)) m.metadataViews.push(mdvNom);
  m.metadataView = m.metadataViews[0];
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value); renderDetail(mdvNom);
  toast('Métadonnée ajoutée ✓');
}

// ─── MÉTADONNÉE ───────────────────────────────────────────────
const META_TYPES = ['Date','Datetime','Dropdown','Email','Float','Integer','Tag Cloud','Text Area','Text','Url','Yes/No'];
const META_TYPES_WITH_VALUES = ['Dropdown','Tag Cloud'];
const META_TYPES_WITH_MULTISELECT = ['Dropdown'];

// Ajouter une Team à une MD View (depuis la vue "MD Views")
function ajouterTeamAMDV(mdvNom) {
  const teamNom = document.getElementById('addMdvTeam')?.value;
  const perm    = document.getElementById('addMdvTeamPerm')?.value || 'Read Only';
  if (!teamNom) { toast('Sélectionnez une team', true); return; }

  const t = (teamsData.teams || []).find(x => x.nom === teamNom);
  if (!t) { toast('Team introuvable', true); return; }
  if (!t.vues) t.vues = [];
  if (t.vues.some(v => v.nom === mdvNom)) { toast('Déjà ajoutée', true); return; }

  t.vues.push({ nom: mdvNom, permission: perm });
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search')?.value || '');
  if (currentItem) renderDetail(currentItem);
  toast('Team ajoutée ✓');
}

// Ajouter la MD View courante à une Catégorie
function ajouterMDVADansCategorie(mdvNom) {
  const catNom = document.getElementById('addMdvToCat')?.value;
  if (!catNom) { toast('Sélectionnez une catégorie', true); return; }
  const cat = (categoriesData.categories || []).find(c => (c.nom || c.name) === catNom);
  if (!cat) { toast('Catégorie introuvable', true); return; }
  if (!cat.metadataViews) cat.metadataViews = [];
  if (cat.metadataViews.includes(mdvNom)) { toast('Déjà ajoutée', true); return; }

  cat.metadataViews.push(mdvNom);
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search')?.value || '');
  if (currentItem) renderDetail(currentItem);
  toast('MD View ajoutée à la catégorie ✓');
}
function metaTypeFieldsHtml(meta) {
  const nom = meta.nom;
  const type = meta.type || '';
  const multiselect = meta.multiselect || false;
  const valeurs = (meta.valeurs || []).join('\n');
  const desc = meta.description || '';

  const typeOpts = ['<option value="">— Aucun —</option>']
    .concat(META_TYPES.map(t => `<option value="${t}" ${type===t?'selected':''}>${t}</option>`))
    .join('');

  let extra = '';

  // Yes/No default toggle (inchangé)
  if (type === 'Yes/No') {
    const curVal = meta.defaultValue || '';
    extra += `<div class="detail-field" style="margin-top:10px;">
      <label>Valeur par défaut</label>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
        <button type="button" id="meta-yesno-btn"
          style="padding:5px 16px;border-radius:3px;font-size:11px;cursor:pointer;
            background:${curVal==='true'?'rgba(0,212,170,0.15)':'var(--bg4)'};
            border:1px solid ${curVal==='true'?'var(--accent)':'var(--border2)'};
            color:${curVal==='true'?'var(--accent)':'var(--text-dim)'};"
          onclick="toggleMetaYesNo('${escJs(nom)}')">
          ${curVal==='true' ? '✓ Yes' : '✗ No'}
        </button>
        <span style="font-size:10px;color:var(--text-dim);">Cliquer pour basculer</span>
      </div>
    </div>`;
  }

  // Dropdown multiselect (inchangé)
  if (META_TYPES_WITH_MULTISELECT.includes(type)) {
    extra += `<div class="detail-field" style="margin-top:6px;">
      <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
        <input type="checkbox" id="meta-multiselect" ${multiselect?'checked':''}
          onchange="updateMetaField('${escJs(nom)}','multiselect',this.checked)">
        Multiselect
      </label>
    </div>`;
  }

  // Values list (inchangé)
  if (META_TYPES_WITH_VALUES.includes(type)) {
    extra += `<div class="detail-field" style="margin-top:6px;">
      <label>Valeurs (une par ligne)</label>
      <textarea id="meta-valeurs" rows="5" placeholder="Valeur 1\nValeur 2\n…"
        onblur="updateMetaValeurs('${escJs(nom)}')">${escHtml(valeurs)}</textarea>
    </div>`;
  }

  // ✅ Type + Description (Iconik-like: en haut)
  return `<div class="detail-field">
    <label>Type</label>
    <select id="meta-type" onchange="updateMetaType('${escJs(nom)}',this.value)">
      ${typeOpts}
    </select>
  </div>

  <div class="detail-field" style="margin-top:6px;">
    <label>Description</label>
    <textarea id="meta-description" rows="3"
      placeholder="Describe purpose / editorial usage…"
      onblur="updateMetaField('${escJs(nom)}','description', this.value)">${escHtml(desc)}</textarea>
  </div>

  ${extra}`;
}
function metaIconikParamsHtml(meta) {
  const nom = meta.nom;
  const type = meta.type || '';

  const isText = (type === 'Text' || type === 'Text Area');
  const isDropdown = (type === 'Dropdown');
  const isBool = (type === 'Yes/No');

  const row = (label, field, help='') => {
    const on = !!meta[field];
    return `
      <div class="meta-ik-row">
        <div style="flex:1;min-width:0;">
          <div class="meta-ik-label">${label}</div>
          ${help ? `<div class="meta-ik-help">${help}</div>` : ``}
        </div>

        <div class="meta-ik-switch ${on ? 'on' : ''}"
          onclick="updateMetaField('${escJs(nom)}','${field}', ${on ? 'false' : 'true'}); renderDetail('${escJs(nom)}', true);"
          title="${label}">
        </div>
      </div>
    `;
  };

  const inheritHtml = meta.mapped_field_name
    ? `<div class="meta-ik-row">
        <div style="flex:1;"><div class="meta-ik-label">Inherit from</div></div>
        <div style="font-size:11px;font-family:monospace;color:var(--accent);">${escHtml(meta.mapped_field_name)}</div>
      </div>`
    : '';

  return `
    <div class="meta-ik-form">
      ${inheritHtml}
      ${row('Required', 'required')}
      ${row('Hide if not set', 'hide_if_not_set')}
      ${row('Read only', 'read_only')}
      ${row('Use in filters', 'use_in_filters',
        'Note: filter visibility also depends on Iconik system search settings.')}

      ${isText ? row('String Exact', 'string_exact') : ''}

      ${(isText || isDropdown) ? row(
        'Display as warning',
        'display_as_warning',
        'If set, any content of this field may be displayed as a warning on the asset page.'
      ) : ''}

      ${isBool ? row('Block assets', 'block_assets',
        'If set to true on an Asset, it can block sharing and downloading.') : ''}
    </div>
  `;
}

function toggleMetaYesNo(nom) {
  const m = metadonneesData.metadonnees.find(m=>m.nom===nom);
  if (!m) return;
  m.defaultValue = m.defaultValue === 'true' ? 'false' : 'true';
  sauvegarderDonnees();
  renderDetail(nom);
}

function detailMetadonnee(nom) {
  const meta = (metadonneesData.metadonnees || []).find(m => m.nom === nom);
  if (!meta) return '<p style="color:var(--text-dim)">Introuvable.</p>';

  // Toujours disposer de metadataViews
  if (!meta.metadataViews) meta.metadataViews = meta.metadataView ? [meta.metadataView] : [];

  // === TYPE & VALEURS (identique à ton existant) ===
  const metaTypeHtml = metaTypeFieldsHtml(meta);

  // === METADATA VIEWS ===
  const curViews = _viewNames(meta.metadataViews);                           // ← noms normalisés
  const allViews = _viewNames(metadataViewsData.metadataViews);              // ← noms normalisés depuis store global
  const mdvRows = curViews.length
    ? sortAlpha(curViews).map(v =>
        assocRowHtml(v, null, `retirer('metaMDV','${escJs(nom)}','${escJs(v)}')`)
      ).join('')
    : '<div class="set-empty-list">Aucune MD View</div>';

  // Vues disponibles = tout - déjà liées à cette méta
  const mdvAvail = sortAlpha(allViews.filter(v => !curViews.includes(v)));

  // Sélecteur + bouton "Ajouter"
  const mdvAdd = addRowHtml(
    'addMetaMDV',
    mdvAvail,               // ← tableau de chaînes (pas d'objets)
    null,
    '+ Ajouter',
    `ajouterMDVAMeta('${escJs(nom)}')`,
    false
  );

  return sectionHtml('⚙️','Type & Valeurs','var(--c-warn)', metaTypeHtml)
       + sectionHtml('📋','Metadata Views','var(--accent)', mdvRows + mdvAdd)
       + sectionHtml('🧩','Paramétrage Iconik','var(--c-info)', metaIconikParamsHtml(meta));
}

function updateMetaType(nom, type) {
  const m = metadonneesData.metadonnees.find(m=>m.nom===nom);
  if (!m) return;
  m.type = type;
  if (!META_TYPES_WITH_VALUES.includes(type)) m.valeurs = [];
  if (!META_TYPES_WITH_MULTISELECT.includes(type)) m.multiselect = false;
  sauvegarderDonnees();
  // Re-render la section type uniquement
  renderDetail(nom);
}

function updateMetaField(nom, field, val) {
  const m = metadonneesData.metadonnees.find(m=>m.nom===nom);
  if (m) { m[field] = val; sauvegarderDonnees(); }
}

function updateMetaValeurs(nom) {
  const m = metadonneesData.metadonnees.find(m=>m.nom===nom);
  if (!m) return;
  const textarea = document.getElementById('meta-valeurs');
  if (!textarea) return;
  m.valeurs = textarea.value.split('\n').map(v=>v.trim()).filter(Boolean);
  sauvegarderDonnees();
  toast('Valeurs sauvegardées ✓');
}

function ajouterMDVAMeta(metaNom) {
  const val = document.getElementById('addMetaMDV')?.value;
  if (!val) { toast('Sélectionnez une MD View', true); return; }

  const m = (metadonneesData.metadonnees || []).find(x => x.nom === metaNom);
  if (!m) { toast('Métadonnée introuvable', true); return; }

  // Source de vérité = côté Métadonnée
  if (!m.metadataViews) m.metadataViews = m.metadataView ? [m.metadataView] : [];
  if (m.metadataViews.includes(val)) { toast('Déjà ajoutée', true); return; }
  m.metadataViews.push(val);
  m.metadataView = m.metadataViews[0];

  // (Optionnel) ne rien pousser dans metadataViewsData si la vue existe déjà
  // On évite de "mixer" objets & chaînes : seulement si absente par nom
  const allNames = _viewNames(metadataViewsData.metadataViews);
  if (!allNames.includes(val)) {
    // Si tu veux forcer l'existence dans la liste globale :
    // metadataViewsData.metadataViews.push(val); // ← garde en commentaire si tu ne veux pas enrichir
  }

  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search')?.value || '');
  renderDetail(metaNom);
  toast('MD View ajoutée ✓');
}

// ─── RÔLE ─────────────────────────────────────────────────────
function detailRole(nom) {
  // Role Groups qui contiennent ce rôle
  const rgs = roleGroupsData.roleGroups.filter(rg => (rg.fonctionnalites||[]).includes(nom));
  const rgRows = sortAlpha(rgs,'nom').map(rg =>
    assocRowHtml(rg.nom, null, `retirerRoleDeRG('${escJs(nom)}','${escJs(rg.nom)}')`)
  ).join('') || '<div class="set-empty-list">Aucun Role Group</div>';

  // Ajout d'un Role Group à ce rôle
  const rgsAvail = roleGroupsData.roleGroups.filter(rg => !(rg.fonctionnalites||[]).includes(nom));
  const rgAdd = addRowHtml('addRoleToRG', sortAlpha(rgsAvail,'nom').map(rg=>rg.nom), null,
    '+ Ajouter', `ajouterRoleARGDepuisRole('${escJs(nom)}')`, false);

  // Items
  const items = itemsAdvancedData.items.filter(i => (i.assignations||[]).some(a=>a.role===nom));
  let itemsHtml = items.length === 0 ? '<div class="set-empty-list">Aucun item associé</div>' : '';
  sortAlpha(items,'nom').forEach(item => {
    const a = item.assignations.find(a=>a.role===nom);
    itemsHtml += `<div class="assoc-row" style="align-items:flex-start;flex-direction:column;gap:4px;">
      <div style="display:flex;align-items:center;width:100%;gap:7px;">
        <span class="assoc-name">${escHtml(item.nom)}</span>
        <button class="assoc-del" onclick="retirer('itemAssig','${escJs(item.nom)}','${escJs(nom)}')" title="Retirer">×</button>
        <button class="assoc-add-btn" style="font-size:9px;padding:3px 7px;" onclick="ouvrirModalPermsItem('${escJs(item.nom)}','${escJs(nom)}')">✏️</button>
      </div>
      <div class="item-assig-perms">${(a?.permissions||[]).map(p=>`<span class="item-assig-perm">${escHtml(p)}</span>`).join('')}</div>
    </div>`;
  });

  // Ajouter item
  const itemsAvail = itemsAdvancedData.items.filter(i=>!(i.assignations||[]).some(a=>a.role===nom));
  const itemsAdd = addRowHtml('addRoleItem', sortAlpha(itemsAvail,'nom').map(i=>i.nom), null,
    '+ Ajouter', `ouvrirModalAjoutRoleItem('${escHtml(nom)}')`, false);

  return sectionHtml('👥','Role Groups','var(--c-purple)', rgRows + rgAdd) +
         sectionHtml('🔧','Items associés','var(--c-info)', itemsHtml + itemsAdd);
}


// ── Nettoyer les rôles techniques du localStorage ───────────────
function nettoyerRolesTechniques() {
  rolesData.roles = (rolesData.roles || []).filter(r => {
    if (!r || typeof r !== 'string') return false;
    // Exclure les slugs techniques snake_case (can_*, web_*, is_*, etc.)
    if (/^(can|web|is|has)_/.test(r)) return false;
    // Exclure les UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r)) return false;
    // Exclure tout ce qui ressemble à un slug (snake_case sans espaces ni majuscules)
    if (/^[a-z][a-z0-9_]+$/.test(r) && r.includes('_')) return false;
    return true;
  });
  // Nettoyer aussi dans les roleGroups
  roleGroupsData.roleGroups.forEach(rg => {
    if (rg.fonctionnalites) {
      rg.fonctionnalites = rg.fonctionnalites.filter(r =>
        r && typeof r === 'string'
        && !/^(can|web|is|has)_/.test(r)
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r)
        && !(/^[a-z][a-z0-9_]+$/.test(r) && r.includes('_'))
      );
    }
  });
  sauvegarderDonnees();
  switchEntity('roles');
  toast('✅ Rôles techniques supprimés');
}

function ajouterRoleARGDepuisRole(roleNom) {
  const val = document.getElementById('addRoleToRG')?.value;
  if (!val) { toast('Sélectionnez un Role Group', true); return; }
  const rg = roleGroupsData.roleGroups.find(r => r.nom === val);
  if (!rg) { toast('Role Group introuvable', true); return; }
  if (!rg.fonctionnalites) rg.fonctionnalites = [];
  if (rg.fonctionnalites.includes(roleNom)) { toast('Déjà dans ce groupe', true); return; }
  rg.fonctionnalites.push(roleNom);
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  renderDetail(roleNom);
  toast('Rôle ajouté au groupe ✓');
}

function retirerRoleDeRG(roleNom, rgNom) {
  const rg = roleGroupsData.roleGroups.find(r => r.nom === rgNom);
  if (rg) rg.fonctionnalites = (rg.fonctionnalites||[]).filter(r => r !== roleNom);
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  renderDetail(roleNom, true);
  toast('Retiré ✓');
}

// ─── SAVED SEARCH ─────────────────────────────────────────────
function detailSavedSearch(nom) {
  const ss = savedSearchesData.savedSearches.find(s => s.nom === nom);
  if (!ss) return '<p style="color:var(--text-dim)">Introuvable.</p>';

  // ── Carte Paramètres : Metadata View ────────────────────────
  const currentMDV = ss.metadataView || '';
  const allViews   = sortAlpha(metadataViewsData.metadataViews.map(v => typeof v==='string'?v:(v.name||v.id||'')));
  const mdvRows    = currentMDV
    ? assocRowHtml(currentMDV, null, `retirerSSParam('${escJs(nom)}','metadataView','${escJs(currentMDV)}')`)
    : '<div class="set-empty-list">Aucune Metadata View</div>';
  const mdvAvail   = allViews.filter(v => v !== currentMDV);
  const mdvAdd     = `<div class="assoc-add-row">
    <select id="addSSMDV"><option value="">— MD View —</option>${mdvAvail.map(v=>`<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('')}</select>
    <button class="assoc-add-btn" onclick="ajouterSSParam('${escJs(nom)}','metadataView','addSSMDV')">+ Ajouter</button>
  </div>`;

  const paramsHtml = `
    <div style="font-size:9px;font-family:var(--font);letter-spacing:.8px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Metadata View</div>
    ${mdvRows}${mdvAdd}`;

  // ── Carte Teams ───────────────────────────────────────────────
  // ss.teams = tableau d'objets {nom, permission}
  const teams    = ss.teams || [];
  const teamRows = sortAlpha(teams, 'nom').map(t =>
    assocRowHtml(t.nom, t.permission, `retirer('ssTe','${escJs(nom)}','${escJs(t.nom)}')`)
  ).join('') || '<div class="set-empty-list">Aucune team</div>';

  const teamsNomsDeja = teams.map(t => t.nom);
  const teamsAvail    = sortAlpha(teamsData.teams, 'nom')
    .filter(t => !teamsNomsDeja.includes(t.nom))
    .map(t => t.nom);
  const teamsAdd = addRowHtml('addSSTeam', teamsAvail, 'addSSTeamPerm',
    '+ Associer', `ajouterTeamAEntity('ss','${escJs(nom)}')`);

  return sectionHtml('⚙️','Paramètres','var(--c-purple)', paramsHtml) +
         sectionHtml('👥','Teams associées','var(--c-info)', teamRows + teamsAdd);
}

function ajouterSSParam(ssNom, type, selId) {
  const val = document.getElementById(selId)?.value;
  if (!val) { toast('Sélectionnez un élément', true); return; }
  const ss = savedSearchesData.savedSearches.find(s => s.nom === ssNom);
  if (!ss) return;
  if (type === 'metadataView') {
    ss.metadataView = val;
    sauvegarderDonnees();
    renderDetail(ssNom, true);
    toast('Ajouté ✓');
  }
}

function retirerSSParam(ssNom, type, val) {
  const ss = savedSearchesData.savedSearches.find(s => s.nom === ssNom);
  if (!ss) return;
  if (type === 'metadataView') {
    ss.metadataView = '';
    sauvegarderDonnees();
    renderDetail(ssNom, true);
    toast('Retiré ✓');
  }
}

// ─── STORAGE ──────────────────────────────────────────────────

// ─── Relation Types ───────────────────────────────────────────────────────────
function detailRelationType(nom) {
  // Chercher dans custom puis système
  const rt = (relationTypesData.relationTypes || []).find(r => (r.name||r.id) === nom)
    || RELATION_TYPES_SYSTEM.find(r => r.name === nom);
  if (!rt) return '<div class="set-empty-list">Introuvable.</div>';

  const fields = `
    <div class="detail-field"><label>name</label><input type="text" value="${escHtml(rt.name||rt.id||'')}" disabled></div>
    <div class="detail-field"><label>source_label</label><input type="text" value="${escHtml(rt.source_label||'')}" disabled></div>
    <div class="detail-field"><label>destination_label</label><input type="text" value="${escHtml(rt.destination_label||'')}" disabled></div>
    <div class="detail-field"><label>description</label><input type="text" value="${escHtml(rt.description||'')}" disabled></div>
    <div class="detail-field"><label>is_directional</label><input type="text" value="${rt.is_directional}" disabled></div>
    <div class="detail-field"><label>is_system</label><input type="text" value="${rt.is_system}" disabled></div>
  `;
  const color = rt.is_system ? 'var(--text-dim)' : 'var(--accent)';
  return sectionHtml('🔗', rt.is_system ? 'Relation Type (système)' : 'Relation Type (custom)', color, fields);
}

// ─── Share Settings ───────────────────────────────────────────────────────────
function detailExportLocation(nom) {
  const el = (exportLocationsData.exportLocations || []).find(e => e.id === nom || e.nom === nom);
  if (!el) return '<div class="set-empty-list">Introuvable.</div>';

  const tog = (val) => val
    ? '<span style="color:var(--accent);font-size:14px;">●</span>'
    : '<span style="color:var(--border2);font-size:14px;">○</span>';

  const field = (label, val) => val
    ? `<div class="detail-field"><label>${label}</label><input type="text" value="${escHtml(String(val))}" disabled></div>`
    : '';

  const togRow = (label, val) => `
    <div class="meta-ik-row">
      <div style="flex:1;"><div class="meta-ik-label">${label}</div></div>
      <div>${tog(val)}</div>
    </div>`;

  // ── Paramètres généraux ──────────────────────────────────────────────────
  const generalHtml = `
    <div class="meta-ik-form">
      ${field('Name', el.nom)}
      ${field('Description', el.description)}
      ${field('Path', el.path)}
      ${field('Storage', el.storage_nom || el.storage_id)}
    </div>`;

  // ── Options d'export ──────────────────────────────────────────────────────
  const exportHtml = `
    <div class="meta-ik-form">
      ${togRow('Export Original', el.export_original)}
      ${togRow('Export Proxy', el.export_proxy)}
      ${togRow('Export Posters', el.export_posters)}
      ${togRow('Export Metadata', el.export_metadata)}
      ${el.export_metadata ? field('Metadata View', (() => {
        const _mv = (metadataViewsData.metadataViews || []).find(v => v.id === el.metadata_view || v.iconikId === el.metadata_view);
        return _mv ? (_mv.name || _mv.nom || el.metadata_view) : (el.metadata_view || '');
      })()) : ''}
      ${el.export_metadata ? field('Metadata Format', el.metadata_format) : ''}
      ${togRow('Export Transcriptions', el.export_transcriptions)}
      ${el.export_transcriptions ? field('Transcription Format', el.transcription_format) : ''}
      ${togRow('Sidecar includes original extension', el.include_original_extension)}
      ${el.export_to_asset_folder ? field('Export to asset folder', el.export_to_asset_folder) : ''}
    </div>`;

  // ── ACLs ─────────────────────────────────────────────────────────────────
  const aclTeams = (el.teams || []).map(t =>
    assocRowHtml(t.nom, (t.permissions||[]).includes('write') ? 'Read & Write' : 'Read Only', null, [...(t.permissions||[]), t._origin])
  ).join('') || '<div class="set-empty-list">Aucune team</div>';

  const aclUsers = (el.users || []).map(u =>
    assocRowHtml(u.nom, (u.permissions||[]).includes('write') ? 'Read & Write' : 'Read Only', null, [...(u.permissions||[]), u._origin])
  ).join('') || '<div class="set-empty-list">Aucun utilisateur</div>';

  const aclHtml = '<div style="margin-bottom:8px;font-size:10px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Teams</div>'
    + aclTeams
    + '<div style="margin:12px 0 8px;font-size:10px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Users</div>'
    + aclUsers;

  return `<div class="detail-field"><label>ID</label><input type="text" value="${escHtml(el.id)}" disabled style="font-family:monospace;font-size:10px;"></div>`
    + sectionHtml('📤', 'General', 'var(--accent)', generalHtml)
    + sectionHtml('⚙️', 'Export Options', 'var(--c-info)', exportHtml)
    + sectionHtml('🔐', 'Access Control', 'var(--c-purple)', aclHtml);
}

function detailShareSettings() {
  // systemSettingsData chargé depuis DB uniquement (plus de fallback localStorage)
  const raw = systemSettingsData?.settings || {};
  if (!Object.keys(raw).length)
    return '<div class="set-empty-list">Aucune donnée — lancez une sync DS pour charger les Share Settings.</div>';

  const tog = (val) => val === null || val === undefined
    ? '<span style="color:var(--text-dim);">—</span>'
    : val ? '<span style="color:var(--accent);font-size:14px;">●</span>'
          : '<span style="color:var(--border2);font-size:14px;">○</span>';

  const dso = raw.default_share_options || {};

  const sRow = (label, defKey, canKey) =>
    `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:5px 4px;font-size:11px;color:var(--text-mid);">${escHtml(label)}</td>
      <td style="padding:5px 8px;text-align:center;">${tog(dso[defKey])}</td>
      <td style="padding:5px 8px;text-align:center;">${canKey?tog(dso[canKey]):'<span style="color:var(--text-dim);">—</span>'}</td>
    </tr>`;
  const nRow = (label, val, canKey) =>
    `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:5px 4px;font-size:11px;color:var(--text-mid);">${escHtml(label)}</td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:600;">${val??'—'}</td>
      <td style="padding:5px 8px;text-align:center;">${canKey?tog(dso[canKey]):'<span style="color:var(--text-dim);">—</span>'}</td>
    </tr>`;

  const shareHtml = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr style="border-bottom:2px solid var(--border2);">
      <th style="padding:4px;font-size:10px;color:var(--text-dim);text-align:left;">Setting</th>
      <th style="padding:4px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Default</th>
      <th style="padding:4px 8px;font-size:10px;color:var(--text-dim);text-align:center;">Can be modified</th>
    </tr></thead><tbody>
      ${sRow('Allow download',         'allow_download',           'can_change_allow_download')}
      ${sRow('Allow download Proxy',   'allow_download_proxy',     'can_change_allow_download_proxy')}
      ${sRow('Allow upload',           'allow_upload',             'can_change_allow_upload')}
      ${sRow('Allow custom actions',   'allow_custom_actions',     'can_change_allow_custom_actions')}
      ${sRow('Allow comments',         'allow_comments',           'can_change_allow_comments')}
      ${sRow('Approve comments',       'allow_approving_comments', 'can_change_allow_approving_comments')}
      ${sRow('Show existing comments', 'show_existing_comments',   'can_change_show_existing_comments')}
      ${sRow('View versions',          'allow_view_versions',      'can_change_allow_view_versions')}
      ${nRow('Expires after (days)',   raw.share_expiration_time,  'can_change_share_expiration_time')}
      ${sRow('View transcriptions',    'allow_view_transcriptions','can_change_allow_view_transcriptions')}
      ${sRow('Allow setting approve status', 'allow_setting_approve_status', 'can_change_allow_setting_approve_status')}
      ${sRow('Show watermark',         'show_watermark',           'can_change_show_watermark')}
      ${sRow('Password required',      'require_password',         null)}
    </tbody></table>`;

  const gRow = (label, val) =>
    `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:5px 4px;font-size:11px;color:var(--text-mid);">${escHtml(label)}</td>
      <td style="padding:5px 8px;text-align:right;">${tog(val)}</td>
    </tr>`;
  const s = raw;
  const generalHtml = `<table style="width:100%;border-collapse:collapse;"><tbody>
      ${gRow('Allow external Share',            s.external_share)}
      ${gRow('Search for users on share pages', s.search_users_from_share)}
      ${gRow('Allow invites by link',           s.allow_invites_by_link)}
      ${gRow('Authentication with magic links', s.allow_share_magic_link_creation)}
      ${gRow('Enforce magic link allowlist',    s.enforce_magic_link_allowlist)}
      ${gRow('Search in transcriptions',        s.search_in_transcriptions)}
      ${gRow('Append asset UUID to downloads',  s.append_asset_uuid_to_downloads)}
      ${gRow('Use asset name on download',      s.use_asset_name_on_download)}
      ${gRow('Collections get parent ACLs',     s.collections_get_parent_acls)}
      ${gRow('Lock mapped collections',         s.lock_mapped_collections)}
      ${gRow('Hide favourites',                 s.hide_favourites)}
    </tbody></table>`;

  const dateSaved = systemSettingsData?.date_saved
    ? '<div style="font-size:10px;color:var(--text-dim);margin-bottom:12px;">Dernière sync DS : '
      + new Date(systemSettingsData.date_saved).toLocaleString('fr') + '</div>'
    : '';

  const noteHtml = '<div style="font-size:10px;color:var(--text-dim);margin-top:8px;padding:6px 8px;background:var(--bg2);border-radius:4px;border:1px solid var(--border);">'
    + 'ℹ️ Certains paramètres Iconik (Allow sync, Allow Domain-wide @mentions, Disable new sharing) ne sont pas exposés par l\'API system settings et ne peuvent pas être récupérés.'
    + '</div>';

  return dateSaved
    + sectionHtml('\uD83D\uDD12', 'Default Share Settings', 'var(--c-info)', shareHtml)
    + '<div style="margin-top:10px;">'
    + sectionHtml('\u2699\uFE0F', 'General Settings', 'var(--c-purple)', generalHtml)
    + '</div>'
    + noteHtml;
}
function detailStorage(nom) {
  const st = storagesData.storages.find(s => s.nom === nom);
  if (!st) return '<div class="set-empty-list">Introuvable.</div>';

  // ── Paramètres basiques (disponibles via API) ───────────────
  const typeLabels = {
    isg: '🖥️ ISG (Local)', s3: '🟠 Amazon S3', wasabi: '🟣 Wasabi',
    backblaze: '🔵 Backblaze B2', google_cloud: '🔴 Google Cloud',
    azure: '🔷 Azure Blob', ftp: '📁 FTP', sftp: '🔐 SFTP'
  };
  const typeBadge = typeLabels[st.type] || `📦 ${st.type}`;

  const basicParams = `
    <div class="detail-field"><label>Type</label><input type="text" value="${typeBadge}" disabled></div>
    <div class="detail-field"><label>Statut</label><input type="text" value="${escHtml(st.status)}" disabled></div>
    <div class="detail-field"><label>ID</label><input type="text" value="${escHtml(st.id)}" disabled style="font-family:monospace;"></div>
    <div class="detail-field"><label>Paramètres détaillés</label><input type="text" value="⚠️ Non disponibles via API" disabled style="color:var(--c-warn);"></div>
  `;

  // ── Teams ayant accès ─────────────────────────────────
  const teamRows = sortAlpha((st.teams || []), 'nom').map(t =>
    assocRowHtml(
      t.nom,
      t.permission,
      `retirer('stTe','${escHtml(nom)}','${escHtml(t.nom)}')`,
      t.permission_flags || []
    )
  ).join('') || '<div class="set-empty-list">Aucune team</div>';

  // ✅ AJOUT MANUEL : select + perm + bouton (c'était déjà calculé mais jamais affiché)
  const teamsAvail = teamsData.teams.filter(t => !((st.teams || []).some(x => x.nom === t.nom)));
  const teamsAdd = addRowHtml(
    'addStTeam',
    sortAlpha(teamsAvail, 'nom').map(t => t.nom),
    'addStTeamPerm',
    '+ Ajouter',
    `ajouterTeamAEntity('st','${escHtml(nom)}')`
  );

  return sectionHtml('⚙️', 'Informations', 'var(--c-warn)', basicParams) +
    sectionHtml('👥', 'Teams ayant accès', 'var(--c-info)',
      `<div style="font-size:10px;color:var(--text-dim);margin-bottom:8px;">${(st.teams || []).length} team(s) associée(s)</div>` +
      teamRows +
      teamsAdd
    );
}

// ─── USER ──────────────────────────────────────────────────
function detailUser(nom) {
  currentItem = nom;
  const user = usersData.users.find(u => u.nom === nom);
  if (!user) return '<div class="set-empty-list">Introuvable.</div>';
  
  // ── Badges de statut et type ──────────────────────────────
  const statusBadge = {
    'active': '🟢 Active',
    'inactive': '🟡 Inactive',
    'blocked': '🔴 Blocked'
  }[user.status?.toLowerCase()] || '⚪ Unknown';
  
  const typeBadge = {
    'standard': '🔵 Standard',
    'browse_only': '🟣 Browse Only',
    'power': '🟠 Power'
  }[user.type?.toLowerCase()] || '⚪ Standard';
  
  // ── Teams auxquelles l'utilisateur appartient ────────────
  const userTeams = user.teams || [];
  
  // Déterminer la team primaire (première de la liste ou marquée comme telle)
  const primaryTeam = userTeams[0] || null;
  const secondaryTeams = userTeams.slice(1);
  
  const teamRows = userTeams.length
  ? sortAlpha(userTeams, 'nom').map(t => {
      const star = t.is_primary ? '★ ' : '';
      return assocRowHtml(
        star + t.nom,
        null,
        `retirer('userTeam','${escJs(user.nom)}','${escJs(t.nom)}')`,
        []
      );
    }).join('')
  : '<div class="set-empty-list">Aucune team</div>';
  
  // ─── MODALE D’ASSOCIATION (Users → Teams / Role Groups) ─────────────────────
if (typeof window.ouvrirModalAssoc !== 'function') {
  window.ouvrirModalAssoc = function ouvrirModalAssoc(entity, assocType, parentNom) {
    if (entity !== 'users') { toast('Association non supportée pour ' + entity, true); return; }
    const user = (usersData.users || []).find(u => u.nom === parentNom);
    if (!user) { toast('Utilisateur introuvable', true); return; }

    let options = [];
    let title = '';
    if (assocType === 'roleGroups') {
      const deja = (user.role_groups || []).map(rg => (rg.nom || rg.name));
      options = sortAlpha(roleGroupsData.roleGroups, 'nom')
        .map(rg => rg.nom)
        .filter(n => !deja.includes(n));
      title = 'Associer un Role Group';
    } else if (assocType === 'teams') {
      const deja = (user.teams || []).map(t => t.nom);
      options = sortAlpha(teamsData.teams, 'nom')
        .map(t => t.nom)
        .filter(n => !deja.includes(n));
      title = 'Ajouter une équipe';
    } else { toast('Type non supporté', true); return; }

    const optHtml = options.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    const extra = assocType === 'teams' ? `
      <label style="display:flex;align-items:center;gap:7px;margin-top:6px;cursor:pointer;">
        <input type="checkbox" id="assoc-team-primary"> Définir comme équipe primaire
      </label>` : '';

    // Ouvre la modale "Créer" (déjà présente dans le fichier)
    document.getElementById('modalCreateTitle').textContent = title;
    document.getElementById('modalCreateBody').innerHTML = `
      <div class="form-row">
        <label>Sélection</label>
        <select id="assoc-select">
          <option value="">— Sélectionner —</option>${optHtml}
        </select>
      </div>${extra}`;
    document.getElementById('modalCreate').classList.add('open');

    // Valider l’association
    const primaryBtn = document.querySelector('#modalCreate .set-modal-ftr .primary');
    if (!primaryBtn) { toast('Bouton de validation introuvable', true); return; }
    primaryBtn.onclick = () => {
      const val = document.getElementById('assoc-select')?.value;
      if (!val) { toast('Sélectionnez un élément', true); return; }

      try {
        if (assocType === 'roleGroups') {
          if (!user.role_groups) user.role_groups = [];
          if (user.role_groups.some(rg => rg.nom === val)) { toast('Déjà ajouté', true); return; }
          const rg = (roleGroupsData.roleGroups || []).find(r => r.nom === val);
          user.role_groups.push({ nom: val, id: rg?.id || null });
        } else {
          if (!user.teams) user.teams = [];
          if (user.teams.some(t => t.nom === val)) { toast('Déjà ajoutée', true); return; }
          const team = (teamsData.teams || []).find(t => t.nom === val);
          const makePrimary = (user.teams.length === 0) || !!document.getElementById('assoc-team-primary')?.checked;
          if (makePrimary) (user.teams || []).forEach(t => t.is_primary = false);
          user.teams.push({ nom: val, id: team?.id || null, is_primary: !!makePrimary });
        }

        sauvegarderDonnees(); updateCounters();
        fermerModalCreate();
        renderListe(document.getElementById('set-list-search')?.value || '');
        renderDetail(parentNom, true);
        toast('Associé ✓');
      } catch (e) {
        console.error('[assoc users]', e);
        toast('Erreur association : ' + e.message, true);
      }
    };
  };
}
  // ── Role Groups associés ─────────────────────────────────
  // ── Role Groups associés ─────────────────────────────────
const userRoleGroups = user.role_groups || [];

const rgRows = userRoleGroups.length
  ? sortAlpha(userRoleGroups, 'nom').map(rg =>
      assocRowHtml(
        rg.nom,
        null,
        `retirer('userRG','${escJs(user.nom)}','${escJs(rg.nom)}')`,
        []  // ← 4ème param = tableau vide
      )
    ).join('')
  : '<div class="set-empty-list">Aucun Role Group</div>';
  
  // ── Rendu HTML ───────────────────────────────────────────
  return sectionHtml('👤', 'Informations', 'var(--c-info)',
    `<div class="detail-field"><label>Nom</label><input type="text" value="${escHtml(user.name)}" disabled></div>` +
    `<div class="detail-field"><label>Email</label><input type="text" value="${escHtml(user.email)}" disabled></div>` +
    `<div class="detail-field"><label>Statut</label><input type="text" value="${statusBadge}" disabled></div>` +
    `<div class="detail-field"><label>Type</label><input type="text" value="${typeBadge}" disabled></div>` +
    `<div class="detail-field"><label>Identity Provider</label><input type="text" value="${escHtml(user.idp || 'Iconik')}" disabled></div>`
  ) +
  sectionHtml('🏠', 'TEAMS', 'var(--accent)',
    `<div style="font-size:10px;color:var(--text-dim);margin-bottom:8px;">${userTeams.length} équipe(s) associée(s)</div>` +
    teamRows +
    `<button class="assoc-add-btn" onclick="ouvrirModalAssoc('users','teams','${escHtml(user.nom)}')">+ Ajouter une équipe</button>`
  ) +
  sectionHtml('🎭', 'Role Groups', 'var(--c-info)',
    `<div style="font-size:10px;color:var(--text-dim);margin-bottom:8px;">${userRoleGroups.length} Role Group(s) associé(s)</div>` +
    rgRows +
    `<button class="assoc-add-btn" onclick="ouvrirModalAssoc('users','roleGroups','${escHtml(user.nom)}')">+ Ajouter un Role Group</button>`
  );
}

function ajouterTeamAEntity(type, entityNom) {
  const selId  = (type === 'ss') ? 'addSSTeam' : 'addStTeam';
  const permId = (type === 'ss') ? 'addSSTeamPerm' : 'addStTeamPerm';

  const teamNom = document.getElementById(selId)?.value;
  const perm    = document.getElementById(permId)?.value || 'Read Only';

  if (!teamNom) { toast('Sélectionnez une team', true); return; }

  const ensureArr = (obj, key) => { if (!Array.isArray(obj[key])) obj[key] = []; return obj[key]; };
  const ensureFlags = (x) => Array.isArray(x) ? x : [];

  const upsert = (arr, matchFn, payload, mergeFn) => {
    const existing = arr.find(matchFn);
    if (existing) { mergeFn(existing); return { updated: true, existing }; }
    arr.push(payload);
    return { added: true, payload };
  };

  const team = teamsData.teams.find(t => t.nom === teamNom);
  if (!team) { toast('Team introuvable', true); return; }

  if (type === 'ss') {
    const ss = (savedSearchesData.savedSearches || []).find(s => s.nom === entityNom);
    if (!ss) { toast('Saved Search introuvable', true); return; }

    const ssId  = ss.id || entityNom;
    const ssNom = ss.nom || ss.name || entityNom;

    // 1) SavedSearch → Teams (NORMALISÉ)
    const ssTeams = ensureArr(ss, 'teams');
    const payloadSS = {
      id: team.id || teamNom,
      nom: team.nom || team.name || teamNom,
      permission: perm,
      permission_flags: []
    };

    upsert(
      ssTeams,
      x => x && (x.id === payloadSS.id || x.nom === payloadSS.nom),
      payloadSS,
      (x) => {
        x.id = x.id || payloadSS.id;
        x.nom = x.nom || payloadSS.nom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );

    // 2) Team → SavedSearches (inverse NORMALISÉ)
    const teamSS = ensureArr(team, 'savedSearches');
    const payloadTeam = { id: ssId, nom: ssNom, permission: perm, permission_flags: [] };

    upsert(
      teamSS,
      x => x && (x.id === ssId || x.nom === ssNom),
      payloadTeam,
      (x) => {
        x.id = x.id || ssId;
        x.nom = x.nom || ssNom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );

  } else {
    const st = (storagesData.storages || []).find(s => s.nom === entityNom);
    if (!st) { toast('Storage introuvable', true); return; }

    const stId  = st.id || entityNom;
    const stNom = st.nom || st.name || entityNom;

    // 1) Storage → Teams (NORMALISÉ)
    const stTeams = ensureArr(st, 'teams');
    const payloadST = {
      id: team.id || teamNom,
      nom: team.nom || team.name || teamNom,
      permission: perm,
      permission_flags: []
    };

    upsert(
      stTeams,
      x => x && (x.id === payloadST.id || x.nom === payloadST.nom),
      payloadST,
      (x) => {
        x.id = x.id || payloadST.id;
        x.nom = x.nom || payloadST.nom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );

    // 2) Team → Storages (inverse NORMALISÉ)
    const teamSt = ensureArr(team, 'storages');
    const payloadTeam = { id: stId, nom: stNom, permission: perm, permission_flags: [] };

    upsert(
      teamSt,
      x => x && (x.id === stId || x.nom === stNom),
      payloadTeam,
      (x) => {
        x.id = x.id || stId;
        x.nom = x.nom || stNom;
        x.permission = perm;
        x.permission_flags = ensureFlags(x.permission_flags);
      }
    );
  }

  sauvegarderDonnees();
  updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  renderDetail(entityNom);
  toast('Team ajoutée ✓');
}

// Créer une catégorie "objet : collections"
function creerCategorieCollections() {
  const input = document.getElementById('addCatName');
  const name = (input?.value || '').trim();
  if (!name) { toast('Nom de catégorie requis', true); return; }

  if (!categoriesData.categories) categoriesData.categories = [];
  if (categoriesData.categories.some(c => (c.nom || c.name) === name)) {
    toast('Catégorie déjà existante', true); return;
  }

  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value);
  if (currentItem) renderDetail(currentItem, true);
  toast('Catégorie créée ✓');
}

// Ajouter une MD View à une catégorie donnée
function ajouterMDVACat(catLabel, selId) {
  const sel = document.getElementById(selId);
  const val = sel?.value;
  if (!val) { toast('Sélectionnez une MD View', true); return; }

  const cat = (categoriesData.categories || [])
    .find(c => (c.nom || c.name) === catLabel);
  if (!cat) { toast('Catégorie introuvable', true); return; }

  if (!cat.metadataViews) cat.metadataViews = [];
  if (cat.metadataViews.includes(val)) { toast('Déjà ajoutée', true); return; }

  cat.metadataViews.push(val);
  sauvegarderDonnees();
  renderListe(document.getElementById('set-list-search').value);
  if (currentItem) renderDetail(currentItem, true);
  toast('MD View ajoutée ✓');
}

// ─── ITEM AVANCÉ ──────────────────────────────────────────────
function detailItem(nom) {
  const item = itemsAdvancedData.items.find(i=>i.nom===nom);
  if (!item) return '<p style="color:var(--text-dim)">Introuvable.</p>';

  const permsDisp = `<div style="margin-bottom:6px;">
    <div style="font-size:9px;color:var(--text-dim);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px;">Permissions disponibles</div>
    <div class="item-perms-available">${(item.permissionsDisponibles||[]).map(p=>`<span class="item-perm-dot">${escHtml(p)}</span>`).join('')}</div>
    <button class="assoc-add-btn" style="margin-top:6px;" onclick="ouvrirModalEditerItem('${escJs(nom)}')">✏️ Modifier l'item</button>
  </div>`;

  let assignHtml = '';
  sortAlpha(item.assignations||[],'role').forEach(a => {
    assignHtml += `<div class="assoc-row" style="align-items:flex-start;flex-direction:column;gap:4px;">
      <div style="display:flex;width:100%;align-items:center;gap:7px;">
        <span class="assoc-name" style="color:var(--c-purple);font-weight:600;">🎭 ${escHtml(a.role)}</span>
        <button class="assoc-del" onclick="retirer('itemAssig','${escJs(nom)}','${escJs(a.role)}')" title="Retirer">×</button>
        <button class="assoc-add-btn" style="font-size:9px;padding:3px 7px;" onclick="ouvrirModalPermsItem('${escJs(nom)}','${escJs(a.role)}')">✏️ Perms</button>
      </div>
      <div class="item-assig-perms">${(a.permissions||[]).map(p=>`<span class="item-assig-perm">${escHtml(p)}</span>`).join('')}</div>
    </div>`;
  });
  if (!assignHtml) assignHtml = '<div class="set-empty-list">Aucune assignation</div>';

  const rolesAvail = sortAlpha(rolesData.roles).filter(r=>!(item.assignations||[]).some(a=>a.role===r));
  const addRow = addRowHtml('addItemRole', rolesAvail, null,
    '+ Ajouter rôle', `ouvrirModalAjoutRoleItem('${escHtml(nom)}')`, false);

  return sectionHtml('🔑','Configuration','var(--c-purple)', permsDisp) +
         sectionHtml('🎭','Assignations rôles','var(--accent)', assignHtml + addRow);
}

// ─── WORKFLOW ─────────────────────────────────────────────────
function detailWorkflow(nom) {
  const wf = workflowsData.workflows.find(w=>w.nom===nom);
  if (!wf) return '<p style="color:var(--text-dim)">Introuvable.</p>';

  const colsRows = sortAlpha(wf.collections||[]).map(c =>
    assocRowHtml(c, null, `retirer('wfCol','${escHtml(nom)}','${escHtml(c)}')`)
  ).join('') || '<div class="set-empty-list">Aucune collection</div>';
  const colsAvail = collectionsData.collections.filter(c=>!(wf.collections||[]).includes(c));
  const colsAdd = addRowHtml('addWfCol', sortAlpha(colsAvail), null,
    '+ Ajouter', `ajouterWFElement('${escHtml(nom)}','col')`, false);

  const metaRows = sortAlpha(wf.metadonnees||[]).map(m =>
    assocRowHtml(m, null, `retirer('wfMeta','${escHtml(nom)}','${escHtml(m)}')`)
  ).join('') || '<div class="set-empty-list">Aucune métadonnée</div>';
  const metasAvail = metadonneesData.metadonnees.filter(m=>!(wf.metadonnees||[]).includes(m.nom));
  const metasAdd = addRowHtml('addWfMeta', sortAlpha(metasAvail,'nom').map(m=>m.nom), null,
    '+ Ajouter', `ajouterWFElement('${escHtml(nom)}','meta')`, false);

  return sectionHtml('📁','Collections','var(--c-info)', colsRows + colsAdd) +
         sectionHtml('🏷️','Métadonnées','var(--accent)', metaRows + metasAdd);
}

function ajouterWFElement(wfNom, type) {
  const selId = type === 'col' ? 'addWfCol' : 'addWfMeta';
  const val = document.getElementById(selId)?.value;
  if (!val) { toast('Sélectionnez un élément', true); return; }
  const wf = workflowsData.workflows.find(w=>w.nom===wfNom);
  if (!wf) return;
  if (type === 'col') {
    if (!wf.collections) wf.collections = [];
    if (!wf.collections.includes(val)) wf.collections.push(val);
  } else {
    if (!wf.metadonnees) wf.metadonnees = [];
    if (!wf.metadonnees.includes(val)) wf.metadonnees.push(val);
  }
  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value); renderDetail(wfNom);
  toast('Ajouté ✓');
}

// ─── CATÉGORIE ────────────────────────────────────────────────
// Helpers compat: nouveau modèle = object_types ; legacy = appliqueeA
function catGetObjectTypes(cat){
  if (Array.isArray(cat?.object_types)) return cat.object_types;
  if (Array.isArray(cat?.appliqueeA)) return cat.appliqueeA; // legacy compat
  return [];
}
function catSetObjectTypes(cat, types){
  cat.object_types = Array.isArray(types) ? types : [];
  // compat optionnelle: garde l'ancien champ si d'autres morceaux UI le lisent encore
  cat.appliqueeA = cat.object_types;
}

function detailCategorie(nom) {
  const cat = categoriesData.categories.find(c => c.nom === nom);
  if (!cat) return '';

  // Index inverse viewName → [object_types] depuis viewIdsByType
  const viewObjTypes = {};
  Object.entries(cat.viewIdsByType || {}).forEach(([objType, viewNames]) => {
    (viewNames || []).forEach(vName => {
      if (!viewObjTypes[vName]) viewObjTypes[vName] = [];
      if (!viewObjTypes[vName].includes(objType)) viewObjTypes[vName].push(objType);
    });
  });
  const OBJ_ICONS = { assets: '🎬', collections: '📁', segments: '✂️', custom_actions: '⚡' };
  const mdvRows = sortAlpha(cat.metadataViews || []).map(v => {
    const objTypes = viewObjTypes[v] || [];
    const badge = objTypes.map(o => OBJ_ICONS[o] || o).join(' ');
    return `<div class="assoc-row">
      <span class="assoc-name">${escHtml(v)}</span>
      ${badge ? `<span style="font-size:0.8em;opacity:0.6;margin-left:6px;">${badge}</span>` : ''}
      <span style="margin-left:auto;">
        <button class="assoc-del" onclick="retirer('catMdv','${escHtml(nom)}','${escHtml(v)}')" title="Retirer">×</button>
      </span>
    </div>`;
  }).join('') || '<div class="set-empty-list">Aucune MD View</div>';

  // ⚠️ metadataViewsData.metadataViews est une liste d'objets {id,name} (pas des strings)
  // On filtre sur le "name" affiché.
  const mdvAvail = (metadataViewsData.metadataViews || [])
    .filter(v => v && v.name && !(cat.metadataViews || []).includes(v.name))
    .map(v => v.name);

  const mdvAdd = addRowHtml(
    'addCatMdv',
    sortAlpha(mdvAvail),
    null,
    '+ Ajouter',
    `ajouterMDVACategorie('${escHtml(nom)}')`,
    false
  );

  const objList = ['assets', 'collections', 'segments', 'custom_actions'];
  const applies = catGetObjectTypes(cat);

  const checkHtml = objList.map(obj =>
    `<label class="perm-checkbox-label">
      <input type="checkbox" value="${obj}" ${applies.includes(obj) ? 'checked' : ''}
        onchange="updateCatApplique('${escHtml(nom)}')"> ${obj}
     </label>`
  ).join('');

  return sectionHtml('📋', 'Metadata Views', 'var(--accent)', mdvRows + mdvAdd) +
         sectionHtml('🎯', 'Appliquée aux objets', 'var(--text-mid)',
           `<div class="perm-checkbox-grid">${checkHtml}</div>`);
}

function ajouterMDVACategorie(catNom) {
  const val = document.getElementById('addCatMdv')?.value;
  if (!val) { toast('Sélectionnez une MD View', true); return; }

  const cat = categoriesData.categories.find(c => c.nom === catNom);
  if (!cat) return;

  if (!cat.metadataViews) cat.metadataViews = [];
  if (!cat.metadataViews.includes(val)) cat.metadataViews.push(val);

  sauvegarderDonnees(); updateCounters();
  renderListe(document.getElementById('set-list-search').value); renderDetail(catNom);
  toast('MD View ajoutée ✓');
}

function updateCatApplique(catNom) {
  const cat = categoriesData.categories.find(c => c.nom === catNom);
  if (!cat) return;

  const selected = Array.from(document.querySelectorAll('.perm-checkbox-label input:checked'))
    .map(i => i.value);

  // ✅ écrit dans le modèle canonique
  catSetObjectTypes(cat, selected);

  sauvegarderDonnees();
  toast('Mis à jour ✓');
}

// ─── APP TOKEN ────────────────────────────────────────────────

// ── Sauvegarde / restauration rapide des environnements ──────────
function exporterEnvironnements() {
  const data = JSON.stringify(appTokensData, null, 2);
  const org  = document.getElementById('input-org-name')?.value || 'iconik';
  const blob = new Blob([data], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: org + '-environnements.json'
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast('✅ Environnements exportés');
}

function importerEnvironnements(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.appTokens && Array.isArray(data.appTokens)) {
        appTokensData = data;
        sauvegarderDonnees();
        updateCounters();
        if (currentEntity === 'appTokens') renderListe();
        toast('✅ ' + data.appTokens.length + ' environnement(s) importé(s)');
      } else {
        toast('⚠️ Format invalide', true);
      }
    } catch(e) {
      toast('⚠️ Fichier JSON invalide', true);
    }
  };
  reader.readAsText(file);
}

// Export automatique des environnements dans sessionStorage (survit au reload, pas au clear)
function _backupEnvs() {
  try {
    sessionStorage.setItem('_wfd_env_backup', JSON.stringify(appTokensData));
  } catch(_) {}
}
function _restoreEnvsIfLost() {
  try {
    if (!appTokensData.appTokens || appTokensData.appTokens.length === 0) {
      const backup = sessionStorage.getItem('_wfd_env_backup');
      if (backup) {
        const data = JSON.parse(backup);
        if (data.appTokens && data.appTokens.length > 0) {
          appTokensData = data;
          sauvegarderDonnees();
          toast('♻️ Environnements restaurés depuis la sauvegarde session');
        }
      }
    }
  } catch(_) {}
}

function detailAppToken(nom) {
  const t = appTokensData.appTokens.find(t=>t.name===nom);
  if (!t) return '';
  const ENV_LABELS = { dev:'\uD83D\uDD35 Dev', qa:'\uD83D\uDFE1 QA / Staging', prod:'\uD83D\uDFE2 Production' };
  const ENV_COLORS = { dev:'var(--c-info)', qa:'var(--c-warn)', prod:'var(--accent)' };
  const env   = t.environment || 'prod';
  const color = ENV_COLORS[env] || 'var(--accent)';
  const label = ENV_LABELS[env] || env;
  return sectionHtml('\uD83D\uDD10','Environnement Iconik', color,
    `<div class="detail-field"><label>Type</label>
     <select onchange="updateTokenField('${escJs(nom)}','environment',this.value)">
       <option value="dev"  ${env==='dev' ?'selected':''}>\uD83D\uDD35 Dev</option>
       <option value="qa"   ${env==='qa'  ?'selected':''}>\uD83D\uDFE1 QA / Staging</option>
       <option value="prod" ${env==='prod'?'selected':''}>\uD83D\uDFE2 Production</option>
     </select></div>
     <div class="detail-field"><label>URL du domaine</label>
     <input type="text" value="${escHtml(t.iconikUrl||'')}" placeholder="https://app.iconik.io"
       oninput="updateTokenField('${escJs(nom)}','iconikUrl',this.value)"></div>
     <div class="detail-field"><label>App ID</label>
     <input type="text" value="${escHtml(t.appId||'')}"
       oninput="updateTokenField('${escJs(nom)}','appId',this.value)"></div>
     <div class="detail-field"><label>Auth Token</label>
     <input type="password" value="${escHtml(t.token||'')}"
       oninput="updateTokenField('${escJs(nom)}','token',this.value)"></div>
     <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
       <button class="assoc-add-btn" onclick="testerEnvIconik('${escJs(nom)}')">\uD83D\uDD0C Tester la connexion</button>
       <span id="env-test-result-${escHtml(nom)}" style="font-size:11px;"></span>
     </div>
     <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
       <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Connexion</div>
       <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;margin-bottom:12px;">
         <div onclick="toggleEnvEnabled('${escJs(nom)}')"
           style="position:relative;width:36px;height:20px;border-radius:10px;flex-shrink:0;cursor:pointer;
                  background:${t.enabled===false?'var(--border)':'var(--accent)'};transition:background .2s;">
           <div style="position:absolute;top:2px;left:${t.enabled===false?'2':'16'}px;width:16px;height:16px;
                       border-radius:50%;background:#fff;transition:left .2s;pointer-events:none;"></div>
         </div>
         <span style="font-size:12px;">${t.enabled===false?'Connexion désactivée':'Connexion active'}</span>
       </label>
       <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Synchronisation</div>
       ${renderSyncUI(nom)}
     </div>`
  , true);
}
function updateTokenField(nom, field, val) {
  const t = appTokensData.appTokens.find(t=>t.name===nom);
  if (t) { t[field] = val; sauvegarderDonnees(); }
}
async function testerEnvIconik(nom) {
  const t   = appTokensData.appTokens.find(t=>t.name===nom);
  const res = document.getElementById('env-test-result-' + nom);
  if (!t || !res) return;
  if (!t.appId) {
    res.style.color = 'var(--c-danger)'; res.textContent = '\u26a0 App ID requis'; return;
  }
  res.style.color = 'var(--text-dim)'; res.textContent = '\u23f3 Test\u2026';
  try {
    const r = await _ikFetch(t, '/API/assets/v1/assets/?page=1&per_page=1');
    if (r.ok) { res.style.color='var(--accent)'; res.textContent='\u2713 Connexion r\u00e9ussie'; }
    else       { res.style.color='var(--c-danger)'; res.textContent='\u2717 HTTP '+r.status+' \u2014 v\u00e9rifiez les credentials'; }
  } catch(e) { res.style.color='var(--c-danger)'; res.textContent='\u2717 Injoignable'; }
}

// ══ CRÉER ÉLÉMENT ══════════════════════════════════════════════

function creerElement() {
  const titles = {
    teams:'Créer une Team', roleGroups:'Créer un Role Group',
    collections:'Ajouter une Collection', metadataViews:'Ajouter une Metadata View',
    metadonnees:'Ajouter une Métadonnée', roles:'Ajouter un Rôle',
    savedSearches:'Créer une Saved Search', storages:'Ajouter un Storage',
    items:'Ajouter un Item Avancé', workflows:'Créer un Workflow',
    categories:'Cr\u00e9er une Cat\u00e9gorie', appTokens:'Ajouter un environnement Iconik',
  };
  document.getElementById('modalCreateTitle').textContent = titles[currentEntity] || 'Créer';

  let bodyHtml = '';
  if (currentEntity === 'items') {
    bodyHtml = `
      <div class="form-row"><label>Nom de l'item *</label><input type="text" id="cr-nom" placeholder="Ex: Collections, Assets…"></div>
      <div class="form-row"><label>Permissions disponibles *</label>
        <input type="text" id="cr-perms" placeholder="Ex: Read, Write, Delete">
        <span class="hint">Séparées par des virgules</span></div>`;
  } else if (currentEntity === 'appTokens') {
    bodyHtml = `
      <div class="form-row"><label>Nom *</label><input type="text" id="cr-nom" placeholder="Ex: Production, QA, Dev USA…"></div>
      <div class="form-row"><label>Type d'environnement</label>
        <select id="cr-environment">
          <option value="dev">\uD83D\uDD35 Dev</option>
          <option value="qa">\uD83D\uDFE1 QA / Staging</option>
          <option value="prod" selected>\uD83D\uDFE2 Production</option>
        </select></div>
      <div class="form-row"><label>URL du domaine Iconik *</label>
        <input type="text" id="cr-iconikUrl" placeholder="https://app.iconik.io">
        <span class="hint">URL complète sans slash final</span></div>
      <div class="form-row"><label>App ID *</label><input type="text" id="cr-appId" placeholder="App ID Iconik"></div>
      <div class="form-row"><label>Auth Token *</label><input type="password" id="cr-token" placeholder="Token Iconik"></div>`;
  } else if (currentEntity === 'metadonnees') {
    const mdvOpts = sortAlpha(metadataViewsData.metadataViews.map(v=>typeof v==='string'?v:(v.name||v.id||''))).map(v=>`<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    const typeOpts = META_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
    bodyHtml = `
      <div class="form-row"><label>Nom *</label><input type="text" id="cr-nom" placeholder="Nom de la métadonnée"></div>
      <div class="form-row"><label>Type</label>
        <select id="cr-type" onchange="onCreateMetaTypeChange()">
          <option value="">— Aucun —</option>${typeOpts}
        </select>
      </div>
      <div id="cr-meta-extra"></div>
      <div class="form-row"><label>Metadata View</label>
        <select id="cr-mdv"><option value="">— Aucune —</option>${mdvOpts}</select>
      </div>`;
  } else {
    bodyHtml = `<div class="form-row"><label>Nom *</label><input type="text" id="cr-nom" placeholder="Nom…"></div>`;
  }

  document.getElementById('modalCreateBody').innerHTML = bodyHtml;
  document.getElementById('modalCreate').classList.add('open');
  setTimeout(() => { const n = document.getElementById('cr-nom'); if (n) n.focus(); }, 80);
}

function validerModalCreate() {
  const nom = (document.getElementById('cr-nom')?.value || '').trim();
  if (!nom) { toast('Le nom est obligatoire', true); return; }

  switch (currentEntity) {
    case 'teams':
      if (teamsData.teams.some(t=>t.nom===nom)) { toast('Existe déjà', true); return; }
      teamsData.teams.push({ nom, collections:[], vues:[], savedSearches:[], storages:[] });
      break;
    case 'roleGroups':
      if (roleGroupsData.roleGroups.some(r=>r.nom===nom)) { toast('Existe déjà', true); return; }
      roleGroupsData.roleGroups.push({ nom, fonctionnalites:[] });
      break;
    case 'collections':
      if (collectionsData.collections.includes(nom)) { toast('Existe déjà', true); return; }
      collectionsData.collections.push(nom);
      break;
    case 'metadataViews':
      if (metadataViewsData.metadataViews.includes(nom)) { toast('Existe déjà', true); return; }
      metadataViewsData.metadataViews.push(nom);
      break;
    case 'metadonnees': {
      if (metadonneesData.metadonnees.some(m=>m.nom===nom)) { toast('Existe déjà', true); return; }
      const mdv = document.getElementById('cr-mdv')?.value || null;
      const type = document.getElementById('cr-type')?.value || '';
      const multiselect = document.getElementById('cr-multiselect')?.checked || false;
      const valeursRaw = document.getElementById('cr-valeurs')?.value || '';
      const valeurs = valeursRaw.split('\n').map(v=>v.trim()).filter(Boolean);
      metadonneesData.metadonnees.push({ nom, type, multiselect, valeurs,
        metadataView: mdv, metadataViews: mdv ? [mdv] : [] });
      break;
    }
    case 'roles':
      if (rolesData.roles.includes(nom)) { toast('Existe déjà', true); return; }
      rolesData.roles.push(nom);
      break;
    case 'savedSearches':
      if (savedSearchesData.savedSearches.some(s=>s.nom===nom)) { toast('Existe déjà', true); return; }
      savedSearchesData.savedSearches.push({ nom, metadataView:'', metadonnees:[], teams:[] });
      break;
    case 'storages':
      if (storagesData.storages.some(s=>s.nom===nom)) { toast('Existe déjà', true); return; }
      storagesData.storages.push({ nom, teams:[] });
      break;
    case 'items': {
      const permsStr = (document.getElementById('cr-perms')?.value || '').trim();
      if (!permsStr) { toast('Permissions obligatoires', true); return; }
      if (itemsAdvancedData.items.some(i=>i.nom===nom)) { toast('Existe déjà', true); return; }
      const perms = permsStr.split(',').map(p=>p.trim()).filter(Boolean);
      const newId = itemsAdvancedData.items.length > 0
        ? Math.max(...itemsAdvancedData.items.map(i=>i.id||0)) + 1 : 1;
      itemsAdvancedData.items.push({ id: newId, nom, permissionsDisponibles: perms, assignations:[] });
      break;
    }
    case 'workflows':
      if (workflowsData.workflows.some(w=>w.nom===nom)) { toast('Existe déjà', true); return; }
      workflowsData.workflows.push({ nom, collections:[], metadonnees:[] });
      break;
    case 'categories':
      if (categoriesData.categories.some(c=>c.nom===nom)) { toast('Existe déjà', true); return; }
      categoriesData.categories.push({ nom, metadataViews:[], appliqueeA:[] });
      break;
    case 'appTokens': {
      if (appTokensData.appTokens.some(t=>t.name===nom)) { toast('Existe d\u00e9j\u00e0', true); return; }
      const environment = document.getElementById('cr-environment')?.value || 'prod';
      const iconikUrl   = (document.getElementById('cr-iconikUrl')?.value || '').replace(/\/$/, '');
      const appId       = document.getElementById('cr-appId')?.value || '';
      const token       = document.getElementById('cr-token')?.value || '';
      if (!iconikUrl) { toast('URL du domaine obligatoire', true); return; }
      if (!appId)     { toast('App ID obligatoire', true); return; }
      if (!token)     { toast('Auth Token obligatoire', true); return; }
      appTokensData.appTokens.push({ name: nom, environment, iconikUrl, appId, token });
      break;
    }
  }

  sauvegarderDonnees(); updateCounters();
  fermerModalCreate();
  renderListe(document.getElementById('set-list-search').value);
  selectItem(nom);
  toast('Créé ✓');
}

function onCreateMetaTypeChange() {
  const type = document.getElementById('cr-type')?.value || '';
  const container = document.getElementById('cr-meta-extra');
  if (!container) return;
  let html = '';
  if (META_TYPES_WITH_MULTISELECT.includes(type)) {
    html += `<div class="form-row"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
      <input type="checkbox" id="cr-multiselect"> Multiselect
    </label></div>`;
  }
  if (META_TYPES_WITH_VALUES.includes(type)) {
    html += `<div class="form-row"><label>Valeurs (une par ligne)</label>
      <textarea id="cr-valeurs" rows="4" placeholder="Valeur 1\nValeur 2\n…"></textarea>
    </div>`;
  }
  container.innerHTML = html;
}

function fermerModalCreate() {
  document.getElementById('modalCreate').classList.remove('open');
}

// ══ RENOMMER / SUPPRIMER ════════════════════════════════════════

function renommerCourant() {
if (!currentItem) return;

// Ouvrir une modale de renommage simple
const modalHtml = `
<div class="set-modal-overlay open" id="modal-rename">
  <div class="set-modal" style="max-width:400px;">
    <div class="set-modal-hdr">
      <span class="set-modal-title">✏️ Renommer</span>
      <button class="set-modal-close" onclick="fermerModalRename()">&times;</button>
    </div>
    <div class="set-modal-body">
      <div class="form-row">
        <label>Nouveau nom</label>
        <input type="text" id="rename-input" value="${escHtml(currentItem)}" 
          onkeydown="if(event.key==='Enter') validerModalRename()">
      </div>
    </div>
    <div class="set-modal-ftr">
      <button class="set-btn" onclick="fermerModalRename()">Annuler</button>
      <button class="set-btn primary" onclick="validerModalRename()">✓ Renommer</button>
    </div>
  </div>
</div>
`;

// Injecter la modale dans le DOM
const container = document.createElement('div');
container.innerHTML = modalHtml;
document.body.appendChild(container);

// Focus sur l'input
setTimeout(() => {
  const input = document.getElementById('rename-input');
  if (input) { input.focus(); input.select(); }
}, 50);
}

function validerModalRename() {
const input = document.getElementById('rename-input');
const nouveauNom = (input?.value || '').trim();
if (!nouveauNom) { toast('Le nom est obligatoire', true); return; }
if (nouveauNom === currentItem) { fermerModalRename(); return; }

// Appliquer le renommage (même logique que avant)
switch (currentEntity) {
case 'teams': {
  const t = teamsData.teams.find(t=>t.nom===currentItem);
  if (t) { t.nom = nouveauNom; /* ...sync inverse... */ }; break;
}
case 'users': {
  const u = usersData.users.find(u=>u.nom===currentItem);
  if (u) u.nom = nouveauNom; break;
}
case 'roleGroups': {
  const rg = roleGroupsData.roleGroups.find(r=>r.nom===currentItem);
  if (rg) rg.nom = nouveauNom; break;
}
// ... (garder tout le reste du switch existant) ...
}

sauvegarderDonnees(); updateCounters();
currentItem = nouveauNom;
renderListe(document.getElementById('set-list-search').value);
renderDetail(nouveauNom);
toast('Renommé ✓');
fermerModalRename();
}

function fermerModalRename() {
const modal = document.getElementById('modal-rename');
if (modal) {
  modal.parentElement.remove();
}
}

function supprimerCourant() {
  if (!currentItem) return;
  if (!confirm(`Supprimer "${currentItem}" ?`)) return;

  switch (currentEntity) {
    case 'teams':         teamsData.teams = teamsData.teams.filter(t=>t.nom!==currentItem); break;
	case 'users':         usersData.users = usersData.users.filter(u => u.nom !== currentItem); break;
    case 'roleGroups':    roleGroupsData.roleGroups = roleGroupsData.roleGroups.filter(r=>r.nom!==currentItem); break;
    case 'collections':   collectionsData.collections = collectionsData.collections.filter(c=>c!==currentItem); break;
    case 'metadataViews': metadataViewsData.metadataViews = metadataViewsData.metadataViews.filter(v=>v!==currentItem); break;
    case 'metadonnees':   metadonneesData.metadonnees = metadonneesData.metadonnees.filter(m=>m.nom!==currentItem); break;
    case 'roles':         rolesData.roles = rolesData.roles.filter(r=>r!==currentItem); break;
    case 'savedSearches': savedSearchesData.savedSearches = savedSearchesData.savedSearches.filter(s=>s.nom!==currentItem); break;
    case 'storages':      storagesData.storages = storagesData.storages.filter(s=>s.nom!==currentItem); break;
    case 'items':         itemsAdvancedData.items = itemsAdvancedData.items.filter(i=>i.nom!==currentItem); break;
    case 'workflows':     workflowsData.workflows = workflowsData.workflows.filter(w=>w.nom!==currentItem); break;
    case 'categories':    categoriesData.categories = categoriesData.categories.filter(c=>c.nom!==currentItem); break;
    case 'appTokens':     appTokensData.appTokens = appTokensData.appTokens.filter(t=>t.name!==currentItem); break;
  }
  
  sauvegarderDonnees(); 
  updateCounters();
  switchEntity(currentEntity);
  currentItem = null;
  document.getElementById('set-detail-hdr').style.display = 'none';
  document.getElementById('set-detail-body').innerHTML = '';
}

// ══ MODALE PERMISSIONS ITEM ════════════════════════════════════

let _permsItemNom = null;
let _permsItemRole = null;

function ouvrirModalPermsItem(itemNom, role) {
  const item = itemsAdvancedData.items.find(i=>i.nom===itemNom);
  if (!item) return;
  _permsItemNom = itemNom; _permsItemRole = role;
  const assig = (item.assignations||[]).find(a=>a.role===role);
  const actives = assig?.permissions || [];
  document.getElementById('modalPermsTitle').textContent = `Permissions — ${itemNom} / ${role}`;
  document.getElementById('modalPermsBody').innerHTML =
    `<div class="perm-checkbox-grid">${(item.permissionsDisponibles||[]).map(p=>
      `<label class="perm-checkbox-label"><input type="checkbox" value="${escHtml(p)}" class="perm-cb" ${actives.includes(p)?'checked':''}> ${escHtml(p)}</label>`
    ).join('')}</div>`;
  document.getElementById('modalPerms').classList.add('open');
}

function ouvrirModalAjoutItemRole(itemNom) {
  const item = itemsAdvancedData.items.find(i=>i.nom===itemNom);
  if (!item) return;
  const roleSel = document.getElementById('addItemRole')?.value;
  if (!roleSel) { toast('Sélectionnez un rôle', true); return; }
  ouvrirModalPermsItem(itemNom, roleSel);
}

function ouvrirModalAjoutRoleItem(roleNom) {
  const itemSel = document.getElementById('addRoleItem')?.value;
  if (!itemSel) { toast('Sélectionnez un item', true); return; }
  ouvrirModalPermsItem(itemSel, roleNom);
}

// Ajouter item à un rôle depuis la vue Role Group
function ouvrirModalPermsRGItem(rgNom) {
  const role = document.getElementById('addRGItemRole')?.value;
  const item = document.getElementById('addRGItem')?.value;
  if (!role) { toast('Sélectionnez un rôle', true); return; }
  if (!item) { toast('Sélectionnez un item', true); return; }
  ouvrirModalPermsItem(item, role);
}

function validerModalPerms() {
  const item = itemsAdvancedData.items.find(i=>i.nom===_permsItemNom);
  if (!item) return;
  const perms = Array.from(document.querySelectorAll('.perm-cb:checked')).map(c=>c.value);
  if (perms.length === 0) { toast('Sélectionnez au moins une permission', true); return; }
  if (!item.assignations) item.assignations = [];
  const a = item.assignations.find(a=>a.role===_permsItemRole);
  if (a) { a.permissions = perms; }
  else { item.assignations.push({ role: _permsItemRole, permissions: perms }); };
  sauvegarderDonnees(); updateCounters();
  fermerModalPerms();
  renderListe(document.getElementById('set-list-search').value);
  // Si on est dans un Role Group, refresh ciblé sans rebuild complet
  if (currentEntity === 'roleGroups' && document.getElementById('rg-items-body')) {
    refreshRGItemsBody(currentItem);
  } else if (currentItem) {
    renderDetail(currentItem);
  }
  toast('Permissions sauvegardées ✓');
}

function fermerModalPerms() {
  document.getElementById('modalPerms').classList.remove('open');
  _permsItemNom = null; _permsItemRole = null;
}

// ── Éditer item (nom + perms disponibles) ─────────────────────
function ouvrirModalEditerItem(itemNom) {
  const item = itemsAdvancedData.items.find(i=>i.nom===itemNom);
  if (!item) return;
  document.getElementById('modalCreateTitle').textContent = 'Modifier l\'item';
  document.getElementById('modalCreateBody').innerHTML =
    `<div class="form-row"><label>Nom</label><input type="text" id="cr-nom" value="${escHtml(item.nom)}"></div>
     <div class="form-row"><label>Permissions disponibles</label>
       <input type="text" id="cr-perms" value="${escHtml((item.permissionsDisponibles||[]).join(', '))}">
       <span class="hint">Séparées par des virgules</span></div>`;
  _modalCreateCb = () => {
    const newNom = (document.getElementById('cr-nom')?.value||'').trim();
    const permsStr = (document.getElementById('cr-perms')?.value||'').trim();
    if (!newNom || !permsStr) { toast('Champs obligatoires', true); return false; }
    const newPerms = permsStr.split(',').map(p=>p.trim()).filter(Boolean);
    item.assignations = (item.assignations||[]).map(a=>({...a,permissions:a.permissions.filter(p=>newPerms.includes(p))})).filter(a=>a.permissions.length>0);
    item.nom = newNom; item.permissionsDisponibles = newPerms;
    currentItem = newNom;
    return true;
  };
  document.getElementById('modalCreate').classList.add('open');
  // Override valider
  document.querySelector('#modalCreate .set-modal-ftr .primary').onclick = () => {
    if (_modalCreateCb && _modalCreateCb()) {
      sauvegarderDonnees(); updateCounters(); fermerModalCreate();
      renderListe(document.getElementById('set-list-search').value); renderDetail(currentItem);
      toast('Modifié ✓');
    }
    _modalCreateCb = null;
  };
}

// ══ IMPORT / EXPORT ═══════════════════════════════════════════

function ouvrirModalImpex() {
  document.getElementById('modalImpex').classList.add('open');
}
function fermerModalImpex() {
  document.getElementById('modalImpex').classList.remove('open');
}

function exporterFichierJSON(type) {
  const map = {
    teams: [teamsData, 'teams.json'],
    roleGroups: [roleGroupsData, 'role_groups.json'],
    collections: [collectionsData, 'collections.json'],
    metadataViews: [metadataViewsData, 'metadata_views.json'],
    roles: [rolesData, 'roles.json'],
    metadonnees: [metadonneesData, 'metadonnees.json'],
    itemsAdvanced: [itemsAdvancedData, 'roles-advanced.json'],
  };
  const [data, filename] = map[type] || [];
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(`${filename} exporté`);
}

function exporterConfigurationComplete() {
  const sKeys = ['teamsData','roleGroupsData','collectionsData','metadataViewsData',
    'metadonneesData','rolesData','itemsAdvancedData','savedSearchesData',
    'storagesData','appTokensData','workflowsData','categoriesData',
    'teamAclsData','relationTypesData','systemSettingsData'];
  const settings = {};
  // Export depuis variables globales (migration localStorage → mémoire)
  sKeys.forEach(k => { const g = window[k]; if (g != null) settings[k] = g; });
  const automations = {
    automationsData:   window.automationsData   || null,
    webhooksData:      window.webhooksData      || null,
    customActionsData: window.customActionsData || null,
  };
  const wKeys = ['wfdFlows','wfdPalNodes','wfdMappings','wfdContacts'];
  const workflow = {};
  wKeys.forEach(k => { try { workflow[k] = JSON.parse(localStorage.getItem(k)||'[]'); } catch(e){} });

  const _orgName = document.getElementById('input-org-name')?.value || '';
  const payload = {
    version:4, schema:'iconik-global-config',
    organisation: _orgName,
    exportedAt: new Date().toISOString(), exportedFrom:'settings',
    settings, automations, workflow,
  };
  const date = new Date().toISOString().split('T')[0];
  const org  = (_orgName || 'iconik').replace(/\s+/g,'-');
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json;charset=utf-8;'});
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`${org}-config-${date}.json` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('Configuration exportée ✓');
}

function importerFichierJSON(event, type) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const map = {
        teams:        () => { if(data.teams) teamsData={teams:data.teams}; else if(data.groupes) teamsData={teams:data.groupes}; },
        roleGroups:   () => { if(data.roleGroups) roleGroupsData={roleGroups:data.roleGroups}; },
        collections:  () => { if(data.collections) collectionsData=data; },
        metadataViews:() => { if(data.metadataViews) metadataViewsData=data; },
        roles:        () => { if(data.roles) rolesData=data; },
        metadonnees:  () => { if(data.metadonnees) metadonneesData=data; },
        itemsAdvanced:() => { if(data.items) itemsAdvancedData=data; },
      };
      if (map[type]) { map[type](); sauvegarderDonnees(); updateCounters(); renderListe(''); toast('Importé ✓'); }
    } catch(err) { toast('Erreur : ' + err.message, true); }
    event.target.value='';
  };
  reader.readAsText(file);
}

function importerConfigurationComplete(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data?.version) throw new Error('Fichier invalide');
      const currentOrg = document.getElementById('input-org-name')?.value || '';
      const fileOrg = data.organisation||'';
      if (fileOrg && currentOrg && fileOrg!==currentOrg) {
        if (!confirm(`Organisation différente !\nFichier: "${fileOrg}"\nActuel: "${currentOrg}"\nContinuer ?`)) return;
      }
      if (!confirm(`Importer remplacera TOUTES vos données.\nOrg: ${fileOrg||'?'} — Exporté: ${data.exportedAt?.split('T')[0]||'?'}\nContinuer ?`)) return;
      const s = data.settings||data;
      const keys = ['teamsData','roleGroupsData','collectionsData','metadataViewsData','metadonneesData','rolesData','itemsAdvancedData','savedSearchesData','storagesData','appTokensData','workflowsData','categoriesData','teamAclsData','relationTypesData','systemSettingsData'];
      keys.forEach(k=>{ if(s[k]) localStorage.setItem(k,JSON.stringify(s[k])); });
      if (data.automations) {
        ['automationsData','webhooksData','customActionsData'].forEach(k=>{ if(data.automations[k]) localStorage.setItem(k,JSON.stringify(data.automations[k])); });
      }
      if (data.workflow) {
        ['wfdFlows','wfdPalNodes','wfdMappings','wfdContacts'].forEach(k=>{ if(data.workflow[k]) localStorage.setItem(k,JSON.stringify(data.workflow[k])); });
      }
      if (fileOrg) localStorage.setItem('organisationName', fileOrg);
      toast('Configuration importée ✓');
      setTimeout(()=>location.reload(), 800);
    } catch(err) { toast('Erreur : '+err.message, true); }
    event.target.value='';
  };
  reader.readAsText(file);
}

function reinitialiserDonnees() {
  if (!confirm('Réinitialiser TOUTES les données ?\nCette action est irréversible.')) return;
  // Utiliser APS_Data.clear() pour vider tous les scopes enregistrés
  // → plus besoin de maintenir une liste manuelle ici
  if (window.APS_Data) {
    APS_Data.clear();
  } else {
    // Fallback si APS_Data non chargé : liste exhaustive des clés connues
    ['groupesData','teamsData','usersData','roleGroupsData','collectionsData','metadataViewsData',
     'metadonneesData','savedSearchesData','storagesData','workflowsData','categoriesData',
     'automationsData','automationsData_raw','webhooksData','customActionsData',
     'teamAclsData','relationTypesData','systemSettingsData','appTokensData',
     'exportLocationsData','appsData','itemsAdvancedData','rolesData','organisationName']
      .forEach(k => localStorage.removeItem(k));
  }
  toast('Données réinitialisées');
  setTimeout(() => location.reload(), 600);
}

 async function syncAclsSavedSearchesToTeams(base, headers) {
  // Pré-requis Teams (ACL group_id)
  if (!Array.isArray(teamsData.teams) || teamsData.teams.length === 0) {
    console.debug('[WFD] Skip ACLs Saved Searches: no teams loaded — normal si chargé avant teams');
    return;
  }

  // Assurer qu'on a les saved searches (sinon les charger)
  if (!Array.isArray(savedSearchesData.savedSearches) || savedSearchesData.savedSearches.length === 0) {
    const list = await syncFetchAll(
      base, headers,
      '/API/search/v1/search/saved/?per_page=500',
      r => (r.objects || [])
    );

    // index view_id → nom (si dispo)
    const viewById = {};
    (metadataViewsData.metadataViews || []).forEach(v => {
      if (v && v.id) viewById[v.id] = v.name || v.id;
    });

    savedSearchesData.savedSearches = (list || []).map(o =>
      (window.WFD_Mappers?.mapSavedSearch)
        ? window.WFD_Mappers.mapSavedSearch(o, viewById)
        : ({
            id: o.id || '',
            nom: o.name || o.title || o.id || '',
            name: o.name || o.title || o.id || '',
            query: o.criteria || o.query || {},
            metadata_view_id: (o.criteria?.metadata_view_id || ''),
            metadataView: '',
            teams: [],
            users: [],
            raw: o
          })
    );

  // (DB) savedSearchesData — en mémoire uniquement
  }

  if (!Array.isArray(savedSearchesData.savedSearches) || savedSearchesData.savedSearches.length === 0) {
    console.warn('[WFD] Skip ACLs Saved Searches: no saved searches loaded');
    return;
  }

  // Index Teams par ID (group_id)
  const teamById = {};
  (teamsData.teams || []).forEach(t => { if (t.id) teamById[t.id] = t; });

  // Index Saved Searches par ID (inverse)
  const ssById = {};
  (savedSearchesData.savedSearches || []).forEach(s => { if (s?.id) ssById[s.id] = s; });

  // Reset des inverses pour rebuild propre (évite accumulation)
  (teamsData.teams || []).forEach(t => { if (!Array.isArray(t.savedSearches)) t.savedSearches = []; });
  (savedSearchesData.savedSearches || []).forEach(s => {
    s.teams = Array.isArray(s.teams) ? [] : [];
    s.users = Array.isArray(s.users) ? [] : [];
  });

  const BATCH = 12;
  const ssList = (savedSearchesData.savedSearches || []).filter(s => s && s.id);

  for (let i = 0; i < ssList.length; i += BATCH) {
    const chunk = ssList.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      chunk.map(s =>
        fetch(base + '/API/acls/v1/acl/saved_searches/' + s.id + '/', { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(data => ({ ss: s, data }))
      )
    );

    for (const res of results) {
      if (!res.value?.data) continue;

      const { ss, data: aclData } = res.value;
      const ssObj = ssById[ss.id] || ss;
      const ssName = ssObj.nom || ssObj.name || ssObj.id;

      // ACL schema: groups_* + users_* (+ inherited/propagating)
      const groupEntries = [
        ...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' })),
        ...(aclData.inherited_groups_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
        ...(aclData.propagating_groups_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
      ];

      const userEntries = [
        ...(aclData.users_acl || []).map(e => ({ ...e, _origin: 'direct' })),
        ...(aclData.inherited_users_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
        ...(aclData.propagating_users_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
      ];

      // ── GROUP ACL → Teams (normalisé + stub si group_id inconnu)
      for (const ga of groupEntries) {
        let team = teamById[ga.group_id];

        if (!team) {
          // Team stub (comme Saved Searches / Collections)
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

        // Team → Saved Searches (NORMALISÉ)
        if (!Array.isArray(team.savedSearches)) team.savedSearches = [];
        if (!team.savedSearches.some(x => x.id === ssObj.id)) {
          team.savedSearches.push({
            id: ssObj.id,
            nom: ssName,
            permission: perm,
            permission_flags: flags
          });
        }

        // Saved Search → Teams (inverse NORMALISÉ)
        if (!Array.isArray(ssObj.teams)) ssObj.teams = [];
        if (!ssObj.teams.some(x => x.id === team.id)) {
          ssObj.teams.push({
            id: team.id,
            nom: team.nom || team.name || team.id,
            permission: perm,
            permission_flags: flags
          });
        }
      }

      // ── USER ACL → SavedSearch.users (NORMALISÉ)
      if (!Array.isArray(ssObj.users)) ssObj.users = [];
      for (const ua of userEntries) {
        const p = (ua.permissions || []).map(x => String(x).toLowerCase());
        const perm = (p.includes('write') || p.includes('delete') || p.includes('change-acl'))
          ? 'Read & Write'
          : 'Read Only';
        const flags = [...p];
        if (ua._origin) flags.push(ua._origin);

        const uid = ua.user_id || ua.id;
        if (!uid) continue;

        if (!ssObj.users.some(x => x.id === uid)) {
          ssObj.users.push({
            id: uid,
            // on ne force pas nom/email ici (phase vérif plus tard),
            // mais on ne les écrase pas non plus si déjà résolus ailleurs
            nom: ua.nom,
            email: ua.email,
            permission: perm,
            permission_flags: flags
          });
        }
      }
    }
  }

  // Persist
  // (DB) teamsData — en mémoire uniquement
  // (DB) savedSearchesData — en mémoire uniquement
}
 
// ────────────────────────────────────────────────────────────────────────
// ACLs Custom Actions → Teams (NORMALISÉ + inverse CustomAction.teams)
// Endpoint validé sur ton tenant : /API/acls/v1/acl/custom_actions/{id}/
// ────────────────────────────────────────────────────────────────────────
async function syncAclsCustomActionsToTeams(base, headers) {
  // Pré-requis Teams (ACL group_id)
  if (!Array.isArray(teamsData.teams) || teamsData.teams.length === 0) {
    console.debug('[WFD] Skip ACLs Custom Actions: no teams loaded — normal si chargé avant teams');
    return;
  }
  // Pré-requis Custom Actions
  if (!Array.isArray(customActionsData.customActions) || customActionsData.customActions.length === 0) {
    console.warn('[WFD] Skip ACLs Custom Actions: no custom actions loaded');
    return;
  }

  // Index Teams par ID (group_id)
  const teamById = {};
  (teamsData.teams || []).forEach(t => { if (t?.id && t.source !== 'acl_stub') teamById[String(t.id)] = t; });

  // Index Custom Actions par ID
  const caById = {};
  (customActionsData.customActions || []).forEach(a => { if (a?.id) caById[String(a.id)] = a; });

  // Reset pour rebuild propre
  Object.values(teamById).forEach(t => { t.customActions = []; });
  (customActionsData.customActions || []).forEach(a => { a.teams = []; });

  // Helper permissions → label + flags (aligné avec tes autres ACL sync) 
  const permFrom = (pList) => {
    const p = (pList || []).map(x => String(x).toLowerCase());
    return (p.includes('write') || p.includes('delete') || p.includes('change-acl'))
      ? 'Read & Write'
      : 'Read Only';
  };
  const flagsFrom = (pList, origin) => {
    const p = (pList || []).map(x => String(x).toLowerCase());
    if (origin) p.push(origin);
    return p;
  };

  const BATCH = 12;
  const list = (customActionsData.customActions || []).filter(a => a && a.id);

  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      chunk.map(a =>
        fetch(base + '/API/acls/v1/acl/custom_actions/' + a.id + '/', { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(data => ({ action: a, data }))
      )
    );

    for (const rr of results) {
      const action = rr.value?.action;
      const aclData = rr.value?.data;
      if (!action || !aclData) continue;

      const aObj = caById[String(action.id)] || action;
      const aName = aObj.title || aObj.nom || aObj.name || aObj.id;

      const groupEntries = [
        ...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' })),
        ...(aclData.inherited_groups_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
        ...(aclData.propagating_groups_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
      ];

      for (const ga of groupEntries) {
        const gid = String(ga.group_id || '');
        const team = teamById[gid];
        if (!team) continue; // groupe non-Team → ignoré

        const perm = permFrom(ga.permissions);
        const flags = flagsFrom(ga.permissions, ga._origin);

        // Team → Custom Actions
        if (!team.customActions.some(x => x.id === aObj.id)) {
          team.customActions.push({
            id: aObj.id,
            nom: aName,
            permission: perm,
            permission_flags: flags
          });
        }

        // Custom Action → Teams (inverse)
        if (!Array.isArray(aObj.teams)) aObj.teams = [];
        if (!aObj.teams.some(x => x.id === team.id)) {
          aObj.teams.push({
            id: team.id,
            nom: team.nom || team.name || team.id,
            permission: perm,
            permission_flags: flags
          });
        }
      }
    }
  }

  // Persist (comme tes autres ACL sync) 
  // (DB) teamsData — en mémoire uniquement
  // (DB) customActionsData — en mémoire uniquement
}
 
// =======================================================================
// SWEEP GLOBAL — normalisation finale des associations (exposé sur window)
// =======================================================================
function normalizeAssociationsSweep() {
  const toArr = (x) => Array.isArray(x) ? x : [];
  const uniqFlags = (a) => [...new Set(toArr(a).filter(Boolean).map(String))];

  const permRank = (p) => (p === 'Read & Write' ? 2 : (p === 'Read Only' ? 1 : 0));
  const bestPerm = (a, b) => (permRank(a) >= permRank(b) ? a : b);

  function mergeAssoc(existing, incoming, keepExtraKeys = []) {
    existing.permission = bestPerm(existing.permission, incoming.permission);
    existing.permission_flags = uniqFlags([...(existing.permission_flags || []), ...(incoming.permission_flags || [])]);
    if (!existing.nom && incoming.nom) existing.nom = incoming.nom;
    if (!existing.id && incoming.id) existing.id = incoming.id;
    keepExtraKeys.forEach(k => { if (existing[k] == null && incoming[k] != null) existing[k] = incoming[k]; });
    return existing;
  }

  function normalizeAssocItem(item, defaults = {}) {
    const it = item && typeof item === 'object' ? item : {};
    const id = it.id || defaults.id || null;
    const nom = it.nom || it.name || defaults.nom || (id || '');
    const permission = it.permission || defaults.permission || 'Read Only';
    const permission_flags = uniqFlags(it.permission_flags || it.permissionFlags || it.flags || defaults.permission_flags);
    return { id, nom, permission, permission_flags };
  }

  function normalizeAssocArray(arr, keyFn, keepExtraKeys = []) {
    const out = [];
    const byKey = new Map();

    toArr(arr).forEach(raw => {
      const norm = normalizeAssocItem(raw);
      const key = keyFn(norm, raw);
      if (!key) return;

      keepExtraKeys.forEach(k => { if (norm[k] == null && raw && raw[k] != null) norm[k] = raw[k]; });

      const existing = byKey.get(key);
      if (existing) mergeAssoc(existing, norm, keepExtraKeys);
      else { byKey.set(key, norm); out.push(norm); }
    });

    return out;
  }

  // Teams: collections/vues/savedSearches/storages/users + tag stubs
  (teamsData.teams || []).forEach(team => {
    team.is_acl_stub = (team?.source === 'acl_stub') || !!(team?.raw && team.raw.acl_stub);

    team.collections = normalizeAssocArray(
      team.collections,
      (norm, raw) => norm.id || (raw && raw.chemin) || null,
      ['chemin', '_path']
    ).map(x => ({ ...x, chemin: x.chemin || x.id || null, _path: x._path || null }));

    team.vues = normalizeAssocArray(team.vues, (norm) => norm.id || null);
    team.savedSearches = normalizeAssocArray(team.savedSearches, (norm) => norm.id || null);
    team.storages = normalizeAssocArray(team.storages, (norm) => norm.id || null);
	team.customActions = normalizeAssocArray(team.customActions, (norm) => norm.id || null);
    team.users = toArr(team.users).reduce((acc, u) => {
      const id = u && (u.id || u.user_id) ? (u.id || u.user_id) : null;
      if (!id) return acc;
      if (!acc.some(x => x.id === id)) acc.push({ id, nom: (u.nom || u.name || id), email: (u.email || '') });
      return acc;
    }, []);
  });

  // Metadata Views: inverse view.teams
  (metadataViewsData.metadataViews || []).forEach(v => {
    v.teams = normalizeAssocArray(v.teams, (norm) => norm.id || null);
  });

  // Saved Searches: teams + users_acl
  (savedSearchesData.savedSearches || []).forEach(ss => {
    ss.teams = normalizeAssocArray(ss.teams, (norm) => norm.id || null);

    ss.users = toArr(ss.users).reduce((acc, u) => {
      const id = u && (u.id || u.user_id) ? (u.id || u.user_id) : null;
      if (!id) return acc;

      const norm = {
        id,
        nom: u.nom,
        email: u.email,
        permission: u.permission || 'Read Only',
        permission_flags: uniqFlags(u.permission_flags || u.permissionFlags || u.flags)
      };

      const ex = acc.find(x => x.id === id);
      if (ex) {
        ex.permission = bestPerm(ex.permission, norm.permission);
        ex.permission_flags = uniqFlags([...(ex.permission_flags || []), ...(norm.permission_flags || [])]);
        if (!ex.nom && norm.nom) ex.nom = norm.nom;
        if (!ex.email && norm.email) ex.email = norm.email;
      } else acc.push(norm);

      return acc;
    }, []);
  });

  // Storages: inverse storage.teams
  (storagesData.storages || []).forEach(st => {
    st.teams = normalizeAssocArray(st.teams, (norm) => norm.id || null);
  });
  // Custom Actions: inverse customAction.teams
  (customActionsData.customActions || []).forEach(a => {
  a.teams = normalizeAssocArray(a.teams, (norm) => norm.id || null);
  });

  // Users: teams + role_groups (stabilité uniquement)
  (usersData.users || []).forEach(u => {
    u.teams = toArr(u.teams).reduce((acc, t) => {
      const id = t && t.id ? t.id : null;
      if (!id) return acc;
      if (!acc.some(x => x.id === id)) acc.push({ id, nom: (t.nom || t.name || id), is_primary: !!t.is_primary });
      return acc;
    }, []);

    u.role_groups = toArr(u.role_groups).reduce((acc, rg) => {
      const id = rg && rg.id ? rg.id : null;
      if (!id) return acc;
      if (!acc.some(x => x.id === id)) acc.push({ id, nom: (rg.nom || rg.name || id) });
      return acc;
    }, []);
  });

  // Tag final “inratable”
  (teamsData.teams || []).forEach(team => {
    team.is_acl_stub = (team?.source === 'acl_stub') || !!(team?.raw && team.raw.acl_stub);
  });
}

// Exposer au global (console + appels)
window.normalizeAssociationsSweep = normalizeAssociationsSweep;
 
// ── Sync Iconik — version consolidée et structurée ───────────────────────────


// =======================================================================
// CLEAN (Advanced) — Policy + Enforcer (env-aware)
// - Policy globale : localStorage['WFD_CLEAN_POLICY']
// - Chargement des listes : À la demande, au changement d'env (option 1)
// - Exclusions : IDs → Noms → Regex
// - Enforcer : scrub ACL group_ids interdits (ex: legacy Everyone) sur objets
// =======================================================================

// =======================================================================
// WFD — Modules extracted
// - CLEAN moved to: script-clean.js
// - SYNC  moved to: script-sync.js
// =======================================================================



// =======================================================================
// WFD — Auto-normalisation Team ↔ RoleGroup (doc) après import / setItem
// - Objectif : garantir la cohérence bidirectionnelle même si on importe
//   teamsData et roleGroupsData séparément ou dans un ordre quelconque.
// - Déclenche normalizeTeamRoleGroupsDoc() dès que localStorage reçoit
//   'teamsData' ou 'roleGroupsData' (debounced, sans boucle infinie).
// =======================================================================
(function () {
  if (!window.localStorage || typeof localStorage.setItem !== 'function') return;

  const _origSetItem = localStorage.setItem.bind(localStorage);
  let _pending = false;
  let _inNormalize = false;

  function scheduleNormalize() {
    if (_pending || _inNormalize) return;
    _pending = true;
    setTimeout(() => {
      _pending = false;
      if (_inNormalize) return;
      if (typeof window.normalizeTeamRoleGroupsDoc !== 'function') return;

      _inNormalize = true;
      try {
        window.normalizeTeamRoleGroupsDoc();
      } catch (e) {
        console.warn('[WFD] normalizeTeamRoleGroupsDoc failed:', e?.message || e);
      } finally {
        _inNormalize = false;
      }
    }, 0);
  }

  localStorage.setItem = function (key, value) {
    // Écrit réellement
    _origSetItem(key, value);

    // Si ça concerne teams/roleGroups, on normalise (debounced)
    if (!_inNormalize && (key === 'teamsData' || key === 'roleGroupsData')) {
      scheduleNormalize();
    }
  };

  // Marqueur debug
  window.__wfd_doclink_autonorm = true;
})();

// ── Jobs Panel ────────────────────────────────────────────────────────────────
function detailJobs() {
  return '<div id="jobs-panel" style="padding:0;">' +
    '<div id="jobs-active" style="margin-bottom:16px;"></div>' +
    '<div id="jobs-history"></div>' +
  '</div>';
}

function initJobs() {
  _renderJobsPanel();
  if (window.WFD_JobManager) {
    WFD_JobManager.onChange(_renderJobsPanel);
  }
}

function _renderJobsPanel() {
  var job = window.WFD_JobManager ? WFD_JobManager.getJob() : null;
  var hist = window.WFD_JobManager ? WFD_JobManager.getHistory() : [];

  // ── Job actif ──
  var activeEl = document.getElementById('jobs-active');
  if (activeEl) {
    if (!job || job.status === 'idle') {
      activeEl.innerHTML = '<p style="font-size:11px;color:var(--text-dim);padding:8px 0;">Aucun job en cours.</p>';
    } else {
      var pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
      var elapsed = job.startedAt ? Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000) : 0;
      var statusColor = {
        running: 'var(--accent)', pausing: 'var(--c-warn)', paused: 'var(--c-warn)',
        stopping: 'var(--c-danger)', done: 'var(--accent)', error: 'var(--c-danger)'
      }[job.status] || 'var(--text-dim)';
      var statusLabel = {
        running: '▶ En cours', pausing: '⏸ Pause en cours…', paused: '⏸ En pause',
        stopping: '⏹ Arrêt en cours…', done: '✅ Terminé', error: '❌ Erreur'
      }[job.status] || job.status;

      var controls = '';
      if (job.status === 'running') {
        controls = '<button class="assoc-add-btn" onclick="WFD_JobManager.pause()" style="color:var(--c-warn);border-color:var(--c-warn);">⏸ Pause</button>' +
                   '<button class="assoc-add-btn" onclick="WFD_JobManager.stop()" style="color:var(--c-danger);border-color:var(--c-danger);">⏹ Arrêter</button>';
      } else if (job.status === 'paused') {
        controls = '<button class="assoc-add-btn" onclick="WFD_JobManager.resume()" style="color:var(--accent);border-color:var(--accent);">▶ Reprendre</button>' +
                   '<button class="assoc-add-btn" onclick="WFD_JobManager.stop()" style="color:var(--c-danger);border-color:var(--c-danger);">⏹ Arrêter</button>';
      }

      var logs = job.results.slice(-8).map(function(r) {
        return '<div style="font-size:10px;color:var(--text-dim);padding:1px 0;">' + (r.msg || '') + '</div>';
      }).join('');

      activeEl.innerHTML =
        '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<span style="font-size:12px;font-weight:600;">' + (job.label || job.kind) + '</span>' +
            '<span style="font-size:10px;color:var(--text-dim);">' + (job.env || '') + '</span>' +
            '<span style="margin-left:auto;font-size:11px;font-weight:600;color:' + statusColor + ';">' + statusLabel + '</span>' +
          '</div>' +
          (job.total > 0 ?
            '<div style="background:var(--bg3);border-radius:3px;height:6px;margin-bottom:6px;overflow:hidden;">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--accent);transition:width .3s;border-radius:3px;"></div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--text-dim);margin-bottom:6px;">' + job.done + ' / ' + job.total + ' — ' + pct + '% — ' + elapsed + 's' +
              (job.currentItem ? ' — ' + job.currentItem.slice(0, 40) : '') +
            '</div>'
          : '') +
          (controls ? '<div style="display:flex;gap:6px;margin-bottom:8px;">' + controls + '</div>' : '') +
          (logs ? '<div style="border-top:1px solid var(--border);padding-top:6px;max-height:120px;overflow-y:auto;">' + logs + '</div>' : '') +
        '</div>';
    }
  }

  // ── Historique ──
  var histEl = document.getElementById('jobs-history');
  if (histEl) {
    if (!hist.length) {
      histEl.innerHTML = '<p style="font-size:11px;color:var(--text-dim);">Aucun historique.</p>';
    } else {
      histEl.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<span style="font-size:11px;font-weight:600;color:var(--text-dim);">HISTORIQUE</span>' +
          '<button class="assoc-add-btn" style="margin-left:auto;font-size:10px;" onclick="WFD_JobManager.clearHistory();_renderJobsPanel();">Effacer</button>' +
        '</div>' +
        hist.map(function(j) {
          var icon = j.status === 'done' ? '✅' : j.status === 'error' ? '❌' : '⏹';
          var duration = (j.startedAt && j.endedAt) ?
            Math.round((new Date(j.endedAt) - new Date(j.startedAt)) / 1000) + 's' : '—';
          var date = j.startedAt ? j.startedAt.replace('T', ' ').slice(0, 19) : '';
          return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:7px 10px;margin-bottom:5px;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span>' + icon + '</span>' +
              '<span style="font-size:11px;font-weight:600;">' + (j.label || j.kind) + '</span>' +
              '<span style="font-size:10px;color:var(--text-dim);">' + (j.env || '') + '</span>' +
              '<span style="margin-left:auto;font-size:10px;color:var(--text-dim);">' + duration + ' — ' + date + '</span>' +
            '</div>' +
            (j.error ? '<div style="font-size:10px;color:var(--c-danger);margin-top:3px;">' + j.error + '</div>' : '') +
          '</div>';
        }).join('');
    }
  }
}

window.switchEntity = switchEntity;
window.ouvrirModalImpex = ouvrirModalImpex;

// ── Sélecteur d'environnement ─────────────────────────────────────────────────
function _populateEnvSwitcher() {
  const sel = document.getElementById('env-switcher');
  if (!sel) return;
  const tokens = appTokensData.appTokens || [];
  if (!tokens.length) return;
  const current = window._apsActiveEnvSlug;
  sel.innerHTML = tokens.map(t => {
    const slug = t.env || t.environment;
    const label = t.name || slug;
    const selected = slug === current ? ' selected' : '';
    return `<option value="${slug}"${selected}>${label}</option>`;
  }).join('');
}

async function switchEnv(slug) {
  if (!slug || slug === window._apsActiveEnvSlug) return;
  if (window._apsLoading) return; // chargement initial en cours
  console.log('[APS] Switch env →', slug);
  // Vider l'affichage courant
  document.getElementById('set-list-body').innerHTML = '';
  document.getElementById('set-detail-body').innerHTML = '<div id="set-detail-placeholder"><div class="ph-icon">⏳</div><p>Chargement de l\'environnement...</p></div>';
  document.getElementById('set-detail-hdr').style.display = 'none';
  // Recharger depuis DB pour l'env choisi
  await chargerDonnees(slug);
  updateCounters();
  switchEntity('teams');
}
window.switchEnv = switchEnv;

document.addEventListener('DOMContentLoaded', async () => {
  await chargerDonnees();
  updateCounters();
  switchEntity('teams');
});

