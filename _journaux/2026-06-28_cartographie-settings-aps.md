# Cartographie complète APS — Settings, Automations, Dashboard, Viewer
# 2026-06-28 — Référence architecturale avant mode "créatif"

---

## 1. Vue d'ensemble — Architecture générale

```
Iconik API
    ↓ (sync-engine.js — fetch + persistance)
PostgreSQL / Prisma
    ↓ (ikon-data.js — lecture + contrat canonique)
GET /api/ikon/snapshot/:envSlug
    ↓ (chargerDonnees() — Settings uniquement)
Variables globales JS (en mémoire, page Settings)
    ↓ (consommation directe)
detailXxx() / renderListe() → UI Settings
```

**Les autres pages (Automations, Dashboard, Viewer) lisent encore depuis localStorage.**
C'est la dette principale à éliminer.

---

## 2. Modèles Prisma — Inventaire complet

| Modèle | Colonnes propres indexées | Champ relations dénormalisées | rawData |
|---|---|---|---|
| `IkonSnapshot` | `envId`, `scope`, `isCurrent`, `capturedAt` | (parent de tout) | non |
| `IkonCollection` | `iconikId`, `title`, `parentId`, `path`, `status`, `storageId`, `isRoot`, `objectType` | — | ✅ |
| `IkonTeam` | `iconikId`, `name`, `isSystem`, `isAclStub` | `userIds`, `roleGroupIds`, `collectionIds`, `viewIds`, `storageIds`, `savedSearchIds`, `customActionIds`, `settings`, `aclFlags` | ✅ |
| `IkonUser` | `iconikId`, `email`, `firstName`, `lastName`, `displayName`, `status`, `userType` | `teamIds`, `roleGroupIds` | ✅ |
| `IkonMetadataView` | `iconikId`, `name`, `isSystem`, `viewFields` | — | ✅ |
| `IkonField` | `iconikId`, `name`, `label`, `fieldType`, `uiType`, `isMultiple`, `isMandatory`, `options` | — | ✅ |
| `IkonRoleGroup` | `iconikId`, `name`, `description`, `roles`, `roleCategories` | — | ✅ |
| `IkonSavedSearch` | `iconikId`, `name`, `criteria` | `shareWithTeams` | ✅ |
| `IkonStorage` | `iconikId`, `name`, `storageType`, `status`, `scannerStatus`, `purpose` | `teamIds` | ✅ |
| `IkonCategory` | `iconikId`, `name`, `apiName`, `isSystem`, `objectTypes`, `viewIds` | — | ✅ |
| `IkonWebhook` | `iconikId`, `name`, `url`, `eventType`, `realm`, `operation`, `status`, `headers` | — | ✅ |
| `IkonAutomation` | `iconikId`, `name`, `eventType`, `isActive`, `actions`, `conditions` | — | ✅ |
| `IkonCustomAction` | `iconikId`, `title`, `objectTypes`, `url`, `method` | `teamIds` | ✅ |
| `IkonRelationType` | `iconikId`, `name`, `isDirectional`, `sourceLabel`, `destinationLabel` | — | ✅ |
| `IkonSystemSettings` | `shareSettings`, `searchSettings`, `uploadSettings`, `downloadSettings`, `aclSettings` | — | ✅ |
| `IkonExportLocation` | `iconikId`, `name`, `locationType`, `status`, `aclData` | — | ✅ |
| `IkonRole` | `iconikId`, `name`, `slug`, `category`, `permissions` | — | ✅ |
| `IkonApp` | `iconikId`, `name`, `appType`, `isActive` | — | ✅ |

**Colonnes absentes mais nécessaires :**
- `IkonMetadataView` : pas de `objectTypes` — l'info vit dans `IkonCategory.rawData.rawByType`
- `IkonTeam` : pas de `groupAcls` (ACLs de la team sur les ressources) — Phase D

---

## 3. Contrats canoniques — ikon-data.js

### 3.1 COLLECTIONS
**Reader :** `readCollections(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, parent_id, _path,
  status, storage_id, external_id,
  is_root, object_type, date_deleted
}
```
**Variable globale Settings :** `collectionsData = { collections: [] }`
**Clé snapshot :** `snap.collections`

---

### 3.2 TEAMS
**Reader :** `readTeams(snapshotId)` (FULL LIST — rétrocompat Phase D)
**Reader détail :** `readTeamDetail(snapshotId, iconikId)`
**Reader liste :** `readTeamsList(snapshotId)`

**Contrat exposé (FULL) :**
```js
{
  id, nom, description, is_system, is_acl_stub,
  collections: [{ chemin, nom, permission, permission_flags, _path }],
  vues:        [{ id, nom, permission, permission_flags }],
  storages:    [{ id, nom }],
  savedSearches: [{ id, nom, permission }],
  customActions: [{ id, nom }],
  roleGroups:  [{ id, nom }],
  roleGroups_doc_ids: [],   // compat script-settings.js
  users:       [{ id, nom, email }],
  settings,    // team settings Iconik
  aclFlags,    // ACL flags bruts (groupAcls manquant — Phase D)
}
```
**Post-traitements `chargerDonnees()` :**
- `users[].teams` — 5b-2 : reconstruit depuis `teamById`
- `teams[].users` — 5b-3 : index inverse depuis `usersData`

