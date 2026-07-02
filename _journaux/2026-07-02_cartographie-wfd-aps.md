# Cartographie WFD — APS Askida Platform Studio
_Mise à jour le 2 juillet 2026 — à jour avec commit dba4ecb_

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
├── public/platforms/iconik/workflow/
│   ├── wfd-config-panel.js        → Panels de configuration UI de chaque nœud (9700+ lignes)
│   └── script-workflow-designer.js → Runtime frontend : rendu du canvas, SSE, état global
│
└── routes/
    ├── connexions.js              → CRUD /api/connexions (lecture/écriture DB connexions)
    └── iconik-proxy.js            → Proxy APS vers Iconik API (snapshot DB ou fallback direct)
```

---

## 2. Cycle de vie d'un déclenchement

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

### _dispatchCustomAction — logique de dispatch

```
context === 'COLLECTION' :
  → Lance le flux avec la collection comme contexte directement
    runFlux({ ...raw, collection_ids: [collectionId], context: 'COLLECTION' })

context === 'ASSET' :
  → Pour chaque asset dans asset_ids :
    runFlux(normalizeIconikPayload({ ...raw, asset_ids: [assetId] }))
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
      _iconikAuth: { token, appId },   // si Custom Action
      _raw       : raw,
    }
```

### Étape 3 — Injection dans le contexte (wfd-engine-executor.js)

```
executeFlux(flux, triggerPayload, ...)
  → ctx = WfdContext.createContext({ ...triggerPayload })
  → ctx.asset.id     = triggerPayload.asset?.id
  → ctx.collection.id = triggerPayload.collection?.id   ← NOUVEAU
  → WfdContext.setVar(ctx, 'asset_id', assetId)
  → WfdContext.setVar(ctx, 'collection_id', colId)       ← NOUVEAU
  → ctx._iconikAuth  = triggerPayload._iconikAuth
```

### Étape 4 — Exécution des nœuds (wfd-engine-executor.js)

```
Pour chaque nœud du flux (selon les connexions) :
  executeNode(node, ctx, ...)
    → handler = nodeHandlers[node.family]
    → result = await handler(node, ctx, nodeClient)
    → result.port → détermine quel nœud suivant
    → onEvent('node:done', ...) → SSE vers le navigateur
