console.log("[MIRROR] aps-mirror-engine LOADED — 2026-06-25 16:45");
/* =============================================================================
   APS Mirror Engine — moteur de comparaison universel
   
   Architecture :
     Adapter  → fournit les données (local APS ou API Iconik)
     Engine   → compare deux adapters scope par scope
     Exports  → génère les rapports (JSON, HTML, XLSX, Postman, Python, Shell)
   
   MIGRATIONS FUTURES :
   - Nouvel adaptateur = nouvel objet { label, type, fetch(scope) }
   - Nouveau format d'export = nouvelle méthode APS_Exports.*
   - Aucun autre fichier à modifier
   
   Dépendances :
   - aps-data.js (APS_Data) — pour l'adaptateur local
   - sync-mappers.js (WFD_Mappers) — optionnel, pour normalisation avancée
   - wfd-bus.js (WFD_Bus) — optionnel, pour événements sync_done
   
   Expose : window.APS_Adapters, window.APS_MirrorEngine, window.APS_Exports
   ============================================================================= */
(function () {
  'use strict';
  if (window.APS_MirrorEngine) return;

  // ── Constantes partagées ───────────────────────────────────────────────────
  const SYSTEM_VIEWS   = new Set(['segment tags','tutorials']);
  const SYSTEM_CATS    = new Set(['default','generic','tag','tags','uncategorized','none','']);
  const SYSTEM_TEAMS   = new Set(['administrator','everyone','all users']);
  const SHARE_KEYS     = ['default_share_options','share_expiration_time','external_share',
    'allow_invites_by_link','allow_share_magic_link_creation',
    'enforce_magic_link_allowlist','search_users_from_share'];
  const TEAM_SETTINGS_COMPARE = [
    'home_page',
    'search_view_id',
    'search_default_sections',       // panels ouverts en search
    'asset_default_sections',        // panels ouverts sur un asset
    'date_format',
    'datetime_format',
    'append_asset_uuid_to_downloads',
    'use_asset_name_on_download',
    'search_in_transcriptions',      // allow transcription search (valeur explicite par team)
    'share_expiration_time',
    'required_metadata_views',       // MD Views requises à l'upload
    'default_upload_storage_id',     // Designated storage
    'filters_default_metadata_view_id',
    'search_results_asset_metadata_view_id',
    'search_results_collection_metadata_view_id',
    'acl_template_id',
    'collections_get_parent_acls',
    'hide_favourites',
  ];
  const CAT_TYPES = ['assets','collections','segments','custom_actions'];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function lower(s) { return String(s||'').toLowerCase().trim(); }
  function byName(arr, keyFn) {
    const m = {};
    (arr||[]).forEach(o => { const k = lower(keyFn(o)); if (k) m[k] = o; });
    return m;
  }
  function normOptions(opts) { return (opts||[]).map(o=>o.value||'').sort().join('|'); }
  function normFields(fields) { return (fields||[]).map(f=>f.name||'').join(','); }

  // ── Helpers ACL ────────────────────────────────────────────────────────────
  function buildColPath(colById, colId, depth=0) {
    if (depth > 20) return colId;
    const node = colById[colId];
    if (!node) return colId;
    const name = (node.name || node.nom || node.title || colId).trim();
    if (!node.parent_id || !colById[node.parent_id]) return name;
    return buildColPath(colById, node.parent_id, depth+1) + ' / ' + name;
  }

  function indexById(arr) {
    const m = {};
    (arr||[]).forEach(o => { if (o?.id) m[o.id] = o.name || o.nom || o.title || o.id; });
    return m;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTATEURS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Crée un adaptateur sur un env Iconik (appels API).
   * @param {Object} token — { name, iconikUrl, appId, token, environment }
   * @returns {Object} adapter
   */
  function createIconikAdapter(token) {
    // Proxy APS — tous les appels passent par le serveur Express
    // Les credentials sont injectés côté serveur, jamais exposés au frontend
    const base = (typeof _ikBase === 'function')
      ? _ikBase(token)
      : (window.location.origin + '/api/iconik/' + String(token.environment || token.env || 'qa').toLowerCase());
    const H    = {};
    const HJ   = { ...H, 'Content-Type': 'application/json' };
    const badge = token.environment==='prod'?'🟢':token.environment==='qa'?'🟡':'🔵';

    // Fetch paginé générique
    async function fetchAll(ep, mapper) {
      let page=1, all=[];
      while (true) {
        const sep = ep.includes('?') ? '&' : '?';
        const r = await fetch(base + ep + sep + 'per_page=500&page=' + page, { headers: H });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + ep);
        const data = await r.json();
        const batch = mapper ? mapper(data) : (data.objects || []);
        all = all.concat(batch);
        const pages = data.pages || 0;
        const hasMore = pages > 1 ? page < pages : (data.total_count > all.length);
        if (!batch.length || !hasMore || page >= 50) break;
        page++;
      }
      return all;
    }

    // Fetch collections via search POST (pour avoir toutes les collections + _path)
    async function fetchCollections() {
      const all=[], seen=new Set();
      let page=1;
      while (true) {
        const r = await fetch(base+'/API/search/v1/search/?per_page=200&page='+page, {
          method: 'POST', headers: HJ,
          body: JSON.stringify({ doc_types: ['collections'] })
        });
        if (!r.ok) break;
        const data = await r.json();
        for (const c of (data.objects||[])) {
          if (seen.has(c.id)) continue;
          if (c.status && c.status !== 'ACTIVE') continue;
          if (c.date_deleted) continue;
          seen.add(c.id);
          all.push({ id:c.id, name:(c.title||c.name||c.id).trim(), title:(c.title||c.name||c.id).trim(),
            parent_id: c.parent_id || (c.in_collections&&c.in_collections[0]) || null });
        }
        const pages = data.pages || 1;
        if (!data.objects?.length || page >= pages || page > 60) break;
        page++;
      }
      // Enrichir avec _path
      const byId = {};
      all.forEach(c => { byId[c.id] = c; });
      all.forEach(c => { if (!c._path) c._path = buildColPath(byId, c.id); });
      return all;
    }

    // Fetch categories agrégées par type
    async function fetchCategories() {
      const byName = {};
      for (const type of CAT_TYPES) {
        const items = await fetch(base+'/API/metadata/v1/'+type+'/categories/?per_page=500', { headers: H })
          .then(r=>r.ok?r.json():{}).catch(()=>({}));
        for (const cat of (items.objects||[])) {
          const k = lower(cat.name);
          if (SYSTEM_CATS.has(k)) continue;
          if (!byName[k]) byName[k] = { name: cat.name, object_types: [], view_ids: cat.view_ids||[] };
          if (!byName[k].object_types.includes(type)) byName[k].object_types.push(type);
        }
      }
      const cats = Object.values(byName);
      // Fetch associations Default/Generic par object_type
      const DEFAULT_MAP = {assets:'default',collections:'default',segments:'generic',custom_actions:'default',search:'default'};
      const viewsR = await fetch(base+'/API/metadata/v1/views/?per_page=500',{headers:H}).then(r=>r.ok?r.json():{objects:[]}).catch(()=>({objects:[]}));
      const viewNameById = {};
      (viewsR.objects||[]).forEach(v=>{if(v?.id)viewNameById[v.id]=v.name||v.id;});
      const defaultViewsByType = {};
      await Promise.all(Object.entries(DEFAULT_MAP).map(async([objType,catName])=>{
        try {
          const r = await fetch(base+'/API/metadata/v1/'+objType+'/categories/'+catName+'/',{headers:H}).then(r=>r.ok?r.json():null).catch(()=>null);
          if (r) defaultViewsByType[objType] = { catName, view_ids: r.view_ids||[], viewNames: (r.view_ids||[]).map(id=>viewNameById[id]||id).filter(Boolean) };
        } catch(e) {}
      }));
      return { categories: cats, defaultViewsByType };
    }

    return {
      label: badge + ' ' + token.name,
      type: 'iconik',
      token,
      base,
      headers: H,
      headersJson: HJ,

      async fetch(scope) {
        switch (scope) {
          case 'teams':         return fetchAll('/API/users/v1/teams/?per_page=500');
          case 'users':         return fetchAll('/API/users/v1/users/?per_page=500');
          case 'roleGroups':    return fetchAll('/API/users/v1/role_groups/?per_page=500');
          case 'collections':   return fetchCollections();
          case 'metadataViews': return fetchAll('/API/metadata/v1/views/?per_page=500');
          case 'metadata':      return fetchAll('/API/metadata/v1/fields/?per_page=500');
          case 'teamAcls': {
            // Fetch teams + groups (pour résoudre les IDs orphelins) + ACLs
            const [teams, groups] = await Promise.all([
              fetchAll('/API/users/v1/teams/?per_page=500'),
              fetchAll('/API/users/v1/groups/?per_page=500').catch(()=>[]),
            ]);
            // Index id → name — teams écrasent les groups (priorité TEAM > ROLE_GROUP)
            const groupNameById = {};
            [...(groups||[]), ...(teams||[])].forEach(g=>{ if(g?.id) groupNameById[g.id]=g.name||g.nom||g.id; });
            // Map nom → id en priorisant TEAM sur ROLE_GROUP (même nom possible)
            const groupIdByName = {};
            [...(groups||[]), ...(teams||[])].forEach(g=>{ if(g?.name) groupIdByName[(g.name||'').toLowerCase().trim()]=g.id; });
            const result = await Promise.all((teams||[]).map(async t => {
              const acl = await fetch(base+'/API/acls/v1/acl/groups/'+t.id+'/', {headers:H})
                .then(r=>r.ok?r.json():null).catch(()=>null);
              // Enrichir groupAcls avec le nom résolu
              const groupAcls = (acl?.groups_acl||[]).map(a => ({
                ...a, _name: groupNameById[a.group_id] || a.group_id
              }));
              return { ...t, groupAcls };
            }));
            return result;
          }
          case 'categories':    return fetchCategories();
          case 'savedSearches': return fetchAll('/API/search/v1/search/saved/?per_page=500');
          case 'storages':      return fetchAll('/API/files/v1/storages/?per_page=500');
          case 'webhooks':      return fetchAll('/API/notifications/v1/webhooks/?per_page=500');
          case 'customActions': return fetchAll('/API/assets/v1/custom_actions/?per_page=500');
          case 'automations':   return fetchAll('/API/automations/v1/automations/?per_page=500');
          case 'relationTypes': return fetchAll('/API/assets/v1/assets/relation_types/?per_page=500', r=>(r.objects||[]).filter(o=>!o.is_system));
          case 'shareSettings': {
            // system/current = valeurs système brutes (pas fusionnées avec overrides teams)
            const r = await fetch(base+'/API/settings/v1/system/current/', { headers: H });
            return r.ok ? await r.json() : {};
          }
          case 'viewDetail': {
            // Usage interne : fetch détail d'une vue par ID
            // Appelé via adapter.fetchViewDetail(id)
            return null;
          }
          case 'teamSettings': {
            // Usage interne via adapter.fetchTeamSettings(teamId)
            return null;
          }
          default:
            console.warn('[APS_MirrorEngine] Iconik scope inconnu:', scope);
            return [];
        }
      },

      // Helpers spéciaux pour le moteur
      async fetchOne(url) {
        const r = await fetch(base + url, { headers: H });
        return r.ok ? r.json() : null;
      },
      async fetchViewDetail(id) {
        return this.fetchOne('/API/metadata/v1/views/' + id + '/');
      },
      async fetchTeamSettings(teamId) {
        return this.fetchOne('/API/settings/v1/team/' + teamId + '/');
      },
      async fetchAcl(type, id) {
        return this.fetchOne('/API/acls/v1/acl/' + type + '/' + id + '/');
      },
      async fetchSavedSearchDetail(id) {
        return this.fetchOne('/API/search/v1/search/saved/' + id + '/');
      },
    };
  }

  /**
   * Crée un adaptateur sur le localStorage APS.
   * @returns {Object} adapter
   */
  function createAPSAdapter() {
    const D = window.APS_Data;

    // Extraire nom string depuis une collection APS
    // Format brut Iconik search : { title, parent_id, in_collections }
    // Format APS canonique : { nom, name, _path }
    function colNameStr(c) {
      // title est le champ canonique Iconik (format search brut)
      const candidates = [c.title, c.name, c.nom];
      for (const raw of candidates) {
        if (raw && typeof raw === 'string' && raw.trim()) return raw.trim();
      }
      // Fallback : dernier segment du _path
      if (typeof c._path === 'string' && c._path) return c._path.split(' / ').pop().trim();
      return c.id || '';
    }

    // Enrichir les collections avec _path si absent
    function enrichCollections(cols) {
      const byId = {};
      (cols||[]).forEach(c => { if (c?.id) byId[c.id] = c; });
      // Résolution récursive avec mémo pour garantir parents avant enfants
      const resolved = {};
      function getPath(id, depth=0) {
        if (depth > 25) return byId[id] ? colNameStr(byId[id]) : id;
        if (resolved[id]) return resolved[id];
        const c = byId[id];
        if (!c) return id;
        // _path déjà stocké et valide
        if (c._path && typeof c._path === 'string' && c._path.trim()) {
          return (resolved[id] = c._path.trim());
        }
        const name = colNameStr(c);
        const pid = c.parent_id || (Array.isArray(c.in_collections) && c.in_collections[0]) || null;
        if (!pid || !byId[pid]) return (resolved[id] = name);
        const parentPath = getPath(pid, depth+1);
        return (resolved[id] = parentPath + ' / ' + name);
      }
      return (cols||[]).map(c => {
        const name = colNameStr(c);
        const path = getPath(c.id);
        return { ...c, _path: path, name, nom: name };
      });
    }

    return {
      label: '🗄️ APS (local)',
      type: 'aps',

      fetch(scope) {
        switch (scope) {
          case 'teams':         return Promise.resolve(D.get('teams'));
          case 'users':         return Promise.resolve(D.get('users'));
          case 'roleGroups':    return Promise.resolve(D.get('roleGroups'));
          case 'collections':   return Promise.resolve(enrichCollections(D.get('collections')));
          case 'metadataViews': return Promise.resolve(D.get('metadataViews'));
          case 'metadata':      return Promise.resolve(D.get('metadata'));
          case 'teamAcls': {
            // Les groupAcls contiennent des group_id Iconik — on les enrichit
            // avec _name en croisant avec les teams et roleGroups du localStorage APS
            const rawAcls = D.get('teamAcls') || [];
            const allGroups = [...(D.get('teams')||[]), ...(D.get('roleGroups')||[])];
            const groupNameById = {};
            allGroups.forEach(g => { if (g?.id) groupNameById[String(g.id)] = g.name||g.nom||g.id; });
            // teamAclsData stocke aussi les raw Iconik ids — enrichir _name si absent
            return Promise.resolve(rawAcls.map(t => ({
              ...t,
              groupAcls: (t.groupAcls||[]).map(a => ({
                ...a,
                _name: a._name || groupNameById[String(a.group_id)] || null
              }))
            })));
          }
          case 'categories': {
            const rawCats = D.get('categories');
            let defaultViewsByType = {};
            try {
              const raw = localStorage.getItem('categoriesData');
              const parsed = raw ? JSON.parse(raw) : null;
              defaultViewsByType = parsed?.defaultViewsByType || {};
            } catch(e) {}
            return Promise.resolve({ categories: rawCats, defaultViewsByType });
          }
          case 'savedSearches': return Promise.resolve(D.get('savedSearches'));
          case 'storages':      return Promise.resolve(D.get('storages'));
          case 'webhooks':      return Promise.resolve(D.get('webhooks'));
          case 'customActions': return Promise.resolve(D.get('customActions'));
          case 'automations':   return Promise.resolve(D.get('automations'));
          case 'relationTypes': return Promise.resolve(D.get('relationTypes'));
          case 'shareSettings': {
            const s = D.get('systemSettings');
            return Promise.resolve(s || {});
          }
          default:
            console.warn('[APS_MirrorEngine] APS scope inconnu:', scope);
            return Promise.resolve([]);
        }
      },

      // L'adaptateur APS n'a pas d'API distante pour les détails
      // → retourne les données locales enrichies si disponibles
      fetchViewDetail(id) {
        const views = D.get('metadataViews');
        const v = (views||[]).find(x=>x.id===id);
        if (!v) return Promise.resolve(null);
        // view_fields stockés dans viewFieldsById par syncViewFields
        try {
          const raw = localStorage.getItem('metadataViewsData');
          const mvd = raw ? JSON.parse(raw) : {};
          const vf = mvd.viewFieldsById?.[id] || v.view_fields || [];
          return Promise.resolve({ ...v, view_fields: vf });
        } catch { return Promise.resolve(v); }
      },
      fetchTeamSettings(teamId) {
        // Team settings stockés dans teamsData si sync DS complète
        const teams = D.get('teams');
        const t = (teams||[]).find(x=>x.id===teamId);
        return Promise.resolve(t?.settings || null);
      },
      fetchAcl(type, id) {
        // ACLs non stockées individuellement en APS — on retourne null
        // Les ACLs sont intégrées dans teamsData.collections / teamsData.vues
        return Promise.resolve(null);
      },
      fetchSavedSearchDetail(id) {
        const searches = D.get('savedSearches');
        const s = (searches||[]).find(x=>x.id===id);
        if (!s) return Promise.resolve(null);
        // Exposer criteria depuis raw.criteria ou query pour que le Mirror Check puisse comparer
        return Promise.resolve({
          ...s,
          criteria: s.raw?.criteria || s.criteria || s.query || null,
        });
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCOPES DE COMPARAISON
  // Chaque scope = fonction compare(srcItems, dstItems, ctx) → { details[], status }
  // ctx contient les données des autres scopes déjà chargés (pour résolution IDs)
  // ═══════════════════════════════════════════════════════════════════════════

  const COMPARE_SCOPES = {

    teams({ src, dst, excl }) {
      const isSystem = n => SYSTEM_TEAMS.has(lower(n));
      const srcList = (src||[]).filter(t => !excl.systemTeams || !isSystem(t.name||t.nom||''))
                               .filter(t => !excl.customNames?.some(n=>lower(t.name||t.nom)===lower(n)));
      const dstMap  = byName(dst, t=>t.name||t.nom||t.id);
      const missing = srcList.filter(t=>!dstMap[lower(t.name||t.nom||'')]);
      return {
        id:'teams', label:'Teams', icon:'👥',
        summary: (srcList.length-missing.length)+'/'+srcList.length+' présentes',
        status: missing.length===0?'ok':'warn',
        details: missing.map(t=>({type:'missing',label:t.name||t.nom,src:'✅',dst:'❌'})),
      };
    },

    metadataViews({ src, dst }) {
      const srcList = (src||[]).filter(v=>!SYSTEM_VIEWS.has(lower(v.name||v.nom||'')));
      const dstMap  = byName(dst, v=>v.name||v.nom||v.id);
      const details = [];
      // Comparaison présence uniquement (view_fields nécessite fetch détail — fait dans le moteur)
      srcList.forEach(v => {
        if (!dstMap[lower(v.name||v.nom||'')]) details.push({type:'missing',label:v.name||v.nom,src:'✅',dst:'❌'});
      });
      return {
        id:'metadataViews', label:'MD Views', icon:'📋',
        summary: details.length===0 ? srcList.length+' présentes' : (srcList.length-details.length)+'/'+srcList.length+' présentes',
        status: details.length===0?'ok':'warn',
        details,
      };
    },

    collections({ src, dst, excl }) {
      // Extraire le nom d'une collection — APS peut stocker nom comme objet {} ou string
      const colName = c => {
        const raw = c._path || c.title || c.name || c.nom || '';
        return typeof raw === 'string' ? raw.trim() : (c.id || '');
      };
      const isStorage = c => /^stockage/i.test(colName(c));
      const srcList = (excl.storages ? (src||[]).filter(c=>!isStorage(c)) : (src||[]));
      const dstMap  = {};
      (dst||[]).forEach(c=>{ const k=lower(colName(c)); if(k) dstMap[k]=c; });
      const missing = srcList.filter(c=>!dstMap[lower(colName(c))]);
      return {
        id:'collections', label:'Collections', icon:'📁',
        summary: (srcList.length-missing.length)+'/'+srcList.length+' présentes',
        status: missing.length===0?'ok':'warn',
        details: missing.map(c=>({type:'missing',label:colName(c),src:'✅',dst:'❌'})),
      };
    },

    roleGroups({ src, dst }) {
      const dstMap = byName(dst, rg=>rg.name||rg.nom||rg.id);
      const details = [];
      (src||[]).forEach(srcRg => {
        const key = lower(srcRg.name||srcRg.nom||'');
        const dstRg = dstMap[key];
        if (!dstRg) { details.push({type:'missing',label:srcRg.name||srcRg.nom,src:'✅',dst:'❌'}); return; }
        const srcRoles = [...(srcRg.roles||[])].sort().join(',');
        const dstRoles = [...(dstRg.roles||[])].sort().join(',');
        if (srcRoles !== dstRoles) {
          const miss = (srcRg.roles||[]).filter(r=>!(dstRg.roles||[]).includes(r));
          const extra = (dstRg.roles||[]).filter(r=>!(srcRg.roles||[]).includes(r));
          if (miss.length)  details.push({type:'role_missing', label:(srcRg.name||srcRg.nom)+' — rôles manquants: '+miss.join(', '),src:'✅',dst:'⚠️'});
          if (extra.length) details.push({type:'role_extra',   label:(srcRg.name||srcRg.nom)+' — rôles en trop: '+extra.join(', '),src:'⚠️',dst:'✅'});
        }
        const srcCats = srcRg.role_categories||{};
        const dstCats = dstRg.role_categories||{};
        const catDiffs = Object.keys(srcCats).filter(k=>srcCats[k]!==dstCats[k]);
        if (catDiffs.length) details.push({type:'category_diff', label:(srcRg.name||srcRg.nom)+' — catégories: '+catDiffs.map(k=>k+'(src:'+srcCats[k]+'/dst:'+dstCats[k]+')').join(', '),src:'⚠️',dst:'⚠️'});
      });
      const ok = (src||[]).length - details.filter(d=>d.type==='missing').length;
      return {
        id:'roleGroups', label:'Role Groups', icon:'🎭',
        summary: details.length===0 ? (src||[]).length+' conformes' : ok+'/'+(src||[]).length+' présents, '+details.length+' divergence(s)',
        status: details.length===0?'ok':'warn',
        details,
      };
    },

    metadata({ src, dst }) {
      // Les noms techniques Iconik sont sensibles à la casse (ex: ActualiteEvenement vs Actualitevenement)
      // On utilise le nom exact comme clé, pas en lowercase
      const dstMapExact = {};
      (dst||[]).forEach(f => { const k = f.name||f.nom||f.id; if (k) dstMapExact[k] = f; });
      const dstMapLower = byName(dst, f=>f.name||f.nom||f.id); // fallback insensible casse
      const details = [];
      (src||[]).forEach(srcF => {
        const keyExact = srcF.name||srcF.nom||'';
        const key = lower(keyExact);
        const dstF = dstMapExact[keyExact] || dstMapLower[key];
        // Label d'affichage : préférer label lisible, fallback sur name technique
        const displayLabel = srcF.label && srcF.label !== 'undefined' ? srcF.label : (srcF.name||srcF.nom);
        if (!dstF) { details.push({type:'missing',label:displayLabel,src:'✅',dst:'❌'}); return; }
        const diffs = [];
        if (srcF.field_type !== dstF.field_type) diffs.push('field_type: '+srcF.field_type+'→'+dstF.field_type);
        // Ignorer label si absent ou artefact 'undefined' string côté APS
        const cleanLbl = l => (!l || l === 'undefined' || l === 'null') ? '' : String(l).trim();
        const srcLbl = cleanLbl(srcF.label), dstLbl = cleanLbl(dstF.label);
        if (srcLbl && dstLbl && lower(srcLbl) !== lower(dstLbl)) diffs.push('label: "'+srcLbl+'"→"'+dstLbl+'"');
        if (srcF.required  !== dstF.required)  diffs.push('required: '+srcF.required+'→'+dstF.required);
        if (srcF.multi     !== dstF.multi)     diffs.push('multi: '+srcF.multi+'→'+dstF.multi);
        if (srcF.read_only !== dstF.read_only) diffs.push('read_only: '+srcF.read_only+'→'+dstF.read_only);
        if (normOptions(srcF.options) !== normOptions(dstF.options)) diffs.push('options (src:'+srcF.options?.length+'/dst:'+dstF.options?.length+')');
        if (diffs.length) details.push({type:'field_diff',label:displayLabel+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
      });
      const ok = (src||[]).length - details.filter(d=>d.type==='missing').length;
      return {
        id:'metadata', label:'Metadata Fields', icon:'🏷️',
        summary: details.length===0 ? (src||[]).length+' conformes' : ok+'/'+(src||[]).length+' présents, '+details.length+' divergence(s)',
        status: details.length===0?'ok':'warn',
        details,
      };
    },

    customActions({ src, dst, ctx }) {
      const dstMap = byName(dst, a=>a.title||a.name||a.nom||a.id);
      const srcViewById = indexById(ctx.srcViews||[]);
      const dstViewById = indexById(ctx.dstViews||[]);
      const details = [];
      (src||[]).forEach(srcA => {
        const key = lower(srcA.title||srcA.name||srcA.nom||'');
        const dstA = dstMap[key];
        const label = srcA.title||srcA.name||srcA.nom;
        if (!dstA) { details.push({type:'missing',label,src:'✅',dst:'❌'}); return; }
        // Normaliser disabled : peut être boolean ou status string
        const normDis = a => !!(a.disabled || String(a.status||'').toUpperCase()==='DISABLED' || String(a.status||'').toUpperCase()==='INACTIVE');
        const srcDis = normDis(srcA), dstDis = normDis(dstA);
        if (!srcDis && dstDis) details.push({type:'status_info',label:label+' — désactivée sur destination (intentionnel)',src:'✅',dst:'ℹ️'});
        const diffs = [];
        if (srcA.url     !== dstA.url)     diffs.push('url: "'+srcA.url+'"→"'+dstA.url+'"');
        if (srcA.context !== dstA.context) diffs.push('context: '+srcA.context+'→'+dstA.context);
        if (srcA.type    !== dstA.type)    diffs.push('type: '+srcA.type+'→'+dstA.type);
        // Normaliser headers : APS stocke [{key,value}], Iconik retourne {key:value}
        const normHdrCA = h => {
          if (!h || (Array.isArray(h) && h.length===0) || (typeof h==='object' && !Array.isArray(h) && Object.keys(h).length===0)) return null;
          if (Array.isArray(h)) {
            const o={}; h.forEach(({key,value})=>{ if(key) o[key]=value||''; }); return Object.keys(o).length?o:null;
          }
          return h;
        };
        const hSrcCA=normHdrCA(srcA.headers), hDstCA=normHdrCA(dstA.headers);
        if (JSON.stringify(hSrcCA) !== JSON.stringify(hDstCA)) diffs.push('headers différents');
        // metadata_view peut être un nom (si stocké par la DS) ou un ID — résoudre dans les deux cas
        const isUuid = v => v && /^[0-9a-f-]{36}$/.test(v);
        const srcMv = isUuid(srcA.metadata_view) ? (srcViewById[srcA.metadata_view] || srcA.metadata_view) : (srcA.metadata_view||null);
        const dstMv = isUuid(dstA.metadata_view) ? (dstViewById[dstA.metadata_view] || dstA.metadata_view) : (dstA.metadata_view||null);
        if (srcMv !== dstMv) diffs.push('metadata_view: "'+srcMv+'"→"'+dstMv+'"');
        if (diffs.length) details.push({type:'param_diff',label:label+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
        if (srcA.app_id && srcA.app_id !== dstA.app_id) details.push({type:'status_info',label:label+' — App Token à reconfigurer manuellement (app_id domaine-spécifique)',src:'ℹ️',dst:'ℹ️'});
      });
      // Regrouper les info
      const finalDetails = details.filter(d=>d.type!=='status_info');
      const disabled  = details.filter(d=>d.type==='status_info'&&d.label.includes('désactivée'));
      const appTokens = details.filter(d=>d.type==='status_info'&&d.label.includes('App Token'));
      if (disabled.length)  finalDetails.push({type:'status_info',label:disabled.length+' désactivée(s) sur destination — intentionnel',src:'✅',dst:'ℹ️'});
      if (appTokens.length) finalDetails.push({type:'status_info',label:appTokens.length+' App Token à reconfigurer manuellement',src:'ℹ️',dst:'ℹ️'});
      const warn = finalDetails.filter(d=>d.type!=='status_info').length;
      const info = disabled.length + appTokens.length;
      const ok   = (src||[]).length - finalDetails.filter(d=>d.type==='missing').length;
      return {
        id:'customActions', label:'Custom Actions', icon:'⚡',
        summary: finalDetails.length===0 ? (src||[]).length+' conformes' : ok+'/'+(src||[]).length+' présentes'+(info?' · ℹ️':'')+(warn?' · '+warn+' divergence(s)':''),
        status: warn>0?'warn':info>0?'info':'ok',
        details: finalDetails,
      };
    },

    webhooks({ src, dst }) {
      const dstMap = byName(dst, w=>w.name||w.nom||w.id);
      const details = [];
      (src||[]).forEach(srcW => {
        const key = lower(srcW.name||srcW.nom||'');
        const dstW = dstMap[key];
        const label = srcW.name||srcW.nom;
        if (!dstW) { details.push({type:'missing',label,src:'✅',dst:'❌'}); return; }
        // Normaliser ACTIVE=ENABLED, INACTIVE=DISABLED (synonymes Iconik vs APS)
        const normStatus = s => { const u=String(s||'').toUpperCase(); return (u==='ENABLED'||u==='ACTIVE')?'ACTIVE':(u==='DISABLED'||u==='INACTIVE')?'INACTIVE':u; };
        const srcStatus = normStatus(srcW.status), dstStatus = normStatus(dstW.status);
        if (srcStatus==='ACTIVE' && dstStatus==='INACTIVE') {
          details.push({type:'status_info',label:label+' — désactivé sur destination (intentionnel)',src:'✅',dst:'ℹ️'});
        } else if (srcStatus !== dstStatus) {
          details.push({type:'status_diff',label:label+' — status: src='+srcW.status+' / dst='+dstW.status,src:'⚠️',dst:'⚠️'});
        }
        const diffs = [];
        if (srcW.url       !== dstW.url)       diffs.push('url: "'+srcW.url+'"→"'+dstW.url+'"');
        if (srcW.event_type!== dstW.event_type) diffs.push('event_type: '+srcW.event_type+'→'+dstW.event_type);
        if (srcW.realm     !== dstW.realm)     diffs.push('realm: '+srcW.realm+'→'+dstW.realm);
        if (srcW.operation !== dstW.operation) diffs.push('operation: '+srcW.operation+'→'+dstW.operation);
        if ((srcW.query||'') !== (dstW.query||'')) diffs.push('query différente');
        // Normaliser headers : APS stocke [{key,value}], Iconik retourne {key:value}
        const normHeaders = h => {
          if (!h || (Array.isArray(h) && h.length===0) || (typeof h==='object' && !Array.isArray(h) && Object.keys(h).length===0)) return null;
          if (Array.isArray(h)) {
            const o={}; h.forEach(({key,value})=>{ if(key) o[key]=value||''; }); return Object.keys(o).length?o:null;
          }
          return h;
        };
        const hSrc=normHeaders(srcW.headers), hDst=normHeaders(dstW.headers);
        if (JSON.stringify(hSrc) !== JSON.stringify(hDst)) diffs.push('headers différents');
        if (diffs.length) details.push({type:'param_diff',label:label+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
      });
      const finalDetails = details.filter(d=>d.type!=='status_info');
      const info = details.filter(d=>d.type==='status_info').length;
      if (info) finalDetails.push({type:'status_info',label:info+' désactivé(s) sur destination — intentionnel',src:'✅',dst:'ℹ️'});
      const warn = finalDetails.filter(d=>d.type!=='status_info').length;
      const ok   = (src||[]).length - finalDetails.filter(d=>d.type==='missing').length;
      return {
        id:'webhooks', label:'Webhooks', icon:'🔗',
        summary: finalDetails.length===0 ? (src||[]).length+' conformes' : ok+'/'+(src||[]).length+' présents'+(info?' · ℹ️':'')+(warn?' · '+warn+' divergence(s)':''),
        status: warn>0?'warn':info>0?'info':'ok',
        details: finalDetails,
      };
    },

    automations({ src, dst, ctx }) {
      const dstMap = byName(dst, a=>a.name||a.nom||a.id);
      const srcViewById = indexById(ctx.srcViews||[]);
      const dstViewById = indexById(ctx.dstViews||[]);
      const srcTeamById = indexById(ctx.srcTeams||[]);
      const dstTeamById = indexById(ctx.dstTeams||[]);
      // Map nom → dstId pour résolution cross-domaine (APS Check : srcIds sont PROD, dstIds sont QA)
      const dstTeamByName = {};
      (ctx.dstTeams||[]).forEach(t => { const n=(t.name||t.nom||'').toLowerCase(); if(n) dstTeamByName[n]=t.id; });

      // Normaliser un item trigger/action quelque soit son format (brut Iconik ou canonique APS)
      const normItemFormat = (item) => {
        if (!item) return item;
        // Format APS canonique : type=lisible, type_raw=brut Iconik
        // Format brut Iconik : type=brut directement
        // → toujours utiliser type_raw s'il existe, sinon type
        const type = item.type_raw || item.type || '';
        const params = item.parameters || item.condition || item.settings || item.params || {};
        return { type, parameters: params };
      };
      const normItem = (item, isDs) => {
        const normalized = normItemFormat(item);
        const params = {...(item.parameters||{})};
        if (params.metadata_view_id) {
          params.metadata_view_id = isDs
            ? (Object.entries(dstViewById).find(([id])=>id===params.metadata_view_id)?.[1] || params.metadata_view_id)
            : (srcViewById[params.metadata_view_id] || params.metadata_view_id);
        }
        delete params.collection_id; delete params.collection_ids;
        delete params.storage_id; delete params.asset_id;
        if (Array.isArray(params.objects)) {
          params.objects = params.objects.map(obj => {
            if (!Array.isArray(obj.group_ids)) return obj;
            const ids = obj.group_ids.map(gid => {
                if (isDs) {
                  // dst : gid est un ID QA → résoudre directement via dstTeamById
                  if (dstTeamById[gid]) return dstTeamById[gid];
                  // fallback : gid est un ID PROD → résoudre via nom
                  const srcName = srcTeamById[gid];
                  if (srcName) { const dstId = dstTeamByName[srcName.toLowerCase()]; if(dstId) return dstTeamById[dstId]||srcName; }
                  return gid;
                } else {
                  // src : gid est un ID APS/PROD → résoudre via srcTeamById
                  return srcTeamById[gid] || gid;
                }
              }).sort();
            return {...obj, group_ids: ids};
          }).sort((a,b)=>JSON.stringify(a.group_ids)>JSON.stringify(b.group_ids)?1:-1);
        }
        return JSON.stringify({type:normalized.type, params});
      };

      const details = [];
      (src||[]).forEach(srcA => {
        const key = lower(srcA.name||srcA.nom||'');
        const dstA = dstMap[key];
        const label = srcA.name||srcA.nom;
        if (!dstA) { details.push({type:'missing',label,src:'✅',dst:'❌'}); return; }
        // Storage
        const hasStorage = JSON.stringify(srcA.triggers||[]).includes('storage_id')||JSON.stringify(srcA.actions||[]).includes('storage_id');
        if (hasStorage) details.push({type:'status_info',label:label+' — storage (config manuelle requise sur destination)',src:'ℹ️',dst:'ℹ️'});
        // Status — normaliser ACTIVE=ENABLED, INACTIVE=DISABLED
        const normAutoStatus = s => { const u=String(s||'').toUpperCase(); return (u==='ENABLED'||u==='ACTIVE')?'ACTIVE':(u==='DISABLED'||u==='INACTIVE')?'INACTIVE':u; };
        const srcSt = normAutoStatus(srcA.status !== undefined ? srcA.status : (srcA.enabled ? 'ACTIVE' : 'INACTIVE'));
        const dstSt = normAutoStatus(dstA.status !== undefined ? dstA.status : (dstA.enabled ? 'ACTIVE' : 'INACTIVE'));
        if (srcSt !== dstSt) {
          const intentional = srcSt === 'ACTIVE' && dstSt === 'INACTIVE';
          details.push({type:intentional?'status_info':'status_diff',
            label:label+' — status: '+srcSt+'→'+dstSt+(intentional?' (intentionnel)':''),
            src:intentional?'✅':'⚠️', dst:intentional?'ℹ️':'⚠️'});
        }
        // Triggers / Actions
        const srcTrig = (srcA.triggers||[]).map(t=>normItem(t,false)).sort().join('|');
        const dstTrig = (dstA.triggers||[]).map(t=>normItem(t,true)).sort().join('|');
        if (srcTrig !== dstTrig) details.push({type:'trigger_diff',label:label+' — triggers différents',src:'⚠️',dst:'⚠️'});
        const srcAct = (srcA.actions||[]).map(a=>normItem(a,false)).sort().join('|');
        const dstAct = (dstA.actions||[]).map(a=>normItem(a,true)).sort().join('|');
        if (srcAct !== dstAct) details.push({type:'action_diff',label:label+' — actions différentes',src:'⚠️',dst:'⚠️'});
      });
      const finalDetails = details.filter(d=>d.type!=='status_info');
      const infoItems = details.filter(d=>d.type==='status_info');
      const inactiveN = infoItems.filter(d=>d.label.includes('INACTIVE')).length;
      const storageN  = infoItems.filter(d=>d.label.includes('storage')).length;
      if (inactiveN) finalDetails.push({type:'status_info',label:inactiveN+' INACTIVE sur destination — intentionnel',src:'✅',dst:'ℹ️'});
      if (storageN)  finalDetails.push({type:'status_info',label:storageN+' avec storage — config manuelle requise',src:'ℹ️',dst:'ℹ️'});
      const warn = finalDetails.filter(d=>d.type!=='status_info').length;
      const info = infoItems.length;
      const ok   = (src||[]).length - finalDetails.filter(d=>d.type==='missing').length;
      return {
        id:'automations', label:'Automations', icon:'⚙️',
        summary: finalDetails.length===0 ? (src||[]).length+' conformes' : [ok+'/'+(src||[]).length+' présentes', warn?warn+' divergence(s)':null, info?'ℹ️ voir notes':null].filter(Boolean).join(', '),
        status: warn>0?'warn':info>0?'info':'ok',
        details: finalDetails,
      };
    },

    relationTypes({ src, dst }) {
      const dstMap = byName(dst, r=>r.name||r.nom||r.id);
      const srcCustom = (src||[]).filter(r=>!r.is_system);
      const missing = srcCustom.filter(r=>!dstMap[lower(r.name||r.nom||'')]);
      return {
        id:'relationTypes', label:'Relation Types', icon:'🔗',
        summary: srcCustom.length===0?'Aucun type custom':(srcCustom.length-missing.length)+'/'+srcCustom.length+' présents',
        status: missing.length===0?'ok':'warn',
        details: missing.map(r=>({type:'missing',label:r.name||r.nom,src:'✅',dst:'❌'})),
      };
    },

    shareSettings({ src, dst }) {
      const details = [];
      for (const key of SHARE_KEYS) {
        const sv = JSON.stringify(src[key]??null);
        const dv = JSON.stringify(dst[key]??null);
        if (sv !== dv) details.push({type:'value_diff',label:key+' : src='+sv+' / dst='+dv,src:'⚠️',dst:'⚠️'});
      }
      return {
        id:'shareSettings', label:'Share Settings', icon:'🔒',
        summary: details.length===0?'Identiques':details.length+' différence(s)',
        status: details.length===0?'ok':'warn',
        details,
      };
    },

    savedSearches({ src, dst }) {
      const dstMap = byName(dst, s=>s.name||s.nom||s.title||s.id);
      const srcList = src||[];
      const missing = srcList.filter(s=>!dstMap[lower(s.name||s.nom||s.title||'')]);
      // Note: comparaison des critères nécessite fetch détail — fait en phase async si adapter=iconik
      return {
        id:'savedSearches', label:'Saved Searches', icon:'🔍',
        summary: missing.length===0 ? srcList.length+' présentes' : (srcList.length-missing.length)+'/'+srcList.length+' présentes, '+missing.length+' manquante(s)',
        status: missing.length===0?'ok':'warn',
        details: missing.map(s=>({type:'missing',label:s.name||s.nom||s.title,src:'✅',dst:'❌'})),
      };
    },

    categories({ src, dst, excl, ctx }) {
      // Normaliser : src/dst peuvent être un tableau (ancien format) ou { categories, defaultViewsByType }
      const srcArr = Array.isArray(src) ? src : (src?.categories || []);
      const dstArr = Array.isArray(dst) ? dst : (dst?.categories || []);
      const srcDefaultByType = (!Array.isArray(src) && src?.defaultViewsByType) || {};
      const dstDefaultByType = (!Array.isArray(dst) && dst?.defaultViewsByType) || {};

      const dstMap = byName(dstArr, c=>c.name||c.nom||c.id);
      // Index ID→nom pour résolution des view_ids (depuis ctx)
      const srcViewById = {}; (ctx?.srcViews||[]).forEach(v=>{if(v?.id) srcViewById[v.id]=v.name||v.nom||v.id;});
      const dstViewById = {}; (ctx?.dstViews||[]).forEach(v=>{if(v?.id) dstViewById[v.id]=v.name||v.nom||v.id;});
      const sysCatsSrc = excl.systemCategoriesSrc !== undefined ? excl.systemCategoriesSrc : true;
      const sysCatsDst = excl.systemCategoriesDst !== undefined ? excl.systemCategoriesDst : true;
      const srcList = sysCatsSrc
        ? srcArr.filter(c=>!SYSTEM_CATS.has(lower(c.name||c.nom||'')))
        : srcArr;
      const dstFiltered = sysCatsDst
        ? dstArr.filter(c=>!SYSTEM_CATS.has(lower(c.name||c.nom||'')))
        : dstArr;
      const details = [];
      srcList.forEach(srcC => {
        const key = lower(srcC.name||srcC.nom||'');
        const dstC = dstMap[key];
        if (!dstC) { details.push({type:'missing',label:srcC.name||srcC.nom,src:'✅',dst:'❌'}); return; }
        const srcTypes = (srcC.object_types||srcC.appliqueeA||[]).sort();
        const dstTypes = (dstC.object_types||dstC.appliqueeA||[]).sort();
        const miss  = srcTypes.filter(t=>!dstTypes.includes(t));
        const extra = dstTypes.filter(t=>!srcTypes.includes(t));
        if (miss.length)  details.push({type:'type_missing',label:(srcC.name||srcC.nom)+' — object_types manquants: '+miss.join(', '),src:'✅',dst:'⚠️'});
        if (extra.length) details.push({type:'type_extra',  label:(srcC.name||srcC.nom)+' — object_types en trop: '+extra.join(', '),src:'⚠️',dst:'✅'});
        // Comparer view_ids par nom de vue
        // APS stocke des noms dans metadataViews, Iconik retourne des IDs dans view_ids
        const srcViewNames = (srcC.metadataViews||[]).length
          ? (srcC.metadataViews||[]).filter(Boolean).sort()
          : (srcC.view_ids||[]).map(v=>srcViewById[v]||v).filter(Boolean).sort();
        const dstViewNames = (dstC.view_ids||[]).map(v=>dstViewById[v]||v).filter(Boolean).sort();
        const missViews  = srcViewNames.filter(n=>!dstViewNames.includes(n));
        const extraViews = dstViewNames.filter(n=>!srcViewNames.includes(n));
        if (missViews.length)  details.push({type:'view_missing', label:(srcC.name||srcC.nom)+' — vues manquantes: '+missViews.join(', '),src:'✅',dst:'⚠️'});
        if (extraViews.length) details.push({type:'view_extra',   label:(srcC.name||srcC.nom)+' — vues en trop: '+extraViews.join(', '),src:'⚠️',dst:'✅'});
      });

      // Comparer associations Default/Generic par object_type (depuis categoriesData.defaultViewsByType)
      const DEFAULT_CAT_MAP2 = {assets:'default',collections:'default',segments:'generic',custom_actions:'default',search:'default'};
      for (const [objType, catName] of Object.entries(DEFAULT_CAT_MAP2)) {
        const srcEntry = srcDefaultByType[objType];
        if (!srcEntry) continue;
        const srcNames = (srcEntry.viewNames||[]).filter(Boolean).sort();
        if (!srcNames.length) continue;
        const dstEntry = dstDefaultByType[objType];
        const dstNames = (dstEntry?.viewNames||[]).filter(Boolean).sort();
        const missV  = srcNames.filter(n=>!dstNames.includes(n));
        const extraV = dstNames.filter(n=>!srcNames.includes(n));
        const lbl = 'Default ['+objType+']';
        if (missV.length)  details.push({type:'default_view_missing', label:lbl+' — vues manquantes: '+missV.slice(0,5).join(', ')+(missV.length>5?'…':''), src:'✅',dst:'⚠️'});
        if (extraV.length) details.push({type:'default_view_extra',   label:lbl+' — vues en trop: '+extraV.slice(0,5).join(', ')+(extraV.length>5?'…':''), src:'⚠️',dst:'✅'});
      }

      return {
        id:'categories', label:'Catégories', icon:'🗂️',
        summary: details.length===0?srcList.length+' conformes':details.length+' divergence(s)',
        status: details.length===0?'ok':'warn',
        details,
      };
    },
    teamAcls({ src, dst, ctx, excl }) {
      // Comparer les ACLs de gestion des teams (qui peut gérer quelle team)
      const details = [];
      const srcTeams = ctx?.srcTeams || [];
      const dstTeams = ctx?.dstTeams || [];
      // Index nom → ACLs pour chaque côté — en respectant les exclusions
      const isExcluded = (name) =>
        (excl?.systemTeams && SYSTEM_TEAMS.has(lower(name))) ||
        (excl?.customNames?.some(n => lower(n) === lower(name)));
      const srcAclByName = {};
      (src || []).forEach(t => {
        const name = (t.name||t.nom||'').toLowerCase().trim();
        if (name && !isExcluded(name)) srcAclByName[name] = t.groupAcls || [];
      });
      const dstAclByName = {};
      (dst || []).forEach(t => {
        const name = (t.name||t.nom||'').toLowerCase().trim();
        if (name && !isExcluded(name)) dstAclByName[name] = t.groupAcls || [];
      });

      // Enrichir la résolution id→nom avec les role groups (ctx.srcRoleGroups/dstRoleGroups)
      // Sans ça, les ACLs posées par des role groups génèrent des faux positifs (UUID non résolu)
      const srcTeamNameById = {};
      srcTeams.forEach(t => { if (t?.id) srcTeamNameById[t.id] = t.name||t.nom||t.id; });
      (ctx?.srcRoleGroups||[]).forEach(rg => { if (rg?.id) srcTeamNameById[rg.id] = rg.name||rg.nom||rg.id; });
      const dstTeamNameById = {};
      dstTeams.forEach(t => { if (t?.id) dstTeamNameById[t.id] = t.name||t.nom||t.id; });
      (ctx?.dstRoleGroups||[]).forEach(rg => { if (rg?.id) dstTeamNameById[rg.id] = rg.name||rg.nom||rg.id; });

      const allNames = new Set([...Object.keys(srcAclByName), ...Object.keys(dstAclByName)]);
      for (const name of allNames) {
        const srcAcls = srcAclByName[name] || [];
        const dstAcls = dstAclByName[name] || [];
        // Comparer par nom de group + permissions (UUID non résolu → ignoré)
        const resolveName = (a, byId) => a._name || byId[a.group_id] || null;
        const srcSet = srcAcls
          .map(a => { const n = resolveName(a, srcTeamNameById); return n ? n+'|'+(a.permissions||[]).sort().join(',') : null; })
          .filter(Boolean).sort().join(';');
        const dstSet = dstAcls
          .map(a => { const n = resolveName(a, dstTeamNameById); return n ? n+'|'+(a.permissions||[]).sort().join(',') : null; })
          .filter(Boolean).sort().join(';');
        if (srcSet !== dstSet) {
          // Log diagnostic pour comprendre la divergence
          console.warn('[teamAcls] divergence sur', name,
            '\n  srcAcls:', JSON.stringify(srcAcls.map(a=>({gid:a.group_id,_name:a._name,perms:a.permissions}))),
            '\n  dstAcls:', JSON.stringify(dstAcls.map(a=>({gid:a.group_id,_name:a._name,perms:a.permissions}))),
            '\n  srcSet:', srcSet,
            '\n  dstSet:', dstSet
          );
          details.push({type:'team_acl_diff', label:name+' — ACLs différentes', src:'⚠️', dst:'⚠️'});
        }
      }
      return {
        id:'teamAcls', label:'ACLs Teams', icon:'🔐',
        summary: details.length===0?'Conformes':details.length+' divergence(s)',
        status: details.length===0?'ok':'warn',
        details,
      };
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MOTEUR
  // ═══════════════════════════════════════════════════════════════════════════

  // Scopes standard DD (mêmes restrictions que la sync DD)
  const DD_SCOPES = ['teams','roleGroups','collections','metadataViews','metadata',
    'savedSearches','categories','webhooks','customActions','automations','relationTypes','shareSettings','teamAcls'];

  /**
   * Lance une comparaison entre deux adaptateurs.
   * @param {Object} srcAdapter
   * @param {Object} dstAdapter
   * @param {Object} opts
   *   opts.scopes         {string[]}  — scopes à comparer (défaut: DD_SCOPES)
   *   opts.excl           {Object}    — exclusions (systemTeams, storages, customNames)
   *   opts.onProgress     {Function}  — callback(done, total, label)
   *   opts.fullAcls       {boolean}   — ACLs sur toutes les collections (défaut: false, 100)
   * @returns {Promise<Object[]>} — tableau de résultats par scope
   */
  async function run(srcAdapter, dstAdapter, opts={}) {
    const scopes    = opts.scopes    || DD_SCOPES;
    const excl      = opts.excl      || { systemTeams: true, storages: false, customNames: [] };
    const onProg    = opts.onProgress || (() => {});
    const fullAcls  = opts.fullAcls  || false;

    const results = [];
    let done = 0;
    // +2 pour MD Views (détail) et Team Settings, +2 pour ACLs (collections roots + full)
    const total = scopes.length + 4;
    const prog = (label) => { done++; onProg(done, total, label); };

    // ── Phase 1 : fetch toutes les données en parallèle ────────────────────
    prog('Chargement…');
    const scopesToFetch = [...new Set([...scopes, 'teams', 'metadataViews', 'roleGroups'])];
    const [srcData, dstData] = await Promise.all([
      Promise.all(scopesToFetch.map(s => srcAdapter.fetch(s).then(d=>({s,d})).catch(()=>({s,d:[]})))),
      Promise.all(scopesToFetch.map(s => dstAdapter.fetch(s).then(d=>({s,d})).catch(()=>({s,d:[]})))),
    ]);
    const srcMap = {}, dstMap = {};
    srcData.forEach(({s,d}) => { srcMap[s] = d; });
    dstData.forEach(({s,d}) => { dstMap[s] = d; });

    // Contexte partagé pour les scopes qui ont besoin des vues/teams
    const ctx = {
      srcViews:      srcMap.metadataViews || [],
      dstViews:      dstMap.metadataViews || [],
      srcTeams:      srcMap.teams || [],
      dstTeams:      dstMap.teams || [],
      srcRoleGroups: srcMap.roleGroups || [],
      dstRoleGroups: dstMap.roleGroups || [],
    };

    // ── Phase 2 : comparaison par scope ────────────────────────────────────
    for (const scopeId of scopes) {
      prog(scopeId + '…');
      const compareFn = COMPARE_SCOPES[scopeId];
      if (!compareFn) { console.warn('[APS_MirrorEngine] pas de comparateur pour:', scopeId); continue; }
      const result = compareFn({ src: srcMap[scopeId], dst: dstMap[scopeId], excl, ctx, srcAdapter, dstAdapter });
      results.push(result);
    }

    // ── Phase 3 : MD Views — détail view_fields ────────────────────────────
    prog('MD Views (détail)…');
    if (scopes.includes('metadataViews')) {
      const viewResult = results.find(r=>r.id==='metadataViews');
      if (viewResult) {
        const SYSV = new Set(['segment tags','tutorials']);
        const srcViews = (srcMap.metadataViews||[]).filter(v=>!SYSV.has(lower(v.name||v.nom||'')));
        const dstViewByName = byName(dstMap.metadataViews||[], v=>v.name||v.nom||v.id);
        const fieldDetails = [...viewResult.details]; // copie des manquants déjà trouvés
        for (const srcV of srcViews) {
          const dstV = dstViewByName[lower(srcV.name||srcV.nom||'')];
          if (!dstV) continue; // déjà signalé
          const [srcVD, dstVD] = await Promise.all([
            srcAdapter.fetchViewDetail(srcV.id),
            dstAdapter.fetchViewDetail(dstV.id),
          ]);
          if (!srcVD || !dstVD) continue;
          // Normaliser : APS stocke view_fields comme tableau d'objets {name} ou strings
          // Iconik retourne {view_fields: [{name, field_id, ...}]}
          const extractFieldNames = (vd) => {
            const fields = vd.view_fields || vd.fields || [];
            return fields.map(f => typeof f === 'string' ? f : (f.name||f.field_name||'')).filter(Boolean);
          };
          const srcFieldNames = extractFieldNames(srcVD);
          const dstFieldNames = extractFieldNames(dstVD);
          // Remplacer normFields par extractFieldNames pour la comparaison
          const srcFieldsStr = srcFieldNames.join(',');
          const dstFieldsStr = dstFieldNames.join(',');
          if (srcFieldsStr !== dstFieldsStr) {
            const srcNames = srcFieldNames;
            const dstNames = dstFieldNames;
            const miss  = srcNames.filter(n=>!dstNames.includes(n));
            const extra = dstNames.filter(n=>!srcNames.includes(n));
            const reordered = srcNames.join(',') !== dstNames.filter(n=>srcNames.includes(n)).join(',');
            const name = srcV.name||srcV.nom;
            if (miss.length)  fieldDetails.push({type:'field_missing',label:name+' — champs manquants: '+miss.join(', '),src:'✅',dst:'⚠️'});
            if (extra.length) fieldDetails.push({type:'field_extra',  label:name+' — champs en trop: '+extra.join(', '),src:'⚠️',dst:'✅'});
            if (reordered && !miss.length && !extra.length) fieldDetails.push({type:'field_order',label:name+' — ordre différent',src:'⚠️',dst:'⚠️'});
          }
        }
        viewResult.details = fieldDetails;
        viewResult.status  = fieldDetails.length===0?'ok':'warn';
        viewResult.summary = fieldDetails.length===0 ? srcViews.length+' conformes' : (srcViews.length-fieldDetails.filter(d=>d.type==='missing').length)+'/'+srcViews.length+' présentes, '+fieldDetails.length+' divergence(s)';
      }
    }

    // ── Phase 4 : ACLs Teams → Collections (racines) ──────────────────────
    prog('ACLs Teams→Collections…');
    if (scopes.includes('teams') && srcAdapter.type==='iconik' && dstAdapter.type==='iconik') {
      const srcTeams = srcMap.teams || [];
      const dstTeams = dstMap.teams || [];
      const srcTeamById = indexById(srcTeams);
      const dstTeamByName = byName(dstTeams, t=>t.name||t.nom||t.id);
      const srcCols = srcMap.collections || [];
      const dstColByPath = {};
      (dstMap.collections||[]).forEach(c=>{const k=lower(c._path||c.title||c.name||'');if(k) dstColByPath[k]=c;});
      const isStorage = c => /^stockage/i.test(c._path||c.title||c.name||'');
      const rootCols = srcCols.filter(c=>!c.parent_id && !isStorage(c)).slice(0,20);
      const aclDetails = [];
      for (const srcCol of rootCols) {
        const aclSrc = await srcAdapter.fetchAcl('collections', srcCol.id);
        if (!aclSrc) continue;
        const dstCol = dstColByPath[lower(srcCol._path||srcCol.title||srcCol.name||'')];
        const aclDst = dstCol ? await dstAdapter.fetchAcl('collections', dstCol.id) : null;
        const srcGroups = new Set([
          ...(aclSrc.groups_acl||[]).map(g=>srcTeamById[g.group_id]).filter(Boolean),
          ...(aclSrc.propagating_groups_acl||[]).map(g=>srcTeamById[g.group_id]).filter(Boolean),
        ].filter(n=>!excl.systemTeams||!SYSTEM_TEAMS.has(lower(n))).filter(n=>!excl.customNames?.some(ex=>lower(n)===lower(ex))));
        const dstTeamsByName2 = byName(dstTeams, t=>t.name||t.nom||t.id);
        const dstGroups = aclDst ? new Set([
          ...(aclDst.groups_acl||[]).map(g=>{const t=(dstTeams).find(x=>x.id===g.group_id);return t?.name||null;}).filter(Boolean),
          ...(aclDst.propagating_groups_acl||[]).map(g=>{const t=(dstTeams).find(x=>x.id===g.group_id);return t?.name||null;}).filter(Boolean),
        ]) : new Set();
        for (const teamName of srcGroups) {
          if (!dstGroups.has(teamName)) aclDetails.push({type:'acl_missing',label:teamName+' → '+(srcCol._path||srcCol.title||srcCol.name),src:'✅',dst:'❌'});
        }
      }
      results.push({id:'acls_collections',label:'ACLs Teams→Collections',icon:'🔐',
        summary:aclDetails.length===0?'Toutes vérifiées':aclDetails.length+' droits manquants',
        status:aclDetails.length===0?'ok':'warn',
        details:aclDetails});
    }

    // ── Phase 5 : ACLs Collections (détail) ───────────────────────────────
    prog('ACLs complètes…');
    if (scopes.includes('collections') && srcAdapter.type==='iconik' && dstAdapter.type==='iconik') {
      const srcTeamById2 = {};
      [...(srcMap.teams||[]),...(srcMap.roleGroups||[])].forEach(t=>{if(t?.id) srcTeamById2[t.id]=t.name||t.nom;});
      const dstTeamById2 = {};
      [...(dstMap.teams||[]),...(dstMap.roleGroups||[])].forEach(t=>{if(t?.id) dstTeamById2[t.id]=t.name||t.nom;});
      const srcCols = srcMap.collections||[];
      const dstCols = dstMap.collections||[];
      const isStorage = c=>/^stockage/i.test(c._path||c.title||c.name||'');
      const srcColsFiltered = excl.storages ? srcCols.filter(c=>!isStorage(c)) : srcCols;
      const dstColByPath2 = {};
      dstCols.forEach(c=>{const k=lower(c._path||c.title||c.name||'');if(k) dstColByPath2[k]=c;});
      const colsToCheck = fullAcls ? srcColsFiltered : srcColsFiltered.slice(0,100);
      const aclMode = fullAcls ? 'complètes' : 'sample 100';
      const aclFullDetails = [];
      let aclChecked=0, aclDiff=0;
      const normalizeAcl = (aclObj, teamById) => {
        const groups = [
          ...(aclObj.groups_acl||[]).map(g=>({name:teamById[g.group_id]||g.group_id,perms:(g.permissions||[]).sort().join(','),propagating:false})),
          ...(aclObj.propagating_groups_acl||[]).map(g=>({name:teamById[g.group_id]||g.group_id,perms:(g.permissions||[]).sort().join(','),propagating:true})),
        ].filter(g=>!excl.systemTeams||!SYSTEM_TEAMS.has(lower(g.name)));
        return JSON.stringify(groups.sort((a,b)=>a.name.localeCompare(b.name)));
      };
      for (let i=0; i<colsToCheck.length; i+=10) {
        await Promise.all(colsToCheck.slice(i,i+10).map(async srcCol=>{
          const dstCol = dstColByPath2[lower(srcCol._path||srcCol.title||srcCol.name||'')];
          if (!dstCol) return;
          const [aclSrc, aclDst] = await Promise.all([srcAdapter.fetchAcl('collections',srcCol.id), dstAdapter.fetchAcl('collections',dstCol.id)]);
          if (!aclSrc || !aclDst) return;
          aclChecked++;
          const srcG = JSON.parse(normalizeAcl(aclSrc, srcTeamById2));
          const dstG = JSON.parse(normalizeAcl(aclDst, dstTeamById2));
          const dstGMap = {};
          dstG.forEach(g=>{dstGMap[g.name+'|'+(g.propagating?'1':'0')]=g.perms;});
          const missing = srcG.filter(g=>!dstGMap[g.name+'|'+(g.propagating?'1':'0')]||dstGMap[g.name+'|'+(g.propagating?'1':'0')]!==g.perms);
          if (missing.length){aclDiff++;aclFullDetails.push({type:'acl_diff',label:(srcCol._path||srcCol.title||srcCol.name)+' — '+missing.map(g=>g.name+' ('+g.perms+')').join(', '),src:'⚠️',dst:'⚠️'});}
        }));
      }
      results.push({id:'acls_full',label:'ACLs Collections ('+aclMode+')',icon:'🔐',
        summary:aclFullDetails.length===0?aclChecked+' vérifiées, toutes conformes':aclChecked+' vérifiées, '+aclDiff+' divergences',
        status:aclFullDetails.length===0?'ok':'warn',
        details:aclFullDetails});
    }

    // ── Phase 6 : Saved Searches (critères) ───────────────────────────────
    if (scopes.includes('savedSearches')) {
      const ssResult = results.find(r=>r.id==='savedSearches');
      if (ssResult && srcAdapter.type==='iconik') {
        const srcSSList = srcMap.savedSearches||[];
        const dstSSByName = byName(dstMap.savedSearches||[], s=>s.name||s.nom||s.title||s.id);
        const srcViewNameById = {};
        (srcMap.metadataViews||[]).forEach(v=>{if(v?.id) srcViewNameById[v.id]=v.name||v.nom;});
        const dstViewNameById = {};
        (dstMap.metadataViews||[]).forEach(v=>{if(v?.id) dstViewNameById[v.id]=v.name||v.nom;});
        const normCrit = (criteria, isDst) => {
          if (!criteria) return '';
          const c = JSON.parse(JSON.stringify(criteria));
          if (c.metadata_view_id) c.metadata_view_id = isDst ? (dstViewNameById[c.metadata_view_id]||c.metadata_view_id) : (srcViewNameById[c.metadata_view_id]||c.metadata_view_id);
          delete c.created_by_user;
          if (c.filter?.terms) c.filter.terms = c.filter.terms.filter(t=>t.name!=='files.storage_id'&&t.name!=='storage_id');
          // Trier les clés pour éviter les faux positifs liés à l'ordre JSON
          return JSON.stringify(c, Object.keys(c).sort());
        };
        for (const srcS of srcSSList) {
          const dstS = dstSSByName[lower(srcS.name||srcS.nom||'')];
          if (!dstS) continue; // déjà dans ssResult.details (manquants)
          const [srcSD, dstSD] = await Promise.all([
            srcAdapter.fetchSavedSearchDetail(srcS.id),
            dstAdapter.fetchSavedSearchDetail(dstS.id),
          ]);
          const srcCrit = normCrit(srcSD?.search_criteria_document?.criteria||srcSD?.criteria, false);
          const dstCrit = normCrit(dstSD?.search_criteria_document?.criteria||dstSD?.criteria, true);
          if (srcCrit !== dstCrit) ssResult.details.push({type:'criteria_diff',label:(srcS.name||srcS.nom)+' — critères différents',src:'⚠️',dst:'⚠️'});
        }
        ssResult.status  = ssResult.details.length===0?'ok':'warn';
        ssResult.summary = ssResult.details.length===0 ? srcSSList.length+' conformes' : (srcSSList.length-ssResult.details.filter(d=>d.type==='missing').length)+'/'+srcSSList.length+' présentes, '+ssResult.details.length+' divergence(s)';
      }
    }

    // ── Phase 7 : Team Settings ────────────────────────────────────────────
    prog('Team Settings…');
    if (scopes.includes('teams') && srcAdapter.type==='iconik') {
      const srcTeams = (srcMap.teams||[]).filter(t=>!excl.systemTeams||!SYSTEM_TEAMS.has(lower(t.name||t.nom||'')));
      const dstTeamByName = byName(dstMap.teams||[], t=>t.name||t.nom||t.id);
      const srcViewsO = srcMap.metadataViews||[];
      const dstViewsO = dstMap.metadataViews||[];
      const tsDetails = [];
      for (const srcT of srcTeams) {
        const dstT = dstTeamByName[lower(srcT.name||srcT.nom||'')];
        if (!dstT) continue;
        const [srcTS, dstTS] = await Promise.all([srcAdapter.fetchTeamSettings(srcT.id), dstAdapter.fetchTeamSettings(dstT.id)]);
        if (!srcTS || !dstTS) continue;
        const diffs = [];
        for (const key of TEAM_SETTINGS_COMPARE) {
          let sv = srcTS[key], dv = dstTS[key];
          if (key==='home_page') {
            if (typeof sv==='string'&&sv.startsWith('/collection/')) {
              const id=sv.replace('/collection/','');
              const col=await srcAdapter.fetchOne('/API/assets/v1/collections/'+id+'/');
              sv=col?.title?'__col__:'+col.title:null;
            }
            if (typeof dv==='string'&&dv.startsWith('/collection/')) {
              const id=dv.replace('/collection/','');
              const col=await dstAdapter.fetchOne('/API/assets/v1/collections/'+id+'/');
              dv=col?.title?'__col__:'+col.title:null;
            }
          }
          const VIEW_ID_KEYS=['search_view_id','filters_default_metadata_view_id','search_results_asset_metadata_view_id','search_results_collection_metadata_view_id'];
          // Résoudre default_upload_storage_id par nom (storage IDs différents entre domaines)
          if (key==='default_upload_storage_id') {
            if (sv) { const r=await srcAdapter.fetchOne('/API/files/v1/storages/'+sv+'/'); sv=r?.name||sv; }
            if (dv) { const r=await dstAdapter.fetchOne('/API/files/v1/storages/'+dv+'/'); dv=r?.name||dv; }
            // Storage propre au domaine — signaler en ℹ️ pas ⚠️
            if (JSON.stringify(sv??null)!==JSON.stringify(dv??null)) {
              tsDetails.push({type:'storage_info', label:(srcT.name||srcT.nom)+' — storage désigné: "'+sv+'" (config manuelle requise sur destination)', src:'ℹ️', dst:'ℹ️'});
            }
            continue; // traité ici, pas dans la comparaison générale
          }
          if (VIEW_ID_KEYS.includes(key)&&sv&&dv) {
            const [svV,dvV]=await Promise.all([srcAdapter.fetchViewDetail(sv),dstAdapter.fetchViewDetail(dv)]);
            sv=svV?.name||srcViewsO.find(v=>v.id===sv)?.name||sv;
            dv=dvV?.name||dstViewsO.find(v=>v.id===dv)?.name||dv;
          } else if (VIEW_ID_KEYS.includes(key)) {
            sv=srcViewsO.find(v=>v.id===sv)?.name||sv;
            dv=dstViewsO.find(v=>v.id===dv)?.name||dv;
          }
          if (key==='required_metadata_views'&&Array.isArray(sv)&&Array.isArray(dv)) {
            sv=sv.map(id=>srcViewsO.find(v=>v.id===id)?.name||id).sort().join(',');
            dv=dv.map(id=>dstViewsO.find(v=>v.id===id)?.name||id).sort().join(',');
          }
          if (JSON.stringify(sv??null)!==JSON.stringify(dv??null)) diffs.push(key+': '+JSON.stringify(sv)+'→'+JSON.stringify(dv));
        }
        if (diffs.length) tsDetails.push({type:'settings_diff',label:(srcT.name||srcT.nom)+' — '+diffs.join(', '),src:'⚠️',dst:'⚠️'});
      }
      const tsWarn = tsDetails.filter(d=>d.type==='settings_diff').length;
      const tsInfo = tsDetails.filter(d=>d.type==='storage_info').length;
      results.push({id:'teamSettings',label:'Team Settings',icon:'⚙️',
        summary: tsWarn===0 && tsInfo===0 ? srcTeams.length+' conformes'
          : tsWarn===0 ? srcTeams.length+' conformes · ℹ️ '+tsInfo+' storage(s) à configurer'
          : tsWarn+' divergence(s)'+(tsInfo?' · ℹ️ '+tsInfo+' storage(s)':''),
        status: tsWarn>0?'warn':tsInfo>0?'info':'ok',
        details:tsDetails});
    }

    // Émettre sync_done via WFD_Bus si disponible
    try {
      if (window.WFD_Bus) window.WFD_Bus.post('mirror_done', {
        src: srcAdapter.label, dst: dstAdapter.label,
        ok: results.every(r=>r.status!=='warn'),
        scopes: results.map(r=>({id:r.id,status:r.status}))
      });
    } catch (_) {}

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  function downloadBlob(blob, filename) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function dateStr() { return new Date().toISOString().slice(0,10); }
  function orgName() { return (window.APS_Data?.get('organisation')||localStorage.getItem('organisationName')||'APS').replace(/\s+/g,'-'); }

  const APS_Exports = {

    /**
     * Export JSON — résultats bruts de comparaison.
     */
    json(results, meta={}) {
      const payload = {
        schema: 'aps-mirror-check', version: 2,
        exportedAt: new Date().toISOString(),
        source: meta.srcLabel||'', destination: meta.dstLabel||'',
        global: results.every(r=>r.status==='ok')?'OK':'DIVERGENCES',
        scopes: results.map(r=>({ id:r.id, label:r.label, status:r.status, summary:r.summary, divergences:r.details }))
      };
      const org = orgName();
      downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}), `${org}-mirror-check-${dateStr()}.json`);
      return payload;
    },

    /**
     * Export HTML — rapport PDF-able.
     */
    html(results, meta={}) {
      const org = orgName();
      const totalOk   = results.filter(r=>r.status==='ok').length;
      const totalWarn = results.filter(r=>r.status==='warn').length;
      const totalInfo = results.filter(r=>r.status==='info').length;
      const scopeRows = results.map(r=>{
        const icon=r.status==='ok'?'✅':r.status==='info'?'ℹ️':'⚠️';
        const rows = r.details.length===0
          ? '<tr><td colspan="3" style="color:#27ae60;text-align:center;">✅ Aucune divergence</td></tr>'
          : r.details.map(d=>`<tr><td>${d.label}</td><td style="text-align:center;">${d.src}</td><td style="text-align:center;">${d.dst}</td></tr>`).join('');
        return `<h2>${r.icon||icon} ${r.label} <span style="font-size:12px;font-weight:normal;color:#666;">${r.summary}</span></h2>
          <table border="1" cellpadding="5" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px;">
          <thead><tr style="background:#eee;"><th style="text-align:left;">Élément</th><th>Source</th><th>Destination</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
      }).join('');
      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
        <title>${org} — Mirror Check ${dateStr()}</title>
        <style>body{font-family:sans-serif;margin:40px;color:#222;}h1{color:#2c3e50;}h2{margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px;}table{font-size:11px;}th{background:#f0f0f0;}td,th{padding:5px 8px;}</style>
        </head><body>
        <h1>🪞 Mirror Check — ${meta.srcLabel||'Source'} → ${meta.dstLabel||'Destination'}</h1>
        <p><b>Organisation:</b> ${org} · <b>Date:</b> ${new Date().toLocaleString('fr')} · <b>Résultat:</b> ${totalOk} OK, ${totalWarn} divergences, ${totalInfo} info(s)</p>
        ${scopeRows}
        </body></html>`;
      downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}), `${org}-mirror-check-${dateStr()}.html`);
    },

    /**
     * Export XLSX — tableur via SheetJS (_vendor).
     */
    async xlsx(results, meta={}) {
      const org = orgName();
      if (!window.XLSX) { console.warn('[APS_Exports] SheetJS (XLSX) non disponible'); return; }
      const wb = XLSX.utils.book_new();
      // Onglet résumé
      const summaryData = [['Scope','Statut','Résumé'], ...results.map(r=>[r.label, r.status.toUpperCase(), r.summary])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Résumé');
      // Un onglet par scope avec divergences
      results.forEach(r=>{
        if (!r.details.length) return;
        const sheetData = [['Élément','Source','Destination'], ...r.details.map(d=>[d.label, d.src, d.dst])];
        const sheetName = r.label.slice(0,28).replace(/[/\\?*[\]]/g,'_');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), sheetName);
      });
      XLSX.writeFile(wb, `${org}-mirror-check-${dateStr()}.xlsx`);
    },

    /**
     * Export Postman — collection des requêtes API.
     */
    postman(scopes, token, meta={}) {
      const org = orgName();
      const base = (token?.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
      // Construire depuis API_CHECK_SCOPES si disponible, sinon endpoints connus
      const knownScopes = window.API_CHECK_SCOPES || [];
      const items = knownScopes.filter(s=>s.apiReqs?.length).flatMap(s=>s.apiReqs.map(r=>({
        name: s.label+' — '+r.d,
        request: {
          method: r.m,
          header: [{key:'App-ID',value:'{{app_id}}'},{key:'Auth-Token',value:'{{auth_token}}'},{key:'Content-Type',value:'application/json'}],
          url: { raw: '{{base_url}}'+r.p },
          body: r.b ? {mode:'raw',raw:JSON.stringify(r.b)} : undefined
        }
      })));
      const collection = {
        info: { name: org+' — Iconik API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        variable: [{key:'base_url',value:base},{key:'app_id',value:token?.appId||''},{key:'auth_token',value:token?.token||''}],
        item: items
      };
      downloadBlob(new Blob([JSON.stringify(collection,null,2)],{type:'application/json'}), `${org}-postman-${dateStr()}.json`);
    },

    /**
     * Export Python — script de requêtes.
     */
    python(token) {
      const org = orgName();
      const base = (token?.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
      const script = `#!/usr/bin/env python3
"""Iconik API — ${org}
Généré par APS le ${dateStr()}"""
import requests

BASE = "${base}"
HDR = {"App-ID": "${token?.appId||''}", "Auth-Token": "${token?.token||''}", "Content-Type": "application/json"}

def get(path): return requests.get(BASE+path, headers=HDR).json()
def post(path, body): return requests.post(BASE+path, headers=HDR, json=body).json()

get_teams          = lambda: get("/API/users/v1/teams/?per_page=500").get("objects", [])
get_views          = lambda: get("/API/metadata/v1/views/?per_page=500").get("objects", [])
get_fields         = lambda: get("/API/metadata/v1/fields/?per_page=500").get("objects", [])
get_role_groups    = lambda: get("/API/users/v1/role_groups/?per_page=500").get("objects", [])
get_saved_searches = lambda: get("/API/search/v1/search/saved/?per_page=500").get("objects", [])
get_webhooks       = lambda: get("/API/notifications/v1/webhooks/?per_page=500").get("objects", [])
get_custom_actions = lambda: get("/API/assets/v1/custom_actions/?per_page=500").get("objects", [])
get_automations    = lambda: get("/API/automations/v1/automations/?per_page=500").get("objects", [])
get_collections    = lambda: post("/API/search/v1/search/", {"doc_types": ["collections"], "per_page": 500}).get("objects", [])

if __name__ == "__main__":
    print("Teams:         ", len(get_teams()))
    print("MD Views:      ", len(get_views()))
    print("Fields:        ", len(get_fields()))
    print("Collections:   ", len(get_collections()))
    print("Role Groups:   ", len(get_role_groups()))
    print("Saved Searches:", len(get_saved_searches()))
    print("Webhooks:      ", len(get_webhooks()))
    print("Custom Actions:", len(get_custom_actions()))
    print("Automations:   ", len(get_automations()))
`;
      downloadBlob(new Blob([script],{type:'text/plain;charset=utf-8'}), `${org}-iconik-${dateStr()}.py`);
    },

    /**
     * Export Shell — script curl.
     */
    shell(token) {
      const org = orgName();
      const base = (token?.iconikUrl||'https://app.iconik.io').replace(/\/$/,'');
      const script = `#!/bin/bash
# Iconik API — ${org}
# Généré par APS le ${dateStr()}
BASE="${base}"
APP_ID="${token?.appId||''}"
AUTH_TOKEN="${token?.token||''}"
H=(-H "App-ID: $APP_ID" -H "Auth-Token: $AUTH_TOKEN" -H "Content-Type: application/json")

count() { python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('objects',[])),'items')"; }

echo "Teams:         $(curl -s "\${H[@]}" "$BASE/API/users/v1/teams/?per_page=500" | count)"
echo "MD Views:      $(curl -s "\${H[@]}" "$BASE/API/metadata/v1/views/?per_page=500" | count)"
echo "Fields:        $(curl -s "\${H[@]}" "$BASE/API/metadata/v1/fields/?per_page=500" | count)"
echo "Role Groups:   $(curl -s "\${H[@]}" "$BASE/API/users/v1/role_groups/?per_page=500" | count)"
echo "Saved Searches:$(curl -s "\${H[@]}" "$BASE/API/search/v1/search/saved/?per_page=500" | count)"
echo "Webhooks:      $(curl -s "\${H[@]}" "$BASE/API/notifications/v1/webhooks/?per_page=500" | count)"
echo "Custom Actions:$(curl -s "\${H[@]}" "$BASE/API/assets/v1/custom_actions/?per_page=500" | count)"
echo "Automations:   $(curl -s "\${H[@]}" "$BASE/API/automations/v1/automations/?per_page=500" | count)"
echo "Collections:   $(curl -s -X POST "\${H[@]}" "$BASE/API/search/v1/search/" -d '{"doc_types":["collections"],"per_page":500}' | count)"
`;
      downloadBlob(new Blob([script],{type:'text/x-sh'}), `${org}-iconik-${dateStr()}.sh`);
    },

    /**
     * Export Request Log — ordre et liste des requêtes effectuées.
     */
    requestLog(results, meta={}) {
      const org = orgName();
      const knownScopes = window.API_CHECK_SCOPES || [];
      const lines = [
        `# APS — Request Log`,
        `# ${meta.srcLabel||'Source'} → ${meta.dstLabel||'Destination'}`,
        `# Généré le ${new Date().toLocaleString('fr')}`,
        '',
        '## Ordre des requêtes',
        '',
      ];
      let i = 1;
      knownScopes.forEach(s=>{
        (s.apiReqs||[]).forEach(r=>{
          lines.push(`${i++}. [${r.m}] ${r.p} — ${r.d} (${s.label})`);
        });
      });
      lines.push('','## Résultats par scope','');
      results.forEach(r=>{
        lines.push(`### ${r.icon||''} ${r.label} [${r.status.toUpperCase()}]`);
        lines.push(`→ ${r.summary}`);
        r.details.forEach(d=>lines.push(`   ${d.src} ${d.dst} ${d.label}`));
        lines.push('');
      });
      downloadBlob(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}), `${org}-request-log-${dateStr()}.txt`);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPOSITION PUBLIQUE
  // ═══════════════════════════════════════════════════════════════════════════

  window.APS_Adapters = { createIconik: createIconikAdapter, createAPS: createAPSAdapter };
  window.APS_MirrorEngine = { run, DD_SCOPES, COMPARE_SCOPES };
  window.APS_Exports = APS_Exports;

})();
