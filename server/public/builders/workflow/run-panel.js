/**
 * run-panel.js — Dock droit, vue Run : inspecteur d'UN nœud
 *
 * Le déclenchement d'un run vit dans Jobs (dock gauche, jobs-logs-panel.js)
 * — ce panneau n'est QUE l'inspecteur d'un nœud pour le run actuellement
 * suivi (wf-run-poll.js), jamais un formulaire de test (retour utilisateur
 * du 2026-08-05, après une première version qui mélangeait les deux :
 * "un panneau Debug qui n'a rien à faire à droite selon la logique").
 * Cliquer un nœud sur le canevas (`aps:node-clicked`, workflow-canvas.js)
 * peuple 3 onglets, chacun avec un rôle strictement différent :
 *   - Assets : QUELS assets (noms + décompte) sont passés par CE nœud —
 *     across toutes les itérations si le nœud est dans une boucle.
 *   - Action : CE QUE ce nœud a produit, et seulement ça — diff du
 *     contexte entre son step:start et son step:done/error, générique
 *     (fonctionne pour tout core sans connaître son détail interne),
 *     avec un petit enrichissement dédié pour `decision` (condition
 *     testée + port emprunté, lisible en une phrase).
 *   - Debug : données brutes complètes, verbeux par nature (c'est un
 *     debug) — identique à l'ancien debug-panel.js, juste relocalisé ici.
 *
 * Indépendant de workflow-canvas.js — même principe que jobs-logs-panel.js
 * et config-sources.js : lit `aps:run-tick` (wf-run-poll.js) et
 * `aps:node-clicked` (workflow-canvas.js) sur root, aucune dépendance
 * inverse.
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const emptyEl   = root.querySelector('[data-role="run-empty"]');
  const contentEl = root.querySelector('[data-role="run-content"]');
  const hdEl      = root.querySelector('[data-role="run-node-hd"]');
  const subtabs   = root.querySelectorAll('[data-role="run-subtabs"] .bd-subtab');
  const paneAssets = root.querySelector('[data-role="run-pane-assets"]');
  const paneAction = root.querySelector('[data-role="run-pane-action"]');
  const paneDebug  = root.querySelector('[data-role="run-pane-debug"]');
  if (!contentEl || !paneAssets || !paneAction || !paneDebug) return;

  let flowId = root._flowId || null;
  let documentActuel = null;
  let eventsActuel = [];
  let runActuel = null;
  let stepIdSelectionne = null;
  let paneActive = 'assets';
  let loopAncestorMap = {}; // stepId -> { loopVar } de la boucle englobante la plus proche, ou undefined

  // ── Index du document : step par id + ancêtre-boucle le plus proche ──────
  function _indexerDocument(document_) {
    const steps = {};
    const loops = {};
    function marcher(liste, ancetre) {
      (liste || []).forEach(function (s) {
        steps[s.id] = s;
        loops[s.id] = ancetre;
        if (s.core === 'loop' && s.body) {
          marcher(s.body.steps, { loopVar: (s.params && s.params.loopVar) || 'item' });
        }
      });
    }
    marcher((document_ && document_.steps) || [], null);
    return { steps: steps, loops: loops };
  }

  function _formaterHeure(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  // ── Sous-onglets ──────────────────────────────────────────────────────────
  subtabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      paneActive = btn.getAttribute('data-pane');
      subtabs.forEach(function (b) { b.classList.toggle('bd-subtab-active', b === btn); });
      [paneAssets, paneAction, paneDebug].forEach(function (p) {
        p.classList.toggle('bd-pane-active', p.getAttribute('data-pane') === paneActive);
      });
    });
  });

  // ── Rendu principal ───────────────────────────────────────────────────────
  function _rendre() {
    if (!runActuel || !stepIdSelectionne) {
      contentEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = runActuel
          ? 'Click a node to inspect it.'
          : 'Open a run (Jobs) and click a node to inspect it.';
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    contentEl.hidden = false;

    const idx = _indexerDocument(documentActuel);
    const step = idx.steps[stepIdSelectionne];
    const loopInfo = idx.loops[stepIdSelectionne];

    const evenements = (window.WfRunStatus ? window.WfRunStatus.evenementsDuStep(eventsActuel, stepIdSelectionne) : []);
    // Un groupe = UN passage réel (start -> error? -> done) : une erreur non
    // fatale (onError:'continue_log') émet à la fois step:error ET un
    // step:done qui suit — les compter séparément doublerait le nombre de
    // passages pour CETTE MÊME itération.
    const occurrences = _grouperOccurrences(evenements);

    _rendreHeader(step, occurrences);
    _rendreAssets(step, occurrences, loopInfo);
    _rendreAction(step, occurrences, loopInfo);
    _rendreDebug(step, evenements);
  }

  function _rendreHeader(step, occurrences) {
    if (!hdEl) return;
    hdEl.textContent = '';
    const titre = document.createElement('div');
    titre.className = 'jb-titre';
    titre.textContent = step ? step.label : stepIdSelectionne;
    const meta = document.createElement('div');
    meta.className = 'jb-meta';
    meta.textContent = (step ? (step.core + (step.facade ? ' · ' + step.facade : '')) : '') + ' · ' + stepIdSelectionne;
    hdEl.appendChild(titre);
    hdEl.appendChild(meta);

    // Décompte directement sur le libellé de l'onglet Assets — c'est là que
    // manquait un vrai chiffre (retour utilisateur : le nœud "clignote" sur
    // le canevas mais rien n'indique combien de passages ont eu lieu). Un
    // passage = une occurrence (start->error?->done), jamais un décompte
    // brut d'événements (une erreur non fatale émet error PUIS done pour LA
    // MÊME itération, doubler ici serait faux).
    const btnAssets = root.querySelector('[data-role="run-subtabs"] .bd-subtab[data-pane="assets"]');
    if (btnAssets) btnAssets.textContent = 'Assets' + (occurrences.length ? ' (' + occurrences.length + ')' : '');
  }

  // ── Onglet Assets : quels assets, combien, sont passés par ce nœud ───────
  // Résolution du nom en direct depuis Iconik (proxy /api/iconik/:env/...,
  // même mécanisme que config-sources.js) quand le ctxSnapshot n'a que
  // l'id — cas fréquent pour une collection (ctx.collection ne porte que
  // {id}, jamais le titre). Résultat mis en cache par id, jamais refetché ;
  // un re-rendu (_rendre()) reflète le nom dès qu'il arrive, sans bloquer
  // l'affichage immédiat de l'id en attendant.
  const nomsResolus = {};        // id -> titre résolu, ou null si sans titre/échec
  const resolutionsEnCours = {}; // id -> true pendant la requête, évite les doublons

  function _resoudreNom(type, id) {
    if (!id || Object.prototype.hasOwnProperty.call(nomsResolus, id) || resolutionsEnCours[id]) return;
    const envSlug = root._envSlug;
    if (!envSlug) return;
    resolutionsEnCours[id] = true;
    // Le chemin d'une collection unique est sous /API/assets/v1/collections/
    // (pas /API/collections/v1/, qui 404 systématiquement — confirmé en
    // direct le 6 août : la recherche trouve bien la collection, mais ce
    // chemin-ci ne l'a jamais résolue depuis la construction de cette
    // fonction, "nulle part" comme rapporté, pas une régression du jour).
    const chemin = type === 'collection'
      ? '/API/assets/v1/collections/' + encodeURIComponent(id) + '/'
      : '/API/assets/v1/' + encodeURIComponent(id) + '/';
    fetch('/api/iconik/' + encodeURIComponent(envSlug) + chemin, { headers: { 'X-Force-Live': '1' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (obj) { nomsResolus[id] = (obj && (obj.title || obj.original_name)) || null; })
      .catch(function () { nomsResolus[id] = null; })
      .then(function () { delete resolutionsEnCours[id]; _rendre(); });
  }

  // nomBrut : déjà présent dans le ctxSnapshot (asset de recherche, etc.) —
  // utilisé tel quel, jamais re-résolu même s'il diffère du nom Iconik
  // actuel (le run affiché est un instantané passé, pas l'état live).
  function _nomOuResolution(nomBrut, id, type) {
    if (nomBrut) return nomBrut;
    if (!id) return null;
    if (Object.prototype.hasOwnProperty.call(nomsResolus, id)) return nomsResolus[id] || null;
    _resoudreNom(type, id);
    return null;
  }

  function _identiteDepuisEvenement(ev, loopInfo) {
    const snap = (ev && ev.ctxSnapshot) || {};
    const vars = snap.vars || {};
    if (loopInfo) {
      const base = loopInfo.loopVar;
      const nomBrut = vars[base + '.title'] || vars[base + '.original_name'] || vars[base + '.name'] || null;
      const id  = vars[base + '.id'] || null;
      const nom = _nomOuResolution(nomBrut, id, 'asset');
      if (nom || id) return { label: nom || id, id: nom ? id : null };
      return null;
    }
    const asset = snap.asset;
    if (asset && (asset.title || asset.id)) {
      const nom = _nomOuResolution(asset.title, asset.id, 'asset');
      return { label: nom || asset.id, id: nom ? asset.id : null, type: 'asset' };
    }
    const coll = snap.collection;
    if (coll && (coll.title || coll.id)) {
      const nom = _nomOuResolution(coll.title, coll.id, 'collection');
      return { label: nom || coll.id, id: nom ? coll.id : null, type: 'collection' };
    }
    return null;
  }

  function _rendreAssets(step, occurrences, loopInfo) {
    paneAssets.textContent = '';
    if (!occurrences.length) {
      paneAssets.appendChild(_vide('This node has not run yet in this run.'));
      return;
    }

    const rows = occurrences.map(function (occ) {
      const fin = occ.done || occ.error;
      const identite = _identiteDepuisEvenement(fin, loopInfo);
      const ok = !!(occ.done && occ.done.port !== null && !occ.error);
      return { identite: identite, ok: ok };
    });

    const avecIdentite = rows.filter(function (r) { return r.identite; });
    if (!avecIdentite.length) {
      const p = _vide(loopInfo
        ? 'No asset identity found on this node\'s iterations (check the loop item\'s title/id fields).'
        : (step && step.core === 'loop' ? 'This is the Loop node itself — open a node inside its body to see assets.' : 'This node is not scoped to a specific asset or collection.'));
      paneAssets.appendChild(p);
      return;
    }

    const titre = document.createElement('div');
    titre.className = 'rp-section-title';
    titre.textContent = avecIdentite.length + (loopInfo ? ' asset(s) passed through this node' : ' object(s) seen at this node');
    paneAssets.appendChild(titre);

    avecIdentite.forEach(function (r) {
      const row = document.createElement('div');
      row.className = 'rp-asset-row';
      const dot = document.createElement('span');
      dot.className = 'bd-dot';
      dot.setAttribute('data-state', r.ok ? 'ok' : 'err');
      const nom = document.createElement('span');
      nom.className = 'rp-asset-name';
      nom.textContent = r.identite.label;
      row.appendChild(dot);
      row.appendChild(nom);
      if (r.identite.id) {
        const id = document.createElement('span');
        id.className = 'rp-asset-id';
        id.textContent = r.identite.id;
        row.appendChild(id);
      }
      paneAssets.appendChild(row);
    });
  }

  // ── Onglet Action : ce que CE nœud a produit, strictement ────────────────
  const DECISION_OPS = {
    equals: 'equals', not_equals: 'is not', is_empty: 'is empty', not_empty: 'is not empty',
    contains: 'contains', not_contains: 'does not contain',
    starts_with: 'starts with', ends_with: 'ends with',
    gt: '>', gte: '>=', lt: '<', lte: '<=',
  };

  function _diffMap(before, after) {
    const b = before || {}; const a = after || {};
    return Object.keys(a)
      .filter(function (k) { return !(k in b) || JSON.stringify(b[k]) !== JSON.stringify(a[k]); })
      .map(function (k) { return { key: k, value: a[k] }; });
  }

  function _grouperOccurrences(evenements) {
    const occ = [];
    let courant = null;
    evenements.forEach(function (ev) {
      if (ev.type === 'step:start') { courant = { start: ev, error: null, done: null }; }
      else if (ev.type === 'step:error') { if (courant) courant.error = ev; }
      else if (ev.type === 'step:done') { if (courant) { courant.done = ev; occ.push(courant); courant = null; } }
    });
    if (courant) occ.push(courant); // resté ouvert (run encore en cours sur ce step)
    return occ;
  }

  function _kv(cle, val) {
    const row = document.createElement('div');
    row.className = 'rp-kv';
    const k = document.createElement('span');
    k.className = 'rp-kv-key';
    k.textContent = cle;
    const v = document.createElement('span');
    v.className = 'rp-kv-val';
    v.textContent = typeof val === 'string' ? val.slice(0, 300) : JSON.stringify(val);
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  function _rendreAction(step, occurrences, loopInfo) {
    paneAction.textContent = '';
    if (!occurrences.length) {
      paneAction.appendChild(_vide('This node has not run yet in this run.'));
      return;
    }

    occurrences.forEach(function (occ, i) {
      const fin = occ.done || occ.error;
      const wrap = document.createElement('div');
      wrap.className = 'rp-occurrence';

      const hd = document.createElement('div');
      hd.className = 'rp-occurrence-hd';
      if (loopInfo && fin && fin.ctxSnapshot) {
        const idx = fin.ctxSnapshot.vars && fin.ctxSnapshot.vars[loopInfo.loopVar + '_index'];
        const label = fin.ctxSnapshot.vars && (fin.ctxSnapshot.vars[loopInfo.loopVar + '.title'] || fin.ctxSnapshot.vars[loopInfo.loopVar + '.id']);
        hd.textContent = 'Iteration ' + (idx != null ? (Number(idx) + 1) : (i + 1)) + (label ? ' — ' + label : '');
      } else if (occurrences.length > 1) {
        hd.textContent = 'Pass ' + (i + 1);
      }
      if (hd.textContent) wrap.appendChild(hd);

      const port = document.createElement('span');
      port.className = 'rp-port';
      if (occ.done) {
        port.setAttribute('data-ok', occ.done.port !== null && !occ.error ? '1' : '0');
        port.textContent = occ.done.port !== null ? '→ ' + occ.done.port : '→ (stopped)';
      } else if (occ.error) {
        port.setAttribute('data-ok', '0');
        port.textContent = '⚠ ' + (occ.error.message || 'error');
      } else {
        port.textContent = '… running';
      }
      wrap.appendChild(port);

      // Enrichissement dédié Decision — cheap et à forte valeur pour un core
      // qui ne PRODUIT rien dans vars/results (il ne fait que router).
      if (step && step.core === 'decision' && step.params && fin && fin.ctxSnapshot) {
        const field = step.params.field;
        const val = fin.ctxSnapshot.vars ? fin.ctxSnapshot.vars[field] : undefined;
        const cond = (step.params.conditions || []).find(function (c) { return c.label === (occ.done && occ.done.port); });
        const section = document.createElement('div');
        section.className = 'rp-section';
        section.appendChild(_kv(field, val !== undefined ? val : '(unresolved)'));
        if (cond) section.appendChild(_kv('Condition', (DECISION_OPS[cond.op] || cond.op) + (cond.value ? ' ' + cond.value : '')));
        wrap.appendChild(section);
      }

      // Diff générique start → done/error : ce que CE nœud a réellement
      // écrit dans vars/results pendant son exécution, quel que soit son
      // core — pas de connaissance par famille nécessaire.
      const avant = occ.start && occ.start.ctxSnapshot;
      const apres = fin && fin.ctxSnapshot;
      if (avant && apres) {
        const varsChanges = _diffMap(avant.vars, apres.vars).filter(function (d) {
          // Exclut le bookkeeping propre à CE nœud s'il est lui-même une
          // boucle (item/.../_index/_errors) — ce n'est pas "ce que le nœud
          // a produit pour l'appelant", c'est sa mécanique interne.
          if (step && step.core === 'loop') {
            const lv = (step.params && step.params.loopVar) || 'item';
            return d.key !== lv + '_errors' && d.key !== lv + '_error_count';
          }
          return true;
        });
        const resultsChanges = _diffMap(avant.results, apres.results);
        if (varsChanges.length || resultsChanges.length) {
          const section = document.createElement('div');
          section.className = 'rp-section';
          resultsChanges.forEach(function (d) { section.appendChild(_kv(d.key, d.value)); });
          varsChanges.forEach(function (d) { section.appendChild(_kv(d.key, d.value)); });
          wrap.appendChild(section);
        }
      }

      paneAction.appendChild(wrap);
    });
  }

  function _vide(texte) {
    const p = document.createElement('p');
    p.className = 'rp-empty';
    p.textContent = texte;
    return p;
  }

  // ── Onglet Debug : brut, verbeux, toutes les occurrences (start compris) ─
  const ETAT_DOT = { running: '', success: 'ok', error: 'err', blocked: 'warn', idle: '' };

  function _ligneEvenement(ev) {
    const ligne = document.createElement('div');
    ligne.className = 'lg-event';

    const dot = document.createElement('span');
    dot.className = 'bd-dot lg-dot';
    dot.setAttribute('data-state', ETAT_DOT[ev.type === 'step:error' ? (ev.severity === 'fatal' ? 'blocked' : 'error') : (ev.type === 'step:done' ? (ev.port === null ? 'error' : 'success') : 'running')] || '');

    const corps = document.createElement('div');
    corps.className = 'lg-body';

    const ligneHd = document.createElement('div');
    ligneHd.className = 'lg-ligne';
    const type = document.createElement('span');
    type.className = 'lg-type';
    type.textContent = ev.type + (ev.port !== undefined && ev.port !== null ? ' → ' + ev.port : '');
    ligneHd.appendChild(type);
    const at = document.createElement('span');
    at.className = 'lg-at';
    at.textContent = _formaterHeure(ev.at);
    ligneHd.appendChild(at);
    corps.appendChild(ligneHd);

    if (ev.message) {
      const msg = document.createElement('div');
      msg.className = 'lg-msg';
      if (ev.severity) msg.setAttribute('data-severity', ev.severity);
      msg.textContent = ev.message;
      corps.appendChild(msg);
    }

    if (ev.ctxSnapshot) {
      const det = document.createElement('details');
      det.className = 'lg-snapshot';
      const sum = document.createElement('summary');
      sum.textContent = 'Context snapshot';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(ev.ctxSnapshot, null, 2);
      det.appendChild(sum);
      det.appendChild(pre);
      corps.appendChild(det);
    }

    ligne.appendChild(dot);
    ligne.appendChild(corps);
    return ligne;
  }

  function _rendreDebug(step, evenements) {
    paneDebug.textContent = '';
    if (!evenements.length) {
      paneDebug.appendChild(_vide('No recorded event for this node in this run.'));
      return;
    }
    evenements.forEach(function (ev) { paneDebug.appendChild(_ligneEvenement(ev)); });
  }

  // ── Câblage ───────────────────────────────────────────────────────────────
  root.addEventListener('aps:run-tick', function (e) {
    const d = e.detail;
    runActuel = d.run;
    documentActuel = d.document;
    eventsActuel = d.allEvents || [];
    _rendre();
  });

  root.addEventListener('aps:node-clicked', function (e) {
    stepIdSelectionne = e.detail.stepId;
    _rendre();
  });

  // `aps:flow-ready` se redéclenche après CHAQUE sauvegarde (y compris
  // l'auto-save silencieux sur toute édition) pour le MÊME flow, pas
  // seulement à l'ouverture d'un flow différent — ne réinitialiser que sur
  // un vrai changement de flowId, sinon le nœud inspecté disparaît dès la
  // prochaine édition (même bug corrigé côté jobs-logs-panel.js).
  root.addEventListener('aps:flow-ready', function (e) {
    const change = e.detail.flowId !== flowId;
    flowId = e.detail.flowId;
    if (!change) return;
    runActuel = null; documentActuel = null; eventsActuel = []; stepIdSelectionne = null;
    _rendre();
  });

  _rendre();

})();
