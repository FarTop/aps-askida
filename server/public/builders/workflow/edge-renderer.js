/**
 * edge-renderer.js — Tracé des liaisons entre nœuds du canevas
 *
 * Module DÉDIÉ (split, comme node-renderer). Il ne sait QUE tracer des arêtes :
 * il ignore le rendu des nœuds, le pan/zoom, les volets. Il lit la géométrie
 * réelle des ports dans le DOM (les nœuds sont déjà rendus) et dessine dans la
 * couche SVG `cnv-edges`, SOUS les nœuds.
 *
 * Principes décidés (session du 17 juillet, confirmés) :
 *   — routage ORTHOGONAL : la ligne sort à droite de la pastille source (stub),
 *     bascule à une abscisse médiane par un aiguillage vertical à coins
 *     ARRONDIS, puis rentre par la gauche de la cible (stub). Jamais une
 *     verticale qui traverse un nœud.
 *   — couleur du PORT DE DÉPART : une arête reprend la couleur de sa sortie
 *     (vert « Succès », rouge « Erreur »). La couleur fait partie de la lecture
 *     — suivre le chemin d'échec d'un coup d'œil.
 *   — cas simple gauche→droite d'abord ; le contournement fin (retours de
 *     boucle) viendra avec l'auto-layout.
 */

