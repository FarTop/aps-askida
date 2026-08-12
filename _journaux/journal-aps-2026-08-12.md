# Journal APS — 2026-08-12

> Demi-journée Make, refermée volontairement pour repartir sur VOD Factory
> (mise à jour de la documentation partenaire). Trois avancées, dont une qui
> change la nature de ce qu'on émettait — et une question de l'utilisateur qui
> a trouvé en une phrase ce que quatre de mes hypothèses avaient manqué.

## Le déclencheur

`iconik.trigger` était rendu en module d'ACTION (`typeId 4`). Notre app
n'avait donc **aucun déclencheur**, et un scénario émis n'avait pas de point
d'entrée : Iconik ne pouvait pas le démarrer, il ne partait qu'à la main.

Les douze scénarios BAYAM commencent tous par `gateway:CustomWebHook`, qui
cumule trois avantages qu'aucun module d'app ne peut avoir : c'est un vrai
déclencheur, il n'a aucune connexion à authentifier, et Iconik sait déjà y
poster — c'est ce que fait une Custom Action.

Le verbe cesse d'être rendu en module et devient une **correspondance
native**, déclarée là où vivent les autres. L'émetteur crée le hook et pose
son identifiant. Le hook est réutilisé par son nom : le recréer changerait son
URL, et l'URL est ce qu'on colle dans Iconik — un déclencheur qui change
d'adresse ne déclenche plus rien.

## STATIQUE OU MAPPABLE — la découverte du jour

C'est la comparaison demandée à l'utilisateur qui a tranché. Le même appel de
RPC, côté Airtable :

```
airtable   {"data":{"base":"appmeUzk9cnmcPHhP","__IMTCONN__":1405414}}
nous       {"data":{"eventType":"custom_action"}}
```

De là, la lecture des deux blueprints côte à côte a donné la forme juste :

```
airtable   parameters : {__IMTCONN__}      mapper : {base, table, record}
nous       parameters : {tout}             mapper : {}
```

Un module Make a deux familles de champs. `parameters` est la configuration
**statique** — évaluée avant qu'une connexion soit en jeu, incapable de porter
une expression. `expect` sont les champs **mappables**, ceux qui acceptent
`{{1.collection_id}}`. Tout était poussé en `parameters`.

Deux conséquences, et la seconde est bien plus grave que celle qui nous
occupait :

- les listes déroulantes échouaient — « App-ID header is required » — parce
  que l'éditeur appelle leur RPC sans connexion, un champ statique n'en ayant
  pas ;
- **aucun champ ne pouvait recevoir une valeur d'exécution.** Un scénario émis
  était donc inapte à tourner, si bien déclenché et authentifié soit-il. Le
  test de bout en bout l'aurait révélé plus tard, et plus cher.

Quatre hypothèses avaient été écartées avant celle-là, chacune par la mesure :
la connexion (une créée à la main échoue pareil), l'app (une app neuve se
comporte à l'identique), son installation, le cliché du schéma dans
`metadata`. La cinquième était la bonne. Le `PUT` sur `expect` n'est pas
documenté — la spec ne déclare qu'un GET. Il fonctionne.

## Les expressions, et ce qu'elles mesurent

APS écrit `{collection.id}`, Make écrit `{{1.collection.id}}` — le nombre
désignant le module producteur. Traduire demande donc de savoir d'où vient
chaque variable, et c'est là que le workflow se fait mesurer. Les 16
références de PUBLISH se rangent en quatre tas :

```
traçables      déclencheur ou étape amont déclarant un resultVar   → traduites
constantes     {now} → {{now}}                                     → traduite
traversantes   {ancestorPath} ×3 — produite dans un scénario,
               lue dans un autre. Make n'a AUCUNE référence
               inter-scénarios : elle doit voyager dans la charge
               utile de l'appel webhook, en paramètre déclaré.
orphelines     8 — sept {s3_*_url} et un appel de fonction.
               AUCUNE étape ne les produit.
```

Le moteur d'APS tolère les orphelines grâce à son espace de noms global. Make
n'en a pas, ASL non plus. Ce ne sont pas des détails d'émission : ce sont des
dépendances invisibles du workflow, qui ne survivront à aucun portage. Le
script les énumère à chaque émission — c'est le taux de variables non
déclarées, rendu visible là où il coûte.

