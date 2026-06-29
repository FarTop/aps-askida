// ================================================================
// wfd-node-action.js — Handler nœud "Organiser"
//
// Opérations :
//   add_to_collection     — ajouter l'asset à une collection
//   remove_from_collection— retirer l'asset d'une collection
//   move_to_collection    — déplacer (add + remove origine)
//   delete_asset          — supprimer l'asset
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

async function handleAction(node, ctx, client) {
  const cfg = node.config || {};
  const op  = cfg.actionType || 'add_to_collection';

  // Résoudre l'asset cible
  const assetId = WfdContext.resolve(
    cfg.assetVar || '{asset.id}', ctx
  );
  if (!assetId) throw new Error('Aucun asset disponible pour l\'action');

  switch (op) {

    case 'add_to_collection': {
      const colTarget = WfdContext.resolve(cfg.targetVar || cfg.target || '', ctx);
      if (!colTarget) throw new Error('Collection cible non définie');
      await client.addToCollection(assetId, colTarget);
      return { port: 0 };
    }

    case 'remove_from_collection': {
      const colOrigin = WfdContext.resolve(cfg.targetVar || '{collection.id}', ctx);
      if (!colOrigin) throw new Error('Collection origine non définie');
      await client.removeFromCollection(assetId, colOrigin);
      return { port: 0 };
    }

    case 'move_to_collection': {
      const colDest   = WfdContext.resolve(cfg.targetVar   || '', ctx);
      const colSource = WfdContext.resolve(cfg.sourceVar   || '{collection.id}', ctx);
      if (!colDest) throw new Error('Collection destination non définie');
      await client.addToCollection(assetId, colDest);
      if (colSource) {
        await client.removeFromCollection(assetId, colSource);
      }
      return { port: 0 };
    }

    case 'delete_asset': {
      await client.delete(`/API/assets/v1/assets/${assetId}/`);
      return { port: 0 };
    }

    default:
      throw new Error(`Action inconnue : ${op}`);
  }
}

const WfdNodeAction = { handleAction };
if (typeof module !== 'undefined') module.exports = WfdNodeAction;
if (typeof window !== 'undefined') window.WfdNodeAction = WfdNodeAction;
