# Journal APS — 2026-08-05

> Session pivot : partie d'un cadrage des panneaux Logs/Run pour finir sur
> la construction complète d'un **moteur d'exécution natif pour le
> Builder** — décision de l'utilisateur en tout début de session, plus
> grosse que la question posée au départ. Les 12 Cores + 11 Facades du
> catalogue pivot sont tous câblés (`server/engine-builder/`), et le
> moteur a été vérifié en le faisant tourner sur le **vrai** workflow
> PUBLISH (VOD Factory) côte à côte avec WFD, sur une vraie collection QA,
> avec de vrais appels Iconik/S3/API partenaire — équivalence exacte sur
> les 14 étapes. Deux bugs réels trouvés et corrigés dans le document
> PUBLISH au passage. Commité et poussé sur `main` en fin de session.
> État technique complet → `builder-etat.md`, section "Moteur d'exécution
> natif".

## Fil de la session

### Reprise : cadrage des panneaux Logs/Run, puis pivot
La session a repris sur la priorité laissée le 4 août : cadrer le
périmètre des panneaux Logs/Run du canevas. En creusant l'état existant
(tabs RUN/JOBS/LOGS déjà présents mais vides, mécanisme SSE/historique de
WFD déjà mature et réutilisable), la première option proposée était de
lier ces panneaux en lecture seule à l'historique réel de WFD (aucune
nouvelle capacité d'exécution, juste de la visibilité). Refusée par
l'utilisateur : même en lecture seule, s'appuyer sur le moteur WFD recrée
la dépendance qu'il veut éviter — position déjà actée le 3 août, étendue
ici de "ne pas exécuter via WFD" à "ne pas non plus lire ses données".

Retour critique au passage sur le vieux panel Run/Jobs de WFD, à garder
pour la conception future : le tab Jobs est le bon modèle, le tab Assets
n'a jamais été alimenté pour de vrai, le tab Action montre trop de choses
(devrait se limiter aux actions du nœud précis), et tout texte affiché
doit être copiable-collable, sans exception.

Face à ce blocage, l'utilisateur a tranché plus large : plutôt que de
contourner le problème, s'attaquer directement à la construction d'un
moteur d'exécution propre au Builder, maintenant — "je ne veux pas
investir du temps en bossant sur un moteur qui disparaîtra. Pour le
moment on a pas validé le moindre workflow dans le builder donc c'est le
moment ou jamais."

### Plan validé avant construction
Exploration complète de l'exécuteur WFD (`wfd-engine-executor.js`,
`wfd-engine-context.js`, `wfd-engine-handlers.js`) et du format pivot
(`pivot-catalog-iconik.js`, `pivot-to-wfd.js`) pour établir un plan
d'architecture, soumis et approuvé avant toute ligne de code. Décisions
actées à ce stade :
- Réutiliser/adapter la logique d'appel Iconik de WFD (pas la réécrire à
  neuf), sans aucune dépendance runtime aux fichiers `wfd-engine*.js`.
- Couverture large dès la v1 (12 Cores + 11 Facades), construite dans un
  ordre qui fait apparaître le risque tôt.
- Déclenchement manuel + webhook Custom Action dès la v1.
- Historique de runs en tables Postgres neuves (`BuilderRun`/
  `BuilderRunEvent`), pas un fichier JSON comme WFD.
- Webhook : toujours la dernière version publiée, jamais le brouillon.
- Chaque événement de run stocke un snapshot complet du contexte (pas un
  résumé) — décision liée directement à la critique du vieux panel Debug
  de WFD ("ne stockait pas toutes les infos possibles").

### Construction — dix étapes, dans l'ordre du plan
1. **Squelette** — contexte, exécuteur, registry de handlers, persistance.
   Bug trouvé et corrigé pendant le premier test : le step trigger passait
   par le dispatch générique de handler au lieu d'être court-circuité
   (le contexte est déjà initialisé avant le parcours). Testé avec un
   pivot jetable (`trigger → set_variable → set_variable`).
2. **Tranche Iconik search/fetch/decision** — testée avec un vrai appel de
   recherche contre l'environnement `DEV | BAYARD`.
3. **Trigger manuel + route HTTP** — `POST /api/builder-engine/trigger/
   :flowId`, testé bout en bout en HTTP réel.
4. **Boucles + pile de scope** — corrige un bug réel de WFD porté en même
   temps que découvert : une boucle imbriquée réutilisant le nom de
   variable d'une boucle englobante écrasait silencieusement sa valeur
   sans jamais la restaurer. Testé avec deux boucles imbriquées partageant
   le même `loopVar`.
5. **Résolveur + cores dépendant de ressources** (Lookup/Verify/Deliver/
   History/HTTP Sequence) — résolution en bloc de
   Mapping/Manifest/Endpoint/ArboTemplate/Connexion au démarrage du run,
   récursive dans les corps de boucle. `Endpoint`/`create_tree` et
   `aps.registry` construits au passage (dépendance de `http_sequence`).
6. **Facades restantes** — `iconik.action` (les 41 `actionType` du
   dispatcher WFD, le panneau les expose tous), `iconik.set_metadata`,
   `iconik.resolve_ancestors`.
7. **Cores purs restants** — `wait`, `transform` (seulement la branche
   "opération unique", la composition `rules[]` appartient à l'ancien
   Transformer designer, pas au pivot).
