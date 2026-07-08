# Mapping Iconik → VOD Factory — Lookup "Iconik vers VOD Factory"

_Consolidation au 07/07/2026 soir des 30 champs existants + 2 nouveaux
(ParentID, NumeroEpisode). Source : export JSON du workflow
`BAYARD|PUBLISH|VODFACTORY`._

⚠️ **2 incohérences repérées entre différentes copies du mapping dans
l'export JSON — à vérifier/corriger dans le nœud réel avant mise en
production** (détail en bas de document).

---

## Champs métier

| Champ Iconik | Champ VOD Factory | Notes |
|---|---|---|
| `Titre` | `title` | |
| `TitreOriginal` | `original_title` | |
| `Synopsis` | `synopsis` | |
| `SynopsisCourt` | `short_synopsis` | |
| `Classification` | `rating` | |
| `Studio` | `owner` | |
| `DatedeSortie` | `release_date` | |
| `DatedeDebutdeDroits` | `availabilities.amazon[0].starts_at` | |
| `DatedeFinDroits` | `availabilities.amazon[0].ends_at` | |
| `PaysdExploitation` | `availabilities.amazon[0].country_code` | |
| `EnvoiPrime` | _(non mappé)_ | Champ déclencheur du workflow, pas une donnée VOD Factory |

## Type de contenu

| Champ Iconik | Champ VOD Factory | Valeurs |
|---|---|---|
| `TypeContenu` (existant, large — À REMPLACER par nouvelle metadata dédiée, cf. journal §"artworks") | `type` | Emission→`program`, Film→`program`, Série→`series`⚠️, Saison→`season`, Episode→`episode`, Magazine→`magazine` |

⚠️ Rappel : décision actée de créer un **nouveau** champ dédié
(Episode/Émission/Magazine/Film uniquement — asset ne peut jamais être
Série/Saison) plutôt que de continuer à utiliser `TypeContenu` pour
cet usage. Ligne ci-dessus à jour dès que ce nouveau champ existe.

## Genres (liste, avec enfants)

| Champ Iconik | Champ VOD Factory |
|---|---|
| `Genres` (liste) | `genres` |
| ↳ `Drame` | `av_genre_drama` |
| ↳ `Action` | `av_genre_action` |
| ↳ `Comédie` | `av_subgenre_comedy` |
| ↳ `Documentaire` | `av_genre_doc...` _(troncature dans l'export, à revérifier dans le nœud)_ |

## Personnes (crédits)

| Champ Iconik | Champ VOD Factory | Format |
|---|---|---|
| `Realisateur` | `persons[job=director].external_id` | slug |
| `Acteur` | `persons[job=actor].external_id` | slug |
| `AuteurOrigine` | `persons[job=creator].external_id` | slug |
| `Auteur` | `persons[job=writer].external_id` | slug |
| `Producteur` | `persons[job=producer].external_id` | slug |

## Artworks (images Amazon)

| Champ Iconik | Champ VOD Factory | Fallback |
|---|---|---|
| `URLBoxArt` | `images.amazon.box_art` | `{s3_box_url}` |
| `URLCoverArt` | `images.amazon.cover_art` | `{s3_cover_url}` |
| `URLHeroArt` | `images.amazon.hero_art` | `{s3_hero_url}` |
| `URLPosterArt` | `images.amazon.poster_art` | `{s3_poster_url}` |
| `URLSeasonArt` | `images.amazon.season_box_art` ⚠️ | `{s3_season_url}` |
| `URLEpisodicArt` | `images.amazon.episodic_art` | `{s3_episodic_url}` |
| `URLTitleArt` | `images.amazon.title_art` | `{s3_title_url}` |

## Identifiants & hiérarchie

| Champ Iconik | Champ VOD Factory | Fallback | Statut |
|---|---|---|---|
| `BayardID` | `external_id` | `{generated_id}` | Existant |
| `ParentID` | `parent_external_id` | _(aucun — volontaire, doit échouer si vide)_ | **Ajouté en session (07/07 soir)** |
| `NumeroEpisode` | `rank` | — | **À créer** — type Entier des deux côtés |

## Technique

| Champ Iconik | Champ VOD Factory |
|---|---|
| `duration` | `duration` |
| `video_quality` | `video_quality` |

---

## ⚠️ Incohérences trouvées entre copies du mapping dans l'export JSON

L'export du workflow contient le mapping dupliqué à 2 endroits (config
du nœud Lookup + `wfdMappings` associé), avec de légères divergences.
**À vérifier dans le nœud réel** (une des deux copies est peut-être
obsolète) :

1. **Série → type** : une copie donne `"series"`, une autre donne
   `"serie"` (sans s final). La doc API VOD Factory utilise `"series"`
   partout dans ses exemples de payload — probable que `"serie"` soit
   la valeur obsolète/erronée à corriger.
2. **URLSeasonArt → cible** : une copie donne
   `images.amazon.season_box_art` (cohérent avec le nom du champ dans
   la doc API), une autre donne `images.amazon.season_art` (incohérent
   avec la doc). `season_box_art` est très probablement la bonne
   valeur.

## Champs prévus pour les futures Lookup Série/Saison (non construites)

Voir `methode-vodfactory-2026-07-07.md` §4 pour le détail — jeu de
champs différent (title, artworks Série/Saison, parent_external_id +
rank pour la Saison), source metadata **Collection** et non Asset.
