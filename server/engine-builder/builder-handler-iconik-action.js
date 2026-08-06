// APS — server/engine-builder/builder-handler-iconik-action.js — créé le 2026-08-05
// Port de action(), server/engine/wfd-engine-handlers.js:1163-1634. Le
// panneau du Builder expose les 41 actionType du dispatcher d'origine (un
// seul, export_location_trigger, a des champs dédiés — les autres restent
// "utilisables mais non détaillés", cf. config-schema.js:944-1018) : tous
// portés ici, pas seulement le préréglage `export_location` déclaré dans le
// catalogue pivot. Source réelle confirmée par le catalogue
// (pivot-catalog-iconik.js:216-217) : `action()`, PAS `_handleHttpAction()`
// (le commentaire du catalogue qui pointe vers `_handleHttpAction` est
// trompeur — cette dernière n'est jamais atteinte par cette façade).
// Ports du pivot : out | error — action() ne route jamais lui-même vers
// error (une vraie panne lève une exception, tranchée par workflow.onError,
// comme tout le reste) ; le seul cas "silencieux" est un actionType inconnu,
// qui log un warning et continue.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik, metadataValuesDepuisReponse } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _isUnresolvedPlaceholder(v) {
  return typeof v === 'string' && /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(v.trim());
}

async function iconikAction(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.action');

  const p = step.params || {};
  const type = p.actionType || '';

  let result;

  switch (type) {
    case 'asset_create': {
      result = await iconikClient.post('/API/assets/v1/assets/', {
        title: r(p.title || '{asset.id}', ctx),
        object_type: p.objectType || 'assets',
        status: p.status || 'ACTIVE',
      });
      if (result.id) BuilderContext.setVar(ctx, 'asset_id', result.id);
      break;
    }

    case 'asset_patch': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.patch(`/API/assets/v1/assets/${aid}/`, {
        [r(p.field || 'title', ctx)]: r(p.value || '', ctx),
      });
      break;
    }

    case 'asset_delete': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/assets/${aid}/`);
      result = { deleted: true };
      break;
    }

    case 'collection_create': {
      result = await iconikClient.post('/API/assets/v1/collections/', {
        title: r(p.title || 'New Collection', ctx),
        parent_id: r(p.parentId || '', ctx) || undefined,
      });
      if (result.id) BuilderContext.setVar(ctx, 'collection_id', result.id);
      break;
    }

    case 'collection_add_asset': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      const aid   = r(p.assetId      || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/collections/${colId}/content/`, {
        object_id: aid, object_type: 'assets',
      });
      break;
    }

    case 'collection_remove_asset': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      const aid   = r(p.assetId      || '{asset.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/collections/${colId}/content/${aid}/`);
      result = { removed: true };
      break;
    }

    case 'metadata_write': {
      const aid    = r(p.targetId || p.assetId || '{asset.id}', ctx);
      const viewId = r(p.viewId  || '', ctx);
      const fields = {};
      (p.fields || []).forEach(f => {
        fields[r(f.key, ctx)] = { field_values: [{ value: r(f.value || '', ctx) }] };
      });
      result = await iconikClient.put(`/API/metadata/v1/assets/${aid}/views/${viewId}/`, { metadata_values: fields });
      break;
    }

    case 'metadata_patch': {
      let aid = r(p.targetId || p.assetId || '{asset.id}', ctx);
      if (aid && aid.startsWith('{')) {
        const varName = aid.slice(1, -1);
        aid = ctx.vars?.[varName] || ctx.asset?.id || '';
      }
      const viewId = r(p.mdViewId || p.viewId || '', ctx);
      const endpoint = `/API/metadata/v1/assets/${aid}/views/${viewId}/`;
      let existing = {};
      try {
        const current = await iconikClient.get(endpoint);
        existing = metadataValuesDepuisReponse(current);
      } catch (_) {}
      const fields = { ...existing };
      (p.fields || []).forEach(f => {
        if (!f.key) return;
        const val = r(f.value || '', ctx);
        fields[r(f.key, ctx)] = { field_values: val !== '' ? [{ value: val }] : [] };
      });
      result = await iconikClient.put(endpoint, { metadata_values: fields });
      break;
    }

    case 'acl_set_asset': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/assets/${aid}/acls/`, {
        object_id: aid, object_type: 'assets',
        group_id: r(p.groupId || '', ctx), permissions: p.permissions || ['read'],
      });
      break;
    }

    case 'format_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/formats/`, {
        name: r(p.name || 'original', ctx), storage_id: r(p.storageId || '', ctx),
      });
      if (result.id) BuilderContext.setVar(ctx, 'format_id', result.id);
      break;
    }

    case 'file_set_create': {
      const aid = r(p.assetId  || '{asset.id}', ctx);
      const fid = r(p.formatId || '{vars.format_id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/file_sets/`, {
        name: r(p.name || 'Original', ctx), format_id: fid, storage_id: r(p.storageId || '', ctx),
      });
      if (result.id) BuilderContext.setVar(ctx, 'file_set_id', result.id);
      break;
    }

    case 'export_location':
    case 'export_location_trigger': {
      const aid  = r(p.assetId || '{asset_id}', ctx);
      const elId = r(p.exportLocationId || p.target || '', ctx);
      if (!elId) throw new Error('export_location : exportLocationId requis');
      const exportPayload = {};
      if (p.createFolderAsset) exportPayload.export_to_asset_folder = true;
      if (p.overwrite !== undefined) exportPayload.overwrite = p.overwrite === true || p.overwrite === 'true';
      if (p.fileName) {
        // Le nettoyage ci-dessous retire les accolades : un gabarit NON
        // résolu (« {ancestorPath}/X ») y survit sous la forme
        // « ancestorPath/X » et devient un vrai chemin de destination. C'est
        // arrivé le 2026-08-06 sur un Episode dont resolve_ancestors avait
        // échoué : Iconik a réellement livré 3 fichiers dans un dossier S3
        // nommé « ancestorPath », chez le partenaire. Un chemin d'écriture
        // incomplet doit échouer franchement, jamais s'inventer une valeur.
        const nomResolu = r(p.fileName, ctx);
        if (/\{[^}]+\}/.test(nomResolu)) {
          throw new Error('export_location : chemin de destination incomplet — « ' + nomResolu
            + ' » contient une variable non résolue, export annulé');
        }
        exportPayload.file_name = nomResolu.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\/]/g, '');
      }
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/export_locations/${elId}/`, exportPayload);
      if (result?.job_id) BuilderContext.setVar(ctx, 'exportJobId', result.job_id);
      break;
    }

    case 'file_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/files/`, {
        original_name: r(p.fileName || '{file.name}', ctx),
        storage_id: r(p.storageId || '', ctx),
        file_set_id: r(p.fileSetId || '{vars.file_set_id}', ctx),
      });
      break;
    }

    case 'proxy_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/proxies/`, {
        original_name: r(p.fileName || '{file.name}', ctx), storage_id: r(p.storageId || '', ctx),
      });
      if (result.upload_url) BuilderContext.setVar(ctx, 'proxy_upload_url', result.upload_url);
      if (result.id)         BuilderContext.setVar(ctx, 'proxy_id', result.id);
      break;
    }

    case 'proxy_patch': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      const pid = r(p.proxyId || '{vars.proxy_id}', ctx);
      result = await iconikClient.patch(`/API/files/v1/assets/${aid}/proxies/${pid}/`, { status: 'CLOSED' });
      break;
    }

    case 'transcode_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/transcode/v1/jobs/', {
        asset_id: aid, preset_id: r(p.presetId || '', ctx), profile: r(p.profile || '', ctx), priority: p.priority || 50,
      });
      if (result.id) BuilderContext.setVar(ctx, 'transcode_job_id', result.id);
      break;
    }

    case 'relation_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/relations/`, {
        related_asset_id: r(p.relatedAssetId || '', ctx), relation_type: r(p.relationType || 'related', ctx),
      });
      break;
    }

    case 'asset_update': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.put(`/API/assets/v1/assets/${aid}/`, {
        title: r(p.title || '', ctx), status: r(p.status || 'ACTIVE', ctx),
        is_online: p.isOnline !== undefined ? p.isOnline : true,
      });
      break;
    }

    case 'asset_restore': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/restore/`, {});
      break;
    }

    case 'asset_copy': {
      const aid   = r(p.assetId      || '{asset.id}', ctx);
      const colId = r(p.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/collections/${colId}/`, {});
      break;
    }

    case 'asset_set_status': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.patch(`/API/assets/v1/assets/${aid}/`, { status: r(p.status || 'ACTIVE', ctx) });
      if (p.status) BuilderContext.setVar(ctx, 'asset_status', r(p.status, ctx));
      break;
    }

    case 'collection_update': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      result = await iconikClient.put(`/API/assets/v1/collections/${colId}/`, { title: r(p.title || '', ctx) });
      break;
    }

    case 'collection_delete': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      await iconikClient.delete(`/API/assets/v1/collections/${colId}/`);
      result = { deleted: true };
      break;
    }

    case 'metadata_collection': {
      const colId  = r(p.collectionId || '{collection.id}', ctx);
      const viewId = r(p.viewId || '', ctx);
      const fields = {};
      (p.fields || []).forEach(f => {
        const _v = r(f.value || '', ctx);
        if (_isUnresolvedPlaceholder(_v)) return;
        fields[r(f.key, ctx)] = { field_values: [{ value: _v }] };
      });
      result = await iconikClient.put(
        viewId ? `/API/metadata/v1/collections/${colId}/views/${viewId}/` : `/API/metadata/v1/collections/${colId}/`,
        { metadata_values: fields }
      );
      break;
    }

    case 'metadata_view_create': {
      result = await iconikClient.post('/API/metadata/v1/views/', {
        name: r(p.name || 'New View', ctx), description: r(p.description || '', ctx), view_fields: p.viewFields || [],
      });
      if (result.id) BuilderContext.setVar(ctx, 'metadata_view_id', result.id);
      break;
    }

    case 'metadata_field_create': {
      result = await iconikClient.post('/API/metadata/v1/fields/', {
        name: r(p.name || 'new_field', ctx), label: r(p.label || 'New Field', ctx),
        field_type: p.fieldType || 'text', options: p.options || [],
      });
      if (result.id) BuilderContext.setVar(ctx, 'metadata_field_id', result.id);
      break;
    }

    case 'acl_template_apply': {
      const objId = r(p.objectId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/objects/${objId}/bulk/`, { acl_template_id: r(p.aclTemplateId || '', ctx) });
      break;
    }

    case 'acl_set_collection': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/collections/${colId}/acls/`, {
        object_id: colId, object_type: 'collections', group_id: r(p.groupId || '', ctx), permissions: p.permissions || ['read'],
      });
      break;
    }

    case 'acl_propagate': {
      const colId = r(p.collectionId || '{collection.id}', ctx);
      result = await iconikClient.post(`/API/acls/v1/collections/${colId}/acls/propagate/`, {});
      break;
    }

    case 'acl_remove': {
      const objType = r(p.objectType || 'assets', ctx);
      const objId   = r(p.objectId   || '{asset.id}', ctx);
      const aclId   = r(p.aclId      || '', ctx);
      await iconikClient.delete(`/API/acls/v1/${objType}/${objId}/acls/${aclId}/`);
      result = { deleted: true };
      break;
    }

    case 'proxy_keyframe': {
      const aid     = r(p.assetId  || '{asset.id}', ctx);
      const proxyId = r(p.proxyId  || '{vars.proxy_id}', ctx);
      result = await iconikClient.post(`/API/files/v1/assets/${aid}/proxies/${proxyId}/keyframes/`, {});
      break;
    }

    case 'format_delete': {
      const aid      = r(p.assetId   || '{asset.id}', ctx);
      const formatId = r(p.formatId  || '{vars.format_id}', ctx);
      await iconikClient.delete(`/API/files/v1/assets/${aid}/formats/${formatId}/`);
      result = { deleted: true };
      break;
    }

    case 'keyframe_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/transcode/v1/jobs/keyframes/', { asset_id: aid, priority: p.priority || 50 });
      if (result.id) BuilderContext.setVar(ctx, 'keyframe_job_id', result.id);
      break;
    }

    case 'saved_search_run': {
      const searchId = r(p.savedSearchId || '', ctx);
      const varName  = r(p.varName || 'search_results', ctx);
      const pageSize = p.pageSize || 100;
      if (!searchId) throw new Error('saved_search_run : savedSearchId manquant');
      result = await iconikClient.get(`/API/search/v1/search/saved/${searchId}/?per_page=${pageSize}`);
      BuilderContext.storeResult(ctx, varName, result);
      const count = result.objects?.length || result.hits?.total || 0;
      BuilderContext.setVar(ctx, varName + '_count', String(count));
      break;
    }

    case 'saved_search_create': {
      result = await iconikClient.post('/API/search/v1/search/saved/', {
        title: r(p.title || 'New Search', ctx), query: r(p.query || '', ctx), filter: p.filter || {},
      });
      if (result.id) BuilderContext.setVar(ctx, 'saved_search_id', result.id);
      break;
    }

    case 'job_get_status': {
      const jobId   = r(p.jobId || '{vars.transcode_job_id}', ctx);
      const varName = r(p.varName || 'job_status', ctx);
      if (!jobId) throw new Error('job_get_status : jobId manquant');
      result = await iconikClient.get(`/API/transcode/v1/jobs/${jobId}/`);
      BuilderContext.storeResult(ctx, varName, result);
      BuilderContext.setVar(ctx, varName, result.status || '');
      break;
    }

    case 'automation_trigger': {
      const autoId = r(p.automationId || '', ctx);
      if (!autoId) throw new Error('automation_trigger : automationId manquant');
      result = await iconikClient.post(`/API/automations/v1/automations/${autoId}/run/`, { asset_id: r(p.assetId || '{asset.id}', ctx) });
      break;
    }

    case 'webhook_create': {
      result = await iconikClient.post('/API/notifications/v1/webhooks/', {
        url: r(p.url || '', ctx), event_type: r(p.eventType || '', ctx),
        realm: r(p.realm || 'assets', ctx), operation: r(p.operation || 'create', ctx), filter: p.filter || {},
      });
      if (result.id) BuilderContext.setVar(ctx, 'webhook_id', result.id);
      break;
    }

    case 'segment_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/segments/`, {
        title: r(p.title || '', ctx), time_start: p.timeStart || 0, time_end: p.timeEnd || 0, type: r(p.type || 'CUSTOM', ctx),
      });
      if (result.id) BuilderContext.setVar(ctx, 'segment_id', result.id);
      break;
    }

    case 'share_create': {
      const aid = r(p.assetId || '{asset.id}', ctx);
      result = await iconikClient.post('/API/acls/v1/shares/', {
        object_id: aid, object_type: 'assets', permissions: p.permissions || ['read'],
        expiration_date: r(p.expirationDate || '', ctx) || undefined,
        allow_download: p.allowDownload !== undefined ? p.allowDownload : false,
        require_email: p.requireEmail !== undefined ? p.requireEmail : false,
      });
      if (result.id)        BuilderContext.setVar(ctx, 'share_id', result.id);
      if (result.share_url) BuilderContext.setVar(ctx, 'share_url', result.share_url);
      break;
    }

    case 'custom_action_trigger': {
      const actionId = r(p.customActionId || '', ctx);
      const aid      = r(p.assetId        || '{asset.id}', ctx);
      if (!actionId) throw new Error('custom_action_trigger : customActionId manquant');
      result = await iconikClient.post(`/API/assets/v1/assets/${aid}/custom_actions/${actionId}/execute/`, { metadata: p.metadata || {} });
      break;
    }

    default:
      BuilderContext.addError(ctx, step.id, `Action inconnue : ${type}`, 'warn');
      return { port: 'out' };
  }

  if (result) BuilderContext.storeResult(ctx, '_action_' + step.id, result);

  return { port: 'out' };
}

module.exports = iconikAction;
