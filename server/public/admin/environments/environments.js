// APS — admin/environments/environments.js — 2026-06-23

const API      = '/api/environments';
const API_ORG  = '/api/organisation';
const API_PLAT = '/api/platforms';
let envs       = [];
let orgs       = [];
let platforms  = [];
let editingId  = null;

const TYPES = [
  { value: 'prod', label: 'Production', icon: '🟢' },
  { value: 'dev',  label: 'Développement', icon: '🔵' },
  { value: 'qa',   label: 'QA / Test', icon: '🟡' },
  { value: 'poc',  label: 'POC', icon: '🟣' },
];

// ── Chargement ───────────────────────────────────────────────
async function charger() {
  try {
    const [rEnvs, rOrg, rPlats] = await Promise.all([
      fetch(API).then(r => r.json()),
      fetch(API_ORG).then(r => r.json()),
      fetch(API_PLAT).then(r => r.json()),
    ]);
    envs      = rEnvs;
    orgs      = [rOrg];
    platforms = rPlats;
    afficher();
    peuplerOrgSelect();
    peuplerPlatformSelect();
  } catch(e) {
    document.getElementById('env-list').innerHTML =
      `<div class="adm-error">Erreur de chargement : ${e.message}</div>`;
  }
}

// ── Affichage liste ──────────────────────────────────────────
function afficher() {
  const el = document.getElementById('env-list');
  if (!envs.length) {
    el.innerHTML = '<div class="adm-empty">Aucun environnement. Cliquez sur "+ Nouvel environnement".</div>';
    return;
  }
  const orgMap = {};
  orgs.forEach(o => orgMap[o.id] = o.name);

  el.innerHTML = envs.map(e => {
    const typeInfo = TYPES.find(t => t.value === e.type) || { icon: '🌐', label: e.type };
    return `
    <div class="env-card ${e.isDefault ? 'default' : ''}">
      <div class="env-left">
        <div class="env-icon">${typeInfo.icon}</div>
        <div>
          <div class="env-name">${escHtml(e.name)}</div>
          <div class="env-meta">
            <span class="badge-type">${typeInfo.label}</span>
            ${e.isDefault ? '<span class="badge-default">Par défaut</span>' : ''}
            ${e.baseUrl ? `<span class="env-url">${escHtml(e.baseUrl)}</span>` : ''}
            ${e.hasToken ? '<span class="badge-token">🔑 Token configuré</span>' : '<span class="badge-missing">⚠️ Token manquant</span>'}
          </div>
        </div>
      </div>
      <div class="env-right">
        <button class="btn-icon" onclick="testerConnexion('${e.id}')" title="Tester la connexion">🔌</button>
        <button class="btn-icon" onclick="editer('${e.id}')" title="Éditer">✏️</button>
        <button class="btn-icon danger" onclick="supprimer('${e.id}', '${escHtml(e.name)}')" title="Supprimer">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Org select ───────────────────────────────────────────────
function peuplerOrgSelect() {
  const sel = document.getElementById('f-org');
  sel.innerHTML = orgs.map(o => `<option value="${o.id}">${escHtml(o.name)}</option>`).join('');
}

function peuplerPlatformSelect(selectedId = '') {
  const sel = document.getElementById('f-platform');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sélectionner une plateforme —</option>' +
    platforms.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('');
}

// ── Panneau ──────────────────────────────────────────────────
async function ouvrirPanel(env = null) {
  editingId = env?.id || null;
  document.getElementById('panel-title').textContent = env ? 'Éditer l\'environnement' : 'Nouvel environnement';

  // Si édition, charger le token depuis l'API
  let token = '';
  if (env?.id) {
    try {
      const r = await fetch(`${API}/${env.id}`);
      const d = await r.json();
      token = d.token || '';
    } catch {}
  }

  document.getElementById('f-name').value    = env?.name    || '';
  document.getElementById('f-type').value    = env?.type    || 'qa';
  document.getElementById('f-baseurl').value = env?.baseUrl || 'https://app.iconik.io';
  document.getElementById('f-appid').value   = env?.appId   || '';
  document.getElementById('f-token').value   = token;
  document.getElementById('f-default').checked = env?.isDefault || false;
  if (env?.orgId) document.getElementById('f-org').value = env.orgId;
  peuplerPlatformSelect(env?.platformId || '');

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.getElementById('f-name').focus();
}

function fermerPanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
}

function editer(id) {
  const env = envs.find(e => e.id === id);
  if (env) ouvrirPanel(env);
}

// ── Test de connexion ────────────────────────────────────────
async function testerConnexion(id) {
  const btn = document.querySelector(`[onclick="testerConnexion('${id}')"]`);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const r = await fetch(`${API}/${id}/test`, { method: 'POST' });
    const d = await r.json();
    alert(d.ok ? `✅ ${d.message}` : `❌ ${d.message}`);
  } catch(e) {
    alert('❌ Erreur réseau : ' + e.message);
  } finally {
    if (btn) { btn.textContent = '🔌'; btn.disabled = false; }
  }
}

// ── Sauvegarde ───────────────────────────────────────────────
async function sauvegarder() {
  const name = document.getElementById('f-name').value.trim();
  const type = document.getElementById('f-type').value;
  if (!name) { alert('Le nom est obligatoire'); return; }

  // Auto-slug depuis le type
  const slug = type;

  const payload = {
    name, slug, type,
    orgId:      document.getElementById('f-org').value,
    platformId: document.getElementById('f-platform').value || null,
    baseUrl:    document.getElementById('f-baseurl').value.trim(),
    appId:      document.getElementById('f-appid').value.trim(),
    token:      document.getElementById('f-token').value.trim(),
    isDefault:  document.getElementById('f-default').checked,
  };

  const btn = document.getElementById('btn-save');
  btn.textContent = '⏳'; btn.disabled = true;

  try {
    const url    = editingId ? `${API}/${editingId}` : API;
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || `Erreur ${r.status}`);
    }
    fermerPanel();
    await charger();
  } catch(e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.textContent = '✓ Sauvegarder'; btn.disabled = false;
  }
}

// ── Suppression ──────────────────────────────────────────────
async function supprimer(id, name) {
  if (!confirm(`Supprimer l'environnement "${name}" ?`)) return;
  try {
    const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
}

// ── Toggle reveal token ──────────────────────────────────────
function toggleReveal() {
  const inp = document.getElementById('f-token');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Events ───────────────────────────────────────────────────
document.getElementById('btn-new').onclick          = () => ouvrirPanel();
document.getElementById('btn-close-panel').onclick  = fermerPanel;
document.getElementById('btn-cancel').onclick       = fermerPanel;
document.getElementById('btn-save').onclick         = sauvegarder;
document.getElementById('overlay').onclick          = fermerPanel;

// ── Boot ─────────────────────────────────────────────────────
charger();
