/**
 * wf-history.js — Gestionnaire de commandes annulables (undo / redo)
 *
 * Fondation de l'annulation. Aucune action de l'éditeur ne modifie le modèle
 * directement : toutes passent par une COMMANDE, avec un « faire » et un
 * « défaire ». Le gestionnaire empile les commandes exécutées et sait les
 * rejouer à l'envers (undo) ou à l'endroit (redo).
 *
 * C'est la règle d'or d'un éditeur : un point de passage unique pour toute
 * modification. Sans elle, chaque action serait un bricolage non annulable —
 * la dette qu'on veut éviter. Avec elle, déplacer / supprimer / coller /
 * dupliquer deviennent des commandes, et l'undo est gratuit.
 *
 * Split : ce module orchestre ; il ne connaît pas le DOM. Il agit sur le
 * modèle (wf-model) que le rendu reflète.
 */

const WfHistory = (() => {

  function creer(model) {
    const undoStack = [];
    const redoStack = [];
    const abonnes = [];

    function _notifier() {
      const etat = { peutAnnuler: undoStack.length > 0, peutRefaire: redoStack.length > 0 };
      abonnes.forEach(function (fn) { fn(etat); });
    }
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    // Exécute une commande { faire, defaire, label } et l'empile.
    // Un nouveau geste vide la pile de redo (on repart d'une nouvelle branche).
    function executer(cmd) {
      cmd.faire();
      undoStack.push(cmd);
      redoStack.length = 0;
      _notifier();
    }

    function annuler() {
      const cmd = undoStack.pop();
      if (!cmd) return;
      cmd.defaire();
      redoStack.push(cmd);
      _notifier();
    }

    function refaire() {
      const cmd = redoStack.pop();
      if (!cmd) return;
      cmd.faire();
      undoStack.push(cmd);
      _notifier();
    }

    // ── Fabriques de commandes usuelles, construites sur les mutations du
    //    modèle. Chacune sait se faire ET se défaire. ─────────────────────────

    // Déplacer un ensemble de nœuds d'un delta. Défaire = delta inverse.
    function cmdDeplacer(ids, dx, dy) {
      const avant = {};
      ids.forEach(function (id) {
        const n = model.noeud(id);
        if (n) avant[id] = { x: n.x, y: n.y };
      });
      return {
        label: 'move',
        faire: function () {
          ids.forEach(function (id) {
            const a = avant[id]; if (a) model.deplacerNoeud(id, a.x + dx, a.y + dy);
          });
        },
        defaire: function () {
          ids.forEach(function (id) {
            const a = avant[id]; if (a) model.deplacerNoeud(id, a.x, a.y);
          });
        }
      };
    }

    // Supprimer un ensemble de nœuds (et leurs arêtes). Défaire = tout réajouter.
    function cmdSupprimerNoeuds(ids) {
      // Capture l'état avant, pour restaurer nœuds + arêtes touchées.
      const noeudsSauves = [];
      const aretesSauvees = [];
      ids.forEach(function (id) {
        const n = model.noeud(id);
        if (n) noeudsSauves.push({ id: n.id, etape: n.etape, x: n.x, y: n.y });
      });
      model.aretes().forEach(function (e) {
        if (ids.indexOf(e.from.step) >= 0 || ids.indexOf(e.to.step) >= 0) {
          aretesSauvees.push({ id: e.id, from: e.from, to: e.to });
        }
      });
      return {
        label: 'delete-nodes',
        faire: function () { ids.forEach(function (id) { model.retirerNoeud(id); }); },
        defaire: function () {
          noeudsSauves.forEach(function (n) { model.ajouterNoeud(n); });
          aretesSauvees.forEach(function (e) { model.ajouterArete(e); });
        }
      };
    }

    // Ajouter des nœuds (collage / duplication). Défaire = les retirer.
    function cmdAjouterNoeuds(noeuds, aretes) {
      return {
        label: 'add-nodes',
        faire: function () {
          noeuds.forEach(function (n) { model.ajouterNoeud(n); });
          (aretes || []).forEach(function (e) { model.ajouterArete(e); });
        },
        defaire: function () {
          (aretes || []).forEach(function (e) { model.retirerArete(e.id); });
          noeuds.forEach(function (n) { model.retirerNoeud(n.id); });
        }
      };
    }

    // Ajouter une arête. Défaire = la retirer. L'id est fixé à l'avance pour
    // que faire/défaire visent la même arête même après plusieurs cycles.
    function cmdAjouterArete(arete) {
      const id = arete.id || ('edge-cmd-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6));
      const a = { id: id, from: arete.from, to: arete.to };
      return {
        label: 'add-edge',
        faire: function () { model.ajouterArete(a); },
        defaire: function () { model.retirerArete(id); }
      };
    }

    // Supprimer une arête. Défaire = la réajouter.
    function cmdSupprimerArete(id) {
      const e = model.aretes().filter(function (x) { return x.id === id; })[0];
      return {
        label: 'delete-edge',
        faire: function () { model.retirerArete(id); },
        defaire: function () { if (e) model.ajouterArete(e); }
      };
    }

    return {
      onChange, executer, annuler, refaire,
      cmdDeplacer, cmdSupprimerNoeuds, cmdAjouterNoeuds, cmdAjouterArete, cmdSupprimerArete
    };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfHistory = WfHistory;
if (typeof module !== 'undefined') module.exports = WfHistory;
