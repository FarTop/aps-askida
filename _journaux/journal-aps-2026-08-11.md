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

---

# Journal APS — 2026-08-11, seconde session

> Journée d'émission, suite. L'Interpreter apprend à dire si ça MARCHERA, pas
> seulement ce qu'il y a à faire. Trois verbes sans module deviennent des
> compositions, et donnent le vrai prix de la cible. Puis l'émetteur : d'un
> workflow APS à un scénario Make, créé, relu, exécuté chez eux. Neuf commits,
> une dizaine de règles de Make qu'aucune documentation ne donne, cinq
> hypothèses dont quatre fausses — et une trace permanente laissée par erreur.

## Les ressources portées se lisent dans le plan

Les 16 écarts « à câbler » de PUBLISH disaient tous la même chose — « APS n'est
pas là en production ». Faux depuis que les ressources vivent dans un Data
Store. Trois corrections, dont une qui n'était pas prévue.

**Un champ VIDE n'est pas un écart.** On lisait le schéma du VERBE, jamais la
configuration de l'ÉTAPE : `aws_s3.deliver` déclare un manifeste, donc les
trois Deliver en comptaient un — alors que deux n'en désignent aucun. Quatre
des huit `manifestId` portaient sur du vide. Même famille d'erreur que l'ordre
d'insertion pris pour un ordre de flux : une propriété du modèle prise pour une
propriété de l'objet.

**Une connexion n'est pas une donnée.** Elle porte un secret, elle n'a pas été
portée, et chez Make elle est native. Ce n'est pas du câblage mais un
provisionnement — d'où un cinquième statut.

**Le reste a une clé, et coûte des modules.** Une app custom ne peut pas lire un
Data Store depuis son `api` : la lecture se joue dans le scénario, en amont.
Mais pas une par étape — lue une fois, la valeur reste disponible en aval :
**3 lectures pour 6 références**, le même manifeste servant quatre étapes.

```
avant   13 traduites · 15 dégradées      16 à câbler
après   16 traduites · 12 dégradées       6 à câbler · 5 à provisionner
```

## Le verdict d'aptitude

L'écran répondait à « qu'est-ce que j'ai à faire » — la question de celui qui
exécute. Personne ne répondait à « est-ce que ça va marcher », celle de celui
qui décide.

Et il mentait sur ce point précis : **0 bloquantes annoncées, alors que trois
étapes n'avaient aucun module** — `Wait` figurait même parmi les « traduites ».
Le texte gris « aucun module » ne produisait aucun écart, donc ne comptait
nulle part. Un manque qui ne pèse rien est un manque qu'on ne verra pas.

Chaque écart porte désormais sa CONSÉQUENCE, déduite du statut et jamais
saisie : empêche d'écrire · empêche de tourner · fausse le résultat · n'empêche
rien. Le verdict prend le pire présent. « Fonctionnel » veut dire *produit le
bon résultat*, jamais *ne plante pas* : un scénario qui livre au mauvais endroit
sans lever d'erreur est pire qu'un qui s'arrête.

## Les compositions natives, et le prix de la cible

`wait`, `lookup` et `verify` n'ont aucun module. C'était vrai au sens strict et
faux au sens utile : ils s'écrivent en PLUSIEURS modules natifs. Vocabulaire
relevé dans leurs scénarios — **72 blueprints, 48 modules natifs distincts** —
jamais dans une documentation.

**La leçon de `BAYAM | PUB | EXPORT+WAIT`.** Les collègues avaient déjà résolu
l'attente à la main, et leur solution dit ce que la cible impose : Make n'a pas
de boucle conditionnelle, donc un sondage ne boucle pas, **il se déroule**.
Huit essais imbriqués — http, Router à 3 routes, Sleep — avec un back-off écrit
à la main (20, 45, 90, 180, puis 300).

