// _shared/js/providers/iconik.provider.js
(function () {
  'use strict';

  // Marqueur (permet de vérifier cache/exécution)
  window.__AFS_ICONIK_PROVIDER_VERSION = 'v1';

  // Namespace global
  window.AFS_Providers = window.AFS_Providers || {};

  const LS = window.localStorage;

  function safeJSON(key, fallback = null) {
    try {
      const v = LS.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function getContext() {
    const ctx = safeJSON('aps:context', {}) || {};
    const domain = String(ctx.domain || ctx.env || '').trim();
    return {
      platform: String(ctx.platform || 'iconik'),
      org: String(ctx.org || LS.getItem('organisationName') || ''),
      domain
    };
  }

  // Clés datasets (basées sur ta liste localStorage)
  const DATA_KEYS = [
    'appTokensData','appsData','askida:last','askida:orgs:iconik',
    'automationsData','automationsData_raw','categoriesData','collectionsData',
    'customActionsData','exportLocationsData','iconik:activeEnv','iconikAppTokensData',
    'itemsAdvancedData','metadataViewsData','metadonneesData','roleGroupsData',
    'rolesData','savedSearchesData','storagesData','teamsData','usersData',
    'webhooksData','wfd_include_system_teams','workflowsData'
  ];

  function getDatasets() {
    const out = {};
    for (const k of DATA_KEYS) out[k] = safeJSON(k, null);
    return out;
  }

  function count(obj, arrKey) {
    if (!obj) return 0;
    if (Array.isArray(obj)) return obj.length;
    if (arrKey && Array.isArray(obj[arrKey])) return obj[arrKey].length;
    return 0;
  }

  function getDocModel() {
    const ctx = getContext();
    const ds = getDatasets();
    return {
      context: ctx,
      datasets: ds,
      stats: {
        collections: count(ds.collectionsData, 'collections'),
        teams: count(ds.teamsData, 'teams'),
        users: count(ds.usersData, 'users'),
        workflows: count(ds.workflowsData, 'workflows'),
        automations: count(ds.automationsData, 'automations')
      }
    };
  }

  window.AFS_Providers.iconik = {
    ping: () => 'pong',
    getContext,
    getDatasets,
    getDocModel
  };

  console.log('[AFS] iconik.provider OK', window.__AFS_ICONIK_PROVIDER_VERSION, window.AFS_Providers.iconik.ping());
})();