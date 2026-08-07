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

    // Post-it : le SEUL schéma qui n'hérite pas des champs communs. Un nœud a
    // un nom parce qu'on doit pouvoir en parler ; un post-it n'en a pas besoin,
    // il EST son texte — et afficher « Name » au-dessus de « Texte » ferait
    // saisir deux fois la même chose (WFD ne montre que ces deux champs,
    // wfd-config-panel.js:1818).
    if (core === 'postit') {
      return [
        { nature: 'texteLong', chemin: 'text', label: 'Texte / Description',
          placeholder: 'Étape externe, note, contrainte, question…', lignes: 5 },
        { nature: 'couleur', chemin: 'color', label: 'Couleur', defaut: '#f1c40f' }
      ];
    }

    // Familles qui produisent un résultat stockable. `loop` retiré : vérifié
    // sur les 7 occurrences réelles + wfd-engine-executor.js (executeLoopNode)
    // — `resultVar` n'existe dans aucune donnée réelle et n'est jamais lu par
    // le moteur pour ce Core (chaque item est exposé via `loopVar`, pas un
    // résultat agrégé stocké à la fin).
    // `lookup` retiré de la même façon (constaté le 4 août, en répondant à une
    // question sur le panneau) : lookup() (wfd-engine-handlers.js) ne lit QUE
    // `cfg.lkOutputVar` (déjà déclaré plus bas, champ "Store as") — jamais
    // `cfg.resultVar`. Avant ce retrait, CHAQUE nœud Lookup affichait deux
    // champs de stockage ("Store result as" ET "Store as"), dont un mort :
    // remplir le mauvais silencieusement ne stockait rien nulle part.
    const produit = ['http_request', 'transform', 'set_variable', 'http_sequence'];
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
    //
    // Planification (`schedule`) réécrite après lecture de l'unique occurrence
    // réelle (famille WFD `timer`) et du planificateur (wfd-engine-trigger.js,
    // scheduleTimer()) : BUG RÉEL, même famille que `on`->`field` sur Decision
    // — l'ancien champ s'appelait `cron`, mais le planificateur lit
    // exclusivement `cfg.cronExpr` (ligne 310). Un cron construit dans le
    // Builder aurait toujours été ignoré, silencieusement remplacé par le
    // défaut en dur du moteur (`0 9 * * 1-5`). Corrigé ici ET dans
    // pivot-catalog-iconik.js (familleWfd() testait `p.cron` pour reconnaître
    // une minuterie — même faute, corrigée en `p.cronExpr`).
    //
    // `timerMode` a deux autres valeurs réelles et câblées (`interval`,
    // `oneshot`) — non prouvées par l'occurrence réelle (qui est en `cron`)
    // mais lues telles quelles par scheduleTimer(), pas des chemins morts.
    //
    // Omis, vestiges de l'ancien widget de construction de cron de WFD :
    // `cronFreq`/`cronDays`/`cronHour`/`cronMinute`/`cronMday` (présents sur
    // l'occurrence réelle, mais AUCUN n'est lu par scheduleTimer() — seul le
    // `cronExpr` déjà compilé compte ; d'ailleurs l'occurrence réelle le
    // prouve en creux : cronDays vaut [1,2,3,4,5] mais cronExpr est
    // "00 02 * * *", jour-de-semaine `*` — l'ancien widget avait calculé les
    // jours sans jamais les écrire dans l'expression finale). `intervalStart`
    // pareil : présent, jamais lu (setInterval n'a pas de notion d'heure de
    // départ).
    if (core === 'trigger') {
      s.push({ nature: 'choix', chemin: 'kind', label: 'Trigger on', reagit: true, options: [
        { valeur: 'asset', libelle: 'An asset' },
        { valeur: 'collection', libelle: 'A collection' },
        { valeur: 'segment', libelle: 'A segment' },
        { valeur: 'schedule', libelle: 'A schedule' }
      ] });
      s.push({ nature: 'choix', chemin: 'timerMode', label: 'Schedule type', reagit: true,
               visibleSi: function (m) { return m.lire('kind') === 'schedule'; },
               aide: 'Cron: recurring on a fine-grained pattern (needs a cron expression). Fixed interval: simplest recurring case ("every N minutes/hours/days"). One-shot: runs once at a specific date and time, then never again.',
               options: [
                 { valeur: 'cron', libelle: 'Cron expression' },
                 { valeur: 'interval', libelle: 'Fixed interval' },
                 { valeur: 'oneshot', libelle: 'One-shot (single future date)' }
               ] });
      s.push({ nature: 'texte', chemin: 'cronExpr', label: 'Cron expression', placeholder: '0 6 * * *',
               aide: '5 fields: minute hour day-of-month month day-of-week (0=Sunday). * means "every". Examples — every day at 2am: "0 2 * * *" · weekdays at 9am: "0 9 * * 1-5" · every hour: "0 * * * *" · every 15 minutes: "*/15 * * * *" · the 1st of each month at midnight: "0 0 1 * *".',
               visibleSi: function (m) { return m.lire('kind') === 'schedule' && (m.lire('timerMode') || 'cron') === 'cron'; } });
      s.push({ nature: 'texte', chemin: 'timezone', label: 'Timezone', placeholder: 'Europe/Paris',
               aide: 'IANA timezone name. Leave empty to use the server\'s local time instead of a fixed timezone.',
               visibleSi: function (m) { return m.lire('kind') === 'schedule' && (m.lire('timerMode') || 'cron') === 'cron'; } });
      s.push({ nature: 'nombre', chemin: 'intervalVal', label: 'Every', min: 1, placeholder: '30',
               visibleSi: function (m) { return m.lire('kind') === 'schedule' && m.lire('timerMode') === 'interval'; } });
      s.push({ nature: 'choix', chemin: 'intervalUnit', label: 'Unit',
               visibleSi: function (m) { return m.lire('kind') === 'schedule' && m.lire('timerMode') === 'interval'; },
               aide: 'The flow runs on a fixed clock starting when the server loads it — there is no time-of-day setting for this mode (use Cron if you need one, e.g. "every day at 6am").',
               options: [
                 { valeur: 'minutes', libelle: 'Minutes' },
                 { valeur: 'hours', libelle: 'Hours' },
                 { valeur: 'days', libelle: 'Days' }
               ] });
      s.push({ nature: 'texte', chemin: 'oneshotDatetime', label: 'Run at (date-time)', placeholder: '2026-08-15T10:00',
               aide: 'Any date-time your browser understands, e.g. "2026-08-15T10:00". Must be in the future — a past date is silently ignored (nothing runs).',
               visibleSi: function (m) { return m.lire('kind') === 'schedule' && m.lire('timerMode') === 'oneshot'; } });
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

    // Lookup : traduit un objet (typiquement des métadonnées Iconik, en
    // français) vers un autre vocabulaire (typiquement un payload partenaire,
    // en anglais) selon une table clé→chemin. Réécrit en profondeur après
    // lecture de l'unique occurrence réelle et du handler (wfd-engine-handlers.js,
    // lookup()) : l'ancien schéma (source/key/lkOutputVar) ne correspondait à
    // RIEN de ce que le handler lit — ni `source` ni `key` n'existent.
    //
    // Le MODE (objet à traduire champ par champ, vs. valeur simple à faire
    // correspondre) n'est PAS un choix de configuration : le handler l'infère
    // du TYPE runtime de la valeur résolue (`typeof inputRaw === 'object'`).
    // Rien à exposer ici — `lkFallback` (ci-dessous) ne compte que si l'entrée
    // n'est PAS un objet.
    //
    // COMBLÉ le 3 août : `lkRows` est maintenant la ressource d'org `Mapping`
    // (server/routes/mapping.js), au même titre que le Manifeste ou le
    // gabarit d'arborescence — l'argument déjà posé dans builder-etat.md tient
    // toujours (elle sert DEUX étapes : Lookup la lit, HTTP Sequence s'appuie
    // sur ce qu'elle produit). Le nœud ne stocke que `mappingId` ; la
    // résolution en `lkRows` se fait au moment de la conversion pivot → WFD
    // (pivot-to-wfd.js, `_config()`, via `options.resolutions.mappings`),
    // jamais recopiée ici — même principe que le format d'échange projeté et
    // stable décrit dans l'en-tête de pivot-to-wfd.js.
    //
    // PAS ENCORE FAIT (chantier séparé, plus gros que ce fichier) : aucun
    // écran ne permet de CRÉER/ÉDITER les rows d'un Mapping — admin/ressources
    // (server/public/admin/ressources/) n'en affiche aujourd'hui que le nom et
    // le décompte. Tant que cet écran n'existe pas, `mappingId` référence une
    // ressource qu'on ne peut peupler que par API directe. La forme attendue
    // d'une row par lookup() (wfd-engine-handlers.js), pour ne pas avoir à la
    // redériver : `{ key, value, type?, _format?, fallback?, children?:
    // [{key,value}] }` — key = champ source, value = chemin destination,
    // type ∈ string|list|integer|float|boolean, _format ∈ ''|slug, children =
    // table de traduction de valeur (ex. "Drame" -> "av_genre_drama").
    //
    // `onError` omis : comme `checker`/`aps.registry`, lookup() ne lève jamais
    // d'exception. `lkTechMap`/`lkTechVar`/`lkApiEndpoint` omis : présents sur
    // l'occurrence réelle mais introuvables dans TOUT le moteur (grep sur
    // wfd-engine-handlers.js et les fichiers voisins) — vestiges morts, pas
    // juste inutilisés par ce handler. `lkActiveTab`/`lkApiFolded`/
    // `lkSourceFolded` omis : état de pliage de l'ancien panneau WFD, déjà
    // catalogué comme fuite dans builder-etat.md ("Fuites à ne pas
    // reproduire").
    if (core === 'lookup') {
      s.push({ nature: 'variable', chemin: 'lkInputVar', label: 'Input', placeholder: '{collectionData}' });
      s.push({ nature: 'mapping', chemin: 'mappingId', label: 'Mapping table' });
      s.push({ nature: 'valeurTypee', chemin: 'lkFallback', label: 'Fallback (simple-value mode only — input not an object)', placeholder: '' });
      s.push({ nature: 'variable', chemin: 'lkOutputVar', label: 'Store as', placeholder: '{vodFactoryPayload}' });
    }

    // Transform : applique UNE opération à UNE valeur. Réécrit le 4 août après
    // lecture du handler réel (transform(), wfd-engine-handlers.js:365) — le
    // schéma d'origine (`input`/`mode: expression|fields`/`fields[]`) ne
    // correspondait à AUCUN nom réel : `input` n'est jamais lu (le handler lit
    // `cfg.source`), `mode`/`fields` sont ignorés, et surtout `target` — le SEUL
    // champ qui décide si quoi que ce soit est stocké — était absent du panneau.
    // Un Transform construit dans le Builder avant cette passe ne faisait donc
    // RIEN d'observable, même avec une expression valide dedans.
    //
    // Le handler a DEUX branches : si `cfg.rules[]` est présent, un mode
    // "composition" (assembler plusieurs sources + séparateur + casse) hérité
    // de l'ancien "Transformer designer" du WFD Designer
    // (platforms/iconik/workflow/) — un outil séparé, pas ce Core. Zéro
    // occurrence réelle de `family: transform` dans les flows VOD Factory (grep
    // sur l'export complet) : rien à auditer contre du réel, donc le panneau
    // cible l'autre branche, la plus générale ("mode simple" du handler — une
    // opération sur une valeur), celle qui correspond au but affiché du Core.
    if (core === 'transform') {
      s.push({ nature: 'variable', chemin: 'source', label: 'Value', placeholder: '{value}' });
      s.push({ nature: 'choix', chemin: 'operation', label: 'Operation', reagit: true, options: [
        { valeur: 'upper', libelle: 'Uppercase' },
        { valeur: 'lower', libelle: 'Lowercase' },
        { valeur: 'trim', libelle: 'Trim' },
        { valeur: 'replace', libelle: 'Replace' },
        { valeur: 'regex_replace', libelle: 'Replace (regex)' },
        { valeur: 'slice', libelle: 'Slice' },
        { valeur: 'pad_start', libelle: 'Pad start' },
        { valeur: 'truncate', libelle: 'Truncate' },
        { valeur: 'separator_join', libelle: 'Normalize separators' },
        { valeur: 'expression', libelle: 'Expression' }
      ] });
      s.push({ nature: 'variable', chemin: 'find', label: 'Find', placeholder: 'texte ou {ref}',
               visibleSi: function (m) { return ['replace', 'regex_replace'].indexOf(m.lire('operation')) !== -1; } });
      s.push({ nature: 'variable', chemin: 'replace', label: 'Replace with', placeholder: 'texte ou {ref}',
               visibleSi: function (m) { return ['replace', 'regex_replace'].indexOf(m.lire('operation')) !== -1; } });
      s.push({ nature: 'nombre', chemin: 'start', label: 'Start', placeholder: '0',
               visibleSi: function (m) { return m.lire('operation') === 'slice'; } });
      s.push({ nature: 'nombre', chemin: 'end', label: 'End (optional — else to the end)',
               visibleSi: function (m) { return m.lire('operation') === 'slice'; } });
      s.push({ nature: 'nombre', chemin: 'length', label: 'Target length', placeholder: '2',
               visibleSi: function (m) { return m.lire('operation') === 'pad_start'; } });
      s.push({ nature: 'texte', chemin: 'char', label: 'Padding character', placeholder: '0',
               visibleSi: function (m) { return m.lire('operation') === 'pad_start'; } });
      s.push({ nature: 'nombre', chemin: 'maxLen', label: 'Max length', placeholder: '50',
               visibleSi: function (m) { return m.lire('operation') === 'truncate'; } });
      s.push({ nature: 'texte', chemin: 'separator', label: 'Separator', placeholder: '_',
               visibleSi: function (m) { return m.lire('operation') === 'separator_join'; } });
      s.push({ nature: 'texte', chemin: 'expression', label: 'Expression', placeholder: 'e.g. {value} > 1920 ? "HD" : "SD"',
               visibleSi: function (m) { return m.lire('operation') === 'expression'; } });
      s.push({ nature: 'variable', chemin: 'target', label: 'Store as', placeholder: '{result}' });
    }

    // Verify (→ famille WFD `checker`, cf. pivot-catalog-iconik.js familleWfd)
    // : sonde une LISTE d'endpoints, chacun avec son propre chemin de réponse
    // et opérateur attendu. Réécrit en profondeur après lecture du handler
    // réel (wfd-engine-handlers.js, checker()) : le schéma d'origine décrivait
    // une condition UNIQUE (on/op/value) qui ne correspond à RIEN de ce que
    // checker() lit — le handler ne consulte QUE `cfg.checks` ; avec l'ancien
    // schéma, `checks` restait vide et pivot-to-wfd.js (qui copie `params` tel
    // quel dans `config`, sans transformation par famille) produisait un nœud
    // qui retourne toujours { port: 0 } (succès silencieux), quoi que
    // l'utilisateur configure — bug de la même famille que `on`->`field` sur
    // Decision, plus sournois : ici rien ne plante, la vérification ne
    // vérifie juste jamais rien. Vocabulaire d'opérateurs = exactement les 5
    // gérés par le switch du handler (equals/not_equals/not_empty/contains/
    // starts_with) — pas les 20 de Decision. `connexionId` optionnel (retombe
    // sur la plateforme du flow si absent, comme `wait`). `onError` et
    // `description` omis : présents sur les 5 occurrences réelles (toujours
    // `continue_log`) mais AUCUN des deux n'est lu par checker() — le bloc
    // catch retourne { port: 2 } sans consulter cfg.onError, même règle que
    // op/method sur update_meta.
    // Verify : réécrit le 4 août pour se piloter depuis le même Manifeste que
    // Deliver, plutôt qu'une liste de checks figée et dupliquée par niveau.
    // Vérifié contre les 4 occurrences réelles (Vérificateur Série/Saison/
    // Episode/Unitaire) : mêmes rôles que les essences de livraison (cover,
    // hero, poster, season_box, box, video, subtitle), juste vérifiés côté
    // PARTENAIRE (endpoint/chemin propres à chaque rôle — `title`/`episodic`
    // sont livrés mais jamais recontrôlés dans le réel, cohérent avec le fait
    // que leur essence n'a pas de `verifyPath`). La résolution
    // `manifestId -> checks` se fait dans pivot-to-wfd.js, comme
    // `manifestId -> s3Mappings` pour Deliver ; le filtrage par niveau
    // (`appliesTo`) se fait à l'exécution dans checker() (wfd-engine-
    // handlers.js), comme aws_s3().
    if (core === 'verify') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Connection (optional — falls back to the flow\'s platform)' });
      s.push({ nature: 'manifeste', chemin: 'manifestId', label: 'Manifest (checks the same essences it delivers)' });
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

    // HTTP Sequence (façade vodfactory.partner, node "Partner" = Publication
    // API de WFD) : une SUITE de requêtes, chacune en mode `simple` ou
    // `foreach`. Portée le 4 août sur une ressource d'org dédiée (`Endpoint`,
    // onglet "Endpoints" du Builder, admin/endpoints/) — même paradigme que
    // Mapping pour Lookup ou Manifest pour Deliver : ~10 champs conditionnels
    // PAR ÉTAPE (7 étapes réelles) étaient un fichier de config déguisé en
    // formulaire canevas, pas un montage narratif "dix étapes qui se lisent
    // comme une phrase". Le panneau ne porte plus que la référence
    // (`sequenceId`), résolue en `cfg.steps` au moment de la conversion
    // pivot → WFD (pivot-to-wfd.js), jamais recopiée ici. `connexionId` reste
    // sur LE NŒUD (comme Deliver) : la séquence décrit CE QUI est appelé, pas
    // OÙ — un même Endpoints doit pouvoir tourner contre QA ou prod selon la
    // connexion choisie sur ce nœud.
    if (core === 'http_sequence') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Connection' });
      s.push({ nature: 'endpoints', chemin: 'sequenceId', label: 'Endpoints' });
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
    // En pratique toujours rendu via une façade dédiée (aws_s3.deliver) qui
    // connaît le vrai vocabulaire de sa plateforme — ce Core nu ne sert que
    // de repli si aucune façade n'est déclarée.
    if (core === 'deliver') {
      s.push({ nature: 'connexion', chemin: 'connexionId', label: 'Deliver to', filtreDirection: 'outbound' });
      s.push({ nature: 'manifeste', chemin: 'manifestId', label: 'Manifest' });
      s.push({ nature: 'texte', chemin: 'objectKey', label: 'Prefix (S3 folder)', placeholder: 'e.g. amazon/episode-42' });
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
      // POST /api/builder-engine/action/:slug (server/routes/builder-engine.js)
      // matche pour trouver quel BuilderFlow lancer — le nom du champ reste
      // `wfdSlug` par traçabilité avec WFD (dont il est repris), mais depuis le
      // 2026-08-05 c'est le moteur natif du Builder qui l'écoute, plus WFD (la
      // route WFD existe toujours mais concerne le Flow WFD d'origine, un
      // modèle distinct — jamais ce BuilderFlow-ci). Le matching accepte aussi
      // le `customActionId` brut ou l'id du BuilderFlow lui-même, mais le slug
      // reste la forme la plus lisible à coller dans Iconik. Concrètement :
      // Custom Action est prouvé de bout en bout (Iconik agit dessus
      // nativement). Les 11 autres types passeraient par la MÊME route si un
      // vrai webhook/évènement Iconik était configuré pour l'appeler — Iconik a
      // un vrai système de webhooks (vérifié en direct,
      // /API/notifications/v1/webhooks/, avec event_type/operation/realm/query)
      // mais aucun, dans cet environnement, n'est actif ni pointé vers cette
      // route aujourd'hui. Catalogue fidèle à l'intention, pas une promesse
      // que tout fonctionne déjà.
      case 'iconik.trigger':
        return [
          { nature: 'texteRepeint', chemin: 'wfdSlug', label: 'Slug (routing)', placeholder: 'e.g. publish' },
          // Chemin réel écouté par le moteur natif du Builder
          // (server/routes/builder-engine.js, POST /api/builder-engine/
          // action/:slug). Affiché en chemin nu (pas de domaine en dur dans ce
          // projet, même convention que l'ancien designer WFD qui n'affichait
          // déjà que le chemin) — mais COPIÉ en URL absolue (`calculeCopie`).
          // Domaine : APS_PUBLIC_URL (ConfigSources.publicUrl(), exposé via
          // /api/context) en priorité — window.location.origin en repli si le
          // réglage serveur est absent. Sans ça, ouvrir le canevas via
          // localhost en dev copierait une URL injoignable par Iconik.
          { nature: 'apercu', chemin: 'wfdEndpointApercu', label: 'Endpoint',
            calcule: function (m) { const s = m.lire('wfdSlug'); return s ? '/api/builder-engine/action/' + s : null; },
            calculeCopie: function (m) {
              const s = m.lire('wfdSlug');
              if (!s) return null;
              const src = (typeof window !== 'undefined') ? window.ConfigSources : null;
              const base = (src && src.publicUrl())
                || ((typeof window !== 'undefined' && window.location) ? window.location.origin : '');
              return base + '/api/builder-engine/action/' + s;
            } },
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

      // Remontée d'ancêtres : un seul nœud, remplace les 3-4 Fetch répétés par
      // branche du vieux WFD (Fetch Série / Fetch Saison / Fetch Saison Titre).
      // Lit TypeCollection/Univers/BayardID/title/ParentID déjà posés à plat
      // par le Search précédent — rien à choisir ici, la façade sait déjà où
      // regarder (même convention que le reste : les champs système/de l'org
      // sont exposés nus par aps_search, pas besoin de les redésigner).
      case 'iconik.resolve_ancestors':
        return [
          { nature: 'variable', chemin: 'varName', label: 'Store as', placeholder: '{ancestorPath}' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
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
          // `id` : requis par le moteur (aps_search(), wfd-engine-handlers.js)
          // pour que `parentBlock`/`returnBlock` puissent désigner CE bloc —
          // absent de l'ancien itemDefaut statique, donc jamais posé par le
          // Builder. Conséquence vérifiée : un bloc sans id ne correspond
          // jamais à un `returnBlock` (même sa propre valeur par défaut, 1),
          // donc toute recherche construite dans le Builder revenait vide en
          // silence. Auto-assigné à la position (1, 2…) — même convention que
          // les occurrences réelles (VOD Factory, blocks[].id: 1, 2). Éditable
          // si besoin de renuméroter, mais pré-rempli pour ne jamais partir
          // vide.
          { nature: 'liste', chemin: 'blocks', label: 'Blocks', ajoutLabel: 'Add block',
            itemDefaut: function (idx) { return { id: idx + 1, label: '', objectType: 'asset', parentBlock: null, criteria: [] }; },
            itemSchema: [
              { nature: 'nombre', chemin: 'id', label: 'Block ID', placeholder: '1' },
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
          // Mode : supporté par le moteur depuis le portage (iconikSearch(),
          // builder-handler-iconik-search.js:21 et :73) mais jamais offert au
          // panneau — donc inatteignable autrement qu'en éditant le document.
          // L'écart compte : en `retrieve`, une recherche qui ne ramène QU'UN
          // résultat expose toutes ses métadonnées à plat dans le contexte,
          // sous leur nom nu (`ContenuPrime`, `BayardID`…). C'est pratique
          // quand on veut ces valeurs, et nuisible quand on ne veut que
          // désigner un objet : les noms nus écrasent ceux déjà posés par une
          // lecture précédente (vérifié le 7 août — l'asset de test « Le Mag »
          // porte un `BayardID` résiduel qui remplacerait celui de sa
          // collection, donc l'`external_id` envoyé au partenaire).
          // `presence` ne pose que `.id`/`.title`/`.count` et aucune
          // métadonnée : c'est le mode à choisir quand la lecture des champs
          // est faite juste après par un Fetch scopé sur une vue.
          { nature: 'choix', chemin: 'mode', label: 'Mode', options: [
            { valeur: 'retrieve', libelle: 'Retrieve (exposes a single result’s metadata)' },
            { valeur: 'presence', libelle: 'Presence (existence only — exposes no metadata)' }
          ] },
          // Technique (withFormats) : ajouté le 4 août, manquait à l'audit du
          // 31 juillet/3 août. Le moteur (aps_search(), wfd-engine-handlers.js
          // ~4250) le supporte déjà — "une recherche qui ramène UN asset doit
          // pouvoir donner accès à sa durée, sa résolution ou son codec sans
          // qu'on rebranche un Fetch derrière juste pour ça" (commentaire du
          // moteur) — mais le panneau ne le posait pas, alors que l'occurrence
          // réelle "Video" (PUBLISH, resultVar `episodeVideo`) l'utilise
          // exactement ainsi, pour poser {duration}/{video_quality}/{width}/
          // {height}/… lus ensuite par "Video Action" (Publication API). Sans
          // ce champ, un Search reconstruit dans le Builder laisserait
          // {duration} silencieusement vide. Mêmes garde-fous que le moteur :
          // ignoré en mode Presence, et seulement pour des assets.
          { nature: 'booleen', chemin: 'withFormats', label: 'Also fetch technical metadata (duration, resolution, codec…) for a single asset result' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // Fetch : récupère un objet Iconik — asset, collection, ses métadonnées,
      // ou une saved search. Réécrit en profondeur après lecture du handler
      // réel (wfd-engine-handlers.js, fonction fetch()) : l'ancien schéma
      // (connexionId/target/fetchVar) ne correspondait à AUCUN des noms que
      // le handler lit. Les 5 occurrences réelles (VOD Factory, toutes en
      // sous-type `metadata`) utilisent fetchSubType/fetchSource/fetchTarget/
      // fetchValue/fetchMdViewId. Pas de connexionId, comme iconik.search :
      // cette façade s'appuie sur la connexion Iconik du flow (iconikClient),
      // jamais une connexion choisie.
      //
      // Doublons de nom réels retenus une seule fois (le premier lu par le
      // handler, via `a || b || c`) : `fetchVar` (pas `storeAs`), `fetchMdViewId`
      // (pas `metadataViewId`/`fetchMdView`). `requiredFields`/`withCollections`/
      // `viewFields`/`iconikEnv` : présents sur les 5 occurrences réelles mais
      // AUCUN n'est lu par fetch() (`withCollections` n'existe que dans
      // wfd-node-fetch.js, fichier mort — rien ne le `require`) — omis.
      //
      // `onError` EST lu ici (contrairement à `checker`) : fetch() lance de
      // vraies exceptions (asset non résolu, contexte manquant…) que
      // l'exécuteur générique attrape et route selon cfg.onError
      // (wfd-engine-executor.js:331) — pas la même situation que checker(),
      // qui avale ses propres erreurs avant que l'exécuteur les voie.
      case 'iconik.fetch':
        return [
          { nature: 'choix', chemin: 'fetchSubType', label: 'Fetch', reagit: true, options: [
            { valeur: 'metadata', libelle: 'Metadata (of an asset or collection)' },
            { valeur: 'asset', libelle: 'Asset' },
            { valeur: 'collection', libelle: 'Collection' },
            { valeur: 'savedsearch', libelle: 'Saved Search' }
          ] },

          // Saved Search — seul sous-type avec sa propre variable de sortie
          // (savedSearchVar) : le handler ne lit pas fetchVar/storeAs ici.
          { nature: 'texte', chemin: 'savedSearchId', label: 'Saved Search ID',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'savedsearch'; } },
          { nature: 'texte', chemin: 'savedSearchName', label: 'Saved Search name (fallback if ID not found here)',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'savedsearch'; } },
          { nature: 'nombre', chemin: 'savedSearchLimit', label: 'Limit', min: 1, placeholder: '100',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'savedsearch'; } },
          { nature: 'variable', chemin: 'savedSearchVar', label: 'Store as', placeholder: '{search_results}',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'savedsearch'; } },

          // Collection
          { nature: 'choix', chemin: 'fetchSource', label: 'Which collection', reagit: true,
            visibleSi: function (m) { return m.lire('fetchSubType') === 'collection'; },
            options: [
              { valeur: 'parent', libelle: 'Parent of the triggering object' },
              { valeur: 'id', libelle: 'By id' },
              { valeur: 'path', libelle: 'By path (title chain)' }
            ] },
          { nature: 'valeurTypee', chemin: 'fetchValue', label: 'Id or path', placeholder: '{collection.id} or Univers/Serie',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'collection' && ['id', 'path'].indexOf(m.lire('fetchSource')) >= 0; } },

          // Metadata — le seul sous-type prouvé sur les 5 occurrences réelles.
          // `fetchTarget` ne compte QUE si un id explicite est fourni ci-dessous
          // (sinon le type est déduit du contexte déclencheur) — sur les 5
          // occurrences réelles, fetchValue est toujours vide : fetchTarget y
          // est donc écrit mais sans effet, cas identique aux réglages morts
          // déjà trouvés ailleurs (op/method d'update_meta…), sauf qu'ici le
          // champ EST vivant dès qu'on remplit l'id explicite.
          { nature: 'choix', chemin: 'fetchSource', label: 'Object', reagit: true,
            visibleSi: function (m) { return m.lire('fetchSubType') === 'metadata'; },
            options: [
              { valeur: 'triggered', libelle: 'Triggering object' },
              { valeur: 'parent', libelle: 'Its parent (e.g. the Season of a triggering Episode)' }
            ] },
          { nature: 'choix', chemin: 'fetchTarget', label: 'Type (only if an explicit id is set below)',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'metadata'; },
            options: [
              { valeur: 'collection', libelle: 'Collection' },
              { valeur: 'asset', libelle: 'Asset' }
            ] },
          { nature: 'valeurTypee', chemin: 'fetchValue', label: 'Explicit object id (optional — overrides Object above)', placeholder: '{collectionData.parent_id}',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'metadata'; } },
          { nature: 'vueMetadonnee', chemin: 'fetchMdViewId', label: 'Metadata view (optional — raw metadata if empty)', reagit: true,
            visibleSi: function (m) { return m.lire('fetchSubType') === 'metadata'; } },
          { nature: 'liste', chemin: 'metadataFields', label: 'Only these fields (optional, empty = all)', ajoutLabel: 'Add field',
            itemDefaut: { name: '' },
            itemSchema: [
              { nature: 'metadonnee', chemin: 'name', label: 'Field', vuePour: function (m) { return m.lire('fetchMdViewId'); } }
            ],
            visibleSi: function (m) { return m.lire('fetchSubType') === 'metadata'; } },

          // Asset
          { nature: 'choix', chemin: 'fetchSource', label: 'Which asset', reagit: true,
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset'; },
            options: [
              { valeur: 'triggered', libelle: 'Triggering asset (or explicit id below)' },
              { valeur: 'title', libelle: 'Search by title' }
            ] },
          { nature: 'valeurTypee', chemin: 'fetchValue', label: 'Value', placeholder: '{asset.id} — or a title if searching by title',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset'; } },
          { nature: 'booleen', chemin: 'withMetadata', label: 'Also fetch metadata', reagit: true,
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset'; } },
          { nature: 'vueMetadonnee', chemin: 'fetchMdViewId', label: 'Metadata view (optional)',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset' && m.lire('withMetadata'); } },
          { nature: 'booleen', chemin: 'withKeyframes', label: 'Also fetch keyframes',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset'; } },
          { nature: 'booleen', chemin: 'withFormats', label: 'Also fetch technical metadata (formats)',
            visibleSi: function (m) { return m.lire('fetchSubType') === 'asset'; } },

          // Commun à tous les sous-types sauf Saved Search (qui a déjà le sien).
          { nature: 'variable', chemin: 'fetchVar', label: 'Store as', placeholder: '{fetched}',
            visibleSi: function (m) { return m.lire('fetchSubType') !== 'savedsearch'; } },

          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
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
      //
      // Statut + aperçu de ligne repris de WFD (wfd-config-panel.js) le 3 août,
      // suite à un retour utilisateur : rationaliser le catalogue ne veut pas
      // dire perdre des facilités concrètes de l'ancien outil. `whStatut`
      // reste un simple champ texte côté moteur (r(cfg.whStatut...), ligne
      // 3243) — seul le panneau propose des préréglages + une échappatoire,
      // aucun nouveau champ de modèle. L'aperçu est un gabarit STATIQUE (date
      // réelle, mais "utilisateur"/"workflow"/"run-abc123" en substituts) —
      // pas une résolution contre de vraies données, qui demanderait le
      // sélecteur de variables (jamais construit, builder-etat.md).
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
          // Réel : ces 4 cases sont VRAIES par défaut côté moteur (!== false) —
          // un nœud neuf, cases décochées ici, affiche donc moins que le
          // comportement par défaut du moteur tant qu'on ne les coche pas.
          // Signalé, pas corrigé (pas d'infrastructure de valeurs par défaut
          // à la création). `reagit` : chacune pilote l'aperçu plus bas.
          { nature: 'booleen', chemin: 'whShowDate', label: 'Show date', reagit: true },
          { nature: 'booleen', chemin: 'whShowRunId', label: 'Show run id', reagit: true },
          { nature: 'booleen', chemin: 'whShowWf', label: 'Show workflow name', reagit: true },
          { nature: 'texteRepeint', chemin: 'whWfName', label: 'Workflow name (override)', placeholder: 'defaults to the flow name' },
          { nature: 'booleen', chemin: 'whShowUser', label: 'Show triggering user', reagit: true },
          { nature: 'choixOuTexte', chemin: 'whStatut', label: 'Status badge', placeholder: '{variable} or free text',
            customLibelle: '✏️ Custom…', options: [
              { valeur: '🔄 En cours', libelle: '🔄 En cours' },
              { valeur: '✅ Succès', libelle: '✅ Succès' },
              { valeur: '⚠️ Incomplet', libelle: '⚠️ Incomplet' },
              { valeur: '❌ Échec', libelle: '❌ Échec' },
              { valeur: '', libelle: '— None —' }
            ] },
          { nature: 'texteRepeint', chemin: 'whMessage', label: 'Message', placeholder: 'e.g. Delivered · {now(Europe/Paris)}' },
          // Manifeste (4 août) : liste d'essences ✅/❌ ajoutée automatiquement
          // à la fin de la ligne, filtrée par niveau (appliesTo/TypeCollection,
          // même mécanisme que Deliver/Verify) — remplace ce qui était tapé à
          // la main dans `whMessage` sur les 8 occurrences réelles
          // (Histo Succès/Échec × Série/Saison/Episode/Unitaire), ex.
          // "{s3_cover_url?Cover ✅|Cover ❌} {s3_poster_url?Poster ✅|Poster ❌}…" —
          // le moteur supporte déjà ce conditionnel ({var?oui|non}, générique,
          // wfd-engine-context.js), seule la liste d'essences était dupliquée.
          // Optionnel : sans manifeste choisi, comportement inchangé.
          { nature: 'manifeste', chemin: 'manifestId', label: 'Manifest (optional — appends a ✅/❌ essence checklist)' },
          { nature: 'variable', chemin: 'whSummaryVar', label: 'Auto-summarize', placeholder: '{path.to.results}',
            aide: 'Ex. {vfStatus.body.results.amazon.actions} → liste les sous-clés dont le statut n\'est pas complete/ready/sent/success. Résolu seulement à l\'exécution, absent de l\'aperçu ci-dessous.' },
          { nature: 'apercu', chemin: 'whApercuLigne', label: 'Aperçu de la ligne', calcule: function (m) {
            const parts = [];
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10) + '_' + now.toTimeString().slice(0, 5);
            if (m.lire('whShowDate') !== false) parts.push(dateStr);
            if (m.lire('whShowRunId') === true) parts.push('run-abc123');
            if (m.lire('whShowWf') !== false) parts.push((m.lire('whWfName') || '').trim() || 'workflow');
            if (m.lire('whShowUser') !== false) parts.push('utilisateur');
            const statut = m.lire('whStatut') || '';
            if (statut) parts.push(statut);
            const message = m.lire('whMessage') || '';
            if (message) parts.push(message);
            return parts.join(' | ') || '(aperçu vide)';
          } },
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

      // Create Tree : crée une arborescence de collections depuis un gabarit
      // (ressource — branchée cette session, cf. config-sources.js/arboTemplates
      // et la nature 'gabarit'). Transcrit fidèlement les 4 occurrences réelles
      // et le handler (wfd-engine-handlers.js, create_tree()) : l'ancien schéma
      // (connexionId/root/template) ne correspondait à AUCUN des noms lus.
      // Pas de connexionId — comme iconik.search/fetch, cette façade s'appuie
      // sur la connexion Iconik du flow. `resultVar`, présent sur les 4
      // occurrences réelles, n'est PAS lu par le handler (seul `storeAs` l'est)
      // — omis, même règle que fetchVar/storeAs côté Fetch mais inversée ici.
      // Services registry/counter (aps.registry pour idFieldName, aps.counter
      // pour orderFieldName) déductibles des champs remplis, non exposés
      // séparément — cf. FACADES['iconik.create_tree'].services.
      //
      // RISQUE SIGNALÉ (pas silencieux, non corrigé) : `metadataViewId` est de
      // fait une porte, pas un simple choix de vue — si vide, le handler
      // n'écrit AUCUN champ (ni idFieldName/parentFieldName/typeFieldName, ni
      // extraFields, ni le numéro d'ordre), même quand tout le reste est
      // renseigné (`if (viewId && Object.keys(fields).length) { … }`). Les 4
      // occurrences réelles renseignent toutes une vue — chemin vide jamais
      // éprouvé.
      case 'iconik.create_tree':
        return [
          { nature: 'gabarit', chemin: 'templateId', label: 'Tree template' },
          { nature: 'valeurTypee', chemin: 'parentId', label: 'Under collection', placeholder: '{collection.id}' },
          { nature: 'vueMetadonnee', chemin: 'metadataViewId', label: 'Metadata view (required to write any field — see note above)', reagit: true },
          { nature: 'liste', chemin: 'extraFields', label: 'Extra fields (applied to every collection created)', ajoutLabel: 'Add field',
            itemDefaut: { key: '', value: '' },
            itemSchema: [
              { nature: 'metadonnee', chemin: 'key', label: 'Field', vuePour: function (m) { return m.lire('metadataViewId'); } },
              { nature: 'valeurTypee', chemin: 'value', label: 'Value', placeholder: '{serieMetadata.Univers}' }
            ]
          },
          { nature: 'texte', chemin: 'idFieldName', label: 'Generated id field', placeholder: 'BayardID' },
          { nature: 'texte', chemin: 'parentFieldName', label: 'Parent id field', placeholder: 'ParentID' },
          { nature: 'texte', chemin: 'typeFieldName', label: 'Collection type field', placeholder: 'TypeCollection' },
          // Même liste que le nœud Générateur d'ID : les deux écrivent dans le
          // MÊME champ Iconik et alimentent le MÊME registre — ils ne peuvent
          // pas produire des formats différents (constaté le 2026-08-06 :
          // Créer produisait 8 chiffres, PUBLISH un horodatage).
          { nature: 'choix', chemin: 'idType', label: 'Generated id type', reagit: true, options: [
            { valeur: 'numeric', libelle: 'Numeric' },
            { valeur: 'timestamp', libelle: 'Timestamp-based (lisible)' },
            { valeur: 'timestamp_numeric', libelle: 'Timestamp-based (entier, 14 chiffres)' },
            { valeur: 'uuid', libelle: 'UUID v4' },
            { valeur: 'hex', libelle: 'Hex' },
            { valeur: 'alphanumeric', libelle: 'Alphanumeric' }
          ] },
          { nature: 'nombre', chemin: 'idLength', label: 'Generated id length', min: 1, placeholder: '8',
            visibleSi: function (m) { return ['uuid', 'timestamp', 'timestamp_numeric'].indexOf(m.lire('idType')) === -1; } },
          { nature: 'valeurTypee', chemin: 'parentBayardId', label: 'Parent generated id (seed from a previous run, e.g. the Série when creating a Saison)', placeholder: '{serieMetadata.BayardID}' },
          { nature: 'texte', chemin: 'orderFieldName', label: 'Order number field (optional)', placeholder: 'e.g. NumeroSaison' },
          { nature: 'nombre', chemin: 'orderPad', label: 'Order number padding', min: 0, placeholder: '2' },
          { nature: 'valeurTypee', chemin: 'orderSeed', label: 'Order number seed', placeholder: '{search_results.count}' },
          { nature: 'variable', chemin: 'storeAs', label: 'Store result as', placeholder: '{arbo}' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // S3 : réécrit en profondeur le 3 août après audit réel (les 6
      // occurrences réelles utilisent TOUTES `operation: "list_objects"`,
      // jamais un "deliver" au sens d'un envoi — le nom de la façade est
      // trompeur. Ce que fait réellement ce nœud (wfd-engine-handlers.js,
      // aws_s3(), branche list_objects) : lister un dossier S3 où l'Export
      // Location Iconik a déjà déposé les fichiers (cf. principe "APS ne
      // transfère jamais d'octets", CLAUDE.md), et exposer les URLs par type
      // (vidéo/image/sous-titre) via `s3Mappings` — la vraie "livraison" est
      // `iconik.action` / `export_location_trigger` (façade Action), en
      // amont ; ceci n'est que la vérification après coup.
      //
      // `manifestId` reste la bonne idée du 31 juillet, juste mal câblée à
      // l'époque : `s3Mappings[].{type,filter,variable}` a EXACTEMENT la
      // forme d'une essence de Manifeste (`role`/`reconnu_par`/`sortie`).
      // La résolution `manifestId` -> `s3Mappings` se fait à la conversion
      // pivot -> WFD (pivot-to-wfd.js, même mécanisme que `mappingId` ->
      // `lkRows`), jamais recopiée ici.
      //
      // Vestiges MORTS omis (présents sur les 6 occurrences réelles, jamais
      // lus par list_objects — reliquats de l'ancienne opération
      // `artwork_s3`, remplacée par une détection automatique par nom de
      // fichier, cf. commentaire du moteur "plus besoin d'intercepter les
      // subjobs Iconik") : `jobId`, `artworks[]`, `mdViewId`, `titreVar`,
      // `nommageId`. `s3VarVideo`/`s3VarImage`/`s3VarSrt` omis pareillement :
      // ne comptent que si `s3Mappings` est vide, ce qui n'arrive jamais en
      // réel (toujours rempli, identique sur les 6 occurrences).
      case 'aws_s3.deliver':
        return [
          { nature: 'connexion', chemin: 'connexionId', label: 'S3 connection', filtreType: 'aws_s3' },
          { nature: 'choix', chemin: 'operation', label: 'Operation', reagit: true, options: [
            { valeur: 'list_objects', libelle: 'List objects (verify delivery, expose typed URLs)' },
            { valeur: 'head_object', libelle: 'Head object (check existence)' },
            { valeur: 'get_object', libelle: 'Get object' },
            { valeur: 'put_object', libelle: 'Put object' },
            { valeur: 'delete_object', libelle: 'Delete object' }
          ] },
          { nature: 'valeurTypee', chemin: 'objectKey', label: 'Prefix to search (folder)', placeholder: 'AmazonPrime/{slug(collectionCheck.title)}/{filebase(item.title)}',
            visibleSi: function (m) { return (m.lire('operation') || 'list_objects') === 'list_objects'; } },
          { nature: 'valeurTypee', chemin: 'objectKey', label: 'Object key', placeholder: 'AmazonPrime/{slug(collectionCheck.title)}/{filebase(item.title)}',
            visibleSi: function (m) { return (m.lire('operation') || 'list_objects') !== 'list_objects'; } },
          { nature: 'manifeste', chemin: 'manifestId', label: 'Manifest (expected files, by type)',
            visibleSi: function (m) { return (m.lire('operation') || 'list_objects') === 'list_objects'; } },
          { nature: 'variable', chemin: 'resultVar', label: 'Store result as', placeholder: '{awsResult}' },
          { nature: 'choix', chemin: 'onError', label: 'On error', options: [
            { valeur: 'stop', libelle: 'Stop' },
            { valeur: 'continue_log', libelle: 'Continue (log)' },
            { valeur: 'continue', libelle: 'Continue (silent)' }
          ] }
        ];

      // Registre d'ID (service, cf. FACADES['aps.registry'].isService) : génère
      // un identifiant et, pour le type numérique, garantit son unicité via
      // BayardRegistry. Transcrit depuis l'unique occurrence réelle et le
      // handler (wfd-engine-handlers.js, id_generator()).
      //
      // `onError` retiré : présent sur l'occurrence réelle mais id_generator()
      // ne lève JAMAIS d'exception (aucun `throw` dans toute la fonction) —
      // le champ n'atteint donc jamais le catch générique de l'exécuteur,
      // même règle que `checker`.
      //
      // `apiActions` (appels HTTP après génération) omis, pas juste laissé de
      // côté : le mécanisme lit `conn.actions` sur la Connexion trouvée
      // (wfd-engine-handlers.js:325 et la même construction en :2664 pour
      // `_handleHttpAction`) — un sous-objet qui n'existe NULLE PART dans le
      // modèle `Connexion` (prisma/schema.prisma). Toute entrée non vide fait
      // donc toujours échouer le nœud (`apiErrors` non vide -> `{ port: 1 }`),
      // même quand l'ID a été généré et stocké avec succès juste avant. Vide
      // sur l'unique occurrence réelle — mécanisme mort, jamais éprouvé,
      // distinct de la façade `iconik.action` (celle-ci fonctionne, vérifiée
      // 6/6 sur `export_location_trigger`).
      //
      // `outputType` : 'integer' n'a de sens que pour idType `numeric` — pour
      // tout autre type (hex/alphanumeric/uuid/timestamp), `parseInt(id, 10)`
      // tronque silencieusement à la première suite de chiffres décimaux
      // (ex. hex "3F2A" -> 3). Plutôt que de le signaler seulement en
      // commentaire, l'option 'Integer' est filtrée hors de la liste quand
      // idType n'est pas 'numeric' — le risque n'est pas juste documenté, il
      // est rendu impossible à choisir.
      case 'aps.registry':
        return [
          // Portabilité vérifiée dans id_generator() (wfd-engine-handlers.js) :
          // les six formules sont du pur calcul local (aucune n'appelle
          // Iconik), mais SEULE `numeric` déclenche ensuite la garantie
          // d'unicité via BayardRegistry (table Prisma d'APS) — c'est cette
          // étape-là, pas la formule, qui est APS uniquement. Les cinq autres
          // n'ont aucune garantie d'unicité (juste une collision improbable
          // vu la longueur/l'aléatoire), mais aucune dépendance APS non plus
          // : n'importe quel moteur sachant faire `now()` + aléatoire les
          // reproduit à l'identique.
          // Notes de portabilité revues le 2026-08-06 : le registre
          // BayardRegistry s'applique désormais à TOUS les types, plus au seul
          // mode numérique. Ce n'est pas une entrave — c'est une table de
          // correspondance Iconik↔APS exportable (décision du 29 juillet :
          // « calcul lisible MAIS relation stockée »). Ce qui distingue
          // réellement les types, c'est donc si le FORMAT est reproductible
          // ailleurs, pas s'il touche à la base.
          { nature: 'choix', chemin: 'idType', label: 'Type', reagit: true, options: [
            { valeur: 'numeric', libelle: 'Numeric',
              portabilite: '⚠ Format non reproductible ailleurs — tirage purement aléatoire, rien à recalculer depuis les données. Unicité et réutilisation garanties par BayardRegistry.' },
            { valeur: 'alphanumeric', libelle: 'Alphanumeric',
              portabilite: '⚠ Format non reproductible ailleurs (tirage aléatoire). Unicité et réutilisation garanties par BayardRegistry.' },
            { valeur: 'hex', libelle: 'Hex',
              portabilite: '⚠ Format non reproductible ailleurs (tirage aléatoire). Unicité et réutilisation garanties par BayardRegistry.' },
            { valeur: 'prefixed', libelle: 'Prefixed alphanumeric',
              portabilite: '⚠ Format non reproductible ailleurs (tirage aléatoire). Unicité et réutilisation garanties par BayardRegistry.' },
            { valeur: 'uuid', libelle: 'UUID v4',
              portabilite: '✅ Format standard, calculable par n\'importe quel moteur. Unicité et réutilisation garanties par BayardRegistry.' },
            { valeur: 'timestamp', libelle: 'Timestamp-based (lisible)',
              portabilite: '✅ Format calculable partout (horodatage + aléatoire), lisible à l\'œil. Unicité et réutilisation garanties par BayardRegistry, table exportable vers un autre orchestrateur. ⚠ Contient des tirets et de l\'hexadécimal : incompatible avec un champ Iconik de type entier.' },
            { valeur: 'timestamp_numeric', libelle: 'Timestamp-based (entier, 14 chiffres)',
              portabilite: '✅ Format calculable partout — AAMMJJhhmmss + 2 chiffres d\'aléa. Le seul horodatage acceptable par un champ Iconik de type entier (prévoir max_value ≥ 99999999999999). Unicité et réutilisation garanties par BayardRegistry.' }
          ] },
          { nature: 'texte', chemin: 'idPrefix', label: 'Prefix', placeholder: 'e.g. BAY-',
            visibleSi: function (m) { return m.lire('idType') === 'prefixed'; } },
          { nature: 'nombre', chemin: 'idLength', label: 'Length', min: 1, placeholder: '8',
            visibleSi: function (m) { return ['uuid', 'timestamp', 'timestamp_numeric'].indexOf(m.lire('idType')) === -1; } },
          { nature: 'variable', chemin: 'varName', label: 'Store as', placeholder: '{generated_id}' },
          { nature: 'choix', chemin: 'outputType', label: 'Output as',
            options: function (model) {
              const opts = [{ valeur: 'string', libelle: 'String' }];
              if (['numeric', 'timestamp_numeric'].indexOf(model.lire('idType')) !== -1) {
                opts.push({ valeur: 'integer', libelle: 'Integer' });
              }
              return opts;
            } }
        ];

      default:
        return null;   // pas de schéma façade dédié -> on retombe sur le core
    }
  }

  return { pour };

})();

if (typeof window !== 'undefined') window.ConfigSchema = ConfigSchema;
if (typeof module !== 'undefined') module.exports = ConfigSchema;
