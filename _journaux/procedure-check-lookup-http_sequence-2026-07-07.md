# Procédure de check — branche `lookup-cleanup` (dernier lot buildCfgFields)

_Base : `main` — 3 commits, 07/07/2026_

Ce lot clôt le nettoyage CSS de `wfd-config-panel.js` (539 → 37 `style=`,
tous légitimes). Deux sections traitées : `lookup` et `http_sequence`.

---

## Priorité 1 — http_sequence : harmonisation étapes neuves ↔ étapes sauvegardées

C'est le point le plus sensible de ce lot : les mécanismes de repli/dépli
et de changement de mode ont été convertis (`style.display` → classes),
et ce changement affecte **à la fois** les étapes qu'on ajoute (`+ Ajouter
une étape`) et celles déjà sauvegardées (rechargées à l'ouverture du nœud).

**Test** :
1. Ouvrir un nœud `http_sequence` avec au moins une étape déjà sauvegardée
2. Vérifier qu'elle apparaît bien **repliée** par défaut
3. Cliquer sur son en-tête → elle doit se **déplier** (contenu visible)
4. Re-cliquer → elle doit se **replier** à nouveau
5. Dans une étape dépliée, cliquer sur les 4 onglets (Action/Requête
   simple/Pour chaque valeur/Vérifier) → le bon panneau doit s'afficher
   à chaque fois, les autres doivent disparaître
6. Cliquer "+ Ajouter une étape" → la nouvelle étape doit apparaître
   **dépliée** par défaut (comportement différent des étapes
   sauvegardées, c'est normal)
7. Répéter les tests 3-5 sur cette nouvelle étape
8. Remplir une étape, sauvegarder, fermer, rouvrir le nœud → l'étape
   doit revenir repliée avec son contenu conservé

## Priorité 2 — Lookup : les 3 onglets

**Test** :
1. Ouvrir un nœud Lookup, vérifier les 3 onglets (Champs / Crédits /
   Technique) — cliquer sur chacun, le contenu doit changer correctement
2. **Onglet Champs** :
   - Ajouter un champ, vérifier qu'il apparaît
   - Cliquer sur le bouton "↩" (fallback) d'une ligne → un champ de
     repli doit apparaître/disparaître
   - Si un champ a des enfants (valeurs conditionnelles), vérifier
     qu'ils s'affichent correctement
3. **Onglet Crédits** :
   - Si aucun crédit : le message "Aucun crédit configuré" doit
     s'afficher
   - Cliquer "Ajouter un crédit" → le message doit disparaître, une
     nouvelle ligne apparaît (nom du champ Iconik, rôle, format)
   - Ajouter un 2e crédit → le premier ne doit pas être affecté
4. **Onglet Technique** : vérifier que les variables système et les
   formats techniques s'affichent correctement (pas de test
   d'interaction particulier, juste visuel)

## Ce qui a changé "sous le capot" (pour information, pas à tester spécifiquement)

- Le bloc `<style>` qui était injecté dans le HTML à chaque ouverture
  d'un nœud Lookup a été déplacé dans `workflow-designer.css` (gain de
  performance, cohérence — zéro changement visuel attendu).
- Un fichier jusqu'ici jamais touché (`script-workflow-designer.js`) a
  été modifié pour la première fois aujourd'hui, pour corriger 2 points
  liés à Lookup :
  - `lkAddPersonRow` cherchait le message "Aucun crédit" via un
    sélecteur cassé (même famille de bug que ceux trouvés plus tôt sur
    hseq/ACL) — corrigé.
  - `lkToggleFb` et `lkSwitchTab` mis à jour en cohérence avec le
    nouveau rendu.

## Fin du chantier

Avec ce lot, **`wfd-config-panel.js` est intégralement passé en classes
CSS** (539 → 37 `style=`, tous légitimes : bridges `--custom-property`
pour couleurs dynamiques, `accent-color` sur checkboxes, rotation du
chevron gérée en JS). Aucune section de `buildCfgFields` ne reste à
traiter.
