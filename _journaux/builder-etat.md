# Workflow Builder — état des décisions

> **À soumettre en début de session, avec `methode-travail-aps.md`.**
>
> Ce document donne l'**état** : ce qui est tranché, ce qui reste ouvert.
> Les journaux `_journaux/` donnent le **récit** : pourquoi, et ce qui a été
> écarté. Lire ce document suffit pour travailler ; lire le journal sert quand
> on veut comprendre une décision ou la remettre en cause.
>
> Dernière mise à jour : 4 août 2026, fin de session (reconstruction PUBLISH
> nœud par nœud poussée jusqu'à l'étape 12 — HTTP Sequence — avec deux
> questions de conception encore en suspens. Cf. section "Reprise PUBLISH —
> tableau, bugs, HTTP Sequence" tout en bas pour le détail et le point de
> reprise exact).
>
> Plus tôt le 4 août : éditeur de corps de boucle construit — `wf-scope.js` —
> en creusant un trou trouvé en continuant PUBLISH après Deliver : Iconik ne
> sait déclencher un Export Location que par asset individuel, jamais en bloc
> sur une collection, donc le vrai motif est Search → **Boucle** → Action →
> Attendre. Deux bugs réels trouvés au passage : `pivot-validate.js` validait
> un vieux vocabulaire de boucle (`params.over`/`as`) que ni le panneau ni le
> moteur n'ont jamais utilisé — toute boucle réelle échouait la validation
> complète, invisible jusqu'ici faute de boucle jamais menée jusqu'au bout ;
> et `wf-persistence.js` n'avait jamais de `module.exports`, jamais testable
> hors navigateur.
>
> **Vérifié pour de vrai dans un navigateur avant la fin de la session** —
> `chrome-devtools` (MCP) installé et pointé sur Brave (pas de Chrome sur
> cette machine, l'extension `claude-in-chrome` reste bloquée par une
> restriction macOS). Un troisième bug réel trouvé en regardant l'écran, pas
> en lisant le code : le fil d'Ariane restait visible à la racine — une
> règle CSS auteur (`display: flex`) bat toujours la règle `[hidden]` de
> l'agent utilisateur, quelle que soit la spécificité. Corrigé. Le reste
> (glisser un Loop, entrer/sortir, glisser un nœud dans le corps, badge "N
> steps", bouton "Edit body →", sauvegarde + rechargement complet avec
> positions restaurées, panneau Variables avec `{item}`) fonctionne comme
> prévu. Cf. section "Éditeur de corps de boucle" plus bas pour le détail.
>
> Plus tôt le 4 août : Manifeste étendu aux 4 niveaux (`appliesTo` par
> essence), contenu réel saisi dans "PRIME", et un bug S3 réel corrigé au
> passage — `list_objects` remontait récursivement les fichiers des niveaux
> enfants, faute de `delimiter`. Cf. section "Manifeste — étendu aux 4
> niveaux" plus bas pour le détail.
>
> Historique : 3 août 2026, fin de journée (construction PUBLISH nœud par
> nœud très avancée — Trigger jusqu'à Deliver posés ; nouvelle façade
> Ancestor Resolver construite et vérifiée contre les vraies données ;
> blocage identifié sur le Manifeste. Cf. `journal-aps-2026-08-03.md`,
> section "Test grandeur nature" pour le récit complet).

---

## Point de départ pour la prochaine session

1. **Configurer l'étape 12 (HTTP Sequence "Publication API")** dans le
   Builder — mécanique déjà clarifiée en fin de session (Simple = "Single
   request", Foreach = "One request per value", `{external_id}` vient du
   Lookup — étape 11 — pas d'une étape de cette séquence). Les 7 étapes
   réelles (5 Persons + Contents + Video) sont documentées avec leurs
   valeurs exactes dans la section "Reprise PUBLISH" tout en bas.
2. **Deux questions de conception encore ouvertes**, posées mais pas
   tranchées avec l'utilisateur (cf. même section pour le détail) :
   - Étape 7 (Search des assets à exporter) : un seul Search sans filtre
     `media_type`, ou deux Search séparés (images/vidéo) comme le faisait
     l'ancien WFD ?
   - Étapes 13/14 (Verify, History) : la production les duplique **4 fois**
     (une par niveau Série/Saison/Episode/Unitaire, champs et messages
     différents à chaque fois) — même motif que le Manifeste avant sa
     refonte. Accepter la duplication pour l'instant, ou piloter Verify/
     History depuis le Manifeste (essences + `appliesTo`) comme Deliver ?
3. **Vérifier à la main dans un navigateur le reste déjà en attente** —
   l'éditeur de corps de boucle est vérifié (4 août, outil `chrome-devtools`
   en MCP, pointé sur Brave), mais le badge statut/Publier, le panneau
   Variables du 3 août, les correctifs pastille de connexion et les chips
   `appliesTo` du Manifeste restent testés uniquement via retours directs de
   l'utilisateur ou API directe (curl), jamais par un navigateur dans cet
   environnement.
4. **Élargir le catalogue de variables au fil de la construction** — chaque
   façade posée pour de vrai doit recevoir sa déclaration `variables()`
   vérifiée contre le handler, comme Trigger/Search/History/Lookup/
   aps.registry/Ancestor Resolver aujourd'hui. Les façades non encore
   déclarées renvoient `[]` — absence de preuve, pas invention.
5. Historique des versions publiées : la route existe (`GET
   /builder-flows/:id/versions`), aucun écran ne l'affiche ; pas de rollback
   construit.

---

## Les trois critères qui tranchent

Quand une décision hésite, ces trois-là ont servi à décider. Ils valent mieux
qu'une règle particulière.

1. **On ne fusionne que ce qui raconte la même chose.** Le partage de code
   n'est pas une raison — il se règle dans l'implémentation, pas dans le
   catalogue.
2. **Si c'est déductible, ce n'est pas stocké.** Ce qu'on écrit dans le format
   finit par diverger de ce qu'il décrit.
3. **Un nœud qui ne peut pas résumer ce qu'il fait en quelques lignes cache
   quelque chose.** Soit la ressource externe est trop riche, soit le nœud fait
   trop.

Un quatrième, hérité de WFD et payé cher : **une question qui porte sur la
mécanique de l'outil est un défaut de l'outil.** Une question qui porte sur
Iconik ou sur le partenaire n'en est pas un.

---

## Catalogue — figé le 23 juillet

Noms en anglais : ce sont les termes du métier, y compris chez les
non-anglophones, et un ingénieur Switch, Vantage ou Node-RED les reconnaît.
L'interface d'APS reste multilingue ; le catalogue non.

### Core en service — 12

```
Trigger · Decision · Loop · Verify · Wait · Set Variable
Transform · Lookup · HTTP Request · HTTP Sequence · History · Deliver
```

### Déclarés, hors première coupe — 5

`QC` · `Script` · `Delay` · `Approval` · `Call Workflow`

Ils n'entrent que lorsqu'un besoin se présente. **Règle : un nœud entre au
catalogue quand il sert.** WFD avait six nœuds déclarés et vides — ils
occupaient la palette et promettaient ce que les générateurs ne tenaient pas.

### Façades — 8 (mis à jour 31 juillet, cf. audit ci-dessous)

`Search` · `Fetch` · `Set Metadata` · `Action` · `Create Tree` · `S3` · `Trigger` · `History`

`Trigger` et `History` manquaient de ce décompte alors que le catalogue les
portait déjà (`Trigger`) ou venait de les recevoir (`History`, scindée d'un
Core qui portait à tort du vocabulaire Iconik — voir audit).

### Services — 2

Registre d'identifiants externes (`BayardRegistry`, table Prisma réelle —
réutilise l'ID existant d'un objet plutôt que d'en régénérer un, garantit
l'unicité des nouveaux) · compteur d'ordre. Les seuls mécanismes qui
exigent un état partagé et atomique ; aucun moteur ne sait les porter.

