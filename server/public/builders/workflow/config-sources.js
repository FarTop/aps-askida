/**
 * config-sources.js — Accès aux ressources d'Administration pour le panneau
 *
 * Les natures qui consomment Administration (connexion, ressource, métadonnée…)
 * passent par ici. Un seul point d'accès, avec CACHE : on ne veut pas une
 * requête par champ. Le panneau Config se branche ainsi sur les données
 * réelles (le paradigme : le Builder consomme Administration comme source).
 *
 * Aujourd'hui : les connexions (GET /api/connexions), les manifestes
 * (GET /api/manifests) et les métadonnées Iconik — champs (metadonnees) et
 * vues (vuesMetadonnees). On n'expose JAMAIS le secret déchiffré (authValue)
 * au sélecteur — seulement id/name/type/direction.
 *
 * Métadonnées et vues : EN DIRECT via la Connexion (iconik-proxy avec
 * X-Force-Live), PAS via les tables de sync (Ikon*, snapshot). Ces tables sont
 * peuplées par le bouton "Domaine → Site" de l'écran Settings — une
 * plomberie construite pour l'ancien Designer WFD, vouée à disparaître avec
 * lui. Le Builder ne doit pas en dépendre pour fonctionner : il lit la
 * plateforme directement, comme n'importe quel autre appelant du proxy, avec
 * juste un cache court en mémoire (ci-dessous) pour ne pas retaper l'API à
 * chaque frappe. Conséquence concrète, vérifiée : une vue créée dans Iconik
 * après le dernier sync ("VUE | UNITAIRE | COLLECTION", absente du snapshot
 * du 28/06) apparaît immédiatement en direct.
 */

