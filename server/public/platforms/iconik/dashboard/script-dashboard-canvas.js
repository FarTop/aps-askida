// DASHBOARD CANVAS ENGINE v4 — CASSETTES
// Affichage en cassettes verticales côte à côte, slider horizontal
// Panel gauche inchangé, store/exports inchangés

const DBC_COLORS={team:'#e84393',roleGroup:'#9b59b6',collection:'#3498db',metadataView:'#f39c12',metadonnee:'#e67e22',savedSearch:'#1abc9c',storage:'#27ae60',role:'#2ecc71',automation:'#00d4aa',webhook:'#7f8fa4',customAction:'#e74c3c',categorie:'#c0392b'};
const DBC_ICONS={team:'👥',roleGroup:'🔐',collection:'📁',metadataView:'👁',metadonnee:'🏷',savedSearch:'🔍',storage:'💾',role:'🎭',automation:'⚙',webhook:'🔔',customAction:'⚡',categorie:'📋'};
const DBC_FIELDS={team:['Collections','MD Views','Role Groups','Rôles','Automations','Saved Searches','Storages','Custom Actions','Catégories','Items'],roleGroup:['Teams','Collections','MD Views','Rôles','Automations','Saved Searches','Storages','Items'],collection:['Chemin','Permission','Teams associées'],metadataView:['Nom','Teams associées','Métadonnées'],savedSearch:['Nom','MD View','Métadonnées'],storage:['Nom','Permission'],role:['Nom','Items accessibles'],categorie:['Nom','Objects','MD Views']};

// Normalise un chemin de collection pour comparaison (strip slashes, trim)
function dbcNormCol(s){ return (s||'').replace(/^\/+|\/+$/g,'').trim().toLowerCase(); }
// Normalise un nom de MD View
function dbcNormView(s){ return (s||'').trim().toLowerCase(); }
// Résout un chemin team → nom display depuis collectionsData
function dbcResolveColLabel(chemin){
  var norm=dbcNormCol(chemin);
  var found=(collectionsData.collections||[]).find(function(x){
    return dbcNormCol(x.name||x.id||x)===norm||dbcNormCol(x.id||'')===norm;
  });
  return found?(found.name||found.id||chemin):chemin.replace(/^\/+|\/+$/g,'');
}
// ── Collections: full path + breadcrumb (Team cassette) ─────────────────────

// Construit un index (id -> obj) une fois (lazy)
var _dbcColIndex = null;
function dbcGetColIndex(){
  if (_dbcColIndex) return _dbcColIndex;

  var cols = collectionsData.collections || [];
  var byId = {};
  var byName = {};

  cols.forEach(function(c){
    if (typeof c === 'string') {
      byName[c] = { id: c, name: c, parent_id: null };
      return;
    }
    var id = c.id || c.name || c.nom || '';
    var nm = c.name || c.nom || c.title || c.id || '';
    if (id) byId[id] = { id: id, name: nm, parent_id: c.parent_id || null };
    if (nm) byName[nm] = { id: id, name: nm, parent_id: c.parent_id || null };
  });

  _dbcColIndex = { byId: byId, byName: byName };
  return _dbcColIndex;
}

// Reconstruit le chemin complet depuis parent_id (si possible)
function dbcFullCollectionPath(idOrName){
  if (!idOrName) return '';
  var idx = dbcGetColIndex();
  var node = idx.byId[idOrName] || idx.byName[idOrName] || null;
  if (!node) return '';

  var seen = new Set();
  var parts = [];
  while (node && node.id && !seen.has(node.id)) {
    seen.add(node.id);
    parts.unshift(node.name || node.id);
    node = node.parent_id ? idx.byId[node.parent_id] : null;
  }
  return parts.join(' / ');
}

// Transforme "A / B / C" en "📁 A → 📁 B → 📁 C"
function dbcColBreadcrumb(path){
  if (!path) return '';
  var segs = String(path).split('/').map(s => s.trim()).filter(Boolean);
  return segs.map(s => '📁 ' + s).join(' → ');
}
// Résout un nom de view → id depuis metadataViewsData
function dbcResolveViewId(nom){
  var norm=dbcNormView(nom);
  var found=(metadataViewsData.metadataViews||[]).find(function(v){
    return dbcNormView(v.name||v.nom||v)===norm;
  });
  return found?(found.id||nom):nom;
}


let dbcCassettes=[]; // [{id, type, name, data}]
let dbcNodes=[],dbcConnections=[],dbcStore=[],dbcGroups=[],dbcSelected=null,dbcDragGhost=null;

document.addEventListener('DOMContentLoaded',function(){
  chargerDonnees();
  var b = document.getElementById('orgBadge');if (b) b.textContent = (localStorage.getItem('organisationName') ||localStorage.getItem('nomOrganisation') || '').toUpperCase();
  dbcPeuplerPanelGauche();
  dbcSetupDragFromPanel();
  dbcSetupContextMenu();
  dbcSetupPanelResize();
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')dbcFermerCtxMenu();
    if((e.key==='Delete'||e.key==='Backspace')&&dbcSelected&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
      dbcSupprimerCassette(dbcSelected);
    }
  });
});

function chargerToutesDonnees(){chargerDonnees();dbcPeuplerPanelGauche();dbcToast('Données rechargées');}

// ─────────────────────────────────────────────────────────────
// WFD filters (Dashboard) — alignés avec Settings via localStorage
// Objectif: masquer Teams/Categories/MD Views "système" si les toggles sont OFF
// ─────────────────────────────────────────────────────────────
function _wfdNorm(s){ return String(s || '').trim().toLowerCase(); }

// toggles (mêmes clés que Settings)
function _wfdIncludeSysTeams(){ return localStorage.getItem('wfd_include_system_teams') === '1'; }
function _wfdIncludeSysCats(){ return localStorage.getItem('wfd_include_system_categories') === '1'; }
function _wfdIncludeSysMdvs(){ return localStorage.getItem('wfd_include_system_mdvs') === '1'; }

// règles "système" (alignées sur Settings; + tolérance utile pour "Tags")
const _SYS_TEAMS = ['everyone','administrator'];
const _SYS_CATS  = ['default','generic','tag','tags']; // tags ajouté pour couvrir le label "Tags" si api_name absent
const _SYS_MDVS  = ['segment tags'];

function _isSysTeam(t){
  const name = _wfdNorm((t && (t.nom || t.name || t.id)) || '');
  return _SYS_TEAMS.includes(name);
}

function _isSysCategory(c){
  // Settings privilégie api_name si présent; on fait pareil
  const name = _wfdNorm((c && (c.api_name || c.nom || c.name || c.label || c.id)) || '');
  return _SYS_CATS.includes(name);
}

function _isSysMdv(v){
  const name = _wfdNorm(typeof v === 'string' ? v : ((v && (v.nom || v.name || v.title || v.id)) || ''));
  return _SYS_MDVS.includes(name);
}

// ── Panel gauche ─────────────────────────────────────────────────────────────
function dbcPeuplerPanelGauche(){

  // ── ALIGNEMENT Settings: filtres "system" si dispo ────────────────────────
  // (Ces fonctions sont exposées dans Settings via window.wfdGet*ForSync) 
  var teamsSrc = (typeof window.wfdGetTeamsForSync === 'function')
    ? window.wfdGetTeamsForSync()
    : (teamsData.teams || []);

  var mdvSrc = (typeof window.wfdGetMetadataViewsForSync === 'function')
    ? window.wfdGetMetadataViewsForSync()
    : (metadataViewsData.metadataViews || []);

  var catsSrc = (typeof window.wfdGetCategoriesForSync === 'function')
    ? window.wfdGetCategoriesForSync()
    : (categoriesData.categories || []);

  // ── Remplissage groupes ────────────────────────────────────────────────────
  
// Teams (filtre system)
var _teamsSrc = (teamsData.teams || []);
if (!_wfdIncludeSysTeams()) _teamsSrc = _teamsSrc.filter(t => !(t && (t.is_system === true || _isSysTeam(t))));
dbcRemplirGroupe('teams', _teamsSrc, function(t){
  var n=t.nom||t.name||t.id||'';return{key:n,label:n,type:'team',data:t};
});

  dbcRemplirGroupe('roleGroups', roleGroupsData.roleGroups || [], function(rg){
    var n = rg.nom || rg.name || rg.id || '';
    return { key:n, label:n, type:'roleGroup', data:rg };
  });

  dbcRemplirGroupeCollections();
  
// Metadata Views (filtre system)
var _mdvSrc = (metadataViewsData.metadataViews || []);
if (!_wfdIncludeSysMdvs()) _mdvSrc = _mdvSrc.filter(v => !(v && (v.is_system === true || _isSysMdv(v))));
dbcRemplirGroupe('metadataViews', _mdvSrc, function(mv){
  var n=typeof mv==='string'?mv:(mv.name||mv.id||'');
  return{key:n,label:n,type:'metadataView',data:{nom:n,id:(mv.id||n)}};
});

  dbcRemplirGroupe('metadonnees', metadonneesData.metadonnees || [], function(m){
    return { key:m.nom, label:m.nom, type:'metadonnee', data:m };
  });

  dbcRemplirGroupe('savedSearches', savedSearchesData.savedSearches || [], function(s){
    var n = s.nom || s.name || s.id || '';
    return { key:n, label:n, type:'savedSearch', data:s };
  });

  dbcRemplirGroupe('storages', storagesData.storages || [], function(s){
    var n = s.nom || s.name || s.id || '';
    return { key:n, label:n, type:'storage', data:s };
  });

  dbcRemplirGroupe('roles', rolesData.roles || [], function(r){
    var n = r.nom || r;
    return { key:n, label:n, type:'role', data:(typeof r === 'string') ? {nom:r} : r };
  });

 // ── Automations (seules) ───────────────────────────────────────────────
var autos = (automationsData.automations || []).map(function(a){
  var lbl = a.nom || a.name || a.id || 'Automation';
  return { key:'a-'+lbl, label: lbl, type:'automation', data:a };
});
dbcRemplirGroupe('automations', autos, function(x){ return x; });

// ── Webhooks ───────────────────────────────────────────────────────────
var hooks = (webhooksData.webhooks || []).map(function(w){
  var lbl = w.name || w.nom || w.id || 'Webhook';
  return { key:'w-'+lbl, label: lbl, type:'webhook', data:w };
});
dbcRemplirGroupe('webhooks', hooks, function(x){ return x; });

// ── Custom Actions ─────────────────────────────────────────────────────
var cas = (customActionsData.customActions || []).map(function(ca){
  var lbl = ca.title || ca.nom || ca.name || ca.id || 'Custom Action';
  return { key:'ca-'+lbl, label: lbl, type:'customAction', data:ca };
});
dbcRemplirGroupe('customActions', cas, function(x){ return x; });
  
// Categories (filtre system)
var _catsSrc = (categoriesData.categories || []);
if (!_wfdIncludeSysCats()) _catsSrc = _catsSrc.filter(c => !(c && (c.is_system === true || _isSysCategory(c))));
dbcRemplirGroupe('categories', _catsSrc, function(c){
  var n=c.nom||c.name||c.id||'';return{key:n,label:n,type:'categorie',data:c};
});

  dbcRefreshPanelOnCanvas();
}

function dbcRemplirGroupe(gid,items,mapFn){
  var cont=document.getElementById('items-'+gid),cEl=document.getElementById('count-'+gid);
  if(!cont)return;cont.innerHTML='';
  var mapped = items.map(mapFn);
  // Tri alpha global sur le label (si demandé "tout alphabétique")
  mapped.sort(function(a,b){
  return String(a.label||'').localeCompare(String(b.label||''), 'fr', { sensitivity:'base' });
  });
  if(cEl) cEl.textContent = mapped.length;
  mapped.forEach(function(item){
    var el=document.createElement('div');el.className='dbc-src-item';
    el.dataset.type=item.type;el.dataset.key=item.key;el.dataset.label=item.label;el._dbcData=item.data;
    var dot=document.createElement('span');dot.className='dbc-src-item-dot';dot.style.background=DBC_COLORS[item.type]||'#555';
    el.appendChild(dot);el.appendChild(document.createTextNode(item.label));cont.appendChild(el);
  });
}

