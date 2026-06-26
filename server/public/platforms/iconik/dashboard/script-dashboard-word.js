const LOGO_ASKIDA_B64 = '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';

function b64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function exporterComparaisonWord() {
  if (selectionsComparaison.groupes.length === 0) {
    alert('Aucun élément a exporter.');
    return;
  }
  if (typeof docx === 'undefined') {
    alert('Librairie Word non chargee. Verifiez votre connexion internet.');
    return;
  }

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, Header, Footer, AlignmentType, PageBreak, ShadingType,
    BorderStyle, WidthType, VerticalAlign, PageNumber
  } = docx;

  const C = {
    jaune:'C8D100', noir:'1A1A1A', gris:'404040', grisClair:'595959',
    blanc:'FFFFFF', beige:'F5F5F0', fondCarte:'F8F8F8',
  };
  const FONT = 'Avantt';
  const PAGE_W = 11906, MARGIN = 1417;
  const CW = PAGE_W - 2 * MARGIN;

  const bNone = { style: BorderStyle.NONE, size: 0, color: C.blanc };
  const bAll  = (b) => ({ top:b, right:b, bottom:b, left:b });

  const LOGO  = b64ToUint8(LOGO_ASKIDA_B64);

  function p(runs, opts) {
    opts = opts || {};
    return new Paragraph({ children: Array.isArray(runs)?runs:[runs], ...opts });
  }
  function r(text, opts) {
    opts = opts || {};
    return new TextRun({ text: String(text||''), font: FONT, ...opts });
  }
  function esp(n) {
    n = n || 1;
    return Array.from({length:n}, function() {
      return p([r('',{size:16})], {spacing:{after:0,before:0}});
    });
  }

  function cel(children, opts) {
    opts = opts || {};
    const arr = Array.isArray(children)?children:[children];
    const paras = arr.map(function(c){ return c instanceof Paragraph?c:p([r(c,{size:18})]); });
    return new TableCell({
      children: paras,
      width: opts.w ? {size:opts.w, type:WidthType.DXA} : undefined,
      shading: opts.fill ? {fill:opts.fill, type:ShadingType.CLEAR, color:'auto'} : undefined,
      borders: opts.brd || bAll(bNone),
      verticalAlign: opts.align || VerticalAlign.CENTER,
      margins: opts.mg || {top:80,bottom:80,left:120,right:120},
    });
  }

  function bandeau(label) {
    return new Table({
      width:{size:CW,type:WidthType.DXA}, columnWidths:[CW],
      rows:[new TableRow({children:[
        cel(p([r(label,{bold:true,color:C.blanc,size:22})],{alignment:AlignmentType.LEFT}),
          {w:CW,fill:C.gris,brd:bAll(bNone),mg:{top:120,bottom:120,left:200,right:200}})
      ]})]
    });
  }

  function sousTitre(label) {
    return p([r(label,{bold:true,size:20,color:C.gris})],
      {spacing:{before:280,after:80},
       border:{bottom:{style:BorderStyle.SINGLE,size:4,color:C.jaune}}});
  }

  function ligneVide(n) {
    n = n || 1;
    return Array.from({length:n}, function() { return p([r('')]); });
  }

  const dateStr = new Date().toLocaleDateString('fr-FR');
  const timeStr = new Date().toLocaleTimeString('fr-FR');
  const sel = selectionsComparaison;
  const groupes = sel.groupes.map(function(item){ return item.data || item; });
  const nbCols = new Set(groupes.reduce(function(acc,g){ return acc.concat((g.collections||[]).map(function(c){return c.chemin;})); },[])).size;
  const nbVues = new Set(groupes.reduce(function(acc,g){ return acc.concat((g.vues||g.metadataViews||[]).map(function(v){return v.nom||v;})); },[])).size;
  const nbAuto = (automationsData.automations||[]).length;

  const children = [];

  // PAGE DE GARDE
  children.push(
    p([new ImageRun({data:LOGO,type:'png',transformation:{width:170,height:34}})],
      {spacing:{before:480,after:800}}),
    p([r('Matrice Permissions',{bold:true,size:56,color:C.noir})],
      {spacing:{before:960,after:240}}),
    p([r('Iconik',{size:28,color:C.gris})],{spacing:{before:0,after:480}}),
    new Table({
      width:{size:CW,type:WidthType.DXA},columnWidths:[CW],
      rows:[new TableRow({children:[cel(p([r('')]),{w:CW,fill:C.jaune,brd:bAll(bNone),mg:{top:50,bottom:50}})]})]
    })
  );
  children.push.apply(children, esp(2));
  children.push(
    p([r('Généré le ' + dateStr + ' à ' + timeStr,{size:20,color:C.gris})],{spacing:{before:240,after:80}}),
    p([r(groupes.length + ' team(s)/role group(s) analysé(s)',{size:20,color:C.gris})]),
    ...sel.groupes.map(function(g){
      var isTeam=g.icon==='👥';
      return p([
        r((isTeam ? '●  Team  ' : '●  Role Group  '),{size:14,bold:true,color:isTeam?C.jaune:'888888'}),
        r(g.nom||'',{size:18,bold:true,color:C.noir}),
      ],{spacing:{before:40,after:40},indent:{left:240}});
    }),
    p([new PageBreak()])
  );

  // SOMMAIRE
  const sections = [
    ['Résumé exécutif','2'],
    ['Glossaire','3'],
    ['Details des groupes','4'],
    ['Arborescence Collections - Groupes', String(4+groupes.length)],
    ['Arborescence Collections - Metadata Views', String(5+groupes.length)],
  ];
  children.push(
    p([r('SOMMAIRE',{bold:true,size:40,color:C.noir})],{alignment:AlignmentType.CENTER,spacing:{before:480,after:240}}),
    new Table({
      width:{size:4000,type:WidthType.DXA},columnWidths:[4000],
      rows:[new TableRow({children:[cel(p([r('')]),{w:4000,fill:C.jaune,brd:bAll(bNone),mg:{top:40,bottom:40}})]})]
    })
  );
  children.push.apply(children, esp(1));
  const hw = Math.floor(CW/2);
  children.push(
    new Table({
      width:{size:CW,type:WidthType.DXA}, columnWidths:[hw,CW-hw],
      rows:[
        new TableRow({children:[
          cel(p([r('Groupes: ' + groupes.length,{size:18,color:C.gris})]),{w:hw,fill:C.beige,brd:bAll(bNone)}),
          cel(p([r('Collections: ' + nbCols,{size:18,color:C.gris})]),{w:CW-hw,fill:C.beige,brd:bAll(bNone)}),
        ]}),
        new TableRow({children:[
          cel(p([r('Metadata Views: ' + nbVues,{size:18,color:C.gris})]),{w:hw,fill:C.fondCarte,brd:bAll(bNone)}),
          cel(p([r('Automations: ' + nbAuto,{size:18,color:C.gris})]),{w:CW-hw,fill:C.fondCarte,brd:bAll(bNone)}),
        ]}),
      ]
    }),
    ...ligneVide(1),
    p([r('GROUPES ANALYSÉS',{bold:true,size:18,color:C.gris})],{spacing:{before:120,after:100}}),
    new Table({
      width:{size:CW,type:WidthType.DXA},columnWidths:[360,CW-360],
      rows:sel.groupes.map(function(g,i){
        var isTeam=g.icon==='👥';
        return new TableRow({children:[
          cel(
            p([r(isTeam?'Team':'Role Group',{size:14,bold:true,color:C.blanc})],{alignment:AlignmentType.CENTER}),
            {w:360,fill:isTeam?C.jaune:'595959',brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:80},align:VerticalAlign.CENTER}
          ),
          cel(
            p([r((isTeam ? '👥 ' : '🔐 ')+' '+(g.nom||''),{size:16,bold:true,color:C.noir})]),
            {w:CW-360,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:160,right:120}}
          ),
        ]});
      })
    }),
    ...esp(1),
    ...ligneVide(1),
    p([r('TABLE DES MATIÈRES',{bold:true,size:24,color:C.gris})],{spacing:{before:120,after:200}}),
    new Table({
      width:{size:CW,type:WidthType.DXA}, columnWidths:[CW-800,800],
      rows: sections.map(function(s,i){
        return new TableRow({children:[
          cel(p([r(s[0],{size:20,color:C.noir})]),{w:CW-800,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:100,bottom:100,left:160,right:0}}),
          cel(p([r(s[1],{size:20,bold:true,color:C.noir})],{alignment:AlignmentType.RIGHT}),{w:800,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:100,bottom:100,left:0,right:160}}),
        ]});
      })
    }),
    p([new PageBreak()])
  );

  // RESUME EXECUTIF
  var nomsG = groupes.map(function(g){return g.nom||'';}).join(', ');
  var premC = groupes.reduce(function(acc,g){return acc.concat((g.collections||[]).map(function(c){return c.chemin;}));}, []).slice(0,2).join(', ');
  var premV = Array.from(new Set(groupes.reduce(function(acc,g){return acc.concat((g.vues||g.metadataViews||[]).map(function(v){return v.nom||v;}));}, []))).slice(0,2).join(', ');
  children.push(
    bandeau('RÉSUMÉ EXÉCUTIF')
  ); 
  children.push.apply(children, esp(1));
  children.push(

    // Paragraphe intro court
    p([r('Ce document présente la configuration des permissions Iconik à la date du ' + dateStr + '. Il couvre ' + nbCols + ' collection(s), ' + nbVues + ' metadata view(s) et ' + nbAuto + ' automation(s).',{size:20})],{spacing:{before:0,after:280}}),

    // Synthèse par groupe
    sousTitre('SYNTHÈSE PAR GROUPE'),
    ...groupes.map(function(g, gi) {
      var isTeam = sel.groupes[gi] && sel.groupes[gi].icon === '👥';
      var cols = g.collections || [];
      var colsRW = cols.filter(function(c){return c.permission==='Read & Write';}).length;
      var colsRO = cols.length - colsRW;
      var vuesG = g.vues || g.metadataViews || [];
      var rolesG = g.fonctionnalites || [];
      var colCheminsG = cols.map(function(c){return c.chemin;});
      var autosG = (automationsData.automations||[]).filter(function(a){
        return (a.triggers||[]).some(function(t){
          return (t.type==='asset.added_to_collection' && ((t.config&&t.config.collections)||[]).some(function(c){return colCheminsG.indexOf(c)>-1;}))
              || (t.type==='metadata.changed' && ((t.config&&t.config.metadataViews)||[]).some(function(mv){return (vuesG.map(function(v){return v.nom||v;})).indexOf(mv)>-1;}));
        });
      });
      var ssG = (g.savedSearches||[]).length;
      var stG = (g.storages||[]).length;
      var labelType = isTeam ? 'Team' : 'Role Group';
      var fillType = isTeam ? 'C8D100' : '595959';
      var textColor = isTeam ? C.noir : C.blanc;

      var lignes = [
        new TableRow({children:[
          cel(p([r(labelType,{bold:true,size:14,color:textColor})],{alignment:AlignmentType.CENTER}),
            {w:1400,fill:fillType,brd:bAll(bNone),mg:{top:140,bottom:140,left:120,right:120},align:VerticalAlign.CENTER}),
          cel(p([r(g.nom||'',{bold:true,size:18,color:C.noir})]),
            {w:CW-1400,fill:C.beige,brd:bAll(bNone),mg:{top:140,bottom:80,left:160,right:120}}),
        ]}),
      ];
      // Ligne détails
      var details = [];
      details.push(r('Collections : ',{size:16,bold:true,color:C.gris}));
      details.push(r(cols.length + ' total',{size:16,color:C.gris}));
      if (colsRW > 0) details.push(r('  ·  ' + colsRW + ' R&W',{size:16,color:'0DB852',bold:true}));
      if (colsRO > 0) details.push(r('  ·  ' + colsRO + ' RO',{size:16,color:'0F4761',bold:true}));
      if (vuesG.length > 0) { details.push(r('     Metadata Views : ',{size:16,bold:true,color:C.gris})); details.push(r(vuesG.length + ' vue(s)',{size:16,color:C.gris})); }
      if (rolesG.length > 0) { details.push(r('     Rôles : ',{size:16,bold:true,color:C.gris})); details.push(r(rolesG.join(', '),{size:16,color:C.gris})); }
      if (autosG.length > 0) { details.push(r('     Automations : ',{size:16,bold:true,color:C.gris})); details.push(r(autosG.map(function(a){return a.nom;}).join(', '),{size:16,color:C.gris})); }
      if (ssG > 0) { details.push(r('     Saved Searches : ',{size:16,bold:true,color:C.gris})); details.push(r(ssG + '',{size:16,color:C.gris})); }
      if (stG > 0) { details.push(r('     Storages : ',{size:16,bold:true,color:C.gris})); details.push(r(stG + '',{size:16,color:C.gris})); }
      lignes.push(new TableRow({children:[
        cel(p([r('')]),{w:1400,fill:C.blanc,brd:bAll(bNone),mg:{top:0}}),
        cel(p(details),{w:CW-1400,fill:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:120,left:160,right:120}}),
      ]}));

      return new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[1400,CW-1400],
        rows: lignes
      });
    }),
    ...ligneVide(1),
    p([r('Les pages suivantes détaillent, pour chaque groupe, l\'ensemble des collections accessibles, les metadata views, rôles, items, saved searches, storages et automations associés.',{size:18,italics:true,color:C.grisClair})],{spacing:{before:80,after:400}}),

    p([new PageBreak()])
  );

  // GLOSSAIRE
  var termes = [
    ['Collection','Structure hiérarchique permettant d\'organiser les assets. Les permissions peuvent être définies au niveau de chaque collection, déterminant qui peut consulter ou modifier son contenu.'],
    ['Metadata View','Vue regroupant un ensemble de champs de métadonnées. Les groupes avec accès à une vue peuvent consulter et éditer les métadonnées associées à cette vue.'],
    ['Team','Groupe d\'utilisateurs Iconik avec accès directs aux Collections, MD Views, Saved Searches, Storages et Rôles. Les Teams portent directement leurs listes de ressources autorisées.'],
    ['Role Group','Groupe fonctionnel regroupant des rôles système. Les Role Groups partagent la même structure de permissions que les Teams mais sont orientés droits applicatifs (fonctionnalités).'],
    ['Read Only','Permission de lecture seule. Les utilisateurs peuvent consulter le contenu mais ne peuvent pas le modifier, le supprimer ou en créer de nouveau. Dans ce document, représentée en bleu.'],
    ['Read/Write','Permission de lecture et écriture. Les utilisateurs peuvent consulter, modifier, créer et parfois supprimer le contenu selon les droits spécifiques. Dans ce document, représentée en vert.'],
    ['Workflow','Processus automatisé déclenché par des événements spécifiques (dépôt dans une collection, modification de métadonnée). Utilisé pour automatiser des tâches récurrentes.'],
    ['Rôle (Role)','Ensemble prédéfini de permissions système (Core Functionality, Collaborate, Upload, etc.) attribué aux groupes pour définir leurs capacités dans l\'application.'],
    ['Item','Objet ou ressource système (Assets, Collections, Files, Formats, etc.) sur lequel des permissions spécifiques peuvent être appliquées (Read, Write, Delete, Create).'],
  ];
  children.push(bandeau('GLOSSAIRE'));
  children.push.apply(children, esp(1));
  children.push(new Table({
    width:{size:CW,type:WidthType.DXA}, columnWidths:[2200,CW-2200],
    rows: termes.map(function(t,i){
      return new TableRow({children:[
        cel(p([r(t[0],{bold:true,size:18,color:C.blanc})]),{w:2200,fill:C.gris,brd:bAll(bNone),mg:{top:120,bottom:120,left:160,right:160}}),
        cel(p([r(t[1],{size:18,color:C.gris})]),{w:CW-2200,fill:i%2===0?C.blanc:C.beige,brd:bAll(bNone),mg:{top:120,bottom:120,left:160,right:160}}),
      ]});
    })
  }), p([new PageBreak()]));

  // DETAILS PAR GROUPE
  groupes.forEach(function(groupe, gi) {
    var nom = groupe.nom || '';
    var vues = groupe.vues || groupe.metadataViews || [];
    var roles = groupe.fonctionnalites || [];
    var collections = groupe.collections || [];

    if (gi > 0) children.push(p([new PageBreak()]));

    var typeLabel = sel.groupes[gi] && sel.groupes[gi].icon === '👥' ? 'TEAM' : 'ROLE GROUP';
    var bandFill = sel.groupes[gi] && sel.groupes[gi].icon === '👥' ? 'C8D100' : '404040';
    children.push(new Table({
      width:{size:CW,type:WidthType.DXA}, columnWidths:[CW],
      rows:[new TableRow({children:[
        cel(p([r(typeLabel + ' : ' + nom,{bold:true,color:bandFill==='C8D100'?C.noir:C.blanc,size:24})]),
          {w:CW,fill:bandFill,brd:bAll(bNone),mg:{top:160,bottom:160,left:200,right:200}})
      ]})]
    }));
    children.push.apply(children, esp(1));

    // Collections
    children.push(sousTitre('COLLECTIONS'));
    if (collections.length > 0) {
      children.push(new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[2000,CW-2000],
        rows: collections.map(function(col,i){
          return new TableRow({children:[
            cel(p([r(col.permission==='Read & Write'?'Lecture/Écriture':'Lecture',{size:16,bold:true,color:col.permission==='Read & Write'?'0DB852':'0F4761'})]),{w:2000,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:120,right:80}}),
            cel(p([r(col.chemin,{size:16})]),{w:CW-2000,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:120}}),
          ]});
        })
      }));
    } else { children.push(p([r('Aucun élément',{size:16,color:C.grisClair,italics:true})])); }

    // Metadata Views
    children.push(sousTitre('METADATA VIEWS'));
    if (vues.length > 0) {
      children.push(new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[CW-2000,2000],
        rows: vues.map(function(v,i){
          return new TableRow({children:[
            cel(p([r(v.nom||v,{size:16,bold:true})]),{w:CW-2000,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:120,right:80}}),
            cel(p([r(v.permission||'',{size:16})]),{w:2000,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:120}}),
          ]});
        })
      }));
    } else { children.push(p([r('Aucun élément',{size:16,color:C.grisClair,italics:true})])); }

    // Metadonnees
    var metasSet = new Set();
    vues.forEach(function(v){
      var nv = v.nom||v;
      metadonneesData.metadonnees.forEach(function(m){
        var mViews = m.metadataViews||(m.metadataView?[m.metadataView]:[]);
        if (mViews.indexOf(nv) > -1) metasSet.add(m.nom);
      });
    });
    var metasList = Array.from(metasSet);
    children.push(sousTitre('MÉTADONNÉES'));
    children.push(p([r(metasList.length>0?metasList.join('  -  '):'Aucun élément',
      {size:16,color:metasList.length>0?C.gris:C.grisClair,italics:metasList.length===0})]));

    // Roles
    children.push(sousTitre('RÔLES'));
    children.push(p([r(roles.length>0?roles.join('  -  '):'Aucun élément',
      {size:16,color:roles.length>0?C.gris:C.grisClair,italics:roles.length===0})]));

    // Items
    var itemsMap = new Map();
    (itemsAdvancedData.items||[]).forEach(function(it){
      if (!it.assignations) return;
      var ass = it.assignations.filter(function(a){return roles.indexOf(a.role)>-1;});
      if (ass.length>0){
        var perms=new Set();
        ass.forEach(function(a){(a.permissions||[]).forEach(function(pp){perms.add(pp);});});
        itemsMap.set(it.nom, Array.from(perms));
      }
    });
    var itemsList2 = Array.from(itemsMap.entries());
    children.push(sousTitre('ITEMS'));
    if (itemsList2.length>0){
      children.push(new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[2400,CW-2400],
        rows: itemsList2.map(function(entry,i){
          return new TableRow({children:[
            cel(p([r(entry[0],{size:16,bold:true})]),{w:2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:120,right:80}}),
            cel(p([r(entry[1].join('  '),{size:16})]),{w:CW-2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:120}}),
          ]});
        })
      }));
    } else { children.push(p([r('Aucun élément',{size:16,color:C.grisClair,italics:true})])); }

    // Automations
    var colChemins = collections.map(function(col){return col.chemin;});
    var autos = (automationsData.automations||[]).filter(function(a){
      return (a.triggers||[]).some(function(t){
        return (t.type==='asset.added_to_collection' && ((t.config&&t.config.collections)||[]).some(function(c){return colChemins.indexOf(c)>-1;}))
            || (t.type==='metadata.changed' && ((t.config&&t.config.metadataViews)||[]).some(function(mv){return (vues.map(function(v){return v.nom||v;})).indexOf(mv)>-1;}));
      });
    });
    children.push(sousTitre('AUTOMATIONS'));
    children.push(p([r(autos.length>0?autos.map(function(a){return a.nom;}).join('  -  '):'Aucun élément',
      {size:16,color:autos.length>0?C.gris:C.grisClair,italics:autos.length===0})]));

    // Saved Searches
    var ssNames = (groupe.savedSearches||[]).map(function(s){return typeof s==='string'?s:s.nom;});
    var savedSearchesDuGroupe = (savedSearchesData.savedSearches||[]).filter(function(s){return ssNames.indexOf(s.nom)>-1;});
    children.push(sousTitre('SAVED SEARCHES'));
    if (savedSearchesDuGroupe.length > 0) {
      children.push(new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[CW-2400,2400],
        rows: savedSearchesDuGroupe.map(function(s,i){
          return new TableRow({children:[
            cel(p([r(s.nom,{size:16,bold:true})]),{w:CW-2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:120,right:80}}),
            cel(p([r(s.metadataView||'',{size:14,color:C.grisClair,italics:true})]),{w:2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:120}}),
          ]});
        })
      }));
    } else { children.push(p([r('Aucun élément',{size:16,color:C.grisClair,italics:true})])); }

    // Storages
    var stNames = (groupe.storages||[]).map(function(s){return typeof s==='string'?s:s.nom;});
    var storagesDuGroupe = (storagesData.storages||[]).filter(function(s){return stNames.indexOf(s.nom)>-1;});
    children.push(sousTitre('STORAGES'));
    if (storagesDuGroupe.length > 0) {
      children.push(new Table({
        width:{size:CW,type:WidthType.DXA}, columnWidths:[CW-2400,2400],
        rows: storagesDuGroupe.map(function(s,i){
          var perm = ((s.groupes||[]).find(function(g){return g.nom===nom;})||{}).permission||'';
          var isRO = perm==='Read Only';
          return new TableRow({children:[
            cel(p([r(s.nom,{size:16,bold:true})]),{w:CW-2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:120,right:80}}),
            cel(p([r(perm,{size:14,bold:true,color:isRO?'0F4761':'0DB852'})]),{w:2400,fill:i%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:80,bottom:80,left:80,right:120}}),
          ]});
        })
      }));
    } else { children.push(p([r('Aucun élément',{size:16,color:C.grisClair,italics:true})])); }
  });

  // ARBORESCENCE GROUPES
  children.push(p([new PageBreak()]), bandeau('ARBORESCENCE COLLECTIONS - TEAMS & ROLE GROUPS'),
    p([r('Collections avec droits d\'accès par groupe',{size:18,color:C.grisClair,italics:true})],{spacing:{before:120,after:200}}));

  var racine1 = {};
  groupes.forEach(function(g){
    (g.collections||[]).forEach(function(col){
      var pp = col.chemin.split('/').filter(Boolean);
      var nd = racine1;
      pp.forEach(function(seg){ if(!nd[seg]) nd[seg]={_groupes:[],_enfants:{}}; nd=nd[seg]._enfants; });
      var n=racine1;
      pp.forEach(function(seg,idx){
        if(idx===pp.length-1) n[seg]._groupes.push({nom:g.nom,permission:col.permission});
        else n=n[seg]._enfants;
      });
    });
  });
  var rowsA1 = [new TableRow({children:[
    cel(p([r('COLLECTION',{bold:true,size:16,color:C.blanc})]),{w:CW-2800,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:120,right:80}}),
    cel(p([r('TEAMS / ROLE GROUPS',{bold:true,size:16,color:C.blanc})]),{w:2800,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:80,right:120}}),
  ]})];
  function pa1(nd,niv){
    Object.keys(nd).sort().forEach(function(cle){
      var fill=niv===0?C.gris:niv%2===0?C.beige:C.blanc;
      var tc=niv===0?C.blanc:C.noir;
      // Construire les runs colorés pour chaque groupe selon sa permission
      var groupeRuns=[];
      nd[cle]._groupes.forEach(function(g,gi){
        var isRW=g.permission==='Read & Write';
        var couleur=isRW?'0DB852':'2E75B6';
        var label=g.nom+(isRW?' (R&W)':' (RO)');
        if(gi>0)groupeRuns.push(r('  |  ',{size:13,color:'AAAAAA'}));
        groupeRuns.push(r(label,{size:13,bold:true,color:couleur}));
      });
      var groupeCell=groupeRuns.length>0
        ?cel(p(groupeRuns),{w:2800,fill:fill,brd:bAll(bNone),mg:{top:60,bottom:60,left:80,right:120}})
        :cel(p([r('',{size:13})]),{w:2800,fill:fill,brd:bAll(bNone),mg:{top:60,bottom:60,left:80,right:120}});
      rowsA1.push(new TableRow({children:[
        cel(p([
          niv>0?r('» '.repeat(niv),{size:13,color:'CCCCCC',bold:false,font:'Arial'}):r(''),
          r('■  ',{size:niv===0?14:12,color:niv===0?'FFFFFF':'AAAAAA',font:'Arial'}),
          r(cle,{bold:niv<2,size:niv===0?18:16,color:tc}),
        ]),{w:CW-2800,fill:fill,brd:bAll(bNone),mg:{top:60,bottom:60,left:120+niv*120,right:80}}),
        groupeCell,
      ]}));
      pa1(nd[cle]._enfants, niv+1);
    });
  }
  pa1(racine1, 0);
  children.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW-2800,2800],rows:rowsA1}));

  // ARBORESCENCE METADATA VIEWS
  children.push(p([new PageBreak()]), bandeau('ARBORESCENCE COLLECTIONS - METADATA VIEWS'),
    p([r('Collections avec catégories et métadonnées',{size:18,color:C.grisClair,italics:true})],{spacing:{before:120,after:200}}));

  var CV2 = new Map();
  groupes.forEach(function(g){
    var vv = (g.vues||g.metadataViews||[]).map(function(v){return v.nom||v;});
    (g.collections||[]).forEach(function(col){
      if(!CV2.has(col.chemin)) CV2.set(col.chemin, new Set());
      vv.forEach(function(v){ CV2.get(col.chemin).add(v); });
    });
  });
  var racine2 = {};
  Array.from(CV2.keys()).forEach(function(chemin){
    var pp=chemin.split('/').filter(Boolean);
    var nd=racine2;
    pp.forEach(function(seg){if(!nd[seg]) nd[seg]={_vues:new Set(),_enfants:{}}; nd=nd[seg]._enfants;});
    var n=racine2;
    pp.forEach(function(seg,idx){
      if(idx===pp.length-1) CV2.get(chemin).forEach(function(v){n[seg]._vues.add(v);});
      else n=n[seg]._enfants;
    });
  });
  var W1=1800, W2=1600, W3=1600, W4=CW-5000;
  var rowsA2=[new TableRow({children:[
    cel(p([r('COLLECTION',{bold:true,size:16,color:C.blanc})]),{w:W1,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:120,right:80}}),
    cel(p([r('CATEGORIE', {bold:true,size:16,color:C.blanc})]),{w:W2,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:80,right:80}}),
    cel(p([r('VUE',       {bold:true,size:16,color:C.blanc})]),{w:W3,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:80,right:80}}),
    cel(p([r('METADONNEES',{bold:true,size:16,color:C.blanc})]),{w:W4,fill:C.noir,brd:bAll(bNone),mg:{top:100,bottom:100,left:80,right:120}}),
  ]})];
  function pa2(nd,niv){
    Object.keys(nd).sort().forEach(function(cle){
      var fill=niv===0?C.gris:niv%2===0?C.beige:C.blanc;
      var tc=niv===0?C.blanc:C.noir;
      var vv2=Array.from(nd[cle]._vues);
      if(vv2.length>0){
        vv2.forEach(function(vue,vi){
          var metas2=(metadonneesData.metadonnees||[]).filter(function(m){
            var mv=m.metadataViews||(m.metadataView?[m.metadataView]:[]);
            return mv.indexOf(vue)>-1;
          }).map(function(m){return m.nom;});
          var cat=(categoriesData.categories||[]).find(function(c){return c.metadataViews&&c.metadataViews.indexOf(vue)>-1;});
          var catNom=cat?cat.nom:'';
          rowsA2.push(new TableRow({children:[
            cel(vi===0?p([
              niv>0?r('» '.repeat(niv),{size:13,color:'CCCCCC',bold:false,font:'Arial'}):r(''),
              r('■  ',{size:12,color:'AAAAAA',font:'Arial'}),
              r(cle,{bold:niv<2,size:16,color:tc}),
            ]):p([r('')]),
              {w:W1,fill:fill,brd:bAll(bNone),mg:{top:60,bottom:60,left:120+niv*80,right:80}}),
            cel(p([r(catNom,{size:14,color:C.grisClair,italics:true})]),
              {w:W2,fill:vi%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:60,bottom:60,left:80,right:80}}),
            cel(p([r(vue,{size:14,bold:true,color:C.gris})]),
              {w:W3,fill:vi%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:60,bottom:60,left:80,right:80}}),
            // Word gere le wrapping automatiquement
            cel(p([r(metas2.join(', ')||'Aucune',{size:12,color:C.grisClair})]),
              {w:W4,fill:vi%2===0?C.beige:C.blanc,brd:bAll(bNone),mg:{top:60,bottom:60,left:80,right:120}}),
          ]}));
        });
      } else {
        rowsA2.push(new TableRow({children:[
          cel(p([r(cle,{bold:niv<2,size:16,color:tc})]),{w:W1,fill:fill,brd:bAll(bNone),mg:{top:60,bottom:60,left:120+niv*120,right:80}}),
          cel(p([r('')]),{w:W2,fill:fill,brd:bAll(bNone)}),
          cel(p([r('')]),{w:W3,fill:fill,brd:bAll(bNone)}),
          cel(p([r('')]),{w:W4,fill:fill,brd:bAll(bNone)}),
        ]}));
      }
      pa2(nd[cle]._enfants, niv+1);
    });
  }
  pa2(racine2,0);
  children.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[W1,W2,W3,W4],rows:rowsA2}));

  // GENERER ET TELECHARGER
  var hw2 = Math.floor(CW/2);
  var doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20, color: C.noir } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: 1560, right: MARGIN, bottom: 851, left: MARGIN, header: 708, footer: 394 },
        },
        titlePage: true,
      },
      headers: { default: new Header({ children: [
        new Table({
          width:{size:CW,type:WidthType.DXA}, columnWidths:[hw2,CW-hw2],
          rows:[new TableRow({children:[
            cel(p([new ImageRun({data:LOGO,type:'png',transformation:{width:85,height:17}})]),
              {w:hw2,brd:bAll(bNone),mg:{top:0,bottom:0,left:0,right:0}}),
            cel(p([r('Matrice Permissions - Iconik',{size:16,color:C.grisClair})],{alignment:AlignmentType.RIGHT}),
              {w:CW-hw2,brd:bAll(bNone),mg:{top:0,bottom:0,left:0,right:0}}),
          ]})]
        })
      ]})},
      footers: {
        default: new Footer({ children: [
          new Table({
            width:{size:CW,type:WidthType.DXA}, columnWidths:[200,hw2-200,CW-hw2],
            rows:[new TableRow({children:[
              cel(p([new ImageRun({data:LOGO,type:'png',transformation:{width:50,height:10}})]),{w:200,brd:bAll(bNone),mg:{top:0,bottom:0,left:0,right:0}}),
              cel(p([r('Aski-da Managed Services — ' + dateStr,{size:16,color:C.grisClair})]),{w:hw2-200,brd:bAll(bNone),mg:{top:0,bottom:0,left:0,right:0}}),
              cel(p([new TextRun({children:[PageNumber.CURRENT],font:FONT,size:16,color:C.gris,bold:true})],{alignment:AlignmentType.RIGHT}),{w:CW-hw2,brd:bAll(bNone),mg:{top:0,bottom:0,left:0,right:0}}),
            ]})]
          })
        ]}),
        first: new Footer({ children: [p([r('')])] }),
      },
      children: children,
    }]
  });

  var blob = await Packer.toBlob(doc);
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'matrice-permissions_' + new Date().toISOString().slice(0,10) + '.docx';
  a.click();
  URL.revokeObjectURL(url);
}
