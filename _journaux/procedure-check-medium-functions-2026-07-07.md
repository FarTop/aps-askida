# Procédure de check — branche `medium-functions-cleanup`

_Base : `main` (après merge de css-cleanup-buildcfgfields) — 12 commits, 07/07/2026_

---

## Priorité 1 — Les 5 sélecteurs cassés corrigés (bugs pré-existants)

Ces 4 fonctions ne retiraient **jamais** leur message "Aucun(e) X" quand on
ajoutait le premier élément — le message restait affiché au-dessus du
nouvel élément ajouté.

**Test** (répéter pour chacun) :
1. Ouvrir un nœud du type indiqué, aller sur le champ concerné
2. Cliquer sur "+ Ajouter" (ou équivalent) une première fois
3. **Attendu** : le message "Aucun(e)..." disparaît, seul le nouvel élément reste

| Nœud | Champ concerné |
|---|---|
| Créer Asset | Champs métadonnées |
| Créer Collection | Champs métadonnées |
| Update Meta | Champs à mettre à jour |
| Appeler Workflow | Variables à transmettre **et** Variables retournées |

## Priorité 2 — Zones à fort changement visuel

Toutes ces zones utilisent le même principe : réutiliser les classes déjà
posées par le JS (`checked-red`, `checked-blue`, `checked-dynamic`,
`checked-green`, `active-status`, `active-blue`, `inactive-btn`,
`unchecked`, `unchecked-dark`) au lieu de dupliquer les couleurs en HTML.
Le risque principal est un **décalage visuel** (mauvaise couleur/bordure),
pas une perte de données.

- **ACL** (nœud Droits d'accès) : cible Asset/Collection, permissions
  Lecture/Écriture/Suppression par team, case "Propager"
- **Update Meta** : cible, méthode PATCH/PUT, champs W/R/C
- **Appeler Workflow (Subflow)** : mode Synchrone/Asynchrone, contexte transmis
- **Relier** (Relate) : type de relation, direction A→B/B→A/Bidirectionnel
- **Notifier (règles de message)** : statut Succès/Partiel/Échec par règle
- **Relier Fichier** : type de fichier (Original/Proxy/etc.)
- **Transcoder** : options FFmpeg personnalisées (bascule Preset "Personnalisé...")
- **Environnement Iconik** (pastille en haut des panneaux) : changer
  d'environnement doit changer la couleur de la pastille

Pour chacun : ouvrir le panneau, vérifier l'affichage initial (couleurs
correctes), cliquer/changer une option, vérifier que la couleur suit bien.

## Priorité 3 — Fonctionnalités "outils" (nœud HTTP)

- **Détection de variables auto** (nœud action HTTP, zone body) : cliquer
  sur l'éclair ⚡ pour ouvrir le menu de variables détectées, ajouter une
  variable (bouton "Ajouter" ou "Étendre" si objet)
- **Aperçu Foreach** : sur un nœud avec mode "Pour chaque valeur", vérifier
  que l'aperçu affiche bien les appels prévus
- **Checker** (nœud vérification) : ajouter une ligne de vérification

## Ce qui n'a pas changé

`buildCfgFields` (et `srBlockHtml` imbriquée dedans) — pas touchées dans
cette branche, sauf les correctifs chirurgicaux déjà appliqués lors de la
branche précédente.
