# Cartographie APS — Askida Platform Studio
_Mise à jour 2026-07-28_

> État technique du système. Le gros changement depuis le 16/07 : le **Workflow
> Builder** est passé d'une idée à un **éditeur de graphe complet + panneau de
> configuration déclaratif**. Cette carto documente surtout cette nouvelle brique.

---

## 0. Le paradigme (à intégrer avant tout)

**APS n'est plus l'outil d'une plateforme (ça, c'était WFD).** APS est le **centre**
qui orchestre pour des **organisations**, à travers leurs **plateformes**. Le
**Workflow Builder** est ce centre, indépendant des plateformes ; il les *consomme*.

- Le **format pivot** est la pièce maîtresse PERMANENTE.
- Le **convertisseur pivot→WFD** est TRANSITIONNEL (pont de migration).
- Les **façades** (Iconik, AWS, VodFactory…) sont des paquets de plateforme ; APS
  est une plateforme parmi d'autres.
- Cible d'architecture Administration : **organisation au sommet** (voir §5). La
  hiérarchie actuelle « plateforme au sommet » est une **dette de transition WFD**.

---

## 1. Workflow Builder — architecture (NOUVEAU, cœur de la session)

Tous les fichiers dans `server/public/builders/workflow/`. **Split par défaut** :
un module = un concern.

### Fondation pivot (déjà là avant la session)
- `pivot-catalog-iconik.js` — catalogue : 12 Core nodes + façades (FACADES).
- `pivot-schema.js` — vocabulaire, 12 Core : `trigger, decision, loop, verify,
  wait, set_variable, transform, lookup, http_request, http_sequence, history,
  deliver`.
- `pivot-validate.js`, `pivot-io.js`, `pivot-resolver-table.js`, `pivot-to-wfd.js`
  (convertisseur transitionnel, équivalence STATUSES prouvée).

### Canvas — éditeur de graphe (construit dans la session)
- `workflow-canvas.html/.css/.js` — la scène. Surface transformée (pan/zoom) via
  variables CSS `--bd-pan-x/y`, `--bd-zoom`. Bandeau d'état en anglais.
- `node-renderer.js` — rend un nœud depuis une étape pivot (badge coloré, titre,
  ports avec pastilles colorées, variable de stockage `→ {var}`). Positions/couleurs
  par variables CSS.
- `edge-renderer.js` — arêtes orthogonales à coins arrondis, colorées par le port
  source. Zone de clic élargie (14px transparent) + trait visible. **Coordonnées
  divisées par `--bd-zoom`** (sinon double zoom → vrille). Contournement en U quand
  la cible est en arrière.
- `wf-model.js` — modèle = source de vérité (nœuds, arêtes). Mutations notifiées.
- `wf-history.js` — commandes annulables : `cmdDeplacer, cmdAjouterNoeuds,
  cmdSupprimerNoeuds, cmdAjouterArete, cmdSupprimerArete`. Undo/redo.
- `wf-selection.js` — sélection nœuds ET arêtes (ensembles parallèles, exclusifs).
- `wf-clipboard.js` — copier/coller/dupliquer (nouveaux ids, offset).
- `wf-shortcuts.js` — Ctrl+Z/Y, Suppr (nœuds + arêtes).
- `wf-lasso.js` — sélection par encadrement (inclusion totale, Ctrl ajoute).
- `wf-palette-drag.js` — glisser un nœud de la palette → étape créée via commande.
  Fantôme suit le curseur.
- `wf-connect.js` — relier deux nœuds (port sortie → entrée). **Modèle WFD** : souris
  classique + `elementsFromPoint` pluriel, PAS de pointer capture. Ligne provisoire,
  cible illuminée.
- `wf-context-menu.js` — clic droit sur nœud : Duplicate/Copy/Delete. Pan reste au
  clic droit sur le vide.

### Panneau de configuration — déclaratif (construit dans la session)
> Remplace les 10 408 lignes / 222 fonctions de `wfd-config-panel.js` par un moteur
> + des schémas déclaratifs. Résout à la racine les 3 bugs WFD (accolades
> incohérentes, champs dépendants figés, sauvegarde capricieuse) : **un seul root
> cause** — chaque champ gérait son état artisanalement.

- `config-model.js` — modèle de config par nœud, **source de vérité unique**. Valeurs
  par chemin pointé (`conditions.0.op`). **Écrire EST sauver** (pas de sauvegarde
  séparée). Stocke le BRUT ; les accolades sont un affichage.
- `config-renderer.js` — moteur : une **nature** = une projection du modèle. Re-rendu
  réactif **contrôlé** (seuls les champs `reagit` / opérateurs / listes re-peignent,
  sinon perte de focus en saisie). Interdépendances via `visibleSi(m)`.
  **9 natures** : `texte, variable, choix, operateur, liste, nombre, booleen,
  endpoint, connexion`.
- `config-schema.js` — décrit les champs par nœud. **12 Core + 6 façades** couverts.
  Une façade PRIME sur le core générique. Repli sur le core si façade inconnue.
