# Méthode de travail APS — Guide pour Claude

## Contexte environnement

- **Mac Mini M1** : serveur headless, tout tourne dessus
- **PC Windows** : poste de travail avec 3 écrans, connecté au Mac Mini via VS Code Remote SSH
- **VS Code Remote SSH** : `faridradi@192.168.1.102` — le terminal intégré VS Code s'exécute directement sur le Mac Mini
- **Toutes les commandes sont lancées depuis le terminal intégré VS Code sur le PC**, qui s'exécute sur le Mac Mini
- Le Mac Mini n'est jamais manipulé directement (headless)

---

## Accès GitHub — Lecture du code source

Claude a accès en lecture au dépôt GitHub via un token personnel. Cela permet de lire les fichiers réels sans dépendre des copies du projet Claude ni des commandes `sed` dans le terminal.

**Important :** Le clone GitHub reflète le dernier commit pushé. Si des patches ont été appliqués sur le Mac Mini mais pas encore commités, GitHub sera en retard. Dans ce cas, utiliser `sed -n` depuis le terminal pour lire le fichier réel sur le Mac Mini.

**Règle :** Toujours vérifier si le fichier GitHub est à jour avant de l'utiliser comme référence. En cas de doute, lire depuis le Mac Mini.

---

## Règle absolue — Ne jamais demander de manipuler des fichiers manuellement

Claude ne demande **jamais** à Farid de :
- Ouvrir un fichier dans un éditeur pour y coller du contenu
- Remplacer un fichier par un autre manuellement
- Télécharger un fichier généré par Claude pour le déposer sur le Mac Mini
- Copier-coller du code directement dans un fichier

**Tout patch se fait via des scripts Python inline dans le terminal VS Code.**

**Exception unique :** Si un fichier est trop long pour un heredoc fiable (>300 lignes), Claude le génère, le présente en téléchargement, et Farid le dépose via VS Code Remote SSH dans le bon répertoire.

---

## Méthode de patch — Python inline via terminal

C'est la méthode standard pour modifier n'importe quel fichier JS, HTML, CSS, JSON sur le Mac Mini.

### Pattern de base — un seul patch

```bash
python3 << 'PYEOF'
path = '/Users/faridradi/aps/server/public/platforms/iconik/settings/script-settings.js'
with open(path, 'r') as f:
    content = f.read()

old = "texte exact à remplacer"
new = "nouveau texte"

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print('OK — description du patch')
else:
    print('ERREUR — pattern non trouvé')
PYEOF
```

### Règles impératives du pattern Python

**1. Le `if old in content` est obligatoire**
Si le pattern n'est pas trouvé → `ERREUR`, on n'écrase jamais le fichier sans confirmation. Claude ne génère jamais de patch depuis sa mémoire — il lit toujours le fichier réel d'abord.

**2. Le pattern `old` doit être exact**
Toujours lire le fichier réel avant de construire le pattern :
```bash
sed -n '100,150p' /chemin/vers/fichier.js
```
Ne jamais écrire un pattern de mémoire — les espaces, tabulations et retours à la ligne doivent correspondre exactement.

**3. Vérification après chaque patch**
```bash
grep -n "mot_clé" /chemin/vers/fichier.js
node --check /chemin/vers/fichier.js   # pour les fichiers JS
```

**4. En cas d'ERREUR sur un pattern**
Lire les caractères exacts avec :
```bash
python3 << 'PYEOF'
with open('/chemin/vers/fichier.js') as f:
    content = f.read()
idx = content.find('fragment_du_pattern')
print(repr(content[idx:idx+200]))
PYEOF
```

---

## Règles CSS — Architecture Workflow Designer

### Principe fondamental

**"Tout ce qui touche à l'apparence va dans le CSS, le JS ne manipule que le comportement."**

✅ **Correct :**
- `element.classList.toggle('active', isActive)` — état
- `element.style.setProperty('--cat-color', value)` — valeur dynamique via custom property
- `element.style.display = 'none'` — comportement (acceptable)

❌ **Interdit :**
- `element.style.color = '#e74c3c'`
- `element.style.backgroundColor = value`
- `element.style.borderColor = x`

### Convention des classes dans `workflow-designer.css`

