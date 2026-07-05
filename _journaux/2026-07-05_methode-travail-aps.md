# Méthode de travail APS — Guide pour Claude

## 🎯 PRIORITÉ PROCHAINE SESSION

**Finir la Phase 3 CSS — Nettoyage `buildCfgFields`**

`wfd-config-panel.js` contient encore des centaines de `style=` inline dans le HTML généré par `buildCfgFields` et ses ~30 sous-fonctions. C'est le chantier principal avant tout nouveau développement. Approche : famille par famille (Gate → Timer → Notification → ACL → Lookup → HTTP...), valider visuellement + node --check + commit après chaque famille.

---

## ⚠️ RÈGLES ABSOLUES — À LIRE EN PREMIER

Ces règles ont été établies après des régressions répétées. Elles sont non négociables.

### Règle 1 — Investiguer AVANT de patcher

**Ne jamais patcher sans avoir d'abord investigué.**
1. Tester en console navigateur
2. Lire le fichier réel avec `sed -n` ou depuis GitHub
3. Capturer les caractères exacts avec `python3 repr()` avant tout remplacement

### Règle 2 — Lire le fichier réel avant toute modification

**Jamais depuis la mémoire.** Le fichier réel peut différer de ce que Claude croit savoir.
```bash
# Lecture exacte
sed -n '100,150p' /chemin/vers/fichier.js
# Ou depuis GitHub si le commit est à jour
curl -s -H "Authorization: token ghp_..." "https://api.github.com/repos/FarTop/aps-askida/contents/..."
```

### Règle 3 — CSS AVANT HTML — Jamais l'inverse

**Avant d'écrire la moindre ligne de HTML dans le JS :**
1. Vérifier si une classe CSS existe déjà dans `workflow-designer.css`
2. Créer la classe CSS d'abord si elle n'existe pas
3. Utiliser la classe dans le HTML

**Ce qui est INTERDIT dans le JS/HTML :**
```js
// ❌ INTERDIT — apparence fixe en style inline
style="font-size:10px;color:#555;margin-top:4px;"
style="display:grid;grid-template-columns:1fr 1fr;"
style="background:#0d0d0d;border:1px solid #2a2a2a;"
style="flex:1;padding:6px;border-radius:5px;"

// ✅ AUTORISÉ — comportement JS
style="display:none"
style="display:${condition?'flex':'none'}"

// ✅ AUTORISÉ — CSS custom property (valeur dynamique)
style="--node-color:${fam.color}"
style="--status-color:${color}"

// ✅ AUTORISÉ — position calculée dynamiquement
style="left:${x}px;top:${y}px"
style="top:${14+i*22}px"
```

**Ce qui est OBLIGATOIRE :**
```js
// ✅ CORRECT — état via classList
element.classList.toggle('active', isActive);
element.classList.toggle('inactive-btn', !isActive);

// ✅ CORRECT — valeur dynamique via custom property
element.style.setProperty('--status-color', color);
```

### Règle 4 — node --check obligatoire après chaque patch JS

```bash
node --check /chemin/vers/fichier.js
```
Si erreur → lire le message d'erreur, corriger, re-vérifier.

### Règle 5 — Ne jamais improviser depuis la mémoire

Toujours lire avant de modifier. Toujours vérifier le résultat.

### Règle 6 — Cartographier avant de migrer

Avant de modifier une fonction, cartographier tout ce qu'elle fait :
- Tous les calculs dérivés
- Tous les effets de bord
- Toutes les fonctions qui l'appellent

---

## Architecture CSS — Règle fondamentale

**"Tout ce qui touche à l'apparence va dans le CSS, le JS ne manipule que le comportement."**

### Fichiers CSS

```
workflow-designer.css   → SEULE source de vérité visuelle
wfd-tokens.css          → Design tokens (:root variables)
```

### Convention des classes dans `workflow-designer.css`

