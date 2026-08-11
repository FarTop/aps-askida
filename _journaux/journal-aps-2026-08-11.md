# Journal APS — 2026-08-11

> Journée d'émission. Le matin, les modules Make cessent d'être des coquilles :
> le corps des requêtes s'extrait des handlers. L'après-midi, l'écran qui
> manquait — l'onglet **Interpreter**, qui montre ce qu'un workflow deviendrait
> chez une cible. Le soir, les ressources d'APS partent vivre chez Make. Seize
> commits, et trois bugs de fond trouvés en regardant l'écran plutôt que le JSON.

## Matin — le corps des requêtes

Hier soir j'avais conclu trop vite : les 11 modules déclaraient leurs champs et
leurs sorties, mais l'`api` poussée ne portait que l'URL et la méthode.
`iconikSearch` avait ses 8 paramètres et **postait à vide**.

Le corps s'extrait, parce que les handlers l'écrivent en clair sur un motif
régulier — `title: r(p.title || '{asset.id}', ctx)`. **36 corps lus, 76 champs,
70 dérivables (92 %)**. Les six autres sont du vrai calcul.

J'avais d'abord annoncé 95 %, et de la pire façon : ma regex de chaîne acceptait
`'parent_id:"' + parentIconikId + '"'` comme une constante, parce que ça commence
et finit par une apostrophe. **Make a donc reçu le code source d'une
concaténation comme valeur de champ.** Une valeur fausse est pire qu'une valeur
absente — c'est le principe que j'avais écrit et que mon extracteur violait.

Deuxième correction du même ordre : je remplaçais chaque `{…}` d'URL par
`{{parameters.id}}` faute de mieux, soit un `PATCH` sur le mauvais objet. Le
handler écrit `${aid}` et `aid` vient de `p.assetId` — l'information était dans
le code. **22 segments sur 22** résolus.

### Deux formes de multi-requêtes

Make accepte un **tableau** d'`api`, chacune avec sa `condition`. Mais deux
formes s'y cachent, et les confondre coûtait deux appels sur trois à
`create_tree` :

```
alternatives   chaque requête porte la branche de `switch` qui la produit
               (`cas`). Une seule s'exécute. iconik.action : 31 branches.
séquence       aucune ne porte de branche : elles s'enchaînent toutes.
               create_tree : chercher, créer, écrire.
```

La mesure le disait déjà ; le rendu l'ignorait. Relu chez Make : 3 « en suite »,
31 « conditionnée ».

## Après-midi — l'onglet Interpreter

### Trois vues par workflow

Le centre du header portait l'organisation ; il porte maintenant **Builder /
Designer / Interpreter**. L'organisation descend sous le fil d'Ariane, où elle
est à sa place. Les vues ne ressemblent pas aux onglets de volet — deux barres
d'onglets qui se ressemblent se confondent.

### Ce que l'Interpreter montre

Un plan au sens de `terraform plan` : on lit, on approuve, on soumet ensuite.
La correspondance n'est pas réécrite — la route `require` `rendre-make.js`,
seul endroit où elle est décidée.

Sur **BAYARD | PUBLISH | VODFACTORY** : 28 étapes, 13 traduites, 15 dégradées,
0 bloquante, **2 scénarios**.

Cinq présentations ont été construites pour trancher sur pièces (Carte, Graphe,
Colonnes, Liste, Plan), puis quatre retirées. Il reste **une vue à deux
échelles** : deux cartes face à face en haut, le détail ligne à ligne en bas, et
le survol qui relie les trois endroits d'un coup.

Ce que le Graphe a laissé en héritage : le **vocabulaire de forme**. La
différence entre les deux architectures n'est pas le nom des étapes, c'est que
APS est un GRAPHE (des ports, des arêtes qui portent un sens) et Make une
CHAÎNE (un embranchement demande un Router, une erreur est une pièce accrochée
au module). D'où un chiffre que personne n'avait : **20 étapes sur 28 portent un
port d'erreur**, soit autant de gestionnaires à accrocher un par un.

### Le statut d'un écart

Vingt-deux écarts du même orange laissaient croire à vingt-deux obstacles. Il y
en a deux.

```
16  à câbler    ressources d'org — la réponse existe : les Data Stores
 4  à relire    la limite est NOTRE analyse, pas la cible
 2  à trancher  les trois discriminants d'iconik.fetch — le verbe en fait trop
```

