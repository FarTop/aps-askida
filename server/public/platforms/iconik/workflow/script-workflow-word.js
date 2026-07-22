// WFD — script-workflow-word.js — modifié le 2026-06-14 21:02
// Chemins relatifs depuis app/frontend/public/platforms/iconik/workflow/
const _ASKIDA_LOGO_HEADER_PATH = '../../../_shared/assets/Logo_header_black.png';
const _ASKIDA_LOGO_FOOTER_PATH = '../../../_shared/assets/Logo_footer_black.png';

// ── Flowchart SVG → PNG → ImageRun ───────────────────────────
// Génère le schéma du flux comme image PNG embarquée dans le Word.
// Async car la conversion SVG→canvas→PNG est asynchrone.
async function buildFlowchartDocx(flux, docxLib) {
  const { Paragraph, ImageRun } = docxLib;

  const rawNodes = (flux.nodes || []).filter(n => n.family !== 'postit');
  const conns    = flux.connections || [];
  if (!rawNodes.length) return [];

  // ── 1. Grouper les nœuds HTTP consécutifs (même connexion) ──
  const nodes = _groupConsecutiveHttp(rawNodes, conns);

  // ── 2. Layout BFS → niveaux ──────────────────────────────────
  const { levels, rows, maxRow } = _bfsLevels(nodes, conns);

  // ── 3. Dimensions SVG ────────────────────────────────────────
  const NODE_W  = 480;
  const NODE_H  = 58;
  const GAP_Y   = 44;   // espace vertical entre nœuds (flèche)
  const MARGIN  = 80;
  const SVG_W   = 900;
  const BRANCH_EXTRA = 120; // espace latéral pour branches
  const rowCount = maxRow + 1;

  // Calcul hauteur : on compte les rangées + les espaces
  // On anticipe 180px de légende en bas
  const SVG_H = MARGIN + rowCount * (NODE_H + GAP_Y) + 60 + 180;

  // Couleurs par famille
  const FAM = {
    trigger:      { fill: '#E8F0F5', stroke: '#0F4761', text: '#0F4761', bar: '#0F4761' },
    watchfolder:  { fill: '#E8F0F5', stroke: '#0F4761', text: '#0F4761', bar: '#0F4761' },
    timer:        { fill: '#E8F0F5', stroke: '#0F4761', text: '#0F4761', bar: '#0F4761' },
    listener:     { fill: '#E8F0F5', stroke: '#0F4761', text: '#0F4761', bar: '#0F4761' },
    fetch:        { fill: '#EEE9F8', stroke: '#5B3FA6', text: '#5B3FA6', bar: '#5B3FA6' },
    lookup:       { fill: '#EEE9F8', stroke: '#5B3FA6', text: '#5B3FA6', bar: '#5B3FA6' },
    set_var:      { fill: '#EEE9F8', stroke: '#5B3FA6', text: '#5B3FA6', bar: '#5B3FA6' },
    transform:    { fill: '#EEE9F8', stroke: '#5B3FA6', text: '#5B3FA6', bar: '#5B3FA6' },
    id_generator: { fill: '#EEE9F8', stroke: '#5B3FA6', text: '#5B3FA6', bar: '#5B3FA6' },
    decision:     { fill: '#F9EBE4', stroke: '#C0580A', text: '#C0580A', bar: '#C0580A' },
    checker:      { fill: '#F9EBE4', stroke: '#C0580A', text: '#C0580A', bar: '#C0580A' },
    loop:         { fill: '#F9EBE4', stroke: '#C0580A', text: '#C0580A', bar: '#C0580A' },
    approval:     { fill: '#F9EBE4', stroke: '#C0580A', text: '#C0580A', bar: '#C0580A' },
    action:       { fill: '#E4F2EB', stroke: '#1B6B45', text: '#1B6B45', bar: '#1B6B45' },
    update_meta:  { fill: '#E4F2EB', stroke: '#1B6B45', text: '#1B6B45', bar: '#1B6B45' },
    http_request: { fill: '#E4F2EB', stroke: '#1B6B45', text: '#1B6B45', bar: '#1B6B45' },
    http_group:   { fill: '#E4F2EB', stroke: '#1B6B45', text: '#1B6B45', bar: '#1B6B45' },
    aws_s3:       { fill: '#E4F2EB', stroke: '#1B6B45', text: '#1B6B45', bar: '#1B6B45' },
    workflow_history: { fill: '#E6EEF3', stroke: '#3A5F7A', text: '#3A5F7A', bar: '#3A5F7A' },
    wait_for:     { fill: '#E6EEF3', stroke: '#3A5F7A', text: '#3A5F7A', bar: '#3A5F7A' },
    notification: { fill: '#E6EEF3', stroke: '#3A5F7A', text: '#3A5F7A', bar: '#3A5F7A' },
    script:       { fill: '#F5E6E6', stroke: '#8B2020', text: '#8B2020', bar: '#8B2020' },
    subflow:      { fill: '#E6EEF3', stroke: '#3A5F7A', text: '#3A5F7A', bar: '#3A5F7A' },
  };
  const defaultFam = { fill: '#F5F5F5', stroke: '#666666', text: '#333333', bar: '#666666' };
  const fc = f => FAM[f] || defaultFam;

  // ── 4. Sous-titre de nœud ─────────────────────────────────────
  const nodeSub = (node) => {
    if (node.family === 'http_group') {
      return node.requests.map(r => (r.config?.method || 'POST') + ' ' + (r.config?.url || '').split('/').slice(-2).join('/')).join('  ·  ');
    }
    const det = (typeof getNodeDetail === 'function') ? getNodeDetail(node) : { sub: '' };
    return (det.sub || '').replace(/<[^>]+>/g, '').trim().slice(0, 80);
  };

  // ── 5. Positions X des nœuds dans chaque rangée ─────────────
  // On place les nœuds centrés dans SVG_W
  const nodeX = {}; // nodeId → x center
  const nodeY = {}; // nodeId → y top

  for (let ri = 0; ri <= maxRow; ri++) {
    const rowNodes = rows[ri] || [];
    const n = rowNodes.length;
    const totalW = n * NODE_W + (n - 1) * 32;
    const startX = (SVG_W - totalW) / 2;
    rowNodes.forEach((nd, ni) => {
      nodeX[nd.id] = startX + ni * (NODE_W + 32) + NODE_W / 2; // centre
      nodeY[nd.id] = MARGIN + ri * (NODE_H + GAP_Y);
    });
  }

  // ── 6. Génération SVG ─────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" style="background:#ffffff;font-family:Arial,sans-serif;">`;

  // Fond blanc
  svg += `<rect width="${SVG_W}" height="${SVG_H}" fill="#ffffff"/>`;

  // Titre
  svg += `<text x="${SVG_W/2}" y="40" text-anchor="middle" font-size="18" font-weight="bold" fill="#0F4761">${_svgEsc(flux.name || 'Workflow')}</text>`;

  // ── 6. Construire le layout pour le rendu canvas direct ───────
  const layoutArrows = [];
  const layoutNodes  = [];

  // Flèches
  conns.forEach(conn => {
    const srcNode = nodes.find(n => n.id === conn.fromNode || (n.family === 'http_group' && n._ids?.includes(conn.fromNode)));
    const tgtNode = nodes.find(n => n.id === conn.toNode   || (n.family === 'http_group' && n._ids?.includes(conn.toNode)));
    if (!srcNode || !tgtNode || srcNode.id === tgtNode.id) return;

    const x1 = nodeX[srcNode.id];
    const y1 = nodeY[srcNode.id] + NODE_H;
    const x2 = nodeX[tgtNode.id];
    const y2 = nodeY[tgtNode.id];

    const ports  = (typeof buildPortsDef === 'function') ? buildPortsDef(srcNode.family, srcNode.config || {}) : { outputs: [] };
    const op     = ports.outputs[conn.fromPort] || ports.outputs[0];
    const label  = (ports.outputs.length > 1 && op?.label) ? op.label : '';
    const opHex  = (op?.color || '').replace('#','');
    const lColor = opHex.length === 6 ? op.color : '#999999';

    const arrow = { x1, y1, x2, y2, color: lColor, label };
    if (Math.abs(x2 - x1) > 10) {
      arrow.cx = x2;
      arrow.cy = y1 + GAP_Y / 2;
      arrow.y2 = y2;
    }
    layoutArrows.push(arrow);
  });

  // Nœuds
  nodes.forEach(node => {
    const cx  = nodeX[node.id];
    const y   = nodeY[node.id];
    const x   = cx - NODE_W / 2;
    const col = fc(node.family);
    const sub = nodeSub(node);
    layoutNodes.push({
      x, y, w: NODE_W, h: NODE_H,
      fill: col.fill, stroke: col.stroke, bar: col.bar,
      name: node.name || '',
      sub
    });
  });

  // Légende
  const legendY = MARGIN + rowCount * (NODE_H + GAP_Y) + 30;
  const allFamColors = {
    '#0F4761': ['trigger','watchfolder','timer','listener'],
    '#5B3FA6': ['fetch','lookup','set_var','transform','id_generator'],
    '#C0580A': ['decision','checker','loop','approval'],
    '#1B6B45': ['action','update_meta','http_request','aws_s3','http_group'],
    '#3A5F7A': ['workflow_history','wait_for','notification','subflow'],
    '#8B2020': ['script','manual'],
  };
  const famLabels = {
    '#0F4761': 'Déclencheur', '#5B3FA6': 'Données', '#C0580A': 'Logique',
    '#1B6B45': 'Action / HTTP', '#3A5F7A': 'Utilitaire', '#8B2020': 'Script'
  };
  const presentColors = new Set(nodes.map(n => {
    return Object.keys(allFamColors).find(c => allFamColors[c].includes(n.family));
  }).filter(Boolean));
  const legend = Object.keys(famLabels)
    .filter(c => presentColors.has(c))
    .map(c => ({ color: c, label: famLabels[c] }));

  const layout = {
    title: flux.name || 'Workflow',
    nodes: layoutNodes,
    arrows: layoutArrows,
    legend,
    legendY
  };

  // ── 7. Rendu canvas direct → PNG base64 ──────────────────────
  const pngBase64 = _renderFlowchartToCanvas(layout, SVG_W, SVG_H);

  // ── 8. ImageRun docx ─────────────────────────────────────────
  const WORD_W = 980;
  const WORD_H = Math.round(WORD_W * SVG_H / SVG_W);

  return [new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({
      data: pngBase64,
      transformation: { width: WORD_W, height: WORD_H },
    })]
  })];
}

// ── Grouper les nœuds HTTP consécutifs sur la même connexion ──
function _groupConsecutiveHttp(nodes, conns) {
  const sorted = _sortNodesByFlow(nodes, conns);
  const result = [];
  let i = 0;

  while (i < sorted.length) {
    const node = sorted[i];

    if (node.family !== 'http_request') {
      result.push(node);
      i++;
      continue;
    }

    // Chercher la séquence de http_request consécutifs sur la même connexion
    const connId = node.config?.connexionId || '';
    const group  = [node];
    let j = i + 1;

    while (j < sorted.length) {
      const next = sorted[j];
      if (next.family !== 'http_request') break;
      if ((next.config?.connexionId || '') !== connId) break;
      // Vérifier que next est bien directement après le dernier du groupe
      const last    = group[group.length - 1];
      const linking = conns.filter(c => c.fromNode === last.id && c.toNode === next.id);
      if (!linking.length) break;
      group.push(next);
      j++;
    }

    if (group.length === 1) {
      result.push(node);
    } else {
      // Créer un nœud virtuel
      const conn = (typeof wfdConnexions !== 'undefined') ? wfdConnexions.find(c => c.id === connId) : null;
      const groupName = conn ? conn.name : (group[0].name || 'Appels API');
      result.push({
        id:       group[0].id,   // garde l'id du premier pour les connexions entrantes
        _lastId:  group[group.length - 1].id, // id du dernier pour les connexions sortantes
        _ids:     group.map(n => n.id),
        family:   'http_group',
        name:     groupName,
        config:   group[0].config,
        requests: group,
      });
    }
    i = j;
  }

  return result;
}

// ── BFS → niveaux et rangées ──────────────────────────────────
function _bfsLevels(nodes, conns) {
  const inDeg = {};
  nodes.forEach(n => { inDeg[n.id] = 0; });
  conns.forEach(c => {
    // Pour les groupes, utiliser _lastId comme source
    const srcId = nodes.find(n => n._ids?.includes(c.fromNode))?.id || c.fromNode;
    const tgtId = nodes.find(n => n._ids?.includes(c.toNode))?.id   || c.toNode;
    if (srcId === tgtId) return;
    if (inDeg[tgtId] !== undefined) inDeg[tgtId]++;
  });

  const levels  = {};
  const sources = nodes.filter(n => inDeg[n.id] === 0);
  sources.forEach(n => { levels[n.id] = 0; });
  const queue   = [...sources];
  const tmpDeg  = { ...inDeg };
  const visited = new Set(sources.map(n => n.id));
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const srcId = cur._lastId || cur.id;
    conns.filter(c => {
      const s = nodes.find(n => n._ids?.includes(c.fromNode))?.id || c.fromNode;
      const t = nodes.find(n => n._ids?.includes(c.toNode))?.id   || c.toNode;
      return s === cur.id && t !== cur.id;
    }).forEach(c => {
      const tgtId = nodes.find(n => n._ids?.includes(c.toNode))?.id || c.toNode;
      if (!inDeg.hasOwnProperty(tgtId)) return;
      levels[tgtId] = Math.max(levels[tgtId] || 0, (levels[cur.id] || 0) + 1);
      tmpDeg[tgtId]--;
      if (tmpDeg[tgtId] <= 0 && !visited.has(tgtId)) {
        visited.add(tgtId);
        const n = nodes.find(x => x.id === tgtId);
        if (n) queue.push(n);
      }
    });
  }
  nodes.forEach(n => { if (levels[n.id] === undefined) levels[n.id] = 0; });

  const rows = {};
  nodes.forEach(n => {
    const r = levels[n.id] || 0;
    if (!rows[r]) rows[r] = [];
    rows[r].push(n);
  });
  const maxRow = nodes.length ? Math.max(...nodes.map(n => levels[n.id] || 0)) : 0;
  return { levels, rows, maxRow };
}

// ── Conversion SVG string → PNG base64 via canvas ────────────
function _svgToPng(svgString, w, h) {
  // Electron bloque le rendu SVG via canvas.drawImage.
  // On dessine directement avec l'API Canvas 2D depuis les données du layout.
  // Cette fonction reçoit en réalité un objet de layout, pas un SVG string.
  // Voir _buildCanvasLayout qui retourne { nodes, arrows, legend, title }
  return Promise.resolve(null); // jamais appelée directement
}

// ── Rendu canvas direct (sans SVG intermédiaire) ──────────────
function _renderFlowchartToCanvas(layout, w, h) {
  const canvas  = document.createElement('canvas');
  canvas.width  = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Fond blanc
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // ── Flèches (dessinées avant les nœuds) ──
  layout.arrows.forEach(a => {
    ctx.beginPath();
    ctx.strokeStyle = a.color || '#999999';
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([]);
    ctx.moveTo(a.x1, a.y1);
    if (a.cx !== undefined) {
      // Coude L
      ctx.lineTo(a.cx, a.y1);
      ctx.lineTo(a.cx, a.cy);
      ctx.lineTo(a.x2, a.cy);
      ctx.lineTo(a.x2, a.y2);
    } else {
      ctx.lineTo(a.x2, a.y2);
    }
    ctx.stroke();
    // Pointe de flèche
    _drawArrow(ctx, a.x2, a.y2 - 8, a.x2, a.y2, a.color || '#999999');
    // Label de condition
    if (a.label) {
      ctx.font = 'italic 11px Arial';
      ctx.fillStyle = a.color || '#888888';
      ctx.textAlign = a.cx !== undefined ? 'center' : 'left';
      const lx = a.cx !== undefined ? (a.x1 + a.x2) / 2 : a.x2 + 6;
      const ly = a.cx !== undefined ? a.cy - 5 : (a.y1 + a.y2) / 2;
      ctx.fillText(a.label.slice(0, 20), lx, ly);
    }
  });

  // ── Nœuds ──
  layout.nodes.forEach(n => {
    const { x, y, w: nw, h: nh, fill, stroke, bar, name, sub } = n;

    // Rectangle fond
    ctx.beginPath();
    _roundRect(ctx, x, y, nw, nh, 6);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Barre gauche colorée
    ctx.beginPath();
    _roundRect(ctx, x, y, 6, nh, 3);
    ctx.fillStyle = bar;
    ctx.fill();

    // Nom du nœud
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = stroke; // couleur de la famille
    ctx.textAlign = 'left';
    ctx.fillText(name.slice(0, 44), x + 14, y + (sub ? nh * 0.38 : nh * 0.54));

    // Sous-titre
    if (sub) {
      ctx.font = '10.5px Arial';
      ctx.fillStyle = '#555555';
      ctx.fillText(sub.slice(0, 64), x + 14, y + nh * 0.72);
    }
  });

  // ── Titre ──
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = '#0F4761';
  ctx.textAlign = 'center';
  ctx.fillText(layout.title.slice(0, 60), w / 2, 36);

  // ── Légende ──
  const ly = layout.legendY;
  ctx.strokeStyle = '#DDDDDD';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(80, ly);
  ctx.lineTo(w - 80, ly);
  ctx.stroke();

  ctx.font = '10px Arial';
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'left';
  ctx.fillText('Légende', 80, ly + 16);

  let lx = 160;
  layout.legend.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 8, 4, 14);
    ctx.font = '10px Arial';
    ctx.fillStyle = '#555555';
    ctx.fillText(item.label, lx + 8, ly + 19);
    lx += 105;
  });

  return canvas.toDataURL('image/png').split(',')[1];
}

