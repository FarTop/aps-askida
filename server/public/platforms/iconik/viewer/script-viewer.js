var collectionsData={collections:[]},teamsData={teams:[]},roleGroupsData={roleGroups:[]},categoriesData={categories:[]};

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

// Résout un ID de collection Iconik vers son chemin complet (même format que
// visGetColPaths : '/Parent/Enfant/'). Nécessaire car les associations
// team/role-group.collections stockent l'ID stable de la collection
// (voir readTeams côté serveur), pas son chemin — le chemin peut changer si
// une collection est renommée/déplacée, l'ID non. Cache reconstruit à chaque
// cfg_build() (cf. _cfgBuildColPathCache), pour éviter de repayer la marche
// parent_id à chaque nœud/équipe.
var _cfgColPathCache=null;
function _cfgBuildColPathCache(){
  var cols=collectionsData.collections||[];
  var byId={};
  cols.forEach(function(c){ byId[c.id]=c; });
  var raw={}; // chemins SANS / englobants, pour la récursion interne
  function getRawPath(c){
    if(!c) return '';
    if(raw[c.id]!==undefined) return raw[c.id];
    var p;
    if(!c.parent_id||!byId[c.parent_id]){ p=c.name||c.nom||''; }
    else { p=getRawPath(byId[c.parent_id])+'/'+(c.name||c.nom||''); }
    raw[c.id]=p;
    return p;
  }
  var cache={};
  cols.forEach(function(c){ cache[c.id]='/'+getRawPath(c)+'/'; });
  _cfgColPathCache=cache;
}
function _cfgResolveColPath(idOrChemin){
  if(!idOrChemin) return idOrChemin;
  if(!_cfgColPathCache) _cfgBuildColPathCache();
  return _cfgColPathCache[idOrChemin] || idOrChemin; // déjà un chemin (ancien format) ou ID inconnu -> tel quel
}

