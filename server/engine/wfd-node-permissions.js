// ================================================================
// wfd-node-permissions.js — Handler nœud "Permissions"
//
// Opérations :
//   add     — ajouter des permissions
//   replace — remplacer toutes les permissions
//   remove  — retirer les permissions d'un groupe
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

async function handlePermissions(node, ctx, client) {
  const cfg       = node.config || {};
  const op        = cfg.aclOp    || 'add';
  const target    = cfg.target   || 'asset';
  const propagate = !!cfg.propagate;

  const targetId = target === 'collection'
    ? WfdContext.resolve(cfg.targetVar || '{collection.id}', ctx)
    : WfdContext.resolve(cfg.targetVar || '{asset.id}',      ctx);

  if (!targetId) throw new Error(`Aucun ${target} disponible pour les permissions`);

  const ep = target === 'collection'
    ? `/API/acls/v1/collections/${targetId}/access_control/`
    : `/API/acls/v1/assets/${targetId}/access_control/`;

  // Remplacer d'abord si demandé
  if (op === 'replace') {
    await client.delete(ep);
  } else if (op === 'remove') {
    await client.delete(ep);
    return { port: 0 };
  }

  // Appliquer les entrées
  const entries = cfg.entries || [];
  for (const entry of entries) {
    const groupId     = WfdContext.resolve(entry.groupId || '', ctx);
    const permissions = entry.permissions || ['read'];
    if (!groupId) continue;
    await client.post(ep, { group_id: groupId, permissions });
  }

  // Propager aux sous-collections si demandé
  if (propagate && target === 'collection') {
    await client.post(
      `/API/acls/v1/collections/${targetId}/access_control/propagate/`,
      {}
    );
  }

  return { port: 0 };
}

const WfdNodePermissions = { handlePermissions };
if (typeof module !== 'undefined') module.exports = WfdNodePermissions;
if (typeof window !== 'undefined') window.WfdNodePermissions = WfdNodePermissions;
