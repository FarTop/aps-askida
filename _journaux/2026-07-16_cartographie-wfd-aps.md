# Cartographie WFD — APS Askida Platform Studio
_Mise à jour 2026-07-16 — complète et actualise `2026-07-05_cartographie-wfd-aps.md`_

> Ce document ne réécrit pas l'intégralité de la carte du 5 juillet (architecture
> canvas, config panel, cycle de vie, CSS — toujours valables). Il consigne ce qui a
> **changé ou été précisé** depuis, notamment côté moteur (nœuds Boucle, Recherche,
> transformations) et côté dette de conception (identifiée dans la discussion Builder).

---

## 1. Évolutions moteur depuis le 05/07

### `loop` — désormais une vraie itération (executor, pas handler)
- **Avant** : stub dans `wfd-engine-handlers.js` qui posait le 1er élément et
  continuait une seule fois. Ne traitait jamais les éléments suivants.
- **Maintenant** : `executeLoopNode` dans **`wfd-engine-executor.js`**, interceptée
  AVANT le dispatch générique (même endroit que les triggers). Le handler `loop` a
  été **supprimé** de handlers.js (mort). Ports : `0` = « Chaque élément » (répété),
  `1` = « Terminé » (une fois), `2` = « Erreur » (si `onError==='port'`).
- **Source résolue via `resolvePath` direct**, jamais `resolve()` (qui stringifierait
  le tableau). Accepte les accolades ou non (`{x.objects}` ou `x.objects`).
- **Modes de source** : seul **`variable`** (« Variable existante », champ
  `loopVariablePath`) est câblé. Les 4 autres (`files`/`assets`/`collection`/`list`/
  `metadata`) affichent un avertissement dans le panneau ET échouent explicitement
  côté executor (pas de faux « 0 élément » silencieux).
- **Expose par élément** : `{item}`, `{item_index}`, et les champs à plat
  (`{item.id}`, `{item.title}`...) pour un objet.
- **Transport d'erreur** (réglage « Si erreur sur un élément ») :
  - `stop` : arrêt net.
  - `continue` : l'échec de l'élément est absorbé, la boucle poursuit.
  - `port` : idem + route l'élément fautif vers le port 2.
  - Dans `continue`/`port`, accumulation exposée après la boucle :
    `{loopVar_errors}` (JSON index+item+message) et `{loopVar_error_count}`.
- **Concurrence** : PAS câblée (toujours séquentiel). Avertissement visible dans le
  panneau.

### `aps_search` — flatten du résultat unique
- Quand exactement **1** résultat : expose `{resultVar.id}`, `.title`,
  `.object_type`, `.external_id` à plat (en plus de `{resultVar}` JSON et
  `{resultVar.count}`). Évite `{resultVar.objects.0.id}`.
- Rappel (inchangé mais critique) : la traduction critère→requête passe par la
  **syntaxe `query`** Elasticsearch/Lucene, PAS par `filters` (ignoré par
  l'endpoint). `doc_types` (pas `object_types`).

### `aps_search` — champ Collection selon l'objet cherché
- Critère Collection traduit en **`in_collections`** si on cherche des **assets**,
  **`parent_id`** si on cherche des **collections** filles. Dépend de `objectType`.
  `ancestor_collections` pour le mode « sous-dossiers » (`in_branch`).

### Champs système de recherche — `media_type` ajouté
- `media_type` est un champ **système** Iconik (valeurs `video`/`image`/`audio`...),
  pas une metadata. Ajouté aux **3** listes à tenir synchronisées :
  sélecteur (`wfd-config-panel.js`), traducteur moteur (`wfd-engine-handlers.js`),
  traducteur + sélecteur page standalone (`script-search.js`).
- Liste système complète : `id, title, media_type, date_created, date_modified,
  object_type, status, archive_status, external_id`.

### Transformations de contexte (`wfd-engine-context.js`)
- `{filebase(NomFichier)}` : retire l'extension finale PUIS slugifie
  (`season.png` → `season`). À utiliser sur les titres de fichiers Iconik (qui
  incluent leur extension) au lieu de `slug()`.
- Rappel des transforms existantes : `slug`, `upper`, `lower`, `trim`, `add`, `pad`.
  ⚠️ **Elles ne s'imbriquent PAS** dans un même champ (`{slug(filebase(x))}` ne
  marche pas) — d'où l'ajout de `filebase` comme transform combinée dédiée.

### `action` / Export Location (`export_location_trigger`)
- Nouveau champ panneau « Asset à exporter » (`cfg.assetId`, défaut `{asset_id}`).
  Le moteur le supportait déjà ; seul le panneau ne l'exposait pas.
- Le nettoyage de `fileName` autorise maintenant le **`/`** (dossiers S3 imbriqués).
  Régex : `[^a-zA-Z0-9_\-\/]`. Confirmé : Iconik crée bien l'arborescence S3.

