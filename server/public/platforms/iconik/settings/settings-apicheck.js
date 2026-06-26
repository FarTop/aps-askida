console.log('[APICHECK] settings-apicheck LOADED — 2026-06-25 15:30');
/* ══════════════════════════════════════════════════════════════
   API CHECK — Module dédié v2
   - Check simple : présence des entités par env
   - Mirror Check : comparaison DD source/destination avec ACLs
   - Exclusions : teams système, noms personnalisés
   ══════════════════════════════════════════════════════════════ */

// ── Scopes avec endpoints validés ───────────────────────────────────────────
const API_CHECK_SCOPES = [
  { id:'teams', label:'Teams',
    ep:'/API/users/v1/teams/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>teamsData.teams, localKey:o=>o.name||o.nom,
    deps:[],
    apiReqs:[
      {m:'GET', p:'/API/users/v1/teams/?per_page=500', d:'Lister Teams'},
      {m:'PUT', p:'/API/users/v1/teams/{{ID}}/', d:'Mettre à jour Team'},
    ]},

  { id:'users', label:'Users',
    ep:'/API/users/v1/users/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.email||o.name||o.id,
    local:()=>usersData.users, localKey:o=>o.email||o.name||o.nom,
    deps:['teams'], apiReqs:[{m:'GET', p:'/API/users/v1/users/?per_page=500', d:'Lister Users'}]},

  { id:'roleGroups', label:'Role Groups',
    ep:'/API/users/v1/role_groups/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>roleGroupsData.roleGroups, localKey:o=>o.name||o.nom,
    deps:[], apiReqs:[{m:'GET', p:'/API/users/v1/role_groups/?per_page=500', d:'Lister Role Groups'}]},

  { id:'collections', label:'Collections',
    ep:null, get:r=>(r.objects||[]), keyFn:o=>o.id,
    local:()=>collectionsData.collections, localKey:o=>o.id,
    deps:[], apiReqs:[{m:'POST', p:'/API/search/v1/search/', d:'Rechercher Collections', b:{doc_types:['collections'],per_page:500}}]},

  { id:'metadataViews', label:'MD Views',
    ep:'/API/metadata/v1/views/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>metadataViewsData.metadataViews, localKey:o=>o.name||o.id,
    deps:[], apiReqs:[{m:'GET', p:'/API/metadata/v1/views/?per_page=500', d:'Lister MD Views'}]},

  { id:'metadata', label:'Métadonnées',
    ep:'/API/metadata/v1/fields/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>metadonneesData.metadonnees, localKey:o=>o.nom||o.name,
    deps:['metadataViews'], apiReqs:[{m:'GET', p:'/API/metadata/v1/fields/?per_page=500', d:'Lister Champs Méta'}]},

  { id:'categories', label:'Catégories',
    ep:null, get:r=>(r.objects||[]), keyFn:o=>o.label||o.name,
    local:()=>categoriesData?.categories||[], localKey:o=>o.nom||o.name,
    deps:['metadataViews'], apiReqs:[
      {m:'GET', p:'/API/metadata/v1/assets/categories/', d:'Catégories Assets'},
      {m:'GET', p:'/API/metadata/v1/collections/categories/', d:'Catégories Collections'},
    ]},

  { id:'savedSearches', label:'Saved Searches',
    ep:'/API/search/v1/search/saved/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.title||o.id,
    local:()=>savedSearchesData?.savedSearches||[], localKey:o=>o.nom||o.name,
    deps:['metadataViews'], apiReqs:[{m:'GET', p:'/API/search/v1/search/saved/?per_page=500', d:'Lister Saved Searches'}]},

  { id:'storages', label:'Storages',
    ep:'/API/files/v1/storages/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>storagesData?.storages||[], localKey:o=>o.nom||o.name,
    deps:[], apiReqs:[{m:'GET', p:'/API/files/v1/storages/?per_page=500', d:'Lister Storages'}]},

  { id:'webhooks', label:'Webhooks',
    ep:'/API/notifications/v1/webhooks/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>(JSON.parse(localStorage.getItem('webhooksData')||'{}').webhooks)||[],
    localKey:o=>o.name||o.nom,
    deps:[], apiReqs:[{m:'GET', p:'/API/notifications/v1/webhooks/?per_page=500', d:'Lister Webhooks'}]},

  { id:'customActions', label:'Custom Actions',
    ep:'/API/assets/v1/custom_actions/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.title||o.name||o.id,
    local:()=>(JSON.parse(localStorage.getItem('customActionsData')||'{}').customActions)||[],
    localKey:o=>o.name||o.nom,
    deps:[], apiReqs:[
      {m:'GET', p:'/API/assets/v1/custom_actions/?per_page=500', d:'Lister Custom Actions'},
      {m:'POST', p:'/API/assets/v1/custom_actions/BULK/', d:'Créer Custom Action BULK'},
      {m:'POST', p:'/API/assets/v1/custom_actions/COLLECTION/', d:'Créer Custom Action COLLECTION'},
    ]},

  { id:'automations', label:'Automations',
    ep:'/API/automations/v1/automations/?per_page=500',
    get:r=>(r.objects||[]), keyFn:o=>o.name||o.id,
    local:()=>(JSON.parse(localStorage.getItem('automationsData')||'{}').automations)||[],
    localKey:o=>o.name||o.nom,
    deps:[], apiReqs:[{m:'GET', p:'/API/automations/v1/automations/?per_page=500', d:'Lister Automations'}]},

  { id:'relationTypes', label:'Relation Types',
    ep:'/API/assets/v1/assets/relation_types/?per_page=500',
    get:r=>(r.objects||[]).filter(o=>!o.is_system), keyFn:o=>o.name||o.id,
    local:()=>(JSON.parse(localStorage.getItem('relationTypesData')||'{}').relationTypes)||[],
    localKey:o=>o.name||o.nom,
    deps:[], apiReqs:[{m:'GET', p:'/API/assets/v1/assets/relation_types/?per_page=500', d:'Lister Relation Types'}]},
];

// ── Teams système à exclure par défaut ──────────────────────────────────────
const APICHK_SYSTEM_TEAMS = new Set(['administrator','everyone','all users']);
function apichkIsSystemTeam(name) {
  return APICHK_SYSTEM_TEAMS.has(String(name||'').toLowerCase().trim());
}

// ── État exclusions ──────────────────────────────────────────────────────────
let apichkExclusions = {
  systemTeams: true,
  systemCategories: true,
  systemCategoriesSrc: true,
  systemCategoriesDst: true,
  storages: true,
  users: true,
  customNames: [],
  excluded: {},
};

function apichkLoadExclusions() {
  try {
    const raw = localStorage.getItem('apichk_exclusions');
    if (raw) apichkExclusions = { ...apichkExclusions, ...JSON.parse(raw) };
  } catch {}
}

function apichkSaveExclusions() {
  try { localStorage.setItem('apichk_exclusions', JSON.stringify(apichkExclusions)); } catch {}
}