Un piège corrigé : une référence NUE — `{{38}}` — ne désigne rien, Make attend
un champ. À défaut de savoir lequel, on prend la première sortie DÉCLARÉE du
module, et on signale le seul cas où le module n'en déclare aucune.

## Deux défauts trouvés en vérifiant

**Le rendu sans `--neuve` visait `liste[0]`** — l'app de sonde obsolète,
publiée par erreur hier et non supprimable. Deux commandes plus loin,
l'émetteur branchait ses scénarios dessus sans que rien ne le signale : le
seul indice était un nom d'app dans une ligne de log. Il vise désormais celle
qu'APS a rendue en dernier, lue dans `NodeDefinition`.

**`/hooks` pagine à 50, l'équipe en a 59.** La réutilisation par nom ne
trouvait donc jamais le nôtre — un hook de plus à chaque émission, avec une
URL neuve à chaque fois. Exactement le symptôme que la réutilisation devait
empêcher.

## Méthode

**La cible sait dire ce qu'elle attend, si on le lui demande au bon endroit.**
Trois blocages majeurs ont été levés par le même geste, et aucun par
déduction : poser un module à la main puis relire par l'API (`app#`), lire la
requête dans l'onglet réseau (la connexion dans `data.__IMTCONN__`), et
comparer un module de Make au nôtre (statique vs mappable). Huit tentatives à
l'aveugle avaient échoué avant la première.

**Et la meilleure question de la journée n'était pas de moi** : « qu'est-ce
qui fait que ça fonctionne sur le webhook et pas sur notre trigger ? » —
posée hier soir, elle a ouvert le sujet du déclencheur ; et la capture
Airtable demandée ce matin a ouvert celui des champs mappables.

## Où on en reste

```
app           custom-app-pmenfm   ·   connexion 14508596
scénarios     9649867 (52 modules)  ·  9649868 (66 modules)
déclencheur   4311687  https://hook.eu2.make.com/rrsrur82253kb1s84qxb9eqid14bfdpo
Data Stores   177485 (11 ressources)  ·  177486 (124 lignes)
trace         apssonde28365-9782b8, publique et non supprimable, renommée
              « ZZ — APS sonde (obsolète, ne pas utiliser) »
```

Reprise, dans l'ordre de blocage :

1. **Le contrat d'entrée du scénario 2** — sans lui, la boucle reçoit un appel
   vide. C'est ce que `{ancestorPath}` a mis au jour.
2. **Coller l'URL du déclencheur dans la Custom Action Iconik** — première
   écriture chez eux depuis ce chantier, à décider explicitement.
3. **Les 8 orphelines** — à régler dans le Builder, pas dans l'émetteur.
4. Mettre à jour plutôt que créer un scénario (aujourd'hui chaque émission
   fabrique une paire neuve).

---

# Journal APS — 2026-08-12, seconde partie : retour à VOD Factory

> Make est mis en pause volontairement : la documentation partenaire VOD
> Factory a été mise à jour, et elle change des choses. Une demi-journée de
> lecture, de mesure et d'arbitrage — qui découvre un blocage total du
> catalogue série, jamais vu jusqu'ici.

## Ce que la doc a bougé

Changelog API jusqu'au **1.3.0 du 2026-08-10**. Quatre entrées comptent :

```
1.3.0  callback transfert/ingest        ← tue notre plus gros poste de coût
       force_send_amazon / force_send_free
1.1.0  licences AVOD/FVOD/VOD/EST/POEST + price_value/price_currency
       débit : 120 req/min, X-RateLimit-*, 429 + Retry-After
1.0.4  serveur MCP
```

**Le callback change l'architecture.** Savoir si une livraison a abouti
demandait de sonder `action-statuses` — c'est ce que fait le nœud `Wait`, et
chez Make ce sondage coûtait 59 modules à lui seul. VOD Factory rappelle
désormais une URL quand un transfert atteint un état final. Le `Wait`
disparaît, remplacé par un second scénario déclenché par webhook.

## LA DÉCOUVERTE : le catalogue série est entièrement bloqué

Doute de l'utilisateur en lisant les exigences : les séries et saisons
auraient aussi besoin de métadonnées éditoriales. Vérifié sur le tableau
structuré — la légende dit « ✔ : program, serie, season, and episode » —
puis **mesuré sur leur préprod** :

```
SERIE   « Star Trek »        title ✅   les 9 autres ❌
EPISODE « Next Generation »  les 10 ✅  (il a un asset éditorial)
```

Et une cascade que personne n'attendait :

