# Journal APS — 2026-08-13

Quinze commits, trois chantiers, et un fil rouge qu'on n'avait pas prévu :
**deux sources pour une même question**. Il est apparu cinq fois dans la
journée, à cinq endroits sans rapport entre eux, et c'est à chaque fois lui
qu'il a fallu trancher. Le reste en a découlé.

---

## Le fil rouge

Une adresse de métadonnée lue de deux Search différents. Une organisation
écrite à la main dans le navigateur pendant qu'une autre vit en base. Un rôle
sur la personne pendant que les groupes portent la même information. Une charte
dans le code de l'exporteur pendant qu'une table l'attend. Un catalogue d'outils
qui pourrait être une table alors qu'il décrit du code.

À chaque fois le symptôme est le même : **ça marche, jusqu'au jour où les deux
divergent** — et c'est celle qu'on a oublié de mettre à jour qui décide. À
chaque fois la correction est la même : en supprimer une, et écrire pourquoi à
l'endroit où on la cherchera.

---

# I. La chaîne ASL

## Le flux de données, réglé

Deux trous nommés hier, bouchés :

```
ItemSelector  + TypeCollection, adressé depuis la COLLECTION publiée
ApiEndpoint   « /API/jobs/v1/jobs/{exportJobId}/ » partait tel quel — le
              sondage interrogeait littéralement une URL à accolades
```

Mais ce n'est pas le code de l'émetteur qui les a réglés, **c'est le
catalogue**. Deux mécanismes y sont entrés :

- **`depuis`** — le champ de la RÉPONSE où une variable se relit. `exportJobId`
  passait pour une métadonnée d'ambiance, donc pour intraduisible, alors que
  l'export qui la produit la renvoie noir sur blanc.
- **`lectures`** — ce qu'une étape CONSOMME sans que ça paraisse dans ses
  paramètres. Quatre handlers filtrent par le niveau courant et lisent pour cela
  `TypeCollection` ; personne ne le déclarait. Une lecture qu'on ne déclare pas
  ne franchit aucune frontière de portée.

Plus **`objetDe`** — de QUI la métadonnée est lue. L'information dormait dans
`blocks[].objectType` ; sans elle, on relit du dernier Search venu, et sur
PUBLISH le dernier Search avant la boucle cherche des ASSETS.

## Le contrôle qui a trouvé deux bugs au premier essai

Même famille que celui de connexité, et pour la même raison : **un JSONPath vers
un champ que rien ne pose est parfaitement valide pour AWS.** Accepté, dessiné,
et le run lit du vide.

```
ItemsPath: '$.items'   en dur — le Map aurait itéré sur RIEN
source md              « le dernier Search venu » désignait les assets
```

Le pivot déclarait `loopVariablePath` depuis toujours. Personne ne le lui
demandait — c'est la troisième fois cette semaine.

Piège du contrôle lui-même : dans un `ResultSelector`, `$` désigne le résultat
de la tâche, pas l'état. Quatre adresses justes accusées à tort.

## Puis les quatre sous-types de Fetch

`depuis` recopie un suffixe ; **`gabaritSous` le TRADUIT**.
`{serieMetadata.TypeCollection}` ne vaut pas « …ResponseBody.TypeCollection »
mais « …metadata_values.TypeCollection.field_values[0].value ». Recopiée au lieu
d'être traduite, l'adresse reste un JSONPath valide — et vide.

```
références sans porteur, sur les 7 workflows
  ce matin     4     PUBLISH 1 · SAISON 2 · EPISODE 1
  ce soir      1     $.ancestorPath
```

La dernière n'est pas une adresse qui manque : c'est **une quatrième logique
hors de portée d'ASL**, en plus des trois Lambdas. Le chiffrage d'hier ne la
compte pas.

## Qui liste le bucket — et pourquoi ça ne s'arbitre pas au prix

L'intégration S3 native d'ASL signe avec le **rôle** de la machine d'états,
jamais avec des identifiants qu'on lui passe. Conséquence qu'on n'avait pas
vue : **elle ne sait pas atteindre le bucket d'un client.** Chez APS un nouveau
client est une ligne dans `Connexion` ; chez ASL, en natif, c'est une
négociation IAM avec lui.

