/**
 * pivot-to-wfd.js — Convertisseur du format pivot vers le format WFD exécutable
 *
 * L'étape qui prouve le reste : si un pivot se retraduit en WFD que le moteur
 * exécute comme l'original, le format n'a rien perdu. Le convertisseur régénère
 * ce que le pivot ne stocke pas — ports (avec libellés et couleurs), positions,
 * index numériques des connexions — à partir du catalogue et de la présentation.
 *
 * Trois traductions non triviales :
 *   — étape → nœud : `core`/`facade` deviennent `family`, les ports sont
 *     régénérés depuis le catalogue ;
 *   — arête → connexion : le port nommé (`fail`) redevient l'index positionnel
 *     (`fromPort: 1`) que le moteur route ;
 *   — décision : un libellé porté par plusieurs conditions produit plusieurs
 *     connexions (fan-out), fidèle à ce que fait la production.
 *
 * Le corps de boucle imbriqué du pivot est aplati : le moteur lit un graphe
 * plat où la boucle ouvre son corps par le port 0. La frontière que le pivot
 * rendait structurelle redevient implicite — mais elle a été vérifiée à la
 * lecture, donc l'aplatissement ne peut pas la violer.
 */

const PivotToWfd = (() => {

  const estNode = (typeof module !== 'undefined' && typeof require !== 'undefined');
  const CAT = estNode ? require('./pivot-catalog-iconik.js') : window.PivotCatalogIconik;
  const V   = estNode ? require('./pivot-validate.js')       : window.PivotValidate;

  // Identifiant de nœud WFD dérivé de l'identifiant pivot. Le pivot a des ids
  // lisibles (`marquer_succes`) ; on préfixe pour rester dans la convention
  // WFD `n-…` sans réintroduire les collisions que les ids lisibles ont résolues.
  function _idWfd(idPivot) {
    return 'n-' + idPivot;
  }

  // Position d'une étape, lue dans la présentation. Une étape de corps se
  // cherche dans bodyLayout ; à défaut, une position neutre pour ne pas empiler
  // sur l'origine.
  function _position(idPivot, layout, index) {
    const p = layout && layout[idPivot];
    if (p) return { x: p.x, y: p.y };
    return { x: 120 + index * 180, y: 120 };
  }

  // ── Un nœud WFD depuis une étape pivot ────────────────────────────────────

  function _noeud(etape, pos) {
    const inputs = etape.core === 'trigger' ? [] : [{ id: 'in', label: 'Entrée' }];
    return {
      x: pos.x, y: pos.y,
      id: _idWfd(etape.id),
      name: etape.label || etape.id,
      draft: false,
      ports: { inputs: inputs, outputs: CAT.portsWfd(etape) },
      family: CAT.familleWfd(etape),
      config: _config(etape)
    };
  }

  // La config WFD reçoit les params du pivot, l'intention comme description, et
  // les références de ressources dépliées en identifiants que le moteur lit.
  function _config(etape) {
    const cfg = Object.assign({}, etape.params || {});
    if (etape.intent) cfg.description = etape.intent;
    if (etape.uses) {
      Object.keys(etape.uses).forEach(function (genre) {
        cfg[genre + 'Ref'] = etape.uses[genre];
      });
    }
    if (etape.facade && CAT.FACADES[etape.facade]) {
      const f = CAT.FACADES[etape.facade];
      if (f.httpMode) cfg.httpMode = f.httpMode;
    }
    return cfg;
  }

  // ── Une connexion WFD depuis une arête pivot ──────────────────────────────
  // Rend un tableau : le fan-out d'une décision produit plusieurs connexions
  // pour une seule arête pivot.

  let _seq = 0;
  function _connexions(arete, etapesParId) {
    const source = etapesParId[arete.from.step];
    const cible  = etapesParId[arete.to.step];
    if (!source || !cible) return [];

    const indices = CAT.indexPort(source, arete.from.port);
    return indices.map(function (idx) {
      return {
        id: 'conn-' + (++_seq),
        fromNode: _idWfd(arete.from.step),
        fromPort: idx,
        toNode: _idWfd(arete.to.step),
        toPort: 0
      };
    });
  }

  // ── Aplatissement d'une portée ────────────────────────────────────────────
  // Ajoute les nœuds et connexions d'une portée (racine ou corps) aux tableaux
  // accumulateurs. Une boucle ouvre son corps : sa première étape de corps est
  // reliée au port 0 de la boucle, comme le moteur l'attend.

  function _aplatir(portee, layoutParEtape, etapesParId, noeuds, connexions) {
    (portee.steps || []).forEach(function (etape, i) {
      etapesParId[etape.id] = etape;
      noeuds.push(_noeud(etape, _position(etape.id, layoutParEtape, i)));

      if (etape.core === 'loop' && etape.body) {
        const bl = (portee._bodyLayout && portee._bodyLayout[etape.id]) || null;
        _aplatir(
          { steps: etape.body.steps, edges: etape.body.edges, _bodyLayout: null },
          bl, etapesParId, noeuds, connexions
        );
        // Ouvre le corps : boucle --port 0--> première étape du corps.
        const premier = etape.body.steps[0];
        if (premier) {
          connexions.push({
            id: 'conn-' + (++_seq),
            fromNode: _idWfd(etape.id), fromPort: 0,
            toNode: _idWfd(premier.id), toPort: 0
          });
        }
      }
    });

    (portee.edges || []).forEach(function (arete) {
      _connexions(arete, etapesParId).forEach(function (c) { connexions.push(c); });
    });
  }

  // ── Entrée publique ───────────────────────────────────────────────────────

  function convertir(doc, options) {
    const opt = options || {};

    // On ne convertit qu'un pivot valide au sens du catalogue : un port faux ou
    // une façade inconnue produirait un WFD que le moteur refuserait.
    const rapport = V.valider(doc, CAT);
    if (!rapport.ok && !opt.forcer) {
      const e = new Error('pivot invalide : conversion impossible (' + rapport.erreurs.length + ' erreur(s))');
      e.rapport = rapport;
      throw e;
    }

    _seq = 0;
    const noeuds = [], connexions = [], etapesParId = Object.create(null);
    const pres = doc.presentation || {};
    const portee = {
      steps: doc.steps, edges: doc.edges,
      _bodyLayout: pres.bodyLayout || null
    };
    _aplatir(portee, pres.layout || null, etapesParId, noeuds, connexions);

    const w = doc.workflow || {};
    return {
      name: w.name || w.id || 'sans-nom',
      nodes: noeuds,
      connections: connexions,
      _rapport: rapport
    };
  }

  return { convertir, convert: convertir };

})();

if (typeof module !== 'undefined') module.exports = PivotToWfd;
if (typeof window !== 'undefined') window.PivotToWfd = PivotToWfd;
