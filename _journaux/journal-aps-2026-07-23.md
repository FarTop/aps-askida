# Journal APS — 23 juillet 2026

> Récit de la session. État technique → `cartographie-wfd`. Processus → `methode-travail`.

## Vue d'ensemble

Matinée de consolidation — LaunchAgent, correctifs de documentation restés en
suspens de la veille — puis une **longue session de conception du Workflow
Builder** qui a occupé tout l'après-midi.

Cette seconde partie est fondatrice : elle a produit l'inventaire complet des
40 nœuds de WFD, le classement Core / façade / service, et les décisions
d'architecture qui contraignent tout ce qui suivra. Elle a aussi fait remonter
plusieurs sujets qu'on croyait indépendants et qui ne le sont pas.

La séance s'est poursuivie jusqu'à couvrir **toute la revue de conception** :
catalogue révisé, déclaration des façades et des Core, manifeste de livraison,
versionnement, canevas et cloisonnement. Le workflow PUBLISH a été démonté
contre sa configuration réelle pour éprouver l'ensemble — il tient en dix
étapes au lieu de soixante-seize.

---

## Correctifs livrés (sur `main`)

**`com.askida.aps.plist` — APS survit à la session SSH**

APS tournait dans le terminal et mourait avec lui. Désormais géré par launchd :
redémarrage automatique en cas de plantage, chargement à l'ouverture de session,
processus unique.

Trois points ont été tranchés en chemin :

- **LaunchAgent et non LaunchDaemon**, parce que PostgreSQL est lui-même un
  LaunchAgent utilisateur. Un Daemon démarrerait au boot sans base de données.
- **Les logs existent enfin** — `~/Library/Logs/aps.log` et `aps-erreurs.log`.
  APS écrivait sur la sortie standard, qui disparaissait avec la session : on a
  cherché un fichier de log hier soir sans le trouver.
- **L'alias `aps-restart` est passé à `launchctl kickstart`.** L'ancien lançait
  un `node ... &` en doublon, et son `kill` visait le port 2880 alors qu'APS
  écoute sur 3000 — ligne morte depuis un moment.

La connexion automatique du Mac Mini est déjà active, donc APS repart aussi
après un redémarrage complet.

**`fix(export)` — blocs dupliqués et marges**

Les `git am --skip` successifs de la veille avaient réappliqué les mêmes patchs
plusieurs fois. `git am` applique dès qu'il trouve un contexte proche, même si
le changement est déjà présent ailleurs dans le fichier :

```
case 'aps_search'   6 fois
case 'create_tree'  4 fois
case 'set_var'      4 fois
```

En JavaScript, un `case` dupliqué n'est pas une erreur — le premier gagne, les
suivants sont inatteignables. Le comportement était donc correct, avec 683
lignes de code mort et le piège qui va avec : éditer une copie sans effet.

Au passage, le correctif des marges d'en-tête avait été perdu dans un
`git am --abort`. Rétabli.

**Vérification par contenu, pas par historique.** C'est ce qui a permis de
détecter les doublons : `git log` montrait des commits plausibles, seul un
`grep -c` sur le fichier disait la vérité. À retenir après toute série de
`--skip`.

**Configuré par Farid** : la Décision de STATUSES (`parent_not_sent` en tête,
avant `incomplete`) et le retour du timer en cron `00 02 * * *`.

---

## Conception du Workflow Builder

### Méthode adoptée

Farid a posé la règle : **on s'arrête à la moindre gêne.** Contrairement à VOD
Factory où le pragmatisme primait, le Builder est fondateur — on ne contourne
pas, on corrige le fondement.

Et un critère vérifiable en découle :

> Une question qui porte sur la mécanique d'APS est un défaut du Builder.
> Une question qui porte sur Iconik ou VOD Factory ne l'est pas.

Sur les cinq blocages de la semaine, **cinq portaient sur ce que l'outil
cachait** : le `.0` invisible des tableaux, la casse indétectable, « Créer
sous » confondu avec « Bayard ID Parent », un champ vide qui signifiait « la
collection déclenchante » sans le dire, une vue qui survivait à un changement
de mode. Aucun ne portait sur le métier.

### Inventaire des 40 nœuds — sept lots

Chaque nœud a été analysé dans le code — handler réel, configuration exposée,
usage effectif dans les sept workflows Bayard.

**Résultat : 16 Core, 2 services, le reste en façades.**

| Catégorie | Nœuds |
|---|---|
| Contrôle de flux | Decision · Loop · Call Workflow · Approval · Delay |
| Vérification | Verify (`once`/`until`) · QC |
| Données | Set Variable · Transform · Script |
| Appels | HTTP Request · HTTP Sequence · Lookup |
| Sorties | Notify · History |
| Entrée | Trigger (5 sources) |

**Services** : registre d'identifiants externes, compteur d'ordre. Deux
mécanismes seulement exigent un état partagé et atomique — aucun moteur ne sait
les porter, ils deviennent des appels externes.

### Ce que l'inventaire a révélé

**La structure à deux étages existe déjà.** `create_col`, `acl`, `link_file`,
`relate`, `cast`, `transcode` sont des façades d'une ligne :

```js
return action({ ...node, config: { ...node.config, actionType: 'collection_create' } }, ...)
```

Elle n'est donc pas à inventer, seulement à nommer et généraliser. Le socle
`action` porte **85 opérations Iconik** dont une seule est utilisée en
production (`export_location_trigger`).

