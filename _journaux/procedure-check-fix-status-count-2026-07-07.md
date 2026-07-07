# Procédure de check — branche `fix-status-count`

_Base : `main` — 1 commit, 07/07/2026_

Corrige le sous-comptage de `activeFluxes` quand plusieurs flux sont
activés à la suite (le dernier de la séquence manquait systématiquement).
Touche uniquement du code serveur (`wfd-engine.js`, `wfd-engine-trigger.js`,
`wfd-engine-express.js`).

---

## Test principal — reproduire exactement ton scénario

1. Activer 3 flux à la suite (dans n'importe quel ordre), en incluant
   si possible "BAYARD PUBLISH VODFACTORY"
2. `curl http://localhost:3000/wfd/status`
3. **Attendu** : `activeFluxes: 3` (avant le fix, ça aurait montré 2 —
   le dernier activé manquant)
4. Désactiver un des 3
5. Revérifier `/wfd/status` → `activeFluxes: 2`

## Test secondaire — totalFluxes a aussi changé de sens

`totalFluxes` reflète maintenant le **vrai nombre total de flux existants
en base** (actifs + inactifs confondus), pas seulement ceux qui étaient
actifs au dernier rechargement complet du moteur. Avec 18 flux en base
(vu dans tes logs de debug plus tôt), `totalFluxes` devrait maintenant
afficher `18` en permanence, peu importe combien sont actifs.

**Test** : vérifie que `totalFluxes` reste stable à un nombre qui
correspond à ton nombre réel de flux (18 si rien n'a été ajouté/supprimé
depuis), indépendamment du nombre de flux actifs.

## Ce qui a changé "sous le capot"

- `/wfd/activate/:fluxId` insère maintenant directement le flux complet
  (avec ses nodes/connections) dans le registre interne du moteur, sans
  dépendre d'un rechargement complet ultérieur pour "voir" ce flux.
- `/wfd/status` lit le compte d'actifs directement depuis le registre du
  trigger (source de vérité unique), et interroge la base pour le total
  réel de flux — au lieu de se fier à une liste qui pouvait être en retard
  d'une activation.

Ce fix est indépendant de celui d'hier sur la désactivation qui ne
persistait pas (branche `fix-flux-actif`, déjà mergée) — les deux
s'attaquent à des angles différents du même problème général de
synchronisation des flux actifs.
