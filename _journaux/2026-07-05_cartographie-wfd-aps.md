# Cartographie WFD — APS Askida Platform Studio
_Mise à jour le 5 juillet 2026 — à jour avec commit 03e6b2f_

---

## 1. Architecture cible — Séparation des responsabilités

```
CSS   → apparence (workflow-designer.css, wfd-tokens.css)
JS    → comportement + données uniquement
HTML  → structure sémantique avec classes CSS
```

### Règle unique

**Tout ce qui touche à l'apparence va dans le CSS. Le JS ne manipule que le comportement.**

### Valeurs légitimes en style= (à conserver)

```js
style="left:${x}px;top:${y}px"       // position canvas — calculée
style="height:${h}px"                  // hauteur ports — calculée
style="top:${14+i*22}px"              // position port — calculée
style="display:none"                   // comportement JS
style="display:${cond?'':'none'}"     // affichage conditionnel JS
style="--node-color:${color}"         // custom property dynamique
style="--status-color:${c}"          // custom property dynamique
```

---

## 2. Fichiers et rôles

```
server/
├── engine/
│   ├── wfd-engine.js              → Assembleur Engine
│   ├── wfd-engine-context.js      → Contexte d'exécution (ctx)
│   ├── wfd-engine-executor.js     → Exécute un flux nœud par nœud
│   ├── wfd-engine-trigger.js      → Déclencheurs (Custom Action, timer, SSE)
│   ├── wfd-engine-handlers.js     → Logique métier handlers (~4000 lignes)
│   ├── wfd-engine-express.js      → Routes Express /wfd/*
│   ├── wfd-run-history.js         → Historique runs (in-memory)
│   ├── wfd-node-meta.js           → Métadonnées familles nœuds
│   └── wfd-node-fetch.js          → Helper fetch Iconik
│
├── public/platforms/iconik/
│   ├── workflow/
│   │   ├── workflow.html                  → Structure HTML
│   │   ├── workflow-designer.css          → SEULE source CSS visuelle
│   │   ├── wfd-tokens.css                 → Design tokens (:root) [NOUVEAU]
│   │   ├── wfd-components.js              → Templates HTML canvas [NOUVEAU]
│   │   ├── script-workflow-designer.js    → Runtime canvas, état global, wfdData
│   │   ├── wfd-config-panel.js            → Config panels nœuds
│   │   ├── wfd-run-panel.js               → Panel run (résultats)
│   │   └── wfd-api-ops.js                 → Tiroir API Ops
│   │
│   └── _shared/
│       ├── aps-nav.js                     → Navbar commune APS
│       └── wfd-bus.js                     → Bus événements
```

---

## 3. Composants canvas — Architecture

### Nœud canvas (renderNode refactorisé)

```js
// renderNode — utilise WfdComponents + _attachNodeListeners
function renderNode(layer, node) {
  const fam     = FAMILIES[node.family] || FAMILIES.action;
  const detail  = getNodeDetail(node);
  const ports   = node.ports || buildPortsDef(node.family, node.config || {});
  const html    = WfdComponents.node(node, fam, isSelected, isReadOnly, detail, ports);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const div = wrapper.firstElementChild;
  _attachNodeListeners(div, node);
  layer.appendChild(div);
}
```

### WfdComponents.node() — HTML généré

```html
<div id="wfd-node-{id}" class="wfd-node [selected] [readonly] [draft]"
  style="left:{x}px;top:{y}px;--node-color:{fam.color};">
  <div class="wfd-node-header">
    <span class="wfd-node-icon">{icon}</span>
    <div class="wfd-flex1-min0">
      <div class="wfd-node-name">{name} [<span class="wfd-draft-badge">⚙ à configurer</span>]</div>
      <div class="wfd-node-family">{label} · {sub}</div>
    </div>
  </div>
  <div class="wfd-node-body"><div class="wfd-node-detail">{body}</div></div>
  <div class="wfd-node-ports" style="height:{portH}px;position:relative;">
    <div class="wfd-port port-in" style="top:{top}px;--port-color:{color};"
      data-node-id="{id}" data-port-type="in" data-port-idx="{i}">
      <span class="wfd-port-label">{label}</span>
    </div>
    <div class="wfd-port port-out" style="top:{top}px;--port-color:{color};"
      data-node-id="{id}" data-port-type="out" data-port-idx="{i}">
      <span class="wfd-port-label">{label}</span>
    </div>
  </div>
</div>
```

### CSS Custom Properties nœuds canvas