L'émetteur produit donc les deux compositions depuis le même pivot
(`--listing lambda`), et `natif` reste le défaut. Mesuré, pas déduit :

```
états         41 → 38     un de moins par Deliver
transitions   53 → 50     par publication
coût          0,09 $ d'écart sur MILLE publications
gratuité      75 → 80     publications offertes par mois
```

**L'écart d'argent est dérisoire, et c'est l'information.** Cette bascule
s'arbitre sur l'autonomie, pas sur le prix.

## La demande IAM, réécrite

La première version demandait deux rôles figés — elle résolvait un cas et
rouvrait la question au suivant. La seconde propose trois formes, par ordre de
préférence : **un compte dédié** avec plafond de dépense, **la délégation
encadrée** (politique-plafond + création de rôles sous `/aps/`), ou le minimum.

Trois corrections de fond :

- **`iam:PassRole`** — créer un rôle ne suffit pas, il faut le droit de
  l'ATTACHER. C'est ce qui fait échouer la moitié de ces demandes.
- La condition `states:HTTPEndpoint` bornée à `*.iconik.io` **aurait bloqué
  l'appel au partenaire**. Retirée.
- Tout S3 a disparu de la demande, conséquence directe de la bascule ci-dessus.

*Transmise. L'accès semble ouvert en fin de journée — à vérifier en ouvrant la
console.*

---

# II. Le Documentation Builder

## Ce qu'on a trouvé en regardant

**Cinq tables `Doc*` existaient dans le schéma. Zéro ligne. Aucune route.** Le
modèle avait été posé, puis l'interface est partie de son côté avec ses données
dans le localStorage — ce que le principe en tête de `schema.prisma` interdit.

Le partage d'Administration du 10 août s'y applique tel quel, et il sépare
**trois questions** qu'on avait fondues en une :

```
ce qu'un document DÉCRIT    DocTemplate     → la PLATEFORME, partagé
à quoi il RESSEMBLE         DocAsset        → l'organisation
POUR QUI on l'assemble      DocKit          → l'organisation
l'état de travail           DocKitContext   → organisation + envKey
```