**Variable globale Settings :** `teamsData = { teams: [] }`
**Clé snapshot :** `snap.teams`

---

### 3.3 USERS
**Reader :** `readUsers(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, email, first_name, last_name,
  display_name, status, type,
  groups: [{id}]  // teamIds bruts — enrichi en post-traitement
}
```
**Post-traitement `chargerDonnees()` (5b-2) :** `u.teams` résolu depuis `teamById`

**Variable globale Settings :** `usersData = { users: [] }`
**Clé snapshot :** `snap.users`

---

### 3.4 METADATA VIEWS
**Reader :** `readMetadataViews(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, is_system,
  object_types: [],  // ⚠️ TOUJOURS VIDE — pas dans IkonMetadataView
  view_fields: [{name, field_id, label, sortOrder}],
  teams: [{ id, nom, permission, permission_flags }]  // index inverse depuis IkonTeam.viewIds
}
// + viewFieldsById: { [viewId]: view_fields[] }  // index séparé
```
**⚠️ Anomalie :** `object_types` toujours `[]` car `IkonMetadataView` n'a pas de colonne `objectTypes`. L'info vit dans `IkonCategory.rawData.rawByType`. Source correcte en frontend : `categoriesData.categories[].viewIdsByType`.

**Post-traitement `chargerDonnees()` (5b-1) :** `metadonnees[].metadataViews` peuplé depuis `viewFieldsById`

**Variable globale Settings :** `metadataViewsData = { metadataViews: [], viewFieldsById: {} }`
**Clé snapshot :** `snap.views` + `snap.viewFieldsById`

---

### 3.5 METADATA FIELDS
**Reader :** `readFields(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, name, label,
  field_type, type,        // type = uiType mappé (Text, Dropdown, etc.)
  ui_type, multi, multiselect, required,
  options: [{label, value}],
  valeurs: [],             // tableau de strings pour l'UI
  description, defaultValue,
  read_only, hide_if_not_set,
  use_in_filters,          // ← use_as_facet (nom Iconik)
  string_exact,
  display_as_warning,      // ← is_warning_field (nom Iconik)
  block_assets,            // ← is_block_field (nom Iconik)
  mapped_field_name,
  metadataViews: [],       // peuplé par post-traitement 5b-1
  metadataView: null,      // premier de metadataViews (compat)
}
```
**Variable globale Settings :** `metadonneesData = { metadonnees: [] }`
**Clé snapshot :** `snap.metadonnees`

---

### 3.6 ROLE GROUPS
**Reader :** `readRoleGroups(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, description,
  roles: [],           // slugs bruts Iconik
  role_categories: {}, // {catKey: bool}
  teams: [{ id, nom }],
  teams_doc_ids: [],   // compat script-settings.js
  // Champs post-traitement (5b-4) :
  fonctionnalites: [], // labels depuis ROLE_CAT_LABELS
  assignations: [],    // [{role, permissions, slugs}]
}
```
**Post-traitements `chargerDonnees()` (5b-4) :**
- `roleGroups[].fonctionnalites` — depuis `role_categories` + `ROLE_CAT_LABELS`
- `rolesData.roles` — depuis `ROLE_CAT_LABELS` (constante frontend)
- `itemsAdvancedData.items` — depuis `ICONIK_ITEMS_CATALOG` + `SLUG_TO_CATALOG_KEY`

**Variable globale Settings :** `roleGroupsData = { roleGroups: [] }`
**Clé snapshot :** `snap.roleGroups`

---

### 3.7 SAVED SEARCHES
**Reader :** `readSavedSearches(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom,
  criteria: {},           // critères bruts Iconik
  metadataView: '',       // nom résolu depuis criteria.metadata_view_id
  teams: [{ nom, permission }]
}
```
**Variable globale Settings :** `savedSearchesData = { savedSearches: [] }`
**Clé snapshot :** `snap.savedSearches`

---

### 3.8 STORAGES
**Reader :** `readStorages(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, storage_type, status,
  scanner_status, purpose,
  teams: [{ id, nom, permissions, _origin }]
}
```
**Variable globale Settings :** `storagesData = { storages: [] }`
**Clé snapshot :** `snap.storages`

---

### 3.9 CATEGORIES
**Reader :** `readCategories(snapshotId)`
**Contrat exposé :**
```js
{
  id,
  nom,            // ← raw.label || r.name (fix 2026-06-28)
  api_name,       // identifiant technique
  is_system,
  object_types,   // ['assets','collections',...]
  appliqueeA,     // alias de object_types pour filtre UI
  metadataViews,  // noms des vues (union tous types)
  viewIdsByType:  { assets: [nomVue,...], collections: [...], segments: [...], custom_actions: [...] },
  view_ids,       // IDs bruts
}
```
**⚠️ Point clé :** `viewIdsByType` est la seule source fiable des object_types d'une vue.
Pour trouver les object_types d'une vue `nomVue`, parcourir toutes les catégories et chercher `nomVue` dans `cat.viewIdsByType[objType]`.

**Variable globale Settings :** `categoriesData = { categories: [], defaultViewsByType: {} }`
**⚠️ `defaultViewsByType` toujours vide** — jamais peuplé. Cause des divergences Mirror Check catégories.
**Clé snapshot :** `snap.categories`

