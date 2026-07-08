# Procédure de check — branche `fix-lookup-md-dropdown`

_Base : `main` — 1 commit, 07/07/2026_

Remplace le datalist natif (peu fiable/peu visible) du champ "Champ
Iconik" du Lookup par le même menu déroulant custom utilisé ailleurs
dans WFD (ex : set_var).

---

## Test principal

1. Ouvrir la config d'un nœud Lookup existant (ou en créer un)
2. Sur une ligne de mapping (onglet "Champs"), cliquer le bouton
   "{…}" à côté du champ "Champ Iconik"
3. **Attendu** : un menu déroulant doit s'ouvrir avec la liste des
   champs Iconik disponibles (noms bruts, ex "Titre", "Realisateur"
   — pas de {} autour)
4. Cliquer un champ dans la liste → doit se remplir dans le champ
   texte, menu se ferme
5. Taper quelques lettres dans le champ AVANT de cliquer "{…}" →
   le menu doit filtrer les résultats en fonction de ce qui est tapé

## Test — ligne "Crédits" (Réalisateur/Acteur/etc.)

1. Onglet "Crédits" du Lookup
2. Même bouton "{…}" à côté du champ Iconik de chaque ligne de
   crédit → même comportement attendu (liste de champs bruts)

## Test — non-régression

1. Vérifier que les autres champs du Lookup (Champ API cible,
   fallback, etc.) fonctionnent toujours normalement
2. Vérifier qu'ajouter/supprimer une ligne de mapping fonctionne
   toujours normalement

## Ce qui n'est PAS corrigé ici (bug distinct trouvé au passage)

Le nœud Decision a un datalist de champs metadata (`decision-meta-list`)
qui existe mais n'est jamais utilisé (code mort) — le champ "Variable
à évaluer" fonctionne quand même via le mécanisme générique. Pas de
symptôme utilisateur, donc pas traité maintenant — à nettoyer une
prochaine fois si tu veux.
