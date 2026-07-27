/**
 * wf-shortcuts.js — Raccourcis clavier de l'éditeur
 *
 * Module SEPARE (split). Il ne connaît pas le DOM des nœuds : on lui passe un
 * contexte { model, history, selection, root } et il branche les touches sur
 * les commandes existantes. Les gestes restent annulables — le clavier ne fait
 * que déclencher des commandes déjà écrites.
 *
 * Raccourcis de cette étape (3a + 3b) :
 *   Ctrl/Cmd+Z         annuler
 *   Ctrl/Cmd+Y         refaire
 *   Ctrl/Cmd+Shift+Z   refaire (variante usuelle)
 *   Suppr / Retour      supprimer la sélection
 *   Ctrl/Cmd+C         copier la sélection
 *   Ctrl/Cmd+V         coller (décalé)
 *   Ctrl/Cmd+D         dupliquer la sélection (décalé)
 *
 * Le lasso viendra à l'étape 3c.
 */

const WfShortcuts = (() => {

  function brancher(ctx) {
    const { model, history, selection, root } = ctx;
    const clipboard = ctx.clipboard || null;
    if (!history || !selection) return function () {};

    const DECALAGE = 24;   // décalage des clones (coller / dupliquer)

    // On n'agit que si le focus est « dans » le canevas, pas dans un champ de
    // saisie (filtre de palette, futurs champs de config).
    function _dansCanevas(cible) {
      if (!cible) return false;
      const tag = (cible.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || cible.isContentEditable) return false;
      return root.contains(cible);
    }

    // Colle un jeu de clones : commande annulable d'ajout, puis la sélection
    // passe sur les nouveaux nœuds (comportement attendu après un coller).
    function _collerClones(clones) {
      if (!clones || clones.noeuds.length === 0) return;
      history.executer(history.cmdAjouterNoeuds(clones.noeuds, clones.aretes));
      selection.selectionner(null);
      clones.ids.forEach(function (id) { selection.ajouter(id); });
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

      // Copier / coller / dupliquer (nécessitent le presse-papier + le modèle).
      if (ctrl && clipboard && model && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        clipboard.copier(model, selection.ids());
        return;
      }
      if (ctrl && clipboard && model && (e.key === 'v' || e.key === 'V')) {
        if (clipboard.vide()) return;
        e.preventDefault();
        _collerClones(clipboard.clones(DECALAGE, DECALAGE));
        return;
      }
      if (ctrl && clipboard && model && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        // Dupliquer = copier la sélection courante puis coller décalé, sans
        // toucher au presse-papier de l'utilisateur.
        const tampon = window.WfClipboard ? window.WfClipboard.creer() : null;
        if (!tampon) return;
        tampon.copier(model, selection.ids());
        if (tampon.vide()) return;
        _collerClones(tampon.clones(DECALAGE, DECALAGE));
        return;
      }

      // Supprimer la sélection (nœuds ET arêtes). Backspace neutralisé sur le
      // canevas (sinon le navigateur peut revenir en arrière).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selection.ids();
        const idsAr = selection.idsAretes ? selection.idsAretes() : [];
        if (ids.length === 0 && idsAr.length === 0) return;
        e.preventDefault();
        if (ids.length > 0) history.executer(history.cmdSupprimerNoeuds(ids));
        idsAr.forEach(function (aid) { history.executer(history.cmdSupprimerArete(aid)); });
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
