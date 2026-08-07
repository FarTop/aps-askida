# Workflow Builder — état des décisions

> **À soumettre en début de session, avec `methode-travail-aps.md`.**
>
> Ce document donne l'**état** : ce qui est tranché, ce qui reste ouvert.
> Les journaux `_journaux/` donnent le **récit** : pourquoi, et ce qui a été
> écarté. Lire ce document suffit pour travailler ; lire le journal sert quand
> on veut comprendre une décision ou la remettre en cause.
>
> Dernière mise à jour : 6 août 2026, fin de soirée (**les quatre niveaux du
> manifeste publiés pour de vrai** — Série, Saison, Épisode, Unitaire, chacun
> révélant des chemins de code jamais parcourus. Sept correctifs, dont trois
> trouvés parce que l'utilisateur a contesté mon diagnostic et avait raison :
> le registre d'identifiants n'était branché que sur le mode numérique (moitié
> manquante de la décision du 29 juillet), le format `timestamp` ne pouvait
> pas entrer dans un champ Iconik entier (d'où `timestamp_numeric`), et
> « Génère un ID » emprisonnait l'écriture de la parenté (dédoublé dans le
> Tree Builder sur proposition de l'utilisateur). Plus : segment de chemin
> amputé sur les niveaux non-racine, un chemin non résolu qui devenait une
> vraie destination S3 chez le partenaire, et `.mxf` absent du repli
> d'essences. La chaîne s'arrête désormais sur un **refus de VOD Factory**
> — qui n'accepte pas le `.mxf` — et non plus sur un défaut de notre côté.
> Cf. section « Les quatre niveaux publiés » tout en bas, et le point de
> départ ci-dessus, réorganisé en bloquants / dette / chantiers.)
>
> Historique : 6 août 2026, soir (**PUBLISH v2 mené jusqu'à une
> publication réussie de bout en bout** sur de vrais clics Custom Action
> Iconik — Partner HTTP 201, Verify 3/3, History "✅ Succès" — après avoir
> remonté une chaîne de **cinq causes empilées** dont aucune n'était celle
> qu'on croyait : port inversé sur la Search, arêtes dupliquées faisant
> tourner la branche aval deux fois, chemin S3 sans le préfixe de l'Export
> Location, repli mort `{collectionCheck.title}` privant le payload de son
> titre, et un upsert qui **masquait** le refus d'origine (422) derrière sa
> conséquence (404). Plus : la relecture des métadonnées Iconik était
> **toujours vide** (dict plat vs `metadata_values`), d'où un historique
> qui ne s'accumulait jamais ; une publication réussie ne pouvait jamais
> être rapportée `success` (nouvelle sévérité `info`) ; **Run › Action
> entièrement refondu** en résumé lisible par famille — les 23 entrées du
> registre couvertes, brut relégué derrière un dépliant — avec deux
> instrumentations du moteur (trace par règle du Lookup, trace par
> sous-étape des séquences HTTP, corps *envoyé* enfin conservé) ; et le
> **volet API ops porté de WFD**. Cf. les trois sections datées du 6 août
> tout en bas.
>
> Historique : 6 août 2026, matin (**panneau Run refondu en inspecteur à 3
> onglets Assets/Action/Debug**, **badges de job flottants réellement
> animés sur le canevas** — port fidèle de WFD après deux tentatives en CSS
> refusées par l'utilisateur —, **noms Iconik résolus en direct** pour les
> collections dans Assets, et **deux points d'entrée supplémentaires pour
> ouvrir le corps d'un Loop**. Bugs réels trouvés : double-comptage Assets,
> deux bugs d'auto-save qui effaçaient l'état du panneau, un vrai bug de
> clipping CSS confondu deux fois avec un connecteur de fil.)
>
> Historique : 5 août 2026, fin de session (**animation live des
> jobs sur le canevas** — badges/arêtes surlignées/onglet Debug — pour
> faciliter les tests manuels, motivation directe de l'utilisateur. Corrige
> le bug WFD le plus gênant vécu en production : un nœud en erreur qui
> continue ne reste plus visuellement figé/confondu avec une pause — cf.
> section "Animation live des jobs" pour le diagnostic exact et
> l'architecture. Trouvé et corrigé au passage : un vrai bug de fond sur les
> nœuds `decision` (30 arêtes cassées en base, dont PUBLISH — toute arête de
> décision dessinée depuis le canevas était silencieusement non-fonctionnelle
> à l'exécution). Plus tôt le même jour : fix Recheck S3 sur PUBLISH v2,
> versionnement complet (restaurer/supprimer une version, dépublier/
> republier un workflow — `BuilderFlow.active`), et disposition automatique
> des nœuds (Tidy, `dagre`) déclenchée par un incident réel en testant le
> versionnement. Décision utilisateur actée : abandon de PUBLISH v1 au
> profit de v2, bascule elle-même **pas encore faite à l'époque** — faite
> depuis, cf. paragraphe du 6 août ci-dessus.
>
> Historique : 5 août 2026, plus tôt (**moteur d'exécution natif du pivot
> construit et vérifié en conditions réelles** —
> `server/engine-builder/`, 12 Cores + 11 Facades, zéro dépendance runtime à
> WFD. Décision de l'utilisateur en début de session : arrêter de valider des
> workflows sans jamais pouvoir les exécuter pour de vrai — "je ne veux pas
> investir du temps en bossant sur un moteur qui disparaîtra". Vérifié en
> faisant tourner PUBLISH — le vrai workflow VOD Factory, pas un test jouet —
> côte à côte avec WFD sur une vraie collection QA (Star Trek) : les deux
> moteurs produisent une trace **identique, étape par étape, port par port**,
> sur les 14 étapes, avec de vrais appels Iconik/S3/API partenaire. Deux
> bugs réels trouvés dans le document PUBLISH lui-même au passage (pas dans
> le moteur, cf. section "Moteur d'exécution natif" plus bas) et corrigés
> en base).
>
> Historique : 4 août 2026, fin de session (reconstruction PUBLISH
> nœud par nœud poussée jusqu'à l'étape 12 — HTTP Sequence — avec deux
> questions de conception encore en suspens. Cf. section "Reprise PUBLISH —
> tableau, bugs, HTTP Sequence" plus bas pour le détail et le point de
> reprise exact).
>
> Plus tôt le 4 août : éditeur de corps de boucle construit — `wf-scope.js` —
> en creusant un trou trouvé en continuant PUBLISH après Deliver : Iconik ne
> sait déclencher un Export Location que par asset individuel, jamais en bloc
> sur une collection, donc le vrai motif est Search → **Boucle** → Action →
> Attendre. Deux bugs réels trouvés au passage : `pivot-validate.js` validait
> un vieux vocabulaire de boucle (`params.over`/`as`) que ni le panneau ni le
> moteur n'ont jamais utilisé — toute boucle réelle échouait la validation
> complète, invisible jusqu'ici faute de boucle jamais menée jusqu'au bout ;
> et `wf-persistence.js` n'avait jamais de `module.exports`, jamais testable
> hors navigateur.
>
> **Vérifié pour de vrai dans un navigateur avant la fin de la session** —
> `chrome-devtools` (MCP) installé et pointé sur Brave (pas de Chrome sur
> cette machine, l'extension `claude-in-chrome` reste bloquée par une
> restriction macOS). Un troisième bug réel trouvé en regardant l'écran, pas
> en lisant le code : le fil d'Ariane restait visible à la racine — une
> règle CSS auteur (`display: flex`) bat toujours la règle `[hidden]` de
> l'agent utilisateur, quelle que soit la spécificité. Corrigé. Le reste
> (glisser un Loop, entrer/sortir, glisser un nœud dans le corps, badge "N
> steps", bouton "Edit body →", sauvegarde + rechargement complet avec
> positions restaurées, panneau Variables avec `{item}`) fonctionne comme
> prévu. Cf. section "Éditeur de corps de boucle" plus bas pour le détail.
>
> Plus tôt le 4 août : Manifeste étendu aux 4 niveaux (`appliesTo` par
> essence), contenu réel saisi dans "PRIME", et un bug S3 réel corrigé au
> passage — `list_objects` remontait récursivement les fichiers des niveaux
> enfants, faute de `delimiter`. Cf. section "Manifeste — étendu aux 4
> niveaux" plus bas pour le détail.
>
> Historique : 3 août 2026, fin de journée (construction PUBLISH nœud par
> nœud très avancée — Trigger jusqu'à Deliver posés ; nouvelle façade
> Ancestor Resolver construite et vérifiée contre les vraies données ;
> blocage identifié sur le Manifeste. Cf. `journal-aps-2026-08-03.md`,
> section "Test grandeur nature" pour le récit complet).

---

## Point de départ pour la prochaine session

> Mis à jour le 6 août, fin de soirée. Les quatre niveaux du manifeste ont
> été publiés pour de vrai ; les points 0. et 2. de la liste précédente sont
> résolus. Ce qui reste se répartit en trois familles : **bloquants côté
> partenaire** (hors code), **dette de conception connue**, et **chantiers
> non commencés**.

### Bloquants — à lever avec Bayard / VOD Factory (hors code)

0. **VOD Factory refuse le `.mxf`** — réponse littérale de leur API :
   « must be one of the followings : mp4, mov, ts, mpeg, mpg ». Le contrat
   tacite qui met le transcodage à leur charge n'est pas implémenté côté
   validation. Trois issues possibles : ils élargissent, le master est
   transcodé avant livraison, ou un `.mp4` accompagne le `.mxf`. Tant que ce
   n'est pas tranché, **aucun Unitaire ni Épisode ne peut aboutir**.
1. **Aucune correspondance `Unitaire` dans la table `ContenuPrime`** du
   mapping VOD Factory — le partenaire répond « The selected type is
   invalid ». Série/Saison/Episode ont la leur (`serie`/`season`/`episode`).
   Il faut savoir quel type ils attendent (`program` ? `movie` ?) puis
   ajouter la ligne dans la correspondance.

### Dette de conception identifiée

2. **Le manifeste n'est pas consulté dans le corps de boucle** —
   `Check Asset` et `Recheck` n'ont pas de `manifestId` et retombent sur des
   filtres codés en dur. Conséquence directe : **toute extension ajoutée à
   `reconnu_par` y restera sans effet** (c'est ce qui a masqué le `.mxf`).
   Leur attacher le manifeste est la correction de fond, mais elle ferait
   tourner la vérification de cardinalité sur un listing réduit à un seul
   fichier — port `miss` au lieu de `out`, plus des lignes d'information à
   chaque itération. À trancher avant de la faire.
3. **L'identifiant de l'Épisode reste sur la collection** — `Set Bayard ID`
   écrit le `BayardID` généré sur la collection, ce qui la rend stable et
   fait qu'une resoumission METTRA À JOUR l'épisode chez VOD Factory au lieu
   d'en créer un nouveau. C'est l'inverse de l'intention du 16 juillet
   (« resoumission = nouvel asset = nouvel ID = objet distinct »). Piste :
   porter l'identifiant sur l'asset vidéo plutôt que sur la collection —
   ce qui change aussi la source de l'`external_id` dans le Lookup.
4. **Une republication ne repasse pas par la boucle** quand les fichiers sont
   déjà livrés (`Check Collection` → `out`) : tout ce qui y est calculé
   (`duration`, infos techniques) manque au second passage. La clé est alors
   omise du corps de requête, pas corrompue — donc silencieux. À surveiller
   si le partenaire rend un de ces champs obligatoire.
5. **Formats d'identifiants mixtes en base** — les collections déjà créées
   gardent leurs 8 chiffres (le registre les réutilise), les nouvelles
   prendront 14 chiffres si `timestamp_numeric` est sélectionné. Cohabitation
   volontaire ; purger le registre est possible mais n'a pas été fait.
   Les 4 nœuds Créer sont **encore en `numeric`** — seul PUBLISH est passé en
   `timestamp_numeric`.

### Chantiers non commencés

6. **Statuses** (`BAYARD|CHECK|STATUSES|VODFACTORY`, 11 nœuds incl.
   boucle/checker/history×3) — complexité comparable à PUBLISH, différé
   depuis le 5 août. Le plus gros morceau restant.
7. **`iconik.create_tree` sans résumé spécialisé** dans Run › Action (repli
   lisible « valeurs écrites ») — seule famille du registre sans vue dédiée.
   À traiter avec les workflows Créer, qui l'utilisent comme nœud central.
8. **Bug d'affichage non reproduit** — « clic sur un nœud → API Ops s'ouvre,
   sorte de zoom, partie du canevas inatteignable ». Vérifié : le clic
   n'ouvre pas le volet, le zoom ne change pas, le cadre ne rétrécit pas.
   Mesuré en revanche : le volet fait 240px pour 1281px de contenu, et il
   SUPERPOSE le canevas. Capture attendue de l'utilisateur.
9. **Résolution de nom Iconik limitée aux collections/assets hors boucle** —
   la plomberie est branchée pour `loopInfo`, mais les assets de recherche
   portent déjà un titre en pratique : ce chemin n'a jamais été vu se
   déclencher.

<details>
<summary>Historique — points de reprise du 6 août au matin (résolus depuis)</summary>

- ~~Webhook réel Iconik jamais cliqué~~ — fait toute la journée du 6 août
  (cf. section "PUBLISH v2 mené jusqu'à une publication réussie").
- ~~Badge de boucle = dernière itération seulement~~ — les échecs
  individuels sous `onError:'continue'` sont désormais listés dans le
  résumé Loop de Run › Action.

</details>

<details>
<summary>Historique — points de reprise du 5 août (résolus depuis)</summary>

- ~~Reconstruire les workflows Créer~~ — fait le 5 août (confirmé par
  l'utilisateur, cf. mémoire projet).
- ~~Panneaux Logs/Run du canevas~~ — refondus le 6 août (cf. section
  "Panneau Run refondu" tout en bas) après un premier jet le 5 août jugé
  trop proche de l'ancien panel WFD.
- ~~Webhook jamais essayé~~ — partiellement fait : déclenchement manuel
  testé à fond le 6 août, vrai clic Iconik toujours ouvert (point 0.
  ci-dessus).
- ~~Deux imperfections PUBLISH (`field:"_"`, `loopVariablePath`)~~ —
  fixées avant la fin de la session du 5 août (cf. section "Recheck S3 de
  PUBLISH v2").

</details>

<details>
<summary>Historique — points de reprise du 4 août (résolus depuis)</summary>

1. ~~Configurer l'étape 12 (HTTP Sequence "Publication API")~~ — fait le 4
   août (ressource `Endpoint`, cf. section "Étape 12").
2. ~~Verify/History pilotés depuis le Manifeste~~ — fait le 4 août (cf.
   sections "Verify piloté depuis le Manifeste" / "History piloté depuis
   le Manifeste").

</details>

3. **Vérifier à la main dans un navigateur le reste déjà en attente** —
   l'éditeur de corps de boucle est vérifié (4 août, outil `chrome-devtools`
   en MCP, pointé sur Brave), mais le badge statut/Publier, le panneau
   Variables du 3 août, les correctifs pastille de connexion et les chips
   `appliesTo` du Manifeste restent testés uniquement via retours directs de
   l'utilisateur ou API directe (curl), jamais par un navigateur dans cet
   environnement.
4. **Élargir le catalogue de variables au fil de la construction** — chaque
   façade posée pour de vrai doit recevoir sa déclaration `variables()`
   vérifiée contre le handler, comme Trigger/Search/History/Lookup/
   aps.registry/Ancestor Resolver aujourd'hui. Les façades non encore
   déclarées renvoient `[]` — absence de preuve, pas invention.
5. Historique des versions publiées : la route existe (`GET
   /builder-flows/:id/versions`), aucun écran ne l'affiche ; pas de rollback
   construit.

---

## Les trois critères qui tranchent

Quand une décision hésite, ces trois-là ont servi à décider. Ils valent mieux
qu'une règle particulière.

1. **On ne fusionne que ce qui raconte la même chose.** Le partage de code
   n'est pas une raison — il se règle dans l'implémentation, pas dans le
   catalogue.
2. **Si c'est déductible, ce n'est pas stocké.** Ce qu'on écrit dans le format
   finit par diverger de ce qu'il décrit.
3. **Un nœud qui ne peut pas résumer ce qu'il fait en quelques lignes cache
   quelque chose.** Soit la ressource externe est trop riche, soit le nœud fait
   trop.

Un quatrième, hérité de WFD et payé cher : **une question qui porte sur la
mécanique de l'outil est un défaut de l'outil.** Une question qui porte sur
Iconik ou sur le partenaire n'en est pas un.

---

## Catalogue — figé le 23 juillet

Noms en anglais : ce sont les termes du métier, y compris chez les
non-anglophones, et un ingénieur Switch, Vantage ou Node-RED les reconnaît.
L'interface d'APS reste multilingue ; le catalogue non.

### Core en service — 12

```
Trigger · Decision · Loop · Verify · Wait · Set Variable
Transform · Lookup · HTTP Request · HTTP Sequence · History · Deliver
```

### Déclarés, hors première coupe — 5

`QC` · `Script` · `Delay` · `Approval` · `Call Workflow`

Ils n'entrent que lorsqu'un besoin se présente. **Règle : un nœud entre au
catalogue quand il sert.** WFD avait six nœuds déclarés et vides — ils
occupaient la palette et promettaient ce que les générateurs ne tenaient pas.

### Façades — 8 (mis à jour 31 juillet, cf. audit ci-dessous)

`Search` · `Fetch` · `Set Metadata` · `Action` · `Create Tree` · `S3` · `Trigger` · `History`

`Trigger` et `History` manquaient de ce décompte alors que le catalogue les
portait déjà (`Trigger`) ou venait de les recevoir (`History`, scindée d'un
Core qui portait à tort du vocabulaire Iconik — voir audit).

### Services — 2

Registre d'identifiants externes (`BayardRegistry`, table Prisma réelle —
réutilise l'ID existant d'un objet plutôt que d'en régénérer un, garantit
l'unicité des nouveaux) · compteur d'ordre. Les seuls mécanismes qui
exigent un état partagé et atomique ; aucun moteur ne sait les porter.

**Corrigé le 3 août** : la façade dédiée du registre (`aps.registry` /
Générateur d'ID) était masquée de la palette du canevas depuis le 28
juillet ("les services ne sont pas des nœuds à poser"). Ça contredisait la
phrase juste en dessous — *"soit par une façade dédiée"* — et surtout le
vrai flow de production, où Générateur d'ID est un nœud autonome et visible
avec son propre déclencheur (`Bayard ID ?` → branche "ID Vide"), pas un
mécanisme invoqué en silence. Démasqué ; `isService` reste utile ailleurs
(déduction des services requis par un workflow), mais ne conditionne plus
la visibilité dans la palette.

### Ressources — 3

Manifeste de livraison · modèle d'arborescence · table de correspondance.
Nommées, réutilisables, éditées dans leur propre écran.

La table était jusqu'ici enfermée dans la configuration du nœud `Lookup`
(`lkRows`), donc recopiée à chaque usage. Elle remplit pourtant les trois
critères, et l'argument décisif est qu'elle sert **deux étapes** : `Lookup` la
lit pour traduire, `HTTP Sequence` s'appuie sur ce qu'elle produit pour publier
les personnes.

---

## Format pivot

### Trois niveaux, jamais deux

```
core     http_request          universel, compilable partout
facade   iconik.action         vocabulaire plateforme, sait se déplier
preset   collection_create     pré-sélection de champs
```

`create_col`, `acl`, `link_file`, `relate` ne sont **jamais** des types de
premier rang — ce sont des `preset` d'`iconik.action`.

Un Core pur n'a ni `facade` ni `preset`. **L'absence est significative** :
c'est ce qui le distingue d'un nœud de plateforme.

### « Façade » veut dire paquet de plateforme, pas « Iconik »

APS est une plateforme parmi d'autres. L'appel à un service s'écrit donc :

```
core: http_request · facade: aps.registry · preset: ensure_external_id
```

Il n'y a pas de quatrième genre à inventer. Un service est une **capacité
offerte par le paquet APS**, invoquée soit par une façade en interne — comme
`Create Tree` qui appelle le registre et le compteur — soit par une façade
dédiée.

### Ce que le pivot stocke

| | |
|---|---|
| Workflow | identité, intention, plateforme, environnement, **version** |
| Étapes | identifiant propre, `core`, `facade`, `preset`, paramètres, intention |
| Structure | enchaînement, et **le corps de boucle imbriqué** |
| Gestion d'erreur | réglage du workflow |
| Présentation | positions, sauts de page — **section séparée** |

### Ce qu'il ne stocke pas

**La portabilité** — chaque générateur déclare ce qu'il sait porter, le Builder
en déduit. La stocker garantirait qu'elle dérive.

**Le caractère destructif** — déclaré par la façade.

**Les services requis** — déduits des étapes qui les invoquent (`facade:
aps.registry`) et des façades qui les appellent en interne, comme `Create Tree`.
Les lister au niveau du workflow garantirait qu'ils divergent le jour où une
façade cesse d'appeler le compteur.

**Les ports** — déduits de la déclaration du `core` et de la configuration.
`Decision` a autant de sorties que de conditions plus une ; `Verify` en a trois
quoi qu'il arrive. Cela règle au passage le bug d'index positionnel de WFD.

### Format canonique et format d'échange

Conséquence du point précédent : **le pivot n'est pas autoportant.** Il faut le
catalogue pour l'interpréter.

Deux artefacts, comme un source et un binaire :

| | |
|---|---|
| **Format canonique** | ce qu'on stocke et versionne — sans ports, sans propriétés déduites |
| **Format d'échange** | ce qu'on livre à un tiers — projection résolue, ports inclus |

Livrer le catalogue avec le format serait fragile : il évolue. Livrer une
projection résolue est stable, daté, et se lit sans rien d'autre. C'est ce qui
part chez Embrace pour Pulse It.

### Identifiants

Propres au pivot, dérivés du nom métier (`boucler_sur`, `export_location`).
**Jamais hérités du producteur** : les identifiants WFD partagent un long
préfixe commun, ce qui a provoqué des collisions massives à la génération BPMN.

---

## Versionnement — construit le 3 août

`BuilderFlow.document` reste le brouillon : écrasé à chaque enregistrement,
librement éditable en permanence. `BuilderFlowVersion` (nouvelle table,
append-only) porte les instantanés figés :

| | |
|---|---|
| **Brouillon** | `BuilderFlow.document`, écrasé à chaque enregistrement |
| **Publier** | `POST /builder-flows/:id/publish`, geste explicite, crée une ligne `BuilderFlowVersion` |
| **Statut** | `'draft'`/`'published'` — **déduit**, jamais stocké : le brouillon actuel est-il identique à la dernière version figée (hors présentation) ? |

**Pas de verrou d'édition** — décision prise le 3 août : la copie figée
protège déjà tout, un cadenas d'édition n'ajouterait rien. Le mock qui
existait dans le canevas (`data-active`, "Active flow — deactivate to
edit") a été retiré plutôt que branché.

**La présentation n'est pas versionnée**, comme prévu : exclue du document
figé au moment de publier, et exclue de la comparaison qui déduit le statut
— déplacer un nœud ne fait jamais croire à une divergence.

**Pas de pont vers une exécution réelle.** Publier fige un document ; rien
ne le convertit ni ne l'active dans un moteur. Voir la clarification WFD
ci-dessous — c'est délibéré, pas un oubli.

**Construit le 5 août, plus tard le même jour** : écran d'historique
(bouton 🕘, popover listant les versions), **restaurer** une version
antérieure dans le brouillon (recharge le document choisi sur le canevas
via une commande annulable — Ctrl+Z défait tout d'un coup — jamais
d'écriture serveur directe), et **supprimer** une version (`DELETE
/builder-flows/:id/versions/:version`, ne touche jamais au brouillon).
Vérifié en direct sur le vrai flux PUBLISH (v1 à v6) : restaurer recharge
bien l'ancien document, supprimer la dernière version repasse le badge en
Draft. Piège trouvé en le vivant, pas en le lisant : le canevas auto-
sauve sur tout changement du modèle — Restaurer écrase donc le brouillon
en base en quelques secondes, pas juste à l'écran ; une confirmation
explicite a été ajoutée après coup pour ça (absente du premier jet).

**Aussi construit le 5 août : `BuilderFlow.active`** (dépublier/
republier), indépendant du statut brouillon/publié. Répond à une question
différente : ce flow doit-il encore réagir à un VRAI déclenchement Iconik
(webhook `/api/builder-engine/action/:slug`) ? Nécessaire pour la
migration v1→v2 de PUBLISH : les deux partagent le même Trigger Iconik
(même `wfdSlug`/`customActionId`), donc publier v2 pendant que v1 est
encore publiée aurait déclenché les deux à la fois sur un vrai clic
Custom Action. Un flow désactivé reste publiable/testable en manuel/API —
seul le webhook le filtre, avec un diagnostic dédié ("désactivé" vs "non
publié" vs "aucun flow").

**Collision de vocabulaire `draft`/`draft` — déjà résolue, pas le 3 août** :
vérifié par `git log`, la séparation existe depuis le 24 juillet
(`pivot-schema.js`) : `draft` au niveau étape est une clé bannie du pivot
(`CLES_SUPPRIMEES`, scope `'etape'` — c'est le sens WFD "à configurer",
jamais transporté dans le pivot), `status: draft|published` au niveau
workflow est un mot différent, sans collision réelle une fois les deux
scopes distingués par `pivot-validate.js`. Une note précédente de ce document
affirmait à tort que c'était encore à régler.

**Pont Builder ↔ exécution — clarifié le 3 août, pas construit** :
`pivot-to-wfd.js` existe et est testé, mais rien ne l'appelle côté serveur —
aucun `BuilderFlow` ne produit aujourd'hui un `Flow` WFD exécutable.
Précision de l'utilisateur : **WFD est un prototype voué à disparaître à
terme**, gardé comme base de comparaison fonctionnelle, pas une dépendance à
construire dans le Builder. Le moteur propre du Builder est un chantier
séparé, non chiffré — ne pas le confondre avec le garde-fou de statut, qui
ne porte que sur le document.

---

## Gestion d'erreur

**Plus de politique par nœud.** L'usage avait déjà tranché : `continue_log`
choisi 263 fois contre 66 pour `stop`. Un seul comportement — consigner,
continuer, notifier en fin. Cela supprime 360 réglages.

La **première erreur est la cause**, les suivantes en sont les conséquences.

La **notification décide du canal**, Iconik compris : statut `Echoué`,
historique, Slack, Teams sont des sorties d'un même endroit.

C'est un **réglage de workflow, mais affiché sur le canevas** comme une étape
terminale. Un réglage caché serait repris d'une main ce que le critère 3 donne.

| Sémantique | Portabilité |
|---|---|
| Transférer au gestionnaire | Node-RED, n8n, Step Functions, BPMN |
| Traversée inerte puis notifier | **APS uniquement** |

Les deux sont conservées, et la portabilité s'affiche **au moment du choix**.

**Règle des générateurs** : dégrader et le dire, omettre et le dire, ou
refuser. **Jamais omettre en silence.**

---

## Manifeste de livraison

Une **ressource**, pas un nœud. `Deliver` la désigne, comme `Create Tree`
désigne un modèle d'arborescence.

**Correction du 3 août, en vérifiant `pivot-manifest.js` avant de remplir un
vrai manifeste** : "un seul manifeste couvre tous les niveaux" décrit
l'intention posée le 23 juillet, **jamais construite ainsi**. La structure
réelle a un `niveau` UNIQUE par manifeste (`serie|saison|episode|unitaire|*`),
`valider()` ne connaît aucun champ `appliesTo` par essence. Décidé : construire
la vraie extension (ci-dessous, "Point de départ pour la prochaine session"),
pas contourner avec 4 manifestes séparés. Le paragraphe qui suit reste la
CIBLE, pas l'état actuel :

**Un seul manifeste couvre tous les niveaux** *(cible, pas encore construite)*.
Chaque composant porte deux jeux de critères, dans le même langage :

```
season_box_art
  s'applique si   TypeCollection  est  Saison
  trouvé par      dans la collection · titre contient _season
```

Le premier dit **quand** le composant compte, le second **où** le trouver.

**Deux sources possibles**, et `appliesTo` conditionne les autorisées :

| Le manifeste porte sur | Sources |
|---|---|
| une collection | recherche seulement |
| un asset | recherche **ou** fichiers de l'objet |

Une collection Iconik ne peut pas porter de fichiers — la contrainte se grise
toute seule à la saisie.

**Cardinalité** — exactement un · au moins un · plusieurs. Seul concept
vraiment nouveau ; détecte deux `cover_art` concurrents. Le même champ sert de
garde aux opérations destructives.

**Le chemin de destination est la chaîne des ancêtres**, chaque niveau
contribuant un segment formaté selon son type :

```
Série      {Univers}_{BayardID}
Saison     {title}_{BayardID}
Épisode    {title}
Unitaire   {title}
```

Quatre lignes au lieu de quatre chemins écrits à la main.

### Contenu réel vérifié le 3 août — en listant le vrai bucket S3

Pas deviné : le vrai bucket (`iconik-askida-stockage-hr`, connexion "S3 VOD
FACTORY") a été listé directement pour la chaîne réelle Série "Star Trek"
(BayardID 44931263) → Saison 01 (93431001) → Episode 01 (67939181), en
appelant `aws_s3()` du moteur directement (pas une simulation).

```
Série    AmazonPrime/Star_Trek_44931263/
           startrek_cover.png · startrek_hero.png · startrek_poster.png
           startrek_title.png (optionnel, seul absent nulle part ailleurs)

Saison   .../Saison_01_93431001/
           startrek_s01_cover.png · _hero.png · _poster.png · _season.png

Episode  .../Episode_01/
           Next_Generation.mp4 · Next_Generation.srt
           startrek_s01e01_episodic.jpg
```

Convention de nommage confirmée : le rôle apparaît en minuscule, n'importe où
dans le nom de fichier (`reconnu_par` en sous-chaîne suffit — pas besoin d'un
préfixe/suffixe strict). `box_art` (requis pour Unitaire d'après la doc
partenaire) n'a **pas** d'exemple réel dans ce bucket — cette chaîne est une
Série, pas un Unitaire/Program. À vérifier sur un vrai Unitaire si l'occasion
se présente.

Chemin `ancestorPath` calculé par le nouvel Ancestor Resolver (section
suivante) et chemin S3 réel : **identiques**, confirmé en listant.

---

## Ancestor Resolver — nouvelle façade, construite et vérifiée le 3 août

`iconik.resolve_ancestors` (handler `resolve_ancestors`, ajouté en fin de
`wfd-engine-handlers.js`). Remplace les 3-4 `Fetch` répétés par branche du
vieux WFD (`Fetch Série` / `Fetch Saison` / `Fetch Saison Titre`) — la
refonte du 23 juillet l'avait déjà décidé ("3 Fetch → 1 — les ancêtres se
résolvent seuls") sans jamais le construire.

**Mécanisme** : lit `TypeCollection`/`Univers`/`BayardID`/`title`/`ParentID`
déjà posés à plat par le Search précédent. Décide combien de niveaux
remonter selon le type (Série/Unitaire = 0, Saison = 1, Episode = 2), puis
remonte via une **recherche par BayardID** (`metadata.BayardID:"{ParentID}"`)
— un identifiant métier explicite, pas la relation structurelle `parent_id`
d'Iconik (moins fiable, dépend du rangement réel des collections). Assemble
le chemin selon la table ci-dessus, l'expose dans `{varName}` (défaut
`ancestorPath`).

**Portable** — vérifié explicitement : aucun appel à l'état interne d'APS,
seulement à l'API Iconik. N'importe quel autre moteur d'orchestration
reproduit le même algorithme. Contraste direct avec `aps.registry` en mode
Numeric (dépend de `BayardRegistry`, base d'APS) — le même test ("est-ce que
ça dépend d'un état interne à APS ?") a servi aux deux décisions.

**Bug réel trouvé en testant contre les vraies données, corrigé avant
livraison** : sans `view id` explicite, l'endpoint `/API/metadata/v1/
collections/{id}/` renvoie `{ Champ: { values:[{value}] } }` — PAS
`metadata_values`/`field_values` comme la première version du code
supposait (cette forme-là n'apparaît qu'avec `.../views/{id}/`, un id
spécifique à un environnement qu'on ne veut pas coder en dur ici).

**Testé de bout en bout** contre la vraie chaîne Star Trek (voir ci-dessus) :
chemin assemblé identique au vrai dossier S3.

**Reste ouvert** : le nœud n'a qu'un seul port de succès + un port d'erreur
générique (pas de distinction "ancêtre introuvable" vs "erreur réseau") —
suffisant pour l'instant, à affiner si besoin réel.

**`Deliver` ne connaît pas S3.** Sa destination est une **connexion typée** —
le modèle `Connexion` porte déjà `type` (`iconik | aws_s3 | http | listener`).
S3 en est une implémentation. C'est ce qui préserve le critère 2 : un Core
universel ne référence jamais une façade.

Le dépliage, lui, dépend des deux côtés : la façade de la plateforme source
sait pousser vers une connexion de destination — sur Iconik,
`export_location_trigger` puis attente puis vérification.

**Hors périmètre** : IMF, DCP, AS-11. Un moteur dédié les fera mieux, appelé
comme n'importe quel système externe.

---

## Manifeste — étendu aux 4 niveaux (`appliesTo` par essence) — 4 août

Suite directe du blocage de fin de journée le 3 août : `pivot-manifest.js`
n'avait qu'un `niveau` unique par manifeste, incapable de représenter qu'un
seul manifeste couvre les 4 niveaux avec des essences différentes par
niveau (cover/hero/poster/title pour Série, +season pour Saison,
episodic/video/subtitle pour Episode). Décision de fin de journée
appliquée : construire la vraie extension, pas contourner avec 4
manifestes/4 Deliver.

**`pivot-manifest.js`** : nouveau champ `appliesTo` par essence — tableau
de niveaux (`serie|saison|episode|unitaire`, même vocabulaire que `niveau`
au niveau du manifeste), absent ou `['*']` = tous niveaux (rétrocompatible :
un manifeste existant, jamais rempli avec ce champ, continue de compter à
tous les niveaux comme avant). `valider()` rejette un `appliesTo` vide ou
une valeur hors vocabulaire connu. `resumer()` affiche la portée entre
crochets quand elle est restreinte (`video (exactement 1) [episode,unitaire]`).

**`admin/manifests/manifests.js`/`.html`/`.css`** : 4 chips à cocher par
essence (Sé/Sa/Ép/Un) — toutes cochées par défaut (⇔ `appliesTo` absent).
Décocher une case restreint la portée de cette essence ; le résumé narratif
se met à jour en direct, même mécanisme que pour la cardinalité.

**`pivot-to-wfd.js`** (`_config()`, résolution `manifestId` → `s3Mappings`,
même mécanisme que `mappingId` → `lkRows`) : `appliesTo` transporté tel
quel sur chaque entrée de `s3Mappings` quand présent et restreint ; omis
(pas `['*']` recopié) quand l'essence s'applique à tous niveaux — cohérent
avec « ce qui est déductible n'est pas stocké ».

**`wfd-engine-handlers.js`, `aws_s3()` branche `list_objects`** : le vrai
garde-fou. Une table `TYPE_TO_NIVEAU` (`Série→serie`, `Saison→saison`,
`Episode→episode`, `Unitaire→unitaire`) traduit `ctx.vars.TypeCollection`
(posé à plat par le Search précédent — même champ que `resolve_ancestors`)
vers le vocabulaire du Manifeste. Une essence dont `appliesTo` ne contient
pas le niveau courant est **ignorée entièrement** : ni recherchée dans les
clés S3, ni comptée dans la cardinalité — c'est ce qui permet à un Deliver
unique, avec un seul `manifestId`, de couvrir les 4 niveaux sans jamais
signaler une essence manquante hors de sa portée. Sans `TypeCollection`
connu (contexte hors Search, valeur inattendue), **aucun filtrage** —
rétrocompat explicite, même principe que le reste du garde-fou de
cardinalité du 3 août.

**Testé isolément** (mock de `fetch`, pas de réseau réel — script non
commité), 4 cas en chaîne validation → résolution → exécution : (A) niveau
Saison, une essence `episode,unitaire` absente du dossier n'est pas comptée
en échec ; (B) niveau Episode, l'essence `episode,unitaire` présente est
posée normalement ; (C) niveau Episode, l'essence manquante fait échouer le
garde-fou de cardinalité (preuve que le filtrage n'empêche pas la
vérification quand l'essence EST dans la portée) ; (D) `TypeCollection`
absent, aucun filtrage, comportement identique à avant le 4 août. Vérifié
aussi contre l'API réelle (`/api/manifests` PUT avec `appliesTo`, round-trip
confirmé, manifeste réel restauré à son état d'origine après le test) —
le serveur avait le même piège de process obsolète que le 3 août (`node
server/index.js` démarré avant les modifications de ce jour), résolu par un
`kill` (LaunchAgent relance automatiquement).

**Contenu réel saisi dans le manifeste "PRIME" — même session.** Source :
la table officielle "Required" du doc partenaire (*Partner API – Onboarding
external*, citée dans `journal-aps-2026-07-16.md`, corrigée le 17/07) +
les vrais fichiers listés le 3 août. 9 essences :

```
cover/poster/hero   au_moins_un   [serie,saison,unitaire]
title                optionnel     [serie]
season_box           au_moins_un   [saison]
box                  au_moins_un   [unitaire]
episodic             optionnel     [episode]
video                exactement_un [episode,unitaire]
subtitle             au_moins_un   [episode,unitaire]
```

`cardinalite: au_moins_un` (pas `exactement_un`) pour les artworks
obligatoires — décision produit déjà actée le 16 juillet : "le dépôt prend
tout ce qu'il trouve... pour laisser Bayard ajouter de l'éditorial", donc le
garde-fou ne doit bloquer que sur l'absence, jamais sur le surplus. Deux
choix non explicitement tranchés par la doc, pris par défaut (à corriger en
un clic dans l'écran Manifestes si besoin) : `video` en `exactement_un` (un
seul fichier canonique — cohérent avec "resoumission = nouvel asset =
nouvel ID") et `subtitle` en `au_moins_un` (le doc groupe vidéo+sous-titres
comme ce qui remplace l'absence d'artwork obligatoire à ce niveau).

**Bug réel trouvé en vérifiant contre les 3 vrais dossiers (Série/Saison/
Episode de la chaîne Star Trek) — corrigé avant de considérer la
vérification concluante** : `aws_s3()` interrogeait S3 avec `list-type=2&
prefix=...` **sans `delimiter`**, donc récursif — le préfixe du dossier
Série remontait aussi tous les fichiers nichés dans sa Saison et son
Episode. Resté invisible tant que Deliver ne livrait qu'au niveau Episode
(une feuille, sans enfants) ; révélé pour la première fois en vérifiant le
Manifeste étendu contre un niveau non-feuille. Pire : l'ordre de tri S3
('S' majuscule < 's' minuscule) faisait gagner `Saison_01.../
startrek_s01_cover.png` sur le vrai `startrek_cover.png` de la Série — la
Série aurait silencieusement reçu l'artwork de sa Saison. Corrigé
(`delimiter=%2F` ajouté, paramètres re-triés alphabétiquement pour la
signature SigV4) ; `count` (déclenche le port "dossier vide") recalculé
depuis `keys.length` plutôt que `<KeyCount>` du XML (qui, avec `delimiter`,
compte aussi les sous-dossiers — aurait pu masquer un dossier réellement
vide de fichiers directs).

**Vérifié après correction**, contre la vraie chaîne Star Trek (même
connexion S3, mêmes 3 dossiers que le 3 août) : Série récupère son propre
cover/poster/hero/title (pas ceux de sa Saison), Saison son propre
cover/poster/hero/season, Episode son video/subtitle/episodic — les 3
niveaux passent le garde-fou de cardinalité sans erreur, chaque essence hors
de sa portée (ex. `season_box` au niveau Episode) correctement ignorée.
Manifeste "PRIME" restauré à son contenu réel (pas de rollback nécessaire,
contrairement au test intermédiaire de la section précédente).

**Reste ouvert** : Unitaire jamais vérifié contre un vrai dossier S3 (aucun
Unitaire réel connu au moment d'écrire) — contenu saisi d'après la doc
partenaire seule, à confirmer sur un cas réel si l'occasion se présente.

---

## Modèle de données

**Montrer, pas déclarer.** Le sélecteur affiche l'arborescence réelle des
données disponibles, avec leurs valeurs, rangées sous l'étape qui les a
produites.

```
▾ Recherche APS                    ← étape 4 a ajouté ceci
    search_results.count      1
▾ Boucler sur — item               ← étape 5
    item.metadata.BayardID    [ "67939181" ]   ⚠ liste
```

Même geste que dans une vue Iconik : on choisit dans ce qui est là, on n'écrit
jamais le nom à la main. Et les accolades ne se tapent plus — un champ de
nature « référence à une variable » les gère.

**La capture existe déjà** : l'exécuteur persiste le contexte complet après
chaque nœud (`wfd-run-history.js`, 500 runs, 90 jours). Comparer deux
instantanés consécutifs donne la **provenance gratuitement**. Il manque un
lecteur, pas un mécanisme.

**Trois sources**, par ordre de préférence — un run réel, le contexte de test,
la spec importée. Le sélecteur dit laquelle il a utilisée : une valeur venant
d'une spec n'a pas le même statut qu'une valeur observée.

**Contexte de test** : un objet réel attaché au workflow, choisi une fois. Sans
effet à l'exécution. Il sert au sélecteur, à la validation du manifeste, et
préremplit le test du déclencheur.

### Construit le 3 août — version réduite, pas la vision complète

Ni le run réel ni le contexte de test n'existent encore (pas de pont
d'exécution pour un `BuilderFlow`, toujours vrai). Version buildable
maintenant, sur ce qui existe déjà : le catalogue (`CAT.variablesDe(etape)`,
vérifié handler par handler — Trigger/Search/History/Lookup/aps.registry
déclarés à ce jour) + les vrais champs de métadonnées de l'org
(`ConfigSources`, déjà en cache). Deux endroits :

- **Sélecteur inline** — un menu accolé à tout champ de nature `variable`
  (config-renderer.js), qui remonte le graphe depuis le nœud courant
  (`_etapesPrecedentes`, parcours en largeur sur les arêtes top-level — ne
  descend PAS dans le corps d'une boucle, pas encore représenté dans ce
  canevas). Choisir une entrée écrit `{nom}` et repeint.
- **Panneau dédié** — nouvel onglet "Variables" à côté de Palette/Config/Run,
  repris du principe d'un panneau de WFD (`script-workflow-designer.js`,
  `_wfdCollectVars`) mais sans onglet "Dernier run" (rien à y montrer). Deux
  vues : "All" (tout le flow) et "Upstream of selection". Clic pour copier.

**Repli par défaut, retour utilisateur en testant** : les champs "si présent"
(métadonnées de l'org, potentiellement des dizaines par étape) rendaient le
panneau aussi peu lisible que celui de WFD — repliés derrière un "show N
possible fields", sauf en recherche active (filtrer ignore le repli). Un
doublon trouvé en même temps : Trigger proposait `collection_id` ET
`collection.id` pour la même valeur (le moteur pose bien les deux formes,
vérifié, mais ça n'ajoute qu'une question "laquelle ?") — une seule forme
montrée désormais.

**Reste ouvert** : seules 5 façades/cores sur ~20 sont déclarées — à
compléter au fil de la construction, façade par façade, quand elle sert
vraiment (même principe que le catalogue lui-même). Le corps d'une Loop
n'est pas parcouru — bloqué par un gap plus profond : une Loop n'a pas encore
d'éditeur de corps dans ce canevas.

### Portabilité affichée au choix — enfin câblée (3 août)

Le mécanisme décrit au 23 juillet ("✅ Node-RED · n8n · Step Functions vs ⚠
APS uniquement", affiché au moment du choix) n'existait nulle part dans le
code avant ce jour. Construit en généralisant la nature `choix`
(config-renderer.js) : un champ optionnel `portabilite` par option, affiché
en note sous le menu, mise à jour à chaque changement — jamais stocké dans
le modèle. Premier usage réel : le Type du Générateur d'ID (`Numeric` =
APS uniquement, dépend de BayardRegistry ; les 5 autres = portables, pur
calcul local). Réutilisable pour n'importe quel autre choix du catalogue.

### Générateur d'ID redémasqué de la palette (3 août)

`aps.registry` (`isService: true`) était masqué de la palette depuis le 28
juillet ("les services ne sont pas des nœuds à poser"). Contredit par le vrai
flow de production (nœud autonome, son propre déclencheur `Bayard ID ?`) ET
par la phrase juste en dessous dans ce document ("soit par une façade
dédiée"). Démasqué — `isService` reste utile pour la déduction des services
requis, ne conditionne plus la palette. Libellé palette ajusté (`nodeLabel`
sur la façade) : "ID Generator", pas "Registry" (dérivé du nom de façade,
peu clair une fois visible).

### Pastille de connexion — inactive vs non testable (3 août)

Retour utilisateur en configurant Deliver : une connexion S3 active
affichait la même pastille grise qu'une connexion inactive, donnant
l'impression qu'"Actif" (admin/connexions/, `isActive`, une case cochée à la
main) mentait. Ce n'était pas le cas — deux questions différentes (l'admin
ne fait aucun test en direct, la pastille du Builder oui, sauf pour S3 qui
n'a pas de handshake HTTP simple). Corrigé : un texte TOUJOURS VISIBLE à
côté de la pastille (pas juste une infobulle au survol) distingue
"inactive" de "not tested — this type has no live check".

---

## Panneau

**Déclarer les champs au lieu de les écrire.** WFD a 236 champs et 11 aides,
parce que le panneau est du HTML écrit à la main sur 10 400 lignes.

**Neuf natures suffisent** : texte, nombre, booléen, choix, référence à une
variable, objet Iconik, connexion, tableau de lignes, expression.

```
parentId:
  libellé : "Emplacement de création"
  nature  : collection Iconik
  si vide : "la collection depuis laquelle l'action est déclenchée"
  aide    : "Où la collection sera créée dans Iconik."
```

Quatre bénéfices automatiques : l'aide existe toujours · **le défaut est
visible** · **les champs cachés sont effacés** · la nature permet de valider.

Et la déclaration alimente aussi la **documentation générée** — un champ décrit
une fois sert le panneau, la validation, la doc et les exports.

**`aide` et `siVide` sont deux emplacements distincts**, jamais interchangeables.
Les placeholders de WFD étaient tantôt informatifs, tantôt paramètres.

---

## Canevas

**Lire un workflow comme un livre** — d'où ça vient, comment c'est venu, ce
qu'on fait, où ça va. Un placement qui suit le sens du flux produit cette
lecture.

**Un workflow qui ne peut pas se représenter en angles droits est bordélique.**
Ce critère esthétique mesure en fait le couplage.

- Disposition en **couches** — rang par distance au déclencheur, ordre calculé
  pour minimiser les croisements. Le `Tidy` actuel ordonne sans regarder les
  liaisons, d'où un résultat inutilisable sur 76 nœuds.
- **Routage orthogonal**, points de passage évitant les nœuds.
- **Placement manuel conservé** — le rangement est une proposition qu'on accepte
  ou annule, jamais une réécriture silencieuse.
- **Le nombre de croisements devient un indicateur affiché.**

**Construit le 5 août** (déclenché par un incident réel : restaurer une
version sur le vrai PUBLISH a produit une cascade diagonale illisible sur
16 nœuds). `bpmn-auto-layout` (visé ci-dessus) écarté après vérification —
exige un aller-retour XML BPMN complet, mauvaise adéquation avec le
graphe pivot brut. `@dagrejs/dagre` retenu à la place (fork activement
maintenu, MIT), vendoré comme docx/exceljs (`_vendor/dagre/`, build UMD
~48 Ko). Bouton "Réorganiser" (🧹) + repli automatique partout où le
canevas se retrouvait sans positions (chargement initial, restauration de
version, première ouverture d'un corps de boucle) — plus jamais de
cascade. Pas de dialogue de prévisualisation accept/annule construit
(contrairement à l'intention ci-dessus) : Ctrl+Z suffit, cohérent avec
comment toute autre action structurelle du canevas fonctionne déjà. Le
nombre de croisements comme indicateur affiché n'est **pas** construit —
non demandé, dagre le minimise en interne mais rien ne l'expose côté UI.
Cf. section "Animation live des jobs" plus bas pour la suite du même jour.

L'algorithme de couches ne sera pas réécrit : `bpmn-auto-layout`, Apache 2.0.
**Correction du 5 août : si, `bpmn-auto-layout` a été réécarté — voir
paragraphe ci-dessus, `dagre` est ce qui tourne réellement.**

**Interface** : canevas au centre, panneaux sur les côtés, **étiquettes de
bord** qui révèlent le bon panneau — pas de bandeau surchargé de boutons.

---

## Architecture du chantier

**Pas de branche longue.** Le chantier est dans `server/public/builders/workflow/`,
dans `main`. L'amorce existe déjà : `workflow.html` (140 lignes), `workflow.js` et
`workflow.css` vides.

`builders/` est à la racine de `public/`, **à côté de `platforms/`** — et non
dedans. Les dossiers `workflow/`, `viewer/`, `settings/` de WFD sont sous
`server/public/platforms/iconik/` ; y placer le Builder l'enfermerait dans Iconik
et contredirait le principe même des paquets de plateforme.

**Le Builder n'écrit jamais dans `workflow/`.** Sur ce qui est partagé —
moteur, Prisma, connexions — il **ajoute**, ne modifie pas.

**Pont d'exécution** : le Builder produit le pivot ; un convertisseur
pivot → WFD permet au moteur existant de l'exécuter sans y toucher.

**WFD ne sera pas détruit** — il ne reçoit plus que des correctifs bloquants.

**Cloisonnement** : le modèle existe en base (`Organisation → Environment →
Flow`, `Project → Permission`) et rien ne l'applique. L'environnement portant
la plateforme, **les façades de déclencheur découlent du contexte** au lieu
d'être choisies. L'authentification est une couche APS, en amont — le Builder
consomme le cloisonnement, il ne le décide pas.

---

## Ordre de construction

Le modèle de données conditionne la propagation d'erreur, qui conditionne le
catalogue. Le packager conditionne la boucle et le Vérificateur. Le catalogue
conditionne le panneau.

1. **Format pivot** — avec `version`
2. **Paquet Iconik** — les 6 façades, avec leur dépliage
3. **Convertisseur pivot → WFD**
4. **Sélecteur de variables** — lecteur des instantanés déjà persistés
5. **Packager** — manifeste sur la mécanique des blocs
6. **Panneau déclaratif**
7. **Canevas**

**Test d'ensemble** : reconstruire PUBLISH dans le Builder. Il doit tenir en
dix étapes qui se lisent comme une phrase — *je récupère, je vérifie, je livre,
j'enregistre, je traduis, je publie, je constate, je note.*

---

## Audit des façades contre les données réelles — 31 juillet

Méthode, répétée pour chaque famille : sortir les occurrences réelles de
`_journaux/WORKFLOWS_WFD_VODFACTORY.json` (export du 29/07, les 6 flows
VOD Factory), lire le handler correspondant dans `wfd-engine-handlers.js`,
comparer au schéma du Builder, corriger ce qui ne colle pas. Récit complet
dans le journal du jour ; ici, l'état.

**Vérifiées et corrigées** (dans l'ordre de fréquence sur PUBLISH V2, 76
nœuds) : `aps_search` (17) · `update_meta` (9) · `workflow_history` (8,
scindée en façade `iconik.history`) · `decision` (7, bug réel : `on` au lieu
de `field`, aurait cassé toute décision construite dans le Builder) ·
`trigger` (façade enrichie aux 12 types réels du designer WFD, un seul
prouvé câblé — Custom Action) · `loop` (7, un seul mode fonctionnel sur 6,
les 5 autres catalogués mais marqués « fails at runtime ») · `action` (6,
41 actionType réels recensés, un seul détaillé — `export_location_trigger`)
· `wait_for` / `aws_s3.deliver` (6 chacun, réconciliés avec le manifeste
plutôt que de recopier le mapping S3 dupliqué à l'identique sur les 6
occurrences réelles).

**Restent à auditer** : ~~`checker` (5) · `fetch` (5) · `create_tree` (4) ·
`id_generator` (1) · `lookup` (1) · `http_sequence` (1) · `timer` (1)~~ —
toutes traitées le 3 août, voir section dédiée plus bas. **L'audit des
façades contre les données réelles est maintenant complet** : les 8 façades
+ les Core touchant une plateforme sont tous vérifiés contre au moins une
occurrence réelle et le handler du moteur.

**Règle confirmée pour trancher Core vs façade**, appliquée à chaque
famille de cette liste : est-ce que le nœud touche l'API d'une plateforme
précise, d'une façon précise à cette plateforme ? Si oui, façade — sinon,
Core pur. A fait basculer `History` et confirmé que `Decision`/`Loop`
restent des Core purs malgré leur richesse.

**Sourcing de données réelles (nouveau, réutilisable)** : `config-sources.js`
interroge Iconik **en direct** via `iconik-proxy` (en-tête `X-Force-Live`,
ajouté cette session — contourne le snapshot DB sans le supprimer pour les
autres appelants) plutôt que les tables de sync `Ikon*`/snapshot. Ces
tables sont peuplées par le bouton "Domaine → Site" de Settings — plomberie
de l'ancien Designer WFD, pas une dépendance que le Builder doit prendre.
Fonctions déjà là : `metadonnees`/`vuesMetadonnees`/`champsDeVue`/
`exportLocations`/`customActions`, toutes avec cache court en mémoire et
horodatage de fraîcheur (`dernierRafraichissement`/`onRafraichi`, affiché
dans le canvas). Tout nouveau besoin de données réelles doit passer par ce
même chemin, pas par une resynchro Ikon*.

**Bug canvas corrigé** : `WfConnect.brancher(...)` ne recevait pas `view`
— tracé de liaison faux à tout zoom ≠ 100 %. Un seul oubli de propriété,
pas un problème de fond.

**Rien n'est commité.** Tout ce qui précède est à l'état de modifications
non indexées dans l'arbre de travail (`git status`) — pas de branche créée.

---

## Ce qui reste ouvert

- **Le manifeste unique** — à éprouver en construisant PUBLISH. C'est le
  premier vrai test.
- **Les mark in/out des segments** — APS écrit `time_start` / `time_end` ; à
  confirmer qu'un GET les renvoie.
- **La famille média** — transcodage, subclip, consolidation, purge des
  sources. Ouverte, non conçue. `Transcode` y sera tranché : façade Iconik
  aujourd'hui, Core FFmpeg dans l'intention.
- **Les ressources d'administration** — connexions, manifestes, modèles :
  comment on les édite et les partage.

---

## Fuites à ne pas reproduire

Trois ont été trouvées dans WFD, toutes du même genre : de la présentation dans
le modèle métier.

- `pageBreakBefore` — réglage du générateur Word, sur **76 nœuds sur 76**
- `x` / `y` — positions du canevas
- `lkActiveTab`, `lkApiFolded`, `lkSourceFolded` — état de pliage de l'interface

Et une quatrième, d'un autre ordre : **40 occurrences de « Bayard » côté
serveur**, dont un modèle Prisma `BayardRegistry`. Un nom de client dans le
schéma du produit. Le Core parle générique — « identifiant externe » — et
`BayardID` est le nom que le **paquet Iconik de ce client** lui donne.

Ajouté le 3 août : `cronFreq`/`cronDays`/`cronHour`/`cronMinute`/`cronMday`/
`intervalStart` (widget de construction de cron de l'ancien WFD — seul le
`cronExpr` compilé compte pour le planificateur) · `viewFields` sur `fetch`
(snapshot de champs de vue jamais lu par le handler) · `lkTechMap`/
`lkTechVar`/`lkApiEndpoint` sur `lookup` (introuvables dans tout le moteur,
pas juste inutilisés par ce handler).

---

## Audit des façades restantes — 3 août

Suite de l'audit du 31 juillet, même méthode, sur les 7 familles qui
restaient : `checker` · `fetch` · `create_tree` · `id_generator` (aps.registry)
· `lookup` · `http_sequence` · `timer`. L'audit des façades est maintenant
**complet**.

- **`checker` (5 occ.)** : absent du schéma du panneau (aucun `case` ni bloc
  `core === 'verify'` cohérent) alors que le Core `verify` du catalogue s'y
  convertit (`familleWfd()`, `verify: 'checker'`) — **bug réel, silencieux** :
  un `verify` construit dans le Builder produisait un `checks: []`, donc un
  nœud qui retournait toujours succès sans jamais rien vérifier. Réécrit en
  liste de sondes (endpoint/method/path/op/value/label). `onError` retiré :
  checker() n'atteint jamais le catch générique de l'exécuteur (il gère ses
  propres erreurs).
- **`fetch` (5 occ., toutes en sous-type `metadata`)** : l'ancien schéma
  (connexionId/target/fetchVar) ne correspondait à aucun nom réel. Réécrit
  pour les 4 sous-types réels du handler (metadata/asset/collection/saved
  search). Port 1 renommé `error` → `not_found` (le handler ne route jamais
  une vraie erreur HTTP vers un port dédié — seulement des « non trouvé ») ;
  `httpMode` retiré du catalogue (mort : `fetch` a son propre handler nommé,
  jamais `handleHttpRequest`). Fichier `wfd-node-fetch.js` repéré comme mort
  (rien ne le `require`) — non touché, hors périmètre.
- **`create_tree` (4 occ.)** : même écart total (connexionId/root/template
  fictifs). Réécrit sur les vrais champs (`templateId`/`parentId`/
  `metadataViewId`/`idFieldName`…). `templateId` référence maintenant la
  ressource réelle `ArboTemplate` — nouvelle nature de panneau `gabarit`
  (config-renderer.js) + `arboTemplates()` (config-sources.js), calquées sur
  `manifeste`/`manifests()`. Risque signalé : `metadataViewId` vide fait
  échouer l'écriture de TOUS les champs, silencieusement, dans le handler.
- **`id_generator` / `aps.registry` (1 occ.)** : aucun schéma de façade
  n'existait (retombait sur le Core `http_request` brut). Réécrit ; `apiActions`
  volontairement omis — repose sur `conn.actions`, absent du modèle
  `Connexion` (jamais fonctionnel, même en configurant l'occurrence réelle).
  Port `error` retiré du catalogue (inatteignable sans `apiActions`).
  `outputType: integer` filtré hors des options sauf `idType: numeric` (évite
  un `parseInt` tronqué silencieusement sur un id hex/alphanumérique).
- **`lookup` (1 occ.)** : `source`/`key` fictifs, réécrit sur `lkInputVar`/
  `lkRows`/`lkFallback`/`lkOutputVar` réels. **Dette non comblée, documentée** :
  `lkRows` reste embarqué dans le nœud alors que builder-etat.md (section
  Ressources) dit déjà que cette table de correspondance devrait être une
  ressource d'org — le modèle Prisma `Mapping` existe mais n'a aucune route
  serveur (contrairement à `ArboTemplate`, qui en avait déjà une). Suivi
  flaggé en tâche séparée.
- **`http_sequence` (1 occ., 7 étapes : 5 foreach + 2 simple)** : réécrit en
  profondeur (`request.method`/`storeAs` fictifs). Chaque étape se délègue à
  `handleHttpRequest`/`_handleHttpForeach` — deux jeux de champs distincts
  selon `httpMode`. `onError` de séquence (top-level) retiré : mort, le vrai
  contrôle vient du `onError` par étape.
- **`timer` (1 occ.)** : **bug réel, le plus sérieux de cette passe** — le
  champ de planning s'appelait `cron` dans le panneau, mais le planificateur
  (`wfd-engine-trigger.js`, `scheduleTimer()`) lit exclusivement `cronExpr`.
  Un cron construit dans le Builder aurait toujours été ignoré, remplacé
  silencieusement par le défaut en dur du moteur (`0 9 * * 1-5`). Corrigé
  dans le panneau ET dans `familleWfd()` (testait `p.cron`, même faute).
  `timerMode` interval/oneshot ajoutés (câblés, non prouvés par l'occurrence
  réelle qui est en `cron`).

**Constat transversal** : sur les 7 familles, quatre schémas de panneau
n'avaient tout simplement **aucune correspondance** avec ce que le moteur
lit (`checker`, `fetch`, `create_tree`, `id_generator`) — pas des champs
approximatifs, des noms entièrement différents. Le bug `timer`/`cronExpr`
est le plus grave trouvé depuis `decision`/`on→field` : silencieux,
plausible (le nœud « fonctionne », juste jamais à l'heure demandée).

---

## Ressource Mapping — construite et branchée le 3 août

Suite directe de l'audit `lookup` ci-dessus : la dette signalée ("`lkRows`
devrait être une ressource d'org") est comblée le jour même.

- `server/routes/mapping.js` — CRUD org-scopé (calqué sur `connexions.js` pour
  le scoping, `arbo-templates.js` pour la forme), monté sur `/api/mappings`.
  Alias `rules` (colonne Prisma) ↔ `rows` (API) : l'écran
  `admin/ressources/ressources.js` (29 juillet, antérieur à cette route)
  attendait déjà `rows` pour mappings ET nommages — la route s'aligne sur ce
  contrat plutôt que de le changer.
- `config-sources.js` (`mappings()`) et `config-renderer.js` (nature
  `mapping`) — même mécanique que `manifeste`/`gabarit`.
- `config-schema.js` : le nœud Lookup ne stocke plus qu'une référence
  (`mappingId`) — plus de `lkRows` embarqué. Forme d'une row documentée en
  commentaire pour ne pas la reperdre : `{key, value, type?, _format?,
  fallback?, children?}`.
- `pivot-to-wfd.js` : **la résolution `mappingId` → `lkRows` réellement
  écrite**, pas juste un sélecteur qui ne sert à rien. `_config()` déplie la
  référence en tableau au moment de produire le format d'échange, depuis
  `options.resolutions.mappings` (fourni par l'appelant — aucun appel réseau
  dans le convertisseur, qui reste synchrone). Prouvé par un test isolé
  (conversion d'un pivot minimal avec `mappingId` + résolution injectée : le
  nœud WFD généré porte bien `lkRows` résolu ; sans résolution fournie,
  `lkRows` reste absent, sans fuite d'une conversion à l'autre).

**Reste ouvert, pas construit aujourd'hui** :
- **Aucun écran ne permet de créer/éditer les rows d'un Mapping** —
  `admin/ressources` n'affiche que nom + décompte, en lecture seule. Tant que
  cet écran n'existe pas, `mappingId` référence une ressource qu'on ne peut
  peupler que par API directe (POST/PUT `/api/mappings`).
- **`manifestId`, sur `aws_s3.deliver`, a le même défaut structurel** —
  vérifié en creusant un point du rapport de la tâche déléguée : AUCUNE lecture
  de `manifestId` nulle part dans le moteur (`wfd-engine-handlers.js`) ni dans
  `package-executor.js`. Ce n'est PAS un simple oubli symétrique à `mappingId` :
  la donnée qu'un manifeste doit produire à la résolution (dépliage par
  essence, vérification de cardinalité) n'est pas encore conçue — c'est le
  Packager, étape 5 de l'Ordre de construction, pas encore bâti. Ne pas le
  traiter comme une correction de parité rapide.
- La tâche déléguée avait aussi affirmé, à tort, que `/api/manifests`
  404 — cette route existe (montée via `wfd-data.js`, pas un fichier dédié).
  Vérifié en lisant le code, pas supposé.

---

## Tree Builder — 3ème onglet, gabarits édités dans le Builder — 3 août

Constat de l'utilisateur : les gabarits d'arborescence (ArboTemplate) se
créaient jusqu'ici dans le Designer de `platforms/iconik/viewer/` — plus en
adéquation avec le Builder, et un aller-retour entre deux apps distinctes
pour construire un workflow. Décision : un 3ème onglet "Tree Builder", à
côté de Workflows/Manifestes, même principe que les deux autres (une
ressource du Builder s'édite dans le Builder).

- `workflow.html`/`workflow.js` — 3ème onglet + liste (renommer/dupliquer/
  supprimer sur `/api/arbo-templates`, déjà un CRUD complet, aucune route à
  écrire).
- `arbo-canvas.html`/`.js`/`.css` (nouveau) — éditeur dédié. **Pas un canevas
  à positions/arêtes libres comme `workflow-canvas`** : un gabarit est un
  ARBRE strict (un parent), une liste imbriquée (indentation = hiérarchie)
  suffit et se construit/se lit plus vite. Chaque nœud : titre, type (texte
  libre + suggestions, jamais un choix fermé — un autre client peut avoir un
  autre vocabulaire), badge "Génère un ID" (`generateId`, le mécanisme
  historique du Designer, reproduit à l'identique). L'aide affichée à
  l'écran dit explicitement la règle de parenté actuelle (Parent ID = dernier
  ancêtre qui génère aussi un ID, pas forcément le parent direct) — sujet
  ouvert, à reprendre une fois l'outil pris en main.

**Bug réel trouvé en testant en direct** (pas en théorie) : l'unique
ressource `Mapping` déjà en base ("VOD Factory | Fields") utilise `src`/`tgt`
au niveau de chaque ligne — `lookup()` (wfd-engine-handlers.js) n'acceptait
CES noms que pour les enfants de traduction (`c.key || c.src`), pas pour la
ligne elle-même (`row.key || row.from` seulement). Toutes les lignes de
l'unique mapping réel étaient donc silencieusement ignorées (0 traduites,
aucune erreur). Corrigé (alias `src`/`tgt` ajoutés au niveau ligne, même
principe que l'alias déjà en place pour les enfants) et vérifié avec les
vraies données de ce mapping (`Classification` -> `rating`, `Genres` ->
liste traduite) : la traduction produit maintenant le bon résultat.

**Vérifié** : pages servies (200), `/api/arbo-templates` et `/api/mappings`
répondent avec de vraies données, `lookup()` testé directement en Node avec
le mapping réel. **Pas vérifié** : l'interaction visuelle réelle dans un
navigateur (ajout/suppression de niveau, sauvegarde) — l'outil Chrome n'était
pas connecté dans cet environnement. À tester à la main.

**Deux corrections après premier test réel par l'utilisateur** (capture
d'écran + retour) :
- **Listes obsolètes entre onglets** : `chargerGabarits()`/etc. ne
  s'exécutaient qu'au chargement de `workflow.html`, pas à chaque clic
  d'onglet — un gabarit enregistré sur `arbo-canvas.html` n'apparaissait
  donc pas tant que la page n'était pas rechargée. `activerOnglet()`
  recharge maintenant la liste concernée à chaque activation, et un
  écouteur `pageshow` (`e.persisted`) couvre aussi le retour arrière depuis
  le cache du navigateur (bfcache), qui ne réexécute pas le script.
- **Outils manquants sur Manifestes** : renommer/dupliquer/supprimer
  ajoutés, sur le même principe que Workflows/Tree Builder. Particularité
  de `/api/manifests` (contrairement aux autres ressources) : PUT/POST
  valident la structure complète via `PivotManifest.valider`
  (name/niveau/essences) — un PUT `{name}` seul échoue en 400. Renommer/
  dupliquer relisent donc le manifeste complet (GET /:id) avant d'écrire.
  Vérifié par un aller-retour réel (dupliqué puis supprimé un manifeste réel
  via l'API, cycle complet réussi).
- **CSS manquant sur arbo-canvas.html** : `org-context-selector.css` non
  inclus — le sélecteur d'organisation s'affichait sans style (liste
  déroulante blanche). Corrigé (une ligne oubliée par rapport à
  `workflow.html`).

**Numérotation par niveau (nodeDef.numberField), ajoutée le 3 août** —
suite d'une discussion sur la parenté : l'ancien mécanisme
(`orderFieldName`/`orderPad`/`orderSeed`) est un réglage de WORKFLOW,
appliqué SEULEMENT à la racine de ce qu'un appel Create Tree crée — un
gabarit à plusieurs niveaux numérotés (Série+Saison+Episode dans le même
arbre, comme le premier test de l'utilisateur) ne pouvait pas fonctionner
avec ce mécanisme. Décision : un réglage PAR NIVEAU dans le gabarit lui-même
(`numberField`/`numberPad`), au même titre que `generateId`, exposé dans
Tree Builder comme un badge "Numérote ce niveau" + le nom du champ.

Correction de fond demandée par l'utilisateur, pas juste un changement de
portée : l'ancien mécanisme est un compteur ATOMIQUE STOCKÉ (BayardRegistry-
like), qui ne sait pas qu'un numéro a été libéré par une suppression —
"Saison 02" supprimée, la création suivante recevait quand même "03". Le
nouveau mécanisme (`_prochainNumeroFratrie`, wfd-engine-handlers.js)
interroge Iconik pour la fratrie RÉELLE sous le parent à chaque création
(recherche `parent_id`, pas un compteur) et lit le numéro dans le TITRE de
chaque sœur (dernière suite de chiffres) — pas sa métadonnée, qui peut être
absente si aucune vue n'est configurée (risque déjà noté ailleurs sur
`metadataViewId`). Testé isolément (algorithme seul, 6 cas dont exactement
le cas rapporté par l'utilisateur : ne reste que "01" après suppression de
"02" -> le suivant redonne bien "02"). Coexiste sans conflit avec l'ancien
mécanisme : un gabarit qui n'utilise pas `numberField` se comporte
exactement comme avant.

---

## Écran d'édition des Mappings — `admin/mappings/` — 3 août

Premier des deux chantiers actés ("faisons-les dans l'ordre" : Mapping puis
Packager). Écran dédié, calqué structurellement sur `admin/manifests/`
(liste + éditeur deux colonnes, même palette `adm-*`) : nom + rows, chaque
row = champ source / chemin destination / type / format / repli, avec une
sous-liste optionnelle de traduction de valeur (children). Correspondances
retirées de l'écran générique `admin/ressources/` (qui ne gardait déjà que
nommages/contacts — Manifest en était déjà sorti avant cette date) ; un 4ème
onglet "Correspondances" ajouté sur l'accueil du Builder, même traitement
que Manifestes/Tree Builder (liste + outils renommer/dupliquer/supprimer +
lien vers l'écran dédié).

**Découverte importante en testant** : `/api/mappings` **existait déjà**,
dans `wfd-data.js` (routes du 22 juin), avant que je construise
`server/routes/mapping.js` — je l'avais raté en auditant `lookup` le 3 août
(j'avais conclu à tort "aucune route n'existe encore"). Les deux routes
faisaient presque la même chose, avec une différence réelle : l'ancienne
filtrait TOUJOURS par une seule org (`getDefaultOrgId`), même pour
superadmin — pas le comportement voulu par `org-context.js` (rôles non
filtrés voient tout). Résolu en supprimant le bloc `mappings` de
`wfd-data.js` (la nouvelle route le remplace intégralement, alias `rows`
cohérent sur GET **et** POST/PUT — l'ancienne n'aliasait que les GET).

**Piège trouvé en même temps, à retenir** : le serveur tournait en
`node server/index.js` simple, pas nodemon — mes changements à `index.js`
(montage de la nouvelle route) n'étaient donc pas actifs tant que le
processus n'était pas relancé, ce qui a produit un faux résultat de test
(POST retournait `rules` non-aliasé, l'ancienne route, alors que le fichier
sur disque était déjà correct). Un `kill` du PID a suffi : un LaunchAgent
(`com.askida.aps.plist`, déjà présent dans `_Patches/`) relance le process
automatiquement. **À vérifier avant tout futur test de route serveur** :
comparer l'heure de démarrage du process (`ps -p <pid> -o lstart`) à l'heure
de modification des fichiers touchés — un serveur plus vieux que le code
teste l'ancien comportement en silence.

Vérifié après redémarrage : round-trip complet (POST/GET/PUT/DELETE) avec
alias `rows`↔`rules` cohérent, et les autres routes (arbo-templates,
manifests, builder-flows, connexions) toujours saines.

**Bug fond blanc résolu — leçon à retenir** : après un très long diagnostic
(éliminé un par un : mode sombre OS, Brave Shields, 3 navigateurs différents,
navigation privée, CDN, cache navigateur avec URL jamais vue) la vraie cause
était un **commentaire CSS mal formé** dans `mappings.css` — le texte du tout
premier commentaire contenait littéralement `mf-*/adm-*`, où `*/` referme un
commentaire CSS prématurément. Le reste du commentaire redevenait du CSS
invalide, suivi d'un second `*/` orphelin — assez pour que le navigateur
corrompe le bloc `:root {}` juste après (confirmé par `document.styleSheets`:
49 règles chargées au lieu des 50 attendues). **Piège à ne pas reproduire** :
ne jamais écrire `*/` (même en deux mots séparés par un caractère) à
l'intérieur d'un commentaire CSS — y compris pour lister des préfixes de
classes comme "mf-* et adm-*". Diagnostic le plus utile qui a mené à la
cause : compter `/\*` vs `\*/` dans le fichier (6 vs 7, jamais égal).

**UX ajoutée sur Manifestes ET Correspondances** (retour utilisateur après
test réel) : recliquer l'élément déjà ouvert referme l'éditeur ; la liste de
gauche reste `position: sticky` pendant le défilement d'un éditeur long —
sinon, avec le mapping réel à 29 lignes, il fallait remonter en haut de page
pour choisir un autre élément.

---

## Packager — audit `wait_for`/`aws_s3` — 3 août

Avant de construire quoi que ce soit, même méthode que tout l'audit du 31
juillet et du 3 août : données réelles (6 occurrences chacun) + relecture
complète du handler, PAS le résumé du 31 juillet qui s'est avéré incomplet.

**Ce que `aws_s3.deliver` fait VRAIMENT** (aucun rapport avec le schéma
d'origine) : les 6 occurrences réelles utilisent TOUTES `operation:
"list_objects"` — ce n'est pas une livraison, c'est une **vérification**.
`wait_for` sonde un job Iconik puis, à la réussite, appelle en interne
`aws_s3` avec `list_objects` pour lister le dossier où l'Export Location a
déjà déposé les fichiers, et exposer les URLs par type (vidéo/image/sous-
titre) via `s3Mappings`. La vraie livraison est `iconik.action` /
`export_location_trigger` (façade Action, déjà validée 6/6 le 31 juillet) —
ceci n'est que le constat après coup. Le nom de la façade (`deliver`) est
donc trompeur par rapport à ce qu'elle fait réellement, mais on la garde
(cohérence avec le nom de famille WFD `aws_s3`).

**`manifestId` était la bonne idée le 31 juillet, juste jamais câblée** :
`s3Mappings[].{type,filter,variable}` a EXACTEMENT la forme d'une essence de
Manifeste (`role`/`reconnu_par`/`sortie`). Résolution ajoutée dans
`pivot-to-wfd.js`, même mécanisme que `mappingId` → `lkRows` (module-level
`_resolutions.manifests`, peuplé par l'appelant, aucun appel réseau dans le
convertisseur). `reconnu_par` (tableau côté Manifeste) est joint en chaîne
virgule pour produire `filter` (chaîne côté moteur) — seul point de
conversion de forme. Testé avec le manifeste réel déjà en base ("Livraison
VOD Factory | PRIME", 1 essence artwork/_poster/s3_image_url) : résolution
correcte, et aucune fuite entre deux conversions sans résolution fournie.

**Schéma `aws_s3.deliver` réécrit** : `operation` exposé (choix, `list_objects`
en premier/coché par défaut — seul prouvé par les 6 occurrences réelles ;
head/get/put/delete_object listés mais pas détaillés, même traitement que
les 40 actionType non détaillés d'`iconik.action`). `manifestId` visible
seulement en mode `list_objects` (c'est le seul où `s3Mappings` compte).

**Vestiges morts confirmés, omis** (présents sur les 6 occurrences réelles,
jamais lus par `list_objects` — reliquats de l'ancienne opération
`artwork_s3`, remplacée par une détection automatique par nom de fichier,
le commentaire du moteur le dit explicitement) : `jobId`, `artworks[]`,
`mdViewId`, `titreVar`, `nommageId`. `s3VarVideo`/`s3VarImage`/`s3VarSrt` :
ne comptent que si `s3Mappings` est vide, jamais le cas en réel.

**Garde-fou de cardinalité — fait le 3 août, même session.** `aws_s3()`
(wfd-engine-handlers.js, branche `list_objects`) compare désormais le nombre
de clés S3 trouvées par mapping à sa `cardinalite` (`exactement_un` /
`au_moins_un` / `au_plus_n` avec `n` / `optionnel`), et fait échouer le
nœud (port `miss`, même port que "dossier vide" — les deux disent "ce que
le Manifeste attendait n'est pas là") avec un message listant CE QUI a
manqué (ex. "artwork : attendu au moins 1, trouvé 0"), pas juste un échec
muet. `pivot-to-wfd.js` transporte `cardinalite`/`n` depuis l'essence vers
`s3Mappings` (même résolution que `manifestId` → le reste des champs,
ajoutée juste avant).

**Rétrocompatibilité vérifiée, pas supposée** : une config sans `cardinalite`
(nœud WFD antérieur au Manifeste) ne déclenche jamais le garde-fou — testé
explicitement (cas F du test ci-dessous). Le calcul de cardinalité tourne
maintenant TOUJOURS (avant : seulement si `count > 0` au niveau global),
pour pouvoir signaler PRÉCISÉMENT quelle essence manque même quand le
dossier est entièrement vide — avant, ce cas ne produisait qu'un échec
générique sans détail.

Testé isolément (mock de `fetch`, connexion S3 factice, 6 cas : au_moins_un
satisfait/non satisfait, exactement_un en excès, au_plus_n dépassé,
optionnel absent, et rétrocompat sans cardinalite) — les 6 se comportent
comme attendu. Testé aussi avec le manifeste réel déjà en base (résolution
complète pivot → WFD, `cardinalite: "au_moins_un"` bien transporté).

**Le Packager est maintenant complet dans ses deux moitiés** : dépliage
(`manifestId` → `s3Mappings`) et garde-fou (cardinalité vérifiée à
l'exécution). Reste hors périmètre, non demandé : un écran pour
créer/éditer les manifestes autrement qu'un par un (déjà couvert par
`admin/manifests/`, pas un nouveau chantier).

---

## Éditeur de corps de boucle — 4 août

En reprenant PUBLISH après Deliver, question posée en continuant la
construction : faut-il un nœud Action avant Deliver, pour déclencher
l'Export Location si les fichiers manquent ? Réponse en creusant le vrai
flow de production (`WORKFLOWS_WFD_VODFACTORY.json`) : oui, et c'est plus
précis que prévu — Iconik ne sait déclencher un Export Location que **par
asset individuel** (`/API/files/v1/assets/{assetId}/export_locations/{id}/`),
jamais en bloc sur une collection. Le vrai motif, confirmé sur les 6
occurrences réelles : Search (assets artwork/vidéo de la collection) →
**Boucle** sur ces assets → Action (export) par itération → Attendre.

Construire cette étape suppose une boucle avec des nœuds dedans — bloqué :
« le corps d'une Loop n'a pas encore d'éditeur dans ce canevas » (limite déjà
documentée). Décidé avec l'utilisateur : construire cet éditeur maintenant
plutôt que documenter le trou et continuer.

**Bonne nouvelle en creusant avant de coder** : côté format, tout était déjà
prêt. `pivot-schema.js`/`pivot-validate.js` définissent et valident déjà
`etape.body = {steps, edges}` (portée imbriquée, jamais déduite du graphe)
et `presentation.bodyLayout[loopId]`. `pivot-to-wfd.js` (`_aplatir`) sait
déjà aplatir un corps de boucle dans le graphe WFD, en connectant
automatiquement le port 0 de la boucle à la première étape de son corps.
Il ne manquait que le canevas.

**Conception retenue** : pas de refonte de `WfModel` (reste un modèle plat
à un seul niveau, volontairement — cf. son en-tête). À la place, une **pile
de portées** (nouveau module `wf-scope.js`) : le triplet racine
`{model, history, selection}`, puis un par boucle ouverte. Entrer dans une
boucle pousse une portée construite depuis `etape.body` (vide si absent) ;
en sortir la dépile et réécrit `etape.body` **dans le même objet étape** que
porte la portée parente — c'est ce qui fait que `wf-persistence.js` n'a
presque rien à savoir de l'imbrication, seules les positions des nœuds
internes (`presentation.bodyLayout`) sont passées à part.

`workflow-canvas.js` (les ~700 lignes qui créent modèle/historique/
sélection et branchent tout le reste) est devenu réentrant SANS dupliquer
ce bloc : `model`/`history`/`selection` sont passés de `const` à `let`,
réassignés (jamais redéclarés) à chaque changement de portée — toute
fonction qui les referme continue de lire la valeur courante sans être
redéfinie. Seuls les abonnements liés à une INSTANCE précise (
`model.onChange`, `selection.onChange`, et les 4 modules externes
WfPaletteDrag/WfConnect/WfContextMenu/WfShortcuts + WfLasso, qui capturent
le triplet par valeur à l'appel de `.brancher()`) doivent se désabonner et
se réabonner — un seul petit helper (`_reabonnable`) gère ça partout,
plutôt que de répéter le motif.

**Navigation** : double-clic sur un nœud Loop, ou bouton "Edit body →" dans
son panneau Config (découvrabilité — rien ne suggérait le double-clic).
Fil d'Ariane en superposition sur le canevas (même principe que les volets
— jamais dans la grille CSS du bandeau d'état, qui n'a que 2 lignes fixes),
segments cliquables + bouton "← Sortir" + touche Échap (neutralisée si le
focus est dans un champ). Badge "N steps" sur un Loop dont le corps n'est
pas vide, visible sans avoir à entrer dedans.

**Sélecteur de variables étendu** (`etapesExterieures()` dans `wf-scope.js`) :
depuis l'intérieur d'un corps, le panneau Variables et le sélecteur inline
montrent aussi ce qui a été posé AVANT la boucle dans sa portée parente —
sans ça, entrer dans un corps aurait rendu aveugle exactement l'outil
construit plus tôt cette session pour ne jamais taper un nom de mémoire.
Variable synthétique `{item}` (nom réel = `loopVar` de la boucle) injectée
en tête du panneau quand on est dans un corps — elle ne sort d'aucune
façade du catalogue, elle vient de la config du Loop lui-même.

**Piège à ne pas reproduire, déjà écrit en commentaire à l'endroit qui
compte** : sauvegarder (bouton Save ou auto-save) DOIT toujours viser
`modeleRacine`, jamais `model` (qui peut pointer sur un corps ouvert), et
appeler `portee.flush()` juste avant — sans ce flush, sauvegarder pendant
qu'on édite l'intérieur d'une boucle perdrait silencieusement les
modifications en cours (le corps resterait figé à son état d'avant la
dernière sortie).

**Deux bugs réels trouvés en écrivant les tests, corrigés avant de
considérer le chantier terminé** :
- `pivot-validate.js` validait un Loop sur `params.over`/`params.as` — un
  vocabulaire d'exemple posé le 23 juillet (`boucler_sur`), jamais mis à
  jour quand le panneau réel (`config-schema.js`) et le moteur
  (`wfd-engine-executor.js:364-374`, "loop hors executor" — pas dans
  `wfd-engine-handlers.js`) ont tranché sur `loopVariablePath`/`loopVar`.
  Conséquence concrète : **toute boucle réellement construite dans le
  Builder aurait échoué la validation complète**, invisible jusqu'ici faute
  d'avoir jamais mené une boucle jusqu'au bout. Corrigé (`loopVariablePath`
  exigé seulement en mode `variable`, le seul réellement câblé — les 5
  autres sources sont marquées "not implemented" dans le panneau lui-même).
- `wf-persistence.js` n'avait jamais de `module.exports` (seul fichier de
  `builders/workflow/` dans ce cas) — jamais testable hors navigateur.
  Ajouté (une ligne, même motif que tous les autres modules).

**Testé isolément** (Node, sans DOM, script non commité) : `entrer`/`sortir`/
`flush` réécrivent bien `etape.body` sur le MÊME objet que porte le modèle
racine (pas une copie) ; `flush()` réécrit sans dépiler ; round-trip complet
`documentDepuisModele` → `initialDepuisDocument` → reconstruction d'une
nouvelle portée restaure les positions du corps (pas une redisposition par
défaut) ; le document complet (racine + corps) passe `pivot-validate.js`
avec le catalogue une fois les deux bugs ci-dessus corrigés ; `pivot-to-wfd.js`
aplatit correctement le corps dans le graphe WFD, port 0 de la boucle vers
la première étape du corps. 29 assertions, toutes passées. Vérifié aussi
que le vrai flow "BAYARD | PUBLISH | VODFACTORY" (encore sans Loop à ce
stade de sa construction) continue de se valider exactement pareil
qu'avant le correctif `pivot-validate.js` — aucune régression.

**Vérifié ensuite pour de vrai dans un navigateur** (même session, après
avoir installé `chrome-devtools` en MCP, pointé sur Brave — pas de Chrome
sur cette machine) : glisser un Loop depuis la palette, double-clic pour
entrer (la simulation de double-clic de l'outil ne produit pas de vrai
événement `dblclick` — contourné en le déclenchant directement pour ce
test ; un vrai double-clic humain, lui, fonctionne, vérifié en dispatchant
l'événement réel), glisser un nœud dans le corps (atterrit bien dans la
portée du corps, pas la racine), bouton "Sortir" et touche Échap, badge
"1 step" sur le Loop refermé, bouton "Edit body →" dans le panneau Config,
panneau Variables affichant `{item}` sous "BOUCLE — LOOP". Sauvegarde
(gestion du `window.prompt` du nom) puis **rechargement complet de la
page** : le corps ET la position du nœud interne survivent à l'identique.

**Troisième bug réel trouvé en regardant l'écran, pas en lisant le code** :
le fil d'Ariane restait affiché à la racine malgré `hidden`. Cause :
`.bd-breadcrumb { display: flex }` (règle auteur) bat toujours
`[hidden] { display: none }` (règle de l'agent utilisateur), quelle que
soit la spécificité — l'origine prime avant la spécificité dans la cascade
CSS. Corrigé par une règle explicite `.bd-breadcrumb[hidden] { display: none }`.
Workflow de test supprimé après vérification (`DELETE /api/builder-flows/...`).

**Reste ouvert** : contenu réel du chantier qui a motivé cet éditeur — poser
Search → Loop (`{item}` = asset trouvé) → Action (`export_location_trigger`,
`assetId: {item.id}`) → sortir de la boucle → Wait → retour à Deliver pour
re-vérifier → Lookup. L'éditeur est prêt, cette construction-là ne l'est pas
encore.

---

## Reprise PUBLISH — tableau, bugs, HTTP Sequence — 4 août (suite)

Suite directe de l'éditeur de corps de boucle : retour à la construction de
PUBLISH elle-même, en relisant le workflow depuis le début à chaque étape
pour vérifier qu'il n'y a pas de trou dans le narratif — c'est cette relecture
qui a fait remonter deux trous réels (ci-dessous) plutôt que de les découvrir
plus tard à l'exécution.

### Trou trouvé : vérifier l'existant avant de déclencher un export

Question de l'utilisateur, de mémoire de WFD : avant de déclencher un export
Iconik, il faut vérifier ce qui existe déjà, sinon le job Iconik échoue et on
gaspille une ressource d'export. Vérifié dans le vrai flow : c'est exact, et
plus précis que la première proposition — la vérification est **par asset**,
pas seulement au niveau collection. Chaîne PUBLISH complète, mise à jour :

```
1  Trigger              Custom Action, Collection
2  Search               Collection, id equals {collection.id} → search_results
3  Decision             {BayardID} is_empty / not_empty
4  Générateur d'ID       (si vide)
5  Set Metadata          (non retouché cette session)
6  Deliver               list_objects, manifestId=PRIME, {ancestorPath}
     Succès  → 11
     Non trouvé → 7
7  Search               Asset, in_collection {collection.id} → assetsAExporter
8  Loop                 sur {assetsAExporter.objects}, loopVar=item
8a   ↳ Deliver          list_objects, SANS manifeste, {ancestorPath}/{filebase(item.title)}
       Succès → rien (suivant)     Non trouvé → 8b
8b   ↳ Action           export_location_trigger, assetId={item.id},
                        fileName={ancestorPath}/{filebase(item.title)}
9  Wait                 poll job, jusqu'à FINISHED
10 Deliver              re-vérification (nouveau nœud, même manifestId)
11 Lookup               {search_results.objects[0]} + Mapping "VOD Factory | Fields" → {vodFactoryPayload}
12 HTTP Sequence        Publication API (7 étapes, cf. plus bas)
13 Verify               (pas encore configuré — bloqué, cf. question ouverte)
14 Set Metadata+History (pas encore configuré — bloqué, cf. question ouverte)
```

**Étape 7 (`in_collection`)** : deux détails de panneau creusés en répondant
aux questions de l'utilisateur, à retenir pour la suite —
`_operateursPourType()` (config-schema.js) n'ajoute l'opérateur "in
collection" que si le champ "Field" ne résout à AUCUNE vraie métadonnée
(laisser Field vide suffit) ; côté moteur, `__collection__` + `in_collection`
se traduit en `in_collections:"{id}"` pour un asset (`in_branch` irait
chercher aussi dans les sous-collections, pas voulu ici).

**Étape 8a (check par asset)** : vérifié contre les 6 vraies occurrences
(`n-1784126131331` et les 5 autres nœuds S3 dans les boucles réelles,
description "Vérification de l'existence de l'asset dans le bucket S3") —
`list_objects` (pas `head_object`), préfixe descendant jusqu'à
`{filebase(item.title)}`, EXACTEMENT la même expression que `fileName` sur
l'Action (8b). L'ancien WFD reconstruit ce chemin à la main sur 3-4
variables par branche ; simplifié ici via `{ancestorPath}` (Ancestor
Resolver, déjà construit et vérifié le 3 août).

**Question ouverte, pas tranchée** : à l'étape 7, un seul Search sans filtre
`media_type` (ma proposition, plus simple, pas de distinction image/vidéo
dans le Loop) ou deux Search séparés comme WFD ? Pas bloquant pour continuer.

### HTTP Sequence (étape 12) — mécanique clarifiée, valeurs réelles

Un seul nœud partagé en production (pas dupliqué par niveau, contrairement à
Verify/History) — "Publication API", 7 étapes : 5 `foreach` (Persons
director/actor/creator/writer/producer, sur `{Realisateur}`/`{Acteur}`/
`{AuteurOrigine}`/`{Auteur}`/`{Producteur}`, endpoint `/api/persons`,
`feAppend` vrai sauf le premier, codes 409/422 ignorés) + 2 `simple`
(Contents Action POST `/api/contents/` corps `{vodFactoryPayload}` ; Video
Action POST `/api/contents/{external_id}/videos`, sauté si `{s3_video_url}`
vide, corps JSON explicite avec sous-titres/pistes audio).

Deux points de mécanique vérifiés en répondant aux questions de
l'utilisateur : `Simple` = "Single request", `Foreach` = "One request per
value" (labels du panneau, confirmés). "Store as" n'est pas obligatoire pour
que l'étape réussisse seule, mais nécessaire si une étape suivante relit ce
qui a été produit — et **`{external_id}` (utilisé par Video Action) ne vient
d'aucune étape de cette séquence** : `lookup()` (wfd-engine-handlers.js)
expose déjà ses champs plats en variables directes après l'étape 11
(commentaire du code : "Cela permet d'utiliser `{external_id}` directement
dans les nœuds suivants") — trouvé en traçant précisément d'où vient cette
variable avant de répondre, pas supposé.

### Verify/History (étapes 13/14) — même trou que le Manifeste, tranché le 4 août

Vérifié contre les vraies données : Verify et History sont dupliqués **4
fois** en production (un Vérificateur + une paire Histo Succès/Échec par
niveau), avec des champs et des messages différents à chaque fois (Série
vérifie cover/hero/poster ; Saison ajoute season ; Episode vérifie
vidéo+sous-titres ; Unitaire vérifie tout + box). Exactement le motif que le
Manifeste (`appliesTo`) a éliminé pour Deliver — mais Verify/History n'ont
aujourd'hui aucune notion de Manifeste.

**Décision (4 août)** : piloter Verify/History depuis le même Manifeste
(essences + `appliesTo`) plutôt que des listes figées par niveau — cohérent
avec Deliver. **Confirmé comme un vrai chantier séparé, non construit cette
passe** : Verify n'a aujourd'hui aucune notion de Manifeste (contrairement à
Deliver, qui l'a depuis le 4 août) — il faudrait lui donner un `manifestId`
et faire lire ses essences par `checker()` (wfd-engine-handlers.js), un
travail de la même ampleur que l'extension `appliesTo` de Deliver. Prochain
chantier concret sur PUBLISH après le contenu de la Publication API.

### Bug réel — Lookup avait deux champs de stockage, un seul réel

Question de l'utilisateur en lisant le panneau ("Store Result As" vs "Store
As"). Vérifié : `lookup()` (wfd-engine-handlers.js) ne lit jamais
`cfg.resultVar` — seulement `cfg.lkOutputVar`. "Store Result As" venait du
tableau générique `produit` (config-schema.js, `pour()`) qui l'ajoutait à
Lookup par erreur, en plus de son vrai champ ("Store As") déclaré plus loin
dans le même fichier — remplir le mauvais champ ne stockait rien nulle part,
silencieusement. Corrigé (`lookup` retiré du tableau `produit`).

**Trouvé le 3 août, corrigé le 4 août** (cf. section dédiée plus bas) : le
panneau du Core `transform` ne correspondait à AUCUN des champs que son
handler lit réellement.

### Incident réel — perte de données sur le Mapping "VOD Factory | Fields"

En cours de session, l'utilisateur a supprimé UNE ligne dans l'écran
`admin/mappings/`, enregistré, et s'est retrouvé avec **zéro ligne** au lieu
de 28. Cause trouvée en vérifiant les logs serveur
(`~/Library/Logs/aps.log`, PUT ne portait que 152 octets) puis le code :
`admin/mappings/mappings.js`, `_ligneRow()` affiche `row.key || row.src`
(repli déjà en place pour les données stockées en `src`/`tgt`, alias
historique), mais `enregistrer()` ne filtrait/nettoyait que sur
`row.key`/`row.value` — **toute ligne jamais retapée à la main était donc
traitée comme vide et retirée**, pas seulement celle volontairement
supprimée. Corrigé : normalisation `key = key||src`, `value = value||tgt`
faite une fois à l'ouverture (`editer()`), tout le reste du fichier ne
manipule plus que la forme canonique.

**Récupération** : pas de sauvegarde du Mapping lui-même, mais son contenu
source était déjà dans cette session (le nœud LookUp du vrai export WFD,
lu pour construire ce mapping le 3 août) — 32 lignes réinjectées via API
directe. Écart signalé à l'utilisateur : le mapping affichait 29 lignes
avant l'incident, pas 32 — 3 lignes avaient été retirées à un moment non
documenté (probablement `EnvoiPrime`/`LivraisonsAmazonPrime`, valeur vide
dans la source donc inertes pour `lookup()`, + une autre). Tout remis pour
ne rien perdre ; à trier dans l'écran maintenant réparé.

**Leçon générale** : deuxième bug du même genre ce jour (après celui de
Lookup) où un écran affiche correctement une donnée via un repli
(`a || b`) mais ne le reproduit pas symétriquement à l'écriture — motif à
surveiller ailleurs dans le Builder si l'occasion se présente.

## Étape 12 (Partner / Publication API) — 4ème ressource d'org : `Endpoint` — 4 août (suite)

En reprenant l'étape 12 (nœud "Partner", façade `vodfactory.partner`, core
`http_sequence`) : le tableau inline `steps` du panneau (~10 champs
conditionnels PAR étape × 7 étapes réelles) ne correspondait déjà plus
vraiment à ce qu'on veut construire à la main dans le canevas — même
diagnostic que Lookup avant `Mapping` ou Deliver avant `Manifest`. Bug réel
trouvé au passage : `ignoreCodes`/`feIgnoreCodes` étaient déclarés `texte`
"comma-separated" dans le panneau, mais `handleHttpRequest`/`_handleHttpForeach`
(wfd-engine-handlers.js) ne les splittent JAMAIS — ils font `.map(Number)`
(voire un spread) directement dessus. Une chaîne tapée dans le Builder aurait
crashé en mode foreach et cassé silencieusement le filtrage en mode simple
(contraste avec `wait`/`failValues`, où le handler fait bien `.split(',')`).

**Décision** (validée par l'utilisateur, qui a aussi tranché le nom) : 4ème
ressource d'org, **`Endpoint`** (modèle Prisma), présentée comme
**"Endpoints"** dans l'UI — 5ème onglet du Workflow Builder, écran dédié
`admin/endpoints/`. Un Endpoints = nom + `steps[]` (même vocabulaire exact
que l'ancien panneau inline : `name`/`httpMode`/`method`/`endpoint`/
`skipIfEmpty`, puis champs simple OU foreach). Le panneau du nœud Partner ne
porte plus que `connexionId` (reste sur LE NŒUD, comme Deliver — la séquence
décrit CE QUI est appelé, pas OÙ) + `sequenceId` (référence, nature
`endpoints`). `ignoreCodes`/`feIgnoreCodes` sont saisis en texte
"409,422" dans l'éditeur mais **stockés comme de vrais tableaux de nombres**
dans le JSON — le bug ne peut plus se reproduire, la conversion se fait une
fois à la sauvegarde, pas à chaque lecture par le moteur.

Construit, dans l'ordre établi (Mapping/Manifest) :
- `prisma/schema.prisma` : `model Endpoint {id, orgId, name, steps Json, …}`,
  `@@unique([orgId, name])`. Migration appliquée via `prisma migrate deploy`
  (pas `db push` — `ApsCounter` vérifié intact après, 4 lignes).
- `server/routes/endpoints.js` — CRUD calqué sur `mapping.js`, monté sur
  `/api/endpoints`.
- `admin/endpoints/` (html/js/css) — liste + éditeur, une carte par étape
  (nom, mode, réordonner ▲▼, connexion override, method/endpoint/skip,
  puis bloc simple OU foreach conditionnel, `feFields` en sous-liste
  key/src). Mêmes tokens visuels que `admin/manifests/`.
- `config-sources.js` : `endpoints()`, même cache-par-liste que
  `mappings()`/`manifests()`.
- `config-renderer.js` : nature `endpoints` (sélecteur), même mécanique que
  `manifeste`/`mapping`/`gabarit`.
- `config-schema.js` : `core === 'http_sequence'` réduit à `connexionId` +
  `sequenceId` (nature `endpoints`) — l'ancien bloc `liste` de ~100 lignes
  est parti.
- `pivot-to-wfd.js` : résolution `sequenceId -> steps`, même filet que
  `mappingId`/`manifestId` (résolution absente ⇒ `steps` reste tel quel,
  jamais de crash de conversion).
- `workflow.html`/`workflow.js` : 5ème onglet "Endpoints", même trio
  renommer/dupliquer/supprimer que Correspondances (PUT tolérant, pas de
  relecture complète nécessaire).

**Vérifié en vrai** (chrome-devtools MCP disponible cette session,
contrairement au 3/4 août précédent) : créé une séquence de test dans
`admin/endpoints/`, basculé simple↔foreach (les deux blocs s'affichent/se
masquent correctement), ajouté un `feFields`, enregistré — `ignoreCodes`
confirmé stocké en tableau (`[409,422]`, pas la chaîne) via l'API. Sélecteur
"Endpoints" vérifié sur le VRAI nœud Partner du flow de production (`BAYARD
| PUBLISH | VODFACTORY`) : liste bien la séquence créée, sauvegarde du
workflow confirmée (GET après save montre `sequenceId` persisté). Résolution
`pivot-to-wfd.js` vérifiée par un test Node direct (`convertir()` avec
`resolutions.endpoints` fourni) : `cfg.steps` de sortie contient bien le
contenu résolu depuis la ressource, pas l'ancien `params.steps` inline
périmé qui traînait sur le nœud réel. **Nettoyé après vérification** : la
séquence de test et la référence `sequenceId` posée sur le nœud Partner réel
ont été retirées — le flow de production est revenu exactement à son état
d'avant ce test (`steps`/`connexionId` inchangés).

**Reste ouvert** : le contenu RÉEL de la Publication API (7 étapes — 5
foreach Persons director/actor/creator/writer/producer + 2 simple
Contents/Video Action, détail dans la section "HTTP Sequence (étape 12)"
plus haut) n'est pas encore saisi dans `admin/endpoints/` — l'écran existe,
vide. C'est le prochain travail concret sur étape 12. `params.steps` périmé
qui traîne encore sur le nœud Partner réel (un seul step "Persons director"
incomplet, vestige d'avant cette passe) sera de toute façon écrasé dès
qu'un `sequenceId` réel sera choisi — pas nettoyé séparément, pas la peine.
Rien n'est commité par moi cette passe — à faire sur demande de
l'utilisateur.

### Publication API — contenu réel saisi dans `admin/endpoints/`

Suite directe. L'utilisateur a créé la ressource `BAYARD | ENDPOINTS |
VODFACTORY` dans l'écran ; les 7 étapes réelles ont été retrouvées dans
`_journaux/WORKFLOWS_WFD_VODFACTORY.json` (nœud `n-1784408918017`, "Publication
API" du vrai flow) et saisies telles quelles (mêmes `feFields`, `feSourceVar`,
`feJob`, `feAppend` — faux uniquement pour "Persons director", le premier,
qui initialise `personsResult` ; les 4 suivants l'enrichissent —, corps JSON
complet de "Video Action"). Vérifié après écriture : liste = "7 étapes",
détail conforme à l'export dans l'éditeur, aucune erreur console. Reste à
faire : relier le nœud Partner réel à cette séquence (sélecteur "Endpoints")
quand le montage de PUBLISH reprendra — pas fait cette passe, le nœud réel a
été délibérément laissé dans son état d'avant les tests du 4 août (voir
section précédente).

## Bug réel — panneau du Core `transform` réécrit — 4 août

Repéré le 3 août ("trouvé au passage, pas corrigé"), tranché et corrigé le 4
août à la demande de l'utilisateur, avant tout commit. Le panneau d'origine
(`input`/`mode: expression|fields`/`fields[]`) ne correspondait à AUCUN nom
lu par le handler réel (`transform()`, wfd-engine-handlers.js:365) :
`input` n'était jamais lu (`cfg.source`/`cfg.value` seuls le sont), `mode`
n'a aucun lecteur, `fields` n'a aucun lecteur — et surtout **`target`, le
seul champ qui décide si quoi que ce soit est stocké, était absent du
panneau**. Un Transform construit dans le Builder avant cette passe ne
faisait donc RIEN d'observable, même avec une expression valide dedans.

Le handler a en réalité deux branches, jamais les deux en même temps :
- si `cfg.rules[]` est présent — mode "composition" (assembler plusieurs
  sources + séparateur + casse + longueur max) — hérité de l'ancien
  "Transformer designer" du WFD Designer (`platforms/iconik/workflow/`), un
  outil séparé de ce Builder, pas ce Core ;
- sinon — mode "opération unique sur une valeur" (`upper`/`lower`/`trim`/
  `replace`/`regex_replace`/`slice`/`pad_start`/`truncate`/
  `separator_join`/`expression`, avec `target` pour stocker).

**Zéro occurrence réelle de `family: transform`** dans tout l'export VOD
Factory (grep complet) — rien à auditer contre du réel, contrairement aux
autres façades cette semaine. Décision : cibler la branche "opération
unique", la plus générale et la seule qui correspond au but affiché du Core
("applique une transformation à une entrée") ; la branche "composition"
reste un chantier à part si le besoin apparaît un jour (elle appartient à un
autre outil aujourd'hui).

Panneau reconstruit (`config-schema.js`, `core === 'transform'`) :
`source` (Value) → `operation` (10 choix, `reagit: true`) → champs
conditionnels par opération (`find`/`replace` pour replace/regex ;
`start`/`end` pour slice ; `length`/`char` pour pad_start ; `maxLen` pour
truncate ; `separator` pour separator_join ; `expression` pour expression)
→ `target` (Store as), toujours visible. Vérifié en vrai dans le navigateur
(chrome-devtools MCP) : nœud Transform posé par glisser-déposer sur un
canevas vierge, panneau ouvert, bascule Replace (regex) → FIND/REPLACE WITH
apparaissent ; bascule Slice → START/END apparaissent. Aucune erreur
console. Non enregistré (canevas de test jetable, jamais sauvegardé).

## Résolution technique (durée, résolution, codec…) — gap trouvé et rebouché sur Search — 4 août

Question de l'utilisateur : dans WFD, la durée/résolution vidéo étaient
résolues depuis les métadonnées techniques Iconik — est-ce conservé ici ?
Vérifié en remontant le mécanisme réel, pas supposé :

- Le vrai moteur (`_extractTechnical()`, wfd-engine-handlers.js:585) appelle
  `/file_sets/` puis `/formats/{id}/` et pose `{duration}`, `{duration_ms}`,
  `{width}`, `{height}`, `{video_quality}` (SD/HD/UHD déduit de
  max(largeur,hauteur)), `{video_codec}`, `{fps}`, `{bitrate}`,
  `{container}`, `{file_size}`, `{audio_tracks}`, `{audio_codec}`,
  `{filename}`/`{filename_noext}` — vrai, pas inventé, déjà présent avant
  cette session.
- **À ne pas confondre** : le `lkTechMap`/`lkTechVar` de l'ancien Lookup
  (repérés comme vestiges morts dès l'audit du 31 juillet/3 août) n'ont
  RIEN à voir avec ce mécanisme — ils ne sont lus par aucun handler. Le vrai
  chemin passe par un flag `withFormats`, lu par DEUX handlers :
  `fetch()` (sous-type asset) et `aps_search()` (mode retrieve, résultat
  asset unique).
- **Gap réel trouvé** : `withFormats` était exposé sur le panneau Fetch
  (`config-schema.js`, déjà présent) mais PAS sur le panneau Search — alors
  que l'occurrence réelle de PUBLISH ("Video", `resultVar: episodeVideo`,
  `withFormats: true`) prouve que c'est bien le nœud Search qui pose
  `{duration}` en production, consommé ensuite par "Video Action"
  (Publication API). Un Search reconstruit dans le Builder aurait donc
  laissé `{duration}` silencieusement vide.

**Corrigé** : champ `withFormats` ajouté au panneau `iconik.search`
(`config-schema.js`) ; catalogue de variables étendu
(`pivot-catalog-iconik.js`, `iconik.search.variables()`) pour proposer les
14 champs techniques dans le sélecteur — visibles UNIQUEMENT quand la case
est cochée, marqués "if present" (dépend qu'un seul asset soit trouvé,
même garde-fou que le moteur). Vérifié en vrai dans le navigateur : nœud
Search posé, case cochée, onglet Variables → les 14 champs apparaissent.
Non enregistré (canevas de test jetable).

## Corps structuré du Loop — construit, et un vrai bug de fond trouvé au passage — 4 août

Suite directe de la discussion sur la lisibilité métier : l'utilisateur a
tranché — pas de nœud "Video" dupliqué en plus, on répare la vraie
structure. Jusqu'ici Check Asset/Action/Wait/Recheck/Lookup/Partner/Verify/
Set Metadata/History étaient tous posés À PLAT après le Loop (reliquat
d'avant l'éditeur de corps de boucle construit plus tôt le 4 août), reliés
par des arêtes qui simulaient un enchaînement sans jamais utiliser le
mécanisme réel de corps imbriqué.

**Clarification métier de l'utilisateur, tranchant l'ambiguïté posée avant** :
la republication (Lookup → Partner → Verify → Set Metadata → History) doit
TOUJOURS s'exécuter, même quand `Check Collection` constate que la
collection est déjà entièrement livrée — l'utilisateur aura toujours besoin
de remettre à jour des données déjà présentes côté VOD Factory. Donc Lookup/
Partner/etc. restent HORS de la boucle (republication une fois, pour toute
la collection), et seule la livraison fichier par fichier (Check Asset →
Action → Wait → Recheck) est vraiment PAR ASSET, donc dans le corps.

**Restructuration faite** (JSON du document, testée avant sauvegarde — voir
plus bas) : Check Asset, Action, Wait, Recheck déplacés dans `Loop.body`
(steps + edges internes). `Loop --out--> Check Asset` remplacé par
`Loop --out--> Lookup` (republication après la boucle). Les 4 arêtes qui
reliaient Check Asset/Recheck directement à Lookup (`out`/`error`)
supprimées — elles auraient traversé la frontière du corps, interdit par
`pivot-validate.js`. Le raccourci `Check Collection --out--> Lookup`
(collection déjà livrée) conservé tel quel, maintenant valide puisque Lookup
reste au niveau racine.

### Bug réel trouvé en testant la conversion — collision de port sur Loop

Avant de sauvegarder, conversion testée via `pivot-to-wfd.js` (contournement
temporaire de la validation stricte pour isoler ce test — le document réel a
60 erreurs de dette préexistante, sans rapport, jamais nettoyées, confirmées
identiques avant/après par un diff exact des rapports de validation).
Résultat : `Loop` n'a qu'**un seul port pivot** déclaré (`out`,
pivot-catalog-iconik.js `CORES.loop`), donc `indexPort(loop, 'out')`
renvoyait toujours l'index WFD 0 — la MÊME valeur que l'entrée du corps
(codée en dur `fromPort: 0` dans `_aplatir`, pivot-to-wfd.js). Or le vrai
moteur (`wfd-engine-executor.js`, `executeLoopNode`) a ce contrat en dur :
port 0 = chaque élément (`followPort(node, 0, ...)` par itération), port 1 =
terminé (`followPort(node, 1, ...)` une seule fois après la boucle), port 2
= erreur d'élément si `onError:'port'` (non câblé côté panneau). Sans
correction, la republication (Lookup) se serait déclenchée à CHAQUE
itération de la boucle en plus de l'unique fois voulue après coup — jamais
détecté avant car aucun BuilderFlow n'avait encore eu un corps de boucle
réellement peuplé ET une arête `out` en aval simultanément (l'éditeur de
corps de boucle est nouveau ce jour même).

**Corrigé** : `indexPort()` (pivot-catalog-iconik.js) cas particulier pour
`core === 'loop'` — `out` → index 1, jamais 0 (documenté en commentaire avec
la référence exacte au contrat du moteur). Revérifié après correction :
`Loop --port0--> Check Asset` (corps) et `Loop --port1--> Lookup` (après),
plus de collision.

**Vérifié en vrai dans le navigateur** : document sauvegardé, canevas
rechargé (16 nœuds top-level, 28 connexions — contre 20/36 avant), badge
"4 steps" sur Loop, entrée dans le corps (double-clic simulé via
`dispatchEvent(new MouseEvent('dblclick'))`, le simulateur de clic du MCP ne
déclenche pas d'événement natif) : Check Asset → Action → Wait → Recheck
dans le bon ordre, fil d'Ariane "Workflow › Loop", sortie propre. Aucune
erreur console à aucune étape.

### Technique vidéo (durée/résolution) résolu dans le corps, pas par un nœud dupliqué

Suite directe. Plutôt que de dupliquer un nœud "Video" (comme WFD, qui
enchaîne Artwork loop → Video search → Video loop, une branche par type
d'asset — exactement le motif de duplication que le Manifeste a déjà
éliminé pour Deliver), un seul nœud **Fetch** ("Video Info") ajouté en tête
du corps de boucle : `fetchSubType: asset`, `fetchValue: {item.id}`,
`withFormats: true`, `onError: continue_log`. Il tourne sur CHAQUE asset de
la boucle (image, vidéo, sous-titre), pas seulement la vidéo — sans risque :
`_extractTechnical()` ne pose `{duration}`/`{width}`/`{height}`/… que si le
format de l'asset a un composant `kind_of_stream: Video` (wfd-engine-
handlers.js:627+) ; pour une image ou un sous-titre, ces champs restent
simplement non posés, aucune valeur écrasée par erreur. Ses deux sorties
(`out`/`not_found`) convergent vers `Check Asset`, la suite du corps
inchangée — un échec de récupération technique ne bloque jamais la
livraison du fichier.

Testé avant sauvegarde (validation stricte + conversion, même méthode que
la restructuration précédente) : zéro nouvelle catégorie d'erreur, câblage
confirmé `Loop --port0--> Video Info --port0/1--> Check Asset`. Vérifié en
vrai dans le navigateur : corps de boucle à 5 étapes, panneau du nœud
"Video Info" affiche Fetch/Asset/`{item.id}`/case technique cochée/
`{itemTechnical}`, aucune erreur console.

## Verify piloté depuis le Manifeste — chantier fermé — 4 août

Suite de la décision actée plus haut ("piloter Verify/History depuis le même
Manifeste"). Retrouvé les 4 vrais Vérificateurs de production (Série/Saison/
Episode/Unitaire, family `checker`) pour ancrer le design sur du réel, même
méthode que tout le reste de la journée — pas de conception à l'aveugle.

**Trouvaille clé** : les checks réels utilisent des rôles identiques aux
essences du Manifeste déjà en base ("Livraison VOD Factory | PRIME"), mais
via un endpoint/chemin DIFFÉRENT par rôle (pas un endpoint unique par nœud
comme supposé au départ) : les essences image partagent `/api/contents/
{external_id}` avec `images.amazon.{role}_art`, mais vidéo utilise `/api/
contents/{external_id}/videos` + `results[0].url`, et sous-titre `/api/
videos/{external_id}-video-main` + `results.subtitles[0].url`. D'où deux
nouveaux champs PAR ESSENCE (`verifyEndpoint`/`verifyPath`), pas un champ
unique sur le nœud Verify.

**Construit** :
- `pivot-manifest.js` — essences acceptent `verifyEndpoint`/`verifyPath`
  optionnels ; une essence sans `verifyPath` n'est simplement jamais
  vérifiée (title/episodic, cohérent avec le réel — jamais recontrôlés).
- `admin/manifests/` — ligne "Vérification (optionnel)" ajoutée sous chaque
  essence (2 champs), sans toucher à la ligne principale existante.
- `config-schema.js`, `core === 'verify'` — la liste `checks[]` libre est
  remplacée par `connexionId` + `manifestId` (nature `manifeste`).
- `pivot-to-wfd.js` — résolution `manifestId -> checks`, même filet que
  `mappingId`/`manifestId`(Deliver)/`sequenceId` : essences filtrées sur
  `verifyPath` présent, `op` toujours `not_empty` (seul opérateur observé
  sur les 4 occurrences réelles), `appliesTo` transporté tel quel.
- `checker()` (moteur) — même mécanisme de portée par niveau que `aws_s3()`
  : `TypeCollection` → niveau courant → filtre les checks par `appliesTo`
  avant de les exécuter. `summary.total` corrigé pour compter les checks
  RÉELLEMENT exécutés (portée), pas la liste complète du manifeste.

**Vérifié, pas supposé** : un test isolé de `checker()` (fetch stubbé,
`TypeCollection` variable) confirme que le nombre de checks exécutés
correspond EXACTEMENT aux 4 occurrences réelles : Episode → 2 (vidéo, sous-
titres), Série → 3 (cover/poster/hero), Saison → 4, Unitaire → 6, sans
niveau connu → les 9 essences ayant un `verifyPath` (rétrocompat). Manifeste
réel peuplé (`verifyEndpoint`/`verifyPath` sur cover/poster/hero/
season_box/box/video/subtitle) et nœud Verify du flow réel câblé sur
`manifestId`. Vérifié en vrai dans le navigateur : panneau Verify affiche
"Manifest (checks the same essences it delivers)" → "Livraison VOD Factory
| PRIME (9)" ; écran Manifestes affiche les 9 lignes "Vérification
(optionnel)" avec les bonnes valeurs. Aucune erreur console.

## History piloté depuis le Manifeste — 4 août

Suite directe de Verify, même après-midi. Retrouvé les 8 vrais nœuds History
(Histo Succès/Échec × Série/Saison/Episode/Unitaire, family
`workflow_history`) pour ancrer le design.

**Trouvaille clé** : le moteur a DÉJÀ un interpolateur conditionnel générique
`{variable?texte_si_présent|texte_si_absent}` (`wfd-engine-context.js:103`,
`resolve()` — pas spécifique à History, utilisé partout). Les vrais
`whMessage` s'en servent déjà pour lister les essences à la main, ex. sur
"Histo Succès Série" : `"...{s3_cover_url?Cover ✅|Cover ❌} {s3_poster_url?
Poster ✅|Poster ❌}..."`. La duplication n'est donc pas un manque de
mécanisme moteur — c'est cette liste retapée à la main, une fois par niveau,
avec le risque de désynchronisation d'avec le vrai Manifeste que ça implique.

**Construit** (garde `whMessage` libre intact, n'enlève rien) :
- `config-schema.js`, façade `iconik.history` — nouveau champ optionnel
  `manifestId` (nature `manifeste`), à côté de `whMessage`.
- `pivot-to-wfd.js` — résolution `manifestId -> essences` (role/sortie/
  appliesTo, verbatim, non filtré — contrairement à Verify, pas de filtre
  sur un champ particulier, seule `sortie` doit exister).
- `workflow_history()` (moteur) — si `cfg.essences` présent : filtre par
  `appliesTo`/`TypeCollection` (même mécanisme que `checker()`), construit
  un gabarit `{sortie?Rôle ✅|Rôle ❌}` par essence dans la portée, le résout
  via `r()` (réutilise l'interpolateur existant, pas un second mécanisme),
  et l'ajoute comme dernier segment de la ligne.

**Vérifié, pas supposé** : test isolé (get/put Iconik simulés) confirme
Episode → "Episodic ❌ Video ✅ Subtitle ✅", Série → "Cover ✅ Poster ✅
Hero ❌ Title ❌" — exactement la portée réelle par niveau, générée depuis le
Manifeste plutôt que retapée. Nœud History réel peuplé avec les vraies
valeurs de production (target/mdField/whMode/whWfName… retrouvées sur
"Histo Succès Série") + `manifestId`. Vérifié en vrai dans le navigateur :
panneau complet, "Manifest" → "Livraison VOD Factory | PRIME (9)" sélectionné,
aucune erreur console. Note : l'aperçu de ligne (`whApercuLigne`) n'inclut
pas la checklist — elle dépend de variables (`{s3_cover_url}`…) qui n'existent
qu'à l'exécution réelle, même limite déjà documentée pour `whSummaryVar`.

**Avec Verify + History, PUBLISH n'a plus aucune duplication par niveau** —
Deliver (3 août), Verify et History (4 août) se pilotent tous les trois
depuis le même Manifeste (`essences` + `appliesTo`), chacun lisant les
champs qui le concernent (`sortie`/`cardinalite` pour Deliver, `verifyPath`
pour Verify, `role`+`sortie` pour History).

## Import/Export JSON + badge Draft/Published + compteur d'usage — 4 août

Dernier chantier de la session, sur les 5 onglets du Workflow Builder
(Workflows/Manifestes/Tree Builder/Correspondances/Endpoints).

**Design tranché avec l'utilisateur** avant de coder : pour "où cette
ressource est-elle utilisée", pas de liste dépliée dans la cartouche (risque
de bruit visuel signalé par l'utilisateur) — un compteur discret réutilisant
exactement le style des compteurs déjà existants ("30 lignes", "9 essences"),
absent plutôt qu'à "0" quand la ressource n'est référencée nulle part, avec
le détail (quels workflows) au survol (`title`) plutôt qu'affiché en dur.

**Construit** :
- `GET /api/builder-flows` (liste) — inclut désormais `status`/
  `publishedVersion` par item, même calcul que le détail (le brouillon
  courant EST-IL la dernière version figée), sans stocker le statut nulle
  part (builder-etat.md, section Versionnement).
- `GET /api/builder-flows/usage` (nouveau) — un seul scan de tous les
  BuilderFlow de l'org, récursif dans les corps de boucle, pour
  `mappingId`/`manifestId`/`sequenceId`/`templateId` → renvoie qui référence
  quoi. Une requête, mémoïsée côté client (une seule fois par chargement de
  page, pas par onglet), pas de N+1.
- `workflow.js` — helpers génériques `_boutonExport`/`_exporterJSON` (GET
  complet + téléchargement Blob) et `_declencherImport`/`_initImportBouton`
  (file picker + POST + reload), réutilisés tels quels sur les 5 types.
  L'id de la ressource exportée n'est jamais renvoyé au POST — réimporter
  crée toujours une NOUVELLE ressource, jamais un écrasement silencieux ;
  une collision de nom fait échouer avec le message d'erreur de l'API.
- Badge `.wb-badge-draft`/`.wb-badge-published` sur les lignes Workflows.
- Compteur `.wb-item-usage` sur les 4 autres onglets.

**Vérifié** : cycle export→import complet testé (Manifeste "Livraison VOD
Factory | PRIME", 9 essences avec `verifyPath`) — réimporté avec un nom
différent, contenu identique confirmé, nettoyé après coup. Vérifié en vrai
dans le navigateur sur les 5 onglets : bouton Importer présent partout,
export par ligne présent partout, badges DRAFT sur les 5 workflows actuels
(cohérent — aucun n'est à jour avec sa dernière version publiée), compteur
"utilisé dans 1 workflow" correct sur le Manifeste/la Correspondance/les
Endpoints réellement branchés à PUBLISH, absent sur les gabarits (aucun
n'est encore référencé). Aucune erreur console sur aucun onglet.

## Mapping "VOD Factory | Fields" — écart de 29→32 lignes clarifié

Le 3 août, l'incident de perte de données sur ce Mapping avait été réparé en
réinjectant 32 lignes depuis le nœud Lookup source, avec un écart signalé
mais non expliqué (l'écran affichait 29 lignes juste avant l'incident, pas
32). Clarifié par l'utilisateur le 4 août : suppression volontaire de lignes
inutiles de sa part, pas un second incident ni une perte de données à
investiguer. Rien à corriger côté code.

## Moteur d'exécution natif — construit et vérifié contre PUBLISH — 5 août

### Pourquoi
Le Builder savait construire des workflows (format pivot) mais ne pouvait
en exécuter aucun — `pivot-to-wfd.js` ne servait qu'à convertir vers WFD
pour validation hors-ligne (`scripts/preuve-conversion.js`), jamais depuis
une route en production. Décision de l'utilisateur en tout début de
session, avant même de discuter du périmètre des panneaux Logs/Run (ce qui
avait motivé la question) : "il faut s'attaquer au moteur... je ne veux pas
investir du temps en bossant sur un moteur qui disparaîtra. Pour le moment
on a pas validé le moindre workflow dans le builder donc c'est le moment
ou jamais." Décision plus ancienne réaffirmée : WFD reste une base de
comparaison, jamais une dépendance d'exécution du Builder — y compris pour
la *lecture* de son historique de runs, pas seulement pour l'exécution
elle-même (nuance ajoutée cette session).

### Architecture
Nouveau dossier `server/engine-builder/` (une vingtaine de fichiers),
aucune dépendance runtime à `server/engine/wfd-engine*.js` — la logique
d'appel Iconik proprement dite (construction d'URL, pagination, mapping de
champs) a été copiée/adaptée depuis `wfd-engine-handlers.js` dans des
fichiers neufs, ce qui était explicitement autorisé (interdiction porte sur
le *couplage runtime*, pas sur la réutilisation de logique éprouvée).

- **Exécuteur** (`builder-executor.js`) : parcours récursif de
  `{steps, edges}` (+ `body` des boucles), un chemin actif à la fois — même
  modèle que WFD, mais les ports du pivot sont des **chaînes** (le libellé
  de la condition), donc aucune traduction port-nommé ↔ index numérique à
  faire, contrairement à `pivot-to-wfd.js`. Le fan-out `otherwise` d'une
  décision (que WFD doit synthétiser à la conversion) est résolu
  dynamiquement ici, à la recherche de l'arête suivante.
- **Boucles** : pile de scope (`builder-context.js`,
  `pushLoopScope`/`scopedSetVar`/`popLoopScope`) qui corrige un bug réel de
  WFD trouvé en le portant — une boucle imbriquée réutilisant le même nom
  de variable qu'une boucle englobante (`loopVar: 'item'` des deux côtés)
  écrase silencieusement la valeur externe sans jamais la restaurer.
  Vérifié avec un test dédié (deux boucles imbriquées, même `loopVar`) :
  chaque boucle retrouve bien sa propre valeur d'itération à la sortie.
- **Résolveur** (`builder-resolver.js`) : résout en bloc, au démarrage du
  run, toutes les ressources d'org référencées
  (`mappingId`/`manifestId`/`sequenceId`/`templateId`/`connexionId`,
  récursif dans les corps de boucle) — pas de résolution paresseuse par
  étape, pour échouer avant tout appel Iconik plutôt qu'au milieu d'un run.
- **Client Iconik** : résolu depuis `workflow.environment` — **un ID
  d'Environment, pas un nom** (vérifié sur le document réel de PUBLISH et
  sur `workflow-canvas.js:913`, `o.value = e.id` ; le commentaire de
  `pivot-io.js` ne précisait pas le format et a induit en erreur au premier
  essai). Repli sur les credentials de la Custom Action elle-même
  (`auth_token`/`app_id`) si l'environnement n'est pas configuré — même
  priorité que WFD.
- **Persistance** : nouvelles tables `BuilderRun`/`BuilderRunEvent`
  (Postgres, org-scopées) — pas de fichier JSON comme
  `wfd-run-history.js`. Chaque événement stocke un **snapshot complet** du
  contexte (pas un résumé), décision explicite pour que le futur panneau
  Logs puisse inspecter l'état à n'importe quelle étape passée (contraste
  avec le reproche fait au vieux panel Debug de WFD).
- **Déclenchement** : `POST /api/builder-engine/trigger/:flowId` (manuel,
  org-scopé, brouillon par défaut ou version publiée explicite) et `POST
  /api/builder-engine/action/:slug` (webhook Custom Action Iconik — ne peut
  pas être org-scopé en entrée, Iconik n'a aucune notion d'org APS ;
  exécute **toujours la dernière version publiée**, jamais le brouillon,
  409 sinon). `GET /api/builder-runs` pour la lecture (pensé pour `curl`,
  pas encore d'UI).
- **Couverture** : les 12 Cores + les 11 Facades du catalogue pivot sont
  tous câblés dans `builder-handlers-index.js`. La façade `iconik.action`
  porte les 41 `actionType` du dispatcher WFD d'origine (le panneau les
  expose tous, un seul — `export_location_trigger` — a des champs dédiés).
  Cores déclarés mais hors périmètre (`qc`/`script`/`delay`/`approval`/
  `call_workflow`) lèvent une erreur explicite plutôt qu'un no-op muet.

### Vérification — `scripts/preuve-execution.js`
Nouveau script (pendant de `preuve-conversion.js`, mais pour l'exécution) :
charge un document pivot, l'exécute deux fois — via WFD
(`pivot-to-wfd.js` + `WfdExecutor.executeFlux`, en mémoire, sans toucher
aux tables `Flow`/`Run`) et via le moteur natif — puis compare statut,
séquence de ports et variables clés.

Lancé contre **PUBLISH réel** (`BAYARD | PUBLISH | VODFACTORY`) sur une
vraie collection QA ("Star Trek", `db96828e-7f91-11f1-8269-2ae267fc2477`,
env `QA | ASKIDA`), avec de vrais appels Iconik/S3/API partenaire (VOD
Factory **preprod**, jamais prod). Deux allers-retours nécessaires :

1. **Premier run, arrêt prématuré des deux côtés** — l'étape "Notify
   Running" (History) et l'étape "Get Collection ID" (Search) échouaient
   identiquement dans WFD ET le moteur natif, pour la même raison réelle :
   deux champs du document PUBLISH stocké en base contiennent une
   référence de variable **sans ses accolades** (`targetId: "collection_id"`
   au lieu de `"{collection_id}"` ; critère de recherche
   `value: "collection.id"` au lieu de `"{collection.id}"`) — donc jamais
   résolus, utilisés tels quels comme chaînes littérales. Une troisième
   occurrence trouvée par cohérence (`fields[0].value: "generated_id"` sur
   "Set Bayard ID") et une quatrième dans le corps de boucle (`assetId:
   "item.id"` sur l'étape Action). **4 corrections appliquées directement
   dans le document** (accord explicite de l'utilisateur) : accolades
   ajoutées. Une cinquième valeur (`targetId: "collectionsID"` sur l'étape
   "Set Metadata" finale, orthographe ne correspondant à aucune variable
   connue) corrigée par forte inférence contextuelle vers `"{collection.id}"`
   — le step voisin (History final) cible déjà correctement `{collection.id}`
   pour le même besoin.
2. **Deuxième run, nouvel arrêt identique des deux côtés** — la décision
   "Programme ?" a 4 conditions étiquetées `Série`/`Saison`/`Episode`/
   `Unitaire`, mais ses 4 arêtes sortantes stockées utilisaient encore
   l'ancien encodage numérique WFD (`out-0`..`out-3`) au lieu du libellé —
   ni WFD (dont la conversion ne retrouve aucune arête matching) ni le
   moteur natif (qui cherche l'arête par libellé) ne pouvaient continuer.
   **Corrigé** (accord explicite) : les 4 arêtes renommées vers leur
   libellé réel.
3. **Troisième run — équivalence exacte, bout en bout.** Les deux moteurs
   exécutent l'intégralité des **14 étapes** de PUBLISH avec la même
   séquence de ports et les mêmes variables : recherche réelle qui trouve
   la collection, décision "Série", "Bayard ID ?" → `default` (déjà
   renseigné), Ancestor Resolver → `"Star_Trek_44931263"` (identique des
   deux côtés), Deliver "Check Collection" → `miss`, recherche des assets
   → 10 résultats, Loop → `out` (0 itération réelle sur cette collection,
   cf. "reste ouvert" ci-dessous), Lookup → `found`, **Partner** (vraie
   séquence HTTP vers le partenaire preprod, y compris la logique de retry
   POST→PUT sur 422) → `err` (rejet réel du partenaire, "external_id déjà
   pris" — pas un bug, une vraie contrainte métier), Verify → `ok`, Set
   Metadata + History finale → `out`. Statut final `partial` identique des
   deux côtés (2 erreurs identiques).

**Effet de bord réel resté en base** : le champ `StatutPrime` de la
collection de test porte une ligne d'historique supplémentaire par run de
vérification (texte informatif, jamais nettoyé — à traiter manuellement si
la collection sert encore à autre chose). Aucun enregistrement créé côté
partenaire (les deux tentatives ont été rejetées par une vraie validation
422).

### Reste ouvert
- Deux imperfections trouvées dans PUBLISH, **non corrigées** (hors
  accord explicite, contrairement aux deux corrections ci-dessus) : l'étape
  Search des assets à exporter a `field: "_"` au lieu de `"__collection__"`
  (l'opérateur `in_collection` n'existe dans aucun des deux moteurs — la
  requête part sans filtre de collection, ce qui explique les "10
  résultats" venant potentiellement de tout le catalogue plutôt que de
  cette seule collection) ; la Boucle a `loopVariablePath:
  "assetsAExporter.object_type"`, qui ne résout jamais vers un tableau
  (probablement `.objects` attendu) — la boucle ne fait donc jamais tourner
  son corps (Video Info / Check Asset / Action / Wait / Recheck) sur cette
  collection dans son état actuel.
- ~~Pas de panneau UI pour déclencher un run ou voir les résultats~~ —
  **construit plus tard le même jour** (panneaux Run/Jobs/Logs, puis Debug
  + animation live des badges — cf. section "Animation live des jobs" tout
  en bas).
- Webhook (`POST /api/builder-engine/action/:slug`) **toujours** jamais
  essayé depuis une vraie Custom Action cliquée dans Iconik — seulement
  avec un payload construit à la main (déclenchement manuel testé à fond,
  webhook réel non touché ce jour-là non plus).
- Cron/planification pas construits (différé, comme pour WFD au départ).
- Drift de base pré-existant découvert en passant (sans rapport avec ce
  chantier) : la table `ApsCounter` existe en production mais n'a jamais
  eu de modèle Prisma déclaré — `prisma db push` voulait la supprimer
  (`--accept-data-loss` l'aurait fait). Contournement : `BuilderRun`/
  `BuilderRunEvent` créées via SQL brut (`psql`), `prisma generate` lancé
  séparément (codegen pur, sans toucher à la base). Le compteur atomique du
  moteur natif (`builder-iconik-shared.js`, `nextOrderNumber`) recrée cette
  même table à la volée (`CREATE TABLE IF NOT EXISTS`), comme le faisait
  déjà WFD — ne pas "corriger" ce gap sans en parler d'abord.

---

## Recheck S3 de PUBLISH v2 — bug de fond corrigé — 5 août (suite)

Repris juste après la fin de session précédente. Le "Recheck" (deliver
après l'export Iconik réel) restait bloqué en `miss` malgré un export qui
réussissait vraiment (Action → Wait → succès). Cause réelle :
`builder-handler-deliver.js` défaultait `operation` sur `'head_object'`
(HEAD sur une clé exacte) alors que `config-schema.js` documente déjà
`list_objects` comme défaut implicite (`(m.lire('operation') ||
'list_objects')`), et les 6 occurrences réelles du flux WFD source fixent
toujours `operation` explicitement à `list_objects` — jamais `head_object`.
Comme `filebase()` retire l'extension du nom de fichier, un HEAD sur cette
clé ne peut jamais matcher un vrai fichier (qui, lui, a une extension) :
`miss` garanti, indépendamment du succès réel de l'export. Corrigé
(défaut aligné sur `list_objects`), vérifié directement contre les vrais
fichiers déposés ce jour-là par l'export QA — `port: 'out'`, bonnes URLs.
Bug de fond, pas spécifique à PUBLISH : bénéficie à tout core `deliver`/
`aws_s3.deliver` du catalogue.

---

## Versionnement et dépublier — 5 août (suite)

Cf. section "Versionnement" plus haut, mise à jour sur place : restaurer/
supprimer une version, et `BuilderFlow.active` (dépublier/republier),
construits et vérifiés le même jour. Point réel vécu en le construisant :
le canevas auto-sauve sur tout changement du modèle — restaurer une
version écrase donc le brouillon en base en quelques secondes, pas
seulement à l'écran. Confirmation ajoutée après coup, pas dans le premier
jet.

Décision utilisateur actée ce jour-là : **abandon de PUBLISH v1** au
profit de v2 (export corrigé), une fois v2 testée. Bascule elle-même
**pas encore faite** — dépend maintenant de l'animation live des jobs
(section suivante), construite pour faciliter précisément ce test.

---

## Tidy — disposition automatique des nœuds — 5 août (suite)

Cf. section "Canevas" plus haut, mise à jour sur place. Déclenché par un
incident réel, pas une demande à froid : restaurer une version sur le
vrai PUBLISH a produit une cascade diagonale sur 16 nœuds, illisible.
`@dagrejs/dagre` vendoré (`_vendor/dagre/`), remplace le repli en cascade
partout où il existait (chargement initial, restauration de version,
première ouverture d'un corps de boucle) + bouton "Réorganiser" (🧹)
explicite. Aucun dialogue de prévisualisation construit — Ctrl+Z suffit,
cohérent avec le reste du canevas.

---

## Animation live des jobs — construit et vérifié — 5 août (suite)

Motivation directe de l'utilisateur : "pour me faciliter les tests" —
retrouver l'animation de jobs de WFD sur le canevas, mais sans reproduire
son bug le plus gênant en production, vécu et décrit précisément avant
d'y toucher : un nœud en erreur dont le port erreur est branché sur un
nœud suivant restait quand même figé sur le canevas, visuellement
confondu avec un vrai nœud de pause.

**Diagnostic exact du bug WFD**, retrouvé dans le code plutôt que supposé :
`_wfdHandleEngineEvent` (`script-workflow-designer.js`), cas `'node:error'`,
fixait `stay=true` en dur — jamais dérivé du port pris ni de la présence
d'une arête vers un nœud suivant réellement exécuté. Le cas voisin
`'node:done'` le faisait pourtant correctement (`stay` dérivé de
`ev.warn`) : la bonne logique existait déjà dans le même fichier, juste
pas appliquée à la branche erreur.

**Bonne nouvelle côté Builder** : `BuilderRunEvent.port` enregistre déjà
quel port chaque étape a pris, y compris pour une erreur qui continue —
aucun nouveau champ moteur nécessaire. Règle retenue avec l'utilisateur
pour "Blocked" (orange) : si le run entier s'est arrêté (`onError` du
workflow réglé sur `"stop"`), le nœud dont l'erreur est fatale devient
Blocked ; sinon un nœud qui a erroré mais dont le run a continué ailleurs
reste simplement rouge (honnête sur son propre passé), le badge "actif"
avançant normalement vers la suite.

**Prérequis corrigé en premier, bug de fond indépendant de cette
fonctionnalité** : les nœuds `decision` rendaient leurs ports de sortie
avec des ids `out-0`/`out-1` (`portsWfd()`, `pivot-catalog-iconik.js`),
alors que le moteur (`builder-handler-decision.js`) route sur le
**libellé** de la condition (`{port: cond.label}`), tout comme le
validateur. Conséquence réelle trouvée en base avant de coder quoi que ce
soit : **30 arêtes de décision cassées** sur des flows publiés, dont
PUBLISH (plusieurs versions) et CREER SAISON — toute arête de décision
dessinée depuis le canevas actuel était déjà silencieusement non-
fonctionnelle à l'exécution, indépendamment de ce chantier. Corrigé
(`portsWfd` utilise le libellé) + réparation automatique au chargement
(`normaliserAretesDecision`, sans script de migration en base ni toucher
aux versions figées, qui restent des instantanés immuables).

**Construit** (`server/public/builders/workflow/`) :
- `wf-run-status.js` — dérivation pure du statut par étape + arêtes
  empruntées, à partir du document + des événements d'un run. Arêtes
  matchées par **signature de contenu** (`from.step`+`from.port`+`to.step`),
  pas par id — `wf-scope.js` retire les ids (valeurs de session) en
  réécrivant le document, un document récupéré via l'API n'en a aucun de
  stable.
- `wf-run-poll.js` — sondage partagé unique (1500ms, incrémental via
  `?since=seq`) pour "le run actuellement ouvert", diffuse `aps:run-tick`
  sur `root` ; met en cache le document exécuté par run.
- `wf-run-overlay.js` — applique le statut sur les nœuds (`data-run-
  status`) et surligne les arêtes empruntées ; survit à un rendu
  structurel (edit/undo/navigation de portée) sans souscription à
  `model.onChange`.
- Nouvel onglet **Debug** (dock droit) — cliquer un nœud pendant/après un
  run affiche son historique complet d'événements (toutes les itérations
  si le nœud est dans une boucle — le badge, lui, ne reflète que la
  dernière), `ctxSnapshot` inclus.
- Backend : le déclenchement manuel devient **asynchrone** (répond
  immédiatement avec le `runId`, exécute en tâche de fond) — c'était
  auparavant synchrone, donc aucune fenêtre "en cours" n'existait à
  animer pour un déclenchement manuel, exactement le cas d'usage visé.
- `jobs-logs-panel.js` affiche désormais le libellé du nœud (ex. "Get
  Collection ID") au lieu des ids bruts.

**Vérifié en direct** (flux jetables + le vrai flux PUBLISH en lecture
seule) : badge honnête sur le nœud qui erreure (rouge) + badge qui avance
correctement sur le nœud suivant (vert) + arête empruntée surlignée ;
distinction `blocked` (orange, run arrêté) vs `error` (rouge, run
continue) ; routage réel par libellé de décision bout en bout via un vrai
clic sur le bouton Run (pas juste `curl`) ; onglet Debug + libellés Logs
corrects ; zéro erreur console partout, y compris en rechargeant le vrai
PUBLISH (16 nœuds, aucune régression).

### Reste ouvert
- **Badge de boucle = dernière itération seulement** — un échec
  intermédiaire sous `onError:'continue'` reste invisible sur le badge,
  récupérable uniquement via l'onglet Debug en ouvrant l'événement précis
  de cette itération. Compromis assumé, pas construit autrement.
- **Pas de test en vraie boucle multi-itérations** — vérifié par test
  unitaire sur `wf-run-status.js` (données simulées), pas en conditions
  réelles faute d'un moyen simple de seeder un tableau de test pendant
  cette session.
- **Bascule PUBLISH v1 → v2 toujours pas faite** — outillage prêt
  (dépublier, animation live pour tester v2 en vrai), décision de
  l'utilisateur actée, mais l'exécution elle-même reste à faire.
- Webhook réel (vrai clic Custom Action Iconik) toujours jamais essayé —
  seulement le déclenchement manuel, maintenant testé à fond.
- Les deux imperfections de PUBLISH non corrigées (critère de recherche
  `field:"_"`, chemin de boucle `loopVariablePath`) — toujours ouvertes,
  cf. section "Moteur d'exécution natif" plus haut.

---

## Panneau Run refondu (Assets/Action/Debug) — 6 août

Suite directe de la session du 5 : le panneau Run/Debug construit ce
jour-là a été testé pour de vrai par l'utilisateur sur PUBLISH v2 (webhook
Iconik réel — l'écran de jobs Iconik montrait 4 assets "Failed" + 3
"Finished") et rejeté à l'usage : "le nœud clignote mais rien n'indique
combien de passages ont eu lieu", et l'onglet Debug "n'est qu'un extrait
de Logs... répétitif, sans valeur ajoutée".

**Refonte actée avec l'utilisateur** : un seul panneau Run, 3 onglets au
rôle strictement distinct — Assets (quels assets, combien, sont passés
par CE nœud), Action (ce que CE nœud a produit, rien d'autre), Debug
(peut être bavard, c'est un debug). Le formulaire de déclenchement
manuel (jusqu'ici dans Run) déménage dans Jobs, replié — Jobs déclenche
ET liste, Run n'est QUE l'inspecteur d'un nœud pour le run suivi.

**Assets** : regroupe les événements d'un nœud en passages réels
(start→erreur?→done, jamais un décompte d'événements bruts — un
`continue_log` émet error PUIS done pour LA MÊME itération, compter les
deux séparément double le total, bug réel trouvé et corrigé pendant la
vérification). Résout l'identité par itération : variable de boucle du
document si le nœud est dans une Loop, sinon `ctx.asset`/`ctx.collection`
du contexte. Le décompte manquant ("je ne vois pas le nombre de jobs")
vit directement sur le libellé de l'onglet ("Assets (3)").

**Action** : diff générique entre le `ctxSnapshot` du `step:start` et du
`step:done`/`step:error` d'un nœud — isole ce que CE nœud a réellement
écrit dans `ctx.vars`/`ctx.results`, pour n'importe quel core, sans
connaître son détail interne (contrairement au vieux panel WFD, qui avait
besoin d'un switch par famille de nœud). Un seul enrichissement dédié :
`decision` ne produit rien à differ (il route seulement), donc lit
`step.params.field`/`.conditions` pour afficher la condition testée en
une phrase lisible.

**Debug** : inchangé dans l'esprit — historique brut complet, verbeux,
juste relocalisé en sous-onglet.

**Deux bugs réels trouvés après coup, sur des rapports utilisateur
distincts, tous deux liés à `aps:flow-ready`** :
1. *"Run se vide tout seul après un moment"* — `aps:flow-ready` se
   redéclenche après CHAQUE sauvegarde, y compris l'auto-save silencieux
   sur n'importe quelle édition (déplacer un nœud, etc.), pas seulement à
   l'ouverture d'un autre flow. `run-panel.js`/`jobs-logs-panel.js`/
   `wf-run-poll.js` réinitialisaient tout leur état à CHAQUE réception de
   cet événement au lieu de seulement sur un vrai changement de `flowId` —
   corrigé dans les trois fichiers.
2. *"Run vide tant que je ne suis pas passé par Jobs"* — Run ne suivait
   un run automatiquement que pour un run flambant neuf détecté en cours
   de session ; un flow dont tous les runs sont déjà terminés au
   chargement de la page n'était jamais auto-suivi. Corrigé : premier
   chargement de Jobs pour un flow → auto-suit le run le plus récent
   (`startedAt desc`), quel que soit son statut.

**Vérifié** : sur des runs jetables (créés/exercés/supprimés via l'API,
zéro appel Iconik/S3 réel), et sur le vrai run le plus récent de PUBLISH
v2 pour confirmer les identités/diffs contre de vraies données.

---

## Badges de job flottants — trois tentatives, port fidèle de WFD accepté — 6 août (suite)

Le décompte affiché sur l'onglet Assets (ci-dessus) ne suffisait pas à
l'utilisateur : *"toujours pas de badges flottants sur les nœuds pendant
le run"*. Trois passes, corrigées une à une par les retours directs de
l'utilisateur — nommées ici pour ne pas les refaire :

**Tentative 1 (rejetée sans le dire, silencieusement invisible)** : badge
en pseudo-élément CSS (`::after` sur `.bd-node-canvas`), en surplomb
au-dessus du nœud (`top:-10px`). Invisible sur la plupart des nœuds :
`.cnv-frame` (le cadre du canevas) a lui aussi un `overflow:hidden`, et
tout nœud de la première rangée voit son badge coupé net par cette
frontière — ne restait qu'un fin croissant, confondu à l'œil avec un
connecteur de fil. Diagnostiqué en scannant les pixels d'une vraie
capture d'écran (Python/PIL) plutôt qu'en zoomant le canevas en direct
(la transformation pan/zoom du canevas, recalculée à la main, a produit
plusieurs captures trompeuses avant cette méthode).

**Tentative 2 (techniquement corrigée, rejetée quand même)** : badge
inséré À L'INTÉRIEUR de la boîte du nœud (`top:3px`), qui ne dépend plus
d'aucun ancêtre — fonctionnait, vérifié pixel par pixel. Rejet net de
l'utilisateur malgré tout : *"Tu improvises encore. Ça marchait dans
WFD. Cette idée ne me plaît pas. Je préfère que tu la retires."* Pas une
demande de correction — une demande de retrait. Retiré intégralement
(attribut, CSS, calcul de décompte, plomberie dans 3 fichiers) ; `git
status` confirme `wf-run-status.js`/`wf-run-overlay.js` revenus à l'état
commité, diff nul.

**Tentative 3 (acceptée) — port fidèle, pas une réinvention.** Consigne
explicite : *"comment on peut avoir la même animation que WFD... pas
d'invention."* Cette fois, le vrai code de WFD lu avant d'écrire une
ligne (`script-workflow-designer.js`, section badges + son CSS
`.wfd-job-badge`). Nouveau fichier `wf-run-badges.js` : un vrai `<div>`
flottant (pas un pseudo-élément), même cycle de vie (apparition →
déplacement/recoloration → disparition), mêmes durées d'animation
(200ms/350ms, disparition auto après 1.5s si l'état n'est pas "à
garder"), mêmes couleurs par statut (jetons de cette app plutôt que le
hex de WFD, seule adaptation), même contenu (un chiffre — nombre de
passages). Positionné via `--nx`/`--ny` (la vraie position du nœud dans
ce canevas, `node-renderer.js`), donc hérite du pan/zoom sans recalcul
manuel — contrairement à WFD (`offsetLeft`/`offsetTop`, positions en
`left`/`top` direct côté nœud, pas de transform CSS à ce niveau).

Piloté par les `newEvents` de chaque sondage (ce moteur interroge toutes
les 1.5s, WFD recevait un flux poussé en direct) comme s'il s'agissait
d'événements live. Ne rejoue jamais l'historique complet d'un run rejoint
après coup (sélectionné dans Jobs, ou auto-suivi) — WFD n'a jamais ce cas,
ses badges n'existent que pour un job réellement en vol au moment où on
regarde.

**Deux bugs réels trouvés en vérifiant** :
1. Le sondage émet un tick synchrone VIDE dès l'appel à `suivre()`, avant
   le premier vrai fetch — ce tick vide consommait le garde-fou "ne pas
   rejouer le premier tick", si bien que le VRAI premier tick (qui porte
   l'historique) arrivait avec le garde-fou déjà épuisé et se faisait
   animer par erreur. Corrigé : le garde-fou ne se consomme que sur un
   tick portant de vraies données.
2. *"Si je fais un run de test sans Iconik, je suis censé voir les
   badges ?"* — question qui a révélé un vrai trou : un run déclenché
   depuis CE navigateur (▶ Run) peut échouer plus vite que le premier
   sondage (connexion Iconik absente/en échec immédiat) ; le premier
   fetch peut alors DÉJÀ contenir tout l'historique, traité à tort comme
   "rejoint après coup" et jamais animé. Corrigé : `WfRunPoll.suivre(id,
   liveDepuisDebut)` — vrai uniquement quand CE navigateur vient de
   déclencher le run lui-même (jobs-logs-panel.js, juste après la réponse
   du POST /trigger) — dans ce cas, même le premier fetch est
   authentiquement du direct, jamais sauté.

**Vérifié** : traçage console direct dans le code réel (pas une
supposition externe) confirmant le cycle de vie complet dans l'ordre
(apparition → transit succès → maintien 1.5s → disparition), plus
capture d'écran d'un vrai badge bleu flottant au-dessus d'un nœud.
Confirmé ensuite par l'utilisateur lui-même en conditions réelles
("J'ai vu des badges").

---

## Noms Iconik résolus en direct + points d'entrée du corps de Loop — 6 août (suite)

Deux demandes UX une fois les badges validés.

**Noms de collection dans Assets** : `ctx.collection` ne porte que `{id}`
dans le contexte d'un run, jamais de titre. `run-panel.js` résout
maintenant le nom en direct via le proxy Iconik déjà utilisé ailleurs
dans l'app (`/api/iconik/:envSlug/API/collections|assets/v1/:id/`,
`X-Force-Live`, même mécanisme que `config-sources.js`) — l'id reste
affiché immédiatement, remplacé par le nom dès qu'il arrive, mis en
cache par id pour ne jamais re-résoudre.

**Corps de Loop plus direct à ouvrir** : *"je pense que Loop est trop
abstrait"*. Un bouton "Edit body →" existait déjà dans le panneau Config
(ajouté le 4 août pour la découvrabilité) mais nécessitait de
sélectionner le nœud puis ouvrir Config — jugé encore trop indirect.
Recommandation actée avec l'utilisateur : ne pas construire de rendu
imbriqué (mini-canevas dans la boîte du nœud) ni de fenêtre/iframe — trop
de complexité réelle pour probablement moins lisible, et une fenêtre
casserait la logique "que des volets plats" de cette app. Garder la
navigation de portée existante (`portee.entrer()`, fil d'Ariane déjà
éprouvé), juste ajouter des points d'entrée plus directs vers la MÊME
mécanique : le badge "N steps", déjà visible sur le nœud, est maintenant
cliquable ; "Open loop body" apparaît aussi au clic droit sur un nœud
Loop, avant les actions génériques (Duplicate/Copy/Delete).

---

## PUBLISH v2 mené jusqu'à une publication réussie — 6 août (après-midi)

Session de bout en bout sur un vrai workflow, déclenché par de vrais clics
Custom Action Iconik. Chaque correction est partie d'un symptôme constaté
par l'utilisateur, pas d'une lecture de code — et plusieurs de mes
premières explications se sont révélées fausses, corrigées en allant
chercher la donnée réelle (événements en base, réponse Iconik en direct).

### Chaîne d'échecs de PUBLISH, remontée jusqu'à la cause racine

Le symptôme final était « Verify échoue en 404, on n'arrive pas à joindre
VOD Factory ». C'était faux à chaque étage :

1. **Le port branché sur la Loop était inversé.** `found` (des assets à
   exporter) contournait la boucle, `empty` y entrait. Le seul mécanisme
   d'export du workflow ne s'exécutait donc jamais quand il y avait
   quelque chose à exporter.
2. **Quatre arêtes dupliquées** (`Programme ? → Bayard ID ?`, chaque port
   défini deux fois). L'exécuteur ne déduplique pas : toute la branche
   aval tournait deux fois, d'où « 4 jobs OK et 4 en failed » côté Iconik
   — la seconde passe rejouait des exports déjà faits. Invisible à l'œil,
   les arêtes se superposant exactement sur le canevas.
3. **Le chemin S3 ne correspondait pas au bucket.** Le listing cherchait
   `{ancestorPath}/`, les fichiers étaient sous `AmazonPrime/{ancestorPath}/`.
   Le préfixe `AmazonPrime/` est ajouté par l'Export Location Iconik à
   l'écriture — mais le listing S3 est un appel direct qui n'en hérite
   pas. Fausse piste au passage : le message d'échec d'Iconik affiche ce
   chemin en minuscules, ce qui m'a fait écrire `{lower(ancestorPath)}` ;
   la capture du bucket par l'utilisateur a montré la casse d'origine.
4. **Le Lookup n'envoyait pas de titre.** La règle `Titre → title` existait
   bien, mais cherchait une métadonnée Iconik `Titre` qui n'existe pas sur
   ces collections (le titre est un champ *système*), et son repli
   `{collectionCheck.title}` ne résolvait nulle part — vérifié : aucun
   workflow de la base ne produit cette variable, vestige d'une version
   antérieure. `builder-handler-lookup.js:114` saute toute ligne dont le
   repli reste un placeholder, donc `title` était absent du payload.
   VOD Factory répondait `422 — The title field is required.`
5. **L'upsert masquait ce 422.** Sur un POST refusé en 422, il retente en
   `PUT /{external_id}` et **écrasait le résultat du POST**. Le seul
   message remonté était le 404 du PUT (« Content not found ») — la
   conséquence, jamais la cause. D'où la lecture « VOD Factory est
   injoignable » alors qu'il répondait parfaitement.

Après correction : POST 201, Verify 3/3, History « ✅ Succès », 4 uploads
confirmés. Repli du `Titre` repointé sur `{search_results.title}`.

### Relecture des métadonnées Iconik : toujours vide

`GET /API/metadata/v1/{collections|assets}/{id}/` renvoie un dict **plat**
(`{Champ: {name, type, values:[…]}}`), pas la forme
`{metadata_values: {Champ: {field_values: […]}}}` attendue par le PUT et
supposée par les trois points de relecture du moteur. `existing` valait
donc **toujours `{}`**.

Conséquence principale, rapportée comme « la notif En cours ne s'inscrit
pas dans history » : History ne lisait jamais le contenu précédent, donc
chaque écriture produisait une ligne unique écrasant les précédentes, et
le mode `update` ne retrouvait jamais la ligne de son propre run.
Normalisé via `metadataValuesDepuisReponse()` (builder-iconik-shared.js).

### Sémantique des statuts

- **Checklist artworks** : calculée depuis les variables S3 (`s3_cover_url`…)
  alors que le listing S3 n'est qu'un pré-contrôle technique. Un run
  affichait « ❌ Échec » global ET « Cover ✅ Poster ✅ Hero ✅ ». Elle
  reflète désormais le résultat **Partner** (`checkerResult`) pour tout
  essence réellement vérifié ; repli sur S3 seulement pour ceux que Verify
  n'interroge pas. *« La vérif VOD Factory est celle qui importe à
  l'utilisateur. »*
- **Essence optionnel absent** → `➖` et non `❌` (Title sur une Série).
- **`partial` perpétuel** : `computeStatus()` bascule dès UNE entrée dans
  `ctx.errors`, et le pré-contrôle S3 initial en écrivait systématiquement
  une. Or sur une première publication le bucket est vide par définition :
  la cardinalité ne *peut pas* être satisfaite. Une publication
  intégralement réussie ne pouvait donc jamais être rapportée `success`.
  Nouvelle sévérité **`info`** : consignée et affichée, exclue du calcul de
  statut. Principe : un handler qui renvoie un port routable normal décrit
  un *chemin*, pas une erreur — c'est le graphe qui décide.

### Animation des badges, suite et fin

- **Runs webhook courts jamais animés** : le « premier tick » d'un run
  rejoint après coup sautait tout son historique en bloc. Un run de 5 s
  y tombait intégralement. Remplacé par un filtre sur l'âge de chaque
  événement (20 s, calibré sur un chargement de page à froid mesuré).
- **Auto-suivi bloqué après le premier run de la session** : `runSelectionne`
  servait à la fois d'« affiché » et de garde-fou contre l'auto-suivi, que
  l'auto-suivi posait lui-même. Séparé en `runChoisiParUtilisateur`, posé
  uniquement sur un choix explicite. C'était la vraie cause du « rien ne
  s'affiche tant qu'on ne passe pas par Jobs → clic → Logs », que le
  correctif du matin n'avait traité qu'à moitié.
- **Badge effacé en entrant dans un corps de boucle**, puis recréé au
  mauvais moment : `reappliquer()` supprimait tout badge hors de la portée
  rendue ; le vrai `step:done` ne retrouvait alors plus rien et repartait
  sur un badge neuf. Les badges hors-champ sont désormais conservés.
- **Résolution de nom de collection** : `/API/collections/v1/{id}/` 404 en
  permanence — le bon chemin est `/API/assets/v1/collections/{id}/`. Cette
  fonction n'avait donc jamais marché depuis sa construction.

---

## Run › Action refondu : lire ce que le nœud a FAIT — 6 août (suite)

Le diff générique vars/results du 6 août au matin montrait une charge utile
brute là où un opérateur attend une phrase. Sur une Decision, la seule
information affichée était le JSON `_decision`. Refonte demandée, alignée
sur l'ancien panneau WFD (`wfd-run-panel.js:480` et `:692`, qui procédait
déjà par famille) : **résumé lisible d'abord, brut derrière un dépliant
« Détail technique » — accessible, jamais imposé.**

Deux choix de structure, pour ne pas empiler 23 cas particuliers :
- **dispatch par façade puis par core** — `http_request` héberge des
  façades sans rapport (recherche, écriture de métadonnées, action,
  résolution d'ancêtres, fetch) ;
- **le cas par défaut n'est plus vide** : il rend en clair ce que le nœud a
  écrit. Différence entre « famille non prévue » et « rien à dire ».

Couverture vérifiée par script sur les 23 entrées du registre.

**Deux instrumentations du moteur** ont été nécessaires — le résultat final
ne permettait pas de reconstituer le déroulé après coup :
- `builder-handler-lookup.js` trace chaque règle (`_lk_trace_<id>`) :
  origine de la valeur (champ / métadonnée / variable / repli), valeur
  résolue, traduction appliquée, et le motif quand rien n'a pu être fait.
  Mapping inchangé — vérifié par rejeu sur le contexte réel d'un run,
  payload identique au bit près.
- `builder-handler-http-sequence.js` trace chaque sous-étape
  (`_seq_trace_<id>`), et `http_request` conserve enfin le corps **envoyé**
  (`envoye`) : seule la réponse l'était, alors que « qu'a-t-on demandé au
  partenaire ? » est la première question quand il refuse.

Rendu : Lookup affiche ses 30 règles en vert/rouge avec les valeurs
résolues (`Série → serie`, `BayardID → external_id · 17500196`) ; la
séquence Partner déplie ses 7 étapes avec le corps envoyé aplati en
« clé = valeur », les valeurs `foreach` et leurs échecs individuels, et le
refus d'origine masqué derrière un upsert. Loop liste enfin les échecs
d'itérations individuelles sous `onError:'continue'` — invisibles partout
ailleurs jusqu'ici, le badge ne reflétant que la dernière itération
(limite « assumée » du 5 août, comblée).

Justesses d'affichage : un gabarit `{now}`/`{slug(x)}` est qualifié
« calculé à l'exécution » et non « non résolu » en rouge (sa valeur n'est
pas récupérable depuis le snapshot, mais elle a bien été calculée) ; une
étape ignorée ou sans rien à envoyer est neutre, pas verte.

**Debug** : ce que le nœud a signalé remonte en haut et en clair, avec la
NATURE de l'erreur — `_motifHttp()` extrait `{errors:{champ:[motif]}}`
plutôt que le message d'enveloppe. Les erreurs non fatales n'émettent
aucun événement `step:error` (l'exécuteur ne le fait que sur exception
levée) : elles ne vivaient que dans `ctx.errors`, donc uniquement dans le
JSON du snapshot.

---

## Volet API ops — port du tiroir de WFD — 6 août (suite)

Le volet bas existait, vide. Port fidèle de `wfd-api-ops.js` : mêmes trois
sections (timeline des opérations dans l'ordre d'exécution, flux de
données par étape, détail avec corps de requête) et mêmes trois exports
(Postman, HTML imprimable, Python).

Source = le **document pivot enregistré**, pas un run : le volet décrit ce
que le workflow VA appeler. `aps:flow-ready` ne portant que
`{flowId, orgId, name}`, le brouillon est relu via
`GET /api/builder-flows/:id` ; l'auto-save relançant l'événement, la liste
suit l'édition — équivalent du `refreshApiOps()` branché sur
`sauvegarderConfig` côté WFD.

Écarts assumés, documentés en tête de fichier : rendu par création
d'éléments et classes CSS (pas d'`innerHTML` ni de styles en ligne — règle
dure du dépôt), ressources lues via les routes REST (`endpoints` et
`manifests` chargés directement : `config-sources.js` n'expose
délibérément qu'identité + décompte, alors que décrire une séquence exige
ses `steps` et un Verify ses `essences`), et **le corps d'une boucle est
inséré juste après elle** dans l'ordre topologique — ses appels sont de
vraies opérations API, les omettre donnerait une liste fausse (même piège
que WFD avait corrigé pour `aps_search` et `create_tree`). L'upsert PUT
est listé comme opération distincte : c'est un vrai second appel HTTP.

Vérifié sur BAYARD | PUBLISH | VODFACTORY : 38 opérations, 24 cartes de
flux (19 étapes racine + les 5 du corps de boucle), le nœud Partner
listant ses 7 étapes plus 2 upserts, et les trois exports produisant des
fichiers valides.

### Reste ouvert
- **Les traces Lookup et Séquence n'existent qu'à partir des runs
  exécutés après ce chantier** — les runs antérieurs n'ont rien à déplier
  (vérifié en rejouant le vrai Lookup sur le contexte réel d'un run et en
  injectant un run jetable, supprimé depuis).
- **`iconik.create_tree` n'a pas de résumé spécialisé** dans Run › Action :
  il retombe sur le repli lisible « valeurs écrites ». Suffisant, mais
  moins précis que les autres familles.
- **Le statut `partial` des runs déjà en base n'est pas recalculé** — il
  est figé à la fin du run. Seuls les prochains runs bénéficient de la
  sévérité `info`.
- **Payload VOD Factory minimal pour une Série** : titre, type,
  external_id et 4 images ; synopsis, genres, droits, pays restent vides
  faute de métadonnées correspondantes sur la collection Iconik.
  Confirmé conforme par l'utilisateur (le manifeste est par niveau ;
  Saison et Épisode compléteront). Les URLs `s3://` sont voulues : VOD
  Factory tire les sources du bucket avec ses propres credentials.

---

## Les quatre niveaux publiés — 6 août (soirée)

Série, Saison, Épisode, Unitaire ont tous été exécutés sur de vrais clics
Custom Action. Sept correctifs, presque tous sur des chemins de code que
seuls les niveaux inférieurs empruntent.

### Identifiants : format, registre, parenté

**Le registre ne s'appliquait qu'au mode numérique.** `bayardIdFor()`
n'était appelé que sous `if (type === 'numeric')` — la décision du 29
juillet (« calcul lisible **MAIS** relation Iconik↔APS stockée dans
BayardRegistry ») n'était donc implémentée qu'à moitié : un identifiant
timestamp n'était enregistré nulle part, et rien ne garantissait qu'un même
objet retrouve le sien.

Il n'y a jamais eu à choisir entre portabilité et registre. Le **format**
est calculable partout ; le **registre** est une table de correspondance
exportable qui apporte l'unicité et la stabilité. La note du 3 août
(« mode Numeric = non portable ») visait à côté : ce n'est pas le registre
qui lie à APS, c'est le tirage aléatoire, non reproductible ailleurs. Les
notes de portabilité de l'écran Config sont réécrites sur ce critère.

- `genererIdentifiant()` devient une **fabrique partagée** : le Générateur
  d'ID et `create_tree` produisaient des formats étrangers l'un à l'autre
  (8 chiffres vs horodatage) sur le MÊME champ Iconik.
- Le registre s'applique à tous les types, et son repli anti-collision
  rejoue le format d'origine au lieu de tirer un nombre.
- `create_tree` expose `idType` (absent = numérique, comportement d'origine).
- **`timestamp_numeric`** ajouté : `AAMMJJhhmmss` + 2 chiffres d'aléa = 14
  chiffres. Le champ Iconik `BayardID` est un ENTIER — le format `timestamp`
  historique (tirets + hexadécimal, ≈85 % des tirages contiennent une
  lettre) ne peut structurellement pas y entrer, d'où la valeur négative
  constatée. Borne Iconik portée à `99999999999999` par l'utilisateur.

**Tree Builder : « Génère un ID » dédoublé.** `create_tree` écrivait la
parenté à l'intérieur du `if (generateId)`, rendant inexprimable le cas
« rattaché à son parent, sans identifiant propre » — celui de la collection
Episode (décision du 16 juillet). Deux cases indépendantes désormais ;
gabarit sans la clé = ancien couplage exact.

### Chemins et essences

- **Segment de niveau non-racine amputé** : `resolveAncestors()` lisait
  `ctx.vars.title`, inexistant (le Search ne pose que `<resultVar>.title`).
  `Galactica_17500196/_40209885` au lieu de `…/Saison_01_40209885` ; le
  niveau Episode aurait eu un segment entièrement vide.
- **Un chemin non résolu ne doit pas devenir réel** : `ancestorPath` vide, le
  nettoyage du nom de fichier retirant les accolades, Iconik a livré 3
  fichiers dans un dossier S3 nommé `ancestorPath` chez le partenaire. Le
  listing, lui, gardait les accolades — d'où un Recheck en `miss` alors que
  l'export venait de réussir : les deux nœuds ne visaient pas le même
  endroit. Export et listing échouent désormais franchement.
- **`.mxf` absent du repli d'essences** : `Check Asset`/`Recheck` n'ont aucun
  manifeste attaché et retombent sur des filtres codés en dur. Le filtre
  sous-titre matchait, pas le filtre vidéo — d'où une vidéo « manquante »
  alors qu'elle était en S3.

### Ce que les runs ont prouvé

| Niveau | Essences | Verify | Résultat |
|---|---|---|---|
| Série | cover, poster, hero, title | 3/3 | ✅ `success` |
| Saison | + season_box | 4/4 | ✅ `success` |
| Épisode | episodic, video, subtitle | 2/2 | ✅ `success`, Video Action 201 |
| Unitaire | les 6 | 4/6 | ❌ refus partenaire sur le `.mxf` |

Le filtrage par niveau (`appliesTo`) est validé de bout en bout : chaque
niveau n'affiche que ses essences, et un optionnel absent donne `➖`.

### Reste ouvert
- **VOD Factory refuse le `.mxf`** — `must be one of : mp4, mov, ts, mpeg,
  mpg`. Le contrat tacite (transcodage à leur charge) n'est pas implémenté
  dans leur API. Point contractuel, hors code.
- **Pas de correspondance `Unitaire` dans la table `ContenuPrime`** du
  mapping VOD Factory — le partenaire répond « The selected type is
  invalid ». Série/Saison/Episode ont la leur.
- **Le manifeste n'est pas consulté dans le corps de boucle** : toute
  extension ajoutée à `reconnu_par` y restera sans effet. Leur attacher le
  manifeste ferait tourner la cardinalité sur un listing réduit à un seul
  fichier (port `miss`, lignes d'information) — à trancher avant de le faire.
- **Une republication ne repasse pas par la boucle** quand les fichiers sont
  déjà livrés : tout ce qui y est calculé (durée, infos techniques) manque
  au second passage. La clé est alors omise du corps, pas corrompue.
- **Bug d'affichage non reproduit** : « clic sur un nœud → API Ops s'ouvre,
  sorte de zoom, partie du canevas inatteignable ». Vérifié que le clic
  n'ouvre pas le volet, que le zoom ne change pas et que le cadre ne
  rétrécit pas. Mesuré en revanche : le volet fait 240px pour un contenu de
  1281px, et il SUPERPOSE le canevas — la bande basse est masquée tant qu'il
  est ouvert. Capture attendue.

---

## Captage de l'asset éditorial dans PUBLISH — 7 août

### Le trou, mesuré

Le Lookup de PUBLISH reçoit `search_results.objects[0]` — la **collection**.
Or 16 des 30 lignes de la correspondance « VOD Factory | Fields » décrivent
des champs de la vue **`VUE | PRIME | LIVRAISON`**, qui est une vue **Asset**.
Rejeu du vrai `lookup()` sur le contexte réel du run Unitaire du 6 août :

```
7 / 30 lignes remplies — dont 6 par le repli, pas par la source
```

`ContenuPrime` valait **∅ sur les 25 derniers runs** : la ligne tombait
toujours sur `{TypeCollection}`. Série/Saison/Épisode passaient par
coïncidence — la table de traduction mélange les deux vocabulaires
(`Série → serie` côtoie `Magazine → magazine`). `Unitaire` n'ayant pas de clé,
la valeur brute partait au partenaire → « The selected type is invalid ».

### Ce qui a été écarté par la mesure

- **Le snapshot de sync ne prouve rien** : il date du 28 juin ; `TypeCollection`,
  `ParentID`, `NumeroSaison` y sont absents alors qu'ils existent. Toujours
  interroger Iconik en direct pour l'existence d'un champ.
- **La recherche Iconik ignore `metadata_view_id`** — testé dans le corps de
  la requête ET en paramètre d'URL : 56 champs renvoyés dans les deux cas. Le
  scope par vue n'existe qu'à la **lecture**
  (`/API/metadata/v1/assets/{id}/views/{viewId}/` → 24 champs).
- **Le `BayardID` porté par l'asset de test est un résidu** de réutilisations,
  pas une donnée normale — cf. mémoire `project-bayardid-scope`.

### La forme retenue

Deux nœuds en tête de flux, aux rôles séparés — délibérément **pas** un seul
Search qui déverse :

```
Asset éditorial            iconik.search, mode « presence »
                           in_collection {collection.id} + ContenuPrime is_not_empty
                           → pose assetEditorial.id, n'expose AUCUNE métadonnée

Métadonnées de livraison   iconik.fetch, sous-type asset, par id
                           fetchMdViewId = VUE | PRIME | LIVRAISON
                           → expose les 24 champs sous leur nom de source
```

Câblage : `Get Collection ID → Asset éditorial`, puis `found → Métadonnées`,
`empty|error → Programme ?`. La branche `empty` n'est pas un rattrapage :
Série et Saison **n'ont pas** d'asset éditorial (vérifié en direct — 0
résultat), et le workflow doit continuer sans.

Le mode `presence` existait dans `iconikSearch()` depuis le portage mais
n'était pas offert au panneau : **ajouté à `config-schema.js`**. Sans lui, une
recherche à 1 résultat expose les 56 champs bruts de l'asset à plat, sous
leur nom nu — ce qui rendrait la vue purement décorative et écraserait des
variables déjà posées.

Aucune ligne de la correspondance modifiée, aucun code de Lookup touché : les
champs exposés à plat par le Fetch sont ramassés par l'étape `ctx.vars` du
handler existant.

### Résultat en conditions réelles (4 clics Custom Action, v18)

| | Statut | `type` | Asset éditorial | Lookup |
|---|---|---|---|---|
| Série | success | `serie` | `empty` | — |
| Saison | success | `season` | `empty` | — |
| Épisode | success | `episode` | found | **24/30** |
| Unitaire | success | `magazine` | found | **21/30** |

Unitaire complet, six essences vérifiées — en envoyant volontairement le
proxy `.mp4` au lieu de la haute résolution, ce qui isole le refus `.mxf`
comme obstacle purement contractuel.

## `resolveRef` — une référence sans accolades ne casse plus l'appel — 7 août

### Le bug, constaté en production

```
v16   Notify "Running" · targetId : "{collection_id}"   marchait
v18   Notify "Running" · targetId : "collection_id"     404 sur
                                                        /collections/collection_id/
```

La nature `variable` du panneau « affiche `{brut}`, stocke brut » : elle
**retire les accolades à l'enregistrement**. Correct pour un `resultVar` (un
nom qu'on *définit*), destructeur pour un `targetId` (une référence qu'on
*lit*), que `history` résout via `resolve()` — lequel ne substitue que les
`{…}`. **Ouvrir le nœud dans le panneau cassait sa cible.**

`lookup` n'en souffrait pas : il retire lui-même les accolades avant de
résoudre (`inputVar.replace(/^\{|\}$/g, '')`). Deux handlers, deux
conventions, un seul widget de panneau.

### Le correctif

`BuilderContext.resolveRef()` — on aligne tout le monde sur le comportement
tolérant qui marchait déjà, branché sur les sept champs de référence de
`history`, `iconik.action` (×2), `set_metadata` et `iconik.fetch` (×3) :

```
{collection.id} · {collection_id}   gabarit, substitué comme avant
collection_id · collection.id       nom nu, cherché dans le contexte
ABC-litteral-42                     introuvable → rendu tel quel (vrai id)
collection                          désigne un OBJET → refusé, pas de
                                    "[object Object]" dans une URL
```

Effet de bord bienvenu : la coquille `targetId: "collection.id"` sans
accolades (qui avait coûté un run Épisode le 6 août) n'est plus une erreur.

**Le vrai correctif reste à faire, à froid** : distinguer dans le schéma du
panneau « un nom que je définis » et « une référence que je lis ». `resolveRef`
neutralise le symptôme, il ne supprime pas la confusion de nature.

## Nœud Post-it — port de WFD — 7 août

`family: postit` existait dans WFD (`wfd-components.js:72`) et n'avait jamais
été porté. Dix fichiers, en portant à l'identique plutôt qu'en réinventant :
sept teintes, 200px, `color-mix`, aucun port, exclu des exports.

| Fichier | Rôle |
|---|---|
| `pivot-catalog-iconik.js` | Core `postit`, `ports: []`, drapeau `annotation` + `estAnnotation()` |
| `pivot-schema.js` | 13ᵉ core autorisé |
| `node-renderer.js` | Rendu dédié : ni en-tête, ni badge, ni ports |
| `workflow-canvas.css` | `.bd-postit` + natures `cfg-textarea` / `cfg-teintes` |
| `config-schema.js` | Seul schéma sans les champs communs (pas de « Name » redondant) |
| `config-renderer.js` | Deux natures : `texteLong`, `couleur` |
| `pivot-to-wfd.js` | Nœud WFD `family: postit`, `inputs: []` |
| `pivot-validate.js` | Exempté de l'`intent` obligatoire — un post-it EST son intention |
| `builder-executor.js` | Écarté des points d'entrée + no-op dans `runStep` |
| `workflow-canvas.js` | 📝 « Note / Post-it » dans la palette |

**Vrai bug trouvé au passage** : `_entriesOf()` prend pour points d'entrée les
étapes **sans arête entrante**. Un post-it n'en a aucune — il aurait donc été
exécuté et aurait levé « Aucun handler enregistré pour 'postit' ». C'est
arrivé pour de vrai sur un run Série, parce que le processus serveur n'avait
pas été redémarré après le correctif : **un correctif moteur non rechargé
n'est pas un correctif**.

Le volet API ops n'a rien demandé : il filtre déjà sur « produit au moins une
opération », et un post-it n'en produit aucune.

### Reste ouvert
- **`Programme ?` : le port `default` n'est relié à rien.** Une valeur de
  `TypeCollection` hors des quatre connues arrête le run **en silence**, après
  que « En cours » a été écrit. Le cas réaliste n'est pas le champ vide
  (dropdown en lecture seule écrit par les seuls workflows Créer) mais l'ajout
  d'un **cinquième niveau** au dropdown. Une arête à poser.
- **Nommage des quatre nœuds de vérification** : `Check Collection`,
  `Check Asset`, `Recheck` interrogent **S3** ; `Verify` interroge **VOD
  Factory**. Quatre noms de la même famille pour deux systèmes — ça a induit
  en erreur quelqu'un qui avait lu le code une heure plus tôt.
- **`Cardinalité non respectée`** en `info` sur les quatre niveaux : c'est le
  pré-contrôle S3 **initial**, qui ne peut rien trouver avant que la boucle
  n'ait uploadé. Inoffensif (le StatutPrime final affiche `Cover ✅` dans le
  même run), mais bruyant.
- **95 erreurs de validation** sur le document PUBLISH, post-its exclus : 26
  étapes sans `intent`, 29 identifiants au format WFD, 20 politiques d'erreur
  au niveau de l'étape. Le pivot a des règles que ce document, reconstruit
  depuis WFD plutôt qu'écrit dans le Builder, n'a jamais respectées. Rien ne
  bloque (la conversion passe), mais `intent` — le champ censé porter
  exactement ce qu'on a écrit dans les post-its — est vide partout.

## Espace de noms et lisibilité — mesures du 7 août

Discussion de conception ouverte par l'utilisateur. Les chiffres, pour ne pas
les redécouvrir :

| Mesure | Valeur |
|---|---|
| Variables présentes en fin de run (PUBLISH) | 59 |
| Déclarées par le document | 5 |
| **Apparues sans déclaration** | **46** |
| Racines produites / effectivement référencées | 47 / **8** |
| Nœuds lisant une variable non annoncée | **9 / 19** |

Taux de variables fantômes par workflow :

```
Créer Série     2 étapes   64 %      ← le plus déclaratif du dépôt
Créer Unitaire  2 étapes   56 %
Créer Saison    5 étapes   60 %
Créer Épisode   5 étapes   19 %      ← variables PRÉFIXÉES (search_results.<champ>)
PUBLISH v2     19 étapes   80 %      ← variables NUES
```

**Deux conclusions indépendantes** : le déclaratif réduit le nombre de nœuds
(Créer Série tient en 2 étapes grâce au gabarit), et **il ne ferme pas
l'espace de noms** — le workflow le plus déclaratif du dépôt a 64 % de
fantômes, parce que le gabarit déclare l'*arborescence*, pas les variables
qu'il produit.

Mécanisme : chaque handler écrit dans un espace global sous des **noms
calculés à l'exécution** — `setVar(ctx, fieldName, …)` (Search, l.80),
`setVar(ctx, k, …)` pour chaque clé produite (Lookup, l.226), idem Fetch,
Deliver, Create Tree.

**Ce qui a été explicitement écarté** : préfixer les noms
(`{search_results.TypeCollection}`). Traçable ne veut pas dire *à soi* —
`search_results` reste un tiroir fabriqué par le moteur. Le modèle retenu par
l'utilisateur est un **contrat d'entrée** : des tiroirs qu'il nomme lui-même,
remplis une fois depuis une source déclarée, et les 39 variables moteur
restantes **cachées** plutôt que renommées.

Vocabulaire arrêté avec lui :

> Un **tiroir** porte un nom que le Designer choisit. Sa source est l'une des
> lectures, prise en bloc quand c'est une vue, dépliable pour cibler un champ.
> Il est rempli une fois. Une boucle **parcourt** un tiroir, elle n'en crée pas.

Trois questions tranchées : un tiroir = une vue avec dépli pour cibler (le
widget existe déjà, `vuePour`) ; la correspondance garde des noms de source
(« voiture = bagnole, pas véhicule à quatre roues ») ; la portée dans une
boucle n'est pas un sujet, la boucle parcourt un tiroir déjà rempli.

### Reste ouvert
- **Le contrat d'entrée n'est pas construit** — seulement spécifié.
- **Recherches sauvegardées absentes du Builder** : WFD offre un `<select>`
  peuplé des saved searches réelles ; le Builder n'a qu'un champ texte où
  taper un ID, et `config-sources.js` n'a aucune source pour ça. **Ce sont les
  recherches APS qu'il faut lister, pas celles d'Iconik** : une saved search
  Iconik n'exprime que `value`/`value_in` sous un unique `AND`, là où le nœud
  connaît quinze opérateurs, l'AND/OR par critère et les blocs chaînés. Et la
  config d'une recherche APS (`limit · blocks · expression · returnBlock`) est
  **exactement** celle du nœud — chargement = collage, zéro conversion.
  `ApsSearch` n'a en revanche ni `orgId` ni notion de plateforme.
- **Page Recherche à remonter d'un cran** — aujourd'hui dans
  `platforms/iconik/search/`, couplée à Iconik par trois points seulement
  (transport `/api/iconik`, liste de champs, dialecte de requête) ; tout le
  reste est agnostique. Destinée à du sémantique / langage naturel. À trancher :
  outil (accueil) vs ressource (écran d'édition + onglet Builder) — sans doute
  les deux, avec un composant de critères unique partagé.
- **STATUSES rejoue le motif Momentum** : `timer` + recherche sur
  `StatutPublication = "Posté"`, et le workflow écrit ce même champ. Or le
  moteur ne connaît que `manual` et `custom_action` (**aucune minuterie**) et
  `startRun` **ne sérialise rien**. Les deux moitiés de la protection
  manquent : la minuterie ET la barrière de ré-entrance.