function toggleSourceGroup(gid){
  var items=document.getElementById('items-'+gid),chev=document.getElementById('chev-'+gid);
  if(!items)return;items.classList.toggle('collapsed');if(chev)chev.classList.toggle('open');
}

// État de pliage des collections dans le panel gauche
var dbcColExpanded={};
var dbcColExpandedInit=false; // true après premier rendu

function dbcBuildColTree(cols){
  var items=cols.map(function(c){
    if(typeof c==='string') return {id:c,name:c,parent_id:null,_enfants:[]};
    return {id:c.id||c.name||'',name:c.name||c.title||c.id||'',parent_id:c.parent_id||null,_enfants:[]};
  });
  var byId={};
  items.forEach(function(c){byId[c.id]=c;});
  var roots=[];
  items.forEach(function(c){
    if(c.parent_id && byId[c.parent_id]) byId[c.parent_id]._enfants.push(c);
    else roots.push(c);
  });
  function sortR(arr){arr.sort(function(a,b){return a.name.localeCompare(b.name,'fr',{sensitivity:'base'});});arr.forEach(function(c){sortR(c._enfants);});}
  sortR(roots);
  return roots;
}

function dbcRemplirGroupeCollections(){
  var cont=document.getElementById('items-collections'),cEl=document.getElementById('count-collections');
  if(!cont)return;cont.innerHTML='';
  var cols=collectionsData.collections||[];
  if(cEl)cEl.textContent=cols.length;
  var roots=dbcBuildColTree(cols);

  // Initialiser toutes les racines à false (replié) au premier rendu
  if(!dbcColExpandedInit){
    dbcColExpandedInit=true;
    function initNodes(nodes,d){nodes.forEach(function(c){if(!(c.id in dbcColExpanded))dbcColExpanded[c.id]=false;if(c._enfants)initNodes(c._enfants,d+1);});}
    initNodes(roots,0);
  }
  function renderTree(nodes,depth,parentExpanded){
    nodes.forEach(function(c){
      var hasChildren=c._enfants.length>0;
      var expanded = !!dbcColExpanded[c.id];

      // Ligne item
      var el=document.createElement('div');
      el.className='dbc-src-item dbc-src-item-col';
      if(!parentExpanded && depth>0){el.style.display='none';}
      el.dataset.type='collection';el.dataset.key=c.id;el.dataset.label=c.name;
      el.dataset.colId=c.id;el.dataset.colDepth=depth;
      el._dbcData={id:c.id,nom:c.name,chemin:c.name};

      // Indent
      var indent=document.createElement('span');
      indent.style.cssText='display:inline-block;width:'+(depth*14)+'px;min-width:'+(depth*14)+'px;flex-shrink:0;';
      el.appendChild(indent);

      // Toggle pliage (si enfants)
      var toggle=document.createElement('span');
      toggle.style.cssText='display:inline-block;width:16px;flex-shrink:0;text-align:center;cursor:'+(hasChildren?'pointer':'default')+';font-size:10px;color:#8899aa;';
      toggle.textContent=hasChildren?(expanded?'▼':'▶'):'';
      if(hasChildren){
        toggle.addEventListener('click',function(e){
          e.stopPropagation();
          dbcColExpanded[c.id]=!dbcColExpanded[c.id];
          dbcRemplirGroupeCollections();
        });
      }
      el.appendChild(toggle);

      // Icône dossier
      var dot=document.createElement('span');dot.className='dbc-src-item-dot';
      dot.style.cssText='background:'+DBC_COLORS.collection+';flex-shrink:0;margin-top:4px;';
      el.appendChild(dot);

      // Nom
      var txt=document.createElement('span');
      txt.textContent=String.fromCodePoint(hasChildren?0x1F4C2:0x1F4C1)+' '+c.name;
      el.appendChild(txt);

      cont.appendChild(el);

      // Récurser enfants
      if(hasChildren) renderTree(c._enfants,depth+1,expanded);
    });
  }
  renderTree(roots,0,true);
}

// ── Drag depuis panel ─────────────────────────────────────────────────────────
function dbcSetupDragFromPanel(){
  var panel=document.getElementById('dbc-panel-left');
  panel.addEventListener('mousedown',function(e){
    var item=e.target.closest('.dbc-src-item');
    if(!item||e.button!==0)return;
    var type=item.dataset.type;
    // Seuls team et roleGroup créent une cassette par drag
    // Tous les types sont draggables
    e.preventDefault();
    var label=item.dataset.label,data=item._dbcData,color=DBC_COLORS[type]||'#555';
    var ghost=document.createElement('div');ghost.className='dbc-drag-ghost';
    ghost.textContent=(DBC_ICONS[type]||'●')+' '+label;ghost.style.cssText='border-color:'+color+';color:'+color;
    document.body.appendChild(ghost);
    function mv(ev){ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';}
    function up(ev){
      document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
      ghost.remove();
      var wrap=document.getElementById('dbc-cassettes-wrap');
      var wr=wrap.getBoundingClientRect();
      if(ev.clientX>=wr.left&&ev.clientX<=wr.right&&ev.clientY>=wr.top&&ev.clientY<=wr.bottom){
        dbcAjouterCassette(type,label,data);
      }
    }
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);mv(e);
  });
}

// ── Cassettes ─────────────────────────────────────────────────────────────────
function dbcAjouterCassette(type,name,data){
  if(dbcCassettes.find(function(c){return c.type===type&&c.name===name;})){
    dbcToast(name+' déjà sur le canvas');return;
  }
  var id='cas-'+Date.now();
  dbcCassettes.push({id:id,type:type,name:name,data:data||{}});
  dbcRenderCassettes();
  dbcRefreshPanelOnCanvas();
  dbcRefreshEmpty();
  // Sync pour exports
  dbcSyncSelectionsComparaison();
  dbcToast(name+' ajouté');
}

function dbcSupprimerCassette(id){
  dbcCassettes=dbcCassettes.filter(function(c){return c.id!==id;});
  dbcSelected=null;
  dbcRenderCassettes();
  dbcRefreshPanelOnCanvas();
  dbcRefreshEmpty();
  dbcSyncSelectionsComparaison();
}

function dbcRenderCassettes(){
  var wrap=document.getElementById('dbc-cassettes-wrap');
  if(!wrap)return;
  wrap.innerHTML='';
  if(!dbcCassettes.length){dbcRefreshEmpty();return;}
  dbcRefreshEmpty();

  // Largeur égale : (wrap.clientWidth - gaps) / nb cassettes, min 260px
  var nb=dbcCassettes.length;
  var totalGap=(nb-1)*12+32; // 16px padding chaque côté
  var availW=wrap.clientWidth||900;
  var cw=Math.max(260,Math.floor((availW-totalGap)/nb));

  dbcCassettes.forEach(function(cas){
    var el=dbcBuilderCassette(cas,cw);
    wrap.appendChild(el);
  });
}

function dbcBuilderCassette(cas,cw){
  var d=cas.data||{};
  var color=DBC_COLORS[cas.type]||'#555';
  var wrap=document.createElement('div');
  wrap.className='dbc-cassette'+(dbcSelected===cas.id?' selected':'');
  wrap.id='cas-'+cas.id;
  wrap.style.width=cw+'px';
  wrap.addEventListener('click',function(e){
    if(e.target.closest('.dbc-cas-section-hdr')||e.target.closest('.dbc-cas-del'))return;
    dbcSelected=cas.id;
    document.querySelectorAll('.dbc-cassette').forEach(function(c){c.classList.remove('selected');});
    wrap.classList.add('selected');
  });
  wrap.addEventListener('contextmenu',function(e){
    e.preventDefault();dbcSelected=cas.id;dbcShowCtxCassette(e.clientX,e.clientY,cas.id);
  });

  // ── Header cassette ────────────────────────────────────────────────────────
  var hdr=document.createElement('div');hdr.className='dbc-cas-hdr';
  hdr.style.borderTopColor=color;

  var badge=document.createElement('span');badge.className='dbc-cas-badge';
  badge.style.background=color+'22';badge.style.color=color;
  badge.style.borderColor=color+'55';
  badge.textContent=dbcTypeLabel(cas.type);
  hdr.appendChild(badge);

  var title=document.createElement('div');title.className='dbc-cas-title';
  title.textContent=cas.name;hdr.appendChild(title);

  var del=document.createElement('button');del.className='dbc-cas-del';del.textContent='✕';
  del.title='Retirer';
  del.addEventListener('click',function(e){e.stopPropagation();dbcSupprimerCassette(cas.id);});
  hdr.appendChild(del);
  wrap.appendChild(hdr);

  // ── Sections ───────────────────────────────────────────────────────────────
  var sections=dbcGetSectionsPourType(cas.type,d,cas.name);
  var scrollWrap=document.createElement('div');
  scrollWrap.className='dbc-cas-scroll-wrap';
  sections.forEach(function(sec){
    if(!sec.items.length&&!sec.showEmpty)return;
    scrollWrap.appendChild(dbcBuilderSection(sec,color,cw));
  });
  wrap.appendChild(scrollWrap);

  return wrap;
}

  // ── Badges permissions (items) ───────────────────────────────────────────────
function dbcPermChip(perm){
  perm = String(perm || '').trim();
  var color = '#666';
  var bg = 'rgba(102,102,102,0.15)';

  // Mapping lisible (ajuste si tu veux)
  if (perm === 'Read')   { color = '#2ecc71'; bg = 'rgba(46,204,113,0.16)'; }
  if (perm === 'Write')  { color = '#f39c12'; bg = 'rgba(243,156,18,0.16)'; }
  if (perm === 'Delete' || perm === 'Purge') { color = '#e74c3c'; bg = 'rgba(231,76,60,0.16)'; }
  if (perm === 'Create') { color = '#9b59b6'; bg = 'rgba(155,89,182,0.16)'; }
  if (perm === 'Change ACL' || perm === 'ChangeACL' || perm === 'ACL') { color = '#3498db'; bg = 'rgba(52,152,219,0.16)'; }
  if (perm === 'Archive') { color = '#95a5a6'; bg = 'rgba(149,165,166,0.16)'; }
  if (perm === 'Restore') { color = '#7f8fa4'; bg = 'rgba(127,143,164,0.16)'; }

  var sp = document.createElement('span');
  sp.textContent = perm;
  sp.style.cssText =
    'display:inline-block; padding:2px 6px; border-radius:4px; ' +
    'border:1px solid ' + color + '; color:' + color + '; ' +
    'background:' + bg + '; font-size:10px; line-height:1; ' +
    'white-space:nowrap;';
  return sp;
}

function dbcAlphaKey(x){
  var s = (x && (x.label || x.name)) || '';
  return String(s).trim().toLowerCase();
}
function dbcSortAlpha(arr){
  return (arr || []).slice().sort(function(a,b){
    return dbcAlphaKey(a).localeCompare(dbcAlphaKey(b), 'fr', {sensitivity:'base'});
  });
}


