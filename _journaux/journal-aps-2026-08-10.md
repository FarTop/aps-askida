# Journal APS — 2026-08-10

> Journée en deux moitiés. Le matin sur VOD Factory : la minuterie portée depuis
> WFD, STATUSES construit et éprouvé quatre fois en réel, et **trois bugs de
> fond du moteur trouvés par les tests eux-mêmes**. L'après-midi, un virage —
> une discussion sur la finalité d'APS a débouché sur la construction d'
> **Infrastructure**, l'écran qui décrit ce qu'un outil sait faire. Fin de
> journée : le déroulé complet d'ajout d'un outil tiers se fait dans l'interface,
> sans toucher un fichier de configuration.

## Matin — VOD Factory

### La minuterie, portée depuis WFD

`server/engine-builder/builder-scheduler.js` — port de `scheduleTimer()` et du
planificateur cron de `wfd-engine-trigger.js`. Trois modes (interval, cron,
oneshot), gardes reprises telles quelles (anti-double-départ dans la minute,
fuseau réellement honoré). Le panneau existait déjà côté canevas
(`config-schema.js`, core `trigger`, `kind: 'schedule'`) — seul le serveur
manquait.

Deux décisions à ne pas rouvrir :

- **La version publiée fait foi**, planification comme exécution. Lire le rythme
  dans le brouillon avait été essayé puis retiré : le canevas s'auto-enregistre,
  chaque frappe rearmait un `setInterval` qui n'atteignait jamais son échéance.
- **Pas de barrière de ré-entrance**, volontairement. La masquer cacherait le
  mécanisme que le moteur natif existe pour éprouver. Note : le risque est plus
  faible qu'annoncé le 7 août — sur STATUSES la transition de statut sort l'item
  de la recherche.

Ajouté au passage : le pas cron `*/n`, absent de WFD mais donné en exemple par
l'aide du panneau. Sans lui, `*/15 * * * *` ne serait jamais parti, en silence.

### STATUSES — un portage, et un piège trouvé dans l'original

Le flux **existe dans WFD** (`flux-1783521869691`, 11 nœuds) et fait foi pour
les valeurs métier : cron `00 02 * * *` Europe/Paris, endpoint
`/api/contents/{BayardID}/action-statuses`, huit vérifications sur les quatre
actions Amazon, libellés de branche, texte des historiques.

Statuts renvoyés par VOD Factory, confirmés en direct : `success`, `ready`,
`parent_not_sent`, `incomplete`.

**Le piège de WFD** : sa branche « Ready » écrivait `StatutPublication = "Publié"`
alors que son propre historique annonçait « prochaine tentative cette nuit ». Or
la recherche du lendemain ne retient que « Posté » — la collection sortait de la
reprise et la tentative n'avait jamais lieu. Sur demande de l'utilisateur, le
portage ne touche plus du tout au statut en cas d'échec : seul l'historique bouge.

9 étapes, 11 post-its, document valide, converti en 20 nœuds / 12 connexions.
**Reste en brouillon, non publié, non actif** — publier armerait la minuterie.

### Trois bugs de fond, tous trouvés en éprouvant

**1. Fuite d'item entre tours de boucle.** `runLoop` n'appelait `pushLoopScope`
qu'une fois pour toute la boucle. L'aplatissement n'écrivant que les champs que
l'item possède, un item auquel manquait un champ héritait de la valeur du tour
précédent. En réel : la collection `ce3456e8`, sans BayardID, portait celui de
`cdc0d434` — APS a interrogé VOD Factory **sur le mauvais contenu**, reçu une
réponse plausible et l'a écrite dans l'historique de la mauvaise collection,
sans lever d'erreur. Corrigé par un scope par itération. Après correctif, la
même collection renvoie `HTTP 404` — soit exactement ce que rapporte le
scénario Make des collègues.

**2. Historique qui se répète.** 17 lignes identiques relevées sur QA, une par
nuit, sans plafond. Nouveau `whMode: 'change'` : la ligne n'est écrite que si
elle dit autre chose que la précédente, la comparaison excluant date et
identifiant de run. **Optionnel et jamais le défaut** — le journal complet reste
un choix légitime.

**3. Verify appelait une fois par vérification.** Les huit contrôles du
manifeste tapent la même url : 8 appels par collection, 64 par passage. Assez
pour un 429 quand deux runs s'enchaînent. Une réponse par endpoint désormais :
STATUSES passe de **26,4 s à 5,3 s**.

