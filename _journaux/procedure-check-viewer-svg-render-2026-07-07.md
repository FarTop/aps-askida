# Procédure de check — branche `viewer-svg-render`

_Base : `main` — 1 commit, 07/07/2026_

Refactor important : les nœuds du mode Configuration (boîtes de
collections) passent de HTML/CSS zoomé en CSS à du SVG natif. Objectif
principal : netteté à n'importe quel niveau de zoom. Vu l'ampleur du
changement (repositionnement, connexions, fiches, export tous
retouchés), une passe complète et attentive est nécessaire.

---

## Test 1 — LE point principal : netteté au zoom

1. Charger l'arborescence (Démo ou Global)
2. Zoomer fortement (molette ou bouton +) jusqu'à un niveau où c'était
   flou avant
3. **Attendu** : les boîtes, le texte du nom, et les badges d'équipe
   doivent rester **parfaitement nets**, à n'importe quel niveau de zoom
4. Dézoomer, re-zoomer plusieurs fois — la netteté doit être constante

## Test 2 — Rendu visuel général (comparaison avec avant)

1. Vérifier que l'apparence est identique à avant (forme "onglet
   dossier", couleurs, badges colorés RW/RO/RG)
2. Survoler un nœud → doit s'illuminer légèrement (bordure blanche)
3. Cliquer un nœud → la fiche doit s'ouvrir, le nœud doit avoir un
   contour vert (état "open")
4. Clic droit sur un nœud → surlignage du sous-arbre (halo jaune/vert
   diffus) doit fonctionner comme avant

## Test 3 — Fonctionnalités interactives

1. **Pan** (glisser-déposer sur le fond) → doit toujours fonctionner
2. **Zoom molette** centré sur le curseur → doit toujours fonctionner
   correctement (zoom vers le point sous la souris, pas vers un coin)
3. **Bouton "Ajuster"** (fit) → doit cadrer correctement toute
   l'arborescence à l'écran

## Test 4 — Le plus sensible : "Afficher toutes les fiches" + évitement de collision

1. Cliquer le bouton qui affiche toutes les fiches simultanément
2. **Attendu** : si des nœuds sont proches verticalement avec des
   fiches qui se chevaucheraient, les nœuds doivent se **repousser
   automatiquement** vers le bas pour laisser de la place — comme
   avant
3. Désactiver ce mode → les nœuds doivent revenir à leur position
   initiale, connexions correctement redessinées

## Test 5 — Export SVG

1. Cliquer "⬇ SVG" → télécharge un fichier
2. Ouvrir ce fichier (navigateur ou éditeur d'image) → doit ressembler
   exactement à ce qui est affiché à l'écran (mêmes formes, couleurs,
   texte, badges)
3. Si possible, tester avec le surlignage (clic droit) actif avant
   l'export → la couleur de surlignage doit apparaître dans le SVG
   exporté aussi

## Ce qui N'A PAS changé (pour information, pas la peine de tester en détail)

- Les fiches de détail (popup au clic) restent en HTML — mêmes
  éventuelles limites de netteté qu'avant si tu zoomes fort dessus,
  ce n'était pas dans le périmètre de cette passe
- Le mode Designer (dossiers, glisser-déposer d'arborescences)
  n'est pas touché
