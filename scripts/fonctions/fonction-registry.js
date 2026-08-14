// APS — aps-registry — fonction générée.
// ================================================================
// Attribue un identifiant unique à un objet, et s'en souvient.
//
// ── LA SEULE DES CINQ QUI PORTE UN ÉTAT ─────────────────────────
// Les autres fonctions sont pilotées par une ressource d'APS qui voyage en
// entrée ; celle-ci a besoin de SE SOUVENIR, d'un run à l'autre et d'une année
// à l'autre. C'est ce qui la rend différente, et c'est ce qui a commandé
// l'arbitrage du 2026-08-14 : l'état part chez le client, en DynamoDB. Une
// fonction qui rappellerait APS pour connaître un identifiant s'arrêterait le
// jour où la mission s'arrête.
//
// ── UN REGISTRE, PAS UN COMPTEUR ────────────────────────────────
// La distinction m'avait échappé et elle est structurante. Ce n'est pas « le
// prochain numéro » : c'est une table de correspondance objet → identifiant.
// Elle rend le MÊME identifiant si l'objet en a déjà un — ce qui rend
// l'attribution idempotente, donc un workflow rejoué ne fabrique pas un second
// identifiant pour la même collection. Sans l'index sur `assetId`, cette
// propriété disparaît.
//
// ── LA COLLISION SE TRAITE MIEUX ICI QU'EN BASE ─────────────────
// Le moteur d'APS lit puis écrit (`bayardIdFor` : findUnique, puis create), ce
// qui laisse une fenêtre entre les deux. DynamoDB permet une écriture
// CONDITIONNELLE — `attribute_not_exists(bayardId)` — qui est atomique : deux
// runs simultanés ne peuvent pas se voir attribuer le même identifiant. On tire
// donc parti de la cible plutôt que de recopier une faiblesse.
//
// Le FORMAT, lui, reste identique des deux côtés : builder-identifiants.js est
// embarqué tel quel. Deux formats différents sur le même champ Iconik, c'est
// exactement la faute que le handler d'origine signale avoir déjà commise entre
// create_tree et aps.registry.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { objectId, objectType, orgId, idType, idLength, idPrefix, outputType }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { id, existait }
// ================================================================
'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { genererIdentifiant } = require('./builder-identifiants.js');

const TABLE = process.env.APS_TABLE_REGISTRY || 'aps-registry';
const INDEX = 'assetId-index';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async function (evenement) {
  const e = evenement || {};
  const type    = e.idType || 'numeric';
  const length  = Math.max(1, Math.min(64, parseInt(e.idLength, 10) || 8));
  const prefix  = e.idPrefix || '';
  const orgId   = e.orgId || 'default';
  const objectId   = e.objectId || '';
  const objectType = e.objectType || (objectId ? 'collection' : 'asset');

  // 1. L'objet a-t-il déjà son identifiant ? C'est la question qui rend
  //    l'attribution rejouable — et la seule raison d'être de l'index.
  if (objectId) {
    const deja = await doc.send(new QueryCommand({
      TableName: TABLE, IndexName: INDEX,
      KeyConditionExpression: 'assetId = :a',
      ExpressionAttributeValues: { ':a': objectId },
      Limit: 1,
    }));
    if (deja.Items && deja.Items.length) {
      const id = deja.Items[0].bayardId;
      return { id: e.outputType === 'integer' ? parseInt(id, 10) : id, existait: true };
    }
  }

  // 2. Sinon on en fabrique un, et on l'inscrit SOUS CONDITION. Dix tentatives,
  //    comme le moteur — au-delà, ce n'est plus une collision malchanceuse mais
  //    un format trop étroit pour le volume, et il vaut mieux le dire.
  let id = genererIdentifiant(type, length, prefix);
  for (let essai = 0; essai < 10; essai++) {
    try {
      await doc.send(new PutCommand({
        TableName: TABLE,
        Item: {
          bayardId: String(id), assetId: objectId, assetType: objectType,
          orgId: orgId, createdAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(bayardId)',
      }));
      return { id: e.outputType === 'integer' ? parseInt(id, 10) : id, existait: false };
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      id = genererIdentifiant(type, length, prefix);
    }
  }
  throw new Error('aps-registry : dix collisions d\'affilée sur un identifiant de '
                + length + ' caractères — le format est trop étroit pour le volume');
};
