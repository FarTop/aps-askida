# Journal — 2026-08-14 — le jour où APS a livré, pas seulement traduit

*Une session, la plus longue du chantier. Partie de « la clé ne fonctionne
pas », arrivée à sept machines d'états et six fonctions déposées sur AWS par APS
lui-même — sans un avertissement de la console.*

---

## Le blocage de deux jours n'était pas celui qu'on croyait

Depuis le 13 au soir, la thèse était : *la relation d'approbation du rôle
`APS-StepFunctions-Execution` n'autorise pas `states.amazonaws.com` à
l'endosser*. Une soirée entière à préparer la politique à coller.

**Le rôle n'existait pas.** AWS répond exactement la même phrase pour un rôle
absent et pour un rôle mal approuvé — *« The principal states.amazonaws.com is
not authorized to assume the provided role »* — et elle ne surgit qu'au RUN.
L'admin l'avait créé dans un autre compte.

> **Toujours vérifier l'existence avant de soigner la configuration.** Le
> message d'erreur désignait une cause plausible et fausse ; c'est le pire genre.

Trois autres méprises du même jour, toutes de la même famille — croire un
diagnostic au lieu de le vérifier :

- **La clé livrée ouvrait un mauvais compte.** J'en ai conclu à un « compte
  dédié », option A de notre propre document. C'était une bévue de l'admin,
  reconnue le jour même. J'avais lu ce que j'attendais de lire.
- **`whMode: 'change'` « pas implémenté ».** J'avais lu le mauvais moteur.
  **Il y a DEUX moteurs** : `server/engine/` (l'ancien WFD, décrit dans
  `CLAUDE.md`) et `server/engine-builder/` (celui du Builder, absent de
  `CLAUDE.md`). Le mode existait depuis le 10 août, avec sa preuve.
- **Deux `slug` dans APS.** Ils se ressemblent assez pour crier au défaut ; ils
  servent deux choses différentes, et l'émetteur rendait déjà le bon. Vérifié
  avant d'accuser.

---

## Ce qui a été bâti

### La chaîne AWS, de bout en bout

`preuve-aws-execution.js` crée le rôle si absent, distingue les trois états
(absent / mal approuvé / bon), refuse de lancer sur un rôle inutilisable —
*un échec connu d'avance ressemble trop à un défaut de la définition* — puis
dépose et exécute. Premier `SUCCEEDED` en fin de matinée : Iconik répond 200.

### Le second geste

`wf-interpreter.js` promettait depuis le 11 août *« lire et approuver d'abord,
soumettre ensuite »*. Le bouton existe. **Déposer et lancer restent deux actes**,
avec deux confirmations et deux poids visuels : un dépôt ne touche personne, un
lancement écrit chez Iconik et chez le partenaire.

### Six fonctions, et le principe qui les gouverne

L'Interpréteur ne signale pas ce qui manque : **il le produit**. Arbitrage de
l'après-midi, et il commande tout le reste :

> Ce qui part chez le client doit être AUTONOME — le code ET l'état. Le jour où
> la mission s'arrête, un workflow qui a besoin d'APS pour tourner s'arrête avec
> elle. On n'aurait pas livré un processus, on aurait livré une dépendance.

Une première version faisait rappeler APS par la fonction, pour garder une seule
source de vérité sur les identifiants. Séduisant, et faux au regard du métier.

**Pas de code sur mesure par workflow.** Quatre des six fonctions n'ont aucune
logique propre à un flux : leur comportement vient d'une ressource qu'APS
possède déjà — un Manifeste, une Correspondance — et qui voyage en ENTRÉE du
Task. Un manifeste modifié ne redéploie rien.

