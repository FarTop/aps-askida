/**
 * eventbridge-service.js — Connexions EventBridge — créé le 2026-08-14
 *
 * Une machine d'états Step Functions n'appelle pas une API tierce avec des
 * en-têtes écrits dans sa définition : elle passe par une *connexion*
 * EventBridge, qui garde les secrets dans Secrets Manager et les injecte à
 * l'appel. Sans connexion, aucun `http:invoke` ne part.
 *
 * Elles étaient saisies à la main dans la console le 2026-08-13, à raison de
 * deux essais chacune. Ce service les DÉRIVE des fiches de Connexions d'APS,
 * qui portent déjà les mêmes secrets.
 *
 * ── LA DÉRIVATION, PLUTÔT QUE LA RESSAISIE ──────────────────────
 * `connexion-acces.js` sait déjà calculer `{ baseUrl, headers }` pour n'importe
 * quelle connexion, à partir du schéma déclaré par sa plateforme. Une connexion
 * EventBridge n'est rien d'autre que ces en-têtes, rangés autrement. On réutilise
 * donc ce calcul au lieu d'en écrire un second : le jour où un en-tête d'Iconik
 * change, il change à un seul endroit.
 *
 * ── LE CHOIX DE L'EN-TÊTE « CLÉ » ───────────────────────────────
 * EventBridge impose de nommer un type d'autorisation — API_KEY, BASIC ou
 * OAUTH — là où APS ne connaît qu'une liste d'en-têtes. On désigne donc UN
 * en-tête comme la clé (`Authorization`, puis `Auth-Token`, puis `X-API-Key`)
 * et les autres partent en en-têtes d'invocation. Iconik en a deux — `App-ID`
 * et `Auth-Token` — et c'est exactement le partage fait à la main le 13.
 *
 * Tous sont marqués confidentiels : AWS cesse alors de les réafficher, ce qui
 * est le comportement voulu pour un jeton comme pour un identifiant d'app.
 */

'use strict';

const {
  EventBridgeClient,
  CreateConnectionCommand,
  UpdateConnectionCommand,
  DescribeConnectionCommand,
  ListConnectionsCommand
} = require('@aws-sdk/client-eventbridge');
const { decrypt } = require('./crypto');
const Acces = require('./connexion-acces.js');

// En-têtes que l'on ne transmet pas : ils ne portent aucune identité et AWS
// pose déjà les siens.
const IGNORES = ['accept', 'content-type', 'user-agent'];

// Ordre de préférence pour désigner l'en-tête qui tiendra lieu de clé d'API.
const CANDIDATS_CLE = ['authorization', 'auth-token', 'x-api-key', 'api-key'];

// ── Client ──────────────────────────────────────────────────────

// `connAws` est la connexion APS de type aws_sigv4 (celle qui porte la clé du
// compte). À ne pas confondre avec `connSource`, la fiche dont on recopie les
// secrets — deux « connexions » de nature différente dans la même fonction.
function _clientDepuisConnexion(connAws) {
  if (!connAws) throw new Error('connexion AWS introuvable');
  const champs = (connAws.extraConfig && connAws.extraConfig.champs) || {};
  const region = champs.region || '';
  const accessKeyId = champs.accessKeyId || '';
  let secretAccessKey = '';
  try { secretAccessKey = decrypt(connAws.authValueEnc) || ''; } catch (_) { secretAccessKey = ''; }

  if (!region)          throw new Error('région AWS manquante sur la connexion');
  if (!accessKeyId)     throw new Error('Access Key ID manquant sur la connexion');
  if (!secretAccessKey) throw new Error('Secret Access Key manquant sur la connexion');

  return {
    client: new EventBridgeClient({ region, credentials: { accessKeyId, secretAccessKey } }),
    region: region,
    compte: champs.compte || ''
  };
}

// ── Dérivation (pure, sans réseau — donc lisible avant d'être soumise) ──

/**
 * Traduit une fiche de Connexion APS en paramètres de connexion EventBridge.
 * Ne contacte personne : c'est ce qui permet d'AFFICHER le plan avant de le
 * soumettre.
 *
 * @param {object} connSource  connexion APS (Prisma), secret encore chiffré
 * @param {object} authSpec    Platform.authSpec de sa plateforme
 * @returns {{ nomCle, valeurCle, entetes: [{cle, valeur}], baseUrl }}
 */
