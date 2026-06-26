// APS — server/routes/sync-engine.js — 2026-06-25 13:00
// Moteur de synchronisation Iconik — exécution côté serveur
//
// Principe : zéro localStorage. Toutes les données vont en DB via Prisma.
// Chaque sync crée un IkonSnapshot immutable rattaché à un SyncJob.
// Le frontend ne fait que piloter (POST /api/jobs/sync) et observer (GET /api/jobs/:id).

'use strict';

// ─────────────────────────────────────────────
// HELPERS FETCH ICONIK
// ─────────────────────────────────────────────

/**
 * Fetch paginé générique — ramène tous les objets d'un endpoint Iconik.
 * @param {string} base     — URL de base ex: "https://app.iconik.io"
 * @param {Object} headers  — { 'App-ID': ..., 'Auth-Token': ... }
 * @param {string} path     — ex: "/API/users/v1/teams/?per_page=500"
 * @param {Function} getter — (responseJson) => array
 */
async function ikFetchAll(base, headers, path, getter) {
  const out = [];
  // Extraire per_page du path pour la pagination
  const perMatch = path.match(/per_page=(\d+)/);
  const per = perMatch ? parseInt(perMatch[1]) : 500;
  let page = 1;
  const sep = path.includes('?') ? '&' : '?';

  while (true) {
    const url = `${base}${path}${sep}page=${page}`;
    const r = await fetch(url, { headers }).catch(() => null);
    if (!r || !r.ok) break;
    const j = await r.json().catch(() => ({}));
    const items = getter(j) || [];
    out.push(...items);
    const pages = j.pages || 0;
    if (pages && page >= pages) break;
    if (!pages && items.length < per) break;
    if (++page > 500) break; // guard
  }
  return out;
}

/**
 * Fetch paginé via POST (search Iconik).
 */
async function ikSearchAll(base, headers, path, body, getter) {
  const out = [];
  const per = body.per_page || 150;
  let page = 1;
  const h = Object.assign({}, headers, { 'Content-Type': 'application/json' });

  while (true) {
    const url = `${base}${path}?per_page=${per}&page=${page}`;
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) }).catch(() => null);
    if (!r || !r.ok) break;
    const j = await r.json().catch(() => ({}));
    const items = (getter ? getter(j) : j.objects) || [];
    if (!j.objects?.length) break;
    out.push(...items);
    const pages = j.pages || 0;
    if (pages && page >= pages) break;
    if (!pages && items.length < per) break;
    if (++page > 500) break;
  }
  return out;
}

/**
 * Fetch en parallèle par batches avec gestion d'erreur individuelle.
 */
