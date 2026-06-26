// export-exceljs.browser.js (patch)
// Usage : window.askidaExportExcel(rows, options)
// Prérequis dans la page :
//   <script src="../_vendor/exceljs/exceljs.min.js"></script>
//   <script type="module" src="../_vendor/exceljs/export-exceljs.browser.js"></script>

(function(){
  if (typeof window === 'undefined') return;
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    console.error('[export-exceljs] ExcelJS global manquant. Inclure exceljs.min.js AVANT ce fichier.');
    return;
  }

  const DEFAULTS = {
    fileName: 'export.xlsx',
    sheetName: 'Données',
    tableName: 'T_DATA',
    tableStyle: 'TableStyleMedium9',
    columns: [
      { header:'Nom',           key:'name',       width:36 },
      { header:'Type',          key:'kind',       width:16 },
      { header:'Statut',        key:'status',     width:12 },
      { header:'Appels',        key:'calls',      width:10, style:{ numFmt:'0' } },
      { header:'Latence (ms)',  key:'latency_ms', width:14, style:{ numFmt:'0.0' } },
      { header:'Création',      key:'created',    width:14, style:{ numFmt:'yyyy-mm-dd' } },
    ],
    headerStyle: {
      fg: 'FF34495E', // fond
      font: 'FFFFFFFF', // texte
      border: 'FF2C3E50' // bordure fine
    }
  };

  function normalizeDate(v){
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function mapToRow(r, columns){
    const out = [];
    for (const col of columns) {
      if (col.key === 'created') out.push(normalizeDate(r[col.key]));
      else out.push(r[col.key] ?? null);
    }
    return out;
  }
  function styleHeader(row, o) {
    row.font = { bold:true, color:{ argb:o.headerStyle.font } };
    row.alignment = { vertical:'middle', horizontal:'center' };
    row.height = 22;
    row.eachCell((cell) => {
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:o.headerStyle.fg } };
      cell.border = {
        top:{ style:'thin', color:{ argb:o.headerStyle.border } },
        left:{ style:'thin', color:{ argb:o.headerStyle.border } },
        bottom:{ style:'thin', color:{ argb:o.headerStyle.border } },
        right:{ style:'thin', color:{ argb:o.headerStyle.border } },
      };
    });
  }

  async function exportExcel(rows = [], opts = {}){
    const o = Object.assign({}, DEFAULTS, opts || {});
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(o.sheetName);

    // Colonnes + largeurs + formats
    ws.columns = o.columns;

    // En-têtes stylés
    styleHeader(ws.getRow(1), o);

    const hasData = Array.isArray(rows) && rows.length > 0;

    if (hasData) {
      // 1) Ajouter les lignes de données
      const rows2D = rows.map(r => mapToRow(r, o.columns));
      ws.addRows(rows2D);

      // 2) Créer la Table (pas d'autoFilter additionnel)
      ws.addTable({
        name: String(o.tableName || 'T_DATA').replace(/[^A-Za-z0-9_]/g,'_').slice(0,64),
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: { theme:o.tableStyle, showRowStripes:true },
        columns: o.columns.map(c => ({ name:c.header })),
        rows: rows2D
      });

      // 3) Figer la ligne d’en-tête (optionnel)
      ws.views = [{ state:'frozen', ySplit:1 }];
    } else {
      // Pas de données -> PAS de Table, PAS d'autoFilter (évite la réparation Excel)
      // On laisse juste la ligne d’en-têtes stylée.
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = o.fileName || 'export.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // API publique
  window.askidaExportExcel = exportExcel;
})();