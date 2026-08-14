// APS — commun-connexion.js — embarqué avec les fonctions générées.
// ================================================================
// Les en-têtes d'authentification, tirés d'une connexion EventBridge.
//
// ── POURQUOI PAS DANS LA CHARGE UTILE ───────────────────────────
// Une Lambda n'a pas accès aux connexions EventBridge comme un Task HTTP natif
// de Step Functions. La tentation est de passer le jeton dans l'entrée du Task :
// il serait alors lisible dans la DÉFINITION de la machine d'états, et dans
// l'historique de CHAQUE exécution. Deux endroits que beaucoup de monde peut
// lire, et qu'on n'expurge pas après coup.
//
// On lit donc le secret que la connexion fabrique elle-même dans Secrets
// Manager. Un seul magasin d'identifiants — celui que la soumission crée de
// toute façon — et rien à reprendre le jour où le jeton tourne.
//
// ── CE CODE APPARTIENT À LA CIBLE ───────────────────────────────
// Contrairement aux noyaux embarqués depuis server/engine-builder/, celui-ci
// n'a pas d'équivalent dans APS : le moteur natif a ses propres connexions en
// base. Il vit donc avec les fonctions, et non dans le moteur.
// ================================================================
'use strict';

const { EventBridgeClient, DescribeConnectionCommand } = require('@aws-sdk/client-eventbridge');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Le secret d'une connexion ne change pas d'une invocation à l'autre : on le
// garde entre deux appels à chaud. Sans ce cache, une fonction qui interroge dix
// essences paierait dix aller-retours vers Secrets Manager.
const cache = new Map();

async function entetesDe(connectionArn) {
  if (!connectionArn) return {};
  if (cache.has(connectionArn)) return cache.get(connectionArn);

  const region = connectionArn.split(':')[3];
  const nom    = connectionArn.split('/')[1];

  const conn = await new EventBridgeClient({ region })
    .send(new DescribeConnectionCommand({ Name: nom }));
  const brut = await new SecretsManagerClient({ region })
    .send(new GetSecretValueCommand({ SecretId: conn.SecretArn }));
  const val = JSON.parse(brut.SecretString || '{}');

  // La forme qu'EventBridge donne à ses secrets : la clé d'API sous
  // `api_key_auth_parameters`, les en-têtes d'invocation sous
  // `invocation_http_parameters.header_parameters`.
  const entetes = {};
  const api = val.api_key_auth_parameters;
  if (api && api.api_key_name) entetes[api.api_key_name] = api.api_key_value;
  const inv = val.invocation_http_parameters;
  ((inv && inv.header_parameters) || []).forEach(function (h) {
    if (h && h.key) entetes[h.key] = h.value;
  });

  cache.set(connectionArn, entetes);
  return entetes;
}

// Un client HTTP minimal, à la forme de celui du moteur (`get`, `post`, `put`)
// pour que le code porté se lise pareil des deux côtés.
function clientHttp(baseUrl, entetes) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  async function appeler(methode, chemin, corps) {
    const res = await fetch(base + chemin, {
      method: methode,
      headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, entetes),
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await res.text();
    let data; try { data = JSON.parse(texte); } catch (_) { data = texte; }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status + ' sur ' + chemin);
      err.statusCode = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  return {
    get:  (c)    => appeler('GET', c),
    post: (c, b) => appeler('POST', c, b),
    put:  (c, b) => appeler('PUT', c, b),
  };
}

module.exports = { entetesDe, clientHttp };
