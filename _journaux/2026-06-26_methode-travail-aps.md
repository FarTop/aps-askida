# Méthode de travail APS — Guide pour Claude

## Contexte environnement

- **Mac Mini M1** : serveur headless, tout tourne dessus
- **PC Windows** : poste de travail avec 3 écrans, connecté au Mac Mini via VS Code Remote SSH
- **VS Code Remote SSH** : `faridradi@192.168.1.102` — le terminal intégré VS Code s'exécute directement sur le Mac Mini
- **Toutes les commandes sont lancées depuis le terminal intégré VS Code sur le PC**, qui s'exécute sur le Mac Mini
- Le Mac Mini n'est jamais manipulé directement (headless)

---

## Règle absolue — Ne jamais demander de manipuler des fichiers manuellement

Claude ne demande **jamais** à Farid de :
- Ouvrir un fichier dans un éditeur pour y coller du contenu
- Remplacer un fichier par un autre manuellement
- Télécharger un fichier généré par Claude pour le déposer sur le Mac Mini
- Copier-coller du code directement dans un fichier

**Tout patch se fait via des scripts Python inline dans le terminal VS Code.**

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

### Pattern de base — plusieurs patches dans un même fichier

```bash
python3 << 'PYEOF'
path = '/Users/faridradi/aps/server/public/...'
with open(path, 'r') as f:
    content = f.read()

errors = []

old1 = "premier pattern exact"
new1 = "premier remplacement"
if old1 in content: content = content.replace(old1, new1)
else: errors.append('Patch 1 — description')

old2 = "deuxième pattern exact"
new2 = "deuxième remplacement"
if old2 in content: content = content.replace(old2, new2)
else: errors.append('Patch 2 — description')

with open(path, 'w') as f:
    f.write(content)

if errors:
    print('PATCHES ÉCHOUÉS:')
    for e in errors: print('  ✗', e)
else:
    print('OK — tous les patches appliqués')
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
# ou
sed -n 'NNN,MMMp' /chemin/vers/fichier.js
```

**4. En cas d'ERREUR sur un pattern**
Lire les caractères exacts avec :
```bash
sed -n 'NNN,MMMp' /chemin/vers/fichier.js | sed -n 'l'
```
Cela révèle les espaces, tabs (`\t`), fins de ligne (`$`) invisibles.

---

## Étapes obligatoires selon le type de modification

### Modification d'un fichier frontend (JS, HTML, CSS)
```
1. Lire le fichier réel (sed -n ou grep)
2. Appliquer le patch Python
3. Vérifier le résultat (grep ou sed)
4. Hard refresh dans le navigateur : Ctrl+Shift+R
   (pas de redémarrage serveur nécessaire)
5. Tester dans le navigateur
6. git add + git commit + git push
```

### Modification d'un fichier serveur (routes, proxy, sync-engine)
```
1. Lire le fichier réel
2. Appliquer le patch Python
3. Vérifier le résultat
4. Redémarrer le serveur :
   pkill -f "node server/index.js"; sleep 1 && node server/index.js &
5. Vérifier que le serveur a bien démarré (voir les logs dans le terminal)
6. Tester (curl ou navigateur)
7. git add + git commit + git push
```

### Modification du schema.prisma — SÉQUENCE OBLIGATOIRE

⚠️ Cette séquence est **impérative** — sauter une étape cause des erreurs `Unknown argument` ou `Invalid invocation`.

```
1. Lire schema.prisma réel :
   cat ~/aps/prisma/schema.prisma | grep -n "NomDuModel" -A 20

2. Appliquer le patch Python sur schema.prisma

3. Vérifier le résultat :
   grep -n "champ_modifié" ~/aps/prisma/schema.prisma

4. Si la colonne N'EXISTE PAS encore en DB → lancer la migration :
   cd ~/aps && npx prisma migrate dev --name "description_du_changement"

   Si la colonne EXISTE déjà en DB (ajoutée manuellement) → PAS de migrate, juste :
   cd ~/aps && npx prisma generate

5. TOUJOURS régénérer le client Prisma :
   cd ~/aps && npx prisma generate
   (même si migrate dev a déjà été lancé — c'est une étape distincte)

6. Vérifier que generate a réussi :
   → doit afficher "Generated Prisma Client to ./node_modules/@prisma/client"

7. Redémarrer le serveur :
   pkill -f "node server/index.js"; sleep 1 && node server/index.js &

8. Tester via psql ou curl

9. git add + git commit + git push
```

