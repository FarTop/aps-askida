// APS — server/routes/ikon-data.js — 2026-06-27
// Lecture des données Iconik depuis les snapshots PostgreSQL
//
// Endpoints :
//   GET /api/ikon/snapshot/:envSlug/counts        — compteurs par entité (léger, page load)
//   GET /api/ikon/snapshot/:envSlug/:scope        — liste légère d'un scope
//   GET /api/ikon/snapshot/:envSlug/:scope/:id    — détail complet d'une entité
//   GET /api/ikon/snapshots/:envSlug              — historique des snapshots
//
// Contrat canonique — chaque entité expose :
//   - id, nom (unifié — pas de name/title dupliqués sauf compatibilité explicite)
//   - associations résolues ici, une seule fois, côté serveur
//   - script-settings.js consomme et affiche, ne résout rien
//
// Niveaux de lecture :
//   LIST  — champs légers pour affichage liste (id, nom, is_system, compteurs)
//   FULL  — entité complète avec toutes associations résolues

'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// HELPERS — résolution env + snapshot
// ─────────────────────────────────────────────

async function resolveEnv(envSlug) {
  return prisma.environment.findFirst({
    where: { OR: [{ slug: envSlug }, { type: envSlug }] },
    select: { id: true, name: true, slug: true, type: true },
  }).catch(() => null);
}

async function getCurrentSnapshot(envId) {
  return prisma.ikonSnapshot.findFirst({
    where:   { envId, isCurrent: true },
    orderBy: { capturedAt: 'desc' },
    select:  { id: true, scope: true, capturedAt: true, objectCount: true },
  }).catch(() => null);
}

// ─────────────────────────────────────────────
// HELPERS — index croisés (réutilisés par plusieurs readers)
// ─────────────────────────────────────────────

async function buildViewNameIndex(snapshotId) {
  const rows = await prisma.ikonMetadataView.findMany({
    where:  { snapshotId },
    select: { iconikId: true, name: true },
  });
  const idx = {};
  rows.forEach(r => { if (r.iconikId) idx[r.iconikId] = r.name; });
  return idx;
}

async function buildTeamNameIndex(snapshotId) {
  const rows = await prisma.ikonTeam.findMany({
    where:  { snapshotId },
    select: { iconikId: true, name: true },
  });
  const idx = {};
  rows.forEach(r => { if (r.iconikId) idx[r.iconikId] = r.name; });
  return idx;
}

// ─────────────────────────────────────────────
// READERS — COLLECTIONS
// ─────────────────────────────────────────────

async function readCollections(snapshotId) {
  const rows = await prisma.ikonCollection.findMany({
    where:   { snapshotId },
    orderBy: { path: 'asc' },
    select: {
      iconikId: true, title: true, parentId: true, path: true,
      status: true, storageId: true, externalId: true,
      isRoot: true, objectType: true, dateDeleted: true,
    },
  });
  return rows.map(r => ({
    id:           r.iconikId,
    nom:          r.title,
    parent_id:    r.parentId,
    _path:        r.path,
    status:       r.status,
    storage_id:   r.storageId,
    external_id:  r.externalId,
    is_root:      r.isRoot,
    object_type:  r.objectType,
    date_deleted: r.dateDeleted,
  }));
}

// ─────────────────────────────────────────────
// READERS — TEAMS
// ─────────────────────────────────────────────

// LIST — champs légers pour la liste gauche
async function readTeamsList(snapshotId) {
  const rows = await prisma.ikonTeam.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
    select:  { iconikId: true, name: true, isSystem: true, isAclStub: true,
               collectionIds: true, viewIds: true, storageIds: true, userIds: true },
  });
  return rows.map(r => ({
    id:          r.iconikId,
    nom:         r.name,
    is_system:   r.isSystem,
    is_acl_stub: r.isAclStub,
    // Compteurs pour affichage liste sans charger le détail
    _counts: {
      collections:  Array.isArray(r.collectionIds) ? r.collectionIds.length : 0,
      vues:         Array.isArray(r.viewIds)        ? r.viewIds.length        : 0,
      storages:     Array.isArray(r.storageIds)     ? r.storageIds.length     : 0,
      users:        Array.isArray(r.userIds)        ? r.userIds.length        : 0,
    },
  }));
}

