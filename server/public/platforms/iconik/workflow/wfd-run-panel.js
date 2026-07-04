// ================================================================
// wfd-run-panel.js — Inspecteur de runs WFD
//
// Trois onglets :
//   ASSETS  — liste des assets du nœud suspendu + actions de release
//   ACTION  — vue lisible du nœud sélectionné dans la timeline
//   DEBUG   — données techniques brutes pour le technicien
//
// Peut être ouvert sur :
//   - un nœud suspendu (mode actif — release/reject disponibles)
//   - un nœud quelconque d'un run actif ou terminé (mode lecture)
//   - depuis le panel Jobs (job live ou historique)
// ================================================================

'use strict';

// ════════════════════════════════════════════════════════════════
// État du panel
// ════════════════════════════════════════════════════════════════

const _rp = window._rp = {
  visible    : false,
  activeTab  : 'assets',   // 'assets' | 'action' | 'debug'
  // Run actif dans le panel
  runId      : null,
  fluxId     : null,
  fluxName   : null,
  // Nœud sélectionné dans la timeline
  nodeId     : null,
  nodeRecord : null,       // record du nœud sélectionné
  // Données de pause (si nœud suspendu)
  ports      : [],
  assets     : [],
  selected   : new Set(),
  timeoutMs  : null,
  timeoutTimer: null,
  // Historique complet du run (depuis RunHistory)
  runRecord  : null,
};

// ════════════════════════════════════════════════════════════════
// Ouverture / fermeture
// ════════════════════════════════════════════════════════════════

// Point d'entrée principal — depuis double-clic nœud, panel Jobs, event node:paused
async function wfdRunPanelOpen(runId, nodeId, opts = {}) {
  const panel   = document.getElementById('wfd-run-panel');
  const empty   = document.getElementById('wfd-run-panel-empty');
  const content = document.getElementById('wfd-run-panel-content');
  if (!panel) return;

  // Réinitialiser l'état
  _rp.visible   = true;
  _rp.runId     = runId;
  _rp.nodeId    = nodeId;
  _rp.ports     = opts.ports     || [];
  _rp.assets    = opts.assets    ? [...opts.assets] : [];
  _rp.timeoutMs = opts.timeoutMs || null;
  _rp.selected  = new Set();
  clearTimeout(_rp.timeoutTimer);

  // Charger l'historique du run depuis le service
  await _rpLoadRunRecord(runId);

  // Sélectionner le nœud dans la timeline si fourni
  if (nodeId && _rp.runRecord) {
    _rp.nodeRecord = _rp.runRecord.nodes?.find(n => n.nodeId === nodeId) || null;
  }

  // Afficher — le CSS utilise transform via classe .open
  panel.classList.add('open');
  empty.style.display   = 'none';
  content.style.display = 'flex';

  // Header
  _rpRenderHeader();

  // Onglet par défaut selon le contexte
  const hasPause = _rp.ports.length > 0;
  _rpSwitchTab(hasPause ? 'assets' : 'action');
}

function wfdRunPanelClose() {
  const panel = document.getElementById('wfd-run-panel');
  if (panel) panel.classList.remove('open');
  _rp.visible = false;
  clearTimeout(_rp.timeoutTimer);
}

// Charger le RunRecord depuis l'historique IPC
async function _rpLoadRunRecord(runId) {
  try {
    const engine = window.WfdEngineInstance || window.wfdEngine;
    if (!engine?.getRunHistory) return;
    const record = await engine.getRunHistory(runId);
    _rp.runRecord = record || null;
    if (_rp.runRecord) {
      _rp.fluxName = _rp.runRecord.fluxName || runId;
    }
  } catch(e) {
    _rp.runRecord = null;
  }
}

// ════════════════════════════════════════════════════════════════
// Navigation onglets
// ════════════════════════════════════════════════════════════════

function wfdRunPanelTab(tab) {
  _rpSwitchTab(tab);
}

function _rpSwitchTab(tab) {
  _rp.activeTab = tab;
  const tabs = ['assets', 'action', 'debug'];
  tabs.forEach(t => {
    const btn  = document.getElementById('wfd-rp-tab-' + t);
    const pane = document.getElementById('wfd-rp-pane-' + t);
    if (!btn || !pane) return;
    const active = t === tab;
    btn.classList.toggle('active', active);
    pane.style.display = active ? 'flex' : 'none';
  });
  // Rendre le contenu de l'onglet actif
  if (tab === 'assets')  _rpRenderAssets();
  if (tab === 'action')  _rpRenderAction();
  if (tab === 'debug')   _rpRenderDebug();
}

// ════════════════════════════════════════════════════════════════
// Header
// ════════════════════════════════════════════════════════════════

function _rpRenderHeader() {
  const el = document.getElementById('wfd-rp-header-info');
  if (!el) return;
  const runLabel  = _rp.runId ? _rp.runId.slice(-8) : '—';
  // Chercher le nom du flux dans les flux chargés si disponible
  const fluxName  = _rp.fluxName || _rp.runRecord?.fluxName || _rp.fluxId || '—';
  // Chercher le nom du nœud actif
  const nodeName  = _rp.nodeRecord?.nodeName || (_rp.nodeId ? _rp.nodeId.slice(-8) : '');
  const fluxLabel = nodeName ? fluxName + ' — ' + nodeName : fluxName;
  const status    = _rp.runRecord?.status || 'running';
  const statusColor = { running:'#e67e22', success:'#27ae60', failed:'#e74c3c', partial:'#f39c12' }[status] || '#888';
  el.innerHTML =
    '<span style="color:' + statusColor + ';font-size:10px;margin-right:8px;">●</span>' +
    '<span style="color:#ccc;font-weight:600;font-size:11px;">' + _rpEsc(fluxLabel) + '</span>' +
    '<span style="color:#444;font-family:var(--font-mono);font-size:9px;margin-left:8px;">' + runLabel + '</span>';
}

