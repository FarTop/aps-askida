// ================================================================
// TRADUCTION Workflow Designer → Node-RED (mode hybride consolidé)
// + Déploiement via API admin Node-RED (POST /flows) — Node-RED v4
// Vanilla JS (navigateur/Electron)
// ================================================================
const NR_BASE  = 'http://localhost:1881';
const NR_ADMIN = NR_BASE + '/';
function nrId(fluxId, nodeId) { return 'wfd-' + fluxId + '-' + nodeId; }

// ── Table de correspondance famille → type Node-RED (utilisée par translateGeneric)
const FAM_TO_NR = {
  source       : 'wfd-source',   // regroupe trigger/listener/watchfolder côté NR
  trigger      : 'wfd-source',   // (splitté dans le designer seulement)
  listener     : 'wfd-source',
  watchfolder  : 'wfd-source',
  fetch        : 'function',
  rename       : 'function',
  create_asset : 'function',
  create_col   : 'function',
  link_file    : 'function',
  update_meta  : 'function',
  acl          : 'function',
  relate       : 'function',
  notify_post  : 'function',
  transcode    : 'function',
  subflow      : 'link call',
  export_file  : 'wfd-export-file',
  publish      : 'wfd-publish',
  lookup       : 'wfd-lookup',
  decision     : 'switch',
  action       : 'http request',
  cast         : 'wfd-cast',
  loop         : 'wfd-loop',
  transform    : 'function',
  qc           : 'wfd-qc',
  approval     : 'wfd-approval',
  notification : 'wfd-notification',
  script       : 'function',
  export       : 'wfd-export',
  manual       : 'inject',
  set_var      : 'function',
};

// ═══════════════════════════════════════════════════════════════
// TRADUCTEURS
// ═══════════════════════════════════════════════════════════════

// Trigger → wfd-source
function translateTrigger(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg = node.config || {};
  const ev  = cfg.eventType || 'webhook'; // webhook | custom_action | saved_search | ...

  const httpPath = '/wfd/' + fluxId + '/' + node.id;
  const nr = {
    id   : nrId(fluxId, node.id),
    type : 'wfd-source',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    sourceType : (ev === 'saved_search' ? 'saved_search' : 'webhook'),
    endpoint   : cfg.webhookId || cfg.customActionId || httpPath,
    formats    : '',
    recursive  : false,
    savedSearchId: cfg.savedSearchId || '',
    pollInterval : String(cfg.pollInterval || '15'),
    pollUnit     : cfg.pollUnit || 'minutes',
    pollMode     : cfg.pollMode || 'each',
    pollLimit    : String(cfg.pollLimit || '100'),
    mdViewId     : cfg.mdViewId || '',
    iconikBase : iconikBase  || '',
    iconikAppId: iconikAppId || '',
    iconikToken: iconikToken || '',
    _wfd : { family:'trigger', ...cfg }
  };
  return nr;
}

// Listener → wfd-source
function translateListener(node, fluxId) {
  const cfg  = node.config || {};
  const conn = (cfg.connectionType || 'mqtt').toLowerCase();
  return {
    id   : nrId(fluxId, node.id),
    type : 'wfd-source',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    sourceType : (conn === 'http' ? 'http' : conn.startsWith('amqp') ? 'amqp' : 'mqtt'),
    endpoint   : cfg.endpoint || cfg.topic || '/listener/' + node.id,
    broker     : cfg.broker || '',
    host       : cfg.host   || '',
    qos        : String(cfg.qos || '0'),
    method     : (cfg.method || 'post').toLowerCase(),
    formats    : '',
    recursive  : false,
    _wfd : { family:'listener', ...cfg }
  };
}

// Watchfolder → wfd-source
function translateWatchfolder(node, fluxId) {
  const cfg = node.config || {};
  return {
    id   : nrId(fluxId, node.id),
    type : 'wfd-source',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    sourceType : 'watchfolder',
    endpoint   : cfg.path || '',
    formats    : cfg.formats || '',
    recursive  : !!cfg.recursive,
    _wfd : { family:'watchfolder', ...cfg }
  };
}

// Helper
function _pollToMs(interval, unit) {
  const n = parseInt(interval, 10) || 15;
  const factors = { minutes: 60, hours: 3600, days: 86400 };
  return n * (factors[unit] || 60);
}

function translateSource(node, fluxId) {
  const cfg = node.config || {};
  return {
    id   : nrId(fluxId, node.id),
    type : 'wfd-source',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    variant : cfg.variant  || 'webhook',
    endpoint: cfg.endpoint || '',
    formats : cfg.formats  || '',
  };
}

// Action → http request (corrigée + support collectionIds)
function translateAction(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver) {
  const cfg = node.config || {};
  const at  = (typeof ACTION_TYPES !== 'undefined' && ACTION_TYPES[cfg.actionType]) || {};
  const endpoint    = at.endpoint || '';
  const parts       = endpoint.split(' ');
  const method      = parts[0] || 'GET';
  let   urlTemplate = parts[1] || '';

  const res = resolver || { col:x=>x, view:x=>x, team:x=>x, field:x=>x };

  const key = cfg.actionType || '';
  let targetId = '';

  if (['collection_add_asset','collection_remove_asset','collection_update','collection_delete','acl_set_collection'].includes(key)) {
    const colIds = Array.isArray(cfg.collectionIds) ? cfg.collectionIds : (cfg.target ? [cfg.target] : []);
    targetId = res.col(colIds[0] || '');
  } else if (['metadata_write','metadata_patch','metadata_collection'].includes(key)) {
    targetId = res.view(cfg.target || '');
  } else if (['acl_set_asset','acl_remove'].includes(key)) {
    targetId = res.team(cfg.target || '');
  } else {
    targetId = cfg.target || '';
  }

  // Corrige placeholders alternatifs
  urlTemplate = urlTemplate.replace(/\{col_id\}|\{collection_id\}|\{view_id\}|\{obj_id\}/g, targetId);
  const url = (iconikBase || 'https://app.iconik.io') + urlTemplate;

  return {
    id   : nrId(fluxId, node.id),
    type : 'http request',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    method : method,
    ret    : 'obj',
    url    : url,
    tls    : '',
    headers: [
      { keyType:'str', keyValue:'App-ID',       valueType:'str', valueValue: iconikAppId || '' },
      { keyType:'str', keyValue:'Auth-Token',   valueType:'str', valueValue: iconikToken || '' },
      { keyType:'str', keyValue:'Content-Type', valueType:'str', valueValue: 'application/json' },
    ],
    ...cfg,
    _wfd: { family:'action', ...cfg, targetId },
  };
}

