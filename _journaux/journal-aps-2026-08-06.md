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
