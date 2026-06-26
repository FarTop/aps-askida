'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let _env       = null;   // token actif { name, iconikUrl, appId, token, environment }
let _jobs      = [];
let _assets    = [];
let _workflows = [];
let _webhooks  = [];
let _jobFilter      = 'all';
let _assetFilter    = 'all';
let _workflowFilter = 'all';
let _loading   = false;

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Org badge
  const org = localStorage.getItem('organisationName') || '';
  const badge = document.getElementById('orgBadge');
  if (badge && org) badge.textContent = org.toUpperCase();

  // Peupler le sélecteur d'environnements
  buildEnvSelect();
});

function buildEnvSelect() {
  const sel = document.getElementById('mon-env-select');
  let appTokens = [];
  try { appTokens = JSON.parse(localStorage.getItem('appTokensData') || '{}').appTokens || []; } catch(e) {}

  sel.innerHTML = '<option value="">— Sélectionner un environnement —</option>';
  appTokens
    .filter(t => t.enabled !== false)
    .forEach(t => {
      const badge = t.environment === 'prod' ? '🟢' : t.environment === 'qa' ? '🟡' : '🔵';
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = `${badge} ${t.name}`;
      sel.appendChild(opt);
    });

  if (!appTokens.length) {
    sel.innerHTML = '<option value="">Aucun environnement configuré (Settings)</option>';
  }
}

function onEnvChange() {
  const sel = document.getElementById('mon-env-select');
  const name = sel.value;
  if (!name) { _env = null; clearAll(); return; }

  let appTokens = [];
  try { appTokens = JSON.parse(localStorage.getItem('appTokensData') || '{}').appTokens || []; } catch(e) {}
  _env = appTokens.find(t => t.name === name) || null;

  // Badge type
  const envBadge = document.getElementById('mon-env-badge');
  if (_env) {
    const labels = { prod: '🟢 PRODUCTION', qa: '🟡 QA / STAGING', dev: '🔵 DEV' };
    envBadge.textContent = labels[_env.environment] || _env.environment || '';
    envBadge.className   = _env.environment || 'dev';
  }

  if (_env) refreshAll();
}

