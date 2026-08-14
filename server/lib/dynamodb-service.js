/**
 * dynamodb-service.js — Les tables qui survivent à la mission — créé le 2026-08-14
 *
 * Deux tables, et elles ne sont pas de même nature :
 *
 *   aps-registry   objet → identifiant. Un REGISTRE : il rend le MÊME
 *                  identifiant à un objet déjà connu, ce qui rend l'attribution
 *                  idempotente. D'où l'index sur `assetId` — sans lui, un
 *                  workflow rejoué fabrique un second identifiant pour la même
 *                  collection, et personne ne s'en aperçoit avant que le
 *                  partenaire ne reçoive deux fiches.
 *   aps-counter    (portée, clé) → valeur. La numérotation de fratrie.
 *
 * ── UNE TABLE VIDE N'EST PAS UNE TABLE NEUTRE ───────────────────
 * C'est le point qui compte le plus dans ce fichier. Si le client porte déjà
 * des identifiants attribués par APS — et c'est le cas —, une table qui repart
 * de zéro les redistribuera. Semer fait donc partie de la soumission, pas d'une
 * procédure d'exploitation qu'on écrira plus tard.
 *
 * L'amorçage est IDEMPOTENT : on n'écrit que ce qui manque. Relancer une
 * soumission ne réécrit rien et n'écrase aucune attribution faite depuis.
 */

'use strict';

const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { decrypt } = require('./crypto');

const REGISTRE = 'aps-registry';
const COMPTEUR = 'aps-counter';

function _client(conn) {
  if (!conn) throw new Error('connexion AWS introuvable');
  const champs = (conn.extraConfig && conn.extraConfig.champs) || {};
  let secret = '';
  try { secret = decrypt(conn.authValueEnc) || ''; } catch (_) { secret = ''; }
  if (!champs.region || !champs.accessKeyId || !secret) {
    throw new Error('identifiants AWS incomplets sur la connexion');
  }
  const brut = new DynamoDBClient({
    region: champs.region,
    credentials: { accessKeyId: champs.accessKeyId, secretAccessKey: secret },
  });
  return { brut, doc: DynamoDBDocumentClient.from(brut) };
}

// La forme des deux tables, déclarée ici plutôt que devinée à la création :
// c'est ce que le plan affiche avant de soumettre.
const FORMES = {
  [REGISTRE]: {
    AttributeDefinitions: [
      { AttributeName: 'bayardId', AttributeType: 'S' },
      { AttributeName: 'assetId',  AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'bayardId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [{
      IndexName: 'assetId-index',
      KeySchema: [{ AttributeName: 'assetId', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    }],
  },
  [COMPTEUR]: {
    AttributeDefinitions: [
      { AttributeName: 'scope', AttributeType: 'S' },
      { AttributeName: 'key',   AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'scope', KeyType: 'HASH' },
      { AttributeName: 'key',   KeyType: 'RANGE' },
    ],
  },
};

/** La table existe-t-elle ? Renvoie son état ou null. */
async function decrire(conn, nom) {
  const { brut } = _client(conn);
  try {
    const res = await brut.send(new DescribeTableCommand({ TableName: nom }));
    return { nom: nom, etat: res.Table.TableStatus, elements: res.Table.ItemCount,
             arn: res.Table.TableArn };
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') return null;
    throw e;
  }
}

/**
 * Crée la table si elle manque, et attend qu'elle soit utilisable — une table
 * en cours de création refuse les écritures, et semer juste après créer est
 * exactement ce qu'on veut faire.
 */
async function assurerTable(conn, nom) {
  const deja = await decrire(conn, nom);
  if (deja) return { arn: deja.arn, creee: false, elements: deja.elements };

  const forme = FORMES[nom];
  if (!forme) throw new Error('table inconnue : ' + nom);
  const { brut } = _client(conn);
  const res = await brut.send(new CreateTableCommand(Object.assign({
    TableName: nom,
    // À la demande : ces tables sont sollicitées par rafales, quelques fois par
    // jour. Provisionner de la capacité coûterait sans rien servir.
    BillingMode: 'PAY_PER_REQUEST',
  }, forme)));
  await waitUntilTableExists({ client: brut, maxWaitTime: 120 }, { TableName: nom });
  return { arn: res.TableDescription.TableArn, creee: true, elements: 0 };
}

// ── Semer ───────────────────────────────────────────────────────

/**
 * Verse dans la table le registre que porte APS. IDEMPOTENT : la condition
 * `attribute_not_exists` fait qu'une ligne déjà présente n'est pas réécrite —
 * relancer une soumission n'écrase donc aucune attribution faite depuis.
 * @returns {{ semees, deja }}
 */
async function semerRegistre(conn, lignes) {
  const { doc } = _client(conn);
  let semees = 0, deja = 0;
  for (const l of (lignes || [])) {
    if (!l || !l.bayardId) continue;
    try {
      await doc.send(new PutCommand({
        TableName: REGISTRE,
        Item: {
          bayardId: String(l.bayardId), assetId: l.assetId || '',
          assetType: l.assetType || 'collection', orgId: l.orgId || 'default',
          createdAt: (l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt || Date.now())).toISOString(),
          // D'où vient la ligne. Utile le jour où quelqu'un se demande si un
          // identifiant a été attribué par APS ou par la cible.
          semeParAps: true,
        },
        ConditionExpression: 'attribute_not_exists(bayardId)',
      }));
      semees++;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') { deja++; continue; }
      throw e;
    }
  }
  return { semees, deja };
}

/** Idem pour les compteurs. */
async function semerCompteurs(conn, lignes) {
  const { doc } = _client(conn);
  let semees = 0, deja = 0;
  for (const l of (lignes || [])) {
    if (!l || !l.scope) continue;
    try {
      await doc.send(new PutCommand({
        TableName: COMPTEUR,
        Item: {
          scope: String(l.scope), key: String(l.key || ''),
          value: Number(l.value) || 0,
          updatedAt: (l.updatedAt instanceof Date ? l.updatedAt : new Date(l.updatedAt || Date.now())).toISOString(),
          semeParAps: true,
        },
        ConditionExpression: 'attribute_not_exists(#s)',
        ExpressionAttributeNames: { '#s': 'scope' },
      }));
      semees++;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') { deja++; continue; }
      throw e;
    }
  }
  return { semees, deja };
}

module.exports = { decrire, assurerTable, semerRegistre, semerCompteurs, REGISTRE, COMPTEUR, FORMES };