const EdgeRenderer = (() => {

  const SVGNS = 'http://www.w3.org/2000/svg';
  const STUB = 22;    // longueur du départ/arrivée horizontal
  const RAYON = 14;   // rayon des coins arrondis

  // Centre d'une pastille de port, en repère de la surface du canevas.
  // `role` = 'in' pour l'entrée, sinon l'id du port de sortie.
  // Facteur d'échelle de la surface (transform: scale). Le diagnostic a montré
  // que la surface est position:absolute sans largeur -> offsetWidth = 0, donc
  // impossible de déduire l'échelle par la largeur. Le zoom est en revanche
  // fiable dans la variable CSS --bd-zoom (posée par le pan/zoom) : c'est elle
  // qu'on lit. Sans correction, les coordonnées écran (getBoundingClientRect,
  // déjà scalées) sont placées dans un SVG lui aussi scalé -> double application
  // du zoom, tracé en vrille.
  function _echelle() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bd-zoom');
    const z = parseFloat(v);
    return (z && z > 0) ? z : 1;
  }

  function _centrePort(surface, nodeEl, role) {
    const sel = role === 'in' ? '[data-port="in"]' : '[data-port="' + role + '"]';
    const port = nodeEl.querySelector('.nc-ports ' + sel);
    if (!port) return null;
    const dot = port.querySelector('.nc-dot');
    if (!dot) return null;
    const rs = surface.getBoundingClientRect();
    const rd = dot.getBoundingClientRect();
    const s = _echelle();
    return { x: (rd.left + rd.width / 2 - rs.left) / s, y: (rd.top + rd.height / 2 - rs.top) / s };
  }

  // Rect d'un nœud en coordonnées de surface (même convention que _centrePort).
  function _boite(surface, nodeEl) {
    const rs = surface.getBoundingClientRect();
    const rn = nodeEl.getBoundingClientRect();
    const s = _echelle();
    return {
      left: (rn.left - rs.left) / s, right: (rn.right - rs.left) / s,
      top: (rn.top - rs.top) / s, bottom: (rn.bottom - rs.top) / s
    };
  }

  // Construit un chemin orthogonal à coins arrondis à partir d'une liste de
  // points (waypoints). Chaque coin est adouci par un quart de cercle de rayon
  // borné par les segments adjacents. Générique : gère autant de coudes qu'il
  // faut, donc le cas simple comme le contournement en U.
  function _cheminArrondi(pts) {
    if (pts.length < 2) return '';
    let d = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const r = Math.min(RAYON, l1 / 2, l2 / 2);
      // Point d'entrée du virage (sur le segment p0->p1) et de sortie (p1->p2).
      const e1 = { x: p1.x - (p1.x - p0.x) / (l1 || 1) * r, y: p1.y - (p1.y - p0.y) / (l1 || 1) * r };
      const s1 = { x: p1.x + (p2.x - p1.x) / (l2 || 1) * r, y: p1.y + (p2.y - p1.y) / (l2 || 1) * r };
      d += ' L ' + e1.x + ' ' + e1.y + ' Q ' + p1.x + ' ' + p1.y + ' ' + s1.x + ' ' + s1.y;
    }
    const last = pts[pts.length - 1];
    d += ' L ' + last.x + ' ' + last.y;
    return d;
  }

  // Chemin orthogonal. Sort à droite de a, rentre par la gauche de b. Si la
  // cible est DEVANT (b à droite), aiguillage simple à mi-chemin. Si elle est
  // EN ARRIERE (b à gauche/derrière), contournement en U : on déborde à droite
  // de la source, on passe au-dessus/dessous des nœuds, on revient à gauche de
  // la cible — jamais de trait qui traverse un nœud.
  function _chemin(a, b, boiteSrc, boiteDst) {
    const ax = a.x + STUB;         // après le stub de sortie
    const bx = b.x - STUB;         // avant le stub d'entrée

    // Cas simple : cible devant, avec de la place pour l'aiguillage.
    if (bx > ax + 4) {
      if (Math.abs(b.y - a.y) < 2) return 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
      const midX = (ax + bx) / 2;
      return _cheminArrondi([
        { x: a.x, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: b.x, y: b.y }
      ]);
    }

    // Cas contournement : la cible est en arrière. On déborde à droite de la
    // source, on file à une hauteur de contournement (au-dessus des deux nœuds
    // si la cible est plus bas, sinon en-dessous), on revient à gauche de la
    // cible, puis on rentre.
    const MARGE = 28;
    const droite = Math.max(boiteSrc ? boiteSrc.right : ax, a.x) + MARGE;
    const gauche = Math.min(boiteDst ? boiteDst.left : bx, b.x) - MARGE;
    // Hauteur de contournement : au-dessus des deux nœuds.
    const hautSrc = boiteSrc ? boiteSrc.top : a.y;
    const hautDst = boiteDst ? boiteDst.top : b.y;
    const basSrc = boiteSrc ? boiteSrc.bottom : a.y;
    const basDst = boiteDst ? boiteDst.bottom : b.y;
    // On contourne du côté le plus court : par le haut si la cible entre par le
    // haut, sinon par le bas. Choix simple : par le bas des deux nœuds.
    const y = Math.max(basSrc, basDst) + MARGE;

    return _cheminArrondi([
      { x: a.x, y: a.y },
      { x: droite, y: a.y },
      { x: droite, y: y },
      { x: gauche, y: y },
      { x: gauche, y: b.y },
      { x: b.x, y: b.y }
    ]);
  }

  // Couleur d'un port de sortie, lue sur sa pastille (posée par node-renderer).
  function _couleurPort(nodeEl, portId) {
    const port = nodeEl.querySelector('.nc-ports [data-port="' + portId + '"] .nc-dot');
    if (!port) return '#95a5a6';
    const c = port.style.getPropertyValue('--port-color');
    return c || '#95a5a6';
  }

  /**
   * Trace toutes les arêtes d'un pivot dans la couche SVG.
   * @param {SVGElement} svg    la couche .cnv-edges
   * @param {HTMLElement} nodesHost  le conteneur .cnv-nodes (pour trouver les nœuds)
   * @param {HTMLElement} surface    le repère (.cnv-surface)
   * @param {Array} edges  arêtes pivot [{ from:{step,port}, to:{step} }]
   */
  function tracer(svg, nodesHost, surface, edges, selectionnees) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const sel = selectionnees || [];

    (edges || []).forEach(function (arete) {
      const src = nodesHost.querySelector('[data-step-id="' + arete.from.step + '"]');
      const dst = nodesHost.querySelector('[data-step-id="' + arete.to.step + '"]');
      if (!src || !dst) return;

      const a = _centrePort(surface, src, arete.from.port);
      const b = _centrePort(surface, dst, 'in');
      if (!a || !b) return;

      const d = _chemin(a, b, _boite(surface, src), _boite(surface, dst));
      const couleur = _couleurPort(src, arete.from.port);
      const estSel = arete.id && sel.indexOf(arete.id) >= 0;

      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-edge-id', arete.id || '');
      g.setAttribute('class', 'cnv-edge' + (estSel ? ' cnv-edge-selected' : ''));

      // Zone de clic ELARGIE : trait transparent épais, facile à attraper
      // (une arête fine est difficile à cliquer). Porte les événements.
      const hit = document.createElementNS(SVGNS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.setAttribute('class', 'cnv-edge-hit');
      g.appendChild(hit);

      // Trait visible, coloré par le port de départ.
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', estSel ? '3' : '2');
      path.setAttribute('stroke', couleur);
      path.setAttribute('class', 'cnv-edge-line');
      g.appendChild(path);

      svg.appendChild(g);
    });
  }

  return { tracer, render: tracer };

})();

if (typeof window !== 'undefined') window.EdgeRenderer = EdgeRenderer;
if (typeof module !== 'undefined') module.exports = EdgeRenderer;
