# Méthode de travail APS — référence vivante

> À LIRE EN DÉBUT DE CHAQUE SESSION. Ce document existe pour qu'une nouvelle
> instance n'ait PAS à re-découvrir ce qui est déjà acquis. Ignorer l'acquis et
> re-investiguer = le principal gaspillage de ressources constaté.

---

## ⛔ GARDE-FOUS ABSOLUS (violés le 29/07 — ne JAMAIS reproduire)

### 1. APS NE MANIPULE JAMAIS D'OCTETS — pilotage API uniquement
APS ne télécharge pas, n'uploade pas, ne transcode pas, ne déplace aucun fichier.
**Il fait UNIQUEMENT des appels API.** Quand une plateforme cible requiert un
transfert/transcodage, c'est **déclaré et exécuté PAR la plateforme** (export
location Iconik, ISG, VM FFMPEG…), configurée en amont. APS déclenche et vérifie
par requêtes.
- Pour Iconik/VodFactory : le nœud **Export Location** fait pousser Iconik→S3 ;
  le nœud **aws_s3 `list_objects`** CONSTATE. APS ne dépose rien.
- `NEED_TO_GET_AUTH` (URL de download Iconik) = **FAUX PROBLÈME** : on ne
  télécharge jamais, donc on n'a jamais besoin de cette URL.
- **Le 29/07, ignorer ça a coûté ~30% de la session.** Ne pas re-investiguer un
  mécanisme de transfert média : il n'existe pas dans APS.

### 2. NE PAS RE-INVESTIGUER L'ACQUIS — s'appuyer dessus
Avant de fouiller le code ou de "chercher comment ça marche", vérifier si c'est
DÉJÀ balisé dans : ce document, la carto, les journaux, la doc projet, WFD.
L'acquis Iconik est ÉNORME (des mois d'investigation). Si une réponse est
probablement connue, elle l'est — la chercher ici d'abord, pas dans une nouvelle
investigation coûteuse.

### 3. LIRE WFD D'ABORD quand WFD a déjà résolu le problème
WFD est un proto fonctionnel qui marche. Avant de coder une capacité qu'il a déjà
(connexion, S3, port drag, test de connexion…), **lire son implémentation** et la
reproduire. Ne pas re-supposer ni réinventer.

### 4. DIAGNOSTIQUER avant de re-supposer
Face à un bug : grep/console/curl pour COMPRENDRE, puis corriger. Jamais de patch
spéculatif.

---

## Cadence de session
- **En journée** : on TRAVAILLE et on AVANCE. Pas de journal/méthode/carto.
  Ne JAMAIS demander si on fait le journal — la réponse en journée est non.
- **Le soir uniquement** (selon tokens + heure, PAS selon les étapes) : générer
  journal + méthode + carto (ces deux dernières si besoin). L'utilisateur dit
  quand. Ne pas redemander.
- Exécuter la stratégie validée SANS reposer une micro-question à chaque étape
  (chronophage). Une décision prise reste prise.

## Discipline patch (STRICT)
- Claude ne commite JAMAIS sur `main`. Produit des `git format-patch` zippés dans
  `/mnt/user-data/outputs/`, Farid applique + merge explicitement.
- Branche `feat-*`/`fix-*`. `node --check` sur chaque JS touché.
- Commandes git complètes (commit + merge) dans la MÊME réponse.
- **Redémarrage serveur obligatoire** si le patch touche `server/routes/*`,
  `server/index.js`, `server/lib/*`, ou le schéma Prisma.
- **Nouvelle dépendance npm** → `npm install` requis côté serveur + le préciser.

## Pièges Git (vérifiés)
- **CRLF** (ex. `navbar.css`) fait échouer `git am` sournoisement → livrer le
  fichier en **FICHIER COMPLET**, pas en patch ; ou éditer en binaire python en
  préservant `\r\n`.
- Décalage de clone : le `git log` de Farid fait foi. Commit fantôme = merge local
  non poussé → `git log origin/main..HEAD` le révèle.
- Résidu `.git/rebase-apply` → `git am --abort`.
- **NE PAS mettre de `#` en fin de ligne de commande** (zsh : `command not found`,
  ou npm tente d'installer "#"). Les commentaires vont sur leur propre ligne, ou
  pas du tout.
- Keychain `-25308` : inoffensif.

## Discipline code
- Zéro `style=` inline HTML. Zéro `style.display`/appearance en JS (sauf
  `setProperty('--var')`). Tout par classes + `data-*`.
- Commentaires FR, UI EN/FR. Création DOM par éléments (pas d'`innerHTML` avec
  données non échappées).
- CSS Custom Properties pour les tokens ; viser une feuille de tokens partagée
  (`_shared/css/tokens.css`) pour tarir les divergences de couleur.
- `node --check` mandatory avant tout patch. Vérifier les définitions de fonction
  en double avant de patcher.
- Prisma : après changement de schéma → `migrate deploy`/`db push` → `generate` →
  redémarrage (dans cet ordre).

## Principe fondateur
Le pivot **transcrit, n'optimise pas**. Le Builder représente fidèlement ce qui
tourne. Narratif humainement lisible : « 10 nœuds qui montrent clairement les
étapes » plutôt que « 5 qui accumulent la config ». Un objet qui ne sait pas se
résumer cache quelque chose.
