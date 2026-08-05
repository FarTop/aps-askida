/**
 * wf-tidy.js — Disposition automatique des nœuds (Tidy)
 *
 * Calcule de nouvelles positions pour un ensemble de nœuds/arêtes, via dagre
 * (vendoré, window.dagre — cf. _vendor/dagre/). Module de PURE CALCUL : ne
 * touche jamais le modèle, ne connaît ni l'historique ni le DOM rendu. Reçoit
 * des nœuds/arêtes, renvoie une map de positions ; l'appelant décide comment
 * les appliquer (commande annulable pour une édition explicite, application
 * directe pour un simple repli au chargement) et quand (bouton, chargement
 * initial, restauration de version, première ouverture d'un corps de boucle).
 *
 * Hauteur des nœuds : APPROXIMATION par comptage de ports (portsWfd), pas de
 * mesure DOM réelle — cohérent avec _centrerSurContenu (workflow-canvas.js),
 * qui utilise déjà une bbox 220x120 approximative par nœud, et évite le
 * problème de l'œuf-et-la-poule : dans les cas de repli visés ici, les nœuds
 * n'ont justement encore aucune position, donc rien à mesurer dans le DOM.
 * La largeur, elle, est une CONSTANTE CSS fixe (230px, .bd-node-canvas) donc
 * exacte.
 */

const WfTidy = (() => {

  const LARGEUR_NOEUD  = 230;  // .bd-node-canvas { width: 230px } — exact
  const HAUT_ENTETE    = 52;   // .nc-head : padding 12+10 + badge 30px
  const HAUT_CORPS     = 24;   // .nc-body : padding 2+10 + une ligne ~11.5px
  const HAUT_PORTS_PAD = 16;   // .nc-ports : padding 8px haut + 8px bas
  const HAUT_RANGEE    = 18;   // une .nc-prow (dot 9px + texte 11.5px, centré)
  const ECART_RANGEE   = 6;    // .nc-ports { gap: 6px }

  // Hauteur approximative d'un nœud, par comptage de ports (même fonction que
  // node-renderer.js pour le rendu réel — jamais deviné/dupliqué ici).
  function _hauteurApprox(etape) {
    const CAT = (typeof window !== 'undefined') ? window.PivotCatalogIconik : null;
    const nbPorts = CAT ? (1 + CAT.portsWfd(etape).length) : 2; // +1 pour la rangée d'entrée
    // `.nc-body` dépend en réalité de `store || sourceDistante`, où
    // sourceDistante est calculé par l'appelant de NodeRenderer.rendre — pas
    // dérivable ici sans dupliquer cette logique. Approximé avec `store`
    // seul (résultVar/storeAs/resultBlock/var) ; écart mineur, connu, absorbé
    // par l'espacement entre nœuds (nodesep).
    const p = (etape && etape.params) || {};
    const aCorps = !!(p.resultVar || p.storeAs || p.resultBlock || p.var);
    const hautPorts = HAUT_PORTS_PAD + nbPorts * HAUT_RANGEE + (nbPorts - 1) * ECART_RANGEE;
    return HAUT_ENTETE + (aCorps ? HAUT_CORPS : 0) + hautPorts;
  }

  /**
   * Calcule une nouvelle disposition pour un ensemble noeuds/arêtes (même
   * forme que WfModel : noeuds = [{id, etape, x, y}], aretes = [{id?, from, to}]).
   * Renvoie { id: {x, y} } — positions TOP-LEFT (converties depuis le centre
   * renvoyé par dagre), une entrée par nœud reçu. Fonction PURE : ne lit/
   * n'écrit aucun modèle.
   */
  function calculerDisposition(noeuds, aretes) {
    const dagreLib = (typeof window !== 'undefined') ? window.dagre : null;
    if (!dagreLib) throw new Error('WfTidy: window.dagre introuvable (vendor non chargé)');
    if (!noeuds || !noeuds.length) return {};

    // multigraph:true + name unique par arête : nécessaire, pas cosmétique —
    // un nœud decision a souvent plusieurs ports ciblant le même nœud aval ;
    // sans ça, setEdge(u,v) écraserait silencieusement les doublons u->v.
    const g = new dagreLib.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90, marginx: 40, marginy: 40 });

    const idsConnus = {};
    noeuds.forEach(function (n) {
      g.setNode(n.id, { width: LARGEUR_NOEUD, height: _hauteurApprox(n.etape) });
      idsConnus[n.id] = true;
    });
    (aretes || []).forEach(function (a) {
      const u = a.from && a.from.step, v = a.to && a.to.step;
      if (!u || !v || u === v) return;              // pas d'auto-boucle (déjà bloqué à la saisie par wf-connect.js, filet défensif ici)
      if (!idsConnus[u] || !idsConnus[v]) return;    // arête pointant hors de l'ensemble reçu
      g.setEdge(u, v, {}, a.id || (u + '->' + v));   // name = id de l'arête, distinct par construction
    });

    dagreLib.layout(g);

    const positions = {};
    noeuds.forEach(function (n) {
      const nd = g.node(n.id);
      // Filet de sécurité : ne devrait pas arriver (tout nœud reçu est passé
      // à setNode ci-dessus), garde la position actuelle si jamais.
      positions[n.id] = nd ? { x: nd.x - nd.width / 2, y: nd.y - nd.height / 2 } : { x: n.x, y: n.y };
    });
    return positions;
  }

  return { calculerDisposition };

})();

if (typeof window !== 'undefined') window.WfTidy = WfTidy;
if (typeof module !== 'undefined') module.exports = WfTidy;