// Catégories/vues applicables à l'objet Collection — relation GLOBALE (au niveau
// système Iconik, pas propre à une collection précise) : "une vue est attribuée à
// l'objet collection en général", donc la même liste s'applique à tous les nœuds.
// Calculée une seule fois par cfg_build() (cf. reset dans cfg_build), pas par nœud.
// Même logique que Settings (cat.viewIdsByType.collections, sans fallback sur
// object_types — cf. script-settings.js, commentaire 'pas de fallback').
var _cfgMdInfo=null;
function _cfgBuildMdInfo(){
  var cats=categoriesData.categories||[];
  var result=[]; // [{ nom, vues:[...noms] }] — uniquement les catégories ayant ≥1 vue pour collections
  cats.forEach(function(cat){
    var vues=(cat.viewIdsByType && cat.viewIdsByType.collections) || [];
    if(vues.length) result.push({ nom:cat.nom||cat.name||'', vues:vues });
  });
  _cfgMdInfo=result;
}
function cfg_getMdInfo(){
  if(!_cfgMdInfo) _cfgBuildMdInfo();
  return _cfgMdInfo;
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
    if (!env) { collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]}; categoriesData={categories:[]}; return; }
    const snapRes = await fetch('/api/ikon/snapshot/' + encodeURIComponent(env.environment));
    if (!snapRes.ok) { collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]}; categoriesData={categories:[]}; return; }
    const snap = await snapRes.json();
    collectionsData = { collections: snap.collections || [] };
    teamsData       = { teams: snap.teams || [] };
    roleGroupsData  = { roleGroups: snap.roleGroups || [] };
    categoriesData  = { categories: snap.categories || [] };
    var b=document.getElementById('orgBadge'); if(b) b.textContent = (snap.env && snap.env.name) || '';
  } catch(e) {
    console.warn('[Viewer] Erreur chargement snapshot :', e);
    collectionsData={collections:[]}; teamsData={teams:[]}; roleGroupsData={roleGroups:[]}; categoriesData={categories:[]};
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
// Légende des fiches — quelles sections afficher (Teams/Catégories/Vues).
// Persisté en localStorage ; réutilisable tel quel pour le mode Workflow plus tard.
var cfgLegend=(function(){
  try{ var saved=JSON.parse(localStorage.getItem('cfgCardLegend')||'{}'); return { teams: saved.teams!==false, categories: !!saved.categories, views: !!saved.views }; }
  catch(e){ return { teams:true, categories:false, views:false }; }
})();
function cfg_toggleLegend(key){
  cfgLegend[key]=!cfgLegend[key];
  try{ localStorage.setItem('cfgCardLegend', JSON.stringify(cfgLegend)); }catch(e){}
  var btn=document.getElementById('btn-lgd-'+key);
  if(btn) btn.classList.toggle('on', cfgLegend[key]);
  // Reconstruire toutes les fiches déjà ouvertes avec la nouvelle sélection
  Object.keys(cfgCards).forEach(function(chemin){
    var old=cfgCards[chemin];
    var x=_cfgNodeX(old), y=_cfgNodeY(old);
    var nodeEl=document.querySelector('.cfg-node[data-chemin="'+chemin+'"]');
    old.remove();
    var card=cfg_buildCardSVG(chemin,nodeEl,x,y-CFG_H-10,CFG_H);
    cfgCards[chemin]=card;
    document.getElementById('cfg-zoom-g').appendChild(card);
  });
  if(Object.keys(cfgCards).length) cfg_redrawConnections();
}
document.addEventListener('DOMContentLoaded',function(){
  ['teams','categories','views'].forEach(function(k){
    var btn=document.getElementById('btn-lgd-'+k);
    if(btn) btn.classList.toggle('on', cfgLegend[k]);
  });
});
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

// Netteté : le zoom CSS existant sur #cfg-vp suffit pour TOUT (nœuds SVG ET
// fiches HTML) — le contenu SVG reste net même quand son conteneur HTML ancêtre
// est zoomé via transform CSS (contrairement au contenu HTML/texte, qui lui
// devient flou). Un zoom SVG interne séparé sur #cfg-zoom-g avait été ajouté par
// erreur en plus de celui-ci : comme <svg> est un enfant de #cfg-vp, les deux
// transforms se cumulaient, décalant les nœuds par rapport aux fiches (qui, elles,
// ne subissaient que le zoom CSS). Retiré — un seul zoom, qui suffit déjà.
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
var SVGNS='http://www.w3.org/2000/svg';
function _cfgEl(tag){ return document.createElementNS(SVGNS, tag); }

// Lit la position COURANTE d'un nœud SVG (peut avoir été repositionné
// dynamiquement par cfg_toggleCards — transform est la source de vérité
// live, cfgPosMap ne reflète que la position de layout initiale).
function _cfgNodeX(el){ var m=/translate\(([-\d.]+)/.exec(el.getAttribute('transform')||''); return m?parseFloat(m[1]):0; }
function _cfgNodeY(el){ var m=/translate\([-\d.]+,([-\d.]+)/.exec(el.getAttribute('transform')||''); return m?parseFloat(m[1]):0; }
function _cfgSetNodeY(el,y){ el.setAttribute('transform','translate('+_cfgNodeX(el)+','+y+')'); }

// Construit le <g> SVG d'un nœud (onglet dossier + nom + badges d'équipe),
// coordonnées RELATIVES (origine 0,0) — le positionnement se fait via l'attribut
// transform du <g>, pour permettre un repositionnement ultérieur simple (une seule
// mise à jour d'attribut, pas une reconstruction du tracé). Mêmes formules
// visuelles que cfg_buildExportSVG (cohérence live/export).
function cfg_createNodeSVG(p){
  var TAB_W=Math.round(CFG_W*0.58), TAB_H=11;
  var g=_cfgEl('g');
  g.setAttribute('class','cfg-node'+(p.depth===0?' root':''));
  g.setAttribute('transform','translate('+p.x+','+p.y+')');
  g.dataset.chemin=p.chemin;

  var tab=_cfgEl('path');
  tab.setAttribute('class','cfg-folder-shape');
  tab.setAttribute('d','M4,'+(-TAB_H+4)+' Q4,'+(-TAB_H)+' 8,'+(-TAB_H)+' H'+(TAB_W-4)+' Q'+TAB_W+','+(-TAB_H)+' '+TAB_W+','+(-TAB_H+4)+' V0 H0 V'+(-TAB_H+4)+' Z');
  g.appendChild(tab);

  var seam=_cfgEl('rect');
  seam.setAttribute('class','cfg-folder-seam');
  seam.setAttribute('x',1); seam.setAttribute('y',-1);
  seam.setAttribute('width',TAB_W-2); seam.setAttribute('height',3);
  g.appendChild(seam);

  var body=_cfgEl('path');
  body.setAttribute('class','cfg-folder-shape');
  body.setAttribute('d','M0,0 H'+(CFG_W-6)+' Q'+CFG_W+',0 '+CFG_W+',6 V'+(CFG_H-6)+' Q'+CFG_W+','+CFG_H+' '+(CFG_W-6)+','+CFG_H+' H6 Q0,'+CFG_H+' 0,'+(CFG_H-6)+' V0 Z');
  g.appendChild(body);

  var name=_cfgEl('text');
  name.setAttribute('class','cfg-fname-text');
  name.setAttribute('x',10); name.setAttribute('y',16);
  name.dataset.label=p.key;
  var title=_cfgEl('title'); title.textContent=p.chemin; name.appendChild(title);
  name.appendChild(document.createTextNode(p.key));
  g.appendChild(name);

  var teams=cfg_getTeams(p.chemin);
  var bx=8, by=26;
  var shown=teams.slice(0,4);
  shown.forEach(function(t){
    var isRW=t.permission==='Read & Write';
    var cls=t.isRG?'rg':(isRW?'rw':'ro');
    var shortName=t.nom.split('-').pop()||t.nom;
    var txt=shortName.length>10?shortName.slice(0,9)+'...':shortName;
    var w=Math.max(txt.length*6+10,20);
    if(bx+w>CFG_W-4) return;
    var r=_cfgEl('rect');
    r.setAttribute('class','cfg-badge-rect '+cls);
    r.setAttribute('x',bx); r.setAttribute('y',by);
    r.setAttribute('width',w); r.setAttribute('height',13); r.setAttribute('rx',2);
    g.appendChild(r);
    var bt=_cfgEl('text');
    bt.setAttribute('class','cfg-badge-text '+cls);
    bt.setAttribute('x',bx+5); bt.setAttribute('y',by+10);
    bt.dataset.label=txt;
    var bTitle=_cfgEl('title'); bTitle.textContent=t.nom; bt.appendChild(bTitle);
    bt.appendChild(document.createTextNode(txt));
    g.appendChild(bt);
    bx+=w+4;
  });
  if(teams.length>4){
    var mTxt='+'+(teams.length-4), mw=Math.max(mTxt.length*6+10,20);
    if(bx+mw<=CFG_W-4){
      var mr=_cfgEl('rect'); mr.setAttribute('class','cfg-badge-rect ro');
      mr.setAttribute('x',bx); mr.setAttribute('y',by);
      mr.setAttribute('width',mw); mr.setAttribute('height',13); mr.setAttribute('rx',2);
      g.appendChild(mr);
      var mt=_cfgEl('text'); mt.setAttribute('class','cfg-badge-text ro');
      mt.setAttribute('x',bx+5); mt.setAttribute('y',by+10);
      mt.dataset.label=mTxt;
      mt.appendChild(document.createTextNode(mTxt));
      g.appendChild(mt);
    }
  }
  return g;
}

function cfg_build(cols){
  cfgPosMap={};
  _cfgColPathCache=null; // invalidé — sera reconstruit à la volée depuis collectionsData
  _cfgMdInfo=null; // idem pour catégories/vues (relation globale, calculée une fois)
  var vp=document.getElementById('cfg-vp');
  Array.from(vp.children).forEach(function(c){if(c.tagName!=='svg')c.remove();});
  var svg=document.getElementById('cfg-svg');svg.innerHTML='';
  var zoomG=_cfgEl('g'); zoomG.id='cfg-zoom-g'; svg.appendChild(zoomG);
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
    var el=cfg_createNodeSVG(p);
    el.addEventListener('click',function(e){e.stopPropagation();if(e.shiftKey){cfg_highlightSubtree(p.chemin);return;}cfg_toggleCard(p.chemin,el,p.x,p.y);});
    el.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation();cfg_highlightSubtree(p.chemin);});
    zoomG.appendChild(el);
  });
  document.getElementById('mode-config').addEventListener('click',function(e){if(!e.target.closest('.cfg-node'))cfg_clearHighlight();});
 requestAnimationFrame(function(){
    // Draw connections (DOM-based)
    cfg_drawConnections(zoomG, vp, positions, cfgPosMap);

    var maxX=0,maxY=0;vp.querySelectorAll('.cfg-node').forEach(function(el){var x=parseInt(el.style.left),y=parseInt(el.style.top),h=el.offsetHeight||CFG_H;maxX=Math.max(maxX,x+CFG_W+CFG_HGAP+220);maxY=Math.max(maxY,y+h+120);});svg.style.width=maxX+'px';svg.style.height=maxY+'px';
    cfg_fit();toast(cols.length+' collections · '+positions.length+' noeuds');
  });
}
function cfg_getTeams(chemin){var normC=chemin.toLowerCase().replace(/\/+$/,'').replace(/^\/+/,'');var res=[];(teamsData.teams||[]).forEach(function(t){var f=(t.collections||[]).find(function(c){var raw=typeof c==='string'?c:(c.chemin||c.nom||'');var ch=_cfgResolveColPath(raw);var normCh=ch.toLowerCase().replace(/\/+$/,'').replace(/^\/+/,'');return normCh===normC;});if(f)res.push({nom:t.nom,permission:(f.permission||''),isRG:false});});(roleGroupsData.roleGroups||[]).forEach(function(rg){var f=(rg.collections||[]).find(function(c){var raw=typeof c==='string'?c:c.chemin;var ch=_cfgResolveColPath(raw);var normCh=(ch||'').toLowerCase().replace(/\/+$/,'').replace(/^\/+/,'');return normCh===normC;});if(f)res.push({nom:rg.nom,permission:(f.permission||''),isRG:true});});return res;}
function cfg_toggleCard(chemin,nodeEl,nx,ny){if(cfgCards[chemin]){cfgCards[chemin].remove();delete cfgCards[chemin];nodeEl.classList.remove('open');return;}nodeEl.classList.add('open');var card=cfg_buildCardSVG(chemin,nodeEl,nx,ny,CFG_H);cfgCards[chemin]=card;document.getElementById('cfg-zoom-g').appendChild(card);}
var CARD_W=210;

