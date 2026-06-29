// ================================================================
// wfd-node-fetch.js — Handler nœud "Récupérer"
//
// Sous-types :
//   asset      — récupérer l'asset déclenché ou par ID/titre
//   collection — récupérer la collection parente ou par chemin/ID
//   metadata   — lire une ou plusieurs valeurs de métadonnée
//
// Retourne toujours :
//   port 0 = trouvé
//   port 1 = non trouvé (si onError = 'stop')
//   throw  = erreur (gérée par l'executor selon onError)
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

async function handleFetch(node, ctx, iconikClient) {
  const cfg     = node.config || {};
  const subType = cfg.fetchSubType || 'asset'; // asset | collection | metadata

  switch (subType) {
    case 'asset'     : return fetchAsset(cfg, ctx, iconikClient);
    case 'collection': return fetchCollection(cfg, ctx, iconikClient);
    case 'metadata'  : return fetchMetadata(cfg, ctx, iconikClient);
    default:
      throw new Error(`Sous-type Récupérer inconnu : ${subType}`);
  }
}

// ── Récupérer un asset ───────────────────────────────────────────
async function fetchAsset(cfg, ctx, client) {
  const storeAs = cfg.storeAs || 'asset'; // nom de la variable résultat
  let asset;

  const source = cfg.fetchSource || 'triggered'; // triggered | id | title

  if (source === 'triggered') {
    // L'asset qui a déclenché le workflow — déjà dans ctx.asset
    const assetId = ctx.asset?.id || WfdContext.resolve('{asset.id}', ctx);
    if (!assetId) throw new Error('Aucun asset déclenché disponible dans le contexte');
    asset = await client.getAsset(assetId);

  } else if (source === 'id') {
    const assetId = WfdContext.resolve(cfg.fetchValue || '', ctx);
    if (!assetId) throw new Error('ID asset vide');
    asset = await client.getAsset(assetId);

  } else if (source === 'title') {
    const title = WfdContext.resolve(cfg.fetchValue || '', ctx);
    const res   = await client.post('/API/search/v1/search/', {
      query: title, doc_types: ['assets'],
    });
    asset = (res.objects || [])[0];
  }

  if (!asset || !asset.id) return { port: 1 }; // non trouvé

  // Charger les métadonnées si demandé
  if (cfg.withMetadata && cfg.metadataViewId) {
    try {
      const meta = await client.getAssetMetadata(asset.id, cfg.metadataViewId);
      asset._metadata = meta.metadata_values || {};
    } catch(_) { asset._metadata = {}; }
  }

  // Charger les collections parentes si demandé
  if (cfg.withCollections) {
    try {
      const cols  = await client.getAssetCollections(asset.id);
      asset._collections = cols.objects || cols.collections || [];
    } catch(_) { asset._collections = []; }
  }

  // Stocker dans le contexte
  storeAsset(ctx, storeAs, asset);
  return { port: 0 };
}

// ── Récupérer une collection ─────────────────────────────────────
async function fetchCollection(cfg, ctx, client) {
  const storeAs = cfg.storeAs || 'collection';
  let col;

  const source = cfg.fetchSource || 'parent'; // parent | id | path

  if (source === 'parent') {
    // Collection parente de l'asset courant
    const assetId = ctx.asset?.id || WfdContext.resolve('{asset.id}', ctx);
    if (!assetId) throw new Error('Aucun asset disponible pour trouver la collection parente');
    const cols = await client.getAssetCollections(assetId);
    const list = cols.objects || cols.collections || [];
    if (!list.length) return { port: 1 };
    // Prendre la première collection parente
    col = await client.getCollection(list[0].id || list[0]);

  } else if (source === 'id') {
    const colId = WfdContext.resolve(cfg.fetchValue || '', ctx);
    if (!colId) throw new Error('ID collection vide');
    col = await client.getCollection(colId);

  } else if (source === 'path') {
    const colPath = WfdContext.resolve(cfg.fetchValue || '', ctx);
    col = await client.resolveCollectionPath(colPath);
  }

  if (!col || !col.id) return { port: 1 };

  // Stocker dans le contexte
  storeCollection(ctx, storeAs, col);
  return { port: 0 };
}

// ── Lire des métadonnées ─────────────────────────────────────────
async function fetchMetadata(cfg, ctx, client) {
  const storeAs  = cfg.storeAs      || 'metadata';
  const viewId   = WfdContext.resolve(cfg.metadataViewId || '', ctx);
  const fields   = cfg.metadataFields || []; // [] = tous les champs

  // Sur quel objet ?
  const targetType = cfg.fetchTarget || 'asset'; // asset | collection
  const targetId   = targetType === 'collection'
    ? (ctx.collection?.id || WfdContext.resolve('{collection.id}', ctx))
    : (ctx.asset?.id      || WfdContext.resolve('{asset.id}', ctx));

  if (!targetId) throw new Error(`Aucun ${targetType} disponible pour lire les métadonnées`);

  let meta;
  if (targetType === 'collection') {
    meta = await client.getCollectionMetadata(targetId, viewId);
  } else {
    meta = await client.getAssetMetadata(targetId, viewId);
  }

  const rawValues = meta.metadata_values || {};

  // Extraire les valeurs — aplatir les field_values[0].value
  const flatValues = {};
  Object.entries(rawValues).forEach(([key, val]) => {
    if (Array.isArray(val?.field_values)) {
      // Format Iconik standard : { field_values: [{ value: '...' }] }
      flatValues[key] = val.field_values.map(fv => fv.value).join(', ');
    } else if (val?.value !== undefined) {
      flatValues[key] = val.value;
    } else {
      flatValues[key] = val;
    }
  });

  // Filtrer les champs si demandé
  const result = fields.length
    ? Object.fromEntries(fields.map(f => [f, flatValues[f] ?? '']))
    : flatValues;

  // Stocker dans le contexte
  WfdContext.storeResult(ctx, storeAs, result);

  // Exposer chaque champ directement : {storeAs.NomDuChamp}
  ctx.results[storeAs] = result;

  return { port: 0 };
}

// ── Helpers de stockage ──────────────────────────────────────────
function storeAsset(ctx, varName, asset) {
  const data = {
    id        : asset.id,
    title     : asset.title || asset.name || '',
    status    : asset.status || '',
    type      : asset.type || 'asset',
    created   : asset.date_created || '',
    updated   : asset.date_modified || '',
    metadata  : asset._metadata || asset.metadata_values || {},
    collections: asset._collections || asset.in_collections || [],
  };
  WfdContext.storeResult(ctx, varName, data);

  // Mettre à jour ctx.asset si c'est la variable principale
  if (varName === 'asset') {
    ctx.asset = { ...ctx.asset, ...data };
  }
}

function storeCollection(ctx, varName, col) {
  const data = {
    id   : col.id,
    name : col.title || col.name || '',
    path : col.path  || '',
  };
  WfdContext.storeResult(ctx, varName, data);

  if (varName === 'collection') {
    ctx.collection = { ...ctx.collection, ...data };
  }
}

// ── Export ────────────────────────────────────────────────────────
const WfdNodeFetch = { handleFetch };
if (typeof module !== 'undefined') module.exports = WfdNodeFetch;
if (typeof window !== 'undefined') window.WfdNodeFetch = WfdNodeFetch;