function dbcBuilderSection(sec,accentColor,cw){
  var wrap=document.createElement('div');wrap.className='dbc-cas-section';

  // Header cliquable
  var hdr=document.createElement('div');hdr.className='dbc-cas-section-hdr';
  hdr.addEventListener('click',function(){
    body.classList.toggle('collapsed');
    chev.textContent=body.classList.contains('collapsed')?'▶':'▼';
  });

  var dot=document.createElement('span');dot.className='dbc-cas-sec-dot';
  dot.style.background=sec.color||accentColor;hdr.appendChild(dot);

  var lbl=document.createElement('span');lbl.className='dbc-cas-sec-label';lbl.textContent=sec.label;hdr.appendChild(lbl);

  var count=document.createElement('span');count.className='dbc-cas-sec-count';
  count.textContent=sec.items.length;hdr.appendChild(count);

  var chev=document.createElement('span');chev.className='dbc-cas-sec-chev';chev.textContent='▼';hdr.appendChild(chev);

  wrap.appendChild(hdr);

  // Body
  var body=document.createElement('div');body.className='dbc-cas-section-body';

  if(!sec.items.length){
    var empty=document.createElement('div');empty.className='dbc-cas-empty';empty.textContent='—';
    body.appendChild(empty);
  } else {

    dbcSortAlpha(sec.items).forEach(function(item){
      // --- Row principale
      var row=document.createElement('div');row.className='dbc-cas-row';

      // Détection children (drill-down)
      var hasChildren = Array.isArray(item.children) && item.children.length > 0;

      // Chevron de drilldown (uniquement si children)
      if (hasChildren) {
        var rowChev = document.createElement('span');
        rowChev.className = 'dbc-row-chev';
        rowChev.textContent = '▶';
        rowChev.style.cssText = 'width:14px;flex-shrink:0;text-align:center;font-size:10px;color:#666;cursor:pointer;';
        row.appendChild(rowChev);

        // rendu clic “main row” possible
        row.style.cursor = 'pointer';
      } else {
        // placeholder pour aligner les lignes
        var pad = document.createElement('span');
        pad.style.cssText = 'width:14px;flex-shrink:0;';
        row.appendChild(pad);
      }

      // Badge permission si applicable
      if(item.permission){
        var isRW=item.permission==='Read & Write';
        var pb=document.createElement('span');pb.className='dbc-perm-badge '+(isRW?'rw':'ro');
        pb.textContent=isRW?'R&W':'RO';row.appendChild(pb);
      }

      var nm=document.createElement('span');nm.className='dbc-cas-row-name';
      nm.title=item.label||item.name||'';
      nm.textContent=item.label||item.name||'—';
      row.appendChild(nm);

      // Sous-label éventuel
      if(item.sub){
        var sub=document.createElement('span');sub.className='dbc-cas-row-sub';
        sub.textContent=item.sub;row.appendChild(sub);
      }

      body.appendChild(row);

      // --- Children panel (drill-down)
      if (hasChildren) {
        var childWrap = document.createElement('div');
        childWrap.className = 'dbc-row-children';
        childWrap.style.cssText =
          'display:none;padding:6px 14px 8px 28px;border-bottom:1px solid #1a1a1a;background:#101010;';

        dbcSortAlpha(item.children).forEach(function(ch){
          var line = document.createElement('div');
          line.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:3px 0;;';

          var label = document.createElement('span');
          label.style.cssText = 'flex:1;font-size:11px;color:#bbb;white-space:normal;word-break:break-word;';
          label.title = ch.label || '';
          label.textContent = ch.label || '—';
          line.appendChild(label);

          // Permissions (chips colorées)
          var perms = (ch.permissions || []);
          var pwrap = document.createElement('span');
          pwrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;';
          perms.forEach(function(p){
          pwrap.appendChild(typeof dbcPermChip === 'function' ? dbcPermChip(p) : document.createTextNode(p));
          });
          line.appendChild(pwrap);

          childWrap.appendChild(line);
        });

        body.appendChild(childWrap);

        function toggleChildren(){
          var open = (childWrap.style.display !== 'none');
          childWrap.style.display = open ? 'none' : 'block';
          // chevron visuel
          var che = row.querySelector('.dbc-row-chev');
          if (che) che.textContent = open ? '▶' : '▼';
        }

        // Clic sur la row => toggle
        row.addEventListener('click', function(e){
          // si on clique sur des éléments internes futurs, on pourra filtrer ici
          toggleChildren();
        });
      }
    });
  }

  wrap.appendChild(body);
  return wrap;
}

// ── WFD-only : Team ↔ Role Group association helpers ─────────────────────────

// Récupère un "doc id" ou "id" d'un role group
function dbcRGId(rg){
  return String(rg && (rg.doc_id || rg.docId || rg.id || rg.uuid || rg._id || '') || '').trim();
}

// Récupère un "doc id" ou "id" d'une team
function dbcTeamId(t){
  return String(t && (t.doc_id || t.docId || t.id || t.uuid || t._id || '') || '').trim();
}

// Lit une liste d'IDs depuis plusieurs noms possibles (WFD-only évolutif)
function dbcReadIdList(obj, keys){
  for (var i=0;i<keys.length;i++){
    var k = keys[i];
    var v = obj && obj[k];
    if (Array.isArray(v)) return v.map(String);
  }
  return [];
}

// Teams associées à un Role Group (via rg.teams_doc_ids OU scan inverse team.roleGroups_doc_ids)
function dbcGetTeamsForRoleGroup(rg){
  var rgid = dbcRGId(rg);
  if (!rgid) return [];

  // 1) direct: rg.teams_doc_ids (ou variantes)
  var ids = dbcReadIdList(rg, ['teams_doc_ids','team_doc_ids','teamsDocIds','teamDocIds','teams_ids','team_ids','teams']);
  var teams = (teamsData.teams || []).filter(function(t){
    return ids.includes(dbcTeamId(t));
  });

  // 2) fallback: scan inverse dans les teams
  if (!teams.length){
    teams = (teamsData.teams || []).filter(function(t){
      var rgs = dbcReadIdList(t, ['roleGroups_doc_ids','role_groups_doc_ids','roleGroupsDocIds','roleGroups','role_groups','roleGroup_doc_ids','role_group_doc_ids']);
      return rgs.includes(rgid);
    });
  }

  // tri alpha
  teams.sort(function(a,b){ return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''),'fr',{sensitivity:'base'}); });
  return teams;
}

// Role groups associés à une Team (via team.roleGroups_doc_ids OU scan inverse rg.teams_doc_ids)
function dbcGetRoleGroupsForTeam(team){
  var tid = dbcTeamId(team);
  if (!tid) return [];

  // 1) direct: team.roleGroups_doc_ids (ou variantes)
  var ids = dbcReadIdList(team, ['roleGroups_doc_ids','role_groups_doc_ids','roleGroupsDocIds','roleGroups','role_groups','roleGroup_doc_ids','role_group_doc_ids']);
  var rgs = (roleGroupsData.roleGroups || []).filter(function(rg){
    return ids.includes(dbcRGId(rg));
  });

  // 2) fallback: scan inverse dans les role groups
  if (!rgs.length){
    rgs = (roleGroupsData.roleGroups || []).filter(function(rg){
      var teams = dbcReadIdList(rg, ['teams_doc_ids','team_doc_ids','teamsDocIds','teamDocIds','teams_ids','team_ids','teams']);
      return teams.includes(tid);
    });
  }

  // tri alpha
  rgs.sort(function(a,b){ return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''),'fr',{sensitivity:'base'}); });
  return rgs;
}

// ── Builders de sections par type ─────────────────────────────────────────────
function dbcGetSectionsTeam(d){
  var cols = dbcGetTeamCollections(d);
  var views = dbcGetTeamMDViews(d);
  var viewNames = views.map(function(v){ return v.nom; });

  // Catégories (déjà filtrées dans dbcGetCategoriesPourViews(viewNames))
  var cats = dbcGetCategoriesPourViews(viewNames);

  // Saved Searches / Storages
  var ssNames = (d.savedSearches || []).map(function(s){ return typeof s === 'string' ? s : s.nom; });
  var stNames = (d.storages || []).map(function(s){ return typeof s === 'string' ? s : s.nom; });

  var searches = (savedSearchesData.savedSearches || []).filter(function(s){ return ssNames.includes(s.nom); });
  var stors = (storagesData.storages || []).filter(function(s){ return stNames.includes(s.nom); });

  // Automations
  var autos = dbcGetAutosPourTeam(d);

  // Role Groups (WFD-only doc link)
  var rgs = (typeof dbcGetRoleGroupsForTeam === 'function') ? dbcGetRoleGroupsForTeam(d) : [];

  // ── Custom Actions (Team ↔ Custom Actions) ─────────────────────────────
  // Tolérant aux variantes de clé: customActions / custom_actions
  var caLinks = d.customActions || d.custom_actions || [];
  var caItems = [];

  if (Array.isArray(caLinks) && caLinks.length) {
    caItems = caLinks.map(function(x){
      var id = (typeof x === 'string') ? '' : (x.id || '');
      var nm = (typeof x === 'string') ? x : (x.nom || x.name || x.title || id || '');
      var perm = (typeof x === 'string') ? '' : (x.permission || '');

      // Résolution “jolie” depuis customActionsData si possible
      var resolved = (customActionsData.customActions || []).find(function(ca){
        return (id && String(ca.id) === String(id)) ||
               (nm && (ca.title === nm || ca.nom === nm || ca.name === nm));
      });

      var label = resolved ? (resolved.title || resolved.nom || resolved.name || nm) : nm;
      return { name: label, label: label, permission: perm };
    });

    caItems.sort(function(a,b){
      return String(a.label||'').localeCompare(String(b.label||''), 'fr', { sensitivity:'base' });
    });
  }

  return [
    // Collections (breadcrumb)
    {label:'Collections', color:DBC_COLORS.collection, items: cols.map(function(c){
      var key = c.chemin || c.id || c.nom || '';
      var rawPath = c._path || '';
      if (!rawPath) rawPath = dbcFullCollectionPath(key);
      if (!rawPath) rawPath = dbcResolveColLabel(key);
      var label = dbcColBreadcrumb(rawPath) || rawPath;
      return { name: key, label: label, permission: c.permission, sub: '' };
    })},

    // Metadata Views
    {label:'Metadata Views', color:DBC_COLORS.metadataView, items: views.map(function(v){
      var vNorm = dbcNormView(v.nom);
      var nm = (metadonneesData.metadonnees || []).filter(function(m){
        var vv = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
        return vv.some(function(x){ return dbcNormView(x) === vNorm; });
      }).length;
      return { name:v.nom, label:v.nom, permission:v.permission, sub: nm + ' méta' + (nm > 1 ? 's' : '') };
    })},

    // Catégories
    {label:'Catégories', color:DBC_COLORS.categorie, items: cats.map(function(c){
      return { name:c.nom, label:c.nom };
    })},

    // Saved Searches
    {label:'Saved Searches', color:DBC_COLORS.savedSearch, items: searches.map(function(s){
      return { name:s.nom, label:s.nom, sub: s.metadataView || '' };
    })},

    // Storages
    {label:'Storages', color:DBC_COLORS.storage, items: stors.map(function(s){
      // selon modèle: s.groupes OU s.teams
      var gg = (s.groupes || s.teams || []);
      var perm = gg.find(function(g){ return (g.nom || g.name) === d.nom; });
      return { name:s.nom, label:s.nom, permission: perm ? perm.permission : '' };
    })},

    // ✅ Custom Actions (afficher même vide si tu veux: showEmpty:true)
    {label:'Custom Actions', color:DBC_COLORS.customAction, items: caItems, showEmpty: true},

    // Automations
    {label:'Automations', color:DBC_COLORS.automation, items: autos.map(function(a){
      var trig = ((a.triggers || [])[0] || {}).type || '';
      return { name:a.nom, label:a.nom, sub: trig };
    })},

    // Role Groups
    {label:'Role Groups', color:DBC_COLORS.roleGroup, items: rgs.map(function(rg){
      var n = rg.nom || rg.name || rg.id || '';
      return { name:n, label:n };
    })},
  ];
}


