/**
 * wf-shortcuts.js — Raccourcis clavier de l'éditeur
 *
 * Module SEPARE (split). Il ne connaît pas le DOM des nœuds : on lui passe un
 * contexte { model, history, selection, root } et il branche les touches sur
 * les commandes existantes. Les gestes restent annulables — le clavier ne fait
 * que déclencher des commandes déjà écrites.
 *
 * Raccourcis de cette étape (3a) :
 *   Ctrl/Cmd+Z         annuler
 *   Ctrl/Cmd+Y         refaire
 *   Ctrl/Cmd+Shift+Z   refaire (variante usuelle)
 *   Suppr / Retour      supprimer la sélection
 *
 * Copier/coller/dupliquer (Ctrl+C/V/D) et le lasso viendront aux étapes 3b/3c.
 */

const WfShortcuts = (() => {

  function brancher(ctx) {
    const { history, selection, root } = ctx;
    if (!history || !selection) return function () {};

    // On n'agit que si le focus est « dans » le canevas, pas dans un champ de
    // saisie (filtre de palette, futurs champs de config).
    function _dansCanevas(cible) {
      if (!cible) return false;
      const tag = (cible.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || cible.isContentEditable) return false;
      return root.contains(cible);
    }

    function onKey(e) {
      if (!_dansCanevas(document.activeElement) && !_dansCanevas(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      // Annuler / refaire
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) history.refaire(); else history.annuler();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        history.refaire();
        return;
      }

      // Supprimer la sélection. Backspace neutralisé sur le canevas (sinon le
      // navigateur peut revenir en arrière).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selection.ids();
        if (ids.length === 0) return;
        e.preventDefault();
        history.executer(history.cmdSupprimerNoeuds(ids));
        selection.vider();
        return;
      }
    }

    document.addEventListener('keydown', onKey);
    return function debrancher() { document.removeEventListener('keydown', onKey); };
  }

  return { brancher };

})();

if (typeof window !== 'undefined') window.WfShortcuts = WfShortcuts;
if (typeof module !== 'undefined') module.exports = WfShortcuts;