```css
/* workflow-designer.css */
.wfd-node-header {
  background: color-mix(in srgb, var(--node-color, #888) 9%, transparent);
  border-bottom-color: color-mix(in srgb, var(--node-color, #888) 20%, transparent);
}
.wfd-node { border-color: color-mix(in srgb, var(--node-color, #888) 40%, transparent); }
.wfd-node-draft { border-style: dashed; opacity: 0.9; }
.wfd-port { border: 2px solid var(--port-color, var(--wfd-border2)); }
.wfd-draft-badge { color: var(--node-color, #888); background: color-mix(...); }
.wfd-postit { background: color-mix(in srgb, var(--postit-color, #f1c40f) 9%, transparent); }
```

### _attachNodeListeners — Event listeners

Tous les listeners séparés du HTML :
- `mousedown` → `startDragNode` (sauf Ctrl/Meta/Shift)
- `click` → sélection simple, multi (Ctrl), lasso
- `dblclick` → Run Panel (readonly) ou config panel
- Ports `.wfd-port` → `setupPortDrag` via querySelectorAll

---

## 4. Config panel — Architecture

### buildCfgFields — Structure

```js
function buildCfgFields(pfx, family, cfg) {
  let html = '';
  
  if (family === 'postit') { ... }
  else if (family === 'trigger') { ... }
  // ... ~30 familles
  else if (family === 'aps_search') { ... }
  
  // Commun à tous les nœuds sauf exclus :
  html += buildOnErrorField(pfx, cfg, family);
  return html;
}
```

### buildOnErrorField — "En cas d'erreur"

Familles **exclues** : `trigger`, `watchfolder`, `listener`, `source`, `postit`, `timer`
Familles **incluses** : toutes les autres (dont `notification`)

HTML généré :
```html
<div class="cfg-field wfd-onerror-wrap">
  <label class="cfg-label">EN CAS D'ERREUR</label>
  <div class="wfd-onerror-btns">
    <button class="wfd-onerror-btn [active-status]" data-onerror="stop" ...>🛑 Arrêter</button>
    <button class="wfd-onerror-btn [active-status]" data-onerror="continue_log" ...>⚠️ Continuer + noter</button>
    <button class="wfd-onerror-btn [active-status]" data-onerror="continue" ...>✅ Ignorer</button>
  </div>
  <input type="hidden" id="{pfx}-onerror-val" value="{val}">
</div>
```

Sauvegarde : dans `sauvegarderConfig`, lecture générique via `cfg-onerror-val`.

**⚠️ MOTEUR NON IMPLÉMENTÉ** — `wfd-engine-handlers.js` doit être mis à jour pour propager les erreurs selon `node.config.onError`.

### update_meta — Boutons W/R/C

Chaque ligne de champ :
```html
<div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:5px;">
  [clé] [valeur] [W][R][C] [×]
</div>
```

- `W` = Écrire (défaut)
- `R` = Effacer (vide le champ Iconik)
- `C` = Copier (source → destination)

Sauvegarde : `_readUpdateMetaConfig` lit `.um-field-op` → `{ key, value, op }`.

**⚠️ MOTEUR NON IMPLÉMENTÉ** — `wfd-engine-handlers.js` ne lit pas encore `op` par ligne.

---

## 5. aps_search — Browse collections

### Mécanisme de sélection (event-driven)

```
wfdColSelect(e, prefix, id, name)
  → met à jour col-selected (tableau JSON)
  → dispatche CustomEvent('wfd:col-selected', { bubbles: true, detail: { prefix, selIds } })
  
panel._srColListener (posé par ouvrirConfigPanel)
  → reçoit wfd:col-selected
  → sync col-selected → sr-crit-val (tableau JSON)
  → appelle srAutoSave('cfg')
  
srAutoSave('cfg')
  → appelle srReadBlocks('cfg')
  → srReadBlocks lit col-selected (tableau JSON complet)
  → node.config.blocks mis à jour
  → _sauvegarderEtatVersServeur()
```

### srBlockHtml — génération HTML critère collection

```js
// crit.value = tableau JSON ["id1","id2"] ou simple ID (rétrocompat)
let _colIds2 = [];
try { _colIds2 = JSON.parse(_colVal2); ... } catch(e) { _colIds2 = _colVal2 ? [_colVal2] : []; }
// wfdColTreeHtml génère col-selected + col-tags + col-tree complets
const _colTreeHtml2 = wfdColTreeHtml(_colPrefix2, JSON.stringify(_colIds2));
// sr-crit-val stocke le tableau JSON complet
+ '<input type="hidden" class="sr-crit-val" value="' + escHtml(JSON.stringify(_colIds2)) + '">'
```

---

## 6. État CSS — Bilan Phase 1 + Phase 2

### Résultats de la consolidation

