var collectionsData={collections:[]},teamsData={teams:[]},roleGroupsData={roleGroups:[]};

// Normalise collectionsData en chemins strings via parent_id
function visGetColPaths(){
  var cols=collectionsData.collections||[];
  if(!cols.length) return [];
  if(typeof cols[0]==='string') return cols;
  // Reconstruire chemins complets depuis parent_id
  var byId={};
  cols.forEach(function(c){byId[c.id]=c;c._vpath=null;});
  function getPath(c){
    if(!c) return '';
    if(c._vpath!==null) return c._vpath;
    if(!c.parent_id||!byId[c.parent_id]){c._vpath=c.name||c.nom;}
    else{c._vpath=getPath(byId[c.parent_id])+'/'+(c.name||c.nom);}
    return c._vpath;
  }
  return cols.map(function(c){return '/'+getPath(byId[c.id])+'/';});
}
// ── CFG helpers: filter by root + depth, fill root select, apply UI ──────────
function cfg_filterPathsByRootAndDepth(paths, rootPrefix, maxDepth){
  rootPrefix = (rootPrefix || '').trim();
  if (rootPrefix && !rootPrefix.startsWith('/')) rootPrefix = '/' + rootPrefix;
  if (rootPrefix && !rootPrefix.endsWith('/')) rootPrefix = rootPrefix + '/';

  var rootDepth = rootPrefix ? rootPrefix.split('/').filter(Boolean).length : 0;

  return (paths || []).filter(function(p){
    if (!p) return false;
    if (rootPrefix && !p.startsWith(rootPrefix)) return false;

    if (typeof maxDepth === 'number' && maxDepth >= 0){
      var d = String(p).split('/').filter(Boolean).length - rootDepth;
      if (d > maxDepth) return false;
    }
    return true;
  });
}

function cfg_getTopRoots(paths){
  var set = new Set();
  (paths || []).forEach(function(p){
    var parts = String(p).split('/').filter(Boolean);
    if (parts.length) set.add('/' + parts[0] + '/');
  });
  return Array.from(set).sort();
}

function cfg_fillRootSelect(paths){
  var sel = document.getElementById('cfg-root');
  if (!sel) return;

  var roots = cfg_getTopRoots(paths);
  sel.innerHTML =
    '<option value="">(Tous)</option>' +
    roots.map(function(r){ return '<option value="'+r+'">'+r+'</option>'; }).join('');
}

// Bouton toolbar "↻ Appliquer"
function cfg_applyUI(){
  var rootEl = document.getElementById('cfg-root');
  var depthEl = document.getElementById('cfg-depth');

  var root = rootEl ? rootEl.value : '';
  var depth = depthEl ? parseInt(depthEl.value, 10) : 1;
  if (isNaN(depth)) depth = 1;

  cfg_load({ root: root, depth: depth });
}

/* WFD: duplicate cfg_filterPathsByRootAndDepth removed */


// roots niveau 0 (pour menu "Root")

/* WFD: duplicate cfg_getTopRoots removed */

async function loadData(){
  try {
    const envsRes = await fetch('/api/environments/credentials');
    const envs = await envsRes.json();
    const env = (envs || []).find(function(e){ return e.isDefault; }) || (envs || [])[0];
    if (!env) { collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]}; return; }
    const snapRes = await fetch('/api/ikon/snapshot/' + encodeURIComponent(env.environment));
    if (!snapRes.ok) { collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]}; return; }
    const snap = await snapRes.json();
    collectionsData = { collections: snap.collections || [] };
    teamsData       = { teams: snap.teams || [] };
    roleGroupsData  = { roleGroups: snap.roleGroups || [] };
    var b=document.getElementById('orgBadge'); if(b) b.textContent = (snap.env && snap.env.name) || '';
  } catch(e) {
    console.warn('[Viewer] Erreur chargement snapshot :', e);
    collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]};
  }
}
document.addEventListener('DOMContentLoaded',loadData);
var _tt=null;
function toast(msg){
  if(_tt){clearTimeout(_tt);document.getElementById('vtoast').classList.remove('show');}
  var t=document.getElementById('vtoast');t.textContent=msg;t.classList.add('show');
  _tt=setTimeout(function(){t.classList.remove('show');_tt=null;},2600);
}
var curMode='image';
function setMode(m){
  ['image','config','designer'].forEach(function(x){
    document.getElementById('mode-'+x).classList.toggle('hidden',x!==m);
    document.getElementById('mode-'+x).classList.toggle('active',x===m);
    document.getElementById('tb-'+x).classList.toggle('hidden',x!==m);
    document.getElementById('mbtn-'+x).classList.toggle('active',x===m);
  });
  curMode=m;if(m==='config')cfg_load({preset:'demo'});
}
document.addEventListener('DOMContentLoaded',function(){['config','designer'].forEach(function(x){document.getElementById('mode-'+x).classList.add('hidden');});});

// ── IMAGE ──
var IS=1,ITX=0,ITY=0,IDrg=false,IDsx=0,IDsy=0,IDtx=0,IDty=0,ILoaded=false,IMMon=false;
document.addEventListener('DOMContentLoaded',function(){
  var wrap=document.getElementById('mode-image');
  wrap.addEventListener('wheel',function(e){if(!ILoaded)return;e.preventDefault();var d=e.deltaY>0?-.15:.15,r=wrap.getBoundingClientRect();var mx=e.clientX-r.left,my=e.clientY-r.top;var ns=Math.min(8,Math.max(.05,IS+d));ITX=mx-(mx-ITX)*(ns/IS);ITY=my-(my-ITY)*(ns/IS);IS=ns;iApply();},{passive:false});
  wrap.addEventListener('mousedown',function(e){if(!ILoaded||e.button!==0)return;e.preventDefault();IDrg=true;IDsx=e.clientX;IDsy=e.clientY;IDtx=ITX;IDty=ITY;document.getElementById('img-vp').classList.add('grab');});
  document.addEventListener('mousemove',function(e){if(!IDrg)return;ITX=IDtx+(e.clientX-IDsx);ITY=IDty+(e.clientY-IDsy);iApply();});
  document.addEventListener('mouseup',function(){IDrg=false;document.getElementById('img-vp').classList.remove('grab');});
});
function iApply(){document.getElementById('img-vp').style.transform='translate('+ITX+'px,'+ITY+'px) scale('+IS+')';document.getElementById('img-zlbl').textContent=Math.round(IS*100)+'%';iMM();}
function img_load(e){var f=e.target.files[0];if(!f)return;var url=URL.createObjectURL(f);var im=document.getElementById('arbo-img');im.onload=function(){ILoaded=true;document.getElementById('img-empty').classList.add('hidden');im.classList.remove('hidden');document.getElementById('mm-img').src=url;document.getElementById('img-hint').textContent=f.name;img_fit();toast('Image : '+f.name);};im.src=url;e.target.value='';}
function img_fit(){if(!ILoaded)return;var w=document.getElementById('mode-image'),im=document.getElementById('arbo-img');var s=Math.min(w.clientWidth/im.naturalWidth,w.clientHeight/im.naturalHeight)*.92;IS=s;ITX=(w.clientWidth-im.naturalWidth*s)/2;ITY=(w.clientHeight-im.naturalHeight*s)/2;iApply();}
function img_zoom(d){var w=document.getElementById('mode-image'),cx=w.clientWidth/2,cy=w.clientHeight/2;var ns=Math.min(8,Math.max(.05,IS+d));ITX=cx-(cx-ITX)*(ns/IS);ITY=cy-(cy-ITY)*(ns/IS);IS=ns;iApply();}
function img_reset(){IS=1;ITX=0;ITY=0;iApply();}
function img_toggleMM(){IMMon=!IMMon;document.getElementById('img-minimap').classList.toggle('hidden',!IMMon);document.getElementById('btn-mm').classList.toggle('on',IMMon);}
function iMM(){if(!IMMon||!ILoaded)return;var mm=document.getElementById('img-minimap'),im=document.getElementById('arbo-img'),w=document.getElementById('mode-image');var sc=mm.clientWidth/im.naturalWidth;var vp=document.getElementById('mm-vp');vp.style.left=Math.max(0,(-ITX/IS)*sc)+'px';vp.style.top=Math.max(0,(-ITY/IS)*sc)+'px';vp.style.width=Math.min(mm.clientWidth,(w.clientWidth/IS)*sc)+'px';vp.style.height=Math.min(mm.clientHeight,(w.clientHeight/IS)*sc)+'px';}
function img_fs(){var el=document.getElementById('mode-image');if(el.requestFullscreen)el.requestFullscreen();}

