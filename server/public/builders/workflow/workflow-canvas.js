/* workflow-canvas.js — Mecanique du systeme de volets
 *
 * Ne pose QUE la mecanique de structure : ouvrir/fermer un volet par son onglet,
 * redimensionner par la poignee, deplacer et zoomer la surface. Aucun rendu de
 * noeud, aucune apparence.
 *
 * Regles de consolidation tenues :
 *   — zero gestionnaire inline : tout par addEventListener ;
 *   — zero style.display : l'ouverture d'un volet passe par l'attribut data-open
 *     sur la racine, que le CSS lit ; le JS n'ecrit jamais une propriete
 *     d'affichage, seulement des variables CSS (largeurs, pan, zoom) et data-open.
 */

(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const styles = getComputedStyle(document.documentElement);
  const px = (v) => parseInt(v, 10) || 0;
  const MIN = px(styles.getPropertyValue('--bd-panel-min'));
  const MAX = px(styles.getPropertyValue('--bd-panel-max'));

  const TITRE = { jobs: 'Jobs', logs: 'Logs', config: 'Config', run: 'Run', api: 'API ops' };

  // ── Ouverture / fermeture des volets ──────────────────────────────────────
  // data-open porte la liste des bords ouverts ("left right"). Le CSS fait
  // glisser le dock correspondant. Un seul volet ouvert par bord.

  function bordsOuverts() {
    return new Set((root.getAttribute('data-open') || '').split(' ').filter(Boolean));
  }
  function poserBords(set) {
    root.setAttribute('data-open', [...set].join(' '));
  }

  root.querySelectorAll('.bd-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const side = tab.getAttribute('data-side');
      const panel = tab.getAttribute('data-panel');
      const ouverts = bordsOuverts();
      const dejaActif = tab.classList.contains('bd-tab-active');

      // Désactive les onglets du même bord.
      root.querySelectorAll('.bd-tab[data-side="' + side + '"]').forEach(function (t) {
        t.classList.remove('bd-tab-active');
      });

      if (dejaActif) {
        ouverts.delete(side);
      } else {
        ouverts.add(side);
        tab.classList.add('bd-tab-active');
        const dock = root.querySelector('.bd-dock-' + side);
        if (dock && panel) dock.setAttribute('data-panel', panel);
        const titre = dock && dock.querySelector('[data-role="title"]');
        if (titre && TITRE[panel]) titre.textContent = TITRE[panel];
      }
      poserBords(ouverts);
    });
  });

  // ── Redimensionnement des volets ──────────────────────────────────────────
  const TOKEN = { left: '--bd-left-width', right: '--bd-right-width', bottom: '--bd-bottom-height' };

  function valeur(side) {
    return px(getComputedStyle(document.documentElement).getPropertyValue(TOKEN[side]));
  }
  function poser(side, v) {
    document.documentElement.style.setProperty(TOKEN[side], Math.max(MIN, Math.min(MAX, v)) + 'px');
  }

  root.querySelectorAll('.bd-grip').forEach(function (grip) {
    const side = grip.getAttribute('data-side');
    if (!TOKEN[side]) return;

    let startX = 0, startY = 0, startV = 0;

    function onMove(e) {
      if (side === 'left')   poser(side, startV + (e.clientX - startX));
      if (side === 'right')  poser(side, startV - (e.clientX - startX));
      if (side === 'bottom') poser(side, startV - (e.clientY - startY));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.classList.remove('bd-resizing');
    }

    grip.addEventListener('pointerdown', function (e) {
      startX = e.clientX; startY = e.clientY; startV = valeur(side);
      root.classList.add('bd-resizing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });

    grip.addEventListener('keydown', function (e) {
      const pas = e.shiftKey ? 32 : 8;
      if (e.key === 'ArrowLeft')  { poser(side, valeur(side) + (side === 'left' ? -pas : pas)); e.preventDefault(); }
      if (e.key === 'ArrowRight') { poser(side, valeur(side) + (side === 'left' ? pas : -pas)); e.preventDefault(); }
      if (e.key === 'ArrowUp')    { poser(side, valeur(side) + pas); e.preventDefault(); }
      if (e.key === 'ArrowDown')  { poser(side, valeur(side) - pas); e.preventDefault(); }
    });
  });

  // ── Pan / zoom de la surface ──────────────────────────────────────────────
  const frame = root.querySelector('.cnv-frame');
  const surface = root.querySelector('.cnv-surface');
  if (!frame || !surface) return;

  const view = { x: 0, y: 0, zoom: 1 };
  const ZOOM_MIN = 0.2, ZOOM_MAX = 3;

  function appliquer() {
    const s = document.documentElement.style;
    s.setProperty('--bd-pan-x', view.x + 'px');
    s.setProperty('--bd-pan-y', view.y + 'px');
    s.setProperty('--bd-zoom', String(view.zoom));
  }

  frame.addEventListener('wheel', function (e) {
    e.preventDefault();
    const rect = frame.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const facteur = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * facteur));
    const ratio = z / view.zoom;
    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.zoom = z;
    appliquer();
  }, { passive: false });

  let panning = false;
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

  // Le pan est au CLIC DROIT (bouton 2), pour laisser le clic gauche a la
  // selection et au lasso. On neutralise le menu contextuel sur le canevas.
  frame.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  frame.addEventListener('pointerdown', function (e) {
    if (e.button !== 2) return;                 // pan uniquement au clic droit
    // Pan seulement sur le vide : un clic droit sur un nœud est réservé au
    // menu contextuel (comme WFD).
    if (e.target.closest && e.target.closest('.bd-node-canvas')) return;
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    frame.classList.add('bd-panning');
    frame.setPointerCapture(e.pointerId);
  });
  frame.addEventListener('pointermove', function (e) {
    if (!panning) return;
    view.x = panStart.vx + (e.clientX - panStart.x);
    view.y = panStart.vy + (e.clientY - panStart.y);
    appliquer();
  });
  frame.addEventListener('pointerup', function (e) {
    panning = false;
    frame.classList.remove('bd-panning');
    if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
  });

  // ── Démo, désormais PILOTÉE PAR LE MODÈLE ─────────────────────────────────
  // Le DOM devient le reflet du modèle : on ne pose plus des nœuds à la main, on
  // remplit le modèle et une fonction de rendu réagit à ses changements. C'est
  // l'indirection qui rend l'undo/redo possible. La démo sera remplacée par le
  // chargement d'un vrai workflow ; la mécanique de rendu-réactif, elle, reste.
  const NR = window.NodeRenderer;
  const ER = window.EdgeRenderer;
  const WfModel = window.WfModel;
  const WfHistory = window.WfHistory;
  const nodesHost = root.querySelector('.cnv-nodes');
  const svgEdges = root.querySelector('.cnv-edges');
  // `surface` est déjà déclaré plus haut (pan/zoom) — on le réutilise.

  if (NR && WfModel && nodesHost) {
    const model = WfModel.creer({ nodes: [], edges: [] });

    // Le gestionnaire de commandes existe dès maintenant (undo/redo prêts pour
    // les gestes à venir : déplacer, supprimer, coller). Exposé pour la suite.
    const history = WfHistory ? WfHistory.creer(model) : null;
    root._wfModel = model;
    root._wfHistory = history;

    // Rendu réactif : redessine nœuds puis arêtes depuis le modèle.
    function rendreDepuisModele() {
      while (nodesHost.firstChild) nodesHost.removeChild(nodesHost.firstChild);
      model.noeuds().forEach(function (n) {
        nodesHost.appendChild(NR.rendre(n.etape, { x: n.x, y: n.y }));
      });
      _marquerSelection();
      retracerAretes();
    }

    // Retrace des arêtes, COALESCÉ : un seul rAF en vol à la fois. Sans ça, un
    // glissé empile des dizaines de rAF qui mesurent la géométrie pendant que
    // les transforms sont en vol → arêtes fantômes et saturation. On mesure une
    // seule fois par frame, positions stabilisées.
    let retraceEnVol = false;
    function retracerAretes() {
      if (!(ER && svgEdges && surface)) return;
      if (retraceEnVol) return;
      retraceEnVol = true;
      requestAnimationFrame(function () {
        retraceEnVol = false;
        const selAretes = selection ? selection.idsAretes() : [];
        ER.tracer(svgEdges, nodesHost, surface, model.aretes(), selAretes);
      });
    }

    // Marque visuellement la sélection (relu après chaque reconstruction).
    function _marquerSelection() {
      if (!selection) return;
      const ids = selection.ids();
      nodesHost.querySelectorAll('.bd-node-canvas').forEach(function (el) {
        const sel = ids.indexOf(el.getAttribute('data-step-id')) >= 0;
        el.setAttribute('data-selected', sel ? '1' : '0');
      });
    }

    // Déplacement d'un nœud : mise à jour LÉGÈRE (variables de position) plutôt
    // qu'une reconstruction totale — sinon le glissé rebâtirait tout le DOM à
    // chaque pixel, cassant la capture du pointeur. Les ajouts/retraits, eux,
    // reconstruisent (structure changée).
    model.onChange(function (type, detail) {
      if (type === 'node:move') {
        const el = nodesHost.querySelector('[data-step-id="' + detail.id + '"]');
        if (el) {
          el.style.setProperty('--nx', detail.x + 'px');
          el.style.setProperty('--ny', detail.y + 'px');
        }
        retracerAretes();
      } else {
        rendreDepuisModele();
      }
    });

    // ── Sélection + déplacement ───────────────────────────────────────────────
    const selection = window.WfSelection ? window.WfSelection.creer() : null;
    root._wfSelection = selection;

    if (selection) {
      selection.onChange(function () { _marquerSelection(); retracerAretes(); });
    }

    // Clic sur une arête : la sélectionner (zone de clic élargie côté SVG).
    if (svgEdges && selection) {
      svgEdges.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        const g = e.target.closest('.cnv-edge');
        if (!g) return;
        e.stopPropagation();
        const id = g.getAttribute('data-edge-id');
        if (id) selection.selectionnerArete(id);
      });
    }

    // Geste de déplacement au clic gauche sur un nœud. Pendant le glissé, on
    // bouge en direct (fluide) via le modèle ; au relâchement, on émet UNE seule
    // commande annulable portant le delta net (pas un undo par pixel).
    let drag = null;

    function _facteurZoom() {
      // Les positions modèle sont en coordonnées de surface ; le pointeur est en
      // pixels écran. On divise le déplacement écran par le zoom courant.
      return (view && view.zoom) ? view.zoom : 1;
    }

    nodesHost.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;                 // clic gauche seulement
      const nodeEl = e.target.closest('.bd-node-canvas');
      if (!nodeEl) return;
      // Un clic sur un port de sortie est réservé à la création de liaison
      // (wf-connect). On ignore tout le .nc-pout, pas seulement la pastille,
      // pour que le label du port ne déclenche pas un déplacement par erreur.
      if (e.target.closest('.nc-pout')) return;
      if (e.target.closest('.nc-dot')) return;

      const id = nodeEl.getAttribute('data-step-id');
      if (!selection) return;

      if (e.ctrlKey || e.metaKey) {
        selection.basculer(id);
      } else if (!selection.contient(id)) {
        selection.selectionner(id);             // sinon on garde la sélection multiple
      }
      e.stopPropagation();

      // Prépare le déplacement de toute la sélection.
      const ids = selection.ids();
      if (ids.length === 0) return;
      const depart = {};
      ids.forEach(function (nid) {
        const n = model.noeud(nid);
        if (n) depart[nid] = { x: n.x, y: n.y };
      });
      drag = { ids: ids, depart: depart, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false };
      nodesHost.setPointerCapture(e.pointerId);
    });

    nodesHost.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const z = _facteurZoom();
      drag.dx = (e.clientX - drag.sx) / z;
      drag.dy = (e.clientY - drag.sy) / z;
      if (Math.abs(drag.dx) > 2 || Math.abs(drag.dy) > 2) drag.moved = true;
      // Déplacement direct (sans commande) pour la fluidité.
      drag.ids.forEach(function (nid) {
        const d = drag.depart[nid];
        if (d) model.deplacerNoeud(nid, d.x + drag.dx, d.y + drag.dy);
      });
    });

    nodesHost.addEventListener('pointerup', function (e) {
      if (!drag) return;
      if (nodesHost.hasPointerCapture(e.pointerId)) nodesHost.releasePointerCapture(e.pointerId);
      const d = drag; drag = null;
      if (!d.moved || !history) return;
      // Remet d'abord les nœuds à leur départ, puis rejoue le delta comme UNE
      // commande annulable (les mouvements directs n'étaient pas dans l'historique).
      d.ids.forEach(function (nid) {
        const p = d.depart[nid];
        if (p) model.deplacerNoeud(nid, p.x, p.y);
      });
      history.executer(history.cmdDeplacer(d.ids, d.dx, d.dy));
    });

    // Focus du cadre au clic (pour les raccourcis clavier). Le vidage de
    // sélection sur clic-vide est désormais géré par le lasso (un lasso de la
    // taille d'un clic vide la sélection).
    frame.addEventListener('pointerdown', function (e) {
      frame.focus({ preventScroll: true });
    });

    // Lasso : sélection par encadrement (module séparé).
    if (window.WfLasso) {
      window.WfLasso.brancher({ frame: frame, nodesHost: nodesHost, selection: selection });
    }

    // Raccourcis clavier (undo/redo, suppression, copier/coller/dupliquer) —
    // module séparé, branché sur le contexte d'édition. Les touches ne font que
    // déclencher des commandes déjà écrites, donc tout reste annulable.
    const clipboard = window.WfClipboard ? window.WfClipboard.creer() : null;
    if (window.WfShortcuts) {
      window.WfShortcuts.brancher({ model: model, history: history, selection: selection, clipboard: clipboard, root: root });
    }

    // Glisser un nœud depuis la palette vers le canevas (module séparé). Le
    // dépôt crée une étape via commande annulable — Ctrl+Z l'annule.
    if (window.WfPaletteDrag) {
      const paletteRoot = root.querySelector('.bd-dock-right');
      window.WfPaletteDrag.brancher({
        paletteRoot: paletteRoot, frame: frame, surface: surface,
        model: model, history: history, selection: selection, view: view
      });
    }

    // Créer une liaison en tirant d'un port de sortie vers une entrée (module
    // séparé). Arête créée via commande annulable.
    if (window.WfConnect) {
      window.WfConnect.brancher({
        nodesHost: nodesHost, svgEdges: svgEdges, surface: surface, frame: frame,
        model: model, history: history
      });
    }

    // Menu contextuel au clic droit sur un nœud (module séparé). Le pan reste
    // sur le vide. Actions sur la sélection courante, via commandes annulables.
    if (window.WfContextMenu) {
      window.WfContextMenu.brancher({
        root: root, nodesHost: nodesHost, model: model, history: history,
        selection: selection, clipboard: clipboard
      });
    }

    // ── Panneau Config : reflet du nœud sélectionné ───────────────────────────
    // Un seul nœud sélectionné -> on configure. Le panneau lit/écrit un modèle
    // de config (source de vérité unique) ; écrire EST sauver : chaque frappe
    // met à jour l'étape du nœud, qui se re-rend. Pas de bouton « sauver ».
    const configHost = root.querySelector('[data-role="config-host"]');
    const configEmpty = root.querySelector('[data-role="config-empty"]');
    let offConfig = null;   // désabonnement du rendu précédent

    // Re-rend le contenu d'un seul nœud (léger) sans reconstruire tout le canevas.
    function _rerendreNoeud(id) {
      const n = model.noeud(id);
      const ancien = nodesHost.querySelector('[data-step-id="' + id + '"]');
      if (!n || !ancien || !NR) return;
      const neuf = NR.rendre(n.etape, { x: n.x, y: n.y });
      ancien.parentNode.replaceChild(neuf, ancien);
      _marquerSelection();
      retracerAretes();
    }

    function _majPanneauConfig() {
      if (!configHost || !window.ConfigModel || !window.ConfigRenderer || !window.ConfigSchema) return;
      if (offConfig) { offConfig(); offConfig = null; }
      while (configHost.firstChild) configHost.removeChild(configHost.firstChild);

      const ids = selection.ids();
      if (ids.length !== 1) {
        if (configEmpty) configEmpty.setAttribute('data-hidden', '0');
        return;
      }
      if (configEmpty) configEmpty.setAttribute('data-hidden', '1');

      const noeud = model.noeud(ids[0]);
      if (!noeud) return;

      // Le modèle de config porte les params + le label (édité comme un champ).
      const initial = Object.assign({ label: noeud.etape.label || '' }, noeud.etape.params || {});
      const cfg = window.ConfigModel.creer(initial);

      cfg.onChange(function () {
        const p = cfg.params();
        // label vit sur l'étape, hors params ; le reste va dans params.
        if (p.label != null) { noeud.etape.label = p.label; }
        const params = Object.assign({}, p); delete params.label;
        noeud.etape.params = params;
        _rerendreNoeud(noeud.id);   // reflet immédiat sur le nœud
      });

      const schema = window.ConfigSchema.pour(noeud.etape);
      offConfig = window.ConfigRenderer.rendre(configHost, schema, cfg);
    }

    selection.onChange(function () { _majPanneauConfig(); });

    rendreDepuisModele();

    // ── Persistance : charger un workflow existant (?id=) ou démarrer vierge,
    //    et sauvegarder via le bouton Save. Câblage réel remplaçant les valeurs
    //    de démonstration de l'identité (nom, indicateur unsaved). ────────────
    (function () {
      const WfPersistence = window.WfPersistence;
      if (!WfPersistence) return;

      let flowId = new URLSearchParams(window.location.search).get('id') || null;
      let flowName = null;
      let chargementEnCours = false;

      const nomEl = root.querySelector('[data-role="wf-name"]');
      const saveBtn = root.querySelector('[data-role="save-flow"]');
      const errEl = root.querySelector('[data-role="save-error"]');

      // Message SÉLECTIONNABLE/COPIABLE (contrairement à un alert() natif),
      // pour pouvoir en coller le texte complet lors d'un signalement.
      function _afficherErreur(msg) {
        if (!errEl) { console.error(msg); return; }
        errEl.textContent = '';
        const texte = document.createElement('span');
        texte.textContent = msg;
        const fermer = document.createElement('button');
        fermer.type = 'button';
        fermer.className = 'bd-save-error-fermer';
        fermer.textContent = '×';
        fermer.setAttribute('aria-label', 'Fermer');
        fermer.addEventListener('click', function () { errEl.hidden = true; });
        errEl.appendChild(texte);
        errEl.appendChild(fermer);
        errEl.hidden = false;
      }

      function _majEntete() {
        if (nomEl) nomEl.textContent = flowName || '— no workflow —';
      }

      // Marque « unsaved » à tout changement structurel réel (pas pendant le
      // chargement programmatique initial, qui ne doit pas se déclarer sale).
      model.onChange(function () {
        if (chargementEnCours) return;
        root.setAttribute('data-dirty', '1');
      });

      if (flowId) {
        chargementEnCours = true;
        WfPersistence.charger(flowId).then(function (res) {
          flowName = res.name;
          const initial = WfPersistence.initialDepuisDocument(res.document);
          initial.nodes.forEach(function (n) { model.ajouterNoeud(n); });
          initial.edges.forEach(function (e) { model.ajouterArete(e); });
          _majEntete();
          root.setAttribute('data-dirty', '0');
        }).catch(function (e) {
          console.error('Chargement du workflow impossible :', e.message);
        }).then(function () { chargementEnCours = false; });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          let name = flowName;
          if (!name) {
            name = window.prompt('Nom du workflow :', '');
            if (!name) return;
            flowName = name;
          }
          WfPersistence.sauvegarder({ id: flowId, name: name, model: model }).then(function (res) {
            flowId = res.id;
            flowName = res.name;
            window.history.replaceState(null, '', '?id=' + encodeURIComponent(flowId));
            _majEntete();
            root.setAttribute('data-dirty', '0');
            if (errEl) errEl.hidden = true;
          }).catch(function (e) {
            _afficherErreur('Erreur d\'enregistrement : ' + e.message);
          });
        });
      }
    })();
  }

  appliquer();
  // Nodes (Core) et Iconik (façades) sont remplis depuis le vrai catalogue.
  // Custom reste vide : son contenu dépend des permissions et du stockage par
  // user/environnement/plateforme, câblés plus tard.

  const CAT = window.PivotCatalogIconik;
  if (CAT) {
    const GLYPHES_CORE = {
      trigger: '⏱', decision: '◇', loop: '↻', verify: '✓', wait: '⏸',
      set_variable: '=', transform: '⇄', lookup: '⌕', http_request: '↗',
      http_sequence: '≫', history: '▤', deliver: '⇥'
    };
    const NOM_CORE = {
      trigger: 'Trigger', decision: 'Decision', loop: 'Loop', verify: 'Verify',
      wait: 'Wait', set_variable: 'Set Variable', transform: 'Transform',
      lookup: 'Lookup', http_request: 'HTTP Request', http_sequence: 'HTTP Sequence',
      history: 'History', deliver: 'Deliver'
    };

    function _node(glyphe, nom, sub, type) {
      const el = document.createElement('div');
      el.className = 'bd-node';
      // Le glisser-vers-canevas est géré par pointer events (wf-palette-drag),
      // pas par le drag HTML5 natif — on ne met donc pas draggable. On garde un
      // marqueur pour que le module reconnaisse une entrée saisissable.
      el.setAttribute('data-palette-node', '1');
      // Type transporté pour le glisser-vers-canevas : core ou facade + label.
      if (type) {
        if (type.core) el.setAttribute('data-core', type.core);
        if (type.facade) el.setAttribute('data-facade', type.facade);
        el.setAttribute('data-label', nom);
      }
      const g = document.createElement('span'); g.className = 'bd-glyph'; g.textContent = glyphe;
      const n = document.createElement('span'); n.className = 'bd-nm'; n.textContent = nom;
      el.appendChild(g); el.appendChild(n);
      if (sub) { const s = document.createElement('span'); s.className = 'bd-sub'; s.textContent = sub; el.appendChild(s); }
      return el;
    }

    const coreHost = root.querySelector('[data-role="palette-core"]');
    if (coreHost) {
      Object.keys(CAT.CORES).forEach(function (c) {
        coreHost.appendChild(_node(GLYPHES_CORE[c] || '·', NOM_CORE[c] || c, null, { core: c }));
      });
    }

    const platHost = root.querySelector('[data-role="palette-platform"]');
    if (platHost) {
      // Étiquette de plateforme déduite du préfixe de la façade. Le Builder est
      // multi-plateformes : on montre TOUTES les façades, chacune taguée par sa
      // plateforme (badge visible dans la liste, sans avoir à glisser le nœud).
      const PLATEFORME = { iconik: 'Iconik', aws_s3: 'AWS', vodfactory: 'VodFactory', aps: 'APS' };
      Object.keys(CAT.FACADES).forEach(function (f) {
        const fa = CAT.FACADES[f];
        // Les services (isService) ne sont pas des nœuds à poser : on les saute.
        if (fa.isService) return;
        const prefixe = f.split('.')[0];
        const plateforme = PLATEFORME[prefixe] || prefixe;
        const nom = f.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
        const el = _node('◆', nom, plateforme, { core: fa.core, facade: f });
        // Tag de plateforme porté sur le nœud : sert au badge (couleur) et,
        // à terme, au filtre par contexte d'orchestration (org + plateforme).
        el.setAttribute('data-platform', prefixe);
        platHost.appendChild(el);
      });
    }

    // Filtrage par contexte d'organisation (étape 4). La palette est remplie
    // ENTIÈREMENT ci-dessus (aucune régression si le contexte échoue), puis on
    // masque après coup les façades hors périmètre de l'org. Masquage par classe
    // CSS (jamais style.display), réversible, fidèle à la discipline.
    _filtrerPaletteParContexte(root);
  }

  // Masque les façades dont la plateforme n'appartient pas à l'org du contexte.
  // Respecte le rôle : si filtre=false (superadmin/admin), on ne masque rien.
  // Fail-safe : au moindre doute (contexte absent, erreur réseau), on ne masque
  // rien — mieux vaut une façade de trop qu'une façade utile cachée.
  function _filtrerPaletteParContexte(root) {
    fetch('/api/context').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (ctx) {
      if (!ctx) return;                       // pas de contexte -> rien masquer
      if (ctx.filtre === false) return;       // superadmin/admin -> tout visible
      if (!ctx.org || !Array.isArray(ctx.org.platforms)) return;

      // Ensemble des préfixes de plateforme autorisés (depuis les slugs de l'org).
      const autorises = {};
      ctx.org.platforms.forEach(function (p) {
        if (p && p.slug) autorises[_slugVersPrefixe(p.slug)] = true;
      });

      const noeuds = root.querySelectorAll('[data-role="palette-platform"] [data-platform]');
      noeuds.forEach(function (el) {
        const prefixe = el.getAttribute('data-platform');
        el.classList.toggle('bd-hors-contexte', !autorises[prefixe]);
      });
    }).catch(function () { /* silencieux : fail-safe, on ne masque rien */ });
  }

  // Mappe un slug de plateforme (base) vers le préfixe de façade (catalogue).
  // Direct pour Iconik ; alias pour les cas où slug != préfixe.
  function _slugVersPrefixe(slug) {
    const ALIAS = { 's3': 'aws_s3', 'aws': 'aws_s3', 'amazon-s3': 'aws_s3' };
    return ALIAS[slug] || slug;
  }

  root.querySelectorAll('.bd-subtab').forEach(function (st) {
    st.addEventListener('click', function () {
      const pane = st.getAttribute('data-pane');
      root.querySelectorAll('.bd-subtab').forEach(function (x) {
        x.classList.toggle('bd-subtab-active', x === st);
      });
      root.querySelectorAll('.bd-pane').forEach(function (p) {
        p.classList.toggle('bd-pane-active', p.getAttribute('data-pane') === pane);
      });
    });
  });

  // ── Bandeau d'état : mécanique (le câblage des données viendra ensuite) ────
  // Le verrou « flux actif » se lève par le bouton désactiver : il retire
  // data-active de la racine, ce qui referme le segment cadenas et la teinte de
  // lecture seule. L'état lui-même sera piloté par les données au patch suivant.
  const btnOff = root.querySelector('[data-role="deactivate"]');
  if (btnOff) {
    btnOff.addEventListener('click', function () {
      root.setAttribute('data-active', '0');
    });
  }

})();
