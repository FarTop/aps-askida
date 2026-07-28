/**
 * config-sources.js — Accès aux ressources d'Administration pour le panneau
 *
 * Les natures qui consomment Administration (connexion, et plus tard ressource,
 * métadonnée…) passent par ici. Un seul point d'accès, avec CACHE : on ne veut
 * pas une requête par champ. Le panneau Config se branche ainsi sur les données
 * réelles (le paradigme : le Builder consomme Administration comme source).
 *
 * Aujourd'hui : les connexions (GET /api/connexions). On n'expose JAMAIS le
 * secret déchiffré (authValue) au sélecteur — seulement id/name/type/direction.
 */

const ConfigSources = (() => {

  let cacheConnexions = null;   // promesse mémorisée (une seule requête)

  function connexions() {
    if (cacheConnexions) return cacheConnexions;
    cacheConnexions = fetch('/api/connexions')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        // On ne garde que ce qu'un sélecteur doit montrer — jamais le secret.
        return (Array.isArray(list) ? list : []).map(function (c) {
          return { id: c.id, name: c.name, type: c.type,
                   direction: c.direction, endpoint: c.endpoint, isActive: c.isActive };
        });
      })
      .catch(function () { return []; });
    return cacheConnexions;
  }

  // Invalide le cache (après création/édition d'une connexion en Administration).
  function rafraichir() { cacheConnexions = null; }

  return { connexions, rafraichir };

})();

if (typeof window !== 'undefined') window.ConfigSources = ConfigSources;
if (typeof module !== 'undefined') module.exports = ConfigSources;