function _drawArrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len   = 7;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.2;
  ctx.moveTo(x2 - len * Math.cos(angle - 0.4), y2 - len * Math.sin(angle - 0.4));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(angle + 0.4), y2 - len * Math.sin(angle + 0.4));
  ctx.stroke();
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Échappement XML pour SVG

// ── Échappement XML pour SVG ──────────────────────────────────
function _svgEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}




// ── Export Word ──────────────────────────────────────────────
async function exporterWordFlux() {
  if (typeof docx === 'undefined') { toast('Librairie Word non chargée', true); return; }
  const flux = getFluxCourant();
  if (!flux) { toast('Sélectionnez un flux à exporter', true); return; }
  toast('Génération en cours…');

  // ── Données du flux ───────────────────────────────────────
  const allNodes = (flux.nodes || []).filter(n => n.family !== 'postit');
  const allConns = flux.connections || [];
  const seqNodes   = _sortNodesByFlow(allNodes, allConns);
  const groupNodes = _groupConsecutiveHttp(allNodes, allConns);
  const org      = localStorage.getItem('organisationName') || localStorage.getItem('nomOrganisation') || 'Client';
  const dateStr  = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  try {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
      ImageRun, Header, Footer, TabStopType, TabStopPosition, PageNumber } = docx;
    const TW = 9360; // Largeur utile portrait A4 (11906 - 2×1134 marges)

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    // Bordures
    const bNone  = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
    const bLight = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
    const bMid   = { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB' };
    const bsNone  = { top: bNone,  bottom: bNone,  left: bNone,  right: bNone  };
    const bsLight = { top: bLight, bottom: bLight, left: bLight, right: bLight };
    const cm      = { top: 100, bottom: 100, left: 160, right: 120 };
    const cmSm    = { top: 80,  bottom: 80,  left: 120, right: 100 };

    // Cellule simple
    const cell = (text, opts = {}) => new TableCell({
      borders:       opts.noBorder ? bsNone : bsLight,
      verticalAlign: opts.top ? VerticalAlign.TOP : VerticalAlign.CENTER,
      margins:       opts.sm ? cmSm : cm,
      width:         opts.w ? { size: opts.w, type: WidthType.DXA } : undefined,
      shading:       opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      children: [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({
          text:    String(text ?? '—'),
          size:    opts.size || 18,
          bold:    !!opts.bold,
          font:    opts.mono ? 'Courier New' : 'Arial',
          color:   opts.color || '111111',
          italics: !!opts.italics
        })]
      })]
    });

    // Cellule avec plusieurs lignes label:valeur
    const cellLines = (lines, w, opts = {}) => {
      if (!lines || !lines.length) return cell('—', { w });
      return new TableCell({
        borders:       bsLight,
        verticalAlign: VerticalAlign.TOP,
        margins:       cm,
        width:         { size: w, type: WidthType.DXA },
        shading:       opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
        children: lines.slice(0, 15).map(ln => new Paragraph({
          spacing: { before: 0, after: 20 },
          children: ln.label ? [
            new TextRun({ text: ln.label + ' : ', size: 16, font: 'Arial', color: '777777' }),
            new TextRun({ text: String(ln.value || '').slice(0, 160), size: 16, font: ln.mono ? 'Courier New' : 'Arial', color: '111111', bold: true })
          ] : [
            new TextRun({ text: String(ln.value || '').slice(0, 160), size: 16, font: ln.mono ? 'Courier New' : 'Arial', color: '333333' })
          ]
        }))
      });
    };

    // Paragraphe utilitaires
    const sp  = ()       => new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: '' })] });
    const txt = (t, opts = {}) => new Paragraph({
      spacing:          { before: opts.before || 0, after: opts.after || 80 },
      pageBreakBefore:  !!opts.pageBreak,
      keepNext:         !!opts.keepNext,
      indent:           opts.indent ? { left: opts.indent } : undefined,
      border:           opts.borderBottom ? { bottom: { style: BorderStyle.SINGLE, size: opts.borderBottom, color: opts.borderColor || '0F4761', space: 1 } } : undefined,
      children: [new TextRun({
        text:    t,
        size:    opts.size || 20,
        bold:    !!opts.bold,
        font:    'Arial',
        color:   opts.color || '272727',
        italics: !!opts.italics
      })]
    });

    // Titre de section numéroté (ex: "1. Contexte et objectifs")
    const secTitle = (num, label, pageBreak = false) => txt(num + '. ' + label, {
      size: 28, bold: true, color: '0F4761',
      before: pageBreak ? 0 : 400, after: 200,
      pageBreak,
      keepNext: true,
      borderBottom: 4, borderColor: '0F4761'
    });

    // Titre de sous-section (ex: "3.1 Champs de métadonnées")
    const subTitle = (label, keepNext = true) => txt(label, {
      size: 22, bold: true, color: '272727',
      before: 280, after: 120,
      keepNext
    });

    // En-tête de tableau (ligne colorée)
    const headerRow = (cols, color) => new TableRow({
      tableHeader: true,
      children: cols.map(([t, w]) => cell(t, { fill: color || '0F4761', bold: true, color: 'FFFFFF', w, size: 16 }))
    });

    // Ligne de tableau alternée
    const dataRow = (cols, i, widths) => new TableRow({
      cantSplit: true,
      children: cols.map((val, ci) => cell(val, {
        fill: i % 2 === 0 ? 'F7F7F7' : 'FFFFFF',
        w: widths[ci],
        size: 16,
        top: true
      }))
    });

    // Ligne de tableau avec cellule 1 en label gris et cellule 2 en valeur
    const propRow = (label, value, i, w1, w2, opts = {}) => new TableRow({
      cantSplit: true,
      children: [
        cell(label, { fill: 'F2F2F2', w: w1, size: 16, color: '555555' }),
        opts.lines
          ? cellLines(opts.lines, w2)
          : cell(String(value ?? '—'), { w: w2, size: 16, mono: !!opts.mono, color: opts.valColor || '111111' })
      ]
    });

    // ═══════════════════════════════════════════════════════
    // ANALYSE DU FLUX
    // ═══════════════════════════════════════════════════════

    const hasFetch   = allNodes.some(n => n.family === 'fetch');
    const hasHttp    = allNodes.some(n => n.family === 'http_request');
    const hasS3      = allNodes.some(n => n.family === 'aws_s3');
    const hasIconik  = allNodes.some(n => ['action','update_meta','fetch','trigger'].includes(n.family));
    const hasLookup  = allNodes.some(n => n.family === 'lookup');

    // Récupère le nœud fetch principal (premier)
    const fetchNode  = allNodes.find(n => n.family === 'fetch');
    const fetchCfg   = fetchNode?.config || {};

    // Récupère le lookup principal — lkRows est la structure native du nœud Lookup
    const lookupNode = allNodes.find(n => n.family === 'lookup');
    const lookupCfg  = lookupNode?.config || {};
    // lkRows : [{ key (champ Iconik), value (champ API cible), type, fallback, children }]
    const lkRows     = lookupCfg.lkRows || [];
    // Compatibilité ancienne structure wfdMappings (fallback)
    const mappingObj = (typeof wfdMappings !== 'undefined' && lookupCfg.mappingId)
      ? wfdMappings.find(m => m.id === lookupCfg.mappingId)
      : null;
    // On préfère lkRows (données réelles du nœud) à wfdMappings
    const mappingRows = lkRows.length ? lkRows : (mappingObj?.rows || []);

    // Deux representations du workflow coexistent : le diagramme graphique en
    // page paysage (ci-dessous) et un tableau lineaire en section Schema. Les
    // deux suivent l'ordre du graphe et, sur un workflow a branches, sautent
    // de l'une a l'autre sans le montrer. Desactives tant que le generateur
    // de diagramme du Viewer n'est pas termine : mieux vaut pas de schema
    // qu'un schema trompeur. Une seule ligne a repasser a true.
    const INCLURE_SCHEMA = false;

    // ═══════════════════════════════════════════════════════
    // SECTION PAYSAGE : SCHÉMA GRAPHIQUE
    // ═══════════════════════════════════════════════════════
    const flowchartElements = INCLURE_SCHEMA ? await buildFlowchartDocx(flux, docx) : [];

    // ═══════════════════════════════════════════════════════
    // SECTION PORTRAIT : DOCUMENT COMPLET
    // ═══════════════════════════════════════════════════════
    // ── CORPS DU DOCUMENT ─────────────────────────────────────
    const doc = [];


    // ── SECTION 1 — CONTEXTE ET OBJECTIFS ────────────────────
    // Numerotation dynamique : retirer ou ajouter une section ne doit pas
    // obliger a renumeroter tout le document a la main.
    let _secNo = 0;
    const nextSec = () => String(++_secNo);

    const _sCtx = nextSec();
    doc.push(secTitle(_sCtx, 'Contexte et objectifs', true));

    doc.push(txt(
      'Ce document décrit les spécifications techniques et fonctionnelles du workflow ' +
      (flux.name || '') + '. Il est destiné à deux audiences :', { after: 120 }
    ));
    doc.push(txt('— L\'équipe technique interne chargée de configurer et maintenir le workflow.', { indent: 240, after: 60 }));
    doc.push(txt('— Les éditeurs de solutions d\'orchestration souhaitant reproduire ce workflow dans leur plateforme.', { indent: 240, after: 200 }));

    // Périmètre auto depuis les familles présentes
    doc.push(subTitle(_sCtx + '.1 Périmètre'));
    doc.push(txt('Le workflow couvre les opérations suivantes :', { after: 120 }));
    const perimeter = _buildPerimeter(allNodes);
    perimeter.forEach(line => doc.push(txt('— ' + line, { indent: 240, after: 60 })));
    doc.push(sp());

    // Systèmes impliqués
    doc.push(subTitle(_sCtx + '.2 Systèmes impliqués', true));
    const systems = _buildSystems(allNodes);
    doc.push(new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: [2000, 2800, 4560],
      rows: [
        headerRow([['Système', 2000], ['Rôle', 2800], ['Usage dans le workflow', 4560]]),
        ...systems.map((s, i) => dataRow([s.name, s.role, s.usage], i, [2000, 2800, 4560]))
      ]
    }));
    doc.push(sp());

    // ── 1.3 LIVRABLES ASSOCIÉS ──────────────────────────────────
    // Le docx porte la logique, les autres exports portent les appels. Sans
    // ce renvoi, un integrateur peut prendre le script Python pour une
    // implementation complete alors qu'il execute les etapes lineairement,
    // sans reproduire l'aiguillage. Le dire ici transforme une limite en
    // repartition assumee entre livrables.
    const _slugDoc = org.replace(/\s+/g, '-');
    const _nomFlux = (flux.name || 'workflow').replace(/\s+/g, '-');
    doc.push(subTitle(_sCtx + '.3 Livrables associés', true));
    doc.push(txt(
      'Ce document décrit la logique du workflow : les branches, les conditions et les prérequis. ' +
      'Le détail exact des appels API se trouve dans les livrables suivants, générés depuis la même source.',
      { after: 120 }
    ));
    doc.push(new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: [3400, 4160, 1800],
      rows: [
        headerRow([['Fichier', 3400], ['Contenu', 4160], ['Usage', 1800]]),
        ...[
          [_slugDoc + '-' + _nomFlux + '-api-ops.html',
           'Chaque appel HTTP, nœud par nœud : méthode, endpoint et corps de requête.',
           'Consulter, partager'],
          [_slugDoc + '-' + _nomFlux + '-postman.json',
           'Les mêmes appels, importables dans Postman.',
           'Tester à la main'],
          [_slugDoc + '-' + _nomFlux + '-api-ops.py',
           'Script complet : clients S3 et API cible, attente des exports, création puis mise à jour, table de correspondance des champs.',
           'Reproduire']
        ].map((r, i) => dataRow(r, i, [3400, 4160, 1800]))
      ]
    }));
    doc.push(sp());
    doc.push(txt(
      'Le script exécute les étapes de façon linéaire et ne reproduit pas l\'aiguillage : ' +
      'la logique de branchement est décrite dans le présent document.',
      { after: 120, italics: true, color: '555555', size: 18 }
    ));
    doc.push(sp());

    // ── SECTION 2 — GUIDE OPÉRATIONNEL ──────────────────────────
    const _sGuide = nextSec();
    doc.push(secTitle(_sGuide, 'Guide opérationnel', true));
    doc.push(txt(
      'Cette section décrit ce qu\'un utilisateur Iconik doit faire pour déclencher et suivre ce workflow, ' +
      'indépendamment de toute solution d\'orchestration.', { after: 200 }
    ));

    const opGuide = _buildOperationalGuide(allNodes, allConns);

    // 4.1 Prérequis utilisateur
    doc.push(subTitle(_sGuide + '.1 Prérequis — Métadonnées à renseigner', true));
    doc.push(txt(
      'Avant de déclencher le workflow, les champs suivants doivent être renseignés sur l\'asset dans Iconik :', { after: 160 }
    ));
    if (opGuide.requiredFields.length) {
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [2400, 2000, 1200, 3760],
        rows: [
          headerRow([['Champ Iconik', 2400], ['Label', 2000], ['Type', 1200], ['Importance', 3760]]),
          ...opGuide.requiredFields.map((f, i) => dataRow(
            [f.name, f.label || f.name, f.type || 'string', f.required ? 'Obligatoire' : 'Recommandé'],
            i, [2400, 2000, 1200, 3760]
          ))
        ]
      }));
    } else {
      doc.push(txt('Aucun champ obligatoire détecté — vérifier la configuration du nœud Fetch.', { size: 16, color: '888888', italics: true }));
    }
    doc.push(sp());

    // 4.2 Déclenchement
    doc.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [] }));
    doc.push(subTitle(_sGuide + '.2 Déclenchement du workflow', true));
    opGuide.triggerSteps.forEach(function(step) {
      doc.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        indent: { left: 240 },
        border: { left: { style: BorderStyle.SINGLE, size: 6, color: opGuide.triggerColor, space: 6 } },
        children: [new TextRun({ text: step, size: 18, font: 'Arial', color: '272727' })]
      }));
    });
    doc.push(sp());

    // 4.3 Suivi
    if (opGuide.followUpSteps.length) {
      doc.push(subTitle(_sGuide + '.3 Suivi et résultat', true));
      opGuide.followUpSteps.forEach(function(step) {
        doc.push(new Paragraph({
          spacing: { before: 0, after: 60 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: '3A5F7A', space: 6 } },
          children: [new TextRun({ text: step, size: 18, font: 'Arial', color: '272727' })]
        }));
      });
      doc.push(sp());
    }

    // 4.4 Conditions d'échec
    if (opGuide.failureSteps.length) {
      doc.push(subTitle(_sGuide + '.4 Causes d\'échec et diagnostic', true));
      opGuide.failureSteps.forEach(function(step) {
        doc.push(new Paragraph({
          spacing: { before: 0, after: 60 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'C0580A', space: 6 } },
          children: [new TextRun({ text: step, size: 18, font: 'Arial', color: '272727' })]
        }));
      });
      doc.push(sp());
    }

    // ── SECTION — SCHÉMA DU WORKFLOW (desactive) ─────────────
    if (INCLURE_SCHEMA) {
    doc.push(secTitle(nextSec(), 'Schéma du workflow', true));
    doc.push(txt(
      // Ne pas affirmer un declenchement automatique : la section 2 vient de
      // decrire un declenchement manuel par Custom Action. Le schema decrit un
      // enchainement, pas un mode de declenchement.
      'Enchaînement des étapes :', { after: 160 }
    ));

    const FAM_EN = {
      trigger:'Trigger', watchfolder:'Watch Folder', timer:'Timer', listener:'Listener',
      fetch:'Fetch', lookup:'Lookup', set_var:'Set Variable', transform:'Transform',
      rename:'Rename', id_generator:'ID Generator',
      decision:'Decision', loop:'Loop', qc:'QC Check', checker:'Checker', approval:'Approval',
      action:'Action', update_meta:'Update Metadata', acl:'ACL', create_asset:'Create Asset',
      create_col:'Create Collection', link_file:'Link File', cast:'Cast', transcode:'Transcode',
      export_file:'Export File', publish:'Publish', http_request:'HTTP Request', aws_s3:'AWS S3',
      http_group:'HTTP Request',
      workflow_history:'Workflow History', wait_for:'Wait For', notification:'Notification',
      notify_post:'Notify Post', gate:'Gate', subflow:'Sub-Workflow', relate:'Relate',
      script:'Script', manual:'Manual Step'
    };

    const schemaRows = seqNodes.map((node, i) => {
      const det = (typeof getNodeDetail === 'function') ? getNodeDetail(node) : { sub: '' };
      // Enrichissement depuis wfdData
      const enrichedDesc = _enrichNodeDesc(node);
      const sub = enrichedDesc || (det.sub || '').replace(/<[^>]+>/g, '').trim();
      return dataRow(
        [String(i + 1), node.name || '', FAM_EN[node.family] || node.family, sub || '—'],
        i,
        [520, 2800, 1800, 4240]
      );
    });

    doc.push(new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: [520, 2800, 1800, 4240],
      rows: [
        headerRow([['#', 520], ['Étape', 2800], ['Type', 1800], ['Description', 4240]]),
        ...schemaRows
      ]
    }));
    doc.push(sp());
    }  // fin INCLURE_SCHEMA

    // ── SECTION 4 — PRÉREQUIS ET CONFIGURATION ───────────────
    const _sPre = nextSec();
    doc.push(secTitle(_sPre, 'Prérequis et configuration', true));

    // 3.1 Champs MD — depuis wfdData.metadata croisé avec lkRows + update_meta
    const mdFields = _buildMetadataFields(allNodes, mappingRows);
    doc.push(subTitle(_sPre + '.1 Champs de métadonnées Iconik'));
    // Nom de la vue depuis wfdData
    const fetchViewName = (typeof wfdData !== 'undefined' && wfdData.mdViews)
      ? (wfdData.mdViews.find(v => v.id === fetchCfg.metadataViewId)?.name || fetchCfg.metadataViewId || '')
      : (fetchCfg.metadataViewId || '');
    // Un workflow multi-niveaux lit plusieurs vues : n'en annoncer qu'une
    // laisserait croire que les autres n'existent pas. On rassemble toutes
    // celles reellement referencees par les noeuds.
    const _vues = [];
    allNodes.forEach(function(n) {
      const c = n.config || {};
      [c.metadataViewId, c.mdViewId, c.viewId].forEach(function(v) {
        if (v && _vues.indexOf(v) === -1) _vues.push(v);
      });
    });
    const _nomsVues = _vues.map(function(v) {
      return (typeof wfdData !== 'undefined' && wfdData.mdViews)
        ? (wfdData.mdViews.find(function(x){ return x.id === v; })?.name || v) : v;
    });
    if (_nomsVues.length === 1) {
      doc.push(txt('Vue Iconik utilisée : ' + _nomsVues[0], { size: 16, color: '555555', after: 120, italics: true }));
    } else if (_nomsVues.length > 1) {
      doc.push(txt('Vues Iconik utilisées : ' + _nomsVues.join(' · '), { size: 16, color: '555555', after: 120, italics: true }));
    } else if (fetchViewName) {
      doc.push(txt('Vue Iconik utilisée : ' + fetchViewName, { size: 16, color: '555555', after: 120, italics: true }));
    }
    if (mdFields.length) {
      // Enrichir mdFields avec required depuis cfg.requiredFields du nœud Fetch
      const fetchReqNames = new Set((fetchNode ? (fetchNode.config?.requiredFields || []) : []).map(function(f){ return f.name; }));
      const mdFieldsEnriched = mdFields.map(function(f) {
        return Object.assign({}, f, { required: f.required || fetchReqNames.has(f.name) });
      });
      // Ajouter les champs requis manquants dans mdFields
      (fetchNode ? (fetchNode.config?.requiredFields || []) : []).forEach(function(rf) {
        if (!mdFieldsEnriched.find(function(f){ return f.name === rf.name; })) {
          mdFieldsEnriched.push({ name: rf.name, label: rf.label || rf.name, type: rf.type || 'string', required: true, vod: '—' });
        }
      });
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [2400, 1600, 1000, 800, 3560],
        rows: [
          headerRow([['Nom du champ', 2400], ['Label', 1600], ['Type', 1000], ['Requis', 800], ['Champ API cible / Usage', 3560]]),
          ...mdFieldsEnriched.map(function(f, i) {
            const reqCell = f.required
              ? cell('Oui', { fill: 'FFF3E0', w: 800, size: 16, bold: true, color: 'C0580A' })
              : cell('—',   { w: 800, size: 16, color: '888888' });
            return new TableRow({ cantSplit: true, children: [
              cell(f.name,             { fill: i%2===0?'F7F7F7':'FFFFFF', w: 2400, size: 16 }),
              cell(f.label || f.name,  { fill: i%2===0?'F7F7F7':'FFFFFF', w: 1600, size: 16 }),
              cell(f.type || 'string', { fill: i%2===0?'F7F7F7':'FFFFFF', w: 1000, size: 16 }),
              reqCell,
              cell(f.vod || f.usage || '—', { fill: i%2===0?'F7F7F7':'FFFFFF', w: 3560, size: 16 }),
            ]});
          })
        ]
      }));
    } else {
      doc.push(txt('Aucun champ de métadonnées détecté dans ce workflow.', { size: 16, color: '888888', italics: true }));
    }
    doc.push(sp());

    // 3.2 Connexions API depuis wfdConnexions (connexionId des noeuds du flux)
    doc.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [] }));
    doc.push(subTitle(_sPre + '.2 Connexions API requises', true));
    const apiConns = _buildApiConnectionsFromNodes(allNodes);
    doc.push(new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: [2200, 1200, 2000, 3960],
      rows: [
        headerRow([['Connexion', 2200], ['Type', 1200], ['URL de base', 2000], ['Paramètres', 3960]]),
        ...apiConns.map((c, i) => dataRow([c.name, c.type, c.baseUrl, c.params], i, [2200, 1200, 2000, 3960]))
      ]
    }));
    doc.push(sp());

    // ── SECTION 5 — SPÉCIFICATIONS TECHNIQUES PAR ÉTAPE ──────
    const _sSpec = nextSec();
    doc.push(secTitle(_sSpec, 'Spécifications techniques par étape', true));

    // Nœuds avec config significative uniquement
    const specNodes = groupNodes.filter(n => _hasSignificantConfig(n));

    // Presentation par branche quand le workflow en comporte : le lecteur suit
    // un niveau du debut a la fin au lieu de sauter de l'un a l'autre.
    const _branches = _groupNodesByBranch(allNodes, allConns);
    const _sections = [];
    if (_branches) {
      _branches.forEach(g => {
        const ns = specNodes.filter(n => g.nodes.some(x => x.id === n.id));
        if (ns.length) _sections.push({ label: g.label, nodes: ns });
      });
      // Filet : un noeud oublie par le regroupement doit rester documente.
      const placed = new Set(_sections.flatMap(x => x.nodes.map(n => n.id)));
      const reste = specNodes.filter(n => !placed.has(n.id));
      if (reste.length) _sections.push({ label: 'Autres etapes', nodes: reste });
    } else {
      _sections.push({ label: null, nodes: specNodes });
    }

    let _num = 0;
    _sections.forEach((sec, si) => {
      if (sec.label) {
        _num = 0;
        doc.push(new Paragraph({
          keepNext: true,
          pageBreakBefore: si > 0,
          spacing: { before: si > 0 ? 0 : 500, after: 200 },
          children: [
            new TextRun({ text: _sSpec + '.' + (si + 1) + '  ', size: 22, font: 'Arial', color: 'AAAAAA', bold: true }),
            new TextRun({ text: sec.label, size: 28, font: 'Arial', color: '0F4761', bold: true })
          ]
        }));
      }
      sec.nodes.forEach((node, idx) => {
      const cfg   = node.config || {};
      const fam   = FAMILIES[node.family] || {};
      const fHex  = _famColor(node.family);
      const det   = (typeof getNodeDetail === 'function') ? getNodeDetail(node) : { sub: '' };

      // Titre de sous-section avec bordure gauche colorée
      // pageBreakBefore si le flag est coché dans la config du nœud
      const _forceBreak = !!(node.config?.pageBreakBefore);
      doc.push(new Paragraph({
        keepNext:        true,
        pageBreakBefore: _forceBreak,
        spacing: { before: _forceBreak ? 0 : 800, after: 180 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: fHex, space: 8 } },
        indent: { left: 260 },
        children: [
          new TextRun({ text: (sec.label ? _sSpec + '.' + (si + 1) + '.' + (++_num) : _sSpec + '.' + (idx + 1)) + '  ',
            size: 18, font: 'Arial', color: 'AAAAAA', bold: true }),
          new TextRun({ text: node.name || '', size: 24, font: 'Arial', color: '111111', bold: true }),
          new TextRun({ text: '   ' + (fam.label || '').toUpperCase(), size: 12, font: 'Arial', color: fHex, bold: true })
        ]
      }));

      // Construction des lignes de specs
      const specs = _buildNodeSpecs(node, cfg, det, mappingRows, allConns, allNodes);

      if (specs.length) {
        // keepNext sur le titre garantit qu'il reste avec au moins la première ligne du tableau
        doc.push(new Table({
          width: { size: TW, type: WidthType.DXA },
          columnWidths: [2800, TW - 2800],
          rows: [
            new TableRow({
              tableHeader: true,
              cantSplit: true,
              children: [
                cell('Paramètre', { fill: fHex, bold: true, color: 'FFFFFF', w: 2800, size: 16 }),
                cell('Valeur',    { fill: fHex, bold: true, color: 'FFFFFF', w: TW - 2800, size: 16 })
              ]
            }),
            ...specs.map((s, i) => s.lines
              ? new TableRow({ cantSplit: true, children: [
                  cell(s.label, { fill: 'F2F2F2', w: 2800, size: 16, color: '555555' }),
                  cellLines(s.lines, TW - 2800)
                ]})
              : propRow(s.label, s.value, i, 2800, TW - 2800, { mono: !!s.mono })
            )
          ]
        }));
      }
      doc.push(sp());
      });
    });

    // ── SECTION 5 — NŒUDS REQUIS POUR L'ORCHESTRATEUR ────────
    doc.push(secTitle(nextSec(), 'Nœuds requis pour l\'orchestrateur', true));
    doc.push(txt(
      'Tout orchestrateur souhaitant implémenter ce workflow doit disposer des types de nœuds suivants :', { after: 160 }
    ));

    const nodeReqs = _buildNodeRequirements(allNodes);
    doc.push(new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: [2200, 1600, 5560],
      rows: [
        headerRow([['Nœud', 2200], ['Catégorie', 1600], ['Capacités requises', 5560]]),
        ...nodeReqs.map((r, i) => dataRow([r.name, r.cat, r.caps], i, [2200, 1600, 5560]))
      ]
    }));
    doc.push(sp());

    // ── SECTION 6 — LIMITATIONS CONNUES ──────────────────────
    const limitations = _buildLimitations(allNodes);
    if (limitations.length) {
      doc.push(secTitle(nextSec(), 'Limitations connues et points en suspens', true));
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [2400, 1600, 5360],
        rows: [
          headerRow([['Sujet', 2400], ['Statut', 1600], ['Description', 5360]]),
          ...limitations.map((l, i) => dataRow([l.subject, l.status, l.desc], i, [2400, 1600, 5360]))
        ]
      }));
      doc.push(sp());
    }

    // ── SECTION 7 — PSEUDO-CODE DES ÉTAPES CLÉS ──────────────
    const pseudoItems = _buildPseudocode(allNodes, mappingRows);
    if (pseudoItems.length) {
      const secNum = nextSec();
      doc.push(secTitle(secNum, 'Logique des étapes clés (pseudo-code)', true));
      doc.push(txt(
        'Cette section décrit la logique interne des étapes complexes, indépendamment de tout orchestrateur.', { after: 200 }
      ));
      pseudoItems.forEach((item, idx) => {
        doc.push(subTitle(secNum + '.' + (idx + 1) + ' ' + item.title, true));
        item.lines.forEach(line => {
          const isCode = line.startsWith('  ') || line.match(/^[A-ZÀÂÉ]/);
          doc.push(txt(line, {
            size: isCode ? 16 : 18,
            font: isCode ? 'Courier New' : 'Arial',
            color: '333333',
            indent: isCode ? 360 : 0,
            after: 40
          }));
        });
        doc.push(sp());
      });
    }


    // ── SECTION RÉCAPITULATIVE ───────────────────────────────────
    const lastSecNum = nextSec();
    doc.push(secTitle(String(lastSecNum), 'Récapitulatif', true));

    // Récap 1 : Variables utilisées
    const allVars = _collectAllVars(allNodes);
    if (allVars.length) {
      doc.push(subTitle(lastSecNum + '.1 Variables de workflow'));
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [2400, 1400, 2560, 2800],
        rows: [
          headerRow([['Variable', 2400], ['Type déduit', 1400], ['Produite par', 2560], ['Consommée par', 2800]]),
          ...allVars.map((v, i) => dataRow(['{'+v.name+'}', v.type, v.producer, v.consumers], i, [2400, 1400, 2560, 2800]))
        ]
      }));
      doc.push(sp());
    }

    // Récap 2 : Champs MD Iconik
    if (mdFields.length) {
      doc.push(subTitle(lastSecNum + '.2 Champs de métadonnées Iconik'));
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [2400, 1800, 1200, 800, 3160],
        rows: [
          headerRow([['Nom technique', 2400], ['Label', 1800], ['Type', 1200], ['Requis', 800], ['Champ API cible', 3160]]),
          ...mdFields.map((f, i) => dataRow([f.name, f.label||f.name, f.type||'string', f.required ? 'Oui' : '—', f.vod||'—'], i, [2400, 1800, 1200, 800, 3160]))
        ]
      }));
      doc.push(sp());
    }

    // Récap 3 : Endpoints API
    const allEndpoints = _collectAllEndpoints(allNodes);
    if (allEndpoints.length) {
      doc.push(subTitle(lastSecNum + '.3 Endpoints API'));
      doc.push(new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: [800, 2000, 3560, 2200, 800],
        rows: [
          headerRow([['Méthode', 800], ['Connexion', 2000], ['URL complète', 3560], ['Nœud', 2200], ['Codes ignorés', 800]]),
          ...allEndpoints.map((e, i) => dataRow([e.method, e.conn, e.url, e.node, e.ignore||'—'], i, [800, 2000, 3560, 2200, 800]))
        ]
      }));
      doc.push(sp());
    }

    // ── CONSTRUCTION DU DOCUMENT ──────────────────────────────

    // ── Logos Askida ────────────────────────────────────────────
    // Le chargement passait par window.wfdEngine.readAsBase64, une API
    // Electron. Depuis le passage a l'architecture serveur, cet objet
    // n'existe plus dans le navigateur : la condition etait toujours fausse,
    // les logos ne se chargeaient jamais et le document retombait
    // silencieusement sur le texte de repli. La charte graphique avait
    // disparu sans qu'aucune erreur ne le signale.
    //
    // Les images sont servies par Express depuis /public : un fetch sur le
    // meme chemin relatif suffit. L'appel Electron reste tente en premier
    // pour rester compatible avec une execution en application de bureau.
    let _logoHeaderB64 = null;
    let _logoFooterB64 = null;

    const _chargerLogo = async (chemin) => {
      if (window.wfdEngine && typeof window.wfdEngine.readAsBase64 === 'function') {
        try {
          const r = await window.wfdEngine.readAsBase64(chemin);
          if (r && r.ok) return r.data;
        } catch (_) { /* on tente le fetch ci-dessous */ }
      }
      try {
        const rep = await fetch(chemin);
        if (!rep.ok) { console.warn('WFD Word: logo introuvable —', chemin, rep.status); return null; }
        return new Uint8Array(await rep.arrayBuffer());
      } catch (e) {
        console.warn('WFD Word: logo non charge —', chemin, e.message);
        return null;
      }
    };

    _logoHeaderB64 = await _chargerLogo(_ASKIDA_LOGO_HEADER_PATH);
    _logoFooterB64 = await _chargerLogo(_ASKIDA_LOGO_FOOTER_PATH);

    // Construit un ImageRun si les données sont disponibles, sinon null
    const _mkLogo = (b64, w, h) => b64 ? new ImageRun({ data: b64, transformation: { width: w, height: h }, type: 'png' }) : null;

    const _logoHeaderRun = _mkLogo(_logoHeaderB64, 200, 40);
    const _logoFooterRun = _mkLogo(_logoFooterB64, 200, 17);

    // ── PAGE DE GARDE (section portrait séparée) ───────────────
    const coverPage = [];
    coverPage.push(new Paragraph({ spacing:{ before:0, after:320 }, children:[_logoHeaderB64 ? new ImageRun({ data:_logoHeaderB64, transformation:{ width:300, height:60 }, type:'png' }) : new TextRun({ text: 'Aski-da Managed Services', size: 32, bold: true, font: 'Arial', color: '0F4761' })] }));
    coverPage.push(sp());
    coverPage.push(txt(flux.name || 'Workflow', { size: 56, bold: true, color: '0F4761', before: 800, after: 320 }));
    coverPage.push(txt('Spécifications Techniques et Fonctionnelles', { size: 26, color: '444444', after: 600 }));
    coverPage.push(new Table({
      width: { size: 4800, type: WidthType.DXA },
      columnWidths: [1800, 3000],
      rows: [
        new TableRow({ cantSplit: true, children: [cell('Client',    { fill: 'F2F2F2', w: 1800, size: 16, color: '555555' }), cell(org,         { w: 3000, size: 16 })] }),
        new TableRow({ cantSplit: true, children: [cell('Version',   { fill: 'F2F2F2', w: 1800, size: 16, color: '555555' }), cell('1.0 — ' + dateStr.replace(/^\w+\s/, ''), { w: 3000, size: 16 })] }),
        new TableRow({ cantSplit: true, children: [cell('Statut',    { fill: 'F2F2F2', w: 1800, size: 16, color: '555555' }), cell('Draft — Validation en cours',            { w: 3000, size: 16 })] }),
        new TableRow({ cantSplit: true, children: [cell('Généré le', { fill: 'F2F2F2', w: 1800, size: 16, color: '555555' }), cell(dateStr,      { w: 3000, size: 16 })] }),
      ]
    }));


    // ── Header : logo gauche | nom du workflow droite ────────────
    // keepLines sur les petits paragraphes des étapes
    const _keepPara = (children, opts = {}) => new Paragraph({
      spacing: { before: opts.before || 0, after: opts.after || 60 },
      indent:  opts.indent ? { left: opts.indent } : undefined,
      border:  opts.borderLeft ? { left: { style: BorderStyle.SINGLE, size: 6, color: opts.borderLeft, space: 6 } } : undefined,
      widowControl: true,
      children
    });

    const _header = new Header({
      children: [
        new Paragraph({
          border:   { bottom: { style: BorderStyle.SINGLE, size: 4, color: '0F4761', space: 1 } },
          spacing:  { before: 0, after: 120 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            ...(_logoHeaderRun ? [_logoHeaderRun] : [new TextRun({ text: 'Aski-da', size: 18, font: 'Arial', bold: true, color: '0F4761' })]),
            new TextRun({ text: '\t', font: 'Arial' }),
            new TextRun({
              text:  flux.name || '',
              size:  18,
              bold:  true,
              font:  'Arial',
              color: '0F4761'
            })
          ]
        })
      ]
    });

    // ── Footer : confidentiel gauche | page centre | logo droite ─
    // Largeur utile portrait A4 = 9360 DXA, centre = 4680
    const _footer = new Footer({
      children: [
        new Paragraph({
          border:   { top: { style: BorderStyle.SINGLE, size: 4, color: '0F4761', space: 1 } },
          spacing:  { before: 120, after: 0 },
          tabStops: [
            { type: TabStopType.CENTER, position: 4680 },
            { type: TabStopType.RIGHT,  position: TabStopPosition.MAX }
          ],
          children: [
            // Gauche : mention confidentielle
            new TextRun({ text: 'Aski-da  |  Document Confidentiel', size: 14, font: 'Arial', color: '888888' }),
            // Centre : numérotation
            new TextRun({ text: '\t', font: 'Arial' }),
            new TextRun({ text: 'Page ', size: 14, font: 'Arial', color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Arial', color: '888888' }),
            new TextRun({ text: ' / ', size: 14, font: 'Arial', color: '888888' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: 'Arial', color: '888888' }),
            // Droite : pictogramme
            new TextRun({ text: '\t', font: 'Arial' }),
            ...(_logoFooterRun ? [_logoFooterRun] : [new TextRun({ text: 'Aski-da', size: 14, font: 'Arial', color: '888888' })])
          ]
        })
      ]
    });

    const wordDoc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 22 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, font: 'Arial', color: '0F4761' },
            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } }
        ]
      },
      sections: [
        // Section 1 : portrait — page de garde (sans header/footer)
        {
          properties: {
            page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
          },
          children: coverPage
        },
        // Section 2 : paysage — schéma graphique (sans header/footer)
        // Retiree entierement quand le schema est desactive : une section
        // sans contenu laisserait une page blanche en travers du document.
        ...(INCLURE_SCHEMA ? [{
          properties: {
            page: { size: { width: 16838, height: 11906 }, margin: { top: 851, right: 851, bottom: 851, left: 851 } }
          },
          children: flowchartElements
        }] : []),
        // Section 3 : portrait — document avec header/footer Askida
        {
          headers: { default: _header },
          footers: { default: _footer },
          properties: {
            page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1134, bottom: 1200, left: 1134 } }
          },
          children: doc
        }
      ]
    });

    const blob = await Packer.toBlob(wordDoc);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'workflow-' + (flux.name || 'export').toLowerCase().replace(/\s+/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.docx';
    a.click();
    URL.revokeObjectURL(url);
    toast('Export Word généré ✓');

  } catch (err) {
    console.error(err);
    toast('Erreur export : ' + err.message, true);
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES — appelés par exporterWordFlux
// ═══════════════════════════════════════════════════════════════

// ── Tri BFS des nœuds dans l'ordre séquentiel ────────────────
// ── Regroupement des noeuds par branche ───────────────────────
// La section 5 enumerait les noeuds dans l'ordre du tri topologique. Sur un
// workflow a branches paralleles, la lecture saute d'une branche a l'autre
// (Collection Check, Fetch Saison, Collection Check, Count ?...) et les noms
// se repetent sans qu'on puisse les distinguer : quatre "Collection Check",
// six "Attendre", six "AWS S3". Le lecteur ne peut pas suivre.
//
// On identifie la decision qui ouvre les branches — celle dont les ports
// mènent aux sous-graphes exclusifs les plus larges — puis on classe chaque
// noeud : tronc commun (avant la decision, ou partage par plusieurs
// branches), ou branche donnee. Le document raconte alors un parcours par
// niveau au lieu d'une liste plate.
function _groupNodesByBranch(nodes, conns) {
  const out = {};
  conns.forEach(c => { (out[c.fromNode] = out[c.fromNode] || []).push(c); });

  function reachable(startId) {
    const seen = new Set(); const stack = [startId];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      (out[cur] || []).forEach(c => stack.push(c.toNode));
    }
    return seen;
  }

  // La bonne decision est celle qui separe le plus : on compte les noeuds
  // atteignables par un seul de ses ports.
  let best = null;
  nodes.filter(n => n.family === 'decision').forEach(dec => {
    const ports = out[dec.id] || [];
    if (ports.length < 2) return;
    const sets = ports.map(c => ({ port: c.fromPort, set: reachable(c.toNode) }));
    let exclusive = 0;
    sets.forEach((s, i) => s.set.forEach(id => {
      if (!sets.some((o, j) => j !== i && o.set.has(id))) exclusive++;
    }));
    if (!best || exclusive > best.exclusive) best = { dec, sets, exclusive };
  });

  // Pas de branches nettes : on garde la presentation lineaire.
  if (!best || best.exclusive < 3) return null;

  function labelOf(port) {
    const ps = (typeof buildPortsDef === 'function')
      ? (buildPortsDef(best.dec.family, best.dec.config || {}).outputs || []) : [];
    return (ps[port] && ps[port].label) || ('Branche ' + (port + 1));
  }

  const assign = {};
  best.sets.forEach((s, i) => s.set.forEach(id => {
    if (best.sets.some((o, j) => j !== i && o.set.has(id))) { assign[id] = null; return; }
    if (assign[id] === undefined) assign[id] = labelOf(s.port);
  }));

  // Le tronc commun couvre deux moments opposes : ce qui precede
  // l'aiguillage (identification, controles) et ce qui suit la reconvergence
  // (publication, verification, statut). Les melanger brouillerait le recit ;
  // on les separe en regardant si le noeud peut ATTEINDRE la decision.
  const groups = [];
  const commun = nodes.filter(n => !assign[n.id]);
  const amont  = commun.filter(n => n.id === best.dec.id || reachable(n.id).has(best.dec.id));
  const aval   = commun.filter(n => !amont.some(x => x.id === n.id));
  if (amont.length) groups.push({ label: 'Etapes communes — avant aiguillage', nodes: amont });
  const vus = new Set();
  best.sets.forEach(s => {
    const lbl = labelOf(s.port);
    if (vus.has(lbl)) return;
    vus.add(lbl);
    const ns = nodes.filter(n => assign[n.id] === lbl);
    if (ns.length) groups.push({ label: 'Branche ' + lbl, nodes: ns });
  });
  if (aval.length) groups.push({ label: 'Etapes communes — publication et verification', nodes: aval });
  return groups.length > 1 ? groups : null;
}

