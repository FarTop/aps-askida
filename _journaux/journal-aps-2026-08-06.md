# Journal APS — 2026-08-06

> Session de suite directe du 5 août : le panneau Run/Debug construit la
> veille a été testé par l'utilisateur sur un vrai run PUBLISH v2
> (webhook Iconik réel) et rejeté à l'usage — refonte complète en
> inspecteur à 3 onglets (Assets/Action/Debug), deux bugs d'auto-save
> corrigés au passage, puis trois tentatives successives pour retrouver
> l'animation de badges flottants de WFD sur le canevas (deux rejetées,
> la troisième — un vrai port du code WFD, pas une réinvention —
> acceptée et confirmée en conditions réelles par l'utilisateur). Session
> fermée sur deux améliorations UX plus légères : noms de collection
> résolus en direct depuis Iconik, et deux nouveaux points d'entrée pour
> ouvrir le corps d'un Loop. État technique complet → `builder-etat.md`,
> sections "Panneau Run refondu", "Badges de job flottants", "Noms
> Iconik résolus...".

## Fil de la session

### Reprise : le panneau Run de la veille ne tient pas à l'usage

Premier retour de la session, après un test réel sur PUBLISH v2 côté
utilisateur : "le nœud clignote mais rien n'indique combien de passages
ont eu lieu", et l'onglet Debug construit le 5 août "n'est qu'un extrait
de Logs... répétitif, sans valeur ajoutée". Plutôt que de corriger à la
marge, refonte actée avec l'utilisateur : un seul panneau Run, 3 onglets
au rôle strictement séparé (Assets = quels assets/combien, Action = ce
que CE nœud a produit et rien d'autre, Debug = verbeux par nature). Le
formulaire de déclenchement manuel migre dans Jobs, replié — Jobs
déclenche ET liste, Run n'inspecte.

Construit avec deux choix techniques qui évitent de recopier le vieux
panel WFD plutôt que de le corriger : Assets résout l'identité d'un
passage via la variable de boucle du document (générique, pas codé en
dur pour PUBLISH) ; Action fait un DIFF générique entre le `ctxSnapshot`
avant/après un nœud au lieu d'un switch par famille de nœud comme WFD —
possible parce que `ctxSnapshot` s'est avéré être un clone complet à
chaque événement, pas une référence partagée.

Un vrai bug de double-comptage trouvé et corrigé pendant la vérification
(une erreur non-fatale émet deux événements terminaux pour la même
itération, comptés une fois de trop dans une première version).

### Deux bugs "ça se vide tout seul", tous deux liés à `aps:flow-ready`

Deux rapports distincts de l'utilisateur, en apparence différents, à la
même racine :

1. "Ça marche puis ça disparaît au bout d'une minute environ." Retracé en
   ajoutant du traçage console réel dans le code (pas en devinant depuis
   des captures d'écran) : `aps:flow-ready` se redéclenche après CHAQUE
   sauvegarde, y compris l'auto-save silencieux sur n'importe quelle
   édition — trois modules réinitialisaient tout leur état à chaque
   réception de cet événement, pas seulement sur un vrai changement de
   flow. Corrigé dans les trois.
2. "Run est vide si je clique un nœud sans être passé par Jobs d'abord."
   Un flow dont tous les runs sont déjà terminés au chargement de la page
   n'était jamais auto-suivi (seul un run flambant neuf détecté en cours
   de session déclenchait un suivi automatique). Corrigé : premier
   chargement de Jobs → auto-suit le run le plus récent, quel que soit
   son statut.

### Badges flottants — trois passes, la bonne étant de ne pas improviser

Le décompte sur l'onglet Assets ne suffisait pas : "toujours pas de
badges flottants sur les nœuds pendant le run." Première tentative
construite en CSS pur (pseudo-élément `::after`, badge en surplomb
au-dessus du nœud) — invisible sur la plupart des nœuds réels, un ancêtre
du canevas (`.cnv-frame`) coupait le surplomb pour tout nœud de la
première rangée. Diagnostiqué en scannant les pixels d'une vraie capture
d'écran plutôt qu'en zoomant le canevas en direct (le zoom manuel du
canevas, recalculé à la main, a produit plusieurs captures trompeuses
avant cette méthode plus fiable).

Corrigé (badge inséré à l'intérieur du nœud plutôt qu'en surplomb),
re-vérifié pixel par pixel — puis rejeté quand même : "Tu improvises
encore. Ça marchait dans WFD. Cette idée ne me plaît pas. Je préfère que
tu la retires." Retiré intégralement, pas juste corrigé.

Troisième passe, sur consigne explicite : "comment on peut avoir la même
animation que WFD... pas d'invention." Cette fois le vrai code de WFD lu
avant d'écrire quoi que ce soit — nouveau fichier `wf-run-badges.js`, un
vrai élément flottant (pas un pseudo-élément CSS), même cycle de vie et
mêmes durées d'animation que WFD, positionné via le vrai mécanisme de
pan/zoom de ce canevas plutôt que celui de WFD. Deux bugs réels trouvés
en vérifiant (un tick de sondage synchrone vide qui consommait le
garde-fou "ne pas rejouer l'historique", et un vrai trou révélé par une
question de l'utilisateur — "si je fais un run de test sans Iconik, je
suis censé voir les badges ?" — un run auto-déclenché pouvait échouer
plus vite que le premier sondage, traité à tort comme "rejoint après
coup"). Confirmé en conditions réelles par l'utilisateur lui-même.

### Pour finir : deux améliorations UX plus légères

Noms de collection résolus en direct depuis Iconik dans Assets (au lieu
de l'id brut) — via le proxy déjà utilisé ailleurs dans l'app, pas un
nouveau mécanisme. Et deux points d'entrée supplémentaires pour ouvrir le
corps d'un Loop ("trop abstrait" selon l'utilisateur) : le badge "N
steps" est cliquable, et "Open loop body" apparaît au clic droit —
recommandation actée de garder la navigation de portée existante plutôt
que construire un rendu imbriqué ou une fenêtre, seulement rendre l'accès
plus direct.

### Fermeture de session

Tout vérifié sur des runs/flows jetables (créés/exercés/supprimés via
l'API, zéro appel Iconik/S3 réel dans les tests de mécanique), sauf
confirmation finale des badges par l'utilisateur en conditions réelles.
`node --check` systématique sur chaque fichier touché. `git status`
propre avant chaque étape de nettoyage. Commité et poussé sur `main` en
fin de session — état complet dans `builder-etat.md`.

---

# Journal APS — 2026-08-06 (après-midi et soir)

> Longue session sur PUBLISH v2, menée par l'utilisateur à coups de vrais
> déclenchements Custom Action Iconik. Partie d'un « les badges ne
> s'affichent pas », elle a fini par déboucher sur la **première
> publication réussie de bout en bout** (Partner 201, Verify 3/3, History
> ✅ Succès) — après avoir remonté une chaîne de cinq causes empilées, dont
> aucune n'était celle qu'on croyait. Puis refonte complète de l'onglet
> Run › Action en « ce que le nœud a FAIT », et port du volet API ops de
> WFD. État technique complet → `builder-etat.md`.

## Fil de la session

### Cinq causes empilées, et autant de fausses pistes

Le symptôme affiché était « Verify échoue en 404, on n'arrive pas à
joindre VOD Factory ». Faux à chaque étage — et il a fallu, à chaque fois,
aller chercher la donnée réelle plutôt que raisonner sur le code :

Un **port inversé** sur la Search précédant la boucle (`found` contournait
l'export, `empty` y entrait) — repéré par l'utilisateur au canevas, confirmé
sur les événements en base. Puis **quatre arêtes dupliquées**, invisibles
parce que superposées à l'écran, qui faisaient tourner toute la branche
aval deux fois : c'était l'explication des « 4 jobs OK et 4 en failed »
côté Iconik. Puis un **chemin S3 qui ne correspondait pas au bucket** — et
là je me suis trompé une première fois en recopiant la casse du message
d'erreur d'Iconik ; la capture du bucket par l'utilisateur a tranché.

Puis le vrai blocage : **le payload partait sans titre**. La règle existait
pourtant dans la correspondance. Son repli pointait sur une variable
`{collectionCheck.title}` qui n'existe dans aucun workflow de la base —
vestige d'une version antérieure. Enfin, ce refus (`422 — The title field
is required.`) était **masqué par l'upsert**, qui écrasait le résultat du
POST par celui du PUT : on ne lisait que la conséquence (404 « Content not
found »), jamais la cause. C'est ce dernier point qui rendait le
diagnostic impossible depuis l'interface — corrigé avant tout le reste.

### « Ça ne s'explique pas » — deux fois, et deux vrais bugs derrière

À deux reprises l'utilisateur a rejeté mon explication (« ça n'explique
pas, je regardais l'interface pendant le job »), et à deux reprises il
avait raison :

- La notification « En cours » ne s'inscrivait pas : `GET
  /API/metadata/v1/...` renvoie un dict **plat**, pas la forme
  `metadata_values` supposée par le moteur. La relecture était donc
  **toujours vide** — History n'a jamais pu accumuler son historique ni
  retrouver la ligne de son propre run.
- Le nœud « Set Metadata (URLs) » ne écrivait rien : il tournait bien,
  mais **placé trop tôt**, avant que la boucle n'ait uploadé quoi que ce
  soit. Prouvé sur les snapshots (aucune variable `s3_*` à cet instant,
  les quatre présentes après la boucle), puis déplacé.

Leçon consignée : quand l'utilisateur dit « ça ne colle pas », arrêter
d'argumenter et aller chercher la mesure.

### Sémantique : ce que le système DIT vs ce qu'il a fait

Trois incohérences signalées, toutes réelles. La checklist artworks
affichait des ✅ tirés du listing S3 pendant que le statut global disait
❌ — or S3 n'est qu'un pré-contrôle technique, *« la vérif VOD Factory est
celle qui importe à l'utilisateur »*. Un essence *optionnel* absent
s'affichait en échec comme un requis. Et surtout : **une publication
parfaitement réussie ne pouvait jamais être rapportée `success`**, parce
que le pré-contrôle S3 initial — qui ne PEUT pas trouver les fichiers
avant leur upload — inscrivait une erreur définitive. D'où une sévérité
`info`, consignée mais exclue du verdict.

### « Un opérateur ne s'en sortira jamais avec cette UX »

Reproche répété, et fondé : pour comprendre un échec il fallait déplier un
JSON. Refonte de Run › Action sur le modèle de l'ancien panneau WFD —
résumé lisible d'abord, brut derrière un dépliant. La demande a été
explicitement élargie : *« il faut que ce soit élargi partout »* — ma
première passe ne couvrait que 8 familles sur 23.

Deux instrumentations du moteur ont été nécessaires, parce que le résultat
final ne permet pas de reconstituer le déroulé après coup : le Lookup
trace chaque règle (origine, valeur résolue, traduction, motif d'échec), et
la séquence HTTP trace chaque sous-étape — `http_request` ne conservait
que la réponse, jamais le corps envoyé. Vérifié que le mapping produit
reste identique au bit près en rejouant le vrai Lookup sur le contexte
réel d'un run.

### Fermeture : API ops

Dernière demande avant absence : récupérer le tiroir API Ops de WFD, « la
même chose, les mêmes données ». Port fidèle — trois sections, trois
exports — avec trois écarts assumés et documentés (rendu en classes CSS et
non en `innerHTML` avec styles en ligne, ressources via les routes REST,
et le corps des boucles inséré dans l'ordre topologique, sans quoi la
liste des appels serait fausse).

## Méthode

Tout vérifié en conditions réelles : événements et snapshots relus en
base, réponses Iconik interrogées en direct via le proxy, canevas piloté
dans le navigateur. Les vérifications d'affichage impossibles à obtenir
autrement (traces absentes des runs antérieurs) ont utilisé des runs
jetables injectés puis supprimés — jamais un appel Iconik ou S3 réel.
`node --check` sur chaque fichier touché ; `git status` propre à chaque
étape. Quatorze commits poussés sur `main`.