function translateDecision(node, fluxId) {
  const cfg = node.config || {};
  const conditions = cfg.conditions || [];
  const simpleOps = new Set(['equals','not_equals','gt','gte','lt','lte','is_empty','not_empty']);
  const canUseSwitch = conditions.every(c => simpleOps.has((c.op || '').toLowerCase()));
  if (canUseSwitch) {
    const map = { equals:'eq', not_equals:'neq', gt:'gt', gte:'gte', lt:'lt', lte:'lte', is_empty:'empty', not_empty:'nempty' };
    const rules = conditions.map(c => ({
      t: map[(c.op || '').toLowerCase()] || 'eq',
      v: (c.value ?? ''), vt: (typeof c.value === 'number' ? 'num' : 'str')
    }));
    rules.push({ t:'else' });
    return {
      id   : nrId(fluxId, node.id),
      type : 'switch',
      name : node.name,
      x : node.x, y: node.y, z: '',
      wires    : Array.from({length: conditions.length+1}, ()=>[]),
      property : cfg.field || 'payload', propertyType:'msg',
      rules, checkall:'false', outputs: conditions.length+1,
      _wfd: { family:'decision', conditions },
    };
  }
  const fn = [
    `const fieldPath = ${JSON.stringify(cfg.field || 'payload')};`,
    `const get = (obj, path)=>{ const parts=(path||'').split('.'); let v=obj; for(const p of parts){ v=v?.[p]; } return v; };`,
    `const val = get(msg, fieldPath);`,
    `const outs = Array(${conditions.length+1}).fill(null);`,
    `function test(cond){`,
    ` const op=(cond.op||'').toLowerCase(); const cval=cond.value;`,
    ` if (op==='starts_with')  return String(val||'').startsWith(String(cval||''));`,
    ` if (op==='ends_with')    return String(val||'').endsWith(String(cval||''));`,
    ` if (op==='contains')     return String(val||'').includes(String(cval||''));`,
    ` if (op==='not_contains') return !String(val||'').includes(String(cval||''));`,
    ` if (op==='regex'){ try{ return new RegExp(String(cval||''),'i').test(String(val||'')); }catch{ return false; } }`,
    ` if (op==='in_list')      return String(cval||'').split(/\\s*,\\s*/).includes(String(val||''));`,
    ` if (op==='not_in_list')  return !String(cval||'').split(/\\s*,\\s*/).includes(String(val||''));`,
    ` if (op==='equals')       return String(val)==String(cval);`,
    ` if (op==='not_equals')   return String(val)!=String(cval);`,
    ` if (op==='gt')           return Number(val)> Number(cval);`,
    ` if (op==='gte')          return Number(val)>=Number(cval);`,
    ` if (op==='lt')           return Number(val)< Number(cval);`,
    ` if (op==='lte')          return Number(val)<=Number(cval);`,
    ` if (op==='is_empty')     return (val===undefined||val===null||val==='');`,
    ` if (op==='not_empty')    return !(val===undefined||val===null||val==='');`,
    ` if (op==='between'){ const [a,b]=String(cval||'').split(',').map(Number); return Number(val)>=a && Number(val)<=b; }`,
    ` if (op==='not_between'){ const [a,b]=String(cval||'').split(',').map(Number); return !(Number(val)>=a && Number(val)<=b); }`,
    ` return false;`,
    `}`,
    `let routed=false; const conds=${JSON.stringify(conditions)};`,
    `for(let i=0;i<conds.length;i++){ if(test(conds[i])){ outs[i]=msg; routed=true; break; } }`,
    `if(!routed) outs[${conditions.length}]=msg;`,
    `return outs;`
  ].join('\n');
  return {
    id   : nrId(fluxId, node.id),
    type : 'function',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: Array.from({length: conditions.length+1}, ()=>[]),
    func : fn, outputs: conditions.length+1,
    _wfd : { family:'decision', conditions },
  };
}

function translateTransform(node, fluxId) {
  const cfg = node.config || {};
  const rules = cfg.rules || [];
  const parts = rules.map(r => r.value || r.field || '').filter(Boolean);
  const sep   = cfg.separator || '_';
  let code = `const parts=${JSON.stringify(parts)}; let result=parts.join(${JSON.stringify(sep)});\n`;
  if (cfg.caseMode === 'upper') code += `result=result.toUpperCase();\n`;
  if (cfg.caseMode === 'lower') code += `result=result.toLowerCase();\n`;
  if (cfg.maxLen)               code += `result=result.slice(0, ${cfg.maxLen});\n`;
  code += `msg.payload={...msg.payload, ${JSON.stringify(cfg.target || 'result')}:result};\nreturn msg;`;
  return {
    id   : nrId(fluxId, node.id),
    type : 'function',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    func : code, outputs:1,
    _wfd : { family:'transform', ...cfg },
  };
}

// Script → function (wrapper multi-sorties par labels)
function translateScript(node, fluxId) {
  const cfg   = node.config || {};
  const ports = cfg.ports || [{ label: 'output' }];
  const map = {}; ports.forEach((p,i)=>{ map[p.label]=i; });
  const code = [
    `// Script : ${node.name}`,
    `// Ports : ${ports.map(p=>p.label).join(', ')}`,
    (cfg.code || '// (vide)'),
    `let out = (typeof result !== 'undefined') ? result : undefined;`,
    `if (out && typeof out==='object' && out.port){`,
    ` const idx=(${JSON.stringify(map)})[out.port]; const wires=Array(${Math.max(1,ports.length)}).fill(null);`,
    ` const m=Object.assign({}, msg); if(Object.prototype.hasOwnProperty.call(out,'payload')) m.payload=out.payload;`,
    ` if(typeof idx==='number' && idx>=0){ wires[idx]=m; return wires; }`,
    ` wires[0]=m; return wires;`,
    `}`,
    `const wires=Array(${Math.max(1,ports.length)}).fill(null); wires[0]=msg; return wires;`
  ].join('\n');
  return {
    id   : nrId(fluxId, node.id),
    type : 'function',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: Array.from({length: Math.max(1, ports.length)}, ()=>[]),
    func : code,
    outputs: Math.max(1, ports.length),
    _wfd : { family:'script', lang: cfg.lang, ports },
  };
}

