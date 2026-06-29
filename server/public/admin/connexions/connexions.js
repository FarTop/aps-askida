// APS — admin/connexions/connexions.js — 2026-06-23

const API = '/api/connexions';
let connexions = [];
let editingId  = null;

// ── Chargement ───────────────────────────────────────────────
async function charger() {
  try {
    const r = await fetch(API);
    connexions = await r.json();
    afficher(connexions);
  } catch(e) {
    document.getElementById('conn-list').innerHTML =
      `<div class="adm-error">Erreur de chargement : ${e.message}</div>`;
  }
}

// ── Affichage liste ──────────────────────────────────────────
function afficher(list) {
  const el = document.getElementById('conn-list');
  if (!list.length) {
    el.innerHTML = '<div class="adm-empty">Aucune connexion. Cliquez sur "+ Nouvelle connexion" pour commencer.</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="conn-card ${c.isActive ? '' : 'inactive'}" data-id="${c.id}">
      <div class="conn-card-left">
        <div class="conn-icon">${typeIcon(c.type)}</div>
        <div class="conn-info">
          <div class="conn-name">${escHtml(c.name)}</div>
          <div class="conn-meta">
            <span class="badge badge-type">${c.type}</span>
            <span class="badge badge-dir ${c.direction}">${c.direction === 'outbound' ? 'Sortante' : 'Entrante'}</span>
            ${c.endpoint ? `<span class="conn-url">${escHtml(c.endpoint)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="conn-card-right">
        <span class="conn-status ${c.isActive ? 'active' : 'inactive'}">${c.isActive ? '● Actif' : '○ Inactif'}</span>
        <button class="btn-icon" onclick="editer('${c.id}')" title="Éditer">✏️</button>
        <button class="btn-icon danger" onclick="supprimer('${c.id}', '${escHtml(c.name)}')" title="Supprimer">🗑</button>
      </div>
    </div>
  `).join('');
}

function typeIcon(type) {
  return { iconik: '🎬', aws_s3: '☁️', http: '🌐', listener: '👂' }[type] || '🔌';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Filtres ──────────────────────────────────────────────────
function filtrer() {
  const q    = document.getElementById('search').value.toLowerCase();
  const type = document.getElementById('filter-type').value;
  const dir  = document.getElementById('filter-dir').value;
  afficher(connexions.filter(c =>
    (!q    || c.name.toLowerCase().includes(q) || (c.endpoint||'').toLowerCase().includes(q)) &&
    (!type || c.type === type) &&
    (!dir  || c.direction === dir)
  ));
}

// ── Panneau latéral ──────────────────────────────────────────
function ouvrirPanel(conn = null) {
  editingId = conn?.id || null;
  document.getElementById('panel-title').textContent = conn ? 'Éditer la connexion' : 'Nouvelle connexion';

  // Remplir les champs
  document.getElementById('f-name').value        = conn?.name        || '';
  document.getElementById('f-type').value        = conn?.type        || 'iconik';
  document.getElementById('f-direction').value   = conn?.direction   || 'outbound';
  document.getElementById('f-baseurl').value     = conn?.endpoint    || '';
  document.getElementById('f-authtype').value    = conn?.authType    || '';
  document.getElementById('f-authvalue').value   = conn?.authValue   || '';
  // Pré-remplir les champs AWS si type aws_s3
  if (conn?.type === 'aws_s3') {
    try {
      const aws = JSON.parse(conn.authValue || '{}');
      document.getElementById('f-aws-key').value    = aws.key    || '';
      document.getElementById('f-aws-secret').value = aws.secret || '';
      document.getElementById('f-aws-region').value = aws.region || '';
      document.getElementById('f-aws-bucket').value = aws.bucket || '';
    } catch(_) {}
  } else {
    document.getElementById('f-aws-key').value    = '';
    document.getElementById('f-aws-secret').value = '';
    document.getElementById('f-aws-region').value = '';
    document.getElementById('f-aws-bucket').value = '';
  }
  document.getElementById('f-description').value = conn?.description || '';
  document.getElementById('f-active').checked    = conn?.isActive !== false;

  onTypeChange();
  onAuthChange();

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
  const conn = connexions.find(c => c.id === id);
  if (conn) ouvrirPanel(conn);
}

// ── Changements de type/auth ─────────────────────────────────
function onTypeChange() {
  const type = document.getElementById('f-type').value;
  document.getElementById('fields-iconik').style.display = type === 'iconik'  ? 'block' : 'none';
  document.getElementById('fields-aws').style.display    = type === 'aws_s3'  ? 'block' : 'none';
  if (type === 'iconik')  document.getElementById('f-authtype').value = 'iconik';
  if (type === 'aws_s3')  document.getElementById('f-authtype').value = 'aws_s3';
  onAuthChange();
}

function onAuthChange() {
  const auth = document.getElementById('f-authtype').value;
  const show = ['bearer', 'apikey_header', 'iconik'].includes(auth);
  document.getElementById('field-authvalue').style.display = show ? 'flex' : 'none';
  const labels = { bearer: 'Bearer Token', apikey_header: 'API Key', iconik: 'Auth Token' };
  document.getElementById('authvalue-label').textContent = labels[auth] || 'Token';
}

function toggleReveal() {
  const inp = document.getElementById('f-authvalue');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Sauvegarde ───────────────────────────────────────────────
async function sauvegarder() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Le nom est obligatoire'); return; }

  const payload = {
    name,
    type:        document.getElementById('f-type').value,
    direction:   document.getElementById('f-direction').value,
    endpoint:    document.getElementById('f-baseurl').value.trim(),
    authType:    document.getElementById('f-authtype').value,
    authValue: (function() {
      const type = document.getElementById('f-type').value;
      if (type === 'aws_s3') {
        const key    = document.getElementById('f-aws-key').value.trim();
        const secret = document.getElementById('f-aws-secret').value.trim();
        const region = document.getElementById('f-aws-region').value.trim();
        const bucket = document.getElementById('f-aws-bucket').value.trim();
        if (key || secret) return JSON.stringify({ key, secret, region, bucket });
        return '';
      }
      return document.getElementById('f-authvalue').value;
    })(),
    description: document.getElementById('f-description').value,
    isActive:    document.getElementById('f-active').checked,
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
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
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
  if (!confirm(`Supprimer la connexion "${name}" ?`)) return;
  try {
    const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
}

// ── Events ───────────────────────────────────────────────────
document.getElementById('btn-new').onclick        = () => ouvrirPanel();
document.getElementById('btn-close-panel').onclick = fermerPanel;
document.getElementById('btn-cancel').onclick      = fermerPanel;
document.getElementById('btn-save').onclick        = sauvegarder;
document.getElementById('overlay').onclick         = fermerPanel;
document.getElementById('search').oninput          = filtrer;
document.getElementById('filter-type').onchange    = filtrer;
document.getElementById('filter-dir').onchange     = filtrer;

// ── Boot ─────────────────────────────────────────────────────
charger();