**Erreurs fréquentes Prisma et leurs causes :**
- `Unknown argument 'aclData'` → `prisma generate` n'a pas été relancé après le changement de schema
- `Invalid invocation` → le serveur n'a pas été redémarré après `prisma generate`
- `Column does not exist` → la migration n'a pas été lancée (ou a échoué silencieusement)
- Toujours tuer le processus fantôme avant de redémarrer : `pkill -f "node server/index.js"`

---

## Vérifier qu'un processus fantôme ne tourne pas

```bash
ps aux | grep "node server/index.js" | grep -v grep
```

Si un processus apparaît avec un PID → le tuer avant de relancer :
```bash
pkill -f "node server/index.js"
sleep 1
node server/index.js &
```

---

## Git — Workflow obligatoire

### En début de session
```bash
cd ~/aps
git status          # vérifier l'état
git log --oneline -10   # voir les derniers commits
```

### Avant tout gros chantier
```bash
git add -A && git commit -m "chore: état avant [nom du chantier]"
git push
```
Cela garantit un point de retour propre si le chantier introduit des régressions.

### En fin de session ou après chaque fonctionnalité
```bash
cd ~/aps
git add -A
git commit -m "type: description courte et précise"
git push
```

### Types de commits
```
feat:     nouvelle fonctionnalité
fix:      correction de bug
chore:    nettoyage, nettoyage localStorage, nettoyage fichiers
refactor: restructuration sans impact fonctionnel
perf:     amélioration de performance
docs:     documentation uniquement
```

### En cas de régression grave
```bash
git log --oneline -10           # trouver le commit cible
git checkout <hash> -- fichier  # restaurer un fichier spécifique
# ou
git revert <hash>               # annuler un commit entier
```

---

## Localisation des fichiers

### Serveur (Node.js)
```
~/aps/server/index.js
~/aps/server/routes/sync-engine.js
~/aps/server/routes/iconik-proxy.js
~/aps/server/routes/environments.js
~/aps/server/routes/ikon-data.js
~/aps/server/routes/wfd-data.js
~/aps/server/routes/connexions.js
~/aps/server/routes/platforms.js
~/aps/server/routes/flows.js
~/aps/server/routes/status.js
~/aps/server/routes/sync-jobs.js
~/aps/prisma/schema.prisma
```

### Frontend — Settings
```
~/aps/server/public/platforms/iconik/settings/script-settings.js
~/aps/server/public/platforms/iconik/settings/script-sync.js
~/aps/server/public/platforms/iconik/settings/script-kit.js
~/aps/server/public/platforms/iconik/settings/script-clean.js
~/aps/server/public/platforms/iconik/settings/settings.html
~/aps/server/public/platforms/iconik/settings/settings.css
~/aps/server/public/platforms/iconik/settings/settings-apicheck.js
~/aps/server/public/platforms/iconik/settings/settings-health.js
```

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
~/aps/server/public/platforms/iconik/_shared/aps-data.js
~/aps/server/public/platforms/iconik/_shared/aps-mirror-engine.js
~/aps/server/public/platforms/iconik/_shared/wfd-bus.js
~/aps/server/public/platforms/iconik/_shared/wfd-job-manager.js
~/aps/server/public/platforms/iconik/_shared/wfd-sync-bridge-settings.js
~/aps/server/public/platforms/iconik/_shared/wfd-sync-client-automations.js
~/aps/server/public/platforms/iconik/_shared/sync-mappers.js
```

### Kit sync DD
```
~/Desktop/MAM/Iconik-Sync-Kit/sync_dd.js
```

---

## Commandes de diagnostic fréquentes

### Vérifier les données en DB
```bash
# Lister les tables
psql aps_db -c "\dt"