// ════════════════════════════════════════════════════════════════
// Onglet ASSETS — assets du nœud suspendu + release
// ════════════════════════════════════════════════════════════════

function _rpRenderAssets() {
  const listEl    = document.getElementById('wfd-rp-assets-list');
  const actionsEl = document.getElementById('wfd-rp-assets-actions');
  const selEl     = document.getElementById('wfd-rp-sel-info');
  const bulkEl    = document.getElementById('wfd-rp-bulk-btns');
  if (!listEl) return;

  const assets = _rp.assets;
  const ports  = _rp.ports;
  const isPaused = ports.length > 0;

  // Timeout
  _rpRenderTimeout();

  // Liste assets
  if (!assets.length) {
    listEl.innerHTML = '<div style="color:#444;font-size:12px;text-align:center;padding:32px 16px;">' +
      (isPaused ? 'Aucun asset en attente' : 'Aucun asset pour ce nœud') + '</div>';
  } else {
    listEl.innerHTML = assets.map((asset, i) => {
      const sel = _rp.selected.has(i);
      return '<div class="wfd-run-asset-row' + (sel ? ' selected' : '') + '" onclick="wfdRpAssetToggle(' + i + ')">' +
        '<div class="wfd-run-asset-check">' + (sel ? '☑' : '☐') + '</div>' +
        '<div class="wfd-run-asset-info">' +
          '<div class="wfd-run-asset-title">' + _rpEsc(asset.title || asset.id || '—') + '</div>' +
          (asset.id && asset.id !== asset.title ? '<div class="wfd-run-asset-id">' + _rpEsc(asset.id) + '</div>' : '') +
        '</div>' +
        (isPaused ? '<div class="wfd-run-asset-btns">' +
          ports.map((p, pi) =>
            '<button class="wfd-run-port-btn" style="border-color:' + (p.color||'#888') + ';color:' + (p.color||'#888') + ';" ' +
            'onclick="event.stopPropagation();wfdRpReleaseOne(' + i + ',' + pi + ')">' + _rpEsc(p.label||'Port '+pi) + '</button>'
          ).join('') +
        '</div>' : '') +
        '</div>';
    }).join('');
  }

  // Actions bulk
  if (actionsEl) actionsEl.style.display = isPaused ? 'block' : 'none';
  if (isPaused && bulkEl && selEl) {
    _rpUpdateSelInfo();
    bulkEl.innerHTML = ports.map((p, pi) =>
      '<button class="wfd-run-bulk-btn" style="border-color:' + (p.color||'#888') + ';color:' + (p.color||'#888') + ';" ' +
      'onclick="wfdRpReleaseBulk(' + pi + ')">' +
      _rpEsc(p.label||'Port '+pi) +
      ' <span id="wfd-rp-bulk-count-' + pi + '"></span>' +
      '</button>'
    ).join('') +
    '<button class="wfd-run-bulk-btn" style="border-color:#555;color:#555;" onclick="wfdRpReject()">✕ Annuler</button>';
    _rpUpdateBulkCounts();
  }
}