- `config-sources.js` — accès aux ressources d'Administration (connexions), **avec
  cache**. Ne renvoie jamais les secrets.

### Interdépendances rationalisées (le point clé pour l'utilisateur)
73 blocs `onchange` manuels de WFD → **une règle générique** : un champ dépendant
porte `visibleSi(m)` ; quand un pilote change, le moteur re-rend. Le bug Date→Between
est **structurellement impossible** (la visibilité est une projection du modèle).

---

## 2. Test de connexion (NOUVEAU, serveur + UI)

- **Route** `POST /api/connexions/:id/test` (`server/routes/connexions.js`). Reprise
  de `testerConnexion` WFD : tape des endpoints connus (`/api/languages` …, repli
  `/`), succès si `status < 500` (**401/403 = API joignable**, pas échec). Rouge
  seulement si injoignable/5xx. `aws_s3` non testable en HTTP → neutre. Secret jamais
  renvoyé.
- **Bille d'état** dans la nature `connexion`, testée AUTOMATIQUEMENT au choix :
  vert = 200 (ok pour bosser), orange = joignable mais token invalide (401/403),
  rouge = injoignable/5xx, gris = inactive/non testable, bleu = choisie non testée.

---

## 3. Palette multi-plateformes (NOUVEAU)

- Onglet « Iconik » → **« Platform »**. TOUTES les façades listées (Iconik, AWS,
  VodFactory), plus seulement `iconik.`.
- **Badge de plateforme** dans la liste (coloré) : on voit la plateforme d'un nœud
  sans le glisser. `data-platform` porté sur chaque nœud.
- Services (`isService`, ex. `aps.registry`) masqués (pas des nœuds à poser).
- Ce `data-platform` **prépare le filtre par contexte** (§5).

---

## 4. WFD (moteur legacy — toujours la cible du convertisseur)

Rappel des acquis moteur (inchangés, cf. carto 07-16) :
- `loop` = vraie itération (executor). `aps_search` = flatten résultat unique,
  champ Collection selon l'objet. `media_type` = champ système (pas `metadata.`).
- `resolve()` détruit les tableaux → `resolvePath` pour le brut.
- `action`/Export Location, `wait_for` tout-en-un, `aws_s3` vérif d'existence.
- Référence d'interaction : `script-workflow-designer.js` (setupPortDrag,
  testerConnexion). **À lire avant de coder une interaction équivalente.**

---

## 5. Dette de conception & chantiers (stratégique)

### Décidé dans la session
- **Organisation au sommet** (pas la plateforme). Une org utilise des plateformes ;
  sur chacune : environnements, connexions, ressources. La capture « plateforme
  contient les organisations » est une **dette de transition WFD**.
- **Connexion = infrastructure transverse** (Administration), attribuable à
  plusieurs orgs (many-to-many à créer).
- **Ressources d'orchestration** (mappings, contacts, correspondance) = **savoir
  métier de l'organisation**, PAS infrastructure. Emplacement cible : sous l'org.
  Une brique « Ressources » manque dans Administration.

### Chantiers ouverts (nécessitent préparation utilisateur)
- **Refonte Administration** : org au sommet, brique Ressources, connexions
  many-to-many. Touche le modèle Prisma → migrations.
- **Filtre par contexte d'orchestration** : org + plateforme(s) posées → la palette
  ne montre que les nœuds pertinents. S'appuiera sur `data-platform`. Dépend de
  l'Administration refondue.
- **Natures externes** du panneau : `arbo` (browse collections, unifiée façon
  APS_Search), `ressource` (générique, consomme sa source), `metadonnee` (md typée,
  champs adaptés au type — dépend du schéma de md de la plateforme).
- **Flou du texte au zoom** : le `scale()` CSS agrandit le HTML comme une image.
  Piste : vectorisation (SVG) ou re-rendu par niveau. Choix d'archi de rendu.
- **Auto-layout** (bpmn-auto-layout, Apache 2.0) + indicateur de croisements.
- **Session make-up** : icônes/couleurs/formes finales (réf. palette WFD).
- **Chargement d'un vrai workflow** (remplacer la démo ; convertisseur WFD→pivot,
  transitionnel, active aussi la preuve bidirectionnelle).
- **Moteur d'exécution natif** du Builder (grand chantier, indépendant de WFD).

---

## 6. Fichiers de référence

| Sujet | Fichier |
|---|---|
| Builder — tous modules | `server/public/builders/workflow/` |
| Panneau config — moteur | `config-renderer.js` (9 natures) |
| Panneau config — schémas | `config-schema.js` (12 Core + 6 façades) |
| Test connexion — serveur | `server/routes/connexions.js` (`POST /:id/test`) |
| Référence interaction WFD | `platforms/iconik/workflow/script-workflow-designer.js` |
| Monolithe config WFD (réf.) | `platforms/iconik/workflow/wfd-config-panel.js` (10 408 l.) |
