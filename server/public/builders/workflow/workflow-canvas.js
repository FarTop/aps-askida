/* workflow-canvas.js — Mécanique de la charpente du canevas
 *
 * Ce fichier ne pose QUE la mécanique de structure :
 *   — redimensionner un panneau en tirant sa poignée, borné min/max ;
 *   — déplacer et zoomer la surface du canevas.
 * Aucun rendu de nœud, aucune apparence : ça viendra en phase UI.
 *
 * Deux règles de la consolidation, tenues à la lettre :
 *   — zéro gestionnaire inline : tout se câble ici par addEventListener ;
 *   — zéro style.display / style.* en dur : l'état passe par les tokens CSS
 *     (variables) ou par des classes, jamais par une écriture de style directe.
 */

(function () {
  'use strict';

  const shell = document.querySelector('.bd-shell');
  if (!shell) return;

  const styles = getComputedStyle(document.documentElement);
  const px = (v) => parseInt(v, 10) || 0;
  const MIN = px(styles.getPropertyValue('--bd-panel-min'));
  const MAX = px(styles.getPropertyValue('--bd-panel-max'));

  // ── Redimensionnement des panneaux ────────────────────────────────────────
  // Tirer une poignée modifie le token de largeur du panneau concerné, borné
  // entre MIN et MAX. La grille absorbe la variation ; le canevas (1fr) se
  // recalcule seul, et la surface transformable ne bouge pas — donc aucun nœud
  // ne se décale.

  const TOKEN = { left: '--bd-left-width', right: '--bd-right-width' };

  function installResize(gutter) {
    const side = gutter.getAttribute('data-resize');
    if (!TOKEN[side]) return;

    let startX = 0;
    let startW = 0;

    function largeurCourante() {
      return px(getComputedStyle(document.documentElement).getPropertyValue(TOKEN[side]));
    }

    function poser(w) {
      const borne = Math.max(MIN, Math.min(MAX, w));
      document.documentElement.style.setProperty(TOKEN[side], borne + 'px');
    }

    function onMove(e) {
      const dx = e.clientX - startX;
      // La poignée gauche grandit vers la droite, la droite vers la gauche.
      poser(side === 'left' ? startW + dx : startW - dx);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      shell.classList.remove('bd-resizing');
    }

    gutter.addEventListener('pointerdown', function (e) {
      startX = e.clientX;
      startW = largeurCourante();
      shell.classList.add('bd-resizing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });

    // Accessibilité : flèches au clavier quand la poignée a le focus.
    gutter.addEventListener('keydown', function (e) {
      const pas = e.shiftKey ? 32 : 8;
      if (e.key === 'ArrowLeft')  { poser(largeurCourante() + (side === 'left' ? -pas : pas)); e.preventDefault(); }
      if (e.key === 'ArrowRight') { poser(largeurCourante() + (side === 'left' ? pas : -pas)); e.preventDefault(); }
    });
  }

  shell.querySelectorAll('.bd-gutter').forEach(installResize);

  // ── Pan / zoom de la surface ──────────────────────────────────────────────
  // La transformation vit dans la surface, posée via variables CSS. Le cadre ne
  // se transforme jamais : c'est ce qui garde les coordonnées des nœuds
  // indépendantes de la taille de la fenêtre.

  const frame = shell.querySelector('.cnv-frame');
  const surface = shell.querySelector('.cnv-surface');
  if (!frame || !surface) return;

  const view = { x: 0, y: 0, zoom: 1 };
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 3;

  function appliquer() {
    const root = document.documentElement.style;
    root.setProperty('--bd-pan-x', view.x + 'px');
    root.setProperty('--bd-pan-y', view.y + 'px');
    root.setProperty('--bd-zoom', String(view.zoom));
  }

  // Molette : zoom centré sur le pointeur (le point sous le curseur reste fixe).
  frame.addEventListener('wheel', function (e) {
    e.preventDefault();
    const rect = frame.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const facteur = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * facteur));
    const ratio = z / view.zoom;
    // Recentre pour que le point sous le curseur ne bouge pas.
    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.zoom = z;
    appliquer();
  }, { passive: false });

  // Glisser le fond (bouton du milieu, ou fond vide) déplace la vue.
  let panning = false;
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

  frame.addEventListener('pointerdown', function (e) {
    // Seul le fond déclenche le pan ; un nœud (plus tard) arrêtera la propagation.
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

  appliquer();

})();