### Le contrôle nocturne, et à qui il appartient

L'historique de chaque collection porte une ligne quotidienne à 02:00 depuis le
1er août, dans un format qui n'est ni celui de WFD ni le nôtre. Le flux WFD est
`isActive: false` et le moteur rapporte `activeFluxes: 0` — **ce n'est pas APS**.
L'utilisateur a confirmé : c'est le **scénario Make des collègues**.

Conséquence : publier le STATUSES du Builder mettrait deux écrivains sur le même
champ à la même heure. À coordonner avant.

Et le champ a tranché un arbitrage tout seul : le writer nocturne écrit
`🕗 Reporté` là où WFD écrivait `❌ Échec`. Valeur ajoutée aux options de
`whStatut`, et utilisée.

## Après-midi — la finalité, puis Infrastructure

### Ce que la discussion a fixé

- Les tiers se rangent en **plateformes qu'on appelle** (la colonne qui
  prolifère) et **orchestrateurs vers qui on émet** (quatre ou cinq, jamais
  trente). Wildmoka, Moment Lab, Aive, Amplifay, Ignifai, Mimir, Perfect Memory,
  FLICS, Tornado d'un côté ; Make, Node-RED, n8n, Step Functions, Pulse It de
  l'autre.
- **L'organisation EST le projet.** `Project` reste de l'échafaudage mort.
- **APS pilote l'infra d'Askida, pas celle des clients.** Bayard vivra seul avec
  Iconik et Make ; la maintenance sera une prestation. D'où : la mallette 2110 à
  piloter, synchroniser, restaurer — et `iconik.action` avec ses 41 appels qui
  n'est pas une verrue mais le vocabulaire de pilotage.
- **Critère de conception posé par l'utilisateur** : si une chose demande de
  faire appel à moi, elle n'est pas finie. APS doit *produire* l'app custom, pas
  aider à l'écrire.

### Infrastructure — construit

La carte de l'accueil pointait vers un fichier inexistant depuis le début.

**Le partage arrêté :**

```
Administration › Plateformes   l'outil existe, son type, ses orgs
Administration › Connexions    l'accès : URL, secret chiffré        ← par projet
Infrastructure                 ce que l'outil SAIT FAIRE            ← partagé
```

`Platform.authSpec` porte le **schéma** d'authentification (« toutes les
connexions Make envoient `Authorization: Token` »), `Connexion.authValueEnc` le
**secret**, `Connexion.extraConfig.champs` les valeurs non secrètes. Le
formulaire Connexions devient piloté par le schéma. `Connexion.platformId`
ajouté pour ça — en SQL brut, `migrate dev` restant interdit tant qu'`ApsCounter`
existe en base sans modèle.

`server/lib/connexion-acces.js` : le calcul URL + en-têtes en **un** endroit. Il
s'en construisait à quatre, avec trois comportements différents — `authType:
'token'` produisait un Bearer dans `verify` et `wait`, et ne faisait *rien* dans
`http_request`.

**Le déroulé, disponible sans assistance** : créer la plateforme → saisir les
accès + Tester → chercher la spec (9 chemins conventionnels sondés) ou coller
une URL de **documentation** en repli (APS recolle les fragments OpenAPI des
pages Markdown) ou un fichier → parcourir les opérations (paginées, filtrables)
→ tester les endpoints → exporter (OpenAPI / HTML imprimable).

Modèles réutilisés, qui existaient **vides** : `ApiSpec`, `ApiEndpoint` (dont
`apsMapping`) et `ApiCheck`. Rattachés à `Platform` — ils pendaient à `Project`.

### Le test des endpoints

Forme reprise de l'API Check de WFD : bandeau de synthèse puis détail. **Que des
GET**, et seulement ceux dont tous les paramètres ont une valeur. Le reste est
écarté **avec sa raison**, jamais deviné — inventer un `{scenarioId}` produirait
un 404 qui ne dit rien.

Le **contexte de test** (`Connexion.extraConfig.contexteTest`) remplit les
paramètres : sans lui, 33 des 34 GET « scenario » sont hors de portée. Seuls les
paramètres **requis** partent — joindre les facultatifs connus cassait l'appel,
Make refusant `/scenarios?teamId=…&organizationId=…` là où `teamId` seul répond.

Effet de bord découvert : le test est aussi un **détecteur d'écart entre ce
qu'une spec déclare et ce que l'API fait**. `/scenarios-shared` déclare `teamId`
facultatif ; l'API l'exige.

### Make, mesuré

```
spécification      553 opérations   https://eu2.make.com/api/v2/openapi.json
                                    non documentée, trouvée en sondant
