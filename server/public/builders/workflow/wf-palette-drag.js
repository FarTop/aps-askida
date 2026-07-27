/**
 * wf-palette-drag.js — Glisser un nœud depuis la palette vers le canevas
 *
 * Module SEPARE (split). Saisir une entrée de palette, la glisser, la déposer
 * sur le canevas : une nouvelle étape pivot de ce type est créée à la position
 * du curseur, via une COMMANDE annulable (cmdAjouterNoeuds). Donc Ctrl+Z annule
 * un dépôt dès le départ — bénéfice de la fondation.
 *
 * On utilise les pointer events (pas le drag-and-drop HTML5) pour maîtriser le
 * FANTÔME qui suit le curseur pendant le glisser. Le fantôme est un élément
 * léger positionné par variables CSS (données, pas d'apparence en dur).
 */

const WfPaletteDrag = (() => {

  let seq = 0;
  function _nouvelId(base) { return (base || 'node') + '-' + Date.now().toString(36) + '-' + (++seq); }

  function brancher(ctx) {
    const { paletteRoot, frame, surface, model, history, selection, view } = ctx;
    if (!paletteRoot || !frame || !surface || !model || !history) return function () {};

    let drag = null;   // { core, facade, label, fantome }

    // Fantôme suivant le curseur (créé à la volée, retiré au dépôt).
    function _creerFantome(label, x, y) {
      const f = document.createElement('div');
      f.className = 'bd-drag-ghost';
      f.textContent = label;
      f.style.setProperty('--gx', x + 'px');
      f.style.setProperty('--gy', y + 'px');
      document.body.appendChild(f);
      return f;
    }

    function onDown(e) {
      if (e.button !== 0) return;
      const entree = e.target.closest('.bd-node[data-palette-node="1"]');
      if (!entree || !paletteRoot.contains(entree)) return;
      const core = entree.getAttribute('data-core');
      if (!core) return;
      e.preventDefault();
      drag = {
        core: core,
        facade: entree.getAttribute('data-facade') || null,
        label: entree.getAttribute('data-label') || core,
        fantome: null,
        pointerId: e.pointerId
      };
      // Capture sur le document pour suivre le curseur partout.
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    }

    function onMove(e) {
      if (!drag) return;
      if (!drag.fantome) drag.fantome = _creerFantome(drag.label, e.clientX + 12, e.clientY + 12);
      else {
        drag.fantome.style.setProperty('--gx', (e.clientX + 12) + 'px');
        drag.fantome.style.setProperty('--gy', (e.clientY + 12) + 'px');
      }
      // Survol du canevas : léger repère.
      const surCanevas = _estSurCanevas(e.clientX, e.clientY);
      frame.classList.toggle('bd-drop-target', surCanevas);
    }

    function onUp(e) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const d = drag; drag = null;
      frame.classList.remove('bd-drop-target');
      if (d && d.fantome && d.fantome.parentNode) d.fantome.parentNode.removeChild(d.fantome);
      if (!d) return;
      if (!_estSurCanevas(e.clientX, e.clientY)) return;   // déposé hors canevas : rien

      // Position écran -> coordonnées de surface (tient compte du pan/zoom).
      const pos = _versSurface(e.clientX, e.clientY);
      const id = _nouvelId(d.core);
      const etape = { id: id, core: d.core, label: d.label, params: {} };
      if (d.facade) etape.facade = d.facade;
      const noeud = { id: id, etape: etape, x: pos.x, y: pos.y };

      history.executer(history.cmdAjouterNoeuds([noeud], []));
      if (selection) { selection.selectionner(id); }
    }

    function _estSurCanevas(cx, cy) {
      const r = frame.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }

    // Convertit un point écran en coordonnées de surface, en inversant le
    // pan/zoom appliqué à la surface (view.x, view.y, view.zoom).
    function _versSurface(cx, cy) {
      const r = frame.getBoundingClientRect();
      const z = (view && view.zoom) ? view.zoom : 1;
      const vx = (view && view.x) || 0;
      const vy = (view && view.y) || 0;
      // On centre approximativement le nœud sous le curseur (demi-largeur).
      return {
        x: (cx - r.left - vx) / z - 115,
        y: (cy - r.top - vy) / z - 20
      };
    }

    paletteRoot.addEventListener('pointerdown', onDown);
    return function debrancher() { paletteRoot.removeEventListener('pointerdown', onDown); };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfPaletteDrag = WfPaletteDrag;
if (typeof module !== 'undefined') module.exports = WfPaletteDrag;
