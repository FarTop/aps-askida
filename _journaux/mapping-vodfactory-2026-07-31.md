# Mapping Iconik → VOD Factory — mise à jour du 31/07/2026

_Complète et corrige `mapping-vodfactory-2026-07-07.md`. Source : export
`_journaux/WORKFLOWS_WFD_VODFACTORY.json` (29/07/2026, flow
`BAYARD|PUBLISH|VODFACTORY V2`, nœud `LookUp`) + doc partenaire
`_journaux/VOD FACTORY DOC/doc_api_partner.pdf` /
`Partner_API_Onboarding_external.pdf` (identiques à 95%, la seconde a un
changelog en plus, `0.8.15 / 2026-05-18`)._

**Constat de méthode** : le nœud `LookUp` réel (`config.lkRows`) est la
source fiable. Le `wfdMappings` top-level du même export est une copie
miroir **non synchronisée** — deux divergences confirmées ci-dessous.

---

## Les deux incohérences du 07/07 : tranchées

### 1. Type de contenu "Série" → `"serie"` (sans s) — CONFIRMÉ CORRECT

Le nœud réel envoie `"serie"`. La doc `doc_api_partner.pdf` (page 6, table
Attributes + page 5, exemple de payload) donne `"series"` — mais
**VOD Factory a confirmé de vive voix que c'est une coquille dans leur
propre doc** : la valeur attendue par l'API est bien `"serie"`.

⚠️ Piège pour une prochaine session : ne pas "corriger" `serie` → `series`
en se fiant au PDF. Le PDF a tort sur ce point précis, le workflow a
raison. La collection Postman `Light_Partner_BayaM.postman_collection.json`
(environnement `partner-service.staging.vodfactory.com`, probablement un
autre partenaire) est cohérente avec le workflow (`serie`), pas avec le PDF.

`methode-vodfactory-2026-07-07.md` §1 utilise encore `series` dans son
énumération des types de contenu — à corriger en `serie` si ce document
est repris.

### 2. `URLSeasonArt` → `images.amazon.season_box_art` — CONFIRMÉ CORRECT

Le nœud `LookUp` réel donne `season_box_art`. Le `wfdMappings` miroir
donne `season_art` — **`season_art` n'existe nulle part dans les 6 PDF**
de doc partenaire (grep négatif sur l'ensemble). C'est une erreur du
miroir, sans conséquence tant que celui-ci n'est jamais relu par le
moteur — mais à corriger ou supprimer si le miroir est un jour utilisé
comme source.

---

## Divergences supplémentaires trouvées entre nœud réel et miroir `wfdMappings`

Le miroir n'est pas à jour sur au moins deux autres points (le nœud réel
prime dans les deux cas) :

| Champ | Nœud `LookUp` (réel) | `wfdMappings` (miroir, obsolète) |
|---|---|---|
| Type de contenu | source = `ContenuPrime` (nouveau champ dédié, acté le 07/07) | source = `TypeContenu` (ancien champ, générique) |
| Crédits (`Realisateur`, `Acteur`, `AuteurOrigine`, `Auteur`, `Producteur`) | `persons[job=director\|actor\|creator\|writer\|producer].external_id` | `persons` (plat, sans discrimination de rôle) |

---

## Champs requis Amazon absents du mapping actuel

Trouvés en croisant la table "Required attributes" (`doc_api_partner.pdf`
p.6-7) avec les champs déjà mappés :

| Champ | Type | Requis pour | Statut |
|---|---|---|---|
| `video_quality` | texte, `SD`/`HD`/`UHD` | tous | **Absent du mapping — à ajouter** |
| `duration` | entier, secondes | `program`, `episode` | **Absent du mapping — à ajouter** |

Ne pas confondre `video_quality` (métadonnée du content) avec
`availabilities.amazon[].format_profile` (même vocabulaire SD/HD/UHD,
mais champ distinct au niveau de chaque disponibilité) — les deux
existent séparément dans la doc.

