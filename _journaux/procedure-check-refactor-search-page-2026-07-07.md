# Procédure de check — branche `refactor-search-page`

_Base : `main` — 1 commit, 07/07/2026_

Refactor structurel de la page Recherche (`search.html` → 3 fichiers :
`search.html` + `search.css` + `script-search.js`) + consolidation CSS
(24 → 1 `style=` inline). **Aucune logique fonctionnelle modifiée** —
uniquement extraction et conversion de styles. Le risque de régression
est donc essentiellement visuel (classes mal appliquées) plutôt que
fonctionnel, mais une passe complète reste utile vu que c'est une page
de travail réelle.

---

## Test 0 — la page se charge correctement

1. Ouvrir la page Recherche
2. Vérifier visuellement que tout ressemble à avant (colonnes,
   couleurs, espacements) — aucun changement visuel n'est attendu
3. Ouvrir la console navigateur (F12) → aucune erreur JS au chargement

## Test 1 — Critères de recherche (bloc de base)

1. Un bloc doit être créé automatiquement à l'ouverture (avec un
   critère "Titre — n'est pas vide")
2. Changer le champ d'un critère (ex: vers "Date création") → le menu
   d'opérateurs doit changer en conséquence (opérateurs date : avant/
   après/entre deux dates)
3. Choisir "entre deux dates" → 2 champs date doivent apparaître
   (from/to) avec un fond de calendrier sombre (`color-scheme: dark`)
4. Ajouter un critère (+ Critère) → le bouton ET/OU doit apparaître à
   gauche du nouveau critère, cliquable pour basculer
5. Supprimer un critère (×)

## Test 2 — Blocs multiples

1. "+ Ajouter un bloc" → un 2e bloc apparaît, avec un sélecteur
   "parent" (— aucun parent — / Dans Bloc 1)
2. Changer le type d'objet du bloc (Asset → Collection, etc.)
3. Supprimer un bloc (× en haut à droite du bloc) — bouton doit être
   bien aligné à droite (`margin-left: auto`)

## Test 3 — Critère "Collection (browse)"

1. Choisir "Collection (browse)" comme champ d'un critère
2. L'arbre des collections doit s'afficher (dans un encadré avec
   scroll si nécessaire)
3. Cliquer sur une collection dans l'arbre → elle doit apparaître
   sélectionnée (texte violet) et son nom affiché au-dessus de l'arbre
4. Décocher "Inclure les sous-dossiers" → vérifier que ça bascule bien
   entre recherche directe et recherche dans la branche

## Test 4 — Expression et recherche

1. Avec 2+ blocs, taper une expression (ex: "1 AND 2") dans le champ
   Expression
2. Choisir le bloc à retourner dans "Retourner"
3. Cliquer "▶ Rechercher" → un spinner de chargement doit apparaître,
   puis les résultats (ou un message d'erreur si pas d'environnement)

## Test 5 — Résultats

1. Une recherche avec résultats doit afficher le tableau (titre, type,
   statut avec pastille colorée, dates, chemin, ID)
2. Cliquer sur un en-tête de colonne → tri (croissant/décroissant en
   re-cliquant)
3. Le compteur de résultats doit s'afficher en haut
4. Bouton "⬇ CSV" doit apparaître (était caché avant la recherche) et
   déclencher un téléchargement au clic
5. Bouton "🖨 Imprimer" → aperçu impression correct (mise en page
   simplifiée, sans le panneau de critères)

## Test 6 — Recherches sauvegardées

1. Configurer quelques critères, taper un nom, cliquer "💾
   Sauvegarder" → doit apparaître dans le menu déroulant du haut
2. Recharger cette recherche sauvegardée via le menu déroulant → les
   blocs/critères doivent se restaurer à l'identique, et le bouton
   "✕" (supprimer) doit apparaître à côté du menu
3. Supprimer la recherche sauvegardée (✕) → confirmation, puis retour
   à la liste sans cette recherche

## Ce qui a changé (pour information)

- 3 fichiers au lieu d'un seul (`search.html`, `search.css`,
  `script-search.js`), suivant le même pattern que `workflow.html`.
- Tous les `style=` inline convertis en classes CSS, sauf un bridge
  `--custom-property` légitime (indentation de l'arbre de collections).
- Aucune route serveur touchée (`server/routes/aps-search.js`
  inchangé) — les nouveaux fichiers `.css`/`.js` sont servis
  automatiquement par le serveur de fichiers statiques existant,
  aucune configuration supplémentaire nécessaire.
