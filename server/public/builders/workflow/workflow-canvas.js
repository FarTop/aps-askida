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

  const TITRE = { jobs: 'Jobs', logs: 'Logs', config: 'Config', variables: 'Variables', run: 'Run', api: 'API ops' };

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
  const WfScope = window.WfScope;
  const nodesHost = root.querySelector('.cnv-nodes');
  const svgEdges = root.querySelector('.cnv-edges');
  // `surface` est déjà déclaré plus haut (pan/zoom) — on le réutilise.

  if (NR && WfModel && nodesHost) {
    // Portée racine, toujours la même instance — c'est CELLE-CI que la
    // persistance sauvegarde (jamais la portée courante, qui peut être un
    // corps de boucle ouvert). `model`/`history`/`selection` ci-dessous
    // pointent vers la portée COURANTE (racine au départ) et sont
    // réassignés (jamais redéclarés) à chaque entrée/sortie de corps — cf.
    // `_surScope` : tout le reste du fichier continue de lire ces mêmes
    // noms de variable sans changement, seule la valeur qu'ils tiennent
    // change avec la portée.
    const modeleRacine = WfModel.creer({ nodes: [], edges: [] });
    // Nommé `portee` (pas `scope`) : le panneau Variables plus bas a déjà une
    // variable locale `scope` (mode d'affichage "toutes"/"amont"), sans
    // rapport — éviter la collision plutôt que la masquer.
    const portee = WfScope ? WfScope.creer(modeleRacine, {}) : null;
    root._wfScope = portee;

    let model     = portee ? portee.courant().model     : modeleRacine;
    let history   = portee ? portee.courant().history   : (WfHistory ? WfHistory.creer(modeleRacine) : null);
    let selection = portee ? portee.courant().selection : null;
    root._wfModel = model;
    root._wfHistory = history;
    root._wfSelection = selection;

    // ── Réabonnement sur changement de portée ─────────────────────────────
    // `model`/`history`/`selection` sont réassignés (jamais redéclarés) à
    // chaque entrée/sortie d'un corps de boucle — cf. `_surScope` plus bas.
    // Tout ce qui s'abonne à `model.onChange`/`selection.onChange`, ou
    // branche un module externe (WfPaletteDrag, WfConnect, WfContextMenu,
    // WfShortcuts, WfLasso — chacun capture le triplet PAR VALEUR à l'appel
    // de son `.brancher()`), doit se désabonner de l'ancienne portée et se
    // réabonner à la nouvelle. `_reabonnable(fn)` fait ça une fois pour
    // toutes : `fn()` s'exécute immédiatement (portée racine) et à chaque
    // futur changement de portée, après avoir défait son abonnement précédent.
    const _reScope = [];
    function _reabonnable(fn) {
      let off = null;
      function relier() { if (off) off(); off = fn() || null; }
      _reScope.push(relier);
      relier();
    }
    // Assignés plus bas (panneau Variables, fil d'Ariane) — déclarés ici pour
    // que `_surChangementDePortee`, défini avant eux, puisse les appeler sans
    // dépendre de l'ordre d'exécution (les deux IIFE tournent avant le
    // premier changement de portée réel).
    let _rendreVarsPanel = function () {};
    let _majFilDAriane = function () {};

    // Compteurs de la statusbar (jusqu'ici jamais câblés — comme "snapshot").
    const nodeCountEl = root.querySelector('[data-role="node-count"]');
    const connCountEl = root.querySelector('[data-role="conn-count"]');
    function _majCompteurs() {
      if (nodeCountEl) nodeCountEl.textContent = String(model.noeuds().length);
      if (connCountEl) connCountEl.textContent = String(model.aretes().length);
    }

    // Rendu réactif : redessine nœuds puis arêtes depuis le modèle.
    function rendreDepuisModele() {
      while (nodesHost.firstChild) nodesHost.removeChild(nodesHost.firstChild);
      model.noeuds().forEach(function (n) {
        nodesHost.appendChild(NR.rendre(n.etape, { x: n.x, y: n.y }));
      });
      _marquerSelection();
      retracerAretes();
      _majCompteurs();
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
    _reabonnable(function () {
      return model.onChange(function (type, detail) {
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
    });

    // ── Sélection + déplacement ───────────────────────────────────────────────

    _reabonnable(function () {
      return selection ? selection.onChange(function () { _marquerSelection(); retracerAretes(); }) : null;
    });

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

    // Double-clic sur un nœud Loop : entre dans son corps (éditeur de corps
    // de boucle). Sur tout autre type de nœud, ne fait rien — pas de
    // sur-interprétation d'un double-clic hors contexte.
    if (portee) {
      nodesHost.addEventListener('dblclick', function (e) {
        const nodeEl = e.target.closest('.bd-node-canvas');
        if (!nodeEl) return;
        const id = nodeEl.getAttribute('data-step-id');
        const n = model.noeud(id);
        if (!n || !n.etape || n.etape.core !== 'loop') return;
        e.stopPropagation();
        if (portee.entrer(id)) _surChangementDePortee(true);
      });
    }

    // Focus du cadre au clic (pour les raccourcis clavier). Le vidage de
    // sélection sur clic-vide est désormais géré par le lasso (un lasso de la
    // taille d'un clic vide la sélection).
    frame.addEventListener('pointerdown', function (e) {
      frame.focus({ preventScroll: true });
    });

    // Lasso : sélection par encadrement (module séparé). Capture `selection`
    // par valeur à l'appel de `.brancher()` — comme les autres modules
    // externes ci-dessous, doit être rebranché à chaque changement de portée.
    if (window.WfLasso) {
      _reabonnable(function () {
        return window.WfLasso.brancher({ frame: frame, nodesHost: nodesHost, selection: selection });
      });
    }

    // Raccourcis clavier (undo/redo, suppression, copier/coller/dupliquer) —
    // module séparé, branché sur le contexte d'édition. Les touches ne font que
    // déclencher des commandes déjà écrites, donc tout reste annulable.
    const clipboard = window.WfClipboard ? window.WfClipboard.creer() : null;
    if (window.WfShortcuts) {
      _reabonnable(function () {
        return window.WfShortcuts.brancher({ model: model, history: history, selection: selection, clipboard: clipboard, root: root });
      });
    }

    // Glisser un nœud depuis la palette vers le canevas (module séparé). Le
    // dépôt crée une étape via commande annulable — Ctrl+Z l'annule. Dépose
    // TOUJOURS dans la portée courante (racine ou corps de boucle ouvert) :
    // c'est `model` qui le décide, rebranché à chaque changement de portée.
    if (window.WfPaletteDrag) {
      const paletteRoot = root.querySelector('.bd-dock-right');
      _reabonnable(function () {
        return window.WfPaletteDrag.brancher({
          paletteRoot: paletteRoot, frame: frame, surface: surface,
          model: model, history: history, selection: selection, view: view
        });
      });
    }

    // Créer une liaison en tirant d'un port de sortie vers une entrée (module
    // séparé). Arête créée via commande annulable.
    if (window.WfConnect) {
      _reabonnable(function () {
        return window.WfConnect.brancher({
          nodesHost: nodesHost, svgEdges: svgEdges, surface: surface, frame: frame,
          model: model, history: history, view: view
        });
      });
    }

    // Menu contextuel au clic droit sur un nœud (module séparé). Le pan reste
    // sur le vide. Actions sur la sélection courante, via commandes annulables.
    if (window.WfContextMenu) {
      _reabonnable(function () {
        return window.WfContextMenu.brancher({
          root: root, nodesHost: nodesHost, model: model, history: history,
          selection: selection, clipboard: clipboard
        });
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
        model.notifierMiseAJour(noeud.id);   // marque "unsaved" + déclenche l'auto-save
        _rerendreNoeud(noeud.id);   // reflet immédiat sur le nœud
      });

      const schema = window.ConfigSchema.pour(noeud.etape);
      offConfig = window.ConfigRenderer.rendre(configHost, schema, cfg,
        { envSlug: root._envSlug, etapesPrecedentes: _etapesPrecedentes(noeud.id) });

      // Boucle : bouton explicite en plus du double-clic sur le nœud — pour
      // la découvrabilité (rien dans le panneau Config ne suggérait qu'on
      // pouvait entrer dans un Loop avant ce bouton).
      if (noeud.etape.core === 'loop' && portee) {
        const n2 = (noeud.etape.body && noeud.etape.body.steps && noeud.etape.body.steps.length) || 0;
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'bd-btn-loop-body';
        bouton.textContent = 'Edit body →' + (n2 ? ' (' + n2 + ' step' + (n2 > 1 ? 's' : '') + ')' : '');
        bouton.addEventListener('click', function () {
          if (portee.entrer(noeud.id)) _surChangementDePortee(true);
        });
        configHost.appendChild(bouton);
      }
    }

    // Sélecteur de variables (étape 4, Ordre de construction) : remonte le
    // graphe depuis le nœud courant pour lister ce que les étapes en amont
    // sont connues pour produire — jamais un nom tapé de mémoire. Parcours en
    // largeur, dédupliqué, ordre "le plus proche d'abord", DANS LA PORTÉE
    // COURANTE (racine ou corps de boucle ouvert). Complété par ce qui a été
    // posé AVANT la boucle dans sa portée parente (`portee.etapesExterieures`)
    // — sans ça, entrer dans un corps rendrait le sélecteur aveugle à tout ce
    // qui précède, contredisant la raison d'être du panneau Variables.
    function _etapesPrecedentes(nodeId) {
      const aretes = model.aretes();
      const vus = { }; vus[nodeId] = true;
      const file = [nodeId];
      const resultat = [];
      while (file.length) {
        const courant = file.shift();
        aretes.forEach(function (a) {
          if (!a.to || a.to.step !== courant) return;
          const pid = a.from && a.from.step;
          if (!pid || vus[pid]) return;
          vus[pid] = true;
          const n = model.noeud(pid);
          if (n && n.etape) resultat.push(n.etape);
          file.push(pid);
        });
      }
      if (portee && !portee.estRacine()) {
        portee.etapesExterieures().forEach(function (e) { resultat.push(e); });
      }
      return resultat;
    }

    // ── Panneau Variables : vue dédiée, pas juste un sélecteur par champ ─────
    // Reprend le principe d'un panneau de WFD (script-workflow-designer.js,
    // _wfdCollectVars/_wfdRenderVarsPanel) — mais sans onglet "Dernier run" :
    // aucune exécution réelle n'existe encore pour un workflow du Builder
    // (pas de pont vers un moteur). "Toutes" liste chaque nœud du graphe,
    // "Upstream of selection" réutilise _etapesPrecedentes.
    (function () {
      const varsHost    = root.querySelector('[data-role="vars-liste"]');
      const varsEmpty   = root.querySelector('[data-role="vars-empty"]');
      const varsFilter  = root.querySelector('[data-role="vars-filter"]');
      const varsSubtabs = root.querySelectorAll('[data-role="vars-subtabs"] .bd-subtab');
      if (!varsHost) return;

      let scope = 'toutes';
      // Groupes "repliés" (étape id -> true) : les champs "si présent" (ex.
      // les dizaines de métadonnées possibles d'un résultat Search) ne
      // s'affichent pas par défaut — repli, pas suppression, retour
      // utilisateur du 3 août : la liste à plat devenait aussi peu lisible
      // que l'ancien panneau WFD. Persiste entre deux rendus (sinon rouvrir
      // reviendrait à zéro à chaque frappe ailleurs dans le panneau).
      const deplies = {};

      function _etapesPourVarsPanel() {
        if (scope === 'amont') {
          const ids = selection.ids();
          return ids.length === 1 ? _etapesPrecedentes(ids[0]) : [];
        }
        const ici = model.noeuds().map(function (n) { return n.etape; }).filter(Boolean);
        // "Toutes" à l'intérieur d'un corps de boucle : aussi tout ce qui a
        // été posé avant la boucle dans sa portée parente — utilisable
        // depuis l'intérieur, donc doit rester visible même en mode "tout".
        if (portee && !portee.estRacine()) {
          portee.etapesExterieures().forEach(function (e) { ici.push(e); });
        }
        return ici;
      }

      function _rendreVars() {
        const CAT = window.PivotCatalogIconik;
        const src = window.ConfigSources;
        varsHost.textContent = '';
        if (!CAT) { if (varsEmpty) varsEmpty.setAttribute('data-hidden', '0'); return; }

        const etapes = _etapesPourVarsPanel();
        const filtreTexte = ((varsFilter && varsFilter.value) || '').toLowerCase().trim();
        let total = 0;

        function _ligne(it) {
          total++;
          const ligne = document.createElement('div');
          ligne.className = 'bd-var-ligne';
          ligne.title = 'Click to copy {' + it.nom + '}';

          const nom = document.createElement('span');
          nom.className = 'bd-var-nom';
          nom.textContent = '{' + it.nom + '}';
          ligne.appendChild(nom);

          if (it.aide) {
            const aide = document.createElement('span');
            aide.className = 'bd-var-aide';
            aide.textContent = it.aide;
            ligne.appendChild(aide);
          }
          if (it.incertain) {
            const marque = document.createElement('span');
            marque.className = 'bd-var-incertain';
            marque.textContent = 'if present';
            ligne.appendChild(marque);
          }

          ligne.addEventListener('click', function () {
            const texte = '{' + it.nom + '}';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(texte).catch(function () {});
            }
            ligne.classList.add('bd-var-ligne-copie');
            setTimeout(function () { ligne.classList.remove('bd-var-ligne-copie'); }, 500);
          });
          return ligne;
        }

        // Variable de boucle : {item} (ou le nom choisi via `loopVar`) n'est
        // la sortie d'AUCUNE façade du catalogue — elle vient de la config du
        // Loop dont on édite le corps. Sans cette ligne, la variable la plus
        // évidente à utiliser à l'intérieur d'un corps (l'élément courant)
        // serait absente du panneau censé éviter d'en taper le nom de mémoire.
        if (portee && !portee.estRacine()) {
          const etapeBoucle = portee.courant().etape;
          const nomVar = (etapeBoucle.params && etapeBoucle.params.loopVar) || 'item';
          const titre = document.createElement('div');
          titre.className = 'bd-var-groupe-titre';
          titre.textContent = 'Boucle — ' + (etapeBoucle.label || etapeBoucle.id);
          varsHost.appendChild(titre);
          varsHost.appendChild(_ligne({ nom: nomVar, aide: 'élément courant de la boucle' }));
        }

        etapes.forEach(function (etape) {
          const certains = (CAT.variablesDe(etape) || []).slice();
          const incertains = [];
          if (CAT.aplatitMetadonnees(etape) && src && root._envSlug) {
            src.metadonneesChargees(root._envSlug).forEach(function (c) {
              incertains.push({ nom: c.name, aide: c.label, incertain: true });
            });
          }

          // En recherche active, on ignore le repli : filtrer EST la façon
          // d'aller chercher un champ "si présent" précis sans le voir tout
          // le temps.
          const cible = filtreTexte ? certains.concat(incertains) : certains;
          const filtresCertains = filtreTexte
            ? cible.filter(function (it) { return it.nom.toLowerCase().indexOf(filtreTexte) !== -1; })
            : cible;
          const filtresIncertains = filtreTexte
            ? []   // déjà inclus dans filtresCertains ci-dessus quand on filtre
            : incertains;

          if (!filtresCertains.length && !filtresIncertains.length) return;

          const titre = document.createElement('div');
          titre.className = 'bd-var-groupe-titre';
          titre.textContent = etape.label || etape.id;
          varsHost.appendChild(titre);

          filtresCertains.slice().sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); })
            .forEach(function (it) { varsHost.appendChild(_ligne(it)); });

          if (filtresIncertains.length) {
            const cle = etape.id;
            const ouvert = !!deplies[cle];
            const toggle = document.createElement('div');
            toggle.className = 'bd-var-toggle';
            toggle.textContent = (ouvert ? '▾ hide ' : '▸ show ') + filtresIncertains.length + ' possible metadata field'
              + (filtresIncertains.length > 1 ? 's' : '');
            toggle.addEventListener('click', function () {
              deplies[cle] = !deplies[cle];
              _rendreVars();
            });
            varsHost.appendChild(toggle);

            if (ouvert) {
              filtresIncertains.slice().sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); })
                .forEach(function (it) { varsHost.appendChild(_ligne(it)); });
            } else {
              total += filtresIncertains.length;   // comptent pour "non vide", pas affichées
            }
          }
        });

        if (varsEmpty) varsEmpty.setAttribute('data-hidden', total ? '1' : '0');
      }

      varsSubtabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
          varsSubtabs.forEach(function (b) { b.classList.toggle('bd-subtab-active', b === btn); });
          scope = btn.getAttribute('data-scope');
          _rendreVars();
        });
      });
      if (varsFilter) varsFilter.addEventListener('input', _rendreVars);

      // Rafraîchit sur changement de sélection (utile pour "Upstream of
      // selection") et sur changement du modèle (un nœud ajouté/renommé doit
      // apparaître sans réouvrir l'onglet).
      _reabonnable(function () { return selection.onChange(_rendreVars); });
      _reabonnable(function () { return model.onChange(_rendreVars); });
      _rendreVars();
      // Exposé pour `_surChangementDePortee` : un changement de portée ne
      // déclenche ni model.onChange ni selection.onChange (l'INSTANCE change,
      // ce n'est pas une mutation dedans) — il doit rafraîchir explicitement.
      _rendreVarsPanel = _rendreVars;
    })();

    _reabonnable(function () { return selection.onChange(function () { _majPanneauConfig(); }); });

    // Recentre la vue (pan) sur le contenu du modèle COURANT. Un corps de
    // boucle vit dans son propre espace de coordonnées, indépendant de celui
    // de la racine (positions posées près de 120,120 par défaut) — sans ça,
    // entrer dans un corps garde le pan hérité de la portée précédente, et le
    // contenu se retrouve hors champ (repéré le 4 août : un vrai corps de 5
    // étapes rendu, mais invisible tant qu'on ne pense pas à faire défiler).
    // Approximatif par nature (pas de vraie boîte englobante des nœuds
    // rendus) — suffisant pour ramener le contenu à l'écran, pas besoin
    // d'exactitude au pixel.
    function _centrerSurContenu() {
      const noeuds = model.noeuds();
      if (!noeuds.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      noeuds.forEach(function (n) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + 220); maxY = Math.max(maxY, n.y + 120);
      });
      const rect = frame.getBoundingClientRect();
      view.x = rect.width  / 2 - ((minX + maxX) / 2) * view.zoom;
      view.y = rect.height / 2 - ((minY + maxY) / 2) * view.zoom;
      appliquer();
    }

    // ── Changement de portée (entrer/sortir d'un corps de boucle) ──────────
    // Réassigne model/history/selection depuis la portée courante, refait
    // tous les abonnements/branchements enregistrés via `_reabonnable`, et
    // rafraîchit tout ce qui en dépend. Déclenché par le double-clic sur un
    // Loop, le bouton "Edit body →", le fil d'Ariane, ou Échap.
    // `centrer` : true seulement en ENTRANT dans un corps — un corps est un
    // petit espace de coordonnées propre, presque toujours hors champ du pan
    // hérité (cf. commentaire de `_centrerSurContenu`). En sortant (ou en
    // naviguant le fil d'Ariane vers un niveau déjà vu), on préfère garder le
    // pan tel quel : recentrer systématiquement sur tout le graphe racine
    // (souvent large et épars, positions héritées de WFD) recadre sur un
    // centre de masse qui n'a rien à voir avec ce que l'utilisateur regardait.
    function _surChangementDePortee(centrer) {
      if (!portee) return;
      const s = portee.courant();
      model = s.model; history = s.history; selection = s.selection;
      root._wfModel = model; root._wfHistory = history; root._wfSelection = selection;
      _reScope.forEach(function (fn) { fn(); });
      rendreDepuisModele();
      if (centrer) _centrerSurContenu();
      _majPanneauConfig();
      _rendreVarsPanel();
      _majFilDAriane();
    }

    // ── Fil d'Ariane : navigation entre les portées ouvertes ────────────────
    (function () {
      if (!portee) return;
      const nav = root.querySelector('[data-role="breadcrumb"]');
      const cheminEl = root.querySelector('[data-role="breadcrumb-chemin"]');
      const sortirBtn = root.querySelector('[data-role="breadcrumb-sortir"]');
      if (!nav || !cheminEl) return;

      function _majFilDArianeImpl() {
        nav.hidden = portee.estRacine();
        cheminEl.textContent = '';
        const noms = portee.chemin();
        noms.forEach(function (nom, i) {
          if (i > 0) cheminEl.appendChild(document.createTextNode(' › '));
          const seg = document.createElement('button');
          seg.type = 'button';
          seg.className = 'bd-breadcrumb-seg';
          seg.textContent = nom;
          seg.disabled = (i === noms.length - 1);
          seg.addEventListener('click', function () {
            // Sort jusqu'au niveau `i` (0 = racine).
            while (portee.profondeur() > i) portee.sortir();
            _surChangementDePortee();
          });
          cheminEl.appendChild(seg);
        });
      }
      _majFilDAriane = _majFilDArianeImpl;
      _majFilDAriane();

      if (sortirBtn) {
        sortirBtn.addEventListener('click', function () {
          if (portee.sortir()) _surChangementDePortee();
        });
      }

      // Échap : sort d'un niveau, sauf si le focus est dans un champ de
      // saisie (ne pas voler Échap à un panneau de config en cours d'usage).
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (portee.estRacine()) return;
        const actif = document.activeElement;
        const dansChamp = actif && (actif.tagName === 'INPUT' || actif.tagName === 'TEXTAREA' || actif.isContentEditable);
        if (dansChamp) return;
        if (portee.sortir()) _surChangementDePortee();
      });
    })();

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

      // Annonce flowId/orgId aux modules indépendants du dock gauche/droit
      // (run-panel.js, jobs-logs-panel.js) — même principe que root._envSlug
      // pour config-sources.js : pas de dépendance inverse, ce fichier ne
      // connaît pas leur contenu, il expose juste l'état sur root.
      function _annoncerFlow() {
        root._flowId = flowId;
        root._orgId = orgIdWorkflow;
        root.dispatchEvent(new CustomEvent('aps:flow-ready', {
          detail: { flowId: flowId, orgId: orgIdWorkflow, name: flowName }
        }));
      }

      // ── Organisation : INFORMATION en lecture seule (pas un sélecteur) ─────
      // Un workflow appartient à une org FIXE (décidée à sa création). On
      // affiche celle du workflow chargé, ou celle du contexte global pour un
      // workflow tout neuf (pas encore créé — c'est cette org qui l'accueillera
      // à la première sauvegarde). orgIdWorkflow scope ensuite le sélecteur
      // d'environnement, explicitement (en-tête X-Org-Id), pour ne JAMAIS
      // dépendre du cookie de contexte ambiant qui pourrait diverger.
      // NOTE : org-info vit dans le header du HAUT (<header class="aps-header">),
      // qui est un FRERE de .bd-canvas-root (root), pas un descendant — d'où
      // document.querySelector ici, contrairement aux autres éléments de cette
      // section (wf-name, env-*...) qui vivent dans la statusbar, elle bien
      // À L'INTÉRIEUR de root.
      const orgInfoEl = document.querySelector('[data-role="org-info"]');
      let orgIdWorkflow = null;

      function _afficherOrg(nom) {
        if (orgInfoEl) orgInfoEl.textContent = nom || '';
      }

      // ── Sélecteur d'environnement (scopé sur l'org du workflow) ────────────
      const envSelect = root.querySelector('[data-role="env-select"]');
      const envDot = root.querySelector('[data-role="env-dot"]');
      const envOrg = root.querySelector('[data-role="env-org"]');
      const envRefresh = root.querySelector('[data-role="env-refresh"]');
      let environnements = [];

      function _majBilleEnv() {
        if (!envDot) return;
        if (envSelect && envSelect.value) envDot.setAttribute('data-state', 'ok');
        else envDot.removeAttribute('data-state');
      }

      function _peuplerEnvironnements(valeurAPreselectionner) {
        if (!envSelect) return Promise.resolve();
        const entetes = orgIdWorkflow ? { 'X-Org-Id': orgIdWorkflow } : {};
        return fetch('/api/environments', { headers: entetes })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (list) {
            environnements = (Array.isArray(list) ? list : []).filter(function (e) {
              return !orgIdWorkflow || e.orgId === orgIdWorkflow;
            }).sort(function (a, b) {
              return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
            });
            envSelect.textContent = '';
            const vide = document.createElement('option');
            vide.value = ''; vide.textContent = '— environment —';
            envSelect.appendChild(vide);
            environnements.forEach(function (e) {
              const o = document.createElement('option');
              o.value = e.id;
              o.textContent = e.name;
              envSelect.appendChild(o);
            });
            if (valeurAPreselectionner) envSelect.value = valeurAPreselectionner;
            _majTypeOrg();
            _majBilleEnv();
          }).catch(function () { /* liste vide, non bloquant */ });
      }

      function _majTypeOrg() {
        const courant = environnements.find(function (e) { return e.id === envSelect.value; });
        // Slug exposé sur root : le panneau Config (config-sources.js) en a
        // besoin pour savoir quel environnement interroger en direct auprès
        // d'Iconik (métadonnées, vues). Pas de dépendance inverse : le canvas
        // ne connaît pas config-*.js.
        root._envSlug = courant ? courant.slug : null;
        if (!envOrg) return;
        envOrg.textContent = courant ? (courant.type || '').toUpperCase() : '';
      }

      if (envSelect) {
        envSelect.addEventListener('change', function () {
          _majTypeOrg();
          _majBilleEnv();
          if (!chargementEnCours) { root.setAttribute('data-dirty', '1'); _declencherAutoSave(); }
        });
      }
      // ── Fraîcheur des données Iconik (métadonnées, vues) ────────────────────
      // Affiche l'horodatage du dernier appel réel réussi via ConfigSources
      // (config-sources.js, lecture directe d'Iconik — plus de dépendance au
      // pipeline de sync Settings/WFD). Champ "snapshot" de la statusbar,
      // jusqu'ici jamais câblé.
      const snapshotEl = root.querySelector('[data-role="snapshot"]');
      // Date + heure — l'heure seule est ambiguë si le canvas reste ouvert
      // d'une session à l'autre (rien ne dit que "19:46" est d'aujourd'hui).
      function _formaterHeure(date) {
        return date ? date.toLocaleDateString() + ' ' + date.toLocaleTimeString() : '—';
      }
      function _majSnapshot() {
        if (!snapshotEl || !window.ConfigSources) return;
        snapshotEl.textContent = _formaterHeure(window.ConfigSources.dernierRafraichissement());
      }
      if (window.ConfigSources) window.ConfigSources.onRafraichi(_majSnapshot);
      _majSnapshot();

      if (envRefresh) {
        envRefresh.addEventListener('click', function () {
          // Retour visuel IMMÉDIAT, indépendant de tout panneau ouvert — sur
          // un canvas vide (0 nœud), rien d'autre ne montrerait que le clic a
          // été pris en compte.
          envRefresh.classList.add('bd-spinning');

          const attente = [_peuplerEnvironnements(envSelect ? envSelect.value : null)];
          if (window.ConfigSources) {
            window.ConfigSources.rafraichir();
            // Déclenche les appels Iconik NOUS-MÊMES plutôt que de dépendre
            // d'un panneau de config déjà ouvert (aps_search/update_meta) —
            // sinon Refresh sur un canvas vide ne fait littéralement rien,
            // et "snapshot" ne se peuple jamais.
            if (root._envSlug) {
              attente.push(window.ConfigSources.metadonnees(root._envSlug));
              attente.push(window.ConfigSources.vuesMetadonnees(root._envSlug));
              attente.push(window.ConfigSources.exportLocations(root._envSlug));
            }
          }
          // Redessine le panneau Config s'il y en a un ouvert (reflète tout
          // de suite les nouvelles suggestions).
          _majPanneauConfig();

          Promise.allSettled(attente).then(function () {
            envRefresh.classList.remove('bd-spinning');
          });
        });
      }

      // ── Auto-save : filet de sécurité contre la perte de config/édits ─────
      // Se déclenche après un court silence (debounce), UNIQUEMENT si le
      // workflow a déjà un nom (créé via un premier Save manuel, ou chargé).
      // Sans nom, impossible de sauvegarder silencieusement (name requis) —
      // le tout premier enregistrement reste manuel (demande le nom une fois).
      let autoSaveTimer = null;
      const AUTO_SAVE_DELAI = 1500;

      function _declencherAutoSave() {
        if (!flowId || !flowName) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
          const environment = envSelect ? envSelect.value : '';
          // TOUJOURS `modeleRacine`, jamais `model` (qui peut pointer sur un
          // corps de boucle ouvert) — `portee.flush()` réécrit d'abord tout
          // corps ouvert dans son étape Loop hôte, qui vit dans
          // `modeleRacine` ; sans ce flush, sauvegarder pendant qu'on édite
          // l'intérieur d'une boucle perdrait silencieusement ces édits.
          if (portee) portee.flush();
          WfPersistence.sauvegarder({
            id: flowId, name: flowName, model: modeleRacine, environment: environment,
            layoutsDeCorps: portee ? portee.layoutsDeCorps() : undefined
          })
            .then(function (res) {
              flowId = res.id; flowName = res.name;
              root.setAttribute('data-dirty', '0');
              if (errEl) errEl.hidden = true;
              _rafraichirStatut();
              _annoncerFlow();
            })
            .catch(function (e) {
              // Silencieux : pas d'alerte à chaque tentative auto, mais
              // l'indicateur "unsaved" reste allumé et l'erreur est logguée.
              console.error('Auto-save impossible :', e.message);
            });
        }, AUTO_SAVE_DELAI);
      }

      // Marque « unsaved » à tout changement structurel réel (pas pendant le
      // chargement programmatique initial, qui ne doit pas se déclarer sale),
      // et déclenche l'auto-save (filet de sécurité) — y compris pour un
      // édit fait À L'INTÉRIEUR d'un corps de boucle ouvert : `model` pointe
      // alors sur ce corps, et l'auto-save (plus bas) commence par
      // `portee.flush()`, qui le réécrit dans son étape Loop avant de
      // sérialiser. Réabonné à chaque changement de portée comme le reste.
      _reabonnable(function () {
        return model.onChange(function () {
          if (chargementEnCours) return;
          root.setAttribute('data-dirty', '1');
          _declencherAutoSave();
        });
      });

      // ── Statut brouillon/publié — informatif, pas un verrou ────────────────
      // « Publié » veut dire : le brouillon actuel EST la dernière version
      // figée (à la présentation près) — calculé côté serveur (GET
      // /builder-flows/:id), jamais stocké ici. Éditer et sauvegarder ne fait
      // jamais qu'écraser le brouillon ; la version figée (BuilderFlowVersion)
      // n'est, elle, jamais modifiée après coup — c'est ce qui protège la
      // production, pas un cadenas d'édition.
      const statutEl = root.querySelector('[data-role="statut"]');
      const publishBtn = root.querySelector('[data-role="publish-flow"]');

      function _majStatut(status, version) {
        if (!statutEl) return;
        statutEl.setAttribute('data-state', status || 'idle');
        statutEl.textContent = status === 'published' ? ('published · v' + version)
          : status === 'draft' ? 'draft' : '—';
      }

      function _rafraichirStatut() {
        if (!flowId) { _majStatut(null, null); return; }
        fetch('/api/builder-flows/' + encodeURIComponent(flowId))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (res) { if (res) _majStatut(res.status, res.publishedVersion); })
          .catch(function () { /* badge non critique : silencieux */ });
      }

      if (publishBtn) {
        publishBtn.addEventListener('click', function () {
          if (!flowId) { _afficherErreur('Enregistrer le workflow avant de publier.'); return; }
          fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/publish', { method: 'POST' })
            .then(function (r) {
              if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
              return r.json();
            })
            .then(function (res) {
              _majStatut('published', res.version);
              if (errEl) errEl.hidden = true;
            })
            .catch(function (e) { _afficherErreur('Erreur de publication : ' + e.message); });
        });
      }

      // ── Historique des versions (🕘) — restaurer ou supprimer une version
      // figée. Restaurer ne touche PAS le brouillon en base : ça recharge le
      // document de la version choisie DANS le canevas (comme un import), via
      // une commande annulable unique (Ctrl+Z défait tout d'un coup) — il faut
      // ensuite Save (et Publier si voulu) comme pour toute édition. Supprimer
      // retire juste la ligne d'historique ; n'affecte jamais le brouillon.
      const historyBtn = root.querySelector('[data-role="history-flow"]');
      let historyMenu = null;

      function _fermerHistoryMenu() {
        if (historyMenu && historyMenu.parentNode) historyMenu.parentNode.removeChild(historyMenu);
        historyMenu = null;
        document.removeEventListener('pointerdown', _surClicAilleursHistory, true);
        document.removeEventListener('keydown', _surEchapHistory, true);
      }
      function _surClicAilleursHistory(e) {
        if (historyMenu && !historyMenu.contains(e.target) && e.target !== historyBtn) _fermerHistoryMenu();
      }
      function _surEchapHistory(e) { if (e.key === 'Escape') _fermerHistoryMenu(); }

      // Ramène le canevas à la portée racine avant de manipuler modeleRacine —
      // restaurer une version DANS un corps de boucle ouvert n'aurait aucun
      // sens (le document restauré est toujours la racine complète).
      function _forcerPorteeRacine() {
        if (!portee) return;
        while (portee.profondeur() > 0) portee.sortir();
        _surChangementDePortee();
      }

      // Commande unique (undo/redo en un seul geste) : retire tous les nœuds
      // racine actuels, ajoute ceux du document restauré. Même primitives que
      // cmdSupprimerNoeuds/cmdAjouterNoeuds (wf-history.js), fusionnées pour
      // qu'un seul Ctrl+Z revienne à l'état d'avant restauration.
      function _cmdRestaurerDocument(document_) {
        const avant = {
          noeuds: model.noeuds().map(function (n) { return { id: n.id, etape: n.etape, x: n.x, y: n.y }; }),
          aretes: model.aretes().slice()
        };
        const apres = WfPersistence.initialDepuisDocument(document_);
        return {
          label: 'restore-version',
          faire: function () {
            avant.noeuds.forEach(function (n) { model.retirerNoeud(n.id); });
            apres.nodes.forEach(function (n) { model.ajouterNoeud(n); });
            apres.edges.forEach(function (e) { model.ajouterArete(e); });
          },
          defaire: function () {
            apres.edges.forEach(function (e) { model.retirerArete(e.id); });
            apres.nodes.forEach(function (n) { model.retirerNoeud(n.id); });
            avant.noeuds.forEach(function (n) { model.ajouterNoeud(n); });
            avant.aretes.forEach(function (e) { model.ajouterArete(e); });
          }
        };
      }

      function _restaurerVersion(version) {
        // Confirmation nécessaire : le canevas auto-sauve (cf. plus haut,
        // AUTO_SAVE_DELAI sur tout changement du modèle) — restaurer écrase
        // donc le brouillon en base en quelques secondes, silencieusement,
        // pas seulement à l'écran. Ctrl+Z reste possible juste après, mais
        // seulement si on réagit avant l'auto-save ou avant de quitter la
        // page (vécu en vérifiant cette fonctionnalité : restaurer v1 sur le
        // flux PUBLISH réel a réellement écrasé son brouillon en quelques
        // secondes, sans clic sur Save).
        if (!window.confirm('Restaurer v' + version + ' ? Le brouillon actuel de ce workflow sera remplacé (auto-enregistré en quelques secondes). Ctrl+Z annule juste après, si vous êtes encore sur cette page.')) return;
        fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/versions/' + version)
          .then(function (r) {
            if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
            return r.json();
          })
          .then(function (res) {
            // Une version figée n'a jamais de `presentation` (exclue avant
            // gel, cf. `_sansPresentation` côté serveur) : ni les positions
            // racine (repli en cascade dans initialDepuisDocument) ni les
            // bodyLayout des boucles ne sont dans le document restauré —
            // rien à importer, les corps de boucle repartiront sur leur
            // propre repli en cascade à la prochaine ouverture.
            _forcerPorteeRacine();
            history.executer(_cmdRestaurerDocument(res.document));
            root.setAttribute('data-dirty', '1');
            _centrerSurContenu();
            if (errEl) errEl.hidden = true;
          })
          .catch(function (e) { _afficherErreur('Erreur de restauration : ' + e.message); })
          .then(_fermerHistoryMenu);
      }

      function _supprimerVersion(version, estLaDerniere) {
        const msg = estLaDerniere
          ? 'Supprimer v' + version + ' ? C\'est la dernière version publiée : la version précédente (ou aucune) deviendra la référence pour le badge Published et le webhook Custom Action.'
          : 'Supprimer v' + version + ' ?';
        if (!window.confirm(msg)) return;
        fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/versions/' + version, { method: 'DELETE' })
          .then(function (r) {
            if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
            _rafraichirStatut();
            _ouvrirHistoryMenu();
          })
          .catch(function (e) { _afficherErreur('Erreur de suppression : ' + e.message); });
      }

      function _ouvrirHistoryMenu() {
        _fermerHistoryMenu();
        if (!flowId || !historyBtn) return;
        historyMenu = document.createElement('div');
        historyMenu.className = 'bd-ctx-menu bd-history-menu';
        const rect = historyBtn.getBoundingClientRect();
        historyMenu.style.setProperty('--cx', rect.left + 'px');
        historyMenu.style.setProperty('--cy', (rect.bottom + 4) + 'px');
        const titre = document.createElement('div');
        titre.className = 'bd-history-title';
        titre.textContent = 'Versions publiées';
        historyMenu.appendChild(titre);
        document.body.appendChild(historyMenu);
        document.addEventListener('pointerdown', _surClicAilleursHistory, true);
        document.addEventListener('keydown', _surEchapHistory, true);

        fetch('/api/builder-flows/' + encodeURIComponent(flowId) + '/versions')
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (versions) {
            if (!historyMenu) return; // fermé entre-temps
            if (!versions.length) {
              const vide = document.createElement('div');
              vide.className = 'bd-history-empty';
              vide.textContent = 'Aucune version publiée pour l\'instant.';
              historyMenu.appendChild(vide);
              return;
            }
            const derniere = versions[0].version; // liste triée desc côté serveur
            versions.forEach(function (v) {
              const row = document.createElement('div');
              row.className = 'bd-history-row';
              const label = document.createElement('span');
              label.className = 'bd-history-label';
              label.textContent = 'v' + v.version + ' · ' + new Date(v.createdAt).toLocaleString();
              row.appendChild(label);
              const restaurerBtn = document.createElement('button');
              restaurerBtn.type = 'button';
              restaurerBtn.className = 'bd-history-action';
              restaurerBtn.title = 'Restaurer dans le brouillon (canevas)';
              restaurerBtn.textContent = '↺';
              restaurerBtn.addEventListener('click', function () { _restaurerVersion(v.version); });
              row.appendChild(restaurerBtn);
              const supprimerBtn = document.createElement('button');
              supprimerBtn.type = 'button';
              supprimerBtn.className = 'bd-history-action bd-ctx-danger';
              supprimerBtn.title = 'Supprimer cette version';
              supprimerBtn.textContent = '🗑';
              supprimerBtn.addEventListener('click', function () { _supprimerVersion(v.version, v.version === derniere); });
              row.appendChild(supprimerBtn);
              historyMenu.appendChild(row);
            });
          })
          .catch(function (e) { _afficherErreur('Erreur de chargement des versions : ' + e.message); });
      }

      if (historyBtn) {
        historyBtn.addEventListener('click', function () {
          if (!flowId) { _afficherErreur('Enregistrer le workflow avant de consulter l\'historique.'); return; }
          if (historyMenu) { _fermerHistoryMenu(); } else { _ouvrirHistoryMenu(); }
        });
      }

      if (flowId) {
        chargementEnCours = true;
        WfPersistence.charger(flowId).then(function (res) {
          flowName = res.name;
          orgIdWorkflow = res.orgId || null;
          _afficherOrg(res.orgName);
          _majStatut(res.status, res.publishedVersion);
          const initial = WfPersistence.initialDepuisDocument(res.document);
          // `modeleRacine` explicitement (pas `model`) : au chargement, aucun
          // corps n'est encore ouvert, mais autant ne pas dépendre de cet
          // invariant temporel — un chargement doit toujours remplir la racine.
          initial.nodes.forEach(function (n) { modeleRacine.ajouterNoeud(n); });
          initial.edges.forEach(function (e) { modeleRacine.ajouterArete(e); });
          if (portee) portee.importerLayouts(initial.bodyLayout);
          _majEntete();
          _annoncerFlow();
          const envDejaChoisi = res.document && res.document.workflow && res.document.workflow.environment;
          return _peuplerEnvironnements(envDejaChoisi);
        }).catch(function (e) {
          console.error('Chargement du workflow impossible :', e.message);
        }).then(function () {
          root.setAttribute('data-dirty', '0');
          chargementEnCours = false;
        });
      } else {
        // Nouveau workflow (pas encore créé) : org du contexte global — c'est
        // elle qui l'accueillera à la première sauvegarde. Affichée en lecture
        // seule ici aussi (le canvas ne permet jamais de la changer).
        fetch('/api/context').then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (ctx) {
            orgIdWorkflow = (ctx && ctx.org && ctx.org.id) || null;
            _afficherOrg(ctx && ctx.org && ctx.org.name);
            _annoncerFlow();
            return _peuplerEnvironnements(null);
          }).catch(function () { _peuplerEnvironnements(null); });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          let name = flowName;
          if (!name) {
            name = window.prompt('Nom du workflow :', '');
            if (!name) return;
            flowName = name;
          }
          const environment = envSelect ? envSelect.value : '';
          if (portee) portee.flush();   // cf. auto-save : jamais perdre un corps en cours d'édition
          WfPersistence.sauvegarder({
            id: flowId, name: name, model: modeleRacine, environment: environment,
            layoutsDeCorps: portee ? portee.layoutsDeCorps() : undefined
          }).then(function (res) {
            flowId = res.id;
            flowName = res.name;
            window.history.replaceState(null, '', '?id=' + encodeURIComponent(flowId));
            _majEntete();
            root.setAttribute('data-dirty', '0');
            if (errEl) errEl.hidden = true;
            _rafraichirStatut();
            _annoncerFlow();
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

    // Tri alphabétique par LIBELLÉ affiché, pas par clé interne — c'est ce que
    // l'œil lit dans la palette, indépendamment de l'ordre du catalogue.
    function _parLibelle(a, b) {
      return a.localeCompare(b, 'fr', { sensitivity: 'base' });
    }

    const coreHost = root.querySelector('[data-role="palette-core"]');
    if (coreHost) {
      Object.keys(CAT.CORES)
        .sort(function (a, b) { return _parLibelle(NOM_CORE[a] || a, NOM_CORE[b] || b); })
        .forEach(function (c) {
          coreHost.appendChild(_node(GLYPHES_CORE[c] || '·', NOM_CORE[c] || c, null, { core: c }));
        });
    }

    const platHost = root.querySelector('[data-role="palette-platform"]');
    if (platHost) {
      // Étiquette de plateforme déduite du préfixe de la façade. Le Builder est
      // multi-plateformes : on montre TOUTES les façades, chacune taguée par sa
      // plateforme (badge visible dans la liste, sans avoir à glisser le nœud).
      const PLATEFORME = { iconik: 'Iconik', aws_s3: 'AWS', vodfactory: 'VodFactory', aps: 'APS' };
      function _nomFacade(f) {
        if (CAT.FACADES[f] && CAT.FACADES[f].nodeLabel) return CAT.FACADES[f].nodeLabel;
        return f.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
      }
      // `isService` (aps.registry) ne masque plus la palette — corrigé le 3
      // août : builder-etat.md prévoit explicitement qu'un service s'invoque
      // « soit en interne (Create Tree), soit par une façade dédiée » — le
      // masquage du 28 juillet ratait cette seconde clause. Confirmé par le
      // vrai flow de production : Générateur d'ID y est un nœud autonome
      // avec son propre déclencheur (Bayard ID ?), pas un mécanisme caché.
      Object.keys(CAT.FACADES)
        .sort(function (a, b) { return _parLibelle(_nomFacade(a), _nomFacade(b)); })
        .forEach(function (f) {
          const fa = CAT.FACADES[f];
          const prefixe = f.split('.')[0];
          const plateforme = PLATEFORME[prefixe] || prefixe;
          const el = _node('◆', _nomFacade(f), plateforme, { core: fa.core, facade: f });
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

})();