Et une phrase de l'écran qui mentait : `query` et `metadata_values` étaient
annoncés « non traduisibles ». C'est faux — une concaténation s'exprime très
bien chez Make. Ce qui a échoué est l'extracteur. « Notre analyse n'a pas su
extraire » et « ça ne se traduit pas » ne sont pas la même phrase.

### Les post-its partent aussi

`POST /scenarios/{id}/notes` accepte `{content, moduleIds}` — une note
**accrochée à des modules**. Reste à savoir à quel nœud : le canevas le dit
tout seul, un post-it partage l'abscisse de son nœud et se pose dessous. **26
post-its, 24 rattachés, 2 orphelins** — et les orphelins sont comptés.

C'est peut-être la fonction la plus utile de la journée : les post-its portent
le POURQUOI, et c'est la première chose qui se perd quand quelqu'un rebâtit
ailleurs.

## Trois bugs trouvés en regardant l'écran

**Publier n'enregistrait pas.** Le bouton appelait `/publish` sans sauver
d'abord : il figeait le document tel qu'il était EN BASE, pas à l'écran, et
annonçait un succès. On pouvait ajouter des nœuds, publier, obtenir une version
sans eux. Corrigé — « Publier » veut dire « fige ce que je vois ».

**L'Interpreter gardait son premier résultat** pour un couple (workflow, cible).
On éditait, on revenait, l'écran montrait l'état d'avant sans rien dire.

**L'ordre était celui de la création.** Un nœud ajouté se retrouvait en fin de
liste même s'il agit au sixième rang. Les étapes suivent maintenant le FLUX, et
les branches se visitent **de la plus courte à la plus longue** : une impasse se
lit près de son embranchement. Chaque étape porte son rang et sa provenance
(`← Programme ? · default`) — sans quoi deux nœuds de même libellé étaient
indiscernables.

Erreur de diagnostic à noter : j'ai d'abord conclu que les deux nœuds ajoutés
n'avaient jamais atteint la base, et annoncé à l'utilisateur qu'il devait tout
refaire. C'était faux — je comparais 28 à 28 sans avoir de chiffre d'avant.

## Soir — les ressources chez Make

11 ressources portées plus 124 lignes de registre.

```
APS — Ressources (177485)   1 manifeste · 1 correspondance · 1 séquence
                            d'endpoints · 8 gabarits
APS — Registre BayardID     124 lignes
```

**Un seul store pour quatre ressources**, contraint et assumé. L'offre plafonne
le stockage à 10 Mo et ce sont les RÉSERVATIONS qui le saturent, pas les
données : six stores occupent 31 Ko et toute création d'un store d'1 Mo est
refusée. Plutôt que de tout jeter dans un champ JSON, la structure déclare la
**réunion** des champs, avec un champ `type`. Chaque champ reste nommé.

Un gabarit d'arborescence reste opaque, et c'est structurel : il est récursif,
une structure Make est plate.

Non porté : les **connexions**. Elles portent un secret et Make a son propre
mécanisme.

Deux pièges d'API : `POST` et `PUT` n'ont pas le même corps sur un
enregistrement (le POST enveloppe, le PUT non), et le plafond de **60
requêtes/minute** coupait le portage du registre au tiers.

## Ce qui reste

**Le câblage des ressources.** Le transport est fait, la lecture non. Et il y a
une contrainte : une app custom ne peut PAS lire un Data Store depuis son `api`
— les Data Stores sont natifs Make. Le montage réel est donc *module Data Store
→ notre module*, avec la valeur mappée de l'un à l'autre. Ce câblage ne se joue
pas dans l'app custom mais dans le **scénario**.

**L'émetteur de scénarios.** C'est la grosse marche. Ce qu'on a construit
jusqu'ici est le DICTIONNAIRE (des verbes → des modules) ; un workflow demande
une PHRASE (des étapes → un scénario). `pivot-to-wfd.js` fait déjà exactement
ça en interne, vers une autre cible.

**Les trois discriminants d'`iconik.fetch`.** Aucun mécanisme de la cible ne
rendra ça lisible : c'est le verbe qui en fait trop, et ça se règle en amont.

**Et l'app de sonde** `apssonde28365-9782b8` porte tout le travail sous un nom
qui ne lui correspond plus. Le nom technique est figé à la création — seule une
app neuve en donnerait un propre, et le rendu étant idempotent, c'est une
commande.
