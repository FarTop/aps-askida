// APS — server/engine-builder/builder-handler-iconik-fetch.js — créé le 2026-08-05
// Port de fetch(), server/engine/wfd-engine-handlers.js:674-925.
// Ports du pivot (facade iconik.fetch) : out | not_found — le handler ne
// retourne jamais de port dédié aux erreurs (les vraies exceptions sont
// levées et tranchées par workflow.onError, cf. pivot-catalog-iconik.js:143-151).
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik, resolveByName, extractTechnical } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

async function iconikFetch(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.fetch');

  const p = step.params || {};

  const subType = p.fetchSubType || (p.savedSearchId ? 'savedsearch'
    : p.fetchType === 'collection' ? 'collection'
    : p.fetchTarget === 'metadata' || p.fetchMdView ? 'metadata'
    : 'asset');

  // ── Saved Search ─────────────────────────────────────────────
  if (subType === 'savedsearch') {
    let   searchId = r(p.savedSearchId || '', ctx);
    const varName  = r(p.savedSearchVar || 'search_results', ctx);
    const limit    = p.savedSearchLimit || 100;
    const name     = p.savedSearchName  || '';
    if (!searchId && !name) throw new Error('Fetch Saved Search : savedSearchId et savedSearchName manquants');

    searchId = await resolveByName(iconikClient, searchId, name, '/API/search/v1/search/saved/', 'name');
    const data = await iconikClient.get(`/API/search/v1/search/saved/${searchId}/?per_page=${limit}`);
    BuilderContext.storeResult(ctx, varName, data);
    const count = data.objects?.length || data.hits?.total || 0;
    BuilderContext.setVar(ctx, varName + '_count', String(count));
    return { port: 'out', count };
  }

  // ── Collection ───────────────────────────────────────────────
  if (subType === 'collection') {
    const varName = r(p.fetchVar || p.storeAs || 'collection', ctx);
    const src     = p.fetchSource || 'parent';
    let col;

    if (src === 'id') {
      const colId = r(p.fetchValue || '{collection.id}', ctx);
      col = await iconikClient.get(`/API/assets/v1/collections/${colId}/`);

    } else if (src === 'path') {
      const colPath = r(p.fetchValue || '', ctx);
      if (!colPath) throw new Error("Fetch collection par chemin : chemin manquant (fetchValue vide)");
      const parts = colPath.split('/').map(x => x.trim()).filter(Boolean);
      const title = parts[parts.length - 1];
      const result = await iconikClient.post('/API/search/v1/search/', {
        query: title, doc_types: ['collections'],
      });
      const candidates = result.objects || [];
      col = candidates.find(c => {
        const fullPath = (c.ancestors || []).map(a => a.title).join('/') + '/' + c.title;
        return fullPath.includes(colPath) || c.title === title;
      }) || candidates[0];
      if (!col) return { port: 'not_found' };

    } else {
      const assetId = ctx.asset?.id || '';
      if (assetId) {
        const cols = await iconikClient.get(`/API/assets/v1/assets/${assetId}/collections/`);
        const list = cols.objects || cols.collections || [];
        if (!list.length) return { port: 'not_found' };
        col = await iconikClient.get(`/API/assets/v1/collections/${list[0].id || list[0]}/`);
      } else {
        const currentId = r(ctx.collection?.id || '{collection.id}', ctx);
        if (!currentId) throw new Error('Fetch collection parent : ni asset ni collection dans le contexte');
        const current = await iconikClient.get(`/API/assets/v1/collections/${currentId}/`);
        if (!current.parent_id) return { port: 'not_found' };
        col = await iconikClient.get(`/API/assets/v1/collections/${current.parent_id}/`);
      }
    }

    if (!col || !col.id) return { port: 'not_found' };
    BuilderContext.storeResult(ctx, varName, col);
    ['id', 'title', 'parent_id'].forEach(f => {
      if (col[f] !== undefined && col[f] !== null) BuilderContext.setVar(ctx, varName + '.' + f, String(col[f]));
    });
    return { port: 'out' };
  }

  // ── Métadonnées ──────────────────────────────────────────────
  if (subType === 'metadata') {
    const varName    = r(p.fetchVar || p.storeAs || 'metadata', ctx);
    const explicitId = p.fetchValue ? r(p.fetchValue, ctx) : '';
    const metaSource = p.fetchSource || 'triggered';
    let objectType, objectId;

    if (explicitId) {
      objectType = p.fetchTarget === 'asset' ? 'assets' : 'collections';
      objectId   = explicitId;

    } else if (metaSource === 'parent') {
      const assetId = ctx.asset?.id || '';
      if (assetId) {
        const cols = await iconikClient.get(`/API/assets/v1/assets/${assetId}/collections/`);
        const list = cols.objects || cols.collections || [];
        if (!list.length) return { port: 'not_found' };
        objectType = 'collections';
        objectId   = list[0].id || list[0];
      } else {
        const currentId = ctx.collection?.id || '';
        if (!currentId) throw new Error('Fetch metadata (parent) : ni asset ni collection dans le contexte');
        const current = await iconikClient.get(`/API/assets/v1/collections/${currentId}/`);
        if (!current.parent_id) return { port: 'not_found' };
        objectType = 'collections';
        objectId   = current.parent_id;
      }

    } else {
      const assetId = ctx.asset?.id || '';
      const colId   = ctx.collection?.id || '';
      objectType = colId && !assetId ? 'collections' : 'assets';
      objectId   = objectType === 'collections' ? colId : assetId;
    }
    const viewId   = r(p.fetchMdViewId || p.metadataViewId || p.fetchMdView || '', ctx);
    const endpoint = viewId
      ? `/API/metadata/v1/${objectType}/${objectId}/views/${viewId}/`
      : `/API/metadata/v1/${objectType}/${objectId}/`;
    let data;
    try {
      data = await iconikClient.get(endpoint);
    } catch (e) {
      if (e.statusCode === 404 || e.message?.includes('404')) {
        data = { metadata_values: {} };
      } else {
        throw e;
      }
    }
    const fields = p.metadataFields || [];
    if (fields.length && data.metadata_values) {
      const filtered = {};
      fields.forEach(f => { if (data.metadata_values[f]) filtered[f] = data.metadata_values[f]; });
      data.metadata_values = filtered;
    }
    BuilderContext.storeResult(ctx, varName, data);
    const _mvObj2 = data.metadata_values || {};
    Object.entries(_mvObj2).forEach(([fieldName, fieldData]) => {
      if (fieldName === '__separator__') return;
      const values = (fieldData?.field_values || [])
        .map(fv => fv.value)
        .filter(v => v !== null && v !== undefined && v !== '');
      if (!values.length) return;
      const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
      BuilderContext.setVar(ctx, varName + '.' + fieldName, exposed);
    });
    return { port: 'out' };
  }

  // ── Asset (défaut) ───────────────────────────────────────────
  const varName = r(p.fetchVar || p.storeAs || 'asset', ctx);
  const src     = p.fetchSource || 'triggered';
  let assetId;
  if (src === 'triggered' || src === 'id') {
    assetId = r(p.fetchValue || ctx.asset?.id || '{asset.id}', ctx);
  } else if (src === 'title') {
    const title = r(p.fetchValue || '', ctx);
    if (!title) throw new Error('Fetch asset par titre : valeur manquante');
    const results = await iconikClient.get(`/API/search/v1/search/?query=${encodeURIComponent(title)}&page_size=1`);
    const found = results.objects?.[0];
    if (!found) return { port: 'not_found' };
    BuilderContext.storeResult(ctx, varName, found);
    if (p.withMetadata && found.id) {
      const mdViewId = r(p.fetchMdViewId || p.withMetadataViewId || p.fetchMdView || '', ctx)
        || ctx.vars?.metadata_view_id || '';
      const mdEndpoint = mdViewId
        ? `/API/metadata/v1/assets/${found.id}/views/${mdViewId}/`
        : `/API/metadata/v1/assets/${found.id}/`;
      const md = await iconikClient.get(mdEndpoint);
      BuilderContext.storeResult(ctx, varName + '_metadata', md);
    }
    return { port: 'out' };
  } else {
    assetId = r(ctx.asset?.id || '', ctx);
  }

  if (!assetId || assetId === '{asset.id}') {
    throw new Error('Fetch asset : assetId non résolu — ' + assetId);
  }

  const data = await iconikClient.get(`/API/assets/v1/assets/${assetId}/`);
  BuilderContext.storeResult(ctx, varName, data);

  if (p.withMetadata) {
    const mdViewId = r(p.fetchMdViewId || p.withMetadataViewId || p.fetchMdView || '', ctx)
      || ctx.vars?.metadata_view_id || '';
    const mdEndpoint = mdViewId
      ? `/API/metadata/v1/assets/${assetId}/views/${mdViewId}/`
      : `/API/metadata/v1/assets/${assetId}/`;
    const md = await iconikClient.get(mdEndpoint);
    BuilderContext.storeResult(ctx, varName + '_metadata', md);

    const mvObj = md.metadata_values || {};
    Object.entries(mvObj).forEach(([fieldName, fieldData]) => {
      if (fieldName === '__separator__') return;
      const values = (fieldData?.field_values || [])
        .map(fv => fv.value)
        .filter(v => v !== null && v !== undefined && v !== '');
      if (!values.length) return;
      const exposed = values.length === 1 ? String(values[0]) : JSON.stringify(values);
      BuilderContext.setVar(ctx, fieldName, exposed);
    });
  }

  if (p.withKeyframes) {
    try {
      const kf = await iconikClient.get(`/API/files/v1/assets/${assetId}/keyframes/`);
      BuilderContext.storeResult(ctx, varName + '_keyframes', kf);
      const firstUrl = kf?.objects?.[0]?.url || kf?.objects?.[0]?.keyframe_url || '';
      if (firstUrl) BuilderContext.setVar(ctx, varName + '_keyframe_url', firstUrl);
    } catch (e) {
      BuilderContext.storeResult(ctx, varName + '_keyframes', { objects: [], error: e.message });
    }
  }

  if (p.withFormats) {
    await extractTechnical(assetId, varName, ctx, iconikClient);
  }

  return { port: 'out' };
}

module.exports = iconikFetch;
