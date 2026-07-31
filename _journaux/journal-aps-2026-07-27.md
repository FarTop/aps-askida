# Journal APS — 27 juillet 2026

> Récit de la session. État technique → `builder-etat`. Processus → `methode-travail`.

## Vue d'ensemble

Session longue, ouverte vendredi et reprise lundi matin après le week-end. Elle
a construit le **cœur du Workflow Builder** : le format pivot, sa validation à
deux niveaux, le paquet Iconik, et le convertisseur qui retraduit un pivot en
WFD exécutable. Quatre patches livrés et mergés sur `main`. À la fin de la
journée, la chaîne `pivot → validation → WFD` est complète et cohérente de bout
en bout — reste à la prouver par une exécution réelle.

Le fil rouge de la session, découvert en chemin et vérifié trois fois : **le
pivot transcrit, il n'optimise pas.** Chaque tentative d'être malin — mutualiser
une étape, inventer une notation — a été démentie par ce que fait réellement la
production.

## Le format pivot — trois niveaux

La décision structurante, prise avant l'écriture : une étape se décrit sur trois
niveaux, et l'absence est signifiante.

```
core     http_request        universel, compilable partout
facade   iconik.action       vocabulaire de plateforme, sait se déplier
preset   collection_create   pré-sélection de champs
```

Un Core pur — une Décision, une Boucle — n'a ni `facade` ni `preset`. C'est ce
vide qui le déclare portable. Un nœud de plateforme ne peut pas se déguiser en
Core par omission : il se trahit par ce qu'il porte. `create_col` n'est jamais
un type de premier rang, à aucun moment — c'est un `preset` sur une `facade` sur
un `core`.

Le principe directeur : **le pivot ne stocke rien de déductible** (critère 2).
Ni les ports, ni la portabilité, ni le caractère destructif, ni les services
requis. Ces propriétés se calculent depuis le catalogue et la configuration. Les
écrire garantirait qu'elles divergent un jour de ce qu'elles décrivent.

Trois modules livrés (patch 1, `pivot-*`) :
- `pivot-schema.js` — le vocabulaire, source unique. Les 12 Core, les 5 déclarés
  hors coupe, les 3 ressources, les clés interdites.
- `pivot-validate.js` — la validation structurelle, indépendante du catalogue.
- `pivot-io.js` — lecture, écriture dans un ordre de clés stable (diffs
  lisibles), charpente de la projection vers la forme d'échange.

Éprouvé par deux transpositions manuelles de workflows réels — pas des patches,
de l'exploration : **PUBLISH V2** (76 nœuds → 10 étapes) et **STATUSES**
(11 → 7, corps de boucle imbriqué). Les deux passent, l'aller-retour
écriture/lecture est stable au caractère près.

## Trois arbitrages de conception

### La table de correspondance — troisième ressource

Elle était enfermée dans la configuration du nœud Lookup (`lkRows`), donc
recopiée à chaque usage. Elle remplit pourtant les trois critères d'une
ressource — nommée, réutilisable, éditée dans son écran — et l'argument décisif
est qu'elle sert **deux étapes** : Lookup la lit pour traduire, HTTP Sequence
s'appuie sur ce qu'elle produit.

### La présentation n'est pas versionnée

`presentation.versioned: false`. Déplacer un nœud n'est pas modifier un
workflow, et republier la version 5 ne doit pas faire perdre le rangement du
canevas. Conséquence assumée : un diagramme régénéré depuis une version ancienne
montre la disposition d'aujourd'hui, pas celle de l'époque.

### `set` sur arête — banni (patch 2)

Le seul cas qui semblait le réclamer était STATUSES : trois issues écrivant le
même champ, qu'une notation `set` sur l'arête aurait permis de mutualiser vers
une étape unique. **L'export réel a tranché contre l'invention** : pas de
convergence. Le workflow a quatre étapes terminales distinctes, une par issue,
chacune écrivant sa valeur en dur. Le format n'avait donc rien à ajouter. `set`
passe d'avertissement à erreur.

C'est la première des trois fois où la production a corrigé une tentative d'être
malin.

## Le paquet Iconik (patch 3)

Ce que le format seul ne peut trancher : les ports de chaque Core et le dépliage
de chaque façade. `pivot-catalog-iconik.js` les déclare — sans rien inventer,
en décrivant ce que `wfd-engine-handlers.js` exécute déjà (vérifié sur les six
flows et la table `WfdHandlers`, 33 familles).

