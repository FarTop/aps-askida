// builders/doc/doc.js — Canvas PREVIEW/CONFIG (A) + scope reload + kit par projet + statut projet
// + datasets dynamiques (catalog) + masquage systèmes (toujours)

// LES DONNÉES DU DOC BUILDER VIVENT EN BASE (2026-08-13). Les trois clés
// `afs:doc:owners`, `afs:doc:kits` et `afs:doc:templates` ont disparu : c'était
// de la donnée métier dans le navigateur, ce que le principe en tête de
// schema.prisma interdit, et elle ne survivait ni à un autre poste, ni à un
// autre profil, ni à un changement d'organisation.
//
// Restent ici les clés de SESSION partagées par tout APS (`aps:context`,
// `organisationName`, `appTokensData`), lues plus bas par loadOrgList() et
// discoverDomainsFromAppTokens() : elles appartiennent au contexte
// d'organisation, pas au Doc Builder, et se traitent avec lui.

async function api(chemin, options){
  const r = await fetch('/api' + chemin, Object.assign(
    { headers: { 'Content-Type': 'application/json' } }, options || {}));
  if (!r.ok) {
    let msg = r.status;
    try { msg = (await r.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

// Un échec d'enregistrement ne doit PAS passer inaperçu : avec le localStorage
// l'écriture ne ratait jamais, l'écran n'avait donc aucun chemin d'erreur.
function echecEnregistrement(e){
  console.error('[doc] enregistrement', e);
  alert('Enregistrement impossible : ' + (e && e.message ? e.message : e));
}

// LE MAGASIN — l'état de l'écran, chargé une fois puis tenu à jour.
// Les lectures restent SYNCHRONES (`loadOwners()`, `loadTemplates()`,
// `loadKit()` gardent leur signature) parce que l'écran les appelle depuis une
// vingtaine d'endroits, souvent en plein rendu ; seules les écritures partent
// vers l'API. Le chargement, lui, est attendu une fois au démarrage.
const Magasin = {
  envKey: '',
  owners: {},
  org: null,
  templates: [],
  kit: null,

  async charger(envKey){
    this.envKey = envKey;
    const [owners, templates, kit, contexte] = await Promise.all([
      api('/doc-owners'),
      api('/doc-templates'),
      api('/doc-context?envKey=' + encodeURIComponent(envKey)),
      // QUI on est, au sens d'APS. Le seul endroit d'où l'organisation doit
      // venir désormais — plus aucune lecture de `organisationName`.
      api('/context'),
    ]);
    this.owners = {};
    owners.forEach(o => { this.owners[o.id] = { id: o.id, label: o.label, mode: o.mode }; });
    // Forme attendue par l'écran : le JSON importé vit dans `content` côté base,
    // dans `template` côté écran.
    this.templates = templates.map(t => ({
      id: t.id, name: t.name, createdAt: t.createdAt, template: t.content,
    }));
    this.kit = kit;
    // `null` est une réponse LÉGITIME : un rôle non filtré peut travailler
    // « Toutes organisations ». On ne fabrique pas un nom dans ce cas.
    this.org = (contexte && contexte.org) || null;
  },
};

function safeParse(text){ try { return JSON.parse(text); } catch { return null; } }
// `readJSON` / `writeJSON` retirés le 2026-08-13 : plus aucun appelant. Ils
// étaient l'accès générique au localStorage de cet écran — il ne lui reste que
// `aps:context` (plateforme et domaine) et les clés de session partagées, lues
// et écrites directement, en trois endroits qu'on peut compter.

// L'ORGANISATION NE FAIT PLUS PARTIE DE LA CLÉ (2026-08-13). Elle prime, donc
// elle vit un cran au-dessus : `DocKitContext` est unique par (orgId, envKey),
// et cet orgId vient du contexte serveur — le vrai, celui du cookie partagé par
// tout APS. La porter AUSSI dans la clé, sous la forme d'un nom saisi à la main,
// c'était scoper deux fois avec deux identités différentes : un même client
// écrit « Bayard » ici et « Groupe Bayard » là, et se retrouvait avec deux
// espaces de travail sans jamais comprendre pourquoi.
//
// Reste dans la clé ce qui distingue deux contextes DANS une organisation :
// la plateforme et le domaine.
function projectKey(ctx){
  const p = (ctx.platform || 'iconik').trim();
  const d = (ctx.domain || '').trim();
  return `${p}|${d}`;
}

// -------- Owners
// Les six par défaut sont semés par la route à la première lecture d'une
// organisation qui n'en a aucun (doc-owners.js) : le comportement que
// `defaultOwners()` assurait ici, mais pour tout le monde et une seule fois.
function loadOwners(){ return Magasin.owners; }

async function ownerAjouter(label){
  const o = await api('/doc-owners', { method: 'POST', body: JSON.stringify({ label }) });
  Magasin.owners[o.id] = { id: o.id, label: o.label, mode: o.mode };
  return o;
}
async function ownerRenommer(id, label){
  const o = await api('/doc-owners/' + encodeURIComponent(id),
    { method: 'PUT', body: JSON.stringify({ label }) });
  Magasin.owners[o.id] = { id: o.id, label: o.label, mode: o.mode };
  return o;
}
async function ownerSupprimer(id){
  await api('/doc-owners/' + encodeURIComponent(id), { method: 'DELETE' });
  delete Magasin.owners[id];
}

// -------- Kits
// Un « kit » côté écran, c'est l'état de travail d'un contexte : le modèle
// DocKitContext le porte champ pour champ, et la clé « plateforme|org|domaine »
// que projectKey() fabrique EST son `envKey`.
function loadKit(){ return Magasin.kit; }
function saveKit(k, kit){
  Magasin.kit = kit;
  api('/doc-context', { method: 'PUT',
    body: JSON.stringify(Object.assign({ envKey: Magasin.envKey }, kit)) })
    .catch(echecEnregistrement);
}
function resetKit(){
  Magasin.kit = null;
  api('/doc-context?envKey=' + encodeURIComponent(Magasin.envKey), { method: 'DELETE' })
    .catch(echecEnregistrement);
}

// -------- Statut projet
function isProjectLocked(kit){ return kit.status === 'closed' || kit.locked === true; }
function lockProject(kit, reason='Projet clôturé'){
  kit.status = 'closed';
  kit.locked = true;
  kit.lockedAt = new Date().toISOString();
  kit.lockedReason = reason;
}
function unlockProject(kit){
  kit.status = 'active';
  kit.locked = false;
  kit.lockedAt = null;
  kit.lockedReason = null;
}

// -------- Templates
function loadTemplates(){ return Magasin.templates; }

// Un gabarit importé appartient à l'organisation du contexte, pas à la
// bibliothèque partagée : on ne verse pas dans le commun sans le dire
// (doc-templates.js, `partage`). `renderer` reprend ce que le JSON déclare —
// l'export d'aujourd'hui est un aperçu texte, ce champ prendra son sens quand
// le vrai rendu existera.
async function templateImporter(nom, tpl){
  const t = await api('/doc-templates', { method: 'POST', body: JSON.stringify({
    name: nom, renderer: tpl.renderer || 'html', content: tpl,
  }) });
  Magasin.templates.unshift({ id: t.id, name: t.name, createdAt: t.createdAt, template: t.content });
  return t;
}
async function templateSupprimer(id){
  await api('/doc-templates/' + encodeURIComponent(id), { method: 'DELETE' });
  Magasin.templates = Magasin.templates.filter(t => t.id !== id);
}
function renderSelectOptions(selectEl, items, activeId){
  selectEl.innerHTML = items.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  if (activeId) selectEl.value = activeId;
}

// -------- Placeholder render
function getPath(obj, path){
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts){ if (cur == null) return ''; cur = cur[p]; }
  return (cur == null) ? '' : cur;
}
function renderTemplateText(text, model){
  return String(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const v = getPath(model, expr.trim());
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

// -------- Export helpers
function normalizeList(ds){
  if (!ds) return [];
  if (Array.isArray(ds)) return ds;
  if (typeof ds === 'object'){
    for (const k of Object.keys(ds)) if (Array.isArray(ds[k])) return ds[k];
  }
  return [];
}
function pickName(item){
  if (!item || typeof item !== 'object') return '';
  return (item.name || item.title || item.label || item.username || item.email || item.id || '').toString();
}
function topNames(list, limit=10){
  const out = [];
  for (const it of list){
    const n = pickName(it);
    if (n) out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}
function filenameFor(model, suffix='REPORT'){
  const org = (model.context.org || 'org').replace(/[^a-z0-9-_]+/gi,'_');
  const dom = (model.context.domain || 'na').replace(/[^a-z0-9-_]+/gi,'_');
  const d = new Date();
  const stamp =
    d.getFullYear() +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0') + '-' +
    String(d.getHours()).padStart(2,'0') +
    String(d.getMinutes()).padStart(2,'0');
  return `AFS_${suffix}_${org}_${dom}_${stamp}.txt`;
}
function exportTxt(text, name){
  const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// -------- Scope (reload)
// `loadOrgList()` retiré le 2026-08-13 : il fabriquait une liste
// d'organisations en fusionnant `askida:orgs:iconik` et `organisationName` du
// localStorage. Plus aucun appelant — les organisations viennent de la base,
// par le sélecteur partagé du header.
function discoverDomainsFromAppTokens(){
  const raw = localStorage.getItem('appTokensData');
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    const toks = Array.isArray(obj?.appTokens) ? obj.appTokens : [];
    const envs = toks.map(t => String(t.environment || '').toUpperCase().trim()).filter(Boolean);
    return [...new Set(envs)];
  } catch { return []; }
}
// N'écrit PLUS `organisationName` : cette clé sert encore aux anciens écrans
// Iconik (dashboard, settings…), et le Doc Builder n'a plus à la remplir depuis
// un choix qui n'existe plus chez lui. L'organisation se change dans le header,
// et c'est le cookie `aps-org-id` qui la porte.
function setApsContextAndReload(platform, domain){
  const c = { platform, domain };
  localStorage.setItem('aps:context', JSON.stringify(c));
  location.reload();
}

// -------- Datasets: masque “system”
function isSystemDataset(def){
  if (def && def.system === true) return true;
  const k = String(def?.key || '');
  return (
    k.includes(':') ||
    k.startsWith('askida:') ||
    k === 'wfd_include_system_teams' ||
    k === 'appTokensData' ||
    k === 'iconikAppTokensData' ||
    k === 'iconik:activeEnv'
  );
}
function filterNonSystemCatalog(catalog){
  return (catalog || []).filter(d => !isSystemDataset(d));
}

function renderDatasetsList(container, catalog, kit, locked, onToggle, onRemove){
  container.innerHTML = '';
  const selectedKeys = Object.keys(kit.datasets || {});
  const defs = catalog.filter(d => selectedKeys.includes(d.key));

  for (const d of defs){
    const row = document.createElement('div');
    row.className = 'wfd-row';
    row.style.marginTop = '6px';

    const label = document.createElement('label');
    label.className = 'wfd-check';
    label.style.flex = '1';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = kit.datasets[d.key] === true;
    cb.disabled = locked;
    cb.addEventListener('change', () => onToggle(d.key, cb.checked));

    const text = document.createElement('span');
    text.textContent = d.label;

    label.appendChild(cb);
    label.appendChild(text);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ghost';
    rm.textContent = 'Retirer';
    rm.disabled = locked;
    rm.addEventListener('click', () => onRemove(d.key));

    row.appendChild(label);
    row.appendChild(rm);
    container.appendChild(row);
  }
}

// -------- Preview A (situante)
function buildPreviewA(activeTemplate, model, selectionSummary){
  const ctx = model.context;
  const lines = [];
  lines.push('=== AFS Doc Builder — Preview ===');
  lines.push(`Organisation: ${ctx.org || '-'}`);
  lines.push(`Domaine: ${ctx.domain || '-'}`);
  lines.push(`Owner: ${model.kit.ownerId || '-'}`);
  lines.push(`Statut: ${model.kit.status || 'active'}`);
  lines.push('');
  lines.push('--- Sélection ---');
  lines.push(`Inclus: ${selectionSummary.on.length ? selectionSummary.on.join(', ') : '(rien)'}`);
  lines.push(`Exclus: ${selectionSummary.off.length ? selectionSummary.off.join(', ') : '(rien)'}`);
  lines.push('');
  lines.push('--- Stats ---');
  for (const [k,v] of Object.entries(model.stats || {})) lines.push(`${k}: ${v}`);
  lines.push('');

  if (activeTemplate) {
    lines.push('--- Rendu template ---');
    lines.push(`Template: ${activeTemplate.name}`);
    lines.push('');
    const tpl = activeTemplate.template || {};
    if (typeof tpl.text === 'string') {
      lines.push(renderTemplateText(tpl.text, model));
    } else if (Array.isArray(tpl.sections)) {
      lines.push(
        tpl.sections.map(s => {
          if (typeof s === 'string') return renderTemplateText(s, model);
          const title = s.title ? `## ${renderTemplateText(s.title, model)}\n` : '';
          const body  = s.text  ? renderTemplateText(s.text, model) : '';
          return `${title}${body}`.trim();
        }).join('\n\n')
      );
    } else {
      lines.push('(template sans champ text/sections)');
    }
  } else {
    lines.push('Tip: choisis un template pour un rendu métier.');
  }

  return lines.join('\n');
}

function buildEnrichedReport(model, activeTemplate, catalog){
  const ctx = model.context;
  const ds  = model.datasets;
  const now = new Date().toISOString();
  const selected = model.kit.datasets || {};

  const on = [];
  const off = [];
  for (const d of catalog) (selected[d.key] === true ? on : off).push(d.label);

  const lines = [];
  lines.push('=== Askida Platform Studio — Documentation Report (TXT) ===');
  lines.push(`Generated: ${now}`);
  lines.push('');
  lines.push('--- Contexte ---');
  lines.push(`Organisation: ${ctx.org || '-'}`);
  lines.push(`Plateforme: ${ctx.platform || '-'}`);
  lines.push(`Domaine: ${ctx.domain || '-'}`);
  lines.push(`Owner: ${model.kit.ownerId || '-'}`);
  lines.push(`Statut: ${model.kit.status || 'active'}`);
  lines.push('');
  lines.push('--- Sélection ---');
  lines.push(`Inclus: ${on.length ? on.join(', ') : '(rien)'}`);
  lines.push(`Exclus: ${off.length ? off.join(', ') : '(rien)'}`);
  lines.push('');
  lines.push('--- Stats ---');
  for (const [k,v] of Object.entries(model.stats || {})) lines.push(`${k}: ${v}`);
  lines.push('');
  lines.push('--- Datasets (aperçu) ---');

  for (const d of catalog){
    if (selected[d.key] !== true) continue;
    const list = normalizeList(ds[d.key]);

    lines.push('');
    lines.push(`## ${d.label}`);
    lines.push(`key: ${d.key}`);
    lines.push(`count: ${list.length}`);

    if (list.length) {
      const names = topNames(list, 10);
      if (names.length) {
        lines.push('top:');
        for (const n of names) lines.push(`- ${n}`);
      }
    }
  }

  if (activeTemplate){
    lines.push('');
    lines.push('--- Annex: Template Render ---');
    lines.push(`Template: ${activeTemplate.name} (${activeTemplate.id})`);
    lines.push('');
    lines.push(buildPreviewA(activeTemplate, model, {on, off}));
  }

  lines.push('');
  lines.push('=== End ===');
  return lines.join('\n');
}

// ===================== Main =====================
document.addEventListener('DOMContentLoaded', async () => {
  const provider = window.AFS_Providers?.iconik;
  if (!provider) { alert('Provider iconik introuvable'); return; }

  // DOM refs (panels + canvas)
  const btnOpenConfig = document.getElementById('btnOpenConfig');
  const btnBackToPreview = document.getElementById('btnBackToPreview');
  const viewPreview = document.getElementById('canvas-view-preview');
  const viewConfig = document.getElementById('canvas-view-config');
  const configHint = document.getElementById('config-hint');

  const elPlatform = document.getElementById('ctx-platform');
  const elOrg = document.getElementById('ctx-org');
  const elDomain = document.getElementById('ctx-domain');
  const elOwner = document.getElementById('ctx-owner');
  const elStatus = document.getElementById('ctx-status');
  const elKey = document.getElementById('ctx-key');

  const previewEl = document.getElementById('preview');
  const canvasSubtitle = document.getElementById('canvas-subtitle');

  // CONFIG refs (inside canvas)
  const ownerSel = document.getElementById('owner-select');
  const ownerHint = document.getElementById('owner-hint');

  const scopePlatform = document.getElementById('scope-platform');
  const scopeDomain = document.getElementById('scope-domain');

  const datasetsContainer = document.getElementById('datasets-list');
  const dsAddSelect = document.getElementById('dataset-add-select');
  const btnDatasetAdd = document.getElementById('btnDatasetAdd');

  const statusLabel = document.getElementById('project-status-label');
  const statusHint = document.getElementById('project-status-hint');
  const btnCloseProject = document.getElementById('btnCloseProject');
  const btnUnlockProject = document.getElementById('btnUnlockProject');

  const btnResetKit = document.getElementById('btnResetKit');

  const btnOwnerAdd = document.getElementById('btnOwnerAdd');
  const btnOwnerRename = document.getElementById('btnOwnerRename');
  const btnOwnerDelete = document.getElementById('btnOwnerDelete');
  const ownerNewLabel = document.getElementById('ownerNewLabel');
  const ownerRenameLabel = document.getElementById('ownerRenameLabel');

  // RIGHT panel (template + export)
  const tplSelect = document.getElementById('tplSelect');
  const tplFile = document.getElementById('tplFile');
  const btnImport = document.getElementById('btnImport');
  const btnDelete = document.getElementById('btnDelete');
  const tplHint = document.getElementById('tplHint');

  const btnExport = document.getElementById('btnExportTxt');
  const exportHint = document.getElementById('exportHint');

  // Model & catalog
  const baseModel = provider.getDocModel();
  const ctx = baseModel.context;
  const key = projectKey(ctx);

  // TOUT vient de la base à partir d'ici. Une seule attente, avant que l'écran
  // ne se construise : les lectures qui suivent restent synchrones.
  try { await Magasin.charger(key); }
  catch (e) {
    console.error('[doc] chargement', e);
    alert('Chargement impossible : ' + (e && e.message ? e.message : e));
    return;
  }

  // L'ORGANISATION PRIME : celle du contexte serveur écrase ce que le provider
  // a lu dans `aps:context`. Un seul point de vérité, et il est en base. Tout le
  // modèle en dépend — l'aperçu, le rapport et le nom de fichier lisent tous
  // `model.context.org`, il suffit donc de le poser ici.
  ctx.org = Magasin.org ? Magasin.org.name : '';

  const fullCatalog = provider.listDatasetCatalog();
  const catalog = filterNonSystemCatalog(fullCatalog); // systèmes masqués [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/doc.html)

  // UI context summary
  elPlatform.textContent = ctx.platform || '-';
  elOrg.textContent = ctx.org || '-';
  elDomain.textContent = ctx.domain || '-';
  elKey.textContent = key;

  // Kit init
  const defaultKit = {
    ownerId: 'transverse',
    datasets: {},
    templateId: '',
    status: 'active',
    locked: false,
    lockedAt: null,
    lockedReason: null
  };
  for (const d of catalog) if (d.defaultChecked) defaultKit.datasets[d.key] = true;

  let kit = loadKit() || defaultKit;
  function saveCurrentKit(){ saveKit(key, kit); }

  // View mode
  function showPreview(){
    viewConfig.style.display = 'none';
    viewPreview.style.display = 'block';
  }
  function showConfig(){
    viewPreview.style.display = 'none';
    viewConfig.style.display = 'block';
  }
  btnOpenConfig.addEventListener('click', () => { showConfig(); });
  btnBackToPreview.addEventListener('click', () => { showPreview(); });

  // Status UI + lock apply
  function refreshProjectStatusUI(){
    const locked = isProjectLocked(kit);
    elStatus.textContent = locked ? 'Clôturé' : 'Actif';
    elOwner.textContent = kit.ownerId || '-';

    if (!statusLabel) return;

    if (locked) {
      statusLabel.textContent = 'Clôturé';
      statusLabel.style.color = '#d6d233';
      statusHint.textContent = kit.lockedReason || 'Projet clôturé : consultation autorisée, modifications verrouillées.';
      btnCloseProject.style.display = 'none';
      btnUnlockProject.style.display = 'inline-block';
      configHint.textContent = 'Projet clôturé (lecture seule). Déverrouiller pour modifier.';
    } else {
      statusLabel.textContent = 'Actif';
      statusLabel.style.color = '';
      statusHint.textContent = 'Projet actif : modifications autorisées.';
      btnCloseProject.style.display = 'inline-block';
      btnUnlockProject.style.display = 'none';
      configHint.textContent = '';
    }
  }

  function applyProjectLockToUI(){
    const locked = isProjectLocked(kit);

    const toDisable = [
      ownerSel, scopePlatform, scopeDomain,
      dsAddSelect, btnDatasetAdd,
      btnResetKit,
      btnOwnerAdd, btnOwnerRename, btnOwnerDelete,
      ownerNewLabel, ownerRenameLabel
    ].filter(Boolean);

    toDisable.forEach(el => el.disabled = locked);

    datasetsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = locked);
    datasetsContainer.querySelectorAll('button.ghost').forEach(b => b.disabled = locked);
  }

  btnCloseProject.addEventListener('click', () => {
    const ok = confirm('Clôturer ce projet ?\n\nConsultation OK, modifications verrouillées.');
    if (!ok) return;
    lockProject(kit);
    saveCurrentKit();
    refreshProjectStatusUI();
    applyProjectLockToUI();
    refreshCanvas();
  });

  btnUnlockProject.addEventListener('click', () => {
    const ok = confirm('Déverrouiller ce projet ?\n\nModifications autorisées.');
    if (!ok) return;
    unlockProject(kit);
    saveCurrentKit();
    refreshProjectStatusUI();
    applyProjectLockToUI();
    refreshCanvas();
  });

  // Scope UI init (PROD/QA/DEV/POC + tokens)
  scopePlatform.innerHTML = `<option value="iconik">iconik</option>`;
  scopePlatform.value = (ctx.platform || 'iconik').toLowerCase();

  const baseDomains = ['PROD','QA','DEV','POC'];
  const discovered = discoverDomainsFromAppTokens();
  const domains = [...new Set([...baseDomains, ...discovered])];
  scopeDomain.innerHTML = domains.map(d => `<option value="${d.toLowerCase()}">${d}</option>`).join('');
  const curDom = (ctx.domain || 'prod').toLowerCase();
  if ([...scopeDomain.options].some(o => o.value === curDom)) scopeDomain.value = curDom;

  function scopeChanged(){
    if (isProjectLocked(kit)) return; // ne change pas de scope si projet clôturé (consultation)
    const p = (scopePlatform.value || 'iconik').trim();
    const d = (scopeDomain.value || 'prod').trim();
    // Plus de garde « Organisation manquante » : elle ne se choisit plus ici,
    // et un rôle non filtré a le droit de n'en avoir aucune.
    setApsContextAndReload(p, d);
  }
  scopePlatform.addEventListener('change', scopeChanged);
  scopeDomain.addEventListener('change', scopeChanged);

  // Owners UI
  function refreshOwnersUI(){
    const list = Object.values(loadOwners());
    ownerSel.innerHTML = list.map(o => `<option value="${o.id}">${o.label}</option>`).join('');
    ownerSel.value = kit.ownerId || 'transverse';

    const o = list.find(x => x.id === ownerSel.value);
    ownerHint.textContent = (o && o.mode === 'super')
      ? 'Transverse: accès à tous les templates/kits (modifiable).'
      : (o ? `Owner: ${o.label}` : '');
  }

  ownerSel.addEventListener('change', () => {
    if (isProjectLocked(kit)) return;
    kit.ownerId = ownerSel.value;
    saveCurrentKit();
    refreshOwnersUI();
    refreshTemplatesUI();
    refreshProjectStatusUI();
    refreshCanvas();
  });

  // Owners CRUD (CONFIG only)
  btnOwnerAdd.addEventListener('click', async () => {
    if (isProjectLocked(kit)) return;
    const label = (ownerNewLabel.value || '').trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'') || `owner_${Date.now()}`;
    const o = loadOwners();
    if (o[id]) { alert('Owner déjà existant'); return; }
    if (id === 'transverse') { alert('Nom réservé'); return; }
    try { await ownerAjouter(label); } catch (e) { echecEnregistrement(e); return; }
    ownerNewLabel.value = '';
    refreshOwnersUI();
  });

  btnOwnerRename.addEventListener('click', async () => {
    if (isProjectLocked(kit)) return;
    const newLabel = (ownerRenameLabel.value || '').trim();
    const id = ownerSel.value;
    if (!newLabel || !id) return;
    if (id === 'transverse') { alert('Transverse non renommable'); return; }
    const o = loadOwners();
    if (!o[id]) return;
    try { await ownerRenommer(id, newLabel); } catch (e) { echecEnregistrement(e); return; }
    ownerRenameLabel.value = '';
    refreshOwnersUI();
  });

  btnOwnerDelete.addEventListener('click', async () => {
    if (isProjectLocked(kit)) return;
    const id = ownerSel.value;
    if (!id) return;
    if (id === 'transverse') { alert('Transverse non supprimable'); return; }
    try { await ownerSupprimer(id); } catch (e) { echecEnregistrement(e); return; }
    if (kit.ownerId === id) { kit.ownerId = 'transverse'; saveCurrentKit(); }
    refreshOwnersUI();
    refreshTemplatesUI();
    refreshProjectStatusUI();
    refreshCanvas();
  });

  // Templates: visible by owner (Transverse sees all)
  function templatesVisibleForOwner(ownerId){
    const list = loadTemplates();
    if (ownerId === 'transverse') return list;
    return list.filter(t => Array.isArray(t?.template?.owners) && t.template.owners.includes(ownerId));
  }

  function refreshTemplatesUI(){
    const ownerId = kit.ownerId || 'transverse';
    const list = templatesVisibleForOwner(ownerId);

    if (!list.length) {
      tplSelect.innerHTML = '';
      tplHint.textContent = (ownerId === 'transverse')
        ? 'Aucun template importé.'
        : 'Aucun template pour cet owner (Transverse les montre tous).';
      kit.templateId = '';
      saveCurrentKit();
      return;
    }

    renderSelectOptions(tplSelect, list, kit.templateId || list[0].id);
    kit.templateId = tplSelect.value;
    tplHint.textContent = `Templates visibles: ${list.length}`;
    saveCurrentKit();
  }

  function getActiveTemplateObj(){
    const ownerId = kit.ownerId || 'transverse';
    const list = templatesVisibleForOwner(ownerId);
    const id = tplSelect.value;
    return list.find(t => t.id === id) || null;
  }

  tplSelect.addEventListener('change', () => {
    if (isProjectLocked(kit)) return; // template change = impact preview (mais on le bloque si locked)
    kit.templateId = tplSelect.value;
    saveCurrentKit();
    refreshCanvas();
  });

  btnImport.addEventListener('click', async () => {
    if (isProjectLocked(kit)) return;
    const f = tplFile.files?.[0];
    if (!f) { alert('Choisis un fichier .json'); return; }
    const tplFileName = document.getElementById('tplFileName');
    if (tplFile && tplFileName) {
    tplFile.addEventListener('change', () => {
    const f = tplFile.files && tplFile.files[0];
    tplFileName.textContent = f ? f.name : 'Aucun fichier';
    });
    }
    const text = await f.text();
    const tpl = safeParse(text);
    if (!tpl) { alert('JSON invalide'); return; }
    // L'identifiant vient MAINTENANT de la base : un `tpl-<timestamp>` fabriqué
    // dans le navigateur ne veut rien dire une fois la ressource partagée.
    try { await templateImporter(tpl.name || f.name, tpl); }
    catch (e) { echecEnregistrement(e); return; }
    refreshTemplatesUI();
    refreshCanvas();
  });

  btnDelete.addEventListener('click', async () => {
    if (isProjectLocked(kit)) return;
    const id = tplSelect.value;
    if (!id) return;
    try { await templateSupprimer(id); } catch (e) { echecEnregistrement(e); return; }
    kit.templateId = '';
    saveCurrentKit();
    refreshTemplatesUI();
    refreshCanvas();
  });

  // Datasets dynamic (CONFIG)
  function refreshDatasetAddSelect(){
    const locked = isProjectLocked(kit);
    const selectedKeys = new Set(Object.keys(kit.datasets || {}));
    const available = catalog.filter(d => !selectedKeys.has(d.key));
    dsAddSelect.innerHTML = available.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
    btnDatasetAdd.disabled = locked || available.length === 0;
  }

  function toggleDataset(key, checked){
    if (isProjectLocked(kit)) return;
    kit.datasets = kit.datasets || {};
    kit.datasets[key] = checked === true;
    saveCurrentKit();
    refreshCanvas();
  }

  function removeDataset(key){
    if (isProjectLocked(kit)) return;
    kit.datasets = kit.datasets || {};
    delete kit.datasets[key];
    saveCurrentKit();
    refreshDatasetsUI();
    refreshCanvas();
  }

  function refreshDatasetsUI(){
    const locked = isProjectLocked(kit);
    renderDatasetsList(datasetsContainer, catalog, kit, locked, toggleDataset, removeDataset);
    refreshDatasetAddSelect();
  }

  btnDatasetAdd.addEventListener('click', () => {
    if (isProjectLocked(kit)) return;
    const k = dsAddSelect.value;
    if (!k) return;
    kit.datasets = kit.datasets || {};
    kit.datasets[k] = true;
    saveCurrentKit();
    refreshDatasetsUI();
    refreshCanvas();
  });

  // Reset kit (CONFIG)
  btnResetKit.addEventListener('click', () => {
    if (isProjectLocked(kit)) return;
    resetKit();
    kit = {
      ownerId: 'transverse',
      datasets: {},
      templateId: '',
      status: 'active',
      locked: false,
      lockedAt: null,
      lockedReason: null
    };
    for (const d of catalog) if (d.defaultChecked) kit.datasets[d.key] = true;
    saveCurrentKit();
    refreshOwnersUI();
    refreshTemplatesUI();
    refreshDatasetsUI();
    refreshProjectStatusUI();
    applyProjectLockToUI();
    refreshCanvas();
  });

  // Canvas refresh & export
  function computeModel(){
    const m = provider.getDocModel();
    // Le provider relit `aps:context` à CHAQUE appel : sans cette ligne, le
    // modèle repart avec l'organisation du localStorage, et l'aperçu affichait
    // « Organisation: - » pendant que le header et le panneau montraient la
    // bonne. Poser la valeur une fois au démarrage ne suffit donc pas.
    m.context.org = Magasin.org ? Magasin.org.name : '';
    m.kit = kit;
    return m;
  }

  function refreshCanvas(){
    const model = computeModel();
    const activeTpl = kit.templateId ? getActiveTemplateObj() : null;

    const selected = kit.datasets || {};
    const on = [];
    const off = [];
    for (const d of catalog) (selected[d.key] === true ? on : off).push(d.label);

    canvasSubtitle.textContent = `${ctx.org || '-'} / ${ctx.domain || '-'} / owner=${kit.ownerId || '-'}`;
    previewEl.textContent = buildPreviewA(activeTpl, model, {on, off});
    exportHint.textContent = activeTpl
      ? `Rapport + annexe template: ${activeTpl.name}`
      : 'Rapport enrichi (sans annexe template).';
  }

  btnExport.addEventListener('click', () => {
    const model = computeModel();
    const activeTpl = kit.templateId ? getActiveTemplateObj() : null;
    exportTxt(buildEnrichedReport(model, activeTpl, catalog), filenameFor(model, 'REPORT'));
  });

  // Final init
  refreshOwnersUI();
  refreshTemplatesUI();
  refreshDatasetsUI();
  refreshProjectStatusUI();
  applyProjectLockToUI();
  refreshCanvas();
  showPreview();
});