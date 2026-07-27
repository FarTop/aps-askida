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
    const model = WfModel.creer({
      nodes: [
        { id: 'boucler', x: 80,  y: 80,  etape: { id: 'boucler', core: 'loop',
          label: 'Boucler sur les collections', params: { resultVar: 'loop.item' } } },
        { id: 'fetch',   x: 380, y: 80,  etape: { id: 'fetch', core: 'http_request', facade: 'iconik.fetch',
          label: 'Fetch Collection MD', params: { resultVar: 'collectionMeta' } } },
        { id: 'decider', x: 380, y: 300, etape: { id: 'decider', core: 'decision',
          label: 'Route by content type', params: { conditions: [ { label: 'Série' }, { label: 'Saison' } ] } } },
        { id: 'action',  x: 700, y: 340, etape: { id: 'action', core: 'http_request', facade: 'iconik.action',
          label: 'Export Location (collection to partner S3)', params: { resultVar: 'exportResult' } } }
      ],
      edges: [
        { from: { step: 'boucler', port: 'out' },   to: { step: 'fetch' } },
        { from: { step: 'fetch',   port: 'out' },    to: { step: 'decider' } },
        { from: { step: 'fetch',   port: 'error' },  to: { step: 'action' } }
      ]
    });

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
      // Un clic sur une pastille de port est réservé (future création de lien).
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

    rendreDepuisModele();
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
      Object.keys(CAT.FACADES).forEach(function (f) {
        if (f.indexOf('iconik.') !== 0) return;
        const fa = CAT.FACADES[f];
        const nom = f.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
        platHost.appendChild(_node('◆', nom, fa.core === 'http_request' ? 'http' : fa.core, { core: fa.core, facade: f }));
      });
    }
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