// Découpe un chemin en lignes qui tiennent dans la largeur de la fiche
// (approximation par nombre de caractères — cohérent avec l'heuristique déjà
// utilisée pour les badges des nœuds, cf. cfg_createNodeSVG).
// Construit la fiche de détail (teams, catégories, vues métadonnées — sections
// activables via cfgLegend) en SVG
// natif — même raison que cfg_createNodeSVG : rester net à tout niveau de zoom.
// Retourne le <g> avec sa hauteur calculée stockée dans dataset.h (équivalent
// SVG de offsetHeight, utilisé par l'algorithme d'évitement de collision de
// cfg_toggleCards).
function cfg_buildCardSVG(chemin,nodeEl,nx,ny,nodeH){
  var h0=nodeH||CFG_H;
  var cx=nx, cy=ny+h0+10;
  var nom=chemin.split('/').filter(Boolean).pop()||chemin;
  var teams=cfgLegend.teams?cfg_getTeams(chemin):[];
  var mdInfo=(cfgLegend.categories||cfgLegend.views)?cfg_getMdInfo():[];
  var catNames=cfgLegend.categories?mdInfo.map(function(c){return c.nom;}):[];
  var viewNames=[];
  if(cfgLegend.views){
    var seen={};
    mdInfo.forEach(function(c){ (c.vues||[]).forEach(function(v){ if(!seen[v]){seen[v]=true; viewNames.push(v);} }); });
  }

  var HDR_H=22, SEC_PAD=7, SEC_TITLE_H=11, ROW_H=15;
  var totalH=HDR_H;
  if(cfgLegend.teams){
    totalH += SEC_PAD+(teams.length?SEC_TITLE_H:0)+(teams.length?teams.length*ROW_H:13);
  }
  if(cfgLegend.categories){
    totalH += SEC_PAD+SEC_TITLE_H+(catNames.length?catNames.length*ROW_H:13);
  }
  if(cfgLegend.views){
    totalH += SEC_PAD+SEC_TITLE_H+(viewNames.length?viewNames.length*ROW_H:13);
  }
  totalH += 6;

  var g=_cfgEl('g');
  g.setAttribute('class','cfg-card-svg');
  g.setAttribute('transform','translate('+cx+','+cy+')');
  g.dataset.chemin=chemin;
  g.dataset.h=totalH;

  var TAB_W=Math.round(CARD_W*0.5), TAB_H=10;
  var tab=_cfgEl('path');
  tab.setAttribute('class','cfg-card-shape');
  tab.setAttribute('d','M3,'+(-TAB_H+3)+' Q3,'+(-TAB_H)+' 6,'+(-TAB_H)+' H'+(TAB_W-3)+' Q'+TAB_W+','+(-TAB_H)+' '+TAB_W+','+(-TAB_H+3)+' V0 H0 V'+(-TAB_H+3)+' Z');
  g.appendChild(tab);
  var seam=_cfgEl('rect');
  seam.setAttribute('class','cfg-card-seam');
  seam.setAttribute('x',1); seam.setAttribute('y',-1);
  seam.setAttribute('width',TAB_W-2); seam.setAttribute('height',2.5);
  g.appendChild(seam);

  var body=_cfgEl('path');
  body.setAttribute('class','cfg-card-shape');
  body.setAttribute('d','M0,0 H'+(CARD_W-8)+' Q'+CARD_W+',0 '+CARD_W+',8 V'+(totalH-8)+' Q'+CARD_W+','+totalH+' '+(CARD_W-8)+','+totalH+' H8 Q0,'+totalH+' 0,'+(totalH-8)+' V0 Z');
  g.appendChild(body);

  var hdrBg=_cfgEl('rect');
  hdrBg.setAttribute('class','cfg-card-hdr-bg');
  hdrBg.setAttribute('x',0); hdrBg.setAttribute('y',0);
  hdrBg.setAttribute('width',CARD_W); hdrBg.setAttribute('height',HDR_H);
  g.appendChild(hdrBg);
  var hdrLine=_cfgEl('line');
  hdrLine.setAttribute('class','cfg-card-divider');
  hdrLine.setAttribute('x1',0); hdrLine.setAttribute('y1',HDR_H);
  hdrLine.setAttribute('x2',CARD_W); hdrLine.setAttribute('y2',HDR_H);
  g.appendChild(hdrLine);

  var titleTxt=nom.length>26?nom.slice(0,25)+'…':nom;
  var title=_cfgEl('text');
  title.setAttribute('class','cfg-card-title-text');
  title.setAttribute('x',10); title.setAttribute('y',14);
  title.dataset.label=titleTxt;
  var titleTip=_cfgEl('title'); titleTip.textContent=chemin; title.appendChild(titleTip);
  title.appendChild(document.createTextNode(titleTxt));
  g.appendChild(title);

  var closeBtn=_cfgEl('text');
  closeBtn.setAttribute('class','cfg-card-close-btn');
  closeBtn.setAttribute('x',CARD_W-10); closeBtn.setAttribute('y',15);
  closeBtn.textContent='\u00d7';
  closeBtn.addEventListener('click',function(e){
    e.stopPropagation();
    g.remove();
    delete cfgCards[chemin];
    nodeEl.classList.remove('open');
  });
  g.appendChild(closeBtn);

  var y=HDR_H;

  // Section Teams (Accès) — propre à CHAQUE collection (contrairement aux 2 suivantes)
  if(cfgLegend.teams){
    y+=SEC_PAD;
    if(teams.length){
      var accTitle=_cfgEl('text');
      accTitle.setAttribute('class','cfg-card-sec-title');
      accTitle.setAttribute('x',10); accTitle.setAttribute('y',y+7);
      accTitle.textContent='TEAMS';
      g.appendChild(accTitle);
      y+=SEC_TITLE_H;
      teams.forEach(function(t){
        var dot=_cfgEl('circle');
        dot.setAttribute('class','cfg-card-dot'+(t.isRG?' rg':''));
        dot.setAttribute('cx',12); dot.setAttribute('cy',y+5); dot.setAttribute('r',2.5);
        g.appendChild(dot);
        var nmTxt=t.nom.length>20?t.nom.slice(0,19)+'…':t.nom;
        var nm=_cfgEl('text');
        nm.setAttribute('class','cfg-card-rname');
        nm.setAttribute('x',20); nm.setAttribute('y',y+8);
        nm.dataset.label=nmTxt;
        var nmTip=_cfgEl('title'); nmTip.textContent=t.nom; nm.appendChild(nmTip);
        nm.appendChild(document.createTextNode(nmTxt));
        g.appendChild(nm);
        if(t.permission){
          var isRW=t.permission==='Read & Write';
          var pTxt=isRW?'R&W':'RO';
          var pw=Math.max(pTxt.length*6+8,20);
          var pr=_cfgEl('rect');
          pr.setAttribute('class','cfg-card-perm-rect'+(isRW?' rw':''));
          pr.setAttribute('x',CARD_W-10-pw); pr.setAttribute('y',y);
          pr.setAttribute('width',pw); pr.setAttribute('height',11); pr.setAttribute('rx',2);
          g.appendChild(pr);
          var pt=_cfgEl('text');
          pt.setAttribute('class','cfg-card-perm-text'+(isRW?' rw':''));
          pt.setAttribute('x',CARD_W-10-pw+4); pt.setAttribute('y',y+8);
          pt.textContent=pTxt;
          g.appendChild(pt);
        }
        y+=ROW_H;
      });
    } else {
      var emptyT=_cfgEl('text');
      emptyT.setAttribute('class','cfg-card-empty-text');
      emptyT.setAttribute('x',10); emptyT.setAttribute('y',y+6);
      emptyT.textContent='Aucune team configuree';
      g.appendChild(emptyT);
      y+=13;
    }
    y+=4;
    var divT=_cfgEl('line');
    divT.setAttribute('class','cfg-card-divider');
    divT.setAttribute('x1',0); divT.setAttribute('y1',y);
    divT.setAttribute('x2',CARD_W); divT.setAttribute('y2',y);
    g.appendChild(divT);
  }

  // Section Catégories — relation GLOBALE à l'objet Collection (identique sur
  // toutes les fiches), pas propre à cette collection précise.
  if(cfgLegend.categories){
    y+=SEC_PAD;
    var catTitle=_cfgEl('text');
    catTitle.setAttribute('class','cfg-card-sec-title');
    catTitle.setAttribute('x',10); catTitle.setAttribute('y',y+7);
    catTitle.textContent='CATEGORIES';
    g.appendChild(catTitle);
    y+=SEC_TITLE_H;
    if(!catNames.length){
      var emptyC=_cfgEl('text');
      emptyC.setAttribute('class','cfg-card-empty-text');
      emptyC.setAttribute('x',10); emptyC.setAttribute('y',y+6);
      emptyC.textContent='Aucune categorie pour Collection';
      g.appendChild(emptyC);
      y+=13;
    } else {
      catNames.forEach(function(nomCat){
        var dot=_cfgEl('circle');
        dot.setAttribute('class','cfg-card-dot cat');
        dot.setAttribute('cx',12); dot.setAttribute('cy',y+5); dot.setAttribute('r',2.5);
        g.appendChild(dot);
        var txt=nomCat.length>24?nomCat.slice(0,23)+'…':nomCat;
        var nm=_cfgEl('text');
        nm.setAttribute('class','cfg-card-rname');
        nm.setAttribute('x',20); nm.setAttribute('y',y+8);
        nm.appendChild(document.createTextNode(txt));
        g.appendChild(nm);
        y+=ROW_H;
      });
    }
    y+=4;
    var divC=_cfgEl('line');
    divC.setAttribute('class','cfg-card-divider');
    divC.setAttribute('x1',0); divC.setAttribute('y1',y);
    divC.setAttribute('x2',CARD_W); divC.setAttribute('y2',y);
    g.appendChild(divC);
  }

  // Section Vues métadonnées — même relation globale que Catégories
  if(cfgLegend.views){
    y+=SEC_PAD;
    var vTitle=_cfgEl('text');
    vTitle.setAttribute('class','cfg-card-sec-title');
    vTitle.setAttribute('x',10); vTitle.setAttribute('y',y+7);
    vTitle.textContent='VUES METADONNEES';
    g.appendChild(vTitle);
    y+=SEC_TITLE_H;
    if(!viewNames.length){
      var emptyV=_cfgEl('text');
      emptyV.setAttribute('class','cfg-card-empty-text');
      emptyV.setAttribute('x',10); emptyV.setAttribute('y',y+6);
      emptyV.textContent='Aucune vue pour Collection';
      g.appendChild(emptyV);
      y+=13;
    } else {
      viewNames.forEach(function(nomVue){
        var dot=_cfgEl('circle');
        dot.setAttribute('class','cfg-card-dot view');
        dot.setAttribute('cx',12); dot.setAttribute('cy',y+5); dot.setAttribute('r',2.5);
        g.appendChild(dot);
        var txt=nomVue.length>24?nomVue.slice(0,23)+'…':nomVue;
        var nm=_cfgEl('text');
        nm.setAttribute('class','cfg-card-rname');
        nm.setAttribute('x',20); nm.setAttribute('y',y+8);
        nm.appendChild(document.createTextNode(txt));
        g.appendChild(nm);
        y+=ROW_H;
      });
    }
  }

  return g;
}
function cfg_toggleCards(){cfgAllOn=!cfgAllOn;document.getElementById('btn-cards').classList.toggle('on',cfgAllOn);var vp=document.getElementById('cfg-vp');var zoomG=document.getElementById('cfg-zoom-g');if(!cfgAllOn){Object.keys(cfgCards).forEach(function(ch){cfgCards[ch].remove();delete cfgCards[ch];});zoomG.querySelectorAll('.cfg-node.open').forEach(function(n){n.classList.remove('open');});zoomG.querySelectorAll('.cfg-node').forEach(function(el){var ch=el.dataset.chemin;if(cfgPosMap[ch]){_cfgSetNodeY(el,cfgPosMap[ch].y);}});cfg_redrawConnections();return;}
  // Passe 1 : créer toutes les cartes aux positions initiales
  zoomG.querySelectorAll('.cfg-node').forEach(function(el){var ch=el.dataset.chemin;if(cfgCards[ch])return;var x=_cfgNodeX(el),y=_cfgNodeY(el);el.classList.add('open');var card=cfg_buildCardSVG(ch,el,x,y,CFG_H);cfgCards[ch]=card;zoomG.appendChild(card);});
  // Passe 2 : après rendu complet, lire les vraies hauteurs de carte et repositionner
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    var byX={};zoomG.querySelectorAll('.cfg-node').forEach(function(el){var x=_cfgNodeX(el);byX[x]=byX[x]||[];byX[x].push(el);});
    Object.keys(byX).sort(function(a,b){return+a-+b;}).forEach(function(x){
      var nodes=byX[x].slice().sort(function(a,b){return _cfgNodeY(a)-_cfgNodeY(b);});
      // Remettre chaque nœud à sa position initiale avant de recalculer
      nodes.forEach(function(el){var ch=el.dataset.chemin;if(cfgPosMap[ch])_cfgSetNodeY(el,cfgPosMap[ch].y);});
      for(var i=1;i<nodes.length;i++){
        var prev=nodes[i-1];
        var prevCard=cfgCards[prev.dataset.chemin];
        var prevCardH=prevCard?(parseFloat(prevCard.dataset.h)||0):0;
        var required=_cfgNodeY(prev)+CFG_H+prevCardH+20;
        if(_cfgNodeY(nodes[i])<required){
          _cfgSetNodeY(nodes[i],required);
          var card=cfgCards[nodes[i].dataset.chemin];
          if(card){card.setAttribute('transform','translate('+_cfgNodeX(nodes[i])+','+(required+CFG_H+10)+')');}
        }
      }
    });
    cfg_redrawConnections();cfg_fit();
  });});
}

