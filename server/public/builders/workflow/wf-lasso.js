/**
 * wf-lasso.js — Sélection par encadrement (lasso)
 *
 * Module SEPARE (split). Glisser au clic gauche sur le vide trace un rectangle ;
 * au relâchement, les nœuds ENTIÈREMENT contenus dans le rectangle sont
 * sélectionnés. Ctrl/Cmd maintenu AJOUTE à la sélection existante (sinon
 * remplace).
 *
 * On travaille en coordonnées ÉCRAN : le rectangle du lasso et les rectangles
 * des nœuds (getBoundingClientRect) sont dans le même repère, ce qui évite
 * toute conversion pan/zoom — un nœud est « dedans » si son rect écran est
 * inclus dans le rect écran du lasso. Robuste quel que soit le zoom.
 *
 * Le rectangle visuel est un élément dédié dans le cadre, positionné par des
 * variables CSS (données, pas d'apparence en dur).
 */

const WfLasso = (() => {

  function brancher(ctx) {
    const { frame, nodesHost, selection } = ctx;
    if (!frame || !nodesHost || !selection) return function () {};

    // Élément visuel du lasso (créé une fois, montré via classe).
    const boite = document.createElement('div');
    boite.className = 'cnv-lasso';
    frame.appendChild(boite);

    let actif = false;
    let origine = null;   // { x, y } en repère écran
    let additif = false;

    function _rectEcran(ax, ay, bx, by) {
      return { left: Math.min(ax, bx), top: Math.min(ay, by),
               right: Math.max(ax, bx), bottom: Math.max(ay, by) };
    }

    function _placerBoite(r) {
      const rf = frame.getBoundingClientRect();
      boite.style.setProperty('--lx', (r.left - rf.left) + 'px');
      boite.style.setProperty('--ly', (r.top - rf.top) + 'px');
      boite.style.setProperty('--lw', (r.right - r.left) + 'px');
      boite.style.setProperty('--lh', (r.bottom - r.top) + 'px');
    }

    function onDown(e) {
      if (e.button !== 0) return;
      // Lasso seulement sur le vide (le cadre ou la surface), pas sur un nœud.
      const surSurface = e.target === frame || e.target.classList.contains('cnv-surface');
      if (!surSurface) return;
      actif = true;
      additif = e.ctrlKey || e.metaKey;
      origine = { x: e.clientX, y: e.clientY };
      _placerBoite(_rectEcran(origine.x, origine.y, origine.x, origine.y));
      frame.classList.add('cnv-lassoing');
      frame.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      if (!actif) return;
      _placerBoite(_rectEcran(origine.x, origine.y, e.clientX, e.clientY));
    }

    function onUp(e) {
      if (!actif) return;
      actif = false;
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
      frame.classList.remove('cnv-lassoing');

      const r = _rectEcran(origine.x, origine.y, e.clientX, e.clientY);
      // Un lasso trop petit = simple clic sur le vide : vide la sélection
      // (sauf si Ctrl, où l'on préserve la sélection existante).
      if ((r.right - r.left) < 4 && (r.bottom - r.top) < 4) {
        if (!additif) selection.vider();
        return;
      }

      if (!additif) selection.selectionner(null);
      nodesHost.querySelectorAll('.bd-node-canvas').forEach(function (el) {
        const nr = el.getBoundingClientRect();
        const dedans = nr.left >= r.left && nr.right <= r.right &&
                       nr.top >= r.top && nr.bottom <= r.bottom;
        if (dedans) selection.ajouter(el.getAttribute('data-step-id'));
      });
    }

    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerup', onUp);

    return function debrancher() {
      frame.removeEventListener('pointerdown', onDown);
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerup', onUp);
      if (boite.parentNode) boite.parentNode.removeChild(boite);
    };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfLasso = WfLasso;
if (typeof module !== 'undefined') module.exports = WfLasso;