const ConfigSources = (() => {

  let cacheConnexions   = null;   // promesse mémorisée (une seule requête)
  let cacheManifests    = null;
  let cacheArboTemplates = null;
  let cacheMappings     = null;
  let cacheEndpoints    = null;
  // Les métadonnées sont scopées par environnement (contrairement aux
  // connexions/manifestes, ressources d'org) : cache PAR envSlug.
  const cacheMetadonnees     = Object.create(null);   // envSlug -> promesse
  const metadonneesResolues  = Object.create(null);   // envSlug -> tableau déjà résolu (lecture synchrone)
  const cacheVues            = Object.create(null);   // envSlug -> promesse [{id,nom,champs}]
  const vuesResolues         = Object.create(null);   // envSlug -> tableau déjà résolu (lecture synchrone)

  // ── Fraîcheur ────────────────────────────────────────────────────────────
  // Horodatage du dernier appel Iconik RÉELLEMENT abouti (pas du vidage de
  // cache lui-même — sinon l'affichage retomberait à vide entre le clic sur
  // Refresh et la fin du rechargement). Le canvas s'abonne pour afficher le
  // champ "snapshot" de l'en-tête.
  let dernierRafraichissement = null;
  const abonnesFraicheur = [];
  function _marquerFrais() {
    dernierRafraichissement = new Date();
    abonnesFraicheur.slice().forEach(function (fn) { fn(dernierRafraichissement); });
  }
  function onRafraichi(fn) {
    abonnesFraicheur.push(fn);
    return function () {
      const i = abonnesFraicheur.indexOf(fn);
      if (i >= 0) abonnesFraicheur.splice(i, 1);
    };
  }

  function connexions() {
    if (cacheConnexions) return cacheConnexions;
    cacheConnexions = fetch('/api/connexions')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        // On ne garde que ce qu'un sélecteur doit montrer — jamais le secret.
        return (Array.isArray(list) ? list : []).map(function (c) {
          return { id: c.id, name: c.name, type: c.type,
                   direction: c.direction, endpoint: c.endpoint, isActive: c.isActive };
        });
      })
      .catch(function () { return []; });
    return cacheConnexions;
  }

  // Manifestes de livraison (ressource d'org) : pour la nature 'manifeste' du
  // nœud Deliver. On expose l'identité + le niveau + le nombre d'essences.
  function manifests() {
    if (cacheManifests) return cacheManifests;
    cacheManifests = fetch('/api/manifests')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        return (Array.isArray(list) ? list : []).map(function (m) {
          return { id: m.id, name: m.name, niveau: m.niveau,
                   nbEssences: Array.isArray(m.essences) ? m.essences.length : 0 };
        });
      })
      .catch(function () { return []; });
    return cacheManifests;
  }

  // Modèles d'arborescence (ressource d'org) : pour la nature 'gabarit' du
  // nœud Create Tree (templateId). GET /api/arbo-templates ne renvoie que la
  // liste légère (id/name/description) — le détail (config, la structure de
  // niveaux) reste chargé à part si un jour un aperçu est nécessaire ; le
  // sélecteur n'a besoin que de l'identité.
  function arboTemplates() {
    if (cacheArboTemplates) return cacheArboTemplates;
    cacheArboTemplates = fetch('/api/arbo-templates')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        return (Array.isArray(list) ? list : []).map(function (t) {
          return { id: t.id, name: t.name, description: t.description };
        });
      })
      .catch(function () { return []; });
    return cacheArboTemplates;
  }

  // Tables de correspondance (ressource d'org) : pour la nature 'mapping' du
  // nœud Lookup (mappingId) — remplace le lkRows jusqu'ici recopié dans
  // chaque nœud. GET /api/mappings expose la clé `rows` (alias de la colonne
  // Prisma `rules`, cf. server/routes/mapping.js — contrat déjà posé par
  // l'écran admin/ressources, antérieur à cette route). Le détail complet
  // (les rows elles-mêmes) est déjà dans cette liste — pas de second appel :
  // même choix que manifests()/exportLocations, pas que arboTemplates().
  function mappings() {
    if (cacheMappings) return cacheMappings;
    cacheMappings = fetch('/api/mappings')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        return (Array.isArray(list) ? list : []).map(function (m) {
          return { id: m.id, name: m.name,
                   nbEntrees: Array.isArray(m.rows) ? m.rows.length : 0 };
        });
      })
      .catch(function () { return []; });
    return cacheMappings;
  }

  // Séquences HTTP nommées (ressource d'org) : pour la nature 'endpoints' du
  // nœud http_sequence / façade vodfactory.partner (sequenceId) — remplace le
  // tableau `steps` jusqu'ici recopié dans chaque nœud. GET /api/endpoints
  // expose `steps` en clair (server/routes/endpoints.js) — même choix que
  // mappings()/manifests() : le détail complet est déjà dans cette liste, pas
  // de second appel.
  function endpoints() {
    if (cacheEndpoints) return cacheEndpoints;
    cacheEndpoints = fetch('/api/endpoints')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        return (Array.isArray(list) ? list : []).map(function (e) {
          return { id: e.id, name: e.name,
                   nbSteps: Array.isArray(e.steps) ? e.steps.length : 0 };
        });
      })
      .catch(function () { return []; });
    return cacheEndpoints;
  }

  // ── Iconik en direct ───────────────────────────────────────────────────
  // Vocabulaire field_type -> uiType : transcrit depuis mapFieldTypeToUI de
  // server/routes/sync-engine.js (connaissance recopiée, PAS un require —
  // aucune dépendance de code vers la chaîne de sync). Table stable côté
  // Iconik, pas une intelligence propre à ce fichier.
  const TYPE_UI = {
    string: 'Text',
    text: 'Text Area', textarea: 'Text Area', multiline: 'Text Area',
    integer: 'Integer', int: 'Integer', long: 'Integer',
    float: 'Float', double: 'Float', number: 'Float', decimal: 'Float',
    boolean: 'Yes/No', bool: 'Yes/No',
    date: 'Date',
    datetime: 'Datetime', timestamp: 'Datetime', datetimeutc: 'Datetime',
    dropdown: 'Dropdown', select: 'Dropdown', choice: 'Dropdown', choices: 'Dropdown',
    enum: 'Dropdown', picklist: 'Dropdown', single_select: 'Dropdown',
    'single-select': 'Dropdown', list: 'Dropdown',
    tag: 'Tag Cloud', tags: 'Tag Cloud', tag_cloud: 'Tag Cloud', tagcloud: 'Tag Cloud',
    labels: 'Tag Cloud', label: 'Tag Cloud',
    email: 'Email', mail: 'Email',
    url: 'Url', link: 'Url', uri: 'Url'
  };
  function _typeUi(fieldType, options) {
    const t = TYPE_UI[String(fieldType || '').toLowerCase()] || '';
    if (!t && Array.isArray(options) && options.length) return 'Dropdown';
    return t;
  }
  function _valeursOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map(function (o) { return typeof o === 'string' ? o : ((o && (o.label || o.value)) || ''); })
      .filter(Boolean);
  }

  function _iconikGet(envSlug, chemin) {
    return fetch('/api/iconik/' + encodeURIComponent(envSlug) + chemin, { headers: { 'X-Force-Live': '1' } })
      .then(function (r) { return r.ok ? r.json() : { objects: [] }; })
      .catch(function () { return { objects: [] }; });
  }

  // Champs SYSTÈME Iconik — propriétés natives de l'objet, pas des métadonnées
  // custom : /API/metadata/v1/fields/ ne les renvoie donc jamais, alors que le
  // moteur les reconnaît très bien (aps_search(), wfd-engine-handlers.js,
  // `SYSTEM_FIELDS`). Repéré en testant : le champ "Field" d'un critère de
  // recherche ne suggérait jamais `id`, alors qu'il est le critère le plus
  // courant pour identifier l'objet déclencheur (`id equals {collection.id}`).
  // Liste tenue en miroir de celle du moteur — la recopier ici est un choix
  // délibéré (fichier navigateur, ne peut pas `require` le fichier serveur).
  const CHAMPS_SYSTEME = [
    { name: 'id',             label: 'id (system)' },
    { name: 'title',          label: 'title (system)' },
    { name: 'media_type',     label: 'media_type (system)' },
    { name: 'date_created',   label: 'date_created (system)' },
    { name: 'date_modified',  label: 'date_modified (system)' },
    { name: 'object_type',    label: 'object_type (system)' },
    { name: 'status',         label: 'status (system)' },
    { name: 'archive_status', label: 'archive_status (system)' },
    { name: 'external_id',    label: 'external_id (system)' }
  ];

  // Champs Iconik réels de l'environnement (nom, libellé, type, options pour
  // les champs à liste). En direct — voir note de fraîcheur en tête de
  // fichier. Pas d'envSlug (aucun environnement choisi sur le flow) -> liste
  // vide, fail-safe, pas d'erreur. Champs système préfixés — toujours
  // disponibles, indépendants de l'org/environnement.
  function metadonnees(envSlug) {
    if (!envSlug) return Promise.resolve(CHAMPS_SYSTEME.slice());
    if (cacheMetadonnees[envSlug]) return cacheMetadonnees[envSlug];
    cacheMetadonnees[envSlug] = _iconikGet(envSlug, '/API/metadata/v1/fields/').then(function (d) {
      const custom = (Array.isArray(d.objects) ? d.objects : []).map(function (f) {
        return {
          name:      f.name,
          label:     f.label || f.name,
          uiType:    _typeUi(f.field_type, f.options),
          fieldType: f.field_type || '',
          valeurs:   _valeursOptions(f.options)
        };
      });
      const list = CHAMPS_SYSTEME.concat(custom);
      metadonneesResolues[envSlug] = list;
      _marquerFrais();
      return list;
    });
    return cacheMetadonnees[envSlug];
  }

  // Lecture SYNCHRONE du cache déjà résolu (pour les natures qui doivent
  // décider d'un rendu — options d'opérateur, type de contrôle — sans pouvoir
  // attendre une promesse). Les champs système sont rendus tout de suite (pas
  // besoin d'attendre l'API) ; les champs custom arrivent à la peinture
  // suivante, une fois la promesse résolue.
  function metadonneesChargees(envSlug) {
    if (!envSlug) return [];
    if (metadonneesResolues[envSlug]) return metadonneesResolues[envSlug];
    metadonnees(envSlug);   // déclenche le chargement, sans bloquer
    return CHAMPS_SYSTEME.slice();
  }

  // Vues de métadonnées de l'environnement — TOUTES, sans filtre par type
  // d'objet. Un filtre par catégorie a été essayé puis abandonné : le lien
  // vue<->catégorie<->type est facultatif côté Iconik (une vue peut exister,
  // être valide, et n'appartenir à aucune catégorie — vérifié en direct sur
  // un cas réel, "VUE | UNITAIRE | COLLECTION", non rattachée à aucune
  // catégorie sur aucun des 4 types d'objet). Filtrer dessus aurait caché des
  // vues bien réelles. Mieux vaut une liste complète qu'une liste incomplète
  // qui semble correcte.
  // `champs` : les vrais champs QUE CETTE VUE gère (view_fields), débarrassés
  // des séparateurs visuels (__separator__, un simple titre de section dans
  // l'éditeur Iconik, jamais un champ écrivable). Signal fiable, vérifié en
  // direct (GET .../assets/{id}/views/{vueId}/ ne renvoie QUE les champs de
  // la vue) — contrairement au lien vue<->type d'objet (facultatif, abandonné
  // ci-dessus), le lien vue<->ses propres champs est réel et exploitable.
  function vuesMetadonnees(envSlug) {
    if (!envSlug) return Promise.resolve([]);
    if (cacheVues[envSlug]) return cacheVues[envSlug];
    cacheVues[envSlug] = _iconikGet(envSlug, '/API/metadata/v1/views/').then(function (d) {
      const list = (Array.isArray(d.objects) ? d.objects : [])
        .filter(function (v) { return v.id; })
        .map(function (v) {
          const champs = (Array.isArray(v.view_fields) ? v.view_fields : [])
            .map(function (c) { return c && c.name; })
            .filter(function (n) { return n && n.indexOf('__') !== 0; });
          return { id: v.id, nom: v.name, champs: champs };
        })
        .sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
      vuesResolues[envSlug] = list;
      _marquerFrais();
      return list;
    });
    return cacheVues[envSlug];
  }

  // Champs d'une vue précise, lecture SYNCHRONE (même logique que
  // metadonneesChargees) — tableau vide si pas encore chargé ou vue inconnue,
  // jamais bloquant, déclenche le chargement en tâche de fond.
  function champsDeVue(envSlug, viewId) {
    if (!envSlug || !viewId) return [];
    if (!vuesResolues[envSlug]) { vuesMetadonnees(envSlug); return []; }
    const v = vuesResolues[envSlug].find(function (x) { return x.id === viewId; });
    return (v && v.champs) || [];
  }

  // Export Locations réelles de l'environnement — la cible du nœud `action`
  // en mode export_location_trigger (endpoint vérifié en direct,
  // /API/files/v1/export_locations/ ; l'id réel "PRIME" correspond
  // exactement au `target` des 6 occurrences réelles de VOD Factory).
  const cacheExportLocations = Object.create(null);   // envSlug -> promesse
  function exportLocations(envSlug) {
    if (!envSlug) return Promise.resolve([]);
    if (cacheExportLocations[envSlug]) return cacheExportLocations[envSlug];
    cacheExportLocations[envSlug] = _iconikGet(envSlug, '/API/files/v1/export_locations/').then(function (d) {
      const list = (Array.isArray(d.objects) ? d.objects : [])
        .filter(function (e) { return e.id; })
        .map(function (e) { return { id: e.id, nom: e.name || e.id }; })
        .sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
      _marquerFrais();
      return list;
    });
    return cacheExportLocations[envSlug];
  }

  // Custom Actions réelles de l'environnement — la cible du trigger
  // `iconik.trigger` en mode custom_action (endpoint vérifié en direct,
  // /API/assets/v1/custom_actions/). `context` (ASSET/COLLECTION/SEGMENT) est
  // porté par l'action elle-même côté Iconik — exposé pour que le champ
  // `context` du trigger se déduise automatiquement du choix, comme le fait
  // déjà l'ancien designer WFD (wfd-config-panel.js, auto-remplissage depuis
  // l'action choisie).
  const cacheCustomActions = Object.create(null);   // envSlug -> promesse
  function customActions(envSlug) {
    if (!envSlug) return Promise.resolve([]);
    if (cacheCustomActions[envSlug]) return cacheCustomActions[envSlug];
    cacheCustomActions[envSlug] = _iconikGet(envSlug, '/API/assets/v1/custom_actions/').then(function (d) {
      const list = (Array.isArray(d.objects) ? d.objects : [])
        .filter(function (a) { return a.id; })
        .map(function (a) { return { id: a.id, nom: a.title || a.id, context: a.context || '', disabled: !!a.disabled }; })
        .sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom)); });
      _marquerFrais();
      return list;
    });
    return cacheCustomActions[envSlug];
  }

  // Domaine public fixe (APS_PUBLIC_URL, exposé via /api/context), pour
  // reconstruire une URL absolue CORRECTE même quand le canevas est ouvert
  // via localhost (dev) — sinon window.location.origin donnerait une URL
  // injoignable par Iconik. Chargé tout de suite (pas à la demande) : le
  // panneau Config d'un Trigger doit pouvoir l'afficher dès son ouverture,
  // sans dépendre d'un premier appel à une autre ressource. Lecture
  // SYNCHRONE (publicUrl()) — null tant que non résolu, l'appelant retombe
  // alors sur window.location.origin (cf. config-schema.js).
  let publicUrlResolu = null;
  (function () {
    fetch('/api/context').then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (ctx) { publicUrlResolu = ctx.publicUrl || null; })
      .catch(function () { /* repli sur window.location.origin, silencieux */ });
  })();

  // Invalide le cache (après création/édition en Administration, ou clic sur
  // Refresh dans le canvas). Ne touche PAS dernierRafraichissement : l'ancien
  // horodatage reste affiché jusqu'à ce qu'un nouvel appel aboutisse
  // réellement, pour ne pas faire clignoter l'affichage sur "—".
  function rafraichir() {
    cacheConnexions = null; cacheManifests = null; cacheArboTemplates = null; cacheMappings = null; cacheEndpoints = null;
    Object.keys(cacheMetadonnees).forEach(function (k) { delete cacheMetadonnees[k]; });
    Object.keys(metadonneesResolues).forEach(function (k) { delete metadonneesResolues[k]; });
    Object.keys(cacheVues).forEach(function (k) { delete cacheVues[k]; });
    Object.keys(vuesResolues).forEach(function (k) { delete vuesResolues[k]; });
    Object.keys(cacheExportLocations).forEach(function (k) { delete cacheExportLocations[k]; });
    Object.keys(cacheCustomActions).forEach(function (k) { delete cacheCustomActions[k]; });
  }

  return {
    connexions, manifests, arboTemplates, mappings, endpoints, metadonnees, metadonneesChargees, vuesMetadonnees, champsDeVue,
    exportLocations, customActions, rafraichir,
    dernierRafraichissement: function () { return dernierRafraichissement; },
    onRafraichi,
    publicUrl: function () { return publicUrlResolu; }
  };

})();

if (typeof window !== 'undefined') window.ConfigSources = ConfigSources;
if (typeof module !== 'undefined') module.exports = ConfigSources;