# Voir la structure d'une table
psql aps_db -c "\d \"NomTable\""

# Requête simple (attention aux guillemets sur les noms CamelCase)
psql aps_db -c "SELECT \"iconikId\", \"name\" FROM \"IkonStorage\" LIMIT 5;"

# Snapshots disponibles
psql aps_db -c "SELECT id, \"envId\", \"capturedAt\" FROM \"IkonSnapshot\" ORDER BY \"capturedAt\" DESC LIMIT 5;"
```

### Tester le proxy Iconik
```bash
curl -s "http://localhost:3000/api/iconik/prod/API/acls/v1/acl/storages/<id>/" | python3 -m json.tool
curl -s "http://localhost:3000/api/iconik/qa/API/acls/v1/acl/export_locations/<id>/"
```

### Invalider le cache proxy ACL
```bash
curl -s -X POST http://localhost:3000/api/iconik/invalidate-cache
```

### Vérifier les environnements
```bash
curl -s http://localhost:3000/api/environments | python3 -m json.tool
```

---

## Débogage — Méthode

**1. Investiguer avant de patcher**
Ne jamais patcher à l'aveugle. Toujours comprendre la cause avant de proposer un fix.
Principe : "On arrête les patches. On teste d'abord."

**2. Lire les logs console du navigateur**
Farid colle les logs console dans le chat. Claude les analyse ligne par ligne pour identifier la source exacte.

**3. Tester via la console DevTools avant de patcher**
```javascript
// Vérifier l'état des variables globales
console.log('env actif:', window._apsActiveEnvSlug)
console.log('teams:', teamsData.teams.length)
console.log('token:', typeof appTokensData.appTokens)
```

**4. Simuler le comportement avant de modifier le code**
```javascript
// Exemple : tester une fonction avant de la patcher
const result = maFonction()
console.log('résultat:', result)
```

**5. Vérifier en DB plutôt qu'assumer**
```bash
psql aps_db -c "SELECT \"teamIds\" FROM \"IkonStorage\" WHERE \"iconikId\" = '<id>' ORDER BY id DESC LIMIT 3;"
```

**6. Hard refresh obligatoire après patch frontend**
`Ctrl+Shift+R` — pas `Ctrl+R` qui utilise le cache.

---

## Règles CSS

- Ne **jamais** utiliser `var(--text-dim)` pour des informations à lire — trop peu contrasté sur fond sombre, illisible
- Utiliser `var(--text)` pour tout texte informatif
- `var(--text-dim)` réservé uniquement aux séparateurs et décorations pures sans contenu informatif
- Ne pas utiliser `opacity` sur du petit texte — le rend invisible sur fond sombre

---

## Architecture — Principes fondamentaux

### Settings vs WFD
- **Settings** = source de vérité configuration. Charge depuis snapshot DB. Acceptable d'avoir des données de quelques heures.
- **WFD** = orchestrateur temps réel. GET et POST directs vers Iconik via proxy. Jamais de snapshot DB. L'état d'un asset à l'instant T est critique.

### localStorage
- **Données métier** → DB (Settings) ou Iconik direct (WFD). Jamais localStorage.
- **UI state** (préférences, toggles, mode d'affichage) → localStorage acceptable.
- Marqueur `// (DB)` sur les `localStorage.setItem` neutralisés.
- Marqueur `TODO Phase D` sur les blocs à migrer plus tard.

### Proxy Iconik (`iconik-proxy.js`)
- Sert les données Settings depuis la DB (snapshot)
- Sert les données WFD depuis Iconik en direct
- Cache ACL en mémoire avec TTL (réduit ~1500 requêtes DB à 1)
- Invalider le cache après une sync : `POST /api/iconik/invalidate-cache`

---

## Marqueurs dans le code

| Marqueur | Signification |
|---|---|
| `// (DB)` | `localStorage.setItem` neutralisé — données en mémoire ou DB |
| `TODO Phase D` | Bloc à migrer vers DB lors de la Phase D |
| `// 2026-06-XX` | Date d'un changement significatif |

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
