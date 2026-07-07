# Audit de sauvegarde des champs — 07/07/2026

## Contexte

Suite à la découverte récurrente de champs non persistés (Fetch Saved
Search, Trigger event-type fields, AWS S3 objectKey — 3 bugs corrigés
dans la même session), passe systématique demandée par Farid : vérifier
si ce pattern est plus répandu ailleurs dans `wfd-config-panel.js`.

## Méthode

Comparaison automatisée, pour chaque famille de nœud, des champs
RENDUS (balises `<input>`/`<select>`/`<textarea>` avec un `id`) contre
les champs effectivement LUS dans la logique de sauvegarde — par
recherche de présence de chaîne (robuste aux variations de nom de
helper local : `g()`, `g2()`, `_readXxxConfig()`, etc.) plutôt qu'un
pattern regex rigide.

Deux passes :
1. **38 blocs directs** dans `buildCfgFields`/`sauvegarderConfig`
2. **11 paires déléguées** `_buildXxxPanel` / `_readXxxConfig` (pour
   create_asset, create_col, link_file, update_meta, acl, export_file,
   publish, notify_post, transcode, subflow, relate)

49 familles de nœuds au total.

## Résultat

**0 bug supplémentaire trouvé.**

6 signalements automatiques initiaux, tous vérifiés manuellement et
confirmés comme faux positifs :
- `sr-saved` (aps_search) — chargeur de preset, pas un champ de config
- `fetch-meta-field-add` (fetch) — sélecteur d'ajout de ligne
- `lsim-payload` (listener) — champ du testeur, transitoire
- `lk-import-file` (lookup) — input file, traité immédiatement au
  changement, jamais persisté
- `rename-test` (rename) — champ de preview/test
- `sim-payload`/`sim-template` (trigger) — champs du testeur,
  transitoires

`source` et `export` (blocs de sauvegarde sans rendu correspondant)
sont des noms de famille historiques/migrés (comme `source`→
`watchfolder`), gardés pour la compatibilité ascendante d'anciens flux
sauvegardés — pas des bugs actifs.

## Conclusion

Les 3 bugs déjà corrigés dans cette session (Fetch Saved Search,
Trigger, AWS S3 objectKey) étaient les seuls cas réels dans tout le
fichier. Pas de dette cachée supplémentaire sur ce plan à ce jour.
