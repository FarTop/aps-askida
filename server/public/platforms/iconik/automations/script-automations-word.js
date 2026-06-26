// ================================================================
// EXPORT WORD — Automations, Webhooks, Custom Actions
// Script s\u00e9par\u00e9 pour ne pas compromettre script-automations.js
// ================================================================

// Toast local (autonome, sans d\u00e9pendance au script principal)
function autToast(msg, isError = false) {
  let t = document.getElementById('aut-word-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'aut-word-toast';
    t.style.cssText = [
      'position:fixed', 'bottom:28px', 'right:28px', 'z-index:9999',
      'background:#1a1a2e', 'color:#fff', 'padding:10px 20px',
      'border-radius:8px', 'font-size:14px', 'font-family:Arial,sans-serif',
      'box-shadow:0 4px 18px rgba(0,0,0,.5)', 'opacity:0',
      'transition:opacity .25s', 'pointer-events:none',
      'border-left:4px solid #00d4aa'
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderLeftColor = isError ? '#e74c3c' : '#00d4aa';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── Formater la config d'un trigger/action avec labels humains ──
function formatConfigLines(type, config, defMap) {
  if (!config || !type) return [];
  const def = defMap[type];
  if (!def || !def.fields) {
    // Pas de définition : afficher les paires brutes en filtrant les valeurs vides/faux
    return Object.entries(config)
      .filter(([k, v]) => v !== false && v !== '' && v !== null && v !== undefined
                        && !k.startsWith('_') && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => ({
        label: k,
        value: Array.isArray(v) ? v.join(' | ') : String(v)
      }));
  }
  const lines = [];
  def.fields.forEach(field => {
    if (field.type === 'section-header' || field.type === 'sub-header') return;
    if (field.id.startsWith('_')) return;
    const v = config[field.id];
    if (v === undefined || v === null || v === '' || v === false) return;
    if (Array.isArray(v) && v.length === 0) return;
    const displayVal = Array.isArray(v) ? v.join(' | ') : String(v);
    lines.push({ label: field.label, value: displayVal });
  });
  return lines;
}

// ── Schéma logique d'une automation (Trigger → Conditions → Actions) ──
function buildAutoSchema(auto, docxLib) {
  const { Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign } = docxLib;

  const triggers  = auto.triggers  || [];
  const conds     = auto.conditions || [];
  const actions   = auto.actions   || [];
  if (!triggers.length && !actions.length) return [];

  const bNone  = { style:BorderStyle.NONE, size:0, color:'FFFFFF' };
  const bSolid = (c, sz) => ({ style:BorderStyle.SINGLE, size:sz||4, color:c });
  const bAll   = b => ({ top:b, bottom:b, left:b, right:b });
  const bTop   = (c) => ({ top:bSolid(c,6), bottom:bNone, left:bNone, right:bNone });

  const PAGE_W = 9360;

  // ── Constantes couleurs ──
  const C_TRIG = '005B4F';  // vert foncé triggers
  const C_COND = '1A237E';  // bleu foncé conditions
  const C_ACT  = '7B1FA2';  // violet actions
  const BG_TRIG = 'E8F5E9';
  const BG_COND = 'E8EAF6';
  const BG_ACT  = 'F3E5F5';

  const emptyCell = w => new TableCell({
    width:{ size:w, type:WidthType.DXA }, borders:bAll(bNone),
    children:[new Paragraph({ children:[new TextRun({ text:'' })] })]
  });

  const arrowCell = (w, color, label) => {
    const c = (color||'888888').replace('#','').slice(0,6);
    const safe = c.length===6 ? c : '888888';
    return new TableCell({
      width:{ size:w, type:WidthType.DXA }, borders:bAll(bNone),
      verticalAlign:VerticalAlign.CENTER,
      margins:{ top:40, bottom:40, left:20, right:20 },
      children:[new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[
          ...(label ? [new TextRun({ text:label+' ', size:13, font:'Arial', color:safe, bold:true })] : []),
          new TextRun({ text:'\u25ba', size:16, font:'Arial', color:safe }),
        ]
      })]
    });
  };

  const mkNode = (text, sub, bg, borderColor, w) => {
    const subLines = sub ? sub.split('\n').filter(l => l.trim()) : [];
    return new TableCell({
      width:{ size:w, type:WidthType.DXA },
      borders: bTop(borderColor),
      verticalAlign: VerticalAlign.CENTER,
      shading:{ fill:bg, type:ShadingType.CLEAR },
      margins:{ top:100, bottom:100, left:140, right:120 },
      children:[
        new Paragraph({ spacing:{ before:0, after: subLines.length ? 30 : 0 }, children:[
          new TextRun({ text, size:17, bold:true, font:'Arial', color:borderColor })
        ]}),
        ...subLines.map(line => {
          // Séparer "Label : Valeur" pour mettre la valeur en gras
          const sepIdx = line.indexOf('\u00a0: ');
          if (sepIdx > 0) {
            return new Paragraph({ spacing:{ before:0, after:10 }, children:[
              new TextRun({ text: line.slice(0, sepIdx) + '\u00a0: ', size:13, font:'Arial', color:'888888' }),
              new TextRun({ text: line.slice(sepIdx + 3), size:13, font:'Arial', color:'222222', bold:true }),
            ]});
          }
          return new Paragraph({ children:[
            new TextRun({ text:line, size:13, font:'Arial', color:'555555' })
          ]});
        }),
      ]
    });
  };

  // ── Calcul des largeurs selon les colonnes présentes ──
  // Schéma : [Trigger(s)] → [si conditions : Conditions] → [Action(s)]
  // Chaque "groupe" est une colonne de nœuds empilés
  const ARROW_W = 360;
  const nCols   = (triggers.length > 0 ? 1 : 0)
                + (conds.length > 0 ? 1 : 0)
                + (actions.length > 0 ? 1 : 0);
  const nArrows = nCols - 1;
  const nodeW   = Math.floor((PAGE_W - nArrows * ARROW_W) / nCols);

  const result = [];

  // Titre schéma
  result.push(new Paragraph({
    spacing:{ before:160, after:80 }, keepNext:true,
    children:[new TextRun({ text:'\u2514\u2500\u2500 Sch\u00e9ma logique', bold:true, size:18, font:'Arial', color:'444444' })]
  }));

  // Ligne d'en-têtes de colonnes (groupes)
  const headerCells = [];
  const headerWidths = [];
  const groups = [
    triggers.length > 0  ? { label:'D\u00e9clencheur' + (triggers.length>1?'s':''), color:C_TRIG, items:triggers }  : null,
    conds.length > 0     ? { label:'Condition'     + (conds.length>1?'s':''),    color:C_COND, items:conds }     : null,
    actions.length > 0   ? { label:'Action'        + (actions.length>1?'s':''),  color:C_ACT,  items:actions }   : null,
  ].filter(Boolean);

  groups.forEach((g, gi) => {
    headerCells.push(new TableCell({
      width:{ size:nodeW, type:WidthType.DXA },
      borders:bAll(bNone),
      children:[new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({ text:g.label, size:16, bold:true, font:'Arial', color:g.color })]
      })]
    }));
    headerWidths.push(nodeW);
    if (gi < groups.length - 1) {
      headerCells.push(emptyCell(ARROW_W));
      headerWidths.push(ARROW_W);
    }
  });

  result.push(new Table({
    width:{ size:PAGE_W, type:WidthType.DXA },
    columnWidths:headerWidths,
    rows:[new TableRow({ children:headerCells })]
  }));

  // Lignes de nœuds
  const maxRows = Math.max(triggers.length, conds.length, actions.length);

  for (let r = 0; r < maxRows; r++) {
    const rowCells = [];
    const rowWidths = [];

    // Helper : lignes config formatées pour le schéma
    const schemaLines = (type, config, defMap) =>
      formatConfigLines(type, config, defMap)
        .slice(0, 4)
        .map(l => l.label + '\u00a0: ' + l.value.slice(0, 40))
        .join('\n');

    const itemsByGroup = [
      { items:triggers, bg:BG_TRIG, color:C_TRIG,
        getLabel: t => (typeof TRIGGERS_ICONIK !== 'undefined' && TRIGGERS_ICONIK[t.type]?.label) || t.type || 'D\u00e9clencheur',
        getSub:   t => schemaLines(t.type, t.config||{}, typeof TRIGGERS_ICONIK !== 'undefined' ? TRIGGERS_ICONIK : {})
      },
      ...(conds.length > 0 ? [{ items:conds, bg:BG_COND, color:C_COND,
        getLabel: c => '\uD83D\uDD0E ' + (c.field || c.type || 'Condition'),
        getSub:   c => (c.operator ? c.operator : '') + (c.value !== undefined && c.value !== '' ? ' : ' + String(c.value).slice(0,35) : '')
      }] : []),
      { items:actions, bg:BG_ACT, color:C_ACT,
        getLabel: a => '\u26a1 ' + (a.type || 'Action'),
        getSub:   a => schemaLines(a.type, a.config||{}, typeof ACTIONS_ICONIK !== 'undefined' ? ACTIONS_ICONIK : {})
      },
    ];

    itemsByGroup.forEach((grp, gi) => {
      const item = grp.items[r];
      if (item) {
        rowCells.push(mkNode(grp.getLabel(item), grp.getSub(item), grp.bg, grp.color, nodeW));
      } else {
        rowCells.push(emptyCell(nodeW));
      }
      rowWidths.push(nodeW);

      // Flèche entre colonnes (seulement sur la 1ère ligne, centré verticalement par rowSpan si possible)
      // On met la flèche sur chaque ligne pour l'alignement
      if (gi < itemsByGroup.length - 1) {
        const showArrow = r === 0;  // flèche visible uniquement sur la 1ère ligne
        rowCells.push(showArrow
          ? arrowCell(ARROW_W, grp.color, '')
          : emptyCell(ARROW_W));
        rowWidths.push(ARROW_W);
      }
    });

    result.push(new Table({
      width:{ size:PAGE_W, type:WidthType.DXA },
      columnWidths:rowWidths,
      rows:[new TableRow({ children:rowCells })]
    }));

    // Petit espace entre nœuds empilés
    if (r < maxRows - 1) {
      result.push(new Paragraph({ spacing:{before:0,after:0}, children:[new TextRun({ text:'', size:10 })] }));
    }
  }

  // Légende si conditions présentes
  if (conds.length > 0) {
    result.push(new Paragraph({
      spacing:{before:60,after:0},
      children:[new TextRun({ text:'\u26a0\ufe0f  Les conditions s\u2019appliquent en AND sur tous les d\u00e9clencheurs.',
        size:14, font:'Arial', color:'888888', italics:true })]
    }));
  }

  result.push(new Paragraph({ spacing:{before:0,after:0}, children:[new TextRun({ text:'', size:8 })] }));
  return result;
}