repli documentaire 414 opérations   reconstituées depuis 103 pages Markdown
serveur MCP        132 outils       dont 130 recouvrent l'API (98 %)
```

Et le coût de l'absence de générateur, chiffré : **12 scénarios BAYAM, 205
modules, dont 90 appels HTTP anonymes**. Une publication coûte ~94 opérations
Make ; STATUSES 30,4 par passage. Le module 3 de `CREER SERIE` appelle un
webhook — c'est-à-dire un autre scénario — parce que **Make n'a pas de
sous-fonction** : une partie de la fragmentation est une contrainte de l'outil,
pas un choix des collègues.

`scripts/mesure-facades.js` range les 20 façades : 4 en logique pure (se rendent
en natifs Make), 6 en HTTP générique (module standard), 7 spécifiques Iconik
(1 à 10 appels chacune) et `iconik.action` avec ses 41.

### Ce qui a été construit puis retiré le même jour

Une carte « Verbes » permettant de composer un verbe à la main. Retirée : la
page Infrastructure **récolte et éprouve**, elle ne compose pas — et surtout,
la correspondance verbe → appels se **dérive** (mesure ci-dessus, corroborée par
le blueprint de `CREER SERIE`). Construire une interface pour la saisir revenait
à demander de comprendre Make, ce qu'APS existe pour éviter.

## Méthode

Tout mesuré. Six corrections de mes propres chiffres ou classements en cours de
route — le plus notable étant « 53 → 120 opérations testables » attribué au
remplissage par exemples alors que 61 venaient du contexte de test.

Et le partage des rôles, tel qu'il s'est vu : l'utilisateur a repéré avant moi
le bandeau vert sur zéro test, les champs AWS restés visibles, le type MCP
absent du formulaire, la fiche affichée en double, et `llms.txt` illisible dans
la police d'interface. Cinq défauts d'interface, tous invisibles depuis le code.

## Reste ouvert

**VOD Factory — mis de côté par l'utilisateur, pas fini**

- Coordonner avec les collègues avant de publier STATUSES (deux écrivains à 02:00).
- Le port `default` de « Programme ? » : l'utilisateur veut **un nœud de
  notification**, pas une arête. Pas urgent.
- Rejeu de PUBLISH après le correctif de boucle. Plus tard.
- Complétude du payload (24/30 Épisode au 7 août) — à remesurer **en rejouant
  `lookup()` hors ligne**, surtout pas via `vodFactoryPayload` qui est le
  `resultVar` de la réponse partenaire.
- `BayardID` absent sur des collections Épisode ; le `.mxf` contractuel.

**Infrastructure — la marche suivante**

Dériver la correspondance **verbe → appels** en croisant les trois sources
(handlers du moteur, blueprints Make, spécification), et en faire un
**générateur** : `NodeDefinition`, puis l'app custom Make. C'est un calcul, pas
un écran.

Ce que le calcul ne couvrira pas, et qu'il faudra trancher : les paramètres de
conception qui ne viennent d'aucun appel (`create_tree` a un gabarit, un champ
d'identifiant, un nom de parent), et le découpage d'`iconik.action` — que
`nested` sur un select résout élégamment côté Make.

**Transport des ressources vers Make**

Les **Data Stores** existent et l'API les pilote (`/data-stores`,
`/data-structures`). Vos collègues s'en servent déjà. Mais transporter la table
ne suffit pas : l'**interprétation** du manifeste vit dans les handlers
`deliver`/`verify`/`history`. Si APS n'est pas là, l'app custom doit la porter.
Dimensionné : ~6 modules pour les verbes + 4 qui portent de la logique.

**Noté pour plus tard**

`app_documentation_get` et `rpc_execute` sont les deux seuls outils MCP sans
équivalent dans l'API — le premier lira notre propre app custom, le second
alimente les listes déroulantes dynamiques. Inutiles aujourd'hui, utiles quand
on publiera.
