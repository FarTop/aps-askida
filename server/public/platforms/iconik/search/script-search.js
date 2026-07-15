// APS Search — script-search.js — extrait de search.html le 07/07/2026

const _BASE = '/api/iconik';
let _env = '';
let _allFields = [];
let _lastResults = [];
let _blocks = [];
let _nextBlockId = 1;

const SYSTEM_FIELDS = [
  { name:'title',          label:'Titre',          type:'text' },
  { name:'date_created',   label:'Date creation',  type:'date' },
  { name:'date_modified',  label:'Date modif.',    type:'date' },
  { name:'status',         label:'Statut',         type:'text' },
  { name:'archive_status', label:'Statut archive', type:'text' },
  { name:'external_id',    label:'ID externe',     type:'text' },
];

const OBJECT_TYPES = [
  { value:'assets',           label:'Asset'                 },
  { value:'collections',      label:'Collection'            },
  { value:'segments',         label:'Segment'               },
  { value:'saved_searches',   label:'Recherche sauvegardee' },
  { value:'formats',          label:'Format'                },
  { value:'storages',         label:'Storage'               },
  { value:'metadata_views',   label:'Metadata View'         },
  { value:'users',            label:'User / Team'           },
  { value:'export_locations', label:'Export Location'       },
];

const OPS_BY_TYPE = {
  string   : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'equals',l:'est egal a'},{v:'not_equals',l:'est different de'},{v:'contains',l:'contient'},{v:'not_contains',l:'ne contient pas'},{v:'starts_with',l:'commence par'}],
  text     : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'equals',l:'est egal a'},{v:'not_equals',l:'est different de'},{v:'contains',l:'contient'},{v:'not_contains',l:'ne contient pas'},{v:'starts_with',l:'commence par'}],
  date     : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'before',l:'avant'},{v:'after',l:'apres'},{v:'between',l:'entre deux dates'}],
  integer  : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'equals',l:'est egal a'},{v:'not_equals',l:'est different de'},{v:'gt',l:'superieur a'},{v:'lt',l:'inferieur a'}],
  float    : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'equals',l:'est egal a'},{v:'not_equals',l:'est different de'},{v:'gt',l:'superieur a'},{v:'lt',l:'inferieur a'}],
  boolean  : [{v:'is_true',l:'est vrai',noVal:true},{v:'is_false',l:'est faux',noVal:true},{v:'is_empty',l:'est vide',noVal:true}],
  list     : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'contains_any',l:'contient au moins un'},{v:'contains',l:'contient'},{v:'not_contains',l:'ne contient pas'}],
  tag_cloud: [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'contains_any',l:'contient au moins un'},{v:'contains',l:'contient'},{v:'not_contains',l:'ne contient pas'}],
  dropdown : [{v:'is_not_empty',l:"n'est pas vide",noVal:true},{v:'is_empty',l:'est vide',noVal:true},{v:'equals',l:'est egal a'},{v:'not_equals',l:'est different de'}],
  collection:[{v:'in_branch',l:'est dans la branche'},{v:'in_collection',l:'est dans (direct)'}],
};
const ALL_OPS_DEFAULT = OPS_BY_TYPE.string;

function getOpsForField(fieldName) {
  if (fieldName === '__collection__') return OPS_BY_TYPE.collection;
  const fd = _allFields.find(f => f.name === fieldName);
  return OPS_BY_TYPE[fd ? fd.type : 'string'] || ALL_OPS_DEFAULT;
}

