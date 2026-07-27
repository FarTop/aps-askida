/**
 * wf-connect.js — Créer une liaison en tirant d'un port à l'autre
 *
 * Module SEPARE (split). On tire depuis un port de SORTIE (à droite d'un nœud)
 * vers un port d'ENTRÉE (à gauche d'un autre). Pendant le tirage, une ligne
 * provisoire suit le curseur ; la cible valide s'illumine. Au relâchement sur
 * une entrée valide, l'arête est créée via commande annulable (cmdAjouterArete).
 *
 * Sens : sortie -> entrée uniquement (sens du flux). Garde-fous minimaux :
 * pas de nœud vers lui-même, pas d'entrée->entrée. La convergence et les règles
 * fines de validité pivot sont TOLERÉES au tracé, validées au niveau workflow
 * plus tard (on ne bloque pas l'exploration).
 */

const WfConnect = (() => {

  const SVGNS = 'http://www.w3.org/2000/svg';

  function brancher(ctx) {
    const { nodesHost, svgEdges, surface, frame, model, history } = ctx;
    if (!nodesHost || !svgEdges || !surface || !model || !history) return function () {};

    let lien = null;   // { fromStep, fromPort, a:{x,y}, ligne }

    function _centrePastille(pastille) {
      const rs = surface.getBoundingClientRect();
      const r = pastille.getBoundingClientRect();
      return { x: r.left + r.width / 2 - rs.left, y: r.top + r.height / 2 - rs.top };
    }

    function _ligneProvisoire() {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('class', 'cnv-edge-draft');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-width', '2');
      svgEdges.appendChild(p);
      return p;
    }

    function onDown(e) {
      if (e.button !== 0) return;
      // On ne démarre une connexion que depuis une pastille de SORTIE.
      const pout = e.target.closest('.nc-pout');
      if (!pout) return;
      const nodeEl = pout.closest('.bd-node-canvas');
      if (!nodeEl) return;
      e.stopPropagation();   // ne pas déclencher le déplacement du nœud
      const dot = pout.querySelector('.nc-dot');
      lien = {
        fromStep: nodeEl.getAttribute('data-step-id'),
        fromPort: pout.getAttribute('data-port'),
        a: _centrePastille(dot),
        ligne: _ligneProvisoire()
      };
      nodesHost.setPointerCapture(e.pointerId);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    }

    function _pointSurface(cx, cy) {
      const rs = surface.getBoundingClientRect();
      // La surface est mise à l'échelle : on divise par le ratio réel.
      const scale = surface.getBoundingClientRect().width / surface.offsetWidth || 1;
      return { x: (cx - rs.left) / scale, y: (cy - rs.top) / scale };
    }

    function onMove(e) {
      if (!lien) return;
      const b = _pointSurface(e.clientX, e.clientY);
      // Courbe simple provisoire (droite douce) de la sortie vers le curseur.
      lien.ligne.setAttribute('d', 'M ' + lien.a.x + ' ' + lien.a.y + ' L ' + b.x + ' ' + b.y);

      // Illumine une entrée valide sous le curseur.
      _clearHighlight();
      const cible = _entreeSous(e.target);
      if (cible && _valide(cible.step)) cible.pin.classList.add('nc-pin-cible');
    }

    function _entreeSous(target) {
      const pin = target && target.closest ? target.closest('.nc-pin') : null;
      if (!pin) return null;
      const nodeEl = pin.closest('.bd-node-canvas');
      if (!nodeEl) return null;
      return { pin: pin, step: nodeEl.getAttribute('data-step-id') };
    }

    function _valide(stepCible) {
      if (!lien) return false;
      if (stepCible === lien.fromStep) return false;   // pas vers soi-même
      return true;
    }

    function _clearHighlight() {
      nodesHost.querySelectorAll('.nc-pin-cible').forEach(function (el) {
        el.classList.remove('nc-pin-cible');
      });
    }

    function onUp(e) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const l = lien; lien = null;
      _clearHighlight();
      if (l && l.ligne && l.ligne.parentNode) l.ligne.parentNode.removeChild(l.ligne);
      if (!l) return;

      const cible = _entreeSous(e.target);
      if (!cible || !_valide(cible.step)) return;   // lâché ailleurs : rien

      history.executer(history.cmdAjouterArete({
        from: { step: l.fromStep, port: l.fromPort },
        to: { step: cible.step }
      }));
    }

    nodesHost.addEventListener('pointerdown', onDown);
    return function debrancher() { nodesHost.removeEventListener('pointerdown', onDown); };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfConnect = WfConnect;
if (typeof module !== 'undefined') module.exports = WfConnect;
