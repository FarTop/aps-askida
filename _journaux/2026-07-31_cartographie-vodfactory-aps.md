# Cartographie — 6 flows WFD VOD Factory & couverture façades Builder

_Session du 31/07/2026. Source : export
`_journaux/WORKFLOWS_WFD_VODFACTORY.json` (29/07/2026, organisation
"Groupe Bayard", `schema: iconik-global-config`). Complète
`methode-vodfactory-2026-07-07.md` avec l'état réel du 29/07 et vérifie la
couverture de `pivot-catalog-iconik.js` (façades Builder) contre ce même
export._

---

## Les 6 flows WFD

| Flow | id | Nœuds | Rôle |
|---|---|---|---|
| `BAYARD\|CREER SERIE\|VODFACTORY` | `flux-1783938021068` | 2 | Trigger custom_action → crée l'arborescence (collection racine) |
| `BAYARD\|CREER SAISON\|VODFACTORY` | `flux-1783963582570` | 5 | Trigger → fetch collection parente → vérifie qu'elle est dans une Série → crée l'arborescence |
| `BAYARD\|CREER UNITAIRE\|VODFACTORY` | `flux-1784200993156` | 2 | Trigger → crée l'arborescence à plat |
| `BAYARD\|CREER EPISODE\|VODFACTORY` | `flux-1784146692839` | 5 | Trigger → fetch collection parente → vérifie qu'elle est dans une Saison → crée l'arborescence |
| `BAYARD\|PUBLISH\|VODFACTORY V2` | `flux-1784039454428` | 76 | Publication complète — voir détail ci-dessous |
| `BAYARD\|STATUSES\|VODFACTORY` | `flux-1783521869691` | 11 | Minuterie cron quotidienne → vérifie les statuts de livraison |

## PUBLISH V2 — structure (76 nœuds)

Décision racine `Collection Type ?` (labels `Série`/`Saison`/`Episode`/
`Unitaire`, alimentée par `ContenuPrime`) route vers 4 branches
quasi-symétriques. Motif répété par branche :

```
aps_search "Collection Check" → decision "Count ?" (== 1)
  → aps_search "Artworks" → loop "Boucler sur"/"Artwork" → aws_s3 → action "Export Location" → wait_for "Attendre"
  → aps_search "Video" → loop "Video" → aws_s3 → action "Export Location" → wait_for "Attendre"
```

Les 4 branches convergent vers :

```
decision "Bayard ID ?" (is_empty sur {asset.metadata.PrimeID})
  → id_generator "Générateur d'ID" (si vide, numeric, 8 car.)
→ update_meta "Ecrire Collection"
→ lookup "LookUp" (32+ champs, cf. mapping-vodfactory-2026-07-31.md)
→ decision "Décision" (Série/Saison/Episode/Unitaire — re-routage post-lookup)
→ checker "Vérificateur Unitaire" / "Vérificateur Episode" / "Vérificateur Série" / "Vérificateur Saison"
→ aps_search "Presence Serie/Saison/Video", "MD Check" ×2
→ http_sequence "Publication API" (POST réels, cf. ci-dessous)
→ update_meta "Statut Succès/Echec" ×4 niveaux (Série/Saison/Episode/Unitaire)
→ workflow_history "Histo Succès/Echec" ×4 niveaux
```

Le nœud `action "Export Location"` (preset `export_location_trigger`)
déclenche l'Export Location Iconik ; le `fileName` généré est
`{slug(serieData.Univers)}_{serieData.BayardID}/{slug(collectionCheck.title)}_{collectionData.BayardID}/{filebase(item.title)}`
— confirme le principe "APS ne bouge pas les bytes" : Iconik pousse vers
S3, APS attend (`wait_for`) puis vérifie par listing (`aws_s3`).

### Endpoints VOD Factory réellement appelés (nœud `http_sequence` "Publication API")

```
POST /api/persons                     ×5 (director, actor, creator, writer, producer — foreach)
POST /api/contents/
POST /api/contents/{external_id}/videos
```

Détail du payload vidéo (sous-titres FR, piste audio) : voir
`mapping-vodfactory-2026-07-31.md`.

## STATUSES — structure (11 nœuds)

```
timer "Minuterie" (cron "00 02 * * *", Europe/Paris, jours 1-5)
→ aps_search "Recherche APS"
→ loop "Boucler sur Collections"
  → checker "Vérificateur Statuses"
  → decision "Décision" (labels: Reporté, Echoué, Reporté — fan-out : deux conditions portent le même
    label "Reporté", donc une seule arête pivot vers cette branche se traduit en 2 connexions WFD)
  → update_meta "Statuses Succès" / "Statuses Ready" / "Statuses Echec"
  → workflow_history "Histo Statuses Succès" / "Reporté" / "Echec"
```

Confirme un détail déjà documenté dans `_journaux/builder-etat.md`
("fan-out : STATUSES a deux conditions Reporté") — vérifié directement
sur les données réelles.

Point notable : dans WFD natif, une minuterie cron est déjà une famille de
nœud à part (`timer`), distincte de `trigger` — pas un `trigger` avec un
preset. Ce flow n'a d'ailleurs aucun nœud `family: trigger`, seulement
`family: timer` en entrée.

---

## Couverture des façades Builder (`pivot-catalog-iconik.js`)

Toutes les familles WFD rencontrées dans les 6 flows sont couvertes par
le catalogue de façades du Builder :

`trigger`, `create_tree`, `fetch`, `aps_search`, `decision`, `aws_s3`,
`update_meta`, `workflow_history`, `action`, `loop`, `wait_for`,
`checker`, `id_generator`, `lookup`, `http_sequence`, `timer`.

Vérifié en confrontant la config réelle des nœuds aux presets/modes
déclarés dans le catalogue :

- `iconik.search` (famille `aps_search`) : modes `retrieve` et `presence`
  tous deux rencontrés en production (ex. "Collection Check" = retrieve,
  "Presence Serie/Saison/Video" = presence).
- `iconik.action` (famille `action`) : preset `export_location_trigger`
  confirmé sur les 8 nœuds "Export Location" de PUBLISH.
- `aps.registry` (famille `id_generator`) : config (`idType`, `varName`,
  `idLength`) conforme à la façade service déclarée `isService: true`.
- Décision à conditions dupliquées (fan-out) : confirmé sur STATUSES
  (deux conditions "Reporté").
- Timer WFD natif = famille distincte du trigger : confirmé, aucun
  `family: trigger` dans STATUSES.

Le commentaire en tête de `pivot-catalog-iconik.js` ("vérifié sur les six
flows de production") est cohérent avec cet export — aucun écart trouvé.

Aucune famille, preset ou mode utilisé en production n'est absent du
catalogue à ce jour (31/07/2026).
