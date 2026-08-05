/**
 * wf-run-overlay.js — Application DOM du statut de run (badges + arêtes)
 *
 * Ne calcule rien (cf. wf-run-status.js) — reçoit un statut déjà dérivé et
 * l'applique sur les nœuds/arêtes RENDUS. Séparé de node-renderer.js parce
 * que rendreDepuisModele() démonte/reconstruit tous les .bd-node-canvas sur
 * tout changement structurel du modèle (édition, undo, navigation de
 * portée) — un badge intégré au rendu structurel serait effacé à chaque
 * edit ; ici, `reappliquer()` est appelé après CHAQUE rendu pour que le
 * dernier statut connu survive sans que ce module ait besoin de sa propre
 * souscription à model.onChange.
 */
(function () {
  'use strict';

  const WfRunOverlay = (() => {

    // Dernier statut appliqué, gardé en fermeture pour reappliquer().
    let dernierStepStatus = null;

    // Pose data-run-status sur chaque .bd-node-canvas — même motif que
    // _marquerSelection() dans workflow-canvas.js.
    function appliquer(nodesHost, stepStatus) {
      dernierStepStatus = stepStatus || {};
      if (!nodesHost) return;
      nodesHost.querySelectorAll('.bd-node-canvas').forEach(function (el) {
        const id = el.getAttribute('data-step-id');
        const statut = dernierStepStatus[id];
        if (statut) el.setAttribute('data-run-status', statut);
        else el.removeAttribute('data-run-status');
      });
    }

    function reappliquer(nodesHost) {
      if (dernierStepStatus) appliquer(nodesHost, dernierStepStatus);
    }

    function effacer(nodesHost) {
      dernierStepStatus = null;
      if (!nodesHost) return;
      nodesHost.querySelectorAll('.bd-node-canvas[data-run-status]').forEach(function (el) {
        el.removeAttribute('data-run-status');
      });
    }

    // Surligne les arêtes VIVANTES (model.aretes(), avec un .id de session)
    // dont la signature de CONTENU (from.step/from.port/to.step) figure dans
    // takenEdges — takenEdges vient du document fetché indépendamment (sans
    // id stable, cf. wf-run-status.js), d'où le matching par contenu plutôt
    // que par id.
    function marquerAretes(svgEdges, aretesVivantes, takenEdges) {
      if (!svgEdges) return;
      svgEdges.querySelectorAll('.cnv-edge-run-taken').forEach(function (g) {
        g.classList.remove('cnv-edge-run-taken');
      });
      if (!takenEdges || !takenEdges.size) return;
      (aretesVivantes || []).forEach(function (a) {
        const signature = a.from.step + '' + a.from.port + '' + a.to.step;
        if (!takenEdges.has(signature)) return;
        const g = svgEdges.querySelector('[data-edge-id="' + a.id + '"]');
        if (g) g.classList.add('cnv-edge-run-taken');
      });
    }

    return { appliquer, reappliquer, effacer, marquerAretes };

  })();

  window.WfRunOverlay = WfRunOverlay;

})();
