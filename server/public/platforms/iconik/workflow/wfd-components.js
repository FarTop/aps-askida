/**
 * wfd-components.js — Templates HTML réutilisables APS Workflow Designer
 * Principe : le JS appelle un template, le CSS gère l'apparence.
 * Aucun style inline ici sauf les valeurs calculées (positions, custom properties).
 */

const WfdComponents = (() => {

  // ── Nœud canvas ─────────────────────────────────────────────────────────

  function node(nodeData, fam, isSelected, isReadOnly, detail, ports) {
    if (nodeData.family === 'postit') return postit(nodeData, isSelected);
    const classes = [
      'wfd-node',
      isSelected  ? 'selected'          : '',
      isReadOnly  ? 'wfd-node-readonly'  : '',
      nodeData.draft ? 'wfd-node-draft'  : '',
    ].filter(Boolean).join(' ');
    return `<div id="wfd-node-${nodeData.id}" class="${classes}"
      style="left:${nodeData.x}px;top:${nodeData.y}px;--node-color:${fam.color};">
      ${nodeHeader(nodeData, fam, detail)}
      ${detail.body ? nodeBody(detail.body) : ''}
      ${nodePorts(ports, fam)}
    </div>`;
  }

  function nodeHeader(nodeData, fam, detail) {
    return `<div class="wfd-node-header">
      <span class="wfd-node-icon">${fam.icon}</span>
      <div class="wfd-flex1-min0">
        <div class="wfd-node-name">${escHtml(nodeData.name)}${nodeData.draft ? ' <span class="wfd-draft-badge">⚙ à configurer</span>' : ''}</div>
        <div class="wfd-node-family">${escHtml(fam.label)}${detail.sub ? ' · ' + escHtml(detail.sub) : ''}</div>
      </div>
    </div>`;
  }

  function nodeBody(content) {
    return `<div class="wfd-node-body"><div class="wfd-node-detail">${content}</div></div>`;
  }

  function nodePorts(ports, fam) {
    const portH = Math.max(ports.outputs.length, ports.inputs.length || 1) * 22 + 12;
    return `<div class="wfd-node-ports" style="height:${portH}px;position:relative;">
      ${ports.inputs.map((p, i) => port(p, 'in', i, fam.color)).join('')}
      ${ports.outputs.map((p, i) => port(p, 'out', i, p.color || fam.color)).join('')}
    </div>`;
  }

  function port(portData, type, idx, color) {
    return `<div class="wfd-port port-${type}"
      style="top:${14 + idx * 22}px;--port-color:${color};"
      data-port-type="${type}" data-port-idx="${idx}"
      title="${escHtml(portData.label)}">
      <span class="wfd-port-label">${escHtml(portData.label)}</span>
    </div>`;
  }

  function postit(nodeData, isSelected) {
    const col = nodeData.config?.color || '#f1c40f';
    return `<div id="wfd-node-${nodeData.id}"
      class="wfd-node wfd-postit${isSelected ? ' selected' : ''}"
      style="left:${nodeData.x}px;top:${nodeData.y}px;--postit-color:${col};${nodeData.draft ? 'border-style:dashed;' : ''}">
      <div class="wfd-postit-body">📝 ${escHtml(nodeData.config?.text || nodeData.name || 'Note')}</div>
    </div>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (typeof str !== 'string') return str ?? '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── API publique ─────────────────────────────────────────────────────────

  return { node, nodeHeader, nodeBody, nodePorts, port, postit, escHtml };

})();
