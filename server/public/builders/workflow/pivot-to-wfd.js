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
    // Un Post-it n'a NI entrée ni sortie — comme dans WFD, où
    // script-workflow-designer.js:2363 retourne `{inputs:[], outputs:[]}` pour
    // cette famille. Le port d'entrée générique est un réflexe de nœud
    // exécutable ; une annotation ne se branche pas.
    const annotation = !!(CAT.estAnnotation && CAT.estAnnotation(etape));
    const inputs = (etape.core === 'trigger' || annotation) ? [] : [{ id: 'in', label: 'Entrée' }];
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
  //
  // Résolution de ressource (mappingId -> lkRows) : lookup() (moteur) ne
  // connaît que `lkRows`, jamais `mappingId` — c'est la seule chose qu'il sait
  // lire. Le pivot ne stocke que la référence (`mappingId`, cf. critère 2 —
  // ce qui est déductible n'est pas dupliqué) ; le convertisseur la déplie ici
  // en tableau `lkRows`, une fois, au moment de produire le format d'échange
  // (cf. en-tête du fichier : « format canonique » vs « format d'échange »).
  // La donnée résolue est fournie par l'appelant via `options.resolutions`
  // (pré-chargée depuis /api/mappings/:id côté navigateur, ou injectée
  // directement côté Node pour un test) — convertir() reste synchrone, aucun
  // appel réseau ne se fait ici. Un mappingId sans résolution fournie laisse
  // `lkRows` absent plutôt que de faire planter la conversion : mieux vaut un
  // Lookup qui ne traduit rien (constatable en observant le run) qu'une
  // conversion qui échoue pour toute la chaîne de nœuds.
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
    if (etape.core === 'lookup' && cfg.mappingId && _resolutions.mappings) {
      const rows = _resolutions.mappings[cfg.mappingId];
      if (rows) cfg.lkRows = rows;
    }
    // manifestId -> s3Mappings, même principe : aws_s3() (moteur) ne connaît
    // que `s3Mappings` (liste de { type, filter, variable }), jamais
    // `manifestId`. Un manifeste a EXACTEMENT cette forme au niveau de ses
    // essences (`role`/`reconnu_par`/`sortie`) — cf. discussion du 3 août
    // sur aws_s3.deliver. `reconnu_par` est déjà un tableau (admin/manifests)
    // là où `filter` est une chaîne jointe par virgule (forme lue par
    // aws_s3()) : la jointure se fait ici, une fois, pas dans l'admin.
    if (etape.core === 'deliver' && cfg.manifestId && _resolutions.manifests) {
      const manifeste = _resolutions.manifests[cfg.manifestId];
      const essences = manifeste && manifeste.essences;
      if (essences && essences.length) {
        // `cardinalite`/`n` transportés tels quels : c'est le garde-fou que
        // aws_s3() (moteur) applique désormais (ajouté le 3 août) — sans ces
        // deux champs, une essence resterait vérifiée en présence seule,
        // jamais en nombre.
        cfg.s3Mappings = essences.map(function (e) {
          const m = {
            type: e.role || '',
            filter: Array.isArray(e.reconnu_par) ? e.reconnu_par.join(',') : (e.reconnu_par || ''),
            variable: e.sortie || '',
            cardinalite: e.cardinalite || 'optionnel'
          };
          if (e.cardinalite === 'au_plus_n') m.n = e.n || 1;
          // appliesTo (3 août, extension) : niveaux où cette essence compte
          // (serie|saison|episode|unitaire) — transporté tel quel, absent ⇔
          // tous niveaux. aws_s3() (moteur) l'utilise pour ignorer une
          // essence hors de sa portée au lieu de la compter partout.
          if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
            m.appliesTo = e.appliesTo;
          }
          return m;
        });
      }
    }
    // manifestId -> checks, pour Verify (4 août) : checker() (moteur) ne
    // connaît que `cfg.checks` (liste de {label,endpoint,path,op,value}),
    // jamais `manifestId`. Une essence ne devient un check QUE si elle porte
    // `verifyPath` — les essences purement livrées mais jamais recontrôlées
    // (title/episodic dans le réel) sont silencieusement absentes du
    // résultat, pas une essence vide. `op` toujours `not_empty` : c'est le
    // seul opérateur observé sur les 4 occurrences réelles (Vérificateur
    // Série/Saison/Episode/Unitaire) — vérifier une PRÉSENCE, jamais une
    // valeur précise. `appliesTo` transporté tel quel, même convention que
    // s3Mappings ci-dessus : le filtrage par niveau se fait dans checker()
    // (moteur), pas ici.
    if (etape.core === 'verify' && cfg.manifestId && _resolutions.manifests) {
      const manifesteV = _resolutions.manifests[cfg.manifestId];
      const essencesV = manifesteV && manifesteV.essences;
      if (essencesV && essencesV.length) {
        cfg.checks = essencesV
          .filter(function (e) { return e.verifyPath; })
          .map(function (e) {
            const c = {
              label: e.role || '',
              endpoint: e.verifyEndpoint || '',
              path: e.verifyPath,
              op: 'not_empty'
            };
            if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
              c.appliesTo = e.appliesTo;
            }
            return c;
          });
      }
    }
    // manifestId -> essences, pour History (4 août) : workflow_history()
    // (moteur) ne connaît que `cfg.essences` (role/sortie/appliesTo,
    // verbatim, non filtré), jamais `manifestId`. Contrairement à Deliver/
    // Verify, PAS de filtre ici sur un champ particulier (sortie est
    // toujours présent) — seules `role`/`sortie` comptent pour construire la
    // checklist, `appliesTo` pour la filtrer PAR NIVEAU au moment de
    // l'exécution (workflow_history(), même mécanisme que checker()) : la
    // conversion ne sait pas encore quel niveau tournera.
    if (etape.core === 'history' && cfg.manifestId && _resolutions.manifests) {
      const manifesteH = _resolutions.manifests[cfg.manifestId];
      const essencesH = manifesteH && manifesteH.essences;
      if (essencesH && essencesH.length) {
        cfg.essences = essencesH
          .filter(function (e) { return e.role && e.sortie; })
          .map(function (e) {
            const eh = { role: e.role, sortie: e.sortie };
            if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
              eh.appliesTo = e.appliesTo;
            }
            return eh;
          });
      }
    }
    // sequenceId -> steps (4 août) : handleHttpSequence() (moteur) ne connaît
    // que `cfg.steps`, jamais `sequenceId` — le pivot ne stocke que la
    // référence à la ressource d'org `Endpoint` (cf. admin/endpoints/), le
    // convertisseur déplie ici, une fois. Même filet que mappingId/
    // manifestId : une résolution absente laisse `steps` absent plutôt que de
    // faire planter la conversion.
    if (etape.core === 'http_sequence' && cfg.sequenceId && _resolutions.endpoints) {
      const sequence = _resolutions.endpoints[cfg.sequenceId];
      if (sequence && sequence.steps) cfg.steps = sequence.steps;
    }
    return cfg;
  }

  // ── Une connexion WFD depuis une arête pivot ──────────────────────────────
  // Rend un tableau : le fan-out d'une décision produit plusieurs connexions
  // pour une seule arête pivot.

  let _seq = 0;
  // Ressources pré-résolues pour cette conversion (cf. _config ci-dessus),
  // remises à `{}` à chaque appel de convertir() — jamais de fuite d'une
  // conversion à l'autre.
  let _resolutions = {};
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

    // Port `default` d'une décision : le pivot l'exprime par `otherwise: "Label"`
    // (le défaut se comporte comme la branche portant ce libellé). Le moteur veut
    // une arête explicite depuis le dernier port (index = nb de conditions). On la
    // génère vers la même cible que l'arête portant le libellé de `otherwise`.
    (portee.steps || []).forEach(function (etape) {
      if (etape.core !== 'decision') return;
      const otherwise = (etape.params || {}).otherwise;
      if (!otherwise) return;
      // Cible : l'arête de cette décision dont le port (libellé) vaut otherwise.
      const modele = (portee.edges || []).find(function (e) {
        return e.from && e.from.step === etape.id && e.from.port === otherwise;
      });
      if (!modele) return;
      const conds = (etape.params.conditions) || [];
      connexions.push({
        id: 'conn-' + (++_seq),
        fromNode: _idWfd(etape.id),
        fromPort: conds.length,           // le port default suit les conditions
        toNode: _idWfd(modele.to.step),
        toPort: 0
      });
    });
  }

  // ── Entrée publique ───────────────────────────────────────────────────────

  function convertir(doc, options) {
    const opt = options || {};
    _resolutions = opt.resolutions || {};

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
