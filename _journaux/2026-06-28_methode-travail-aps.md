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

```bash
# Cloner le dépôt dans l'environnement sandbox Claude (lecture seule)
git clone https://ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX@github.com/FarTop/aps-askida.git /tmp/aps-repo
```

**Important :** Ce clone reflète le dernier commit pushé. Si des patches ont été appliqués sur le Mac Mini mais pas encore commités, le clone GitHub sera en retard. Dans ce cas, utiliser `sed -n` depuis le terminal pour lire le fichier réel sur le Mac Mini.

**Règle :** Toujours vérifier si le fichier GitHub est à jour avant de l'utiliser comme référence. En cas de doute, lire depuis le Mac Mini.

---

## Règle absolue — Ne jamais demander de manipuler des fichiers manuellement

Claude ne demande **jamais** à Farid de :
- Ouvrir un fichier dans un éditeur pour y coller du contenu
- Remplacer un fichier par un autre manuellement
- Télécharger un fichier généré par Claude pour le déposer sur le Mac Mini
- Copier-coller du code directement dans un fichier

**Tout patch se fait via des scripts Python inline dans le terminal VS Code.**

**Exception unique :** Si un fichier est trop long pour un heredoc fiable (>300 lignes), Claude le génère, le présente en téléchargement, et Farid le dépose via VS Code Remote SSH dans le bon répertoire. Claude confirme ensuite avec `grep -n` que le fichier est en place.

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
sed -n 'NNN,MMMp' /chemin/vers/fichier.js | cat -A
```
Cela révèle les espaces, tabs, fins de ligne invisibles. (`sed -n 'l'` peut ne pas fonctionner sur toutes les versions macOS.)

---

## Redémarrage serveur — Alias `aps-restart`

L'alias suivant est configuré dans `~/.zshrc` sur le Mac Mini :

```bash
alias aps-restart="kill $(ps aux | grep 'node /Users/faridradi/aps/server/index.js' | grep -v grep | awk '{print $2}') 2>/dev/null; sleep 1 && node ~/aps/server/index.js &"
```

**Utilisation :** simplement taper `aps-restart` dans le terminal.

**Pourquoi cet alias et pas `pkill` :**
- `pkill -f "node server/index.js"` matche sur le chemin court et peut rater le process qui tourne avec le chemin complet `/Users/faridradi/aps/server/index.js`
- L'alias tue précisément le bon PID via `ps aux | grep`

**Vérifier que le serveur tourne après redémarrage :**
```bash
curl -s http://localhost:3000/api/environments | head -c 50
```

**Vérifier le PID et l'heure de démarrage :**
```bash
ps aux | grep "node /Users/faridradi/aps/server/index.js" | grep -v grep | awk '{print $2, $9}'
```

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
4. Redémarrer le serveur : aps-restart
5. Vérifier que le serveur répond : curl -s http://localhost:3000/api/environments | head -c 50
6. Tester (curl ou navigateur)
7. git add + git commit + git push
```

### Modification du schema.prisma — SÉQUENCE OBLIGATOIRE

⚠️ Cette séquence est **impérative** — sauter une étape cause des erreurs `Unknown argument` ou `Invalid invocation`.

```
1. Lire schema.prisma réel :
   grep -n "NomDuModel" ~/aps/prisma/schema.prisma -A 20

2. Appliquer le patch Python sur schema.prisma

3. Vérifier le résultat :
   grep -n "champ_modifié" ~/aps/prisma/schema.prisma

4a. Si la colonne N'EXISTE PAS encore en DB → lancer la migration :
    cd ~/aps && npx prisma migrate dev --name "description_du_changement"

4b. Si Prisma détecte un DRIFT (colonne ajoutée manuellement en DB) :
    → NE PAS faire de reset (perte de données)
    → Ajouter la colonne manuellement en psql :
      psql aps_db -c "ALTER TABLE \"NomTable\" ADD COLUMN IF NOT EXISTS \"nomColonne\" JSONB NOT NULL DEFAULT '[]';"
    → Créer le fichier de migration manuellement :
      mkdir -p ~/aps/prisma/migrations/YYYYMMDD_description
      # écrire le SQL dans migration.sql
    → Marquer comme appliquée :
      cd ~/aps && npx prisma migrate resolve --applied "YYYYMMDD_description"

5. TOUJOURS régénérer le client Prisma :
   cd ~/aps && npx prisma generate
   (même si migrate dev a déjà été lancé — c'est une étape distincte)

6. Vérifier que generate a réussi :
   → doit afficher "Generated Prisma Client to ./node_modules/@prisma/client"

7. Redémarrer le serveur : aps-restart

8. Tester via psql ou curl

9. git add + git commit + git push
```

