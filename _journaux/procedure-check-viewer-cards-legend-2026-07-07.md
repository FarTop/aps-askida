# Procédure de check — branche `viewer-export-cards` (commits teams fix + légende)

_Base : `main` — 2 commits significatifs à tester_

1. Fix du bug des teams (ne s'affichaient jamais)
2. Système de légende (Teams/Catégories/Vues activables) + retrait du Chemin

---

## Test 1 — LE point principal : les teams apparaissent enfin

1. Ouvrir une fiche sur une collection qui a des accès équipe
   configurés dans Iconik
2. **Attendu** : les équipes doivent maintenant apparaître (c'était
   vide avant, quel que soit le contenu réel)
3. Vérifier les badges de permission (R&W/RO) sur les bonnes équipes

## Test 2 — la légende (nouveaux boutons dans la barre d'outils)

1. Repérer les 3 nouveaux boutons "Teams" / "Categories" / "Vues" dans
   la barre d'outils du mode Configuration
2. Par défaut : "Teams" actif, "Categories"/"Vues" inactifs
3. Ouvrir une fiche → doit montrer uniquement la section Teams (plus
   de section Chemin du tout, même désactivée)

## Test 3 — activer Catégories et Vues

1. Cliquer sur "Categories" → doit s'activer (bouton surligné)
2. Les fiches déjà ouvertes doivent se reconstruire automatiquement
   avec la nouvelle section "CATEGORIES" (liste de catégories, point
   orange)
3. Idem pour "Vues" (point cyan) — **note importante** : ces deux
   listes doivent être **identiques sur toutes les fiches** (c'est une
   info globale au système Iconik, pas propre à chaque collection —
   comportement voulu, pas un bug)
4. Désactiver "Teams" → la section Teams doit disparaître des fiches
   déjà ouvertes

## Test 4 — persistance

1. Configurer une sélection (ex: Teams + Vues, sans Catégories)
2. Recharger la page complètement
3. Rouvrir une fiche → la même sélection doit être restaurée

## Test 5 — export SVG avec la nouvelle sélection

1. Avec Teams + Catégories + Vues toutes actives, ouvrir 1-2 fiches
2. Exporter en SVG → toutes les sections doivent apparaître
   correctement dans le fichier exporté (même contenu, mêmes couleurs
   de points, même mise en page que ce qui est affiché à l'écran)
3. Vérifier en particulier que la forme de la fiche (coins arrondis,
   onglet) est bien nette dans l'export — c'est le point technique le
   plus délicat de ce commit (nouveau parseur de tracé)

## Ce qui a changé (pour information)

- Section "Chemin" entièrement retirée des fiches (le diagramme le
  représente déjà).
- Section "Accès" renommée "Teams".
- Nouvelles sections "Catégories" et "Vues Métadonnées", basées sur la
  configuration Iconik (Metadata Categories/Views associées à l'objet
  Collection) — même logique que Settings.