// ── CFG: draw connections (SVG natif, groupe dédié pour ne pas effacer les nœuds) ──
function cfg_drawConnections(zoomG, vp, positions, cfgPosMap){
  var connG = zoomG.querySelector('.cfg-connectors');
  if (!connG) { connG=_cfgEl('g'); connG.setAttribute('class','cfg-connectors'); zoomG.insertBefore(connG, zoomG.firstChild); }
  connG.innerHTML = '';

  function px(v){ return Math.round(v); }

  // ── Liens standards (les nœuds de niveau 0 n'ont pas de parent — ce sont de
  // vraies racines, aucun tronc/branche synthétique à dessiner) ──────────────
  (positions || []).forEach(function(p){
    if(!p || !p.parentChemin || !cfgPosMap[p.parentChemin]) return;

    var par = cfgPosMap[p.parentChemin];
    var parEl = zoomG.querySelector('.cfg-node[data-chemin="'+par.chemin+'"]');
    var childEl = zoomG.querySelector('.cfg-node[data-chemin="'+p.chemin+'"]');
    if(!parEl || !childEl) return;

    var parLeft = _cfgNodeX(parEl), parTop = _cfgNodeY(parEl);
    var childLeft = _cfgNodeX(childEl), childTop = _cfgNodeY(childEl);

    var x1 = px(parLeft + CFG_W/2);
    var y1 = px(parTop + CFG_H);
    var x2 = px(childLeft);
    var y2 = px(childTop + CFG_H/2);

    var d = 'M'+x1+','+y1+' V'+y2+' H'+x2;

    var path = _cfgEl('path');
    path.setAttribute('d', d);
    path.dataset.child  = p.chemin;
    path.dataset.parent = p.parentChemin;
    connG.appendChild(path);
  });
}

