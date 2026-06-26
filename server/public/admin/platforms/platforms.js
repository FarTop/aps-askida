// APS — admin/platforms/platforms.js — 2026-06-24

const API     = '/api/platforms';
const API_ORG = '/api/organisation';
let platforms = [];
let orgs      = [];
let editingId = null;

const TYPE_LABELS = {
  integration: 'Intégration',
  runtime:     'Runtime',
  encoder:     'Encodeur',
  ai:          'IA',
};

const TYPE_ICONS = {
  integration: '🔗',
  runtime:     '⚙️',
  encoder:     '🎞',
  ai:          '🤖',
};

// ── Chargement ───────────────────────────────────────────────
async function charger() {
  try {
    const [rPlats, rOrg] = await Promise.all([
      fetch(API).then(r => r.json()),
      fetch(API_ORG).then(r => r.json()),
    ]);
    platforms = rPlats;
    orgs      = [rOrg];

    // Pour chaque plateforme, lier les environnements à leurs orgs
    await Promise.all(platforms.map(async p => {
      try {
        const r = await fetch(`${API}/${p.id}`);
        const d = await r.json();
        p.organisations = d.organisations || [];
        p.environments  = d.environments  || [];
      } catch {}
    }));

    afficher();
  } catch(e) {
    document.getElementById('plat-list').innerHTML =
      `<div class="adm-error">Erreur : ${e.message}</div>`;
  }
}

