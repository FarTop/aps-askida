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

  frame.addEventListener('pointerdown', function (e) {
    if (e.target !== frame && e.target !== surface) return;
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
      if (ER && svgEdges && surface) {
        requestAnimationFrame(function () {
          ER.tracer(svgEdges, nodesHost, surface, model.aretes());
        });
      }
    }

    // Redessine à chaque changement du modèle. (Simple et robuste pour la
    // fondation ; on affinera en rendu incrémental si le besoin de perf vient.)
    model.onChange(function () { rendreDepuisModele(); });
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

    function _node(glyphe, nom, sub) {
      const el = document.createElement('div');
      el.className = 'bd-node';
      el.setAttribute('draggable', 'true');
      const g = document.createElement('span'); g.className = 'bd-glyph'; g.textContent = glyphe;
      const n = document.createElement('span'); n.className = 'bd-nm'; n.textContent = nom;
      el.appendChild(g); el.appendChild(n);
      if (sub) { const s = document.createElement('span'); s.className = 'bd-sub'; s.textContent = sub; el.appendChild(s); }
      return el;
    }

    const coreHost = root.querySelector('[data-role="palette-core"]');
    if (coreHost) {
      Object.keys(CAT.CORES).forEach(function (c) {
        coreHost.appendChild(_node(GLYPHES_CORE[c] || '·', NOM_CORE[c] || c));
      });
    }

    const platHost = root.querySelector('[data-role="palette-platform"]');
    if (platHost) {
      Object.keys(CAT.FACADES).forEach(function (f) {
        if (f.indexOf('iconik.') !== 0) return;
        const fa = CAT.FACADES[f];
        const nom = f.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
        platHost.appendChild(_node('◆', nom, fa.core === 'http_request' ? 'http' : fa.core));
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