// FULL — entité complète avec toutes associations résolues
async function readTeamDetail(snapshotId, iconikId) {
  const r = await prisma.ikonTeam.findFirst({
    where: { snapshotId, iconikId },
  });
  if (!r) return null;

  const collections = (Array.isArray(r.collectionIds) ? r.collectionIds : []).map(c => ({
    chemin:           c.id    || c.chemin || '',
    nom:              c.nom   || c.title  || c.chemin || c.id || '',
    permission:       c.permission        || 'Read Only',
    permission_flags: c.permission_flags  || [],
    _path:            c._path || c.nom    || '',
  }));

  const vues = (Array.isArray(r.viewIds) ? r.viewIds : []).map(v => ({
    id:               v.id   || '',
    nom:              v.nom  || v.name || '',
    permission:       v.permission        || 'Read Only',
    permission_flags: v.permission_flags  || [],
  }));

  const storages = (Array.isArray(r.storageIds) ? r.storageIds : []).map(s => ({
    id:  s.id  || '',
    nom: s.nom || s.name || '',
  }));

  const users = (Array.isArray(r.userIds) ? r.userIds : []).map(u => ({
    id:    u.id    || '',
    nom:   u.nom   || u.name || u.email || '',
    email: u.email || '',
  }));

  // roleGroupIds — associations Team↔RoleGroup depuis DB
  const roleGroups = (Array.isArray(r.roleGroupIds) ? r.roleGroupIds : []).map(rg => ({
    id:  rg.id   || '',
    nom: rg.name || rg.nom || '',
  }));

  return {
    id:                r.iconikId,
    nom:               r.name,
    description:       r.description,
    is_system:         r.isSystem,
    is_acl_stub:       r.isAclStub,
    collections,
    vues,
    storages,
    savedSearches:     [],   // TODO étape 2 — persistance ssAcls dans writeTeams
    customActions:     [],   // TODO étape 2 — persistance caAcls dans writeTeams
    roleGroups,
    users,
    settings:          r.settings,
    aclFlags:          r.aclFlags,
  };
}

// FULL LIST — rétrocompatibilité chargerDonnees() — sera retiré en Phase D
async function readTeams(snapshotId) {
  const rows = await prisma.ikonTeam.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => {
    const collections = (Array.isArray(r.collectionIds) ? r.collectionIds : []).map(c => ({
      chemin:           c.id    || c.chemin || '',
      nom:              c.nom   || c.title  || c.chemin || c.id || '',
      permission:       c.permission        || 'Read Only',
      permission_flags: c.permission_flags  || [],
      _path:            c._path || c.nom    || '',
    }));
    const vues = (Array.isArray(r.viewIds) ? r.viewIds : []).map(v => ({
      id:               v.id   || '',
      nom:              v.nom  || v.name || '',
      permission:       v.permission        || 'Read Only',
      permission_flags: v.permission_flags  || [],
    }));
    const storages = (Array.isArray(r.storageIds) ? r.storageIds : []).map(s => ({
      id:  s.id  || '',
      nom: s.nom || s.name || '',
    }));
    const users = (Array.isArray(r.userIds) ? r.userIds : []).map(u => ({
      id:    u.id    || '',
      nom:   u.nom   || u.name || u.email || '',
      email: u.email || '',
    }));
    const roleGroups = (Array.isArray(r.roleGroupIds) ? r.roleGroupIds : []).map(rg => ({
      id:  rg.id   || '',
      nom: rg.name || rg.nom || '',
    }));
    return {
      id:                r.iconikId,
      nom:               r.name,
      description:       r.description,
      is_system:         r.isSystem,
      is_acl_stub:       r.isAclStub,
      collections,
      vues,
      storages,
      savedSearches:     [],
      customActions:     [],
      roleGroups,
      roleGroups_doc_ids: roleGroups.map(rg => rg.id), // compat script-settings.js
      users,
      settings:          r.settings,
      aclFlags:          r.aclFlags,
    };
  });
}

// ─────────────────────────────────────────────
// READERS — USERS
// ─────────────────────────────────────────────

