// APS — server/lib/connexion-acces.js — créé le 2026-08-10
// ================================================================
// Traduit une Connexion + le schéma de sa plateforme (Platform.authSpec) en
// ce dont un appel HTTP a besoin : une URL de base et des en-têtes.
//
// Pourquoi ici et pas dans les handlers : l'authentification se construisait
// jusqu'ici à QUATRE endroits (builder-handler-http-request ×2, -verify,
// -wait) avec trois comportements légèrement différents — `authType: 'token'`
// produit un en-tête Bearer dans verify et wait, et ne fait RIEN dans
// http-request. Un schéma de plus multiplié par quatre copies, c'est la
// garantie d'une cinquième divergence.
//
// Le partage secret / non-secret est le point de conception (cf. la discussion
// du 2026-08-10) :
//   - le SCHÉMA appartient au produit           → Platform.authSpec
//   - le SECRET appartient à la connexion       → Connexion.authValueEnc (chiffré)
//   - les valeurs non secrètes (zone, App ID)   → Connexion.extraConfig.champs
// Toutes les connexions Make du monde envoient `Authorization: Token …` ; seuls
// le jeton et la zone changent. Décrire le schéma une fois évite d'allonger une
// liste fermée de types à chaque nouvel outil.
//
// La notation des gabarits est celle du reste d'APS — `{variable}` — pour
// qu'un lecteur n'ait pas un second dialecte à apprendre.
// ================================================================

'use strict';

function _interpoler(gabarit, valeurs) {
  return String(gabarit == null ? '' : gabarit)
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (brut, cle) =>
      (valeurs[cle] !== undefined && valeurs[cle] !== null ? String(valeurs[cle]) : brut));
}

// Valeurs disponibles pour l'interpolation : les champs non secrets rangés dans
// extraConfig.champs, plus le secret déchiffré, publié sous le nom que lui
// donne le schéma (`token` pour Make comme pour Iconik, mais rien n'y oblige).
function valeursDe(connexion, authSpec) {
  const spec = authSpec || {};
  const valeurs = Object.assign({}, (connexion && connexion.extraConfig && connexion.extraConfig.champs) || {});
  const champSecret = (spec.fields || []).find(f => f && f.secret);
  if (champSecret) valeurs[champSecret.name] = (connexion && connexion.authValue) || '';
  return valeurs;
}

// Champs requis par le schéma et non renseignés. Sert au bouton « Tester » et
// évite de partir vers une URL du genre `https://{zone}.make.com` — l'erreur
// que la journée du 2026-08-07 a montrée coûteuse quand un gabarit non résolu
// part tel quel dans une URL.
function champsManquants(connexion, authSpec) {
  const valeurs = valeursDe(connexion, authSpec);
  return ((authSpec || {}).fields || [])
    .filter(f => f && f.required)
    .filter(f => { const v = valeurs[f.name]; return v === undefined || v === null || String(v).trim() === ''; })
    .map(f => f.label || f.name);
}

// { baseUrl, headers }. `Connexion.baseUrl` l'emporte quand elle est
// renseignée : une instance peut vivre sur un domaine que le gabarit ne prévoit
// pas (bac à sable, proxy, installation sur site).
function construireAcces(connexion, authSpec) {
  const spec    = authSpec || {};
  const valeurs = valeursDe(connexion, authSpec);

  // L'URL saisie est interpolée elle aussi : certains protocoles portent le
  // secret DANS le chemin — le serveur MCP de Make attend
  // https://{zone}.make.com/mcp/u/{token}/stateless. Sans ça il faudrait taper
  // le jeton dans le champ URL, donc le stocker en clair. Écrit `{token}`, il
  // reste dans authValueEnc, chiffré, et n'est assemblé qu'à l'appel.
  const baseUrl = (connexion && connexion.baseUrl)
    ? _interpoler(connexion.baseUrl, valeurs).replace(/\/+$/, '')
    : _interpoler(spec.baseUrlPattern, valeurs).replace(/\/+$/, '');

  const headers = { 'Accept': 'application/json' };
  const auth = spec.auth || {};
  (auth.headers || []).forEach(h => {
    if (h && h.name) headers[h.name] = _interpoler(h.value, valeurs);
  });

  return { baseUrl, headers };
}

// Repli pour les connexions SANS plateforme rattachée : reproduit à l'identique
// ce que faisaient les handlers, pour qu'aucune connexion existante ne change
// de comportement. `token` est aligné sur `bearer` — c'était déjà le cas dans
// verify et wait, et un no-op silencieux dans http-request, ce qui n'était pas
// un choix mais un oubli.
function accesHerite(connexion) {
  const headers = {};
  const t = connexion && connexion.authType;
  const v = connexion && connexion.authValue;
  if ((t === 'bearer' || t === 'token') && v)   headers['Authorization'] = 'Bearer ' + v;
  else if (t === 'apikey_header' && v)          headers['X-API-Key']     = v;
  else if (t === 'basic' && v)                  headers['Authorization'] = 'Basic ' + Buffer.from(v).toString('base64');
  else if (t === 'iconik') {
    headers['App-ID']     = (connexion.extraConfig && connexion.extraConfig.appId) || '';
    headers['Auth-Token'] = v || '';
  }
  ((connexion && connexion.headers) || []).forEach(h => { if (h && h.key) headers[h.key] = h.value; });
  return { baseUrl: (connexion && connexion.baseUrl) ? String(connexion.baseUrl).replace(/\/+$/, '') : '', headers };
}

// Point d'entrée unique : avec schéma si la connexion pointe vers une
// plateforme qui en déclare un, comportement d'origine sinon.
function acces(connexion, authSpec) {
  return (authSpec && (authSpec.auth || authSpec.baseUrlPattern))
    ? construireAcces(connexion, authSpec)
    : accesHerite(connexion);
}

module.exports = { acces, construireAcces, accesHerite, champsManquants, valeursDe };
