/**
 * wf-context-menu.js — Menu contextuel au clic droit sur un nœud
 *
 * Module SEPARE (split). Clic droit sur un nœud ouvre un menu d'actions ;
 * le pan reste sur le vide (comme WFD). Les actions opèrent sur la SELECTION
 * courante (un clic droit sélectionne le nœud visé s'il ne l'est pas déjà),
 * via les commandes annulables existantes.
 *
 * Entrées de ce premier menu, honnêtes (rien de mort) : Dupliquer, Copier,
 * Supprimer. Il grandira quand Config (Configurer) et Custom (Promouvoir en
 * palette) seront câblés, et pour « Collecter depuis… » (liaisons en masse).
 */

const WfContextMenu = (() => {

  function brancher(ctx) {
    const { root, nodesHost, model, history, selection, clipboard } = ctx;
    if (!root || !nodesHost || !history || !selection) return function () {};

    let menu = null;

    function _fermer() {
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
      menu = null;
      document.removeEventListener('pointerdown', _surClicAilleurs, true);
      document.removeEventListener('keydown', _surEchap, true);
    }

    function _surClicAilleurs(e) {
      if (menu && !menu.contains(e.target)) _fermer();
    }
    function _surEchap(e) { if (e.key === 'Escape') _fermer(); }

    function _entree(label, action, danger) {
      const it = document.createElement('button');
      it.className = 'bd-ctx-item' + (danger ? ' bd-ctx-danger' : '');
      it.textContent = label;
      it.addEventListener('click', function () { _fermer(); action(); });
      return it;
    }

    // Duplique la sélection : copie dans un tampon jetable puis colle décalé.
    function _dupliquer() {
      if (!clipboard || !model) return;
      const tampon = window.WfClipboard ? window.WfClipboard.creer() : null;
      if (!tampon) return;
      tampon.copier(model, selection.ids());
      if (tampon.vide()) return;
      const cl = tampon.clones(24, 24);
      history.executer(history.cmdAjouterNoeuds(cl.noeuds, cl.aretes));
      selection.selectionner(null);
      cl.ids.forEach(function (id) { selection.ajouter(id); });
    }

    function _copier() {
      if (clipboard && model) clipboard.copier(model, selection.ids());
    }

    function _supprimer() {
      const ids = selection.ids();
      if (ids.length > 0) history.executer(history.cmdSupprimerNoeuds(ids));
      selection.vider();
    }

    function _ouvrir(x, y) {
      _fermer();
      menu = document.createElement('div');
      menu.className = 'bd-ctx-menu';
      menu.style.setProperty('--cx', x + 'px');
      menu.style.setProperty('--cy', y + 'px');
      menu.appendChild(_entree('Duplicate', _dupliquer));
      menu.appendChild(_entree('Copy', _copier));
      menu.appendChild(_entree('Delete', _supprimer, true));
      document.body.appendChild(menu);
      document.addEventListener('pointerdown', _surClicAilleurs, true);
      document.addEventListener('keydown', _surEchap, true);
    }

    function onContext(e) {
      const nodeEl = e.target.closest ? e.target.closest('.bd-node-canvas') : null;
      if (!nodeEl) return;   // clic droit sur le vide : laissé au pan
      e.preventDefault();
      e.stopPropagation();
      const id = nodeEl.getAttribute('data-step-id');
      // Sélectionne le nœud visé s'il n'est pas déjà dans la sélection.
      if (!selection.contient(id)) selection.selectionner(id);
      _ouvrir(e.clientX, e.clientY);
    }

    nodesHost.addEventListener('contextmenu', onContext);
    return function debrancher() {
      nodesHost.removeEventListener('contextmenu', onContext);
      _fermer();
    };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfContextMenu = WfContextMenu;
if (typeof module !== 'undefined') module.exports = WfContextMenu;