- `.wfd-c-*` — couleurs (`.wfd-c-555`, `.wfd-c-green2`)
- `.wfd-row-*` — flex layouts (`.wfd-row-gap6b`, `.wfd-row-sb-mb6`)
- `.wfd-card-*` — blocs card (`.wfd-card`, `.wfd-card-sm`)
- `.wfd-mono-*` — monospace (`.wfd-mono`, `.wfd-mono-sm`)
- `.wfd-hint-*` — labels secondaires (`.wfd-hint-top3`, `.wfd-hint-mb6`)
- `.wfd-modal-sm/md/lg/xl/res/script` — largeurs modales
- `.tb-btn.c-*` / `.cfg-btn.c-*` — modificateurs couleur boutons

### Plafond de la consolidation CSS

Les styles inline restants dans le JS (~906) sont de 3 natures légitimes :
1. `display:none` — comportement JS, à laisser
2. Templates literals `style="color:${variable}"` — dynamique, extraire via CSS custom properties en Phase 2
3. Styles uniques 1x — trop contextuels pour créer des classes

### Audit styles inline

Pour auditer les styles restants dans un fichier :
```bash
python3 << 'PYEOF'
with open('/chemin/vers/fichier.js') as f:
    content = f.read()
import re
from collections import Counter
styles = re.findall(r'style="([^"]+)"', content)
counts = Counter(styles)
extractable = [(s,c) for s,c in counts.items() if c >= 2 and '${' not in s and '\n' not in s]
for s,c in sorted(extractable, key=lambda x:-x[1])[:20]:
    print(f'{c}x: {s[:80]}')
PYEOF
```

---

## Navbar commune — aps-nav.js

Toutes les pages APS doivent utiliser la navbar commune :

```html
<!-- Dans le <head> -->
<script src="../_shared/aps-nav.js"></script>

<!-- Dans le <body> à la place du <header> -->
<div id="aps-header"></div>

<!-- Dans le DOMContentLoaded -->
<script>
  apsNav.init({ activePage: 'workflow', extras: 'engines', pageTitle: 'Workflow Designer' });
</script>
```

**Paramètres `extras` :**
- `'engines'` → dots Node-RED + Iconik (page Workflow uniquement)
- `'env-select'` → select environnement (page Recherche)
- `null` → rien après la nav

**Pages déjà migrées :** `workflow.html`, `search.html`
**Pages à migrer :** dashboard, settings, automations, viewer, monitoring

---

## Redémarrage serveur — Alias `aps-restart`

L'alias suivant est configuré dans `~/.zshrc` sur le Mac Mini :

```bash
alias aps-restart="kill $(ps aux | grep 'node /Users/faridradi/aps/server/index.js' | grep -v grep | awk '{print $2}') 2>/dev/null; sleep 1 && node ~/aps/server/index.js &"
```

**Utilisation :** simplement taper `aps-restart` dans le terminal.

---

## Étapes obligatoires selon le type de modification

### Modification d'un fichier frontend (JS, HTML, CSS)
```
1. Lire le fichier réel (sed -n ou grep ou python3)
2. Investiguer en console navigateur avant tout patch
3. Appliquer le patch Python
4. node --check pour les fichiers JS
5. Hard refresh : Cmd+Shift+R
6. Tester dans le navigateur
7. git add + git commit + git push
```

### Modification d'un fichier serveur (routes, proxy, engine)
```
1. Lire le fichier réel
2. Appliquer le patch Python
3. node --check
4. aps-restart
5. curl -s http://localhost:3000/api/environments | head -c 50
6. Tester
7. git add + git commit + git push
```

### Modification du schema.prisma — SÉQUENCE OBLIGATOIRE

⚠️ Cette séquence est **impérative**.

```
1. Lire schema.prisma réel
2. Appliquer le patch Python sur schema.prisma
3. Si colonne N'EXISTE PAS en DB → npx prisma migrate dev --name "description"
4. Si DRIFT (colonne ajoutée manuellement) :
   → ALTER TABLE en psql
   → Créer migration manuellement
   → npx prisma migrate resolve --applied "nom_migration"
5. TOUJOURS : cd ~/aps && npx prisma generate
6. aps-restart
7. Tester
8. git add + git commit + git push
```

---

## Débogage — Méthode

### ⚠️ Règle absolue — Investiguer avant de patcher

**Ne jamais patcher sans avoir d'abord investigué en console navigateur.**

