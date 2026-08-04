# Journal APS — 2026-08-04

> Session très dense, dans la continuité directe du 3 août : fin de la
> reconstruction de PUBLISH nœud par nœud dans le Builder (Endpoints,
> Transform, corps de boucle, technique vidéo, Verify/History pilotés
> depuis le Manifeste), puis import/export JSON + badge Draft/Published +
> compteur d'usage sur les 5 onglets du Workflow Builder. État technique
> complet, section par section → `builder-etat.md`. Prochaine session :
> reconstruire les autres workflows (Créer Série/Saison/Episode/Unitaire) et
> développer les panneaux Logs/Run pour déboguer pendant les tests.

## Fil de la session

### 4ème ressource d'org : `Endpoint` (Endpoints)
Étape 12 (nœud "Partner", façade `vodfactory.partner`) avait le même
profil que Lookup avant Mapping ou Deliver avant Manifest : un tableau
`steps` inline de ~10 champs conditionnels × 7 étapes réelles, avec un bug
réel trouvé au passage (`ignoreCodes`/`feIgnoreCodes` en texte libre, jamais
splittés par le moteur — crash garanti en mode foreach). Nouvelle ressource
`Endpoint` (modèle Prisma, écran `admin/endpoints/`, 5ème onglet du
Workflow Builder), le nœud Partner ne porte plus que `connexionId` +
`sequenceId`. Les 7 vraies étapes de la Publication API (5 foreach
Persons + 2 simple Contents/Video Action) retrouvées dans l'export WFD et
saisies telles quelles dans `BAYARD | ENDPOINTS | VODFACTORY`.

### Core `transform` réécrit
Bug trouvé le 3 août, tranché et corrigé le 4 : le panneau ne correspondait
à AUCUN champ lu par le handler réel — `target`, le seul champ qui décide
si quoi que ce soit est stocké, était absent. Panneau reconstruit sur la
branche "opération unique" du handler (upper/lower/trim/replace/slice/
pad_start/truncate/separator_join/expression + `target`), l'autre branche
(`rules[]`, composition) appartenant à l'ancien "Transformer designer" du
WFD Designer, un outil séparé.

### Technique vidéo (durée/résolution) — gap trouvé sur Search, rebouché
Question de l'utilisateur : la résolution SD/HD/UHD (calculée depuis
width/height, Iconik ne donne que ça) et la durée (en secondes, convertie
depuis des millisecondes) sont-elles toujours résolues ? Oui côté moteur,
mais le nœud Search — celui qui porte réellement `withFormats` en
production, pas Fetch — n'avait pas ce champ dans le Builder. Ajouté au
panneau Search + au catalogue de variables (14 champs techniques,
conditionnés à la case cochée).

