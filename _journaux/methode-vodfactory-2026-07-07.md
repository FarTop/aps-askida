# Méthode & architecture — Livraison VOD Factory (Groupe Bayard)

_Document de référence, à jour au 07/07/2026 soir. Complète le journal
(narratif) par une vue structurée des décisions actées et des points
ouverts, pour reprise rapide en session future._

---

## Vue d'ensemble — les workflows identifiés

La livraison VOD Factory se décompose en **5 workflows distincts**,
pas un seul monolithique :

| # | Nom (proposé) | Déclencheur | Statut |
|---|---|---|---|
| 1 | Gestion ID Série | Planifié (Timer) | Non construit — conception ouverte (§4) |
| 2 | Gestion ID Saison | Planifié (Timer) | Non construit — conception ouverte (§4) |
| 3 | Copie Parent ID → Episode | Planifié (Timer) OU dynamique | Non construit — arbitrage ouvert (§4) |
| 4 | Publication (`BAYARD\|PUBLISH\|VODFACTORY`) | Custom Action sur asset | **Existant**, en cours d'ajustement (§2, §4) |
| 5 | Validation statuses | Timer Cron quotidien | **Conçu en détail, non construit** (§3) |

Les workflows 1-2-3 gèrent la hiérarchie Série→Saison→Episode
(identifiants Bayard + `parent_external_id`). Le workflow 4 publie
l'épisode. Le workflow 5 vérifie a posteriori que VOD Factory a bien
tout reçu.

---

## §1 — Modèle de données VOD Factory (rappel)

- **Types de contenu** : `program` (film autonome) / `series` /
  `season` / `episode` / `magazine`. Un **asset** Iconik ne peut
  jamais être littéralement "series" ou "season" (ce sont des
  conteneurs de métadonnées, pas des fichiers média) — seuls
  program/episode/magazine correspondent à un vrai fichier.