Constat confirmé au passage : `aps_search`, la famille la plus fréquente
(20 usages), n'a pas de handler dédié — elle passe par `handleHttpRequest`. Donc
c'est bien une façade de `http_request`, pas un Core. Et un service s'invoque
comme une façade (`aps.registry`) : « façade » veut dire paquet de plateforme,
et APS en est une au même titre qu'Iconik.

La validation prend désormais un catalogue optionnel. Sans lui, elle reste
structurelle. Avec lui, deux contrôles de contenu s'ajoutent : la façade doit
être déclarée, et le port de départ d'une arête doit être un port réel de
l'étape source.

**Ce second niveau a immédiatement gagné sa place** : il a attrapé trois
incohérences dans les transpositions que le niveau 1 laissait passer — deux
ports `out` génériques là où Lookup et Search branchent, et le routage des
décisions. Sans lui, ces workflows auraient été déclarés valides puis auraient
échoué à l'exécution.

### Routage des décisions — choix B

Le pivot route par **libellé** (`Reporté`), lisible pour un designer ; c'est le
convertisseur qui rétablira la fidélité au moteur en traduisant chaque libellé
vers son index `out-N`. Règle notée pour l'étape 3 : un libellé porté par
plusieurs conditions (STATUSES a deux `Reporté`) se traduit en fan-out.

## Le convertisseur pivot → WFD (patch 4)

L'étape qui prouve le reste : si un pivot se retraduit en WFD que le moteur
exécute, le format n'a rien perdu. `pivot-to-wfd.js` régénère ce que le pivot ne
stocke pas — ports avec libellés et couleurs, positions, index numériques des
connexions — depuis le catalogue et la présentation.

Trois traductions non triviales, toutes vérifiées :
- **étape → nœud** : `core`/`facade` deviennent `family`, les ports sont
  régénérés. Le nœud `checker` produit est identique au format cible.
- **arête → connexion** : le port nommé (`fail`) redevient l'index positionnel
  (`fromPort: 1`) que le moteur route.
- **fan-out de décision** : l'arête pivot unique depuis `Reporté` produit bien
  **deux** connexions WFD (fromPort 0 et 2), comme la production.

Le corps de boucle imbriqué est aplati : la boucle ouvre son corps par le
port 0. La frontière que le pivot rendait structurelle — et vérifiait à la
lecture — ne peut donc pas être violée par l'aplatissement.

### La limite du jour, assumée

Pas d'aller-retour complet. On a prouvé que le WFD produit est structurellement
cohérent et exécutable, **pas qu'il est identique à l'original** : il n'existe
pas de convertisseur WFD → pivot, et les ids diffèrent. La preuve d'identité
demandera d'exécuter un WFD régénéré sur le moteur et de comparer le run à
l'original — donc le Mac Mini, pas le conteneur.

## Ce que la session a appris

**Le pivot transcrit, il n'optimise pas.** Trois fois, une tentative d'être
malin a été démentie par la production : la notation `@table.roles` (remplacée
par une variable ordinaire déjà produite par le Lookup), le `set` sur arête
(remplacé par des étapes terminales distinctes), la mutualisation de la décision
(remplacée par le fan-out réel). À chaque fois, la version fidèle était plus
longue et plus juste. Quand on comparera le pivot au comportement réel, on veut
qu'ils coïncident — une transcription maligne aurait introduit un écart à
débusquer.

**Le pivot rend structurel ce que le graphe plat calculait.** La portée d'un
corps de boucle était, dans WFD, une accessibilité à calculer (soustraire ce qui
suit la boucle de ce qu'elle ouvre). Dans le pivot, c'est une appartenance à
vérifier. Le convertisseur ré-aplatit, mais à partir d'une frontière déjà sûre.

## Suite

- **Renderer de canevas** (étape 4) — lire un pivot et le dessiner. La règle
  no-inline-style y devient structurante ; c'est là que le sort de l'amorce
  `workflow.html` (cassée lignes 125-129, trois styles inline) doit être tranché.
- **La preuve d'exécution** — convertir STATUSES, injecter le WFD régénéré,
  comparer le run à l'original. La démonstration que trois sessions cherchaient.
- **Étape 3 côté moteur** — la fusion `persons[job=…]` (deux cibles de même
  couple attribut/valeur doivent fusionner, pas s'empiler), portée par le
  résolveur du Builder et non par WFD.