**Erreurs fréquentes Prisma et leurs causes :**
- `Unknown argument 'xxx'` → `prisma generate` n'a pas été relancé après le changement de schema
- `Invalid invocation` → le serveur n'a pas été redémarré après `prisma generate`
- `Column does not exist` → la migration n'a pas été lancée (ou a échoué silencieusement)
- `Drift detected` → une colonne a été ajoutée manuellement en DB sans migration correspondante → suivre la procédure 4b ci-dessus

---

## Débogage — Méthode

### ⚠️ Règle absolue — Cartographier avant de migrer

Avant toute migration d'une fonction existante, cartographier exhaustivement **tout ce qu'elle fait** — pas seulement le fetch principal. Les calculs dérivés et post-traitements sont souvent invisibles au premier regard et leur disparition cause des régressions en cascade.

**Méthode de cartographie :**
1. Lister tous les appels réseau (fetch, axios, curl)
2. Lister tous les calculs dérivés (associations croisées, résolutions ID→nom, post-traitements)
3. Lister toutes les persistances (variables globales, DB, sessionStorage)
4. Vérifier que chacun de ces trois points est couvert dans la nouvelle implémentation **avant** de supprimer l'ancienne

> Leçon directe de la session 2026-06-27 : la suppression de `syncIconik()` a éliminé silencieusement les calculs dérivés (`fonctionnalites`, `itemsAdvancedData`, associations croisées) — causant des heures de régressions en cascade.

---

**Principe fondamental : investiguer avant de patcher. Ne jamais patcher à l'aveugle.**

### Ordre de diagnostic recommandé

**1. Lire les logs console du navigateur**
Farid colle les logs console dans le chat. Claude les analyse ligne par ligne. La première erreur rouge est presque toujours la cause racine — les suivantes sont des conséquences.

**2. Vérifier en DB avant d'assumer**
```bash
psql aps_db -P pager=off -c "SELECT \"champ\" FROM \"Table\" WHERE ... LIMIT 5;"
```
Si les données sont absentes en DB → problème dans `sync-engine.js` (persistance).
Si les données sont présentes en DB → problème dans `ikon-data.js` (lecture) ou frontend (consommation).

**3. Tester l'API directement**
```bash
curl -s "http://localhost:3000/api/ikon/snapshot/prod/teams" | python3 -c "import sys,json; ..."
```
Si l'API renvoie les bonnes données → problème frontend (sessionStorage périmé, variable mal assignée).
Si l'API renvoie des données incorrectes → problème dans `ikon-data.js`.

**4. Tester la logique Node en isolation**
Quand on doute de ce que fait le serveur sans pouvoir lire ses logs, tester directement :
```bash
node << 'NJSEOF'
require('dotenv').config();
// ... logique à tester
NJSEOF
```
C'est la méthode la plus rapide pour débloquer une situation. Ne pas utiliser `node -e "..."` avec des backticks ou apostrophes — zsh génère des erreurs `event not found`. Toujours utiliser le heredoc `<< 'NJSEOF'`.

**5. Vérifier l'état des variables globales dans le navigateur**
```javascript
console.log('env actif:', window._apsActiveEnvSlug)
console.log('teams:', teamsData.teams?.length)
console.log('categories:', categoriesData.categories?.map(c => ({nom: c.nom, appliqueeA: c.appliqueeA})))
```