function buildValInput(crit, blockId, ci) {
  const fd = _allFields.find(f => f.name === crit.field);
  const isDate = (fd && fd.type === 'date') || ['date_created','date_modified'].includes(crit.field||'');
  const noVal = (getOpsForField(crit.field).find(o => o.v === crit.op)||{}).noVal;
  if (noVal) return '<input class="aps-input aps-crit-val aps-hidden">';
  if (isDate && crit.op === 'between') {
    const parts = (crit.value||'|').split('|');
    return '<input type="date" class="aps-input aps-crit-val-from aps-date-input" data-bid="'+blockId+'" data-ci="'+ci+'" value="'+(parts[0]||'')+'" onchange="onBetweenChange('+blockId+','+ci+')">'
      + '<span class="aps-date-arrow">&#8594;</span>'
      + '<input type="date" class="aps-input aps-crit-val-to aps-date-input" data-bid="'+blockId+'" data-ci="'+ci+'" value="'+(parts[1]||'')+'" onchange="onBetweenChange('+blockId+','+ci+')">'
      + '<input type="hidden" class="aps-crit-val" value="'+(crit.value||'')+'">';
  } else if (isDate) {
    return '<input type="date" class="aps-input aps-crit-val aps-date-input" value="'+(crit.value||'')+'">';
  } else if (crit.field === '__collection__') {
    return ''; // Browse géré séparément
  }
  return '<input class="aps-input aps-crit-val aps-flex1-fs11" value="'+(crit.value||'').replace(/"/g,'&quot;')+'" placeholder="valeur">';
}

function onColSubChange(el) {
  const blockId = parseInt(el.dataset.bid);
  const ci      = parseInt(el.dataset.ci);
  const op      = el.checked ? 'in_branch' : 'in_collection';
  onOpChange(blockId, ci, op);
}

function onBetweenChange(blockId, ci) {
  const block = _blocks.find(b => b.id === blockId);
  if (!block || !block.criteria[ci]) return;
  const container = document.getElementById('blocks-container');
  const blockEl = container.querySelector('[data-block-id="'+blockId+'"]');
  if (!blockEl) return;
  const rows = blockEl.querySelectorAll('.aps-crit-row');
  if (!rows[ci]) return;
  const from = rows[ci].querySelector('.aps-crit-val-from')?.value || '';
  const to   = rows[ci].querySelector('.aps-crit-val-to')?.value   || '';
  const hidden = rows[ci].querySelector('.aps-crit-val');
  if (hidden) hidden.value = from + '|' + to;
}

// ── Searches sauvegardées ─────────────────────────────────────
let _savedSearches = [];
let _currentSearchId = null;

async function chargerListeSearches() {
  try {
    const r = await fetch('/api/aps-search');
    _savedSearches = await r.json();
    const sel = document.getElementById('sr-saved-list');
    sel.innerHTML = '<option value="">— Searches sauvegardées —</option>' +
      _savedSearches.map(s =>
        '<option value="' + s.id + '">' + s.name + '</option>'
      ).join('');
    if (_currentSearchId) sel.value = _currentSearchId;
  } catch(e) { console.warn('Erreur chargement searches:', e); }
}

async function chargerSearch(id) {
  if (!id) {
    _currentSearchId = null;
    document.getElementById('btn-del-search').classList.add('aps-hidden');
    document.getElementById('sr-save-name').value = '';
    return;
  }
  try {
    const r = await fetch('/api/aps-search/' + id);
    const s = await r.json();
    _currentSearchId = s.id;
    document.getElementById('sr-save-name').value = s.name;
    document.getElementById('btn-del-search').classList.remove('aps-hidden');
    // Restaurer la config
    const cfg = s.config;
    _blocks = cfg.blocks || [];
    _nextBlockId = (_blocks.length ? Math.max(..._blocks.map(b => b.id)) : 0) + 1;
    rerendreBlocs();
    if (cfg.expression) document.getElementById('sr-expression').value = cfg.expression;
    if (cfg.limit) document.getElementById('sr-limit').value = cfg.limit;
    setTimeout(() => {
      if (cfg.returnBlock) document.getElementById('sr-return-block').value = cfg.returnBlock;
    }, 100);
  } catch(e) { console.warn('Erreur chargement search:', e); }
}

async function sauvegarderSearch() {
  lireBlocs();
  const name = document.getElementById('sr-save-name').value.trim();
  if (!name) { alert('Donnez un nom à cette recherche.'); return; }
  const config = {
    blocks      : _blocks,
    expression  : document.getElementById('sr-expression').value.trim(),
    returnBlock : parseInt(document.getElementById('sr-return-block').value) || 1,
    limit       : parseInt(document.getElementById('sr-limit').value) || 500,
  };
  try {
    let r;
    if (_currentSearchId) {
      r = await fetch('/api/aps-search/' + _currentSearchId, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, config }),
      });
    } else {
      r = await fetch('/api/aps-search', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, config }),
      });
    }
    const s = await r.json();
    _currentSearchId = s.id;
    await chargerListeSearches();
    document.getElementById('sr-saved-list').value = s.id;
    document.getElementById('btn-del-search').classList.remove('aps-hidden');
    console.log('Search sauvegardée :', s.name);
  } catch(e) { console.warn('Erreur sauvegarde:', e); }
}