async function readUsers(snapshotId) {
  const rows = await prisma.ikonUser.findMany({
    where:   { snapshotId },
    orderBy: { email: 'asc' },
  });
  return rows.map(r => ({
    id:           r.iconikId,
    nom:          r.displayName,
    email:        r.email,
    first_name:   r.firstName,
    last_name:    r.lastName,
    display_name: r.displayName,
    status:       r.status,
    type:         r.userType,
    groups:       r.teamIds,
  }));
}

// ─────────────────────────────────────────────
// READERS — METADATA VIEWS
// ─────────────────────────────────────────────

async function readMetadataViews(snapshotId) {
  const rows = await prisma.ikonMetadataView.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });

  // Construire l'index inverse : viewId → teams qui y ont accès
  // Depuis IkonTeam.viewIds (déjà persisté avec nom + permission)
  const teamRows = await prisma.ikonTeam.findMany({
    where:  { snapshotId },
    select: { iconikId: true, name: true, viewIds: true },
  });
  const viewTeams = {}; // viewId → [{ id, nom, permission, permission_flags }]
  teamRows.forEach(t => {
    (Array.isArray(t.viewIds) ? t.viewIds : []).forEach(v => {
      if (!v.id) return;
      if (!viewTeams[v.id]) viewTeams[v.id] = [];
      viewTeams[v.id].push({
        id:               t.iconikId,
        nom:              t.name,
        permission:       v.permission        || 'Read Only',
        permission_flags: v.permission_flags  || [],
      });
    });
  });

  const viewFieldsById = {};
  const views = rows.map(r => {
    const viewFields = Array.isArray(r.viewFields) ? r.viewFields : [];
    viewFieldsById[r.iconikId] = viewFields;
    return {
      id:          r.iconikId,
      nom:         r.name,
      is_system:   r.isSystem,
      view_fields: viewFields,
      teams:       viewTeams[r.iconikId] || [],  // résolu depuis IkonTeam, pas hardcodé []
    };
  });
  return { views, viewFieldsById };
}

// ─────────────────────────────────────────────
// READERS — METADATA FIELDS
// ─────────────────────────────────────────────

async function readFields(snapshotId) {
  const rows = await prisma.ikonField.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:         r.iconikId,
    nom:        r.name,
    label:      r.label,
    field_type: r.fieldType,
    ui_type:    r.uiType,
    multi:      r.isMultiple,
    required:   r.isMandatory,
    options:    r.options,
  }));
}

// ─────────────────────────────────────────────
// READERS — ROLE GROUPS
// ─────────────────────────────────────────────

async function readRoleGroups(snapshotId) {
  const rows = await prisma.ikonRoleGroup.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });

  // Index inverse : roleGroupId → teams membres
  // Depuis IkonTeam.roleGroupIds
  const teamRows = await prisma.ikonTeam.findMany({
    where:  { snapshotId },
    select: { iconikId: true, name: true, roleGroupIds: true },
  });
  const rgTeams = {}; // rgId → [{ id, nom }]
  teamRows.forEach(t => {
    (Array.isArray(t.roleGroupIds) ? t.roleGroupIds : []).forEach(rg => {
      const rgId = rg.id || rg;
      if (!rgId) return;
      if (!rgTeams[rgId]) rgTeams[rgId] = [];
      rgTeams[rgId].push({ id: t.iconikId, nom: t.name });
    });
  });

  return rows.map(r => ({
    id:              r.iconikId,
    nom:             r.name,
    description:     r.description,
    roles:           r.roles,
    role_categories: r.roleCategories,
    teams:           rgTeams[r.iconikId] || [],  // résolu depuis IkonTeam
    teams_doc_ids:   (rgTeams[r.iconikId] || []).map(t => t.id), // compat script-settings.js
  }));
}

// ─────────────────────────────────────────────
// READERS — SAVED SEARCHES
// ─────────────────────────────────────────────

async function readSavedSearches(snapshotId) {
  const rows = await prisma.ikonSavedSearch.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:       r.iconikId,
    nom:      r.name,
    criteria: r.criteria,
  }));
}

// ─────────────────────────────────────────────
// READERS — STORAGES
// ─────────────────────────────────────────────