| Fonction | Ce qu'elle fait | Pilotée par |
|---|---|---|
| `aps-verify` | vérifie chaque essence chez le partenaire | Manifeste |
| `aps-essences` | reconnaît quel fichier est quelle essence | Manifeste |
| `aps-lookup` | correspondance + héritage entre niveaux | Correspondance |
| `aps-resolve-ancestors` | chemin de dépôt + métadonnées des ancêtres | Iconik |
| `aps-registry` | attribue un identifiant et s'en souvient | *état* |
| `aps-create-tree` | crée N collections depuis un gabarit | *état* |

### Quatre noyaux extraits, et pourquoi

`builder-essences.js` existait déjà. S'y ajoutent `builder-lookup-noyau.js`
(le handler passe de 262 à 91 lignes), `builder-identifiants.js` et
`builder-textes.js`. Chacun est **embarqué depuis le dépôt à l'émission**, jamais
recopié.

Ce n'est pas de l'élégance. Ce qui sort du Lookup, c'est **l'ordre des
recours** — champ, puis métadonnée, puis variable, puis repli, puis héritage.
Cet ordre dit qu'hériter est le DERNIER recours et jamais un raccourci. Dupliqué,
il diverge sans que personne ne le voie.

### L'état, qui ne se généralise pas

Deux tables DynamoDB créées et **semées** : 133 identifiants, 10 compteurs.

> **Une table vide n'est pas une table neutre.** Si le client porte déjà des
> identifiants attribués par APS, une table qui repart de zéro les
> redistribuera. Semer fait partie de la soumission, pas d'une procédure qu'on
> écrira plus tard.

L'amorçage est idempotent (`attribute_not_exists`) : relancer n'écrase aucune
attribution faite depuis. Vérifié — second passage : « 0 semé, 133 déjà là ».

Et la preuve qui vaut pour tout le chantier : `aps-registry` invoquée sur un
objet **déjà connu** rend le MÊME identifiant que celui d'APS.

---

## Les défauts trouvés, et par qui

Onze défauts corrigés. Ce qui compte est **qui les a vus** :

### Trouvés par la première soumission réelle

Jamais visibles auparavant : on n'avait collé que des sondes de trois à huit
états.

- `INVALID_VARIABLE_NAME` sur `_trigger` puis sur `_ancetres` — AWS refuse un
  nom de variable commençant par un tiret bas. Le préfixe `_` est une convention
  d'APS (« hors variables publiques ») qui n'a pas cours en ASL. **Trois fois
  dans la journée.**
- `DUPLICATE_VARIABLE_NAME` sur `erreur` — contrepartie de l'héritage JSONata
  adopté le 13 : le corps de boucle VOIT le dehors, donc il ne peut plus
  réutiliser les mêmes noms.
- `\n` dans une chaîne à apostrophes, `$split(…)[0]`, `{…BayardID.0}` — trois
  formes que JSONata refuse et qu'aucun contrôle local ne connaissait.

### Trouvés par nos propres contrôles, avant AWS

- Le repli « métadonnée aplatie » **inventait des chemins**. `generated_id` était
  lue comme un champ d'un Search sans rapport, posé par un état qui s'exécute
  APRÈS le lecteur. Le garde-fou : un nom produit par une étape qui n'aplatit pas
  n'est plus éligible au repli.
- Le contrôle « sans porteur » **ignorait l'ordre**. Réécrit en point fixe sur le
  graphe. **Union et non intersection**, et c'est mesuré : l'intersection rendait
  34 alertes là où AWS en rendait 2, le surplus venant des `Catch`.
  > Un contrôle plus sévère que la cible n'est pas plus sûr : il devient du
  > bruit qu'on apprend à ignorer, et c'est ainsi qu'on rate la vraie alerte.
- `fail` était classé **port d'erreur**. Seul `verify` le porte, et il déclare
  `error` à côté : `fail` est un verdict, `error` un appel qui n'aboutit pas. Les
  confondre faisait disparaître une arête sur deux — c'est l'origine des « états
  jamais atteints » que j'avais imputés au pivot.

### Trouvés en confrontant les deux moteurs