**Six nœuds sont déclarés mais vides** : Call Workflow, Approval, Export,
Publish, le mode *throttle* de `gate`, et trois canaux de `Notify` sur quatre.
Ils occupent la palette, apparaissent dans la documentation générée, et
promettent ce que le générateur ne tiendra pas.

**Des doublons se sont formés par dérive.** Trois nœuds savent vérifier
(`checker`, `qc`, `http_request` en mode `verify`), deux savent itérer (`loop`,
`http_request` en mode `foreach`). Les capacités migrent vers le nœud le plus
pratique à modifier, et le catalogue perd sa cohérence sans que personne ne le
décide.

**Quatre nœuds concentrent 60 % de l'usage** : Search (91), Decision (36),
Loop (31), S3 (30). C'est là que le soin doit aller.

**Les transformations sont ailleurs que dans les nœuds prévus.** `transform` et
`rename` sont à zéro usage, pendant que les fonctions inline — `{slug(x)}`,
`{pad(x,2)}`, `{add(a,b)}`, `{filebase(x)}` — servent partout. La sortie
retenue : le nœud Transform devient l'interface no-code qui **produit**
l'expression, et l'expression reste le format canonique.

### Décision — le catalogue passe en anglais

Les noms des nœuds et fonctions seront en anglais dans le Builder : ce sont les
termes du métier, y compris chez les non-anglophones. `Fetch` et `Lookup`
parlent plus que « Récupérer » et « Table de correspondance », et un ingénieur
Switch, Vantage ou Node-RED les reconnaît sans traduction.

L'interface d'APS restera multilingue ; le catalogue non.

---

## Le modèle de données

### Le diagnostic corrigé

J'avais affirmé qu'une variable non résolue devenait vide. **C'est faux, et le
test le prouve** : elle reste littérale.

```
/api/contents/{item.metadata.BayardID.0}/action-statuses
```

Le résolveur distingue trois états — résolue, résolue mais vide, introuvable —
ce qui est plutôt bien pensé. Le défaut n'est donc pas dans le résolveur :
**personne ne regarde.** Le littéral part dans une URL, produit un 404, et le
symptôme apparaît chez le partenaire.

### La demande de fond

Formulée par Farid, et elle ne parle pas de types :

> D'où sort cette variable ? Elle veut dire quoi ? Rien ne dit que
> `{collection}` contient `.type`, `.title`. On devrait pouvoir switcher
> d'objet sans tout reconstruire.

Le sélecteur `{…}` propose aujourd'hui **le catalogue Iconik** — tous les champs
possibles — et non ce que le workflow a réellement produit à cet endroit.

### La solution retenue : montrer, pas déclarer

Le sélecteur affiche l'arborescence réelle des données disponibles, avec leurs
valeurs, rangées sous l'étape qui les a produites.

```
▾ Recherche APS                    ← étape 4 a ajouté ceci
    search_results.count      1
▾ Boucler sur — item               ← étape 5
    item.metadata.BayardID    [ "67939181" ]   ⚠ liste
```

Le parallèle est celui d'une vue Iconik : on choisit dans ce qui est là, on
n'écrit jamais le nom à la main.

**Et la capture existe déjà.** L'exécuteur émet le contexte complet après
chaque nœud, et `wfd-run-history.js` le persiste par nœud — 500 runs, 90 jours.
En comparant deux instantanés consécutifs, on obtient la **provenance
gratuitement** : ce qui apparaît entre l'étape 3 et la 4, c'est la 4 qui l'a
produit.

Il ne manque donc pas un mécanisme d'exécution pas à pas, seulement un
**lecteur** de ce qui est déjà enregistré.

**Le seul manque** : un workflow neuf n'a pas de run. C'est là que l'import de
spec (Postman, OpenAPI) prend son sens — la forme de la réponse est connue
avant toute exécution, puis remplacée par le réel au premier run.

---

## La propagation d'erreur

### Décision — plus de politique par nœud

L'argument est de Farid, et l'usage lui donne raison : `continue_log` est choisi
**263 fois** contre 66 pour `stop`. La pratique a déjà tranché.

> En production, on préfère laisser les jobs aller jusqu'au bout et avoir une
> notification. On préfèrera toujours relancer un job qu'en débloquer un. S'il
> y a une erreur générale qui impacte des dizaines de workflows, il faudra tout
> se farcir à la main.

Un seul comportement, donc : consigner, continuer, notifier en fin. **Cela
supprime 360 réglages** dans les workflows actuels et une question à se poser
sur chaque nœud posé.

La **première erreur est la cause**, les suivantes en sont les conséquences. La
notification remonte la première et liste les autres si on veut le détail.

Elle **décide aussi du canal**, Iconik compris : statut `Echoué`, ligne
d'historique, Slack, Teams sont des sorties d'un même nœud, pas des étapes
disséminées dans le flux.

### Deux sémantiques, une portable

| | Portabilité |
|---|---|
| Transférer au gestionnaire | Node-RED, n8n, Step Functions, BPMN — tous l'ont |
| Traversée inerte puis notifier | **APS uniquement** |

Les deux sont conservées : APS peut être un outil de production, donc n'a pas à
se limiter à ce qui s'exporte.

### Décision — le marquage de portabilité est calculé