### `wait_for` — rappel de son rôle « tout-en-un »
- Patiente le job d'export (`GET /API/jobs/v1/jobs/{exportJobId}/`, status
  `FINISHED`), PUIS liste S3 (préfixe) et expose les URLs (`s3_image_url`,
  `s3_video_url`, `s3_srt_url`) via `s3Prefix` + `s3Mappings`. Pas besoin d'un
  `aws_s3` séparé APRÈS l'attente. (Le `aws_s3` en amont sert à la vérification
  d'existence AVANT dépôt, via `list_objects`.)

### `aws_s3` — vérification d'existence
- Pour « le fichier existe-t-il déjà ? » utiliser **`list_objects`** (préfixe), PAS
  `head_object`/`get_object` (correspondance EXACTE → 404 systématique car la clé
  vérifiée n'a pas d'extension, qu'Iconik ajoute au dépôt). Ports Succès (trouvé) /
  Non trouvé / Erreur — pas besoin d'une Décision derrière.

---

## 2. Familles de nœuds (delta)

Table du 05/07 toujours valable. Précisions :
- `loop` : handler retiré de handlers.js, **géré par l'executor** (`executeLoopNode`).
- `gate` : deux modes distincts — pause manuelle (Release) ET throttle (limite le
  nombre de **runs entiers** simultanés, PAS les itérations d'une boucle). Ne pas
  confondre : un throttle « max 3 » dans une boucle séquentielle n'a rien à limiter.

---

## 3. Dette de conception identifiée (discussion Builder — stratégique)

> Distincte des dettes techniques ponctuelles (§4). Ce sont des orientations de fond
> pour le futur Workflow Builder, actées en discussion mais non chiffrées.

1. **Sorties de nœuds opaques** — les nœuds exposent des « sacs » dont les sous-champs
   (`.count`, `.title`) ne sont pas visibles sur le canevas ni garantis. Objectif
   cible : **contrat de nœud lisible** (entrées/sorties nommées et affichées). C'est
   LA priorité avant d'enrichir les nœuds.
2. **Décision mono-critère, sans routing multi-ports** — force des cascades de
   Décisions et le détournement de la Recherche APS pour vérifier une complétude.
   Cible : Décision à *n* conditions composées → *n* ports étiquetés.
3. **Nœuds « Variable » qui écrasent au lieu de composer** — impossible d'accumuler
   dans une structure au fil d'une boucle (d'où le problème « conserver les 4 URLs
   artworks post-boucle »). Manque un mécanisme d'accumulation (équivalent d'un
   nœud-script Momentum, mais natif).
4. **Nœuds de calcul illisibles** — deux « Variable » `add`+`pad` alignés et
   identiques ne disent pas leur intention. Cible : un nœud « calcul » façon
   ID Generator qui affiche le résultat, pas la mécanique.
5. **Science vs dialecte non séparés** — les noms VOD Factory (`season_box_art`) et
   l'ordre de dépendance sont gravés dans les nœuds au lieu d'être dans une **fiche
   de plateforme déclarative** lue par le moteur. `api-ops.py` est un prototype de
   cette fiche.

---

## 4. Dettes techniques actives (mise à jour)

Reprises du 05/07, avec statut :
1. HTML généré non conforme (`style=` inline à migrer) — **actif**.
2. ~~Moteur « En cas d'erreur » non implémenté~~ — **traité pour la Boucle**
   (transport par élément). Reste à généraliser aux autres nœuds.
3. Moteur W/R/C `update_meta` (`op` par ligne) — **à vérifier**.
4. AWS S3 « connexion introuvable » (race condition) — **corrigé** (branche
   `fix-aws-s3-connexion` mergée).
5. DB/localStorage désynchronisés (`isActive`) — **actif**.
6. ~~Gate après libération~~ — **corrigé** (`fix-bille-rouge` / job en échec archivé).
7. Animations badges jobs — actif.
8. Navbar à intégrer — actif.
9. Browse collections 2 clics — comportement, pas bug.

### Nouvelles entrées UX (non bloquant)
- **Accolades incohérentes** (implicites/obligatoires selon le nœud).
- **Autocomplétion pas consciente du contexte déclencheur** (propose
  `{asset.metadata.X}` en flux Collection).
- **Snapshot metadata** : l'actualisation (⟳) peut nécessiter plusieurs clics avant
  qu'un champ récent remonte, même après un sync automatique.
- **Labels parent confus** : « BAYARD ID PARENT » (valeur) vs « NOM DU CHAMP
  PARENT » (nom de champ) — piège récurrent en configuration de `create_tree`.
- **« Le déclencheur » vs « Le parent du déclencheur »** — distinction critique peu
  visible dans le menu du fetch.
