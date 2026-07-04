# Cartographie WFD — APS Askida Platform Studio
_Mise à jour le 4 juillet 2026 — à jour avec commit dcbb657_

---

## 1. Vue d'ensemble : les fichiers et leur rôle

```
server/
├── engine/
│   ├── wfd-engine.js              → Assembleur : crée l'instance Engine (context + executor + trigger)
│   ├── wfd-engine-context.js      → Contexte d'exécution (ctx) : vars, results, erreurs, resolve()
│   ├── wfd-engine-executor.js     → Exécute un flux nœud par nœud, gère les ports de sortie
│   ├── wfd-engine-trigger.js      → Écoute les déclencheurs (Custom Action, timer, SSE...)
│   ├── wfd-engine-handlers.js     → Logique métier de chaque famille de nœud (3500+ lignes)
│   ├── wfd-engine-express.js      → Intégration Express : routes /wfd/*, boot, chargement DB
│   ├── wfd-run-history.js         → Historique des runs (in-memory, exposé via SSE)
│   ├── wfd-node-meta.js           → Métadonnées des familles de nœuds (icônes, ports, labels)
│   └── wfd-node-fetch.js          → Helper fetch Iconik pour les nœuds de type "Récupérer"
│
├── public/platforms/iconik/
│   ├── workflow/
│   │   ├── workflow.html                  → Structure HTML + ordre de chargement scripts
│   │   ├── workflow-designer.css          → SEULE source de vérité CSS pour le Workflow
│   │   ├── script-workflow-designer.js    → Runtime frontend : canvas, SSE, état global, wfdData
│   │   ├── wfd-config-panel.js            → Panels de configuration UI de chaque nœud
│   │   ├── wfd-run-panel.js               → Panel Run (résultats d'exécution)
│   │   ├── wfd-api-ops.js                 → Tiroir API Ops
│   │   ├── wfd-logger.js                  → Logger WFD
│   │   ├── wfd-instrumentation.js         → Instrumentation (wrapping de sauvegarderConfig)
│   │   ├── script-workflow-word.js        → Export Word
│   │   └── script-workflow-nodered.js     → Déploiement Node-RED
│   │
│   ├── search/
│   │   └── search.html                    → Page Recherche admin (HTML autonome avec CSS inline)
│   │
│   └── _shared/
│       ├── aps-nav.js                     → Navbar commune APS (NOUVEAU 2026-07-04)
│       ├── aps-data.js
│       ├── aps-mirror-engine.js
│       ├── wfd-bus.js
│       ├── wfd-job-manager.js
│       ├── wfd-sync-bridge-settings.js
│       ├── wfd-sync-client-automations.js
│       └── sync-mappers.js
│
└── routes/
    ├── connexions.js              → CRUD /api/connexions
    └── iconik-proxy.js            → Proxy APS vers Iconik API
```

---

## 2. Architecture CSS — Workflow Designer

### Principe fondamental (établi 2026-07-04)

**"Tout ce qui touche à l'apparence va dans le CSS, le JS ne manipule que le comportement."**

### Source unique de vérité : `workflow-designer.css`

Toutes les règles visuelles du Workflow Designer doivent être dans ce fichier. Le HTML et le JS ne contiennent pas de styles visuels (sauf exceptions légitimes ci-dessous).

### Exceptions légitimes dans le JS/HTML

1. **`style="display:none"`** — comportement JS (montrer/cacher), acceptable
2. **`style="--cat-color:${value}"`** — CSS custom properties pour valeurs dynamiques, acceptable
3. **Styles uniques 1x très contextuels** — acceptable si vraiment ponctuel

### Ce qui est interdit dans le JS

```js
// ❌ INTERDIT
element.style.color = '#e74c3c';
element.style.backgroundColor = value;
element.style.borderBottomColor = '#9b59b6';

// ✅ CORRECT
element.classList.toggle('active', isActive);
element.style.setProperty('--cat-color', value);
element.style.display = 'none';
```

