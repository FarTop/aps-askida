/**
 * s3-service.js — Service S3 du Builder (moteur natif, première pierre)
 *
 * Capacité S3 autonome, INDÉPENDANTE du moteur WFD (qui signe en HTTP manuel).
 * S'appuie sur le SDK AWS officiel (@aws-sdk/client-s3), choisi pour ouvrir le
 * plus large champ des possibles : dépôt aujourd'hui (exécution du Packager),
 * navigation de buckets demain (façon S3 Browser : listing paginé, préfixes,
 * URLs présignées). Une dépendance, deux chantiers.
 *
 * Le service résout une connexion S3 de l'organisation (par son id), déchiffre
 * ses credentials via le module crypto partagé, et n'expose jamais les secrets.
 *
 * Il ne dépend pas du code moteur WFD : le Builder aura son propre moteur, et
 * ce service en est la première brique réutilisable.
 */

'use strict';

const { S3Client, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { decrypt } = require('./crypto');

// Construit un client S3 à partir d'une connexion (objet Prisma Connexion).
// Renvoie { client, bucket, region } ou lève une erreur explicite.
function _clientDepuisConnexion(conn) {
  if (!conn) throw new Error('connexion S3 introuvable');
  if (conn.type !== 'aws_s3' && conn.authType !== 'aws_s3') {
    throw new Error('la connexion n\'est pas de type AWS S3');
  }
  // Credentials : JSON chiffré dans authValueEnc { key, secret, region, bucket }.
  let creds = {};
  try { creds = JSON.parse(decrypt(conn.authValueEnc) || '{}'); } catch (_) { creds = {}; }
  const accessKeyId     = creds.key    || '';
  const secretAccessKey = creds.secret || '';
  const region          = creds.region || 'eu-north-1';
  const bucket          = creds.bucket || '';
  if (!accessKeyId || !secretAccessKey) throw new Error('credentials AWS manquants');
  if (!bucket) throw new Error('bucket S3 manquant');

  const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return { client, bucket, region };
}

/**
 * Dépose un objet sur S3. Utilisé par l'exécution du Packager.
 * @param {object} conn     connexion S3 (Prisma)
 * @param {string} cle      clé de destination (chemin dans le bucket)
 * @param {Buffer|string} corps  contenu
 * @param {string} [contentType]
 * @returns {Promise<{ ok, url }>}
 */
async function deposer(conn, cle, corps, contentType) {
  const { client, bucket, region } = _clientDepuisConnexion(conn);
  const cleNette = String(cle || '').replace(/^\/+/, '');
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: cleNette, Body: corps,
    ContentType: contentType || 'application/octet-stream'
  }));
  const url = 'https://s3.' + region + '.amazonaws.com/' + bucket + '/' + cleNette;
  return { ok: true, url: url };
}

/**
 * Liste les objets d'un bucket sous un préfixe (navigation façon S3 Browser).
 * Gère la pagination via continuation token.
 * @param {object} conn     connexion S3
 * @param {string} [prefixe]
 * @param {string} [token]  jeton de continuation (page suivante)
 * @returns {Promise<{ objets: [{cle, taille, modifie}], dossiers: [prefixe], suite: token|null }>}
 */
async function lister(conn, prefixe, token) {
  const { client, bucket } = _clientDepuisConnexion(conn);
  const res = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefixe || '',
    Delimiter: '/',                 // regroupe par "dossiers" (préfixes communs)
    ContinuationToken: token || undefined
  }));
  const objets = (res.Contents || []).map(function (o) {
    return { cle: o.Key, taille: o.Size, modifie: o.LastModified };
  });
  const dossiers = (res.CommonPrefixes || []).map(function (p) { return p.Prefix; });
  return {
    objets: objets,
    dossiers: dossiers,
    suite: res.IsTruncated ? res.NextContinuationToken : null
  };
}

/**
 * Métadonnées d'un objet (existence, taille, type). Utile pour vérifier un
 * dépôt ou prévisualiser.
 */
async function tete(conn, cle) {
  const { client, bucket } = _clientDepuisConnexion(conn);
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: String(cle || '').replace(/^\/+/, '') }));
    return { existe: true, taille: res.ContentLength, type: res.ContentType };
  } catch (e) {
    if (e && (e.name === 'NotFound' || e.$metadata && e.$metadata.httpStatusCode === 404)) {
      return { existe: false };
    }
    throw e;
  }
}

module.exports = { deposer, lister, tete };
