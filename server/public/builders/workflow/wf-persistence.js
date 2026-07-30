/**
 * wf-persistence.js — Persistance des workflows du Builder
 *
 * Convertit entre le modèle interne du canvas (WfModel : noeuds avec {id, etape,
 * x, y} et arêtes {from, to}) et le DOCUMENT PIVOT canonique stocké en base
 * (BuilderFlow.document via /api/builder-flows). La correspondance est directe :
 * `noeud.etape` EST déjà un step pivot ({id, core, facade?, label, params}), et
 * les arêtes du modèle ont déjà la forme {from:{step,port}, to:{step}} attendue
 * par pivot-validate (ORDRE_ARETE). Seule la position (x, y) doit être extraite
 * vers presentation.layout, puisque « les positions appartiennent à la section
 * presentation » (pivot-schema.js).
 */

const WfPersistence = (() => {

  const API = '/api/builder-flows';

  // Modèle -> document pivot (pour sauvegarder). `entete` : { id?, name }.
  function documentDepuisModele(model, entete) {
    const PivotIO = (typeof window !== 'undefined') ? window.PivotIO : null;
    const doc = PivotIO ? PivotIO.creer(entete) : {
      pivot: 1, form: 'canonical',
      workflow: { id: entete.id || '', name: entete.name || '', intent: '', platform: '', environment: '', version: 1, status: 'draft' },
      steps: [], edges: [], presentation: { versioned: false, layout: {} }
    };

    const layout = {};
    doc.steps = model.noeuds().map(function (n) {
      layout[n.id] = { x: n.x, y: n.y };
      return n.etape;
    });
    doc.edges = model.aretes().map(function (a) {
      return { from: a.from, to: a.to };
    });
    doc.presentation = doc.presentation || {};
    doc.presentation.versioned = false;
    doc.presentation.layout = layout;

    return doc;
  }

  // Document pivot -> initial pour WfModel (au chargement). Positions reprises
  // de presentation.layout ; repli en cascade si une étape n'a pas de position
  // enregistrée (ne devrait pas arriver, mais reste lisible si ça arrive).
  function initialDepuisDocument(doc) {
    const layout = (doc && doc.presentation && doc.presentation.layout) || {};
    let i = 0;
    const nodes = ((doc && doc.steps) || []).map(function (etape) {
      const pos = layout[etape.id] || { x: 80 + (i * 40), y: 80 + (i * 40) };
      i++;
      return { id: etape.id, etape: etape, x: pos.x, y: pos.y };
    });
    const edges = ((doc && doc.edges) || []).map(function (e) {
      return { from: e.from, to: e.to };
    });
    return { nodes: nodes, edges: edges };
  }

  // Charge un workflow existant : { id, name, document }.
  function charger(id) {
    return fetch(API + '/' + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // Sauvegarde (création si pas d'id, mise à jour sinon). Renvoie { id, name }.
  function sauvegarder(opts) {
    const doc = documentDepuisModele(opts.model, { id: opts.id, name: opts.name });
    const corps = JSON.stringify({ id: opts.id, name: opts.name, document: doc });
    const url = opts.id ? (API + '/' + encodeURIComponent(opts.id)) : API;
    const method = opts.id ? 'PUT' : 'POST';
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: corps })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
        return r.json();
      });
  }

  return { documentDepuisModele, initialDepuisDocument, charger, sauvegarder };

})();

if (typeof window !== 'undefined') window.WfPersistence = WfPersistence;