function dbcGetSectionsRoleGroup(d){
  var roles=dbcGetRolesPourRG(d);
  var autos=dbcGetAutosPourTeam(d);
  return [
    {label:'Teams', color:DBC_COLORS.team, items:(dbcGetTeamsForRoleGroup(d)||[]).map(function(t){
      var n=t.nom||t.name||t.id||''; return {name:n,label:n};
    })},
    {label:'Rôles',color:DBC_COLORS.role,items:roles.map(function(r){
      var items=dbcGetItemsPourRole(r.nom); // renvoie [{nom, permissions:[...]}] [1]
      return {
        name:r.nom,
        label:r.nom,
        sub:items.length+' item'+(items.length>1?'s':''),
        // ⬇️ drill-down
        children: items.map(function(it){
          return { label: it.nom || it.name || '—', permissions: (it.permissions||[]) };
        })
      };
    })},
    {label:'Automations',color:DBC_COLORS.automation,items:autos.map(function(a){return{name:a.nom,label:a.nom};})},
  ];
}

// ── Dispatcher sections par type ─────────────────────────────────────────────
function dbcGetSectionsPourType(type, d, name) {
  switch(type) {
    case 'team':        return dbcGetSectionsTeam(d);
    case 'roleGroup':   return dbcGetSectionsRoleGroup(d);
    case 'collection':  return dbcGetSectionsCollection(name, d);
    case 'metadataView':return dbcGetSectionsMetadataView(name, d);
    case 'metadonnee':  return dbcGetSectionsMetadonnee(name, d);
    case 'savedSearch': return dbcGetSectionsSavedSearch(name, d);
    case 'storage':     return dbcGetSectionsStorage(name, d);
    case 'role':        return dbcGetSectionsRole(name, d);
    case 'categorie':   return dbcGetSectionsCategorie(name, d);
    case 'automation':
    case 'webhook':
    case 'customAction': return (typeof dbcGetSectionsAutomation === 'function')? dbcGetSectionsAutomation(type, name, d): [];                                
    default:            return [];
  }
}

// Collection → Teams associées + MD Views + Catégories + Automations
function dbcGetSectionsCollection(name, d) {

  // 1) Teams associées à la collection
  var teams = (teamsData.teams || []).filter(function(t) {
    var normName = dbcNormCol(name);
    return (t.collections || []).some(function(c){
      var ch = (typeof c === 'string') ? c : (c.chemin || c.id || '');
      return dbcNormCol(ch) === normName || dbcNormCol(dbcResolveColLabel(ch)) === dbcNormCol(name);
    });
  });

  // 2) MD Views déduites via les teams associées
  var mdviews = (metadataViewsData.metadataViews || []).filter(function(mv) {
    var mvNom = dbcNormView(typeof mv === 'string' ? mv : (mv.name || mv.nom || mv.id || ''));
    return teams.some(function(t){
      return (t.vues || t.metadataViews || []).some(function(v){
        return dbcNormView(typeof v === 'string' ? v : (v.nom || v.name || v)) === mvNom;
      });
    });
  });

  // 3) Catégories pertinentes : intersect MD Views + object_types/appliqueeA contient "collections"
  var mdvNames = (mdviews || []).map(function(mv){
    return (typeof mv === 'string') ? mv : (mv.name || mv.nom || mv.id || '');
  }).filter(Boolean);

  var cats = (categoriesData.categories || []).filter(function(cat){

    // Filtre "system categories" si toggle OFF (Dashboard)
    if (typeof _wfdIncludeSysCats === 'function' && typeof _isSysCategory === 'function') {
      if (!_wfdIncludeSysCats() && (cat.is_system === true || _isSysCategory(cat))) return false;
    }

    // Object types (compat): object_types ou appliqueeA
    var types = cat.object_types || cat.appliqueeA || [];
    if (Array.isArray(types) && types.length) {
      // strict "cassette collection" => catégories applicables aux collections
      if (!types.includes('collections')) return false;
    }

    // Intersect metadataViews
    return (cat.metadataViews || []).some(function(v){ return mdvNames.includes(v); });
  }).sort(function(a,b){
    return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''),'fr',{sensitivity:'base'});
  });

  // 4) Automations liées (asset.added_to_collection)
  var autos = (automationsData.automations || []).filter(function(a){
    return (a.triggers || []).some(function(t){
      return t.type === 'asset.added_to_collection' && ((t.config && t.config.collections) || []).includes(name);
    });
  });

  // 5) Return sections (⚠️ map() toujours sur des tableaux)
  return [
    {label:'Teams associées', color:DBC_COLORS.team,
      items:(teams || []).map(function(t){ var n=t.nom||t.name||''; return {name:n,label:n}; })
    },
    {label:'Metadata Views', color:DBC_COLORS.metadataView,
      items:(mdviews || []).map(function(mv){
        var n = (typeof mv==='string') ? mv : (mv.name||mv.nom||mv.id||'');
        return {name:n,label:n};
      })
    },
    {label:'Catégories', color:DBC_COLORS.categorie,
      items:(cats || []).map(function(c){
        var n = c.nom || c.name || c.id || '';
        return {name:n,label:n};
      })
    },
    {label:'Automations', color:DBC_COLORS.automation,
      items:(autos || []).map(function(a){ return {name:a.nom,label:a.nom}; })
    },
  ];
}

// Metadata View → Teams + Collections (breadcrumb) + Métadonnées + Catégories (sans system) + Automations
function dbcGetSectionsMetadataView(name, d) {

  // ── Teams ayant accès à cette vue ────────────────────────────────────────
  var teams = (teamsData.teams || []).filter(function(t){
    var normN = dbcNormView(name);
    return (t.vues || t.metadataViews || []).some(function(v){
      return dbcNormView(typeof v === 'string' ? v : (v.nom || v.name || '')) === normN;
    });
  }).sort(function(a,b){
    return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''), 'fr', {sensitivity:'base'});
  });

  // ── Collections : via les Teams qui ont accès à cette vue ────────────────
  // Objectif : même présentation que la cassette Team : breadcrumb full path
  var colPaths = [];
  var seen = new Set();

  teams.forEach(function(t){
    (t.collections || []).forEach(function(c){
      // clé brute (id/chemin)
      var key = (typeof c === 'string') ? c : (c.chemin || c.id || c.nom || '');

      // 1) si un _path existe, l’utiliser
      var rawPath = (typeof c === 'object' && c && c._path) ? c._path : '';

      // 2) sinon reconstruire via parent_id
      if (!rawPath) rawPath = dbcFullCollectionPath(key);

      // 3) fallback: label simple
      if (!rawPath) rawPath = dbcResolveColLabel(key);

      // dédupe sur path normalisé
      var dedupeKey = dbcNormCol(rawPath);
      if (dedupeKey && !seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        colPaths.push(rawPath);
      }
    });
  });

  colPaths.sort(function(a,b){
    return String(a||'').localeCompare(String(b||''), 'fr', {sensitivity:'base'});
  });

  var colsItems = colPaths.map(function(p){
    return { name: p, label: dbcColBreadcrumb(p) || p };
  });

  // ── Métadonnées de cette vue ─────────────────────────────────────────────
  var metas = (metadonneesData.metadonnees || []).filter(function(m){
    var vv = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    var normN = dbcNormView(name);
    return (vv || []).some(function(v){
      return dbcNormView(v) === normN || (d && (v === d.id || dbcNormView(v) === dbcNormView(d.id || '')));
    });
  }).sort(function(a,b){
    return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''), 'fr', {sensitivity:'base'});
  });

  // ── Catégories : intersect vue + filtrage system categories ──────────────
  // (Et optionnel : limiter à assets si object_types/appliqueeA est renseigné)
  var cats = (categoriesData.categories || []).filter(function(c){

    // 1) Filtre catégories système si toggle OFF
    if (typeof _wfdIncludeSysCats === 'function' && typeof _isSysCategory === 'function') {
      if (!_wfdIncludeSysCats() && (c.is_system === true || _isSysCategory(c))) return false;
    }

    // 2) Optionnel : si la catégorie a object_types/appliqueeA, on garde "assets" (logique MD Views)
    var types = c.object_types || c.appliqueeA || [];
    if (Array.isArray(types) && types.length) {
      if (!types.includes('assets')) return false;
    }

    // 3) Lien à la vue
    return (c.metadataViews || []).some(function(v){
      return v === name || v === (d && d.id);
    });
  }).sort(function(a,b){
    return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''), 'fr', {sensitivity:'base'});
  });

  // ── Automations : (on garde ta logique existante) ─────────────────────────
  var autos = (automationsData.automations || []).filter(function(a){
    return (a.triggers || []).some(function(t){
      return (t.config && t.config.metadataView) === name ||
             (t.config && t.config.metadataViews && t.config.metadataViews.includes(name));
    }) || (a.actions || []).some(function(ac){
      return (ac.config && ac.config.metadataView) === name;
    });
  }).sort(function(a,b){
    return String(a.nom||a.name||'').localeCompare(String(b.nom||b.name||''), 'fr', {sensitivity:'base'});
  });

  return [
    {label:'Teams', color:DBC_COLORS.team, items:teams.map(function(t){
      var n=t.nom||t.name||''; return {name:n,label:n};
    })},
    //{label:'Collections', color:DBC_COLORS.collection, items:colsItems},
    {label:'Métadonnées', color:DBC_COLORS.metadonnee, items:metas.map(function(m){
      return {name:m.nom, label:m.nom, sub:m.type || ''};
    })},
    {label:'Catégories', color:DBC_COLORS.categorie, items:cats.map(function(c){
      var n=c.nom||c.name||c.id||''; return {name:n,label:n};
    })},
    {label:'Automations', color:DBC_COLORS.automation, items:autos.map(function(a){
      var n=a.nom||a.name||''; return {name:n,label:n};
    })},
  ];
}

// Métadonnée → MD Views + Catégories + Automations
function dbcGetSectionsMetadonnee(name, d) {

  // 1) Views brutes portées par la métadonnée
  var viewsRaw = d.metadataViews || (d.metadataView ? [d.metadataView] : []);

  // 2) Construire le référentiel des MD Views connues (par NAME)
  var knownViews = new Set(
    (metadataViewsData.metadataViews || [])
      .map(function(v){ return (typeof v === 'string') ? v : (v.name || v.nom || v.id || ''); })
      .filter(Boolean)
  );

  // 3) Filtrer :
  // - enlever les vues inconnues (ex: "Vue Test")
  // - enlever les vues système si toggle OFF
  var views = (viewsRaw || []).filter(function(v){
    if (!v) return false;
    if (!knownViews.has(v)) return false; // <-- retire "Vue Test" si elle n'existe plus dans metadataViewsData
    if (typeof _wfdIncludeSysMdvs === 'function' && typeof _isSysMdv === 'function') {
      if (!_wfdIncludeSysMdvs() && _isSysMdv(v)) return false;
    }
    return true;
  });

  // 4) Catégories : intersect metadataViews + filtre system categories si toggle OFF
  var cats = (categoriesData.categories || []).filter(function(c){

    // Filtre "system categories" si toggle OFF
    if (typeof _wfdIncludeSysCats === 'function' && typeof _isSysCategory === 'function') {
      if (!_wfdIncludeSysCats() && (c.is_system === true || _isSysCategory(c))) return false;
    }

    return (c.metadataViews || []).some(function(mv){ return views.includes(mv); });
  });

  // 5) Automations (déjà patchées chez toi pour metadata_values + metadataFields)
  var autos = (automationsData.automations || []).filter(function(a){
    var trigMatch = (a.triggers || []).some(function(t){
      if (t.type !== 'metadata.changed') return false;
      var mv = t.config && t.config.metadata_values;
      // match par label OU id si nécessaire (ici on conserve ton match existant "name")
      return mv && typeof mv === 'object' && Object.prototype.hasOwnProperty.call(mv, name);
    });

    var actMatch = (a.actions || []).some(function(ac){
      return ac.config && ac.config.metadataFields && ac.config.metadataFields[name] != null;
    });

    return trigMatch || actMatch;
  });
  
  // ✅ Type de la métadonnée (affichage)
  var metaType =
    d.type ||
    d.field_type ||
    (d.raw && (d.raw.field_type || d.raw.type)) ||
    '';

  return [
    {label:'Type', color:'#888', items: metaType ? [{name:metaType, label:metaType}] : []},
    {label:'Metadata Views', color:DBC_COLORS.metadataView, items:views.map(function(v){ return {name:v, label:v}; })},
    {label:'Catégories', color:DBC_COLORS.categorie, items:cats.map(function(c){ var n=c.nom||c.name||c.id||''; return {name:n, label:n}; })},
    {label:'Automations', color:DBC_COLORS.automation, items:autos.map(function(a){ return {name:a.nom, label:a.nom}; })},
  ];
}