// ── Tri par flux ──────────────────────────────────────────────
function _sortNodesByFlow(nodes, conns) {
  const inDeg = {};
  nodes.forEach(n => { inDeg[n.id] = 0; });
  conns.forEach(c => { if (inDeg[c.toNode] !== undefined) inDeg[c.toNode]++; });
  const sources = nodes.filter(n => inDeg[n.id] === 0);
  const visited = new Set(sources.map(n => n.id));
  const result  = [...sources];
  const tmpDeg  = { ...inDeg };
  let head = 0;
  while (head < result.length) {
    const cur = result[head++];
    conns.filter(c => c.fromNode === cur.id).forEach(c => {
      if (visited.has(c.toNode)) return;
      tmpDeg[c.toNode]--;
      if (tmpDeg[c.toNode] <= 0) {
        const n = nodes.find(x => x.id === c.toNode);
        if (n) { visited.add(n.id); result.push(n); }
      }
    });
  }
  nodes.forEach(n => { if (!visited.has(n.id)) result.push(n); });
  return result;
}

// ── Couleur de famille ────────────────────────────────────────
function _famColor(family) {
  const map = {
    trigger:'0F4761', watchfolder:'0F4761', timer:'0F4761', listener:'0F4761',
    fetch:'5B3FA6', lookup:'5B3FA6', set_var:'5B3FA6', transform:'5B3FA6',
    rename:'5B3FA6', id_generator:'5B3FA6',
    decision:'C0580A', loop:'C0580A', qc:'C0580A', checker:'C0580A', approval:'C0580A',
    action:'1B6B45', update_meta:'1B6B45', acl:'1B6B45', create_asset:'1B6B45',
    create_col:'1B6B45', link_file:'1B6B45', cast:'1B6B45', transcode:'1B6B45',
    export_file:'1B6B45', publish:'1B6B45', http_request:'1B6B45', aws_s3:'1B6B45',
    workflow_history:'3A5F7A', wait_for:'3A5F7A', notification:'3A5F7A',
    notify_post:'3A5F7A', gate:'3A5F7A', subflow:'3A5F7A', relate:'3A5F7A',
    script:'8B2020', manual:'8B2020'
  };
  return map[family] || '555555';
}