async function readStorages(snapshotId) {
  const rows = await prisma.ikonStorage.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });

  // Résoudre les teamIds (IDs Iconik) → noms via l'index teams
  const teamNameById = await buildTeamNameIndex(snapshotId);

  return rows.map(r => ({
    id:             r.iconikId,
    nom:            r.name,
    storage_type:   r.storageType,
    status:         r.status,
    scanner_status: r.scannerStatus,
    purpose:        r.purpose,
    // ACLs résolues — teamIds stocke [{ id, permissions, _origin }]
    teams: (Array.isArray(r.teamIds) ? r.teamIds : []).map(t => ({
      id:               t.id,
      nom:              teamNameById[t.id] || t.id,
      permissions:      t.permissions  || [],
      _origin:          t._origin      || 'direct',
    })),
  }));
}

// ─────────────────────────────────────────────
// READERS — CATEGORIES
// ─────────────────────────────────────────────

async function readCategories(snapshotId) {
  const [rows, viewRows] = await Promise.all([
    prisma.ikonCategory.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } }),
    prisma.ikonMetadataView.findMany({ where: { snapshotId }, select: { iconikId: true, name: true } }),
  ]);

  // Index iconikId → name pour résolution des viewIds
  const viewNameById = {};
  viewRows.forEach(v => { if (v.iconikId) viewNameById[v.iconikId] = v.name; });

  return rows.map(r => ({
    id:            r.iconikId,
    nom:           r.name,
    api_name:      r.apiName,
    is_system:     r.isSystem,
    object_types:  r.objectTypes,
    appliqueeA:    r.objectTypes,                                        // alias filtre UI
    metadataViews: (r.viewIds || []).map(id => viewNameById[id]).filter(Boolean), // noms résolus
    view_ids:      r.viewIds,                                            // IDs bruts conservés
  }));
}

// ─────────────────────────────────────────────
// READERS — WEBHOOKS
// ─────────────────────────────────────────────

async function readWebhooks(snapshotId) {
  const rows = await prisma.ikonWebhook.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:         r.iconikId,
    nom:        r.name,
    url:        r.url,
    event_type: r.eventType,
    eventType:  r.eventType,  // compat double clé existante
    realm:      r.realm,
    operation:  r.operation,
    status:     r.status,
    headers:    r.headers,
  }));
}

// ─────────────────────────────────────────────
// READERS — AUTOMATIONS
// ─────────────────────────────────────────────

async function readAutomations(snapshotId) {
  const rows = await prisma.ikonAutomation.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:         r.iconikId,
    nom:        r.name,
    status:     r.isActive ? 'ACTIVE' : 'INACTIVE',
    triggers:   Array.isArray(r.rawData?.triggers) ? r.rawData.triggers : [],
    conditions: r.conditions,
    actions:    r.actions,
    raw:        r.rawData,
  }));
}

// ─────────────────────────────────────────────
// READERS — CUSTOM ACTIONS
// ─────────────────────────────────────────────

async function readCustomActions(snapshotId) {
  const rows = await prisma.ikonCustomAction.findMany({
    where:   { snapshotId },
    orderBy: { title: 'asc' },
  });
  return rows.map(r => ({
    id:            r.iconikId,
    nom:           r.title,
    title:         r.title,       // compat existante
    object_types:  r.objectTypes,
    url:           r.url,
    type:          r.method,
    context:       (r.objectTypes || [])[0] || 'ASSET',
    app_id:        r.rawData?.app_id        || null,
    metadata_view: r.rawData?.metadata_view || null,
    headers:       r.rawData?.headers       || [],
    disabled:      r.rawData?.disabled      || false,
  }));
}

// ─────────────────────────────────────────────
// READERS — RELATION TYPES
// ─────────────────────────────────────────────

async function readRelationTypes(snapshotId) {
  const rows = await prisma.ikonRelationType.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:                r.iconikId,
    nom:               r.name,
    is_directional:    r.isDirectional,
    source_label:      r.sourceLabel,
    destination_label: r.destinationLabel,
    description:       r.description,
  }));
}

// ─────────────────────────────────────────────
// READERS — SYSTEM SETTINGS
// ─────────────────────────────────────────────

async function readSystemSettings(snapshotId) {
  const row = await prisma.ikonSystemSettings.findFirst({
    where: { snapshotId },
  }).catch(() => null);
  if (!row) return null;
  return {
    ...(row.shareSettings    || {}),
    ...(row.searchSettings   || {}),
    ...(row.uploadSettings   || {}),
    ...(row.downloadSettings || {}),
    ...(row.aclSettings      || {}),
  };
}