```
serie    amazon_avails → availability_dates_not_set
season   amazon_avails → parent_not_sent
episode  amazon_avails → parent_not_sent
```

**La perfection des épisodes ne sert à rien** : l'arbre entier est bloqué par
le niveau série. Aujourd'hui, rien d'une série ne peut être livré à Amazon.

La cause est en amont d'Iconik : les vues SERIE et SAISON ne portaient aucune
métadonnée éditoriale. Le workflow ne « saute » pas une récolte — il n'y avait
rien à récolter. Ce n'était donc pas un chantier de workflow mais de modèle de
données.

## L'arbitrage — trois classes, et une politique par niveau

Rendre les dix champs obligatoires partout ferait ressaisir dix valeurs sur
chaque épisode ; ne rien exiger livrerait des fiches vides. La résolution se
fait à la publication, en remontant tant que c'est vide, et ce qui varie d'un
champ à l'autre est le DROIT de remonter :

```
propre     identité, structure, images, ISAN, date de sortie
cascade    Studio · LangueOriginale · Pays · Genres · Classification
signalee   Synopsis · SynopsisCourt · TitreOriginal · droits
fusion     les cinq métiers de personnes, dédoublonnés sur (external_id, job)
```

Le responsable Bayard a corrigé trois choses, dont une où j'avais tort :

**Les droits cascadent.** Mon objection — « hériter une fenêtre de licence
publierait un contenu hors de ses droits » — confondait deux situations. Un
champ VIDE ne dit pas « une licence différente », il dit « pas de licence ».
Et la preuve était sous mes yeux : `availability_dates_not_set`.

**Et le modèle était insuffisant.** Leur règle sur le synopsis — la saison
hérite, l'épisode doit être différencié — ne s'exprime pas avec une politique
par champ. `heritage` accepte donc deux formes : une chaîne, ou un objet par
niveau.

Sur les personnes, « hérite si vide, sinon fusion » est la MÊME règle que
`fusion` seule : l'union avec un ensemble vide rend l'ensemble du parent.

## Où vit la contrainte — trois moments, pas un

L'utilisateur a tranché en cours de route, et son raisonnement s'est propagé :
si l'opérateur peut ne pas avoir l'information à la création, le formulaire ne
peut pas être bloquant là. Et à la publication non plus — il se prendrait dix
champs au visage au moment où il est le moins disposé à les chercher.

```
création     CREER UNE SERIE     ce qu'il faut pour bâtir la structure
saisie       fiche COLLECTION    au fil de l'eau, aucun required
publication  la livraison DIT ce qui manque, champ par champ
```

`action-statuses` rend le motif exact — « The metadata persons is required ».
Le contrôle existe donc en aval, sans qu'on ait à le dupliquer en amont.

## Les vues, faites par l'utilisateur

```
SERIE     28 champs   ✅ les 13 éditoriaux, les 3 droits, ISAN
SAISON    23 champs   ⚠ voir ci-dessous
EPISODE   20 champs   ✅
aucun champ requis, aucun champ du tronc commun dupliqué sous la série
```

**Un piège trouvé en vérifiant, et il ne se serait vu qu'à la livraison :**

```
DatedeFindeDroits   datetime   ASSET · SERIE · EPISODE   ← ciblé par la correspondance
DatedeFinDroits     date       SAISON seulement          ← le mauvais
```

Deux champs Iconik distincts, libellés à l'identique, types différents. Une
date de fin de droits saisie sur une saison ne serait jamais lue.

## Ce qui reste

1. **Remplacer `DatedeFinDroits` par `DatedeFindeDroits`** sur la vue SAISON.
2. **La résolution dans le moteur** — remonter l'arbre selon la politique de
   la correspondance. `iconik.resolve_ancestors` remonte déjà, il lui manque
   de rapporter les métadonnées et pas seulement le chemin.
3. **La trace des emprunts** au compte rendu — sans elle, `hérité ⚠` ne vaut
   pas mieux que `hérité`.
4. **Le découpage par niveau des images** dans le manifeste : Amazon cadre ses
   formats par niveau (`box_art` programme, `cover/poster/hero/title` programme
   et saison, `season_box` saison, `episodic` épisode) alors que notre
   manifeste déclare les mêmes essences pour tous (`niveau: *`).
5. **Le callback** — il remplace le sondage, et change la forme du workflow.
6. Les huit champs manquants de la correspondance (`sku_code`, `format_profile`,
   `licence_type`, `duration`, identifiants…) et la connexion production.

