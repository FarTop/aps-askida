# Procédure de check — branche `consolidate-viewer-page`

_Base : `main` — 1 commit, 07/07/2026_

Consolidation CSS de la page Viewer (12 `style=` inline + 20 toggles
`style.display` en JS → 0). Aucune logique fonctionnelle modifiée,
uniquement la façon dont l'affichage/masquage est géré. Le point le
plus sensible : plusieurs éléments avaient leur état "caché par
défaut" posé dans la règle CSS de base elle-même (pas juste en JS) —
il a fallu inverser ça (base visible + classe `.hidden` pour l'état
caché), donc une passe complète sur les 3 modes est utile.

---

## Test 1 — Bascule entre les 3 modes

1. Ouvrir la page Viewer
2. Cliquer sur chaque bouton de mode (Image / Config / Designer) →
   vérifier que le bon panneau ET la bonne barre d'outils s'affichent
   à chaque fois (un seul mode visible à la fois)

## Test 2 — Mode Image

1. Charger une image PNG → l'image doit s'afficher (remplaçant le
   message "AUCUNE IMAGE CHARGEE")
2. Zoomer/dézoomer (molette), déplacer l'image (glisser-déposer) —
   doit fonctionner normalement (transform pan/zoom inchangé)
3. Cliquer le bouton minimap (🗺 ou équivalent) → la mini-carte doit
   apparaître/disparaître correctement en bas à droite

## Test 3 — Mode Config (arborescence collections)

1. Charger les données (Démo ou Global) → l'arborescence doit
   s'afficher (remplaçant le message vide initial)
2. Cliquer sur un nœud → une fiche doit s'ouvrir, avec les badges
   d'accès colorés (violet pour RG, rose pour les autres ; vert pour
   R&W, bleu pour RO) — **c'est le point le plus à vérifier**, ces
   couleurs viennent d'un changement de mécanisme aujourd'hui

## Test 4 — Mode Designer

1. Créer un nouveau dossier ("+ Nouveau dossier")
2. Tirer une connexion depuis un port → le trait de connexion en
   pointillés doit apparaître en temps réel pendant le survol
3. Shift+glisser sur le canvas (lasso) → le rectangle de sélection
   doit apparaître et sélectionner les nœuds à l'intérieur
4. Dessiner une arborescence, vérifier que le panneau "Chemins
   générés" apparaît/disparaît correctement selon le contenu
5. Sauvegarder un brouillon, recharger la page → le bouton "Reprendre"
   doit apparaître si un brouillon existe
6. Vérifier la couleur d'accent sur le bord gauche des dossiers (varie
   selon la profondeur) — **point sensible**, ancien mécanisme
   consolidé aujourd'hui — et vérifier qu'elle **persiste bien** au
   survol/sélection d'un nœud (ne doit pas disparaître/redevenir
   blanche)

## Ce qui a changé (pour information)

- Tous les toggles `style.display` remplacés par `classList` sur une
  nouvelle classe `.hidden`.
- La couleur d'accent des dossiers (bordure gauche, Designer) repose
  maintenant sur la variable CSS `--tab-color` (déjà posée en JS mais
  jamais utilisée jusqu'ici) plutôt qu'une affectation directe.
- Aucune route serveur ni logique métier touchée.
