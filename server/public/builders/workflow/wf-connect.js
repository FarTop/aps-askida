/**
 * wf-connect.js — Créer une liaison en tirant d'un port à l'autre
 *
 * Module SEPARE (split). On tire depuis un port de SORTIE (à droite d'un nœud)
 * vers un port d'ENTRÉE (à gauche d'un autre). Pendant le tirage, une ligne
 * provisoire suit le curseur ; la cible valide s'illumine. Au relâchement sur
 * une entrée valide, l'arête est créée via commande annulable (cmdAjouterArete).
 *
 * IMPLEMENTATION alignée sur le designer WFD, qui a résolu ce problème avant
 * nous (script-workflow-designer.js, setupPortDrag) :
 *   — souris classique (mousedown/mousemove/mouseup), PAS de pointer capture.
 *     La capture de pointeur fige elementFromPoint sur l'élément capteur au
 *     relâchement — c'est ce qui empêchait l'ancrage. Sans capture, le
 *     problème disparaît.
 *   — document.elementsFromPoint (PLURIEL) + recherche : on prend toute la pile
 *     sous le curseur et on cherche le port d'entrée, ce qui traverse la ligne
 *     provisoire ou tout élément au-dessus.
 *   — highlight par survol (mouseover/mouseout) sur le port.
 *
 * Sens : sortie -> entrée uniquement. Garde-fous minimaux : pas de nœud vers
 * lui-même, pas de doublon strict. Convergence et règles fines de validité
 * pivot TOLERÉES au tracé, validées au niveau workflow plus tard.
 */

const WfConnect = (() => {

  const SVGNS = 'http://www.w3.org/2000/svg';

  function brancher(ctx) {
    const nodesHost = ctx.nodesHost, svgEdges = ctx.svgEdges, surface = ctx.surface;
    const model = ctx.model, history = ctx.history, view = ctx.view;
    if (!nodesHost || !svgEdges || !surface || !model || !history) return function () {};

    let drag = null;   // { fromStep, fromPort, x1, y1, ghost }

    function _echelle() { return (view && view.zoom) ? view.zoom : 1; }

    function _centrePastilleSurface(dot) {
      const rs = surface.getBoundingClientRect();
      const s = _echelle();
      const r = dot.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - rs.left) / s,
               y: (r.top + r.height / 2 - rs.top) / s };
    }

    function _pointSurface(cx, cy) {
      const rs = surface.getBoundingClientRect();
      const s = _echelle();
      return { x: (cx - rs.left) / s, y: (cy - rs.top) / s };
    }

    // Highlight des entrées valides pendant le drag (survol).
    nodesHost.addEventListener('mouseover', function (e) {
      if (!drag) return;
      const pin = e.target.closest ? e.target.closest('.nc-pin') : null;
      if (!pin) return;
      const nodeEl = pin.closest('.bd-node-canvas');
      if (nodeEl && nodeEl.getAttribute('data-step-id') !== drag.fromStep) {
        pin.classList.add('nc-pin-cible');
      }
    });
    nodesHost.addEventListener('mouseout', function (e) {
      const pin = e.target.closest ? e.target.closest('.nc-pin') : null;
      if (pin) pin.classList.remove('nc-pin-cible');
    });

    function _clearHighlight() {
      nodesHost.querySelectorAll('.nc-pin-cible').forEach(function (el) {
        el.classList.remove('nc-pin-cible');
      });
    }

    function onDown(e) {
      if (e.button !== 0) return;
      const pout = e.target.closest ? e.target.closest('.nc-pout') : null;
      if (!pout) return;
      const nodeEl = pout.closest('.bd-node-canvas');
      if (!nodeEl) return;
      e.stopPropagation();   // ne pas déclencher le déplacement du nœud ni le pan

      const dot = pout.querySelector('.nc-dot');
      const p = _centrePastilleSurface(dot);
      const ghost = document.createElementNS(SVGNS, 'path');
      ghost.setAttribute('class', 'cnv-edge-draft');
      ghost.setAttribute('fill', 'none');
      ghost.setAttribute('stroke-width', '2');
      svgEdges.appendChild(ghost);

      drag = {
        fromStep: nodeEl.getAttribute('data-step-id'),
        fromPort: pout.getAttribute('data-port'),
        x1: p.x, y1: p.y, ghost: ghost
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function onMove(e) {
      if (!drag) return;
      const m = _pointSurface(e.clientX, e.clientY);
      const dx = Math.abs(m.x - drag.x1) * 0.5;
      drag.ghost.setAttribute('d',
        'M' + drag.x1 + ',' + drag.y1 +
        ' C' + (drag.x1 + dx) + ',' + drag.y1 + ' ' + (m.x - dx) + ',' + m.y + ' ' + m.x + ',' + m.y);
    }

    function onUp(e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const d = drag; drag = null;
      _clearHighlight();
      if (d && d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      if (!d) return;

      // Pile d'éléments sous le curseur (traverse la ligne ghost).
      const pile = document.elementsFromPoint(e.clientX, e.clientY);
      let pin = null;
      for (let i = 0; i < pile.length; i++) {
        const c = pile[i].closest ? pile[i].closest('.nc-pin') : null;
        if (c) { pin = c; break; }
      }
      if (!pin) return;
      const nodeEl = pin.closest('.bd-node-canvas');
      if (!nodeEl) return;
      const toStep = nodeEl.getAttribute('data-step-id');
      if (toStep === d.fromStep) return;   // pas vers soi-même

      const existe = model.aretes().some(function (a) {
        return a.from.step === d.fromStep && a.from.port === d.fromPort && a.to.step === toStep;
      });
      if (existe) return;

      history.executer(history.cmdAjouterArete({
        from: { step: d.fromStep, port: d.fromPort },
        to: { step: toStep }
      }));
    }

    nodesHost.addEventListener('mousedown', onDown);
    return function debrancher() { nodesHost.removeEventListener('mousedown', onDown); };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfConnect = WfConnect;
if (typeof module !== 'undefined') module.exports = WfConnect;
