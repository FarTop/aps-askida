// APS — server/engine-builder/builder-handler-iconik-set-metadata.js — créé le 2026-08-05
// Port de update_meta(), server/engine/wfd-engine-handlers.js:1637-1694.
// Mode 'view' délègue à action() (metadata_collection/metadata_patch), comme
// l'original — réutilise builder-handler-iconik-action.js plutôt que de
// dupliquer sa logique. Ports du pivot : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const iconikAction    = require('./builder-handler-iconik-action.js');
const { metadataValuesDepuisReponse } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _isUnresolvedPlaceholder(v) {
  return typeof v === 'string' && /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(v.trim());
}

async function setMetadata(step, ctx, deps) {
  const p = step.params || {};
  const mode = p.mode || 'view';

  if (mode === 'fields') {
    const iconikClient = deps && deps.iconikClient;
    const _isCol = p.target === 'collection';
    const _defaultId = _isCol ? '{collection.id}' : '{asset.id}';
    const oid      = r(p.targetId || p.assetId || _defaultId, ctx);
    const mdViewId = r(p.mdViewId || '', ctx);
    const _base = _isCol ? `/API/metadata/v1/collections/${oid}/` : `/API/metadata/v1/assets/${oid}/`;
    const endpoint = mdViewId ? `${_base}views/${mdViewId}/` : _base;
    let existing = {};
    try {
      const current = await iconikClient.get(endpoint);
      existing = metadataValuesDepuisReponse(current);
    } catch (_) {}
    const fields = { ...existing };
    (p.fields || []).forEach(f => {
      if (!f.key) return;
      const val = r(f.value || '', ctx);
      if (_isUnresolvedPlaceholder(val)) return;
      fields[r(f.key, ctx)] = { field_values: val !== '' ? [{ value: val }] : [] };
    });
    const result = await iconikClient.put(endpoint, { metadata_values: fields });
    if (result) BuilderContext.storeResult(ctx, '_action_' + step.id, result);
    return { port: 'out' };
  }

  const _isCollection = p.target === 'collection';
  const _actionType = _isCollection ? 'metadata_collection' : (p.actionType || 'metadata_patch');
  const virtualStep = {
    id: step.id,
    core: 'http_request',
    params: Object.assign({}, p, {
      actionType: _actionType,
      collectionId: _isCollection ? (p.targetId || '{collection.id}') : undefined,
      viewId: _isCollection ? p.mdViewId : undefined,
    }),
  };
  return iconikAction(virtualStep, ctx, deps);
}

module.exports = setMetadata;