function cfg_redrawConnections(){
  var zoomG = document.getElementById('cfg-zoom-g');
  var vp  = document.getElementById('cfg-vp');
  if (!zoomG) return;

  // Si la fonction centralisée existe, on l’utilise (recommandé)
  if (typeof cfg_drawConnections === 'function') {
    var positions = Object.values(cfgPosMap);
    cfg_drawConnections(zoomG, vp, positions, cfgPosMap);
    if (cfgHiRoot) cfg_highlightSubtree(cfgHiRoot);
    return;
  }

  // Fallback minimal (évite crash si cfg_drawConnections absent)
  var connG = zoomG.querySelector('.cfg-connectors');
  if (connG) connG.innerHTML = '';
}

function cfg_fit(){var wrap=document.getElementById('mode-config'),vp=document.getElementById('cfg-vp');var nodes=vp.querySelectorAll('.cfg-node');if(!nodes.length)return;var maxX=0,maxY=0;nodes.forEach(function(n){maxX=Math.max(maxX,_cfgNodeX(n)+CFG_W+220);maxY=Math.max(maxY,_cfgNodeY(n)+CFG_H+150);});var s=Math.min((wrap.clientWidth-80)/maxX,(wrap.clientHeight-80)/maxY,1.5);CS=s;CTX=40;CTY=40;cApply();}
var cfgHiRoot=null;
function cfg_highlightSubtree(rootChemin){if(cfgHiRoot===rootChemin){cfg_clearHighlight();return;}cfg_clearHighlight();cfgHiRoot=rootChemin;var hiSet=new Set();function collect(ch){hiSet.add(ch);Object.values(cfgPosMap).forEach(function(p){if(p.parentChemin===ch)collect(p.chemin);});}collect(rootChemin);var vp=document.getElementById('cfg-vp');vp.querySelectorAll('.cfg-node').forEach(function(el){if(hiSet.has(el.dataset.chemin))el.classList.add('hi');});document.querySelectorAll('#cfg-svg path').forEach(function(path){if(hiSet.has(path.dataset.child))path.classList.add('hi');});toast(hiSet.size+' noeud'+(hiSet.size>1?'s':''));}
function cfg_clearHighlight(){cfgHiRoot=null;document.querySelectorAll('.cfg-node.hi').forEach(function(n){n.classList.remove('hi');});document.querySelectorAll('#cfg-svg path.hi').forEach(function(p){p.classList.remove('hi');});}
function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cfg_buildExportSVG(){var zoomG=document.getElementById('cfg-zoom-g');var nodes=zoomG?zoomG.querySelectorAll('.cfg-node'):[];var cards=zoomG?zoomG.querySelectorAll('.cfg-card-svg'):[];if(!nodes.length)return null;var PAD=50,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  // Hauteur fixe (CFG_H) — plus de calcul d'estimation, les nœuds SVG natifs ont
  // une hauteur constante (badges limités à une rangée, cf. cfg_createNodeSVG).
  nodes.forEach(function(el){
    var x=_cfgNodeX(el),y=_cfgNodeY(el);
    minX=Math.min(minX,x);minY=Math.min(minY,y-14);
    maxX=Math.max(maxX,x+CFG_W);maxY=Math.max(maxY,y+CFG_H);
  });
  cards.forEach(function(card){
    var x=_cfgNodeX(card),y=_cfgNodeY(card);
    var w=CARD_W, h=parseFloat(card.dataset.h)||140;
    minX=Math.min(minX,x);minY=Math.min(minY,y-14);
    maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h);
  });var W=maxX-minX+PAD*2,H=maxY-minY+PAD*2;function tx(v){return v-minX+PAD;}function ty(v){return v-minY+PAD;}function shiftPath(d){return d.replace(/([MLHV])\s*(-?\d+\.?\d*)/g,function(_,cmd,val){val=parseFloat(val);if(cmd==='H')return'H'+(val-minX+PAD);if(cmd==='V')return'V'+(val-minY+PAD);return cmd+val;}).replace(/([ML])\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/g,function(_,cmd,a,b){return cmd+(parseFloat(a)-minX+PAD)+','+(parseFloat(b)-minY+PAD);});}
  // Décalage des tracés de fiche (M/Q/H/V/Z, avec courbes Q à 2 paires de
  // coordonnées pour les coins arrondis) — via un parseur par tokens plutôt
  // qu'une regex simple, plus fiable pour ce genre de tracé mixte.
  function shiftCardPath(d,cx,cy){
    var tokens=d.match(/[MLHVQZ]|-?\d+\.?\d*/g)||[];
    var out=[]; var cmd=null; var i=0;
    while(i<tokens.length){
      var t=tokens[i];
      if(/^[MLHVQZ]$/.test(t)){ cmd=t; out.push(cmd); i++; }
      else if(cmd==='H'){ out.push(String(parseFloat(t)+cx)); i++; }
      else if(cmd==='V'){ out.push(String(parseFloat(t)+cy)); i++; }
      else if(cmd==='M'||cmd==='L'||cmd==='Q'){ out.push((parseFloat(tokens[i])+cx)+','+(parseFloat(tokens[i+1])+cy)); i+=2; }
      else { i++; }
    }
    return out.join(' ');
  }
  var lines=[];lines.push('<?xml version="1.0" encoding="UTF-8"?>');lines.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">');lines.push('<rect width="'+W+'" height="'+H+'" fill="#0d0d0d"/>');lines.push('<style>text{font-family:"Courier New",monospace;dominant-baseline:auto;}</style>');
  var connG=zoomG?zoomG.querySelector('.cfg-connectors'):null;
  if(connG)connG.querySelectorAll('path').forEach(function(path){var d=path.getAttribute('d');if(!d)return;var stroke=path.classList.contains('hi')?'#C8D100':'#aaaaaa';lines.push('<path d="'+shiftPath(d)+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>');});
  nodes.forEach(function(el){
    var nx=tx(_cfgNodeX(el)),ny=ty(_cfgNodeY(el));
    var h=CFG_H;var isHi=el.classList.contains('hi');var bc=isHi?'#C8D100':'#888888';var TAB_W=Math.round(CFG_W*0.58),TAB_H=11;
    lines.push('<path d="M'+(nx+4)+','+(ny-TAB_H+4)+' Q'+(nx+4)+','+(ny-TAB_H)+' '+(nx+8)+','+(ny-TAB_H)+' H'+(nx+TAB_W-4)+' Q'+(nx+TAB_W)+','+(ny-TAB_H)+' '+(nx+TAB_W)+','+(ny-TAB_H+4)+' V'+ny+' H'+nx+' V'+(ny-TAB_H+4)+' Z" fill="#111111" stroke="'+bc+'" stroke-width="1.5"/>');
    lines.push('<rect x="'+(nx+1)+'" y="'+(ny-1)+'" width="'+(TAB_W-2)+'" height="3" fill="#111111"/>');
    lines.push('<path d="M'+nx+','+ny+' H'+(nx+CFG_W-6)+' Q'+(nx+CFG_W)+','+ny+' '+(nx+CFG_W)+','+(ny+6)+' V'+(ny+h-6)+' Q'+(nx+CFG_W)+','+(ny+h)+' '+(nx+CFG_W-6)+','+(ny+h)+' H'+(nx+6)+' Q'+nx+','+(ny+h)+' '+nx+','+(ny+h-6)+' V'+ny+' Z" fill="#111111" stroke="'+bc+'" stroke-width="1.5"/>');
    var nameEl=el.querySelector('.cfg-fname-text');var label=nameEl?(nameEl.dataset.label||''):'';
    lines.push('<text x="'+(nx+10)+'" y="'+(ny+16)+'" font-size="11" font-weight="bold" fill="#d0d0d0">'+_esc(label)+'</text>');
    var bx=nx+8,by=ny+26;
    el.querySelectorAll('.cfg-badge-text').forEach(function(bt){
      var txt=bt.dataset.label||'';if(!txt)return;var w=Math.max(txt.length*6+10,20);if(bx+w>nx+CFG_W-4)return;
      var isRW=bt.classList.contains('rw'),isRG=bt.classList.contains('rg');
      var bg=isRG?'#2a1a36':isRW?'#0d3320':'#0d1f33';var fg=isRG?'#9b59b6':isRW?'#0DB852':'#2E75B6';
      lines.push('<rect x="'+bx+'" y="'+by+'" width="'+w+'" height="13" rx="2" fill="'+bg+'" stroke="'+fg+'" stroke-width="0.8"/>');
      lines.push('<text x="'+(bx+5)+'" y="'+(by+10)+'" font-size="8" font-weight="bold" fill="'+fg+'">'+_esc(txt)+'</text>');
      bx+=w+4;
    });
  });
  cards.forEach(function(card){
    var cx=tx(_cfgNodeX(card)),cy=ty(_cfgNodeY(card));
    // Parcours générique des enfants dans l'ordre du DOM — reflète fidèlement
    // n'importe quelle combinaison de sections (Teams/Catégories/Vues, selon
    // cfgLegend) sans avoir à connaître leur structure à l'avance. Chaque
    // élément porte déjà ses propres coordonnées relatives (posées par
    // cfg_buildCardSVG) ; on les décale simplement par (cx,cy).
    Array.from(card.children).forEach(function(el){
      var tag=el.tagName.toLowerCase();
      var cls=el.getAttribute('class')||'';
      if(tag==='path'){
        lines.push('<path d="'+shiftCardPath(el.getAttribute('d'),cx,cy)+'" fill="#0c1a1d" stroke="#00bcd4" stroke-width="1.5"/>');
      } else if(tag==='rect'){
        var rx=cx+parseFloat(el.getAttribute('x')||0), ry=cy+parseFloat(el.getAttribute('y')||0);
        var rw=el.getAttribute('width'), rh=el.getAttribute('height'), rr=el.getAttribute('rx')||0;
        var fill='#0c1a1d', stroke='';
        if(cls.indexOf('hdr-bg')>=0) fill='#0a1416';
        else if(cls.indexOf('perm-rect')>=0){ var isRW=cls.indexOf('rw')>=0; fill=isRW?'#0d3320':'#0d1f33'; stroke=isRW?'#0DB852':'#2E75B6'; }
        lines.push('<rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" rx="'+rr+'" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'" stroke-width="0.8"':'')+'/>');
      } else if(tag==='line'){
        var lx1=cx+parseFloat(el.getAttribute('x1')||0), ly1=cy+parseFloat(el.getAttribute('y1')||0);
        var lx2=cx+parseFloat(el.getAttribute('x2')||0), ly2=cy+parseFloat(el.getAttribute('y2')||0);
        lines.push('<line x1="'+lx1+'" y1="'+ly1+'" x2="'+lx2+'" y2="'+ly2+'" stroke="#222"/>');
      } else if(tag==='circle'){
        var ccx=cx+parseFloat(el.getAttribute('cx')||0), ccy=cy+parseFloat(el.getAttribute('cy')||0);
        var cr=el.getAttribute('r')||2.5;
        var dotFill=cls.indexOf('rg')>=0?'#9b59b6':cls.indexOf('cat')>=0?'#e67e22':cls.indexOf('view')>=0?'#00bcd4':'#e84393';
        lines.push('<circle cx="'+ccx+'" cy="'+ccy+'" r="'+cr+'" fill="'+dotFill+'"/>');
      } else if(tag==='text'){
        var tx2=cx+parseFloat(el.getAttribute('x')||0), ty2=cy+parseFloat(el.getAttribute('y')||0);
        var txt=el.dataset.label!==undefined?el.dataset.label:(el.textContent||'');
        var style='font-size="10" fill="#999"';
        if(cls.indexOf('title-text')>=0) style='font-size="10" font-weight="bold" fill="#00bcd4"';
        else if(cls.indexOf('close-btn')>=0) style='font-size="12" fill="#666"';
        else if(cls.indexOf('sec-title')>=0) style='font-size="8" font-weight="bold" fill="#666"';
        else if(cls.indexOf('empty-text')>=0) style='font-size="10" font-style="italic" fill="#666"';
        else if(cls.indexOf('perm-text')>=0){ var isRW2=cls.indexOf('rw')>=0; style='font-size="8" font-weight="bold" fill="'+(isRW2?'#0DB852':'#2E75B6')+'"'; }
        lines.push('<text x="'+tx2+'" y="'+ty2+'" '+style+'>'+_esc(txt)+'</text>');
      }
    });
  });
  lines.push('</svg>');return lines.join('\n');}
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
  var btnGenId=document.createElement('button');btnGenId.className='dsn-act genid';btnGenId.textContent='\uD83D\uDD11';btnGenId.style.cssText=node.generateId?'background:#f1c40f;color:#000;':'';btnGenId.title=node.generateId?'G\u00e9n\u00e8re un Bayard ID ici (clic pour d\u00e9sactiver)':'Ne g\u00e9n\u00e8re pas d\'ID ici (clic pour activer)';
  btnGenId.addEventListener('click',function(e){e.stopPropagation();node.generateId=!node.generateId;dSnapshot();var old=document.getElementById('dn-'+node.id);if(old)old.remove();dRenderNode(node);dRedrawEdges();dUpdateExport();});
  var DSN_TYPES=['','S\u00e9rie','Saison','Episode','Unitaire'];
  var btnType=document.createElement('button');btnType.className='dsn-act ctype';btnType.textContent=node.collectionType?node.collectionType.slice(0,3):'\uD83C\uDFF7\uFE0F';btnType.style.cssText=node.collectionType?'background:#3498db;color:#fff;':'';btnType.title=node.collectionType?('Type : '+node.collectionType+' (clic pour changer)'):'Aucun type de collection (clic pour d\u00e9finir)';
  btnType.addEventListener('click',function(e){e.stopPropagation();var idx=DSN_TYPES.indexOf(node.collectionType||'');node.collectionType=DSN_TYPES[(idx+1)%DSN_TYPES.length];dSnapshot();var old=document.getElementById('dn-'+node.id);if(old)old.remove();dRenderNode(node);dRedrawEdges();dUpdateExport();});
  acts.appendChild(btnAdd);acts.appendChild(btnDup);acts.appendChild(btnGenId);acts.appendChild(btnType);acts.appendChild(btnDel);el.appendChild(acts);el.appendChild(folder);
  if(node.generateId){var badge=document.createElement('div');badge.textContent='\uD83D\uDD11';badge.title='G\u00e9n\u00e8re un Bayard ID \u00e0 ce niveau';badge.style.cssText='position:absolute;top:-8px;right:-8px;background:#f1c40f;color:#000;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4);pointer-events:none;';folder.style.position='relative';folder.appendChild(badge);}
  if(node.collectionType){var tbadge=document.createElement('div');tbadge.textContent=node.collectionType;tbadge.title='Type : '+node.collectionType;tbadge.style.cssText='position:absolute;bottom:-8px;left:6px;background:#3498db;color:#fff;border-radius:8px;padding:1px 6px;font-size:9px;box-shadow:0 1px 3px rgba(0,0,0,.4);pointer-events:none;';folder.style.position='relative';folder.appendChild(tbadge);}
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
}
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

// ── Conversion canevas <-> template WFD (ArboTemplate) ──────────────────
// Le canevas (dNodes/dEdges, une boîte + un lien par dossier) et le
// template consommé par le nœud create_tree (arbre imbriqué
// {name, generateId, children[]}) ne sont pas la même forme — on convertit
// dans les deux sens, sans jamais faire porter cette conversion par
// l'utilisateur.
function dTreeToTemplate() {
  if (!dNodes.length) throw new Error('Le canevas est vide.');
  var childrenOf = {};
  var hasParent = {};
  var edgeToChild = {}; // childId -> {fromSide, toSide} de SON edge entrante
  dEdges.forEach(function(e) {
    (childrenOf[e.from] = childrenOf[e.from] || []).push(e.to);
    hasParent[e.to] = true;
    edgeToChild[e.to] = { fromSide: e.fromSide || 'right', toSide: e.toSide || 'left' };
  });
  var roots = dNodes.filter(function(n) { return !hasParent[n.id]; });
  if (roots.length !== 1) {
    throw new Error('Il faut exactement 1 dossier racine (sans parent) — trouvé ' + roots.length + '. Vérifiez les connexions.');
  }
  function build(nodeId) {
    var n = dNodes.find(function(x) { return x.id === nodeId; });
    var kids = (childrenOf[nodeId] || []).map(build);
    var conn = edgeToChild[nodeId]; // absent pour la racine (pas de parent)
    // x/y/fromSide/toSide : ignores par create_tree (qui ne lit que
    // name/generateId/children), utilises uniquement par dTemplateToTree
    // pour retrouver la disposition ET le connecteur exacts au rechargement.
    return {
      name: n.label, generateId: !!n.generateId, collectionType: n.collectionType || '',
      x: n.x, y: n.y,
      fromSide: conn ? conn.fromSide : undefined,
      toSide:   conn ? conn.toSide   : undefined,
      children: kids,
    };
  }
  return build(roots[0].id);
}

function dTemplateToTree(tpl) {
  dNodes = []; dEdges = []; dNextId = 1;
  var yByDepth = {};
  function place(nodeDef, parentId, depth) {
    var id = dNextId++;
    // Position dessinee si presente dans le template (sauvegarde apres ce
    // patch), sinon repli sur l'auto-layout generique (anciens templates
    // sauvegardes avant l'ajout de x/y).
    var hasPos = typeof nodeDef.x === 'number' && typeof nodeDef.y === 'number';
    var x = hasPos ? nodeDef.x : (depth * (DSN_W + 80) + 60);
    var y = hasPos ? nodeDef.y : (yByDepth[depth] || 40);
    dNodes.push({ id: id, label: nodeDef.name, x: x, y: y, color: null, generateId: !!nodeDef.generateId, collectionType: nodeDef.collectionType || '' });
    if (!hasPos) yByDepth[depth] = y + DSN_H + 30;
    if (parentId != null) dEdges.push({ from: parentId, to: id, fromSide: nodeDef.fromSide || 'right', toSide: nodeDef.toSide || 'left' });
    (nodeDef.children || []).forEach(function(child) { place(child, id, depth + 1); });
    return id;
  }
  place(tpl, null, 0);
  dFullRedraw();
}

// ── Sauver le canevas comme template WFD (table ArboTemplate) ───────────
function dsn_saveAsTemplate() {
  var tpl;
  try { tpl = dTreeToTemplate(); }
  catch (e) { toast('\u2717 ' + e.message); return; }

  var currentId = window._dsnTemplateId || '';
  var currentName = window._dsnTemplateName || '';
  var name = prompt('Nom du template :', currentName || 'Nouveau template');
  if (!name) return;

  var method = (currentId && name === currentName) ? 'PUT' : 'POST';
  var url = method === 'PUT' ? ('/api/arbo-templates/' + currentId) : '/api/arbo-templates';

  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, config: tpl }),
  })
  .then(function(r) { return r.json(); })
  .then(function(saved) {
    if (saved.error) { toast('\u2717 ' + saved.error); return; }
    window._dsnTemplateId = saved.id;
    window._dsnTemplateName = saved.name;
    toast('\u2713 Template "' + saved.name + '" sauvegardé');
  })
  .catch(function(e) { toast('\u2717 Erreur réseau : ' + e.message); });
}