async function ikBatchFetch(base, headers, ids, pathFn, batchSize = 12) {
  const results = {};
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      chunk.map(id => fetch(`${base}${pathFn(id)}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
      )
    );
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value != null) results[chunk[idx]] = res.value;
    });
  }
  return results;
}

// ─────────────────────────────────────────────
// MAPPING TYPES DE CHAMPS
// ─────────────────────────────────────────────

function mapFieldTypeToUI(t) {
  const x = String(t || '').toLowerCase();
  if (['string'].includes(x)) return 'Text';
  if (['text', 'textarea', 'multiline'].includes(x)) return 'Text Area';
  if (['integer', 'int', 'long'].includes(x)) return 'Integer';
  if (['float', 'double', 'number', 'decimal'].includes(x)) return 'Float';
  if (['boolean', 'bool'].includes(x)) return 'Yes/No';
  if (['date'].includes(x)) return 'Date';
  if (['datetime', 'timestamp', 'datetimeutc'].includes(x)) return 'Datetime';
  if (['dropdown', 'select', 'choice', 'choices', 'enum', 'picklist',
       'single_select', 'single-select', 'list'].includes(x)) return 'Dropdown';
  if (['tag', 'tags', 'tag_cloud', 'tagcloud', 'labels', 'label'].includes(x)) return 'Tag Cloud';
  if (['email', 'mail'].includes(x)) return 'Email';
  if (['url', 'link', 'uri'].includes(x)) return 'Url';
  return '';
}

function extractFieldOptions(f) {
  if (Array.isArray(f?.options)) {
    return f.options.map(c => typeof c === 'string' ? c : (c.label || c.value || c.name || c.key || '')).filter(Boolean);
  }
  const o = (f && typeof f === 'object' && !Array.isArray(f)) ? (f.options || {}) : {};
  const choices = o.options || o.choices || f?.allowed_values || f?.values || [];
  return Array.isArray(choices)
    ? choices.map(c => typeof c === 'string' ? c : (c.label || c.value || c.name || c.key || '')).filter(Boolean)
    : [];
}

function extractFieldMulti(f) {
  if (typeof f?.multi === 'boolean') return f.multi;
  const o = (f && typeof f === 'object' && !Array.isArray(f)) ? (f.options || {}) : {};
  return !!(o.multiselect || o['multi_select'] || o['is_multi_value'] || o['is_array'] || (o.cardinality > 1));
}

// ─────────────────────────────────────────────
// CONSTRUCTION DU CHEMIN COLLECTION
// ─────────────────────────────────────────────

function buildCollectionPaths(rawCols) {
  const byId = {};
  rawCols.forEach(c => { if (c?.id) byId[c.id] = c; });
  const cache = {};

  function getPath(id, depth = 0) {
    if (cache[id]) return cache[id];
    if (depth > 25) return id;
    const c = byId[id];
    if (!c) return id;
    const name = (c.title || c.name || id).trim();
    const pid = c.parent_id || (Array.isArray(c.in_collections) && c.in_collections[0]) || null;
    if (!pid || !byId[pid]) return (cache[id] = name);
    return (cache[id] = getPath(pid, depth + 1) + ' / ' + name);
  }

  return rawCols.map(c => ({
    ...c,
    _path: getPath(c.id),
  }));
}

// ─────────────────────────────────────────────
// SCOPES — FONCTIONS D'EXTRACTION PAR TYPE
// ─────────────────────────────────────────────

async function fetchCollections(base, headers) {
  const raw = await ikSearchAll(base, headers, '/API/search/v1/search/', { doc_types: ['collections'], per_page: 150 },
    j => (j.objects || []).filter(c => (!c.status || c.status === 'ACTIVE') && !c.date_deleted)
  );
  return buildCollectionPaths(raw);
}

async function fetchMetadataViews(base, headers) {
  return ikFetchAll(base, headers, '/API/metadata/v1/views/?per_page=500', r => r.objects || []);
}

async function fetchViewFields(base, headers, viewId) {
  // Les view_fields sont inclus dans la réponse de la vue complète
  // L'endpoint /views/{id}/fields/ n'existe pas sur toutes les instances Iconik
  try {
    const r = await fetch(`${base}/API/metadata/v1/views/${viewId}/`, { headers });
    if (!r.ok) return [];
    const j = await r.json();
    return j.view_fields || [];
  } catch { return []; }
}

async function fetchMetadataFields(base, headers) {
  return ikFetchAll(base, headers, '/API/metadata/v1/fields/?per_page=500', r => r.objects || []);
}

async function fetchRoleGroups(base, headers) {
  return ikFetchAll(base, headers, '/API/users/v1/role_groups/?per_page=500', r => r.objects || []);
}

async function fetchTeams(base, headers) {
  let teams = [];
  try {
    teams = await ikFetchAll(base, headers, '/API/users/v1/teams/?per_page=500', r => r.objects || []);
  } catch (_) {}
  if (!teams.length) {
    try {
      const groups = await ikFetchAll(base, headers, '/API/users/v1/groups/?per_page=500', r => r.objects || []);
      teams = groups.filter(g => String(g?.group_type || '').toUpperCase().trim() === 'TEAM');
    } catch (_) {}
  }
  return teams;
}

async function fetchUsers(base, headers) {
  return ikFetchAll(base, headers, '/API/users/v1/users/?per_page=500', r => r.objects || []);
}

async function fetchSavedSearches(base, headers) {
  return ikFetchAll(base, headers, '/API/search/v1/search/saved/?per_page=500', r => r.objects || []);
}

async function fetchStorages(base, headers) {
  const list = await ikFetchAll(base, headers, '/API/files/v1/storages/?per_page=500', r => r.objects || []);
  const details = await ikBatchFetch(base, headers, list.map(s => s.id),
    id => `/API/files/v1/storages/${id}/`, 8
  );
  return list.map(s => details[s.id] || s);
}

async function fetchCategories(base, headers) {
  const endpoints = [
    { type: 'assets',         ep: '/API/metadata/v1/assets/categories/?per_page=500' },
    { type: 'collections',    ep: '/API/metadata/v1/collections/categories/?per_page=500' },
    { type: 'segments',       ep: '/API/metadata/v1/segments/categories/?per_page=500' },
    { type: 'custom_actions', ep: '/API/metadata/v1/custom_actions/categories/?per_page=500' },
  ];
  const byApiName = new Map();
  for (const { type, ep } of endpoints) {
    const list = await ikFetchAll(base, headers, ep, r => r.objects || []).catch(() => []);
    list.forEach(cat => {
      const key = String(cat.api_name || cat.name || '').toLowerCase().trim();
      if (!key || key === 'none') return;
      const cur = byApiName.get(key) || { id: cat.id || '', name: cat.name || '', label: cat.label || cat.name || '', api_name: key, object_types: [], view_ids: [], rawByType: {} };
      if (!cur.object_types.includes(type)) cur.object_types.push(type);
      (cat.view_ids || []).forEach(vid => { if (vid && !cur.view_ids.includes(vid)) cur.view_ids.push(vid); });
      cur.rawByType[type] = cat;
      if (cat.label && cat.label.length > (cur.label || '').length) cur.label = cat.label;
      byApiName.set(key, cur);
    });
  }
  return Array.from(byApiName.values());
}

async function fetchWebhooks(base, headers) {
  return ikFetchAll(base, headers, '/API/notifications/v1/webhooks/?per_page=500', r => r.objects || []);
}

async function fetchAutomations(base, headers) {
  return ikFetchAll(base, headers, '/API/automations/v1/automations/?per_page=500', r => r.objects || []);
}

async function fetchCustomActions(base, headers) {
  return ikFetchAll(base, headers, '/API/assets/v1/custom_actions/?per_page=500', r => r.objects || []);
}

async function fetchApps(base, headers) {
  return ikFetchAll(base, headers, '/API/auth/v1/apps/?per_page=500', r => r.objects || []);
}

async function fetchRelationTypes(base, headers) {
  const all = await ikFetchAll(base, headers, '/API/assets/v1/assets/relation_types/?per_page=500', r => r.objects || []);
  return all.filter(o => !o.is_system);
}

async function fetchSystemSettings(base, headers) {
  try {
    const r = await fetch(`${base}/API/settings/v1/merged/current/`, { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchExportLocations(base, headers) {
  return ikFetchAll(base, headers, '/API/files/v1/export_locations/?per_page=500', r => r.objects || []);
}

async function fetchRoles(base, headers) {
  return ikFetchAll(base, headers, '/API/auth/v1/roles/?per_page=500', r => r.objects || []).catch(() => []);
}

// ACLs Collections → par team
async function fetchCollectionAcls(base, headers, collections) {
  const aclById = await ikBatchFetch(base, headers, collections.map(c => c.id),
    id => `/API/acls/v1/acl/collections/${id}/`, 12
  );
  return aclById;
}

// ACLs MetadataViews
async function fetchViewAcls(base, headers, views) {
  return ikBatchFetch(base, headers, views.map(v => v.id),
    id => `/API/acls/v1/acl/metadata_views/${id}/`, 12
  );
}

// ACLs SavedSearches
async function fetchSavedSearchAcls(base, headers, searches) {
  return ikBatchFetch(base, headers, searches.map(s => s.id),
    id => `/API/acls/v1/acl/saved_searches/${id}/`, 12
  );
}

// ACLs Storages
async function fetchStorageAcls(base, headers, storages) {
  return ikBatchFetch(base, headers, storages.map(s => s.id),
    id => `/API/acls/v1/acl/storages/${id}/`, 12
  );
}

// Team Settings
async function fetchTeamSettings(base, headers, teams) {
  return ikBatchFetch(base, headers, teams.filter(t => t.id).map(t => t.id),
    id => `/API/settings/v1/team/${id}/`, 8
  );
}

// Team ACLs
async function fetchTeamAcls(base, headers, teams) {
  return ikBatchFetch(base, headers, teams.filter(t => t.id).map(t => t.id),
    id => `/API/acls/v1/acl/groups/${id}/`, 8
  );
}

// CustomAction ACLs
async function fetchCustomActionAcls(base, headers, customActions) {
  return ikBatchFetch(base, headers, customActions.map(ca => ca.id),
    id => `/API/acls/v1/acl/custom_actions/${id}/`, 12
  );
}

// ─────────────────────────────────────────────
// ÉCRITURE EN DB — PAR SCOPE
// ─────────────────────────────────────────────

async function writeCollections(prisma, snapshotId, collections) {
  if (!collections.length) return;
  await prisma.ikonCollection.deleteMany({ where: { snapshotId } });
  await prisma.ikonCollection.createMany({
    data: collections.map(c => ({
      snapshotId,
      iconikId:   c.id,
      title:      c.title || '',
      parentId:   c.parent_id || (Array.isArray(c.in_collections) && c.in_collections[0]) || null,
      path:       c._path || null,
      status:     c.status || null,
      storageId:  c.storage_id || null,
      externalId: c.external_id || null,
      isRoot:     c.is_root || false,
      objectType: c.object_type || 'collection',
      dateDeleted: c.date_deleted ? new Date(c.date_deleted) : null,
      rawData:    c,
    })),
    skipDuplicates: true,
  });
}

async function writeMetadataViews(prisma, snapshotId, views, viewFieldsMap) {
  if (!views.length) return;
  await prisma.ikonMetadataView.deleteMany({ where: { snapshotId } });
  await prisma.ikonMetadataView.createMany({
    data: views.map(v => ({
      snapshotId,
      iconikId:   v.id,
      name:       v.name || v.id,
      isSystem:   ['segment tags', 'tutorials'].includes(String(v.name || '').toLowerCase()),
      viewFields: viewFieldsMap[v.id] || [],
      rawData:    v,
    })),
    skipDuplicates: true,
  });
}

async function writeFields(prisma, snapshotId, fields) {
  if (!fields.length) return;
  await prisma.ikonField.deleteMany({ where: { snapshotId } });
  await prisma.ikonField.createMany({
    data: fields.map(f => {
      let uiType = mapFieldTypeToUI(f.field_type);
      if (!uiType && Array.isArray(f?.options) && f.options.length) uiType = 'Dropdown';
      return {
        snapshotId,
        iconikId:   f.id || f.name,
        name:       f.name,
        label:      f.label || '',
        fieldType:  f.field_type || null,
        uiType:     uiType || null,
        isMultiple: extractFieldMulti(f),
        isMandatory: !!f.required,
        options:    extractFieldOptions(f).map(v => ({ label: v, value: v })),
        rawData:    f,
      };
    }),
    skipDuplicates: true,
  });
}

async function writeRoleGroups(prisma, snapshotId, roleGroups) {
  if (!roleGroups.length) return;
  await prisma.ikonRoleGroup.deleteMany({ where: { snapshotId } });
  await prisma.ikonRoleGroup.createMany({
    data: roleGroups.map(rg => ({
      snapshotId,
      iconikId:      rg.id,
      name:          rg.name || '',
      description:   rg.description || null,
      roles:         rg.roles || [],
      roleCategories: rg.role_categories || {},
      rawData:       rg,
    })),
    skipDuplicates: true,
  });
}

async function writeTeams(prisma, snapshotId, teams, {
  colAcls = {}, viewAcls = {}, ssAcls = {}, stAcls = {}, caAcls = {},
  teamSettings = {}, teamAclsMap = {}, collections = [], views = [], searches = [], storages = []
} = {}) {
  if (!teams.length) return;

  // Index pour résolution rapide
  const colById = {};
  collections.forEach(c => { if (c?.id) colById[c.id] = c; });
  const viewById = {};
  views.forEach(v => { if (v?.id) viewById[v.id] = v; });

  // Construire les relations ACL par team
  const teamCollections = {};
  const teamViews = {};
  const teamSearches = {};
  const teamStorages = {};

  // Collections ACLs
  // Règle de fusion : si une collection apparaît dans plusieurs buckets (direct/inherited/propagates)
  // pour la même team, on fusionne en une seule entrée avec tous les flags.
  // Priorité du flag principal : propagates > direct > inherited.
  Object.entries(colAcls).forEach(([colId, aclData]) => {
    if (!aclData) return;
    const col = colById[colId];
    const entries = [
      ...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' })),
      ...(aclData.inherited_groups_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
      ...(aclData.propagating_groups_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
    ];
    // Fusionner par group_id — une seule entrée par team par collection
    const byGroup = {};
    entries.forEach(ga => {
      const gid = ga.group_id;
      if (!byGroup[gid]) {
        byGroup[gid] = { group_id: gid, permissions: [], origins: [] };
      }
      (ga.permissions || []).forEach(p => {
        const ps = String(p).toLowerCase();
        if (!byGroup[gid].permissions.includes(ps)) byGroup[gid].permissions.push(ps);
      });
      if (!byGroup[gid].origins.includes(ga._origin)) byGroup[gid].origins.push(ga._origin);
    });
    Object.values(byGroup).forEach(merged => {
      const p = merged.permissions;
      const perm = (p.includes('write') || p.includes('delete') || p.includes('change-acl')) ? 'Read & Write' : 'Read Only';
      // Flag principal : propagates > direct > inherited
      const mainOrigin = merged.origins.includes('propagates') ? 'propagates'
        : merged.origins.includes('direct') ? 'direct'
        : 'inherited';
      const flags = [...p, mainOrigin];
      if (!teamCollections[merged.group_id]) teamCollections[merged.group_id] = [];
      teamCollections[merged.group_id].push({ id: colId, nom: col?.title || colId, permission: perm, permission_flags: flags, _path: col?._path || colId });
    });
  });

  // Views ACLs — même logique de fusion que collections
  Object.entries(viewAcls).forEach(([viewId, aclData]) => {
    if (!aclData) return;
    const view = viewById[viewId];
    const entries = [
      ...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' })),
      ...(aclData.inherited_groups_acl || []).map(e => ({ ...e, _origin: 'inherited' })),
      ...(aclData.propagating_groups_acl || []).map(e => ({ ...e, _origin: 'propagates' })),
    ];
    const byGroup = {};
    entries.forEach(ga => {
      if (!byGroup[ga.group_id]) byGroup[ga.group_id] = { group_id: ga.group_id, permissions: [], origins: [] };
      (ga.permissions || []).forEach(p => { const ps = String(p).toLowerCase(); if (!byGroup[ga.group_id].permissions.includes(ps)) byGroup[ga.group_id].permissions.push(ps); });
      if (!byGroup[ga.group_id].origins.includes(ga._origin)) byGroup[ga.group_id].origins.push(ga._origin);
    });
    Object.values(byGroup).forEach(merged => {
      const p = merged.permissions;
      const perm = (p.includes('write') || p.includes('delete')) ? 'Read & Write' : 'Read Only';
      const mainOrigin = merged.origins.includes('propagates') ? 'propagates' : merged.origins.includes('direct') ? 'direct' : 'inherited';
      if (!teamViews[merged.group_id]) teamViews[merged.group_id] = [];
      teamViews[merged.group_id].push({ id: viewId, nom: view?.name || viewId, permission: perm, permission_flags: [...p, mainOrigin] });
    });
  });

  // SavedSearch ACLs
  Object.entries(ssAcls).forEach(([ssId, aclData]) => {
    if (!aclData) return;
    const entries = [...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' }))];
    entries.forEach(ga => {
      if (!teamSearches[ga.group_id]) teamSearches[ga.group_id] = [];
      teamSearches[ga.group_id].push({ id: ssId });
    });
  });

  // Storage ACLs
  Object.entries(stAcls).forEach(([stId, aclData]) => {
    if (!aclData) return;
    const entries = [...(aclData.groups_acl || []).map(e => ({ ...e, _origin: 'direct' }))];
    entries.forEach(ga => {
      if (!teamStorages[ga.group_id]) teamStorages[ga.group_id] = [];
      teamStorages[ga.group_id].push({ id: stId });
    });
  });

  await prisma.ikonTeam.deleteMany({ where: { snapshotId } });
  await prisma.ikonTeam.createMany({
    data: teams.map(t => ({
      snapshotId,
      iconikId:     t.id,
      name:         t.name || t.title || t.id || '',
      description:  t.description || null,
      isSystem:     ['everyone', 'administrator'].includes(String(t.name || '').toLowerCase()),
      isAclStub:    !!(t.acl_stub || (t.raw && t.raw.acl_stub)),
      userIds:      [],   // rempli lors du scope users
      roleGroupIds: [],
      collectionIds: teamCollections[t.id] || [],
      viewIds:       teamViews[t.id] || [],
      storageIds:    teamStorages[t.id] || [],
      settings:      teamSettings[t.id] || null,
      aclFlags:      teamAclsMap[t.id] ? { groups_acl: teamAclsMap[t.id].groups_acl || [] } : null,
      rawData:       t,
    })),
    skipDuplicates: true,
  });
}

async function writeUsers(prisma, snapshotId, users) {
  if (!users.length) return;
  await prisma.ikonUser.deleteMany({ where: { snapshotId } });
  await prisma.ikonUser.createMany({
    data: users.map(u => {
      const firstName = String(u.first_name || '').trim();
      const lastName  = String(u.last_name  || '').trim();
      const displayName = (firstName + ' ' + lastName).trim() || u.email || u.id;
      return {
        snapshotId,
        iconikId:    u.id,
        email:       u.email || '',
        firstName:   firstName || null,
        lastName:    lastName  || null,
        displayName,
        status:      u.status || null,
        userType:    u.type   || null,
        teamIds:     (u.groups || []).map(g => ({ id: String(g) })),
        roleGroupIds: [],
        rawData:     u,
      };
    }),
    skipDuplicates: true,
  });
}

async function writeSavedSearches(prisma, snapshotId, searches) {
  if (!searches.length) return;
  await prisma.ikonSavedSearch.deleteMany({ where: { snapshotId } });
  await prisma.ikonSavedSearch.createMany({
    data: searches.map(o => ({
      snapshotId,
      iconikId:      o.id,
      name:          o.name || o.title || '',
      criteria:      o.criteria || o.search_criteria || null,
      shareWithTeams: [],
      rawData:       o,
    })),
    skipDuplicates: true,
  });
}

async function writeStorages(prisma, snapshotId, storages, stAcls = {}) {
  if (!storages.length) return;
  await prisma.ikonStorage.deleteMany({ where: { snapshotId } });
  await prisma.ikonStorage.createMany({
    data: storages.map(s => {
      const acl = stAcls[s.id] || {};
      const teamIds = [
        ...(acl.groups_acl || []).map(g => ({ id: g.group_id, permissions: g.permissions || [], _origin: 'direct' })),
        ...(acl.propagating_groups_acl || []).map(g => ({ id: g.group_id, permissions: g.permissions || [], _origin: 'propagates' })),
        ...(acl.inherited_groups_acl || []).map(g => ({ id: g.group_id, permissions: g.permissions || [], _origin: 'inherited' })),
      ];
      return {
        snapshotId,
        iconikId:      s.id,
        name:          s.name || '',
        storageType:   s.storage_type || null,
        status:        s.status || null,
        scannerStatus: s.scanner_status || null,
        purpose:       s.purpose || null,
        teamIds,
        rawData:       s,
      };
    }),
    skipDuplicates: true,
  });
}

async function writeCategories(prisma, snapshotId, categories) {
  if (!categories.length) return;
  await prisma.ikonCategory.deleteMany({ where: { snapshotId } });
  await prisma.ikonCategory.createMany({
    data: categories.map(c => ({
      snapshotId,
      iconikId:    c.id || null,
      name:        c.name || c.label || '',
      apiName:     c.api_name || c.name || '',
      isSystem:    ['generic', 'tag', 'default'].includes(String(c.api_name || c.name || '').toLowerCase()),
      objectTypes: c.object_types || [],
      viewIds:     c.view_ids || [],
      rawData:     c,
    })),
    skipDuplicates: true,
  });
}

async function writeWebhooks(prisma, snapshotId, webhooks) {
  if (!webhooks.length) return;
  await prisma.ikonWebhook.deleteMany({ where: { snapshotId } });
  await prisma.ikonWebhook.createMany({
    data: webhooks.map(o => ({
      snapshotId,
      iconikId:  o.id,
      name:      o.name || '',
      url:       o.url || null,
      eventType: o.event_type || null,
      realm:     o.realm || null,
      operation: o.operation || null,
      status:    o.status || null,
      headers:   Array.isArray(o.headers) ? o.headers : Object.entries(o.headers || {}).map(([k, v]) => ({ key: k, value: v })),
      rawData:   o,
    })),
    skipDuplicates: true,
  });
}

async function writeAutomations(prisma, snapshotId, automations) {
  if (!automations.length) return;
  await prisma.ikonAutomation.deleteMany({ where: { snapshotId } });
  await prisma.ikonAutomation.createMany({
    data: automations.map(a => ({
      snapshotId,
      iconikId:   a.id,
      name:       a.name || a.id || '',
      eventType:  (a.triggers && a.triggers[0]?.type) || null,
      isActive:   String(a.status || '').toUpperCase() === 'ACTIVE',
      actions:    Array.isArray(a.actions) ? a.actions : [],
      conditions: a.conditions || null,
      rawData:    a,
    })),
    skipDuplicates: true,
  });
}

async function writeCustomActions(prisma, snapshotId, customActions) {
  if (!customActions.length) return;
  await prisma.ikonCustomAction.deleteMany({ where: { snapshotId } });
  await prisma.ikonCustomAction.createMany({
    data: customActions.map(o => ({
      snapshotId,
      iconikId:   o.id,
      title:      o.title || o.name || '',
      objectTypes: o.object_types || [],
      url:        o.url || null,
      method:     o.type || 'POST',
      teamIds:    [],
      rawData:    o,
    })),
    skipDuplicates: true,
  });
}

async function writeRelationTypes(prisma, snapshotId, relationTypes) {
  if (!relationTypes.length) return;
  await prisma.ikonRelationType.createMany({
    data: relationTypes.map(o => ({
      snapshotId,
      iconikId:         o.id,
      name:             o.name || '',
      isDirectional:    !!o.is_directional,
      sourceLabel:      o.source_label || null,
      destinationLabel: o.destination_label || null,
      description:      o.description || null,
      rawData:          o,
    })),
    skipDuplicates: true,
  });
}

async function writeSystemSettings(prisma, snapshotId, settings) {
  if (!settings) return;
  await prisma.ikonSystemSettings.create({
    data: {
      snapshotId,
      shareSettings:    _pick(settings, ['default_share_options','share_expiration_time','external_share','allow_invites_by_link','allow_share_magic_link_creation','enforce_magic_link_allowlist','search_users_from_share']),
      searchSettings:   _pick(settings, ['search_in_transcriptions','search_default_sections','search_view_id','filters_default_metadata_view_id','search_results_asset_metadata_view_id','search_results_collection_metadata_view_id']),
      uploadSettings:   _pick(settings, ['default_upload_storage_id','required_metadata_views']),
      downloadSettings: _pick(settings, ['append_asset_uuid_to_downloads','use_asset_name_on_download']),
      aclSettings:      _pick(settings, ['acl_template_id','collections_get_parent_acls','hide_favourites']),
      rawData:          settings,
    },
  });
}

async function writeExportLocations(prisma, snapshotId, locations, base, headers) {
  if (!locations.length) return;
  await prisma.ikonExportLocation.deleteMany({ where: { snapshotId } });
  // Fetcher les ACLs pour chaque export location
  const BATCH = 8;
  const aclMap = {};
  for (let i = 0; i < locations.length; i += BATCH) {
    const chunk = locations.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(loc =>
        fetch(`${base}/API/acls/v1/acl/export_locations/${loc.id}/`, { headers })
          .then(r => r.ok ? r.json() : null).catch(() => null)
          .then(data => ({ id: loc.id, data }))
      )
    );
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value?.data) {
        aclMap[r.value.id] = r.value.data;
      }
    });
  }
  await prisma.ikonExportLocation.createMany({
    data: locations.map(o => ({
      snapshotId,
      iconikId:     o.id,
      name:         o.name || '',
      locationType: o.location_type || o.storage_type || null,
      status:       o.status || null,
      rawData:      o,
      aclData:      aclMap[o.id] || null,
    })),
    skipDuplicates: true,
  });
}

async function writeRoles(prisma, snapshotId, roles) {
  if (!roles.length) return;
  await prisma.ikonRole.createMany({
    data: roles.map(r => ({
      snapshotId,
      iconikId:    r.id || null,
      name:        r.name || r.slug || '',
      slug:        r.slug || null,
      category:    r.category || null,
      permissions: r.permissions || [],
      rawData:     r,
    })),
    skipDuplicates: true,
  });
}

async function writeApps(prisma, snapshotId, apps) {
  if (!apps.length) return;
  await prisma.ikonApp.deleteMany({ where: { snapshotId } });
  await prisma.ikonApp.createMany({
    data: apps.map(a => ({
      snapshotId,
      iconikId: a.id,
      name:     String(a.name || a.title || a.app_name || a.settings?.name || a.id || '').trim(),
      appType:  a.app_type || null,
      isActive: a.status !== 'INACTIVE',
      rawData:  a,
    })),
    skipDuplicates: true,
  });
}

function _pick(obj, keys) {
  if (!obj) return null;
  const out = {};
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return Object.keys(out).length ? out : null;
}

// ─────────────────────────────────────────────
// MOTEUR PRINCIPAL
// ─────────────────────────────────────────────

const SCOPE_ORDER = [
  // Ordre critique : les scopes référencés par teams (ACLs) doivent être avant teams
  'collections',    // requis par teams (ACLs collections)
  'metadataViews',  // requis par teams (ACLs views)
  'metadata',       // requis par _syncViewsToMetadata
  'roleGroups',
  'savedSearches',  // requis par teams (ACLs saved searches)
  'storages',       // requis par teams (ACLs storages)
  'customActions',  // requis par teams (ACLs custom actions)
  'teams',          // en dernier parmi les scopes ACL-dépendants
  'users',
  'categories',
  'webhooks',
  'automations',
  'relationTypes',
  'systemSettings',
  'exportLocations',
  'roles',
  'apps',
];

/**
 * Point d'entrée principal du moteur de sync.
 * Appelé par la route Express après création du SyncJob.
 *
 * @param {Object} opts
 * @param {Object} opts.prisma       — instance PrismaClient
 * @param {string} opts.jobId        — ID du SyncJob en DB
 * @param {Object} opts.env          — enregistrement Environment (avec appId, tokenEnc déchiffré → token)
 * @param {string[]} opts.scopes     — scopes à synchroniser, ou ['all']
 * @param {Function} opts.onProgress — callback(scopeId, done, total)
 * @param {Function} opts.log        — callback(level, msg)
 */
async function runSyncDS(opts) {
  const { prisma, jobId, env, scopes: requestedScopes, onProgress, log } = opts;

  const doAll   = requestedScopes.includes('all');
  const active  = doAll ? [...SCOPE_ORDER] : requestedScopes.filter(s => SCOPE_ORDER.includes(s));
  const total   = active.length;
  let   done    = 0;

  const base    = (env.baseUrl || 'https://app.iconik.io').replace(/\/$/, '');
  const headers = { 'App-ID': env.appId, 'Auth-Token': env.token };

  log('info', `Sync DS démarrée — env: ${env.name} — scopes: ${active.join(', ')}`);

  let snapshotId;

  if (doAll) {
    // ── Sync complète : nouveau snapshot ──────────────────────────────────
    await prisma.ikonSnapshot.updateMany({
      where: { envId: env.id, isCurrent: true },
      data:  { isCurrent: false },
    });
    const snapshot = await prisma.ikonSnapshot.create({
      data: {
        jobId,
        envId:         env.id,
        scope:         'all',
        iconikBaseUrl: base,
        isCurrent:     true,
      },
    });
    snapshotId = snapshot.id;
    log('info', `Snapshot créé : ${snapshotId}`);
  } else {
    // ── Sync partielle : réutiliser le snapshot courant ───────────────────
    // On met à jour uniquement les scopes demandés, le reste reste intact.
    const existing = await prisma.ikonSnapshot.findFirst({
      where:   { envId: env.id, isCurrent: true },
      orderBy: { capturedAt: 'desc' },
    });
    if (!existing) {
      // Pas de snapshot courant — on en crée un nouveau
      const snapshot = await prisma.ikonSnapshot.create({
        data: {
          jobId,
          envId:         env.id,
          scope:         active.join(','),
          iconikBaseUrl: base,
          isCurrent:     true,
        },
      });
      snapshotId = snapshot.id;
      log('info', `Snapshot créé (partiel) : ${snapshotId}`);
    } else {
      snapshotId = existing.id;
      // Mettre à jour le jobId et la date
      await prisma.ikonSnapshot.update({
        where: { id: snapshotId },
        data:  { jobId, capturedAt: new Date() },
      });
      log('info', `Snapshot existant réutilisé : ${snapshotId} — mise à jour scopes: ${active.join(', ')}`);
    }
  }

  // ── Données partagées entre scopes ────────────────────────────────────
  let collections   = [];
  let views         = [];
  let fields        = [];
  let teams         = [];
  let searches      = [];
  let storages      = [];
  let customActions = [];

  // ── Exécution scope par scope ──────────────────────────────────────────
  for (const scope of active) {
    log('info', `→ ${scope}…`);
    onProgress(scope, done, total);

    try {
      switch (scope) {

        case 'collections': {
          collections = await fetchCollections(base, headers);
          await writeCollections(prisma, snapshotId, collections);
          log('info', `  collections : ${collections.length} objets`);
          break;
        }

        case 'metadataViews': {
          views = await fetchMetadataViews(base, headers);
          // Fetch view_fields pour chaque vue
          const viewFieldsMap = {};
          for (let i = 0; i < views.length; i += 12) {
            const chunk = views.slice(i, i + 12);
            const results = await Promise.allSettled(
              chunk.map(v => fetchViewFields(base, headers, v.id).then(f => ({ id: v.id, fields: f })))
            );
            results.forEach(r => { if (r.status === 'fulfilled' && r.value != null) viewFieldsMap[r.value.id] = r.value.fields; });
          }
          await writeMetadataViews(prisma, snapshotId, views, viewFieldsMap);
          log('info', `  metadataViews : ${views.length} vues`);
          break;
        }

        case 'metadata': {
          fields = await fetchMetadataFields(base, headers);
          await writeFields(prisma, snapshotId, fields);
          log('info', `  fields : ${fields.length} champs`);
          break;
        }

        case 'roleGroups': {
          const rgs = await fetchRoleGroups(base, headers);
          await writeRoleGroups(prisma, snapshotId, rgs);
          log('info', `  roleGroups : ${rgs.length}`);
          break;
        }

        case 'teams': {
          teams = await fetchTeams(base, headers);
          // ACLs parallèles
          const [colAcls, viewAcls, ssAcls, stAcls, caAcls, teamSettings, teamAclsMap] = await Promise.all([
            collections.length ? fetchCollectionAcls(base, headers, collections) : Promise.resolve({}),
            views.length       ? fetchViewAcls(base, headers, views)             : Promise.resolve({}),
            searches.length    ? fetchSavedSearchAcls(base, headers, searches)   : Promise.resolve({}),
            storages.length    ? fetchStorageAcls(base, headers, storages)       : Promise.resolve({}),
            customActions.length ? fetchCustomActionAcls(base, headers, customActions) : Promise.resolve({}),
            fetchTeamSettings(base, headers, teams),
            fetchTeamAcls(base, headers, teams),
          ]);
          const colAclCount = Object.keys(colAcls).length;
          const viewAclCount = Object.keys(viewAcls).length;
          log('info', `  ACLs fetchées — collections: ${colAclCount}, views: ${viewAclCount}`);
          await writeTeams(prisma, snapshotId, teams, { colAcls, viewAcls, ssAcls, stAcls, caAcls, teamSettings, teamAclsMap, collections, views, searches, storages });
          log('info', `  teams : ${teams.length}`);
          break;
        }

        case 'users': {
          const users = await fetchUsers(base, headers);
          await writeUsers(prisma, snapshotId, users);
          log('info', `  users : ${users.length}`);
          break;
        }

        case 'savedSearches': {
          searches = await fetchSavedSearches(base, headers);
          await writeSavedSearches(prisma, snapshotId, searches);
          log('info', `  savedSearches : ${searches.length}`);
          break;
        }

        case 'storages': {
          storages = await fetchStorages(base, headers);
          const stAcls = storages.length ? await fetchStorageAcls(base, headers, storages) : {};
          await writeStorages(prisma, snapshotId, storages, stAcls);
          log('info', `  storages : ${storages.length}`);
          break;
        }

        case 'categories': {
          const cats = await fetchCategories(base, headers);
          await writeCategories(prisma, snapshotId, cats);
          log('info', `  categories : ${cats.length}`);
          break;
        }

        case 'webhooks': {
          const wh = await fetchWebhooks(base, headers);
          await writeWebhooks(prisma, snapshotId, wh);
          log('info', `  webhooks : ${wh.length}`);
          break;
        }

        case 'automations': {
          const autos = await fetchAutomations(base, headers);
          await writeAutomations(prisma, snapshotId, autos);
          log('info', `  automations : ${autos.length}`);
          break;
        }

        case 'customActions': {
          customActions = await fetchCustomActions(base, headers);
          await writeCustomActions(prisma, snapshotId, customActions);
          log('info', `  customActions : ${customActions.length}`);
          break;
        }

        case 'relationTypes': {
          const rt = await fetchRelationTypes(base, headers);
          await writeRelationTypes(prisma, snapshotId, rt);
          log('info', `  relationTypes : ${rt.length}`);
          break;
        }

        case 'systemSettings': {
          const ss = await fetchSystemSettings(base, headers);
          await writeSystemSettings(prisma, snapshotId, ss);
          log('info', '  systemSettings : OK');
          break;
        }

        case 'exportLocations': {
          const locs = await fetchExportLocations(base, headers);
          await writeExportLocations(prisma, snapshotId, locs, base, headers);
          log('info', `  exportLocations : ${locs.length}`);
          break;
        }

        case 'roles': {
          const roles = await fetchRoles(base, headers);
          await writeRoles(prisma, snapshotId, roles);
          log('info', `  roles : ${roles.length}`);
          break;
        }

        case 'apps': {
          const apps = await fetchApps(base, headers);
          await writeApps(prisma, snapshotId, apps);
          log('info', `  apps : ${apps.length}`);
          break;
        }
      }

    } catch (err) {
      log('warn', `  ⚠ ${scope} échoué : ${err.message || err}`);
      // On continue — un scope en erreur ne bloque pas les autres
    }

    done++;
    onProgress(scope, done, total);
  }

  // ── Mettre à jour objectCount sur le snapshot ──────────────────────────
  await prisma.ikonSnapshot.update({
    where: { id: snapshotId },
    data:  { objectCount: collections.length + views.length + fields.length + teams.length },
  });

  log('info', `Sync DS terminée — snapshot ${snapshotId}`);
  return { snapshotId, done, total };
}

module.exports = { runSyncDS, SCOPE_ORDER };
