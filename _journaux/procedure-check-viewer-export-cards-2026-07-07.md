# Procédure de check — branche `viewer-export-cards`

_Base : `main` — 1 commit, 07/07/2026_

L'export SVG dessine maintenant le contenu réel des fiches ouvertes
(titre, équipes, chemin), pas juste leur espace réservé.

---

## Test 1 — fiche simple

1. Ouvrir une fiche avec quelques équipes ayant des accès (mélange
   RW/RO/RG si possible)
2. Exporter en SVG (bouton "⬇ SVG")
3. Ouvrir le fichier exporté → la fiche doit apparaître **avec tout
   son contenu** : titre, chaque équipe (point coloré + nom), badges
   de permission au bon endroit pour la bonne équipe

## Test 2 — le point le plus sensible : équipes mixtes

1. Trouver ou créer une situation où une collection a plusieurs
   équipes, certaines **avec** permission et d'autres **sans**
   (ou testez avec une Role Team en plus d'une équipe normale)
2. Exporter → vérifier que **chaque badge de permission est bien
   associé au bon nom d'équipe**, pas décalé d'une ligne

## Test 3 — fiche sans accès

1. Ouvrir une fiche sur une collection sans accès configuré
2. Exporter → doit afficher "Aucun accès configuré" en italique,
   **sans** le titre "ACCES" au-dessus (pas de titre de section vide)

## Test 4 — chemin long

1. Ouvrir une fiche avec un chemin long (plusieurs lignes)
2. Exporter → toutes les lignes du chemin doivent apparaître dans
   l'export, à la bonne position

## Test 5 — plusieurs fiches simultanées

1. "Afficher toutes les fiches"
2. Exporter → toutes les fiches ouvertes doivent apparaître avec leur
   contenu complet dans le même fichier