// ================================================================
async function exporterWordAutomations() {
  autToast('G\u00e9n\u00e9ration du document Word\u2026');
  try {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
      VerticalAlign } = docx;

    const org     = localStorage.getItem('nomOrganisation') || localStorage.getItem('organisationName') || 'Organisation';
    const dateStr = new Date().toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });

    // ── Helpers ──────────────────────────────────────────────
    const bThin = { style:BorderStyle.SINGLE, size:2, color:'DDDDDD' };
    const bNone = { style:BorderStyle.NONE,   size:0, color:'FFFFFF' };
    const bs    = { top:bThin, bottom:bThin, left:bThin, right:bThin };
    const cm    = { top:80, bottom:80, left:120, right:120 };

    const cell = (text, opts={}) => new TableCell({
      borders: opts.noBorder ? { top:bNone, bottom:bNone, left:bNone, right:bNone } : bs,
      verticalAlign: VerticalAlign.CENTER, margins: cm,
      width: opts.w ? { size:opts.w, type:WidthType.DXA } : undefined,
      columnSpan: opts.span || 1,
      shading: opts.fill ? { fill:opts.fill, type:ShadingType.CLEAR } : undefined,
      children: [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text:String(text ?? '\u2014'), size:opts.size||18,
          bold:!!opts.bold, font:'Arial', color:opts.color||'111111',
          italics:!!opts.italic })]
      })]
    });

    const hdr = (text, color) => new TableCell({
      borders: bs, verticalAlign: VerticalAlign.CENTER, margins: cm,
      shading: { fill:color||'1A1A2E', type:ShadingType.CLEAR },
      children: [new Paragraph({ children: [
        new TextRun({ text, size:18, bold:true, font:'Arial', color:'FFFFFF' })
      ]})]
    });

    const h1 = t => new Paragraph({
      heading: HeadingLevel.HEADING_1, keepNext: true,
      children: [new TextRun({ text:t, size:36, bold:true, font:'Arial' })]
    });
    const h2 = (t, pb) => new Paragraph({
      heading: HeadingLevel.HEADING_2, keepNext: true, pageBreakBefore:!!pb,
      children: [new TextRun({ text:t, size:26, bold:true, font:'Arial' })]
    });
    const sp  = () => new Paragraph({ children:[new TextRun({ text:'' })] });
    const par = (t, color) => new Paragraph({ children:[
      new TextRun({ text:t, size:18, font:'Arial', color:color||'333333' })
    ]});

    const totalAuto = (automationsData.automations  || []).length;
    const totalWH   = (webhooksData.webhooks         || []).length;
    const totalCA   = (customActionsData.customActions || []).length;

    const children = [];

    // ── Page de titre ────────────────────────────────────────
    children.push(h1('\u26a1\ufe0f  Automations \u2014 ' + org));
    children.push(par('G\u00e9n\u00e9r\u00e9 le ' + dateStr
      + '  \u00b7  ' + totalAuto + ' automation' + (totalAuto>1?'s':'')
      + '  \u00b7  ' + totalWH   + ' webhook'    + (totalWH>1?'s':'')
      + '  \u00b7  ' + totalCA   + ' custom action' + (totalCA>1?'s':'')));
    children.push(sp());

    // ── Bloc stats ───────────────────────────────────────────
    children.push(new Table({
      width: { size:9360, type:WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      rows: [
        new TableRow({ children: [
          hdr('\u2699\ufe0f  Automations', '00796B'),
          hdr('\u2705  Actives',           '1565C0'),
          hdr('\uD83D\uDD14  Webhooks',    'B45309'),
          hdr('\u26a1  Custom Actions',    '4A1472'),
        ]}),
        new TableRow({ children: [
          cell(String(totalAuto), { fill:'F0FAFA', bold:true, color:'00796B', center:true, size:28 }),
          cell(String((automationsData.automations||[]).filter(a=>a.active).length),
               { fill:'F0F4FF', bold:true, color:'1565C0', center:true, size:28 }),
          cell(String(totalWH),   { fill:'FFF8F0', bold:true, color:'B45309', center:true, size:28 }),
          cell(String(totalCA),   { fill:'FAF0FF', bold:true, color:'4A1472', center:true, size:28 }),
        ]})
      ]
    }));
    children.push(sp()); children.push(sp());

    // ══════════════════════════════════════════════════════════
    // SECTION 1 : AUTOMATIONS
    // ══════════════════════════════════════════════════════════
    if (totalAuto > 0) {
      children.push(h2('\u2699\ufe0f  Automations', false));
      children.push(sp());

      automationsData.automations.forEach((auto, idx) => {
        children.push(new Paragraph({
          keepNext: true,
          spacing: { before: idx > 0 ? 320 : 0, after:80 },
          children: [
            new TextRun({ text: String(idx+1) + '.  ', size:22, bold:true, font:'Arial', color:'888888' }),
            new TextRun({ text: auto.nom || 'Sans nom', size:22, bold:true, font:'Arial', color:'00796B' }),
            new TextRun({ text: auto.active ? '  \u25cf Actif' : '  \u25cb Inactif',
              size:16, font:'Arial', color: auto.active ? '2ECC71' : 'E74C3C' }),
            ...(auto.methode ? [new TextRun({ text:'  \u2014  ' + auto.methode,
              size:16, font:'Arial', color:'999999' })] : []),
          ]
        }));

        const triggers = auto.triggers  || [];
        const actions  = auto.actions   || [];
        const conds    = auto.conditions || [];
        const maxLen   = Math.max(triggers.length, conds.length, actions.length, 1);

        const rows = [ new TableRow({ tableHeader:true, children:[
          hdr('D\u00e9clencheurs (' + triggers.length + ')', '005B4F'),
          hdr('Conditions ('    + conds.length    + ')', '1A237E'),
          hdr('Actions ('       + actions.length  + ')', '004D40'),
        ]})];

        for (let r = 0; r < maxLen; r++) {
          const t = triggers[r], c = conds[r], a = actions[r];
          const fill = r % 2 === 0 ? 'F5FFF8' : 'FFFFFF';

          const mkCell = (item, type) => {
            if (!item) return cell('\u2014', { fill, w:3120 });
            let label = '', color = '333333';
            let cfgLines = [];
            if (type === 'trigger') {
              label = '\uD83C\uDFAF ' + (typeof TRIGGERS_ICONIK !== 'undefined' && TRIGGERS_ICONIK[item.type]?.label || item.type || '');
              color = '005B4F';
              cfgLines = formatConfigLines(item.type, item.config || {},
                typeof TRIGGERS_ICONIK !== 'undefined' ? TRIGGERS_ICONIK : {});
            } else if (type === 'condition') {
              label = '\uD83D\uDD0E ' + (item.field || item.type || 'Condition');
              color = '1A237E';
              if (item.operator) cfgLines.push({ label: 'Op\u00e9rateur', value: item.operator });
              if (item.value !== undefined && item.value !== '') cfgLines.push({ label: 'Valeur', value: String(item.value) });
            } else {
              label = '\u26a1 ' + (item.type || 'Action');
              color = '004D40';
              cfgLines = formatConfigLines(item.type, item.config || {},
                typeof ACTIONS_ICONIK !== 'undefined' ? ACTIONS_ICONIK : {});
            }
            return new TableCell({
              borders:bs, margins:cm, verticalAlign:VerticalAlign.TOP,
              width:{ size:3120, type:WidthType.DXA },
              shading:{ fill, type:ShadingType.CLEAR },
              children:[
                new Paragraph({ children:[new TextRun({ text:label, size:18, font:'Arial', color, bold:true })]}),
                ...cfgLines.slice(0, 8).map(line => new Paragraph({ children:[
                  new TextRun({ text: line.label + '\u00a0: ', size:15, font:'Arial', color:'888888' }),
                  new TextRun({ text: line.value.slice(0, 80), size:15, font:'Arial', color:'222222', bold:true }),
                ]}))
              ]
            });
          };

          rows.push(new TableRow({ children:[
            mkCell(t, 'trigger'),
            mkCell(c, 'condition'),
            mkCell(a, 'action'),
          ]}));
        }

        children.push(new Table({
          width:{ size:9360, type:WidthType.DXA },
          columnWidths:[3120, 3120, 3120],
          rows
        }));
        // Schéma logique sous le tableau
        buildAutoSchema(auto, docx).forEach(el => children.push(el));
        children.push(sp());
      });
    }

    // ══════════════════════════════════════════════════════════
    // SECTION 2 : WEBHOOKS
    // ══════════════════════════════════════════════════════════
    if (totalWH > 0) {
      children.push(h2('\uD83D\uDD14  Webhooks', totalAuto > 0));
      children.push(sp());

      const whRows = [ new TableRow({ tableHeader:true, children:[
        hdr('Nom',                    'B45309'),
        hdr('\u00c9v\u00e9nement',    'B45309'),
        hdr('Realm / Op\u00e9ration', 'B45309'),
        hdr('URL',                    'B45309'),
      ]})];

      webhooksData.webhooks.forEach((w, i) => {
        const fill = i % 2 === 0 ? 'FFF8F0' : 'FFFFFF';
        whRows.push(new TableRow({ children:[
          cell(w.name || 'Sans nom', { fill, w:1800, bold:true, color:'7C3E00' }),
          cell(w.eventType || '\u2014', { fill, w:1600, color:'555555' }),
          cell((w.realm && w.realm !== 'All' ? w.realm : 'All') + (w.operation ? ' / ' + w.operation : ''),
               { fill, w:1760, color:'555555' }),
          new TableCell({
            borders:bs, margins:cm, verticalAlign:VerticalAlign.CENTER,
            width:{ size:4200, type:WidthType.DXA },
            shading:{ fill, type:ShadingType.CLEAR },
            children:[new Paragraph({ children:[
              new TextRun({ text:w.url || '\u2014', size:15, font:'Courier New', color:'0055AA' })
            ]})]
          }),
        ]}));
      });

      children.push(new Table({ width:{size:9360,type:WidthType.DXA},
        columnWidths:[1800,1600,1760,4200], rows:whRows }));

      // D\u00e9tail query / description
      const wWithDetail = webhooksData.webhooks.filter(w => w.query || w.description);
      if (wWithDetail.length > 0) {
        children.push(sp());
        children.push(new Paragraph({ keepNext:true, spacing:{before:160,after:80},
          children:[new TextRun({ text:'D\u00e9tail des filtres', bold:true, size:20, font:'Arial', color:'B45309' })]
        }));
        wWithDetail.forEach(w => {
          children.push(new Paragraph({ spacing:{before:80,after:20}, children:[
            new TextRun({ text:w.name||'Sans nom', bold:true, size:18, font:'Arial', color:'7C3E00' })
          ]}));
          if (w.description) children.push(par(w.description, '666666'));
          if (w.query) children.push(new Paragraph({ children:[
            new TextRun({ text:'Query : ', bold:true, size:16, font:'Arial', color:'888888' }),
            new TextRun({ text:w.query.slice(0,300), size:15, font:'Courier New', color:'0055AA' })
          ]}));
        });
      }
      children.push(sp());
    }

    // ══════════════════════════════════════════════════════════
    // SECTION 3 : CUSTOM ACTIONS
    // ══════════════════════════════════════════════════════════
    if (totalCA > 0) {
      children.push(h2('\u26a1  Custom Actions', totalWH > 0 || totalAuto > 0));
      children.push(sp());

      const caRows = [ new TableRow({ tableHeader:true, children:[
        hdr('Titre',       '4A1472'),
        hdr('Context',     '4A1472'),
        hdr('Type',        '4A1472'),
        hdr('App / Vue',   '4A1472'),
        hdr('URL',         '4A1472'),
      ]})];

      customActionsData.customActions.forEach((ca, i) => {
        const fill = i % 2 === 0 ? 'FAF0FF' : 'FFFFFF';
        caRows.push(new TableRow({ children:[
          cell(ca.title || 'Sans titre', { fill, w:2000, bold:true, color:'6A1B9A' }),
          cell(ca.context || '\u2014',   { fill, w:1200, center:true, color:'555555' }),
          cell(ca.type    || '\u2014',   { fill, w:800,  center:true, color:'555555' }),
          cell((ca.appName || '') + (ca.metadataView ? (ca.appName ? ' / ' : '') + ca.metadataView : '') || '\u2014',
               { fill, w:1560, color:'555555', size:16 }),
          new TableCell({
            borders:bs, margins:cm, verticalAlign:VerticalAlign.CENTER,
            width:{ size:3800, type:WidthType.DXA },
            shading:{ fill, type:ShadingType.CLEAR },
            children:[new Paragraph({ children:[
              new TextRun({ text:ca.url || '\u2014', size:15, font:'Courier New', color:'9B59B6' })
            ]})]
          }),
        ]}));
      });

      children.push(new Table({ width:{size:9360,type:WidthType.DXA},
        columnWidths:[2000,1200,800,1560,3800], rows:caRows }));
      children.push(sp());
    }

    // ── Pied de page ─────────────────────────────────────────
    children.push(sp());
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children:[new TextRun({ text:'Document g\u00e9n\u00e9r\u00e9 automatiquement \u2014 '
        + org + ' \u2014 ' + dateStr,
        size:16, font:'Arial', color:'AAAAAA', italics:true })]
    }));

    // ── G\u00e9n\u00e9ration fichier ──────────────────────────────────────
    const doc = new Document({
      styles:{ default:{ document:{ run:{ font:'Arial', size:22 }}},
        paragraphStyles:[
          { id:'Heading1', name:'Heading 1', basedOn:'Normal', next:'Normal', quickFormat:true,
            run:{ size:36, bold:true, font:'Arial' },
            paragraph:{ spacing:{ before:240, after:120 }, outlineLevel:0 }},
          { id:'Heading2', name:'Heading 2', basedOn:'Normal', next:'Normal', quickFormat:true,
            run:{ size:26, bold:true, font:'Arial' },
            paragraph:{ spacing:{ before:200, after:80 }, outlineLevel:1 }},
        ]},
      sections:[{ properties:{ page:{
        size:{ width:11906, height:16838 },
        margin:{ top:1134, right:1134, bottom:1134, left:1134 }
      }}, children }]
    });

    const blob = await Packer.toBlob(doc);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'Automations_' + (org || 'Export').replace(/[^a-z0-9]/gi, '_') + '.docx';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    autToast('Export Word g\u00e9n\u00e9r\u00e9 \u2713');

  } catch(err) {
    console.error('Export Word automations:', err);
    autToast('Erreur : ' + err.message, true);
  }
}