// ── Charger un template WFD existant dans le canevas ────────────────────
function dsn_loadTemplate() {
  fetch('/api/arbo-templates')
    .then(function(r) { return r.json(); })
    .then(function(templates) {
      if (!templates.length) { toast('Aucun template sauvegardé'); return; }
      var list = templates.map(function(t, i) { return (i + 1) + '. ' + t.name; }).join('\n');
      var choice = prompt('Charger quel template ?\n' + list + '\n\nEntrez le numéro :');
      var idx = parseInt(choice, 10) - 1;
      if (isNaN(idx) || !templates[idx]) return;
      var picked = templates[idx];
      fetch('/api/arbo-templates/' + picked.id)
        .then(function(r) { return r.json(); })
        .then(function(full) {
          dSnapshot();
          dTemplateToTree(full.config);
          window._dsnTemplateId = full.id;
          window._dsnTemplateName = full.name;
          toast('\u2713 Template "' + full.name + '" chargé — ' + dNodes.length + ' dossier(s)');
        });
    })
    .catch(function(e) { toast('\u2717 Erreur réseau : ' + e.message); });
}

function dsn_checkDraft() {
  var raw = localStorage.getItem('dsnDraft');
  var btn = document.getElementById('btn-dsn-load');
  if (btn) btn.classList.toggle('hidden', !raw);
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
