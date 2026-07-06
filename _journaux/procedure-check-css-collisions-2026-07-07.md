# Procédure de check — branche `fix-css-collisions`

_Base : `main` — 1 commit, 07/07/2026_

---

## Ce qui a changé (3 collisions de classes CSS résolues)

Ce sont des changements **purement visuels**, aucune logique de sauvegarde
touchée. Le risque est un décalage de couleur, pas une perte de données.

### 1. `.hovered` → `.hovered-dropdown` (config panel)
**Test** : ouvrir un dropdown de variables (ex. champ avec liste `{variable}`
dans un panneau de config), survoler une variable de la liste.
**Attendu** : fond bleu-gris foncé (`#1e2a30`) au survol, comme avant.

**Test complémentaire** : ouvrir le menu contextuel (clic droit sur un
nœud/le canvas) et la grille de familles (création rapide de nœud, si
accessible). Survoler les items.
**Attendu** : légère teinte selon la couleur de la famille au survol —
**ce comportement devrait maintenant être visible correctement** (il ne
l'était probablement pas avant, faute de gagner la collision).

### 2. `.active-green` / `.active-blue` → variantes `-soft` (Toggle Tree/Var)
**Test** : nœud "Organiser" (action), sélectionner une action de type
collection (ex. Ajouter à collection), regarder les boutons
"🌳 Choisir dans l'arbre" / "⚙ Variable / Chemin".
**Attendu** : le bouton actif doit avoir un fond vert doux (`#1a2a1a`) ou
bleu doux (`#1a2030`) selon le mode — **plus doux qu'avant** (avant, ces
boutons empruntaient par erreur le style fort du bouton "Flux actif").

**Test de non-régression** : bouton "Flux actif/Inactif" (toolbar), boutons
W/R/C (update_meta), onglets fetch, onglets HTTP (Action/Simple/etc.).
**Attendu** : ces boutons gardent leur style fort habituel (bordure vive,
fond saturé) — **rien ne doit changer** pour eux.

## Ce qui a été nettoyé sans risque (CSS mort supprimé)

- `.res-tab` (onglets de la modale Ressources) : un doublon jamais rendu
  a été supprimé. **Aucun changement visuel attendu.**
- 2 lignes dupliquées à l'identique dans le Run Panel : supprimées,
  **aucun changement visuel attendu.**

## Ce qui n'a PAS été touché (en attente de ta décision)

- `.wfd-connection` : conflit réel entre `pointer-events: all` et `stroke`
  sur les lignes de connexion du canvas — affecte potentiellement la
  précision du clic, pas touché tant que tu n'as pas tranché.
- `#wfd-env-dot` : sélecteur CSS mort des deux côtés, aucun élément n'a
  jamais cet ID exact — sans impact, laissé tel quel.
