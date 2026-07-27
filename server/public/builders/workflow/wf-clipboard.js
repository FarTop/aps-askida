/**
 * wf-clipboard.js — Presse-papier de l'éditeur (copier / coller / dupliquer)
 *
 * Module SEPARE (split). Il tient une copie de nœuds+arêtes et sait produire
 * des CLONES avec de nouveaux ids, prêts à être ajoutés au modèle par une
 * commande annulable. Il ne touche ni au DOM, ni à l'historique : il fabrique
 * les données, le canevas exécute la commande.
 *
 * Règle de clonage :
 *   — chaque nœud copié reçoit un nouvel id (nœud ET etape.id, que le renderer
 *     lit comme data-step-id) ;
 *   — les arêtes INTERNES à la sélection (entre deux nœuds copiés) sont
 *     clonées avec les nouveaux ids ; les arêtes vers l'extérieur sont
 *     ignorées (on ne recolle pas des liens pendants) ;
 *   — les clones sont décalés (offset) pour ne pas se superposer aux originaux.
 */

const WfClipboard = (() => {

  let seq = 0;
  function _nouvelId(base) { return (base || 'node') + '-copie-' + (Date.now().toString(36)) + '-' + (++seq); }

  function creer() {
    let contenu = null;   // { noeuds:[{id,etape,x,y}], aretesInternes:[{from,to}] }

    // Capture la sélection courante du modèle dans le presse-papier.
    function copier(model, ids) {
      if (!ids || ids.length === 0) { contenu = null; return; }
      const ensemble = {};
      ids.forEach(function (id) { ensemble[id] = true; });

      const noeuds = [];
      ids.forEach(function (id) {
        const n = model.noeud(id);
        if (n) noeuds.push({ id: n.id, etape: n.etape, x: n.x, y: n.y });
      });
      // Arêtes dont les DEUX extrémités sont dans la sélection.
      const aretesInternes = [];
      model.aretes().forEach(function (e) {
        if (ensemble[e.from.step] && ensemble[e.to.step]) {
          aretesInternes.push({ from: { step: e.from.step, port: e.from.port }, to: { step: e.to.step } });
        }
      });
      contenu = { noeuds: noeuds, aretesInternes: aretesInternes };
    }

    function vide() { return !contenu || contenu.noeuds.length === 0; }

    // Produit des clones (nouveaux ids), décalés de (dx,dy). Retourne
    // { noeuds, aretes } prêts pour cmdAjouterNoeuds. Ne modifie pas le modèle.
    function clones(dx, dy) {
      if (vide()) return { noeuds: [], aretes: [] };
      const mapId = {};   // ancien id -> nouvel id
      const noeuds = contenu.noeuds.map(function (n) {
        const nid = _nouvelId(n.id);
        mapId[n.id] = nid;
        // Clone de l'étape avec le nouvel id (copie superficielle des params).
        const etape = Object.assign({}, n.etape, { id: nid });
        return { id: nid, etape: etape, x: n.x + (dx || 0), y: n.y + (dy || 0) };
      });
      const aretes = contenu.aretesInternes.map(function (e) {
        return { from: { step: mapId[e.from.step], port: e.from.port }, to: { step: mapId[e.to.step] } };
      });
      return { noeuds: noeuds, aretes: aretes, ids: noeuds.map(function (n) { return n.id; }) };
    }

    return { copier, vide, clones };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.WfClipboard = WfClipboard;
if (typeof module !== 'undefined') module.exports = WfClipboard;
