# Procédure de check — branche `css-cleanup-buildcfgfields`

_Base : `73b32b6` (main) — 12 commits au 07/07/2026 matin_

But de ce document : savoir précisément où regarder pour valider (ou invalider)
les changements de cette branche, sans avoir à deviner. Organisé par priorité :
d'abord ce qui a le plus de risque de régression réelle, ensuite un balayage
plus large.

---

## Priorité 1 — Les 2 bugs fonctionnels corrigés (à valider en premier)

Ce sont les seuls changements qui touchent du **comportement**, pas juste du CSS.
S'ils sont mauvais, c'est là que ça se verra.

### 1.1 — hseqModeChange (nœud `http_sequence`)
**Avant le fix** : cliquer sur un onglet source de données (Action / Requête
simple / Pour chaque valeur / Vérifier) dans une étape faisait disparaître
toute la section (boutons + panneaux) et ça ne revenait plus.

**Test** :
1. Ouvrir un flux avec un nœud `http_sequence` (ou en créer un)
2. Ajouter une étape ("Ajouter une étape")
3. Cliquer successivement sur chacun des 4 onglets (Action, Requête simple,
   Pour chaque valeur, Vérifier)
4. **Attendu** : à chaque clic, les 4 boutons restent visibles, le panneau
   correspondant s'affiche, les autres se cachent. Rien ne doit disparaître
   définitivement.
5. Refermer/rouvrir l'étape (clic sur l'en-tête) plusieurs fois pour vérifier
   que le repli/dépli fonctionne toujours normalement.

### 1.2 — changerCanalNotif (notifications, doublon de fonction supprimé)
**Avant le fix** : une version cassée et jamais exécutée de cette fonction a
été supprimée (106 lignes de code mort). La vraie version n'a pas changé de
comportement, seulement son style visuel.

**Test** :
1. Sur un nœud de notification (email/teams/slack/sms), ajouter un
   destinataire
2. Changer le canal via le select (ex : email → teams → slack → sms)
3. **Attendu** : l'icône à gauche du select change bien selon le canal
   sélectionné (c'est le point qui dépendait du sélecteur CSS corrigé)
4. Vérifier que les champs spécifiques au canal (webhook Teams/Slack, SMTP
   pour email, Twilio pour SMS) s'affichent bien à chaque changement

---

## Priorité 2 — Zones avec le plus de changements visuels

### 2.1 — Notifications (teams/slack) — refactor DRY
Le code du color-picker (teams/slack) a été factorisé en 2 fonctions
partagées au lieu d'être dupliqué.

**Test** :
1. Nœud notification → canal **Teams** :
   - Changer le mode couleur (Fixe / Variable) → vérifier que les pastilles
     de couleur (Fixe) ou le champ variable (Variable) s'affichent/cachent
     correctement
   - Cliquer sur une pastille de couleur → vérifier qu'elle se sélectionne
     (contour blanc) et que les autres se désélectionnent
   - Vérifier que le texte d'aide "success=🟢 · partial=🟡 · failed=🔴"
     est bien visible sous le picker
2. Nœud notification → canal **Slack** : même test, **sauf** le texte
   d'aide qui n'existe pas pour Slack (normal, comportement d'origine)

### 2.2 — QC Rules (règles qualité)
**Test** : ouvrir un nœud QC, ajouter une règle, vérifier l'affichage de la
carte (fond, bordure, alignement des champs Catégorie/Champ/Condition/Valeur),
ajouter une sortie QC, vérifier la pastille de couleur et le color-picker.

### 2.3 — Notifications — destinataires (buildRecipientRow)
**Test** : ajouter un destinataire, vérifier l'icône du canal, le bouton
supprimer (🗑), le résumé affiché en bas de carte une fois un champ rempli.

### 2.4 — hseqAddStep (nœud http_sequence)
**Test** (en plus du 1.1) : ajouter 2-3 étapes à la suite, vérifier que
chaque nouvelle carte a bien la bordure bleue à gauche, l'en-tête gris,
le numéro dans son cercle, le bouton supprimer. Supprimer une étape,
vérifier que ça fonctionne toujours.

### 2.5 — Recherche APS / dates (srBuildValInput)
**Test** : dans un nœud `aps_search`, ajouter un critère sur un champ date
avec l'opérateur "entre" (between) → vérifier que les 2 champs date
s'affichent côte à côte avec la flèche au milieu, fond sombre du date-picker.

---

## Priorité 3 — Balayage large (changement mécanique, risque faible)

**Contexte** : un script a fusionné 255 attributs `class=` dupliqués dans
tout le fichier (bug pré-existant où le 2e `class=` de chaque tag était
silencieusement ignoré par le navigateur). Les compteurs de balises ont été
vérifiés identiques avant/après, mais un **coup d'œil rapide sur les panneaux
suivants** est recommandé car leurs classes vont enfin s'appliquer (rendu
visuel qui peut légèrement changer, en principe dans le bon sens) :

- Panneaux de configuration en général (ouvrir 3-4 nœuds de familles
  différentes au hasard, vérifier que rien ne semble cassé visuellement :
  alignements, tailles de police, marges)
- Conditions de décision (nœud Decision/Gate) — pastille couleur, alignement
  de la grille
- Approbateurs (nœud approval)
- Surdéfinitions message par sortie (notif override)

---

## Ce qui n'a **pas** changé (pas la peine de re-tester en profondeur)

- `buildCfgFields` et `srBlockHtml` (les 2 plus grosses fonctions, ~350
  styles inline à elles deux) — **pas touchées** dans cette branche, sauf
  1 ligne chirurgicale (classe ajoutée au message "Aucune étape" du nœud
  http_sequence, sans rien changer d'autre)
- Toute la logique métier (sauvegarde config, appels API, moteur
  d'exécution) — aucun fichier autre que `wfd-config-panel.js` et
  `workflow-designer.css` n'a été touché

---

## Bugs identifiés mais **non corrigés** (notés pour une session dédiée)

Ces collisions de noms de classe CSS existaient déjà avant cette branche et
n'ont pas été introduites par ce travail — mais elles restent actives et
mériteraient leur propre passe :

1. **`.hovered`** définie 2× (context-menu vs dropdown config-panel) —
   la 2e écrase la 1re
2. **`.active-green`** définie 2× (Toggle Tree/Var vs boutons Gate/Timer/
   Cron) — la 2e (`!important`) écrase toujours la 1re
3. **`.active-blue`** définie 2× (même pattern que ci-dessus)

Impact concret : le toggle Tree/Var (choix de cible dans les actions API,
ex. collection_add_asset) affiche des couleurs différentes de son intention
d'origine, mais reste fonctionnel.

---

## Comment récupérer le code pour tester

```bash
cd ~/chemin/vers/aps-askida
git checkout main
git pull
git checkout -b css-cleanup-buildcfgfields
git am <les 12 fichiers .patch, dans l'ordre>
```

Si une branche `css-cleanup-buildcfgfields` locale existe déjà d'une
application partielle précédente, la supprimer d'abord :
```bash
git branch -D css-cleanup-buildcfgfields
```