// ── Périmètre auto depuis les familles présentes ──────────────
function _buildPerimeter(nodes) {
  const lines = [];
  if (nodes.some(n => n.family === 'aws_s3'))
    lines.push('Vérification de la présence des fichiers dans le stockage S3 de livraison.');
  if (nodes.some(n => n.family === 'action'))
    lines.push('Export des essences (vidéo, poster, sous-titres) vers le bucket S3.');
  if (nodes.some(n => n.family === 'http_request'))
    lines.push('Création ou mise à jour du contenu dans la plateforme de distribution avec les métadonnées source.');
  if (nodes.some(n => n.family === 'fetch'))
    lines.push('Lecture des métadonnées depuis le MAM source.');
  if (nodes.some(n => n.family === 'workflow_history'))
    lines.push('Suivi du statut de livraison avec historisation dans le MAM.');
  if (!lines.length)
    lines.push('Orchestration des étapes du workflow ' + (nodes[0]?.name || '') + '.');
  return lines;
}

// ── Systèmes impliqués ────────────────────────────────────────
function _buildSystems(nodes) {
  const systems = [];
  const fams = new Set(nodes.map(n => n.family));

  if (['trigger','watchfolder','fetch','action','update_meta'].some(f => fams.has(f)))
    systems.push({ name: 'Iconik', role: 'MAM — Source de vérité', usage: 'Métadonnées, déclencheur, stockage source, export S3' });

  // Détecte VodFactory via les URLs des nœuds http_request
  const httpNodes = nodes.filter(n => n.family === 'http_request');
  const vodUrls   = httpNodes.filter(n => (n.config?.url || '').toLowerCase().includes('vodfactory'));
  if (vodUrls.length || httpNodes.length)
    systems.push({ name: 'API externe', role: 'Plateforme de distribution', usage: 'Catalogue contenus, récupération des assets depuis S3' });

  if (fams.has('aws_s3'))
    systems.push({ name: 'AWS S3', role: 'Stockage intermédiaire', usage: _getS3Usage(nodes) });

  systems.push({ name: 'Orchestrateur', role: 'Moteur de workflow', usage: 'Coordination de l\'ensemble des étapes, gestion des erreurs et de l\'historique' });
  return systems;
}

function _getS3Usage(nodes) {
  const n = nodes.find(x => x.family === 'aws_s3');
  if (!n) return 'Stockage des fichiers';
  const cfg = n.config || {};
  let u = '';
  if (cfg.bucket) u += 'Bucket ' + cfg.bucket;
  if (cfg.objectKey) u += ' — dossier ' + cfg.objectKey;
  return u || 'Stockage des fichiers';
}

// ── Champs de métadonnées depuis fetch + mapping ──────────────

// ── Enrichissement description nœud depuis wfdData ────────────
function _enrichNodeDesc(node) {
  const cfg = node.config || {};
  const parts = [];

  if (cfg.description) parts.push(cfg.description);

  switch (node.family) {
    case 'trigger':
    case 'listener': {
      if (cfg.eventType) {
        const evtLabels = {
          custom_action: 'Custom Action Iconik',
          metadata_changed: 'Metadata changée',
          asset_created: 'Asset créé',
          asset_status_changed: 'Statut asset changé',
          asset_added_collection: 'Asset ajouté à une collection',
          proxy_available: 'Proxy disponible',
          job_finished: 'Job terminé',
        };
        parts.push(evtLabels[cfg.eventType] || cfg.eventType);
      }
      // Nom de la custom action depuis wfdData
      if (cfg.eventType === 'custom_action' && cfg.customActionId && typeof wfdData !== 'undefined') {
        const ca = (wfdData.customActions || []).find(a => a.id === cfg.customActionId);
        if (ca) parts.push('Action : ' + (ca.title || ca.nom || ca.name || cfg.customActionId));
      }
      break;
    }
    case 'fetch': {
      if (typeof wfdData !== 'undefined' && wfdData.mdViews) {
        const view = wfdData.mdViews.find(v => v.id === (cfg.metadataViewId || cfg.fetchMdViewId));
        if (view) parts.push('Vue : ' + view.name);
      }
      break;
    }
    case 'lookup': {
      const lkRows = cfg.lkRows || [];
      if (lkRows.length) parts.push(lkRows.length + ' champs mappés');
      if (cfg.lkInputVar)  parts.push('Entrée : {' + cfg.lkInputVar + '}');
      if (cfg.lkOutputVar) parts.push('Sortie : {' + cfg.lkOutputVar + '}');
      break;
    }
    case 'wait_for': {
      if (cfg.expected)  parts.push('Attend : ' + cfg.expected);
      if (cfg.interval && cfg.maxRetries)
        parts.push(cfg.interval + 's × ' + cfg.maxRetries + ' essais');
      break;
    }
    case 'checker': {
      const checks = cfg.checks || [];
      if (checks.length) parts.push(checks.length + ' vérification(s)');
      break;
    }
    case 'workflow_history': {
      const modeLabel = cfg.mode === 'update' ? 'Mise à jour' : 'Ajout';
      parts.push(modeLabel);
      if (cfg.message) parts.push(cfg.message.slice(0, 60));
      break;
    }
    case 'aws_s3': {
      const conn = (typeof wfdConnexions !== 'undefined' && cfg.connexionId)
        ? wfdConnexions.find(c => c.id === cfg.connexionId) : null;
      const bucket = conn?.awsBucket || cfg.bucket || '';
      const prefix = cfg.objectKey || '';
      if (bucket) parts.push('Bucket : ' + bucket);
      if (prefix) parts.push('Préfixe : ' + prefix);
      break;
    }
    case 'http_request':
    case 'http_group': {
      const conn = (typeof wfdConnexions !== 'undefined' && cfg.connexionId)
        ? wfdConnexions.find(c => c.id === cfg.connexionId) : null;
      if (conn) parts.push(conn.name);
      if (cfg.method && cfg.url) parts.push(cfg.method + ' ' + cfg.url.split('/').slice(-2).join('/'));
      break;
    }
    case 'decision': {
      if (cfg.field) parts.push('Sur : ' + cfg.field);
      const conds = (cfg.conditions || []).map(c => c.label || c.op).filter(Boolean);
      if (conds.length) parts.push(conds.join(' / '));
      break;
    }
  }

  return parts.filter(Boolean).join(' — ').slice(0, 120);
}

// ── Champs MD depuis wfdData.metadata + lkRows + update_meta ──
function _buildMetadataFields(nodes, mappingRows) {
  const fields = [];
  const seen   = new Set();

  // Index wfdData.metadata par name pour enrichissement rapide
  const metaIndex = {};
  if (typeof wfdData !== 'undefined' && wfdData.metadata) {
    wfdData.metadata.forEach(f => {
      const n = f.name || f.nom || '';
      if (n) metaIndex[n] = f;
    });
  }

  const addField = (key, tgt, rType, fallback) => {
    const src = (key || '').replace(/^metadata\./, '').replace(/\./g, ' › ');
    if (!src || seen.has(src)) return;
    seen.add(src);

    // Enrichissement depuis wfdData.metadata
    const meta = metaIndex[key] || metaIndex[src] || {};
    const label = meta.label || meta.nom_affichage || src;
    const fieldType = meta.field_type || rType || 'string';
    const required  = meta.required || false;

    const typeLabel = fieldType === 'integer'   ? 'Integer'
                    : fieldType === 'float'     ? 'Float'
                    : fieldType === 'boolean'   ? 'Boolean'
                    : fieldType === 'tag_cloud' ? 'Tag list'
                    : fieldType === 'text'      ? 'Text'
                    : fieldType === 'date'      ? 'Date'
                    : 'String';

    fields.push({ name: src, label, type: typeLabel, required, vod: tgt || '—', usage: fallback ? 'Défaut : ' + fallback : '' });
  };

  // Source 1 : lkRows du Lookup (champs utilisés dans le mapping)
  mappingRows.forEach(r => {
    const key  = r.key  || r.src  || '';
    const tgt  = r.value || r.tgt || '';
    const rType = r.type || '';
    const fb   = r.fallback || '';
    if (key) addField(key, tgt, rType, fb);
  });

  // Source 2 : update_meta nodes (champs écrits)
  nodes.filter(n => n.family === 'update_meta').forEach(node => {
    const flds = node.config?.fields || node.config?.values || [];
    flds.forEach(f => {
      const key = f.field || f.key || f.name || '';
      if (key) addField(key, '', '', '');
    });
  });

  return fields;
}