async function supprimerSearch() {
  if (!_currentSearchId) return;
  if (!confirm('Supprimer cette recherche sauvegardée ?')) return;
  try {
    await fetch('/api/aps-search/' + _currentSearchId, { method:'DELETE' });
    _currentSearchId = null;
    document.getElementById('sr-save-name').value = '';
    document.getElementById('btn-del-search').classList.add('aps-hidden');
    await chargerListeSearches();
  } catch(e) { console.warn('Erreur suppression:', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  apsNav.init({ activePage: 'recherche', extras: 'env-select', pageTitle: 'Recherche APS' });
  chargerEnvs();
  chargerListeSearches();
});

// ── Dictionnaire collections id->{ name, parent_id } ──────────
let _colDict = {};

async function chargerCollections() {
  if (!_env) return;
  _colDict = {};
  const base = _BASE + '/' + _env;
  const payload = {
    doc_types: ['collections'],
    filter: { operator: 'AND', terms: [{ name: 'date_deleted', missing: true }] }
  };
  let page = 1;
  while (page < 50) {
    try {
      const r = await fetch(base + '/API/search/v1/search/?per_page=150&page=' + page, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload),
      });
      if (!r.ok) break;
      const d = await r.json();
      const objs = d.objects || [];
      if (!objs.length) break;
      objs.forEach(c => {
        _colDict[c.id] = { name: c.title || c.name || c.id, parent_id: c.parent_id || null };
      });
      if (page >= (d.pages || 1)) break;
      page++;
    } catch(e) { break; }
  }
  console.log('[APS Search] Collections chargees :', Object.keys(_colDict).length);
}

function buildPath(colIds) {
  if (!colIds || !colIds.length) return '';
  // Prendre la collection directe (in_collections[0])
  const colId = colIds[0];
  if (!_colDict[colId]) return colId.slice(0,8) + '...';
  // Remonter la hiérarchie
  const parts = [];
  let current = colId;
  let safety = 0;
  while (current && _colDict[current] && safety < 10) {
    parts.unshift(_colDict[current].name);
    current = _colDict[current].parent_id;
    safety++;
  }
  return parts.join(' › ');
}


function chargerEnvs() {
  fetch('/api/environments/credentials')
    .then(r => r.ok ? r.json() : [])
    .then(envs => {
      const sel = document.getElementById('env-select');
      sel.innerHTML = envs.map(e => '<option value="' + e.name + '">' + e.name + '</option>').join('');
      const def = envs.find(e => e.isDefault) || envs[0];
      if (def) { sel.value = def.name; onEnvChange(); }
    }).catch(() => {});
}

function onEnvChange() {
  _env = document.getElementById('env-select').value;
  chargerChamps();
  chargerCollections();
}

function chargerChamps() {
  if (!_env) return;
  fetch(_BASE + '/' + _env + '/API/metadata/v1/fields/?per_page=500')
    .then(r => r.ok ? r.json() : { objects:[] })
    .then(d => {
      const md = (d.objects || []).map(f => ({
        name : f.name,
        label: f.label || f.name,
        type : f.field_type || 'text',
      })).sort((a,b) => a.label.localeCompare(b.label));
      _allFields = [{ name:'__collection__', label:'Collection (browse)', type:'collection' }, ...SYSTEM_FIELDS, ...md];
      if (_blocks.length === 0) ajouterBloc();
      else rerendreBlocs();
    }).catch(() => {
      _allFields = [...SYSTEM_FIELDS];
      if (_blocks.length === 0) ajouterBloc();
      else rerendreBlocs();
    });
}

function ajouterBloc() {
  lireBlocs(); // sauvegarder l'état courant avant d'ajouter
  const id = _nextBlockId++;
  _blocks.push({ id, objectType:'assets', parentBlock:null,
    criteria:[{ field:'title', op:'is_not_empty', value:'', join:'AND' }] });
  rerendreBlocs();
}

function supprimerBloc(id) {
  _blocks = _blocks.filter(b => b.id !== id);
  _blocks.forEach(b => { if (b.parentBlock === id) b.parentBlock = null; });
  rerendreBlocs();
}