---

### 3.10 WEBHOOKS
**Reader :** `readWebhooks(snapshotId)`
**Contrat exposé :**
```js
{ id, nom, url, event_type, eventType, realm, operation, status, headers }
```
**Variable globale Settings :** `webhooksData = { webhooks: [] }`
**Clé snapshot :** `snap.webhooks`

---

### 3.11 AUTOMATIONS
**Reader :** `readAutomations(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, status,       // 'ACTIVE' | 'INACTIVE'
  triggers: [],          // depuis rawData.triggers
  conditions,
  actions: [],
  raw,                   // rawData complet Iconik
}
```
**Variable globale Settings :** `automationsData = { automations: [] }`
**Clé snapshot :** `snap.automations`
**⚠️ Mapping WFD :** `sauvegarderDonnees()` dans Settings mappe via `WFD_Mappers.mapAutomationDeep()` avant de mettre en mémoire.

---

### 3.12 CUSTOM ACTIONS
**Reader :** `readCustomActions(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, title,
  object_types, url, type,
  context,        // premier object_type ou 'ASSET'
  app_id, metadata_view, headers, disabled
}
```
**Variable globale Settings :** `customActionsData = { customActions: [] }`
**Clé snapshot :** `snap.customActions`

---

### 3.13 RELATION TYPES
**Reader :** `readRelationTypes(snapshotId)`
**Contrat exposé :**
```js
{ id, nom, is_directional, source_label, destination_label, description }
```
**Variable globale Settings :** `relationTypesData = { relationTypes: [] }`
**Clé snapshot :** `snap.relationTypes`

---

### 3.14 SYSTEM SETTINGS (Share Settings)
**Reader :** `readSystemSettings(snapshotId)`
**Contrat exposé :** merge flat de `shareSettings`, `searchSettings`, `uploadSettings`, `downloadSettings`, `aclSettings`
**Variable globale Settings :** `systemSettingsData = { settings: {} }`
**Clé snapshot :** `snap.systemSettings`

---

### 3.15 EXPORT LOCATIONS
**Reader :** `readExportLocations(snapshotId)`
**Contrat exposé :**
```js
{
  id, nom, name, location_type, status, description, path,
  storage_id, storage_nom,
  export_original, export_proxy, export_posters, export_metadata,
  metadata_view, metadata_format, export_transcriptions, transcription_format,
  include_original_extension, export_to_asset_folder,
  transcode_profile_ids,
  teams: [{ id, nom, permissions, _origin }],
  users: [{ id, nom, permissions, _origin }]
}
```
**Variable globale Settings :** `exportLocationsData = { exportLocations: [] }`
**Clé snapshot :** `snap.exportLocations`

---

### 3.16 ROLES
**Reader :** `readRoles(snapshotId)`
**Contrat exposé :** `{ id, nom, slug, category, permissions }`
**Variable globale Settings :** peuplé via post-traitement 5b-4 → `rolesData.roles`
**Clé snapshot :** `snap.roles`

---

### 3.17 APPS
**Reader :** `readApps(snapshotId)`
**Contrat exposé :** `{ id, nom, app_type, is_active }`
**Variable globale Settings :** `appsData = { apps: [] }`
**Clé snapshot :** `snap.apps`

---

### 3.18 APP TOKENS / ENVIRONMENTS
**Source :** `GET /api/environments` (pas le snapshot)
**Variable globale Settings :** `appTokensData = { appTokens: [] }`
**Clé snapshot :** aucune — chargé séparément dans `chargerDonnees()` étape 1

---

## 4. Impact map — Qui consomme quoi

### 4.1 Règle UI fondamentale
`assocRowHtml(nom, perm, onDel, permFlags)` **échappe toujours `nom` via `escHtml()`**.
Tout HTML injecté dans `nom` est affiché en texte brut.
Pour des lignes enrichies (badges, icônes) → construire `<div class="assoc-row">` directement.

### 4.2 Tableau d'impact par entité