D'où un chiffre que personne n'avait : **PUBLISH coûte 91 modules pour 28
étapes**, dont 59 pour la seule attente. Ce n'est pas une inefficacité de notre
rendu, c'est le prix de la cible — et c'est exactement ce qui inquiète les
collègues sur la consommation de crédits.

Ma suggestion de la veille — « wait → `util:FunctionSleep` » — ignorait que
`wait` sonde jusqu'à une condition. Une sieste n'est pas un sondage.

## L'émetteur

Jusqu'ici tout était un DICTIONNAIRE : un verbe → un module, une ressource →
une clé. Un dictionnaire ne fait pas une phrase.

**Mesuré** : les deux scénarios de PUBLISH créés chez la cible, 52/52 et 66/66
modules relus, 24 post-its posés, 22 modules d'app portant leur connexion, 21
portant leur configuration.

Trois traductions de forme, là où un graphe devient une chaîne : plusieurs ports
→ un Router dont chaque route CONTIENT sa suite ; un port d'erreur → `onerror`,
une pièce accrochée au module ; une étape que deux branches partagent → un
jalon, parce que Make ne sait pas la partager.

Deux erreurs de ma part, corrigées. Je traitais les gestionnaires d'erreur avant
le chemin nominal : `out` et `error` visant souvent la même étape, la branche
d'erreur se l'appropriait et **tout le chemin heureux finissait imbriqué sous
« sur erreur »**. Et mon contrôle de relecture comparait `flow.length` — le
premier niveau — au total émis : « 5/5 gardés » sur un scénario de 65 modules.
Un contrôle qui affiche toujours vert est pire qu'aucun contrôle.

## Ce que Make ne dit nulle part

Chaque ligne a coûté un aller-retour, et aucune ne se déduisait.

```
app#<nom>:<module>        un module d'app custom porte ce préfixe. Huit
                          variantes essayées à l'aveugle, dont `app:` — à un
                          caractère près. Ce qui a tranché : un scénario posé
                          À LA MAIN dans l'éditeur, puis relu par l'API.
parameters, pas mapper    la config d'un module d'app y vit ; les natifs font
                          l'inverse, et j'appliquais leur règle à tous.
version par module        `http:ActionSendData` est en 3. Poser 1 partout
                          rendait un module sur trois introuvable.
routes : flow SEUL        ni `metadata` ni `filter` à la création. Le nom du
                          port va donc dans le premier module de la branche.
appId / token             refusés EN SILENCE par POST /connections, qui les
                          consomme comme des champs à lui. La connexion se
                          créait, rendait `verified: true`, et n'avait aucune
                          donnée. Renommés `iconikAppId` / `iconikToken`.
Authorization du gabarit  Make pose `Bearer {{connection.apiKey}}` ; sans
                          apiKey l'en-tête part vide et Iconik rend 401 MÊME
                          avec App-ID et Auth-Token corrects. Le PATCH d'une
                          base FUSIONNE : il faut viser `Authorization: null`.
connexion d'un RPC        posée à la CRÉATION seulement — PATCH rend 200 et ne
                          stocke rien. Un RPC sans elle est appelé sans
                          connexion par l'éditeur.
data.__IMTCONN__          c'est là que voyage la connexion d'un appel de RPC.
?confirmed=true           installer une app pour toute l'organisation ne se
                          fait pas dans notre dos. Make a raison.
feeder d'un agrégateur    un agrégateur doit désigner l'itérateur qu'il
                          referme, sinon l'éditeur refuse d'enregistrer.
403 passager              « apps edit » est tombé au milieu d'un rendu et
                          revenu quelques secondes après.
public irréversible       une app publiée ne redevient jamais privée, et ne se
                          supprime pas.
```

## Ce qui reste bloqué, et ce que ça coûte

**Les listes déroulantes alimentées par un RPC échouent dans l'éditeur.** Il
appelle le RPC sans transmettre de connexion — corps de 38 octets, aucune query
string. Tout le reste est vérifié : la connexion est dans le module, le module
pointe le bon RPC, le RPC déclare sa connexion, la base est juste, et l'appel
direct rend 200 avec la liste complète.

