/**
 * pivot-validate.js — Contrôle structurel d'un document pivot
 *
 * Ne valide QUE ce qui ne dépend pas du catalogue des façades : la forme des
 * trois niveaux, la portée des arêtes, l'absence de propriétés déductibles,
 * la séparation de la présentation. La conformité des paramètres et des noms
 * de ports viendra avec le paquet Iconik, qui les déclare.
 *
 * Retourne { ok, erreurs[], avertissements[] }. Chaque entrée porte un `chemin`
 * qui situe le problème (`steps[2].params`, `edges[0].from`), parce qu'un
 * message sans emplacement oblige à chercher.
 */

const PivotValidate = (() => {

  const S = (typeof module !== 'undefined' && typeof require !== 'undefined')
    ? require('./pivot-schema.js')
    : window.PivotSchema;

  function _creerRapport() {
    const erreurs = [], avertissements = [];
    return {
      err(chemin, message) { erreurs.push({ chemin, message }); },
      avert(chemin, message) { avertissements.push({ chemin, message }); },
      resultat() {
        return { ok: erreurs.length === 0, erreurs, avertissements };
      }
    };
  }

  // ── Clés interdites ───────────────────────────────────────────────────────

  // Clés interdites. `portee` vaut 'etape' ou 'workflow' : la politique
  // d'erreur est bannie d'une étape, mais c'est au niveau du workflow qu'elle
  // se règle — le même nom n'a pas le même statut aux deux endroits.
  function _controlerClesInterdites(objet, chemin, r, portee) {
    if (!objet || typeof objet !== 'object') return;
    Object.keys(objet).forEach(function (cle) {
      if (S.CLES_DEDUCTIBLES[cle]) {
        r.err(chemin + '.' + cle, 'déductible, donc non stocké — ' + S.CLES_DEDUCTIBLES[cle]);
      } else if (S.CLES_PRESENTATION[cle]) {
        r.err(chemin + '.' + cle, 'présentation dans le modèle métier — ' + S.CLES_PRESENTATION[cle]);
      } else if (S.CLES_SUPPRIMEES[cle] && portee !== 'workflow') {
        r.err(chemin + '.' + cle, S.CLES_SUPPRIMEES[cle]);
      }
    });
  }

  // La notation `@…` a été retirée du format : ce qu'on croyait être une
  // propriété de ressource est une variable ordinaire produite par une étape.
  function _controlerNotationRetiree(valeur, chemin, r) {
    if (typeof valeur === 'string') {
      if (valeur.charAt(0) === '@') {
        r.err(chemin, 'notation `@` retirée du format — utiliser la variable produite par l\'étape');
      }
      return;
    }
    if (Array.isArray(valeur)) {
      valeur.forEach(function (v, i) { _controlerNotationRetiree(v, chemin + '[' + i + ']', r); });
      return;
    }
    if (valeur && typeof valeur === 'object') {
      Object.keys(valeur).forEach(function (k) {
        _controlerNotationRetiree(valeur[k], chemin + '.' + k, r);
      });
    }
  }

  // ── Une étape ─────────────────────────────────────────────────────────────

  function _controlerEtape(etape, chemin, r) {
    if (!etape || typeof etape !== 'object') {
      r.err(chemin, 'étape absente ou non objet');
      return;
    }

    if (!etape.id) {
      r.err(chemin + '.id', 'identifiant manquant');
    } else if (!S.RE_ID.test(etape.id)) {
      r.err(chemin + '.id', '`' + etape.id + '` — attendu un identifiant dérivé du nom métier (minuscules, chiffres, souligné)');
    }

    // Les trois niveaux.
    if (!etape.core) {
      r.err(chemin + '.core', 'niveau `core` manquant — toute étape en porte un');
    } else if (!S.estCore(etape.core)) {
      if (S.estDeclare(etape.core)) {
        r.err(chemin + '.core', '`' + etape.core + '` est déclaré mais hors première coupe — il entre au catalogue quand il sert');
      } else {
        r.err(chemin + '.core', '`' + etape.core + '` ne fait pas partie des 12 Core en service');
      }
    }

    if (etape.facade !== undefined && !S.RE_FACADE.test(etape.facade)) {
      r.err(chemin + '.facade', '`' + etape.facade + '` — attendu `paquet.nom`, par exemple `iconik.action`');
    }

    if (etape.preset !== undefined) {
      if (etape.facade === undefined) {
        r.err(chemin + '.preset', 'un preset est une pré-sélection de champs d\'une façade : `facade` est requis');
      }
      if (!S.RE_PRESET.test(etape.preset)) {
        r.err(chemin + '.preset', '`' + etape.preset + '` — minuscules, chiffres, souligné');
      }
    }

    // L'intention est requise : c'est ce qui manquait à WFD, où 49 nœuds sur 76
    // n'en portaient aucune. Un champ facultatif ne se remplit pas.
    if (!etape.intent || !String(etape.intent).trim()) {
      r.err(chemin + '.intent', 'intention métier manquante — elle nourrit le canevas, la documentation et les exports');
    }

    // Ressources désignées, jamais recopiées.
    if (etape.uses !== undefined) {
      if (typeof etape.uses !== 'object' || Array.isArray(etape.uses)) {
        r.err(chemin + '.uses', 'attendu un objet { manifest | tree | table: "nom" }');
      } else {
        Object.keys(etape.uses).forEach(function (genre) {
          if (!S.estRessource(genre)) {
            r.err(chemin + '.uses.' + genre, 'ressource inconnue — attendu ' + S.RESSOURCES.join(', '));
          }
        });
      }
    }

    _controlerClesInterdites(etape, chemin, r, 'etape');
    _controlerClesInterdites(etape.params, chemin + '.params', r, 'etape');
    _controlerNotationRetiree(etape.params, chemin + '.params', r);

    // Le corps de boucle est imbriqué, jamais déduit du graphe.
    if (etape.core === 'loop') {
      if (!etape.body) {
        r.err(chemin + '.body', 'une boucle porte son corps imbriqué — il ne se déduit pas des arêtes');
      } else {
        _controlerPortee(etape.body, chemin + '.body', r);
      }
      const p = etape.params || {};
      if (!p.over) r.err(chemin + '.params.over', 'sur quoi la boucle itère');
      if (!p.as)   r.err(chemin + '.params.as', 'nom de la variable de l\'élément courant');
    } else if (etape.body !== undefined) {
      r.err(chemin + '.body', 'seule une boucle porte un corps');
    }
  }

  // ── Une portée : des étapes et leurs arêtes ───────────────────────────────
  // Une arête ne traverse jamais une frontière de corps. C'est le prix de la
  // portée explicite, et ce qui rend la vérification possible : dans le graphe
  // plat, il fallait calculer l'accessibilité pour retrouver les frontières.

  function _controlerPortee(portee, chemin, r) {
    const etapes = portee.steps;
    if (!Array.isArray(etapes)) {
      r.err(chemin + '.steps', 'attendu un tableau d\'étapes');
      return;
    }

    const vus = Object.create(null);
    etapes.forEach(function (etape, i) {
      const c = chemin + '.steps[' + i + ']';
      _controlerEtape(etape, c, r);
      if (etape && etape.id) {
        if (vus[etape.id]) r.err(c + '.id', '`' + etape.id + '` déjà utilisé dans cette portée');
        vus[etape.id] = true;
      }
    });

    const aretes = portee.edges || [];
    if (!Array.isArray(aretes)) {
      r.err(chemin + '.edges', 'attendu un tableau d\'arêtes');
      return;
    }

    aretes.forEach(function (arete, i) {
      const c = chemin + '.edges[' + i + ']';
      if (!arete || !arete.from || !arete.to) {
        r.err(c, 'arête incomplète — `from` et `to` sont requis');
        return;
      }
      if (!arete.from.port) {
        r.err(c + '.from.port', 'port nommé requis — jamais un index de position');
      }
      if (typeof arete.from.port === 'number') {
        r.err(c + '.from.port', 'index positionnel : réordonner une sortie casserait la liaison');
      }
      ['from', 'to'].forEach(function (bout) {
        const id = arete[bout] && arete[bout].step;
        if (!id) {
          r.err(c + '.' + bout + '.step', 'étape non désignée');
        } else if (!vus[id]) {
          r.err(c + '.' + bout + '.step', '`' + id + '` hors de cette portée — une arête ne traverse pas une frontière de corps');
        }
      });

      // `set` sur arête est banni. Le cas qui semblait le réclamer — plusieurs
      // issues écrivant le même champ — ne le réclame pas : le workflow STATUSES
      // réel n'a pas de convergence, chaque issue a sa propre étape terminale qui
      // écrit sa valeur en dur. Le format n'a donc rien à ajouter, et une arête
      // ne porte jamais d'affectation, qui aurait fini par accueillir des
      // expressions.
      if (arete.set !== undefined) {
        r.err(c + '.set', 'affectation sur arête interdite — chaque issue a sa propre étape terminale');
      }
    });
  }

  // ── Présentation ──────────────────────────────────────────────────────────

  function _controlerPresentation(doc, r) {
    const p = doc.presentation;
    if (!p) {
      r.err('presentation', 'section manquante — positions et sauts de page vivent hors du modèle métier');
      return;
    }
    if (p.versioned !== false) {
      r.err('presentation.versioned', 'attendu false — déplacer un nœud n\'est pas modifier un workflow');
    }

    const racine = (doc.steps || []).reduce(function (acc, e) {
      if (e && e.id) acc[e.id] = e;
      return acc;
    }, Object.create(null));

    Object.keys(p.layout || {}).forEach(function (id) {
      if (!racine[id]) r.err('presentation.layout.' + id, 'aucune étape de ce nom');
    });

    Object.keys(p.bodyLayout || {}).forEach(function (idBoucle) {
      const boucle = racine[idBoucle];
      if (!boucle) {
        r.err('presentation.bodyLayout.' + idBoucle, 'aucune étape de ce nom');
        return;
      }
      if (boucle.core !== 'loop') {
        r.err('presentation.bodyLayout.' + idBoucle, 'seule une boucle porte un corps à disposer');
        return;
      }
      const dedans = ((boucle.body || {}).steps || []).reduce(function (acc, e) {
        if (e && e.id) acc[e.id] = true;
        return acc;
      }, Object.create(null));
      Object.keys(p.bodyLayout[idBoucle]).forEach(function (id) {
        if (!dedans[id]) {
          r.err('presentation.bodyLayout.' + idBoucle + '.' + id, 'aucune étape de ce nom dans le corps');
        }
      });
    });
  }

  // ── Entrée publique ───────────────────────────────────────────────────────

  function valider(doc) {
    const r = _creerRapport();

    if (!doc || typeof doc !== 'object') {
      r.err('', 'document absent ou non objet');
      return r.resultat();
    }

    if (!doc.pivot) r.err('pivot', 'version du format manquante');
    if (doc.form && doc.form !== 'canonical' && doc.form !== 'exchange') {
      r.err('form', '`' + doc.form + '` — attendu `canonical` ou `exchange`');
    }

    const w = doc.workflow;
    if (!w) {
      r.err('workflow', 'en-tête manquant');
    } else {
      if (!w.id) r.err('workflow.id', 'identifiant manquant');
      if (!w.intent || !String(w.intent).trim()) {
        r.err('workflow.intent', 'intention manquante — ce que le workflow fait, en une phrase');
      }
      if (w.version === undefined) {
        r.err('workflow.version', 'version manquante — un run et un export doivent pouvoir la citer');
      }
      if (w.status && S.STATUTS.indexOf(w.status) === -1) {
        r.err('workflow.status', '`' + w.status + '` — attendu ' + S.STATUTS.join(' ou '));
      }
      _controlerClesInterdites(w, 'workflow', r, 'workflow');
    }

    _controlerPortee({ steps: doc.steps, edges: doc.edges }, '', r);
    _controlerPresentation(doc, r);

    return r.resultat();
  }

  return { valider, validate: valider };

})();

if (typeof module !== 'undefined') module.exports = PivotValidate;
if (typeof window !== 'undefined') window.PivotValidate = PivotValidate;