// ─────────────────────────────────────────────
// READERS — EXPORT LOCATIONS
// ─────────────────────────────────────────────

async function readExportLocations(snapshotId) {
  const rows = await prisma.ikonExportLocation.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });

  const viewNameById = await buildViewNameIndex(snapshotId);
  const teamNameById = await buildTeamNameIndex(snapshotId);

  return rows.map(r => {
    const raw = r.rawData || {};
    // ACLs teams depuis rawData (persisté par writeExportLocations)
    const teams = [
      ...((raw.groups_acl || []).map(g => ({
        id:          g.group_id,
        nom:         teamNameById[g.group_id] || g.group_id,
        permissions: g.permissions || [],
        _origin:     'direct',
      }))),
    ];
    return {
      id:            r.iconikId,
      nom:           r.name,
      location_type: r.locationType,
      status:        r.status,
      mdViewName:    r.mdViewId ? (viewNameById[r.mdViewId] || r.mdViewId) : null,
      teams,
    };
  });
}

// ─────────────────────────────────────────────
// READERS — ROLES + APPS
// ─────────────────────────────────────────────

async function readRoles(snapshotId) {
  const rows = await prisma.ikonRole.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
  return rows.map(r => ({
    id:          r.iconikId,
    nom:         r.name,
    slug:        r.slug,
    category:    r.category,
    permissions: r.permissions,
  }));
}

async function readApps(snapshotId) {
  const rows = await prisma.ikonApp.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
  return rows.map(r => ({
    id:        r.iconikId,
    nom:       r.name,
    app_type:  r.appType,
    is_active: r.isActive,
  }));
}

// ─────────────────────────────────────────────
// MAP SCOPE → READER
// Chaque reader retourne { clé: données[] }
// ─────────────────────────────────────────────

async function readCounts(snapshotId) {
  const [
    teams, users, roleGroups, collections, metadataViews,
    metadata, savedSearches, storages, categories, webhooks,
    automations, customActions, exportLocations, relationTypes, apps,
  ] = await Promise.all([
    prisma.ikonTeam.count({ where: { snapshotId, isAclStub: false } }),
    prisma.ikonUser.count({ where: { snapshotId } }),
    prisma.ikonRoleGroup.count({ where: { snapshotId } }),
    prisma.ikonCollection.count({ where: { snapshotId } }),
    prisma.ikonMetadataView.count({ where: { snapshotId } }),
    prisma.ikonField.count({ where: { snapshotId } }),
    prisma.ikonSavedSearch.count({ where: { snapshotId } }),
    prisma.ikonStorage.count({ where: { snapshotId } }),
    prisma.ikonCategory.count({ where: { snapshotId } }),
    prisma.ikonWebhook.count({ where: { snapshotId } }),
    prisma.ikonAutomation.count({ where: { snapshotId } }),
    prisma.ikonCustomAction.count({ where: { snapshotId } }),
    prisma.ikonExportLocation.count({ where: { snapshotId } }),
    prisma.ikonRelationType.count({ where: { snapshotId } }),
    prisma.ikonApp.count({ where: { snapshotId } }),
  ]);
  return {
    counts: {
      teams, users, roleGroups, collections, metadataViews,
      metadata, savedSearches, storages, categories, webhooks,
      automations, customActions, exportLocations, relationTypes, apps,
    },
  };
}

const READERS = {
  counts:         sid => readCounts(sid),
  collections:    sid => readCollections(sid).then(d => ({ collections: d })),
  teams:          sid => readTeams(sid).then(d => ({ teams: d })),
  users:          sid => readUsers(sid).then(d => ({ users: d })),
  metadataViews:  sid => readMetadataViews(sid),   // retourne { views, viewFieldsById }
  metadata:       sid => readFields(sid).then(d => ({ metadonnees: d })),
  roleGroups:     sid => readRoleGroups(sid).then(d => ({ roleGroups: d })),
  savedSearches:  sid => readSavedSearches(sid).then(d => ({ savedSearches: d })),
  storages:       sid => readStorages(sid).then(d => ({ storages: d })),
  categories:     sid => readCategories(sid).then(d => ({ categories: d })),
  webhooks:       sid => readWebhooks(sid).then(d => ({ webhooks: d })),
  automations:    sid => readAutomations(sid).then(d => ({ automations: d })),
  customActions:  sid => readCustomActions(sid).then(d => ({ customActions: d })),
  relationTypes:  sid => readRelationTypes(sid).then(d => ({ relationTypes: d })),
  systemSettings: sid => readSystemSettings(sid).then(d => ({ systemSettings: d })),
  exportLocations: sid => readExportLocations(sid).then(d => ({ exportLocations: d })),
  roles:          sid => readRoles(sid).then(d => ({ roles: d })),
  apps:           sid => readApps(sid).then(d => ({ apps: d })),
};