```javascript
// Inspecter un élément
document.querySelector('.ma-classe').outerHTML

// Vérifier une variable globale
console.log(wfdData.collections?.length)

// Simuler la logique avant de l'implémenter
const result = maFonction(param);
console.log('résultat:', result);
```

### Cartographier avant de migrer

Capturer tous les usages d'une variable/fonction avant de la modifier :
```bash
grep -rn "nomFonction\|nomVariable" ~/aps/server/public/platforms/iconik/workflow/
```

---

## Règles de codage

### `&&` ne fonctionne pas dans les alias zsh
Utiliser `;` à la place dans les alias.

### `||` vs `??` pour les valeurs numériques pouvant être 0
```js
// ❌ Écrase 0
this.port = options.port || 2880;
// ✅ Respecte 0
this.port = options.port ?? 2880;
```

### Express route ordering
Les routes spécifiques avant les routes paramétriques `/:id`.

### Async chaining
La logique dépendante doit vivre dans les `.then()` callbacks.

### node --check obligatoire
Après chaque patch d'un fichier JS :
```bash
node --check /chemin/vers/fichier.js
```

---

## Commandes de diagnostic fréquentes

### Vérifier les données en DB
```bash
psql aps_db -c "\dt"
psql aps_db -P pager=off -c "SELECT \"iconikId\", \"name\" FROM \"IkonStorage\" LIMIT 5;"
```

### Tester le proxy Iconik
```bash
curl -s "http://localhost:3000/api/iconik/prod/API/acls/v1/acl/storages/<id>/" | python3 -m json.tool
```

### Vérifier les environnements
```bash
curl -s http://localhost:3000/api/environments | python3 -m json.tool
```

### Inspecter un run WFD depuis la console
```javascript
WfdEngineInstance.getRecentRuns(1)[0].nodes.find(n => n.nodeFamily === 'aps_search')
```

### Token Iconik depuis console navigateur
```javascript
JSON.parse(localStorage.getItem('appTokensData') || '{}')?.appTokens || []
```

---

## Git — Workflow obligatoire

### En début de session
```bash
cd ~/aps
git status
git log --oneline -10
```

### En fin de session
```bash
cd ~/aps && git add -A && git commit -m "type: description courte et précise" && git push
```

### Types de commits
```
feat:     nouvelle fonctionnalité
fix:      correction de bug
chore:    nettoyage, migration
refactor: restructuration sans impact fonctionnel
perf:     amélioration de performance
docs:     documentation uniquement
```

---

## Localisation des fichiers

### Frontend — WFD (Workflow Designer)
```
~/aps/server/public/platforms/iconik/workflow/script-workflow-designer.js
~/aps/server/public/platforms/iconik/workflow/wfd-config-panel.js
~/aps/server/public/platforms/iconik/workflow/wfd-run-panel.js
~/aps/server/public/platforms/iconik/workflow/wfd-api-ops.js
~/aps/server/public/platforms/iconik/workflow/wfd-logger.js
~/aps/server/public/platforms/iconik/workflow/wfd-instrumentation.js
~/aps/server/public/platforms/iconik/workflow/workflow.html
~/aps/server/public/platforms/iconik/workflow/workflow-designer.css
~/aps/server/public/platforms/iconik/workflow/script-workflow-nodered.js
~/aps/server/public/platforms/iconik/workflow/script-workflow-word.js
```

### Frontend — Partagés
```
~/aps/server/public/platforms/iconik/_shared/aps-nav.js          ← NOUVEAU
~/aps/server/public/platforms/iconik/_shared/aps-data.js
~/aps/server/public/platforms/iconik/_shared/aps-mirror-engine.js
~/aps/server/public/platforms/iconik/_shared/wfd-bus.js
~/aps/server/public/platforms/iconik/_shared/wfd-job-manager.js
~/aps/server/public/platforms/iconik/_shared/sync-mappers.js
```

### Frontend — Recherche
```
~/aps/server/public/platforms/iconik/search/search.html
```

---

## Accès et URLs

| Contexte | Valeur |
|---|---|
| APS local | `http://192.168.1.102:3000` |
| APS public | `https://aps-askida.com` |
| GitHub | `https://github.com/FarTop/aps-askida` |
| VS Code SSH | `faridradi@192.168.1.102` |
| DB | `psql aps_db` |
| Node-RED | `http://localhost:1881` (Docker, label `aps.managed=true`) |