Un badge déclaré à la main dériverait. Chaque **générateur déclare ce qu'il sait
porter**, et le Builder en déduit la portabilité — affichée **au moment du
choix**, pas à l'export :

```
Gestion des erreurs
  ○ Transférer au gestionnaire     ✅ Node-RED · n8n · Step Functions · BPMN
  ● Traversée inerte puis notifier  ⚠ APS uniquement
```

Règle générale : un générateur peut **dégrader et le dire**, **omettre et le
dire**, ou **refuser**. Jamais omettre en silence. C'est la généralisation de la
section « Livrables associés » ajoutée mardi au docx.

Bénéfice inattendu : ce mécanisme mesure la dérive. Si un workflow accumule les
éléments non portables, ça se voit.

### `Send To`

Vers un nœud du même workflow, c'est **une connexion présentée autrement** —
elle appartient à la couche présentation et se compile en arête ordinaire. Vers
un autre workflow, c'est `Call Workflow`, et c'est une autre sémantique.

Retenu : le réglage de workflow comme filet (il ne s'oublie pas), le `Send To`
quand on veut router explicitement.

---

## Le packager

### La découverte

En tirant sur le fil de la boucle, on est retombés sur le débat du 19 juillet :
*« je ne peux pas être en mode fichier aplati… c'est la livraison qui paie ».*

L'analyse de PUBLISH le confirme de façon spectaculaire — **les six boucles sont
identiques** :

```
Export Location  →  Attendre  →  AWS S3
```

Elles ne diffèrent que par ce qu'elles parcourent : `serieAssets`,
`saisonAssets`, `episodeArtworks`, `episodeVideo`, `unitaireArtworks`,
`unitaireVideo`.

| | |
|---|---|
| 6 recherches + 6 boucles + 18 étapes de corps | |
| **30 nœuds sur 76** | **40 % de PUBLISH** |

Quarante pour cent du workflow dit une seule chose : *trouve les médias de ce
type, dépose, attends, vérifie.* C'est le contournement de l'absence de
packaging.

**La boucle n'est pas la bonne abstraction.** Il ne s'agit pas d'itérer mais de
déclarer une livraison.

### Le manifeste existe déjà, éparpillé

Sur quatre nœuds qui doivent s'accorder :

| Où | Ce qu'il dit |
|---|---|
| Recherche | où trouver les fichiers |
| Nœud S3 | quels rôles, reconnus par extension |
| Vérificateur | ce qui est obligatoire, par niveau |
| Table de correspondance | où va l'URL dans le payload |

**Et leurs granularités ne correspondent pas.** Le nœud S3 connaît 3 rôles
génériques (`video`, `image`, `subtitle`), le Vérificateur en contrôle 5
spécifiques, la table en cible 7. Le nœud S3 **ne sait pas distinguer un cover
d'un poster** — il produit une seule variable pour toutes les images, et la
distinction se fait par convention de nommage de fichier (`_poster` dans le
filtre).

Le rôle d'un fichier est donc **implicite dans son nom**, non déclaré, et
l'erreur n'apparaît qu'après le dépôt.

### Décision — le manifeste réutilise la mécanique des blocs

Proposition de Farid, validée par le code : la structure d'un bloc `aps_search`
porte déjà `id`, `label`, `objectType`, `criteria[]`, `parentBlock`, avec au
niveau du nœud `mode`, `expression` booléenne et `returnBlock`.

Le `label` existe — simplement jamais rempli.

**Quatre attributs à ajouter par bloc :**

| | |
|---|---|
| Rôle | le `label` enfin utilisé — `cover_art` |
| **Cardinalité** | exactement un · au moins un · plusieurs |
| Obligation | requis, et pour quels niveaux |
| Destination | chemin S3, et variable produite |

La **cardinalité** est le seul concept vraiment nouveau. Elle permet de détecter
deux `cover_art` concurrents — cas qu'aucun contrôle actuel n'attrape.

Avantage décisif du réemploi : **la page Recherche valide les critères
immédiatement.** On vérifie que `cover_art` correspond à exactement un asset
avant de lancer quoi que ce soit.

Et les critères couvrent les trois conventions possibles — nom de fichier,
métadonnée, sous-collection — sans avoir à en figer une.

**Hors périmètre** : IMF, DCP, AS-11. Trop spécifiques ; un moteur type Tornado
les fera mieux, appelé comme n'importe quel système externe.

**Reste à résoudre** : les critères contiennent `{collection.id}`. La page
Recherche a besoin d'un **objet de test** pour les évaluer. Même besoin que le
sélecteur de variables — les deux réclament un contexte réel.

---

## Le panneau de configuration

### La mesure

```
236 champs de saisie
 11 aides
```

Une aide pour vingt-deux champs. Cause structurelle : le panneau est du **HTML
écrit à la main, famille par famille**, sur 10 400 lignes. Rien n'oblige à
documenter, donc personne ne le fait.

### Les deux échecs de la semaine

**« Créer sous » et « Bayard ID parent ».** Les deux libellés parlent de parent.
L'un désigne un emplacement Iconik, l'autre un identifiant métier. Ce n'est pas
une aide qui manquait : **deux champs de nature différente portaient le même
mot**.

**La vue qui persistait.** En basculant en mode champ par champ, `mdViewId`
gardait sa valeur. Le panneau masquait le champ sans effacer la donnée, et le
moteur l'utilisait.

### Décision — déclarer les champs au lieu de les écrire

```
parentId:
  libellé : "Emplacement de création"
  nature  : collection Iconik
  si vide : "la collection depuis laquelle l'action est déclenchée"
  aide    : "Où la collection sera créée dans Iconik."
```

**Neuf natures suffisent pour 236 champs** : texte, nombre, booléen, choix,
référence à une variable, objet Iconik, connexion, tableau de lignes,
expression.

Quatre bénéfices automatiques :

- **L'aide existe toujours** — la déclaration l'exige
- **Le défaut est visible** — un champ vide affiche sa valeur effective en gris,
  au lieu de laisser croire à « rien » ou « la racine »
- **Les champs cachés sont effacés** — le bug de la vue devient impossible
- **La nature permet de valider** — un champ « collection Iconik » n'accepte pas
  un identifiant numérique

Et un bénéfice moins évident : cette déclaration **alimente aussi la
documentation**. Le générateur Word réinvente aujourd'hui les libellés à la
main. Un champ déclaré une fois sert le panneau, la validation, la doc et les
exports.

### Sujets soulevés

- **Les placeholders sont ambigus** — tantôt informatifs, tantôt paramètres. La
  déclaration sépare `aide` de `siVide`, deux emplacements distincts.
- **Les accolades sont incohérentes** — certains champs les demandent, d'autres
  non. Un champ de nature « référence à une variable » les gère lui-même :
  l'utilisateur n'en tape plus jamais.

---

## Le nom du client dans le produit

**40 occurrences de « Bayard » côté serveur**, dont un modèle Prisma
`BayardRegistry`. Un nom de client dans le schéma de données du produit.

| Niveau | Exemple | Traitement |
|---|---|---|
| Cosmétique | placeholder `Bayard Audio/En attente PAD` | exemple générique |
| Interne | `_bayardIdFor()` | renommer — `_externalIdFor()` |
| **Structurel** | modèle `BayardRegistry` | renommer — `ExternalIdRegistry`, migration |

**Ce que ça dit du Builder** : le champ ne s'appelle pas `BayardID` dans le
Core. Il s'appelle « identifiant externe », et `BayardID` est le nom que le
**paquet Iconik de ce client** lui donne. C'est la séparation Core / façade
appliquée au vocabulaire — et c'est parce qu'elle n'existait pas que le nom a
fui dans le produit.

---

## Architecture du chantier

**Pas de branche longue.** Les `git am`, `--skip` et commits perdus de la
semaine rendent une branche de plusieurs mois trop risquée.

**Coexistence dans `main`** : un dossier `builder/` à côté de `workflow/`,
`viewer/`, `settings/`. La structure s'y prête déjà.

**Règle de protection** : le Builder n'écrit jamais dans `workflow/`. Sur ce qui
est partagé — moteur, Prisma, connexions — il **ajoute**, ne modifie pas.

**Pont d'exécution** : le Builder produit le format pivot ; un convertisseur
pivot → WFD permet au moteur existant de l'exécuter sans y toucher. Le jour où
le moteur lira le pivot nativement, ce sera un choix, pas une contrainte.

**WFD ne sera pas détruit.** Le coût de le garder est proche de zéro s'il n'est
jamais touché, et Bayard peut relancer quelque chose. Il mourra quand plus aucun
workflow n'y aura été construit depuis six mois.

**À partir de maintenant : WFD ne reçoit plus que des correctifs bloquants.**
Toute amélioration va dans le Builder.

---

## Sujets concomitants

Plusieurs chantiers qu'on croyait indépendants se sont révélés liés. À ne pas
traiter séparément :

**Boucle ↔ Packager.** 40 % de PUBLISH est une boucle par type de média. Le
packager absorbe le cas d'usage ; traiter la boucle seule reviendrait à
perfectionner un contournement.

**Packager ↔ Vérificateur.** Une fois le manifeste posé, `Verify` devient
« valider contre le manifeste » plutôt que N contrôles écrits à la main. Les
quatre Vérificateurs actuels et leurs artworks énumérés un par un sont une
conséquence de l'absence de manifeste.

**Sélecteur de variables ↔ Page Recherche.** Les deux ont besoin d'un **objet de
test** pour évaluer des critères contenant `{collection.id}`. Même mécanisme,
à construire une fois.

**Panneau ↔ Générateur de documentation.** La déclaration des champs alimente
les deux. Les écrire séparément, c'est se condamner à les désynchroniser — ce
qui est déjà arrivé.

**Import de spec ↔ Sélecteur de variables.** Un workflow neuf n'a pas de run,
donc pas d'échantillon. La spec fournit la forme de la réponse en attendant le
premier run réel.

**Propagation d'erreur ↔ Modèle de données.** Une erreur qui traverse est une
donnée qui traverse. La première ne peut pas se définir avant le second.


---

## Suite de la revue — l'après-midi

### Le critère qui a tout réorganisé

Formulé par Farid après que j'ai célébré « 30 nœuds → 1 » comme une victoire :

> Le nombre de nœuds n'est un problème que lorsque la lecture n'a aucun sens.
> Je préfère 10 nœuds qui montrent bien les étapes que 5 qui cumulent un
> paramétrage en mode diplômé de polytechnique. Le mot clé est visibilité et
> compréhension narrative.

**Règle retenue : on ne fusionne que ce qui raconte la même chose.** Le partage
de code n'est pas une raison — il se règle dans l'implémentation, pas dans le
catalogue.

Appliqué aux décisions du matin, il en a annulé deux :

- **`Verify` et `Wait` se reséparent.** Ils partagent 80 % de leur code, mais
  « vérifie » et « attends que » ne racontent pas la même chose. Une case à
  cocher qui transforme un contrôle en attente de dix minutes cache le sens.
- **`Transform` revient.** Les fonctions inline (`{slug(x)}`, `{pad(x,2)}`) font
  le travail mais sont **invisibles sur le canevas**. Une normalisation de nom
  fait partie de l'histoire du workflow.

Il en a confirmé une : retirer les modes `foreach` et `verify` de
`HTTP Request`.

Et il a corrigé une erreur de ma proposition sur les erreurs : j'avais fait
disparaître la notification en la transformant en réglage. **Elle reste un
réglage, mais s'affiche sur le canevas** comme une étape terminale.

### Catalogue arrêté

**12 Core en service**

```
Trigger · Decision · Loop · Verify · Wait · Set Variable
Transform · Lookup · HTTP Request · HTTP Sequence · History · Deliver
```

**5 déclarés, hors première coupe** — QC, Script, Delay, Approval, Call
Workflow. Ils entreront quand un besoin se présentera.

**6 façades** — Search, Fetch, Set Metadata, Action, Create Tree, S3.
**2 services** — registre d'identifiants externes, compteur d'ordre.
**1 ressource** — le manifeste de livraison.

**Règle d'entrée** : un nœud entre au catalogue quand il sert. Le workflow VOD
Factory reconstruit dans le Builder servira de test.

### Les déclarations

Les 6 façades et les 12 Core ont été déclarés dans un format unique : libellé,
aide, nature de chaque champ, valeur par défaut, comportement si vide, et pour
les façades la manière dont elles se déplient en appel HTTP.

Trois choses apparues en les écrivant :

- **`Fetch` porte 23 champs** pour lire les métadonnées d'un objet. Cinq
  suffisent. Accumulation typique d'un développement au fil de l'eau.
- **`Action` affiche `assetId`, `fileName`, `overwrite`, `createFolderAsset`**
  quelles que soient ses 85 opérations. Le panneau montre tout, tout le temps —
  d'où la déclaration imbriquée, une par opération.
- **`upsert` remonte en champ visible.** Le 422→PUT était appliqué
  automatiquement par le moteur, sans que rien ne le dise. Il devient
  « Créer ou mettre à jour ».

Et une troisième fuite de présentation, après `pageBreakBefore` et les
positions : **`lookup` stocke `lkActiveTab`, `lkApiFolded`, `lkSourceFolded`** —
l'état de pliage de l'interface, dans la configuration métier.

### Le manifeste — un seul, pas quatre

Proposition de Farid : s'appuyer sur la mécanique des blocs liés plutôt que
d'ajouter un concept. Validée, avec une correction sur les ports.

**Chaque composant porte deux jeux de critères**, dans le même langage :

```
season_box_art
  s'applique si   TypeCollection  est  Saison
  trouvé par      dans la collection · titre contient _season
```

Le premier dit **quand** le composant compte, le second **où** le trouver.
L'opérateur `in_list` existe déjà, donc `cover_art` s'écrit
`TypeCollection dans [Série, Saison, Unitaire]`.

Les quatre manifestes envisagés le matin se replient en un, sans colonne
conditionnelle ni héritage.

**Sur les ports** — écartés. Un port route un flux ; ici on sélectionne des
composants, et le résultat reste une livraison. Des ports réintroduiraient les
quatre branches qu'on cherche à supprimer. La variable par composant, en
revanche, est nécessaire : c'est le `produces`.

### Le chemin de destination — quatre chemins, une règle

Vérification faite sur la configuration réelle. Les quatre chemins S3 :

| Branche | Chemin |
|---|---|
| Série | `{Univers}_{BayardID}` |
| Saison | `{Univers}_{BayardID}` / `{title}_{BayardID}` |
| Épisode | `{Univers}_{BayardID}` / `{title}_{BayardID}` / `{title}` |
| Unitaire | `{title}` |

C'est **la chaîne des ancêtres**, chaque niveau contribuant un segment dont le
format dépend du type de collection — pas de la branche :

```
segments par niveau
  Série      {Univers}_{BayardID}
  Saison     {title}_{BayardID}
  Épisode    {title}
  Unitaire   {title}
```

Quatre lignes au lieu de quatre chemins écrits à la main avec des noms de
variables différents. Le chemin Épisode utilisait `{saisonData.ParentID}` pour
remonter au `BayardID` de la série — détour né du fait que la branche n'avait
récupéré que la saison. `Deliver` remontant la hiérarchie lui-même, cinq
variables disparaissent : `serieData`, `saisonData`, `collectionData`,
`saisonInfo`, `collectionCheck`.

### Deux sources possibles pour un composant

Point soulevé par Farid : dans la première version, les artworks étaient des
**fichiers attachés à l'asset**, déposés par le panneau File.

Le changement de méthode vient d'une contrainte en cascade :

```
VOD Factory impose une hiérarchie
  → Série et Saison deviennent des collections Iconik
    → une collection ne peut pas porter de fichiers
      → les artworks doivent être des assets
        → une seule procédure pour l'utilisateur
```

Vérifié dans l'API : assets, collections, segments et formats sont
**recherchables** ; les fichiers sont **navigables** — on descend depuis
l'asset.

Le manifeste porte donc les deux sources, et `appliesTo` (collection ou asset)
conditionne celles qui sont autorisées. Une collection ne pouvant pas porter de
fichiers, le mode « fichiers de l'objet » se grise tout seul. La contrainte
Iconik devient visible à la saisie plutôt qu'en production.

---

## PUBLISH démonté — le test de l'ensemble

Confronté à la configuration réelle des 76 nœuds.

| Aujourd'hui | Devient |
|---|---|
| 17 Recherches | 2 Verify · le reste absorbé par le manifeste et la hiérarchie |
| 6 Export + 6 Attendre + 6 S3 + 6 Boucles | **1 Deliver** |
| 7 Décisions | 1 — l'aiguillage par type disparaît |
| 4 Vérificateurs | 1 Verify, paramétré par le manifeste |
| 3 Fetch | 1 — les ancêtres se résolvent seuls |
| 9 Set Metadata + 8 History | 2 + le réglage d'erreur |
| Générateur d'ID + sa Décision | 1 appel au service |

**Résultat — dix étapes :**

```
Trigger · Fetch · Verify · Deliver · Set Metadata · Lookup
HTTP Sequence · Verify · Set Metadata · History
⚠ en cas d'erreur : statut Echoué · historique · Slack
```

Elles se lisent comme une phrase : *je récupère, je vérifie, je livre,
j'enregistre, je traduis, je publie, je constate, je note.*

### La séquence HTTP — même motif que les boucles

Sept étapes qui racontent trois choses : **cinq appels `POST /api/persons`
identiques**, ne différant que par le rôle — director, actor, creator, writer,
producer.

Et les cinq rôles sont **déjà déclarés dans la table de correspondance**
(`Realisateur → persons[job=director]`…). Les recopier en cinq étapes répète une
information qui existe.

```
Publier chez VOD Factory
  1. Créer les personnes        les rôles déclarés dans la table
  2. Créer ou mettre à jour le contenu
  3. Créer ou mettre à jour la vidéo    si présente
```

« Créer les personnes » reste **visible** comme étape — on ne la fait pas
disparaître dans la table, on cesse de l'écrire cinq fois.

### Reliquats identifiés

- **`Bayard ID ?`** teste `is_empty` avec la valeur `{asset.metadata.PrimeID}` —
  métadonnée qui n'existe plus dans Iconik. Code mort.
- **`Fetch Saison Titre`** disparaît : le titre de la saison porte déjà le
  numéro (gabarit Viewer `Saison {NumeroSaison}`), et la remontée de hiérarchie
  le fournit. La mécanique de numérotation reste dans `Create Tree`.

---

## Versionnement

**Aucun aujourd'hui.** `Flow` porte `nodes` et `connections` directement ; un
enregistrement écrase. Et `upsertFlux` replanifie immédiatement — corriger
STATUSES à 1h59 et enregistrer à moitié le fait tourner à 2h00.

Trois conséquences, dont une qui touche le positionnement d'Askida :

- éditer un workflow actif, c'est modifier la production
- aucun retour arrière
- **la documentation ment** — le docx généré la semaine dernière décrit un
  workflow qui a changé depuis. « Ce que je vous livre est non questionnable »
  suppose que le document et le workflow soient la même chose.

De même, un run référence un `flowId`, pas une version : impossible de savoir ce
qui a réellement tourné.

**Décision — brouillon / publié**

| | |
|---|---|
| Brouillon | ce qu'on édite, écrasé à chaque enregistrement |
| Publier | geste explicite, crée une version figée |
| Production | exécute la dernière version publiée, jamais le brouillon |

Un **run** enregistre la version exécutée. Un **export** enregistre la version
décrite — le docx porte « version 7 », et c'est un fait. Le retour arrière
devient : republier la version précédente.

Toutes les versions publiées sont conservées : un workflow de 76 nœuds pèse
environ 200 Ko.

---

## Le canevas

### Deux principes de Farid, qui donnent l'algorithme

> Un workflow qui ne peut pas se représenter avec des connexions en angle droit
> est « bordélique ».

> Je lis un workflow comme un livre : d'où ça vient, comment c'est venu,
> qu'est-ce qu'on fait, où ça va.

La lecture « comme un livre » correspond exactement aux catégories sémantiques —
Trigger, puis lectures et transformations, puis actions, puis journalisation. Un
placement qui suit le sens du flux produit cette lecture sans effort.

Et le critère de l'angle droit est plus fort qu'il n'y paraît : un routage
orthogonal propre n'est possible que si le graphe a peu de croisements.
**L'intuition esthétique mesure en fait le couplage du workflow.**

### Décisions

- **Disposition en couches** — rang par distance au déclencheur, ordre calculé
  pour minimiser les croisements. C'est ce que le `Tidy` actuel ne fait pas : il
  ordonne sans regarder les liaisons, d'où un résultat que Farid n'ose pas
  appliquer sur PUBLISH.
- **Routage orthogonal**, avec points de passage évitant les nœuds.
- **Placement manuel conservé** — le rangement est une proposition qu'on accepte
  ou annule, jamais une réécriture silencieuse.
- **Le nombre de croisements devient un indicateur affiché.** Pas un blocage :
  *« 14 croisements — ce workflow est difficile à lire »*. La règle du
  « bordélique », rendue mesurable.

L'algorithme de couches ne sera pas réécrit : `bpmn-auto-layout` l'implémente
sous Apache 2.0.

### Interface

Canevas au centre, panneaux sur les côtés — mais **des étiquettes de bord** qui
révèlent le bon panneau, à la place du bandeau surchargé de boutons.

---

## Cloisonnement et déclencheurs

Le modèle existe déjà en base et il est complet :

```
Organisation  →  Environment (plateforme + prod/qa/dev)  →  Flow
                 Project     →  Permission (user, resource, niveau)
```

**Rien ne l'applique.** `flows.findMany({ where: { envId } })` avec l'environnement
marqué par défaut — pas de `req.user`, aucun contrôle, aucune authentification
dans le projet. Cohérent pour un prototype mono-utilisateur, plus du tout dès
que le Builder sert à plusieurs.

**Conséquence pour les déclencheurs** : l'environnement porte déjà la
plateforme. Un workflow dans un environnement Iconik propose les déclencheurs
Iconik ; un workflow Pulse It proposera ceux d'Embrace. **L'utilisateur ne
choisit pas la plateforme, elle découle de l'environnement** — le paquet est
sélectionné par le contexte, pas par un champ.

**L'authentification est une couche APS, en amont du Builder** : elle gérera
l'accès à la documentation, aux workspaces, aux workflows, aux connexions et aux
environnements. Le Builder consomme le cloisonnement, il ne le décide pas.

---

## Les trois critères de conception

Dégagés en chemin, et ce sont eux qui ont servi à trancher :

1. **On ne fusionne que ce qui raconte la même chose.** Le partage de code n'est
   pas une raison.
2. **Si c'est déductible, ce n'est pas stocké.** La portabilité et le caractère
   destructif se calculent ; les écrire dans le pivot garantirait qu'ils
   dérivent.
3. **Un nœud qui ne peut pas résumer ce qu'il fait en quelques lignes cache
   quelque chose.** Soit la ressource externe est trop riche, soit le nœud fait
   trop.

Le troisième est né d'une inquiétude de Farid — *« ça commence à faire peur, on
rejoint Vantage où beaucoup de choses sont faites hors designer »*. Le critère
qui distingue : **la chose extérieure change-t-elle ce que le workflow fait, ou
seulement comment on le construit ?** Le contexte de test ne change rien à
l'exécution ; le manifeste et le modèle d'arborescence, si. D'où la parade : le
nœud affiche **le contenu**, pas la référence.

---

## Opérations destructives

Relevé en inventoriant `Action` : `asset_delete`, `collection_delete`,
`format_delete`, `acl_remove` existent déjà, et **rien ne les distingue de
`collection_create`**. Même nœud, même liste déroulante, aucun avertissement.

Un workflow de purge est, selon Farid, *« très sensible et peut occasionner des
incidents critiques »*.

**Décisions**

- Le **caractère destructif est déclaré par la façade**, pas par l'utilisateur —
  propriété transversale, comme la portabilité.
- **Garde de cardinalité** : *« refuser si plus de N objets correspondent »*. Un
  filtre trop large ne détruit pas, il s'arrête. C'est le même champ que la
  cardinalité du manifeste.
- L'**exécution à blanc** attendra : la page Recherche montre déjà ce qui
  correspond. Elle deviendra utile quand plusieurs étapes précéderont la
  suppression.

---

## Le contexte de test

Le mécanisme existe déjà, enfermé dans le nœud Trigger : neuf gabarits de
payload, un éditeur JSON, et l'exécution réelle du flux.

Deux limites : **il exécute vraiment**, et il n'est disponible ni au sélecteur
de variables ni à la page Recherche.

**Décision** : le sortir du nœud et en faire un **contexte de conception**
attaché au workflow — un objet réel, choisi une fois.

```
Contexte de test
  Collection   [ Ernest et Célestine — S01E03 ]  ⟲
```

Trois usages : le sélecteur affiche les valeurs réelles même sans run ; la page
Recherche évalue `{collection.id}` et rend vraie la validation immédiate du
manifeste ; le test du déclencheur préremplit son payload.

Il résout les étapes de **lecture**. Pour les **écritures**, trois sources par
ordre de préférence — un run réel, le contexte de test, la spec — et le
sélecteur dit laquelle il a utilisée, parce qu'une valeur venant d'une spec n'a
pas le même statut qu'une valeur observée.

---

## Famille ouverte — les opérations média

Soulevée par Farid à propos du transcodage et du montage broadcast :
dérusher, faire un subclip, consolider, purger la source.

Aucun nœud actuel ne fabrique un asset à partir d'un extrait. Ce n'est ni un
appel HTTP ni une façade — c'est une opération sur le média lui-même, et elle a
un point commun avec le packager : les deux manipulent des essences plutôt que
des données.

À vérifier : Iconik expose `time_start` / `time_end` sur les segments (APS en
crée déjà). Reste à confirmer ce que renvoie un GET pour savoir si les mark
in/out sont exploitables sans passer par la contrainte des segments dans
l'interface.

```bash
curl -s "http://localhost:3000/api/iconik/qa/API/assets/v1/assets/{ID}/segments/" | python3 -m json.tool
```

---

## Ordre de construction retenu

Le modèle de données conditionne la propagation d'erreur, qui conditionne le
catalogue. Le packager conditionne la boucle et le Vérificateur. Le catalogue
conditionne le panneau.

1. **Format pivot** — avec le champ `version`
2. **Paquet Iconik** — les 6 façades déclarées, avec leur dépliage
3. **Convertisseur pivot → WFD** — pour que le Builder soit exécutable dès le
   premier jour sans toucher au moteur
4. **Sélecteur de variables** — lecteur des instantanés déjà persistés
5. **Packager** — manifeste sur la mécanique des blocs
6. **Panneau déclaratif** — 9 natures pour 236 champs
7. **Canevas** — couches, orthogonal, placement manuel conservé

---

## Décisions en suspens

Les cinq décisions ouvertes en début d'après-midi ont toutes été tranchées :

| | Tranchée |
|---|---|
| Les six coquilles vides | n'entrent au catalogue que lorsqu'un besoin se présente |
| Les modes `foreach` et `verify` de `HTTP Request` | retirés — ils cachent le sens |
| Présélection ou nœud pour les 85 opérations | un nœud `Action`, sélecteur à deux niveaux (objet puis opération), raccourcis de palette pour les courantes |
| `Delay` vs `Wait` | `Delay` pour la temporisation, `Wait` pour l'attente conditionnelle — deux nœuds, deux histoires |
| `Transcode` | reporté dans la **famille média** à concevoir : transcodage, subclip, consolidation, purge |

**Reste ouvert**

- **Le manifeste : une ressource ou plusieurs ?** Un seul manifeste couvre les
  quatre niveaux grâce aux critères d'applicabilité. À éprouver en le
  construisant — c'est le premier test du Builder.
- **Les mark in/out des segments** — à confirmer par un GET.

## Bugs et dettes relevés

**Corrigés aujourd'hui**

- Blocs de code dupliqués dans `script-workflow-word.js` et `wfd-api-ops.js` —
  683 lignes mortes
- Marges d'en-tête du docx — le contenu touchait le filet

**Ouverts**

- **Deux plists cloudflared coexistent** — `com.cloudflare.cloudflared.plist` et
  `homebrew.mxcl.cloudflared.plist`. Possiblement deux tunnels sur la même
  configuration. À vérifier.
- **Les logs n'ont pas de rotation** — `~/Library/Logs/aps.log` grossira
  indéfiniment.
- **Le volume des instantanés de run** — un contexte complet par nœud, 76 nœuds,
  500 runs. À mesurer avant de s'en inquiéter.
- **Le Vérificateur ne journalise pas ses URL** — c'est ce qui a rendu le
  diagnostic des 404 plus long qu'il n'aurait dû. Même angle mort que la
  Décision, corrigé pour elle mais pas pour lui.
- **Huit types d'événement de déclencheur sur neuf n'ont jamais tourné.** Farid
  a tranché : on les garde, le déclencheur sera le nœud le plus itéré et
  personnalisé.
- **Boîte à bugs WFD** — Search 2 cases seulement, Lookup non réordonnable, pan
  lent, tri alphabétique cassé, sémantique Boucle illisible, animation
  s'arrêtant après la boucle. **Ne recevront plus de correctif** sauf blocage.

**Non testé**

- **STATUSES n'a jamais fait de run nocturne complet.** Coupure réseau la nuit
  du 22, et le timer n'était pas planifié avant le correctif d'hier. Le premier
  vrai run est celui de cette nuit — à vérifier demain matin :

```bash
grep -E "CHECKER|StatutPublication" ~/Library/Logs/aps.log | tail -20
```

Attendu : `parent_not_sent` en tête du résumé, donc une sortie en **Reporté** et
un statut qui reste à `Posté`.

---

## Contexte externe

**Switch est écarté** pour porter la chaîne Bayard — leur ingénieur l'a jugée
trop lourde à reconstruire. Bayard a ensuite évoqué Dataiku, Kong et Make, tous
déjà sous licence chez eux.

Analyse : aucun de leurs outils ne peut porter cette chaîne. Kong est une
passerelle d'API, Dataiku raisonne en jeux de données, Make est un SaaS dont on
ne sort qu'au prix d'une migration. Ce qu'ils expriment ressemble moins à un
choix technique qu'à une inquiétude sur la pérennité — qui ne se résout pas en
déplaçant le code, mais par un transfert crédible.

**Embrace veut importer les workflows APS** pour Pulse It. Signe que la
représentation a une valeur indépendamment de l'outil qui l'a produite — c'est
la définition d'un format pivot.

**BPMN a été éprouvé** hier soir comme quatrième cible : 76 % de la sémantique
se projette nativement, 21 % s'approxime, 2 % devient service. Le format est une
norme, pas un produit ; `bpmn-js` (Apache 2.0) fournit le rendu et pourrait
débloquer à la fois le schéma du docx et le générateur de diagramme du Viewer.

---

## Prochaines étapes

**Immédiat**

1. Vérifier le run nocturne de STATUSES
2. Consigner les décisions de cette session dans `methode-travail-aps.md`

**Chantier Builder**

Voir « Ordre de construction retenu » plus haut — sept étapes, du format pivot
au canevas.

**Hors Builder**

- Outil de réinitialisation des compteurs
- Extension Chrome — vue par niveau (limitation Iconik documentée)
- Document utilisateur de livraison — partie administrateur rédigée le 22,
  reste la partie utilisateur et les captures
- Synchro — dette connue, non traitée
