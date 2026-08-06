/**
 * api-ops-panel.js — Volet bas « API ops » du Builder
 *
 * Port du tiroir API Ops de WFD (server/public/platforms/iconik/workflow/
 * wfd-api-ops.js) : mêmes sections, mêmes données, mêmes exports. Demande
 * explicite de l'utilisateur le 2026-08-06 — « celui de WFD me convient, je
 * voudrais donc la même chose, les mêmes données » — donc port fidèle et non
 * réinterprétation (cf. mémoire feedback-dont-improvise-named-reference).
 *
 * Trois sections, dans l'ordre de lecture de WFD :
 *   1. Timeline   — une carte par opération API, dans l'ordre d'exécution ;
 *   2. Flux de données — une carte par étape : connexion, cibles, stockages ;
 *   3. Détail     — les opérations de l'étape sélectionnée, avec leur corps.
 * Plus les trois exports de WFD : Postman, HTML/PDF, Python.
 *
 * DEUX écarts assumés par rapport au code source, imposés par ce dépôt :
 *  - WFD construit son rendu par `innerHTML` avec styles en ligne ; ici tout
 *    passe par création d'éléments et classes CSS (règle dure du projet :
 *    pas de `style=` en HTML, pas de HTML concaténé avec des données non
 *    échappées). Le RÉSULTAT visible est le même, pas le moyen.
 *  - WFD lit des globales (`wfdData`, `wfdConnexions`, `getFluxCourant()`) ;
 *    ici les ressources viennent des routes REST et le document du pivot de
 *    l'événement `aps:flow-ready`, sans dépendance inverse au canevas —
 *    même principe que run-panel.js / jobs-logs-panel.js.
 *
 * La source est le DOCUMENT PIVOT (statique), pas un run : ce volet décrit ce
 * que le workflow VA appeler, il ne rejoue pas ce qu'il a appelé. C'est
 * exactement le rôle qu'il a dans WFD.
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;
  const hote = root.querySelector('.bd-dock-bottom .bd-panel-bd');
  if (!hote) return;

  let documentActuel = null;
  let nomFlow = '';
  let donnees = [];      // [{ stepId, nom, famille, icone, ops:[{method, ep, desc, body}] }]
  let etapeActive = null;
  const res = { connexions: [], endpoints: [], manifests: [], mappings: [] };

  // ── Ressources d'org ──────────────────────────────────────────────────────
  // `endpoints`/`manifests` sont chargés ICI et non via config-sources.js :
  // celui-ci n'expose délibérément que l'identité + un décompte (allègement
  // pour les sélecteurs). Or décrire les appels d'une séquence Partner exige
  // ses `steps`, et ceux d'un Verify ses `essences`.
  function _charger() {
    const j = function (url) {
      return fetch(url).then(function (r) { return r.ok ? r.json() : []; })
        .then(function (l) { return Array.isArray(l) ? l : []; })
        .catch(function () { return []; });
    };
    return Promise.all([
      j('/api/connexions'), j('/api/endpoints'), j('/api/manifests'), j('/api/mappings'),
    ]).then(function (r4) {
      res.connexions = r4[0]; res.endpoints = r4[1];
      res.manifests = r4[2]; res.mappings = r4[3];
    });
  }

  const _parId = function (liste, id) {
    return (liste || []).find(function (x) { return x.id === id; }) || null;
  };

  // ── Ordre d'exécution ─────────────────────────────────────────────────────
  // Même algorithme que WFD (topoSort) : on part des étapes sans entrée puis
  // on suit les arêtes. Ajout propre au pivot : le corps d'une boucle est
  // inséré juste après elle — ses appels (export, attente, vérification S3)
  // sont de vraies opérations API, les omettre donnerait une liste fausse.
  function _ordonner(steps, edges) {
    const avecEntree = new Set((edges || []).map(function (e) { return e.to.step; }));
    const parId = {};
    (steps || []).forEach(function (s) { parId[s.id] = s; });
    const vus = new Set();
    const sortie = [];

    function visiter(id, profondeur) {
      if (vus.has(id)) return;
      vus.add(id);
      const s = parId[id];
      if (!s) return;
      sortie.push({ step: s, profondeur: profondeur });
      if (s.core === 'loop' && s.body) {
        _ordonner(s.body.steps || [], s.body.edges || []).forEach(function (x) {
          sortie.push({ step: x.step, profondeur: profondeur + 1 });
        });
      }
      (edges || []).filter(function (e) { return e.from.step === id; })
        .forEach(function (e) { visiter(e.to.step, profondeur); });
    }

    (steps || []).filter(function (s) { return !avecEntree.has(s.id); })
      .forEach(function (s) { visiter(s.id, 0); });
    (steps || []).forEach(function (s) { if (!vus.has(s.id)) visiter(s.id, 0); });
    return sortie;
  }

  // ── Construction des opérations ───────────────────────────────────────────
  const SYSTEM_FIELDS = ['id', 'title', 'media_type', 'date_created', 'date_modified',
                         'object_type', 'status', 'archive_status', 'external_id'];
  const TYPE_MAP = { asset: 'assets', collection: 'collections', segment: 'segments',
                     saved_search: 'saved_searches', format: 'formats', storage: 'storages' };

  function _escV(v) { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

  // Reprise fidèle de la construction de requête du moteur
  // (builder-handler-iconik-search.js) : le corps montré doit être celui
  // réellement envoyé, sinon l'export Postman ne rejoue pas le workflow.
  function _requeteRecherche(block) {
    const objectType = TYPE_MAP[block.objectType] || block.objectType || 'assets';
    const isCol = objectType === 'collections';
    const collectionIds = [];
    const termes = [];
    (block.criteria || []).forEach(function (c) {
      if (!c.field) return;
      const op = c.op || 'equals';
      const val = c.value || '';
      if (c.field === '__collection__') {
        const f = (op === 'in_branch') ? 'ancestor_collections' : (isCol ? 'parent_id' : 'in_collections');
        termes.push(f + ':"' + _escV(val) + '"');
        collectionIds.push(val);
        return;
      }
      const f = SYSTEM_FIELDS.indexOf(c.field) !== -1 ? c.field : 'metadata.' + c.field;
      const v = _escV(val);
      if (op === 'equals') termes.push(f + ':"' + v + '"');
      else if (op === 'not_equals') termes.push('NOT ' + f + ':"' + v + '"');
      else if (op === 'contains') termes.push(f + ':*' + v + '*');
      else if (op === 'not_contains') termes.push('NOT ' + f + ':*' + v + '*');
      else if (op === 'starts_with') termes.push(f + ':' + v + '*');
      else if (op === 'is_empty') termes.push('NOT _exists_:' + f);
      else if (op === 'is_not_empty') termes.push('_exists_:' + f);
      else if (op === 'before') termes.push(f + ':<"' + v + '"');
      else if (op === 'after') termes.push(f + ':>"' + v + '"');
      else if (op === 'gt') termes.push(f + ':>' + v);
      else if (op === 'lt') termes.push(f + ':<' + v);
      else termes.push(f + ':"' + v + '"');
    });
    const body = { doc_types: [objectType], query: termes.join(' AND '), filters: [], limit: 500, offset: 0 };
    if (collectionIds.length) body.collection_ids = collectionIds;
    const quoi = (block.criteria || [])
      .filter(function (c) { return c.field && c.field !== '__collection__'; })
      .map(function (c) { return c.field + ' ' + (c.op || 'equals') + ' ' + (c.value || ''); })
      .join(', ');
    return { body: body, objectType: objectType, quoi: quoi };
  }

  function _opsPourEtape(step) {
    const p = step.params || {};
    const ops = [];
    const conn = _parId(res.connexions, p.connexionId);
    const base = conn ? (conn.endpoint || '') : '';
    const op = function (method, ep, desc, body) {
      ops.push({ method: method, ep: ep, desc: desc, body: body || null });
    };
    const cle = step.facade || step.core;

    switch (cle) {
      case 'trigger':
      case 'iconik.trigger':
        op('POST', '/wfd/action/' + (p.slug || p.customActionId || '{slug}'),
           'Déclenchement par Custom Action Iconik' + (p.target ? ' sur ' + p.target : ''));
        break;

      case 'iconik.search':
        (p.blocks || []).forEach(function (b, i) {
          const q = _requeteRecherche(b);
          op('POST', '/API/search/v1/search/',
             'Recherche ' + q.objectType + ((p.blocks || []).length > 1 ? ' — bloc ' + (i + 1) : '')
             + (q.quoi ? ' : ' + q.quoi : '')
             + (p.resultVar ? '  →  {' + p.resultVar + '}' : ''), q.body);
        });
        break;

      case 'iconik.fetch': {
        const type = p.fetchSubType === 'collection' ? 'collections' : 'assets';
        op('GET', '/API/assets/v1/' + type + '/' + (p.fetchValue || '{id}') + '/',
           'Récupérer les propriétés' + (p.fetchVar ? '  →  {' + p.fetchVar + '}' : ''));
        if (p.withMetadata) op('GET', '/API/metadata/v1/' + type + '/{id}/', 'Lire les métadonnées');
        if (p.withFormats) op('GET', '/API/files/v1/assets/{id}/file_sets/', 'Récupérer les formats techniques');
        if (p.withKeyframes) op('GET', '/API/files/v1/assets/{id}/keyframes/', 'Récupérer les keyframes');
        break;
      }

      case 'iconik.resolve_ancestors':
        op('POST', '/API/search/v1/search/',
           'Rechercher la collection parente par BayardID — répété par niveau',
           { doc_types: ['collections'], query: 'metadata.BayardID:"{ParentID}"' });
        op('GET', '/API/metadata/v1/collections/{id}/', 'Lire les métadonnées de l’ancêtre');
        ops[ops.length - 1].desc += '  →  {' + (p.varName || 'ancestorPath') + '}';
        break;

      case 'deliver':
      case 'aws_s3.deliver': {
        const bucket = '{bucket}';
        const prefixe = p.objectKey || '';
        const operation = p.operation || 'list_objects';
        const methodes = { list_objects: 'GET', head_object: 'HEAD', get_object: 'GET',
                           put_object: 'PUT', delete_object: 'DELETE' };
        let desc = 'S3 ' + operation.toUpperCase() + ' — ' + prefixe + ' [Signature V4]';
        const man = _parId(res.manifests, p.manifestId);
        const sorties = ((man && man.essences) || []).map(function (e) { return e.sortie; }).filter(Boolean);
        if (sorties.length) {
          desc += '  →  ' + sorties.map(function (v) { return '{' + v + '}'; }).join(', ');
        }
        op(methodes[operation] || 'GET',
           'https://' + bucket + '.s3.amazonaws.com/?list-type=2&prefix=' + encodeURIComponent(prefixe),
           desc);
        break;
      }

      case 'iconik.set_metadata': {
        const cible = p.target === 'collection' ? 'collections' : 'assets';
        const body = { metadata_values: {} };
        (p.fields || []).forEach(function (f) {
          if (f.key) body.metadata_values[f.key] = { field_values: [{ value: String(f.value == null ? '' : f.value) }] };
        });
        op('PUT', '/API/metadata/v1/' + cible + '/' + (p.targetId || '{id}') + '/'
           + (p.mdViewId ? 'views/' + p.mdViewId + '/' : ''),
           'Écrire ' + (p.fields || []).length + ' champ(s) de métadonnées', body);
        break;
      }

      case 'history':
      case 'iconik.history': {
        const cible = p.target === 'collection' ? 'collections' : 'assets';
        const ep = '/API/metadata/v1/' + cible + '/' + (p.targetId || '{id}') + '/'
                 + (p.mdViewId ? 'views/' + p.mdViewId + '/' : '');
        op('GET', ep, 'Relire la valeur courante de « ' + (p.mdField || '?') + ' »');
        const body = { metadata_values: {} };
        body.metadata_values[p.mdField || '{champ}'] = {
          field_values: [{ value: '<ligne d’historique — date | ' + (p.whWfName || '') + ' | ' + (p.whStatut || '') + '>' }],
        };
        op('PUT', ep, 'Écrire l’historique dans « ' + (p.mdField || '?') + ' »'
           + (p.whMode === 'update' ? ' (remplace la ligne de ce run)' : ' (ajoute une ligne)'), body);
        break;
      }

      case 'iconik.action': {
        const at = p.actionType;
        if (at === 'export_location_trigger') {
          op('POST', '/API/files/v1/assets/' + (p.assetId || '{asset_id}') + '/export_locations/'
             + (p.target || '{export_location_id}') + '/',
             'Export vers Export Location — retourne job_id  →  {exportJobId}',
             { file_name: p.fileName || '{fileName}' });
        } else if (at === 'custom_action_trigger') {
          op('POST', '/API/assets/v1/assets/{asset_id}/custom_actions/' + (p.customActionId || '{id}') + '/execute/',
             'Déclencher une Custom Action');
        } else if (at === 'metadata_collection' || at === 'metadata_patch') {
          const cible2 = at === 'metadata_collection' ? 'collections' : 'assets';
          const body2 = { metadata_values: {} };
          (p.fields || []).forEach(function (f) {
            if (f.key) body2.metadata_values[f.key] = { field_values: [{ value: String(f.value == null ? '' : f.value) }] };
          });
          op('PUT', '/API/metadata/v1/' + cible2 + '/{id}/' + (p.viewId ? 'views/' + p.viewId + '/' : ''),
             'Écrire les métadonnées', body2);
        } else {
          op('POST', '/API/assets/v1/' + (at || '{action}') + '/', 'Action Iconik : ' + (at || '?'));
        }
        break;
      }

      case 'iconik.create_tree': {
        op('POST', '/API/assets/v1/collections/',
           'Créer la collection — répété pour chaque niveau du modèle d’arborescence',
           { title: '<titre du niveau, variables résolues>', parent_id: p.parentId || '{collection.id}' });
        const champs = {};
        champs[p.idFieldName || 'BayardID'] = { field_values: [{ value: '<identifiant généré>' }] };
        champs[p.typeFieldName || 'TypeCollection'] = { field_values: [{ value: '<type du niveau>' }] };
        if (p.parentBayardId) champs[p.parentFieldName || 'ParentID'] = { field_values: [{ value: p.parentBayardId }] };
        if (p.orderFieldName) champs[p.orderFieldName] = { field_values: [{ value: '<numéro d’ordre, calculé en base>' }] };
        (p.extraFields || []).forEach(function (f) {
          if (f.key) champs[f.key] = { field_values: [{ value: String(f.value == null ? '' : f.value) }] };
        });
        op('PUT', '/API/metadata/v1/collections/{id}/views/' + (p.metadataViewId || '{viewId}') + '/',
           'Écrire les métadonnées de la collection créée', { metadata_values: champs });
        break;
      }

      case 'http_request': {
        const methode = (p.method || 'POST').toUpperCase();
        const url = p.endpoint || p.url || '';
        const complet = url.indexOf('http') === 0 ? url : base + url;
        let body = null;
        if (p.bodyTemplate) { try { body = JSON.parse(p.bodyTemplate); } catch (_) { body = p.bodyTemplate; } }
        op(methode, complet, (conn ? conn.name : 'API externe'), body);
        break;
      }

      case 'http_sequence':
      case 'vodfactory.partner': {
        const seq = _parId(res.endpoints, p.sequenceId);
        const seqConn = _parId(res.connexions, p.connexionId) || conn;
        const seqBase = seqConn ? (seqConn.endpoint || '').replace(/\/$/, '') : base;
        const etapes = (seq && seq.steps) || p.steps || [];
        etapes.forEach(function (s, i) {
          const m = (s.method || 'POST').toUpperCase();
          const ep = s.endpoint || s.url || '';
          const complet = ep.indexOf('http') === 0 ? ep : seqBase + ep;
          const nom = (s.name || 'Étape ' + (i + 1)) + ' [' + (seqConn ? seqConn.name : 'API') + ']';
          let body = null;
          if (s.bodyTemplate) { try { body = JSON.parse(s.bodyTemplate); } catch (_) { body = s.bodyTemplate; } }
          let desc = nom;
          if (s.httpMode === 'foreach') {
            desc += ' — foreach {' + (s.feSourceVar || '?').replace(/^\{|\}$/g, '') + '} job=' + (s.feJob || '?');
            const ign = (s.feIgnoreCodes || []);
            if (ign.length) desc += '  [ignore ' + ign.join(',') + ']';
          }
          if (s.skipIfEmpty) desc += '  [ignorée si ' + s.skipIfEmpty + ' vide]';
          if (s.resultVar) desc += '  →  {' + s.resultVar + '}';
          op(m, complet, desc, body);
          // L'upsert est un VRAI second appel HTTP quand le POST est refusé
          // en 422 (builder-handler-http-request.js) — l'omettre donnerait
          // une liste incomplète des appels réellement émis.
          if (s.upsert && m === 'POST') {
            op('PUT', complet.replace(/\/$/, '') + '/{external_id}',
               'Upsert — PUT si le POST renvoie 422', body);
          }
        });
        break;
      }

      case 'verify': {
        const man = _parId(res.manifests, p.manifestId);
        const vConn = _parId(res.connexions, p.connexionId);
        const vBase = vConn ? (vConn.endpoint || '').replace(/\/$/, '') : '';
        const checks = ((man && man.essences) || []).filter(function (e) { return e.verifyPath; });
        if (checks.length) {
          checks.forEach(function (e) {
            op('GET', vBase + (e.verifyEndpoint || ''),
               'Vérifier « ' + e.role +' » — ' + e.verifyPath + ' non vide');
          });
        } else {
          op('GET', vBase + '/…', 'Vérifications issues du manifeste');
        }
        break;
      }

      case 'wait': {
        const ep = p.endpoint || '';
        const complet = ep.indexOf('http') === 0 ? ep : base + ep;
        const cond = (p.checkPath || '') + ' = ' + (p.checkValue || '?');
        const bornes = (p.delaySeconds && p.maxTries) ? '  [' + p.delaySeconds + 's × ' + p.maxTries + ']' : '';
        op('GET', complet, 'Polling — attend ' + cond + bornes
           + (p.failValues ? '  [échec si ' + p.failValues + ']' : ''));
        break;
      }

      case 'aps.registry':
        op('—', '(opération locale)', 'Génère un identifiant' + (p.varName ? '  →  {' + p.varName + '}' : ''));
        break;

      case 'lookup': {
        const map = _parId(res.mappings, p.mappingId);
        const n = map ? (map.nbEntrees != null ? map.nbEntrees : (map.rows || []).length) : 0;
        op('—', '(opération locale)',
           'Correspondance ' + n + ' règle(s) : {' + (p.lkInputVar || 'entrée') + '} → {'
           + (p.lkOutputVar || 'résultat') + '}');
        break;
      }

      case 'decision':
        op('—', '(évaluation locale)',
           'Condition sur « ' + (p.field || '?') + ' » — ' + ((p.conditions || []).length) + ' sortie(s)');
        break;

      case 'loop':
        op('—', '(itération locale)',
           'Boucle sur ' + (p.loopVariablePath || '{liste}') + ' — variable {' + (p.loopVar || 'item') + '}');
        break;

      case 'set_variable':
        op('—', '(opération locale)',
           ((p.assignments || []).length) + ' variable(s) affectée(s)');
        break;

      case 'transform':
        op('—', '(opération locale)', 'Transformation : ' + (p.operation || '?'));
        break;
    }
    return ops;
  }

  function _construire() {
    if (!documentActuel) { donnees = []; return; }
    const ordre = _ordonner(documentActuel.steps || [], documentActuel.edges || []);
    donnees = ordre.map(function (x) {
      return {
        stepId: x.step.id,
        nom: x.step.label || x.step.core,
        famille: x.step.facade || x.step.core,
        profondeur: x.profondeur,
        params: x.step.params || {},
        ops: _opsPourEtape(x.step),
      };
    }).filter(function (d) { return d.ops.length > 0; });
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  function _el(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined && texte !== null) e.textContent = texte;
    return e;
  }

  function _epCourt(ep) {
    return String(ep || '')
      .replace('https://', '')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{id}')
      .replace(/\{[^}]+\}/g, '{…}');
  }

  function _rendre() {
    hote.textContent = '';

    const total = donnees.reduce(function (n, d) {
      return n + d.ops.filter(function (o) { return o.method !== '—'; }).length;
    }, 0);

    // En-tête : identité + décompte + exports (mêmes trois que WFD).
    const hd = _el('div', 'ao-hd');
    const g = _el('div', 'ao-hd-g');
    g.appendChild(_el('span', 'ao-titre', '⚡ Opérations API'));
    g.appendChild(_el('span', 'ao-flow', nomFlow));
    g.appendChild(_el('span', 'ao-count', total + ' opération' + (total > 1 ? 's' : '') + ' API'));
    hd.appendChild(g);
    const d = _el('div', 'ao-hd-d');
    [['📦 Postman', _exportPostman], ['📄 HTML', _exportHtml], ['🐍 Python', _exportPython]]
      .forEach(function (b) {
        const btn = _el('button', 'ao-export', b[0]);
        btn.type = 'button';
        btn.addEventListener('click', b[1]);
        d.appendChild(btn);
      });
    hd.appendChild(d);
    hote.appendChild(hd);

    if (!donnees.length) {
      hote.appendChild(_el('p', 'bd-empty', documentActuel
        ? 'Aucune opération API dans ce workflow.'
        : 'Ouvrez un workflow pour voir ses opérations API.'));
      return;
    }

    hote.appendChild(_sectionTimeline());
    hote.appendChild(_sectionVariables());
    hote.appendChild(_sectionDetail());
  }

  // 1. Timeline — une carte par opération, dans l'ordre d'exécution.
  function _sectionTimeline() {
    const bloc = _el('div', 'ao-timeline');
    const plat = [];
    donnees.forEach(function (nd) {
      nd.ops.forEach(function (o, i) { plat.push({ nd: nd, op: o, i: i }); });
    });
    plat.forEach(function (item, idx) {
      const carte = _el('div', 'ao-carte');
      carte.setAttribute('data-actif', item.nd.stepId === etapeActive ? '1' : '0');
      if (item.nd.profondeur > 0) carte.setAttribute('data-imbrique', '1');
      carte.title = item.op.desc;

      const nom = _el('div', 'ao-carte-nom');
      nom.textContent = item.i === 0 ? item.nd.nom : '↳ ' + item.nd.nom;
      if (item.i !== 0) nom.setAttribute('data-suite', '1');
      carte.appendChild(nom);

      const m = _el('span', 'ao-methode', item.op.method);
      m.setAttribute('data-m', item.op.method === '—' ? 'local' : item.op.method);
      carte.appendChild(m);
      carte.appendChild(_el('div', 'ao-ep', _epCourt(item.op.ep)));

      carte.addEventListener('click', function () {
        etapeActive = item.nd.stepId;
        _rendre();
      });
      bloc.appendChild(carte);

      if (idx < plat.length - 1) {
        const suivant = plat[idx + 1];
        bloc.appendChild(_el('div', 'ao-fleche',
          suivant.nd.stepId !== item.nd.stepId ? '→' : '↓'));
      }
    });
    return bloc;
  }

  // 2. Flux de données — connexion, cibles, stockages, par étape.
  function _sectionVariables() {
    const bloc = _el('div', 'ao-vars');
    bloc.appendChild(_el('div', 'ao-section-titre', 'Flux de données'));
    const piste = _el('div', 'ao-vars-piste');

    donnees.forEach(function (nd, i) {
      const p = nd.params;
      const conn = _parId(res.connexions, p.connexionId);
      const source = _source(nd.famille, conn);

      const carte = _el('div', 'ao-vcarte');
      const tete = _el('div', 'ao-vcarte-hd');
      tete.appendChild(_el('span', 'ao-vcarte-nom', nd.nom));
      const badge = _el('span', 'ao-src', source.label);
      badge.setAttribute('data-src', source.cle);
      tete.appendChild(badge);
      carte.appendChild(tete);

      if (conn) {
        carte.appendChild(_el('div', 'ao-vlabel', 'Connexion'));
        carte.appendChild(_el('div', 'ao-vconn', conn.name));
      }

      const cibles = _cibles(nd, p);
      if (cibles.length) {
        carte.appendChild(_el('div', 'ao-vlabel', 'Cible'));
        const w = _el('div', 'ao-pills');
        cibles.forEach(function (c) { w.appendChild(_pill(c.v, c.src)); });
        carte.appendChild(w);
      }

      const stocks = _stockages(nd, p);
      if (stocks.length) {
        carte.appendChild(_el('div', 'ao-vlabel', 'Stockage'));
        const w = _el('div', 'ao-pills');
        stocks.forEach(function (s) { w.appendChild(_pill(s.v, s.src)); });
        carte.appendChild(w);
      }

      // Séquence HTTP : ses étapes sont repliées, comme dans WFD.
      if (nd.famille === 'http_sequence' || nd.famille === 'vodfactory.partner') {
        const seq = _parId(res.endpoints, p.sequenceId);
        const etapes = (seq && seq.steps) || p.steps || [];
        if (etapes.length) {
          const det = _el('details', 'ao-vsteps');
          det.appendChild(_el('summary', null, etapes.length + ' étapes'));
          etapes.forEach(function (s, si) {
            const l = _el('div', 'ao-vstep');
            l.appendChild(_el('span', 'ao-vstep-n', (si + 1) + '.'));
            l.appendChild(_el('span', null, ' ' + (s.name || s.endpoint || 'Étape ' + (si + 1))));
            const rv = s.resultVar || s.feResultVar;
            if (rv) l.appendChild(_el('span', 'ao-vstep-out', ' →{' + rv + '}'));
            det.appendChild(l);
          });
          carte.appendChild(det);
        }
      }

      if (!conn && !cibles.length && !stocks.length) {
        carte.appendChild(_el('div', 'ao-vvide', '—'));
      }

      piste.appendChild(carte);
      if (i < donnees.length - 1) piste.appendChild(_el('div', 'ao-vfleche', '→'));
    });

    bloc.appendChild(piste);
    return bloc;
  }

  function _source(famille, conn) {
    if (famille.indexOf('iconik') === 0 || famille === 'trigger' || famille === 'history') {
      return { cle: 'iconik', label: 'Iconik' };
    }
    if (famille === 'deliver' || famille === 'aws_s3.deliver') return { cle: 's3', label: 'S3' };
    if (famille === 'vodfactory.partner') return { cle: 'vodfactory', label: 'VodFactory' };
    if (famille === 'http_sequence' || famille === 'http_request' || famille === 'verify' || famille === 'wait') {
      const b = ((conn && conn.endpoint) || '').toLowerCase();
      return (b.indexOf('vodfactory') !== -1 || b.indexOf('partner') !== -1)
        ? { cle: 'vodfactory', label: 'VodFactory' } : { cle: 'api', label: 'API' };
    }
    return { cle: 'aps', label: 'APS' };
  }

  function _pill(v, src) {
    const s = _el('span', 'ao-pill', String(v).charAt(0) === '+' ? String(v) : '{' + v + '}');
    s.setAttribute('data-src', src || 'aps');
    s.title = s.textContent;
    return s;
  }

  function _cibles(nd, p) {
    const out = [];
    const f = nd.famille;
    if (f.indexOf('iconik') === 0 || f === 'history') {
      if (p.targetId) out.push({ v: String(p.targetId).replace(/^\{|\}$/g, ''), src: 'iconik' });
    }
    if (f === 'deliver' || f === 'aws_s3.deliver') {
      if (p.objectKey) out.push({ v: String(p.objectKey).replace(/^\{|\}$/g, ''), src: 'aps' });
    }
    if (f === 'lookup' && p.lkInputVar) out.push({ v: String(p.lkInputVar).replace(/^\{|\}$/g, ''), src: 'aps' });
    if (f === 'loop' && p.loopVariablePath) out.push({ v: String(p.loopVariablePath).replace(/^\{|\}$/g, ''), src: 'aps' });
    if (f === 'decision' && p.field) out.push({ v: String(p.field).replace(/^\{|\}$/g, ''), src: 'aps' });
    if (f === 'wait' && p.endpoint) out.push({ v: p.endpoint, src: 'api' });
    return out;
  }

  function _stockages(nd, p) {
    const out = [];
    const f = nd.famille;
    if (p.resultVar) out.push({ v: p.resultVar, src: f === 'deliver' || f === 'aws_s3.deliver' ? 's3' : 'api' });
    if (p.lkOutputVar) out.push({ v: p.lkOutputVar, src: 'aps' });
    if (p.fetchVar) out.push({ v: p.fetchVar, src: 'iconik' });
    if (p.varName) out.push({ v: p.varName, src: 'aps' });
    if (f === 'deliver' || f === 'aws_s3.deliver') {
      const man = _parId(res.manifests, p.manifestId);
      ((man && man.essences) || []).forEach(function (e) {
        if (e.sortie) out.push({ v: e.sortie, src: 's3' });
      });
    }
    if (f === 'iconik.set_metadata' || f === 'iconik.action') {
      (p.fields || []).forEach(function (x) { if (x.key) out.push({ v: x.key, src: 'iconik' }); });
    }
    if (f === 'history' || f === 'iconik.history') {
      if (p.mdField) out.push({ v: p.mdField, src: 'iconik' });
    }
    if (f === 'set_variable') {
      (p.assignments || []).forEach(function (a) {
        const k = a.key || a.name || a.var;
        if (k) out.push({ v: k, src: 'aps' });
      });
    }
    if (f === 'iconik.action' && p.actionType === 'export_location_trigger') {
      out.push({ v: 'exportJobId', src: 'iconik' });
    }
    return out;
  }

  // 3. Détail de l'étape sélectionnée.
  function _sectionDetail() {
    const bloc = _el('div', 'ao-detail');
    const nd = donnees.find(function (x) { return x.stepId === etapeActive; });
    if (!nd) {
      bloc.appendChild(_el('div', 'ao-detail-vide',
        'Cliquez sur une opération pour voir son détail.'));
      return bloc;
    }
    const t = _el('div', 'ao-detail-titre', nd.nom);
    t.appendChild(_el('span', 'ao-detail-fam', nd.famille));
    bloc.appendChild(t);

    nd.ops.forEach(function (o) {
      const c = _el('div', 'ao-detail-op');
      const l = _el('div', 'ao-detail-l');
      const m = _el('span', 'ao-methode', o.method);
      m.setAttribute('data-m', o.method === '—' ? 'local' : o.method);
      l.appendChild(m);
      l.appendChild(_el('span', 'ao-detail-desc', o.desc));
      c.appendChild(l);
      c.appendChild(_el('div', 'ao-detail-ep', o.ep));
      if (o.body) {
        c.appendChild(_el('div', 'ao-detail-body-lbl', 'BODY'));
        c.appendChild(_el('pre', 'ao-detail-body', JSON.stringify(o.body, null, 2)));
      }
      bloc.appendChild(c);
    });
    return bloc;
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  function _telecharger(contenu, type, nom) {
    const blob = new Blob([contenu], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function _nomFichier(ext) {
    return (nomFlow || 'workflow').replace(/[^a-zA-Z0-9_-]+/g, '_') + '_api-ops.' + ext;
  }

  function _exportPostman() {
    const items = [];
    donnees.forEach(function (nd) {
      const sous = nd.ops.filter(function (o) { return o.method !== '—'; }).map(function (o) {
        const url = o.ep.indexOf('http') === 0 ? o.ep : '{{base_url}}' + o.ep;
        return {
          name: o.desc,
          request: {
            method: o.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: url },
            body: o.body ? { mode: 'raw', raw: JSON.stringify(o.body, null, 2) } : undefined,
          },
        };
      });
      if (sous.length) items.push({ name: nd.nom, item: sous });
    });
    _telecharger(JSON.stringify({
      info: {
        name: nomFlow || 'Workflow',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        description: 'Opérations API générées depuis APS Builder',
      },
      item: items,
      variable: [{ key: 'base_url', value: '' }],
    }, null, 2), 'application/json', _nomFichier('postman.json'));
  }

  function _exportHtml() {
    // Document autonome : aucune ressource externe, il doit rester lisible
    // hors ligne et imprimable en PDF.
    const esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    let corps = '';
    donnees.forEach(function (nd) {
      corps += '<h2>' + esc(nd.nom) + ' <small>' + esc(nd.famille) + '</small></h2>';
      nd.ops.forEach(function (o) {
        corps += '<div class="op"><div><span class="m">' + esc(o.method) + '</span> '
              + esc(o.desc) + '</div><div class="ep">' + esc(o.ep) + '</div>'
              + (o.body ? '<pre>' + esc(JSON.stringify(o.body, null, 2)) + '</pre>' : '')
              + '</div>';
      });
    });
    const total = donnees.reduce(function (n, d) {
      return n + d.ops.filter(function (o) { return o.method !== '—'; }).length;
    }, 0);
    _telecharger('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
      + '<title>' + esc(nomFlow) + ' — Opérations API</title><style>'
      + 'body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#222}'
      + 'h1{font-size:20px} h2{font-size:14px;margin-top:1.6rem;border-bottom:1px solid #ddd;padding-bottom:.3rem}'
      + 'h2 small{color:#888;font-weight:400;font-size:11px}'
      + '.op{margin:.6rem 0 .9rem;padding-left:.8rem;border-left:3px solid #eee}'
      + '.m{display:inline-block;min-width:52px;font:600 11px monospace;color:#fff;background:#555;padding:1px 6px;border-radius:3px;text-align:center}'
      + '.ep{font:11px monospace;color:#0a5;margin-top:.2rem;word-break:break-all}'
      + 'pre{background:#f6f6f6;padding:.6rem;border-radius:4px;font-size:11px;overflow-x:auto}'
      + '@media print{body{max-width:none}}</style></head><body>'
      + '<h1>' + esc(nomFlow) + '</h1><p>' + total + ' opération(s) API — généré par APS Builder le '
      + new Date().toLocaleString('fr-FR') + '</p>' + corps + '</body></html>',
      'text/html', _nomFichier('html'));
  }

  function _exportPython() {
    const lignes = [
      '#!/usr/bin/env python3',
      '# -*- coding: utf-8 -*-',
      '"""Opérations API de « ' + (nomFlow || 'workflow') + ' » — généré par APS Builder.',
      '',
      'Script de RÉFÉRENCE : il transcrit les appels du workflow, il ne les',
      'rejoue pas tels quels (les variables {…} doivent être renseignées).',
      '"""',
      'import json, requests',
      '',
      'BASE_URL = ""      # racine de l\'API',
      'HEADERS  = {"Content-Type": "application/json"}',
      '',
    ];
    donnees.forEach(function (nd, i) {
      lignes.push('# ── ' + (i + 1) + '. ' + nd.nom + ' (' + nd.famille + ')');
      nd.ops.forEach(function (o) {
        if (o.method === '—') { lignes.push('# (opération locale) ' + o.desc); return; }
        lignes.push('# ' + o.desc);
        const url = o.ep.indexOf('http') === 0 ? JSON.stringify(o.ep) : 'BASE_URL + ' + JSON.stringify(o.ep);
        if (o.body) {
          lignes.push('payload = ' + JSON.stringify(o.body, null, 2).replace(/\btrue\b/g, 'True')
            .replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None'));
          lignes.push('r = requests.request(' + JSON.stringify(o.method) + ', ' + url + ', headers=HEADERS, json=payload)');
        } else {
          lignes.push('r = requests.request(' + JSON.stringify(o.method) + ', ' + url + ', headers=HEADERS)');
        }
        lignes.push('print(r.status_code, r.text[:200])');
      });
      lignes.push('');
    });
    _telecharger(lignes.join('\n'), 'text/x-python', _nomFichier('py'));
  }

  // ── Câblage ───────────────────────────────────────────────────────────────
  // Même convention que run-panel.js : on écoute `aps:flow-ready` sur root,
  // sans dépendance inverse au canevas. L'événement se redéclenche après
  // CHAQUE sauvegarde (y compris l'auto-save) — c'est voulu ici : la liste
  // des appels doit suivre l'édition en cours, exactement comme le
  // refreshApiOps() branché sur sauvegarderConfig dans WFD.
  // `aps:flow-ready` ne porte que {flowId, orgId, name} — pas le document. On
  // relit donc le brouillon enregistré, qui est précisément la bonne source :
  // ce volet décrit ce que le workflow VA appeler, à partir de son état
  // sauvegardé (l'auto-save relance l'événement à chaque édition, donc la
  // liste suit le canevas — équivalent du refreshApiOps() branché sur
  // sauvegarderConfig dans WFD).
  let flowIdActuel = null;
  let chargementEnCours = 0;

  function _relire(flowId) {
    if (!flowId) { documentActuel = null; donnees = []; _rendre(); return; }
    const jeton = ++chargementEnCours;
    fetch('/api/builder-flows/' + encodeURIComponent(flowId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res2) {
        if (jeton !== chargementEnCours) return; // une relecture plus récente a pris la main
        documentActuel = (res2 && res2.document) || null;
        if (res2 && res2.name) nomFlow = res2.name;
        _construire();
        _rendre();
      })
      .catch(function () { /* volet non critique : on garde l'état précédent */ });
  }

  root.addEventListener('aps:flow-ready', function (e) {
    flowIdActuel = e.detail.flowId || null;
    nomFlow = e.detail.name || nomFlow;
    if (etapeActive && e.detail.flowId !== flowIdActuel) etapeActive = null;
    _relire(flowIdActuel);
  });

  // Cliquer un nœud sur le canevas sélectionne aussi son détail ici — même
  // événement que run-panel.js, aucune dépendance supplémentaire.
  root.addEventListener('aps:node-clicked', function (e) {
    if (!donnees.length) return;
    if (!donnees.some(function (d) { return d.stepId === e.detail.stepId; })) return;
    etapeActive = e.detail.stepId;
    _rendre();
  });

  _charger().then(function () {
    if (flowIdActuel) _relire(flowIdActuel);
    else _rendre();
  });

})();
