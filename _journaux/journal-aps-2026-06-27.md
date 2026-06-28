# Journal de session APS — 27 juin 2026

## Dernier commit Git
```
bea471f (HEAD -> main, origin/main) chore: migration localStorage → variables globales (settings, mirror-engine, apicheck, sync-client-automations)
f15b758 chore: neutralisation localStorage.setItem données métier (settings + workflow)
a6f855d fix: compteur teams exclut stubs ACL + guard _apsLoading race condition
d7f1d99 feat: timestamp snapshot dans barre org Settings
6e00a8c chore: nettoyage fichiers parasites + workspace VS Code
008d131 refactor: déplacement frontend Desktop → aps/server/public
2d0e5ba init: premier commit APS — serveur Node.js + Prisma + routes
```
Dépôt : https://github.com/FarTop/aps-askida

---

## Décision architecturale fondamentale — WFD vs Settings

**Settings** = source de vérité pour la configuration, la documentation, les comparaisons entre environnements. Le snapshot DB est le bon choix ici — on compare des états, on audite, on synchronise.

**WFD (Workflow Designer)** = orchestrateur temps réel. Il doit voir l'état Iconik à l'instant T, pas un snapshot. Un asset qui vient de passer en statut "validé" doit être traité immédiatement — pas à la prochaine sync.

