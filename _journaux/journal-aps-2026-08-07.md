# Journal APS — 2026-08-07

> Journée en deux temps. Une longue discussion de conception, ouverte par
> l'utilisateur au milieu d'une phase de test parce qu'une proposition de ma
> part — « on ajoute un Fetch » — a fait déborder une gêne accumulée sur la
> lisibilité du Builder. Puis la mise en œuvre de ce qui en est sorti : le
> vrai correctif du payload VOD Factory (qui n'était pas celui qu'on croyait),
> le portage du nœud Post-it depuis WFD, et un bug de fond sur la résolution
> des références. Fin de journée : **les quatre niveaux publiés en `success`
> dans la même soirée**, Unitaire compris, pour la première fois.

## Fil de la session

### Le point de départ : `ContenuPrime`, et ce qu'on cherchait au mauvais endroit

Le « reste ouvert » d'hier disait « pas de correspondance `Unitaire` dans la
table `ContenuPrime` ». L'utilisateur a corrigé d'emblée : `Unitaire` est un
terme à nous, qui regroupe Émission/Film/Magazine ; `ContenuPrime` est une
vraie valeur partenaire. On ne peut donc pas router sur `TypeCollection`.

La mesure a montré bien pire que le symptôme. Sur les 25 derniers runs,
`ContenuPrime` vaut **∅ sans exception** : la ligne tombait toujours sur son
repli `{TypeCollection}`. Série/Saison/Épisode marchaient **par coïncidence**,
parce que la table de traduction de la correspondance mélange les deux
vocabulaires — `Série → serie` (valeur de TypeCollection) cohabite avec
`Magazine → magazine` (valeur de ContenuPrime). `Unitaire` n'ayant pas de clé,
la valeur brute partait chez le partenaire.

Le rejeu du vrai `lookup()` sur le contexte réel d'un run a donné la vraie
mesure : **7 lignes remplies sur 30**, dont 6 venant du repli. Les 16 champs
éditoriaux (Genres, ISAN, Synopsis, Classification, Réalisateur, dates de
droits…) partaient **vides depuis toujours** — personne ne l'avait vu parce
que VOD Factory n'exige que `title` et `type`.

Cause unique : le Lookup reçoit `search_results.objects[0]`, c'est-à-dire la
**collection**, alors que toute la métadonnée éditoriale vit sur l'**asset**,
dans la vue `VUE | PRIME | LIVRAISON`. L'utilisateur l'a formulé avant moi :
« ContenuPrime est portée par une vue Asset et pas Collection ».

