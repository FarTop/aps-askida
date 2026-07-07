# Procédure de check — branche `fix-flux-actif`

_Base : `main` — 1 commit, 07/07/2026_

Fix du bug des flux actifs désynchronisés (`/wfd/status` montrait des
flux actifs qui n'apparaissaient pas dans l'éditeur). Touche à la fois
du code client (`wfd-config-panel.js`, `script-workflow-designer.js`)
et du code serveur (`routes/flows.js`, `routes/connexions.js`).

---

## Étape 0 — Nettoyer l'état actuel (une seule fois)

Les flux "MISE EN PARTAGE" et "TEST" sont actuellement coincés actifs
en base. Une fois ce patch appliqué et le serveur redémarré :

1. Ouvrir "MISE EN PARTAGE" dans l'éditeur, regarder le bouton toggle
2. Si le bouton indique "actif", cliquer pour désactiver
3. Répéter pour "TEST"
4. Vérifier `curl http://localhost:3000/wfd/status` → `activeFluxes`
   doit descendre à 0 (ou au nombre de flux que tu veux vraiment garder
   actifs)

## Priorité 1 — Le scénario exact du bug

**Test** :
1. Activer un flux quelconque via le toggle dans l'éditeur
2. Vérifier `curl http://localhost:3000/wfd/status` → doit refléter
   +1 flux actif
3. **Sans redémarrer le serveur**, faire une autre modification dans
   l'éditeur (ajouter un nœud n'importe où, même sur un AUTRE flux,
   puis sauvegarder / attendre la sauvegarde auto)
4. Re-vérifier `curl .../wfd/status` → le flux doit **rester actif**
   (c'est exactement ce qui se réinitialisait à tort avant le fix)
5. Désactiver ce même flux via le toggle
6. Refaire une modif ailleurs dans l'éditeur
7. Re-vérifier `curl .../wfd/status` → le flux doit **rester inactif**
   (c'est le sens inverse du même bug, à vérifier aussi)

## Priorité 2 — Comportement en cas d'erreur serveur (bonus fiabilité)

Plus difficile à provoquer volontairement, mais si l'occasion se
présente (ex: coupure réseau, serveur qui redémarre pile au moment du
clic) : le toggle doit maintenant afficher un message d'erreur explicite
("❌ Échec — ...") et **revenir à l'état précédent** dans l'éditeur,
au lieu d'afficher un faux message de succès comme avant.

## Priorité 3 — Connexions (même bug, même fix, pas testé en profondeur)

Le même pattern a été corrigé dans `routes/connexions.js`. Si tu as
l'occasion de désactiver/activer une connexion et de vérifier qu'elle
ne se réactive pas toute seule après une sauvegarde ailleurs, ce serait
un bon test complémentaire — sinon, la correction est symétrique à celle
des flux et le risque est faible.

## Ce qui a changé (pour information)

- `wfdToggleFlux` (client) met maintenant à jour `flux.isActive`
  directement sur l'objet en mémoire, en plus du registre séparé
  qu'il mettait déjà à jour avant.
- `routes/flows.js` et `routes/connexions.js` (serveur) : la sauvegarde
  en masse ne réinitialise plus `isActive` à `true` par défaut quand
  le champ n'est pas fourni explicitement — elle laisse la valeur
  existante en base intacte dans ce cas.
- `_apiFetch` vérifie maintenant le statut HTTP et lève une erreur
  explicite en cas d'échec (avant : silencieux).