function lireBlocs() {
  const container = document.getElementById('blocks-container');
  _blocks.forEach(block => {
    const el = container.querySelector('[data-block-id="' + block.id + '"]');
    if (!el) return;
    block.objectType  = el.querySelector('.sr-obj-type') ? el.querySelector('.sr-obj-type').value : 'assets';
    const ps = el.querySelector('.sr-parent');
    block.parentBlock = ps ? (parseInt(ps.value) || null) : null;
    block.criteria = [];
    el.querySelectorAll('.aps-crit-row').forEach((row, ci) => {
      const joinEl = row.querySelector('.aps-crit-join');
      const _field = row.querySelector('.aps-crit-field') ? row.querySelector('.aps-crit-field').value : '';
      const _isCol = _field === '__collection__';
      const _op = _isCol
        ? (row.querySelector('.aps-crit-col-sub')?.checked !== false ? 'in_branch' : 'in_collection')
        : (row.querySelector('.aps-crit-op') ? row.querySelector('.aps-crit-op').value : 'is_not_empty');
      // Pour between, consolider from|to
      let _val = '';
      if (!_isCol && row.querySelector('.aps-crit-val-from')) {
        const from = row.querySelector('.aps-crit-val-from')?.value || '';
        const to   = row.querySelector('.aps-crit-val-to')?.value   || '';
        _val = from + '|' + to;
      } else {
        _val = row.querySelector('.aps-crit-val') ? row.querySelector('.aps-crit-val').value : '';
      }
      block.criteria.push({
        field  : _field,
        op     : _op,
        value  : _val,
        colMode: _isCol ? (row.querySelector('.aps-col-mode-sel')?.value || 'tree') : undefined,
        join   : joinEl ? joinEl.textContent.trim() : 'AND',
      });
    });
  });
}

function ajouterCritere(blockId) {
  lireBlocs();
  const block = _blocks.find(b => b.id === blockId);
  if (!block) return;
  block.criteria.push({ field:'title', op:'is_not_empty', value:'', join:'AND' });
  rerendreBlocs();
}

function supprimerCritere(blockId, ci) {
  lireBlocs();
  const block = _blocks.find(b => b.id === blockId);
  if (!block) return;
  block.criteria.splice(ci, 1);
  rerendreBlocs();
}

function toggleJoin(blockId, ci) {
  lireBlocs();
  const block = _blocks.find(b => b.id === blockId);
  if (!block || !block.criteria[ci]) return;
  block.criteria[ci].join = block.criteria[ci].join === 'AND' ? 'OR' : 'AND';
  rerendreBlocs();
}

function onOpChange(blockId, ci, op) {
  lireBlocs();
  const block = _blocks.find(b => b.id === blockId);
  if (!block || !block.criteria[ci]) return;
  block.criteria[ci].op = op;
  rerendreBlocs();
}

function onFieldChange(blockId, ci, field) {
  lireBlocs();
  const block = _blocks.find(b => b.id === blockId);
  if (!block || !block.criteria[ci]) return;
  const oldField = block.criteria[ci].field;
  block.criteria[ci].field = field;
  // Réinitialiser l'opérateur si incompatible avec le nouveau type
  const ops = getOpsForField(field);
  if (!ops.find(o => o.v === block.criteria[ci].op)) {
    block.criteria[ci].op = ops[0]?.v || 'equals';
  }
  if (field === '__collection__') block.criteria[ci].value = '[]';
  rerendreBlocs();
}

function _parseColIds(value) {
  // Compat : ancienne valeur = ID simple (string), nouvelle = tableau JSON
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch(e) {}
  return [value]; // ancienne valeur simple, migrée en tableau à un élément
}

function buildColTagsHtml(selectedIds, blockId, ci) {
  if (!selectedIds.length) return '<span class="aps-col-empty-msg">— aucune collection sélectionnée —</span>';
  return selectedIds.map(id => {
    const col = _colDict[id];
    const name = col ? col.name : (id.slice(0,8)+'...');
    return '<span class="aps-col-tag">📁 ' + name.replace(/</g,'&lt;') +
      '<span class="aps-col-tag-del" onclick="event.stopPropagation();removeColTag(' + blockId + ',' + ci + ',\'' + id + '\')">×</span></span>';
  }).join('');
}

// État d'expansion de l'arbo, par critère (clé = blockId_ci) — sans ça,
// chaque nœud se dépliait toujours entièrement, impossible à replier sur
// un environnement avec beaucoup de collections.
var _colTreeExpanded = {};
function _colTreeKey(blockId, ci) { return blockId + '_' + ci; }

function toggleColTreeNode(blockId, ci, nodeId, ev) {
  if (ev) ev.stopPropagation(); // ne pas déclencher la sélection du critère
  const key = _colTreeKey(blockId, ci);
  if (!_colTreeExpanded[key]) _colTreeExpanded[key] = new Set();
  const set = _colTreeExpanded[key];
  if (set.has(nodeId)) set.delete(nodeId); else set.add(nodeId);
  lireBlocs();
  rerendreBlocs();
}

