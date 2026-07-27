/**
 * wf-selection.js — Sélection courante du canevas
 *
 * Concept CENTRAL de l'édition : la plupart des gestes (déplacer, dupliquer,
 * supprimer, copier) n'agissent pas sur « un nœud » mais sur « la sélection
 * courante », qui contient 1 ou N nœuds. La sélection mérite donc son propre
 * module (split) : elle est lue par tous ces gestes et notifie quand elle
 * change, pour que le rendu marque visuellement les nœuds sélectionnés.
 *
 * Elle ne connaît ni le DOM ni le modèle : elle tient juste un ensemble d'ids
 * et prévient. Le canevas fait le lien.
 */

const WfSelection = (() => {

  function creer() {
    const set = new Set();
    const abonnes = [];

    function _notifier() {
      const ids = Array.from(set);
      abonnes.forEach(function (fn) { fn(ids); });
    }
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    function ids() { return Array.from(set); }
    function contient(id) { return set.has(id); }
    function taille() { return set.size; }

    // Sélection exclusive : ce nœud seul.
    function selectionner(id) {
      set.clear();
      if (id != null) set.add(id);
      _notifier();
    }

    // Bascule (Ctrl+clic) : ajoute ou retire sans toucher au reste.
    function basculer(id) {
      if (set.has(id)) set.delete(id); else set.add(id);
      _notifier();
    }

    function ajouter(id) { if (!set.has(id)) { set.add(id); _notifier(); } }

    function vider() {
      if (set.size === 0) return;
      set.clear();
      _notifier();
    }

    return { onChange, ids, contient, taille, selectionner, basculer, ajouter, vider };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfSelection = WfSelection;
if (typeof module !== 'undefined') module.exports = WfSelection;
