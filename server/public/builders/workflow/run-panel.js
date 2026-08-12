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

  // ══ Résumé lisible ════════════════════════════════════════════════════════
  // Traduit ce que le nœud A FAIT en langage d'opérateur. Choix assumé
  // (demande utilisateur du 2026-08-06, alignée sur l'ancien panneau WFD
  // wfd-run-panel.js:480-720 qui procédait déjà par famille) : le diff
  // générique vars/results construit le 6 août ne suffit pas — il montre une
  // charge utile brute là où il faut lire « BayardID n'est pas vide → sortie
  // Par défaut ». Le brut n'est pas supprimé pour autant : il passe dans un
  // dépliant « Détail technique », consultable mais jamais imposé.

  const OPS_FR = {
    equals: 'est égal à', not_equals: 'est différent de',
    is_empty: 'est vide', not_empty: "n'est pas vide",
    contains: 'contient', not_contains: 'ne contient pas',
    starts_with: 'commence par', ends_with: 'se termine par',
    not_starts_with: 'ne commence pas par', not_ends_with: 'ne se termine pas par',
    matches_regex: 'correspond au motif', not_matches_regex: 'ne correspond pas au motif',
    gt: 'est supérieur à', gte: 'est supérieur ou égal à',
    lt: 'est inférieur à', lte: 'est inférieur ou égal à',
    in_list: 'est dans la liste', not_in_list: "n'est pas dans la liste",
    present: 'est renseigné', absent: 'est absent',
  };

  const ORIGINE_FR = {
    'champ': 'via le champ source', 'métadonnée': 'via une métadonnée',
    'variable': 'via une variable', 'repli': 'via le repli', 'expression': 'via une expression',
  };

  function _titre(txt) {
    const el = document.createElement('div');
    el.className = 'rp-section-title';
    el.textContent = txt;
    return el;
  }

  // Ligne « gauche → droite » avec un état visuel (ok / ko / neutre).
  function _ligne(gauche, droite, etat) {
    const row = document.createElement('div');
    row.className = 'rp-ligne';
    if (etat) row.setAttribute('data-etat', etat);
    const g = document.createElement('span');
    g.className = 'rp-ligne-g';
    g.textContent = gauche;
    const d = document.createElement('span');
    d.className = 'rp-ligne-d';
    d.textContent = droite;
    row.appendChild(g);
    row.appendChild(d);
    return row;
  }

  function _section() {
    const s = document.createElement('div');
    s.className = 'rp-section';
    return s;
  }

  // ── Decision ──────────────────────────────────────────────────────────────
  function _resumeDecision(step, snap) {
    const d = snap.results && snap.results._decision;
    if (!d) return null;
    const sec = _section();
    const champ = d.field || '';
    const valeur = (d.actual === null || d.actual === undefined || d.actual === '')
      ? '(vide)' : String(d.actual);
    sec.appendChild(_ligne(champ, valeur, null));

    // Chaque condition avec son verdict réel. Le moteur renvoie la PREMIÈRE
    // qui correspond (builder-handler-decision.js) : celles d'avant ont donc
    // été évaluées et refusées, celles d'après n'ont jamais été testées —
    // distinction affichée telle quelle plutôt que devinée.
    const conditions = (step.params && step.params.conditions) || [];
    const iMatch = conditions.findIndex(function (c) { return c.label === d.matchedLabel; });
    conditions.forEach(function (c, i) {
      const libelle = (OPS_FR[c.op] || c.op) + (c.value ? ' « ' + c.value + ' »' : '');
      let etat, suffixe;
      if (i === iMatch) { etat = 'ok'; suffixe = 'oui'; }
      else if (iMatch === -1 || i < iMatch) { etat = 'ko'; suffixe = 'non'; }
      else { etat = null; suffixe = 'non évaluée'; }
      sec.appendChild(_ligne('« ' + champ + ' » ' + libelle + ' ?', suffixe, etat));
    });

    sec.appendChild(_ligne('Sortie empruntée',
      '→ ' + d.matchedLabel + (d.matchedOp === 'default' ? ' (aucune condition remplie)' : ''),
      d.matchedOp === 'default' ? null : 'ok'));
    return sec;
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  function _resumeLookup(step, snap) {
    const trace = snap.results && snap.results['_lk_trace_' + step.id];
    if (!Array.isArray(trace) || !trace.length) return null;
    const ok = trace.filter(function (t) { return t.statut === 'ok'; });
    const sec = _section();
    sec.appendChild(_titre(ok.length + ' correspondance(s) sur ' + trace.length + ' règle(s)'));

    trace.forEach(function (t) {
      const fleche = t.de + ' → ' + t.vers;
      if (t.statut === 'ok') {
        // Valeur RÉSOLUE, jamais le nom de la variable — le point même de
        // cette vue (« quand la correspondance est faite via une variable,
        // je veux le contenu de la variable affiché »).
        let droite = t.valeurFinale === null ? '(vide)' : String(t.valeurFinale);
        if (t.traduction && t.traduction.vers !== null) {
          droite = t.traduction.de + ' → ' + t.traduction.vers;
        }
        const row = _ligne(fleche, droite, 'ok');
        const marques = [];
        // `héritage` n'est pas listé ici : la marque détaillée juste en
        // dessous dit de QUEL niveau, ce qui vaut mieux que « héritée » tout
        // court.
        if (t.origine && t.origine !== 'champ' && t.origine !== 'héritage') marques.push(ORIGINE_FR[t.origine] || t.origine);
        if (t.traduction && t.traduction.vers === null) marques.push('hors table de correspondance');
        // D'OÙ la valeur a été empruntée, et sous quelle politique. Un
        // `signalee` hérité est marqué ⚠ : la valeur est livrée, mais elle
        // décrit un autre niveau que celui-ci. Une `fusion` dit ce que chaque
        // ancêtre a apporté — sans quoi « 5 personnes » ne se distingue pas de
        // « 5 personnes dont 3 venues de la série ».
        if (t.heritage && t.heritage.politique === 'fusion') {
          (t.heritage.apports || []).forEach(function (a) {
            marques.push('+ ' + a.valeurs.length + ' de « ' + (a.titre || a.niveau) + ' »');
          });
        } else if (t.heritage && t.heritage.depuis) {
          marques.push((t.heritage.signale ? '⚠ ' : '') + 'héritée de ' + t.heritage.depuis +
            (t.heritage.titre ? ' « ' + t.heritage.titre + ' »' : ''));
        }
        if (marques.length) {
          const note = document.createElement('span');
          note.className = 'rp-ligne-note';
          note.textContent = marques.join(' · ');
          row.querySelector('.rp-ligne-g').appendChild(note);
        }
        sec.appendChild(row);
      } else {
        sec.appendChild(_ligne(fleche, t.motif || 'non renseigné', 'ko'));
      }
    });
    return sec;
  }

  // ── Deliver (listing S3) ──────────────────────────────────────────────────
  function _resumeDeliver(step, snap, occ) {
    const rv = (step.params && step.params.resultVar) || 'awsResult';
    const res = snap.results && snap.results[rv];
    if (!res) return null;
    const sec = _section();
    if (res.prefix !== undefined) sec.appendChild(_ligne('Préfixe S3', String(res.prefix), null));
    else if (res.key !== undefined) sec.appendChild(_ligne('Clé S3', String(res.key), null));
    if (res.count !== undefined) {
      sec.appendChild(_ligne('Objets trouvés', String(res.count), res.count > 0 ? 'ok' : 'ko'));
      (res.keys || []).forEach(function (k) { sec.appendChild(_ligne('', k, 'ok')); });
    }
    (res.cardinaliteErreurs || []).forEach(function (c) {
      sec.appendChild(_ligne('Cardinalité', c, 'ko'));
    });
    const port = occ.done && occ.done.port;
    if (port === 'miss') sec.appendChild(_ligne('Conclusion', 'pas (encore) livré → déclenche la suite', null));
    if (port === 'out')  sec.appendChild(_ligne('Conclusion', 'déjà livré', 'ok'));
    return sec;
  }

  // ── Verify (contrôle partenaire) ──────────────────────────────────────────
  function _resumeVerify(step, snap) {
    const cr = snap.results && snap.results.checkerResult;
    if (!cr) return null;
    const sec = _section();
    sec.appendChild(_titre(cr.passed + ' contrôle(s) réussi(s) sur ' + cr.total));
    const echecs = {};
    (cr.failures || []).forEach(function (f) { echecs[f.label] = f; });
    (cr.failures || []).forEach(function (f) {
      sec.appendChild(_ligne(f.label, f.error || ('attendu non vide, reçu « ' + (f.actual || '') + ' »'), 'ko'));
    });
    if (!(cr.failures || []).length) {
      sec.appendChild(_ligne('Résultat', 'le partenaire confirme tous les contrôles', 'ok'));
    }
    return sec;
  }

  // ── History (ligne de notification) ───────────────────────────────────────
  function _resumeHistory(step, snap) {
    const h = snap.results && snap.results._workflow_history;
    if (!h) return null;
    const sec = _section();
    sec.appendChild(_ligne('Champ Iconik', h.field || '', null));
    sec.appendChild(_ligne('Mode', h.mode === 'update' ? 'remplace la ligne de ce run' : 'ajoute une ligne', null));
    sec.appendChild(_ligne('Ligne écrite', h.line || '', 'ok'));
    return sec;
  }

  // ── HTTP (request / sequence) ─────────────────────────────────────────────
  function _resumeHttp(step, snap, avant) {
    const sec = _section();
    let vu = false;
    const cles = Object.keys((snap.results) || {});
    cles.forEach(function (k) {
      if (k.indexOf('_') === 0) return;
      const v = snap.results[k];
      if (!v || typeof v !== 'object') return;
      const avantV = avant && avant.results && avant.results[k];
      if (avantV !== undefined && JSON.stringify(avantV) === JSON.stringify(v)) return;
      if (v.status !== undefined) {
        vu = true;
        sec.appendChild(_ligne(String(v.method || 'HTTP') + ' ' + (v.url || k),
          String(v.status), v.ok === false ? 'ko' : 'ok'));
        if (v.postOrigine) {
          sec.appendChild(_ligne('Refus initial (POST ' + v.postOrigine.status + ')',
            _motifHttp(v.postOrigine.body), 'ko'));
        }
        if (v.ok === false) sec.appendChild(_ligne('Motif', _motifHttp(v.body), 'ko'));
      } else if (v.objects !== undefined) {
        vu = true;
        sec.appendChild(_ligne('Résultats trouvés (' + k + ')',
          String(v.total !== undefined ? v.total : v.objects.length),
          (v.objects || []).length ? 'ok' : 'ko'));
      }
    });
    return vu ? sec : null;
  }

  // Extrait la NATURE d'une erreur HTTP plutôt que son enveloppe : une API
  // renvoie typiquement {errors:{champ:["motif"]}} — c'est le motif qui
  // renseigne, pas le message générique ("The given data was invalid.").
  function _motifHttp(body) {
    if (body === null || body === undefined) return '(aucun corps de réponse)';
    if (typeof body !== 'object') return String(body).slice(0, 300);
    const parts = [];
    const errs = body.errors;
    if (errs && typeof errs === 'object' && !Array.isArray(errs)) {
      Object.keys(errs).forEach(function (champ) {
        const motifs = Array.isArray(errs[champ]) ? errs[champ].join(', ') : String(errs[champ]);
        parts.push(champ + ' : ' + motifs);
      });
    } else if (Array.isArray(errs) && errs.length) {
      parts.push(errs.map(String).join(', '));
    }
    if (!parts.length && body.message) parts.push(String(body.message));
    if (!parts.length && body.error) parts.push(String(body.error));
    return parts.length ? parts.join(' | ') : JSON.stringify(body).slice(0, 300);
  }

  // ── Séquence HTTP (Partner) ───────────────────────────────────────────────
  // Une séquence est une boîte noire vue de l'extérieur : un seul port pour
  // N appels. On déplie donc chaque sous-étape — endpoint appelé, ce qui a
  // été ENVOYÉ (valeurs résolues, pas le gabarit), et son issue.
  function _resumeSequence(step, snap) {
    const trace = snap.results && snap.results['_seq_trace_' + step.id];
    if (!Array.isArray(trace) || !trace.length) return null;
    const sec = _section();
    const faites = trace.filter(function (t) { return t.statut === 'ok'; }).length;
    sec.appendChild(_titre(faites + ' étape(s) réussie(s) sur ' + trace.length));

    trace.forEach(function (t) {
      const gauche = t.rang + '. ' + t.nom;
      const cible = t.methode + ' ' + t.endpoint;

      const droite = t.statut === 'ignore'
        ? (t.motif || 'ignorée')
        : (t.httpStatut !== undefined
            ? 'HTTP ' + t.httpStatut + (t.upsert ? ' (upsert)' : '')
            : (t.motif || (t.statut === 'ok' ? 'OK' : 'échec')));
      // Neutre — et non vert — quand l'étape n'a rien eu à faire : « ignorée »
      // ou « aucune valeur à envoyer » n'est pas une réussite, seulement une
      // absence d'échec.
      const etat = (t.statut === 'ignore' || (t.statut === 'ok' && t.motif && !(t.valeurs || []).length))
        ? null : (t.statut === 'ok' ? 'ok' : 'ko');
      const row = _ligne(gauche, droite, etat);
      const note = document.createElement('span');
      note.className = 'rp-ligne-note';
      note.textContent = cible;
      row.querySelector('.rp-ligne-g').appendChild(note);
      sec.appendChild(row);
      if (t.statut === 'ignore') return;

      // Le refus d'origine masqué derrière un upsert retombé en 404 — la
      // cause, pas la conséquence (cf. builder-handler-http-request.js).
      if (t.postOrigine) {
        sec.appendChild(_ligne('   ↳ refus initial (POST ' + t.postOrigine.status + ')',
          _motifHttp(t.postOrigine.body), 'ko'));
      } else if (t.statut === 'echec' && t.reponse !== undefined && t.reponse !== null) {
        sec.appendChild(_ligne('   ↳ motif', _motifHttp(t.reponse), 'ko'));
      }

      // Valeurs envoyées : c'est la question « qu'a-t-on demandé au
      // partenaire ? », jusqu'ici sans réponse dans l'interface.
      if (t.envoye !== undefined && t.envoye !== null) {
        _aplatirEnvoi(t.envoye, '').forEach(function (e) {
          sec.appendChild(_ligne('   ' + e.cle, e.valeur, 'ok'));
        });
      }
      (t.valeurs || []).forEach(function (v) {
        sec.appendChild(_ligne('   ' + String(v.valeur),
          (v.externalId ? v.externalId + ' · ' : '') + 'HTTP ' + v.statut, 'ok'));
      });
      (t.echecs || []).forEach(function (e) {
        sec.appendChild(_ligne('   ' + String(e.val), 'HTTP ' + e.status + ' — ' + e.error, 'ko'));
      });
    });
    return sec;
  }

  // Aplatit un corps JSON en lignes « a.b.c = valeur » — un bloc JSON brut
  // serait exactement ce qu'on cherche à ne plus imposer.
  function _aplatirEnvoi(v, prefixe) {
    const out = [];
    if (v === null || v === undefined) return out;
    if (typeof v !== 'object') { out.push({ cle: prefixe || 'corps', valeur: String(v) }); return out; }
    Object.keys(v).forEach(function (k) {
      const val = v[k];
      const cle = prefixe ? prefixe + '.' + k : k;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        _aplatirEnvoi(val, cle).forEach(function (x) { out.push(x); });
      } else if (Array.isArray(val)) {
        out.push({ cle: cle, valeur: val.length + ' élément(s)' });
      } else {
        out.push({ cle: cle, valeur: String(val) });
      }
    });
    return out.slice(0, 40);
  }

  // ── Wait ──────────────────────────────────────────────────────────────────
  function _resumeWait(step, snap) {
    const rv = (step.params && step.params.resultVar) || 'waitResults';
    const w = snap.results && snap.results[rv];
    if (!w) return null;
    const sec = _section();
    Object.keys(w).forEach(function (k) {
      const v = w[k];
      sec.appendChild(_ligne(k, typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v), null));
    });
    return sec;
  }

  // ── Set Variable ──────────────────────────────────────────────────────────
  function _resumeSetVariable(step, snap, ecrits) {
    const sec = _section();
    const assignations = (step.params && step.params.assignments) || [];
    assignations.forEach(function (a) {
      const cle = a.key || a.name || a.var || '';
      if (!cle) return;
      const valeur = snap.vars ? snap.vars[cle] : undefined;
      // Le gabarit à gauche, sa valeur RÉSOLUE à droite — l'intérêt est
      // justement de voir ce que « {x}/{y} » a donné une fois évalué.
      const gabarit = a.value !== undefined ? String(a.value) : '';
      sec.appendChild(_ligne(cle + (gabarit && gabarit !== String(valeur) ? '  ⟵ ' + gabarit : ''),
        valeur === undefined ? '(non défini)' : String(valeur),
        valeur === undefined ? 'ko' : 'ok'));
    });
    return assignations.length ? sec : _resumeEcritures(ecrits);
  }

  // ── Recherche Iconik ──────────────────────────────────────────────────────
  function _resumeRecherche(step, snap) {
    const rv = (step.params && step.params.resultVar) || 'search_results';
    const res = snap.results && snap.results[rv];
    if (!res) return null;
    const sec = _section();
    const objets = res.objects || [];
    sec.appendChild(_ligne('Résultats trouvés', String(res.total !== undefined ? res.total : objets.length),
      objets.length ? 'ok' : 'ko'));
    objets.slice(0, 10).forEach(function (o) {
      sec.appendChild(_ligne('', (o.title || o.original_name || o.id || ''), 'ok'));
    });
    if (objets.length > 10) sec.appendChild(_ligne('', '… et ' + (objets.length - 10) + ' autre(s)', null));
    return sec;
  }

  // ── Écriture de métadonnées Iconik ────────────────────────────────────────
  function _resumeSetMetadata(step, snap) {
    const champs = (step.params && step.params.fields) || [];
    if (!champs.length) return null;
    const sec = _section();
    sec.appendChild(_titre('Champs écrits sur ' + ((step.params.target === 'collection') ? 'la collection' : "l'asset")));
    champs.forEach(function (f) {
      if (!f.key) return;
      const rendu = _valeurEcrite(f.value, snap);
      sec.appendChild(_ligne(f.key, rendu.texte, rendu.etat));
    });
    return sec;
  }

  // ── Action Iconik (export, transcode, création…) ──────────────────────────
  function _resumeAction(step, snap, ecrits) {
    const sec = _section();
    const type = (step.params && step.params.actionType) || '';
    if (type) sec.appendChild(_ligne('Action', type, null));
    const res = snap.results && snap.results['_action_' + step.id];
    if (res && typeof res === 'object') {
      if (res.job_id) sec.appendChild(_ligne('Job Iconik déclenché', String(res.job_id), 'ok'));
      if (res.id && !res.job_id) sec.appendChild(_ligne('Objet', String(res.id), 'ok'));
      if (res.status) sec.appendChild(_ligne('Statut', String(res.status), null));
    }
    ecrits.forEach(function (d) { sec.appendChild(_ligne(d.key, String(d.value), 'ok')); });
    return sec.childNodes.length ? sec : null;
  }

  // ── Résolution des collections parentes ───────────────────────────────────
  function _resumeAncetres(step, snap) {
    const nom = (step.params && step.params.varName) || 'ancestorPath';
    const val = snap.vars && snap.vars[nom];
    if (val === undefined) return null;
    const sec = _section();
    sec.appendChild(_ligne('Niveau', String((snap.vars && snap.vars.TypeCollection) || '—'), null));
    sec.appendChild(_ligne('Chemin reconstruit', String(val), 'ok'));
    return sec;
  }

  // ── Générateur d'identifiant ──────────────────────────────────────────────
  function _resumeIdGenerator(step, snap) {
    const g = snap.results && snap.results._id_generator;
    if (!g) return null;
    const sec = _section();
    if (g.type) sec.appendChild(_ligne('Type', String(g.type), null));
    sec.appendChild(_ligne('Identifiant généré', String(g.id), 'ok'));
    if (g.varName) sec.appendChild(_ligne('Écrit dans', '{' + g.varName + '}', null));
    return sec;
  }

  // ── Fetch Iconik ──────────────────────────────────────────────────────────
  function _resumeFetch(step, snap, ecrits) {
    const sec = _section();
    const p = step.params || {};
    if (p.fetchSubType) sec.appendChild(_ligne('Type', String(p.fetchSubType), null));
    const cible = p.fetchValue !== undefined ? r_resolu(String(p.fetchValue), snap) : null;
    if (cible) sec.appendChild(_ligne('Objet demandé', cible, null));
    const rv = p.fetchVar || p.storeAs;
    const res = rv && snap.results ? snap.results[rv] : null;
    if (res && typeof res === 'object') {
      const titre = res.title || res.original_name || res.name;
      if (titre) sec.appendChild(_ligne('Récupéré', String(titre), 'ok'));
    }
    ecrits.slice(0, 12).forEach(function (d) { sec.appendChild(_ligne(d.key, String(d.value), 'ok')); });
    return sec.childNodes.length ? sec : null;
  }

  // ── Transform ─────────────────────────────────────────────────────────────
  function _resumeTransform(step, snap, ecrits) {
    const p = step.params || {};
    const sec = _section();
    if (p.operation) sec.appendChild(_ligne('Opération', String(p.operation), null));
    if (p.source) sec.appendChild(_ligne('Entrée', r_resolu(String(p.source), snap) || String(p.source), null));
    ecrits.forEach(function (d) { sec.appendChild(_ligne(d.key, String(d.value), 'ok')); });
    return sec.childNodes.length ? sec : null;
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function _resumeLoop(step, snap) {
    const p = step.params || {};
    const lv = p.loopVar || 'item';
    const sec = _section();
    if (p.loopVariablePath) {
      // Le chemin ET le nombre réel d'éléments : « {assetsAExporter.objects} »
      // seul ne dit pas si la boucle a tourné 0 ou 40 fois.
      const chemin = String(p.loopVariablePath).replace(/^\{|\}$/g, '');
      const src = _lireChemin(snap.results, chemin) || _lireChemin(snap.vars, chemin);
      const n = Array.isArray(src) ? src.length : null;
      sec.appendChild(_ligne('Source parcourue',
        chemin + (n !== null ? ' — ' + n + ' élément(s)' : ''), n ? 'ok' : null));
    }
    const idx = snap.vars && snap.vars[lv + '_index'];
    if (idx !== undefined) sec.appendChild(_ligne('Itérations', String(Number(idx) + 1), 'ok'));
    const nbErr = snap.vars && snap.vars[lv + '_error_count'];
    if (nbErr !== undefined) {
      sec.appendChild(_ligne('Itérations en échec', String(nbErr), Number(nbErr) > 0 ? 'ko' : 'ok'));
    }
    // Les échecs individuels sous onError:'continue' ne sont visibles NULLE
    // PART ailleurs sur ce nœud (le badge ne reflète que la dernière
    // itération) — c'est ici qu'il faut les lire.
    let details = snap.vars && snap.vars[lv + '_errors'];
    if (typeof details === 'string') { try { details = JSON.parse(details); } catch (_) { details = null; } }
    (Array.isArray(details) ? details : []).slice(0, 10).forEach(function (e) {
      sec.appendChild(_ligne('Itération ' + ((e.index !== undefined ? e.index + 1 : '?')), String(e.message || ''), 'ko'));
    });
    return sec.childNodes.length ? sec : null;
  }

  // ── Trigger ───────────────────────────────────────────────────────────────
  function _resumeTrigger(step, snap) {
    const sec = _section();
    const c = snap.collection, a = snap.asset;
    // Nom résolu en direct depuis Iconik quand le contexte ne porte que l'id
    // (cas normal : ctx.collection = {id}) — même mécanisme que l'onglet
    // Assets, pour ne jamais afficher un identifiant brut à un opérateur.
    if (c && c.id) {
      sec.appendChild(_ligne('Collection déclenchante',
        _nomOuResolution(c.title, c.id, 'collection') || String(c.id), 'ok'));
    }
    if (a && a.id) {
      sec.appendChild(_ligne('Asset déclenchant',
        _nomOuResolution(a.title, a.id, 'asset') || String(a.id), 'ok'));
    }
    const u = snap.user && (snap.user.name || snap.user.email || snap.user.id);
    if (u) sec.appendChild(_ligne('Déclenché par', String(u), null));
    return sec.childNodes.length ? sec : null;
  }

  // Rend la valeur RÉELLEMENT écrite par un gabarit de champ, et qualifie
  // honnêtement les trois cas distincts — les confondre induit en erreur :
  //  - variable connue du contexte      → sa valeur (vert) ;
  //  - fonction évaluée à l'exécution   → `{now}`, `{slug(x)}`… : la valeur
  //    n'est PAS récupérable depuis le snapshot, mais elle a bien été
  //    calculée ; l'afficher en rouge « non résolu » serait un faux
  //    négatif (constaté sur DatedePublication = {now}) ;
  //  - variable absente du contexte     → vraiment non résolu (rouge).
  const FONCTIONS_GABARIT = /^\{(now|slug|upper|lower|trim|add|pad|filebase)\b/;
  function _valeurEcrite(gabarit, snap) {
    const brut = String(gabarit === undefined || gabarit === null ? '' : gabarit).trim();
    const m = brut.match(/^\{([^}]+)\}$/);
    if (!m) return { texte: brut, etat: 'ok' };            // littéral
    if (snap.vars && snap.vars[m[1]] !== undefined) {
      return { texte: String(snap.vars[m[1]]), etat: 'ok' };
    }
    if (FONCTIONS_GABARIT.test(brut) || brut.indexOf('(') !== -1) {
      return { texte: brut + ' — calculé à l’exécution', etat: null };
    }
    return { texte: brut + ' (non résolu)', etat: 'ko' };
  }

  // Lit un chemin pointé (« a.b.c ») dans un objet du snapshot.
  function _lireChemin(racine, chemin) {
    if (!racine || !chemin) return undefined;
    return String(chemin).split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, racine);
  }

  // Résout « {x} » depuis le contexte capturé, sinon rend le gabarit tel quel.
  function r_resolu(gabarit, snap) {
    const m = String(gabarit || '').trim().match(/^\{([^}]+)\}$/);
    if (m && snap.vars && snap.vars[m[1]] !== undefined) return String(snap.vars[m[1]]);
    return String(gabarit || '');
  }

  // ── Repli universel : « ce que ce nœud a écrit » ──────────────────────────
  // Aucun nœud ne doit rester muet : à défaut d'un résumé spécialisé, on
  // rend le diff en clair (clé = valeur lisible) plutôt que rien. C'est la
  // différence entre « famille non prévue » et « rien à dire ».
  function _resumeEcritures(ecrits) {
    if (!ecrits.length) return null;
    const sec = _section();
    sec.appendChild(_titre(ecrits.length + ' valeur(s) écrite(s)'));
    ecrits.slice(0, 25).forEach(function (d) {
      sec.appendChild(_ligne(d.key, String(d.value), 'ok'));
    });
    if (ecrits.length > 25) sec.appendChild(_ligne('', '… et ' + (ecrits.length - 25) + ' autre(s)', null));
    return sec;
  }

  function _resume(step, occ) {
    if (!step) return null;
    const fin = occ.done || occ.error;
    const snap = fin && fin.ctxSnapshot;
    if (!snap) return null;
    const avant = occ.start && occ.start.ctxSnapshot;

    // Ce que CE passage a écrit dans les variables — matière première du
    // repli universel, et complément de plusieurs résumés spécialisés.
    let ecrits = [];
    if (avant) {
      ecrits = _diffMap(avant.vars, snap.vars).filter(function (d) {
        if (String(d.key).indexOf('_') === 0) return false;      // interne au moteur
        if (step.core === 'loop') {
          const lv = (step.params && step.params.loopVar) || 'item';
          return d.key !== lv + '_errors' && d.key !== lv + '_error_count';
        }
        return true;
      });
    }

    try {
      // Dispatch par FAÇADE d'abord : le core `http_request` héberge des
      // façades très différentes (recherche, écriture de métadonnées,
      // action, résolution d'ancêtres) qu'un seul résumé ne peut pas servir.
      switch (step.facade) {
        case 'iconik.search':            return _resumeRecherche(step, snap);
        case 'iconik.set_metadata':      return _resumeSetMetadata(step, snap) || _resumeEcritures(ecrits);
        case 'iconik.action':            return _resumeAction(step, snap, ecrits);
        case 'iconik.resolve_ancestors': return _resumeAncetres(step, snap) || _resumeEcritures(ecrits);
        case 'iconik.fetch':             return _resumeFetch(step, snap, ecrits);
        case 'aps.registry':             return _resumeIdGenerator(step, snap) || _resumeEcritures(ecrits);
        case 'iconik.trigger':           return _resumeTrigger(step, snap) || _resumeEcritures(ecrits);
      }
      switch (step.core) {
        case 'decision':      return _resumeDecision(step, snap);
        case 'lookup':        return _resumeLookup(step, snap);
        case 'deliver':       return _resumeDeliver(step, snap, occ);
        case 'verify':        return _resumeVerify(step, snap);
        case 'history':       return _resumeHistory(step, snap);
        case 'wait':          return _resumeWait(step, snap);
        case 'set_variable':  return _resumeSetVariable(step, snap, ecrits);
        case 'loop':          return _resumeLoop(step, snap) || _resumeEcritures(ecrits);
        case 'transform':     return _resumeTransform(step, snap, ecrits);
        case 'trigger':       return _resumeTrigger(step, snap) || _resumeEcritures(ecrits);
        case 'http_sequence': return _resumeSequence(step, snap) || _resumeHttp(step, snap, avant) || _resumeEcritures(ecrits);
        case 'http_request':  return _resumeHttp(step, snap, avant) || _resumeEcritures(ecrits);
        default:              return _resumeEcritures(ecrits);
      }
    } catch (_) {
      // Un résumé ne doit JAMAIS casser le panneau : à défaut, le dépliant
      // « Détail technique » reste disponible et porte la même information.
      return null;
    }
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

      // Avertissements non fatals (BuilderContext.addError) : le moteur
      // n'émet AUCUN événement step:error pour eux (builder-executor.js:84
      // ne le fait que sur une exception levée) — ils ne vivent que dans
      // ctx.errors, donc ils n'apparaissaient nulle part en clair, seulement
      // enfouis dans le JSON du "Context snapshot". C'est pourtant là que se
      // trouve la vraie cause d'un échec quand le nœud renvoie malgré tout
      // un port de succès (ex. le motif d'un refus partenaire derrière un
      // upsert qui retombe en 404). On ne montre que ceux APPARUS pendant CE
      // passage (diff sur ctx.errors), jamais tout l'historique du run.
      const errAvant = (occ.start && occ.start.ctxSnapshot && occ.start.ctxSnapshot.errors) || [];
      const errApres = (fin && fin.ctxSnapshot && fin.ctxSnapshot.errors) || [];
      const nouveauxWarns = errApres.slice(errAvant.length).filter(function (e) {
        if (!e || !e.message) return false;
        // `node` vaut l'id du step, ou "<stepId>_step_N" pour une sous-étape
        // de séquence HTTP — les deux appartiennent à CE nœud.
        return !e.node || !step || e.node === step.id || e.node.indexOf(step.id + '_') === 0;
      });
      if (nouveauxWarns.length) {
        const secWarn = document.createElement('div');
        secWarn.className = 'rp-section';
        nouveauxWarns.forEach(function (e) {
          const ligne = document.createElement('div');
          ligne.className = 'rp-warn';
          ligne.setAttribute('data-severity', e.severity || 'warn');
          ligne.textContent = (e.severity === 'fatal' ? '✕ ' : '⚠ ') + e.message;
          secWarn.appendChild(ligne);
        });
        wrap.appendChild(secWarn);
      }

      // Résumé lisible d'abord — c'est LUI l'information principale.
      const resume = _resume(step, occ);
      if (resume) wrap.appendChild(resume);

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
        // `_lk_trace_*` : matière première du résumé Lookup ci-dessus, déjà
        // restituée en clair — l'afficher aussi en brut serait du bruit.
        // `_emprunts` de même (résumé dans les marques d'héritage). `_ancetres`
        // reste visible, lui : c'est une vraie récolte du nœud Collections
        // Parentes, et voir ce que porte chaque ancêtre est précisément ce qui
        // permet de comprendre pourquoi un champ n'a pas pu être hérité.
        const resultsChanges = _diffMap(avant.results, apres.results)
          .filter(function (d) {
            return d.key.indexOf('_lk_trace_') !== 0 && d.key.indexOf('_seq_trace_') !== 0
                && d.key !== '_emprunts';
          });
        if (varsChanges.length || resultsChanges.length) {
          // Brut relégué derrière un dépliant : consultable à la demande,
          // jamais imposé comme seule lecture possible.
          const det = document.createElement('details');
          det.className = 'rp-verbose';
          const sum = document.createElement('summary');
          sum.textContent = 'Détail technique (' + (varsChanges.length + resultsChanges.length) + ')';
          det.appendChild(sum);
          const section = document.createElement('div');
          section.className = 'rp-section';
          resultsChanges.forEach(function (d) { section.appendChild(_kv(d.key, d.value)); });
          varsChanges.forEach(function (d) { section.appendChild(_kv(d.key, d.value)); });
          det.appendChild(section);
          wrap.appendChild(det);
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

    // Ce que le nœud a signalé, EN HAUT et en clair. Auparavant il fallait
    // déplier un « Context snapshot » et lire le JSON pour retrouver un 404
    // — retour utilisateur du 2026-08-06 : « j'aurais dû voir dans le debug
    // l'erreur 404, et elle ne suffit pas : il faut la nature de l'erreur ».
    // D'où `_motifHttp`, qui extrait le motif de validation ({errors:{champ:
    // [...]}}) plutôt que le message d'enveloppe générique.
    const dernier = evenements[evenements.length - 1];
    const snap = dernier && dernier.ctxSnapshot;
    const signals = [];
    (snap && snap.errors ? snap.errors : []).forEach(function (e) {
      if (!e || !e.message) return;
      if (e.node && step && e.node !== step.id && e.node.indexOf(step.id + '_') !== 0) return;
      signals.push(e);
    });
    // Corps de réponse HTTP en échec, quel que soit le résultat qui le porte.
    const detailsHttp = [];
    Object.keys((snap && snap.results) || {}).forEach(function (k) {
      const v = snap.results[k];
      if (!v || typeof v !== 'object' || v.ok !== false) return;
      if (v.postOrigine) detailsHttp.push('POST ' + v.postOrigine.status + ' — ' + _motifHttp(v.postOrigine.body));
      detailsHttp.push(String(v.method || 'HTTP') + ' ' + v.status + ' — ' + _motifHttp(v.body));
    });

    if (signals.length || detailsHttp.length) {
      const bloc = document.createElement('div');
      bloc.className = 'rp-section';
      bloc.appendChild(_titre('Signalé par ce nœud'));
      signals.forEach(function (e) {
        const l = document.createElement('div');
        l.className = 'rp-warn';
        l.setAttribute('data-severity', e.severity || 'warn');
        l.textContent = (e.severity === 'fatal' ? '✕ ' : e.severity === 'info' ? 'ℹ ' : '⚠ ') + e.message;
        bloc.appendChild(l);
      });
      detailsHttp.forEach(function (t) {
        const l = document.createElement('div');
        l.className = 'rp-warn';
        l.setAttribute('data-severity', 'warn');
        l.textContent = '⚠ ' + t;
        bloc.appendChild(l);
      });
      paneDebug.appendChild(bloc);
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