// Saved Search → Teams + MD Views + Métadonnées
function dbcGetSectionsSavedSearch(name, d) {
  var teams = (teamsData.teams||[]).filter(function(t){
    return (t.savedSearches||[]).some(function(s){return (typeof s==='string'?s:s.nom)===name;});
  });
  var mvName = d.metadataView||'';
  var metas = mvName ? (metadonneesData.metadonnees||[]).filter(function(m){
    var vv = m.metadataViews||(m.metadataView?[m.metadataView]:[]);
    var normMV=dbcNormView(mvName);return vv.some(function(v){return dbcNormView(v)===normMV;});
  }) : [];
  return [
    {label:'Teams', color:DBC_COLORS.team, items:teams.map(function(t){return{name:t.nom,label:t.nom};})},
    {label:'Metadata View', color:DBC_COLORS.metadataView, items:mvName?[{name:mvName,label:mvName}]:[]},
    {label:'Métadonnées', color:DBC_COLORS.metadonnee, items:metas.map(function(m){return{name:m.nom,label:m.nom,sub:m.type||''};})},
  ];
}

// Storage → Teams
function dbcGetSectionsStorage(name, d) {
  var teams = (teamsData.teams||[]).filter(function(t){
    return (t.storages||[]).some(function(s){return (typeof s==='string'?s:s.nom)===name;});
  });
  return [
    {label:'Teams', color:DBC_COLORS.team, items:teams.map(function(t){
      var perm = (t.storages||[]).find(function(s){return (typeof s==='string'?s:s.nom)===name;});
      return{name:t.nom,label:t.nom,permission:perm&&perm.permission||''};
    })},
  ];
}

// Role → Role Groups + Items
function dbcGetSectionsRole(name, d) {
  var rgs = (roleGroupsData.roleGroups||[]).filter(function(rg){
    return (rg.fonctionnalites||[]).includes(name);
  });
  var items = dbcGetItemsPourRole(name);
  return [
    {label:'Role Groups', color:DBC_COLORS.roleGroup, items:rgs.map(function(rg){return{name:rg.nom,label:rg.nom};})},
    {label:'Items', color:'#888', items:items.map(function(i){
      return{name:i.nom,label:i.nom,sub:(i.permissions||[]).join(', ')};
    })},
  ];
}

// Catégorie → Objets + MD Views + Métadonnées
function dbcGetSectionsCategorie(name, d) {
  var views = d.metadataViews || [];
  var metas = [];

  // Deriver les métadonnées depuis les MD Views
  views.forEach(function(mv){
    (metadonneesData.metadonnees || []).filter(function(m){
      var vv = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
      return vv.some(function(x){ return dbcNormView(x) === dbcNormView(mv); });
    }).forEach(function(m){
      if(!metas.find(function(x){ return x.nom === m.nom; })) metas.push(m);
    });
  });

  // Types d’objets avec icônes (tout afficher)
  var types = d.object_types || d.appliqueeA || [];
  if (!Array.isArray(types)) types = [];

  var ORDER = [
    'assets','collections','segments','saved_searches','storages','users','files','formats',
    'custom_actions','webhooks','automations','apps','export_locations',
    'metadata','metadata_fields','metadata_views','metadata_values','metadata_categories'
  ];

  var ICON = {
    assets: '🎞️',
    collections: '📁',
    segments: '🎬',
    saved_searches: '🔍',
    storages: '💾',
    users: '👤',
    files: '📄',
    formats: '🧩',
    custom_actions: '⚡',
    webhooks: '🔔',
    automations: '⚙️',
    apps: '🧩',
    export_locations: '📤',
    metadata: '🏷️',
    metadata_fields: '🏷️',
    metadata_views: '👁️',
    metadata_values: '🔖',
    metadata_categories: '📚'
  };

  function prettyType(t){
    if (t === 'assets') return 'Assets';
    if (t === 'collections') return 'Collections';
    if (t === 'segments') return 'Segments';
    if (t === 'saved_searches') return 'Saved Searches';
    if (t === 'storages') return 'Storages';
    if (t === 'users') return 'Users';
    if (t === 'files') return 'Files';
    if (t === 'formats') return 'Formats';
    if (t === 'custom_actions') return 'Custom Actions';
    if (t === 'webhooks') return 'Webhooks';
    if (t === 'automations') return 'Automations';
    if (t === 'apps') return 'Apps';
    if (t === 'export_locations') return 'Export Locations';
    if (t === 'metadata') return 'Metadata';
    if (t === 'metadata_fields') return 'Metadata Fields';
    if (t === 'metadata_views') return 'Metadata Views';
    if (t === 'metadata_values') return 'Metadata Values';
    if (t === 'metadata_categories') return 'Metadata Categories';
    return String(t);
  }

  var uniq = Array.from(new Set(types.map(String).filter(Boolean)));
  uniq.sort(function(a,b){
    var ia = ORDER.indexOf(a); if (ia < 0) ia = 9999;
    var ib = ORDER.indexOf(b); if (ib < 0) ib = 9999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b,'fr',{sensitivity:'base'});
  });

  var typeItems = uniq.map(function(t){
    var icon = ICON[t] || '📦';
    return { name: t, label: icon + ' ' + prettyType(t) };
  });

  return [
    {label:'Objets', color:'#888', items:typeItems},
    {label:'Metadata Views', color:DBC_COLORS.metadataView, items:views.map(function(v){ return {name:v, label:v}; })},
    {label:'Métadonnées', color:DBC_COLORS.metadonnee, items:metas.map(function(m){ return {name:m.nom, label:m.nom, sub:m.type || ''}; })},
  ];
}

// ── Automation helpers (UI labels + details) ─────────────────────────────────

// Fallback labels si TRIGGERS_ICONIK n’est pas chargé
var DBC_TRIGGER_LABELS_FALLBACK = {
  'asset.has_new_version': 'Asset a une nouvelle version',
  'asset.added_to_collection': 'Asset ajouté à une collection',
  'asset.archived': 'Asset archivé',
  'asset.restored': 'Asset restauré',
  'asset.transferred': 'Asset transféré',
  'metadata.changed': 'Métadonnées modifiées'
};

function dbcTriggerUILabel(type){
  try {
    if (typeof TRIGGERS_ICONIK !== 'undefined' && TRIGGERS_ICONIK[type] && TRIGGERS_ICONIK[type].label) {
      return TRIGGERS_ICONIK[type].label;
    }
  } catch(e){}
  return DBC_TRIGGER_LABELS_FALLBACK[type] || type;
}

// UI label for triggers (no technical keys in UI)
function dbcTriggerUILabel(type){
  // priorité : dictionnaire Iconik si dispo
  try {
    if (typeof TRIGGERS_ICONIK !== 'undefined' && TRIGGERS_ICONIK[type] && TRIGGERS_ICONIK[type].label) {
      return TRIGGERS_ICONIK[type].label;
    }
  } catch(e){}

  // fallback “Iconik-like” (anglais lisible)
  const FALLBACK = {
    'metadata.changed': 'Metadata is changed',
    'asset.added_to_collection': 'Asset is added to collection',
    'asset.has_new_version': 'Asset has new version',
    'asset.archived': 'Asset is archived',
    'asset.restored': 'Asset is restored',
    'asset.transferred': 'Asset is transferred'
  };
  return FALLBACK[type] || type; // en dernier recours
}

// Trigger -> row with optional drilldown (children) without technical names
function dbcTriggerToRow(t){
  var type = t && t.type ? t.type : 'Unknown';
  var row = { name: type, label: dbcTriggerUILabel(type) }; // ✅ UI label only, no sub

  var children = [];

  // metadata.changed : use metadata_values (your model)
  if (type === 'metadata.changed' && t.config && t.config.metadata_values && typeof t.config.metadata_values === 'object') {
    Object.keys(t.config.metadata_values).forEach(function(fieldId){
      // resolve fieldId -> pretty label (nom)
      var metaObj = (metadonneesData.metadonnees || []).find(function(m){
        return String(m.id) === String(fieldId);
      });
      var fieldLabel = metaObj ? (metaObj.nom || metaObj.name || fieldId) : fieldId;

      var fv = (t.config.metadata_values[fieldId] && t.config.metadata_values[fieldId].field_values) || [];
      if (!Array.isArray(fv)) fv = [];

      if (!fv.length) {
        children.push({ label: fieldLabel });
      } else {
        fv.forEach(function(x){
          var val = (x && typeof x.value !== 'undefined') ? String(x.value) : '';
          children.push({ label: fieldLabel + (val ? ' = ' + val : '') });
        });
      }
    });

    // event_type (optional, but no technical key displayed)
    if (t.config && t.config.event_type) {
      children.push({ label: 'Event: ' + String(t.config.event_type) });
    }
  }

  // asset.added_to_collection : show collections (no technical key)
  if (type === 'asset.added_to_collection' && t.config && Array.isArray(t.config.collections) && t.config.collections.length) {
    t.config.collections.forEach(function(c){
      children.push({ label: 'Collection: ' + c });
    });
  }

  if (children.length) row.children = children;
  return row;
}

// ── Automation UX helpers (user-friendly) ────────────────────────────────────