**Corrigé le 3 août** : la façade dédiée du registre (`aps.registry` /
Générateur d'ID) était masquée de la palette du canevas depuis le 28
juillet ("les services ne sont pas des nœuds à poser"). Ça contredisait la
phrase juste en dessous — *"soit par une façade dédiée"* — et surtout le
vrai flow de production, où Générateur d'ID est un nœud autonome et visible
avec son propre déclencheur (`Bayard ID ?` → branche "ID Vide"), pas un
mécanisme invoqué en silence. Démasqué ; `isService` reste utile ailleurs
(déduction des services requis par un workflow), mais ne conditionne plus
la visibilité dans la palette.

### Ressources — 3

Manifeste de livraison · modèle d'arborescence · table de correspondance.
Nommées, réutilisables, éditées dans leur propre écran.

La table était jusqu'ici enfermée dans la configuration du nœud `Lookup`
(`lkRows`), donc recopiée à chaque usage. Elle remplit pourtant les trois
critères, et l'argument décisif est qu'elle sert **deux étapes** : `Lookup` la
lit pour traduire, `HTTP Sequence` s'appuie sur ce qu'elle produit pour publier
les personnes.

---

## Format pivot

### Trois niveaux, jamais deux

```
core     http_request          universel, compilable partout
facade   iconik.action         vocabulaire plateforme, sait se déplier
preset   collection_create     pré-sélection de champs
```

`create_col`, `acl`, `link_file`, `relate` ne sont **jamais** des types de
premier rang — ce sont des `preset` d'`iconik.action`.

Un Core pur n'a ni `facade` ni `preset`. **L'absence est significative** :
c'est ce qui le distingue d'un nœud de plateforme.

### « Façade » veut dire paquet de plateforme, pas « Iconik »

APS est une plateforme parmi d'autres. L'appel à un service s'écrit donc :

```
core: http_request · facade: aps.registry · preset: ensure_external_id
```

Il n'y a pas de quatrième genre à inventer. Un service est une **capacité
offerte par le paquet APS**, invoquée soit par une façade en interne — comme
`Create Tree` qui appelle le registre et le compteur — soit par une façade
dédiée.

### Ce que le pivot stocke

| | |
|---|---|
| Workflow | identité, intention, plateforme, environnement, **version** |
| Étapes | identifiant propre, `core`, `facade`, `preset`, paramètres, intention |
| Structure | enchaînement, et **le corps de boucle imbriqué** |
| Gestion d'erreur | réglage du workflow |
| Présentation | positions, sauts de page — **section séparée** |

### Ce qu'il ne stocke pas

**La portabilité** — chaque générateur déclare ce qu'il sait porter, le Builder
en déduit. La stocker garantirait qu'elle dérive.

**Le caractère destructif** — déclaré par la façade.

**Les services requis** — déduits des étapes qui les invoquent (`facade:
aps.registry`) et des façades qui les appellent en interne, comme `Create Tree`.
Les lister au niveau du workflow garantirait qu'ils divergent le jour où une
façade cesse d'appeler le compteur.

**Les ports** — déduits de la déclaration du `core` et de la configuration.
`Decision` a autant de sorties que de conditions plus une ; `Verify` en a trois
quoi qu'il arrive. Cela règle au passage le bug d'index positionnel de WFD.

### Format canonique et format d'échange

Conséquence du point précédent : **le pivot n'est pas autoportant.** Il faut le
catalogue pour l'interpréter.

Deux artefacts, comme un source et un binaire :

| | |
|---|---|
| **Format canonique** | ce qu'on stocke et versionne — sans ports, sans propriétés déduites |
| **Format d'échange** | ce qu'on livre à un tiers — projection résolue, ports inclus |

Livrer le catalogue avec le format serait fragile : il évolue. Livrer une
projection résolue est stable, daté, et se lit sans rien d'autre. C'est ce qui
part chez Embrace pour Pulse It.

### Identifiants

Propres au pivot, dérivés du nom métier (`boucler_sur`, `export_location`).
**Jamais hérités du producteur** : les identifiants WFD partagent un long
préfixe commun, ce qui a provoqué des collisions massives à la génération BPMN.

---

## Versionnement — construit le 3 août

`BuilderFlow.document` reste le brouillon : écrasé à chaque enregistrement,
librement éditable en permanence. `BuilderFlowVersion` (nouvelle table,
append-only) porte les instantanés figés :

| | |
|---|---|
| **Brouillon** | `BuilderFlow.document`, écrasé à chaque enregistrement |
| **Publier** | `POST /builder-flows/:id/publish`, geste explicite, crée une ligne `BuilderFlowVersion` |
| **Statut** | `'draft'`/`'published'` — **déduit**, jamais stocké : le brouillon actuel est-il identique à la dernière version figée (hors présentation) ? |

**Pas de verrou d'édition** — décision prise le 3 août : la copie figée
protège déjà tout, un cadenas d'édition n'ajouterait rien. Le mock qui
existait dans le canevas (`data-active`, "Active flow — deactivate to
edit") a été retiré plutôt que branché.

**La présentation n'est pas versionnée**, comme prévu : exclue du document
figé au moment de publier, et exclue de la comparaison qui déduit le statut
— déplacer un nœud ne fait jamais croire à une divergence.

**Pas de pont vers une exécution réelle.** Publier fige un document ; rien
ne le convertit ni ne l'active dans un moteur. Voir la clarification WFD
ci-dessous — c'est délibéré, pas un oubli.

**Reste à construire, pas fait le 3 août** : écran d'historique des versions
(la route `GET /builder-flows/:id/versions` existe, aucun affichage), et
rollback (republier une version antérieure — pas demandé, pas construit).

**Collision de vocabulaire `draft`/`draft` — déjà résolue, pas le 3 août** :
vérifié par `git log`, la séparation existe depuis le 24 juillet
(`pivot-schema.js`) : `draft` au niveau étape est une clé bannie du pivot
(`CLES_SUPPRIMEES`, scope `'etape'` — c'est le sens WFD "à configurer",
jamais transporté dans le pivot), `status: draft|published` au niveau
workflow est un mot différent, sans collision réelle une fois les deux
scopes distingués par `pivot-validate.js`. Une note précédente de ce document
affirmait à tort que c'était encore à régler.

**Pont Builder ↔ exécution — clarifié le 3 août, pas construit** :
`pivot-to-wfd.js` existe et est testé, mais rien ne l'appelle côté serveur —
aucun `BuilderFlow` ne produit aujourd'hui un `Flow` WFD exécutable.
Précision de l'utilisateur : **WFD est un prototype voué à disparaître à
terme**, gardé comme base de comparaison fonctionnelle, pas une dépendance à
construire dans le Builder. Le moteur propre du Builder est un chantier
séparé, non chiffré — ne pas le confondre avec le garde-fou de statut, qui
ne porte que sur le document.

---

## Gestion d'erreur

**Plus de politique par nœud.** L'usage avait déjà tranché : `continue_log`
choisi 263 fois contre 66 pour `stop`. Un seul comportement — consigner,
continuer, notifier en fin. Cela supprime 360 réglages.

La **première erreur est la cause**, les suivantes en sont les conséquences.

La **notification décide du canal**, Iconik compris : statut `Echoué`,
historique, Slack, Teams sont des sorties d'un même endroit.

C'est un **réglage de workflow, mais affiché sur le canevas** comme une étape
terminale. Un réglage caché serait repris d'une main ce que le critère 3 donne.

| Sémantique | Portabilité |
|---|---|
| Transférer au gestionnaire | Node-RED, n8n, Step Functions, BPMN |
| Traversée inerte puis notifier | **APS uniquement** |

Les deux sont conservées, et la portabilité s'affiche **au moment du choix**.

**Règle des générateurs** : dégrader et le dire, omettre et le dire, ou
refuser. **Jamais omettre en silence.**

---

## Manifeste de livraison

Une **ressource**, pas un nœud. `Deliver` la désigne, comme `Create Tree`
désigne un modèle d'arborescence.

**Correction du 3 août, en vérifiant `pivot-manifest.js` avant de remplir un
vrai manifeste** : "un seul manifeste couvre tous les niveaux" décrit
l'intention posée le 23 juillet, **jamais construite ainsi**. La structure
réelle a un `niveau` UNIQUE par manifeste (`serie|saison|episode|unitaire|*`),
`valider()` ne connaît aucun champ `appliesTo` par essence. Décidé : construire
la vraie extension (ci-dessous, "Point de départ pour la prochaine session"),
pas contourner avec 4 manifestes séparés. Le paragraphe qui suit reste la
CIBLE, pas l'état actuel :

**Un seul manifeste couvre tous les niveaux** *(cible, pas encore construite)*.
Chaque composant porte deux jeux de critères, dans le même langage :

```
season_box_art
  s'applique si   TypeCollection  est  Saison
  trouvé par      dans la collection · titre contient _season
```

Le premier dit **quand** le composant compte, le second **où** le trouver.

**Deux sources possibles**, et `appliesTo` conditionne les autorisées :

| Le manifeste porte sur | Sources |
|---|---|
| une collection | recherche seulement |
| un asset | recherche **ou** fichiers de l'objet |

Une collection Iconik ne peut pas porter de fichiers — la contrainte se grise
toute seule à la saisie.

**Cardinalité** — exactement un · au moins un · plusieurs. Seul concept
vraiment nouveau ; détecte deux `cover_art` concurrents. Le même champ sert de
garde aux opérations destructives.

**Le chemin de destination est la chaîne des ancêtres**, chaque niveau
contribuant un segment formaté selon son type :

```
Série      {Univers}_{BayardID}
Saison     {title}_{BayardID}
Épisode    {title}
Unitaire   {title}
```

Quatre lignes au lieu de quatre chemins écrits à la main.

### Contenu réel vérifié le 3 août — en listant le vrai bucket S3

Pas deviné : le vrai bucket (`iconik-askida-stockage-hr`, connexion "S3 VOD
FACTORY") a été listé directement pour la chaîne réelle Série "Star Trek"
(BayardID 44931263) → Saison 01 (93431001) → Episode 01 (67939181), en
appelant `aws_s3()` du moteur directement (pas une simulation).

```
Série    AmazonPrime/Star_Trek_44931263/
           startrek_cover.png · startrek_hero.png · startrek_poster.png
           startrek_title.png (optionnel, seul absent nulle part ailleurs)

Saison   .../Saison_01_93431001/
           startrek_s01_cover.png · _hero.png · _poster.png · _season.png

Episode  .../Episode_01/
           Next_Generation.mp4 · Next_Generation.srt
           startrek_s01e01_episodic.jpg
```

Convention de nommage confirmée : le rôle apparaît en minuscule, n'importe où
dans le nom de fichier (`reconnu_par` en sous-chaîne suffit — pas besoin d'un
préfixe/suffixe strict). `box_art` (requis pour Unitaire d'après la doc
partenaire) n'a **pas** d'exemple réel dans ce bucket — cette chaîne est une
Série, pas un Unitaire/Program. À vérifier sur un vrai Unitaire si l'occasion
se présente.

Chemin `ancestorPath` calculé par le nouvel Ancestor Resolver (section
suivante) et chemin S3 réel : **identiques**, confirmé en listant.

---

## Ancestor Resolver — nouvelle façade, construite et vérifiée le 3 août

`iconik.resolve_ancestors` (handler `resolve_ancestors`, ajouté en fin de
`wfd-engine-handlers.js`). Remplace les 3-4 `Fetch` répétés par branche du
vieux WFD (`Fetch Série` / `Fetch Saison` / `Fetch Saison Titre`) — la
refonte du 23 juillet l'avait déjà décidé ("3 Fetch → 1 — les ancêtres se
résolvent seuls") sans jamais le construire.

**Mécanisme** : lit `TypeCollection`/`Univers`/`BayardID`/`title`/`ParentID`
déjà posés à plat par le Search précédent. Décide combien de niveaux
remonter selon le type (Série/Unitaire = 0, Saison = 1, Episode = 2), puis
remonte via une **recherche par BayardID** (`metadata.BayardID:"{ParentID}"`)
— un identifiant métier explicite, pas la relation structurelle `parent_id`
d'Iconik (moins fiable, dépend du rangement réel des collections). Assemble
le chemin selon la table ci-dessus, l'expose dans `{varName}` (défaut
`ancestorPath`).

**Portable** — vérifié explicitement : aucun appel à l'état interne d'APS,
seulement à l'API Iconik. N'importe quel autre moteur d'orchestration
reproduit le même algorithme. Contraste direct avec `aps.registry` en mode
Numeric (dépend de `BayardRegistry`, base d'APS) — le même test ("est-ce que
ça dépend d'un état interne à APS ?") a servi aux deux décisions.

**Bug réel trouvé en testant contre les vraies données, corrigé avant
livraison** : sans `view id` explicite, l'endpoint `/API/metadata/v1/
collections/{id}/` renvoie `{ Champ: { values:[{value}] } }` — PAS
`metadata_values`/`field_values` comme la première version du code
supposait (cette forme-là n'apparaît qu'avec `.../views/{id}/`, un id
spécifique à un environnement qu'on ne veut pas coder en dur ici).

**Testé de bout en bout** contre la vraie chaîne Star Trek (voir ci-dessus) :
chemin assemblé identique au vrai dossier S3.

**Reste ouvert** : le nœud n'a qu'un seul port de succès + un port d'erreur
générique (pas de distinction "ancêtre introuvable" vs "erreur réseau") —
suffisant pour l'instant, à affiner si besoin réel.

**`Deliver` ne connaît pas S3.** Sa destination est une **connexion typée** —
le modèle `Connexion` porte déjà `type` (`iconik | aws_s3 | http | listener`).
S3 en est une implémentation. C'est ce qui préserve le critère 2 : un Core
universel ne référence jamais une façade.

Le dépliage, lui, dépend des deux côtés : la façade de la plateforme source
sait pousser vers une connexion de destination — sur Iconik,
`export_location_trigger` puis attente puis vérification.

**Hors périmètre** : IMF, DCP, AS-11. Un moteur dédié les fera mieux, appelé
comme n'importe quel système externe.

---

## Manifeste — étendu aux 4 niveaux (`appliesTo` par essence) — 4 août

Suite directe du blocage de fin de journée le 3 août : `pivot-manifest.js`
n'avait qu'un `niveau` unique par manifeste, incapable de représenter qu'un
seul manifeste couvre les 4 niveaux avec des essences différentes par
niveau (cover/hero/poster/title pour Série, +season pour Saison,
episodic/video/subtitle pour Episode). Décision de fin de journée
appliquée : construire la vraie extension, pas contourner avec 4
manifestes/4 Deliver.

**`pivot-manifest.js`** : nouveau champ `appliesTo` par essence — tableau
de niveaux (`serie|saison|episode|unitaire`, même vocabulaire que `niveau`
au niveau du manifeste), absent ou `['*']` = tous niveaux (rétrocompatible :
un manifeste existant, jamais rempli avec ce champ, continue de compter à
tous les niveaux comme avant). `valider()` rejette un `appliesTo` vide ou
une valeur hors vocabulaire connu. `resumer()` affiche la portée entre
crochets quand elle est restreinte (`video (exactement 1) [episode,unitaire]`).

**`admin/manifests/manifests.js`/`.html`/`.css`** : 4 chips à cocher par
essence (Sé/Sa/Ép/Un) — toutes cochées par défaut (⇔ `appliesTo` absent).
Décocher une case restreint la portée de cette essence ; le résumé narratif
se met à jour en direct, même mécanisme que pour la cardinalité.

**`pivot-to-wfd.js`** (`_config()`, résolution `manifestId` → `s3Mappings`,
même mécanisme que `mappingId` → `lkRows`) : `appliesTo` transporté tel
quel sur chaque entrée de `s3Mappings` quand présent et restreint ; omis
(pas `['*']` recopié) quand l'essence s'applique à tous niveaux — cohérent
avec « ce qui est déductible n'est pas stocké ».

**`wfd-engine-handlers.js`, `aws_s3()` branche `list_objects`** : le vrai
garde-fou. Une table `TYPE_TO_NIVEAU` (`Série→serie`, `Saison→saison`,
`Episode→episode`, `Unitaire→unitaire`) traduit `ctx.vars.TypeCollection`
(posé à plat par le Search précédent — même champ que `resolve_ancestors`)
vers le vocabulaire du Manifeste. Une essence dont `appliesTo` ne contient
pas le niveau courant est **ignorée entièrement** : ni recherchée dans les
clés S3, ni comptée dans la cardinalité — c'est ce qui permet à un Deliver
unique, avec un seul `manifestId`, de couvrir les 4 niveaux sans jamais
signaler une essence manquante hors de sa portée. Sans `TypeCollection`
connu (contexte hors Search, valeur inattendue), **aucun filtrage** —
rétrocompat explicite, même principe que le reste du garde-fou de
cardinalité du 3 août.

**Testé isolément** (mock de `fetch`, pas de réseau réel — script non
commité), 4 cas en chaîne validation → résolution → exécution : (A) niveau
Saison, une essence `episode,unitaire` absente du dossier n'est pas comptée
en échec ; (B) niveau Episode, l'essence `episode,unitaire` présente est
posée normalement ; (C) niveau Episode, l'essence manquante fait échouer le
garde-fou de cardinalité (preuve que le filtrage n'empêche pas la
vérification quand l'essence EST dans la portée) ; (D) `TypeCollection`
absent, aucun filtrage, comportement identique à avant le 4 août. Vérifié
aussi contre l'API réelle (`/api/manifests` PUT avec `appliesTo`, round-trip
confirmé, manifeste réel restauré à son état d'origine après le test) —
le serveur avait le même piège de process obsolète que le 3 août (`node
server/index.js` démarré avant les modifications de ce jour), résolu par un
`kill` (LaunchAgent relance automatiquement).

**Contenu réel saisi dans le manifeste "PRIME" — même session.** Source :
la table officielle "Required" du doc partenaire (*Partner API – Onboarding
external*, citée dans `journal-aps-2026-07-16.md`, corrigée le 17/07) +
les vrais fichiers listés le 3 août. 9 essences :

```
cover/poster/hero   au_moins_un   [serie,saison,unitaire]
title                optionnel     [serie]
season_box           au_moins_un   [saison]
box                  au_moins_un   [unitaire]
episodic             optionnel     [episode]
video                exactement_un [episode,unitaire]
subtitle             au_moins_un   [episode,unitaire]
```

`cardinalite: au_moins_un` (pas `exactement_un`) pour les artworks
obligatoires — décision produit déjà actée le 16 juillet : "le dépôt prend
tout ce qu'il trouve... pour laisser Bayard ajouter de l'éditorial", donc le
garde-fou ne doit bloquer que sur l'absence, jamais sur le surplus. Deux
choix non explicitement tranchés par la doc, pris par défaut (à corriger en
un clic dans l'écran Manifestes si besoin) : `video` en `exactement_un` (un
seul fichier canonique — cohérent avec "resoumission = nouvel asset =
nouvel ID") et `subtitle` en `au_moins_un` (le doc groupe vidéo+sous-titres
comme ce qui remplace l'absence d'artwork obligatoire à ce niveau).

**Bug réel trouvé en vérifiant contre les 3 vrais dossiers (Série/Saison/
Episode de la chaîne Star Trek) — corrigé avant de considérer la
vérification concluante** : `aws_s3()` interrogeait S3 avec `list-type=2&
prefix=...` **sans `delimiter`**, donc récursif — le préfixe du dossier
Série remontait aussi tous les fichiers nichés dans sa Saison et son
Episode. Resté invisible tant que Deliver ne livrait qu'au niveau Episode
(une feuille, sans enfants) ; révélé pour la première fois en vérifiant le
Manifeste étendu contre un niveau non-feuille. Pire : l'ordre de tri S3
('S' majuscule < 's' minuscule) faisait gagner `Saison_01.../
startrek_s01_cover.png` sur le vrai `startrek_cover.png` de la Série — la
Série aurait silencieusement reçu l'artwork de sa Saison. Corrigé
(`delimiter=%2F` ajouté, paramètres re-triés alphabétiquement pour la
signature SigV4) ; `count` (déclenche le port "dossier vide") recalculé
depuis `keys.length` plutôt que `<KeyCount>` du XML (qui, avec `delimiter`,
compte aussi les sous-dossiers — aurait pu masquer un dossier réellement
vide de fichiers directs).

**Vérifié après correction**, contre la vraie chaîne Star Trek (même
connexion S3, mêmes 3 dossiers que le 3 août) : Série récupère son propre
cover/poster/hero/title (pas ceux de sa Saison), Saison son propre
cover/poster/hero/season, Episode son video/subtitle/episodic — les 3
niveaux passent le garde-fou de cardinalité sans erreur, chaque essence hors
de sa portée (ex. `season_box` au niveau Episode) correctement ignorée.
Manifeste "PRIME" restauré à son contenu réel (pas de rollback nécessaire,
contrairement au test intermédiaire de la section précédente).

**Reste ouvert** : Unitaire jamais vérifié contre un vrai dossier S3 (aucun
Unitaire réel connu au moment d'écrire) — contenu saisi d'après la doc
partenaire seule, à confirmer sur un cas réel si l'occasion se présente.

---

## Modèle de données

**Montrer, pas déclarer.** Le sélecteur affiche l'arborescence réelle des
données disponibles, avec leurs valeurs, rangées sous l'étape qui les a
produites.

```
▾ Recherche APS                    ← étape 4 a ajouté ceci
    search_results.count      1
▾ Boucler sur — item               ← étape 5
    item.metadata.BayardID    [ "67939181" ]   ⚠ liste
```

Même geste que dans une vue Iconik : on choisit dans ce qui est là, on n'écrit
jamais le nom à la main. Et les accolades ne se tapent plus — un champ de
nature « référence à une variable » les gère.

**La capture existe déjà** : l'exécuteur persiste le contexte complet après
chaque nœud (`wfd-run-history.js`, 500 runs, 90 jours). Comparer deux
instantanés consécutifs donne la **provenance gratuitement**. Il manque un
lecteur, pas un mécanisme.

**Trois sources**, par ordre de préférence — un run réel, le contexte de test,
la spec importée. Le sélecteur dit laquelle il a utilisée : une valeur venant
d'une spec n'a pas le même statut qu'une valeur observée.

**Contexte de test** : un objet réel attaché au workflow, choisi une fois. Sans
effet à l'exécution. Il sert au sélecteur, à la validation du manifeste, et
préremplit le test du déclencheur.

### Construit le 3 août — version réduite, pas la vision complète

Ni le run réel ni le contexte de test n'existent encore (pas de pont
d'exécution pour un `BuilderFlow`, toujours vrai). Version buildable
maintenant, sur ce qui existe déjà : le catalogue (`CAT.variablesDe(etape)`,
vérifié handler par handler — Trigger/Search/History/Lookup/aps.registry
déclarés à ce jour) + les vrais champs de métadonnées de l'org
(`ConfigSources`, déjà en cache). Deux endroits :

- **Sélecteur inline** — un menu accolé à tout champ de nature `variable`
  (config-renderer.js), qui remonte le graphe depuis le nœud courant
  (`_etapesPrecedentes`, parcours en largeur sur les arêtes top-level — ne
  descend PAS dans le corps d'une boucle, pas encore représenté dans ce
  canevas). Choisir une entrée écrit `{nom}` et repeint.
- **Panneau dédié** — nouvel onglet "Variables" à côté de Palette/Config/Run,
  repris du principe d'un panneau de WFD (`script-workflow-designer.js`,
  `_wfdCollectVars`) mais sans onglet "Dernier run" (rien à y montrer). Deux
  vues : "All" (tout le flow) et "Upstream of selection". Clic pour copier.

**Repli par défaut, retour utilisateur en testant** : les champs "si présent"
(métadonnées de l'org, potentiellement des dizaines par étape) rendaient le
panneau aussi peu lisible que celui de WFD — repliés derrière un "show N
possible fields", sauf en recherche active (filtrer ignore le repli). Un
doublon trouvé en même temps : Trigger proposait `collection_id` ET
`collection.id` pour la même valeur (le moteur pose bien les deux formes,
vérifié, mais ça n'ajoute qu'une question "laquelle ?") — une seule forme
montrée désormais.

**Reste ouvert** : seules 5 façades/cores sur ~20 sont déclarées — à
compléter au fil de la construction, façade par façade, quand elle sert
vraiment (même principe que le catalogue lui-même). Le corps d'une Loop
n'est pas parcouru — bloqué par un gap plus profond : une Loop n'a pas encore
d'éditeur de corps dans ce canevas.

### Portabilité affichée au choix — enfin câblée (3 août)

Le mécanisme décrit au 23 juillet ("✅ Node-RED · n8n · Step Functions vs ⚠
APS uniquement", affiché au moment du choix) n'existait nulle part dans le
code avant ce jour. Construit en généralisant la nature `choix`
(config-renderer.js) : un champ optionnel `portabilite` par option, affiché
en note sous le menu, mise à jour à chaque changement — jamais stocké dans
le modèle. Premier usage réel : le Type du Générateur d'ID (`Numeric` =
APS uniquement, dépend de BayardRegistry ; les 5 autres = portables, pur
calcul local). Réutilisable pour n'importe quel autre choix du catalogue.

### Générateur d'ID redémasqué de la palette (3 août)

`aps.registry` (`isService: true`) était masqué de la palette depuis le 28
juillet ("les services ne sont pas des nœuds à poser"). Contredit par le vrai
flow de production (nœud autonome, son propre déclencheur `Bayard ID ?`) ET
par la phrase juste en dessous dans ce document ("soit par une façade
dédiée"). Démasqué — `isService` reste utile pour la déduction des services
requis, ne conditionne plus la palette. Libellé palette ajusté (`nodeLabel`
sur la façade) : "ID Generator", pas "Registry" (dérivé du nom de façade,
peu clair une fois visible).

### Pastille de connexion — inactive vs non testable (3 août)

Retour utilisateur en configurant Deliver : une connexion S3 active
affichait la même pastille grise qu'une connexion inactive, donnant
l'impression qu'"Actif" (admin/connexions/, `isActive`, une case cochée à la
main) mentait. Ce n'était pas le cas — deux questions différentes (l'admin
ne fait aucun test en direct, la pastille du Builder oui, sauf pour S3 qui
n'a pas de handshake HTTP simple). Corrigé : un texte TOUJOURS VISIBLE à
côté de la pastille (pas juste une infobulle au survol) distingue
"inactive" de "not tested — this type has no live check".

---

## Panneau

**Déclarer les champs au lieu de les écrire.** WFD a 236 champs et 11 aides,
parce que le panneau est du HTML écrit à la main sur 10 400 lignes.

**Neuf natures suffisent** : texte, nombre, booléen, choix, référence à une
variable, objet Iconik, connexion, tableau de lignes, expression.

```
parentId:
  libellé : "Emplacement de création"
  nature  : collection Iconik
  si vide : "la collection depuis laquelle l'action est déclenchée"
  aide    : "Où la collection sera créée dans Iconik."
```

Quatre bénéfices automatiques : l'aide existe toujours · **le défaut est
visible** · **les champs cachés sont effacés** · la nature permet de valider.

Et la déclaration alimente aussi la **documentation générée** — un champ décrit
une fois sert le panneau, la validation, la doc et les exports.

**`aide` et `siVide` sont deux emplacements distincts**, jamais interchangeables.
Les placeholders de WFD étaient tantôt informatifs, tantôt paramètres.

---

## Canevas

**Lire un workflow comme un livre** — d'où ça vient, comment c'est venu, ce
qu'on fait, où ça va. Un placement qui suit le sens du flux produit cette
lecture.

**Un workflow qui ne peut pas se représenter en angles droits est bordélique.**
Ce critère esthétique mesure en fait le couplage.

- Disposition en **couches** — rang par distance au déclencheur, ordre calculé
  pour minimiser les croisements. Le `Tidy` actuel ordonne sans regarder les
  liaisons, d'où un résultat inutilisable sur 76 nœuds.
- **Routage orthogonal**, points de passage évitant les nœuds.
- **Placement manuel conservé** — le rangement est une proposition qu'on accepte
  ou annule, jamais une réécriture silencieuse.
- **Le nombre de croisements devient un indicateur affiché.**

L'algorithme de couches ne sera pas réécrit : `bpmn-auto-layout`, Apache 2.0.

**Interface** : canevas au centre, panneaux sur les côtés, **étiquettes de
bord** qui révèlent le bon panneau — pas de bandeau surchargé de boutons.

---

## Architecture du chantier

**Pas de branche longue.** Le chantier est dans `server/public/builders/workflow/`,
dans `main`. L'amorce existe déjà : `workflow.html` (140 lignes), `workflow.js` et
`workflow.css` vides.

`builders/` est à la racine de `public/`, **à côté de `platforms/`** — et non
dedans. Les dossiers `workflow/`, `viewer/`, `settings/` de WFD sont sous
`server/public/platforms/iconik/` ; y placer le Builder l'enfermerait dans Iconik
et contredirait le principe même des paquets de plateforme.

**Le Builder n'écrit jamais dans `workflow/`.** Sur ce qui est partagé —
moteur, Prisma, connexions — il **ajoute**, ne modifie pas.

**Pont d'exécution** : le Builder produit le pivot ; un convertisseur
pivot → WFD permet au moteur existant de l'exécuter sans y toucher.

**WFD ne sera pas détruit** — il ne reçoit plus que des correctifs bloquants.

**Cloisonnement** : le modèle existe en base (`Organisation → Environment →
Flow`, `Project → Permission`) et rien ne l'applique. L'environnement portant
la plateforme, **les façades de déclencheur découlent du contexte** au lieu
d'être choisies. L'authentification est une couche APS, en amont — le Builder
consomme le cloisonnement, il ne le décide pas.

---

## Ordre de construction

Le modèle de données conditionne la propagation d'erreur, qui conditionne le
catalogue. Le packager conditionne la boucle et le Vérificateur. Le catalogue
conditionne le panneau.

1. **Format pivot** — avec `version`
2. **Paquet Iconik** — les 6 façades, avec leur dépliage
3. **Convertisseur pivot → WFD**
4. **Sélecteur de variables** — lecteur des instantanés déjà persistés
5. **Packager** — manifeste sur la mécanique des blocs
6. **Panneau déclaratif**
7. **Canevas**

**Test d'ensemble** : reconstruire PUBLISH dans le Builder. Il doit tenir en
dix étapes qui se lisent comme une phrase — *je récupère, je vérifie, je livre,
j'enregistre, je traduis, je publie, je constate, je note.*

---

## Audit des façades contre les données réelles — 31 juillet

Méthode, répétée pour chaque famille : sortir les occurrences réelles de
`_journaux/WORKFLOWS_WFD_VODFACTORY.json` (export du 29/07, les 6 flows
VOD Factory), lire le handler correspondant dans `wfd-engine-handlers.js`,
comparer au schéma du Builder, corriger ce qui ne colle pas. Récit complet
dans le journal du jour ; ici, l'état.

**Vérifiées et corrigées** (dans l'ordre de fréquence sur PUBLISH V2, 76
nœuds) : `aps_search` (17) · `update_meta` (9) · `workflow_history` (8,
scindée en façade `iconik.history`) · `decision` (7, bug réel : `on` au lieu
de `field`, aurait cassé toute décision construite dans le Builder) ·
`trigger` (façade enrichie aux 12 types réels du designer WFD, un seul
prouvé câblé — Custom Action) · `loop` (7, un seul mode fonctionnel sur 6,
les 5 autres catalogués mais marqués « fails at runtime ») · `action` (6,
41 actionType réels recensés, un seul détaillé — `export_location_trigger`)
· `wait_for` / `aws_s3.deliver` (6 chacun, réconciliés avec le manifeste
plutôt que de recopier le mapping S3 dupliqué à l'identique sur les 6
occurrences réelles).

**Restent à auditer** : ~~`checker` (5) · `fetch` (5) · `create_tree` (4) ·
`id_generator` (1) · `lookup` (1) · `http_sequence` (1) · `timer` (1)~~ —
toutes traitées le 3 août, voir section dédiée plus bas. **L'audit des
façades contre les données réelles est maintenant complet** : les 8 façades
+ les Core touchant une plateforme sont tous vérifiés contre au moins une
occurrence réelle et le handler du moteur.

**Règle confirmée pour trancher Core vs façade**, appliquée à chaque
famille de cette liste : est-ce que le nœud touche l'API d'une plateforme
précise, d'une façon précise à cette plateforme ? Si oui, façade — sinon,
Core pur. A fait basculer `History` et confirmé que `Decision`/`Loop`
restent des Core purs malgré leur richesse.

**Sourcing de données réelles (nouveau, réutilisable)** : `config-sources.js`
interroge Iconik **en direct** via `iconik-proxy` (en-tête `X-Force-Live`,
ajouté cette session — contourne le snapshot DB sans le supprimer pour les
autres appelants) plutôt que les tables de sync `Ikon*`/snapshot. Ces
tables sont peuplées par le bouton "Domaine → Site" de Settings — plomberie
de l'ancien Designer WFD, pas une dépendance que le Builder doit prendre.
Fonctions déjà là : `metadonnees`/`vuesMetadonnees`/`champsDeVue`/
`exportLocations`/`customActions`, toutes avec cache court en mémoire et
horodatage de fraîcheur (`dernierRafraichissement`/`onRafraichi`, affiché
dans le canvas). Tout nouveau besoin de données réelles doit passer par ce
même chemin, pas par une resynchro Ikon*.

**Bug canvas corrigé** : `WfConnect.brancher(...)` ne recevait pas `view`
— tracé de liaison faux à tout zoom ≠ 100 %. Un seul oubli de propriété,
pas un problème de fond.

**Rien n'est commité.** Tout ce qui précède est à l'état de modifications
non indexées dans l'arbre de travail (`git status`) — pas de branche créée.

---

## Ce qui reste ouvert

- **Le manifeste unique** — à éprouver en construisant PUBLISH. C'est le
  premier vrai test.
- **Les mark in/out des segments** — APS écrit `time_start` / `time_end` ; à
  confirmer qu'un GET les renvoie.
- **La famille média** — transcodage, subclip, consolidation, purge des
  sources. Ouverte, non conçue. `Transcode` y sera tranché : façade Iconik
  aujourd'hui, Core FFmpeg dans l'intention.
- **Les ressources d'administration** — connexions, manifestes, modèles :
  comment on les édite et les partage.

---

## Fuites à ne pas reproduire

Trois ont été trouvées dans WFD, toutes du même genre : de la présentation dans
le modèle métier.

- `pageBreakBefore` — réglage du générateur Word, sur **76 nœuds sur 76**
- `x` / `y` — positions du canevas
- `lkActiveTab`, `lkApiFolded`, `lkSourceFolded` — état de pliage de l'interface

Et une quatrième, d'un autre ordre : **40 occurrences de « Bayard » côté
serveur**, dont un modèle Prisma `BayardRegistry`. Un nom de client dans le
schéma du produit. Le Core parle générique — « identifiant externe » — et
`BayardID` est le nom que le **paquet Iconik de ce client** lui donne.

Ajouté le 3 août : `cronFreq`/`cronDays`/`cronHour`/`cronMinute`/`cronMday`/
`intervalStart` (widget de construction de cron de l'ancien WFD — seul le
`cronExpr` compilé compte pour le planificateur) · `viewFields` sur `fetch`
(snapshot de champs de vue jamais lu par le handler) · `lkTechMap`/
`lkTechVar`/`lkApiEndpoint` sur `lookup` (introuvables dans tout le moteur,
pas juste inutilisés par ce handler).

---

## Audit des façades restantes — 3 août

Suite de l'audit du 31 juillet, même méthode, sur les 7 familles qui
restaient : `checker` · `fetch` · `create_tree` · `id_generator` (aps.registry)
· `lookup` · `http_sequence` · `timer`. L'audit des façades est maintenant
**complet**.

- **`checker` (5 occ.)** : absent du schéma du panneau (aucun `case` ni bloc
  `core === 'verify'` cohérent) alors que le Core `verify` du catalogue s'y
  convertit (`familleWfd()`, `verify: 'checker'`) — **bug réel, silencieux** :
  un `verify` construit dans le Builder produisait un `checks: []`, donc un
  nœud qui retournait toujours succès sans jamais rien vérifier. Réécrit en
  liste de sondes (endpoint/method/path/op/value/label). `onError` retiré :
  checker() n'atteint jamais le catch générique de l'exécuteur (il gère ses
  propres erreurs).
- **`fetch` (5 occ., toutes en sous-type `metadata`)** : l'ancien schéma
  (connexionId/target/fetchVar) ne correspondait à aucun nom réel. Réécrit
  pour les 4 sous-types réels du handler (metadata/asset/collection/saved
  search). Port 1 renommé `error` → `not_found` (le handler ne route jamais
  une vraie erreur HTTP vers un port dédié — seulement des « non trouvé ») ;
  `httpMode` retiré du catalogue (mort : `fetch` a son propre handler nommé,
  jamais `handleHttpRequest`). Fichier `wfd-node-fetch.js` repéré comme mort
  (rien ne le `require`) — non touché, hors périmètre.
- **`create_tree` (4 occ.)** : même écart total (connexionId/root/template
  fictifs). Réécrit sur les vrais champs (`templateId`/`parentId`/
  `metadataViewId`/`idFieldName`…). `templateId` référence maintenant la
  ressource réelle `ArboTemplate` — nouvelle nature de panneau `gabarit`
  (config-renderer.js) + `arboTemplates()` (config-sources.js), calquées sur
  `manifeste`/`manifests()`. Risque signalé : `metadataViewId` vide fait
  échouer l'écriture de TOUS les champs, silencieusement, dans le handler.
- **`id_generator` / `aps.registry` (1 occ.)** : aucun schéma de façade
  n'existait (retombait sur le Core `http_request` brut). Réécrit ; `apiActions`
  volontairement omis — repose sur `conn.actions`, absent du modèle
  `Connexion` (jamais fonctionnel, même en configurant l'occurrence réelle).
  Port `error` retiré du catalogue (inatteignable sans `apiActions`).
  `outputType: integer` filtré hors des options sauf `idType: numeric` (évite
  un `parseInt` tronqué silencieusement sur un id hex/alphanumérique).
- **`lookup` (1 occ.)** : `source`/`key` fictifs, réécrit sur `lkInputVar`/
  `lkRows`/`lkFallback`/`lkOutputVar` réels. **Dette non comblée, documentée** :
  `lkRows` reste embarqué dans le nœud alors que builder-etat.md (section
  Ressources) dit déjà que cette table de correspondance devrait être une
  ressource d'org — le modèle Prisma `Mapping` existe mais n'a aucune route
  serveur (contrairement à `ArboTemplate`, qui en avait déjà une). Suivi
  flaggé en tâche séparée.
- **`http_sequence` (1 occ., 7 étapes : 5 foreach + 2 simple)** : réécrit en
  profondeur (`request.method`/`storeAs` fictifs). Chaque étape se délègue à
  `handleHttpRequest`/`_handleHttpForeach` — deux jeux de champs distincts
  selon `httpMode`. `onError` de séquence (top-level) retiré : mort, le vrai
  contrôle vient du `onError` par étape.
- **`timer` (1 occ.)** : **bug réel, le plus sérieux de cette passe** — le
  champ de planning s'appelait `cron` dans le panneau, mais le planificateur
  (`wfd-engine-trigger.js`, `scheduleTimer()`) lit exclusivement `cronExpr`.
  Un cron construit dans le Builder aurait toujours été ignoré, remplacé
  silencieusement par le défaut en dur du moteur (`0 9 * * 1-5`). Corrigé
  dans le panneau ET dans `familleWfd()` (testait `p.cron`, même faute).
  `timerMode` interval/oneshot ajoutés (câblés, non prouvés par l'occurrence
  réelle qui est en `cron`).

**Constat transversal** : sur les 7 familles, quatre schémas de panneau
n'avaient tout simplement **aucune correspondance** avec ce que le moteur
lit (`checker`, `fetch`, `create_tree`, `id_generator`) — pas des champs
approximatifs, des noms entièrement différents. Le bug `timer`/`cronExpr`
est le plus grave trouvé depuis `decision`/`on→field` : silencieux,
plausible (le nœud « fonctionne », juste jamais à l'heure demandée).

---

## Ressource Mapping — construite et branchée le 3 août

Suite directe de l'audit `lookup` ci-dessus : la dette signalée ("`lkRows`
devrait être une ressource d'org") est comblée le jour même.

- `server/routes/mapping.js` — CRUD org-scopé (calqué sur `connexions.js` pour
  le scoping, `arbo-templates.js` pour la forme), monté sur `/api/mappings`.
  Alias `rules` (colonne Prisma) ↔ `rows` (API) : l'écran
  `admin/ressources/ressources.js` (29 juillet, antérieur à cette route)
  attendait déjà `rows` pour mappings ET nommages — la route s'aligne sur ce
  contrat plutôt que de le changer.
- `config-sources.js` (`mappings()`) et `config-renderer.js` (nature
  `mapping`) — même mécanique que `manifeste`/`gabarit`.
- `config-schema.js` : le nœud Lookup ne stocke plus qu'une référence
  (`mappingId`) — plus de `lkRows` embarqué. Forme d'une row documentée en
  commentaire pour ne pas la reperdre : `{key, value, type?, _format?,
  fallback?, children?}`.
- `pivot-to-wfd.js` : **la résolution `mappingId` → `lkRows` réellement
  écrite**, pas juste un sélecteur qui ne sert à rien. `_config()` déplie la
  référence en tableau au moment de produire le format d'échange, depuis
  `options.resolutions.mappings` (fourni par l'appelant — aucun appel réseau
  dans le convertisseur, qui reste synchrone). Prouvé par un test isolé
  (conversion d'un pivot minimal avec `mappingId` + résolution injectée : le
  nœud WFD généré porte bien `lkRows` résolu ; sans résolution fournie,
  `lkRows` reste absent, sans fuite d'une conversion à l'autre).

**Reste ouvert, pas construit aujourd'hui** :
- **Aucun écran ne permet de créer/éditer les rows d'un Mapping** —
  `admin/ressources` n'affiche que nom + décompte, en lecture seule. Tant que
  cet écran n'existe pas, `mappingId` référence une ressource qu'on ne peut
  peupler que par API directe (POST/PUT `/api/mappings`).
- **`manifestId`, sur `aws_s3.deliver`, a le même défaut structurel** —
  vérifié en creusant un point du rapport de la tâche déléguée : AUCUNE lecture
  de `manifestId` nulle part dans le moteur (`wfd-engine-handlers.js`) ni dans
  `package-executor.js`. Ce n'est PAS un simple oubli symétrique à `mappingId` :
  la donnée qu'un manifeste doit produire à la résolution (dépliage par
  essence, vérification de cardinalité) n'est pas encore conçue — c'est le
  Packager, étape 5 de l'Ordre de construction, pas encore bâti. Ne pas le
  traiter comme une correction de parité rapide.
- La tâche déléguée avait aussi affirmé, à tort, que `/api/manifests`
  404 — cette route existe (montée via `wfd-data.js`, pas un fichier dédié).
  Vérifié en lisant le code, pas supposé.

---

## Tree Builder — 3ème onglet, gabarits édités dans le Builder — 3 août

Constat de l'utilisateur : les gabarits d'arborescence (ArboTemplate) se
créaient jusqu'ici dans le Designer de `platforms/iconik/viewer/` — plus en
adéquation avec le Builder, et un aller-retour entre deux apps distinctes
pour construire un workflow. Décision : un 3ème onglet "Tree Builder", à
côté de Workflows/Manifestes, même principe que les deux autres (une
ressource du Builder s'édite dans le Builder).

- `workflow.html`/`workflow.js` — 3ème onglet + liste (renommer/dupliquer/
  supprimer sur `/api/arbo-templates`, déjà un CRUD complet, aucune route à
  écrire).
- `arbo-canvas.html`/`.js`/`.css` (nouveau) — éditeur dédié. **Pas un canevas
  à positions/arêtes libres comme `workflow-canvas`** : un gabarit est un
  ARBRE strict (un parent), une liste imbriquée (indentation = hiérarchie)
  suffit et se construit/se lit plus vite. Chaque nœud : titre, type (texte
  libre + suggestions, jamais un choix fermé — un autre client peut avoir un
  autre vocabulaire), badge "Génère un ID" (`generateId`, le mécanisme
  historique du Designer, reproduit à l'identique). L'aide affichée à
  l'écran dit explicitement la règle de parenté actuelle (Parent ID = dernier
  ancêtre qui génère aussi un ID, pas forcément le parent direct) — sujet
  ouvert, à reprendre une fois l'outil pris en main.

**Bug réel trouvé en testant en direct** (pas en théorie) : l'unique
ressource `Mapping` déjà en base ("VOD Factory | Fields") utilise `src`/`tgt`
au niveau de chaque ligne — `lookup()` (wfd-engine-handlers.js) n'acceptait
CES noms que pour les enfants de traduction (`c.key || c.src`), pas pour la
ligne elle-même (`row.key || row.from` seulement). Toutes les lignes de
l'unique mapping réel étaient donc silencieusement ignorées (0 traduites,
aucune erreur). Corrigé (alias `src`/`tgt` ajoutés au niveau ligne, même
principe que l'alias déjà en place pour les enfants) et vérifié avec les
vraies données de ce mapping (`Classification` -> `rating`, `Genres` ->
liste traduite) : la traduction produit maintenant le bon résultat.

**Vérifié** : pages servies (200), `/api/arbo-templates` et `/api/mappings`
répondent avec de vraies données, `lookup()` testé directement en Node avec
le mapping réel. **Pas vérifié** : l'interaction visuelle réelle dans un
navigateur (ajout/suppression de niveau, sauvegarde) — l'outil Chrome n'était
pas connecté dans cet environnement. À tester à la main.

**Deux corrections après premier test réel par l'utilisateur** (capture
d'écran + retour) :
- **Listes obsolètes entre onglets** : `chargerGabarits()`/etc. ne
  s'exécutaient qu'au chargement de `workflow.html`, pas à chaque clic
  d'onglet — un gabarit enregistré sur `arbo-canvas.html` n'apparaissait
  donc pas tant que la page n'était pas rechargée. `activerOnglet()`
  recharge maintenant la liste concernée à chaque activation, et un
  écouteur `pageshow` (`e.persisted`) couvre aussi le retour arrière depuis
  le cache du navigateur (bfcache), qui ne réexécute pas le script.
- **Outils manquants sur Manifestes** : renommer/dupliquer/supprimer
  ajoutés, sur le même principe que Workflows/Tree Builder. Particularité
  de `/api/manifests` (contrairement aux autres ressources) : PUT/POST
  valident la structure complète via `PivotManifest.valider`
  (name/niveau/essences) — un PUT `{name}` seul échoue en 400. Renommer/
  dupliquer relisent donc le manifeste complet (GET /:id) avant d'écrire.
  Vérifié par un aller-retour réel (dupliqué puis supprimé un manifeste réel
  via l'API, cycle complet réussi).
- **CSS manquant sur arbo-canvas.html** : `org-context-selector.css` non
  inclus — le sélecteur d'organisation s'affichait sans style (liste
  déroulante blanche). Corrigé (une ligne oubliée par rapport à
  `workflow.html`).

**Numérotation par niveau (nodeDef.numberField), ajoutée le 3 août** —
suite d'une discussion sur la parenté : l'ancien mécanisme
(`orderFieldName`/`orderPad`/`orderSeed`) est un réglage de WORKFLOW,
appliqué SEULEMENT à la racine de ce qu'un appel Create Tree crée — un
gabarit à plusieurs niveaux numérotés (Série+Saison+Episode dans le même
arbre, comme le premier test de l'utilisateur) ne pouvait pas fonctionner
avec ce mécanisme. Décision : un réglage PAR NIVEAU dans le gabarit lui-même
(`numberField`/`numberPad`), au même titre que `generateId`, exposé dans
Tree Builder comme un badge "Numérote ce niveau" + le nom du champ.

Correction de fond demandée par l'utilisateur, pas juste un changement de
portée : l'ancien mécanisme est un compteur ATOMIQUE STOCKÉ (BayardRegistry-
like), qui ne sait pas qu'un numéro a été libéré par une suppression —
"Saison 02" supprimée, la création suivante recevait quand même "03". Le
nouveau mécanisme (`_prochainNumeroFratrie`, wfd-engine-handlers.js)
interroge Iconik pour la fratrie RÉELLE sous le parent à chaque création
(recherche `parent_id`, pas un compteur) et lit le numéro dans le TITRE de
chaque sœur (dernière suite de chiffres) — pas sa métadonnée, qui peut être
absente si aucune vue n'est configurée (risque déjà noté ailleurs sur
`metadataViewId`). Testé isolément (algorithme seul, 6 cas dont exactement
le cas rapporté par l'utilisateur : ne reste que "01" après suppression de
"02" -> le suivant redonne bien "02"). Coexiste sans conflit avec l'ancien
mécanisme : un gabarit qui n'utilise pas `numberField` se comporte
exactement comme avant.

---

## Écran d'édition des Mappings — `admin/mappings/` — 3 août

Premier des deux chantiers actés ("faisons-les dans l'ordre" : Mapping puis
Packager). Écran dédié, calqué structurellement sur `admin/manifests/`
(liste + éditeur deux colonnes, même palette `adm-*`) : nom + rows, chaque
row = champ source / chemin destination / type / format / repli, avec une
sous-liste optionnelle de traduction de valeur (children). Correspondances
retirées de l'écran générique `admin/ressources/` (qui ne gardait déjà que
nommages/contacts — Manifest en était déjà sorti avant cette date) ; un 4ème
onglet "Correspondances" ajouté sur l'accueil du Builder, même traitement
que Manifestes/Tree Builder (liste + outils renommer/dupliquer/supprimer +
lien vers l'écran dédié).

**Découverte importante en testant** : `/api/mappings` **existait déjà**,
dans `wfd-data.js` (routes du 22 juin), avant que je construise
`server/routes/mapping.js` — je l'avais raté en auditant `lookup` le 3 août
(j'avais conclu à tort "aucune route n'existe encore"). Les deux routes
faisaient presque la même chose, avec une différence réelle : l'ancienne
filtrait TOUJOURS par une seule org (`getDefaultOrgId`), même pour
superadmin — pas le comportement voulu par `org-context.js` (rôles non
filtrés voient tout). Résolu en supprimant le bloc `mappings` de
`wfd-data.js` (la nouvelle route le remplace intégralement, alias `rows`
cohérent sur GET **et** POST/PUT — l'ancienne n'aliasait que les GET).

**Piège trouvé en même temps, à retenir** : le serveur tournait en
`node server/index.js` simple, pas nodemon — mes changements à `index.js`
(montage de la nouvelle route) n'étaient donc pas actifs tant que le
processus n'était pas relancé, ce qui a produit un faux résultat de test
(POST retournait `rules` non-aliasé, l'ancienne route, alors que le fichier
sur disque était déjà correct). Un `kill` du PID a suffi : un LaunchAgent
(`com.askida.aps.plist`, déjà présent dans `_Patches/`) relance le process
automatiquement. **À vérifier avant tout futur test de route serveur** :
comparer l'heure de démarrage du process (`ps -p <pid> -o lstart`) à l'heure
de modification des fichiers touchés — un serveur plus vieux que le code
teste l'ancien comportement en silence.

Vérifié après redémarrage : round-trip complet (POST/GET/PUT/DELETE) avec
alias `rows`↔`rules` cohérent, et les autres routes (arbo-templates,
manifests, builder-flows, connexions) toujours saines.

**Bug fond blanc résolu — leçon à retenir** : après un très long diagnostic
(éliminé un par un : mode sombre OS, Brave Shields, 3 navigateurs différents,
navigation privée, CDN, cache navigateur avec URL jamais vue) la vraie cause
était un **commentaire CSS mal formé** dans `mappings.css` — le texte du tout
premier commentaire contenait littéralement `mf-*/adm-*`, où `*/` referme un
commentaire CSS prématurément. Le reste du commentaire redevenait du CSS
invalide, suivi d'un second `*/` orphelin — assez pour que le navigateur
corrompe le bloc `:root {}` juste après (confirmé par `document.styleSheets`:
49 règles chargées au lieu des 50 attendues). **Piège à ne pas reproduire** :
ne jamais écrire `*/` (même en deux mots séparés par un caractère) à
l'intérieur d'un commentaire CSS — y compris pour lister des préfixes de
classes comme "mf-* et adm-*". Diagnostic le plus utile qui a mené à la
cause : compter `/\*` vs `\*/` dans le fichier (6 vs 7, jamais égal).

**UX ajoutée sur Manifestes ET Correspondances** (retour utilisateur après
test réel) : recliquer l'élément déjà ouvert referme l'éditeur ; la liste de
gauche reste `position: sticky` pendant le défilement d'un éditeur long —
sinon, avec le mapping réel à 29 lignes, il fallait remonter en haut de page
pour choisir un autre élément.

---

## Packager — audit `wait_for`/`aws_s3` — 3 août

Avant de construire quoi que ce soit, même méthode que tout l'audit du 31
juillet et du 3 août : données réelles (6 occurrences chacun) + relecture
complète du handler, PAS le résumé du 31 juillet qui s'est avéré incomplet.

**Ce que `aws_s3.deliver` fait VRAIMENT** (aucun rapport avec le schéma
d'origine) : les 6 occurrences réelles utilisent TOUTES `operation:
"list_objects"` — ce n'est pas une livraison, c'est une **vérification**.
`wait_for` sonde un job Iconik puis, à la réussite, appelle en interne
`aws_s3` avec `list_objects` pour lister le dossier où l'Export Location a
déjà déposé les fichiers, et exposer les URLs par type (vidéo/image/sous-
titre) via `s3Mappings`. La vraie livraison est `iconik.action` /
`export_location_trigger` (façade Action, déjà validée 6/6 le 31 juillet) —
ceci n'est que le constat après coup. Le nom de la façade (`deliver`) est
donc trompeur par rapport à ce qu'elle fait réellement, mais on la garde
(cohérence avec le nom de famille WFD `aws_s3`).

**`manifestId` était la bonne idée le 31 juillet, juste jamais câblée** :
`s3Mappings[].{type,filter,variable}` a EXACTEMENT la forme d'une essence de
Manifeste (`role`/`reconnu_par`/`sortie`). Résolution ajoutée dans
`pivot-to-wfd.js`, même mécanisme que `mappingId` → `lkRows` (module-level
`_resolutions.manifests`, peuplé par l'appelant, aucun appel réseau dans le
convertisseur). `reconnu_par` (tableau côté Manifeste) est joint en chaîne
virgule pour produire `filter` (chaîne côté moteur) — seul point de
conversion de forme. Testé avec le manifeste réel déjà en base ("Livraison
VOD Factory | PRIME", 1 essence artwork/_poster/s3_image_url) : résolution
correcte, et aucune fuite entre deux conversions sans résolution fournie.

**Schéma `aws_s3.deliver` réécrit** : `operation` exposé (choix, `list_objects`
en premier/coché par défaut — seul prouvé par les 6 occurrences réelles ;
head/get/put/delete_object listés mais pas détaillés, même traitement que
les 40 actionType non détaillés d'`iconik.action`). `manifestId` visible
seulement en mode `list_objects` (c'est le seul où `s3Mappings` compte).

**Vestiges morts confirmés, omis** (présents sur les 6 occurrences réelles,
jamais lus par `list_objects` — reliquats de l'ancienne opération
`artwork_s3`, remplacée par une détection automatique par nom de fichier,
le commentaire du moteur le dit explicitement) : `jobId`, `artworks[]`,
`mdViewId`, `titreVar`, `nommageId`. `s3VarVideo`/`s3VarImage`/`s3VarSrt` :
ne comptent que si `s3Mappings` est vide, jamais le cas en réel.

**Garde-fou de cardinalité — fait le 3 août, même session.** `aws_s3()`
(wfd-engine-handlers.js, branche `list_objects`) compare désormais le nombre
de clés S3 trouvées par mapping à sa `cardinalite` (`exactement_un` /
`au_moins_un` / `au_plus_n` avec `n` / `optionnel`), et fait échouer le
nœud (port `miss`, même port que "dossier vide" — les deux disent "ce que
le Manifeste attendait n'est pas là") avec un message listant CE QUI a
manqué (ex. "artwork : attendu au moins 1, trouvé 0"), pas juste un échec
muet. `pivot-to-wfd.js` transporte `cardinalite`/`n` depuis l'essence vers
`s3Mappings` (même résolution que `manifestId` → le reste des champs,
ajoutée juste avant).

**Rétrocompatibilité vérifiée, pas supposée** : une config sans `cardinalite`
(nœud WFD antérieur au Manifeste) ne déclenche jamais le garde-fou — testé
explicitement (cas F du test ci-dessous). Le calcul de cardinalité tourne
maintenant TOUJOURS (avant : seulement si `count > 0` au niveau global),
pour pouvoir signaler PRÉCISÉMENT quelle essence manque même quand le
dossier est entièrement vide — avant, ce cas ne produisait qu'un échec
générique sans détail.

Testé isolément (mock de `fetch`, connexion S3 factice, 6 cas : au_moins_un
satisfait/non satisfait, exactement_un en excès, au_plus_n dépassé,
optionnel absent, et rétrocompat sans cardinalite) — les 6 se comportent
comme attendu. Testé aussi avec le manifeste réel déjà en base (résolution
complète pivot → WFD, `cardinalite: "au_moins_un"` bien transporté).

**Le Packager est maintenant complet dans ses deux moitiés** : dépliage
(`manifestId` → `s3Mappings`) et garde-fou (cardinalité vérifiée à
l'exécution). Reste hors périmètre, non demandé : un écran pour
créer/éditer les manifestes autrement qu'un par un (déjà couvert par
`admin/manifests/`, pas un nouveau chantier).

---

## Éditeur de corps de boucle — 4 août

En reprenant PUBLISH après Deliver, question posée en continuant la
construction : faut-il un nœud Action avant Deliver, pour déclencher
l'Export Location si les fichiers manquent ? Réponse en creusant le vrai
flow de production (`WORKFLOWS_WFD_VODFACTORY.json`) : oui, et c'est plus
précis que prévu — Iconik ne sait déclencher un Export Location que **par
asset individuel** (`/API/files/v1/assets/{assetId}/export_locations/{id}/`),
jamais en bloc sur une collection. Le vrai motif, confirmé sur les 6
occurrences réelles : Search (assets artwork/vidéo de la collection) →
**Boucle** sur ces assets → Action (export) par itération → Attendre.

Construire cette étape suppose une boucle avec des nœuds dedans — bloqué :
« le corps d'une Loop n'a pas encore d'éditeur dans ce canevas » (limite déjà
documentée). Décidé avec l'utilisateur : construire cet éditeur maintenant
plutôt que documenter le trou et continuer.

**Bonne nouvelle en creusant avant de coder** : côté format, tout était déjà
prêt. `pivot-schema.js`/`pivot-validate.js` définissent et valident déjà
`etape.body = {steps, edges}` (portée imbriquée, jamais déduite du graphe)
et `presentation.bodyLayout[loopId]`. `pivot-to-wfd.js` (`_aplatir`) sait
déjà aplatir un corps de boucle dans le graphe WFD, en connectant
automatiquement le port 0 de la boucle à la première étape de son corps.
Il ne manquait que le canevas.

**Conception retenue** : pas de refonte de `WfModel` (reste un modèle plat
à un seul niveau, volontairement — cf. son en-tête). À la place, une **pile
de portées** (nouveau module `wf-scope.js`) : le triplet racine
`{model, history, selection}`, puis un par boucle ouverte. Entrer dans une
boucle pousse une portée construite depuis `etape.body` (vide si absent) ;
en sortir la dépile et réécrit `etape.body` **dans le même objet étape** que
porte la portée parente — c'est ce qui fait que `wf-persistence.js` n'a
presque rien à savoir de l'imbrication, seules les positions des nœuds
internes (`presentation.bodyLayout`) sont passées à part.

`workflow-canvas.js` (les ~700 lignes qui créent modèle/historique/
sélection et branchent tout le reste) est devenu réentrant SANS dupliquer
ce bloc : `model`/`history`/`selection` sont passés de `const` à `let`,
réassignés (jamais redéclarés) à chaque changement de portée — toute
fonction qui les referme continue de lire la valeur courante sans être
redéfinie. Seuls les abonnements liés à une INSTANCE précise (
`model.onChange`, `selection.onChange`, et les 4 modules externes
WfPaletteDrag/WfConnect/WfContextMenu/WfShortcuts + WfLasso, qui capturent
le triplet par valeur à l'appel de `.brancher()`) doivent se désabonner et
se réabonner — un seul petit helper (`_reabonnable`) gère ça partout,
plutôt que de répéter le motif.

**Navigation** : double-clic sur un nœud Loop, ou bouton "Edit body →" dans
son panneau Config (découvrabilité — rien ne suggérait le double-clic).
Fil d'Ariane en superposition sur le canevas (même principe que les volets
— jamais dans la grille CSS du bandeau d'état, qui n'a que 2 lignes fixes),
segments cliquables + bouton "← Sortir" + touche Échap (neutralisée si le
focus est dans un champ). Badge "N steps" sur un Loop dont le corps n'est
pas vide, visible sans avoir à entrer dedans.

**Sélecteur de variables étendu** (`etapesExterieures()` dans `wf-scope.js`) :
depuis l'intérieur d'un corps, le panneau Variables et le sélecteur inline
montrent aussi ce qui a été posé AVANT la boucle dans sa portée parente —
sans ça, entrer dans un corps aurait rendu aveugle exactement l'outil
construit plus tôt cette session pour ne jamais taper un nom de mémoire.
Variable synthétique `{item}` (nom réel = `loopVar` de la boucle) injectée
en tête du panneau quand on est dans un corps — elle ne sort d'aucune
façade du catalogue, elle vient de la config du Loop lui-même.

**Piège à ne pas reproduire, déjà écrit en commentaire à l'endroit qui
compte** : sauvegarder (bouton Save ou auto-save) DOIT toujours viser
`modeleRacine`, jamais `model` (qui peut pointer sur un corps ouvert), et
appeler `portee.flush()` juste avant — sans ce flush, sauvegarder pendant
qu'on édite l'intérieur d'une boucle perdrait silencieusement les
modifications en cours (le corps resterait figé à son état d'avant la
dernière sortie).

**Deux bugs réels trouvés en écrivant les tests, corrigés avant de
considérer le chantier terminé** :
- `pivot-validate.js` validait un Loop sur `params.over`/`params.as` — un
  vocabulaire d'exemple posé le 23 juillet (`boucler_sur`), jamais mis à
  jour quand le panneau réel (`config-schema.js`) et le moteur
  (`wfd-engine-executor.js:364-374`, "loop hors executor" — pas dans
  `wfd-engine-handlers.js`) ont tranché sur `loopVariablePath`/`loopVar`.
  Conséquence concrète : **toute boucle réellement construite dans le
  Builder aurait échoué la validation complète**, invisible jusqu'ici faute
  d'avoir jamais mené une boucle jusqu'au bout. Corrigé (`loopVariablePath`
  exigé seulement en mode `variable`, le seul réellement câblé — les 5
  autres sources sont marquées "not implemented" dans le panneau lui-même).
- `wf-persistence.js` n'avait jamais de `module.exports` (seul fichier de
  `builders/workflow/` dans ce cas) — jamais testable hors navigateur.
  Ajouté (une ligne, même motif que tous les autres modules).

**Testé isolément** (Node, sans DOM, script non commité) : `entrer`/`sortir`/
`flush` réécrivent bien `etape.body` sur le MÊME objet que porte le modèle
racine (pas une copie) ; `flush()` réécrit sans dépiler ; round-trip complet
`documentDepuisModele` → `initialDepuisDocument` → reconstruction d'une
nouvelle portée restaure les positions du corps (pas une redisposition par
défaut) ; le document complet (racine + corps) passe `pivot-validate.js`
avec le catalogue une fois les deux bugs ci-dessus corrigés ; `pivot-to-wfd.js`
aplatit correctement le corps dans le graphe WFD, port 0 de la boucle vers
la première étape du corps. 29 assertions, toutes passées. Vérifié aussi
que le vrai flow "BAYARD | PUBLISH | VODFACTORY" (encore sans Loop à ce
stade de sa construction) continue de se valider exactement pareil
qu'avant le correctif `pivot-validate.js` — aucune régression.

**Vérifié ensuite pour de vrai dans un navigateur** (même session, après
avoir installé `chrome-devtools` en MCP, pointé sur Brave — pas de Chrome
sur cette machine) : glisser un Loop depuis la palette, double-clic pour
entrer (la simulation de double-clic de l'outil ne produit pas de vrai
événement `dblclick` — contourné en le déclenchant directement pour ce
test ; un vrai double-clic humain, lui, fonctionne, vérifié en dispatchant
l'événement réel), glisser un nœud dans le corps (atterrit bien dans la
portée du corps, pas la racine), bouton "Sortir" et touche Échap, badge
"1 step" sur le Loop refermé, bouton "Edit body →" dans le panneau Config,
panneau Variables affichant `{item}` sous "BOUCLE — LOOP". Sauvegarde
(gestion du `window.prompt` du nom) puis **rechargement complet de la
page** : le corps ET la position du nœud interne survivent à l'identique.

**Troisième bug réel trouvé en regardant l'écran, pas en lisant le code** :
le fil d'Ariane restait affiché à la racine malgré `hidden`. Cause :
`.bd-breadcrumb { display: flex }` (règle auteur) bat toujours
`[hidden] { display: none }` (règle de l'agent utilisateur), quelle que
soit la spécificité — l'origine prime avant la spécificité dans la cascade
CSS. Corrigé par une règle explicite `.bd-breadcrumb[hidden] { display: none }`.
Workflow de test supprimé après vérification (`DELETE /api/builder-flows/...`).

**Reste ouvert** : contenu réel du chantier qui a motivé cet éditeur — poser
Search → Loop (`{item}` = asset trouvé) → Action (`export_location_trigger`,
`assetId: {item.id}`) → sortir de la boucle → Wait → retour à Deliver pour
re-vérifier → Lookup. L'éditeur est prêt, cette construction-là ne l'est pas
encore.

---

## Reprise PUBLISH — tableau, bugs, HTTP Sequence — 4 août (suite)

Suite directe de l'éditeur de corps de boucle : retour à la construction de
PUBLISH elle-même, en relisant le workflow depuis le début à chaque étape
pour vérifier qu'il n'y a pas de trou dans le narratif — c'est cette relecture
qui a fait remonter deux trous réels (ci-dessous) plutôt que de les découvrir
plus tard à l'exécution.

### Trou trouvé : vérifier l'existant avant de déclencher un export

Question de l'utilisateur, de mémoire de WFD : avant de déclencher un export
Iconik, il faut vérifier ce qui existe déjà, sinon le job Iconik échoue et on
gaspille une ressource d'export. Vérifié dans le vrai flow : c'est exact, et
plus précis que la première proposition — la vérification est **par asset**,
pas seulement au niveau collection. Chaîne PUBLISH complète, mise à jour :

```
1  Trigger              Custom Action, Collection
2  Search               Collection, id equals {collection.id} → search_results
3  Decision             {BayardID} is_empty / not_empty
4  Générateur d'ID       (si vide)
5  Set Metadata          (non retouché cette session)
6  Deliver               list_objects, manifestId=PRIME, {ancestorPath}
     Succès  → 11
     Non trouvé → 7
7  Search               Asset, in_collection {collection.id} → assetsAExporter
8  Loop                 sur {assetsAExporter.objects}, loopVar=item
8a   ↳ Deliver          list_objects, SANS manifeste, {ancestorPath}/{filebase(item.title)}
       Succès → rien (suivant)     Non trouvé → 8b
8b   ↳ Action           export_location_trigger, assetId={item.id},
                        fileName={ancestorPath}/{filebase(item.title)}
9  Wait                 poll job, jusqu'à FINISHED
10 Deliver              re-vérification (nouveau nœud, même manifestId)
11 Lookup               {search_results.objects[0]} + Mapping "VOD Factory | Fields" → {vodFactoryPayload}
12 HTTP Sequence        Publication API (7 étapes, cf. plus bas)
13 Verify               (pas encore configuré — bloqué, cf. question ouverte)
14 Set Metadata+History (pas encore configuré — bloqué, cf. question ouverte)
```

**Étape 7 (`in_collection`)** : deux détails de panneau creusés en répondant
aux questions de l'utilisateur, à retenir pour la suite —
`_operateursPourType()` (config-schema.js) n'ajoute l'opérateur "in
collection" que si le champ "Field" ne résout à AUCUNE vraie métadonnée
(laisser Field vide suffit) ; côté moteur, `__collection__` + `in_collection`
se traduit en `in_collections:"{id}"` pour un asset (`in_branch` irait
chercher aussi dans les sous-collections, pas voulu ici).

**Étape 8a (check par asset)** : vérifié contre les 6 vraies occurrences
(`n-1784126131331` et les 5 autres nœuds S3 dans les boucles réelles,
description "Vérification de l'existence de l'asset dans le bucket S3") —
`list_objects` (pas `head_object`), préfixe descendant jusqu'à
`{filebase(item.title)}`, EXACTEMENT la même expression que `fileName` sur
l'Action (8b). L'ancien WFD reconstruit ce chemin à la main sur 3-4
variables par branche ; simplifié ici via `{ancestorPath}` (Ancestor
Resolver, déjà construit et vérifié le 3 août).

**Question ouverte, pas tranchée** : à l'étape 7, un seul Search sans filtre
`media_type` (ma proposition, plus simple, pas de distinction image/vidéo
dans le Loop) ou deux Search séparés comme WFD ? Pas bloquant pour continuer.

### HTTP Sequence (étape 12) — mécanique clarifiée, valeurs réelles

Un seul nœud partagé en production (pas dupliqué par niveau, contrairement à
Verify/History) — "Publication API", 7 étapes : 5 `foreach` (Persons
director/actor/creator/writer/producer, sur `{Realisateur}`/`{Acteur}`/
`{AuteurOrigine}`/`{Auteur}`/`{Producteur}`, endpoint `/api/persons`,
`feAppend` vrai sauf le premier, codes 409/422 ignorés) + 2 `simple`
(Contents Action POST `/api/contents/` corps `{vodFactoryPayload}` ; Video
Action POST `/api/contents/{external_id}/videos`, sauté si `{s3_video_url}`
vide, corps JSON explicite avec sous-titres/pistes audio).

Deux points de mécanique vérifiés en répondant aux questions de
l'utilisateur : `Simple` = "Single request", `Foreach` = "One request per
value" (labels du panneau, confirmés). "Store as" n'est pas obligatoire pour
que l'étape réussisse seule, mais nécessaire si une étape suivante relit ce
qui a été produit — et **`{external_id}` (utilisé par Video Action) ne vient
d'aucune étape de cette séquence** : `lookup()` (wfd-engine-handlers.js)
expose déjà ses champs plats en variables directes après l'étape 11
(commentaire du code : "Cela permet d'utiliser `{external_id}` directement
dans les nœuds suivants") — trouvé en traçant précisément d'où vient cette
variable avant de répondre, pas supposé.

### Verify/History (étapes 13/14) — même trou que le Manifeste, pas encore rebouché

Vérifié contre les vraies données : Verify et History sont dupliqués **4
fois** en production (un Vérificateur + une paire Histo Succès/Échec par
niveau), avec des champs et des messages différents à chaque fois (Série
vérifie cover/hero/poster ; Saison ajoute season ; Episode vérifie
vidéo+sous-titres ; Unitaire vérifie tout + box). Exactement le motif que le
Manifeste (`appliesTo`) a éliminé pour Deliver — mais Verify/History n'ont
aujourd'hui aucune notion de Manifeste. **Question posée à l'utilisateur,
pas tranchée** : accepter la duplication pour l'instant, ou étendre le même
mécanisme `appliesTo` à Verify/History ? Reste le point de blocage pour
finir PUBLISH.

### Bug réel — Lookup avait deux champs de stockage, un seul réel

Question de l'utilisateur en lisant le panneau ("Store Result As" vs "Store
As"). Vérifié : `lookup()` (wfd-engine-handlers.js) ne lit jamais
`cfg.resultVar` — seulement `cfg.lkOutputVar`. "Store Result As" venait du
tableau générique `produit` (config-schema.js, `pour()`) qui l'ajoutait à
Lookup par erreur, en plus de son vrai champ ("Store As") déclaré plus loin
dans le même fichier — remplir le mauvais champ ne stockait rien nulle part,
silencieusement. Corrigé (`lookup` retiré du tableau `produit`).

**Trouvé au passage, pas corrigé (hors sujet, mis en tâche séparée)** : le
panneau du Core `transform` ne correspond à AUCUN des champs que son handler
lit réellement (`target`/`source`/`operation`/`rules`… contre
`input`/`mode`/`expression`/`fields` dans le panneau) — jamais audité dans
les passes du 31 juillet/3 août. Un Transform construit dans le Builder
aujourd'hui ne ferait jamais ce qui est configuré.

### Incident réel — perte de données sur le Mapping "VOD Factory | Fields"

En cours de session, l'utilisateur a supprimé UNE ligne dans l'écran
`admin/mappings/`, enregistré, et s'est retrouvé avec **zéro ligne** au lieu
de 28. Cause trouvée en vérifiant les logs serveur
(`~/Library/Logs/aps.log`, PUT ne portait que 152 octets) puis le code :
`admin/mappings/mappings.js`, `_ligneRow()` affiche `row.key || row.src`
(repli déjà en place pour les données stockées en `src`/`tgt`, alias
historique), mais `enregistrer()` ne filtrait/nettoyait que sur
`row.key`/`row.value` — **toute ligne jamais retapée à la main était donc
traitée comme vide et retirée**, pas seulement celle volontairement
supprimée. Corrigé : normalisation `key = key||src`, `value = value||tgt`
faite une fois à l'ouverture (`editer()`), tout le reste du fichier ne
manipule plus que la forme canonique.

**Récupération** : pas de sauvegarde du Mapping lui-même, mais son contenu
source était déjà dans cette session (le nœud LookUp du vrai export WFD,
lu pour construire ce mapping le 3 août) — 32 lignes réinjectées via API
directe. Écart signalé à l'utilisateur : le mapping affichait 29 lignes
avant l'incident, pas 32 — 3 lignes avaient été retirées à un moment non
documenté (probablement `EnvoiPrime`/`LivraisonsAmazonPrime`, valeur vide
dans la source donc inertes pour `lookup()`, + une autre). Tout remis pour
ne rien perdre ; à trier dans l'écran maintenant réparé.

**Leçon générale** : deuxième bug du même genre ce jour (après celui de
Lookup) où un écran affiche correctement une donnée via un repli
(`a || b`) mais ne le reproduit pas symétriquement à l'écriture — motif à
surveiller ailleurs dans le Builder si l'occasion se présente.

**Rien n'est commité** — modifications non indexées dans l'arbre de travail.
