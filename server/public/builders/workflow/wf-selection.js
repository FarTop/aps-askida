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
    const setAretes = new Set();
    const abonnes = [];

    function _notifier() {
      const ids = Array.from(set);
      const idsAr = Array.from(setAretes);
      abonnes.forEach(function (fn) { fn(ids, idsAr); });
    }
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    function ids() { return Array.from(set); }
    function contient(id) { return set.has(id); }
    function taille() { return set.size; }

    // Sélection exclusive : ce nœud seul. Vide aussi les arêtes (une sélection
    // exclusive de nœud ne cohabite pas avec une arête sélectionnée).
    function selectionner(id) {
      set.clear();
      setAretes.clear();
      if (id != null) set.add(id);
      _notifier();
    }

    // Bascule (Ctrl+clic) : ajoute ou retire sans toucher au reste.
    function basculer(id) {
      if (set.has(id)) set.delete(id); else set.add(id);
      _notifier();
    }

    function ajouter(id) { if (!set.has(id)) { set.add(id); _notifier(); } }

    // ── Sélection d'arêtes (ensemble parallèle) ───────────────────────────────
    function idsAretes() { return Array.from(setAretes); }
    function contientArete(id) { return setAretes.has(id); }
    // Sélection exclusive d'une arête : vide les nœuds aussi.
    function selectionnerArete(id) {
      set.clear();
      setAretes.clear();
      if (id != null) setAretes.add(id);
      _notifier();
    }

    function vider() {
      if (set.size === 0 && setAretes.size === 0) return;
      set.clear();
      setAretes.clear();
      _notifier();
    }

    return { onChange, ids, contient, taille, selectionner, basculer, ajouter, vider,
             idsAretes, contientArete, selectionnerArete };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfSelection = WfSelection;
if (typeof module !== 'undefined') module.exports = WfSelection;
