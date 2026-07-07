# Procédure de check — branche `fix-wfdListenerSimRun`

_Base : `main` — 1 commit, 07/07/2026_

Implémente le bouton "Envoyer la requête" du panneau "Tester ce
listener" (jusqu'ici sans effet, fonction manquante).

---

## Test principal

1. Ouvrir un nœud Listener avec une connexion configurée (n'importe
   quel type d'auth)
2. Cliquer "🧪 TESTER CE LISTENER" → "Afficher"
3. Vérifier que le payload JSON par défaut est pré-rempli
4. Cliquer "📡 Envoyer la requête vers localhost:2880"
5. **Attendu** :
   - Si le flux correspondant est actif → statut HTTP en vert (2xx),
     corps de la réponse affiché, et le workflow doit réellement
     s'exécuter (vérifiable dans le panneau Jobs/Live)
   - Si le flux n'est pas actif → probablement une erreur 404
     ("Aucun flux actif pour cette URL"), affichée en rouge

## Tests d'erreurs (cas limites)

- **JSON invalide** dans le payload → message d'erreur clair, pas de
  requête envoyée
- **Aucune connexion sélectionnée** sur le nœud → message d'erreur
  clair
- **Connexion sans le bon token/auth** → la requête part mais devrait
  recevoir un 401 (Authentification échouée) affiché en rouge

## Test des différents types d'authentification (si tu en as plusieurs à disposition)

Le type d'auth de la connexion (bearer / basic / apikey_header /
apikey_query / hmac / none) est géré automatiquement — pas besoin de
configuration supplémentaire côté testeur, juste vérifier qu'une
connexion de CHAQUE type que tu utilises réellement fonctionne.

## Ce qui a changé

- Nouvelle route serveur `POST /wfd/listener-test` (proxy vers le port
  2880, contourne le CORS).
- Nouvelle fonction cliente `wfdListenerSimRun`.
- Aucun fichier existant modifié en dehors de ces deux ajouts — risque
  de régression minimal sur le reste de l'application.
