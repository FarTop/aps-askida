# Procédure de check — branche `fix-wfdTriggerSimRun`

_Base : `main` — 1 commit, 07/07/2026_

Implémente le bouton "Exécuter ce flux avec ce payload" du panneau
"Tester ce déclencheur" (nœud Trigger).

---

## Test principal

1. Ouvrir un nœud Trigger
2. Cliquer "🧪 TESTER CE DÉCLENCHEUR" → "Afficher"
3. Choisir un template (ex: "Metadata changée") ou laisser le JSON par
   défaut
4. Cliquer "▶ Exécuter ce flux avec ce payload"
5. **Attendu** :
   - Le workflow s'exécute réellement (vérifiable dans le panneau
     Jobs/Live, comme un run manuel classique)
   - Le statut s'affiche (🟢/🟡/🔴 selon le résultat), avec le runId
   - Les vars et erreurs du run s'affichent en JSON dans le panneau
     résultat

## Tests d'erreurs

- **JSON invalide** dans le payload → message d'erreur clair, pas
  d'exécution
- **Aucun flux sélectionné** dans l'éditeur → message d'erreur clair
  (ne devrait normalement pas arriver si le panneau est ouvert sur un
  nœud, mais bon à vérifier)

## Différence avec le testeur de Listener

Contrairement au Listener (qui fait un vrai aller-retour HTTP vers
localhost:2880), ce testeur exécute le flux **directement en mémoire**
via la route existante `/wfd/trigger-manual` — pas de nouvelle route
serveur créée pour celui-ci.

## Ce qui a changé

- Nouvelle fonction cliente `wfdTriggerSimRun` (wfd-config-panel.js)
- Petite correction de cohérence dans `wfdTriggerSimLoadTemplate`
  (style.display → classList, sans impact fonctionnel)
- Aucune route serveur modifiée ni ajoutée
