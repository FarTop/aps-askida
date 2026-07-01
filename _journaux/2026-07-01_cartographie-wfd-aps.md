# Cartographie WFD — APS Askida Platform Studio
_Rédigée le 1er juillet 2026 — à jour avec commit f7b4efc_

---

## 1. Vue d'ensemble : les fichiers et leur rôle

```
server/
├── engine/
│   ├── wfd-engine.js              → Assembleur : crée l'instance Engine (context + executor + trigger)
│   ├── wfd-engine-context.js      → Contexte d'exécution (ctx) : vars, results, erreurs, resolve()
│   ├── wfd-engine-executor.js     → Exécute un flux nœud par nœud, gère les ports de sortie
│   ├── wfd-engine-trigger.js      → Écoute les déclencheurs (Custom Action, timer, SSE...)
│   ├── wfd-engine-handlers.js     → Logique métier de chaque famille de nœud (3300+ lignes)
│   ├── wfd-engine-express.js      → Intégration Express : routes /wfd/*, boot, chargement DB
│   ├── wfd-engine-context.js      → (voir ci-dessus)
│   ├── wfd-run-history.js         → Historique des runs (in-memory, exposé via SSE)
│   ├── wfd-node-meta.js           → Métadonnées des familles de nœuds (icônes, ports, labels)
│   └── wfd-node-fetch.js          → Helper fetch Iconik pour les nœuds de type "Récupérer"
│
├── public/platforms/iconik/workflow/
│   ├── wfd-config-panel.js        → Panels de configuration UI de chaque nœud (9500+ lignes)
│   └── script-workflow-designer.js → Runtime frontend : rendu du canvas, SSE, état global
│
└── routes/
    └── connexions.js              → CRUD /api/connexions (lecture/écriture DB connexions)
```

---

## 2. Cycle de vie d'un déclenchement

### Étape 1 — Réception du webhook (wfd-engine-express.js)

```
Iconik → POST https://aps-askida.com/wfd/action/vodfactory
         → Cloudflare Tunnel
         → Express router /wfd/action/:slug
         → Vérifie _fluxesReady (503 si pas prêt)
         → Cherche dans _engine._getFluxes() le flux dont le slug correspond
         → Si trouvé et actif : lance l'exécution en arrière-plan
         → Répond immédiatement { received: true, fluxes: N }
```

### Étape 2 — Exécution du flux (wfd-engine-executor.js)

```
executeFlux(flux, payload, nodeHandlers, iconikClient, onEvent)
  → createContext(payload)          // ctx vierge avec asset/vars/results/errors
  → Pour chaque nœud du flux (selon les connexions) :
      executeNode(node, ctx, ...)
        → handler = nodeHandlers[node.family]    // ex: nodeHandlers['aws_s3']
        → result = await handler(node, ctx, nodeClient)
        → result.port → détermine quel nœud suivant
        → onEvent('node:done', ...) → SSE vers le navigateur
```

### Étape 3 — Dispatch vers le handler (wfd-engine-handlers.js)

```
handler(node, ctx, iconikClient)
  → node.config    = configuration persistée en DB (JSON)
  → ctx            = contexte partagé de l'exécution courante
  → iconikClient   = { get, post, put, patch, delete } vers l'API Iconik
  → Retourne { port: N } où N est l'index du port de sortie (0 = nominal)
```

---

## 3. Le contexte (ctx) — wfd-engine-context.js

```js
ctx = {
  asset      : {},          // Objet asset Iconik (peuplé par le trigger ou le nœud Récupérer)
  collection : {},          // Objet collection Iconik
  file       : {},          // Objet file Iconik
  event      : {},          // Payload brut de l'événement
  user       : {},          // Utilisateur déclencheur

  vars    : {},             // Variables utilisateur — écrites par setVar(), lues par {varName}
  results : {},             // Résultats nœuds — écrits par storeResult(), lus par ctx.results.X

  status   : 'running',    // running | success | partial | failed
  errors   : [],           // [{ node, message, severity: 'warn'|'fatal' }]
  runId    : 'run-xxx',
  fluxId   : 'cmq...',
  _trigger : {},           // Payload brut du trigger (lecture seule)
}
```

### Résolution de variables — ordre de priorité

