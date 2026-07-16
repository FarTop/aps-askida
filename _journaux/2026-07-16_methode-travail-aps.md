# Méthode de travail — APS Askida Platform Studio
_Mise à jour 2026-07-16_

> Ce document décrit **comment on travaille ensemble** (le processus), pas l'état
> technique du système (voir `cartographie-wfd`) ni le récit des sessions (voir
> `journal-aps`).

---

## 0. Flux Git / VS Code — LE processus standard (à lire en début de chaque session)

> ⚠️ **Ce flux est systématiquement oublié en début de session.** Il est placé en
> tête exprès. Claude ne travaille PAS en commitant directement sur `main` ni en
> éditant les fichiers de l'utilisateur : il produit des **patches** que
> l'utilisateur applique lui-même côté Mac Mini via VS Code. C'est non négociable.

### Le cycle complet, étape par étape

**Côté Claude (environnement conteneur, repo cloné dans `/home/claude/aps-askida`) :**

1. **Synchroniser sur `origin/main`** avant toute modification :
   ```bash
   git fetch origin -q && git checkout main -q && git reset --hard origin/main -q
   ```
2. **Créer une branche dédiée** au correctif (jamais travailler sur `main`) :
   ```bash
   git checkout -b feat-nom-du-fix   # ou fix-nom-du-bug
   ```
3. **Modifier** via `str_replace` ou Python inline (voir §2).
4. **Vérifier la syntaxe** : `node --check fichier.js` sur CHAQUE fichier JS touché.
5. **Vérifier l'absence de doublons** de fonctions (piège récurrent, voir §3).
6. **Commit** avec un message détaillé (le POURQUOI, pas juste le QUOI) :
   ```bash
   git add <fichiers> && git commit -q -m "feat(scope): ..."
   ```
7. **Générer le patch** et le zipper dans `/mnt/user-data/outputs/` :
   ```bash
   git format-patch main -o /tmp/patches --no-numbered
   cd /tmp/patches && zip -j /mnt/user-data/outputs/feat-nom-du-fix.zip *.patch
   ```
8. **Présenter le zip** (`present_files`) + **donner les commandes git complètes**
   à l'utilisateur (voir bloc ci-dessous).

**Côté utilisateur (Mac Mini, `~/aps`, VS Code SSH terminal) :**

```bash
git checkout main && git pull
git branch -D feat-nom-du-fix 2>/dev/null
git checkout -b feat-nom-du-fix
rm -rf /tmp/patches
unzip _Patches/feat-nom-du-fix.zip -d /tmp/patches
git am /tmp/patches/*.patch
```

Puis, une fois testé et validé, l'utilisateur **merge lui-même** :
```bash
git checkout main
git merge feat-nom-du-fix
git push origin main
git branch -d feat-nom-du-fix
```

### Règles et pièges de ce flux

- **Toujours fournir les commandes git COMPLÈTES** à chaque livraison de patch.
  L'utilisateur ne devrait jamais avoir à les reconstituer de mémoire.
- **Le warning Keychain `failed to get/store: -25308`** au `git push` est un
  **non-problème connu** (trousseau macOS). Le push réussit quand même. Ne jamais
  s'en alarmer ni chercher à le corriger.
- **Vim s'ouvre sur les messages de merge** (`MERGE_MSG`). Séquence pour en sortir :
  `Échap` puis `:wq` puis `Entrée`.
- **Conflits de merge** : ne jamais demander à l'utilisateur de résoudre à la main
  s'il n'est pas à l'aise. Lui faire coller le bloc en conflit (`sed -n`), puis
  fournir un **script Python** qui remplace le bloc `<<<<<<< / ======= / >>>>>>>`
  proprement. Vérifier ensuite qu'il ne reste plus de marqueurs.
- **Les variables `_BASE` / `_env`** des tests console n'existent que sur une page
  APS chargée (typiquement la page **Recherche APS**). Toujours préciser sur quelle
  page lancer un `fetch` de test.
- **Après `aps-restart`** : indispensable pour que le serveur recharge le code
  patché. Un bug qui "revient" après un merge est presque toujours un serveur pas
  redémarré (code en mémoire = ancienne version). Le réflexe à vérifier en premier.

### Ce qui n'est PAS commité

Les **workflows** (Créer Série/Saison/Episode, Publier) et les **templates
d'arborescence** sont des **données** stockées côté Iconik/base, pas du code du
repo. On ne les commite jamais, on ne génère pas de patch pour eux. Ils s'exportent
en JSON depuis l'interface pour relecture/archivage, c'est tout. Seul le **code du
moteur/UI** passe par le flux git ci-dessus.