// ── CONFIG ──
var CS=1,CTX=40,CTY=40,CDrg=false,CDsx=0,CDsy=0,CDtx=0,CDty=0;

// ✅ Anti-perte de highlight après pan
var cfgWasDragging = false;
var cfgDragMoved = 0;

var cfgCards={},cfgAllOn=false;
var CFG_W=150,CFG_H=88,CFG_HGAP=240,CFG_VGAP=20;

document.addEventListener('DOMContentLoaded',function(){
  var wrap=document.getElementById('mode-config');

  // ✅ IMPORTANT : on intercepte le click en CAPTURE.
  // Si on vient de panner, on bloque le click qui efface le highlight (cfg_clearHighlight).
  wrap.addEventListener('click', function(e){
    if (cfgWasDragging) {
      cfgWasDragging = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  wrap.addEventListener('wheel',function(e){
    e.preventDefault();
    var d=e.deltaY>0?-.1:.1, r=wrap.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;
    var ns=Math.min(4,Math.max(.08,CS+d));
    CTX=mx-(mx-CTX)*(ns/CS);
    CTY=my-(my-CTY)*(ns/CS);
    CS=ns;
    cApply();
  },{passive:false});

  wrap.addEventListener('mousedown',function(e){
    if(e.target.closest('.cfg-node')||e.target.closest('.cfg-card'))return;
    if(e.button!==0)return;
    e.preventDefault();

    CDrg=true;
    CDsx=e.clientX; CDsy=e.clientY;
    CDtx=CTX; CDty=CTY;

    // ✅ init drag flags
    cfgWasDragging = false;
    cfgDragMoved = 0;

    document.getElementById('cfg-vp').classList.add('grab');
  });

  document.addEventListener('mousemove',function(e){
    if(!CDrg)return;

    CTX=CDtx+(e.clientX-CDsx);
    CTY=CDty+(e.clientY-CDsy);

    // ✅ si on bouge, on mark comme “drag”
    cfgDragMoved++;
    if (cfgDragMoved > 1) cfgWasDragging = true;

    cApply();
  });

  document.addEventListener('mouseup',function(){
    if(CDrg){
      CDrg=false;
      document.getElementById('cfg-vp').classList.remove('grab');
    }
  });
});

// ✅ Netteté : arrondir translate + limiter scale (réduit le flou subpixel)
function cApply(){
  var x = Math.round(CTX);
  var y = Math.round(CTY);
  var s = Math.round(CS * 100) / 100; // 2 décimales

  document.getElementById('cfg-vp').style.transform =
    'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';

  document.getElementById('cfg-zlbl').textContent = Math.round(s*100) + '%';
}

function cfg_zoom(d){
  var w=document.getElementById('mode-config'),
      cx=w.clientWidth/2, cy=w.clientHeight/2;
  var ns=Math.min(4,Math.max(.08,CS+d));
  CTX=cx-(cx-CTX)*(ns/CS);
  CTY=cy-(cy-CTY)*(ns/CS);
  CS=ns;
  cApply();
}

// ✅ Ton cfg_load actuel (inchangé)
async function cfg_load(opts){
  opts = opts || {};
  await loadData();

  var cols = visGetColPaths();
  if(!cols.length){ toast('Aucune collection'); return; }

  // Remplir la liste des roots dès qu'on a les paths
  cfg_fillRootSelect(cols);

  document.getElementById('cfg-empty').classList.add('hidden');
  cfgCards = {};
  cfgAllOn = false;
  document.getElementById('btn-cards').classList.remove('on');

  // Cas Global (tu as mis un bouton 🌐 Global)
  if (opts.global === true){
    cfg_build(cols);
    return;
  }

  // Cas Démo
  if (opts.preset === 'demo'){
    var demoDepth = 1; // ton choix: depth=1
    var filteredDemo = cfg_filterPathsByRootAndDepth(cols, '', demoDepth);
    cfg_build(filteredDemo);
    return;
  }

  // Cas Root/Depth (↻ Appliquer)
  var root = opts.root || '';
  var depth = (typeof opts.depth === 'number') ? opts.depth : 1;
  var filtered = cfg_filterPathsByRootAndDepth(cols, root, depth);
  cfg_build(filtered);
}

var cfgPosMap={};
function cfg_build(cols){
  cfgPosMap={};var vp=document.getElementById('cfg-vp');Array.from(vp.children).forEach(function(c){if(c.tagName!=='svg')c.remove();});var svg=document.getElementById('cfg-svg');svg.innerHTML='';
  function makeNode(key){return{key:key,chemin:'',kids:{}};}var root={key:'',chemin:'',kids:{}};
  cols.slice().sort().forEach(function(ch){var parts=ch.split('/').filter(Boolean);var cur=root;parts.forEach(function(p){if(!cur.kids[p])cur.kids[p]=makeNode(p);cur=cur.kids[p];});cur.chemin=ch;});
  var positions=[];
  var globalY=0;
  var STEP=CFG_H+CFG_VGAP;
  // Pas de nœud racine synthétique — l'arbo démarre directement aux collections
  // racines réelles d'Iconik (pas de "point" virtuel représentant Iconik lui-même).
  var ROOT_X=40;
  function layout(node,depth,parentChemin){
    var kids=Object.values(node.kids);
    var myY=globalY;
    if(node.key){
      positions.push({key:node.key,chemin:node.chemin||node.key,depth:depth,x:ROOT_X+depth*(CFG_W+CFG_HGAP),y:myY,parentChemin:parentChemin});
      globalY+=STEP;
    }
    var nextParent=node.key?(node.chemin||node.key):null;
    kids.forEach(function(kid){
      layout(kid,depth+(node.key?1:0),nextParent);
    });
  }
    // Les nœuds de niveau 0 sont de vraies racines, sans parent
    layout(root,0,null);
    positions.forEach(function(p){
    cfgPosMap[p.chemin]=p;
    var el=document.createElement('div');
    el.className='cfg-node'+(p.depth===0?' root':'');
    el.style.left=p.x+'px';el.style.top=p.y+'px';el.dataset.chemin=p.chemin;
    var folder=document.createElement('div');folder.className='cfg-folder';folder.style.width=CFG_W+'px';
    var name=document.createElement('div');name.className='cfg-fname';name.textContent=p.key;name.title=p.chemin;folder.appendChild(name);
    var teams=cfg_getTeams(p.chemin);
    if(teams.length){var bdiv=document.createElement('div');bdiv.className='cfg-fbadges';teams.slice(0,4).forEach(function(t){var isRW=t.permission==='Read & Write';var cls=t.isRG?'rg':(isRW?'rw':'ro');var shortName=t.nom.split('-').pop()||t.nom;var b=document.createElement('span');b.className='cfg-badge '+cls;b.textContent=shortName.length>10?shortName.slice(0,9)+'...':shortName;b.title=t.nom;bdiv.appendChild(b);});if(teams.length>4){var m=document.createElement('span');m.className='cfg-badge ro';m.textContent='+'+(teams.length-4);bdiv.appendChild(m);}folder.appendChild(bdiv);}
    el.appendChild(folder);
    el.addEventListener('click',function(e){e.stopPropagation();if(e.shiftKey){cfg_highlightSubtree(p.chemin);return;}cfg_toggleCard(p.chemin,el,p.x,p.y);});
    el.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation();cfg_highlightSubtree(p.chemin);});
    vp.appendChild(el);
  });
  document.getElementById('mode-config').addEventListener('click',function(e){if(!e.target.closest('.cfg-node'))cfg_clearHighlight();});
 requestAnimationFrame(function(){
    // Draw connections (DOM-based)
    cfg_drawConnections(svg, vp, positions, cfgPosMap);

    var maxX=0,maxY=0;vp.querySelectorAll('.cfg-node').forEach(function(el){var x=parseInt(el.style.left),y=parseInt(el.style.top),h=el.offsetHeight||CFG_H;maxX=Math.max(maxX,x+CFG_W+CFG_HGAP+220);maxY=Math.max(maxY,y+h+120);});svg.style.width=maxX+'px';svg.style.height=maxY+'px';
    cfg_fit();toast(cols.length+' collections · '+positions.length+' noeuds');
  });
}
function cfg_getTeams(chemin){var normC=chemin.toLowerCase().replace(/\/+$/,'').replace(/^\/+/,'');var res=[];(teamsData.teams||[]).forEach(function(t){var f=(t.collections||[]).find(function(c){var ch=typeof c==='string'?c:(c.chemin||c.nom||'');var normCh=ch.toLowerCase().replace(/\/+$/,'').replace(/^\/+/,'');return normCh===normC;});if(f)res.push({nom:t.nom,permission:(f.permission||''),isRG:false});});(roleGroupsData.roleGroups||[]).forEach(function(rg){var f=(rg.collections||[]).find(function(c){return(typeof c==='string'?c:c.chemin)===chemin;});if(f)res.push({nom:rg.nom,permission:(f.permission||''),isRG:true});});return res;}
function cfg_toggleCard(chemin,nodeEl,nx,ny){if(cfgCards[chemin]){cfgCards[chemin].remove();delete cfgCards[chemin];nodeEl.classList.remove('open');return;}nodeEl.classList.add('open');var realH=(nodeEl.querySelector('.cfg-folder')||{offsetHeight:CFG_H}).offsetHeight||CFG_H;var card=cfg_buildCard(chemin,nodeEl,nx,ny,realH);cfgCards[chemin]=card;document.getElementById('cfg-vp').appendChild(card);}
function cfg_buildCard(chemin,nodeEl,nx,ny,nodeH){var h=nodeH||CFG_H;var card=document.createElement('div');card.className='cfg-card';card.style.left=nx+'px';card.style.top=(ny+h+10)+'px';var nom=chemin.split('/').filter(Boolean).pop()||chemin;var hdr=document.createElement('div');hdr.className='cfg-card-hdr';var title=document.createElement('div');title.className='cfg-card-title';title.textContent=nom;title.title=chemin;var cls=document.createElement('button');cls.className='cfg-card-close';cls.textContent='x';cls.addEventListener('click',function(e){e.stopPropagation();card.remove();delete cfgCards[chemin];nodeEl.classList.remove('open');});hdr.appendChild(title);hdr.appendChild(cls);card.appendChild(hdr);var teams=cfg_getTeams(chemin);var sec=document.createElement('div');sec.className='cfg-sec';var st=document.createElement('div');st.className='cfg-sec-title';st.textContent=teams.length?'Acces':'';sec.appendChild(st);if(!teams.length){var e2=document.createElement('div');e2.className='cfg-empty-row';e2.textContent='Aucun acces configure';sec.appendChild(e2);}else{teams.forEach(function(t){var row=document.createElement('div');row.className='cfg-row';var dot=document.createElement('span');dot.className='cfg-dot'+(t.isRG?' rg':'');var nm=document.createElement('span');nm.className='cfg-rname';nm.textContent=t.nom;row.appendChild(dot);row.appendChild(nm);if(t.permission){var isRW=t.permission==='Read & Write';var pb=document.createElement('span');pb.className='cfg-rperm'+(isRW?' rw':'');pb.textContent=isRW?'R&W':'RO';row.appendChild(pb);}sec.appendChild(row);});}card.appendChild(sec);var sp=document.createElement('div');sp.className='cfg-sec';var spt=document.createElement('div');spt.className='cfg-sec-title';spt.textContent='Chemin';sp.appendChild(spt);var spv=document.createElement('div');spv.className='cfg-empty-row';spv.textContent=chemin;sp.appendChild(spv);card.appendChild(sp);return card;}
function cfg_toggleCards(){cfgAllOn=!cfgAllOn;document.getElementById('btn-cards').classList.toggle('on',cfgAllOn);var vp=document.getElementById('cfg-vp');if(!cfgAllOn){Object.keys(cfgCards).forEach(function(ch){cfgCards[ch].remove();delete cfgCards[ch];});vp.querySelectorAll('.cfg-node.open').forEach(function(n){n.classList.remove('open');});vp.querySelectorAll('.cfg-node').forEach(function(el){var ch=el.dataset.chemin;if(cfgPosMap[ch]){el.style.top=cfgPosMap[ch].y+'px';}});cfg_redrawConnections();return;}
  // Passe 1 : créer toutes les cartes aux positions initiales
  vp.querySelectorAll('.cfg-node').forEach(function(el){var ch=el.dataset.chemin;if(cfgCards[ch])return;var x=parseInt(el.style.left),y=parseInt(el.style.top);var fh=(el.querySelector('.cfg-folder')||{offsetHeight:CFG_H}).offsetHeight||CFG_H;el.classList.add('open');var card=cfg_buildCard(ch,el,x,y,fh);cfgCards[ch]=card;vp.appendChild(card);});
  // Passe 2 : après rendu complet, lire les vraies hauteurs et repositionner
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    var byX={};vp.querySelectorAll('.cfg-node').forEach(function(el){var x=parseInt(el.style.left);byX[x]=byX[x]||[];byX[x].push(el);});
    Object.keys(byX).sort(function(a,b){return+a-+b;}).forEach(function(x){
      var nodes=byX[x].slice().sort(function(a,b){return parseInt(a.style.top)-parseInt(b.style.top);});
      // Remettre chaque nœud à sa position initiale avant de recalculer
      nodes.forEach(function(el){var ch=el.dataset.chemin;if(cfgPosMap[ch])el.style.top=cfgPosMap[ch].y+'px';});
      for(var i=1;i<nodes.length;i++){
        var prev=nodes[i-1];
        var prevFolderH=prev.querySelector('.cfg-folder').offsetHeight||CFG_H;
        var prevCard=cfgCards[prev.dataset.chemin];
        var prevCardH=prevCard?prevCard.offsetHeight:0;
        var required=parseInt(prev.style.top)+prevFolderH+prevCardH+20;
        if(parseInt(nodes[i].style.top)<required){
          nodes[i].style.top=required+'px';
          var card=cfgCards[nodes[i].dataset.chemin];
          if(card){var folderH=nodes[i].querySelector('.cfg-folder').offsetHeight||CFG_H;card.style.top=(required+folderH+10)+'px';}
        }
      }
    });
    cfg_redrawConnections();cfg_fit();
  });});
}