// Fetch (harmonisation fetchMetaField)
function translateFetch(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg    = node.config || {};
  const by     = cfg.fetchBy        || 'id';
  const type   = cfg.fetchType      || 'asset';
  const val    = cfg.fetchValue     || '';
  const field  = cfg.fetchMetaField || '';
  const resVar = cfg.resultVar      || 'asset';
  const mdView = cfg.fetchMdViewId  || '';

  const baseId  = nrId(fluxId, node.id);
  const httpId  = baseId + '-http';
  const postId  = baseId + '-post';

  // ── Nœud 1 : function — prépare la requête ───────────────────────────────
  const prepCode = `
  msg.payload = msg.payload || {};
  msg.wfd     = msg.wfd     || {};
  const ctx   = msg.payload;
  const wfd   = msg.wfd;
  const resolve = v => String(v||'').replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? wfd[k] ?? msg[k] ?? '');

  const base      = ${JSON.stringify(iconikBase || 'https://app.iconik.io')};
  const appId     = ${JSON.stringify(iconikAppId || '')};
  const authToken = ${JSON.stringify(iconikToken || '')};
  const fetchBy   = ${JSON.stringify(by)};
  const fetchType = ${JSON.stringify(type)};
  const rawVal    = ${JSON.stringify(val)};
  const value     = resolve(rawVal);

  msg.headers = { 'App-ID': appId, 'Auth-Token': authToken, 'Content-Type': 'application/json' };

  if (fetchBy === 'id') {
    msg.url    = base + (fetchType === 'asset'
      ? '/API/assets/v1/assets/' + value + '/'
      : '/API/assets/v1/collections/' + value + '/');
    msg.method = 'GET';
    delete msg.payload;
  } else if (fetchBy === 'metadata') {
    msg.url    = base + '/API/search/v1/search/';
    msg.method = 'POST';
    msg.payload = JSON.stringify({ query:'', doc_types:[fetchType==='asset'?'assets':'collections'],
      filter:{ operator:'AND', terms:[{ name:${JSON.stringify(field)}, value:value }] } });
  } else {
    msg.url    = base + '/API/search/v1/search/';
    msg.method = 'POST';
    msg.payload = JSON.stringify({ query:value, doc_types:[fetchType==='asset'?'assets':'collections'] });
  }
  msg._fetchResVar  = ${JSON.stringify(resVar)};
  msg._fetchBy      = fetchBy;
  return msg;
  `;

  // ── Nœud 2 : http request natif Node-RED ─────────────────────────────────
  const httpNode = {
    id      : httpId,
    type    : 'http request',
    name    : node.name + ' [HTTP]',
    method  : 'use',          // méthode lue depuis msg.method
    ret     : 'obj',          // réponse parsée en JSON automatiquement
    paytoqs : false,
    url     : '',             // URL lue depuis msg.url
    tls     : '',
    persist : false,
    proxy   : '',
    insecureHTTPParser: false,
    authType: '',
    x: node.x + 220, y: node.y, z: '',
    wires: [[postId]],
  };

  // ── Nœud 3 : function — traite la réponse ────────────────────────────────
  const postCode = `
  msg.wfd     = msg.wfd     || {};
  const resVar = msg._fetchResVar || 'asset';
  const by     = msg._fetchBy    || 'id';
  const data   = msg.payload     || {};
  const found  = (by === 'id') ? data : (data.objects||[])[0];

  // Restaurer le payload sauvegardé avant l'appel HTTP
  if (msg._savedPayload && typeof msg._savedPayload === 'object') {
    msg.payload = msg._savedPayload;
  } else {
    msg.payload = {};
  }

  if (!found || !found.id) {
    msg._fetchFound = false;
    return [null, msg];
  }
  msg.payload[resVar + '.id']            = found.id;
  msg.payload[resVar + '.title']         = found.title || found.name || '';
  msg.payload[resVar + '.metadata']      = found.metadata_values || {};
  msg.payload[resVar + '.status']        = found.status || '';
  msg.payload[resVar + '.in_collections']= found.in_collections || [];
  msg.payload[resVar + '.collection_id'] = (found.in_collections || [])[0] || '';
  msg.wfd[resVar + '.id']                = found.id;
  msg.wfd[resVar + '.title']             = found.title || found.name || '';
  msg.wfd[resVar + '.status']            = found.status || '';
  msg.wfd[resVar + '.collection_id']     = (found.in_collections || [])[0] || '';
  msg._fetchFound = true;
  return [msg, null];
  `;

  const prepNode = {
    id: baseId, type: 'function', name: node.name,
    x: node.x, y: node.y, z: '',
    wires: [[httpId]], func: prepCode, outputs: 1,
    _wfd: { family:'fetch' },
  };

  const postNode = {
    id: postId, type: 'function', name: node.name + ' [post]',
    x: node.x + 440, y: node.y, z: '',
    wires: [[], []], func: postCode, outputs: 2,
    _wfd: { family:'fetch_post' },
  };

  return [prepNode, httpNode, postNode];
}


function translateManual(node, fluxId) {
  const cfg = node.config || {};
  const payloadType = cfg.payloadType || 'date'; // 'date'|'str'|'num'|'json'|'bool'
  let payload = cfg.payload;
  const topic   = cfg.topic || '';

  if (payloadType === 'bool') {
    payload = (payload === true || payload === 'true');
  } else if (payloadType === 'num') {
    const n = Number(payload); payload = Number.isFinite(n) ? n : 0;
  } else if (payloadType === 'date') {
    payload = ''; // NR calculera la date
  } else {
    payload = String(payload ?? '');
  }

  const props = [
    { p:'payload', vt: payloadType },
    { p:'topic',   vt: 'str' },
  ];

  return {
    id   : nrId(fluxId, node.id),
    type : 'inject',
    name : node.name,
    x: node.x, y: node.y, z: '',
    wires: [[]],
    props,
    repeat   : '',
    crontab  : '',
    once     : false,
    onceDelay: 0.1,
    topic,
    payload,
    payloadType,
    _wfd : { family:'manual', ...cfg },
  };
}

// Rename
function translateRename(node, fluxId) {
  const cfg = node.config || {};
  const fnCode = `
  const ctx = msg.payload || {};
  const mode = ${JSON.stringify(cfg.mode || 'rules')};
  let name = ctx["asset.title"] || ctx["file.name"] || "";
  if (mode === 'template' || mode === 'both') {
    const tpl = \`${cfg.template || '{asset.title}'}\`;
    name = tpl.replace(/\\{([^}]+)\\}/g, (_,k)=> ctx[k] || ctx["metadata."+k] || "");
  }
  if (${JSON.stringify(cfg.saveOldNameIn || '')}) {
    ctx[${JSON.stringify(cfg.saveOldNameIn || 'old_name')}] = ctx["asset.title"] || "";
  }
  msg.payload["asset.title"]  = name;
  msg.payload["rename.result"] = name;
  return msg;
  `;
  return {
    id   : nrId(fluxId, node.id),
    type : 'function',
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    func : fnCode, outputs:1,
    _wfd : { family:'rename', mode: cfg.mode, template: cfg.template },
  };
}

