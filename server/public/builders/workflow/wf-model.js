/**
 * wf-model.js — Modèle de workflow en mémoire (source de vérité du canevas)
 *
 * Fondation de l'édition. Le DOM (nœuds, arêtes) devient le REFLET de ce
 * modèle : on ne manipule plus des éléments à la main, on modifie le modèle et
 * le rendu réagit. C'est cette indirection qui rend l'undo/redo possible —
 * toute modification passe par un point unique, enregistrable.
 *
 * Le modèle ne connaît ni le DOM, ni le rendu, ni l'undo : il tient l'état et
 * prévient quand il change. Le gestionnaire de commandes (wf-history.js)
 * l'utilise ; le rendu s'y abonne. Split : une préoccupation, un module.
 *
 * Forme d'un nœud dans le modèle :
 *   { id, etape (pivot), x, y }
 * Forme d'une arête :
 *   { id, from:{step,port}, to:{step} }
 */

const WfModel = (() => {

  function creer(initial) {
    const nodes = new Map();   // id -> { id, etape, x, y }
    const edges = new Map();   // id -> { id, from, to }
    const abonnes = [];
    let seqEdge = 0;

    function _notifier(type, detail) {
      abonnes.forEach(function (fn) { fn(type, detail); });
    }

    // ── Abonnement : le rendu s'y branche pour réagir aux changements ────────
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    // ── Lecture ──────────────────────────────────────────────────────────────
    function noeud(id) { return nodes.get(id) || null; }
    function noeuds() { return Array.from(nodes.values()); }
    function aretes() { return Array.from(edges.values()); }

    // ── Mutations (le seul chemin pour changer l'état) ───────────────────────
    // Chaque mutation notifie ; le gestionnaire de commandes s'en sert pour
    // composer des actions annulables. Les mutations sont volontairement
    // primitives : ajouter, retirer, déplacer. Les COMMANDES (déplacer une
    // sélection, coller, dupliquer) se construisent au-dessus, dans wf-history.

    function ajouterNoeud(node) {
      nodes.set(node.id, { id: node.id, etape: node.etape, x: node.x || 0, y: node.y || 0 });
      _notifier('node:add', { id: node.id });
      return node.id;
    }

    function retirerNoeud(id) {
      if (!nodes.has(id)) return;
      // Retirer aussi les arêtes qui touchent ce nœud.
      aretes().forEach(function (e) {
        if (e.from.step === id || e.to.step === id) retirerArete(e.id);
      });
      nodes.delete(id);
      _notifier('node:remove', { id: id });
    }

    function deplacerNoeud(id, x, y) {
      const n = nodes.get(id);
      if (!n) return;
      n.x = x; n.y = y;
      _notifier('node:move', { id: id, x: x, y: y });
    }

    function ajouterArete(arete) {
      const id = arete.id || ('edge-' + (++seqEdge));
      edges.set(id, { id: id, from: arete.from, to: arete.to });
      _notifier('edge:add', { id: id });
      return id;
    }

    function retirerArete(id) {
      if (!edges.has(id)) return;
      edges.delete(id);
      _notifier('edge:remove', { id: id });
    }

    // ── Chargement initial ───────────────────────────────────────────────────
    if (initial) {
      (initial.nodes || []).forEach(ajouterNoeud);
      (initial.edges || []).forEach(ajouterArete);
    }

    return {
      onChange,
      noeud, noeuds, aretes,
      ajouterNoeud, retirerNoeud, deplacerNoeud,
      ajouterArete, retirerArete
    };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfModel = WfModel;
if (typeof module !== 'undefined') module.exports = WfModel;