// ── CFG: draw connections (DOM-based, stable) ───────────────────────────────
function cfg_drawConnections(svg, vp, positions, cfgPosMap){
  svg.innerHTML = '';

  function px(v){ return Math.round(v); }

  // ── Liens standards, DOM-based (les nœuds de niveau 0 n'ont pas de parent —
  // ce sont de vraies racines, aucun tronc/branche synthétique à dessiner) ──
  (positions || []).forEach(function(p){
    if(!p || !p.parentChemin || !cfgPosMap[p.parentChemin]) return;

    var par = cfgPosMap[p.parentChemin];
    var parEl = vp.querySelector('.cfg-node[data-chemin="'+par.chemin+'"]');
    var childEl = vp.querySelector('.cfg-node[data-chemin="'+p.chemin+'"]');
    if(!parEl || !childEl) return;

    var parLeft = parseInt(parEl.style.left) || 0;
    var parTop  = parseInt(parEl.style.top)  || 0;
    var childLeft = parseInt(childEl.style.left) || 0;
    var childTop  = parseInt(childEl.style.top)  || 0;

    var parH = (parEl.querySelector('.cfg-folder')||{offsetHeight:CFG_H}).offsetHeight || CFG_H;
    var childH = (childEl.querySelector('.cfg-folder')||{offsetHeight:CFG_H}).offsetHeight || CFG_H;

    var x1 = px(parLeft + CFG_W/2);
    var y1 = px(parTop + parH);
    var x2 = px(childLeft);
    var y2 = px(childTop + childH/2);

    var d = 'M'+x1+','+y1+' V'+y2+' H'+x2;

    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.dataset.child  = p.chemin;
    path.dataset.parent = p.parentChemin;
    svg.appendChild(path);
  });
}

function cfg_redrawConnections(){
  var svg = document.getElementById('cfg-svg');
  var vp  = document.getElementById('cfg-vp');

  // Si la fonction centralisée existe, on l’utilise (recommandé)
  if (typeof cfg_drawConnections === 'function') {
    var positions = Object.values(cfgPosMap);
    cfg_drawConnections(svg, vp, positions, cfgPosMap);
    if (cfgHiRoot) cfg_highlightSubtree(cfgHiRoot);
    return;
  }

  // Fallback minimal (évite crash si cfg_drawConnections absent)
  svg.innerHTML = '';
}

