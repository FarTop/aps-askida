# Méthode de travail — APS Askida Platform Studio
_Mise à jour 2026-07-28_

> Ce document décrit **comment on travaille ensemble** (le processus), pas l'état
> technique du système (voir `cartographie-aps`) ni le récit des sessions (voir
> `journal-aps`). **À lire en entier en début de session** — il est fait pour rendre
> Claude opérationnel immédiatement, sans re-explorer le projet.

---

## 0. Flux Git / VS Code — LE processus standard (à lire en début de chaque session)

> ⚠️ **Ce flux est systématiquement oublié en début de session.** Placé en tête
> exprès. Claude ne commite PAS directement sur `main` et n'édite PAS les fichiers
> de l'utilisateur : il produit des **patches** que l'utilisateur applique lui-même
> côté Mac Mini. Non négociable.

### Le cycle complet

**Côté Claude (`/home/claude/aps-askida`) :**
1. Synchroniser : `git fetch origin -q && git checkout main -q && git reset --hard origin/main -q`
2. Brancher : `git checkout -b feat-nom` (jamais sur `main`)
3. Modifier via `str_replace` / `create_file` / Python inline (§2)
4. `node --check` sur CHAQUE fichier JS touché
5. Vérifier l'absence de doublons de fonctions (§3)
6. Commit avec message détaillé (le POURQUOI)
7. `git format-patch origin/main -o /tmp/patches --no-numbered` puis zip dans `/mnt/user-data/outputs/`
8. `present_files` + **commandes git complètes** à l'utilisateur

**Côté utilisateur (Mac Mini, `~/aps`) :**
```bash
git checkout main && git pull
git branch -D feat-nom 2>/dev/null
git checkout -b feat-nom
rm -rf /tmp/patches
unzip _Patches/feat-nom.zip -d /tmp/patches
git am /tmp/patches/*.patch
```
Puis merge par l'utilisateur lui-même :
```bash
git checkout main && git merge feat-nom && git push origin main && git branch -d feat-nom
```

### ⚠️ Pièges Git à connaître ABSOLUMENT (chacun a coûté du temps réel)

