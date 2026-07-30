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

    // Familles qui produisent un résultat stockable.
    const produit = ['http_request', 'lookup', 'transform', 'set_variable', 'loop', 'http_sequence'];
    if (core && produit.indexOf(core) >= 0) {
      s.push({ nature: 'variable', chemin: 'resultVar', label: 'Store result as',
               placeholder: '{result}' });
    }

    // Décision : conditions MULTIPLES via la nature liste. Chaque condition est
    // un sous-schéma {opérateur + champs dépendants}. Démontre la composition :
    // liste contient opérateur qui pilote ses champs, le tout réactif.
    if (core === 'decision') {
      s.push({ nature: 'variable', chemin: 'on', label: 'Evaluate', placeholder: '{value}' });
      s.push({
        nature: 'liste', chemin: 'conditions', label: 'Conditions', ajoutLabel: 'Add condition',
        itemDefaut: { op: 'equals', value: '' },
        itemSchema: [
          { nature: 'operateur', chemin: 'op', label: 'Operator', options: [
            { valeur: 'equals', libelle: 'equals' },
            { valeur: 'contains', libelle: 'contains' },
            { valeur: 'between', libelle: 'between' },
            { valeur: 'is_empty', libelle: 'is empty' }
          ] },
          { nature: 'texte', chemin: 'value', label: 'Value',
            visibleSi: function (m) { return ['equals', 'contains'].indexOf(m.lire('op')) >= 0; } },
          { nature: 'texte', chemin: 'from', label: 'From',
            visibleSi: function (m) { return m.lire('op') === 'between'; } },
          { nature: 'texte', chemin: 'to', label: 'To',
            visibleSi: function (m) { return m.lire('op') === 'between'; } },
          { nature: 'texte', chemin: 'label', label: 'Branch label', placeholder: 'e.g. Série' }
        ]
      });
    }

    // Boucle : option d'exécution parallèle (démontre la nature booléen, qui
    // peut piloter un champ dépendant — ici la concurrence max).
    if (core === 'loop') {
      s.push({ nature: 'variable', chemin: 'over', label: 'Iterate over', placeholder: '{list}' });
      s.push({ nature: 'booleen', chemin: 'parallel', label: 'Run in parallel', reagit: true });
      s.push({ nature: 'nombre', chemin: 'maxConcurrency', label: 'Max concurrency', min: 1,
               visibleSi: function (m) { return !!m.lire('parallel'); } });
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

    // Wait : durée numérique OU attente d'une condition. Mode pilote.
    if (core === 'wait') {
      s.push({ nature: 'nombre', chemin: 'seconds', label: 'Duration (seconds)', min: 0, placeholder: '0' });
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

    // History : consigne un évènement dans l'historique du flux.
    if (core === 'history') {
      s.push({ nature: 'texte', chemin: 'message', label: 'Message', placeholder: 'e.g. Delivered to {target}' });
      s.push({ nature: 'choix', chemin: 'level', label: 'Level', options: [
        { valeur: 'info', libelle: 'Info' },
        { valeur: 'warn', libelle: 'Warning' },
        { valeur: 'error', libelle: 'Error' }
      ] });
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

      // Search (aps_search) : recherche APS. Connexion + expression + variable
      // de résultat. modes retrieve/presence -> un choix qui pilotera plus tard
      // le détail. (La nature 'arbo' viendra enrichir le ciblage de collections.)
      case 'iconik.search':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'choix', chemin: 'mode', label: 'Mode', options: [
            { valeur: 'retrieve', libelle: 'Retrieve results' },
            { valeur: 'presence', libelle: 'Check presence' }
          ] },
          { nature: 'texte', chemin: 'expression', label: 'Search expression', placeholder: 'metadata query' },
          { nature: 'nombre', chemin: 'limit', label: 'Limit', min: 1, placeholder: '50' },
          { nature: 'variable', chemin: 'resultVar', label: 'Store results as', placeholder: '{results}' }
        ];

      // Fetch : récupère un objet. Connexion + cible + variable.
      case 'iconik.fetch':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'variable', chemin: 'target', label: 'Fetch', placeholder: '{collection.id}' },
          { nature: 'variable', chemin: 'fetchVar', label: 'Store as', placeholder: '{fetched}' }
        ];

      // Set Metadata : écrit des métadonnées. Mode fields/view pilote.
      case 'iconik.set_metadata':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'variable', chemin: 'target', label: 'On object', placeholder: '{asset.id}' },
          { nature: 'choix', chemin: 'mode', label: 'Mode', reagit: true, options: [
            { valeur: 'fields', libelle: 'Individual fields' },
            { valeur: 'view', libelle: 'Metadata view' }
          ] },
          { nature: 'texte', chemin: 'viewId', label: 'View ID',
            visibleSi: function (m) { return m.lire('mode') === 'view'; } },
          { nature: 'liste', chemin: 'fields', label: 'Fields', ajoutLabel: 'Add field',
            itemDefaut: { name: '', value: '' },
            itemSchema: [
              { nature: 'texte', chemin: 'name', label: 'Field', placeholder: 'field_name' },
              { nature: 'variable', chemin: 'value', label: 'Value', placeholder: '{value}' }
            ],
            visibleSi: function (m) { return (m.lire('mode') || 'fields') === 'fields'; } }
        ];

      // Action : déclenche une action (ex. export location). Connexion + action.
      case 'iconik.action':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'Connection' },
          { nature: 'variable', chemin: 'target', label: 'On object', placeholder: '{asset.id}' },
          { nature: 'texte', chemin: 'actionId', label: 'Action', placeholder: 'export_location' }
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
      case 'aws_s3.deliver':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'S3 connection', filtreType: 'aws_s3' },
          { nature: 'texte', chemin: 'bucketPath', label: 'Destination path', placeholder: 'folder/{name}' },
          { nature: 'variable', chemin: 'payload', label: 'Payload', placeholder: '{manifest}' }
        ];

      default:
        return null;   // pas de schéma façade dédié -> on retombe sur le core
    }
  }

  return { pour };

})();

if (typeof window !== 'undefined') window.ConfigSchema = ConfigSchema;
if (typeof module !== 'undefined') module.exports = ConfigSchema;