### Convention des classes

- `.wfd-c-*` — couleurs
- `.wfd-row-*` — flex layouts
- `.wfd-card-*` — blocs card
- `.wfd-mono-*` — monospace
- `.wfd-hint-*` — labels secondaires
- `.wfd-modal-sm/md/lg/xl/res/script/map/map-edit/import` — largeurs modales
- `.tb-btn.c-green/blue/grass/orange/purple/red/muted` — couleurs toolbar
- `.cfg-btn.c-blue/orange/green/grass/red/purple` — couleurs config panel
- `.wfd-modal-footer.split` — footer avec justify-content:space-between

### Plafond de la consolidation Phase 1

| Fichier | Styles restants | Nature |
|---|---|---|
| `wfd-config-panel.js` | 541 | Templates literals + display:none + uniques |
| `script-workflow-designer.js` | 223 | Templates literals + display:none + uniques |
| `wfd-run-panel.js` | 35 | Templates literals + uniques |
| `wfd-api-ops.js` | 37 | Templates literals + uniques |
| `workflow.html` | 70 | display:none + custom-properties + uniques |

### Phase 2 CSS — Planifiée

**Option A (moins invasive) :** CSS Custom Properties pour les valeurs dynamiques
```js
// Avant
`style="color:${cfg.color}"`
// Après
`style="--node-color:${cfg.color}"`
// CSS
.wfd-node { color: var(--node-color); }
```

**Option B (plus propre) :** Refactoriser le HTML généré dans `renderCanvas` et `buildCfgFields` en composants sémantiques avec classes CSS.

---

## 3. Navbar commune — aps-nav.js

### Usage

```html
<!-- Dans le <head> -->
<script src="../_shared/aps-nav.js"></script>

<!-- Dans le <body> -->
<div id="aps-header"></div>

<!-- Init (dans DOMContentLoaded ou inline après le script) -->
<script>
  apsNav.init({ activePage: 'workflow', extras: 'engines', pageTitle: 'Workflow Designer' });
</script>
```

### Paramètres

| Paramètre | Valeurs | Description |
|---|---|---|
| `activePage` | `'workflow'`, `'recherche'`, `'dashboard'`... | Bouton nav actif |
| `extras` | `'engines'`, `'env-select'`, `null` | Zone droite du header |
| `pageTitle` | string | Titre dans `document.title` |

### Pages migrées

| Page | Status |
|---|---|
| `workflow.html` | ✅ Migré (`extras: 'engines'`) |
| `search.html` | ✅ Migré (`extras: 'env-select'`) |
| `dashboard.html` | ⏳ À migrer |
| `settings.html` | ⏳ À migrer |
| `automations.html` | ⏳ À migrer |
| `viewer.html` | ⏳ À migrer |
| `monitoring.html` | ⏳ À migrer |

### Source de vérité organisation

`orgBadge` est peuplé par `aps-nav.js` via `GET /api/organisation`. Plus besoin de `chargerOrg()` dans les pages qui utilisent `aps-nav.js`.

---

## 4. Cycle de vie d'un déclenchement

### Étape 1 — Réception du webhook (wfd-engine-express.js)

```
Iconik → POST https://aps-askida.com/wfd/action/:slug
         → Cloudflare Tunnel
         → Express router /wfd/action/:slug
         → Vérifie _fluxesReady (503 si pas prêt)
         → Cherche dans _engine._getFluxes() le flux dont le slug correspond
         → isCustomAction = payload.auth_token + asset_ids
                          OR payload.collection_ids + context === 'COLLECTION'
         → Si isCustomAction → _dispatchCustomAction(payload, flux, runFlux)
         → Sinon → runFlux(normalizeIconikPayload(payload))
         → Répond immédiatement { received: true, fluxes: N }
```

### Étape 2 — Normalisation du payload (wfd-engine-trigger.js)