- **Décalage de clone (fréquent).** Le clone de Claude est souvent EN RETARD sur le
  vrai dépôt : un `git fetch` peut ne pas voir un merge que l'utilisateur vient de
  faire. **La vérité, c'est le `git log` de l'utilisateur, pas le clone de Claude.**
  Au moindre doute (patch qui ne s'applique pas, base qui semble absente), demander
  à l'utilisateur son `git log --oneline -4`, ou forcer `git fetch origin main -q`.
  Ne JAMAIS utiliser `git am --skip` (introduit des doublons silencieux).

- **Commit fantôme = merge local non poussé.** Symptôme : `Your branch is ahead of
  'origin/main' by N commits` + un patch qui échoue (`patch does not apply`). Cause :
  un ancien merge (souvent un fix raté) est resté dans le `main` LOCAL de
  l'utilisateur sans être poussé sur GitHub. Diagnostic immédiat :
  ```bash
  git log origin/main..HEAD --oneline   # liste les commits fantômes
  ```
  Si c'est un essai raté → `git reset --hard origin/main` l'annule proprement.
  **Réflexe : un « pas mergé » de l'utilisateur peut cacher un merge local non
  poussé.** Cette commande le révèle en une ligne.

- **Résidu `.git/rebase-apply`.** Un `git am` interrompu laisse un résidu qui bloque
  TOUT `git am` suivant (`previous rebase directory ... still exists`). Débloquer :
  `git am --abort` avant toute nouvelle tentative.

- **`git format-patch` : baser sur `origin/main`, pas `main`.** Si le `main` local de
  Claude a un décalage, `format-patch origin/main..HEAD` (ou `<hash-base>..HEAD`)
  produit exactement les commits voulus. Après un merge côté utilisateur non encore
  vu par le clone, générer depuis le hash de base réel.

- **Keychain `-25308`** au push : non-problème macOS, le push réussit. Ignorer.

### Patch qui touche le SERVEUR = redémarrage obligatoire

Tout patch modifiant `server/routes/*`, `server/index.js`, un handler, etc. exige
un **redémarrage du serveur** (LaunchAgent / `aps-restart`) : le code tourne en
mémoire, l'ancien reste actif sinon. **Un bug qui « revient » après merge = presque
toujours un serveur pas redémarré.** Le préciser dans les instructions de merge dès
qu'un fichier serveur est touché.

### Ce qui n'est PAS commité

Les **workflows** et **templates d'arborescence** sont des DONNÉES (Iconik/base), pas
du code. Jamais de patch pour eux. Seul le code moteur/UI passe par le flux git.

---

## 1. Règle d'or — Investiguer AVANT de patcher

**Ne jamais patcher sans avoir lu le code réel.** `grep -n` pour localiser → `view` /
`sed -n` pour lire → seulement ensuite décider. Au moindre doute sur un mécanisme
jamais vérifié, **tester en console d'abord** (fetch isolé sur la page concernée).

### Corollaire majeur (vérifié 3× dans la session Builder) : LIRE WFD D'ABORD

Quand WFD a déjà résolu une interaction/un comportement, **lire son code avant de
tenter quoi que ce soit.** Trois bugs de la session Builder ont coûté des itérations
parce qu'on a codé « à l'intuition » au lieu de lire WFD d'abord :
- la **connexion port-à-port** (setupPortDrag dans `script-workflow-designer.js`) ;
- l'**ancrage** d'une liaison (même fichier) ;
- le **test de connexion** (`testerConnexion`, même fichier) — WFD tape des endpoints
  connus et considère 401/403 comme « API joignable », pas comme échec.
Le code qui tourne est la meilleure spec. Réflexe : `grep` dans
`server/public/platforms/iconik/workflow/*.js` avant d'inventer.

### Corollaire : DIAGNOSTIQUER avant de re-patcher quand on a déjà supposé faux

Si un premier fix ne change rien, **ne pas re-supposer** : instrumenter (console.log
temporaire), faire tourner côté navigateur, lire la sortie réelle, PUIS corriger.
Le bug « arêtes qui vrillent au zoom » a été résolu ainsi : le diag a révélé
`offsetWidth = 0` (qui neutralisait le premier fix en silence). Un patch de
diagnostic jetable coûte un rechargement et donne la certitude.

---

## 2. Méthode de patch — str_replace / create_file / Python inline

- **`str_replace`** : remplacement unique bien délimité. Vérifier l'unicité.
- **`create_file`** : fichier neuf. Échoue si le chemin existe → utiliser
  `bash cat > … << 'EOF'` pour écraser un fichier existant.
- **Python inline** (`python3 << 'PYEOF'`) : remplacements multiples, avec
  `assert content.count(old) == 1` de sécurité. Gère mieux l'encodage que `sed`.

Après TOUT patch JS : `node --check`. Sans exception. Vérifier les **doublons** de
blocs après un ajout (`grep -c`), surtout dans les gros fichiers.

---

## 3. Pièges techniques récurrents

### Interactions / DOM (session Builder)
- **`setPointerCapture` fausse `elementFromPoint`.** Sous capture de pointeur,
  `e.target` et `elementFromPoint` restent figés sur l'élément capteur → toute
  détection de « ce qui est survolé » échoue. Solution : geste souris classique
  (mousedown/move/up) + `document.elementsFromPoint` (PLURIEL, traverse les
  éléments au-dessus). C'est le modèle WFD.
- **Coordonnées et zoom.** La surface du canvas a `transform: scale()` avec
  `transform-origin: 0 0`, et elle est `position:absolute` sans largeur → son
  `offsetWidth = 0` (donc on ne peut PAS déduire l'échelle par la largeur). Le zoom
  fiable est dans la variable CSS `--bd-zoom`. Toute coordonnée issue de
  `getBoundingClientRect` (déjà scalée) placée dans un SVG lui-même scalé subit le
  zoom DEUX fois → diviser par `--bd-zoom`.

### Discipline de code du Builder (STRICTE, demandée par l'utilisateur)
- **Zéro `style=` inline dans le HTML.** Zéro `style.display` / `style.width` / etc.
  en JS pour piloter l'apparence. L'apparence passe par des **classes** et des
  **`data-*`** lus en CSS. SEULE exception tolérée : `el.style.setProperty('--var',
  valeur)` — c'est passer une DONNÉE au CSS, pas de l'apparence en dur.
- **Split par défaut** : un module = un concern, un fichier. Un patch sur l'un ne doit
  pas régresser les autres. (Leçon du monolithe WFD : `wfd-config-panel.js` = 10 408
  lignes, 222 fonctions.)
- **Commentaires du code en français, textes d'UI en anglais.**

### Pièges hérités WFD (toujours valables)
- **Doublons de fonctions** : `grep -c` après ajout.
- **Champs système vs metadata** (Recherche APS) : ne pas préfixer `metadata.` un
  champ système ; trois listes à tenir synchro.
- **`resolve()` détruit les tableaux** (`String(...)`) : utiliser `resolvePath` pour
  une valeur brute.
- **`||` vs `??`** : `0` est une valeur valide, ne pas la coercer en vide → `??`.
- **Tabler Icons ne rendent pas** en contexte Electron/WFD : caractères Unicode.

---

## 4. Communication & mode de collaboration

- **Réponses concises.** Éviter pavés, questions multiples, redites.
- **EXÉCUTER la stratégie, ne pas re-décider à chaque pas.** L'utilisateur investit
  des sessions à préparer une stratégie (ex. le panneau Config déclaratif). Une fois
  la stratégie posée, il veut des **patchs à tester/valider**, PAS des micro-choix à
  chaque étape (chronophage, gâche sa préparation). Avancer par patchs livrés en
  bloc ; ne reposer une question que si un vrai choix d'architecture non tranché
  surgit. « Je peux tester, valider… mais faire des choix à chaque pas, c'est
  chronophage. »
- **Un patch = un nom de branche + les commandes git complètes**, à chaque livraison.
- **Expériences de pensée / design produit** : l'utilisateur ouvre régulièrement des
  réflexions d'architecture sans attendre un accord. Y entrer sérieusement, le
  contredire avec des arguments si besoin, plutôt qu'acquiescer. Ces échanges ont
  produit des décisions structurantes (ex. « organisation au sommet », ressources ≠
  infrastructure).
- **Journal : NE JAMAIS le générer proactivement.** Sa génération est coûteuse ;
  l'utilisateur décide quand. Attendre sa demande explicite.
- **Ports « erreur » / notifications** : ne pas s'y attarder tant qu'on n'en est pas
  à l'étape notifications.

---

## 5. Coordonnées techniques

| Élément | Valeur |
|---|---|
| Repo | `https://github.com/FarTop/aps-askida` (public) |
| Repo côté Claude | `/home/claude/aps-askida` |
| Repo côté utilisateur | `~/aps` (Mac Mini M1, `192.168.1.102`) |
| Patches reçus dans | `~/aps/_Patches/` |
| Zips produits dans | `/mnt/user-data/outputs/` |
| Redémarrage serveur | LaunchAgent / `aps-restart` (obligatoire si patch serveur) |
| Tests console WFD | page Recherche APS (`_BASE`, `_env` dispo) |
| Builder (fichiers) | `server/public/builders/workflow/` |
| Référence WFD (à lire) | `server/public/platforms/iconik/workflow/script-workflow-designer.js`, `wfd-config-panel.js` |
| Warning Keychain push | `-25308` = non-bloquant, ignorer |