```

---

## 3. Le contexte (ctx) — wfd-engine-context.js

```js
ctx = {
  asset      : { id: '' },     // Peuplé par trigger ou nœud Récupérer
  collection : { id: '' },     // Peuplé par trigger (Custom Action COLLECTION)
  file       : {},
  event      : {},
  user       : { id: '' },

  vars    : {},    // Variables utilisateur — WfdContext.setVar()
  results : {},    // Résultats nœuds — WfdContext.storeResult()

  status   : 'running',
  errors   : [],
  runId    : 'run-xxx',
  fluxId   : 'cmq...',
  _trigger : {},
  _iconikAuth : { token, appId },  // Credentials Custom Action (si présents)
}
```

### Résolution de variables — resolve(template, ctx)

`{varName}` dans n'importe quel champ est résolu dans cet ordre :

1. `ctx.asset.varName`
2. `ctx.vars.varName`
3. `ctx.results.varName` (avec navigation pointée : `{result.sous-champ}`)
4. Chaîne originale si non trouvé

**Transformations inline :**
- `{slug(Titre)}` → slugifie la valeur de `{Titre}`
- `{upper(X)}`, `{lower(X)}`, `{trim(X)}`
- `{variable?texte_si_présent|texte_si_absent}` → conditionnel

---

## 4. Les familles de nœuds et leurs handlers

| family | handler | Description |
|---|---|---|
| `trigger` | wfd-engine-trigger.js | Custom Action, timer, webhook |
| `fetch` | `fetch()` | Récupère asset/collection/metadata/formats Iconik |
| `lookup` | `lookup()` | Table de correspondance champs Iconik → payload API |
| `decision` | `decision()` | Branchement conditionnel |
| `id_generator` | `id_generator()` | Génère un ID unique (avec BayardRegistry) |
| `update_meta` | `update_meta()` | PATCH metadata Iconik (asset OU collection) |
| `workflow_history` | `workflow_history()` | Écrit dans un champ MD Iconik |
| `action` | `action()` | Export Location, actions Iconik diverses |
| `wait_for` | `wait_for()` | Polling job Iconik jusqu'à FINISHED |
| `aws_s3` | `aws_s3()` | list_objects, head_object, artwork_s3 |
| `http_request` | `handleHttpRequest()` | Appel HTTP outbound (simple/foreach/verify/action) |
| `http_sequence` | `handleHttpSequence()` | Séquence d'appels HTTP |
| `checker` | `checker()` | Vérifie des conditions sur des endpoints HTTP |
| `gate` | `gate()` | Pause manuelle (Release depuis l'UI) |

---

## 5. Pipeline d'un nœud http_sequence

```
handleHttpSequence(node, ctx, iconikClient)
  → cfg.steps[] → liste des étapes

  Pour chaque step :
    virtualNode.config = { ...step, connexionId: step.connexionId || cfg.connexionId }
    handleHttpRequest(virtualNode, ctx, iconikClient)

      Mode 'simple' :
        bodyTpl = cfg.body || cfg.bodyTemplate
        Si vide → fallback automatique :
          1. cfg.sourceVar dans ctx.results ou ctx.vars
          2. ctx.vars.vodFactoryPayload (JSON.parse si string)
          3. Premier objet non-interne dans ctx.results
        → _expandDotKeys(payload) + _encodeDeepPayload (URLs S3 → %20)
        → fetch(baseUrl + endpoint)
        → Upsert auto si 422 : retry PUT avec external_id

      Mode 'foreach' :
        → Itère sur cfg.feSourceVar
        → Body : interpolateForeach(cfg.feBody, val, i)
        → Stocke dans cfg.feResultVar (PAS vodFactoryPayload si feJob renseigné)

      Mode 'verify' / 'action' : voir handlers dédiés
```

**Résolution baseUrl :**
```js
const baseUrl = conn?.baseUrl || conn?.endpoint || '';
```

---

## 6. Pipeline de la LookUp

```
lookup(node, ctx)
  → cfg.lkInputVar → source (ex: {primeContents})
  → cfg.lkRows[]  → mappings { key, value, type, children, fallback, _format }

  Pour chaque row :
    Résolution val (ordre de priorité) :
      1. fromKey contient "{" → r(fromKey, ctx)         [variable de contexte]
      2. inputRaw[fromKey]                               [champ Iconik direct]
      3. inputRaw.metadata_values[fromKey].field_values  [MD Iconik]
      4. ctx.vars[fromKey]                               [var de contexte]
      5. row.fallback → r(fallback, ctx)                 [fallback variable]

    _setNestedValue(mapped, toKey, val) :
      "title"                              → mapped.title
      "images.amazon.cover_art"            → mapped.images.amazon.cover_art
      "availabilities.amazon[].starts_at"  → mapped.availabilities.amazon[0].starts_at
      "availabilities.amazon[0].country_code" → fusion dans amazon[0] (même objet)
      "persons[job=director].external_id"  → mapped.persons.push({job, external_id})

  Résultat :
    storeResult(ctx, outputVar, mapped)
    setVar(ctx, outputVar, JSON.stringify(mapped))
    → Champs plats exposés : ctx.vars.external_id = mapped.external_id
```

---

## 7. Pipeline fetch metadata (subType: 'metadata')

```
fetch(node, ctx, iconikClient)  [subType === 'metadata']
  → varName  = cfg.fetchVar || cfg.storeAs
  → assetId  = ctx.asset?.id || ''
  → colId    = ctx.collection?.id || ''
  → objectType = colId && !assetId ? 'collections' : 'assets'   ← NOUVEAU
  → objectId   = objectType === 'collections' ? colId : assetId
  → endpoint = /API/metadata/v1/{objectType}/{objectId}/views/{viewId}/

  Si 404 → { metadata_values: {} }  (vue non initialisée — pas une erreur)

  Après fetch :
    storeResult(ctx, varName, data)
    Pour chaque champ MD :
      setVar(ctx, varName + '.' + fieldName, value)  ← NOUVEAU
      → ex: {collectionData.BayardID} résolvable dans Décision