## Méthode

**Le doute de l'utilisateur valait mieux que ma lecture.** J'avais lu le
tableau des attributs requis dans un texte aplati et attribué `original_title`
et `video_quality` à Amazon — ils appartiennent à Allociné et Betv. Réextrait
en table structurée, tout se remet en place. Un tableau lu à plat n'est pas un
tableau.

**Et la mesure a battu la déduction, encore.** Le blocage en cascade
(`parent_not_sent`) ne se déduisait d'aucune documentation : il a fallu
appeler `action-statuses` sur une vraie série pour le voir.

---

# Journal APS — 2026-08-12, troisième partie : l'héritage prouvé, puis le virage

> Longue session. L'héritage arbitré le matin devient du code prouvé en réel ;
> la correspondance est confrontée aux référentiels du partenaire ; le callback
> est construit. Puis une décision de direction fait basculer le chantier :
> Make est abandonné, AWS Step Functions prend sa place — et une cible plus
> contraignante fait apparaître ce qu'une cible permissive absorbait en silence.

## L'héritage, du code à la preuve

`iconik.resolve_ancestors` lisait déjà les métadonnées complètes de chaque
ancêtre pour composer le chemin S3, et n'en gardait que trois champs. Poser la
pile entière n'a donc coûté **aucun appel réseau** : elle était là, on la
jetait.

Quatre runs réels sur QA | ASKIDA, tous `success` :

```
série            part complète, 6 personnes distinctes
saison (nue)     12 champs hérités, 3 signalés
épisode 01       la fusion enrichit le casting
épisode 02       remonte DEUX niveaux, cascade + signalée + fusion
```

Et la ligne réellement écrite dans Iconik :

```
⚠ hérité : DatedeDebutdeDroits ← Série, DatedeFindeDroits ← Série,
           Synopsis ← Série, SynopsisCourt ← Série, TitreOriginal ← Série
```

Le synopsis passe en silence au niveau saison et signalé au niveau épisode :
la politique par niveau fait exactement ce pour quoi elle a été ajoutée.

## Ce que le run réel a trouvé et que la preuve ne pouvait pas voir

`preuve-heritage.js` passait à 100 % pendant que le moteur livrait un unique
`ice-cube-chris-tucker` à Amazon. Mon jeu de test posait les métadonnées sous la
forme que le CODE attendait ; le search Iconik les livre **sérialisées** par les
variables de contexte. Deux acteurs devenaient une personne.

Le même défaut existait, **préexistant**, sur les champs à table de traduction :
la table cherchait la chaîne entière `["av_genre_comedy","av_genre_adventure"]`
comme clé. Un genre passait, deux cassaient tout l'envoi.

## La correspondance, confrontée aux référentiels

Cinq des huit traductions de genres pointaient vers des codes **qui n'existent
pas** chez Amazon. La table ne se contentait pas d'être inutile : quand elle
s'appliquait, elle traduisait du juste vers du faux. Confrontée aux 432 codes
officiels, elle devient une table de rattrapage à 20 entrées.

`Unitaire` n'avait aucune entrée dans la table de `type`, alors que la règle
porte un repli `{TypeCollection}` : un unitaire sans `ContenuPrime` envoyait la
chaîne « Unitaire ». Les trois autres niveaux passaient par coïncidence.

**Deux fausses pistes que j'ai créées, et qu'il faut connaître :**

*« Une personne ne peut porter qu'un métier »* — FAUX. Les 422 de
`POST /api/persons` disent seulement « existe déjà » (le corps n'a pas de
`job` : le métier est une relation du contenu) et la séquence les ignore.
« persons.1.external_id is invalid » désignait les entrées corrompues par le
défaut de déballage. Un seul bug, deux symptômes, et j'en avais déduit deux
causes.

*`Magazine → program`* — régression que j'ai introduite en me fiant à la doc
p.7, qui ne liste que quatre valeurs de `type`. Le schéma MCP en déclare six.

## Le PDF n'est pas le serveur

Le MCP de préprod existe (la doc ne documente que celui de production) et
expose **37 outils** là où le PDF en documente 24 — dont
`get_content_action_statuses`, que j'avais déclaré absent. Ses schémas portent
les contraintes qu'aucune page ne donne : `rating` en enum, « max 3 genres pour
Amazon », les longueurs maximales, `duration` en secondes.

**Ce que l'API REST ne dit pas, le MCP le dit.**