// ── Affichage liste ──────────────────────────────────────────
function afficher() {
  const el = document.getElementById('plat-list');
  if (!platforms.length) {
    el.innerHTML = '<div class="adm-empty">Aucune plateforme déclarée.</div>';
    return;
  }

  el.innerHTML = platforms.map(p => {
    const icon      = p.icon || TYPE_ICONS[p.type] || '🔌';
    const typeLabel = TYPE_LABELS[p.type] || p.type;
    const orgLinks  = p.organisations || [];

    const orgsHtml = orgLinks.length
      ? orgLinks.map(link => {
          const org  = link.organisation;
          const envs = (p.environments || []).filter(e => e.orgId === org.id);
          const envsHtml = envs.length
            ? envs.map(e => `<span class="env-chip ${e.type}">${e.type.toUpperCase()}${e.hasToken === false ? ' ⚠️' : ''}</span>`).join('')
            : '<span class="env-chip missing">Aucun environnement</span>';
          return `
            <div class="org-row">
              <div style="flex:1">
                <div class="org-name">🏢 ${escHtml(org.name)}</div>
                <div class="org-envs">${envsHtml}</div>
              </div>
              <button class="btn-icon danger" onclick="delierOrg('${p.id}','${org.id}','${escHtml(org.name)}')" title="Délier">✂️</button>
            </div>`;
        }).join('')
      : '<div style="color:var(--text-dim);font-size:13px;padding:6px 0">Aucune organisation liée</div>';

    // Orgs disponibles à lier (pas déjà liées)
    const lieedOrgIds = orgLinks.map(l => l.organisation.id);
    const availOrgs   = orgs.filter(o => !lieedOrgIds.includes(o.id));
    const addOrgHtml  = availOrgs.length
      ? `<div class="add-org-row">
           <select id="add-org-${p.id}">
             ${availOrgs.map(o => `<option value="${o.id}">${escHtml(o.name)}</option>`).join('')}
           </select>
           <button class="btn ghost" onclick="lierOrg('${p.id}')">+ Lier</button>
         </div>`
      : '<div style="color:var(--text-dim);font-size:12px;margin-top:8px">Toutes les organisations sont liées</div>';

    return `
      <div class="plat-card" id="plat-${p.id}">
        <div class="plat-card-header" onclick="toggleBody('${p.id}')">
          <div class="plat-left">
            <div class="plat-icon">${icon}</div>
            <div>
              <div class="plat-name">${escHtml(p.name)}</div>
              <div class="plat-meta">
                <span class="badge-type">${typeLabel}</span>
                <span class="badge-type">v${escHtml(p.version)}</span>
                <span class="${p.isActive ? 'badge-active' : 'badge-inactive'}">${p.isActive ? 'Active' : 'Inactive'}</span>
                <span style="font-size:11px;color:var(--text-dim)">${orgLinks.length} organisation${orgLinks.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div class="plat-right">
            <button class="btn-icon" onclick="event.stopPropagation();editer('${p.id}')" title="Éditer">✏️</button>
            <button class="btn-icon danger" onclick="event.stopPropagation();supprimer('${p.id}','${escHtml(p.name)}')" title="Supprimer">🗑</button>
            <span class="chevron" id="chev-${p.id}">›</span>
          </div>
        </div>
        <div class="plat-body" id="body-${p.id}">
          <div class="org-section-title">Organisations utilisant cette plateforme</div>
          ${orgsHtml}
          ${addOrgHtml}
        </div>
      </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Toggle body ──────────────────────────────────────────────
function toggleBody(id) {
  const body = document.getElementById(`body-${id}`);
  const chev = document.getElementById(`chev-${id}`);
  body?.classList.toggle('open');
  chev?.classList.toggle('open');
}

// ── Lier / Délier org ────────────────────────────────────────
async function lierOrg(platformId) {
  const sel   = document.getElementById(`add-org-${platformId}`);
  const orgId = sel?.value;
  if (!orgId) return;
  try {
    const r = await fetch(`${API}/${platformId}/organisations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orgId }),
    });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
    // Réouvrir le body après rechargement
    setTimeout(() => {
      document.getElementById(`body-${platformId}`)?.classList.add('open');
      document.getElementById(`chev-${platformId}`)?.classList.add('open');
    }, 100);
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function delierOrg(platformId, orgId, orgName) {
  if (!confirm(`Délier "${orgName}" de cette plateforme ?`)) return;
  try {
    const r = await fetch(`${API}/${platformId}/organisations/${orgId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
  } catch(e) { alert('Erreur : ' + e.message); }
}

// ── Panneau ──────────────────────────────────────────────────
function ouvrirPanel(p = null) {
  editingId = p?.id || null;
  document.getElementById('panel-title').textContent = p ? 'Éditer la plateforme' : 'Nouvelle plateforme';
  document.getElementById('f-name').value    = p?.name    || '';
  document.getElementById('f-slug').value    = p?.slug    || '';
  document.getElementById('f-type').value    = p?.type    || 'integration';
  document.getElementById('f-icon').value    = p?.icon    || '';
  document.getElementById('f-version').value = p?.version || '1.0.0';
  document.getElementById('f-active').checked = p?.isActive !== false;
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
  const p = platforms.find(x => x.id === id);
  if (p) ouvrirPanel(p);
}

// Auto-slug
document.getElementById('f-name').addEventListener('input', function() {
  if (!editingId) {
    document.getElementById('f-slug').value = this.value
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
});

// ── Sauvegarde ───────────────────────────────────────────────
async function sauvegarder() {
  const name = document.getElementById('f-name').value.trim();
  const slug = document.getElementById('f-slug').value.trim();
  if (!name || !slug) { alert('Nom et slug obligatoires'); return; }

  const payload = {
    name, slug,
    type:     document.getElementById('f-type').value,
    icon:     document.getElementById('f-icon').value.trim() || null,
    version:  document.getElementById('f-version').value.trim() || '1.0.0',
    isActive: document.getElementById('f-active').checked,
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
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || `Erreur ${r.status}`); }
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
  if (!confirm(`Supprimer la plateforme "${name}" ?\nToutes les liaisons organisations seront supprimées.`)) return;
  try {
    const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
  } catch(e) { alert('Erreur : ' + e.message); }
}

// ── Events ───────────────────────────────────────────────────
document.getElementById('btn-new').onclick          = () => ouvrirPanel();
document.getElementById('btn-close-panel').onclick  = fermerPanel;
document.getElementById('btn-cancel').onclick       = fermerPanel;
document.getElementById('btn-save').onclick         = sauvegarder;
document.getElementById('overlay').onclick          = fermerPanel;

// ── Boot ─────────────────────────────────────────────────────
charger();
