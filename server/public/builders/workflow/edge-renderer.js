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
  function _centrePort(surface, nodeEl, role) {
    const sel = role === 'in' ? '[data-port="in"]' : '[data-port="' + role + '"]';
    const port = nodeEl.querySelector('.nc-ports ' + sel);
    if (!port) return null;
    const dot = port.querySelector('.nc-dot');
    if (!dot) return null;
    const rs = surface.getBoundingClientRect();
    const rd = dot.getBoundingClientRect();
    return { x: rd.left + rd.width / 2 - rs.left, y: rd.top + rd.height / 2 - rs.top };
  }

  // Chemin orthogonal à coins arrondis. Sort à droite (a), rentre à gauche (b).
  function _chemin(a, b) {
    const ax = a.x + STUB;
    const bx = b.x - STUB;
    let midX = (ax + bx) / 2;
    if (bx <= ax + 2) midX = ax + 40;   // cible proche/à gauche : on déborde à droite

    const dy = b.y - a.y;
    if (Math.abs(dy) < 2) return 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;

    const r = Math.min(RAYON, Math.abs(dy) / 2,
                       Math.max(2, Math.abs(midX - ax)), Math.max(2, Math.abs(bx - midX)));
    const dir = dy > 0 ? 1 : -1;

    return 'M ' + a.x + ' ' + a.y +
           ' L ' + ax + ' ' + a.y +
           ' L ' + (midX - r) + ' ' + a.y +
           ' Q ' + midX + ' ' + a.y + ' ' + midX + ' ' + (a.y + r * dir) +
           ' L ' + midX + ' ' + (b.y - r * dir) +
           ' Q ' + midX + ' ' + b.y + ' ' + (midX + r) + ' ' + b.y +
           ' L ' + bx + ' ' + b.y +
           ' L ' + b.x + ' ' + b.y;
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
  function tracer(svg, nodesHost, surface, edges) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    (edges || []).forEach(function (arete) {
      const src = nodesHost.querySelector('[data-step-id="' + arete.from.step + '"]');
      const dst = nodesHost.querySelector('[data-step-id="' + arete.to.step + '"]');
      if (!src || !dst) return;

      const a = _centrePort(surface, src, arete.from.port);
      const b = _centrePort(surface, dst, 'in');
      if (!a || !b) return;

      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', _chemin(a, b));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke', _couleurPort(src, arete.from.port));
      path.setAttribute('data-edge', arete.from.step + ':' + arete.from.port + '->' + arete.to.step);
      svg.appendChild(path);
    });
  }

  return { tracer, render: tracer };

})();

if (typeof window !== 'undefined') window.EdgeRenderer = EdgeRenderer;
if (typeof module !== 'undefined') module.exports = EdgeRenderer;