// Create Asset — options complètes (title, status, mdViewId, metaFields[], collection, resultVar)
function translateCreateAsset(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg   = node.config || {};
  const baseId = nrId(fluxId, node.id);
  const httpId = baseId + '-http';
  const postId = baseId + '-post';

  const prepCode = `
  msg.wfd = msg.wfd || {}; msg.payload = msg.payload || {};
  const ctx = msg.payload; const wfd = msg.wfd;
  const resolve = v => String(v||'').replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? wfd[k] ?? '');
  const base = ${JSON.stringify(iconikBase||'https://app.iconik.io')};
  const appId = ${JSON.stringify(iconikAppId||'')};
  const authToken = ${JSON.stringify(iconikToken||'')};
  msg.url = base + '/API/assets/v1/assets/';
  msg.method = 'POST';
  msg.headers = { 'App-ID':appId, 'Auth-Token':authToken, 'Content-Type':'application/json' };
  msg.payload = JSON.stringify({ title: resolve(${JSON.stringify(cfg.title||'')}), status:'ACTIVE' });
  return msg;`;

  const postCode = `
  const asset = msg.payload || {};
  if (!asset.id) { return [null, msg]; }
  msg.wfd = msg.wfd || {}; msg.payload = msg.payload || {};
  msg.wfd['asset.id'] = asset.id; msg.wfd['asset.title'] = asset.title||'';
  msg.payload['asset.id'] = asset.id; msg.payload['asset.title'] = asset.title||'';
  return [msg, null];`;

  return [
    { id:baseId, type:'function', name:node.name, x:node.x, y:node.y, z:'', wires:[[httpId]], func:prepCode, outputs:1, _wfd:{family:'create_asset'} },
    { id:httpId, type:'http request', name:node.name+' [HTTP]', method:'use', ret:'obj', url:'', paytoqs:false, tls:'', persist:false, x:node.x+220, y:node.y, z:'', wires:[[postId]] },
    { id:postId, type:'function', name:node.name+' [post]', x:node.x+440, y:node.y, z:'', wires:[[],[]], func:postCode, outputs:2, _wfd:{family:'create_asset_post'} },
  ];
}


function translateCreateCol(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg    = node.config || {};
  const baseId = nrId(fluxId, node.id);
  const httpId = baseId + '-http';
  const postId = baseId + '-post';

  const prepCode = `
  msg.wfd = msg.wfd || {}; msg.payload = msg.payload || {};
  const ctx = msg.payload; const wfd = msg.wfd;
  const resolve = v => String(v||'').replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? wfd[k] ?? '');
  const base = ${JSON.stringify(iconikBase||'https://app.iconik.io')};
  const appId = ${JSON.stringify(iconikAppId||'')};
  const authToken = ${JSON.stringify(iconikToken||'')};
  msg.url = base + '/API/assets/v1/collections/';
  msg.method = 'POST';
  msg.headers = { 'App-ID':appId, 'Auth-Token':authToken, 'Content-Type':'application/json' };
  msg.payload = JSON.stringify({ title: resolve(${JSON.stringify(cfg.title||'')}), parent_id: resolve(${JSON.stringify(cfg.parentId||'')}) || null });
  return msg;`;

  const postCode = `
  const col = msg.payload || {};
  if (!col.id) { return [null, msg]; }
  msg.wfd = msg.wfd || {}; msg.payload = msg.payload || {};
  msg.wfd['collection.id'] = col.id; msg.wfd['collection.title'] = col.title||'';
  msg.payload['collection.id'] = col.id;
  return [msg, null];`;

  return [
    { id:baseId, type:'function', name:node.name, x:node.x, y:node.y, z:'', wires:[[httpId]], func:prepCode, outputs:1, _wfd:{family:'create_col'} },
    { id:httpId, type:'http request', name:node.name+' [HTTP]', method:'use', ret:'obj', url:'', paytoqs:false, tls:'', persist:false, x:node.x+220, y:node.y, z:'', wires:[[postId]] },
    { id:postId, type:'function', name:node.name+' [post]', x:node.x+440, y:node.y, z:'', wires:[[],[]], func:postCode, outputs:2, _wfd:{family:'create_col_post'} },
  ];
}


function translateLinkFile(node, fluxId, iconikBase, iconikAppId, iconikToken){
  const cfg = node.config || {};
  const baseUrl = iconikBase || 'https://app.iconik.io';
  const fn = `
  const base=${JSON.stringify(baseUrl)};
  const appId=${JSON.stringify(iconikAppId||'')};
  const token=${JSON.stringify(iconikToken||'')};
  const headers={ "App-ID":appId,"Auth-Token":token,"Content-Type":"application/json" };
  const ctx=msg.payload||{};
  const resVar=${JSON.stringify(cfg.resultVar||'file')};

  const assetId = \`${cfg.assetId||'{asset.id}'}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]??'');
  const filePath= \`${cfg.filePath||'{file.path}'}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]??'');
  const storageId=${JSON.stringify(cfg.storageId||'')};
  const fileType = String(${JSON.stringify(cfg.fileType||'original')}).toUpperCase();
  const format = ${JSON.stringify(cfg.format||'')};
  const genProxy = ${cfg.generateProxy?'true':'false'};
  const genKF    = ${cfg.generateKeyframes?'true':'false'};
  const setOnline= ${cfg.setOnline?'true':'false'};

  // 1) Format
  const fmtRes = await _fetch(base + "/API/files/v1/assets/" + assetId + "/formats/", { method:"POST", headers, body: JSON.stringify({ name: format||fileType, storage_id: storageId }) });
  if(!fmtRes.ok){ node.error("Create format failed: "+fmtRes.status); return [null,msg]; }
  const fmt = await fmtRes.json();

  // 2) File set
  const fsRes = await _fetch(base + "/API/files/v1/assets/" + assetId + "/file_sets/", { method:"POST", headers,
    body: JSON.stringify({ format_id: fmt.id, storage_id: storageId, name: filePath.split('/').pop() }) });
  if(!fsRes.ok){ node.error("Create file set failed: "+fsRes.status); return [null,msg]; }
  const fs = await fsRes.json();

  // 3) File
  const body = {
    original_name: filePath.split('/').pop(),
    file_set_id: fs.id, storage_id: storageId, file_path: filePath, file_type: fileType,
    ...(genProxy? { generate_proxies:true } :{}),
    ...(genKF   ? { generate_keyframes:true}:{}),
  };
  const fileRes = await _fetch(base + "/API/files/v1/assets/" + assetId + "/files/", { method:"POST", headers, body: JSON.stringify(body) });
  if(!fileRes.ok){ node.error("Link file failed: "+fileRes.status); return [null,msg]; }
  const file = await fileRes.json();

  // 4) Online ?
  if (setOnline) {
    try { await _fetch(base + "/API/assets/v1/assets/" + assetId + "/", { method:"PATCH", headers, body: JSON.stringify({ status:"ONLINE" }) }); } catch(_) {}
  }

  msg.payload[resVar + ".id"]   = file.id;
  msg.payload[resVar + ".path"] = filePath;
  return [msg,null];
  `;
  return { id:nrId(fluxId,node.id), type:'function', name:node.name, x:node.x, y:node.y, z:'',
           wires:[[],[]], func:fn, outputs:2, _wfd:{ family:'link_file', ...cfg } };
}

