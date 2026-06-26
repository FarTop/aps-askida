console.log('[HEALTH] settings-health LOADED — 2026-06-25 17:47');
/* =============================================================================
   APS — Settings Health
   - Test Endpoints : vérifie l'accessibilité des endpoints Iconik API
   - Health Check   : détecte les orphelins et incohérences dans un domaine

   Expose :
     window.detailTestEndpoints()
     window.detailHealthCheck()
     window.initTestEndpoints()
     window.initHealthCheck()
   ============================================================================= */

(function () {
  'use strict';

  // ── Endpoints connus de l'API Iconik ────────────────────────────────────────
  // aps: true  → utilisé dans APS
  // method: méthode principale de test
  const ICONIK_ENDPOINTS = [
    // ── ACLs ──────────────────────────────────────────────────────────────────
    { group: 'acls', label: 'ACL Collections',       ep: '/API/acls/v1/acl/collections/',       method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Metadata Views',    ep: '/API/acls/v1/acl/metadata_views/',     method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Saved Searches',    ep: '/API/acls/v1/acl/saved_searches/',     method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Custom Actions',    ep: '/API/acls/v1/acl/custom_actions/',     method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Storages',          ep: '/API/acls/v1/acl/storages/',           method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Groups (teams)',    ep: '/API/acls/v1/acl/groups/',             method: 'GET', aps: true  },
    { group: 'acls', label: 'ACL Propagating',       ep: '/API/acls/v1/acl/_propagating_collections/', method: 'GET', aps: true },
    { group: 'acls', label: 'Groups list',           ep: '/API/acls/v1/groups/',                 method: 'GET', aps: true  },

    // ── Assets ────────────────────────────────────────────────────────────────
    { group: 'assets', label: 'Collections',         ep: '/API/assets/v1/collections/',          method: 'GET', aps: true  },
    { group: 'assets', label: 'Custom Actions',      ep: '/API/assets/v1/custom_actions/',       method: 'GET', aps: true  },
    { group: 'assets', label: 'Custom Actions BULK', ep: '/API/assets/v1/custom_actions/BULK/',  method: 'GET', aps: true  },
    { group: 'assets', label: 'Custom Actions COLL', ep: '/API/assets/v1/custom_actions/COLLECTION/', method: 'GET', aps: true },
    { group: 'assets', label: 'Relation Types',      ep: '/API/assets/v1/assets/relation_types/', method: 'GET', aps: true },
    { group: 'assets', label: 'Assets',              ep: '/API/assets/v1/assets/',               method: 'GET', aps: false },
    { group: 'assets', label: 'Delete Queue Assets', ep: '/API/assets/v1/delete_queue/assets/',  method: 'GET', aps: true  },
    { group: 'assets', label: 'Delete Queue Collections', ep: '/API/assets/v1/delete_queue/collections/', method: 'GET', aps: true },
    { group: 'assets', label: 'Reindex Bulk',        ep: '/API/assets/v1/reindex/bulk/',         method: 'POST', aps: true },

    // ── Auth ──────────────────────────────────────────────────────────────────
    { group: 'auth', label: 'Apps (App Tokens)',     ep: '/API/auth/v1/apps/',                   method: 'GET', aps: true  },
    { group: 'auth', label: 'SAML IDP',              ep: '/API/auth/v1/auth/saml/idp/',          method: 'GET', aps: true  },
    { group: 'auth', label: 'Auth simple login',     ep: '/API/auth/v1/auth/simple/login/',      method: 'POST', aps: false },

    // ── Automations ───────────────────────────────────────────────────────────
    { group: 'automations', label: 'Automations',    ep: '/API/automations/v1/automations/',     method: 'GET', aps: true  },

    // ── Files ─────────────────────────────────────────────────────────────────
    { group: 'files', label: 'Storages',             ep: '/API/files/v1/storages/',              method: 'GET', aps: true  },
    { group: 'files', label: 'Export Locations',     ep: '/API/files/v1/export_locations/',      method: 'GET', aps: true  },
    { group: 'files', label: 'Formats',              ep: '/API/files/v1/formats/',               method: 'GET', aps: false },
    { group: 'files', label: 'Transcoders',          ep: '/API/files/v1/transcoders/',           method: 'GET', aps: false },

    // ── Metadata ──────────────────────────────────────────────────────────────
    { group: 'metadata', label: 'Fields',            ep: '/API/metadata/v1/fields/',             method: 'GET', aps: true  },
    { group: 'metadata', label: 'Views',             ep: '/API/metadata/v1/views/',              method: 'GET', aps: true  },
    { group: 'metadata', label: 'Categories Assets', ep: '/API/metadata/v1/assets/categories/',  method: 'GET', aps: true  },
    { group: 'metadata', label: 'Categories Collections', ep: '/API/metadata/v1/collections/categories/', method: 'GET', aps: true },
    { group: 'metadata', label: 'Categories Segments',    ep: '/API/metadata/v1/segments/categories/',    method: 'GET', aps: true },
    { group: 'metadata', label: 'Categories Custom Actions', ep: '/API/metadata/v1/custom_actions/categories/', method: 'GET', aps: true },
    { group: 'metadata', label: 'Categories Search', ep: '/API/metadata/v1/search/categories/', method: 'GET', aps: false },

    // ── Notifications ─────────────────────────────────────────────────────────
    { group: 'notifications', label: 'Webhooks',     ep: '/API/notifications/v1/webhooks/',      method: 'GET', aps: true  },

    // ── Search ────────────────────────────────────────────────────────────────
    { group: 'search', label: 'Search',              ep: '/API/search/v1/search/',               method: 'POST', aps: true },
    { group: 'search', label: 'Saved Searches',      ep: '/API/search/v1/search/saved/',         method: 'GET', aps: true  },
    { group: 'search', label: 'Saved Searches Group',ep: '/API/search/v1/search/saved/group/',   method: 'GET', aps: true  },
    { group: 'search', label: 'Saved Searches Groups',ep: '/API/search/v1/search/saved/groups/', method: 'GET', aps: true  },

    // ── Settings ──────────────────────────────────────────────────────────────
    { group: 'settings', label: 'System Settings',   ep: '/API/settings/v1/system/current/',     method: 'GET', aps: true  },
    { group: 'settings', label: 'Merged Settings',   ep: '/API/settings/v1/merged/current/',     method: 'GET', aps: true  },
    { group: 'settings', label: 'Team Settings',     ep: '/API/settings/v1/team/',               method: 'GET', aps: true  },

    // ── Users ─────────────────────────────────────────────────────────────────
    { group: 'users', label: 'Users',                ep: '/API/users/v1/users/',                 method: 'GET', aps: true  },
    { group: 'users', label: 'Teams',                ep: '/API/users/v1/teams/',                 method: 'GET', aps: true  },
    { group: 'users', label: 'Role Groups',          ep: '/API/users/v1/role_groups/',           method: 'GET', aps: true  },
    { group: 'users', label: 'Groups',               ep: '/API/users/v1/groups/',                method: 'GET', aps: true  },
  ];

  const GROUP_ICONS = {
    acls: '🔐', assets: '📁', auth: '🔑', automations: '⚡',
    files: '💾', metadata: '🏷️', notifications: '🔔', search: '🔍',
    settings: '⚙️', users: '👥'
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getToken() {
    try {
      const toks = ((typeof appTokensData !== 'undefined' && appTokensData?.appTokens) ||
                    window.appTokensData?.appTokens || []);
      const sel = document.getElementById('health-env-select') || document.getElementById('ep-env-select');
      const name = sel?.value;
      return name ? toks.find(t => t.name === name) : toks[0];
    } catch(e) { return null; }
  }

  function buildEnvOptions() {
    // appTokensData est une variable globale de script-settings.js, pas sur window
    const toks = (typeof appTokensData !== 'undefined' && appTokensData?.appTokens) ||
                 window.appTokensData?.appTokens || [];
    return toks.map(t => {
      const badge = t.environment === 'prod' ? '🟢' : t.environment === 'qa' ? '🟡' : '🔵';
      return '<option value="' + t.name + '">' + badge + ' ' + t.name + '</option>';
    }).join('');
  }

  function statusColor(code) {
    if (!code) return 'var(--text-dim)';
    if (code < 300) return 'var(--accent)';
    if (code === 401 || code === 403) return 'var(--c-warn)';
    if (code === 404) return '#3498db';
    return 'var(--c-danger)';
  }

  function statusIcon(code) {
    if (!code) return '⏳';
    if (code < 300) return '✅';
    if (code === 401 || code === 403) return '🔒';
    if (code === 404) return '❓';
    return '❌';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  window.detailTestEndpoints = function() {
    const envOpts = buildEnvOptions();
    const groups = [...new Set(ICONIK_ENDPOINTS.map(e => e.group))];

    return '<div style="padding:0;">' +
      // Sélecteur env + bouton
      '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<label style="font-size:10px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Environnement</label>' +
        '<select id="ep-env-select" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;min-width:200px;">' +
          envOpts +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-dim);cursor:pointer;">' +
          '<input type="checkbox" id="ep-aps-only"> APS uniquement' +
        '</label>' +
        '<button onclick="runTestEndpoints()" style="padding:5px 14px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;">🔍 Tester</button>' +
      '</div>' +
      // Légende
      '<div style="font-size:10px;color:var(--text-dim);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;">' +
        '<span>⭐ Utilisé dans APS</span>' +
        '<span style="color:var(--accent);">✅ 2xx OK</span>' +
        '<span style="color:var(--c-warn);">🔒 401/403</span>' +
        '<span style="color:#3498db;">❓ 404</span>' +
        '<span style="color:var(--c-danger);">❌ Erreur</span>' +
      '</div>' +
      // Résultats par groupe
      groups.map(function(g) {
        return '<div id="ep-group-' + g + '" style="margin-bottom:8px;">' +
          '<div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">' +
            GROUP_ICONS[g] + ' ' + g +
          '</div>' +
          '<div id="ep-rows-' + g + '" style="display:flex;flex-direction:column;gap:3px;">' +
            ICONIK_ENDPOINTS.filter(function(e) { return e.group === g; }).map(function(e) {
              return '<div id="ep-row-' + btoa(e.ep).replace(/=/g,'') + '" ' +
                'style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:3px;font-size:11px;">' +
                '<span style="width:40px;text-align:center;font-size:9px;color:var(--text-dim);border:1px solid var(--border2);border-radius:2px;padding:1px 3px;">' + e.method + '</span>' +
                '<span style="flex:1;font-family:monospace;font-size:10px;">' + e.ep + '</span>' +
                '<span style="font-size:11px;">' + e.label + '</span>' +
                (e.aps ? '<span title="Utilisé dans APS" style="color:gold;font-size:12px;">⭐</span>' : '<span style="width:16px;"></span>') +
                '<span class="ep-status" style="min-width:40px;text-align:right;font-size:11px;color:var(--text-dim);">—</span>' +
                '<span class="ep-latency" style="min-width:45px;text-align:right;font-size:10px;color:var(--text-dim);">—</span>' +
                '<span class="ep-change" style="min-width:160px;text-align:right;font-size:10px;color:var(--text-dim);"></span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
      // Résumé
      '<div id="ep-summary" style="margin-top:10px;font-size:11px;color:var(--text-dim);min-height:14px;"></div>' +
    '</div>';
  };

  window.initTestEndpoints = function() {
    // Rien à initialiser — tout est déclenché par le bouton
  };

  // Stockage historique des résultats endpoint (pour détecter les breaking changes)
  var EP_HISTORY_KEY = 'aps_ep_history';

  function loadEpHistory() {
    try { return JSON.parse(localStorage.getItem(EP_HISTORY_KEY) || '{}'); } catch(e) { return {}; }
  }

  function saveEpHistory(history) {
    try { localStorage.setItem(EP_HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
  }

  window.runTestEndpoints = function() {
    const token = getToken();
    if (!token) { if (window.toast) toast('Sélectionnez un environnement', true); return; }

    const base = (typeof _ikBase === 'function') ? _ikBase(token)
      : (window.location.origin + '/api/iconik/' + String(token.environment || token.env || 'qa').toLowerCase());
    const headers = {};
    const apsOnly = document.getElementById('ep-aps-only')?.checked || false;
    const toTest = apsOnly ? ICONIK_ENDPOINTS.filter(function(e) { return e.aps; }) : ICONIK_ENDPOINTS;
    const summaryEl = document.getElementById('ep-summary');
    const history = loadEpHistory();
    const envKey = token.name || token.environment || 'default';
    if (!history[envKey]) history[envKey] = {};

    if (summaryEl) summaryEl.innerHTML = '⏳ Test en cours (' + toTest.length + ' endpoints)…';

    // Reset statuts
    toTest.forEach(function(e) {
      const rowId = 'ep-row-' + btoa(e.ep).replace(/=/g,'');
      const row = document.getElementById(rowId);
      if (row) {
        row.querySelector('.ep-status').textContent = '⏳';
        row.querySelector('.ep-latency').textContent = '—';
        const changeEl = row.querySelector('.ep-change');
        if (changeEl) changeEl.textContent = '';
      }
    });

    var ok = 0, warn = 0, err = 0;
    var pending = toTest.length;
    var clusterInfo = '—';
    var rateLimit = '—';
    var firstHeadersDone = false;

    toTest.forEach(function(ep) {
      const rowId = 'ep-row-' + btoa(ep.ep).replace(/=/g,'');
      const row = document.getElementById(rowId);
      const t0 = Date.now();
      const opts = { headers: headers };
      if (ep.method === 'POST') {
        opts.method = 'POST';
        opts.headers = Object.assign({}, headers, { 'Content-Type': 'application/json' });
        opts.body = JSON.stringify({ doc_types: ['assets'], per_page: 1 });
      }

      fetch(base + ep.ep + '?per_page=1', opts)
        .then(function(r) {
          // Capturer cluster + rate limit depuis les headers
          if (!firstHeadersDone) {
            firstHeadersDone = true;
            clusterInfo = r.headers.get('x-iconik-cluster') || '—';
            rateLimit = r.headers.get('ratelimit-remaining') || '—';
          }
          return { code: r.status, ms: Date.now() - t0 };
        })
        .catch(function() { return { code: 0, ms: Date.now() - t0 }; })
        .then(function(res) {
          // Détecter breaking change : comparer avec dernier résultat connu
          const prev = history[envKey][ep.ep];
          const now = new Date().toISOString().slice(0, 10);
          var changeFlag = '';
          if (prev && prev.code !== res.code) {
            const prevOk = prev.code > 0 && prev.code < 300;
            const nowOk  = res.code > 0 && res.code < 300;
            if (prevOk && !nowOk) {
              changeFlag = '🔴 Régression depuis ' + prev.date;
            } else if (!prevOk && nowOk) {
              changeFlag = '🟢 Rétabli';
            } else {
              changeFlag = '🟠 Changé (' + prev.code + '→' + res.code + ') depuis ' + prev.date;
            }
          }
          // Sauvegarder dans l'historique
          history[envKey][ep.ep] = { code: res.code, date: now, ms: res.ms };

          if (row) {
            const statusEl = row.querySelector('.ep-status');
            const latEl = row.querySelector('.ep-latency');
            const changeEl = row.querySelector('.ep-change');
            statusEl.textContent = statusIcon(res.code) + ' ' + (res.code || 'ERR');
            statusEl.style.color = statusColor(res.code);
            latEl.textContent = res.ms + 'ms';
            latEl.style.color = res.ms > 2000 ? 'var(--c-warn)' : 'var(--text-dim)';
            if (changeEl && changeFlag) {
              changeEl.textContent = changeFlag;
              changeEl.style.color = changeFlag.startsWith('🔴') ? 'var(--c-danger)' : changeFlag.startsWith('🟢') ? 'var(--accent)' : 'var(--c-warn)';
            }
          }

          // POST non-testables (body minimal ne correspond pas à l'API) → comptés séparément
          const isPostUntestable = ep.method === 'POST' && (res.code === 400 || res.code === 405 || res.code === 422);
          if (res.code > 0 && res.code < 300) ok++;
          else if (res.code === 401 || res.code === 403) warn++;
          else if (isPostUntestable) { /* non-testable, pas une erreur */ }
          else err++;

          if (isPostUntestable && row) {
            const statusEl = row.querySelector('.ep-status');
            statusEl.textContent = '⚠️ N/T';
            statusEl.style.color = 'var(--text-dim)';
            statusEl.title = 'POST non-testable sans payload métier complet';
          }
          pending--;

          if (pending === 0) {
            saveEpHistory(history);
            // Stocker les résultats pour l'export
            window.__apsEpTestResults = { toTest, history: history[envKey], envName: token.name, cluster: clusterInfo, rateLimit, ok, warn, err };
            const BTN = 'padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;';
            if (summaryEl) {
              summaryEl.innerHTML =
                '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;">' +
                  '<span style="color:var(--accent);">✅ ' + ok + ' OK</span>' +
                  '<span style="color:var(--c-warn);">🔒 ' + warn + ' auth</span>' +
                  '<span style="color:var(--c-danger);">❌ ' + err + ' erreur(s)</span>' +
                  '<span style="color:var(--text-dim);">⚠️ N/T POST</span>' +
                  '<div style="margin-left:auto;display:flex;gap:4px;">' +
                    '<button onclick="exportEpTest(&quot;json&quot;)"  style="' + BTN + '">📄 JSON</button>' +
                    '<button onclick="exportEpTest(&quot;html&quot;)"  style="' + BTN + '">📑 HTML</button>' +
                    '<button onclick="exportEpTest(&quot;xlsx&quot;)"  style="' + BTN + '">📊 XLSX</button>' +
                  '</div>' +
                  '<span style="font-size:10px;color:var(--text-dim);">🌐 <b style="color:var(--text);">' + clusterInfo + '</b></span>' +
                  '<span style="font-size:10px;color:var(--text-dim);">⚡ <b style="color:var(--text);">' + rateLimit + '</b></span>' +
                '</div>';
            }
          }
        });
    });
  };

  // ── Exports Test Endpoints ─────────────────────────────────────────────────
  window.exportEpTest = function(format) {
    var data = window.__apsEpTestResults;
    if (!data) { if (window.toast) toast('Lancez d\'abord un test', true); return; }
    var rows = data.toTest.map(function(ep) {
      var h = data.history[ep.ep] || {};
      return {
        groupe: ep.group,
        endpoint: ep.ep,
        methode: ep.method,
        label: ep.label,
        aps: ep.aps ? 'Oui' : 'Non',
        code: h.code || '—',
        latence_ms: h.ms || '—',
        statut: !h.code ? '—' : h.code < 300 ? 'OK' : h.code === 401 || h.code === 403 ? 'Auth' : (ep.method === 'POST' && (h.code === 400 || h.code === 405)) ? 'N/T' : 'Erreur',
        date: h.date || '—',
      };
    });

    var date = new Date().toISOString().slice(0, 10);
    var filename = 'ep-test-' + (data.envName || 'iconik') + '-' + date;

    if (format === 'json') {
      var blob = new Blob([JSON.stringify({ env: data.envName, cluster: data.cluster, date: date, endpoints: rows }, null, 2)], { type: 'application/json' });
      var a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename + '.json' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);

    } else if (format === 'html') {
      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Test Endpoints ' + date + '</title>' +
        '<style>body{font-family:monospace;background:#111;color:#eee;padding:20px;}' +
        'h1{color:#00d4aa;}table{border-collapse:collapse;width:100%;font-size:12px;}' +
        'th{background:#222;padding:6px 10px;text-align:left;border:1px solid #333;}' +
        'td{padding:5px 10px;border:1px solid #222;}' +
        '.ok{color:#00d4aa;}.err{color:#e74c3c;}.warn{color:#f39c12;}.nt{color:#888;}</style></head><body>' +
        '<h1>Test Endpoints — ' + (data.envName || '') + ' — ' + date + '</h1>' +
        '<p>Cluster : ' + data.cluster + ' | Rate limit : ' + data.rateLimit + ' | ✅ ' + data.ok + ' OK | ❌ ' + data.err + ' erreurs</p>' +
        '<table><tr><th>Groupe</th><th>Méthode</th><th>Endpoint</th><th>Label</th><th>APS</th><th>Code</th><th>Latence</th><th>Statut</th></tr>' +
        rows.map(function(r) {
          var cls = r.statut === 'OK' ? 'ok' : r.statut === 'Erreur' ? 'err' : r.statut === 'Auth' ? 'warn' : 'nt';
          return '<tr><td>' + r.groupe + '</td><td>' + r.methode + '</td><td>' + r.endpoint + '</td><td>' + r.label + '</td>' +
            '<td>' + r.aps + '</td><td class="' + cls + '">' + r.code + '</td><td>' + r.latence_ms + '</td><td class="' + cls + '">' + r.statut + '</td></tr>';
        }).join('') + '</table></body></html>';
      var blob2 = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a2 = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob2), download: filename + '.html' });
      document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);

    } else if (format === 'xlsx') {
      // CSV compatible Excel (UTF-8 BOM)
      var bom = '﻿';
      var csv = bom + ['Groupe','M\u00e9thode','Endpoint','Label','APS','Code','Latence (ms)','Statut','Date'].join(';') + '\n' +
        rows.map(function(r) {
          return [r.groupe, r.methode, r.endpoint, r.label, r.aps, r.code, r.latence_ms, r.statut, r.date].join(';');
        }).join('\n');
      var blob3 = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a3 = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob3), download: filename + '.csv' });
      document.body.appendChild(a3); a3.click(); document.body.removeChild(a3);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  const HEALTH_CHECKS = [
    { id: 'acl_ghost',      label: 'ACLs fantômes',           desc: 'ACLs référençant un group_id inexistant dans /teams/ ou /groups/' },
    { id: 'col_orphan',     label: 'Collections orphelines',   desc: 'Collections dont le parent_id n\'existe plus' },
    { id: 'view_dead',      label: 'View IDs morts (catégories)', desc: 'view_ids dans les catégories pointant vers des vues inexistantes' },
    { id: 'auto_dead_col',  label: 'Automations — collections mortes', desc: 'Automations référençant un collection_id inexistant' },
    { id: 'auto_dead_view', label: 'Automations — views mortes', desc: 'Automations référençant un metadata_view_id inexistant' },
    { id: 'team_no_user',   label: 'Teams sans utilisateurs',  desc: 'Teams actives ne contenant aucun utilisateur' },
    { id: 'field_dead',     label: 'Fields morts dans les vues', desc: 'MD Views contenant des field_id inexistants' },
    { id: 'webhook_dead',   label: 'Webhooks désactivés',      desc: 'Webhooks présents mais avec status DISABLED' },
  ];

  window.detailHealthCheck = function() {
    const envOpts = buildEnvOptions();

    return '<div style="padding:0;">' +
      // Sélecteur env + bouton
      '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<label style="font-size:10px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Environnement</label>' +
        '<select id="health-env-select" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;min-width:200px;">' +
          envOpts +
        '</select>' +
        '<button onclick="runHealthCheck()" style="padding:5px 14px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;">🏥 Analyser</button>' +
      '</div>' +
      // Checks à effectuer
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">' +
        HEALTH_CHECKS.map(function(c) {
          return '<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;color:var(--text-dim);white-space:nowrap;" title="' + c.desc + '">' +
            '<input type="checkbox" class="health-chk" value="' + c.id + '" checked>' +
            c.label +
          '</label>';
        }).join('') +
      '</div>' +
      // Résultats
      '<div id="health-results" style="display:flex;flex-direction:column;gap:6px;"></div>' +
    '</div>';
  };

  window.initHealthCheck = function() {
    // Rien à initialiser
  };

  window.runHealthCheck = function() {
    const token = getToken();
    if (!token) { if (window.toast) toast('Sélectionnez un environnement', true); return; }

    const base = (typeof _ikBase === 'function') ? _ikBase(token)
      : (window.location.origin + '/api/iconik/' + String(token.environment || token.env || 'qa').toLowerCase());
    const headers = { 'Content-Type': 'application/json' };
    const selected = new Set(Array.from(document.querySelectorAll('.health-chk:checked')).map(function(c) { return c.value; }));
    const resultsEl = document.getElementById('health-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);">⏳ Analyse en cours…</div>';

    // Fetch des données de base nécessaires à tous les checks
    Promise.all([
      fetch(base + '/API/users/v1/teams/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/users/v1/groups/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/metadata/v1/views/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/metadata/v1/fields/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/automations/v1/automations/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/search/v1/search/', { method: 'POST', headers, body: JSON.stringify({ doc_types: ['collections'], per_page: 500 }) }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
      fetch(base + '/API/notifications/v1/webhooks/?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; }),
    ]).then(function(data) {
      var teams = data[0].objects || [];
      var groups = data[1].objects || [];
      var views = data[2].objects || [];
      var fields = data[3].objects || [];
      var automations = data[4].objects || [];
      var collections = data[5].objects || [];
      var webhooks = data[6].objects || [];

      var allGroupIds = new Set([...teams.map(function(t) { return t.id; }), ...groups.map(function(g) { return g.id; })]);
      var allViewIds = new Set(views.map(function(v) { return v.id; }));
      var allFieldIds = new Set(fields.map(function(f) { return f.id; }));
      var allColIds = new Set(collections.map(function(c) { return c.id; }));

      var findings = [];

      // ── ACLs fantômes ──────────────────────────────────────────────────────
      if (selected.has('acl_ghost')) {
        // On sample 10 collections pour ne pas exploser les requêtes
        var sampleCols = collections.slice(0, 10);
        Promise.all(sampleCols.map(function(c) {
          return fetch(base + '/API/acls/v1/acl/collections/' + c.id + '/', { headers })
            .then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
        })).then(function(aclResults) {
          var ghosts = [];
          aclResults.forEach(function(acl, i) {
            if (!acl) return;
            var entries = (acl.groups_acl || []).concat(acl.propagating_groups_acl || []);
            entries.forEach(function(e) {
              if (e.group_id && !allGroupIds.has(e.group_id)) {
                ghosts.push({ col: sampleCols[i].title || sampleCols[i].id, gid: e.group_id });
              }
            });
          });
          findings.push({
            id: 'acl_ghost',
            label: 'ACLs fantômes',
            status: ghosts.length > 0 ? 'warn' : 'ok',
            note: ghosts.length > 0 ? ghosts.length + ' ACL(s) avec group_id inexistant (sample 10 collections)' : 'Aucun fantôme détecté (sample 10 collections)',
            items: ghosts.map(function(g) { return g.col + ' → ' + g.gid; })
          });
          renderHealthResults(findings, resultsEl);
        });
      }

      // ── Collections orphelines ─────────────────────────────────────────────
      if (selected.has('col_orphan')) {
        var orphans = collections.filter(function(c) {
          var pid = c.parent_id || (Array.isArray(c.in_collections) && c.in_collections[0]) || null;
          return pid && !allColIds.has(pid);
        });
        findings.push({
          id: 'col_orphan',
          label: 'Collections orphelines',
          status: orphans.length > 0 ? 'warn' : 'ok',
          note: orphans.length > 0 ? orphans.length + ' collection(s) avec parent_id inexistant' : 'Aucune collection orpheline',
          items: orphans.slice(0, 10).map(function(c) { return (c.title || c.id) + ' (parent: ' + (c.parent_id || '?') + ')'; })
        });
      }

      // ── View IDs morts dans catégories ────────────────────────────────────
      if (selected.has('view_dead')) {
        var CAT_EPS = [
          '/API/metadata/v1/assets/categories/',
          '/API/metadata/v1/collections/categories/',
          '/API/metadata/v1/segments/categories/',
        ];
        Promise.all(CAT_EPS.map(function(ep) {
          return fetch(base + ep + '?per_page=500', { headers }).then(function(r) { return r.ok ? r.json() : { objects: [] }; }).catch(function() { return { objects: [] }; });
        })).then(function(catResults) {
          var deadViews = [];
          catResults.forEach(function(res) {
            (res.objects || []).forEach(function(cat) {
              (cat.view_ids || []).forEach(function(vid) {
                if (!allViewIds.has(vid)) deadViews.push((cat.name || cat.id) + ' → ' + vid);
              });
            });
          });
          findings.push({
            id: 'view_dead',
            label: 'View IDs morts (catégories)',
            status: deadViews.length > 0 ? 'warn' : 'ok',
            note: deadViews.length > 0 ? deadViews.length + ' view_id(s) inexistant(s) dans les catégories' : 'Toutes les view_ids sont valides',
            items: deadViews.slice(0, 10)
          });
          renderHealthResults(findings, resultsEl);
        });
      }

      // ── Automations — collections mortes ──────────────────────────────────
      if (selected.has('auto_dead_col')) {
        var deadColAutos = [];
        automations.forEach(function(a) {
          (a.actions || []).forEach(function(act) {
            var cid = act.parameters && act.parameters.collection_id;
            if (cid && !allColIds.has(cid)) {
              deadColAutos.push((a.name || a.id) + ' → collection ' + cid);
            }
          });
        });
        findings.push({
          id: 'auto_dead_col',
          label: 'Automations — collections mortes',
          status: deadColAutos.length > 0 ? 'warn' : 'ok',
          note: deadColAutos.length > 0 ? deadColAutos.length + ' automation(s) avec collection_id inexistant' : 'Toutes les collections référencées existent',
          items: deadColAutos.slice(0, 10)
        });
      }

      // ── Automations — views mortes ─────────────────────────────────────────
      if (selected.has('auto_dead_view')) {
        var deadViewAutos = [];
        automations.forEach(function(a) {
          (a.actions || []).forEach(function(act) {
            var vid = act.parameters && act.parameters.metadata_view_id;
            if (vid && !allViewIds.has(vid)) {
              deadViewAutos.push((a.name || a.id) + ' → view ' + vid);
            }
          });
        });
        findings.push({
          id: 'auto_dead_view',
          label: 'Automations — views mortes',
          status: deadViewAutos.length > 0 ? 'warn' : 'ok',
          note: deadViewAutos.length > 0 ? deadViewAutos.length + ' automation(s) avec metadata_view_id inexistant' : 'Toutes les views référencées existent',
          items: deadViewAutos.slice(0, 10)
        });
      }

      // ── Teams sans utilisateurs ────────────────────────────────────────────
      if (selected.has('team_no_user')) {
        var emptyTeams = teams.filter(function(t) {
          return !t.is_system && (!t.user_count || t.user_count === 0);
        });
        findings.push({
          id: 'team_no_user',
          label: 'Teams sans utilisateurs',
          status: emptyTeams.length > 0 ? 'info' : 'ok',
          note: emptyTeams.length > 0 ? emptyTeams.length + ' team(s) sans utilisateur' : 'Toutes les teams ont des utilisateurs',
          items: emptyTeams.slice(0, 10).map(function(t) { return t.name || t.id; })
        });
      }

      // ── Fields morts dans les vues ─────────────────────────────────────────
      if (selected.has('field_dead')) {
        var deadFields = [];
        views.forEach(function(v) {
          (v.view_fields || []).forEach(function(f) {
            var fid = f.field_id || f.id;
            if (fid && !allFieldIds.has(fid)) {
              deadFields.push((v.name || v.id) + ' → field ' + fid);
            }
          });
        });
        findings.push({
          id: 'field_dead',
          label: 'Fields morts dans les vues',
          status: deadFields.length > 0 ? 'warn' : 'ok',
          note: deadFields.length > 0 ? deadFields.length + ' field_id(s) inexistant(s) dans les vues' : 'Tous les fields référencés existent',
          items: deadFields.slice(0, 10)
        });
      }

      // ── Webhooks désactivés ────────────────────────────────────────────────
      if (selected.has('webhook_dead')) {
        var disabledWebhooks = webhooks.filter(function(w) { return w.status === 'DISABLED'; });
        findings.push({
          id: 'webhook_dead',
          label: 'Webhooks désactivés',
          status: disabledWebhooks.length > 0 ? 'info' : 'ok',
          note: disabledWebhooks.length > 0 ? disabledWebhooks.length + ' webhook(s) désactivé(s)' : 'Tous les webhooks sont actifs',
          items: disabledWebhooks.slice(0, 10).map(function(w) { return w.name || w.id; })
        });
      }

      renderHealthResults(findings, resultsEl);
    }).catch(function(e) {
      resultsEl.innerHTML = '<div style="color:var(--c-danger);padding:10px;">❌ Erreur : ' + e.message + '</div>';
    });
  };

  function renderHealthResults(findings, el) {
    if (!el || !findings.length) return;
    var totalWarn = findings.filter(function(f) { return f.status === 'warn'; }).length;
    var totalInfo = findings.filter(function(f) { return f.status === 'info'; }).length;
    var totalOk   = findings.filter(function(f) { return f.status === 'ok'; }).length;
    var globalOk  = totalWarn === 0;
    var globalColor = globalOk ? 'var(--accent)' : 'var(--c-warn)';
    var globalBg    = globalOk ? 'rgba(0,212,170,0.08)' : 'rgba(230,126,34,0.08)';

    var html = '<div style="background:' + globalBg + ';border:2px solid ' + globalColor + ';border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:22px;">' + (globalOk ? '✅' : '⚠️') + '</span>' +
      '<div>' +
        '<div style="font-size:12px;font-weight:700;color:' + globalColor + ';">' +
          (globalOk ? 'Domaine sain — aucun orphelin détecté' : totalWarn + ' problème(s) détecté(s)') +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' +
          totalOk + ' OK · ' + totalWarn + ' ⚠️ · ' + totalInfo + ' ℹ️' +
        '</div>' +
      '</div>' +
    '</div>';

    html += findings.map(function(f) {
      var icon = f.status === 'ok' ? '✅' : f.status === 'info' ? 'ℹ️' : '⚠️';
      var color = f.status === 'ok' ? 'var(--accent)' : f.status === 'info' ? '#3498db' : 'var(--c-warn)';
      var border = f.status === 'ok' ? 'var(--border2)' : f.status === 'info' ? 'rgba(52,152,219,0.4)' : 'var(--c-warn)';
      return '<div style="background:var(--bg2);border:1px solid ' + border + ';border-radius:4px;padding:8px 12px;margin-bottom:4px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span>' + icon + '</span>' +
          '<span style="font-size:11px;font-weight:600;">' + f.label + '</span>' +
          '<span style="font-size:10px;color:' + color + ';margin-left:auto;">' + f.note + '</span>' +
        '</div>' +
        (f.items && f.items.length ? '<div style="margin-top:5px;padding-top:5px;border-top:1px solid var(--border);">' +
          f.items.map(function(item) {
            return '<div style="font-size:10px;color:var(--text-dim);padding:1px 0;font-family:monospace;">' + item + '</div>';
          }).join('') +
          (f.items.length === 10 ? '<div style="font-size:10px;color:var(--text-dim);">… (limité à 10)</div>' : '') +
        '</div>' : '') +
      '</div>';
    }).join('');

    el.innerHTML = html;
  }

  window.renderHealthResults = renderHealthResults;

})();