`{varName}` dans n'importe quel champ de configuration est résolu par `WfdContext.resolve()` :

1. `ctx.asset.varName` (ex: `{asset.id}`, `{asset.title}`)
2. `ctx.vars.varName` (ex: `{BayardID}`, `{s3_video_url}`)
3. `ctx.results.varName` (ex: `{primeContents}`, `{vodFactoryPayload}`)
4. Si non trouvé → retourne la chaîne originale `{varName}` telle quelle

**Important :** `ctx.vars` et `ctx.results` sont deux espaces distincts :
- `ctx.vars` : scalaires exposés via `WfdContext.setVar(ctx, 'key', value)`
- `ctx.results` : objets complets exposés via `WfdContext.storeResult(ctx, 'key', data)`
- Un résultat objet stocké dans `results` est aussi accessible via `{key.sous-champ}` grâce à `resolvePath()`

---

## 4. Les familles de nœuds et leurs handlers

| family | handler dans wfd-engine-handlers.js | Description |
|---|---|---|
| `trigger` | (géré par wfd-engine-trigger.js) | Déclencheur Custom Action / timer |
| `fetch` | `fetch()` | Récupère assets/metadata/formats Iconik |
| `lookup` | `lookup()` | Table de correspondance champs Iconik → payload API |
| `decision` | `decision()` | Branchement conditionnel (ports 0, 1, 2...) |
| `id_generator` | `id_generator()` | Génère un ID numérique aléatoire 8 chiffres |
| `update_meta` | `update_meta()` | PATCH metadata Iconik |
| `workflow_history` | `workflow_history()` | Écrit dans un champ historique Iconik |
| `action` | `action()` | POST vers une Export Location Iconik |
| `wait_for` | `wait_for()` | Polling d'un job Iconik jusqu'à FINISHED |
| `aws_s3` | `aws_s3()` | Opérations S3 : list_objects, head_object, artwork_s3 |
| `http_request` | `handleHttpRequest()` | Appel HTTP vers une connexion outbound (modes: simple/foreach/verify/action) |
| `http_sequence` | `handleHttpSequence()` | Séquence d'appels HTTP via `handleHttpRequest()` |
| `checker` | `checker()` | Vérifie des conditions sur des endpoints HTTP |
| `gate` | `gate()` | Pause manuelle (attend un "Release" depuis l'UI) |
| `workflow_history` | `workflow_history()` | Écrit l'historique dans un champ MD Iconik |
| `lookup` | `lookup()` | (voir détail section 6) |

---

## 5. Pipeline d'un nœud http_sequence

```
handleHttpSequence(node, ctx, iconikClient)
  → cfg = node.config
  → cfg.connexionId → connexion outbound (WfdHandlers._connexions)
  → cfg.steps[] → liste des étapes

  Pour chaque step :
    virtualNode = { config: { ...step, connexionId: step.connexionId || cfg.connexionId } }
    handleHttpRequest(virtualNode, ctx, iconikClient)
      → mode = cfg.httpMode || 'simple'

      Mode 'simple' :
        → buildBody(cfg.body || cfg.bodyTemplate)
            Si vide → fallback automatique depuis ctx.vars.vodFactoryPayload
            Sinon → résolution des {varName} + _expandDotKeys + _encodeDeepBody
        → fetch(baseUrl + endpoint, { method, headers, body })
        → Upsert auto : si 422 → retry en PUT avec external_id

      Mode 'foreach' :
        → _handleHttpForeach()
        → Itère sur cfg.feSourceVar (ex: {Realisateur})
        → Pour chaque valeur : interpolateForeach(cfg.feBody, val, i)
        → Si cfg.feJob renseigné → injecte dans ctx.vars[resultVar] existant (non écrasement)
        → Stocke dans cfg.feResultVar (ex: personsResult)

      Mode 'verify' :
        → _handleHttpVerify()
        → GET endpoint + vérifie une condition sur la réponse

      Mode 'action' :
        → _handleHttpAction()
        → Lit conn.actions[actionId] (système connexion — peu utilisé)
```

---

## 6. Pipeline de la LookUp

```
lookup(node, ctx, iconikClient)
  → cfg.lkInputVar  = source (ex: "{primeContents}")
  → cfg.lkOutputVar = cible  (ex: "vodFactoryPayload")
  → cfg.lkRows[]    = mappings [{ key, value, type, children, fallback, _format }]

  inputRaw = ctx.results[inputVar] || ctx.vars[inputVar]
             → objet Iconik (résultat d'un nœud Récupérer)

  Pour chaque row :
    fromKey = row.key   (ex: "BayardID", "URLCoverArt", "{generated_id}")
    toKey   = row.value (ex: "external_id", "images.amazon.cover_art")

    Résolution de val :
      1. Si fromKey contient "{" → r(fromKey, ctx)  ← VARIABLE DE CONTEXTE
      2. Sinon inputRaw[fromKey]                      ← CHAMP ICONIK DIRECT
      3. Sinon inputRaw.metadata_values[fromKey].field_values[0].value  ← MD ICONIK
      4. Sinon ctx.vars[fromKey]                      ← VAR DE CONTEXTE (clé simple)
      5. Sinon row.fallback → r(fallback, ctx)        ← FALLBACK VARIABLE

    Transformations :
      - row.type = 'list'    → val = Array.isArray(val) ? val : [val]
      - row.type = 'integer' → val = parseInt(val)
      - row._format = 'slug' → val = slugify(val)
      - row.children[]       → traduction valeur (ex: "Drame" → "av_genre_drama")

    _setNestedValue(mapped, toKey, val) :
      - "title"                          → mapped.title = val
      - "images.amazon.cover_art"        → mapped.images.amazon.cover_art = val
      - "genres[]"                       → mapped.genres = [val]
      - "availabilities.amazon[].starts_at" → mapped.availabilities.amazon[0].starts_at = val
      - "availabilities.amazon[0].country_code" → fusion dans le même amazon[0]
      - "persons[job=director].external_id" → mapped.persons.push({job:'director', external_id: val})

  Résultat :
    storeResult(ctx, 'vodFactoryPayload', mapped)
    setVar(ctx, 'vodFactoryPayload', JSON.stringify(mapped))
    → Champs plats exposés dans ctx.vars (ex: ctx.vars.external_id = mapped.external_id)
```

---

## 7. Variables clés dans le workflow Amazon Prime

| Variable | Type | Produit par | Utilisé par |
|---|---|---|---|
| `asset_id` | string | Trigger | Tous les nœuds Iconik |
| `primeContents` | object | Récupérer (fetch) | LookUp (source) |
| `assetTechnique` | object | Récupérer formats | LookUp onglet Technique |
| `exportJobId` | string | Export Location (action) | wait_for |
| `s3_video_url` | string | AWS S3 list_objects | vodFactoryPayload, Video Action |
| `s3_image_url` | string | AWS S3 list_objects | (intermédiaire, avant renommage) |
| `s3_srt_url` | string | AWS S3 list_objects | Video Action (sous-titres) |
| `s3_cover_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_box_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_hero_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_poster_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_season_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_episodic_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `s3_title_url` | string | AWS S3 artwork_s3 | LookUp fallback → vodFactoryPayload |
| `generated_id` | string | id_generator | Écriture BayardID, LookUp fallback external_id |
| `external_id` | string | LookUp (exposé depuis mapped) | Contents Action endpoint, Video Action body |
| `vodFactoryPayload` | object/string | LookUp | Contents Action body (automatique) |
| `personsResult` | array | http_sequence foreach persons | (résultat intermédiaire, non réutilisé) |
| `duration` | string | LookUp onglet Technique | Video Action body |
| `video_quality` | string | LookUp onglet Technique | vodFactoryPayload |

---

## 8. Chargement au démarrage (wfd-engine-express.js)

```
index.js
  → require('./engine/wfd-engine-express.js')
  → app.listen(3000, callback)
      → wfdEngineRouter.start()   ← fire-and-forget (sans await)
          → initEngine()          → crée _engine (WfdTrigger + WfdExecutor)
          → setTimeout(2000ms)    → attend que Express soit prêt
          → loadIconikClients()   → Prisma : charge les tokens Iconik par env
          → _initNommageTemplates() → Prisma : charge les templates de nommage
          → loadActiveFluxes()    → Prisma : charge flux actifs + connexions outbound
              → _fluxesReady = true
              → WfdHandlers._connexions = connexionsFmt.filter(outbound)
              → WfdHandlers._nommages   = nommages
              → _engine.loadFluxes(flows)
              → _engine.activateFlux(fluxId) pour chaque flux actif
```

**Points de vigilance au démarrage :**
- `start()` est lancé sans `await` → le serveur accepte des requêtes pendant le chargement
- Le flag `_fluxesReady` protège la route `/wfd/action/:slug` (503 si pas prêt)
- `WfdHandlers._connexions` peut être réécrit par l'UI via `POST /wfd/load-connexions` — dernier write wins

---

## 9. Communication frontend ↔ backend (wfd-engine-express.js)

| Route | Sens | Description |
|---|---|---|
| `POST /wfd/action/:slug` | Iconik → APS | Déclenchement Custom Action |
| `GET /wfd/events` | APS → UI (SSE) | Push événements temps réel (progression nœuds) |
| `GET /wfd/status` | UI → APS | État du moteur (`running`, `fluxesReady`, `activeFluxes`) |
| `POST /wfd/load-fluxes` | UI → APS | Recharge flux et connexions depuis DB |
| `POST /wfd/load-connexions` | UI → APS | Remplace `WfdHandlers._connexions` (envoyé par le frontend) |
| `POST /wfd/activate/:fluxId` | UI → APS | Active un flux en mémoire |
| `POST /wfd/deactivate/:fluxId` | UI → APS | Désactive un flux en mémoire |
| `GET /wfd/paused` | UI → APS | Liste les runs en pause (Gate) |
| `POST /wfd/release/:runId` | UI → APS | Libère un run en pause (Gate) |
| `GET /wfd/runs` | UI → APS | Historique des runs récents |
| `POST /wfd/set-iconik-client` | UI → APS | Change l'environnement Iconik actif |

---

## 10. Connexions outbound — format en mémoire

`WfdHandlers._connexions` est un tableau d'objets connexion outbound. Deux sources l'alimentent :

**Source A — loadActiveFluxes() (Prisma direct) :**
```js
{
  id, name, type, direction,
  endpoint   : c.baseUrl,   // rétrocompat
  authType   : c.authType,  // 'bearer' | 'aws_s3' | 'apikey_header' | 'basic'
  authValue  : decrypt(c.authValueEnc),
  roles      : c.extraConfig?.roles    || [],
  actions    : c.extraConfig?.actions  || [],
  mappings   : c.extraConfig?.mappings || [],
  isActive   : c.isActive,
}
```

**Source B — POST /wfd/load-connexions (format REST /api/connexions) :**
```js
{
  id, name, type, direction,
  endpoint,      // c.baseUrl depuis DB
  authType, authValue,
  mappings, description, isActive,
  // NB : roles et actions absents dans ce format
}
```

**Résolution baseUrl dans les handlers :**
```js
const baseUrl = conn?.baseUrl || conn?.endpoint || '';
// → toujours utiliser ce pattern pour rétrocompat
```

---

## 11. Points fragiles / dettes techniques connues

1. **Double source de WfdHandlers._connexions** — loadActiveFluxes() vs /wfd/load-connexions. Dernier write wins, formats légèrement différents (roles/actions présents uniquement dans source A).

2. **start() fire-and-forget** — le serveur répond avant que les flux soient chargés. Protégé par `_fluxesReady` sur la route action, mais d'autres routes n'ont pas cette protection.

3. **resultVar avec accolades** — l'UI `hseqReadSteps` stripait les accolades (fix f7b4efc), mais tout champ UI "Résultat" dans le moteur doit être vigilant sur ce point.

4. **bodyTemplate vs body** — le moteur lit `cfg.body`, l'UI écrit `cfg.bodyTemplate`. Patch : `cfg.body || cfg.bodyTemplate`. À harmoniser dans une future migration.

5. **Encodage URLs S3** — doit être appliqué systématiquement sur tout payload envoyé à une API externe. Actuellement géré dans `buildBody` et dans le fallback automatique, mais pas dans tous les chemins de code.

6. **PrismaClient multi-instances** — chaque appel à `loadActiveFluxes()`, `_initNommageTemplates()` etc. crée sa propre instance PrismaClient. Recommandation : partager une instance unique à l'échelle du module.