Trois défauts trouvés en vérifiant : `DocKit` pendait à `Project` (0 ligne, la
situation exacte d'`ApiSpec` avant sa migration), et `DocTemplate.orgId` comme
`brandAssetId` étaient déclarés **sans relation** — des identifiants orphelins.
Le second est celui qui compte : c'est le lien gabarit → charte, donc la pièce
qui empêche de refaire la faute des exports WFD.

## Les écrans

`admin/doc-assets/` d'abord : sans lui, la charte était une donnée que personne
ne pouvait corriger. Puis `admin/doc-templates/`, sans quoi la charte était
rattachable à rien — la moitié du mécanisme.

Ce que ces écrans **ne** décident **pas**, et c'est délibéré : la forme d'une
charte, la structure d'un gabarit. `meta` et `content` restent des JSON libres,
validés à la frappe. **Rendre corrigeable n'est pas décider.** La conception du
Documentation Builder — pyramide, WYSIWYG, rendu — n'est pas tranchée, et rien
de ce qui a été fait aujourd'hui ne la contraint.

## L'organisation prime

Le Doc Builder avait SA notion d'organisation : un nom saisi à la main dans
`localStorage['organisationName']`. Le reste d'APS en avait une autre.

```
header   le sélecteur PARTAGÉ remplace un badge maison
scope    le menu « Organisation / Projet » disparaît → « Plateforme / Domaine »
clé      plateforme|org|domaine  →  plateforme|domaine
```

**La clé est le point important.** `DocKitContext` est déjà unique par
(orgId, envKey), l'orgId venant du serveur. La porter AUSSI dans la clé sous
forme de nom libre, c'était scoper deux fois avec deux identités : un client
écrit « Bayard » ici et « Groupe Bayard » là, et récolte deux espaces de travail
sans jamais comprendre pourquoi.

Piège : le provider relit `aps:context` à **chaque** appel. Poser la valeur une
fois au démarrage ne suffit pas — l'aperçu affichait « Organisation: - » pendant
que le header montrait la bonne.

Et le vocabulaire : « Projet » devient « Contexte », l'organisation passe en
tête de liste (l'ordre annonçait l'inverse de la hiérarchie). Sauf « Statut du
projet » et « Clôturer le projet », qui désignent une prestation qui se
termine — vraie notion métier, à ne pas confondre avec la clé de travail.

---

# III. Les comptes et les groupes

## La règle, dictée en une phrase

**Le groupe EST le rôle.** Pas de notion de rôle à côté. Un groupe s'appelle
SuperAdmin, Admin, Support, Formation, Broadcast, et porte **deux listes** :
les organisations qu'il couvre, les outils qu'il ouvre. Une personne appartient
à des groupes et hérite des deux.

Ça a **simplifié** le modèle que je proposais, pas compliqué : plus de rôle par
appartenance, plus de matrice de permissions. Deux champs ont quitté `User` :

- `orgId` unique — interdisait d'appartenir à plusieurs organisations, ce qui
  est le cas normal chez un prestataire ;
- `role` — aurait vécu à côté des groupes.

Un « superadmin » est quelqu'un du groupe SuperAdmin, rien de plus. Et
**Support vs Admin n'a pas eu à être tranché** : deux listes d'outils, qu'on
fusionne le jour où elles se révèlent identiques.

## Le catalogue d'outils est un FICHIER

Un outil existe parce qu'une page existe. Une table de douze lignes qui ne
change qu'en écrivant du code se désynchronise du code — **les tables `Doc*`,
modélisées puis oubliées pendant des mois, sont l'exemple qu'on avait sous la
main le matin même.** Une route sert le catalogue à l'écran pour que les deux ne
divergent pas. Les outils `dev.*` y figurent DÉJÀ, avant d'exister, pour être
cochables le jour où ils arrivent.

## L'invitation, la connexion, l'identité

Créer un compte, c'est créer son lien. Pas d'envoi d'e-mail : aucune dépendance
mail, et un banc d'essai n'a pas à devenir un serveur de courrier. Sept jours,
un seul usage, réinviter invalide le précédent.

Puis se connecter — et voir dans le header, à côté de l'organisation :

```
Farid Radi · SuperAdmin · 12 outils · [Se déconnecter]
```

C'est-à-dire **ce qu'on obtiendrait si les accès étaient appliqués**, pendant
qu'APS reste grand ouvert. On vérifie le modèle sur de vrais comptes sans rien
risquer, et le jour où la porte se ferme, rien ne change à l'écran.

Quatre refus délibérés : un administrateur ne peut pas ÉCRIRE un mot de passe
(seulement réinitialiser) ; `passwordHash` ne sort d'aucune route ; un groupe
peuplé ne se supprime pas ; et **un seul message de refus** pour quatre cas de
connexion — les distinguer dirait à un inconnu quelles adresses existent.

**RIEN N'EST IMPOSÉ.** Aucune authentification n'est exigée nulle part. Fermer
la porte reste un geste séparé, à décider.

---

# Méthode

**Ce que le code dit et ce que l'écran montre sont deux choses.** Le panneau
« sélectionnez une ressource » restait affiché SOUS l'éditeur ouvert : le JS
posait bien l'attribut `hidden`, mais `display:flex` écrase la règle du
navigateur. Trouvé à l'œil, pas à la relecture. La même règle existe dans
`mappings.css` et `endpoints.css`.

**CRLF, deux fois.** Un script Python a converti `doc.js` en LF et gonflé le
diff à 1593 lignes ; restauré. Puis une insertion de balise a cassé le `<link>`
des treize pages d'un coup. Vérifier `file <fichier>` après tout patch scripté,
et relire une balise avant de la répliquer treize fois.

**Un diagnostic qu'on ne sait pas reconstituer, on le dit.** Le groupe Admin
s'est retrouvé avec les outils de développement. J'ai prouvé que la route
préserve les outils lors d'un enregistrement partiel — donc elle est saine — et
je n'ai pas su retrouver quel clic l'avait fait. Restauré, et signalé comme
inexpliqué plutôt qu'expliqué de travers.

**Et toujours : le pivot en sait plus long que ses consommateurs.**
`loopVariablePath`, `blocks[].objectType`, `metadata_values`, `DocTemplate.
brandAssetId`, `DocKitContext.envKey`. Cinq informations déjà présentes,
qu'aucun code ne lisait. Avant d'ajouter une donnée, chercher si elle n'est pas
déjà quelque part — c'est la règle la plus rentable de ce projet.
