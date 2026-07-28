# Journal APS — 2026-07-28

> Session très dense, centrée sur le **Workflow Builder** : achèvement de l'éditeur
> de graphe, puis construction complète du **panneau de configuration déclaratif**.
> Récit chronologique. État technique → `cartographie-aps` ; processus →
> `methode-travail-aps`.

## Fil de la session

### Éditeur de graphe — achèvement
- **Lasso** (`wf-lasso.js`) : sélection par encadrement, inclusion totale, Ctrl
  ajoute. Clôt l'étape 3 (sélection/déplacement/copier-coller/undo-redo).
- **Glisser depuis la palette** (`wf-palette-drag.js`) : poser un nœud → étape créée
  via commande annulable. Fantôme suivant le curseur. Le canvas devient
  constructible.
- **Relier les nœuds** (`wf-connect.js`) + **suppression active des liaisons**.
  Trois itérations douloureuses : d'abord pointer capture (cible ne s'illumine pas),
  puis ancrage KO. **Résolu en lisant `setupPortDrag` de WFD** : souris classique +
  `elementsFromPoint` pluriel, PAS de capture. Leçon : lire WFD d'abord.
- **Contournement des arêtes** quand la cible est en arrière (U-detour, garde
  l'orthogonal).
- **Menu contextuel** (`wf-context-menu.js`) : clic droit nœud = Duplicate/Copy/
  Delete ; pan reste au clic droit sur le vide.

### Panneau de configuration déclaratif
Cadrage stratégique (l'utilisateur a nommé les 3 bugs WFD vécus : accolades
incohérentes, Date→Between figé, sauvegarde capricieuse). Diagnostic : **un seul
root cause** — chaque champ gérait son état artisanalement. Réponse = le pattern du
canvas (modèle au centre, rendu réactif).
- **Fondation** : `config-model.js` (source de vérité, écrire=sauver, brut stocké),
  `config-renderer.js` (moteur déclaratif, re-rendu contrôlé), `config-schema.js`.
- **Natures** ajoutées progressivement : texte, variable (accolades = affichage),
  choix, **operateur** (tue Date→Between via `visibleSi`), **liste** (sous-schéma
  répété, composition récursive), nombre (0 valide), booléen (peut piloter),
  **endpoint** + **connexion** (consomment Administration via `config-sources.js`).
- **Test de connexion réel** (serveur + UI) : d'abord bille rouge partout (mon
  handshake tapait la racine + comptait 401 comme échec). **Résolu en lisant
  `testerConnexion` de WFD** : endpoints connus, `< 500` = joignable. Bille
  vert/orange/rouge/gris/bleu, test auto au choix. VodFactory Preprod → vert.
- **Schémas par famille** : 12 Core nodes, puis 6 façades (façade prime sur core).

### Palette multi-plateformes
Onglet « Iconik » → « Platform », toutes façades visibles, **badge de plateforme**
dans la liste (`data-platform`). Débloque S3 (`aws_s3.deliver`). Prépare le futur
filtre par contexte.

### Bugs & épisodes Git
- **Arêtes qui vrillent au zoom** : premier fix neutre (offsetWidth=0). Résolu par
  **diagnostic instrumenté** → lire `--bd-zoom`. Leçon : diagnostiquer avant de
  re-supposer.
- **Commit fantôme** : un vieux fix arêtes mergé en local mais non poussé bloquait
  tout (`ahead by 1`, patch qui n'applique pas). Révélé par
  `git log origin/main..HEAD`. Nettoyé par `reset --hard origin/main`.

## Décisions d'architecture (discussion produit)
- **Organisation au sommet** (pas la plateforme) — la hiérarchie actuelle est une
  dette de transition WFD.
- **Ressources d'orchestration** (mappings, contacts) = savoir métier de l'org, PAS
  infrastructure. Connexions = infrastructure transverse (many-to-many à venir).
- Ces points → chantier **refonte Administration** (modèle Prisma).

## État en fin de session
Panneau Config **fonctionnellement complet** : 9 natures, 12 Core + 6 façades, test
de connexion réel. Canvas = éditeur complet, résistant au zoom. Tout mergé sur
`main`.

## Reste à faire (chantiers, cf. cartographie §5)
Refonte Administration · filtre par contexte · natures arbo/ressource/métadonnée ·
flou texte au zoom · auto-layout · make-up · chargement d'un vrai workflow · moteur
d'exécution natif.