function _rpRenderTimeout() {
  const el = document.getElementById('wfd-rp-timeout');
  if (!el) return;
  clearTimeout(_rp.timeoutTimer);
  if (!_rp.timeoutMs) { el.style.display = 'none'; return; }
  // Calculer le temps restant depuis la date de pause
  const pausedAt = _rp.runRecord?.nodes?.find(n => n.nodeId === _rp.nodeId)?.pausedAt;
  if (!pausedAt) { el.style.display = 'none'; return; }
  const elapsed = Date.now() - new Date(pausedAt).getTime();
  const remaining = _rp.timeoutMs - elapsed;
  if (remaining <= 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  el.textContent = '⏱ Reprise automatique dans ' + mins + 'm ' + secs + 's';
  _rp.timeoutTimer = setTimeout(_rpRenderTimeout, 1000);
}

// ── Toggle / select ──────────────────────────────────────────────

function wfdRpAssetToggle(idx) {
  if (_rp.selected.has(idx)) _rp.selected.delete(idx);
  else _rp.selected.add(idx);
  _rpRenderAssets();
}

function wfdRpSelectAll() {
  if (_rp.selected.size === _rp.assets.length) _rp.selected.clear();
  else _rp.assets.forEach((_, i) => _rp.selected.add(i));
  _rpRenderAssets();
}

function _rpUpdateSelInfo() {
  const el = document.getElementById('wfd-rp-sel-info');
  if (!el) return;
  const n = _rp.selected.size;
  el.textContent = n ? n + ' sélectionné(s)' : 'Aucune sélection';
}

function _rpUpdateBulkCounts() {
  const n = _rp.selected.size || _rp.assets.length;
  _rp.ports.forEach((_, pi) => {
    const el = document.getElementById('wfd-rp-bulk-count-' + pi);
    if (el) el.textContent = '(' + n + ')';
  });
}

// ── Release individuel ───────────────────────────────────────────

async function wfdRpReleaseOne(assetIdx, portIdx) {
  const asset  = _rp.assets[assetIdx];
  const port   = _rp.ports[portIdx];
  if (!asset || !port) return;
  const engine = window.WfdEngineInstance || window.wfdEngine;
  await engine?.releaseNode?.(_rp.runId, _rp.nodeId, portIdx, [asset.id]);
  _rp.assets.splice(assetIdx, 1);
  _rp.selected = new Set(Array.from(_rp.selected).filter(i => i !== assetIdx).map(i => i > assetIdx ? i-1 : i));
  _wfdUpdateBadgeCount?.(_rp.nodeId, _rp.assets.length);
  _rpRenderAssets();
}

// ── Release bulk ────────────────────────────────────────────────

async function wfdRpReleaseBulk(portIdx) {
  const engine = window.WfdEngineInstance || window.wfdEngine;
  const hasSel = _rp.selected.size > 0;
  const indices = hasSel
    ? Array.from(_rp.selected).sort((a,b) => b-a)
    : _rp.assets.map((_,i) => i).reverse();
  const assetIds = hasSel
    ? Array.from(_rp.selected).map(i => _rp.assets[i]?.id).filter(Boolean)
    : null;
  await engine?.releaseNode?.(_rp.runId, _rp.nodeId, portIdx, assetIds);
  indices.forEach(i => _rp.assets.splice(i, 1));
  _rp.selected.clear();
  _wfdUpdateBadgeCount?.(_rp.nodeId, _rp.assets.length);
  if (!_rp.assets.length) wfdRunPanelClose();
  else _rpRenderAssets();
}

// ── Reject (annuler le run) ──────────────────────────────────────

async function wfdRpReject() {
  if (!confirm('Annuler ce run ?\nLes nœuds suspendus seront rejetés.')) return;
  const engine = window.WfdEngineInstance || window.wfdEngine;
  await engine?.rejectNode?.(_rp.runId, _rp.nodeId, 'Annulé par opérateur');
  wfdRunPanelClose();
}

// ════════════════════════════════════════════════════════════════
// Onglet ACTION — timeline du run + vue lisible du nœud sélectionné
// ════════════════════════════════════════════════════════════════

function _rpRenderAction() {
  const detailEl = document.getElementById('wfd-rp-action-detail');
  if (!detailEl) return;

  if (!_rp.nodeRecord) {
    detailEl.innerHTML = '<div style="color:#444;font-size:11px;padding:32px 16px;text-align:center;">Double-cliquez sur un nœud<br>pour voir ce qu\'il a produit</div>';
    return;
  }

  detailEl.innerHTML = _rpRenderNodeDetail(_rp.nodeRecord);
}



// ── Vue lisible d'un nœud selon sa famille ───────────────────────
function _rpRenderNodeDetail(node) {
  const snap    = node.snapshot || {};
  const results = snap.results  || {};
  const vars    = snap.vars     || {};

  let html = '<div class="wfd-rp-detail">';

  // ── Header nœud ───────────────────────────────────────────────
  const statusColor = _rpStatusColor(node.status);
  const statusLabel = _rpStatusLabel(node.status);
  html +=
    '<div class="wfd-rp-detail-header" style="border-left:3px solid ' + statusColor + ';">' +
    '<span class="wfd-rp-detail-name">' + _rpEsc(node.nodeName || node.nodeId) + '</span>' +
    '<span class="wfd-rp-detail-status" style="color:' + statusColor + ';">' + statusLabel + '</span>' +
    '</div>';

  // ── Contenu selon la famille ───────────────────────────────────
  switch (node.nodeFamily) {

    case 'fetch': {
      // ── Résultat principal ────────────────────────────────────────────────
      // On cherche dans tous les résultats non-internes :
      //   - résultat asset  : a { id, title, status, ... }
      //   - résultat metadata-only (fetchSubType='metadata') : { date_created, date_modified, metadata_values }
      const mainKey = Object.keys(results).find(k =>
        !k.startsWith('_') && !k.endsWith('_keyframes') && !k.endsWith('_formats')
      );
      const mainVal = mainKey ? results[mainKey] : null;

      // Chercher un résultat metadata séparé (ex: varName + '_metadata')
      const mdKey = Object.keys(results).find(k => !k.startsWith('_') && k.endsWith('_metadata'));
      // mdVal : résultat _metadata explicite OU mainVal lui-même s'il contient metadata_values
      const mdVal = mdKey ? results[mdKey]
                  : (mainVal?.metadata_values ? mainVal : null);

      if (mainVal && typeof mainVal === 'object') {
        // Titre : dans l'objet asset ou dans les vars (non présent en mode metadata-only)
        const title   = mainVal.title || mainVal.original_name || mainVal.name
                     || vars.title    || vars.asset_title || '';
        const status  = mainVal.analyze_status || mainVal.status || '';
        const assetId = mainVal.id || vars.asset_id || '';
        // Durée depuis l'asset ou depuis withFormats
        const durMs   = mainVal.duration_milliseconds;
        const durSec  = vars.duration ? parseInt(vars.duration) : null;
        const duration = durMs ? _rpFormatDuration(durMs)
                       : durSec ? _rpFormatDuration(durSec * 1000) : '';

        let rows = '';
        if (title)    rows += _rpKv('Titre',  title);
        if (assetId)  rows += _rpKv('ID',     assetId);
        if (status)   rows += _rpKv('Statut', status);
        if (duration) rows += _rpKv('Durée',  duration);
        // En mode metadata-only l'objet n'a pas de title/id → ne pas afficher la section vide
        if (rows) {
          html += _rpSection('Asset récupéré', rows);
        }
      } else {
        // Pas de résultat asset : afficher au moins l'ID depuis les vars
        const assetId = vars.asset_id || '';
        if (assetId) {
          html += _rpSection('Asset récupéré', _rpKv('ID', assetId));
        }
      }

      // ── Métadonnées chargées ──────────────────────────────────────────────
      // Couvre : withMetadata (varName_metadata) ET fetchSubType='metadata' (mainVal direct)
      if (mdVal && typeof mdVal === 'object') {
        const mvObj  = mdVal.metadata_values || {};
        const mvKeys = Object.keys(mvObj).filter(k => !k.startsWith('_') && k !== '__separator__');
        let rows = '';
        mvKeys.forEach(k => {
          const fvs = mvObj[k]?.field_values || [];
          const val = fvs.map(fv => fv.value).filter(Boolean).join(', ');
          if (val) rows += _rpKv(k, val.slice(0, 100));
        });
        if (rows) {
          html += _rpSection(
            'Métadonnées chargées (' + mvKeys.length + ')',
            rows +
            '<div style="text-align:right;margin-top:4px;">' +
            '<span style="color:#444;font-size:9px;">Variables disponibles via {NomDuChamp}</span>' +
            '</div>'
          );
        }
      }

      // ── Dérivations techniques (withFormats) ─────────────────────────────
      // Affiche chaque variable avec sa source brute Iconik et la transformation appliquée
      // Format : source [valeur brute] → variable = valeur finale
      const _derivations = [
        // [ varFinale, labelFinal, formatFinal, varSource, labelSource, formatSource ]
        // duration : ms → secondes
        ['duration', 'duration', v => v + ' s',
         'duration_ms', 'GENERAL.duration', v => v + ' ms'],
        // video_quality : width → SD/HD/UHD
        ['video_quality', 'video_quality', null,
         'width', 'max(VIDEO.width, VIDEO.height)', v => v + ' px → ' + (parseInt(v) >= 3840 ? 'UHD' : parseInt(v) >= 1280 ? 'HD' : 'SD')],
        // Passthroughs directs (source = variable = valeur brute Iconik)
        ['container',    'container',    null, null, 'GENERAL.format',                   null],
        ['fps',          'fps',          v => v + ' fps', null, 'GENERAL.frame_rate',    null],
        ['width',        'width',        v => v + ' px',  null, 'VIDEO.width',            null],
        ['height',       'height',       v => v + ' px',  null, 'VIDEO.height',           null],
        ['video_codec',  'video_codec',  null, null, 'VIDEO.codecs_video',               null],
        ['chroma',       'chroma',       null, null, 'VIDEO.chroma_subsampling',         null],
        ['bit_depth',    'bit_depth',    v => v + ' bits', null, 'VIDEO.bit_depth',       null],
        ['audio_tracks', 'audio_tracks', null, null, 'GENERAL/AUDIO.count_of_audio_streams', null],
        ['audio_codec',  'audio_codec',  null, null, 'GENERAL/AUDIO.audio_codecs',       null],
        ['bitrate',      'bitrate',      null, null, 'GENERAL.overall_bit_rate',         null],
        ['file_size',    'file_size',    null, null, 'GENERAL.file_size',                null],
      ];

      const _techRows = _derivations
        .filter(([k]) => vars[k] !== undefined && vars[k] !== '')
        .map(([varFinal, labelFinal, fmtFinal, varSrc, labelSrc, fmtSrc]) => {
          const finalVal = fmtFinal ? fmtFinal(vars[varFinal]) : vars[varFinal];
          // Source brute disponible (ex: duration_ms) ou label Iconik seul
          let srcPart = '';
          if (varSrc && vars[varSrc] !== undefined) {
            const srcVal = fmtSrc ? fmtSrc(vars[varSrc]) : vars[varSrc];
            srcPart = '<span style="color:#555;font-size:9px;">' + _rpEsc(labelSrc) +
                      ' [' + _rpEsc(String(srcVal).slice(0, 30)) + '] → </span>';
          } else if (labelSrc) {
            srcPart = '<span style="color:#444;font-size:9px;">' + _rpEsc(labelSrc) + ' → </span>';
          }
          return '<div class="wfd-rp-kv" style="border-bottom:1px solid #111;">' +
            '<span style="color:#7ec8e3;font-family:var(--font-mono);">' + _rpEsc(labelFinal) + '</span>' +
            '<span>' + srcPart + '<span style="color:#e8c97a;">' + _rpEsc(String(finalVal)) + '</span></span>' +
            '</div>';
        });

      if (_techRows.length) {
        html += _rpSection('Dérivations techniques (' + _techRows.length + ')', _techRows.join(''));
      }

      if (!mainVal && !mdVal && !_techRows.length) {
        html += _rpSection('Résultat', '<div class="wfd-rp-empty">Aucune donnée chargée</div>');
      }
      break;
    }

    case 'gate':
    case 'control': {
      const pauseKey  = Object.keys(results).find(k => k.startsWith('_gate_pause'));
      const pauseData = pauseKey ? results[pauseKey] : null;
      const msg       = pauseData?.message || node.error || '';

      if (node.status === 'paused') {
        html +=
          '<div class="wfd-rp-pause-msg">' +
          '<div style="font-size:20px;margin-bottom:8px;">⏸</div>' +
          '<div style="color:#ccc;font-size:12px;font-weight:600;margin-bottom:4px;">' + _rpEsc(msg || 'En attente') + '</div>' +
          '<div style="color:#555;font-size:10px;">' + (node.assets?.length || 0) + ' asset(s) en attente de décision</div>' +
          '</div>';
      } else if (pauseData?.resumedAt) {
        html += _rpSection('Décision prise',
          _rpKv('Validé le', new Date(pauseData.resumedAt).toLocaleString('fr-FR')) +
          _rpKv('Motif',     pauseData.reason || 'Validation manuelle')
        );
      } else {
        html += _rpSection('Contrôle', _rpKv('Message', msg || '—'));
      }
      break;
    }

    case 'lookup': {
      // Les résultats Fetch connus — on les exclut pour trouver le résultat du mapping
      const _fetchKeys = new Set(
        Object.keys(results).filter(k =>
          k.endsWith('_metadata') || k.endsWith('_keyframes') || k.endsWith('_formats') ||
          k.startsWith('_gate') || k.startsWith('search_')
        )
      );
      // Identifier les sources Fetch (ex: vodFactoryContents)
      Object.keys(results).forEach(k => {
        const v = results[k];
        if (v && typeof v === 'object' && (v.analyze_status !== undefined || v.metadata_values !== undefined || v.objects !== undefined)) {
          _fetchKeys.add(k);
        }
      });

      // Le résultat du mapping = premier résultat qui n'est pas un résultat Fetch
      const mappingKey = Object.keys(results).find(k => !_fetchKeys.has(k) && !k.startsWith('_'));
      let mapping = mappingKey ? results[mappingKey] : null;

      // Fallback : chercher dans les vars (JSON string)
      if (!mapping) {
        for (const [k, v] of Object.entries(vars)) {
          if (typeof v === 'string' && v.startsWith('{') && v.includes('":')) {
            try {
              const parsed = JSON.parse(v);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                mapping = parsed;
                break;
              }
            } catch(_) {}
          }
        }
      }

      // ── Résumé du mapping ────────────────────────────────────────────────────
      // Source 1 : _lk_meta_* dans le snapshot (stocké par le handler à l'exécution)
      // Source 2 : node.nodeConfig.lkRows (config du nœud, peut être absent sur runs anciens)
      const _lkMetaKey = Object.keys(results).find(k => k.startsWith('_lk_meta_'));
      const _lkMeta    = _lkMetaKey ? results[_lkMetaKey] : null;

      // Construire la liste de rows depuis la meilleure source disponible
      const _lkRowsSrc = _lkMeta?.rows?.length
        ? _lkMeta.rows  // depuis le snapshot (toujours à jour, valeurs résolues incluses)
        : (node.nodeConfig?.lkRows || []).map(row => ({
            fromKey  : row.key   || row.from || '',
            toKey    : row.value || row.to   || '',
            children : (row.children || []).map(c => ({
              key  : (c.key || c.src || '').trim(),
              value: (c.value || c.tgt || '').trim(),
            })),
            srcVal: vars[row.key || row.from || ''] != null
              ? String(vars[row.key || row.from || '']).slice(0, 40)
              : null,
          }));

      if (_lkRowsSrc.length) {
        const mappingRows = _lkRowsSrc.map(row => {
          const fromKey  = row.fromKey || row.key   || row.from || '';
          const toKey    = row.toKey   || row.value || row.to   || '';
          const children = row.children || [];
          const srcVal   = row.srcVal != null ? row.srcVal : null;
          if (!fromKey || !toKey) return '';

          // Traduction appliquée (si une sous-ligne a matché)
          let translationNote = '';
          if (children.length && srcVal) {
            const matched = children.find(c => (c.key || c.src || '').trim() === srcVal);
            if (matched) {
              const tgtVal = (matched.value || matched.tgt || '').trim();
              translationNote = ' <span style="color:#555;font-size:9px;">(' + _rpEsc(srcVal) + ' → ' + _rpEsc(tgtVal) + ')</span>';
            }
          }
          const srcHint = srcVal && !translationNote
            ? ' <span style="color:#555;font-size:9px;">[' + _rpEsc(srcVal.slice(0, 30)) + ']</span>'
            : '';

          return '<div class="wfd-rp-kv" style="border-bottom:1px solid #111;">' +
            '<span style="color:#7ec8e3;">' + _rpEsc(fromKey) + srcHint + '</span>' +
            '<span style="color:#5dbb6b;">→ ' + _rpEsc(toKey) + translationNote + '</span>' +
            '</div>';
        }).filter(Boolean).join('');

        if (mappingRows) {
          html += _rpSection('Mapping appliqué (' + _lkRowsSrc.length + ' règles)', mappingRows);
        }
      }

      // ── Champs mappés (résultat produit par le nœud) ─────────────────────────
      if (mapping && typeof mapping === 'object') {
        const entries = Object.entries(mapping).filter(([, v]) => v !== null && v !== '');
        html += _rpSection(
          'Champs mappés (' + entries.length + ')',
          entries.map(([k, v]) =>
            '<div class="wfd-rp-kv" style="border-bottom:1px solid #111;">' +
            '<span style="color:#888;">' + _rpEsc(k) + '</span>' +
            '<span style="color:#e8c97a;">' + _rpEsc(String(v).slice(0, 80)) + '</span>' +
            '</div>'
          ).join('')
        );
      } else {
        // Mode valeur simple — afficher entrée/sortie
        const lkOutputVar = node.nodeConfig?.lkOutputVar || node.config?.lkOutputVar || '_lookup_result';
        const outVal = vars[lkOutputVar] || '—';
        html += _rpSection('Correspondance', _rpKv('→ Résultat', outVal));
      }
      break;
    }

    case 'set_var': {
      const assignments = (node.nodeConfig?.assignments || []).slice(0, 10);
      if (assignments.length) {
        html += _rpSection('Variables définies',
          assignments.map(a =>
            _rpKv(a.key || '?', vars[a.key] !== undefined ? String(vars[a.key]).slice(0,100) : '(non résolu)')
          ).join('')
        );
      }
      break;
    }

    case 'http_request': {
      // Afficher le mode et l'endpoint dans le header
      const _httpCfg  = node.nodeConfig || {};
      const _httpMode = _httpCfg.httpMode || 'simple';
      const _modeLabels = { action: 'Action', simple: 'Requête simple', foreach: 'Pour chaque valeur', verify: 'Vérifier' };
      const _modeLabel = _modeLabels[_httpMode] || _httpMode;
      const _endpoint  = _httpCfg.endpoint || (_httpCfg.actionId ? '→ action' : '');
      html += '<div style="font-size:10px;color:#3498db;font-family:var(--font-mono);' +
        'padding:4px 8px;background:#080d14;border-radius:3px;margin-bottom:8px;display:inline-block;">' +
        '⚡ ' + _modeLabel +
        (_endpoint ? ' <span style="color:#555;">· ' + _rpEsc(_endpoint) + '</span>' : '') +
        '</div>';

      // Chercher d'abord la clé spécifique au nœud, fallback sur _http_last global
      const _httpNodeId = node.nodeId || '';
      const req = results['_http_last_' + _httpNodeId] || results['_http_last'] || {};
      if (req.mode === 'foreach') {
        // Mode foreach — afficher chaque appel
        const callRows = (req.calls || []).map(c => {
          const ok = c.status < 300 || c.ignored;
          const color = ok ? '#2ecc71' : '#e74c3c';
          const icon  = ok ? '✅' : '❌';
          return '<div class="wfd-rp-kv" style="align-items:flex-start;">' +
            '<span style="font-family:var(--font-mono);color:#aaa;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _rpEsc(c.val) + '">' + _rpEsc(c.val) + '</span>' +
            '<span style="color:' + color + ';font-family:var(--font-mono);">' + icon + ' ' + c.status +
            (c.external_id ? ' <span style="color:#555;font-size:10px;">→ ' + _rpEsc(String(c.external_id)) + '</span>' : '') +
            (c.ignored ? ' <span style="color:#f39c12;font-size:9px;">ignoré</span>' : '') +
            '</span></div>';
        }).join('');
        const errRows = (req.errDetails || []).map(e =>
          '<div class="wfd-rp-kv"><span style="color:#e74c3c;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _rpEsc(e.val||'') + '</span>' +
          '<span style="color:#e74c3c;font-size:10px;">' + _rpEsc(e.error||String(e.status||'')) + '</span></div>'
        ).join('');
        html += _rpSection(
          req.method + ' ' + req.endpoint + ' — ' + req.success + '/' + req.total + ' ✅' + (req.errors ? ' ' + req.errors + ' ❌' : ''),
          callRows + errRows || '<div style="color:#555;font-size:11px;">Aucun appel effectué</div>'
        );
      } else if (req.mode === 'simple' || req.status) {
        // Mode simple/action — afficher le résultat
        const ok    = req.ok !== false && req.status < 300;
        const color = ok ? '#2ecc71' : '#e74c3c';
        const icon  = ok ? '✅' : '❌';
        html += _rpSection(req.method + ' ' + req.endpoint,
          '<div class="wfd-rp-kv">' +
          '<span style="color:#aaa;">Statut</span>' +
          '<span style="color:' + color + ';font-weight:600;font-family:var(--font-mono);">' + icon + ' ' + req.status + '</span>' +
          '</div>' +
          (req.body ? '<div class="wfd-rp-kv" style="align-items:flex-start;"><span style="color:#aaa;">Réponse</span><span style="font-family:var(--font-mono);font-size:10px;color:#888;word-break:break-all;">' + _rpEsc(req.body) + '</span></div>' : '')
        );
      } else {
        html += '<div class="wfd-rp-empty">HTTP Request — résultat non disponible</div>';
      }
      break;
    }

    case 'trigger':
    case 'manual': {
      // Infos sur le déclenchement
      const trig = snap._triggerInfo;
      if (trig) {
        html += _rpSection('Déclenchement',
          _rpKv('Asset',     trig.assetId  || '—') +
          _rpKv('Vue MD',    trig.viewId   || '—') +
          _rpKv('Identifié', trig.isManual ? 'Test manuel' : 'Iconik Custom Action') +
          _rpKv('Auth',      trig.hasAuth  ? '✅ Présente' : '⚠ Absente')
        );
      }
      break;
    }

    case 'id_generator': {
      const ig = results._id_generator;
      if (ig) {
        const typeLabels = {
          numeric: 'Numérique', uuid: 'UUID v4', hex: 'Hexadécimal',
          alphanumeric: 'Alphanumérique', prefixed: 'Préfixé', timestamp: 'Timestamp',
        };
        html += _rpSection('ID généré',
          _rpKv('Type', typeLabels[ig.type] || ig.type) +
          '<div class="wfd-rp-kv" style="border-top:1px solid #1a1a1a;margin-top:4px;padding-top:4px;">' +
          '<span style="color:#aaa;">Valeur</span>' +
          '<span style="color:#1abc9c;font-family:var(--font-mono);font-weight:600;font-size:13px;">' + _rpEsc(String(ig.id)) + '</span>' +
          '</div>' +
          _rpKv('Variable', '{' + ig.varName + '}')
        );
      } else {
        html += '<div class="wfd-rp-empty">ID généré — résultat non disponible</div>';
      }
      break;
    }

    case 'decision': {
      const d = results._decision;
      if (d) {
        const DECISION_OPS_FR = {
          equals: 'est égal à', not_equals: 'est différent de',
          is_empty: 'est vide', not_empty: "n'est pas vide",
          contains: 'contient', not_contains: 'ne contient pas',
          starts_with: 'commence par', ends_with: 'se termine par',
          gt: 'est supérieur à', gte: 'est supérieur ou égal à',
          lt: 'est inférieur à', lte: 'est inférieur ou égal à',
          default: 'aucune condition remplie',
        };
        const opLabel = DECISION_OPS_FR[d.matchedOp] || d.matchedOp;
        const condLine = d.matchedOp === 'default'
          ? opLabel
          : opLabel + (d.matchedValue ? ' <strong>' + _rpEsc(String(d.matchedValue)) + '</strong>' : '');
        html += _rpSection('Évaluation',
          _rpKv('Variable', d.field) +
          _rpKv('Valeur', d.actual != null ? String(d.actual) : '(vide)') +
          '<div class="wfd-rp-kv"><span>Condition</span><span>' + condLine + '</span></div>' +
          '<div class="wfd-rp-kv" style="border-top:1px solid #1a1a1a;margin-top:4px;padding-top:4px;">' +
          '<span style="color:#aaa;">Port emprunté</span>' +
          '<span style="color:#2ecc71;font-weight:600;">→ ' + _rpEsc(d.matchedLabel) + '</span>' +
          '</div>'
        );
      } else {
        html += '<div class="wfd-rp-empty">Décision exécutée — résultat non disponible</div>';
      }
      break;
    }

    default: {
      // Vue générique — variables modifiées par ce nœud
      const pubVars = Object.entries(vars).filter(([k]) => !k.startsWith('_'));
      if (pubVars.length) {
        html += _rpSection('Résultat',
          pubVars.map(([k, v]) => _rpKv(k, String(v).slice(0, 100))).join('')
        );
      } else if (node.summary) {
        html += '<div class="wfd-rp-detail-summary">' + _rpEsc(node.summary) + '</div>';
      } else {
        html += '<div class="wfd-rp-empty">Nœud exécuté — aucun résultat à afficher</div>';
      }
    }
  }

  // Erreur si présente
  if (node.error) {
    html +=
      '<div class="wfd-rp-error-block">' +
      '<div style="font-size:10px;font-weight:600;color:#e74c3c;margin-bottom:4px;">⚠ Problème rencontré</div>' +
      '<div style="font-size:10px;color:#e74c3c;">' + _rpEsc(node.error) + '</div>' +
      '</div>';
  }

  html += '</div>';
  return html;
}