```
normalizeIconikPayload(raw)
  → assetId      = raw.asset_ids[0] || raw.object_id
  → collectionId = raw.collection_ids[0] || raw._collection_id
  → Retourne {
      asset      : { id: assetId, type: contextType },
      collection : { id: collectionId },
      event      : { type, realm, operation, viewId },
      user       : { id: raw.user_id },
      _iconikAuth: { token, appId },
      _raw       : raw,
    }
```

### Étape 3 — Injection dans le contexte (wfd-engine-executor.js)

```
executeFlux(flux, triggerPayload, ...)
  → ctx = WfdContext.createContext({ ...triggerPayload })
  → ctx.asset.id      = triggerPayload.asset?.id
  → ctx.collection.id = triggerPayload.collection?.id
  → WfdContext.setVar(ctx, 'asset_id', assetId)
  → WfdContext.setVar(ctx, 'collection_id', colId)
  → ctx._iconikAuth   = triggerPayload._iconikAuth
```

---

## 5. Le contexte (ctx) — wfd-engine-context.js

```js
ctx = {
  asset      : { id: '' },
  collection : { id: '' },
  file       : {},
  event      : {},
  user       : { id: '' },
  vars    : {},
  results : {},
  status   : 'running',
  errors   : [],
  runId    : 'run-xxx',
  fluxId   : 'cmq...',
  _trigger : {},
  _iconikAuth : { token, appId },
}
```

### Résolution de variables — resolve(template, ctx)

`{varName}` dans n'importe quel champ est résolu dans cet ordre :

1. `ctx.asset.varName`
2. `ctx.vars.varName`
3. `ctx.results.varName`
4. Chaîne originale si non trouvé

**Transformations inline :**
- `{slug(Titre)}`, `{upper(X)}`, `{lower(X)}`, `{trim(X)}`
- `{variable?texte_si_présent|texte_si_absent}`

---

## 6. Les familles de nœuds et leurs handlers

| family | Description |
|---|---|
| `trigger` | Custom Action, timer, webhook |
| `fetch` | Récupère asset/collection/metadata/formats Iconik |
| `lookup` | Table de correspondance champs Iconik → payload API |
| `decision` | Branchement conditionnel |
| `id_generator` | Génère un ID unique (avec BayardRegistry) |
| `update_meta` | PATCH metadata Iconik (asset OU collection) |
| `workflow_history` | Écrit dans un champ MD Iconik |
| `action` | Export Location, actions Iconik diverses |
| `wait_for` | Polling job Iconik jusqu'à FINISHED |
| `aws_s3` | list_objects, head_object, artwork_s3 |
| `http_request` | Appel HTTP outbound |
| `http_sequence` | Séquence d'appels HTTP |
| `checker` | Vérifie des conditions sur des endpoints HTTP |
| `gate` | Pause manuelle |
| `aps_search` | Recherche multi-blocs Iconik (NOUVEAU) |

---

## 7. Nœud aps_search

### Architecture

```
Panel config (wfd-config-panel.js) :
  srBlockHtml()         → génère HTML d'un bloc de critères
  srAutoSave()          → sauvegarde silencieuse dans node.config
  srRerender()          → appelle ouvrirConfigPanel(node)
  srFieldChange()       → reset opérateur si incompatible avec nouveau type
  srOpChange()          → rerender si basculement vers/depuis between

Handler moteur (wfd-engine-handlers.js) :
  handler('aps_search') → POST /API/search/v1/search/ (direct, pas snapshot)
  → between operator : { name: fname, range: { gt, lt }, condition: 'must' }
  → __collection__ → ancestor_collections (in_branch) ou in_collections (in_collection)
```

### DB — Table ApsSearch

```sql
CREATE TABLE "ApsSearch" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
```

Route CRUD : `/api/aps-search`

### Problème connu — Browse collections vide

