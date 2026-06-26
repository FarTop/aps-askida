// APS — server/routes/iconik-proxy.js — 2026-06-25 20:30
// Proxy Iconik intelligent
//
// PRINCIPE :
//   - Requêtes de lecture (GET/POST search) → sert depuis le snapshot DB si disponible
//   - Requêtes d'écriture (PUT/PATCH/DELETE/POST création) → passe à l'API Iconik réelle
//   - Si pas de snapshot → passe à l'API réelle (fallback transparent)
//
// Le client ne sait pas d'où viennent les données.
// Toute la logique client (syncIconik, Mirror Check, API Check, WFD) reste intacte.
// Pour une autre plateforme, on ajoute un handler dans DB_HANDLERS.

'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const crypto = require('crypto');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────

function decrypt(text) {
  if (!text) return '';
  try {
    const key      = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch { return ''; }
}

const _credCache = new Map();
const CACHE_TTL  = 5 * 60 * 1000;

async function getCredentials(envName) {
  const cached = _credCache.get(envName);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.creds;

  const env = await prisma.environment.findFirst({
    where: { OR: [{ type: envName }, { slug: envName }, { name: { contains: envName, mode: 'insensitive' } }] },
  });

  if (!env?.appId || !env?.tokenEnc) return null;
  const creds = { id: env.id, baseUrl: env.baseUrl || 'https://app.iconik.io', appId: env.appId, token: decrypt(env.tokenEnc) };
  _credCache.set(envName, { creds, ts: Date.now() });
  return creds;
}

function invalidateCache(envName) {
  if (envName) _credCache.delete(envName);
  else _credCache.clear();
}

// ─────────────────────────────────────────────
// CACHE SNAPSHOT — TTL 2 min pour éviter N requêtes DB par page
// ─────────────────────────────────────────────

const _snapCache = new Map();
const SNAP_TTL   = 2 * 60 * 1000;

async function getSnapshot(envId) {
  const cached = _snapCache.get(envId);
  if (cached && Date.now() - cached.ts < SNAP_TTL) return cached.snap;

  const snap = await prisma.ikonSnapshot.findFirst({
    where:   { envId, isCurrent: true },
    orderBy: { capturedAt: 'desc' },
    select:  { id: true, capturedAt: true },
  }).catch(() => null);

  _snapCache.set(envId, { snap, ts: Date.now() });
  return snap;
}

function invalidateSnapCache(envId) {
  if (envId) _snapCache.delete(envId);
  else _snapCache.clear();
}

// ─────────────────────────────────────────────
// HELPERS — Format réponse Iconik
// ─────────────────────────────────────────────

// Réponse paginée standard Iconik
function ikonPage(objects, total) {
  return { objects: objects || [], total_count: total ?? (objects || []).length, pages: 1, page: 1, per_page: (objects || []).length };
}

// Extraire rawData d'une liste de rows Prisma
function rawList(rows) {
  return (rows || []).map(r => r.rawData).filter(Boolean);
}

// ─────────────────────────────────────────────
// CACHE ACL — index en mémoire par snapshotId
// Évite N requêtes DB pour les ACLs collections/views/storages
// ─────────────────────────────────────────────

const _aclCache = new Map();
const ACL_TTL   = 10 * 60 * 1000; // 10 min

async function getAclIndex(snapshotId) {
  const cached = _aclCache.get(snapshotId);
  if (cached && Date.now() - cached.ts < ACL_TTL) return cached.index;

  console.log(`[Proxy ACL] Construction index ACL pour snapshot ${snapshotId.slice(0,8)}…`);
  const [teams, storages] = await Promise.all([
    prisma.ikonTeam.findMany({
      where:  { snapshotId },
      select: { iconikId: true, name: true, collectionIds: true, viewIds: true },
    }),
    prisma.ikonStorage.findMany({
      where:  { snapshotId },
      select: { iconikId: true, name: true, teamIds: true },
    }),
  ]);

  // Index colId → [{ group_id, group_name, permissions, flags }]
  const colAcl  = new Map();
  const viewAcl = new Map();
  const stAcl   = new Map();

  for (const team of teams) {
    // Collections
    for (const c of (Array.isArray(team.collectionIds) ? team.collectionIds : [])) {
      const id = c.id || c.chemin;
      if (!id) continue;
      if (!colAcl.has(id)) colAcl.set(id, { groups_acl: [], propagating_groups_acl: [], inherited_groups_acl: [] });
      const flags = Array.isArray(c.permission_flags) ? c.permission_flags : [];
      const permissions = flags.filter(f => !['direct','inherited','propagates'].includes(f));
      const entry = { group_id: team.iconikId, group_name: team.name, permissions };
      const acl = colAcl.get(id);
      if (flags.includes('propagates'))   acl.propagating_groups_acl.push(entry);
      else if (flags.includes('inherited')) acl.inherited_groups_acl.push(entry);
      else                                  acl.groups_acl.push(entry);
    }
    // Views
    for (const v of (Array.isArray(team.viewIds) ? team.viewIds : [])) {
      const id = v.id;
      if (!id) continue;
      if (!viewAcl.has(id)) viewAcl.set(id, { groups_acl: [], propagating_groups_acl: [], inherited_groups_acl: [] });
      const flags = Array.isArray(v.permission_flags) ? v.permission_flags : [];
      const permissions = flags.filter(f => !['direct','inherited','propagates'].includes(f));
      const entry = { group_id: team.iconikId, group_name: team.name, permissions };
      const acl = viewAcl.get(id);
      if (flags.includes('propagates'))   acl.propagating_groups_acl.push(entry);
      else if (flags.includes('inherited')) acl.inherited_groups_acl.push(entry);
      else                                  acl.groups_acl.push(entry);
    }
  }

  // Storages — construire stAcl depuis IkonStorage.teamIds (source de vérité depuis le fix sync-engine)
  for (const storage of storages) {
    const stId = storage.iconikId;
    if (!stId) continue;
    const teamIds = Array.isArray(storage.teamIds) ? storage.teamIds : [];
    if (!teamIds.length) continue;
    if (!stAcl.has(stId)) stAcl.set(stId, { groups_acl: [], propagating_groups_acl: [], inherited_groups_acl: [] });
    const acl = stAcl.get(stId);
    for (const t of teamIds) {
      const id = t.id || t;
      if (!id) continue;
      const flags = Array.isArray(t.permissions) ? t.permissions : [];
      const origin = t._origin || 'direct';
      const entry = { group_id: id, permissions: flags };
      if (origin === 'propagates')       acl.propagating_groups_acl.push(entry);
      else if (origin === 'inherited')   acl.inherited_groups_acl.push(entry);
      else                               acl.groups_acl.push(entry);
    }
  }

  const index = { colAcl, viewAcl, stAcl };
  _aclCache.set(snapshotId, { index, ts: Date.now() });
  console.log(`[Proxy ACL] Index prêt — ${colAcl.size} collections, ${viewAcl.size} views, ${stAcl.size} storages`);
  return index;
}

const EMPTY_ACL = { groups_acl: [], propagating_groups_acl: [], inherited_groups_acl: [], users_acl: [], inherited_users_acl: [], propagating_users_acl: [] };

// ─────────────────────────────────────────────
// DB HANDLERS — mapping endpoint → DB
// ─────────────────────────────────────────────
// Chaque handler reçoit { snapshotId, pathParts, query, body, method }
// et retourne { handled: true, status, data } ou { handled: false }

const DB_HANDLERS = [

  // ── Teams ────────────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/users/v1/teams/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonTeam.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Groups (fallback teams)
  {
    match: (m, p) => m === 'GET' && p === '/API/users/v1/groups/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonTeam.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Team individuelle
  {
    match: (m, p) => m === 'GET' && /^\/API\/users\/v1\/teams\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const teamId = pathParts[4];
      const row = await prisma.ikonTeam.findFirst({ where: { snapshotId, iconikId: teamId } });
      if (!row?.rawData) return { handled: false };
      return { handled: true, status: 200, data: row.rawData };
    },
  },

  // ── Users ────────────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/users/v1/users/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonUser.findMany({ where: { snapshotId }, orderBy: { email: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Role Groups ──────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/users/v1/role_groups/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonRoleGroup.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Metadata Views ───────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/metadata/v1/views/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonMetadataView.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Vue individuelle avec view_fields (utilisé par syncViewFields et _syncViewsToMetadata)
  {
    match: (m, p) => m === 'GET' && /^\/API\/metadata\/v1\/views\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const viewId = pathParts[4];
      const row = await prisma.ikonMetadataView.findFirst({ where: { snapshotId, iconikId: viewId } });
      if (!row) return { handled: false };
      // Fusionner rawData avec view_fields depuis la colonne DB
      const data = { ...(row.rawData || {}), view_fields: row.viewFields || [] };
      return { handled: true, status: 200, data };
    },
  },

  // ── Metadata Fields ──────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/metadata/v1/fields/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonField.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Saved Searches ───────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/search/v1/search/saved/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonSavedSearch.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Saved searches de groupe (utilisé par syncAclsSavedSearchesToTeams)
  {
    match: (m, p) => m === 'GET' && p === '/API/search/v1/search/saved/group/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonSavedSearch.findMany({ where: { snapshotId } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Storages ─────────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/files/v1/storages/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonStorage.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Storage individuel (syncFetchAll detail)
  {
    match: (m, p) => m === 'GET' && /^\/API\/files\/v1\/storages\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const storageId = pathParts[4];
      const row = await prisma.ikonStorage.findFirst({ where: { snapshotId, iconikId: storageId } });
      if (!row?.rawData) return { handled: false };
      return { handled: true, status: 200, data: row.rawData };
    },
  },

  // ── Automations ──────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/automations/v1/automations/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonAutomation.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Custom Actions ───────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/assets/v1/custom_actions/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonCustomAction.findMany({ where: { snapshotId }, orderBy: { title: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Apps ─────────────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/auth/v1/apps/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonApp.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Webhooks ─────────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/notifications/v1/webhooks/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonWebhook.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Relation Types ───────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/assets/v1/assets/relation_types/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonRelationType.findMany({ where: { snapshotId }, orderBy: { name: 'asc' } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── Categories par type d'objet ──────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/metadata\/v1\/(assets|collections|segments|custom_actions)\/categories\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const objType = pathParts[3]; // assets, collections, segments, custom_actions
      const rows = await prisma.ikonCategory.findMany({
        where: { snapshotId, objectTypes: { array_contains: objType } },
        orderBy: { name: 'asc' },
      });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },
  // Catégorie individuelle (default/generic)
  {
    match: (m, p) => m === 'GET' && /^\/API\/metadata\/v1\/(assets|collections|segments|custom_actions|search)\/categories\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const catName = pathParts[5];
      const objType = pathParts[3];
      const row = await prisma.ikonCategory.findFirst({
        where: { snapshotId, apiName: catName, objectTypes: { array_contains: objType } },
      });
      if (!row?.rawData) return { handled: false };
      return { handled: true, status: 200, data: row.rawData };
    },
  },

  // ── System Settings ──────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && (p === '/API/settings/v1/merged/current/' || p === '/API/settings/v1/system/current/'),
    handle: async ({ snapshotId }) => {
      const row = await prisma.ikonSystemSettings.findFirst({ where: { snapshotId } });
      if (!row?.rawData) return { handled: false };
      return { handled: true, status: 200, data: row.rawData };
    },
  },

  // ── Team Settings ────────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/settings\/v1\/team\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const teamId = pathParts[4];
      const row = await prisma.ikonTeam.findFirst({ where: { snapshotId, iconikId: teamId }, select: { settings: true } });
      if (!row?.settings) return { handled: false };
      return { handled: true, status: 200, data: row.settings };
    },
  },

  // ── Collections Search (POST) ────────────────────────────────────────────
  // syncIconik utilise wfdFetchAllCollectionsSearch → POST /API/search/v1/search/
  {
    match: (m, p) => m === 'POST' && p === '/API/search/v1/search/',
    handle: async ({ snapshotId, body }) => {
      // On ne sert depuis DB que si doc_types inclut 'collections'
      const docTypes = body?.doc_types || [];
      if (!docTypes.includes('collections')) return { handled: false };
      const rows = await prisma.ikonCollection.findMany({
        where:   { snapshotId, dateDeleted: null },
        orderBy: { path: 'asc' },
      });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── ACLs Collections → index en mémoire (1 query DB pour tout le snapshot) ─
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/collections\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const colId = pathParts[5];
      const { colAcl } = await getAclIndex(snapshotId);
      const acl = colAcl.get(colId) || {};
      return { handled: true, status: 200, data: { ...EMPTY_ACL, ...acl } };
    },
  },

  // ── ACLs Metadata Views → index en mémoire ──────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/metadata_views\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const viewId = pathParts[5];
      const { viewAcl } = await getAclIndex(snapshotId);
      const acl = viewAcl.get(viewId) || {};
      return { handled: true, status: 200, data: { ...EMPTY_ACL, ...acl } };
    },
  },

  // ── ACLs Saved Searches ──────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/saved_searches\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const ssId = pathParts[5];
      // Les savedSearches ACLs ne sont pas encore dans la DB — fallback API réelle
      return { handled: false };
    },
  },

  // ── ACLs Storages → index en mémoire ────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/storages\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const stId = pathParts[5];
      const { stAcl } = await getAclIndex(snapshotId);
      const acl = stAcl.get(stId) || {};
      return { handled: true, status: 200, data: { ...EMPTY_ACL, ...(acl.groups_acl ? { groups_acl: acl.groups_acl } : {}) } };
    },
  },

  // ── ACLs Custom Actions ──────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/custom_actions\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      // Pas encore stocké — fallback API réelle
      return { handled: false };
    },
  },

  // ── ACLs Export Locations ─────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/export_locations\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const elId = pathParts[5];
      const row = await prisma.ikonExportLocation.findFirst({
        where:  { snapshotId, iconikId: elId },
        select: { aclData: true },
      });
      if (!row?.aclData) return { handled: false };
      return { handled: true, status: 200, data: row.aclData };
    },
  },

  // ── ACLs Groups (team ACL pour Mirror Check) ─────────────────────────────
  {
    match: (m, p) => m === 'GET' && /^\/API\/acls\/v1\/acl\/groups\/[^/]+\/$/.test(p),
    handle: async ({ snapshotId, pathParts }) => {
      const teamId = pathParts[5];
      const row = await prisma.ikonTeam.findFirst({
        where:  { snapshotId, iconikId: teamId },
        select: { aclFlags: true },
      });
      if (!row?.aclFlags) return { handled: false };
      return { handled: true, status: 200, data: row.aclFlags };
    },
  },

  // ── Export Locations ─────────────────────────────────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/files/v1/export_locations/',
    handle: async ({ snapshotId }) => {
      const rows = await prisma.ikonExportLocation.findMany({ where: { snapshotId } });
      return { handled: true, status: 200, data: ikonPage(rawList(rows)) };
    },
  },

  // ── IDP / SAML (pas en DB — toujours API réelle) ────────────────────────
  {
    match: (m, p) => m === 'GET' && p === '/API/auth/v1/auth/saml/idp/',
    handle: async () => ({ handled: false }),
  },

];