// stringify court (évite les JSON énormes en ligne)
function dbcSafeJson(v, maxLen){
  maxLen = maxLen || 180;
  try {
    const s = JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch(e){
    return '[unserializable]';
  }
}

// label collection “humain” (string / objet / id)
function dbcPrettyCollection(c){
  if (!c) return '';
  if (typeof c === 'string') return dbcResolveColLabel(c);
  // cas objet
  var key = c.chemin || c.path || c.name || c.nom || c.id || '';
  return dbcResolveColLabel(key || String(c));
}

// label metadata field “humain” (id technique -> nom)
function dbcPrettyMetaField(fieldId){
  var m = (metadonneesData.metadonnees || []).find(function(x){
    return String(x.id) === String(fieldId);
  });
  return m ? (m.nom || m.name || String(fieldId)) : String(fieldId);
}

// ── Pretty helpers (automation details) ───────────────────────────────────────

// string courte + safe
function dbcSafeStr(v, maxLen){
  maxLen = maxLen || 120;
  if (v == null) return '';
  var s = (typeof v === 'string') ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : JSON.stringify(v);
  if (!s) s = '';
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

// rend "Collection: ..." sans [object Object]
function dbcPrettyCollection(c){
  if (!c) return '';
  if (typeof c === 'string') return dbcResolveColLabel(c);
  var key = c.chemin || c.path || c.name || c.nom || c.id || '';
  return dbcResolveColLabel(key || '');
}

// résout un id de champ metadata -> label UI
function dbcPrettyMetaField(fieldId){
  var m = (metadonneesData.metadonnees || []).find(function(x){
    return String(x.id) === String(fieldId);
  });
  return m ? (m.nom || m.name || String(fieldId)) : String(fieldId);
}

// aplatit un arbre de conditions iconik-like en lignes lisibles
function dbcHumanizeConditions(cond){
  // formats rencontrés souvent: {operator:"AND", terms:[...]} ou {terms:[...]} ou array
  var out = [];
  if (!cond) return out;

  function walk(node, depth){
    depth = depth || 0;
    if (!node) return;

    // array -> walk each
    if (Array.isArray(node)){
      node.forEach(function(x){ walk(x, depth); });
      return;
    }

    // group with operator/terms
    var op = node.operator || node.op || null;
    var terms = node.terms || node.filters || node.rules || null;

    if (op && Array.isArray(terms)){
      out.push((depth ? '  '.repeat(depth) : '') + 'IF ' + op);
      terms.forEach(function(x){ walk(x, depth+1); });
      return;
    }

    // leaf term (best effort)
    var name = node.name || node.field || node.key || '';
    var cmp  = node.operator || node.op || node.comparator || node.comparison || '';
    var val  = (typeof node.value !== 'undefined') ? node.value : (typeof node.val !== 'undefined' ? node.val : '');
    if (name || cmp || val !== ''){
      out.push((depth ? '  '.repeat(depth) : '') + '• ' + dbcSafeStr(name,60) + ' ' + dbcSafeStr(cmp,16) + ' ' + dbcSafeStr(val,80));
      return;
    }

    // fallback: short json
    out.push((depth ? '  '.repeat(depth) : '') + '• ' + dbcSafeStr(node, 160));
  }

  walk(cond, 0);
  return out.slice(0, 30); // évite les pavés
}

// Trigger -> row (UI label + drill-down)
function dbcTriggerToRowUI(t){
  var type = (t && t.type) ? t.type : 'Unknown';
  // ⚠️ On n’affiche PAS le type technique en sub
  var label = (typeof dbcTriggerUILabel === 'function') ? dbcTriggerUILabel(type) : type;
  var row = { name: type, label: label };

  var children = [];

  // metadata.changed : metadata_values -> "Meta Label = value"
  if (type === 'metadata.changed' && t.config && t.config.metadata_values && typeof t.config.metadata_values === 'object') {
    Object.keys(t.config.metadata_values).forEach(function(fieldId){
      var fieldLabel = dbcPrettyMetaField(fieldId);
      var fv = (t.config.metadata_values[fieldId] && t.config.metadata_values[fieldId].field_values) || [];
      if (!Array.isArray(fv)) fv = [];
      if (!fv.length) {
        children.push({ label: fieldLabel });
      } else {
        fv.forEach(function(x){
          var val = (x && typeof x.value !== 'undefined') ? String(x.value) : '';
          children.push({ label: fieldLabel + (val ? ' = ' + val : '') });
        });
      }
    });
    if (t.config.event_type) children.push({ label: 'Event: ' + String(t.config.event_type) });
  }

  // asset.added_to_collection : show collection(s) nicely
  if (type === 'asset.added_to_collection' && t.config) {
    var cols = t.config.collections || t.config.collection || [];
    if (!Array.isArray(cols)) cols = [cols];
    cols.filter(Boolean).forEach(function(c){
      children.push({ label: 'Collection: ' + dbcPrettyCollection(c) });
    });
  }

  // fallback: if config exists but no known pattern, show a short config preview
  if (!children.length && t && t.config && Object.keys(t.config).length) {
    children.push({ label: 'Config: ' + dbcSafeJson(t.config) });
  }

  if (children.length) row.children = children;
  return row;
}

// Action -> row (UI-ish + drill-down config)
function dbcActionToRowUI(a){
  var type = (a && a.type) ? a.type : 'Unknown';
  var row = { name: type, label: type }; // actions restent "Iconik-like" (anglais)

  var cfg = (a && a.config) ? a.config : null;
  var children = [];

  // 1) add_to_collection : afficher la/les collections cible(s)
  if (type === 'add_to_collection' && cfg){
    var cols = cfg.collections || cfg.collection || [];
    if (!Array.isArray(cols)) cols = [cols];
    cols.filter(Boolean).forEach(function(c){
      children.push({ label: 'Add to: ' + dbcPrettyCollection(c) });
    });
  }

  // 2) set_acl_on_asset / set_acl : résumer mode + permissions + nb groupes
  if ((type === 'set_acl_on_asset' || type === 'set_acl') && cfg){
    if (cfg.mode) children.push({ label: 'Mode: ' + dbcSafeStr(cfg.mode, 40) });

    // permissions peuvent être sous plusieurs formes
    if (cfg.permissions) children.push({ label: 'Permissions: ' + dbcSafeStr(cfg.permissions, 160) });

    // groupes / role groups
    if (cfg.groups && Array.isArray(cfg.groups)) children.push({ label: 'Groups: ' + cfg.groups.length });
  }

  // 3) update_metadata : afficher les champs modifiés
  if (type === 'update_metadata' && cfg){
    // certains modèles: cfg.metadata_values ou cfg.metadata
    var mv = cfg.metadata_values || cfg.metadata || null;
    if (mv && typeof mv === 'object'){
      Object.keys(mv).slice(0, 20).forEach(function(fieldId){
        var label = dbcPrettyMetaField(fieldId);
        var v = mv[fieldId];

        // si iconik-like {field_values:[{value:...}]}
        if (v && v.field_values && Array.isArray(v.field_values)){
          v.field_values.forEach(function(fv){
            children.push({ label: label + ' = ' + dbcSafeStr(fv.value, 120) });
          });
        } else {
          children.push({ label: label + ' = ' + dbcSafeStr(v, 120) });
        }
      });
    }
  }

  // 4) archive / restore / create_share : résumé court
  if (type === 'archive_asset' && cfg){
    if (cfg.archive_storage) children.push({ label: 'Storage: ' + dbcSafeStr(cfg.archive_storage, 80) });
    if (cfg.archive_profile) children.push({ label: 'Profile: ' + dbcSafeStr(cfg.archive_profile, 80) });
  }

  if (type === 'create_share' && cfg){
    if (cfg.share_type) children.push({ label: 'Share type: ' + dbcSafeStr(cfg.share_type, 40) });
    if (cfg.expires_at) children.push({ label: 'Expires: ' + dbcSafeStr(cfg.expires_at, 40) });
    if (cfg.emails) children.push({ label: 'Emails: ' + dbcSafeStr(cfg.emails, 120) });
  }

  // fallback: si rien reconnu, afficher qq clés “propres”
  if (cfg && !children.length){
    Object.keys(cfg).slice(0, 12).forEach(function(k){
      var v2 = cfg[k];
      children.push({ label: k + ': ' + dbcSafeStr(v2, 140) });
    });
  }

  if (children.length) row.children = children;
  return row;
}

// Conditions/Filters -> row “lisible” (pas JSON brut en ligne)
function dbcConditionsRow(d){
  function isEmpty(v){
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }

  // canonical first
  var cond = d && d.conditions;
  var filt = d && d.filters;

  // fallback raw, mais jamais affiché comme "raw.*"
  if (d && d.raw){
    if (isEmpty(cond)) cond = d.raw.conditions;
    if (isEmpty(filt)) filt = d.raw.filters;
  }

  if (isEmpty(cond) && isEmpty(filt)) return null;

  var items = [];

  if (!isEmpty(cond)){
    var lines = dbcHumanizeConditions(cond);
    var row = { name:'conditions', label:'Conditions' };
    if (lines.length) row.children = lines.map(function(s){ return { label:s }; });
    else row.children = [{ label: dbcSafeStr(cond, 220) }];
    items.push(row);
  }

  if (!isEmpty(filt)){
    var lines2 = dbcHumanizeConditions(filt);
    var row2 = { name:'filters', label:'Filters' };
    if (lines2.length) row2.children = lines2.map(function(s){ return { label:s }; });
    else row2.children = [{ label: dbcSafeStr(filt, 220) }];
    items.push(row2);
  }

  return { label: 'Filtres / Conditions', color: '#7f8fa4', items: items };
}

// ── Automation UX helpers (no raw.*, no technical sub, user-friendly details) ──

// safe short string
function dbcSafeStr(v, maxLen){
  maxLen = maxLen || 140;
  if (v == null) return '';
  try {
    const s = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? String(v) : JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch(e){
    return '[unserializable]';
  }
}

function dbcIsEmpty(v){
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

// Collection label (fix [object Object])
function dbcPrettyCollection(c){
  if (!c) return '';
  if (typeof c === 'string') return dbcResolveColLabel(c);
  var key = c.chemin || c.path || c.name || c.nom || c.id || '';
  return dbcResolveColLabel(key || '');
}

// Metadata field label (id -> nom)
function dbcPrettyMetaField(fieldId){
  var m = (metadonneesData.metadonnees || []).find(function(x){ return String(x.id) === String(fieldId); });
  return m ? (m.nom || m.name || String(fieldId)) : String(fieldId);
}

// Humanize Iconik-like conditions tree into lines (max 30)
function dbcHumanizeConditions(cond){
  var out = [];
  if (!cond) return out;

  function walk(node, depth){
    depth = depth || 0;
    if (!node) return;

    if (Array.isArray(node)) { node.forEach(function(x){ walk(x, depth); }); return; }

    var op = node.operator || node.op || null;
    var terms = node.terms || node.filters || node.rules || null;

    if (op && Array.isArray(terms)) {
      out.push((depth ? '  '.repeat(depth) : '') + 'IF ' + op);
      terms.forEach(function(x){ walk(x, depth+1); });
      return;
    }

    var name = node.name || node.field || node.key || '';
    var cmp  = node.operator || node.op || node.comparator || node.comparison || '';
    var val  = (typeof node.value !== 'undefined') ? node.value : (typeof node.val !== 'undefined' ? node.val : '');

    if (name || cmp || val !== '') {
      out.push((depth ? '  '.repeat(depth) : '') + '• ' + dbcSafeStr(name,60) + ' ' + dbcSafeStr(cmp,14) + ' ' + dbcSafeStr(val,80));
      return;
    }

    out.push((depth ? '  '.repeat(depth) : '') + '• ' + dbcSafeStr(node, 160));
  }

  walk(cond, 0);
  return out.slice(0, 30);
}

// UI label for triggers (prefer TRIGGERS_ICONIK.label, fallback english)
function dbcTriggerUILabel(type){
  try {
    if (typeof TRIGGERS_ICONIK !== 'undefined' && TRIGGERS_ICONIK[type] && TRIGGERS_ICONIK[type].label) {
      return TRIGGERS_ICONIK[type].label;
    }
  } catch(e){}
  var FALLBACK = {
    'metadata.changed': 'Metadata is changed',
    'asset.added_to_collection': 'Asset is added to collection',
    'asset.has_new_version': 'Asset has new version',
    'asset.archived': 'Asset is archived',
    'asset.restored': 'Asset is restored',
    'asset.transferred': 'Asset is transferred'
  };
  return FALLBACK[type] || type;
}

// Trigger -> row (UI label + drilldown children)
function dbcTriggerToRowUI(t){
  var type = (t && t.type) ? t.type : 'Unknown';
  var row = { name: type, label: dbcTriggerUILabel(type) }; // ✅ no technical sub

  var cfg = (t && t.config) ? t.config : {};
  var children = [];

  // metadata.changed: metadata_values => "MetaLabel = value"
  if (type === 'metadata.changed' && cfg.metadata_values && typeof cfg.metadata_values === 'object') {
    Object.keys(cfg.metadata_values).forEach(function(fieldId){
      var label = dbcPrettyMetaField(fieldId);
      var fv = (cfg.metadata_values[fieldId] && cfg.metadata_values[fieldId].field_values) || [];
      if (!Array.isArray(fv)) fv = [];
      if (!fv.length) children.push({ label: label });
      else fv.forEach(function(x){
        children.push({ label: label + ' = ' + dbcSafeStr(x && x.value, 140) });
      });
    });
    if (cfg.event_type) children.push({ label: 'Event: ' + String(cfg.event_type) });
  }

  // asset.added_to_collection: collections list (fix object)
  if (type === 'asset.added_to_collection') {
    var cols = cfg.collections || cfg.collection || [];
    if (!Array.isArray(cols)) cols = [cols];
    cols.filter(Boolean).forEach(function(c){
      children.push({ label: 'Collection: ' + dbcPrettyCollection(c) });
    });
  }

  // fallback: show short config if nothing extracted
  if (!children.length && !dbcIsEmpty(cfg)) {
    children.push({ label: 'Config: ' + dbcSafeStr(cfg, 180) });
  }

  if (children.length) row.children = children;
  return row;
}

// Action -> row (english label + drilldown children)
function dbcActionToRowUI(a){
  var type = (a && a.type) ? a.type : 'Unknown';
  var row = { name: type, label: type }; // actions stay english (Iconik-like)
  var cfg = (a && a.config) ? a.config : {};
  var children = [];

  if (type === 'add_to_collection') {
    var cols = cfg.collections || cfg.collection || [];
    if (!Array.isArray(cols)) cols = [cols];
    cols.filter(Boolean).forEach(function(c){
      children.push({ label: 'Add to: ' + dbcPrettyCollection(c) });
    });
  }

  if (type === 'update_metadata') {
    var mv = cfg.metadata_values || cfg.metadata || null;
    if (mv && typeof mv === 'object') {
      Object.keys(mv).slice(0, 25).forEach(function(fieldId){
        var label = dbcPrettyMetaField(fieldId);
        var v = mv[fieldId];
        if (v && v.field_values && Array.isArray(v.field_values)) {
          v.field_values.forEach(function(fv){
            children.push({ label: label + ' = ' + dbcSafeStr(fv && fv.value, 140) });
          });
        } else {
          children.push({ label: label + ' = ' + dbcSafeStr(v, 140) });
        }
      });
    }
  }

  if (type === 'set_acl_on_asset' || type === 'set_acl') {
    if (!dbcIsEmpty(cfg.mode)) children.push({ label: 'Mode: ' + dbcSafeStr(cfg.mode, 60) });
    if (!dbcIsEmpty(cfg.permissions)) children.push({ label: 'Permissions: ' + dbcSafeStr(cfg.permissions, 180) });
    if (Array.isArray(cfg.groups)) children.push({ label: 'Groups: ' + cfg.groups.length });
  }

  if (type === 'create_share') {
    ['share_type','expires_at','expires_in_days','emails','allow_download','allow_comments'].forEach(function(k){
      if (!dbcIsEmpty(cfg[k])) children.push({ label: k + ': ' + dbcSafeStr(cfg[k], 140) });
    });
  }

  // fallback: show a short list of keys (no JSON wall)
  if (!children.length && !dbcIsEmpty(cfg)) {
    Object.keys(cfg).slice(0, 10).forEach(function(k){
      children.push({ label: k + ': ' + dbcSafeStr(cfg[k], 140) });
    });
    if (Object.keys(cfg).length > 10) children.push({ label: '…' + (Object.keys(cfg).length - 10) + ' more keys' });
  }

  if (children.length) row.children = children;
  return row;
}

// Conditions section row (no raw.* displayed; drilldown)
function dbcConditionsSection(d){
  var cond = d && d.conditions;
  var filt = d && d.filters;

  // fallback raw, but never displayed as raw.*
  if (d && d.raw) {
    if (dbcIsEmpty(cond)) cond = d.raw.conditions;
    if (dbcIsEmpty(filt)) filt = d.raw.filters;
  }

  if (dbcIsEmpty(cond) && dbcIsEmpty(filt)) return null;

  var items = [];
  if (!dbcIsEmpty(cond)) items.push({ label: 'Conditions', children: dbcHumanizeConditions(cond).map(function(s){ return {label:s}; }) });
  if (!dbcIsEmpty(filt)) items.push({ label: 'Filters', children: dbcHumanizeConditions(filt).map(function(s){ return {label:s}; }) });

  return { label: 'Filtres / Conditions', color: '#7f8fa4', items: items };
}

// Automation / Webhook / Custom Action
function dbcGetSectionsAutomation(type, name, d) {

  if (type === 'automation') {

    var triggers = (d.triggers || []).map(function(t){
      return (typeof dbcTriggerToRowUI === 'function') ? dbcTriggerToRowUI(t) : { name:(t&&t.type)||'Unknown', label:(t&&t.type)||'Unknown' };
    });

    var actions = (d.actions || []).map(function(a){
      return (typeof dbcActionToRowUI === 'function') ? dbcActionToRowUI(a) : { name:(a&&a.type)||'Unknown', label:(a&&a.type)||'Unknown' };
    });

    var sections = [
      { label: 'Déclencheurs', color: DBC_COLORS.automation, items: triggers },
      { label: 'Actions', color: '#e67e22', items: actions },
    ];

    var cf = (typeof dbcConditionsSection === 'function') ? dbcConditionsSection(d) : null;
    if (cf) sections.push(cf);

    return sections;
  }

  if (type === 'webhook') {
  // Champs possibles selon ton modèle
  var whName = d.name || d.nom || 'Webhook';
  var eventType = d.eventType || d.event_type || d.event || '';
  var operation = d.operation || d.op || '';
  var url = d.url || d.endpoint || d.target_url || d.callback_url || '';

  // On garde une seule section "Détails" (simple)
  var details = [];
  if (eventType) details.push({ label: 'Event: ' + eventType });
  if (operation) details.push({ label: 'Operation: ' + operation });
  if (url) details.push({ label: 'URL: ' + url });

  // fallback si rien
  if (!details.length) details.push({ label: '—' });

  return [
    { label: 'Détails', color: DBC_COLORS.webhook, items: details }
  ];
}

  if (type === 'customAction') {
  // Champs possibles selon ton modèle
  var title = d.title || d.nom || d.name || 'Custom Action';
  var context = d.context || '';
  var caType = d.type || d.action_type || '';
  var caId = d.id || d.action_id || '';

  // Teams (si présent via ACL sync)
  var teams = [];
  if (Array.isArray(d.teams)) {
    teams = d.teams.map(function(t){
      var n = (typeof t === 'string') ? t : (t.nom || t.name || t.id || '');
      return n;
    }).filter(Boolean);
    // tri alpha
    teams.sort(function(a,b){ return String(a).localeCompare(String(b),'fr',{sensitivity:'base'}); });
  }

  var details = [];
  if (context) details.push({ label: 'Context: ' + context });
  if (caType) details.push({ label: 'Type: ' + caType });
  if (caId) details.push({ label: 'ID: ' + caId });

  return [
    { label: 'Détails', color: DBC_COLORS.customAction, items: details.length ? details : [{label:'—'}] },
    { label: 'Teams', color: DBC_COLORS.team, items: teams.map(function(n){ return { label: n }; }) }
  ];
}

  return [];
}

// ── Helpers data ──────────────────────────────────────────────────────────────
function dbcGetTeamCollections(d){return(d.collections||[]).map(function(c){var ch=typeof c==='string'?c:(c.id||c.chemin||'');var nm=typeof c==='string'?c:(c.nom||c.name||c.chemin||ch);return{chemin:ch,nom:nm,permission:(c&&c.permission)||''};});}
function dbcGetTeamMDViews(d){return(d.vues||d.metadataViews||[]).map(function(v){var n=typeof v==='string'?v:v.nom||v;return{nom:n,permission:(v&&v.permission)||''};});}
function dbcGetRolesPourRG(d){return(d.fonctionnalites||[]).map(function(r){return{nom:r};});}
function dbcGetCategoriesPourViews(viewNames){
  return (categoriesData.categories || []).filter(function(cat){
    // 1) Filtre catégories système (Dashboard) si toggle OFF
    if (typeof _wfdIncludeSysCats === 'function' && typeof _isSysCategory === 'function') {
      if (!_wfdIncludeSysCats() && (cat.is_system === true || _isSysCategory(cat))) return false;
    }
    // 2) Filtre scope "assets" (évite de remonter des catégories Collections/Custom Actions…)
    var types = cat.object_types || cat.appliqueeA || [];
    if (Array.isArray(types) && types.length) {
      if (!types.includes('assets')) return false;
    }
    // 3) Intersect metadataViews
    return (cat.metadataViews || []).some(function(mv){ return viewNames.includes(mv); });
  });
}
// ── Helpers corrélation metadata.changed (config.metadata_values) ─────────────
function dbcMetaNamesForTeam(team){
  const viewNames = (team.vues || team.metadataViews || []).map(v => (typeof v === 'string') ? v : (v.nom || v.name || v)).filter(Boolean);
  const metas = (metadonneesData.metadonnees || []).filter(m => {
    const vv = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    return (vv || []).some(vn => viewNames.includes(vn));
  });
  return new Set(metas.map(m => m.nom).filter(Boolean));
}
function dbcMetaKeysForTeam(team){
  const viewNames = (team.vues || team.metadataViews || [])
    .map(v => (typeof v === 'string') ? v : (v.nom || v.name || v))
    .filter(Boolean);

  const metas = (metadonneesData.metadonnees || []).filter(m => {
    const vv = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    return (vv || []).some(vn => viewNames.includes(vn));
  });

  const set = new Set();
  metas.forEach(m => {
    if (m && m.id)   set.add(String(m.id));   // ✅ clé technique (DestinationPAD)
    if (m && m.nom)  set.add(String(m.nom));  // label (Destination PAD)
    if (m && m.name) set.add(String(m.name)); // parfois présent
  });
  return set;
}

function dbcTriggerMetaFields(trigger){
  const mv = trigger && trigger.config && trigger.config.metadata_values;
  if (!mv || typeof mv !== 'object') return [];
  return Object.keys(mv);
}

function dbcGetAutosPourTeam(d){
  var cols = (d.collections || []).map(function(c){ return typeof c==='string' ? c : c.chemin; });
  var views = (d.vues || d.metadataViews || []).map(function(v){ return typeof v==='string' ? v : (v.nom || v.name || v); });

  // ✅ Nouvel axe: métadonnées accessibles via les MD Views de la team
  var metaKeys = dbcMetaKeysForTeam(d);

  var res=[];
  (automationsData.automations || []).forEach(function(a){
    var linked = (a.triggers || []).some(function(t){
      // collections
      var okCol = (t.type==='asset.added_to_collection'
        && ((t.config && t.config.collections) || []).some(function(c){ return cols.includes(c); })
      );

      // ancien axe metadataViews (on le garde si jamais)
      var okViews = (t.type==='metadata.changed'
        && (((t.config && t.config.metadataViews) || []).some(function(mv){ return views.includes(mv); }))
      );

      // ✅ nouvel axe metadata_values : match si un champ du trigger est dans les metas accessibles
      var okMetaValues = false;
      if (t.type === 'metadata.changed') {
        var fields = dbcTriggerMetaFields(t);
        okMetaValues = fields.some(function(f){ return metaKeys.has(String(f)); });
      }

      return okCol || okViews || okMetaValues;
    });

    if (linked && !res.find(function(r){ return r.nom===a.nom; })) res.push(a);
  });

  return res;
}

function dbcGetItemsPourRole(roleName){
  if(!itemsAdvancedData||!itemsAdvancedData.items)return[];
  var res=[];
  (itemsAdvancedData.items||[]).forEach(function(item){
    if(item.assignations&&item.assignations.length){
      var asgn=item.assignations.filter(function(a){return a.role===roleName;});
      if(asgn.length){var perms=[];asgn.forEach(function(a){(a.permissions||[]).forEach(function(p){if(perms.indexOf(p)<0)perms.push(p);});});res.push({nom:item.nom||item.name||'—',permissions:perms});return;}
    }
    if(item.roles&&item.roles.length){var r=item.roles.find(function(rv){return(typeof rv==='string'?rv:rv.nom||rv)===roleName;});if(r)res.push({nom:item.nom||item.name||'—',permissions:[]});}
  });
  return res;
}

// ── Deploy tout / vider / réaligner ──────────────────────────────────────────
function autoDeployerTout(){
  // Si des cassettes existent déjà → toggle repli/déploiement des sections
  if(dbcCassettes.length){
    var sections=document.querySelectorAll('.dbc-cas-section-body');
    var anyOpen=Array.from(sections).some(function(s){return !s.classList.contains('collapsed');});
    sections.forEach(function(s){
      s.classList.toggle('collapsed',anyOpen);
      var chev=s.previousSibling&&s.previousSibling.querySelector('.dbc-cas-sec-chev');
      if(chev)chev.textContent=anyOpen?'▶':'▼';
    });
    dbcToast(anyOpen?'Sections repliées':'Sections déployées');
    return;
  }
  // Sinon déployer tout
  (teamsData.teams||[]).forEach(function(t){dbcAjouterCassette('team',t.nom,t);});
  (roleGroupsData.roleGroups||[]).forEach(function(rg){dbcAjouterCassette('roleGroup',rg.nom,rg);});
  (collectionsData.collections||[]).forEach(function(c){var n=typeof c==='string'?c:(c.name||c.id||'');dbcAjouterCassette('collection',n,typeof c==='string'?{nom:c,id:c}:{nom:n,id:c.id,parent_id:c.parent_id||null});});
  (metadataViewsData.metadataViews||[]).forEach(function(mv){var n=typeof mv==='string'?mv:(mv.name||mv.id||'');dbcAjouterCassette('metadataView',n,typeof mv==='string'?{nom:mv,id:mv}:{nom:n,id:mv.id});});
  (metadonneesData.metadonnees||[]).forEach(function(m){dbcAjouterCassette('metadonnee',m.nom,m);});
  (savedSearchesData.savedSearches||[]).forEach(function(s){dbcAjouterCassette('savedSearch',s.nom,s);});
  (storagesData.storages||[]).forEach(function(s){var n=s.nom||s;dbcAjouterCassette('storage',n,typeof s==='string'?{nom:s}:s);});
  (rolesData.roles||[]).forEach(function(r){var n=r.nom||r;dbcAjouterCassette('role',n,typeof r==='string'?{nom:r}:r);});
  (categoriesData.categories||[]).forEach(function(c){dbcAjouterCassette('categorie',c.nom,c);});
}
function toutAuStore(){
  if(!dbcCassettes.length){dbcToast('Aucune cassette sur le canvas');return;}
  var added=0;
  dbcCassettes.forEach(function(c){
    if(!dbcStore.find(function(s){return s.casId===c.id;})){
      var fields={};(DBC_FIELDS[c.type]||[]).forEach(function(f){fields[f]=true;});
      dbcStore.push({casId:c.id,type:c.type,name:c.name,data:c.data,fields:fields});
      var el=document.getElementById('cas-'+c.id);if(el)el.classList.add('in-store');
      added++;
    }
  });
  dbcRenderStore();dbcSyncSelectionsComparaison();
  dbcToast(added+' cassette'+(added>1?'s':'')+' ajoutée'+(added>1?'s':'')+' au store');
}
function viderCanvas(){
  dbcCassettes=[];dbcSelected=null;
  dbcNodes=[];dbcConnections=[];dbcStore=[];dbcGroups=[];
  var wrap=document.getElementById('dbc-cassettes-wrap');if(wrap)wrap.innerHTML='';
  dbcRefreshEmpty();dbcRefreshPanelOnCanvas();dbcRenderStore();dbcUpdateStatus();
}
function dbcRealigner(){
  var snap=dbcCassettes.map(function(c){return{type:c.type,name:c.name,data:c.data};});
  viderCanvas();
  snap.forEach(function(s){dbcAjouterCassette(s.type,s.name,s.data);});
  dbcToast('Canvas réaligné');
}

// ── Context menu ──────────────────────────────────────────────────────────────
function dbcSetupContextMenu(){
  document.addEventListener('click',function(e){
    if(!e.target.closest('#dbc-ctx-menu'))dbcFermerCtxMenu();
  });
}
function dbcShowCtxCassette(px,py,casId){
  var menu=document.getElementById('dbc-ctx-menu');
  menu.innerHTML='';menu.style.display='block';menu.style.left=px+'px';menu.style.top=py+'px';
  var cas=dbcCassettes.find(function(c){return c.id===casId;});if(!cas)return;
  var actions=[
    {label:'➕ Ajouter au store',fn:function(){dbcAjouterAuStoreCassette(casId);}},
    {label:'🗑 Retirer du canvas',fn:function(){dbcSupprimerCassette(casId);}},
  ];
  actions.forEach(function(a){
    var btn=document.createElement('button');btn.className='dbc-ctx-btn';btn.textContent=a.label;
    btn.addEventListener('click',function(){a.fn();dbcFermerCtxMenu();});menu.appendChild(btn);
  });
}
function dbcFermerCtxMenu(){var m=document.getElementById('dbc-ctx-menu');if(m){m.style.display='none';m.innerHTML='';}}

// ── Store ─────────────────────────────────────────────────────────────────────
function dbcAjouterAuStoreCassette(casId){
  var cas=dbcCassettes.find(function(c){return c.id===casId;});if(!cas)return;
  if(dbcStore.find(function(s){return s.casId===casId;})){dbcToast(cas.name+' déjà dans le store');return;}
  var fields={};(DBC_FIELDS[cas.type]||[]).forEach(function(f){fields[f]=true;});
  dbcStore.push({casId:casId,type:cas.type,name:cas.name,data:cas.data,fields:fields});
  var el=document.getElementById('cas-'+casId);if(el)el.classList.add('in-store');
  dbcRenderStore();dbcSyncSelectionsComparaison();dbcToast(cas.name+' ajouté au store');
}
function dbcRetirerDuStore(casId){
  dbcStore=dbcStore.filter(function(s){return s.casId!==casId;});
  var el=document.getElementById('cas-'+casId);if(el)el.classList.remove('in-store');
  dbcRenderStore();dbcSyncSelectionsComparaison();
}
function viderStore(){
  dbcStore.forEach(function(s){var el=document.getElementById('cas-'+s.casId);if(el)el.classList.remove('in-store');});
  dbcStore=[];dbcRenderStore();dbcSyncSelectionsComparaison();
}
function dbcRenderStore(){
  var list=document.getElementById('dbc-store-list'),hint=document.getElementById('dbc-store-hint'),footer=document.getElementById('dbc-store-footer'),count=document.getElementById('dbc-store-count');
  if(!list)return;
  if(!dbcStore.length){list.innerHTML='';if(hint)hint.style.display='block';if(footer)footer.style.display='none';return;}
  if(hint)hint.style.display='none';if(footer)footer.style.display='block';
  if(count)count.textContent=dbcStore.length+' cassette(s)';
  list.innerHTML='';
  dbcStore.forEach(function(entry){
    var color=DBC_COLORS[entry.type]||'#555';
    var div=document.createElement('div');div.className='dbc-store-entry';
    div.innerHTML='<div class="dbc-store-entry-header"><span style="color:'+color+'">'+(DBC_ICONS[entry.type]||'●')+'</span>'
      +'<span class="dbc-store-entry-name" title="'+dbcEsc(entry.name)+'">'+dbcEsc(entry.name)+'</span>'
      +'<button class="dbc-store-entry-remove" onclick="dbcRetirerDuStore(\''+entry.casId+'\')">✕</button></div>'
      +'<div class="dbc-store-entry-type">'+dbcTypeLabel(entry.type)+'</div>'
      +'<div class="dbc-store-fields">'+Object.entries(entry.fields).map(function(kv){
        var fn=kv[0],chk=kv[1],fid='sf-'+entry.casId+'-'+fn.replace(/\s/g,'_');
        return '<div class="dbc-store-field"><input type="checkbox" id="'+fid+'" '+(chk?'checked':'')
          +' onchange="dbcToggleField(\''+entry.casId+'\',\''+fn+'\',this.checked)"><label for="'+fid+'">'+fn+'</label></div>';
      }).join('')+'</div>';
    list.appendChild(div);
  });
}
function dbcToggleField(casId,fn,checked){var e=dbcStore.find(function(s){return s.casId===casId;});if(e){e.fields[fn]=checked;dbcSyncSelectionsComparaison();}}

// ── Sync sélections pour exports ──────────────────────────────────────────────
function dbcSyncSelectionsComparaison(){
  selectionsComparaison={groupes:[],collections:[],mdViews:[],metadonnees:[],roles:[]};
  // Si rien dans le store, prendre toutes les cassettes
  var src=dbcStore.length?dbcStore:dbcCassettes.map(function(c){return{casId:c.id,type:c.type,name:c.name,data:c.data,fields:{}};});
  src.forEach(function(entry){
    if(entry.type==='team'||entry.type==='roleGroup'){
      selectionsComparaison.groupes.push({
        nom:entry.name,data:entry.data,
        icon:DBC_ICONS[entry.type],color:DBC_COLORS[entry.type],
        _selectedFields:Object.entries(entry.fields||{}).filter(function(kv){return kv[1];}).map(function(kv){return kv[0];})
      });
    }
  });
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
function dbcRefreshEmpty(){
  var e=document.getElementById('dbc-empty');
  if(e)e.style.display=dbcCassettes.length?'none':'block';
}
function dbcRefreshPanelOnCanvas(){
  document.querySelectorAll('.dbc-src-item').forEach(function(el){
    var type=el.dataset.type,label=el.dataset.label;
    var onCanvas=dbcCassettes.some(function(c){return c.type===type&&c.name===label;});
    el.classList.toggle('on-canvas',onCanvas);
  });
}
function dbcUpdateStatus(){
  var e=document.getElementById('dbc-status');
  if(e)e.textContent=dbcCassettes.length+' cassette(s)';
}
function dbcTypeLabel(type){return{team:'Team',roleGroup:'Role Group',collection:'Collection',metadataView:'Metadata View',metadonnee:'Métadonnée',savedSearch:'Saved Search',storage:'Storage',role:'Role',automation:'Automation',webhook:'Webhook',customAction:'Custom Action',categorie:'Catégorie'}[type]||type;}
function dbcEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var dbcToastTimer=null;
function dbcToast(msg){if(dbcToastTimer){clearTimeout(dbcToastTimer);var o=document.querySelector('.dbc-toast');if(o)o.remove();}var t=document.createElement('div');t.className='dbc-toast';t.textContent=msg;document.body.appendChild(t);dbcToastTimer=setTimeout(function(){t.remove();dbcToastTimer=null;},2600);}

// ── Panel resize ──────────────────────────────────────────────────────────────
function dbcSetupPanelResize(){
  var handle=document.getElementById('dbc-panel-resize');
  if(!handle)return;
  var panel=document.getElementById('dbc-panel-left');
  var dragging=false,startX=0,startW=0;
  handle.addEventListener('mousedown',function(e){dragging=true;startX=e.clientX;startW=panel.offsetWidth;e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(!dragging)return;panel.style.width=Math.max(160,Math.min(400,startW+(e.clientX-startX)))+'px';});
  document.addEventListener('mouseup',function(){dragging=false;});
}

// Auto-refresh quand l'onglet redevient visible (retour Settings -> Dashboard)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    try { chargerToutesDonnees(); } catch {}
  }
});


// Bonus minimal Electron (fenêtre reprend le focus) — utile si tu restes sur Dashboard
window.addEventListener('focus', () => {
  try { chargerToutesDonnees(); } catch {}
});

// ── Resize observer pour recalculer les largeurs ──────────────────────────────
window.addEventListener('resize',function(){dbcRenderCassettes();});

// ── Exports ───────────────────────────────────────────────────────────────────
window._dbcExportWord=function(){
  dbcSyncSelectionsComparaison();
  if(typeof exporterComparaisonWord==='function')exporterComparaisonWord();
};
window._dbcExportExcel=function(){
  dbcSyncSelectionsComparaison();
  if(typeof exporterVersExcel==='function')exporterVersExcel();
};