// ── Connexions API depuis wfdConnexions (filtrées sur le flux) ──
function _buildApiConnectionsFromNodes(nodes) {
  const used = new Set();
  nodes.forEach(n => {
    const cid = n.config?.connexionId || '';
    if (cid) used.add(cid);
  });

  const conns = [];

  // Connexions explicitement référencées
  if (typeof wfdConnexions !== 'undefined') {
    wfdConnexions.filter(c => used.has(c.id)).forEach(c => {
      const authLabels = {
        bearer: 'Bearer Token', apikey_header: 'API Key', basic: 'Basic Auth',
        aws_s3: 'AWS Sig V4', none: 'Aucune'
      };
      let params = '';
      if (c.awsRegion) params += 'Région : ' + c.awsRegion;
      if (c.awsBucket) params += (params ? ' — ' : '') + 'Bucket : ' + c.awsBucket;
      if (c.apiSpec?.title) params += (params ? ' — ' : '') + 'Spec : ' + c.apiSpec.title;
      conns.push({
        name:    c.name || c.id,
        type:    authLabels[c.authType] || c.authType || '—',
        baseUrl: c.baseUrl || '—',
        params:  params || '—'
      });
    });
  }

  // Iconik si des noeuds fetch/action/update_meta sont présents
  const hasIconik = nodes.some(n => ['fetch','action','update_meta','trigger','listener'].includes(n.family));
  if (hasIconik) {
    conns.unshift({
      name:    'Iconik',
      type:    'App-ID + Auth-Token',
      baseUrl: 'https://app.iconik.io',
      params:  'Headers : App-ID, Auth-Token'
    });
  }

  return conns;
}

// ── Collecte toutes les variables {xxx} du workflow ───────────
function _collectAllVars(nodes) {
  const varMap = {};   // varName → { type, producers[], consumers[] }

  const register = (varName, role, nodeName, type) => {
    if (!varName || varName.includes(' ') || varName.length > 60) return;
    if (!varMap[varName]) varMap[varName] = { type: type || 'any', producers: [], consumers: [] };
    if (role === 'produce' && !varMap[varName].producers.includes(nodeName))
      varMap[varName].producers.push(nodeName);
    if (role === 'consume' && !varMap[varName].consumers.includes(nodeName))
      varMap[varName].consumers.push(nodeName);
    if (type && varMap[varName].type === 'any') varMap[varName].type = type;
  };

  nodes.forEach(n => {
    const cfg  = n.config || {};
    const name = n.name || n.id;

    switch (n.family) {
      case 'fetch':
        if (cfg.lkInputVar || cfg.fetchVar || cfg.storeAs)
          register(cfg.lkInputVar || cfg.fetchVar || cfg.storeAs, 'produce', name, 'object');
        break;
      case 'lookup':
        if (cfg.lkInputVar)  register(cfg.lkInputVar,  'consume', name, 'object');
        if (cfg.lkOutputVar) register(cfg.lkOutputVar, 'produce', name, 'object');
        break;
      case 'aws_s3': {
        const _s3mv = (cfg.s3Mappings && cfg.s3Mappings.length)
          ? cfg.s3Mappings
          : [
              cfg.s3VarVideo ? { variable: cfg.s3VarVideo } : null,
              cfg.s3ImageVar ? { variable: cfg.s3VarImage } : null,
              cfg.s3VarSrt   ? { variable: cfg.s3VarSrt   } : null,
            ].filter(Boolean);
        _s3mv.forEach(function(m){ if (m.variable) register(m.variable, 'produce', name, 'URL S3'); });
        // Variables consommées dans le préfixe
        _extractTemplatevars(cfg.objectKey || '').forEach(v => register(v, 'consume', name, ''));
        break;
      }
      case 'http_request':
      case 'http_group': {
        const reqs = n.requests || [n];
        reqs.forEach(r => {
          const rcfg = r.config || {};
          _extractTemplatevars((rcfg.bodyTemplate||'') + ' ' + (rcfg.url||'')).forEach(v => register(v, 'consume', name, ''));
          if (rcfg.responseVar) register(rcfg.responseVar, 'produce', name, 'object');
        });
        break;
      }
      case 'http_sequence': {
        (cfg.steps || []).forEach(function(step, i) {
          _extractTemplatevars((step.bodyTemplate||'') + ' ' + (step.feBody||'') + ' ' + (step.endpoint||'')).forEach(function(v){ register(v, 'consume', name, ''); });
          if (step.feSourceVar) _extractTemplatevars(step.feSourceVar).forEach(function(v){ register(v, 'consume', name, ''); });
          if (step.sourceVar)   _extractTemplatevars(step.sourceVar).forEach(function(v){ register(v, 'consume', name, ''); });
          if (step.resultVar)   register(step.resultVar,   'produce', name, 'object');
          if (step.feResultVar) register(step.feResultVar, 'produce', name, 'array');
        });
        break;
      }
      case 'wait_for':
        _extractTemplatevars(cfg.endpoint || '').forEach(v => register(v, 'consume', name, ''));
        break;
      case 'workflow_history':
        _extractTemplatevars(cfg.message || '').forEach(v => register(v, 'consume', name, ''));
        break;
      case 'update_meta':
        _extractTemplatevars(JSON.stringify(cfg.fields || cfg.values || [])).forEach(v => register(v, 'consume', name, ''));
        break;
      case 'id_generator':
        if (cfg.outputVar) register(cfg.outputVar, 'produce', name, 'integer');
        break;
      case 'checker':
        (cfg.checks || []).forEach(c => {
          _extractTemplatevars(c.endpoint || '').forEach(v => register(v, 'consume', name, ''));
        });
        break;
    }
  });

  return Object.entries(varMap).sort((a,b) => a[0].localeCompare(b[0])).map(([name, v]) => ({
    name,
    type:      v.type === 'any' ? '—' : v.type,
    producer:  v.producers.join(', ') || '— (contexte déclencheur)',
    consumers: v.consumers.join(', ') || '—'
  }));
}

// ── Collecte tous les endpoints API du workflow ───────────────
function _collectAllEndpoints(nodes) {
  const endpoints = [];

  nodes.forEach(n => {
    const cfg  = n.config || {};
    const conn = (typeof wfdConnexions !== 'undefined' && cfg.connexionId)
      ? wfdConnexions.find(c => c.id === cfg.connexionId) : null;
    const base = conn?.baseUrl || '';
    const name = n.name || '';

    if (n.family === 'http_request') {
      const url    = cfg.url || '';
      const method = cfg.method || 'POST';
      const full   = (url.startsWith('http') ? '' : base) + url;
      endpoints.push({
        method, conn: conn?.name || '—',
        url: full || url,
        node: name,
        ignore: (cfg.ignoreCodes || []).join(', ') || ''
      });
    }

    if (n.family === 'http_sequence') {
      (cfg.steps || []).forEach(function(step, i) {
        const ep  = step.endpoint || step.url || '';
        const mth = step.method   || 'POST';
        endpoints.push({
          method: mth,
          conn  : conn?.name || '—',
          url   : (ep.startsWith('http') ? '' : base) + ep,
          node  : name + ' › ' + (step.name || ('Étape ' + (i+1))),
          ignore: (step.feIgnoreCodes || []).join(', ') || ''
        });
      });
    }

    if (n.family === 'http_group') {
      (n.requests || []).forEach(r => {
        const rcfg   = r.config || {};
        const rconn  = (typeof wfdConnexions !== 'undefined' && rcfg.connexionId)
          ? wfdConnexions.find(c => c.id === rcfg.connexionId) : conn;
        const rbase  = rconn?.baseUrl || base;
        const url    = rcfg.url || '';
        const method = rcfg.method || 'POST';
        const full   = (url.startsWith('http') ? '' : rbase) + url;
        endpoints.push({
          method, conn: rconn?.name || conn?.name || '—',
          url: full || url,
          node: r.name || name,
          ignore: (rcfg.ignoreCodes || []).join(', ') || ''
        });
      });
    }

    if (n.family === 'aws_s3') {
      const rconn  = (typeof wfdConnexions !== 'undefined' && cfg.connexionId)
        ? wfdConnexions.find(c => c.id === cfg.connexionId) : null;
      const bucket = rconn?.awsBucket || cfg.bucket || '{bucket}';
      const prefix = cfg.objectKey || '';
      endpoints.push({
        method: 'LIST', conn: rconn?.name || 'AWS S3',
        url: 'https://s3.amazonaws.com/' + bucket + (prefix ? '?prefix=' + prefix : ''),
        node: name, ignore: ''
      });
    }

    if (n.family === 'wait_for' && cfg.endpoint) {
      endpoints.push({
        method: 'GET', conn: conn?.name || '—',
        url: (cfg.endpoint.startsWith('http') ? '' : base) + cfg.endpoint,
        node: name, ignore: ''
      });
    }

    if (n.family === 'checker') {
      (cfg.checks || []).forEach(c => {
        endpoints.push({
          method: c.method || 'GET', conn: conn?.name || '—',
          url: (c.endpoint || '').startsWith('http') ? c.endpoint : base + (c.endpoint || ''),
          node: name + (c.label ? ' — ' + c.label : ''), ignore: ''
        });
      });
    }
  });

  return endpoints;
}

function _hasSignificantConfig(node) {
  if (node.family === 'http_group') return true;
  const cfg = node.config || {};
  const skip = ['postit', 'manual'];
  if (skip.includes(node.family)) return false;
  // Exclut les nœuds sans config réelle
  const keys = Object.keys(cfg).filter(k => !['description','name'].includes(k) && cfg[k] !== '' && cfg[k] !== false && cfg[k] !== null && cfg[k] !== undefined);
  return keys.length > 0;
}

