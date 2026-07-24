/**
 * pivot-schema.js — Vocabulaire du format pivot du Workflow Builder
 *
 * Source unique du catalogue et des règles structurelles. Aucun autre fichier
 * ne redéclare la liste des Core ni les clés interdites : ils lisent ici.
 *
 * Le format connaît trois niveaux, et l'absence est signifiante :
 *   core    http_request        universel, compilable partout
 *   facade  iconik.action       vocabulaire de plateforme, sait se déplier
 *   preset  collection_create   pré-sélection de champs
 * Un Core pur n'a ni facade ni preset — c'est ce qui le distingue.
 *
 * Le pivot ne stocke rien de déductible (critère 2) : ni ports, ni portabilité,
 * ni caractère destructif, ni services requis. Ces propriétés se calculent à
 * partir du catalogue et de la configuration.
 */

const PivotSchema = (() => {

  // ── Catalogue, figé le 23 juillet 2026 ───────────────────────────────────

  // Les 12 Core en service. Ensemble fermé : un `core` hors liste est une erreur.
  const CORES = [
    'trigger', 'decision', 'loop', 'verify', 'wait', 'set_variable',
    'transform', 'lookup', 'http_request', 'http_sequence', 'history', 'deliver'
  ];

  // Déclarés, hors première coupe. Connus pour produire un message utile
  // plutôt qu'un « core inconnu » ; refusés tant qu'un besoin ne les appelle pas.
  const CORES_DECLARES = ['qc', 'script', 'delay', 'approval', 'call_workflow'];

  // Les ressources — nommées, réutilisables, éditées dans leur propre écran.
  const RESSOURCES = ['manifest', 'tree', 'table'];

  // ── Règles de forme ──────────────────────────────────────────────────────

  // Identifiants dérivés du nom métier (`boucler_sur`, `export_location`),
  // jamais hérités du producteur : les identifiants WFD partagent un long
  // préfixe commun, ce qui a provoqué des collisions à la génération BPMN.
  const RE_ID = /^[a-z][a-z0-9_]*$/;

  // Une façade se nomme `paquet.nom`. Le paquet est ouvert — APS est une
  // plateforme parmi d'autres — donc on valide la forme, pas l'appartenance.
  const RE_FACADE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

  const RE_PRESET = /^[a-z][a-z0-9_]*$/;

  // ── Ce qui ne doit jamais être stocké ────────────────────────────────────

  // Déductible du catalogue et de la configuration (critère 2). L'écrire
  // garantirait que ça diverge de ce que ça décrit.
  const CLES_DEDUCTIBLES = {
    ports:       'les ports se déduisent de la déclaration du core et de la configuration',
    portability: 'la portabilité est déclarée par chaque générateur',
    portabilite: 'la portabilité est déclarée par chaque générateur',
    destructive: 'le caractère destructif est déclaré par la façade',
    services:    'les services requis se déduisent des étapes qui les invoquent'
  };

  // Fuites de présentation trouvées dans WFD, à ne pas reproduire.
  const CLES_PRESENTATION = {
    x:               'les positions appartiennent à la section presentation',
    y:               'les positions appartiennent à la section presentation',
    pageBreakBefore: 'réglage du générateur Word : presentation.hints.docx',
    lkActiveTab:     "état de pliage de l'interface, jamais dans le modèle métier",
    lkApiFolded:     "état de pliage de l'interface, jamais dans le modèle métier",
    lkSourceFolded:  "état de pliage de l'interface, jamais dans le modèle métier"
  };

  // La politique d'erreur par nœud a été supprimée : un seul comportement,
  // réglé au niveau du workflow. 360 réglages en moins.
  const CLES_SUPPRIMEES = {
    onError: "la politique d'erreur est un réglage de workflow, plus une propriété d'étape",
    draft:   "`draft` de nœud entre en collision avec `status: draft` du flux ; à renommer"
  };

  // ── Ordre canonique des clés ─────────────────────────────────────────────
  // L'écrivain sérialise toujours dans cet ordre : deux enregistrements du même
  // workflow produisent le même texte, donc des diffs lisibles.

  const ORDRE_RACINE   = ['pivot', 'form', 'workflow', 'steps', 'edges', 'presentation'];
  const ORDRE_WORKFLOW = ['id', 'name', 'intent', 'platform', 'environment',
                          'version', 'status', 'designContext', 'onError'];
  const ORDRE_ETAPE    = ['id', 'core', 'facade', 'preset', 'label', 'intent',
                          'params', 'uses', 'body'];
  const ORDRE_ARETE    = ['from', 'to', 'set'];

  const STATUTS = ['draft', 'published'];

  return {
    CORES, CORES_DECLARES, RESSOURCES, STATUTS,
    RE_ID, RE_FACADE, RE_PRESET,
    CLES_DEDUCTIBLES, CLES_PRESENTATION, CLES_SUPPRIMEES,
    ORDRE_RACINE, ORDRE_WORKFLOW, ORDRE_ETAPE, ORDRE_ARETE,

    estCore(v)      { return CORES.indexOf(v) !== -1; },
    estDeclare(v)   { return CORES_DECLARES.indexOf(v) !== -1; },
    estRessource(v) { return RESSOURCES.indexOf(v) !== -1; }
  };

})();

if (typeof module !== 'undefined') module.exports = PivotSchema;
if (typeof window !== 'undefined') window.PivotSchema = PivotSchema;
