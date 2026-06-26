
// export-exceljs.browser.js
// Wrapper minimal côté navigateur : utilise window.ExcelJS (fourni par exceljs.min.js)
// Fournit window.askidaExportExcel(rows, options)

(function(){
  if (typeof window === 'undefined') return;
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) { console.error('[export-exceljs] ExcelJS global manquant. Assure-toi d’inclure exceljs.min.js avant.'); return; }

  function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function toExcelDate(v){ if(!v) return null; if(v instanceof Date) return v; const d=new Date(v); return isNaN(d.getTime())? null : d; }
  function colNumToName(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-m)/26);} return s; }

  async function exportExcel(rows = [], opts = {}){
    const o = Object.assign({
      fileName:'export.xlsx', sheetName:'Données', tableName:'T_DATA', tableStyle:'TableStyleMedium9'
    }, opts||{});

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(o.sheetName);

    ws.columns = (o.columns && o.columns.length) ? o.columns : [
      { header:'Nom', key:'name', width:36 },
      { header:'Type', key:'kind', width:16 },
      { header:'Statut', key:'status', width:12 },
      { header:'Appels', key:'calls', width:10, style:{ numFmt:'0' } },
      { header:'Latence (ms)', key:'latency_ms', width:14, style:{ numFmt:'0.0' } },
      { header:'Création', key:'created', width:14, style:{ numFmt:'yyyy-mm-dd' } },
    ];

    const header = ws.getRow(1);
    header.font = { bold:true, color:{ argb:'FFFFFFFF' } };
    header.alignment = { vertical:'middle', horizontal:'center' };
    header.height = 22;
    header.eachCell((cell)=>{
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF34495E' } };
      cell.border = {
        top:{ style:'thin', color:{ argb:'FF2C3E50' } },
        left:{ style:'thin', color:{ argb:'FF2C3E50' } },
        bottom:{ style:'thin', color:{ argb:'FF2C3E50' } },
        right:{ style:'thin', color:{ argb:'FF2C3E50' } },
      };
    });

    for (const r of rows){
      ws.addRow({
        name: r.name??'', kind: r.kind??'', status: r.status??'',
        calls: toNumber(r.calls), latency_ms: toNumber(r.latency_ms), created: toExcelDate(r.created)
      });
    }

    const lastRow = Math.max(1, ws.rowCount);
    ws.addTable({
      name: String(o.tableName||'T_DATA').replace(/[^A-Za-z0-9_]/g,'_').slice(0,64),
      ref: 'A1', headerRow:true, totalsRow:false,
      style: { theme:o.tableStyle, showRowStripes:true },
      columns: ws.columns.map(c=>({ name:c.header })),
      rows: ws.getSheetValues().slice(2).map(arr=>arr?.slice(1)??[]),
    });

    ws.views = [{ state:'frozen', ySplit:1 }];
    ws.autoFilter = `A1:${colNumToName(ws.columnCount)}1`;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = o.fileName || 'export.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // Expose une API simple
  window.askidaExportExcel = exportExcel;
})();
