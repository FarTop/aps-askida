// APS — server/routes/ikon-data.js — 2026-06-25 13:00
// Lecture des données Iconik depuis les snapshots PostgreSQL
//
// GET /api/ikon/snapshot/:envSlug           — snapshot courant complet (tous scopes)
// GET /api/ikon/snapshot/:envSlug/:scope    — snapshot courant, un scope
// GET /api/ikon/snapshots/:envSlug          — historique des snapshots
//
// Ces routes remplacent toute lecture depuis localStorage dans la SD.
// La source de vérité est toujours le snapshot le plus récent (isCurrent=true).

'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// HELPER — résoudre un env depuis slug ou type
// ─────────────────────────────────────────────

async function resolveEnv(envSlug) {
  return prisma.environment.findFirst({
    where: {
      OR: [
        { slug: envSlug },
        { type: envSlug },
      ],
    },
    select: { id: true, name: true, slug: true, type: true },
  }).catch(() => null);
}

// ─────────────────────────────────────────────
// HELPER — snapshot courant d'un env
// ─────────────────────────────────────────────

async function getCurrentSnapshot(envId) {
  return prisma.ikonSnapshot.findFirst({
    where:   { envId, isCurrent: true },
    orderBy: { capturedAt: 'desc' },
    select:  { id: true, scope: true, capturedAt: true, objectCount: true },
  }).catch(() => null);
}

// ─────────────────────────────────────────────
// HELPERS — lecture par table
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
    title:        r.title,
    name:         r.title,
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

async function readTeams(snapshotId) {
  const rows = await prisma.ikonTeam.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => {
    // Convertir collectionIds → collections au format attendu par l'UI Settings
    // { id, nom, permission, permission_flags, _path } → { chemin: id, nom, permission, permission_flags, _path }
    const collections = (Array.isArray(r.collectionIds) ? r.collectionIds : []).map(c => ({
      chemin:          c.id    || c.chemin || '',
      nom:             c.nom   || c.title  || c.chemin || c.id || '',
      permission:      c.permission       || 'Read Only',
      permission_flags: c.permission_flags || [],
      _path:           c._path || c.nom   || '',
    }));

    // viewIds → vues au format attendu : { nom, permission, permission_flags }
    const vues = (Array.isArray(r.viewIds) ? r.viewIds : []).map(v => ({
      id:              v.id   || '',
      nom:             v.nom  || v.name || '',
      permission:      v.permission       || 'Read Only',
      permission_flags: v.permission_flags || [],
    }));

    // storageIds → storages
    const storages = (Array.isArray(r.storageIds) ? r.storageIds : []).map(s => ({
      id:  s.id  || '',
      nom: s.nom || s.name || '',
    }));

    // userIds → users
    const users = (Array.isArray(r.userIds) ? r.userIds : []).map(u => ({
      id:    u.id    || '',
      nom:   u.nom   || u.name || u.email || '',
      email: u.email || '',
    }));

    return {
      id:           r.iconikId,
      name:         r.name,
      nom:          r.name,
      description:  r.description,
      is_system:    r.isSystem,
      is_acl_stub:  r.isAclStub,
      collections,
      vues,
      storages,
      savedSearches: [],   // peuplé par le scope savedSearches (ACLs)
      customActions: [],
      users,
      roleGroups_doc_ids: [],
      settings:     r.settings,
      aclFlags:     r.aclFlags,
    };
  });
}

async function readUsers(snapshotId) {
  const rows = await prisma.ikonUser.findMany({
    where:   { snapshotId },
    orderBy: { email: 'asc' },
  });
  return rows.map(r => ({
    id:          r.iconikId,
    email:       r.email,
    first_name:  r.firstName,
    last_name:   r.lastName,
    display_name: r.displayName,
    status:      r.status,
    type:        r.userType,
    groups:      r.teamIds,
  }));
}

async function readMetadataViews(snapshotId) {
  const rows = await prisma.ikonMetadataView.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  // viewFieldsById — utilisé par la SD dans le body metadataViews
  const viewFieldsById = {};
  const views = rows.map(r => {
    const viewFields = Array.isArray(r.viewFields) ? r.viewFields : [];
    viewFieldsById[r.iconikId] = viewFields;
    return {
      id:          r.iconikId,
      name:        r.name,
      nom:         r.name,
      is_system:   r.isSystem,
      view_fields: viewFields,   // format Iconik attendu par l'UI Settings
      teams:       [],           // peuplé par rebuildMetadataViewTeams() dans chargerDonnees
    };
  });
  return { views, viewFieldsById };
}

async function readFields(snapshotId) {
  const rows = await prisma.ikonField.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:              r.iconikId,
    name:            r.name,
    nom:             r.name,
    label:           r.label,
    field_type:      r.fieldType,
    ui_type:         r.uiType,
    multi:           r.isMultiple,
    required:        r.isMandatory,
    options:         r.options,
  }));
}

async function readRoleGroups(snapshotId) {
  const rows = await prisma.ikonRoleGroup.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:              r.iconikId,
    name:            r.name,
    nom:             r.name,
    description:     r.description,
    roles:           r.roles,
    role_categories: r.roleCategories,
  }));
}

async function readSavedSearches(snapshotId) {
  const rows = await prisma.ikonSavedSearch.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:       r.iconikId,
    name:     r.name,
    nom:      r.name,
    criteria: r.criteria,
  }));
}

async function readStorages(snapshotId) {
  const rows = await prisma.ikonStorage.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:             r.iconikId,
    name:           r.name,
    storage_type:   r.storageType,
    status:         r.status,
    scanner_status: r.scannerStatus,
    purpose:        r.purpose,
  }));
}

