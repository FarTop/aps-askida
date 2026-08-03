# Journal APS — 2026-08-03

> Session dense, en quatre temps : fin de l'audit des façades contre les
> données réelles (7 familles restantes depuis le 31 juillet), construction
> du Tree Builder (gabarits d'arborescence édités dans le Builder), écran
> Mappings (correspondances), et le Packager (dépliage de manifeste +
> garde-fou de cardinalité). État technique complet → `builder-etat.md`
> (sections dédiées, une par chantier). Prochaine session : garde-fou de
> statut de flux (brouillon/publié/production) puis test grandeur nature —
> reconstruire un workflow VOD Factory réel dans le Builder.

## Fil de la session

### Audit des façades restantes
Même méthode que le 31 juillet, sur les 7 familles qui manquaient :
`checker`, `fetch`, `create_tree`, `id_generator`/`aps.registry`, `lookup`,
`http_sequence`, `timer`. Deux bugs réels et silencieux trouvés, du même
genre que `decision`/`on→field` du 31 juillet :
- **`verify`/`checker`** n'avait tout simplement aucun schéma de panneau
  cohérent — un `verify` construit dans le Builder aurait produit un
  `checks: []`, donc un nœud qui dit toujours "tout va bien" sans jamais
  rien vérifier.
- **`timer`** : le champ de planification s'appelait `cron` dans le panneau,
  mais le planificateur (`wfd-engine-trigger.js`) ne lit que `cronExpr`. Un
  cron tapé dans le Builder aurait toujours été ignoré, remplacé
  silencieusement par le défaut en dur du moteur. Le bug le plus grave de
  cette passe — plausible (« ça marche », juste jamais à l'heure demandée).

`create_tree` a aussi reçu sa vraie ressource : `templateId` référence
maintenant `ArboTemplate` via une nouvelle nature de panneau (`gabarit`),
posant la question de où éditer ces gabarits — ce qui a mené à la
discussion suivante.

### Tree Builder
Constat de l'utilisateur : les gabarits se créaient dans le Designer de
`platforms/iconik/viewer/` — plus en adéquation avec le Builder, obligeant
un aller-retour entre deux apps. Décision : 3ème onglet "Tree Builder" sur
l'accueil du Builder, éditeur dédié (`arbo-canvas.html`). Choix de design :
pas un canevas à positions/arêtes libres comme le workflow (un gabarit est
un ARBRE strict) — une liste imbriquée où l'indentation EST la hiérarchie.

En cours de route, discussion sur la numérotation (Saison/Episode) :
l'ancien mécanisme (`orderFieldName` au niveau du nœud Create Tree) ne
numérote que la racine de ce qu'un appel crée — incapable de gérer un
gabarit combinant plusieurs niveaux numérotés dans le même arbre. Nouveau
mécanisme par niveau (`numberField`/`numberPad`, badge "Numérote ce
niveau"), avec une vraie amélioration demandée par l'utilisateur : au lieu
d'un compteur atomique qui ne fait qu'avancer (rejouant le bug historique où
« Saison 02 » supprimée faisait quand même naître « Saison 03 »), le numéro
suivant est recalculé à chaque création en interrogeant la fratrie réelle
dans Iconik.

### Correspondances (Mappings)
Écran dédié (`admin/mappings/`), même parcours que Manifestes. Deux
découvertes en testant, pas en théorie :
- `/api/mappings` existait déjà dans `wfd-data.js` — raté pendant l'audit du
  matin, doublonné puis nettoyé (la nouvelle route a un scoping d'org plus
  correct).
- Un **bug CSS mémorable** : le tout premier commentaire du fichier
  contenait littéralement `mf-*/adm-*`, où `*/` ferme un commentaire CSS
  prématurément — corrompant le bloc `:root` juste après et rendant tout le
  fond de page blanc au lieu de sombre. Deux heures de diagnostic (mode
  sombre OS, Brave Shields, 3 navigateurs, navigation privée, CDN, cache
  avec URL jamais vue) avant de compter les `/*`/`*/` du fichier (6 contre
  7) et de trouver la vraie cause. Le réflexe à garder : ne jamais écrire
  `*/` à l'intérieur d'un commentaire CSS, même pour lister des préfixes de
  classes.

UX ajoutée après un premier test réel par l'utilisateur : recliquer un
élément déjà ouvert le referme, et la liste reste `position: sticky`
pendant le défilement d'un éditeur long — même correction faite sur
Manifestes par cohérence.

### Packager
Audit `wait_for`/`aws_s3` contre les données réelles (6 occurrences
chacun) : découverte que `aws_s3.deliver` ne "livre" rien — les 6
occurrences réelles utilisent `operation: "list_objects"`, une
**vérification** de ce que l'Export Location Iconik a déjà déposé, pas un
envoi. Le nom de façade est trompeur, gardé par cohérence avec le nom de
famille WFD. Schéma réécrit en conséquence ; vestiges morts de l'ancienne
opération `artwork_s3` (jobId, artworks, mdViewId, titreVar, nommageId)
nettoyés.

L'idée du 31 juillet (`manifestId` remplaçant le mapping S3 dupliqué)
n'était pas fausse, juste jamais câblée : `s3Mappings[].{type,filter,
variable}` a exactement la forme d'une essence de Manifeste. Résolution
`manifestId → s3Mappings` ajoutée dans `pivot-to-wfd.js`, même mécanisme
que `mappingId → lkRows` construit plus tôt dans la journée.

Puis le vrai garde-fou : la cardinalité d'une essence ("au moins 1",
"exactement 1"...) n'était vérifiée nulle part — `list_objects` exposait
juste les URLs trouvées. Ajouté dans `aws_s3()` (moteur), testé sur 6 cas
(satisfait, non satisfait, excès, dépassement, optionnel, rétrocompatibilité
sans cardinalité) plus le manifeste réel déjà en base.

### Tour d'horizon demandé par l'utilisateur
Après le Packager, l'utilisateur a demandé un état des lieux complet avant
d'attaquer la construction d'un workflow de zéro. Réponse organisée sur les
7 étapes de l'Ordre de construction (`builder-etat.md`) : tout est fait sauf
le **sélecteur de variables** (étape 4, jamais construit). Ça a mené
l'utilisateur à poser une question qui a révélé un manque plus sérieux :
le statut d'un flux (actif/inactif) et l'impossibilité de modifier un
workflow actif sans affecter la production.

Vérifié, pas supposé : `BuilderFlow` (Prisma) n'a **aucun champ** de statut
ou de version. Le bouton "désactiver" du canevas est une **maquette** —
un commentaire du code le dit explicitement ("le câblage des données
viendra ensuite", jamais fait). Seul le vieux modèle WFD `Flow` a un
`isActive` réel, mais sans séparation brouillon/publié — éditer un flux actif
modifie la production immédiatement, exactement le problème que la section
"Versionnement" de `builder-etat.md` (31 juillet) avait posé sur papier sans
jamais le construire.

## Reste ouvert, par priorité pour la suite

1. **Garde-fou de statut de flux** (brouillon/publié/production) — posé sur
   papier le 31 juillet, jamais construit. Prochaine session.
2. **Test grandeur nature** — reconstruire un vrai workflow VOD Factory
   (PUBLISH ou un sous-ensemble) dans le Builder, avec tout ce qui a été
   audité/construit cette session. C'est le test annoncé dans l'Ordre de
   construction ("dix étapes qui se lisent comme une phrase").
3. Sélecteur de variables (étape 4, jamais construit).
4. `draft` de nœud vs `status: draft` de flux — collision de vocabulaire.
5. Mark in/out des segments (`time_start`/`time_end`) — jamais vérifié.
6. Famille média (Transcode...) — non conçue.
7. `Nommage` — route existante, jamais auditée ni éditée.
8. `wfd-node-fetch.js` — fichier mort repéré, jamais supprimé.

**Rien n'est commité** — modifications non indexées dans l'arbre de travail
(voir `git status`) ; aucune branche créée.

---

## Reprise de session — garde-fou de statut de flux

Nouvelle session, même journée. Deux chantiers annoncés : le garde-fou de
statut (brouillon/publié) et la reconstruction de VOD Factory from scratch.
Fait aujourd'hui : le premier seulement.

### Correction d'une note obsolète
Avant de commencer, vérification de l'affirmation de `builder-etat.md`
("collision de vocabulaire `draft` à régler avant que le champ n'entre dans
le pivot") — **déjà fausse au moment où elle a été écrite** : `git log` sur
`pivot-schema.js` montre que `CLES_SUPPRIMEES.draft` (bannit `draft` au
niveau étape, scope `'etape'` seulement) et `STATUTS = ['draft','published']`
au niveau workflow datent du 24 juillet, une semaine avant la note du 3 août.
Pas de code à écrire : la séparation existait déjà, juste jamais recopiée
dans l'état. Note corrigée ci-dessous.

### Cadrage avec l'utilisateur — ce que "production" veut dire ici
En creusant le pont d'exécution avant de coder, découverte : **rien ne relie
aujourd'hui un `BuilderFlow` à une exécution réelle** — `pivot-to-wfd.js`
existe et est testé, mais rien ne l'appelle côté serveur, aucune route ne
crée/active un `Flow` WFD depuis un `BuilderFlow`. Question posée à
l'utilisateur : le garde-fou doit-il aller jusqu'à ce pont, ou rester sur le
document (brouillon/publié) ?

Précision importante de l'utilisateur, à retenir : **WFD est un prototype
voué à disparaître à terme**, gardé uniquement comme base de comparaison
fonctionnelle — pas une dépendance à construire dans le Builder. Bâtir le
garde-fou autour d'une conversion vers WFD recréerait exactement la
dépendance à éviter. Décision : le garde-fou de cette session porte
uniquement sur le document ; le moteur propre du Builder est un chantier
séparé, non chiffré, pour plus tard. (Mémoire projet mise à jour en
conséquence — `project-wfd-vos-builder.md`.)

### Modèle : `BuilderFlowVersion`
Nouvelle table, append-only : `{id, flowId, version, document, createdAt}`,
unique sur `(flowId, version)`. **Rien n'est stocké de déductible** (même
critère que le pivot lui-même) : pas de `status`/`publishedVersion` sur
`BuilderFlow` — les deux se calculent depuis la dernière ligne de
`BuilderFlowVersion` pour ce flow. `presentation` est exclue du document figé
(builder-etat.md : "la présentation n'est pas versionnée") — comparer un
brouillon à sa dernière version publiée ignore donc les déplacements de
nœuds, qui ne doivent jamais faire croire à une divergence.

**Incident évité en appliquant la migration** : `prisma migrate dev` a
demandé un reset complet de la base (drift déjà présent avant toute
intervention). Refusé. `prisma db push` a ensuite refusé pour une bonne
raison distincte : il voulait supprimer la table `ApsCounter` (4 lignes
réelles — les compteurs Saison/Épisode), **absente du schéma Prisma par
choix délibéré** (commentaire explicite dans `wfd-engine-handlers.js` :
créée par SQL brut pour "éviter une migration Prisma"). Contournement :
`BuilderFlowVersion` créée par SQL brut ciblé (`prisma db execute`), sans
toucher au reste — `prisma generate` ensuite, sans jamais passer par `db
push`. Aucune donnée perdue, `ApsCounter` intact. À garder en tête pour
toute future migration sur ce dépôt : `db push` seul n'est plus fiable tant
que ce drift existe.

### Routes serveur (`server/routes/wfd-data.js`)
- `GET /builder-flows/:id` — enrichi : renvoie maintenant `status`
  (`'draft'`/`'published'`, déduit), `publishedVersion`, `publishedAt`.
- `GET /builder-flows/:id/versions` — historique (métadonnées seules, pas le
  document complet).
- `POST /builder-flows/:id/publish` — fige le brouillon courant (moins
  `presentation`) en nouvelle version. N'écrase jamais une version
  existante, ne touche jamais `document` (le brouillon reste librement
  éditable après publication).

Testé en direct contre le vrai workflow déjà en base (`BAYARD | PUBLISH |
VODFACTORY`) : publish → statut passe à `published` (v1) ; édition du
brouillon → statut repasse à `draft`, `publishedVersion` reste 1, la version
figée ne bouge pas ; document restauré à l'identique après le test (`intent`
vide, comme avant).

### Décision d'interaction : pas de verrou d'édition
Question posée : une fois publié, faut-il verrouiller le canevas (mock déjà
ébauché : "Active flow — deactivate to edit") ? Réponse de l'utilisateur :
**édition toujours libre**. Le raisonnement retenu : la copie figée protège
déjà tout, un verrou n'ajouterait rien. Le mock (`data-active`, `.bd-lock`,
bouton "deactivate") est **retiré** — HTML, CSS et JS — plutôt que laissé
mort : un demi-mécanisme jamais branché est pire qu'une absence.

### Câblage canevas (`workflow-canvas.html`/`.js`/`.css`)
Badge `data-role="statut"` (déjà stylé draft/published depuis une session
antérieure, jamais lu) branché sur le vrai statut, rafraîchi au chargement,
après chaque save (manuel + auto-save) et après publish. Nouveau bouton
"📌 Publier" à côté de "💾 Save". `data-demo="1"` retiré du bandeau d'état :
tout y est maintenant réellement câblé.

**Non vérifié visuellement** : l'outil Chrome n'était pas connecté dans cet
environnement (comme le 3 août pour Tree Builder) — vérifié par lecture de
code + tests d'API directs (curl) uniquement. Page servie (200). À tester à
la main dans un navigateur.

**Reste ouvert** : pas de UI pour l'historique des versions (route
`/versions` existe, aucun écran ne l'affiche) ni pour un retour arrière
(rollback = republier une ancienne version — pas construit, pas demandé
cette session). Chantier VOD Factory from scratch reporté à une prochaine
session.

---

## Test grandeur nature — VOD Factory PUBLISH, nœud par nœud

Suite directe. Décision de l'utilisateur : reconstruire PUBLISH **from
scratch depuis la palette**, pas en repartant du flow réel déjà en base
(patchwork d'audit, jamais passé par la palette) — le but explicite n'est
pas que "juste tester si VOD Factory se représente", mais éprouver la
**manière** dont le Builder se construit, pas seulement le résultat.

Chrome non connecté dans cet environnement, et l'utilisateur a déjà vérifié
qu'il ne peut pas l'installer (avertissement macOS) — mode "toi à la
manette" pour toute la suite : l'utilisateur construit dans son navigateur,
je guide/corrige en lisant le code.

### Premier incident réel — le garde-fou à l'épreuve
En reprenant, le brouillon du flow réel (`BAYARD | PUBLISH | VODFACTORY`)
était vide (0 étape) alors qu'il en avait 12 quelques minutes plus tôt —
l'utilisateur avait testé le bouton Publier plusieurs fois en explorant.
Restauré depuis `BuilderFlowVersion` (version 3, la plus récente, réelle et
intacte) — **rien n'a été perdu**, exactement le rôle du garde-fou construit
plus tôt. Cause du vidage non investiguée (pas bloquant, l'essentiel —
récupération sans perte — a fonctionné).

### Erreur de conception corrigée en cours de route
Première proposition de nœuds à poser : reproduisait la logique par branche
du vieux WFD (Decision "Collection Type ?" → 4 fois le même motif
vérification-artwork). L'utilisateur a immédiatement corrigé : **c'est
exactement ce que le Manifeste + Packager ont été construits pour
éliminer** — un seul nœud `Deliver` avec `manifestId` couvre tous les
niveaux via les conditions `appliesTo` de chaque essence. Liste corrigée à
10 étapes (Trigger → Search → Bayard ID? → Générateur d'ID → Set Metadata →
Deliver → Lookup → HTTP Sequence → Verify → Set Metadata + History).

### Nœuds posés et vérifiés contre le vrai flow de production
- **Trigger** : confirmé par l'utilisateur — Custom Action liée à une
  **Collection uniquement**, jamais un asset (résout une ambiguïté ouverte
  depuis `methode-vodfactory-2026-07-07.md` §4). Mémoire projet créée
  (`project-vodfactory-publish-trigger-scope.md`).
- **History** (juste après Trigger, "en cours") : `Target Type`/`On Object`
  clarifiés (le premier choisit l'endpoint collections/ vs assets/, le
  second fournit juste l'id — pas redondants). Confirmé : `{collection.id}`
  est correct ET c'est le vrai fallback du moteur si le champ est laissé
  vide — recommandé de le taper explicitement quand même (même classe de
  bug que le `cronExpr` du 3 août : un défaut cliché doit être visible dans
  le panneau, pas dans le moteur).
- **Search** : **bug réel trouvé et corrigé** — `blocks[].id` n'existait nulle
  part dans le schéma du panneau (`itemDefaut` ne posait que
  `{objectType, parentBlock, criteria}`), alors que le moteur (`aps_search()`)
  indexe ses résultats PAR `block.id` pour résoudre `returnBlock`. Toute
  recherche construite dans le Builder revenait donc vide en silence, même
  un bloc unique avec `returnBlock` par défaut. Corrigé : `itemDefaut` de la
  nature `liste` accepte maintenant une fonction `(idx) => objet` (pas
  seulement un objet statique), et `blocks[].id` s'auto-assigne à la position
  (1, 2…), même convention que les vraies données. Configuré : bloc unique,
  Type=Collection, critère `id equals {collection.id}`.
- **Decision** : champ réel identifié en vérifiant le nœud `Collection Type ?`
  du vrai export — c'est `{TypeCollection}`, PAS `{ContenuPrime}` comme
  affirmé par erreur d'abord (`ContenuPrime` ne sert que plus tard, dans le
  Lookup, pour traduire vers le vocabulaire de l'API partenaire). 4
  conditions (Série/Saison/Episode/Unitaire), `onError: continue_log` —
  copiées du nœud réel.

### Sélecteur de variables — construit en direct, à la demande de l'utilisateur
En configurant Decision, l'utilisateur a noté que taper `{TypeCollection}`
de mémoire "casse la linéarité du narratif" et redécouvert, par la friction
réelle, exactement le gap "sélecteur de variables" (étape 4, jamais
construit). Demande explicite : construire maintenant, pas comme un patch —
"le but n'est pas de tester que le résultat VOD Factory mais aussi la
manière". Construit (détail dans `builder-etat.md`, section "Modèle de
données") : sélecteur inline sur tout champ `variable` + panneau dédié
(onglet "Variables"), catalogue étendu (Lookup, aps.registry).

Deux retours en testant, corrigés dans la foulée :
1. **Flot de métadonnées peu lisible** — Search proposait des dizaines de
   champs "si présent" en vrac, aussi peu lisible que l'ancien panneau WFD
   (capture d'écran fournie par l'utilisateur pour comparaison). Repliés par
   défaut derrière un "show N possible fields", sauf en recherche active.
2. **Faux doublon** — Trigger proposait `collection_id` ET `collection.id`
   pour la même valeur (le moteur pose bien les deux, vérifié, mais c'est un
   synonyme inutile). Une seule forme montrée désormais (`collection.id`).

**Non vérifié par moi** : tout le rendu visuel de cette session (badge,
Publier, sélecteur, panneau Variables) a été testé par l'utilisateur
directement dans son navigateur — je n'ai pas d'outil Chrome fonctionnel
dans cet environnement. Vérifié de mon côté : syntaxe (`node --check`) et
pages servies (200) uniquement.

**Rien n'est commité avant cette session** — commité à la fin de celle-ci
(voir git log).