8. **Webhook Custom Action** — `POST /api/builder-engine/action/:slug`,
   recherche cross-org (Iconik n'a aucune notion d'org APS), toujours la
   dernière version publiée (409 sinon), fan-out par asset ou run unique
   par collection selon le contexte — testé en HTTP réel (409 avant
   publication, dispatch correct après, fan-out vérifié sur 2 asset_ids).
9. **Politique `workflow.onError` + garde-fou cores non implémentés** —
   `stop`/`continue_log`/`continue`, routage vers le port `error` si
   déclaré ; `qc`/`script`/`delay`/`approval`/`call_workflow` lèvent une
   erreur explicite plutôt qu'un no-op muet. Testé.
10. **Vérification contre PUBLISH réel** — cf. section dédiée ci-dessous.

Bug trouvé en cours de route (avant toute exécution) : `workflow.environment`
stocke l'**ID** d'un Environment, pas son nom — le premier essai de
résolveur cherchait par nom. Corrigé après vérification directe sur le
document réel de PUBLISH et sur le code du canevas
(`workflow-canvas.js:913`, `o.value = e.id`) — le commentaire d'un fichier
existant (`pivot-io.js`) ne précisait pas le format et avait fait deviner
le mauvais.

### Vérification — `scripts/preuve-execution.js` contre PUBLISH réel
Nouveau script, pendant de `scripts/preuve-conversion.js` mais pour
l'exécution plutôt que la conversion seule : charge un document pivot,
l'exécute une fois via WFD (`pivot-to-wfd.js` + `WfdExecutor.executeFlux`
en mémoire, sans toucher aux tables `Flow`/`Run`) et une fois via le
moteur natif, puis compare.

Lancé contre le vrai `BAYARD | PUBLISH | VODFACTORY`, sur une vraie
collection QA fournie par l'utilisateur (Star Trek,
`db96828e-7f91-11f1-8269-2ae267fc2477`, environnement `QA | ASKIDA`), avec
de vrais appels Iconik/S3/API partenaire (VOD Factory **preprod**, jamais
prod — vérifié avant de lancer quoi que ce soit).

Deux allers-retours : le premier run s'arrêtait tôt, **identiquement des
deux côtés**, à cause de références de variable sans accolades dans le
document PUBLISH lui-même (`targetId: "collection_id"` au lieu de
`"{collection_id}"`, etc. — 5 occurrences, dont une corrigée par forte
inférence contextuelle) ; corrigées avec l'accord explicite de
l'utilisateur. Le deuxième run s'arrêtait de nouveau, toujours
identiquement, à cause d'arêtes de décision utilisant un encodage de port
numérique obsolète (`out-0`..`out-3`) au lieu du libellé attendu
(`Série`/`Saison`/...) — corrigé de la même façon. Le troisième run a
produit une **équivalence exacte sur les 14 étapes** de PUBLISH, port par
port, variable par variable, y compris la séquence HTTP réelle vers le
partenaire (avec sa logique de retry POST→PUT sur 422) et un vrai rejet
422 du partenaire identique des deux côtés.

Deux imperfections supplémentaires trouvées dans PUBLISH mais **non
corrigées** (hors accord explicite, contrairement aux deux précédentes) :
un critère de recherche mal formé (`field:"_"` au lieu de
`"__collection__"`, opérateur `in_collection` jamais reconnu) et un
chemin de boucle qui ne résout jamais vers un tableau — documentées dans
`builder-etat.md` pour une prochaine session.

Effet de bord réel resté en base : une ligne d'historique supplémentaire
sur le champ `StatutPrime` de la collection de test (informatif, jamais
nettoyé). Aucun enregistrement créé côté partenaire (rejeté par une vraie
validation métier les deux fois).

## Incident d'infrastructure — drift Prisma pré-existant
En migrant les nouvelles tables (`BuilderRun`/`BuilderRunEvent`),
`prisma db push` a signalé un drift : la table `ApsCounter` existe en
production mais n'a jamais eu de modèle Prisma déclaré —
`--accept-data-loss` l'aurait supprimée (4 lignes réelles). Contournement :
tables créées via SQL brut (`psql`), `prisma generate` relancé séparément
(codegen pur, sans toucher à la base). Sans rapport avec ce chantier — pas
corrigé, juste contourné proprement. Le compteur atomique du nouveau
moteur recrée cette même table à la volée (`CREATE TABLE IF NOT EXISTS`),
exactement comme le fait déjà WFD.

## Reste ouvert, par priorité pour la suite
1. **Reconstruire les autres workflows** — Créer Série/Saison/Episode/
   Unitaire — peuvent maintenant être réellement exécutés et validés via
   le nouveau moteur, pas seulement dessinés.
2. **Panneaux Logs/Run** — débloqués (de vraies données existent), mais le
   périmètre UI reste à cadrer. Contraintes déjà actées : modèle Jobs,
   pas Assets/Action tels quels, tout texte copiable.
3. **Webhook jamais essayé depuis une vraie Custom Action Iconik cliquée**
   — seulement avec un payload construit à la main.
4. Les deux imperfections de PUBLISH non corrigées (critère de recherche,
   chemin de boucle) — cf. `builder-etat.md`.
5. `Nommage` — route existante, jamais auditée ni éditée (reste ouvert
   depuis le 3 août).
6. Mark in/out des segments (`time_start`/`time_end`) — jamais vérifié.
7. Famille média (Transcode…) — non conçue.

**Tout commité et poussé sur `main` en fin de session** (commit
`b292de1`, voir `git log`).