// ── Helpers lisibles ──────────────────────────────────────────────
function _rpKv(label, value) {
  return '<div class="wfd-rp-kv"><span>' + _rpEsc(label) + '</span><span>' + _rpEsc(String(value||'—')) + '</span></div>';
}

function _rpFormatDuration(ms) {
  if (!ms) return '';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  if (m > 0) return m + 'm ' + String(s).padStart(2,'0') + 's';
  return s + 's';
}


// ── Rendu d'un résultat Fetch de façon lisible ───────────────────
function _rpResultCard(key, val) {
  if (!val || typeof val !== 'object') {
    return '<div class="wfd-rp-kv"><span>' + _rpEsc(key) + '</span><span>' + _rpEsc(String(val||'—')) + '</span></div>';
  }
  // Asset Iconik — champs lisibles
  const title    = val.title    || val.original_name || '';
  const status   = val.analyze_status || val.status || '';
  const created  = val.date_created ? new Date(val.date_created).toLocaleDateString('fr-FR') : '';
  // Metadata view
  const mdValues = val.metadata_values || {};
  const mdKeys   = Object.keys(mdValues);

  let html = '<div class="wfd-rp-result-card">';
  if (title)   html += '<div class="wfd-rp-result-title">' + _rpEsc(title) + '</div>';
  if (status)  html += '<div class="wfd-rp-kv"><span>Statut</span><span>' + _rpEsc(status) + '</span></div>';
  if (created) html += '<div class="wfd-rp-kv"><span>Créé le</span><span>' + created + '</span></div>';
  if (mdKeys.length) {
    html += '<div class="wfd-rp-kv" style="cursor:pointer;" onclick="wfdRpToggle(\'md-' + key + '\')">' +
      '<span>Métadonnées</span><span>' + mdKeys.length + ' champ(s) ▶</span></div>';
    html += '<div id="wfd-rp-md-' + key + '" style="display:none;">';
    mdKeys.forEach(k => {
      const fieldValues = mdValues[k]?.field_values || [];
      const displayVal  = fieldValues.map(fv => fv.value).filter(Boolean).join(', ') || '—';
      html += '<div class="wfd-rp-kv wfd-rp-kv-indent"><span>' + _rpEsc(k) + '</span><span>' + _rpEsc(String(displayVal).slice(0,100)) + '</span></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function wfdRpToggle(id) {
  const el = document.getElementById('wfd-rp-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ════════════════════════════════════════════════════════════════
// Onglet DEBUG — données brutes pour le technicien
// ════════════════════════════════════════════════════════════════

function _rpRenderDebug() {
  const el = document.getElementById('wfd-rp-pane-debug');
  if (!el) return;

  const snap = _rp.nodeRecord?.snapshot || {};
  const vars    = snap.vars    || {};
  const results = snap.results || {};
  const errors  = snap.errors  || [];
  const trig    = snap._triggerInfo || null;

  let html = '';

  // Run info
  html += _rpDbgSection('Run', [
    ['runId',   _rp.runId],
    ['fluxId',  _rp.runRecord?.fluxId],
    ['status',  _rp.runRecord?.status],
    ['démarré', _rp.runRecord?.startedAt],
    ['terminé', _rp.runRecord?.endedAt || '—'],
  ]);

  // Nœud sélectionné
  if (_rp.nodeRecord) {
    html += _rpDbgSection('Nœud sélectionné', [
      ['nodeId',  _rp.nodeRecord.nodeId],
      ['famille', _rp.nodeRecord.nodeFamily],
      ['statut',  _rp.nodeRecord.status],
      ['port',    _rp.nodeRecord.port ?? '—'],
      ['erreur',  _rp.nodeRecord.error || '—'],
    ]);
  }

  // Variables (toutes, y compris _)
  const allVars = Object.entries(vars);
  if (allVars.length) {
    html += _rpDbgSection('Variables (' + allVars.length + ')',
      allVars.map(([k, v]) => [k, String(v).slice(0, 150)])
    );
  }

  // Trigger info
  if (trig) {
    html += _rpDbgSection('Payload déclencheur', [
      ['isManual',  trig.isManual],
      ['hasAuth',   trig.hasAuth],
      ['assetId',   trig.assetId  || '—'],
      ['viewId',    trig.viewId   || '—'],
      ['rawKeys',   (trig.rawPayloadKeys||[]).join(', ')],
    ]);
  }

  // Résultats bruts
  const resKeys = Object.keys(results);
  if (resKeys.length) {
    html += '<div class="wfd-rp-dbg-section">';
    html += '<div class="wfd-rp-dbg-title">Résultats bruts (' + resKeys.length + ')</div>';
    resKeys.forEach(k => {
      const id  = 'dbg-res-' + k.replace(/[^a-z0-9]/gi, '_');
      const val = JSON.stringify(results[k], null, 0).slice(0, 500);
      html += '<div style="margin-bottom:4px;">' +
        '<div class="wfd-rp-dbg-key" style="cursor:pointer;" onclick="wfdRpToggle(\'' + id + '\')">' +
        '▶ ' + _rpEsc(k) + '</div>' +
        '<pre id="wfd-rp-' + id + '" class="wfd-rp-dbg-pre" style="display:none;">' + _rpEsc(val) + '</pre>' +
        '</div>';
    });
    html += '</div>';
  }

  // Erreurs
  if (errors.length) {
    html += '<div class="wfd-rp-dbg-section">';
    html += '<div class="wfd-rp-dbg-title">Erreurs / Avertissements</div>';
    errors.forEach(e => {
      html += '<div class="wfd-rp-dbg-error ' + (e.severity==='fatal'?'fatal':'warn') + '">' +
        '[' + _rpEsc(e.node||'') + '] ' + _rpEsc(e.message||'') + '</div>';
    });
    html += '</div>';
  }

  el.innerHTML = html || '<div style="color:#444;font-size:11px;padding:16px;text-align:center;">Aucune donnée debug disponible</div>';
}

// ════════════════════════════════════════════════════════════════
// Helpers de rendu
// ════════════════════════════════════════════════════════════════

function _rpSection(title, bodyHtml) {
  return '<div class="wfd-rp-section">' +
    '<div class="wfd-rp-section-title">' + title + '</div>' +
    '<div class="wfd-rp-section-body">' + bodyHtml + '</div>' +
    '</div>';
}

function _rpDbgSection(title, rows) {
  return '<div class="wfd-rp-dbg-section">' +
    '<div class="wfd-rp-dbg-title">' + title.toUpperCase() + '</div>' +
    rows.map(([k, v]) =>
      '<div class="wfd-rp-dbg-row">' +
      '<span class="wfd-rp-dbg-key">' + _rpEsc(String(k)) + '</span>' +
      '<span class="wfd-rp-dbg-val">' + _rpEsc(String(v ?? '—').slice(0, 200)) + '</span>' +
      '</div>'
    ).join('') +
    '</div>';
}

function _rpNodeIcon(status) {
  return { done:'✅', warn:'⚠️', error:'❌', paused:'⏸', running:'⏳', skipped:'⤵', resumed:'▶' }[status] || '○';
}

function _rpStatusColor(status) {
  return { done:'#27ae60', warn:'#f39c12', error:'#e74c3c', paused:'#e67e22', running:'#3498db', skipped:'#555', resumed:'#27ae60' }[status] || '#555';
}

function _rpStatusLabel(status) {
  return { done:'Terminé', warn:'Avertissement', error:'Erreur', paused:'En attente', running:'En cours', skipped:'Ignoré', resumed:'Repris' }[status] || status;
}

function _rpEsc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════════════════
// Event engine → mise à jour live du panel
// ════════════════════════════════════════════════════════════════

function wfdRunPanelHandleEvent(type, data) {
  if (!_rp.visible) return;
  if (data.runId && data.runId !== _rp.runId) return;

  switch(type) {
    case 'node:paused':
      // Mise à jour des assets si le nœud affiché est celui qui vient de se suspendre
      if (data.nodeId === _rp.nodeId) {
        _rp.ports  = data.ports  || [];
        _rp.assets = data.assets ? [...data.assets] : [];
        if (_rp.activeTab === 'assets') _rpRenderAssets();
      }
      break;
    case 'node:done':
    case 'node:error':
    case 'end':
    case 'flux:end':
      // Recharger l'historique pour mettre à jour la timeline
      _rpLoadRunRecord(_rp.runId).then(() => {
        _rpRenderHeader();
        if (_rp.activeTab === 'action') _rpRenderAction();
        if (_rp.activeTab === 'debug')  _rpRenderDebug();
      });
      break;
  }
}

// ════════════════════════════════════════════════════════════════
// Rétrocompatibilité — ancienne API utilisée depuis le designer
// ════════════════════════════════════════════════════════════════

// Wrapper pour les call sites existants dans script-workflow-designer.js
function wfdRunPanelOpenLegacy(runId, nodeId, ports, assets, timeoutMs, ctxSnapshot) {
  wfdRunPanelOpen(runId, nodeId, { ports, assets, timeoutMs, ctxSnapshot });
}

// Exposer globalement
if (typeof window !== 'undefined') {
  window.wfdRunPanelOpen       = wfdRunPanelOpen;
  window.wfdRunPanelOpenLegacy = wfdRunPanelOpenLegacy;
  window.wfdRunPanelClose      = wfdRunPanelClose;
  window.wfdRunPanelTab        = wfdRunPanelTab;
  window.wfdRpAssetToggle      = wfdRpAssetToggle;
  window.wfdRpSelectAll        = wfdRpSelectAll;
  window.wfdRpReleaseOne       = wfdRpReleaseOne;
  window.wfdRpReleaseBulk      = wfdRpReleaseBulk;
  window.wfdRpReject           = wfdRpReject;
  window.wfdRpToggle           = wfdRpToggle;
  window.wfdRunPanelHandleEvent= wfdRunPanelHandleEvent;
  // Rétrocompatibilité
  window.wfdRunTab             = (tab) => wfdRunPanelTab(tab);
}
