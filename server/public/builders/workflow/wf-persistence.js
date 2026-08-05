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
  // `layoutsDeCorps` (optionnel) : { loopId: { stepId: {x,y} } }, fourni par
  // WfScope.layoutsDeCorps() — le corps de chaque boucle imbriquée (son
  // `.body`) est déjà porté par l'étape Loop elle-même dans `model.noeuds()`
  // (WfScope réécrit `etape.body` en sortant d'un corps édité, ou via
  // flush() avant sauvegarde), donc `doc.steps` n'a rien de spécial à faire
  // pour ça — seules les POSITIONS des nœuds internes à un corps vivent
  // ailleurs (presentation.bodyLayout), puisque « les positions appartiennent
  // à la section presentation » (pivot-schema.js).
  function documentDepuisModele(model, entete, layoutsDeCorps) {
    const PivotIO = (typeof window !== 'undefined') ? window.PivotIO : null;
    const doc = PivotIO ? PivotIO.creer(entete) : {
      pivot: 1, form: 'canonical',
      workflow: { id: entete.id || '', name: entete.name || '', intent: '', platform: '', environment: entete.environment || '', version: 1, status: 'draft' },
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
    doc.presentation.bodyLayout = Object.assign({}, layoutsDeCorps || {});

    return doc;
  }

  // Document pivot -> initial pour WfModel (au chargement). Positions reprises
  // de presentation.layout ; repli en cascade si une étape n'a pas de position
  // enregistrée (ne devrait pas arriver, mais reste lisible si ça arrive).
  function initialDepuisDocument(doc) {
    const layout = (doc && doc.presentation && doc.presentation.layout) || {};
    let i = 0;
    let aUneVraiePosition = false;
    const nodes = ((doc && doc.steps) || []).map(function (etape) {
      const connue = layout[etape.id];
      if (connue) aUneVraiePosition = true;
      const pos = connue || { x: 80 + (i * 40), y: 80 + (i * 40) };
      i++;
      return { id: etape.id, etape: etape, x: pos.x, y: pos.y };
    });
    // Répare au passage les arêtes de décision écrites avant le correctif de
    // portsWfd() (id 'out-N' au lieu du libellé réel) — cf. commentaire de
    // normaliserAretesDecision (pivot-catalog-iconik.js). Trouvé en base sur
    // des flows publiés (30 arêtes cassées, 2026-08-05).
    const CAT = (typeof window !== 'undefined') ? window.PivotCatalogIconik : null;
    const edgesBrutes = CAT ? CAT.normaliserAretesDecision((doc && doc.steps) || [], (doc && doc.edges) || []) : ((doc && doc.edges) || []);
    const edges = edgesBrutes.map(function (e) {
      return { from: e.from, to: e.to };
    });
    // bodyLayout suit tel quel — WfScope.creer() en a besoin pour retrouver
    // les positions des corps de boucle déjà édités, plutôt que de tout
    // redisposer par défaut à chaque entrée.
    const bodyLayout = (doc && doc.presentation && doc.presentation.bodyLayout) || {};
    // true seulement si AUCUN nœud n'avait de position enregistrée (version
    // figée — presentation retirée avant le gel — ou import JSON sans
    // presentation) : signal pour l'appelant, qui décide de lancer WfTidy à
    // la place du repli en cascade ci-dessus. Cette fonction reste une pure
    // conversion document<->modèle, sans dépendance à dagre/DOM (cf. WfTidy).
    // Un repli PARTIEL (certains nœuds ont une position, pas tous) reste sur
    // le comportement par-nœud existant, volontairement — cas non rencontré.
    const layoutManquant = nodes.length > 0 && !aUneVraiePosition;
    return { nodes: nodes, edges: edges, bodyLayout: bodyLayout, layoutManquant: layoutManquant };
  }

  // Charge un workflow existant : { id, name, document }.
  function charger(id) {
    return fetch(API + '/' + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // Sauvegarde (création si pas d'id, mise à jour sinon). Renvoie { id, name }.
  function sauvegarder(opts) {
    const doc = documentDepuisModele(opts.model, { id: opts.id, name: opts.name, environment: opts.environment }, opts.layoutsDeCorps);
    // N'inclut PAS la clé id quand elle est absente : un id null explicite dans
    // le JSON forcerait Prisma à rejeter le create (champ id non-nullable, le
    // défaut @default(cuid()) ne s'applique que si la clé est absente, pas si
    // elle vaut null). Bug vécu : "Invalid prisma.builderFlow.upsert()".
    const payload = { name: opts.name, document: doc };
    if (opts.id) payload.id = opts.id;
    const corps = JSON.stringify(payload);
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
if (typeof module !== 'undefined') module.exports = WfPersistence;