// Update Metadata — (target asset/collection) + mode (fields/view) + fields[] + method
function translateUpdateMeta(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg    = node.config || {};
  const target = cfg.target    || 'asset';
  const method = (cfg.method   || 'patch').toUpperCase();
  const fields = cfg.fields    || [];
  const mdView = cfg.mdViewId  || '';

  const baseId = nrId(fluxId, node.id);
  const httpId = baseId + '-http';
  const postId = baseId + '-post';

  const prepCode = `
  msg.wfd     = msg.wfd     || {};
  msg.payload = msg.payload || {};
  const ctx   = msg.payload;
  const wfd   = msg.wfd;
  const resolve = v => String(v||'').replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? wfd[k] ?? msg[k] ?? '');

  const base      = ${JSON.stringify(iconikBase || 'https://app.iconik.io')};
  const appId     = ${JSON.stringify(iconikAppId || '')};
  const authToken = ${JSON.stringify(iconikToken || '')};
  const target    = ${JSON.stringify(target)};
  const mdViewId  = resolve(${JSON.stringify(mdView)});
  const fields    = ${JSON.stringify(fields)};

  const targetId = resolve(ctx['asset.id'] || wfd['asset.id'] || '');
  const mvals = {};
  fields.forEach(f => { mvals[f.key] = resolve(f.value); });

  let path;
  if (mdViewId) {
    path = (target === 'asset')
      ? '/API/metadata/v1/assets/' + targetId + '/views/' + mdViewId + '/'
      : '/API/metadata/v1/collections/' + targetId + '/views/' + mdViewId + '/';
    msg.payload = JSON.stringify({ metadata_values: mvals });
  } else {
    path = (target === 'asset')
      ? '/API/assets/v1/assets/' + targetId + '/'
      : '/API/assets/v1/collections/' + targetId + '/';
    msg.payload = JSON.stringify(mvals);
  }

  msg.url     = base + path;
  msg.method  = ${JSON.stringify(method)};
  msg.headers = { 'App-ID': appId, 'Auth-Token': authToken, 'Content-Type': 'application/json' };
  return msg;
  `;

  const postCode = `
  const ok = msg.statusCode >= 200 && msg.statusCode < 300;
  if (!ok) { msg._error = 'update_meta HTTP ' + msg.statusCode; return [null, msg]; }
  return [msg, null];
  `;

  return [
    { id:baseId, type:'function', name:node.name,
      x:node.x, y:node.y, z:'', wires:[[httpId]], func:prepCode, outputs:1,
      _wfd:{ family:'update_meta' } },
    { id:httpId, type:'http request', name:node.name+' [HTTP]',
      method:'use', ret:'obj', url:'', paytoqs:false, tls:'', persist:false,
      x:node.x+220, y:node.y, z:'', wires:[[postId]] },
    { id:postId, type:'function', name:node.name+' [post]',
      x:node.x+440, y:node.y, z:'', wires:[[],[]], func:postCode, outputs:2,
      _wfd:{ family:'update_meta_post' } },
  ];
}


function translateAcl(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg     = node.config || {};
  const target  = cfg.target  || 'asset';
  const entries = cfg.entries || [];
  const op      = cfg.op      || 'add';
  const propagate = !!cfg.propagate;

  const baseId = nrId(fluxId, node.id);
  const httpId = baseId + '-http';
  const postId = baseId + '-post';

  // Génère une séquence de requêtes ACL via un seul nœud function
  // qui boucle avec des appels http natifs via msg._aclQueue
  const prepCode = `
  msg.wfd     = msg.wfd     || {};
  msg.payload = msg.payload || {};
  const ctx   = msg.payload;
  const wfd   = msg.wfd;
  const resolve = v => String(v||'').replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? wfd[k] ?? msg[k] ?? '');

  const base      = ${JSON.stringify(iconikBase || 'https://app.iconik.io')};
  const appId     = ${JSON.stringify(iconikAppId || '')};
  const authToken = ${JSON.stringify(iconikToken || '')};
  const target    = ${JSON.stringify(target)};
  const op        = ${JSON.stringify(op)};
  const entries   = ${JSON.stringify(entries)};
  const propagate = ${JSON.stringify(propagate)};

  const targetId = resolve(ctx['asset.id'] || wfd['asset.id'] || '');
  const ep = base + (target === 'asset'
    ? '/API/acls/v1/assets/' + targetId + '/access_control/'
    : '/API/acls/v1/collections/' + targetId + '/access_control/');

  // Construire la file de requêtes
  const queue = [];
  if (op === 'replace') queue.push({ url:ep, method:'DELETE', body:null });
  entries.forEach(e => {
    const perms = [...(e.read?['read']:[]), ...(e.write?['write']:[]), ...(e.delete?['delete']:[])];
    queue.push({ url:ep, method:'POST', body:JSON.stringify({ group_id:resolve(e.teamId||''), permissions:perms }) });
  });
  if (propagate) queue.push({ url:ep+'propagate/', method:'POST', body:'{}' });

  msg._aclQueue   = queue;
  msg._aclHeaders = { 'App-ID':appId, 'Auth-Token':authToken, 'Content-Type':'application/json' };
  msg._aclIdx     = 0;

  if (!queue.length) return [msg, null]; // rien à faire → port ok

  const first = queue[0];
  msg.url     = first.url;
  msg.method  = first.method;
  msg.headers = msg._aclHeaders;
  msg.payload = first.body;
  return msg;
  `;

  // Nœud post : si d'autres requêtes dans la queue, renvoie vers http
  const postCode = `
  if (msg.statusCode < 200 || msg.statusCode >= 300) {
    node.warn('ACL erreur HTTP ' + msg.statusCode);
  }
  msg._aclIdx = (msg._aclIdx || 0) + 1;
  const queue = msg._aclQueue || [];
  if (msg._aclIdx < queue.length) {
    const next = queue[msg._aclIdx];
    msg.url     = next.url;
    msg.method  = next.method;
    msg.headers = msg._aclHeaders;
    msg.payload = next.body;
    node.send(msg); // reboucle via wires[2] → http
    return;
  }
  return [msg, null]; // tout envoyé → port ok
  `;

  return [
    { id:baseId, type:'function', name:node.name,
      x:node.x, y:node.y, z:'', wires:[[httpId],[]], func:prepCode, outputs:2,
      _wfd:{ family:'acl' } },
    { id:httpId, type:'http request', name:node.name+' [HTTP]',
      method:'use', ret:'txt', url:'', paytoqs:false, tls:'', persist:false,
      x:node.x+220, y:node.y, z:'', wires:[[postId]] },
    { id:postId, type:'function', name:node.name+' [post]',
      x:node.x+440, y:node.y, z:'', wires:[[],[],[ httpId ]], func:postCode, outputs:3,
      _wfd:{ family:'acl_post' } },
  ];
}


function translateRelate(node, fluxId, iconikBase, iconikAppId, iconikToken) {
  const cfg = node.config || {};
  const base = nrId(fluxId, node.id);
  const fnCode = `
  const base = ${JSON.stringify(iconikBase || 'https://app.iconik.io')};
  const appId = ${JSON.stringify(iconikAppId || '')};
  const authToken = ${JSON.stringify(iconikToken || '')};
  const ctx = msg.payload || {};
  const headers = {"App-ID":appId,"Auth-Token":authToken,"Content-Type":"application/json"};

  const assetA = \`${cfg.assetA || '{asset.id}'}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]||"");
  const assetB = \`${cfg.assetB || '{new_asset.id}'}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]||"");
  const relType = ${JSON.stringify(cfg.relationType || 'derivative_of')};
  const dir     = ${JSON.stringify(cfg.direction    || 'a_to_b')};

  const makeRelation = (src, dst) => fetch(base + "/API/assets/v1/assets/" + src + "/relations/", {
    method:"POST", headers, body: JSON.stringify({ related_to_asset_id: dst, relation_type: relType })
  });

  if (dir === 'a_to_b' || dir === 'both') await makeRelation(assetA, assetB);
  if (dir === 'b_to_a' || dir === 'both') await makeRelation(assetB, assetA);

  return [msg, null];
  `;
  return {
    id   : base,
    type : 'function',
    name : node.name,
    x    : node.x,
    y    : node.y,
    z    : '',
    wires: [[],[]],
    func : fnCode,
    outputs: 2,
    _wfd : { family:'relate', relationType: cfg.relationType, direction: cfg.direction },
  };
}