| Préfixe | Usage |
|---|---|
| `.wfd-c-*` | Couleurs (`.wfd-c-555`, `.wfd-c-green2`) |
| `.wfd-row-*` | Flex layouts (`.wfd-row-gap6b`, `.wfd-row-sb-mb6`) |
| `.wfd-card-*` | Blocs card (`.wfd-card`, `.wfd-card-sm`) |
| `.wfd-mono-*` | Monospace (`.wfd-mono`, `.wfd-mono-sm`) |
| `.wfd-hint-*` | Labels secondaires (`.wfd-hint-top3`) |
| `.wfd-modal-*` | Modales (`.wfd-modal-sm/md/lg/xl`) |
| `.tb-btn.c-*` | Couleurs toolbar |
| `.cfg-btn.c-*` | Couleurs config panel |
| `.active-blue/orange/purple/green` | États boutons toggle |
| `.inactive-btn` | État inactif bouton toggle |
| `.active-status` | État actif avec couleur dynamique `--status-color` |
| `.checked-blue/green/purple/red` | Checkboxes cochées |
| `.wfd-onerror-btn` | Boutons "En cas d'erreur" |
| `.wfd-um-op-btn` | Boutons W/R/C update_meta |
| `.wfd-um-target-lbl` | Labels Asset/Collection update_meta |

### Valeurs légitimes en style= (à conserver)

```js
style="left:${x}px;top:${y}px"       // position canvas
style="height:${h}px"                  // hauteur calculée
style="top:${14+i*22}px"              // position port calculée
style="display:none"                   // comportement JS
style="display:${cond?'':'none'}"     // affichage conditionnel
style="--node-color:${color}"         // custom property dynamique
style="--status-color:${c};--status-bg:${bg}" // custom properties
```

---

## Architecture WFD — Séparation des responsabilités

```
CSS   → apparence (workflow-designer.css, wfd-tokens.css)
JS    → comportement + données
HTML  → structure sémantique
```

### wfd-components.js

Templates HTML réutilisables pour les composants canvas. Pas de style inline.

```js
// Usage
const html = WfdComponents.node(node, fam, isSelected, isReadOnly, detail, ports);
div.innerHTML = html;
_attachNodeListeners(div, node);
```

### _attachNodeListeners

Tous les event listeners du canvas séparés du HTML. Appelé après `innerHTML`.

---

## Méthode de patch — Python inline via terminal

Pattern standard :

```bash
python3 << 'PYEOF'
path = '/Users/faridradi/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js'
with open(path, 'r') as f:
    content = f.read()

old = "texte exact à remplacer"
new = "nouveau texte"

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print('OK')
else:
    print('ERREUR — pattern non trouvé')
PYEOF
```

### Règles impératives

1. **`if old in content` obligatoire** — jamais d'écrasement sans confirmation
2. **Pattern exact** — toujours lire le fichier réel avant de construire le pattern
3. **`python3 repr()`** pour capturer les caractères exacts :
   ```bash
   python3 -c "
   with open('/chemin/fichier.js') as f: content = f.read()
   idx = content.find('fragment')
   print(repr(content[idx:idx+200]))
   "
   ```
4. **Éviter les emojis dans les scripts Python** — risque `UnicodeEncodeError`
5. **Vérifier après chaque patch** : `node --check` + hard refresh navigateur

---

## Pièges connus — À éviter absolument

### Piège 1 — Les doublons de fonctions
Avant de créer une fonction, vérifier qu'elle n'existe pas déjà :
```bash
grep -n "function nomFonction" ~/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js
```

### Piège 2 — Les deux instances de _umAddField
`wfd-config-panel.js` avait deux définitions de `_umAddField` — la deuxième écrasait la première. Toujours vérifier les doublons de fonctions après un patch.

### Piège 3 — dataset.active doit être maintenu
Certaines fonctions de `sauvegarderConfig` lisent `btn.dataset.active === '1'` pour détecter l'état actif. Quand on migre vers `classList`, il faut **conserver** le `dataset.active` en plus :
```js
btn.classList.toggle('active-blue', a);
btn.dataset.active = a ? '1' : ''; // ← obligatoire
```

### Piège 4 — Style inline initial vs classList
Quand on migre un toggle vers `classList`, le HTML généré doit aussi utiliser la classe (pas le style) dès la génération initiale. Sinon le premier état est en style inline, les suivants en classe → doublon visuel.

### Piège 5 — `||` vs `??` pour les valeurs falsy
```js
// ❌ Écrase 0 et ''
this.port = options.port || 2880;
// ✅ Respecte 0 et ''
this.port = options.port ?? 2880;
```