| Fichier | Avant | Après Phase 1 | Après Phase 2 |
|---|---|---|---|
| `workflow.html` styles inline | ~200 | 70 | ~70 |
| `script-workflow-designer.js` | 484 | 223 | ~180 |
| `wfd-config-panel.js` | 1113 | 541 | ~541 |
| `wfd-run-panel.js` | 55 | 35 | 0 ✅ |
| `wfd-api-ops.js` | 41 | 37 | 0 ✅ |

### Style= légitimes restants (à ne pas toucher)

1. `display:none/flex/grid` conditionnels — comportement JS
2. CSS custom properties `--xxx:${value}` — valeurs dynamiques
3. Positions calculées `left:${x}px;top:${y}px` — canvas
4. `accent-color:${color}` sur radios — valeur dynamique

### Chantier restant — HTML généré dans buildCfgFields

`wfd-config-panel.js` contient encore des centaines de `style=` inline dans le HTML généré par `buildCfgFields` et ses ~30 sous-fonctions (Gate, Timer, Cron, Notification, ACL, Lookup, HTTP, etc.). C'est le chantier principal de la prochaine session de consolidation CSS.

**Approche recommandée :**
1. Traiter famille par famille (Gate, puis Timer, puis Notification...)
2. Pour chaque famille : identifier les patterns répétitifs → créer classes CSS → remplacer
3. Valider visuellement après chaque famille
4. node --check + commit après chaque famille

---

## 7. Cycle de vie d'un déclenchement

```
Iconik → POST /wfd/action/:slug
  → wfd-engine-express.js
  → normalizeIconikPayload()
  → executeFlux(flux, payload)
  → WfdContext.createContext()
  → nœud par nœud via wfd-engine-executor.js
  → wfd-engine-handlers.js (handler par famille)
  → SSE events → UI
```

### Contexte (ctx)

```js
ctx = {
  asset      : { id: '' },
  collection : { id: '' },
  vars    : {},
  results : {},
  status  : 'running',
  errors  : [],
  runId   : 'run-xxx',
  _iconikAuth : { token, appId },
}
```

### Résolution variables — resolve(template, ctx)

`{varName}` résolu dans cet ordre : `ctx.asset.varName` → `ctx.vars.varName` → `ctx.results.varName`

Transformations : `{slug(X)}`, `{upper(X)}`, `{lower(X)}`, `{trim(X)}`
Conditionnel : `{var?si_présent|si_absent}`

---

## 8. Familles de nœuds

| family | Handler | Description |
|---|---|---|
| `trigger` | — | Custom Action, timer, webhook |
| `fetch` | `fetch` | Récupère asset/collection/metadata/formats |
| `lookup` | `lookup` | Table de correspondance |
| `decision` | `decision` | Branchement conditionnel |
| `id_generator` | `id_generator` | Génère un ID (BayardRegistry) |
| `update_meta` | `update_meta` | PATCH metadata Iconik |
| `workflow_history` | `workflow_history` | Écrit dans un champ MD |
| `action` | `action` | Export Location, actions Iconik |
| `wait_for` | `wait_for` | Polling job Iconik jusqu'à FINISHED |
| `aws_s3` | `aws_s3` | list_objects, head_object, artwork_s3 |
| `http_request` | `http_request` | Appel HTTP outbound |
| `http_sequence` | `http_sequence` | Séquence d'appels HTTP |
| `checker` | `checker` | Vérifie des conditions sur endpoints |
| `gate` | `gate` | Pause manuelle / throttle |
| `aps_search` | `aps_search` | Recherche multi-blocs Iconik |
| `loop` | `loop` | Boucle sur une liste |
| `notification` | `notification` | Teams, Slack, email |

---

## 9. Dettes techniques actives

1. **HTML généré non conforme** — `buildCfgFields` et ~30 sous-fonctions contiennent des centaines de `style=` inline à migrer vers des classes CSS
2. **Moteur "En cas d'erreur"** — propagation non implémentée dans `wfd-engine-handlers.js`
3. **Moteur W/R/C update_meta** — `op` par ligne non lu dans `wfd-engine-handlers.js`
4. **AWS S3 connexion introuvable** — bug aléatoire, race condition suspectée sur `WfdHandlers._connexions`
5. **DB/localStorage désynchronisés** — `isActive` en DB ≠ toggle UI (3 flux actifs en DB vs 1 dans l'UI)
6. **Gate après libération** — job disparaît au lieu de continuer sur le port suivant
7. **Animations badges jobs** — à revoir (topic dédié)
8. **Navbar** — à intégrer dans dashboard, settings, automations, viewer, monitoring
9. **Browse collections** — déplier l'arbo nécessite 2 clics (comportement identique à Organiser — pas un bug)