// ─────────────────────────────────────────────
// RÉSOLUTION HANDLER
// ─────────────────────────────────────────────

function findHandler(method, iconikPath) {
  // Normaliser le chemin : retirer query string, garantir trailing slash
  const cleanPath = iconikPath.split('?')[0].replace(/\/?$/, '/');
  const pathParts = cleanPath.split('/').filter(Boolean);
  // pathParts[0] = 'API', pathParts[1] = domaine (users, metadata, ...), etc.
  return DB_HANDLERS.find(h => h.match(method, '/' + pathParts.join('/') + '/')) || null;
}

// ─────────────────────────────────────────────
// PROXY VERS API ICONIK RÉELLE
// ─────────────────────────────────────────────

async function proxyToIconik(req, res, creds, iconikPath) {
  const url = `${creds.baseUrl}${iconikPath}`;
  const headers = {
    'App-ID'      : creds.appId,
    'Auth-Token'  : creds.token,
    'Accept'      : req.headers['accept']       || 'application/json',
    'Content-Type': req.headers['content-type'] || 'application/json',
  };
  const options = { method: req.method, headers };
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    options.body = JSON.stringify(req.body);
  }
  const r = await fetch(url, options);
  res.status(r.status);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) res.json(await r.json());
  else res.send(await r.text());
}