- **Hiérarchie** : Série ← Saison ← Episode, chaînée via
  `parent_external_id` (chaque niveau ne référence QUE son parent
  immédiat, pas de raccourci Episode→Série direct) + `rank` (position
  dans le parent, requis dès qu'il y a un `parent_external_id`).
- **Automation d'envoi** : VOD Factory traite automatiquement, **une
  fois par jour à minuit**, tout contenu modifié dans les 24h
  précédentes. Comportement déterministe (pas d'heure variable).
- **Statut de livraison** : `GET /api/contents/{external_id}/action-statuses`
  — par action (`amazon_avails`, `amazon_data`, `amazon_pictures`,
  `amazon_videos`), un couple `status` (`not_created`→`incomplete`→
  `ready`→`success`) / `sent_at` (`null` jusqu'à l'envoi réel).

## §2 — Artworks requis par type (Amazon)

| Artwork | Program | Série+Saison | Saison seule | Episode |
|---|---|---|---|---|
| `box_art` | **Requis** | — | — | — |
| `cover_art` | Requis | **Requis** | — | — |
| `poster_art` | Requis | **Requis** | — | — |
| `hero_art` | Requis | **Requis** | — | — |
| `title_art` | Optionnel | Optionnel | — | — |
| `season_box_art` | — | — | **Requis** | — |
| `episodic_art` | — | — | — | Optionnel |

**Magazine** : non documenté dans la doc Amazon consultée. Provisoire :
aligné sur Program, à confirmer auprès de VOD Factory.

**Décision actée** : un seul nœud `aws_s3` (ramasse tout sans
condition — pas de logique de type dedans). Decision sur
`{vodFactoryPayload.type}`, Vérificateur dupliqué par branche (clone de
"Vérificateur Phase 1"), chaque branche ne checkant que les champs
requis pour son type. **Branche Episode** vérifie aussi les champs
Série+Saison (cover/poster/hero/season_box_art), faute de process
séparé qui les enverrait autrement (cf. §4).

Rejeté : boucle data-driven sur une liste d'artworks paramétrée — ne
s'applique pas ici car le nœud `aws_s3` ne sait pas recevoir sa liste
`artworks` depuis une variable (config statique par instance de nœud),
et le nombre de types (5, fixes, définis par VOD Factory) est trop
petit pour justifier l'indirection.

## §3 — Validation statuses (workflow 5)

**Architecture actée** :
```
Timer (Cron, 1×/jour ~2-3h) → Search (assets statut "en attente")
  → Checker (action-statuses, 8 conditions ET) → History (succès/échec)
```

Rejeté : `wait_for` en flux continu dans le workflow de publication —
bloquerait une exécution en mémoire jusqu'à ~24h, fragile en cas de
redémarrage serveur pendant l'attente (perte silencieuse). Le Timer
Cron quotidien élimine ce risque (exécutions courtes et indépendantes,
+ couvre naturellement l'horaire fixe de minuit de VOD Factory).

**8 conditions du Checker** (toutes en ET — le moteur `checker` n'a
qu'un seul mode, aucune notion de OR) :

| Action | Champ status | Champ sent_at |
|---|---|---|
| `amazon_avails` | `results.amazon.actions.amazon_avails.status` == `success` | `...amazon_avails.sent_at` non vide |
| `amazon_data` | `...amazon_data.status` == `success` | `...amazon_data.sent_at` non vide |
| `amazon_pictures` | `...amazon_pictures.status` == `success` | `...amazon_pictures.sent_at` non vide |
| `amazon_videos` | `...amazon_videos.status` == `success` | `...amazon_videos.sent_at` non vide |

**Messages `workflow_history`** :
- Succès : `Livraison Amazon Prime — ✅ Amazon : Validé par VOD Factory` + `{checkerSummary}`
- Échec : `Livraison Amazon Prime — ❌ Amazon : Échec de validation VOD Factory` + `{checkerSummary}`

(`{checkerSummary}` = "OK" si succès, sinon liste des échecs avec
valeur réelle — seule variable fiable disponible, ce flux étant séparé
du flux de publication, pas d'accès aux variables S3 de celui-ci.)

Non traité : message dédié pour la 3e sortie du Checker ("Erreur
HTTP", ex. VOD Factory injoignable) — reste sur traitement générique
pour l'instant.

## §4 — Hiérarchie Série/Saison/Episode (OUVERT, non tranché)

### Ce qui est confirmé
- Pas de gestion Bayard existante de la hiérarchie — tout est à
  construire.
- Champ Iconik "ParentID" (asset épisode) créé et mappé par Farid en
  session → `parent_external_id`.
- Champ Iconik "NumeroEpisode" (asset épisode, **type Entier**) —
  **à créer**, à mapper → `rank` (également Entier côté mapping, pas
  Texte, sinon VOD Factory reçoit `"1"` au lieu de `1`).

### Ce qui est découvert mais non résolu
La doc VOD Factory décrit Série et Saison comme des **objets créés par
leurs propres appels POST** (`type: "series"`/`"season"`, avec leurs
propres `title`, artworks) — pas seulement une référence dans le
payload épisode. Si le workflow de publication n'envoie QUE des
épisodes, VOD Factory n'a potentiellement aucune trace de la Série/
Saison référencée par `parent_external_id`.

**Incertitude assumée** : la doc ne précise pas explicitement le
comportement si `parent_external_id` pointe vers un objet inexistant
côté VOD Factory (rejet vs tolérance/création implicite). Pas trouvé
de confirmation écrite noir sur blanc.

**Action recommandée avant de construire** : test direct en Preprod
(poster un épisode avec un `parent_external_id` inconnu de VOD
Factory, observer la réponse) — plus rapide qu'une demande écrite à
VOD Factory, et lève l'ambiguïté avec certitude.

### Deux approches en discussion (aucune tranchée)

**A — Timer planifié séquentiel** (mitigation naturelle de la
concurrence, cohérent avec le pattern déjà retenu pour §3) :
1. Recherche collections "Série" sans Bayard ID → génère + POST série
   à VOD Factory
2. Recherche collections "Saison" (parent Série déjà identifié) sans
   Bayard ID → génère + POST saison à VOD Factory (référence Série)
3. Recherche assets "Episode" avec ParentID vide → copie l'ID Saison

Nécessite de distinguer Série vs Saison sans ambiguïté — proposition :
nouveau champ metadata **"TypeCollection"** (Série/Saison/Autre) sur
la vue Collection Iconik (alternative écartée : déduire depuis la
profondeur de collection, jugée trop fragile — une collection mal
rangée fausse tout silencieusement).

**B — Dynamique au fil de l'eau** (proposée par Farid, plus tard dans
la discussion) : au moment de publier l'épisode, fetch/create-if-missing
directement dans le même job, en remontant la hiérarchie de collections
de l'asset pour identifier Saison (parent) et Série (grand-parent) —
plus besoin de "TypeCollection", la position dans l'arbo suffit.

- **Avantage** : plus simple, pas de nouvelle metadata de typage.
- **Risque identifié** : concurrence si plusieurs épisodes d'une
  saison neuve se publient simultanément (import en lot) → création
  en double côté VOD Factory ou écriture concurrente sur le même champ
  Iconik.
- **Mitigations possibles, non détaillées** : (1) verrou léger sur le
  champ Bayard ID de la Saison pendant sa création, ou (2) garder le
  Timer planifié pour la CRÉATION (séquentielle) mais utiliser
  l'approche fetch-simple pour la PUBLICATION (échec propre si
  hiérarchie incomplète, pas de tentative de création à ce stade).

**Politique actée sur la mise à jour** (indépendamment de A/B) :
ignorer si Série/Saison déjà créées côté VOD Factory (pas de ré-envoi
à chaque épisode) — une vraie mise à jour de Série/Saison (nouveau
synopsis, nouvelle jaquette) mériterait son propre déclencheur, pas
d'être accrochée à la publication d'un épisode.

### Champs prévus pour les Lookup Série/Saison (à construire, non commencées)
Contrairement à l'intuition initiale, PAS un sous-ensemble de la
Lookup épisode actuelle (32 champs, pensée pour un asset avec durée/
vidéo/personnes) — un jeu de champs propre et plus léger :

| Champ | Série | Saison |
|---|---|---|
| `title` | Requis | Requis |
| `sku_code` | Optionnel | Optionnel |
| `parent_external_id` | — | Requis (→ Série) |
| `rank` | — | Requis |
| `cover_art`/`poster_art`/`hero_art` | Requis | Requis |
| `title_art` | Optionnel | Optionnel |
| `season_box_art` | — | Requis |
| durée, qualité vidéo, personnes, sous-titres, genres... | Non applicable | Non applicable |

Source : metadata de **Collection** (pas Asset comme l'actuelle) —
cohérent avec le fait que Série/Saison sont des collections Iconik,
pas des assets.

---

## Conventions de nommage retenues (Iconik → VOD Factory)

Voir `mapping-vodfactory-2026-07-07.md` pour la table complète des 32
champs existants + les 2 nouveaux (ParentID, NumeroEpisode).