const ALL_SCOPES = Object.keys(READERS);

// ─────────────────────────────────────────────
// GET /api/ikon/snapshot/:envSlug
// Snapshot courant complet — rétrocompatibilité chargerDonnees()
// ─────────────────────────────────────────────

router.get('/snapshot/:envSlug', async (req, res) => {
  const { envSlug } = req.params;

  const env = await resolveEnv(envSlug);
  if (!env) return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });

  const snapshot = await getCurrentSnapshot(env.id);
  if (!snapshot) return res.status(404).json({ error: `Aucun snapshot pour "${envSlug}" — lancez d'abord une Sync DS` });

  const results = await Promise.allSettled(
    ALL_SCOPES.map(scope => READERS[scope](snapshot.id).then(data => ({ scope, data })))
  );

  const payload = {
    snapshotId:  snapshot.id,
    capturedAt:  snapshot.capturedAt,
    objectCount: snapshot.objectCount,
    env:         { name: env.name, slug: env.slug, type: env.type },
  };

  results.forEach(r => {
    if (r.status === 'fulfilled') Object.assign(payload, r.value.data);
  });

  res.json(payload);
});

// ─────────────────────────────────────────────
// GET /api/ikon/snapshot/:envSlug/:scope
// Snapshot courant, un seul scope (liste)
// ─────────────────────────────────────────────

router.get('/snapshot/:envSlug/:scope', async (req, res) => {
  const { envSlug, scope } = req.params;

  if (!READERS[scope]) {
    return res.status(400).json({ error: `Scope "${scope}" inconnu`, valid: ALL_SCOPES });
  }

  const env = await resolveEnv(envSlug);
  if (!env) return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });

  const snapshot = await getCurrentSnapshot(env.id);
  if (!snapshot) return res.status(404).json({ error: `Aucun snapshot pour "${envSlug}"` });

  const data = await READERS[scope](snapshot.id).catch(e => {
    console.error(`[ikon-data] Erreur lecture ${scope}:`, e.message);
    return null;
  });

  res.json({
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    env:        { name: env.name, slug: env.slug, type: env.type },
    scope,
    ...data,
  });
});

// ─────────────────────────────────────────────
// GET /api/ikon/snapshot/:envSlug/teams/:id
// Détail complet d'une team (avec toutes associations)
// ─────────────────────────────────────────────

router.get('/snapshot/:envSlug/teams/:id', async (req, res) => {
  const { envSlug, id } = req.params;

  const env = await resolveEnv(envSlug);
  if (!env) return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });

  const snapshot = await getCurrentSnapshot(env.id);
  if (!snapshot) return res.status(404).json({ error: `Aucun snapshot pour "${envSlug}"` });

  const team = await readTeamDetail(snapshot.id, id);
  if (!team) return res.status(404).json({ error: `Team "${id}" introuvable dans le snapshot` });

  res.json({
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    env:        { name: env.name, slug: env.slug, type: env.type },
    team,
  });
});

// ─────────────────────────────────────────────
// GET /api/ikon/snapshots/:envSlug
// Historique des snapshots
// ─────────────────────────────────────────────

router.get('/snapshots/:envSlug', async (req, res) => {
  const { envSlug } = req.params;

  const env = await resolveEnv(envSlug);
  if (!env) return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });

  const snapshots = await prisma.ikonSnapshot.findMany({
    where:   { envId: env.id },
    orderBy: { capturedAt: 'desc' },
    take:    50,
    select:  { id: true, scope: true, capturedAt: true, objectCount: true, isCurrent: true, jobId: true },
  });

  res.json({ env: { name: env.name, slug: env.slug }, snapshots });
});

module.exports = router;