Trois vérifications ont écarté autant de fausses pistes : le snapshot de sync
date du 28 juin et ne prouve rien sur l'existence d'un champ ; la recherche
Iconik **ignore** `metadata_view_id` (testé dans le corps et en paramètre
d'URL) ; et le `BayardID` que porte l'asset de test est un résidu de
réutilisations, pas une donnée normale — l'utilisateur a corrigé une
déduction que j'avais bâtie dessus.

### La discussion de conception — « une variable est un tiroir de mon meuble »

Ouverte par l'utilisateur en pleine phase de test, sur un constat net : le
workflow est illisible pour un designer, il y a « des variables sorties d'on
ne sait où », et ma réponse à chaque obstacle est d'ajouter un nœud.

Le test qu'il a proposé — écrire un post-it sous chaque nœud, concaténer et
lire — a été exécuté pour de vrai. Résultat : **9 nœuds sur 19 lisent une
variable que rien n'a annoncée**. Et la mesure sous-jacente :

| | |
|---|---|
| variables présentes en fin de run | 59 |
| déclarées par le document | 5 |
| apparues sans déclaration | **46** |

Le mécanisme est identifiable ligne à ligne : chaque handler écrit dans un
espace de noms global sous des **noms calculés à l'exécution**
(`setVar(ctx, fieldName, …)` dans Search, `setVar(ctx, k, …)` pour chaque clé
produite par Lookup, idem Fetch, Deliver, Create Tree). Le document ne peut
pas les montrer : il ne les connaît pas.

Deux conclusions, séparées par la mesure :

- **Le déclaratif réduit le nombre de nœuds** — démontré : Créer Série fait
  **2 étapes** grâce au gabarit, le manifeste fait tenir Deliver/Verify/History
  en trois nœuds pour quatre niveaux.
- **Il ne ferme pas l'espace de noms** — réfuté par le même dépôt : Créer
  Série, le workflow le plus déclaratif, a **64 % de variables fantômes**.

Ce sont deux problèmes indépendants, et la plainte initiale les mélangeait.

### Le recadrage qui a réordonné les priorités

Deux corrections de l'utilisateur, toutes deux justes :

1. **« Le nombre de nœuds n'est pas le point critique »** — « je préfère 16
   nœuds qui rendent lisible un workflow plutôt que 8 qui parlent au moteur en
   m'exposant la culasse ». J'avais passé deux réponses à vendre « PUBLISH de
   19 à 8 nœuds », c'est-à-dire l'inverse du principe déjà écrit dans
   `CLAUDE.md`. La métrique est le **test des post-it**, pas le compte.
2. **« Une variable est un tiroir de mon meuble »** — une variable du moteur
   ou de la source ne doit **jamais** apparaître au Designer. Ce qui élimine ma
   proposition de préfixer (`{search_results.TypeCollection}`) : traçable ne
   veut pas dire *à soi*. Sur PUBLISH, 47 racines produites, **8 seulement
   référencées** — le reste n'est pas à renommer, il est à ne pas montrer.

Corollaire donné par l'utilisateur et retenu : si on doit refaire un Fetch,
c'est qu'aucun tiroir ne portait déjà la chose. Le second Fetch de Momentum
n'était pas une lecture mais une **barrière de ré-entrance** — vérifier qu'une
écriture a été prise en compte avant de continuer.

Constat qui en découle, vérifié : `BAYARD|STATUSES|VODFACTORY` (jamais
commencé) est exactement ce motif — `timer` + recherche sur
`StatutPublication = "Posté"`, et le workflow écrit ce même champ. Or le moteur
natif ne connaît que `manual` et `custom_action` (aucune minuterie) et
`startRun` ne sérialise rien. Les deux moitiés de la protection manquent.

### Le correctif, et ce qu'il fallait pour l'obtenir

Forme retenue, contre ma première proposition : **pas un Search qui déverse**,
mais deux nœuds aux rôles séparés en tête de flux —

```
Asset éditorial            iconik.search, mode Presence
                           critère : in_collection + ContenuPrime is_not_empty
                           → désigne, n'expose rien

Métadonnées de livraison   iconik.fetch scopé sur VUE | PRIME | LIVRAISON
                           → expose les 24 champs de la vue
```

Le mode `presence` existait dans le moteur depuis le portage mais n'était pas
offert au panneau : ajouté. Sans lui, la recherche à 1 résultat aurait remis
les 56 champs bruts de l'asset dans le contexte — exactement les noms moteur
que l'utilisateur ne veut plus voir.

Prédit hors ligne avant tout run, en rejouant le vrai `lookup()` : **7 → 21
lignes**, `type` passant de `Unitaire` à `magazine`.

### Le nœud Post-it — port de WFD, et un bug du moteur trouvé au passage

L'utilisateur voulait de vrais nœuds, pas un synopsis rédigé : `family:
postit` existait dans WFD et n'avait jamais été porté. Dix fichiers, en
portant plutôt qu'en réinventant (mêmes sept teintes, mêmes proportions, même
absence de ports, exclu des exports).

Deux briques manquaient au panneau — une zone de **texte long** et un
**sélecteur de couleur** ; la table `NATURES` est extensible, elles s'ajoutent
proprement.

**Vrai bug trouvé** : `_entriesOf()` prend pour points d'entrée les étapes sans
arête entrante. Un post-it n'en a aucune — il aurait donc été exécuté, en
levant « Aucun handler enregistré ». Écarté à la source, plus un no-op de
sécurité dans `runStep`.

26 post-its posés sur PUBLISH — jaune pour la narration, rouge pour les
quatre trous de récit identifiés par le test.

### Trois contestations de l'utilisateur, trois fois raison

- **« Check Collection vérifie S3, pas le partenaire »** — exact. `deliver`
  fait un `list_objects` sur un bucket ; seul `verify` interroge VOD Factory.
  J'avais re-mélangé la distinction que la session du 6 août avait tranchée,
  le lendemain, avec le journal sous les yeux. Quatre post-its corrigés — et
  le vrai sujet est le **nommage** : `Check Collection`, `Check Asset`,
  `Recheck`, `Verify`, quatre noms de la même famille pour deux systèmes.
- **« Programme ? ne sert qu'à vérifier si le champ est rempli ? »** — non :
  c'est une **liste blanche** dont le port `default` n'est relié à rien, donc
  une valeur inconnue arrête le run **en silence** après que « En cours » a
  été écrit. Mon post-it (« aucune conséquence ») était faux.
- **« TypeCollection ne peut pas être vide »** — juste. Le champ est un
  dropdown en lecture seule écrit par les seuls workflows Créer. Les 9
  collections QA sans `TypeCollection` datent de mai–juillet, avant le Tree
  Builder : des résidus, pas la preuve d'un bug. Le cas qui reste réel est
  l'ajout d'un **cinquième niveau** au dropdown, pas le champ vide.

### `resolveRef` — la référence que le panneau dépouillait

Premier run réel de la soirée : `partial`, avec un 404 sur
`/API/metadata/v1/collections/collection_id/` — le **nom littéral** dans
l'URL. Comparaison des versions publiées :

```
v16   targetId : "{collection_id}"     marchait
v18   targetId : "collection_id"       404
```

Cause : la nature `variable` du panneau « affiche `{brut}`, stocke brut » —
elle **retire les accolades à l'enregistrement**. C'est juste pour un
`resultVar` (un nom qu'on définit) et destructeur pour un `targetId` (une
référence qu'on lit), que `history` résout via `resolve()`. **Ouvrir le nœud
dans le panneau cassait sa cible.** `lookup` n'en souffrait pas : il retire
lui-même les accolades avant de résoudre.

Correctif : `BuilderContext.resolveRef()`, branché sur les sept champs de
référence des quatre handlers concernés. On aligne tout le monde sur le
comportement tolérant qui marchait déjà :

```
{collection.id} · {collection_id}   gabarit, comme avant
collection_id · collection.id       nom nu, cherché dans le contexte
ABC-litteral-42                     introuvable → rendu tel quel
collection                          désigne un OBJET → refusé
```

Effet de bord bienvenu : la coquille `targetId: "collection.id"` qui avait
coûté un run Épisode le 6 août ne serait plus une erreur.

C'est aussi la troisième fois de la journée que l'utilisateur tique sur
`collection_id` vs `collection.id` et qu'il a raison. Ma réponse du matin
(« les deux résolvent la même chose, sans risque ») était fausse.

### Un run perdu par ma faute

Le premier run Série a produit 20 avertissements « Aucun handler enregistré
pour 'postit' ». Ma garde était correcte **sur disque** — mais le processus
serveur datait du 6 août à 23:33, mon correctif du 7 à 17:35. J'avais vérifié
par un test Node hors ligne, jamais dans le processus vivant. Serveur
redémarré ; leçon : un correctif moteur non rechargé n'est pas un correctif.

### Les quatre niveaux, en conditions réelles

Quatre clics Custom Action, tous sur la v18 publiée :

| | Statut | `type` | Asset éditorial | Lookup | Verify |
|---|---|---|---|---|---|
| Série | ✅ success | `serie` | `empty` | — | ok |
| Saison | ✅ success | `season` | `empty` | — | ok |
| Épisode | ✅ success | `episode` | **found** | **24/30** | ok |
| Unitaire | ✅ success | `magazine` | **found** | **21/30** | ok |

`ContenuPrime` porte enfin une valeur (`Episode`, `Magazine`) — ∅ sur les 25
runs précédents. Les deux niveaux sans asset éditorial ne régressent pas.

L'Unitaire est passé **complet, six essences vérifiées** — en envoyant
sciemment le proxy `.mp4` au lieu de la haute résolution, ce qui isole le
refus `.mxf` comme dernier obstacle, purement contractuel.

### Un piège de lecture, évité de justesse

Sur Saison, `StatutPublication` apparaissait vide dans le contexte alors que
le run était `success`. Vérification dans Iconik : le champ **est** bien écrit.
Le `∅` venait de ce que `{StatutPublication}` en contexte n'est pas ce que le
workflow a écrit mais **ce qu'il a lu au départ** — la Série portait déjà
« Posté » d'une publication précédente, la Saison non. Illustration exacte du
sujet de la matinée, et j'ai failli rapporter un faux problème sur cette base.

## Méthode

Tout mesuré plutôt qu'argumenté : rejeu du vrai `lookup()` hors ligne avant
tout run réel, requêtes Iconik en direct via le proxy (lecture seule),
événements et snapshots relus en base, comparaison des documents publiés v16
vs v18. Aucun run déclenché par moi — PUBLISH appelle Iconik, lance un export
S3 et publie chez un partenaire ; les quatre déclenchements sont le fait de
l'utilisateur. `node --check` sur chaque fichier touché, et une preuve de bout
en bout du nœud Post-it (catalogue, validation, conversion, moteur) sur un
document jetable.

Cinq fois dans la journée, l'utilisateur a contesté une de mes conclusions ;
cinq fois la mesure lui a donné raison.
