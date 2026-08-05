/**
 * wf-scope.js — Pile de portées du canevas (racine + corps de boucle ouverts)
 *
 * `WfModel` reste un modèle plat à un seul niveau — c'est voulu, il n'a pas
 * besoin de connaître la notion de portée (cf. son en-tête). Ce module ajoute
 * l'imbrication PAR-DESSUS, sans y toucher : une pile de portées, chacune son
 * propre triplet { model, history, selection }. La portée racine est
 * toujours en bas de pile ; entrer dans un nœud Loop en empile une nouvelle,
 * construite depuis `etape.body` ; en sortir la dépile et réécrit l'état
 * courant DANS l'étape Loop de la portée parente — le même objet que la
 * portée racine sérialisera, donc `wf-persistence.js` n'a presque rien à
 * savoir de l'imbrication (cf. pivot-schema.js/pivot-validate.js : le corps
 * d'une boucle est imbriqué dans le pivot, jamais déduit du graphe).
 *
 * Logique pure, comme WfModel/WfHistory/WfSelection : pas de DOM, pas de
 * rendu. Le canevas (workflow-canvas.js) s'y abonne et rebranche les modules
 * d'interaction (WfPaletteDrag, WfConnect, WfContextMenu, WfShortcuts) sur
 * la portée courante à chaque changement — ces modules acceptent déjà
 * { model, history, selection } et rendent un débranchement, conçus pour
 * être rebranchés.
 */