```

---

## 8. id_generator avec BayardRegistry

```
id_generator(node, ctx)  [type === 'numeric']
  → assetId  = ctx.asset?.id || ctx.vars?.asset_id || ''
  → colId    = ctx.collection?.id || ctx.vars?.collection_id || ''   ← NOUVEAU
  → objectId = assetId || colId
  → objectType = assetId ? 'asset' : 'collection'

  1. Cherche dans BayardRegistry WHERE assetId = objectId
     → Si trouvé : réutilise le même bayardId (garantie idempotence)
  2. Sinon : génère ID + vérifie unicité (max 10 tentatives)
  3. Enregistre dans BayardRegistry { bayardId, assetId: objectId, assetType: objectType }

Table BayardRegistry :
  id TEXT, bayardId TEXT UNIQUE, assetId TEXT, assetType TEXT, orgId TEXT, createdAt
```

---

## 9. update_meta — support collections

```
update_meta(node, ctx, iconikClient)
  cfg.target = 'asset' | 'collection'

  Mode 'fields' :
    endpoint = /API/metadata/v1/{assets|collections}/{id}/views/{viewId}/

  Mode 'view' :
    Si cfg.target === 'collection' :
      actionType = 'metadata_collection'
      collectionId = cfg.targetId || '{collection.id}'
      viewId = cfg.mdViewId
    Sinon :
      actionType = 'metadata_patch'  (comportement historique)
```

---

## 10. Proxy Iconik — snapshot vs direct

```
iconik-proxy.js
  Pour chaque requête GET /:envName/API/...
    → findHandler(method, path)
    → Si handler trouvé ET handled: true → sert depuis snapshot DB
    → Si handler retourne handled: false → proxyToIconik() (direct)
    → Si pas de handler → proxyToIconik() (direct)

Endpoints passés en direct (bypass snapshot) :
  - GET /API/assets/v1/custom_actions/          → données live WFD
  - GET /API/metadata/v1/views/                 → données live WFD
  - GET /API/metadata/v1/views/{id}/            → données live WFD

Endpoints encore sur snapshot DB (à migrer) :
  - GET /API/metadata/v1/fields/
  - GET /API/assets/v1/export_locations/
  - GET /API/notifications/v1/webhooks/
  - ... (tous les autres handlers avec handled: true)
```

---

## 11. Variables clés — workflow Amazon Prime

| Variable | Produit par | Utilisé par |
|---|---|---|
| `asset_id` | Trigger | Tous les nœuds Iconik |
| `collection_id` | Trigger (COLLECTION) | Fetch metadata collection, update_meta |
| `primeContents` | Récupérer (fetch asset) | LookUp source |
| `exportJobId` | Export Location | wait_for |
| `s3_video_url` | AWS S3 list_objects | vodFactoryPayload, Video Action |
| `s3_srt_url` | AWS S3 list_objects (sans doublon -N) | Video Action subtitles |
| `s3_cover_url` .. `s3_title_url` | AWS S3 artwork_s3 | LookUp fallbacks → vodFactoryPayload |
| `generated_id` | id_generator | Écriture BayardID Iconik, LookUp fallback external_id |
| `external_id` | LookUp (depuis mapped) | Contents Action endpoint, Video Action body |
| `vodFactoryPayload` | LookUp | Contents Action body (fallback automatique) |
| `personsResult` | http_sequence foreach | (intermédiaire) |
| `duration` | LookUp Technique | Video Action body |

**Variables workflow Collection :**
| Variable | Produit par | Utilisé par |
|---|---|---|
| `collection_id` | Trigger | update_meta collection |
| `collectionData.BayardID` | Récupérer (fetch metadata) | Décision (vide/présent) |
| `generated_id` | id_generator | update_meta BayardID |

---

## 12. Chargement au démarrage

```
index.js → app.listen(3000)
  → wfdEngineRouter.start()  [fire-and-forget]
      → initEngine()
      → setTimeout(2000ms)
      → loadIconikClients()       → _iconikClients[envName] = client HTTP Iconik
      → _initNommageTemplates()   → WfdHandlers._nommages
      → loadActiveFluxes()
          → WfdHandlers._connexions = outbound connections
          → WfdHandlers._nommages   = nommage rules
          → _engine.loadFluxes(flows)
          → _engine.activateFlux(id) pour chaque flux isActive
          → _fluxesReady = true