Le tree de collections s'affiche vide à l'ouverture du panel. Cause : `wfdColTreeHtml` est appelé dans `buildCfgFields` avant que le DOM soit prêt. `_wfdChargerSnapshotDB` (async) déclenche `renderCanvas` qui reconstruit le panel.

**État actuel :** placeholder `col-tree-placeholder` + `setTimeout(100ms)` après `panel.open`. Non résolu.

---

## 8. Proxy Iconik — snapshot vs direct

```
iconik-proxy.js
  Pour chaque requête GET /:envName/API/...
    → findHandler(method, path)
    → Si handler trouvé ET handled: true → sert depuis snapshot DB
    → Si handler retourne handled: false → proxyToIconik() (direct)
    → Si pas de handler → proxyToIconik() (direct)

Endpoints passés en direct (bypass snapshot) :
  - GET /API/assets/v1/custom_actions/
  - GET /API/metadata/v1/views/
  - GET /API/metadata/v1/views/{id}/
  - POST /API/search/v1/search/           ← aps_search (NOUVEAU)
  - GET /API/metadata/v1/fields/          ← aps_search (NOUVEAU)

WFD utilise toujours Iconik en direct (pas de snapshot)
Settings utilise les snapshots DB comme source de vérité
```

---

## 9. Routes /wfd/*

| Route | Description |
|---|---|
| `POST /wfd/action/:slug` | Custom Action Iconik → dispatch flux |
| `GET /wfd/events` | SSE → UI (progression temps réel) |
| `GET /wfd/status` | État moteur |
| `POST /wfd/load-fluxes` | Recharge flux depuis DB |
| `POST /wfd/activate/:fluxId` | Active un flux |
| `POST /wfd/deactivate/:fluxId` | Désactive un flux |
| `GET /wfd/paused` | Runs en pause (Gate) |
| `POST /wfd/release/:runId` | Libère un run en pause |
| `GET /wfd/runs` | Historique runs |

---

## 10. Points fragiles / dettes techniques

1. **Browse collections vide** — `wfdColTreeHtml` timing non résolu dans `aps_search`
2. **`cfg-btn { flex:1 }`** — trop large dans contexte aps_search, surcharge CSS nécessaire
3. **Phase 1 CSS non validée** — tester tous les workflows QA avant Phase 2
4. **Proxy snapshot vs direct** — migration incomplète. Tous les endpoints WFD devraient aller en direct.
5. **Double source WfdHandlers._connexions** — loadActiveFluxes() vs /wfd/load-connexions.
6. **Drift Prisma** — IkonExportLocation.aclData ajouté manuellement.
7. **Styles inline Phase 2** — ~906 restants (templates literals + display:none + uniques).
8. **Navbar** — à intégrer dans dashboard, settings, automations, viewer, monitoring.

---

## 11. Variables clés — workflow Amazon Prime

| Variable | Produit par | Utilisé par |
|---|---|---|
| `asset_id` | Trigger | Tous les nœuds Iconik |
| `collection_id` | Trigger (COLLECTION) | Fetch metadata collection, update_meta |
| `primeContents` | Récupérer (fetch asset) | LookUp source |
| `exportJobId` | Export Location | wait_for |
| `s3_video_url` | AWS S3 list_objects | vodFactoryPayload, Video Action |
| `generated_id` | id_generator | Écriture BayardID Iconik |
| `external_id` | LookUp (depuis mapped) | Contents Action endpoint |
| `vodFactoryPayload` | LookUp | Contents Action body |

---

## 12. Chargement au démarrage

```
index.js → app.listen(3000)
  → wfdEngineRouter.start()
      → initEngine()
      → setTimeout(2000ms)
      → loadIconikClients()
      → _initNommageTemplates()
      → loadActiveFluxes()
          → WfdHandlers._connexions = outbound connections
          → _engine.loadFluxes(flows)
          → _engine.activateFlux(id) pour chaque flux isActive
          → _fluxesReady = true
```