function cfg_fit(){var wrap=document.getElementById('mode-config'),vp=document.getElementById('cfg-vp');var nodes=vp.querySelectorAll('.cfg-node');if(!nodes.length)return;var maxX=0,maxY=0;nodes.forEach(function(n){var h=n.offsetHeight||CFG_H;maxX=Math.max(maxX,parseInt(n.style.left)+CFG_W+220);maxY=Math.max(maxY,parseInt(n.style.top)+h+150);});var s=Math.min((wrap.clientWidth-80)/maxX,(wrap.clientHeight-80)/maxY,1.5);CS=s;CTX=40;CTY=40;cApply();}
var cfgHiRoot=null;
function cfg_highlightSubtree(rootChemin){if(cfgHiRoot===rootChemin){cfg_clearHighlight();return;}cfg_clearHighlight();cfgHiRoot=rootChemin;var hiSet=new Set();function collect(ch){hiSet.add(ch);Object.values(cfgPosMap).forEach(function(p){if(p.parentChemin===ch)collect(p.chemin);});}collect(rootChemin);var vp=document.getElementById('cfg-vp');vp.querySelectorAll('.cfg-node').forEach(function(el){if(hiSet.has(el.dataset.chemin))el.classList.add('hi');});document.querySelectorAll('#cfg-svg path').forEach(function(path){if(hiSet.has(path.dataset.child))path.classList.add('hi');});toast(hiSet.size+' noeud'+(hiSet.size>1?'s':''));}
function cfg_clearHighlight(){cfgHiRoot=null;document.querySelectorAll('.cfg-node.hi').forEach(function(n){n.classList.remove('hi');});document.querySelectorAll('#cfg-svg path.hi').forEach(function(p){p.classList.remove('hi');});}
function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cfg_buildExportSVG(){var vp=document.getElementById('cfg-vp');var nodes=vp.querySelectorAll('.cfg-node');var cards=vp.querySelectorAll('.cfg-card');if(!nodes.length)return null;var PAD=50,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  // Utiliser cfgPosMap pour les dimensions réelles si disponible
  nodes.forEach(function(el){
    var x=parseInt(el.style.left)||0,y=parseInt(el.style.top)||0;
    // offsetHeight peut être 0 si hors viewport — utiliser getBoundingClientRect ou fallback généreux
    var folder=el.querySelector('.cfg-folder');
    var h=0;
    if(folder){h=folder.offsetHeight||folder.getBoundingClientRect().height||0;}
    if(h<=0){
      // Compter le nombre de badges pour estimer la hauteur
      var nbBadges=el.querySelectorAll('.cfg-badge').length;
      h=Math.max(CFG_H||54, 36 + Math.ceil(nbBadges/4)*18);
    }
    minX=Math.min(minX,x);minY=Math.min(minY,y-14);
    maxX=Math.max(maxX,x+CFG_W);maxY=Math.max(maxY,y+h);
  });
  cards.forEach(function(card){
    var x=parseInt(card.style.left)||0,y=parseInt(card.style.top)||0;
    var w=card.offsetWidth||card.getBoundingClientRect().width||210;
    var h=card.offsetHeight||card.getBoundingClientRect().height||140;
    minX=Math.min(minX,x);minY=Math.min(minY,y-14);
    maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h);
  });var W=maxX-minX+PAD*2,H=maxY-minY+PAD*2;function tx(v){return v-minX+PAD;}function ty(v){return v-minY+PAD;}function shiftPath(d){return d.replace(/([MLHV])\s*(-?\d+\.?\d*)/g,function(_,cmd,val){val=parseFloat(val);if(cmd==='H')return'H'+(val-minX+PAD);if(cmd==='V')return'V'+(val-minY+PAD);return cmd+val;}).replace(/([ML])\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/g,function(_,cmd,a,b){return cmd+(parseFloat(a)-minX+PAD)+','+(parseFloat(b)-minY+PAD);});}var lines=[];lines.push('<?xml version="1.0" encoding="UTF-8"?>');lines.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">');lines.push('<rect width="'+W+'" height="'+H+'" fill="#0d0d0d"/>');lines.push('<style>text{font-family:"Courier New",monospace;dominant-baseline:auto;}</style>');var cfgSvg=document.getElementById('cfg-svg');cfgSvg.querySelectorAll('path').forEach(function(path){var d=path.getAttribute('d');if(!d)return;var stroke=path.classList.contains('hi')?'#C8D100':'#aaaaaa';lines.push('<path d="'+shiftPath(d)+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>');});nodes.forEach(function(el){var nx=tx(parseInt(el.style.left)||0),ny=ty(parseInt(el.style.top)||0);var folder=el.querySelector('.cfg-folder');var h=folder?(folder.offsetHeight||54):54;var isHi=el.classList.contains('hi');var bc=isHi?'#C8D100':'#888888';var TAB_W=Math.round(CFG_W*0.58),TAB_H=11;lines.push('<path d="M'+(nx+4)+','+(ny-TAB_H+4)+' Q'+(nx+4)+','+(ny-TAB_H)+' '+(nx+8)+','+(ny-TAB_H)+' H'+(nx+TAB_W-4)+' Q'+(nx+TAB_W)+','+(ny-TAB_H)+' '+(nx+TAB_W)+','+(ny-TAB_H+4)+' V'+ny+' H'+nx+' V'+(ny-TAB_H+4)+' Z" fill="#111111" stroke="'+bc+'" stroke-width="1.5"/>');lines.push('<rect x="'+(nx+1)+'" y="'+(ny-1)+'" width="'+(TAB_W-2)+'" height="3" fill="#111111"/>');lines.push('<path d="M'+nx+','+ny+' H'+(nx+CFG_W-6)+' Q'+(nx+CFG_W)+','+ny+' '+(nx+CFG_W)+','+(ny+6)+' V'+(ny+h-6)+' Q'+(nx+CFG_W)+','+(ny+h)+' '+(nx+CFG_W-6)+','+(ny+h)+' H'+(nx+6)+' Q'+nx+','+(ny+h)+' '+nx+','+(ny+h-6)+' V'+ny+' Z" fill="#111111" stroke="'+bc+'" stroke-width="1.5"/>');var label=(el.querySelector('.cfg-fname')||{textContent:''}).textContent;lines.push('<text x="'+(nx+10)+'" y="'+(ny+16)+'" font-size="11" font-weight="bold" fill="#d0d0d0">'+_esc(label)+'</text>');var bx=nx+8,by=ny+26;el.querySelectorAll('.cfg-badge').forEach(function(b){var txt=b.textContent;if(!txt)return;var w=Math.max(txt.length*6+10,20);if(bx+w>nx+CFG_W-4)return;var isRW=b.classList.contains('rw'),isRG=b.classList.contains('rg');var bg=isRG?'#2a1a36':isRW?'#0d3320':'#0d1f33';var fg=isRG?'#9b59b6':isRW?'#0DB852':'#2E75B6';lines.push('<rect x="'+bx+'" y="'+by+'" width="'+w+'" height="13" rx="2" fill="'+bg+'" stroke="'+fg+'" stroke-width="0.8"/>');lines.push('<text x="'+(bx+5)+'" y="'+(by+10)+'" font-size="8" font-weight="bold" fill="'+fg+'">'+_esc(txt)+'</text>');bx+=w+4;});});lines.push('</svg>');return lines.join('\n');}