Cinq hypothèses, quatre écartées par la mesure : la connexion créée par API
(une connexion faite à la main échoue pareil), l'histoire de la première app
(une app neuve se comporte à l'identique), son installation, la déclaration du
RPC. La cinquième — la façon dont l'éditeur décide d'attacher une connexion —
reste ouverte.

**Ça ne bloque ni l'enregistrement ni l'exécution** : les valeurs sont dans le
blueprint, et un module n'appelle ses RPC qu'à l'ouverture de son panneau. Ce
qui souffre est la relecture par un collègue — ce qui, dans ce projet, n'est
pas un détail.

## LA DÉCOUVERTE DE FIN DE JOURNÉE

Question de l'utilisateur : *« les scénarios précédents utilisaient des
webhooks. Qu'est-ce qui fait que ça fonctionne sur le webhook et pas sur notre
trigger ? »*

```
notre app   iconikTrigger → typeId 4 = ACTION ; aucun module de type trigger
BAYAM       premier module → gateway:CustomWebHook, natif, sans connexion
```

**Notre « Trigger » n'est pas un déclencheur.** Un scénario qui commence par une
action n'a pas de point d'entrée : Iconik ne peut pas le démarrer. Le webhook de
BAYAM marche parce qu'il est natif, qu'il n'a rien à authentifier, et que c'est
un vrai déclencheur.

`iconik.trigger` doit donc devenir `gateway:CustomWebHook` — un hook créé par
API, dont l'URL va dans la Custom Action d'Iconik. C'est la correspondance
manquante la plus importante, elle règle la connexion à l'entrée, et elle était
sous nos yeux depuis la lecture de leurs blueprints le matin même.

## Méthode — ce que la journée a confirmé, et une leçon neuve

**Un blueprint ACCEPTÉ n'est pas un blueprint VALIDE.** L'API avait pris deux
fois un scénario dont l'agrégateur n'avait pas de source, et ma relecture
annonçait « 52/52 modules gardés ». Elle mesurait la transmission, jamais la
cohérence : Make ne valide qu'à l'enregistrement depuis l'éditeur. Troisième
variante de « un 200 n'est pas un stockage », et la plus coûteuse — les
contrôles disaient vert.

**Regarder l'écran, encore.** La superposition des nœuds, l'App-ID manquant,
l'agrégateur sans source, les scénarios en double : quatre défauts trouvés par
l'utilisateur, aucun visible dans une sortie de terminal.

**La cible sait dire ce qu'elle attend, si on le lui demande au bon endroit.**
Deux blocages d'une demi-journée ont été levés par le même geste : poser un
module à la main dans l'éditeur puis relire par l'API, et lire la requête dans
l'onglet réseau. Huit tentatives à l'aveugle avaient échoué avant.

**Une trace permanente, par ma faute.** J'ai passé l'app de sonde en `public`
en cherchant à débloquer « Module not found » — qui n'était même pas la cause.
C'est irréversible et non supprimable. `apssonde28365-9782b8` reste dans leur
compte, renommée « ZZ — APS sonde (obsolète, ne pas utiliser) ». Avant toute
opération qui change un état chez un tiers, se demander si elle se défait.

## Ce qui reste, dans l'ordre

1. **`gateway:CustomWebHook` en entrée** — sans déclencheur, aucun test de bout
   en bout n'est possible, connexion ou pas.
2. **Mettre à jour plutôt que créer** — un workflow réémis fabrique aujourd'hui
   une seconde paire de scénarios. Il faut rattacher un scénario émis à son
   workflow, puis `PATCH` son blueprint.
3. **L'export APS**, puis le test réel.
4. Les listes déroulantes, si l'occasion se présente.
5. Le branchement de la valeur lue du Data Store dans le champ qui la consomme,
   les conditions des routes, et les 4 champs assemblés que l'extracteur ne sait
   pas lire.