**6. Vider le sessionStorage quand les données semblent périmées**
```javascript
sessionStorage.clear();
```
Puis `Ctrl+Shift+R`. Le cache sessionStorage peut contenir d'anciennes données sans les nouveaux champs.

### Pièges récurrents à vérifier en priorité

**Signature de fonction incomplète**
Quand on ajoute un paramètre dans l'appel d'une fonction, toujours vérifier qu'il est aussi déclaré dans la destructuration de la signature. Exemple type :
```js
// Appel
await writeTeams(prisma, snapshotId, teams, { ..., customActions });
// Signature — vérifier que customActions = [] est bien là
async function writeTeams(prisma, snapshotId, teams, {
  ..., customActions = []   // ← oublier ça = paramètre toujours undefined
} = {}) {
```

**Process fantôme / cache Node.js**
Un fichier modifié sur disque n'est PAS rechargé automatiquement. Il faut toujours `aps-restart` après tout patch serveur. Si le comportement ne change pas après un patch serveur + redémarrage, vérifier que le bon process a bien été tué avec :
```bash
ps aux | grep "node /Users/faridradi/aps/server/index.js" | grep -v grep | awk '{print $2, $9}'
```
L'heure de démarrage doit être postérieure au patch.

**SCOPE_ORDER vs ordre du switch**
Dans `sync-engine.js`, l'ordre d'exécution des scopes est dicté par `SCOPE_ORDER`, pas par l'ordre des `case` dans le `switch`. Si un scope dépend d'un autre (ex: `teams` dépend de `storages`), vérifier que l'ordre dans `SCOPE_ORDER` est correct.

**sessionStorage périmé**
Après un patch de `ikon-data.js` ou `sync-engine.js`, le sessionStorage peut contenir d'anciennes données sans les nouveaux champs. Toujours faire `sessionStorage.clear()` + `Ctrl+Shift+R` + nouvelle sync pour tester proprement.

---

## Architecture — Principes fondamentaux

### Pipeline de données — sens unique strict

```
Iconik → sync-engine.js → DB (snapshot) → ikon-data.js → stores globaux → UI
```

Chaque couche a une responsabilité unique :
- **`sync-engine.js`** : fetch Iconik → persistance DB. Résout les associations (ACLs → teams). Aucune logique UI.
- **`ikon-data.js`** : lecture DB → contrat canonique. Résout les noms (IDs → noms) et associations croisées. C'est le seul endroit où ces résolutions se font.
- **`script-settings.js`** : consomme et affiche. Ne résout rien, ne transforme rien.

**Violation à éviter :** `syncIconik()` dans `script-sync.js` était une duplication de `sync-engine.js` côté frontend. Il a été supprimé — `chargerDonnees()` charge maintenant directement depuis `/api/ikon/snapshot/:envSlug`.

### Contrat canonique — `ikon-data.js`

Chaque entité expose :
- `id` — identifiant Iconik
- `nom` — nom unifié (pas de `name`/`title` dupliqués sauf compat explicite marquée)
- Associations résolues avec noms (ex: `storages: [{ id, nom }]`, pas `storages: [{ id }]`)
- `appliqueeA` sur les catégories = alias de `object_types` pour le filtre UI

Niveaux de lecture disponibles :
- `GET /api/ikon/snapshot/:envSlug/counts` — compteurs ultra-légers (page load)
- `GET /api/ikon/snapshot/:envSlug/:scope` — liste d'un scope
- `GET /api/ikon/snapshot/:envSlug/teams/:id` — détail complet d'une entité

### Settings vs WFD — Distinction fondamentale

> Ces deux modules ont des modèles de confiance fondamentalement différents. Ne jamais les confondre.

- **Settings** = source de vérité configuration. Charge depuis snapshot DB. Acceptable d'avoir des données de quelques heures. Jamais d'appel Iconik direct depuis le frontend.
- **WFD** = orchestrateur temps réel. GET et POST directs vers Iconik via proxy. **Jamais de snapshot DB.** L'état d'un asset à l'instant T est critique — une donnée périmée peut déclencher une mauvaise action de livraison.

