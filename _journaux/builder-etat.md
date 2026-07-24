# Workflow Builder — état des décisions

> **À soumettre en début de session, avec `methode-travail-aps.md`.**
>
> Ce document donne l'**état** : ce qui est tranché, ce qui reste ouvert.
> Les journaux `_journaux/` donnent le **récit** : pourquoi, et ce qui a été
> écarté. Lire ce document suffit pour travailler ; lire le journal sert quand
> on veut comprendre une décision ou la remettre en cause.
>
> Dernière mise à jour : 23 juillet 2026.

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

### Façades — 6

`Search` · `Fetch` · `Set Metadata` · `Action` · `Create Tree` · `S3`

### Services — 2

Registre d'identifiants externes · compteur d'ordre. Les seuls mécanismes qui
exigent un état partagé et atomique ; aucun moteur ne sait les porter.

### Ressources — 2

Manifeste de livraison · modèle d'arborescence. Nommées, réutilisables,
éditées dans leur propre écran.

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
| Services requis | déclarés au niveau du workflow |
| Gestion d'erreur | réglage du workflow |
| Présentation | positions, sauts de page — **section séparée** |

### Ce qu'il ne stocke pas

**La portabilité** — chaque générateur déclare ce qu'il sait porter, le Builder
en déduit. La stocker garantirait qu'elle dérive.

**Le caractère destructif** — déclaré par la façade.

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

## Versionnement

`Flow` n'en a aucun aujourd'hui : un enregistrement écrase, et `upsertFlux`
replanifie immédiatement — corriger un workflow actif, c'est modifier la
production.

| | |
|---|---|
| **Brouillon** | ce qu'on édite, écrasé à chaque enregistrement |
| **Publier** | geste explicite, crée une version figée |
| **Production** | exécute la dernière version publiée, jamais le brouillon |

Un **run** enregistre la version exécutée. Un **export** enregistre la version
décrite — le docx porte « version 7 », et c'est un fait, plus une promesse.
Retour arrière : republier la version précédente. Toutes les versions publiées
sont conservées (~200 Ko pour 76 nœuds).

**Collision de vocabulaire à régler avant que le champ n'entre dans le pivot** :
`draft` existe déjà au niveau du nœud et ne veut pas dire « version non
publiée ». Deux notions, un mot — exactement le motif « Créer sous » / « Bayard
ID parent ». Clarifier ce que signifie le `draft` de nœud, puis le renommer ;
`status: draft | published` garde le mot au niveau du flux.

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

**Pas de branche longue.** Un dossier `builder/` à côté de `workflow/`,
`viewer/`, `settings/`, dans `main`.

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

## Ce qui reste ouvert

- **Le `draft` de nœud** — clarifier son sens, puis le renommer avant qu'il
  n'entre en collision avec `status: draft` du flux.
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