## Le virage

Décision de l'utilisateur : **Make est abandonné comme cible d'émission**,
AWS Step Functions prend sa place. Modèle économique intenable, prestation
Bayard proche de sa fin. Il envisageait trois cibles ; recommandation retenue :
une seule à la fois, et la plus contraignante d'abord — ASL n'a aucun espace de
noms global, donc elle teste le pivot bien plus durement.

L'argument qui a pesé, et qui vaut pour TOUT émetteur : les 14 scénarios Make en
production ont été reconstruits par des collègues **depuis la documentation
produite par APS**, jamais depuis un émetteur. C'est le seul transfert vers une
cible qui ait réellement eu lieu.

## Rendre le pivot traduisible — avant d'écrire une ligne d'ASL

Huit références « sans origine déclarée » sur PUBLISH. Elles n'étaient pas
ambiantes : le nœud Deliver les pose, et le manifeste les NOMME. L'information
existait, elle n'était remontée nulle part.

```
avant   8 sans origine
après   0 · 1 contrat d'entrée nommé · 1 fonction d'expression à porter
```

Trois fois dans la journée, le même motif : **le pivot en sait plus long que ses
consommateurs**. Les sorties de Deliver étaient nommées par le manifeste, les
ports déclarés par le catalogue, l'aplatissement des métadonnées déclaré depuis
longtemps. Personne ne le leur avait demandé.

## Ce qu'ASL renverse, et ce qu'il coûte

```
ASL SAIT BOUCLER          un sondage = 3 états, contre 59 modules déroulés
L'ERREUR EST NATIVE       Catch s'attache à l'état, ne coûte rien
MAIS AUCUNE LOGIQUE       traduire, hériter, tenir un registre → Lambda
ET PAS DE PORTS MÉTIER    `miss`/`empty` se réécrivent en conditions
```

PUBLISH : **91 modules chez Make, 41 états chez ASL.** La console AWS accepte
la définition complète et la dessine — S3 en intégration native, Lambda,
Map/ItemProcessor, la boucle de sondage, les Catch attachés.

## Les Lambdas — deux sur trois

`aps-essences` et `aps-lookup` **ne réimplémentent rien** : elles appellent les
modules du moteur natif, extraits en fonctions pures. Ce n'est pas une
commodité. Ces variables composent les URL livrées au partenaire puis vérifiées
par APS : deux implémentations qui divergent contrôleraient une autre adresse
que celle qu'elles ont envoyée.

L'extraction a d'ailleurs révélé un **défaut réel** : le repli par token
écrasait l'essence correctement triée, sans le tri qui écarte les doublons
d'upload. `friday_cover-2.png` serait parti à la place de l'original.

## Le chiffrage

```
                       Make            ASL          écart
1er essai              $0,056          $0,0012      ×46
5e essai               $0,067          $0,0016      ×42
20 essais              $0,107          $0,0029      ×37
```

Tarif Step Functions **relevé** (Europe Paris) : 0,0297 $ / 1000 transitions.
Mon estimation de mémoire était 19 % en dessous — l'ordre de grandeur tenait, le
chiffre non.

Et l'offre gratuite **n'expire pas** : 4 000 transitions par mois, soit
**75 publications gratuites**. La question cesse d'être « lequel coûte moins »
pour devenir « accepte-t-on de posséder trois Lambdas et une table DynamoDB ».

## Méthode

**Le run réel bat la preuve hors ligne.** Trois fois aujourd'hui.

**Un contrôle qui valide du vide est pire que pas de contrôle.** Mon émetteur
ASL affichait « ✅ cohérence interne » sur un graphe dont les 21 états menaient
tous à la sortie : il vérifiait que les cibles existent, et « Fin » existe. Le
contrôle de connexité, ajouté après, a trouvé deux bugs de plus au premier
essai. Même leçon que l'audit de correspondance, qui accusait huit pays d'être
invalides parce qu'il cherchait le mauvais champ.

**Un diagnostic qui ne bouge pas après correction n'était pas le bon
diagnostic.** Deux collages ASL ont rendu exactement les mêmes sept erreurs aux
mêmes lignes ; j'ai conclu à un problème de caractères et « corrigé ». Le
fichier était simplement tronqué à la ligne 200 sur 570. C'est la faute que la
mémoire du chantier Make décrit — enchaîner les hypothèses au lieu de s'arrêter
sur celle qui ne tient pas.