| Entité | Produit par | Consommé par (Settings) | Consommé par (autres pages) |
|---|---|---|---|
| **collections** | `sync-engine writeCollections` → `readCollections` | `detailTeam`, `detailCollection`, `renderColTree`, `setResolveColPath` | Automations (localStorage), Dashboard (localStorage), Viewer (localStorage + écrit dedans) |
| **teams** | `sync-engine writeTeams` → `readTeams` | `detailTeam`, `detailMDView`, `detailRoleGroup`, `detailSavedSearch`, `detailStorage`, `detailUser`, `detailCategorie` | Automations (localStorage), Dashboard (localStorage), Viewer (localStorage) |
| **users** | `sync-engine writeUsers` → `readUsers` | `detailUser`, `detailTeam` (via post-trait.) | Dashboard (localStorage) |
| **metadataViews** | `sync-engine writeMetadataViews` → `readMetadataViews` | `detailMDView`, `detailTeam`, `detailCategorie`, `detailMetadonnee`, `detailSavedSearch` | Automations (localStorage — pour bindCustomActionEditor) |
| **metadata** | `sync-engine writeFields` → `readFields` | `detailMetadonnee`, `detailMDView` | Automations (localStorage), Dashboard (localStorage) |
| **roleGroups** | `sync-engine writeRoleGroups` → `readRoleGroups` | `detailRoleGroup`, `detailTeam` | Dashboard (localStorage) |
| **savedSearches** | `sync-engine writeSavedSearches` → `readSavedSearches` | `detailSavedSearch`, `detailTeam` | — |
| **storages** | `sync-engine writeStorages` → `readStorages` | `detailStorage`, `detailTeam`, `detailExportLocation` | Dashboard (localStorage) |
| **categories** | `sync-engine writeCategories` → `readCategories` | `detailCategorie`, `detailMDView` (object_types) | Dashboard (localStorage), Automations (localStorage) |
| **webhooks** | `sync-engine writeWebhooks` → `readWebhooks` | Automations settings canvas | Automations (localStorage — bindWebhookEditor) |
| **automations** | `sync-engine writeAutomations` → `readAutomations` | Settings canvas (visualisation) | Automations (localStorage — source principale) |
| **customActions** | `sync-engine writeCustomActions` → `readCustomActions` | `detailTeam` | Automations (localStorage — bindCustomActionEditor) |
| **relationTypes** | `sync-engine writeRelationTypes` → `readRelationTypes` | `detailRelationType` | — |
| **systemSettings** | `sync-engine writeSystemSettings` → `readSystemSettings` | `detailShareSettings` | Dashboard (localStorage) |
| **exportLocations** | `sync-engine writeExportLocations` → `readExportLocations` | `detailExportLocation` | — |
| **roles** | `sync-engine writeRoles` → post-trait. 5b-4 | `detailRoleGroup` (via `rolesData`) | Dashboard (localStorage) |
| **apps** | `sync-engine writeApps` → `readApps` | `detailApp`, `detailAppToken` | Automations (localStorage — bindCustomActionEditor) |

---

## 5. Architecture inter-pages

### 5.1 Sources de données par page

| Page | Source | Mécanisme | Env-aware |
|---|---|---|---|
| **Settings** | DB snapshot `/api/ikon/snapshot/:envSlug` | `chargerDonnees(forcedEnvSlug)` | ✅ `switchEnv()` |
| **Automations** | `localStorage` | `chargerDonnees()` lit `automationsData`, `webhooksData`, `customActionsData`, `teamsData`, `metadataViewsData`, `storagesData`, `collectionsData`, `categoriesData` | ❌ |
| **Dashboard** | `localStorage` | `chargerDonneesShared()` lit toutes les clés connues | ❌ |
| **Viewer** | `localStorage` | Lit `collectionsData`, `teamsData`, `roleGroupsData` | ❌ |
| **Workflow** | Iconik direct (live) | Appels proxy temps réel | ✅ par token |
| **Monitoring** | Iconik direct (live) | Appels proxy temps réel | ✅ par token |

### 5.2 Flux d'écriture localStorage (qui écrit quoi)

| Qui écrit | Clés écrites | Quand |
|---|---|---|
| **Automations** | `automationsData`, `webhooksData`, `customActionsData` | `sauvegarderDonnees()` après chaque modif |
| **Viewer** | `collectionsData` | `dsn_doImport()` — import d'arborescence collections |
| **Viewer** | `dsnDraft` | Sauvegarde du brouillon DSN |
| **Settings** (import fichier) | `teamsData`, `roleGroupsData`, `collectionsData`, `metadataViewsData`, `metadonneesData`, `rolesData`, `itemsAdvancedData`, `savedSearchesData`, `storagesData`, `appTokensData`, `workflowsData`, `categoriesData`, `teamAclsData`, `relationTypesData`, `systemSettingsData` | `importerConfigurationComplete()` uniquement |
| **Settings** | `aps:context` | À chaque `chargerDonnees()` |
| **wfd-sync-bridge-settings** | `iconikAppTokensData`, `iconik:activeEnv` | À chaque sync |

**⚠️ Constat critique :** `sauvegarderDonnees()` dans Settings **n'écrit plus rien** dans localStorage pour les données métier (depuis la migration 2026-06-27). Seul l'import de fichier (cas rare) écrit encore dans localStorage. Donc Automations, Dashboard et Viewer lisent des données vides ou obsolètes depuis localStorage.

### 5.3 Communication inter-pages — WFD_Bus

**WFD_Bus** (BroadcastChannel + localStorage fallback) est utilisé pour :
- `sync_start` / `sync_done` : émis par `wfd-sync-bridge-settings` lors d'une sync Settings
- **Réception Automations** : `wfd-sync-client-automations` écoute `sync_done` et appelle `chargerDonnees()` (qui lit localStorage — toujours vide)

**Non utilisé pour :** propagation du switch d'environnement.

### 5.4 wfd-sync-client-automations — état actuel

Ce fichier lit depuis **variables globales window** (pas localStorage) pour les hooks/custom actions :
```js
const getWebhooks      = () => (window.webhooksData?.webhooks  || []);
const getCustomActions = () => (window.customActionsData?.customActions || []);
const getApps          = () => (window.appsData?.apps || []);
```
Mais `webhooksData`, `customActionsData`, `appsData` dans la page Automations sont peuplés depuis localStorage — pas depuis le snapshot. Donc il lit des variables globales locales à Automations, pas celles de Settings.

---

## 6. Points ouverts — Classés par priorité

### Priorité HAUTE — Bloquants avant mode créatif