async function readCategories(snapshotId) {
  const rows = await prisma.ikonCategory.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:           r.iconikId,
    name:         r.name,
    api_name:     r.apiName,
    is_system:    r.isSystem,
    object_types: r.objectTypes,
    view_ids:     r.viewIds,
  }));
}

async function readWebhooks(snapshotId) {
  const rows = await prisma.ikonWebhook.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:         r.iconikId,
    name:       r.name,
    nom:        r.name,
    url:        r.url,
    event_type: r.eventType,
    eventType:  r.eventType,
    realm:      r.realm,
    operation:  r.operation,
    status:     r.status,
    headers:    r.headers,
  }));
}

async function readAutomations(snapshotId) {
  const rows = await prisma.ikonAutomation.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:         r.iconikId,
    name:       r.name,
    nom:        r.name,
    status:     r.isActive ? 'ACTIVE' : 'INACTIVE',
    triggers:   Array.isArray(r.rawData?.triggers) ? r.rawData.triggers : [],
    conditions: r.conditions,
    actions:    r.actions,
    raw:        r.rawData,
  }));
}

async function readCustomActions(snapshotId) {
  const rows = await prisma.ikonCustomAction.findMany({
    where:   { snapshotId },
    orderBy: { title: 'asc' },
  });
  return rows.map(r => ({
    id:           r.iconikId,
    name:         r.title,
    nom:          r.title,
    title:        r.title,
    object_types: r.objectTypes,
    url:          r.url,
    type:         r.method,
    context:      (r.objectTypes || [])[0] || 'ASSET',
    app_id:       r.rawData?.app_id || null,
    metadata_view: r.rawData?.metadata_view || null,
    headers:      r.rawData?.headers || [],
    disabled:     r.rawData?.disabled || false,
  }));
}

async function readRelationTypes(snapshotId) {
  const rows = await prisma.ikonRelationType.findMany({
    where:   { snapshotId },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id:                r.iconikId,
    name:              r.name,
    is_directional:    r.isDirectional,
    source_label:      r.sourceLabel,
    destination_label: r.destinationLabel,
    description:       r.description,
  }));
}

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

async function readExportLocations(snapshotId) {
  const rows = await prisma.ikonExportLocation.findMany({ where: { snapshotId } });
  return rows.map(r => ({ id: r.iconikId, name: r.name, location_type: r.locationType, status: r.status }));
}

async function readRoles(snapshotId) {
  const rows = await prisma.ikonRole.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
  return rows.map(r => ({ id: r.iconikId, name: r.name, slug: r.slug, category: r.category, permissions: r.permissions }));
}

async function readApps(snapshotId) {
  const rows = await prisma.ikonApp.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
  return rows.map(r => ({ id: r.iconikId, name: r.name, app_type: r.appType, is_active: r.isActive }));
}

// ─────────────────────────────────────────────
// MAP SCOPE → READER
// ─────────────────────────────────────────────

const READERS = {
  collections:    snapshotId => readCollections(snapshotId).then(d => ({ collections: d })),
  teams:          snapshotId => readTeams(snapshotId).then(d => ({ teams: d })),
  users:          snapshotId => readUsers(snapshotId).then(d => ({ users: d })),
  metadataViews:  snapshotId => readMetadataViews(snapshotId),  // retourne { views, viewFieldsById }
  metadata:       snapshotId => readFields(snapshotId).then(d => ({ metadonnees: d })),
  roleGroups:     snapshotId => readRoleGroups(snapshotId).then(d => ({ roleGroups: d })),
  savedSearches:  snapshotId => readSavedSearches(snapshotId).then(d => ({ savedSearches: d })),
  storages:       snapshotId => readStorages(snapshotId).then(d => ({ storages: d })),
  categories:     snapshotId => readCategories(snapshotId).then(d => ({ categories: d })),
  webhooks:       snapshotId => readWebhooks(snapshotId).then(d => ({ webhooks: d })),
  automations:    snapshotId => readAutomations(snapshotId).then(d => ({ automations: d })),
  customActions:  snapshotId => readCustomActions(snapshotId).then(d => ({ customActions: d })),
  relationTypes:  snapshotId => readRelationTypes(snapshotId).then(d => ({ relationTypes: d })),
  systemSettings: snapshotId => readSystemSettings(snapshotId).then(d => ({ systemSettings: d })),
  exportLocations: snapshotId => readExportLocations(snapshotId).then(d => ({ exportLocations: d })),
  roles:          snapshotId => readRoles(snapshotId).then(d => ({ roles: d })),
  apps:           snapshotId => readApps(snapshotId).then(d => ({ apps: d })),
};

const ALL_SCOPES = Object.keys(READERS);

// ─────────────────────────────────────────────
// GET /api/ikon/snapshot/:envSlug
// Snapshot courant complet (tous les scopes)
// ─────────────────────────────────────────────

router.get('/snapshot/:envSlug', async (req, res) => {
  const { envSlug } = req.params;

  const env = await resolveEnv(envSlug);
  if (!env) return res.status(404).json({ error: `Environnement "${envSlug}" introuvable` });

  const snapshot = await getCurrentSnapshot(env.id);
  if (!snapshot) return res.status(404).json({ error: `Aucun snapshot pour "${envSlug}" — lancez d'abord une Sync DS` });

  // Lire tous les scopes en parallèle
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
    if (r.status === 'fulfilled') {
      Object.assign(payload, r.value.data);
    }
  });

  res.json(payload);
});

// ─────────────────────────────────────────────
// GET /api/ikon/snapshot/:envSlug/:scope
// Snapshot courant, un seul scope
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
// GET /api/ikon/snapshots/:envSlug
// Historique des snapshots (pour futur sélecteur)
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