// Notify POST — propage cfg
function translateNotifyPost(node, fluxId) {
  const cfg  = node.config || {};
  const base = nrId(fluxId, node.id);
  const fnCode = `
  const ctx = msg.payload || {};
  const resVar = ${JSON.stringify(cfg.resultVar || 'response')};

  const url    = \`${cfg['api-url'] || ''}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]||"");
  const method = ${JSON.stringify(cfg['api-method'] || 'POST')};
  const ct     = ${JSON.stringify(cfg['api-content-type'] || 'application/json')};
  let extraHeaders = {}; try { extraHeaders = JSON.parse(\`${(cfg['api-headers'] || '{}').replace(/`/g,'\\`')}\`); } catch {}
  const rawBody = \`${(cfg['api-body'] || '{}').replace(/`/g,'\\`')}\`;
  const bodyStr = rawBody.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]||"");

  const res = await _fetch(url, { method, headers:{ "Content-Type": ct, ...extraHeaders }, body: method!=='GET' ? bodyStr : undefined });
  if (!res.ok) { node.error("Notify POST failed: " + res.status); return [null, msg]; }
  const data = await res.json().catch(()=>({}));
  msg.payload[resVar] = data;
  return [msg, null];
  `;
  return {
    id   : base,
    type : 'function',
    name : node.name,
    x    : node.x,
    y    : node.y,
    z    : '',
    wires: [[],[]],
    func : fnCode,
    outputs: 2,
    ...cfg,
    _wfd : { family:'notify_post', ...cfg },
  };
}

// ───────────────────────────────────────────────────────────────


