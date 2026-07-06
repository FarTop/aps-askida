// WFD — wfd-config-panel.js — modifié le 2026-06-14 20:32
// ══════════════════════════════════════════════════════════════
// WFD CONFIG PANEL — wfd-config-panel.js
// ══════════════════════════════════════════════════════════════
//
//  Ce fichier contient TOUT ce qui concerne le panneau de
//  builders de chaque famille de nœud.
//
//  DÉPENDANCES (lues depuis script-workflow-designer.js) :
//    Variables globales : wfdData, wfdFlows, wfdPalNodes,
//      wfdContacts, wfdConnexions, wfdNommages, wfdScripts,
//      selectedNodeId, configDirty, FAMILIES, ACTION_TYPES,
//      TRIGGER_EVENTS, TRIGGER_CONDITIONS, NOTIF_CHANNELS,
//      QC_CATEGORIES, QC_OPS, QC_FILE_FIELDS, DECISION_OPS,
//      SOURCE_VARIANTS, SCRIPT_LANGS, DEFAULT_SCRIPTS,
//      S3_ACCOUNT_TYPES, EXPORT_TARGETS
//    Fonctions : escHtml, toast, updateStatus, renderCanvas,
//      renderConnectionsOnly, sauvegarderEtat, getFluxCourant,
//      buildPortsDef, selectNode, chargerIconikData,
//      wfdColTreeHtml, ouvrirEditeurScript
//
//  INTERFACE PUBLIQUE (appelée depuis l'extérieur) :
//    ouvrirConfigPanel(node)
//    fermerConfigPanel()
//    sauvegarderConfig()
//    supprimerNoeudSelectionne()
//    selectPostitColor(col)
//
// ══════════════════════════════════════════════════════════════

// ── Datalist centralisé variables + métadonnées ───────────────
// Utilisé par tous les nœuds ayant un champ "{variable}" libre.
// Suggestions : variables système + metadata dynamiques depuis wfdData.
function buildWfdVarDatalist(id) {
  // Datalist vide — l'autocomplétion est gérée par le dropdown custom _ouvrirVarDropdown
  return `<datalist id="${id}"></datalist>`;
}

// ── Variables : catégories ────────────────────────────────────────────────────
const _WFD_ICONIK_VARS = [
  { group:'Asset',      vars:['{asset.id}','{asset.title}','{asset.status}','{asset.type}','{asset.created}','{asset.updated}'] },
  { group:'Fichier',    vars:['{file.id}','{file.path}','{file.name}','{file.ext}','{file.size}'] },
  { group:'Collection', vars:['{collection.id}','{collection.name}','{collection.path}'] },
  { group:'Workflow',   vars:['{workflow.id}','{workflow.name}'] },
  { group:'Job',        vars:['{job.id}','{job.status}','{job.error}'] },
  { group:'Trigger',    vars:['{trigger.event}','{trigger.user}','{trigger.timestamp}'] },
  { group:'Boucle',     vars:['{loop.item}','{loop.index}','{loop.total}'] },
];


let _wfdVarDropdown = null;
let _wfdVarInput    = null; // ⬅️ NEW

function _fermerVarDropdown() {
  _wfdVarDropdown?.remove();
  _wfdVarDropdown = null;
  _wfdVarInput    = null;   // ⬅️ NEW
}

function _ouvrirVarDropdown(input) {
  _fermerVarDropdown();
  _wfdVarInput = input; // ⬅️ NEW
  const query = (input.value || '').toLowerCase();

  const dd = document.createElement('div');
  dd.id = 'wfd-var-dropdown';
  dd.style.cssText = [
    'position:fixed;z-index:99999;background:#141414;',
    'border:1px solid #2a2a2a;border-radius:6px;',
    'box-shadow:0 8px 24px rgba(0,0,0,.75);',
    'width:280px;max-height:360px;overflow-y:auto;',
    'font-size:11px;font-family:var(--font-mono,monospace);',
  ].join('');

  const rect = input.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const ddW = 280;
  // Positionnement horizontal : aligner à gauche, mais corriger si ça déborde à droite
  let leftPos = rect.left;
  if (leftPos + ddW > window.innerWidth - 8) leftPos = Math.max(8, window.innerWidth - ddW - 8);
  if (spaceBelow > 180) {
    dd.style.top  = (rect.bottom + 4) + 'px';
    dd.style.left = leftPos + 'px';
  } else {
    dd.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    dd.style.top    = 'auto';
    dd.style.left   = leftPos + 'px';
  }

  function makeHeader(label, color) {
    const h = document.createElement('div');
    h.style.cssText = `padding:4px 10px 3px;font-size:9px;font-weight:700;letter-spacing:.08em;
      color:${color};background:#0d0d0d;border-bottom:1px solid #1a1a1a;
      text-transform:uppercase;position:sticky;top:0;`;
    h.textContent = label;
    return h;
  }

  function makeItem(varStr, badge, badgeColor) {
    if (query && !varStr.toLowerCase().includes(query)) return null;
    const item = document.createElement('div');
    item.className = 'wfd-var-item';
    item.innerHTML =
      `<span class="wfd-var-item-name">${varStr}</span>` +
      `<span class="wfd-var-badge" style="--badge-color:${badgeColor};">${badge}</span>`;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      input.value = varStr;
      input.dispatchEvent(new Event('input',  { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
      _fermerVarDropdown();
      input.focus();
    });
    item.addEventListener('mouseover', () => item.classList.add('hovered-dropdown'));
    item.addEventListener('mouseout',  () => item.classList.remove('hovered-dropdown'));
    return item;
  }

  let hasContent = false;

  // ── Iconik API ────────────────────────────────────────────────────────────
  const iconikItems = [];
_WFD_ICONIK_VARS.forEach(grp => {
  grp.vars.forEach(v => {
    const item = makeItem(v, 'Iconik API', '#3498db');
    if (item) iconikItems.push(item);
  });
});

// Metadata synchronisée
const allMeta = (wfdData.metadata||[])
  .map(m => m.nom||m.name||'')
  .filter(Boolean)
  .sort();

allMeta.forEach(m => {
  const item = makeItem(`{asset.metadata.${m}}`, 'Metadata', '#9b59b6');
  if (item) iconikItems.push(item);
});

if (iconikItems.length) {
  dd.appendChild(makeHeader('⚡ API Iconik', '#3498db'));
  iconikItems.forEach(item => dd.appendChild(item));
  hasContent = true;
}

// 🟣 Nommage : proposer aussi la forme courte {Champ} en plus de {asset.metadata.Champ}
if (input && (input.id.endsWith('-rename-template') || input.id.endsWith('-rename-backup'))) {
  const shortMetaItems = [];
  allMeta.forEach(m => {
    const item = makeItem(`{${m}}`, 'Metadata', '#9b59b6'); // forme courte
    if (item) shortMetaItems.push(item);
  });
  if (shortMetaItems.length) {
    dd.appendChild(makeHeader('🏷 Metadata (forme courte)', '#9b59b6'));
    shortMetaItems.forEach(item => dd.appendChild(item));
    hasContent = true;
  }
}
  // ── Nœuds du flux courant (variables Designer) ────────────────────────────
  try {
    const flux = getFluxCourant?.();
    const designerItems = (flux?.nodes||[])
      .filter(n => n.family !== 'postit')
      .map(n => makeItem(`{node.${n.name}}`, n.family, '#27ae60'))
      .filter(Boolean);
    if (designerItems.length) {
      dd.appendChild(makeHeader('🔗 Nœuds du flux', '#27ae60'));
      designerItems.forEach(item => dd.appendChild(item));
      hasContent = true;
    }
  } catch(e) { /* getFluxCourant pas encore disponible */ }
  // 🛠️ Variables workflow (custom) — scannées depuis le flux courant
  try {
  const flux = (typeof getFluxCourant === 'function') ? getFluxCourant() : null;
  const customSet = new Set();

  if (flux && Array.isArray(flux.nodes)) {
    flux.nodes.forEach(n => {
      const c = (n && n.config) ? n.config : {};
      switch (n.family) {
        case 'create_asset':
        case 'create_col':
        case 'link_file':
        case 'transcode':
          // Racine + .id (pratiques au quotidien)
          if (c.resultVar) { customSet.add(c.resultVar); customSet.add(`${c.resultVar}.id`); }
          break;

        case 'notify_post':
          if (c.resultVar) customSet.add(c.resultVar);        // ex : response
          break;

        case 'lookup':
          if (c.lkOutputVar) customSet.add(c.lkOutputVar);    // ex : targetColPath
          break;

        case 'fetch':
          if (c.fetchVar || c.storeAs) customSet.add(c.fetchVar || c.storeAs);
          break;

        case 'set_var':
          if (Array.isArray(c.assignments)) {
            c.assignments.forEach(a => { if (a.key) customSet.add(a.key); });
          }
          break;

        case 'id_generator':
          if (c.varName) customSet.add(c.varName);
          break;

        case 'script':
          if (c.resultVar) customSet.add(c.resultVar);
          break;

        case 'http_request':
          // Mode Action — resultVar depuis l'action
          if (c.connexionId && c.actionId) {
            const _conn = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : [])
              .find(cx => cx.id === c.connexionId);
            const _act = (_conn?.actions || []).find(a => a.id === c.actionId);
            if (_act?.resultVar) customSet.add(_act.resultVar);
          }
          // Mode Simple — resultVar depuis la config du nœud
          if (c.resultVar) customSet.add(c.resultVar);
          // Mode Foreach — feResultVar
          if (c.feResultVar) customSet.add(c.feResultVar);
          break;

        case 'subflow':
          if (Array.isArray(c.returnVars)) {
            c.returnVars.forEach(v => { if (v && v.dst) customSet.add(v.dst); });
          }
          break;

        default: break;
      }
    });
  }

  const customItems = Array.from(customSet)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    .map(v => makeItem(`{${v}}`, 'Workflow', '#00d4aa'))
    .filter(Boolean);

  if (customItems.length) {
    dd.appendChild(makeHeader('🔧 Variables workflow (custom)', '#00d4aa'));
    customItems.forEach(item => dd.appendChild(item));
    hasContent = true;
  }
} catch(_e) { /* flux pas dispo : no-op */ }  
  // ── Résultats Fetch — champs depuis le dernier snapshot de run ──────────
  try {
    const flux2 = (typeof getFluxCourant === 'function') ? getFluxCourant() : null;
    if (flux2?.id) {
      // Lire le dernier snapshot depuis l'historique local (synchrone)
      const history = JSON.parse(localStorage.getItem('wfd-run-history') || '{"runs":{}, "index":[]}');
      const lastRunId = (history.index || []).find(id => history.runs[id]?.fluxId === flux2.id);
      const lastRun   = lastRunId ? history.runs[lastRunId] : null;

      if (lastRun?.nodes) {
        const fetchItems = [];

        lastRun.nodes.forEach(node => {
          if (node.nodeFamily !== 'fetch' || !node.snapshot) return;
          const results = node.snapshot.results || {};

          Object.entries(results).forEach(([varName, data]) => {
            if (!data || typeof data !== 'object') return;

            // Champs core asset
            const coreFields = [
              ['title',                 'Titre'],
              ['status',               'Statut'],
              ['duration_milliseconds','Durée (ms)'],
              ['date_created',         'Créé le'],
            ];
            coreFields.forEach(([field, label]) => {
              if (data[field] !== undefined) {
                const item = makeItem(`{results.${varName}.${field}}`, label, '#e67e22');
                if (item) fetchItems.push(item);
              }
            });

            // Champs metadata_values — depuis le snapshot réel
            const mdValues = data.metadata_values || {};
            const mdFields = Object.keys(mdValues).filter(k => k !== '__separator__').sort();
            if (mdFields.length) {
              mdFields.forEach(field => {
                const path = `{results.${varName}.metadata_values.${field}.field_values[0].value}`;
                const item = makeItem(path, field, '#9b59b6');
                if (item) fetchItems.push(item);
              });
            }
          });
        });

        if (fetchItems.length) {
          dd.appendChild(makeHeader('📋 Résultats du dernier run', '#e67e22'));
          fetchItems.forEach(item => dd.appendChild(item));
          hasContent = true;
        }
      }
    }
  } catch(_e) {}

  if (!hasContent) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px;color:#555;text-align:center;font-family:var(--font-ui);';
    empty.textContent = 'Aucune variable correspondante';
    dd.appendChild(empty);
  }

  document.body.appendChild(dd);
  _wfdVarDropdown = dd;
}

// Initialisation — appelée depuis wfd-config-panel.js lui-même via DOMContentLoaded
function setupVarDropdowns() {
  document.addEventListener('focusin', e => {
    const input = e.target;
    if (input.tagName !== 'INPUT') return;
    if (!(input.getAttribute('list')||'').endsWith('-wfd-var-list')) return;
    _ouvrirVarDropdown(input);
  });
  
  document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!_wfdVarDropdown) return;
    const active = document.activeElement;
    // Garder ouvert si on est toujours sur l'input concerné OU dans le dropdown
    if (active === _wfdVarInput) return;
    if (_wfdVarDropdown.contains(active)) return;
    _fermerVarDropdown();
  }, 150);
});

  document.addEventListener('input', e => {
    const input = e.target;
    if (input.tagName !== 'INPUT') return;
    if (!(input.getAttribute('list')||'').endsWith('-wfd-var-list')) return;
    if (document.activeElement === input) _ouvrirVarDropdown(input);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _wfdVarDropdown) _fermerVarDropdown();
  });
  document.addEventListener('mousedown', e => {
    if (_wfdVarDropdown && !_wfdVarDropdown.contains(e.target)) _fermerVarDropdown();
  }, true);
}

// Auto-init quand wfd-config-panel.js est chargé (après script-workflow-designer.js)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupVarDropdowns);
} else {
  setupVarDropdowns();
}



// Construit les champs spécifiques au canal — chacun sur sa propre ligne labelisée
// ── Loop helpers ─────────────────────────────────────────────
function buildLoopSourceFields(pfx, cfg) {
  const src = cfg.loopSource || 'files';
  if (src === 'files') return `
    <div class="cfg-field">
      <label class="cfg-label">Filtre extension (optionnel)</label>
      <input id="${pfx}-loop-filter" class="cfg-input" value="${cfg.loopFilter||''}"
        placeholder="MXF, MP4, MOV — laisser vide pour tous">
    </div>`;
  if (src === 'assets') return `
  <div class="cfg-field">
    <label class="cfg-label">Collection source</label>
    ${wfdColTreeHtml(`${pfx}-loop`,
      JSON.stringify(
        Array.isArray(cfg.loopCollectionIds) ? cfg.loopCollectionIds
        : (cfg.loopCollection ? [cfg.loopCollection] : [])
      )
    )}
  </div>`;
  if (src === 'list') return `
    <div class="cfg-field">
      <label class="cfg-label">Liste JSON</label>
      <textarea id="${pfx}-loop-list" class="cfg-textarea wfd-mono-sm">${cfg.loopList||''}</textarea>
    </div>`;
  if (src === 'metadata') return `
    <div class="cfg-field">
      <label class="cfg-label">Champ métadonnée (multi-valeur)</label>
      <input id="${pfx}-loop-metafield" class="cfg-input" value="${cfg.loopMetaField||''}"
        placeholder="nom_du_champ">
    </div>`;
  return '';
}

function _loopSourceChange(pfx) {
  const v = document.getElementById(pfx+'-loop-source')?.value || 'files';
  const zone = document.getElementById(pfx+'-loop-source-fields');
  if (zone) zone.innerHTML = buildLoopSourceFields(pfx, { loopSource:v });
}
function mnLoopSourceChange()  { _loopSourceChange('mn'); }
function cfgLoopSourceChange() { _loopSourceChange('cfg'); }

// ── QC helpers ──────────────────────────────────────────────

function buildQCRuleRow(i, r, pfx) {                   // ← on ajoute pfx
  const cat = r.category || 'metadata';
  const op = r.op || 'present';
  const hasVal = QC_OPS[op]?.hasValue !== false;
  const metaFields = (wfdData.metadata||[]).map(f=>f.nom||f.name||'').filter(Boolean)
                      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const fieldOpts = cat === 'metadata'
    ? (metaFields.length
        ? metaFields.map(f=>`<option value="${f}" ${r.field===f?'selected':''}>${f}</option>`).join('')
        : `<option value="${r.field||''}">${r.field||'(champ libre)'}</option>`)
    : QC_FILE_FIELDS.map(f=>`<option value="${f}" ${r.field===f?'selected':''}>${f}</option>`).join('');


  return `<div id="qc-rule-${i}" class="wfd-qc-rule-card">
    <div class="wfd-row-gap8b">
      <span class="wfd-qc-rule-idx">#${i+1}</span>
      <select class="cfg-select qc-cat wfd-qc-cat-select" data-idx="${i}"
        onchange="changerCategorieQC(${i},this.value)">
        ${Object.entries(QC_CATEGORIES).map(([k,v])=>
          `<option value="${k}" ${cat===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
      <button class="btn-del-cond" onclick="supprimerRegleQC(${i})">\u00D7</button>
    </div>
    <div class="${hasVal?'wfd-qc-grid-3col':'wfd-qc-grid-2col'}">
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">CHAMP</label>
        
  ${cat==='metadata' && metaFields.length
    ? `<select class="cfg-select qc-field" data-idx="${i}">
         <option value="${r.field||''}">— Champ méta —</option>${fieldOpts}</select>`
    : cat==='file'
    ? `<select class="cfg-select qc-field" data-idx="${i}">${fieldOpts}</select>`
    : cat==='collection'
    ? (
        // Afficher l’arborescence pour la catégorie “collection”
        (typeof wfdColTreeHtml === 'function')
          ? `<div id="${pfx}-qc-r${i}-col-wrap" style="position:relative;">
               ${wfdColTreeHtml(`${pfx}-qc-r${i}`, JSON.stringify(r.field ? [r.field] : []))}
             </div>`
          : `<input class="cfg-input qc-field" data-idx="${i}" value="${r.field||''}"
                    placeholder="ID / chemin collection">`
      )
    : `<input class="cfg-input qc-field" data-idx="${i}" value="${r.field||''}"
              placeholder="permission">`}

      </div>
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">CONDITION</label>
        <select class="cfg-select qc-op" data-idx="${i}" onchange="rafraichirValeurQC(${i},this.value)">
          ${Object.entries(QC_OPS).map(([k,v])=>
            `<option value="${k}" ${op===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </div>
      ${hasVal ? `<div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">VALEUR</label>
        <input class="cfg-input qc-value" data-idx="${i}" value="${r.value||''}"
          placeholder="valeur attendue">
      </div>` : '<div></div>'}
    </div>
    <div class="wfd-grid-2-gap6b">
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">SI \u00C9CHOUE \u2192 SORTIE</label>
        <select class="cfg-select qc-fail-port" data-idx="${i}">
          <option value="Fail" ${r.failPort==='Fail'?'selected':''}>Fail</option>
          <option value="Warning" ${r.failPort==='Warning'?'selected':''}>Warning</option>
        </select>
      </div>
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">MESSAGE D'ERREUR</label>
        <input class="cfg-input qc-msg" data-idx="${i}" value="${r.message||''}"
          placeholder="ex : Codec non conforme">
      </div>
    </div>
  </div>`;
}

function buildQCOutputRow(i, o) {
  const colors = ['#27ae60','#e74c3c','#f39c12','#3498db','#9b59b6'];
  const col    = o.color || colors[i % colors.length];
  return `<div id="qcout-row-${i}" class="wfd-qc-output-card">
    <span class="wfd-qc-output-dot" style="--dot-color:${col};"></span>
    <input type="text" class="cfg-input qcout-label wfd-qc-output-label" value="${o.label||'Sortie '+(i+1)}">
    <input type="color" class="qcout-color wfd-color-input-sm" value="${col}">
    <button class="btn-del-cond" onclick="supprimerSortieQC(${i})">\u00D7</button>
  </div>`;
}

function ajouterRegleQC() {
  const c = document.getElementById('mn-qc-rules') || document.getElementById('cfg-qc-rules');
  if (!c) return;
  const pfx = c.id.startsWith('mn-') ? 'mn' : 'cfg';
  c.insertAdjacentHTML('beforeend', buildQCRuleRow(c.children.length, {}));
}
function supprimerRegleQC(i) { document.getElementById('qc-rule-'+i)?.remove(); }

function ajouterSortieQC() {
  const c = document.getElementById('mn-qc-outputs') || document.getElementById('cfg-qc-outputs');
  if (!c) return;
  c.insertAdjacentHTML('beforeend', buildQCOutputRow(c.children.length, {}));
}
function supprimerSortieQC(i) { document.getElementById('qcout-row-'+i)?.remove(); }

function changerCategorieQC(i, cat) {
  const row = document.getElementById('qc-rule-'+i);
  if (!row) return;
  row.outerHTML = buildQCRuleRow(i, { category:cat });
}

function rafraichirValeurQC(i, op) {
  const hasVal = QC_OPS[op]?.hasValue !== false;
  // Reconstruire la ligne complète pour afficher/masquer le champ valeur
  const row = document.getElementById('qc-rule-'+i);
  if (!row) return;
  const cat   = row.querySelector('.qc-cat')?.value   || 'metadata';
  const field = row.querySelector('.qc-field')?.value  || '';
  const val   = row.querySelector('.qc-value')?.value  || '';
  const msg   = row.querySelector('.qc-msg')?.value    || '';
  const fp    = row.querySelector('.qc-fail-port')?.value || 'Fail';
  row.outerHTML = buildQCRuleRow(i, { category:cat, op, field, value:val, message:msg, failPort:fp });
}

function lireReglesQC(prefix) {
  const c = document.getElementById(prefix + '-qc-rules');
  if (!c) return [];

  return [...c.querySelectorAll('[id^=qc-rule-]')].map(row => {
    const category = row.querySelector('.qc-cat')?.value || 'metadata';
    let   field    = row.querySelector('.qc-field')?.value || '';
    const op       = row.querySelector('.qc-op')?.value || 'present';
    const value    = row.querySelector('.qc-value')?.value || '';
    const failPort = row.querySelector('.qc-fail-port')?.value || 'Fail';
    const message  = row.querySelector('.qc-msg')?.value || '';

    // Si la catégorie est "collection", essayer de lire le hidden du tree
    if (category === 'collection') {
      // Récupérer l'index i depuis l'id "qc-rule-i"
      const m = row.id.match(/^qc-rule-(\d+)$/);
      if (m) {
        const i = parseInt(m[1], 10);

        // --- Option A (recommandée) : tree par LIGNE ---
        // (utilisée si buildQCRuleRow a appelé wfdColTreeHtml(`${pfx}-qc-r${i}`, ...))
        const perRowHiddenId = `${prefix}-qc-r${i}-col-selected`;
        const raw = document.getElementById(perRowHiddenId)?.value;

        // --- Option B (alternative) : tree unique pour tout QC ---
        // (décommente ces 2 lignes si ton wfdColTreeHtml utilisait `${pfx}-qc`)
        // const raw = raw ?? document.getElementById(`${prefix}-qc-col-selected`)?.value;

        if (raw) {
          try {
            const ids = JSON.parse(raw);
            if (Array.isArray(ids) && ids[0]) field = ids[0];  // on prend le premier ID
          } catch (_) { /* no-op: garder field tel quel */ }
        }
      }
    }

    return { category, field, op, value, failPort, message };
  });
}

function lireSortiesQC(prefix) {
  const c = document.getElementById(prefix+'-qc-outputs');
  if (!c) return [];
  return [...c.querySelectorAll('[id^=qcout-row-]')].map(row => ({
    label : row.querySelector('.qcout-label')?.value || 'Sortie',
    color : row.querySelector('.qcout-color')?.value || '#27ae60',
  }));
}

// ── Approbateur helpers ──────────────────────────────────────
function buildApproverRow(i, a) {
  const listesOpts = wfdContacts.length
    ? wfdContacts.map(l=>`<option value="list:${l.id}" ${a.ref==='list:'+l.id?'selected':''}>${l.name} (${l.contacts.length})</option>`).join('')
    : '';
  return `<div id="appr-row-${i}" class="wfd-approver-card">
    <div class="wfd-flex1 wfd-grid-2-gap6b">
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">TYPE</label>
        <select class="cfg-select appr-type" data-idx="${i}" onchange="changerTypeApprobateur(${i},this.value)">
          <option value="email"  ${(a.type||'email')==='email' ?'selected':''}>\uD83D\uDCE7 Email direct</option>
          <option value="list"   ${a.type==='list'   ?'selected':''}>\uD83D\uDC65 Liste de contacts</option>
          <option value="group"  ${a.type==='group'  ?'selected':''}>\uD83D\uDC64 Groupe Iconik</option>
        </select>
      </div>
      <div class="cfg-field wfd-m0" id="appr-ref-${i}">
        <label class="cfg-label wfd-fs9">
          ${a.type==='list'?'LISTE':a.type==='group'?'GROUPE ICONIK':'EMAIL'}
        </label>
        ${a.type==='list'
          ? `<select class="cfg-select appr-ref" data-idx="${i}">
              <option value="">— Choisir —</option>${listesOpts}</select>`
          : `<input class="cfg-input appr-ref" data-idx="${i}"
              value="${a.ref||''}"
              placeholder="${a.type==='group'?'ID groupe Iconik':'approver@example.com'}">`}
      </div>
    </div>
    <button class="btn-del-cond" onclick="supprimerApprobateur(${i})">\u00D7</button>
  </div>`;
}

function ajouterApprobateur() {
  const c = document.getElementById('mn-approvers') || document.getElementById('cfg-approvers');
  if (!c) return;
  c.insertAdjacentHTML('beforeend', buildApproverRow(c.children.length, { type:'email' }));
}
function supprimerApprobateur(i) { document.getElementById('appr-row-'+i)?.remove(); }

function changerTypeApprobateur(i, type) {
  const row = document.getElementById('appr-row-'+i);
  if (!row) return;
  row.outerHTML = buildApproverRow(i, { type });
}

function lireApprobateurs(prefix) {
  const c = document.getElementById(prefix+'-approvers');
  if (!c) return [];
  return [...c.querySelectorAll('[id^=appr-row-]')].map(row => ({
    type : row.querySelector('.appr-type')?.value || 'email',
    ref  : row.querySelector('.appr-ref')?.value  || '',
  })).filter(a => a.ref);
}


function buildNotifColorPicker(chanIdx, cfg, label, withHint) {
  return `<div class="cfg-field">
      <label class="cfg-label wfd-fs9">${label}</label>
      <div class="wfd-row-gap8b">
        <select id="notif-color-mode-${chanIdx}" class="cfg-select wfd-w140-fs11"
          onchange="toggleNotifColorVar(${chanIdx})">
          <option value="fixed" ${(cfg.color_mode||'fixed')==='fixed'?'selected':''}>🎨 Fixe</option>
          <option value="var"   ${(cfg.color_mode||'fixed')==='var'  ?'selected':''}>📌 Variable</option>
        </select>
        <div id="notif-color-fixed-${chanIdx}" class="wfd-notif-color-fixed${(cfg.color_mode||'fixed')==='fixed'?'':' wfd-hidden'}">
          ${['#27ae60','#f39c12','#e74c3c','#3498db','#9b59b6','#1abc9c'].map(col=>
            `<div class="wfd-notif-color-swatch${(cfg.color||'#27ae60')===col?' selected':''}"
              onclick="setNotifColor(${chanIdx},'${col}')" data-color="${col}"
              style="--swatch-color:${col};"></div>`
          ).join('')}
        </div>
        <div id="notif-color-var-${chanIdx}" class="wfd-notif-color-var${(cfg.color_mode||'fixed')==='var'?'':' wfd-hidden'}">
          <input class="cfg-input wfd-w100pct" id="notif-color-var-input-${chanIdx}"
            placeholder="{wf_status} → success|partial|failed"
            value="${escHtml(cfg.color_var||'{wf_status}')}">
        </div>
      </div>${withHint ? `
      <div class="wfd-hint-notif-color">success=🟢 · partial=🟡 · failed=🔴</div>` : ''}
    </div>`;
}

function buildNotifMessageField(chanIdx, cfg, channel) {
  return `<div class="cfg-field">
      <label class="cfg-label wfd-fs9">MESSAGE</label>
      <textarea id="notif-${channel}-message-${chanIdx}" class="cfg-textarea notif-field wfd-notif-textarea-mono" data-key="message"
        placeholder="{asset.title}, {wf_errors}, {wf_fatal}, {wf_status}...">${escHtml(cfg.message||'')}</textarea>
    </div>`;
}

function buildChannelFields(channel, cfg, chanIdx) {
  chanIdx = chanIdx !== undefined ? chanIdx : 0;
  const v  = (k, ph, type='text') =>
    `<input id="notif-${chanIdx}-${k}" ${type==='password'?'type="password"':''} class="cfg-input notif-field" data-key="${k}"
      value="${escHtml(cfg[k]||'')}" placeholder="${ph}">`;
  const f  = (lbl, k, ph, type='text') =>
    `<div class="cfg-field"><label class="cfg-label wfd-fs9">${lbl}</label>${v(k,ph,type)}</div>`;

  switch (channel) {
    case 'email':
      return f('DESTINATAIRES (virgule)', 'to', 'alice@example.com, bob@example.com')
           + f('EXPÉDITEUR (optionnel)', 'from', 'workflow@maboite.com')
           + f('SUJET', 'subject', 'Asset prêt : {asset.metadata.titre}')
           + `<div class="cfg-field"><label class="cfg-label wfd-fs9">SERVEUR SMTP</label>
              <div class="wfd-grid-1fr-80-gap6">
                ${v('smtp_host','smtp.example.com')}
                ${v('smtp_port','587')}
              </div></div>`
           + f('UTILISATEUR SMTP', 'smtp_user', 'user@example.com')
           + f('MOT DE PASSE SMTP', 'smtp_pass', '••••••••', 'password');

    case 'teams':
      return f('WEBHOOK URL Teams', 'webhook_url', 'https://outlook.office.com/webhook/...')
           + f('TITRE DE LA CARTE', 'teams_title', 'Notification Iconik')
           + buildNotifColorPicker(chanIdx, cfg, 'COULEUR DE LA CARTE', true)
           + buildNotifMessageField(chanIdx, cfg, 'teams');

    case 'slack':
      return f('WEBHOOK URL Slack', 'webhook_url', 'https://hooks.slack.com/services/...')
           + f('CANAL (optionnel)', 'channel', '#notifications')
           + f('NOM DU BOT (optionnel)', 'username', 'Workflow Bot')
           + buildNotifColorPicker(chanIdx, cfg, 'COULEUR DE LA BARRE', false)
           + buildNotifMessageField(chanIdx, cfg, 'slack');

    case 'sms':
      return f('COMPTE TWILIO (SID)', 'account_sid', 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
           + f('AUTH TOKEN', 'auth_token', '••••••••', 'password')
           + f('NUMÉRO EXPÉDITEUR', 'from_number', '+33600000000')
           + f('DESTINATAIRE(S)', 'to', '+33611223344');

    default:
      return `<div class="wfd-text-555-11">Canal non reconnu : ${escHtml(channel)}</div>`;
  }
}

function buildRecipientRow(i, r) {
  const ch  = r.channel || 'email';
  const cfg = r.config  || {};
  const fam = NOTIF_CHANNELS[ch] || NOTIF_CHANNELS.email;

  const channelOpts = Object.entries(NOTIF_CHANNELS)
    .map(([k,v]) => `<option value="${k}" ${ch===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');

  // Résumé lisible des destinataires connus
  let recipSummary = '';
  if (ch==='email' && cfg.to)        recipSummary = cfg.to;
  else if ((ch==='teams'||ch==='slack') && cfg.webhook_url) recipSummary = cfg.webhook_url.slice(0,40)+'...';
  else if (ch==='sms' && cfg.to)     recipSummary = cfg.to;

  // Dropdown listes de contacts
  const listesOpts = wfdContacts.length
    ? `<div class="cfg-field">
        <label class="cfg-label wfd-fs9">CHARGER UNE LISTE DE CONTACTS</label>
        <select onchange="chargerListeNotif(this.value,${i})" class="wfd-select-contacts">
          <option value="">\uD83D\uDC65 S\u00E9lectionner une liste...</option>
          ${wfdContacts.map(l=>`<option value="${l.id}">${l.name} — ${l.contacts.length} contact(s)</option>`).join('')}
        </select>
      </div>` : '';

  return `
  <div id="recip-row-${i}" class="wfd-recip-card">

    <!-- En-t\u00EAte : canal + supprimer -->
    <div class="wfd-row-gap10">
      <span class="wfd-recip-icon">${fam.icon}</span>
      <div class="wfd-flex1">
        <div class="cfg-label wfd-fs9 wfd-mb4">CANAL</div>
        <select class="cfg-select notif-channel-sel" data-idx="${i}"
          onchange="changerCanalNotif(${i}, this.value)">
          ${channelOpts}
        </select>
      </div>
      <button onclick="supprimerDestinataire(${i})"
        class="wfd-del-hover wfd-recip-del-btn">\uD83D\uDDD1</button>
    </div>

    <!-- Champs sp\u00E9cifiques au canal -->
    <div id="recip-fields-${i}">
      ${buildChannelFields(ch, cfg, i)}
    </div>

    <!-- Chargement liste contacts (si disponible) -->
    ${listesOpts}

    <!-- Message -->
    <div class="cfg-field">
      <label class="cfg-label wfd-fs9">MESSAGE / CORPS</label>
      <textarea class="cfg-textarea notif-field wfd-textarea-70" data-key="message"
        placeholder="Corps du message. Variables : {asset.title}, {workflow}, {date}...">${cfg.message||''}</textarea>
    </div>

    ${recipSummary ? `<div class="wfd-recip-summary">
      ✓ ${recipSummary}</div>` : ''}
  </div>`;
}

// === Notification: surdéfinition "Message par entrée" =======================
// (source = un nœud du flow · port = l'une de ses sorties)

function buildNotifOverrideRow(i, ov) {
  const flux = (typeof getFluxCourant === 'function') ? getFluxCourant() : null;
  const nodes = (flux?.nodes||[]).filter(n => n.family !== 'postit');
  const nodeOpts = nodes.map(n =>
    `<option value="${n.id}" ${ov.srcId===n.id?'selected':''}>
      ${escHtml(n.name)} (${escHtml(FAMILIES[n.family]?.label||n.family)})
     </option>`).join('');

  // Ports dynamiques en fonction de la source
  let portOpts = '';
  if (ov.srcId) {
    const n = nodes.find(x=>x.id===ov.srcId);
    const ports = n ? (n.ports || buildPortsDef(n.family, n.config||{})) : { outputs:[] };
    portOpts = (ports.outputs||[])
      .map((p,idx)=>`<option value="${idx}" ${String(ov.portIdx)===String(idx)?'selected':''}>
                       ${escHtml(p.label||('port'+idx))}
                     </option>`).join('');
  }

  return `
    <div id="notif-ovr-row-${i}" class="wfd-notif-ovr-card">
      <div>
        <div class="wfd-grid-2-gap6b">
          <div class="cfg-field wfd-m0">
            <label class="cfg-label wfd-fs9">SOURCE</label>
            <select class="cfg-select notif-ovr-src" data-idx="${i}"
                    onchange="notifOverrideSourceChange(${i})">
              <option value="">— Choisir un nœud —</option>${nodeOpts}
            </select>
          </div>
          <div class="cfg-field wfd-m0">
            <label class="cfg-label wfd-fs9">PORT</label>
            <select class="cfg-select notif-ovr-port" data-idx="${i}">
              <option value="">— Sortie —</option>${portOpts}
            </select>
          </div>
        </div>
      </div>
      <div class="cfg-field wfd-m0">
        <label class="cfg-label wfd-fs9">MESSAGE (peut être {variable} seule)</label>
        <textarea class="cfg-textarea notif-ovr-msg wfd-textarea-54" data-idx="${i}"
                  placeholder="{error.message}">${escHtml(ov.message||'')}</textarea>
      </div>
    </div>`;
}

function notifOverrideSourceChange(i) {
  const row = document.getElementById('notif-ovr-row-'+i); if (!row) return;
  const sel = row.querySelector('.notif-ovr-src');
  const portSel = row.querySelector('.notif-ovr-port');
  const srcId = sel?.value || '';
  if (!srcId) { portSel.innerHTML = '<option value="">— Sortie —</option>'; return; }
  const flux = getFluxCourant?.(); if (!flux) return;
  const n = (flux.nodes||[]).find(x=>x.id===srcId);
  const ports = n ? (n.ports || buildPortsDef(n.family, n.config||{})) : { outputs:[] };
  portSel.innerHTML = '<option value="">— Sortie —</option>' +
    (ports.outputs||[]).map((p,idx)=>`<option value="${idx}">${escHtml(p.label||('port'+idx))}</option>`).join('');
}

function lireNotifOverrides(prefix) {
  const c = document.getElementById(prefix+'-notif-overrides'); if (!c) return [];
  return [...c.querySelectorAll('[id^=notif-ovr-row-]')].map(row => ({
    srcId  : row.querySelector('.notif-ovr-src')?.value || '',
    portIdx: row.querySelector('.notif-ovr-port')?.value || '',
    message: row.querySelector('.notif-ovr-msg')?.value || ''
  })).filter(x => x.srcId && x.portIdx !== '');
}

function ajouterNotifOverride() {
  const wrap = document.getElementById('mn-notif-overrides') ||
               document.getElementById('cfg-notif-overrides');
  if (!wrap) return;
  const i = wrap.children.length;
  wrap.insertAdjacentHTML('beforeend', buildNotifOverrideRow(i, {}));
}

function buildScriptPortRow(i, p) {
  return `<div class="decision-condition" id="sport-row-${i}">
    <span class="wfd-sport-idx">${i}</span>
    <input type="text" class="sport-label wfd-input-flex1-basic" value="${p.label||('port'+i)}" placeholder="nom du port">
    <span class="wfd-mono-10-444">\u2192 return { port: '${p.label||('port'+i)}' }</span>
    <button class="btn-del-cond" onclick="supprimerPortScript(${i})">\u00D7</button>
  </div>`;
}

function ajouterDestinataire() {
  const container = document.getElementById('mn-recipients') || document.getElementById('cfg-recipients');
  if (!container) return;
  const i = container.children.length;
  container.insertAdjacentHTML('beforeend', buildRecipientRow(i, { channel:'email', config:{} }));
}

function supprimerDestinataire(i) {
  document.getElementById('recip-row-'+i)?.remove();
}

function changerCanalNotif(i, channel) {
  const row = document.getElementById('recip-row-'+i);
  if (!row) return;

  // Mettre à jour l'icône dans l'en-tête
  const iconEl = row.querySelector('span.wfd-recip-icon');
  if (iconEl) iconEl.textContent = NOTIF_CHANNELS[channel]?.icon || '\uD83D\uDD14';

  // Reconstruire uniquement la zone des champs — pas toute la carte
  const fieldsZone = document.getElementById('recip-fields-'+i);
  if (fieldsZone) fieldsZone.innerHTML = buildChannelFields(channel, {}, i);
}

function ajouterPortScript() {
  const container = document.getElementById('mn-script-ports') || document.getElementById('cfg-script-ports');
  if (!container) return;
  const i = container.children.length;
  container.insertAdjacentHTML('beforeend', buildScriptPortRow(i, { label:'port'+i }));
}

function supprimerPortScript(i) {
  document.getElementById('sport-row-'+i)?.remove();
}

function buildConditionRow(i, c, pfx) {
  const noVal = DECISION_OPS_NO_VALUE.has(c.op||'equals');
  const opOpts = Object.entries(DECISION_OPS)
    .map(([k,v]) => `<option value="${k}" ${(c.op||'equals')===k?'selected':''}>${v}</option>`).join('');
  const colors = ['#2ecc71','#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c','#e67e22','#1abc9c'];
  const color  = colors[i % colors.length];
  return `<div class="decision-condition wfd-cond-grid" id="cond-row-${i}">
    <span class="wfd-cond-dot" style="--dot-color:${color};"></span>
    <select class="cfg-select cond-op wfd-fs11" data-idx="${i}"
      onchange="condOpChange(${i})">
      ${opOpts}
    </select>
    <input class="cfg-input cond-val wfd-mono-sm${noVal?' wfd-hidden':''}" data-idx="${i}"
  list="${pfx}-wfd-var-list"
  value="${escHtml(c.value||'')}" placeholder="valeur ou {variable}"
  id="cond-val-${i}">
    <span id="cond-val-empty-${i}" class="${noVal?'':'wfd-hidden'}"></span>
    <input class="cfg-input cond-label wfd-fs11" data-idx="${i}"
      value="${escHtml(c.label||('Sortie '+(i+1)))}" placeholder="Nom du port">
    <button class="cfg-btn danger wfd-pad-4-6" onclick="supprimerCondition(${i})">×</button>
  </div>`;
}
function ajouterCondition() {
  const container = document.getElementById('mn-conditions') || document.getElementById('cfg-conditions');
  if (!container) return;
  // Retirer le placeholder vide si présent
  const placeholder = container.querySelector('div[style*="color:#444"]');
  if (placeholder) placeholder.remove();
  const i   = container.querySelectorAll('.decision-condition').length;
  const div = document.createElement('div');
  const pfx = container.id.startsWith('mn-') ? 'mn' : 'cfg';
  div.innerHTML = buildConditionRow(i, { op:'equals', value:'', label:'Sortie '+(i+1) }, pfx);
  container.appendChild(div.firstElementChild);
  
// ➕ AJOUTER CES LIGNES :
  const newRow = container.querySelector('.decision-condition:last-child');
  const valInp = newRow ? newRow.querySelector('.cond-val') : null;
  if (valInp) {
    // Sécurité : on (re)pose le list=... (au cas où)
    if (!valInp.getAttribute('list')) valInp.setAttribute('list', `${pfx}-wfd-var-list`);
    // Laisse le DOM "respirer" puis donne le focus et ouvre le dropdown custom
    setTimeout(() => { 
      valInp.focus();
      if (typeof _ouvrirVarDropdown === 'function') _ouvrirVarDropdown(valInp);
    }, 0);
  }
}

function supprimerCondition(i) {
  const el = document.getElementById('cond-row-'+i);
  if (el) el.remove();
  // Renuméroter les data-idx visuellement (les couleurs)
  const container = document.getElementById('mn-conditions') || document.getElementById('cfg-conditions');
  if (!container) return;
  const rows = container.querySelectorAll('.decision-condition');
  if (!rows.length) {
    container.innerHTML = '<div class="wfd-empty-msg-xs">\u2014 Aucune condition, ajoutez des sorties.</div>';
  }
}

function condOpChange(i) {
  const sel   = document.querySelector(`.cond-op[data-idx="${i}"]`);
  const valEl = document.getElementById('cond-val-'+i);
  const emEl  = document.getElementById('cond-val-empty-'+i);
  if (!sel) return;
  const noVal = DECISION_OPS_NO_VALUE.has(sel.value);
  if (valEl) valEl.classList.toggle('wfd-hidden', noVal);
  if (emEl)  emEl.classList.toggle('wfd-hidden', !noVal);
}


function buildExportFields(cfg) {
  const target = cfg.exportTarget || 'file';
  const v = (k, ph='') => `<input class="cfg-input exp-field" data-key="${k}" value="${cfg[k]||''}" placeholder="${ph}">`;
  const f = (lbl, k, ph='', type='input') => `
    <div class="cfg-field">
      <label class="cfg-label">${lbl}</label>
      ${type==='input' ? v(k,ph) : `<textarea class="cfg-textarea exp-field" data-key="${k}" placeholder="${ph}">${cfg[k]||''}</textarea>`}
    </div>`;

  const maps = {
    file: () => f('Chemin de sortie','export-path','ex : /exports/output.mxf'),

    iconik: () => f('Collection cible','ico-col','Chemin de la collection Iconik')
      + f('Format de sortie','ico-fmt','H264, HEVC, ProRes...'),

    s3: () => `
      <div class="cfg-field">
        <label class="cfg-label">Account Type</label>
        <select class="cfg-select exp-field" data-key="s3-account-type">
          ${S3_ACCOUNT_TYPES.map(t=>`<option value="${t}" ${cfg['s3-account-type']===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>`
      + f('Access Key ID','s3-access-key','AKIAIOSFODNN7EXAMPLE')
      + `<div class="cfg-field">
        <label class="cfg-label">Secret Access Key</label>
        <input type="password" class="cfg-input exp-field" data-key="s3-secret-key" value="${cfg['s3-secret-key']||''}" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY">
      </div>`
      + f('Bucket','s3-bucket','my-bucket-name')
      + f('Pr\u00E9fixe / Chemin','s3-prefix','exports/')
      + f('R\u00E9gion','s3-region','us-east-1'),

    ftp: () => f('H\u00F4te','ftp-host','ftp.example.com')
      + f('Port','ftp-port','21')
      + f('Utilisateur','ftp-user','username')
      + `<div class="cfg-field">
        <label class="cfg-label">Mot de passe</label>
        <input type="password" class="cfg-input exp-field" data-key="ftp-pass" value="${cfg['ftp-pass']||''}" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
      </div>`
      + f('Chemin distant','ftp-path','/exports/'),

    sftp: () => f('H\u00F4te','sftp-host','sftp.example.com')
      + f('Port','sftp-port','22')
      + f('Utilisateur','sftp-user','username')
      + `<div class="cfg-field">
        <label class="cfg-label">Mot de passe / Cl\u00E9 priv\u00E9e</label>
        <input type="password" class="cfg-input exp-field" data-key="sftp-pass" value="${cfg['sftp-pass']||''}" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
      </div>`
      + f('Chemin distant','sftp-path','/exports/'),

    youtube: () => f('Client ID','yt-client-id','OAuth2 Client ID')
      + `<div class="cfg-field">
        <label class="cfg-label">Client Secret</label>
        <input type="password" class="cfg-input exp-field" data-key="yt-client-secret" value="${cfg['yt-client-secret']||''}" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
      </div>`
      + f('Refresh Token','yt-refresh-token','Token OAuth2 long-lived')
      + f("Titre","yt-title","Titre de la video")
      + f("Description","yt-desc","Description de la video","textarea")
      + f("Playlist ID","yt-playlist","PLxxxxxxxxxxxxxxxx")
      + `<div class="cfg-field">
        <label class="cfg-label">Visibilit\u00E9</label>
        <select class="cfg-select exp-field" data-key="yt-privacy">
          ${['public','unlisted','private'].map(v=>`<option value="${v}" ${cfg['yt-privacy']===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>`,

    vimeo: () => `<div class="cfg-field">
        <label class="cfg-label">Access Token</label>
        <input type="password" class="cfg-input exp-field" data-key="vi-token" value="${cfg['vi-token']||''}" placeholder="Bearer token Vimeo">
      </div>`
      + f("Titre","vi-title","Titre de la video")
      + f("Description","vi-desc","Description","textarea")
      + f("ID Dossier","vi-folder","ID dossier Vimeo (optionnel)"),

    facebook: () => f('Page ID','fb-page-id','ID de la page Facebook')
      + `<div class="cfg-field">
        <label class="cfg-label">Access Token</label>
        <input type="password" class="cfg-input exp-field" data-key="fb-token" value="${cfg['fb-token']||''}" placeholder="Bearer token Meta">
      </div>`
      + f('Titre','fb-title','Titre')
      + f('Description','fb-desc','Description','textarea'),

    twitter: () => f("API Key","tw-api-key","Consumer API Key")
      + f("API Secret","tw-api-secret","Consumer Secret")
      + f("Access Token","tw-access-token","Token d'acces")
      + f("Access Token Secret","tw-access-secret","Secret du token d'acces"),

    gcs: () => f('Bucket','gcs-bucket','Nom du bucket GCS')
      + f("Prefix","gcs-prefix","exports/")
      + f("JSON Key (chemin ou contenu)","gcs-key","{\"type\":\"service_account\",...}","textarea"),

    post_api: () => f("URL cible","api-url","https://api.example.com/ingest")
      + `<div class="cfg-field">
        <label class="cfg-label">Methode HTTP</label>
        <select class="cfg-select exp-field" data-key="api-method">
          ${['POST','PUT','PATCH'].map(m=>`<option value="${m}" ${cfg['api-method']===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>`
      + f("Content-Type","api-content-type","application/json")
      + `<div class="cfg-field">
        <label class="cfg-label">Headers (JSON)</label>
        <textarea class="cfg-textarea exp-field" data-key="api-headers" placeholder='{"Authorization":"Bearer ...","X-API-Key":"..."}'>${cfg['api-headers']||''}</textarea>
      </div>`
      + `<div class="cfg-field">
        <label class="cfg-label">Body template (variables : {title}, {collection}…)</label>
        <textarea class="cfg-textarea exp-field" data-key="api-body" placeholder='{"title":"{title}","collection":"{collection}"}'>${cfg['api-body']||''}</textarea>
      </div>`,

    azure: () => f("Nom du compte","az-account","my-storage-account")
      + `<div class="cfg-field">
        <label class="cfg-label">Cl\u00E9 d'acc\u00E8s</label>
        <input type="password" class="cfg-input exp-field" data-key="az-key" value="${cfg['az-key']||''}" placeholder="Cl\u00E9 Azure Storage">
      </div>`
      + f("Conteneur","az-container","Nom du conteneur Blob")
      + f("Prefix","az-prefix","exports/"),
  };

  return (maps[target] || maps.file)();
}

function mnActionTypeChange() {
  _actionTypeChange('mn');
}

function cfgActionTypeChange() {
  _actionTypeChange('cfg');
}

function _actionTypeChange(prefix) {
  const sel  = document.getElementById(prefix+'-action-type');
  const key  = sel?.value;
  const info = document.getElementById(prefix+'-action-info');
  const ep   = document.getElementById(prefix+'-action-endpoint');
  const desc = document.getElementById(prefix+'-action-desc');
  if (!key || !ACTION_TYPES[key]) { if(info) info.classList.add('wfd-hidden'); return; }
  const a = ACTION_TYPES[key];
  if(info)  info.classList.remove('wfd-hidden');
  if(ep)    ep.textContent   = a.endpoint;
  if(desc)  desc.textContent = a.desc;

  // Reconstruire le select target selon le type d'action
  const wrap = document.getElementById(prefix+'-target-wrap');
  if (!wrap) return;
  const colOpts  = (wfdData.collections||[]).map(c=>`<option value="${c.id||c.name}">${c.name||c.id}</option>`).join('');
  const viewOpts = (wfdData.mdViews||[]).map(v=>`<option value="${v.id||v.name}">${v.name||v.id}</option>`).join('');
  const teamOpts = (wfdData.teams||[]).map(t=>`<option value="${t.id||t.name}">${t.name||t.id}</option>`).join('');

  // Récupérer la valeur courante avant de reconstruire
  const _colActions2 = ['collection_add_asset','collection_remove_asset','collection_update','collection_delete','acl_set_collection'];
  const prevColVal = document.getElementById(prefix+'-col-selected')?.value || '[]';
  const prevTargetVal = document.getElementById(prefix+'-target')?.value || '';

  let input;
  // Vider le wrap (garder le label)
  const lbl = wrap.querySelector('label');
  while (wrap.lastChild) wrap.removeChild(wrap.lastChild);
  if (lbl) wrap.appendChild(lbl);
  const tmp = document.createElement('div');

  if (_colActions2.includes(key)) {
    if (lbl) lbl.textContent = 'Collection cible';
    const preselected = (function () {
  try {
    const n = getFluxCourant()?.nodes.find(x => x.id === selectedNodeId);
    const ids = Array.isArray(n?.config?.collectionIds)
      ? n.config.collectionIds
      : (n?.config?.target ? [n.config.target] : []);
    if (ids && ids.length) return JSON.stringify(ids);   // priorité à la config
  } catch (_) {}
  return (prevColVal && prevColVal !== '[]') ? prevColVal : ''; // secours : hidden existant
})();
const _colTree = wfdColTreeHtml(prefix, preselected);
    // Récupérer targetVar existante
    const _prevVar = document.getElementById(prefix+'-target-var')?.value
                  || document.getElementById(prefix+'-target-wrap')?.dataset?.savedTargetVar
                  || prevTargetVal || '';
    tmp.innerHTML = `
      <div class="wfd-atm-toggle-wrap">
        <button onclick="mnActionTargetMode('tree')" id="${prefix}-atm-tree"
          class="wfd-atm-btn active-green-soft">🌳 Choisir dans l'arbre</button>
        <button onclick="mnActionTargetMode('var')" id="${prefix}-atm-var"
          class="wfd-atm-btn wfd-atm-btn-r inactive">⚙ Variable / Chemin</button>
      </div>
      <div id="${prefix}-atm-tree-wrap">${_colTree}</div>
      <div id="${prefix}-atm-var-wrap" class="wfd-hidden">
        <input id="${prefix}-target-var" class="cfg-input wfd-mono"
          value="${_prevVar}" placeholder="{targetColPath} ou Bayard Audio/En attente PAD">
        <div class="wfd-hint-top4b">
          Variable ou chemin — résolu + créé automatiquement si absent.
        </div>
      </div>`;
  } else if (['metadata_write','metadata_patch','metadata_collection'].includes(key)) {
    if (lbl) lbl.textContent = 'Vue métadonnées';
    tmp.innerHTML = `<select id="${prefix}-target" class="cfg-select"><option value="">— Vue métadonnées —</option>${viewOpts}</select>`;
  } else if (['acl_set_asset','acl_remove'].includes(key)) {
    if (lbl) lbl.textContent = 'Team / groupe';
    tmp.innerHTML = `<select id="${prefix}-target" class="cfg-select"><option value="">— Team / groupe —</option>${teamOpts}</select>`;
  } else if (key === 'export_location_trigger') {
    if (lbl) lbl.textContent = 'Export Location';
    const elOpts = (wfdData.exportLocations||[]).map(e=>`<option value="${e.id}" ${prevTargetVal===e.id?'selected':''}>${escHtml(e.name||e.id)}</option>`).join('');
    const _cfgNode = (typeof getFluxCourant === 'function') ? getFluxCourant()?.nodes?.find(n => n.id === selectedNodeId) : null;
    const _createFolder = _cfgNode?.config?.createFolderAsset === true;
    const _overwrite    = _cfgNode?.config?.overwrite === true;
    tmp.innerHTML = `
      <select id="${prefix}-target" class="cfg-select">
        <option value="">— Choisir une Export Location —</option>
        ${elOpts}
      </select>
      <div class="wfd-col-gap6-mt8">
        <label class="wfd-checkbox-label">
          <input type="checkbox" id="${prefix}-create-folder-asset" ${_createFolder?'checked':''}>
          Créer un sous-dossier par asset (recommandé)
        </label>
        <label class="wfd-checkbox-label">
          <input type="checkbox" id="${prefix}-overwrite" ${_overwrite?'checked':''}>
          Écraser si déjà présent
        </label>
      </div>
      <div class="cfg-field wfd-mt8">
        <div class="wfd-c-888-10-mb3">Nom du fichier exporté <span class="wfd-c-555">(optionnel — supporte les variables)</span></div>
        <input id="${prefix}-file-name" class="cfg-input wfd-mono-xs" list="${prefix}-wfd-var-list"
          value="${escHtml(_cfgNode?.config?.fileName||'')}"
          placeholder="{Titre} ou nom fixe">
        <div class="wfd-hint-top3">
          Si renseigné, renomme le fichier exporté avec cette valeur
        </div>
      </div>
      <div class="wfd-hint-mt6">
        Le job_id est stocké dans <code>{exportJobId}</code>
      </div>`;
  } else {
    if (lbl) lbl.textContent = 'Cible';
    tmp.innerHTML = `<input id="${prefix}-target" class="cfg-input" value="${prevTargetVal}" placeholder="ID ou référence cible">`;
  }
  Array.from(tmp.children).forEach(c => wrap.appendChild(c));
}

function buildSourceCredentials(cfg) {
  const v = cfg.variant || 's3';
  const pw = (id, lbl, ph) => `
    <div class="cfg-field">
      <label class="cfg-label">${lbl}</label>
      <input type="password" class="cfg-input src-cred" data-key="${id}" value="${cfg[id]||''}" placeholder="${ph}">
    </div>`;
  const tx = (id, lbl, ph) => `
    <div class="cfg-field">
      <label class="cfg-label">${lbl}</label>
      <input type="text" class="cfg-input src-cred" data-key="${id}" value="${cfg[id]||''}" placeholder="${ph}">
    </div>`;

  if (v === 's3') return `
    <div class="cfg-field">
      <label class="cfg-label">Account Type</label>
      <select class="cfg-select src-cred" data-key="s3-account-type">
        ${S3_ACCOUNT_TYPES.map(t=>`<option value="${t}" ${cfg['s3-account-type']===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>`
    + tx('s3-access-key','Access Key ID','AKIAIOSFODNN7EXAMPLE')
    + pw('s3-secret-key','Secret Access Key','wJalrXUtnFEMI...')
    + tx('s3-bucket','Bucket','mon-bucket')
    + tx('s3-prefix','Prefix / Chemin','ingests/')
    + tx('s3-region','Region','us-east-1');

  if (v === 'ftp') return tx('ftp-host','Hote FTP','ftp.example.com')
    + tx('ftp-port','Port','21')
    + tx('ftp-user','Utilisateur','username')
    + pw('ftp-pass','Mot de passe','')
    + tx('ftp-path','Chemin distant','/ingests/');

  if (v === 'sftp') return tx('sftp-host','Hote SFTP','sftp.example.com')
    + tx('sftp-port','Port','22')
    + tx('sftp-user','Utilisateur','username')
    + pw('sftp-pass','Mot de passe / Passphrase','')
    + tx('sftp-path','Chemin distant','/ingests/');

  if (v === 'gcs') return tx('gcs-bucket','Bucket GCS','mon-bucket')
    + tx('gcs-prefix','Prefix','ingests/');

  if (v === 'azure') return tx('az-account','Nom du compte','my-storage-account')
    + pw('az-key','Cle acces Azure','')
    + tx('az-container','Conteneur','ingests')
    + tx('az-prefix','Prefix','');

  return '';
}


// ── Trigger — interactions panneau ───────────────────────────
// Alias cfg- pour le panneau latéral (IDs remplacés par buildConfigBody)
function cfgTriggerEventChange() { _triggerEventChange('cfg'); }
function cfgTriggerCondChange()  { _triggerCondChange('cfg');  }
function cfgSyncTriggerRefs()    { syncTriggerRefs();          }
function cfgVariantChange()      { mnVariantChange();          }

function mnTriggerEventChange() { _triggerEventChange('mn'); }
function mnTriggerCondChange()  { _triggerCondChange('mn');  }

function _triggerEventChange(pfx) {
  const val = document.getElementById(pfx+'-event-type')?.value;
  const ev  = TRIGGER_EVENTS[val];
  const fields = ev?.fields || [];
  const show = id => { const el=document.getElementById(pfx+'-'+id); if(el) el.style.display=''; };
  const hide = id => { const el=document.getElementById(pfx+'-'+id); if(el) el.style.display='none'; };

  hide('trigger-field-wrap');
  hide('trigger-cond-wrap');
  hide('trigger-col-wrap');
  hide('trigger-ca-wrap');
  hide('trigger-wh-wrap');
  hide('trigger-status-wrap');
  hide('trigger-job-wrap');
  hide('trigger-mdview-wrap');

  if (fields.includes('field'))            show('trigger-field-wrap');
  if (fields.includes('condition'))        show('trigger-cond-wrap');
  if (fields.includes('collection'))       show('trigger-col-wrap');
  if (fields.includes('custom_action_id')) show('trigger-ca-wrap');
  if (fields.includes('webhook_id'))       show('trigger-wh-wrap');
  if (fields.includes('status_value'))     show('trigger-status-wrap');
  if (fields.includes('job_type'))         show('trigger-job-wrap');
  if (fields.includes('mdview'))           show('trigger-mdview-wrap');
}

function _triggerCondChange(pfx) {
  const cond  = document.getElementById(pfx+'-trigger-condition')?.value;
  const valEl = document.getElementById(pfx+'-trigger-value');
  if (valEl) valEl.style.display = TRIGGER_CONDITIONS_NO_VALUE.has(cond) ? 'none' : '';
}

function mnListenerConnChange() { _listenerConnChange('mn'); }
function cfgListenerConnChange(){ _listenerConnChange('cfg'); }
function _listenerConnChange(pfx) {
  const id   = document.getElementById(pfx+'-listener-conn')?.value;
  const conn = wfdConnexions.find(c=>c.id===id);
  const wrap = document.getElementById(pfx+'-listener-map-wrap');
  const sel  = document.getElementById(pfx+'-listener-mapping');
  if (!wrap || !sel) return;
  wrap.style.display = conn ? '' : 'none';
  // Sauvegarder la valeur actuelle avant de reconstruire
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">— Aucun (payload brut) —</option>' +
    (conn?.mappings||[]).map(m=>`<option value="${m.id}">${escHtml(m.name)}</option>`).join('');
  // Restaurer la sélection si elle existe encore dans la liste
  if (prevVal) sel.value = prevVal;
}

// (remplacé par _triggerEventChange / _triggerCondChange ci-dessus)

async function syncTriggerRefs() {
  toast('Actualisation…');
  try {
    // Fetch direct Iconik — temps réel, sans passer par le snapshot
    const env = getEnvironnements().find(e => e.name === currentEnvName);
    if (env) {
      const headers = { 'App-ID': env.appId, 'Auth-Token': env.token };
      const _envSlug = encodeURIComponent(env.name || env.environment || 'default');
      const res = await fetch('/api/iconik/' + _envSlug + '/API/assets/v1/custom_actions/?per_page=500');
      if (res.ok) {
        const data = await res.json();
        wfdData.customActions = data.objects || [];
      }
    }
  } catch(e) { /* fetch optionnel */ }
  chargerIconikData();
  // Repeupler les selects sans reconstruire le panneau
  for (const pfx of ['mn','cfg']) {
    const caEl = document.getElementById(pfx+'-custom-action-id');
    const whEl = document.getElementById(pfx+'-webhook-id');
    if (caEl) {
      const cur = caEl.value;
      caEl.innerHTML = '<option value="">— Sélectionner —</option>' +
        wfdData.customActions.map(a=>`<option value="${a.id||a.nom}" ${(a.id||a.nom)===cur?'selected':''}>${escHtml(a.title||a.nom||a.name||a.id)}</option>`).join('');
    }
    if (whEl) {
      const cur = whEl.value;
      whEl.innerHTML = '<option value="">— Sélectionner —</option>' +
        wfdData.webhooks.map(w=>`<option value="${w.id||w.nom}" ${(w.id||w.nom)===cur?'selected':''}>${escHtml(w.nom||w.name||w.id)}</option>`).join('');
    }
  }
  toast('Actualisé ✓ (' + wfdData.customActions.length + ' CA · ' + wfdData.webhooks.length + ' webhooks)');
}

function _mediaTypeChange(pfx) {
  const val  = document.getElementById(pfx+'-media-type')?.value;
  const wrap = document.getElementById(pfx+'-sidecar-wrap');
  if (wrap) wrap.classList.toggle('wfd-hidden', !(val==='sidecar'||val==='sidecar_only'));
}
function mnMediaTypeChange()  { _mediaTypeChange('mn');  }
function cfgMediaTypeChange() { _mediaTypeChange('cfg'); }


function mnRenameModeChange() { _renameModeChange('mn'); }
function cfgRenameModeChange(){ _renameModeChange('cfg'); }
function _renameModeChange(pfx) {
  const mode = document.getElementById(pfx+'-rename-mode')?.value || 'rules';
  const rw = document.getElementById(pfx+'-rename-rules-wrap');
  const tw = document.getElementById(pfx+'-rename-tpl-wrap');
  if (rw) rw.classList.toggle('wfd-hidden', mode==='template');
  if (tw) tw.classList.toggle('wfd-hidden', mode==='rules');
}

function mnRenamePreview() { _renamePreview('mn'); }
function cfgRenamePreview(){ _renamePreview('cfg'); }
function _renamePreview(pfx) {
  const input   = document.getElementById(pfx+'-rename-test')?.value || '';
  const out     = document.getElementById(pfx+'-rename-preview');
  if (!out) return;
  const mode    = document.getElementById(pfx+'-rename-mode')?.value || 'rules';
  const nomId   = document.getElementById(pfx+'-nommage-id')?.value;
  const tpl     = document.getElementById(pfx+'-rename-template')?.value || '';
  let result    = input;
  try {
    if (mode !== 'template' && nomId) {
      const n = wfdNommages.find(x => x.id === nomId);
      if (n) result = appliquerReglesNommage(result, n.steps, {});
    }
    if (mode !== 'rules' && tpl) {
      result = tpl.replace(/\{(\w+)\}/g, (_, k) => result);
    }
    out.textContent = result || '—';
    out.style.color = '#27ae60';
  } catch(e) {
    out.textContent = '⚠ ' + e.message;
    out.style.color = '#e74c3c';
  }
}


function mnActionTargetMode(mode) {
  const treeWrap = document.getElementById('mn-atm-tree-wrap') || document.getElementById('cfg-atm-tree-wrap');
  const varWrap  = document.getElementById('mn-atm-var-wrap')  || document.getElementById('cfg-atm-var-wrap');
  const btnTree  = document.getElementById('mn-atm-tree') || document.getElementById('cfg-atm-tree');
  const btnVar   = document.getElementById('mn-atm-var')  || document.getElementById('cfg-atm-var');
  const isVar = mode === 'var';
  if (treeWrap) treeWrap.classList.toggle('wfd-hidden', isVar);
  if (varWrap)  varWrap.classList.toggle('wfd-hidden', !isVar);
  if (btnTree)  { btnTree.classList.toggle('active-green-soft', !isVar); btnTree.classList.toggle('inactive', isVar); }
  if (btnVar)   { btnVar.classList.toggle('active-blue-soft',  isVar);  btnVar.classList.toggle('inactive', !isVar); }
}

function mnFetchVarPreview(val) {
  const v = val || 'asset';
  const el = document.getElementById('mn-fetch-var-preview') || document.getElementById('cfg-fetch-var-preview');
  if (el) el.textContent = 'Ex : {' + v + '.metadata.titre}';
}

function mnFetchTypeChange()  { _fetchTypeChange('mn');  }
function cfgFetchTypeChange() { _fetchTypeChange('cfg'); }
function _fetchTypeChange(pfx) {
  const type  = document.getElementById(pfx+'-fetch-type')?.value || 'asset';
  const varEl = document.getElementById(pfx+'-fetch-var');
  // Suggérer un nom de variable par défaut selon le type
  if (varEl && !varEl.value || varEl?.value === 'asset' || varEl?.value === 'collection') {
    if (varEl) varEl.value = type === 'collection' ? 'collection' : 'asset';
  }
  // Chemin pertinent seulement pour collection
  const byEl = document.getElementById(pfx+'-fetch-by');
  if (byEl && type === 'asset') {
    // Masquer l'option 'path' pour les assets
    [...byEl.options].forEach(o => {
      if (o.value === 'path') o.disabled = type === 'asset';
    });
    if (byEl.value === 'path') byEl.value = 'id';
  }
  _fetchByChange(pfx);
}

function mnFetchByChange()  { _fetchByChange('mn');  }
function cfgFetchByChange() { _fetchByChange('cfg'); }
function _fetchByChange(pfx) {
  const by    = document.getElementById(pfx+'-fetch-by')?.value || 'id';
  const label = document.getElementById(pfx+'-fetch-value-label');
  const input = document.getElementById(pfx+'-fetch-value');
  const metaW = document.getElementById(pfx+'-fetch-meta-wrap');

  const labels = {
    id      : 'ID (variable {asset_id} ou valeur fixe)',
    title   : 'Titre / Nom (partiel accepté)',
    ref     : 'Référence externe',
    path    : 'Chemin de collection (ex: {serie}/{saison})',
    metadata: 'Valeur à rechercher dans le champ',
  };
  const placeholders = {
    id      : '{asset_id}',
    title   : '{titre}  ou  Mon Film',
    ref     : '{external_id}',
    path    : '{serie}/{saison}/{episode}',
    metadata: '{valeur}',
  };
  if (label) label.textContent = labels[by] || 'Valeur';
  if (input) input.placeholder = placeholders[by] || '';
  if (metaW) metaW.style.display = by === 'metadata' ? '' : 'none';
}

function _variantChange(pfx) {
  const v               = document.getElementById(pfx+'-variant')?.value;
  const showCredentials = ['s3','ftp','sftp','gcs','azure'].includes(v);
  const showMapping     = v === 'sidecar';
  const showEndpoint    = ['api','webhook','automation'].includes(v);
  const showMdView      = ['api','webhook'].includes(v);
  const el = id => document.getElementById(pfx+'-'+id);

  const rowMapping     = el('row-mapping');
  const rowEndpoint    = el('row-endpoint');
  const rowMdView      = el('row-mdview');
  const rowFormats     = el('row-formats');
  const rowCredentials = el('row-credentials');

  if (rowMapping)     rowMapping.style.display    = showMapping     ? 'block' : 'none';
  if (rowEndpoint)    rowEndpoint.style.display    = showEndpoint    ? 'block' : 'none';
  if (rowMdView)      rowMdView.style.display      = showMdView      ? 'block' : 'none';
  if (rowFormats)     rowFormats.style.display     = showCredentials ? 'none'  : 'block';
  if (rowCredentials) {
    rowCredentials.style.display = showCredentials ? 'block' : 'none';
    if (showCredentials) rowCredentials.innerHTML = buildSourceCredentials({ variant: v });
  }
}
function mnVariantChange()  { _variantChange('mn');  }
function cfgVariantChange() { _variantChange('cfg'); }

function mnExportTargetChange() {
  const t = document.getElementById('mn-export-target')?.value;
  document.getElementById('mn-export-fields').innerHTML = buildExportFields({ exportTarget:t });
}

function cfgExportTargetChange() {
  const t = document.getElementById('cfg-export-target')?.value;
  const fields = buildExportFields({ exportTarget:t }).replace(/id="mn-/g, 'id="cfg-');
  document.getElementById('cfg-export-fields').innerHTML = fields;
}



function lireDestinataires(containerId) {
  const container =
    document.getElementById(containerId) ||
    document.getElementById(containerId.replace('mn-','cfg-'));
  if (!container) return [];
  return [...container.querySelectorAll('[id^=recip-row-]')].map(row => {
    const sel = row.querySelector('.notif-channel-sel');
    const channel = sel?.value || 'email';
    const cfg = {};
    row.querySelectorAll('.notif-field').forEach(el => {
      if (el.dataset.key) cfg[el.dataset.key] = el.value;
    });
    return { channel, config: cfg };
  });
}

function lirePortsScript(containerId) {
  const container = document.getElementById(containerId)
    || document.getElementById(containerId.replace('mn-','cfg-'));
  if (!container) return [];
  return [...container.querySelectorAll('.decision-condition')].map(row => ({
    label: row.querySelector('.sport-label')?.value || 'port'
  }));
}



function ouvrirConfigPanel(node) {
  // Bloquer en mode lecture seule (flux actif)
  if (document.getElementById('wfd-canvas-wrap')?.dataset?.readonly === '1') return;
  selectedNodeId = node.id;
  // Notifier le Quick Access panel pour rafraîchir les variables contextuelles
  document.dispatchEvent(new CustomEvent('wfd:node-selected', { detail: { nodeId: node.id } }));
  const panel = document.getElementById('wfd-config-panel');
  const fam = FAMILIES[node.family];
  // Peupler le header avec icône + champ nom éditable
  const iconEl = document.getElementById('wfd-config-icon');
  const nameEl = document.getElementById('cfg-node-name');
  if (iconEl) iconEl.textContent = fam.icon || '';
  if (nameEl) {
    nameEl.value = node.name || '';
    nameEl.placeholder = fam.label;
  }

  // Toujours recharger les données Iconik avant d'afficher
  chargerIconikData();

  const body = document.getElementById('wfd-config-body');
  body.innerHTML = buildConfigBody(node);

  // Initialiser le drag & drop pour http_sequence
  if (node.family === 'http_sequence') {
    setTimeout(function() { hseqInitDrag('cfg'); }, 0);
  }

  // Initialiser la vue API du Lookup si applicable
  if (node.family === 'lookup' && typeof lkRenderApiPanel === 'function') {
    setTimeout(lkRenderApiPanel, 0);
  }

  // Passer en mode large pour trigger/listener (plus de champs)
  if (['trigger','listener','watchfolder','aps_search'].includes(node.family)) {
    panel.classList.add('panel-wide');
  } else {
    panel.classList.remove('panel-wide');
  }
  panel.classList.add('open');
  // Pour aps_search : écouter les sélections de collections et déclencher srAutoSave
  if (node.family === 'aps_search') {
    // Retirer le listener précédent si existant
    if (panel._srColListener) panel.removeEventListener('wfd:col-selected', panel._srColListener);
    panel._srColListener = (e) => {
      // Synchroniser col-selected → sr-crit-val pour srReadBlocks
      const { prefix, selIds } = e.detail;
      const colSelected = document.getElementById(prefix + '-col-selected');
      const critRow = colSelected?.closest('.sr-crit-row');
      if (critRow) {
        const srCritVal = critRow.querySelector('.sr-crit-val');
        if (srCritVal) srCritVal.value = JSON.stringify(selIds);
      }
      if (typeof srAutoSave === 'function') srAutoSave('cfg');
    };
    panel.addEventListener('wfd:col-selected', panel._srColListener);
  }
  configDirty = false;

  // ── Restaurer la case "Nouvelle page (export)" ─────────────
  const _pbChk = document.getElementById('cfg-page-break-before');
  if (_pbChk) _pbChk.checked = !!(node.config && node.config.pageBreakBefore);

  // Forcer l'affichage des champs contextuels selon l'état actuel.
  // Ces appels font des innerHTML= et reconstruisent des portions du DOM.
  if (node.family === 'trigger')    _triggerEventChange('cfg');
  if (node.family === 'listener')   _listenerConnChange('cfg');
  if (node.family === 'fetch')      { _fetchTypeChange('cfg'); _fetchByChange('cfg'); }
  if (node.family === 'rename')     _renameModeChange('cfg');
  if (node.family === 'relate')     { _relTypeChange('cfg'); _relDirChange('cfg'); }
  if (node.family === 'export_file') _efTargetChange('cfg');
  if (node.family === 'publish')    _pubTargetChange('cfg');
  if (node.family === 'transcode')  _tcPresetChange('cfg');
  if (node.family === 'subflow')    { _sfModeChange('cfg'); _sfCtxChange('cfg');  }
  if (node.family === 'publish') {
  setTimeout(() => _hydratePublish('cfg', node.config || {}), 0);
} 
  if (node.family === 'export_file') {
  setTimeout(() => _hydrateExportFile('cfg', node.config || {}), 0);
}
  if (node.family === 'notification') {
  setTimeout(() => _hydrateNotification('cfg', node.config || {}), 0);
}
  if (node.family === 'link_file')  { _lfTypeChange('cfg'); _lfFormatChange('cfg'); }
  if (node.family === 'acl')        { _aclTargetChange('cfg'); _aclOpChange('cfg'); }
  if (node.family === 'workflow_history') {
    setTimeout(() => whUpdatePreview('cfg'), 0);
  }
  if (node.family === 'update_meta'){
    _umModeChange('cfg'); _umTargetChange('cfg');
    // Capturer le nodeId au moment de l'ouverture pour éviter les sauvegardes sur le mauvais nœud
    const _umOpenedNodeId = node.id;
    setTimeout(() => {
      // Ne pas exécuter si le nœud actif a changé entre temps
      if (selectedNodeId !== _umOpenedNodeId) return;
      _umEnhanceValInputs('cfg');
      // Adapter les widgets valeur selon le type de champ MD (avec restauration de la valeur)
      // Désactiver temporairement sauvegarderConfig pendant l'init des widgets
      const _origSaveCfg = window.sauvegarderConfig;
      window.sauvegarderConfig = () => {};
      document.querySelectorAll('#cfg-um-fields .um-field-key').forEach(sel => {
        if (!sel.value) return;
        const idx    = sel.dataset.idx;
        const valEl  = document.querySelector('#cfg-um-fields .um-field-val[data-idx="' + idx + '"]');
        const saved  = valEl?.value || '';
        umUpdateValueWidget(sel, saved);
      });
      window.sauvegarderConfig = _origSaveCfg;
    }, 0);
  }
  if (node.family === 'action') {
    // Stocker targetVar dans le wrap pour que _actionTypeChange puisse la restaurer
    const _aWrap = document.getElementById('cfg-target-wrap');
    if (_aWrap && node.config?.targetVar) _aWrap.dataset.savedTargetVar = node.config.targetVar;
    _actionTypeChange('cfg');
    if (node.config?.targetMode === 'var') mnActionTargetMode('var');
    // Restaurer la valeur targetVar dans le champ
    if (node.config?.targetVar) {
      const _tvInput = document.getElementById('cfg-target-var');
      if (_tvInput) _tvInput.value = node.config.targetVar;
    }
  }

  // Pas de focus() programmatique sur le panel — en Electron/Chromium,
  // focus() sur un div container inhibe le premier clic sur les inputs enfants.
  // Le contexte de saisie est ancré par l'interaction utilisateur qui a ouvert le panel.
}


// ══════════════════════════════════════════════════════════════════════════════
// buildCfgFields(pfx, family, cfg)
// Génère le HTML des champs de configuration pour une famille donnée.
// pfx = 'mn' (modale création) ou 'cfg' (panel config latéral)
// ══════════════════════════════════════════════════════════════════════════════
// ── APS Search — helpers date/between (définis avant buildCfgFields) ──────────
function srBuildValInput(fd, crit, pfx, idx, ci) {
  const hasVal = !['is_empty','is_not_empty','is_true','is_false'].includes(crit.op||'equals');
  if (!hasVal) return '<input class="cfg-input sr-crit-val wfd-hidden">';
  const isDate = (fd && fd.type === 'date') || ['date_created','date_modified'].includes(crit.field||'');
  const dp = 'data-pfx="' + pfx + '" data-bidx="' + idx + '" data-cidx="' + ci + '"';
  if (isDate && crit.op === 'between') {
    const parts = (crit.value||'|').split('|');
    return '<input type="date" class="cfg-input sr-crit-val-from sr-date-input wfd-date-dark" ' + dp + ' value="' + (parts[0]||'') + '">'
         + '<span class="wfd-arrow-sep">&#8594;</span>'
         + '<input type="date" class="cfg-input sr-crit-val-to sr-date-input wfd-date-dark" ' + dp + ' value="' + (parts[1]||'') + '">'
         + '<input type="hidden" class="sr-crit-val" value="' + (crit.value||'') + '">';
  } else if (isDate) {
    return '<input type="date" class="cfg-input sr-crit-val sr-date-input wfd-date-dark-flex2" ' + dp + ' value="' + (crit.value||'') + '">';
  } else {
    return '<input class="cfg-input sr-crit-val wfd-input-flex2-mono10" value="' + (crit.value||'').replace(/"/g,'&quot;') + '" placeholder="valeur" data-pfx="' + pfx + '" oninput="srAutoSave(this.dataset.pfx)">';
  }
}

// Listener délégué pour les date inputs (évite les problèmes oninput inline dans date picker natif)
document.addEventListener('change', function(e) {
  if (!e.target.classList.contains('sr-date-input')) return;
  const el  = e.target;
  const pfx = el.dataset.pfx;
  if (!pfx) return;
  if (el.classList.contains('sr-crit-val')) {
    srAutoSave(pfx);
  } else {
    const row = el.closest('.sr-crit-row');
    if (!row) return;
    const from   = row.querySelector('.sr-crit-val-from')?.value || '';
    const to     = row.querySelector('.sr-crit-val-to')?.value   || '';
    const hidden = row.querySelector('.sr-crit-val');
    if (hidden) hidden.value = from + '|' + to;
    srAutoSave(pfx);
  }
});

function buildCfgFields(pfx, family, cfg) {
  cfg = cfg || {};
  let html = '';

  // ── POSTIT ──────────────────────────────────────────────────────────────────
  if (family === 'postit') {
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Texte / Description</label>
      <textarea id="${pfx}-postit-text" class="cfg-textarea wfd-textarea-80"
        placeholder="Étape externe, note, contrainte, question...">${cfg.text||''}</textarea>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Couleur</label>
      <div class="wfd-tags-wrap">
        ${['#f1c40f','#e74c3c','#3498db','#27ae60','#9b59b6','#e67e22','#95a5a6'].map(col=>
          `<div onclick="selectPostitColor('${col}')" class="wfd-color-swatch${cfg.color===col?' color-selected':''}" style="--swatch-color:${col};" data-color="${col}"></div>`
        ).join('')}
      </div>
    </div>`;

  // ── CAST ────────────────────────────────────────────────────────────────────
  } else if (family === 'cast') {
    const autos = wfdData.automations.map(a=>`<option value="auto::${a.nom||a.name}" ${cfg.ref===`auto::${a.nom||a.name}`?'selected':''}>${a.nom||a.name}</option>`).join('');
    const whs   = wfdData.webhooks.map(w=>`<option value="wh::${w.name||w.nom}" ${cfg.ref===`wh::${w.name||w.nom}`?'selected':''}>${w.name||w.nom}</option>`).join('');
      html += buildEnvSelector(pfx, cfg);
  html += `
    <div class="cfg-field">
      <label class="cfg-label">Élément Iconik référencé</label>
      <select id="${pfx}-ref" class="cfg-select">
        <option value="">— Sélectionnez —</option>
        <optgroup label="Automations">${autos}</optgroup>
        <optgroup label="Webhooks">${whs}</optgroup>
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Notes</label>
      <textarea id="${pfx}-notes" class="cfg-textarea">${cfg.notes||''}</textarea>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Description de ce nœud...">${cfg.description||''}</textarea>
    </div>`;

  // ── LOOP ─────────────────────────────────────────────────────────────────────
  } else if (family === 'loop') {
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Source des éléments à itérer</label>
      <select id="${pfx}-loop-source" class="cfg-select" onchange="_loopSourceChange('${pfx}')">
        <option value="files"      ${cfg.loopSource==='files'      ?'selected':''}>📄 Fichiers de l'asset entrant</option>
        <option value="assets"     ${cfg.loopSource==='assets'     ?'selected':''}>🎬 Assets d'une collection</option>
        <option value="collection" ${cfg.loopSource==='collection' ?'selected':''}>📁 Sous-collections</option>
        <option value="list"       ${cfg.loopSource==='list'       ?'selected':''}>📋 Liste manuelle (JSON)</option>
        <option value="metadata"   ${cfg.loopSource==='metadata'   ?'selected':''}>🏷 Valeurs d'un champ multi-valeur</option>
      </select>
    </div>    
    <div id="${pfx}-loop-source-fields">
       ${buildLoopSourceFields(pfx, cfg)}
    </div>

    <div class="wfd-grid-2-gap8">
      <div class="cfg-field">
        <label class="cfg-label">Concurrence max</label>
        <input id="${pfx}-loop-concurrency" type="number" class="cfg-input"
          value="${cfg.concurrency||1}" min="1" max="20" placeholder="1 = séquentiel">
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Si erreur sur un élément</label>
        <select id="${pfx}-loop-onerror" class="cfg-select">
          <option value="stop"     ${cfg.onError==='stop'    ?'selected':''}>Stopper la boucle</option>
          <option value="continue" ${cfg.onError==='continue'?'selected':''}>Continuer (ignorer)</option>
          <option value="port"     ${cfg.onError==='port'    ?'selected':''}>Sortie Erreur dédiée</option>
        </select>
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Variable exposée dans les nœuds enfants</label>
      <input id="${pfx}-loop-var" class="cfg-input" value="${cfg.loopVar||'item'}"
        placeholder="item — accessible via {loop.item}, {loop.index}, {loop.total}">
    </div>`;

  // ── SCRIPT ────────────────────────────────────────────────────────────────────
  } else if (family === 'script') {
    const lang  = cfg.lang  || 'javascript';
    const ports = cfg.ports || [{ label:'success' }, { label:'error' }];
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Langage</label>
      <select id="${pfx}-script-lang" class="cfg-select">
        ${Object.entries(SCRIPT_LANGS).map(([k,v])=>`<option value="${k}" ${lang===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div>
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label">PORTS DE SORTIE</span>
        <button class="btn-add-cond" onclick="ajouterPortScript()">+ Port</button>
      </div>
      <div id="${pfx}-script-ports">
        ${ports.map((p,i) => buildScriptPortRow(i, p)).join('')}
      </div>
    </div>
    <div class="wfd-mt8">
      <button class="cfg-btn primary wfd-w100pct" onclick="ouvrirEditeurScript()">
        </> Éditer le script
      </button>
      <div class="wfd-script-preview">
        ${cfg.code ? cfg.code.split('\n').slice(0,2).join(' | ').slice(0,80)+'...' : 'Aucun code'}
      </div>
    </div>`;

  // ── TRANSFORM ──────────────────────────────────────────────────────────────────
  } else if (family === 'transform') {
    const rules = cfg.rules || [];
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Champ cible (métadonnée à générer)</label>
      <input id="${pfx}-tr-target" class="cfg-input" value="${cfg.target||''}"
        placeholder="ex : title, filename, custom_name...">
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Séparateur</label>
      <input id="${pfx}-tr-sep" class="cfg-input" value="${cfg.separator||'_'}"
        placeholder="_ ou - ou espace...">
    </div>
    <div class="wfd-row-sb-mb6">
      <span class="cfg-label">COMPOSITION DU CHAMP</span>
      <button class="btn-add-cond" onclick="ajouterRegleTransform()">+ Ajouter</button>
    </div>
    <div id="${pfx}-tr-rules">
      ${rules.length ? rules.map((r,i)=>buildTransformRuleRow(i,r, pfx)).join('') : buildTransformRuleRow(0,{}, pfx)}
    </div>
    <div class="wfd-tr-grid-2col">
      <div class="cfg-field">
        <label class="cfg-label">Casse</label>
        <select id="${pfx}-tr-case" class="cfg-select">
          <option value="upper"  ${cfg.caseMode==='upper' ?'selected':''}>MAJUSCULES</option>
          <option value="lower"  ${cfg.caseMode==='lower' ?'selected':''}>minuscules</option>
          <option value="none"   ${cfg.caseMode==='none'  ?'selected':''}>Inchangée</option>
        </select>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Longueur max (0 = illimité)</label>
        <input id="${pfx}-tr-maxlen" type="number" class="cfg-input" value="${cfg.maxLen||80}" min="0" placeholder="80">
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Aperçu (exemple)</label>
      <div id="${pfx}-tr-preview" class="wfd-tr-preview">
        —
      </div>
    </div>`;

  // ── RENAME ──────────────────────────────────────────────────────────────────
  } else if (family === 'rename') {
    const nomOpts  = wfdNommages.map(n =>
      `<option value="${n.id}" ${cfg.nommageId===n.id?'selected':''}>${escHtml(n.name)}</option>`).join('');
    const allMeta  = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Mode</label>
      <select id="${pfx}-rename-mode" class="cfg-select" onchange="_renameModeChange('${pfx}')">
        <option value="rules"    ${(cfg.mode||'rules')==='rules'  ?'selected':''}>🔤 Règles de nommage (Ressources)</option>
        <option value="template" ${cfg.mode==='template'          ?'selected':''}>📝 Template métadonnées</option>
        <option value="both"     ${cfg.mode==='both'              ?'selected':''}>🔤 + 📝 Règles puis Template</option>
      </select>
    </div>
    <div id="${pfx}-rename-rules-wrap" class="cfg-field${cfg.mode==='template'?' wfd-hidden':''}">
      <label class="cfg-label">Règle de nommage</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-nommage-id" class="cfg-select wfd-flex1">
          <option value="">— Sélectionner une règle —</option>${nomOpts}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="ouvrirRessources('nommage')" title="Gérer les règles">⚙</button>
      </div>
    </div>
    <div id="${pfx}-rename-tpl-wrap" class="cfg-field${cfg.mode==='rules'?' wfd-hidden':''}">
      <label class="cfg-label">Template de nom</label>
      <input id="${pfx}-rename-template" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
  value="${escHtml(cfg.template||'')}"
  placeholder="{titre}-{année}-v{version}.{ext}">
      <datalist id="${pfx}-rename-meta-list">${allMeta.map(m=>`<option value="{${m}}">`).join('')}</datalist>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Sauvegarder l'ancien nom dans</label>      
      <input id="${pfx}-rename-backup" class="cfg-input" list="${pfx}-wfd-var-list"
  value="${escHtml(cfg.backupField||'')}" placeholder="ex : {original_filename}">
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Test rapide</label>
      <div class="wfd-row-gap6c">
        <input id="${pfx}-rename-test" class="cfg-input wfd-rename-test-input"
          placeholder="Texte de test…" oninput="_renamePreview('${pfx}')">
        <span class="wfd-c-444">→</span>
        <div id="${pfx}-rename-preview" class="wfd-rename-preview"></div>
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Notes…">${escHtml(cfg.description||'')}</textarea>
    </div>`;

  // ── RELATE ──────────────────────────────────────────────────────────────────
  } else if (family === 'relate') {
    html += _buildRelatePanel(pfx, cfg);

  // ── SUBFLOW ─────────────────────────────────────────────────────────────────
  } else if (family === 'subflow') {
    html += _buildSubflowPanel(pfx, cfg);

  // ── ACL ──────────────────────────────────────────────────────────────────────
  } else if (family === 'acl') {
    html += _buildAclPanel(pfx, cfg, wfdData);
	
  // ── QC/Validate ──────────────────────────────────────────────────────────────────────	
  } else if (family === 'qc') {
  const rules   = Array.isArray(cfg.rules)   ? cfg.rules   : [];
  const outputs = Array.isArray(cfg.outputs) ? cfg.outputs : [
    { label:'Pass',    color:'#27ae60' },
    { label:'Fail',    color:'#e74c3c' },
    { label:'Warning', color:'#f39c12' }
  ];

  const preselected = Array.isArray(cfg.qcCollectionIds)
  ? cfg.qcCollectionIds
  : (cfg.qcCollection ? [cfg.qcCollection] : []);

    html += buildEnvSelector(pfx, cfg);
  html += `
    <div>
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label">RÈGLES DE CONTRÔLE</span>
        <button class="btn-add-cond" onclick="ajouterRegleQC()">+ Règle</button>
      </div>
      
    <div id="${pfx}-qc-rules">
      ${rules.length ? rules.map((r,i)=>buildQCRuleRow(i,r, pfx)).join('') : buildQCRuleRow(0,{}, pfx)}
    </div>

    </div>

    <div class="wfd-mt4">
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label">SORTIES</span>
        <button class="btn-add-cond" onclick="ajouterSortieQC()">+ Sortie</button>
      </div>
      <div id="${pfx}-qc-outputs">
        ${outputs.map((o,i)=>buildQCOutputRow(i,o)).join('')}
      </div>
    </div>
 
    <div class="cfg-field">
      <label class="cfg-label">Collection</label>
      ${wfdColTreeHtml(`${pfx}-qc`, JSON.stringify(preselected))}
    </div> 		
    <div class="cfg-field">
      <label class="cfg-label">Mode d'évaluation</label>
      <select id="${pfx}-qc-mode" class="cfg-select">
        <option value="all" ${cfg.mode==='all'?'selected':''}>Toutes les règles doivent passer (AND)</option>
        <option value="any" ${cfg.mode==='any'?'selected':''}>Au moins une règle doit passer (OR)</option>
      </select>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Description optionnelle...">${escHtml(cfg.description||'')}</textarea>
    </div>
  `;
  

  // ── ACTION ──────────────────────────────────────────────────────────────────────	
  } else if (family === 'action') {
  const actionOpts = Object.entries(ACTION_TYPES)
    .map(([k,v]) => `<option value="${k}" ${cfg.actionType===k?'selected':''}>${v.label}</option>`).join('');
  const selAction = cfg.actionType && ACTION_TYPES[cfg.actionType] ? ACTION_TYPES[cfg.actionType] : null;

    html += buildEnvSelector(pfx, cfg);
  html += `
    <div class="cfg-field">
      <label class="cfg-label">Type d'action (API Iconik)</label>
      <select id="${pfx}-action-type" class="cfg-select" onchange="${pfx==='mn'?'mnActionTypeChange()':'cfgActionTypeChange()'}">
        <option value="">— Sélectionner —</option>
        ${actionOpts}
      </select>
    </div>

    <div id="${pfx}-action-info" class="wfd-action-info-card${selAction?'':' wfd-hidden'}">
      <div class="wfd-action-endpoint" id="${pfx}-action-endpoint">${selAction?.endpoint||''}</div>
      <div class="wfd-action-desc" id="${pfx}-action-desc">${selAction?.desc||''}</div>
    </div>

    <div class="cfg-field" id="${pfx}-target-wrap">
      <label class="cfg-label" id="${pfx}-target-label">Cible</label>
      <input id="${pfx}-target" class="cfg-input" value="${escHtml(cfg.target||'')}" placeholder="ID ou référence cible">
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Valeur à écrire (si applicable)</label>
      <textarea id="${pfx}-action-value" class="cfg-textarea" placeholder="Valeur JSON ou texte simple selon l'action">${escHtml(cfg.actionValue||'')}</textarea>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Notes</label>
      <textarea id="${pfx}-notes" class="cfg-textarea">${escHtml(cfg.notes||'')}</textarea>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Description optionnelle...">${escHtml(cfg.description||'')}</textarea>
    </div>
  `;
``
	
  // ── PANELS REPRISES DU "OLD" (mêmes builders, archi actuelle) ───────────────
} else if (family === 'export_file') {
  html += _buildExportFilePanel(pfx, cfg);

} else if (family === 'publish') {
  html += _buildPublishPanel(pfx, cfg);

} else if (family === 'notify_post') {
  html += _buildNotifyPostPanel(pfx, cfg);

} else if (family === 'transcode') {
  html += _buildTranscodePanel(pfx, cfg);

} else if (family === 'create_asset') {
  html += _buildCreateAssetPanel(pfx, cfg, wfdData);

} else if (family === 'create_col') {
  html += _buildCreateColPanel(pfx, cfg, wfdData);

} else if (family === 'link_file') {
  html += _buildLinkFilePanel(pfx, cfg, wfdData);

} else if (family === 'update_meta') {
  html += _buildUpdateMetaPanel(pfx, cfg, wfdData);

// ── NOTIFICATION (canaux + champs spécifiques) ──────────────────────────────
} else if (family === 'notification') {
  const recipients = Array.isArray(cfg.recipients) && cfg.recipients.length
    ? cfg.recipients : [{ channel:'teams', config:{} }];
  const rules   = Array.isArray(cfg.rules)      ? cfg.rules      : [];
  const autoMode= cfg.autoMode !== false; // true par défaut

    html += buildEnvSelector(pfx, cfg);
  html += `
    <!-- ── Mode automatique ─────────────────────────────── -->
    <div class="cfg-field" style="background:#0d1a0d;border:1px solid #1a3a1a;border-radius:6px;padding:10px 12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="${pfx}-auto-mode" ${autoMode?'checked':''}
          onchange="wfdMsgAutoMode('${pfx}')">
        <div>
          <div style="font-size:12px;color:#5dbb6b;font-weight:600;">Composition automatique</div>
          <div style="font-size:10px;color:#4a7a4a;margin-top:2px;">
            Le message est composé depuis les erreurs du flux —
            🟢 succès · 🟡 avertissements · 🔴 échec
          </div>
        </div>
      </label>
    </div>

    <!-- ── Titre personnalisé ────────────────────────────── -->
    <div class="cfg-field">
      <label class="cfg-label">TITRE DU MESSAGE <span class="wfd-label-9-555">(optionnel)</span></label>
      <input id="${pfx}-msg-title" class="cfg-input" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.title||'')}"
        placeholder="ex: {asset.title} — laisser vide pour le titre automatique">
    </div>

    <!-- ── Corps personnalisé ────────────────────────────── -->
    <div class="cfg-field" id="${pfx}-body-wrap" style="${autoMode?'display:none':''}">
      <label class="cfg-label">CORPS DU MESSAGE</label>
      <textarea id="${pfx}-msg-body" class="cfg-textarea wfd-textarea-mono"
        placeholder="Variables : {asset.title}, {vars.targetColPath}, {context.errors}...">${escHtml(cfg.bodyTemplate||'')}</textarea>
    </div>

    <!-- ── Règles spécifiques ─────────────────────────────── -->
    <div style="margin-top:12px;">
      <div class="wfd-row-sb-mb6">
        <span class="cfg-label">RÈGLES SPÉCIFIQUES <span class="wfd-label-9-555">— prioritaires sur la composition auto</span></span>
        <button class="btn-add-cond" onclick="wfdMsgAddRule('${pfx}')">+ Règle</button>
      </div>
      <div id="${pfx}-msg-rules">
        ${rules.length
          ? rules.map((r,i) => buildMsgRuleRow(pfx, i, r)).join('')
          : '<div style="font-size:10px;color:#444;padding:6px 0;">Aucune règle — le message automatique s\'applique toujours</div>'}
      </div>
    </div>

    <!-- ── Canaux ─────────────────────────────────────────── -->
    <div style="margin-top:12px;">
      <div class="wfd-row-sb-mb6">
        <span class="cfg-label">CANAUX D'ENVOI</span>
        <button class="btn-add-cond" onclick="ajouterDestinataire()">+ Canal</button>
      </div>
      <div id="${pfx}-recipients">
        ${recipients.map((r,i) => buildRecipientRow(i, r)).join('')}
      </div>
    </div>
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  `;

} else if (family === 'http_request') {
  const _httpMode = cfg.httpMode || 'simple';
  const outConns = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : [])
    .filter(c => c.direction === 'outbound' || (!c.direction && !c.endpoint));
  const connOpts = outConns.map(c =>
    `<option value="${c.id}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name)} — ${escHtml(c.baseUrl||'')}</option>`
  ).join('');
  const HTTP_METHODS = ['GET','POST','PUT','PATCH','DELETE'];
  const methodOpts = HTTP_METHODS.map(m =>
    `<option value="${m}" ${(cfg.method||'POST')===m?'selected':''}>${m}</option>`
  ).join('');

  html += `
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}

    <!-- Sélecteur de mode -->
    <div id="${pfx}-http-modebar" data-mode="${_httpMode}" class="wfd-httpmode-bar">
      ${['action','simple','foreach','verify'].map((m,i) => {
        const labels = {action:'Action', simple:'Requête simple', foreach:'Pour chaque valeur', verify:'Vérifier'};
        const active = _httpMode === m;
        return `<button onclick="wfdHttpModeChange('${pfx}','${m}')"
          id="${pfx}-httpmode-${m}"
          class="wfd-httpmode-btn${i>0?' wfd-httpmode-btn-bl':''} ${active?'active-blue':'inactive-btn'}">${labels[m]}</button>`;
      }).join('')}
    </div>

    <!-- Connexion (commune à tous les modes) -->
    <div class="cfg-field">
      <label class="cfg-label">Connexion API</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-connexion-select" class="cfg-select wfd-flex1" onchange="wfdHttpConnChange('${pfx}')">
          <option value="">— Sélectionner une connexion —</option>
          ${connOpts}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="ouvrirRessources('connexions')">⚙</button>
      </div>
      ${!outConns.length ? '<div class="wfd-http-noconn">Aucune connexion sortante — créez-en une dans Ressources</div>' : ''}
    </div>

    <!-- ── MODE ACTION ─────────────────────────────────────────────────── -->
    <div id="${pfx}-http-action" class="${_httpMode!=='action'?'wfd-hidden':''}">
      ${(function() {
        // Récupérer les actions de la connexion sélectionnée
        const _selConn = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : [])
          .find(c => c.id === cfg.connexionId);
        const _actions = _selConn?.actions || [];

        if (!_actions.length) {
          return `<div class="wfd-http-noaction">
            <div class="wfd-mb8">Cette connexion n'a pas encore d'actions configurées.</div>
            <button class="cfg-btn wfd-fs11" onclick="ouvrirRessources('connexions')">
              ⚙ Configurer dans Ressources
            </button>
          </div>`;
        }

        const _actionOpts = _actions.map(a =>
          `<option value="${a.id}" ${cfg.actionId===a.id?'selected':''}>${escHtml(a.name)} — ${escHtml(a.method)} ${escHtml(a.endpoint)}</option>`
        ).join('');

        return `
          <div class="cfg-field">
            <label class="cfg-label">Action à exécuter</label>
            <select id="${pfx}-http-action-select" class="cfg-select" onchange="httpActionChange('${pfx}')">
              <option value="">— Sélectionner une action —</option>
              ${_actionOpts}
            </select>
          </div>

          <!-- Vue mapping Lookup → Champs API pour l'action sélectionnée -->
          ${(function() {
            // Lire l'actionId depuis le DOM si disponible (après changement dropdown)
            const _domActionId = typeof document !== 'undefined'
              ? document.getElementById(pfx + '-http-action-select')?.value
              : null;
            const _resolvedActionId = _domActionId || cfg.actionId;
            const _selAction = _actions.find(a => a.id === _resolvedActionId);
            if (!_selAction) return '';

            // Récupérer les lignes du Lookup du flux courant
            const _flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
            const _lkNode = (_flux?.nodes||[]).find(n => n.family === 'lookup');
            const _lkRows = _lkNode?.config?.lkRows || [];

            // Champs de la spec pour cet endpoint
            const _specFields = _selAction._specFields || [];
            const _specFieldPaths = new Set(_specFields.map(f => f.path));

            // Lignes du Lookup qui correspondent aux champs de l'endpoint
            const _relevantRows = _lkRows.filter(r =>
              !_selAction._specFields?.length || _specFieldPaths.has((r.value||'').split('.')[0])
            );

            const _methodColor = _selAction.method === 'POST' ? '#2ecc71' : _selAction.method === 'PATCH' ? '#f39c12' : '#3498db';
            const _methodBg    = _selAction.method === 'POST' ? '#0d2b1a' : _selAction.method === 'PATCH' ? '#2b1a00' : '#0a1a2b';

            return `
            <div class="wfd-code-block-ov">
              <!-- Header endpoint -->
              <div class="wfd-lkmap-hdr">
                <span class="wfd-lkmap-method" style="--method-color:${_methodColor};--method-bg:${_methodBg};">${escHtml(_selAction.method)}</span>
                <span class="wfd-lkmap-endpoint">${escHtml(_selAction.endpoint)}</span>
                <span class="wfd-lkmap-mode">${escHtml(_selAction.mode||'simple')}</span>
              </div>
              <!-- Header colonnes -->
              <div class="wfd-lkmap-cols">
                <span class="wfd-section-up2">Champ Iconik</span>
                <span class="wfd-section-up2">Champ API</span>
                <span class="wfd-section-up2">Valeur (au run)</span>
              </div>
              <!-- Lignes de mapping -->
              ${_relevantRows.length ? _relevantRows.map(r => `
                <div class="wfd-lkmap-row">
                  <span class="wfd-lkmap-key">${escHtml(r.key||r.src||'')}</span>
                  <span class="wfd-lkmap-val">${escHtml(r.value||r.tgt||'')}${r.list?'<span class="wfd-lkmap-list-tag">[]</span>':''}</span>
                  <span class="wfd-lkmap-run">{run}</span>
                </div>`).join('') :
                `<div class="wfd-lkmap-empty">
                  Configurez la Table de correspondance dans le nœud Lookup
                </div>`}
              <!-- Footer -->
              ${_selAction.resultVar ? `
              <div class="wfd-lkmap-footer">
                Résultat stocké dans : <span class="wfd-lkmap-resultvar">{${escHtml(_selAction.resultVar)}}</span>
              </div>` : ''}
            </div>`;
          })()}

`;
      })()}
    </div>

    <!-- ── MODE SIMPLE ──────────────────────────────────────────────────── -->
    <div id="${pfx}-http-simple" class="${_httpMode!=='simple'?'wfd-hidden':''}">
      <div class="cfg-field">
        <label class="cfg-label">Requête</label>
        <div class="wfd-row-gap6c">
          <select id="${pfx}-http-method" class="cfg-select wfd-w100-shrink">
            ${HTTP_METHODS.map(m=>`<option value="${m}" ${(cfg.method||'GET')===m?'selected':''}>${m}</option>`).join('')}
          </select>
          <input id="${pfx}-http-endpoint" class="cfg-input wfd-flex1-mono12"
            value="${escHtml(cfg.endpoint||'')}"
            placeholder="/api/contents/{asset_id}">
        </div>
      </div>
      <div id="${pfx}-http-body-wrap"
        class="cfg-field${['GET','DELETE'].includes(cfg.method||'GET')?' wfd-hidden':''}">
        <div class="wfd-row-sb-mb6">
          <label class="cfg-label wfd-m0">Body JSON</label>
          <div class="wfd-row-gap6c">
            <button onclick="httpBodyDetectVars('${pfx}')"
              class="wfd-http-detect-btn">
              ⚡ Détecter les variables
            </button>
            <button onclick="httpBodyToggleRaw('${pfx}')"
              id="${pfx}-body-raw-btn"
              class="wfd-http-rawtoggle-btn ${cfg.bodyRaw?'active-blue':'inactive-btn'}">
              { } JSON brut
            </button>
          </div>
        </div>

        <!-- Zone tags (mode builder) -->
        <div id="${pfx}-body-builder" class="${cfg.bodyRaw?'wfd-hidden':''}">
          <!-- Tags des variables sélectionnées -->
          <div id="${pfx}-body-tags" class="wfd-body-tags-wrap">
            ${(cfg.bodyTags||[]).map((t,i) => `
              <div class="http-body-tag wfd-http-tag" data-idx="${i}" data-var="${escHtml(t.var)}" data-spread="${t.spread?'1':'0'}"
                style="--tag-bg:${t.spread?'#0a1a0a':'#0a0d14'};--tag-border:${t.spread?'#2d5a2d':'#1e3a5a'};">
                <span class="wfd-http-tag-name" style="--tag-color:${t.spread?'#5dbb6b':'#7ec8e3'};">${escHtml(t.var)}</span>
                ${!t.spread ? `<span class="wfd-c-555-10">→</span>
                  <input class="http-tag-alias wfd-http-tag-alias-input" data-idx="${i}" value="${escHtml(t.alias||t.var)}"
                    title="Nom de clé dans le JSON"
                    style="--alias-width:${Math.max(40,(t.alias||t.var).length*7)}px;"
                    oninput="httpBodyPreview('${pfx}')">` : ''}
                ${t.spread ? '<span class="wfd-http-tag-spread-badge">étendu</span>' : ''}
                <button onclick="httpBodyRemoveTag('${pfx}',${i})"
                  class="wfd-http-tag-del-btn">&times;</button>
              </div>`).join('')}
            ${!(cfg.bodyTags||[]).length ?
              '<span style="color:#444;font-size:11px;line-height:26px;">Cliquez sur ⚡ pour détecter les variables disponibles</span>' : ''}
          </div>

          <!-- Aperçu JSON généré -->
          <div class="wfd-body-preview-wrap">
            <div class="wfd-body-preview-hdr">
              <span>APERÇU</span>
              <span id="${pfx}-body-preview-status" class="wfd-c-555"></span>
            </div>
            <pre id="${pfx}-body-preview" class="wfd-body-preview-pre">${escHtml(cfg.bodyPreview||'{ }')}</pre>
          </div>
        </div>

        <!-- Zone JSON brut (mode avancé) -->
        <div id="${pfx}-body-raw" class="${!cfg.bodyRaw?'wfd-hidden':''}">
          <textarea id="${pfx}-http-body" class="cfg-textarea wfd-body-raw-textarea" rows="6"
            placeholder='{"title":"{title}","external_id":"{asset_id}"}'>${escHtml(cfg.body||'')}</textarea>
          <div class="wfd-hint-top3">
            Mode avancé — les variables <code>{varName}</code> sont interpolées à l'exécution.
          </div>
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Headers additionnels</label>
        <div id="${pfx}-http-headers-list">
          ${(cfg.extraHeaders||[]).map((h,i) => `
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <input class="cfg-input http-xhdr-key wfd-flex1" value="${escHtml(h.key)}" placeholder="Clé">
              <input class="cfg-input http-xhdr-val wfd-flex2b" value="${escHtml(h.value)}" placeholder="Valeur ou {var}">
              <button class="cfg-btn danger" style="padding:4px 8px;" onclick="this.parentElement.remove()">✕</button>
            </div>`).join('')}
        </div>
        <button class="cfg-btn wfd-mt4" onclick="httpAjouterHeader('${pfx}')">+ Header</button>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Sauver la réponse dans</label>
        <input id="${pfx}-http-result-var" class="cfg-input wfd-mono"
          value="${escHtml(cfg.resultVar||'http_response')}"
          list="${pfx}-wfd-var-list">
        <div class="wfd-hint-top3">
          Accès : <code class="wfd-c-green2">{http_response.status}</code> · <code class="wfd-c-green2">{http_response.body}</code>
        </div>
      </div>
      <div class="cfg-field" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:5px;padding:10px;">
        <label class="cfg-label">Ports de sortie</label>
        <div style="font-size:11px;color:#888;margin-top:4px;display:flex;flex-direction:column;gap:3px;">
          <div><span class="wfd-c-green3">●</span> <strong>Succès</strong> — 2xx</div>
          <div><span class="wfd-c-red2">●</span> <strong>Erreur</strong> — 4xx / 5xx ou timeout</div>
        </div>
      </div>
    </div>

    <!-- ── MODE FOREACH ─────────────────────────────────────────────────── -->
    <div id="${pfx}-http-foreach" class="${_httpMode!=='foreach'?'wfd-hidden':''}">

      <div class="cfg-field">
        <label class="cfg-label">Variable source (champ Iconik multi-valeur)</label>
        <div class="wfd-row-gap6b">
          <input id="${pfx}-fe-source-var" class="cfg-input wfd-flex1-mono" list="wfd-lk-field-source"
            value="${escHtml(cfg.feSourceVar||'')}"
            placeholder="{Réalisateur}">
          <button class="cfg-btn wfd-fe-detect-trigger-btn" onclick="httpForeachDetect('${pfx}')">
            ⚡ Détecter
          </button>
        </div>
      </div>

      <div id="${pfx}-fe-detect-result" class="wfd-fe-detect-result-box wfd-hidden"></div>

      <div class="wfd-grid-2-gap8">
        <div class="cfg-field">
          <label class="cfg-label">Séparateur</label>
          <input id="${pfx}-fe-separator" class="cfg-input wfd-mono"
            value="${escHtml(cfg.feSeparator !== undefined ? cfg.feSeparator : ', ')}" placeholder=", ">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Variable locale dans le body</label>
          <input id="${pfx}-fe-local-name" class="cfg-input wfd-mono"
            value="${escHtml(cfg.feLocalName||'nom')}" placeholder="nom">
        </div>
      </div>

      <div class="cfg-field wfd-fe-transforms-box">
        <div class="cfg-label wfd-mb6b">Transformations disponibles dans le body</div>
        <div class="wfd-fe-transforms-list">
          <div><span class="wfd-c-blue2">{{nom}}</span> <span class="wfd-c-555">→ valeur brute</span> <span class="wfd-c-444-10">ex: Jean Dupont</span></div>
          <div><span class="wfd-c-slug">{{slug(nom)}}</span> <span class="wfd-c-555">→ slug normalisé</span> <span class="wfd-c-444-10">ex: jean-dupont</span></div>
          <div><span class="wfd-c-index">{{index}}</span> <span class="wfd-c-555">→ position</span> <span class="wfd-c-444-10">0, 1, 2…</span></div>
        </div>
        <div class="wfd-fe-transforms-hint">Les variables WFD <code>{varName}</code> fonctionnent aussi dans le body.</div>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Requête</label>
        <div class="wfd-row-gap6c">
          <select id="${pfx}-fe-method" class="cfg-select wfd-w100-shrink">
            ${HTTP_METHODS.map(m=>`<option value="${m}" ${(cfg.method||'POST')===m?'selected':''}>${m}</option>`).join('')}
          </select>
          <input id="${pfx}-fe-endpoint" class="cfg-input wfd-flex1-mono12"
            value="${escHtml(cfg.endpoint||'')}"
            placeholder="/api/persons">
        </div>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Body JSON (par valeur)</label>
        <textarea id="${pfx}-fe-body" class="cfg-textarea wfd-mono-sm2" rows="5"
          placeholder='{"name":"{{nom}}","external_id":"{{slug(nom)}}","job":"director"}'>${escHtml(cfg.feBody||'')}</textarea>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Rôle VodFactory (job) — ajouté au tableau résultat</label>
        <select id="${pfx}-fe-job" class="cfg-select">
          ${['director','actor','producer','writer','creator'].map(j =>
            `<option value="${j}" ${(cfg.feJob||'director')===j?'selected':''}>${j}</option>`
          ).join('')}
        </select>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Codes HTTP à ignorer (ex: 409 = déjà existant)</label>
        <input id="${pfx}-fe-ignore-codes" class="cfg-input wfd-mono"
          value="${escHtml((cfg.feIgnoreCodes||[409,422]).join(', '))}"
          placeholder="409, 422">
        <div class="wfd-hint-top3">
          Si 409 : la valeur est quand même collectée avec son slug comme external_id.
        </div>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Si erreur non ignorée</label>
        <select id="${pfx}-fe-on-error" class="cfg-select">
          <option value="continue" ${(cfg.feOnError||'continue')==='continue'?'selected':''}>Continuer et noter</option>
          <option value="stop"     ${cfg.feOnError==='stop'?'selected':''}>Stopper la boucle</option>
        </select>
      </div>

      <div class="cfg-field">
        <label class="cfg-label">Champ à collecter dans la réponse API</label>
        <input id="${pfx}-fe-collect-field" class="cfg-input wfd-mono"
          value="${escHtml(cfg.feCollectField||'external_id')}"
          placeholder="external_id">
        <div class="wfd-hint-top3">Si absent, le slug est utilisé comme fallback.</div>
      </div>

      <div class="cfg-field wfd-fe-result-store-box">
        <label class="cfg-label wfd-c-green4-mb6">Stocker le tableau résultat dans</label>
        <div class="wfd-row-gap6c">
          <span class="wfd-mono-teal">{</span>
          <input id="${pfx}-fe-result-var" class="cfg-input wfd-input-green"
            value="${escHtml(cfg.feResultVar||'personsPayload')}">
          <span class="wfd-mono-teal">}</span>
        </div>
        <div class="wfd-hint-top4b">
          Tableau <code>[{ nom, external_id, slug, job }]</code> — utilisable directement dans le body POST contenu.
        </div>
      </div>

      <!-- Aperçu pré-run -->
      <div class="wfd-mt8">
        <button onclick="httpForeachPreview('${pfx}')" class="cfg-btn wfd-fe-preview-btn">
          👁 Aperçu — simuler les appels
        </button>
        <div id="${pfx}-fe-preview" class="wfd-fe-preview-box wfd-hidden"></div>
      </div>
    </div>

    <!-- ── MODE VERIFY ──────────────────────────────────────────────────── -->
    <div id="${pfx}-http-verify" class="${_httpMode!=='verify'?'wfd-hidden':''}">
      <div class="cfg-field">
        <label class="cfg-label">Endpoint à vérifier</label>
        <div class="wfd-row-gap6c">
          <select id="${pfx}-vf-method" class="cfg-select wfd-w100-shrink">
            ${HTTP_METHODS.map(m=>`<option value="${m}" ${(cfg.method||'GET')===m?'selected':''}>${m}</option>`).join('')}
          </select>
          <input id="${pfx}-vf-endpoint" class="cfg-input wfd-flex1-mono12"
            value="${escHtml(cfg.endpoint||'')}"
            placeholder="/api/contents/{asset_id}/action-statuses">
        </div>
      </div>
      <div class="wfd-grid-2-gap8">
        <div class="cfg-field">
          <label class="cfg-label">Chemin du champ à vérifier</label>
          <input id="${pfx}-vf-check-path" class="cfg-input wfd-mono-sm2"
            value="${escHtml(cfg.vfCheckPath||'')}"
            placeholder="results.amazon.status">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Valeur attendue</label>
          <input id="${pfx}-vf-check-value" class="cfg-input wfd-mono"
            value="${escHtml(cfg.vfCheckValue||'')}"
            placeholder="success">
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Sauver la réponse dans</label>
        <input id="${pfx}-vf-result-var" class="cfg-input wfd-mono"
          value="${escHtml(cfg.resultVar||'verify_result')}"
          list="${pfx}-wfd-var-list">
      </div>
      <div class="cfg-field" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:5px;padding:10px;">
        <label class="cfg-label">Ports de sortie</label>
        <div style="font-size:11px;color:#888;margin-top:4px;display:flex;flex-direction:column;gap:3px;">
          <div><span class="wfd-c-green3">●</span> Condition remplie</div>
          <div><span class="wfd-c-orange2">●</span> Condition non remplie</div>
          <div><span class="wfd-c-red2">●</span> Erreur HTTP ou réseau</div>
        </div>
      </div>
    </div>
  `;

  // Masquer/afficher body selon méthode (mode simple)
  document.addEventListener('change', function _httpMethodChange(e) {
    if (e.target && e.target.id === `${pfx}-http-method`) {
      const noBody = ['GET','DELETE'].includes(e.target.value);
      const wrap = document.getElementById(`${pfx}-http-body-wrap`);
      if (wrap) wrap.classList.toggle('wfd-hidden', noBody);
      document.removeEventListener('change', _httpMethodChange);
    }
  });


} else if (family === 'gate') {
  const _gMode  = cfg.gateMode     || 'throttle';
  const _gMax   = cfg.maxConcurrent !== undefined ? cfg.maxConcurrent : 3;
  const _gDel   = cfg.delayMs       !== undefined ? cfg.delayMs / 1000 : 5;
  const _gPMsg  = cfg.pauseMessage  || 'Vérification manuelle requise';
  const _gAuto  = cfg.pauseAutoResume || false;
  const _gAutoS = cfg.pauseAutoResumeAfterSec || 60;
  const _gModes = [
    ['throttle','🚦','Throttle',    'Limite les jobs simultanés'],
    ['delay',   '⏳','Délai',       'Attend N secondes'],
    ['pause',   '⏸','Pause',       'Attend une validation'],
  ];
  html += `
    <div class="cfg-field">
      <label class="cfg-label">Mode</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
        ${_gModes.map(([val,icon,label,hint]) => `
          <button onclick="wfdGateModeChange('${pfx}','${val}')" id="${pfx}-gate-mode-${val}"
            style="padding:8px 4px;border-radius:6px;cursor:pointer;text-align:center;transition:all .15s;
              border:2px solid ${_gMode===val?'#e67e22':'#2a2a2a'};
              background:${_gMode===val?'rgba(230,126,34,0.15)':'transparent'};
              color:${_gMode===val?'#e67e22':'#666'};">
            <div style="font-size:18px;">${icon}</div>
            <div style="font-size:11px;font-weight:600;margin-top:3px;">${label}</div>
            <div style="font-size:9px;color:#555;margin-top:2px;">${hint}</div>
          </button>`).join('')}
      </div>
    </div>

    <div id="${pfx}-gate-throttle-wrap" style="${_gMode==='throttle'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Jobs simultanés maximum</label>
        <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;">
          <input id="${pfx}-gate-max-concurrent" type="number" min="1" max="50"
            class="cfg-input" value="${_gMax}" oninput="wfdGateUpdateSummary('${pfx}')">
          <span class="wfd-text-555-11b">en parallèle</span>
        </div>
        <div class="cfg-hint">Si la limite est atteinte, les jobs suivants attendent. Port <strong>Bloqué</strong> pour les jobs retenus.</div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Si file pleine</label>
        <select id="${pfx}-gate-overflow" class="cfg-select">
          <option value="queue"  ${(cfg.throttleOverflow||'queue')==='queue' ?'selected':''}>📥 File d'attente</option>
          <option value="skip"   ${cfg.throttleOverflow==='skip'             ?'selected':''}>⏭ Ignorer</option>
          <option value="reject" ${cfg.throttleOverflow==='reject'           ?'selected':''}>❌ Rejeter</option>
        </select>
      </div>
    </div>

    <div id="${pfx}-gate-delay-wrap" style="${_gMode==='delay'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Durée de l'attente</label>
        <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;">
          <input id="${pfx}-gate-delay-sec" type="number" min="0" step="0.5"
            class="cfg-input" value="${_gDel}">
          <span class="wfd-text-555-11b">secondes</span>
        </div>
        <div class="cfg-hint">Pause avant le nœud suivant. Utile après un transcodage pour attendre le proxy.</div>
      </div>
    </div>

    <div id="${pfx}-gate-pause-wrap" style="${_gMode==='pause'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Message à l'opérateur</label>
        <textarea id="${pfx}-gate-pause-msg" class="cfg-textarea" rows="3"
          placeholder="Ex: Vérifiez les métadonnées avant de continuer…">${escHtml(_gPMsg)}</textarea>
        <div class="cfg-hint">Ce message apparaît dans le run log. L'opérateur clique <strong>Continuer</strong> pour reprendre.</div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Reprise automatique</label>
        <div style="display:flex;gap:10px;align-items:center;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="${pfx}-gate-pause-auto" ${_gAuto?'checked':''}
              style="width:14px;height:14px;"
              onchange="wfdGatePauseAutoToggle('${pfx}')">
            <span style="font-size:12px;color:#ccc;">Reprendre après</span>
          </label>
          <input id="${pfx}-gate-pause-auto-sec" type="number" min="10"
            class="cfg-input wfd-w80" value="${_gAutoS}" ${_gAuto?'':'disabled'}>
          <span class="wfd-text-555-11b">secondes</span>
        </div>
      </div>
    </div>

    <div style="margin-top:10px;padding:10px 14px;background:rgba(230,126,34,0.08);
      border:1px solid rgba(230,126,34,0.2);border-radius:6px;font-size:12px;color:#e67e22;">
      <span style="font-size:10px;color:#666;display:block;margin-bottom:3px;">CE NŒUD VA</span>
      <span id="${pfx}-gate-summary-text" style="font-weight:600;">
        ${_wfdGateSummary(_gMode,_gMax,_gDel,_gPMsg,_gAuto,_gAutoS)}
      </span>
    </div>

    <div class="cfg-field wfd-mt8">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Notes…">${escHtml(cfg.description||'')}</textarea>
    </div>
  `;

} else if (family === 'approval') {
  const approvers = Array.isArray(cfg.approvers) ? cfg.approvers : [];
  html += `
    <div class="cfg-field">
      <label class="cfg-label">Titre de la demande</label>
      <input id="${pfx}-appr-title" class="cfg-input"
             value="${escHtml(cfg.title||'')}"
             placeholder="Demande d'approbation — {asset.title}">
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Instructions pour l'approbateur</label>
      <textarea id="${pfx}-appr-desc" class="cfg-textarea"
                placeholder="Décrivez ce qui doit être vérifié...">${escHtml(cfg.description||'')}</textarea>
    </div>

    <div>
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label">APPROBATEURS</span>
        <button class="btn-add-cond" onclick="ajouterApprobateur()">+ Ajouter</button>
      </div>
      <div id="${pfx}-approvers">
        ${approvers.length ? approvers.map((a,i)=>buildApproverRow(i,a)).join('') : buildApproverRow(0,{type:'email'})}
      </div>
    </div>

    <div class="wfd-grid-2-gap8">
      <div class="cfg-field">
        <label class="cfg-label">Timeout (heures)</label>
        <input id="${pfx}-appr-timeout" type="number" class="cfg-input"
               value="${typeof cfg.timeout==='number'?cfg.timeout:48}" min="1" placeholder="48">
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Action si timeout</label>
        <select id="${pfx}-appr-timeout-action" class="cfg-select">
          <option value="timeout_port" ${cfg.timeoutAction==='timeout_port'?'selected':''}>Sortie Timeout</option>
          <option value="auto_approve" ${cfg.timeoutAction==='auto_approve'?'selected':''}>Approuver automatiquement</option>
          <option value="auto_reject" ${cfg.timeoutAction==='auto_reject'?'selected':''}>Refuser automatiquement</option>
        </select>
      </div>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Canal de notification</label>
      <select id="${pfx}-appr-notif-channel" class="cfg-select">
        ${Object.entries(NOTIF_CHANNELS).map(([k,v]) =>
           `<option value="${k}" ${cfg.notifChannel===k?'selected':''}>${v.icon} ${v.label}</option>`
        ).join('')}
      </select>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Message de notification</label>
      <textarea id="${pfx}-appr-notif-msg" class="cfg-textarea"
                placeholder="{asset.title} attend votre approbation. Cliquez le lien pour décider.">${escHtml(cfg.notifMessage||'')}</textarea>
    </div>
  `;

  // ── FETCH ────────────────────────────────────────────────────────────────────
  } else if (family === 'fetch') {
    const allViews = wfdData.mdViews || [];
    const allMeta  = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
    const subType  = cfg.fetchSubType || 'asset';
    const source   = cfg.fetchSource  || (cfg.fetchBy === 'metadata' ? 'metadata' : cfg.fetchBy === 'title' ? 'title' : cfg.fetchBy === 'id' ? 'id' : 'triggered');
    const viewOpts = allViews.map(v =>
      `<option value="${v.id||v.name}" ${(cfg.metadataViewId||cfg.fetchMdViewId)===(v.id||v.name)?'selected':''}>${escHtml(v.name||v.id)}</option>`
    ).join('');
    const metaOpts = allMeta.map(f =>
      `<option value="${f}" ${(cfg.metadataFields||[]).includes(f)?'selected':''}>${escHtml(f)}</option>`
    ).join('');
      html += buildEnvSelector(pfx, cfg);
  html += `
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
    <div class="cfg-field">
      <label class="cfg-label">QUE VOULEZ-VOUS RÉCUPÉRER ?</label>
      <div style="display:flex;gap:6px;margin-top:4px;">
        ${[['asset','🎬','Un asset'],['collection','📁','Une collection'],['metadata','🏷️','Des métadonnées'],['savedsearch','🔍','Saved Search']].map(([val,icon,lbl])=>`
          <button onclick="wfdFetchSubType('${pfx}','${val}')" id="${pfx}-subtype-${val}"
            style="flex:1;padding:8px 6px;border-radius:6px;cursor:pointer;font-size:11px;text-align:center;
            border:1px solid ${subType===val?'#3498db':'#2a2a2a'};
            background:${subType===val?'#0a1a2a':'#0d0d0d'};
            color:${subType===val?'#3498db':'#555'};">
            <div style="font-size:16px;margin-bottom:3px;">${icon}</div>${lbl}
          </button>`).join('')}
      </div>
    </div>
    <div id="${pfx}-fetch-asset" style="${subType==='asset'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">LEQUEL ?</label>
        <select id="${pfx}-fetch-source-asset" class="cfg-select" onchange="wfdFetchSourceChange('${pfx}')">
          <option value="triggered" ${(source==='triggered'||source==='id'&&!cfg.fetchValue)?'selected':''}>L'asset qui a déclenché le workflow</option>
          <option value="id"        ${source==='id'&&cfg.fetchValue?'selected':''}>Un asset par son ID</option>
          <option value="title"     ${source==='title'?'selected':''}>Un asset par son titre</option>
        </select>
      </div>
      <div id="${pfx}-fetch-value-wrap" style="${!cfg.fetchValue?'display:none':''}">
        <div class="cfg-field">
          <label class="cfg-label">ID / TITRE</label>
          <input id="${pfx}-fetch-value" class="cfg-input" list="${pfx}-wfd-var-list"
            value="${escHtml(cfg.fetchValue||'')}" placeholder="{asset.id} ou valeur fixe">
        </div>
      </div>
      <div class="cfg-field wfd-mt4">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;">
          <input type="checkbox" id="${pfx}-with-meta" ${cfg.withMetadata?'checked':''} onchange="wfdFetchOptionsChange('${pfx}')">
          <span class="wfd-fs11">Charger ses métadonnées</span>
        </label>
        <div id="${pfx}-meta-view-wrap" style="${cfg.withMetadata?'':'display:none'}">
          <select id="${pfx}-meta-view" class="cfg-select wfd-mt4">
            <option value="">— Toutes les vues —</option>${viewOpts}
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="${pfx}-with-cols" ${cfg.withCollections?'checked':''}>
          <span class="wfd-fs11">Charger ses collections parentes</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px;">
          <input type="checkbox" id="${pfx}-with-keyframes" ${cfg.withKeyframes?'checked':''}>
          <span class="wfd-fs11">Charger ses keyframes (vignettes)</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px;">
          <input type="checkbox" id="${pfx}-with-formats" ${cfg.withFormats?'checked':''}>
          <span class="wfd-fs11">Charger les métadonnées techniques (durée, qualité vidéo, codec…)</span>
        </label>
      </div>
    </div>
    <div id="${pfx}-fetch-collection" style="${subType==='collection'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">LAQUELLE ?</label>
        <select id="${pfx}-fetch-source-col" class="cfg-select">
          <option value="parent" ${source==='parent'?'selected':''}>La collection parente de l'asset</option>
          <option value="id"     ${source==='id'?'selected':''}>Par son ID</option>
          <option value="path"   ${source==='path'?'selected':''}>Par son chemin</option>
        </select>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">ID / CHEMIN</label>
        <input id="${pfx}-fetch-col-value" class="cfg-input" list="${pfx}-wfd-var-list"
          value="${escHtml(cfg.fetchValue||'')}" placeholder="{collection.id} ou /SECTEURS/BJ">
      </div>
    </div>
    <div id="${pfx}-fetch-metadata" style="${subType==='metadata'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">LIRE SUR</label>
        <select id="${pfx}-fetch-meta-target" class="cfg-select">
          <option value="asset"      ${(cfg.fetchTarget||'asset')==='asset'?'selected':''}>L'asset déclenché</option>
          <option value="collection" ${cfg.fetchTarget==='collection'?'selected':''}>Une collection</option>
        </select>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">VUE DE MÉTADONNÉES</label>
        <select id="${pfx}-fetch-meta-view" class="cfg-select" onchange="wfdFetchMetaViewChanged('${pfx}')">
          <option value="">— Toutes les vues —</option>${viewOpts}
        </select>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">CHAMPS À LIRE <span class="wfd-label-9-555">(vide = tous)</span></label>
        <!-- Tags sélectionnés -->
        <div id="${pfx}-meta-tags" style="display:flex;flex-wrap:wrap;gap:5px;min-height:28px;
          padding:6px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:5px;margin-bottom:6px;">
          ${(cfg.metadataFields||[]).map(f => `
            <span class="wfd-meta-tag" data-field="${escHtml(f)}"
              style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
                background:#1a2a1a;border:1px solid #2d5a2d;border-radius:12px;
                font-size:11px;color:#2ecc71;cursor:pointer;"
              onclick="wfdFetchRemoveTag(this,'${pfx}')">
              ${escHtml(f)} <span class="wfd-c-555-10">×</span>
            </span>`).join('')}
          ${(cfg.metadataFields||[]).length===0 ? '<span style="color:#444;font-size:10px;line-height:26px;">Tous les champs (aucun filtre)</span>' : ''}
        </div>
        <!-- Dropdown pour ajouter un champ -->
        <div class="wfd-row-gap6b">
          <select id="${pfx}-fetch-meta-field-add" class="cfg-select wfd-flex1">
            <option value="">+ Ajouter un champ…</option>
            ${allMeta.filter(f => !(cfg.metadataFields||[]).includes(f)).map(f =>
              `<option value="${escHtml(f)}">${escHtml(f)}</option>`
            ).join('')}
          </select>
          <button onclick="wfdFetchAddTag('${pfx}')"
            style="padding:6px 10px;border-radius:4px;border:1px solid #2a2a2a;
              background:transparent;color:#3498db;cursor:pointer;font-size:12px;">
            + Ajouter
          </button>
        </div>
      </div>
    </div>
    <div id="${pfx}-fetch-savedsearch" style="${subType==='savedsearch'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Saved Search Iconik</label>
        <div style="display:flex;gap:6px;align-items:flex-start;">
          <div class="wfd-flex1">
            <select id="${pfx}-ss-id" class="cfg-select"
              style="${(wfdData.savedSearches||[]).length ? '' : 'display:none'}">
              <option value="">— Sélectionner une Saved Search —</option>
              ${(wfdData.savedSearches||[]).map(s =>
                `<option value="${s.id}" ${cfg.savedSearchId===s.id?'selected':''}>${escHtml(s.name||s.nom||s.id)}</option>`
              ).join('')}
            </select>
            <input id="${pfx}-ss-id-manual" class="cfg-input"
              style="font-family:var(--font-mono);${(wfdData.savedSearches||[]).length ? 'display:none' : ''}"
              value="${escHtml(cfg.savedSearchId||'')}"
              placeholder="ID de la Saved Search Iconik">
          </div>
          <button onclick="wfdRefreshSavedSearches('${pfx}')"
            id="${pfx}-ss-refresh"
            title="Actualiser depuis Iconik"
            style="flex-shrink:0;padding:6px 8px;border-radius:4px;border:1px solid #2a2a2a;
              background:transparent;color:#3498db;cursor:pointer;font-size:13px;
              transition:transform .3s;">↺</button>
        </div>
        <div id="${pfx}-ss-status" class="wfd-hint-top3"></div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Nombre de résultats max</label>
        <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;align-items:center;">
          <input id="${pfx}-ss-limit" type="number" min="1" max="1000"
            class="cfg-input" value="${cfg.savedSearchLimit||'100'}">
          <span class="wfd-text-555-11b">résultats</span>
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Stocker les résultats dans</label>
        <div class="wfd-row-gap6c">
          <span style="font-family:var(--font-mono);color:#2ecc71;font-size:14px;">{</span>
          <input id="${pfx}-ss-var" class="cfg-input"
            style="font-family:var(--font-mono);font-size:13px;font-weight:600;
              color:#2ecc71;background:#0a140a;border-color:#2d5a2d;"
            value="${escHtml(cfg.savedSearchVar||'search_results')}"
            placeholder="search_results">
          <span style="font-family:var(--font-mono);color:#2ecc71;font-size:14px;">}</span>
        </div>
        <div class="cfg-hint">
          Après exécution : <code>{vars.search_results}</code> contiendra la liste d'assets,
          <code>{vars.search_results_count}</code> le nombre de résultats.
          Utilisez un nœud <strong>Boucle</strong> ensuite pour traiter chaque asset.
        </div>
      </div>
    </div>

    <div class="cfg-field" style="background:#0d1a0d;border:1px solid #1a3a1a;border-radius:5px;padding:10px 12px;margin-top:8px;">
      <label class="cfg-label wfd-c-green4-mb6">STOCKER LE RÉSULTAT DANS</label>
      <div class="wfd-row-gap6c">
        <span class="wfd-mono-green">{</span>
        <input id="${pfx}-fetch-store-as" class="cfg-input wfd-input-green"
          value="${escHtml(cfg.storeAs||cfg.resultVar||cfg.fetchVar||'asset')}">
        <span class="wfd-mono-green">}</span>
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Description de ce nœud...">${cfg.description||''}</textarea>
    </div>`;

} else if (family === 'aps_search') {
  const _srBlocks   = cfg.blocks || [];
  const _srMdFields = (typeof wfdData !== 'undefined' ? wfdData.metadata : []) || [];
  const _srMdObjs   = _srMdFields.map(m => ({
    name : m.name || m.nom || '',
    label: m.label || m.name || m.nom || '',
    type : m.field_type || 'string',
  })).filter(m => m.name).sort((a,b) => a.label.localeCompare(b.label));

  const SYSTEM_FIELDS = [
    { name:'id',             label:'ID',             type:'string' },
    { name:'title',          label:'Titre',          type:'string' },
    { name:'date_created',   label:'Date création',  type:'date'   },
    { name:'date_modified',  label:'Date modif.',    type:'date'   },
    { name:'object_type',    label:'Type objet',     type:'string' },
    { name:'status',         label:'Statut',         type:'string' },
    { name:'archive_status', label:'Statut archive', type:'string' },
    { name:'external_id',    label:'ID externe',     type:'string' },
  ];
  const ALL_FIELDS = [
    { name:'__collection__', label:'📁 Collection (browse)', type:'collection' },
    ...SYSTEM_FIELDS,
    ..._srMdObjs,
  ];

  const OBJECT_TYPES = [
    { value:'asset',           label:'🎬 Asset' },
    { value:'collection',      label:'📁 Collection' },
    { value:'segment',         label:'✂️ Segment' },
    { value:'saved_search',    label:'💾 Recherche sauvegardée' },
    { value:'format',          label:'🎞 Format' },
    { value:'storage',         label:'🗄 Storage' },
    { value:'metadata_view',   label:'📋 Metadata View' },
    { value:'user',            label:'👥 User / Team' },
    { value:'export_location', label:'📤 Export Location' },
  ];

  const OPS_BY_TYPE = {
    text   : { equals:'est égal à', not_equals:'est différent de', contains:'contient', not_contains:'ne contient pas', starts_with:'commence par', is_empty:'est vide', is_not_empty:"n'est pas vide" },
    date   : { before:'avant', after:'après', is_empty:'est vide', is_not_empty:"n'est pas vide" },
    number : { equals:'est égal à', gt:'supérieur à', lt:'inférieur à', is_empty:'est vide', is_not_empty:"n'est pas vide" },
    list   : { contains_any:'contient au moins un', contains_all:'contient tous', not_contains:'ne contient pas', is_empty:'est vide', is_not_empty:"n'est pas vide" },
    bool   : { is_true:'est vrai', is_false:'est faux', is_empty:'est vide' },
  };
  const ALL_OPS = Object.assign({}, ...Object.values(OPS_BY_TYPE));

  function srOpsOptions(selOp) {
    return Object.entries(ALL_OPS)
      .map(([k,v]) => `<option value="${k}" ${selOp===k?'selected':''}>${v}</option>`)
      .join('');
  }

  function srNeedsValue(op) {
    return !['is_empty','is_not_empty','is_true','is_false'].includes(op);
  }

  function srBlockHtml(block, idx, allBlocks) {
    const prevBlocks = allBlocks.slice(0, idx);
    const parentOpts = `<option value="">— aucun —</option>` +
      prevBlocks.map(b => `<option value="${b.id}" ${block.parentBlock==b.id?'selected':''}>${escHtml('Bloc '+b.id)}</option>`).join('');

    const critHtml = (block.criteria||[]).map((crit, ci) => {
      const hasVal = srNeedsValue(crit.op||'equals');
      const joinBtn = ci > 0
        ? `<button onclick="srToggleJoin('${pfx}',${idx},${ci})" class="cfg-btn"
             style="padding:2px 8px;font-size:10px;width:44px;flex:0 0 44px;"
             title="Cliquer pour basculer AND/OR">${escHtml(crit.join||'AND')}</button>`
        : '';
      return `
      ${(() => {
        const _fd2 = ALL_FIELDS.find(f => (f.name||f) === crit.field);
        const OPS2 = {
          string:{equals:'est égal à',not_equals:'est différent de',contains:'contient',not_contains:'ne contient pas',starts_with:'commence par',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          text:{equals:'est égal à',not_equals:'est différent de',contains:'contient',not_contains:'ne contient pas',starts_with:'commence par',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          date:{before:'avant',after:'après',between:'entre deux dates',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          integer:{equals:'est égal à',not_equals:'est différent de',gt:'supérieur à',lt:'inférieur à',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          float:{equals:'est égal à',not_equals:'est différent de',gt:'supérieur à',lt:'inférieur à',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          boolean:{is_true:'est vrai',is_false:'est faux',is_empty:'est vide'},
          list:{contains_any:'contient au moins un',contains:'contient',not_contains:'ne contient pas',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          tag_cloud:{contains_any:'contient au moins un',contains:'contient',not_contains:'ne contient pas',is_empty:'est vide',is_not_empty:"n'est pas vide"},
          dropdown:{equals:'est égal à',not_equals:'est différent de',is_empty:'est vide',is_not_empty:"n'est pas vide"},
        };
        const ops2 = (_fd2 && OPS2[_fd2.type]) ? OPS2[_fd2.type] : OPS2['string'];
        const opsHtml2 = Object.entries(ops2).map(([k,v])=>`<option value="${k}" ${(crit.op||'equals')===k?'selected':''}>${v}</option>`).join('');
        const _isDate2 = (_fd2 && _fd2.type === 'date') || ['date_created','date_modified'].includes(crit.field||'');
        const _dp2 = 'data-pfx="' + pfx + '" data-bidx="' + idx + '" data-cidx="' + ci + '"';
        const _noVal2 = ['is_empty','is_not_empty','is_true','is_false'].includes(crit.op||'equals');
        let valHtml2 = '';
        if (_noVal2) {
          valHtml2 = '<input class="cfg-input sr-crit-val" style="display:none;">';
        } else if (_isDate2 && crit.op === 'between') {
          const _parts2 = (crit.value||'|').split('|');
          valHtml2 = '<input type="date" class="cfg-input sr-crit-val-from sr-date-input" ' + _dp2 + ' value="' + (_parts2[0]||'') + '" class="wfd-date-dark">'
            + '<span style="color:#555;font-size:10px;padding:0 3px;">&#8594;</span>'
            + '<input type="date" class="cfg-input sr-crit-val-to sr-date-input" ' + _dp2 + ' value="' + (_parts2[1]||'') + '" class="wfd-date-dark">'
            + '<input type="hidden" class="sr-crit-val" value="' + (crit.value||'') + '">';
        } else if (_isDate2) {
          valHtml2 = '<input type="date" class="cfg-input sr-crit-val sr-date-input" ' + _dp2 + ' value="' + (crit.value||'') + '" style="flex:2;color-scheme:dark;">';
        } else if (crit.field === '__collection__') {
          const _colVal2 = crit.value || '';
          let _colIds2 = [];
          try { _colIds2 = JSON.parse(_colVal2); if (!Array.isArray(_colIds2)) _colIds2 = _colVal2 ? [_colVal2] : []; } catch(e) { _colIds2 = _colVal2 ? [_colVal2] : []; }
          const _colPrefix2 = pfx + '-sr-col-' + idx + '-' + ci;
          const _colTreeHtml2 = typeof wfdColTreeHtml === 'function'
            ? wfdColTreeHtml(_colPrefix2, JSON.stringify(_colIds2))
            : '<div id="' + _colPrefix2 + '-col-selected" style="display:none"></div><div id="' + _colPrefix2 + '-col-tags"></div><div id="' + _colPrefix2 + '-col-tree"></div>';
          valHtml2 = '<div style="flex:4;display:flex;flex-direction:column;gap:4px;">'
            + '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#aaa;cursor:pointer;">'
            + '<input type="checkbox" class="sr-crit-col-op" data-bidx="' + idx + '" data-cidx="' + ci + '"'
            + ((crit.op||'in_branch')==='in_branch' ? ' checked' : '')
            + ' onchange="srAutoSave(\'' + pfx + '\')" style="cursor:pointer;">'
            + 'Inclure les sous-dossiers</label>'
            + '<div style="max-height:150px;overflow-y:auto;background:#050505;border:1px solid #2a2a2a;border-radius:3px;">'
            + _colTreeHtml2
            + '</div><input type="hidden" class="sr-crit-val" value="' + escHtml(JSON.stringify(_colIds2)) + '"></div>';
        } else {
          valHtml2 = '<input class="cfg-input sr-crit-val" value="' + (crit.value||'').replace(/"/g,'&quot;') + '" placeholder="valeur" style="flex:2;font-family:var(--font-mono);font-size:10px;" data-pfx="' + pfx + '" oninput="srAutoSave(this.dataset.pfx)">';
        }
        const _isColField2 = crit.field === '__collection__';
        return `<div class="sr-crit-row" data-bidx="${idx}" data-cidx="${ci}"
           style="display:flex;flex-wrap:wrap;gap:4px;align-items:${_isColField2?'flex-start':'center'};margin-bottom:4px;">
        ${joinBtn ? joinBtn : '<span style="min-width:44px;"></span>'}
        <select class="cfg-select sr-crit-field wfd-flex2b" data-bidx="${idx}" data-cidx="${ci}" onchange="srFieldChange('${pfx}',${idx},${ci},this.value)">
          ${ALL_FIELDS.map(f => `<option value="${escHtml(f.name||f)}" ${crit.field===(f.name||f)?'selected':''}>${escHtml(f.label||f)}</option>`).join('')}
        </select>
        ${_isColField2 ? '' : `<select class="cfg-select sr-crit-op wfd-flex2b" data-bidx="${idx}" data-cidx="${ci}" onchange="srOpChange('${pfx}',${idx},${ci},this.value,'${crit.op||'equals'}')">
          ${opsHtml2}
        </select>`}
        <button onclick="srRemoveCrit('${pfx}',${idx},${ci})"
                class="wfd-del-btn-p2s">×</button>
        ${valHtml2}
      </div>`;
      })()}`;
    }).join('');

    return `
    <div class="sr-block" data-bidx="${idx}"
         style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:5px;padding:10px;margin-bottom:8px;">
      <div class="wfd-row-gap8-mb8">
        <span style="font-size:10px;font-weight:700;color:#8e44ad;min-width:52px;">Bloc ${block.id}</span>
        <select class="cfg-select sr-obj-type wfd-flex2b" data-bidx="${idx}"
                onchange="srAutoSave('${pfx}')">
          ${OBJECT_TYPES.map(o => `<option value="${o.value}" ${block.objectType===o.value?'selected':''}>${o.label}</option>`).join('')}
        </select>
        ${prevBlocks.length ? `
        <select class="cfg-select sr-parent wfd-flex2b" data-bidx="${idx}"
                onchange="srAutoSave('${pfx}')">
          ${parentOpts}
        </select>` : ''}
        <button onclick="srRemoveBlock('${pfx}',${idx})"
                style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:0 2px;margin-left:auto;">×</button>
      </div>
      <div class="sr-crits" data-bidx="${idx}" style="padding-left:4px;">
        ${critHtml}
      </div>
      <button onclick="srAddCrit('${pfx}',${idx})"
              style="font-size:10px;padding:3px 8px;margin-top:4px;width:100%;" class="cfg-btn">
        + Critère
      </button>
    </div>`;
  }

  const blocksHtml = _srBlocks.map((b, i) => srBlockHtml(b, i, _srBlocks)).join('');
  const blockOpts  = _srBlocks.map(b => `<option value="${b.id}" ${cfg.returnBlock==b.id?'selected':''}>Bloc ${b.id}</option>`).join('');

  // Charger les searches sauvegardées
  fetch('/api/aps-search')
    .then(r => r.json())
    .then(searches => {
      const sel = document.getElementById(pfx + '-sr-saved');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Charger une recherche sauvegardée —</option>' +
        searches.map(s => '<option value="' + s.id + '">' + escHtml(s.name) + '</option>').join('');
    }).catch(() => {});

  html += `
  <!-- Charger une recherche sauvegardée -->
  <div class="cfg-field">
    <label class="cfg-label">Recherche sauvegardée</label>
    <div style="display:flex;gap:4px;">
      <select id="${pfx}-sr-saved" class="cfg-select wfd-flex1"
              onchange="srChargerSearch('${pfx}', this.value)">
        <option value="">— Charger une recherche —</option>
      </select>
    </div>
  </div>
  <!-- En-tête résultat -->
  <div style="font-size:9px;color:#e67e22;margin-bottom:6px;padding:5px 8px;background:#1a1000;border-radius:3px;border:1px solid #3a2800;">
    💡 Les champs MD proviennent du snapshot. Cliquez sur <b>Actualiser</b> (⟳) dans la toolbar pour obtenir les champs à jour depuis Iconik.
  </div>
  <div class="cfg-field" style="display:flex;gap:8px;align-items:center;">
    <div class="wfd-flex1">
      <label class="cfg-label">Variable de stockage</label>
      <input id="${pfx}-sr-result-var" class="cfg-input wfd-mono"
             value="${escHtml(cfg.resultVar||'search_results')}" oninput="srAutoSave('${pfx}')">
    </div>
  </div>

  <!-- Blocs -->
  <div class="cfg-field">
    <label class="cfg-label">Blocs de recherche</label>
    <div id="${pfx}-sr-blocks" class="wfd-mb6b">${blocksHtml}</div>
    <button class="cfg-btn" onclick="srAddBlock('${pfx}')" style="width:100%;padding:6px;">
      + Ajouter un bloc
    </button>
  </div>

  <!-- Expression booléenne -->
  <div class="cfg-field">
    <label class="cfg-label">Expression</label>
    <input id="${pfx}-sr-expression" class="cfg-input wfd-mono"
           value="${escHtml(cfg.expression||'')}"
           placeholder="ex : 1 AND 2 AND (3 OR 4)"
           oninput="srAutoSave('${pfx}')">
    <div style="font-size:9px;color:#555;margin-top:3px;">
      Numéros de blocs + AND · OR · NOT · parenthèses. Vide = tous les blocs actifs.
    </div>
  </div>

  <!-- Résultat -->
  <div class="cfg-field" style="display:flex;gap:8px;align-items:center;">
    <div class="wfd-flex2b">
      <label class="cfg-label">Retourner le résultat de</label>
      <select id="${pfx}-sr-return-block" class="cfg-select" onchange="srAutoSave('${pfx}')">
        ${blockOpts}
      </select>
    </div>
    <div class="wfd-flex1">
      <label class="cfg-label">Limite</label>
      <input id="${pfx}-sr-limit" class="cfg-input" type="number"
             value="${cfg.limit||500}" min="1" max="2000"
             oninput="srAutoSave('${pfx}')">
    </div>
  </div>

  <!-- Ports -->
  <div class="wfd-code-block-mt">
    <div class="wfd-section-up">Ports de sortie</div>
    <div class="wfd-col-gap4-fs11">
      <span>🟣 <b>Résultats trouvés</b> — au moins un objet retourné</span>
      <span>🟠 <b>Aucun résultat</b> — recherche vide</span>
      <span>🔴 <b>Erreur</b> — erreur API Iconik</span>
    </div>
  </div>`;

} else if (family === 'checker') {
  const _chkConns  = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).filter(c => c.direction === 'outbound');
  const _chkChecks = cfg.checks || [];
  const _chkOps    = { equals:'égal à', not_equals:'différent de', not_empty:'non vide', contains:'contient', starts_with:'commence par' };

  html += `
  <!-- Connexion -->
  <div class="cfg-field">
    <label class="cfg-label">Connexion API</label>
    <select id="${pfx}-chk-conn" class="cfg-select">
      <option value="" ${!cfg.connexionId?'selected':''}>🔷 Iconik (connexion courante)</option>
      ${_chkConns.map(c => `<option value="${escHtml(c.id)}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name||c.id)}</option>`).join('')}
    </select>
  </div>

  <!-- Liste des vérifications -->
  <div class="cfg-field">
    <label class="cfg-label">Endpoints à vérifier</label>
    <div id="${pfx}-chk-rows" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
      ${_chkChecks.map((chk, i) => `
      <div class="chk-row" data-idx="${i}" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px;">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <select class="cfg-select chk-method" style="width:80px;flex-shrink:0;">
            ${['GET','POST'].map(m => `<option ${(chk.method||'GET')===m?'selected':''}>${m}</option>`).join('')}
          </select>
          <input class="cfg-input chk-endpoint wfd-flex1-mono10" list="${pfx}-wfd-var-list"
            value="${escHtml(chk.endpoint||'')}" placeholder="/api/contents/{external_id}">
          <button onclick="chkRemoveRow('${pfx}',${i})" class="wfd-del-btn-p4">×</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:6px;align-items:center;">
          <input class="cfg-input chk-path wfd-mono-xs" list="${pfx}-wfd-var-list"
            value="${escHtml(chk.path||'')}" placeholder="results.amazon.status" title="Chemin de la valeur à vérifier">
          <select class="cfg-select chk-op">
            ${Object.entries(_chkOps).map(([k,v]) => `<option value="${k}" ${(chk.op||'equals')===k?'selected':''}>${v}</option>`).join('')}
          </select>
          <input class="cfg-input chk-value wfd-mono-xs" list="${pfx}-wfd-var-list"
            value="${escHtml(chk.value||'')}" placeholder="ready" title="Valeur attendue (vide si not_empty)">
        </div>
        <input class="cfg-input chk-label wfd-hint-mt6" value="${escHtml(chk.label||'')}" placeholder="Label (optionnel)">
      </div>`).join('')}
    </div>
    <button class="cfg-btn" onclick="chkAddRow('${pfx}')" style="width:100%;padding:6px;">+ Ajouter une vérification</button>
  </div>

  <!-- Ports -->
  <div class="wfd-code-block-mt">
    <div class="wfd-section-up">Ports de sortie</div>
    <div class="wfd-col-gap4-fs11">
      <span>🟢 <b>Tout validé</b> — toutes les vérifications passent</span>
      <span>🔴 <b>Échec</b> — au moins une vérification échoue</span>
      <span>🟠 <b>Erreur HTTP</b> — erreur réseau ou HTTP</span>
    </div>
  </div>`;

} else if (family === 'aws_s3') {
  const _awsConns  = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).filter(c => c.authType === 'aws_s3');
  const _awsOp     = cfg.operation || 'head_object';
  const _awsTab    = cfg._activeTab || 'operation';
  const _awsOps    = {
    head_object   : 'Vérifier existence (HEAD)',
    get_object    : 'Lire un objet (GET)',
    put_object    : 'Écrire un objet (PUT)',
    delete_object : 'Supprimer un objet (DELETE)',
    list_objects  : 'Lister les objets (LIST)',
    artwork_s3    : 'Artworks → S3 (renommage + MD)',
  };

  html += `
  <!-- Onglets -->
  <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid #1a1a1a;">
    <button onclick="awsTabSwitch('${pfx}','operation')" id="${pfx}-aws-tab-operation"
      class="wfd-sub-tab${_awsTab==='operation'?' active':''}">
      Opération
    </button>
    <button onclick="awsTabSwitch('${pfx}','s3post')" id="${pfx}-aws-tab-s3post"
      class="wfd-sub-tab${_awsTab==='s3post'?' active':''}" style="${_awsOp==='artwork_s3'?'display:none':''}">
      Post-action
    </button>
    <button onclick="awsTabSwitch('${pfx}','artworks')" id="${pfx}-aws-tab-artworks"
      class="wfd-sub-tab${_awsTab==='artworks'?' active':''}" style="${_awsOp!=='artwork_s3'?'display:none':''}">
      Artworks
    </button>
  </div>

  <!-- Onglet Opération -->
  <div id="${pfx}-aws-panel-operation" style="${_awsTab==='operation'?'':'display:none'}">
    <div class="cfg-field">
      <label class="cfg-label">Connexion AWS S3</label>
      <select id="${pfx}-aws-conn" class="cfg-select">
        <option value="">— Choisir une connexion AWS —</option>
        ${_awsConns.map(c => `<option value="${escHtml(c.id)}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name||c.id)}</option>`).join('')}
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Opération</label>
      <select id="${pfx}-aws-op" class="cfg-select" onchange="awsOpChange('${pfx}',this.value)">
        ${Object.entries(_awsOps).map(([k,v]) => `<option value="${k}" ${_awsOp===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div id="${pfx}-aws-std-fields" style="${_awsOp==='artwork_s3'?'display:none':''}">
      <div class="cfg-field">
        <label class="cfg-label">Chemin de l'objet</label>
        <input id="${pfx}-aws-key" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
          value="${escHtml(cfg.objectKey||'')}" placeholder="AmazonPrime/{Titre}/"
          title="Chemin relatif dans le bucket — sans le nom du bucket">
        <div class="wfd-hint-top3">Chemin relatif dans le bucket. Supporte les variables <code>{...}</code></div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Stocker le résultat dans</label>
        <input id="${pfx}-aws-result" class="cfg-input wfd-mono"
          value="${escHtml(cfg.resultVar||'awsResult')}" placeholder="awsResult">
      </div>
      <div class="wfd-code-block-mt">
        <div class="wfd-section-up">Ports de sortie</div>
        <div class="wfd-col-gap4-fs11">
          <span>🟠 <b>Succès</b> — opération réussie (2xx)</span>
          <span>🟡 <b>Non trouvé</b> — objet absent (404)</span>
          <span>🔴 <b>Erreur</b> — erreur AWS ou réseau</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Onglet Post-action -->
  <div id="${pfx}-aws-panel-s3post" style="${_awsTab==='s3post'?'':'display:none'}">
    <div style="font-size:11px;color:#555;margin-bottom:12px;">
      Après Succès (LIST non vide), extrait les URLs des fichiers S3 et les stocke dans des variables du contexte.
      Fonctionne uniquement avec l'opération LIST.
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Mappings d'essences</label>
      <div class="wfd-hint-mb6">
        Pour chaque essence, définir un filtre sur le nom du fichier S3 et la variable de stockage.
      </div>
      <div id="${pfx}-s3-mappings-rows" class="wfd-col-gap4-mb8">
        ${(()=>{
          // Rétrocompat : si pas de s3Mappings, construire depuis les anciens champs
          const rows = cfg.s3Mappings && cfg.s3Mappings.length ? cfg.s3Mappings : [
            { type:'video',    filter:'.mp4,.mov,.ts,.mpeg,.mpg', variable: cfg.s3VarVideo||'s3_video_url' },
            { type:'image',    filter:'_poster,.jpg,.png',        variable: cfg.s3VarImage||'s3_image_url' },
            { type:'subtitle', filter:'.srt,.vtt',                variable: cfg.s3VarSrt  ||'s3_srt_url'  },
          ];
          return rows.map((row, i) => `
            <div class="s3-mapping-row wfd-row-gap6c" data-idx="${i}">
              <select class="cfg-select s3-map-type wfd-w90-fs10">
                <option value="video"    ${row.type==='video'   ?'selected':''}>🎬 Vidéo</option>
                <option value="image"    ${row.type==='image'   ?'selected':''}>🖼 Image</option>
                <option value="subtitle" ${row.type==='subtitle'?'selected':''}>💬 SRT</option>
                <option value="custom"   ${row.type==='custom'  ?'selected':''}>✏️ Custom</option>
              </select>
              <input class="cfg-input s3-map-filter wfd-flex1-mono10" placeholder="filtre (.mp4, _poster…)"
                value="${escHtml(row.filter||'')}" title="Extensions ou fragments de nom séparés par des virgules">
              <span style="font-size:10px;color:#555;flex-shrink:0;">→</span>
              <input class="cfg-input s3-map-var wfd-w120-mono" placeholder="nom_variable"
                value="${escHtml(row.variable||'')}" title="Nom de la variable dans le contexte">
              <button onclick="awsS3RemoveMapping('${pfx}',${i})"
                class="wfd-del-btn-p2"
                title="Supprimer">×</button>
            </div>`).join('');
        })()}
      </div>
      <button onclick="awsS3AddMapping('${pfx}')"
        class="wfd-btn-blue-sm">
        + Ajouter une essence
      </button>
    </div>
  </div>
<!-- Onglet Artworks -->
  <div id="${pfx}-aws-panel-artworks" style="${_awsTab==='artworks'?'':'display:none'}">
    <div style="font-size:11px;color:#555;margin-bottom:12px;">
      Récupère les artworks depuis les subjobs Iconik, les renomme et les pousse dans S3.
      Requiert l'opération <b>Artworks → S3</b> et un job_id valide.
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Job ID (export Iconik)</label>
      <input id="${pfx}-aws-art-jobid" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.jobId||'{exportJobId}')}"
        placeholder="{exportJobId}">
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Préfixe S3 (dossier de destination)</label>
      <input id="${pfx}-aws-art-prefix" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.objectKey||'')}"
        placeholder="AmazonPrime/{Titre}/">
      <div class="wfd-hint-top3">Même préfixe que le nœud LIST précédent.</div>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Titre (pour le nommage)</label>
      <input id="${pfx}-aws-art-titre" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.titreVar||'{Titre}')}"
        placeholder="{Titre}">
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Règle de nommage</label>
      <select id="${pfx}-aws-art-nommage" class="cfg-select">
        <option value="">— Défaut ({Titre}_{Type}.ext) —</option>
        ${(typeof wfdNommages !== 'undefined' ? wfdNommages : []).map(n =>
          `<option value="${escHtml(n.id)}" ${cfg.nommageId===n.id?'selected':''}>${escHtml(n.name)}</option>`
        ).join('')}
      </select>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Artworks</label>
      <div class="wfd-hint-mb6">
        Nom Iconik = nom du fichier uploadé dans Iconik (ex: Cover). Champ MD = champ métadonnée cible. Variable = variable contexte.
      </div>
      <div id="${pfx}-aws-art-rows" class="wfd-col-gap4-mb8">
        ${(()=>{
          const rows = cfg.artworks && cfg.artworks.length ? cfg.artworks : [
            { iconikName:'Cover',  mdField:'URLCoverArt',  variable:'s3_cover_url'  },
            { iconikName:'Box',    mdField:'URLBoxArt',    variable:'s3_box_url'    },
            { iconikName:'Hero',   mdField:'URLHeroArt',   variable:'s3_hero_url'   },
            { iconikName:'Poster', mdField:'URLPosterArt', variable:'s3_poster_url' },
            { iconikName:'Season', mdField:'URLSeasonArt', variable:'s3_season_url' },
          ];
          return rows.map((row, i) => `
            <div class="aws-art-row" data-idx="${i}" style="display:grid;grid-template-columns:1fr 1fr 1fr 24px;gap:4px;align-items:center;">
              <input class="cfg-input aws-art-name wfd-mono-xs2" data-idx="${i}" value="${escHtml(row.iconikName||'')}"
                placeholder="Cover" title="Nom dans Iconik">
              <input class="cfg-input aws-art-md wfd-mono-xs2" data-idx="${i}" value="${escHtml(row.mdField||'')}"
                placeholder="URLCoverArt" title="Champ MD Iconik">
              <input class="cfg-input aws-art-var wfd-mono-xs2" data-idx="${i}" value="${escHtml(row.variable||'')}"
                placeholder="s3_cover_url" title="Variable contexte">
              <button onclick="awsArtRemoveRow('${pfx}',${i})"
                class="wfd-del-btn-p0">×</button>
            </div>`).join('');
        })()}
      </div>
      <button onclick="awsArtAddRow('${pfx}')"
        class="wfd-btn-blue-sm">
        + Ajouter un artwork
      </button>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Vue MD Iconik (pour écriture URLs)</label>
      <select id="${pfx}-aws-art-mdview" class="cfg-select">
        <option value="">— Aucune —</option>
        ${(typeof wfdData !== 'undefined' && wfdData.mdViews ? wfdData.mdViews : []).map(v =>
          `<option value="${escHtml(v.id)}" ${cfg.mdViewId===v.id?'selected':''}>${escHtml(v.nom||v.name||v.id)}</option>`
        ).join('')}
      </select>
    </div>

    <div class="wfd-code-block-mt">
      <div class="wfd-section-up">Ports de sortie</div>
      <div class="wfd-col-gap4-fs11">
        <span>🟢 <b>Succès</b> — tous les artworks traités</span>
        <span>🟡 <b>Partiel</b> — certains artworks manquants</span>
        <span>🔴 <b>Erreur</b> — échec S3 ou Iconik</span>
      </div>
    </div>
  </div>
`;

} else if (family === 'wait_for') {
  const _wfConns   = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).filter(c => c.direction === 'outbound');
  const _awsConns  = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).filter(c => c.authType === 'aws_s3');
  const _wfDelay   = cfg.delaySeconds || 5;
  const _wfTries   = cfg.maxTries     || 20;
  const _wfMethod  = cfg.method       || 'GET';
  const _wfMethods = ['GET','POST','PUT','PATCH'];
  const _wfTab     = cfg._activeTab || 'polling';

  html += `
  <!-- Onglets -->
  <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid #1a1a1a;">
    <button onclick="wfTabSwitch('${pfx}','polling')" id="${pfx}-wf-tab-polling"
      class="wfd-sub-tab${_wfTab==='polling'?' active':''}">
      Polling
    </button>
    <button onclick="wfTabSwitch('${pfx}','s3')" id="${pfx}-wf-tab-s3"
      class="wfd-sub-tab${_wfTab==='s3'?' active':''}">
      Post-action S3
    </button>
  </div>

  <!-- Onglet Polling -->
  <div id="${pfx}-wf-panel-polling" style="${_wfTab==='polling'?'':'display:none'}">
    <div class="cfg-field">
      <label class="cfg-label">Connexion API</label>
      <select id="${pfx}-wf-conn" class="cfg-select">
        <option value="" ${!cfg.connexionId?'selected':''}>🔷 Iconik (connexion courante)</option>
        ${_wfConns.map(c => `<option value="${escHtml(c.id)}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name||c.id)}</option>`).join('')}
      </select>
      <div class="wfd-hint-top3">Laisser sur Iconik pour les jobs d'export Iconik</div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Endpoint à interroger</label>
      <div class="wfd-row-gap6c">
        <select id="${pfx}-wf-method" class="cfg-select" style="width:90px;flex-shrink:0;">
          ${_wfMethods.map(m => `<option ${_wfMethod===m?'selected':''}>${m}</option>`).join('')}
        </select>
        <input id="${pfx}-wf-endpoint" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
          value="${escHtml(cfg.endpoint||'')}" placeholder="/API/jobs/v1/jobs/{exportJobId}/">
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Condition de sortie</label>
      <div class="wfd-grid-2-gap6b">
        <div>
          <div class="wfd-hint-mb3">Chemin du champ</div>
          <input id="${pfx}-wf-check-path" class="cfg-input wfd-mono"
            value="${escHtml(cfg.checkPath||'status')}" placeholder="status">
        </div>
        <div>
          <div class="wfd-hint-mb3">Valeur attendue</div>
          <input id="${pfx}-wf-check-value" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
            value="${escHtml(cfg.checkValue||'')}" placeholder="FINISHED">
        </div>
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Valeurs d'échec (sortie immédiate port Erreur)</label>
      <input id="${pfx}-wf-fail-values" class="cfg-input wfd-mono"
        value="${escHtml(cfg.failValues||'FAILED,ERROR,ABORTED')}"
        placeholder="FAILED,ERROR,ABORTED">
      <div class="wfd-hint-top3">Séparés par des virgules — sortie immédiate sans attendre le timeout</div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Paramètres de polling</label>
      <div class="wfd-grid-2-gap6b">
        <div>
          <div class="wfd-hint-mb3">Délai entre essais (sec)</div>
          <input id="${pfx}-wf-delay" class="cfg-input wfd-mono" type="number" min="1" max="300"
            value="${escHtml(String(_wfDelay))}">
        </div>
        <div>
          <div class="wfd-hint-mb3">Nombre max d'essais</div>
          <input id="${pfx}-wf-max-tries" class="cfg-input wfd-mono" type="number" min="1" max="100"
            value="${escHtml(String(_wfTries))}">
        </div>
      </div>
      <div class="wfd-hint-top4b">
        Délai max total : ${_wfDelay * _wfTries}s (~${Math.round(_wfDelay * _wfTries / 60)}min)
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Stocker le résultat dans</label>
      <input id="${pfx}-wf-result-var" class="cfg-input wfd-mono"
        value="${escHtml(cfg.resultVar||'waitResult')}" placeholder="waitResult">
    </div>
    <div class="wfd-code-block-mt">
      <div class="wfd-section-up">Ports de sortie</div>
      <div class="wfd-col-gap4-fs11">
        <span>🟢 <b>Condition remplie</b> — valeur trouvée</span>
        <span>🟠 <b>Timeout</b> — max essais atteint</span>
        <span>🔴 <b>Erreur</b> — erreur HTTP, réseau ou valeur d'échec</span>
      </div>
    </div>
  </div>

  <!-- Onglet Post-action S3 -->
  <div id="${pfx}-wf-panel-s3" style="${_wfTab==='s3'?'':'display:none'}">
    <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:12px;">
      Après condition remplie, liste le dossier S3 et stocke les URLs des fichiers exportés dans des variables.
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Connexion AWS S3</label>
      <select id="${pfx}-wf-s3-conn" class="cfg-select">
        <option value="" ${!cfg.s3ConnexionId?'selected':''}>— Désactivé —</option>
        ${_awsConns.map(c => `<option value="${escHtml(c.id)}" ${cfg.s3ConnexionId===c.id?'selected':''}>${escHtml(c.name||c.id)}</option>`).join('')}
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Dossier à lister</label>
      <input id="${pfx}-wf-s3-prefix" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.s3Prefix||'')}" placeholder="AmazonPrime/{Titre}/">
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Mappings d'essences</label>
      <div style="font-size:10px;color:var(--color-text-secondary);margin-bottom:6px;">
        Pour chaque essence, définir un filtre sur le nom du fichier S3 et la variable de stockage.
      </div>
      <div id="${pfx}-wf-s3-mappings-rows" class="wfd-col-gap4-mb8">
        ${(()=>{
          const rows = cfg.s3Mappings && cfg.s3Mappings.length ? cfg.s3Mappings : [
            { type:'video',    filter:'.mp4,.mov,.ts,.mpeg,.mpg', variable: cfg.s3VarVideo||'s3_video_url' },
            { type:'image',    filter:'_poster,.jpg,.png',        variable: cfg.s3VarImage||'s3_image_url' },
            { type:'subtitle', filter:'.srt,.vtt',                variable: cfg.s3VarSrt  ||'s3_srt_url'  },
          ];
          return rows.map((row, i) => `
            <div class="s3-mapping-row wfd-row-gap6c" data-idx="${i}">
              <select class="cfg-select s3-map-type wfd-w90-fs10">
                <option value="video"    ${row.type==='video'   ?'selected':''}>🎬 Vidéo</option>
                <option value="image"    ${row.type==='image'   ?'selected':''}>🖼 Image</option>
                <option value="subtitle" ${row.type==='subtitle'?'selected':''}>💬 SRT</option>
                <option value="custom"   ${row.type==='custom'  ?'selected':''}>✏️ Custom</option>
              </select>
              <input class="cfg-input s3-map-filter wfd-flex1-mono10" placeholder="filtre (.mp4, _poster…)"
                value="${escHtml(row.filter||'')}">
              <span style="font-size:10px;color:var(--color-text-secondary);flex-shrink:0;">→</span>
              <input class="cfg-input s3-map-var wfd-w120-mono" placeholder="nom_variable"
                value="${escHtml(row.variable||'')}">
              <button onclick="wfS3RemoveMapping('${pfx}',${i})"
                class="wfd-del-btn-p2"
                title="Supprimer">×</button>
            </div>`).join('');
        })()}
      </div>
      <button onclick="wfS3AddMapping('${pfx}')"
        class="wfd-btn-blue-sm">
        + Ajouter une essence
      </button>
    </div>
  </div>`;

} else if (family === 'workflow_history') {
  const _mdViews   = (typeof wfdData !== 'undefined' ? wfdData.mdViews : []) || [];
  const _mdFields  = (typeof wfdData !== 'undefined' ? wfdData.metadata : []) || [];
  const _whMode    = cfg.whMode    || 'add';
  const _whOrder   = cfg.whOrder   || 'newest';
  const _whStatut  = cfg.whStatut  || '';
  const _whMessage = cfg.whMessage || '';

  html += `
  <!-- Identifiant cible -->
  <div class="cfg-field">
    <label class="cfg-label">Identifiant cible</label>
    <input id="${pfx}-wh-target-id" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.targetId||'{asset_id}')}"
      placeholder="{asset_id}">
  </div>

  <!-- Vue MD -->
  <div class="cfg-field">
    <label class="cfg-label">Vue de métadonnées</label>
    <select id="${pfx}-wh-md-view" class="cfg-select">
      <option value="">— Champ par champ (sans vue) —</option>
      ${_mdViews.map(v => `<option value="${escHtml(v.id)}" ${cfg.mdViewId===v.id?'selected':''}>${escHtml(v.name||v.nom||v.id)}</option>`).join('')}
    </select>
  </div>

  <!-- Champ MD cible -->
  <div class="cfg-field">
    <label class="cfg-label">Champ MD cible</label>
    <select id="${pfx}-wh-md-field" class="cfg-select">
      <option value="">— Choisir un champ —</option>
      ${_mdFields.filter(f => f.field_type === 'text' || f.field_type === 'string').map(f =>
        `<option value="${escHtml(f.name)}" ${cfg.mdField===f.name?'selected':''}>${escHtml(f.label||f.name)}</option>`
      ).join('')}
    </select>
  </div>

  <!-- Mode -->
  <div class="cfg-field">
    <label class="cfg-label">Mode d'écriture</label>
    <select id="${pfx}-wh-mode" class="cfg-select">
      <option value="add"    ${_whMode==='add'   ?'selected':''}>➕ Ajouter une nouvelle ligne</option>
      <option value="update" ${_whMode==='update'?'selected':''}>✏️ Mettre à jour la ligne du run courant</option>
    </select>
    <div class="wfd-hint-top3">Le Run ID est requis pour retrouver la ligne à remplacer</div>
  </div>

  <!-- Ordre -->
  <div class="cfg-field">
    <label class="cfg-label">Ordre</label>
    <select id="${pfx}-wh-order" class="cfg-select">
      <option value="newest" ${_whOrder==='newest'?'selected':''}>⬆ Plus récent en haut</option>
      <option value="oldest" ${_whOrder==='oldest'?'selected':''}>⬇ Plus récent en bas</option>
    </select>
  </div>

  <!-- Champs à inclure -->
  <div class="cfg-field">
    <label class="cfg-label">Champs à inclure</label>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
      <label class="wfd-row-click2">
        <input type="checkbox" id="${pfx}-wh-show-date"   ${cfg.whShowDate  !==false?'checked':''} onchange="whUpdatePreview('${pfx}')">
        📅 Date &amp; heure
      </label>
      <label class="wfd-row-click2">
        <input type="checkbox" id="${pfx}-wh-show-runid"  ${cfg.whShowRunId ===true ?'checked':''} onchange="whUpdatePreview('${pfx}')">
        <span style="font-size:9px;color:#555;">(requis pour le mode Mettre à jour)</span>
        🔑 Inclure le Run ID
      </label>
      <label class="wfd-row-click2">
        <input type="checkbox" id="${pfx}-wh-show-wf" ${cfg.whShowWf!==false?'checked':''} onchange="whUpdatePreview('${pfx}')">
        ⚡ Nom du workflow
        <input id="${pfx}-wh-wf-name" class="cfg-input"
          value="${escHtml(cfg.whWfName||'')}"
          placeholder="Nom affiché (vide = nom technique)"
          oninput="whUpdatePreview('${pfx}')"
          style="font-size:10px;margin-left:4px;flex:1;">
      </label>
      <label class="wfd-row-click2">
        <input type="checkbox" id="${pfx}-wh-show-user"   ${cfg.whShowUser  !==false?'checked':''} onchange="whUpdatePreview('${pfx}')">
        👤 Utilisateur déclencheur
      </label>
    </div>
  </div>

  <!-- Statut -->
  <div class="cfg-field">
    <label class="cfg-label">Statut</label>
    <div style="display:flex;gap:6px;align-items:flex-start;flex-direction:column;">
      <select id="${pfx}-wh-statut-preset" class="cfg-select wfd-w100pct"
        onchange="whStatutPresetChange('${pfx}')">
        <option value="🔄 En cours"    ${_whStatut==='🔄 En cours'   ?'selected':''}>🔄 En cours</option>
        <option value="✅ Succès"      ${_whStatut==='✅ Succès'     ?'selected':''}>✅ Succès</option>
        <option value="⚠️ Incomplet"   ${_whStatut==='⚠️ Incomplet'  ?'selected':''}>⚠️ Incomplet</option>
        <option value="❌ Échec"       ${_whStatut==='❌ Échec'      ?'selected':''}>❌ Échec</option>
        <option value="__custom__"     ${!['🔄 En cours','✅ Succès','⚠️ Incomplet','❌ Échec',''].includes(_whStatut)?'selected':''}>✏️ Personnalisé...</option>
        <option value=""               ${_whStatut===''              ?'selected':''}>— Aucun —</option>
      </select>
      <input id="${pfx}-wh-statut" class="cfg-input" list="${pfx}-wfd-var-list"
        value="${escHtml(!['🔄 En cours','✅ Succès','⚠️ Incomplet','❌ Échec',''].includes(_whStatut)?_whStatut:'')}"
        placeholder="{variable} ou texte libre"
        oninput="whUpdatePreview('${pfx}')"
        style="display:${!['🔄 En cours','✅ Succès','⚠️ Incomplet','❌ Échec',''].includes(_whStatut)?'block':'none'};">
    </div>
  </div>

  <!-- Message -->
  <div class="cfg-field">
    <label class="cfg-label">Message <span class="wfd-label-9-555">(optionnel)</span></label>
    <input id="${pfx}-wh-message" class="cfg-input" list="${pfx}-wfd-var-list"
      value="${escHtml(_whMessage)}"
      placeholder="Infos complémentaires ou {variable}"
      oninput="whUpdatePreview('${pfx}')">
  </div>

  <!-- Résumé d'objet -->
  <div class="cfg-field">
    <label class="cfg-label">Résumer un objet <span class="wfd-label-9-555">(optionnel)</span></label>
    <input id="${pfx}-wh-summary-var" class="cfg-input wfd-mono-xs" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.whSummaryVar||'')}"
      placeholder="{vfStatus.body.results.amazon.actions}"
      title="Pointe vers un objet — liste les sous-clés dont le statut n'est pas complete/ready/sent">
    <div class="wfd-hint-top3">Ex: {vfStatus.body.results.amazon.actions} → affiche les actions incomplètes</div>
  </div>

  <!-- Aperçu -->
  <div class="wfd-code-block-mt">
    <div style="font-size:9px;color:#444;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Aperçu de la ligne</div>
    <div id="${pfx}-wh-preview" style="font-family:var(--font-mono);font-size:10px;color:#888;word-break:break-all;">
      ${new Date().toISOString().slice(0,10)}_${new Date().toTimeString().slice(0,5)} | ${(typeof getFluxCourant==='function'?getFluxCourant()?.name:'workflow')||'workflow'} | ${_whStatut||'statut'} | ${_whMessage||'message'}
    </div>
  </div>`;

} else if (family === 'id_generator') {
  const _igType     = cfg.idType     || 'numeric';
  const _igLength   = cfg.idLength   || 8;
  const _igPrefix   = cfg.idPrefix   || '';
  const _igVar      = cfg.varName    || 'generated_id';
  const _igActions  = Array.isArray(cfg.apiActions) ? cfg.apiActions : [];

  // Construire les options connexion/action pour chaque ligne API
  const _igConnOpts = wfdConnexions.filter(c => c.direction === 'outbound').map(c =>
    `<option value="${c.id}">${escHtml(c.name)}</option>`
  ).join('');

  const _igActionRows = _igActions.map((a, i) => {
    const conn = wfdConnexions.find(c => c.id === a.connexionId);
    const actionOpts = (conn?.actions || []).map(ac =>
      `<option value="${ac.id}" ${a.actionId===ac.id?'selected':''}>${escHtml(ac.name)}</option>`
    ).join('');
    return `
    <div class="ig-api-row" data-i="${i}"
      style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;padding:8px;margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 28px;gap:5px;align-items:center;">
        <select class="cfg-select ig-conn" data-i="${i}" onchange="igConnChange(${i},'${pfx}')">
          <option value="">— Connexion —</option>${_igConnOpts.replace(
            `value="${a.connexionId}"`, `value="${a.connexionId}" selected`)}
        </select>
        <select class="cfg-select ig-action" data-i="${i}">
          <option value="">— Action —</option>${actionOpts}
        </select>
        <input class="cfg-input ig-field wfd-mono-sm2" data-i="${i}"
          value="${escHtml(a.field||'external_id')}"
          placeholder="Champ body (ex: external_id)"
          title="Nom du champ dans le body de la requête qui recevra l'ID généré">
        <button onclick="igRemoveAction(${i})"
          class="wfd-del-btn-red">×</button>
      </div>
    </div>`;
  }).join('');

  html += `
  ${buildWfdVarDatalist(pfx+'-wfd-var-list')}

  <!-- Type d'ID -->
  <div class="cfg-field">
    <label class="cfg-label">Type d'identifiant</label>
    <select id="${pfx}-ig-type" class="cfg-select" onchange="igTypeChange('${pfx}')">
      <option value="numeric"       ${_igType==='numeric'      ?'selected':''}>🔢 Numérique (N chiffres)</option>
      <option value="uuid"          ${_igType==='uuid'         ?'selected':''}>🔑 UUID v4 (standard universel)</option>
      <option value="hex"           ${_igType==='hex'          ?'selected':''}>🔡 Hexadécimal (N caractères)</option>
      <option value="alphanumeric"  ${_igType==='alphanumeric' ?'selected':''}>🔤 Alphanumérique (N caractères)</option>
      <option value="prefixed"      ${_igType==='prefixed'     ?'selected':''}>🏷 Préfixé (préfixe + type)</option>
      <option value="timestamp"     ${_igType==='timestamp'    ?'selected':''}>🕐 Timestamp-based (date + aléatoire)</option>
    </select>
  </div>

  <!-- Longueur (masqué pour UUID et timestamp) -->
  <div class="cfg-field" id="${pfx}-ig-length-wrap" style="${['uuid','timestamp'].includes(_igType)?'display:none':''}">
    <label class="cfg-label">Longueur</label>
    <input id="${pfx}-ig-length" class="cfg-input wfd-w80" type="number" min="1" max="64"
      value="${_igLength}">
    <div class="wfd-hint-top3">Nombre de caractères de l'ID généré</div>
  </div>

  <!-- Préfixe (visible uniquement si type "prefixed") -->
  <div class="cfg-field" id="${pfx}-ig-prefix-wrap" style="${_igType!=='prefixed'?'display:none':''}">
    <label class="cfg-label">Préfixe</label>
    <input id="${pfx}-ig-prefix" class="cfg-input wfd-mono"
      value="${escHtml(_igPrefix)}" placeholder="ex: PRIME- ou VOD-">
  </div>

  <!-- Variable de sortie -->
  <div class="cfg-field">
    <label class="cfg-label wfd-c-green4-mb6">STOCKER L'ID DANS</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-green">{</span>
      <input id="${pfx}-ig-var" class="cfg-input wfd-input-green"
        value="${escHtml(_igVar)}" placeholder="ex: prime_id">
      <span class="wfd-mono-green">}</span>
    </div>
    <div class="wfd-hint-top3">Accessible via <code>{${escHtml(_igVar)}}</code> dans les nœuds suivants</div>
  </div>

  <!-- Type de sortie -->
  <div class="cfg-field">
    <label class="cfg-label">Type de sortie</label>
    <select id="${pfx}-ig-output-type" class="cfg-select">
      <option value="string"  ${(cfg.outputType||'string')==='string' ?'selected':''}>String  — "91262124"</option>
      <option value="integer" ${(cfg.outputType||'string')==='integer'?'selected':''}>Integer —  91262124</option>
    </select>
    <div class="wfd-hint-top3">Définit le type de la variable générée</div>
  </div>

  <!-- Écriture API -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;margin-top:8px;">
    <span class="cfg-label">Écriture vers API <span class="wfd-label-9-555">(optionnel)</span></span>
    <button class="cfg-btn wfd-pad-3-10b" onclick="igAddAction('${pfx}')">+ Ajouter</button>
  </div>
  <div style="font-size:10px;color:#555;margin-bottom:8px;">
    Pour chaque action : l'ID généré sera injecté dans le champ spécifié du body
  </div>
  <div id="${pfx}-ig-actions">${_igActionRows || '<div style=\"color:#444;font-size:11px;padding:4px 0;\">— Aucune action API configurée</div>'}</div>

  <!-- Description -->
  <div class="cfg-field wfd-mt8">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-ig-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Génère un PrimeID unique pour VodFactory...">${escHtml(cfg.description||'')}</textarea>
  </div>`;

} else if (family === 'set_var') {
  const _svAssignments = Array.isArray(cfg.assignments) ? cfg.assignments : [];
  const _svRowsHtml = _svAssignments.map((a, i) => `
    <div class="sv-row" data-i="${i}"
      style="display:grid;grid-template-columns:1fr 1fr auto 110px 28px;gap:4px;margin-bottom:4px;align-items:center;">
      <input class="cfg-input sv-key wfd-mono"   value="${escHtml(a.key||'')}"
        placeholder="ex: type_contenu"
        title="Nom de la variable — sera accessible via {type_contenu} dans les nœuds suivants">
      <input class="cfg-input sv-value wfd-mono" value="${escHtml(a.value||'')}"
        list="${pfx}-wfd-var-list"
        placeholder="Valeur ou {variable}"
        title="Cliquez sur {...} pour choisir une variable disponible">
      <button type="button"
        onclick="event.preventDefault();event.stopPropagation();_ouvrirVarDropdown(this.previousElementSibling)"
        style="background:#0d1a2a;border:1px solid #1e3a5a;border-radius:3px;color:#7ec8e3;
          cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;"
        title="Choisir une variable disponible">{…}</button>
      <select class="cfg-select sv-mode wfd-fs11">
        <option value="set"    ${(a.mode||'set')==='set'   ?'selected':''}>= Écraser</option>
        <option value="append" ${a.mode==='append'          ?'selected':''}>+= Ajouter</option>
        <option value="push"   ${a.mode==='push'            ?'selected':''}>[] Push liste</option>
      </select>
      <button onclick="svRemoveRow(this)"
        style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:3px;
          color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>
    </div>`).join('');

  html += `
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}

    <!-- En-tête colonnes -->
    <div style="display:grid;grid-template-columns:1fr 1fr 110px 28px;gap:4px;margin-bottom:4px;">
      <span class="wfd-hint-pad4">Variable</span>
      <span class="wfd-hint-pad4">Valeur</span>
      <span></span>
      <span class="wfd-hint-pad4">Mode</span>
      <span></span>
    </div>

    <!-- Lignes d'assignation -->
    <div id="${pfx}-sv-rows">${_svRowsHtml}</div>

    <button onclick="svAddRow('${pfx}')"
      class="cfg-btn" style="width:100%;margin-top:4px;padding:5px;">
      + Ajouter une variable
    </button>

    <!-- Aide modes -->
    <div style="margin-top:10px;padding:10px 12px;background:#0a0a0a;
      border:1px solid #1e1e1e;border-radius:5px;font-size:10px;color:#555;line-height:1.7;">
      <strong style="color:#888;">Modes :</strong><br>
      <code class="wfd-c-blue2">= Écraser</code> — remplace la valeur existante<br>
      <code class="wfd-c-green3">+= Ajouter</code> — concatène à la valeur existante (texte)<br>
      <code style="color:#9b59b6;">[] Push</code> — ajoute à un tableau (crée le tableau si absent)
    </div>

    <!-- Exemple live -->
    <div style="margin-top:8px;padding:8px 12px;background:#0d1a0d;
      border:1px solid #1a3a1a;border-radius:5px;">
      <div style="font-size:10px;color:#5dbb6b;margin-bottom:4px;">📌 EXEMPLE DE RÉSULTAT</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:#888;">
        ctx.vars.<span class="wfd-c-green2">type_contenu</span> = <span class="wfd-c-orange2">"{vodFactoryContents.metadata_values.TypeContenu}"</span><br>
        ctx.vars.<span class="wfd-c-green2">duration_sec</span> = <span class="wfd-c-orange2">résultat d'une expression</span>
      </div>
    </div>

    <div class="cfg-field wfd-mt8">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Ex : Préparer le nom de fichier avant rename…">${escHtml(cfg.description||'')}</textarea>
    </div>
  `;

} else if (family === 'lookup') {
    const lkRows = cfg.lkRows || [];
    const isActiveTech = (cfg.lkActiveTab === 'technique');
    const isActiveCred = (cfg.lkActiveTab === 'credits');
    const isActiveMet  = !isActiveTech && !isActiveCred;

    // ── Lire les connexions pour la spec OpenAPI ─────────────────
    const _lkConns = (typeof wfdConnexions !== 'undefined') ? wfdConnexions : [];
    const _lkConnId = cfg.connexionId || '';
    const _lkConn  = _lkConns.find(c => c.id === _lkConnId) || null;
    const _lkSpec  = _lkConn?.apiSpec || null;
    // Champs disponibles depuis la spec (pour datalist)
    const _specFields = _lkSpec ? [...new Set(_lkSpec.endpoints.flatMap(ep => (ep.fields||[]).map(f => f.path)))] : [];

    // ── Séparer les lignes "persons" des autres ──────────────────
    const _personRows  = lkRows.filter(r => (r.value||r.tgt||'').startsWith('persons'));
    const _regularRows = lkRows.filter(r => !(r.value||r.tgt||'').startsWith('persons'));

    // ── Type label lisible ───────────────────────────────────────
    const typeLabel = t => ({ string:'Texte', integer:'Entier', float:'Décimal', boolean:'Booléen', list:'Liste' }[t] || 'Texte');
    const typeClass = t => ({ string:'lk-badge-str', integer:'lk-badge-int', float:'lk-badge-flt', boolean:'lk-badge-bool', list:'lk-badge-list' }[t] || 'lk-badge-str');

    // ── HTML d'une ligne de mapping ──────────────────────────────
    const rowHtml = (r, i) => {
      const key     = r.key   || r.src   || '';
      const value   = r.value || r.tgt   || '';
      const rType   = r.type  || 'string';
      const fb      = r.fallback || '';
      const hasFb   = !!fb;
      const isNested = value.includes('.') || value.includes('[');
      return `<div class="lkr" data-idx="${i}">
        <div class="lkr-main">
          <input class="lkr-src cfg-input lk-key" value="${escHtml(key)}" placeholder="Champ Iconik"
            list="${pfx}-wfd-lk-src-list" title="Champ source Iconik (ex: Titre, Realisateur…)">
          <span class="lkr-arrow">→</span>
          <div class="lkr-tgt-wrap">
            <input class="lkr-tgt cfg-input lk-value" value="${escHtml(value)}" placeholder="Champ API cible"
              list="${pfx}-wfd-lk-tgt-list" oninput="lkValueKeyChange(this)"
              title="Champ de l'API cible — les champs de la spec sont suggérés">
            ${isNested ? `<span class="lkr-nested" title="Champ imbriqué">{}</span>` : ''}
          </div>
          <button class="lkr-type-btn ${typeClass(rType)}" onclick="lkCycleType(this)"
            data-type="${rType}"
            title="Cliquer pour changer le type">${typeLabel(rType)}</button>
          <button class="lkr-fb-btn ${hasFb ? 'lkr-fb-active' : ''}" onclick="lkToggleFb(this)"
            title="${hasFb ? 'Fallback : ' + fb : 'Définir un fallback'}">
            ↩
          </button>
          <button class="lkr-del" onclick="lkRemoveRow(this)" title="Supprimer">×</button>
        </div>
        <div class="lkr-fb-row" style="display:${hasFb ? 'flex' : 'none'}">
          <span class="lkr-fb-label">Fallback</span>
          <input class="cfg-input lk-fallback lkr-fb-input wfd-mono-sm2" value="${escHtml(fb)}"
            placeholder="valeur ou {variable} si champ vide"
            list="${pfx}-wfd-var-list">
        </div>
        <div class="lk-children" style="display:${(r.children||[]).length ? 'block' : 'none'}; margin-left:28px; margin-top:2px;">
          ${(r.children||[]).map(c => `<div class="lk-child-row" style="display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:2px;">
            <input class="cfg-input lk-key wfd-fs11"   value="${escHtml(c.key||c.src||'')}"   placeholder="Si valeur…">
            <input class="cfg-input lk-value wfd-fs11" value="${escHtml(c.value||c.tgt||'')}" placeholder="…traduire en">
            <button onclick="lkRemoveRow(this)" class="lkr-del">×</button>
          </div>`).join('')}
        </div>
      </div>`;
    };

    // ── HTML lignes persons (crédits) ────────────────────────────
    // Rôles connus — enrichis depuis la spec si disponible
    // Rôles depuis la connexion sélectionnée, fallback sur liste minimale
    const _lkConnRoles = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).find(c => c.id === cfg.connexionId);
    const _knownRoles  = (_lkConnRoles?.roles && _lkConnRoles.roles.length)
      ? _lkConnRoles.roles
      : ['director','producer','actor','writer','creator'];
    const _specRoles  = _lkSpec
      ? [...new Set(_lkSpec.endpoints.flatMap(ep => (ep.fields||[])
          .filter(f => f.path && f.path.includes('persons') && f.path.includes('job'))
          .flatMap(f => f.enum||[])))]
      : [];
    const _roles = _specRoles.length ? _specRoles : _knownRoles;

    const personRowHtml = (r, i) => {
      const key    = r.key || r.src || '';
      const roleMatch = (r.value||r.tgt||'').match(/persons\[job=([^\]]+)\]/);
      const role   = r._role   || (roleMatch ? roleMatch[1] : 'director');
      const fmt    = r._format || 'slug'; // défaut slug — convention VodFactory
      return `<div class="lkr lkr-person" data-idx="${i}">
        <div class="lkr-main" style="grid-template-columns:1fr 20px auto auto auto auto;">
          <input class="lkr-src cfg-input lk-key lk-person-key" value="${escHtml(key)}"
            placeholder="Champ Iconik" list="${pfx}-wfd-lk-src-list">
          <span class="lkr-arrow">→</span>
          <span class="lkr-person-target">persons[]</span>
          <select class="lkr-role-sel lk-person-role" title="Rôle dans la liste des crédits">
            ${_roles.map(ro => `<option value="${ro}" ${ro===role?'selected':''}>${ro}</option>`).join('')}
          </select>
          <select class="lkr-format-sel lk-person-format" title="Format de l'identifiant"
            style="font-size:10px;padding:3px 5px;border-radius:4px;border:0.5px solid var(--color-border-tertiary);background:var(--color-background-secondary);color:var(--color-text-secondary);cursor:pointer;">
            <option value="slug"     ${fmt==='slug'    ?'selected':''}>slug</option>
            <option value="raw"      ${fmt==='raw'     ?'selected':''}>brut</option>
          </select>
          <input class="cfg-input lk-value" type="hidden"
            value="persons[job=${role}].external_id">
          <button class="lkr-del" onclick="lkRemovePersonRow(this)" title="Supprimer">×</button>
        </div>
      </div>`;
    };

    html += `
    <style>
      /* ── Lookup redesign ───────────────────────────────── */
      .lk-tabs { display:flex; gap:0; border-bottom:0.5px solid var(--color-border-tertiary); margin-bottom:14px; }
      .lk-tab  { padding:8px 16px; font-size:12px; border:none; border-bottom:2px solid transparent;
                 background:none; color:var(--color-text-secondary); cursor:pointer; transition:color .15s; }
      .lk-tab.active { color:#0F4761; border-bottom-color:#0F4761; font-weight:500; }
      .lk-tab:hover:not(.active) { color:var(--color-text-primary); }

      .lkr { border-bottom:0.5px solid var(--color-border-tertiary); padding:6px 0; }
      .lkr:last-child { border-bottom:none; }
      .lkr-main { display:grid; grid-template-columns:1fr 20px 1fr auto auto auto; gap:6px; align-items:center; }
      .lkr-src, .lkr-tgt { font-size:12px !important; }
      .lkr-tgt-wrap { position:relative; }
      .lkr-nested { position:absolute; right:6px; top:50%; transform:translateY(-50%);
                    font-size:10px; color:#5B3FA6; font-family:var(--font-mono); pointer-events:none; }
      .lkr-arrow { color:var(--color-text-secondary); font-size:13px; text-align:center; }

      .lkr-type-btn { font-size:11px; padding:3px 8px; border-radius:4px; border:0.5px solid;
                      cursor:pointer; white-space:nowrap; transition:opacity .15s; }
      .lk-badge-str  { background:#0a1a24; color:#5BA3CC; border-color:#1a3a50; }
      .lk-badge-int  { background:#150f24; color:#8B6FD4; border-color:#2a1a50; }
      .lk-badge-flt  { background:#150f24; color:#8B6FD4; border-color:#2a1a50; }
      .lk-badge-bool { background:#1f0f05; color:#D4820A; border-color:#3a1a05; }
      .lk-badge-list { background:#051a0f; color:#3BA865; border-color:#0a3020; }

      .lkr-fb-btn { width:26px; height:26px; border-radius:4px; border:0.5px solid var(--color-border-tertiary); color:var(--color-text-secondary);
                    background:none; color:var(--color-text-secondary); cursor:pointer; display:flex; align-items:center;
                    justify-content:center; font-size:13px; transition:all .15s; }
      .lkr-fb-btn.lkr-fb-active { background:#1f0f05; color:#D4820A; border-color:#3a1a05; }
      .lkr-fb-btn:hover { background:var(--color-background-secondary); }
      .lkr-del { width:26px; height:26px; border-radius:4px; border:0.5px solid transparent; color:var(--color-text-secondary);
                 background:none; color:var(--color-text-secondary); cursor:pointer; display:flex;
                 align-items:center; justify-content:center; font-size:13px; }
      .lkr-del:hover { background:var(--color-background-danger); color:var(--color-text-danger); }

      .lkr-fb-row { display:flex; align-items:center; gap:8px; padding:4px 0 2px 26px; }
      .lkr-fb-label { font-size:10px; color:var(--color-text-secondary); white-space:nowrap;
                      font-style:italic; min-width:46px; }
      .lkr-fb-input { flex:1; }

      .lkr-person .lkr-main { grid-template-columns:1fr 20px 80px 1fr 24px; gap:6px; }
      .lkr-person-target { font-size:11px; color:#5BA3CC; background:#0a1a24;
                           border:0.5px solid #9FC4D8; border-radius:4px; padding:3px 8px;
                           white-space:nowrap; font-family:var(--font-mono); }
      .lkr-role-sel { font-size:11px; padding:3px 6px; border-radius:4px;
                      border:0.5px solid #2a2a2a;
                      background:#111;
                      color:#ccc; cursor:pointer; width:100%; }

      .lk-col-hdr { font-size:10px; color:var(--color-text-secondary); font-weight:500;
                    text-transform:uppercase; letter-spacing:.05em; padding:0 0 6px; }
      .lk-col-hdrs { display:grid; grid-template-columns:1fr 20px 1fr auto auto auto; gap:6px;
                     border-bottom:0.5px solid var(--color-border-tertiary); margin-bottom:4px; }

      .lk-add-btn { display:flex; align-items:center; justify-content:center; gap:5px; width:100%;
                    padding:7px; margin-top:8px; font-size:12px; color:var(--color-text-secondary);
                    border:0.5px dashed var(--color-border-secondary); border-radius:6px;
                    background:none; cursor:pointer; transition:all .15s; }
      .lk-add-btn:hover { border-color:#0F4761; color:#0F4761; }

      .lk-src-info { display:flex; align-items:center; gap:8px; padding:8px 10px;
                     background:var(--color-background-secondary);
                     border:0.5px solid var(--color-border-tertiary); border-radius:6px;
                     margin-bottom:10px; }
      .lk-src-label { font-size:11px; color:var(--color-text-secondary); }
      .lk-src-var   { font-family:var(--font-mono); font-size:11px; color:#0F4761;
                      background:#E8F0F5; padding:2px 8px; border-radius:4px; }
      .lk-out-row   { display:flex; align-items:center; gap:6px; padding:8px 10px;
                      background:var(--color-background-secondary);
                      border:0.5px solid var(--color-border-tertiary); border-radius:6px; margin-top:10px; }
      .lk-out-label { font-size:11px; color:var(--color-text-secondary); flex:1; }
      .lk-out-var   { font-family:var(--font-mono); font-size:12px; color:#1B6B45; font-weight:500; }
      .lk-section-title { font-size:10px; font-weight:500; text-transform:uppercase;
                          letter-spacing:.06em; color:var(--color-text-secondary); margin:12px 0 8px; }
    </style>

    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
    <datalist id="${pfx}-wfd-lk-src-list">
      ${(typeof wfdData!=='undefined' && wfdData.metadata ? wfdData.metadata : [])
          .map(f => `<option value="${escHtml(f.name||f.nom||'')}"></option>`).join('')}
    </datalist>
    <datalist id="${pfx}-wfd-lk-tgt-list">
      ${_specFields.map(f => `<option value="${escHtml(f)}"></option>`).join('')}
    </datalist>

    <!-- Onglets -->
    <div class="lk-tabs">
      <button id="${pfx}-lk-tab-metier"    class="lk-tab ${isActiveMet?'active':''}"   onclick="lkSwitchTab('${pfx}','metier')">Champs</button>
      <button id="${pfx}-lk-tab-credits"   class="lk-tab ${isActiveCred?'active':''}"  onclick="lkSwitchTab('${pfx}','credits')">Crédits</button>
      <button id="${pfx}-lk-tab-technique" class="lk-tab ${isActiveTech?'active':''}"  onclick="lkSwitchTab('${pfx}','technique')">Technique</button>
    </div>

    <!-- ── ONGLET CHAMPS ────────────────────────────────── -->
    <div id="${pfx}-lk-tab-metier-panel" style="${!isActiveMet?'display:none':''}">

      <!-- Source & sortie condensées -->
      <div class="lk-src-info">
        <i class="ti ti-arrow-right-bar" style="font-size:14px; color:var(--color-text-secondary);" aria-hidden="true"></i>
        <span class="lk-src-label">Source</span>
        <input id="${pfx}-lk-input-var" class="cfg-input"
          style="flex:1; font-family:var(--font-mono); font-size:12px; max-width:180px;"
          list="${pfx}-wfd-var-list"
          value="${escHtml(cfg.lkInputVar||'')}" placeholder="Variable Fetch (ex: primeContents)">
        <button onclick="lkAutoPopulate('${pfx}')" class="cfg-btn"
          style="font-size:11px; padding:3px 10px; white-space:nowrap;">
          <i class="ti ti-wand" aria-hidden="true"></i> Générer
        </button>
        <div style="border-left:0.5px solid var(--color-border-tertiary); height:20px; margin:0 4px;"></div>
        <span class="lk-src-label">Sortie</span>
        <span style="font-family:var(--font-mono); font-size:12px; color:#888;">{</span>
        <input id="${pfx}-lk-output-var" class="cfg-input"
          style="width:120px; font-family:var(--font-mono); font-size:12px; color:#1B6B45;"
          value="${escHtml(cfg.lkOutputVar||'targetColPath')}" placeholder="variable_résultat">
        <span style="font-family:var(--font-mono); font-size:12px; color:#888;">}</span>
      </div>

      <!-- En-têtes colonnes -->
      <div class="lk-col-hdrs">
        <div class="lk-col-hdr">Champ Iconik</div>
        <div></div>
        <div class="lk-col-hdr">Champ API cible</div>
        <div class="lk-col-hdr">Type</div>
        <div class="lk-col-hdr" title="Fallback si vide"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></div>
        <div></div>
      </div>

      <!-- Lignes -->
      <div id="${pfx}-lk-rows">
        ${_regularRows.map((r, i) => rowHtml(r, i)).join('')}
      </div>

      <div id="${pfx}-lk-api-panel"></div>

      <button class="lk-add-btn" onclick="lkAddRow()">
        <i class="ti ti-plus" style="font-size:13px;" aria-hidden="true"></i>
        Ajouter un champ
      </button>

      <!-- Outils Import/Export/Template -->
      <div style="display:flex; gap:6px; margin-top:10px; padding-top:10px; border-top:0.5px solid var(--color-border-tertiary);">
        <button onclick="lkImport()" class="cfg-btn wfd-tab-btn">
          <i class="ti ti-upload" aria-hidden="true"></i> Import
        </button>
        <button onclick="lkExport()" class="cfg-btn wfd-tab-btn">
          <i class="ti ti-download" aria-hidden="true"></i> Export
        </button>
        <button onclick="lkChargerTemplate()" class="cfg-btn wfd-tab-btn">
          <i class="ti ti-folder" aria-hidden="true"></i> Template
        </button>
        <button onclick="lkSauvegarderTemplate()" class="cfg-btn" style="font-size:11px; padding:3px 10px; flex:1; color:#1B6B45; border-color:#9FE1CB;">
          <i class="ti ti-device-floppy" aria-hidden="true"></i> Sauver
        </button>
      </div>

      <!-- Fallback global -->
      <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
        <span style="font-size:11px; color:var(--color-text-secondary); white-space:nowrap;">Fallback global</span>
        <input id="${pfx}-lk-fallback" class="cfg-input"
          style="flex:1; font-family:var(--font-mono); font-size:11px;"
          list="${pfx}-wfd-var-list"
          value="${escHtml(cfg.lkFallback||'')}"
          placeholder="Laisser vide → port 'Non trouvé'">
      </div>

      <input type="file" id="${pfx}-lk-import-file" style="display:none" accept=".json,.csv" onchange="lkImportFile(this)">
    </div><!-- /onglet-champs -->

    <!-- ── ONGLET CRÉDITS ───────────────────────────────── -->
    <div id="${pfx}-lk-tab-credits-panel" style="${!isActiveCred?'display:none':''}">
      <div style="font-size:12px; color:var(--color-text-secondary); margin-bottom:12px; line-height:1.6;">
        Les crédits mappent des champs Iconik vers la liste <code class="wfd-fs11">persons[]</code> de l'API.
        Chaque ligne associe un champ Iconik à un rôle (director, narrator…).
      </div>

      <div style="display:grid; grid-template-columns:1fr 20px 80px 1fr 24px; gap:6px;
                  font-size:10px; color:var(--color-text-secondary); font-weight:500;
                  text-transform:uppercase; letter-spacing:.05em;
                  padding:0 0 6px; border-bottom:0.5px solid var(--color-border-tertiary); margin-bottom:4px;">
        <div>Champ Iconik</div>
        <div></div>
        <div>Cible</div>
        <div>Rôle dans l'API</div>
        <div></div>
      </div>

      <div id="${pfx}-lk-person-rows">
        ${_personRows.length
          ? _personRows.map((r, i) => personRowHtml(r, i)).join('')
          : `<div style="padding:16px; text-align:center; color:var(--color-text-secondary); font-size:12px; font-style:italic;">
               Aucun crédit configuré — cliquer "Ajouter un crédit" pour commencer.
             </div>`
        }
      </div>

      <button class="lk-add-btn" onclick="lkAddPersonRow('${pfx}')">
        <i class="ti ti-plus" style="font-size:13px;" aria-hidden="true"></i>
        Ajouter un crédit
      </button>

      <div style="margin-top:14px; padding:10px 12px; background:var(--color-background-secondary);
                  border-radius:var(--border-radius-md); font-size:11px; color:var(--color-text-secondary); line-height:1.6;">
        <i class="ti ti-info-circle" style="font-size:13px; vertical-align:-2px;" aria-hidden="true"></i>
        Si un champ Iconik est multi-valeur (tag cloud avec plusieurs noms), une entrée
        <code style="font-size:10px;">persons[]</code> est créée automatiquement pour chaque valeur.
      </div>
    </div><!-- /onglet-credits -->

    <!-- ── ONGLET TECHNIQUE ─────────────────────────────── -->
    <div id="${pfx}-lk-tab-technique-panel" style="${!isActiveTech?'display:none':''}">
      <div class="lk-section-title">Variable de stockage technique</div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-family:var(--font-mono); color:var(--color-text-secondary);">{</span>
        <input id="${pfx}-lk-tech-var" class="cfg-input"
          style="flex:1; font-family:var(--font-mono); font-size:12px;"
          value="${escHtml(cfg.lkTechVar||'assetTechnique')}" placeholder="assetTechnique">
        <span style="font-family:var(--font-mono); color:var(--color-text-secondary);">}</span>
      </div>

      <div class="lk-section-title" style="margin-top:16px;">Variables système</div>
      ${[
        ['asset_id',      "ID unique de l'asset Iconik"],
        ['asset_name',    "Nom de l'asset"],
        ['trigger_user',  "Utilisateur déclencheur"],
        ['workflow_name', "Nom du workflow"],
      ].map(([v, desc]) => `
        <div style="display:grid; grid-template-columns:140px 1fr; gap:8px; align-items:center;
                    padding:6px 0; border-bottom:0.5px solid var(--color-border-tertiary);">
          <code style="font-size:11px; color:#0F4761; background:#E8F0F5;
                       padding:2px 6px; border-radius:3px;">{${v}}</code>
          <span style="font-size:12px; color:var(--color-text-secondary);">${desc}</span>
        </div>`).join('')}

      <div class="lk-section-title" style="margin-top:16px;">Formats techniques (withFormats)</div>
      <div style="display:grid; grid-template-columns:130px 1fr 1fr; gap:6px;
                  font-size:10px; color:var(--color-text-secondary); padding-bottom:4px;
                  border-bottom:0.5px solid var(--color-border-tertiary); margin-bottom:4px;">
        <span>Variable</span><span>Description</span><span>Champ API cible</span>
      </div>
      ${[
        ['video_quality', 'SD / HD / UHD (calculé)',   cfg.lkTechMap?.video_quality || 'video_quality'],
        ['width',         'Largeur en pixels',            cfg.lkTechMap?.width         || ''],
        ['height',        'Hauteur en pixels',            cfg.lkTechMap?.height        || ''],
        ['duration',      'Durée en secondes',           cfg.lkTechMap?.duration      || 'duration'],
        ['fps',           'Images par seconde',           cfg.lkTechMap?.fps           || ''],
        ['bitrate',       'Débit binaire',               cfg.lkTechMap?.bitrate       || ''],
        ['video_codec',   'Codec vidéo',                 cfg.lkTechMap?.video_codec   || ''],
        ['audio_codec',   'Codec audio',                  cfg.lkTechMap?.audio_codec   || ''],
        ['container',     'Format conteneur',             cfg.lkTechMap?.container     || ''],
        ['file_size',     'Taille du fichier',            cfg.lkTechMap?.file_size     || ''],
      ].map(([v, desc, dst]) => `
        <div style="display:grid; grid-template-columns:130px 1fr 1fr; gap:6px; align-items:center;
                    padding:5px 0; border-bottom:0.5px solid var(--color-border-tertiary);">
          <code style="font-size:11px; color:#C0580A; background:#F9EBE4;
                       padding:2px 6px; border-radius:3px;">{${v}}</code>
          <span style="font-size:11px; color:var(--color-text-secondary);">${desc}</span>
          <input class="cfg-input lk-tech-map" data-var="${v}"
            style="font-size:11px; font-family:var(--font-mono); padding:3px 6px;"
            value="${dst}" placeholder="Champ API cible">
        </div>`).join('')}

      <div class="lk-section-title" style="margin-top:14px;">Règles de calcul</div>
      <div style="padding:10px 12px; background:var(--color-background-secondary);
                  border-radius:var(--border-radius-md); font-size:12px; color:var(--color-text-secondary);">
        <span style="font-family:var(--font-mono); color:#C0580A;">width × height</span>
        <span style="margin:0 8px;">→</span>
        <span style="font-family:var(--font-mono); color:#0F4761;">{video_quality}</span>
        <span style="margin-left:8px; font-size:11px;">≥3840 → UHD · ≥1920 → HD · ≥1280 → SD · sinon LD</span>
      </div>
    </div><!-- /onglet-technique -->

    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Ex : Mapper les champs Iconik vers VodFactory">${escHtml(cfg.description||'')}</textarea>
    </div>
    `;



} else if (family === 'http_sequence') {
  const steps = cfg.steps || [];
  const outConns = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : [])
    .filter(c => c.direction === 'outbound' || (!c.direction && !c.endpoint));
  const connOpts = outConns.map(c =>
    `<option value="${c.id}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name)} — ${escHtml(c.baseUrl||'')}</option>`
  ).join('');

  const stepHtml = (step, i) => {
    const mode    = step.httpMode || 'simple';
    const method  = step.method   || 'POST';
    const endpoint = step.endpoint || step.url || '';
    const modes   = ['action','simple','foreach','verify'];
    const modeLabels = { action:'Action', simple:'Requête simple', foreach:'Pour chaque valeur', verify:'Vérifier' };
    const selConn = outConns.find(c => c.id === (step.connexionId || cfg.connexionId));
    const actions = selConn?.actions || [];

    return `<div class="hseq-step" data-idx="${i}"
      style="border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);margin-bottom:10px;overflow:hidden;border-left:3px solid #3498db;">

      <!-- En-tête cliquable -->
      <div class="hseq-step-hdr" onclick="hseqToggleStep(this)"
        style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--color-background-secondary);cursor:pointer;user-select:none;">
        <span class="hseq-grip" style="font-size:14px;color:var(--color-text-secondary);cursor:grab;padding:0 2px;user-select:none;flex-shrink:0;" title="Glisser pour réordonner">⠿</span>
        <span style="width:20px;height:20px;border-radius:50%;background:#0a1a2a;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:#3498db;flex-shrink:0;">${i+1}</span>
        <span class="hseq-step-name" style="flex:1;font-size:13px;font-weight:500;color:var(--color-text-primary);">${escHtml(step.name || 'Étape ' + (i+1))}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:#E8F0F5;color:#0F4761;border:0.5px solid #B5D4F4;font-weight:500;">${method}</span>
        <span style="font-size:11px;color:var(--color-text-secondary);font-family:var(--font-mono);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(endpoint.split('/').slice(-2).join('/') || '—')}</span>
        <button onclick="hseqRemoveStep(this,event)" style="width:22px;height:22px;border-radius:4px;border:none;background:none;color:var(--color-text-secondary);cursor:pointer;font-size:14px;flex-shrink:0;" title="Supprimer">×</button>
        <i class="ti ti-chevron-down" style="font-size:14px;color:var(--color-text-secondary);transition:transform .2s;" aria-hidden="true"></i>
      </div>

      <!-- Corps de l'étape -->
      <div class="hseq-step-body" style="padding:10px 12px;display:none;">

        <!-- Nom -->
        <div class="wfd-hint-sec">Nom de l'étape</div>
        <input class="cfg-input hseq-name" value="${escHtml(step.name||'')}"
          placeholder="Ex : Créer le contenu" style="font-size:12px;margin-bottom:10px;"
          oninput="this.closest('.hseq-step').querySelector('.hseq-step-name').textContent=this.value||'Étape'">

        <!-- Méthode + Endpoint — toujours visibles -->
        <div style="display:grid;grid-template-columns:90px 1fr;gap:6px;margin-bottom:10px;">
          <div>
            <div class="wfd-hint-sec">Méthode</div>
            <select class="cfg-select hseq-method wfd-fs11"
              onchange="hseqUpdateHeader(this)">
              ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option${method===m?' selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="wfd-hint-sec">Endpoint</div>
            <input class="cfg-input hseq-endpoint wfd-mono-sm" value="${escHtml(endpoint)}"
              placeholder="/api/..."
              oninput="hseqUpdateHeader(this)" list="${pfx}-wfd-var-list">
          </div>
        </div>

        <!-- Onglets source de données -->
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;">Source des données</div>
        <div style="display:flex;gap:0;border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);overflow:hidden;margin-bottom:8px;">
          ${modes.map(m => `<button onclick="hseqModeChange(this,'${m}')" class="hseq-mode-btn${mode===m?' active':''}"
            data-mode="${m}"
            style="flex:1;padding:5px 2px;font-size:11px;border:none;border-left:0.5px solid var(--color-border-tertiary);cursor:pointer;
              background:${mode===m?'#0a1a2a':'transparent'};
              color:${mode===m?'#3498db':'var(--color-text-secondary)'};
              font-weight:${mode===m?'500':'400'};
              border-bottom:${mode===m?'2px solid #3498db':'2px solid transparent'};"
            >${modeLabels[m]}</button>`).join('')}
        </div>

        <!-- Panneaux source -->
        <div class="hseq-mode-panels">

          <!-- Action -->
          <div class="hseq-mode-action" style="${mode!=='action'?'display:none':''}">
            ${!actions.length
              ? `<div style="font-size:11px;color:var(--color-text-secondary);font-style:italic;">Aucune action configurée dans cette connexion.</div>`
              : `<div class="wfd-hint-sec">Action</div>
                 <select class="cfg-select hseq-action-id" style="font-size:11px;margin-bottom:6px;">
                   ${actions.map(a => `<option value="${a.id}" ${step.actionId===a.id?'selected':''}>${escHtml(a.name)} — ${a.method} ${escHtml(a.endpoint)}</option>`).join('')}
                 </select>
                 <div class="wfd-hint-sec">Payload source</div>
                 <input class="cfg-input hseq-source-var wfd-mono-sm" value="${escHtml(step.sourceVar||'')}"
                   placeholder="{vodFactoryPayload}"
                   list="${pfx}-wfd-var-list">`
            }
          </div>

          <!-- Requête simple -->
          <div class="hseq-mode-simple" style="${mode!=='simple'?'display:none':''}">
            <div class="wfd-hint-sec">Body JSON</div>
            <textarea class="cfg-textarea hseq-body wfd-mono-sm2" rows="3">${escHtml(step.bodyTemplate||step.body||'')}</textarea>
          </div>

          <!-- Pour chaque valeur -->
          <div class="hseq-mode-foreach" style="${mode!=='foreach'?'display:none':''}">
            <div class="wfd-hint-sec">Variable source (champ Iconik multi-valeur)</div>
            <input class="cfg-input hseq-fe-source" value="${escHtml(step.feSourceVar||'')}"
              placeholder="{Realisateur}" style="font-size:11px;font-family:var(--font-mono);margin-bottom:8px;"
              list="${pfx}-wfd-var-list">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <div class="wfd-hint-sec">Rôle (job)</div>
                <select class="cfg-select hseq-fe-job wfd-fs11">
                  ${(selConn?.roles?.length ? selConn.roles : ['director','producer','actor','writer','creator']).map(j =>
                    `<option value="${j}" ${(step.feJob||'director')===j?'selected':''}>${j}</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <div class="wfd-hint-sec">Codes à ignorer</div>
                <input class="cfg-input hseq-fe-ignore wfd-mono-sm"
                  value="${escHtml((step.feIgnoreCodes||[409,422]).join(', '))}"
                  placeholder="409, 422">
              </div>
            </div>
            <div class="wfd-hint-sec">Body JSON (par valeur)</div>
            <textarea class="cfg-textarea hseq-fe-body wfd-mono-sm2" rows="2"
              placeholder='{"name":"{{nom}}","external_id":"{{slug(nom)}}"}'>${escHtml(step.feBody||'')}</textarea>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
              <input type="checkbox" class="hseq-fe-append" id="hseq-append-${i}"
                ${step.feAppend?'checked':''} style="accent-color:#3498db;">
              <label for="hseq-append-${i}" style="font-size:11px;color:var(--color-text-secondary);cursor:pointer;">
                Ajouter au résultat existant (ne pas écraser)
              </label>
            </div>
          </div>

          <!-- Vérifier -->
          <div class="hseq-mode-verify" style="${mode!=='verify'?'display:none':''}">
            <div class="wfd-hint-sec">Champ à vérifier</div>
            <input class="cfg-input hseq-verify-path" value="${escHtml(step.verifyPath||'')}"
              placeholder="status" style="font-size:11px;font-family:var(--font-mono);margin-bottom:6px;">
            <div class="wfd-hint-sec">Valeur attendue</div>
            <input class="cfg-input hseq-verify-expected wfd-mono-sm" value="${escHtml(step.verifyExpected||'')}"
              placeholder="COMPLETED">
          </div>

        </div><!-- /mode-panels -->

        <!-- Résultat + comportement sur erreur -->
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:0.5px solid var(--color-border-tertiary);">
          <span style="font-size:11px;color:var(--color-text-secondary);white-space:nowrap;">Résultat →</span>
          <span class="wfd-mono-sec-12">{</span>
          <input class="cfg-input hseq-result-var" value="${escHtml(step.resultVar||('step'+(i+1)+'_result'))}"
            style="width:140px;font-family:var(--font-mono);font-size:12px;color:#1B6B45;"
            list="${pfx}-wfd-var-list">
          <span class="wfd-mono-sec-12">}</span>
          <select class="cfg-select hseq-on-error" style="font-size:11px;margin-left:auto;width:auto;">
            <option value="stop"     ${(!step.onError||step.onError==='stop')    ?'selected':''}>Arrêter si erreur</option>
            <option value="continue" ${step.onError==='continue'?'selected':''}>Continuer si erreur</option>
          </select>
        </div>

      </div><!-- /step-body -->
    </div>`;
  };

  html += `
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}

    <div class="cfg-field">
      <label class="cfg-label">Connexion principale</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-hseq-conn" class="cfg-select wfd-flex1">
          <option value="">— Sélectionner une connexion —</option>
          ${connOpts}
        </select>
        <button class="cfg-btn" onclick="ouvrirRessources('connexions')" style="padding:6px 10px;" title="Gérer les connexions">⚙</button>
      </div>
    </div>

    <div class="wfd-row-sb-mb6">
      <span style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-secondary);">Étapes</span>
      <button onclick="hseqAddStep('${pfx}')" class="cfg-btn" style="font-size:11px;padding:3px 10px;">
        <i class="ti ti-plus" aria-hidden="true"></i> Ajouter une étape
      </button>
    </div>

    <div id="${pfx}-hseq-steps">
      ${steps.map((s, i) => stepHtml(s, i)).join('')}
      ${!steps.length ? `<div class="hseq-empty-msg" style="padding:16px;text-align:center;font-size:12px;color:var(--color-text-secondary);font-style:italic;border:0.5px dashed var(--color-border-secondary);border-radius:var(--border-radius-md);">Aucune étape — cliquer "Ajouter une étape"</div>` : ''}
    </div>

    <div class="cfg-field wfd-mt8">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Ex : Publication vers VodFactory">${escHtml(cfg.description||'')}</textarea>
    </div>`;

  // Init drag après rendu — pfx est une variable JS ici, pas un template literal
  html += `<script>setTimeout(function(){if(typeof hseqInitDrag==='function')hseqInitDrag('${pfx}');},80);<\/script>`;


  // ── DECISION ─────────────────────────────────────────────────────────────────
  } else if (family === 'decision') {
    const allMeta = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
    const conds   = cfg.conditions || [];
    html += `
    ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
	<datalist id="${pfx}-decision-meta-list">${allMeta.map(m => `<option value="{${m}}">`).join('')}</datalist>
    <div class="cfg-field">
      <label class="cfg-label">Variable à évaluer</label>
      <input id="${pfx}-field" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
        value="${escHtml(cfg.field||'')}"
        placeholder="ex : {asset.metadata.destinations_pad}">
      <div class="wfd-hint-top3">Utilisez <code>{variable}</code> — ex: <code>{asset.metadata.statut}</code></div>
    </div>
    <div>
      <div class="wfd-row-sb-mb6">
        <span class="cfg-label">Sorties conditionnelles</span>
        <button class="cfg-btn wfd-pad-3-10b" onclick="ajouterCondition()">+ Ajouter</button>
      </div>
      <div id="${pfx}-conditions" class="wfd-col-gap5">
        ${conds.map((c,i) => buildConditionRow(i,c, pfx)).join('')}
        ${!conds.length ? '<div style="color:#444;font-size:11px;padding:4px 0;">— Aucune condition, ajoutez des sorties.</div>' : ''}
      </div>
    </div>
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;padding:8px 12px;display:flex;align-items:center;gap:8px;margin-top:4px;">
      <span style="width:10px;height:10px;border-radius:50%;background:#95a5a6;flex-shrink:0;display:inline-block;"></span>
      <div class="wfd-flex1">
        <div style="font-size:12px;color:#ccc;font-weight:600;">Port par défaut</div>
        <div style="font-size:10px;color:#555;margin-top:2px;">Activé si aucune condition n'est remplie — toujours présent, non supprimable</div>
      </div>
      <input id="${pfx}-default-label" class="cfg-input" style="width:120px;font-size:11px;"
        value="${escHtml(cfg.defaultLabel||'Par défaut')}" placeholder="Par défaut">
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Ex : Brancher selon la destination PAD…">${escHtml(cfg.description||'')}</textarea>
    </div>`;


  // ── SOURCE ───────────────────────────────────────────────────────────────────

  // ── LISTENER ─────────────────────────────────────────────────────────────────
  } else if (family === 'listener') {
    const connOpts = wfdConnexions.map(c =>
      `<option value="${c.id}" ${cfg.connexionId===c.id?'selected':''}>${escHtml(c.name)} (${c.endpoint||''})</option>`
    ).join('');
    const selConn = wfdConnexions.find(c=>c.id===cfg.connexionId);
    const mapOpts = (selConn?.mappings||[]).map(m =>
      `<option value="${m.id}" ${cfg.mappingId===m.id?'selected':''}>${escHtml(m.name)}</option>`).join('');
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Connexion externe</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-listener-conn" class="cfg-select wfd-flex1" onchange="_listenerConnChange('${pfx}')">
          <option value="">— Sélectionner une connexion —</option>${connOpts}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="ouvrirRessources('connexions')" title="Gérer les connexions">⚙</button>
      </div>
      ${!wfdConnexions.length ? `<div style="font-size:10px;color:#e67e22;margin-top:4px;">
        Aucune connexion configurée — créez-en une dans Ressources → Connexions</div>` : ''}
    </div>
    <div id="${pfx}-listener-map-wrap" class="cfg-field" style="${selConn?'':'display:none'}">
      <label class="cfg-label">Mapping de payload</label>
      <select id="${pfx}-listener-mapping" class="cfg-select">
        <option value="">— Aucun (payload brut) —</option>${mapOpts}
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Notes sur ce listener…">${cfg.description||''}</textarea>
    </div>

    <!-- ── TEST LISTENER ── -->
    <div style="margin-top:12px;border-top:1px solid #1e1e1e;padding-top:12px;">
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label wfd-m0">🧪 TESTER CE LISTENER</span>
        <button onclick="wfdListenerSimToggle('${pfx}')" id="${pfx}-lsim-toggle"
          style="font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid #2a2a2a;
            background:transparent;color:#c0392b;cursor:pointer;">Afficher</button>
      </div>
      <div id="${pfx}-lsim-wrap" style="display:none;">
        <div class="cfg-hint wfd-mb8">
          Envoie un POST réel vers <code>localhost:2880${selConn?.endpoint || '/wfd/listener/...'}</code>
          avec le token configuré. Le workflow s'exécute exactement comme si le système tiers avait appelé.
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Payload JSON</label>
          <textarea id="${pfx}-lsim-payload" class="cfg-textarea wfd-mono-sm2" rows="8"
            placeholder='{ "asset_id": "TEST-123" }'>${
              JSON.stringify({ asset_id:'ASSET-ID-TEST', action:'test', timestamp: new Date().toISOString() }, null, 2)
            }</textarea>
          <div id="${pfx}-lsim-error" style="font-size:10px;color:#e74c3c;margin-top:3px;display:none;"></div>
        </div>
        <button onclick="wfdListenerSimRun('${pfx}')"
          style="width:100%;padding:10px;border-radius:5px;border:1px solid #c0392b;
            background:rgba(192,57,43,0.12);color:#e74c3c;font-size:12px;font-weight:600;cursor:pointer;">
          📡 Envoyer la requête vers localhost:2880
        </button>
        <div id="${pfx}-lsim-result" style="display:none;margin-top:10px;padding:10px;
          background:#0a0a0a;border:1px solid #2a2a2a;border-radius:5px;">
          <div class="wfd-hint-mb6">RÉPONSE HTTP</div>
          <div id="${pfx}-lsim-result-status" style="font-size:12px;font-weight:600;margin-bottom:4px;"></div>
          <div id="${pfx}-lsim-result-body" style="font-family:var(--font-mono);font-size:10px;
            color:#888;white-space:pre-wrap;word-break:break-all;max-height:150px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>
    `;

  // ── WATCHFOLDER ───────────────────────────────────────────────────────────────
  } else if (family === 'timer') {
    const _tMode  = cfg.timerMode || 'interval';
    const _tModes = [
      ['interval','🔁','Intervalle', 'Toutes les X minutes/heures'],
      ['cron',    '📅','Planification','Jours et heures précis'],
      ['oneshot', '🎯','Une seule fois','À une date exacte'],
    ];
    const _cronFreq   = cfg.cronFreq   || 'daily';
    const _cronDays   = cfg.cronDays   || [1,2,3,4,5];
    const _cronHour   = cfg.cronHour   !== undefined ? cfg.cronHour   : 9;
    const _cronMinute = cfg.cronMinute !== undefined ? cfg.cronMinute : 0;
    const _daysLabels = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Type de déclenchement</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
        ${_tModes.map(([val,icon,label,hint]) => `
          <button onclick="wfdTimerModeChange('${pfx}','${val}')" id="${pfx}-timer-mode-${val}"
            style="padding:8px 4px;border-radius:6px;cursor:pointer;text-align:center;transition:all .15s;
              border:2px solid ${_tMode===val?'#8e44ad':'#2a2a2a'};
              background:${_tMode===val?'rgba(142,68,173,0.15)':'transparent'};
              color:${_tMode===val?'#c39bd3':'#666'};">
            <div style="font-size:18px;">${icon}</div>
            <div style="font-size:11px;font-weight:600;margin-top:3px;">${label}</div>
            <div style="font-size:9px;color:#555;margin-top:2px;">${hint}</div>
          </button>`).join('')}
      </div>
    </div>

    <div id="${pfx}-timer-interval-wrap" style="${_tMode==='interval'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Répéter toutes les</label>
        <div style="display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;">
          <input id="${pfx}-timer-interval-val" type="number" min="1" class="cfg-input"
            value="${cfg.intervalVal||'30'}">
          <select id="${pfx}-timer-interval-unit" class="cfg-select">
            <option value="minutes" ${(cfg.intervalUnit||'minutes')==='minutes'?'selected':''}>Minutes</option>
            <option value="hours"   ${cfg.intervalUnit==='hours'              ?'selected':''}>Heures</option>
            <option value="days"    ${cfg.intervalUnit==='days'               ?'selected':''}>Jours</option>
          </select>
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">À partir de</label>
        <input id="${pfx}-timer-interval-start" type="time" class="cfg-input"
          value="${cfg.intervalStart||'09:00'}">
      </div>
    </div>

    <div id="${pfx}-timer-cron-wrap" style="${_tMode==='cron'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Fréquence</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">
          ${[['hourly','⏰','Chaque heure'],['daily','☀️','Chaque jour'],['weekly','📆','Chaque semaine'],['monthly','🗓️','Chaque mois']].map(([val,icon,label]) => `
            <button onclick="wfdCronFreqChange('${pfx}','${val}')" id="${pfx}-cron-freq-${val}"
              style="padding:7px 4px;border-radius:5px;font-size:11px;cursor:pointer;text-align:center;transition:all .15s;
                border:2px solid ${_cronFreq===val?'#8e44ad':'#2a2a2a'};
                background:${_cronFreq===val?'rgba(142,68,173,0.12)':'transparent'};
                color:${_cronFreq===val?'#c39bd3':'#666'};">
              <div>${icon}</div><div style="margin-top:2px;">${label}</div>
            </button>`).join('')}
        </div>
      </div>
      <div id="${pfx}-cron-days-wrap" class="cfg-field" style="${_cronFreq==='weekly'?'':'display:none'}">
        <label class="cfg-label">Jours de la semaine</label>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${_daysLabels.map((d,i) => `
            <button onclick="wfdCronDayToggle('${pfx}',${i})" id="${pfx}-cron-day-${i}"
              class="wfd-cron-day ${_cronDays.includes(i)?'active-purple':'inactive-btn'}">
              ${d}
            </button>`).join('')}
        </div>
      </div>
      <div id="${pfx}-cron-mday-wrap" class="cfg-field" style="${_cronFreq==='monthly'?'':'display:none'}">
        <label class="cfg-label">Jour du mois</label>
        <div class="wfd-row-gap6c">
          <input id="${pfx}-cron-mday" type="number" min="1" max="31"
            class="cfg-input wfd-w80" value="${cfg.cronMday||'1'}">
          <span class="wfd-text-555-11b">de chaque mois</span>
        </div>
      </div>
      <div id="${pfx}-cron-time-wrap" class="cfg-field" style="${_cronFreq==='hourly'?'display:none':''}">
        <label class="cfg-label">À quelle heure</label>
        <div class="wfd-grid-2-gap8">
          <div>
            <div style="font-size:10px;color:#777;margin-bottom:4px;">Heure</div>
            <select id="${pfx}-cron-hour" class="cfg-select" onchange="wfdCronUpdateSummary('${pfx}')">
              ${Array.from({length:24},(_,h)=>`<option value="${h}" ${_cronHour==h?'selected':''}>${String(h).padStart(2,'0')}h</option>`).join('')}
            </select>
          </div>
          <div>
            <div style="font-size:10px;color:#777;margin-bottom:4px;">Minutes</div>
            <select id="${pfx}-cron-minute" class="cfg-select" onchange="wfdCronUpdateSummary('${pfx}')">
              ${[0,5,10,15,20,25,30,35,40,45,50,55].map(m=>`<option value="${m}" ${_cronMinute==m?'selected':''}>${String(m).padStart(2,'0')}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div id="${pfx}-cron-summary" style="margin-top:10px;padding:10px 14px;
        background:rgba(142,68,173,0.08);border:1px solid rgba(142,68,173,0.25);
        border-radius:6px;font-size:12px;color:#c39bd3;line-height:1.5;">
        <span style="font-size:10px;color:#666;display:block;margin-bottom:3px;">CE WORKFLOW SE DÉCLENCHERA</span>
        <span id="${pfx}-cron-summary-text" style="font-weight:600;">
          ${_wfdCronSummaryText(_cronFreq,_cronDays,_cronHour,_cronMinute,cfg.cronMday||1)}
        </span>
      </div>
      <details style="font-size:10px;color:#444;margin-top:6px;">
        <summary style="cursor:pointer;color:#555;">Voir l'expression cron générée</summary>
        <div style="margin-top:4px;padding:6px 10px;background:#111;border-radius:4px;
          font-family:var(--font-mono);color:#666;" id="${pfx}-cron-expr-display">
          ${_wfdBuildCronExpr(_cronFreq,_cronDays,_cronHour,_cronMinute,cfg.cronMday||1)}
        </div>
      </details>
    </div>

    <div id="${pfx}-timer-oneshot-wrap" style="${_tMode==='oneshot'?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Date et heure d'exécution</label>
        <input id="${pfx}-timer-oneshot-dt" type="datetime-local" class="cfg-input"
          value="${cfg.oneshotDatetime||''}">
        <div class="cfg-hint">Le workflow se déclenchera une seule fois à cette date et heure exactes.</div>
      </div>
    </div>

    <div class="cfg-field">
      <label class="cfg-label">Fuseau horaire</label>
      <select id="${pfx}-timer-tz" class="cfg-select">
        ${['Europe/Paris','Europe/London','America/New_York','America/Los_Angeles','Asia/Tokyo','UTC'].map(tz=>
          `<option value="${tz}" ${(cfg.timezone||'Europe/Paris')===tz?'selected':''}>${tz}</option>`
        ).join('')}
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Notes sur cette planification…">${escHtml(cfg.description||'')}</textarea>
    </div>
    <div class="cfg-hint" style="padding:8px 12px;background:rgba(142,68,173,0.06);border:1px solid rgba(142,68,173,0.15);border-radius:5px;">
      ⚠️ Le timer démarre le workflow sans données initiales. Connectez un nœud <strong>Récupérer</strong> juste après pour charger les assets à traiter.
    </div>
  `;

  } else if (family === 'watchfolder') {
    const wfVariants = {
      s3:'☁️ Amazon S3', ftp:'📡 FTP', sftp:'🔒 SFTP',
      gcs:'☁️ Google Cloud Storage', azure:'☁️ Azure Blob Storage', local:'📂 Dossier local',
    };
    const isCredentials = Object.keys(wfVariants).includes(cfg.variant||'s3');
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Type de stockage</label>
      <select id="${pfx}-variant" class="cfg-select" onchange="_variantChange('${pfx}')">
        ${Object.entries(wfVariants).map(([k,v])=>`<option value="${k}" ${(cfg.variant||'s3')===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Type de média</label>
      <select id="${pfx}-media-type" class="cfg-select" onchange="_mediaTypeChange('${pfx}')">
        <option value="media"       ${(cfg.mediaType||'media')==='media'      ?'selected':''}>🎬 Média seul</option>
        <option value="sidecar"     ${cfg.mediaType==='sidecar'               ?'selected':''}>📦 Média + Sidecar (XML/CSV)</option>
        <option value="sidecar_only"${cfg.mediaType==='sidecar_only'          ?'selected':''}>📋 Sidecar seul (sans média)</option>
      </select>
    </div>
    <div id="${pfx}-sidecar-wrap" class="cfg-field${cfg.mediaType==='sidecar'||cfg.mediaType==='sidecar_only'?'':' wfd-hidden'}">
      <label class="cfg-label">Format sidecar</label>
      <input id="${pfx}-sidecar-format" class="cfg-input" value="${cfg.sidecarFormat||''}" placeholder="ex : Dublin Core XML, CSV col A → Titre…">
    </div>
    <div id="${pfx}-row-formats" class="cfg-field">
      <label class="cfg-label">Extensions surveillées</label>
      <input id="${pfx}-formats" class="cfg-input" value="${cfg.formats||''}" placeholder="MXF, MP4, MOV…">
    </div>
    <div id="${pfx}-row-credentials">
      ${buildSourceCredentials(cfg)}
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Notes…">${cfg.description||''}</textarea>
    </div>`;

  // ── TRIGGER ───────────────────────────────────────────────────────────────────
  } else if (family === 'trigger') {
    const eventOpts = Object.entries(TRIGGER_EVENTS)
      .map(([k,v]) => `<option value="${k}" ${cfg.eventType===k?'selected':''}>${v.icon} ${v.label}</option>`)
      .join('');
    const ev     = cfg.eventType ? TRIGGER_EVENTS[cfg.eventType] : null;
    const fields = ev?.fields || [];
    const allMeta = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
    const caOpts  = (wfdData.customActions||[]).map(a =>
      `<option value="${a.id||a.nom}" ${cfg.customActionId===(a.id||a.nom)?'selected':''}>${a.title||a.nom||a.name||a.id}</option>`).join('');
    const whOpts  = (wfdData.webhooks||[]).map(w =>
      `<option value="${w.id||w.nom}" ${cfg.webhookId===(w.id||w.nom)?'selected':''}>${w.nom||w.name}</option>`).join('');
    html += `
    <datalist id="${pfx}-meta-list">${allMeta.map(m=>`<option value="${m}">`).join('')}</datalist>
    <div class="cfg-field">
      <label class="cfg-label">Événement déclencheur</label>
      <select id="${pfx}-event-type" class="cfg-select" onchange="_triggerEventChange('${pfx}')">
        <option value="">— Sélectionner —</option>
        ${eventOpts}
      </select>
    </div>
    <div id="${pfx}-trigger-field-wrap" class="cfg-field" style="${fields.includes('field')?'':'display:none'}">
      <label class="cfg-label">Champ metadata</label>
      <input id="${pfx}-trigger-field" class="cfg-input" list="${pfx}-meta-list"
        value="${cfg.triggerField||''}" placeholder="Filtrer les champs… (ex: pad, titre, statut)" autocomplete="off">
      <div class="wfd-hint-top3">${allMeta.length} champs disponibles</div>
    </div>
    <div id="${pfx}-trigger-cond-wrap" class="cfg-field" style="${fields.includes('condition')?'':'display:none'}">
      <label class="cfg-label">Condition</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-trigger-condition" class="cfg-select wfd-flex1" onchange="_triggerCondChange('${pfx}')">
          ${Object.entries(TRIGGER_CONDITIONS).map(([k,v])=>
            `<option value="${k}" ${cfg.triggerCondition===k?'selected':''}>${v}</option>`).join('')}
        </select>
        <input id="${pfx}-trigger-value" class="cfg-input wfd-flex1"
          value="${cfg.triggerValue||''}" placeholder="Valeur…"
          ${TRIGGER_CONDITIONS_NO_VALUE.has(cfg.triggerCondition)?'style="display:none"':''}>
      </div>
    </div>
    <div id="${pfx}-trigger-col-wrap" class="cfg-field" style="${fields.includes('collection')?'':'display:none'}">
      <label class="cfg-label">Collection</label>
      ${wfdColTreeHtml(`${pfx}-trig`, JSON.stringify(cfg.collectionIds||(cfg.collectionId?[cfg.collectionId]:[])))};
    </div>
    <div id="${pfx}-trigger-ca-wrap" class="cfg-field" style="${fields.includes('custom_action_id')?'':'display:none'}">
      <label class="cfg-label">Custom Action</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-custom-action-id" class="cfg-select wfd-flex1">
          <option value="">— Sélectionner —</option>${caOpts}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="syncTriggerRefs()" title="Synchroniser depuis Iconik">↺</button>
      </div>
    </div>
    <div id="${pfx}-trigger-wh-wrap" class="cfg-field" style="${fields.includes('webhook_id')?'':'display:none'}">
      <label class="cfg-label">Webhook Iconik</label>
      <div class="wfd-row-gap6b">
        <select id="${pfx}-webhook-id" class="cfg-select wfd-flex1">
          <option value="">— Sélectionner —</option>${whOpts}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="syncTriggerRefs()" title="Synchroniser depuis Iconik">↺</button>
      </div>
    </div>
    <div id="${pfx}-trigger-status-wrap" class="cfg-field" style="${fields.includes('status_value')?'':'display:none'}">
      <label class="cfg-label">Nouveau statut</label>
      <input id="${pfx}-trigger-status" class="cfg-input" value="${cfg.statusValue||''}" placeholder="ex: APPROVED, REJECTED…">
    </div>
    <div id="${pfx}-trigger-job-wrap" class="cfg-field" style="${fields.includes('job_type')?'':'display:none'}">
      <label class="cfg-label">Type de job</label>
      <input id="${pfx}-trigger-job" class="cfg-input" value="${cfg.jobType||''}" placeholder="ex: TRANSCODING, KEYFRAME…">
    </div>
    <div id="${pfx}-trigger-mdview-wrap" class="cfg-field" style="${fields.includes('mdview')?'':'display:none'}">
      <label class="cfg-label">${cfg.eventType==='saved_search'?'Vue métadonnées des résultats':'Vue metadata (contexte complet)'}</label>
      <select id="${pfx}-trigger-mdview" class="cfg-select">
        <option value="">— Aucune —</option>
        ${(wfdData.mdViews||[]).map(v=>`<option value="${v.id||v.name}" ${cfg.mdViewId===(v.id||v.name)?'selected':''}>${v.name||v.id}</option>`).join('')}
      </select>
    </div>
    <div id="${pfx}-trigger-ss-wrap" class="cfg-field" style="${fields.includes('saved_search_id')?'':'display:none'}">
      <label class="cfg-label">Saved Search</label>
      ${(wfdData.savedSearches||[]).length ? `
      <div class="wfd-row-gap6b">
        <select id="${pfx}-saved-search-id" class="cfg-select wfd-flex1">
          <option value="">— Sélectionner —</option>
          ${(wfdData.savedSearches||[]).map(s=>`<option value="${s.id||s.nom}" ${cfg.savedSearchId===(s.id||s.nom)?'selected':''}>${escHtml(s.nom||s.name||s.id)}</option>`).join('')}
        </select>
        <button class="cfg-btn wfd-pad-6-8" onclick="syncTriggerRefs()">↺</button>
      </div>` : `
      <div class="wfd-row-gap6b">
        <input id="${pfx}-saved-search-id" class="cfg-input wfd-flex1-mono"
          value="${escHtml(cfg.savedSearchId||'')}" placeholder="ID ou nom de la Saved Search">
        <button class="cfg-btn wfd-pad-6-8" onclick="syncTriggerRefs()">↺</button>
      </div>`}
    </div>
    <div id="${pfx}-trigger-poll-wrap" style="${fields.includes('poll_interval')?'':'display:none'}">
      <div class="cfg-field">
        <label class="cfg-label">Intervalle de polling</label>
        <div style="display:grid;grid-template-columns:1fr 120px;gap:6px;">
          <input id="${pfx}-poll-interval" class="cfg-input" type="number" min="1"
            value="${cfg.pollInterval||'15'}" placeholder="15">
          <select id="${pfx}-poll-unit" class="cfg-select">
            ${[['minutes','Minutes'],['hours','Heures'],['days','Jours']].map(([k,v])=>`<option value="${k}" ${(cfg.pollUnit||'minutes')===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Mode de traitement des résultats</label>
        <select id="${pfx}-poll-mode" class="cfg-select">
          <option value="each"  ${(cfg.pollMode||'each')==='each' ?'selected':''}>🔁 Chaque résultat séparément</option>
          <option value="batch" ${cfg.pollMode==='batch'          ?'selected':''}>📦 Tous les résultats en une fois</option>
        </select>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Limite de résultats par exécution</label>
        <input id="${pfx}-poll-limit" class="cfg-input" type="number" min="1" max="500"
          value="${cfg.pollLimit||'100'}" placeholder="100">
      </div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2" placeholder="Notes sur ce déclencheur…">${cfg.description||''}</textarea>
    </div>

    <!-- ── ENDPOINT WFD ── -->
    <div class="cfg-field" style="margin-top:8px;padding:10px 12px;
      background:#0a1a0a;border:1px solid #1a3a1a;border-radius:6px;">
      <label class="cfg-label wfd-c-green2">🔗 ENDPOINT WFD</label>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
        <span style="font-size:11px;color:#555;font-family:var(--font-mono);white-space:nowrap;">/wfd/action/</span>
        <input id="${pfx}-wfd-slug" class="cfg-input"
          style="font-family:var(--font-mono);font-size:13px;font-weight:600;
            color:#2ecc71;background:#0a140a;border-color:#2d5a2d;"
          value="${escHtml(cfg.wfdSlug||'')}"
          placeholder="mon-workflow"
          oninput="wfdSlugUpdate('${pfx}')">
      </div>
      <div class="wfd-hint-mt6">
        URL complète :
        <span id="${pfx}-wfd-slug-preview" style="color:#27ae60;font-family:var(--font-mono);">
          ${cfg.wfdSlug ? '/wfd/action/'+escHtml(cfg.wfdSlug) : '—'}
        </span>
      </div>
      <div style="margin-top:4px;font-size:10px;color:#444;">
        À copier dans Iconik → Admin → Custom Actions ou Webhooks
      </div>
    </div>

    <!-- ── SIMULATION PAYLOAD ── -->
    <div style="margin-top:12px;border-top:1px solid #1e1e1e;padding-top:12px;">
      <div class="wfd-row-sb-mb8b">
        <span class="cfg-label wfd-m0">🧪 TESTER CE DÉCLENCHEUR</span>
        <button onclick="wfdTriggerSimToggle('${pfx}')" id="${pfx}-sim-toggle"
          style="font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid #2a2a2a;
            background:transparent;color:#8e44ad;cursor:pointer;">Afficher</button>
      </div>
      <div id="${pfx}-sim-wrap" style="display:none;">
        <div class="cfg-hint wfd-mb8">
          Simule un appel webhook entrant avec le payload ci-dessous.
          Le workflow s'exécute exactement comme en production, sans envoyer quoi que ce soit à Iconik.
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Base de départ</label>
          <div class="wfd-row-gap6b">
            <select id="${pfx}-sim-template" class="cfg-select wfd-flex1"
              onchange="wfdTriggerSimLoadTemplate('${pfx}')">
              <option value="custom">— JSON libre —</option>
              <option value="metadata_changed"    ${(cfg.eventType||'')==='metadata_changed'   ?'selected':''}>🏷 Metadata changée</option>
              <option value="asset_created"       ${(cfg.eventType||'')==='asset_created'      ?'selected':''}>✨ Asset créé</option>
              <option value="asset_status_changed"${(cfg.eventType||'')==='asset_status_changed'?'selected':''}>🔄 Statut changé</option>
              <option value="asset_added_collection"${(cfg.eventType||'')==='asset_added_collection'?'selected':''}>📁 Asset ajouté collection</option>
              <option value="proxy_available"     ${(cfg.eventType||'')==='proxy_available'    ?'selected':''}>🎬 Proxy disponible</option>
              <option value="job_finished"        ${(cfg.eventType||'')==='job_finished'       ?'selected':''}>✅ Job terminé</option>
              <option value="custom_action"       ${(cfg.eventType||'')==='custom_action'      ?'selected':''}>⚡ Custom Action</option>
              <option value="watchfolder">📂 Watchfolder (fichier)</option>
              <option value="manual_empty">🧪 Contexte vide (timer/manuel)</option>
            </select>
            <button onclick="wfdTriggerSimLoadTemplate('${pfx}')"
              style="font-size:10px;padding:4px 8px;border-radius:3px;border:1px solid #2a2a2a;
                background:transparent;color:#555;cursor:pointer;" title="Recharger">↺</button>
          </div>
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Payload JSON</label>
          <textarea id="${pfx}-sim-payload" class="cfg-textarea wfd-mono-sm2" rows="12" placeholder="{}"></textarea>
          <div id="${pfx}-sim-error" style="font-size:10px;color:#e74c3c;margin-top:3px;display:none;"></div>
        </div>
        <button onclick="wfdTriggerSimRun('${pfx}')"
          style="width:100%;padding:10px;border-radius:5px;border:1px solid #8e44ad;
            background:rgba(142,68,173,0.15);color:#c39bd3;font-size:12px;font-weight:600;
            cursor:pointer;">▶ Exécuter ce flux avec ce payload</button>
        <div id="${pfx}-sim-result" style="display:none;margin-top:10px;padding:10px;
          background:#0a0a0a;border:1px solid #2a2a2a;border-radius:5px;">
          <div class="wfd-hint-mb6">RÉSULTAT D'EXÉCUTION</div>
          <div id="${pfx}-sim-result-status" style="font-size:12px;font-weight:600;margin-bottom:6px;"></div>
          <div id="${pfx}-sim-result-body" style="font-family:var(--font-mono);font-size:10px;
            color:#888;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>
    `;

  }  // end trigger

  if (family === 'manual') {
    const payloadStr = cfg.payload
      ? JSON.stringify(cfg.payload, null, 2)
      : '{ "asset": { "id": "ASSET-ID-ICI" } }';
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Payload JSON à injecter</label>
      <div class="cfg-hint wfd-mb6b">
        Ce payload initialise le contexte d'exécution.
        Les clés <code>asset</code>, <code>collection</code>, <code>vars</code>
        sont accessibles via <code>{asset.id}</code>, <code>{vars.maVar}</code>, etc.
      </div>
      <textarea id="${pfx}-manual-payload" class="cfg-textarea wfd-mono-sm2" rows="10"
        placeholder='{ "asset": { "id": "..." } }'>${escHtml(payloadStr)}</textarea>
      <div id="${pfx}-manual-payload-error"
        style="font-size:10px;color:#e74c3c;margin-top:4px;display:none;"></div>
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Nom du test</label>
      <input id="${pfx}-manual-label" class="cfg-input"
        value="${escHtml(cfg.label||'')}"
        placeholder="Ex: Test asset existant, Test watchfolder…">
    </div>
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Notes sur ce test…">${escHtml(cfg.description||'')}</textarea>
    </div>
    <button class="cfg-btn" style="width:100%;padding:8px;background:#1a1a1a;
      border:1px solid #2a2a2a;color:#95a5a6;font-size:12px;border-radius:4px;cursor:pointer;"
      onclick="wfdValidateManualPayload('${pfx}')">
      🧪 Valider le JSON
    </button>
  `;
  }

  // Description générique (familles sans champ dédié)
  // Vérifie id="${pfx}-description" OU id="${pfx}-xx-description" (tout suffixe),
  // au lieu d'une liste figée de suffixes connus qui s'oublie à chaque nouvelle famille.
  if (!new RegExp('id="' + pfx + '(-[a-z]+)?-description"').test(html)) {
    html += `
    <div class="cfg-field">
      <label class="cfg-label">Description</label>
      <textarea id="${pfx}-description" class="cfg-textarea" rows="2"
        placeholder="Description de ce nœud...">${cfg.description||''}</textarea>
    </div>`;
  }

  // ── En cas d'erreur — commun à tous les nœuds sauf exclus ──────────────
  html += buildOnErrorField(pfx, cfg, family);
  return html;
}

function buildConfigBody(node) {
  const c = node.config || {};
  return buildCfgFields('cfg', node.family, c);
}

function sauvegarderConfig() {
  const flux = getFluxCourant();
  if (!flux || !selectedNodeId) return;
  const node = flux.nodes.find(n=>n.id===selectedNodeId);
  if (!node) return;

  // ── Environnement Iconik (commun à tous les nœuds API) ───────
  const _envSel = document.getElementById('cfg-iconik-env');
  if (_envSel !== null) {
    node.config.iconikEnv = _envSel.value || null;
  }

  // ── Export Word — saut de page avant ce nœud (commun à tous) ─
  const _pbEl = document.getElementById('cfg-page-break-before');
  if (_pbEl !== null) node.config.pageBreakBefore = _pbEl.checked;
  const _oeEl = document.getElementById('cfg-onerror-val');
  if (_oeEl !== null) node.config.onError = _oeEl.value || 'stop';
  // ── En cas d'erreur (commun à tous les nœuds qui l'affichent) ──

  // Lire les champs cfg-
  const g = id => document.getElementById('cfg-'+id)?.value || '';
  if (node.family==='trigger') {
    node.config.eventType        = g('event-type');
    node.config.triggerField     = g('trigger-field');
    node.config.triggerCondition = g('trigger-condition');
    node.config.triggerValue     = g('trigger-value');
    const _colRaw2 = document.getElementById('cfg-trig-col-selected')?.value || '[]';
    try { node.config.collectionIds = JSON.parse(_colRaw2); } catch(e) { node.config.collectionIds = []; }
    node.config.collectionId = node.config.collectionIds[0] || '';
    node.config.customActionId   = g('custom-action-id');

    // ── Enrichissement : chercher l'automation liée à cette custom action ──
    // Stocke les infos de déclenchement pour l'export Word (guide opérationnel)
    if (node.config.eventType === 'custom_action' && node.config.customActionId) {
      const _caId = node.config.customActionId;
      const _autos = (typeof wfdData !== 'undefined') ? (wfdData.automations || []) : [];
      // Chercher une automation dont les actions incluent cette custom action
      const _linkedAuto = _autos.find(function(a) {
        const actions = a.actions || a.custom_actions || [];
        return actions.some(function(ac) {
          return ac.custom_action_id === _caId || ac.id === _caId;
        });
      });
      if (_linkedAuto) {
        // Extraire le déclencheur (filter_field/filter_value ou trigger_type)
        node.config.automationId      = _linkedAuto.id || _linkedAuto.name;
        node.config.automationName    = _linkedAuto.name || _linkedAuto.nom || _linkedAuto.title || '';
        node.config.automationTrigger = {
          field:    _linkedAuto.filter_field    || _linkedAuto.trigger_field    || _linkedAuto.field || '',
          value:    _linkedAuto.filter_value    || _linkedAuto.trigger_value    || _linkedAuto.value || '',
          operator: _linkedAuto.filter_operator || _linkedAuto.trigger_operator || '=',
          type:     _linkedAuto.trigger_type    || 'metadata_changed',
        };
      } else {
        // Pas d'automation trouvée — réinitialiser
        node.config.automationTrigger = null;
        node.config.automationName    = '';
      }
    }
    node.config.webhookId        = g('webhook-id');
    node.config.wfdSlug          = document.getElementById('cfg-wfd-slug')?.value?.trim() || '';

  } else if (node.family === 'http_request') {
    node.config.connexionId = document.getElementById('cfg-connexion-select')?.value || document.getElementById('cfg-http-conn')?.value || '';
    node.config.description = g('description');

    // Mode actif (simple / foreach / verify)
    // Lire le mode depuis le data-mode du conteneur (mis à jour par wfdHttpModeChange)
    const _modeBarEl = document.getElementById('cfg-http-modebar');
    const _httpModeActive = _modeBarEl?.dataset.mode
                         || node.config.httpMode
                         || 'simple';
    // Mode action : lire l'action sélectionnée
    if (_httpModeActive === 'action') {
      node.config.actionId = document.getElementById('cfg-http-action-select')?.value || '';
    }
    node.config.httpMode = _httpModeActive;

    if (_httpModeActive === 'simple') {
      node.config.method    = document.getElementById('cfg-http-method')?.value     || 'GET';
      node.config.endpoint  = document.getElementById('cfg-http-endpoint')?.value   || '';
      node.config.resultVar = document.getElementById('cfg-http-result-var')?.value || 'http_response';
      node.config.extraHeaders = [];
      document.querySelectorAll('.http-xhdr-key').forEach((keyEl, i) => {
        const valEl = document.querySelectorAll('.http-xhdr-val')[i];
        const key   = keyEl.value.trim();
        const value = valEl?.value.trim() || '';
        if (key) node.config.extraHeaders.push({ key, value });
      });
      // Body : lire depuis le builder (tags) ou le mode JSON brut
      const _bodyRawEl = document.getElementById('cfg-body-raw');
      const _rawMode = _bodyRawEl ? !_bodyRawEl.classList.contains('wfd-hidden') : false;
      node.config.bodyRaw = _rawMode;
      if (_rawMode) {
        node.config.body = document.getElementById('cfg-http-body')?.value || '';
        node.config.bodyTags = node.config.bodyTags || [];
      } else {
        // Lire les tags et leurs alias/spread depuis le DOM (source unique : httpBodyReadTags)
        const _tags = httpBodyReadTags('cfg');
        node.config.bodyTags = _tags;
        // Générer le body JSON depuis les tags pour le moteur
        node.config.body = httpBodyBuildFromTags(_tags);
        node.config.bodyPreview = node.config.body;
      }
    } else if (_httpModeActive === 'foreach') {
      node.config.feSourceVar    = document.getElementById('cfg-fe-source-var')?.value    || '';
      node.config.feSeparator    = document.getElementById('cfg-fe-separator')?.value     ?? ', ';
      node.config.feLocalName    = document.getElementById('cfg-fe-local-name')?.value    || 'nom';
      node.config.method         = document.getElementById('cfg-fe-method')?.value        || 'POST';
      node.config.endpoint       = document.getElementById('cfg-fe-endpoint')?.value      || '';
      node.config.feBody         = document.getElementById('cfg-fe-body')?.value          || '';
      node.config.feJob          = document.getElementById('cfg-fe-job')?.value           || 'director';
      node.config.feOnError      = document.getElementById('cfg-fe-on-error')?.value      || 'continue';
      node.config.feCollectField = document.getElementById('cfg-fe-collect-field')?.value || 'external_id';
      node.config.feResultVar    = document.getElementById('cfg-fe-result-var')?.value    || 'personsPayload';
      const _codeRaw = document.getElementById('cfg-fe-ignore-codes')?.value || '409, 422';
      node.config.feIgnoreCodes  = _codeRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    } else if (_httpModeActive === 'verify') {
      node.config.method         = document.getElementById('cfg-vf-method')?.value       || 'GET';
      node.config.endpoint       = document.getElementById('cfg-vf-endpoint')?.value     || '';
      node.config.vfCheckPath    = document.getElementById('cfg-vf-check-path')?.value   || '';
      node.config.vfCheckValue   = document.getElementById('cfg-vf-check-value')?.value  || '';
      node.config.resultVar      = document.getElementById('cfg-vf-result-var')?.value   || 'verify_result';
    }
  } else if (node.family==='create_asset') {
    const d = _readCreateAssetConfig('cfg');
    node.config = { ...node.config, ...d };
  } else if (node.family==='create_col') {
    const d = _readCreateColConfig('cfg');
    node.config = { ...node.config, ...d };
  } else if (node.family==='fetch') {
    node.config.description     = g('description');
    node.config.storeAs         = g('fetch-store-as') || 'asset';
    node.config.resultVar       = node.config.storeAs;
    node.config.fetchVar        = node.config.storeAs;
    // Sous-type
    const _subtypes = ['asset','collection','metadata','savedsearch'];
    node.config.fetchSubType = _subtypes.find(st => {
      const btn = document.getElementById('cfg-subtype-' + st);
      return btn && btn.dataset.active === '1';
    }) || node.config.fetchSubType || 'asset';
    // Source
    // Lire la source selon le sous-type actif (évite de lire un select caché)
    if (node.config.fetchSubType === 'collection') {
      node.config.fetchSource = g('fetch-source-col') || 'triggered';
    } else {
      node.config.fetchSource = g('fetch-source-asset') || 'triggered';
    }
    node.config.fetchValue     = g('fetch-value') || g('fetch-col-value') || '';
    const withMetaEl = document.getElementById('cfg-with-meta');
    node.config.withMetadata   = withMetaEl ? withMetaEl.checked : false;
    node.config.metadataViewId = g('fetch-meta-view') || g('meta-view') || '';
    node.config.fetchMdViewId  = node.config.metadataViewId;

    // ── Enrichissement : champs requis de la vue MD ──────────────
    // On récupère les view_fields de la vue sélectionnée pour stocker
    // quels champs sont obligatoires. Utilisé dans l'export Word
    // (section opérationnelle) et pour la validation dans le Checker.
    if (node.config.metadataViewId) {
      const _viewId = node.config.metadataViewId;
      // Chercher d'abord dans le cache local (wfdData.mdViewFields)
      const _cached = (wfdData.mdViewFields || {})[_viewId];
      if (_cached) {
        node.config.viewFields    = _cached;
        node.config.requiredFields = _cached.filter(f => f.required).map(f => ({ name: f.name, label: f.label, type: f.field_type }));
      } else {
        // Appel API silencieux pour récupérer les champs de la vue
        const _env = (typeof wfdData !== 'undefined' && wfdData.env) ? wfdData.env : null;
        const _iconikBase = (_env && _env.iconikUrl) ? _env.iconikUrl : 'https://app.iconik.io';
        const _tokens = JSON.parse(localStorage.getItem('appTokensData') || '{}')?.appTokens || [];
        const _tok = _tokens.find(t => t.name?.includes('QA')) || _tokens[0];
        if (_tok) {
          const _envName = encodeURIComponent(document.getElementById('wfd-env-select')?.value || wfdData?.env?.name || '');
          fetch('/api/iconik/' + _envName + '/API/metadata/v1/views/' + _viewId + '/').then(r => r.ok ? r.json() : null).then(data => {
            if (!data || !data.view_fields) return;
            const fields = data.view_fields.filter(f => f.name && f.name !== '__separator__');
            // Mise en cache pour éviter les appels répétés
            if (!wfdData.mdViewFields) wfdData.mdViewFields = {};
            wfdData.mdViewFields[_viewId] = fields;
            // Stocker dans la config du nœud
            node.config.viewFields     = fields;
            node.config.requiredFields = fields.filter(f => f.required).map(f => ({ name: f.name, label: f.label, type: f.field_type }));
            // Sauvegarder l'état pour que les exports aient les données
            if (typeof sauvegarderEtat === 'function') sauvegarderEtat();
          }).catch(() => {});
        }
      }
    }
    const withColsEl = document.getElementById('cfg-with-cols');
    node.config.withCollections = withColsEl ? withColsEl.checked : false;
    const withKfEl = document.getElementById('cfg-with-keyframes');
    node.config.withKeyframes = withKfEl ? withKfEl.checked : false;
    const withFmtEl = document.getElementById('cfg-with-formats');
    node.config.withFormats = withFmtEl ? withFmtEl.checked : false;
    node.config.fetchTarget    = g('fetch-meta-target') || 'asset';
    const fieldsEl = document.getElementById('cfg-fetch-meta-fields');
        node.config.metadataFields  = wfdFetchReadTags('cfg');
    const _ssEl = document.getElementById('cfg-ss-id');
    node.config.savedSearchId   = _ssEl?.value || '';
    // Stocker aussi le nom pour l'affichage canvas (indépendant de wfdData)
    if (_ssEl?.tagName === 'SELECT') {
      const _ssOpt = _ssEl.options[_ssEl.selectedIndex];
      node.config.savedSearchName = _ssOpt?.text || '';
    } else {
      // Champ texte libre — essayer de trouver le nom dans wfdData
      const _ssFound = (wfdData.savedSearches||[]).find(s => s.id === node.config.savedSearchId);
      node.config.savedSearchName = _ssFound ? (_ssFound.name||_ssFound.nom||'') : node.config.savedSearchName || '';
    }
    node.config.savedSearchLimit= parseInt(document.getElementById('cfg-ss-limit')?.value || '100');
    node.config.savedSearchVar  = document.getElementById('cfg-ss-var')?.value  || 'search_results';
    // Rétrocompat
    node.config.fetchType      = node.config.fetchSubType === 'collection' ? 'collection' : 'asset';
    node.config.fetchBy        = node.config.fetchSource === 'triggered' ? 'id' : node.config.fetchSource;
  } else if (node.family==='rename') {
    node.config.mode        = g('rename-mode');
    node.config.nommageId   = g('nommage-id');
    node.config.template    = g('rename-template');
    node.config.backupField = g('rename-backup');
    node.config.description = g('description');
  } else if (node.family==='listener') {
    node.config.connexionId  = g('listener-conn');
    node.config.mappingId    = g('listener-mapping');
    node.config.description  = g('description');
  } else if (node.family==='gate') {
    node.config.gateMode=(['throttle','delay','pause'].find(function(m){var b=document.getElementById('cfg-gate-mode-'+m);return b&&b.dataset.active==='1';})) || node.config.gateMode || 'throttle';
    node.config.maxConcurrent=parseInt(document.getElementById('cfg-gate-max-concurrent')?.value||'3');
    node.config.throttleOverflow=document.getElementById('cfg-gate-overflow')?.value||'queue';
    node.config.delayMs=Math.round(parseFloat(document.getElementById('cfg-gate-delay-sec')?.value||'5')*1000);
    node.config.pauseMessage=document.getElementById('cfg-gate-pause-msg')?.value||'';
    node.config.pauseAutoResume=!!document.getElementById('cfg-gate-pause-auto')?.checked;
    node.config.pauseAutoResumeAfterSec=parseInt(document.getElementById('cfg-gate-pause-auto-sec')?.value||'60');
    node.config.description=g('description');
  } else if (node.family==='timer') {
    node.config.timerMode=(['interval','cron','oneshot'].find(function(m){var b=document.getElementById('cfg-timer-mode-'+m);return b&&b.dataset.active==='1';})) || node.config.timerMode || 'interval';
    node.config.intervalVal=g('timer-interval-val')||'30'; node.config.intervalUnit=g('timer-interval-unit')||'minutes'; node.config.intervalStart=g('timer-interval-start')||'09:00';
    node.config.cronFreq=_wfdReadCronFreq('cfg'); node.config.cronDays=_wfdReadCronDays('cfg');
    node.config.cronHour=parseInt(g('cron-hour')||'9'); node.config.cronMinute=parseInt(g('cron-minute')||'0'); node.config.cronMday=parseInt(g('cron-mday')||'1');
    node.config.cronExpr=_wfdBuildCronExpr(node.config.cronFreq,node.config.cronDays,node.config.cronHour,node.config.cronMinute,node.config.cronMday);
    node.config.oneshotDatetime=g('timer-oneshot-dt')||''; node.config.timezone=g('timer-tz')||'Europe/Paris'; node.config.description=g('description');
  } else if (node.family==='manual') {
    var rawP=document.getElementById('cfg-manual-payload')?.value||'{}',errEl2=document.getElementById('cfg-manual-payload-error');
    try{node.config.payload=JSON.parse(rawP);node.config.label=document.getElementById('cfg-manual-label')?.value||'';if(errEl2){errEl2.style.display='none';errEl2.textContent='';}}catch(e){if(errEl2){errEl2.style.display='block';errEl2.textContent='JSON invalide : '+e.message;}}
  } else if (node.family==='watchfolder') {
    node.config.variant      = g('variant');
    node.config.mediaType    = g('media-type');
    node.config.sidecarFormat= g('sidecar-format');
    node.config.formats      = g('formats');
    node.config.description  = g('description');
    document.querySelectorAll('.src-cred').forEach(el => {
      if (el.dataset.key) node.config[el.dataset.key] = el.value;
    });
  } else if (node.family==='source') {
    node.config.variant        = g('variant');
    node.config.formats        = g('formats');
    node.config.mapping        = g('mapping');
    node.config.endpoint       = g('endpoint');
    node.config.metadataViewId = g('mdview');
  } else if (node.family === 'aps_search') {
    node.config.blocks      = srReadBlocks('cfg');
    node.config.expression  = document.getElementById('cfg-sr-expression')?.value?.trim() || '';
    node.config.returnBlock = parseInt(document.getElementById('cfg-sr-return-block')?.value) || 1;
    node.config.limit       = parseInt(document.getElementById('cfg-sr-limit')?.value) || 500;
    node.config.resultVar   = document.getElementById('cfg-sr-result-var')?.value?.trim() || 'search_results';
    node.ports = buildPortsDef('aps_search', node.config);

  } else if (node.family==='checker') {
    node.config.connexionId = g('chk-conn') || '';
    node.config.checks      = chkReadRows('cfg');
    node.ports = buildPortsDef('checker', node.config);

  } else if (node.family === 'http_sequence') {
    node.config.connexionId  = document.getElementById('cfg-hseq-conn')?.value || '';
    node.config.steps        = hseqReadSteps('cfg');
    node.config.description  = document.getElementById('cfg-description')?.value || '';
    node.ports = buildPortsDef('http_sequence', node.config);

  } else if (node.family==='aws_s3') {
    node.config.connexionId = g('aws-conn')      || '';
    node.config.operation   = g('aws-op')        || 'head_object';
    node.config.objectKey   = g('aws-key')       || '';
    node.config.resultVar   = g('aws-result')    || 'awsResult';
    // Post-action S3 — mappings configurables
    const _s3m = awsS3ReadMappings('cfg');
    if (_s3m.length) {
      node.config.s3Mappings = _s3m;
      node.config.s3VarVideo = (_s3m.find(function(r){ return r.type==='video'; })    || {}).variable || 's3_video_url';
      node.config.s3VarImage = (_s3m.find(function(r){ return r.type==='image'; })    || {}).variable || 's3_image_url';
      node.config.s3VarSrt   = (_s3m.find(function(r){ return r.type==='subtitle'; }) || {}).variable || 's3_srt_url';
    }
    // Artworks
    node.config.jobId      = g('aws-art-jobid')   || '{exportJobId}';
    const _awsArtPrefix    = g('aws-art-prefix');
    if (_awsArtPrefix) node.config.objectKey = _awsArtPrefix;
    node.config.titreVar   = g('aws-art-titre')    || '{Titre}';
    node.config.nommageId  = g('aws-art-nommage')  || '';
    node.config.mdViewId   = g('aws-art-mdview')   || '';
    node.config.artworks   = awsArtReadRows('cfg');
    node.ports = buildPortsDef('aws_s3', node.config);

  } else if (node.family==='wait_for') {
    node.config.connexionId  = g('wf-conn')         || '';
    node.config.method       = g('wf-method')       || 'GET';
    node.config.endpoint     = g('wf-endpoint')     || '';
    node.config.checkPath    = g('wf-check-path')   || 'status';
    node.config.checkValue   = g('wf-check-value')  || '';
    node.config.failValues   = g('wf-fail-values')  || 'FAILED,ERROR,ABORTED';
    node.config.delaySeconds = parseInt(g('wf-delay'))      || 5;
    node.config.maxTries     = parseInt(g('wf-max-tries'))  || 20;
    node.config.resultVar    = g('wf-result-var')   || 'waitResult';
    // Onglet S3
    node.config.s3ConnexionId = g('wf-s3-conn')       || '';
    node.config.s3Prefix      = g('wf-s3-prefix')     || '';
    // Mappings configurables (même UI que AWS S3)
    const _wfS3m = wfS3ReadMappings('cfg');
    if (_wfS3m.length) {
      node.config.s3Mappings = _wfS3m;
      // Rétrocompat anciens champs
      node.config.s3VarVideo = (_wfS3m.find(function(r){ return r.type==='video'; })    || {}).variable || 's3_video_url';
      node.config.s3VarImage = (_wfS3m.find(function(r){ return r.type==='image'; })    || {}).variable || 's3_image_url';
      node.config.s3VarSrt   = (_wfS3m.find(function(r){ return r.type==='subtitle'; }) || {}).variable || 's3_srt_url';
    }
    node.ports = buildPortsDef('wait_for', node.config);

  } else if (node.family==='workflow_history') {
    const g2 = id => document.getElementById('cfg-'+id);
    node.config.targetId    = g2('wh-target-id')?.value?.trim()  || '{asset_id}';
    node.config.mdViewId    = g2('wh-md-view')?.value            || '';
    node.config.mdField     = g2('wh-md-field')?.value           || '';
    node.config.whMode      = g2('wh-mode')?.value               || 'add';
    node.config.whOrder     = g2('wh-order')?.value              || 'newest';
    const _whPreset = g2('wh-statut-preset')?.value;
    node.config.whStatut = (_whPreset && _whPreset !== '__custom__' && _whPreset !== '')
      ? _whPreset
      : (g2('wh-statut')?.value || '');
    node.config.whMessage   = g2('wh-message')?.value            || '';
    node.config.whShowDate  = g2('wh-show-date')?.checked  !== false;
    node.config.whShowRunId = g2('wh-show-runid')?.checked === true;
    node.config.whShowWf    = g2('wh-show-wf')?.checked    !== false;
    node.config.whShowUser  = g2('wh-show-user')?.checked  !== false;
    node.config.whWfName      = g2('wh-wf-name')?.value?.trim()      || '';
    node.config.whSummaryVar  = g2('wh-summary-var')?.value?.trim()  || '';
    node.ports = buildPortsDef('workflow_history', node.config);

  } else if (node.family==='id_generator') {
    node.config.idType     = g('ig-type')   || 'numeric';
    node.config.outputType = g('ig-output-type') || 'string';
    node.config.idLength   = parseInt(g('ig-length') || '8');
    node.config.idPrefix   = g('ig-prefix') || '';
    node.config.varName    = g('ig-var')    || 'generated_id';
    node.config.apiActions = igReadActions('cfg');
    node.config.description = g('ig-description');
    node.ports = buildPortsDef('id_generator', node.config);
  } else if (node.family==='set_var') {
    node.config.assignments = svReadAssignments('cfg');
    node.config.description = g('description');
  } else if (node.family==='lookup') {
    node.config.lkInputVar  = g('lk-input-var');
    node.config.lkSourceFolded = node.config.lkSourceFolded ?? true; // plié par défaut
    node.config.lkOutputVar = g('lk-output-var');
    node.config.lkFallback  = g('lk-fallback');
    node.config.lkTechVar   = g('lk-tech-var') || 'assetTechnique';
    node.config.description = g('description');
    node.config.lkTechMap = {};
    document.querySelectorAll('.lk-tech-map').forEach(function(inp) {
      const v = inp.dataset.var;
      if (v && inp.value) node.config.lkTechMap[v] = inp.value;
    });
    node.config.lkRows = (function() {
      // ── Lignes normales depuis #cfg-lk-rows ──
      const wrap = document.getElementById('cfg-lk-rows');
      const normalRows = wrap ? [...wrap.querySelectorAll(':scope > .lk-row, :scope > .lkr:not(.lkr-person)')].map(function(row) {
        const key      = row.querySelector('.lk-key')?.value || '';
        const _valWrap = row.querySelector('.lk-value-wrap');
        const value    = _valWrap
          ? (typeof lkGetRowValue === 'function' ? lkGetRowValue(_valWrap) : (_valWrap.querySelector('input.lk-value')?.value || ''))
          : (row.querySelector('.lk-value:not([type="hidden"])')?.value || '');
        const isList   = row.querySelector('.lk-is-list')?.checked || false;
        // Type : depuis badge data-type ou select .lk-type
        const typeBadge = row.querySelector('.lkr-type-btn');
        const rowType  = typeBadge?.dataset?.type || row.querySelector('.lk-type')?.value || 'string';
        const children = [...row.querySelectorAll('.lk-child-row')].map(function(c) {
          return { key: c.querySelector('.lk-key')?.value||'', value: c.querySelector('.lk-value')?.value||'' };
        }).filter(function(c) { return c.key || c.value; });
        const fallback = row.querySelector('.lk-fallback')?.value?.trim() || '';
        const rowObj = children.length ? { key, value, children } : { key, value };
        if (isList)                          rowObj.list     = true;
        if (fallback)                        rowObj.fallback = fallback;
        if (rowType && rowType !== 'string') rowObj.type     = rowType;
        return rowObj;
      }).filter(function(r) { return r.key || r.value; }) : [];

      // ── Lignes crédits depuis #cfg-lk-person-rows ──
      const personWrap = document.getElementById('cfg-lk-person-rows');
      const personRows = personWrap ? [...personWrap.querySelectorAll('.lkr-person')].map(function(row) {
        const key    = row.querySelector('.lk-person-key')?.value    || '';
        const role   = row.querySelector('.lk-person-role')?.value   || 'director';
        const format = row.querySelector('.lk-person-format')?.value || 'slug';
        // Construire la valeur imbriquée — jamais visible par l'utilisateur
        const value = 'persons[job=' + role + '].external_id';
        if (!key) return null;
        return { key, value, type: 'string', _role: role, _format: format };
      }).filter(Boolean) : [];

      return [...normalRows, ...personRows];
    })();
    node.ports = buildPortsDef('lookup', node.config);
  } else if (node.family==='decision') {
    node.config.field = g('field');
    node.config.defaultLabel = g('default-label') || 'Par défaut';
    node.config.conditions = [...document.querySelectorAll('#cfg-conditions .decision-condition')].map(row=>({
      op: row.querySelector('.cond-op')?.value||'contains',
      value: row.querySelector('.cond-val')?.value||'',
      label: row.querySelector('.cond-label')?.value||'Sortie',
    }));
    // Reconstruire les ports
    node.ports = buildPortsDef(node.family, node.config);
  } else if (node.family==='action') {
    node.config.actionType  = g('action-type');
    // Lire target selon le type de champ présent
    const _at = node.config.actionType;
    const _colActions = ['collection_add_asset','collection_remove_asset','collection_update','collection_delete','acl_set_collection'];
    if (_colActions.includes(_at)) {
      // Détecter le mode actif : arbre ou variable
      const _varWrap = document.getElementById('cfg-atm-var-wrap');
      const _isVar   = _varWrap && !_varWrap.classList.contains('wfd-hidden');
      node.config.targetMode = _isVar ? 'var' : 'tree';
      if (_isVar) {
        node.config.targetVar = document.getElementById('cfg-target-var')?.value?.trim() || '';
      } else {
    try {
    const raw = document.getElementById('cfg-col-selected')?.value || '[]';
    let ids = JSON.parse(raw);
    if (!Array.isArray(ids)) ids = (ids ? [ids] : []);

    // ➜ on conserve toute la sélection
    node.config.collectionIds = ids;
    // compat : on garde target = premier id
    node.config.target = ids[0] || '';
  } catch (e) {
    node.config.collectionIds = node.config.collectionIds || [];
    node.config.target = node.config.target || '';
  }
}
    } else {
      node.config.target = g('target');
    }
    node.config.actionValue = g('action-value');
    node.config.notes       = g('notes');
    // Options spécifiques export_location_trigger
    if (node.config.actionType === 'export_location_trigger') {
      node.config.createFolderAsset = document.getElementById('cfg-create-folder-asset')?.checked === true;
      node.config.overwrite         = document.getElementById('cfg-overwrite')?.checked === true;
      node.config.fileName          = document.getElementById('cfg-file-name')?.value?.trim() || '';
    }
  } else if (node.family==='postit') {
    node.config.text  = document.getElementById('cfg-postit-text')?.value || '';
    // La couleur est stockée dans les divs data-color (pas dans un input)
    const _selCol = document.querySelector('#wfd-config-body [data-color].color-selected');
    node.config.color = _selCol?.dataset.color || node.config.color || '#f1c40f';
  } else if (node.family==='cast') {
    node.config.ref         = g('ref');
    node.config.notes       = g('notes');
    node.config.description = g('description') || document.getElementById('cfg-description')?.value || '';
  } else if (node.family==='export') {
    node.config.exportTarget = g('export-target');
    document.querySelectorAll('#cfg-export-fields .exp-field, #mn-export-fields .exp-field').forEach(el => {
      const k = el.dataset.key;
      if (k) node.config[k] = el.value;
    });
  } else if (node.family==='update_meta') {
    const d = _readUpdateMetaConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='link_file') {
    const d = _readLinkFileConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='acl') {
    const d = _readAclConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='relate') {
    const d = _readRelateConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='subflow') {
    const d = _readSubflowConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='export_file') {
    const d = _readExportFileConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='publish') {
    const d = _readPublishConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='notify_post') {
    const d = _readNotifyPostConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='transcode') {
    const d = _readTranscodeConfig('cfg'); node.config = { ...node.config, ...d };
  } else if (node.family==='notification') {
    node.config.description  = g('description');
    node.config.autoMode     = document.getElementById('cfg-auto-mode')?.checked !== false;
    node.config.title        = g('msg-title')  || '';
    node.config.bodyTemplate = g('msg-body')   || '';
    node.config.recipients   = lireDestinatairesEnriched('cfg-recipients');
    node.config.rules = [...(document.getElementById('cfg-msg-rules')?.querySelectorAll('.msg-rule-row')||[])].map(row => ({
      srcId  : row.querySelector('.msg-rule-src')?.value    || '',
      portIdx: row.querySelector('.msg-rule-port')?.value   || '1',
      status : row.querySelector('.msg-rule-status')?.value || 'failed',
      message: row.querySelector('.msg-rule-text')?.value   || '',
    })).filter(r => r.srcId);
  } else if (node.family==='qc') {
    node.config.rules   = lireReglesQC('cfg');
    node.config.outputs = lireSortiesQC('cfg');
    node.config.mode    = document.getElementById('cfg-qc-mode')?.value || 'all';
    node.config.notes       = g('notes');
    node.config.description = g('description');
    // Lecture de la sélection de collection (SORTIES) — champ existant mais
    // jamais lu jusqu'ici, donc jamais persisté (bug pré-existant).
    try {
      const raw = document.getElementById('cfg-qc-col-selected')?.value;
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          node.config.qcCollectionIds = ids;
          node.config.qcCollection = ids[0] || node.config.qcCollection || '';
        }
      } else {
        node.config.qcCollectionIds = node.config.qcCollection
          ? [node.config.qcCollection]
          : (node.config.qcCollectionIds || []);
      }
    } catch (e) {
      node.config.qcCollectionIds = node.config.qcCollection
        ? [node.config.qcCollection]
        : (node.config.qcCollectionIds || []);
    }
    if (node.config.outputs.length) node.ports = buildPortsDef('qc', node.config);
  } else if (node.family==='approval') {
    node.config.title         = document.getElementById('cfg-appr-title')?.value         || '';
    node.config.description   = document.getElementById('cfg-appr-desc')?.value          || '';
    node.config.approvers     = lireApprobateurs('cfg');
    node.config.timeout       = parseInt(document.getElementById('cfg-appr-timeout')?.value||'48');
    node.config.timeoutAction = document.getElementById('cfg-appr-timeout-action')?.value || 'timeout_port';
    node.config.notifChannel  = document.getElementById('cfg-appr-notif-channel')?.value  || 'email';
    node.config.notifMessage  = document.getElementById('cfg-appr-notif-msg')?.value      || '';
  } else if (node.family==='script') {
    node.config.lang  = document.getElementById('cfg-script-lang')?.value || 'javascript';
    node.config.ports = lirePortsScript('cfg-script-ports');
    if (typeof wfdScriptBuffer !== 'undefined' && wfdScriptBuffer !== null)
      node.config.code = wfdScriptBuffer;
  } else if (node.family==='loop') {
    node.config.loopSource     = document.getElementById('cfg-loop-source')?.value     || 'files';
    node.config.loopFilter     = document.getElementById('cfg-loop-filter')?.value     || '';
    node.config.loopCollection = document.getElementById('cfg-loop-collection')?.value || '';
    node.config.loopList       = document.getElementById('cfg-loop-list')?.value       || '';
    node.config.loopMetaField  = document.getElementById('cfg-loop-metafield')?.value  || '';
    node.config.loopVar        = document.getElementById('cfg-loop-var')?.value        || 'item';
    node.config.concurrency    = parseInt(document.getElementById('cfg-loop-concurrency')?.value||'1');
    node.config.onError        = document.getElementById('cfg-loop-onerror')?.value    || 'stop';
	// NEW — Lecture éventuelle de la sélection de l'arborescence (si présente)
try {
  const raw = document.getElementById('cfg-loop-col-selected')?.value; // champ caché du tree
  if (raw) {
    const ids = JSON.parse(raw);
    if (Array.isArray(ids)) {
      node.config.loopCollectionIds = ids;
      // Compat : on conserve aussi le "premier" en string comme avant
      node.config.loopCollection = ids[0] || node.config.loopCollection || '';
    }
  } else {
    // Pas de tree → garder un miroir cohérent côté tableau (si plausible)
    node.config.loopCollectionIds = node.config.loopCollection
      ? [node.config.loopCollection]
      : (node.config.loopCollectionIds || []);
  }
} catch (e) {
  // En cas de JSON invalide ou d'absence du champ : fallback non destructif
  node.config.loopCollectionIds = node.config.loopCollection
    ? [node.config.loopCollection]
    : (node.config.loopCollectionIds || []);
}
  } else if (node.family==='transform') {
    node.config.target    = document.getElementById('cfg-tr-target')?.value  || '';
    node.config.separator = document.getElementById('cfg-tr-sep')?.value     || '_';
    node.config.caseMode  = document.getElementById('cfg-tr-case')?.value    || 'upper';
    node.config.maxLen    = parseInt(document.getElementById('cfg-tr-maxlen')?.value||'80');
    node.config.rules     = lireReglesTransform();
  }
  // Description générique (pour familles sans champ dédié)
  if (!node.config.description) node.config.description = g('description');

  // Lire le nom depuis le header (cfg-node-name, visible et éditable par l'utilisateur)
  // ou en fallback depuis le body (cfg-name, parfois masqué sous l'icône)
  const _nameHeader = document.getElementById('cfg-node-name')?.value?.trim() || '';
  const _nameBody   = document.getElementById('cfg-name')?.value?.trim() || '';
  const newName = _nameHeader || _nameBody || node.name;
  if (newName) node.name = newName;
  // Synchroniser le header visuellement
  const _nh = document.getElementById('cfg-node-name');
  if (_nh) _nh.value = node.name;
  configDirty = true;
  node.draft = false;
  if (typeof sauvegarderEtat === 'function') sauvegarderEtat();
  // Synchroniser l'engine avec la nouvelle config du flux
  if (window.WfdEngineInstance?.loadFluxes && typeof getFluxCourant === 'function') {
    const _flux = getFluxCourant();
    if (_flux) window.WfdEngineInstance.loadFluxes([_flux]).catch(() => {});
  }
  renderCanvas();
  toast('Configuration sauvegardée ✓');

}
function supprimerNoeudSelectionne() {
  if (!selectedNodeId) return;
  const flux = getFluxCourant();
  if (!flux) return;
  if (!confirm('Supprimer ce n\u0153ud du flux ?')) return;
  flux.nodes        = flux.nodes.filter(n=>n.id!==selectedNodeId);
  flux.connections  = flux.connections.filter(c=>c.fromNode!==selectedNodeId&&c.toNode!==selectedNodeId);
  sauvegarderEtat();
  selectedNodeId = null;
  fermerConfigPanel();
  renderCanvas();
  toast('N\u0153ud supprim\u00E9');
}

function fermerConfigPanel() {
  const panel  = document.getElementById('wfd-config-panel');
  const canvas = document.getElementById('wfd-canvas-wrap');
  const btn    = document.getElementById('cfg-focus-btn');
  if (!panel) return;
  panel.classList.remove('open');
  panel.style.width = '';
  // Réinitialiser le mode focus
  panel.classList.remove('panel-focus');
  canvas?.classList.remove('panel-focus-mode');
  if (typeof _wfdFocusMode !== 'undefined') _wfdFocusMode = false;
  if (btn) { btn.textContent = '⤢'; btn.classList.remove('active'); }
}

// ── Transform helpers ────────────────────────────────────────
const TRANSFORM_SOURCES = {
  field      : 'Champ m\u00E9tadonn\u00E9e',
  literal    : 'Valeur fixe',
  date       : 'Date (ISO AAAAMMJJ)',
  var        : 'Variable workflow',
  expression : 'Expression / Calcul',
};

function buildTransformRuleRow(i, r, pfx) {
  const src = r.source || 'field';
  const metaFields = (wfdData.metadata||[])
  .map(f=>f.nom||f.name||'')
  .filter(Boolean)
  .sort((a,b)=>a.localeCompare(b, 'fr', { sensitivity:'base' }));
  const fieldPart = src==='field'
    ? (metaFields.length
      ? `<select class="cfg-select tr-field" data-idx="${i}">
           <option value="${r.field||''}">— champ —</option>${metaFields.map(f=>`<option value="${f}" ${r.field===f?'selected':''}>${f}</option>`).join('')}
         </select>`
      : `<input class="cfg-input tr-field" data-idx="${i}" value="${r.field||''}" placeholder="nom du champ">`)
    : src==='literal'
    ? `<input class="cfg-input tr-field" data-idx="${i}" value="${r.value||''}" placeholder="valeur fixe">`
    : src==='var'
    ? `<input class="cfg-input tr-field" data-idx="${i}" list="${pfx}-wfd-var-list"
             value="${r.field||''}" placeholder="{asset.title}">`
    : src==='expression'
    ? `<input class="cfg-input tr-field wfd-mono-xs" data-idx="${i}"
             value="${r.value||r.field||''}"
             placeholder="ex: {duration_ms} / 1000  ou  {width} >= 1920 ? 'HD' : 'SD'"
             title="Supports: + - * / % ternaire, {vars}, {asset.id}, {results.key.field}">`
    : `<span class="wfd-tr-dateauto">Date auto</span>`;

  return `<div id="tr-rule-${i}" class="wfd-tr-row-card">
    <span class="wfd-tr-idx">${i+1}</span>
    <select class="cfg-select tr-source" data-idx="${i}" onchange="changerSourceTransform(${i},this.value)">
      ${Object.entries(TRANSFORM_SOURCES).map(([k,v])=>`<option value="${k}" ${src===k?'selected':''}>${v}</option>`).join('')}
    </select>
    <div class="tr-field-wrap-${i}">${fieldPart}</div>
    <button class="btn-del-cond" onclick="supprimerRegleTransform(${i})">×</button>
  </div>`;
}

function ajouterRegleTransform() {
  const c = document.getElementById('mn-tr-rules') || document.getElementById('cfg-tr-rules');
  if (!c) return;
  const pfx = c.id.startsWith('mn-') ? 'mn' : 'cfg';
  c.insertAdjacentHTML('beforeend', buildTransformRuleRow(c.children.length, {}, pfx));
  mettreAJourApercu();
}
function supprimerRegleTransform(i) {
  document.getElementById('tr-rule-'+i)?.remove();
  mettreAJourApercu();
}
function changerSourceTransform(i, src) {
  const row = document.getElementById('tr-rule-'+i);
  if (!row) return;
  const container = document.getElementById('mn-tr-rules') || document.getElementById('cfg-tr-rules');
  const pfx = container && container.id.startsWith('mn-') ? 'mn' : 'cfg';
  row.outerHTML = buildTransformRuleRow(i, { source:src }, pfx);
  mettreAJourApercu();
}
function lireReglesTransform() {
  const c = document.getElementById('mn-tr-rules') || document.getElementById('cfg-tr-rules');
  if (!c) return [];
  return [...c.querySelectorAll('[id^=tr-rule-]')].map(row => ({
    source: row.querySelector('.tr-source')?.value || 'literal',
    field : row.querySelector('.tr-field')?.value  || '',
    value : row.querySelector('.tr-field')?.value  || '',
  }));
}
function mettreAJourApercu() {
  const sep     = document.getElementById('mn-tr-sep')?.value || '_';
  const mode    = document.getElementById('mn-tr-case')?.value || 'upper';
  const maxLen  = parseInt(document.getElementById('mn-tr-maxlen')?.value||'80');
  const rules   = lireReglesTransform();
  let preview   = rules.map(r => r.value || r.field || '?').join(sep);
  if (mode==='upper') preview = preview.toUpperCase();
  if (mode==='lower') preview = preview.toLowerCase();
  if (maxLen && preview.length > maxLen) preview = preview.slice(0,maxLen)+'\u2026';
  const el = document.getElementById('mn-tr-preview');
  if (el) el.textContent = preview || '\u2014';
}
function selectPostitColor(col) {
  // Couvre la modale création ET le panneau config (cfg-)
  document.querySelectorAll('#wfd-config-body [data-color]').forEach(el => {
    el.classList.toggle('color-selected', el.dataset.color === col);
  });
  // Mettre à jour le nœud canvas immédiatement
  if (typeof selectedNodeId !== 'undefined' && selectedNodeId) {
    const nodeEl = document.getElementById('wfd-node-' + selectedNodeId);
    if (nodeEl) nodeEl.style.setProperty('--postit-color', col);
  }
  // Sauvegarder dans node.config
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}


// ══ PANNEAU CRÉER ASSET ══════════════════════════════════════════════════════

// Construit le HTML du panneau create_asset
function _buildCreateAssetPanel(pfx, cfg, wfdData) {
  const allMeta  = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
  const viewOpts = (wfdData.mdViews||[]).map(v =>
    `<option value="${v.id||v.name}" ${cfg.mdViewId===(v.id||v.name)?'selected':''}>${escHtml(v.name||v.id)}</option>`).join('');

  const _caMetaNames = (wfdData.metadata || [])
  .map(m => m.nom || m.name || '')
  .filter(Boolean)
  .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

const caKeyCtrl = (f,i) => {
  return _caMetaNames.length
    ? `<select class="cfg-select ca-meta-key" data-idx="${i}">
         <option value="">— Champ méta —</option>
         ${_caMetaNames.map(n =>
            `<option value="${n}" ${f.key===n?'selected':''}>${escHtml(n)}</option>`).join('')}
       </select>`
    : `<input class="cfg-input ca-meta-key wfd-mono-sm" data-idx="${i}"
         value="${escHtml(f.key||'')}" placeholder="Champ" list="${pfx}-ca-meta-list">`;
};

const metaFields = (cfg.metaFields||[]).map((f,i) => `
  <div class="wfd-grid-3-24">
    ${caKeyCtrl(f,i)}
    <input class="cfg-input ca-meta-val wfd-mono-sm" data-idx="${i}"
      value="${escHtml(f.value||'')}" placeholder="Valeur ou {variable}">
    <button class="cfg-btn danger wfd-pad-3-5"
      onclick="${pfx}RemoveMetaField(${i})">×</button>
  </div>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <datalist id="${pfx}-ca-meta-list">${allMeta.map(m=>`<option value="${m}">`).join('')}</datalist>

  <!-- Titre -->
  <div class="cfg-field">
    <label class="cfg-label">Titre de l'asset</label>
    <input id="${pfx}-ca-title" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.title||'')}" placeholder="{titre}  ou  Valeur fixe">
    <div class="wfd-hint-top3">Utilisez <code>{variable}</code> pour injecter depuis le contexte</div>
  </div>

  <!-- Statut online -->
  <div class="cfg-field">
    <label class="cfg-label">Statut à la création</label>
    <select id="${pfx}-ca-status" class="cfg-select">
      <option value="online"  ${(cfg.status||'online')==='online' ?'selected':''}>🟢 Online (visible)</option>
      <option value="offline" ${cfg.status==='offline'            ?'selected':''}>🔴 Offline (masqué)</option>
    </select>
  </div>

  <!-- Vue de métadonnées -->
  <div class="cfg-field">
    <label class="cfg-label">Vue de métadonnées à remplir</label>
    <select id="${pfx}-ca-mdview" class="cfg-select">
      <option value="">— Aucune —</option>${viewOpts}
    </select>
  </div>

  <!-- Champs metadata initiaux -->
  <div class="cfg-field">
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">Valeurs de métadonnées initiales</label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddMetaField()">+ Champ</button>
    </div>
    <div id="${pfx}-ca-meta-fields" class="wfd-col-gap5">
      ${metaFields || '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>'}
    </div>
  </div>

  <!-- Ajouter à une collection -->
  <div class="cfg-field">
    <label class="cfg-label">Ajouter dans la collection</label>
    <input id="${pfx}-ca-collection" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.collection||'')}" placeholder="{collection.id}  ou  ID fixe">
    <div class="wfd-hint-top3">Laisser vide pour ne pas ajouter à une collection</div>
  </div>

  <!-- Stocker l'ID de l'asset créé -->
  <div class="cfg-field">
    <label class="cfg-label">Stocker l'ID du nouvel asset dans</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-555">{</span>
      <input id="${pfx}-ca-var" class="cfg-input wfd-flex1-mono"
        value="${escHtml(cfg.resultVar||'new_asset')}" placeholder="new_asset">
      <span class="wfd-mono-555">.id}</span>
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-ca-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Créer l'asset vide en attente du High Res…">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

// Fonctions dynamiques create_asset (préfixe mn)
function mnAddMetaField()     { _caAddMetaField('mn'); }
function cfgAddMetaField()    { _caAddMetaField('cfg'); }
function _caAddMetaField(pfx) {
  const wrap = document.getElementById(pfx+'-ca-meta-fields');
  if (!wrap) return;
  const empty = wrap.querySelector('.wfd-text-444-11b');
  if (empty) empty.remove();
  const i = wrap.querySelectorAll('.ca-meta-key').length;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 24px;gap:5px;align-items:center;';
  div.innerHTML = (() => {
  const names = (wfdData.metadata || [])
    .map(m => m.nom || m.name || '')
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

  const keyCtrl = names.length
    ? `<select class="cfg-select ca-meta-key" data-idx="${i}">
         <option value="">— Champ méta —</option>
         ${names.map(n => `<option value="${n}">${escHtml(n)}</option>`).join('')}
       </select>`
    : `<input class="cfg-input ca-meta-key wfd-mono-sm" data-idx="${i}"
         value="" placeholder="Champ" list="${pfx}-ca-meta-list">`;

  return `
    ${keyCtrl}
    <input class="cfg-input ca-meta-val wfd-mono-sm" data-idx="${i}"
      value="" placeholder="Valeur ou {variable}">
    <button class="cfg-btn danger wfd-pad-3-5" onclick="${pfx}RemoveMetaField(${i})">×</button>`;
})();
  wrap.appendChild(div);
}

function mnRemoveMetaField(i)  { _caRemoveMetaField('mn', i); }
function cfgRemoveMetaField(i) { _caRemoveMetaField('cfg', i); }
function _caRemoveMetaField(pfx, i) {
  const wrap = document.getElementById(pfx+'-ca-meta-fields');
  if (!wrap) return;
  const rows = wrap.querySelectorAll('.ca-meta-key');
  rows.forEach(el => { if (parseInt(el.dataset.idx)===i) el.closest('div').remove(); });
  if (!wrap.querySelectorAll('.ca-meta-key').length)
    wrap.innerHTML = '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>';
}

// Lire la config create_asset depuis le DOM
function _readCreateAssetConfig(pfx) {
  const g = id => document.getElementById(pfx+'-'+id)?.value || '';
  const metaFields = [];
  document.querySelectorAll('#'+pfx+'-ca-meta-fields .ca-meta-key').forEach(el => {
    const i   = el.dataset.idx;
    const val = document.querySelector('#'+pfx+'-ca-meta-fields .ca-meta-val[data-idx="'+i+'"]')?.value || '';
    if (el.value) metaFields.push({ key: el.value, value: val });
  });
  return {
    title      : g('ca-title'),
    status     : g('ca-status'),
    mdViewId   : g('ca-mdview'),
    metaFields,
    collection : g('ca-collection'),
    resultVar  : g('ca-var') || 'new_asset',
    description: g('ca-description'),
  };
}

// ══ PANNEAU CRÉER COLLECTION ═════════════════════════════════════════════════

function _buildCreateColPanel(pfx, cfg, wfdData) {
  const allMeta  = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
  const viewOpts = (wfdData.mdViews||[]).map(v =>
    `<option value="${v.id||v.name}" ${cfg.mdViewId===(v.id||v.name)?'selected':''}>${escHtml(v.name||v.id)}</option>`).join('');

  const _ccMetaNames = (wfdData.metadata || [])
  .map(m => m.nom || m.name || '')
  .filter(Boolean)
  .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

  const ccKeyCtrl = (f,i) => {
  return _ccMetaNames.length
    ? `<select class="cfg-select cc-meta-key" data-idx="${i}">
         <option value="">— Champ méta —</option>
         ${_ccMetaNames.map(n =>
            `<option value="${n}" ${f.key===n?'selected':''}>${escHtml(n)}</option>`).join('')}
       </select>`
    : `<input class="cfg-input cc-meta-key wfd-mono-sm" data-idx="${i}"
         value="${escHtml(f.key||'')}" placeholder="Champ" list="${pfx}-cc-meta-list">`;
};

  const metaFields = (cfg.metaFields||[]).map((f,i) => `
  <div class="wfd-grid-3-24">
    ${ccKeyCtrl(f,i)}
    <input class="cfg-input cc-meta-val wfd-mono-sm" data-idx="${i}"
      value="${escHtml(f.value||'')}" placeholder="Valeur ou {variable}">
    <button class="cfg-btn danger wfd-pad-3-5"
      onclick="${pfx}RemoveColMetaField(${i})">×</button>
  </div>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <datalist id="${pfx}-cc-meta-list">${allMeta.map(m=>`<option value="${m}">`).join('')}</datalist>

  <!-- Nom -->
  <div class="cfg-field">
    <label class="cfg-label">Nom de la collection</label>
    <input id="${pfx}-cc-name" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.name||'')}" placeholder="{serie}  ou  Nom fixe">
  </div>

  <!-- Chemin parent — récursif -->
  <div class="cfg-field">
    <label class="cfg-label">Collection parente</label>
    <input id="${pfx}-cc-parent" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.parent||'')}" placeholder="{collection.id}  ou  ID fixe">
    <div class="wfd-hint-top3">
      Laisser vide pour créer à la racine. Utilisez <code>{variable.id}</code> pour imbriquer dynamiquement.
    </div>
  </div>

  <!-- Création récursive des parents manquants -->
  <div class="cfg-field wfd-row-gap8b">
    <input type="checkbox" id="${pfx}-cc-recursive" class="wfd-swatch"
      ${cfg.recursive?'checked':''}>
    <label for="${pfx}-cc-recursive" class="wfd-icon-ptr">
      Créer les collections parentes manquantes (récursif)
    </label>
  </div>
  <div style="font-size:10px;color:#555;padding:0 0 4px 22px;">
    Si la collection parente n'existe pas, elle sera créée automatiquement jusqu'à la racine.
  </div>

  <!-- Vue de métadonnées -->
  <div class="cfg-field">
    <label class="cfg-label">Vue de métadonnées à remplir</label>
    <select id="${pfx}-cc-mdview" class="cfg-select">
      <option value="">— Aucune —</option>${viewOpts}
    </select>
  </div>

  <!-- Champs metadata initiaux -->
  <div class="cfg-field">
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">Valeurs de métadonnées initiales</label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddColMetaField()">+ Champ</button>
    </div>
    <div id="${pfx}-cc-meta-fields" class="wfd-col-gap5">
      ${metaFields || '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>'}
    </div>
  </div>

  <!-- ACL automatique -->
  <div class="cfg-field">
    <label class="cfg-label">Appliquer les ACL de la collection parente</label>
    <select id="${pfx}-cc-acl" class="cfg-select">
      <option value="inherit" ${(cfg.acl||'inherit')==='inherit'?'selected':''}>⬆ Hériter du parent</option>
      <option value="none"    ${cfg.acl==='none'               ?'selected':''}>— Aucune ACL</option>
      <option value="custom"  ${cfg.acl==='custom'             ?'selected':''}>🔐 Personnalisée (nœud ACL suivant)</option>
    </select>
  </div>

  <!-- Stocker l'ID -->
  <div class="cfg-field">
    <label class="cfg-label">Stocker l'ID de la collection créée dans</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-555">{</span>
      <input id="${pfx}-cc-var" class="cfg-input wfd-flex1-mono"
        value="${escHtml(cfg.resultVar||'new_collection')}" placeholder="new_collection">
      <span class="wfd-mono-555">.id}</span>
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-cc-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Créer la collection Saison si elle n'existe pas…">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

// Fonctions dynamiques create_col
function mnAddColMetaField()     { _ccAddMetaField('mn'); }
function cfgAddColMetaField()    { _ccAddMetaField('cfg'); }
function _ccAddMetaField(pfx) {
  const wrap = document.getElementById(pfx+'-cc-meta-fields');
  if (!wrap) return;
  const empty = wrap.querySelector('.wfd-text-444-11b');
  if (empty) empty.remove();
  const i = wrap.querySelectorAll('.cc-meta-key').length;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 24px;gap:5px;align-items:center;';
  div.innerHTML = (() => {
  const names = (wfdData.metadata || [])
    .map(m => m.nom || m.name || '')
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

  const keyCtrl = names.length
    ? `<select class="cfg-select cc-meta-key" data-idx="${i}">
         <option value="">— Champ méta —</option>
         ${names.map(n => `<option value="${n}">${escHtml(n)}</option>`).join('')}
       </select>`
    : `<input class="cfg-input cc-meta-key wfd-mono-sm" data-idx="${i}"
         value="" placeholder="Champ" list="${pfx}-cc-meta-list">`;

  return `
    ${keyCtrl}
    <input class="cfg-input cc-meta-val wfd-mono-sm" data-idx="${i}"
      value="" placeholder="Valeur ou {variable}">
    <button class="cfg-btn danger wfd-pad-3-5" onclick="${pfx}RemoveColMetaField(${i})">×</button>`;
})();

  wrap.appendChild(div);
}
function mnRemoveColMetaField(i)  { _ccRemoveMetaField('mn', i); }
function cfgRemoveColMetaField(i) { _ccRemoveMetaField('cfg', i); }
function _ccRemoveMetaField(pfx, i) {
  const wrap = document.getElementById(pfx+'-cc-meta-fields');
  if (!wrap) return;
  wrap.querySelectorAll('.cc-meta-key').forEach(el => {
    if (parseInt(el.dataset.idx)===i) el.closest('div').remove();
  });
  if (!wrap.querySelectorAll('.cc-meta-key').length)
    wrap.innerHTML = '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>';
}

function _readCreateColConfig(pfx) {
  const g = id => document.getElementById(pfx+'-'+id)?.value || '';
  const metaFields = [];
  document.querySelectorAll('#'+pfx+'-cc-meta-fields .cc-meta-key').forEach(el => {
    const i   = el.dataset.idx;
    const val = document.querySelector('#'+pfx+'-cc-meta-fields .cc-meta-val[data-idx="'+i+'"]')?.value || '';
    if (el.value) metaFields.push({ key: el.value, value: val });
  });
  return {
    name       : g('cc-name'),
    parent     : g('cc-parent'),
    recursive  : !!document.getElementById(pfx+'-cc-recursive')?.checked,
    mdViewId   : g('cc-mdview'),
    metaFields,
    acl        : g('cc-acl') || 'inherit',
    resultVar  : g('cc-var') || 'new_collection',
    description: g('cc-description'),
  };
}


// ══ NŒUD RELIER FICHIER ══════════════════════════════════════════════════════

const LINK_FILE_TYPES = {
  original : { label:'Original',  icon:'🎬', desc:'Fichier source haute qualité' },
  proxy    : { label:'Proxy',     icon:'📺', desc:'Fichier de visualisation basse résolution' },
  sidecar  : { label:'Sidecar',   icon:'📋', desc:'Fichier annexe (XML, SRT, EDL…)' },
};

const LINK_FILE_FORMATS = [
  'MXF','MOV','MP4','AVI','R3D','BRAW','ProRes','DNxHD','DNxHR',
  'H264','H265','HEVC','WAV','MP3','AAC','XML','SRT','EDL','CSV','PDF','ZIP',
];

function _buildLinkFilePanel(pfx, cfg, wfdData) {
  const storageOpts = (wfdData.storages||[]).map(s =>
    `<option value="${s.id||s.name}" ${cfg.storageId===(s.id||s.name)?'selected':''}>${escHtml(s.name||s.id)}</option>`
  ).join('');

  const fmtOpts = LINK_FILE_FORMATS.map(f =>
    `<option value="${f}" ${cfg.format===f?'selected':''}>${f}</option>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <!-- Asset cible -->
  <div class="cfg-field">
    <label class="cfg-label">Asset cible</label>
    <input id="${pfx}-lf-asset" class="cfg-input wfd-mono"
      value="${escHtml(cfg.assetId||'')}" placeholder="{asset.id}  ou  {new_asset.id}">
    <div class="wfd-hint-top3">
      Variable alimentée par un nœud <strong>Rechercher</strong> ou <strong>Créer Asset</strong> en amont
    </div>
  </div>

  <!-- Chemin du fichier -->
  <div class="cfg-field">
    <label class="cfg-label">Chemin du fichier</label>
    <input id="${pfx}-lf-path" class="cfg-input wfd-mono"
      value="${escHtml(cfg.filePath||'')}" placeholder="{file.path}  ou  /mnt/nas/films/monfilm.mxf">
    <div class="wfd-hint-top3">
      Chemin relatif au stockage sélectionné ci-dessous
    </div>
  </div>

  <!-- Stockage Iconik -->
  <div class="cfg-field">
    <label class="cfg-label">Stockage Iconik</label>
    <select id="${pfx}-lf-storage" class="cfg-select">
      <option value="">— Sélectionner un stockage —</option>
      ${storageOpts || '<option disabled>Aucun stockage — synchronisez dans Paramètres</option>'}
    </select>
  </div>

  <!-- Type de fichier -->
  <div class="cfg-field">
    <label class="cfg-label">Type de fichier</label>
    <div class="wfd-row-gap6b">
      ${Object.entries(LINK_FILE_TYPES).map(([k,v]) => `
        <label class="wfd-lf-type-label${(cfg.fileType||'original')===k?' checked-green':' unchecked'}">
          <input type="radio" name="${pfx}-lf-type" value="${k}"
            ${(cfg.fileType||'original')===k?'checked':''}
            style="accent-color:#27ae60;" onchange="_lfTypeChange('${pfx}')">
          <span class="wfd-fs14">${v.icon}</span>
          <span>${v.label}</span>
        </label>`).join('')}
    </div>
    <div id="${pfx}-lf-type-desc" class="wfd-hint-top4b">
      ${LINK_FILE_TYPES[cfg.fileType||'original']?.desc||''}
    </div>
  </div>

  <!-- Format -->
  <div class="cfg-field">
    <label class="cfg-label">Format</label>
    <div class="wfd-row-gap6b">
      <select id="${pfx}-lf-format" class="cfg-select wfd-flex1"
        onchange="_lfFormatChange('${pfx}')">
        <option value="">— Détecter depuis l'extension —</option>
        ${fmtOpts}
      </select>
      <input id="${pfx}-lf-format-custom" class="cfg-input wfd-flex1-mono${cfg.format?' wfd-hidden':''}"
        value="${escHtml(cfg.formatCustom||'')}" placeholder="ou format libre…">
    </div>
  </div>

  <!-- Options avancées -->
  <div class="wfd-card-sm2">
    <div class="cfg-label wfd-mb8">Options</div>

    <!-- Générer proxy -->
    <div class="wfd-row-gap8-mb8">
      <input type="checkbox" id="${pfx}-lf-proxy" class="wfd-swatch"
        ${cfg.generateProxy?'checked':''}>
      <label for="${pfx}-lf-proxy" class="wfd-icon-ptr">
        Lancer le transcodage proxy après ingestion
      </label>
    </div>

    <!-- Générer keyframes -->
    <div class="wfd-row-gap8-mb8">
      <input type="checkbox" id="${pfx}-lf-keyframes" class="wfd-swatch"
        ${cfg.generateKeyframes?'checked':''}>
      <label for="${pfx}-lf-keyframes" class="wfd-icon-ptr">
        Générer les keyframes (vignettes)
      </label>
    </div>

    <!-- Mettre online après ingestion -->
    <div class="wfd-row-gap8b">
      <input type="checkbox" id="${pfx}-lf-online" class="wfd-swatch"
        ${cfg.setOnline!==false?'checked':''}>
      <label for="${pfx}-lf-online" class="wfd-icon-ptr">
        Passer l'asset en Online après ingestion
      </label>
    </div>
  </div>

  <!-- Variable résultat -->
  <div class="cfg-field">
    <label class="cfg-label">Stocker l'ID du fichier créé dans</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-555">{</span>
      <input id="${pfx}-lf-var" class="cfg-input wfd-flex1-mono"
        value="${escHtml(cfg.resultVar||'file')}" placeholder="file">
      <span class="wfd-mono-555">.id}</span>
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-lf-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Relier le High Res à l'asset vide créé depuis WON…">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _lfTypeChange(pfx) {
  const sel  = document.querySelector(`input[name="${pfx}-lf-type"]:checked`)?.value || 'original';
  const desc = document.getElementById(pfx+'-lf-type-desc');
  if (desc) desc.textContent = LINK_FILE_TYPES[sel]?.desc || '';
  // Mettre à jour les styles des labels radio
  document.querySelectorAll(`input[name="${pfx}-lf-type"]`).forEach(el => {
    const lbl = el.closest('label');
    if (!lbl) return;
    const active = el.checked;
    lbl.classList.toggle('checked-green', active);
    lbl.classList.toggle('unchecked', !active);
  });
}

function _lfFormatChange(pfx) {
  const sel    = document.getElementById(pfx+'-lf-format')?.value;
  const custom = document.getElementById(pfx+'-lf-format-custom');
  if (custom) custom.classList.toggle('wfd-hidden', !!sel);
}

function _readLinkFileConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-lf-asset');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };
  const cb = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? !!el.checked : undefined; // undefined si panneau non monté
  };

  let fileType = document.querySelector(`input[name="${pfx}-lf-type"]:checked`)?.value;
  if (panelMounted) fileType = fileType ?? 'original';

  const assetId       = g('lf-asset');
  const filePath      = g('lf-path');
  const storageId     = g('lf-storage');
  const format        = g('lf-format') ?? g('lf-format-custom'); // si les deux absents → undefined
  const generateProxy = cb('lf-proxy');
  const generateKeyframes = cb('lf-keyframes');
  const setOnline     = cb('lf-online');

  let resultVar = g('lf-var');
  if (panelMounted) resultVar = resultVar ?? 'file';

  const description = g('lf-description');

  const cfg = {};
  if (assetId          !== undefined) cfg.assetId = assetId;
  if (filePath         !== undefined) cfg.filePath = filePath;
  if (storageId        !== undefined) cfg.storageId = storageId;
  if (fileType         !== undefined) cfg.fileType = fileType;
  if (format           !== undefined) cfg.format = format;
  if (generateProxy    !== undefined) cfg.generateProxy = generateProxy;
  if (generateKeyframes!== undefined) cfg.generateKeyframes = generateKeyframes;
  if (setOnline        !== undefined) cfg.setOnline = setOnline;
  if (resultVar        !== undefined) cfg.resultVar = resultVar;
  if (description      !== undefined) cfg.description = description;

  return cfg;
}


// ══ NŒUD METTRE À JOUR LES MÉTADONNÉES ══════════════════════════════════════

function _buildUpdateMetaPanel(pfx, cfg, wfdData) {
  const allMeta  = (wfdData.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean).sort();
  const viewOpts = (wfdData.mdViews||[]).map(v =>
    `<option value="${v.id||v.name}" ${cfg.mdViewId===(v.id||v.name)?'selected':''}>${escHtml(v.name||v.id)}</option>`
  ).join('');

  const mode    = cfg.mode || 'view';
  const target  = cfg.target || 'asset';
  const method  = cfg.method || 'patch';

  // Champs manuels
  const _umMetaNames = (wfdData.metadata || [])
  .map(m => m.nom || m.name || '')
  .filter(Boolean)
  .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

  const fieldKeyCtrl = (f,i) => {
  return _umMetaNames.length
    ? `<select class="cfg-select um-field-key" data-idx="${i}">
         <option value="">— Champ méta —</option>
         ${_umMetaNames.map(n =>
             `<option value="${n}" ${f.key===n?'selected':''}>${escHtml(n)}</option>`).join('')}
       </select>`
    : `<input class="cfg-input um-field-key wfd-mono-sm" data-idx="${i}"
         value="${escHtml(f.key||'')}" placeholder="Champ" list="${pfx}-um-meta-list">`;
};

  const fields = (cfg.fields||[]).map((f,i) => {
    const _fop = f.op || 'write';
    return `
  <div class="wfd-um-field-grid">
    ${fieldKeyCtrl(f,i)}
    <input class="cfg-input um-field-val wfd-mono-sm" data-idx="${i}"
      list="${pfx}-wfd-var-list"
      value="${escHtml(f.value||'')}" placeholder="Valeur ou {variable}">
    <div class="wfd-um-ops-wrap">
      ${[['write','W','Ecrire'],['reset','R','Effacer'],['copy','C','Copier']].map(([v,ic,lb]) =>
        `<button class="wfd-um-op-btn um-field-op-btn ${_fop===v?'active-blue':'inactive-btn'}"
          data-idx="${i}" data-op="${v}" title="${lb}"
          onclick="umFieldOpChange(this)">${ic}</button>`
      ).join('')}
      <input type="hidden" class="um-field-op" data-idx="${i}" value="${_fop}">
    </div>
    <button class="cfg-btn danger wfd-um-del-btn"
      onclick="${pfx}RemoveUmField(${i})">x</button>
  </div>`;
  }).join('');
  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <datalist id="${pfx}-um-meta-list">${allMeta.map(m=>`<option value="${m}">`).join('')}</datalist>

  <!-- Cible : asset ou collection -->
  <div class="cfg-field">
    <label class="cfg-label">Cible</label>
    <div class="wfd-row-gap6b">
      ${[['asset','🎬 Asset'],['collection','📁 Collection']].map(([k,lbl]) => `
        <label class="wfd-um-target-lbl${target===k?' checked-purple':''}">
          <input type="radio" name="${pfx}-um-target" value="${k}" ${target===k?'checked':''}
            style="accent-color:#9b59b6;" onchange="_umTargetChange('${pfx}')">
          ${lbl}
        </label>`).join('')}
    </div>
  </div>

  <!-- ID de la cible -->
  <div class="cfg-field">
    <label class="cfg-label" id="${pfx}-um-id-label">Identifiant cible</label>
    <input id="${pfx}-um-target-id" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.targetId||'')}"
      placeholder="${target==='collection'?'{collection.id}':'{asset.id}'}">
    <div class="wfd-hint-top3">Variable ou valeur fixe — ex&nbsp;: <code>{asset.id}</code>, <code>{prime_id}</code>, <code>{vars.monId}</code></div>
  </div>

  <!-- Mode d'écriture -->
  <div class="cfg-field">
    <label class="cfg-label">Mode</label>
    <select id="${pfx}-um-mode" class="cfg-select" onchange="_umModeChange('${pfx}')">
      <option value="view"   ${mode==='view'  ?'selected':''}>📋 Via une vue de métadonnées</option>
      <option value="fields" ${mode==='fields'?'selected':''}>🏷 Champ par champ (sans vue)</option>
    </select>
  </div>

  <!-- Vue de métadonnées -->
  <div id="${pfx}-um-view-wrap" class="cfg-field${mode==='fields'?' wfd-hidden':''}">
    <label class="cfg-label">Vue de métadonnées</label>
    <select id="${pfx}-um-mdview" class="cfg-select">
      <option value="">— Sélectionner une vue —</option>
      ${viewOpts}
    </select>
  </div>

  <!-- Champs -->
  <div class="cfg-field wfd-um-fields-col">
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">
        ${mode==='view'?'Valeurs à écrire dans la vue':'Champs à mettre à jour'}
      </label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddUmField()">+ Champ</button>
    </div>
    <div class="wfd-um-fields-hdr">
      <span>Nom du champ</span><span>Valeur ou {variable}</span><span></span>
    </div>
    <div id="${pfx}-um-fields" class="wfd-um-fields-list">
      ${fields || '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>'}
    </div>
    <div class="wfd-um-fields-hint">
      Laissez la valeur vide pour effacer un champ. Utilisez <code>{variable}</code> pour injecter depuis le contexte.
    </div>
  </div>

  <!-- Méthode HTTP -->
  <div class="cfg-field">
    <label class="cfg-label">Méthode d'écriture</label>
    <div class="wfd-row-gap6b">
      ${[
        ['patch','PATCH','Ne modifie que les champs envoyés — les autres sont conservés','#27ae60'],
        ['put',  'PUT',  'Remplace tous les champs de la vue — les autres sont effacés','#e74c3c'],
      ].map(([k,lbl,desc,color]) => `
        <label class="wfd-um-method-label${method===k?' checked-dynamic':' unchecked'}"
          style="--chk-color:${method===k?color:'#2a2a2a'};">
          <div class="wfd-um-method-row">
            <input type="radio" name="${pfx}-um-method" value="${k}" ${method===k?'checked':''}
              style="accent-color:${color};" onchange="_umMethodChange('${pfx}')">
            <code class="wfd-um-method-code" style="--method-color:${color};">${lbl}</code>
          </div>
          <div class="wfd-hint-left">${desc}</div>
        </label>`).join('')}
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-um-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Écrire les métadonnées WON sur la vue MD Iconik…">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

// ── Fonctions dynamiques update_meta ────────────────────────────────────────

function _umModeChange(pfx) {
  const mode = document.getElementById(pfx+'-um-mode')?.value || 'view';
  const wrap = document.getElementById(pfx+'-um-view-wrap');
  if (wrap) wrap.classList.toggle('wfd-hidden', mode === 'fields');
}

function _umTargetChange(pfx) {
  const t     = document.querySelector(`input[name="${pfx}-um-target"]:checked`)?.value || 'asset';
  const label = document.getElementById(pfx+'-um-id-label');
  const input = document.getElementById(pfx+'-um-target-id');
  if (label) label.textContent = 'Identifiant cible';
  if (input) input.placeholder = t === 'collection' ? '{collection.id}' : '{asset.id}';
  // Styles radio
  document.querySelectorAll(`input[name="${pfx}-um-target"]`).forEach(el => {
    const lbl = el.closest('label');
    if (!lbl) return;
    lbl.classList.toggle('checked-purple', el.checked);
  });
}

function _umMethodChange(pfx) {
  const colors = { patch:'#27ae60', put:'#e74c3c' };
  document.querySelectorAll(`input[name="${pfx}-um-method"]`).forEach(el => {
    const lbl   = el.closest('label');
    const color = colors[el.value] || '#555';
    if (!lbl) return;
    lbl.style.setProperty('--chk-color', el.checked ? color : '#2a2a2a');
    lbl.classList.toggle('checked-dynamic', el.checked);
    lbl.classList.toggle('unchecked', !el.checked);
  });
}

function mnAddUmField()     { _umAddField('mn');  }
function cfgAddUmField()    { _umAddField('cfg'); }
function _umAddField(pfx) {
  const wrap = document.getElementById(pfx+'-um-fields');
  if (!wrap) return;
  const empty = wrap.querySelector('.wfd-text-444-11b');
  if (empty) empty.remove();
  const i = wrap.querySelectorAll('.um-field-key').length;
  const div = document.createElement('div');
  div.className = 'wfd-um-field-grid';
  div.innerHTML = (() => {
    const names = (wfdData.metadata || [])
      .map(m => m.nom || m.name || '')
      .filter(Boolean)
      .sort((a,b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
    const keyCtrl = names.length
      ? `<select class="cfg-select um-field-key" data-idx="${i}" onchange="umUpdateValueWidget(this)">
           <option value="">— Champ meta —</option>
           ${names.map(n => `<option value="${n}">${escHtml(n)}</option>`).join('')}
         </select>`
      : `<input class="cfg-input um-field-key wfd-mono-sm" data-idx="${i}"
           value="" placeholder="Champ" list="${pfx}-um-meta-list">`;
    const listId = pfx + '-wfd-var-list';
    const valWidget = '<input class="cfg-input um-field-val wfd-mono-sm" data-idx="' + i + '" value="" '
      + 'placeholder="Valeur ou {variable}" list="' + listId + '">';
    const opBtns = [['write','W','Ecrire'],['reset','R','Effacer'],['copy','C','Copier']].map(function(arr) {
      var v=arr[0], ic=arr[1], lb=arr[2];
      var cls = 'wfd-um-op-btn um-field-op-btn ' + (v==='write' ? 'active-blue' : 'inactive-btn');
      return '<button class="' + cls + '" data-idx="' + i + '" data-op="' + v + '" title="' + lb + '"'
        + ' onclick="umFieldOpChange(this)">' + ic + '</button>';
    }).join('');
    return `
      ${keyCtrl}
      ${valWidget}
      <div class="wfd-um-ops-wrap">${opBtns}<input type="hidden" class="um-field-op" data-idx="${i}" value="write"></div>
      <button class="cfg-btn danger wfd-um-del-btn" onclick="${pfx}RemoveUmField(${i})">x</button>`;
  })();
  wrap.appendChild(div);
  try {
    const val = div.querySelector('.um-field-val');
    if (val && !(val.getAttribute('list') || '').endsWith('-wfd-var-list')) {
      val.setAttribute('list', pfx + '-wfd-var-list');
    }
  } catch (_) {}
}

function mnRemoveUmField(i)  { _umRemoveField('mn',  i); }
function cfgRemoveUmField(i) { _umRemoveField('cfg', i); }
// AJOUTER : force l'attribut list sur les inputs "Valeur ou {variable}"
function whStatutPresetChange(pfx) {
  const preset = document.getElementById(pfx + '-wh-statut-preset')?.value;
  const customInput = document.getElementById(pfx + '-wh-statut');
  if (!customInput) return;
  if (preset === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
  whUpdatePreview(pfx);
}

function whUpdatePreview(pfx) {
  const preview = document.getElementById(pfx + '-wh-preview');
  if (!preview) return;
  const g = id => document.getElementById(pfx + '-' + id);
  const parts = [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10) + '_' + now.toTimeString().slice(0,5);
  if (g('wh-show-date')?.checked !== false && g('wh-show-date')) parts.push(dateStr);
  // Run ID toujours en fin de ligne (invisible) — affiché visuellement seulement si coché
  if (g('wh-show-runid')?.checked === true) parts.push('run-abc123');
  if (g('wh-show-wf')?.checked !== false && g('wh-show-wf')) {
    const wfName = g('wh-wf-name')?.value?.trim()
      || (typeof getFluxCourant === 'function' ? getFluxCourant()?.name : '') || '';
    if (wfName) parts.push(wfName);
  }
  if (g('wh-show-user')?.checked !== false && g('wh-show-user')) {
    // En aperçu, ne montrer l'utilisateur que si on sait qu'il sera disponible
    parts.push('utilisateur');
  }
  const _preset  = g('wh-statut-preset')?.value;
  const statut   = (_preset && _preset !== '__custom__' && _preset !== '')
    ? _preset
    : (g('wh-statut')?.value || '');
  const message = g('wh-message')?.value || '';
  if (statut)  parts.push(statut);
  if (message) parts.push(message);
  preview.textContent = parts.join(' | ') || '(aperçu vide)';
}

function whUpdateFields(pfx) {
  // Rafraîchir le select des champs MD quand la vue change
  // Pour l'instant on recharge tout le panneau
  if (pfx !== 'cfg') return;
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node = flux?.nodes?.find(n => n.id === selectedNodeId);
  if (!node) return;
  // Sauvegarder la vue sélectionnée avant de re-render
  const viewId = document.getElementById(pfx + '-wh-md-view')?.value || '';
  node.config.mdViewId = viewId;
  if (typeof ouvrirConfigPanel === 'function') ouvrirConfigPanel(node);
}

function umUpdateValueWidget(keySelect, savedValue) {
  /** Met à jour le widget valeur quand le champ MD change dans Update Meta */
  const row = keySelect.closest('div');
  if (!row) return;
  const idx = keySelect.dataset.idx;
  const valEl = row.querySelector('.um-field-val[data-idx="' + idx + '"]');
  if (!valEl) return;
  const fieldName = keySelect.value;
  const initVal = savedValue !== undefined ? savedValue : valEl.value;
  const field = typeof lkGetMdField === 'function' ? lkGetMdField(fieldName) : null;
  const type  = field?.field_type;
  const opts  = field?.options || [];
  const pfx   = row.closest('[id$="-um-fields"]')?.id?.replace(/-um-fields$/, '') || 'cfg';
  const listId = pfx + '-wfd-var-list';

  if (type === 'boolean') {
    // Remplacer input par select boolean
    const sel = document.createElement('select');
    sel.className = 'cfg-select um-field-val';
    sel.dataset.idx = idx;
    const _iv1 = initVal;
    sel.innerHTML = '<option value="">— choisir —</option>' +
      '<option value="true"' + (_iv1==='true'?' selected':'') + '>Vrai (true)</option>' +
      '<option value="false"' + (_iv1==='false'?' selected':'') + '>Faux (false)</option>';
    valEl.replaceWith(sel);
  } else if (type === 'drop_down' && opts.length) {
    // Remplacer input par select dropdown
    const sel = document.createElement('select');
    sel.className = 'cfg-select um-field-val';
    sel.dataset.idx = idx;
    const _iv2 = initVal;
    sel.innerHTML = '<option value="">— choisir —</option>' +
      opts.map(o => '<option value="' + escHtml(o.value) + '"' + (_iv2===o.value?' selected':'') + '>' + escHtml(o.label) + '</option>').join('');
    valEl.replaceWith(sel);
  } else {
    // Remettre un input si c'était un select
    if (valEl.tagName === 'SELECT') {
      const inp = document.createElement('input');
      inp.className = 'cfg-input um-field-val';
      inp.dataset.idx = idx;
      inp.placeholder = 'Valeur ou {variable}';
      inp.setAttribute('list', listId);
      inp.style.cssText = 'font-size:11px;font-family:var(--font-mono);';
      valEl.replaceWith(inp);
    } else {
      valEl.setAttribute('list', listId);
    }
  }
}

function _umEnhanceValInputs(pfx) {
  try {
    document.querySelectorAll('#' + pfx + '-um-fields .um-field-val').forEach(inp => {
      const cur = inp.getAttribute('list') || '';
      if (!cur.endsWith('-wfd-var-list')) {
        inp.setAttribute('list', pfx + '-wfd-var-list');
      }
    });
  } catch (_) { /* no-op */ }
}
function _umRemoveField(pfx, i) {
  const wrap = document.getElementById(pfx+'-um-fields');
  if (!wrap) return;
  wrap.querySelectorAll('.um-field-key').forEach(el => {
    if (parseInt(el.dataset.idx) === i) el.closest('div').remove();
  });
  if (!wrap.querySelectorAll('.um-field-key').length)
    wrap.innerHTML = '<div class="wfd-text-444-11b">Aucun champ — ajoutez-en un.</div>';
}

function _readUpdateMetaConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-um-mode');

  // g(): undefined si l'élément n’existe pas, sinon sa valeur (peut être '')
  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  // Radios sans défaut quand le panneau n’est pas monté
  let target = document.querySelector(`input[name="${pfx}-um-target"]:checked`)?.value;
  let method = document.querySelector(`input[name="${pfx}-um-method"]:checked`)?.value;

  // Defaults uniquement en mode édition (panneau monté)
  if (panelMounted) {
    target = target ?? 'asset';
    method = method ?? 'patch';
  }

  // mode (view/fields) — défaut seulement si panneau monté
  let mode = g('um-mode');
  if (panelMounted) mode = mode ?? 'view';

  const mdViewId     = g('um-mdview');      // peut être '', si l’utilisateur l’a effacé
  const targetId     = g('um-target-id');
  const description  = g('um-description');

  // Liste fields (présente seulement si le panneau l’est)
  const fields = [];
  document.querySelectorAll('#' + pfx + '-um-fields .um-field-key').forEach(el => {
    const i     = el.dataset.idx;
    const valEl = document.querySelector('#' + pfx + '-um-fields .um-field-val[data-idx="' + i + '"]');
    const val   = valEl?.value ?? '';
    const opEl  = document.querySelector('#' + pfx + '-um-fields .um-field-op[data-idx="' + i + '"]');
    const op    = opEl?.value || 'write';
    if (el.value) fields.push({ key: el.value, value: val, op });
  });

  // Construire la sortie en n’ajoutant que les clés définies quand le panneau n’est pas monté
  const cfg = {};
  if (target      !== undefined) cfg.target = target;
  if (targetId    !== undefined) cfg.targetId = targetId;
  if (mode        !== undefined) cfg.mode = mode;
  if (mdViewId    !== undefined) cfg.mdViewId = mdViewId;
  
  if (panelMounted) {
  cfg.fields = fields;               // ← force l’effacement quand la liste est vidée
} else if (fields.length) {
  cfg.fields = fields;
}

  if (method      !== undefined) cfg.method = method;
  if (description !== undefined) cfg.description = description;

  return cfg;
}

// ══ NŒUD ACL / PERMISSIONS ═══════════════════════════════════════════════════

function _buildAclPanel(pfx, cfg, wfdData) {
  const teams   = wfdData.teams || [];
  const target  = cfg.target  || 'asset';
  const op      = cfg.op      || 'add';
  const entries = cfg.entries || [];

  const entriesHtml = entries.map((e, i) => {
    const teamOpts = teams.map(t =>
      `<option value="${t.id||t.name}" ${e.teamId===(t.id||t.name)?'selected':''}>${escHtml(t.name||t.id)}</option>`
    ).join('');
    return `
    <div class="acl-entry wfd-acl-entry-card" id="acl-entry-${i}">
      <div class="wfd-acl-entry-row">
        <select class="cfg-select acl-team wfd-acl-team-select" data-idx="${i}">
          <option value="">— Team / Groupe —</option>${teamOpts}
        </select>
        <button class="cfg-btn danger wfd-acl-del-btn"
          onclick="${pfx}RemoveAclEntry(${i})">×</button>
      </div>
      <div class="wfd-tags-wrap">
        ${[['read','Lecture','#27ae60'],['write','Écriture','#3498db'],['delete','Suppression','#e74c3c']].map(([k,lbl,color]) => `
          <label class="wfd-acl-perm-label${e[k]?' checked-green-bg checked-dynamic':' unchecked'}"
            style="--chk-color:${e[k]?color:'#2a2a2a'};" id="acl-lbl-${i}-${k}">
            <input type="checkbox" class="acl-perm" data-idx="${i}" data-perm="${k}"
              ${e[k]?'checked':''}
              style="accent-color:${color};"
              onchange="_aclPermChange('${pfx}',${i},'${k}','${color}')">
            ${lbl}
          </label>`).join('')}
      </div>
    </div>`;
  }).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <!-- Cible -->
  <div class="cfg-field">
    <label class="cfg-label">Cible</label>
    <div class="wfd-row-gap6b">
      ${[['asset','\uD83C\uDFAC Asset'],['collection','\uD83D\uDCC1 Collection']].map(([k,lbl]) => `
        <label class="wfd-acl-target-label${target===k?' checked-red':' unchecked'}">
          <input type="radio" name="${pfx}-acl-target" value="${k}" ${target===k?'checked':''}
            style="accent-color:#c0392b;" onchange="_aclTargetChange('${pfx}')">
          ${lbl}
        </label>`).join('')}
    </div>
  </div>

  <!-- ID cible -->
  <div class="cfg-field">
    <label class="cfg-label" id="${pfx}-acl-id-label">${target==='collection'?'ID de la collection':"ID de l'asset"}</label>
    <input id="${pfx}-acl-target-id" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.targetId||'')}"
      placeholder="${target==='collection'?'{collection.id}':'{asset.id}'}">
  </div>

  <!-- Opération -->
  <div class="cfg-field">
    <label class="cfg-label">Opération</label>
    <div class="wfd-row-gap6b">
      ${[
        ['add',     'Ajouter',        'Ajoute les ACL sans toucher aux existantes', '#27ae60'],
        ['replace', 'Remplacer tout', 'Supprime toutes les ACL existantes puis applique les nouvelles', '#e74c3c'],
      ].map(([k,lbl,desc,color]) => `
        <label class="wfd-acl-op-label${op===k?' checked-dynamic':''}"
          style="--op-bg:${op===k?'#0d0d0d':'#0a0a0a'};--chk-color:${op===k?color:'#2a2a2a'};">
          <div class="wfd-acl-op-row">
            <input type="radio" name="${pfx}-acl-op" value="${k}" ${op===k?'checked':''}
              style="accent-color:${color};" onchange="_aclOpChange('${pfx}')">
            <span class="wfd-acl-op-label-text" style="--op-color:${color};">${lbl}</span>
          </div>
          <div class="wfd-hint-left">${desc}</div>
        </label>`).join('')}
    </div>
  </div>

  <!-- Entries teams -->
  <div class="cfg-field">
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">Teams et permissions</label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddAclEntry()">+ Team</button>
    </div>
    <div id="${pfx}-acl-entries" class="wfd-acl-entries-wrap">
      ${entriesHtml || '<div class="wfd-text-444-11b">Aucune team \u2014 ajoutez-en une.</div>'}
    </div>
  </div>

  <!-- Propager (collections seulement) -->
  <div id="${pfx}-acl-propagate-wrap" class="cfg-field${target==='asset'?' wfd-hidden':''}">
    <div class="wfd-row-gap8b">
      <input type="checkbox" id="${pfx}-acl-propagate"
        class="wfd-swatch" ${cfg.propagate?'checked':''}>
      <label for="${pfx}-acl-propagate" class="wfd-icon-ptr">
        Propager aux sous-collections et assets enfants
      </label>
    </div>
    <div class="wfd-acl-propagate-hint">
      Applique les ACL récursivement à tout le contenu de la collection
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-acl-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Appliquer Read Only MR-GROUP-USERS sur la collection Produit\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

// ── Fonctions dynamiques ACL ─────────────────────────────────────────────────

function _aclTargetChange(pfx) {
  const t     = document.querySelector(`input[name="${pfx}-acl-target"]:checked`)?.value || 'asset';
  const label = document.getElementById(pfx+'-acl-id-label');
  const input = document.getElementById(pfx+'-acl-target-id');
  const propW = document.getElementById(pfx+'-acl-propagate-wrap');
  if (label) label.textContent = 'Identifiant cible';
  if (input) input.placeholder = t === 'collection' ? '{collection.id}' : '{asset.id}';
  if (propW) propW.classList.toggle('wfd-hidden', t === 'asset');
  document.querySelectorAll(`input[name="${pfx}-acl-target"]`).forEach(el => {
    const lbl = el.closest('label');
    if (lbl) {
      lbl.classList.toggle('checked-red', el.checked);
      lbl.classList.toggle('unchecked', !el.checked);
    }
  });
}

function _aclOpChange(pfx) {
  const colors = { add:'#27ae60', replace:'#e74c3c' };
  document.querySelectorAll(`input[name="${pfx}-acl-op"]`).forEach(el => {
    const lbl = el.closest('label');
    if (lbl) { lbl.style.setProperty('--chk-color', el.checked ? (colors[el.value]||'#555') : '#2a2a2a'); lbl.classList.toggle('checked-dynamic', el.checked); }
  });
}

function _aclPermChange(pfx, i, perm, color) {
  const cb  = document.querySelector(`.acl-perm[data-idx="${i}"][data-perm="${perm}"]`);
  const lbl = document.getElementById(`acl-lbl-${i}-${perm}`);
  if (!cb || !lbl) return;
  lbl.classList.toggle('checked-green-bg', cb.checked);
  lbl.style.setProperty('--chk-color', cb.checked ? color : '#2a2a2a');
  lbl.classList.toggle('checked-dynamic', cb.checked);
  lbl.classList.toggle('unchecked', !cb.checked);
}

function mnAddAclEntry()     { _aclAddEntry('mn');  }
function cfgAddAclEntry()    { _aclAddEntry('cfg'); }
function _aclAddEntry(pfx) {
  const wrap  = document.getElementById(pfx+'-acl-entries');
  if (!wrap) return;
  const empty = wrap.querySelector('.wfd-text-444-11b');
  if (empty) empty.remove();
  const i     = wrap.querySelectorAll('.acl-entry').length;
  const teams = wfdData.teams || [];
  const teamOpts = teams.map(t =>
    `<option value="${t.id||t.name}">${escHtml(t.name||t.id)}</option>`).join('');
  const div = document.createElement('div');
  div.className = 'acl-entry wfd-acl-entry-card';
  div.id = `acl-entry-${i}`;
  div.innerHTML = `
    <div class="wfd-acl-entry-row">
      <select class="cfg-select acl-team wfd-acl-team-select" data-idx="${i}">
        <option value="">— Team / Groupe —</option>${teamOpts}
      </select>
      <button class="cfg-btn danger wfd-acl-del-btn" onclick="${pfx}RemoveAclEntry(${i})">×</button>
    </div>
    <div class="wfd-tags-wrap">
      ${[['read','Lecture','#27ae60'],['write','\u00c9criture','#3498db'],['delete','Suppression','#e74c3c']].map(([k,lbl,color]) => `
        <label class="wfd-acl-perm-label unchecked" id="acl-lbl-${i}-${k}">
          <input type="checkbox" class="acl-perm" data-idx="${i}" data-perm="${k}"
            style="accent-color:${color};"
            onchange="_aclPermChange('${pfx}',${i},'${k}','${color}')">
          ${lbl}
        </label>`).join('')}
    </div>`;
  wrap.appendChild(div);
}

function mnRemoveAclEntry(i)  { _aclRemoveEntry('mn',  i); }
function cfgRemoveAclEntry(i) { _aclRemoveEntry('cfg', i); }
function _aclRemoveEntry(pfx, i) {
  const el = document.getElementById('acl-entry-'+i);
  if (el) el.remove();
  const wrap = document.getElementById(pfx+'-acl-entries');
  if (wrap && !wrap.querySelectorAll('.acl-entry').length)
    wrap.innerHTML = '<div class="wfd-text-444-11b">Aucune team \u2014 ajoutez-en une.</div>';
}

function _readAclConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-acl-target-id');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  let target = document.querySelector(`input[name="${pfx}-acl-target"]:checked`)?.value;
  let op     = document.querySelector(`input[name="${pfx}-acl-op"]:checked`)?.value;

  if (panelMounted) {
    target = target ?? 'asset';
    op     = op ?? 'add';
  }

  // propagate : undefined si case absente (panneau non monté)
  const propEl    = document.getElementById(pfx + '-acl-propagate');
  const propagate = propEl ? !!propEl.checked : undefined;

  const targetId   = g('acl-target-id');
  const description= g('acl-description');

  const entries = [];
  document.querySelectorAll('#' + pfx + '-acl-entries .acl-entry').forEach(row => {
    const teamEl = row.querySelector('.acl-team');
    if (!teamEl?.value) return;
    const entry = { teamId: teamEl.value };
    row.querySelectorAll('.acl-perm').forEach(cb => { entry[cb.dataset.perm] = cb.checked; });
    entries.push(entry);
  });

  const cfg = {};
  if (target      !== undefined) cfg.target = target;
  if (targetId    !== undefined) cfg.targetId = targetId;
  if (op          !== undefined) cfg.op = op;
  if (entries.length)            cfg.entries = entries;
  if (propagate   !== undefined) cfg.propagate = propagate;
  if (description !== undefined) cfg.description = description;

  return cfg;
}

// ══ NŒUDS EXPORT — Export Fichier / Publier / Notifier / Transcoder ══════════

const EXPORT_FILE_TARGETS = {
  file  : 'Fichier local',
  s3    : 'Amazon S3',
  ftp   : 'FTP',
  sftp  : 'SFTP',
  gcs   : 'Google Cloud Storage',
  azure : 'Azure Blob Storage',
};

const PUBLISH_TARGETS = {
  youtube  : 'YouTube',
  vimeo    : 'Vimeo',
  facebook : 'Facebook / Meta',
  twitter  : 'Twitter / X',
};

const TRANSCODE_PRESETS = [
  'H264 1080p','H264 720p','H264 4K','H265 1080p','H265 4K',
  'ProRes 422','ProRes 422 HQ','ProRes 4444','DNxHD 115','DNxHR SQ',
  'MP3 192k','AAC 256k','WAV 48kHz',
];

// ── Export Fichier ───────────────────────────────────────────────────────────
function _buildExportFilePanel(pfx, cfg) {
  const target = cfg.exportTarget || 'file';
  const targetOpts = Object.entries(EXPORT_FILE_TARGETS)
    .map(([k,v]) => `<option value="${k}" ${target===k?'selected':''}>${v}</option>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <div class="cfg-field">
    <label class="cfg-label">Destination</label>
    <select id="${pfx}-ef-target" class="cfg-select" onchange="_efTargetChange('${pfx}')">
      ${targetOpts}
    </select>
  </div>
  <div id="${pfx}-ef-fields">${_buildEfFields(pfx, cfg, target)}</div>
  <div class="cfg-field">
    <label class="cfg-label">Fichier source</label>
    <input id="${pfx}-ef-source" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.sourceFile||'')}" placeholder="{asset.id}  ou  {file.path}">
    <div class="wfd-hint-top3">Variable du contexte ou chemin fixe</div>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-ef-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Exporter le master vers S3 archive\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _buildEfFields(pfx, cfg, target) {
  const v = (k,ph) => `<input class="cfg-input" id="${pfx}-ef-${k}" value="${escHtml(cfg[k]||'')}" placeholder="${ph}">`;
  const pw = (k,ph) => `<input type="password" class="cfg-input" id="${pfx}-ef-${k}" value="${escHtml(cfg[k]||'')}" placeholder="${ph}">`;
  const f = (lbl,k,ph,type='text') => `<div class="cfg-field"><label class="cfg-label">${lbl}</label>${type==='pw'?pw(k,ph):v(k,ph)}</div>`;

  const maps = {
    file : () => f('Chemin de sortie','path','/exports/output.mxf'),
    s3   : () => `<div class="cfg-field"><label class="cfg-label">Account Type</label>
      <select class="cfg-select" id="${pfx}-ef-s3-account-type">
        ${S3_ACCOUNT_TYPES.map(t=>`<option value="${t}" ${cfg['s3-account-type']===t?'selected':''}>${t}</option>`).join('')}
      </select></div>`
      + f('Access Key ID','s3-access-key','AKIAIOSFODNN7EXAMPLE')
      + f('Secret Access Key','s3-secret-key','\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022','pw')
      + f('Bucket','s3-bucket','my-bucket-name')
      + f('Pr\u00e9fixe / Chemin','s3-prefix','exports/')
      + f('R\u00e9gion','s3-region','us-east-1'),
    ftp  : () => f('H\u00f4te','ftp-host','ftp.example.com') + f('Port','ftp-port','21')
      + f('Utilisateur','ftp-user','username') + f('Mot de passe','ftp-pass','\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022','pw')
      + f('Chemin distant','ftp-path','/exports/'),
    sftp : () => f('H\u00f4te','sftp-host','sftp.example.com') + f('Port','sftp-port','22')
      + f('Utilisateur','sftp-user','username') + f('Mot de passe / Cl\u00e9','sftp-pass','\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022','pw')
      + f('Chemin distant','sftp-path','/exports/'),
    gcs  : () => f('Bucket','gcs-bucket','nom-du-bucket') + f('Pr\u00e9fixe','gcs-prefix','exports/')
      + `<div class="cfg-field"><label class="cfg-label">JSON Key (chemin ou contenu)</label>
         <textarea class="cfg-textarea" id="${pfx}-ef-gcs-key" placeholder='{"type":"service_account",...}'>${escHtml(cfg['gcs-key']||'')}</textarea></div>`,
    azure: () => f('Nom du compte','az-account','my-storage-account')
      + f('Cl\u00e9 d\'acc\u00e8s','az-key','Cl\u00e9 Azure Storage','pw')
      + f('Conteneur','az-container','nom-du-conteneur') + f('Pr\u00e9fixe','az-prefix','exports/'),
  };
  return (maps[target]||maps.file)();
}

function _efTargetChange(pfx) {
  const target = document.getElementById(pfx+'-ef-target')?.value || 'file';
  const wrap   = document.getElementById(pfx+'-ef-fields');
  if (wrap) wrap.innerHTML = _buildEfFields(pfx, {}, target);
}

function _readExportFileConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-ef-target');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  let target = g('ef-target');
  if (panelMounted) target = target ?? 'file';

  const cfg = {};
  if (target !== undefined) cfg.exportTarget = target;

  const sourceFile  = g('ef-source');
  const description = g('ef-description');
  if (sourceFile  !== undefined) cfg.sourceFile = sourceFile;
  if (description !== undefined) cfg.description = description;

  const keys = {
    file: ['path'],
    s3:   ['s3-account-type','s3-access-key','s3-secret-key','s3-bucket','s3-prefix','s3-region'],
    ftp:  ['ftp-host','ftp-port','ftp-user','ftp-pass','ftp-path'],
    sftp: ['sftp-host','sftp-port','sftp-user','sftp-pass','sftp-path'],
    gcs:  ['gcs-bucket','gcs-prefix','gcs-key'],
    azure:['az-account','az-key','az-container','az-prefix']
  };

  if (target && keys[target]) {
    keys[target].forEach(k => {
      const v = g('ef-' + k);
      if (v !== undefined) cfg[k] = v;
    });
  }

  return cfg;
}

// ── Publier ──────────────────────────────────────────────────────────────────
function _buildPublishPanel(pfx, cfg) {
  const target = cfg.publishTarget || 'youtube';
  const targetOpts = Object.entries(PUBLISH_TARGETS)
    .map(([k,v]) => `<option value="${k}" ${target===k?'selected':''}>${v}</option>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <div class="cfg-field">
    <label class="cfg-label">Plateforme</label>
    <select id="${pfx}-pub-target" class="cfg-select" onchange="_pubTargetChange('${pfx}')">
      ${targetOpts}
    </select>
  </div>
  <div id="${pfx}-pub-fields">${_buildPubFields(pfx, cfg, target)}</div>
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-pub-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Publier le teaser sur YouTube\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _buildPubFields(pfx, cfg, target) {
  const v = (k,ph) => `<input class="cfg-input" id="${pfx}-pub-${k}" value="${escHtml(cfg[k]||'')}" placeholder="${ph}">`;
  const pw = (k,ph) => `<input type="password" class="cfg-input" id="${pfx}-pub-${k}" value="${escHtml(cfg[k]||'')}" placeholder="${ph}">`;
  const f = (lbl,k,ph,type='text') => `<div class="cfg-field"><label class="cfg-label">${lbl}</label>${type==='pw'?pw(k,ph):v(k,ph)}</div>`;
  const ta = (lbl,k,ph) => `<div class="cfg-field"><label class="cfg-label">${lbl}</label>
    <textarea class="cfg-textarea" id="${pfx}-pub-${k}" placeholder="${ph}">${escHtml(cfg[k]||'')}</textarea></div>`;

  const maps = {
    youtube : () => f('Client ID','yt-client-id','OAuth2 Client ID')
      + f('Client Secret','yt-client-secret','\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022','pw')
      + f('Refresh Token','yt-refresh-token','Token OAuth2 long-lived')
      + f('Titre','yt-title','Titre de la vid\u00e9o') + ta('Description','yt-desc','Description')
      + f('Playlist ID','yt-playlist','PLxxxxxxxxxxxxxxxx')
      + `<div class="cfg-field"><label class="cfg-label">Visibilit\u00e9</label>
        <select class="cfg-select" id="${pfx}-pub-yt-privacy">
          ${['public','unlisted','private'].map(p=>`<option value="${p}" ${cfg['yt-privacy']===p?'selected':''}>${p}</option>`).join('')}
        </select></div>`,
    vimeo   : () => f('Access Token','vi-token','Bearer token Vimeo','pw')
      + f('Titre','vi-title','Titre') + ta('Description','vi-desc','Description')
      + f('ID Dossier','vi-folder','ID dossier Vimeo (optionnel)'),
    facebook: () => f('Page ID','fb-page-id','ID de la page Facebook')
      + f('Access Token','fb-token','Bearer token Meta','pw')
      + f('Titre','fb-title','Titre') + ta('Description','fb-desc','Description'),
    twitter : () => f('API Key','tw-api-key','Consumer API Key')
      + f('API Secret','tw-api-secret','Consumer Secret')
      + f('Access Token','tw-access-token','Token d\'acc\u00e8s')
      + f('Access Token Secret','tw-access-secret','Secret du token d\'acc\u00e8s'),
  };
  return (maps[target]||maps.youtube)();
}

function _pubTargetChange(pfx) {
  const target = document.getElementById(pfx+'-pub-target')?.value || 'youtube';
  const wrap   = document.getElementById(pfx+'-pub-fields');
  if (wrap) wrap.innerHTML = _buildPubFields(pfx, {}, target);
}

function _readPublishConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-pub-target');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  let target = g('pub-target');
  if (panelMounted) target = target ?? 'youtube';

  const cfg = {};
  if (target !== undefined) cfg.publishTarget = target;

  const description = g('pub-description');
  if (description !== undefined) cfg.description = description;

  const allKeys = [
    'yt-client-id','yt-client-secret','yt-refresh-token','yt-title','yt-desc','yt-playlist','yt-privacy',
    'vi-token','vi-title','vi-desc','vi-folder',
    'fb-page-id','fb-token','fb-title','fb-desc',
    'tw-api-key','tw-api-secret','tw-access-token','tw-access-secret'
  ];

  allKeys.forEach(k => {
    const v = g('pub-' + k);
    if (v !== undefined) cfg[k] = v;
  });

  return cfg;
}

// ── Notifier POST ────────────────────────────────────────────────────────────
function _buildNotifyPostPanel(pfx, cfg) {
  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <div class="cfg-field">
    <label class="cfg-label">URL cible</label>
    <input id="${pfx}-np-url" class="cfg-input wfd-mono"
      value="${escHtml(cfg['api-url']||'')}" placeholder="https://api.example.com/ingest">
  </div>
  <div class="cfg-field">
    <label class="cfg-label">M\u00e9thode HTTP</label>
    <select id="${pfx}-np-method" class="cfg-select">
      ${['POST','PUT','PATCH'].map(m=>`<option value="${m}" ${(cfg['api-method']||'POST')===m?'selected':''}>${m}</option>`).join('')}
    </select>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Content-Type</label>
    <input id="${pfx}-np-content-type" class="cfg-input"
      value="${escHtml(cfg['api-content-type']||'application/json')}" placeholder="application/json">
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Headers (JSON)</label>
    <textarea id="${pfx}-np-headers" class="cfg-textarea wfd-mono-sm2"
      placeholder='{"Authorization":"Bearer ...","X-API-Key":"..."}'>${escHtml(cfg['api-headers']||'')}</textarea>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Body template (variables : {title}, {collection}…)</label>
    <textarea id="${pfx}-np-body" class="cfg-textarea wfd-mono-sm2" rows="5"
      placeholder='{"title":"{asset.metadata.titre}","id":"{asset.id}"}'>${escHtml(cfg['api-body']||'')}</textarea>
    <div class="wfd-hint-top3">Utilisez <code>{variable}</code> pour injecter des valeurs du contexte</div>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Stocker la r\u00e9ponse dans</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-555">{</span>
      <input id="${pfx}-np-var" class="cfg-input wfd-flex1-mono"
        value="${escHtml(cfg.resultVar||'response')}" placeholder="response">
      <span class="wfd-mono-555">}</span>
    </div>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-np-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Notifier le syst\u00e8me WON de la fin d'ing\u00e9stion\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}



function _readNotifyPostConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-np-url');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  let apiMethod = g('np-method');
  if (panelMounted) apiMethod = apiMethod ?? 'POST';

  const cfg = {};
  const apiUrl      = g('np-url');
  const contentType = g('np-content-type');
  const headers     = g('np-headers');
  const body        = g('np-body');
  let   resultVar   = g('np-var');
  const description = g('np-description');

  if (apiUrl      !== undefined) cfg['api-url'] = apiUrl;
  if (apiMethod   !== undefined) cfg['api-method'] = apiMethod;
  if (contentType !== undefined) cfg['api-content-type'] = contentType;
  if (headers     !== undefined) cfg['api-headers'] = headers;
  if (body        !== undefined) cfg['api-body'] = body;
  if (panelMounted) resultVar = resultVar ?? 'response';
  if (resultVar   !== undefined) cfg.resultVar = resultVar;
  if (description !== undefined) cfg.description = description;

  return cfg;
}

// ── Transcoder Iconik ────────────────────────────────────────────────────────
function _buildTranscodePanel(pfx, cfg) {
  const presetOpts = TRANSCODE_PRESETS
    .map(p => `<option value="${p}" ${cfg.preset===p?'selected':''}>${p}</option>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <div class="cfg-field">
    <label class="cfg-label">Asset source</label>
    <input id="${pfx}-tc-asset" class="cfg-input wfd-mono" list="${pfx}-wfd-var-list"
      value="${escHtml(cfg.assetId||'')}" placeholder="{asset.id}">
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Pr\u00e9set de transcodage</label>
    <div class="wfd-row-gap6b">
      <select id="${pfx}-tc-preset" class="cfg-select wfd-flex1" onchange="_tcPresetChange('${pfx}')">
        <option value="">— S\u00e9lectionner un pr\u00e9set —</option>
        ${presetOpts}
        <option value="custom" ${cfg.preset==='custom'?'selected':''}>Personnalis\u00e9…</option>
      </select>
    </div>
  </div>
  <div id="${pfx}-tc-custom-wrap" class="cfg-field${cfg.preset==='custom'?'':' wfd-hidden'}">
    <label class="cfg-label">Options FFmpeg personnalis\u00e9es</label>
    <textarea id="${pfx}-tc-custom" class="cfg-textarea wfd-mono-sm2"
      placeholder="-c:v prores_ks -profile:v 3 -c:a pcm_s24le">${escHtml(cfg.customOptions||'')}</textarea>
    <div class="wfd-tc-warning">
      \u26a0 Options avanc\u00e9es — la traduction Node-RED utilisera un noeud FFmpeg d\u00e9di\u00e9
    </div>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Destination</label>
    <select id="${pfx}-tc-dest" class="cfg-select">
      <option value="proxy"    ${(cfg.dest||'proxy')==='proxy'  ?'selected':''}>Proxy Iconik</option>
      <option value="format"   ${cfg.dest==='format'            ?'selected':''}>Format (original)</option>
      <option value="external" ${cfg.dest==='external'          ?'selected':''}>Chemin externe</option>
    </select>
  </div>
  <div class="cfg-field">
  <label class="cfg-label">Collection de destination (optionnel)</label>
  <input id="${pfx}-tc-collection" class="cfg-input wfd-mono"
         value="${escHtml(cfg.collection||'')}" placeholder="{collection.id}  ou  ID fixe">
  <div id="${pfx}-tc-col-wrap" class="wfd-tc-col-wrap">
    ${typeof wfdColTreeHtml==='function'
        ? wfdColTreeHtml(
            `${pfx}-tc`,
            JSON.stringify(
              Array.isArray(cfg.tcCollectionIds)
                ? cfg.tcCollectionIds
                : (cfg.collection ? [cfg.collection] : [])
            )
          )
        : ''
    }
  </div>
</div>
  <div class="cfg-field">
    <label class="cfg-label">Stocker l'ID du job dans</label>
    <div class="wfd-row-gap6c">
      <span class="wfd-mono-555">{</span>
      <input id="${pfx}-tc-var" class="cfg-input wfd-flex1-mono"
        value="${escHtml(cfg.resultVar||'transcode_job')}" placeholder="transcode_job">
      <span class="wfd-mono-555">.id}</span>
    </div>
  </div>
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-tc-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Transcoder en H264 1080p pour diffusion web\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _tcPresetChange(pfx) {
  const val  = document.getElementById(pfx+'-tc-preset')?.value;
  const wrap = document.getElementById(pfx+'-tc-custom-wrap');
  if (wrap) wrap.classList.toggle('wfd-hidden', val !== 'custom');
}

function _readTranscodeConfig(pfx) {
  // Préfixe effectif : 'cfg' si monté, sinon bascule sur 'mn' si présent
  const alt  = (pfx === 'mn' ? 'cfg' : 'mn');
  const base = 'tc-preset';
  const eff  = document.getElementById(pfx+'-'+base)
             ? pfx
             : (document.getElementById(alt+'-'+base) ? alt : pfx);

  const g = id => {
    const el = document.getElementById(eff + '-' + id);
    return el ? el.value : undefined; // undefined si le champ n'existe pas
  };

  const cfg = {
    assetId       : g('tc-asset'),
    preset        : g('tc-preset'),
    customOptions : g('tc-custom'),
    dest          : g('tc-dest'),
    // on lit l'input texte si présent (peut être '')
    collection    : g('tc-collection'),
    resultVar     : g('tc-var'),
    description   : g('tc-description'),
  };

  // Defaults seulement si le panneau est réellement monté
  if (document.getElementById(eff+'-'+base)) {
    if (!cfg.dest)      cfg.dest      = 'proxy';
    if (!cfg.resultVar) cfg.resultVar = 'transcode_job';
  }

  // Lecture éventuelle du hidden du tree: "<eff>-tc-col-selected"
  try {
    const raw = document.getElementById(eff + '-tc-col-selected')?.value;
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        // n'écrase PAS l'input par '' : ne remplace que si non renseigné
        if (!cfg.collection || !cfg.collection.trim()) cfg.collection = ids[0] || '';
        cfg.tcCollectionIds = ids;
      }
    }
  } catch (_) {}

  return cfg;
}

// ══ NŒUD APPELER WORKFLOW (SUBFLOW) ══════════════════════════════════════════

function _buildSubflowPanel(pfx, cfg) {
  // Liste des workflows disponibles (tous sauf le courant)
  const currentFluxId = getFluxCourant()?.id;
  const availableFlows = wfdFlows.filter(f => f.id !== currentFluxId);
  const flowOpts = availableFlows.map(f =>
    `<option value="${f.id}" ${cfg.targetFlowId===f.id?'selected':''}>${escHtml(f.name||f.id)}</option>`
  ).join('');

  const execMode    = cfg.execMode    || 'sync';
  const ctxMode     = cfg.ctxMode     || 'all';
  const returnVars  = cfg.returnVars  || [];

  // Variables à transmettre explicitement
  const varRows = (cfg.inputVars||[]).map((v,i) => `
    <div class="wfd-grid-3-24">
      <input class="cfg-input sf-ivar-src wfd-mono-sm" data-idx="${i}"
        value="${escHtml(v.src||'')}" placeholder="Variable source {asset.id}">
      <input class="cfg-input sf-ivar-dst wfd-mono-sm" data-idx="${i}"
        value="${escHtml(v.dst||'')}" placeholder="Nom dans l'enfant">
      <button class="cfg-btn danger wfd-pad-3-5"
        onclick="${pfx}RemoveSfVar(${i})">×</button>
    </div>`).join('');

  // Variables retournées
  const retRows = returnVars.map((v,i) => `
    <div class="wfd-grid-3-24">
      <input class="cfg-input sf-rvar-src wfd-mono-sm" data-idx="${i}"
        value="${escHtml(v.src||'')}" placeholder="Variable dans l'enfant">
      <input class="cfg-input sf-rvar-dst wfd-mono-sm" data-idx="${i}"
        value="${escHtml(v.dst||'')}" placeholder="Nom dans le parent">
      <button class="cfg-btn danger wfd-pad-3-5"
        onclick="${pfx}RemoveSfRetVar(${i})">×</button>
    </div>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <!-- Workflow cible -->
  <div class="cfg-field">
    <label class="cfg-label">Workflow à appeler</label>
    <div class="wfd-row-gap6b">
      <select id="${pfx}-sf-flow" class="cfg-select wfd-flex1">
        <option value="">— Sélectionner un workflow —</option>
        ${flowOpts || '<option disabled>Aucun autre workflow disponible</option>'}
      </select>
      <button class="cfg-btn wfd-pad-6-8" title="Rafraîchir"
        onclick="_sfRefreshFlows('${pfx}')">↺</button>
    </div>
    ${!availableFlows.length ? `<div class="wfd-sf-noflow-msg">
      Créez d'abord d'autres workflows dans l'espace de travail.</div>` : ''}
  </div>

  <!-- Mode d'exécution -->
  <div class="cfg-field">
    <label class="cfg-label">Mode d'exécution</label>
    <div class="wfd-row-gap6b">
      ${[
        ['sync',  '⏱ Synchrone',  'Le workflow parent attend la fin de l\'enfant avant de continuer', '#8e44ad'],
        ['async', '⚡ Asynchrone', 'L\'enfant est déclenché, le parent continue immédiatement',       '#3498db'],
      ].map(([k,lbl,desc,color]) => `
        <label class="wfd-sf-mode-label${execMode===k?' checked-dynamic':' unchecked'}"
          style="--chk-color:${execMode===k?color:'#2a2a2a'};">
          <div class="wfd-sf-mode-row">
            <input type="radio" name="${pfx}-sf-mode" value="${k}" ${execMode===k?'checked':''}
              style="accent-color:${color};" onchange="_sfModeChange('${pfx}')">
            <span class="wfd-sf-mode-text" style="--mode-color:${color};">${lbl}</span>
          </div>
          <div class="wfd-hint-left">${desc}</div>
        </label>`).join('')}
    </div>
  </div>

  <!-- Transmission du contexte -->
  <div class="cfg-field">
    <label class="cfg-label">Contexte transmis à l'enfant</label>
    <select id="${pfx}-sf-ctx" class="cfg-select" onchange="_sfCtxChange('${pfx}')">
      <option value="all"      ${ctxMode==='all'     ?'selected':''}>Tout le contexte (par défaut)</option>
      <option value="explicit" ${ctxMode==='explicit'?'selected':''}>Variables explicites uniquement</option>
      <option value="none"     ${ctxMode==='none'    ?'selected':''}>Aucun — contexte vide</option>
    </select>
  </div>

  <!-- Variables explicites à transmettre -->
  <div id="${pfx}-sf-ivars-wrap"${ctxMode!=='explicit'?' class="wfd-hidden"':''}>
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">Variables à transmettre</label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddSfVar()">+ Variable</button>
    </div>
    <div class="wfd-um-fields-hdr">
      <span>Source (parent)</span><span>Nom dans l'enfant</span><span></span>
    </div>
    <div id="${pfx}-sf-ivars" class="wfd-col-gap5">
      ${varRows || '<div class="wfd-text-444-11b">Aucune variable — ajoutez-en une.</div>'}
    </div>
  </div>

  <!-- Retour de données (sync seulement) -->
  <div id="${pfx}-sf-return-wrap"${execMode==='async'?' class="wfd-hidden"':''}>
    <div class="wfd-row-sb-mb6">
      <label class="cfg-label wfd-m0">Variables retournées vers le parent</label>
      <button class="cfg-btn wfd-pad-3-10b" onclick="${pfx}AddSfRetVar()">+ Variable</button>
    </div>
    <div class="wfd-hint-mb6">
      Laisser vide pour ne rien récupérer. Disponibles uniquement en mode synchrone.
    </div>
    <div class="wfd-um-fields-hdr">
      <span>Variable dans l'enfant</span><span>Nom dans le parent</span><span></span>
    </div>
    <div id="${pfx}-sf-rvars" class="wfd-col-gap5">
      ${retRows || '<div class="wfd-text-444-11b">Aucun retour — flux unidirectionnel.</div>'}
    </div>
  </div>

  <!-- Résumé visuel -->
  <div class="wfd-card-sm2">
    <div class="cfg-label wfd-mb6b">Comportement</div>
    <div id="${pfx}-sf-summary" class="wfd-sf-summary">
      ${_sfSummaryText(execMode, ctxMode)}
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-sf-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Déléguer le traitement PAD au workflow spécialisé\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _sfSummaryText(execMode, ctxMode) {
  const exec = execMode === 'sync'
    ? '\u23f1 Le parent <strong style="color:#8e44ad;">attend</strong> la fin du workflow enfant'
    : '\u26a1 Le workflow enfant est <strong class="wfd-c-blue2">d\u00e9clench\u00e9 en arri\u00e8re-plan</strong>';
  const ctx = ctxMode === 'all'
    ? '\uD83D\uDCE6 Tout le contexte est transmis \u00e0 l\'enfant'
    : ctxMode === 'explicit'
    ? '\uD83C\uDFF7 Seules les variables s\u00e9lectionn\u00e9es sont transmises'
    : '\u2205 L\'enfant d\u00e9marre avec un contexte vide';
  return exec + '<br>' + ctx;
}

// ── Fonctions dynamiques subflow ─────────────────────────────────────────────

function _sfModeChange(pfx) {
  const mode    = document.querySelector(`input[name="${pfx}-sf-mode"]:checked`)?.value || 'sync';
  const retWrap = document.getElementById(pfx+'-sf-return-wrap');
  const sumEl   = document.getElementById(pfx+'-sf-summary');
  const ctxMode = document.getElementById(pfx+'-sf-ctx')?.value || 'all';
  if (retWrap) retWrap.classList.toggle('wfd-hidden', mode === 'async');
  if (sumEl)   sumEl.innerHTML = _sfSummaryText(mode, ctxMode);
  // Styles radio
  const colors = { sync:'#8e44ad', async:'#3498db' };
  document.querySelectorAll(`input[name="${pfx}-sf-mode"]`).forEach(el => {
    const lbl = el.closest('label');
    if (lbl) {
      lbl.style.setProperty('--chk-color', el.checked ? (colors[el.value]||'#555') : '#2a2a2a');
      lbl.classList.toggle('checked-dynamic', el.checked);
      lbl.classList.toggle('unchecked', !el.checked);
    }
  });
}

function _sfCtxChange(pfx) {
  const ctx     = document.getElementById(pfx+'-sf-ctx')?.value || 'all';
  const iWrap   = document.getElementById(pfx+'-sf-ivars-wrap');
  const sumEl   = document.getElementById(pfx+'-sf-summary');
  const execMode= document.querySelector(`input[name="${pfx}-sf-mode"]:checked`)?.value || 'sync';
  if (iWrap) iWrap.classList.toggle('wfd-hidden', ctx !== 'explicit');
  if (sumEl) sumEl.innerHTML = _sfSummaryText(execMode, ctx);
}

function _sfRefreshFlows(pfx) {
  const sel    = document.getElementById(pfx+'-sf-flow');
  if (!sel) return;
  const current = getFluxCourant()?.id;
  const opts   = wfdFlows.filter(f => f.id !== current)
    .map(f => `<option value="${f.id}">${escHtml(f.name||f.id)}</option>`).join('');
  sel.innerHTML = '<option value="">— S\u00e9lectionner un workflow —</option>' + opts;
  toast('Workflows mis \u00e0 jour \u2713');
}

function mnAddSfVar()      { _sfAddVar('mn',  'ivars', 'sf-ivar-src', 'sf-ivar-dst', 'mnRemoveSfVar'); }
function cfgAddSfVar()     { _sfAddVar('cfg', 'ivars', 'sf-ivar-src', 'sf-ivar-dst', 'cfgRemoveSfVar'); }
function mnAddSfRetVar()   { _sfAddVar('mn',  'rvars', 'sf-rvar-src', 'sf-rvar-dst', 'mnRemoveSfRetVar'); }
function cfgAddSfRetVar()  { _sfAddVar('cfg', 'rvars', 'sf-rvar-src', 'sf-rvar-dst', 'cfgRemoveSfRetVar'); }

function _sfAddVar(pfx, wrId, srcCls, dstCls, removeFn) {
  const wrap  = document.getElementById(pfx+'-sf-'+wrId);
  if (!wrap) return;
  const empty = wrap.querySelector('.wfd-text-444-11b');
  if (empty) empty.remove();
  const i = wrap.querySelectorAll('.'+srcCls).length;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 24px;gap:5px;align-items:center;';
  div.innerHTML = `
    <input class="cfg-input ${srcCls} wfd-mono-sm" data-idx="${i}" value="" placeholder="Source">
    <input class="cfg-input ${dstCls} wfd-mono-sm" data-idx="${i}" value="" placeholder="Destination">
    <button class="cfg-btn danger wfd-pad-3-5" onclick="${removeFn}(${i})">×</button>`;
  wrap.appendChild(div);
  
  try {
    const srcInput = div.querySelector('.' + srcCls);
    if (srcInput) srcInput.setAttribute('list', pfx + '-wfd-var-list');
  } catch(_) { /* no-op */ }
}

function _sfEnhanceVarInputs(pfx) {
  try {
    const iv = document.getElementById(pfx + '-sf-ivars');
    const rv = document.getElementById(pfx + '-sf-rvars');
    [iv, rv].forEach(cont => {
      if (!cont) return;
      cont.querySelectorAll('.sf-ivar-src, .sf-rvar-src').forEach(inp => {
        if (inp.tagName === 'INPUT') {
          const hasList = (inp.getAttribute('list') || '').endsWith('-wfd-var-list');
          if (!hasList) inp.setAttribute('list', pfx + '-wfd-var-list');
        }
      });
    });
  } catch (_) { /* no-op */ }
}

function _hydratePublish(pfx, cfg) {
  try {
    const sel = document.getElementById(pfx + '-pub-target');
    if (!sel) return;

    const target = (cfg && cfg.publishTarget) ? cfg.publishTarget : (sel.value || 'facebook');
    if (cfg && cfg.publishTarget) sel.value = cfg.publishTarget;

    // Déclencher l’affichage de la sous‑section (si un handler existe)
    let didChange = false;
    const maybe = [
      window[pfx + 'PubTargetChange'],   // ex. mnPubTargetChange / cfgPubTargetChange
      window._pubTargetChange            // ou _pubTargetChange(pfx)
    ];
    for (const fn of maybe) {
      if (typeof fn === 'function') { try { fn.length >= 1 ? fn(pfx) : fn(); didChange = true; break; } catch(_){} }
    }
    if (!didChange) sel.dispatchEvent(new Event('change', { bubbles: true }));

    const set = (id, val) => { if (val == null) return; const el = document.getElementById(pfx + '-' + id); if (el) el.value = val; };

    // Commun
    set('pub-description', cfg?.description);

    if (target === 'facebook') {
      set('pub-fb-page-id', cfg?.['fb-page-id']);
      set('pub-fb-token',   cfg?.['fb-token']);   // commentez cette ligne si vous ne voulez pas pré‑remplir le token
      set('pub-fb-title',   cfg?.['fb-title']);
      set('pub-fb-desc',    cfg?.['fb-desc']);
      return;
    }
    if (target === 'youtube') {
      set('pub-yt-client-id',     cfg?.['yt-client-id']);
      set('pub-yt-client-secret', cfg?.['yt-client-secret']);
      set('pub-yt-refresh-token', cfg?.['yt-refresh-token']);
      set('pub-yt-title',         cfg?.['yt-title']);
      set('pub-yt-desc',          cfg?.['yt-desc']);
      set('pub-yt-playlist',      cfg?.['yt-playlist']);
      set('pub-yt-privacy',       cfg?.['yt-privacy']);
      return;
    }
    if (target === 'vimeo') {
      set('pub-vi-token',  cfg?.['vi-token']);
      set('pub-vi-title',  cfg?.['vi-title']);
      set('pub-vi-desc',   cfg?.['vi-desc']);
      set('pub-vi-folder', cfg?.['vi-folder']);
      return;
    }
    if (target === 'twitter') {
      set('pub-tw-api-key',       cfg?.['tw-api-key']);
      set('pub-tw-api-secret',    cfg?.['tw-api-secret']);
      set('pub-tw-access-token',  cfg?.['tw-access-token']);
      set('pub-tw-access-secret', cfg?.['tw-access-secret']);
      return;
    }
  } catch(e) { console.debug('[publish hydrate] warn:', e); }
}
function _hydrateExportFile(pfx, cfg) {
  try {
    const sel = document.getElementById(pfx + '-ef-target');
    if (!sel) return;

    // 1) Cible (file, s3, ftp, sftp, gcs, azure)
    const target = (cfg && cfg.exportTarget) ? cfg.exportTarget : (sel.value || 'file');
    if (cfg && cfg.exportTarget) sel.value = cfg.exportTarget;

    // Déclencher l’affichage de la sous‑section (si un handler existe)
    let didChange = false;
    const maybe = [ window[pfx + 'EfTargetChange'], window._efTargetChange ];
    for (const fn of maybe) {
      if (typeof fn === 'function') { try { fn.length >= 1 ? fn(pfx) : fn(); didChange = true; break; } catch(_){} }
    }
    if (!didChange) sel.dispatchEvent(new Event('change', { bubbles:true }));

    // Utilitaires
    const set = (id, val) => { if (val == null) return; const el = document.getElementById(pfx + '-' + id); if (el) el.value = val; };
    const fill = keys => keys.forEach(k => set('ef-' + k, cfg?.[k]));

    // 2) Champs communs
    set('ef-source',       cfg?.sourceFile);
    set('ef-description',  cfg?.description);

    // 3) Par cible
    if (target === 'file') {
      // Chemin de sortie : on teste plusieurs ids possibles et on remplit le 1er trouvé
      const ids = ['ef-path','ef-file-path','ef-output','ef-dest','ef-destination'];
      for (const id of ids) {
        const el = document.getElementById(pfx + '-' + id);
        if (el) { if (cfg?.path) el.value = cfg.path; break; }
      }
      return;
    }
    if (target === 's3')   return fill(['s3-account-type','s3-access-key','s3-secret-key','s3-bucket','s3-prefix','s3-region']);
    if (target === 'ftp')  return fill(['ftp-host','ftp-port','ftp-user','ftp-pass','ftp-path']);
    if (target === 'sftp') return fill(['sftp-host','sftp-port','sftp-user','sftp-pass','sftp-path']);
    if (target === 'gcs')  return fill(['gcs-bucket','gcs-prefix','gcs-key']);
    if (target === 'azure')return fill(['az-account','az-key','az-container','az-prefix']);
  } catch (e) {
    console.debug('[export_file hydrate] warn:', e);
  }
}
function _hydrateNotification(pfx, cfg) {
  try {
    const wrap = document.getElementById(pfx + '-recipients');
    if (!wrap) return;
    const recips = Array.isArray(cfg?.recipients) ? cfg.recipients : [];

    // Cas 1 : <select multiple id="...-recipients">
    if (wrap.tagName === 'SELECT' && wrap.multiple) {
      const values = new Set(recips.map(r => r?.id || r?.value || r));
      Array.from(wrap.options).forEach(opt => { opt.selected = values.has(opt.value); });
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Cas 2 : liste de cases à cocher à l’intérieur du conteneur
    const checkboxes = wrap.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length) {
      const ids = new Set(recips.map(r => r?.id || r?.value || r));
      checkboxes.forEach(cb => {
        const key = cb.dataset.id || cb.value || '';
        if (key) cb.checked = ids.has(key);
      });
      return;
    }

    // Cas 3 : si l’UI est “rows” et expose un bouton d’ajout, on tente un remplissage minimal
    // (optionnel, seulement si tu as un bouton avec cet id)
    const addBtn = document.getElementById(pfx + '-rec-add');
    if (addBtn && typeof window[pfx + 'AddRecipient'] === 'function') {
      // Exemple si tu as une API d’ajout : recips.forEach(r => window[pfx+'AddRecipient'](r))
      // Laisse vide si pas d’API d’ajout déclarée.
    }
  } catch (e) {
    console.debug('[notification hydrate] warn:', e);
  }
}

function mnRemoveSfVar(i)     { _sfRemoveVar('mn',  'ivars', 'sf-ivar-src', i); }
function cfgRemoveSfVar(i)    { _sfRemoveVar('cfg', 'ivars', 'sf-ivar-src', i); }
function mnRemoveSfRetVar(i)  { _sfRemoveVar('mn',  'rvars', 'sf-rvar-src', i); }
function cfgRemoveSfRetVar(i) { _sfRemoveVar('cfg', 'rvars', 'sf-rvar-src', i); }

function _sfRemoveVar(pfx, wrId, srcCls, i) {
  const wrap = document.getElementById(pfx+'-sf-'+wrId);
  if (!wrap) return;
  wrap.querySelectorAll('.'+srcCls).forEach(el => {
    if (parseInt(el.dataset.idx) === i) el.closest('div').remove();
  });
  if (!wrap.querySelectorAll('.'+srcCls).length)
    wrap.innerHTML = '<div class="wfd-text-444-11b">Aucune variable.</div>';
}

function _readSubflowConfig(pfx) {
  // Est-ce que le panneau cfg- est monté ?
  const panelMounted = !!document.getElementById(pfx + '-sf-flow');

  // Helpers DOM (ne forcent PAS de valeur par défaut)
  const getVal = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;  // <-- pas de '' si absent
  };
  const getExecMode = () => {
    const checked = document.querySelector(`input[name="${pfx}-sf-mode"]:checked`);
    return checked ? checked.value : undefined; // <-- pas de 'sync' si absent
  };

  // Lecture brute depuis le DOM (ou undefined si panneau absent)
  const targetFlowId = getVal('sf-flow');
  let   execMode    = getExecMode();            // 'sync' | 'async' | undefined
  let   ctxMode     = getVal('sf-ctx');         // 'all' | 'explicit' | 'empty' | undefined
  const description = getVal('sf-description');

  // Listes variables (présentes uniquement si panneau monté)
  const inputVars = [];
  const inRows = document.querySelectorAll('#' + pfx + '-sf-ivars > div');
  inRows.forEach(row => {
    const src = row.querySelector('.sf-ivar-src')?.value || '';
    const dst = row.querySelector('.sf-ivar-dst')?.value || '';
    if (src) inputVars.push({ src, dst });
  });

  const returnVars = [];
  const outRows = document.querySelectorAll('#' + pfx + '-sf-rvars > div');
  outRows.forEach(row => {
    const src = row.querySelector('.sf-rvar-src')?.value || '';
    const dst = row.querySelector('.sf-rvar-dst')?.value || '';
    if (src) returnVars.push({ src, dst });
  });

  // IMPORTANT :
  // - Si le panneau est monté (lecture "utilisateur"), on applique bien les défauts.
  // - Si le panneau n'est PAS monté (lecture "rendu"), on ne met PAS les défauts
  //   pour ne pas écraser la config existante.
  if (panelMounted) {
    execMode = execMode ?? 'sync';
    ctxMode  = ctxMode  ?? 'all';
  }

  // Construire l'objet en n'incluant que les clés réellement définies
  const cfg = {};
  if (targetFlowId !== undefined && targetFlowId.trim() !== '') cfg.targetFlowId = targetFlowId;
  if (execMode    !== undefined) cfg.execMode = execMode;
  if (ctxMode     !== undefined) cfg.ctxMode  = ctxMode;
  if (description !== undefined) cfg.description = description;

  // Les listes ne sont présentes que si le panneau l'était (sinon vides => on n’ajoute pas)
  if (inputVars.length)  cfg.inputVars  = inputVars;
  if (returnVars.length) cfg.returnVars = returnVars;

  return cfg;
}

// ══ NŒUD CRÉER RELATION ═══════════════════════════════════════════════════════

const RELATE_TYPES = [
  { value: 'related',       label: 'Li\u00e9 \u00e0',              desc: 'Relation g\u00e9n\u00e9rique — les deux assets sont associ\u00e9s' },
  { value: 'version_of',    label: 'Version de',          desc: 'L\u2019asset B est une version de l\u2019asset A' },
  { value: 'variant_of',    label: 'Variante de',         desc: 'M\u00eame contenu, d\u00e9clinaison diff\u00e9rente (langue, format\u2026)' },
  { value: 'derivative_of', label: 'D\u00e9riv\u00e9 de',          desc: 'Asset B cr\u00e9\u00e9 \u00e0 partir de A (Mise en Partage, sous-clip\u2026)' },
  { value: 'part_of',       label: 'Partie de',           desc: 'L\u2019asset B est un composant de A' },
  { value: 'duplicate_of',  label: 'Doublon de',          desc: 'Les deux assets repr\u00e9sentent le m\u00eame contenu' },
];

function _buildRelatePanel(pfx, cfg) {
  const relType = cfg.relationType || 'derivative_of';

  const typeRows = RELATE_TYPES.map(t => `
    <label class="wfd-rel-type-label${relType===t.value?' checked-blue':' unchecked-dark'}">
      <input type="radio" name="${pfx}-rel-type" value="${t.value}" ${relType===t.value?'checked':''}
        class="wfd-rel-type-radio" onchange="_relTypeChange('${pfx}')">
      <div>
        <div class="wfd-rel-type-title${relType===t.value?' checked-blue-text':''}">${t.label}</div>
        <div class="wfd-rel-type-desc">${t.desc}</div>
      </div>
    </label>`).join('');

  return `
  ${buildWfdVarDatalist(`${pfx}-wfd-var-list`)}
  <!-- Asset source (A) -->
  <div class="cfg-field">
    <label class="cfg-label">Asset source (A)</label>
    <input id="${pfx}-rel-asset-a" class="cfg-input wfd-mono"
      value="${escHtml(cfg.assetA||'')}" placeholder="{asset.id}  \u2014  asset d\u00e9clencheur">
    <div class="wfd-hint-top3">
      G\u00e9n\u00e9ralement l\u2019asset original issu du trigger
    </div>
  </div>

  <!-- Asset cible (B) -->
  <div class="cfg-field">
    <label class="cfg-label">Asset cible (B)</label>
    <input id="${pfx}-rel-asset-b" class="cfg-input wfd-mono"
      value="${escHtml(cfg.assetB||'')}" placeholder="{new_asset.id}  \u2014  asset cr\u00e9\u00e9 en amont">
    <div class="wfd-hint-top3">
      G\u00e9n\u00e9ralement l\u2019asset cr\u00e9\u00e9 par un n\u0153ud Cr\u00e9er Asset pr\u00e9c\u00e9dent
    </div>
  </div>

  <!-- Type de relation -->
  <div class="cfg-field">
    <label class="cfg-label">Type de relation</label>
    <div class="wfd-col-gap5">
      ${typeRows}
    </div>
  </div>

  <!-- Direction -->
  <div class="cfg-field">
    <label class="cfg-label">Direction</label>
    <div class="wfd-row-gap6b">
      ${[
        ['a_to_b', 'A \u2192 B', 'A est la source, B est le d\u00e9riv\u00e9'],
        ['b_to_a', 'B \u2192 A', 'B est la source, A est le d\u00e9riv\u00e9'],
        ['both',   'Bidirectionnel', 'Relation sym\u00e9trique'],
      ].map(([k,lbl,desc]) => `
        <label class="wfd-rel-dir-label${(cfg.direction||'a_to_b')===k?' checked-blue':' unchecked-dark'}">
          <div class="wfd-rel-dir-row">
            <input type="radio" name="${pfx}-rel-dir" value="${k}"
              ${(cfg.direction||'a_to_b')===k?'checked':''}
              style="accent-color:#2980b9;" onchange="_relDirChange('${pfx}')">
            <span class="wfd-rel-dir-text">${lbl}</span>
          </div>
          <div class="wfd-hint-left">${desc}</div>
        </label>`).join('')}
    </div>
  </div>

  <!-- Résumé visuel -->
  <div class="wfd-card-sm2">
    <div id="${pfx}-rel-summary" class="wfd-rel-summary">
      ${_relSummaryText(cfg.assetA||'A', cfg.assetB||'B', relType, cfg.direction||'a_to_b')}
    </div>
  </div>

  <!-- Description -->
  <div class="cfg-field">
    <label class="cfg-label">Description</label>
    <textarea id="${pfx}-rel-description" class="cfg-textarea" rows="2"
      placeholder="Ex : Lier l\u2019asset Mise en PAD \u00e0 son d\u00e9riv\u00e9 Mise en Partage\u2026">${escHtml(cfg.description||'')}</textarea>
  </div>`;
}

function _relSummaryText(a, b, type, dir) {
  const t = RELATE_TYPES.find(r => r.value === type);
  const lbl = t ? t.label.toLowerCase() : type;
  if (dir === 'both')   return `<span class="wfd-c-blue2">${escHtml(a)}</span> \u2194 <span class="wfd-c-blue3">${lbl}</span> \u2194 <span class="wfd-c-blue2">${escHtml(b)}</span>`;
  if (dir === 'b_to_a') return `<span class="wfd-c-blue2">${escHtml(b)}</span> \u2014<span class="wfd-c-blue3"> ${lbl} </span>\u2192 <span class="wfd-c-blue2">${escHtml(a)}</span>`;
  return `<span class="wfd-c-blue2">${escHtml(a)}</span> \u2014<span class="wfd-c-blue3"> ${lbl} </span>\u2192 <span class="wfd-c-blue2">${escHtml(b)}</span>`;
}

function _relTypeChange(pfx) {
  const type = document.querySelector(`input[name="${pfx}-rel-type"]:checked`)?.value || 'derivative_of';
  const dir  = document.querySelector(`input[name="${pfx}-rel-dir"]:checked`)?.value  || 'a_to_b';
  const a    = document.getElementById(pfx+'-rel-asset-a')?.value || 'A';
  const b    = document.getElementById(pfx+'-rel-asset-b')?.value || 'B';
  const sum  = document.getElementById(pfx+'-rel-summary');
  if (sum) sum.innerHTML = _relSummaryText(a, b, type, dir);
  // Styles radio
  document.querySelectorAll(`input[name="${pfx}-rel-type"]`).forEach(el => {
    const lbl = el.closest('label');
    if (!lbl) return;
    lbl.classList.toggle('checked-blue', el.checked);
    lbl.classList.toggle('unchecked-dark', !el.checked);
    const child = lbl.querySelector('div > div:first-child');
    if (child) child.classList.toggle('checked-blue-text', el.checked);
  });
}

function _relDirChange(pfx) {
  const type = document.querySelector(`input[name="${pfx}-rel-type"]:checked`)?.value || 'derivative_of';
  const dir  = document.querySelector(`input[name="${pfx}-rel-dir"]:checked`)?.value  || 'a_to_b';
  const a    = document.getElementById(pfx+'-rel-asset-a')?.value || 'A';
  const b    = document.getElementById(pfx+'-rel-asset-b')?.value || 'B';
  const sum  = document.getElementById(pfx+'-rel-summary');
  if (sum) sum.innerHTML = _relSummaryText(a, b, type, dir);
  document.querySelectorAll(`input[name="${pfx}-rel-dir"]`).forEach(el => {
    const lbl = el.closest('label');
    if (!lbl) return;
    lbl.classList.toggle('checked-blue', el.checked);
    lbl.classList.toggle('unchecked-dark', !el.checked);
  });
}

function _readRelateConfig(pfx) {
  const panelMounted = !!document.getElementById(pfx + '-rel-asset-a');

  const g = id => {
    const el = document.getElementById(pfx + '-' + id);
    return el ? el.value : undefined;
  };

  let relationType = document.querySelector(`input[name="${pfx}-rel-type"]:checked`)?.value;
  let direction    = document.querySelector(`input[name="${pfx}-rel-dir"]:checked`)?.value;

  if (panelMounted) {
    relationType = relationType ?? 'derivative_of';
    direction    = direction    ?? 'a_to_b';
  }

  const assetA      = g('rel-asset-a');
  const assetB      = g('rel-asset-b');
  const description = g('rel-description');

  const cfg = {};
  if (assetA       !== undefined) cfg.assetA = assetA;
  if (assetB       !== undefined) cfg.assetB = assetB;
  if (relationType !== undefined) cfg.relationType = relationType;
  if (direction    !== undefined) cfg.direction = direction;
  if (description  !== undefined) cfg.description = description;

  return cfg;
}




// ── Notification — couleur dynamique ─────────────────────────────────────────
function toggleNotifColorVar(i) {
  const mode    = document.getElementById('notif-color-mode-' + i)?.value;
  const fixedEl = document.getElementById('notif-color-fixed-' + i);
  const varEl   = document.getElementById('notif-color-var-' + i);
  if (fixedEl) fixedEl.classList.toggle('wfd-hidden', mode !== 'fixed');
  if (varEl)   varEl.classList.toggle('wfd-hidden', mode !== 'var');
}

function setNotifColor(i, color) {
  const fixedEl = document.getElementById('notif-color-fixed-' + i);
  if (!fixedEl) return;
  fixedEl.querySelectorAll('[data-color]').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === color);
  });
}

function lireDestinatairesEnriched(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return lireDestinataires(containerId);
  return [...container.querySelectorAll('[id^="recip-row-"]')].map((row, i) => {
    const ch  = row.querySelector('.notif-channel-sel')?.value || 'email';
    const cfg = {};
    // Chercher webhook_url par data-key (robuste) ou par id
    const wh = row.querySelector('input[data-key="webhook_url"]')
             || row.querySelector('input[id$="-webhook_url"]');
    if (wh) cfg.webhook_url = wh.value;

    // Lire tous les champs notif-field par data-key
    row.querySelectorAll('.notif-field[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (key && key !== 'message' && el.value) cfg[key] = el.value;
    });
    const modeEl = document.getElementById('notif-color-mode-' + i);
    if (modeEl) {
      cfg.color_mode = modeEl.value;
      if (modeEl.value === 'var') {
        cfg.color_var = document.getElementById('notif-color-var-input-' + i)?.value || '{wf_status}';
      } else {
        const active = [...(document.getElementById('notif-color-fixed-' + i)
          ?.querySelectorAll('[data-color]') || [])]
          .find(el => el.classList.contains('selected'));
        cfg.color = active?.dataset.color || '#27ae60';
      }
    }
    const msgTeams = document.getElementById('notif-teams-message-' + i);
    const msgSlack = document.getElementById('notif-slack-message-' + i);
    // Fallback : lire via data-key="message" si ID non trouvé
    const msgFallback = row.querySelector('.notif-field[data-key="message"]');
    if (msgTeams) cfg.message = msgTeams.value;
    else if (msgSlack) cfg.message = msgSlack.value;
    else if (msgFallback) cfg.message = msgFallback.value;
    // teams_title, channel, username etc. déjà lus via data-key ci-dessus
    return { channel: ch, config: cfg };
  });
}



// ── Gate panel helper ─────────────────────────────────────────────────────────
function _wfdGateSummary(mode,max,del,msg,auto,autoS){if(mode==='throttle')return 'Limiter à <strong>'+max+'</strong> job(s) simultané(s)';if(mode==='delay')return 'Attendre <strong>'+del+'s</strong> avant de continuer';if(mode==='pause')return auto?'Suspendre — reprend après <strong>'+autoS+'s</strong>':'Suspendre jusqu\'à validation manuelle';return '';}

// ── Set Var ───────────────────────────────────────────────────────────────────
function svAddRow(pfx) {
  const container = document.getElementById((pfx||'cfg') + '-sv-rows');
  if (!container) return;
  const varList = document.getElementById((pfx||'cfg') + '-wfd-var-list')?.id || '';
  const i = container.children.length;
  const row = document.createElement('div');
  row.className = 'sv-row';
  row.dataset.i = i;
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 110px 28px;gap:4px;margin-bottom:4px;align-items:center;';
  row.innerHTML =
    '<input class="cfg-input sv-key wfd-mono" placeholder="nomVar" title="Nom de la variable">' +
    '<input class="cfg-input sv-value wfd-mono" placeholder="{asset.title}" list="' + varList + '" title="Valeur">' +
    '<select class="cfg-select sv-mode wfd-fs11">' +
      '<option value="set">= Écraser</option>' +
      '<option value="append">+= Ajouter</option>' +
      '<option value="push">[] Push liste</option>' +
    '</select>' +
    '<button onclick="svRemoveRow(this)" class="wfd-del-btn-red">×</button>';
  container.appendChild(row);
}

function svRemoveRow(btn) {
  btn.closest('.sv-row')?.remove();
}

function svReadAssignments(pfx) {
  const container = document.getElementById((pfx||'cfg') + '-sv-rows');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.sv-row')).map(row => ({
    key  : row.querySelector('.sv-key')?.value?.trim()   || '',
    value: row.querySelector('.sv-value')?.value?.trim() || '',
    mode : row.querySelector('.sv-mode')?.value          || 'set',
  })).filter(a => a.key);
}

// ── ID Generator ─────────────────────────────────────────────────────────────
function igTypeChange(pfx) {
  const type = document.getElementById(pfx+'-ig-type')?.value || 'numeric';
  const lengthWrap = document.getElementById(pfx+'-ig-length-wrap');
  const prefixWrap = document.getElementById(pfx+'-ig-prefix-wrap');
  if (lengthWrap) lengthWrap.style.display = ['uuid','timestamp'].includes(type) ? 'none' : '';
  if (prefixWrap) prefixWrap.style.display = type === 'prefixed' ? '' : 'none';
}

function igAddAction(pfx) {
  const container = document.getElementById(pfx+'-ig-actions');
  if (!container) return;
  // Retirer le placeholder vide si présent
  const placeholder = container.querySelector('div[style*="color:#444"]');
  if (placeholder) placeholder.remove();
  const i = container.querySelectorAll('.ig-api-row').length;
  const connOpts = wfdConnexions.filter(c => c.direction === 'outbound').map(c =>
    `<option value="${c.id}">${escHtml(c.name)}</option>`
  ).join('');
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="ig-api-row wfd-ig-row-card" data-i="${i}">
      <div class="wfd-ig-row-grid">
        <select class="cfg-select ig-conn" data-i="${i}" onchange="igConnChange(${i},'${pfx}')">
          <option value="">— Connexion —</option>${connOpts}
        </select>
        <select class="cfg-select ig-action" data-i="${i}">
          <option value="">— Action —</option>
        </select>
        <input class="cfg-input ig-field wfd-mono-sm2" data-i="${i}"
          value="external_id" placeholder="Champ body (ex: external_id)">
        <button onclick="igRemoveAction(${i})"
          class="wfd-del-btn-red">×</button>
      </div>
    </div>`;
  container.appendChild(div.firstElementChild);
}

function igConnChange(idx, pfx) {
  const container = document.getElementById((pfx||'cfg')+'-ig-actions');
  const row = container?.querySelector(`.ig-api-row[data-i="${idx}"]`);
  if (!row) return;
  const connId = row.querySelector('.ig-conn')?.value;
  const conn = wfdConnexions.find(c => c.id === connId);
  const actionSel = row.querySelector('.ig-action');
  if (!actionSel) return;
  actionSel.innerHTML = '<option value="">— Action —</option>' +
    (conn?.actions || []).map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
}

function igRemoveAction(idx) {
  document.querySelector(`.ig-api-row[data-i="${idx}"]`)?.remove();
}

function igReadActions(pfx) {
  const container = document.getElementById((pfx||'cfg')+'-ig-actions');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.ig-api-row')).map(row => ({
    connexionId: row.querySelector('.ig-conn')?.value   || '',
    actionId   : row.querySelector('.ig-action')?.value || '',
    field      : row.querySelector('.ig-field')?.value  || 'external_id',
  })).filter(a => a.connexionId && a.actionId);
}

// ── Gate ─────────────────────────────────────────────────────────────────────
function wfdGateUpdateSummary(pfx) {
  const mode = ['throttle','delay','pause'].find(m => {
    const b = document.getElementById(pfx+'-gate-mode-'+m);
    return b && b.dataset.active === '1';
  }) || 'throttle';
  const sumEl = document.getElementById(pfx+'-gate-summary-text');
  if (!sumEl) return;
  const max  = parseInt(document.getElementById(pfx+'-gate-max-concurrent')?.value||'3');
  const del  = parseFloat(document.getElementById(pfx+'-gate-delay-sec')?.value||'5');
  const auto = !!document.getElementById(pfx+'-gate-pause-auto')?.checked;
  const autoS= parseInt(document.getElementById(pfx+'-gate-pause-auto-sec')?.value||'60');
  sumEl.innerHTML = _wfdGateSummary(mode, max, del, '', auto, autoS);
}
function wfdGateModeChange(pfx,mode){
  ['throttle','delay','pause'].forEach(function(m){
    var btn=document.getElementById(pfx+'-gate-mode-'+m);
    var wrap=document.getElementById(pfx+'-gate-'+m+'-wrap');
    var active=m===mode;
    if(btn){
      btn.classList.toggle('active-orange', active);
      btn.classList.toggle('inactive-btn', !active);
      btn.dataset.active=active?'1':'';
    }
    if(wrap)wrap.style.display=active?'':'none';
  });
  // Mettre à jour le résumé
  var sumEl=document.getElementById(pfx+'-gate-summary-text');
  if(sumEl){
    var max=parseInt(document.getElementById(pfx+'-gate-max-concurrent')?.value||'3');
    var del=parseFloat(document.getElementById(pfx+'-gate-delay-sec')?.value||'5');
    var auto=!!document.getElementById(pfx+'-gate-pause-auto')?.checked;
    var autoS=parseInt(document.getElementById(pfx+'-gate-pause-auto-sec')?.value||'60');
    sumEl.innerHTML=_wfdGateSummary(mode,max,del,'',auto,autoS);
  }
  // Auto-save pour mettre à jour le canvas immédiatement
  if (pfx === 'cfg' && typeof sauvegarderConfig === 'function') sauvegarderConfig();
}
function wfdGatePauseAutoToggle(pfx){var cb=document.getElementById(pfx+'-gate-pause-auto'),inp=document.getElementById(pfx+'-gate-pause-auto-sec');if(inp)inp.disabled=!cb?.checked;}

// ── Timer ─────────────────────────────────────────────────────────────────────
function wfdTimerModeChange(pfx,mode){
  ['interval','cron','oneshot'].forEach(function(m){
    var btn=document.getElementById(pfx+'-timer-mode-'+m),wrap=document.getElementById(pfx+'-timer-'+m+'-wrap'),active=m===mode;
    if(btn){
      btn.classList.toggle('active-purple', active);
      btn.classList.toggle('inactive-btn', !active);
      btn.dataset.active=active?'1':'';
    }
    if(wrap)wrap.style.display=active?'':'none';
  });
  if(pfx==='cfg'&&typeof sauvegarderConfig==='function') sauvegarderConfig();
}
function wfdCronFreqChange(pfx,freq){['hourly','daily','weekly','monthly'].forEach(function(f){var b=document.getElementById(pfx+'-cron-freq-'+f),active=f===freq;if(b){b.classList.toggle('active-purple',active);b.classList.toggle('inactive-btn',!active);}});var dw=document.getElementById(pfx+'-cron-days-wrap'),mw=document.getElementById(pfx+'-cron-mday-wrap'),tw=document.getElementById(pfx+'-cron-time-wrap');if(dw)dw.style.display=freq==='weekly'?'':'none';if(mw)mw.style.display=freq==='monthly'?'':'none';if(tw)tw.style.display=freq==='hourly'?'none':'';wfdCronUpdateSummary(pfx);}
function wfdCronDayToggle(pfx,dayIdx){var btn=document.getElementById(pfx+'-cron-day-'+dayIdx);if(!btn)return;var active=btn.classList.contains('active-purple');btn.classList.toggle('active-purple',!active);btn.classList.toggle('inactive-btn',active);wfdCronUpdateSummary(pfx);}
function _wfdReadCronFreq(pfx){for(var f of['hourly','daily','weekly','monthly']){var b=document.getElementById(pfx+'-cron-freq-'+f);if(b&&b.classList.contains('active-purple'))return f;}return 'daily';}
function _wfdReadCronDays(pfx){var d=[];for(var i=0;i<7;i++){var b=document.getElementById(pfx+'-cron-day-'+i);if(b&&b.classList.contains('active-purple'))d.push(i);}return d.length?d:[1,2,3,4,5];}
function _wfdBuildCronExpr(freq,days,hour,min,mday){var h=String(hour||0).padStart(2,'0'),m=String(min||0).padStart(2,'0');if(freq==='hourly')return m+' * * * *';if(freq==='daily')return m+' '+h+' * * *';if(freq==='weekly')return m+' '+h+' * * '+(days||[1,2,3,4,5]).sort().join(',');return m+' '+h+' '+(mday||1)+' * *';}
function _wfdCronSummaryText(freq,days,hour,min,mday){var names=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],t=String(hour).padStart(2,'0')+'h'+String(min).padStart(2,'0');if(freq==='hourly')return 'Toutes les heures à la minute '+String(min).padStart(2,'0');if(freq==='daily')return 'Tous les jours à '+t;if(freq==='weekly'){var ns=days.sort().map(function(d){return names[d];}),l=ns.pop();return 'Chaque '+(ns.length?ns.join(', ')+' et '+l:l)+' à '+t;}return 'Le '+(mday||1)+(mday===1?'er':'')+' de chaque mois à '+t;}
function wfdCronUpdateSummary(pfx){var freq=_wfdReadCronFreq(pfx),days=_wfdReadCronDays(pfx),h=parseInt(document.getElementById(pfx+'-cron-hour')?.value||'9'),m=parseInt(document.getElementById(pfx+'-cron-minute')?.value||'0'),md=parseInt(document.getElementById(pfx+'-cron-mday')?.value||'1'),s=document.getElementById(pfx+'-cron-summary-text'),e=document.getElementById(pfx+'-cron-expr-display');if(s)s.textContent=_wfdCronSummaryText(freq,days,h,m,md);if(e)e.textContent=_wfdBuildCronExpr(freq,days,h,m,md);}
// ── Sélecteur d'environnement Iconik (partagé entre panels) ─────────────────
function buildEnvSelector(pfx, cfg) {
  const envs = typeof getEnvironnements === 'function' ? getEnvironnements() : [];
  if (!envs.length) return ''; // Pas d'env configuré → ne rien afficher
  const colors = { dev:'#3498db', qa:'#f39c12', prod:'#00d4aa' };
  const opts = envs.map(e => {
    const color = colors[e.environment] || '#888';
    return `<option value="${escHtml(e.name)}" ${cfg.iconikEnv===e.name?'selected':''}>${escHtml(e.name)}</option>`;
  }).join('');
  const selEnv = envs.find(e => e.name === cfg.iconikEnv);
  const dotColor = selEnv ? (colors[selEnv.environment]||'#888') : '#555';
  return `
    <div class="wfd-env-row">
      <span class="wfd-env-dot" style="--dot-color:${dotColor};" id="${pfx}-env-dot"></span>
      <select id="${pfx}-iconik-env" class="cfg-select wfd-env-select"
        onchange="wfdEnvChange('${pfx}')">
        <option value="">— Hériter du flux —</option>
        ${opts}
      </select>
    </div>`;
}

function wfdEnvChange(pfx) {
  const sel   = document.getElementById(pfx + '-iconik-env');
  const dot   = document.getElementById(pfx + '-env-dot');
  const colors = { dev:'#3498db', qa:'#f39c12', prod:'#00d4aa' };
  const envs  = typeof getEnvironnements === 'function' ? getEnvironnements() : [];
  const env   = envs.find(e => e.name === sel?.value);
  const color = env ? (colors[env.environment]||'#888') : '#555';
  if (dot) dot.style.setProperty('--dot-color', color);
  if (pfx === 'cfg' && typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// ── Actualisation live des listes depuis l'API Iconik ────────────────────────

async function wfdRefreshSavedSearches(pfx) {
  const btn    = document.getElementById(pfx + '-ss-refresh');
  const status = document.getElementById(pfx + '-ss-status');
  const sel    = document.getElementById(pfx + '-ss-id');
  const manual = document.getElementById(pfx + '-ss-id-manual');

  if (btn) btn.style.transform = 'rotate(360deg)';
  if (status) { status.textContent = '⏳ Chargement…'; status.style.color = '#888'; }

  // Récupérer les credentials de l'env sélectionné pour ce panel
  const envSel = document.getElementById(pfx + '-iconik-env');
  const envName = envSel?.value || (typeof getFluxCourant === 'function' ? getFluxCourant()?.iconikEnv : null);
  const envs = typeof getEnvironnements === 'function' ? getEnvironnements() : [];
  const env  = envs.find(e => e.name === envName) || envs[0];

  if (!env) {
    if (status) { status.textContent = '❌ Aucun environnement configuré'; status.style.color = '#e74c3c'; }
    if (btn) btn.style.transform = '';
    return;
  }

  try {
    const res = await fetch(
      (env.iconikUrl || 'https://app.iconik.io') + '/API/search/v1/search/saved/?per_page=200',
      { headers: { 'App-ID': env.appId, 'Auth-Token': env.token || env.appToken, 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const searches = data.objects || [];

    // Mettre à jour wfdData en mémoire
    const _mapped = searches.map(s => ({ id: s.id, name: s.title || s.name || s.id }));
    if (typeof wfdData !== 'undefined') wfdData.savedSearches = _mapped;
    // Persister dans wfdLiveData_${envName}
    try {
      const _liveKey = 'wfdLiveData_' + env.name;
      const _live = JSON.parse(localStorage.getItem(_liveKey)||'{}');
      _live.savedSearches = _mapped;
      _live._env = env.name;
      _live._refreshedAt = new Date().toISOString();
      localStorage.setItem(_liveKey, JSON.stringify(_live));
    } catch(_) {}

    // Repeupler le select
    if (sel) {
      const currentVal = sel.value || manual?.value || '';
      sel.innerHTML = '<option value="">— Sélectionner une Saved Search —</option>' +
        searches.map(s => `<option value="${s.id}" ${currentVal===s.id?'selected':''}>${escHtml(s.title||s.name||s.id)}</option>`).join('');
      sel.style.display = '';
      if (manual) manual.style.display = 'none';
    }

    if (status) {
      status.textContent = '✅ ' + searches.length + ' saved search(es) chargée(s) depuis ' + (env.name||'Iconik');
      status.style.color = '#27ae60';
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    }
  } catch(e) {
    if (status) { status.textContent = '❌ ' + e.message; status.style.color = '#e74c3c'; }
  }

  if (btn) { setTimeout(() => btn.style.transform = '', 400); }
}

// Généralisation : actualiser n'importe quelle liste depuis l'API
async function wfdRefreshList(pfx, selectId, endpoint, labelField, valueField) {
  labelField = labelField || 'name';
  valueField = valueField || 'id';
  const sel    = document.getElementById(pfx + '-' + selectId);
  if (!sel) return;
  const envSel = document.getElementById(pfx + '-iconik-env');
  const envName = envSel?.value || (typeof getFluxCourant === 'function' ? getFluxCourant()?.iconikEnv : null);
  const envs  = typeof getEnvironnements === 'function' ? getEnvironnements() : [];
  const env   = envs.find(e => e.name === envName) || envs[0];
  if (!env) return;
  try {
    const res  = await fetch(
      (env.iconikUrl||'https://app.iconik.io') + endpoint + '?per_page=200',
      { headers: { 'App-ID': env.appId, 'Auth-Token': env.token||env.appToken, 'Accept': 'application/json' } }
    );
    const data  = await res.json();
    const items = data.objects || data.results || [];
    const curVal = sel.value;
    sel.innerHTML = '<option value="">— Sélectionner —</option>' +
      items.map(o => `<option value="${o[valueField]}" ${curVal===o[valueField]?'selected':''}>${escHtml(o[labelField]||o.name||o.id)}</option>`).join('');
  } catch(e) { console.warn('[WFD Refresh]', selectId, e.message); }
}

// ── Engine Designer ───────────────────────────────────────────────
function _getActiveFluxes() {
  try { return new Set(JSON.parse(localStorage.getItem('wfd_active_fluxes')||'[]')); } catch(_) { return new Set(); }
}
function _saveActiveFluxes(set) { localStorage.setItem('wfd_active_fluxes', JSON.stringify([...set])); }
function wfdUpdateToggleBtn() {
  const flux=getFluxCourant(), btn=document.getElementById('btn-flux-toggle');
  const group=document.getElementById('tb-engine-group');
  if (!btn) return;
  if (!flux) { if (group) group.style.display='none'; _wfdSetReadOnly(false); return; }
  if (group) group.style.display='';
  const active=_getActiveFluxes().has(flux.id);
  btn.textContent=active?'■ Actif':'▷ Inactif';
  btn.classList.toggle('active-green', active);
  btn.classList.toggle('inactive-btn', !active);
  _wfdSetReadOnly(active);
}

function _wfdSetReadOnly(readonly) {
  const wrap   = document.getElementById('wfd-canvas-wrap');
  const banner = document.getElementById('wfd-readonly-banner');
  const cfgPanel = document.getElementById('wfd-config-panel');

  if (readonly) {
    // Bandeau
    if (!banner) {
      const b = document.createElement('div');
      b.id = 'wfd-readonly-banner';
      b.innerHTML = '<span class="wfd-readonly-icon">🔒</span>' +
        '<span>Flux actif — <strong>désactiver</strong> pour modifier</span>';
      if (wrap) wrap.appendChild(b);
    }
    // Bloquer les interactions canvas
    if (wrap) wrap.dataset.readonly = '1';
    // Fermer et griser le config panel
    if (cfgPanel) {
      cfgPanel.classList.remove('open');
      cfgPanel.classList.add('wfd-dimmed-disabled');
    }
  } else {
    // Retirer le bandeau
    if (banner) banner.remove();
    // Réactiver
    if (wrap) delete wrap.dataset.readonly;
    if (cfgPanel) {
      cfgPanel.classList.remove('wfd-dimmed-disabled');
    }
  }
}
function wfdToggleFlux() {
  const flux=getFluxCourant(); if (!flux) return;
  const actives=_getActiveFluxes();
  if (actives.has(flux.id)) {
    actives.delete(flux.id);
    toast('Flux désactivé — '+flux.name);
    if (window.WfdEngineInstance) window.WfdEngineInstance.deactivateFlux(flux.id);
  } else {
    actives.add(flux.id);
    toast('Flux activé — '+flux.name);
    if (window.WfdEngineInstance) {
      // Pousser les flux à jour avant d'activer pour éviter une version obsolète en mémoire
      window.WfdEngineInstance.loadFluxes(wfdFlows)
        .then(() => window.WfdEngineInstance.loadConnexions(
          (wfdConnexions || []).filter(c => c.direction === 'outbound')
        ))
        .catch(() => {}).finally(() => {
        window.WfdEngineInstance.activateFlux(flux.id);
        // Restaurer les jobs en pause qui survivent à la désactivation
        window.WfdEngineInstance.getPaused?.().then(function(paused) {
          if (!paused || !paused.length) return;
          paused.filter(p => p.fluxId === flux.id).forEach(p => {
            if (window.wfdRunPanelOpen) {
              wfdRunPanelOpen(p.runId, p.nodeId, {
                ports: p.ports||[], assets: p.assets||[],
                timeoutMs: p.timeoutMs||null, ctxSnapshot: p.ctxSnapshot||null
              });
            }
          });
        }).catch(() => {});
      });
    }
  }
  _saveActiveFluxes(actives); wfdUpdateToggleBtn();
  if (typeof peuplerSelectFlux === 'function') peuplerSelectFlux();
}
async function wfdRunManual() {
  const flux=getFluxCourant(); if (!flux) { toast('Aucun flux sélectionné'); return; }
  if (!window.WfdEngineInstance) { toast('Engine non initialisé'); return; }
  const btn=document.getElementById('btn-flux-run');
  if (btn) { btn.textContent='⏳ En cours...'; btn.disabled=true; }
  try {
    const ctx=await window.WfdEngineInstance.triggerManual(flux.id);
    const e=ctx.status==='success'?'🟢':ctx.status==='partial'?'🟡':'🔴';
    toast(e+' '+flux.name+' — '+ctx.status);
  } catch(err) { toast('❌ Erreur : '+err.message); }
  finally { if (btn) { btn.textContent='▶ Exécuter'; btn.disabled=false; } }
}

// ── buildOnErrorField ─────────────────────────────────────────────
function buildOnErrorField(pfx, cfg, family) {
  // 'loop' exclu : a son propre contrôle dédié (3 options incluant une sortie
  // d'erreur port dédiée), le générique créait un 2e contrôle concurrent et
  // trompeur qui ne servait à rien (toujours écrasé à la sauvegarde par le
  // contrôle spécifique, mais visible et modifiable par erreur dans l'UI).
  if (['trigger','watchfolder','listener','source','postit','timer','loop'].includes(family)) return '';
  const val=cfg.onError||'stop';
  const _oeColors = {'stop':'#e74c3c','continue_log':'#f39c12','continue':'#27ae60'};
  const _oeBgs    = {'stop':'#1a0505','continue_log':'#1a1000','continue':'#001a05'};
  return `<div class="cfg-field wfd-onerror-wrap">
    <label class="cfg-label">EN CAS D'ERREUR</label>
    <div class="wfd-onerror-btns">
      ${[['stop','🛑 Arrêter'],['continue_log','⚠️ Continuer + noter'],['continue','✅ Ignorer']].map(([v,lb])=>`
        <button class="wfd-onerror-btn${val===v?' active-status':''}"
          onclick="wfdSelectOnError('${pfx}','${v}',this)"
          data-onerror="${v}" data-pfx="${pfx}"
          style="${val===v?'--status-color:'+_oeColors[val]+';--status-bg:'+_oeBgs[val]+';':''}">
          ${lb}
        </button>`).join('')}
    </div>
    <input type="hidden" id="${pfx}-onerror-val" value="${val}">
  </div>`;
}
function wfdSelectOnError(pfx, val, el) {
  const colors={'stop':'#e74c3c','continue_log':'#f39c12','continue':'#27ae60'};
  const bgs={'stop':'#1a0505','continue_log':'#1a1000','continue':'#001a05'};
  el.closest('.cfg-field').querySelectorAll('[data-onerror]').forEach(btn => {
    const bv=btn.dataset.onerror; const a=bv===val;
    btn.classList.toggle('active-status', a);
    btn.classList.toggle('inactive-btn', !a);
    if (a) { btn.style.setProperty('--status-color', colors[bv]); btn.style.setProperty('--status-bg', bgs[bv]); }
  });
  const hidden=document.getElementById(pfx+'-onerror-val');
  if (hidden) hidden.value=val;
}

// ══ Panel Message (notification refondus) ════════════════════════

function buildMsgRuleRow(pfx, i, rule) {
  const flux  = (typeof getFluxCourant === 'function') ? getFluxCourant() : null;
  const nodes = (flux?.nodes || []).filter(n => !['postit','notification'].includes(n.family));

  const nodeOpts = nodes.map(n => {
    const fam = FAMILIES[n.family] || {};
    return `<option value="${n.id}" ${rule.srcId===n.id?'selected':''}>
      ${escHtml(fam.icon||'')} ${escHtml(n.name)}</option>`;
  }).join('');

  // Ports du nœud source sélectionné
  let portOpts = '<option value="0">✅ Sortie OK</option><option value="1" selected>❌ Sortie Erreur</option>';
  if (rule.srcId) {
    const srcNode = nodes.find(n => n.id === rule.srcId);
    if (srcNode) {
      const ports = srcNode.ports || buildPortsDef(srcNode.family, srcNode.config || {});
      portOpts = (ports.outputs || []).map((p, idx) =>
        `<option value="${idx}" ${String(rule.portIdx)===String(idx)?'selected':''}>
          ${escHtml(p.label || ('Port ' + idx))}</option>`
      ).join('');
    }
  }

  const status = rule.status || 'failed';
  const statusColors = { success:'#27ae60', partial:'#f39c12', failed:'#e74c3c' };
  const statusEmojis = { success:'🟢', partial:'🟡', failed:'🔴' };

  return `
  <div class="msg-rule-row wfd-msgrule-card">
    <div class="wfd-msgrule-hdr-row">
      <span class="wfd-text-shrink">Si</span>
      <select class="cfg-select msg-rule-src wfd-msgrule-src-sel"
        onchange="wfdMsgRuleNodeChange(this, '${pfx}')">
        <option value="">— Choisir un nœud —</option>
        ${nodeOpts}
      </select>
      <span class="wfd-text-shrink">sort par</span>
      <select class="cfg-select msg-rule-port wfd-msgrule-port-sel">
        ${portOpts}
      </select>
      <button onclick="this.closest('.msg-rule-row').remove()"
        class="wfd-msgrule-del-btn">×</button>
    </div>
    <div class="wfd-row-gap6c">
      <span class="wfd-text-shrink">Statut</span>
      <div class="wfd-msgrule-status-wrap">
        ${['success','partial','failed'].map(st => `
          <button onclick="wfdMsgRuleStatus(this, '${st}')"
            data-status="${st}"
            class="wfd-msgrule-status-btn${st===status?' active-status':' inactive-btn'}"
            style="--status-color:${statusColors[st]};">
            ${statusEmojis[st]}</button>`).join('')}
        <input type="hidden" class="msg-rule-status" value="${status}">
      </div>
      <input class="cfg-input msg-rule-text wfd-msgrule-text-input"
        list="${pfx}-wfd-var-list"
        value="${escHtml(rule.message||'')}"
        placeholder="Message pour ce cas...">
    </div>
  </div>`;
}

function wfdMsgAddRule(pfx) {
  const container = document.getElementById(pfx + '-msg-rules');
  if (!container) return;
  // Vider le message "aucune règle"
  if (container.querySelector('div[style*="color:#444"]')) container.innerHTML = '';
  const i = container.querySelectorAll('.msg-rule-row').length;
  container.insertAdjacentHTML('beforeend', buildMsgRuleRow(pfx, i, {}));
}

function wfdMsgRuleNodeChange(sel, pfx) {
  const row     = sel.closest('.msg-rule-row');
  const portSel = row.querySelector('.msg-rule-port');
  if (!portSel) return;
  const flux    = (typeof getFluxCourant === 'function') ? getFluxCourant() : null;
  const nodes   = flux?.nodes || [];
  const srcNode = nodes.find(n => n.id === sel.value);
  if (!srcNode) return;
  const ports   = srcNode.ports || buildPortsDef(srcNode.family, srcNode.config || {});
  portSel.innerHTML = (ports.outputs || []).map((p, idx) =>
    `<option value="${idx}">${escHtml(p.label || ('Port ' + idx))}</option>`
  ).join('');
  // Sélectionner le port 1 (erreur) par défaut
  if (portSel.options.length > 1) portSel.selectedIndex = 1;
}

function wfdMsgRuleStatus(btn, status) {
  const statusColors = { success:'#27ae60', partial:'#f39c12', failed:'#e74c3c' };
  const row = btn.closest('.msg-rule-row');
  row.querySelectorAll('[data-status]').forEach(b => {
    const st = b.dataset.status;
    const active = st === status;
    b.classList.toggle('active-status', active);
    b.classList.toggle('inactive-btn', !active);
    if (active) b.style.setProperty('--status-color', statusColors[st]);
  });
  const hidden = row.querySelector('.msg-rule-status');
  if (hidden) hidden.value = status;
}

function wfdMsgAutoMode(pfx) {
  const cb   = document.getElementById(pfx + '-auto-mode');
  const wrap = document.getElementById(pfx + '-body-wrap');
  if (wrap) wrap.style.display = cb?.checked ? 'none' : '';
}
// ── Fetch — tags métadonnées + saved search ──────────────────────────────────
async function wfdFetchMetaViewChanged(pfx) {
  const viewId = document.getElementById(pfx + '-fetch-meta-view')?.value;
  const addEl  = document.getElementById(pfx + '-fetch-meta-field-add');
  if (!addEl) return;
  // Récupérer les champs de la vue sélectionnée via le proxy
  let fields = [];
  if (viewId) {
    try {
      const envName = encodeURIComponent(document.getElementById('wfd-env-select')?.value || '');
      const res = await fetch('/api/iconik/' + envName + '/API/metadata/v1/views/' + viewId + '/');
      if (res.ok) {
        const data = await res.json();
        fields = (data.view_fields || [])
          .filter(f => f.name && f.name !== '__separator__')
          .map(f => f.name)
          .sort();
        // Mettre en cache
        if (!wfdData.mdViewFields) wfdData.mdViewFields = {};
        wfdData.mdViewFields[viewId] = data.view_fields?.filter(f => f.name && f.name !== '__separator__') || [];
      }
    } catch(e) { console.warn('[wfdFetchMetaViewChanged]', e.message); }
  } else {
    // Pas de vue sélectionnée — tous les champs
    fields = (wfdData.metadata || []).map(m => m.nom || m.name || '').filter(Boolean).sort();
  }
  // Mettre à jour le dropdown d'ajout de champ
  const currentTags = wfdFetchReadTags(pfx);
  addEl.innerHTML = '<option value="">+ Ajouter un champ…</option>' +
    fields.filter(f => !currentTags.includes(f))
          .map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`)
          .join('');
}

function wfdFetchAddTag(pfx) {
  var sel = document.getElementById(pfx + '-fetch-meta-field-add');
  var tags = document.getElementById(pfx + '-meta-tags');
  if (!sel || !tags || !sel.value) return;
  var field = sel.value;
  // Vérifier doublon
  if (tags.querySelector('[data-field="' + field + '"]')) return;
  // Supprimer le placeholder "Tous les champs"
  var placeholder = tags.querySelector('span:not(.wfd-meta-tag)');
  if (placeholder) placeholder.remove();
  // Créer le tag
  var tag = document.createElement('span');
  tag.className = 'wfd-meta-tag';
  tag.dataset.field = field;
  tag.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:#1a2a1a;border:1px solid #2d5a2d;border-radius:12px;font-size:11px;color:#2ecc71;cursor:pointer;';
  tag.innerHTML = field + ' <span class="wfd-c-555-10">×</span>';
  tag.setAttribute('onclick', 'wfdFetchRemoveTag(this,"' + pfx + '")');
  tags.appendChild(tag);
  // Retirer du dropdown
  var opt = sel.querySelector('option[value="' + field + '"]');
  if (opt) opt.remove();
  sel.value = '';
}

function wfdFetchRemoveTag(tagEl, pfx) {
  var field = tagEl.dataset.field;
  var tags  = document.getElementById(pfx + '-meta-tags');
  var sel   = document.getElementById(pfx + '-fetch-meta-field-add');
  tagEl.remove();
  // Remettre dans le dropdown
  if (sel && field) {
    var opt = document.createElement('option');
    opt.value = field; opt.textContent = field;
    // Insérer en ordre alphabétique
    var opts = Array.from(sel.options).slice(1); // skip "Ajouter..."
    var inserted = false;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value > field) {
        sel.insertBefore(opt, opts[i]);
        inserted = true; break;
      }
    }
    if (!inserted) sel.appendChild(opt);
  }
  // Remettre le placeholder si plus de tags
  if (tags && !tags.querySelector('.wfd-meta-tag')) {
    var ph = document.createElement('span');
    ph.style.cssText = 'color:#444;font-size:10px;line-height:26px;';
    ph.textContent = 'Tous les champs (aucun filtre)';
    tags.appendChild(ph);
  }
}

function wfdFetchReadTags(pfx) {
  var tags = document.getElementById(pfx + '-meta-tags');
  if (!tags) return [];
  return Array.from(tags.querySelectorAll('.wfd-meta-tag')).map(function(t) { return t.dataset.field; });
}

// ── Fetch — wfdFetchSubType étendu pour savedsearch ──────────────────────────
function wfdFetchSubTypeEx(pfx, subType) {
  ['asset','collection','metadata','savedsearch'].forEach(function(st) {
    var btn   = document.getElementById(pfx + '-subtype-' + st);
    var panel = document.getElementById(pfx + '-fetch-' + st);
    var a = st === subType;
    if (btn)   { btn.classList.toggle('active-blue', a); btn.classList.toggle('inactive-btn', !a); btn.dataset.active = a ? '1' : ''; }
    if (panel) panel.style.display = a ? '' : 'none';
  });
}

// ── Endpoint WFD slug ────────────────────────────────────────────────────────
function httpAjouterHeader(pfx) {
  const list = document.getElementById(pfx + '-http-headers-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'wfd-row-gap6-mb4';
  div.innerHTML = `
    <input class="cfg-input http-xhdr-key wfd-flex1" placeholder="Clé">
    <input class="cfg-input http-xhdr-val wfd-flex2b" placeholder="Valeur ou {var}">
    <button class="cfg-btn danger wfd-pad-4-8" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(div);
}

function wfdSlugUpdate(pfx) {
  const inp     = document.getElementById(pfx + '-wfd-slug');
  const preview = document.getElementById(pfx + '-wfd-slug-preview');
  const val     = (inp?.value || '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  if (inp && inp.value !== val) inp.value = val;
  if (preview) preview.textContent = val ? '/wfd/action/' + val : '—';
}

// ── Fonctions récupérées depuis original ─────────────────────────────────────
function wfdFetchSubType(pfx, subType) {
  ['asset','collection','metadata','savedsearch'].forEach(st => {
    const btn  = document.getElementById(pfx+'-subtype-'+st);
    const panel= document.getElementById(pfx+'-fetch-'+st);
    const a = st===subType;
    if (btn) {
      btn.classList.toggle('active-blue', a);
      btn.classList.toggle('inactive-btn', !a);
      btn.dataset.active = a?'1':'';
    }
    if (panel) panel.style.display = a ? '' : 'none';
  });
  if (pfx === 'cfg' && typeof sauvegarderConfig === 'function') sauvegarderConfig();
  // Si on active le sous-type metadata et qu'une vue est déjà sélectionnée, filtrer les champs
  if (subType === 'metadata') {
    const viewId = document.getElementById(pfx + '-fetch-meta-view')?.value;
    if (viewId) wfdFetchMetaViewChanged(pfx);
  }
}
function wfdFetchSourceChange(pfx) {
  const sel=document.getElementById(pfx+'-fetch-source-asset');
  const wrap=document.getElementById(pfx+'-fetch-value-wrap');
  if (sel&&wrap) wrap.style.display=sel.value==='triggered'?'none':'';
}
function wfdFetchOptionsChange(pfx) {
  const cb=document.getElementById(pfx+'-with-meta');
  const wrap=document.getElementById(pfx+'-meta-view-wrap');
  if (cb&&wrap) wrap.style.display=cb.checked?'':'none';
}
function wfdActionTypeChange(pfx) {
  const sel=document.getElementById(pfx+'-action-type');
  const tgt=document.getElementById(pfx+'-action-target-wrap');
  const src=document.getElementById(pfx+'-action-source-wrap');
  if (!sel) return;
  if (tgt) tgt.style.display=sel.value==='delete_asset'?'none':'';
  if (src) src.style.display=sel.value==='move_to_collection'?'':'none';
}
function umFieldOpChange(btn) {
  const op  = btn.dataset.op;
  const row = btn.closest('div');
  row.querySelectorAll('.um-field-op-btn').forEach(b => {
    b.classList.toggle('active-blue', b.dataset.op === op);
    b.classList.toggle('inactive-btn', b.dataset.op !== op);
  });
  const hidden = row.querySelector('.um-field-op');
  if (hidden) hidden.value = op;
  const container = btn.closest('[style*="grid"]');
  const valInput = container ? container.querySelector('.um-field-val') : null;
  if (valInput) valInput.disabled = (op === 'reset');
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}
function wfdMetaOp(pfx, op) {
  ['write','reset','copy'].forEach(v => {
    const btn=document.getElementById(pfx+'-meta-op-'+v);
    if (btn) { btn.classList.toggle('active-purple', v===op); btn.classList.toggle('inactive-btn', v!==op); }
  });
  const fw=document.getElementById(pfx+'-meta-fields-wrap');
  const cw=document.getElementById(pfx+'-meta-copy-wrap');
  if (fw) fw.style.display=op==='copy'?'none':'';
  if (cw) cw.style.display=op==='copy'?'':'none';
}
function wfdUmAddRow(pfx) {
  const c=document.getElementById(pfx+'-um-rows'); if (!c) return;
  const row=document.createElement('div'); row.className='um-row wfd-umrow-grid';
  const allMeta=(wfdData.metadata||[]).map(m=>m.nom||m.name||'').filter(Boolean).sort();
  row.innerHTML=`<select class="cfg-select um-key wfd-fs10"><option value="">— Champ —</option>${allMeta.map(m=>`<option value="${m}">${escHtml(m)}</option>`).join('')}</select><input class="cfg-input um-value" placeholder="valeur ou {variable}"><button onclick="this.closest('.um-row').remove()" class="wfd-umrow-del-btn">×</button>`;
  c.appendChild(row);
}
function wfdListenerSimToggle(pfx) {
  const wrap = document.getElementById(pfx + '-lsim-wrap');
  const btn  = document.getElementById(pfx + '-lsim-toggle');
  if (!wrap) return;
  const open = wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? 'Masquer' : 'Afficher';
}
const WFD_SIM_TEMPLATES = {
  metadata_changed: {
    realm: 'metadata', operation: 'changed',
    object_id: 'asset-id-example', object_type: 'asset',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: { metadata_values: {} }
  },
  asset_created: {
    realm: 'assets', operation: 'created',
    object_id: 'asset-id-example', object_type: 'asset',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: {}
  },
  asset_status_changed: {
    realm: 'assets', operation: 'status_changed',
    object_id: 'asset-id-example', object_type: 'asset',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: { status: 'ACTIVE' }
  },
  asset_added_collection: {
    realm: 'assets', operation: 'added_to_collection',
    object_id: 'asset-id-example', object_type: 'asset',
    collection_id: 'collection-id-example',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: {}
  },
  proxy_available: {
    realm: 'assets', operation: 'proxy_available',
    object_id: 'asset-id-example', object_type: 'asset',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: {}
  },
  job_finished: {
    realm: 'jobs', operation: 'finished',
    object_id: 'job-id-example', object_type: 'job',
    user_id: 'user-id-example', date_created: new Date().toISOString(),
    data: { status: 'FINISHED', asset_id: 'asset-id-example' }
  },
  custom_action: {
    asset_id: 'asset-id-example',
    user_id: 'user-id-example',
    context: 'asset',
    metadata_view_id: 'view-id-example',
    auth_token: 'token-example',
    app_id: 'app-id-example'
  },
  watchfolder: {
    _watchfolder: true,
    filePath: '/path/to/file.mxf',
    fileName: 'file.mxf',
    fileSize: 1000000,
    _firedAt: new Date().toISOString()
  },
  manual_empty: {},
  custom: {}
};

function wfdTriggerSimToggle(pfx) {
  const wrap = document.getElementById(pfx + '-sim-wrap');
  const btn  = document.getElementById(pfx + '-sim-toggle');
  if (!wrap) return;
  const open = wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if (btn) btn.textContent = open ? 'Masquer' : 'Afficher';
  if (open && !document.getElementById(pfx + '-sim-payload')?.value) wfdTriggerSimLoadTemplate(pfx);
}
function wfdTriggerSimLoadTemplate(pfx) {
  const sel = document.getElementById(pfx + '-sim-template');
  const ta  = document.getElementById(pfx + '-sim-payload');
  if (!sel || !ta) return;
  ta.value = JSON.stringify(WFD_SIM_TEMPLATES[sel.value] || {}, null, 2);
  const r = document.getElementById(pfx + '-sim-result');
  if (r) r.style.display = 'none';
}

// ── Exports cross-fichiers ────────────────────────────────────────────────────


// ── HTTP Body Builder — helpers ───────────────────────────────────────────────

// Détecter les variables disponibles depuis le dernier run
function httpBodyDetectVars(pfx) {
  const tagsWrap = document.getElementById(pfx + '-body-tags');
  if (!tagsWrap) return;

  // Collecter les vars du dernier run du flux courant
  const allVars = {};
  try {
    const history = JSON.parse(localStorage.getItem('wfd-run-history') || '{"runs":{},"index":[]}');
    const flux    = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    if (flux) {
      const lastRunId = (history.index || []).find(id => history.runs[id]?.fluxId === flux.id);
      const lastRun   = lastRunId ? history.runs[lastRunId] : null;
      if (lastRun) {
        (lastRun.nodes || []).forEach(n => {
          Object.assign(allVars, n.snapshot?.vars    || {});
          Object.assign(allVars, n.snapshot?.results || {});
        });
      }
    }
  } catch(e) {}

  if (!Object.keys(allVars).length) {
    toast('Aucun run disponible — exécutez d\'abord le flux avec une pause');
    return;
  }

  // Variables déjà dans les tags
  const existingVars = new Set(
    [...document.querySelectorAll('#' + pfx + '-body-tags .http-body-tag')]
      .map(t => t.querySelector('span')?.textContent?.trim())
      .filter(Boolean)
  );

  // Proposer les variables non encore ajoutées via un mini-menu
  const menu = document.createElement('div');
  menu.id = pfx + '-body-var-menu';
  menu.className = 'wfd-body-var-menu';

  const rect = tagsWrap.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  // Catégoriser les variables
  const entries = Object.entries(allVars).filter(([k]) =>
    !k.startsWith('_') && !k.endsWith('_count') && !k.endsWith('_status') && !k.endsWith('_ok')
  );

  if (!entries.length) {
    toast('Aucune variable utilisable trouvée dans le dernier run');
    return;
  }

  const header = document.createElement('div');
  header.className = 'wfd-body-var-menu-hdr';
  const _closeMenuId = pfx + '-body-var-menu';
  const _closeBtn = document.createElement('button');
  _closeBtn.innerHTML = '&times;';
  _closeBtn.className = 'wfd-body-var-menu-close';
  _closeBtn.onclick = () => document.getElementById(_closeMenuId)?.remove();
  header.innerHTML = '<span>Variables disponibles</span>';
  header.appendChild(_closeBtn);
  menu.appendChild(header);

  entries.forEach(([k, v]) => {
    const alreadyAdded = existingVars.has(k);
    const isObj   = v && typeof v === 'object' && !Array.isArray(v);
    const isArr   = Array.isArray(v);
    const isJson  = typeof v === 'string' && v.startsWith('{') && v.includes('"');
    const canSpread = isObj || isJson;

    const row = document.createElement('div');
    row.className = 'wfd-body-var-row' + (alreadyAdded ? ' wfd-dimmed' : '');

    const type = isArr ? '[]' : (canSpread ? '{}' : typeof v === 'number' ? '#' : 'T');
    const typeColor = isArr ? '#e67e22' : canSpread ? '#5dbb6b' : '#7ec8e3';
    const preview = typeof v === 'string' ? v.slice(0, 40) :
                    typeof v === 'number' ? String(v) :
                    JSON.stringify(v).slice(0, 40);

    row.innerHTML =
      `<span class="wfd-body-var-type-badge" style="--type-color:${typeColor};">${type}</span>` +
      `<span class="wfd-body-var-key">${escHtml(k)}</span>` +
      `<span class="wfd-body-var-preview">${escHtml(preview)}</span>`;

    if (!alreadyAdded) {
      // Boutons Ajouter / Étendre (si objet)
      const addBtn = document.createElement('button');
      addBtn.textContent = 'Ajouter';
      addBtn.className = 'wfd-body-var-addbtn';
      addBtn.onclick = (e) => {
        e.stopPropagation();
        httpBodyAddTag(pfx, k, k, false);
        row.classList.add('wfd-dimmed');
        addBtn.disabled = true;
        if (spreadBtn) spreadBtn.disabled = true;
      };
      row.appendChild(addBtn);

      if (canSpread) {
        const spreadBtn = document.createElement('button');
        spreadBtn.textContent = 'Étendre';
        spreadBtn.className = 'wfd-body-var-spreadbtn';
        spreadBtn.onclick = (e) => {
          e.stopPropagation();
          httpBodyAddTag(pfx, k, k, true);
          row.classList.add('wfd-dimmed');
          spreadBtn.disabled = true;
          addBtn.disabled = true;
        };
        row.appendChild(spreadBtn);
      }
    }

    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  // Fermer au clic extérieur
  setTimeout(() => {
    document.addEventListener('mousedown', function _closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', _closeMenu);
      }
    }, true);
  }, 0);
}

// Ajouter un tag dans le body builder
function httpBodyAddTag(pfx, varName, alias, spread) {
  const tagsWrap = document.getElementById(pfx + '-body-tags');
  if (!tagsWrap) return;

  // Retirer le placeholder si présent
  const ph = tagsWrap.querySelector('span[style*="color:#444"]');
  if (ph) ph.remove();

  const idx = tagsWrap.querySelectorAll('.http-body-tag').length;
  const tag = document.createElement('div');
  tag.className = 'http-body-tag wfd-http-tag';
  tag.dataset.idx = idx;
  tag.dataset.var = varName;
  tag.dataset.spread = spread ? '1' : '0';
  tag.style.setProperty('--tag-bg', spread ? '#0a1a0a' : '#0a0d14');
  tag.style.setProperty('--tag-border', spread ? '#2d5a2d' : '#1e3a5a');
  tag.innerHTML =
    `<span class="wfd-http-tag-name" style="--tag-color:${spread?'#5dbb6b':'#7ec8e3'};">${escHtml(varName)}</span>` +
    (!spread ? `<span class="wfd-c-555-10">→</span>
      <input class="http-tag-alias wfd-http-tag-alias-input" data-idx="${idx}" value="${escHtml(alias)}"
        title="Nom de clé dans le JSON"
        style="--alias-width:${Math.max(40,alias.length*7)}px;"
        oninput="httpBodyPreview('${pfx}')">` : '') +
    (spread ? '<span class="wfd-http-tag-spread-badge">étendu</span>' : '') +
    `<button onclick="httpBodyRemoveTag('${pfx}',${idx})"
      class="wfd-http-tag-del-btn">&times;</button>`;

  // Stocker les données dans des data-attributes pour lecture fiable
  tag.dataset.var    = varName;
  tag.dataset.alias  = alias;
  tag.dataset.spread = spread ? '1' : '0';

  tagsWrap.appendChild(tag);
  httpBodyPreview(pfx);
}

// Supprimer un tag
function httpBodyRemoveTag(pfx, idx) {
  const tagsWrap = document.getElementById(pfx + '-body-tags');
  if (!tagsWrap) return;
  // Supprimer le tag par son idx dans le dataset
  const tags = [...tagsWrap.querySelectorAll('.http-body-tag')];
  const tag  = tags.find(t => parseInt(t.dataset.idx) === idx) || tags[tags.length - 1];
  if (tag) tag.remove();
  // Remettre le placeholder si vide
  if (!tagsWrap.querySelectorAll('.http-body-tag').length) {
    const ph = document.createElement('span');
    ph.style.cssText = 'color:#444;font-size:11px;line-height:26px;';
    ph.textContent = 'Cliquez sur ⚡ pour détecter les variables disponibles';
    tagsWrap.appendChild(ph);
  }
  httpBodyPreview(pfx);
}

// Basculer entre mode builder et JSON brut
function httpBodyToggleRaw(pfx) {
  const builder = document.getElementById(pfx + '-body-builder');
  const raw     = document.getElementById(pfx + '-body-raw');
  const btn     = document.getElementById(pfx + '-body-raw-btn');
  if (!builder || !raw) return;
  const isRaw = !raw.classList.contains('wfd-hidden');
  builder.classList.toggle('wfd-hidden', isRaw);
  raw.classList.toggle('wfd-hidden', !isRaw);
  if (btn) {
    btn.classList.toggle('active-blue', !isRaw);
    btn.classList.toggle('inactive-btn', isRaw);
  }
}

// Générer l'aperçu JSON et le body sérialisé depuis les tags
function httpBodyPreview(pfx) {
  const previewEl = document.getElementById(pfx + '-body-preview');
  const statusEl  = document.getElementById(pfx + '-body-preview-status');
  if (!previewEl) return;

  const tags = httpBodyReadTags(pfx);
  const bodyStr = httpBodyBuildFromTags(tags);

  try {
    const parsed = JSON.parse(bodyStr.replace(/\{[^}]+\}/g, '"__VAR__"'));
    previewEl.textContent = JSON.stringify(parsed, null, 2)
      .replace(/"__VAR__"/g, '…');
  } catch(e) {
    previewEl.textContent = bodyStr;
  }
  if (statusEl) statusEl.textContent = tags.length + ' variable(s)';
}

// Lire les tags depuis le DOM
function httpBodyReadTags(pfx) {
  const tagsWrap = document.getElementById(pfx + '-body-tags');
  if (!tagsWrap) return [];
  return [...tagsWrap.querySelectorAll('.http-body-tag')].map(tag => ({
    var   : tag.dataset.var   || tag.querySelector('span')?.textContent?.trim() || '',
    alias : tag.querySelector('.http-tag-alias')?.value || tag.dataset.alias || '',
    spread: tag.dataset.spread === '1',
  })).filter(t => t.var);
}

// Construire le body JSON depuis les tags — utilisé à la sauvegarde ET dans le handler
function httpBodyBuildFromTags(tags) {
  if (!tags || !tags.length) return '{}';
  // Construire un template JSON avec des placeholders de variables WFD
  // Les variables seront interpolées par le handler à l'exécution
  const parts = tags.map(t => {
    if (t.spread) {
      // Spread : injecter les clés de l'objet à la racine via un marqueur spécial
      return `"__spread__": "{${t.var}}"`;
    }
    // Valeur simple ou tableau : injecter la variable WFD
    return `"${t.alias}": "{${t.var}}"`;
  });
  return '{\n  ' + parts.join(',\n  ') + '\n}';
}

// ── HTTP Request — changement d'action (mode Action) ────────────────────────
function wfdHttpConnChange(pfx) {
  // Sauvegarder la connexion sélectionnée et rafraîchir le panneau
  if (pfx !== 'cfg') return;
  const connId = document.getElementById(pfx + '-connexion-select')?.value;
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
  setTimeout(() => {
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    const node = flux?.nodes?.find(n => n.id === selectedNodeId);
    if (node && typeof ouvrirConfigPanel === 'function') {
      ouvrirConfigPanel(node);
      setTimeout(() => {
        const sel = document.getElementById(pfx + '-connexion-select');
        if (sel && connId) sel.value = connId;
      }, 0);
    }
  }, 50);
}

// ── Checker — gestion des lignes ──────────────────────────────────────────────
// ── Wait For — gestion des onglets ───────────────────────────────────────────
// ── HTTP Sequence — helpers UI ────────────────────────────────────────────────
function hseqToggleStep(hdr) {
  const body = hdr.nextElementSibling;
  const chev = hdr.querySelector('.ti-chevron-down');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
}

function hseqModeChange(btn, mode) {
  const body   = btn.closest('.hseq-step-body');
  const panelsWrap = body.querySelector('.hseq-mode-panels');
  const panels = panelsWrap ? panelsWrap.querySelectorAll('[class^="hseq-mode-"]') : [];
  panels.forEach(p => { p.style.display = 'none'; });
  const target = body.querySelector('.hseq-mode-' + mode);
  if (target) target.style.display = '';
  body.querySelectorAll('.hseq-mode-btn').forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active-blue-tab', active);
    b.classList.toggle('inactive-tab', !active);
  });
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// Retourne les rôles disponibles pour la connexion actuellement sélectionnée
// sur un nœud http_sequence identifié par son préfixe DOM (pfx). Fallback si
// la connexion n'a pas de roles[] configurés ou si rien n'est encore sélectionné.
function _hseqRolesForPfx(pfx) {
  const fallback = ['director','producer','actor','writer','creator'];
  try {
    const connId = document.getElementById(pfx + '-hseq-conn')?.value;
    const conn    = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).find(c => c.id === connId);
    return (conn?.roles?.length) ? conn.roles : fallback;
  } catch(_) {
    return fallback;
  }
}

function hseqAddStep(pfx) {
  const container = document.getElementById(pfx + '-hseq-steps');
  if (!container) return;
  // Retirer le message vide si présent
  const empty = container.querySelector('.hseq-empty-msg');
  if (empty) empty.remove();
  const n = container.querySelectorAll('.hseq-step').length;
  const div = document.createElement('div');
  div.className = 'hseq-step';
  div.dataset.idx = n;
  div.innerHTML = `
    <div class="hseq-step-hdr" onclick="hseqToggleStep(this)">
      <i class="ti ti-grip-vertical" aria-hidden="true"></i>
      <span class="hseq-step-num">${n+1}</span>
      <span class="hseq-step-name">Nouvelle étape</span>
      <button onclick="hseqRemoveStep(this,event)" class="wfd-hseq-del-btn" title="Supprimer">×</button>
      <i class="ti ti-chevron-down" style="transform:rotate(180deg);" aria-hidden="true"></i>
    </div>
    <div class="hseq-step-body">
      <div class="wfd-hint-sec">Nom de l'étape</div>
      <input class="cfg-input hseq-name wfd-name-input-mb8" placeholder="Ex : Créer le contenu">
      <div class="wfd-hseq-toggle-wrap">
        <button onclick="hseqModeChange(this,'action')"    class="hseq-mode-btn wfd-tab-seg inactive-tab" data-mode="action">Action</button>
        <button onclick="hseqModeChange(this,'simple')"   class="hseq-mode-btn wfd-tab-seg active-blue-tab" data-mode="simple">Requête simple</button>
        <button onclick="hseqModeChange(this,'foreach')"  class="hseq-mode-btn wfd-tab-seg inactive-tab" data-mode="foreach">Pour chaque valeur</button>
        <button onclick="hseqModeChange(this,'verify')"   class="hseq-mode-btn wfd-tab-seg inactive-tab" data-mode="verify">Vérifier</button>
      </div>
      <div class="hseq-mode-panels">
        <div class="hseq-mode-action" style="display:none;">
          <div class="wfd-hseq-hint-italic">Sélectionner une connexion pour voir les actions disponibles.</div>
        </div>
        <div class="hseq-mode-simple">
          <div class="wfd-hseq-grid-100-1fr">
            <div><div class="wfd-hint-sec">Méthode</div>
              <select class="cfg-select hseq-method wfd-fs11"><option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
            <div><div class="wfd-hint-sec">Endpoint</div>
              <input class="cfg-input hseq-endpoint wfd-mono-sm" placeholder="/api/..."></div>
          </div>
          <div class="wfd-hint-sec">Body JSON</div>
          <textarea class="cfg-textarea hseq-body wfd-mono-sm2" rows="3"></textarea>
        </div>
        <div class="hseq-mode-foreach" style="display:none;">
          <div class="wfd-hint-sec">Variable source</div>
          <input class="cfg-input hseq-fe-source wfd-hseq-input-mono-mb6" placeholder="{Realisateur}">
          <div class="wfd-hseq-grid-100-1fr">
            <div><div class="wfd-hint-sec">Méthode</div>
              <select class="cfg-select hseq-method wfd-fs11"><option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
            <div><div class="wfd-hint-sec">Endpoint</div>
              <input class="cfg-input hseq-endpoint wfd-mono-sm" placeholder="/api/..."></div>
          </div>
          <div class="wfd-hseq-grid-1-1">
            <div><div class="wfd-hint-sec">Rôle (job)</div>
              <select class="cfg-select hseq-fe-job wfd-fs11">
                ${(_hseqRolesForPfx(pfx)).map(j => `<option value="${j}">${j}</option>`).join('')}
              </select></div>
            <div><div class="wfd-hint-sec">Codes à ignorer</div>
              <input class="cfg-input hseq-fe-ignore wfd-mono-sm" value="409, 422" placeholder="409, 422"></div>
          </div>
          <textarea class="cfg-textarea hseq-fe-body wfd-mono-sm2" rows="2" placeholder='{"name":"{{nom}}","external_id":"{{slug(nom)}}"}'></textarea>
        </div>
        <div class="hseq-mode-verify" style="display:none;">
          <input class="cfg-input hseq-endpoint wfd-mono-sm" placeholder="/api/...">
        </div>
      </div>
      <div class="wfd-hseq-result-row">
        <span class="wfd-hseq-result-lbl">Résultat →</span>
        <span class="wfd-mono-sec-12">{</span>
        <input class="cfg-input hseq-result-var wfd-hseq-result-var" value="step${n+1}_result">
        <span class="wfd-mono-sec-12">}</span>
        <select class="cfg-select hseq-on-error wfd-hseq-onerror-sel">
          <option value="stop">Arrêter si erreur</option>
          <option value="continue">Continuer si erreur</option>
        </select>
      </div>
    </div>`;
  container.appendChild(div);
  hseqInitDrag(pfx);
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function hseqRemoveStep(btn, evt) {
  if (evt) evt.stopPropagation();
  const step = btn.closest('.hseq-step');
  if (!step) return;
  step.remove();
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// Drag & drop pour réordonner les étapes
function hseqInitDrag(pfx) {
  const container = document.getElementById(pfx + '-hseq-steps');
  if (!container) return;

  container.querySelectorAll('.hseq-step').forEach(function(step) {
    const grip = step.querySelector('.hseq-grip');
    if (!grip) return;
    grip.style.cursor = 'grab';

    grip.addEventListener('mousedown', function(e) {
      e.preventDefault();

      const rect   = step.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      let insertRef = null; // référence pour l'insertion finale

      // Ghost visuel qui suit le curseur
      const ghost = step.cloneNode(true);
      ghost.style.cssText = [
        'position:fixed', 'pointer-events:none', 'opacity:0.75', 'z-index:9999',
        'width:' + rect.width + 'px',
        'left:'  + rect.left  + 'px',
        'top:'   + rect.top   + 'px',
        'border:1px solid #3498db',
        'border-radius:6px',
        'background:var(--color-background-secondary)',
        'box-shadow:0 4px 12px rgba(0,0,0,.3)'
      ].join(';');
      document.body.appendChild(ghost);
      step.style.visibility = 'hidden'; // masquer l'original sans le retirer du flux

      function onMouseMove(ev) {
        // Déplacer le ghost
        ghost.style.top = (ev.clientY - offsetY) + 'px';

        // Trouver où insérer — parcourir toutes les étapes sauf l'originale
        const allSteps = Array.from(container.querySelectorAll('.hseq-step'))
          .filter(function(s) { return s !== step; });

        insertRef = null; // reset
        for (let i = 0; i < allSteps.length; i++) {
          const r = allSteps[i].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            insertRef = allSteps[i]; // insérer avant cette étape
            break;
          }
        }
        // Si insertRef est null → insérer à la fin
      }

      function onMouseUp() {
        // Restaurer la visibilité
        step.style.visibility = '';
        ghost.remove();

        // Effectuer le déplacement
        if (insertRef) {
          container.insertBefore(step, insertRef);
        } else {
          container.appendChild(step);
        }

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// Met à jour méthode/endpoint dans l'en-tête de l'étape (appelé via oninput/onchange)
function hseqUpdateHeader(el) {
  const step = el.closest('.hseq-step');
  if (!step) return;
  const method   = step.querySelector('.hseq-method')?.value   || 'POST';
  const endpoint = step.querySelector('.hseq-endpoint')?.value || '';
  // Mettre à jour le badge méthode et l'endpoint dans l'en-tête
  const spans = step.querySelector('.hseq-step-hdr').querySelectorAll('span');
  // span[0]=numéro, span[1]=nom, span[2]=badge méthode, span[3]=endpoint
  if (spans[2]) spans[2].textContent = method;
  if (spans[3]) spans[3].textContent = endpoint.split('/').slice(-2).join('/') || '—';
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// Lire toutes les étapes depuis le DOM
function hseqReadSteps(pfx) {
  const container = document.getElementById(pfx + '-hseq-steps');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.hseq-step')).map(function(step) {
    const body    = step.querySelector('.hseq-step-body');
    const modeBtn = body?.querySelector('.hseq-mode-btn.active-blue-tab');
    const mode    = modeBtn?.dataset?.mode || 'simple';
    const s = {
      name      : body?.querySelector('.hseq-name')?.value    || '',
      httpMode  : mode,
      method    : body?.querySelector('.hseq-method')?.value   || 'POST',
      endpoint  : body?.querySelector('.hseq-endpoint')?.value || '',
      resultVar : (body?.querySelector('.hseq-result-var')?.value || '').replace(/^\{|\}$/g, ''),
      onError   : body?.querySelector('.hseq-on-error')?.value  || 'stop',
    };
    if (mode === 'action') {
      s.actionId  = body?.querySelector('.hseq-action-id')?.value  || '';
      s.sourceVar = body?.querySelector('.hseq-source-var')?.value || '';
    } else if (mode === 'simple') {
      s.bodyTemplate = body?.querySelector('.hseq-body')?.value || '';
    } else if (mode === 'foreach') {
      s.feSourceVar    = body?.querySelector('.hseq-fe-source')?.value  || '';
      s.feBody         = body?.querySelector('.hseq-fe-body')?.value    || '';
      s.feJob          = body?.querySelector('.hseq-fe-job')?.value     || 'director';
      s.feLocalName    = 'nom';
      s.feCollectField = 'external_id';
      s.feResultVar    = s.resultVar;
      s.feAppend       = body?.querySelector('.hseq-fe-append')?.checked || false;
      const _ic        = body?.querySelector('.hseq-fe-ignore')?.value  || '409, 422';
      s.feIgnoreCodes  = _ic.split(',').map(function(x){ return parseInt(x.trim()); }).filter(Boolean);
    } else if (mode === 'verify') {
      s.verifyPath     = body?.querySelector('.hseq-verify-path')?.value     || 'status';
      s.verifyExpected = body?.querySelector('.hseq-verify-expected')?.value || 'COMPLETED';
    }
    return s;
  });
}

// ── Wait_for Post-action S3 — gestion des mappings ───────────────────────────
function wfS3AddMapping(pfx) {
  const container = document.getElementById(pfx + '-wf-s3-mappings-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.s3-mapping-row').length;
  const row = document.createElement('div');
  row.className = 's3-mapping-row wfd-row-gap6c';
  row.dataset.idx = idx;
  row.innerHTML = `
    <select class="cfg-select s3-map-type wfd-w90-fs10">
      <option value="video">🎬 Vidéo</option>
      <option value="image">🖼 Image</option>
      <option value="subtitle">💬 SRT</option>
      <option value="custom" selected>✏️ Custom</option>
    </select>
    <input class="cfg-input s3-map-filter wfd-flex1-mono10" placeholder="filtre (.ext, _nom…)">
    <span class="wfd-text-shrink-10">→</span>
    <input class="cfg-input s3-map-var wfd-w120-mono" placeholder="nom_variable">
    <button onclick="wfS3RemoveMapping('${pfx}',${idx})"
      class="wfd-del-btn-p2">×</button>`;
  container.appendChild(row);
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function wfS3RemoveMapping(pfx, idx) {
  const container = document.getElementById(pfx + '-wf-s3-mappings-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.s3-mapping-row');
  if (rows.length <= 1) return;
  if (rows[idx]) rows[idx].remove();
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function wfS3ReadMappings(pfx) {
  const container = document.getElementById(pfx + '-wf-s3-mappings-rows');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.s3-mapping-row')).map(function(row) {
    return {
      type:     row.querySelector('.s3-map-type')?.value   || 'custom',
      filter:   row.querySelector('.s3-map-filter')?.value || '',
      variable: row.querySelector('.s3-map-var')?.value    || '',
    };
  }).filter(function(r) { return r.variable; });
}


function awsOpChange(pfx, op) {
  const isArtwork = op === 'artwork_s3';
  const stdFields = document.getElementById(pfx + '-aws-std-fields');
  if (stdFields) stdFields.style.display = isArtwork ? 'none' : '';
  const tabPost = document.getElementById(pfx + '-aws-tab-s3post');
  if (tabPost) tabPost.style.display = isArtwork ? 'none' : '';
  const panelPost = document.getElementById(pfx + '-aws-panel-s3post');
  if (panelPost && isArtwork) panelPost.style.display = 'none';
  const tabArt = document.getElementById(pfx + '-aws-tab-artworks');
  if (tabArt) tabArt.style.display = isArtwork ? '' : 'none';
  if (isArtwork) awsTabSwitch(pfx, 'artworks');
  else awsTabSwitch(pfx, 'operation');
}
function awsTabSwitch(pfx, tab) {
  ['operation','s3post','artworks'].forEach(t => {
    const panel = document.getElementById(pfx + '-aws-panel-' + t);
    const btn   = document.getElementById(pfx + '-aws-tab-'   + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
}

// ── S3 Post Action — gestion des lignes de mapping ────────────────────────────
function awsS3AddMapping(pfx) {
  const container = document.getElementById(pfx + '-s3-mappings-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.s3-mapping-row').length;
  const row = document.createElement('div');
  row.className = 's3-mapping-row wfd-row-gap6c';
  row.dataset.idx = idx;
  row.innerHTML = `
    <select class="cfg-select s3-map-type wfd-w90-fs10">
      <option value="video">🎬 Vidéo</option>
      <option value="image">🖼 Image</option>
      <option value="subtitle">💬 SRT</option>
      <option value="custom" selected>✏️ Custom</option>
    </select>
    <input class="cfg-input s3-map-filter wfd-flex1-mono10" placeholder="filtre (.ext, _nom…)"
      title="Extensions ou fragments de nom séparés par des virgules">
    <span class="wfd-text-shrink-10">→</span>
    <input class="cfg-input s3-map-var wfd-w120-mono" placeholder="nom_variable">
    <button onclick="awsS3RemoveMapping('${pfx}',${idx})"
      class="wfd-del-btn-p2">×</button>`;
  container.appendChild(row);
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function awsS3RemoveMapping(pfx, idx) {
  const container = document.getElementById(pfx + '-s3-mappings-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.s3-mapping-row');
  if (rows.length <= 1) return; // garder au moins une ligne
  if (rows[idx]) rows[idx].remove();
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// Lit les lignes de mapping depuis le DOM → retourne cfg.s3Mappings[]
function awsS3ReadMappings(pfx) {
  const container = document.getElementById(pfx + '-s3-mappings-rows');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.s3-mapping-row')).map(function(row) {
    return {
      type:     row.querySelector('.s3-map-type')?.value   || 'custom',
      filter:   row.querySelector('.s3-map-filter')?.value || '',
      variable: row.querySelector('.s3-map-var')?.value    || '',
    };
  }).filter(function(r) { return r.variable; }); // ignorer les lignes sans variable
}

function wfTabSwitch(pfx, tab) {
  ['polling','s3'].forEach(t => {
    const panel = document.getElementById(pfx + '-wf-panel-' + t);
    const btn   = document.getElementById(pfx + '-wf-tab-'   + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
}

function chkAddRow(pfx) {
  const container = document.getElementById(pfx + '-chk-rows');
  if (!container) return;
  const i = container.querySelectorAll('.chk-row').length;
  const div = document.createElement('div');
  div.className = 'chk-row';
  div.dataset.idx = i;
  div.className = 'chk-row wfd-chk-row-card';
  div.dataset.idx = i;
  div.innerHTML = `
    <div class="wfd-chk-hdr-row">
      <select class="cfg-select chk-method wfd-chk-method-sel">
        <option>GET</option><option>POST</option>
      </select>
      <input class="cfg-input chk-endpoint wfd-flex1-mono10" placeholder="/api/contents/{external_id}">
      <button onclick="chkRemoveRow('${pfx}',${i})" class="wfd-del-btn-p4">×</button>
    </div>
    <div class="wfd-chk-grid-3col">
      <input class="cfg-input chk-path wfd-mono-xs" placeholder="results.amazon.status">
      <select class="cfg-select chk-op">
        <option value="equals">égal à</option>
        <option value="not_equals">différent de</option>
        <option value="not_empty">non vide</option>
        <option value="contains">contient</option>
        <option value="starts_with">commence par</option>
      </select>
      <input class="cfg-input chk-value wfd-mono-xs" placeholder="ready">
    </div>
    <input class="cfg-input chk-label wfd-hint-mt6" placeholder="Label (optionnel)">`;
  container.appendChild(div);
  div.querySelector('button').onclick = () => chkRemoveRow(pfx, i);
}

function chkRemoveRow(pfx, idx) {
  const container = document.getElementById(pfx + '-chk-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.chk-row');
  if (rows[idx]) rows[idx].remove();
  sauvegarderConfig();
}

function chkReadRows(pfx) {
  const container = document.getElementById(pfx + '-chk-rows');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.chk-row')).map(row => ({
    method   : row.querySelector('.chk-method')?.value   || 'GET',
    endpoint : row.querySelector('.chk-endpoint')?.value || '',
    path     : row.querySelector('.chk-path')?.value     || '',
    op       : row.querySelector('.chk-op')?.value       || 'equals',
    value    : row.querySelector('.chk-value')?.value    || '',
    label    : row.querySelector('.chk-label')?.value    || '',
  })).filter(r => r.endpoint);
}

function httpActionChange(pfx) {
  // Sauvegarder l'action sélectionnée et rafraîchir le panneau
  if (pfx !== 'cfg') return;
  const actionId = document.getElementById(pfx + '-http-action-select')?.value;
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
  // Re-render le panneau pour afficher la vue mapping de la nouvelle action
  setTimeout(() => {
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    const node = flux?.nodes?.find(n => n.id === selectedNodeId);
    if (node && typeof ouvrirConfigPanel === 'function') {
      ouvrirConfigPanel(node);
      // Restaurer la sélection de l'action et le mode
      setTimeout(() => {
        const sel = document.getElementById(pfx + '-http-action-select');
        if (sel && actionId) sel.value = actionId;
        // S'assurer qu'on est en mode Action
        const modeBar = document.getElementById(pfx + '-http-modebar');
        if (modeBar) modeBar.dataset.mode = 'action';
        ['action','simple','foreach','verify'].forEach(m => {
          const wrap = document.getElementById(pfx + '-http-' + m);
          if (wrap) wrap.style.display = m === 'action' ? '' : 'none';
        });
      }, 0);
    }
  }, 50);
}

// ── HTTP Request — changement de mode ────────────────────────────────────────
function wfdHttpModeChange(pfx, mode) {
  // Stocker le mode dans le conteneur du mode bar (source de vérité pour sauvegarderConfig)
  const modeBar = document.getElementById(pfx + '-http-modebar');
  if (modeBar) modeBar.dataset.mode = mode;

  ['action','simple','foreach','verify'].forEach(m => {
    const btn  = document.getElementById(pfx + '-httpmode-' + m);
    const wrap = document.getElementById(pfx + '-http-' + m);
    const active = m === mode;
    if (btn) {
      btn.classList.toggle('active-blue', active);
      btn.classList.toggle('inactive-btn', !active);
    }
    if (wrap) wrap.classList.toggle('wfd-hidden', !active);
  });
  // Pas d'appel à sauvegarderConfig ici — le mode est lu depuis data-mode à la sauvegarde
}

// ── HTTP Request foreach — détection depuis le dernier run ───────────────────
function httpForeachDetect(pfx) {
  const resultEl = document.getElementById(pfx + '-fe-detect-result');
  if (!resultEl) return;

  // Lire les vars du dernier snapshot disponible dans l'historique
  try {
    const history = JSON.parse(localStorage.getItem('wfd-run-history') || '{"runs":{},"index":[]}');
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    if (!flux) { resultEl.innerHTML = '<span class="wfd-c-555">Aucun flux sélectionné</span>'; resultEl.classList.remove('wfd-hidden'); return; }

    const lastRunId = (history.index || []).find(id => history.runs[id]?.fluxId === flux.id);
    const lastRun   = lastRunId ? history.runs[lastRunId] : null;
    if (!lastRun) { resultEl.innerHTML = '<span class="wfd-c-555">Aucun run disponible pour ce flux</span>'; resultEl.classList.remove('wfd-hidden'); return; }

    // Trouver les vars qui ressemblent à des crédits (tag cloud multi-valeur)
    // On cherche dans tous les snapshots du run
    const allVars = {};
    (lastRun.nodes || []).forEach(n => {
      const snap = n.snapshot || {};
      Object.assign(allVars, snap.vars || {});
    });

    // Filtrer : valeurs non-vides qui contiennent au moins une lettre et pas de {
    const creditCandidates = Object.entries(allVars).filter(([k, v]) => {
      const s = String(v || '');
      return s.length > 0 && /[A-Za-zÀ-ÿ]/.test(s) && !s.startsWith('{') && !s.startsWith('[');
    });

    if (!creditCandidates.length) {
      resultEl.innerHTML = '<span class="wfd-c-555">Aucune variable détectée dans le dernier run</span>';
      resultEl.classList.remove('wfd-hidden');
      return;
    }

    // Afficher les candidats avec bouton "Utiliser"
    const currentSource = document.getElementById(pfx + '-fe-source-var')?.value || '';
    resultEl.innerHTML = '<div class="wfd-fe-detect-hdr">Variables détectées dans le dernier run :</div>' +
      creditCandidates.slice(0, 10).map(([k, v]) => {
        const isActive = currentSource === '{' + k + '}' || currentSource === k;
        return `<div class="wfd-fe-detect-row">
          <span class="wfd-fe-detect-varname">{${k}}</span>
          <span class="wfd-fe-detect-valpreview">${escHtml(String(v).slice(0, 40))}</span>
          <button onclick="httpForeachUseVar('${pfx}','{${k}}')" class="cfg-btn wfd-fe-detect-btn${isActive?' wfd-fe-detect-active':''}">
            ${isActive ? '✓ Actif' : 'Utiliser'}
          </button>
        </div>`;
      }).join('');
    resultEl.classList.remove('wfd-hidden');
  } catch(e) {
    resultEl.innerHTML = '<span class="wfd-c-red2">Erreur : ' + escHtml(e.message) + '</span>';
    resultEl.classList.remove('wfd-hidden');
  }
}

function httpForeachUseVar(pfx, varName) {
  const inp = document.getElementById(pfx + '-fe-source-var');
  if (inp) {
    inp.value = varName;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  httpForeachDetect(pfx); // Rafraîchir pour mettre à jour le bouton actif
}

// ── HTTP Request foreach — aperçu pré-run ────────────────────────────────────
function httpForeachPreview(pfx) {
  const previewEl = document.getElementById(pfx + '-fe-preview');
  if (!previewEl) return;

  const sourceVar  = (document.getElementById(pfx + '-fe-source-var')?.value || '').replace(/^\{|\}$/g, '');
  const separator  = document.getElementById(pfx + '-fe-separator')?.value  ?? ', ';
  const localName  = document.getElementById(pfx + '-fe-local-name')?.value  || 'nom';
  const bodyTpl    = document.getElementById(pfx + '-fe-body')?.value         || '';
  const endpoint   = document.getElementById(pfx + '-fe-endpoint')?.value     || '';
  const job        = document.getElementById(pfx + '-fe-job')?.value          || 'director';

  // Lire la valeur depuis le dernier run
  let rawVal = '';
  try {
    const history = JSON.parse(localStorage.getItem('wfd-run-history') || '{"runs":{},"index":[]}');
    const flux    = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    if (flux) {
      const lastRunId = (history.index || []).find(id => history.runs[id]?.fluxId === flux.id);
      const lastRun   = lastRunId ? history.runs[lastRunId] : null;
      if (lastRun) {
        (lastRun.nodes || []).forEach(n => {
          const v = (n.snapshot?.vars || {})[sourceVar];
          if (v) rawVal = String(v);
        });
      }
    }
  } catch(e) {}

  if (!rawVal) {
    previewEl.innerHTML = '<span class="wfd-c-555">Aucune valeur disponible — exécutez d\'abord un run avec le nœud Fetch.</span>';
    previewEl.classList.remove('wfd-hidden');
    return;
  }

  const values = rawVal.split(separator).map(v => v.trim()).filter(Boolean);

  // Fonction slug (côté UI — même logique que le handler)
  const slugify = str => (str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const lines = values.map((val, i) => {
    const slug = slugify(val);
    const bodyPreview = bodyTpl
      .replace(/\{\{slug\([^)]+\)\}\}/g, slug)
      .replace(/\{\{index\}\}/g, String(i))
      .replace(/\{\{[^}]+\}\}/g, val)
      .slice(0, 120);
    return `<div class="wfd-fe-prev-row">
      <div class="wfd-fe-prev-val">${escHtml(val)}</div>
      <div class="wfd-c-555-10">slug: ${escHtml(slug)} · job: ${escHtml(job)}</div>
      ${bodyPreview ? `<div class="wfd-fe-prev-body">${escHtml(bodyPreview)}</div>` : ''}
    </div>`;
  });

  previewEl.innerHTML =
    `<div class="wfd-fe-prev-hdr">${values.length} appel(s) prévu(s) → ${escHtml(endpoint)}</div>` +
    lines.join('');
  previewEl.classList.remove('wfd-hidden');
}

(function() {
  var names = ['buildConfigBody','buildCfgFields','fermerConfigPanel','ouvrirConfigPanel',
    'sauvegarderConfig','supprimerNoeudSelectionne','wfdToggleFlux','wfdUpdateToggleBtn',
    'lirePortsScript','_readRelateConfig','_readSubflowConfig','_readExportFileConfig',
    '_readPublishConfig','_readNotifyPostConfig','_readTranscodeConfig',
    '_readAclConfig','_readUpdateMetaConfig','_readLinkFileConfig',
    '_getActiveFluxes','_saveActiveFluxes',
    'wfdFetchSubType','wfdFetchSourceChange','wfdFetchOptionsChange',
    'wfdActionTypeChange','wfdMetaOp','wfdUmAddRow',
    'wfdListenerSimToggle','wfdTriggerSimToggle','wfdTriggerSimLoadTemplate',
    'svAddRow','svRemoveRow','svReadAssignments',
    'wfdFetchAddTag','wfdFetchRemoveTag','wfdFetchReadTags',
    'wfdSlugUpdate',
    'httpAjouterHeader',
    'wfdRefreshSavedSearches','wfdRefreshList'];
  names.forEach(function(n){try{var f=eval(n);if(typeof f==='function')window[n]=f;}catch(e){}});
})();

// ══════════════════════════════════════════════════════════════════════════════
// Recherche APS — fonctions utilitaires (sr*)

async function srChargerSearch(pfx, id) {
  if (!id) return;
  try {
    const r = await fetch('/api/aps-search/' + id);
    const s = await r.json();
    if (!s.config) return;
    const cfg = s.config;
    // Injecter la config dans le nœud courant
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    const node = flux && selectedNodeId ? flux.nodes.find(n => n.id === selectedNodeId) : null;
    if (!node) return;
    node.config.blocks      = cfg.blocks || [];
    node.config.expression  = cfg.expression || '';
    node.config.returnBlock = cfg.returnBlock || 1;
    node.config.limit       = cfg.limit || 500;
    srRerender(pfx, node.config.blocks);
    // Mettre à jour les champs expression/limit
    const exprEl = document.getElementById(pfx + '-sr-expression');
    if (exprEl) exprEl.value = cfg.expression || '';
    const limEl = document.getElementById(pfx + '-sr-limit');
    if (limEl) limEl.value = cfg.limit || 500;
    const retEl = document.getElementById(pfx + '-sr-return-block');
    if (retEl) setTimeout(() => { retEl.value = cfg.returnBlock || 1; }, 150);
    if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
    console.log('[WFD] Search chargée :', s.name);
  } catch(e) {
    console.warn('[WFD] Erreur chargement search:', e);
  }
}
// ══════════════════════════════════════════════════════════════════════════════

function srReadBlocks(pfx) {
  const container = document.getElementById(pfx + '-sr-blocks');
  if (!container) return [];
  const blocks = [];
  container.querySelectorAll('.sr-block').forEach((blockEl, bidx) => {
    const id        = bidx + 1;
    const objectType = blockEl.querySelector('.sr-obj-type')?.value || 'asset';
    const parentSel  = blockEl.querySelector('.sr-parent');
    const parentBlock = parentSel ? (parseInt(parentSel.value) || null) : null;
    const criteria   = [];
    blockEl.querySelectorAll('.sr-crit-row').forEach((critEl, cidx) => {
      const field = critEl.querySelector('.sr-crit-field')?.value || '';
      const isCol = field === '__collection__';
      const op = isCol
        ? (critEl.querySelector('.sr-crit-col-op')?.checked !== false ? 'in_branch' : 'in_collection')
        : (critEl.querySelector('.sr-crit-op')?.value || 'equals');
      let val = '';
      if (isCol) {
        const colPrefix = pfx + '-sr-col-' + bidx + '-' + cidx;
        const hiddenSel = document.getElementById(colPrefix + '-col-selected');
        if (hiddenSel) {
          // Stocker le tableau JSON complet pour la multi-sélection
          val = hiddenSel.value || '[]';
        } else {
          val = critEl.querySelector('.sr-crit-val')?.value || '[]';
        }
      } else {
        val = critEl.querySelector('.sr-crit-val')?.value || '';
      }
      criteria.push({
        field,
        op,
        value : val,
        join  : critEl.querySelector('.cfg-btn')?.textContent?.trim() || (cidx > 0 ? 'AND' : ''),
      });
    });
    blocks.push({ id, objectType, parentBlock, criteria });
  });
  return blocks;
}

function srAddBlock(pfx) {
  const blocks = srReadBlocks(pfx);
  const newId  = (blocks.length ? Math.max(...blocks.map(b => b.id)) : 0) + 1;
  blocks.push({ id: newId, objectType: 'asset', parentBlock: null, criteria: [] });
  srRerender(pfx, blocks);
  srAutoSave(pfx);
}

function srRemoveBlock(pfx, bidx) {
  const blocks = srReadBlocks(pfx);
  blocks.splice(bidx, 1);
  // Renumber
  blocks.forEach((b, i) => { b.id = i + 1; });
  srRerender(pfx, blocks);
  srAutoSave(pfx);
}

function srAddCrit(pfx, bidx) {
  const blocks = srReadBlocks(pfx);
  if (!blocks[bidx]) return;
  blocks[bidx].criteria.push({ field: 'title', op: 'is_not_empty', value: '', join: 'AND' });
  srRerender(pfx, blocks);
  srAutoSave(pfx);
}

function srRemoveCrit(pfx, bidx, cidx) {
  const blocks = srReadBlocks(pfx);
  if (!blocks[bidx]) return;
  blocks[bidx].criteria.splice(cidx, 1);
  srRerender(pfx, blocks);
  srAutoSave(pfx);
}

function srToggleJoin(pfx, bidx, cidx) {
  const blocks = srReadBlocks(pfx);
  if (!blocks[bidx] || !blocks[bidx].criteria[cidx]) return;
  const cur = blocks[bidx].criteria[cidx].join || 'AND';
  blocks[bidx].criteria[cidx].join = cur === 'AND' ? 'OR' : 'AND';
  srRerender(pfx, blocks);
  srAutoSave(pfx);
}

function srFieldChange(pfx, bidx, cidx, val) {
  // Si on bascule vers/depuis collection browse, il faut rerendrer
  if (val === '__collection__' || val !== '__collection__') {
    const blocks = srReadBlocks(pfx);
    if (blocks[bidx] && blocks[bidx].criteria[cidx]) {
      blocks[bidx].criteria[cidx].field = val;
      if (val === '__collection__') {
        blocks[bidx].criteria[cidx].op    = 'in_branch';
        blocks[bidx].criteria[cidx].value = '';
      }
    }
    srRerender(pfx, blocks);
  }
  srAutoSave(pfx);
}

function srOpChange(pfx, bidx, cidx, op, prevOp) {
  const noVal = ['is_empty','is_not_empty','is_true','is_false'].includes(op);
  const isBetween  = op === 'between';
  const wasBetween = prevOp === 'between';

  const container = document.getElementById(pfx + '-sr-blocks');
  if (!container) return;
  const blockEls = container.querySelectorAll('.sr-block');
  if (!blockEls[bidx]) return;
  const rows = blockEls[bidx].querySelectorAll('.sr-crit-row');
  if (!rows[cidx]) return;
  const row = rows[cidx];

  if (isBetween || wasBetween) {
    // Pour between : reconstruire uniquement le champ valeur dans la row
    const blocks = srReadBlocks(pfx);
    if (!blocks[bidx] || !blocks[bidx].criteria[cidx]) return;
    blocks[bidx].criteria[cidx].op = op;
    const crit = blocks[bidx].criteria[cidx];
    const SYS = [{name:'date_created',type:'date'},{name:'date_modified',type:'date'}];
    const _srMd = (typeof wfdData !== 'undefined' ? wfdData.metadata : []) || [];
    const ALL = [...SYS, ..._srMd.map(m=>({name:m.name||m.nom||'',type:m.field_type||'string'}))];
    const fd = ALL.find(f => f.name === crit.field);
    // Supprimer anciens éléments valeur
    row.querySelectorAll('.sr-crit-val, .sr-crit-val-from, .sr-crit-val-to, .sr-between-arrow').forEach(el => el.remove());
    // Insérer nouveaux avant le bouton ×
    const delBtn = row.querySelector('button:last-child');
    const tmp = document.createElement('div');
    tmp.innerHTML = srBuildValInput(fd, crit, pfx, bidx, cidx);
    while (tmp.firstChild) row.insertBefore(tmp.firstChild, delBtn);
    // Mettre à jour la config sans sauvegarderConfig
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    const node = flux && selectedNodeId ? flux.nodes.find(n => n.id === selectedNodeId) : null;
    if (node) node.config.blocks = blocks;
  } else {
    // Simple afficher/masquer — pas de reconstruction
    const valEl = row.querySelector('.sr-crit-val');
    if (valEl) valEl.style.display = noVal ? 'none' : '';
    // Mettre à jour la config sans sauvegarderConfig
    const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    const node = flux && selectedNodeId ? flux.nodes.find(n => n.id === selectedNodeId) : null;
    if (node) {
      const blocks = srReadBlocks(pfx);
      if (blocks[bidx] && blocks[bidx].criteria[cidx]) blocks[bidx].criteria[cidx].op = op;
      node.config.blocks = blocks;
    }
  }
}

function srAutoSave(pfx) {
  if (pfx !== 'cfg') return;
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node = flux && selectedNodeId ? flux.nodes.find(n => n.id === selectedNodeId) : null;
  if (!node || node.family !== 'aps_search') {
    // Autres familles — comportement normal
    if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
    return;
  }
  // aps_search — mise à jour silencieuse sans renderCanvas
  node.config.blocks      = srReadBlocks(pfx);
  node.config.expression  = document.getElementById(pfx+'-sr-expression')?.value?.trim() || '';
  node.config.returnBlock = parseInt(document.getElementById(pfx+'-sr-return-block')?.value) || 1;
  node.config.limit       = parseInt(document.getElementById(pfx+'-sr-limit')?.value) || 500;
  node.config.resultVar   = document.getElementById(pfx+'-sr-result-var')?.value?.trim() || 'search_results';
  // Persister vers le serveur sans déclencher renderCanvas
  if (typeof _sauvegarderEtatVersServeur === 'function') _sauvegarderEtatVersServeur();
}

function srRerender(pfx, blocks) {
  // Mettre à jour la config du nœud et rouvrir le panel proprement via ouvrirConfigPanel
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node = flux && selectedNodeId ? flux.nodes.find(n => n.id === selectedNodeId) : null;
  if (!node) return;
  node.config.blocks = blocks;
  // Rouvrir le panel — utilise buildCfgFields qui produit le bon HTML
  if (typeof ouvrirConfigPanel === 'function') ouvrirConfigPanel(node);
}


