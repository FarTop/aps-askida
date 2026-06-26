// ══ WFD LOGGER ════════════════════════════════════════════════════════════════
// Système de log structuré pour le Workflow Designer
// Accessible via bouton toolbar → modale

const WFDLog = (() => {
  const MAX_ENTRIES = 500;
  let _entries = [];
  let _paused   = false;

  const LEVELS = { INFO:'INFO', WARN:'WARN', ERROR:'ERROR', DEBUG:'DEBUG', SAVE:'SAVE', RENDER:'RENDER', EVENT:'EVENT' };
  const COLORS = {
    INFO   : '#3498db',
    WARN   : '#f39c12',
    ERROR  : '#e74c3c',
    DEBUG  : '#666',
    SAVE   : '#2ecc71',
    RENDER : '#9b59b6',
    EVENT  : '#1abc9c',
  };

  function _ts() {
    const d = new Date();
    return d.getHours().toString().padStart(2,'0') + ':'
         + d.getMinutes().toString().padStart(2,'0') + ':'
         + d.getSeconds().toString().padStart(2,'0') + '.'
         + d.getMilliseconds().toString().padStart(3,'0');
  }

  function log(level, category, message, data) {
    if (_paused) return;
    const entry = {
      ts      : _ts(),
      level   : level || 'INFO',
      category: category || '',
      message : message || '',
      data    : data || null,
      id      : Date.now() + '-' + Math.random().toString(36).slice(2,6),
    };
    _entries.unshift(entry); // plus récent en premier
    if (_entries.length > MAX_ENTRIES) _entries.pop();

    // Aussi dans DevTools
    const prefix = `[WFD:${level}] [${category}] ${message}`;
    if (level === 'ERROR') console.error(prefix, data||'');
    else if (level === 'WARN') console.warn(prefix, data||'');
    else console.log(prefix, data||'');

    _refreshModal();
  }

  // Raccourcis
  const info   = (cat, msg, d) => log('INFO',   cat, msg, d);
  const warn   = (cat, msg, d) => log('WARN',   cat, msg, d);
  const error  = (cat, msg, d) => log('ERROR',  cat, msg, d);
  const debug  = (cat, msg, d) => log('DEBUG',  cat, msg, d);
  const save   = (cat, msg, d) => log('SAVE',   cat, msg, d);
  const render = (cat, msg, d) => log('RENDER', cat, msg, d);
  const event  = (cat, msg, d) => log('EVENT',  cat, msg, d);

  // ── Affichage modale ───────────────────────────────────────────────────────
  let _filterLevel = 'ALL';
  let _filterText  = '';

  function _refreshModal() {
    // Peupler le panel latéral intégré (toujours présent dans le DOM)
    const panelBody = document.getElementById('wfd-logs-body');
    if (panelBody) _renderEntries(panelBody);
    // Peupler aussi la modale standalone si elle est ouverte
    const modalBody = document.getElementById('wfd-log-body');
    if (modalBody) _renderEntries(modalBody);
    // Mettre à jour le compteur dans le header du panel
    _updateCounters();
  }

  function _updateCounters() {
    const el = document.getElementById('wfd-logs-counters');
    if (!el) return;
    const errors  = _entries.filter(e => e.level === 'ERROR').length;
    const warns   = _entries.filter(e => e.level === 'WARN').length;
    const total   = _entries.length;
    el.innerHTML =
      (errors ? `<span style="color:#e74c3c;font-size:10px;font-family:var(--font-mono);">${errors} ERR</span>` : '') +
      (warns  ? `<span style="color:#f39c12;font-size:10px;font-family:var(--font-mono);margin-left:6px;">${warns} WARN</span>` : '') +
      `<span style="color:#333;font-size:10px;font-family:var(--font-mono);margin-left:6px;">${total}</span>`;
  }

  function _renderEntries(body) {
    const filtered = _entries.filter(e => {
      if (_filterLevel !== 'ALL' && e.level !== _filterLevel) return false;
      if (_filterText) {
        const q = _filterText.toLowerCase();
        return e.message.toLowerCase().includes(q)
            || e.category.toLowerCase().includes(q)
            || (e.data && JSON.stringify(e.data).toLowerCase().includes(q));
      }
      return true;
    });

    body.innerHTML = filtered.length === 0
      ? '<div style="color:#444;font-size:11px;padding:20px;text-align:center;">Aucun log</div>'
      : filtered.map(e => {
          const color = COLORS[e.level] || '#aaa';
          const dataStr = e.data ? JSON.stringify(e.data, null, 0) : '';
          const dataShort = dataStr.length > 120 ? dataStr.slice(0,120)+'…' : dataStr;
          return `<div class="wfd-log-entry" data-id="${e.id}"
            style="border-left:3px solid ${color};padding:4px 8px 4px 10px;
              margin-bottom:2px;background:#0a0a0a;border-radius:0 3px 3px 0;
              cursor:${e.data?'pointer':'default'};"
            ${e.data ? `onclick="WFDLog.toggleDetail('${e.id}')"` : ''}>
            <div style="display:flex;gap:8px;align-items:baseline;">
              <span style="font-size:9px;color:#444;font-family:var(--font-mono);flex-shrink:0;">${e.ts}</span>
              <span style="font-size:9px;font-weight:700;color:${color};flex-shrink:0;">${e.level}</span>
              <span style="font-size:10px;color:#888;flex-shrink:0;">[${e.category}]</span>
              <span style="font-size:11px;color:#ccc;flex:1;">${escHtml(e.message)}</span>
              ${e.data ? '<span style="font-size:9px;color:#444;">▶</span>' : ''}
            </div>
            ${dataShort ? `<div style="font-size:9px;color:#555;font-family:var(--font-mono);
              padding-left:0;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escHtml(dataShort)}</div>` : ''}
            <div id="wfd-log-detail-${e.id}" style="display:none;margin-top:4px;
              background:#111;border-radius:3px;padding:6px;font-family:var(--font-mono);
              font-size:9px;color:#888;white-space:pre-wrap;word-break:break-all;">
              ${e.data ? escHtml(JSON.stringify(e.data, null, 2)) : ''}
            </div>
          </div>`;
        }).join('');
  }

  function toggleDetail(id) {
    const el = document.getElementById('wfd-log-detail-' + id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  function ouvrir() {
    let modal = document.getElementById('wfd-log-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wfd-log-modal';
      modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9500;
        display:flex;align-items:center;justify-content:center;`;
      modal.innerHTML = `
        <div style="width:860px;max-width:95vw;height:80vh;background:#0d0d0d;
          border:1px solid #2a2a2a;border-radius:8px;display:flex;flex-direction:column;min-height:0;">
          <!-- Header -->
          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
            border-bottom:1px solid #1e1e1e;flex-shrink:0;">
            <span style="font-size:13px;font-weight:700;color:#fff;">🪵 Journal WFD</span>
            <span id="wfd-log-count" style="font-size:10px;color:#555;"></span>
            <div style="flex:1;"></div>
            <!-- Filtres niveau -->
            ${['ALL','INFO','SAVE','EVENT','WARN','ERROR','DEBUG','RENDER'].map(l => `
              <button onclick="WFDLog.setFilter('${l}')" id="wfd-log-f-${l}"
                style="font-size:9px;padding:3px 7px;border-radius:3px;border:1px solid #2a2a2a;
                  background:${l==='ALL'?'#2a2a2a':'transparent'};
                  color:${COLORS[l]||'#aaa'};cursor:pointer;font-family:var(--font-mono);">${l}</button>
            `).join('')}
            <!-- Recherche -->
            <input id="wfd-log-search" placeholder="Filtrer…"
              style="background:#111;border:1px solid #2a2a2a;border-radius:3px;
                color:#ccc;font-size:10px;padding:3px 8px;outline:none;width:120px;"
              oninput="WFDLog.setSearch(this.value)">
            <!-- Actions -->
            <button onclick="WFDLog.clear()"
              style="font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid #2a2a2a;
                background:transparent;color:#e74c3c;cursor:pointer;">Vider</button>
            <button onclick="WFDLog.export()"
              style="font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid #2a2a2a;
                background:transparent;color:#3498db;cursor:pointer;">Export</button>
            <button onclick="WFDLog.togglePause()" id="wfd-log-pause"
              style="font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid #2a2a2a;
                background:transparent;color:#f39c12;cursor:pointer;">⏸ Pause</button>
            <button onclick="WFDLog.fermer()"
              style="font-size:18px;line-height:1;background:none;border:none;color:#555;cursor:pointer;">×</button>
          </div>
          <!-- Body -->
          <div id="wfd-log-body" style="flex:1;min-height:0;overflow-y:auto;padding:8px;"></div>
          <!-- Footer -->
          <div style="padding:8px 16px;border-top:1px solid #1a1a1a;font-size:9px;color:#333;
            font-family:var(--font-mono);flex-shrink:0;">
            Cliquer sur une entrée avec ▶ pour voir les données complètes
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) fermer(); });
    } else {
      modal.style.display = 'flex';
    }
    _updateCount();
    _renderEntries(document.getElementById('wfd-log-body'));
  }

  function fermer() {
    const modal = document.getElementById('wfd-log-modal');
    if (modal) modal.style.display = 'none';
  }

  function setFilter(level) {
    _filterLevel = level;
    document.querySelectorAll('[id^="wfd-log-f-"]').forEach(btn => {
      btn.style.background = btn.id === 'wfd-log-f-'+level ? '#2a2a2a' : 'transparent';
    });
    _refreshModal();
  }

  function setSearch(q) {
    _filterText = q;
    _refreshModal();
  }

  function clear() {
    _entries = [];
    _refreshModal();
    _updateCount();
  }

  function togglePause() {
    _paused = !_paused;
    const btn = document.getElementById('wfd-log-pause');
    if (btn) btn.textContent = _paused ? '▶ Reprendre' : '⏸ Pause';
  }

  function exportLogs() {
    const blob = new Blob([JSON.stringify(_entries, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wfd-logs-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json';
    a.click();
  }

  function _updateCount() {
    const el = document.getElementById('wfd-log-count');
    if (el) el.textContent = _entries.length + ' entrées';
  }

  return { log, info, warn, error, debug, save, render, event,
           ouvrir, fermer, toggleDetail,
           setFilter, filtrer: setFilter,          // alias pour wfdLogFilter()
           setSearch,
           clear, effacer: clear,                   // alias HTML
           togglePause,
           export: exportLogs, exporter: exportLogs, // alias HTML
           get entries() { return _entries; } };
})();
