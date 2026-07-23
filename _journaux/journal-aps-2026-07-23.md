# Journal APS — 23 juillet 2026

> Récit de la session. État technique → `cartographie-wfd`. Processus → `methode-travail`.

## Vue d'ensemble

Matinée de consolidation — LaunchAgent, correctifs de documentation restés en
suspens de la veille — puis une **longue session de conception du Workflow
Builder** qui a occupé tout l'après-midi.

Cette seconde partie est fondatrice : elle a produit l'inventaire complet des
40 nœuds de WFD, le classement Core / façade / service, et six décisions
d'architecture qui contraignent tout ce qui suivra. Elle a aussi fait remonter
plusieurs sujets qu'on croyait indépendants et qui ne le sont pas.

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

## Décisions en suspens

À trancher avant de figer le catalogue :

1. **Les six coquilles vides** — Call Workflow, Approval, Export, Publish, le
   throttle de `gate`, les trois canaux de `Notify`. Implémenter ou ne pas
   porter ?
2. **`Transcode`** — façade Iconik dans le code, Core FFmpeg dans l'intention.
   Deux nœuds différents, ou un seul à choisir ?
3. **Les modes en trop de `http_request`** — retirer `foreach` et `verify`, ou
   assumer trois nœuds qui vérifient et deux qui itèrent ?
4. **Présélection ou nœud ?** `create_col` est une ligne de code mais un nœud à
   part entière dans la palette. 85 opérations Iconik : 85 nœuds, ou un nœud
   avec une liste ?
5. **`Delay` vs `Wait`** — éviter l'ambiguïté avec le mode `until` de `Verify`.
   À figer avec le reste du vocabulaire anglais.

---

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

**Chantier Builder — ordre retenu**

Le modèle de données conditionne la propagation d'erreur, qui conditionne le
catalogue. Le packager conditionne la boucle et le Vérificateur.

1. Format pivot — portée des boucles ✅, identifiants propres ✅, intention
   métier ⚠ (27/76 descriptions remplies)
2. Sélecteur de variables — lecteur des instantanés existants
3. Packager — manifeste sur la mécanique des blocs
4. Panneau déclaratif
5. Catalogue figé, en anglais

**Hors Builder**

- Outil de réinitialisation des compteurs
- Extension Chrome — vue par niveau (limitation Iconik documentée)
- Document utilisateur de livraison — partie administrateur rédigée le 22,
  reste la partie utilisateur et les captures
- Synchro — dette connue, non traitée