| # | Problème | Cause | Fichier(s) à modifier |
|---|---|---|---|
| **H1** | Automations/Dashboard/Viewer lisent localStorage vide | Settings n'écrit plus dans localStorage depuis migration 2026-06-27 | Architecture : migrer vers snapshot ou passer par `/api/ikon/snapshot` |
| **H2** | Switch env Settings ne propage pas vers autres pages | `switchEnv()` ne publie pas sur WFD_Bus | `script-settings.js switchEnv()` → `WFD_Bus.post('ENV_SWITCHED', {slug})` |
| **H3** | Automations charge ses données depuis localStorage périmé | `chargerDonnees()` d'Automations ne connaît pas l'API snapshot | `script-automations.js chargerDonnees()` → migrer vers `/api/ikon/snapshot/:envSlug` |
| **H4** | `defaultViewsByType` toujours vide dans `categoriesData` | Jamais peuplé dans `chargerDonnees()` | `script-settings.js chargerDonnees()` — peupler depuis `snap.categories` |
| **H5** | Badges object_types invisibles dans `detailCategorie` | `assocRowHtml` échappe le HTML — pattern incorrect | `script-settings.js detailCategorie()` — construire `<div class="assoc-row">` directement |
| **H6** | Section "Objets cibles" absente de `detailMDView` | `object_types` toujours `[]` dans le contrat MDView | `script-settings.js detailMDView()` — lire depuis `categoriesData.viewIdsByType` |

### Priorité MOYENNE — Amélioration qualité

| # | Problème | Cause | Fichier(s) à modifier |
|---|---|---|---|
| **M1** | `teamSettings` : dst retourne UUID brut au lieu du nom de vue | `fetchOne` de l'adaptateur APS ne résout pas les view_ids dans `teamSettings` | `aps-mirror-engine.js fetchOne()` |
| **M2** | Mirror Check catégories : 5 divergences `default_view_missing` | `defaultViewsByType` vide côté APS — dépend de H4 | Résolu par H4 |
| **M3** | Viewer écrit dans `collectionsData` localStorage | `dsn_doImport()` modifie et persiste les collections | Phase D — après stabilisation Settings + Automations |
| **M4** | Metadata 3-4 field_diff même nombre d'options | Ordre des options différent entre Iconik et snapshot, ou valeurs légèrement différentes | À investiguer dans Mirror Check engine |

### Priorité Phase D — Dette à éliminer

| # | Problème | Cause | Action |
|---|---|---|---|
| **D1** | `readTeams()` FULL LIST — rétrocompat | Monolithique, chargé même si seul le détail est nécessaire | Remplacer par `readTeamsList()` + `readTeamDetail()` à la demande |
| **D2** | `chargerDonnees()` monolithique | Charge tout en une fois, pas par scope | Remplacer par chargement à la demande par scope |
| **D3** | `groupAcls` non persisté sur `IkonTeam` | Non fetché dans `writeTeams` | Ajouter champ + `fetchTeamAcls()` → `writeTeams()` |
| **D4** | `roleGroups_doc_ids` / `teams_doc_ids` — WFD-only en mémoire | Associations documentaires jamais persistées en DB | Persister dans DB ou table dédiée |
| **D5** | Dashboard lit toutes les clés localStorage | Pas de migration vers snapshot | Migrer `chargerDonneesShared()` vers `/api/ikon/snapshot` |
| **D6** | Viewer lit et écrit localStorage | Plus complexe — lit ET écrit `collectionsData` | Migrer en dernier, après Settings + Automations + Dashboard |
| **D7** | Import fichier Settings écrit dans localStorage | `importerConfigurationComplete()` — cas rare mais fragile | Migrer vers import DB direct |

---

## 7. Séquence de migration recommandée

```
État actuel : Settings = snapshot DB ✅ / Automations + Dashboard + Viewer = localStorage ❌

Étape 1 — Switch env propagation (H2)
  → switchEnv() publie ENV_SWITCHED sur WFD_Bus
  → Automations + Dashboard écoutent et rechargent
  Impact : 1 fichier (script-settings.js), faible risque

Étape 2 — Automations → snapshot (H3)
  → chargerDonnees() dans script-automations.js lit /api/ikon/snapshot/:envSlug
  → Plus de dépendance localStorage pour les données métier
  Impact : script-automations.js, risque moyen (tester tous les cas d'édition)

Étape 3 — Dashboard → snapshot (D5)
  → chargerDonneesShared() migré vers snapshot
  Impact : script-dashboard-shared.js

Étape 4 — Corrections UI Settings (H4, H5, H6)
  → defaultViewsByType peuplé
  → Badges object_types dans detailCategorie
  → Section objets cibles dans detailMDView

Étape 5 — Viewer (D6, M3)
  → Cas le plus complexe — lit ET écrit
  → Traiter en dernier
```

---

## 8. Invariants à ne jamais violer

