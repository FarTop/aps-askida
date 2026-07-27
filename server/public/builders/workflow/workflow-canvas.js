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

  appliquer();

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
