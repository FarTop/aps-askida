# Workflow Builder — état des décisions

> **À soumettre en début de session, avec `methode-travail-aps.md`.**
>
> Ce document donne l'**état** : ce qui est tranché, ce qui reste ouvert.
> Les journaux `_journaux/` donnent le **récit** : pourquoi, et ce qui a été
> écarté. Lire ce document suffit pour travailler ; lire le journal sert quand
> on veut comprendre une décision ou la remettre en cause.
>
> Dernière mise à jour : 3 août 2026 (test grandeur nature en cours — VOD
> Factory PUBLISH construit nœud par nœud, palette triée, sélecteur de
> variables + panneau dédié construits ; cf. `journal-aps-2026-08-03.md`,
> section "Test grandeur nature" pour le récit).

---

## Point de départ pour la prochaine session

1. **Continuer la construction de PUBLISH nœud par nœud** — Trigger → History
   → Search → Decision posés et configurés (vérifiés contre le vrai flow de
   production). Reste à poser : Bayard ID ?, Générateur d'ID, Set Metadata,
   Deliver (manifeste), Lookup, HTTP Sequence, Verify, Set Metadata + History
   finaux — la liste à 10 étapes déjà proposée dans le journal.
2. **Élargir le catalogue de variables au fil de la construction** — chaque
   façade posée pour de vrai (Fetch, Set Metadata, Action, Deliver, HTTP
   Sequence…) doit recevoir sa déclaration `variables()` vérifiée contre le
   handler, comme Trigger/Search/History/Lookup/aps.registry aujourd'hui.
   Les façades non encore déclarées renvoient `[]` — absence de preuve, pas
   invention.
3. **Vérifier à la main dans un navigateur** le badge statut/bouton Publier
   du canevas ET le nouveau panneau Variables (câblés le 3 août sans outil
   Chrome disponible dans cet environnement — testés uniquement via retours
   directs de l'utilisateur en cours de session, pas par moi).
4. Historique des versions publiées : la route existe (`GET
   /builder-flows/:id/versions`), aucun écran ne l'affiche ; pas de rollback
   construit (republier une ancienne version).

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

Registre d'identifiants externes · compteur d'ordre. Les seuls mécanismes qui
exigent un état partagé et atomique ; aucun moteur ne sait les porter.

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

**Un seul manifeste couvre tous les niveaux.** Chaque composant porte deux jeux
de critères, dans le même langage :

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

**Rien n'est commité** — modifications non indexées dans l'arbre de travail.