## Contraintes à vérifier (pas des champs manquants)

- **`genres` : maximum 3 genres uniques acceptés par Amazon** (doc p.6 et
  p.10). Rien dans le workflow actuel ne tronque la liste — à vérifier
  qu'un contenu Iconik avec >3 genres cochés ne casse pas l'envoi.
- **`persons` : au moins un `director` requis** (doc p.17) — déjà couvert
  par le mapping actuel, rien à faire.
- `parent_external_id` : requis pour `season`, `episode`, et `tv_show`
  (doc p.6) — cohérent avec l'usage actuel.

## Types d'artwork Amazon non exposés par VOD Factory

`Video Central_Prime_Artworks.pdf` (spec Amazon "Video Central") documente
`carousel_hero` (8:3, 3840×1440, 10MB) et un artwork trailer/bonus (16:9,
1920×1080, 10MB) — absents de la table `images.amazon.*` de la doc Partner
API VOD Factory. À clarifier avec VOD Factory : non exposés pour l'instant,
ou gérés autrement ?

---

## Table de référence — `images.amazon.*` (doc partenaire p.9-10, recoupée avec `Video Central_Prime_Artworks.pdf`)

| Champ | Ratio | Résolution recommandée | Résolution min. | Poids max | Format | Requis | Niveau |
|---|---|---|---|---|---|---|---|
| `box_art` | 3:4 | 1920×2560 | 1200×1600 | 10 MB | jpg/png | Oui | Program |
| `cover_art` | 16:9 | 3840×2160 | 1920×1080 | 10 MB | jpg/png | Oui | Program, Série, Saison |
| `poster_art` | 2:3 | 2000×3000 | 2000×3000 | 10 MB | jpg/png | Oui | Program, Série, Saison |
| `hero_art` | 16:9 | 3840×2160 | 1920×1080 | 10 MB | jpg/png | Oui | Program, Série, Saison |
| `title_art` | flexible | 2200×960 | 1100×660 | 1 MB | png, fond transparent | Non (encouragé) | Program, Série, Saison |
| `season_box_art` | 4:3 | 2560×1920 | 1600×1200 | 10 MB | jpg/png | Oui | Saison |
| `episodic_art` | 16:9 | 3840×2160 | 1920×1080 | 10 MB | jpg/png | Non bloquant (`Artworks_Requirement.pdf`) | Episode |

Cohérent avec la table déjà actée dans `methode-vodfactory-2026-07-07.md` §2.

---

## Table de référence — enum `type`

Source `doc_api_partner.pdf` p.6 : `program / series / season / episode /
magazine / tv_show` dans la doc — **mais le workflow réel envoie `serie`
et non `series` pour le type Série** (cf. correction ci-dessus). Seuls
`program`, `serie`(sic), `season`, `episode` sont couverts par le workflow
actuel (branches de la décision `Collection Type ?` / `Décision` dans
PUBLISH). `magazine` et `tv_show` ne sont pas construits.

---

## Ground truth API — endpoints réellement appelés (nœud `http_sequence`
"Publication API", flow PUBLISH)

```
POST /api/persons                    (×5 — director, actor, creator, writer, producer, en foreach)
POST /api/contents/
POST /api/contents/{external_id}/videos
```

Payload vidéo réel (`bodyTemplate` du step "Video Action") — inclut sous-titres
et pistes audio, absent du mapping champ-à-champ précédent :

```json
{
  "external_id": "{external_id}-video-main",
  "partner": "amazon",
  "type": "main",
  "url": "{s3_video_url}",
  "duration": "{duration}",
  "subtitles": [
    { "external_id": "{external_id}-sub-fr", "language_code": "fr-FR", "version": "normal", "url": "{s3_srt_url}" }
  ],
  "audiotracks": [
    { "language_code": "fr-FR", "is_original_version": true }
  ]
}
```