// ── Specs techniques d'un nœud ────────────────────────────────
function _buildNodeSpecs(node, cfg, det, mappingRows, conns, allNodes) {
  const specs = [];
  const sub   = (det.sub || '').replace(/<[^>]+>/g, '').trim();

  const add  = (label, value, opts = {}) => { if (value !== undefined && value !== null && value !== '') specs.push({ label, value: String(value), ...opts }); };
  const addL = (label, lines)            => { if (lines && lines.length) specs.push({ label, lines }); };

  // Infos communes
  if (sub)             add('Description', sub);
  if (cfg.description) add('Note', cfg.description);

  // Connexion associée (présente sur presque tous les nœuds)
  const conn = (typeof wfdConnexions !== 'undefined' && cfg.connexionId)
    ? wfdConnexions.find(x => x.id === cfg.connexionId) : null;

  switch (node.family) {

    // ── Minuterie ────────────────────────────────────────────
    // Traitee a part : une minuterie n'a ni asset ni contexte de selection,
    // la ligne "Asset ID transmis" du declencheur manuel n'a aucun sens ici.
    // Et l'expression cron brute n'est lisible que par qui en connait la
    // syntaxe - le noeud porte pourtant la frequence en clair.
    case 'timer': {
      const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      const hh = String(cfg.cronHour ?? 0).padStart(2, '0');
      const mm = String(cfg.cronMinute ?? 0).padStart(2, '0');

      if (cfg.timerMode === 'cron') {
        let quand;
        if (cfg.cronFreq === 'daily') {
          quand = 'Tous les jours à ' + hh + ':' + mm;
        } else if (cfg.cronFreq === 'weekly') {
          const js = (cfg.cronDays || []).map(d => JOURS[d]).filter(Boolean);
          quand = 'Toutes les semaines à ' + hh + ':' + mm + (js.length ? ' — ' + js.join(', ') : '');
        } else if (cfg.cronFreq === 'monthly') {
          quand = 'Tous les mois le ' + (cfg.cronMday || 1) + ' à ' + hh + ':' + mm;
        } else {
          quand = 'Selon l\'expression ci-dessous';
        }
        add('Déclenchement', quand);
        add('Fuseau horaire', cfg.timezone || 'Heure du serveur');
        add('Expression cron', cfg.cronExpr, { mono: true });

      } else if (cfg.timerMode === 'oneshot') {
        add('Déclenchement', 'Une seule fois');
        add('Date et heure', cfg.oneshotDatetime);
        add('Fuseau horaire', cfg.timezone || 'Heure du serveur');

      } else {
        const U = { minutes: 'minute(s)', hours: 'heure(s)', days: 'jour(s)' };
        add('Déclenchement', 'Toutes les ' + (cfg.intervalVal || '?') + ' ' + (U[cfg.intervalUnit] || cfg.intervalUnit || ''));
        add('Première exécution', cfg.intervalStart);
      }

      add('Données transmises', 'Aucune — le workflow part sans contexte et recherche lui-même les objets à traiter.');
      break;
    }

    case 'trigger':
    case 'watchfolder':
    case 'listener': {
      add('Type d\'événement', cfg.eventType || cfg.variant);
      add('Asset ID transmis', cfg.assetId || 'Oui — via le contexte du déclencheur');
      break;
    }

    case 'fetch': {
      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'GET métadonnées asset');
      add('Vue métadonnées (ID)', cfg.metadataViewId || cfg.fetchMdViewId, { mono: true });
      // Nom de la vue si disponible dans wfdData
      if (typeof wfdData !== 'undefined' && wfdData.mdViews) {
        const view = wfdData.mdViews.find(v => (v.id || v.name) === (cfg.metadataViewId || cfg.fetchMdViewId));
        if (view) add('Vue métadonnées (nom)', view.name || view.label || '');
      }
      add('Avec formats techniques', cfg.withFormats ? 'Oui' : 'Non');
      add('Avec collections parentes', cfg.withCollections ? 'Oui' : 'Non');
      break;
    }

    case 'aws_s3': {
      if (conn) {
        add('Connexion', conn.name);
        add('Région AWS', conn.awsRegion || cfg.region, { mono: true });
        add('Bucket', conn.awsBucket || cfg.bucket, { mono: true });
      } else {
        add('Région AWS', cfg.region, { mono: true });
        add('Bucket', cfg.bucket, { mono: true });
      }
      add('Protocole', 'HTTPS — AWS S3 REST API avec Signature V4');
      add('Opération', cfg.operation || 'LIST objects (GET avec query list-type=2&prefix=)');
      add('Chemin / Préfixe', cfg.objectKey, { mono: true });
      add('Résultat si KeyCount > 0', 'Bypass export — extraction des URLs S3');
      add('Résultat si KeyCount = 0', 'Déclenchement de l\'export');
      // Mappings configurables (s3Mappings) avec fallback anciens champs
      const _s3m = (cfg.s3Mappings && cfg.s3Mappings.length)
        ? cfg.s3Mappings
        : [
            cfg.s3VarVideo ? { type:'video',    filter:'.mp4,.mov', variable: cfg.s3VarVideo } : null,
            cfg.s3VarImage ? { type:'image',    filter:'_poster,.jpg,.png', variable: cfg.s3VarImage } : null,
            cfg.s3VarSrt   ? { type:'subtitle', filter:'.srt,.vtt', variable: cfg.s3VarSrt } : null,
          ].filter(Boolean);
      if (_s3m.length) {
        addL('Variables produites (post-action)', _s3m.map(function(m) {
          const typeLabels = { video:'Vidéo', image:'Image/Poster', subtitle:'Sous-titres', custom:'Custom' };
          return { label: (typeLabels[m.type]||m.type) + '  [filtre: ' + (m.filter||'') + ']', value: '{' + m.variable + '}' };
        }));
      }
      break;
    }

    case 'action': {
      if (cfg.actionType && typeof ACTION_TYPES !== 'undefined' && ACTION_TYPES[cfg.actionType]) {
        const at = ACTION_TYPES[cfg.actionType];
        add('Type d\'action', at.label || cfg.actionType);
        add('API Iconik', at.endpoint || '', { mono: true });
      }
      add('Export Location ID', cfg.exportLocationId, { mono: true });
      add('Créer sous-dossier asset', cfg.exportToAssetFolder !== undefined ? (cfg.exportToAssetFolder ? 'Oui' : 'Non') : undefined);
      add('Nom de fichier', cfg.fileName);
      add('Écraser si existant', cfg.overwrite !== undefined ? (cfg.overwrite ? 'Oui' : 'Non') : undefined);
      add('Retour', 'job_id — identifiant du job d\'export à suivre');
      break;
    }

    case 'wait_for': {
      if (conn) add('Connexion', conn.name + (conn.baseUrl ? ' — ' + conn.baseUrl : ''));
      add('Protocole', 'HTTPS — polling HTTP');
      add('Endpoint', cfg.endpoint, { mono: true });
      add('Champ vérifié (JSON path)', cfg.path, { mono: true });
      add('Valeur attendue', cfg.expected);
      add('Valeurs d\'échec immédiates', cfg.failValues);
      add('Délai entre essais', cfg.interval ? cfg.interval + ' secondes' : undefined);
      add('Nombre max d\'essais', cfg.maxRetries);
      if (cfg.interval && cfg.maxRetries)
        add('Timeout total', (parseInt(cfg.interval || 0) * parseInt(cfg.maxRetries || 0)) + ' secondes');
      break;
    }

    case 'decision': {
      add('Champ évalué', cfg.field);
      const conds = cfg.conditions || [];
      if (conds.length) {
        addL('Conditions de routage', conds.map(c => ({
          label: c.label || ('Port ' + (conds.indexOf(c) + 1)),
          value: (typeof DECISION_OPS !== 'undefined' ? (DECISION_OPS[c.op] || c.op || '') : (c.op || '')) +
                 (c.value !== undefined && c.value !== '' ? ' "' + c.value + '"' : '')
        })));
      }
      break;
    }

    case 'checker': {
      if (conn) add('Connexion', conn.name + (conn.baseUrl ? ' — ' + conn.baseUrl : ''));
      const checks = cfg.checks || [];
      if (checks.length) {
        addL('Vérifications configurées', checks.map(c => ({
          label: c.label || c.endpoint || '',
          value: (c.method || 'GET') + ' ' + (c.endpoint || '') +
                 (c.path ? '  →  ' + c.path : '') +
                 (c.operator ? ' ' + c.operator : '') +
                 (c.expected !== undefined ? ' ' + c.expected : '')
        })));
      }
      add('Port si tout validé', 'Validé (port 0)');
      add('Port si échec', 'Échec (port 1)');
      break;
    }

    case 'id_generator': {
      add('Champ cible Iconik', cfg.targetField);
      add('Variable produite', cfg.outputVar ? '{' + cfg.outputVar + '}' : undefined);
      add('Format généré', 'Identifiant numérique — 8 chiffres');
      break;
    }

    case 'lookup': {
      // Connexion liée (API cible du mapping)
      if (conn) {
        add('Connexion cible', conn.name);
        add('URL de base', conn.baseUrl, { mono: true });
        const authLabels = { bearer:'Bearer Token', apikey_header:'API Key (header)', basic:'Basic Auth', aws_s3:'AWS Signature V4', none:'Aucune' };
        add('Authentification', authLabels[conn.authType] || conn.authType || '—');
        if (conn.awsRegion) add('Région AWS', conn.awsRegion, { mono: true });
        if (conn.awsBucket) add('Bucket AWS', conn.awsBucket, { mono: true });
        if (conn.apiSpec && conn.apiSpec.title) add('Spec OpenAPI importée', conn.apiSpec.title + ' (' + (conn.apiSpec.endpoints?.length || 0) + ' endpoints)');
      }

      // lkRows : structure native du nœud Lookup
      const lkRowsSpec = cfg.lkRows || [];
      // Fallback wfdMappings si lkRows vide
      const mObjSpec = (!lkRowsSpec.length && typeof wfdMappings !== 'undefined' && cfg.mappingId)
        ? wfdMappings.find(x => x.id === cfg.mappingId) : null;
      const rowsToShow = lkRowsSpec.length ? lkRowsSpec : (mObjSpec?.rows || []);

      add('Variable d\'entrée (résultat Fetch)', cfg.lkInputVar ? '{' + cfg.lkInputVar + '}' : undefined);
      add('Variable de sortie', cfg.lkOutputVar ? '{' + cfg.lkOutputVar + '}' : undefined);
      add('Fallback global', cfg.lkFallback || undefined);
      add('Nombre de champs mappés', rowsToShow.length || undefined);

      if (rowsToShow.length) {
        const typeLabel = t => t === 'integer' ? 'int' : t === 'float' ? 'flt' : t === 'boolean' ? 'bool' : 'str';
        addL('Mapping complet (Champ Iconik → Champ API cible)', rowsToShow.map(r => {
          const key  = r.key  || r.src  || '—';
          const val  = r.value || r.tgt || '—';
          const typ  = r.type ? ' [' + typeLabel(r.type) + ']' : '';
          const fb   = r.fallback ? ' ← ' + r.fallback : '';
          return { label: key, value: val + typ + fb };
        }));
      }

      // ── Règles de calcul pour les champs dérivés des formats techniques ──
      // Ces champs ne sont pas des métadonnées Iconik directes — ils sont calculés
      // depuis les formats techniques récupérés par le Fetch (withFormats: true)
      const lkTgts = rowsToShow.map(function(r){ return r.value || r.tgt || ''; });

      if (lkTgts.some(function(t){ return t === 'duration'; })) {
        addL('Règle de calcul — duration', [
          { label: 'Source',  value: 'formats[0].duration_in_milliseconds  (GET /API/files/v1/assets/{id}/formats/)' },
          { label: 'Formule', value: 'Math.round(duration_in_milliseconds / 1000)  →  entier en secondes' },
          { label: 'Prérequis', value: 'Nœud Fetch : option "Avec formats techniques" activée' },
        ]);
      }
      if (lkTgts.some(function(t){ return t === 'video_quality' || t.includes('quality'); })) {
        addL('Règle de calcul — video_quality', [
          { label: 'Source',    value: 'formats[0].width  ×  formats[0].height  (depuis GET /formats/)' },
          { label: 'Formule',   value: 'width ≥ 3840 → "UHD"  |  width ≥ 1920 → "HD"  |  width ≥ 1280 → "SD"  |  sinon → "LD"' },
          { label: 'Prérequis', value: 'Nœud Fetch : option "Avec formats techniques" activée' },
        ]);
      }
      if (lkTgts.some(function(t){ return t.includes('audio') || t === 'channels' || t === 'sample_rate'; })) {
        addL('Règle de calcul — qualité audio', [
          { label: 'Source',    value: 'formats[0].audio_tracks[0]  (depuis GET /formats/)' },
          { label: 'Champs',    value: 'channels : 2 = stéréo, 6 = 5.1  |  sample_rate (Hz)  |  codec : aac, pcm…' },
          { label: 'Prérequis', value: 'Nœud Fetch : option "Avec formats techniques" activée' },
        ]);
      }
      break;
    }
    case 'http_group': {
      // Groupe de requêtes HTTP consécutives sur la même connexion
      const hgConn = (typeof wfdConnexions !== 'undefined' && node.requests?.[0]?.config?.connexionId)
        ? wfdConnexions.find(x => x.id === node.requests[0].config.connexionId) : null;
      if (hgConn) {
        add('Connexion', hgConn.name);
        add('URL de base', hgConn.baseUrl, { mono: true });
        const authLabels = { bearer:'Bearer Token', apikey_header:'API Key (header)', basic:'Basic Auth', aws_s3:'AWS Signature V4', none:'Aucune' };
        add('Authentification', authLabels[hgConn.authType] || hgConn.authType || '—');
        if (hgConn.apiSpec?.title) add('Spec OpenAPI', hgConn.apiSpec.title + ' — ' + (hgConn.apiSpec.endpoints?.length || 0) + ' endpoints');
      }
      add('Nature', 'Opération multi-requêtes — ' + (node.requests?.length || 1) + ' appels API séquentiels');
      // Détail de chaque requête
      (node.requests || []).forEach((r, ri) => {
        const rcfg = r.config || {};
        const vars = _extractTemplatevars((rcfg.bodyTemplate || '') + ' ' + (rcfg.url || ''));
        const lines = [
          { label: 'Méthode', value: rcfg.method || 'POST' },
          { label: 'Endpoint', value: rcfg.url || '' },
          rcfg.bodyTemplate ? { label: 'Corps (extrait)', value: String(rcfg.bodyTemplate).slice(0, 200) } : null,
          rcfg.responseVar  ? { label: 'Variable réponse', value: '{' + rcfg.responseVar + '}' } : null,
          vars.length       ? { label: 'Variables consommées', value: vars.map(v => '{'+v+'}').join(', ') } : null,
          (rcfg.ignoreCodes||[]).length ? { label: 'Codes ignorés', value: rcfg.ignoreCodes.join(', ') } : null,
        ].filter(Boolean);
        addL('Appel ' + (ri + 1) + ' — ' + (r.name || rcfg.method || 'POST'), lines);
      });
      break;
    }

    case 'http_request': {
      if (conn) {
        add('Connexion', conn.name);
        add('URL de base', conn.baseUrl, { mono: true });
        const authLabels = { bearer:'Bearer Token', apikey_header:'API Key (header)', basic:'Basic Auth', aws_s3:'AWS Signature V4', none:'Aucune' };
        add('Authentification', authLabels[conn.authType] || conn.authType || '—');
      }
      add('Méthode', cfg.method);
      add('URL / Endpoint', cfg.url, { mono: true });
      if (cfg.actionType && typeof ACTION_TYPES !== 'undefined' && ACTION_TYPES[cfg.actionType]) {
        add('Endpoint (type préconfiguré)', ACTION_TYPES[cfg.actionType].endpoint || '', { mono: true });
      }
      if (cfg.bodyTemplate) {
        add('Corps de la requête (extrait)', String(cfg.bodyTemplate).slice(0, 300), { mono: true });
      }
      const varsUsed = _extractTemplatevars((cfg.bodyTemplate || '') + ' ' + (cfg.url || ''));
      if (varsUsed.length) addL('Variables consommées', varsUsed.map(v => ({ value: '{' + v + '}' })));
      add('Variable de réponse', cfg.responseVar ? '{' + cfg.responseVar + '}' : undefined);
      if ((cfg.ignoreCodes || []).length) add('Codes HTTP ignorés', cfg.ignoreCodes.join(', '));
      break;
    }

    case 'http_sequence': {
      if (conn) {
        add('Connexion principale', conn.name);
        add('URL de base', conn.baseUrl, { mono: true });
        const authLabels = { bearer:'Bearer Token', apikey_header:'API Key (header)', basic:'Basic Auth', aws_s3:'AWS Signature V4', none:'Aucune' };
        add('Authentification', authLabels[conn.authType] || conn.authType || '—');
      }
      const steps = cfg.steps || [];
      add('Nombre d\'étapes', String(steps.length));
      steps.forEach(function(step, i) {
        const stepLabel = 'Étape ' + (i + 1) + ' — ' + (step.name || '');
        const modeLabels = { action:'Action importée', simple:'Requête simple', foreach:'Pour chaque valeur', verify:'Vérifier' };
        const lines = [
          '• Mode : ' + (modeLabels[step.httpMode] || step.httpMode || '—'),
          '• ' + (step.method || 'POST') + ' ' + (step.endpoint || step.url || '—'),
        ];
        if (step.httpMode === 'foreach') {
          lines.push('• Source : ' + (step.feSourceVar || '—'));
          lines.push('• Rôle : ' + (step.feJob || '—'));
          lines.push('• Body : ' + (step.feBody || '—').slice(0, 100));
        } else if (step.httpMode === 'simple' && step.bodyTemplate) {
          lines.push('• Body : ' + String(step.bodyTemplate).slice(0, 100));
        } else if (step.httpMode === 'action' && step.sourceVar) {
          lines.push('• Payload : ' + step.sourceVar);
        }
        if (step.resultVar) lines.push('• Résultat → {' + step.resultVar + '}');
        if (step.onError === 'continue') lines.push('• Continuer si erreur');
        add(stepLabel, lines.join('\n'), { mono: false });
      });
      // Variables produites
      const seqVars = steps.filter(function(s){ return s.resultVar; }).map(function(s){
        return { label: s.name || ('Étape ' + (steps.indexOf(s)+1)), value: '{' + s.resultVar + '}' };
      });
      if (seqVars.length) addL('Variables produites', seqVars);
      break;
    }

    case 'update_meta': {
      add('Vue métadonnées (ID)', cfg.metadataViewId || cfg.viewId, { mono: true });
      const flds = cfg.fields || cfg.values || [];
      if (flds.length) {
        addL('Champs écrits', flds.slice(0, 20).map(f => ({ label: f.field || f.name || '', value: String(f.value ?? '') })));
      }
      const varsUsed2 = _extractTemplatevars(JSON.stringify(flds));
      if (varsUsed2.length) addL('Variables consommées', varsUsed2.map(v => ({ value: '{' + v + '}' })));
      break;
    }

    case 'workflow_history': {
      add('Mode', cfg.mode === 'update' ? 'Mettre à jour (par Run ID)' : 'Ajouter en tête de liste');
      // Vue MD cible
      const hwView = (typeof wfdData !== 'undefined' && wfdData.mdViews && cfg.metadataViewId)
        ? wfdData.mdViews.find(v => v.id === cfg.metadataViewId)?.name : null;
      if (hwView || cfg.metadataViewId) add('Vue MD cible', hwView || cfg.metadataViewId, { mono: !hwView });
      if (cfg.fieldName) add('Champ MD cible', cfg.fieldName, { mono: true });
      if (cfg.message) {
        add('Message complet', cfg.message);
        const vMsg = _extractTemplatevars(cfg.message);
        if (vMsg.length) addL('Variables consommées', vMsg.map(v => ({ value: '{' + v + '}' })));
      }
      if (cfg.mode === 'update') {
        add('Clé de mise à jour', cfg.runIdVar ? '{' + cfg.runIdVar + '}' : '{run_id}');
        add('Comportement', 'Recherche la ligne contenant le Run ID et la remplace');
      } else {
        add('Comportement', 'Insère en tête de liste — conserve les entrées précédentes');
      }
      add('Champ Résumer un objet', cfg.resumeField || cfg.fieldResume || undefined);
      break;
    }

    // ── Recherche APS ────────────────────────────────────────
    // La famille n'etait pas traitee : les sections "Recherche APS" du
    // document sortaient vides. Sur BAYARD|PUBLISH|VODFACTORY cela
    // representait 17 noeuds sur 76 - tous les controles de presence.
    //
    // On decrit le critere en clair ET la requete HTTP correspondante : le
    // lecteur qui reconstruit le workflow ailleurs a besoin de l'appel exact,
    // celui qui le maintient a besoin de l'intention.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const OPS_FR = {
        equals:'est égal à', not_equals:'est différent de', contains:'contient',
        not_contains:'ne contient pas', starts_with:'commence par',
        is_empty:'est vide', is_not_empty:'est renseigné',
        before:'avant', after:'après', gt:'supérieur à', lt:'inférieur à',
        in_branch:'dans la branche'
      };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST recherche');
      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      add('Limite', cfg.limit);

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const prefixe = ((cfg.blocks || []).length > 1) ? 'Bloc ' + (bi + 1) + ' — ' : '';
        const terms = [];
        const humain = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            humain.push('située dans la collection ' + val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');

          humain.push(crit.field + ' ' + (OPS_FR[opName] || opName) + (val ? ' « ' + val + ' »' : ''));
        });

        add(prefixe + 'Recherche', objectType === 'collections' ? 'Collections' : (objectType === 'assets' ? 'Assets' : objectType));
        // cellLines attend des objets { value, mono? } : lui passer des
        // chaines rendait des cellules vides, sans erreur.
        if (humain.length) addL(prefixe + 'Critères', humain.map(t => ({ value: t })));

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        add(prefixe + 'Requête', 'POST /API/search/v1/search/', { mono: true });
        addL(prefixe + 'Corps de requête',
          JSON.stringify(body, null, 2).split('\n').map(l => ({ value: l, mono: true })));
      });
      break;
    }

    // ── Recherche APS ────────────────────────────────────────
    // La famille n'etait pas traitee : les sections "Recherche APS" du
    // document sortaient vides. Sur BAYARD|PUBLISH|VODFACTORY cela
    // representait 17 noeuds sur 76 - tous les controles de presence.
    //
    // On decrit le critere en clair ET la requete HTTP correspondante : le
    // lecteur qui reconstruit le workflow ailleurs a besoin de l'appel exact,
    // celui qui le maintient a besoin de l'intention.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const OPS_FR = {
        equals:'est égal à', not_equals:'est différent de', contains:'contient',
        not_contains:'ne contient pas', starts_with:'commence par',
        is_empty:'est vide', is_not_empty:'est renseigné',
        before:'avant', after:'après', gt:'supérieur à', lt:'inférieur à',
        in_branch:'dans la branche'
      };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST recherche');
      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      add('Limite', cfg.limit);

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const prefixe = ((cfg.blocks || []).length > 1) ? 'Bloc ' + (bi + 1) + ' — ' : '';
        const terms = [];
        const humain = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            humain.push('située dans la collection ' + val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');

          humain.push(crit.field + ' ' + (OPS_FR[opName] || opName) + (val ? ' « ' + val + ' »' : ''));
        });

        add(prefixe + 'Recherche', objectType === 'collections' ? 'Collections' : (objectType === 'assets' ? 'Assets' : objectType));
        // cellLines attend des objets { value, mono? } : lui passer des
        // chaines rendait des cellules vides, sans erreur.
        if (humain.length) addL(prefixe + 'Critères', humain.map(t => ({ value: t })));

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        add(prefixe + 'Requête', 'POST /API/search/v1/search/', { mono: true });
        addL(prefixe + 'Corps de requête',
          JSON.stringify(body, null, 2).split('\n').map(l => ({ value: l, mono: true })));
      });
      break;
    }

    // ── Recherche APS ────────────────────────────────────────
    // La famille n'etait pas traitee : les sections "Recherche APS" du
    // document sortaient vides. Sur BAYARD|PUBLISH|VODFACTORY cela
    // representait 17 noeuds sur 76 - tous les controles de presence.
    //
    // On decrit le critere en clair ET la requete HTTP correspondante : le
    // lecteur qui reconstruit le workflow ailleurs a besoin de l'appel exact,
    // celui qui le maintient a besoin de l'intention.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const OPS_FR = {
        equals:'est égal à', not_equals:'est différent de', contains:'contient',
        not_contains:'ne contient pas', starts_with:'commence par',
        is_empty:'est vide', is_not_empty:'est renseigné',
        before:'avant', after:'après', gt:'supérieur à', lt:'inférieur à',
        in_branch:'dans la branche'
      };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST recherche');
      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      add('Limite', cfg.limit);

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const prefixe = ((cfg.blocks || []).length > 1) ? 'Bloc ' + (bi + 1) + ' — ' : '';
        const terms = [];
        const humain = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            humain.push('située dans la collection ' + val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');

          humain.push(crit.field + ' ' + (OPS_FR[opName] || opName) + (val ? ' « ' + val + ' »' : ''));
        });

        add(prefixe + 'Recherche', objectType === 'collections' ? 'Collections' : (objectType === 'assets' ? 'Assets' : objectType));
        // cellLines attend des objets { value, mono? } : lui passer des
        // chaines rendait des cellules vides, sans erreur.
        if (humain.length) addL(prefixe + 'Critères', humain.map(t => ({ value: t })));

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        add(prefixe + 'Requête', 'POST /API/search/v1/search/', { mono: true });
        addL(prefixe + 'Corps de requête',
          JSON.stringify(body, null, 2).split('\n').map(l => ({ value: l, mono: true })));
      });
      break;
    }

    // ── Creer arborescence ───────────────────────────────────
    // Famille non traitee : les sections sortaient vides. C'est pourtant le
    // noeud central des workflows de creation - sur CREER SERIE et CREER
    // UNITAIRE, c'est un des deux seuls noeuds du flux, donc le document
    // entier ne disait rien.
    case 'create_tree': {
      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST création de collection, puis PUT métadonnées');
      add('Modèle d\'arborescence (ID)', cfg.templateId, { mono: true });

      // Emplacement : la valeur par defaut du moteur est {collection.id},
      // soit la collection depuis laquelle l'action est declenchee. Le dire,
      // sinon un champ vide se lit comme "a la racine" - ce qui est faux.
      add('Créer sous',
        cfg.parentId
          ? cfg.parentId
          : 'Non renseigné — la collection depuis laquelle l\'action est déclenchée',
        { mono: !!cfg.parentId });

      add('Vue de métadonnées (ID)', cfg.metadataViewId, { mono: true });
      const _vt = (typeof wfdData !== 'undefined' && wfdData.mdViews)
        ? wfdData.mdViews.find(v => v.id === cfg.metadataViewId) : null;
      if (_vt) add('Vue de métadonnées', _vt.name);

      addL('Correspondance des champs', [
        { label: 'Identifiant',            value: cfg.idFieldName     || 'BayardID' },
        { label: 'Référence vers parent',  value: cfg.parentFieldName || 'ParentID' },
        { label: 'Type de collection',     value: cfg.typeFieldName   || 'TypeCollection' }
      ]);

      if (cfg.parentBayardId) add('Identifiant du parent', cfg.parentBayardId, { mono: true });

      if ((cfg.extraFields || []).length) {
        addL('Champs supplémentaires écrits',
          cfg.extraFields.map(f => ({ label: f.key || '', value: String(f.value ?? ''), mono: true })));
      }

      // Numero d'ordre : calcule en base, pas par comptage. Le preciser evite
      // qu'un integrateur reimplemente un "compter + 1" - faux des que deux
      // creations se suivent.
      if (cfg.orderFieldName) {
        addL('Numéro d\'ordre', [
          { label: 'Champ',   value: cfg.orderFieldName },
          { label: 'Zéros',   value: String(cfg.orderPad || '—') },
          { label: 'Amorce',  value: String(cfg.orderSeed || '—'), mono: true },
          { value: 'Calculé de façon atomique en base, et non par comptage des objets existants : deux créations rapprochées ne peuvent pas obtenir le même numéro.' }
        ]);
      }

      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      break;
    }

    // ── Variable ─────────────────────────────────────────────
    case 'set_var': {
      const MODES = { set:'Définir', append:'Ajouter à la fin', prepend:'Ajouter au début', increment:'Incrémenter', clear:'Vider' };
      if ((cfg.assignments || []).length) {
        addL('Affectations', cfg.assignments.map(a => ({
          label: '{' + (a.key || '?') + '}',
          value: (MODES[a.mode] || a.mode || 'Définir') + ' — ' + String(a.value ?? ''),
          mono: true
        })));
      }
      break;
    }

    // ── Recherche APS ────────────────────────────────────────
    // La famille n'etait pas traitee : les sections "Recherche APS" du
    // document sortaient vides. Sur BAYARD|PUBLISH|VODFACTORY cela
    // representait 17 noeuds sur 76 - tous les controles de presence.
    //
    // On decrit le critere en clair ET la requete HTTP correspondante : le
    // lecteur qui reconstruit le workflow ailleurs a besoin de l'appel exact,
    // celui qui le maintient a besoin de l'intention.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const OPS_FR = {
        equals:'est égal à', not_equals:'est différent de', contains:'contient',
        not_contains:'ne contient pas', starts_with:'commence par',
        is_empty:'est vide', is_not_empty:'est renseigné',
        before:'avant', after:'après', gt:'supérieur à', lt:'inférieur à',
        in_branch:'dans la branche'
      };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST recherche');
      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      add('Limite', cfg.limit);

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const prefixe = ((cfg.blocks || []).length > 1) ? 'Bloc ' + (bi + 1) + ' — ' : '';
        const terms = [];
        const humain = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            humain.push('située dans la collection ' + val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');

          humain.push(crit.field + ' ' + (OPS_FR[opName] || opName) + (val ? ' « ' + val + ' »' : ''));
        });

        add(prefixe + 'Recherche', objectType === 'collections' ? 'Collections' : (objectType === 'assets' ? 'Assets' : objectType));
        // cellLines attend des objets { value, mono? } : lui passer des
        // chaines rendait des cellules vides, sans erreur.
        if (humain.length) addL(prefixe + 'Critères', humain.map(t => ({ value: t })));

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        add(prefixe + 'Requête', 'POST /API/search/v1/search/', { mono: true });
        addL(prefixe + 'Corps de requête',
          JSON.stringify(body, null, 2).split('\n').map(l => ({ value: l, mono: true })));
      });
      break;
    }

    // ── Creer arborescence ───────────────────────────────────
    // Famille non traitee : les sections sortaient vides. C'est pourtant le
    // noeud central des workflows de creation - sur CREER SERIE et CREER
    // UNITAIRE, c'est un des deux seuls noeuds du flux, donc le document
    // entier ne disait rien.
    case 'create_tree': {
      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST création de collection, puis PUT métadonnées');
      add('Modèle d\'arborescence (ID)', cfg.templateId, { mono: true });

      // Emplacement : la valeur par defaut du moteur est {collection.id},
      // soit la collection depuis laquelle l'action est declenchee. Le dire,
      // sinon un champ vide se lit comme "a la racine" - ce qui est faux.
      add('Créer sous',
        cfg.parentId
          ? cfg.parentId
          : 'Non renseigné — la collection depuis laquelle l\'action est déclenchée',
        { mono: !!cfg.parentId });

      add('Vue de métadonnées (ID)', cfg.metadataViewId, { mono: true });
      const _vt = (typeof wfdData !== 'undefined' && wfdData.mdViews)
        ? wfdData.mdViews.find(v => v.id === cfg.metadataViewId) : null;
      if (_vt) add('Vue de métadonnées', _vt.name);

      addL('Correspondance des champs', [
        { label: 'Identifiant',            value: cfg.idFieldName     || 'BayardID' },
        { label: 'Référence vers parent',  value: cfg.parentFieldName || 'ParentID' },
        { label: 'Type de collection',     value: cfg.typeFieldName   || 'TypeCollection' }
      ]);

      if (cfg.parentBayardId) add('Identifiant du parent', cfg.parentBayardId, { mono: true });

      if ((cfg.extraFields || []).length) {
        addL('Champs supplémentaires écrits',
          cfg.extraFields.map(f => ({ label: f.key || '', value: String(f.value ?? ''), mono: true })));
      }

      // Numero d'ordre : calcule en base, pas par comptage. Le preciser evite
      // qu'un integrateur reimplemente un "compter + 1" - faux des que deux
      // creations se suivent.
      if (cfg.orderFieldName) {
        addL('Numéro d\'ordre', [
          { label: 'Champ',   value: cfg.orderFieldName },
          { label: 'Zéros',   value: String(cfg.orderPad || '—') },
          { label: 'Amorce',  value: String(cfg.orderSeed || '—'), mono: true },
          { value: 'Calculé de façon atomique en base, et non par comptage des objets existants : deux créations rapprochées ne peuvent pas obtenir le même numéro.' }
        ]);
      }

      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      break;
    }

    // ── Variable ─────────────────────────────────────────────
    case 'set_var': {
      const MODES = { set:'Définir', append:'Ajouter à la fin', prepend:'Ajouter au début', increment:'Incrémenter', clear:'Vider' };
      if ((cfg.assignments || []).length) {
        addL('Affectations', cfg.assignments.map(a => ({
          label: '{' + (a.key || '?') + '}',
          value: (MODES[a.mode] || a.mode || 'Définir') + ' — ' + String(a.value ?? ''),
          mono: true
        })));
      }
      break;
    }

    // ── Recherche APS ────────────────────────────────────────
    // La famille n'etait pas traitee : les sections "Recherche APS" du
    // document sortaient vides. Sur BAYARD|PUBLISH|VODFACTORY cela
    // representait 17 noeuds sur 76 - tous les controles de presence.
    //
    // On decrit le critere en clair ET la requete HTTP correspondante : le
    // lecteur qui reconstruit le workflow ailleurs a besoin de l'appel exact,
    // celui qui le maintient a besoin de l'intention.
    case 'aps_search': {
      const SYSTEM_FIELDS = ['id','title','media_type','date_created','date_modified','object_type','status','archive_status','external_id'];
      const TYPE_MAP = { asset:'assets', collection:'collections', segment:'segments', saved_search:'saved_searches', format:'formats', storage:'storages' };
      const OPS_FR = {
        equals:'est égal à', not_equals:'est différent de', contains:'contient',
        not_contains:'ne contient pas', starts_with:'commence par',
        is_empty:'est vide', is_not_empty:'est renseigné',
        before:'avant', after:'après', gt:'supérieur à', lt:'inférieur à',
        in_branch:'dans la branche'
      };
      const escV = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST recherche');
      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      add('Limite', cfg.limit);

      (cfg.blocks || []).forEach((block, bi) => {
        const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
        const isCol = objectType === 'collections';
        const prefixe = ((cfg.blocks || []).length > 1) ? 'Bloc ' + (bi + 1) + ' — ' : '';
        const terms = [];
        const humain = [];

        (block.criteria || []).forEach(crit => {
          if (!crit.field) return;
          const opName = crit.op || 'equals';
          const val    = crit.value || '';

          if (crit.field === '__collection__') {
            const fname = (opName === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
            terms.push(fname + ':"' + escV(val) + '"');
            humain.push('située dans la collection ' + val);
            return;
          }

          const fname = SYSTEM_FIELDS.includes(crit.field) ? crit.field : 'metadata.' + crit.field;
          const v = escV(val);
          if      (opName === 'equals')       terms.push(fname + ':"' + v + '"');
          else if (opName === 'not_equals')   terms.push('NOT ' + fname + ':"' + v + '"');
          else if (opName === 'contains')     terms.push(fname + ':*' + v + '*');
          else if (opName === 'not_contains') terms.push('NOT ' + fname + ':*' + v + '*');
          else if (opName === 'starts_with')  terms.push(fname + ':' + v + '*');
          else if (opName === 'is_empty')     terms.push('NOT _exists_:' + fname);
          else if (opName === 'is_not_empty') terms.push('_exists_:' + fname);
          else if (opName === 'before')       terms.push(fname + ':<"' + v + '"');
          else if (opName === 'after')        terms.push(fname + ':>"' + v + '"');
          else if (opName === 'gt')           terms.push(fname + ':>' + v);
          else if (opName === 'lt')           terms.push(fname + ':<' + v);
          else                                 terms.push(fname + ':"' + v + '"');

          humain.push(crit.field + ' ' + (OPS_FR[opName] || opName) + (val ? ' « ' + val + ' »' : ''));
        });

        add(prefixe + 'Recherche', objectType === 'collections' ? 'Collections' : (objectType === 'assets' ? 'Assets' : objectType));
        if (humain.length) addL(prefixe + 'Critères', humain);

        const body = {
          doc_types: [objectType],
          query    : terms.join(' AND '),
          filters  : [],
          limit    : parseInt(cfg.limit) || 100,
          offset   : 0
        };
        add(prefixe + 'Requête', 'POST /API/search/v1/search/', { mono: true });
        addL(prefixe + 'Corps de requête', JSON.stringify(body, null, 2).split('\n'));
      });
      break;
    }

    // ── Creer arborescence ───────────────────────────────────
    // Famille non traitee : les sections sortaient vides. C'est pourtant le
    // noeud central des workflows de creation - sur CREER SERIE et CREER
    // UNITAIRE, c'est un des deux seuls noeuds du flux, donc le document
    // entier ne disait rien.
    case 'create_tree': {
      add('Protocole', 'HTTPS — API Iconik');
      add('Opération', 'POST création de collection, puis PUT métadonnées');
      add('Modèle d\'arborescence (ID)', cfg.templateId, { mono: true });

      // Emplacement : la valeur par defaut du moteur est {collection.id},
      // soit la collection depuis laquelle l'action est declenchee. Le dire,
      // sinon un champ vide se lit comme "a la racine" - ce qui est faux.
      add('Créer sous',
        cfg.parentId
          ? cfg.parentId
          : 'Non renseigné — la collection depuis laquelle l\'action est déclenchée',
        { mono: !!cfg.parentId });

      add('Vue de métadonnées (ID)', cfg.metadataViewId, { mono: true });
      const _vt = (typeof wfdData !== 'undefined' && wfdData.mdViews)
        ? wfdData.mdViews.find(v => v.id === cfg.metadataViewId) : null;
      if (_vt) add('Vue de métadonnées', _vt.name);

      addL('Correspondance des champs', [
        { label: 'Identifiant',            value: cfg.idFieldName     || 'BayardID' },
        { label: 'Référence vers parent',  value: cfg.parentFieldName || 'ParentID' },
        { label: 'Type de collection',     value: cfg.typeFieldName   || 'TypeCollection' }
      ]);

      if (cfg.parentBayardId) add('Identifiant du parent', cfg.parentBayardId, { mono: true });

      if ((cfg.extraFields || []).length) {
        addL('Champs supplémentaires écrits',
          cfg.extraFields.map(f => ({ label: f.key || '', value: String(f.value ?? ''), mono: true })));
      }

      // Numero d'ordre : calcule en base, pas par comptage. Le preciser evite
      // qu'un integrateur reimplemente un "compter + 1" - faux des que deux
      // creations se suivent.
      if (cfg.orderFieldName) {
        addL('Numéro d\'ordre', [
          { label: 'Champ',   value: cfg.orderFieldName },
          { label: 'Zéros',   value: String(cfg.orderPad || '—') },
          { label: 'Amorce',  value: String(cfg.orderSeed || '—'), mono: true },
          { value: 'Calculé de façon atomique en base, et non par comptage des objets existants : deux créations rapprochées ne peuvent pas obtenir le même numéro.' }
        ]);
      }

      add('Résultat dans', cfg.resultVar ? '{' + cfg.resultVar + '}' : undefined, { mono: true });
      break;
    }

    // ── Variable ─────────────────────────────────────────────
    case 'set_var': {
      const MODES = { set:'Définir', append:'Ajouter à la fin', prepend:'Ajouter au début', increment:'Incrémenter', clear:'Vider' };
      if ((cfg.assignments || []).length) {
        addL('Affectations', cfg.assignments.map(a => ({
          label: '{' + (a.key || '?') + '}',
          value: (MODES[a.mode] || a.mode || 'Définir') + ' — ' + String(a.value ?? ''),
          mono: true
        })));
      }
      break;
    }

    case 'loop': {
      const srcLabels = { files:'Fichiers asset', assets:'Assets collection', collection:'Sous-collections', list:'Liste JSON', metadata:'Champ meta' };
      add('Source de boucle', srcLabels[cfg.loopSource] || cfg.loopSource);
      add('Variable d\'itération', cfg.loopVar ? '{loop.' + cfg.loopVar + '}' : undefined);
      add('Collection', cfg.collection);
      break;
    }

    case 'script': {
      add('Langage', cfg.lang || 'JavaScript');
      if (cfg.code) add('Extrait (4 premières lignes)', cfg.code.split('\n').slice(0, 4).join(' | '), { mono: true });
      break;
    }

    case 'subflow': {
      add('Workflow appelé', cfg.workflowId);
      add('Mode d\'exécution', cfg.async ? 'Asynchrone' : 'Synchrone');
      break;
    }

    case 'notification':
    case 'notify_post': {
      const recs = cfg.recipients || [];
      if (recs.length) addL('Destinataires', recs.map(r => ({ label: r.channel || r.type || '', value: r.message?.slice(0, 80) || r.url || '' })));
      break;
    }
  }

  return specs;
}


