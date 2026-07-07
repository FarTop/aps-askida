# Procédure de check — branche `feat-search-collection-multiselect`

_Base : `main` — 1 commit, 07/07/2026_

Ajoute la multi-sélection de collections au critère "Collection
(browse)" de la page Recherche (parité avec le nœud aps_search du
Workflow Designer).

---

## Test principal — multi-sélection

1. Ouvrir la page Recherche, choisir "Collection (browse)" comme champ
   d'un critère
2. Cliquer sur une collection dans l'arbre → elle doit apparaître :
   - surlignée en vert dans l'arbre
   - sous forme de tag (📁 nom + ×) au-dessus de l'arbre
3. Cliquer sur une **2e** collection (différente) → elle doit
   s'ajouter (2 tags maintenant, les deux surlignées dans l'arbre)
4. Recliquer sur une collection déjà sélectionnée → elle doit se
   retirer (désélectionnée dans l'arbre, tag disparu)
5. Cliquer sur le × d'un tag → cette collection doit se retirer
   (équivalent au reclic dans l'arbre)

## Test — recherche avec plusieurs collections

1. Sélectionner 2-3 collections, lancer une recherche
2. Vérifier que les résultats correspondent bien à une union (OR) des
   collections sélectionnées (assets présents dans N'IMPORTE LAQUELLE
   des collections cochées)

## Test — sauvegarde et rechargement

1. Configurer un critère collection avec plusieurs collections
   sélectionnées, sauvegarder la recherche
2. Recharger une autre recherche puis revenir sur celle-ci (ou recharger
   la page et charger cette recherche) → les mêmes collections doivent
   réapparaître sélectionnées (tags + surlignage arbre)

## Test — rétrocompatibilité (si tu as d'anciennes recherches sauvegardées avec un critère collection)

1. Charger une recherche sauvegardée **avant** ce changement, qui
   utilisait un critère collection (une seule collection à l'époque)
2. Vérifier qu'elle se charge correctement (tag + surlignage pour
   cette collection unique) — pas d'erreur, pas de perte de données
3. Ajouter une 2e collection à cette recherche existante → doit
   fonctionner normalement

## Ce qui a changé

- Format de stockage du critère collection : d'un ID simple à un
  tableau JSON d'IDs (rétrocompatible avec l'ancien format).
- Nouvelles fonctions : `buildColTagsHtml`, `toggleCol` (remplace
  `selectCol`), `removeColTag`, `_parseColIds`.
- Le filtre envoyé à Iconik utilise `values:[...]` (plusieurs) ou
  `value:...` (une seule), selon le nombre de collections sélectionnées.