### Corps structuré du Loop — et un vrai bug de collision de port
À la demande de l'utilisateur ("attaquons le corps structuré de la Loop"),
Check Asset/Action/Wait/Recheck déplacés dans le vrai corps imbriqué du
Loop (jusque-là posés à plat, reliquat d'avant l'éditeur de corps de boucle
construit le matin même). Lookup/Partner/Verify/Set Metadata/History
restent hors de la boucle — republication toujours nécessaire même si les
fichiers sont déjà livrés (clarification métier de l'utilisateur).

En testant la conversion avant de sauvegarder : `Loop` n'avait qu'un seul
port pivot (`out`), donc l'entrée du corps (codée en dur `fromPort: 0`) et
la sortie "après boucle" résolvaient toutes les deux vers l'index WFD 0 —
collision jamais détectée avant (aucun flow n'avait encore eu un vrai corps
de boucle ET une arête de sortie en même temps). Le vrai moteur distingue
port 0 (chaque élément) / port 1 (terminé), en dur
(`wfd-engine-executor.js`) — corrigé dans `pivot-catalog-iconik.js`.

Un nœud Fetch "Video Info" ajouté en tête du corps (`{item.id}`, case
technique cochée) plutôt qu'une branche dupliquée par type d'asset comme le
faisait WFD (Artwork loop → Video search → Video loop) — même choix de
conception que le Manifeste pour Deliver.

**Bug d'affichage trouvé et corrigé en même temps** : entrer dans un corps
de boucle gardait le pan hérité de la portée précédente au lieu de
recentrer sur le nouvel espace de coordonnées — le contenu était bien là,
juste hors champ. `_centrerSurContenu()` ajoutée, déclenchée seulement à
l'entrée (pas à la sortie, pour ne pas perturber la vue du canevas racine).

### Verify et History pilotés depuis le Manifeste
Décision actée en fin de journée précédente, exécutée aujourd'hui : Verify
et History n'ont plus de liste de checks/message figée dupliquée 4× par
niveau — les deux se pilotent depuis le même `Manifest.essences[]` que
Deliver, chaque essence portant ce qui la concerne (`verifyEndpoint`/
`verifyPath` pour Verify, `role`/`sortie` pour History, déjà `sortie`/
`cardinalite` pour Deliver). Le filtrage par niveau (`appliesTo` vs
`TypeCollection`) se fait à l'exécution dans le handler, comme pour
`aws_s3()` — la conversion pivot→WFD ne sait pas encore quel niveau
tournera. Testé isolément avant tout câblage réel : les comptes de checks/
essences par niveau reproduisent exactement les 4 Vérificateurs et 8 nœuds
History réels (Episode 2 checks, Série 3, Saison 4, Unitaire 6).

Avec Deliver (3 août) + Verify + History (4 août), PUBLISH n'a plus aucune
duplication par niveau dans le Builder.

### Import/Export JSON + badge Draft/Published + compteur d'usage
Dernier chantier de la session, sur les 5 onglets du Workflow Builder.
Design du compteur d'usage tranché avec l'utilisateur avant de coder : pas
de liste dépliée (risque de bruit visuel), un compteur discret dans le
même style que les compteurs déjà existants, absent si 0, détail au
survol. `GET /builder-flows` expose désormais `status`/`publishedVersion`
en liste (pas seulement au détail) ; nouvelle route `GET /builder-flows/
usage` (un seul scan récursif de tous les BuilderFlow, y compris dans les
corps de boucle). Export = téléchargement du GET complet ; import = POST
vers la même API que "Nouveau X", crée toujours une nouvelle ressource
(jamais d'écrasement par id). Testé un vrai cycle export→import complet.

## Incident d'infrastructure — process serveur externe

Découvert (et déjà noté le 3 août, reconfirmé aujourd'hui) : le serveur sur
le port 3000 n'est pas géré par `npm run dev`/nodemon dans cette session —
c'est un process `node server/index.js` externe, tenu vivant par un
superviseur qui le relance automatiquement dès qu'il est tué. Un simple
rechargement de page ne suffit donc jamais à voir un changement de code
serveur : il faut tuer le process (`kill <pid>`, trouvé via
`lsof -i :3000`) pour qu'il redémarre avec le code à jour. Rencontré
plusieurs fois aujourd'hui (routes Endpoints, `/builder-flows/usage`).

## Reste ouvert, par priorité pour la suite

1. **Reconstruire les autres workflows** — Créer Série, Créer Saison, Créer
   Episode, Créer Unitaire (les 4 workflows `BAYARD | CREER | COLLECTION |
   *` existants dans WFD, pas encore audités/reconstruits dans le Builder).
2. **Panneaux Logs et Run** — développer pour avoir des infos en direct
   pendant les tests (débogage). Périmètre exact à cadrer en début de
   session : à quoi ils se branchent (WFD Engine SSE ? un run simulé côté
   Builder ?) n'a pas encore été discuté.
3. `Nommage` — route existante, jamais auditée ni éditée (reste ouvert
   depuis le 3 août).
4. Mark in/out des segments (`time_start`/`time_end`) — jamais vérifié.
5. Famille média (Transcode…) — non conçue.

**Tout commité et poussé sur `main` en fin de session** (voir `git log`).