// ── Tableau nœuds requis pour l'orchestrateur ─────────────────
function _buildNodeRequirements(nodes) {
  const families = [...new Set(nodes.map(n => n.family))];
  const req = [];

  const defs = {
    trigger:          { name: 'Déclencheur',              cat: 'Entrée',    caps: 'Réception d\'une action déclencheur (webhook ou custom action) — transmet les données de l\'asset' },
    watchfolder:      { name: 'Dossier surveillé',         cat: 'Entrée',    caps: 'Surveillance d\'un dossier et déclenchement à l\'arrivée d\'un fichier' },
    timer:            { name: 'Minuterie',                 cat: 'Entrée',    caps: 'Déclenchement à intervalles réguliers ou à une heure planifiée' },
    fetch:            { name: 'Récupération de données',   cat: 'Données',   caps: 'Lecture de métadonnées (vue MD), formats techniques, keyframes, file sets depuis le MAM' },
    lookup:           { name: 'Table de correspondance',   cat: 'Données',   caps: 'Mapping configurable avec types (string, integer, boolean, array), fallback, valeurs imbriquées' },
    set_var:          { name: 'Variable',                  cat: 'Données',   caps: 'Définition et modification de variables du contexte d\'exécution' },
    id_generator:     { name: 'Générateur d\'ID',          cat: 'Données',   caps: 'Génération d\'identifiants numériques (8 chiffres) — stockage dans les métadonnées source' },
    transform:        { name: 'Transformer',               cat: 'Données',   caps: 'Transformation et reformatage de valeurs (concaténation, cast, regex)' },
    decision:         { name: 'Décision',                  cat: 'Logique',   caps: 'Branchement conditionnel multi-ports — equals, contains, isEmpty, greaterThan' },
    loop:             { name: 'Boucler sur',               cat: 'Logique',   caps: 'Itération sur une collection avec variable d\'itération — fichiers, assets, liste JSON' },
    qc:               { name: 'Contrôle qualité',          cat: 'Logique',   caps: 'Vérification de critères sur les métadonnées, fichiers ou permissions' },
    checker:          { name: 'Vérificateur',              cat: 'Logique',   caps: 'Vérification d\'une liste d\'endpoints et de leurs valeurs attendues — multi-checks configurables' },
    approval:         { name: 'Approbation',               cat: 'Logique',   caps: 'Attente d\'une validation humaine avant de poursuivre le workflow' },
    action:           { name: 'Action Iconik',             cat: 'Action',    caps: 'Écriture MD, création/MAJ asset, Export vers Export Location avec options (sous-dossier, renommage)' },
    update_meta:      { name: 'Métadonnées',               cat: 'Action',    caps: 'Lecture ou écriture de métadonnées sur un asset via vue MD configurable' },
    http_request:     { name: 'Requête HTTP',              cat: 'Action',    caps: 'POST/PUT/PATCH/GET vers API externe — upsert automatique, codes HTTP ignorables, accès par notation pointée' },
    aws_s3:           { name: 'Vérification S3',           cat: 'Action',    caps: 'Opérations AWS S3 avec Signature V4 — HEAD, LIST, GET, PUT, DELETE — extraction des URLs par type de fichier' },
    wait_for:         { name: 'Attendre',                  cat: 'Utilitaire',caps: 'Polling configurable sur endpoint API — délai, max essais, condition de sortie, sortie immédiate sur erreur' },
    workflow_history: { name: 'Historique workflow',       cat: 'Sortie',    caps: 'Écriture dans champ MD du MAM — mode ajouter/mettre à jour par Run ID' },
    notification:     { name: 'Notification',              cat: 'Sortie',    caps: 'Envoi de notifications (Teams, Slack, email) avec message configurable' },
    subflow:          { name: 'Appeler Workflow',           cat: 'Utilitaire',caps: 'Appel d\'un autre workflow en synchrone ou asynchrone' },
    gate:             { name: 'Contrôle',                  cat: 'Utilitaire',caps: 'Throttle de concurrence, pause manuelle ou délai entre nœuds' },
    script:           { name: 'Script',                    cat: 'Action',    caps: 'Exécution d\'un script JavaScript ou Python personnalisé dans le contexte du workflow' },
  };

  families.forEach(fam => {
    if (defs[fam]) req.push(defs[fam]);
  });

  return req;
}