function buildColTreeHtml(selectedIds, blockId, ci) {
  if (!Object.keys(_colDict).length) return '<div class="aps-col-empty-msg">Collections non chargées</div>';
  const key = _colTreeKey(blockId, ci);
  if (!_colTreeExpanded[key]) _colTreeExpanded[key] = new Set();
  const expanded = _colTreeExpanded[key];

  // Déplier automatiquement le chemin vers ce qui est déjà sélectionné, pour
  // ne pas perdre de vue un choix existant en rouvrant le critère.
  selectedIds.forEach(id => {
    let cur = _colDict[id];
    while (cur && cur.parent_id) {
      expanded.add(cur.parent_id);
      cur = _colDict[cur.parent_id];
    }
  });

  const roots = Object.entries(_colDict).filter(([id,c]) => !c.parent_id);
  function renderNode(id, depth) {
    const col = _colDict[id];
    if (!col) return '';
    const children = Object.entries(_colDict).filter(([cid,c]) => c.parent_id === id);
    const selected = selectedIds.includes(id);
    const isExpanded = expanded.has(id);
    const arrow = children.length
      ? '<span class="aps-col-tree-arrow" onclick="toggleColTreeNode(\''+blockId+'\','+ci+',\''+id+'\',event)">' + (isExpanded ? '▾' : '▸') + '</span>'
      : '<span class="aps-col-tree-arrow-spacer"></span>';
    let html = '<div class="aps-col-tree-node'+(selected?' selected':'')+'" style="--indent:'+depth+';">'
      + arrow
      + '<span onclick="toggleCol(\'' + blockId + '\''+ ',' + ci + ',\''+id+'\')">' + col.name + '</span>'
      + '</div>';
    if (children.length && isExpanded) {
      children.forEach(([cid]) => { html += renderNode(cid, depth+1); });
    }
    return html;
  }
  return roots.map(([id]) => renderNode(id, 0)).join('');
}

function onColModeChange(blockId, ci, mode) {
  lireBlocs();
  const block = _blocks.find(b => b.id == blockId);
  if (block && block.criteria[ci]) {
    block.criteria[ci].colMode = mode;
    block.criteria[ci].value   = ''; // la valeur precedente ne veut plus rien dire dans l'autre mode
  }
  rerendreBlocs();
}

function toggleCol(blockId, ci, colId) {
  // Lire l'état DOM avant de modifier
  lireBlocs();
  const block = _blocks.find(b => b.id == blockId); // == intentionnel (string vs number)
  if (!block) return;
  // S'assurer que le critère existe
  if (!block.criteria[ci]) {
    block.criteria[ci] = { field:'__collection__', op:'in_branch', value:'[]', join:'AND' };
  }
  const ids = _parseColIds(block.criteria[ci].value);
  const idx = ids.indexOf(colId);
  if (idx >= 0) ids.splice(idx, 1); else ids.push(colId);
  block.criteria[ci].value = JSON.stringify(ids);
  rerendreBlocs();
}

function removeColTag(blockId, ci, colId) {
  lireBlocs();
  const block = _blocks.find(b => b.id == blockId);
  if (!block || !block.criteria[ci]) return;
  const ids = _parseColIds(block.criteria[ci].value).filter(id => id !== colId);
  block.criteria[ci].value = JSON.stringify(ids);
  rerendreBlocs();
}

