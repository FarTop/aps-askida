# Procédure de check — branche `buildcfgfields-cleanup` (lot intermédiaire)

_Base : `main` (après merge des 3 branches précédentes) — 23 commits, 07/07/2026_

But : premier gros lot de nettoyage CSS de `buildCfgFields` (le panneau de
configuration principal). Toutes les familles de nœuds SAUF `lookup` et
`http_sequence` (les deux derniers gros morceaux, pas encore traités).

---

## Priorité 1 — Le seul vrai correctif de comportement dans ce lot

### AWS S3 → opération "Artworks → S3"
**Avant le fix** : `awsArtAddRow`, `awsArtRemoveRow` et `awsArtReadRows`
étaient appelées mais n'existaient nulle part → tout plantait.

**Test** :
1. Nœud AWS S3, choisir l'opération "Artworks → S3" (onglet Artworks)
2. Cliquer "+ Ajouter un artwork" → une nouvelle ligne doit apparaître
3. Remplir les 3 champs (Nom Iconik / Champ MD / Variable)
4. Cliquer "×" sur une ligne → elle doit disparaître (sauf s'il n'en
   reste qu'une, elle doit être protégée)
5. Fermer/rouvrir le nœud → les artworks doivent être conservés
6. Vérifier que les ports du nœud sont bien présents après une modif

---

## Priorité 2 — Zones à mécanisme JS modifié (toggles, onglets)

Pour chacune, le principe est le même : ouvrir le nœud, vérifier l'état
initial, cliquer/changer une option, vérifier que l'affichage suit, puis
fermer/rouvrir pour vérifier la persistance.

| Nœud | Ce qui a un mécanisme à tester |
|---|---|
| **HTTP (Action/Requête)** | Les 4 onglets (Action/Simple/Pour chaque/Vérifier), bascule JSON brut ↔ Builder du body, tags de variables (ajout/étendu), headers additionnels |
| **Gate** | Les 3 boutons Mode (Throttle/Délai/Pause) |
| **Timer** | Les 3 boutons Type (Intervalle/Planification/Une fois), fréquence cron, jours de la semaine |
| **Fetch (Récupérer)** | Les 4 boutons "Que voulez-vous récupérer" (Asset/Collection/Métadonnées/Saved Search), cases à cocher métadonnées |
| **Trigger (Déclencheur)** | Le select "Événement déclencheur" (doit afficher/cacher les bons champs selon l'événement choisi), panneau "Tester ce déclencheur" (afficher/masquer) |
| **Listener** | Panneau "Tester ce listener" (afficher/masquer) |
| **aps_search (Recherche APS)** | Ajout/suppression de blocs et critères, critère sur champ date avec opérateur "entre" |
| **watchfolder** | Type de média (bascule le champ Format sidecar) |
| **rename** | Mode (Règles/Template/Les deux) |
| **id_generator** | Type d'identifiant (bascule Longueur/Préfixe) |

## Priorité 3 — Balayage visuel large (changement mécanique, risque faible)

Ouvrir rapidement chacun de ces nœuds et vérifier que rien ne semble
cassé visuellement (alignements, couleurs, tailles) :
`action` (Organiser), `transform`, `notification`, `workflow_history`,
`wait_for`, `decision`, `checker`, `set_var`, `manual`.

---

## Bugs trouvés en cours de route (notés, PAS corrigés — sauf AWS S3 Artworks ci-dessus)

Ces bugs sont **pré-existants**, indépendants de ce chantier de nettoyage
CSS. Ils ne nécessitent aucune action de ta part pour la validation de ce
lot — listés ici pour mémoire, à traiter séparément si tu le souhaites :

1. **Fetch → Saved Search** : si aucune saved search n'est disponible
   (champ texte libre affiché au lieu du menu déroulant), l'ID tapé
   manuellement n'est jamais sauvegardé (la sauvegarde lit toujours le
   `<select>`, même caché).
2. **Trigger → Événement déclencheur** : changer l'événement ne
   bascule pas les champs "Intervalle de polling" et "Saved Search"
   (contrairement aux 8 autres champs conditionnels qui fonctionnent).
3. **`wfdListenerSimRun`** : bouton "Envoyer la requête" du testeur de
   Listener — fonction manquante, plante au clic.
4. **`wfdTriggerSimRun`** : bouton "Exécuter ce flux avec ce payload"
   du testeur de Trigger — fonction manquante, plante au clic.
5. **`wfdValidateManualPayload`** : bouton "Valider le JSON" du nœud
   Manuel — fonction manquante, plante au clic.
6. **`wfdFetchSubTypeEx`** : fonction dupliquée jamais appelée (code
   mort sans risque, `wfdFetchSubType` est la vraie).

Les points 3, 4 et 5 semblent être une même catégorie de fonctionnalité
("boutons d'action") jamais terminée à travers plusieurs types de nœuds.

## Ce qui n'a pas encore été touché

`lookup` et `http_sequence` (dans `buildCfgFields`) — les deux derniers
gros morceaux, à traiter dans une prochaine session.