function parametresDepuisConnexion(connSource, authSpec) {
  if (!connSource) throw new Error('connexion source introuvable');

  const enClair = Object.assign({}, connSource, {
    authValue: connSource.authValueEnc ? decrypt(connSource.authValueEnc) : '',
    headers: (connSource.extraConfig && connSource.extraConfig.headers) || []
  });
  const calcul = Acces.acces(enClair, authSpec);

  const retenus = Object.keys(calcul.headers || {})
    .filter(function (n) { return IGNORES.indexOf(n.toLowerCase()) === -1; })
    .filter(function (n) { return String(calcul.headers[n] || '').trim() !== ''; });

  if (!retenus.length) throw new Error('aucun en-tête d\'authentification à transmettre');

  // La clé : le premier candidat connu, sinon le premier en-tête venu. Une
  // connexion EventBridge exige un type d'autorisation ; ne rien désigner
  // n'est pas une option offerte par l'API.
  let nomCle = retenus.find(function (n) { return CANDIDATS_CLE.indexOf(n.toLowerCase()) !== -1; });
  if (!nomCle) nomCle = retenus[0];

  return {
    nomCle: nomCle,
    valeurCle: calcul.headers[nomCle],
    entetes: retenus.filter(function (n) { return n !== nomCle; })
                    .map(function (n) { return { cle: n, valeur: calcul.headers[n] }; }),
    baseUrl: calcul.baseUrl
  };
}

// Rend les paramètres lisibles sans divulguer les secrets — pour le plan, les
// journaux, et l'écran. Un secret qu'on affiche « pour vérifier » finit dans
// une capture d'écran.
function masquer(params) {
  function m(v) {
    const s = String(v == null ? '' : v);
    if (s.length <= 8) return '••••';
    return s.slice(0, 4) + '…' + s.slice(-4) + ' (' + s.length + ' car.)';
  }
  return {
    nomCle: params.nomCle,
    valeurCle: m(params.valeurCle),
    entetes: (params.entetes || []).map(function (h) { return { cle: h.cle, valeur: m(h.valeur) }; }),
    baseUrl: params.baseUrl
  };
}

// ── Lecture ─────────────────────────────────────────────────────

/** ARN et état d'une connexion EventBridge, par nom. null si elle n'existe pas. */
async function decrire(connAws, nom) {
  const { client } = _clientDepuisConnexion(connAws);
  try {
    const res = await client.send(new DescribeConnectionCommand({ Name: nom }));
    return { nom: res.Name, arn: res.ConnectionArn, etat: res.ConnectionState,
             modifiee: res.LastModifiedTime };
  } catch (e) {
    if (e && (e.name === 'ResourceNotFoundException')) return null;
    throw e;
  }
}

/** Toutes les connexions du compte : [{ nom, arn, etat }]. */
async function lister(connAws) {
  const { client } = _clientDepuisConnexion(connAws);
  const sortie = [];
  let jeton;
  do {
    const res = await client.send(new ListConnectionsCommand({ NextToken: jeton, Limit: 100 }));
    (res.Connections || []).forEach(function (c) {
      sortie.push({ nom: c.Name, arn: c.ConnectionArn, etat: c.ConnectionState });
    });
    jeton = res.NextToken;
  } while (jeton);
  return sortie;
}

// ── Écriture ────────────────────────────────────────────────────

/**
 * Crée la connexion sous ce nom, ou remplace ses paramètres si elle existe.
 *
 * @returns {Promise<{ arn, cree, uuid }>} `uuid` est le suffixe attribué par
 *   AWS : il ne se devine pas, change à chaque compte, et c'est lui qu'attend
 *   `scripts/emettre-asl.js`.
 */
async function deployer(connAws, nom, params, description) {
  const { client } = _clientDepuisConnexion(connAws);

  const authParameters = {
    ApiKeyAuthParameters: { ApiKeyName: params.nomCle, ApiKeyValue: params.valeurCle }
  };
  if (params.entetes && params.entetes.length) {
    authParameters.InvocationHttpParameters = {
      HeaderParameters: params.entetes.map(function (h) {
        return { Key: h.cle, Value: h.valeur, IsValueSecret: true };
      })
    };
  }

  const existante = await decrire(connAws, nom);
  const commande = existante
    ? new UpdateConnectionCommand({ Name: nom, AuthorizationType: 'API_KEY', AuthParameters: authParameters })
    : new CreateConnectionCommand({ Name: nom, Description: description || undefined,
                                    AuthorizationType: 'API_KEY', AuthParameters: authParameters });

  const res = await client.send(commande);
  const arn = res.ConnectionArn;
  return { arn: arn, cree: !existante, uuid: String(arn || '').split('/').pop() };
}

module.exports = {
  parametresDepuisConnexion, masquer,
  decrire, lister, deployer
};
