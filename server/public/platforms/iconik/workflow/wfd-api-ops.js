// WFD — wfd-api-ops.js — modifié le 2026-06-18 11:48
// ═══════════════════════════════════════════════════════════════════════════
// WFD — API Ops Drawer
// Génère la liste des opérations API pour chaque nœud du flux courant
// ═══════════════════════════════════════════════════════════════════════════

let _apiOpsOpen    = false;
let _apiOpsFluxId  = null;
let _apiOpsData    = [];   // [{ nodeId, nodeName, nodeFamily, ops: [{method,ep,desc,body}] }]
let _apiOpsActive  = null; // nodeId sélectionné

// ── Toggle tiroir ────────────────────────────────────────────────────────────
function toggleApiOpsDrawer() {
  _apiOpsOpen = !_apiOpsOpen;
  const drawer = document.getElementById('api-ops-drawer');
  if (!drawer) return;
  drawer.classList.toggle('open', _apiOpsOpen);
  if (_apiOpsOpen) {
    refreshApiOps();
    setTimeout(_initApiOpsVarsResizer, 50);
  }
}

// Resize vertical entre #api-ops-vars et #api-ops-detail
function _initApiOpsVarsResizer() {
  const resizer   = document.getElementById('api-ops-vars-resizer');
  const varsPanel = document.getElementById('api-ops-vars');
  if (!resizer || !varsPanel || resizer._opsInitDone) return;
  resizer._opsInitDone = true;

  let startY, startH;
  resizer.addEventListener('mousedown', function(e) {
    startY = e.clientY;
    startH = varsPanel.offsetHeight;
    resizer.classList.add('dragging');
    document.body.style.cursor    = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const delta = ev.clientY - startY;
      const minH  = 60;
      const maxH  = Math.round(window.innerHeight * 0.6);
      varsPanel.style.height = Math.max(minH, Math.min(maxH, startH + delta)) + 'px';
    }
    function onUp() {
      resizer.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect  = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Refresh déclenché à la sauvegarde d'un nœud ──────────────────────────────
function refreshApiOps() {
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  if (!flux) return;
  _apiOpsFluxId = flux.id;
  _apiOpsData = buildApiOpsFromFlux(flux);
  renderApiOpsGlobal();
  renderApiOpsVars(flux);
  if (_apiOpsActive) renderApiOpsDetail(_apiOpsActive);
  else renderApiOpsDetailEmpty();
}

// Hook sur sauvegarderConfig pour auto-refresh
// Utilise DOMContentLoaded pour patcher après que tous les scripts soient chargés
// évite le conflit avec wfd-instrumentation.js qui déclare aussi _origSauvegarderConfig
document.addEventListener('DOMContentLoaded', function() {
  if (typeof sauvegarderConfig === 'function') {
    const _prevSaveForOps = sauvegarderConfig;
    sauvegarderConfig = function() {
      _prevSaveForOps.apply(this, arguments);
      if (_apiOpsOpen) setTimeout(refreshApiOps, 100);
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR — Génération des opérations par famille
// ═══════════════════════════════════════════════════════════════════════════

function buildApiOpsFromFlux(flux) {
  const nodes = (flux.nodes || []).filter(n => n.family !== 'postit');

  // Construire l'ordre topologique via les connexions
  const ordered = topoSort(nodes, flux.connections || []);

  return ordered.map(node => ({
    nodeId    : node.id,
    nodeName  : node.name || node.family,
    nodeFamily: node.family,
    nodeColor : (typeof FAMILIES !== 'undefined' && FAMILIES[node.family]?.color) || '#555',
    nodeIcon  : (typeof FAMILIES !== 'undefined' && FAMILIES[node.family]?.icon) || '',
    _cfg      : node.config || {},
    ops       : opsForNode(node, flux),
  })).filter(n => n.ops.length > 0);
}

function topoSort(nodes, connections) {
  // Simple : trouver le nœud sans entrée (trigger), puis suivre les connexions
  const hasInput = new Set(connections.map(c => c.toNode));
  const roots = nodes.filter(n => !hasInput.has(n.id));
  const visited = new Set();
  const result = [];

  function visit(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (node) result.push(node);
    connections
      .filter(c => c.fromNode === nodeId)
      .forEach(c => visit(c.toNode));
  }

  roots.forEach(n => visit(n.id));
  // Ajouter les nœuds non visités (déconnectés)
  nodes.forEach(n => { if (!visited.has(n.id)) result.push(n); });
  return result;
}

// ── Mapping famille → opérations API ─────────────────────────────────────────
function opsForNode(node, flux) {
  const cfg  = node.config || {};
  const ops  = [];
  const conn = (typeof wfdConnexions !== 'undefined') ? wfdConnexions.find(c => c.id === cfg.connexionId) : null;
  const base = conn ? (conn.baseUrl || '') : '';

  const op = (method, ep, desc, body) => ops.push({ method, ep, desc, body: body||null });

  switch (node.family) {

    case 'trigger':
    case 'listener': {
      if (cfg.eventType === 'custom_action') {
        const ca = (typeof wfdData !== 'undefined') ? (wfdData.customActions||[]).find(a => a.id === cfg.customActionId) : null;
        op('POST', '/API/assets/v1/custom_actions/', 'Custom Action « ' + (ca ? ca.title||ca.nom : cfg.customActionId||'?') + ' » sur asset');
      } else if (cfg.eventType === 'metadata_changed') {
        op('GET', '/API/search/v1/search/', 'Evenement : metadata « ' + (cfg.triggerField||'?') + ' » = ' + (cfg.triggerValue||'?'));
      } else if (cfg.eventType === 'webhook') {
        op('POST', '/API/notifications/v1/webhooks/', 'Declenchement webhook Iconik');
      } else if (cfg.eventType === 'saved_search') {
        op('GET', '/API/search/v1/search/saved/' + (cfg.savedSearchId||'{saved_search_id}') + '/results/', 'Declenchement via Saved Search');
      } else if (cfg.eventType === 'automation') {
        op('POST', '/API/automations/v1/automations/' + (cfg.automationId||'{id}') + '/run/', 'Declenchement via Automation');
      } else {
        op('—', '(ecoute evenement Iconik)', 'Evenement : ' + (cfg.eventType||'inconnu'));
      }
      break;
    }

    case 'watchfolder':
      op('—', '(surveillance dossier)', 'Dossier : ' + (cfg.path||cfg.watchPath||'{path}'));
      break;

    case 'timer':
      op('—', '(planificateur)', 'Declenchement : ' + (cfg.schedule||cfg.cron||'{schedule}'));
      break;

    // ── Recherche APS ────────────────────────────────────────
    // Absente jusqu'ici : les noeuds aps_search ne produisaient aucune
    // operation, et buildApiOpsFromFlux ecarte les noeuds sans operation
    // (.filter(n => n.ops.length > 0)). Sur BAYARD|PUBLISH|VODFACTORY, 17
    // noeuds sur 76 disparaissaient donc de Postman, du HTML et du Python —
    // precisement les controles de presence des artworks, videos et
    // sous-titres. Le lecteur croyait tenir la liste complete des appels.
    //
    // Le body reproduit celui du moteur (_apsSearchBuildBody) : doc_types +
    // syntaxe "query" Lucene. Le tableau "filters" natif d'Iconik est ignore
    // par cet endpoint — verifie en conditions reelles — d'ou son maintien a
    // vide, pour la forme seulement.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const collectionIds = [];
        const terms = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            // Un asset se retrouve par in_collections, une collection fille
            // par parent_id : deux champs Iconik distincts, pas
            // interchangeables.
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            collectionIds.push(val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');
        });

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        if (collectionIds.length) body.collection_ids = collectionIds;

        const quoi = (block.criteria || [])
          .filter(c => c.field && c.field !== '__collection__')
          .map(c => c.field + ' ' + (c.op || 'equals') + ' ' + (c.value || ''))
          .join(', ');
        op('POST', '/API/search/v1/search/',
          'Recherche ' + objectType + ((cfg.blocks || []).length > 1 ? ' — bloc ' + (bi + 1) : '') + (quoi ? ' : ' + quoi : ''),
          body);
      });
      break;
    }

    // ── Creer arborescence ───────────────────────────────────
    // Famille absente : create_tree ne produisait aucune operation, et
    // buildApiOpsFromFlux ecarte les noeuds sans operation. Les quatre
    // workflows CREER perdaient donc leur noeud central - sur CREER SERIE et
    // CREER UNITAIRE, c'est un des deux seuls noeuds du flux.
    //
    // Le noeud enchaine deux appels par niveau du modele d'arborescence :
    // creation de la collection, puis ecriture des metadonnees dans la vue.
    case 'create_tree': {
      const idField     = cfg.idFieldName     || 'BayardID';
      const parentField = cfg.parentFieldName || 'ParentID';
      const typeField   = cfg.typeFieldName   || 'TypeCollection';

      op('POST', '/API/assets/v1/collections/',
        'Créer la collection — répété pour chaque niveau du modèle d\'arborescence',
        {
          title    : '<titre du niveau, variables résolues>',
          parent_id: cfg.parentId || '{collection.id}'
        });

      // Les champs ecrits : systeme + supplementaires. On montre la forme
      // exacte attendue par Iconik (field_values), pas un objet a plat.
      const champs = {};
      champs[idField]   = { field_values: [{ value: '<identifiant généré>' }] };
      champs[typeField] = { field_values: [{ value: '<type du niveau>' }] };
      if (cfg.parentBayardId) {
        champs[parentField] = { field_values: [{ value: cfg.parentBayardId }] };
      }
      if (cfg.orderFieldName) {
        champs[cfg.orderFieldName] = { field_values: [{ value: '<numéro d\'ordre, calculé en base>' }] };
      }
      (cfg.extraFields || []).forEach(f => {
        if (f.key) champs[f.key] = { field_values: [{ value: String(f.value ?? '') }] };
      });

      op('PUT', '/API/metadata/v1/collections/{id}/views/' + (cfg.metadataViewId || '{viewId}') + '/',
        'Écrire les métadonnées de la collection créée',
        { metadata_values: champs });
      break;
    }

    case 'fetch': {
      op('GET', '/API/assets/v1/assets/{asset_id}/', 'Recuperer les proprietes de l\'asset');
      const viewId = cfg.metadataViewId || cfg.fetchMdViewId;
      if (viewId) {
        const vn = (typeof wfdData !== 'undefined') ? ((wfdData.mdViews||[]).find(v => v.id === viewId)||{}).name || viewId : viewId;
        op('GET', '/API/metadata/v1/assets/{asset_id}/views/' + viewId + '/', 'Lire la vue MD « ' + vn + ' »');
      }
      if (cfg.withFormats) op('GET', '/API/files/v1/assets/{asset_id}/formats/', 'Recuperer les formats techniques');
      if (cfg.withCollections) op('GET', '/API/assets/v1/assets/{asset_id}/collections/', 'Recuperer les collections parentes');
      break;
    }

    case 'aws_s3': {
      const bucket = (conn && conn.awsBucket) ? conn.awsBucket : (cfg.bucket || '{bucket}');
      const region = (conn && conn.awsRegion) ? conn.awsRegion : (cfg.region || 'eu-north-1');
      const prefix = cfg.prefix || '';
      const s3ep   = 'https://' + bucket + '.s3.' + region + '.amazonaws.com/' + (prefix ? '?list-type=2&prefix=' + encodeURIComponent(prefix) : '');
      const operation = cfg.operation || 'list';
      const methodMap = { list:'GET', head:'HEAD', get:'GET', put:'PUT', delete:'DELETE' };
      op(methodMap[operation] || 'GET', s3ep, 'S3 ' + operation.toUpperCase() + ' — ' + bucket + '/' + prefix + ' [Signature V4 ' + region + ']');
      // Lister les variables produites par les mappings
      const _s3mOps = (cfg.s3Mappings && cfg.s3Mappings.length)
        ? cfg.s3Mappings
        : [
            cfg.s3VarVideo ? { type:'video',    variable: cfg.s3VarVideo } : null,
            cfg.s3VarImage ? { type:'image',    variable: cfg.s3VarImage } : null,
            cfg.s3VarSrt   ? { type:'subtitle', variable: cfg.s3VarSrt   } : null,
          ].filter(Boolean);
      if (_s3mOps.length) {
        ops[ops.length-1].desc += '  →  ' + _s3mOps.map(function(m){ return '{' + m.variable + '}'; }).join(', ');
      }
      break;
    }

    case 'http_request': {
      const method = cfg.method || 'POST';
      const url    = cfg.url || '';
      const full   = url.startsWith('http') ? url : base + url;
      const ignore = (cfg.ignoreCodes && cfg.ignoreCodes.length) ? '  [ignore ' + cfg.ignoreCodes.join(',') + ']' : '';
      let body = null;
      if (cfg.bodyTemplate) { try { body = JSON.parse(cfg.bodyTemplate); } catch(e) { body = cfg.bodyTemplate; } }
      op(method, full, (conn ? conn.name : 'API externe') + ignore, body);
      if (method === 'POST' && cfg.ignoreCodes && cfg.ignoreCodes.indexOf(422) >= 0) {
        op('PUT', full.replace(/\/$/, '') + '/{external_id}/', 'Fallback upsert — PUT si 422 (external_id existant)', body);
      }
      break;
    }

    case 'http_sequence': {
      const seqConn = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).find(function(c){ return c.id === cfg.connexionId; }) || conn;
      const seqBase = seqConn ? (seqConn.baseUrl || '').replace(/\/$/, '') : base;
      (cfg.steps || []).forEach(function(step, i) {
        const mth  = step.method || 'POST';
        const ep   = step.endpoint || step.url || '';
        const full = ep.startsWith('http') ? ep : seqBase + ep;
        const stepName = (step.name || ('Étape ' + (i+1))) + ' [' + (seqConn?.name || 'API') + ']';
        let body = null;
        if (step.httpMode === 'foreach') {
          try { body = JSON.parse(step.feBody || '{}'); } catch(e) { body = step.feBody; }
          const ignore2 = (step.feIgnoreCodes || []).length ? '  [ignore ' + step.feIgnoreCodes.join(',') + ']' : '';
          op(mth, full, stepName + ' — foreach {' + (step.feSourceVar||'?') + '} job=' + (step.feJob||'?') + ignore2, body);
        } else if (step.httpMode === 'action' && step.actionId) {
          const stepAction = seqConn?.actions?.find(function(a){ return a.id === step.actionId; });
          if (stepAction) {
            op(stepAction.method || mth, seqBase + (stepAction.endpoint || ep), stepName, body);
          } else {
            op(mth, full, stepName, body);
          }
        } else {
          try { body = JSON.parse(step.bodyTemplate || '{}'); } catch(e) { body = step.bodyTemplate; }
          op(mth, full, stepName, body);
        }
        if (step.resultVar) {
          ops[ops.length-1].desc += '  →  {' + step.resultVar + '}';
        }
      });
      break;
    }

    case 'action': {
      const at = cfg.actionType;
      if (!at) break;
      if (typeof ACTION_TYPES !== 'undefined' && ACTION_TYPES[at]) {
        const atDef = ACTION_TYPES[at];
        const m2 = (atDef.endpoint||'').match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
        if (m2) { op(m2[1], m2[2], atDef.label || at); }
        else { op('POST', atDef.endpoint || '/API/assets/v1/' + at + '/', atDef.label || at); }
      } else if (at === 'export_location_trigger') {
        op('POST', '/API/files/v1/assets/{asset_id}/export_locations/' + (cfg.exportLocationId||'{export_location_id}') + '/',
          'Export vers Export Location — retourne job_id', { file_name: cfg.fileName||'{Titre}', export_to_asset_folder: !!cfg.exportToAssetFolder });
      } else if (at === 'custom_action_trigger') {
        op('POST', '/API/assets/v1/assets/{asset_id}/custom_actions/' + (cfg.customActionId||'{id}') + '/execute/', 'Declencher une Custom Action');
      } else if (at === 'metadata_write') {
        op('PUT', '/API/metadata/v1/assets/{asset_id}/views/' + (cfg.metadataViewId||cfg.viewId||'{view_id}') + '/', 'Ecrire les metadonnees via vue');
      } else {
        op('POST', '/API/assets/v1/' + at + '/', at);
      }
      break;
    }

    case 'update_meta': {
      const viewId = cfg.metadataViewId || cfg.viewId || '{view_id}';
      const vn = (typeof wfdData !== 'undefined') ? ((wfdData.mdViews||[]).find(v => v.id === viewId)||{}).name || viewId : viewId;
      const method = cfg.method === 'patch' ? 'PATCH' : 'PUT';
      const target = cfg.target === 'collection' ? 'collections' : 'assets';
      const body = { metadata_values: {} };
      (cfg.fields||cfg.values||[]).forEach(function(f) {
        body.metadata_values[f.field||f.key||f.name] = { field_values:[{ value: f.value||'{value}' }] };
      });
      op(method, '/API/metadata/v1/' + target + '/{asset_id}/views/' + viewId + '/', 'Ecrire dans la vue MD « ' + vn + ' »', body);
      break;
    }

    case 'wait_for': {
      const ep   = cfg.endpoint || '';
      const full = ep.startsWith('http') ? ep : base + ep;
      const cond = (cfg.path||'') + ' ' + (cfg.operator||'=') + ' ' + (cfg.expected||'?');
      const tout = (cfg.interval && cfg.maxRetries) ? '  [' + cfg.interval + 's x ' + cfg.maxRetries + ']' : '';
      op('GET', full, 'Polling — attend ' + cond.trim() + tout);
      break;
    }

    case 'checker': {
      const checks = cfg.checks || [];
      if (checks.length) {
        checks.forEach(function(c) {
          const ep   = c.endpoint || '';
          const full = ep.startsWith('http') ? ep : base + ep;
          op(c.method||'GET', full, (c.label||'Verification') + ' — ' + (c.path||'') + ' ' + (c.operator||'') + ' ' + (c.expected||''));
        });
      } else {
        op('GET', base + '/...', 'Verifications configurees dans le noeud');
      }
      break;
    }

    case 'workflow_history': {
      const viewId = cfg.metadataViewId || '{view_id}';
      const vn = (typeof wfdData !== 'undefined') ? ((wfdData.mdViews||[]).find(v => v.id === viewId)||{}).name || viewId : viewId;
      const method = cfg.mode === 'update' ? 'PATCH' : 'PUT';
      const msg = cfg.message ? cfg.message.slice(0,50) + (cfg.message.length>50?'...':'') : '{message}';
      op(method, '/API/metadata/v1/assets/{asset_id}/views/' + viewId + '/', 'Historique dans « ' + vn + ' » — ' + msg);
      break;
    }

    case 'id_generator':
      if (cfg.targetField) {
        op('PATCH', '/API/metadata/v1/assets/{asset_id}/views/{view_id}/', 'Stocker ID genere dans « ' + cfg.targetField + ' »',
          { metadata_values:{ [cfg.targetField]:{ field_values:[{ value:'{generated_id}' }] } } });
      } else {
        op('—', '(operation locale)', 'Genere un ID numerique');
      }
      break;

    case 'lookup':
      op('—', '(operation locale)', 'Mapping ' + (cfg.lkRows ? cfg.lkRows.length : 0) + ' champs : {' + (cfg.lkInputVar||'var') + '} → {' + (cfg.lkOutputVar||'result') + '}');
      break;

    case 'decision':
    case 'qc':
      op('—', '(evaluation locale)', 'Condition sur « ' + (cfg.field||'?') + ' » — ' + ((cfg.conditions||[]).length) + ' sorties');
      break;

    case 'acl': {
      const tgt     = cfg.targetId || '{object_id}';
      const objType = cfg.target === 'asset' ? 'assets' : 'collections';
      const ep      = '/API/acls/v1/' + objType + '/' + tgt + '/access_control/';
      if (cfg.op === 'replace') op('DELETE', ep, 'Supprimer les ACLs existantes');
      (cfg.entries||[]).forEach(function(e) {
        op('POST', ep, 'Appliquer ACL groupe ' + (e.teamId||'?'), { group_id:e.teamId, read:e.read, write:e.write, delete:e.delete });
      });
      if (cfg.propagate) op('POST', ep.replace('/access_control/','/access_control/propagate/'), 'Propager les ACLs');
      if (!cfg.entries || !cfg.entries.length) op('POST', ep, 'Appliquer permissions');
      break;
    }

    case 'notification':
    case 'notify_post': {
      const recs = cfg.recipients || [];
      if (recs.length) {
        recs.forEach(function(r) {
          const wh = (r.config && r.config.webhook_url) ? r.config.webhook_url : (r.url || 'https://{webhook}');
          op('POST', wh, 'Notification ' + (r.channel||r.type||'webhook'), { text: (r.config && r.config.message) ? r.config.message : (r.message||'{message}') });
        });
      } else {
        op('POST', 'https://{webhook_url}', 'Envoyer notification');
      }
      break;
    }

    case 'loop': {
      const col = cfg.collection || '{collection_id}';
      if (cfg.loopSource === 'files')      op('GET', '/API/files/v1/assets/{asset_id}/file_sets/', 'Lister les fichiers de l\'asset');
      else if (cfg.loopSource === 'assets') op('GET', '/API/assets/v1/collections/' + col + '/contents/', 'Lister les assets de la collection');
      else if (cfg.loopSource === 'collection') op('GET', '/API/assets/v1/collections/' + col + '/collections/', 'Lister les sous-collections');
      else op('—', '(operation locale)', 'Iteration sur liste JSON');
      break;
    }

    case 'approval':
      op('POST', '/API/assets/v1/assets/{asset_id}/approval/', 'Creer demande d\'approbation', { message:cfg.message||'' });
      break;

    case 'script':
      op('—', '(script local)', (cfg.lang||'JS') + ' — ' + (cfg.code||'').split('\n')[0].slice(0,60));
      break;

    case 'subflow':
      op('—', '(appel sous-flux)', 'Appeler le flux « ' + (cfg.workflowId||cfg.flowRef||'?') + ' »');
      break;

    case 'set_var': case 'transform': case 'rename':
      op('—', '(operation locale)', 'Transformation des donnees du contexte');
      break;

    case 'create_asset':
      op('POST', '/API/assets/v1/assets/', 'Creer un nouvel asset', { title:cfg.title||'{title}', status:'ACTIVE' });
      break;

    case 'create_col':
      op('POST', '/API/assets/v1/collections/', 'Creer une collection', { title:cfg.title||'{title}', parent_id:cfg.parentId||null });
      break;

    case 'transcode':
      op('GET',  '/API/files/v1/assets/{asset_id}/files/', 'Lister les fichiers source');
      op('POST', '/API/transcode/v1/jobs/', 'Lancer le transcodage', { asset_id:'{asset_id}', profile:cfg.profile||'{profile}' });
      break;

    case 'relate':
      op('POST', '/API/assets/v1/assets/{asset_id}/relations/', 'Creer une relation entre assets', { related_to_asset_id:'{asset_b_id}', relation_type:cfg.relationType||'related_to' });
      break;

    case 'cast':
      op('POST', cfg.url||'{webhook_url}', 'Declencher webhook sortant', cfg.body||null);
      break;
  }

  return ops;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════════

function renderApiOpsGlobal() {
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const nameEl  = document.getElementById('api-ops-flux-name');
  const countEl = document.getElementById('api-ops-count');
  const global  = document.getElementById('api-ops-global');
  if (!global) return;

  if (nameEl) nameEl.textContent = flux ? (flux.name || '') : '';
  const totalOps = _apiOpsData.reduce((n,d) => n + d.ops.filter(function(o){return o.method!=='—';}).length, 0);
  if (countEl) countEl.textContent = totalOps + ' opération' + (totalOps>1?'s':'') + ' API';

  if (!_apiOpsData.length) {
    global.innerHTML = '<span style="font-size:11px;color:#333;align-self:center;">Aucun nœud configuré dans ce flux</span>';
    return;
  }

  // Timeline : une carte par opération dans l'ordre chronologique
  const timeline = [];
  _apiOpsData.forEach(function(nd) {
    nd.ops.forEach(function(op, opIdx) {
      timeline.push({ nd:nd, op:op, opIdx:opIdx });
    });
  });

  let html = '';
  timeline.forEach(function(item, i) {
    const nd         = item.nd;
    const op         = item.op;
    const opIdx      = item.opIdx;
    const active     = nd.nodeId === _apiOpsActive ? ' active' : '';
    const isLocal    = op.method === '—';
    const methodClass = isLocal ? 'method-local' : 'method-' + op.method;
    // Raccourcir l'endpoint : retirer https://, remplacer les UUIDs et vars
    const epShort    = (op.ep || '')
      .replace('https://', '')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{id}')
      .replace(/\{[^}]+\}/g, '{…}');
    // Nom du noeud sur la première op seulement, puis indicateur de continuation
    const nodeLabel = opIdx === 0
      ? escHtmlOps(nd.nodeIcon + ' ' + nd.nodeName)
      : '<span style="color:#333;font-size:9px;">&#8627; ' + escHtmlOps(nd.nodeName) + '</span>';
    // Flèche : → entre noeuds différents, ↓ entre ops du même noeud
    let arrow = '';
    if (i < timeline.length - 1) {
      const nextNd = timeline[i+1].nd;
      arrow = nextNd.nodeId !== nd.nodeId
        ? '<div class="api-op-arrow">→</div>'
        : '<div class="api-op-arrow" style="color:#2a2a2a;font-size:10px;padding:0 2px;">↓</div>';
    }

    html += '<div class="api-op-card' + active + '"' +
      ' onclick="selectApiOpsNode(\'' + nd.nodeId + '\')"' +
      ' title="' + escHtmlOps(op.desc) + '">' +
      '<div class="api-op-node-name">' + nodeLabel + '</div>' +
      '<div class="api-op-method ' + methodClass + '">' + op.method + '</div>' +
      '<div class="api-op-ep">' + escHtmlOps(epShort) + '</div>' +
      '</div>' + arrow;
  });

  global.innerHTML = html;
}

function selectApiOpsNode(nodeId) {
  _apiOpsActive = nodeId;
  // Mettre à jour l'état actif dans la timeline
  document.querySelectorAll('.api-op-card').forEach(c => {
    c.classList.toggle('active', c.onclick?.toString().includes(nodeId));
  });
  // Méthode plus fiable : relire depuis les cards
  document.querySelectorAll('.api-op-card').forEach(c => {
    const match = c.getAttribute('onclick')?.includes(nodeId);
    c.classList.toggle('active', !!match);
  });
  renderApiOpsDetail(nodeId);
}

function renderApiOpsDetailEmpty() {
  const detail = document.getElementById('api-ops-detail');
  if (detail) detail.innerHTML = '<div class="api-detail-empty">Cliquez sur un nœud pour voir le détail de ses opérations</div>';
}

// ── Flux de variables ─────────────────────────────────────────────────────────
function _opsCollectVars(nodes, connexions) {
  const nodeMap = {};
  const conns   = connexions || (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []);

  const cleanVar = function(v) {
    if (!v) return null;
    v = (v.startsWith('{') && v.endsWith('}')) ? v.slice(1,-1) : v;
    return (v && v.length > 1 && !v.includes('/') && !v.includes(':')) ? v : null;
  };

  const extractVars = function(str) {
    return (str || '').match(/\{([a-zA-Z_][a-zA-Z0-9_.À-ÿ]*)\}/g)
      ?.map(function(m){ return m.slice(1,-1); })
      .filter(function(v){ return v.length > 1 && !v.includes('/') && !v.includes(':'); }) || [];
  };

  nodes.forEach(function(n) {
    const cfg  = n.config || {};
    const name = n.name || n.id;
    const conn = conns.find(function(c){ return c.id === cfg.connexionId; });
    const connName = conn ? conn.name : null;

    // Source du nœud
    let source = 'wfd';
    if (['trigger','fetch','update_meta','workflow_history'].includes(n.family)) source = 'iconik';
    else if (['aws_s3','wait_for'].includes(n.family)) source = 's3';
    else if (n.family === 'http_sequence' || n.family === 'http_request') {
      const base = (conn?.baseUrl || '').toLowerCase();
      source = (base.includes('vodfactory') || base.includes('partner')) ? 'vodfactory' : 'api';
    }

    const info = { source, connexion: connName, targets: [], stores: [], steps: [] };

    switch (n.family) {
      case 'trigger': {
        // Endpoint de la custom action
        const slug = cfg.wfdSlug || cfg.customActionId || '';
        if (slug) info.targets.push({ v: '/wfd/action/' + slug, src: 'iconik' });
        info.stores.push({ v: 'asset_id', src: 'iconik' });
        break;
      }

      case 'workflow_history':
        info.targets.push({ v: 'asset_id', src: 'iconik' });
        if (cfg.whLine || cfg.message) info.stores.push({ v: cfg.whField || 'LivraisonsAmazonPrime', src: 'iconik' });
        break;

      case 'fetch': {
        // Cible = asset_id (hérité du flux)
        info.targets.push({ v: 'asset_id', src: 'iconik' });
        const outVar = cleanVar(cfg.lkInputVar || cfg.fetchVar || cfg.storeAs || cfg.resultVar);
        if (outVar) info.stores.push({ v: outVar, src: 'iconik' });
        break;
      }

      case 'update_meta':
        info.targets.push({ v: 'asset_id', src: 'iconik' });
        extractVars(JSON.stringify(cfg.fields || cfg.values || {})).slice(0,2).forEach(function(v){
          info.stores.push({ v: v, src: 'iconik' });
        });
        break;

      case 'aws_s3': {
        if (connName) info.connexion = connName;
        const prefix = cfg.objectKey || cfg.prefix || '';
        if (prefix) info.targets.push({ v: prefix, src: 'wfd' });
        const maps = (cfg.s3Mappings && cfg.s3Mappings.length) ? cfg.s3Mappings
          : [ cfg.s3VarVideo ? {variable:cfg.s3VarVideo} : null,
              cfg.s3VarImage ? {variable:cfg.s3VarImage} : null,
              cfg.s3VarSrt   ? {variable:cfg.s3VarSrt}   : null ].filter(Boolean);
        maps.forEach(function(m){ if (m.variable) info.stores.push({ v: m.variable, src: 's3' }); });
        break;
      }

      case 'action': {
        // Export Location et autres actions
        info.targets.push({ v: 'asset_id', src: 'iconik' });
        extractVars(JSON.stringify(cfg.params || cfg.body || {})).forEach(function(v){
          info.targets.push({ v: v, src: 'wfd' });
        });
        if (cfg.exportLocationVar || cfg.resultVar) {
          const rv = cleanVar(cfg.exportLocationVar || cfg.resultVar);
          if (rv) info.stores.push({ v: rv, src: 'wfd' });
        }
        break;
      }

      case 'wait_for': {
        if (connName) info.connexion = connName;
        // Polling
        if (cfg.endpoint) info.targets.push({ v: cfg.endpoint, src: 'wfd' });
        if (cfg.resultVar) info.stores.push({ v: cfg.resultVar, src: 'wfd' });
        // Post-action S3
        if (cfg.s3ConnexionId) {
          const s3conn = conns.find(function(c){ return c.id === cfg.s3ConnexionId; });
          if (s3conn) info.connexion = (info.connexion ? info.connexion + ' + ' : '') + s3conn.name;
          if (cfg.s3Prefix) info.targets.push({ v: cfg.s3Prefix, src: 's3' });
          const wfMaps = (cfg.s3Mappings && cfg.s3Mappings.length) ? cfg.s3Mappings
            : [ cfg.s3VarVideo ? {variable:cfg.s3VarVideo} : null,
                cfg.s3VarImage ? {variable:cfg.s3VarImage} : null,
                cfg.s3VarSrt   ? {variable:cfg.s3VarSrt}   : null ].filter(Boolean);
          wfMaps.forEach(function(m){ if (m.variable) info.stores.push({ v: m.variable, src: 's3' }); });
        }
        break;
      }

      case 'decision': {
        // Variable évaluée
        const dField = cfg.field || '';
        if (dField) {
          extractVars(dField).forEach(function(v){ info.targets.push({ v: v, src: 'wfd' }); });
          if (!extractVars(dField).length) info.targets.push({ v: dField, src: 'wfd' });
        }
        (cfg.conditions || []).slice(0,2).forEach(function(c){
          if (c.label) info.stores.push({ v: c.label, src: 'wfd' });
        });
        if (cfg.defaultLabel) info.stores.push({ v: cfg.defaultLabel, src: 'wfd' });
        break;
      }

      case 'id_generator': {
        const ov = cleanVar(cfg.varName || cfg.outputVar || cfg.generatedVar || cfg.resultVar);
        if (ov) info.stores.push({ v: ov, src: 'wfd' });
        if (cfg.idType) info.targets.push({ v: cfg.idType + ' ' + (cfg.idLength||8) + ' car.', src: 'wfd' });
        break;
      }

      case 'lookup': {
        // Source → sortie (résumé)
        const inVar  = cleanVar(cfg.lkInputVar);
        const outVar = cleanVar(cfg.lkOutputVar);
        if (inVar)  info.targets.push({ v: inVar,  src: 'iconik' });
        if (outVar) info.stores.push({ v: outVar,  src: 'wfd' });
        // Variables Iconik en entrée (résumé — 3 max + compteur)
        const rows = (cfg.lkRows || []).filter(function(r){ return r.key; });
        rows.slice(0, 3).forEach(function(r){
          info.targets.push({ v: r.key, src: 'iconik' });
        });
        if (rows.length > 3) info.targets.push({ v: '+' + (rows.length - 3) + ' champs', src: 'iconik' });
        break;
      }

      case 'http_sequence': {
        // Résumé : variables consommées + produites par toutes les étapes
        const steps = cfg.steps || [];
        extractVars((cfg.connexionId || '') + ' ' + steps.map(function(s){
          return (s.feSourceVar||'') + ' ' + (s.sourceVar||'');
        }).join(' ')).forEach(function(v){ info.targets.push({ v: v, src: 'wfd' }); });
        steps.forEach(function(step) {
          if (step.resultVar)   info.stores.push({ v: step.resultVar,   src: source });
          if (step.feResultVar && step.feResultVar !== step.resultVar)
                                info.stores.push({ v: step.feResultVar, src: source });
        });
        // Détail des étapes pour l'expand
        info.steps = steps.map(function(s) {
          return {
            name    : s.name || '',
            mode    : s.httpMode || 'simple',
            method  : s.method  || 'POST',
            endpoint: s.endpoint || s.url || '',
            result  : s.resultVar || '',
          };
        });
        break;
      }

      case 'http_request': {
        extractVars((cfg.bodyTemplate||'') + ' ' + (cfg.url||'')).forEach(function(v){
          info.targets.push({ v: v, src: 'wfd' });
        });
        const rv = cleanVar(cfg.responseVar || cfg.resultVar || cfg.feResultVar);
        if (rv) info.stores.push({ v: rv, src: source });
        break;
      }

      case 'checker': {
        (cfg.checks || []).forEach(function(c){
          extractVars(c.endpoint || '').forEach(function(v){
            info.targets.push({ v: v, src: 'wfd' });
          });
        });
        info.stores.push({ v: 'Succès / Échec', src: 'wfd' });
        break;
      }
    }

    // Dédupliquer
    const dedup = function(arr) {
      const seen = new Set();
      return arr.filter(function(x){ if (seen.has(x.v)) return false; seen.add(x.v); return true; });
    };
    info.targets = dedup(info.targets);
    info.stores  = dedup(info.stores);
    nodeMap[name] = info;
  });

  return nodeMap;
}

function renderApiOpsVars(flux) {
  const container = document.getElementById('api-ops-vars');
  if (!container) return;

  const allNodes    = (flux.nodes || []).filter(function(n){ return n.family !== 'postit'; });
  const sortedNodes = topoSort(allNodes, flux.connections || []);
  const nodeMap     = _opsCollectVars(sortedNodes);

  const srcStyle = {
    iconik:    'background:#0d1f30;color:#7ec8e3;border:0.5px solid #1a3a50',
    s3:        'background:#0d2010;color:#7dce82;border:0.5px solid #1a4020',
    vodfactory:'background:#2a1a00;color:#f0a030;border:0.5px solid #4a3000',
    api:       'background:#2a1a00;color:#f0a030;border:0.5px solid #4a3000',
    wfd:       'background:#1a1a2e;color:#9090c0;border:0.5px solid #2a2a4a',
  };
  const srcBadge = {
    iconik:    'background:#0d1f30;color:#7ec8e3;border-color:#1a3a50',
    s3:        'background:#0d2010;color:#7dce82;border-color:#1a4020',
    vodfactory:'background:#2a1a00;color:#f0a030;border-color:#4a3000',
    api:       'background:#2a1a00;color:#f0a030;border-color:#4a3000',
    wfd:       'background:#1a1a2e;color:#7070a0;border-color:#2a2a4a',
  };
  const srcLabel = { iconik:'Iconik', s3:'S3', vodfactory:'VodFactory', api:'API', wfd:'WFD' };
  const famIcon  = {
    trigger:'⚡', fetch:'📥', lookup:'🗂', aws_s3:'☁', wait_for:'⏳',
    http_sequence:'⛓', http_request:'🌐', update_meta:'✏', workflow_history:'📋',
    action:'⚙', id_generator:'#', decision:'◇', checker:'✓',
  };

  const pill = function(v, src) {
    const st = srcStyle[src] || srcStyle.wfd;
    const display = v.startsWith('+') ? v : '{' + v + '}';
    return '<span style="display:inline-block;font-size:9px;padding:1px 4px;border-radius:3px;'
      + 'margin:1px 1px 1px 0;max-width:136px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      + 'font-family:monospace;' + st + '" title="' + escHtmlOps(display) + '">' + escHtmlOps(display) + '</span>';
  };

  const sectionLabel = function(txt) {
    return '<div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.04em;margin-top:4px;">' + txt + '</div>';
  };

  let html = '<div style="padding:6px 14px 2px;font-size:10px;font-weight:500;color:#555;'
    + 'text-transform:uppercase;letter-spacing:.06em;">Flux de données</div>'
    + '<div style="display:flex;align-items:flex-start;gap:0;padding:4px 14px 10px;">';

  sortedNodes.forEach(function(n, i) {
    const name = n.name || n.id;
    const info = nodeMap[name];
    if (!info) return;

    const icon  = famIcon[n.family] || '●';
    const badge = srcBadge[info.source] || srcBadge.wfd;
    const label = srcLabel[info.source] || 'WFD';

    let inner = '';

    // Connexion si présente
    if (info.connexion) {
      inner += sectionLabel('Connexion')
        + '<div style="font-size:9px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:138px;" title="'
        + escHtmlOps(info.connexion) + '">' + escHtmlOps(info.connexion) + '</div>';
    }

    // Cible
    if (info.targets.length) {
      inner += sectionLabel('Cible')
        + '<div class="wfd-flex-wrap-1">'
        + info.targets.map(function(x){ return pill(x.v, x.src); }).join('')
        + '</div>';
    }

    // Stockage
    if (info.stores.length) {
      inner += sectionLabel('Stockage')
        + '<div class="wfd-flex-wrap-1">'
        + info.stores.map(function(x){ return pill(x.v, x.src); }).join('')
        + '</div>';
    }

    // Expand pour http_sequence
    if (n.family === 'http_sequence' && info.steps && info.steps.length) {
      const stepId = 'hseq-expand-' + i;
      inner += '<div style="margin-top:4px;border-top:0.5px solid #222;padding-top:4px;">'
        + '<div onclick="(function(){var el=document.getElementById(\'' + stepId + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';})();"'
        + ' style="font-size:9px;color:#555;cursor:pointer;user-select:none;">&#9658; ' + info.steps.length + ' étapes</div>'
        + '<div id="' + stepId + '" style="display:none;margin-top:3px;">'
        + info.steps.map(function(s, si) {
            return '<div style="font-size:9px;color:#555;padding:1px 0;">'
              + '<span style="color:#f0a030;">' + (si+1) + '.</span> '
              + escHtmlOps(s.name || s.endpoint || 'Étape ' + (si+1))
              + (s.result ? ' <span style="color:#7dce82;">→{' + escHtmlOps(s.result) + '}</span>' : '')
              + '</div>';
          }).join('')
        + '</div></div>';
    }

    // Si rien à afficher
    if (!info.connexion && !info.targets.length && !info.stores.length) {
      inner += '<div style="font-size:9px;color:#333;font-style:italic;margin-top:4px;">—</div>';
    }

    const card = '<div style="background:#141414;border:0.5px solid #222;border-radius:5px;'
      + 'padding:7px 9px;min-width:150px;max-width:165px;flex-shrink:0;">'
      + '<div style="display:flex;align-items:center;gap:4px;margin-bottom:5px;">'
      + '<span style="font-size:11px;">' + icon + '</span>'
      + '<span style="font-size:10px;font-weight:500;color:#d0d0d0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escHtmlOps(name) + '">' + escHtmlOps(name) + '</span>'
      + '<span style="font-size:9px;padding:1px 4px;border-radius:3px;border:0.5px solid;flex-shrink:0;' + badge + '">' + label + '</span>'
      + '</div>'
      + '<div style="border-top:0.5px solid #1e1e1e;margin-bottom:4px;"></div>'
      + inner
      + '</div>';

    const arrow = i < sortedNodes.length - 1
      ? '<div style="display:flex;align-items:flex-start;padding:18px 3px 0;color:#2a2a2a;font-size:12px;flex-shrink:0;">→</div>'
      : '';

    html += card + arrow;
  });

  html += '</div>';
  container.innerHTML = html;
}


function renderApiOpsDetail(nodeId) {
  const detail = document.getElementById('api-ops-detail');
  if (!detail) return;
  const nd = _apiOpsData.find(d => d.nodeId === nodeId);
  if (!nd) { renderApiOpsDetailEmpty(); return; }

  const opsHtml = nd.ops.map(op => {
    const methodClass = op.method !== '—' ? 'method-' + op.method : 'method-GET';
    const bodyStr = op.body ? JSON.stringify(op.body, null, 2) : null;
    return `<div class="api-detail-op">
      <div class="api-detail-op-line">
        <span class="api-op-method ${methodClass}">${op.method}</span>
        <span class="wfd-c-888-10">${escHtmlOps(op.desc)}</span>
      </div>
      <div class="api-detail-op-ep">${escHtmlOps(op.ep)}</div>
      ${bodyStr ? `<div class="api-detail-body-label">BODY</div><pre class="api-detail-body-code">${escHtmlOps(bodyStr)}</pre>` : ''}
    </div>`;
  }).join('');

  detail.innerHTML = `
    <div class="api-detail-node-title">
      <span style="color:${nd.nodeColor};">${nd.nodeIcon}</span>
      ${escHtmlOps(nd.nodeName)}
      <span style="font-size:9px;color:#444;font-family:var(--font);">${nd.nodeFamily}</span>
    </div>
    <div class="api-detail-ops">${opsHtml}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

function getExportMeta() {
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const org  = localStorage.getItem('organisationName') || 'Iconik';
  return { flux, org, date: new Date().toISOString(), slug: (org).replace(/\s+/g,'-') };
}

// ── Collecte des connexions utilisées dans le flux ────────────
function _getFluxConnections(flux) {
  const used = {};
  (flux.nodes || []).forEach(function(n) {
    const cid = n.config && n.config.connexionId;
    if (!cid) return;
    if (typeof wfdConnexions === 'undefined') return;
    const c = wfdConnexions.find(function(x) { return x.id === cid; });
    if (c && !used[cid]) used[cid] = c;
  });
  return Object.values(used);
}

// ── Postman ───────────────────────────────────────────────────
function exportApiOpsPostman() {
  const { flux, org, date, slug } = getExportMeta();
  if (!_apiOpsData.length) { alert('Aucune opération à exporter.'); return; }

  const fluxConns = flux ? _getFluxConnections(flux) : [];

  // Variables d'environnement : une par connexion + Iconik + AWS + asset_id
  const variables = [
    { key:'asset_id',         value:'',                         description:'ID de l\'asset Iconik de départ' },
    { key:'iconik_base_url',  value:'https://app.iconik.io',    description:'URL de base Iconik' },
    { key:'iconik_app_id',    value:'',                         description:'App-ID Iconik (Settings > Applications)' },
    { key:'iconik_auth_token',value:'',                         description:'Auth-Token Iconik' },
  ];

  fluxConns.forEach(function(c) {
    const vkey = c.name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
    if (c.authType === 'aws_s3') {
      variables.push({ key: vkey + '_aws_access_key', value:'', description:'AWS Access Key — ' + c.name });
      variables.push({ key: vkey + '_aws_secret_key', value:'', description:'AWS Secret Key — ' + c.name });
      variables.push({ key: vkey + '_aws_region',     value: c.awsRegion||'eu-north-1', description:'Région AWS' });
      variables.push({ key: vkey + '_aws_bucket',     value: c.awsBucket||'', description:'Bucket S3' });
    } else if (c.baseUrl) {
      variables.push({ key: vkey + '_base_url', value: c.baseUrl, description:'URL de base — ' + c.name });
      variables.push({ key: vkey + '_token',    value: '',         description:'Bearer Token — ' + c.name });
    }
  });

  // Grouper par nœud (folder Postman) → une requête par opération
  const folders = [];

  _apiOpsData.forEach(function(nd) {
    const apiOps = nd.ops.filter(function(op) { return op.method !== '—'; });
    if (!apiOps.length) return;

    const folderItems = [];

    apiOps.forEach(function(op, opIdx) {
      const isIconik    = op.ep.startsWith('/API/') || (!op.ep.startsWith('http'));
      const isAws       = op.ep.includes('.amazonaws.com') || op.ep.includes('s3.');
      const isExternal  = op.ep.startsWith('http') && !isAws;

      // Construire l'URL Postman
      let rawUrl = op.ep;
      let host, path, query = [];

      if (isIconik) {
        rawUrl = '{{iconik_base_url}}' + op.ep;
        host   = ['{{iconik_base_url}}'];
        path   = op.ep.split('/').filter(Boolean);
      } else if (isAws) {
        // Séparer base + query string
        const parts = op.ep.split('?');
        rawUrl = parts[0];
        host   = [parts[0]];
        path   = [];
        if (parts[1]) {
          parts[1].split('&').forEach(function(q) {
            const kv = q.split('=');
            query.push({ key: kv[0], value: kv[1]||'' });
          });
        }
      } else {
        host = [op.ep.split('/')[2] || op.ep];
        path = op.ep.split('/').slice(3).filter(Boolean);
      }

      // Headers selon le type de connexion
      const headers = [];
      if (isIconik) {
        headers.push({ key:'App-ID',       value:'{{iconik_app_id}}',    type:'text' });
        headers.push({ key:'Auth-Token',   value:'{{iconik_auth_token}}',type:'text' });
        headers.push({ key:'Content-Type', value:'application/json',      type:'text' });
      } else if (isAws) {
        headers.push({ key:'Content-Type', value:'application/json', type:'text' });
        // Note AWS Signature V4 — Postman le gère via auth type AWS
      } else {
        // Trouver la connexion correspondante
        const matchConn = fluxConns.find(function(c) {
          return c.baseUrl && op.ep.startsWith(c.baseUrl);
        });
        const vkey = matchConn ? matchConn.name.toLowerCase().replace(/[^a-z0-9]+/g,'_') : 'external';
        headers.push({ key:'Authorization', value:'Bearer {{' + vkey + '_token}}', type:'text' });
        headers.push({ key:'Content-Type',  value:'application/json', type:'text' });
      }

      // Corps de la requête
      let body = undefined;
      if (op.body) {
        body = { mode:'raw', raw: JSON.stringify(op.body, null, 2), options:{ raw:{ language:'json' } } };
      }

      // Auth AWS Signature V4
      let auth = undefined;
      if (isAws) {
        const awsConn = fluxConns.find(function(c) { return c.authType === 'aws_s3'; });
        const vkey = awsConn ? awsConn.name.toLowerCase().replace(/[^a-z0-9]+/g,'_') : 'aws';
        auth = {
          type: 'awsv4',
          awsv4: [
            { key:'accessKey', value:'{{' + vkey + '_aws_access_key}}', type:'string' },
            { key:'secretKey', value:'{{' + vkey + '_aws_secret_key}}', type:'string' },
            { key:'region',    value:'{{' + vkey + '_aws_region}}',     type:'string' },
            { key:'service',   value:'s3',                               type:'string' },
          ]
        };
      }

      // Test scripts — tout piloté par cfg du nœud
      const nodeCfg  = nd._cfg || {};  // cfg du nœud original
      const testLines = [
        'pm.test("Status OK", function() {',
        '    pm.response.to.have.status(' + (op.method === 'POST' ? '201' : '200') + ');',
        '});',
        'try {',
        '    const data = pm.response.json();',
      ];

      if (nd.nodeFamily === 'fetch') {
        // Stocker l'asset_id et la variable de sortie si définie (lkInputVar = ce que fetch produit)
        testLines.push('    if (data.id) pm.collectionVariables.set("asset_id", data.id);');
        if (nodeCfg.lkInputVar) {
          testLines.push('    pm.collectionVariables.set("' + nodeCfg.lkInputVar + '", data);');
        }
      } else if (nd.nodeFamily === 'action') {
        // job_id retourné par export — clé lue depuis cfg si disponible
        const jobVar = nodeCfg.jobVar || 'job_id';
        testLines.push('    const jobId = data.job_id || data.id;');
        testLines.push('    if (jobId) pm.collectionVariables.set("' + jobVar + '", jobId);');
      } else if (nd.nodeFamily === 'http_request' || nd.nodeFamily === 'http_group') {
        // responseVar depuis cfg — c'est la variable que WFD utilise pour stocker la réponse
        const respVar = nodeCfg.responseVar || (nd.nodeFamily + '_response');
        testLines.push('    pm.collectionVariables.set("' + respVar + '", JSON.stringify(data));');
        // Si POST upsert, stocker l'external_id pour le PUT éventuel
        if (op.method === 'POST' && nodeCfg.ignoreCodes && nodeCfg.ignoreCodes.indexOf(422) >= 0) {
          const extId = 'external_id';
          testLines.push('    if (data.id || data.external_id) pm.collectionVariables.set("' + extId + '", data.id || data.external_id);');
        }
      } else if (nd.nodeFamily === 'wait_for') {
        // path et expected depuis cfg — afficher la valeur surveillée
        const watchPath = nodeCfg.path || 'status';
        const expected  = nodeCfg.expected || 'COMPLETED';
        testLines.push('    // Surveille : ' + watchPath + ' === ' + expected);
        testLines.push('    const val = data' + watchPath.split('.').map(function(k){ return '["' + k + '"]'; }).join('') + ';');
        testLines.push('    console.log("' + watchPath + ' =", val);');
        if (nodeCfg.failValues) {
          testLines.push('    pm.test("Pas en echec", function() {');
          testLines.push('        pm.expect(String(val)).to.not.be.oneOf(' + JSON.stringify(Array.isArray(nodeCfg.failValues) ? nodeCfg.failValues : [nodeCfg.failValues]) + ');');
          testLines.push('    });');
        }
      } else if (nd.nodeFamily === 'lookup') {
        // Variable de sortie du lookup
        if (nodeCfg.lkOutputVar) {
          testLines.push('    // Variable de sortie lookup : ' + nodeCfg.lkOutputVar);
        }
      }
      testLines.push('} catch(e) { console.warn("Parse error:", e); }');

      // Pre-request script pour le fallback PUT upsert — lit l'external_id stocké
      let preRequest = undefined;
      if (op.method === 'PUT' && opIdx > 0) {
        const extId = 'external_id';
        preRequest = 'const extId = pm.collectionVariables.get("' + extId + '"); if (extId) { const url = pm.request.url.toString(); pm.request.url = url.replace("{external_id}", extId); }';
      }

      const item = {
        name: nd.nodeName + (apiOps.length > 1 ? ' [' + (opIdx+1) + '/' + apiOps.length + '] ' + op.method : ''),
        request: {
          method: op.method,
          header: headers,
          body,
          url: { raw:rawUrl, host, path, query: query.length ? query : undefined },
          description: op.desc,
          auth,
        },
        event: [
          { listen:'test', script:{ exec: testLines, type:'text/javascript' } },
          preRequest ? { listen:'prerequest', script:{ exec:[preRequest], type:'text/javascript' } } : null,
        ].filter(Boolean),
      };

      folderItems.push(item);
    });

    folders.push({
      name: nd.nodeIcon + ' ' + nd.nodeName + ' (' + nd.nodeFamily + ')',
      description: nd.ops[0].desc,
      item: folderItems,
    });
  });

  const collection = {
    info: {
      _postman_id: 'wfd-' + Date.now(),
      name: (flux ? flux.name : 'Workflow') + ' — ' + org,
      description: 'Généré par WFD le ' + new Date(date).toLocaleString('fr-FR') + '\nWorkflow : ' + (flux ? flux.name : '') + '\nOrganisation : ' + org,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: variables,
    item: folders,
  };

  _downloadJSON(collection, slug + '-' + (flux ? flux.name : 'workflow').replace(/\s+/g,'-') + '-postman.json');
  if (typeof toast === 'function') toast('Collection Postman exportée — ' + folders.length + ' dossiers, variables pré-configurées');
}

// ── Python ────────────────────────────────────────────────────
// ── HTML/PDF ──────────────────────────────────────────────────────────────────
function exportApiOpsHTML() {
  const { flux, org, date, slug } = getExportMeta();
  if (!_apiOpsData.length) { alert('Aucune operation a exporter.'); return; }

  const methodColor = { GET:'#27ae60', POST:'#3498db', PUT:'#e67e22', PATCH:'#9b59b6', DELETE:'#e74c3c', '—':'#555' };

  const sections = _apiOpsData.map(function(nd, idx) {
    const opsHtml = nd.ops.map(function(op) {
      const bodyHtml = op.body ? '<div style="font-size:9px;color:#444;margin:4px 0 2px;font-family:monospace;">BODY</div><pre style="font-size:9px;font-family:monospace;color:#555;background:#0a0a0a;padding:6px 8px;border-radius:3px;overflow-x:auto;margin:0;">' + escHtmlOps(JSON.stringify(op.body,null,2)) + '</pre>' : '';
      return '<div style="margin-bottom:8px;padding:8px 10px;background:#F8F8F8;border:1px solid #E0E0E0;border-radius:4px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:2px;background:' + (methodColor[op.method]||'#555') + '22;color:' + (methodColor[op.method]||'#555') + ';border:1px solid ' + (methodColor[op.method]||'#555') + '44;font-family:monospace;">' + op.method + '</span>' +
        '<span class="wfd-c-888-10">' + escHtmlOps(op.desc) + '</span></div>' +
        '<div style="font-family:monospace;font-size:10px;color:#0F4761;background:#EEF3F8;padding:4px 8px;border-radius:3px;word-break:break-all;">' + escHtmlOps(op.ep) + '</div>' +
        bodyHtml + '</div>';
    }).join('');
    return '<div style="margin-bottom:20px;page-break-inside:avoid;">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#0F4761;border:1px solid #0F4761;border-radius:5px 5px 0 0;">' +
      '<span style="background:#B3B104;color:#000;font-size:9px;font-family:monospace;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">' + (idx+1) + '</span>' +
      '<span style="color:' + nd.nodeColor + ';font-size:12px;">' + nd.nodeIcon + '</span>' +
      '<span style="font-weight:700;color:#ffffff;font-size:11px;">' + escHtmlOps(nd.nodeName) + '</span>' +
      '<span style="font-size:9px;color:rgba(255,255,255,0.5);font-family:monospace;">' + nd.nodeFamily + '</span>' +
      '<span style="margin-left:auto;font-size:9px;color:rgba(255,255,255,0.6);">' + nd.ops.length + ' op' + (nd.ops.length>1?'s':'') + '</span></div>' +
      '<div style="padding:10px;background:#FAFAFA;border:1px solid #E0E0E0;border-top:none;border-radius:0 0 5px 5px;">' + opsHtml + '</div></div>';
  }).join('');

  const totalOps = _apiOpsData.reduce(function(n,d){ return n + d.ops.filter(function(o){return o.method!=='—';}).length; }, 0);
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>API Ops — ' + escHtmlOps((flux&&flux.name)||'Workflow') + ' — ' + escHtmlOps(org) + '</title>' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:\"Courier New\",monospace;background:#ffffff;color:#1a1a1a;padding:28px 32px;}' +
    'h1{font-size:17px;color:#0F4761;margin-bottom:4px;font-weight:700;}' +
    '.meta{font-size:10px;color:#888;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #0F4761;}' +
    '.print-btn{position:fixed;top:16px;right:16px;padding:8px 16px;background:#0F4761;color:#fff;border:none;border-radius:4px;font-weight:700;cursor:pointer;font-size:11px;}' +
    '@media print{.no-print{display:none!important;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
    '</style></head>' +
    '<body><button class="print-btn no-print" onclick="window.print()">🖨️ Imprimer / PDF</button>' +
    '<h1>⚡ Operations API — ' + escHtmlOps((flux&&flux.name)||'Workflow') + '</h1>' +
    '<div class="meta">Organisation : ' + escHtmlOps(org) + ' &nbsp;·&nbsp; Exporte le ' + new Date(date).toLocaleString('fr-FR') + ' &nbsp;·&nbsp; ' + totalOps + ' operations API</div>' +
    sections + '</body></html>';

  _downloadBlob(html, 'text/html', slug + '-' + ((flux&&flux.name)||'workflow').replace(/\s+/g,'-') + '-api-ops.html');
  if (typeof toast === 'function') toast('Documentation HTML exportee → imprimer en PDF');
}

function exportApiOpsPython() {
  const { flux, org, date, slug } = getExportMeta();
  if (!_apiOpsData.length) { alert('Aucune opération à exporter.'); return; }

  const fluxConns = flux ? _getFluxConnections(flux) : [];
  const fluxName  = flux ? (flux.name || 'Workflow') : 'Workflow';

  const L = [];
  const l = function(s) { L.push(s === undefined ? '' : s); };

  l('#!/usr/bin/env python3');
  l('# -*- coding: utf-8 -*-');
  l('"""');
  l('Workflow : ' + fluxName);
  l('Organisation : ' + org);
  l('Genere le : ' + new Date(date).toLocaleString('fr-FR') + ' par Iconik Workflow Designer');
  l('');
  l('Prerequis : pip install requests boto3');
  l('Usage    : python3 ' + slug + '-' + fluxName.replace(/\s+/g,'-') + '-api-ops.py');
  l('"""');
  l();
  l('import os, json, time, requests');
  l();
  l('# ── Configuration Iconik ─────────────────────────────────────────────────');
  l('ICONIK_BASE  = os.getenv("ICONIK_BASE",  "https://app.iconik.io")');
  l('ICONIK_APP_ID     = os.getenv("ICONIK_APP_ID",     "")  # App-ID Iconik');
  l('ICONIK_AUTH_TOKEN = os.getenv("ICONIK_AUTH_TOKEN", "")  # Auth-Token Iconik');
  l('ASSET_ID          = os.getenv("ASSET_ID",          "")  # ID de l\'asset de depart');
  l();

  // Une section de config par connexion externe
  fluxConns.forEach(function(c) {
    const vkey = c.name.toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    l('# ── Configuration ' + c.name + ' ' + ('─').repeat(Math.max(0, 40 - c.name.length)));
    if (c.authType === 'aws_s3') {
      l(vkey + '_AWS_ACCESS_KEY = os.getenv("' + vkey + '_AWS_ACCESS_KEY", "")');
      l(vkey + '_AWS_SECRET_KEY = os.getenv("' + vkey + '_AWS_SECRET_KEY", "")');
      l(vkey + '_AWS_REGION     = os.getenv("' + vkey + '_AWS_REGION",     "' + (c.awsRegion||'eu-north-1') + '")');
      l(vkey + '_AWS_BUCKET     = os.getenv("' + vkey + '_AWS_BUCKET",     "' + (c.awsBucket||'') + '")');
    } else if (c.baseUrl) {
      l(vkey + '_BASE_URL = os.getenv("' + vkey + '_BASE_URL", "' + c.baseUrl + '")');
      l(vkey + '_TOKEN    = os.getenv("' + vkey + '_TOKEN",    "")  # Bearer Token');
    }
    l();
  });

  l('# ── Headers par connexion ────────────────────────────────────────────────');
  l('ICONIK_HEADERS = {');
  l('    "App-ID"      : ICONIK_APP_ID,');
  l('    "Auth-Token"  : ICONIK_AUTH_TOKEN,');
  l('    "Content-Type": "application/json",');
  l('}');
  l();

  fluxConns.forEach(function(c) {
    if (c.authType === 'aws_s3') return;  // AWS géré séparément via boto3
    const vkey = c.name.toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    l(vkey + '_HEADERS = {');
    l('    "Authorization": "Bearer " + ' + vkey + '_TOKEN,');
    l('    "Content-Type" : "application/json",');
    l('}');
    l();
  });

  // Helpers
  l();
  l('# ── Helpers ──────────────────────────────────────────────────────────────');
  l('def iconik(method, path, body=None, params=None):');
  l('    """Appel API Iconik."""');
  l('    url = ICONIK_BASE + path');
  l('    r = requests.request(method, url, headers=ICONIK_HEADERS, json=body, params=params)');
  l('    if not r.ok:');
  l('        raise RuntimeError(f"Iconik {method} {path} → {r.status_code}: {r.text[:200]}")');
  l('    return r.json() if r.content else {}');
  l();

  fluxConns.forEach(function(c) {
    if (c.authType === 'aws_s3') return;
    const vkey   = c.name.toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    const fnname = c.name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
    l('def call_' + fnname + '(method, path, body=None, ignore_codes=None):');
    l('    """Appel API ' + c.name + ' avec upsert POST->PUT automatique."""');
    l('    base = ' + vkey + '_BASE_URL');
    l('    url  = base + path if not path.startswith("http") else path');
    l('    r    = requests.request(method, url, headers=' + vkey + '_HEADERS, json=body)');
    l('    if ignore_codes and r.status_code in ignore_codes:');
    l('        return {"_ignored": r.status_code}');
    l('    if r.status_code == 422 and method == "POST":');
    l('        # Upsert : fallback PUT sur l\'external_id');
    l('        ext_id = (body or {}).get("external_id", "")');
    l('        if ext_id:');
    l('            put_url = url.rstrip("/") + "/" + str(ext_id) + "/"');
    l('            r2 = requests.put(put_url, headers=' + vkey + '_HEADERS, json=body)');
    l('            if not r2.ok:');
    l('                raise RuntimeError(f"Upsert PUT {put_url} → {r2.status_code}: {r2.text[:200]}")');
    l('            return r2.json() if r2.content else {}');
    l('    if not r.ok:');
    l('        raise RuntimeError(f"{method} {url} → {r.status_code}: {r.text[:200]}")');
    l('    return r.json() if r.content else {}');
    l();
  });

  // AWS S3 helper si connexion S3 présente
  const hasS3 = fluxConns.some(function(c) { return c.authType === 'aws_s3'; });
  if (hasS3) {
    const s3c  = fluxConns.find(function(c) { return c.authType === 'aws_s3'; });
    const vkey = s3c.name.toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    l('import boto3');
    l('from botocore.config import Config as BotoConfig');
    l();
    l('def s3_client():');
    l('    """Client boto3 pre-configure."""');
    l('    return boto3.client(');
    l('        "s3",');
    l('        region_name=' + vkey + '_AWS_REGION,');
    l('        aws_access_key_id=' + vkey + '_AWS_ACCESS_KEY,');
    l('        aws_secret_access_key=' + vkey + '_AWS_SECRET_KEY,');
    l('        config=BotoConfig(signature_version="s3v4"),');
    l('    )');
    l();
    l('def s3_list(prefix):');
    l('    """Liste les objets S3 sous un prefix. Retourne (found: bool, keys: list)."""');
    l('    s3  = s3_client()');
    l('    res = s3.list_objects_v2(Bucket=' + vkey + '_AWS_BUCKET, Prefix=prefix, MaxKeys=20)');
    l('    keys = [o["Key"] for o in res.get("Contents", [])]');
    l('    return len(keys) > 0, keys');
    l();
    l('def s3_url(key):');
    l('    """Construit une URL S3 path-style signee (1h)."""');
    l('    s3 = s3_client()');
    l('    return s3.generate_presigned_url("get_object",');
    l('        Params={"Bucket": ' + vkey + '_AWS_BUCKET, "Key": key}, ExpiresIn=3600)');
    l();
  }

  // Wait For helper
  const hasWaitFor = _apiOpsData.some(function(nd) { return nd.nodeFamily === 'wait_for'; });
  if (hasWaitFor) {
    const waitNd = _apiOpsData.find(function(nd) { return nd.nodeFamily === 'wait_for'; });
    const waitOp = waitNd ? waitNd.ops[0] : null;
    l('def poll_until(url, headers, path, expected, fail_values=None, interval=30, max_retries=30):');
    l('    """Polling HTTP jusqu\'a ce que path == expected. Leve une erreur si fail_value detecte."""');
    l('    fail_values = fail_values or ["FAILED", "ERROR", "ABORTED", "failed", "error"]');
    l('    for attempt in range(max_retries):');
    l('        r = requests.get(url, headers=headers)');
    l('        if not r.ok:');
    l('            raise RuntimeError(f"Polling {url} → {r.status_code}")');
    l('        data = r.json()');
    l('        # Naviguer dans le chemin JSON (ex: "jobs[0].status")');
    l('        value = data');
    l('        for key in path.split("."):');
    l('            if isinstance(value, dict): value = value.get(key)');
    l('            elif isinstance(value, list) and key.isdigit(): value = value[int(key)]');
    l('            else: value = None; break');
    l('        print(f"  Tentative {attempt+1}/{max_retries} : {path} = {value}")');
    l('        if str(value) in [str(v) for v in (fail_values or [])]:');
    l('            raise RuntimeError(f"Job echoue : {path} = {value}")');
    l('        if str(value) == str(expected):');
    l('            return data');
    l('        time.sleep(interval)');
    l('    raise RuntimeError(f"Timeout apres {max_retries * interval}s — {path} toujours != {expected}")');
    l();
  }

  // ── build_payload : mapping Lookup traduit en code Python explicite
  const lookupNodes = _apiOpsData.filter(function(nd) { return nd.nodeFamily === 'lookup'; });

  if (lookupNodes.length) {
    l();
    l('# ── Mapping des champs (genere depuis la table de correspondance WFD) ───');
    l('# Agnostique : ne depend pas de WFD a l\'execution. Pure logique de transformation.');
    l();

    lookupNodes.forEach(function(lkNd) {
      const lkCfg  = lkNd._cfg || {};
      const rows   = lkCfg.lkRows || [];
      const inVar  = lkCfg.lkInputVar  || 'ctx';
      const outVar = lkCfg.lkOutputVar || 'payload';
      const fnName = 'build_' + outVar.toLowerCase().replace(/[^a-z0-9]+/g,'_');

      l('def ' + fnName + '(ctx):');
      l('    """');
      l('    Construit le payload API cible depuis le contexte Iconik.');
      l('    Table : ' + lkNd.nodeName + '  (' + rows.length + ' champs)');
      l('    Source  : ctx["' + inVar + '"] — metadonnees Iconik');
      l('    Cible   : payload retourne, pret a etre envoye a l\'API');
      l('    """');
      l('    src = ctx.get("' + inVar + '", ctx)');
      l('    payload = {}');
      l();

      rows.forEach(function(row) {
        const src    = row.key   || row.src  || '';
        const tgt    = row.value || row.tgt  || '';
        const rType  = row.type  || 'string';
        const fb     = row.fallback ? ('"' + row.fallback + '"') : 'None';
        if (!src || !tgt) return;
        const srcClean = src.replace(/^metadata\./, '');
        const srcAccess = 'src.get("' + srcClean + '", ctx.get("' + srcClean + '", ' + fb + '))';

        let castExpr;
        if      (rType === 'integer') castExpr = 'int(' + srcAccess + ') if ' + srcAccess + ' is not None else None';
        else if (rType === 'float')   castExpr = 'float(' + srcAccess + ') if ' + srcAccess + ' is not None else None';
        else if (rType === 'boolean') castExpr = 'bool(' + srcAccess + ')';
        else                          castExpr = 'str(' + srcAccess + ') if ' + srcAccess + ' is not None else None';

        l('    # ' + src + ' → ' + tgt + '  [' + rType + ']' + (row.fallback ? '  defaut: ' + row.fallback : ''));

        if (tgt.includes('[].')) {
          const parts   = tgt.split('[].');
          const listKey = parts[0];
          const objKey  = parts[1];
          l('    _v = ' + srcAccess);
          l('    if _v is not None:');
          l('        _items = [_v] if not isinstance(_v, list) else _v');
          l('        payload["' + listKey + '"] = [{"' + objKey + '": str(i)} for i in _items]');
        } else if (tgt.includes('.')) {
          const parts = tgt.split('.');
          l('    _v = ' + castExpr);
          l('    if _v is not None:');
          let setter = '    payload';
          for (let pi = 0; pi < parts.length - 1; pi++) {
            setter += '.setdefault("' + parts[pi] + '", {})';
          }
          setter += '["' + parts[parts.length-1] + '"] = _v';
          l(setter);
        } else {
          l('    _v = ' + castExpr);
          l('    if _v is not None: payload["' + tgt + '"] = _v');
        }
        l();
      });

      l('    return payload');
      l();
      l();
      // Table de correspondance en commentaire
      l('# Correspondance complete (' + rows.length + ' champs) :');
      rows.forEach(function(row) {
        const s = row.key   || row.src  || '';
        const t = row.value || row.tgt  || '';
        const r = row.type  || 'string';
        const f = row.fallback ? '  [defaut: ' + row.fallback + ']' : '';
        if (s && t) l('#   ' + s + '  →  ' + t + '  (' + r + ')' + f);
      });
      l();
      l();
    });
  }

  // Fonctions par nœud
  l();
  l('# ── Etapes du workflow ───────────────────────────────────────────────────');
  l();

  _apiOpsData.forEach(function(nd, idx) {
    const apiOps = nd.ops.filter(function(op) { return op.method !== '—'; });
    if (!apiOps.length) return;

    const fnName = 'step_' + String(idx+1).padStart(2,'0') + '_' + nd.nodeFamily + '_' + nd.nodeName.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,20);
    const sep = '─'.repeat(62);

    l('# ' + sep);
    l('# Etape ' + (idx+1) + ' — ' + nd.nodeName + ' (' + nd.nodeFamily + ')');
    l('# ' + sep);
    l('def ' + fnName + '(ctx):');
    l('    """' + nd.ops[0].desc + '"""');
    l();

    apiOps.forEach(function(op, i) {
      const isIconik   = !op.ep.startsWith('http');
      const isAws      = op.ep.includes('.amazonaws.com') || op.ep.includes('s3.');
      const matchConn  = fluxConns.find(function(c) { return c.baseUrl && op.ep.startsWith(c.baseUrl); });
      const fnCall     = matchConn ? 'call_' + matchConn.name.toLowerCase().replace(/[^a-z0-9]+/g,'_') : null;

      l('    # ' + op.desc);

      if (nd.nodeFamily === 'aws_s3') {
        l('    prefix = "' + (nd.ops[0].ep.split('prefix=')[1] || '{prefix}') + '"');
        l('    for k, v in ctx.items(): prefix = prefix.replace("{" + k + "}", str(v))');
        l('    found, keys = s3_list(prefix)');
        l('    if found:');
        l('        print(f"  S3 : {len(keys)} fichier(s) trouves sous {prefix}")');
        // Générer la boucle depuis s3Mappings
        const _s3mPy = (nd._cfg && nd._cfg.s3Mappings && nd._cfg.s3Mappings.length)
          ? nd._cfg.s3Mappings
          : [
              { type:'video',    filter:'.mp4,.mov,.mxf', variable: (nd._cfg && nd._cfg.s3VarVideo) || 's3_video_url' },
              { type:'image',    filter:'_poster,.jpg,.jpeg,.png', variable: (nd._cfg && nd._cfg.s3VarImage) || 's3_image_url' },
              { type:'subtitle', filter:'.srt,.vtt', variable: (nd._cfg && nd._cfg.s3VarSrt) || 's3_srt_url' },
            ];
        const _bucketExpr = (hasS3 ? fluxConns.find(function(c){return c.authType==='aws_s3';}).name.toUpperCase().replace(/[^A-Z0-9]+/g,'_') + '_AWS_BUCKET' : '""');
        _s3mPy.forEach(function(m, mi) {
          if (!m.variable) return;
          const filters = (m.filter||'').split(',').map(function(f){ return f.trim(); }).filter(Boolean);
          const keyword = mi === 0 ? 'if' : 'elif';
          l('        # ' + m.type + ' — filtre : ' + (m.filter||''));
          l('        ' + keyword + ' any(f in key.lower() for f in ' + JSON.stringify(filters) + '):');
          l('            ctx["' + m.variable + '"] = "s3://" + ' + _bucketExpr + ' + "/" + key');
        });
        l('        ctx["s3_bypass"] = True');
        l('    else:');
        l('        print(f"  S3 : aucun fichier sous {prefix} — export requis")');
        l('        ctx["s3_bypass"] = False');
        l('    return ctx');

      } else if (nd.nodeFamily === 'wait_for') {
        const waitCfg  = nd._cfg || {};
        const ep       = op.ep || '';
        // Tous les paramètres viennent de cfg du nœud Wait For
        const wPath    = waitCfg.path      || 'status';
        const wExpect  = waitCfg.expected  || 'COMPLETED';
        const wFail    = waitCfg.failValues
          ? JSON.stringify(Array.isArray(waitCfg.failValues) ? waitCfg.failValues : [waitCfg.failValues])
          : '["FAILED","ERROR","ABORTED","failed","error"]';
        const wInterval  = waitCfg.interval   || 30;
        const wRetries   = waitCfg.maxRetries  || 30;
        const connForWait = fluxConns.find(function(c) { return c.baseUrl && ep.startsWith(c.baseUrl); });
        const hdr = connForWait ? connForWait.name.toUpperCase().replace(/[^A-Z0-9]+/g,'_') + '_HEADERS' : 'ICONIK_HEADERS';
        l('    url = "' + ep + '"');
        l('    for k, v in ctx.items(): url = url.replace("{" + k + "}", str(v))');
        l('    # path=' + wPath + '  expected=' + wExpect + '  interval=' + wInterval + 's  max=' + wRetries + ' essais');
        l('    data = poll_until(');
        l('        url, ' + hdr + ',');
        l('        path="' + wPath + '",');
        l('        expected="' + wExpect + '",');
        l('        fail_values=' + wFail + ',');
        l('        interval=' + wInterval + ',');
        l('        max_retries=' + wRetries);
        l('    )');
        l('    ctx["wait_result"] = data');
        l('    return ctx');

      } else if (nd.nodeFamily === 'workflow_history' || nd.nodeFamily === 'update_meta') {
        const viewId = (nd.nodeFamily === 'workflow_history')
          ? (apiOps[0].ep.split('/views/')[1] || '{view_id}').replace('/','')
          : (apiOps[0].ep.split('/views/')[1] || '{view_id}').replace('/','');
        const method = op.method;
        l('    body = ' + (op.body ? JSON.stringify(op.body, null, 4).split('\n').join('\n    ') : 'None'));
        l('    # Remplacer les variables dans le body');
        l('    body_str = json.dumps(body)');
        l('    for k, v in ctx.items(): body_str = body_str.replace("{" + k + "}", str(v))');
        l('    body = json.loads(body_str)');
        const ep = '/API/metadata/v1/assets/{asset_id}/views/' + viewId + '/';
        l('    path = "' + ep + '".format(**{"asset_id": ctx.get("asset_id", ASSET_ID)})');
        l('    data = iconik("' + method + '", path, body=body)');
        l('    ctx["history_result"] = data');
        l('    return ctx');

      } else if (isIconik) {
        const ep = op.ep;
        l('    path = "' + ep + '"');
        l('    for k, v in ctx.items(): path = path.replace("{" + k + "}", str(v))');
        l('    path = path.replace("{asset_id}", ctx.get("asset_id", ASSET_ID))');
        if (op.body) {
          l('    body = ' + JSON.stringify(op.body, null, 4).split('\n').join('\n    '));
          l('    body_str = json.dumps(body)');
          l('    for k, v in ctx.items(): body_str = body_str.replace("{" + k + "}", str(v))');
          l('    body = json.loads(body_str)');
          l('    data = iconik("' + op.method + '", path, body=body)');
        } else {
          l('    data = iconik("' + op.method + '", path)');
        }
        // Stocker les résultats clés selon le nœud
        if (nd.nodeFamily === 'fetch') {
          l('    ctx.update(data.get("metadata_values", {}))');
          l('    ctx["asset_id"] = data.get("id", ctx.get("asset_id", ASSET_ID))');
        } else if (nd.nodeFamily === 'action') {
          l('    ctx["job_id"] = data.get("job_id") or data.get("id") or ctx.get("job_id")');
        }
        l('    return ctx');

      } else if (fnCall) {
        const path = op.ep.replace(matchConn.baseUrl, '');
        const ignore = (nd.nodeFamily === 'http_request' && op.method === 'POST') ? '[422]' : 'None';
        l('    path = "' + path + '"');
        l('    for k, v in ctx.items(): path = path.replace("{" + k + "}", str(v))');
        if (op.body) {
          l('    body = ' + JSON.stringify(op.body, null, 4).split('\n').join('\n    '));
          l('    body_str = json.dumps(body)');
          l('    for k, v in ctx.items(): body_str = body_str.replace("{" + k + "}", str(v))');
          l('    body = json.loads(body_str)');
          l('    data = ' + fnCall + '("' + op.method + '", path, body=body, ignore_codes=' + ignore + ')');
        } else {
          l('    data = ' + fnCall + '("' + op.method + '", path, ignore_codes=' + ignore + ')');
        }
        // Nommer la clé de résultat depuis cfg.responseVar si disponible
        const respKey = (nd._cfg && nd._cfg.responseVar) ? nd._cfg.responseVar : (nd.nodeFamily + '_result_' + (i+1));
        l('    ctx["' + respKey + '"] = data');
        l('    return ctx');
      } else {
        // Requête externe directe
        l('    url = "' + op.ep + '"');
        l('    for k, v in ctx.items(): url = url.replace("{" + k + "}", str(v))');
        if (op.body) {
          l('    body = ' + JSON.stringify(op.body, null, 4).split('\n').join('\n    '));
          l('    r = requests.post(url, json=body)');
        } else {
          l('    r = requests.get(url)');
        }
        l('    r.raise_for_status()');
        l('    ctx["external_result"] = r.json() if r.content else {}');
        l('    return ctx');
      }
    });

    l();
    l();
  });

  // Main
  l('# ── Execution ────────────────────────────────────────────────────────────');
  l('if __name__ == "__main__":');
  l('    if not ASSET_ID:');
  l('        ASSET_ID = input("Asset ID Iconik de depart : ").strip()');
  l('    ctx = {"asset_id": ASSET_ID}');
  l('    print("\\n=== ' + fluxName + ' ===")');
  l('    print(f"Asset : {ASSET_ID}\\n")');

  _apiOpsData.forEach(function(nd, idx) {
    const apiOps = nd.ops.filter(function(op) { return op.method !== '—'; });
    const fnName = 'step_' + String(idx+1).padStart(2,'0') + '_' + nd.nodeFamily + '_' + nd.nodeName.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,20);
    if (!apiOps.length) return;
    l('    print("[' + String(idx+1).padStart(2,' ') + '] ' + nd.nodeName + '...")');
    l('    ctx = ' + fnName + '(ctx)');
  });

  l('    print("\\nWorkflow termine.")');
  l('    print(json.dumps({k: v for k, v in ctx.items() if not k.startswith("_")}, indent=2, ensure_ascii=False))');

  const pyCode = L.join('\n');
  _downloadBlob(pyCode, 'text/x-python', slug + '-' + fluxName.replace(/\s+/g,'-') + '-api-ops.py');
  if (typeof toast === 'function') toast('Script Python exporte — ' + _apiOpsData.length + ' etapes');
}

// ── Helpers download ──────────────────────────────────────────────────────────
function _downloadJSON(obj, filename) {
  _downloadBlob(JSON.stringify(obj, null, 2), 'application/json', filename);
}
function _downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type: type + ';charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function escHtmlOps(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
