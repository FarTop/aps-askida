// _shared/js/providers/iconik.provider.js
(function () {
  'use strict';

  window.__AFS_ICONIK_PROVIDER_VERSION = 'v3-system-mask';
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

  function humanizeKey(key) {
    const k = String(key || '')
      .replace(/Data$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .trim();
    return k ? (k.charAt(0).toUpperCase() + k.slice(1)) : key;
  }

  // Datasets “métier” + “système”
  // (les clés système sont celles que tu as déjà vues en localStorage) [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
  const BUILTIN_DATASETS = [
    { key: 'collectionsData', label: 'Collections', group: 'Content', defaultChecked: true,  system: false },
    { key: 'teamsData', label: 'Teams', group: 'Access', defaultChecked: true,  system: false },
    { key: 'usersData', label: 'Users', group: 'Access', defaultChecked: false, system: false },
    { key: 'rolesData', label: 'Roles', group: 'Access', defaultChecked: true,  system: false },
    { key: 'roleGroupsData', label: 'Role Groups', group: 'Access', defaultChecked: true,  system: false },
    { key: 'automationsData', label: 'Automations', group: 'Automation', defaultChecked: true, system: false },
    { key: 'workflowsData', label: 'Workflows', group: 'Workflow', defaultChecked: false, system: false },
    { key: 'categoriesData', label: 'Categories', group: 'Metadata', defaultChecked: false, system: false },
    { key: 'metadataViewsData', label: 'Metadata Views', group: 'Metadata', defaultChecked: false, system: false },
    { key: 'metadonneesData', label: 'Métadonnées', group: 'Metadata', defaultChecked: false, system: false },
    { key: 'webhooksData', label: 'Webhooks', group: 'Automation', defaultChecked: false, system: false },
    { key: 'storagesData', label: 'Storages', group: 'Storage', defaultChecked: false, system: false },
    { key: 'exportLocationsData', label: 'Export Locations', group: 'Export', defaultChecked: false, system: false },
    { key: 'savedSearchesData', label: 'Saved Searches', group: 'Content', defaultChecked: false, system: false },
    { key: 'customActionsData', label: 'Custom Actions', group: 'Automation', defaultChecked: false, system: false },
    { key: 'itemsAdvancedData', label: 'Items Advanced', group: 'Content', defaultChecked: false, system: false },
    { key: 'appsData', label: 'Apps', group: 'System', defaultChecked: false, system: true },

    // SYSTÈME (masqué par défaut dans le Doc Builder)
    { key: 'appTokensData', label: 'App Tokens', group: 'System', defaultChecked: false, system: true },            // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
    { key: 'iconikAppTokensData', label: 'Active Token', group: 'System', defaultChecked: false, system: true },     // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
    { key: 'iconik:activeEnv', label: 'Active Env', group: 'System', defaultChecked: false, system: true },          // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
    { key: 'wfd_include_system_teams', label: 'Include System Teams', group: 'System', defaultChecked: false, system: true }, // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
    { key: 'askida:last', label: 'Askida Last', group: 'System', defaultChecked: false, system: true },              // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
    { key: 'askida:orgs:iconik', label: 'Askida Orgs Iconik', group: 'System', defaultChecked: false, system: true } // [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
  ];

  function discoverDatasetKeys() {
    const keys = Object.keys(LS);
    const candidates = keys.filter(k =>
      /Data$/i.test(k) ||
      /Data_/i.test(k) ||
      k.includes(':') || // ex: iconik:activeEnv [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)
      k === 'wfd_include_system_teams' ||
      k.startsWith('askida:')
    );
    return [...new Set(candidates)];
  }

  function isSystemKey(k) {
    const s = String(k);
    return s.includes(':') || s.startsWith('askida:') || s === 'wfd_include_system_teams';
  }

  function listDatasetCatalog() {
    const discovered = discoverDatasetKeys();

    const byKey = new Map();
    for (const d of BUILTIN_DATASETS) byKey.set(d.key, { ...d });

    for (const k of discovered) {
      if (!byKey.has(k)) {
        byKey.set(k, {
          key: k,
          label: humanizeKey(k),
          group: isSystemKey(k) ? 'System' : 'Discovered',
          defaultChecked: false,
          system: isSystemKey(k),
          discovered: true
        });
      }
    }

    // Tri alphabétique sur label (comme tu le voulais)
    const list = [...byKey.values()].sort((a, b) =>
      (a.label || a.key).localeCompare(b.label || b.key, 'fr', { sensitivity: 'base' })
    );

    return list;
  }

  function getDatasets() {
    const out = {};
    const catalog = listDatasetCatalog();
    for (const d of catalog) out[d.key] = safeJSON(d.key, null);
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
    listDatasetCatalog,
    getDatasets,
    getDocModel
  };

  console.log('[AFS] iconik.provider OK', window.__AFS_ICONIK_PROVIDER_VERSION, window.AFS_Providers.iconik.ping());
})();
