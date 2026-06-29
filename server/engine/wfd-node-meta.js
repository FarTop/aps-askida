// ================================================================
// wfd-node-meta.js — Handler nœud "Métadonnées"
//
// Opérations :
//   write  — écrire des valeurs de métadonnée
//   reset  — vider des champs
//   copy   — copier les métadonnées d'un objet vers un autre
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

async function handleMeta(node, ctx, client) {
  const cfg    = node.config || {};
  const op     = cfg.metaOp  || 'write';
  const target = cfg.target  || 'asset';

  const targetId = target === 'collection'
    ? WfdContext.resolve(cfg.targetVar || '{collection.id}', ctx)
    : WfdContext.resolve(cfg.targetVar || '{asset.id}',      ctx);

  if (!targetId) throw new Error(`Aucun ${target} disponible pour mettre à jour les métadonnées`);

  const viewId = WfdContext.resolve(cfg.viewId || '', ctx);

  switch (op) {
    case 'write': {
      // Construire les valeurs à écrire
      const fields = cfg.fields || [];
      const metaValues = {};
      fields.forEach(f => {
        const val = WfdContext.resolve(f.value || '', ctx);
        metaValues[f.key] = {
          field_values: [{ value: val }]
        };
      });

      if (target === 'collection') {
        await client.put(
          `/API/metadata/v1/collections/${targetId}/views/${viewId}/`,
          { metadata_values: metaValues }
        );
      } else {
        await client.updateAssetMetadata(targetId, viewId, metaValues);
      }
      return { port: 0 };
    }

    case 'reset': {
      // Vider les champs spécifiés
      const fields  = cfg.fields || [];
      const metaValues = {};
      fields.forEach(f => {
        metaValues[f.key] = { field_values: [] };
      });
      await client.updateAssetMetadata(targetId, viewId, metaValues);
      return { port: 0 };
    }

    case 'copy': {
      // Copier les métadonnées depuis un autre objet
      const sourceId = WfdContext.resolve(cfg.sourceVar || '', ctx);
      if (!sourceId) throw new Error('Source de copie non définie');
      const sourceMeta = await client.getAssetMetadata(sourceId, viewId);
      await client.updateAssetMetadata(targetId, viewId, sourceMeta.metadata_values || {});
      return { port: 0 };
    }

    default:
      throw new Error(`Opération métadonnée inconnue : ${op}`);
  }
}

const WfdNodeMeta = { handleMeta };
if (typeof module !== 'undefined') module.exports = WfdNodeMeta;
if (typeof window !== 'undefined') window.WfdNodeMeta = WfdNodeMeta;
