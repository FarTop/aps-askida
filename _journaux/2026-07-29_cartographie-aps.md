# Cartographie APS — 2026-07-29

> État technique après la session Administration + socle moteur VodFactory.
> Récit → `journal-aps-2026-07-29` ; processus → `methode-travail-aps`.

## Administration — « org au sommet » (fondateur bouclé)
- `server/lib/org-context.js` : `getOrgContext(req, prisma)` (X-Org-Id/query/
  cookie `aps-org-id`, sinon repli `findFirst`). Rôles non filtrés
  `['superadmin','admin']`. Pas d'auth → superadmin implicite → WFD inchangé.
- `server/routes/context.js` (`/api`) : `GET /api/organisations` (org +
  plateformes + environnements + connexions + ressources, jamais de secret),
  `GET /api/context`.
- Sélecteur : `_shared/js/org-context-selector.js` + `.css` (cookie + reload).
- Écrans admin : `admin/organisations/` (org au sommet, patrimoine complet),
  `admin/ressources/` (Correspondances/Nommages/Contacts), + Plateformes/
  Connexions/Environnements existants. Cartes sur l'accueil.

### Connexion → Organisation (décision A, Temps 1+2 faits)
- `Connexion.orgId String?` (nullable, transition) + relation ; `envId` CONSERVÉ.
- Migration `20260729_connexion_orgid` : colonne + FK + backfill déterministe
  (`orgId = Environment.orgId`). Appliquée.
- `connexions.js` : GET filtre par orgId (contexte, repli), POST renseigne
  orgId+envId. `fmt()` n'expose ni envId ni orgId → WFD invisible.
- **Temps 3 (retrait envId + `@@unique([orgId,name])`) = session dédiée future.**

## VodFactory — socle moteur natif (serveur, INDÉPENDANT de WFD)

> ⚠️ APS fait du **pilotage API pur** — aucune manipulation d'octets. Voir
> methode, garde-fou #1.

- `server/public/builders/workflow/pivot-manifest.js` : structure du manifeste
  (essences : role, reconnu_par, cardinalite, sortie ; niveau). CARDINALITES =
  exactement_un/au_moins_un/optionnel/au_plus_n. `valider`, `resumer`.
- `server/public/builders/workflow/pivot-packager.js` : `assembler(manifeste,
  fichiers)` → {ok, package, sorties, violations} ; `resumer`. Requirable
  serveur ET client.
- `server/lib/s3-service.js` : SDK `@aws-sdk/client-s3` (dépendance npm ajoutée).
  `deposer` (conservé pour plateforme future, INUTILISÉ dans le flux Iconik) /
  `lister` (pilotage/vérif, + futur navigateur buckets) / `tete`.
- `server/lib/package-executor.js` : `verifierParListing(manifeste, connexionS3,
  prefixe)` — liste S3, reconstruit les essences depuis les clés, cardinalité sur
  le RÉEL constaté. **Ne dépose plus d'octets.**
- `server/lib/iconik-service.js` : client HTTP Iconik autonome (App-ID/Auth-Token,
  credentials env déchiffrés), `collecterEssences(env, collectionId, {recursif})`
  navigue collection→assets→files.
- `server/routes/package.js` (`/api/package`) : `/verifier` (logique pure),
  `/verifier-s3` (constat listing), `/depuis-collection` (aperçu Iconik),
  `/livrer` (constat livraison S3). Tous sécurisés par org du contexte.

### Ce qui reste (paradigme VodFactory)
- **Écran de composition du manifeste** (ressource d'org, comme les mappings).
- **Nœud Deliver** dans le Builder : déclenche l'export location Iconik +
  appelle `/verifier-s3` pour valider la cardinalité.
- **Analyse fine PUBLISH V2** (76 nœuds → ~10) : session fraîche, coûteuse.
- **ID lisible** (Transform timestamp+aléa) + relation via **BayardRegistry**.

## Étalon & déclenchement (config 29/07)
- 6 flux : CREER SERIE(2)/SAISON(5)/UNITAIRE(2)/EPISODE(5), **PUBLISH V2 (76)**,
  STATUSES (11). PUBLISH V2 : 17 aps_search, 9 update_meta, 8 history, 7 decision,
  6× (action/loop/wait_for/aws_s3), 4 checker, 1 http_sequence (7 appels : 5
  persons + contents + videos), 1 id_generator.
- Déclenchement : custom actions Iconik niveau **COLLECTION** (clic droit).

## Env ids (référence)
- QA | ASKIDA : `cmqp7dk000002p8u50on1l3e7` (defaut)
- PROD | BAYARD : `cmqs2c1hz0001avu5d4yfbxmq`
- DEV | BAYARD : `cmqs2heut0002avu55uxb1f89`
- Org Groupe Bayard : `cmqp7djxm0000p8u5esvy4zy6`
- Collection test QA : `db96828e-7f91-11f1-8269-2ae267fc2477` (4 images)

## Épistémologie (oriente le futur API Builder)
Iconik = base d'acquis mais NE PEUT prouver la généralité (biais de l'acquis :
sujet ET juge). Deux validations complémentaires du futur pipeline (import doc API
→ endpoints → builders → orga) :
- **Iconik = validation de CORRECTION** (oracle : régénérer Iconik par le pipeline
  et retrouver l'acquis). À faire EN PREMIER (on connaît la réponse).
- **Plateforme neuve = validation de GÉNÉRALITÉ.**
La couche technique (endpoints, connexions, façades) est auto-générable ; la
couche métier (sens, nodes custom pertinents) reste intelligence humaine.
VodFactory construit à la main = futur cas-test aussi.
