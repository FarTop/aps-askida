# Procédure de check — retrait de la racine synthétique (ajout au commit précédent)

_Sur la branche `fix-viewer-config-collections`, 3e commit_

---

## Test

1. Mode Configuration → charger les données (Démo ou Global)
2. **Attendu** : l'arborescence démarre directement par tes vraies
   collections racines (celles créées dans Iconik) — plus de dossier
   "Racine" artificiel en tête
3. Si tu as plusieurs collections racines distinctes → elles doivent
   apparaître comme des arbres séparés, côte à côte, tous alignés au
   même niveau (plus de tronc commun les reliant à un point central)
4. Cliquer sur un nœud, vérifier que l'ouverture de fiche et le
   surlignage de sous-arbre (clic droit) fonctionnent toujours
   normalement sur les collections racines comme sur les autres
5. Vérifier que les connexions parent→enfant (niveau 1, 2, etc.) se
   dessinent toujours correctement

## Point non traité ici (mis de côté pour discussion séparée)

Le flou au zoom (boîtes en HTML/CSS zoomées plutôt qu'en SVG natif) —
sujet plus large, à traiter à part si tu veux qu'on s'y attaque.
