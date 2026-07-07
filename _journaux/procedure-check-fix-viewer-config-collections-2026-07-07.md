# Procédure de check — branche `fix-viewer-config-collections`

_Base : `main` — 1 commit, 07/07/2026_

Corrige le mode "Configuration" du Viewer qui ne chargeait jamais les
données réelles (lisait un vestige localStorage jamais alimenté par
l'architecture actuelle). Charge maintenant depuis le snapshot Iconik
réel en base (même route que le reste d'APS).

---

## Prérequis

Il faut qu'un environnement ait un snapshot Iconik synchronisé
(Settings → Sync DS) pour que ce test soit concluant — sinon le mode
Configuration affichera toujours "Aucune collection" (comportement
normal dans ce cas, pas un bug).

## Test principal

1. Ouvrir la page Viewer, aller dans le mode "Configuration"
2. Cliquer "🎬 Démo" ou "🌐 Global"
3. **Attendu** : l'arborescence de collections réelles (celles de ton
   environnement Iconik synchronisé) doit s'afficher, pas vide
4. Cliquer sur un nœud de l'arborescence → la fiche doit s'ouvrir avec
   les équipes ayant accès (si des accès sont configurés sur cette
   collection dans Iconik)

## Test — plusieurs environnements

Si tu as plusieurs environnements avec des snapshots différents :
1. Vérifier que c'est bien l'environnement **par défaut** qui se
   charge (celui marqué comme tel dans Settings → Environnements)

## Test — badge organisation (en haut à gauche)

Le badge affiche maintenant le nom de l'environnement APS (ex: "QA |
ASKIDA") plutôt que l'ancien "organisationName" du localStorage — ce
n'est pas exactement la même donnée conceptuellement (nom
d'environnement vs nom d'organisation Iconik). Dis-moi si ça te
convient ou si tu préfères un autre libellé ici.

## Ce qui n'est PAS corrigé (sujet à part, noté pour plus tard)

Le bouton "✓ Importer dans Collections" (mode Designer) écrit encore
le résultat dans localStorage — ce mécanisme d'écriture a le même
problème de fond (n'alimente aucune vraie donnée consultée par
Settings) mais nécessiterait une vraie route serveur de création,
sujet distinct du chargement traité ici.

## Ce qui a changé

- `loadData()` devient asynchrone, va chercher les données réelles via
  `/api/environments/credentials` puis `/api/ikon/snapshot/:envSlug`
  au lieu de lire localStorage.
- `visGetColPaths()` accepte le champ `nom` (utilisé par l'API) en
  plus de `name`.
- `cfg_load()` et `dsn_doImport()` (les 2 appelants) attendent
  correctement la fin du chargement avant de continuer.