const WfScope = (() => {

  function creer(modeleRacine, presentationBodyLayout) {
    const WfModel     = (typeof window !== 'undefined') ? window.WfModel     : require('./wf-model.js');
    const WfHistory   = (typeof window !== 'undefined') ? window.WfHistory   : require('./wf-history.js');
    const WfSelection = (typeof window !== 'undefined') ? window.WfSelection : require('./wf-selection.js');
    const CAT         = (typeof window !== 'undefined') ? window.PivotCatalogIconik : require('./pivot-catalog-iconik.js');

    // layouts[loopId] = { stepId: {x,y} } — connu au chargement (presentation
    // .bodyLayout) puis tenu à jour à chaque sortie/flush d'un corps édité.
    const layouts = Object.assign({}, presentationBodyLayout || {});

    const pile = [{
      loopId: null,
      etape: null,          // la racine n'a pas d'étape hôte
      model: modeleRacine,
      history: WfHistory.creer(modeleRacine),
      selection: WfSelection.creer()
    }];

    const abonnes = [];
    function _notifier() { abonnes.forEach(function (fn) { fn(); }); }
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    function courant() { return pile[pile.length - 1]; }
    function estRacine() { return pile.length === 1; }
    function profondeur() { return pile.length - 1; }

    // Fil d'Ariane : labels lisibles, racine incluse.
    function chemin() {
      return pile.map(function (s, i) {
        if (i === 0) return 'Workflow';
        return (s.etape && (s.etape.label || s.etape.id)) || s.loopId;
      });
    }

    // Parcours arrière (mêmes règles que _etapesPrecedentes du canevas) :
    // remonte le graphe depuis `depuisId` dans `model`, largeur d'abord.
    function _precedents(model, depuisId) {
      const vus = {}; vus[depuisId] = true;
      const file = [depuisId];
      const resultat = [];
      while (file.length) {
        const c = file.shift();
        model.aretes().forEach(function (a) {
          if (!a.to || a.to.step !== c) return;
          const pid = a.from && a.from.step;
          if (!pid || vus[pid]) return;
          vus[pid] = true;
          const n = model.noeud(pid);
          if (n && n.etape) resultat.push(n.etape);
          file.push(pid);
        });
      }
      return resultat;
    }

    // Depuis la portée courante (si ce n'est pas la racine), les étapes qui
    // précèdent CHAQUE boucle traversée, dans SA portée parente — c'est ce
    // qui permet au sélecteur de variables de continuer à voir ce qui a été
    // posé avant la boucle une fois qu'on est entré dans son corps. Sans ça,
    // le sélecteur — construit justement pour ne jamais taper un nom de
    // mémoire — redeviendrait aveugle dès qu'on ouvre un corps.
    function etapesExterieures() {
      const resultat = [];
      for (let i = pile.length - 1; i >= 1; i--) {
        const scope = pile[i];
        const parent = pile[i - 1];
        _precedents(parent.model, scope.loopId).forEach(function (e) { resultat.push(e); });
      }
      return resultat;
    }

    // ── Construire une portée de corps depuis une étape Loop ────────────────
    function _portéeDepuisBoucle(etapeBoucle) {
      const WfModelLocal = WfModel;
      const body = etapeBoucle.body || { steps: [], edges: [] };
      const layout = layouts[etapeBoucle.id] || {};
      // true si ce corps n'a ENCORE JAMAIS eu de position enregistrée (première
      // ouverture) : simple SIGNAL renvoyé à l'appelant (workflow-canvas.js),
      // qui décide s'il lance WfTidy à la place du repli linéaire ci-dessous —
      // ce fichier reste logique pure, sans dépendance à dagre/DOM (cf. en-tête).
      const layoutManquant = Object.keys(layout).length === 0 && (body.steps || []).length > 0;
      let i = 0;
      const nodes = (body.steps || []).map(function (etape) {
        const pos = layout[etape.id] || { x: 80 + (i * 220), y: 80 };
        i++;
        return { id: etape.id, etape: etape, x: pos.x, y: pos.y };
      });
      // Répare au passage les arêtes de décision écrites avant le correctif
      // de portsWfd() (id 'out-N' au lieu du libellé réel de la condition) —
      // même raisonnement que wf-persistence.js pour les arêtes racine.
      const edgesBrutes = CAT ? CAT.normaliserAretesDecision(body.steps || [], body.edges || []) : (body.edges || []);
      const edges = edgesBrutes.map(function (e) { return { from: e.from, to: e.to }; });
      const model = WfModelLocal.creer({ nodes: nodes, edges: edges });
      return {
        loopId: etapeBoucle.id,
        etape: etapeBoucle,
        model: model,
        history: WfHistory.creer(model),
        selection: WfSelection.creer(),
        layoutManquant: layoutManquant
      };
    }

    // Entre dans le corps du nœud Loop `loopStepId`, cherché dans la portée
    // COURANTE (pour supporter une boucle imbriquée dans une autre). Renvoie
    // false sans rien faire si l'id n'existe pas ou n'est pas une boucle.
    function entrer(loopStepId) {
      const n = courant().model.noeud(loopStepId);
      if (!n || !n.etape || n.etape.core !== 'loop') return false;
      pile.push(_portéeDepuisBoucle(n.etape));
      _notifier();
      return true;
    }

    // Réécrit l'état courant (haut de pile) dans l'étape Loop hôte, SANS
    // dépiler — même flatten que WfPersistence.documentDepuisModele, sans
    // les positions (qui vont dans `layouts`, pas dans le pivot). Partagé par
    // `sortir()` et `flush()`.
    function _ecrireCorps(scope) {
      if (!scope.etape) return;   // racine : rien à réécrire
      scope.etape.body = {
        steps: scope.model.noeuds().map(function (nd) { return nd.etape; }),
        edges: scope.model.aretes().map(function (a) { return { from: a.from, to: a.to }; })
      };
      const l = {};
      scope.model.noeuds().forEach(function (nd) { l[nd.id] = { x: nd.x, y: nd.y }; });
      layouts[scope.loopId] = l;
    }

    // Sort du corps courant : dépile, réécrit dans le parent.
    function sortir() {
      if (pile.length <= 1) return false;
      const scope = pile.pop();
      _ecrireCorps(scope);
      _notifier();
      return true;
    }

    // Réécrit TOUS les niveaux ouverts (le plus profond d'abord) dans leur
    // parent, SANS toucher à la pile visible. À appeler avant toute
    // sauvegarde : sans ça, sauvegarder pendant qu'on édite l'intérieur d'une
    // boucle perdrait silencieusement les modifications en cours — le corps
    // resterait figé à son état d'avant la dernière sortie.
    function flush() {
      for (let i = pile.length - 1; i >= 1; i--) _ecrireCorps(pile[i]);
    }

    // { loopId: { stepId: {x,y} } } pour tous les corps connus (édités cette
    // session, ou repris de presentation.bodyLayout au chargement) — à
    // fusionner dans presentation.bodyLayout à la sauvegarde. Appeler
    // `flush()` avant pour être sûr que la portée ouverte y figure.
    function layoutsDeCorps() { return layouts; }

    // Fusionne les positions connues au chargement (presentation.bodyLayout)
    // dans `layouts` — WfScope.creer() est construit avant que le document ne
    // soit chargé (async), donc ce n'est qu'après coup qu'on sait où
    // repositionner les nœuds d'un corps déjà édité lors d'une session
    // précédente.
    function importerLayouts(map) { Object.assign(layouts, map || {}); }

    return {
      onChange, courant, estRacine, profondeur, chemin,
      entrer, sortir, flush, layoutsDeCorps, importerLayouts, etapesExterieures
    };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfScope = WfScope;
if (typeof module !== 'undefined') module.exports = WfScope;