// ─────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────

async function proxyRequest(req, res) {
  const { envName } = req.params;
  const pathArr    = Array.isArray(req.params.path) ? req.params.path : [req.params.path || ''];
  const queryStr   = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const iconikPath = '/' + pathArr.join('/') + queryStr;
  const cleanPath  = iconikPath.split('?')[0].replace(/\/?$/, '/');
  const pathParts  = cleanPath.split('/').filter(Boolean);

  try {
    const creds = await getCredentials(envName);
    if (!creds) {
      return res.status(404).json({ error: `Environnement "${envName}" non trouvé ou credentials manquants` });
    }

    // ── Requêtes d'écriture → toujours API réelle + invalider cache snap ──
    if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      invalidateSnapCache(creds.id);
      return proxyToIconik(req, res, creds, iconikPath);
    }

    // ── POST de création → API réelle (sauf search) ───────────────────────
    // On détecte POST search vs POST création par le chemin
    const isSearchPost = req.method === 'POST' && cleanPath.includes('/search/');
    if (req.method === 'POST' && !isSearchPost) {
      return proxyToIconik(req, res, creds, iconikPath);
    }

    // ── Chercher un handler DB ────────────────────────────────────────────
    const handler = findHandler(req.method, cleanPath);
    if (handler) {
      const snap = await getSnapshot(creds.id);
      if (snap) {
        try {
          const result = await handler.handle({
            snapshotId: snap.id,
            pathParts,
            query:  req.query || {},
            body:   req.body  || {},
            method: req.method,
          });
          if (result.handled) {
            console.log(`[Proxy DB] ${req.method} ${cleanPath} → DB (snap: ${snap.id.slice(0,8)})`);
            return res.status(result.status).json(result.data);
          }
        } catch(e) {
          console.warn(`[Proxy DB] Erreur handler ${cleanPath}:`, e.message, '→ fallback API');
        }
      }
    }

    // ── Fallback : API Iconik réelle ──────────────────────────────────────
    return proxyToIconik(req, res, creds, iconikPath);

  } catch(e) {
    console.error(`[Iconik Proxy] Erreur ${req.method} ${iconikPath}:`, e.message);
    res.status(502).json({ error: 'Proxy error: ' + e.message });
  }
}

// Route d'invalidation du cache (appelée après une sync DS)
router.post('/invalidate-cache', async (req, res) => {
  invalidateCache();
  invalidateSnapCache();
  _aclCache.clear();
  console.log('[Proxy] Cache invalidé (post-sync DS)');
  res.json({ ok: true });
});

// Routes — Express 5 syntax
router.get   ('/:envName/*path', proxyRequest);
router.post  ('/:envName/*path', proxyRequest);
router.put   ('/:envName/*path', proxyRequest);
router.patch ('/:envName/*path', proxyRequest);
router.delete('/:envName/*path', proxyRequest);

module.exports = { router, invalidateCache, invalidateSnapCache };