// Transcode — endpoint générique de job (preset, dest, collection, customOptions…)
function translateTranscode(node, fluxId, iconikBase, iconikAppId, iconikToken){
  const cfg = node.config || {};
  const baseUrl = iconikBase || 'https://app.iconik.io';
  const fn = `
  const base=${JSON.stringify(baseUrl)};
  const appId=${JSON.stringify(iconikAppId||'')};
  const token=${JSON.stringify(iconikToken||'')};
  const headers={ "App-ID":appId,"Auth-Token":token,"Content-Type":"application/json" };
  const ctx=msg.payload||{};
  const resVar=${JSON.stringify(cfg.resultVar||'transcode_job')};

  const assetId = \`${cfg.assetId||'{asset.id}'}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]??'');
  const preset  = ${JSON.stringify(cfg.preset || '')};
  const dest    = ${JSON.stringify(cfg.dest   || 'proxy')};
  const custom  = ${JSON.stringify(cfg.customOptions || {})};
  const collection = ${cfg.collection ? `\`${cfg.collection}\`.replace(/\\{([^}]+)\\}/g,(_,k)=>ctx[k]??'')` : '""'};

  const filesRes = await _fetch(base + "/API/files/v1/assets/" + assetId + "/files/", { headers });
  if (!filesRes.ok) { node.error("Get files failed"); return [null,msg]; }
  const files = await filesRes.json();
  const orig = (files.objects||[]).find(f=>f.file_type==="ORIGINAL") || (files.objects||[])[0];

  const jobBody = { asset_id: assetId, file_id: orig?.id, preset, dest, ...(collection?{collection_id:collection}:{}) , ...custom };
  const jr = await _fetch(base + "/API/transcode/v1/jobs/", { method:"POST", headers, body: JSON.stringify(jobBody) });
  if (!jr.ok) { node.error("Transcode failed: " + jr.status); return [null,msg]; }
  const job = await jr.json();

  msg.payload[resVar + ".id"]     = job.id || job.job_id || "";
  msg.payload[resVar + ".status"] = job.status || "STARTED";
  return [msg,null];
  `;
  return { id:nrId(fluxId,node.id), type:'function', name:node.name, x:node.x, y:node.y, z:'',
           wires:[[],[]], func:fn, outputs:2, _wfd:{ family:'transcode', ...cfg } };
}

// Subflow
function translateSubflow(node, fluxId) {
  const cfg = node.config || {};
  const base = nrId(fluxId, node.id);
  const targetFlowId = cfg.targetFlowId || '';
  const execMode = cfg.execMode || 'sync';
  const ctxMode  = cfg.ctxMode  || 'all';
  const inputVars  = cfg.inputVars  || [];
  const returnVars = cfg.returnVars || [];

  if (execMode === 'async') {
    return { id: base, type:'link out', name: node.name, x: node.x, y: node.y, z:'', wires:[[]],
             links:[targetFlowId ? 'wfd-' + targetFlowId + '-link-in' : ''], _wfd:{ family:'subflow', targetFlowId, execMode:'async' } };
  }

  const fnCode = [
    `const ctx = msg.payload || {};`,
    `const mode = ${JSON.stringify(ctxMode)};`,
    `if (mode === 'none') { msg.payload = {}; }`,
    `else if (mode === 'explicit') { const n={}; ${inputVars.map(v => `n[${JSON.stringify(v.dst||v.src)}] = ctx[${JSON.stringify(v.src)}] ?? "";`).join(' ')} msg.payload = n; }`,
    `return msg;`
  ].join('\n');

  const prepId = base + '-prep';
  const prepFn  = { id: prepId, type:'function', name: node.name+' (prep ctx)', x: node.x, y: node.y, z:'', wires:[[base]], func: fnCode, outputs:1 };
  const linkCall= { id: base, type:'link call', name: node.name, x: node.x+180, y: node.y, z:'', wires:[[]],
                    links:[targetFlowId ? 'wfd-'+targetFlowId+'-link-in' : ''], timeout: 30, _wfd:{ family:'subflow', targetFlowId, execMode:'sync', returnVars } };
  return [prepFn, linkCall];
}

// Set Variable → function node (résolution de variables + écriture dans msg.payload)
function translateSetVar(node, fluxId) {
  const cfg  = node.config || {};
  const rows = cfg.svRows || [];

  const lines = [
    'const ctx = msg.payload = msg.payload || {};',
    'msg.wfd = msg.wfd || {};',
    'const resolve = v => String(v||"").replace(/\\{([^}]+)\\}/g, (_,k) => ctx[k] ?? msg.wfd[k] ?? msg[k] ?? "");',
  ];

  rows.forEach(r => {
    if (!r.key) return;
    const keyStr   = JSON.stringify(r.key);
    const valueExpr = `resolve(${JSON.stringify(r.value || '')})`;
    if ((r.mode || 'set') === 'set') {
      lines.push(`ctx[${keyStr}] = ${valueExpr}; msg.wfd[${keyStr}] = ctx[${keyStr}];`);
    } else if (r.mode === 'append') {
      lines.push(`ctx[${keyStr}] = (ctx[${keyStr}] || '') + ${valueExpr}; msg.wfd[${keyStr}] = ctx[${keyStr}];`);
    } else if (r.mode === 'push') {
      lines.push(`if (!Array.isArray(ctx[${keyStr}])) ctx[${keyStr}] = [];`);
      lines.push(`ctx[${keyStr}].push(${valueExpr}); msg.wfd[${keyStr}] = ctx[${keyStr}];`);
    }
  });

  lines.push('return msg;');

  return {
    id     : nrId(fluxId, node.id),
    type   : 'function',
    name   : node.name,
    x : node.x, y: node.y, z: '',
    wires  : [[]],
    func   : lines.join('\n'),
    outputs: 1,
    _wfd   : { family: 'set_var', rows },
  };
}


// Export File / Publish (custom nodes) → translateGeneric (conserve wfd-*)
function translateExportFile(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver){ return translateGeneric(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); }
function translatePublish  (node, fluxId, iconikBase, iconikAppId, iconikToken, resolver){ return translateGeneric(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); }

// Generic (hybride) — propage tout cfg sur le node (lisibilité NR)
function translateGeneric(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver) {
  const cfg = node.config || {};
  return {
    id   : nrId(fluxId, node.id),
    type : FAM_TO_NR[node.family] || ('wfd-' + node.family),
    name : node.name,
    x : node.x, y: node.y, z: '',
    wires: [[]],
    // Crédentials communs pour les nœuds métier
    iconikBase  : iconikBase  || '',
    iconikAppId : iconikAppId || '',
    iconikToken : iconikToken || '',
    // Vue metadata si fournie (ou résolue)
    metadataViewId : (resolver ? resolver.view(node.config?.metadataViewId || '') : '') || node.config?.metadataViewId || '',
    // Propage TOUTE la configuration sur le node (lisibilité côté Node-RED)
    ...cfg,
    _wfd : { family: node.family, ...cfg },
  };
}

// Op mapping (legacy)
function opToNrOp(op) {
  const map = { equals:'eq', not_equals:'neq', contains:'cont', not_contains:'ncont', starts_with:'cont', ends_with:'cont', is_empty:'empty', not_empty:'nempty', gt:'gt', lt:'lt' };
  return map[op] || 'eq';
}

// ═══════════════════════════════════════════════════════════════
// Câblage
// ═══════════════════════════════════════════════════════════════
function buildWires(nrNodes, connections, fluxId) {
  const idMap = {};
  nrNodes.forEach(n => {
    const prefix = 'wfd-' + fluxId + '-';
    if (n.id.startsWith(prefix)) idMap[n.id.slice(prefix.length)] = n;
  });
  // Préserver les wires internes des triplets (prep→http→post)
  // Ne réinitialiser que les nœuds WFD principaux (pas les -http et -post)
  nrNodes.forEach(n => {
    const isInternal = n.id.endsWith('-http') || n.id.endsWith('-post');
    if (!isInternal) {
      n.outputs = n.outputs || (n.wires ? n.wires.length : 1) || 1;
      n.wires = Array.from({length: n.outputs}, ()=>[]);
    } else {
      // Garder les wires internes mais s'assurer qu'ils ont la bonne longueur
      n.outputs = n.outputs || 1;
      if (!n.wires || n.wires.length < n.outputs) {
        n.wires = Array.from({length: n.outputs}, (_,i) => (n.wires && n.wires[i]) || []);
      }
    }
  });
  (connections || []).forEach(conn => {
    // Trouver le vrai nœud source — si le nœud a un -post, c'est lui qui sort
    let srcNr = idMap[conn.fromNode]; if (!srcNr) return;
    const postId = srcNr.id + '-post';
    const postNr = nrNodes.find(n => n.id === postId);
    if (postNr) srcNr = postNr; // utiliser le nœud [post] comme sortie réelle

    // Trouver le vrai nœud cible — c'est toujours le nœud principal (prep)
    const targetId = nrId(fluxId, conn.toNode);
    const portIdx = conn.fromPort || 0;
    if (!srcNr.wires[portIdx]) srcNr.wires[portIdx] = [];
    srcNr.wires[portIdx].push(targetId);
  });
}

// Onglet (tab)
function buildTabNode(flux) {
  return {
    id   : flux.nrFlowId || ('wfd-' + flux.id),
    type : 'tab',
    label: flux.name,
    disabled: !(flux.active !== false),
    info : flux.description || '',
  };
}

// Traduction complète d'un flux
function translateFlux(flux) {
  const fluxId = flux.id;
  if (!flux.nrFlowId) flux.nrFlowId = 'wfd-' + fluxId;

  const creds = (typeof getCredentialsFlux === 'function') ? getCredentialsFlux(flux) : null;
  const iconikBase = creds ? creds.iconikUrl   : 'https://app.iconik.io';
  const iconikAppId= creds ? creds.appId       : '';
  const iconikToken= creds ? creds.token       : '';
  const envName = creds ? creds.name : '';
  const envType = creds ? (creds.environment || 'prod') : '';

  const wfdData = (typeof getWfdData === 'function') ? getWfdData() : {};
  const resolver= buildResolver(wfdData);

  const tab = buildTabNode(flux);
  if (creds) tab.info = 'Environnement : ' + envName + ' (' + envType + ')\n' + iconikBase;

  const nrNodes = [];
  (flux.nodes || []).forEach(node => {
    if (node.family === 'postit') return;
    let nr;
    switch (node.family) {
      case 'trigger'     : nr = translateTrigger(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'listener'    : nr = translateListener(node, fluxId); break;
      case 'watchfolder' : nr = translateWatchfolder(node, fluxId); break;
      case 'fetch'       : nr = translateFetch(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'rename'      : nr = translateRename(node, fluxId); break;
      case 'create_asset': nr = translateCreateAsset(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'create_col'  : nr = translateCreateCol(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'link_file'   : nr = translateLinkFile(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'update_meta' : nr = translateUpdateMeta(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'acl'         : nr = translateAcl(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'relate'      : nr = translateRelate(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'notify_post' : nr = translateNotifyPost(node, fluxId); break;
      case 'transcode'   : nr = translateTranscode(node, fluxId, iconikBase, iconikAppId, iconikToken); break;
      case 'subflow'     : nr = translateSubflow(node, fluxId); break;
      case 'export_file' : nr = translateExportFile(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); break;
      case 'publish'     : nr = translatePublish(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); break;
      case 'action'      : nr = translateAction(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); break;
      case 'decision'    : nr = translateDecision(node, fluxId); break;
      case 'transform'   : nr = translateTransform(node, fluxId); break;
      case 'script'      : nr = translateScript(node, fluxId); break;
  case 'manual'      : nr = translateManual(node, fluxId); break;
      case 'set_var'     : nr = translateSetVar(node, fluxId); break;

  // Notification : on passe par le node palette "wfd-notification"
  case 'notification':
    nr = translateNotification(node, fluxId);
    break;

  default            : 
    nr = translateGeneric(node, fluxId, iconikBase, iconikAppId, iconikToken, resolver); 
    break;
  }

  if (Array.isArray(nr)) { nr.forEach(n => { n.z = flux.nrFlowId; nrNodes.push(n); }); }
  else { nr.z = flux.nrFlowId; nrNodes.push(nr); }
});
buildWires(nrNodes, flux.connections || [], fluxId);
return [tab, ...nrNodes];
}

// ── Notification → function node NR avec résolution couleur dynamique ────────
function translateNotification(node, fluxId) {
  const cfg = node.config || {};
  // Normaliser chaque recipient pour que wfd-notification reçoive
  // color_mode, color_var, color ET message correctement
  const recipients = (cfg.recipients || []).map(rec => {
    const c = rec.config || {};
    return {
      channel : rec.channel || 'email',
      config  : {
        ...c,
        // Garantir les champs couleur dynamique
        color_mode : c.color_mode || 'fixed',
        color      : c.color      || '#27ae60',
        color_var  : c.color_var  || '{wf_status}',
        // Message avec variables WFD
        message    : c.message    || '',
      },
    };
  });

  return {
    id          : nrId(fluxId, node.id),
    type        : 'wfd-notification',   // nœud custom NR
    name        : node.name || 'Notification',
    x: node.x, y: node.y, z: '',
    wires       : [[[]]],
    outputs     : 1,
    recipients,
    // Champs à plat pour rétrocompatibilité
    ...cfg,
    recipients,  // écrase le ...cfg.recipients avec la version normalisée
    _wfd        : { family: 'notification', ...cfg },
  };
}


// Resolver nom → id (collections, mdViews, teams, metadata fields)
function buildResolver(wfdData) {
  const idx = {};
  (wfdData.collections || []).forEach(c => { const name = c.name || c.title || ''; const id = c.id || c.name || ''; if (name) idx['col:'+name]  = id; });
  (wfdData.mdViews     || []).forEach(v => { const name = v.name || '';            const id = v.id || v.name || '';  if (name) idx['view:'+name] = id; });
  (wfdData.teams       || []).forEach(t => { const name = t.name || '';            const id = t.id || t.name || '';  if (name) idx['team:'+name] = id; });
  (wfdData.metadata    || []).forEach(f => { const name = f.nom || f.name || '';   if (name) idx['field:'+name] = name; });
  return { col: n=> idx['col:'+n]  || n, view: n=> idx['view:'+n] || n, team: n=> idx['team:'+n] || n, field: n=> idx['field:'+n] || n };
}

// Accès wfdData (localStorage)
function getWfdData() {
  try {
    const get = (key, prop) => (JSON.parse(localStorage.getItem(key) || 'null') || {})[prop] || [];
    return { collections: get('collectionsData','collections'), mdViews: get('metadataViewsData','metadataViews'),
             metadata: get('metadonneesData','metadonnees'), teams: get('teamsData','teams') };
  } catch { return {}; }
}

// Déploiement Node-RED
async function getNrFlows() {
  const res = await fetch(NR_BASE + '/flows');
  if (!res.ok) throw new Error('Impossible de lire les flows Node-RED (' + res.status + ')');
  const data = await res.json();
  return Array.isArray(data) ? data : (data.flows || []);
}
async function postNrFlows(payload) {
  const res = await fetch(NR_BASE + '/flows', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const err = await res.text(); throw new Error('Erreur Node-RED (' + res.status + ') : ' + err); }
  return res;
}
function cleanFluxFromNr(nrNodes, flux) {
  const prefix = 'wfd-' + flux.id + '-';
  const tabId  = flux.nrFlowId || ('wfd-' + flux.id);
  return nrNodes.filter(n => n.id !== tabId && !n.id.startsWith(prefix));
}
async function deployerSurNodeRed(flux) {
  if (!flux) { toast('Aucun flux sélectionné', true); return; }
  if (!flux.nrFlowId) flux.nrFlowId = 'wfd-' + flux.id;

  const creds = (typeof getCredentialsFlux === 'function') ? getCredentialsFlux(flux) : null;
  const envLabel = creds ? creds.name : null;
  const envType  = creds ? (creds.environment || 'prod') : null;

  if (!creds) {
    if (!confirm('Aucun environnement Iconik sélectionné pour ce flux.\nDéployer sans credentials Iconik ?')) return;
  } else if (envType === 'prod') {
    if (!confirm('⚠️ Déploiement vers l’environnement PRODUCTION\n"' + envLabel + '"\n\nConfirmer ?')) return;
  }

  const envInfo = creds ? (' → ' + envLabel) : '';
  toast('Déploiement sur Node-RED' + envInfo + '…');
  try {
    const existing = await getNrFlows();
    const cleaned  = cleanFluxFromNr(existing, flux);
    const newNodes = translateFlux(flux);
    const payload  = [...cleaned, ...newNodes];
    await postNrFlows(payload);
    sauvegarderEtat && sauvegarderEtat();
    const nbNodes = newNodes.filter(n => n.type !== 'tab').length;
    toast('✓ "' + flux.name + '" déployé sur Node-RED (' + nbNodes + ' nœuds)');
  } catch (err) {
    console.error('[WFD→NR]', err);
    toast('Erreur : ' + err.message, true);
  }
}
// Suppression
async function supprimerDeNodeRed(flux) {
  try {
    const existing = await getNrFlows();
    const cleaned = cleanFluxFromNr(existing, flux);
    await postNrFlows(cleaned);
    console.log('[WFD→NR] Flux retiré :', flux.name);
  } catch (err) {
    console.error('[WFD→NR] Erreur suppression :', err);
  }
}
// Toggle actif/inactif
async function toggleFluxNodeRed(flux) {
  if (!flux) return;
  if (!flux.nrFlowId) { await deployerSurNodeRed(flux); return; }
  try {
    const existing = await getNrFlows();
    const updated  = existing.map(n => n.id === flux.nrFlowId ? { ...n, disabled: flux.active === false } : n);
    await postNrFlows(updated);
    toast((flux.active !== false ? '▶ Flux activé' : '⏸ Flux désactivé') + ' dans Node-RED');
  } catch (err) {
    toast('Erreur toggle Node-RED : ' + err.message, true);
  }
}

// ── Exposition explicite au scope global (pour les onclick du HTML)
if (typeof window !== 'undefined') {
  window.deployerSurNodeRed = deployerSurNodeRed;
  window.supprimerDeNodeRed = supprimerDeNodeRed;
  window.toggleFluxNodeRed  = toggleFluxNodeRed;
}
