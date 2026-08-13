/**
 * pivot-catalog-iconik.js — Paquet de plateforme Iconik
 *
 * Ce que pivot-schema.js laissait au catalogue : les ports de chaque Core et le
 * dépliage de chaque façade. Rien n'est inventé ici — chaque entrée décrit ce
 * que wfd-engine-handlers.js exécute déjà, vérifié sur les six flows de
 * production et sur la table WfdHandlers (33 familles + loop hors executor).
 *
 * Le paquet répond à deux questions que le format seul ne peut trancher :
 *   — quels ports une étape expose (donc quelles arêtes sont valides) ;
 *   — vers quel Core une façade se déplie, et par quel `httpMode`.
 *
 * Un port unique implicite se nomme `out`. Les familles qui branchent déclarent
 * leurs ports. `decision` est le seul dont les ports se calculent depuis la
 * configuration : `out-0`..`out-N` selon les conditions, plus `default`.
 */

const PivotCatalogIconik = (() => {

  // ── CE QU'UNE ÉTAPE LIT SANS LE DIRE ─────────────────────────────────────
  // Pendant de `variables` : ce qu'une étape CONSOMME, quand la référence
  // n'apparaît dans aucun de ses paramètres. Quatre handlers filtrent leurs
  // essences / contrôles / lignes de journal par le NIVEAU de l'objet courant,
  // et lisent pour cela `ctx.vars.TypeCollection` — vérifié :
  // builder-handler-deliver.js:163, builder-handler-verify.js:61,
  // builder-handler-history.js:56, builder-handler-iconik-resolve-ancestors.js:22.
  //
  // Rien ne l'écrivait nulle part, parce que dans le moteur natif la valeur est
  // d'ambiance : le Search la pose à plat, tout le monde la trouve. Aucune autre
  // cible n'a d'ambiance — chez ASL la portée d'un Map ne reçoit QUE ce que son
  // ItemSelector projette. Une lecture qu'on ne déclare pas est une lecture qui
  // ne franchit aucune frontière de portée, et le corps de boucle lisait donc
  // dans le vide sans que rien ne le signale.
  //
  // `objet` dit de QUI la métadonnée est lue : c'est la collection publiée, pas
  // l'asset en cours. Sans ce mot, un émetteur la relit du dernier Search venu —
  // et sur PUBLISH le dernier Search avant la boucle cherche des ASSETS.
  const LIT_NIVEAU = function () {
    return [{ nom: 'TypeCollection', objet: 'collection',
              aide: 'niveau de la collection publiée — filtre ce qui s\'applique ici' }];
  };

  // ── LA REQUÊTE D'UNE RECHERCHE ICONIK ────────────────────────────────────
  // Le vocabulaire du pivot (`op`, `field`, `value`) vers la syntaxe `query`
  // d'Iconik, qui est du Lucene. Transcrit de `_apsSearchCritToQueryTerm`
  // (wfd-engine-handlers.js:4368) — pas réinventé : une recherche qui filtre
  // autrement que le moteur natif ne ramènerait pas les mêmes objets, et
  // l'écart ne se verrait qu'au comptage des résultats.
  //
  // Les `{références}` sont laissées TELLES QUELLES : c'est l'émetteur qui sait
  // les adresser dans sa cible. Le catalogue dit la forme, pas l'adresse.
  const TYPES_RECHERCHE = {
    asset: 'assets', collection: 'collections', segment: 'segments',
    saved_search: 'saved_searches', format: 'formats', storage: 'storages',
  };

  // Les champs qu'Iconik porte en propre. Tout le reste est une métadonnée, et
  // se cherche sous `metadata.<nom>`. Se tromper de préfixe rend zéro résultat
  // sans erreur — le pire des silences.
  const CHAMPS_SYSTEME = ['id', 'title', 'media_type', 'date_created', 'date_modified',
                          'object_type', 'status', 'archive_status', 'external_id'];

  function echapper(v) {
    return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function termeDe(crit, type) {
    if (!crit || !crit.field) return null;
    const op = crit.op || 'equals';

    // Chercher DANS une collection. Le nom du champ dépend de ce qu'on
    // cherche, pas de la case cochée : un asset n'a pas de `parent_id`.
    // Bug corrigé le 14/07/2026 dans le moteur, reporté ici tel quel —
    // `in_collections` retrouve les assets, `parent_id` les collections
    // filles ; deux champs Iconik distincts, pas interchangeables.
    if (crit.field === '__collection__') {
      const nom = op === 'in_branch' ? 'ancestor_collections'
                : (type === 'collections' ? 'parent_id' : 'in_collections');
      return nom + ':"' + (crit.value || '') + '"';
    }

    const champ = CHAMPS_SYSTEME.indexOf(crit.field) !== -1
      ? crit.field : 'metadata.' + crit.field;
    // ÉCHAPPEMENT : possible sur une valeur littérale, impossible sur une
    // référence. Le moteur natif résout PUIS échappe ; à l'émission la valeur
    // n'existe pas encore. Un titre contenant un guillemet casserait donc la
    // requête. Sans conséquence sur les flux actuels — ce sont des UUID — mais
    // c'est un écart réel avec le moteur, pas une équivalence.
    const brut = crit.value || '';
    const v = brut.indexOf('{') !== -1 ? brut : echapper(brut);
    switch (op) {
      case 'equals':       return champ + ':"' + v + '"';
      case 'not_equals':   return 'NOT ' + champ + ':"' + v + '"';
      case 'contains':     return champ + ':*' + v + '*';
      case 'not_contains': return 'NOT ' + champ + ':*' + v + '*';
      case 'starts_with':  return champ + ':' + v + '*';
      case 'is_empty':     return 'NOT _exists_:' + champ;
      case 'is_not_empty': return '_exists_:' + champ;
      case 'before':       return champ + ':<"' + v + '"';
      case 'after':        return champ + ':>"' + v + '"';
      case 'gt':           return champ + ':>' + v;
      case 'lt':           return champ + ':<' + v;
      case 'is_true':      return champ + ':true';
      case 'is_false':     return champ + ':false';
      // `contains_any` / `contains_all` découpent la valeur sur les virgules.
      // Impossible quand la valeur est une référence résolue à l'exécution :
      // on ne découpe pas ce qu'on ne connaît pas encore. Non déclarés plutôt
      // que découpés au jugé.
      default: return null;
    }
  }

  // Rend `{ query, refuses }`. UN CRITÈRE INTRADUISIBLE INVALIDE TOUTE LA
  // REQUÊTE, et c'est un choix. Le moteur natif se contente d'avertir et de
  // sauter le terme ; recopier ce comportement ici émettrait une recherche
  // plus LARGE que celle voulue, qui ramènerait des objets en trop sans que
  // rien ne le signale. C'est la même règle que pour les aiguillages : un
  // filtre qui trie faux est pire qu'un filtre manquant. L'appelant rend alors
  // `null`, l'étape retombe sur le gabarit générique et se compte comme non
  // décrite — visible, plutôt que silencieusement fausse.
  function requeteDe(criteres, type) {
    const parts = [];
    const refuses = [];
    (criteres || []).forEach(function (c) {
      const t = termeDe(c, type);
      if (!t) { refuses.push((c && c.op) || '(sans op)'); return; }
      if (parts.length) parts.push(c.join === 'OR' ? 'OR' : 'AND');
      parts.push(t);
    });
    return { query: parts.length ? '(' + parts.join(' ') + ')' : '', refuses: refuses };
  }

  // ── Les 12 Core : ports fixes, ou règle de calcul ────────────────────────
  // `ports` liste les sorties. `dynamicPorts` signale que la liste se calcule
  // depuis la config — le validateur de contenu l'appellera plutôt que de lire
  // une liste figée.

  const CORES = {
    trigger:       { ports: ['out'] },
    decision:      { ports: ['default'], dynamicPorts: 'conditions' },
    loop:          { ports: ['out'], hasBody: true },
    // Vérifié : checker(), builder-handler-verify.js:146-147 — pose TOUJOURS
    // ces deux-là, quel que soit le verdict. `checkerSummary` est lu tel quel
    // par les messages d'historique de STATUSES et du callback.
    verify:        { ports: ['ok', 'fail', 'error'],
      lectures: LIT_NIVEAU,
      variables: function () {
        return [
          { nom: 'checkerResult',  aide: 'verdict complet (failures[])' },
          { nom: 'checkerSummary', aide: 'résumé lisible des contrôles en échec' }
        ];
      }
    },
    wait:          { ports: ['out', 'timeout', 'error'] },
    set_variable:  { ports: ['out'] },
    transform:     { ports: ['out'] },
    // Vérifié : lookup(), wfd-engine-handlers.js:995+ — lit `cfg.lkInputVar`,
    // écrit dans `cfg.lkOutputVar` (jamais `cfg.resultVar`, malgré la case
    // "Store result as" que config-schema.js ajoute génériquement à ce Core —
    // un champ mort pour lookup spécifiquement, pas déclaré ici en
    // conséquence : mieux vaut une liste courte et vraie qu'une supposition.
    lookup:        { ports: ['found', 'not_found'],
      variables: function (etape) {
        const v = (etape.params || {}).lkOutputVar;
        return v ? [{ nom: v, aide: 'objet traduit par Lookup' }] : [];
      }
    },
    http_request:  { ports: ['out', 'error'] },
    http_sequence: { ports: ['out', 'err'] },
    history:       { ports: ['out', 'error'], lectures: LIT_NIVEAU },
    // Deliver pose une variable PAR ESSENCE du manifeste — leur nom est le
    // champ `sortie` de chacune (`s3_cover_url`, `s3_video_url`…), et le
    // handler les écrit depuis le listing S3 (builder-handler-deliver.js).
    //
    // Elles n'étaient déclarées NULLE PART, alors que le manifeste les nomme
    // noir sur blanc. Conséquence mesurée le 2026-08-12 sur PUBLISH : sept des
    // huit références « sans origine déclarée » de l'analyse d'émission sont
    // ces sorties-là. Elles passaient pour des variables d'ambiance — c'est-à-
    // dire pour une dépendance intraduisible — alors qu'une étape du workflow
    // les produit et le dit. Ni Make ni ASL n'ont d'espace de noms global : une
    // référence non déclarée ne survit à aucun portage, et celles-ci n'avaient
    // aucune raison d'en être.
    //
    // `incertain` parce qu'une essence hors du niveau courant n'est PAS posée
    // (filtre `appliesTo`) : la variable existe dans le contrat, pas forcément
    // à l'exécution. L'analyse statique ne connaît pas le niveau.
    deliver:       { ports: ['out', 'miss', 'error'],
      lectures: LIT_NIVEAU,
      variables: function (etape, resolutions) {
        const p = etape.params || {};
        const out = [];
        if (p.resultVar) out.push({ nom: p.resultVar, aide: 'résultat du listing S3' });
        const manifeste = resolutions && resolutions.manifests && p.manifestId
          ? resolutions.manifests[p.manifestId] : null;
        // `s3Mappings` est la forme déjà résolue (format d'échange WFD) ;
        // `essences` la forme d'origine de la ressource. On lit celle qu'on a.
        const essences = manifeste ? (manifeste.essences || []) : (p.s3Mappings || []);
        essences.forEach(function (e) {
          const nom = e.sortie || e.variable;
          if (!nom) return;
          out.push({ nom: nom, incertain: true,
                     aide: 'URL S3 de l\'essence « ' + (e.role || e.type || '?') + ' », si elle s\'applique à ce niveau' });
        });
        return out;
      }
    },
    // Post-it : annotation visuelle, portée de WFD (family `postit`,
    // wfd-components.js:72). Aucun port — donc jamais d'arête, donc jamais
    // exécuté ni atteint par le parcours. `annotation: true` est le drapeau
    // que lisent le convertisseur, le validateur et le volet API ops pour
    // l'écarter sans avoir à tester son nom : ce n'est pas une étape du
    // workflow, c'est ce qu'on écrit dans la marge.
    postit:        { ports: [], annotation: true }
  };

  // Sorties d'une décision dans le format : les libellés de ses conditions,
  // plus le défaut. Choix B — le pivot route par libellé, lisible pour un
  // designer ; c'est le convertisseur pivot → WFD qui rétablit la fidélité au
  // moteur en traduisant chaque libellé vers son index (`out-0`..`out-N`) selon
  // l'ordre des conditions. L'index ne paraît jamais dans le format.
  function portsDecision(etape) {
    const conds = ((etape.params || {}).conditions) || [];
    const p = conds.map(function (cond, i) {
      return (cond && cond.label) ? cond.label : ('out-' + i);
    });
    if (p.indexOf('default') === -1) p.push('default');
    return p;
  }

  // Répare au chargement les arêtes de décision écrites avant le correctif
  // de portsWfd() (id de port 'out-N' au lieu du libellé réel de la
  // condition) — trouvé en base sur des flows publiés (PUBLISH, CREER
  // SAISON, 30 arêtes cassées au total le 2026-08-05). Une telle arête
  // n'a jamais pu être empruntée à l'exécution (le moteur renvoie le
  // libellé, jamais 'out-N') : la réparer ici ne casse rien qui marchait,
  // elle rend juste fonctionnel ce qui était déjà silencieusement mort.
  // Si l'index ne correspond plus à une condition existante, l'arête reste
  // inchangée (déjà morte, visible telle quelle plutôt que supprimée).
  function normaliserAretesDecision(steps, edges) {
    const parId = {};
    (steps || []).forEach(function (s) { parId[s.id] = s; });
    return (edges || []).map(function (e) {
      const m = e.from && typeof e.from.port === 'string' && e.from.port.match(/^out-(\d+)$/);
      if (!m) return e;
      const source = parId[e.from.step];
      if (!source || source.core !== 'decision') return e;
      const conds = ((source.params || {}).conditions) || [];
      const cond = conds[Number(m[1])];
      if (!cond || !cond.label) return e;
      return Object.assign({}, e, { from: Object.assign({}, e.from, { port: cond.label }) });
    });
  }

  // Décoration des ports pour la régénération WFD : label et couleur, que le
  // pivot ne stocke pas. Propriétés stables de la famille, relevées sur les
  // flows de production. Le validateur, lui, ne consulte que les id ci-dessus ;
  // seul le convertisseur pivot → WFD lit cette table. Les deux préoccupations
  // restent séparées : « ce port est-il valide ? » d'un côté, « à quoi
  // ressemble-t-il dans WFD ? » de l'autre.
  const DECOR = {
    trigger:       { out: ['Suite', '#27ae60'] },
    loop:          { out: ['Suite', '#27ae60'] },
    verify:        { ok: ['Tout validé', '#27ae60'], fail: ['Échec', '#e74c3c'], error: ['Erreur HTTP', '#e67e22'] },
    wait:          { out: ['Condition remplie', '#27ae60'], timeout: ['Timeout', '#e67e22'], error: ['Erreur', '#e74c3c'] },
    set_variable:  { out: ['Suite', '#27ae60'] },
    transform:     { out: ['Suite', '#27ae60'] },
    lookup:        { found: ['Trouvé', '#27ae60'], not_found: ['Non trouvé', '#e74c3c'] },
    http_request:  { out: ['Succès', '#27ae60'], error: ['Erreur', '#e74c3c'] },
    http_sequence: { out: ['Succès', '#27ae60'], err: ['Échec', '#e74c3c'] },
    history:       { out: ['Écrit', '#1abc9c'], error: ['Erreur', '#e74c3c'] },
    deliver:       { out: ['Succès', '#ff9900'], miss: ['Non trouvé', '#e67e22'], error: ['Erreur', '#e74c3c'] }
  };

  // Décoration des ports de façade, quand elle diffère de son Core.
  const DECOR_FACADE = {
    'iconik.search': { found: ['Résultats trouvés', '#8e44ad'], empty: ['Aucun résultat', '#e67e22'], error: ['Erreur', '#e74c3c'] },
    'aws_s3.deliver': { out: ['Succès', '#ff9900'], miss: ['Non trouvé', '#e67e22'], error: ['Erreur', '#e74c3c'] },
    'iconik.fetch': { out: ['Trouvé', '#27ae60'], not_found: ['Non trouvé', '#e74c3c'] }
  };

  const COULEUR_DECISION = ['#2ecc71', '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];

  // ── Les façades : Core visé, mode HTTP, ports (hérités ou spécialisés) ────
  // `httpMode` reprend l'axe de handleHttpRequest : simple | action | foreach |
  // verify. `family` est le nom WFD d'origine, pour tracer d'où vient la façade.

  const FACADES = {
    'iconik.trigger': {
      core: 'trigger', family: 'trigger',
      presets: {
        custom_action: { field: 'customActionId' },
        schedule:      { note: 'un cron sans plateforme est un trigger Core pur, sans façade' }
      },
      // Vérifié : wfd-engine-executor.js:178-194 — l'exécuteur peuple TOUJOURS
      // les deux formes (plate `collection_id` ET imbriquée `collection.id`)
      // pour l'id de l'objet déclencheur, selon `context` — les deux
      // résolvent la MÊME valeur (`resolvePath` retombe sur `ctx.vars` si la
      // forme imbriquée n'existe pas). Une seule est montrée ici : proposer
      // les deux synonymes au designer n'ajoute rien, ça n'ajoute que la
      // question "laquelle choisir ?" (retour utilisateur du 3 août — WFD
      // avait déjà ce défaut).
      variables: function (etape) {
        const ctx = (etape.params || {}).context;
        if (ctx === 'ASSET') return [
          { nom: 'asset.id', aide: 'id de l\'asset déclencheur' }
        ];
        if (ctx === 'COLLECTION') return [
          { nom: 'collection.id', aide: 'id de la collection déclencheuse' }
        ];
        return [];   // context pas encore choisi dans le panneau
      }
    },

    // Remonte la hiérarchie éditoriale (Série/Saison/Episode/Unitaire) pour
    // construire le chemin de destination S3, en un seul nœud — remplace les
    // 3-4 Fetch répétés par branche du vieux flow WFD (Fetch Série / Fetch
    // Saison / Fetch Saison Titre), cf. journal-aps-2026-08-03.md. Handler
    // dédié (resolve_ancestors()), pas de httpMode.
    //
    // Portable : recherche par BayardID (identifiant métier), aucun appel à
    // l'état interne d'APS — contrairement à `aps.registry` en mode Numeric,
    // qui dépend de BayardRegistry (base d'APS). N'importe quel moteur
    // capable d'appeler l'API Iconik reproduit le même algorithme.
    'iconik.resolve_ancestors': {
      core: 'http_request', family: 'resolve_ancestors',
      ports: ['out', 'error'],
      lectures: LIT_NIVEAU,
      variables: function (etape) {
        const v = (etape.params || {}).varName || 'ancestorPath';
        return [{ nom: v, aide: 'chemin S3 assemblé depuis la chaîne des ancêtres' }];
      }
    },

    // Pas de httpMode : fetch() a son propre handler nommé (dispatché sur
    // node.family, wfd-engine-executor.js:299) — handleHttpRequest n'est
    // jamais appelé pour cette famille, contrairement à ce qu'un httpMode
    // suggérerait. Port 1 nommé `not_found`, pas `error` : le handler ne
    // retourne JAMAIS un port dédié aux erreurs — les vraies exceptions sont
    // levées (throw) et tranchées par cfg.onError au niveau de l'exécuteur
    // (stop | continue_log→port 0 | continue→port 0) ; le seul routage
    // explicite vers le port 1 est un cas "non trouvé" (collection/asset
    // introuvable), jamais une erreur HTTP.
    'iconik.fetch': {
      core: 'http_request', family: 'fetch',
      ports: ['out', 'not_found'],
      // Vérifié : builder-handler-iconik-fetch.js, quatre sous-types qui ne
      // rangent PAS la même chose — d'où l'aiguillage, recopié de :22-25.
      //
      // `gabaritSous` est le mécanisme que `depuis` ne couvrait pas : ici le
      // suffixe d'une référence n'est pas recopié, il est TRANSFORMÉ.
      // `{serieMetadata.TypeCollection}` ne vaut pas « …ResponseBody.
      // TypeCollection » mais « …metadata_values.TypeCollection.field_values
      // [0].value » (:148-155). Une adresse recopiée au lieu d'être traduite
      // reste un JSONPath valide, que la cible accepte et qui lit du vide.
      //
      // Ce qui n'est PAS déclaré, et pourquoi : `<var>_metadata`,
      // `<var>_keyframes` et les champs NUS posés par `withMetadata` (:211)
      // viennent d'un SECOND appel HTTP, pas de la réponse de celui-ci. Aucun
      // chemin ne les rend — chez une cible sans logique, ce sont des états
      // supplémentaires à émettre, pas des adresses. Les laisser sans adresse
      // les fait signaler, ce qui est le comportement voulu.
      variables: function (etape) {
        const p = etape.params || {};
        const sub = p.fetchSubType || (p.savedSearchId ? 'savedsearch'
          : p.fetchType === 'collection' ? 'collection'
          : (p.fetchTarget === 'metadata' || p.fetchMdView) ? 'metadata'
          : 'asset');
        if (sub === 'savedsearch') {
          const v = p.savedSearchVar || 'search_results';
          return [
            { nom: v, depuis: '', aide: 'réponse de la recherche enregistrée' },
            // Une LONGUEUR, pas un champ de la réponse (:38) : aucune adresse
            // ne la rend, il faut la calculer (States.ArrayLength chez ASL).
            { nom: v + '_count', aide: 'nombre de résultats' }
          ];
        }
        if (sub === 'collection') {
          const v = p.fetchVar || p.storeAs || 'collection';
          return [
            { nom: v, depuis: '', aide: 'la collection trouvée' },
            { nom: v + '.id',        aide: 'identifiant de la collection' },
            { nom: v + '.title',     aide: 'titre de la collection' },
            { nom: v + '.parent_id', aide: 'identifiant de la collection parente' }
          ];
        }
        if (sub === 'metadata') {
          const v = p.fetchVar || p.storeAs || 'metadata';
          return [{ nom: v, depuis: '', aide: 'métadonnées de l\'objet visé',
                    // Les NOMS de champs dépendent de l'organisation : le
                    // catalogue ne peut pas les lister (même honnêteté que
                    // pour l'aplatissement d'un Search). Il peut, lui, dire où
                    // ils vivent — ce qui suffit à les adresser tous.
                    gabaritSous: 'metadata_values.{}.field_values[0].value' }];
        }
        const v = p.fetchVar || p.storeAs || 'asset';
        const out = [{ nom: v, depuis: '', aide: 'l\'asset trouvé' }];
        if (p.withMetadata) out.push({ nom: v + '_metadata', aide: 'métadonnées — SECOND appel' });
        if (p.withKeyframes) {
          out.push({ nom: v + '_keyframes',   aide: 'keyframes — SECOND appel' });
          out.push({ nom: v + '_keyframe_url', aide: 'URL de la première keyframe', incertain: true });
        }
        return out;
      },

      // ── LES APPELS D'UN FETCH D'ASSET ────────────────────────────────────
      // Le commentaire de `variables` ci-dessus le disait déjà : `<var>_metadata`
      // et `<var>_keyframes` viennent de SECONDS appels HTTP, pas de la réponse
      // du premier. C'est écrit ici, maintenant — deux états quand
      // `withMetadata` est coché, trois avec `withKeyframes`.
      //
      // REFUSÉ : `withFormats`. Il déclenche `_extractTechnical`, qui liste les
      // file sets puis BOUCLE sur les formats (wfd-engine-handlers.js:590-610).
      // Une boucle, pas un appel — ce serait un Map à émettre, et rien ne
      // s'émet au jugé. Refusés aussi : les sous-types autres qu'`asset`, dont
      // `collection` par chemin, qui cherche puis vérifie les ancêtres (:721).
      appel: function (etape) {
        const p = etape.params || {};
        if ((p.fetchSubType || 'asset') !== 'asset') return null;
        if (p.withFormats) return null;
        const src = p.fetchSource || 'triggered';
        if (src !== 'id' && src !== 'triggered') return null;

        const id = p.fetchValue || '{asset.id}';
        const appels = [{ role: 'asset', methode: 'GET',
                          chemin: '/API/assets/v1/assets/' + id + '/' }];
        if (p.withMetadata) {
          const vue = p.fetchMdViewId || p.withMetadataViewId || p.fetchMdView || '';
          // Le moteur ne protège PAS cette lecture-ci — pas de try/catch,
          // contrairement à la relecture de set_metadata : un 404 y remonte.
          // On ne pardonne donc pas non plus. La différence est dans le moteur,
          // pas dans notre interprétation.
          appels.push({ role: 'metadonnees', methode: 'GET',
                        chemin: '/API/metadata/v1/assets/' + id + '/'
                              + (vue ? 'views/' + vue + '/' : '') });
        }
        if (p.withKeyframes) {
          // Celle-là si (:908-915) : le moteur range un objet vide en cas
          // d'échec et poursuit.
          appels.push({ role: 'keyframes', methode: 'GET',
                        chemin: '/API/files/v1/assets/' + id + '/keyframes/',
                        tolereAbsence: true });
        }
        return appels;
      }
    },

    'iconik.search': {
      core: 'http_request', family: 'aps_search', httpMode: 'simple',
      // La famille la plus fréquente (20 usages), sans handler dédié : elle
      // passe par handleHttpRequest, donc c'est bien une façade, pas un Core.
      ports: ['found', 'empty', 'error'],
      modes: ['retrieve', 'presence'],
      // Vérifié : aps_search(), wfd-engine-handlers.js:4157-4210. `resultVar`
      // (défaut 'search_results') porte TOUJOURS le tableau brut + son compte.
      // Quand le résultat est UNIQUE (cas le plus fréquent : "l'objet précis
      // existe-t-il ?"), le moteur aplatit aussi id/title/object_type/
      // external_id, sous les deux formes (prefixée ET nue) — et fait de même
      // pour CHAQUE métadonnée du résultat, mais celles-ci ne se devinent pas
      // depuis le catalogue seul (dépend de l'objet réellement trouvé) : le
      // sélecteur les complète séparément depuis la vraie liste des champs de
      // l'org (ConfigSources), marquées "si présent" plutôt que certaines.
      // `depuis` : le champ de la RÉPONSE Iconik où la valeur se relit — pour
      // une cible sans espace de noms global (cf. `iconik.action`). Heureuse
      // coïncidence, vérifiée : `storeResult` recopie la forme d'Iconik
      // (`{objects, total}`), donc le chemin est le même des deux côtés.
      // Les formes NUES (`id`, `title`…) n'en reçoivent pas : deux Search dans
      // la même portée les écrasent l'une l'autre, et rien ne dit laquelle un
      // `{id}` isolé désigne. Mieux vaut les laisser sans adresse — un émetteur
      // les signalera — que d'en désigner une au hasard.
      variables: function (etape) {
        const rv = (etape.params || {}).resultVar || 'search_results';
        const champsUniques = ['id', 'title', 'object_type', 'external_id'];
        const out = [
          { nom: rv, aide: 'tableau JSON des objets trouvés', depuis: 'objects' },
          // Forme stockée, celle que lisent les boucles (`{X.objects}`) :
          // storeResult() la pose en plus du setVar — vérifié
          // builder-handler-iconik-search.js:61-62.
          { nom: rv + '.objects', aide: 'le même tableau, forme stockée', depuis: 'objects' },
          { nom: rv + '.count', aide: 'nombre de résultats', depuis: 'total' }
        ];
        champsUniques.forEach(function (c) {
          out.push({ nom: c, aide: 'si un seul résultat — ' + c, incertain: true });
          out.push({ nom: rv + '.' + c, aide: 'même valeur, forme préfixée', incertain: true,
                     depuis: 'objects[0].' + c });
        });
        // Infos techniques (withFormats, 4 août) : posées par _extractTechnical
        // (wfd-engine-handlers.js) UNIQUEMENT si la case est cochée ET qu'un
        // seul asset est trouvé — mêmes conditions que champsUniques ci-dessus.
        if ((etape.params || {}).withFormats) {
          [
            ['duration', 'durée en secondes'],
            ['duration_ms', 'durée en millisecondes'],
            ['width', 'largeur vidéo (px)'],
            ['height', 'hauteur vidéo (px)'],
            ['video_quality', 'SD/HD/UHD, déduit de la résolution'],
            ['video_codec', 'codec vidéo'],
            ['fps', 'images par seconde'],
            ['bitrate', 'débit global'],
            ['container', 'format conteneur'],
            ['file_size', 'taille du fichier'],
            ['audio_tracks', 'nombre de pistes audio'],
            ['audio_codec', 'codec audio'],
            ['filename', 'nom du fichier source'],
            ['filename_noext', 'nom du fichier source, sans extension']
          ].forEach(function (pair) {
            out.push({ nom: pair[0], aide: pair[1] + ' — si un seul asset trouvé', incertain: true });
          });
        }
        return out;
      },
      // Vrai uniquement en mode 'retrieve' (mode par défaut) : en mode
      // 'presence', le moteur n'aplatit RIEN (c'est un test, pas une source de
      // données — wfd-engine-handlers.js:4175-4180). Le sélecteur doit le
      // savoir pour ne pas proposer des champs qui n'existeront jamais.
      metadonneesAplatiesSi: function (etape) { return ((etape.params || {}).mode || 'retrieve') !== 'presence'; },
      // OÙ vit une métadonnée aplatie, dans la réponse. Le pendant de
      // `metadonneesAplatiesSi` : celui-ci dit QUE l'étape aplatit, celui-là
      // dit OÙ relire ce qu'elle a aplati. La formule était écrite en dur dans
      // l'émetteur ASL, qui n'avait aucun moyen de la connaître — un émetteur
      // n'a pas à savoir comment Iconik range ses métadonnées.
      gabaritMetadonnee: 'objects[0].metadata.{}',

      // ── L'APPEL, ET CE QU'IL REFUSE DE TRADUIRE ──────────────────────────
      // Un Search APS n'est PAS une requête : c'est N blocs, chaînables
      // parent → enfant, avec une expression booléenne qui choisit lesquels
      // sont actifs (`_apsSearchEvalExpression`). Un bloc enfant attend les
      // identifiants du parent : la chaîne a une dépendance de données, donc
      // autant d'états que de blocs.
      //
      // On ne déclare QUE le cas à un bloc. Les sept workflows n'utilisent que
      // celui-là — vérifié : trois Search sur PUBLISH, un bloc chacun, sans
      // expression ni parent. Le reste retombe sur le gabarit générique et se
      // compte comme non décrit, ce qui est la vérité. Émettre un chaînage
      // jamais observé serait inventer.
      appel: function (etape) {
        const p = etape.params || {};
        const blocs = p.blocks || [];
        if (blocs.length !== 1) return null;
        if ((p.expression || '').trim()) return null;
        if (blocs[0].parentBlock != null) return null;

        const b = blocs[0];
        const type = TYPES_RECHERCHE[b.objectType] || b.objectType || 'assets';
        const req = requeteDe(b.criteria || [], type);
        if (req.refuses.length) return null;      // voir requeteDe : tout ou rien
        return [{
          role: 'chercher', methode: 'POST',
          chemin: '/API/search/v1/search/',
          corps: {
            doc_types: [type],
            // `query`, pas `filters`. Vérifié en direct le 14/07/2026 et
            // consigné dans le handler : cet endpoint IGNORE le tableau
            // `filters` — il est envoyé vide pour la seule forme, et jamais
            // peuplé. Un émetteur qui déduirait `filters` du pivot produirait
            // une recherche non filtrée qui a l'air juste.
            query: req.query,
            filters: [],
            limit: p.limit || 500,
            offset: 0,
          },
        }];
      }
    },

    'iconik.action': {
      core: 'http_request', family: 'action', httpMode: 'action',
      // Le mode action lit sa cible depuis la connexion (_handleHttpAction).
      ports: ['out', 'error'],
      presets: {
        export_location: { note: 'déclenche une export location Iconik' }
      },
      // Vérifié : builder-handler-iconik-action.js:148 et :176 — deux actions
      // sur les onze posent une variable, et le nom qu'elles posent est fixe.
      //
      // `depuis` est le champ de la RÉPONSE d'où la valeur sort. Une variable
      // rangée telle quelle par l'appel se réadresse dans n'importe quelle
      // cible (`<résultat>.job_id`) ; une variable que le handler CALCULE, non.
      // La distinction n'existait pas : elle est ce qui sépare une référence
      // portable d'une référence qui demande du code. Sans elle, `exportJobId`
      // passait pour une métadonnée d'ambiance dans l'analyse d'émission —
      // c'est-à-dire pour intraduisible — alors que l'export qui la produit la
      // renvoie noir sur blanc, et que le sondage qui suit ne parle que d'elle.
      variables: function (etape) {
        const t = (etape.params || {}).actionType || '';
        if (t === 'export_location' || t === 'export_location_trigger') {
          return [{ nom: 'exportJobId', depuis: 'job_id',
                    aide: 'identifiant du job d\'export Iconik, à sonder' }];
        }
        if (t === 'file_set_create') {
          return [{ nom: 'file_set_id', depuis: 'id', aide: 'identifiant du file set créé' }];
        }
        return [];
      },

      // Une seule des trente actions est déclarée : celle des workflows VOD
      // Factory. Les autres (`asset_create`, `acl_set_asset`, `transcode_create`…)
      // retombent sur le gabarit générique et se comptent — les décrire sans
      // les avoir vues tourner reviendrait à recopier un `switch` de 300 lignes
      // en espérant ne pas se tromper.
      appel: function (etape) {
        const p = etape.params || {};
        const t = p.actionType || '';
        if (t !== 'export_location' && t !== 'export_location_trigger') return null;
        const cible = p.exportLocationId || p.target || '';
        if (!cible) return null;
        const corps = {};
        if (p.createFolderAsset) corps.export_to_asset_folder = true;
        if (p.overwrite !== undefined) corps.overwrite = p.overwrite === true || p.overwrite === 'true';
        if (p.fileName) {
          // LE NOM DE FICHIER EST ASSAINI AVANT L'ENVOI : espaces en tirets
          // bas, puis tout ce qui n'est ni alphanumérique ni `_ - /` est
          // supprimé (wfd-engine-handlers.js:1305). Ce n'est pas cosmétique —
          // c'est l'adresse S3 finale, celle qu'APS vérifiera ensuite par
          // listing. Émettre le nom brut donnerait un objet livré à un chemin
          // et contrôlé à un autre.
          //
          // Le catalogue dit QU'IL FAUT assainir, l'émetteur sait COMMENT
          // l'écrire dans sa cible. Un gabarit seul ne pouvait pas le dire.
          corps.file_name = { gabarit: p.fileName, transforme: 'nomFichierIconik' };
        }
        return [{
          role: 'exporter', methode: 'POST',
          chemin: '/API/files/v1/assets/' + (p.assetId || '{asset_id}')
                + '/export_locations/' + cible + '/',
          corps: corps,
        }];
      }
    },

    'iconik.set_metadata': {
      core: 'http_request', family: 'update_meta', httpMode: 'simple',
      ports: ['out', 'error'],
      modes: ['fields', 'view'],
      // ── L'APPEL HTTP, DÉCLARÉ ────────────────────────────────────────────
      // Nouveau mécanisme (2026-08-13), et il vient d'un manque : l'émetteur
      // Make n'a JAMAIS eu besoin de cette information — Make avait des modules
      // Iconik natifs, l'adresse était l'affaire du module. ASL n'a que
      // `http:invoke` : il faut lui donner la méthode, l'URL et le corps. Comme
      // n8n et Node-RED seront dans le même cas, ça ne vit pas chez l'émetteur.
      //
      // `appel()` rend la LISTE des requêtes qu'une étape fait vraiment, dans
      // l'ordre. Pas une par étape : ici il y en a DEUX, et c'est le point.
      // Iconik n'accepte que PUT sur une vue de métadonnées — écrire trois
      // champs remplacerait donc les autres. Le moteur relit d'abord, fusionne,
      // puis écrit (wfd-engine-handlers.js:1246-1258 pour le mode 'view' via
      // metadata_patch, :1657-1674 pour le mode 'fields'). Les deux modes ont
      // la même forme ; seule l'URL diffère.
      //
      // `fusionne` nomme ce que la seconde requête doit reprendre de la
      // première. Chez ASL c'est States.JsonMerge, qui est superficielle —
      // exactement ce que fait `{ ...existing }` dans le handler.
      appel: function (etape) {
        const p = etape.params || {};
        const collection = p.target === 'collection';
        // Le mode 'view' passe par metadata_patch, qui écrit TOUJOURS sur
        // /assets/ — même quand la cible est une collection, auquel cas le
        // moteur bascule sur metadata_collection. Le mode 'fields' choisit
        // /collections/ ou /assets/ selon la cible, vérifié en console le
        // 19/07 : écrire sans vue fonctionne sur une collection.
        const objet = collection ? 'collections' : 'assets';
        const id    = p.targetId || p.assetId || (collection ? '{collection.id}' : '{asset.id}');
        const vue   = p.mdViewId || p.viewId || '';
        const base  = '/API/metadata/v1/' + objet + '/' + id + '/';
        const url   = vue ? base + 'views/' + vue + '/' : base;
        // LA FORME ICONIK DU CORPS, écrite ICI et pas chez l'émetteur. Un
        // émetteur n'a pas à savoir qu'une métadonnée se range sous
        // `field_values[].value` — c'est la même règle que pour
        // `gabaritMetadonnee`, qui dit où la RELIRE. Première rédaction :
        // le catalogue rendait `{ champ: '<valeur>' }` et laissait l'émetteur
        // en déduire l'enveloppe. C'était une abstraction pour rien, qui
        // répartissait la connaissance d'Iconik sur deux fichiers.
        //
        // Une valeur vide EFFACE le champ (`field_values: []`) — ce n'est pas
        // un oubli du moteur, c'est ce qu'il fait. Le transcrire tel quel.
        const valeurs = {};
        (p.fields || []).forEach(function (f) {
          if (!f.key) return;
          const v = f.value || '';
          valeurs[f.key] = { field_values: v === '' ? [] : [{ value: v }] };
        });
        return [
          { role: 'relire', methode: 'GET', chemin: url,
            // Une vue jamais initialisée sur cet objet répond 404, et le moteur
            // le traite comme un dictionnaire vide (try/catch nu). Sans ce mot,
            // une cible qui lève sur 404 arrêterait un workflow que le moteur
            // natif poursuit.
            tolereAbsence: true },
          { role: 'ecrire', methode: 'PUT', chemin: url,
            corps: { metadata_values: valeurs },
            fusionne: { depuis: 'relire', champ: 'metadata_values' } },
        ];
      }
    },

    'iconik.create_tree': {
      core: 'http_request', family: 'create_tree', httpMode: 'foreach',
      // Appelle le registre et le compteur en interne : c'est ce qui rend les
      // services requis déductibles, donc non stockés dans le pivot.
      ports: ['out', 'error'],
      services: ['aps.registry', 'aps.counter']
    },

    'aws_s3.deliver': {
      core: 'deliver', family: 'aws_s3',
      ports: ['out', 'miss', 'error']
    },

    'iconik.history': {
      core: 'history', family: 'workflow_history',
      // Le journal texte écrit dans un champ de métadonnée (mdField, via une
      // vue optionnelle mdViewId) est un mécanisme Iconik, pas une notion
      // agnostique — le Core `history` reste minimal ("enregistrer un
      // évènement"), cette façade porte le vrai vocabulaire (vérifié sur les
      // 11 occurrences réelles + le handler workflow_history du moteur).
      ports: ['out', 'error'],
      // Écrit dans Iconik, ne produit RIEN pour les étapes suivantes — vérifié
      // (workflow_history(), wfd-engine-handlers.js:3233-3343 : aucun setVar/
      // storeResult exposé au-delà de `_workflow_history`, interne). Déclaré
      // explicitement vide pour que le sélecteur ne suggère jamais rien ici,
      // plutôt que de simplement l'omettre (qui laisserait planer un doute :
      // "pas encore vérifié" vs "vérifié, rien à offrir").
      variables: function () { return []; },

      // ── ÉCRIRE DANS UN JOURNAL, PAS DANS UN CHAMP ────────────────────────
      // C'est ce qui distingue `history` de `set_metadata` : la valeur ne
      // remplace pas l'ancienne, elle s'y AJOUTE. Le champ contient un journal
      // multi-lignes que chaque passage allonge. D'où un mécanisme nommé,
      // `journal`, plutôt que quatre bricoles éparpillées — l'émetteur n'a
      // qu'une chose à savoir rendre.
      //
      // CE QUI EST REFUSÉ, et pourquoi c'est la majorité des cas réels :
      //
      //   whMode 'update'  retrouve la ligne portant le Run ID de CE run et la
      //                    remplace. C'est de la chirurgie sur un tableau de
      //                    lignes ; exprimable en JSONata, mais assez subtile
      //                    pour qu'une version approximative réécrive la
      //                    mauvaise ligne — et une ligne d'historique écrasée
      //                    ne se récupère pas.
      //   manifestId       la case-à-cocher d'essences (« Cover ✅ Poster ❌ »)
      //                    se compose au RUN, filtrée par le niveau courant.
      //   whSummaryVar     parcourt un objet et n'en garde que les entrées dont
      //                    le statut n'est pas « terminé ».
      //
      // Les deux « Notify » de PUBLISH passent ; les deux « History » non, et
      // se comptent. Note pour qui reprendra : les Notify écrivent la marque
      // [runId] que les History cherchent ensuite — traduire les uns sans les
      // autres donne un journal qui s'allonge au lieu de se mettre à jour.
      appel: function (etape) {
        const p = etape.params || {};
        if ((p.whMode || 'add') !== 'add') return null;
        if (p.manifestId || (etape.essences && etape.essences.length)) return null;
        if (p.whSummaryVar) return null;
        const champ = p.mdField;
        if (!champ) return null;

        const collection = p.target === 'collection';
        const objet = collection ? 'collections' : 'assets';
        const id  = p.targetId || (collection ? '{collection.id}' : '{asset.id}');
        const vue = p.mdViewId || '';
        const url = '/API/metadata/v1/' + objet + '/' + id + '/'
                  + (vue ? 'views/' + vue + '/' : '');

        // Les morceaux de la ligne, dans l'ordre du moteur. Un morceau vide
        // disparaît — à l'émission pour ce qui est statique, au run pour ce qui
        // ne l'est pas.
        const parties = [];
        if (p.whShowDate !== false) parties.push({ horodatage: 'court' });
        if (p.whShowWf   !== false && p.whWfName) parties.push(p.whWfName);
        if (p.whShowUser !== false) parties.push('{_trigger.user}');
        if (p.whStatut)  parties.push(p.whStatut);
        if (p.whMessage) parties.push(p.whMessage);
        if (!parties.length) return null;

        return [
          { role: 'relire', methode: 'GET', chemin: url, tolereAbsence: true },
          { role: 'ecrire', methode: 'PUT', chemin: url,
            journal: {
              champ: champ,
              depuis: 'relire',
              parties: parties,
              separateur: ' | ',
              // 'newest' met la ligne EN TÊTE. C'est le défaut du moteur.
              ordre: p.whOrder || 'newest',
              // La marque que `whMode: update` cherchera plus tard pour
              // retrouver sa ligne. Le moteur y met les 12 premiers caractères
              // de son identifiant de run ; ASL n'a pas la même notion, d'où
              // une SUBSTITUTION assumée — le nom de l'exécution joue le même
              // rôle, ce n'est pas la même valeur.
              marque: p.whShowRunId === true ? 'execution-visible' : 'execution',
              // Iconik range des clés techniques (`__separator__`) parmi les
              // métadonnées ; le moteur les écarte avant de réécrire.
              saufPrefixe: '__',
            } },
        ];
      }
    },

    'vodfactory.partner': {
      core: 'http_sequence', family: 'http_sequence',
      ports: ['out', 'err'],
      // ── UNE SÉQUENCE N'EST PAS UN APPEL ──────────────────────────────────
      // C'est N étapes, chacune un appel HTTP — sept sur BAYARD | ENDPOINTS |
      // VODFACTORY, dont cinq en `foreach`. Un seul état générique les
      // représentait toutes : c'est le plus gros écart que le compteur ait
      // signalé.
      //
      // Les étapes vivent dans une ressource `Endpoint`, désignée par
      // `sequenceId`. Le catalogue ne va JAMAIS les chercher — il ne fait pas
      // de réseau, c'est sa règle. L'appelant les pose dans `params.steps`
      // avant d'appeler (même contrat que `options.resolutions` de
      // pivot-to-wfd.js) ; sans elles, on rend null et l'étape se compte.
      appel: function (etape) {
        const p = etape.params || {};
        const steps = p.steps || [];
        if (!steps.length) return null;

        // TOUT OU RIEN ? Non — et c'est un arbitrage revu le 2026-08-13. Une
        // séquence de sept appels réduite à UN état générique cache l'ordre,
        // le nombre et la nature des appels. Six états justes plus un marqué
        // « non décrit » en disent beaucoup plus, et ne mentent pas davantage :
        // le manquant se voit, il se compte, et il est à sa place dans la
        // chaîne. C'est la règle des aiguillages appliquée dans l'autre sens —
        // ce qui est faux ne s'émet pas, mais ce qui manque se montre.
        const appels = [];
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const mode = s.httpMode || 'simple';
          const base = {
            role: 'etape' + (i + 1),
            methode: (s.method || 'POST').toUpperCase(),
            chemin: s.endpoint || '/',
          };
          // Sauter l'étape quand une valeur manque. Se dit exactement : un
          // Choice devant l'appel. Le moteur teste aussi qu'une référence non
          // résolue (« {s3_video_url} » restée telle quelle) compte pour vide —
          // en JSONata une référence absente n'existe pas, `$exists` suffit.
          if (s.skipIfEmpty) base.sauterSi = s.skipIfEmpty;

          if (mode === 'simple') {
            // Un gabarit de corps libre demande l'interpolation à sentinelles
            // du moteur (`buildBody`, avec expansion des clés pointées et
            // encodage profond). Pas décrit — l'étape est émise MARQUÉE, à sa
            // place dans la chaîne, plutôt que de faire disparaître les six
            // autres avec elle.
            if (s.body || s.bodyTemplate) {
              appels.push(Object.assign(base, { nonDecrit: 'gabarit de corps libre' }));
              continue;
            }
            appels.push(base);
            continue;
          }
          if (mode !== 'foreach' || !Array.isArray(s.feFields) || !s.feFields.length) {
            appels.push(Object.assign(base, { nonDecrit: 'mode ' + mode + ' sans champs déclarés' }));
            continue;
          }

          // La charge utile par élément. `src` dit d'où vient chaque champ :
          // la valeur brute, son slug, ou le rang dans la liste.
          const corps = {};
          let refus = false;
          s.feFields.forEach(function (f) {
            if (!f || !f.key) return;
            if (f.src === 'slug')                 corps[f.key] = { element: 'slug' };
            else if (f.src === 'index')           corps[f.key] = { element: 'rang' };
            else if (f.src === 'job')             corps[f.key] = s.feJob || null;
            else if (f.src === 'value' || !f.src) corps[f.key] = { element: 'valeur' };
            else refus = true;
          });
          if (refus) {
            appels.push(Object.assign(base, { nonDecrit: 'champ de charge utile inconnu' }));
            continue;
          }

          appels.push(Object.assign(base, {
            pourChaque: {
              source: s.feSourceVar || '',
              separateur: s.feSeparator !== undefined ? s.feSeparator : ', ',
            },
            corps: corps,
            // Le code HTTP fait partie du nom de l'erreur chez ASL
            // (`States.Http.StatusCode.409`) : les codes tolérés du pivot se
            // traduisent donc exactement, sans approximation. Ici 409/422 —
            // « cette personne existe déjà » n'est pas un échec.
            codesToleres: s.feIgnoreCodes || [409, 422],
          }));
        }
        return appels.length ? appels : null;
      }
    },

    // Pas de httpMode : id_generator() a son propre handler nommé (comme
    // fetch), jamais handleHttpRequest. Un seul port : id_generator() ne lève
    // jamais d'exception et ne retourne { port: 1 } que via `apiActions`, un
    // mécanisme mort (repose sur `conn.actions`, absent du modèle Connexion —
    // cf. config-schema.js) volontairement absent du panneau ; tant qu'il
    // n'est pas exposé, ce port ne peut jamais être atteint.
    'aps.registry': {
      core: 'http_request', family: 'id_generator',
      // Un service s'invoque comme une façade : « façade » veut dire paquet de
      // plateforme, et APS est une plateforme parmi d'autres, pas seulement Iconik.
      ports: ['out'],
      isService: true,
      // Libellé palette explicite : dérivé du nom de façade ("registry"),
      // "ID Generator" serait resté flou une fois redémasqué (3 août).
      nodeLabel: 'ID Generator',
      // Vérifié : config-schema.js, case 'aps.registry' — champ réel `varName`
      // (« Store as »), pas `resultVar`.
      variables: function (etape) {
        const v = (etape.params || {}).varName;
        return v ? [{ nom: v, aide: 'identifiant généré' }] : [];
      }
    }
  };

  // ── Interrogation ─────────────────────────────────────────────────────────

  // Les ports d'une étape, résolus. C'est ici que « déduit de la déclaration et
  // de la configuration » devient concret.
  function portsDe(etape) {
    if (!etape || !etape.core) return [];

    if (etape.facade && FACADES[etape.facade] && FACADES[etape.facade].ports) {
      return FACADES[etape.facade].ports.slice();
    }

    const core = CORES[etape.core];
    if (!core) return [];
    if (core.dynamicPorts === 'conditions') return portsDecision(etape);
    return core.ports.slice();
  }

  // Les services qu'une étape entraîne, pour les déduire au niveau du workflow
  // sans jamais les y stocker.
  function servicesDe(etape) {
    const out = [];
    if (etape && etape.facade) {
      const f = FACADES[etape.facade];
      if (f && f.services) f.services.forEach(function (s) { out.push(s); });
      if (f && f.isService) out.push(etape.facade);
    }
    return out;
  }

  function facadeConnue(nom)  { return Object.prototype.hasOwnProperty.call(FACADES, nom); }
  function coreConnu(nom)     { return Object.prototype.hasOwnProperty.call(CORES, nom); }

  // Variables STRUCTURELLES qu'une étape est connue pour produire — pas la
  // capture réelle d'exécution (aucun run n'existe encore pour un BuilderFlow,
  // voir builder-etat.md « Modèle de données »), juste ce que le handler
  // vérifié fait TOUJOURS. Une étape non déclarée ici renvoie [] : absence de
  // preuve, pas preuve d'absence — le sélecteur doit rester honnête plutôt que
  // d'inventer un champ jamais vérifié.
  // `resolutions` est OPTIONNEL — le panneau du canevas n'en a pas, et n'en a
  // pas besoin : il propose des noms. Un émetteur, lui, doit savoir quelles
  // variables une étape produit RÉELLEMENT, et pour Deliver cela dépend du
  // manifeste référencé. Sans l'argument, le comportement est inchangé.
  function variablesDe(etape, resolutions) {
    if (!etape) return [];
    if (etape.facade && FACADES[etape.facade] && typeof FACADES[etape.facade].variables === 'function') {
      return FACADES[etape.facade].variables(etape, resolutions) || [];
    }
    // Pas de façade : Core pur (ex. Lookup posé sans façade Iconik). Une
    // façade prime toujours (même règle que config-schema.js `pour(etape)`).
    //
    // Une façade SANS `variables` retombe ici, sur le Core qu'elle vise —
    // `aws_s3.deliver` n'en déclare pas, et c'est le Core `deliver` qui sait
    // quoi rendre. Le nom du Core se déduit de la façade quand l'étape ne le
    // porte pas : le pivot autorise les deux formes.
    const nomCore = etape.core
      || (etape.facade && FACADES[etape.facade] && FACADES[etape.facade].core);
    const core = nomCore && CORES[nomCore];
    if (core && typeof core.variables === 'function') return core.variables(etape, resolutions) || [];
    return [];
  }

  // Une étape aplatit-elle les métadonnées d'un résultat unique (donc : les
  // vrais champs de l'org peuvent apparaître en variable, en plus de la liste
  // structurelle ci-dessus) ? Distinct de `variablesDe` parce que CES noms-là
  // ne se devinent pas depuis le catalogue seul.
  function aplatitMetadonnees(etape) {
    if (!etape || !etape.facade || !FACADES[etape.facade]) return false;
    const f = FACADES[etape.facade];
    if (typeof f.metadonneesAplatiesSi === 'function') return f.metadonneesAplatiesSi(etape);
    return false;
  }

  // SUR QUEL OBJET une étape qui aplatit vient de travailler — la seule chose
  // qui distingue « la métadonnée de la collection publiée » de « celle du
  // dernier asset trouvé ». L'information est dans la configuration de l'étape
  // (`blocks[].objectType` d'un Search, `fetchSubType` d'un Fetch) ; elle n'était
  // simplement lue par personne. Rend null quand l'étape n'en désigne aucun :
  // absence de preuve, jamais un objet par défaut.
  // Le gabarit d'adresse d'une métadonnée aplatie, `{}` valant son nom. Rend
  // null si l'étape n'en déclare pas : une valeur qu'on sait aplatie mais dont
  // on ignore l'emplacement n'a pas d'adresse, et mieux vaut le dire.
  function gabaritMetadonneeDe(etape) {
    if (!etape || !etape.facade || !FACADES[etape.facade]) return null;
    return FACADES[etape.facade].gabaritMetadonnee || null;
  }

  function objetDe(etape) {
    const p = (etape && etape.params) || {};
    const b = Array.isArray(p.blocks) ? p.blocks.find(x => x && x.objectType) : null;
    return (b && b.objectType) || p.fetchSubType || p.objectType || null;
  }

  // Ce qu'une étape lit sans que ça paraisse dans ses paramètres. Même contrat
  // que `variablesDe` : la façade prime, le Core prend le relais, et une étape
  // non déclarée rend [].
  function lecturesDe(etape) {
    if (!etape) return [];
    if (etape.facade && FACADES[etape.facade] && typeof FACADES[etape.facade].lectures === 'function') {
      return FACADES[etape.facade].lectures(etape) || [];
    }
    const nomCore = etape.core
      || (etape.facade && FACADES[etape.facade] && FACADES[etape.facade].core);
    const core = nomCore && CORES[nomCore];
    if (core && typeof core.lectures === 'function') return core.lectures(etape) || [];
    return [];
  }

  // LES REQUÊTES HTTP d'une étape, dans l'ordre où elle les fait. Rend [] si la
  // façade ne l'a pas encore déclaré — un émetteur doit pouvoir distinguer
  // « aucun appel » (une décision, un Pass) de « pas encore décrit », et c'est
  // à lui de le dire plutôt que d'émettre une URL générique en silence.
  // Le tableau vide vaut donc « rien à déclarer ici », et `appelDe` renvoie
  // null quand la façade est muette.
  function appelDe(etape) {
    if (!etape || !etape.facade || !FACADES[etape.facade]) return null;
    const f = FACADES[etape.facade];
    if (typeof f.appel !== 'function') return null;
    return f.appel(etape) || null;
  }

  // ── Pour le convertisseur pivot → WFD ─────────────────────────────────────

  // La famille WFD que le moteur attend. Une façade porte son nom d'origine
  // (`aws_s3.deliver` → `aws_s3`) ; un Core pur garde son nom, sauf les quelques
  // renommages entre le vocabulaire du catalogue et celui du moteur.
  const FAMILLE_MOTEUR = {
    verify: 'checker', wait: 'wait_for', set_variable: 'set_var',
    history: 'workflow_history', deliver: 'aws_s3'
  };

  function familleWfd(etape) {
    if (etape.facade && FACADES[etape.facade]) return FACADES[etape.facade].family;
    // Une minuterie est une famille WFD distincte (`timer`), pas un `trigger` :
    // c'est un trigger Core pur (sans façade) reconnu à son cron / preset schedule.
    // `p.cron` corrigé en `p.timerMode`/`p.cronExpr` — même faute que le
    // schéma du panneau (config-schema.js) : le vrai champ écrit par le
    // panneau est `cronExpr` (ce que scheduleTimer() lit), jamais `cron`.
    if (etape.core === 'trigger') {
      const p = etape.params || {};
      if (etape.preset === 'schedule' || p.timerMode || p.cronExpr) return 'timer';
    }
    return FAMILLE_MOTEUR[etape.core] || etape.core;
  }

  // Les ports au format WFD : objets { id, label, color }, dans l'ordre. Pour
  // une décision, les libellés du pivot deviennent `out-0`..`out-N` — c'est ici
  // que s'opère la traduction du choix B. Le défaut ferme la liste.
  function portsWfd(etape) {
    if (etape.core === 'decision') {
      const conds = ((etape.params || {}).conditions) || [];
      const outs = conds.map(function (cond, i) {
        // id = libellé réel de la condition — même règle que portsDecision()
        // (le validateur) et builder-handler-decision.js (le moteur, qui
        // renvoie {port: cond.label} à l'exécution). Utiliser 'out-'+i ici
        // aurait produit des ports DOM qui ne correspondent jamais à ce que
        // le moteur emprunte réellement — bug réel trouvé en base (30 arêtes
        // decision cassées sur des flows publiés, dont PUBLISH).
        const id = (cond && cond.label) || ('out-' + i);
        return { id: id, label: (cond && cond.label) || ('Branche ' + i),
                 color: COULEUR_DECISION[i % COULEUR_DECISION.length] };
      });
      // Libellé réel, configurable (defaultLabel) — vérifié sur les 7 nœuds
      // decision réels : "Deny", "Echec", "ID Présent"... jamais juste
      // "Par défaut" en pratique. Repli si non renseigné.
      const defaultLabel = (etape.params && etape.params.defaultLabel) || 'Par défaut';
      outs.push({ id: 'default', label: defaultLabel, color: '#95a5a6' });
      return outs;
    }

    const decor = (etape.facade && DECOR_FACADE[etape.facade]) || DECOR[etape.core] || {};
    return portsDe(etape).map(function (id) {
      const d = decor[id];
      return { id: id, label: d ? d[0] : id, color: d ? d[1] : '#95a5a6' };
    });
  }

  // L'index WFD (`fromPort` numérique) des ports d'où part un libellé de pivot.
  // Pour une décision, un libellé porté par plusieurs conditions renvoie
  // plusieurs index — c'est le fan-out : STATUSES a deux conditions `Reporté`,
  // donc une arête pivot depuis `Reporté` devient deux connexions WFD.
  function indexPort(etape, portPivot) {
    if (etape.core === 'decision') {
      const conds = ((etape.params || {}).conditions) || [];
      const idx = [];
      conds.forEach(function (cond, i) {
        if (cond && cond.label === portPivot) idx.push(i);
      });
      if (portPivot === 'default') idx.push(conds.length);
      return idx;
    }
    // Boucle : `out` (« Suite ») doit résolver à l'index WFD 1, PAS 0 — le
    // moteur réel a trois ports en dur (wfd-engine-executor.js, executeLoopNode) :
    // 0 = chaque élément (followPort(node, 0, ...) par itération), 1 = terminé
    // (followPort(node, 1, ...) une fois tous les éléments traités), 2 = erreur
    // d'élément si onError:'port' (non câblé côté panneau, hors sujet ici).
    // CORES.loop ne déclare qu'un seul port pivot (`out`) — sans ce cas
    // particulier, `portsDe(etape).indexOf('out')` renverrait 0, la MÊME valeur
    // que l'entrée du corps (_aplatir, pivot-to-wfd.js, `fromPort: 0` en dur) :
    // collision silencieuse qui aurait déclenché la suite du workflow à CHAQUE
    // itération au lieu d'une seule fois après la boucle. Trouvé le 4 août en
    // testant la conversion d'un vrai corps de boucle pour la première fois
    // (l'éditeur de corps de boucle est nouveau ce jour, jamais exercé jusque-là).
    if (etape.core === 'loop' && portPivot === 'out') return [1];
    const i = portsDe(etape).indexOf(portPivot);
    return i === -1 ? [] : [i];
  }

  // Une étape est-elle une simple annotation (Post-it) ? Un seul endroit
  // décide, pour que le convertisseur, le validateur, le volet API ops et le
  // moteur n'aient pas chacun leur liste de noms à tenir à jour.
  function estAnnotation(etape) {
    if (!etape || !etape.core) return false;
    const core = CORES[etape.core];
    return !!(core && core.annotation);
  }

  return {
    CORES, FACADES,
    portsDe, ports: portsDe,
    servicesDe, services: servicesDe,
    facadeConnue, coreConnu, estAnnotation,
    portsDecision, normaliserAretesDecision,
    familleWfd, portsWfd, indexPort,
    variablesDe, aplatitMetadonnees, lecturesDe, objetDe, gabaritMetadonneeDe, appelDe
  };

})();

if (typeof module !== 'undefined') module.exports = PivotCatalogIconik;
if (typeof window !== 'undefined') window.PivotCatalogIconik = PivotCatalogIconik;