1. `sync-engine.js` ne contient aucune logique UI. Il fetch Iconik et persiste en DB. C'est tout.
2. `ikon-data.js` est le seul endroit où les IDs sont résolus en noms et où les associations sont croisées.
3. `script-settings.js` consomme et affiche. Il ne résout rien, ne transforme rien (sauf post-traitements documentés).
4. `assocRowHtml()` échappe toujours le nom. Ne jamais y injecter du HTML.
5. `localStorage` n'est autorisé que pour : préférences UI (`wfd_include_*`), contexte actif (`aps:context`), brouillons (`dsnDraft`), toggles. Jamais pour des données métier.
6. `WFD_Bus` est le seul mécanisme de communication inter-pages autorisé.
7. Les variables globales JS (teamsData, collectionsData, etc.) sont locales à chaque page. Elles ne sont pas partagées entre pages — chaque page doit charger ses propres données.

---

## 9. Couche Plateforme — Organisations, Environnements, Connexions, WFD

### 9.1 Architecture deux couches

```
COUCHE PLATEFORME (données APS propres — persistantes, multi-tenant)
────────────────────────────────────────────────────────────────────
Organisation → Environments → Connexions
                           → Flows → Runs
Organisation → PalNodes (nœuds personnalisés)
             → Mappings (règles de transformation)
             → Nommages (règles de nommage fichiers)
             → Scripts (Python / JS)
             → ContactLists
             → NodeDefinitions (catalogue nœuds WFD)

COUCHE ICONIK (données MAM — snapshot par environnement)
────────────────────────────────────────────────────────
IkonSnapshot → IkonTeam, IkonCollection, IkonMetadataView, etc.
```

**Relation clé :** `Environment` est le pivot entre les deux couches.
- Un `Environment` contient les credentials Iconik (appId, tokenEnc) → permet les syncs DS
- Un `Environment` possède des `Flows` (workflows WFD) et des `Connexions` (intégrations externes)
- Un `IkonSnapshot` est rattaché à un `Environment` via `envId`

---

### 9.2 Modèles Prisma — Couche Plateforme

| Modèle | Scope | Colonnes clés | Rattaché à |
|---|---|---|---|
| `Organisation` | Global | `id`, `name`, `slug` | Racine |
| `Environment` | Par org | `name`, `slug`, `type` (prod/qa/dev), `baseUrl`, `appId`, `tokenEnc`, `isDefault` | `Organisation` |
| `Connexion` | Par env | `name`, `type` (iconik/aws_s3/http/listener), `direction` (inbound/outbound), `baseUrl`, `authType`, `authValueEnc`, `extraConfig.mappings` | `Environment` |
| `Flow` | Par env | `name`, `description`, `nodes[]`, `connections[]`, `isActive` | `Environment` + optionnel `Project` |
| `Run` | Par flow | `status`, `triggerType`, `startedAt`, `finishedAt`, `durationMs`, `snapshot`, `errorMessage` | `Flow` |
| `PalNode` | Par org | `family`, `name`, `config` | `Organisation` |
| `Mapping` | Par org | `name`, `rules[]` | `Organisation` |
| `Nommage` | Par org | `name`, `rules[]` | `Organisation` |
| `Script` | Par org | `name`, `lang`, `content` | `Organisation` |
| `ContactList` | Par org | `name`, `contacts[]` | `Organisation` |
| `NodeDefinition` | Par platform | `family`, `label`, `configSchema`, `engineHandler` | `Platform` |

---

### 9.3 Routes API — Couche Plateforme

| Route | Méthodes | Source | Scope |
|---|---|---|---|
| `/api/environments` | GET, POST, PUT, DELETE | DB `Environment` | Tous les envs |
| `/api/environments/credentials` | GET | DB `Environment` (token déchiffré) | WFD uniquement |
| `/api/environments/:id/test` | POST | Ping Iconik live | Test connexion |
| `/api/connexions` | GET, POST, PUT, DELETE | DB `Connexion` | Par `isDefault` env |
| `/api/flows` | GET, POST, PUT, DELETE | DB `Flow` | Par `isDefault` env |
| `/api/wfd/mappings` | GET, POST, PUT, DELETE | DB `Mapping` | Par org |
| `/api/wfd/palnodes` | GET, POST, PUT, DELETE | DB `PalNode` | Par org |
| `/api/wfd/nommages` | GET, POST, PUT, DELETE | DB `Nommage` | Par org |
| `/api/wfd/scripts` | GET, POST, PUT, DELETE | DB `Script` | Par org |
| `/api/wfd/contacts` | GET, POST, PUT, DELETE | DB `ContactList` | Par org |
| `/api/wfd/runs` | GET | DB `Run` | Par `isDefault` env |
| `/api/wfd/organisation` | GET | DB `Organisation` | Premier trouvé |

**⚠️ Point d'attention :** `getDefaultEnvId()` et `getDefaultOrgId()` utilisent `findFirst()` — pas de multi-tenant réel actuellement. Un seul env `isDefault` par org. À corriger pour le multi-client.

---

### 9.4 WFD — Sources de données

Le WFD a **deux sources distinctes** qui coexistent :

#### Source 1 — Données plateforme (DB via API REST)
Chargées par `chargerEtat()` au démarrage et sauvegardées par `_sauvegarderEtatVersServeur()` :

```
/api/flows       → wfdFlows[]
/api/palnodes    → wfdPalNodes[]
/api/mappings    → wfdMappings[]
/api/contacts    → wfdContacts[]
/api/scripts     → wfdScripts[]
/api/connexions  → wfdConnexions[]
/api/nommages    → wfdNommages[]
```
**Fallback offline :** localStorage (`wfdFlows`, `wfdPalNodes`, etc.) si serveur inaccessible.

