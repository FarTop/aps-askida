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