```

---

## 13. Routes /wfd/*

| Route | Description |
|---|---|
| `POST /wfd/action/:slug` | Custom Action Iconik → dispatch flux |
| `GET /wfd/events` | SSE → UI (progression temps réel) |
| `GET /wfd/status` | État moteur (running, fluxesReady, activeFluxes) |
| `POST /wfd/load-fluxes` | Recharge flux + connexions + nommages depuis DB |
| `POST /wfd/load-connexions` | Remplace WfdHandlers._connexions depuis UI |
| `POST /wfd/activate/:fluxId` | Active un flux |
| `POST /wfd/deactivate/:fluxId` | Désactive un flux |
| `GET /wfd/paused` | Runs en pause (Gate) |
| `POST /wfd/release/:runId` | Libère un run en pause |
| `GET /wfd/runs` | Historique runs |

---

## 14. Points fragiles / dettes techniques

1. **Proxy snapshot vs direct** — migration incomplète. Tous les endpoints WFD devraient aller en direct. Session dédiée nécessaire.

2. **Double source WfdHandlers._connexions** — loadActiveFluxes() vs /wfd/load-connexions. Formats différents (roles/actions absents dans source B).

3. **ctx.collection non peuplé par défaut** — injecté uniquement si triggerPayload.collection.id est présent. Les flux asset ne peuplent pas ctx.collection.

4. **bodyTemplate vs body** — moteur lit `cfg.body`, UI écrit `cfg.bodyTemplate`. Patch : `cfg.body || cfg.bodyTemplate`. À harmoniser.

5. **Drift Prisma** — IkonExportLocation.aclData ajouté manuellement. Migrations non synchronisées avec schema.prisma.

6. **PrismaClient multi-instances** — chaque loadActiveFluxes(), _initNommageTemplates() crée sa propre instance. À centraliser.

7. **Comportements aléatoires flux actif/inactif** — cause profonde non identifiée. /wfd/load-connexions peut écraser l'état en mémoire.

8. **Logs debug temporaires** — nombreux `[DEBUG ...]` à retirer avant mise en production.

---

## 15. Nœud "Recherche APS" — conception (à implémenter)

Architecture validée :

**Blocs** (objets Iconik avec critères) :
```
Bloc N :
  Objet : Asset | Collection | Segment | Saved Search | Format | Storage | ...
  Dans  : [Bloc M] (relation parent — jointure)
  Critères :
    [champ] [opérateur] [valeur]
    AND|OR
    [champ] [opérateur] [valeur]
```

**Opérateurs par type :**
- Texte : equals, not_equals, contains, not_contains, starts_with, is_empty, is_not_empty
- Date  : before, after, between, ago (valeur + unité liste), is_empty, is_not_empty
- Entier: equals, gt, lt, between, is_empty, is_not_empty
- Liste : contains_any, contains_all, not_contains, is_empty, is_not_empty
- Booléen: is_true, is_false, is_empty

**Expression booléenne :**
```
1 AND 2 AND (3 OR 4) AND NOT 5
```
Champ libre avec numéros de blocs + AND/OR/NOT + parenthèses uniquement.

**Résultat :**
```
Retourner : [Bloc N ▼]
Limite    : [500]
Variable  : { search_results }
```

**Export vers plateformes externes** : instructions API séquentielles (Switch, Node-RED, n8n, Lambda).