#### Source 2 — Données Iconik live (proxy APS)
Chargées par `chargerIconikData()` au démarrage et rafraîchies par `wfdRefreshAllData()` :

```
wfdData = {
  automations,    // depuis localStorage (automationsData) ou wfdLiveData_:env
  webhooks,       // idem
  customActions,  // idem
  teams,          // depuis localStorage (teamsData)
  collections,    // depuis localStorage ou wfdLiveData_:env
  mdViews,        // depuis localStorage ou wfdLiveData_:env
  metadata,       // depuis localStorage ou wfdLiveData_:env
  storages,       // depuis localStorage (storagesData)
  savedSearches,  // depuis localStorage ou wfdLiveData_:env
  exportLocations,// depuis localStorage ou wfdLiveData_:env
}
```

**Mécanisme live :** `wfdRefreshAllData()` appelle `/api/iconik/:envType/API/...` (proxy APS) et persiste dans `localStorage['wfdLiveData_:envName']`. `chargerIconikData()` priorise `wfdLiveData` si disponible, sinon fallback localStorage Settings.

**⚠️ Anomalie actuelle :** `chargerIconikData()` lit depuis localStorage (Settings ne l'alimente plus). Le refresh live fonctionne mais uniquement après un clic manuel sur "Actualiser". Au démarrage, `wfdData` est peuplé depuis des données potentiellement obsolètes.

#### Source 3 — Environnements Iconik
```js
function getEnvironnements() {
  return appTokensData.appTokens; // depuis chargerDonneesShared() → localStorage
}
```
**⚠️ Anomalie :** `appTokensData` est lu depuis localStorage dans WFD (via `chargerDonneesShared()`). Or Settings le charge depuis `/api/environments` et ne l'écrit plus en localStorage. Résultat : WFD ne connaît pas les environnements Iconik au démarrage.

**Fix requis :** WFD doit charger `appTokensData` depuis `/api/environments` directement, pas depuis localStorage.

---

### 9.5 Connexions — Rôle dans WFD

Les `Connexion` représentent les intégrations externes du pipeline de livraison :
- **VodFactory** (staging + prod) — endpoint HTTP, auth token
- **AWS S3** — credentials, bucket
- **Amazon Prime** — endpoint livraison
- **Webhook sortant** — URL tierce

Dans le WFD, une connexion est référencée par `cfg.connexionId` dans la config d'un nœud. Lors de l'exécution, le nœud résout `wfdConnexions.find(c => c.id === cfg.connexionId)` pour obtenir l'endpoint et les credentials.

**État actuel :** les connexions sont persistées en DB et chargées correctement via `/api/connexions`. C'est l'un des flux qui fonctionne le mieux.

---

### 9.6 NodeDefinitions — Catalogue des nœuds WFD

`NodeDefinition` est le catalogue des types de nœuds disponibles dans le WFD. Il est rattaché à une `Platform` (Iconik). Il définit :
- `family` — identifiant unique du nœud (ex: `fetch`, `metadata`, `action`)
- `label` — libellé multilingue
- `configSchema` — JSON Schema de la config du nœud
- `engineHandler` — nom de la fonction handler côté engine

**État actuel :** Les `NodeDefinition` existent dans le schema Prisma mais leur alimentation et leur consommation par le WFD ne sont pas encore cartographiées — les nœuds sont pour l'instant définis comme constantes JS dans `script-workflow-designer.js` (catalogue hardcodé).

**À terme :** le catalogue doit venir de DB via une route `/api/node-definitions` pour être dynamique et extensible sans déploiement.

---

### 9.7 Impact map — Couche Plateforme

| Entité | Produit par | Consommé par | État |
|---|---|---|---|
| `Organisation` | Interface admin APS | `wfd-data.js getDefaultOrgId()`, `connexions.js` | ✅ Fonctionnel |
| `Environment` | Interface admin APS | `chargerDonnees()` Settings, `sync-engine.js`, `wfd-data.js getDefaultEnvId()`, WFD `getEnvironnements()` | ⚠️ WFD lit depuis localStorage au lieu de l'API |
| `Connexion` | Interface admin APS + WFD | WFD `wfdConnexions`, moteur d'exécution nœuds | ✅ Fonctionnel (API REST) |
| `Flow` | WFD (éditeur) | WFD `wfdFlows`, `Run`, monitoring | ✅ Fonctionnel (API REST) |
| `Run` | Moteur d'exécution | Monitoring, Dashboard | ✅ Persisté en DB |
| `PalNode` | WFD (palette custom) | WFD `wfdPalNodes` | ✅ Fonctionnel (API REST) |
| `Mapping` | WFD (config nœud mapping) | WFD `wfdMappings`, nœud Mapping | ✅ Fonctionnel (API REST) |
| `Nommage` | WFD (config nœud nommage) | WFD `wfdNommages`, nœud Nommage | ✅ Fonctionnel (API REST) |
| `Script` | WFD (config nœud script) | WFD `wfdScripts`, nœud Script | ✅ Fonctionnel (API REST) |
| `ContactList` | Interface admin + WFD | WFD `wfdContacts`, nœud Notification | ✅ Fonctionnel (API REST) |
| `NodeDefinition` | Admin (non implémenté) | WFD catalogue nœuds | ❌ Non consommé — catalogue hardcodé dans JS |

---

### 9.8 Points ouverts — Couche Plateforme

| # | Problème | Impact | Action |
|---|---|---|---|
| **P1** | WFD lit `appTokensData` depuis localStorage | WFD ne connaît pas les envs Iconik au démarrage | `script-workflow-designer.js` : charger depuis `/api/environments` |
| **P2** | `getDefaultEnvId()` / `getDefaultOrgId()` = `findFirst()` | Pas de multi-tenant réel | Passer l'envId/orgId explicitement en contexte |
| **P3** | `wfdData` (données Iconik) peuplé depuis localStorage au démarrage | Données obsolètes ou vides | Charger depuis snapshot DB au démarrage, refresh live à la demande |
| **P4** | `NodeDefinition` non consommé | Catalogue de nœuds statique | Implémenter `/api/node-definitions` + route WFD |
| **P5** | Connexions non multi-env | Toutes les connexions d'un env `isDefault` | Lier les connexions à l'env actif du flux, pas au `isDefault` |
| **P6** | `Environment` → WFD : quelle env utiliser pour un flow ? | Un flow référence son env par nom (`flux.iconikEnv`) — fragile si renommage | Stocker `envId` (FK) dans `Flow`, pas le nom |


---

## 10. Viewer — Analyse complète

### 10.1 Ce que le Viewer est aujourd'hui

Le Viewer est une page multi-mode avec trois vues distinctes :

**Mode IMAGE** — visionneuse d'image pan/zoom avec minimap. Permet de charger une image externe (schéma, arbo, plan) et de la naviguer. Fonctionnel, autonome, pas de dépendance données.

**Mode CONFIG** — visualiseur d'arborescence Collections avec rendu "dossiers" et connexions SVG. Lit les collections depuis `collectionsData` (localStorage) et les équipe avec les badges teams/permissions. Permet le filtrage par racine et profondeur, l'export SVG/PNG, et le highlight de sous-arbres. C'est le mode le plus élaboré.

**Mode DESIGNER** — éditeur d'arborescence libre. Permet de créer des nœuds, les connecter, les renommer, les dupliquer, undo/redo, lasso multi-sélection. L'arborescence créée peut être :
- Exportée en SVG
- Importée dans `collectionsData` (via `dsn_doImport()` → écrit dans localStorage)
- Sauvegardée comme brouillon (`dsnDraft` dans localStorage)

### 10.2 Sources de données actuelles

| Donnée | Source actuelle | État |
|---|---|---|
| `collectionsData` | `localStorage.getItem('collectionsData')` | ⚠️ Obsolète — Settings n'écrit plus en localStorage |
| `teamsData` | `localStorage.getItem('teamsData')` | ⚠️ Obsolète |
| `roleGroupsData` | `localStorage.getItem('roleGroupsData')` | ⚠️ Obsolète |
| `organisationName` | `localStorage.getItem('organisationName')` | ⚠️ Obsolète |
| `dsnDraft` | `localStorage.setItem('dsnDraft', ...)` | ✅ UI state — localStorage correct |

### 10.3 Ce que le Viewer écrit dans Settings

`dsn_doImport()` — la seule fonction qui écrit dans des données métier :
```js
collectionsData.collections = existing; // modifie en mémoire
localStorage.setItem('collectionsData', JSON.stringify(collectionsData)); // persiste
```
C'est la seule page autre que Settings qui **modifie** des données métier et les **persiste**. C'est le cas le plus complexe à migrer.

### 10.4 Ce que le Viewer sera à terme

Selon la vision :

**Snapshot documentation** — le Viewer produira des snapshots visuels (SVG/PNG) d'arborescences, de schémas WFD, de topologies réseau. Ces snapshots seront consommés par le Documentation Builder pour créer des schémas plus riches que ce que permettent les bibliothèques JS.

**Schéma logique WFD** — visualiser un Flow WFD sous forme de graphe lisible (pas l'éditeur technique, mais une représentation narrative du pipeline).

**Arborescence Collections** — deux usages distincts :
1. *Dessin en amont* (sans données Iconik) : créer une arbo qui nourrira `IkonCollection` dans Settings via SD
2. *Lecture de l'existant* : visualiser l'arbo depuis les données `collectionsData` du snapshot

**Animations ST2110** — les routes live/stream (ST2110) seront animées dans les schémas topologiques réseau.

### 10.5 Points ouverts Viewer

| # | Problème | Action |
|---|---|---|
| **V1** | `loadData()` lit localStorage obsolète | Migrer vers `/api/ikon/snapshot/:envSlug` |
| **V2** | `dsn_doImport()` écrit dans localStorage | Migrer vers `POST /api/ikon/snapshot/:envSlug/collections` ou endpoint dédié |
| **V3** | `dsnDraft` reste en localStorage | ✅ Acceptable — c'est un brouillon UI temporaire |
| **V4** | Mode CONFIG : badges teams depuis localStorage | Migrer vers snapshot pour avoir les permissions réelles |
| **V5** | Export SVG/PNG : pas de lien avec le Doc Builder | Implémenter `POST /api/doc-assets` pour persister les exports |
| **V6** | Animations ST2110 : non commencées | Future feature — nécessite un modèle de données topologie réseau |