function cfg_exportSVG(){var svg=cfg_buildExportSVG();if(!svg){toast('Aucune donnee');return;}var blob=new Blob([svg],{type:'image/svg+xml'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='arborescence.svg';a.click();toast('SVG exporte');}
function cfg_exportPNG(){
  var svgStr=cfg_buildExportSVG();
  if(!svgStr)return;
  var a=document.createElement('a');
  a.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  a.download='arborescence.svg';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('Export SVG (ouvrir dans Inkscape/Illustrator pour convertir en PNG)');
}
function dsn_exportExcel(){
  if (!window.askidaExportExcel) { toast('Export Excel indisponible'); return; }
  // TODO: remplir "rows" plus tard avec les chemins du Designer (dBuildPaths, etc.)
  const rows = [];
  window.askidaExportExcel(rows, {
    fileName:  'viewer-designer.xlsx',
    sheetName: 'Designer',
    tableName: 'T_DESIGNER',
    tableStyle:'TableStyleMedium9'
  });
}

// ── DESIGNER
var DS=1,DTX=60,DTY=60;
var dNodes=[],dEdges=[],dNextId=1;
var dSel=null,dDragNode=null,dDragSX=0,dDragSY=0,dDragX0=0,dDragY0=0;
var dPan=false,dPanSX=0,dPanSY=0,dPanTX=0,dPanTY=0;
var dConnFrom=null;
var dHistory=[],dHistIdx=-1;
var DSN_W=150,DSN_H=88;
var dLasso=false,dLassoX0=0,dLassoY0=0,dLassoSel=[];

document.addEventListener('DOMContentLoaded',function(){
  var wrap=document.getElementById('mode-designer');
  var connSvg=document.getElementById('conn-svg');
  var lel=document.getElementById('dsn-lasso');
  wrap.addEventListener('wheel',function(e){e.preventDefault();var d=e.deltaY>0?-.1:.1,r=wrap.getBoundingClientRect();var mx=e.clientX-r.left,my=e.clientY-r.top;var ns=Math.min(4,Math.max(.15,DS+d));DTX=mx-(mx-DTX)*(ns/DS);DTY=my-(my-DTY)*(ns/DS);DS=ns;dApply();},{passive:false});
  wrap.addEventListener('mousedown',function(e){if(e.target.closest('.dsn-node')||e.target.closest('#dsn-export'))return;if(dConnFrom){dCancelConn();return;}if(e.button!==0)return;if(e.shiftKey){var r=wrap.getBoundingClientRect();dLasso=true;dLassoX0=(e.clientX-r.left-DTX)/DS;dLassoY0=(e.clientY-r.top-DTY)/DS;dLassoSel=[];lel.classList.remove('hidden');lel.style.left=dLassoX0+'px';lel.style.top=dLassoY0+'px';lel.style.width='0';lel.style.height='0';e.preventDefault();return;}
    dPan=true;dPanSX=e.clientX;dPanSY=e.clientY;dPanTX=DTX;dPanTY=DTY;e.preventDefault();});
  document.addEventListener('mousemove',function(e){
    if(dPan){DTX=dPanTX+(e.clientX-dPanSX);DTY=dPanTY+(e.clientY-dPanSY);dApply();}
    if(dLasso){var r=wrap.getBoundingClientRect();var cx=(e.clientX-r.left-DTX)/DS,cy=(e.clientY-r.top-DTY)/DS;var lx=Math.min(cx,dLassoX0),ly=Math.min(cy,dLassoY0),lw=Math.abs(cx-dLassoX0),lh=Math.abs(cy-dLassoY0);lel.style.left=lx+'px';lel.style.top=ly+'px';lel.style.width=lw+'px';lel.style.height=lh+'px';dLassoSel=[];document.querySelectorAll('.dsn-node.lasso-sel').forEach(function(n){n.classList.remove('lasso-sel');});dNodes.forEach(function(n){if(n.x+DSN_W>lx&&n.x<lx+lw&&n.y+DSN_H>ly&&n.y<ly+lh){dLassoSel.push(n.id);var el=document.getElementById('dn-'+n.id);if(el)el.classList.add('lasso-sel');}});}
    if(dDragNode){var dx=(e.clientX-dDragSX)/DS,dy=(e.clientY-dDragSY)/DS;var nx=dDragX0+dx,ny=dDragY0+dy,SNAP=6,snapX=null,snapY=null;document.querySelectorAll('.dsn-node.snap-target').forEach(function(n){n.classList.remove('snap-target');});dNodes.forEach(function(other){if(other.id===dDragNode.id)return;var snapCandidatesX=[other.x,other.x+DSN_W];var snapCandidatesY=[other.y,other.y+DSN_H,other.y+DSN_H/2];var matched=false;snapCandidatesX.forEach(function(v){if(Math.abs(nx-v)<SNAP){snapX=v;matched=true;}});snapCandidatesY.forEach(function(v){if(Math.abs(ny-v)<SNAP){snapY=v;matched=true;}});if(matched){var oEl=document.getElementById('dn-'+other.id);if(oEl)oEl.classList.add('snap-target');}});dDragNode.x=snapX!==null?snapX:nx;dDragNode.y=snapY!==null?snapY:ny;var el=document.getElementById('dn-'+dDragNode.id);if(el){el.style.left=dDragNode.x+'px';el.style.top=dDragNode.y+'px';}dRedrawEdgesDrag();}
    if(dConnFrom){
      document.querySelectorAll('.dsn-node.conn-target').forEach(function(n){n.classList.remove('conn-target');});
      var fromEl=document.getElementById('dn-'+dConnFrom.id);var snapPort=null;var HIT=24;
      dNodes.forEach(function(other){if(other.id===dConnFrom.id)return;var oEl=document.getElementById('dn-'+other.id);if(!oEl)return;var oFolder=oEl.querySelector('.dsn-folder')||oEl;var or=oFolder.getBoundingClientRect();var cx=(or.left+or.right)/2,cy=(or.top+or.bottom)/2;var sides=[{side:'left',px:or.left,py:cy,test:Math.abs(e.clientX-or.left)<HIT&&e.clientY>or.top-HIT&&e.clientY<or.bottom+HIT},{side:'right',px:or.right,py:cy,test:Math.abs(e.clientX-or.right)<HIT&&e.clientY>or.top-HIT&&e.clientY<or.bottom+HIT},{side:'top',px:cx,py:or.top,test:Math.abs(e.clientY-or.top)<HIT&&e.clientX>or.left-HIT&&e.clientX<or.right+HIT},{side:'bottom',px:cx,py:or.bottom,test:Math.abs(e.clientY-or.bottom)<HIT&&e.clientX>or.left-HIT&&e.clientX<or.right+HIT}];var hit=null,bestDist=Infinity;sides.forEach(function(s){if(!s.test)return;var d=Math.hypot(e.clientX-s.px,e.clientY-s.py);if(d<bestDist){bestDist=d;hit=s;}});if(hit){oEl.classList.add('conn-target');snapPort={id:other.id,side:hit.side,px:hit.px,py:hit.py};}});
      if(fromEl){var fp=dPortPos(fromEl,dConnFrom.side);var tx2=snapPort?snapPort.px:e.clientX;var ty2=snapPort?snapPort.py:e.clientY;var path2=dOrthoScreenPath(fp.x,fp.y,tx2,ty2,dConnFrom.side,snapPort?snapPort.side:null);connSvg.classList.remove('hidden');connSvg.innerHTML='<path d="'+path2+'" fill="none" stroke="#00d4aa" stroke-width="2" stroke-dasharray="5 3"/>';dConnFrom._snapPort=snapPort||null;}
    }
  });
  document.addEventListener('mouseup',function(e){
    document.querySelectorAll('.dsn-node.snap-target').forEach(function(n){n.classList.remove('snap-target');});
    document.querySelectorAll('.dsn-node.conn-target').forEach(function(n){n.classList.remove('conn-target');});
    if(dConnFrom){
      var sp=dConnFrom._snapPort;
      if(sp){dFinishConn(sp.id,sp.side);}
      else{
        var hit=null;
        dNodes.forEach(function(other){if(other.id===dConnFrom.id)return;var oEl=document.getElementById('dn-'+other.id);if(!oEl)return;var oFolder=oEl.querySelector('.dsn-folder')||oEl;var or=oFolder.getBoundingClientRect();if(e.clientX>=or.left&&e.clientX<=or.right&&e.clientY>=or.top&&e.clientY<=or.bottom){var dL=Math.abs(e.clientX-or.left),dR=Math.abs(e.clientX-or.right),dT=Math.abs(e.clientY-or.top),dB=Math.abs(e.clientY-or.bottom);var m=Math.min(dL,dR,dT,dB);hit={id:other.id,side:m===dL?'left':m===dR?'right':m===dT?'top':'bottom'};}});
        if(hit){dFinishConn(hit.id,hit.side);}else{dCancelConn();}
      }
      return;
    }
    dPan=false;dDragNode=null;
    if(dLasso){dLasso=false;lel.classList.add('hidden');if(dLassoSel.length)toast(dLassoSel.length+' noeud'+(dLassoSel.length>1?'s':'')+' selectionne'+(dLassoSel.length>1?'s':'')+' · Suppr pour supprimer');}
  });
  document.addEventListener('keydown',function(e){if(curMode!=='designer')return;var active=document.activeElement;if(['INPUT','TEXTAREA'].includes(active.tagName)||active.contentEditable==='true')return;if(e.key==='Delete'||e.key==='Backspace'){if(dLassoSel.length){dDeleteNodes(dLassoSel);}else if(dSel!==null){dDeleteNode(dSel);}}if(e.ctrlKey&&e.key==='z'){e.preventDefault();dsn_undo();}if(e.ctrlKey&&(e.key==='y'||(e.shiftKey&&e.key==='Z'))){e.preventDefault();dsn_redo();}if(e.ctrlKey&&e.key==='d'){e.preventDefault();if(dSel!==null)dDuplicate(dSel);}if(e.key==='Escape'){dCancelConn();dSel=null;dLassoSel=[];document.querySelectorAll('.dsn-node.selected,.dsn-node.lasso-sel').forEach(function(n){n.classList.remove('selected','lasso-sel');});lel.classList.add('hidden');}});
});

function dApply(){document.getElementById('dsn-vp').style.transform='translate('+DTX+'px,'+DTY+'px) scale('+DS+')';document.getElementById('dsn-zlbl').textContent=Math.round(DS*100)+'%';}
function dSnapshot(){var state=JSON.stringify({nodes:dNodes,edges:dEdges,nextId:dNextId});dHistory=dHistory.slice(0,dHistIdx+1);dHistory.push(state);if(dHistory.length>50)dHistory.shift();dHistIdx=dHistory.length-1;}
function dsn_undo(){if(dHistIdx<=0){toast('Rien a annuler');return;}dHistIdx--;var st=JSON.parse(dHistory[dHistIdx]);dNodes=st.nodes;dEdges=st.edges;dNextId=st.nextId;dFullRedraw();toast('Annule');}
function dsn_redo(){if(dHistIdx>=dHistory.length-1){toast('Rien a retablir');return;}dHistIdx++;var st=JSON.parse(dHistory[dHistIdx]);dNodes=st.nodes;dEdges=st.edges;dNextId=st.nextId;dFullRedraw();toast('Retabli');}
function dFullRedraw(){var vp=document.getElementById('dsn-vp');Array.from(vp.children).forEach(function(c){if(c.tagName!=='svg')c.remove();});document.getElementById('dsn-svg').innerHTML='';dNodes.forEach(function(n){dRenderNode(n);});dRedrawEdges();dUpdateExport();}
function dsn_addRoot(){dSnapshot();var id=dNextId++;var maxY=40;dNodes.forEach(function(n){maxY=Math.max(maxY,n.y+DSN_H+30);});dNodes.push({id:id,label:'Dossier '+id,x:60,y:maxY,color:null});dRenderNode(dNodes[dNodes.length-1]);dRedrawEdges();dUpdateExport();setTimeout(function(){dStartRename(id);},80);}
function dAddChild(parentId){dSnapshot();var par=dNodes.find(function(n){return n.id===parentId;});if(!par)return;var id=dNextId++;var siblings=dEdges.filter(function(e){return e.from===parentId;});var x=par.x+DSN_W+80,y;if(siblings.length===0){y=par.y;}else{var lastSibId=siblings[siblings.length-1].to;var lastSib=dNodes.find(function(n){return n.id===lastSibId;});y=lastSib?(lastSib.y+DSN_H+20):par.y+(siblings.length*(DSN_H+20));}dNodes.push({id:id,label:'Dossier '+id,x:x,y:y,color:null});dEdges.push({from:parentId,to:id,fromSide:'right',toSide:'left'});dRenderNode(dNodes[dNodes.length-1]);dRedrawEdges();dUpdateExport();setTimeout(function(){dStartRename(id);},80);}
function dDuplicate(id){dSnapshot();var src=dNodes.find(function(n){return n.id===id;});if(!src)return;var nid=dNextId++;dNodes.push({id:nid,label:src.label+' (copie)',x:src.x+30,y:src.y+30,color:src.color});function dupEdges(fromOld,fromNew){dEdges.filter(function(e){return e.from===fromOld;}).forEach(function(e){var childSrc=dNodes.find(function(n){return n.id===e.to;});if(!childSrc)return;var newChild=dNextId++;dNodes.push({id:newChild,label:childSrc.label,x:childSrc.x+30,y:childSrc.y+30,color:childSrc.color});dEdges.push({from:fromNew,to:newChild});dupEdges(e.to,newChild);});}var parentEdge=dEdges.find(function(e){return e.to===id;});if(parentEdge)dEdges.push({from:parentEdge.from,to:nid});dupEdges(id,nid);dFullRedraw();toast('Duplique');}
function dDepth(id){var d=0,cur=id;for(var i=0;i<30;i++){var e=dEdges.find(function(e){return e.to===cur;});if(!e)break;cur=e.from;d++;}return d;}
var DEPTH_COLORS=['#00d4aa','#C8D100','#f39c12','#e84393','#9b59b6','#3498db'];

function dRenderNode(node){
  var vp=document.getElementById('dsn-vp');var depth=dDepth(node.id);var color=DEPTH_COLORS[depth%DEPTH_COLORS.length];
  var el=document.createElement('div');el.className='dsn-node';el.id='dn-'+node.id;el.dataset.id=node.id;el.style.left=node.x+'px';el.style.top=node.y+'px';
  var folder=document.createElement('div');folder.className='dsn-folder';folder.style.setProperty('--tab-color',color);
  var label=document.createElement('div');label.className='dsn-label';label.textContent=node.label;label.title=node.label;label.addEventListener('dblclick',function(e){e.stopPropagation();dStartRename(node.id);});folder.appendChild(label);
  var dep=document.createElement('div');dep.className='dsn-depth';dep.id='ddep-'+node.id;dep.textContent='Niveau '+depth;folder.appendChild(dep);
  var acts=document.createElement('div');acts.className='dsn-actions';
  var btnAdd=document.createElement('button');btnAdd.className='dsn-act add';btnAdd.textContent='+';btnAdd.title='Ajouter enfant';btnAdd.addEventListener('click',function(e){e.stopPropagation();dAddChild(node.id);});
  var btnDup=document.createElement('button');btnDup.className='dsn-act dup';btnDup.textContent='[]';btnDup.title='Dupliquer';btnDup.addEventListener('click',function(e){e.stopPropagation();dDuplicate(node.id);});
  var btnDel=document.createElement('button');btnDel.className='dsn-act del';btnDel.textContent='x';btnDel.title='Supprimer';btnDel.addEventListener('click',function(e){e.stopPropagation();dDeleteNode(node.id);});
  acts.appendChild(btnAdd);acts.appendChild(btnDup);acts.appendChild(btnDel);el.appendChild(acts);el.appendChild(folder);
  // Ports — attachés au folder
  ['top','right','bottom','left'].forEach(function(side){
    var port=document.createElement('div');port.className='dsn-port '+side;port.title='Tirer pour connecter';
    port.addEventListener('mousedown',function(e){e.stopPropagation();e.preventDefault();dStartConn(node.id,side);});
    folder.appendChild(port);
  });
  folder.addEventListener('mousedown',function(e){if(e.target.closest('.dsn-port')||e.target.closest('.dsn-act'))return;if(e.target.classList.contains('dsn-label')&&e.target.contentEditable==='true')return;if(dConnFrom)return;if(e.button!==0)return;e.preventDefault();dSel=node.id;document.querySelectorAll('.dsn-node.selected').forEach(function(n){n.classList.remove('selected');});el.classList.add('selected');dDragNode=node;dDragSX=e.clientX;dDragSY=e.clientY;dDragX0=node.x;dDragY0=node.y;});
  folder.addEventListener('mouseup',function(){if(dDragNode&&dDragNode.id===node.id){if(Math.abs(node.x-dDragX0)>3||Math.abs(node.y-dDragY0)>3){dSnapshot();}}});
  vp.appendChild(el);
}

function dStartConn(id,side){dConnFrom={id:id,side:side};document.getElementById('conn-svg').classList.remove('hidden');toast('Port arrivee ou Echap pour annuler');}
function dCancelConn(){dConnFrom=null;document.getElementById('conn-svg').classList.add('hidden');document.getElementById('conn-svg').innerHTML='';}
function dFinishConn(toId,toSide){if(!dConnFrom)return;var fromId=dConnFrom.id,fromSide=dConnFrom.side;dCancelConn();if(fromId===toId)return;dEdges=dEdges.filter(function(e){return e.to!==toId;});dEdges.push({from:fromId,to:toId,fromSide:fromSide,toSide:toSide});dSnapshot();dFullRedraw();toast('Lien cree');}

// Coords écran du port (pour la ligne live)
function dPortPos(el,side){var folderEl=el.querySelector('.dsn-folder')||el;var r=folderEl.getBoundingClientRect();var cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;if(side==='top')return{x:cx,y:r.top};if(side==='bottom')return{x:cx,y:r.bottom};if(side==='left')return{x:r.left,y:cy};if(side==='right')return{x:r.right,y:cy};return{x:cx,y:cy};}


function dOrthoScreenPath(x1,y1,x2,y2,fromSide,toSide){
  var isHFrom=(fromSide==='left'||fromSide==='right');
  if(isHFrom){
    var mx=(x1+x2)/2;
    return'M'+x1+','+y1+' H'+mx+' V'+y2+' H'+x2;
  } else {
    return'M'+x1+','+y1+' V'+y2+' H'+x2;
  }
}

function dOrthoPath(x1,y1,x2,y2,fromSide,toSide){
  var isHFrom=(fromSide==='left'||fromSide==='right');
  if(isHFrom){
    // Sortie H : coude au milieu X
    var mx=(x1+x2)/2;
    return'M'+x1+','+y1+' H'+mx+' V'+y2+' H'+x2;
  } else {
    // Sortie V (bottom/top) : d'abord V jusqu'à y2 (niveau d'arrivée), puis H jusqu'à x2
    return'M'+x1+','+y1+' V'+y2+' H'+x2;
  }
}

// Coords port via DOM réel (après repaint — pour affichage final)
function dNodePortCoords(node,side){
  var el=document.getElementById('dn-'+node.id);
  var folderEl=el?el.querySelector('.dsn-folder'):null;
  var h=folderEl&&folderEl.offsetHeight>0?folderEl.offsetHeight:DSN_H;
  var w=folderEl&&folderEl.offsetWidth>0?folderEl.offsetWidth:DSN_W;
  return{x:node.x+(side==='right'?w:side==='left'?0:w/2),y:node.y+(side==='bottom'?h:side==='top'?0:h/2)};
}
// Coords port via constantes (pendant le drag, sans lecture DOM)
function dNodePortCoordsCalc(node,side){
  return{x:node.x+(side==='right'?DSN_W:side==='left'?0:DSN_W/2),y:node.y+(side==='bottom'?DSN_H:side==='top'?0:DSN_H/2)};
}
// Redessine via DOM réel dans un rAF (après repaint complet)
function dRedrawEdges(){
  requestAnimationFrame(function(){
    var svg=document.getElementById('dsn-svg');svg.innerHTML='';var maxX=100,maxY=100;
    dEdges.forEach(function(edge){
      var fromNode=dNodes.find(function(n){return n.id===edge.from;});
      var toNode=dNodes.find(function(n){return n.id===edge.to;});
      if(!fromNode||!toNode)return;
      var fSide=edge.fromSide||'right',tSide=edge.toSide||'left';
      var p1=dNodePortCoords(fromNode,fSide);
      var p2=dNodePortCoords(toNode,tSide);
      var d=dOrthoPath(p1.x,p1.y,p2.x,p2.y,fSide,tSide);
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path);
      maxX=Math.max(maxX,p1.x+50,p2.x+50);maxY=Math.max(maxY,p1.y+50,p2.y+50);
    });
    dNodes.forEach(function(n){maxX=Math.max(maxX,n.x+DSN_W+80);maxY=Math.max(maxY,n.y+DSN_H+80);});
    svg.style.width=maxX+'px';svg.style.height=maxY+'px';
  });
}
// Redessine via calcul pur pendant le drag (pas de lecture DOM)
function dRedrawEdgesDrag(){
  var svg=document.getElementById('dsn-svg');svg.innerHTML='';var maxX=100,maxY=100;
  dEdges.forEach(function(edge){
    var fromNode=dNodes.find(function(n){return n.id===edge.from;});
    var toNode=dNodes.find(function(n){return n.id===edge.to;});
    if(!fromNode||!toNode)return;
    var fSide=edge.fromSide||'right',tSide=edge.toSide||'left';
    var p1=dNodePortCoordsCalc(fromNode,fSide);
    var p2=dNodePortCoordsCalc(toNode,tSide);
    var d=dOrthoPath(p1.x,p1.y,p2.x,p2.y,fSide,tSide);
    var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path);
    maxX=Math.max(maxX,p1.x+50,p2.x+50);maxY=Math.max(maxY,p1.y+50,p2.y+50);
  });
  dNodes.forEach(function(n){maxX=Math.max(maxX,n.x+DSN_W+80);maxY=Math.max(maxY,n.y+DSN_H+80);});
  svg.style.width=maxX+'px';svg.style.height=maxY+'px';
}

