// builders/doc/doc.js — Dataset catalog + auto-discovery + kit par projet (Owner + datasets + template) + Export TXT

const OWNERS_KEY = 'afs:doc:owners';
const KITS_KEY   = 'afs:doc:kits';
const TPL_KEY    = 'afs:doc:templates';

function safeParse(text){ try { return JSON.parse(text); } catch { return null; } }
function readJSON(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function projectKey(ctx){
  const p = (ctx.platform || 'iconik').trim();
  const o = (ctx.org || '').trim();
  const d = (ctx.domain || '').trim();
  return `${p}|${o}|${d}`;
}

// ---- Owners defaults
function defaultOwners(){
  return {
    formation:        { id:'formation',        label:'Formation',        mode:'normal' },
    broadcast:        { id:'broadcast',        label:'Broadcast',        mode:'normal' },
    creative:         { id:'creative',         label:'Creative',         mode:'normal' },
    managed_services: { id:'managed_services', label:'Managed Services', mode:'normal' },
    synergies:        { id:'synergies',        label:'Synergies',        mode:'normal' },
    transverse:       { id:'transverse',       label:'Transverse',       mode:'super'  }
  };
}

function loadOwners(){
  const o = readJSON(OWNERS_KEY, null);
  if (!o || typeof o !== 'object') {
    const def = defaultOwners();
    writeJSON(OWNERS_KEY, def);
    return def;
  }
  if (!o.transverse) {
    o.transverse = { id:'transverse', label:'Transverse', mode:'super' };
    writeJSON(OWNERS_KEY, o);
  }
  return o;
}

// ---- Kits per project
function loadKits(){
  const k = readJSON(KITS_KEY, {});
  return (k && typeof k === 'object') ? k : {};
}
function saveKit(projectKey, kit){
  const kits = loadKits();
  kits[projectKey] = kit;
  writeJSON(KITS_KEY, kits);
}
function loadKit(projectKey){
  const kits = loadKits();
  return kits[projectKey] || null;
}
function resetKit(projectKey){
  const kits = loadKits();
  delete kits[projectKey];
  writeJSON(KITS_KEY, kits);
}

// ---- Templates
function loadTemplates(){ return readJSON(TPL_KEY, []); }
function saveTemplates(list){ writeJSON(TPL_KEY, list); }

function renderSelectOptions(selectEl, items, activeId){
  selectEl.innerHTML = items.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  if (activeId) selectEl.value = activeId;
}

// ---- Placeholder render
function getPath(obj, path){
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) { if (cur == null) return ''; cur = cur[p]; }
  return (cur == null) ? '' : cur;
}
function renderTemplateText(text, model){
  return String(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const v = getPath(model, expr.trim());
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

// ---- Enriched report helpers
function normalizeList(ds){
  if (!ds) return [];
  if (Array.isArray(ds)) return ds;
  if (typeof ds === 'object') {
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

// ---- UI Rendering datasets dynamically ----
function renderDatasetsList(container, catalog, kit, onToggle, onRemove){
  container.innerHTML = '';

  // Render only datasets present in kit.datasets (selected set) OR in Transverse we still show selected set (user can add more)
  const selectedKeys = Object.keys(kit.datasets || {});

  // Keep stable ordering according to catalog
  const defs = catalog.filter(d => selectedKeys.includes(d.key));

  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'wfd-row';
    row.style.marginTop = '6px';

    const label = document.createElement('label');
    label.className = 'wfd-check';
    label.style.flex = '1';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = kit.datasets[d.key] === true;
    cb.dataset.ds = d.key;
    cb.addEventListener('change', () => onToggle(d.key, cb.checked));

    const text = document.createElement('span');
    text.textContent = d.label;

    label.appendChild(cb);
    label.appendChild(text);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ghost';
    rm.textContent = 'Retirer';
    rm.addEventListener('click', () => onRemove(d.key));

    row.appendChild(label);
    row.appendChild(rm);

    container.appendChild(row);
  }
}

function buildPreviewA(activeTemplate, model, selectionSummary){
  const ctx = model.context;
  const lines = [];
  lines.push('=== AFS Doc Builder — Preview ===');
  lines.push(`Organisation: ${ctx.org || '-'}`);
  lines.push(`Domaine: ${ctx.domain || '-'}`);
  lines.push(`Owner: ${model.kit.ownerId || '-'}`);
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

  // selection summary derived from catalog
  const on = [];
  const off = [];
  for (const d of catalog) {
    (selected[d.key] === true ? on : off).push(d.label);
  }

  const lines = [];
  lines.push('=== Askida Platform Studio — Documentation Report (TXT) ===');
  lines.push(`Generated: ${now}`);
  lines.push('');
  lines.push('--- Contexte ---');
  lines.push(`Organisation: ${ctx.org || '-'}`);
  lines.push(`Plateforme: ${ctx.platform || '-'}`);
  lines.push(`Domaine: ${ctx.domain || '-'}`);
  lines.push(`Owner: ${model.kit.ownerId || '-'}`);
  lines.push('');

  lines.push('--- Sélection ---');
  lines.push(`Inclus: ${on.length ? on.join(', ') : '(rien)'}`);
  lines.push(`Exclus: ${off.length ? off.join(', ') : '(rien)'}`);
  lines.push('');

  lines.push('--- Stats ---');
  for (const [k,v] of Object.entries(model.stats || {})) lines.push(`${k}: ${v}`);
  lines.push('');

  lines.push('--- Datasets (aperçu) ---');

  // iterate catalog order, include only selected
  for (const d of catalog) {
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

  if (activeTemplate) {
    lines.push('');
    lines.push('--- Annex: Template Render ---');
    lines.push(`Template: ${activeTemplate.name} (${activeTemplate.id})`);
    lines.push('');
    // reuse preview to keep consistent
    lines.push(buildPreviewA(activeTemplate, model, {on, off}));
  }

  lines.push('');
  lines.push('=== End ===');
  return lines.join('\n');
}

// ---- Main
document.addEventListener('DOMContentLoaded', () => {
  const provider = window.AFS_Providers?.iconik;
  if (!provider) { alert('Provider iconik introuvable'); return; }

  const baseModel = provider.getDocModel();
  const ctx = baseModel.context;
  const key = projectKey(ctx);

  const catalog = provider.listDatasetCatalog(); // built-in + auto-discovery

  // UI refs
  const elPlatform = document.getElementById('ctx-platform');
  const elOrg = document.getElementById('ctx-org');
  const elDomain = document.getElementById('ctx-domain');
  const elKey = document.getElementById('ctx-key');
  const badge = document.getElementById('orgBadge');

  const ownerSel = document.getElementById('owner-select');
  const ownerHint = document.getElementById('owner-hint');

  const datasetsContainer = document.getElementById('datasets-list');
  const dsAddSelect = document.getElementById('dataset-add-select');
  const btnDatasetAdd = document.getElementById('btnDatasetAdd');

  const tplSelect = document.getElementById('tplSelect');
  const tplFile = document.getElementById('tplFile');
  const btnImport = document.getElementById('btnImport');
  const btnDelete = document.getElementById('btnDelete');
  const tplHint = document.getElementById('tplHint');

  const btnExport = document.getElementById('btnExportTxt');
  const exportHint = document.getElementById('exportHint');
  const btnResetKit = document.getElementById('btnResetKit');

  const previewEl = document.getElementById('preview');
  const canvasSubtitle = document.getElementById('canvas-subtitle');

  const btnOwnerAdd = document.getElementById('btnOwnerAdd');
  const btnOwnerRename = document.getElementById('btnOwnerRename');
  const btnOwnerDelete = document.getElementById('btnOwnerDelete');
  const ownerNewLabel = document.getElementById('ownerNewLabel');
  const ownerRenameLabel = document.getElementById('ownerRenameLabel');

  // render context
  elPlatform.textContent = ctx.platform || '-';
  elOrg.textContent = ctx.org || '-';
  elDomain.textContent = ctx.domain || '-';
  elKey.textContent = key;
  badge.textContent = ctx.org ? `ORG: ${ctx.org} (${ctx.domain || '-'})` : '';

  // init kit
  const defaultKit = {
    ownerId: 'transverse',
    datasets: {},
    templateId: ''
  };

  // default selected = catalog defaultChecked
  for (const d of catalog) if (d.defaultChecked) defaultKit.datasets[d.key] = true;

  let kit = loadKit(key) || defaultKit;

  function saveCurrentKit(){ saveKit(key, kit); }

  // Owners select
  function ownersList(){ return Object.values(loadOwners()); }

  function refreshOwnersUI(){
    const list = ownersList();
    ownerSel.innerHTML = list.map(o => `<option value="${o.id}">${o.label}</option>`).join('');
    ownerSel.value = kit.ownerId || 'transverse';

    const o = list.find(x => x.id === ownerSel.value);
    ownerHint.textContent = (o && o.mode === 'super')
      ? 'Transverse: accès à tous les datasets/templates (modifiable).'
      : (o ? `Owner: ${o.label}` : '');
  }

  // Templates visible for owner (Transverse = all)
  function templatesVisibleForOwner(ownerId){
    const list = loadTemplates();
    if (ownerId === 'transverse') return list;
    return list.filter(t => {
      const owners = t?.template?.owners;
      if (!owners) return false;
      return Array.isArray(owners) && owners.includes(ownerId);
    });
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

  // Datasets UI (dynamic)
  function refreshDatasetAddSelect(){
    // show datasets not present in kit.datasets
    const selectedKeys = new Set(Object.keys(kit.datasets || {}));
    const available = catalog.filter(d => !selectedKeys.has(d.key));

    dsAddSelect.innerHTML = available.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
    btnDatasetAdd.disabled = available.length === 0;
  }

  function toggleDataset(key, checked){
    kit.datasets = kit.datasets || {};
    kit.datasets[key] = checked === true;
    saveCurrentKit();
    refreshCanvas();
  }

  function removeDataset(key){
    kit.datasets = kit.datasets || {};
    delete kit.datasets[key];
    saveCurrentKit();
    refreshDatasetsUI();
    refreshCanvas();
  }

  function refreshDatasetsUI(){
    // ensure every selected key exists in kit.datasets; if unknown, keep
    kit.datasets = kit.datasets || {};

    // render
    renderDatasetsList(datasetsContainer, catalog, kit, toggleDataset, removeDataset);
    refreshDatasetAddSelect();
  }

  // Active template
  function getActiveTemplateObj(){
    const ownerId = kit.ownerId || 'transverse';
    const list = templatesVisibleForOwner(ownerId);
    const id = tplSelect.value;
    return list.find(t => t.id === id) || null;
  }

  function computeModel(){
    const m = provider.getDocModel();
    m.kit = kit;

    // extend stats minimal (optional)
    m.stats.roles = normalizeList(m.datasets.rolesData).length;
    m.stats.roleGroups = normalizeList(m.datasets.roleGroupsData).length;

    return m;
  }

  function refreshCanvas(){
    const model = computeModel();
    const activeTpl = (kit.templateId ? getActiveTemplateObj() : null);

    canvasSubtitle.textContent = `${ctx.org || '-'} / ${ctx.domain || '-'} / owner=${kit.ownerId || '-'}`;

    const selected = kit.datasets || {};
    const on = [];
    const off = [];
    for (const d of catalog) (selected[d.key] === true ? on : off).push(d.label);

    previewEl.textContent = buildPreviewA(activeTpl, model, {on, off});
    exportHint.textContent = activeTpl ? `Rapport + annexe template: ${activeTpl.name}` : 'Rapport enrichi (sans annexe template).';
  }

  // Events
  ownerSel.addEventListener('change', () => {
    kit.ownerId = ownerSel.value;
    saveCurrentKit();
    refreshOwnersUI();
    refreshTemplatesUI();
    refreshCanvas();
  });

  btnDatasetAdd.addEventListener('click', () => {
    const k = dsAddSelect.value;
    if (!k) return;
    kit.datasets = kit.datasets || {};
    // ajoute + coche par défaut
    kit.datasets[k] = true;
    saveCurrentKit();
    refreshDatasetsUI();
    refreshCanvas();
  });

  tplSelect.addEventListener('change', () => {
    kit.templateId = tplSelect.value;
    saveCurrentKit();
    refreshCanvas();
  });

  btnImport.addEventListener('click', async () => {
    const f = tplFile.files?.[0];
    if (!f) { alert('Choisis un fichier .json'); return; }
    const text = await f.text();
    const tpl = safeParse(text);
    if (!tpl) { alert('JSON invalide'); return; }

    const list = loadTemplates();
    const id = tpl.id || `tpl-${Date.now()}`;
    const name = tpl.name || f.name;
    list.unshift({ id, name, createdAt: new Date().toISOString(), template: tpl });
    saveTemplates(list);

    refreshTemplatesUI();
    refreshCanvas();
  });

  btnDelete.addEventListener('click', () => {
    const listAll = loadTemplates();
    const id = tplSelect.value;
    if (!id) return;

    const next = listAll.filter(t => t.id !== id);
    saveTemplates(next);

    kit.templateId = '';
    saveCurrentKit();

    refreshTemplatesUI();
    refreshCanvas();
  });

  btnExport.addEventListener('click', () => {
    const model = computeModel();
    const activeTpl = kit.templateId ? getActiveTemplateObj() : null;
    const report = buildEnrichedReport(model, activeTpl, catalog);
    exportTxt(report, filenameFor(model, 'REPORT'));
  });

  btnResetKit.addEventListener('click', () => {
    resetKit(key);
    kit = JSON.parse(JSON.stringify(defaultKit)); // deep-ish clone
    saveCurrentKit();
    refreshOwnersUI();
    refreshTemplatesUI();
    refreshDatasetsUI();
    refreshCanvas();
  });

  // Owners CRUD (simple)
  btnOwnerAdd.addEventListener('click', () => {
    const label = (ownerNewLabel.value || '').trim();
    if (!label) return;

    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'') || `owner_${Date.now()}`;

    const o = loadOwners();
    if (o[id]) { alert('Owner déjà existant'); return; }
    if (id === 'transverse') { alert('Nom réservé'); return; }

    o[id] = { id, label, mode:'normal' };
    writeJSON(OWNERS_KEY, o);

    ownerNewLabel.value = '';
    refreshOwnersUI();
    refreshCanvas();
  });

  btnOwnerRename.addEventListener('click', () => {
    const newLabel = (ownerRenameLabel.value || '').trim();
    const id = ownerSel.value;
    if (!newLabel || !id) return;
    if (id === 'transverse') { alert('Transverse non renommable'); return; }

    const o = loadOwners();
    if (!o[id]) return;
    o[id].label = newLabel;
    writeJSON(OWNERS_KEY, o);

    ownerRenameLabel.value = '';
    refreshOwnersUI();
    refreshCanvas();
  });

  btnOwnerDelete.addEventListener('click', () => {
    const id = ownerSel.value;
    if (!id) return;
    if (id === 'transverse') { alert('Transverse non supprimable'); return; }

    const o = loadOwners();
    delete o[id];
    writeJSON(OWNERS_KEY, o);

    if (kit.ownerId === id) {
      kit.ownerId = 'transverse';
      saveCurrentKit();
    }

    refreshOwnersUI();
    refreshTemplatesUI();
    refreshCanvas();
  });

  // Init
  refreshOwnersUI();
  refreshTemplatesUI();
  refreshDatasetsUI();
  refreshCanvas();
});