### localStorage
- **Données métier** → DB (Settings) ou Iconik direct (WFD). Jamais localStorage.
- **UI state** (préférences, toggles, mode d'affichage, brouillons `dsnDraft`) → localStorage acceptable.
- Marqueur `// (DB)` sur les `localStorage.setItem` neutralisés.
- Marqueur `TODO Phase D` sur les blocs à migrer plus tard.

### Proxy Iconik (`iconik-proxy.js`)
- Sert les données Settings depuis la DB (snapshot)
- Sert les données WFD depuis Iconik en direct
- Cache ACL en mémoire avec TTL (réduit ~1500 requêtes DB à 1)
- Invalider le cache après une sync : `POST /api/iconik/invalidate-cache`

---

## Commandes de diagnostic fréquentes

### Vérifier les données en DB
```bash
# Lister les tables
psql aps_db -c "\dt"

# Voir la structure d'une table
psql aps_db -c "\d \"NomTable\""

# Requête simple (attention aux guillemets sur les noms CamelCase)
psql aps_db -P pager=off -c "SELECT \"iconikId\", \"name\" FROM \"IkonStorage\" LIMIT 5;"

# Snapshots disponibles
psql aps_db -P pager=off -c "SELECT id, \"envId\", \"capturedAt\" FROM \"IkonSnapshot\" ORDER BY \"capturedAt\" DESC LIMIT 5;"

# Snapshot courant d'un env
psql aps_db -P pager=off -c "SELECT id, \"capturedAt\" FROM \"IkonSnapshot\" WHERE \"isCurrent\" = true AND \"envId\" = (SELECT id FROM \"Environment\" WHERE slug = 'prod') ORDER BY \"capturedAt\" DESC LIMIT 1;"
```

### Tester le proxy Iconik
```bash
curl -s "http://localhost:3000/api/iconik/prod/API/acls/v1/acl/storages/<id>/" | python3 -m json.tool
curl -s "http://localhost:3000/api/iconik/qa/API/acls/v1/acl/export_locations/<id>/"
```

### Tester les endpoints ikon-data
```bash
curl -s "http://localhost:3000/api/ikon/snapshot/prod/counts"
curl -s "http://localhost:3000/api/ikon/snapshot/prod/teams" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('teams',[])))"
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

## Git — Workflow obligatoire

### En début de session
```bash
cd ~/aps
git status
git log --oneline -10
```

### Avant tout gros chantier
```bash
git add -A && git commit -m "chore: état avant [nom du chantier]" && git push
```

### En fin de session ou après chaque fonctionnalité
```bash
cd ~/aps && git add -A && git commit -m "type: description courte et précise" && git push
```

### Types de commits
```
feat:     nouvelle fonctionnalité
fix:      correction de bug
chore:    nettoyage, migration localStorage, nettoyage fichiers
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
~/aps/server/routes/sync-engine.js      ← fetch Iconik → persistance DB
~/aps/server/routes/ikon-data.js        ← lecture DB → contrat canonique
~/aps/server/routes/iconik-proxy.js
~/aps/server/routes/environments.js
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
~/aps/server/public/platforms/iconik/settings/script-settings.js   ← chargerDonnees()
~/aps/server/public/platforms/iconik/settings/script-sync.js       ← sync SD/DD (écriture Iconik)
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
| GitHub token (lecture) | `ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| VS Code SSH | `faridradi@192.168.1.102` |
| DB | `psql aps_db` |
| Node-RED | `http://localhost:1881` (Docker, label `aps.managed=true`) |

---

## Règles CSS

- Ne **jamais** utiliser `var(--text-dim)` pour des informations à lire — trop peu contrasté sur fond sombre, illisible
- Utiliser `var(--text)` pour tout texte informatif
- `var(--text-dim)` réservé uniquement aux séparateurs et décorations pures sans contenu informatif
- Ne pas utiliser `opacity` sur du petit texte — le rend invisible sur fond sombre
