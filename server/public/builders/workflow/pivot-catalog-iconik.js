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
    history:       { ports: ['out', 'error'] },
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
      ports: ['out', 'not_found']
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
      variables: function (etape) {
        const rv = (etape.params || {}).resultVar || 'search_results';
        const champsUniques = ['id', 'title', 'object_type', 'external_id'];
        const out = [
          { nom: rv, aide: 'tableau JSON des objets trouvés' },
          { nom: rv + '.count', aide: 'nombre de résultats' }
        ];
        champsUniques.forEach(function (c) {
          out.push({ nom: c, aide: 'si un seul résultat — ' + c, incertain: true });
          out.push({ nom: rv + '.' + c, aide: 'même valeur, forme préfixée', incertain: true });
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
      metadonneesAplatiesSi: function (etape) { return ((etape.params || {}).mode || 'retrieve') !== 'presence'; }
    },

    'iconik.action': {
      core: 'http_request', family: 'action', httpMode: 'action',
      // Le mode action lit sa cible depuis la connexion (_handleHttpAction).
      ports: ['out', 'error'],
      presets: {
        export_location: { note: 'déclenche une export location Iconik' }
      }
    },

    'iconik.set_metadata': {
      core: 'http_request', family: 'update_meta', httpMode: 'simple',
      ports: ['out', 'error'],
      modes: ['fields', 'view']
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
      variables: function () { return []; }
    },

    'vodfactory.partner': {
      core: 'http_sequence', family: 'http_sequence',
      ports: ['out', 'err']
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
    variablesDe, aplatitMetadonnees
  };

})();

if (typeof module !== 'undefined') module.exports = PivotCatalogIconik;
if (typeof window !== 'undefined') window.PivotCatalogIconik = PivotCatalogIconik;