Le plus instructif, parce qu'aucune relecture ne les aurait montrés :

- **`filebase` divergeait.** Le moteur rend `saison01`, l'émetteur rendait
  `saison.01`. Ces valeurs composent les chemins S3 — ceux où Iconik dépose et
  ceux qu'APS relit pour vérifier.
- **Le préfixe S3 partait en gabarit brut** : `AmazonPrime/{ancestorPath}/…`
  allait tel quel à la Lambda, qui aurait listé un préfixe contenant des
  accolades, trouvé zéro objet, et déclaré tout manquant.

`preuve-slug-emis.js` **évalue** l'expression JSONata émise et la compare au
moteur, valeur par valeur. C'est la première preuve qui confronte ce qu'APS émet
à ce qu'APS exécute. Elle a payé deux fois le jour de sa naissance.

---

## Ce qu'on ne verra plus dans la console

Step Functions expose `ValidateStateMachineDefinition`, qui rend les
avertissements — *« Variable X is possibly not defined »*. **L'API de création ne
les renvoie pas** : sans cet appel ils n'existent que pour qui ouvre la console.
Or ce sont exactement ceux qui comptent, puisqu'ils laissent passer le dépôt et
font échouer le run. La soumission les rapporte désormais elle-même.

---

## L'état au soir

| Flux | États | Sans porteur | Avis AWS | Génériques |
|---|---|---|---|---|
| CALLBACK | 17 | 0 | 0 | **0** |
| CHECK STATUSES | 16 | 0 | 0 | 2 |
| CREER SÉRIE | 3 | 0 | 0 | **0** |
| CREER UNITAIRE | 3 | 0 | 0 | **0** |
| CREER SAISON | 7 | 0 | 0 | 1 |
| CREER ÉPISODE | 7 | 0 | 0 | 1 |
| PUBLISH | 66 | 0 | 0 | 4 |

Chez AWS : 7 machines d'états, 6 fonctions, 2 tables semées, 2 rôles IAM,
2 connexions EventBridge. **Rien n'est passé par la console.**

Les gabarits génériques restants ont chacun leur raison écrite : `whSummaryVar`
(parcourir un objet et n'en garder que les entrées non terminées), le sous-type
`metadata` d'un `fetch` (le moteur choisit `/assets/` ou `/collections/` au RUN),
et un pas de séquence à corps libre. Aucun ne bloque une exécution : un gabarit
générique part, répond, et ne fait rien.

---

## Ce qui vient

**La session de tests.** Elle dira ce que quinze heures de contrôles locaux ne
pouvaient pas dire : si les corps de requête partent comme attendu, si les
chemins de lecture sont les bons, si le partenaire répond ce qu'on croit.

Deux chantiers notés, non urgents, et déclenchés par l'ouverture d'APS à des
collègues :

- **Les garde-fous avant suppression.** Dix-sept routes exposent un `delete` et
  aucune ne vérifie ce qui référence l'objet. Supprimer une correspondance casse
  en silence tous les workflows qui la désignent. Le garde-fou d'abord —
  il empêche le dégât au lieu de le réparer, et le motif existe déjà
  (`builder-flows` a son point d'entrée `usage`). Le côté AWS, lui, se recrée.
- **L'authentification.** Elle existe et ne verrouille rien, délibérément et par
  écrit (`server/routes/auth.js`). Le piège n'est pas de poser un intergiciel :
  c'est le superadmin implicite dont dépendent tous les scripts du dépôt.

---

## Trois phrases à garder

> **Vérifier l'existence avant de soigner la configuration.** Un message
> d'erreur qui désigne une cause plausible et fausse coûte plus qu'un silence.

> **Un contrôle plus sévère que la cible devient du bruit**, et c'est ainsi
> qu'on rate la vraie alerte.

> **Ce qui part chez le client doit vivre sans nous** — sinon on n'a pas livré un
> processus, on a livré une dépendance.