---

## 1. Règle d'or — Investiguer AVANT de patcher

**Ne jamais patcher sans avoir d'abord lu le code réel.** La semaine a répété la
leçon : à chaque fois qu'on a supposé le comportement d'un nœud au lieu de lire son
handler, on s'est trompé (`filters` ignoré, `parent_id` vs `in_collections`,
`media_type` préfixé `metadata.`, la Boucle qui ne traitait que le 1er élément...).

Le réflexe correct :
1. `grep -n` pour localiser le handler/la fonction.
2. `view` / `sed -n` pour lire le code réel.
3. Seulement ensuite, décider du patch.

Corollaire : **quand un doute surgit sur un mécanisme jamais vérifié, tester en
console d'abord** (un `fetch` isolé sur la page Recherche APS), exactement comme on
a validé `_exists_`, `contains`, `media_type`, la remontée parent, etc. avant de
construire dessus.

## 2. Méthode de patch — Python inline ou str_replace

Deux outils, selon le cas :
- **`str_replace`** : idéal pour un remplacement unique et bien délimité. Vérifie
  l'unicité de la chaîne. À privilégier quand le contexte est clair.
- **Python inline** (`python3 << 'PYEOF'`) : pour les remplacements multiples, ou
  quand il faut un `assert content.count(old) == 1` de sécurité avant d'écrire.
  Toujours `assert` le nombre d'occurrences pour ne pas remplacer au mauvais endroit.

Après TOUT patch JS : `node --check`. Sans exception.

## 3. Pièges récurrents vérifiés cette semaine

- **Doublons de fonctions** : `wfd-config-panel.js` a déjà eu deux définitions de la
  même fonction (la 2ᵉ écrasant la 1ʳᵉ silencieusement). Après un patch qui ajoute
  ou modifie une fonction, `grep -c "^function nom"` pour confirmer l'unicité.
- **Champs système vs metadata** dans la Recherche APS : un champ système
  (`id`, `title`, `media_type`, `object_type`...) ne doit PAS être préfixé
  `metadata.`. Il existe TROIS listes à tenir synchronisées (sélecteur du panneau,
  traducteur moteur, traducteur page standalone). Oublier une des trois = bug
  silencieux. Cf. `doc_types` et `media_type`.
- **`resolve()` détruit les tableaux** : `resolve()` fait `String(...)`, ce qui
  transforme un tableau en `"[object Object],..."`. Pour lire une valeur BRUTE
  (tableau, objet) depuis le contexte, utiliser `resolvePath` directement, jamais
  `resolve()`.
- **Sacs opaques exposés par les nœuds** : quand un nœud stocke un résultat sous un
  nom (`collectionCheck`, `saisonData`...), ses sous-champs (`.count`, `.title`,
  `.id`) ne sont PAS tous garantis. Le fetch en mode `parent` par exemple n'expose
  PAS `.title`. Toujours vérifier dans le Run Panel ce qui est réellement disponible
  avant de bâtir un chemin dessus. (Voir dette UX : les variables « apparaissent de
  nulle part ».)

## 4. Communication

- **Réponses concises** demandées explicitement par l'utilisateur. Éviter les pavés,
  les questions multiples, les redites.
- **Un patch = un nom de branche + les commandes git complètes.**
- **Ports "erreur" / notifications** : l'utilisateur a demandé plusieurs fois de ne
  PAS s'attarder sur les ports erreur tant qu'on n'en est pas à l'étape notifications.
  Ne pas chipoter dessus en cours de construction.
- **Expériences de pensée** : l'utilisateur ouvre régulièrement des réflexions de
  design produit sans attendre qu'on soit d'accord. Y entrer sérieusement, quitte à
  le contredire avec des arguments, plutôt que d'acquiescer.

## 5. Coordonnées techniques

| Élément | Valeur |
|---|---|
| Repo | `https://github.com/FarTop/aps-askida` |
| Repo côté Claude | `/home/claude/aps-askida` |
| Repo côté utilisateur | `~/aps` (Mac Mini) |
| Patches reçus dans | `~/aps/_Patches/` |
| Zips produits dans | `/mnt/user-data/outputs/` |
| Redémarrage serveur | `aps-restart` |
| Tests console | page Recherche APS (`_BASE`, `_env` dispo) |
| Warning Keychain push | `-25308` = non-bloquant, ignorer |