function clearAll() {
  ['jobs-list','assets-list','workflows-list','webhooks-list'].forEach(id => {
    document.getElementById(id).innerHTML = '<div class="mon-empty">Aucun environnement sélectionné</div>';
  });
  ['kv-jobs-running','kv-jobs-error','kv-jobs-done','kv-assets-recent','kv-webhooks']
    .forEach(id => { document.getElementById(id).textContent = '—'; });
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
async function refreshAll() {
  if (!_env || _loading) return;
  _loading = true;

  const btn  = document.getElementById('btn-refresh');
  const icon = document.getElementById('refresh-icon');
  btn.disabled = true;
  icon.classList.add('spinning');

  setLoading('jobs-list',      'Chargement des jobs…');
  setLoading('assets-list',    'Chargement des assets…');
  setLoading('workflows-list', 'Chargement des workflows…');
  setLoading('webhooks-list',  'Chargement des webhooks…');

  const base    = (_env.iconikUrl || 'https://app.iconik.io').replace(/\/$/, '');
  const headers = { 'App-ID': _env.appId, 'Auth-Token': _env.token };

  // Lancer les 4 en parallèle
  const [jobs, assets, workflows, webhooks] = await Promise.allSettled([
    fetchJobs(base, headers),
    fetchAssets(base, headers),
    fetchWorkflows(base, headers),
    fetchWebhooks(base, headers),
  ]);

  _jobs      = jobs.status      === 'fulfilled' ? jobs.value      : [];
  _assets    = assets.status    === 'fulfilled' ? assets.value    : [];
  _workflows = workflows.status === 'fulfilled' ? workflows.value : [];
  _webhooks  = webhooks.status  === 'fulfilled' ? webhooks.value  : [];

  renderKPIs();
  renderJobs();
  renderAssets();
  renderWorkflows();
  renderWebhooks();

  const now = new Date().toLocaleTimeString('fr-FR');
  document.getElementById('mon-last-refresh').textContent = 'Dernière mise à jour : ' + now;

  btn.disabled = false;
  icon.classList.remove('spinning');
  _loading = false;
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════════════════════════════
async function fetchJobs(base, headers) {
  // Jobs récents toutes catégories, triés par date desc
  const r = await fetch(
    base + '/API/jobs/v1/jobs/?per_page=100&sort=-date_created',
    { headers }
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return (data.objects || []).map(j => ({
    id       : j.id,
    title    : j.title || j.job_type || j.id,
    type     : j.job_type || '—',
    status   : (j.status || 'UNKNOWN').toUpperCase(),
    progress : j.progress || 0,
    date     : j.date_created || j.date_modified || '',
    asset_id : j.object_id || '',
    error    : j.error_message || '',
  }));
}

async function fetchAssets(base, headers) {
  // Assets modifiés dans les 24h via search
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const r = await fetch(base + '/API/search/v1/search/?per_page=50', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_types: ['assets'],
      sort: [{ order: 'desc', name: 'date_modified' }],
      filter: {
        operator: 'AND',
        terms: [{ name: 'date_modified', value: yesterday, operator: 'gte' }],
      },
    }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return (data.objects || []).map(a => ({
    id           : a.id,
    title        : a.title || a.original_name || a.id,
    type         : a.object_type || 'asset',
    date_created : a.date_created || '',
    date_modified: a.date_modified || '',
    status       : a.status || '',
    is_online    : a.is_online,
  }));
}

async function fetchWorkflows(base, headers) {
  // Historique des automations/workflows déclenchés
  const r = await fetch(
    base + '/API/automations/v1/automations/history/?per_page=100&sort=-date_created',
    { headers }
  );
  if (!r.ok) {
    // Fallback : liste des automations actives si pas d'historique disponible
    const r2 = await fetch(base + '/API/automations/v1/automations/?per_page=100', { headers });
    if (!r2.ok) throw new Error('HTTP ' + r2.status);
    const d2 = await r2.json();
    return (d2.objects || []).map(a => ({
      id    : a.id,
      name  : a.name || a.id,
      status: a.active ? 'ACTIVE' : 'INACTIVE',
      date  : a.date_modified || a.date_created || '',
      type  : 'automation',
      msg   : '',
    }));
  }
  const data = await r.json();
  return (data.objects || []).map(w => ({
    id    : w.id,
    name  : w.automation_name || w.name || w.id,
    status: (w.status || 'unknown').toUpperCase(),
    date  : w.date_created || '',
    type  : 'run',
    msg   : w.error_message || w.message || '',
  }));
}

async function fetchWebhooks(base, headers) {
  const r = await fetch(
    base + '/API/notifications/v1/webhooks/?per_page=200',
    { headers }
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return (data.objects || []).map(w => ({
    id        : w.id,
    name      : w.name || w.id,
    url       : w.url || '',
    event_type: w.event_type || '',
    realm     : w.realm || '',
    operation : w.operation || '',
    enabled   : w.enabled !== false,
    last_fired: w.last_fired || w.date_modified || '',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════════════════════
function renderKPIs() {
  const running = _jobs.filter(j => ['STARTED','RUNNING','IN_PROGRESS'].includes(j.status)).length;
  const failed  = _jobs.filter(j => ['FAILED','ERROR'].includes(j.status)).length;
  const done    = _jobs.filter(j => ['FINISHED','DONE','COMPLETED','SUCCESS'].includes(j.status)).length;
  const kpiErr  = document.getElementById('kpi-jobs-error');

  document.getElementById('kv-jobs-running').textContent = running;
  document.getElementById('kv-jobs-error').textContent   = failed;
  document.getElementById('kv-jobs-done').textContent    = done;
  document.getElementById('kv-assets-recent').textContent = _assets.length;
  document.getElementById('kv-webhooks').textContent = _webhooks.filter(w => w.enabled).length;

  kpiErr.className = 'kpi-card' + (failed > 0 ? ' kpi-danger' : '');
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER JOBS
// ═══════════════════════════════════════════════════════════════════════════
function filterJobs(btn) {
  document.querySelectorAll('#panel-jobs .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _jobFilter = btn.dataset.filter;
  renderJobs();
}

function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!_jobs.length) { list.innerHTML = '<div class="mon-empty">Aucun job récent</div>'; return; }

  const filtered = _jobFilter === 'all' ? _jobs : _jobs.filter(j => {
    if (_jobFilter === 'STARTED')  return ['STARTED','RUNNING','IN_PROGRESS'].includes(j.status);
    if (_jobFilter === 'FAILED')   return ['FAILED','ERROR'].includes(j.status);
    if (_jobFilter === 'FINISHED') return ['FINISHED','DONE','COMPLETED','SUCCESS'].includes(j.status);
    return true;
  });

  if (!filtered.length) { list.innerHTML = '<div class="mon-empty">Aucun job dans ce filtre</div>'; return; }

  list.innerHTML = filtered.slice(0, 50).map(j => {
    const sc = statusClass(j.status);
    return `<div class="mon-row">
      <div class="row-status ${sc.dot}"></div>
      <div class="row-body">
        <div class="row-title">${escH(j.title)}</div>
        <div class="row-meta">${escH(j.type)}${j.error ? ' — ' + escH(j.error.slice(0,60)) : ''}${j.date ? ' · ' + fmtDate(j.date) : ''}</div>
      </div>
      <div class="row-badge badge-${sc.badge}">${j.status}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER ASSETS
// ═══════════════════════════════════════════════════════════════════════════
function filterAssets(btn) {
  document.querySelectorAll('#panel-assets .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _assetFilter = btn.dataset.filter;
  renderAssets();
}

function renderAssets() {
  const list = document.getElementById('assets-list');
  if (!_assets.length) { list.innerHTML = '<div class="mon-empty">Aucun asset récent (24h)</div>'; return; }

  let filtered = _assets;
  if (_assetFilter === 'uploaded') {
    // Uploadé récemment = date_created proche de date_modified
    filtered = _assets.filter(a => {
      if (!a.date_created || !a.date_modified) return false;
      return Math.abs(new Date(a.date_created) - new Date(a.date_modified)) < 300000; // 5 min
    });
  } else if (_assetFilter === 'modified') {
    filtered = _assets.filter(a => {
      if (!a.date_created || !a.date_modified) return true;
      return Math.abs(new Date(a.date_created) - new Date(a.date_modified)) >= 300000;
    });
  }

  if (!filtered.length) { list.innerHTML = '<div class="mon-empty">Aucun asset dans ce filtre</div>'; return; }

  list.innerHTML = filtered.slice(0, 50).map(a => {
    const online = a.is_online ? 'done' : 'queued';
    const badge  = a.is_online ? 'done' : 'queued';
    return `<div class="mon-row">
      <div class="row-status ${online}"></div>
      <div class="row-body">
        <div class="row-title">${escH(a.title)}</div>
        <div class="row-meta">${escH(a.type)}${a.date_modified ? ' · ' + fmtDate(a.date_modified) : ''}</div>
      </div>
      <div class="row-badge badge-${badge}">${a.is_online ? 'EN LIGNE' : 'HORS LIGNE'}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════
function filterWorkflows(btn) {
  document.querySelectorAll('#panel-workflows .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _workflowFilter = btn.dataset.filter;
  renderWorkflows();
}

function renderWorkflows() {
  const list = document.getElementById('workflows-list');
  if (!_workflows.length) { list.innerHTML = '<div class="mon-empty">Aucun workflow trouvé</div>'; return; }

  const filtered = _workflowFilter === 'all' ? _workflows : _workflows.filter(w => {
    const s = w.status.toLowerCase();
    if (_workflowFilter === 'running')  return ['started','running','in_progress','active'].some(x => s.includes(x));
    if (_workflowFilter === 'failed')   return ['failed','error'].some(x => s.includes(x));
    if (_workflowFilter === 'finished') return ['finished','done','completed','success','inactive'].some(x => s.includes(x));
    return true;
  });

  if (!filtered.length) { list.innerHTML = '<div class="mon-empty">Aucun workflow dans ce filtre</div>'; return; }

  list.innerHTML = filtered.slice(0, 50).map(w => {
    const sc = statusClass(w.status);
    return `<div class="mon-row">
      <div class="row-status ${sc.dot}"></div>
      <div class="row-body">
        <div class="row-title">${escH(w.name)}</div>
        <div class="row-meta">${escH(w.type)}${w.msg ? ' — ' + escH(w.msg.slice(0,60)) : ''}${w.date ? ' · ' + fmtDate(w.date) : ''}</div>
      </div>
      <div class="row-badge badge-${sc.badge}">${w.status}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════
function renderWebhooks() {
  const list = document.getElementById('webhooks-list');
  if (!_webhooks.length) { list.innerHTML = '<div class="mon-empty">Aucun webhook configuré</div>'; return; }

  list.innerHTML = _webhooks.map(w => {
    const dot   = w.enabled ? 'running' : 'queued';
    const badge = w.enabled ? 'running' : 'queued';
    const label = w.enabled ? 'ACTIF' : 'INACTIF';
    const meta  = [w.event_type, w.realm, w.operation].filter(Boolean).join(' · ');
    return `<div class="mon-row">
      <div class="row-status ${dot}"></div>
      <div class="row-body">
        <div class="row-title">${escH(w.name)}</div>
        <div class="row-meta">${escH(meta)}${w.last_fired ? ' · ' + fmtDate(w.last_fired) : ''}</div>
      </div>
      <div class="row-badge badge-${badge}">${label}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function setLoading(id, msg) {
  document.getElementById(id).innerHTML =
    `<div class="mon-loader"><span class="mon-loader-txt">${msg}</span></div>`;
}

function statusClass(status) {
  const s = (status || '').toUpperCase();
  if (['STARTED','RUNNING','IN_PROGRESS','ACTIVE'].some(x => s.includes(x))) return { dot:'running', badge:'running' };
  if (['FAILED','ERROR'].some(x => s.includes(x)))                          return { dot:'failed',  badge:'failed'  };
  if (['FINISHED','DONE','COMPLETED','SUCCESS'].some(x => s.includes(x)))   return { dot:'done',    badge:'done'    };
  if (['QUEUED','PENDING'].some(x => s.includes(x)))                         return { dot:'queued',  badge:'queued'  };
  if (['WARN','WARNING'].some(x => s.includes(x)))                           return { dot:'warn',    badge:'warn'    };
  return { dot:'queued', badge:'queued' };
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000)   return 'à l\'instant';
    if (diff < 3600000) return Math.floor(diff/60000) + ' min';
    if (diff < 86400000)return Math.floor(diff/3600000) + 'h';
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch(e) { return iso.slice(0,16).replace('T',' '); }
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, isError) {
  const t = document.getElementById('mon-toast');
  t.textContent = msg;
  t.className = 'set-toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'set-toast'; }, 2500);
}
