/**
 * config-schema.js — Schéma déclaratif de configuration par type de nœud
 *
 * Décrit, pour une étape pivot, la liste des champs à afficher — chacun par sa
 * NATURE (voir config-renderer). Le moteur rend ces descripteurs comme reflet
 * du modèle de config ; ce fichier ne fait que DECRIRE quoi montrer.
 *
 * Premier jet volontairement minimal (2 natures : texte, variable), pour poser
 * la fondation et prouver la réactivité + la règle des accolades. Les schémas
 * riches par famille (décision, http, boucle…) s'ajouteront ensuite, champ par
 * champ, chacun une projection du modèle.
 */

const ConfigSchema = (() => {

  // Opérateurs valides pour un type de métadonnée (uiType Iconik réel, vérifié
  // sur l'environnement QA : Text(51)/Tag Cloud(34)/Dropdown(22)/Yes-No(14)/
  // Url(8)/Datetime(7)/Date(7)/Text Area(7)/Integer(6)… — PAS 'Select', ce nom
  // n'existe dans aucune métadonnée réelle). `equals`/`is_not_empty` valent
  // pour tous les types (sûr). `contains` (sous-chaîne) n'a de sens que sur
  // Yes/No qu'on exclut explicitement (contenir vrai/faux n'a pas de sens) —
  // tous les autres types le gardent, faute de preuve du contraire (mieux vaut
  // un opérateur de trop que masquer un besoin réel, ex. Tag Cloud/Genres).
  // `in_collection` n'est jamais lié au TYPE d'une métadonnée réelle — observé
  // en production sur des pseudo-champs (ex. __collection__) qui ne sont pas
  // des IkonField ; gardé uniquement quand le type est inconnu (champ non
  // résolu = pas une vraie métadonnée, ou pas encore chargée).
  function _operateursPourType(uiType) {
    const base = [
      { valeur: 'equals', libelle: 'equals' },
      { valeur: 'is_not_empty', libelle: 'is not empty' }
    ];
    if (!uiType) {
      return base.concat([
        { valeur: 'contains', libelle: 'contains' },
        { valeur: 'in_collection', libelle: 'in collection' }
      ]);
    }
    if (uiType === 'Yes/No') return base;   // booléen : correspondance exacte seulement
    return base.concat([{ valeur: 'contains', libelle: 'contains' }]);
  }

  // Résout la métadonnée d'un critère aps_search depuis son champ FRÈRE
  // ('field', dans le même item de liste que 'op'/'value'), via le cache
  // synchrone de ConfigSources. null si non résolue (fail-safe : le vocabulaire
  // complet reste disponible plutôt que de bloquer un choix légitime).
  function _metadonneeFrere(model, contexte, descr) {
    const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
    const envSlug = contexte && contexte.envSlug;
    if (!src || !envSlug) return null;
    const cheminChamp = String(descr.chemin).replace(/[^.]+$/, 'field');
    const nomChamp = model.lire(cheminChamp);
    if (!nomChamp) return null;
    const liste = src.metadonneesChargees(envSlug);
    for (let i = 0; i < liste.length; i++) {
      if (liste[i].name === nomChamp) return liste[i];
    }
    return null;
  }

  // Champs communs à tout nœud.
  function _communs() {
    return [
      { nature: 'texte', chemin: 'label', label: 'Name', placeholder: 'Node name' }
    ];
  }

  // Schéma pour une étape. Communs + champs propres à la famille.
  function pour(etape) {
    const s = _communs();
    const core = etape && etape.core;
    const facade = etape && etape.facade;

    // Une FAÇADE prime sur le schéma core générique : elle sait mieux quoi
    // montrer (une Search présente des blocs de recherche, pas une URL brute).
    // Si une façade connue est présente, on rend SON schéma et on s'arrête.
    if (facade) {
      const sf = _facade(facade, etape);
      if (sf) return s.concat(sf);
    }

    // Familles qui produisent un résultat stockable. `loop` retiré : vérifié
    // sur les 7 occurrences réelles + wfd-engine-executor.js (executeLoopNode)
    // — `resultVar` n'existe dans aucune donnée réelle et n'est jamais lu par
    // le moteur pour ce Core (chaque item est exposé via `loopVar`, pas un
    // résultat agrégé stocké à la fin).
    const produit = ['http_request', 'lookup', 'transform', 'set_variable', 'http_sequence'];
    if (core && produit.indexOf(core) >= 0) {
      s.push({ nature: 'variable', chemin: 'resultVar', label: 'Store result as',
               placeholder: '{result}' });
    }

    // Décision : conditions MULTIPLES via la nature liste. Chaque condition est
    // un sous-schéma {opérateur + champs dépendants}. Démontre la composition :
    // liste contient opérateur qui pilote ses champs, le tout réactif.
    //
    // Corrigé après vérification du moteur (wfd-engine-handlers.js) :
    //  - `on` -> `field` : BUG réel, pas cosmétique. Le moteur lit littéralement
    //    `cfg.field` ; avec `on`, une décision construite dans le Builder aurait
    //    toujours évalué `undefined` et systématiquement pris la branche défaut.
    //  - Vocabulaire d'opérateurs = la liste EXACTE et complète du switch
    //    evalCondition() (20 opérateurs, définitif — pas une observation limitée
    //    aux 7 occurrences réelles, contrairement à aps_search). `between`/
    //    `from`/`to` retirés : absents du switch, retombent sur
    //    `default: return false` — toujours faux, jamais fonctionnel.
    //  - `defaultLabel` (libellé de la branche "sinon", présent sur les 7 nœuds
    //    réels) et `onError` : absents du schéma d'origine, ajoutés.
    if (core === 'decision') {
      s.push({ nature: 'variable', chemin: 'field', label: 'Evaluate', placeholder: '{value}' });
      s.push({
        nature: 'liste', chemin: 'conditions', label: 'Conditions', ajoutLabel: 'Add condition',
        itemDefaut: { op: 'equals', value: '' },
        itemSchema: [
          { nature: 'operateur', chemin: 'op', label: 'Operator', options: [
            { valeur: 'equals', libelle: 'equals' },
            { valeur: 'not_equals', libelle: 'not equals' },
            { valeur: 'contains', libelle: 'contains' },
            { valeur: 'not_contains', libelle: 'does not contain' },
            { valeur: 'starts_with', libelle: 'starts with' },
            { valeur: 'ends_with', libelle: 'ends with' },
            { valeur: 'not_starts_with', libelle: 'does not start with' },
            { valeur: 'not_ends_with', libelle: 'does not end with' },
            { valeur: 'matches_regex', libelle: 'matches regex' },
            { valeur: 'not_matches_regex', libelle: 'does not match regex' },
            { valeur: 'gt', libelle: '>' },
            { valeur: 'gte', libelle: '>=' },
            { valeur: 'lt', libelle: '<' },
            { valeur: 'lte', libelle: '<=' },
            { valeur: 'in_list', libelle: 'in list (comma-separated)' },
            { valeur: 'not_in_list', libelle: 'not in list (comma-separated)' },
            { valeur: 'is_empty', libelle: 'is empty' },
            { valeur: 'not_empty', libelle: 'is not empty' },
            { valeur: 'present', libelle: 'is present' },
            { valeur: 'absent', libelle: 'is absent' }
          ] },
          { nature: 'texte', chemin: 'value', label: 'Value',
            visibleSi: function (m) {
              return ['is_empty', 'not_empty', 'present', 'absent'].indexOf(m.lire('op')) === -1;
            } },
          { nature: 'texte', chemin: 'label', label: 'Branch label', placeholder: 'e.g. Série' }
        ]
      });
      s.push({ nature: 'texte', chemin: 'defaultLabel', label: 'Default branch label', placeholder: 'e.g. Par défaut' });
      s.push({ nature: 'choix', chemin: 'onError', label: 'On error', options: [
        { valeur: 'stop', libelle: 'Stop' },
        { valeur: 'continue_log', libelle: 'Continue (log)' },
        { valeur: 'continue', libelle: 'Continue (silent)' }
      ] });
    }

    // Boucle : reste un Core pur (vérifié — l'itération ne touche jamais une
    // API de plateforme, elle boucle en mémoire sur un tableau déjà résolu).
    // Corrigé après lecture de wfd-engine-executor.js (executeLoopNode) :
    // `over`/`parallel`/`maxConcurrency` n'existaient dans aucune des 7
    // occurrences réelles. Les vrais champs sont `loopVar`/`loopSource`/
    // `loopVariablePath`/`concurrency` (un nombre direct, pas un bool +
    // second champ). SEUL le mode `variable` a un chemin d'exécution — le
    // moteur le dit explicitement en commentaire : les 5 autres modes
    // ("prévus côté panneau... jamais câblés côté exécution") FONT PLANTER
    // le flow s'ils sont choisis (échec volontaire, pas un no-op silencieux).
    // Catalogués quand même (même principe que trigger — l'ambition existe,
    // on ne l'efface pas) mais avec un libellé qui prévient plutôt que de
    // laisser quelqu'un s'y brûler.
    if (core === 'loop') {
      s.push({ nature: 'texte', chemin: 'loopVar', label: 'Item variable name', placeholder: 'item' });
      s.push({ nature: 'choix', chemin: 'loopSource', label: 'Source', reagit: true, options: [
        { valeur: 'variable', libelle: 'Existing variable' },
        { valeur: 'files', libelle: 'Files (not implemented — fails at runtime)' },
        { valeur: 'assets', libelle: 'Assets (not implemented — fails at runtime)' },
        { valeur: 'collection', libelle: 'Collection (not implemented — fails at runtime)' },
        { valeur: 'list', libelle: 'Fixed list (not implemented — fails at runtime)' },
        { valeur: 'metadata', libelle: 'Metadata (not implemented — fails at runtime)' }
      ] });
      s.push({ nature: 'variable', chemin: 'loopVariablePath', label: 'Iterate over', placeholder: '{search_results.objects}',
               visibleSi: function (m) { return (m.lire('loopSource') || 'variable') === 'variable'; } });
      s.push({ nature: 'nombre', chemin: 'concurrency', label: 'Concurrency', min: 1, placeholder: '1' });
      s.push({ nature: 'choix', chemin: 'onError', label: 'On error', options: [
        { valeur: 'stop', libelle: 'Stop' },
        { valeur: 'continue_log', libelle: 'Continue (log)' },
        { valeur: 'continue', libelle: 'Continue (silent)' }
      ] });
    }

    // Trigger : ce qui démarre le flux. Le type de déclencheur pilote un champ
    // (planification pour 'schedule'). varName produit est déductible du type.
    if (core === 'trigger') {
      s.push({ nature: 'choix', chemin: 'kind', label: 'Trigger on', reagit: true, options: [
        { valeur: 'asset', libelle: 'An asset' },
        { valeur: 'collection', libelle: 'A collection' },
        { valeur: 'segment', libelle: 'A segment' },
        { valeur: 'schedule', libelle: 'A schedule' }
      ] });
      s.push({ nature: 'texte', chemin: 'cron', label: 'Schedule (cron)', placeholder: '0 6 * * *',
               visibleSi: function (m) { return m.lire('kind') === 'schedule'; } });
    }

    // Set variable : une LISTE d'affectations (key = value). Repris des
    // assignments réels de WFD. Chaque ligne : nom de variable + valeur.
    if (core === 'set_variable') {
      s.push({
        nature: 'liste', chemin: 'assignments', label: 'Assignments', ajoutLabel: 'Add assignment',
        itemDefaut: { key: '', value: '' },
        itemSchema: [
          { nature: 'texte', chemin: 'key', label: 'Variable', placeholder: 'myVar' },
          { nature: 'texte', chemin: 'value', label: 'Value', placeholder: '{source} or literal' }
        ]
      });
    }

    // Lookup : recherche une correspondance et stocke le résultat. Champs réels
    // WFD : la source, la clé recherchée, la variable de sortie (lkOutputVar).
    if (core === 'lookup') {
      s.push({ nature: 'variable', chemin: 'source', label: 'Lookup in', placeholder: '{table}' });
      s.push({ nature: 'variable', chemin: 'key', label: 'Match key', placeholder: '{value}' });
      s.push({ nature: 'variable', chemin: 'lkOutputVar', label: 'Store match as', placeholder: '{match}' });
    }

    // Transform : applique une transformation à une entrée. Mode pilote le reste
    // (expression libre vs mapping de champs).
    if (core === 'transform') {
      s.push({ nature: 'variable', chemin: 'input', label: 'Input', placeholder: '{value}' });
      s.push({ nature: 'choix', chemin: 'mode', label: 'Mode', reagit: true, options: [
        { valeur: 'expression', libelle: 'Expression' },
        { valeur: 'fields', libelle: 'Field mapping' }
      ] });
      s.push({ nature: 'texte', chemin: 'expression', label: 'Expression', placeholder: 'e.g. upper({value})',
               visibleSi: function (m) { return (m.lire('mode') || 'expression') === 'expression'; } });
      s.push({
        nature: 'liste', chemin: 'fields', label: 'Fields', ajoutLabel: 'Add field',
        itemDefaut: { from: '', to: '' },
        itemSchema: [
          { nature: 'variable', chemin: 'from', label: 'From', placeholder: '{source}' },
          { nature: 'texte', chemin: 'to', label: 'To', placeholder: 'targetField' }
        ],
        visibleSi: function (m) { return m.lire('mode') === 'fields'; }
      });
    }

    // Verify : vérifie une condition/présence avant de continuer. Réutilise
    // l'opérateur (comme Decision) mais sur une seule condition.
    if (core === 'verify') {
      s.push({ nature: 'variable', chemin: 'on', label: 'Verify', placeholder: '{value}' });
      s.push({ nature: 'operateur', chemin: 'op', label: 'Condition', options: [
        { valeur: 'present', libelle: 'is present' },
        { valeur: 'equals', libelle: 'equals' },
        { valeur: 'matches', libelle: 'matches' }
      ] });
      s.push({ nature: 'texte', chemin: 'value', label: 'Expected',
               visibleSi: function (m) { return ['equals', 'matches'].indexOf(m.lire('op')) >= 0; } });
    }

    // Wait : sonde un endpoint jusqu'à ce qu'un chemin de la réponse atteigne
    // une valeur attendue (ex. un job Iconik jusqu'à status=FINISHED) — pas
    // "attendre N secondes" comme le schéma d'origine le supposait (`seconds`
    // n'existe dans aucune des 6 occurrences réelles). Reste un Core pur :
    // le vocabulaire (endpoint/checkPath/checkValue...) est générique, aucune
    // référence à un terme Iconik — la connexion, optionnelle, retombe sur la
    // plateforme du flow si absente (les 6 occurrences réelles n'en précisent
    // aucune). Volontairement SANS le mapping S3 que WFD embarque en interne
    // à la réussite (`s3ConnexionId`/`s3Prefix`/`s3Mappings`) : cette partie
    // duplique EXACTEMENT le même mapping vidéo/image/sous-titre sur les 6
    // occurrences réelles — c'est justement ce que le Manifest (ressource
    // d'org, déjà consommé par `aws_s3.deliver` via `manifestId`) existe pour
    // éviter de répéter. Une fois l'attente réussie, enchaîner sur un nœud
    // Deliver plutôt que de redupliquer le mapping ici.
    if (core === 'wait') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Connection (optional — falls back to the flow\'s platform)' });
      s.push({ nature: 'choix', chemin: 'method', label: 'Method', options: [
        { valeur: 'GET', libelle: 'GET' },
        { valeur: 'POST', libelle: 'POST' }
      ] });
      s.push({ nature: 'texte', chemin: 'endpoint', label: 'Endpoint', placeholder: '/API/jobs/v1/jobs/{exportJobId}/' });
      s.push({ nature: 'texte', chemin: 'checkPath', label: 'Check path', placeholder: 'status' });
      s.push({ nature: 'texte', chemin: 'checkValue', label: 'Expected value', placeholder: 'FINISHED' });
      s.push({ nature: 'texte', chemin: 'failValues', label: 'Fail values (comma-separated)', placeholder: 'FAILED,ERROR,ABORTED' });
      s.push({ nature: 'nombre', chemin: 'maxTries', label: 'Max tries', min: 1, placeholder: '20' });
      s.push({ nature: 'nombre', chemin: 'delaySeconds', label: 'Delay between tries (seconds)', min: 1, placeholder: '5' });
      s.push({ nature: 'variable', chemin: 'resultVar', label: 'Store result as', placeholder: '{waitResult}' });
      s.push({ nature: 'choix', chemin: 'onError', label: 'On error', options: [
        { valeur: 'stop', libelle: 'Stop' },
        { valeur: 'continue_log', libelle: 'Continue (log)' },
        { valeur: 'continue', libelle: 'Continue (silent)' }
      ] });
    }

    // HTTP Sequence : une SUITE de requêtes. Liste d'étapes (méthode + URL).
    if (core === 'http_sequence') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Connection' });
      s.push({
        nature: 'liste', chemin: 'steps', label: 'Requests', ajoutLabel: 'Add request',
        itemDefaut: { request: { method: 'GET', url: '' } },
        itemSchema: [
          { nature: 'endpoint', chemin: 'request', label: 'Request' },
          { nature: 'variable', chemin: 'storeAs', label: 'Store as', placeholder: '{step1}' }
        ]
      });
    }

    // History : Core minimal et agnostique — "enregistrer un évènement", sans
    // dire où ni comment. Le mécanisme réel constaté sur Iconik (journal texte
    // dans un champ de métadonnée) est spécifique à la plateforme : il vit
    // dans la façade `iconik.history`, pas ici (cf. discussion — un Core ne
    // doit pas porter de vocabulaire propre à une seule plateforme).
    if (core === 'history') {
      s.push({ nature: 'texte', chemin: 'message', label: 'Message', placeholder: 'e.g. Delivered to {target}' });
    }

    // Deliver : livre selon un MANIFESTE (ce qui est livré) vers une cible
    // (connexion sortante). Le manifeste est une ressource d'org réelle ; le
    // Deliver déclenche la livraison et vérifie la cardinalité (garde-fou).
    if (core === 'deliver') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Deliver to', filtreDirection: 'outbound' });
      s.push({ nature: 'manifeste', chemin: 'manifestId', label: 'Manifest' });
      s.push({ nature: 'texte', chemin: 'prefixe', label: 'Prefix (S3 folder)', placeholder: 'e.g. amazon/episode-42' });
    }

    // HTTP Request : consomme Administration (connexion réelle) + endpoint.
    if (core === 'http_request') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Connection' });
      s.push({ nature: 'endpoint', chemin: 'request', label: 'Request' });
    }

    return s;
  }

  // Schéma spécifique d'une façade plateforme. Reprend les champs réels du
  // catalogue (ports/modes/services) rationalisés en natures. Retourne null si
  // la façade n'a pas de schéma dédié (on retombe alors sur le core).
  function _facade(facade, etape) {
    switch (facade) {

      // Trigger (Iconik) : 12 types d'évènements, transcrits du CATALOGUE RÉEL
      // du designer WFD (script-workflow-designer.js, TRIGGER_EVENTS) — c'est
      // la trace de ce que WFD avait recensé comme sources de déclenchement
      // possibles, avant même d'être un orchestrateur d'exécution.
      //
      // État d'exécution vérifié (pas supposé) : `wfdSlug` est ce que la route
      // POST /wfd/action/:slug (wfd-engine-express.js) matche pour trouver quel
      // flow lancer — et ce matching ne regarde QUE le slug, jamais eventType.
      // Concrètement : Custom Action est prouvé de bout en bout (Iconik agit
      // dessus nativement). Les 11 autres types passeraient par la MÊME route
      // si un vrai webhook/évènement Iconik était configuré pour l'appeler —
      // Iconik a un vrai système de webhooks (vérifié en direct,
      // /API/notifications/v1/webhooks/, avec event_type/operation/realm/query)
      // mais aucun, dans cet environnement, n'est actif ni pointé vers cette
      // route aujourd'hui. Catalogue fidèle à l'intention, pas une promesse
      // que tout fonctionne déjà.
      case 'iconik.trigger':
        return [
          { nature: 'texteRepeint', chemin: 'wfdSlug', label: 'Slug (routing)', placeholder: 'e.g. publish' },
          // Chemin réel écouté par le moteur (wfd-engine-express.js,
          // POST /wfd/action/:slug) — c'est CETTE URL (préfixée du domaine de
          // l'instance APS) qu'il faut coller dans la Custom Action Iconik.
          // Pas de domaine affiché : aucune config d'URL publique n'existe
          // dans ce projet, même convention que l'ancien designer WFD
          // (wfd-config-panel.js) qui n'affichait déjà que le chemin.
          { nature: 'apercu', chemin: 'wfdEndpointApercu', label: 'Endpoint',
            calcule: function (m) { const s = m.lire('wfdSlug'); return s ? '/wfd/action/' + s : null; } },
          { nature: 'choix', chemin: 'eventType', label: 'Event', reagit: true, options: [
            { valeur: 'custom_action', libelle: '⚡ Custom Action' },
            { valeur: 'webhook', libelle: '🔔 Webhook Iconik' },
            { valeur: 'metadata_changed', libelle: '🏷 Metadata changée' },
            { valeur: 'asset_created', libelle: '✨ Asset créé' },
            { valeur: 'asset_deleted', libelle: '🗑 Asset supprimé' },
            { valeur: 'asset_status_changed', libelle: '🔄 Statut asset changé' },
            { valeur: 'asset_added_collection', libelle: '📁 Asset ajouté à une collection' },
            { valeur: 'asset_removed_collection', libelle: '📁 Asset retiré d\'une collection' },
            { valeur: 'proxy_available', libelle: '🎬 Proxy disponible' },
            { valeur: 'job_finished', libelle: '✅ Job terminé' },
            { valeur: 'job_failed', libelle: '❌ Job en erreur' },
            { valeur: 'saved_search', libelle: '🔍 Saved Search (poll)' }
          ] },
          { nature: 'choix', chemin: 'context', label: 'Object type', options: [
            { valeur: 'ASSET', libelle: 'Asset' },
            { valeur: 'COLLECTION', libelle: 'Collection' },
            { valeur: 'SEGMENT', libelle: 'Segment' }
          ] },
          { nature: 'customAction', chemin: 'customActionId', label: 'Custom Action',
            contextVersChemin: 'context',
            visibleSi: function (m) { return m.lire('eventType') === 'custom_action'; } },
          { nature: 'texte', chemin: 'webhookId', label: 'Webhook ID',
            visibleSi: function (m) { return m.lire('eventType') === 'webhook'; } },
          { nature: 'metadonnee', chemin: 'triggerField', label: 'Field', placeholder: 'field name',
            vuePour: function (m) { return m.lire('mdViewId'); },
            visibleSi: function (m) { return m.lire('eventType') === 'metadata_changed'; } },
          { nature: 'choix', chemin: 'triggerCondition', label: 'Condition', options: [
            { valeur: 'equals', libelle: 'equals' },
            { valeur: 'not_equals', libelle: 'not equals' },
            { valeur: 'present', libelle: 'is present' },
            { valeur: 'absent', libelle: 'is absent' },
            { valeur: 'contains', libelle: 'contains' },
            { valeur: 'not_contains', libelle: 'does not contain' },
            { valeur: 'starts_with', libelle: 'starts with' },
            { valeur: 'ends_with', libelle: 'ends with' },
            { valeur: 'not_starts_with', libelle: 'does not start with' },
            { valeur: 'not_ends_with', libelle: 'does not end with' },
            { valeur: 'matches_regex', libelle: 'matches regex' },
            { valeur: 'not_matches_regex', libelle: 'does not match regex' },
            { valeur: 'gt', libelle: '>' }, { valeur: 'gte', libelle: '>=' },
            { valeur: 'lt', libelle: '<' }, { valeur: 'lte', libelle: '<=' },
            { valeur: 'between', libelle: 'between (min,max)' },
            { valeur: 'not_between', libelle: 'not between (min,max)' },
            { valeur: 'in_list', libelle: 'in list (comma-separated)' },
            { valeur: 'not_in_list', libelle: 'not in list (comma-separated)' },
            { valeur: 'and_not', libelle: 'present AND not equals' },
            { valeur: 'nor', libelle: 'absent OR equals' }
          ], visibleSi: function (m) { return m.lire('eventType') === 'metadata_changed'; } },
          { nature: 'texte', chemin: 'triggerValue', label: 'Value',
            visibleSi: function (m) { return m.lire('eventType') === 'metadata_changed'; } },
          { nature: 'texte', chemin: 'statusValue', label: 'Status value',
            visibleSi: function (m) { return m.lire('eventType') === 'asset_status_changed'; } },
          { nature: 'texte', chemin: 'collectionId', label: 'Collection',
            visibleSi: function (m) { return ['asset_added_collection', 'asset_removed_collection'].indexOf(m.lire('eventType')) >= 0; } },
          { nature: 'texte', chemin: 'jobType', label: 'Job type', placeholder: 'e.g. transcode',
            visibleSi: function (m) { return ['job_finished', 'job_failed'].indexOf(m.lire('eventType')) >= 0; } },
          { nature: 'texte', chemin: 'savedSearchId', label: 'Saved Search ID',
            visibleSi: function (m) { return m.lire('eventType') === 'saved_search'; } },
          { nature: 'nombre', chemin: 'pollInterval', label: 'Poll interval (min)', min: 1,
            visibleSi: function (m) { return m.lire('eventType') === 'saved_search'; } },
          { nature: 'choix', chemin: 'pollMode', label: 'Poll mode',
            options: [
              { valeur: 'each', libelle: 'Each result' },
              { valeur: 'new', libelle: 'New results only' }
            ],
            visibleSi: function (m) { return m.lire('eventType') === 'saved_search'; } },
          { nature: 'nombre', chemin: 'pollLimit', label: 'Poll limit', min: 1,
            visibleSi: function (m) { return m.lire('eventType') === 'saved_search'; } },
          { nature: 'vueMetadonnee', chemin: 'mdViewId', label: 'Metadata view', reagit: true,
            placeholder: 'no view',
            visibleSi: function (m) {
              return ['metadata_changed', 'asset_created', 'saved_search'].indexOf(m.lire('eventType')) >= 0;
            } }
        ];

      // Search (aps_search) : recherche APS multi-blocs. Transcrit fidèlement la
      // structure réelle observée sur les 17 occurrences de PUBLISH V2 : des
      // BLOCS (collection ou asset), chacun avec ses propres CRITÈRES (liste
      // imbriquée — le mécanisme 'liste' est déjà récursif, aucune nouvelle
      // infrastructure nécessaire). Un bloc peut chercher DANS les résultats
      // d'un bloc parent (parentBlock). returnBlock désigne quel bloc renvoyer.
      // Vocabulaire d'opérateurs et de jointures = exactement ceux observés
      // dans le réel (equals/contains/is_not_empty/in_collection ; ''/AND),
      // pas inventés. Pas de connexion : la recherche APS n'en référence aucune
      // dans les données réelles (endpoint interne, pas une connexion choisie).
      case 'iconik.search':
        return [
          { nature: 'liste', chemin: 'blocks', label: 'Blocks', ajoutLabel: 'Add block',
            itemDefaut: { objectType: 'asset', parentBlock: null, criteria: [] },
            itemSchema: [
              { nature: 'choix', chemin: 'objectType', label: 'Type', options: [
                { valeur: 'collection', libelle: 'Collection' },
                { valeur: 'asset', libelle: 'Asset' }
              ] },
              { nature: 'nombre', chemin: 'parentBlock', label: 'Within block (optional)', placeholder: 'block id' },
              { nature: 'liste', chemin: 'criteria', label: 'Criteria', ajoutLabel: 'Add criterion',
                itemDefaut: { op: 'equals', field: '', value: '', join: '' },
                itemSchema: [
                  { nature: 'choix', chemin: 'join', label: 'Join', options: [
                    { valeur: '', libelle: '(first)' },
                    { valeur: 'AND', libelle: 'AND' },
                    { valeur: 'OR', libelle: 'OR' }
                  ] },
                  { nature: 'metadonnee', chemin: 'field', label: 'Field', placeholder: 'BayardID, __collection__…' },
                  { nature: 'operateur', chemin: 'op', label: 'Operator',
                    options: function (model, contexte, descr) {
                      const md = _metadonneeFrere(model, contexte, descr);
                      return _operateursPourType(md ? md.uiType : '');
                    } },
                  { nature: 'valeurTypee', chemin: 'value', label: 'Value',
                    visibleSi: function (m) { return m.lire('op') !== 'is_not_empty'; } }
                ]
              }
            ]
          },
          { nature: 'nombre', chemin: 'returnBlock', label: 'Return block (id)', placeholder: '1' },
          { nature: 'texte', chemin: 'expression', label: 'Raw expression (advanced)', placeholder: 'optional override' },
          { nature: 'nombre', chemin: 'limit', label: 'Limit', min: 1, placeholder: '500' },
          { nature: 'variable', chemin: 'resultVar', label: 'Store results as', placeholder: '{search_results}' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // Fetch : récupère un objet. Connexion + cible + variable.
      case 'iconik.fetch':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'variable', chemin: 'target', label: 'Fetch', placeholder: '{collection.id}' },
          { nature: 'variable', chemin: 'fetchVar', label: 'Store as', placeholder: '{fetched}' }
        ];

      // Set Metadata : écrit des métadonnées. Transcrit fidèlement les 12
      // occurrences réelles (PUBLISH V2 + STATUSES) et le handler du moteur
      // (wfd-engine-handlers.js, update_meta + metadata_patch/metadata_collection) :
      //  - `target` (asset|collection) et `targetId` (la variable) sont DEUX
      //    champs distincts dans les données réelles, pas un seul comme
      //    l'ancien schéma le supposait.
      //  - `fields[].key` (pas `name`) : le moteur lit littéralement `f.key`.
      //  - `fields[].op` et `method` existent dans les 12 configs réelles
      //    (toujours "write"/"patch") mais ne sont JAMAIS lus par le moteur —
      //    ni l'un ni l'autre ne change quoi que ce soit à l'exécution.
      //    Volontairement absents d'ici : les exposer suggérerait un effet
      //    qu'ils n'ont pas.
      //  - `connexionId` absent des données réelles (même constat que
      //    aps_search) : la cible est résolue depuis `target`/`targetId`,
      //    pas une connexion choisie.
      // RISQUE SIGNALÉ (pas silencieux, non corrigé — WFD reste intouché) :
      // mode "view" délègue à metadata_collection, qui écrit `fields` SANS
      // fusionner avec les valeurs existantes (contrairement au mode
      // "fields", qui fait un GET puis merge). Sur une collection avec
      // mdViewId vide, "view" écrase donc silencieusement tout champ non
      // listé ici — observé tel quel sur le seul nœud réel qui utilise ce
      // mode ("Ecrire Collection"). Sur un ASSET, le même mode "view" est
      // pire : l'URL est construite avec l'id de vue SANS filet — un
      // mdViewId vide y produit une requête cassée. Aucun des 12 nœuds réels
      // n'utilise mode "view" sur un asset — chemin jamais éprouvé.
      case 'iconik.set_metadata':
        return [
          { nature: 'choix', chemin: 'target', label: 'Target type', options: [
            { valeur: 'asset', libelle: 'Asset' },
            { valeur: 'collection', libelle: 'Collection' }
          ] },
          { nature: 'variable', chemin: 'targetId', label: 'On object', placeholder: '{asset.id} or {collection.id}' },
          { nature: 'choix', chemin: 'mode', label: 'Mode', options: [
            { valeur: 'fields', libelle: 'Direct (merges existing, view optional)' },
            { valeur: 'view', libelle: 'Via metadata view (overwrites, no merge)' }
          ] },
          // Toutes les vues réelles de l'environnement, non filtrées par type
          // — cf. commentaire de vuesMetadonnees dans config-sources.js (une
          // vue peut ne relever d'aucune catégorie, donc d'aucun type connu).
          // reagit : le choix de la vue doit rafraîchir les suggestions du
          // champ `key` juste en dessous (vuePour).
          { nature: 'vueMetadonnee', chemin: 'mdViewId', label: 'Metadata view', reagit: true,
            placeholder: 'no view (write raw fields)' },
          { nature: 'liste', chemin: 'fields', label: 'Fields', ajoutLabel: 'Add field',
            itemDefaut: { key: '', value: '' },
            itemSchema: [
              // Si une vue est choisie (mdViewId), suggère SES champs réels
              // (view_fields, signal fiable — vérifié en direct) plutôt que les
              // 169 champs de l'environnement entier.
              { nature: 'metadonnee', chemin: 'key', label: 'Field', placeholder: 'field name',
                vuePour: function (m) { return m.lire('mdViewId'); } },
              { nature: 'valeurTypee', chemin: 'value', label: 'Value', champFrere: 'key', placeholder: '{value} or literal' }
            ]
          },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // History (Iconik) : journal texte écrit dans un champ de métadonnée
      // (mdField, via une vue optionnelle mdViewId — même duo target/targetId
      // et même suggestion "champs de la vue" que set_metadata, réutilisée
      // telle quelle). Transcrit depuis les 11 occurrences réelles et le
      // handler du moteur (wfd-engine-handlers.js, workflow_history).
      case 'iconik.history':
        return [
          { nature: 'choix', chemin: 'target', label: 'Target type', options: [
            { valeur: 'asset', libelle: 'Asset' },
            { valeur: 'collection', libelle: 'Collection' }
          ] },
          { nature: 'variable', chemin: 'targetId', label: 'On object', placeholder: '{asset.id} or {collection.id}' },
          { nature: 'vueMetadonnee', chemin: 'mdViewId', label: 'Metadata view', reagit: true,
            placeholder: 'no view (write raw field)' },
          { nature: 'metadonnee', chemin: 'mdField', label: 'History field', placeholder: 'field name',
            vuePour: function (m) { return m.lire('mdViewId'); } },
          { nature: 'choix', chemin: 'whMode', label: 'Mode', options: [
            { valeur: 'add', libelle: 'Always add a line' },
            { valeur: 'update', libelle: "Replace this run's line if present" }
          ] },
          { nature: 'choix', chemin: 'whOrder', label: 'New lines go', options: [
            { valeur: 'newest', libelle: 'On top (newest first)' },
            { valeur: 'oldest', libelle: 'At the end (oldest first)' }
          ] },
          { nature: 'texte', chemin: 'whStatut', label: 'Status badge', placeholder: 'e.g. ✅ Succès' },
          { nature: 'texte', chemin: 'whMessage', label: 'Message', placeholder: 'e.g. Delivered · {now(Europe/Paris)}' },
          { nature: 'texte', chemin: 'whWfName', label: 'Workflow name (override)', placeholder: 'defaults to the flow name' },
          { nature: 'variable', chemin: 'whSummaryVar', label: 'Auto-summarize', placeholder: '{path.to.results}' },
          // Réel : ces 4 cases sont VRAIES par défaut côté moteur (!== false) —
          // un nœud neuf, cases décochées ici, affiche donc moins que le
          // comportement par défaut du moteur tant qu'on ne les coche pas.
          // Signalé, pas corrigé (pas d'infrastructure de valeurs par défaut
          // à la création).
          { nature: 'booleen', chemin: 'whShowDate', label: 'Show date' },
          { nature: 'booleen', chemin: 'whShowWf', label: 'Show workflow name' },
          { nature: 'booleen', chemin: 'whShowUser', label: 'Show triggering user' },
          { nature: 'booleen', chemin: 'whShowRunId', label: 'Show run id' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // Action : déclenche une action (ex. export location). Connexion + action.
      // Action : le plus gros dispatcher du moteur — 41 actionType réels et
      // câblés (vérifié : wfd-engine-handlers.js, fonction action(), chaque
      // valeur est un `case` réel, pas une supposition). `connexionId`/
      // `actionId` de l'ancien schéma n'existent dans aucune donnée réelle —
      // la vraie clé est `actionType`. Un seul est vérifié en détail ici
      // (`export_location_trigger`, 6/6 occurrences réelles de VOD Factory) :
      // `target` désigne l'EXPORT LOCATION (pas l'objet — piège de nommage de
      // l'ancien schéma), `assetId` l'objet réel. Les 40 autres restent
      // sélectionnables (catalogue complet, tous fonctionnels côté moteur)
      // mais passent par `actionValue` en texte brut, faute d'avoir vérifié
      // le détail de chacun un par un.
      case 'iconik.action':
        return [
          { nature: 'choix', chemin: 'actionType', label: 'Action', reagit: true, options: [
            { valeur: 'export_location_trigger', libelle: 'Export Location' },
            { valeur: 'asset_create', libelle: 'Asset — create' },
            { valeur: 'asset_patch', libelle: 'Asset — patch' },
            { valeur: 'asset_update', libelle: 'Asset — update' },
            { valeur: 'asset_delete', libelle: 'Asset — delete' },
            { valeur: 'asset_restore', libelle: 'Asset — restore' },
            { valeur: 'asset_copy', libelle: 'Asset — copy' },
            { valeur: 'asset_set_status', libelle: 'Asset — set status' },
            { valeur: 'collection_create', libelle: 'Collection — create' },
            { valeur: 'collection_update', libelle: 'Collection — update' },
            { valeur: 'collection_delete', libelle: 'Collection — delete' },
            { valeur: 'collection_add_asset', libelle: 'Collection — add asset' },
            { valeur: 'collection_remove_asset', libelle: 'Collection — remove asset' },
            { valeur: 'metadata_write', libelle: 'Metadata — write' },
            { valeur: 'metadata_patch', libelle: 'Metadata — patch (view)' },
            { valeur: 'metadata_collection', libelle: 'Metadata — collection' },
            { valeur: 'metadata_view_create', libelle: 'Metadata — create view' },
            { valeur: 'metadata_field_create', libelle: 'Metadata — create field' },
            { valeur: 'acl_set_asset', libelle: 'ACL — set on asset' },
            { valeur: 'acl_set_collection', libelle: 'ACL — set on collection' },
            { valeur: 'acl_template_apply', libelle: 'ACL — apply template' },
            { valeur: 'acl_propagate', libelle: 'ACL — propagate' },
            { valeur: 'acl_remove', libelle: 'ACL — remove' },
            { valeur: 'format_create', libelle: 'Format — create' },
            { valeur: 'format_delete', libelle: 'Format — delete' },
            { valeur: 'file_create', libelle: 'File — create' },
            { valeur: 'file_set_create', libelle: 'File set — create' },
            { valeur: 'proxy_create', libelle: 'Proxy — create' },
            { valeur: 'proxy_patch', libelle: 'Proxy — patch' },
            { valeur: 'proxy_keyframe', libelle: 'Proxy — keyframe' },
            { valeur: 'keyframe_create', libelle: 'Keyframe — create' },
            { valeur: 'transcode_create', libelle: 'Transcode — create' },
            { valeur: 'relation_create', libelle: 'Relation — create' },
            { valeur: 'segment_create', libelle: 'Segment — create' },
            { valeur: 'saved_search_run', libelle: 'Saved search — run' },
            { valeur: 'saved_search_create', libelle: 'Saved search — create' },
            { valeur: 'job_get_status', libelle: 'Job — get status' },
            { valeur: 'automation_trigger', libelle: 'Automation — trigger' },
            { valeur: 'webhook_create', libelle: 'Webhook — create' },
            { valeur: 'custom_action_trigger', libelle: 'Custom Action — trigger' },
            { valeur: 'share_create', libelle: 'Share — create' }
          ] },

          // Export Location — le seul détaillé aujourd'hui.
          { nature: 'exportLocation', chemin: 'target', label: 'Export location',
            visibleSi: function (m) { return m.lire('actionType') === 'export_location_trigger'; } },
          { nature: 'variable', chemin: 'assetId', label: 'Asset', placeholder: '{item.id}',
            visibleSi: function (m) { return m.lire('actionType') === 'export_location_trigger'; } },
          { nature: 'texte', chemin: 'fileName', label: 'Destination filename', placeholder: '{filebase(item.title)}',
            visibleSi: function (m) { return m.lire('actionType') === 'export_location_trigger'; } },
          { nature: 'booleen', chemin: 'overwrite', label: 'Overwrite if exists',
            visibleSi: function (m) { return m.lire('actionType') === 'export_location_trigger'; } },
          { nature: 'booleen', chemin: 'createFolderAsset', label: 'Export to asset folder',
            visibleSi: function (m) { return m.lire('actionType') === 'export_location_trigger'; } },

          // Tout autre actionType : pas encore détaillé — reste utilisable
          // via une cible générique + une valeur brute.
          { nature: 'variable', chemin: 'assetId', label: 'On object', placeholder: '{asset.id}',
            visibleSi: function (m) { return m.lire('actionType') && m.lire('actionType') !== 'export_location_trigger'; } },
          { nature: 'texte', chemin: 'actionValue', label: 'Value (raw)', placeholder: 'depends on the action',
            visibleSi: function (m) { return m.lire('actionType') && m.lire('actionType') !== 'export_location_trigger'; } },

          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // Create Tree : crée une arborescence de collections. Connexion + racine +
      // gabarit d'arborescence (ressource — branchée plus tard). Services
      // registry/counter déductibles, non exposés.
      case 'iconik.create_tree':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'variable', chemin: 'root', label: 'Under collection', placeholder: '{collection.id}' },
          { nature: 'variable', chemin: 'template', label: 'Tree template', placeholder: '{arbo}' }
        ];

      // S3 : livraison vers un bucket. Connexion S3 (non testable en HTTP) +
      // chemin de destination + payload.
      // S3 (livraison) : corrigé pour rejoindre le Core `deliver`
      // (manifestId) plutôt qu'un schéma parallèle jamais vérifié
      // (`bucketPath`/`payload`, qui n'existaient dans aucune donnée réelle).
      // `objectKey` (pas `prefixe`, générique côté Core) est le vrai nom que
      // le moteur lit pour `aws_s3`/`wait_for` — vocabulaire AWS, propre à
      // cette façade, pas au Core agnostique. Volontairement SANS
      // `s3Mappings`/`artworks` bruts : c'est justement ce que `manifestId`
      // remplace (cf. discussion — la même règle de mapping vidéo/image/
      // sous-titre était dupliquée identique sur les 6 occurrences réelles).
      case 'aws_s3.deliver':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'S3 connection', filtreType: 'aws_s3' },
          { nature: 'manifeste', chemin: 'manifestId', label: 'Manifest' },
          { nature: 'texte', chemin: 'objectKey', label: 'Destination path', placeholder: 'AmazonPrime/{slug(collectionCheck.title)}/{filebase(item.title)}' },
          { nature: 'variable', chemin: 'resultVar', label: 'Store result as', placeholder: '{awsResult}' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      default:
        return null;   // pas de schéma façade dédié -> on retombe sur le core
    }
  }

  return { pour };

})();

if (typeof window !== 'undefined') window.ConfigSchema = ConfigSchema;
if (typeof module !== 'undefined') module.exports = ConfigSchema;
