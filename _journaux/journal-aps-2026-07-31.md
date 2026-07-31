# Journal APS — 2026-07-31

> Session très dense, en deux temps : cartographie VOD Factory (doc partenaire
> Amazon Prime + export WFD réel), puis calage architectural Builder (WFD vs
> Builder, RFC IA), puis long audit façade par façade contre les données
> réelles et le moteur. État technique → `builder-etat.md` (section "Audit des
> façades", 31 juillet) ; mapping VOD Factory → `mapping-vodfactory-2026-07-31.md`
> et `2026-07-31_cartographie-vodfactory-aps.md`.

## Fil de la session

### VOD Factory — cartographie
- Le fichier `WORKFLOWS_WFD_VODFACTORY.json` (export du 29/07) et le dossier
  `VOD FACTORY DOC/` (specs partenaire Amazon Prime) ont été déposés dans
  `_journaux/`. Analyse des 6 flows réels + croisement avec la doc PDF partenaire.
- Deux incohérences du mapping (07/07) tranchées : `serie` sans s est
  **correct** (confirmé par VOD Factory — coquille dans leur propre doc PDF,
  piège à ne pas re-corriger dans le mauvais sens) ; `season_box_art` est le
  bon nom de champ (`season_art` était une erreur du `wfdMappings` miroir,
  jamais du nœud réel).
- Champs requis Amazon absents du mapping : `video_quality`, `duration`.
  Contrainte à vérifier : max 3 genres acceptés par Amazon.
- Détail dans `mapping-vodfactory-2026-07-31.md`.

### WFD vs Builder — calage architectural
- Principe posé clairement par l'utilisateur : WFD est une **base de
  connaissance** pour comprendre le besoin réel, jamais un socle fonctionnel
  du Builder à terme. Toute dépendance du Builder à la plomberie construite
  pour WFD (sync Settings → tables `Ikon*`) est à proscrire — même si le code
  vit dans un fichier séparé, non estampillé "WFD".
- Conséquence concrète : le sourcing de métadonnées/vues qui passait par
  `/api/ikon/snapshot/...` a été entièrement réécrit en direct (voir plus
  bas). Argument confirmé sur le terrain : une vue créée dans Iconik après le
  dernier sync ("VUE | UNITAIRE | COLLECTION") était invisible via le
  snapshot, immédiatement visible en direct.
- Discussion sur `APS-AI-MASTER-RFC.md` (déposé par l'utilisateur) : avis
  donné section par section — le Browser Builder/Authentication Broker est la
  partie la plus solide, la tension "vérité dans APS" vs sources qui peuvent
  avoir tort (le cas `serie`/`series` du jour même) est le point faible à
  surveiller. Utilisateur non développeur, instinct architectural juste
  (façade/core, agnosticisme) sans maîtriser tout le vocabulaire — à garder en
  tête pour les prochaines sessions (mémoire déjà posée).

### Audit des façades — méthode et résultats
Méthode répétée pour chaque famille : sortir les occurrences réelles du JSON
VOD Factory, lire le handler dans `wfd-engine-handlers.js`, comparer au
schéma du Builder (`config-schema.js`), corriger. Détail complet dans
`builder-etat.md`. Points marquants :

- **aps_search** : `field` texte libre enrichi de suggestions réelles (159
  champs QA en direct), `op` restreint par le vrai type Iconik (`Dropdown`
  pas `Select`, vérifié en cassant une première hypothèse fausse).
- **update_meta** : `target`/`targetId` étaient confondus dans l'ancien
  schéma (target = objet visé, alors que le moteur lit `target` comme le
  TYPE et `targetId` comme l'objet). `op`/`method` du config réel n'ont aucun
  effet côté moteur — retirés du panneau plutôt que d'exposer un faux réglage.
- **workflow_history** : découverte qu'il ne s'agit pas d'un log interne mais
  d'un journal texte écrit dans un champ de métadonnée Iconik. Scindé en
  façade `iconik.history` après que l'utilisateur a repéré que le Core
  portait à tort du vocabulaire Iconik (`mdField`/`mdViewId`) — le test "cette
  étape touche-t-elle une API de plateforme précise ?" est devenu la règle de
  tranchage pour tout le reste de la session.
- **decision** : bug réel, pas cosmétique — `on` au lieu de `field`. Vocabulaire
  d'opérateurs complet (20, tirés du switch `evalCondition`) ; `between`
  retiré (absent du moteur, aurait toujours été faux silencieusement).
- **trigger** : façade enrichie aux 12 types du catalogue réel du designer
  WFD (`TRIGGER_EVENTS`). Un seul type prouvé câblé de bout en bout — Custom
  Action. Nuance importante trouvée en creusant une remarque de l'utilisateur
  (Custom Action et Webhook sont le même mécanisme côté Iconik, juste déclenchés
  différemment) : Iconik a un vrai système de webhooks
  (`/API/notifications/v1/webhooks/`), mais aucun n'est configuré vers la
  route APS aujourd'hui — catalogué quand même, avec la nuance documentée.
- **loop** : un seul mode sur 6 a un chemin d'exécution réel (`variable`) —
  le moteur lui-même dit en commentaire que les 5 autres ne sont "jamais
  câblés côté exécution". Catalogués avec un libellé "fails at runtime" pour
  ne pas laisser quelqu'un s'y brûler. `resultVar` retiré (hérité à tort d'une
  liste générique, jamais lu pour ce Core).
- **action** : le plus gros dispatcher du moteur, 41 actionType réels et
  câblés. Un seul détaillé (`export_location_trigger`, celui utilisé) — bug
  de nommage corrigé (`target` = l'Export Location, pas l'objet). Branché sur
  la vraie liste d'Export Locations Iconik.
- **wait_for / aws_s3.deliver** : les plus liés entre eux — `wait_for` sonde
  un job Iconik puis appelle en interne le handler `aws_s3`. Question clé de
  l'utilisateur qui a tranché la conception : ne pas recopier le mapping S3
  (identique mot pour mot sur les 6 occurrences réelles) comme champs bruts
  dans le panneau — c'est exactement ce que le Manifeste (ressource d'org,
  déjà consommé par `aws_s3.deliver` via `manifestId`) existe pour éviter. En
  reconciliant, découverte que `aws_s3.deliver` avait un schéma parallèle
  jamais vérifié (`bucketPath`/`payload`) qui court-circuitait le Core
  `deliver` — corrigé pour converger sur `manifestId` + le vrai nom de champ
  moteur (`objectKey`).

### Infrastructure de sourcing live (nouveau, réutilisable)
- `config-sources.js` interroge Iconik en direct via `iconik-proxy`
  (nouvel en-tête `X-Force-Live`, ajouté cette session — contourne le
  snapshot DB sans rien casser pour les autres appelants du proxy).
- Fonctions : `metadonnees`/`vuesMetadonnees`/`champsDeVue` (champs réels
  d'une vue précise — signal fiable, contrairement au lien vue↔type d'objet
  qui s'est avéré facultatif côté Iconik et a été abandonné après un vrai cas
  réel non catégorisé) / `exportLocations` / `customActions` (avec
  auto-remplissage du `context` du trigger, comme le fait déjà l'ancien
  designer WFD).
- Fraîcheur affichée dans le canvas : `dernierRafraichissement`/`onRafraichi`,
  bouton ↻ repensé (anime, déclenche lui-même les appels au lieu de dépendre
  d'un panneau déjà ouvert).
- `node-count`/`conn-count`/`snapshot` de la statusbar, jusqu'ici jamais
  câblés, le sont maintenant.

### Bug canvas
`WfConnect.brancher(...)` ne recevait pas `view` (contrairement à
`WfPaletteDrag`, juste à côté) — tracé de liaison faux dès que le zoom
n'était pas à 100 %. Repéré par l'utilisateur via une capture d'écran,
corrigé (une ligne).

## Reste ouvert
- Familles pas encore auditées : `checker`, `fetch`, `create_tree`,
  `id_generator`, `lookup`, `http_sequence`, `timer`.
- `action` : 40 des 41 actionType réels ne sont catalogués que par leur nom,
  sans schéma détaillé.
- Constructeur d'expression visuel pour les templates `{slug(x)}/{filebase(y)}`
  — mis de côté volontairement, à reprendre une fois la couverture des
  façades terminée ("on refera une passe pour voir ce qu'il manque d'utile").
- **Rien n'est commité** — tout est en modifications non indexées dans
  l'arbre de travail.