function dDeleteNode(id){dSnapshot();dNodes=dNodes.filter(function(n){return n.id!==id;});dEdges=dEdges.filter(function(e){return e.from!==id&&e.to!==id;});var el=document.getElementById('dn-'+id);if(el)el.remove();if(dSel===id)dSel=null;dRedrawEdges();dUpdateExport();}
function dDeleteNodes(ids){if(!ids.length)return;dSnapshot();ids.forEach(function(id){dNodes=dNodes.filter(function(n){return n.id!==id;});dEdges=dEdges.filter(function(e){return e.from!==id&&e.to!==id;});var el=document.getElementById('dn-'+id);if(el)el.remove();if(dSel===id)dSel=null;});dLassoSel=[];dRedrawEdges();dUpdateExport();toast(ids.length+' noeud'+(ids.length>1?'s':'')+' supprime'+(ids.length>1?'s':''));}
function dStartRename(id){var el=document.getElementById('dn-'+id);if(!el)return;var lbl=el.querySelector('.dsn-label');lbl.contentEditable='true';lbl.focus();var range=document.createRange();range.selectNodeContents(lbl);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);function done(){lbl.contentEditable='false';var node=dNodes.find(function(n){return n.id===id;});if(node){node.label=(lbl.textContent||'').trim()||node.label;lbl.textContent=node.label;}dSnapshot();dUpdateExport();}lbl.addEventListener('blur',done,{once:true});lbl.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();lbl.blur();}if(e.key==='Escape'){lbl.blur();}e.stopPropagation();});}
function dBuildPaths(){var paths=[];function build(id,prefix){var node=dNodes.find(function(n){return n.id===id;});if(!node)return;var p=prefix+'/'+node.label;paths.push(p+'/');dEdges.filter(function(e){return e.from===id;}).forEach(function(e){build(e.to,p);});}var childIds=dEdges.map(function(e){return e.to;});dNodes.filter(function(n){return!childIds.includes(n.id);}).forEach(function(root){build(root.id,'');});return paths;}
function dUpdateExport(){var paths=dBuildPaths();var panel=document.getElementById('dsn-export');var prev=document.getElementById('dsn-preview');if(!paths.length){panel.classList.add('hidden');return;}panel.classList.remove('hidden');prev.innerHTML=paths.map(function(p){return'<div class="dsn-preview-path">'+p+'</div>';}).join('');}
function dsn_showExport(){var paths=dBuildPaths();if(!paths.length){toast('Dessinez une arborescence');return;}var panel=document.getElementById('dsn-export');panel.classList.toggle('hidden');}
async function dsn_doImport(){var paths=dBuildPaths();if(!paths.length)return;await loadData();var existingPaths=visGetColPaths();var existing=collectionsData.collections||[];var added=0;paths.forEach(function(p){if(!existingPaths.includes(p)){existing.push(p);existingPaths.push(p);added++;}});collectionsData.collections=existing;localStorage.setItem('collectionsData',JSON.stringify(collectionsData));document.getElementById('dsn-export').classList.add('hidden');toast(added+' collection'+(added>1?'s':'')+' importee');}
function dsn_clear(){dSnapshot();dNodes=[];dEdges=[];dSel=null;var vp=document.getElementById('dsn-vp');Array.from(vp.children).forEach(function(c){if(c.tagName!=='svg')c.remove();});document.getElementById('dsn-svg').innerHTML='';document.getElementById('dsn-export').classList.add('hidden');toast('Designer vide');}
function dsn_fit(){var wrap=document.getElementById('mode-designer');if(!dNodes.length)return;var maxX=0,maxY=0;dNodes.forEach(function(n){maxX=Math.max(maxX,n.x+DSN_W);maxY=Math.max(maxY,n.y+DSN_H);});var s=Math.min((wrap.clientWidth-80)/maxX,(wrap.clientHeight-80)/maxY,2);DS=s;DTX=40;DTY=40;dApply();}
function dsn_zoom(d){var wrap=document.getElementById('mode-designer'),cx=wrap.clientWidth/2,cy=wrap.clientHeight/2;var ns=Math.min(4,Math.max(.15,DS+d));DTX=cx-(cx-DTX)*(ns/DS);DTY=cy-(cy-DTY)*(ns/DS);DS=ns;dApply();}
function dsn_equidist(){if(dNodes.length<2){toast('Besoin 2+ noeuds');return;}dSnapshot();var cols=[];dNodes.forEach(function(n){var col=cols.find(function(c){return Math.abs(c.x-n.x)<20;});if(col){col.nodes.push(n);}else{cols.push({x:n.x,nodes:[n]});}});var changed=false;cols.forEach(function(col){if(col.nodes.length<2)return;var sorted=col.nodes.slice().sort(function(a,b){return a.y-b.y;});var gap=Math.round((sorted[sorted.length-1].y-sorted[0].y)/(sorted.length-1));gap=Math.max(gap,DSN_H+20);sorted.forEach(function(n,i){n.y=sorted[0].y+i*gap;var el=document.getElementById('dn-'+n.id);if(el){el.style.top=n.y+'px';}changed=true;});});var rows=[];dNodes.forEach(function(n){var row=rows.find(function(r){return Math.abs(r.y-n.y)<20;});if(row){row.nodes.push(n);}else{rows.push({y:n.y,nodes:[n]});}});rows.forEach(function(row){if(row.nodes.length<2)return;var sorted=row.nodes.slice().sort(function(a,b){return a.x-b.x;});var gap=Math.round((sorted[sorted.length-1].x-sorted[0].x)/(sorted.length-1));gap=Math.max(gap,DSN_W+30);sorted.forEach(function(n,i){n.x=sorted[0].x+i*gap;var el=document.getElementById('dn-'+n.id);if(el){el.style.left=n.x+'px';}changed=true;});});if(changed){dRedrawEdges();dSnapshot();toast('Equidistance appliquee');}}
function dsn_buildSVG(){if(!dNodes.length)return null;var PAD=50,TAB_H=14;var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;dNodes.forEach(function(n){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y-TAB_H-2);maxX=Math.max(maxX,n.x+DSN_W);maxY=Math.max(maxY,n.y+DSN_H);});var W=maxX-minX+PAD*2,H=maxY-minY+PAD*2;function ox(v){return Math.round(v-minX+PAD);}function oy(v){return Math.round(v-minY+PAD);}var DC=['#00d4aa','#C8D100','#f39c12','#e84393','#9b59b6','#3498db'];function dDepthOf(id){var d=0,cur=id;for(var i=0;i<30;i++){var e=dEdges.find(function(e){return e.to===cur;});if(!e)break;cur=e.from;d++;}return d;}function shiftOP(d){return d.replace(/M(-?\d+\.?\d*),(-?\d+\.?\d*)/g,function(_,a,b){return'M'+ox(+a)+','+oy(+b);}).replace(/H(-?\d+\.?\d*)/g,function(_,a){return'H'+ox(+a);}).replace(/V(-?\d+\.?\d*)/g,function(_,a){return'V'+oy(+a);}).replace(/L(-?\d+\.?\d*),(-?\d+\.?\d*)/g,function(_,a,b){return'L'+ox(+a)+','+oy(+b);});}var lines=[];lines.push('<?xml version="1.0" encoding="UTF-8"?>');lines.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">');lines.push('<rect width="'+W+'" height="'+H+'" fill="#0d0d0d"/>');lines.push('<style>text{font-family:"Courier New",monospace;}</style>');dEdges.forEach(function(edge){var from=dNodes.find(function(n){return n.id===edge.from;});var to=dNodes.find(function(n){return n.id===edge.to;});if(!from||!to)return;var fSide=edge.fromSide||'right',tSide=edge.toSide||'left';function pX(n,s){return n.x+(s==='right'?DSN_W:s==='left'?0:DSN_W/2);}function pY(n,s){return n.y+(s==='bottom'?DSN_H:s==='top'?0:DSN_H/2);}lines.push('<path d="'+shiftOP(dOrthoPath(pX(from,fSide),pY(from,fSide),pX(to,tSide),pY(to,tSide),fSide,tSide))+'" fill="none" stroke="#ffffff" stroke-width="1.5"/>');});dNodes.forEach(function(node){var depth=dDepthOf(node.id);var color=DC[depth%DC.length];var nx=ox(node.x),ny=oy(node.y);var TAB_W=Math.round(DSN_W*0.52);lines.push('<path d="M'+(nx+4)+','+(ny-TAB_H+4)+' Q'+(nx+4)+','+(ny-TAB_H)+' '+(nx+8)+','+(ny-TAB_H)+' H'+(nx+TAB_W-4)+' Q'+(nx+TAB_W)+','+(ny-TAB_H)+' '+(nx+TAB_W)+','+(ny-TAB_H+4)+' V'+ny+' H'+nx+' V'+(ny-TAB_H+4)+' Z" fill="#111" stroke="'+color+'" stroke-width="1.5"/>');lines.push('<rect x="'+(nx+1)+'" y="'+(ny-1)+'" width="'+(TAB_W-2)+'" height="3" fill="#111"/>');lines.push('<path d="M'+nx+','+ny+' H'+(nx+DSN_W-6)+' Q'+(nx+DSN_W)+','+ny+' '+(nx+DSN_W)+','+(ny+6)+' V'+(ny+DSN_H-6)+' Q'+(nx+DSN_W)+','+(ny+DSN_H)+' '+(nx+DSN_W-6)+','+(ny+DSN_H)+' H'+(nx+6)+' Q'+nx+','+(ny+DSN_H)+' '+nx+','+(ny+DSN_H-6)+' V'+ny+' Z" fill="#111" stroke="'+color+'" stroke-width="1.5"/>');lines.push('<rect x="'+nx+'" y="'+ny+'" width="4" height="'+DSN_H+'" fill="'+color+'"/>');lines.push('<text x="'+(nx+12)+'" y="'+(ny+DSN_H/2-4)+'" font-size="11" font-weight="bold" fill="#d0d0d0">'+_esc(node.label)+'</text>');lines.push('<text x="'+(nx+12)+'" y="'+(ny+DSN_H/2+10)+'" font-size="9" fill="#666">Niveau '+depth+'</text>');});lines.push('</svg>');return lines.join('\n');}
function dsn_exportSVG(){var svg=dsn_buildSVG();if(!svg){toast('Aucun noeud');return;}var blob=new Blob([svg],{type:'image/svg+xml'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='designer.svg';a.click();toast('SVG exporte');}
function dsn_exportPNG(){
  var svgStr=dsn_buildSVG();
  if(!svgStr)return;
  var a=document.createElement('a');
  a.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  a.download='designer.svg';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('Export SVG (ouvrir dans Inkscape/Illustrator pour convertir en PNG)');
function dsn_save() {
  if (!dNodes.length) { toast('Rien à sauvegarder'); return; }
  var draft = { nodes: dNodes, edges: dEdges, nextId: dNextId };
  localStorage.setItem('dsnDraft', JSON.stringify(draft));
  var d = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  toast('\u2713 Brouillon sauvegardé à ' + d);
}

function dsn_loadDraft() {
  var raw = localStorage.getItem('dsnDraft');
  if (!raw) { toast('Aucun brouillon'); return; }
  var draft = JSON.parse(raw);
  dSnapshot();
  dNodes = draft.nodes || [];
  dEdges = draft.edges || [];
  dNextId = draft.nextId || 1;
  dFullRedraw();
  toast('\u2713 Brouillon restauré — ' + dNodes.length + ' nœuds');
}

function dsn_checkDraft() {
  var raw = localStorage.getItem('dsnDraft');
  var btn = document.getElementById('btn-dsn-load');
  if (btn) btn.classList.toggle('hidden', !raw);
} 
}
function dsn_exportExcel(){
  if (!window.askidaExportExcel){ toast('Export Excel indisponible'); return; }
  const rows = []; // À compléter ultérieurement
  window.askidaExportExcel(rows, {
    fileName: 'viewer-designer.xlsx',
    sheetName: 'Designer',
    tableName: 'T_DESIGNER',
    tableStyle: 'TableStyleMedium9'
  });
}
