/**
 * iconik-service.js — Service Iconik du Builder (moteur natif)
 *
 * Capacité « parler à Iconik » AUTONOME, indépendante du moteur WFD (qui a la
 * sienne enfouie dans wfd-engine-express). Même démarche que le service S3 :
 * extraire une capacité réutilisable pour que le Builder exécute ses nœuds sans
 * se coupler au proto.
 *
 * Résout un environnement Iconik (par org / par id), déchiffre le token via le
 * module crypto partagé, expose un client HTTP simple (App-ID / Auth-Token) et
 * une COLLECTE : à partir d'une collection, produire la liste des fichiers
 * (essences) que le Packager/Executeur consommera.
 *
 * La navigation Iconik réelle : collection -> assets (content) -> file_sets ->
 * files. On aplatit ça en une liste { nom, assetId, ... } d'essences.
 */

'use strict';

const https = require('https');
const http  = require('http');
const { decrypt } = require('./crypto');

// Construit un client HTTP Iconik à partir de credentials { baseUrl, appId, token }.
function _client(creds) {
  const request = (method, ep, body) => new Promise((resolve, reject) => {
    const url     = new URL(ep, creds.baseUrl || 'https://app.iconik.io');
    const lib     = url.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'App-ID'      : creds.appId || '',
      'Auth-Token'  : creds.token || '',
      'Content-Type': 'application/json',
      'Accept'      : 'application/json'
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = lib.request({
      hostname: url.hostname,
      port    : url.port || (url.protocol === 'https:' ? 443 : 80),
      path    : url.pathname + url.search,
      method, headers
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (res.statusCode >= 400) {
            const err = new Error('Iconik ' + method + ' ' + ep + ' -> ' + res.statusCode);
            err.statusCode = res.statusCode; err.body = parsed;
            reject(err);
          } else resolve(parsed);
        } catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
  return {
    get:  (ep)       => request('GET', ep, null),
    post: (ep, body) => request('POST', ep, body)
  };
}

// Résout les credentials d'un environnement Prisma (token déchiffré).
function credentialsDepuisEnv(env) {
  if (!env) throw new Error('environnement Iconik introuvable');
  const token = decrypt(env.tokenEnc);
  if (!env.appId || !token) throw new Error('credentials Iconik incomplets (appId/token)');
  return { baseUrl: env.baseUrl || 'https://app.iconik.io', appId: env.appId, token: token };
}

/**
 * Collecte les fichiers (essences) d'une collection Iconik.
 * Navigation : collection -> content (assets) -> file_sets/files de chaque asset.
 * Aplatit en une liste { nom, assetId, fileId, taille?, url? } consommable par
 * le Packager (qui reconnaît les rôles via le nom).
 *
 * @param {object} env          environnement Iconik (Prisma)
 * @param {string} collectionId
 * @param {object} [options]    { recursif?: bool } — descendre dans sous-collections
 * @returns {Promise<Array>} liste d'essences
 */
async function collecterEssences(env, collectionId, options) {
  const creds = credentialsDepuisEnv(env);
  const client = _client(creds);
  const recursif = !!(options && options.recursif);

  // 1. Contenu de la collection (assets + éventuelles sous-collections).
  const contenu = await client.get('/API/assets/v1/collections/' + collectionId + '/contents/?per_page=500');
  const objets = (contenu && contenu.objects) || [];

  const essences = [];
  for (const o of objets) {
    if (o.object_type === 'assets' || o.type === 'asset') {
      const assetId = o.id;
      // 2. Fichiers de l'asset.
      try {
        const fichiers = await client.get('/API/files/v1/assets/' + assetId + '/files/?per_page=200');
        (fichiers.objects || []).forEach(function (f) {
          essences.push({
            nom: f.name || f.original_name || '',
            assetId: assetId,
            fileId: f.id,
            taille: f.size,
            url: f.url || null
          });
        });
      } catch (e) {
        // Un asset sans fichiers accessibles n'interrompt pas la collecte.
      }
    } else if (recursif && (o.object_type === 'collections' || o.type === 'collection')) {
      const sous = await collecterEssences(env, o.id, options);
      essences.push.apply(essences, sous);
    }
  }
  return essences;
}

module.exports = { credentialsDepuisEnv, collecterEssences, _client };