function apichkShouldExclude(scopeId, item) {
  const name = String(item.name || item.title || item.nom || '').toLowerCase().trim();
  const id = String(item.id || '');
  // Excluded by picker
  const excList = (apichkExclusions.excluded || {})[scopeId] || [];
  if (excList.some(e => String(e.id) === id || (e.name||'').toLowerCase().trim() === name)) return true;
  // System teams
  if (scopeId === 'teams' && apichkExclusions.systemTeams && apichkIsSystemTeam(name)) return true;
  // Storages
  if (scopeId === 'storages' && apichkExclusions.storages) return true;
  // Users
  if (scopeId === 'users' && apichkExclusions.users) return true;
  return false;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function apichkFetchCollections(base, headers) {
  try {
    let all = [], page = 1;
    while (true) {
      const r = await fetch(base + '/API/search/v1/search/?per_page=150&page=' + page, {
        method:'POST', headers:{...headers,'Content-Type':'application/json'},
        body: JSON.stringify({doc_types:['collections']})
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      for (const c of (data.objects||[])) {
        if (c.status && c.status!=='ACTIVE') continue;
        if (c.date_deleted) continue;
        all.push({ id:c.id, title:c.title||c.name||c.id, name:c.title||c.name||c.id, parent_id:c.parent_id||(c.in_collections&&c.in_collections[0])||null });
      }
      if (!data.objects?.length || page>=(data.pages||1) || page>50) break;
      page++;
    }
    const byId = {};
    all.forEach(c => { byId[c.id]=c; });
    function getPath(c, d) {
      if (d>10) return (c.title||'').trim();
      const p = c.parent_id && byId[c.parent_id];
      return p ? getPath(p,d+1)+' / '+(c.title||'').trim() : (c.title||'').trim();
    }
    all.forEach(c => { c._path = getPath(c,0); });
    return all;
  } catch(e) {
    const r = await fetch(base+'/API/assets/v1/collections/?per_page=500',{headers});
    if (!r.ok) return [];
    const data = await r.json();
    return (data.objects||[]).map(c=>({id:c.id,title:c.title||c.name||c.id,name:c.title||c.name||c.id,parent_id:c.parent_id||null,_path:c.title||c.name||c.id}));
  }
}

async function apichkFetchCategories(base, headers) {
  const SYSTEM_CATS = new Set(['default','generic','tag','tags','uncategorized','none','']);
  const eps = [
    {type:'assets',ep:'/API/metadata/v1/assets/categories/'},
    {type:'collections',ep:'/API/metadata/v1/collections/categories/'},
    {type:'segments',ep:'/API/metadata/v1/segments/categories/'},
    {type:'custom_actions',ep:'/API/metadata/v1/custom_actions/categories/'},
  ];
  const catMap = new Map();
  for (const {type,ep} of eps) {
    try {
      const r = await fetch(base+ep,{headers});
      if (!r.ok) continue;
      const data = await r.json();
      for (const cat of (data.objects||[])) {
        const key = (cat.name||'').toLowerCase();
        if (SYSTEM_CATS.has(key)) continue;
        if (catMap.has(key)) { catMap.get(key).object_types.push(type); }
        else { catMap.set(key,{id:cat.id,name:cat.name,label:cat.label||cat.name,object_types:[type],view_ids:cat.view_ids||[]}); }
      }
    } catch {}
  }
  return [...catMap.values()];
}

// ── Mirror Check — comparaison complète source/destination ──────────────────
async function apichkMirrorCheck(srcToken, dstToken, progressCb) {
  const srcBase = _ikBase(srcToken);
  const dstBase = _ikBase(dstToken);
  const srcH = {};
  const dstH = {};

  const results = [];
  const total = 15;
  let done = 0;
  const prog = (label) => { done++; progressCb && progressCb(done, total, label); };

  // 1) Teams
  prog('Teams…');
  const [srcTeams, dstTeams] = await Promise.all([
    fetch(srcBase+'/API/users/v1/teams/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/users/v1/teams/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({})
    )]);
  const srcTeamList = (srcTeams.objects||[]).filter(t => !apichkExclusions.systemTeams || !apichkIsSystemTeam(t.name)).filter(t => !apichkExclusions.customNames.some(n=>t.name?.toLowerCase()===n.toLowerCase()));
  const dstTeamByName = {};
  (dstTeams.objects||[]).forEach(t => { dstTeamByName[(t.name||'').toLowerCase()] = t; });
  const teamMissing = srcTeamList.filter(t => !dstTeamByName[(t.name||'').toLowerCase()]);
  const teamMatch = srcTeamList.filter(t => dstTeamByName[(t.name||'').toLowerCase()]);
  results.push({ id:'teams', label:'Teams', icon:'👥',
    summary: `${teamMatch.length}/${srcTeamList.length} présentes`,
    status: teamMissing.length===0 ? 'ok' : 'warn',
    details: teamMissing.map(t=>({ type:'missing', label:t.name, src:'✅', dst:'❌' })),
  });

  // 2) MD Views
  prog('Metadata Views…');
  const SYSTEM_VIEWS = new Set(['segment tags','tutorials']);
  const [srcViews, dstViews] = await Promise.all([
    fetch(srcBase+'/API/metadata/v1/views/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/metadata/v1/views/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const srcViewList = (srcViews.objects||[]).filter(v=>!SYSTEM_VIEWS.has((v.name||'').toLowerCase().trim()));
  const dstViewByName = {};
  (dstViews.objects||[]).forEach(v=>{ dstViewByName[(v.name||'').toLowerCase()]=v; });
  const viewDetails = [];
  // Fetch détail des vues pour comparer view_fields
  for (const srcV of srcViewList) {
    const key = (srcV.name||'').toLowerCase();
    const dstV = dstViewByName[key];
    if (!dstV) { viewDetails.push({type:'missing',label:srcV.name,src:'✅',dst:'❌'}); continue; }
    // Fetch détail src + dst
    const [srcVD, dstVD] = await Promise.all([
      fetch(srcBase+'/API/metadata/v1/views/'+srcV.id+'/',{headers:srcH}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(dstBase+'/API/metadata/v1/views/'+dstV.id+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);
    if (!srcVD || !dstVD) continue;
    // Comparer view_fields par nom+ordre
    const normFields = (fields) => (fields||[]).map(f=>f.name||'').join(',');
    const srcFields = normFields(srcVD.view_fields);
    const dstFields = normFields(dstVD.view_fields);
    if (srcFields !== dstFields) {
      const srcNames = (srcVD.view_fields||[]).map(f=>f.name||'');
      const dstNames = (dstVD.view_fields||[]).map(f=>f.name||'');
      const missing = srcNames.filter(n=>!dstNames.includes(n));
      const extra = dstNames.filter(n=>!srcNames.includes(n));
      const reordered = srcNames.join(',')!==dstNames.filter(n=>srcNames.includes(n)).join(',');
      if (missing.length) viewDetails.push({type:'field_missing',label:srcV.name+' — champs manquants: '+missing.join(', '),src:'✅',dst:'⚠️'});
      if (extra.length) viewDetails.push({type:'field_extra',label:srcV.name+' — champs en trop: '+extra.join(', '),src:'⚠️',dst:'✅'});
      if (reordered && !missing.length && !extra.length) viewDetails.push({type:'field_order',label:srcV.name+' — ordre des champs différent',src:'⚠️',dst:'⚠️'});
    }
  }
  results.push({ id:'metadataViews', label:'MD Views', icon:'📋',
    summary: viewDetails.length===0 ? srcViewList.length+' conformes' :
      (srcViewList.length-viewDetails.filter(d=>d.type==='missing').length)+'/'+srcViewList.length+' présentes, '+viewDetails.length+' divergence(s)',
    status: viewDetails.length===0?'ok':'warn',
    details: viewDetails,
  });

  // 3) Collections
  prog('Collections…');
  const isStorageCol = (c) => /^stockage/i.test(c._path||c.title||'');
  const [srcColsAll, dstCols] = await Promise.all([
    apichkFetchCollections(srcBase,srcH),
    apichkFetchCollections(dstBase,dstH)]);
  // Filtrer les collections storage si option activée
  const srcCols = apichkExclusions.storages ? srcColsAll.filter(c=>!isStorageCol(c)) : srcColsAll;
  const dstColByPath = {};
  dstCols.forEach(c=>{ dstColByPath[(c._path||c.title||'').toLowerCase().trim()]=c; });
  const colMissing = srcCols.filter(c=>!dstColByPath[(c._path||c.title||'').toLowerCase().trim()]);
  results.push({ id:'collections', label:'Collections', icon:'📁',
    summary:`${srcCols.length-colMissing.length}/${srcCols.length} présentes`,
    status:colMissing.length===0?'ok':'warn',
    details:colMissing.map(c=>({type:'missing',label:c._path||c.title,src:'✅',dst:'❌'})),
  });

  // 4) ACLs Team→Collection (sampling sur les collections racines)
  prog('ACLs Teams→Collections…');
  const aclDetails = [];
  // Index src teams id→name / dst teams name→id
  const srcTeamById = {};
  (srcTeams.objects||[]).forEach(t=>{srcTeamById[t.id]=t.name;});
  const dstTeamIdByName = {};
  (dstTeams.objects||[]).forEach(t=>{dstTeamIdByName[(t.name||'').toLowerCase()]=t.id;});
  // Index dst collections path→id
  const dstColIdByPath = {};
  dstCols.forEach(c=>{dstColIdByPath[(c._path||c.title||'').toLowerCase()]=c.id;});
  // Vérifier ACLs sur collections racines source (parent_id null), hors storages
  const rootCols = srcCols.filter(c=>!c.parent_id && !isStorageCol(c)).slice(0,20);
  for (const srcCol of rootCols) {
    const aclSrc = await fetch(srcBase+'/API/acls/v1/acl/collections/'+srcCol.id+'/',{headers:srcH})
      .then(r=>r.ok?r.json():null).catch(()=>null);
    if (!aclSrc) continue;
    const dstColId = dstColIdByPath[(srcCol._path||srcCol.title||'').toLowerCase()];
    const aclDst = dstColId ? await fetch(dstBase+'/API/acls/v1/acl/collections/'+dstColId+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null) : null;

    // Groupes direct+propagating source
    const srcGroups = new Set([
      ...(aclSrc.groups_acl||[]).map(g=>srcTeamById[g.group_id]).filter(Boolean),
      ...(aclSrc.propagating_groups_acl||[]).map(g=>srcTeamById[g.group_id]).filter(Boolean),
    ].filter(n=>!apichkExclusions.systemTeams||!apichkIsSystemTeam(n))
     .filter(n=>!apichkExclusions.customNames.some(ex=>n?.toLowerCase()===ex.toLowerCase())));

    const dstGroups = aclDst ? new Set([
      ...(aclDst.groups_acl||[]).map(g=>{
        // Résoudre id → name via dstTeams
        const t = (dstTeams.objects||[]).find(x=>x.id===g.group_id);
        return t?.name||null;
      }).filter(Boolean),
      ...(aclDst.propagating_groups_acl||[]).map(g=>{
        const t = (dstTeams.objects||[]).find(x=>x.id===g.group_id);
        return t?.name||null;
      }).filter(Boolean),
    ]) : new Set();

    for (const teamName of srcGroups) {
      if (!dstGroups.has(teamName)) {
        aclDetails.push({type:'acl_missing',label:`${teamName} → ${srcCol._path||srcCol.title}`,src:'✅',dst:'❌'});
      }
    }
  }
  results.push({ id:'acls_collections', label:'ACLs Teams→Collections', icon:'🔐',
    summary: aclDetails.length===0?'Toutes vérifiées':`${aclDetails.length} droits manquants`,
    status: aclDetails.length===0?'ok':'warn',
    details: aclDetails,
  });

  // 5) Metadata fields
  prog('Metadata fields…');
  const [srcFields, dstFields] = await Promise.all([
    fetch(srcBase+'/API/metadata/v1/fields/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/metadata/v1/fields/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstFieldByName = {};
  (dstFields.objects||[]).forEach(f=>{dstFieldByName[(f.name||'').toLowerCase()]=f;});
  const fieldDetails = [];
  const normOptions = (opts) => (opts||[]).map(o=>o.value||'').sort().join('|');
  for (const srcF of (srcFields.objects||[])) {
    const key = (srcF.name||'').toLowerCase();
    const dstF = dstFieldByName[key];
    if (!dstF) { fieldDetails.push({type:'missing',label:srcF.name,src:'✅',dst:'❌'}); continue; }
    const diffs = [];
    if (srcF.field_type !== dstF.field_type) diffs.push('field_type: '+srcF.field_type+'→'+dstF.field_type);
    if ((srcF.label||'').toLowerCase() !== (dstF.label||'').toLowerCase()) diffs.push('label: "'+srcF.label+'"→"'+dstF.label+'"');
    if (srcF.required !== dstF.required) diffs.push('required: '+srcF.required+'→'+dstF.required);
    if (srcF.multi !== dstF.multi) diffs.push('multi: '+srcF.multi+'→'+dstF.multi);
    if (srcF.read_only !== dstF.read_only) diffs.push('read_only: '+srcF.read_only+'→'+dstF.read_only);
    if (normOptions(srcF.options) !== normOptions(dstF.options)) diffs.push('options différentes (src:'+srcF.options?.length+'/dst:'+dstF.options?.length+')');
    if (diffs.length) fieldDetails.push({type:'field_diff',label:srcF.name+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
  }
  results.push({ id:'metadata', label:'Metadata Fields', icon:'🏷️',
    summary: fieldDetails.length===0 ? (srcFields.objects||[]).length+' conformes' :
      (srcFields.objects||[]).length-fieldDetails.filter(d=>d.type==='missing').length+'/'+(srcFields.objects||[]).length+' présents, '+fieldDetails.length+' divergence(s)',
    status:fieldDetails.length===0?'ok':'warn',
    details:fieldDetails,
  });

  // 6) Custom Actions
  prog('Custom Actions…');
  const [srcCA, dstCA] = await Promise.all([
    fetch(srcBase+'/API/assets/v1/custom_actions/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/assets/v1/custom_actions/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstCAByTitle = {};
  (dstCA.objects||[]).forEach(a=>{dstCAByTitle[(a.title||a.name||'').toLowerCase()]=a;});
  // Index vues dst pour résolution metadata_view
  const dstCAViewByName = {};
  (dstViews.objects||[]).forEach(v=>{if(v?.name) dstCAViewByName[v.id]=v.name;});
  const srcCAViewByName = {};
  (srcViews.objects||[]).forEach(v=>{if(v?.id) srcCAViewByName[v.id]=v.name;});
  const caDetails = [];
  for (const src of (srcCA.objects||[])) {
    const key = (src.title||src.name||'').toLowerCase();
    const dst = dstCAByTitle[key];
    if (!dst) { caDetails.push({type:'missing',label:src.title||src.name,src:'✅',dst:'❌'}); continue; }
    // disabled:true sur destination est intentionnel
    if (!src.disabled && dst.disabled) {
      caDetails.push({type:'status_info',label:(src.title||src.name)+' — désactivée sur destination (intentionnel)',src:'✅',dst:'ℹ️'});
    }
    const label = src.title||src.name;
    const diffs = [];
    if (src.url !== dst.url) diffs.push('url: "'+src.url+'"→"'+dst.url+'"');
    if (src.context !== dst.context) diffs.push('context: '+src.context+'→'+dst.context);
    if (src.type !== dst.type) diffs.push('type: '+src.type+'→'+dst.type);
    if (JSON.stringify(src.headers||{}) !== JSON.stringify(dst.headers||{})) diffs.push('headers différents');
    // metadata_view résolu par nom
    const srcMvName = srcCAViewByName[src.metadata_view] || src.metadata_view;
    const dstMvName = dstCAViewByName[dst.metadata_view] || dst.metadata_view;
    if (srcMvName !== dstMvName) diffs.push('metadata_view: "'+srcMvName+'"→"'+dstMvName+'"');
    if (diffs.length) caDetails.push({type:'param_diff',label:label+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
    // app_id : toujours différent entre domaines (Application Token spécifique)
    if (src.app_id && src.app_id !== dst.app_id) {
      caDetails.push({type:'status_info',label:label+' — App Token à reconfigurer manuellement sur la destination (app_id domaine-spécifique)',src:'ℹ️',dst:'ℹ️'});
    }
  }
  const caRealWarn = caDetails.filter(d=>d.type!=='status_info').length;
  const caFinalDetails = caDetails.filter(d=>d.type!=='status_info');
  // Regrouper les status disabled (type status_info avec label désactivée)
  const caDisabled = caDetails.filter(d=>d.type==='status_info' && d.label.includes('désactivée'));
  const caAppToken = caDetails.filter(d=>d.type==='status_info' && d.label.includes('App Token'));
  if (caDisabled.length) caFinalDetails.push({type:'status_info', label:caDisabled.length+' custom action(s) désactivée(s) sur destination — intentionnel, activation manuelle requise en production', src:'✅', dst:'ℹ️'});
  if (caAppToken.length) caFinalDetails.push({type:'status_info', label:caAppToken.length+' custom action(s) avec App Token à reconfigurer manuellement sur la destination', src:'ℹ️', dst:'ℹ️'});
  const caInfo = caDisabled.length + caAppToken.length;
  results.push({ id:'customActions', label:'Custom Actions', icon:'⚡',
    summary: caFinalDetails.length===0 ? (srcCA.objects||[]).length+' conformes' :
      (srcCA.objects||[]).length-caFinalDetails.filter(d=>d.type==='missing').length+'/'+(srcCA.objects||[]).length+' présentes'+(caInfo?' · ℹ️ voir notes':'')+(caRealWarn?' · '+caRealWarn+' divergence(s)':''),
    status: caRealWarn>0?'warn':caInfo>0?'info':'ok',
    details: caFinalDetails,
  });

  // 7) Webhooks
  prog('Webhooks…');
  const [srcWH, dstWH] = await Promise.all([
    fetch(srcBase+'/API/notifications/v1/webhooks/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/notifications/v1/webhooks/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstWHByName = {};
  (dstWH.objects||[]).forEach(w=>{dstWHByName[(w.name||'').toLowerCase()]=w;});
  const whDetails = [];
  for (const src of (srcWH.objects||[])) {
    const key = (src.name||'').toLowerCase();
    const dst = dstWHByName[key];
    if (!dst) { whDetails.push({type:'missing',label:src.name,src:'✅',dst:'❌'}); continue; }
    // status DISABLED sur destination est intentionnel
    if (src.status==='ENABLED' && dst.status==='DISABLED') {
      whDetails.push({type:'status_info',label:src.name+' — désactivé sur destination (intentionnel)',src:'✅',dst:'ℹ️'});
    } else if (src.status !== dst.status) {
      whDetails.push({type:'status_diff',label:src.name+' — status: src='+src.status+' / dst='+dst.status,src:'⚠️',dst:'⚠️'});
    }
    // Conformité paramètres
    const diffs = [];
    if (src.url !== dst.url) diffs.push('url: "'+src.url+'"→"'+dst.url+'"');
    if (src.event_type !== dst.event_type) diffs.push('event_type: '+src.event_type+'→'+dst.event_type);
    if (src.realm !== dst.realm) diffs.push('realm: '+src.realm+'→'+dst.realm);
    if (src.operation !== dst.operation) diffs.push('operation: '+src.operation+'→'+dst.operation);
    if ((src.query||'') !== (dst.query||'')) diffs.push('query différente');
    if (JSON.stringify(src.headers||null) !== JSON.stringify(dst.headers||null)) diffs.push('headers différents');
    if (diffs.length) whDetails.push({type:'param_diff',label:src.name+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
  }
  const whRealWarn = whDetails.filter(d=>d.type!=='status_info').length;
  const whInfo = whDetails.filter(d=>d.type==='status_info').length;
  const whFinalDetails = whDetails.filter(d=>d.type!=='status_info');
  if (whInfo) whFinalDetails.push({type:'status_info', label:whInfo+' webhook(s) DISABLED sur destination — intentionnel, activation manuelle requise en production', src:'✅', dst:'ℹ️'});
  results.push({ id:'webhooks', label:'Webhooks', icon:'🔗',
    summary: whFinalDetails.length===0 ? (srcWH.objects||[]).length+' conformes' :
      (srcWH.objects||[]).length-whFinalDetails.filter(d=>d.type==='missing').length+'/'+(srcWH.objects||[]).length+' présents'+(whInfo?' · ℹ️ voir notes':'')+(whRealWarn?' · '+whRealWarn+' divergence(s)':''),
    status: whRealWarn>0?'warn':whInfo>0?'info':'ok',
    details: whFinalDetails,
  });

  // 8) Saved Searches
  prog('Saved Searches…');
  const [srcSS, dstSS] = await Promise.all([
    fetch(srcBase+'/API/search/v1/search/saved/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/search/v1/search/saved/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstSSByName = {};
  (dstSS.objects||[]).forEach(s=>{dstSSByName[(s.name||'').toLowerCase()]=s;});
  const ssDetails = [];
  // Index vues pour résolution metadata_view_id
  const srcSSViewNameById = {};
  (srcViews.objects||[]).forEach(v=>{if(v?.id) srcSSViewNameById[v.id]=v.name;});
  const normCriteria = (criteria, isDs) => {
    if (!criteria) return '';
    const c = JSON.parse(JSON.stringify(criteria));
    // Normaliser metadata_view_id par nom
    if (c.metadata_view_id) {
      c.metadata_view_id = isDs
        ? ((dstViews.objects||[]).find(v=>v.id===c.metadata_view_id)?.name || c.metadata_view_id)
        : (srcSSViewNameById[c.metadata_view_id] || c.metadata_view_id);
    }
    // Retirer les champs qui varient par domaine
    delete c.created_by_user;
    if (c.filter?.terms) c.filter.terms = c.filter.terms.filter(t=>t.name!=='files.storage_id'&&t.name!=='storage_id');
    return JSON.stringify(c);
  };
  for (const srcS of (srcSS.objects||[])) {
    const key = (srcS.name||'').toLowerCase();
    const dstS = dstSSByName[key];
    if (!dstS) { ssDetails.push({type:'missing',label:srcS.name,src:'✅',dst:'❌'}); continue; }
    // Fetch détail pour criteria
    const [srcSD, dstSD] = await Promise.all([
      fetch(srcBase+'/API/search/v1/search/saved/'+srcS.id+'/',{headers:srcH}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(dstBase+'/API/search/v1/search/saved/'+dstS.id+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);
    const srcCrit = normCriteria(srcSD?.search_criteria_document?.criteria || srcSD?.criteria, false);
    const dstCrit = normCriteria(dstSD?.search_criteria_document?.criteria || dstSD?.criteria, true);
    if (srcCrit !== dstCrit) {
      ssDetails.push({type:'criteria_diff',label:srcS.name+' — critères de recherche différents',src:'⚠️',dst:'⚠️'});
    }
  }
  results.push({ id:'savedSearches', label:'Saved Searches', icon:'🔍',
    summary: ssDetails.length===0 ? (srcSS.objects||[]).length+' conformes' :
      (srcSS.objects||[]).length-ssDetails.filter(d=>d.type==='missing').length+'/'+(srcSS.objects||[]).length+' présentes, '+ssDetails.length+' divergence(s)',
    status:ssDetails.length===0?'ok':'warn',
    details:ssDetails,
  });

  // 9) Role Groups — présence + conformité roles + role_categories
  prog('Role Groups…');
  const [srcRG, dstRG] = await Promise.all([
    fetch(srcBase+'/API/users/v1/role_groups/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/users/v1/role_groups/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstRGByName = {};
  (dstRG.objects||[]).forEach(rg=>{dstRGByName[(rg.name||'').toLowerCase()]=rg;});
  const rgDetails = [];
  for (const src of (srcRG.objects||[])) {
    const key = (src.name||'').toLowerCase();
    const dst = dstRGByName[key];
    if (!dst) { rgDetails.push({type:'missing',label:src.name,src:'✅',dst:'❌'}); continue; }
    // Compare roles array
    const srcRoles = [...(src.roles||[])].sort().join(',');
    const dstRoles = [...(dst.roles||[])].sort().join(',');
    if (srcRoles !== dstRoles) {
      const missing = (src.roles||[]).filter(r=>!(dst.roles||[]).includes(r));
      const extra = (dst.roles||[]).filter(r=>!(src.roles||[]).includes(r));
      if (missing.length) rgDetails.push({type:'role_missing',label:src.name+' — rôles manquants: '+missing.join(', '),src:'✅',dst:'⚠️'});
      if (extra.length) rgDetails.push({type:'role_extra',label:src.name+' — rôles en trop: '+extra.join(', '),src:'⚠️',dst:'✅'});
    }
    // Compare role_categories
    const srcCats = src.role_categories||{};
    const dstCats = dst.role_categories||{};
    const catDiffs = Object.keys(srcCats).filter(k=>srcCats[k]!==dstCats[k]);
    if (catDiffs.length) {
      rgDetails.push({type:'category_diff',label:src.name+' — catégories différentes: '+catDiffs.map(k=>k+'(src:'+srcCats[k]+'/dst:'+dstCats[k]+')').join(', '),src:'⚠️',dst:'⚠️'});
    }
  }
  const rgOk = (srcRG.objects||[]).length - rgDetails.filter(d=>d.type==='missing').length;
  results.push({ id:'roleGroups', label:'Role Groups', icon:'🎭',
    summary: rgDetails.length===0 ? (srcRG.objects||[]).length+' conformes' : rgOk+'/'+(srcRG.objects||[]).length+' présents, '+rgDetails.length+' divergence(s)',
    status: rgDetails.length===0?'ok':'warn',
    details: rgDetails,
  });

  // 10) Automations — présence + conformité triggers/actions (hors IDs)
  prog('Automations…');
  const [srcAuto, dstAuto] = await Promise.all([
    fetch(srcBase+'/API/automations/v1/automations/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/automations/v1/automations/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const dstAutoByName = {};
  (dstAuto.objects||[]).forEach(a=>{dstAutoByName[(a.name||'').toLowerCase()]=a;});
  const autoDetails = [];
  // Index vues src→dst pour normalisation automations
  const srcAutoViewNameById2 = {};
  (srcViews.objects||[]).forEach(v=>{ if(v?.id) srcAutoViewNameById2[v.id]=v.name; });
  const dstAutoViewIdByName2 = {};
  (dstViews.objects||[]).forEach(v=>{ if(v?.name) dstAutoViewIdByName2[v.name.toLowerCase().trim()]=v.id; });

  // Helper: normalise trigger/action pour comparaison (résout IDs domaine-spécifiques)
  const normalizeAutoItem = (item, isDst) => {
    const params = {...(item.parameters||{})};
    // Résoudre metadata_view_id : remplacer par le nom de la vue pour comparaison neutre
    if (params.metadata_view_id) {
      if (!isDst) {
        // Source : remplacer ID par nom
        params.metadata_view_id = srcAutoViewNameById2[params.metadata_view_id] || params.metadata_view_id;
      } else {
        // Destination : chercher le nom via la map dst→nom
        const dstView = (dstViews.objects||[]).find(v=>v.id===params.metadata_view_id);
        params.metadata_view_id = dstView?.name || params.metadata_view_id;
      }
    }
    // collection_id/ids : toujours différents entre domaines, exclus
    delete params.collection_id;
    delete params.collection_ids;
    delete params.storage_id; delete params.asset_id;
    // objects (UPDATE_ACL) : normaliser group_ids par nom de team
    if (Array.isArray(params.objects)) {
      params.objects = params.objects.map(obj => {
        if (!Array.isArray(obj.group_ids)) return obj;
        const normalizedIds = obj.group_ids.map(gid => {
          if (!isDst) {
            // Source : ID → nom
            return srcTeamById[gid] || gid;
          } else {
            // Destination : ID → nom via dstTeams
            const t = (dstTeams.objects||[]).find(x=>x.id===gid);
            return t?.name || gid;
          }
        }).sort();
        return {...obj, group_ids: normalizedIds};
      }).sort((a,b) => JSON.stringify(a.group_ids) > JSON.stringify(b.group_ids) ? 1 : -1);
    }
    return JSON.stringify({type:item.type, params});
  };
  for (const src of (srcAuto.objects||[])) {
    const key = (src.name||'').toLowerCase();
    const dst = dstAutoByName[key];
    if (!dst) { autoDetails.push({type:'missing',label:src.name,src:'✅',dst:'❌'}); continue; }
    // Storage dans triggers/actions → note informative
    const hasStorage = JSON.stringify(src.triggers||[]).includes('storage_id') ||
                       JSON.stringify(src.actions||[]).includes('storage_id');
    if (hasStorage) {
      autoDetails.push({type:'status_info',
        label:src.name+' — contient un storage (spécifique au domaine, à configurer manuellement sur la destination)',
        src:'ℹ️', dst:'ℹ️'});
    }

    // Status — INACTIVE sur destination est intentionnel (sécurité env non-prod)
    if (src.status !== dst.status) {
      const intentional = src.status==='ACTIVE' && dst.status==='INACTIVE';
      autoDetails.push({
        type: intentional ? 'status_info' : 'status_diff',
        label: src.name+' — status: src='+src.status+' / dst='+dst.status+(intentional?' (intentionnel — activation manuelle requise en prod)':''),
        src: src.status==='ACTIVE'?'✅':'⚠️',
        dst: intentional?'ℹ️':'⚠️'
      });
    }
    // Triggers
    const srcTriggers = (src.triggers||[]).map(t=>normalizeAutoItem(t,false)).sort().join('|');
    const dstTriggers = (dst.triggers||[]).map(t=>normalizeAutoItem(t,true)).sort().join('|');
    if (srcTriggers !== dstTriggers) {
      autoDetails.push({type:'trigger_diff',label:src.name+' — triggers différents',src:'⚠️',dst:'⚠️'});
    }
    // Actions : normaliser avec résolution metadata_view_id
    const srcActions = (src.actions||[]).map(a=>normalizeAutoItem(a,false)).sort().join('|');
    const dstActions = (dst.actions||[]).map(a=>normalizeAutoItem(a,true)).sort().join('|');
    if (srcActions !== dstActions) {
      autoDetails.push({type:'action_diff',label:src.name+' — paramètres actions différents',src:'⚠️',dst:'⚠️'});
    }
  }
  // Regrouper les status_info en une seule ligne par type
  const autoRealDetails = autoDetails.filter(d=>d.type!=='status_info');
  const autoInfoItems = autoDetails.filter(d=>d.type==='status_info');
  const autoFinalDetails = [...autoRealDetails];
  if (autoInfoItems.length) {
    // Grouper par message type
    const inactiveCount = autoInfoItems.filter(d=>d.label.includes('INACTIVE')).length;
    const storageCount = autoInfoItems.filter(d=>d.label.includes('storage')).length;
    if (inactiveCount) autoFinalDetails.push({type:'status_info', label:inactiveCount+' automation(s) INACTIVE sur destination — intentionnel, activation manuelle requise en production', src:'✅', dst:'ℹ️'});
    if (storageCount) autoFinalDetails.push({type:'status_info', label:storageCount+' automation(s) avec storage — configuration manuelle du storage source/destination requise', src:'ℹ️', dst:'ℹ️'});
  }
  const autoRealWarn = autoRealDetails.length;
  const autoInfo = autoInfoItems.length;
  const autoOk = (srcAuto.objects||[]).length - autoRealDetails.filter(d=>d.type==='missing').length;
  const autoSummaryParts = [];
  autoSummaryParts.push(autoOk+'/'+(srcAuto.objects||[]).length+' présentes');
  if (autoRealWarn) autoSummaryParts.push(autoRealWarn+' divergence(s)');
  if (autoInfo) autoSummaryParts.push('ℹ️ voir notes');
  results.push({ id:'automations', label:'Automations', icon:'⚙️',
    summary: autoFinalDetails.length===0 ? (srcAuto.objects||[]).length+' conformes' : autoSummaryParts.join(', '),
    status: autoRealWarn>0?'warn':autoInfo>0?'info':'ok',
    details: autoFinalDetails,
  });

  // 11) Relation Types (custom uniquement)
  prog('Relation Types…');
  const [srcRT, dstRT] = await Promise.all([
    fetch(srcBase+'/API/assets/v1/assets/relation_types/?per_page=500',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/assets/v1/assets/relation_types/?per_page=500',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const srcRTCustom = (srcRT.objects||[]).filter(r=>!r.is_system);
  const dstRTByName = {};
  (dstRT.objects||[]).filter(r=>!r.is_system).forEach(r=>{dstRTByName[(r.name||'').toLowerCase()]=r;});
  const rtMissing = srcRTCustom.filter(r=>!dstRTByName[(r.name||'').toLowerCase()]);
  results.push({ id:'relationTypes', label:'Relation Types', icon:'🔗',
    summary: srcRTCustom.length===0 ? 'Aucun type custom' : (srcRTCustom.length-rtMissing.length)+'/'+srcRTCustom.length+' présents',
    status: rtMissing.length===0?'ok':'warn',
    details: rtMissing.map(r=>({type:'missing',label:r.name,src:'✅',dst:'❌'})),
  });

  // 12) Share Settings — comparaison valeur par valeur
  prog('Share Settings…');
  const SHARE_KEYS = ['default_share_options','share_expiration_time','external_share',
    'allow_invites_by_link','allow_share_magic_link_creation','enforce_magic_link_allowlist','search_users_from_share'];
  const [srcShare, dstShare] = await Promise.all([
    fetch(srcBase+'/API/settings/v1/merged/current/',{headers:srcH}).then(r=>r.json()).catch(()=>({})),
    fetch(dstBase+'/API/settings/v1/merged/current/',{headers:dstH}).then(r=>r.json()).catch(()=>({}))]);
  const shareDetails = [];
  for (const key of SHARE_KEYS) {
    const sv = JSON.stringify(srcShare[key]??null);
    const dv = JSON.stringify(dstShare[key]??null);
    if (sv !== dv) {
      shareDetails.push({type:'value_diff', label:key+' : src='+sv+' / dst='+dv, src:'⚠️', dst:'⚠️'});
    }
  }
  results.push({ id:'shareSettings', label:'Share Settings', icon:'🔒',
    summary: shareDetails.length===0 ? 'Identiques' : shareDetails.length+' différence(s)',
    status: shareDetails.length===0?'ok':'warn',
    details: shareDetails,
  });

  // 13) Team Settings — homepage, search_view, sections, date_format par team
  prog('Team Settings…');
  const TEAM_SETTINGS_COMPARE = ['home_page','search_view_id','search_default_sections',
    'asset_default_sections','date_format','datetime_format','search_in_transcriptions',
    'append_asset_uuid_to_downloads','share_expiration_time','required_metadata_views',
    'filters_default_metadata_view_id','search_results_asset_metadata_view_id',
    'search_results_collection_metadata_view_id','acl_template_id'];
  const teamSettingsDetails = [];
  const srcTeamListAll = (srcTeams.objects||[]).filter(t=>!apichkExclusions.systemTeams||!apichkIsSystemTeam(t.name||''));
  for (const srcT of srcTeamListAll) {
    const dstT = dstTeamByName[(srcT.name||'').toLowerCase()];
    if (!dstT) continue; // déjà signalé dans Teams
    const [srcTS, dstTS] = await Promise.all([
      fetch(srcBase+'/API/settings/v1/team/'+srcT.id+'/',{headers:srcH}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(dstBase+'/API/settings/v1/team/'+dstT.id+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);
    if (!srcTS || !dstTS) continue;
    const diffs = [];
    for (const key of TEAM_SETTINGS_COMPARE) {
      let sv = srcTS[key], dv = dstTS[key];
      // Normaliser home_page : résoudre /collection/{id} par existence
      if (key==='home_page') {
        if (typeof sv==='string' && sv.startsWith('/collection/')) {
          const srcColId = sv.replace('/collection/','');
          // Vérifier si la collection existe sur la source
          const srcColExists = await fetch(srcBase+'/API/assets/v1/collections/'+srcColId+'/',{headers:srcH})
            .then(r=>r.ok?r.json():null).catch(()=>null);
          sv = srcColExists?.title ? '__col__:'+srcColExists.title : null;
        }
        if (typeof dv==='string' && dv.startsWith('/collection/')) {
          const dstColId = dv.replace('/collection/','');
          const dstColExists = await fetch(dstBase+'/API/assets/v1/collections/'+dstColId+'/',{headers:dstH})
            .then(r=>r.ok?r.json():null).catch(()=>null);
          dv = dstColExists?.title ? '__col__:'+dstColExists.title : null;
        }
      }
      // Normaliser view IDs par nom
      const VIEW_ID_KEYS = ['search_view_id','filters_default_metadata_view_id',
        'search_results_asset_metadata_view_id','search_results_collection_metadata_view_id'];
      if (VIEW_ID_KEYS.includes(key) && sv && dv) {
        // Résoudre par API directe pour garantir la résolution même si hors liste
        const [svView, dvView] = await Promise.all([
          fetch(srcBase+'/API/metadata/v1/views/'+sv+'/',{headers:srcH}).then(r=>r.ok?r.json():null).catch(()=>null),
          fetch(dstBase+'/API/metadata/v1/views/'+dv+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null),
        ]);
        sv = svView?.name || sv;
        dv = dvView?.name || dv;
      } else if (VIEW_ID_KEYS.includes(key)) {
        sv = srcViews.objects?.find(v=>v.id===sv)?.name || sv;
        dv = dstViews.objects?.find(v=>v.id===dv)?.name || dv;
      }
      // Normaliser required_metadata_views
      if (key==='required_metadata_views' && Array.isArray(sv) && Array.isArray(dv)) {
        sv = sv.map(id=>srcViews.objects?.find(v=>v.id===id)?.name||id).sort().join(',');
        dv = dv.map(id=>dstViews.objects?.find(v=>v.id===id)?.name||id).sort().join(',');
      }
      if (JSON.stringify(sv??null) !== JSON.stringify(dv??null)) {
        diffs.push(key+': '+JSON.stringify(sv)+'→'+JSON.stringify(dv));
      }
    }
    if (diffs.length) teamSettingsDetails.push({type:'settings_diff',label:srcT.name+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
  }
  results.push({ id:'teamSettings', label:'Team Settings', icon:'⚙️',
    summary: teamSettingsDetails.length===0 ? srcTeamListAll.length+' conformes' : teamSettingsDetails.length+' divergence(s)',
    status: teamSettingsDetails.length===0?'ok':'warn',
    details: teamSettingsDetails,
  });

  // 14) Categories — associations vues/object_types
  prog('Categories…');
  const CAT_TYPES = ['assets','collections','segments','custom_actions','search'];
  const SYSTEM_CATS_SET = new Set(['default','generic','tag','tags','uncategorized','none','']);
  const catDetails = [];
  const srcCatMap = {}, dstCatMap = {};
  for (const type of CAT_TYPES) {
    const [srcC, dstC] = await Promise.all([
      fetch(srcBase+'/API/metadata/v1/'+type+'/categories/',{headers:srcH}).then(r=>r.ok?r.json():{}).catch(()=>{}),
      fetch(dstBase+'/API/metadata/v1/'+type+'/categories/',{headers:dstH}).then(r=>r.ok?r.json():{}).catch(()=>{}),
    ]);
    for (const cat of (srcC.objects||[])) {
      const k = (cat.name||'').toLowerCase();
      if (SYSTEM_CATS_SET.has(k)) continue;
      if (!srcCatMap[k]) srcCatMap[k] = {name:cat.name,types:[]};
      srcCatMap[k].types.push(type);
    }
    for (const cat of (dstC.objects||[])) {
      const k = (cat.name||'').toLowerCase();
      if (SYSTEM_CATS_SET.has(k)) continue;
      if (!dstCatMap[k]) dstCatMap[k] = {name:cat.name,types:[]};
      dstCatMap[k].types.push(type);
    }
  }
  for (const [k, srcCat] of Object.entries(srcCatMap)) {
    const dstCat = dstCatMap[k];
    if (!dstCat) { catDetails.push({type:'missing',label:srcCat.name,src:'✅',dst:'❌'}); continue; }
    const missingTypes = srcCat.types.filter(t=>!dstCat.types.includes(t));
    const extraTypes = dstCat.types.filter(t=>!srcCat.types.includes(t));
    if (missingTypes.length) catDetails.push({type:'type_missing',label:srcCat.name+' — object_types manquants: '+missingTypes.join(', '),src:'✅',dst:'⚠️'});
    if (extraTypes.length) catDetails.push({type:'type_extra',label:srcCat.name+' — object_types en trop: '+extraTypes.join(', '),src:'⚠️',dst:'✅'});
  }
  results.push({ id:'categories', label:'Catégories', icon:'🗂️',
    summary: catDetails.length===0 ? Object.keys(srcCatMap).length+' conformes' : catDetails.length+' divergence(s)',
    status: catDetails.length===0?'ok':'warn',
    details: catDetails,
  });

  // 15) ACLs complètes — toutes les collections avec détail permissions
  prog('ACLs complètes…');
  const aclFullDetails = [];
  // Normaliser permissions par nom de team
  const excludedTeamNames = new Set((apichkExclusions.excluded?.teams||[]).map(e=>(e.name||'').toLowerCase()));
  const excludedUserIds = new Set((apichkExclusions.excluded?.users||[]).map(e=>String(e.id)));
  const normalizeAcl = (aclObj, teamById) => {
    const groups = [
      ...(aclObj.groups_acl||[]).map(g=>({name:teamById[g.group_id]||g.group_id, perms:(g.permissions||[]).sort().join(',')})),
      ...(aclObj.propagating_groups_acl||[]).map(g=>({name:teamById[g.group_id]||g.group_id, perms:(g.permissions||[]).sort().join(','), propagating:true})),
    ].filter(g=>!apichkExclusions.systemTeams||!apichkIsSystemTeam(g.name))
     .filter(g=>!excludedTeamNames.has((g.name||'').toLowerCase()));
    // Les ACLs par user individuel sont ignorées (propres au domaine)
    // + exclusions users explicites déjà exclues via users_acl non inclus
    return JSON.stringify(groups.sort((a,b)=>a.name.localeCompare(b.name)));
  };
  // Index src/dst : teams + role groups pour résolution complète dans ACLs
  const srcTeamById2 = {};
  (srcTeams.objects||[]).forEach(t=>{srcTeamById2[t.id]=t.name;});
  (srcRG.objects||[]).forEach(t=>{srcTeamById2[t.id]=t.name;});
  const dstTeamById2 = {};
  (dstTeams.objects||[]).forEach(t=>{dstTeamById2[t.id]=t.name;});
  (dstRG.objects||[]).forEach(t=>{dstTeamById2[t.id]=t.name;});
  // Vérifier ACLs sur toutes les collections src (par lot de 10 pour ne pas surcharger)
  const colsToCheck = srcCols.slice(0,100); // limite à 100 collections
  let aclChecked = 0, aclDiff = 0;
  for (let i=0; i<colsToCheck.length; i+=10) {
    const batch = colsToCheck.slice(i, i+10);
    await Promise.all(batch.map(async srcCol => {
      const pathKey = (srcCol._path||srcCol.title||'').toLowerCase().trim();
      const dstCol = dstCols.find(c=>(c._path||c.title||'').toLowerCase().trim()===pathKey);
      if (!dstCol) return;
      const [aclSrc, aclDst] = await Promise.all([
        fetch(srcBase+'/API/acls/v1/acl/collections/'+srcCol.id+'/',{headers:srcH}).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(dstBase+'/API/acls/v1/acl/collections/'+dstCol.id+'/',{headers:dstH}).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if (!aclSrc || !aclDst) return;
      aclChecked++;
      // Comparer : tous les droits source sont-ils présents sur destination avec mêmes permissions ?
      // On ignore les droits supplémentaires sur la destination (users locaux, teams destination-only)
      const srcGroups = JSON.parse(normalizeAcl(aclSrc, srcTeamById2));
      const dstGroups = JSON.parse(normalizeAcl(aclDst, dstTeamById2));
      const dstGroupMap = {};
      dstGroups.forEach(g=>{ dstGroupMap[g.name+'|'+(g.propagating?'1':'0')] = g.perms; });
      const missing = srcGroups.filter(g => {
        const key = g.name+'|'+(g.propagating?'1':'0');
        return !dstGroupMap[key] || dstGroupMap[key] !== g.perms;
      });
      if (missing.length) {
        aclDiff++;
        aclFullDetails.push({type:'acl_diff',
          label:(srcCol._path||srcCol.title)+' — droits manquants: '+missing.map(g=>g.name+' ('+g.perms+')').join(', '),
          src:'⚠️',dst:'⚠️'});
      }
    }));
  }
  results.push({ id:'acls_full', label:'ACLs Collections (détail)', icon:'🔐',
    summary: aclFullDetails.length===0 ? aclChecked+' vérifiées, toutes conformes' : aclChecked+' vérifiées, '+aclDiff+' divergences',
    status: aclFullDetails.length===0?'ok':'warn',
    details: aclFullDetails,
  });

  return results;
}

// ── Render panneau principal ──────────────────────────────────────────────────
function detailApiCheck() {
  apichkLoadExclusions();
  const envs = (appTokensData.appTokens||[]).filter(t=>t.enabled!==false);
  if (!envs.length) {
    return `<div style="padding:20px;font-size:12px;color:var(--text-dim);">Aucun environnement configuré.</div>`;
  }
  const envOpts = [
    ...envs.map(t=>{
      const badge = t.environment==='prod'?'🟢':t.environment==='qa'?'🟡':'🔵';
      return `<option value="${escHtml(t.name)}">${badge} ${escHtml(t.name)}</option>`;
    }),
    '<option value="__APS__">🗄️ APS | Local</option>',
  ].join('');

  return `
    <!-- ── Onglets mode ── -->
    <div style="display:flex;gap:0;margin-bottom:10px;border-bottom:2px solid var(--border2);">
      <button id="apichk-tab-simple" onclick="apichkSwitchTab('simple')"
        style="padding:7px 18px;font-size:11px;font-weight:600;background:var(--accent);color:#000;border:none;border-radius:4px 4px 0 0;cursor:pointer;margin-right:2px;">
        🔍 Check Simple
      </button>
      <button id="apichk-tab-mirror" onclick="apichkSwitchTab('mirror')"
        style="padding:7px 18px;font-size:11px;font-weight:600;background:var(--bg3);color:var(--text-mid);border:none;border-radius:4px 4px 0 0;cursor:pointer;margin-right:2px;">
        🪞 Mirror Check
      </button>
      <button id="apichk-tab-aps" onclick="apichkSwitchTab('aps')"
        style="padding:7px 18px;font-size:11px;font-weight:600;background:var(--bg3);color:var(--text-mid);border:none;border-radius:4px 4px 0 0;cursor:pointer;margin-right:2px;">
        🗄️ APS Check
      </button>
      <button id="apichk-tab-excl" onclick="apichkSwitchTab('excl')"
        style="padding:7px 18px;font-size:11px;font-weight:600;background:var(--bg3);color:var(--text-mid);border:none;border-radius:4px 4px 0 0;cursor:pointer;">
        🚫 Exclusions
      </button>
    </div>

    <!-- ── Check Simple ── -->
    <div id="apichk-pane-simple">
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">Colonnes à comparer</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="apichk-ncols" onchange="apichkSetCols()" style="font-size:11px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);">
            <option value="1">1 colonne</option>
            <option value="2" selected>2 colonnes</option>
            <option value="3">3 colonnes</option>
          </select>
          <div id="apichk-col-selects" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
          <button onclick="apichkRun()" style="padding:5px 14px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;margin-left:auto;">🔍 Vérifier</button>
        </div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:8px 12px;margin-bottom:8px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input type="checkbox" id="apichk-show-details" onchange="apichkToggleDetails()"> Voir détails API
        </label>
        <input type="text" id="apichk-filter" placeholder="🔍 Filtrer résultats…" style="font-size:11px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);min-width:200px;" oninput="apichkFilterResults()">
        <select id="apichk-sort" onchange="apichkSortResults()" style="font-size:11px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);">
          <option value="divergence">Trier par divergence</option>
          <option value="alpha">Alphabétique</option>
          <option value="count">Par quantité</option>
        </select>
      </div>
      <div id="apichk-results" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- ── Mirror Check ── -->
    <div id="apichk-pane-mirror" style="display:none;">
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">Comparaison domaine → domaine</div>
        <!-- Selects source/destination -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8px;margin-bottom:8px;">
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:10px;color:var(--text-dim);font-weight:600;">◀ SOURCE</label>
            <select id="mirror-src" onchange="apichkRenderMirrorTags()" style="font-size:11px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);width:100%;"><option value="">— Source —</option>${envOpts}</select>
          </div>
          <button onclick="apichkMirrorRun()" style="padding:6px 18px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">🪞 Comparer</button>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:10px;color:var(--text-dim);font-weight:600;text-align:right;">DESTINATION ▶</label>
            <select id="mirror-dst" onchange="apichkRenderMirrorTags()" style="font-size:11px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);width:100%;"><option value="">— Destination —</option>${envOpts}</select>
          </div>
        </div>
        <!-- Tags : src à gauche, dst à droite, globaux centrés -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px;align-items:start;">
          <div id="apichk-mirror-tags-src" style="display:flex;flex-wrap:wrap;gap:2px;"></div>
          <div id="apichk-mirror-tags-global" style="display:flex;flex-wrap:wrap;gap:2px;justify-content:center;"></div>
          <div id="apichk-mirror-tags-dst" style="display:flex;flex-wrap:wrap;gap:2px;justify-content:flex-end;"></div>
        </div>
      </div>
      <!-- Option ACLs complètes -->
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <label class="apichk-excl-toggle" style="background:rgba(230,126,34,0.06);border-color:rgba(230,126,34,0.25);">
          <input type="checkbox" id="mirror-full-acls" onchange="apichkUpdateFullAclsWarning()">
          <span>🔐 ACLs complètes — vérifier <strong>toutes</strong> les collections (lent, ~3 min)</span>
        </label>
        <div id="mirror-full-acls-warning" style="display:none;font-size:10px;color:var(--c-warn);margin-top:5px;padding:4px 8px;background:rgba(230,126,34,0.08);border-radius:3px;">
          ⚠️ Cette option effectue ~1 appel API par collection. Avec 561 collections, comptez <strong>2 à 4 minutes</strong>.
        </div>
      </div>

      </div>
      <div id="mirror-progress" style="display:none;padding:8px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;margin-bottom:8px;font-size:11px;color:var(--text-dim);"></div>
      <div id="mirror-results"></div>
    </div>

    <!-- ── APS Check ── -->
    <div id="apichk-pane-aps" style="display:none;">
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">APS (local) ↔ Iconik — vérification de conformité</div>
        <div style="display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px;margin-bottom:8px;">
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:10px;color:var(--text-dim);font-weight:600;">🎯 DOMAINE ICONIK CIBLE</label>
            <select id="aps-check-env" style="font-size:11px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);width:100%;">
              <option value="">— Sélectionner un environnement —</option>${envOpts}
            </select>
          </div>
          <button onclick="apichkAPSRun()" style="padding:6px 18px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">🗄️ Comparer</button>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:6px;">
          Compare les données APS locales (localStorage) avec l'environnement Iconik sélectionné.<br>
          Utile pour valider une sync DS ou préparer une sync SD.
        </div>
        <!-- Option ACLs complètes (partagée avec Mirror Check) -->
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <label class="apichk-excl-toggle" style="background:rgba(230,126,34,0.06);border-color:rgba(230,126,34,0.25);">
            <input type="checkbox" id="aps-check-full-acls">
            <span>🔐 ACLs complètes — vérifier toutes les collections (lent, ~3 min)</span>
          </label>
        </div>
      </div>

      <div id="aps-check-progress" style="display:none;padding:8px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;margin-bottom:8px;font-size:11px;color:var(--text-dim);"></div>
      <div id="aps-check-results"></div>
    </div>

    <!-- ── Exclusions ── -->
    <div id="apichk-pane-excl" style="display:none;">
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:12px;margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">Options globales</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px;">
          <label class="apichk-excl-toggle"><input type="checkbox" id="excl-systemTeams" onchange="apichkToggleExcl('systemTeams',this.checked)" ${apichkExclusions.systemTeams?'checked':''}><span>Exclure les teams système (Administrator, Everyone…)</span></label>
          <label class="apichk-excl-toggle"><input type="checkbox" id="excl-storages" onchange="apichkToggleExcl('storages',this.checked)" ${apichkExclusions.storages?'checked':''}><span>Exclure les Storages et leurs collections</span></label>
          <label class="apichk-excl-toggle"><input type="checkbox" id="excl-users" onchange="apichkToggleExcl('users',this.checked)" ${apichkExclusions.users?'checked':''}><span>Exclure les Users</span></label>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <label class="apichk-excl-toggle"><input type="checkbox" id="excl-systemCategoriesSrc" onchange="apichkToggleExcl('systemCategoriesSrc',this.checked)" ${apichkExclusions.systemCategoriesSrc!==false?'checked':''}><span>Exclure catégories système <strong>source</strong></span></label>
            <label class="apichk-excl-toggle"><input type="checkbox" id="excl-systemCategoriesDst" onchange="apichkToggleExcl('systemCategoriesDst',this.checked)" ${apichkExclusions.systemCategoriesDst!==false?'checked':''}><span>Exclure catégories système <strong>destination</strong></span></label>
          </div>
        </div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:12px;margin-bottom:8px;">
        <div style="font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;">Exclusions personnalisées</div>
        <div style="font-size:11px;color:var(--text-mid);margin-bottom:8px;">Chargez les entités depuis un environnement (source ou destination) pour les exclure des comparaisons.</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
          <select id="apichk-excl-env" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);">
            <option value="">— Environnement —</option>
            ${envOpts}
          </select>
          <button onclick="apichkLoadExclLists()" style="padding:4px 12px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:11px;cursor:pointer;">🔄 Charger</button>
          <span id="apichk-excl-load-status" style="font-size:10px;color:var(--text-dim);"></span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
          <select id="apichk-excl-scope" onchange="apichkRefreshExclPicker()" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);">
            <option value="teams">Teams</option>
            <option value="users">Users</option>
            <option value="metadataViews">MD Views</option>
            <option value="metadata">Métadonnées</option>
            <option value="savedSearches">Saved Searches</option>
            <option value="customActions">Custom Actions</option>
            <option value="webhooks">Webhooks</option>
            <option value="automations">Automations</option>
          </select>
          <input type="text" id="apichk-excl-filter" placeholder="🔍 Filtrer…" oninput="apichkRefreshExclPicker()" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);min-width:130px;">
          <select id="apichk-excl-picker" style="font-size:11px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);flex:1;min-width:160px;"><option value="">— Choisir —</option></select>
          <button onclick="apichkAddExclusion()" style="padding:4px 12px;background:var(--accent);color:#000;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer;">+ Exclure</button>
        </div>
        <div style="border-top:1px solid var(--border2);padding-top:8px;">
          <div style="font-size:10px;color:var(--text-dim);font-weight:600;margin-bottom:6px;">EXCLUSIONS ACTIVES</div>
          <div id="apichk-excl-chips" style="display:flex;flex-wrap:wrap;gap:3px;min-height:24px;"><span style="font-size:11px;color:var(--text-dim);">Aucune exclusion personnalisée</span></div>
        </div>
      </div>
    </div>
  `;}

// ── Switch onglets ────────────────────────────────────────────────────────────
function apichkSwitchTab(tab) {
  ['simple','mirror','aps','excl'].forEach(t => {
    const pane = document.getElementById('apichk-pane-'+t);
    const btn = document.getElementById('apichk-tab-'+t);
    if (!pane || !btn) return;
    const active = t===tab;
    pane.style.display = active?'block':'none';
    btn.style.background = active?'var(--accent)':'var(--bg3)';
    btn.style.color = active?'#000':'var(--text-mid)';
  });
  if (tab==='simple') { setTimeout(apichkSetCols, 50); }
}

// ── Exclusions — état étendu ────────────────────────────────────────────────
let apichkExclLists = {};

function apichkExclScopeLabel(s) {
  return {teams:'Teams',users:'Users',metadataViews:'MD Views',collections:'Collections',metadata:'Métadonnées',
    savedSearches:'Saved Searches',customActions:'Custom Actions',webhooks:'Webhooks',
    automations:'Automations',roleGroups:'Role Groups',categories:'Catégories'}[s] || s;
}

function apichkAddExclusion() {
  const scope = document.getElementById('apichk-excl-scope')?.value;
  const picker = document.getElementById('apichk-excl-picker');
  if (!scope || !picker || !picker.value) return;
  const id = picker.value;
  const opt = picker.options[picker.selectedIndex];
  const rawName = opt?.text || id;
  // Strip env badge from display name
  const name = rawName.replace(/ \[.+\]$/, '').trim();
  const env = opt?.dataset?.env || '';
  if (!apichkExclusions.excluded) apichkExclusions.excluded = {};
  if (!apichkExclusions.excluded[scope]) apichkExclusions.excluded[scope] = [];
  if (!apichkExclusions.excluded[scope].some(e => String(e.id) === String(id))) {
    apichkExclusions.excluded[scope].push({ id, name, env });
    apichkSaveExclusions();
    apichkRenderExclChips();
    apichkRenderMirrorTags();
    toast('Exclusion ajoutée');
  }
  picker.value = '';
}

function apichkRemoveExclusion(scope, id) {
  if (!apichkExclusions.excluded?.[scope]) return;
  apichkExclusions.excluded[scope] = apichkExclusions.excluded[scope].filter(e => String(e.id) !== String(id));
  apichkSaveExclusions();
  apichkRenderExclChips();
  apichkRenderMirrorTags();
}

function apichkEnvColor(env) {
  if (!env) return {bg:'rgba(0,212,170,.12)', border:'rgba(0,212,170,.25)', text:'var(--accent)'};
  const t = (appTokensData.appTokens||[]).find(x=>x.name===env);
  if (!t) return {bg:'rgba(0,212,170,.12)', border:'rgba(0,212,170,.25)', text:'var(--accent)'};
  if (t.environment==='prod') return {bg:'rgba(0,212,170,.12)', border:'rgba(0,212,170,.4)', text:'var(--accent)'};
  if (t.environment==='qa')   return {bg:'rgba(230,126,34,.12)', border:'rgba(230,126,34,.3)', text:'var(--c-warn)'};
  return {bg:'rgba(52,152,219,.12)', border:'rgba(52,152,219,.3)', text:'#3498db'};
}

function apichkRenderExclChips() {
  const host = document.getElementById('apichk-excl-chips');
  if (!host) return;
  const all = apichkExclusions.excluded || {};
  const chips = [];
  for (const [scope, items] of Object.entries(all)) {
    for (const item of (items||[])) {
      const sid = escHtml(String(item.id));
      const ssc = escHtml(scope);
      const onclick = 'apichkRemoveExclusion(\'' + ssc + '\',\'' + sid + '\')';
      const c = apichkEnvColor(item.env);
      chips.push(
        '<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:'+c.bg+';border:1px solid '+c.border+';font-size:11px;margin:2px;">'
        + '<span style="color:var(--text-dim);font-size:9px;">' + escHtml(apichkExclScopeLabel(scope)) + '</span>'
        + '<span>' + escHtml(item.name||item.id) + '</span>'
        + (item.env ? '<span style="font-size:9px;color:'+c.text+';">['+escHtml(item.env)+']</span>' : '')
        + '<button onclick="' + onclick + '" style="border:none;background:transparent;color:var(--text-dim);cursor:pointer;font-size:12px;padding:0 2px;">x</button>'
        + '</span>'
      );
    }
  }
  host.innerHTML = chips.length ? chips.join('') : '<span style="font-size:11px;color:var(--text-dim);">Aucune exclusion personnalisée</span>';
}

function apichkRenderMirrorTags() {
  const hostSrc = document.getElementById('apichk-mirror-tags-src');
  const hostDst = document.getElementById('apichk-mirror-tags-dst');
  const hostGlobal = document.getElementById('apichk-mirror-tags-global');

  const srcEnv = document.getElementById('mirror-src')?.value || '';
  const dstEnv = document.getElementById('mirror-dst')?.value || '';

  const makeChip = (label, scope, envName) => {
    const c = apichkEnvColor(envName);
    const envBadge = envName ? '<span style="font-size:9px;color:'+c.text+';margin-left:2px;">['+escHtml(envName)+']</span>' : '';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:'+c.bg+';border:1px solid '+c.border+';font-size:11px;margin:2px;">🚫 '
      + '<span style="color:var(--text-dim);font-size:9px;">'+escHtml(apichkExclScopeLabel(scope))+':</span> '
      + escHtml(label) + envBadge + '</span>';
  };

  const makeGlobalChip = (label) =>
    '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:rgba(230,126,34,.12);border:1px solid rgba(230,126,34,.3);font-size:11px;margin:2px;">🚫 '+escHtml(label)+'</span>';

  const srcTags = [], dstTags = [];
  for (const [scope, items] of Object.entries(apichkExclusions.excluded || {})) {
    for (const item of (items||[])) {
      const chip = makeChip(item.name||item.id, scope, item.env);
      if (item.env === srcEnv) srcTags.push(chip);
      else if (item.env === dstEnv) dstTags.push(chip);
      else if (!item.env) { srcTags.push(chip); dstTags.push(chip); }
      else { srcTags.push(chip); } // env inconnu → src par défaut
    }
  }

  const globalTags = [];
  if (apichkExclusions.systemTeams) globalTags.push(makeGlobalChip('Teams système'));
  if (apichkExclusions.storages) globalTags.push(makeGlobalChip('Storages'));
  if (apichkExclusions.users) globalTags.push(makeGlobalChip('Users'));

  if (hostSrc) hostSrc.innerHTML = srcTags.join('');
  if (hostDst) hostDst.innerHTML = dstTags.join('');
  if (hostGlobal) hostGlobal.innerHTML = globalTags.join('');
}

async function apichkLoadExclLists() {
  const envName = document.getElementById('apichk-excl-env')?.value || document.getElementById('mirror-src')?.value;
  if (!envName) { toast('Sélectionnez un environnement', true); return; }
  const t = (appTokensData.appTokens||[]).find(x=>x.name===envName);
  if (!t) return;
  const base = _ikBase(t);
  const headers = {};
  const st = document.getElementById('apichk-excl-load-status');
  if (st) st.textContent = '⏳ ' + envName + '…';
  try {
    const [teams, views, fields, wh, ca, autos, ss, users] = await Promise.all([
      fetch(base+'/API/users/v1/teams/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/metadata/v1/views/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/metadata/v1/fields/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/notifications/v1/webhooks/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/assets/v1/custom_actions/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/automations/v1/automations/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/search/v1/search/saved/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
      fetch(base+'/API/users/v1/users/?per_page=500',{headers}).then(r=>r.json()).catch(()=>({})),
    ]);
    // Remplace la liste pour cet env (pas de merge — chaque env a sa propre liste)
    function toList(objects, mapFn) {
      return (objects||[]).map(o=>({...mapFn(o), env: envName})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    }
    apichkExclLists.teams         = toList(teams.objects,  o=>({id:o.id, name:o.name}));
    apichkExclLists.users         = toList(users.objects,  o=>({id:o.id, name:(o.first_name||'')+' '+(o.last_name||o.email||o.id)}));
    apichkExclLists.metadataViews = toList(views.objects,  o=>({id:o.id, name:o.name}));
    apichkExclLists.metadata      = toList(fields.objects, o=>({id:o.id||o.name, name:o.label||o.name}));
    apichkExclLists.webhooks      = toList(wh.objects,     o=>({id:o.id, name:o.name||o.url}));
    apichkExclLists.customActions = toList(ca.objects,     o=>({id:o.id, name:o.title||o.name}));
    apichkExclLists.automations   = toList(autos.objects,  o=>({id:o.id, name:o.name}));
    apichkExclLists.savedSearches = toList(ss.objects,     o=>({id:o.id, name:o.name}));
    // Mémoriser l'env courant pour le picker
    apichkExclLists._currentEnv = envName;
    apichkRefreshExclPicker();
    if (st) { st.textContent = '✅ ' + envName; setTimeout(()=>{ if(st) st.textContent=''; }, 2000); }
  } catch(e) { if (st) st.textContent = '❌ '+e.message; }
}

function apichkRefreshExclPicker() {
  const scope = document.getElementById('apichk-excl-scope')?.value;
  const picker = document.getElementById('apichk-excl-picker');
  const q = (document.getElementById('apichk-excl-filter')?.value||'').toLowerCase();
  if (!scope || !picker) return;
  const list = (apichkExclLists[scope]||[]).filter(o=>!q||((o.name||'')+''+o.id).toLowerCase().includes(q));
  const env = apichkExclLists._currentEnv || '';
  picker.innerHTML = '<option value="">— Choisir —</option>' + list.map(o=>
    '<option value="'+escHtml(String(o.id))+'" data-env="'+escHtml(o.env||env)+'">'+escHtml(o.name||o.id)+'</option>'
  ).join('');
}

// ── Exclusions helpers ────────────────────────────────────────────────────────
function apichkToggleExcl(key, val) {
  apichkExclusions[key] = val;
  apichkSaveExclusions();
  apichkRenderMirrorTags();
}

function apichkSaveCustomNames() {
  const ta = document.getElementById('excl-names');
  if (!ta) return;
  apichkExclusions.customNames = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
  apichkSaveExclusions();
  const st = document.getElementById('excl-save-status');
  if (st) { st.textContent='✓ Sauvegardé'; setTimeout(()=>{st.textContent='';},2000); }
}

// ── Mirror Check run ──────────────────────────────────────────────────────────
async function apichkMirrorRun() {
  const srcName = document.getElementById('mirror-src')?.value;
  const dstName = document.getElementById('mirror-dst')?.value;
  if (!srcName || !dstName) { toast('Sélectionnez source et destination', true); return; }
  if (srcName===dstName) { toast('Source et destination doivent être différentes', true); return; }

  const srcToken = srcName === '__APS__' ? { name: 'APS | Local', environment: 'local' } : appTokensData.appTokens.find(t=>t.name===srcName);
  const dstToken = dstName === '__APS__' ? { name: 'APS | Local', environment: 'local' } : appTokensData.appTokens.find(t=>t.name===dstName);
  if (!srcToken || !dstToken) { toast('Token introuvable', true); return; }

  const progEl = document.getElementById('mirror-progress');
  const resEl  = document.getElementById('mirror-results');
  if (progEl) { progEl.style.display='block'; progEl.textContent='⏳ Initialisation…'; }
  if (resEl) resEl.innerHTML='';

  // Utiliser APS_MirrorEngine si disponible, sinon fallback legacy
  if (window.APS_MirrorEngine && window.APS_Adapters) {
    try {
      const srcAdapter = (srcName === '__APS__')
        ? APS_Adapters.createAPS()
        : APS_Adapters.createIconik(srcToken);
      const dstAdapter = (dstName === '__APS__')
        ? APS_Adapters.createAPS()
        : APS_Adapters.createIconik(dstToken);
      const fullAcls   = document.getElementById('mirror-full-acls')?.checked || false;
      const excl = {
        systemTeams:        apichkExclusions.systemTeams,
        storages:           apichkExclusions.storages,
        customNames:        apichkExclusions.customNames || [],
        systemCategoriesSrc: apichkExclusions.systemCategoriesSrc !== false,
        systemCategoriesDst: apichkExclusions.systemCategoriesDst !== false,
      };
      const _jmMirror = window.WFD_JobManager;
      if (_jmMirror) _jmMirror.start({ kind: 'CHECK', label: 'Mirror Check', env: srcName + ' → ' + dstName });
      const results = await APS_MirrorEngine.run(srcAdapter, dstAdapter, {
        excl, fullAcls,
        onProgress: (done, total, label) => {
          if (progEl) progEl.textContent = `⏳ ${label} (${done}/${total})`;
          if (_jmMirror) _jmMirror.progress(done, total, label);
        }
      });
      if (_jmMirror) _jmMirror.done(results.map(r => (r.status==='ok'?'✅':'⚠️') + ' ' + r.label + ' — ' + r.summary));
      if (progEl) progEl.style.display='none';
      window.__apichkMirrorResults = { results, srcName, dstName, srcToken };
      renderMirrorResults(results, srcName, dstName);
    } catch(e) {
      if (window.WFD_JobManager) WFD_JobManager.fail(e);
      if (progEl) { progEl.textContent='❌ Erreur: '+e.message; }
      console.error('[Mirror Check]', e);
    }
  } else {
    // Fallback : ancienne implémentation directe
    try {
      const results = await apichkMirrorCheck(srcToken, dstToken, (done, total, label) => {
        if (progEl) progEl.textContent = `⏳ ${label} (${done}/${total})`;
      });
      if (progEl) progEl.style.display='none';
      window.__apichkMirrorResults = { results, srcName, dstName, srcToken };
      renderMirrorResults(results, srcName, dstName);
    } catch(e) {
      if (progEl) { progEl.textContent='❌ Erreur: '+e.message; }
    }
  }
}

// ── Render Mirror Results ─────────────────────────────────────────────────────
function renderMirrorResults(results, srcName, dstName, targetId='mirror-results', showExportBar=true) {
  const resEl = document.getElementById(targetId);
  if (!resEl) return;

  const totalOk = results.filter(r=>r.status==='ok').length;
  const totalWarn = results.filter(r=>r.status==='warn').length;
  const totalInfo = results.filter(r=>r.status==='info').length;
  const globalStatus = totalWarn===0 && totalInfo===0 ? 'ok' : totalWarn===0 ? 'info' : totalOk===0 ? 'error' : 'warn';
  const globalIcon = globalStatus==='ok'?'✅':globalStatus==='info'?'ℹ️':globalStatus==='warn'?'⚠️':'❌';
  const globalColor = globalStatus==='ok'?'var(--accent)':globalStatus==='info'?'#3498db':globalStatus==='warn'?'var(--c-warn)':'var(--c-danger)';
  const globalBg = globalStatus==='ok'?'rgba(0,212,170,0.08)':globalStatus==='info'?'rgba(52,152,219,0.08)':globalStatus==='warn'?'rgba(230,126,34,0.08)':'rgba(231,76,60,0.08)';

  const summaryHtml = `
    <div style="background:${globalBg};border:2px solid ${globalColor};border-radius:6px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:28px;">${globalIcon}</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:${globalColor};">
          ${globalStatus==='ok'?'Domaines synchronisés — miroir confirmé':globalStatus==='info'?'Miroir OK — '+totalInfo+' info(s) intentionnelle(s)':totalWarn+' scope(s) avec divergences'}
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">
          ${srcName} → ${dstName} · ${totalOk} OK${totalWarn?' · '+totalWarn+' divergences':''}${totalInfo?' · '+totalInfo+' info(s)':''}
        </div>
      </div>
      <div style="margin-left:auto;display:flex;gap:4px;flex-wrap:wrap;">
        <button onclick="exportMirrorReport('json')"    style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📄 JSON</button>
        <button onclick="exportMirrorReport('html')"    style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📑 HTML</button>
        <button onclick="exportMirrorReport('xlsx')"    style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📊 XLSX</button>
        <button onclick="exportMirrorReport('postman')" style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📮 Postman</button>
        <button onclick="exportMirrorReport('python')"  style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">🐍 Python</button>
        <button onclick="exportMirrorReport('shell')"   style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📟 Shell</button>
        <button onclick="exportMirrorReport('log')"     style="padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;">📋 Log</button>
      </div>
    </div>
  `;

  const detailsHtml = results.map(r => {
    const icon = r.status==='ok'?'✅':r.status==='info'?'ℹ️':'⚠️';
    const color = r.status==='ok'?'var(--accent)':r.status==='info'?'#3498db':'var(--c-warn)';
    const bg = r.status==='ok'?'':r.status==='info'?'rgba(52,152,219,0.05)':'rgba(230,126,34,0.05)';
    const border = r.status==='ok'?'var(--border2)':r.status==='info'?'rgba(52,152,219,0.4)':'var(--c-warn)';
    const accId = 'mirror-acc-'+r.id;

    const rowsHtml = r.details.length===0
      ? '<div style="padding:8px 12px;font-size:10px;color:var(--accent);">✅ Aucune divergence détectée</div>'
      : r.details.map(d=>`
          <div style="display:flex;align-items:center;gap:8px;padding:4px 12px;border-bottom:1px solid var(--border);font-size:10px;">
            <span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(d.label)}">${escHtml(d.label)}</span>
            <span style="color:var(--accent);min-width:20px;text-align:center;">${d.src}</span>
            <span style="color:var(--c-danger);min-width:20px;text-align:center;">${d.dst}</span>
          </div>`).join('');

    return `
      <div style="background:var(--bg2);border:1px solid ${border};border-radius:5px;overflow:hidden;margin-bottom:6px;${bg?'background:'+bg+';':''}">
        <div onclick="apichkToggle('${accId}')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;">
          <span id="${accId}-arrow" style="font-size:10px;color:var(--text-dim);transform:rotate(0deg);transition:transform .2s;">▶</span>
          <span style="font-size:16px;">${r.icon||icon}</span>
          <span style="flex:1;font-size:11px;font-weight:600;color:${color};">${escHtml(r.label)}</span>
          <span style="font-size:10px;color:var(--text-dim);">${escHtml(r.summary)}</span>
          <span style="font-size:14px;">${icon}</span>
        </div>
        <div id="${accId}" class="apichk-acc-body" style="display:none;border-top:1px solid var(--border);">
          ${r.details.length>0?`<div style="display:flex;gap:8px;padding:4px 12px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:9px;font-weight:700;color:var(--text-dim);"><span style="flex:1;">Élément</span><span>Source</span><span>Destination</span></div>`:''}
          <div style="max-height:350px;overflow-y:auto;">${rowsHtml}</div>
        </div>
      </div>
    `;
  }).join('');

  resEl.innerHTML = summaryHtml + detailsHtml;
  window.__apichkMirrorResults = { results, srcName, dstName };
}

// ── Export Mirror Report ──────────────────────────────────────────────────────
function exportMirrorReport(format='json') {
  const data = window.__apichkMirrorResults;
  if (!data) return;
  const { results, srcName, dstName, srcToken } = data;
  const meta = { srcLabel: srcName, dstLabel: dstName };
  if (window.APS_Exports) {
    switch(format) {
      case 'json':    APS_Exports.json(results, meta); break;
      case 'html':    APS_Exports.html(results, meta); break;
      case 'xlsx':    APS_Exports.xlsx(results, meta); break;
      case 'postman': APS_Exports.postman(null, srcToken, meta); break;
      case 'python':  APS_Exports.python(srcToken); break;
      case 'shell':   APS_Exports.shell(srcToken); break;
      case 'log':     APS_Exports.requestLog(results, meta); break;
      default:        APS_Exports.json(results, meta);
    }
  } else {
    // Fallback legacy JSON
    const payload = {
      schema: 'iconik-mirror-check', version: 1,
      exportedAt: new Date().toISOString(),
      source: srcName, destination: dstName,
      global: results.every(r=>r.status==='ok')?'OK':'DIVERGENCES',
      scopes: results.map(r=>({ id:r.id, label:r.label, status:r.status, summary:r.summary, divergences:r.details }))
    };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`mirror-check-${new Date().toISOString().slice(0,10)}.json`});
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  toast('Mirror Check exporté');
}

// ── Check Simple — inchangé ──────────────────────────────────────────────────
function apichkSetCols() {
  const n = parseInt(document.getElementById('apichk-ncols')?.value)||2;
  const wrap = document.getElementById('apichk-col-selects');
  if (!wrap) return;
  const envs = (appTokensData.appTokens||[]).filter(t=>t.enabled!==false);
  const localOpt = `<option value="__local__">📂 Local (Site)</option>`;
  const envOpts = envs.map(t=>{
    const badge = t.environment==='prod'?'🟢':t.environment==='qa'?'🟡':'🔵';
    return `<option value="${escHtml(t.name)}">${badge} ${escHtml(t.name)}</option>`;
  }).join('');
  const prev = [...wrap.querySelectorAll('select')].map(s=>s.value);
  wrap.innerHTML='';
  for (let i=0;i<n;i++) {
    const lbl = ['Colonne A','Colonne B','Colonne C'][i];
    const sel = document.createElement('select');
    sel.style.cssText='font-size:11px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);';
    sel.innerHTML=`<option value="">— ${lbl} —</option>${localOpt}${envOpts}`;
    if (prev[i]) sel.value=prev[i];
    wrap.appendChild(sel);
  }
}

let gApiCheckData=null, gColDefs=[];

async function apichkRun() {
  const wrap = document.getElementById('apichk-col-selects');
  const resultsEl = document.getElementById('apichk-results');
  if (!wrap||!resultsEl) return;
  const cols = [...wrap.querySelectorAll('select')].map(s=>s.value).filter(Boolean);
  if (!cols.length) { toast('Sélectionnez au moins une colonne',true); return; }
  resultsEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-dim);">⏳ Chargement…</div>';
  const colDefs = cols.map(name=>{
    if (name==='__local__') return {label:'📂 Local',token:null};
    const t = appTokensData.appTokens.find(x=>x.name===name);
    if (!t) return null;
    const badge = t.environment==='prod'?'🟢':t.environment==='qa'?'🟡':'🔵';
    return {label:`${badge} ${t.name}`,token:t};
  }).filter(Boolean);

  const allData = await Promise.all(API_CHECK_SCOPES.map(async scope=>{
    const colResults = await Promise.all(colDefs.map(async col=>{
      if (!col.token) {
        try {
          let items = scope.local()??[];
          if (scope.id==='collections') {
            const byId={};
            items.forEach(c=>{const key=c.id||c.nom||c.name||'';if(key) byId[key]=c;});
            function bp(col,d=0){if(d>20) return col.name||col.nom||col.id||'';const n=col.name||col.nom||col.id||'';if(!col.parent_id||!byId[col.parent_id]) return n;return bp(byId[col.parent_id],d+1)+' / '+n;}
            items=items.map(c=>{if(c._path) return c;return{...c,_path:bp(c,0)};});
          }
          items = items.filter(i=>!apichkShouldExclude(scope.id,i));
          return {items,error:null};
        } catch(e) {return {items:[],error:e.message};}
      }
      try {
        const base = _ikBase(col.token);
        const headers = {};
        if (scope.id==='collections') {
          const items = (await apichkFetchCollections(base,headers)).filter(i=>!apichkShouldExclude(scope.id,i));
          return {items,error:null};
        }
        if (scope.id==='categories') {
          const items = (await apichkFetchCategories(base,headers)).filter(i=>!apichkShouldExclude(scope.id,i));
          return {items,error:null};
        }
        if (scope.ep) {
          let r = await fetch(base+scope.ep,{headers});
          if (!r.ok) return {items:[],error:'HTTP '+r.status};
          const data = await r.json();
          const items = (scope.get(data)||[]).filter(i=>!apichkShouldExclude(scope.id,i));
          return {items,error:null};
        }
        return {items:[],error:'No endpoint'};
      } catch(e) {return {items:[],error:e.message};}
    }));
    return {scope,colResults};
  }));

  renderApiCheckResults(allData,colDefs);
}

function renderApiCheckResults(allData,colDefs) {
  gApiCheckData=allData; gColDefs=colDefs;
  // Bandeau résumé + boutons export (style harmonisé Mirror/APS)
  const resultsEl = document.getElementById('apichk-results');
  if (resultsEl) {
    const totalScopes = allData.length;
    const withDivergence = allData.filter(({colResults}) =>
      colResults.some(c => c.error || c.items.length === 0)
    ).length;
    const globalOk = withDivergence === 0;
    const globalColor = globalOk ? 'var(--accent)' : 'var(--c-warn)';
    const globalBg = globalOk ? 'rgba(0,212,170,0.08)' : 'rgba(230,126,34,0.08)';
    const globalIcon = globalOk ? '✅' : '⚠️';
    const colNames = colDefs.map(c => c.label).join(' · ');
    const BTN = 'padding:4px 8px;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:3px;font-size:10px;cursor:pointer;';
    const summaryHtml = '<div style="background:' + globalBg + ';border:2px solid ' + globalColor + ';border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<span style="font-size:22px;">' + globalIcon + '</span>' +
      '<div>' +
        '<div style="font-size:12px;font-weight:700;color:' + globalColor + ';">' +
          (globalOk ? 'Tout conforme — ' + totalScopes + ' scopes vérifiés' : withDivergence + ' scope(s) avec divergences') +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + colNames + '</div>' +
      '</div>' +
      '<div style="margin-left:auto;display:flex;gap:4px;flex-wrap:wrap;">' +
        '<button onclick="exporterAuditJSON()"    style="' + BTN + '">📄 JSON</button>' +
        '<button onclick="exporterAuditHTML()"    style="' + BTN + '">📑 HTML/PDF</button>' +
        '<button onclick="exporterAuditPostman()" style="' + BTN + '">📮 Postman</button>' +
        '<button onclick="exporterAuditPython()"  style="' + BTN + '">🐍 Python</button>' +
        '<button onclick="exporterAuditShell()"   style="' + BTN + '">📟 Shell</button>' +
      '</div>' +
    '</div>';
    resultsEl.innerHTML = summaryHtml + '<div id="apichk-results-inner" style="display:flex;flex-direction:column;gap:6px;"></div>';
  }
  apichkFilterResults();
}

function apichkFilterResults() {
  if (!gApiCheckData) return;
  const filter = (document.getElementById('apichk-filter')?.value||'').toLowerCase();
  const sortMode = document.getElementById('apichk-sort')?.value||'divergence';
  const resultsEl = document.getElementById('apichk-results-inner') || document.getElementById('apichk-results');
  if (!resultsEl) return;
  let filtered = gApiCheckData.filter(({scope})=>!filter||scope.label.toLowerCase().includes(filter)||(scope.ep||'').toLowerCase().includes(filter));
  if (sortMode==='divergence') {
    filtered.sort((a,b)=>{
      const aD=a.colResults.some(c=>c.error||c.items.length===0);
      const bD=b.colResults.some(c=>c.error||c.items.length===0);
      return aD&&!bD?-1:!aD&&bD?1:0;
    });
  } else if (sortMode==='count') {
    filtered.sort((a,b)=>b.colResults.reduce((s,c)=>s+(c.items?.length||0),0)-a.colResults.reduce((s,c)=>s+(c.items?.length||0),0));
  }
  resultsEl.innerHTML=filtered.map(({scope,colResults})=>apichkRenderAccordion(scope,gColDefs,colResults)).join('');
  document.querySelectorAll('.apichk-acc-body').forEach(el=>{el.style.display='none';});
}

function apichkSortResults(){apichkFilterResults();}

function apichkRenderAccordion(scope,colDefs,colResults) {
  const showDetails = document.getElementById('apichk-show-details')?.checked||false;
  const counts = colResults.map(c=>c.error?'❌':c.items.length);
  const hasError = colResults.some(c=>c.error);
  let hasDiff = false;
  if (colResults.length>=2&&!hasError) {
    // Pour collections : comparer par id
    const cmpFn = scope.id==='collections' ? o=>o.id : scope.keyFn;
    const sets = colResults.map(c=>new Set(c.items.map(i=>(cmpFn(i)||'').toLowerCase())));
    const ref=sets[0];
    hasDiff=sets.some(s=>s.size!==ref.size||[...ref].some(k=>!s.has(k)));
  }
  const statusIcon=hasError?'❌':hasDiff?'⚠️':'✅';
  const statusColor=hasError?'var(--c-danger)':hasDiff?'var(--c-warn)':'var(--accent)';
  const border=hasError?'var(--c-danger)':hasDiff?'var(--c-warn)':'var(--border2)';
  const countStr=counts.map((c,i)=>`${colDefs[i].label.replace(/[🟢🟡🔵📂]/u,'').trim()}: ${c}`).join(' · ');
  // Pour les collections : comparer par id (stable, unique), afficher par _path
  const displayFn = scope.id==='collections' ? o=>o._path||o.title||o.name||o.id : scope.keyFn;
  const compareFn = scope.id==='collections' ? o=>o.id : scope.keyFn;
  const allKeys=new Set();
  colResults.forEach(c=>c.items.forEach(i=>allKeys.add((compareFn(i)||'').toLowerCase())));
  // colMaps : clé = id pour comparaison, valeur = _path pour affichage
  const colMaps=colResults.map(c=>{const m={};c.items.forEach(i=>{const k=(compareFn(i)||'').toLowerCase();if(k) m[k]=displayFn(i);});return m;});
  const sortedKeys=[...allKeys].sort((a,b)=>{const aD=colMaps.some(m=>!m[a]);const bD=colMaps.some(m=>!m[b]);return aD&&!bD?-1:!aD&&bD?1:a.localeCompare(b);});
  const headerCols=colDefs.map(c=>`<div style="flex:1;font-size:9px;font-weight:700;color:var(--text-dim);letter-spacing:.05em;padding:0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.label)}</div>`).join('');
  const rows=sortedKeys.map(key=>{
    const allPresent=colMaps.every(m=>!!m[key]);
    const cells=colMaps.map((m,ci)=>{
      const val=m[key];const err=colResults[ci].error;
      if(err) return `<div style="flex:1;padding:3px 6px;font-size:10px;color:var(--c-danger);">—</div>`;
      if(!val) return `<div style="flex:1;padding:3px 6px;font-size:10px;color:var(--c-danger);">❌ absent</div>`;
      return `<div style="flex:1;padding:3px 6px;font-size:10px;color:${allPresent?'var(--text)':'var(--c-warn)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(val)}">${allPresent?'':'⚠️ '}${escHtml(val)}</div>`;
    }).join('');
    return `<div style="display:flex;border-bottom:1px solid var(--border);${allPresent?'':'background:rgba(230,126,34,0.06);'}">${cells}</div>`;
  }).join('');
  const errMsgs=colResults.map((c,i)=>c.error?`<div style="font-size:10px;color:var(--c-danger);padding:4px 8px;">${escHtml(colDefs[i].label)}: ${escHtml(c.error)}</div>`:'').join('');
  const detailsHtml=showDetails?`
    <div style="font-size:9px;color:var(--text-dim);padding:6px 8px;background:var(--bg3);border-top:1px solid var(--border);">
      <div><b>Endpoint:</b> <code style="color:var(--accent);">${escHtml(scope.ep||'/API/search/v1/search/ (POST)')}</code></div>
      ${scope.deps?.length?`<div><b>Dépendances:</b> ${scope.deps.map(d=>`<span style="color:var(--c-info);">${d}</span>`).join(', ')}</div>`:''}
      ${scope.apiReqs?.length?`<div style="margin-top:4px;">${scope.apiReqs.map(r=>`<div style="font-family:monospace;font-size:8.5px;"><span style="color:${r.m==='GET'?'#3498db':r.m==='POST'?'#00d4aa':'#e67e22'};font-weight:700;">${r.m}</span> ${escHtml(r.p)} — ${escHtml(r.d)}</div>`).join('')}</div>`:''}
    </div>`:''
  ;
  const accId='acc-'+scope.id;
  return `
    <div class="apichk-acc" style="border-color:${border};${hasError?'background:rgba(231,76,60,0.04);':hasDiff?'background:rgba(230,126,34,0.04);':''}">
      <div onclick="apichkToggle('${accId}')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;">
        <span id="${accId}-arrow" style="font-size:10px;color:var(--text-dim);transform:rotate(0deg);transition:transform .2s;">▶</span>
        <span style="font-size:14px;">${statusIcon}</span>
        <span style="flex:1;font-size:11px;font-weight:600;color:${statusColor};">${escHtml(scope.label)}</span>
        <span style="font-size:9px;color:var(--text-dim);">${escHtml(countStr)}</span>
      </div>
      <div id="${accId}" class="apichk-acc-body" style="display:none;border-top:1px solid var(--border);">
        ${errMsgs}
        <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg3);">${headerCols}</div>
        <div style="max-height:400px;overflow-y:auto;">${rows||'<div style="padding:8px;text-align:center;color:var(--text-dim);">Aucun élément</div>'}</div>
        ${detailsHtml}
      </div>
    </div>
  `;
}

function apichkToggle(id) {
  const el=document.getElementById(id); const arrow=document.getElementById(id+'-arrow');
  if (!el) return;
  const open=el.style.display!=='none';
  el.style.display=open?'none':'block';
  if (arrow) arrow.style.transform=open?'rotate(0deg)':'rotate(90deg)';
}

function apichkToggleDetails() {
  if (gApiCheckData) renderApiCheckResults(gApiCheckData,gColDefs);
}

function initApiCheck() {
  apichkLoadExclusions();
  setTimeout(apichkSetCols, 50);
  setTimeout(() => { apichkRenderExclChips(); apichkRenderMirrorTags(); }, 100);
}

// ── Collect audit data pour exports ──────────────────────────────────────────
function collectAuditData() {
  const org=localStorage.getItem('organisationName')||'';
  const date=new Date().toISOString();
  const colSelects=document.querySelectorAll('#apichk-col-selects select');
  const colLabels=[...colSelects].map(s=>{const opt=s.options[s.selectedIndex];return opt?opt.text:s.value;}).filter(Boolean);
  if (!colLabels.length) return null;
  const scopes=[];
  document.querySelectorAll('.apichk-acc-body').forEach(body=>{
    const accId=body.id;
    const scopeId=accId.replace('acc-','');
    const scope=API_CHECK_SCOPES.find(s=>s.id===scopeId);
    if (!scope) return;
    const headerEl=body.previousElementSibling;
    const countEl=headerEl?.querySelector('span:last-of-type');
    const statusEl=headerEl?.querySelector('span:first-of-type');
    const allRows=[];
    body.querySelectorAll('div[style*="border-bottom"]').forEach(row=>{
      const cells=[...row.children].map(c=>c.textContent.trim());
      if (cells.some(c=>c&&!c.includes('absent'))) allRows.push(cells);
    });
    scopes.push({id:scopeId,label:scope.label,endpoint:scope.ep||'/API/search/v1/search/ (POST)',status:statusEl?.textContent?.trim()||'',counts:countEl?.textContent?.trim()||'',rows:allRows.slice(1)});
  });
  return {org,date,columns:colLabels,scopes};
}

function exporterAuditJSON() {
  const status=document.getElementById('audit-export-status');
  const data=collectAuditData();
  if (!data){if(status) status.textContent="⚠️ Lancez d'abord une vérification";return;}
  const payload={schema:'iconik-api-audit',version:1,organisation:data.org,exportedAt:data.date,columns:data.columns,scopes:data.scopes.map(s=>({scope:s.label,endpoint:s.endpoint,status:s.status,counts:s.counts,items:s.rows}))};
  const org=(data.org||'iconik').replace(/\s+/g,'-');
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`${org}-audit-api-${data.date.split('T')[0]}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  if(status) status.textContent='✓ JSON exporté';
  toast('Audit JSON exporté');
}

function exporterAuditHTML() {
  const status=document.getElementById('audit-export-status');
  if(status) status.textContent='⚠️ Utilisez le Mirror Check pour un rapport HTML complet';
}

function exporterAuditPostman() {
  const status=document.getElementById('audit-export-status');
  const data=collectAuditData();
  if(!data){if(status) status.textContent="⚠️ Lancez d'abord une vérification";return;}
  const org=data.org||'Iconik';
  const envs=appTokensData.appTokens||[];
  const token=envs[0]||{};
  const base=(token.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
  const items=API_CHECK_SCOPES.filter(s=>s.ep&&s.apiReqs?.length).flatMap(s=>s.apiReqs.map(r=>({name:s.label+' — '+r.d,request:{method:r.m,header:[{key:'App-ID',value:'{{app_id}}'},{key:'Auth-Token',value:'{{auth_token}}'},{key:'Content-Type',value:'application/json'}],url:{raw:'{{base_url}}'+r.p},body:r.b?{mode:'raw',raw:JSON.stringify(r.b)}:undefined}})));
  const collection={info:{name:org+' — Iconik API',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},variable:[{key:'base_url',value:base},{key:'app_id',value:token.appId||''},{key:'auth_token',value:token.token||''}],item:items};
  const blob=new Blob([JSON.stringify(collection,null,2)],{type:'application/json'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:org+'-postman-collection.json'});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  if(status) status.textContent='✅ Collection Postman exportée';
}

function exporterAuditPython() {
  const status=document.getElementById('audit-export-status');
  const org=(localStorage.getItem('organisationName')||'Iconik').replace(/\s/g,'_');
  const envs=appTokensData.appTokens||[];
  const token=envs[0]||{};
  const base=(token.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
  const script=`#!/usr/bin/env python3\n"""Iconik API — ${org}\nGénéré par AFS"""\nimport requests\nBASE="${base}"\nHDR={"App-ID":"${token.appId||''}","Auth-Token":"${token.token||''}","Content-Type":"application/json"}\ndef get(p): return requests.get(BASE+p,headers=HDR).json()\ndef post(p,b): return requests.post(BASE+p,headers=HDR,json=b).json()\nget_teams=lambda:get("/API/users/v1/teams/?per_page=500").get("objects",[])\nget_views=lambda:get("/API/metadata/v1/views/?per_page=500").get("objects",[])\nget_fields=lambda:get("/API/metadata/v1/fields/?per_page=500").get("objects",[])\nget_collections=lambda:post("/API/search/v1/search/",{"doc_types":["collections"],"per_page":500}).get("objects",[])\nif __name__=="__main__":\n    print("Teams:",len(get_teams()))\n    print("Views:",len(get_views()))\n    print("Fields:",len(get_fields()))\n`;
  const blob=new Blob([script],{type:'text/plain;charset=utf-8'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:org+'-iconik.py'});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  if(status) status.textContent='✅ Script Python exporté';
}

function exporterAuditShell() {
  const status=document.getElementById('audit-export-status');
  const org=(localStorage.getItem('organisationName')||'Iconik').replace(/\s/g,'_');
  const token=(appTokensData.appTokens||[])[0]||{};
  const base=(token.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
  const script=`#!/bin/bash\nBASE="${base}"\nH=('-H' "App-ID: ${token.appId||''}" '-H' "Auth-Token: ${token.token||''}" '-H' 'Content-Type: application/json')\necho "Teams:"; curl -s "\${H[@]}" "$BASE/API/users/v1/teams/?per_page=500" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('objects',[])),' items')"\necho "Views:"; curl -s "\${H[@]}" "$BASE/API/metadata/v1/views/?per_page=500" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('objects',[])),' items')"\n`;
  const blob=new Blob([script],{type:'text/x-sh'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:org+'-iconik.sh'});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  if(status) status.textContent='✅ Script Shell exporté';
}

// ── CSS pour exclusions ──────────────────────────────────────────────────────
const apichkExclStyle=document.createElement('style');
apichkExclStyle.textContent=`
.apichk-excl-toggle {
  display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer;padding:6px 8px;
  background:var(--bg3);border:1px solid var(--border2);border-radius:4px;
  transition:border-color .15s;
}
.apichk-excl-toggle:hover { border-color:var(--accent); }
.apichk-excl-toggle input[type=checkbox] { accent-color:var(--accent); }
`;
document.head.appendChild(apichkExclStyle);


// ── APS Check ─────────────────────────────────────────────────────────────────
async function apichkAPSRun() {
  const envName = document.getElementById('aps-check-env')?.value;
  if (!envName) { toast('Sélectionnez un environnement Iconik', true); return; }

  const token = appTokensData.appTokens.find(t=>t.name===envName);
  if (!token) { toast('Token introuvable', true); return; }

  if (!window.APS_MirrorEngine || !window.APS_Adapters || !window.APS_Data) {
    toast('APS_MirrorEngine non disponible — vérifiez le chargement de aps-mirror-engine.js', true);
    return;
  }

  const progEl    = document.getElementById('aps-check-progress');
  const resEl     = document.getElementById('aps-check-results');
  if (progEl)    { progEl.style.display='block'; progEl.textContent='⏳ Initialisation…'; }
  if (resEl)     resEl.innerHTML='';

  // Vérifier que APS a des données
  const apsScopes = APS_Data.list(true);
  if (!apsScopes.length) {
    if (progEl) progEl.textContent='⚠️ APS vide — lancez d\'abord une sync DS';
    toast('APS vide \u2014 lancez une sync DS', true);
    return;
  }

  try {
    const srcAdapter = APS_Adapters.createAPS();
    const dstAdapter = APS_Adapters.createIconik(token);
    const fullAcls   = document.getElementById('aps-check-full-acls')?.checked || false;
    const excl = {
      systemTeams: apichkExclusions.systemTeams,
      storages:    apichkExclusions.storages,
      customNames: apichkExclusions.customNames || [],
    };

    const _jmAPS = window.WFD_JobManager;
    if (_jmAPS) _jmAPS.start({ kind: 'CHECK', label: 'APS Check', env: envName });
    const results = await APS_MirrorEngine.run(srcAdapter, dstAdapter, {
      excl, fullAcls,
      onProgress: (done, total, label) => {
        if (progEl) progEl.textContent = `⏳ ${label} (${done}/${total})`;
        if (_jmAPS) _jmAPS.progress(done, total, label);
      }
    });
    if (_jmAPS) _jmAPS.done(results.map(r => (r.status==='ok'?'✅':'⚠️') + ' ' + r.label + ' — ' + r.summary));
    if (progEl) progEl.style.display='none';

    window.__apichkAPSResults = { results, envName, token };
    renderMirrorResults(results, '🗄️ APS local', envName, 'aps-check-results', true);

  } catch(e) {
    if (window.WFD_JobManager) WFD_JobManager.fail(e);
    if (progEl) { progEl.textContent='❌ Erreur: '+e.message; }
    console.error('[APS Check]', e);
  }
}

function apichkAPSExport(format) {
  const data = window.__apichkAPSResults;
  if (!data || !window.APS_Exports) { toast('Lancez d\'abord un APS Check', true); return; }
  const { results, envName, token } = data;
  const meta = { srcLabel: '🗄️ APS local', dstLabel: envName };
  switch(format) {
    case 'json':    APS_Exports.json(results, meta); break;
    case 'html':    APS_Exports.html(results, meta); break;
    case 'xlsx':    APS_Exports.xlsx(results, meta); break;
    case 'postman': APS_Exports.postman(null, token, meta); break;
    case 'python':  APS_Exports.python(token); break;
    case 'shell':   APS_Exports.shell(token); break;
    case 'log':     APS_Exports.requestLog(results, meta); break;
  }
  toast('Export APS Check ✓');
}

// ── Exports window ───────────────────────────────────────────────────────────
window.detailApiCheck=detailApiCheck;
window.apichkSetCols=apichkSetCols;
window.apichkRun=apichkRun;
window.apichkToggle=apichkToggle;
window.apichkToggleDetails=apichkToggleDetails;
window.apichkFilterResults=apichkFilterResults;
window.apichkSortResults=apichkSortResults;
window.initApiCheck=initApiCheck;
window.apichkSwitchTab=apichkSwitchTab;
function apichkUpdateFullAclsWarning() {
  const checked = document.getElementById('mirror-full-acls')?.checked;
  const warn = document.getElementById('mirror-full-acls-warning');
  if (warn) warn.style.display = checked ? 'block' : 'none';
}
window.apichkUpdateFullAclsWarning=apichkUpdateFullAclsWarning;
function apichkExportDispatch(format, targetId) {
  if (targetId === 'aps-check-results') apichkAPSExport(format);
  else exportMirrorReport(format);
}
window.apichkExportDispatch=apichkExportDispatch;
window.apichkMirrorRun=apichkMirrorRun;
window.apichkAPSRun=apichkAPSRun;
window.apichkAPSExport=apichkAPSExport;
window.exportMirrorReport=exportMirrorReport;
window.apichkToggleExcl=apichkToggleExcl;
window.apichkAddExclusion=apichkAddExclusion;
window.apichkRemoveExclusion=apichkRemoveExclusion;
window.apichkRefreshExclPicker=apichkRefreshExclPicker;
window.apichkLoadExclLists=apichkLoadExclLists;
window.apichkRenderExclChips=apichkRenderExclChips;
window.apichkRenderMirrorTags=apichkRenderMirrorTags;
window.exporterAuditJSON=exporterAuditJSON;
window.exporterAuditHTML=exporterAuditHTML;
window.exporterAuditPostman=exporterAuditPostman;
window.exporterAuditPython=exporterAuditPython;
window.exporterAuditShell=exporterAuditShell;
window.collectAuditData=collectAuditData;
window.apichkFetchCategories=apichkFetchCategories;
window.apichkFetchCollections=apichkFetchCollections;