### Piège 6 — Routes Express : ordre des routes
Les routes spécifiques avant les routes paramétriques `/:id`.

### Piège 7 — Emojis dans les scripts Python
Les emojis Unicode (🛑 ⚠️ ✅ etc.) dans les heredoc Python causent des `UnicodeEncodeError`. Utiliser du texte ASCII ou des escape sequences Unicode.

### Piège 8 — `&&` vs `;` dans les alias zsh
Utiliser `;` dans les alias zsh, pas `&&` (s'arrête sur erreur silencieuse).

---

## Workflow obligatoire par type de modification

### Modification CSS (ajout de classe)
```
1. Vérifier qu'aucune classe similaire n'existe déjà
2. Ajouter dans workflow-designer.css (ou wfd-tokens.css pour tokens)
3. Hard refresh navigateur
4. Vérifier visuellement
5. git commit
```

### Modification HTML généré dans le JS
```
1. Créer/vérifier les classes CSS nécessaires
2. Lire le fichier réel (sed ou GitHub)
3. Construire le pattern exact (repr() si nécessaire)
4. Appliquer le patch Python
5. node --check
6. Hard refresh + vérification visuelle
7. git commit
```

### Modification serveur (routes, engine)
```
1. Lire le fichier réel
2. Patch Python
3. node --check
4. aps-restart
5. Test curl ou navigateur
6. git commit
```

### Modification schema Prisma
```
1. Lire schema.prisma réel
2. Patch Python
3. Si colonne N'EXISTE PAS → npx prisma migrate dev --name "description"
4. Si drift → ALTER TABLE psql + migration manuelle + prisma migrate resolve
5. npx prisma generate TOUJOURS
6. aps-restart
7. Test
8. git commit
```

---

## Commandes fréquentes

```bash
# Vérifier la syntaxe JS
node --check ~/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js

# Compter les style= restants
grep -c "style=" ~/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js

# Audit patterns répétitifs
python3 -c "
import re; from collections import Counter
with open('/Users/faridradi/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js') as f:
    content = f.read()
styles = re.findall(r'style=\"([^\"]+)\"', content)
counts = Counter(styles)
for s,c in sorted(counts.items(), key=lambda x:-x[1])[:20]:
    print(f'{c}x: {s[:80]}')
"

# Rechercher une fonction
grep -n "function nomFonction" ~/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js

# Redémarrer le serveur
aps-restart

# Vérifier les connexions DB
curl -s http://localhost:3000/api/environments | python3 -m json.tool
```

---

## Accès et URLs

| Contexte | Valeur |
|---|---|
| APS local | `http://192.168.1.102:3000` |
| APS public | `https://aps-askida.com` |
| GitHub | `https://github.com/FarTop/aps-askida` |
| Token GitHub | *(voir .env ou gestionnaire de secrets)* |
| VS Code SSH | `faridradi@192.168.1.102` |
| DB | `psql aps_db` |

---

## Localisation des fichiers clés

```
server/public/platforms/iconik/workflow/
├── workflow.html                    → Structure HTML
├── workflow-designer.css            → SEULE source CSS visuelle
├── wfd-tokens.css                   → Design tokens (:root)
├── wfd-components.js                → Templates HTML canvas
├── script-workflow-designer.js      → Runtime canvas
├── wfd-config-panel.js              → Config panel nœuds
├── wfd-run-panel.js                 → Run panel
└── wfd-api-ops.js                   → API ops

server/public/platforms/iconik/_shared/
├── aps-nav.js                       → Navbar commune
└── wfd-bus.js                       → Bus événements

server/engine/
├── wfd-engine-handlers.js           → Logique métier handlers
├── wfd-engine-executor.js           → Exécution flux
├── wfd-engine-context.js            → Contexte d'exécution
└── wfd-engine-express.js            → Routes Express
```

---

## Git — Convention commits

```
feat:     nouvelle fonctionnalité
fix:      correction de bug
refactor: restructuration sans impact fonctionnel
chore:    nettoyage
docs:     documentation
```

Commits réguliers après chaque étape validée. Branche `main`.