// ── Limitations connues ───────────────────────────────────────
function _buildLimitations(nodes) {
  const lims  = [];
  const fams  = new Set(nodes.map(n => n.family));
  const hasHR = fams.has('http_request');
  const hasS3 = fams.has('aws_s3');
  const hasLK = fams.has('lookup');

  if (hasHR)
    lims.push({ subject: 'Upsert POST → PUT', status: 'Validé', desc: 'Le nœud HTTP Request doit supporter l\'upsert automatique : POST → 422 → PUT sur l\'external_id. Le code 422 doit être ignorable.' });
  if (hasS3)
    lims.push({ subject: 'Bypass S3', status: 'Validé', desc: 'Si les fichiers existent déjà dans S3 (KeyCount > 0), l\'export est bypassé. Le nœud S3 doit exposer les URLs extraites comme variables.' });
  if (hasLK)
    lims.push({ subject: 'Valeurs imbriquées', status: 'En cours', desc: 'Le mapping doit supporter les clés imbriquées (notation pointée) et les tableaux d\'objets (ex: persons[].external_id).' });
  if (fams.has('wait_for'))
    lims.push({ subject: 'Sortie sur erreur', status: 'Validé', desc: 'Le nœud Attendre doit sortir immédiatement par le port Erreur si le statut retourné est dans la liste des valeurs d\'échec (FAILED, ERROR, ABORTED).' });

  return lims;
}

// ── Pseudo-code des étapes clés ───────────────────────────────
function _buildPseudocode(nodes, mappingRows) {
  const items = [];
  const fams  = new Set(nodes.map(n => n.family));

  if (fams.has('lookup') && mappingRows.length) {
    items.push({
      title: 'Construction du payload de distribution',
      lines: [
        'POUR CHAQUE ligne de la table de correspondance :',
        '  valeur ← LIRE champ_source DEPUIS métadonnées_iconik',
        '  SI valeur EST VIDE ET fallback EXISTE :',
        '    valeur ← RÉSOUDRE fallback DEPUIS contexte',
        '  SI type_ligne EST integer : valeur ← CONVERTIR EN entier',
        '  SI clé_cible CONTIENT "." OU "[" : CONSTRUIRE objet imbriqué',
        '  AJOUTER clé_cible → valeur AU payload',
        'SI payload.persons EST tableau de strings :',
        '  POUR CHAQUE nom : persons[] ← { external_id: slug(nom), job: "director" }',
      ]
    });
  }

  if (fams.has('http_request')) {
    items.push({
      title: 'Upsert POST → PUT',
      lines: [
        'TENTER POST /api/contents AVEC payload',
        'SI réponse = 201 : → Contenu créé avec succès',
        'SI réponse = 422 ET external_id déjà pris :',
        '  TENTER PUT /api/contents/{external_id} AVEC payload',
        '  SI réponse = 200 : → Contenu mis à jour',
        '  SI réponse = 404 : → Erreur — contenu introuvable',
        'SI réponse = 422 AUTRE RAISON : → Erreur de validation',
      ]
    });
  }

  if (fams.has('workflow_history')) {
    items.push({
      title: 'Historique de livraison dans le MAM',
      lines: [
        '// Mode AJOUTER (début de workflow) :',
        '  ligne ← "{date} | {nom_workflow} | En cours [{run_id}]"',
        '  PREPEND ligne AU champ Historique',
        '',
        '// Mode METTRE À JOUR (fin de workflow) :',
        '  lignes ← LIRE champ Historique',
        '  idx ← TROUVER ligne CONTENANT "[{run_id}]"',
        '  SI idx TROUVÉ : lignes[idx] ← "{date} | {workflow} | {statut} | {détails}"',
        '  SINON : PREPEND nouvelle_ligne',
        '  ÉCRIRE lignes DANS champ Historique',
      ]
    });
  }

  return items;
}

// ── Extraction des {variables} d'un template ──────────────────
function _extractTemplatevars(str) {
  if (!str) return [];
  const matches = String(str).match(/\{([^}]+)\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))];
}

// ── Guide opérationnel — déduit depuis la config des nœuds ────
function _buildOperationalGuide(nodes, conns) {
  const guide = {
    requiredFields: [],
    triggerSteps:   [],
    triggerColor:   '0F4761',
    followUpSteps:  [],
    failureSteps:   []
  };

  // ── Champs obligatoires ──────────────────────────────────────
  // Source 1 : cfg.requiredFields stocké au save du nœud Fetch
  const fetchNode = nodes.find(n => n.family === 'fetch');
  if (fetchNode) {
    const rf = fetchNode.config?.requiredFields || [];
    rf.forEach(function(f) {
      if (!guide.requiredFields.find(function(x){ return x.name === f.name; }))
        guide.requiredFields.push({ name: f.name, label: f.label || f.name, type: f.type || 'string', required: true });
    });
    // Source 2 : tous les champs du viewFields stockés
    const vf = fetchNode.config?.viewFields || [];
    vf.filter(function(f){ return !f.required && f.name && f.name !== '__separator__'; }).forEach(function(f) {
      if (!guide.requiredFields.find(function(x){ return x.name === f.name; }))
        guide.requiredFields.push({ name: f.name, label: f.label || f.name, type: f.field_type || 'string', required: false });
    });
  }

  // Source 3 : lkRows du Lookup — champs utilisés dans le mapping
  const lookupNode = nodes.find(n => n.family === 'lookup');
  if (lookupNode) {
    (lookupNode.config?.lkRows || []).forEach(function(r) {
      const name = (r.key || r.src || '').replace(/^metadata\./, '');
      if (name && !guide.requiredFields.find(function(x){ return x.name === name; })) {
        guide.requiredFields.push({ name, label: name, type: r.type || 'string', required: true });
      }
    });
  }

  // ── Déclenchement ────────────────────────────────────────────
  const triggerNode = nodes.find(n => ['trigger','listener','watchfolder','timer'].includes(n.family));
  const trigCfg     = triggerNode?.config || {};

  if (trigCfg.eventType === 'custom_action') {
    const ca = (typeof wfdData !== 'undefined')
      ? (wfdData.customActions || []).find(function(a){ return a.id === trigCfg.customActionId; })
      : null;
    const caName = ca ? (ca.title || ca.nom || ca.name) : (trigCfg.customActionId || 'la custom action');

    // Utiliser cfg.automationTrigger stocké au save (via wfd-config-panel enrichment)
    // Fallback : chercher en live dans wfdData.automations
    const storedTrigger = trigCfg.automationTrigger || null;
    const storedAutoName = trigCfg.automationName || '';

    const autoLive = (!storedTrigger && typeof wfdData !== 'undefined')
      ? (wfdData.automations || []).find(function(a) {
          return (a.actions || a.custom_actions || []).some(function(ac) {
            return ac.custom_action_id === trigCfg.customActionId || ac.id === trigCfg.customActionId;
          });
        })
      : null;

    const trigField   = storedTrigger?.field || autoLive?.filter_field || autoLive?.trigger_field || '';
    const trigValue   = storedTrigger?.value || autoLive?.filter_value || autoLive?.trigger_value || '';
    const trigOp      = storedTrigger?.operator || '=';
    const resolvedName = storedAutoName || (autoLive ? (autoLive.name || autoLive.nom || 'Automation') : '');

    if (resolvedName) {
      guide.triggerSteps.push('Ce workflow est déclenché automatiquement par l\'automation Iconik « ' + resolvedName + ' ».');
      if (trigField && trigValue) {
        guide.triggerSteps.push(
          'Condition : le champ « ' + trigField + ' » ' + trigOp + ' « ' + trigValue + ' ».'
        );
        guide.triggerSteps.push(
          'Action utilisateur : dans Iconik, passer le champ « ' + trigField +
          ' » à « ' + trigValue + ' » pour déclencher le workflow automatiquement.'
        );
      } else if (trigField) {
        guide.triggerSteps.push('Condition : modification du champ « ' + trigField + ' ».');
      }
    } else {
      guide.triggerSteps.push('Ce workflow est déclenché par la Custom Action Iconik « ' + caName + ' ».');
      guide.triggerSteps.push(
        'Si une automation Iconik est configurée pour déclencher cette action, ' +
        'vérifier sa condition de déclenchement directement dans Iconik (Settings > Automations).'
      );
    }

    // Le declencheur porte son contexte : une Custom Action de collection ne
    // se lance pas sur un asset. Ecrire "asset" partout etait faux des que le
    // workflow travaille au niveau collection.
    const _cible = (trigCfg.context === 'COLLECTION') ? 'la collection' : 'l\'asset';
    guide.triggerSteps.push('Déclenchement manuel : sélectionner ' + _cible + ' dans Iconik → menu Actions → « ' + caName + ' ».');
    guide.triggerColor = '0F4761';

  } else if (trigCfg.eventType === 'metadata_changed') {
    guide.triggerSteps.push('Ce workflow est déclenché automatiquement dès que le champ « ' + (trigCfg.triggerField || '?') + ' » prend la valeur « ' + (trigCfg.triggerValue || '?') + ' ».');
    guide.triggerSteps.push('Aucune action manuelle n\'est requise — la modification du champ suffit.');
    guide.triggerColor = '5B3FA6';

  } else if (trigCfg.eventType === 'watchfolder') {
    guide.triggerSteps.push('Ce workflow est déclenché automatiquement à l\'arrivée d\'un fichier dans le dossier surveillé.');
    guide.triggerSteps.push('Chemin surveille : ' + (trigCfg.path || trigCfg.watchPath || '(voir configuration)'));
    guide.triggerColor = '3A5F7A';

  } else if (trigCfg.eventType === 'timer') {
    guide.triggerSteps.push('Ce workflow est planifié : ' + (trigCfg.schedule || trigCfg.cron || '(voir configuration)'));
    guide.triggerSteps.push('Aucune action utilisateur requise.');
    guide.triggerColor = '3A5F7A';

  } else {
    guide.triggerSteps.push('Mode de déclenchement : ' + (trigCfg.eventType || 'manuel'));
    guide.triggerColor = '555555';
  }

  // ── Suivi ─────────────────────────────────────────────────────
  const historyNodes = nodes.filter(function(n){ return n.family === 'workflow_history'; });
  if (historyNodes.length) {
    // Le noeud Historique stocke sa vue dans mdViewId — metadataViewId
    // appartient a Creer arborescence. La lecture etait donc toujours vide et
    // le document affirmait "vue Historique" quelle que soit la realite.
    // Depuis l'ecriture sans vue, il faut aussi savoir le dire.
    const _cibleSuivi = historyNodes.some(function(h){ return (h.config||{}).target === 'collection'; })
      ? 'de la collection' : 'de l\'asset';
    guide.followUpSteps.push('Le statut du workflow est visible dans les métadonnées ' + _cibleSuivi + ' dans Iconik.');
    const _vus = {};
    historyNodes.forEach(function(hn) {
      const cfg = hn.config || {};
      const champ = cfg.mdField || '(champ non renseigné)';
      const viewId = cfg.mdViewId || '';
      const viewName = (typeof wfdData !== 'undefined' && wfdData.mdViews)
        ? (wfdData.mdViews.find(function(v){ return v.id === viewId; })?.name || viewId)
        : viewId;
      const ou = viewId ? ('la vue « ' + viewName + ' »') : 'directement, sans vue';
      const cle = champ + '|' + ou;
      if (_vus[cle]) return;   // huit noeuds ecrivant au meme endroit = une ligne
      _vus[cle] = true;
      guide.followUpSteps.push('Champ « ' + champ + ' » — écrit ' + ou + '.');
    });
  }

  // Checker — ce que le workflow vérifie
  const checkerNodes = nodes.filter(function(n){ return n.family === 'checker'; });
  checkerNodes.forEach(function(cn) {
    const checks = cn.config?.checks || [];
    if (checks.length) {
      // "artwork, artwork, artwork" n'apprend rien : on compte les doublons de
      // libelle plutot que de les repeter.
      const _cpt = {};
      checks.forEach(function(c){ const l = c.label || c.endpoint || '?'; _cpt[l] = (_cpt[l]||0)+1; });
      const _liste = Object.keys(_cpt).map(function(l){ return _cpt[l] > 1 ? (l + ' ×' + _cpt[l]) : l; });
      guide.followUpSteps.push('Vérifications automatiques (' + cn.name + ') : ' + _liste.join(', ') + '.');
    }
  });

  // ── Causes d'échec ────────────────────────────────────────────
  // Wait For — timeout possible
  // Six noeuds Attendre identiques produisaient six fois les deux memes
  // phrases. On dedoublonne sur le contenu, pas sur le nom du noeud.
  const waitNodes = nodes.filter(function(n){ return n.family === 'wait_for'; });
  const _dejaVu = {};
  function _pousserEchec(txt) { if (!_dejaVu[txt]) { _dejaVu[txt] = true; guide.failureSteps.push(txt); } }
  waitNodes.forEach(function(wn) {
    const cfg = wn.config || {};
    const tout = (cfg.interval && cfg.maxRetries) ? (cfg.interval * cfg.maxRetries) : null;
    _pousserEchec(
      'Attente d\'un export : timeout après ' + (tout ? tout + 's' : 'N tentatives') +
      ' si la condition « ' + (cfg.path||'status') + ' = ' + (cfg.expected||'COMPLETED') + ' » n\'est pas atteinte.'
    );
    if (cfg.failValues) {
      const fv = Array.isArray(cfg.failValues) ? cfg.failValues.join(', ') : cfg.failValues;
      _pousserEchec('Échec immédiat si le statut retourné est : ' + fv + '.');
    }
  });

  // Champs obligatoires manquants
  const reqNames = guide.requiredFields.filter(function(f){ return f.required; }).map(function(f){ return f.label || f.name; });
  if (reqNames.length) {
    guide.failureSteps.push(
      'Le workflow peut échouer si les champs obligatoires suivants ne sont pas renseignés avant le déclenchement : ' +
      reqNames.join(', ') + '.'
    );
  }

  // Décision ou Checker avec port d'erreur
  const decNodes = nodes.filter(function(n){ return ['decision','checker'].includes(n.family); });
  decNodes.forEach(function(dn) {
    const ports = (typeof buildPortsDef === 'function') ? buildPortsDef(dn.family, dn.config || {}) : { outputs: [] };
    const errPort = ports.outputs.find(function(p){ return (p.label||'').toLowerCase().includes('erreur') || (p.label||'').toLowerCase().includes('échec') || (p.label||'').toLowerCase().includes('incomplet'); });
    if (errPort) {
      guide.failureSteps.push('« ' + dn.name + ' » : route vers « ' + errPort.label + ' » si les conditions ne sont pas remplies.');
    }
  });

  return guide;
}
