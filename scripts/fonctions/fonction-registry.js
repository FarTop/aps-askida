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

const { attribuerIdentifiant } = require('./commun-etat.js');
const { genererIdentifiant } = require('./builder-identifiants.js');

exports.handler = async function (evenement) {
  const e = evenement || {};
  const length = Math.max(1, Math.min(64, parseInt(e.idLength, 10) || 8));
  const type   = e.idType || 'numeric';
  const prefix = e.idPrefix || '';
  const objectId = e.objectId || '';

  const attribue = await attribuerIdentifiant({
    objectId  : objectId,
    objectType: e.objectType || (objectId ? 'collection' : 'asset'),
    orgId     : e.orgId || 'default',
    fabriquer : function () { return genererIdentifiant(type, length, prefix); },
  });

  return {
    id: e.outputType === 'integer' ? parseInt(attribue.id, 10) : attribue.id,
    existait: attribue.existait,
  };
};