function rerendreBlocs() {
  const container = document.getElementById('blocks-container');
  let html = '';
  _blocks.forEach((block, bidx) => {
    const prev = _blocks.slice(0, bidx);
    const objOpts = OBJECT_TYPES.map(o =>
      '<option value="' + o.value + '"' + (block.objectType === o.value ? ' selected' : '') + '>' + o.label + '</option>'
    ).join('');
    const parentOpts = prev.length
      ? '<select class="aps-select sr-parent aps-flex1-fs11"><option value="">— aucun parent —</option>' +
        prev.map(b => '<option value="' + b.id + '"' + (block.parentBlock == b.id ? ' selected' : '') + '>Dans Bloc ' + b.id + '</option>').join('') +
        '</select>'
      : '';
    const crits = block.criteria.map((crit, ci) => {
      const _ops = getOpsForField(crit.field);
      const fOpts = _allFields.map(f =>
        '<option value="' + f.name + '"' + (crit.field === f.name ? ' selected' : '') + '>' + (f.label || f.name) + '</option>'
      ).join('');
      const opOpts = _ops.map(o =>
        '<option value="' + o.v + '"' + (crit.op === o.v ? ' selected' : '') + '>' + o.l + '</option>'
      ).join('');
      const isColField = crit.field === '__collection__';
      const colIds = isColField ? _parseColIds(crit.value) : [];
      const colMode = crit.colMode === 'id' ? 'id' : 'tree';
      const colModeSel = isColField ? (
        '<select class="aps-select aps-col-mode-sel" onchange="onColModeChange(' + block.id + ',' + ci + ',this.value)">' +
        '<option value="tree" ' + (colMode==='tree'?'selected':'') + '>Depuis l\'arbo</option>' +
        '<option value="id"   ' + (colMode==='id'  ?'selected':'') + '>Par ID</option>' +
        '</select>'
      ) : '';
      const colBrowse = isColField ? (
        '<div class="aps-col-browse-wrap">' +
        colModeSel +
        '<label class="aps-col-sub-label">' +
        '<input type="checkbox" class="aps-crit-col-sub" data-bid="'+block.id+'" data-ci="'+ci+'"' + ((crit.op||'in_branch')==='in_branch'?' checked':'') + ' onchange="onColSubChange(this)">' +
        'Inclure les sous-dossiers</label>' +
        (colMode === 'id'
          ? '<input class="aps-input aps-crit-val" placeholder="ID de la collection" value="' + (colIds[0]||'').replace(/"/g,'&quot;') + '">'
          : '<div class="aps-col-tags">' + buildColTagsHtml(colIds, block.id, ci) + '</div>' +
            '<div class="aps-col-tree-wrap">' + buildColTreeHtml(colIds, block.id, ci) + '</div>' +
            '<input type="hidden" class="aps-crit-val" value=\''+JSON.stringify(colIds)+'\'>') +
        '</div>'
      ) : '';
      return '<div class="aps-crit-row">' +
        (ci > 0
          ? '<button class="aps-crit-join" onclick="toggleJoin(' + block.id + ',' + ci + ')">' + (crit.join || 'AND') + '</button>'
          : '<div class="aps-crit-join-spacer"></div>') +
        '<select class="aps-select aps-crit-field aps-flex15-fs11" onchange="onFieldChange('+block.id+','+ci+',this.value)">' + fOpts + '</select>' +
        (isColField
          ? colBrowse
          : '<select class="aps-select aps-crit-op aps-flex12-fs11" onchange="onOpChange(' + block.id + ',' + ci + ',this.value)">' + opOpts + '</select>' +
            buildValInput(crit, block.id, ci)) +
        '<button class="aps-crit-del" onclick="supprimerCritere(' + block.id + ',' + ci + ')">&times;</button>' +
        '</div>';
    }).join('');
    html += '<div class="aps-block" data-block-id="' + block.id + '">' +
      '<div class="aps-block-header">' +
      '<span class="aps-block-num">BLOC ' + block.id + '</span>' +
      '<select class="aps-select sr-obj-type aps-flex2-fs11">' + objOpts + '</select>' +
      parentOpts +
      (_blocks.length > 1 ? '<button class="aps-crit-del aps-ml-auto" onclick="supprimerBloc(' + block.id + ')">&times;</button>' : '') +
      '</div><div class="aps-block-body">' + crits +
      '<button class="aps-add-crit" onclick="ajouterCritere(' + block.id + ')">+ Critere</button>' +
      '</div></div>';
  });
  html += '<button class="aps-add-block" onclick="ajouterBloc()">+ Ajouter un bloc</button>';
  container.innerHTML = html;
  const ret = document.getElementById('sr-return-block');
  ret.innerHTML = _blocks.map(b => '<option value="' + b.id + '">Bloc ' + b.id + '</option>').join('');
}

async function lancerRecherche() {
  lireBlocs();
  if (!_env) { afficherErreur('Selectionnez un environnement.'); return; }
  if (!_blocks.length) { afficherErreur('Ajoutez au moins un bloc.'); return; }
  const btn = document.getElementById('btn-search');
  btn.disabled = true; btn.textContent = 'Recherche...';
  afficherChargement();
  const limit       = parseInt(document.getElementById('sr-limit').value) || 500;
  const returnBlock = parseInt(document.getElementById('sr-return-block').value) || _blocks[0].id;
  const expression  = document.getElementById('sr-expression').value.trim();
  const activeIds   = _evalExpr(expression, _blocks.map(b => b.id));
  const blockResults = {};
  try {
    for (const block of _blocks) {
      if (!activeIds.has(block.id)) continue;
      let parentIds = null;
      if (block.parentBlock != null) {
        const pr = blockResults[block.parentBlock] || [];
        parentIds = pr.map(o => o.id).filter(Boolean);
        if (!parentIds.length) { blockResults[block.id] = []; continue; }
      }
      const queryString = _criteriaToQuery(block.criteria, block.objectType);
      const body = { doc_types:[block.objectType], query:queryString, filters:[], limit:limit, offset:0 };
      if (parentIds && parentIds.length) body.collection_ids = parentIds;
      const r = await fetch(_BASE + '/' + _env + '/API/search/v1/search/', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' bloc ' + block.id);
      const d = await r.json();
      blockResults[block.id] = d.objects || [];
    }
    const results = blockResults[returnBlock] || [];
    _lastResults = results;
    afficherResultats(results);
  } catch(e) {
    afficherErreur('Erreur : ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Rechercher';
  }
}

// Echappe une valeur pour la syntaxe query Iconik (guillemets/antislash)
function _escQueryVal(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Traduit UN critère en terme de requête (chaîne) — le tableau "filters"
// natif d'Iconik s'est révélé ignoré par cet endpoint (verifie le 14/07/2026
// en console : payload correctement forme, jamais applique aux resultats).
// Seule la syntaxe "query" (type Elasticsearch/Lucene) filtre reellement.
function _critToQueryTerm(crit, objectType) {
  if (!crit.field) return null;
  if (crit.field === '__collection__') {
    const colIds = _parseColIds(crit.value);
    if (!colIds.length) return null;
    // Le nom de champ depend de ce qu'on cherche - bug corrige le 14/07/2026 :
    // toujours parent_id avant, meme en cherchant des assets (qui n'ont pas
    // ce champ - in_collections est le bon pour eux, verifie en conditions
    // reelles).
    const isCollectionSearch = objectType === 'collections';
    const fname2 = crit.op === 'in_branch'
      ? 'ancestor_collections'
      : (isCollectionSearch ? 'parent_id' : 'in_collections');
    const terms = colIds.map(id => fname2 + ':"' + _escQueryVal(id) + '"');
    return terms.length === 1 ? terms[0] : '(' + terms.join(' OR ') + ')';
  }
  const SYS = ['id','title','date_created','date_modified','object_type','status','archive_status','external_id'];
  const fname = SYS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
  const val = crit.value || '';
  const v = _escQueryVal(val);
  switch (crit.op) {
    case 'equals':       return fname + ':"' + v + '"';
    case 'not_equals':   return 'NOT ' + fname + ':"' + v + '"';
    case 'contains':     return fname + ':*' + v + '*';
    case 'not_contains': return 'NOT ' + fname + ':*' + v + '*';
    case 'starts_with':  return fname + ':' + v + '*';
    case 'is_empty':     return 'NOT _exists_:' + fname;
    case 'is_not_empty': return '_exists_:' + fname;
    case 'between': {
      const parts = val.split('|');
      return fname + ':[' + _escQueryVal(parts[0]||'*') + ' TO ' + _escQueryVal(parts[1]||'*') + ']';
    }
    case 'before': return fname + ':<"' + v + '"';
    case 'after':  return fname + ':>"' + v + '"';
    case 'gt':     return fname + ':>' + v;
    case 'lt':     return fname + ':<' + v;
    case 'contains_any': {
      const vals = val.split(',').map(x=>x.trim()).filter(Boolean);
      return vals.length ? '(' + vals.map(x => fname + ':"' + _escQueryVal(x) + '"').join(' OR ') + ')' : null;
    }
    case 'is_true':  return fname + ':true';
    case 'is_false': return fname + ':false';
    default:         return null;
  }
}

// Assemble les critères d'un bloc en une seule chaîne query, en respectant
// le AND/OR de chaque critère par rapport au précédent.
function _criteriaToQuery(criteria, objectType) {
  const parts = [];
  (criteria || []).forEach(crit => {
    const term = _critToQueryTerm(crit, objectType);
    if (!term) return;
    if (parts.length) parts.push(crit.join === 'OR' ? 'OR' : 'AND');
    parts.push(term);
  });
  return parts.length ? '(' + parts.join(' ') + ')' : '';
}

function _evalExpr(expr, allIds) {
  if (!expr) return new Set(allIds);
  const active = new Set(), excluded = new Set();
  for (const m of expr.matchAll(/NOT\s+(\d+)/g)) excluded.add(parseInt(m[1]));
  for (const m of expr.matchAll(/\b(\d+)\b/g)) { const id=parseInt(m[1]); if(!excluded.has(id)) active.add(id); }
  return new Set([...active].filter(id => allIds.includes(id)));
}

function afficherChargement() {
  document.getElementById('results-area').innerHTML = '<div class="aps-empty"><div class="aps-spinner"></div><div class="aps-empty-msg">Recherche en cours...</div></div>';
  document.getElementById('results-count').textContent = '';
  document.getElementById('btn-csv').classList.add('aps-hidden');
}

function afficherErreur(msg) {
  document.getElementById('results-area').innerHTML = '<div class="aps-empty"><div class="aps-empty-msg aps-c-red">' + msg + '</div></div>';
  document.getElementById('results-count').textContent = '';
  document.getElementById('btn-csv').classList.add('aps-hidden');
}

function afficherResultats(results) {
  const count = document.getElementById('results-count');
  const area  = document.getElementById('results-area');
  const csv   = document.getElementById('btn-csv');
  if (!results.length) {
    count.textContent = '0 resultat';
    area.innerHTML = '<div class="aps-empty"><div class="aps-empty-msg">Aucun resultat pour ces criteres.</div></div>';
    csv.classList.add('aps-hidden');
    return;
  }
  count.textContent = results.length + ' resultat' + (results.length > 1 ? 's' : '');
  csv.classList.remove('aps-hidden');
  const pad = n => String(n).padStart(2,'0');
  const fmt = s => { if (!s) return '-'; const d=new Date(s); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear(); };
  const sCls = s => { if(!s) return 'other'; const sl=s.toLowerCase(); if(sl==='active') return 'active'; if(sl.includes('archive')) return 'archive'; if(sl.includes('delete')) return 'deleted'; return 'other'; };
  const TH = [
    ['title','Titre'],['object_type','Type'],['status','Statut'],
    ['date_created','Cree'],['date_modified','Modifie']
  ];
  const thHtml = TH.map((t,i) =>
    '<th onclick="trierPar(\'' + t[0] + '\')" ' + (i===0?'class="sorted"':'') + '>' + t[1] + '</th>'
  ).join('') + '<th>Chemin</th><th>ID</th>';
  area.innerHTML = '<table><thead><tr>' + thHtml + '</tr></thead><tbody>' +
    results.map(o =>
      '<tr>' +
      '<td class="td-title">' + (o.title||'Sans titre').replace(/</g,'&lt;') + '</td>' +
      '<td class="td-type">' + (o.object_type||'-') + '</td>' +
      '<td><span class="td-status ' + sCls(o.status) + '">' + (o.status||'-') + '</span></td>' +
      '<td class="td-date">' + fmt(o.date_created) + '</td>' +
      '<td class="td-date">' + fmt(o.date_modified) + '</td>' +
      '<td class="td-path" title="' + buildPath(o.in_collections||[]).replace(/"/g,'&quot;') + '">' + buildPath(o.in_collections||[]) + '</td>' +
      '<td class="td-id" title="' + (o.id||'') + '">' + (o.id||'-') + '</td>' +
      '</tr>'
    ).join('') + '</tbody></table>';
}

let _sortField='title', _sortAsc=true;
function trierPar(field) {
  if (_sortField===field) _sortAsc=!_sortAsc; else { _sortField=field; _sortAsc=true; }
  const sorted = [..._lastResults].sort((a,b) => {
    const va=(a[field]||'').toString().toLowerCase();
    const vb=(b[field]||'').toString().toLowerCase();
    return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  afficherResultats(sorted);
  _lastResults = sorted;
}

function exportCsv() {
  if (!_lastResults.length) return;
  const pad = n => String(n).padStart(2,'0');
  const fmt = s => { if(!s) return ''; const d=new Date(s); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear(); };
  const rows = _lastResults.map(o => [
    '"'+(o.title||'').replace(/"/g,'""')+'"',
    o.object_type||'', o.status||'',
    fmt(o.date_created), fmt(o.date_modified), o.id||''
  ].join(';'));
  const csv = ['Titre;Type;Statut;Date creation;Date modif.;ID', ...rows].join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aps-recherche-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