### Conséquences pour le WFD
- **Pas de dépendance au snapshot DB** — le WFD ne passe pas par `chargerDonnees` ni par la DB
- **GET et POST directs vers Iconik** via le proxy `iconik-proxy.js` (couche d'authentification et routing uniquement, sans cache DB)
- Les données de configuration dans les nœuds (collections, saved searches, metadata fields) → GET direct Iconik au moment de l'exécution
- Les actions (écrire une métadonnée, changer un statut, déclencher une action) → POST direct Iconik
- C'est exactement ce que faisait l'Electron, le proxy est déjà là

### Ce que le WFD ne doit PAS faire
- Lire depuis `chargerDonnees` ou un snapshot DB pour ses données d'exécution
- Dépendre de la dernière sync Settings pour connaître l'état d'un asset
- Utiliser localStorage pour bootstrapper ses données métier d'exécution

### Priorité week-end (28-29 juin)
**Objectif : parité fonctionnelle WFD avec l'état Electron, plus retours VodFactory**
- WFD charge ses données directement depuis Iconik via proxy (pas depuis DB)
- Nœuds existants opérationnels : Fetch, Action, Message, Meta, Permissions, Renommage
- Moteur d'exécution sans régression
- Retours VodFactory : 5 posters obligatoires avec résolutions minimales par type de vignette (box, cover, etc.) — spec à partager en session
- Nœud de renommage : les espaces sont interdits selon les specs Amazon → remplacement obligatoire

---

## Ce qui a été accompli aujourd'hui

### Infrastructure
- **Git initialisé** sur `~/aps` + poussé sur GitHub (compte FarTop, dépôt privé `aps-askida`)
- **VS Code Remote SSH** configuré depuis le PC Windows → Mac Mini (`192.168.1.102`) — Mac Mini désormais headless, tout se fait depuis le PC
- **Frontend consolidé** : déplacé de `~/Desktop/MAM/app/frontend/public/` vers `~/aps/server/public/` — `server/index.js` mis à jour (`__dirname + '/public'`)
- **Nettoyage** : fichiers `_Copie`, `_script-*` (underscore) supprimés, `_debug/` exclu du Git, `APS.code-workspace` commité

### Bugs corrigés (Settings)
- **Fix Prisma** : `aclData Json?` déplacé de `IkonTeam` vers `IkonExportLocation` dans `schema.prisma` + `prisma generate` sans migration
- **Sélecteur d'environnement** dans la barre org Settings : switch PROD ↔ QA fonctionnel, cache sessionStorage keyé par env (`aps_settings_cache_prod`, `aps_settings_cache_qa`), seul l'env par défaut est caché (quota)
- **Sync bridge** corrigé : `wfd-sync-bridge-settings.js` lit `window._apsActiveEnvSlug` en priorité + `aps:context` écrit par `chargerDonnees`
- **Post-sync** : `script-sync.js` invalide le bon cache et rappelle `chargerDonnees(slug)` avec l'env actif
- **ACLs Storages** : `writeStorages` dans `sync-engine.js` persiste `teamIds` depuis `fetchStorageAcls` ; proxy `getAclIndex` reconstruit `stAcl` depuis `IkonStorage.teamIds` au lieu de `IkonTeam.storageIds` (toujours vide)
- **ACLs Export Locations** : persistées en DB + affichées dans le détail
- **MD View** résolue en nom (au lieu de l'ID) dans le détail Export Location
- **Compteur Export Locations** ajouté dans `updateCounters`
- **Compteur Teams** : exclut les stubs ACL (`is_acl_stub`, `source === 'acl_stub'`)
- **Timestamp snapshot** affiché dans la barre org (`#snapshot-ts`) — mis à jour au chargement DB et à la restauration cache
- **Guard `_apsLoading`** : bloque `switchEnv` pendant le chargement initial (race condition au hard reload)

### Kit sync DD (`script-kit.js`)
- **`keyFn` case-sensitive** pour le scope `metadata` dans `sync_dd.js` + détection doublons de casse
- **Mirror Check** ajouté dans `sync_dd_standalone.html` : carte dédiée, respecte les scopes cochés, checkbox `🔐 Vérifier les ACLs` (collections, MD views, saved searches, custom actions, export locations)
- **Export Locations** ajouté dans `sync_dd.js` : création/MAJ sans `storage_id` + ACLs teams (par nom) et users (par email)
- **README** mis à jour : Export Locations + section Mirror Check complète
- **`exportLocations`** ajouté dans `ALL_SCOPES` et la liste `active`

### Nettoyage localStorage
**Neutralisés (`setItem` → commentaire `// (DB)`)** :
- `script-sync.js` : `roleGroupsData`, `rolesData`, `itemsAdvancedData`, `automationsData_raw`, `automationsData`, `systemSettingsData`
- `script-settings.js` : `automationsData_raw`, `automationsData`, `organisationName`, `teamsData`, `roleGroupsData`, `savedSearchesData`, `customActionsData`
- `script-workflow-designer.js` : `automationsData`, `webhooksData`, `customActionsData`, `organisationName`

**Migrés (`getItem` → variables globales)** :
- `settings-apicheck.js` : `webhooksData`, `customActionsData`, `automationsData`, `relationTypesData`, `organisationName`
- `aps-mirror-engine.js` : `categoriesData.defaultViewsByType`, `metadataViewsData.viewFieldsById`
- `wfd-sync-client-automations.js` : `getArr()` remplacé par lectures directes `window.*Data`
- `script-settings.js` : `systemSettingsData` (fallback supprimé), bloc export impex migré vers variables globales + `input-org-name`

---

## Points ouverts

### Bugs en suspens
- **Affichage PROD après hard reload** (aléatoire) — guard `_apsLoading` atténue mais n'élimine pas totalement ; à surveiller

### localStorage non migrés (Phase D — hors WFD)
Ces modules lisent encore depuis localStorage. Le WFD est un cas à part (voir décision architecturale ci-dessus). Les autres attendent la Phase D :
- `script-automations.js` : lignes 153-200, 2824, 2864, 2912, 5836, 8946-9229
- `dashboard/` : `script-dashboard-shared.js`, `script-dashboard-main.js`, `script-dashboard-excel.js`, `script-dashboard-canvas.js`, `dashboard.html`
- `viewer/script-viewer.js` : `collectionsData`, `teamsData`, `roleGroupsData`, `organisationName`, `dsnDraft`
- `monitoring/script-monitoring.js` : `appTokensData`, `organisationName`
- **Bloc impex** (`script-settings.js` lignes 4152-4159, `script-workflow-designer.js` ligne 6850) — marqué `TODO Phase D`

### Phase D — Architecture (après le week-end)
- **Persister `collectionIds`/`viewIds`** dans `IkonTeam` lors de la sync scope `teams`
- **Remplacer `chargerDonnees()` monolithique** par chargement à la demande par entité
- **Supprimer sessionStorage** une fois le chargement à la demande en place
- **Migrer les modules restants** (automations, dashboard, viewer, monitoring) vers endpoints DB

### Roadmap complète
- **A** ✅ Git + VS Code Remote SSH
- **B** ✅ Bugs + timestamp (sauf affichage PROD aléatoire)
- **C** ✅ Consolidation frontend
- **WFD** 🔲 Parité fonctionnelle Electron — priorité week-end
- **D** 🔲 Cache → chargement à la demande + migration localStorage modules restants
- **E** 🔲 Déploiement Git automatisé + API d'administration
- **F** 🔲 IA intégrée (prérequis : D + E)

---

## Informations techniques stables

### Serveur
- `node ~/aps/server/index.js` (depuis n'importe quel répertoire)
- Frontend : `~/aps/server/public/` (consolidé aujourd'hui)
- PostgreSQL : `psql aps_db`
- Prisma : `cd ~/aps && npx prisma generate` après tout changement de schema

### Git
- Remote : `https://github.com/FarTop/aps-askida.git`
- Workflow : modifier sur PC via VS Code Remote → commit → push
- Credential helper : `store` (token mémorisé, warnings `-25308` cosmétiques inoffensifs)

### Accès
- Local : `http://192.168.1.102:3000`
- Public : `https://aps-askida.com` (Cloudflare Tunnel)
- VS Code Remote SSH : `faridradi@192.168.1.102`

### IDs stables
- Env PROD : `cmqs2c1hz0001avu5d4yfbxmq`
- Env QA slug : `qa`
- Snapshot QA récent : `cmqtdxmnr01f7ogu5o0z8qeyh` (26/06 11:34)
- Snapshot PROD récent : `cmqtvhqy70001agu522g65pxn` (25/06 19:11)
- TRASH collection PROD : `bbdd8de6-2cf5-11f1-b95b-ae3fc3ee082c`
- Export Location PRIME (QA) : `f51748d2-5db4-11f1-bdc2-52e9b30fbd6f`

### Principes de développement
- **Investiguer avant de patcher** : console simulation → vérifier sur disque → patcher
- **Fichiers Mac Mini = référence** : toujours lire depuis le terminal, jamais régénérer depuis les notes
- **Git avant tout chantier** : commit propre avant modification importante
- **localStorage = UI state uniquement** : données métier → DB (Settings) ou Iconik direct (WFD)
- **`// (DB)`** : marqueur sur les `localStorage.setItem` neutralisés
- **`TODO Phase D`** : marqueur sur les blocs à migrer en Phase D
- **WFD = temps réel** : GET/POST directs Iconik via proxy, jamais via snapshot DB
