// APS — index.js — 2026-06-23

const K_LAST        = 'askida:last';
const K_ORGS_ICONIK = 'askida:orgs:iconik';

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// ── Charger les organisations depuis l'API ───────────────────
async function chargerOrgs() {
  const orgs = [];

  // 1. Depuis la DB
  try {
    const r = await fetch('/api/organisation');
    if (r.ok) {
      const data = await r.json();
      if (data?.name) orgs.push(data.name);
    }
  } catch {}

  // 2. Depuis le localStorage (legacy + multi-org futur)
  const local = readJSON(K_ORGS_ICONIK, []);
  local.forEach(o => { if (!orgs.includes(o)) orgs.push(o); });

  // Mettre à jour le localStorage comme cache
  if (orgs.length) writeJSON(K_ORGS_ICONIK, orgs);

  return orgs;
}

// ── Panel Workspace ──────────────────────────────────────────
const cardWorkspace  = document.getElementById('panel-workspace')?.closest('.card');
const panelWorkspace = document.getElementById('panel-workspace');
const orgSelect      = document.getElementById('org-select');

function populateOrgs(orgs) {
  if (!orgSelect) return;
  orgSelect.innerHTML = orgs.length
    ? orgs.map(o => `<option value="${o}">${o}</option>`).join('')
    : '<option value="">— Aucune organisation configurée —</option>';
  const last = (readJSON(K_LAST, null) || {}).org || '';
  if (last && orgs.includes(last)) orgSelect.value = last;
}

function openPanel() {
  if (!cardWorkspace) return;
  cardWorkspace.classList.add('expanded');
  panelWorkspace?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePanel() {
  cardWorkspace?.classList.remove('expanded');
}

async function goToWorkspace() {
  const platform = document.getElementById('platform-select')?.value || 'iconik';
  const org      = orgSelect?.value || '';
  const env      = document.getElementById('env-select')?.value || 'prod';

  if (!org) { alert('Aucune organisation disponible — configurez-en une dans Administration'); return; }

  // Charger tous les environnements actifs avec credentials depuis la DB
  try {
    const r = await fetch('/api/environments/credentials');
    if (r.ok) {
      const creds = await r.json();
      // Injecter dans appTokensData — format compatible avec le code Iconik existant
      localStorage.setItem('appTokensData', JSON.stringify({ appTokens: creds }));
      // Définir l'environnement actif
      const active = creds.find(c => c.environment === env) || creds[0];
      if (active) {
        localStorage.setItem('organisationName', org);
        localStorage.setItem('iconikUrl',        active.iconikUrl);
        localStorage.setItem('appId',            active.appId);
        localStorage.setItem('activeEnv',        active.environment);
      }
    }
  } catch(e) {
    console.warn('[APS] Impossible de charger les credentials :', e.message);
  }

  writeJSON(K_LAST, { platform, org, env });
  localStorage.setItem('aps:context', JSON.stringify({ platform, org, domain: env }));

  const targets = {
    iconik: `platforms/iconik/dashboard/dashboard.html?org=${encodeURIComponent(org)}&domain=${encodeURIComponent(env)}`,
  };
  window.location.href = targets[platform] || targets.iconik;
}

// ── Events ───────────────────────────────────────────────────
document.getElementById('btn-open-workspace').onclick  = openPanel;
document.getElementById('btn-close-workspace').onclick = closePanel;
document.getElementById('btn-continue').onclick        = goToWorkspace;
document.getElementById('overlay')?.addEventListener('click', closePanel);

// ── Boot ─────────────────────────────────────────────────────
chargerOrgs().then(orgs => {
  populateOrgs(orgs);

  // Ouvrir automatiquement le panel si on revient de la plateforme
  const last = readJSON(K_LAST, null);
  if (last?.org) {
    // Juste pré-sélectionner, ne pas ouvrir automatiquement
    if (orgSelect) orgSelect.value = last.org;
  }
});

window.addEventListener('storage', () => {
  chargerOrgs().then(populateOrgs);
});
