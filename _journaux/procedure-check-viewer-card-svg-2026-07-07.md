# Procédure de check — fiche de détail en SVG (ajout au commit précédent)

_Sur la branche `viewer-svg-render`, 4e commit_

---

## Test 1 — netteté

1. Ouvrir une fiche de détail (clic sur un nœud)
2. Zoomer fortement
3. **Attendu** : le texte de la fiche (titre, noms d'équipes, chemin)
   reste net, comme les nœuds

## Test 2 — rendu visuel

1. Vérifier l'apparence générale : forme "onglet dossier" cyan,
   en-tête avec titre + bouton "×" pour fermer
2. Cliquer "×" → la fiche doit se fermer, le nœud redevient normal
   (perd le contour vert "open")
3. Ouvrir une fiche sur une collection **sans accès configuré** →
   doit afficher "Aucun accès configuré" en italique
4. Ouvrir une fiche sur une collection **avec des équipes** → doit
   afficher chaque équipe (point coloré + nom + badge RW/RO si
   applicable)

## Test 3 — le point le plus délicat : chemin long

1. Ouvrir une fiche sur une collection avec un chemin **long**
   (plusieurs niveaux de profondeur, ou noms de dossiers longs)
2. **Attendu** : le chemin doit se répartir sur plusieurs lignes
   proprement (pas de débordement hors de la fiche, pas de texte
   coupé de façon incohérente)

## Test 4 — évitement de collision (toujours fonctionnel avec la nouvelle fiche)

1. Bouton "Afficher toutes les fiches"
2. Si des fiches se chevaucheraient, les nœuds doivent toujours se
   repousser verticalement comme avant (l'algorithme lit maintenant la
   hauteur de fiche autrement, à vérifier que ça fonctionne toujours)

## Ce qui n'est toujours pas dans le périmètre

Le **contenu** des fiches n'apparaît pas dans l'export SVG (seul son
espace est réservé) — c'était déjà comme ça avant, pas une régression
de ce commit.
