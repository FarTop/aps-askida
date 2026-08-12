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
