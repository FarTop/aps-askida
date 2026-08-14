// APS — commun-etat.js — embarqué avec les fonctions générées.
// ================================================================
// LES DEUX ÉTATS QUI PARTENT CHEZ LE CLIENT.
//
//   registre   objet → identifiant. Rend le MÊME identifiant à un objet déjà
//              connu : c'est ce qui rend l'attribution idempotente, donc un
//              workflow rejoué ne fabrique pas un second identifiant pour la
//              même collection.
//   compteur   (portée, clé) → valeur. La numérotation de fratrie.
//
// Portés depuis `bayardIdFor` et `nextOrderNumber` (builder-iconik-shared.js),
// avec une différence assumée : DynamoDB permet des écritures conditionnelles,
// donc les deux sont ATOMIQUES ici alors que le moteur lit puis écrit. On tire
// parti de la cible plutôt que de recopier une faiblesse.
//
// ── CE CODE APPARTIENT À LA CIBLE ───────────────────────────────
// Pas d'équivalent dans APS : le moteur a Postgres. Il vit donc avec les
// fonctions. Ce qui doit être partagé — le FORMAT des identifiants — est dans
// builder-identifiants.js, embarqué depuis le dépôt.
// ================================================================
'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_REGISTRE = process.env.APS_TABLE_REGISTRY || 'aps-registry';
const TABLE_COMPTEUR = process.env.APS_TABLE_COUNTER  || 'aps-counter';
const INDEX_OBJET    = 'assetId-index';

// Fenêtre de rafale, en minutes. Reprise du moteur : au-delà, le compteur
// repart de la graine fournie par l'appelant plutôt que de poursuivre. C'est ce
// qui permet à une nouvelle saison de recommencer à 1 sans qu'on ait à remettre
// le compteur à zéro à la main.
const RAFALE_MINUTES = parseInt(process.env.APS_COUNTER_BURST_MINUTES, 10) || 10;

/**
 * L'identifiant d'un objet : le sien s'il en a déjà un, un neuf sinon.
 * @param {object} o { objectId, objectType, orgId, fabriquer }
 * @returns {Promise<{id, existait}>}
 */
async function attribuerIdentifiant(o) {
  const objectId = o.objectId || '';

  // La question qui rend l'attribution rejouable — et la seule raison d'être de
  // l'index sur `assetId`.
  if (objectId) {
    const deja = await doc.send(new QueryCommand({
      TableName: TABLE_REGISTRE, IndexName: INDEX_OBJET,
      KeyConditionExpression: 'assetId = :a',
      ExpressionAttributeValues: { ':a': objectId },
      Limit: 1,
    }));
    if (deja.Items && deja.Items.length) {
      return { id: deja.Items[0].bayardId, existait: true };
    }
  }

  // Écriture CONDITIONNELLE : deux runs simultanés ne peuvent pas se voir
  // attribuer le même identifiant. Le moteur, lui, lit puis écrit — il y a une
  // fenêtre entre les deux.
  let id = o.fabriquer();
  for (let essai = 0; essai < 10; essai++) {
    try {
      await doc.send(new PutCommand({
        TableName: TABLE_REGISTRE,
        Item: {
          bayardId: String(id), assetId: objectId,
          assetType: o.objectType || 'collection',
          orgId: o.orgId || 'default',
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(bayardId)',
      }));
      return { id: String(id), existait: false };
    } catch (e) {
      if (e.name !== 'ConditionalCheckFailedException') throw e;
      id = o.fabriquer();
    }
  }
  // Dix collisions d'affilée ne sont plus de la malchance : le format est trop
  // étroit pour le volume, et le dire vaut mieux que de boucler.
  throw new Error('aps : dix collisions d\'affilée sur un identifiant — format trop étroit');
}

/**
 * Le numéro suivant dans une portée. Porte la sémantique du moteur, y compris
 * sa fenêtre de rafale : passé RAFALE_MINUTES sans écriture, on repart de la
 * graine ; sinon on prend le plus grand entre la graine et la valeur + 1.
 *
 * L'atomicité vient d'une écriture conditionnée sur ce qu'on a lu (concurrence
 * optimiste) : si quelqu'un est passé entre-temps, on relit et on recommence.
 */
async function prochainNumero(portee, cle, graine) {
  const depart = (parseInt(graine, 10) || 0) + 1;

  for (let essai = 0; essai < 5; essai++) {
    const lu = await doc.send(new GetCommand({
      TableName: TABLE_COMPTEUR, Key: { scope: String(portee), key: String(cle) },
    }));
    const actuel = lu.Item;
    let valeur;
    if (!actuel) {
      valeur = depart;
    } else {
      const age = Date.now() - Date.parse(actuel.updatedAt || 0);
      valeur = age > RAFALE_MINUTES * 60000 ? depart : Math.max(depart, (actuel.value || 0) + 1);
    }

    try {
      await doc.send(new PutCommand({
        TableName: TABLE_COMPTEUR,
        Item: { scope: String(portee), key: String(cle), value: valeur, updatedAt: new Date().toISOString() },
        ConditionExpression: actuel ? 'updatedAt = :u' : 'attribute_not_exists(#s)',
        ExpressionAttributeValues: actuel ? { ':u': actuel.updatedAt } : undefined,
        ExpressionAttributeNames:  actuel ? undefined : { '#s': 'scope' },
      }));
      return valeur;
    } catch (e) {
      if (e.name !== 'ConditionalCheckFailedException') throw e;
      // Quelqu'un est passé : on relit et on recommence.
    }
  }
  throw new Error('aps : compteur « ' + portee + '/' + cle + ' » trop disputé, cinq essais sans succès');
}

module.exports = { attribuerIdentifiant, prochainNumero, TABLE_REGISTRE, TABLE_COMPTEUR, INDEX_OBJET };
