// WFD — script-workflow-designer.js — modifié le 2026-06-24
// Moteur Node-RED style pour Iconik Workflow Designer
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ── Helper null-safe pour display d'éléments optionnels ──────
function _wfdSetDisplay(id, val) { const el = document.getElementById(id); if (el) el.style.display = val; }

// ── Constantes familles ──────────────────────────────────────
const FAMILIES = {
  // ── Déclencheurs ─────────────────────────────────────────────
  trigger     : { color:'#e84393', icon:'⚡',  label:'Déclencheur',       desc:'Démarre le workflow sur un événement Iconik' },
  watchfolder : { color:'#d35400', icon:'📂',  label:'Dossier surveillé', desc:'Démarre le workflow quand un fichier arrive' },
  timer       : { color:'#8e44ad', icon:'⏱️',  label:'Minuterie',          desc:'Démarre le workflow à intervalles réguliers ou à une heure planifiée' },
  listener    : { color:'#c0392b', icon:'👂',  label:'Écouter',           desc:'Écoute un événement externe' },

  // ── Données ────────────────────────────────────────────────────
  fetch       : { color:'#3498db', icon:'🔍',  label:'Récupérer',         desc:'Récupère un asset, une collection ou des métadonnées' },
  lookup      : { color:'#2980b9', icon:'🗂️',  label:'Table de correspondance', desc:'Traduit une valeur en une autre via une table' },
  set_var     : { color:'#16a085', icon:'📌',  label:'Variable',          desc:'Définit ou modifie une variable du workflow' },
  transform   : { color:'#8e44ad', icon:'✏️',  label:'Transformer',       desc:'Modifie ou reformate une valeur' },
  rename      : { color:'#8e44ad', icon:'🔤',  label:'Nommer',            desc:'Définit le nom d\'un asset ou fichier' },
  script      : { color:'#e74c3c', icon:'</>',  label:'Script',           desc:'Exécute un script JavaScript personnalisé' },
  id_generator: { color:'#1abc9c', icon:'🔑',  label:'Générateur d\'ID',  desc:'Génère un identifiant unique et le pousse vers des variables et/ou des APIs' },

  // ── Logique ────────────────────────────────────────────────────
  decision    : { color:'#f39c12', icon:'⚡',  label:'Décision',          desc:'Branche le flux selon une condition' },
  loop        : { color:'#16a085', icon:'🔁',  label:'Boucler sur',       desc:'Répète des actions sur une liste' },
  qc          : { color:'#27ae60', icon:'✅',  label:'Contrôle qualité',  desc:'Vérifie des critères et valide ou rejette' },
  approval    : { color:'#e67e22', icon:'⏸',   label:'Approbation',       desc:'Attend une validation humaine' },

  // ── Actions ────────────────────────────────────────────────────
  action      : { color:'#00d4aa', icon:'⚙️',  label:'Organiser',         desc:'Ajoute, retire ou déplace un asset dans une collection' },
  update_meta : { color:'#9b59b6', icon:'🏷️',  label:'Métadonnées',       desc:'Lit ou écrit des métadonnées sur un asset' },
  acl         : { color:'#c0392b', icon:'🔐',  label:'Permissions',       desc:'Définit les droits d\'accès sur un asset' },
  create_asset: { color:'#27ae60', icon:'🎬',  label:'Créer asset',       desc:'Crée un nouvel asset dans Iconik' },
  create_col  : { color:'#16a085', icon:'📁',  label:'Créer collection',  desc:'Crée une nouvelle collection dans Iconik' },
  link_file   : { color:'#e67e22', icon:'🔗',  label:'Relier fichier',    desc:'Associe un fichier physique à un asset' },
  cast        : { color:'#9b59b6', icon:'📡',  label:'Envoyer vers',      desc:'Envoie des données vers un système tiers' },
  transcode   : { color:'#e67e22', icon:'🎞️',  label:'Transcoder',        desc:'Lance un job de transcodage Iconik' },

  // ── HTTP ─────────────────────────────────────────────────────────
  http_request  : { color:'#2ecc71', icon:'🌐', label:'HTTP Request',  desc:'Appelle une API REST externe (GET, POST, PUT, PATCH, DELETE)' },
  http_sequence : { color:'#2ecc71', icon:'⛓',  label:'Publication API', desc:'Enchaîne plusieurs appels API en séquence' },

  // ── Sorties ────────────────────────────────────────────────────
  notification: { color:'#1abc9c', icon:'🔔',  label:'Message',           desc:'Compose et envoie une notification (Teams, Slack...)' },
  export_file : { color:'#e67e22', icon:'📤',  label:'Exporter',          desc:'Exporte un asset vers un format ou destination' },
  publish     : { color:'#27ae60', icon:'🚀',  label:'Publier',           desc:'Publie un asset sur une plateforme' },

  // ── Utilitaires ────────────────────────────────────────────────
  postit      : { color:'#f1c40f', icon:'📝',  label:'Note',              desc:'Annotation visuelle sur le canvas' },
  workflow_history : { color:'#1abc9c', icon:'📋', label:'Historique', desc:'Écrit une entrée de log dans un champ MD Iconik', cat:'sorties' },
  wait_for         : { color:'#e67e22', icon:'⏳', label:'Attendre',    desc:'Polling sur un endpoint jusqu\'à ce qu\'une condition soit remplie' },
  aws_s3           : { color:'#ff9900', icon:'☁️',  label:'AWS S3',      desc:'Opérations sur un bucket Amazon S3' },
  checker          : { color:'#27ae60', icon:'✔️',  label:'Vérificateur', desc:'Vérifie une liste d\'endpoints et leurs valeurs attendues' },
  aps_search        : { color:'#8e44ad', icon:'🔍', label:'Recherche APS',  desc:'Recherche multi-blocs dans Iconik avec critères typés' },
  notify_post : { color:'#1abc9c', icon:'🔔',  label:'Notifier (POST)',   desc:'Envoie un POST HTTP vers un système externe' },
  subflow     : { color:'#8e44ad', icon:'🔀',  label:'Appeler Workflow',  desc:'Appelle un autre workflow en synchrone ou asynchrone' },
  relate      : { color:'#2980b9', icon:'🔗',  label:'Créer Relation',    desc:'Crée une relation entre deux assets Iconik' },
  manual      : { color:'#95a5a6', icon:'🧪',  label:'Inject / Test',     desc:'Injecte un payload JSON pour tester le workflow' },
  gate        : { color:'#e67e22', icon:'🚦',  label:'Contrôle',          desc:'Throttle de concurrence, pause manuelle ou délai entre les nœuds' },
};

// ── QC — champs vérifiables ───────────────────────────────────
const QC_CATEGORIES = {
  metadata : { label:'M\u00E9tadonn\u00E9e',      icon:'\uD83D\uDCCB' },
  file     : { label:'Fichier / Format',icon:'\uD83C\uDFAC' },
  collection:{ label:'Collection',      icon:'\uD83D\uDCC1' },
  acl      : { label:'ACL / Permissions',icon:'\uD83D\uDD10'},
};

const QC_OPS = {
  present      : { label:'est pr\u00E9sent',           hasValue:false },
  absent       : { label:'est absent',            hasValue:false },
  equals       : { label:'est \u00E9gal \u00E0',            hasValue:true  },
  not_equals   : { label:'est diff\u00E9rent de',      hasValue:true  },
  contains     : { label:'contient',              hasValue:true  },
  not_contains : { label:'ne contient pas',       hasValue:true  },
  regex        : { label:'correspond au regex',   hasValue:true  },
  gt           : { label:'> (sup\u00E9rieur)',          hasValue:true  },
  lt           : { label:'< (inf\u00E9rieur)',          hasValue:true  },
  in_list      : { label:'fait partie de',        hasValue:true  },
};

const QC_FILE_FIELDS = [
  'codec_video','codec_audio','resolution','fps','bitrate_video',
  'bitrate_audio','duration','loudness_integrated','loudness_peak',
  'aspect_ratio','color_space','scan_type','sample_rate','channels'
];

const NOTIF_CHANNELS = {
  email : { icon:'\uD83D\uDCE7', label:'Email (SMTP)'  },
  teams : { icon:'\uD83D\uDCAC', label:'Microsoft Teams'},
  slack : { icon:'\uD83D\uDCAC', label:'Slack'         },
  sms   : { icon:'\uD83D\uDCF1', label:'SMS (Twilio)'  },
};

const SCRIPT_LANGS = { javascript:'JavaScript', python:'Python' };

const DEFAULT_SCRIPTS = {
javascript: `// Variables disponibles : asset, metadata, collection, workflowName
// Retourner { port: 'nom_sortie' } pour piloter le flux

const now = new Date().toISOString().replace('T',' ').slice(0,19);
const line = now + ' | ' + workflowName + ' | Reussi';
const current = metadata['Workflow History'] || '';
metadata['Workflow History'] = line + '\n' + current;

return { port: 'success' };`,

python: `# Variables disponibles : asset, metadata, collection, workflow_name
# Retourner {"port": "nom_sortie"} pour piloter le flux
import datetime

now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
line = f"{now} | {workflow_name} | Reussi"
current = metadata.get('Workflow History', '')
metadata['Workflow History'] = line + '\n' + current

return {"port": "success"}`
};

const SOURCE_VARIANTS = {
  local     : '📂 Dossier local',
  s3        : '☁️ Amazon S3',
  ftp       : '📡 FTP',
  sftp      : '🔒 SFTP',
  gcs       : '☁️ Google Cloud Storage',
  azure     : '☁️ Azure Blob Storage',
  file      : '📄 Fichier seul',
  sidecar   : '📦 Fichier + Sidecar',
  api       : '🔌 Post API entrant',
  webhook   : '🔔 Webhook générique',
  automation: '⚙️ Automation Iconik',
};

// Alias — watchfolder utilise SOURCE_VARIANTS depuis la fusion avec source
const WF_VARIANTS = SOURCE_VARIANTS;
const TRIGGER_EVENTS = {
  metadata_changed      : { label:'Metadata changée',              icon:'🏷', fields:['field','condition','value','mdview'] },
  asset_added_collection: { label:'Asset ajouté à une collection', icon:'📁', fields:['collection'] },
  asset_removed_collection:{ label:'Asset retiré d\'une collection',icon:'📁', fields:['collection'] },
  asset_created         : { label:'Asset créé',                    icon:'✨', fields:['mdview'] },
  asset_deleted         : { label:'Asset supprimé',                icon:'🗑', fields:[] },
  asset_status_changed  : { label:'Statut asset changé',           icon:'🔄', fields:['status_value'] },
  proxy_available       : { label:'Proxy disponible',              icon:'🎬', fields:[] },
  job_finished          : { label:'Job terminé',                   icon:'✅', fields:['job_type'] },
  job_failed            : { label:'Job en erreur',                 icon:'❌', fields:['job_type'] },
  custom_action         : { label:'Custom Action',                 icon:'⚡', fields:['custom_action_id'] },
  webhook               : { label:'Webhook Iconik',                icon:'🔔', fields:['webhook_id'] },
  saved_search          : { label:'Saved Search (poll)',            icon:'🔍', fields:['saved_search_id','poll_interval','poll_mode','poll_limit','mdview'] },
};

const TRIGGER_CONDITIONS = {
  // Égalité
  equals          : 'est égal à',
  not_equals      : 'est différent de',
  // Présence
  present         : 'est présent',
  absent          : 'est absent',
  // Chaîne
  contains        : 'contient',
  not_contains    : 'ne contient pas',
  starts_with     : 'commence par',
  ends_with       : 'se termine par',
  not_starts_with : 'ne commence pas par',
  not_ends_with   : 'ne se termine pas par',
  matches_regex   : 'correspond au regex',
  not_matches_regex:'ne correspond pas au regex',
  // Numérique / date
  gt              : 'est supérieur à',
  gte             : 'est supérieur ou égal à',
  lt              : 'est inférieur à',
  lte             : 'est inférieur ou égal à',
  between         : 'est entre (min,max)',
  not_between     : "n'est pas entre (min,max)",
  // Liste
  in_list         : 'fait partie de (val1,val2…)',
  not_in_list     : 'ne fait pas partie de (val1,val2…)',
  // Logique combinée
  and_not         : 'est présent ET différent de',
  nor             : 'est absent OU égal à',
};

// Conditions qui n'ont pas de champ valeur
const TRIGGER_CONDITIONS_NO_VALUE = new Set(['present','absent']);

const ACTION_TYPES = {
  asset_create          : { label:"Creer un asset",                    endpoint:"POST /API/assets/v1/assets/",                                    desc:"Cree un nouvel asset (titre, type, statut)" },
  asset_update          : { label:"Mettre a jour un asset",            endpoint:"PUT /API/assets/v1/assets/{asset_id}/",                          desc:"Remplace toutes les proprietes d'un asset" },
  asset_patch           : { label:"Modifier un champ d'asset",         endpoint:"PATCH /API/assets/v1/assets/{asset_id}/",                        desc:"Modifie partiellement un asset (titre, statut, is_online...)" },
  asset_delete          : { label:"Supprimer un asset",                endpoint:"DELETE /API/assets/v1/assets/{asset_id}/",                       desc:"Supprime definitivement un asset" },
  asset_restore         : { label:"Restaurer un asset archive",        endpoint:"POST /API/assets/v1/assets/{asset_id}/restore/",                 desc:"Restaure un asset depuis l'archive" },
  asset_copy            : { label:"Copier un asset dans une collection",endpoint:"POST /API/assets/v1/assets/{asset_id}/collections/{col_id}/",   desc:"Copie l'asset dans une collection cible" },
  collection_create     : { label:"Creer une collection",              endpoint:"POST /API/assets/v1/collections/",                               desc:"Cree une nouvelle collection (nom, parent optionnel)" },
  collection_update     : { label:"Mettre a jour une collection",      endpoint:"PUT /API/assets/v1/collections/{collection_id}/",                desc:"Met a jour les proprietes d'une collection" },
  collection_add_asset  : { label:"Ajouter un asset a une collection", endpoint:"POST /API/assets/v1/collections/{col_id}/content/",              desc:"Ajoute un asset existant dans une collection" },
  collection_remove_asset:{ label:"Retirer un asset d'une collection", endpoint:"DELETE /API/assets/v1/collections/{col_id}/content/{asset_id}/", desc:"Retire un asset d'une collection" },
  collection_delete     : { label:"Supprimer une collection",          endpoint:"DELETE /API/assets/v1/collections/{col_id}/",                    desc:"Supprime une collection (vider avant si necessaire)" },
  metadata_write        : { label:"Ecrire des metadonnees (vue)",      endpoint:"PUT /API/metadata/v1/assets/{asset_id}/views/{view_id}/",        desc:"Ecrit des valeurs dans une vue de metadonnees" },
  metadata_patch        : { label:"Modifier un champ de metadonnee",   endpoint:"PATCH /API/metadata/v1/assets/{asset_id}/views/{view_id}/",      desc:"Met a jour partiellement une vue de metadonnees" },
  metadata_collection   : { label:"Ecrire metadonnees sur collection", endpoint:"PUT /API/metadata/v1/collections/{col_id}/views/{view_id}/",     desc:"Applique des metadonnees a une collection" },
  metadata_view_create  : { label:"Creer une vue de metadonnees",      endpoint:"POST /API/metadata/v1/views/",                                   desc:"Cree une nouvelle vue de metadonnees (nom, champs)" },
  metadata_field_create : { label:"Creer un champ de metadonnee",      endpoint:"POST /API/metadata/v1/fields/",                                  desc:"Cree un nouveau champ (type, nom, options)" },
  acl_set_asset         : { label:"Definir ACL sur un asset",          endpoint:"POST /API/acls/v1/assets/{asset_id}/acls/",                      desc:"Donne des permissions (read/write/delete) a un user ou groupe" },
  acl_set_collection    : { label:"Definir ACL sur une collection",    endpoint:"POST /API/acls/v1/collections/{col_id}/acls/",                   desc:"Applique une ACL a une collection (et ses enfants si propagation)" },
  acl_propagate         : { label:"Propager ACL a tous les contenus",  endpoint:"POST /API/acls/v1/collections/{col_id}/acls/propagate/",         desc:"Propage les ACLs de la collection a tous ses assets/sous-collections" },
  acl_template_apply    : { label:"Appliquer un template ACL",         endpoint:"POST /API/acls/v1/objects/{obj_id}/bulk/",                       desc:"Applique un template ACL predefini a un objet" },
  acl_remove            : { label:"Retirer une ACL",                   endpoint:"DELETE /API/acls/v1/{object_type}/{obj_id}/acls/{acl_id}/",      desc:"Supprime une entree ACL specifique" },
  file_set_create       : { label:"Creer un file set",                 endpoint:"POST /API/files/v1/assets/{asset_id}/file_sets/",               desc:"Cree un file set lie a un format (contient les fichiers composants)" },
  file_create           : { label:"Enregistrer un fichier (format)",   endpoint:"POST /API/files/v1/assets/{asset_id}/files/",                    desc:"Enregistre un fichier physique lie a un asset" },
  proxy_create          : { label:"Creer / uploader un proxy",         endpoint:"POST /API/files/v1/assets/{asset_id}/proxies/",                  desc:"Cree un proxy pour upload externe \u2014 retourne upload_url pre-signe" },
  proxy_patch           : { label:"Cloturer un proxy (CLOSED)",        endpoint:"PATCH /API/files/v1/assets/{asset_id}/proxies/{proxy_id}/",      desc:"Passe le proxy au statut CLOSED \u2014 obligatoire pour visibilite UI" },
  proxy_keyframe        : { label:"Generer keyframes depuis proxy",     endpoint:"POST /API/files/v1/assets/{asset_id}/proxies/{proxy_id}/keyframes/", desc:"Genere la keyframe map et poster a partir du proxy uploade" },
  format_create         : { label:"Creer un format",                   endpoint:"POST /API/files/v1/assets/{asset_id}/formats/",                  desc:"Cree un format de fichier pour un asset (original, proxy...)" },
  format_delete         : { label:"Supprimer un format",               endpoint:"DELETE /API/files/v1/assets/{asset_id}/formats/{format_id}/",    desc:"Supprime un format de fichier" },
  transcode_create      : { label:"Lancer un transcodage",             endpoint:"POST /API/transcode/v1/jobs/",                                   desc:"Soumet un job de transcodage (preset, source, destination)" },
  keyframe_create       : { label:"Generer des keyframes",             endpoint:"POST /API/transcode/v1/jobs/keyframes/",                         desc:"Genere les keyframes/thumbnails d'un asset" },
  saved_search_create   : { label:"Creer une recherche sauvegardee",   endpoint:"POST /API/search/v1/saved_searches/",                            desc:"Enregistre une requete de recherche nommee" },
  automation_trigger    : { label:"Declencher une automation",         endpoint:"POST /API/automations/v1/automations/{id}/run/",                 desc:"Declenche manuellement une automation existante" },
  webhook_create        : { label:"Creer un webhook",                  endpoint:"POST /API/notifications/v1/webhooks/",                           desc:"Enregistre un nouveau webhook (event_type, url, realm...)" },
  relation_create       : { label:"Creer une relation entre assets",   endpoint:"POST /API/assets/v1/assets/{asset_id}/relations/",               desc:"Lie deux assets entre eux (type de relation configurable)" },
  segment_create        : { label:"Creer un segment",                  endpoint:"POST /API/assets/v1/assets/{asset_id}/segments/",                desc:"Cree un segment temporel ou marqueur sur un asset" },
  share_create          : { label:"Creer un partage public",           endpoint:"POST /API/acls/v1/shares/",                                      desc:"Cree un lien de partage externe (duree, permissions)" },
  // ── Actions complémentaires implémentées ────────────────────────────────
  asset_set_status      : { label:"Changer le statut d'un asset",      endpoint:"PATCH /API/assets/v1/assets/{asset_id}/",                        desc:"Raccourci pour modifier uniquement le statut (ACTIVE, ARCHIVE, DELETED...)" },
  saved_search_run      : { label:"Executer une recherche sauvegardee", endpoint:"GET /API/search/v1/saved_searches/{id}/execute/",                desc:"Recupere les resultats d'une Saved Search Iconik — indispensable pour les flux timer" },
  job_get_status        : { label:"Obtenir le statut d'un job",         endpoint:"GET /API/transcode/v1/jobs/{job_id}/",                           desc:"Interroge le statut d'un job de transcodage ou d'analyse" },
  export_location_trigger: { label:"Exporter vers une Export Location", endpoint:"POST /API/files/v1/assets/{asset_id}/export_locations/{export_location_id}/", desc:"Declenche l'export de l'asset vers une Export Location configuree — retourne un job_id" },
  custom_action_trigger : { label:"Declencher une Custom Action",       endpoint:"POST /API/assets/v1/assets/{asset_id}/custom_actions/{id}/execute/", desc:"Declenche une Custom Action Iconik existante sur un asset" },
  acl_set_collection    : { label:"Definir ACL sur une collection",     endpoint:"POST /API/acls/v1/collections/{col_id}/acls/",                   desc:"Applique une ACL a une collection" },
  acl_propagate         : { label:"Propager ACLs collection",           endpoint:"POST /API/acls/v1/collections/{col_id}/acls/propagate/",         desc:"Propage les ACLs de la collection a tous ses contenus" },
  acl_remove            : { label:"Retirer une ACL",                    endpoint:"DELETE /API/acls/v1/{object_type}/{obj_id}/acls/{acl_id}/",      desc:"Supprime une entree ACL specifique" },
  collection_delete     : { label:"Supprimer une collection",           endpoint:"DELETE /API/assets/v1/collections/{col_id}/",                    desc:"Supprime une collection (vider avant si necessaire)" },
  proxy_keyframe        : { label:"Generer keyframes depuis proxy",      endpoint:"POST /API/files/v1/assets/{asset_id}/proxies/{proxy_id}/keyframes/", desc:"Genere la keyframe map et poster a partir du proxy uploade" },
  keyframe_create       : { label:"Generer des keyframes",              endpoint:"POST /API/transcode/v1/jobs/keyframes/",                         desc:"Genere les keyframes/thumbnails d'un asset" },
  format_delete         : { label:"Supprimer un format",                endpoint:"DELETE /API/files/v1/assets/{asset_id}/formats/{format_id}/",    desc:"Supprime un format de fichier" },
  asset_restore         : { label:"Restaurer un asset archive",         endpoint:"POST /API/assets/v1/assets/{asset_id}/restore/",                 desc:"Restaure un asset depuis l'archive" },
  asset_copy            : { label:"Copier un asset dans une collection", endpoint:"POST /API/assets/v1/assets/{asset_id}/collections/{col_id}/",   desc:"Copie l'asset dans une collection cible" },
};
const S3_ACCOUNT_TYPES = [
  'Amazon S3 Storage',
  'S3 Compatible Storage',
  'Amazon S3 in China',
  'Amazon S3 GovCloud Storage',
  'Amazon S3 GovCloud Storage (FIPS 140-2)',
  'Amazon S3 via EC2 IAM Role',
  'Amazon S3 via AssumeRole',
  'Amazon S3 via GetSessionToken',
  'Amazon S3 via SSO',
  'Amazon S3 (Credentials from Environment Variables)',
  'Amazon S3 (Credentials from AWS Config or Credential file)',
];
const EXPORT_TARGETS = {
  file    : 'Fichier local',
  iconik  : 'Iconik (proxy / format)',
  post_api: 'POST API (webhook sortant)',
  s3      : 'Amazon S3',
  ftp     : 'FTP',
  sftp    : 'SFTP',
  youtube : 'YouTube',
  vimeo   : 'Vimeo',
  facebook: 'Facebook / Meta',
  twitter : 'Twitter / X',
  gcs     : 'Google Cloud Storage',
  azure   : 'Azure Blob Storage',
};
const DECISION_OPS = {
  equals          : 'est \u00e9gal \u00e0',
  not_equals      : 'est diff\u00e9rent de',
  is_empty        : 'est vide',
  not_empty       : 'n\'est pas vide',
  contains        : 'contient',
  not_contains    : 'ne contient pas',
  starts_with     : 'commence par',
  ends_with       : 'se termine par',
  not_starts_with : 'ne commence pas par',
  not_ends_with   : 'ne se termine pas par',
  matches_regex   : 'correspond au regex',
  gt              : 'est sup\u00e9rieur \u00e0',
  gte             : 'est sup\u00e9rieur ou \u00e9gal \u00e0',
  lt              : 'est inf\u00e9rieur \u00e0',
  lte             : 'est inf\u00e9rieur ou \u00e9gal \u00e0',
  between         : 'est entre (min,max)',
  in_list         : 'fait partie de (val1,val2\u2026)',
  not_in_list     : 'ne fait pas partie de',
};
const DECISION_OPS_NO_VALUE = new Set(['is_empty','not_empty']);

// ── État global ──────────────────────────────────────────────
let wfdFlows    = [];   // [{ id, name, nodes:[], connections:[] }]
let wfdPalNodes = [];   // définitions palette [{ id, family, name, config:{} }]
let wfdMappings = [];   // [{ id, name, rows:[{src,tgt}] }]
let wfdContacts = [];   // [{ id, name, contacts:[{nom,email,teams,slack,sms}] }]
let wfdScripts  = [];   // [{ id, name, lang, code, description }] — scripts partagés
let wfdConnexions = []; // [{ id, name, endpoint, authType, authValue, mappings:[] }] — connexions externes
let wfdNommages   = []; // [{ id, name, description, steps:[] }] — règles de nommage
let wfdData     = {};   // données Iconik depuis localStorage

let currentFlowId   = null;
let selectedNodeId  = null;
let selectedNodeIds = new Set();   // multi-sélection lasso
let selectedConnId  = null;        // connexion sélectionnée
let isLassoing      = false;
let lassoStart      = { x:0, y:0 };
let connectingFrom  = null; // { nodeId, portIndex }
let dragOffset      = { x:0, y:0 };
let viewTransform   = { x:0, y:0, scale:1 };
let isDragging      = false;
let isPanning       = false;
let panStart        = { x:0, y:0 };
let panWasDragging = false; // ← AJOUT : a-t-on réellement panné au clic droit ?
let _suppressNextNodeClick = false; // évite de perdre la multi-sélection juste après un lasso
let _skipNextCanvasClick = false; // ← nouveau : évite d’effacer la sélection juste après le lasso
// === Historique Undo/Redo (socle, non branché) ==============================
let _hist = [];
let _histIndex = -1;
const _HIST_MAX = 50;

function _snapshot() {
  // Capture l'état minimal du designer (profond)
  try {
    return JSON.parse(JSON.stringify({ wfdFlows, currentFlowId }));
  } catch (e) {
    console.warn('[WFD][HIST] snapshot fail', e);
    return null;
  }
}

let _historyRestoring = false;

function _historyPush(label = '') {
  if (_historyRestoring) return;
  const snap = _snapshot();
  if (!snap) return;
  // Dédoublonner : ne pas pousser si identique au dernier snapshot
  if (_hist.length > 0 && _histIndex >= 0) {
    try {
      if (JSON.stringify(_hist[_histIndex]) === JSON.stringify(snap)) return;
    } catch(e) {}
  }
  _hist = _hist.slice(0, _histIndex + 1);
  _hist.push(snap);
  if (_hist.length > _HIST_MAX) _hist.shift();
  _histIndex = _hist.length - 1;
}

function _historyRestore(idx) {
  const snap = _hist[idx];
  if (!snap) return;
  _historyRestoring = true;
  wfdFlows      = JSON.parse(JSON.stringify(snap.wfdFlows));
  currentFlowId = snap.currentFlowId;
  localStorage.setItem('wfdFlows', JSON.stringify(wfdFlows));
  if (typeof peuplerSelectFlux === 'function') peuplerSelectFlux();
  if (typeof renderCanvas === 'function') renderCanvas();
  _historyRestoring = false;
}

function doUndo() {
  if (_histIndex > 0) {
    _histIndex--;
    _historyRestore(_histIndex);
  } else {
    if (typeof toast === 'function') toast('Rien à annuler', true);
  }
}

function doRedo() {
  if (_histIndex < _hist.length - 1) {
    _histIndex++;
    _historyRestore(_histIndex);
  } else {
    if (typeof toast === 'function') toast('Rien à rétablir', true);
  }
}
let configDirty     = false;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // P1 fix 2026-06-28 — envs Iconik depuis DB (Settings n'alimente plus localStorage)
  fetch(_APS_BASE + '/api/environments/credentials')
    .then(r => r.ok ? r.json() : [])
    .then(envs => {
      appTokensData = { appTokens: envs };
      peuplerSelectEnvironnement();
      // P3 — snapshot DB sur l'env par défaut dès que les envs sont connus
      const defEnv = envs.find(e => e.isDefault) || envs[0];
      if (defEnv) {
        // Toujours fetcher Iconik en direct au démarrage — snapshot en fallback si échec
        setTimeout(() => {
          if (typeof wfdRefreshAllData === 'function') {
            wfdRefreshAllData({ silent: true }).catch(() => {
              _wfdChargerSnapshotDB(defEnv.name);
            });
          } else {
            _wfdChargerSnapshotDB(defEnv.name);
          }
        }, 500); // laisser peuplerSelectEnvironnement() finir d'abord
      }
    })
    .catch(() => {});

  // Org name depuis API
  fetch(_APS_BASE + '/api/organisation')
    .then(r => r.ok ? r.json() : null)
    .then(org => {
      if (!org) return;
      const badge = document.getElementById('orgBadge');
      if (badge) badge.textContent = org.name;
      document.title = org.name + ' \u2014 Workflow Designer';
    })
    .catch(() => {
      const orgName = localStorage.getItem('organisationName') || localStorage.getItem('nomOrganisation') || '';
      const badge = document.getElementById('orgBadge');
      if (badge && orgName) badge.textContent = orgName;
      if (orgName) document.title = orgName + ' \u2014 Workflow Designer';
    });

  chargerIconikData();
  // chargerEtat est async (charge depuis le serveur) — peuplerPalette/Flux sont appelés en interne
  chargerEtat();
  setupCanvasDragDrop();
  setupPanning();
  setupKeyboard();
  setupConfigPanelEvents();
  setupInstantNode();
  setupContextMenu();
  initPanelResizer();

  // tabindex="-1" permet de focus() le panel programmatiquement sans interaction
  // utilisateur préalable — nécessaire pour ancrer le contexte de saisie Electron
  // quand le panel s'ouvre depuis un popover ou menu contextuel.
  const _cp = document.getElementById('wfd-config-panel');
  if (_cp && !_cp.hasAttribute('tabindex')) _cp.setAttribute('tabindex', '-1');

// 🔵 Hook "premier render" : pousse un snapshot 'Initial' au 1er renderCanvas() rencontré
  (function installBootHistoryHook(){
    if (window._histBootHooked) return;        // évite double‑install
    window._histBootHooked  = true;
    window._histBootPushed  = false;
    const _origRenderCanvas = window.renderCanvas;
    if (typeof _origRenderCanvas !== 'function') return; // sécurité
    window.renderCanvas = function(...args){
      const r = _origRenderCanvas.apply(this, args);
      if (!window._histBootPushed) {
        try { _historyPush('Initial'); } catch(e) { console.warn('[HIST] push initial fail', e); }
        window._histBootPushed = true;
      }
      return r;
    };
  })();

  document.getElementById('wfd-empty').style.display = 'flex';
});

// ══ NOUVEAU UI — Bandeau catégories + node-bar + logs panel ══════
// Ces fonctions gèrent uniquement la navigation UI.
// Elles lisent les données de wfdPalNodes (géré par peuplerPalette).

const WFD_CAT_MAP = {
  inputs : {
    label : '⚡ Déclencheurs',
    nodes : ['trigger','watchfolder','timer','listener'],
  },
  data   : {
    label : '🔍 Données',
    nodes : ['fetch','lookup','set_var','transform','rename','script','id_generator'],
  },
  logic  : {
    label : '⚡ Logique',
    nodes : ['decision','loop','qc','approval'],
  },
  actions: {
    label : '⚙️ Actions',
    nodes : ['action','update_meta','acl','create_asset','create_col','link_file','cast','transcode','relate'],
  },
  outputs: {
    label : '🔔 Sorties',
    nodes : ['notification','export_file','publish','notify_post','http_request','http_sequence','workflow_history'],
  },
  misc   : {
    label : '📝 Utilitaires',
    nodes : ['postit','subflow','manual','gate','wait_for','aws_s3','checker','aps_search'],
  },
};

let _wfdActiveCat  = null;
let _wfdLogsOpen   = false;

function wfdSelectCat(btn) {
  const cat = btn.dataset.cat;
  // Toggle : reclic sur catégorie active = ferme le bandeau
  if (_wfdActiveCat === cat) {
    _wfdActiveCat = null;
    document.querySelectorAll('.wfd-cat-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('wfd-node-bar').classList.remove('open');
    return;
  }
  _wfdActiveCat = cat;
  document.querySelectorAll('.wfd-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _wfdPopulateNodeBar(cat);
  document.getElementById('wfd-node-bar').classList.add('open');
}

function _wfdPopulateNodeBar(cat) {
  const bar = document.getElementById('wfd-node-bar-inner');
  bar.innerHTML = '';

  if (cat === 'saved') {
    // Tous les nœuds sauvegardés (wfdPalNodes)
    if (!wfdPalNodes.length) {
      const msg = document.createElement('span');
      msg.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:#333;white-space:nowrap;';
      msg.textContent = 'Aucun nœud sauvegardé — clic droit sur un nœud → Sauvegarder';
      bar.appendChild(msg);
      return;
    }
    wfdPalNodes.forEach(n => bar.appendChild(_wfdMakeChip(n, true)));
    return;
  }

  // Nœuds système de la catégorie
  const catDef   = WFD_CAT_MAP[cat] || {};
  const families = catDef.nodes || (Array.isArray(catDef) ? catDef : []);
  families.forEach(family => {
    const fam = FAMILIES[family];
    if (!fam) return;
    bar.appendChild(_wfdMakeChip({ family, name: fam.label, id: null }, false));
  });

  // Nœuds sauvegardés de cette catégorie
  const savedInCat = wfdPalNodes.filter(n => (WFD_CAT_MAP[cat]?.nodes || []).includes(n.family));
  if (savedInCat.length) {
    const sep = document.createElement('div');
    sep.className = 'wfd-node-sep';
    bar.appendChild(sep);
    const lbl = document.createElement('span');
    lbl.className = 'wfd-node-sep-label';
    lbl.textContent = 'Mes nœuds';
    bar.appendChild(lbl);
    savedInCat.forEach(n => bar.appendChild(_wfdMakeChip(n, true)));
  }
}

function _wfdMakeChip(node, saved) {
  const fam = FAMILIES[node.family] || { color:'#555', icon:'?', label: node.family };
  const chip = document.createElement('button');
  chip.className = 'wfd-node-chip' + (saved ? ' saved' : '');
  chip.style.setProperty('--chip-c',    fam.color);
  chip.style.setProperty('--chip-b',    fam.color + '33');
  chip.style.setProperty('--chip-bg',   fam.color + '0d');
  chip.style.setProperty('--chip-glow', fam.color + '44');
  chip.title = saved
    ? 'Glisser sur le canvas ou cliquer pour ajouter'
    : (fam.desc ? fam.label + ' — ' + fam.desc : 'Ajouter un nœud ' + fam.label);

  if (saved && node.id) {
    // Nœud sauvegardé : drag depuis la palette + clic
    chip.dataset.palId = node.id;
    chip.draggable = true;
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('palNodeId', node.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    chip.onclick = () => ajouterNoeudSource(node.family, node.name);
  } else {
    // Nœud système : ouvre la modale de création
    chip.onclick = () => creerNoeudPalette(node.family);
  }

  chip.innerHTML =
    '<span class="wfd-chip-icon">' + (fam.icon || '?') + '</span>' +
    '<span class="wfd-chip-name">' + escHtml(node.name) + '</span>' +
    (saved && node.id
      ? '<span class="wfd-chip-dot"></span>' +
        '<button class="wfd-chip-del" title="Supprimer de Mes n\u0153uds" ' +
        'onclick="event.stopPropagation();supprimerNoeudPalette(\'' + node.id + '\')">×</button>'
      : '');
  return chip;
}

// Rafraîchir le bandeau après peuplerPalette() (si une catégorie est active)
function wfdRefreshNodeBar() {
  if (_wfdActiveCat) _wfdPopulateNodeBar(_wfdActiveCat);
}

function wfdToggleLogs() {
  _wfdLogsOpen = !_wfdLogsOpen;
  document.getElementById('wfd-logs-panel').classList.toggle('open', _wfdLogsOpen);
  document.getElementById('wfd-logs-btn')?.classList.toggle('active', _wfdLogsOpen);
  _wfdUpdateDimmed();
}

function _wfdUpdateDimmed() {
  // Dimming uniquement pour le panel logs (overlay opaque)
  // Le panel config est backdrop-blur semi-transparent — pas besoin de dimmer
  document.getElementById('wfd-canvas-wrap').classList.toggle('panel-dimmed', _wfdLogsOpen);
}


// ════════════════════════════════════════════════════════════════════════════
// WFD JOBS — Badges animés + Panel Live/Historique
// ════════════════════════════════════════════════════════════════════════════

const _wfdJobs = {
  // Jobs en cours : { runId → { fluxId, fluxName, startedAt, nodes:{nodeId→status}, errors[] } }
  live    : {},
  // Historique complet
  history : JSON.parse(localStorage.getItem('wfdJobsHistory') || '[]'),
  // Badges actifs sur le canvas : { nodeId → DOMElement }
  badges  : {},
};

// ── Toggle panel ─────────────────────────────────────────────────────────────
function wfdToggleJobsPanel() {
  const panel = document.getElementById('wfd-jobs-panel');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  const btn  = document.getElementById('wfd-jobs-btn');
  if (btn) {
    btn.style.color      = open ? '#c39bd3' : '#9b59b6';
    btn.style.background = open ? 'rgba(155,89,182,0.15)' : '';
  }
  if (open) _wfdRenderJobsPanel();
}

// ── Onglets ───────────────────────────────────────────────────────────────────
function wfdJobsTab(tab) {
  const live    = document.getElementById('wfd-jobs-live');
  const history = document.getElementById('wfd-jobs-history');
  const tabLive = document.getElementById('wfd-jobs-tab-live');
  const tabHist = document.getElementById('wfd-jobs-tab-history');
  if (tab === 'live') {
    if (live)    live.style.display    = '';
    if (history) history.style.display = 'none';
    if (tabLive) { tabLive.style.borderBottomColor = '#9b59b6'; tabLive.style.color = '#fff'; }
    if (tabHist) { tabHist.style.borderBottomColor = 'transparent'; tabHist.style.color = '#555'; }
  } else {
    if (live)    live.style.display    = 'none';
    if (history) history.style.display = '';
    if (tabLive) { tabLive.style.borderBottomColor = 'transparent'; tabLive.style.color = '#555'; }
    if (tabHist) { tabHist.style.borderBottomColor = '#9b59b6'; tabHist.style.color = '#fff'; }
    _wfdRenderHistory();
  }
}

// ── Vider l'historique ────────────────────────────────────────────────────────
function wfdJobsClearHistory() {
  _wfdJobs.history = [];
  localStorage.removeItem('wfdJobsHistory');
  _wfdRenderHistory();
}

// ── Traitement des événements engine ─────────────────────────────────────────
function _wfdHandleEngineEvent(ev) {
  const { type, fluxId, runId, fluxName, nodeId, name, family, port, message, severity, status } = ev;

  switch (type) {

    case 'flux:start': {
      // flux:start n'a pas de runId — on attend 'start' de l'executor
      // Juste mettre à jour le badge toolbar
      _wfdUpdateLiveBadge();
      break;
    }

    case 'start': {
      // Émis par l'executor avec runId — créer le job live ici
      _wfdJobs.live[ev.runId] = {
        runId: ev.runId, fluxId, fluxName: ev.fluxName || fluxId,
        startedAt: Date.now(), status: 'running',
        nodes: {}, nodeOrder: [], errors: [],
      };
      _wfdUpdateLiveBadge();
      _wfdRenderJobsPanel();
      break;
    }

    case 'node:start': {
      const job = _wfdFindJob(runId, fluxId);
      if (!job) break;
      job.nodes[nodeId] = { nodeId, name, family, status: 'running', startedAt: Date.now(), count: null };
      if (!job.nodeOrder.includes(nodeId)) job.nodeOrder.push(nodeId);
      job.currentNodeId = nodeId;
      _wfdShowBadge(nodeId, 'running');
      _wfdRenderJobCard(job);
      break;
    }

    case 'node:done': {
      const job = _wfdFindJob(runId, fluxId);
      if (!job) break;
      const n = job.nodes[nodeId];
      const prevStatus = n?.status;
      const hasWarn    = ev.warn;
      // port > 0 = chemin alternatif (pas une erreur), hasWarn = vrai avertissement
      const newStatus  = hasWarn ? 'warn' : 'success';
      const stayOnNode = hasWarn; // garder le badge seulement si vrai warn
      if (n) {
        n.status = port > 0 && !hasWarn ? 'done-alt' : newStatus;
        if (ev.count !== null && ev.count !== undefined) n.count = ev.count;
      }
      if (prevStatus !== 'error') {
        _wfdMoveBadge(nodeId, newStatus, stayOnNode, n?.count);
      }
      _wfdRenderJobCard(job);
      break;
    }

    case 'node:error': {
      const job = _wfdFindJob(runId, fluxId);
      if (!job) break;
      const n = job.nodes[nodeId];
      if (n) { n.status = severity === 'fatal' ? 'error' : 'warn'; n.error = message; }
      job.errors.push({ nodeId, message, severity });
      _wfdMoveBadge(nodeId, severity === 'fatal' ? 'error' : 'warn', true); // true = rester
      _wfdRenderJobCard(job);
      break;
    }

    case 'node:skip': {
      const job = _wfdFindJob(runId, fluxId);
      if (job && job.nodes[nodeId]) job.nodes[nodeId].status = 'warn';
      _wfdRemoveBadge(nodeId, 300);
      break;
    }

    case 'node:paused': {
      window._lastPausedEvent = ev; // debug — inspecter via console
      const { runId: _runId, nodeId: _nodeId, ports: _ports, assets: _assets, timeoutMs: _tms } = ev;
      // Stocker le count dans le badge
      const _job = _wfdFindJob(_runId, _nodeId);
      if (_job && _job.nodes[_nodeId]) {
        _job.nodes[_nodeId].count = (_assets || []).length;
        _job.nodes[_nodeId].status = 'warn';
      }
      _wfdUpdateBadgeCount(_nodeId, (_assets || []).length);
      wfdRunPanelOpen(_runId, _nodeId, { ports:_ports || [], assets:_assets || [], timeoutMs:_tms || null, ctxSnapshot:ev.ctxSnapshot || null });
      break;
    }

    case 'flux:end': {
      // Nettoyer les jobs live orphelins pour ce flux
      // Mais conserver les jobs failed en attente d'action opérateur
      Object.keys(_wfdJobs.live).forEach(key => {
        if (_wfdJobs.live[key].fluxId === fluxId) {
          const job = _wfdJobs.live[key];
          if (job._waitingOperator) return; // laisser l'opérateur archiver
          if (job.status === 'running') {
            job.status = ev.status || 'success';
            job.endedAt = Date.now();
            job.duration = job.endedAt - job.startedAt;
            _wfdJobs.history.unshift({ ...job });
            _persistHistory();
          }
          delete _wfdJobs.live[key];
        }
      });
      // Remettre le bouton Exécuter si bloqué
      const _runBtn = document.getElementById('btn-flux-run');
      if (_runBtn && _runBtn.disabled) {
        _runBtn.textContent = '▶ Exécuter';
        _runBtn.disabled = false;
      }
      _wfdUpdateLiveBadge();
      _wfdRenderJobsPanel();
      peuplerSelectFlux();
      break;
    }

    case 'node:timeout': {
      wfdRunPanelClose();
      break;
    }

    case 'end': {
      // Chercher aussi par fluxId si runId absent
      const job = _wfdFindJob(runId, fluxId)
        || Object.values(_wfdJobs.live).find(j => j.fluxId === fluxId);
      if (!job) break;
      job.status    = status || 'success';
      job.endedAt   = Date.now();
      job.duration  = job.endedAt - job.startedAt;
      // Archiver dans l'historique
      _wfdJobs.history.unshift({ ...job });
      _persistHistory();
      if (job.status === 'failed') {
        // Job en erreur — reste dans le live jusqu'à action explicite de l'opérateur
        // La carte affiche le bouton Annuler/Archiver
        job._waitingOperator = true;
        _wfdRenderJobCard(job);
      } else {
        // Succès — archivage automatique après 3s
        setTimeout(() => {
          delete _wfdJobs.live[job.runId || runId];
          _wfdCleanBadges(fluxId);
          _wfdUpdateLiveBadge();
          _wfdRenderJobsPanel();
        }, 3000);
        _wfdRenderJobCard(job);
      }
      _wfdUpdateLiveBadge();
      break;
    }
  }
}

function _wfdFindJob(runId, fluxId) {
  if (runId && _wfdJobs.live[runId]) return _wfdJobs.live[runId];
  // Fallback : chercher par fluxId le dernier job en cours
  return Object.values(_wfdJobs.live).find(j => j.fluxId === fluxId) || null;
}

// ── Badges sur le canvas ──────────────────────────────────────────────────────
function _wfdGetNodeEl(nodeId) {
  return document.getElementById('wfd-node-' + nodeId);
}

function _wfdShowBadge(nodeId, state) {
  const el = _wfdGetNodeEl(nodeId);
  if (!el) return;
  _wfdRemoveBadgeEl(nodeId);

  const layer = document.getElementById('wfd-nodes-layer');
  if (!layer) return;

  const badge = document.createElement('div');
  badge.id = 'wfd-badge-' + nodeId;
  badge.className = 'wfd-job-badge ' + state + ' entering';
  badge.style.left = (el.offsetLeft + el.offsetWidth / 2 - 12) + 'px';
  badge.style.top  = (el.offsetTop - 20) + 'px';
  badge.innerHTML  = _wfdBadgeIcon(state, nodeId);
  // Double-clic → ouvrir Run Panel pour ce nœud
  badge.title = 'Double-cliquez pour voir les assets en attente';
  badge.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    // Chercher si ce nœud est suspendu
    const job = Object.values(_wfdJobs.live).find(j => j.nodes[nodeId]);
    if (job) {
      window.WfdEngineInstance?.getPaused?.().then(paused => {
        const p = paused?.find(p => p.nodeId === nodeId);
        if (p) wfdRunPanelOpen(p.runId, p.nodeId, { ports:p.ports||[], assets:p.assets||[], timeoutMs:p.timeoutMs, ctxSnapshot:p.ctxSnapshot||null });
        else wfdRunPanelOpen(job.runId, nodeId, { ports:[], assets:[], timeoutMs:null });
      }).catch(() => wfdRunPanelOpen(job.runId, nodeId, { ports:[], assets:[], timeoutMs:null }));
    }
  });
  badge.style.cursor = 'pointer';
  layer.appendChild(badge);
  _wfdJobs.badges[nodeId] = badge;

  setTimeout(() => badge.classList.remove('entering'), 200);
}

function _wfdMoveBadge(nodeId, state, stay = false, count = null) {
  const badge = _wfdJobs.badges[nodeId];
  if (!badge) { _wfdShowBadge(nodeId, state); return; }
  badge.className = 'wfd-job-badge ' + state + ' transit';
  badge.innerHTML = count !== null ? String(count) : _wfdBadgeIcon(state, nodeId);
  setTimeout(() => { if (badge) badge.classList.remove('transit'); }, 350);
  if (!stay) _wfdRemoveBadge(nodeId, 1500);
}

function _wfdRemoveBadge(nodeId, delay = 0) {
  setTimeout(() => _wfdRemoveBadgeEl(nodeId), delay);
}

function _wfdRemoveBadgeEl(nodeId) {
  const badge = _wfdJobs.badges[nodeId];
  if (!badge) return;
  badge.classList.add('exiting');
  setTimeout(() => { badge.remove(); delete _wfdJobs.badges[nodeId]; }, 200);
}

function _wfdCleanBadges(fluxId) {
  // Nettoyer les badges qui n'appartiennent pas à des jobs actifs
  Object.keys(_wfdJobs.badges).forEach(nid => {
    const hasActive = Object.values(_wfdJobs.live).some(j => j.fluxId === fluxId && j.nodes[nid]?.status === 'running');
    if (!hasActive) _wfdRemoveBadgeEl(nid);
  });
}

// Compteur de jobs par nœud — combien d'assets sont sur ce nœud
function _wfdGetNodeCount(nodeId) {
  let count = 0;
  Object.values(_wfdJobs.live).forEach(job => {
    if (job.nodes[nodeId]) count++;
  });
  return count || 1;
}

function _wfdUpdateBadgeCount(nodeId, count) {
  const badge = _wfdJobs.badges[nodeId];
  if (!badge) return;
  if (count <= 0) {
    // Plus d'assets en attente — retirer le badge
    _wfdRemoveBadge(nodeId, 300);
  } else {
    badge.innerHTML = String(count);
  }
}

function _wfdBadgeIcon(state, nodeId) {
  const count = nodeId ? _wfdGetNodeCount(nodeId) : 1;
  return String(count);
}

// ── Rendu panel ───────────────────────────────────────────────────────────────
function _wfdRenderJobsPanel() {
  _wfdRenderLive();
  _wfdRenderHistory();
}

function _wfdRenderLive() {
  const list  = document.getElementById('wfd-jobs-live-list');
  const empty = document.getElementById('wfd-jobs-live-empty');
  if (!list) return;
  const jobs  = Object.values(_wfdJobs.live);
  if (empty) empty.style.display = jobs.length ? 'none' : 'block';
  jobs.forEach(job => {
    let card = document.getElementById('wfd-jobcard-' + job.runId);
    if (!card) {
      card = document.createElement('div');
      card.id = 'wfd-jobcard-' + job.runId;
      list.prepend(card);
    }
    _wfdRenderJobCardEl(card, job);
  });
}

function _wfdRenderJobCard(job) {
  const card = document.getElementById('wfd-jobcard-' + job.runId);
  if (card) _wfdRenderJobCardEl(card, job);
  else _wfdRenderLive();
}

function _wfdRenderJobCardEl(card, job) {
  const elapsed = job.endedAt
    ? ((job.endedAt - job.startedAt)/1000).toFixed(1) + 's'
    : ((Date.now() - job.startedAt)/1000).toFixed(0) + 's…';
  const statusIcon = { running:'⚙', success:'🟢', partial:'🟡', failed:'🔴' }[job.status] || '⚙';
  const statusColor = { running:'#3498db', success:'#27ae60', partial:'#e67e22', failed:'#c0392b' }[job.status] || '#3498db';

  const flux = wfdFlows?.find(f => f.id === job.fluxId);
  const fluxName = flux?.name || job.fluxName || job.fluxId?.slice(0,16);

  // Trail des nœuds
  const trail = (job.nodeOrder || []).map(nid => {
    const n = job.nodes[nid];
    const cls = n?.status === 'running' ? 'running' : n?.status === 'error' ? 'error' : n?.status === 'warn' ? 'warn' : 'done';
    // done-alt = port alternatif (ex: Decision → ID Présent) — traité comme done visuellement
    return `<span class="wfd-job-node-chip ${cls}">${n?.name || nid.slice(0,8)}</span>`;
  }).join('<span style="color:#333;font-size:9px;">→</span>');

  card.className = 'wfd-job-card ' + (job.status || 'running');
  card.innerHTML = `
    <div class="wfd-job-card-header">
      <span style="font-size:14px;">${statusIcon}</span>
      <span style="font-weight:600;color:#fff;flex:1;">${escHtml(fluxName)}</span>
      <span style="color:#555;font-family:var(--font-mono);">${elapsed}</span>
      ${job.status === 'running'
        ? `<button class="wfd-job-cancel-btn" title="Forcer la fin" onclick="wfdJobCancel('${job.runId}', event)">✕</button>`
        : job._waitingOperator
          ? `<button class="wfd-job-cancel-btn" style="border-color:#555;color:#555;" title="Archiver" onclick="wfdJobArchive('${job.runId}', event)">↓</button>`
          : ''}
    </div>
    ${job.errors.length ? `<div style="font-size:10px;color:#e74c3c;margin-bottom:4px;">⚠ ${escHtml(job.errors[job.errors.length-1]?.message||'')}</div>` : ''}
    <div class="wfd-job-node-trail">${trail || '<span style="color:#444;font-size:9px;">démarrage…</span>'}</div>`;
}

function _wfdRenderHistory() {
  const list  = document.getElementById('wfd-jobs-history-list');
  const count = document.getElementById('wfd-jobs-history-count');
  if (!list) return;
  if (count) count.textContent = _wfdJobs.history.length + ' run(s)';
  list.innerHTML = _wfdJobs.history.slice(0, 100).map(job => {
    const dur  = job.duration ? (job.duration/1000).toFixed(1)+'s' : '—';
    const date = job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : '';
    const statusIcon = { success:'🟢', partial:'🟡', failed:'🔴' }[job.status] || '⚪';
    const flux = wfdFlows?.find(f => f.id === job.fluxId);
    const name = flux?.name || job.fluxName || job.fluxId?.slice(0,16);
    const err  = job.errors?.[0]?.message || '';
    return `<div class="wfd-job-card ${job.status}" style="cursor:pointer;"
        onclick="wfdJobShowDetail('${job.runId}')">
      <div class="wfd-job-card-header">
        <span>${statusIcon}</span>
        <span style="font-weight:600;color:#fff;flex:1;">${escHtml(name)}</span>
        <span style="color:#555;font-family:var(--font-mono);font-size:10px;">${date} · ${dur}</span>
      </div>
      ${err ? `<div style="font-size:10px;color:#e74c3c;margin-top:2px;">${escHtml(err.slice(0,60))}</div>` : ''}
      <div class="wfd-job-node-trail">${(job.nodeOrder||[]).map(nid=>{
        const n=job.nodes[nid],cls=n?.status==='error'?'error':n?.status==='warn'?'error':'done';
        return `<span class="wfd-job-node-chip ${cls}">${escHtml(n?.name||nid.slice(0,8))}</span>`;
      }).join('<span style="color:#333;font-size:9px;">→</span>')}</div>
    </div>`;
  }).join('') || '<div style="color:#444;font-size:12px;text-align:center;padding:24px;">Aucun historique</div>';
}


// ── Annuler / forcer la fin d'un job live ────────────────────────────────────
// Cherche tous les nœuds suspendus pour ce runId et les rejette,
// puis marque le job comme terminé en erreur dans l'UI.
// ── Archiver manuellement un job en erreur ────────────────────────────────────
function wfdJobArchive(runId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const job = _wfdJobs.live[runId];
  if (!job) return;
  delete _wfdJobs.live[runId];
  _wfdCleanBadges(job.fluxId);
  _wfdUpdateLiveBadge();
  _wfdRenderJobsPanel();
}

async function wfdJobCancel(runId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (!confirm('Forcer la fin de ce run ?\nLes nœuds suspendus seront rejetés.')) return;

  const engine = window.WfdEngineInstance || window.wfdEngine;
  if (!engine) { alert('Engine non disponible'); return; }

  // Récupérer les nœuds suspendus pour ce run
  try {
    const paused = await engine.getPaused();
    const forThisRun = (paused || []).filter(p => p.runId === runId);
    if (forThisRun.length) {
      for (const p of forThisRun) {
        await engine.rejectNode(runId, p.nodeId, 'Annulé par opérateur');
      }
    } else {
      // Aucun nœud suspendu connu — forcer via rejectNode avec nodeId générique
      // (l'engine nettoiera les entrées orphelines)
      await engine.rejectNode(runId, '', 'Annulé par opérateur');
    }
  } catch(e) {
    console.warn('[WFD] wfdJobCancel erreur :', e.message);
  }

  // Mettre à jour l'UI immédiatement
  const job = _wfdJobs.live[runId];
  if (job) {
    job.status   = 'failed';
    job.endedAt  = Date.now();
    job.duration = job.endedAt - job.startedAt;
    job.errors.push({ node: 'Opérateur', message: 'Annulé manuellement', severity: 'fatal' });
    _wfdJobs.history.unshift({ ...job });
    delete _wfdJobs.live[runId];
    const card = document.getElementById('wfd-jobcard-' + runId);
    if (card) card.remove();
    _wfdRenderLive();
    _wfdRenderHistory();
    _wfdUpdateJobsBadge();
  }
}

function wfdJobShowDetail(runId) {
  const job = _wfdJobs.history.find(j => j.runId === runId);
  if (!job) return;
  const flux = wfdFlows?.find(f => f.id === job.fluxId);
  const name = flux?.name || job.fluxName || job.fluxId;
  const dur  = job.duration ? (job.duration/1000).toFixed(2)+'s' : '—';
  const errs = (job.errors||[]).map(e =>
    `  • [${e.severity}] ${e.nodeId?.slice(0,8)}: ${e.message}`
  ).join('\n');
  alert(`Run : ${name}\nStatut : ${job.status}\nDurée : ${dur}\nNœuds : ${job.nodeOrder?.length||0}\n${errs ? '\nErreurs :\n'+errs : ''}`);
}

function _wfdUpdateLiveBadge() {
  const badge = document.getElementById('wfd-jobs-live-badge');
  const btn   = document.getElementById('wfd-jobs-btn');
  const count = Object.keys(_wfdJobs.live).length;
  if (badge) {
    badge.textContent  = count + ' actif(s)';
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
  if (btn) {
    btn.style.color = count > 0 ? '#c39bd3' : '#9b59b6';
    btn.textContent = count > 0 ? '⚡ Jobs (' + count + ')' : '⚡ Jobs';
  }
}

function _persistHistory() {
  try { localStorage.setItem('wfdJobsHistory', JSON.stringify(_wfdJobs.history.slice(0, 500))); } catch(_) {}
}

// ── Démarrer l'écoute des événements engine ───────────────────────────────────
// ── WfdEngineInstance en mode Express (SSE + fetch) ──────────────────────────
function _initWfdEngineExpress() {
  const _eventCallbacks = [];
  let   _sseSource = null;

  function _connectSSE() {
    if (_sseSource) { try { _sseSource.close(); } catch(_) {} }
    _sseSource = new EventSource('/wfd/events');
    _sseSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        _eventCallbacks.forEach(fn => { try { fn(data); } catch(_) {} });
      } catch(_) {}
    };
    _sseSource.onerror = () => { setTimeout(_connectSSE, 3000); };
    console.log('[WFD Express] SSE connecté');
  }

  async function _apiFetch(path, method, body) {
    method = method || 'GET';
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
  }

  window.WfdEngineInstance = {
    loadFluxes    : (fluxes)      => _apiFetch('/wfd/load-fluxes',    'POST', { fluxes }),
    loadConnexions: (connexions)  => _apiFetch('/wfd/load-connexions', 'POST', { connexions }),
    activateFlux  : (fluxId)      => _apiFetch('/wfd/activate/'   + fluxId, 'POST'),
    deactivateFlux: (fluxId)      => _apiFetch('/wfd/deactivate/' + fluxId, 'POST'),
    triggerManual : (fluxId, payload) => _apiFetch('/wfd/trigger-manual', 'POST', { fluxId, payload }),
    setIconikClient: (cfg)        => _apiFetch('/wfd/set-iconik-client', 'POST', cfg),
    getStatus     : ()            => _apiFetch('/wfd/status'),
    getPaused     : ()            => _apiFetch('/wfd/paused'),
    releaseNode   : (runId, nodeId, port, ids) =>
      _apiFetch('/wfd/release-node', 'POST', { runId, nodeId, port, assetIds: ids }),
    rejectNode    : (runId, nodeId, reason) =>
      _apiFetch('/wfd/reject-node',  'POST', { runId, nodeId, reason }),
    getRunHistory  : (runId)         => _apiFetch('/wfd/runs/' + runId),
    getRunsByFlux  : (fluxId, limit) => _apiFetch('/wfd/runs-by-flux/' + fluxId + '?limit=' + (limit||50)),
    getRunsByNode  : (nodeId, limit) => _apiFetch('/wfd/runs-by-node/' + nodeId + '?limit=' + (limit||50)),
    getRecentRuns  : (limit)         => _apiFetch('/wfd/recent-runs?limit=' + (limit||100)),
    deleteRun      : (runId)         => _apiFetch('/wfd/runs/' + runId, 'DELETE'),
    onEvent: (callback) => {
      _eventCallbacks.push(callback);
      return () => {
        const i = _eventCallbacks.indexOf(callback);
        if (i >= 0) _eventCallbacks.splice(i, 1);
      };
    },
    watchFolder   : () => Promise.resolve({ ok: false }),
    reloadHandlers: () => Promise.resolve({ ok: false }),
    readAsBase64  : () => Promise.resolve({ ok: false }),
    parseOpenApi  : () => Promise.resolve({ ok: false }),
  };

  _connectSSE();
  console.log('[WFD Express] WfdEngineInstance initialisé');
}

(function _initJobsListener() {
  if (!window.WfdEngineInstance?.onEvent) {
    if (!window._wfdExpressInit) {
      window._wfdExpressInit = true;
      _initWfdEngineExpress();
    }
    setTimeout(_initJobsListener, 500);
    return;
  }
  window.WfdEngineInstance.onEvent(function(ev) {
    _wfdHandleEngineEvent(ev);
    // Notifier le Run Panel pour mise à jour live
    if (window.wfdRunPanelHandleEvent) window.wfdRunPanelHandleEvent(ev.type, ev);
  });
  console.log('[WFD Jobs] Listener démarré');
  // Envoyer les connexions sortantes à l'engine
  if (window.WfdEngineInstance.loadConnexions) {
    window.WfdEngineInstance.loadConnexions(
      (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).filter(c => c.direction === 'outbound')
    ).catch(() => {});
  }
  // Vérifier si des nœuds sont déjà suspendus (redémarrage / rechargement)
  if (window.WfdEngineInstance.getPaused) {
    window.WfdEngineInstance.getPaused().then(function(paused) {
      if (paused && paused.length > 0) {
        const p = paused[0];
        console.log('[WFD Jobs] Nœud suspendu trouvé au démarrage :', p.nodeId);
        wfdRunPanelOpen(p.runId, p.nodeId, { ports:p.ports||[], assets:p.assets||[], timeoutMs:p.timeoutMs||null, ctxSnapshot:p.ctxSnapshot||null });
      }
    }).catch(function(){});
  }
})();


// ════════════════════════════════════════════════════════════════════════════
function wfdToggleFlux() {
  // stub — remplacé par wfd-config-panel.js
}
function wfdUpdateToggleBtn() {
  // stub — remplacé par wfd-config-panel.js
}
// _read* functions — stubs no-op retournant {} jusqu'au chargement de wfd-config-panel.js
// IMPORTANT : ne pas déléguer vers window.X sinon boucle infinie (le stub s'appelle lui-même)
// wfd-config-panel.js remplace directement ces fonctions via window.X = realFn
function _readRelateConfig(p)     { return {}; }
function _readSubflowConfig(p)    { return {}; }
function _readExportFileConfig(p) { return {}; }
function _readPublishConfig(p)    { return {}; }
function _readNotifyPostConfig(p) { return {}; }
function _readTranscodeConfig(p)  { return {}; }
function _readAclConfig(p)        { return {}; }
function _readUpdateMetaConfig(p) { return {}; }
function _readLinkFileConfig(p)   { return {}; }
function lirePortsScript(p)       { return []; }

// Brancher ouvrirConfigPanel / fermerConfigPanel sur le dimming
// (appelé après chargement de wfd-config-panel.js)
// [wrapper ouvrirConfigPanel supprimé — géré directement dans wfd-config-panel.js]

// Logs panel — rendu des entrées (bridge vers WFDLog si disponible)
function wfdLogFilter(level, btn) {
  document.querySelectorAll('.wfd-log-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Déléguer à WFDLog si disponible
  if (typeof WFDLog !== 'undefined' && typeof WFDLog.filtrer === 'function') {
    WFDLog.filtrer(level);
  }
}


// ══ QUICK ACCESS VARIABLES ═══════════════════════════════════════════════════

let _varsPanel = { open: false, scope: 'all', filter: '', lastRun: null };

function wfdToggleVarsPanel() {
  const panel = document.getElementById('wfd-vars-panel');
  const btn   = document.getElementById('btn-vars-panel');
  if (!panel) return;
  _varsPanel.open = !_varsPanel.open;
  panel.classList.toggle('open', _varsPanel.open);
  if (btn) btn.classList.toggle('active', _varsPanel.open);
  if (_varsPanel.open) {
    _wfdRenderVarsPanel();
    // Stopper la propagation de la molette vers le canvas
    panel.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  }
}

function wfdVarScope(btn, scope) {
  _varsPanel.scope = scope;
  document.querySelectorAll('.wfd-var-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _wfdRenderVarsPanel();
}

function wfdVarsFilter(val) {
  _varsPanel.filter = (val || '').toLowerCase();
  _wfdRenderVarsPanel();
}

// Calcule les nœuds en amont du nœud sélectionné (BFS inversé)
function _wfdGetUpstreamNodeIds(flux, targetNodeId) {
  if (!flux || !targetNodeId) return new Set();
  const upstream = new Set();
  const queue = [targetNodeId];
  while (queue.length) {
    const cur = queue.shift();
    (flux.connections || []).forEach(c => {
      if (c.toNode === cur && !upstream.has(c.fromNode)) {
        upstream.add(c.fromNode);
        queue.push(c.fromNode);
      }
    });
  }
  return upstream;
}

// Retourne les variables connues d'un flux avec leur origine et dernière valeur
function _wfdCollectVars(flux, upstreamIds, lastRunNodes) {
  const vars = {};

  // Variables système toujours disponibles
  const systemVars = [
    { name: 'asset.id',    type: 'string', origin: 'Système', system: true },
    { name: 'asset.title', type: 'string', origin: 'Système', system: true },
    { name: 'asset_id',    type: 'string', origin: 'Système', system: true },
    { name: 'run.id',      type: 'string', origin: 'Système', system: true },
  ];
  systemVars.forEach(v => { vars[v.name] = { ...v, value: null }; });

  // Variables produites par les nœuds (config statique)
  (flux.nodes || []).forEach(node => {
    const cfg = node.config || {};
    const isUpstream = upstreamIds.has(node.id);
    const fam = node.family;

    const addVar = (name, type, value) => {
      if (!name) return;
      if (!vars[name]) vars[name] = { name, type: type||'string', origin: node.name||fam, nodeId: node.id, upstream: isUpstream, value: null };
      if (value !== undefined && value !== null) vars[name].value = value;
      if (isUpstream) vars[name].upstream = true;
    };

    // Fetch → storeAs + variables de métadonnées Iconik (via withMetadata)
    if (fam === 'fetch' && (cfg.storeAs || cfg.resultVar)) {
      addVar(cfg.storeAs || cfg.resultVar, 'object');
      // Si le Fetch récupère des métadonnées, ajouter toutes les variables MD connues
      if (cfg.withMetadata || cfg.fetchSubType === 'metadata') {
        const mdFields = (typeof wfdData !== 'undefined' ? wfdData.metadata || [] : []);
        mdFields.forEach(m => {
          const fieldName = m.nom || m.name || '';
          if (fieldName) addVar(fieldName, 'string');
        });
        // Variables techniques issues de withFormats
        if (cfg.withFormats) {
          ['duration','video_quality','container','fps','width','height',
           'video_codec','chroma','bit_depth','audio_tracks','audio_codec',
           'bitrate','file_size'].forEach(k => addVar(k, 'string'));
        }
      }
    }
    // set_var → assignments
    if (fam === 'set_var') {
      (cfg.assignments || []).forEach(a => { if (a.key) addVar(a.key, 'string'); });
    }
    // id_generator → varName
    if (fam === 'id_generator' && cfg.varName) {
      addVar(cfg.varName, cfg.idType === 'numeric' ? 'integer' : 'string');
    }
    // script → vars définis dans resultVar
    if (fam === 'script' && cfg.resultVar) addVar(cfg.resultVar, 'string');
    // lookup → lkOutputVar
    if (fam === 'lookup' && cfg.lkOutputVar) addVar(cfg.lkOutputVar, 'object');
    // http_request → resultVar selon le mode
    if (fam === 'http_request') {
      if (cfg.actionId) {
        const conn = wfdConnexions.find(c => c.id === cfg.connexionId);
        const action = conn?.actions?.find(a => a.id === cfg.actionId);
        if (action?.resultVar) addVar(action.resultVar, 'object');
      }
      if (cfg.resultVar)   addVar(cfg.resultVar,   'object');
      if (cfg.feResultVar) addVar(cfg.feResultVar, 'array');
    }
    // http_sequence → une variable par étape
    if (fam === 'http_sequence') {
      (cfg.steps || []).forEach(function(step) {
        if (step.resultVar) addVar(step.resultVar, 'object');
        if (step.feResultVar) addVar(step.feResultVar, 'array');
      });
    }
  });

  // Enrichir avec les valeurs du dernier run
  if (lastRunNodes) {
    // Prendre le snapshot le plus récent (dernier nœud exécuté)
    const snapshots = lastRunNodes
      .filter(n => n.snapshot?.vars)
      .sort((a, b) => new Date(b.endedAt||0) - new Date(a.endedAt||0));
    if (snapshots.length) {
      const latestVars = snapshots[0].snapshot.vars;
      Object.entries(latestVars).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (!vars[k]) vars[k] = { name: k, type: typeof v, origin: 'Run', upstream: false, value: null };
        vars[k].value = v;
        vars[k].lastRunValue = v;
      });
    }
  }

  return vars;
}

async function _wfdRenderVarsPanel() {
  const body = document.getElementById('wfd-vars-body');
  if (!body) return;

  const flux = getFluxCourant();
  if (!flux) {
    body.innerHTML = '<div class="wfd-var-empty">Aucun flux sélectionné</div>';
    return;
  }

  // Récupérer le dernier run si scope = 'last'
  let lastRunNodes = null;
  if (_varsPanel.scope === 'last' || _varsPanel.scope === 'all') {
    try {
      const runs = await WfdEngineInstance.getRunsByFlux(flux.id, 1);
      if (runs?.length) {
        const run = await WfdEngineInstance.getRunHistory(runs[0].runId);
        lastRunNodes = run?.nodes || runs[0]?.nodes || null;
      }
    } catch(_) {}
  }

  const upstreamIds = _wfdGetUpstreamNodeIds(flux, selectedNodeId);
  const allVars = _wfdCollectVars(flux, upstreamIds, lastRunNodes);

  // Filtrer selon scope
  let filtered = Object.values(allVars);
  if (_varsPanel.scope === 'upstream') filtered = filtered.filter(v => v.upstream || v.system);
  if (_varsPanel.scope === 'last')     filtered = filtered.filter(v => v.lastRunValue !== undefined);
  if (_varsPanel.filter) filtered = filtered.filter(v => v.name.toLowerCase().includes(_varsPanel.filter));

  if (!filtered.length) {
    body.innerHTML = '<div class="wfd-var-empty">Aucune variable trouvée</div>';
    return;
  }

  // Grouper : système / en amont / autres
  const groups = {
    system  : { label: '⚙ Système',      items: [] },
    upstream: { label: '⬆ En amont du nœud sélectionné', items: [] },
    other   : { label: '◦ Autres variables du flux', items: [] },
  };
  filtered.forEach(v => {
    if (v.system)        groups.system.items.push(v);
    else if (v.upstream) groups.upstream.items.push(v);
    else                 groups.other.items.push(v);
  });

  const typeIcon = t => ({ object:'{}', array:'[]', integer:'#', string:'""', boolean:'✓' }[t] || '·');
  const fmtVal   = v => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 30 ? s.slice(0, 28) + '…' : s;
  };

  let html = '';
  Object.values(groups).forEach(group => {
    if (!group.items.length) return;
    html += `<div class="wfd-var-group">
      <div class="wfd-var-group-title">${group.label}</div>`;
    group.items.sort((a,b) => a.name.localeCompare(b.name)).forEach(v => {
      const cls = [
        'wfd-var-row',
        v.upstream ? 'upstream' : '',
        !v.value && !v.lastRunValue ? 'no-value' : '',
      ].filter(Boolean).join(' ');
      const displayVal = v.lastRunValue !== undefined ? fmtVal(v.lastRunValue) : (v.value ? fmtVal(v.value) : '');
      html += `<div class="${cls}"
        onclick="wfdVarCopy('${v.name}')"
        title="Cliquer pour copier {${v.name}}\nOrigine : ${v.origin||'?'}">
        <span class="wfd-var-type">${typeIcon(v.type)}</span>
        <span class="wfd-var-name">{${v.name}}</span>
        ${displayVal ? `<span class="wfd-var-value">${displayVal}</span>` : ''}
        <span class="wfd-var-origin">${v.origin||''}</span>
      </div>`;
    });
    html += '</div>';
  });

  body.innerHTML = html;

  // Titre contextuel
  const titleEl = document.querySelector('#wfd-vars-panel span[style*="1abc9c"]');
  if (titleEl && selectedNodeId) {
    const node = flux.nodes.find(n => n.id === selectedNodeId);
    titleEl.textContent = node ? `{x} ← ${node.name}` : '{x} Variables';
  }
}

function wfdVarCopy(varName) {
  const text = '{' + varName + '}';
  navigator.clipboard.writeText(text).then(() => {
    // Flash visuel sur la ligne cliquée
    const rows = document.querySelectorAll('.wfd-var-row');
    rows.forEach(r => {
      if (r.querySelector('.wfd-var-name')?.textContent === text) {
        r.style.background = '#0d2a20';
        setTimeout(() => r.style.background = '', 600);
      }
    });
    toast('Copié : ' + text);
  }).catch(() => toast('{' + varName + '}'));
}

// Rafraîchir le panneau quand on sélectionne un nœud (via event dispatché par ouvrirConfigPanel)
document.addEventListener('wfd:node-selected', () => {
  if (_varsPanel.open) _wfdRenderVarsPanel();
});


// ══ FIN NOUVEAU UI ══════════════════════════════════════════════

// ── Chargement données Iconik ────────────────────────────────
function chargerIconikData() {
  const g = (key, prop) => (JSON.parse(localStorage.getItem(key)||'null')||{})[prop]||[];

  // Lire les données live par environnement si disponibles (plus récentes que Settings)
  const flux    = getFluxCourant && getFluxCourant();
  const envName = flux?.iconikEnv || document.getElementById('wfd-env-select')?.value || '';
  const liveKey = envName ? 'wfdLiveData_' + envName : null;
  const live    = liveKey ? (JSON.parse(localStorage.getItem(liveKey)||'null') || null) : null;

  const gl = (liveProp, fallbackKey, fallbackProp) =>
    (live && live[liveProp]?.length) ? live[liveProp] : g(fallbackKey, fallbackProp);

  wfdData = {
    automations  : gl('automations',   'automationsData',   'automations'),
    webhooks     : gl('webhooks',       'webhooksData',      'webhooks'),
    customActions: (gl('customActions', 'customActionsData', 'customActions') || []).map(a => ({
      ...a,
      // Normaliser : certains stockages utilisent 'nom', l'API Iconik utilise 'title'
      title: a.title || a.nom || a.name || a.id,
      nom  : a.nom   || a.title || a.name || a.id,
    })),
    teams        : g('teamsData',       'teams'),
    collections  : gl('collections',    'collectionsData',   'collections'),
    mdViews      : gl('mdViews',        'metadataViewsData', 'metadataViews'),
    metadata     : gl('metadata',       'metadonneesData',   'metadonnees'),
    storages        : g('storagesData',       'storages'),
    savedSearches   : gl('savedSearches',  'savedSearchesData', 'savedSearches'),
    exportLocations : gl('exportLocations', 'exportLocationsData', 'exportLocations'),
  };

  // P3 fix 2026-06-28 — si pas de live data, charger snapshot DB en async
  if (!live) _wfdChargerSnapshotDB(envName);
}

// P3 fix 2026-06-28 — charger wfdData depuis snapshot DB si pas de live data
function _wfdChargerSnapshotDB(envName) {
  const envs = (typeof appTokensData !== 'undefined' && appTokensData.appTokens) ? appTokensData.appTokens : [];
  const env  = envs.find(e => e.name === envName) || envs.find(e => e.isDefault) || envs[0];
  if (!env) return;
  const slug = env.environment || env.type || 'qa';
  fetch(_APS_BASE + '/api/ikon/snapshot/' + slug)
    .then(r => r.ok ? r.json() : null)
    .then(snap => {
      if (!snap) return;
      if (snap.teams           && snap.teams.length)           wfdData.teams           = snap.teams;
      if (snap.collections     && snap.collections.length)     wfdData.collections     = snap.collections;
      if (snap.metadataViews   && snap.metadataViews.length)   wfdData.mdViews         = snap.metadataViews;
      if (snap.metadonnees     && snap.metadonnees.length)     wfdData.metadata        = snap.metadonnees;
      if (snap.savedSearches   && snap.savedSearches.length)   wfdData.savedSearches   = snap.savedSearches;
      if (snap.exportLocations && snap.exportLocations.length) wfdData.exportLocations = snap.exportLocations;
      if (snap.automations     && snap.automations.length)     wfdData.automations     = snap.automations;
      if (snap.customActions   && snap.customActions.length)   wfdData.customActions   = snap.customActions.map(a => ({
        ...a, title: a.title || a.nom || a.name || a.id, nom: a.nom || a.title || a.name || a.id,
      }));
      if (snap.storages        && snap.storages.length)        wfdData.storages        = snap.storages;
      console.log('[WFD] wfdData peuplé depuis snapshot DB (' + slug + ')');
      if (typeof renderCanvas === 'function') renderCanvas();
    })
    .catch(e => console.warn('[WFD] snapshot DB indisponible:', e.message));
}

// ── Actualisation globale depuis l'API Iconik ─────────────────────────────────
async function wfdRefreshAllData(opts) {
  const silent  = opts?.silent || false;
  const btn     = document.getElementById('btn-refresh-data');
  const flux    = getFluxCourant();
  const envName = flux?.iconikEnv || document.getElementById('wfd-env-select')?.value || '';
  const envs    = getEnvironnements();
  const env     = envs.find(e => e.name === envName) || envs[0];

  if (!env) { if (!silent) toast('❌ Aucun environnement sélectionné'); return; }

  if (!silent && btn) { btn.style.transform = 'rotate(360deg)'; btn.disabled = true; }
  if (!silent) toast('⏳ Actualisation depuis ' + env.name + '…');

  // Proxy APS — les appels passent par Express pour éviter les problèmes CORS
  // Le type d'environnement (qa, prod, dev...) est utilisé comme identifiant
  const envType = env.environment || env.type || 'qa';
  const base    = `${_APS_BASE}/api/iconik/${envType}`;

  const calls = [
    { key: 'savedSearches',  url: '/API/search/v1/search/saved/?per_page=200',          prop: 'objects',       nameField: 'name'  },
    { key: 'mdViews',        url: '/API/metadata/v1/views/?per_page=200',               prop: 'objects',       nameField: 'name'  },
    { key: 'metadata',       url: '/API/metadata/v1/fields/?per_page=200',              prop: 'objects',       nameField: 'name'  },
    { key: 'collections',    url: '/API/assets/v1/collections/?per_page=200',           prop: 'objects',       nameField: 'title' },
    { key: 'automations',    url: '/API/automations/v1/automations/?per_page=200',      prop: 'objects',       nameField: 'name'  },
    { key: 'customActions',  url: '/API/assets/v1/custom_actions/?per_page=200',        prop: 'objects',       nameField: 'title' },
    { key: 'webhooks',        url: '/API/notifications/v1/webhooks/?per_page=200',       prop: 'objects', nameField: 'name'  },
    { key: 'exportLocations', url: '/API/files/v1/export_locations/?per_page=200',         prop: 'objects', nameField: 'name'  },
  ];

  const live = { _env: envName, _refreshedAt: new Date().toISOString() };
  let success = 0, failed = 0;

  await Promise.allSettled(calls.map(async ({ key, url, prop }) => {
    try {
      const r = await fetch(base + url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      live[key] = d[prop] || [];
      success++;
    } catch(e) {
      console.warn('[WFD Refresh] ' + key + ' : ' + e.message);
      failed++;
    }
  }));

  // Persister par environnement
  localStorage.setItem('wfdLiveData_' + envName, JSON.stringify(live));

  // Mettre à jour wfdData en mémoire immédiatement
  chargerIconikData();

  if (!silent) {
    const msg = '✅ Actualisé depuis ' + env.name
      + ' — ' + success + ' liste(s)'
      + (failed ? ' (' + failed + ' erreur(s))' : '');
    toast(msg);
    if (btn) { setTimeout(() => { btn.style.transform = ''; btn.disabled = false; }, 400); }
  } else {
    if (btn) { btn.style.transform = ''; btn.disabled = false; }
    console.log('[WFD] Refresh silencieux OK — ' + success + ' liste(s), ' + failed + ' erreur(s)');
  }
  // Mettre à jour la bille Iconik
  if (typeof updateIconikDot === 'function') updateIconikDot();
}


// ── Tree browser collections pour WFD ───────────────────────────────────────
function wfdColTree() {
  const cols = wfdData.collections || [];
  const byId = {};
  cols.forEach(c => { byId[c.id] = { ...c, _kids: [] }; });
  const roots = [];
  cols.forEach(c => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id]._kids.push(byId[c.id]);
    else roots.push(byId[c.id]);
  });
  return roots;
}

const wfdColExp = {};

function wfdRenderColTree(roots, selIds, prefix, depth) {
  depth = depth || 0;
  if (!Array.isArray(selIds)) selIds = selIds ? [selIds] : [];
  let h = '';
  (roots||[]).forEach(c => {
    const hasKids = c._kids && c._kids.length > 0;
    const expanded = c.id in wfdColExp ? !!wfdColExp[c.id] : (depth === 0);
    const selected = selIds.includes(c.id);
    const indent   = depth * 14;
    const toggle   = hasKids ? (expanded ? '&#9660;' : '&#9654;') : '<span style="opacity:0">&#183;</span>';
    const folder   = hasKids ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
    const cname    = (c.name||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    h += `<div data-col-id="${c.id}"
      style="display:flex;align-items:center;gap:4px;padding:3px 6px;cursor:pointer;border-radius:3px;font-size:11px;${selected?'background:#1a2a1a;color:#5dbb6b;font-weight:600;':''}"
      onclick="wfdColSelect(event,'${prefix}','${c.id}','${cname}')">
      <span style="width:${indent}px;flex-shrink:0;"></span>
      <span style="width:16px;text-align:center;font-size:9px;color:#8899aa;cursor:pointer;"
        onclick="event.stopPropagation();wfdColToggle('${c.id}','${prefix}',${hasKids})">${toggle}</span>
      <span style="user-select:none;">${folder} ${c.name||''}</span>
    </div>`;
    if (hasKids && expanded) h += wfdRenderColTree(c._kids, selIds, prefix, depth + 1);
  });
  return h;
}

function wfdColToggle(id, prefix, hasKids) {
  if (!hasKids) return;
  wfdColExp[id] = !(id in wfdColExp ? wfdColExp[id] : true);
  const tree   = document.getElementById(prefix + '-col-tree');
  const hidden = document.getElementById(prefix + '-col-selected');
  let selIds = [];
  try { selIds = JSON.parse(hidden?.value || '[]'); } catch(e) {}
  if (!Array.isArray(selIds)) selIds = hidden?.value ? [hidden.value] : [];
  if (tree) tree.innerHTML = wfdRenderColTree(wfdColTree(), selIds, prefix, 0);
}

function wfdColSelect(e, prefix, id, name) {
  e.stopPropagation();
  const hidden = document.getElementById(prefix + '-col-selected');
  if (!hidden) return;
  let selIds = [];
  try { selIds = JSON.parse(hidden.value || '[]'); } catch(e) {}
  if (!Array.isArray(selIds)) selIds = [];
  // Toggle : ajouter si absent, retirer si déjà présent
  if (selIds.includes(id)) {
    selIds = selIds.filter(x => x !== id);
  } else {
    selIds.push(id);
  }
  hidden.value = JSON.stringify(selIds);
  _wfdColRefresh(prefix, selIds);
}

function wfdColRemove(prefix, id) {
  const hidden = document.getElementById(prefix + '-col-selected');
  if (!hidden) return;
  let selIds = [];
  try { selIds = JSON.parse(hidden.value || '[]'); } catch(e) {}
  selIds = selIds.filter(x => x !== id);
  hidden.value = JSON.stringify(selIds);
  _wfdColRefresh(prefix, selIds);
}

function _wfdColRefresh(prefix, selIds) {
  const cols = wfdData.collections || [];
  // Refresh tags
  const tagsEl = document.getElementById(prefix + '-col-tags');
  if (tagsEl) {
    tagsEl.innerHTML = selIds.length
      ? selIds.map(id => {
          const col = cols.find(c => c.id === id);
          const name = col ? col.name : id;
          return `<span style="display:inline-flex;align-items:center;gap:4px;background:#1a2a1a;
            color:#5dbb6b;border:1px solid #2d5a2d;border-radius:3px;padding:2px 6px;font-size:10px;">
            📁 ${escHtml(name)}
            <span style="cursor:pointer;color:#888;font-size:11px;line-height:1;"
              onclick="wfdColRemove('${prefix}','${id}')">×</span>
          </span>`;
        }).join('')
      : '<span style="font-size:10px;color:#444;align-self:center;">Aucune collection sélectionnée</span>';
  }
  // Refresh arbre (surlignage)
  const tree = document.getElementById(prefix + '-col-tree');
  if (tree) tree.innerHTML = wfdRenderColTree(wfdColTree(), selIds, prefix, 0);
}

function wfdColTreeHtml(prefix, selectedId) {
  // selectedId peut être un tableau JSON ou un ID simple (compat legacy)
  let selIds = [];
  try { selIds = JSON.parse(selectedId || '[]'); } catch(e) {}
  if (!Array.isArray(selIds)) selIds = selectedId ? [selectedId] : [];

  const cols  = wfdData.collections || [];
  const roots = wfdColTree();

  const tagsHtml = selIds.map(id => {
    const col = cols.find(c => c.id === id);
    const name = col ? col.name : id;
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:#1a2a1a;
      color:#5dbb6b;border:1px solid #2d5a2d;border-radius:3px;padding:2px 6px;font-size:10px;">
      📁 ${escHtml(name)}
      <span style="cursor:pointer;color:#888;font-size:11px;line-height:1;"
        onclick="wfdColRemove('${prefix}','${id}')">×</span>
    </span>`;
  }).join('');

  return `<div>
    <input type="hidden" id="${prefix}-col-selected" value="${escHtml(JSON.stringify(selIds))}">
    <div id="${prefix}-col-tags"
      style="display:flex;flex-wrap:wrap;gap:4px;min-height:24px;margin-bottom:6px;">
      ${tagsHtml || '<span style="font-size:10px;color:#444;align-self:center;">Aucune collection sélectionnée</span>'}
    </div>
    <div id="${prefix}-col-tree"
      style="max-height:200px;overflow-y:auto;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:4px;padding:4px 0;">
      ${wfdRenderColTree(roots, selIds, prefix, 0)}
    </div>
  </div>`;
}

// ── Persistance ──────────────────────────────────────────────

// ── Migration : source → watchfolder (fusion v2) ─────────────────────────────
function _migrerSourceVersWatchfolder(fluxes) {
  let migrated = 0;
  (fluxes || []).forEach(flux => {
    (flux.nodes || []).forEach(node => {
      if (node.family === 'source') {
        node.family = 'watchfolder';
        migrated++;
      }
    });
  });
  if (migrated > 0) console.log('[WFD Migration] ' + migrated + ' nœud(s) source → watchfolder');
  return fluxes;
}

// ── Migration config nœuds — normalise les anciennes clés ────────────────────
function _migrerConfigNoeuds(fluxes) {
  (fluxes || []).forEach(flux => {
    (flux.nodes || []).forEach(node => {
      const c = node.config || {};
      // fetch : inférer fetchSubType si absent
      if (node.family === 'fetch' && !c.fetchSubType) {
        if (c.savedSearchId) c.fetchSubType = 'savedsearch';
        else if (c.fetchType === 'collection') c.fetchSubType = 'collection';
        else if (c.fetchTarget === 'metadata' || c.fetchMdView) c.fetchSubType = 'metadata';
        else c.fetchSubType = 'asset';
      }
      // gate : inférer gateMode si absent
      if (node.family === 'gate' && !c.gateMode) {
        if (c.delayMs > 0 && !c.maxConcurrent) c.gateMode = 'delay';
        else if (c.pauseMessage) c.gateMode = 'pause';
        else c.gateMode = 'throttle';
      }
    });
  });
  return fluxes;
}

// ── URL de base du serveur APS ────────────────────────────────
// En mode navigateur : même origine que la page (window.location.origin)
// En mode Electron (file://) : fallback sur localhost:3000
const _APS_BASE = (typeof window !== 'undefined' && window.location.protocol !== 'file:')
  ? window.location.origin
  : 'http://localhost:3000';

async function _chargerEtatDepuisServeur() {
  try {
    const [flows, palNodes, mappings, contacts, scripts, connexions, nommages] = await Promise.all([
      fetch(`${_APS_BASE}/api/flows`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/palnodes`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/mappings`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/contacts`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/scripts`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/connexions`).then(r => r.ok ? r.json() : []),
      fetch(`${_APS_BASE}/api/nommages`).then(r => r.ok ? r.json() : []),
    ]);

    wfdFlows      = _migrerConfigNoeuds(_migrerSourceVersWatchfolder(flows));
    wfdPalNodes   = palNodes;
    wfdMappings   = mappings;
    wfdContacts   = contacts;
    wfdScripts    = scripts;
    wfdConnexions = connexions;
    wfdNommages   = nommages;

    // Mettre à jour le localStorage comme cache local (fallback offline)
    localStorage.setItem('wfdFlows',      JSON.stringify(wfdFlows));
    localStorage.setItem('wfdPalNodes',   JSON.stringify(wfdPalNodes));
    localStorage.setItem('wfdMappings',   JSON.stringify(wfdMappings));
    localStorage.setItem('wfdContacts',   JSON.stringify(wfdContacts));
    localStorage.setItem('wfdScripts',    JSON.stringify(wfdScripts));
    localStorage.setItem('wfdConnexions', JSON.stringify(wfdConnexions));
    localStorage.setItem('wfdNommages',   JSON.stringify(wfdNommages));

    console.log('[APS] Données chargées depuis le serveur');
    return true;
  } catch (err) {
    console.warn('[APS] Serveur inaccessible — fallback localStorage', err);
    return false;
  }
}

async function chargerEtat() {
  // Nettoyer le SVG immédiatement pour éviter les connexions orphelines au premier render
  const _svg   = document.getElementById('wfd-svg');
  const _layer = document.getElementById('wfd-nodes-layer');
  if (_svg)   _svg.innerHTML   = '';
  if (_layer) _layer.innerHTML = '';

  // Ne pas restaurer le flux courant au rechargement — l'utilisateur choisit
  currentFlowId = null;

  // Tenter de charger depuis le serveur
  const ok = await _chargerEtatDepuisServeur();

  // Fallback localStorage si serveur inaccessible
  if (!ok) {
    wfdFlows      = _migrerConfigNoeuds(_migrerSourceVersWatchfolder(JSON.parse(localStorage.getItem('wfdFlows')      || '[]')));
    wfdPalNodes   = JSON.parse(localStorage.getItem('wfdPalNodes')   || '[]');
    wfdMappings   = JSON.parse(localStorage.getItem('wfdMappings')   || '[]');
    wfdContacts   = JSON.parse(localStorage.getItem('wfdContacts')   || '[]');
    wfdScripts    = JSON.parse(localStorage.getItem('wfdScripts')    || '[]');
    wfdConnexions = JSON.parse(localStorage.getItem('wfdConnexions') || '[]');
    wfdNommages   = JSON.parse(localStorage.getItem('wfdNommages')   || '[]');
  }

  // Rafraîchir l'UI après chargement async
  // setTimeout 0 : laisse peuplerPalette() terminer son rendu DOM avant peuplerSelectFlux()
  peuplerPalette();
  setTimeout(() => peuplerSelectFlux(), 0);
}

async function _sauvegarderEtatVersServeur() {
  const entities = [
    { url: `${_APS_BASE}/api/flows`,      data: wfdFlows,      key: 'id' },
    { url: `${_APS_BASE}/api/palnodes`,   data: wfdPalNodes,   key: 'id' },
    { url: `${_APS_BASE}/api/mappings`,   data: wfdMappings,   key: 'id' },
    { url: `${_APS_BASE}/api/contacts`,   data: wfdContacts,   key: 'id' },
    { url: `${_APS_BASE}/api/scripts`,    data: wfdScripts,    key: 'id' },
    { url: `${_APS_BASE}/api/connexions`, data: wfdConnexions, key: 'id' },
    { url: `${_APS_BASE}/api/nommages`,   data: wfdNommages,   key: 'id' },
  ];

  try {
    await Promise.all(entities.map(({ url, data }) =>
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: data }),
      }).then(r => { if (!r.ok) console.warn(`[APS] Erreur sync ${url}`, r.status); })
        .catch(err => console.warn(`[APS] Erreur réseau ${url}`, err))
    ));
    console.log('[APS] Données synchronisées');
  } catch (err) {
    console.warn('[APS] Sync serveur échouée', err);
  }
}

//Expose en global (module ou non) pour wfd-config-panel.js
if (typeof window !== 'undefined') window.sauvegarderEtat = sauvegarderEtat;

function sauvegarderEtat(label) {
  // Écriture synchrone localStorage (cache local + fallback offline)
  localStorage.setItem('wfdFlows',      JSON.stringify(wfdFlows));
  localStorage.setItem('wfdPalNodes',   JSON.stringify(wfdPalNodes));
  localStorage.setItem('wfdMappings',   JSON.stringify(wfdMappings));
  localStorage.setItem('wfdContacts',   JSON.stringify(wfdContacts));
  localStorage.setItem('wfdScripts',    JSON.stringify(wfdScripts));
  localStorage.setItem('wfdConnexions', JSON.stringify(wfdConnexions));
  localStorage.setItem('wfdNommages',   JSON.stringify(wfdNommages));

  // Ne pas persister le flux courant — on part toujours d'un canvas vide
  _historyPush(label || '');

  // Synchroniser avec le serveur (fire-and-forget)
  _sauvegarderEtatVersServeur();

  // Synchroniser les flux et connexions avec l'engine Electron si disponible
  if (window.WfdEngineInstance?.loadFluxes) {
    window.WfdEngineInstance.loadFluxes(wfdFlows).catch(() => {});
  }
  if (window.WfdEngineInstance?.loadConnexions) {
    window.WfdEngineInstance.loadConnexions(
      (wfdConnexions || []).filter(c => c.direction === 'outbound')
    ).catch(() => {});
  }
}

// ── Flux ─────────────────────────────────────────────────────
function getFlux(id) { return wfdFlows.find(f=>f.id===id); }
function getFluxCourant() { return getFlux(currentFlowId); }

function peuplerSelectFlux() {
  const sel = document.getElementById('wfd-flow-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">\u2014 Flux \u2014</option>';
  const actives = _getActiveFluxes();
  [...wfdFlows].sort((a,b) => a.name.localeCompare(b.name)).forEach(f => {
    const opt = document.createElement('option');
    // Déterminer le statut du flux
    const isLive    = Object.values(_wfdJobs.live || {}).some(j => j.fluxId === f.id);
    const fluxHistory = (_wfdJobs.history || []).filter(j => j.fluxId === f.id);
    const lastRun   = fluxHistory.sort((a,b) => new Date(b.startedAt||0) - new Date(a.startedAt||0))[0];
    const lastFailed = lastRun?.status === 'failed';
    let dot = '⚫'; // inactif
    if (actives.has(f.id)) {
      if (isLive)       dot = '🟠'; // run en cours
      else if (lastFailed) dot = '🔴'; // dernier run en échec
      else              dot = '🟢'; // actif, OK
    }
    opt.value = f.id;
    opt.textContent = dot + ' ' + f.name;
    sel.appendChild(opt);
  });
  if (prev && wfdFlows.find(f=>f.id===prev)) { sel.value = prev; }
  document.getElementById('btn-del-flux').style.display = currentFlowId ? 'flex' : 'none';
_wfdSetDisplay('btn-ren-flux', currentFlowId ? 'flex' : 'none');
  peuplerSelectEnvironnement();
  wfdUpdateToggleBtn();
  // Forcer renderCanvas si un flux est sélectionné
  if (currentFlowId) requestAnimationFrame(() => renderCanvas());
}

// ── Gestion des environnements Iconik ────────────────────────
function getEnvironnements() {
  return (typeof appTokensData !== 'undefined' && appTokensData.appTokens) ? appTokensData.appTokens : [];
}

function peuplerSelectEnvironnement() {
  const sel     = document.getElementById('wfd-env-select');
  const group   = document.getElementById('tb-env-group');
  const flux    = getFluxCourant();
  if (!sel || !group) return;

  const envs = getEnvironnements();

  sel.innerHTML = '<option value="">\u2014 Environnement \u2014</option>';
  envs.forEach(e => {
    const icons = { dev:'\uD83D\uDD35', qa:'\uD83D\uDFE1', prod:'\uD83D\uDFE2' };
    const opt   = document.createElement('option');
    opt.value       = e.name;
    opt.textContent = (icons[e.environment] || '\u26AA') + ' ' + e.name;
    sel.appendChild(opt);
  });

  group.style.display = flux ? 'flex' : 'none';
  sel.value = (flux && flux.iconikEnv) ? flux.iconikEnv : '';
  majDotEnvironnement(flux ? flux.iconikEnv : '');
}

function majDotEnvironnement(envName) {
  const dot  = document.getElementById('wfd-env-dot');
  if (!dot) return;
  const envs = getEnvironnements();
  const env  = envs.find(e => e.name === envName);
  const colors = { dev:'#3498db', qa:'#f39c12', prod:'#00d4aa' };
  dot.style.background = env ? (colors[env.environment] || '#888') : '#555';
  dot.title = env ? (env.iconikUrl || '') : 'Aucun environnement s\u00e9lectionn\u00e9';
}

function onEnvChange() {
  const flux = getFluxCourant();
  if (!flux) return;
  const envName = document.getElementById('wfd-env-select').value;
  flux.iconikEnv = envName || null;
  majDotEnvironnement(envName);
  sauvegarderEtat();
  toast('Environnement : ' + (envName || 'aucun'));
  // Configurer l'engine avec les credentials du nouvel environnement
  wfdConfigureEngineEnv(envName);
}

function wfdConfigureEngineEnv(envName) {
  if (!window.WfdEngineInstance) return;
  const envs = getEnvironnements();
  const env  = envs.find(e => e.name === envName);
  if (!env) return;
  window.WfdEngineInstance.setIconikClient({
    baseUrl : env.iconikUrl || 'https://app.iconik.io',
    appId   : env.appId,
    token   : env.token || env.appToken,
  }).then(() => {
    console.log('[WFD Engine] Client Iconik configuré — ' + envName);
    // Recharger wfdData avec les données de ce token
    chargerIconikData();
  }).catch(err => console.error('[WFD Engine] setIconikClient failed:', err));
}

// Helper : r\u00e9cup\u00e9rer les credentials du flux courant pour le d\u00e9ploiement
function getCredentialsFlux(flux) {
  if (!flux || !flux.iconikEnv) return null;
  const envs = getEnvironnements();
  return envs.find(e => e.name === flux.iconikEnv) || null;
}

function onFlowChange() {
  const id = document.getElementById('wfd-flow-select').value;
  currentFlowId = id || null;
  selectedNodeId = null;
  fermerConfigPanel();
  document.getElementById('btn-del-flux').style.display = id ? 'flex' : 'none';
_wfdSetDisplay('btn-ren-flux', id ? 'flex' : 'none');
  peuplerSelectEnvironnement();
  wfdUpdateToggleBtn();
  // Double render : immédiat + après chargement async de wfdData (mdViews, etc.)
  renderCanvas();
  requestAnimationFrame(() => renderCanvas());
  // Configurer l'engine avec l'environnement du flux courant
  const _flux = getFluxCourant();
  if (_flux) wfdConfigureEngineEnv(_flux.iconikEnv);
}

function nouveauFlux() {
  // Ne pas toucher au select — juste afficher un input inline temporaire
  if (document.getElementById('new-flux-name')) return; // déjà ouvert
  const btn = document.querySelector('[onclick="nouveauFlux()"]');
  if (!btn) return;
  // Créer les éléments inline après le bouton
  const inp = document.createElement('input');
  inp.id = 'new-flux-name'; inp.className = 'tb-select';
  inp.style.minWidth = '160px'; inp.placeholder = 'Nom du flux…';
  const ok = document.createElement('button');
  ok.className = 'tb-btn accent'; ok.textContent = '✓';
  ok.onclick = confirmerNouveauFlux;
  const cancel = document.createElement('button');
  cancel.className = 'tb-btn'; cancel.textContent = '✕';
  cancel.onclick = annulerNouveauFlux;
  btn.style.display = 'none';
  btn.after(cancel); btn.after(ok); btn.after(inp);
  inp.focus({ preventScroll: true });
}
function annulerNouveauFlux() {
  document.getElementById('new-flux-name')?.remove();
  document.querySelectorAll('.tb-btn').forEach(b => {
    if (b.textContent==='✓'||b.textContent==='✕') b.remove();
  });
  const btn = document.querySelector('[onclick="nouveauFlux()"]');
  if (btn) btn.style.display = '';
}
function confirmerNouveauFlux() {
  const name = document.getElementById('new-flux-name')?.value?.trim();
  if (!name) return;
  annulerNouveauFlux(); // restaurer le bouton + Flux avant peuplerSelectFlux
  const flux = { id: 'flux-'+Date.now(), name, nodes:[], connections:[] };
  wfdFlows.push(flux);
  sauvegarderEtat();
  peuplerSelectFlux();
  document.getElementById('wfd-flow-select').value = flux.id;
  currentFlowId = flux.id;
  document.getElementById('btn-del-flux').style.display = 'flex';
_wfdSetDisplay('btn-ren-flux', 'flex');
  renderCanvas();
  toast('Flux "'+flux.name+'" créé');
}

function renommerFlux() {
  const flux = getFluxCourant();
  if (!flux) return;
  if (document.getElementById('ren-flux-name')) return; // déjà ouvert
  const btn = document.getElementById('btn-ren-flux');
  if (!btn) return;
  const inp = document.createElement('input');
  inp.id = 'ren-flux-name'; inp.className = 'tb-select';
  inp.style.minWidth = '160px'; inp.placeholder = 'Nouveau nom…';
  inp.value = flux.name;
  const ok = document.createElement('button');
  ok.className = 'tb-btn accent'; ok.textContent = '✓';
  ok.onclick = confirmerRenommerFlux;
  const cancel = document.createElement('button');
  cancel.className = 'tb-btn'; cancel.textContent = '✕';
  cancel.onclick = annulerRenommerFlux;
  btn.style.display = 'none';
  document.getElementById('btn-del-flux').style.display = 'none';
_wfdSetDisplay('btn-ren-flux', 'none');
  btn.after(cancel); btn.after(ok); btn.after(inp);
  inp.focus({ preventScroll: true });
  inp.select();
}
function annulerRenommerFlux() {
  document.getElementById('ren-flux-name')?.remove();
  document.querySelectorAll('.tb-btn').forEach(b => {
    if (b.textContent === '✓' || b.textContent === '✕') b.remove();
  });
  const flux = getFluxCourant();
  if (flux) {
    _wfdSetDisplay('btn-ren-flux', 'flex');
    document.getElementById('btn-del-flux').style.display = 'flex';
_wfdSetDisplay('btn-ren-flux', 'flex');
  }
}
function confirmerRenommerFlux() {
  const flux = getFluxCourant();
  if (!flux) return;
  const name = document.getElementById('ren-flux-name')?.value?.trim();
  if (!name) { annulerRenommerFlux(); return; }
  flux.name = name;
  sauvegarderEtat();
  annulerRenommerFlux();
  peuplerSelectFlux();
  document.getElementById('wfd-flow-select').value = flux.id;
  toast('Flux renommé en "' + name + '"');
}

function supprimerFlux() {
  const flux = getFluxCourant();
  if (!flux) return;
  if (!confirm(`Supprimer le flux "${flux.name}" ?`)) return;
  // Nettoyer Node-RED d'abord (flux.nrFlowId encore disponible), puis retirer localement
  if (typeof supprimerDeNodeRed === 'function') {
    supprimerDeNodeRed(flux);
  }
  wfdFlows = wfdFlows.filter(f=>f.id!==flux.id);
  currentFlowId = null; selectedNodeId = null;
  sauvegarderEtat();
  peuplerSelectFlux();
  renderCanvas();
  toast('Flux supprim\u00E9');
}

// ── Palette ──────────────────────────────────────────────────
function peuplerPalette() {
  Object.keys(FAMILIES).forEach(family => {
    const container = document.getElementById('pal-'+family+'-nodes');
    if (!container) return;
    container.innerHTML = '';
    const nodes = wfdPalNodes.filter(n=>n.family===family);
    nodes.forEach(node => {
      const div = document.createElement('div');
      div.className = 'pal-node';
      div.draggable = true;
      div.dataset.palId = node.id;
      const fam = FAMILIES[family];
      div.innerHTML = `
        <span class="pal-node-dot" style="background:${fam.color};"></span>
        <span class="pal-node-name">${node.name}</span>
        <button class="pal-node-edit" onclick="event.stopPropagation();editerNoeudPalette('${node.id}')" title="\u00C9diter">\u270F\uFE0F</button>
        <button class="pal-node-del" onclick="event.stopPropagation();supprimerNoeudPalette('${node.id}')" title="Supprimer">\u00D7</button>`;
      div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('palNodeId', node.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      container.appendChild(div);
    });
  });
}

function supprimerNoeudPalette(id) {
  if (!confirm('Supprimer ce n\u0153ud de la palette ?')) return;
  const idx = wfdPalNodes.findIndex(n => n.id === id);
  if (idx < 0) return;
  wfdPalNodes.splice(idx, 1);
  sauvegarderEtat();
  peuplerPalette();
  wfdRefreshNodeBar();            // ← rafraîchit le bandeau si une catégorie est ouverte
  toast('N\u0153ud supprim\u00e9 de la palette');
}

function creerNoeudPalette(family) {
  const fam  = FAMILIES[family];
  const wrap = document.getElementById('wfd-canvas-wrap');
  const scale = viewTransform?.scale || 1;
  const cx = wrap ? Math.round((wrap.clientWidth  / 2 - viewTransform.x) / scale) : 200;
  const cy = wrap ? Math.round((wrap.clientHeight / 2 - viewTransform.y) / scale) : 200;
  const offset = ((getFluxCourant()?.nodes || []).length % 8) * 20;
  creerNoeudInstant(family, fam.label, cx + offset, cy + offset);
}

function editerNoeudPalette(id) {
  const palNode = wfdPalNodes.find(n=>n.id===id);
  if (!palNode) return;
  // Créer une instance canvas du nœud palette et ouvrir le panel config
  const wrap  = document.getElementById('wfd-canvas-wrap');
  const scale = viewTransform?.scale || 1;
  const cx = wrap ? Math.round((wrap.clientWidth  / 2 - viewTransform.x) / scale) : 200;
  const cy = wrap ? Math.round((wrap.clientHeight / 2 - viewTransform.y) / scale) : 200;
  creerNoeudInstant(palNode.family, palNode.name, cx, cy);
}


// [→ wfd-config-panel.js : lignes 666–2859]
// ── Drag & Drop canvas ───────────────────────────────────────
function setupCanvasDragDrop() {
  const wrap = document.getElementById('wfd-canvas-wrap');

  wrap.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    wrap.classList.add('drag-over');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over'));
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.classList.remove('drag-over');
    if (!currentFlowId) { toast('Cr\u00E9ez ou s\u00E9lectionnez un flux d\'abord', true); return; }
    const palId = e.dataTransfer.getData('palNodeId');
    if (!palId) return;
    const palNode = wfdPalNodes.find(n=>n.id===palId);
    if (!palNode) return;

    // Convertir position souris → coordonnées canvas
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale;
    const y = (e.clientY - rect.top  - viewTransform.y) / viewTransform.scale;

    deposerNoeud(palNode, x - 90, y - 30);
  });
}

function deposerNoeud(palNode, x, y) {
  const flux = getFluxCourant();
  if (!flux) return;
  const instanceNode = {
    id     : 'node-'+Date.now(),
    palId  : palNode.id,
    family : palNode.family,
    name   : palNode.name,
    config : { ...palNode.config },
    x, y,
    // Ports : Decision a N sorties, les autres ont 1 entrée + 1 sortie
    ports  : buildPortsDef(palNode.family, palNode.config),
  };
  flux.nodes.push(instanceNode);
  sauvegarderEtat();
  renderCanvas();
  toast('N\u0153ud ajout\u00E9');
}

function buildPortsDef(family, config) {
  if (family === 'lookup') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'found',     label:'\u2705 Trouv\u00e9',     color:'#27ae60' },
        { id:'not_found', label:'\u274c Non trouv\u00e9', color:'#e74c3c' },
      ],
    };
  }
  if (family === 'decision') {
    const conditions = config.conditions || [];
    const outputs = conditions.map((c,i) => ({
      id    : 'out-'+i,
      label : c.label || ('Sortie '+(i+1)),
      color : conditionColor(i)
    }));
    // Port par défaut — toujours en dernier, non supprimable
    outputs.push({ id:'default', label: config.defaultLabel||'Par d\u00e9faut', color:'#95a5a6' });
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs,
    };
  }
  if (family === 'transform') {
    return {
      inputs : [{ id:'in',  label:'Entr\u00E9e' }],
      outputs: [{ id:'out', label:'Transform\u00E9', color:'#8e44ad' }],
    };
  }
  if (family === 'postit') {
    // Post-it : pas de ports — juste une annotation
    return { inputs:[], outputs:[] };
  }
  if (family === 'wait_for') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'out',     label:'Condition remplie', color:'#27ae60' },
        { id:'timeout', label:'Timeout',           color:'#e67e22' },
        { id:'error',   label:'Erreur',            color:'#e74c3c' },
      ],
    };
  }
  if (family === 'aws_s3') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'out',   label:'Succès',    color:'#ff9900' },
        { id:'miss',  label:'Non trouvé', color:'#e67e22' },
        { id:'error', label:'Erreur',     color:'#e74c3c' },
      ],
    };
  }
  if (family === 'checker') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'ok',    label:'Tout validé', color:'#27ae60' },
        { id:'fail',  label:'Échec',        color:'#e74c3c' },
        { id:'error', label:'Erreur HTTP',  color:'#e67e22' },
      ],
    };
  }
  if (family === 'workflow_history') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'\u00c9crit',  color:'#1abc9c' },
        { id:'error', label:'Erreur', color:'#e74c3c' },
      ],
    };
  }
  if (family === 'loop') {
    const hasErrPort = config.onError === 'port';
    const outputs = [
      { id:'each',     label:'Chaque \u00E9l\u00E9ment', color:'#16a085' },
      { id:'done',     label:'Termin\u00E9',        color:'#27ae60' },
    ];
    if (hasErrPort) outputs.push({ id:'error', label:'Erreur', color:'#e74c3c' });
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs,
    };
  }
  if (family === 'qc') {
    const outputs = config.outputs || [
      { label:'Pass',    color:'#27ae60' },
      { label:'Fail',    color:'#e74c3c' },
      { label:'Warning', color:'#f39c12' },
    ];
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs: outputs.map((o,i) => ({ id:'out-'+i, label:o.label, color:o.color||conditionColor(i) })),
    };
  }
  if (family === 'approval') {
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs: [
        { id:'approved', label:'Approuv\u00E9',color:'#27ae60' },
        { id:'rejected', label:'Refus\u00E9',  color:'#e74c3c' },
        { id:'timeout',  label:'Timeout', color:'#95a5a6' },
      ],
    };
  }
  if (family === 'set_var') {
    return {
      inputs : [{ id:'in',  label:'Entrée' }],
      outputs: [{ id:'out', label:'Sortie', color:'#16a085' }],
    };
  }
  if (family === 'script') {
    const ports = config.ports || [{ label:'success' }, { label:'error' }];
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs: ports.map((p,i) => ({ id:'out-'+i, label:p.label||('port'+i), color: conditionColor(i) })),
    };
  }
  if (family === 'notification') {
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs: [{ id:'out', label:'Envoy\u00E9' }, { id:'err', label:'Erreur', color:'#e74c3c' }],
    };
  }
  if (family === 'aps_search') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'found', label:'Résultats trouvés', color:'#8e44ad' },
        { id:'empty', label:'Aucun résultat',    color:'#e67e22' },
        { id:'error', label:'Erreur',            color:'#e74c3c' },
      ],
    };
  }
  if (family === 'relate') {
    return {
      inputs : [{ id:'in',    label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Li\u00e9', color:'#2980b9' },
        { id:'error', label:'Erreur',   color:'#e74c3c' },
      ],
    };
  }
  if (family === 'subflow') {
    const mode = config.execMode || 'sync';
    const outputs = [
      { id:'out', label: mode==='async' ? 'Déclenché' : 'Terminé', color:'#8e44ad' },
    ];
    if (mode === 'sync') outputs.push({ id:'error', label:'Erreur', color:'#e74c3c' });
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs,
    };
  }
  if (family === 'export_file') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Export\u00e9',  color:'#e67e22' },
        { id:'error', label:'Erreur',    color:'#e74c3c' },
      ],
    };
  }
  if (family === 'publish') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Publi\u00e9',  color:'#e91e8c' },
        { id:'error', label:'Erreur',   color:'#e74c3c' },
      ],
    };
  }
  if (family === 'notify_post') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Envoy\u00e9',  color:'#1abc9c' },
        { id:'error', label:'Erreur',   color:'#e74c3c' },
      ],
    };
  }
  if (family === 'transcode') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Transcod\u00e9', color:'#f39c12' },
        { id:'error', label:'Erreur',     color:'#e74c3c' },
      ],
    };
  }
  if (family === 'acl') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'ACL appliqu\u00e9e', color:'#c0392b' },
        { id:'error', label:'Erreur',              color:'#e74c3c' },
      ],
    };
  }
  if (family === 'update_meta') {
    return {
      inputs : [{ id:'in',   label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Mis \u00e0 jour', color:'#9b59b6' },
        { id:'error', label:'Erreur',           color:'#e74c3c' },
      ],
    };
  }
  if (family === 'link_file') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Reli\u00e9',  color:'#e67e22' },
        { id:'error', label:'Erreur', color:'#e74c3c' },
      ],
    };
  }
  if (family === 'create_asset') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Asset cr\u00e9\u00e9', color:'#27ae60' },
        { id:'error', label:'Erreur',        color:'#e74c3c' },
      ],
    };
  }
  if (family === 'create_col') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'out',   label:'Collection cr\u00e9\u00e9e', color:'#16a085' },
        { id:'error', label:'Erreur',              color:'#e74c3c' },
      ],
    };
  }
  if (family === 'fetch') {
    return {
      inputs : [{ id:'in', label:'Entr\u00E9e' }],
      outputs: [
        { id:'found',     label:'\u2705 Trouv\u00E9',      color:'#27ae60' },
        { id:'not_found', label:'\u274C Non trouv\u00E9', color:'#e74c3c' },
      ],
    };
  }
  if (family === 'action') {
  return {
    inputs : [{ id:'in', label:'Entrée' }],
    outputs: [
      { id:'out',   label:'OK',     color:'#00d4aa' },
      { id:'error', label:'Erreur', color:'#e74c3c' }
    ],
  };
}
  if (family === 'timer') {
    return {
      inputs : [],
      outputs: [{ id:'out', label:'Tick ⏱️', color:'#8e44ad' }],
    };
  }
  if (family === 'gate') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'out',     label:'Continuer', color:'#e67e22' },
        { id:'blocked', label:'Bloqué',    color:'#e74c3c' },
      ],
    };
  }
  if (family === 'manual') {
    return {
      inputs : [],
      outputs: [{ id:'out', label:'Déclenché', color:'#95a5a6' }],
    };
  }
  if (family === 'id_generator') {
    return {
      inputs : [{ id:'in', label:'Entrée' }],
      outputs: [
        { id:'out',   label:'ID généré', color:'#1abc9c' },
        { id:'error', label:'Erreur',    color:'#e74c3c' },
      ],
    };
  }
  if (family === 'http_sequence') {
    return {
      inputs : [{ id:'in', label:'Entr\u00e9e' }],
      outputs: [
        { id:'out', label:'Succ\u00e8s',color:'#27ae60' },
        { id:'err', label:'\u00c9chec',  color:'#e74c3c' },
      ],
    };
  }
  return {
    inputs : ['trigger','listener','watchfolder','timer'].includes(family) ? [] : [{ id:'in', label:'Entr\u00E9e' }],
    outputs: [{ id:'out', label:'Sortie' }],
  };
}

function conditionColor(i) {
  const colors = ['#2ecc71','#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c'];
  return colors[i % colors.length];
}

// ── Rendu canvas ─────────────────────────────────────────────
function renderCanvas() {
  const layer = document.getElementById('wfd-nodes-layer');
  const svg   = document.getElementById('wfd-svg');
  layer.innerHTML = '';
  svg.innerHTML   = '';

  const flux = getFluxCourant();
  const empty = document.getElementById('wfd-empty');

  if (!flux) {
    empty.style.display = 'flex';
    layer.style.transform = '';
    updateStatus('');
    return;
  }
  empty.style.display = 'none';
  applyTransform();

  // Defs SVG
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  Object.entries(FAMILIES).forEach(([fam, cfg]) => {
    const mk = document.createElementNS('http://www.w3.org/2000/svg','marker');
    mk.setAttribute('id','arrow-'+fam);
    mk.setAttribute('viewBox','0 -5 10 10');
    mk.setAttribute('refX','10'); mk.setAttribute('refY','0');
    mk.setAttribute('markerWidth','6'); mk.setAttribute('markerHeight','6');
    mk.setAttribute('orient','auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M0,-5L10,0L0,5');
    path.setAttribute('fill', cfg.color);
    mk.appendChild(path);
    defs.appendChild(mk);
  });
  // Marker pour connexions decision
  ['#2ecc71','#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c'].forEach((c,i) => {
    const mk = document.createElementNS('http://www.w3.org/2000/svg','marker');
    mk.setAttribute('id','arrow-dec-'+i);
    mk.setAttribute('viewBox','0 -5 10 10');
    mk.setAttribute('refX','10'); mk.setAttribute('refY','0');
    mk.setAttribute('markerWidth','6'); mk.setAttribute('markerHeight','6');
    mk.setAttribute('orient','auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M0,-5L10,0L0,5');
    path.setAttribute('fill', c);
    mk.appendChild(path);
    defs.appendChild(mk);
  });
  svg.appendChild(defs);

  // Nœuds EN PREMIER (les connexions ont besoin des positions DOM des ports)
  flux.nodes.forEach(node => renderNode(layer, node));

  // Connexions via rAF : garantit que les divs nœuds sont dans le DOM
  // et que getBoundingClientRect() retourne les vraies positions
  // On capture fluxId pour vérifier que le flux est toujours actif au moment du render
  const _rAfFluxId = flux.id;
  requestAnimationFrame(() => {
    // Vérifier que le flux courant n'a pas changé entre temps
    if (getFluxCourant()?.id !== _rAfFluxId) return;
    flux.connections.forEach(conn => renderConnection(svg, flux, conn));
  });

  updateStatus(flux.nodes.length+' n\u0153uds \u00B7 '+flux.connections.length+' connexions');

  // Régénérer les badges des jobs en pause/running après reconstruction du DOM
  requestAnimationFrame(() => _wfdRestoreBadges());
}

function _wfdRestoreBadges() {
  // Effacer les références DOM périmées
  _wfdJobs.badges = {};
  // Remettre un badge sur chaque nœud qui a un job live actif
  Object.values(_wfdJobs.live).forEach(job => {
    Object.entries(job.nodes || {}).forEach(([nodeId, nodeInfo]) => {
      if (nodeInfo.status === 'paused') {
        _wfdShowBadge(nodeId, 'paused', true);
      } else if (nodeInfo.status === 'running') {
        _wfdShowBadge(nodeId, 'running', true);
      }
    });
  });
}

function renderNode(layer, node) {
  const fam    = FAMILIES[node.family] || FAMILIES.action;
  const isSelected = node.id === selectedNodeId;
  const NODE_W = 180;

  const div = document.createElement('div');
  div.id = 'wfd-node-'+node.id;

  // ── Post-it : rendu spécial sans ports ──────────────────
  if (node.family === 'postit') {
    const col = node.config?.color || '#f1c40f';
    div.className = 'wfd-node wfd-postit' + (isSelected?' selected':'');
    div.style.cssText = `left:${node.x}px;top:${node.y}px;width:200px;min-height:60px;
      background:${col}18;border:1.5px solid ${col}66;border-radius:8px;
      border-style:${node.draft?'dashed':'solid'};`;
    div.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:${col};
      font-family:var(--font-ui);line-height:1.5;white-space:pre-wrap;word-break:break-word;">
      <span style="font-size:14px;margin-right:5px;">\uD83D\uDCDD</span>${node.config?.text||node.name||'Note'}
    </div>`;
    div.addEventListener('mousedown', e => { if(e.button===0) startDragNode(e, node); });
    div.addEventListener('dblclick',  e => {
      e.stopPropagation();
      const _wrap = document.getElementById('wfd-canvas-wrap');
      if (_wrap && _wrap.dataset.readonly === '1') {
        // Mode actif : ouvrir Run Panel
        window.WfdEngineInstance?.getPaused?.().then(paused => {
          const p = paused?.find(p => p.nodeId === node.id);
          const job = Object.values(_wfdJobs.live).find(j => j.nodes?.[node.id]);
          const runId = p?.runId || job?.runId || null;
          if (runId) {
            wfdRunPanelOpen(runId, node.id, { ports:p?.ports||[], assets:p?.assets||[], timeoutMs:p?.timeoutMs||null, ctxSnapshot:p?.ctxSnapshot||null });
          } else {
            // Aucun run actif — ouvrir depuis l'historique
            window.WfdEngineInstance?.getRunsByNode?.(node.id, 1).then(runs => {
              const r = runs?.[0];
              if (r) wfdRunPanelOpen(r.runId, node.id, {});
              else { const panel = document.getElementById('wfd-run-panel'); if(panel) panel.classList.add('open'); }
            }).catch(() => { const panel = document.getElementById('wfd-run-panel'); if(panel) panel.classList.add('open'); });
          }
        }).catch(() => {});
        return;
      }
      selectNode(node.id);
      ouvrirConfigPanel(node);
    });
    layer.appendChild(div);
    return;
  }

  const _isReadOnly = document.getElementById('wfd-canvas-wrap')?.dataset?.readonly === '1';
  div.className = 'wfd-node' + (isSelected ? ' selected' : '') + (_isReadOnly ? ' wfd-node-readonly' : '');
  div.style.left  = node.x+'px';
  div.style.top   = node.y+'px';
  // Brouillon = bord en pointillés
  if (node.draft) {
    div.style.borderStyle = 'dashed';
    div.style.borderColor = isSelected ? '#fff' : fam.color+'99';
    div.style.opacity     = '0.9';
  } else {
    div.style.borderColor = isSelected ? '#fff' : fam.color+'66';
  }

  // Header couleur famille
  const header = document.createElement('div');
  header.className = 'wfd-node-header';
  header.style.background = fam.color+'18';
  header.style.borderBottomColor = fam.color+'33';

  const detail = getNodeDetail(node);
  header.innerHTML = `
    <span class="wfd-node-icon">${fam.icon}</span>
    <div style="flex:1;min-width:0;">
      <div class="wfd-node-name">${node.name}${node.draft
        ? ' <span style="font-size:8px;background:'+fam.color+'22;color:'+fam.color+';border:1px solid '+fam.color+'55;padding:1px 5px;border-radius:3px;vertical-align:middle;animation:wfd-pulse 1.5s ease-in-out infinite;">⚙ à configurer</span>'
        : ''}</div>
      <div class="wfd-node-family">${fam.label}${detail.sub?' · '+detail.sub:''}</div>
    </div>`;

  div.appendChild(header);

  if (detail.body) {
    const body = document.createElement('div');
    body.className = 'wfd-node-body';
    body.innerHTML = `<div class="wfd-node-detail">${detail.body}</div>`;
    div.appendChild(body);
  }

  // Ports
  const ports = node.ports || buildPortsDef(node.family, node.config||{});
  const portH = Math.max(ports.outputs.length, ports.inputs.length||1) * 22 + 12;

  const portsDiv = document.createElement('div');
  portsDiv.className = 'wfd-node-ports';
  portsDiv.style.height = portH+'px';
  portsDiv.style.position = 'relative';

  // Entrées
  ports.inputs.forEach((port, i) => {
    const el = document.createElement('div');
    el.className = 'wfd-port port-in';
    el.title = port.label;
    el.style.top = (14 + i*22)+'px';
    el.style.borderColor = fam.color;
    el.dataset.nodeId   = node.id;
    el.dataset.portType = 'in';
    el.dataset.portIdx  = i;
    el.setAttribute('data-node-id',  node.id);
    el.setAttribute('data-port-type','in');
    el.setAttribute('data-port-idx', i);
    setupPortDrag(el, node.id, 'in', i, fam.color);
    // Label port
    const lbl = document.createElement('span');
    lbl.style.cssText = 'position:absolute;left:14px;font-size:9px;color:#555;white-space:nowrap;top:50%;transform:translateY(-50%);font-family:var(--font-mono);pointer-events:none;';
    lbl.textContent = port.label;
    el.appendChild(lbl);
    portsDiv.appendChild(el);
  });

  // Sorties
  ports.outputs.forEach((port, i) => {
    const el = document.createElement('div');
    el.className = 'wfd-port port-out';
    const portColor = port.color || fam.color;
    el.title = port.label + ' \u2014 Glisser pour connecter';
    el.style.top = (14 + i*22)+'px';
    el.style.borderColor = portColor;
    el.dataset.nodeId   = node.id;
    el.dataset.portType = 'out';
    el.dataset.portIdx  = i;
    el.setAttribute('data-node-id',  node.id);
    el.setAttribute('data-port-type','out');
    el.setAttribute('data-port-idx', i);
    setupPortDrag(el, node.id, 'out', i, portColor);
    // Label
    const lbl = document.createElement('span');
    lbl.style.cssText = 'position:absolute;right:14px;font-size:9px;white-space:nowrap;top:50%;transform:translateY(-50%);font-family:var(--font-mono);pointer-events:none;';
    lbl.style.color = portColor;
    lbl.textContent = port.label;
    el.appendChild(lbl);
    portsDiv.appendChild(el);
  });

  div.appendChild(portsDiv);

// Interactions

div.addEventListener('mousedown', e => {
  // Ne pas démarrer un drag si on est en mode multi (Ctrl/Meta/Shift)
  if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    startDragNode(e, node);
  }
});


div.addEventListener('click', e => {
  e.stopPropagation();

  
// 0) Ignorer seulement le premier clic *simple* post-lasso.
//    Laisse passer Ctrl/Meta/Shift pour permettre le toggle immédiat.
    if (typeof _suppressNextNodeClick !== 'undefined' && _suppressNextNodeClick) {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) {
     _suppressNextNodeClick = false;
     return;
   }
    _suppressNextNodeClick = false; // on consomme et on continue (toggle OK)
   }


  // 1) Ctrl/Cmd‑clic : toggle d'appartenance à la sélection (comme un explorateur)
  if (e.ctrlKey || e.metaKey) {
    if (selectedNodeIds.has(node.id)) {
      selectedNodeIds.delete(node.id);
    } else {
      selectedNodeIds.add(node.id);
    }
    selectedNodeId = (selectedNodeIds.size === 1) ? [...selectedNodeIds][0] : null;

    // Appliquer .selected
    document.querySelectorAll('.wfd-node').forEach(nEl => {
      const nid = nEl.id.replace('wfd-node-','');
      nEl.classList.toggle('selected', selectedNodeIds.has(nid));
    });
    return;
  }

  // 2) Clic simple sur un nœud déjà sélectionné : garder la multi-sélection
  if (selectedNodeIds.has(node.id) && !e.shiftKey) {
    selectedNodeId = node.id; // nœud actif dans le groupe
    return;
  }

  // 3) Clic simple hors multi : mono‑sélection
  selectedNodeIds.clear();
  selectedNodeIds.add(node.id);
  selectedNodeId = node.id;

  document.querySelectorAll('.wfd-node').forEach(nEl => {
    const nid = nEl.id.replace('wfd-node-','');
    nEl.classList.toggle('selected', selectedNodeIds.has(nid));
  });
});

div.addEventListener('dblclick', e => {
  e.stopPropagation();

  // Ignorer le premier double‑clic post-lasso
  if (typeof _suppressNextNodeClick !== 'undefined' && _suppressNextNodeClick) {
    _suppressNextNodeClick = false;
    return;
  }

  // Mode actif (lecture seule) → ouvrir Run Panel
  const _wrapRO = document.getElementById('wfd-canvas-wrap');
  if (_wrapRO && _wrapRO.dataset.readonly === '1') {
    window.WfdEngineInstance?.getPaused?.().then(paused => {
      const p = paused?.find(p => p.nodeId === node.id);
      const job2 = Object.values(_wfdJobs.live).find(j => j.nodes?.[node.id]);
      const runId2 = p?.runId || job2?.runId || null;
      if (p || runId2) {
        wfdRunPanelOpen(p?.runId || runId2, node.id, { ports:p?.ports||[], assets:p?.assets||[], timeoutMs:p?.timeoutMs||null, ctxSnapshot:p?.ctxSnapshot||null });
      } else {
        // Aucun run actif — chercher dans l'historique
        window.WfdEngineInstance?.getRunsByNode?.(node.id, 1).then(runs => {
          const r = runs?.[0];
          if (r) wfdRunPanelOpen(r.runId, node.id, {});
          else { const panel = document.getElementById('wfd-run-panel'); if(panel) panel.classList.add('open'); }
        }).catch(() => {});
        const cfgPanel = document.getElementById('wfd-config-panel');
        if (cfgPanel) cfgPanel.classList.remove('open');
        const nameEl = document.getElementById('wfd-run-node-name');
        if (nameEl) nameEl.textContent = node.name || '';
      }
    }).catch(() => {});
    return;
  }

  // Ouvrir la config sans casser une éventuelle multi‑sélection
  if (!selectedNodeIds.has(node.id)) {
    selectedNodeIds.clear();
    selectedNodeIds.add(node.id);
    selectedNodeId = node.id;
    document.querySelectorAll('.wfd-node').forEach(nEl => {
      const nid = nEl.id.replace('wfd-node-','');
      nEl.classList.toggle('selected', selectedNodeIds.has(nid));
    });
  } else {
    selectedNodeId = node.id;
  }
  ouvrirConfigPanel(node);
});

layer.appendChild(div);
}

function getNodeDetail(node) {
  const c = node.config || {};
  let sub = '', body = '';
  if (node.family==='watchfolder') {
    sub  = (SOURCE_VARIANTS[c.variant]||'').replace(/^[^ ]+ /,'');
    body = c.formats ? '\uD83D\uDCCE '+c.formats : '';
  } else if (node.family==='lookup') {
    const inV  = c.lkInputVar  || '—';
    const outV = c.lkOutputVar || '—';
    sub  = inV + ' → {' + outV + '}';
    body = (c.lkRows||[]).length + ' correspondance(s)'
         + (c.lkFallback ? '  · défaut: ' + c.lkFallback : '');
  } else if (node.family==='fetch') {
    // Inférer le sous-type depuis les anciennes clés si fetchSubType absent
    const _fst = c.fetchSubType
      || (c.savedSearchId ? 'savedsearch'
        : c.fetchType==='collection' ? 'collection'
        : c.fetchTarget==='metadata' || c.fetchMdView ? 'metadata'
        : 'asset');
    const _fv  = c.fetchVar || c.savedSearchVar || 'asset';
    sub = '{' + _fv + '}';
    if (_fst === 'savedsearch') {
      const _ss = (wfdData.savedSearches||[]).find(s => s.id === c.savedSearchId);
      const _ssName = c.savedSearchName
        || (_ss ? (_ss.name||_ss.nom) : null)
        || (c.savedSearchId ? c.savedSearchId.slice(0,20)+'…' : '—');
      sub  = '🔍 ' + escHtml(_ssName);
      body = (c.savedSearchLimit||100) + ' résultats → {' + (c.savedSearchVar||'search_results') + '}';
    } else if (_fst === 'collection') {
      const _srcCol = { parent:'parente', id:'par ID', path:'par Chemin' };
      sub  = '📁 ' + (_srcCol[c.fetchSource||'parent'] || 'collection');
      body = c.fetchValue ? escHtml(c.fetchValue).slice(0,40) : '';
    } else if (_fst === 'metadata') {
      const _vn = (wfdData.mdViews||[]).find(v => v.id === c.fetchMdView || v.name === c.fetchMdView);
      sub  = '🏷️ ' + (_vn ? escHtml(_vn.name) : (c.fetchMdView||'toutes vues'));
      const _fields = c.metadataFields || [];
      body = _fields.length ? _fields.slice(0,4).join(', ') + (_fields.length>4?'…':'') : 'tous les champs';
    } else {
      // asset (défaut)
      const _srcLabels = { triggered:'déclenché', id:'par ID', title:'par Titre' };
      sub  = '🎬 ' + (_srcLabels[c.fetchSource||'triggered'] || c.fetchSource || 'asset');
      body = c.fetchValue ? escHtml(c.fetchValue).slice(0,40) : '';
      if (c.withMetadata) body += (body?' · ':'') + '+ MD';
    }
  } else if (node.family==='trigger') {
    const ev = TRIGGER_EVENTS[c.eventType];
    sub  = ev ? ev.icon + ' ' + ev.label : (c.eventType||'\u2014');
    if (c.eventType==='saved_search') {
      const ss = (wfdData.savedSearches||[]).find(s=>s.id===c.savedSearchId||s.nom===c.savedSearchId);
      body = (c.savedSearchName || (ss ? escHtml(ss.nom||ss.name) : '') || c.savedSearchId||'')
           + '  \u2022  ' + (c.pollInterval||'15')+'\u00a0'+(c.pollUnit||'min');
    } else if (c.eventType==='metadata_changed') {
      body = (c.triggerField||'') + (c.triggerCondition?' '+c.triggerCondition:'') + (c.triggerValue?' '+c.triggerValue:'');
    }
  } else if (node.family==='listener') {
    sub  = c.connectionName || '\u2014';
    body = c.topic || '';
  } else if (node.family==='watchfolder') {
    sub  = c.path || '\u2014';
    body = c.formats ? '\uD83D\uDCCE ' + c.formats : '';
  } else if (node.family==='relate') {
    const rt = RELATE_TYPES.find(r => r.value === c.relationType);
    sub  = rt ? rt.label : (c.relationType||'\u2014');
    const dir = c.direction||'a_to_b';
    const arrow = dir==='both'?'\u2194':dir==='b_to_a'?'\u2190':'\u2192';
    body = (c.assetA||'A') + ' ' + arrow + ' ' + (c.assetB||'B');
  } else if (node.family==='subflow') {
    const tf = wfdFlows.find(f => f.id === c.targetFlowId);
    sub  = tf ? escHtml(tf.name||tf.id) : (c.targetFlowId||'\u2014');
    body = (c.execMode==='async'?'\u26a1 Async':'\u23f1 Sync')
         + '  \u2022 ' + (c.ctxMode==='all'?'Tout le contexte':c.ctxMode==='explicit'?'Variables s\u00e9lectionn\u00e9es':'Contexte vide');
  } else if (node.family==='http_sequence') {
    const steps = c.steps || [];
    const conn  = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).find(x => x.id === c.connexionId);
    sub  = conn ? conn.name : '—';
    body = steps.length + ' étape' + (steps.length > 1 ? 's' : '')
         + (steps.length ? ' · ' + steps.map(function(s){ return s.name || s.method || '?'; }).join(', ').slice(0, 40) : '');
  } else if (node.family==='export_file') {
    sub  = EXPORT_FILE_TARGETS[c.exportTarget] || c.exportTarget || '\u2014';
    body = c.sourceFile || '';
  } else if (node.family==='publish') {
    sub  = PUBLISH_TARGETS[c.publishTarget] || c.publishTarget || '\u2014';
    body = c[c.publishTarget==='youtube'?'yt-title':c.publishTarget==='vimeo'?'vi-title':'fb-title'] || '';
  } else if (node.family==='notify_post') {
    sub  = c['api-url'] || '\u2014';
    body = (c['api-method']||'POST') + (c.resultVar ? '  \u2192 {'+c.resultVar+'}' : '');
  } else if (node.family==='transcode') {
    sub  = c.preset || '\u2014';
    body = c.dest || 'proxy';
    } else if (node.family==='acl') {
    sub  = c.targetId || '\u2014';
    const aclOp = c.op==='replace' ? '\uD83D\uDD04 Remplacer' : '\u2795 Ajouter';
    const teams = (c.entries||[]).map(e => e.teamId).filter(Boolean);
    body = (c.target==='collection'?'\uD83D\uDCC1':'\uD83C\uDFAC') + ' ' + aclOp
         + (teams.length ? '  \u2022 '+teams.length+' team(s)' : '')
         + (c.propagate ? '  \uD83D\uDD04 Propagation' : '');
    } else if (node.family==='update_meta') {
    const _umView = (wfdData.mdViews||[]).find(v => v.id === c.mdViewId);
    const _umViewName = _umView ? (_umView.name||_umView.nom||c.mdViewId||'\u2014') : (c.mdViewId ? c.mdViewId.slice(0,20)+'...' : '\u2014');
    sub  = c.mode==='fields' ? 'Champ par champ' : _umViewName;
    body = (c.target==='collection'?'\uD83D\uDCC1':'\uD83C\uDFAC') + ' ' + (c.method||'patch').toUpperCase()
         + (c.fields?.length ? '  \u2022 '+c.fields.length+' champ(s)' : '');
    } else if (node.family==='link_file') {
    sub  = c.assetId || '—';
    const t = LINK_FILE_TYPES[c.fileType||'original'];
    body = (t ? t.icon+' '+t.label : '') + (c.filePath ? '  →  '+c.filePath : '');
  } else if (node.family==='create_asset') {  } else if (node.family==='link_file') {
    sub  = c.assetId || '—';
    const lft = LINK_FILE_TYPES[c.fileType||'original'];
    body = (lft ? lft.icon+' '+lft.label : '') + (c.filePath ? '  →  '+c.filePath : '');
  } else if (node.family==='create_asset') {
    sub  = c.title || '\u2014';
    body = c.status === 'offline' ? '\uD83D\uDD34 Offline' : '\uD83D\uDFE2 Online';
    if (c.resultVar) body += '  \u2192 {' + c.resultVar + '}';
  } else if (node.family==='create_col') {
    sub  = c.name || '\u2014';
    body = c.recursive ? '\uD83D\uDD04 R\u00e9cursif' : '';
    if (c.resultVar) body += (body?' ':'') + '\u2192 {' + c.resultVar + '}';
  } else if (node.family==='decision') {
    sub  = c.field || '\u2014';
    body = (c.conditions||[]).map((cd,i) =>
      `<span style="color:${conditionColor(i)};">${escHtml(cd.label||'Sortie')}</span>`
    ).join(' \u00b7 ');
    if (body) body += ` <span style="color:#95a5a6;">\u00b7 ${escHtml(c.defaultLabel||'Par d\u00e9faut')}</span>`;
  } else if (node.family==='action') {
    const at = ACTION_TYPES[c.actionType];
    sub  = at?.label || '\u2014';
    // Afficher targetVar (chemin/variable) ou target (ID arbre) selon le mode
    const _tgt = c.targetMode === 'var'
      ? (c.targetVar ? `<span style="color:#3498db;font-family:var(--font-mono);">${escHtml(c.targetVar)}</span>` : '')
      : (c.target    ? `<span style="color:#555;">${escHtml(c.target)}</span>` : '');
    body = _tgt;
    if (at?.endpoint) body += (body?'<br>':'')+'<span style="font-size:9px;color:#333;font-family:var(--font-mono);">'+at.endpoint+'</span>';
  } else if (node.family==='cast') {
    const ref = c.ref||'';
    sub = ref.startsWith('auto::') ? ref.slice(6) : ref.startsWith('wh::') ? ref.slice(4) : ref;
    body = ref.startsWith('auto::') ? '\u2699\uFE0F Automation' : ref.startsWith('wh::') ? '\uD83D\uDD14 Webhook' : '';
  } else if (node.family==='export') {
    sub  = EXPORT_TARGETS[c.exportTarget] || '\u2014';
    body = c['yt-title'] || c['vi-title'] || c['s3-bucket'] || c['ftp-host'] || '';
  }
  if (node.family==='transform') {
    sub  = c.target || '\u2014';
    const rules = c.rules || [];
    body = rules.map(r=>r.value||r.field||'?').join((c.separator||'_'));
    if (c.caseMode==='upper' && body) body = body.toUpperCase();
    if (c.maxLen && body.length > c.maxLen) body = body.slice(0,c.maxLen)+'\u2026';
  }
  if (node.family==='postit') {
    sub  = '';
    body = (c.text||'').slice(0,80);
  }
  if (node.family==='loop') {
    const srcLabels = {
      files:'Fichiers asset', assets:'Assets collection',
      collection:'Sous-collections', list:'Liste JSON', metadata:'Champ meta'
    };
    sub  = srcLabels[c.loopSource] || 'Fichiers';
    body = `<span style="color:#16a085;font-size:9px;">\u2192 {{loop.${c.loopVar||'item'}}}</span>`
         + (c.concurrency>1 ? ` <span style="color:#444;font-size:9px;">x${c.concurrency} parallel</span>` : '');
  }
  if (node.family==='qc') {
    const rules   = c.rules   || [];
    const outputs = c.outputs || [];
    sub  = rules.length + ' r\u00E8gle(s)';
    body = outputs.map((o,i)=>
      `<span style="color:${o.color||conditionColor(i)};font-size:9px;">\u25A0 ${o.label}</span>`
    ).join(' ');
    if (c.mode) body += (body?'<br>':'') +
      `<span style="color:#444;font-size:9px;">${c.mode==='any'?'Mode OR':'Mode AND'}</span>`;
  }
  if (node.family==='approval') {
    const appr = c.approvers || [];
    sub  = appr.length ? appr.length+' approbateur(s)' : '\u2014';
    body = `<span style="color:#27ae60;font-size:9px;">\u2713 Approuv\u00E9</span> `
         + `<span style="color:#e74c3c;font-size:9px;">\u2717 Refus\u00E9</span> `
         + `<span style="color:#95a5a6;font-size:9px;">\u23F1 ${c.timeout||48}h</span>`;
    if (c.title) body += '<br><span style="color:#555;font-size:10px;">'+c.title.slice(0,50)+'</span>';
  }
  if (node.family==='notification') {
    const recs = c.recipients || [];
    sub  = recs.length + ' canal(aux)';
    body = recs.map(r => (NOTIF_CHANNELS[r.channel]?.icon||'') + ' ' + (NOTIF_CHANNELS[r.channel]?.label||r.channel)).join(', ');
  }
  if (node.family==='script') {
    sub  = SCRIPT_LANGS[c.lang] || 'JavaScript';
    const ports = c.ports || [];
    body = ports.map((p,i)=>`<span style="color:${conditionColor(i)};font-size:9px;">${p.label}</span>`).join(' \u00B7 ');
    if (c.code) body += (body?'<br>':'') + '<span style="color:#333;font-size:9px;font-family:var(--font-mono);">' + c.code.split('\n')[0].slice(0,60) + '</span>';
  }
  if (node.family==='gate') {
    // Inférer le mode depuis les anciennes clés si gateMode absent
    const _gMode = c.gateMode
      || (c.delayMs && c.delayMs > 0 && !c.maxConcurrent ? 'delay'
        : c.pauseMessage ? 'pause'
        : 'throttle');
    const _gLabels = { throttle:'🚦 Throttle', delay:'⏳ Délai', pause:'⏸ Pause' };
    sub  = _gLabels[_gMode] || _gMode;
    if (_gMode==='throttle') body = 'max ' + (c.maxConcurrent||3) + ' simultanés';
    if (_gMode==='delay')    body = (c.delayMs ? c.delayMs/1000 : 5) + 's';
    if (_gMode==='pause')    body = c.pauseAutoResume ? '↺ auto ' + (c.pauseAutoResumeAfterSec||60) + 's' : '⏳ manuelle';
  }
  if (node.family==='timer') {
    const _tMode = c.timerMode || 'interval';
    if (_tMode==='interval') {
      sub  = '🔁 ' + (c.intervalVal||30) + ' ' + (c.intervalUnit||'min');
      body = 'depuis ' + (c.intervalStart||'09:00');
    } else if (_tMode==='cron') {
      sub  = '📅 ' + (c.cronExpr || _wfdBuildCronExpr?.(c.cronFreq, c.cronDays, c.cronHour, c.cronMinute, c.cronMday) || '—');
      body = typeof _wfdCronSummaryText === 'function'
        ? _wfdCronSummaryText(c.cronFreq||'daily', c.cronDays||[1,2,3,4,5], c.cronHour||9, c.cronMinute||0, c.cronMday||1)
        : '';
    } else if (_tMode==='oneshot') {
      sub  = '🎯 ' + (c.oneshotDatetime ? c.oneshotDatetime.replace('T',' ').slice(0,16) : '—');
      body = 'une seule fois';
    }
  }
  if (node.family==='set_var') {
    const _assignments = c.assignments || [];
    sub  = _assignments.length + ' variable(s)';
    body = _assignments.slice(0,3).map(a => {
      const modeIcon = a.mode==='append'?'+=' : a.mode==='push'?'[]':'=';
      return '<span style="color:#16a085;font-family:var(--font-mono);font-size:9px;">'
        + escHtml(a.key||'?') + '</span>'
        + '<span style="color:#555;font-size:9px;"> ' + modeIcon + ' </span>'
        + '<span style="color:#888;font-size:9px;">' + escHtml((a.value||'').slice(0,20)) + '</span>';
    }).join('<br>');
    if (_assignments.length > 3) body += '<br><span style="color:#444;font-size:9px;">+' + (_assignments.length-3) + ' autres</span>';
  }
  if (node.family==='manual') {
    sub  = c.label || '🧪 Test';
    body = c.payload ? '<span style="color:#555;font-size:9px;font-family:var(--font-mono);">'
      + JSON.stringify(c.payload).slice(0,50) + '</span>' : '';
  }
  if (node.family==='rename') {
    const _parts = c.parts || [];
    sub  = _parts.length + ' partie(s)';
    body = _parts.slice(0,4).map(p => escHtml(p.value||'?')).join(' · ');
  }
  if (c.description) body = (body ? body+'<br>' : '') + '<span style="color:#444;">'+c.description+'</span>';
  return { sub, body };
}

// Convertit les coordonnées d'un élément DOM en coordonnées canvas
// (inverse du transform translate+scale appliqué par applyTransform)
function domToCanvas(el) {
  const wrap = document.getElementById('wfd-canvas-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const elRect   = el.getBoundingClientRect();
  const cx = elRect.left + elRect.width  / 2 - wrapRect.left;
  const cy = elRect.top  + elRect.height / 2 - wrapRect.top;
  // Inverser le transform du layer
  const x = (cx - viewTransform.x) / viewTransform.scale;
  const y = (cy - viewTransform.y) / viewTransform.scale;
  return { x, y };
}

// Trouve l'élément DOM d'un port par nodeId + type + index
function getPortEl(nodeId, type, idx) {
  return document.querySelector(
    `.wfd-port[data-node-id="${nodeId}"][data-port-type="${type}"][data-port-idx="${idx}"]`
  );
}

function renderConnection(svg, flux, conn) {
  const srcNode = flux.nodes.find(n=>n.id===conn.fromNode);
  const tgtNode = flux.nodes.find(n=>n.id===conn.toNode);
  if (!srcNode||!tgtNode) return;

  const srcPorts = srcNode.ports || buildPortsDef(srcNode.family, srcNode.config||{});
  const outPort  = srcPorts.outputs[conn.fromPort] || srcPorts.outputs[0];
  const portColor = outPort?.color || FAMILIES[srcNode.family]?.color || '#555';
  const markerFam = srcNode.family;
  const portIdx   = (outPort?.color)
    ? ['#2ecc71','#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c'].indexOf(outPort.color) : -1;
  const markerId  = portIdx>=0 ? 'arrow-dec-'+portIdx : 'arrow-'+markerFam;

  // Lire les positions réelles des ports dans le DOM
  const srcEl = getPortEl(srcNode.id, 'out', conn.fromPort || 0);
  const tgtEl = getPortEl(tgtNode.id, 'in',  conn.toPort   || 0);

  let x1, y1, x2, y2;
  if (srcEl && tgtEl) {
    const p1 = domToCanvas(srcEl);
    const p2 = domToCanvas(tgtEl);
    x1 = p1.x; y1 = p1.y;
    x2 = p2.x; y2 = p2.y;
  } else {
    // Fallback si le DOM n'est pas encore rendu
    const NODE_W   = 180;
    const srcBodyH = getNodeBodyHeight(srcNode);
    const tgtBodyH = getNodeBodyHeight(tgtNode);
    x1 = srcNode.x + NODE_W;
    y1 = srcNode.y + 48 + srcBodyH + 14 + (conn.fromPort||0)*22;
    x2 = tgtNode.x;
    y2 = tgtNode.y + 48 + tgtBodyH + 14 + (conn.toPort||0)*22;
  }

  const dx = Math.abs(x2-x1)*0.5;
  const d  = `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;

  // Path hitbox invisible large (12px) — capte les clics là où stroke:2px est trop fin
  const hitbox = document.createElementNS('http://www.w3.org/2000/svg','path');
  hitbox.setAttribute('d', d);
  hitbox.setAttribute('fill','none');
  hitbox.setAttribute('stroke','transparent');
  hitbox.setAttribute('stroke-width','12');
  hitbox.setAttribute('class','wfd-conn-hitbox');
  hitbox.setAttribute('pointer-events','all');
  hitbox.style.cursor = 'pointer';

  // Path visible
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d', d);
  path.setAttribute('fill','none');
  path.setAttribute('stroke', portColor);
  path.setAttribute('stroke-width','2');
  path.setAttribute('stroke-opacity','0.7');
  path.setAttribute('marker-end',`url(#${markerId})`);
  path.setAttribute('class','wfd-connection');
  path.setAttribute('data-conn-id', conn.id);
  if (conn.id === selectedConnId) {
    path.classList.add('selected-conn');
    path.setAttribute('stroke-opacity','1');
  }

  function onConnClick(e) {
    e.stopPropagation();
    selectedNodeId = null; selectedNodeIds.clear();
    document.querySelectorAll('.wfd-node').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.wfd-connection.selected-conn').forEach(p => {
      p.classList.remove('selected-conn'); p.setAttribute('stroke-opacity','0.7');
    });
    selectedConnId = conn.id;
    path.classList.add('selected-conn');
    path.setAttribute('stroke-opacity','1');
    _showConnDeleteBtn(conn.id, (x1+x2)/2, (y1+y2)/2);
  }
  function onConnEnter() { if (conn.id !== selectedConnId) path.setAttribute('stroke-opacity','1'); }
  function onConnLeave() { if (conn.id !== selectedConnId) path.setAttribute('stroke-opacity','0.7'); }

  hitbox.addEventListener('click',      onConnClick);
  hitbox.addEventListener('mouseenter', onConnEnter);
  hitbox.addEventListener('mouseleave', onConnLeave);
  path.addEventListener('click',        onConnClick);
  path.addEventListener('mouseenter',   onConnEnter);
  path.addEventListener('mouseleave',   onConnLeave);

  svg.appendChild(hitbox);
  svg.appendChild(path);

  // Label port sortie
  if (outPort?.label && outPort.label !== 'Sortie' && outPort.label !== 'Entr\u00E9e') {
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', mx); text.setAttribute('y', my-7);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('class','wfd-conn-label');
    text.textContent = outPort.label;
    svg.appendChild(text);
  }
}

function getNodeBodyHeight(node) {
  const d = getNodeDetail(node);
  return d.body ? 36 : 0;
}

// ── Ports & connexions — Drag-to-connect ─────────────────────

// État du drag de connexion en cours
let dragConn    = null;  // { fromNodeId, fromPortIdx, portColor, x1, y1 }
let clipboard   = null;  // nœud copié pour coller
let ctxMenu     = null;  // menu contextuel actif

function setupPortDrag(el, nodeId, portType, portIdx, portColor) {
  if (portType !== 'out') {
    // Les ports d'entrée : accepter le drop, highlight au survol pendant un drag
    el.addEventListener('mouseenter', () => {
      if (dragConn) el.classList.add('port-drop-target');
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('port-drop-target');
    });
    return;
  }

  // Port de sortie : démarrer le drag
  el.addEventListener('mousedown', e => {
    const _w = document.getElementById('wfd-canvas-wrap');
    if (_w && _w.dataset.readonly === '1') return;
    if (e.button !== 0) return;
    e.stopPropagation(); // Ne pas déclencher le pan ni le drag de nœud

    const pos = domToCanvas(el);
    dragConn  = { fromNodeId:nodeId, fromPortIdx:portIdx, portColor, x1:pos.x, y1:pos.y };

    const svg  = document.getElementById('wfd-svg');
    const wrap = document.getElementById('wfd-canvas-wrap');
    wrap.style.cursor = 'crosshair';

    // Ligne de preview (ghost)
    const ghost = document.createElementNS('http://www.w3.org/2000/svg','path');
    ghost.setAttribute('fill','none');
    ghost.setAttribute('stroke', portColor);
    ghost.setAttribute('stroke-width','2');
    ghost.setAttribute('stroke-dasharray','6 4');
    ghost.setAttribute('stroke-opacity','0.8');
    ghost.id = 'drag-conn-ghost';
    svg.appendChild(ghost);

    const onMove = ev => {
      if (!dragConn) return;
      const wrapRect = wrap.getBoundingClientRect();
      const mx = (ev.clientX - wrapRect.left - viewTransform.x) / viewTransform.scale;
      const my = (ev.clientY - wrapRect.top  - viewTransform.y) / viewTransform.scale;
      const dx = Math.abs(mx - dragConn.x1) * 0.5;
      ghost.setAttribute('d',
        `M${dragConn.x1},${dragConn.y1} C${dragConn.x1+dx},${dragConn.y1} ${mx-dx},${my} ${mx},${my}`
      );
    };

    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      ghost.remove();
      wrap.style.cursor = '';

      if (!dragConn) return;
      const saved = dragConn;
      dragConn = null;
      document.querySelectorAll('.port-drop-target').forEach(p=>p.classList.remove('port-drop-target'));

      // Trouver le port d'entrée sous la souris
      const wrapRect = wrap.getBoundingClientRect();
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const targetPort = els.find(el =>
        el.classList.contains('wfd-port') && el.dataset.portType === 'in'
      );
      if (!targetPort) return;

      const toNodeId  = targetPort.dataset.nodeId;
      const toPortIdx = parseInt(targetPort.dataset.portIdx || '0');
      if (toNodeId === saved.fromNodeId) return; // même nœud

      const flux = getFluxCourant();
      if (!flux) return;

      // Éviter doublons
      if (flux.connections.find(c =>
        c.fromNode===saved.fromNodeId && c.fromPort===saved.fromPortIdx &&
        c.toNode===toNodeId && c.toPort===toPortIdx
      )) { toast('Connexion d\u00E9j\u00E0 existante', true); return; }

      flux.connections.push({
        id       : 'conn-'+Date.now(),
        fromNode : saved.fromNodeId,
        fromPort : saved.fromPortIdx,
        toNode   : toNodeId,
        toPort   : toPortIdx,
      });
      sauvegarderEtat();
      renderCanvas();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// === Collecte générique de sorties vers un nœud cible =======================

// Heuristiques sur ID/label de port (fr/en) — non destructif, UI-only
function _isErrorLikePort(port) {
  const s = ((port.id || '') + ' ' + (port.label || '')).toLowerCase();
  return /(^|[^a-z])(error|erreur|fail|not[_-]?found|reject|timeout)([^a-z]|$)/.test(s);
}
function _isSuccessLikePort(port) {
  const s = ((port.id || '') + ' ' + (port.label || '')).toLowerCase();
  return /(^|[^a-z])(ok|success|envoy[eé]|pass|termin[eé]|publi[eé]|transcod[eé]|out)([^a-z]|$)/.test(s);
}

function _connectMatchingOutputsTo(targetNodeId, matcher) {
  const flux = getFluxCourant(); if (!flux) return 0;
  const target = flux.nodes.find(n => n.id === targetNodeId); if (!target) return 0;
  let added = 0, seed = Date.now();

  flux.nodes.forEach((n) => {
    if (n.id === targetNodeId) return;
    const ports = n.ports || buildPortsDef(n.family, n.config || {});
    (ports.outputs || []).forEach((p, i) => {
      if (matcher(p)) {
        const exists = flux.connections.some(c =>
          c.fromNode === n.id && c.fromPort === i &&
          c.toNode === targetNodeId && c.toPort === 0
        );
        if (!exists) {
          flux.connections.push({
            id: 'conn-' + seed + '-' + Math.random().toString(36).slice(2,7),
            fromNode: n.id, fromPort: i, toNode: targetNodeId, toPort: 0
          });
          added++;
        }
      }
    });
  });
  return added;
}

function connecterToutesErreursVers(targetNodeId) {
  const n = _connectMatchingOutputsTo(targetNodeId, _isErrorLikePort);
  if (n) { sauvegarderEtat(); renderCanvas(); toast(`Erreurs reliées : ${n}`); }
  else { toast('Aucune sortie « Erreur » à relier', true); }
}
function connecterTousSuccesVers(targetNodeId) {
  const n = _connectMatchingOutputsTo(targetNodeId, _isSuccessLikePort);
  if (n) { sauvegarderEtat(); renderCanvas(); toast(`Succès reliés : ${n}`); }
  else { toast('Aucune sortie “succès” à relier', true); }
}

// — Picker personnalisé : liste des nœuds × sorties — minimal & inline modal —
function ouvrirCollectorPicker(targetNodeId) {
  const flux = getFluxCourant(); if (!flux) return;
  const wrap = document.getElementById('wfd-canvas-wrap');
  const modal = document.createElement('div');
  modal.id = 'wfd-collector-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:680px;max-width:95vw;max-height:80vh;overflow:auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:14px;';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:700;color:#ccc;">Collecter depuis… (personnalisé)</div>
      <button class="cfg-close" onclick="document.getElementById('wfd-collector-modal').remove()">×</button>
    </div>
    <div style="font-size:11px;color:#555;margin-bottom:8px;">Cochez les sorties à relier vers ce nœud.</div>
    <div id="wfd-collector-list" style="display:flex;flex-direction:column;gap:8px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="cfg-btn" onclick="document.getElementById('wfd-collector-modal').remove()">Annuler</button>
      <button class="cfg-btn primary" id="wfd-collector-apply">✓ Appliquer</button>
    </div>
  `;
  modal.appendChild(panel);
  document.body.appendChild(modal);

  const list = panel.querySelector('#wfd-collector-list');
  flux.nodes.forEach(n => {
    if (n.id === targetNodeId) return;
    const ports = n.ports || buildPortsDef(n.family, n.config || {});
    if (!ports.outputs || !ports.outputs.length) return;
    const fam = FAMILIES[n.family] || {};
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid #2a2a2a;border-radius:8px;padding:8px;';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="color:${fam.color||'#888'}">${fam.icon||''}</span>
        <span style="font-weight:600;">${escHtml(n.name)}</span>
        <span style="color:#555;">· ${escHtml(fam.label||n.family)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;" id="ports-${n.id}"></div>
    `;
    list.appendChild(card);
    const grid = card.querySelector(`#ports-${n.id}`);
    ports.outputs.forEach((p, i) => {
      const col = p.color || fam.color || '#888';
      const id = `chk-${n.id}-${i}`;
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;border:1px solid #222;border-radius:6px;padding:6px;';
      row.innerHTML = `
        <input type="checkbox" id="${id}" data-node="${n.id}" data-port="${i}">
        <span style="width:9px;height:9px;border-radius:50%;background:${col};display:inline-block;"></span>
        <span style="font-family:var(--font-mono);color:${col};">${escHtml(p.label||'Sortie')}</span>
      `;
      grid.appendChild(row);
    });
  });

  panel.querySelector('#wfd-collector-apply').onclick = () => {
    const checks = panel.querySelectorAll('input[type=checkbox]:checked');
    const flux = getFluxCourant(); if (!flux) return;
    const target = flux.nodes.find(n => n.id === targetNodeId); if (!target) return;
    let added = 0, seed = Date.now();
    checks.forEach(ch => {
      const fromNode = ch.dataset.node;
      const fromPort = parseInt(ch.dataset.port,10) || 0;
      const exists = flux.connections.some(c =>
        c.fromNode===fromNode && c.fromPort===fromPort && c.toNode===targetNodeId && c.toPort===0);
      if (!exists) {
        flux.connections.push({ id:'conn-'+seed+'-'+Math.random().toString(36).slice(2,7),
          fromNode, fromPort, toNode:targetNodeId, toPort:0 });
        added++;
      }
    });
    document.getElementById('wfd-collector-modal').remove();
    if (added) { sauvegarderEtat(); renderCanvas(); toast(`Connexions créées : ${added}`); }
    else { toast('Aucune connexion ajoutée', true); }
  };
}

function annulerConnexion() {
  dragConn = null;
  document.getElementById('drag-conn-ghost')?.remove();
  document.getElementById('wfd-canvas-wrap').style.cursor = '';
  document.querySelectorAll('.port-drop-target').forEach(p=>p.classList.remove('port-drop-target'));
}

// ── Bouton × flottant sur connexion sélectionnée ─────────────────────────────
function _hideConnDeleteBtn() {
  document.getElementById('wfd-conn-del-btn')?.remove();
}

function _showConnDeleteBtn(connId, canvasMx, canvasMy) {
  _hideConnDeleteBtn();
  const wrap = document.getElementById('wfd-canvas-wrap');
  const rect  = wrap.getBoundingClientRect();
  const sx = canvasMx * viewTransform.scale + viewTransform.x + rect.left;
  const sy = canvasMy * viewTransform.scale + viewTransform.y + rect.top;
  const btn = document.createElement('div');
  btn.id = 'wfd-conn-del-btn';
  btn.title = 'Supprimer (ou Delete)';
  btn.style.cssText = [
    'position:fixed;z-index:9999;',
    'left:'+sx+'px;top:'+sy+'px;transform:translate(-50%,-50%);',
    'width:22px;height:22px;border-radius:50%;',
    'background:#e74c3c;border:2px solid #fff;',
    'color:#fff;font-size:15px;line-height:19px;text-align:center;',
    'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.6);',
    'user-select:none;font-weight:700;',
  ].join('');
  btn.textContent = '×';
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('mouseenter', () => { btn.style.background='#c0392b'; btn.style.transform='translate(-50%,-50%) scale(1.2)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background='#e74c3c'; btn.style.transform='translate(-50%,-50%)'; });  
  btn.addEventListener('click', e => {
   e.stopPropagation();
   supprimerConnexionLien(connId);
   selectedConnId = null;
 });

  document.body.appendChild(btn);
}


function supprimerConnexionLien(connId) {
  if (document.getElementById('wfd-canvas-wrap')?.dataset?.readonly === '1') {
    wfdToast('Impossible de modifier un flux actif'); return;
  }
  const flux = getFluxCourant();
  if (!flux) return;
  flux.connections = flux.connections.filter(c=>c.id!==connId);
  _hideConnDeleteBtn();
  sauvegarderEtat();
  renderCanvas();
  toast('Connexion supprim\u00E9e');
}

// ── Drag nœuds ───────────────────────────────────────────────
function startDragNode(e, node) {
  // Bloquer le drag si le flux est actif (mode lecture seule)
  const wrap = document.getElementById('wfd-canvas-wrap');
  if (wrap && wrap.dataset.readonly === '1') return;
  e.stopPropagation();
  // Désélectionner connexion
  selectedConnId = null;
  document.querySelectorAll('.wfd-connection.selected-conn').forEach(p => {
    p.classList.remove('selected-conn'); p.setAttribute('stroke-opacity','0.7');
  });
  // Si le nœud n'est pas dans la sélection, réinitialiser
  if (!selectedNodeIds.has(node.id)) {
    selectedNodeIds.clear();
    selectedNodeIds.add(node.id);
    selectedNodeId = node.id;
    document.querySelectorAll('.wfd-node').forEach(el =>
      el.classList.toggle('selected', el.id === 'wfd-node-'+node.id));
  }
  const layer = document.getElementById('wfd-nodes-layer');
  const startX = e.clientX;
  const startY = e.clientY;
  const startNX = node.x;
  const startNY = node.y;
  isDragging = false;

  // Positions initiales du groupe
  const flux0 = getFluxCourant();
  const groupStarts = new Map();
  selectedNodeIds.forEach(nid => {
    const gn = flux0?.nodes.find(n => n.id === nid);
    if (gn) groupStarts.set(nid, { x: gn.x, y: gn.y });
  });
  if (!groupStarts.has(node.id)) groupStarts.set(node.id, { x: startNX, y: startNY });

  const onMove = ev => {
    const dx = (ev.clientX - startX) / viewTransform.scale;
    const dy = (ev.clientY - startY) / viewTransform.scale;
    if (Math.abs(dx)+Math.abs(dy)>3) isDragging = true;
    if (!isDragging) return;
    const flux = getFluxCourant();
    groupStarts.forEach((start, nid) => {
      const gn = flux?.nodes.find(n => n.id === nid);
      if (!gn) return;
      gn.x = start.x + dx;
      gn.y = start.y + dy;
      const el = document.getElementById('wfd-node-'+nid);
      if (el) { el.style.left = gn.x+'px'; el.style.top = gn.y+'px'; }
    });
    renderConnectionsOnly();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (isDragging) sauvegarderEtat();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function renderConnectionsOnly() {
  const svg  = document.getElementById('wfd-svg');
  const flux = getFluxCourant();
  if (!flux) return;
  // Garder defs, reconstruire connexions
  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  if (defs) svg.appendChild(defs);
  flux.connections.forEach(conn => renderConnection(svg, flux, conn));
}

// ── Sélection & config ───────────────────────────────────────
function selectNode(id) {
  selectedNodeId = id;
  selectedNodeIds.clear();
  if (id) selectedNodeIds.add(id);
  selectedConnId = null;
  document.querySelectorAll('.wfd-node').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.wfd-connection.selected-conn').forEach(p => {
    p.classList.remove('selected-conn');
    p.setAttribute('stroke-opacity','0.7');
  });
  const el = document.getElementById('wfd-node-'+id);
  if (el) {
    el.classList.add('selected');
    const fam = el.querySelector('.wfd-node-header');
    // Highlight
  }
}

// [→ wfd-config-panel.js : lignes 3740–4226]
// ── Nœud instantané (double-clic canvas) ─────────────────────
function setupInstantNode() {
  const wrap = document.getElementById('wfd-canvas-wrap');
  wrap.addEventListener('dblclick', e => {
    if (wrap.dataset.readonly === '1') return;
    // Ignorer si clic sur un nœud ou un port
    if (e.target.closest('.wfd-node') || e.target.closest('.wfd-port')) return;
    const flux = getFluxCourant();
    if (!flux) { toast('Cr\u00E9ez d\'abord un flux', true); return; }

    const wrapRect = wrap.getBoundingClientRect();
    const cx = (e.clientX - wrapRect.left - viewTransform.x) / viewTransform.scale;
    const cy = (e.clientY - wrapRect.top  - viewTransform.y) / viewTransform.scale;
    afficherPopoverInstant(cx, cy, e.clientX - wrapRect.left, e.clientY - wrapRect.top);
  });
}

function afficherPopoverInstant(cx, cy, px, py) {
  fermerPopoverInstant();
  const wrap = document.getElementById('wfd-canvas-wrap');
  const pop  = document.createElement('div');
  pop.id = 'instant-node-pop';
  pop.style.cssText = `position:absolute;left:${px}px;top:${py}px;z-index:1000;
    background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:12px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:260px;`;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;color:#555;font-family:var(--font-mono);margin-bottom:8px;';
  title.textContent = 'NOUVEAU N\u0152UD \u2014 clic pour placer';
  pop.appendChild(title);

  // Champ nom
  const nameInput = document.createElement('input');
  nameInput.id          = 'instant-name';
  nameInput.placeholder = 'Nom du n\u0153ud...';
  nameInput.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 10px;background:#0d0d0d;' +
    'color:#fff;border:1px solid #333;border-radius:6px;font-size:13px;margin-bottom:8px;outline:none;';
  pop.appendChild(nameInput);

  // Grille de familles
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
  Object.entries(FAMILIES).forEach(([key, fam]) => {
    const btn = document.createElement('button');
    btn.style.cssText = `padding:6px 4px;background:#0d0d0d;border:1px solid ${fam.color}44;
      border-radius:6px;cursor:pointer;font-size:11px;color:${fam.color};text-align:center;
      transition:all 0.15s;`;
    btn.innerHTML = `<div style="font-size:16px;">${fam.icon}</div><div style="font-size:9px;margin-top:2px;">${fam.label}</div>`;
    btn.onmouseover = () => { btn.style.background = fam.color+'22'; btn.style.borderColor = fam.color; };
    btn.onmouseout  = () => { btn.style.background = '#0d0d0d'; btn.style.borderColor = fam.color+'44'; };
    btn.onclick = () => {
      const name = document.getElementById('instant-name')?.value.trim() || fam.label;
      creerNoeudInstant(key, name, cx, cy);
      fermerPopoverInstant();
    };
    grid.appendChild(btn);
  });
  pop.appendChild(grid);

  // Raccourci Entrée
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim();
      if (name) {
        // Prendre la première famille non-postit par défaut
        creerNoeudInstant('action', name, cx, cy);
        fermerPopoverInstant();
      }
    }
    if (e.key === 'Escape') fermerPopoverInstant();
  });

  wrap.appendChild(pop);
  setTimeout(() => nameInput.focus({ preventScroll: true }), 50);

  // Fermer sur clic extérieur
  setTimeout(() => {
    document.addEventListener('mousedown', function onOut(ev) {
      if (!pop.contains(ev.target)) { fermerPopoverInstant(); document.removeEventListener('mousedown', onOut); }
    });
  }, 100);
}

function fermerPopoverInstant() {
  document.getElementById('instant-node-pop')?.remove();
}

// Alias utilisé par les boutons + de la palette → crée directement sur le canvas
function ajouterNoeudCanvas(family, name) {
  const flux = getFluxCourant();
  if (!flux) { toast('Sélectionnez ou créez un flux d\'abord', true); return; }
  const wrap  = document.getElementById('wfd-canvas-wrap');
  const scale = viewTransform?.scale || 1;
  const cx = wrap ? Math.round((wrap.clientWidth  / 2 - viewTransform.x) / scale) : 200;
  const cy = wrap ? Math.round((wrap.clientHeight / 2 - viewTransform.y) / scale) : 200;
  // Décaler légèrement si un nœud existe déjà au même endroit
  const offset = (flux.nodes || []).length * 20;
  creerNoeudInstant(family, name, cx + offset % 200, cy + Math.floor(offset / 200) * 60);
}

function ajouterNoeudSource(family, name) {
  const flux = getFluxCourant();
  if (!flux) {
    toast('Sélectionnez ou créez un flux d\'abord', true);
    return;
  }
  // Placer au centre du canvas visible
  const wrap = document.getElementById('wfd-canvas-wrap');
  const scale = viewTransform?.scale || 1;
  const cx = wrap ? Math.round((wrap.scrollLeft + wrap.clientWidth  / 2) / scale) : 120;
  const cy = wrap ? Math.round((wrap.scrollTop  + wrap.clientHeight / 2) / scale) : 120;
  creerNoeudInstant(family, name, cx, cy);
}

function creerNoeudInstant(family, name, x, y) {
  const fam  = FAMILIES[family];
  const node = {
    id     : 'node-' + Date.now(),
    family,
    name   : name || fam.label,	
    config : {},
    x      : x || 200,
    y      : y || 200,
  };
  const flux = getFluxCourant();
  if (flux) flux.nodes.push(node);
  sauvegarderEtat();
  renderCanvas();
  ouvrirConfigPanel(node);
}

// ── Menu contextuel ───────────────────────────────────────────
function setupContextMenu() {
  const wrap = document.getElementById('wfd-canvas-wrap');

  wrap.addEventListener('contextmenu', e => {
  e.preventDefault();
  // Si un pan (clic droit) vient d'avoir lieu, on n'ouvre pas le menu
  if (isPanning || panWasDragging) return;

  const onNode = e.target.closest('.wfd-node');
  if (onNode) {
    const nodeId = onNode.id.replace('wfd-node-','');
    afficherCtxNode(e.clientX, e.clientY, nodeId);
  } else {
    const wrapRect = wrap.getBoundingClientRect();
    const cx = (e.clientX - wrapRect.left - viewTransform.x) / viewTransform.scale;
    const cy = (e.clientY - wrapRect.top - viewTransform.y) / viewTransform.scale;
    afficherCtxCanvas(e.clientX, e.clientY, cx, cy);
  }
});

  // Fermer sur clic ou Échap
  document.addEventListener('click', fermerCtxMenu);
  document.addEventListener('keydown', ev => { if(ev.key==='Escape') fermerCtxMenu(); });
}

function afficherCtxCanvas(px, py, cx, cy) {
  fermerCtxMenu();
  const items = [];

  // Menu multi-sélection
  if (selectedNodeIds.size > 1) {
    items.push(
      { label: 'Sélection : ' + selectedNodeIds.size + ' nœuds', disabled: true },
      { label: '📋 Dupliquer la sélection', action: () => dupliquerSelection() },
      { label: '📄 Copier la sélection', action: () => copierSelection() },
      { label: '⭐ Promouvoir la sélection en palette', action: () => promouvoirSelectionEnPalette() },
      { label: '🗑 Supprimer la sélection', action: () => supprimerNoeudSelectionne(), danger: true },
      { separator: true }
    );
  }

  // Items canvas standards
  items.push(
    { label:'➕ Nouveau nœud ici', action:()=>afficherPopoverInstant(cx,cy,px-document.getElementById('wfd-canvas-wrap').getBoundingClientRect().left, py-document.getElementById('wfd-canvas-wrap').getBoundingClientRect().top) },
    { label:'📝 Note / Post-it', action:()=>creerNoeudInstant('postit','Note',cx,cy) },
  );

  if (clipboard) items.push({ label:'⎘ Coller', action:()=>collerNoeud(cx,cy) });

  creerCtxMenu(px, py, items);
}

function afficherCtxNode(px, py, nodeId) {
  fermerCtxMenu();

  const flux = getFluxCourant();
  const node = flux?.nodes.find(n => n.id === nodeId);
  if (!node) return;

  const fam = FAMILIES[node.family] || { icon: '', label: node.family };

  const items = [
    { label: fam.icon + ' ' + node.name, disabled: true },
    { separator: true },
    { label: '✏️ Configurer', action: () => { selectNode(nodeId); ouvrirConfigPanel(node); } },
    { label: '📋 Dupliquer',  action: () => dupliquerNoeud(nodeId) },
    { label: '📄 Copier',     action: () => { clipboard = JSON.parse(JSON.stringify(node)); toast('Nœud copié'); } },
  ];

  // Afficher l’action pour tous les nœuds (plus uniquement quand draft === true)
  items.push({ label: '⭐ Promouvoir en palette', action: () => promouvoirEnPalette(nodeId) });

  items.push({ separator: true });
  items.push({ label: 'Collecter depuis…', disabled: true });
  items.push({ label: '↯ Toutes les erreurs → ce nœud',
  action: () => connecterToutesErreursVers(nodeId) });
  items.push({ label: '✓ Tous les succès → ce nœud',
  action: () => connecterTousSuccesVers(nodeId) });
  items.push({ label: '☑ Personnalisé…',
  action: () => ouvrirCollectorPicker(nodeId) });
  items.push({ separator: true });
  items.push({ label: '🗑 Supprimer', action: () => { selectNode(nodeId); supprimerNoeudSelectionne(); }, danger: true });

  creerCtxMenu(px, py, items);
}

function creerCtxMenu(px, py, items) {
  const menu = document.createElement('div');
  menu.id = 'wfd-ctx-menu';
  menu.style.cssText = `position:fixed;left:${px}px;top:${py}px;z-index:2000;
    background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:4px;
    box-shadow:0 8px 32px rgba(0,0,0,0.7);min-width:200px;`;

  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#222;margin:3px 0;';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('div');
    btn.style.cssText = `padding:7px 12px;font-size:12px;border-radius:5px;cursor:${item.disabled?'default':'pointer'};
      color:${item.danger?'#e74c3c':item.disabled?'#444':'#ccc'};
      font-family:var(--font-ui);transition:background 0.1s;`;
    btn.textContent = item.label;
    if (!item.disabled) {
      btn.onmouseover = () => btn.style.background = item.danger?'rgba(231,76,60,0.15)':'#2a2a2a';
      btn.onmouseout  = () => btn.style.background = 'transparent';
      btn.onclick = e => { e.stopPropagation(); fermerCtxMenu(); item.action?.(); };
    }
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  ctxMenu = menu;

  // Ajuster si hors écran
  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (px - rect.width)+'px';
  if (rect.bottom > window.innerHeight) menu.style.top  = (py - rect.height)+'px';
}

function fermerCtxMenu() {
  ctxMenu?.remove();
  ctxMenu = null;
}

// ── Dupliquer / Coller / Promouvoir ──────────────────────────
function dupliquerNoeud(nodeId) {
  const flux = getFluxCourant();
  if (!flux) return;
  const src = flux.nodes.find(n=>n.id===nodeId);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id    = 'n-'+Date.now();
  copy.x     = src.x + 200;
  copy.y     = src.y + 40;
  copy.draft = true;
  copy.name  = src.name + ' (copie)';
  flux.nodes.push(copy);
  sauvegarderEtat();
  renderCanvas();
  selectNode(copy.id);
  toast('N\u0153ud dupliqu\u00E9');
}

function collerNoeud(cx, cy) {
  if (!clipboard) return;
  const flux = getFluxCourant();
  if (!flux) return;

  // Coller une sélection (multi)
  if (clipboard.type === 'selection' && Array.isArray(clipboard.nodes) && clipboard.nodes.length) {
    const idMap = new Map();
    const dx = cx - (clipboard.origin?.x || 0);
    const dy = cy - (clipboard.origin?.y || 0);
    const t0 = Date.now();

    clipboard.nodes.forEach((src, idx) => {
      const n = JSON.parse(JSON.stringify(src));
      n.id = 'n-' + (t0 + idx);
      n.x = src.x + dx;
      n.y = src.y + dy;
      n.draft = true;
      n.name = (n.name || 'Nœud') + ' (collé)';
      flux.nodes.push(n);
      idMap.set(src.id, n.id);
    });

    const newConns = (clipboard.conns || []).map(c => ({
      id: 'conn-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
      fromNode: idMap.get(c.fromNode),
      fromPort: c.fromPort,
      toNode: idMap.get(c.toNode),
      toPort: c.toPort
    })).filter(c => c.fromNode && c.toNode);
    flux.connections.push(...newConns);

    sauvegarderEtat();
    renderCanvas();

    selectedNodeIds = new Set(Array.from(idMap.values()));
    selectedNodeId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null;
    document.querySelectorAll('.wfd-node').forEach(el => {
      const nid = el.id.replace('wfd-node-','');
      el.classList.toggle('selected', selectedNodeIds.has(nid));
    });
    toast(clipboard.nodes.length + ' nœud(s) collé(s)');
    return;
  }

  // Fallback : ancien comportement (un seul nœud)
  const copy = JSON.parse(JSON.stringify(clipboard));
  copy.id = 'n-' + Date.now();
  copy.x = cx;
  copy.y = cy;
  copy.draft = true;
  copy.name = (copy.name || 'Nœud') + ' (collé)';
  flux.nodes.push(copy);
  sauvegarderEtat();
  renderCanvas();
  selectNode(copy.id);
  toast('Nœud collé');
}

// === Opérations multi-sélection ===
function dupliquerSelection(offsetX=200, offsetY=40) {
  const flux = getFluxCourant();
  if (!flux || selectedNodeIds.size === 0) return;
  const ids = [...selectedNodeIds];
  const idMap = new Map();
  const t0 = Date.now(); let k = 0;

  // 1) Dupliquer chaque nœud
  ids.forEach(oldId => {
    const src = flux.nodes.find(n => n.id === oldId);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'n-' + (t0 + k++);
    copy.x = src.x + offsetX;
    copy.y = src.y + offsetY;
    copy.draft = true;
    copy.name = (copy.name || 'Nœud') + ' (copie)';
    flux.nodes.push(copy);
    idMap.set(oldId, copy.id);
  });

  // 2) Recréer les connexions internes
  const newConns = [];
  flux.connections.forEach(c => {
    if (idMap.has(c.fromNode) && idMap.has(c.toNode)) {
      newConns.push({
        id: 'conn-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
        fromNode: idMap.get(c.fromNode),
        fromPort: c.fromPort,
        toNode: idMap.get(c.toNode),
        toPort: c.toPort
      });
    }
  });
  flux.connections.push(...newConns);

  sauvegarderEtat();
  renderCanvas();

  // Sélectionner les doublons
  selectedNodeIds = new Set([...idMap.values()]);
  selectedNodeId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null;
  document.querySelectorAll('.wfd-node').forEach(el => {
    const nid = el.id.replace('wfd-node-','');
    el.classList.toggle('selected', selectedNodeIds.has(nid));
  });
  toast(ids.length + ' nœud(s) dupliqué(s)');
}

function copierSelection() {
  if (selectedNodeIds.size === 0) return;
  const flux = getFluxCourant(); if (!flux) return;
  const ids = [...selectedNodeIds];
  const nodes = ids.map(id => flux.nodes.find(n => n.id === id))
                   .filter(Boolean)
                   .map(n => JSON.parse(JSON.stringify(n)));
  if (!nodes.length) return;
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const conns = flux.connections
    .filter(c => ids.includes(c.fromNode) && ids.includes(c.toNode))
    .map(c => ({ ...c }));

  clipboard = { type:'selection', nodes, conns, origin:{ x:minX, y:minY } };
  toast(nodes.length + ' nœud(s) copié(s)');
}

function promouvoirSelectionEnPalette() {
  const flux = getFluxCourant(); if (!flux) return;
  const ids = [...selectedNodeIds];
  ids.forEach(id => promouvoirEnPalette(id));
  toast(ids.length + ' nœud(s) promu(s) en palette');
}

function promouvoirEnPalette(nodeId) {
  const flux = getFluxCourant();
  if (!flux) return;
  const node = flux.nodes.find(n=>n.id===nodeId);
  if (!node) return;
  const palNode = {
    id    : 'pal-'+Date.now(),
    family: node.family,
    name  : node.name.replace(' (copie)','').replace(' (coll\u00E9)',''),
    config: JSON.parse(JSON.stringify(node.config||{})),
  };
  wfdPalNodes.push(palNode);
  node.draft = false;
  sauvegarderEtat();
  peuplerPalette();
  wfdRefreshNodeBar();            // ← rafraîchit le bandeau si une catégorie est ouverte
  renderCanvas();
  toast('N\u0153ud ajout\u00E9 \u00E0 la palette \u2713');
}

// ── Pan & zoom ───────────────────────────────────────────────
function setupPanning() {
  const wrap = document.getElementById('wfd-canvas-wrap');

  wrap.addEventListener('mousedown', e => {
    if (wrap.dataset.readonly === '1' && e.button !== 2) return; // Readonly: autoriser clic droit uniquement pour info
    const isNode  = e.target.closest('.wfd-node');
    const isPort  = e.target.closest('.wfd-port');
    const isBtn   = e.target.closest('button');
    const isInput = ['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName);
    const isConn  = e.target.classList.contains('wfd-connection') ||
                    e.target.classList.contains('wfd-conn-hitbox');
    if (isNode || isPort || isBtn || isInput || isConn) return;

    // Clic droit sur le fond → pan
    if (e.button === 2) {
    isPanning = true;
    panWasDragging = false; // ← reset au démarrage
    panStart = { x: e.clientX - viewTransform.x, y: e.clientY - viewTransform.y };
    wrap.style.cursor = 'grabbing';
    return;
}

    // Clic gauche sur le fond → lasso
    // Clic gauche sur le fond → lasso
  if (e.button === 0) {
  const rect = wrap.getBoundingClientRect();
  isLassoing = true;
  lassoStart = {
    x: (e.clientX - rect.left - viewTransform.x) / viewTransform.scale,
    y: (e.clientY - rect.top - viewTransform.y) / viewTransform.scale,
  };
  // Activer le mode "lassoing" pour assombrir le reste
  wrap.classList.add('lassoing');

  // Désélectionner connexion courante
  selectedConnId = null;
  _hideConnDeleteBtn();
  document.querySelectorAll('.wfd-connection.selected-conn').forEach(p => {
    p.classList.remove('selected-conn'); p.setAttribute('stroke-opacity','0.7');
  });
}
  });

  // Empêcher le menu contextuel natif sur le canvas (pour libérer le clic droit au pan)
  wrap.addEventListener('contextmenu', e => { e.preventDefault(); });

  document.addEventListener('mousemove', e => {
  if (isPanning) {
    // Dès qu'on bouge pendant un pan, on marque le drag
    panWasDragging = true;
    viewTransform.x = e.clientX - panStart.x;
    viewTransform.y = e.clientY - panStart.y;
    applyTransform();
    renderConnectionsOnly();
    return;
  }
  if (isLassoing) {
    _updateLassoOverlay(e);
  }
});
document.addEventListener('mouseup', e => {
  if (isPanning) {
    isPanning = false;
    wrap.style.cursor = '';
    // Évite l'ouverture du menu contextuel juste après un pan
    setTimeout(() => { panWasDragging = false; }, 50);
  }
  if (isLassoing) {
  isLassoing = false;
  // Désactiver le mode "lassoing"
  wrap.classList.remove('lassoing');
  _finalizeLasso();
  wrap.classList.remove('lassoing');
}
});

  // Guard : reset si mouseup manqué (relâché hors fenêtre)
  function _resetAllDragStates() {
    if (isPanning)  { isPanning  = false; wrap.style.cursor = ''; panWasDragging = false; }
    if (isLassoing) { isLassoing = false; wrap.classList.remove('lassoing'); }
  }
  window.addEventListener('blur', _resetAllDragStates);
  document.addEventListener('visibilitychange', () => { if (document.hidden) _resetAllDragStates(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _resetAllDragStates(); });

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect  = wrap.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(3, Math.max(0.2, viewTransform.scale * delta));
    viewTransform.x = mx - (mx - viewTransform.x) * (newScale / viewTransform.scale);
    viewTransform.y = my - (my - viewTransform.y) * (newScale / viewTransform.scale);
    viewTransform.scale = newScale;
    applyTransform();
    renderConnectionsOnly();
  }, { passive:false });
  wrap.addEventListener('click', e => {
	if (_skipNextCanvasClick) { _skipNextCanvasClick = false; return; }  
    if (e.target === wrap || e.target === document.getElementById('wfd-svg')) {
      selectedNodeId = null;
      selectedNodeIds.clear();
      selectedConnId = null;
      document.querySelectorAll('.wfd-node').forEach(el=>el.classList.remove('selected'));
      document.querySelectorAll('.wfd-connection.selected-conn').forEach(p => {
        p.classList.remove('selected-conn'); p.setAttribute('stroke-opacity','0.7');
      });
      annulerConnexion();
    }
  });
}

function applyTransform() {
  const layer = document.getElementById('wfd-nodes-layer');
  const svg   = document.getElementById('wfd-svg');
  const t = `translate(${viewTransform.x}px,${viewTransform.y}px) scale(${viewTransform.scale})`;
  layer.style.transform = t;
  svg.style.transform   = t;
  svg.style.transformOrigin = '0 0';
}

// ── Lasso helpers ─────────────────────────────────────────────────────────────
let _lassoOverlay = null; // div position:fixed par-dessus le canvas

function _updateLassoOverlay(e) {
  const wrap = document.getElementById('wfd-canvas-wrap');
  const rect  = wrap.getBoundingClientRect();
  const cx = (e.clientX - rect.left  - viewTransform.x) / viewTransform.scale;
  const cy = (e.clientY - rect.top   - viewTransform.y) / viewTransform.scale;
  _lassoEnd = { x: cx, y: cy };

  // Coordonnées en pixels écran (pour la div overlay)
  const sx1 = lassoStart.x * viewTransform.scale + viewTransform.x + rect.left;
  const sy1 = lassoStart.y * viewTransform.scale + viewTransform.y + rect.top;
  const sx2 = e.clientX;
  const sy2 = e.clientY;

  if (!_lassoOverlay) {
    _lassoOverlay = document.createElement('div');
    _lassoOverlay.style.cssText = [
    'position:fixed;pointer-events:none;z-index:9999;',
    'border:2px solid rgba(0,212,170,0.85);',
    'box-shadow:0 0 0 3px rgba(0,212,170,0.18), 0 0 24px rgba(0,212,170,0.20) inset;',
    'background:rgba(0,212,170,0.06);',
    'box-sizing:border-box;border-radius:2px;'
].join('');
document.body.appendChild(_lassoOverlay);
  }
  const x = Math.min(sx1,sx2), y = Math.min(sy1,sy2);
  const w = Math.abs(sx2-sx1), h = Math.abs(sy2-sy1);
  _lassoOverlay.style.left   = x+'px';
  _lassoOverlay.style.top    = y+'px';
  _lassoOverlay.style.width  = w+'px';
  _lassoOverlay.style.height = h+'px';
  
  // --- AJOUT : surbrillance live des nœuds dans le lasso ---
const lx = Math.min(lassoStart.x, _lassoEnd.x);
const ly = Math.min(lassoStart.y, _lassoEnd.y);
const lw = Math.abs(_lassoEnd.x - lassoStart.x);
const lh = Math.abs(_lassoEnd.y - lassoStart.y);
const flux = getFluxCourant();
const NODE_W = 180, NODE_H = 70; // même hypothèse que finalize

// Nettoyer
document.querySelectorAll('.wfd-node.lasso-hilite').forEach(el => el.classList.remove('lasso-hilite'));

// Mettre en évidence
(flux?.nodes || []).forEach(n => {
  if (n.x + NODE_W >= lx && n.x <= lx + lw && n.y + NODE_H >= ly && n.y <= ly + lh) {
    const el = document.getElementById('wfd-node-'+n.id);
    if (el) el.classList.add('lasso-hilite');
  }
});
}

function _finalizeLasso() {
  if (_lassoOverlay) { _lassoOverlay.remove(); _lassoOverlay = null; }
  const wrap = document.getElementById('wfd-canvas-wrap');
  const rect  = wrap.getBoundingClientRect();
  if (!_lassoOverlay && !isLassoing) {
    // Calculer le rectangle lasso en coordonnées canvas
    // On utilise _lassoScreenEnd capturé dans mousemove
    // Si le lasso était trop petit, ignorer
  }
  // La sélection a été calculée progressivement — rien à faire ici
  // Recalcul depuis les positions stockées dans lassoStart et _lassoEnd
  if (_lassoEnd) {
  const lx = Math.min(lassoStart.x, _lassoEnd.x);
  const ly = Math.min(lassoStart.y, _lassoEnd.y);
  const lw = Math.abs(_lassoEnd.x - lassoStart.x);
  const lh = Math.abs(_lassoEnd.y - lassoStart.y);
  if (lw > 5 || lh > 5) {
    const flux = getFluxCourant();
    const NODE_W = 180, NODE_H = 70;
    selectedNodeIds.clear();
    (flux?.nodes || []).forEach(n => {
      if (n.x + NODE_W >= lx && n.x <= lx + lw && n.y + NODE_H >= ly && n.y <= ly + lh) {
        selectedNodeIds.add(n.id);
      }
    });
    document.querySelectorAll('.wfd-node').forEach(el => {
      const nid = el.id.replace('wfd-node-','');
      el.classList.toggle('selected', selectedNodeIds.has(nid));
    });
    selectedNodeId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null;
    if (selectedNodeIds.size > 0) toast(selectedNodeIds.size + ' nœud(s) sélectionné(s)');
  }
  // Nettoyer la surbrillance transitoire

// ⟶ Conversion : on garde l'aspect pour les nœuds retenus par le lasso
document.querySelectorAll('.wfd-node.lasso-hilite').forEach(el => {
  const nid = el.id.replace('wfd-node-', '');
  if (selectedNodeIds.has(nid)) el.classList.add('selected');
  el.classList.remove('lasso-hilite');
});

// Sortir du mode lasso (supprime l’effet “fantômes”)
document.getElementById('wfd-canvas-wrap')?.classList.remove('lassoing');

_lassoEnd = null;
// Empêche le click "de fin de drag" d'effacer aussitôt la sélection
_skipNextCanvasClick = true;

}
}
let _lassoEnd = null;


function wfdZoomIn()    { viewTransform.scale = Math.min(3, viewTransform.scale*1.2); applyTransform(); renderConnectionsOnly(); }
function wfdZoomOut()   { viewTransform.scale = Math.max(0.2, viewTransform.scale/1.2); applyTransform(); renderConnectionsOnly(); }
function wfdResetView() { viewTransform = {x:0,y:0,scale:1}; applyTransform(); renderConnectionsOnly(); }

// ── Auto-layout : Tidy ───────────────────────────────────────
// Algorithme simple en couches (topological sort + colonnes)
function autoLayoutFlux() {
  const flux = getFluxCourant();
  if (!flux || !flux.nodes.length) return;

  const nodes  = flux.nodes.filter(n => n.family !== 'postit');
  const postits= flux.nodes.filter(n => n.family === 'postit');
  const conns  = flux.connections || [];

  const NODE_W = 180;  // largeur estimée d'un nœud
  const NODE_H = 120;  // hauteur estimée
  const GAP_X  = 60;   // espace horizontal entre colonnes
  const GAP_Y  = 30;   // espace vertical entre nœuds d'une colonne
  const ORIGIN_X = 80;
  const ORIGIN_Y = 80;

  // 1. Construire les adjacences
  const inDegree  = {};
  const adjOut    = {};
  nodes.forEach(n => { inDegree[n.id] = 0; adjOut[n.id] = []; });
  conns.forEach(c => {
    if (adjOut[c.fromNode] !== undefined && inDegree[c.toNode] !== undefined) {
      adjOut[c.fromNode].push(c.toNode);
      inDegree[c.toNode]++;
    }
  });

  // 2. Tri topologique (Kahn)
  const layers = [];
  let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const visited = new Set();

  while (queue.length) {
    layers.push([...queue]);
    const nextQueue = [];
    queue.forEach(id => {
      visited.add(id);
      (adjOut[id] || []).forEach(nid => {
        if (!visited.has(nid)) {
          inDegree[nid]--;
          if (inDegree[nid] === 0) nextQueue.push(nid);
        }
      });
    });
    queue = nextQueue;
  }

  // Nœuds non visités (cycles) → dernière couche
  const unvisited = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
  if (unvisited.length) layers.push(unvisited);

  // 3. Assigner les positions
  let x = ORIGIN_X;
  layers.forEach(layer => {
    const colH = layer.length * NODE_H + (layer.length - 1) * GAP_Y;
    let y = ORIGIN_Y + Math.max(0, (400 - colH) / 2); // centrer verticalement
    layer.forEach(id => {
      const node = flux.nodes.find(n => n.id === id);
      if (node) { node.x = x; node.y = y; }
      y += NODE_H + GAP_Y;
    });
    x += NODE_W + GAP_X;
  });

  // 4. Repositionner les post-its en dessous du graphe
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H), ORIGIN_Y) + 40;
  postits.forEach((n, i) => {
    n.x = ORIGIN_X + i * (NODE_W + GAP_X);
    n.y = maxY;
  });

  sauvegarderEtat();
  renderCanvas();
  toast('Nœuds réorganisés');
}

// ── Redimensionnement panel de config ────────────────────────
function initPanelResizer() {
  const resizer = document.getElementById('wfd-panel-resizer');
  const panel   = document.getElementById('wfd-config-panel');
  if (!resizer || !panel) return;

  let startX, startW;

  resizer.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = panel.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const delta  = startX - e.clientX; // tiré vers la gauche = agrandir
      const minW   = 300;
      const maxW   = Math.min(520, Math.round(window.innerWidth * 0.75));
      const newW   = Math.max(minW, Math.min(maxW, startW + delta));
      panel.style.width = newW + 'px';
      // Désactiver toutes les transitions pendant le drag (transform + width)
      panel.style.transition = 'none';
    }

    function onUp() {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Rétablir uniquement la transition transform (pas width — contrôlé par JS)
      panel.style.transition = 'transform .24s cubic-bezier(.4,0,.2,1)';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    // NE PAS appeler e.preventDefault() — userSelect:none ci-dessus suffit
    // pour bloquer la sélection de texte, sans casser l'activation Electron.
  });
}

// ── Bloquer la propagation des events clavier/souris vers le canvas
//    depuis tous les inputs du panneau de configuration ────────────
function setupConfigPanelEvents() {
  // Stopper mousedown sur le PANEL uniquement pour éviter le pan canvas
  // Ne pas toucher aux events des inputs — Electron les gère nativement
  const panel = document.getElementById('wfd-config-panel');
  if (!panel) return;
  panel.addEventListener('mousedown', e => { e.stopPropagation(); });
}

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const inField = active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable
    );
    // Escape : fermer seulement si on n'est PAS dans un champ
    if (e.key === 'Escape' && !inField) { annulerConnexion(); fermerConfigPanel(); }	
    // Fermer un éventuel menu contextuel ...
    if (typeof fermerCtxMenu === 'function') fermerCtxMenu();
    
// Delete / Backspace : supprimer la multi‑sélection (ou la connexion)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
      if (document.getElementById('wfd-canvas-wrap')?.dataset?.readonly === '1') {
        wfdToast('Impossible de modifier un flux actif'); return;
      }
// Empêche tout comportement natif (history back, etc.)
    e.preventDefault();
    e.stopPropagation(); 
// Fermer un éventuel menu contextuel ouvert pour éviter les conflits
    if (typeof fermerCtxMenu === 'function') fermerCtxMenu();
	
// Si l'état est vide mais que le DOM montre une sélection, on s'aligne
    if ((!selectedNodeIds || selectedNodeIds.size === 0) && typeof document !== 'undefined') {
    const domSel = Array.from(document.querySelectorAll('.wfd-node.selected'))
    .map(el => el.id.replace('wfd-node-', ''));
    if (domSel.length) selectedNodeIds = new Set(domSel);
}

// 1) Connexion sélectionnée → on supprime le lien
    if (selectedConnId) {
      supprimerConnexionLien(selectedConnId);
      selectedConnId = null;
      return;
    }
// 2) Nœuds : priorité à la multi‑sélection, sinon mono
    if (selectedNodeIds && selectedNodeIds.size > 0) {
      supprimerNoeudSelectionne();
      return;
    }
    if (selectedNodeId) {
      // normaliser en set d'1 élément pour réutiliser la même logique interne
      selectedNodeIds = new Set([selectedNodeId]);
      supprimerNoeudSelectionne();
      return;
    }
  }
// --- Undo / Redo ---
if (!inField) {
  const key = (e.key || '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  // Ctrl/Cmd+Z → Undo ; Ctrl+Shift+Z → Redo
  if (mod && key === 'z') {
    e.preventDefault();
    return e.shiftKey ? doRedo() : doUndo();
  }

  // Ctrl/Cmd+Y → Redo
  if (mod && key === 'y') {
    e.preventDefault();
    return doRedo();
  }
}

  
// --- DELETE capture (one‑shot, avec logs visibles) ---
(function () {
  if (window._wfdDeleteCaptureInstalled) return;
  window._wfdDeleteCaptureInstalled = true;

  function onDeleteCapture(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;

    const ae = document.activeElement;
    const inField =
      ae &&
      (ae.tagName === 'INPUT' ||
       ae.tagName === 'TEXTAREA' ||
       ae.tagName === 'SELECT' ||
       ae.isContentEditable ||
       (typeof ae.closest === 'function' && ae.closest('#wfd-config-panel')));

    const selCount = (selectedNodeIds && typeof selectedNodeIds.size === 'number')
      ? selectedNodeIds.size : 0;

    // LOG CONSOLE (utilise log, pas debug)
    console.log('[DEL CAPTURE]', {
      key: e.key,
      inField: !!inField,
      selectedNodeId,
      selectedConnId,
      selectedCount: selCount
    });

    if (inField) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof fermerCtxMenu === 'function') fermerCtxMenu();

    // 1) Connexion sélectionnée → supprimer le lien
    if (selectedConnId) {
      console.log('[DEL CAPTURE] remove connection', selectedConnId);
      supprimerConnexionLien(selectedConnId);
      selectedConnId = null;
      return;
    }

    // 2) Nœuds : multi prioritaire, sinon mono
    if (selCount > 0) {
      console.log('[DEL CAPTURE] supprimerNoeudSelectionne (multi)');
      supprimerNoeudSelectionne();
      return;
    }

    if (selectedNodeId) {
      console.log('[DEL CAPTURE] supprimerNoeudSelectionne (mono)', selectedNodeId);
      selectedNodeIds = new Set([selectedNodeId]);
      supprimerNoeudSelectionne();
      return;
    }

    console.log('[DEL CAPTURE] nothing to delete');
  }

  // Listener en CAPTURE pour passer avant d’éventuels bloqueurs
  document.addEventListener('keydown', onDeleteCapture, true);
})();

// --- Raccourcis multi-sélection ---
    if (!inField) {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      // Copier — ne pas intercepter si du texte est sélectionné dans la page
      const _sel = window.getSelection();
      const _hasTextSel = _sel && _sel.toString().length > 0;
      if (mod && key === 'c' && selectedNodeIds.size > 0 && !_hasTextSel) {
        e.preventDefault();
        copierSelection();
      }
      // Dupliquer
      if (mod && key === 'd' && selectedNodeIds.size > 0) {
        e.preventDefault();
        dupliquerSelection();
      }
      // Coller (au centre de la vue)
      if (mod && key === 'v' && clipboard) {
        e.preventDefault();
        const wrap = document.getElementById('wfd-canvas-wrap');
        const rect = wrap.getBoundingClientRect();
        const cx = (rect.width / 2 - viewTransform.x) / viewTransform.scale;
        const cy = (rect.height / 2 - viewTransform.y) / viewTransform.scale;
        collerNoeud(cx, cy);
      }
    }
  });
}

function supprimerNoeudSelectionne() {
  if (document.getElementById('wfd-canvas-wrap')?.dataset?.readonly === '1') {
    wfdToast('Impossible de modifier un flux actif'); return;
  }
  const flux = getFluxCourant();
if (!flux) return;

// Recalage sélection : état → DOM → mono (dans cet ordre)
let toDelete = (selectedNodeIds && selectedNodeIds.size > 0)
  ? new Set(selectedNodeIds)
  : new Set();

// Si l'état est vide mais que le DOM affiche des nœuds sélectionnés, on s'aligne sur le DOM
if (toDelete.size === 0 && typeof document !== 'undefined') {
  const domSel = Array.from(document.querySelectorAll('.wfd-node.selected'))
    .map(el => el.id.replace('wfd-node-', ''));
  if (domSel.length) toDelete = new Set(domSel);
}

// Fallback mono-sélection
if (toDelete.size === 0 && selectedNodeId) {
  toDelete = new Set([selectedNodeId]);
}

if (toDelete.size === 0) return;
  flux.nodes       = flux.nodes.filter(n => !toDelete.has(n.id));
  flux.connections = flux.connections.filter(c => !toDelete.has(c.fromNode) && !toDelete.has(c.toNode));
  fermerConfigPanel();
  sauvegarderEtat();
  renderCanvas();
  _historyPush('Suppr nœud(s)');   // ← snapshot pour Undo
  selectedNodeId = null;
  selectedNodeIds.clear();
  toast(toDelete.size > 1 ? toDelete.size + ' nœuds supprimés' : 'Nœud supprimé');
}

// ── Mappings ─────────────────────────────────────────────────

// ══ RESSOURCES (onglets : Mappings / Contacts / Templates / Scripts) ══════════

let _resTabCurrent = 'mappings';

function ouvrirRessources(onglet) {
  _resTabCurrent = onglet || 'mappings';
  document.getElementById('modal-ressources').style.display = 'flex';
  resTab(_resTabCurrent);
}

function fermerRessources() {
  document.getElementById('modal-ressources').style.display = 'none';
}

function resTab(nom) {
  _resTabCurrent = nom;
  // Mettre à jour les onglets actifs
  document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('res-tab-' + nom);
  if (tabEl) tabEl.classList.add('active');

  const body   = document.getElementById('res-body');
  const footer = document.getElementById('res-footer');

  switch (nom) {
    case 'mappings':
      body.innerHTML = `<div class="res-tab-panel" id="res-mappings-body"></div>`;
      renderMappingsDansRessources();
      footer.innerHTML = `
        <button class="cfg-btn primary" onclick="creerMapping()">+ Nouveau mapping</button>
        <button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'contacts':
      body.innerHTML = `<div class="res-tab-panel" id="res-contacts-body"></div>`;
      renderContactsDansRessources();
      footer.innerHTML = `
        <button class="cfg-btn primary" onclick="creerListe()">+ Nouvelle liste</button>
        <button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'templates':
      body.innerHTML = `<div class="res-tab-panel" id="res-templates-body" style="display:flex;flex-direction:column;gap:12px;"></div>`;
      renderTemplatesDansRessources();
      footer.innerHTML = `<button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'scripts':
      body.innerHTML = `<div class="res-tab-panel" id="res-scripts-body"></div>`;
      renderScriptsPartages();
      footer.innerHTML = `
        <button class="cfg-btn primary" onclick="creerScriptPartage()">+ Nouveau script</button>
        <button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'connexions':
      body.innerHTML = `<div class="res-tab-panel" id="res-connexions-body"></div>`;
      renderConnexions();
      footer.innerHTML = `
        <button class="cfg-btn primary" onclick="creerConnexion()">+ Nouvelle connexion</button>
        <button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'nommage':
      body.innerHTML = `<div class="res-tab-panel" id="res-nommage-body"></div>`;
      renderNommages();
      footer.innerHTML = `
        <button class="cfg-btn primary" onclick="creerNommage()">+ Nouvelle règle</button>
        <button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;

    case 'variables':
      body.innerHTML = `<div class="res-tab-panel" id="res-variables-body" style="padding:12px;"></div>`;
      renderVariablesDansRessources();
      footer.innerHTML = `<button class="cfg-btn" onclick="fermerRessources()">Fermer</button>`;
      break;
  }
}

// Adapters pour afficher dans la modale Ressources
function renderMappingsDansRessources() {
  const body = document.getElementById('res-mappings-body');
  if (!body) return;
  renderListeMappingsDirect(body);
}


// ── Onglet Variables dans Ressources ─────────────────────────────
async function renderVariablesDansRessources() {
  const container = document.getElementById('res-variables-body');
  if (!container) return;

  container.innerHTML = '<div style="color:#555;font-size:11px;padding:8px 0;">Chargement...</div>';

  const flux = getFluxCourant();
  if (!flux) {
    container.innerHTML = '<div style="color:#555;padding:20px;text-align:center;">Aucun flux sélectionné</div>';
    return;
  }

  // Récupérer le dernier run
  let lastRunNodes = null;
  try {
    const runs = await WfdEngineInstance.getRunsByFlux(flux.id, 1);
    if (runs?.length) {
      const run = await WfdEngineInstance.getRunHistory(runs[0].runId);
      lastRunNodes = run?.nodes || null;
    }
  } catch(_) {}

  const allVars = _wfdCollectVars(flux, new Set(), lastRunNodes);
  const vars = Object.values(allVars).sort((a,b) => a.name.localeCompare(b.name));

  if (!vars.length) {
    container.innerHTML = '<div style="color:#555;padding:20px;text-align:center;">Aucune variable détectée dans ce flux</div>';
    return;
  }

  const typeIcon = t => ({ object:'{}', array:'[]', integer:'#', string:'""', boolean:'✓' }[t] || '·');
  const fmtVal = v => {
    if (v === null || v === undefined) return '—';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 60 ? s.slice(0, 58) + '…' : s;
  };

  let html = `
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
    <span style="font-size:12px;color:#aaa;">${flux.name}</span>
    <span style="font-size:10px;color:#444;">— ${vars.length} variable(s) détectée(s)</span>
    ${lastRunNodes ? '<span style="font-size:10px;color:#1abc9c;">● Valeurs du dernier run</span>' : '<span style="font-size:10px;color:#555;">○ Aucun run récent</span>'}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="border-bottom:1px solid #1a1a1a;">
        <th style="text-align:left;padding:5px 8px;color:#555;font-weight:600;width:20px;"></th>
        <th style="text-align:left;padding:5px 8px;color:#555;font-weight:600;">Variable</th>
        <th style="text-align:left;padding:5px 8px;color:#555;font-weight:600;width:60px;">Type</th>
        <th style="text-align:left;padding:5px 8px;color:#555;font-weight:600;">Dernière valeur</th>
        <th style="text-align:left;padding:5px 8px;color:#555;font-weight:600;">Origine</th>
      </tr>
    </thead>
    <tbody>`;

  vars.forEach(v => {
    const val = v.lastRunValue !== undefined ? v.lastRunValue : v.value;
    html += `
      <tr style="border-bottom:1px solid #0d0d0d;" class="wfd-var-res-row"
        onclick="navigator.clipboard.writeText('{${v.name}}').then(()=>toast('Copié : {${v.name}}'))"
        style="cursor:pointer;border-bottom:1px solid #0d0d0d;"
        title="Cliquer pour copier {${v.name}}">
        <td style="padding:5px 8px;color:#444;font-family:var(--font-mono);">${typeIcon(v.type)}</td>
        <td style="padding:5px 8px;font-family:var(--font-mono);color:#7ec8e3;">{${v.name}}</td>
        <td style="padding:5px 8px;color:#555;">${v.type||'string'}</td>
        <td style="padding:5px 8px;font-family:var(--font-mono);color:#e8c97a;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${val !== null && val !== undefined ? fmtVal(val) : '<span style="color:#333;">—</span>'}
        </td>
        <td style="padding:5px 8px;color:#555;">${v.origin||'—'}${v.system?'<span style="color:#444;margin-left:4px;font-size:9px;">SYS</span>':''}</td>
      </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}


function renderListeMappingsDirect(container) {
  if (!wfdMappings.length) {
    container.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:24px;">Aucun mapping. Créez-en un pour associer des champs entre systèmes.</div>';
    return;
  }
  container.innerHTML = wfdMappings.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
      background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;">
      <div>
        <div style="font-size:13px;color:#fff;font-weight:600;">🗂 ${m.name}</div>
        <div style="font-size:11px;color:#555;margin-top:2px;font-family:var(--font-mono);">
          ${(m.rows||[]).length} règle(s)
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="cfg-btn" style="width:auto;padding:5px 12px;" onclick="ouvrirMappingEdit('${m.id}')">Éditer</button>
        <button class="cfg-btn danger" style="width:auto;padding:5px 10px;" onclick="supprimerMapping('${m.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function renderContactsDansRessources() {
  const body = document.getElementById('res-contacts-body');
  if (!body) return;
  renderListesContacts();
  const src = document.getElementById('modal-contacts-body');
  if (src) body.innerHTML = src.innerHTML;
}

function renderTemplatesDansRessources() {
  const body = document.getElementById('res-templates-body');
  if (!body) return;
  // Renderer direct — injecter le HTML des templates sans passer par ouvrirTemplates
  if (typeof FLOW_TEMPLATES !== 'undefined') {
    body.innerHTML = Object.entries(FLOW_TEMPLATES).map(([key, tpl]) => `
      <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:4px;">📋 ${tpl.name}</div>
          <div style="font-size:11px;color:#555;line-height:1.5;">${tpl.description||''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            ${[...new Set((tpl.nodes||[]).map(n=>n.family))].map(f => {
              const fam = FAMILIES[f];
              return fam ? `<span style="padding:2px 8px;border-radius:10px;font-size:10px;
                background:${fam.color}22;color:${fam.color};border:1px solid ${fam.color}44;">
                ${fam.icon} ${fam.label}</span>` : '';
            }).join('')}
          </div>
        </div>
        <button class="cfg-btn primary" style="flex-shrink:0;white-space:nowrap;"
          onclick="chargerTemplate('${key}')">Charger ce template</button>
      </div>`).join('') || '<div style="color:#555;font-size:13px;text-align:center;padding:24px;">Aucun template disponible.</div>';
  } else if (typeof renderListeTemplates === 'function') {
    renderListeTemplates(body);
  }
}

// ── Scripts partagés ──────────────────────────────────────────────────────────
function renderScriptsPartages() {
  const body = document.getElementById('res-scripts-body');
  if (!body) return;
  if (!wfdScripts.length) {
    body.innerHTML = `<div style="color:#555;font-size:13px;text-align:center;padding:24px;">
      Aucun script partagé.<br>
      <span style="font-size:11px;">Créez des scripts réutilisables dans plusieurs flux. Les nœuds Script peuvent y faire référence — modifier le script ici met à jour tous les nœuds qui l'utilisent.</span>
    </div>`;
    return;
  }
  body.innerHTML = wfdScripts.map(s => {
    // Compter les nœuds qui référencent ce script
    let refCount = 0;
    wfdFlows.forEach(f => (f.nodes||[]).forEach(n => {
      if (n.family === 'script' && n.config?.scriptRef === s.id) refCount++;
    }));
    const langColor = s.lang === 'python' ? '#3498db' : '#f39c12';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
      background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;color:#fff;font-weight:600;">⚡ ${escHtml(s.name)}</span>
          <span style="font-size:10px;color:${langColor};font-family:var(--font-mono);border:1px solid ${langColor};border-radius:3px;padding:1px 5px;">${s.lang||'js'}</span>
        </div>
        <div style="font-size:11px;color:#555;margin-top:2px;">
          ${escHtml(s.description||'')}
          <span style="color:#3a3a3a;margin-left:8px;">${refCount} nœud${refCount>1?'s':''} référencent ce script</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="cfg-btn" style="width:auto;padding:5px 12px;" onclick="editerScriptPartage('${s.id}')">Éditer</button>
        <button class="cfg-btn danger" style="width:auto;padding:5px 10px;" onclick="supprimerScriptPartage('${s.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function creerScriptPartage() {
  const footer = document.getElementById('res-footer');
  if (!footer) { toast('Ouvrez Ressources > Scripts pour créer un script', true); return; }
  footer.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;width:100%;">
      <input id="new-script-name" class="cfg-input" style="flex:1;" placeholder="Nom du script (ex : Préparer ACL)" autofocus>
      <button class="cfg-btn primary" onclick="confirmerCreerScript()">✓ Créer</button>
      <button class="cfg-btn" onclick="resTab('scripts')">Annuler</button>
    </div>`;
  setTimeout(()=>{ if(document.activeElement) document.activeElement.blur(); document.getElementById('new-script-name')?.focus({ preventScroll: true }); },100);
}
function confirmerCreerScript() {
  const name = document.getElementById('new-script-name')?.value?.trim();
  if (!name) return;
  const s = {
    id: 'scr-' + Date.now(),
    name: name,
    lang: 'javascript',
    code: '// Script partagé : ' + name + '\n// msg contient : asset, metadata, collection\n\nreturn msg;',
    description: ''
  };
  wfdScripts.push(s);
  sauvegarderEtat();
  editerScriptPartage(s.id);
}

function editerScriptPartage(id) {
  const s = wfdScripts.find(x => x.id === id);
  if (!s) return;
  // Réutilise l'éditeur de script existant
  fermerRessources();
  if (typeof ouvrirEditeurScript === 'function') {
    ouvrirEditeurScript(null, s); // mode script partagé
  }
}

function supprimerScriptPartage(id) {
  const s = wfdScripts.find(x => x.id === id);
  if (!s) return;
  // Vérifier les références
  let refCount = 0;
  wfdFlows.forEach(f => (f.nodes||[]).forEach(n => {
    if (n.family === 'script' && n.config?.scriptRef === id) refCount++;
  }));
  const msg = refCount > 0
    ? `Ce script est utilisé par ${refCount} nœud(s). Supprimer quand même ?`
    : `Supprimer le script "${s.name}" ?`;
  if (!confirm(msg)) return;
  wfdScripts = wfdScripts.filter(x => x.id !== id);
  sauvegarderEtat();
  renderScriptsPartages();
}

function ouvrirMappingEdit(id) {
  // Déléguer à la modale mapping existante
  const m = wfdMappings.find(x=>x.id===id);
  if (!m) return;
  fermerRessources();
  setTimeout(() => editerMapping(id), 50);
}
function supprimerMapping(id) {
  if (!confirm('Supprimer ce mapping ?')) return;
  wfdMappings = wfdMappings.filter(x=>x.id!==id);
  sauvegarderEtat();
  renderListeMappingsDirect(document.getElementById('res-mappings-body'));
}


// ══ CONNEXIONS EXTERNES ═══════════════════════════════════════════════════════
// Une connexion = plateforme tierce + auth + endpoint généré + mappings associés

const AUTH_TYPES = {
  none        : 'Aucune (endpoint public)',
  bearer      : 'Bearer Token',
  basic       : 'Basic Auth (user:password)',
  apikey_header: 'API Key (header)',
  apikey_query : 'API Key (query string)',
  hmac        : 'HMAC Signature',
  aws_s3      : 'AWS S3 (Signature V4)',
};

function renderConnexions() {
  const body = document.getElementById('res-connexions-body');
  if (!body) return;
  if (!wfdConnexions.length) {
    body.innerHTML = `<div style="color:#555;font-size:13px;text-align:center;padding:24px;">
      Aucune connexion externe.<br>
      <span style="font-size:11px;color:#444;">
        Créez une connexion pour qu'une plateforme tierce puisse déclencher vos workflows.<br>
        Chaque connexion génère un endpoint unique et gère l'authentification entrante.
      </span>
    </div>`;
    return;
  }
  body.innerHTML = wfdConnexions.map(c => {
    const isOut = c.direction === 'outbound' || (!c.direction && !c.endpoint);
    const dirLabel  = isOut
      ? '<span style="color:#3498db;border-color:#3498db;">↑ Sortante</span>'
      : '<span style="color:#27ae60;border-color:#27ae60;">↓ Entrante</span>';
    const info = isOut
      ? escHtml(c.endpoint || c.baseUrl || '— URL de base non configurée')
      : escHtml(c.endpoint || '—');
    const mappingCount = (c.mappings||[]).length;
    const usedBy = wfdFlows.reduce((n, f) =>
      n + (f.nodes||[]).filter(nd =>
        nd.config?.connexionId===c.id ||
        nd.config?.s3ConnexionId===c.id
      ).length, 0);
    return `
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;color:#fff;font-weight:600;">${isOut?'🌐':'🔌'} ${escHtml(c.name)}</span>
            <span style="font-size:10px;font-family:var(--font-mono);border:1px solid;border-radius:3px;padding:1px 5px;">${dirLabel}</span>
            <span style="font-size:10px;color:#888;font-family:var(--font-mono);border:1px solid #2a2a2a;border-radius:3px;padding:1px 5px;">${AUTH_TYPES[c.authType]||c.authType||'—'}</span>
          </div>
          <div style="font-size:11px;color:#555;margin-top:3px;font-family:var(--font-mono);">
            ${info}
            <span style="color:#3a3a3a;margin-left:10px;">${usedBy} nœud(s)</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${!isOut ? `<button class="cfg-btn" style="width:auto;padding:5px 10px;" onclick="copierEndpoint('${c.id}')" title="Copier l'URL">⎘</button>` : ''}
          <button class="cfg-btn" style="width:auto;padding:5px 12px;" onclick="editerConnexion('${c.id}')">Éditer</button>
          <button class="cfg-btn danger" style="width:auto;padding:5px 10px;" onclick="supprimerConnexion('${c.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function creerConnexion() {
  const footer = document.getElementById('res-footer');
  if (!footer) return;
  footer.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">
      <input id="new-conn-name" class="cfg-input" style="flex:1;min-width:180px;"
        placeholder="Nom (ex : VodFactory, Slack, SendGrid…)">
      <select id="new-conn-dir" class="cfg-select" style="width:160px;">
        <option value="outbound">↑ Sortante (WFD → API)</option>
        <option value="inbound">↓ Entrante (API → WFD)</option>
      </select>
      <button class="cfg-btn primary" onclick="confirmerCreerConnexion()">✓ Créer</button>
      <button class="cfg-btn" onclick="resTab('connexions')">Annuler</button>
    </div>`;
  setTimeout(()=>{ document.getElementById('new-conn-name')?.focus({ preventScroll: true }); }, 100);
}

function confirmerCreerConnexion() {
  const name = document.getElementById('new-conn-name')?.value?.trim();
  if (!name) return;
  const dir  = document.getElementById('new-conn-dir')?.value || 'outbound';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const c = {
    id          : 'conn-' + Date.now(),
    name,
    direction   : dir,
    // Sortante
    baseUrl     : '',
    headers     : [],  // [{ key, value }] — headers fixes (ex: Accept-Language: fr-FR)
    authType    : 'bearer',
    authValue   : '',
    description : '',
    // Entrante (legacy)
    endpoint    : dir === 'inbound' ? '/wfd/listener/' + slug : '',
    mappings    : [],
  };
  wfdConnexions.push(c);
  sauvegarderEtat();
  editerConnexion(c.id);
}

function editerConnexion(id) {
  const c = wfdConnexions.find(x=>x.id===id);
  if (!c) return;
  const body   = document.getElementById('res-body');
  const footer = document.getElementById('res-footer');
  if (!body) return;

  const authOpts = Object.entries(AUTH_TYPES).map(([k,v])=>
    `<option value="${k}" ${c.authType===k?'selected':''}>${v}</option>`).join('');

  const mappingsHtml = (c.mappings||[]).map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
      background:#111;border:1px solid #2a2a2a;border-radius:5px;">
      <span style="font-size:12px;color:#ccc;">🗂 ${escHtml(m.name)}</span>
      <div style="display:flex;gap:5px;">
        <button class="cfg-btn" style="padding:3px 10px;font-size:11px;" onclick="editerMappingConnexion('${id}','${m.id}')">Éditer</button>
        <button class="cfg-btn danger" style="padding:3px 8px;font-size:11px;" onclick="supprimerMappingConnexion('${id}','${m.id}')">🗑</button>
      </div>
    </div>`).join('') || '<div style="color:#444;font-size:11px;padding:6px 0;">Aucun mapping — ajoutez-en un ci-dessous.</div>';

  const isOut = c.direction === 'outbound' || (!c.direction && !c.endpoint);

  // Champs headers fixes pour connexion sortante
  const headersHtml = (c.headers||[]).map((h,i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
      <input class="cfg-input conn-header-key" style="flex:1;" value="${escHtml(h.key)}" placeholder="Clé (ex: Accept-Language)">
      <input class="cfg-input conn-header-val" style="flex:2;" value="${escHtml(h.value)}" placeholder="Valeur (ex: fr-FR)">
      <button class="cfg-btn danger" style="padding:4px 8px;" onclick="this.parentElement.remove()">✕</button>
    </div>`).join('');

  body.innerHTML = `
    <div class="res-tab-panel" style="gap:14px;">
      <!-- Header retour -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <button class="cfg-btn" style="padding:4px 10px;" onclick="resTab('connexions')">← Retour</button>
        <input id="conn-name" class="cfg-input" value="${escHtml(c.name)}" style="flex:1;font-weight:600;" placeholder="Nom">
        <span style="font-size:11px;padding:3px 8px;border-radius:3px;border:1px solid ${isOut?'#3498db':'#27ae60'};color:${isOut?'#3498db':'#27ae60'};">
          ${isOut ? '↑ Sortante' : '↓ Entrante'}
        </span>
      </div>

      ${isOut ? `
      <!-- URL de base (sortante) -->
      <div class="cfg-field">
        <label class="cfg-label">URL de base</label>
        <input id="conn-base-url" class="cfg-input" value="${escHtml(c.endpoint||c.baseUrl||'')}"
          style="font-family:var(--font-mono);font-size:12px;color:#3498db;"
          placeholder="https://otto-partner.vodfactory.com">
        <div style="font-size:10px;color:#444;margin-top:3px;">
          Les nœuds HTTP Request utiliseront cette URL de base + l'endpoint configuré dans le nœud.
        </div>
      </div>
      ` : `
      <!-- Endpoint généré (entrante) -->
      <div class="cfg-field">
        <label class="cfg-label">Endpoint généré (URL à communiquer à la plateforme)</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="conn-endpoint" class="cfg-input" value="${escHtml(c.endpoint||'')}"
            style="flex:1;font-family:var(--font-mono);font-size:12px;color:#27ae60;"
            placeholder="/wfd/listener/nom-plateforme">
          <button class="cfg-btn" onclick="copierEndpoint('${id}')" title="Copier" style="padding:6px 10px;">⎘</button>
        </div>
        <div style="font-size:10px;color:#444;margin-top:3px;">
          URL complète : <span style="color:#555;font-family:var(--font-mono);" id="conn-full-url">http://localhost:1881${escHtml(c.endpoint||'')}</span>
        </div>
      </div>
      `}

      <!-- Auth -->
      <div class="cfg-field">
        <label class="cfg-label">${isOut ? 'Authentification sortante' : 'Authentification entrante'}</label>
        <select id="conn-auth-type" class="cfg-select" onchange="majAuthConnexion()">
          ${authOpts}
        </select>
      </div>
      <div id="conn-auth-value-wrap" class="cfg-field" style="${c.authType==='none'||c.authType==='aws_s3'?'display:none':''}">
        <label class="cfg-label" id="conn-auth-label">${getAuthLabel(c.authType)}</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="conn-auth-value" class="cfg-input" type="${isOut?'text':'text'}"
            value="${escHtml(c.authValue||'')}" placeholder="${isOut ? 'Token / clé API…' : 'Valeur secrète…'}"
            style="flex:1;font-family:var(--font-mono);">
          ${isOut ? '' : `
          <button class="cfg-btn" onclick="genererSecret()" title="Générer un token aléatoire" style="padding:6px 10px;">⚄ Générer</button>
          <button class="cfg-btn" onclick="copierSecret()" title="Copier" style="padding:6px 10px;">⎘</button>`}
        </div>
        <div style="font-size:10px;color:#444;margin-top:3px;">
          ${isOut ? 'Envoyé automatiquement dans chaque requête HTTP Request.' : 'Communiquez cette valeur à la plateforme.'}
        </div>
      </div>

      <!-- Champs spécifiques AWS S3 -->
      <div id="conn-aws-wrap" style="${c.authType==='aws_s3'?'':'display:none'}">
        <div class="cfg-field">
          <label class="cfg-label">AWS Access Key ID</label>
          <input id="conn-aws-access-key" class="cfg-input" value="${escHtml((()=>{try{return JSON.parse(c.authValue||'{}').key||c.awsAccessKey||'';}catch(_){return c.awsAccessKey||'';}})())}"
            placeholder="AKIAIOSFODNN7EXAMPLE" style="font-family:var(--font-mono);">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">AWS Secret Access Key</label>
          <input id="conn-aws-secret-key" class="cfg-input" value="${escHtml((()=>{try{return JSON.parse(c.authValue||'{}').secret||c.awsSecretKey||'';}catch(_){return c.awsSecretKey||'';}})())}"
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" style="font-family:var(--font-mono);">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Région AWS</label>
          <input id="conn-aws-region" class="cfg-input" value="${escHtml((()=>{try{return JSON.parse(c.authValue||'{}').region||c.awsRegion||'eu-north-1';}catch(_){return c.awsRegion||'eu-north-1';}})())}"
            placeholder="eu-north-1" style="font-family:var(--font-mono);">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Bucket S3</label>
          <input id="conn-aws-bucket" class="cfg-input" value="${escHtml((()=>{try{return JSON.parse(c.authValue||'{}').bucket||c.awsBucket||'';}catch(_){return c.awsBucket||'';}})())}"
            placeholder="my-bucket-name" style="font-family:var(--font-mono);">
        </div>
      </div>

      ${isOut ? `
      <!-- Headers fixes (sortante) -->
      <div class="cfg-field">
        <label class="cfg-label">Headers fixes</label>
        <div id="conn-headers-list">${headersHtml}</div>
        <button class="cfg-btn" style="margin-top:6px;" onclick="connAjouterHeader()">+ Ajouter un header</button>
        <div style="font-size:10px;color:#444;margin-top:4px;">
          Ex: Accept-Language: fr-FR · Content-Type: application/json
        </div>
      </div>

      <!-- Rôles crédits (personnes) -->
      <div class="cfg-field">
        <label class="cfg-label">Rôles crédits disponibles</label>
        <div style="font-size:10px;color:#555;margin-bottom:6px;">
          Rôles acceptés par cette destination pour le champ <code>persons[]</code>.
          Séparés par des virgules.
        </div>
        <input id="conn-roles" class="cfg-input"
          value="${escHtml((c.roles||[]).join(', '))}"
          placeholder="director, producer, actor, writer, creator"
          style="font-family:var(--font-mono);">
      </div>
      ` : `
      <!-- Mappings (entrante) -->
      <div>
        <div class="cfg-label" style="margin-bottom:6px;">Mappings de payload</div>
        <div style="display:flex;flex-direction:column;gap:6px;" id="conn-mappings-list">
          ${(c.mappings||[]).map(m => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
              background:#111;border:1px solid #2a2a2a;border-radius:5px;">
              <span style="font-size:12px;color:#ccc;">🗂 ${escHtml(m.name)}</span>
              <div style="display:flex;gap:5px;">
                <button class="cfg-btn" style="padding:3px 10px;font-size:11px;" onclick="editerMappingConnexion('${id}','${m.id}')">Éditer</button>
                <button class="cfg-btn danger" style="padding:3px 8px;font-size:11px;" onclick="supprimerMappingConnexion('${id}','${m.id}')">🗑</button>
              </div>
            </div>`).join('') || '<div style="color:#444;font-size:11px;padding:6px 0;">Aucun mapping.</div>'}
        </div>
        <button class="cfg-btn" style="margin-top:8px;width:100%;" onclick="ajouterMappingConnexion('${id}')">+ Ajouter un mapping</button>
      </div>`}

      <!-- Actions de la connexion (sortantes) -->
      ${isOut ? `
      <div class="cfg-field">
        <label class="cfg-label" style="margin-bottom:6px;">Actions</label>
        <div style="display:flex;flex-direction:column;gap:6px;" id="conn-actions-list">
          ${(c.actions||[]).map(a => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
              background:#111;border:1px solid #2a2a2a;border-radius:5px;">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:12px;color:#ccc;">⚡ ${escHtml(a.name||'Sans nom')}</span>
                <span style="font-size:10px;color:#555;font-family:var(--font-mono);">${escHtml(a.method)} ${escHtml(a.endpoint)} · ${escHtml(a.mode||'simple')}</span>
              </div>
              <div style="display:flex;gap:5px;">
                <button class="cfg-btn" style="padding:3px 10px;font-size:11px;"
                  onclick="editerActionConnexion('${id}','${a.id}')">Éditer</button>
                <button class="cfg-btn danger" style="padding:3px 8px;font-size:11px;"
                  onclick="supprimerActionConnexion('${id}','${a.id}')">🗑</button>
              </div>
            </div>`).join('') || '<div style="color:#444;font-size:11px;padding:6px 0;">Aucune action configurée.</div>'}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="cfg-btn" style="flex:1;" onclick="ajouterActionConnexion('${id}')">+ Ajouter manuellement</button>
          ${c.apiSpec ? `<button class="cfg-btn" style="flex:1;border-color:#2ecc71;color:#2ecc71;"
            onclick="connShowGeneratedActions('${id}')">⚡ Actions suggérées</button>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Spec API (connexions sortantes) -->
      ${isOut ? `
      <div class="cfg-field">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label class="cfg-label" style="margin:0;">Spec API</label>
          <div style="display:flex;gap:6px;">
            ${c.apiSpec ? `<button class="cfg-btn" style="font-size:10px;padding:3px 8px;"
              onclick="connToggleApiSpec('${id}')">
              ${c._showApiSpec ? '▲ Masquer' : '▼ Voir les endpoints'}
            </button>
            <button class="cfg-btn danger" style="font-size:10px;padding:3px 8px;"
              onclick="connClearApiSpec('${id}')">✕ Supprimer</button>` : ''}
            <label class="cfg-btn" style="font-size:10px;padding:3px 8px;cursor:pointer;">
              ⬆ Importer
              <input type="file" accept=".yaml,.yml,.json" style="display:none"
                onchange="connImportApiSpec('${id}', this)">
            </label>
            ${c.apiSpec ? `<button class="cfg-btn" style="font-size:10px;padding:3px 8px;border-color:#2ecc71;color:#2ecc71;"
              onclick="connShowGeneratedActions('${id}')">⚡ Actions suggérées</button>` : ''}
          </div>
        </div>
        ${c.apiSpec ? `
          <!-- Résumé -->
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:5px;padding:8px 12px;font-size:11px;color:#666;">
            <span style="color:#7ec8e3;">${c.apiSpec.title || 'API'}</span>
            <span style="margin-left:8px;">${c.apiSpec.endpoints?.length || 0} endpoints importés</span>
            ${c.apiSpec.baseUrl ? `<span style="margin-left:8px;color:#444;">${c.apiSpec.baseUrl}</span>` : ''}
          </div>
          <!-- Vue détaillée (pliable) -->
          <div id="conn-api-spec-detail-${id}" style="${c._showApiSpec ? '' : 'display:none;'}margin-top:8px;">
            <!-- Mode basculant : liste WFD / JSON brut -->
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <button class="cfg-btn" id="conn-api-btn-wfd-${id}"
                style="${!c._apiSpecRaw ? 'border-color:#3498db;color:#3498db;' : ''};font-size:10px;padding:3px 8px;"
                onclick="connApiSpecMode('${id}', false)">Vue métier</button>
              <button class="cfg-btn" id="conn-api-btn-raw-${id}"
                style="${c._apiSpecRaw ? 'border-color:#e67e22;color:#e67e22;' : ''};font-size:10px;padding:3px 8px;"
                onclick="connApiSpecMode('${id}', true)">JSON brut</button>
            </div>
            <!-- Vue métier -->
            <div id="conn-api-wfd-${id}" style="${c._apiSpecRaw ? 'display:none;' : ''}">
              ${(c.apiSpec.endpoints || [])
                .filter(e => ['POST','PUT','PATCH'].includes(e.method))
                .map(e => `
                <div style="margin-bottom:6px;border:1px solid #1a1a1a;border-radius:4px;overflow:hidden;">
                  <div style="display:flex;align-items:center;gap:8px;padding:5px 10px;background:#111;cursor:pointer;"
                    onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                    <span style="font-size:10px;font-weight:700;color:${e.method==='POST'?'#2ecc71':e.method==='PATCH'?'#f39c12':'#3498db'};
                      background:${e.method==='POST'?'#0d2b1a':e.method==='PATCH'?'#2b1a00':'#0a1a2b'};
                      padding:1px 6px;border-radius:3px;font-family:var(--font-mono);">${e.method}</span>
                    <span style="font-size:11px;color:#aaa;font-family:var(--font-mono);">${escHtml(e.path)}</span>
                    <span style="font-size:10px;color:#555;margin-left:auto;">${e.summary || ''}</span>
                  </div>
                  <div style="display:none;padding:8px 10px;">
                    ${e.fields?.filter(f => !f.path.includes('.')).slice(0,15).map(f => `
                      <div style="display:flex;gap:8px;padding:2px 0;font-size:10px;border-bottom:1px solid #111;">
                        <span style="color:${f.required?'#e74c3c':'#7ec8e3'};font-family:var(--font-mono);width:140px;flex-shrink:0;">${escHtml(f.path)}</span>
                        <span style="color:#555;width:60px;">${f.type}</span>
                        <span style="color:#333;">${f.required ? 'requis' : ''}</span>
                        <span style="color:#444;">${f.enum?.slice(0,4).join(' | ') || ''}</span>
                      </div>`).join('')}
                    ${(e.fields?.filter(f => !f.path.includes('.')).length || 0) > 15 ?
                      `<div style="font-size:10px;color:#444;margin-top:4px;">+ ${e.fields.filter(f=>!f.path.includes('.')).length - 15} autres champs</div>` : ''}
                  </div>
                </div>`).join('')}
            </div>
            <!-- JSON brut -->
            <div id="conn-api-raw-${id}" style="${c._apiSpecRaw ? '' : 'display:none;'}">
              <textarea id="conn-api-raw-ta-${id}" class="cfg-textarea" rows="10"
                style="font-family:var(--font-mono);font-size:10px;"
                onchange="connApiSpecRawEdit('${id}', this.value)">${escHtml(JSON.stringify(c.apiSpec, null, 2))}</textarea>
            </div>
          </div>
        ` : `<div style="font-size:11px;color:#444;padding:6px 0;">Aucune spec importée. Importez un fichier OpenAPI (.yaml ou .json) pour activer la configuration automatique.</div>`}
      </div>
      ` : ''}

      <!-- Description -->
      <div class="cfg-field">
        <label class="cfg-label">Description</label>
        <textarea id="conn-description" class="cfg-textarea" rows="2"
          placeholder="Notes sur cette connexion…">${escHtml(c.description||'')}</textarea>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="cfg-btn" onclick="resTab('connexions')">Annuler</button>
    ${isOut ? `<button class="cfg-btn" id="conn-test-btn" onclick="testerConnexion('${id}')"
      style="border-color:#f39c12;color:#f39c12;">⚡ Tester</button>` : ''}
    <button class="cfg-btn primary" onclick="sauvegarderConnexion('${id}')">✓ Sauvegarder</button>`;

  if (!isOut) {
    document.getElementById('conn-endpoint')?.addEventListener('input', function() {
      const full = document.getElementById('conn-full-url');
      if (full) full.textContent = 'http://localhost:1881' + this.value;
    });
  }
}

async function testerConnexion(id) {
  const c = wfdConnexions.find(x => x.id === id);
  if (!c) return;
  const btn = document.getElementById('conn-test-btn');
  if (btn) { btn.textContent = '⏳ Test…'; btn.disabled = true; }

  // Lire les valeurs actuelles du formulaire (pas encore sauvegardées)
  const baseUrl   = document.getElementById('conn-base-url')?.value?.trim() || c.baseUrl;
  const authType  = document.getElementById('conn-auth-type')?.value || c.authType;
  const authValue = document.getElementById('conn-auth-value')?.value || c.authValue;

  // Construire les headers
  const headers = { 'Content-Type': 'application/json' };
  if (authType === 'bearer' && authValue)    headers['Authorization'] = 'Bearer ' + authValue;
  if (authType === 'apikey_header' && authValue) headers['X-API-Key'] = authValue;

  // Lire les headers fixes du formulaire
  document.querySelectorAll('.conn-header-key').forEach((keyEl, i) => {
    const valEl = document.querySelectorAll('.conn-header-val')[i];
    const key   = keyEl.value.trim();
    const value = valEl?.value.trim() || '';
    if (key) headers[key] = value;
  });

  // Endpoint de test — essayer GET / puis GET /api/languages
  const testEndpoints = ['/api/languages', '/api/genres', '/api/countries', '/'];
  let ok = false, statusCode = null, errorMsg = null;

  for (const ep of testEndpoints) {
    try {
      const r = await fetch(baseUrl + ep, { method: 'GET', headers });
      statusCode = r.status;
      if (r.status < 500) { ok = true; break; }
    } catch(e) {
      errorMsg = e.message;
    }
  }

  if (btn) { btn.textContent = '⚡ Tester'; btn.disabled = false; }

  if (ok) {
    const msg = statusCode === 200
      ? '✅ Connexion réussie — API joignable et token valide'
      : statusCode === 401
      ? '⚠️ API joignable mais token invalide ou manquant (401)'
      : statusCode === 403
      ? '⚠️ API joignable mais accès refusé (403)'
      : `✅ API joignable — HTTP ${statusCode}`;
    toast(msg);
    if (btn) {
      btn.textContent = statusCode === 200 ? '✅ OK' : '⚠️ ' + statusCode;
      btn.style.borderColor = statusCode === 200 ? '#27ae60' : '#e67e22';
      btn.style.color       = statusCode === 200 ? '#27ae60' : '#e67e22';
    }
  } else {
    toast('❌ Connexion impossible — ' + (errorMsg || "Vérifiez l'URL de base"));
    if (btn) {
      btn.textContent = '❌ Échec';
      btn.style.borderColor = '#e74c3c';
      btn.style.color       = '#e74c3c';
    }
  }
}

function connAjouterHeader() {
  const list = document.getElementById('conn-headers-list');
  if (!list) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';
  div.innerHTML = `
    <input class="cfg-input conn-header-key" style="flex:1;" placeholder="Clé (ex: Accept-Language)">
    <input class="cfg-input conn-header-val" style="flex:2;" placeholder="Valeur (ex: fr-FR)">
    <button class="cfg-btn danger" style="padding:4px 8px;" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(div);
}


function genererSecret() {
  // Génère 32 octets aléatoires → hex (64 chars) — cryptographiquement sûr
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array).map(b => b.toString(16).padStart(2,'0')).join('');
  const input = document.getElementById('conn-auth-value');
  if (input) {
    input.value = token;
    input.type  = 'text'; // s'assurer qu'il est visible
    input.style.color = '#27ae60';
    setTimeout(() => { if (input) input.style.color = ''; }, 1500);
  }
  toast('Token généré — pensez à sauvegarder et à le communiquer à la plateforme');
}

function copierSecret() {
  const val = document.getElementById('conn-auth-value')?.value;
  if (!val) { toast('Aucune valeur à copier', true); return; }
  navigator.clipboard.writeText(val)
    .then(()  => toast('Secret copié ✓'))
    .catch(()  => toast('Copie échouée', true));
}

function getAuthLabel(authType) {
  const labels = {
    bearer       : 'Token Bearer attendu',
    basic        : 'Credentials Basic (user:password)',
    apikey_header: 'Nom du header + valeur (ex: X-Api-Key:secret)',
    apikey_query : 'Nom du paramètre + valeur (ex: api_key:secret)',
    hmac         : 'Secret HMAC',
    none         : '',
  };
  return labels[authType] || 'Valeur';
}

function majAuthConnexion() {
  const type = document.getElementById('conn-auth-type')?.value;
  const wrap  = document.getElementById('conn-auth-value-wrap');
  const label = document.getElementById('conn-auth-label');
  const awsWrap = document.getElementById('conn-aws-wrap');
  if (wrap)    wrap.style.display    = (type==='none' || type==='aws_s3') ? 'none' : '';
  if (awsWrap) awsWrap.style.display = type==='aws_s3' ? '' : 'none';
  if (label)   label.textContent     = getAuthLabel(type);
}

function sauvegarderConnexion(id) {
  const c = wfdConnexions.find(x=>x.id===id);
  if (!c) return;
  const isOut = c.direction === 'outbound' || (!c.direction && !c.endpoint);
  c.name        = document.getElementById('conn-name')?.value?.trim()       || c.name;
  c.authType    = document.getElementById('conn-auth-type')?.value          || c.authType;
  c.authValue   = document.getElementById('conn-auth-value')?.value         || '';
  // Champs spécifiques AWS S3
  if (c.authType === 'aws_s3') {
    c.awsAccessKey = document.getElementById('conn-aws-access-key')?.value?.trim() || '';
    c.awsSecretKey = document.getElementById('conn-aws-secret-key')?.value?.trim() || '';
    c.awsRegion    = document.getElementById('conn-aws-region')?.value?.trim()     || 'eu-north-1';
    c.awsBucket    = document.getElementById('conn-aws-bucket')?.value?.trim()     || '';
  }
  c.description = document.getElementById('conn-description')?.value        || '';
  if (isOut) {
    c.baseUrl = document.getElementById('conn-base-url')?.value?.trim() || '';
    // Lire les headers fixes
    c.headers = [];
    document.querySelectorAll('.conn-header-key').forEach((keyEl, i) => {
      const valEl = document.querySelectorAll('.conn-header-val')[i];
      const key   = keyEl.value.trim();
      const value = valEl?.value.trim() || '';
      if (key) c.headers.push({ key, value });
    });
    // Lire les rôles crédits
    const rolesRaw = document.getElementById('conn-roles')?.value?.trim() || '';
    c.roles = rolesRaw ? rolesRaw.split(',').map(r => r.trim()).filter(Boolean) : [];
  } else {
    c.endpoint = document.getElementById('conn-endpoint')?.value?.trim() || c.endpoint;
  }
  // S'assurer que l'endpoint commence par /
  if (c.endpoint && !c.endpoint.startsWith('/')) c.endpoint = '/' + c.endpoint;
  sauvegarderEtat();
  resTab('connexions');
  toast('Connexion sauvegardée ✓');
}


// ── Connexion — Import et gestion de la spec API (OpenAPI) ───────────────────

function connToggleApiSpec(connId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  c._showApiSpec = !c._showApiSpec;
  editerConnexion(connId);
}

function connApiSpecMode(connId, raw) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  c._apiSpecRaw = raw;
  editerConnexion(connId);
}

function connApiSpecRawEdit(connId, value) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  try {
    c.apiSpec = JSON.parse(value);
  } catch(e) {
    // JSON invalide — on ne met pas à jour
  }
}

function connClearApiSpec(connId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c || !confirm('Supprimer la spec API importée ?')) return;
  delete c.apiSpec;
  delete c._showApiSpec;
  delete c._apiSpecRaw;
  sauvegarderEtat();
  editerConnexion(connId);
}

function connImportApiSpec(connId, input) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c || !input.files?.[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let raw = e.target.result;
      let parsed;
      if (file.name.endsWith('.json')) {
        parsed = JSON.parse(raw);
      } else {
        // Parser YAML (on utilise js-yaml si disponible, sinon on le parse manuellement)
        if (typeof jsyaml !== 'undefined') {
          parsed = jsyaml.load(raw);
        } else {
          // Fallback : appeler le main process pour parser le YAML via IPC
          window.WfdEngineInstance?.parseOpenApi?.(raw, file.name)
            .then(result => {
              if (result.error) { toast('Erreur YAML : ' + result.error, 'error'); return; }
              c.apiSpec = _connParseOpenApi(result.data);
              c._showApiSpec = true;
              sauvegarderEtat();
              editerConnexion(connId);
              toast('Spec API importée — ' + (c.apiSpec.endpoints?.length || 0) + ' endpoints');
            })
            .catch(err => toast('Erreur import : ' + err.message, 'error'));
          return;
        }
      }
      c.apiSpec = _connParseOpenApi(parsed);
      c._showApiSpec = true;
      sauvegarderEtat();
      editerConnexion(connId);
      toast('Spec API importée — ' + (c.apiSpec.endpoints?.length || 0) + ' endpoints');
    } catch(err) {
      toast('Erreur import spec API : ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function _connParseOpenApi(api) {
  /** Parse une spec OpenAPI 3.x et retourne un objet simplifié */
  function resolveRef(ref) {
    const parts = ref.replace(/^#\//, '').split('/');
    let obj = api;
    for (const p of parts) obj = obj?.[p];
    return obj || {};
  }

  function parseSchema(schema, path, depth) {
    if (!schema || depth > 4) return [];
    if (schema.$ref) schema = resolveRef(schema.$ref);
    const fields = [];
    const t = schema.type || 'object';
    if (t === 'object' && schema.properties) {
      const required = schema.required || [];
      for (const [name, prop] of Object.entries(schema.properties)) {
        let p = prop.$ref ? resolveRef(prop.$ref) : prop;
        const fieldPath = path ? `${path}.${name}` : name;
        fields.push({
          path: fieldPath,
          type: p.type || 'string',
          required: required.includes(name),
          description: p.description || '',
          enum: p.enum || [],
        });
        if (p.type === 'object') {
          fields.push(...parseSchema(p, fieldPath, depth + 1));
        } else if (p.type === 'array' && p.items) {
          const items = p.items.$ref ? resolveRef(p.items.$ref) : p.items;
          if (items.type === 'object') {
            fields.push(...parseSchema(items, fieldPath + '[]', depth + 1));
          }
        }
      }
    }
    return fields;
  }

  const result = {
    title:     api.info?.title || '',
    version:   api.info?.version || '',
    baseUrl:   api.servers?.[0]?.url || '',
    endpoints: [],
  };

  for (const [path, methods] of Object.entries(api.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get','post','put','patch','delete'].includes(method)) continue;
      const body   = op.requestBody?.content?.['application/json']?.schema;
      const fields = body ? parseSchema(body, '', 0) : [];
      const pathParams = (op.parameters || [])
        .filter(p => p.in === 'path')
        .map(p => ({ name: p.name, required: p.required || false }));
      result.endpoints.push({
        path, method: method.toUpperCase(),
        summary: op.summary || '',
        operationId: op.operationId || '',
        fields, pathParams,
      });
    }
  }
  return result;
}


// ── Connexion — Actions CRUD ──────────────────────────────────────────────────

function _connGenId() {
  return 'action-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function ajouterActionConnexion(connId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  c.actions = c.actions || [];
  const newAction = {
    id: _connGenId(), name: '', method: 'POST', endpoint: '',
    mode: 'simple', sourceVar: '', bodyTemplate: '', resultVar: '',
    ignoreCodes: [422], job: 'director',
  };
  c.actions.push(newAction);
  editerActionConnexion(connId, newAction.id);
}

function editerActionConnexion(connId, actionId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  const a = (c.actions || []).find(x => x.id === actionId);
  if (!a) return;
  const body   = document.getElementById('res-body');
  const footer = document.getElementById('res-footer');
  if (!body) return;

  const modeOpts = [
    { value: 'simple',  label: 'Requête simple' },
    { value: 'foreach', label: 'Pour chaque valeur' },
    { value: 'verify',  label: 'Vérifier' },
  ].map(m => `<option value="${m.value}" ${a.mode===m.value?'selected':''}>${m.label}</option>`).join('');

  const methodOpts = ['GET','POST','PUT','PATCH','DELETE'].map(m =>
    `<option value="${m}" ${a.method===m?'selected':''}>${m}</option>`
  ).join('');

  body.innerHTML = `
    <div class="res-tab-panel" style="gap:14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <button class="cfg-btn" style="padding:4px 10px;" onclick="editerConnexion('${connId}')">← Retour</button>
        <span style="font-size:13px;font-weight:600;color:#ccc;">Action</span>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Nom de l'action (métier)</label>
        <input id="conn-action-name" class="cfg-input" value="${escHtml(a.name)}"
          placeholder="ex: Créer une personne, Créer un contenu…">
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Mode</label>
        <select id="conn-action-mode" class="cfg-select" onchange="connActionModeChange()">
          ${modeOpts}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;">
        <div class="cfg-field">
          <label class="cfg-label">Méthode</label>
          <select id="conn-action-method" class="cfg-select">${methodOpts}</select>
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Endpoint</label>
          <input id="conn-action-endpoint" class="cfg-input"
            value="${escHtml(a.endpoint)}" placeholder="/api/persons"
            style="font-family:var(--font-mono);font-size:12px;">
        </div>
      </div>
      <div id="conn-action-foreach-fields" style="${a.mode!=='foreach'?'display:none':''}">
        <div class="cfg-field">
          <label class="cfg-label">Variable source (multi-valeur)</label>
          <input id="conn-action-source-var" class="cfg-input"
            value="${escHtml(a.sourceVar||'')}" placeholder="{Realisateur}"
            style="font-family:var(--font-mono);">
        </div>
        <div class="cfg-field">
          <label class="cfg-label">Rôle (job)</label>
          <select id="conn-action-job" class="cfg-select">
            ${['director','actor','producer','writer','creator'].map(j =>
              `<option value="${j}" ${(a.job||'director')===j?'selected':''}>${j}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Codes HTTP à ignorer <span style="color:#555;font-size:9px;">(ex: 409, 422)</span></label>
        <input id="conn-action-ignore-codes" class="cfg-input"
          value="${escHtml((a.ignoreCodes||[]).join(', '))}" placeholder="ex: 422"
          style="font-family:var(--font-mono);">
        <div style="font-size:10px;color:#555;margin-top:3px;">Ces codes HTTP seront traités comme des succès</div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Variable source <span style="color:#555;font-size:9px;">(payload du Lookup)</span></label>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:var(--font-mono);color:#555;">{</span>
          <input id="conn-action-source-var-simple" class="cfg-input"
            value="${escHtml(a.sourceVar||'')}" placeholder="vodFactoryPayload"
            style="font-family:var(--font-mono);">
          <span style="font-family:var(--font-mono);color:#555;">}</span>
        </div>
        <div style="font-size:10px;color:#555;margin-top:3px;">
          Nom de la variable produite par le Lookup — son contenu sera envoyé comme body
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Body JSON template <span style="color:#555;font-size:9px;">(optionnel — écrase la variable source)</span></label>
        <textarea id="conn-action-body" class="cfg-textarea" rows="4"
          style="font-family:var(--font-mono);font-size:11px;"
          placeholder='{"name":"{{nom}}","external_id":"{{slug(nom)}}"}'>${escHtml(a.bodyTemplate||'')}</textarea>
        <div style="font-size:10px;color:#555;margin-top:3px;">
          Utilisez <code>{{nom}}</code> pour la valeur, <code>{{slug(nom)}}</code> pour le slug.
          Les variables WFD <code>{varName}</code> sont aussi supportées.
        </div>
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Stocker le résultat dans</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:var(--font-mono);color:#555;">{</span>
          <input id="conn-action-result-var" class="cfg-input"
            value="${escHtml(a.resultVar||'')}" placeholder="personsPayload"
            style="font-family:var(--font-mono);">
          <span style="font-family:var(--font-mono);color:#555;">}</span>
        </div>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="cfg-btn" onclick="editerConnexion('${connId}')">Annuler</button>
    <button class="cfg-btn primary" onclick="sauvegarderActionConnexion('${connId}','${actionId}')">✓ Sauvegarder</button>`;
}

function connActionModeChange() {
  const mode = document.getElementById('conn-action-mode')?.value;
  const f = document.getElementById('conn-action-foreach-fields');
  if (f) f.style.display = mode === 'foreach' ? '' : 'none';
}

function sauvegarderActionConnexion(connId, actionId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  const a = (c.actions || []).find(x => x.id === actionId);
  if (!a) return;
  a.name         = document.getElementById('conn-action-name')?.value?.trim()        || '';
  a.mode         = document.getElementById('conn-action-mode')?.value                || 'simple';
  a.method       = document.getElementById('conn-action-method')?.value              || 'POST';
  a.endpoint     = document.getElementById('conn-action-endpoint')?.value?.trim()    || '';
  a.sourceVar    = (document.getElementById('conn-action-source-var-simple')?.value?.trim() || document.getElementById('conn-action-source-var')?.value?.trim()) || '';
  a.job          = document.getElementById('conn-action-job')?.value                 || 'director';
  a.bodyTemplate = document.getElementById('conn-action-body')?.value                || '';
  a.resultVar    = document.getElementById('conn-action-result-var')?.value?.trim()  || '';
  const codesRaw = document.getElementById('conn-action-ignore-codes')?.value        || '';
  a.ignoreCodes  = codesRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  // Préserver _specFields — issu de la spec OpenAPI, non éditable dans le formulaire
  if (!a._specFields) a._specFields = [];
  sauvegarderEtat();
  editerConnexion(connId);
  toast('Action sauvegardée ✓');
}

function supprimerActionConnexion(connId, actionId) {
  const c = wfdConnexions.find(x => x.id === connId);
  if (!c) return;
  if (!confirm('Supprimer cette action ?')) return;
  c.actions = (c.actions || []).filter(x => x.id !== actionId);
  sauvegarderEtat();
  editerConnexion(connId);
  toast('Action supprimée');
}

// ── Connexion — Actions suggérées depuis la spec API ──────────────────────────

function _connComputeActions(connId) {
  const c = wfdConnexions?.find(x => x.id === connId);
  if (!c?.apiSpec) return [];
  const lookupTargets = new Set();
  (wfdFlows || []).forEach(flux => {
    (flux.nodes || []).forEach(node => {
      if (node.family !== 'lookup') return;
      (node.config?.lkRows || []).forEach(row => {
        if (row.value) lookupTargets.add(row.value.split('.')[0]);
      });
    });
  });
  return (c.apiSpec.endpoints || [])
    .filter(ep => ['POST','PUT','PATCH'].includes(ep.method))
    .map(ep => {
      const topFields = (ep.fields || []).filter(f => !f.path.includes('.'));
      const matches   = topFields.filter(f => lookupTargets.has(f.path.split('.')[0]));
      return { ...ep, _score: matches.length, _matchedFields: matches.map(f => f.path) };
    })
    .filter(ep => ep._score > 0 || ep.path.includes('/send') || ep.path.includes('/unpublish'))
    .sort((a, b) => b._score - a._score);
}

function connShowGeneratedActions(connId) {
  const c = wfdConnexions?.find(x => x.id === connId);
  if (!c?.apiSpec) { toast('Importez d\'abord une spec API', 'warn'); return; }
  const actions = _connComputeActions(connId);
  const body    = document.getElementById('res-body');
  const footer  = document.getElementById('res-footer');
  if (!body) return;

  body.innerHTML = `
    <div class="res-tab-panel" style="gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <button class="cfg-btn" style="padding:4px 10px;" onclick="editerConnexion('${connId}')">← Retour</button>
        <span style="font-size:13px;font-weight:600;color:#ccc;">Actions suggérées</span>
        <span style="font-size:11px;color:#555;">${actions.length} endpoint(s) pertinent(s)</span>
      </div>
      <div style="font-size:11px;color:#555;margin-bottom:8px;">
        Basé sur le croisement entre la spec API et les champs cibles de vos Tables de correspondance.
        Cochez les Actions à activer.
      </div>
      ${actions.map((ep, i) => {
        const existing = (c.actions || []).find(a => a.endpoint === ep.path && a.method === ep.method);
        return `
        <div style="display:flex;gap:10px;padding:10px;background:#0a0a0a;
          border:1px solid ${existing?'#1a4a2a':'#1a1a1a'};border-radius:5px;align-items:flex-start;">
          <input type="checkbox" id="gen-action-${i}" ${existing?'checked':''}
            style="margin-top:3px;cursor:pointer;"
            onchange="connToggleGeneratedAction('${connId}',${i},this.checked)">
          <div style="flex:1;">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;font-family:var(--font-mono);
                color:${ep.method==='POST'?'#2ecc71':ep.method==='PATCH'?'#f39c12':'#3498db'};
                background:${ep.method==='POST'?'#0d2b1a':ep.method==='PATCH'?'#2b1a00':'#0a1a2b'};">${ep.method}</span>
              <span style="font-size:11px;color:#aaa;font-family:var(--font-mono);">${escHtml(ep.path)}</span>
              ${ep._score > 0
                ? `<span style="font-size:10px;color:#2ecc71;margin-left:auto;">${ep._score} champ(s)</span>`
                : `<span style="font-size:10px;color:#e67e22;margin-left:auto;">Action système</span>`}
            </div>
            <div style="font-size:10px;color:#555;">${escHtml(ep.summary||'')}</div>
            ${ep._matchedFields?.length ? `<div style="margin-top:3px;">
              ${ep._matchedFields.map(f => `<span style="font-size:10px;background:#0d2b1a;border:1px solid #1a4a2a;
                border-radius:3px;padding:1px 5px;margin-right:3px;font-family:var(--font-mono);">${escHtml(f)}</span>`).join('')}
            </div>` : ''}
            ${existing ? `<div style="font-size:10px;color:#2ecc71;margin-top:4px;">✓ Active : "${escHtml(existing.name)}"</div>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${!actions.length ? `<div style="color:#555;font-size:12px;padding:16px;text-align:center;">
        Aucun endpoint pertinent. Vérifiez votre Table de correspondance et la spec importée.
      </div>` : ''}
    </div>`;

  body._generatedActions = actions;
  footer.innerHTML = `<button class="cfg-btn" onclick="editerConnexion('${connId}')">Fermer</button>`;
}

function connToggleGeneratedAction(connId, idx, checked) {
  const c = wfdConnexions?.find(x => x.id === connId);
  if (!c) return;
  const body    = document.getElementById('res-body');
  const actions = body?._generatedActions;
  if (!actions) return;
  const ep = actions[idx];
  if (!ep) return;
  c.actions = c.actions || [];
  if (checked) {
    if (!c.actions.find(a => a.endpoint === ep.path && a.method === ep.method)) {
      const slug = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      c.actions.push({
        id: _connGenId(), name: ep.summary || ep.method + ' ' + ep.path,
        method: ep.method, endpoint: ep.path,
        mode: 'simple', sourceVar: '', bodyTemplate: '',
        resultVar: slug(ep.summary || ep.path) + '_result',
        ignoreCodes: [422], job: null,
        _specFields: ep.fields || [], _score: ep._score,
      });
    }
  } else {
    c.actions = c.actions.filter(a => !(a.endpoint === ep.path && a.method === ep.method));
  }
  sauvegarderEtat();
  connShowGeneratedActions(connId);
}

function supprimerConnexion(id) {
  const c = wfdConnexions.find(x=>x.id===id);
  if (!c) return;
  const usedBy = wfdFlows.reduce((n, f) =>
    n + (f.nodes||[]).filter(nd => nd.family==='listener' && nd.config?.connexionId===id).length, 0);
  const msg = usedBy > 0
    ? `Cette connexion est utilisée par ${usedBy} nœud(s) Listener. Supprimer quand même ?`
    : `Supprimer la connexion "${c.name}" ?`;
  if (!confirm(msg)) return;
  wfdConnexions = wfdConnexions.filter(x=>x.id!==id);
  sauvegarderEtat();
  renderConnexions();
  toast('Connexion supprimée');
}

function copierEndpoint(id) {
  const c = wfdConnexions.find(x=>x.id===id);
  if (!c) return;
  const url = 'http://localhost:1881' + c.endpoint;
  navigator.clipboard.writeText(url).then(()=>toast('URL copiée ✓')).catch(()=>toast('Copie échouée', true));
}

function ajouterMappingConnexion(connId) {
  const c = wfdConnexions.find(x=>x.id===connId);
  if (!c) return;
  const name = 'Mapping ' + ((c.mappings||[]).length + 1);
  const m = { id: 'cmap-'+Date.now(), name, rules: [] };
  if (!c.mappings) c.mappings = [];
  c.mappings.push(m);
  sauvegarderEtat();
  editerMappingConnexion(connId, m.id);
}

function editerMappingConnexion(connId, mapId) {
  const c = wfdConnexions.find(x=>x.id===connId);
  const m = (c?.mappings||[]).find(x=>x.id===mapId);
  if (!c || !m) return;
  const body   = document.getElementById('res-body');
  const footer = document.getElementById('res-footer');

  const rulesHtml = () => (m.rules||[]).map((r,i) => `
    <div style="display:grid;grid-template-columns:1fr 24px 1fr 24px;gap:6px;align-items:center;">
      <input class="cfg-input" style="font-family:var(--font-mono);font-size:11px;"
        placeholder="Champ source (ex: data.title)" value="${escHtml(r.src||'')}"
        onchange="majRegleMapping('${connId}','${mapId}',${i},'src',this.value)">
      <span style="color:#444;text-align:center;">→</span>
      <input class="cfg-input" style="font-family:var(--font-mono);font-size:11px;"
        placeholder="Champ Iconik (ex: metadata.titre)" value="${escHtml(r.tgt||'')}"
        onchange="majRegleMapping('${connId}','${mapId}',${i},'tgt',this.value)">
      <button class="cfg-btn danger" style="padding:4px 6px;" onclick="supprimerRegleMapping('${connId}','${mapId}',${i})">×</button>
    </div>`).join('');

  body.innerHTML = `
    <div class="res-tab-panel" style="gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="cfg-btn" style="padding:4px 10px;" onclick="editerConnexion('${connId}')">← Retour</button>
        <input id="cmap-name" class="cfg-input" value="${escHtml(m.name)}" style="flex:1;font-weight:600;" placeholder="Nom du mapping">
      </div>
      <div style="font-size:11px;color:#555;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:5px;padding:8px 10px;">
        Définissez comment les champs du payload entrant sont mappés vers les métadonnées Iconik.<br>
        Syntaxe chemin JSON : <span style="font-family:var(--font-mono);color:#3498db;">data.asset.title</span> → <span style="font-family:var(--font-mono);color:#27ae60;">metadata.titre</span>
      </div>
      <div>
        <div class="cfg-label" style="margin-bottom:6px;">Règles de mapping</div>
        <div style="display:flex;flex-direction:column;gap:6px;" id="cmap-rules">${rulesHtml()}</div>
        <button class="cfg-btn" style="margin-top:8px;width:100%;" onclick="ajouterRegleMapping('${connId}','${mapId}')">+ Ajouter une règle</button>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="cfg-btn" onclick="editerConnexion('${connId}')">Annuler</button>
    <button class="cfg-btn primary" onclick="sauvegarderMappingConnexion('${connId}','${mapId}')">✓ Sauvegarder</button>`;
}

function ajouterRegleMapping(connId, mapId) {
  const c = wfdConnexions.find(x=>x.id===connId);
  const m = (c?.mappings||[]).find(x=>x.id===mapId);
  if (!m) return;
  m.rules.push({ src:'', tgt:'' });
  sauvegarderEtat();
  editerMappingConnexion(connId, mapId);
}

function majRegleMapping(connId, mapId, idx, field, val) {
  const c = wfdConnexions.find(x=>x.id===connId);
  const m = (c?.mappings||[]).find(x=>x.id===mapId);
  if (!m || !m.rules[idx]) return;
  m.rules[idx][field] = val;
  sauvegarderEtat();
}

function supprimerRegleMapping(connId, mapId, idx) {
  const c = wfdConnexions.find(x=>x.id===connId);
  const m = (c?.mappings||[]).find(x=>x.id===mapId);
  if (!m) return;
  m.rules.splice(idx, 1);
  sauvegarderEtat();
  editerMappingConnexion(connId, mapId);
}

function sauvegarderMappingConnexion(connId, mapId) {
  const c = wfdConnexions.find(x=>x.id===connId);
  const m = (c?.mappings||[]).find(x=>x.id===mapId);
  if (!m) return;
  const nameEl = document.getElementById('cmap-name');
  if (nameEl?.value?.trim()) m.name = nameEl.value.trim();
  sauvegarderEtat();
  editerConnexion(connId);
  toast('Mapping sauvegardé ✓');
}

function supprimerMappingConnexion(connId, mapId) {
  const c = wfdConnexions.find(x=>x.id===connId);
  if (!c) return;
  if (!confirm('Supprimer ce mapping ?')) return;
  c.mappings = (c.mappings||[]).filter(x=>x.id!==mapId);
  sauvegarderEtat();
  editerConnexion(connId);
}

// ══ NOMMAGE — Ressources ══════════════════════════════════════════════════════

const NOMMAGE_STEP_TYPES = {
  template      : { label:'Template métadonnées',  icon:'📝', hasValue:true,  valuePlaceholder:'{titre}-{année}-{version}.{ext}',   desc:'Variables entre accolades : {champ}' },
  replace       : { label:'Remplacer',             icon:'🔄', hasValue:true,  valuePlaceholder:'chercher → remplacer',               desc:'Texte simple ou regex' },
  remove        : { label:'Supprimer',             icon:'🗑', hasValue:true,  valuePlaceholder:'caractères ou motif à supprimer',    desc:'Texte simple ou regex' },
  extract       : { label:'Extraire',              icon:'✂️', hasValue:true,  valuePlaceholder:'début:fin  ou  /regex/  ou  "entre"', desc:'Position, regex ou délimiteurs' },
  lowercase     : { label:'Minuscules',            icon:'🔡', hasValue:false, valuePlaceholder:'',  desc:'' },
  uppercase     : { label:'Majuscules',            icon:'🔠', hasValue:false, valuePlaceholder:'',  desc:'' },
  titlecase     : { label:'Title Case',            icon:'🔤', hasValue:false, valuePlaceholder:'',  desc:'Première lettre de chaque mot en majuscule' },
  trim          : { label:'Supprimer espaces',     icon:'✂️', hasValue:false, valuePlaceholder:'',  desc:'Début et fin' },
  slugify       : { label:'Slugifier',             icon:'🔗', hasValue:false, valuePlaceholder:'',  desc:'Espaces → tirets, accents supprimés' },
  pad_number    : { label:'Numérotation',          icon:'🔢', hasValue:true,  valuePlaceholder:'001  (nombre de chiffres)',           desc:'Incrémente un compteur avec padding' },
  limit         : { label:'Limiter à N caractères',icon:'📏', hasValue:true,  valuePlaceholder:'50  (tronquer fin)  ou  -50 (début)', desc:'Négatif = tronquer le début' },
  prefix        : { label:'Ajouter préfixe',       icon:'⬅️', hasValue:true,  valuePlaceholder:'préfixe_',   desc:'' },
  suffix        : { label:'Ajouter suffixe',       icon:'➡️', hasValue:true,  valuePlaceholder:'_suffixe',   desc:'' },
  regex_capture : { label:'Capturer (regex)',      icon:'🎯', hasValue:true,  valuePlaceholder:'/([A-Z]+)-(\\d+)/ groupe 1',          desc:'Extrait un groupe capturant' },
};

function renderNommages() {
  const body = document.getElementById('res-nommage-body');
  if (!body) return;
  if (!wfdNommages.length) {
    body.innerHTML = `<div style="color:#555;font-size:13px;text-align:center;padding:24px;">
      Aucune règle de nommage.<br>
      <span style="font-size:11px;color:#444;">
        Créez des règles réutilisables pour construire des noms de fichiers<br>
        à partir des métadonnées et de transformations empilables.
      </span>
    </div>`;
    return;
  }
  body.innerHTML = wfdNommages.map(n => {
    const usedBy = wfdFlows.reduce((c, f) =>
      c + (f.nodes||[]).filter(nd => nd.family==='rename' && nd.config?.nommageId===n.id).length, 0);
    return `
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:#fff;font-weight:600;">🔤 ${escHtml(n.name)}</div>
          <div style="font-size:11px;color:#555;margin-top:2px;">
            ${(n.steps||[]).length} étape(s)
            <span style="color:#3a3a3a;margin-left:8px;">${usedBy} nœud(s)</span>
            ${n.description ? `<span style="color:#444;margin-left:8px;">— ${escHtml(n.description)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="cfg-btn" style="padding:5px 12px;" onclick="editerNommage('${n.id}')">Éditer</button>
          <button class="cfg-btn danger" style="padding:5px 10px;" onclick="supprimerNommage('${n.id}')">🗑</button>
        </div>
      </div>
      ${(n.steps||[]).length ? `
      <div style="padding:0 12px 10px;display:flex;flex-wrap:wrap;gap:4px;">
        ${(n.steps||[]).map(s => {
          const t = NOMMAGE_STEP_TYPES[s.type] || {};
          return `<span style="font-size:10px;background:#111;border:1px solid #2a2a2a;border-radius:3px;padding:2px 6px;color:#888;">
            ${t.icon||'•'} ${t.label||s.type}${s.value?' : '+escHtml(String(s.value).substring(0,20)):''}
          </span>`;
        }).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

function creerNommage() {
  const footer = document.getElementById('res-footer');
  footer.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;width:100%;">
      <input id="new-nom-name" class="cfg-input" style="flex:1;" placeholder="Nom de la règle (ex : Convention PAD, Nommage zones de partage…)">
      <button class="cfg-btn primary" onclick="confirmerCreerNommage()">✓ Créer</button>
      <button class="cfg-btn" onclick="resTab('nommage')">Annuler</button>
    </div>`;
  setTimeout(() => document.getElementById('new-nom-name')?.focus({ preventScroll: true }), 100);
}

function confirmerCreerNommage() {
  const name = document.getElementById('new-nom-name')?.value?.trim();
  if (!name) return;
  const n = { id: 'nom-'+Date.now(), name, description:'', steps:[] };
  wfdNommages.push(n);
  sauvegarderEtat();
  editerNommage(n.id);
}

function editerNommage(id) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n) return;
  const body   = document.getElementById('res-body');
  const footer = document.getElementById('res-footer');

  const stepsHtml = () => (n.steps||[]).map((s, i) => {
    const t = NOMMAGE_STEP_TYPES[s.type] || {};
    const typeOpts = Object.entries(NOMMAGE_STEP_TYPES)
      .map(([k,v]) => `<option value="${k}" ${s.type===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');
    return `
    <div style="display:grid;grid-template-columns:28px 1fr ${t.hasValue?'1fr':''} 28px;gap:6px;align-items:center;
      background:#111;border:1px solid #1e1e1e;border-radius:5px;padding:7px 8px;" data-step="${i}">
      <span style="font-size:16px;text-align:center;cursor:grab;color:#444;" title="Déplacer">⠿</span>
      <select class="cfg-select nom-step-type" data-idx="${i}" onchange="nomStepTypeChange(${i},'${id}')">
        ${typeOpts}
      </select>
      ${t.hasValue ? `<input class="cfg-input nom-step-value" data-idx="${i}"
        value="${escHtml(String(s.value||''))}" placeholder="${escHtml(t.valuePlaceholder||'')}"
        style="font-family:var(--font-mono);font-size:11px;"
        onchange="nomStepValueChange(${i},'${id}',this.value)">` : '<span></span>'}
      <button class="cfg-btn danger" style="padding:4px 6px;" onclick="supprimerEtapeNommage('${id}',${i})">×</button>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="res-tab-panel" style="gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="cfg-btn" style="padding:4px 10px;" onclick="resTab('nommage')">← Retour</button>
        <input id="nom-name" class="cfg-input" value="${escHtml(n.name)}" style="flex:1;font-weight:600;">
      </div>
      <div class="cfg-field">
        <label class="cfg-label">Description</label>
        <textarea id="nom-desc" class="cfg-textarea" rows="2" placeholder="Notes…">${escHtml(n.description||'')}</textarea>
      </div>

      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span class="cfg-label">Étapes (appliquées dans l'ordre)</span>
          <button class="cfg-btn" style="padding:4px 12px;" onclick="ajouterEtapeNommage('${id}')">+ Étape</button>
        </div>
        <div id="nom-steps" style="display:flex;flex-direction:column;gap:6px;">
          ${stepsHtml() || '<div style="color:#444;font-size:11px;padding:8px 0;">Aucune étape — ajoutez-en une.</div>'}
        </div>
      </div>

      <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:5px;padding:10px 12px;">
        <div class="cfg-label" style="margin-bottom:6px;">Aperçu</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="nom-preview-input" class="cfg-input" style="flex:1;font-family:var(--font-mono);font-size:11px;"
            placeholder="Texte de test (ex: Mon Film Titre.mxf)" oninput="nomPreview('${id}')">
          <span style="color:#444;font-size:11px;">→</span>
          <span style="color:#444;font-size:11px;">→</span>
          <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
            <div id="nom-preview-output" style="font-family:var(--font-mono);font-size:11px;color:#27ae60;
              background:#0d150d;border:1px solid #1a2a1a;border-radius:4px;padding:6px 8px;min-height:30px;"></div>
            <div style="font-size:10px;color:#444;">Cover est un exemple</div>
          </div>
        </div>
    </div>`;

  footer.innerHTML = `
    <button class="cfg-btn" onclick="resTab('nommage')">Annuler</button>
    <button class="cfg-btn primary" onclick="sauvegarderNommage('${id}')">✓ Sauvegarder</button>`;
}

function ajouterEtapeNommage(id) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n) return;
  n.steps.push({ type:'replace', value:'' });
  sauvegarderEtat();
  editerNommage(id);
}

function supprimerEtapeNommage(id, idx) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n) return;
  n.steps.splice(idx, 1);
  sauvegarderEtat();
  editerNommage(id);
}

function nomStepTypeChange(idx, id) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n || !n.steps[idx]) return;
  const sel = document.querySelector(`.nom-step-type[data-idx="${idx}"]`);
  if (sel) { n.steps[idx].type = sel.value; n.steps[idx].value = ''; }
  sauvegarderEtat();
  editerNommage(id);
}

function nomStepValueChange(idx, id, val) {
  const n = wfdNommages.find(x => x.id === id);
  if (n?.steps[idx]) { n.steps[idx].value = val; sauvegarderEtat(); }
}

function sauvegarderNommage(id) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n) return;
  n.name        = document.getElementById('nom-name')?.value?.trim() || n.name;
  n.description = document.getElementById('nom-desc')?.value || '';
  // Relire les valeurs des steps depuis le DOM (onchange peut avoir raté)
  document.querySelectorAll('.nom-step-value').forEach(el => {
    const i = parseInt(el.dataset.idx);
    if (!isNaN(i) && n.steps[i]) n.steps[i].value = el.value;
  });
  sauvegarderEtat();
  resTab('nommage');
  toast('Règle de nommage sauvegardée ✓');
}

function supprimerNommage(id) {
  const n = wfdNommages.find(x => x.id === id);
  if (!n) return;
  if (!confirm(`Supprimer la règle "${n.name}" ?`)) return;
  wfdNommages = wfdNommages.filter(x => x.id !== id);
  sauvegarderEtat();
  renderNommages();
}

// Aperçu temps réel — applique les étapes sur le texte de test
function nomPreview(id) {
  const n = wfdNommages.find(x => x.id === id);
  const input = document.getElementById('nom-preview-input')?.value || '';
  const out   = document.getElementById('nom-preview-output');
  if (!n || !out) return;
  try {
    // Contexte de prévisualisation — variables typiques pour tester le template
    const previewCtx = {
      Titre  : input || 'Mon Film Titre',
      artwork: 'Cover',
      ext    : 'png',
    };
    let result = appliquerReglesNommage(input || previewCtx.Titre, n.steps, previewCtx);
    out.textContent = result;
    out.style.color = '#27ae60';
  } catch(e) {
    out.textContent = '⚠ ' + e.message;
    out.style.color = '#e74c3c';
  }
}

// Moteur d'application des règles (utilisé aussi par le nœud au runtime)
function appliquerReglesNommage(input, steps, context) {
  let s = String(input || '');
  for (const step of (steps || [])) {
    const v = step.value || '';
    switch (step.type) {
      case 'template': {
        // Remplacer {champ} par context[champ] ou laisser tel quel
        s = v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? context[k] : `{${k}}`);
        break;
      }
      case 'replace': {
        // Format "chercher → remplacer" ou "chercher > remplacer"
        const sep = v.includes(' → ') ? ' → ' : (v.includes(' > ') ? ' > ' : null);
        if (sep) {
          const [from, to] = v.split(sep);
          try { s = s.replace(new RegExp(from, 'g'), to); }
          catch(e) { s = s.split(from).join(to); }
        }
        break;
      }
      case 'remove': {
        try { s = s.replace(new RegExp(v, 'g'), ''); }
        catch(e) { s = s.split(v).join(''); }
        break;
      }
      case 'extract': {
        if (v.startsWith('/') && v.includes('/', 1)) {
          // regex
          const m = v.match(/^\/(.+)\/([gimu]*)$/);
          if (m) { const r = s.match(new RegExp(m[1], m[2])); if (r) s = r[1] || r[0]; }
        } else if (v.includes(':')) {
          // début:fin
          const [a, b] = v.split(':').map(Number);
          s = s.slice(a, b || undefined);
        } else if (v.startsWith('"') || v.startsWith("'")) {
          // entre délimiteurs "start"end"
          const parts = v.split(v[0]).filter(Boolean);
          if (parts.length >= 2) {
            const si = s.indexOf(parts[0]);
            const ei = s.indexOf(parts[1], si + parts[0].length);
            if (si >= 0 && ei > si) s = s.slice(si + parts[0].length, ei);
          }
        }
        break;
      }
      case 'lowercase':   s = s.toLowerCase(); break;
      case 'uppercase':   s = s.toUpperCase(); break;
      case 'titlecase':   s = s.replace(/\b\w/g, c => c.toUpperCase()); break;
      case 'trim':        s = s.trim(); break;
      case 'slugify':
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
             .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        break;
      case 'limit': {
        const n = parseInt(v) || 50;
        if (n > 0) s = s.slice(0, n);
        else       s = s.slice(n);
        break;
      }
      case 'prefix': s = v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? context[k] : `{${k}}`) + s; break;
      case 'suffix': s = s + v.replace(/\{(\w+)\}/g, (_, k) => context[k] !== undefined ? context[k] : `{${k}}`); break;
      case 'regex_capture': {
        const m2 = v.match(/^\/(.+)\/(?:[gimu]*)?\s*(?:groupe\s*)?(\d+)?/i);
        if (m2) {
          const r2 = s.match(new RegExp(m2[1]));
          if (r2) s = r2[parseInt(m2[2])||1] || r2[0];
        }
        break;
      }
    }
  }
  return s;
}


// ── Fonctions artwork S3 ─────────────────────────────────────────────────────
function awsArtAddRow(pfx) {
  const container = document.getElementById(pfx + '-aws-art-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.aws-art-row').length;
  const div = document.createElement('div');
  div.className = 'aws-art-row';
  div.dataset.idx = idx;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 24px;gap:4px;align-items:center;';
  div.innerHTML = `
    <input class="cfg-input aws-art-name" data-idx="${idx}" value=""
      placeholder="NomIconik" style="font-size:10px;font-family:var(--font-mono);">
    <input class="cfg-input aws-art-md" data-idx="${idx}" value=""
      placeholder="URLChampMD" style="font-size:10px;font-family:var(--font-mono);">
    <input class="cfg-input aws-art-var" data-idx="${idx}" value=""
      placeholder="s3_nom_url" style="font-size:10px;font-family:var(--font-mono);">
    <button onclick="this.closest('.aws-art-row').remove()"
      style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:14px;padding:0;">×</button>`;
  container.appendChild(div);
}

function awsArtRemoveRow(pfx, idx) {
  const row = document.querySelector(`#${pfx}-aws-art-rows .aws-art-row[data-idx="${idx}"]`);
  if (row) row.remove();
}

function awsArtReadRows(pfx) {
  const rows = document.querySelectorAll(`#${pfx}-aws-art-rows .aws-art-row`);
  const result = [];
  rows.forEach(row => {
    const name = row.querySelector('.aws-art-name')?.value?.trim() || '';
    const md   = row.querySelector('.aws-art-md')?.value?.trim()   || '';
    const varN = row.querySelector('.aws-art-var')?.value?.trim()   || '';
    if (name) result.push({ iconikName: name, mdField: md, variable: varN });
  });
  return result;
}

// [→ wfd-config-panel.js : lignes 5606–7214]
function ouvrirMappings() {
  if (typeof ouvrirRessources === 'function') { ouvrirRessources('mappings'); return; }
  renderMappingsList();
  document.getElementById('modal-mappings').style.display = 'flex';
}
function fermerModalMappings() { document.getElementById('modal-mappings').style.display = 'none'; }

function renderMappingsList() {
  const body = document.getElementById('modal-mappings-body');
  if (!wfdMappings.length) {
    body.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:20px;">Aucun mapping cr\u00E9\u00E9.<br>Cr\u00E9ez-en un pour mapper les champs entrants vers Iconik.</div>';
    return;
  }
  body.innerHTML = wfdMappings.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
      background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;">
      <div>
        <div style="font-size:13px;color:#fff;font-weight:600;">\uD83D\uDDC2 ${m.name}</div>
        <div style="font-size:11px;color:#555;margin-top:2px;font-family:var(--font-mono);">${m.rows.length} correspondance(s)</div>
      </div>
      <button class="cfg-btn" style="width:auto;padding:5px 12px;" onclick="editerMapping('${m.id}')">\u00C9diter</button>
    </div>`).join('');
}

function creerMapping() {
  // Cas 1 : Ressources ouverte → flux existant
  let footer = document.getElementById('res-footer');
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;width:100%;">
        <input id="new-mapping-name" class="cfg-input" style="flex:1;"
               placeholder="Nom du mapping (ex : WON → Iconik)" autofocus>
        <button class="cfg-btn primary" onclick="confirmerCreerMapping()">✓ Créer</button>
        <button class="cfg-btn" onclick="resTab('mappings')">Annuler</button>
      </div>`;
    setTimeout(() => {
      if (document.activeElement) document.activeElement.blur();
      document.getElementById('new-mapping-name')?.focus({ preventScroll: true });
    }, 100);
    return;
  }

  // Cas 2 : pas de Ressources → créer et ouvrir directement l’éditeur
  const m = { id:'map-' + Date.now(), name:'Nouveau mapping', rows:[{src:'', tgt:''}] };
  wfdMappings.push(m);
  sauvegarderEtat();

  // Ouvre l'éditeur dédié (modale mapping)
  if (typeof editerMapping === 'function') {
    editerMapping(m.id);
  } else {
    toast('Éditeur de mapping indisponible', true);
  }
}
function confirmerCreerMapping() {
  const name = document.getElementById('new-mapping-name')?.value?.trim();
  if (!name) return;
  const m = { id:'map-'+Date.now(), name, rows:[{src:'',tgt:''}] };
  wfdMappings.push(m);
  sauvegarderEtat();
  fermerRessources();
  setTimeout(() => editerMapping(m.id), 50);
}

function editerMapping(id) {
  const m = wfdMappings.find(x=>x.id===id);
  if (!m) return;
  document.getElementById('modal-mapping-edit').dataset.id = id;
  document.getElementById('modal-mapping-edit-title').textContent = '\uD83D\uDDC2 '+m.name;

  const metaFields = (wfdData.metadata||[]).map(f=>f.nom||f.name||'').filter(Boolean);

  const body = document.getElementById('modal-mapping-edit-body');
  body.innerHTML = `
    <div class="cfg-field">
      <label class="cfg-label">Nom du mapping</label>
      <input id="mapedit-name" class="cfg-input" value="${m.name}">
    </div>

    <!-- Import API source -->
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:12px;">
      <div class="cfg-label" style="margin-bottom:8px;">IMPORT API SOURCE (JSON ou XML)</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <label style="flex:1;padding:7px 12px;background:#161616;border:1px dashed #333;border-radius:5px;
          font-size:11px;color:#666;cursor:pointer;text-align:center;transition:all 0.15s;"
          onmouseover="this.style.borderColor='#555'" onmouseout="this.style.borderColor='#333'">
          \uD83D\uDCC2 Charger un fichier JSON / XML
          <input type="file" accept=".json,.xml" style="display:none;" onchange="importerFichierMapping(this)">
        </label>
      </div>
      <div id="mapedit-import-preview" style="display:none;">
        <div class="cfg-label" style="margin-bottom:6px;">CHEMINS D\u00C9TECT\u00C9S \u2014 cliquer pour ins\u00E9rer en source</div>
        <div style="max-height:140px;overflow-y:auto;background:#111;border:1px solid #222;border-radius:4px;padding:6px;">
          <div id="mapedit-paths-list" style="display:flex;flex-direction:column;gap:2px;font-family:var(--font-mono);font-size:11px;"></div>
        </div>
      </div>
    </div>

    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span class="cfg-label">CORRESPONDANCES DE CHAMPS</span>
        <button class="btn-add-cond" onclick="ajouterLigneMapping()">+ Ligne</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 20px 1fr 28px;gap:4px;align-items:center;margin-bottom:4px;padding:0 8px;">
        <span style="font-size:9px;color:#444;font-family:var(--font-mono);">SOURCE</span><span></span>
        <span style="font-size:9px;color:#444;font-family:var(--font-mono);">DESTINATION</span><span></span><span></span><span></span>
      </div>
      <div id="mapedit-rows">
        ${m.rows.map((r,i)=>buildMappingRow(i,r,[])).join('')}
      </div>
    </div>`;

  document.getElementById('modal-mappings').style.display = 'none';
  document.getElementById('modal-mapping-edit').style.display = 'flex';
}

function buildMappingRow(i, row, metaFields) {
  // Datalist combinant champs Iconik + champs API disponibles
  const _iconikFields = (typeof wfdData !== 'undefined' ? wfdData.metadata||[] : []).map(f=>f.nom||f.name||'').filter(Boolean);
  const _apiConn = (typeof wfdConnexions !== 'undefined' ? wfdConnexions : []).find(c => c.apiSpec && c.direction === 'outbound');
  const _apiFields = (_apiConn?.apiSpec?.endpoints||[])
    .filter(e => ['POST','PUT','PATCH'].includes(e.method))
    .flatMap(e => e.fields||[])
    .map(f => f.path)
    .filter((p,ix,a) => a.indexOf(p)===ix && !p.includes('['));
  const _dlId = 'mapedit-dst-dl-' + i;
  const _tgtVal = escHtml(row.tgt||row.value||'');
  const opts = `<input type="text" class="map-tgt" value="${_tgtVal}"
    placeholder="Champ destination" list="${_dlId}"
    style="flex:1;padding:4px 7px;background:var(--wfd-panel);color:var(--wfd-text);border:1px solid var(--wfd-border2);border-radius:4px;font-size:11px;outline:none;">
    <datalist id="${_dlId}">
      ${_iconikFields.map(f=>`<option value="${escHtml(f)}">`).join('')}
      ${_apiFields.map(f=>`<option value="${escHtml(f)}">`).join('')}
    </datalist>`;

  const childrenHtml = (row.children||[]).map(function(c) {
    return '<div class="map-child-row" style="display:grid;grid-template-columns:1fr 20px 1fr 28px;gap:4px;margin-top:2px;margin-left:20px;">' +
      '<input type="text" class="map-src" value="' + escHtml(c.src||c.key||'') + '" placeholder="Si valeur..."' +
      ' style="padding:3px 6px;background:var(--wfd-panel);color:var(--wfd-text);border:1px solid #1a1a2a;border-radius:4px;font-size:10px;">' +
      '<span class="mapping-arrow">\u2192</span>' +
      '<input type="text" class="map-tgt" value="' + escHtml(c.tgt||c.value||'') + '" placeholder="...traduire en"' +
      ' style="padding:3px 6px;background:var(--wfd-panel);color:var(--wfd-text);border:1px solid #1a1a2a;border-radius:4px;font-size:10px;">' +
      '<button onclick="this.closest(".map-child-row").remove()" style="background:#1a0a0a;border:1px solid #2a1a1a;border-radius:3px;color:#c0392b;cursor:pointer;font-size:12px;">\u00D7</button>' +
      '</div>';
  }).join('');

  const hasChildren = (row.children||[]).length > 0;
  const isList = row.list === true || row.list === 'true';
  return '<div class="mapping-row" id="maprow-' + i + '" style="display:block;margin-bottom:4px;">' +
    '<div style="display:grid;grid-template-columns:1fr 20px 1fr auto auto 28px;gap:4px;align-items:center;">' +
    '<input type="text" class="map-src" value="' + escHtml(row.src||'') + '" placeholder="Champ source">' +
    '<span class="mapping-arrow">\u2192</span>' +
    opts +
    '<label title="Ce champ est une liste (tableau)" style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:10px;color:#555;white-space:nowrap;">' +
    '<input type="checkbox" class="map-is-list" ' + (isList ? 'checked' : '') + ' style="cursor:pointer;"> [ ]</label>' +
    '<button onclick="mapAddChildRow(this)" title="Ajouter une traduction de valeur"' +
    ' style="background:#0d1a2a;border:1px solid #1e3a5a;border-radius:3px;color:#7ec8e3;cursor:pointer;font-size:10px;padding:2px 5px;white-space:nowrap;">+ Trad.</button>' +
    '<button class="btn-del-cond" onclick="supprimerLigneMapping(' + i + ')">\u00D7</button>' +
    '</div>' +
    '<div class="map-children">' + childrenHtml + '</div>' +
    '</div>';
}

// ── Import fichier mapping ───────────────────────────────────
function importerFichierMapping(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let paths = [];
    if (file.name.endsWith('.json') || file.type === 'application/json') {
      paths = extraireCheminsJSON(JSON.parse(text), '', []);
    } else {
      // XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      paths = extraireXPaths(doc.documentElement, '', []);
    }
    afficherCheminsPalette(paths);
  };
  reader.readAsText(file);
}

function extraireCheminsJSON(obj, prefix, result, depth=0) {
  if (depth > 8) return result;
  if (typeof obj !== 'object' || obj === null) return result;
  Object.entries(obj).forEach(([key, val]) => {
    const path = prefix ? prefix+'.'+key : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      extraireCheminsJSON(val, path, result, depth+1);
    } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      extraireCheminsJSON(val[0], path+'[0]', result, depth+1);
    } else {
      result.push({ path, example: Array.isArray(val) ? '(tableau)' : String(val).slice(0,40) });
    }
  });
  return result;
}

function extraireXPaths(el, prefix, result, depth=0) {
  if (depth > 8) return result;
  const path = prefix ? prefix+'/'+el.tagName : el.tagName;
  const hasChildren = [...el.children].length > 0;
  if (!hasChildren) {
    result.push({ path, example: el.textContent.slice(0,40) });
  } else {
    [...el.children].forEach(child => extraireXPaths(child, path, result, depth+1));
  }
  // Attributs
  [...el.attributes].forEach(attr => {
    result.push({ path: path+'/@'+attr.name, example: attr.value.slice(0,40) });
  });
  return result;
}

function afficherCheminsPalette(paths) {
  const preview = document.getElementById('mapedit-import-preview');
  const list    = document.getElementById('mapedit-paths-list');
  if (!preview||!list) return;
  preview.style.display = 'block';
  list.innerHTML = paths.slice(0,80).map(({path, example}) => `
    <div onclick="insererCheminSource('${path.replace(/'/g,"\'")}')"
      style="padding:3px 8px;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.1s;"
      onmouseover="this.style.background='#1e1e1e'" onmouseout="this.style.background='transparent'">
      <span style="color:#00d4aa;flex:1;">${path}</span>
      ${example ? `<span style="color:#333;font-size:10px;overflow:hidden;text-overflow:ellipsis;max-width:120px;white-space:nowrap;">${example}</span>` : ''}
    </div>`).join('');
  if (paths.length > 80) {
    list.innerHTML += `<div style="color:#444;padding:4px 8px;font-size:10px;">... et ${paths.length-80} autres chemins</div>`;
  }
}

function insererCheminSource(path) {
  // Trouver la dernière ligne vide ou en créer une nouvelle
  const rows = document.querySelectorAll('#mapedit-rows .mapping-row');
  let inserted = false;
  for (const row of rows) {
    const srcInput = row.querySelector('.map-src');
    if (srcInput && !srcInput.value.trim()) {
      srcInput.value = path;
      srcInput.focus({ preventScroll: true });
      srcInput.style.borderColor = '#00d4aa';
      setTimeout(()=>srcInput.style.borderColor='',1500);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    ajouterLigneMapping();
    setTimeout(() => {
      const newRows = document.querySelectorAll('#mapedit-rows .mapping-row');
      const last = newRows[newRows.length-1];
      if (last) {
        const inp = last.querySelector('.map-src');
        if (inp) { inp.value = path; inp.focus({ preventScroll: true }); }
      }
    }, 50);
  }
}

function ajouterLigneMapping() {
  const m = wfdMappings.find(x=>x.id===document.getElementById('modal-mapping-edit').dataset.id);
  if (!m) return;
  const i = document.querySelectorAll('#mapedit-rows .mapping-row').length;
  const metaFields = (wfdData.metadata||[]).map(f=>f.nom||f.name||'').filter(Boolean);
  const div = document.createElement('div');
  div.innerHTML = buildMappingRow(i, {src:'',tgt:''}, metaFields);
  document.getElementById('mapedit-rows').appendChild(div.firstElementChild);
}

function supprimerLigneMapping(i) {
  document.getElementById('maprow-'+i)?.remove();
}

function mapAddChildRow(btn) {
  const parentRow = btn.closest('.mapping-row');
  const childWrap = parentRow.querySelector('.map-children');
  const child = document.createElement('div');
  child.className = 'map-child-row';
  child.style.cssText = 'display:grid;grid-template-columns:1fr 20px 1fr 28px;gap:4px;margin-top:2px;margin-left:20px;';
  child.innerHTML =
    '<input type="text" class="map-src" placeholder="Si valeur..."' +
    ' style="padding:3px 6px;background:var(--wfd-panel);color:var(--wfd-text);border:1px solid #1a1a2a;border-radius:4px;font-size:10px;">' +
    '<span class="mapping-arrow">→</span>' +
    '<input type="text" class="map-tgt" placeholder="...traduire en"' +
    ' style="padding:3px 6px;background:var(--wfd-panel);color:var(--wfd-text);border:1px solid #1a1a2a;border-radius:4px;font-size:10px;">' +
    '<button onclick="this.closest(\'.map-child-row\').remove()" style="background:#1a0a0a;border:1px solid #2a1a1a;border-radius:3px;color:#c0392b;cursor:pointer;font-size:12px;">×</button>';
  childWrap.appendChild(child);
  child.querySelector('.map-src').focus({ preventScroll: true });
}


function supprimerMappingCourant() {
  const id = document.getElementById('modal-mapping-edit').dataset.id;
  if (!id) return;
  if (!confirm('Supprimer ce mapping ?')) return;
  wfdMappings = wfdMappings.filter(m=>m.id!==id);
  sauvegarderEtat();
  fermerModalMappingEdit();
  ouvrirMappings();
  toast('Mapping supprim\u00E9');
}

function sauvegarderMappingEdit() {
  const id = document.getElementById('modal-mapping-edit').dataset.id;
  const m  = wfdMappings.find(x=>x.id===id);
  if (!m) return;
  m.name = document.getElementById('mapedit-name')?.value.trim() || m.name;
  m.rows = [...document.querySelectorAll('#mapedit-rows > .mapping-row')].map(function(row) {
    const src      = row.querySelector(':scope > div > .map-src')?.value || '';
    const tgt      = row.querySelector(':scope > div > .map-tgt')?.value || '';
    const children = [...row.querySelectorAll('.map-child-row')].map(function(c) {
      return {
        src: c.querySelector('.map-src')?.value || '',
        tgt: c.querySelector('.map-tgt')?.value || '',
      };
    }).filter(function(c) { return c.src || c.tgt; });
    const isList = row.querySelector('.map-is-list')?.checked || false;
    const rowObj = children.length ? { src, tgt, children } : { src, tgt };
    if (isList) rowObj.list = true;
    return rowObj;
  }).filter(function(r) { return r.src || r.tgt; });
  sauvegarderEtat();
  fermerModalMappingEdit();
  ouvrirMappings();
  toast('Mapping sauvegard\u00E9 \u2713');
}

function fermerModalMappingEdit() {
  document.getElementById('modal-mapping-edit').style.display = 'none';
}

// ── Export / Import global v4 ───────────────────────────────
const WFD_SCHEMA_VERSION = 4;

function exporterConfigurationGlobale() {
  // Settings
  const sKeys = ['teamsData','roleGroupsData','collectionsData','metadataViewsData',
    'metadonneesData','rolesData','itemsAdvancedData','savedSearchesData',
    'storagesData','appTokensData','workflowsData','categoriesData'];
  const settings = {};
  sKeys.forEach(k => { try { settings[k] = JSON.parse(localStorage.getItem(k)||'null'); } catch(e){} });

  // Automations
  const automations = {};
  ['automationsData','webhooksData','customActionsData'].forEach(k => {
    try { automations[k] = JSON.parse(localStorage.getItem(k)||'null'); } catch(e) {}
  });

  const orgName = localStorage.getItem('organisationName') || localStorage.getItem('nomOrganisation') || '';
  const payload = {
    version      : WFD_SCHEMA_VERSION,
    schema       : 'iconik-global-config',
    organisation : orgName,
    exportedAt   : new Date().toISOString(),
    exportedFrom : 'workflow',
    settings,
    automations,
    workflow: {
      wfdFlows   : wfdFlows,
      wfdPalNodes: wfdPalNodes,
      wfdMappings: wfdMappings,
      wfdContacts: wfdContacts,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type:'application/json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  const slug = (orgName || 'iconik').replace(/\s+/g,'-');
  a.href = url;
  a.download = `${slug}-config-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast(`\u2713 Export "${a.download}" \u2014 `
    + wfdFlows.length + ' flux, '
    + wfdPalNodes.length + ' n\u0153uds, '
    + wfdMappings.length + ' mappings, '
    + wfdContacts.length + ' listes contacts');
}

// ===================== EXPORT PICKER (flux sélectionnés) =====================
let _expickMode = 'json'; // 'json' ou 'word'
let _expickSelected = new Set();

function openExportPicker(mode) {
  _expickMode = mode === 'word' ? 'word' : 'json';
  _expickSelected = new Set((wfdFlows || []).map(f => f.id)); // par défaut : tout coché

  const title = document.getElementById('expick-title');
  if (title) title.textContent = _expickMode === 'word' ? 'Exporter en Word' : 'Exporter (JSON organisation)';

  const filter = document.getElementById('expick-filter');
  if (filter) filter.value = '';

  renderExportPickerList();
  document.getElementById('modal-export-picker').style.display = 'flex';
}

function closeExportPicker() {
  document.getElementById('modal-export-picker').style.display = 'none';
}

// reconstruit la liste selon le filtre
function renderExportPickerList() {
  const list = document.getElementById('expick-list');
  if (!list) return;
  const q = (document.getElementById('expick-filter')?.value || '').toLowerCase();

  const flows = (wfdFlows || []).filter(f => !q || (f.name || '').toLowerCase().includes(q));
  list.innerHTML = flows.map(f => {
    const checked = _expickSelected.has(f.id) ? 'checked' : '';
    const nodesCount = (f.nodes || []).length;
    const connsCount = (f.connections || []).length;
    return `
      <label style="display:flex;align-items:center;gap:8px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:8px 10px;">
        <input type="checkbox" ${checked} onchange="expickToggle('${f.id}', this.checked)">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
          <div style="color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(f.name || f.id)}</div>
          <div style="font-size:10px;color:#555;font-family:var(--font-mono);">
            ${nodesCount} nœud(s) · ${connsCount} connexion(s)
          </div>
        </div>
      </label>`;
  }).join('');

  const cnt = document.getElementById('expick-count');
  if (cnt) cnt.textContent = `${_expickSelected.size} sélectionné(s) / ${(wfdFlows || []).length}`;
}

function expickToggle(id, on) {
  if (on) _expickSelected.add(id); else _expickSelected.delete(id);
  renderExportPickerList();
}
function expickSelectAll() {
  (wfdFlows || []).forEach(f => _expickSelected.add(f.id));
  renderExportPickerList();
}
function expickSelectNone() {
  _expickSelected.clear();
  renderExportPickerList();
}
function expickSelectNotTests() {
  // désélectionne ceux dont le nom contient test/brouillon
  (wfdFlows || []).forEach(f => {
    const name = (f.name || '').toLowerCase();
    const isTest = name.includes('test') || name.includes('brouillon');
    if (isTest) _expickSelected.delete(f.id);
  });
  renderExportPickerList();
}

function confirmExportSelected() {
  const ids = [..._expickSelected];
  if (!ids.length) { toast('Aucun flux sélectionné', true); return; }

  closeExportPicker();
  if (_expickMode === 'json') {
    exporterConfigurationGlobaleSelected(ids); // JSON filtré
  } else {
    exporterWordFluxSelected(ids); // Word (enchaînement)
  }
}

// ===================== EXPORT JSON — version filtrée =====================
// Copie de exporterConfigurationGlobale(), mais en filtrant wfdFlows
function exporterConfigurationGlobaleSelected(flowIds) {
  // Settings
  const sKeys = ['teamsData','roleGroupsData','collectionsData','metadataViewsData',
    'metadonneesData','rolesData','itemsAdvancedData','savedSearchesData',
    'storagesData','appTokensData','workflowsData','categoriesData'];
  const settings = {};
  sKeys.forEach(k => { try { settings[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){} });

  // Automations
  const automations = {};
  ['automationsData','webhooksData','customActionsData'].forEach(k => {
    try { automations[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) {}
  });

  const orgName = localStorage.getItem('organisationName')
    || localStorage.getItem('nomOrganisation') || '';

  const selectedFlows = (wfdFlows || []).filter(f => flowIds.includes(f.id));

  const payload = {
    version : WFD_SCHEMA_VERSION,
    schema  : 'iconik-global-config',
    organisation : orgName,
    exportedAt   : new Date().toISOString(),
    exportedFrom : 'workflow',
    settings,
    automations,
    workflow: {
      wfdFlows      : selectedFlows,
      wfdPalNodes   : wfdPalNodes,  // on laisse tel quel
      wfdMappings   : wfdMappings,
      wfdContacts   : wfdContacts,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type:'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  const slug = (orgName || 'iconik').replace(/\s+/g,'-');
  a.href = url;
  a.download = `${slug}-config-${date}-SELECTION.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`✓ Export "${a.download}" — ${selectedFlows.length} flux`);
}

// ===================== EXPORT WORD — enchaînement multi-flux =====================
// On réutilise exporterWordFlux() existant (bouton toolbar), qui exporte le flux courant.
// Ici on enchaîne les flux sélectionnés en changeant temporairement currentFlowId.
function exporterWordFluxSelected(flowIds) {
  const prev = currentFlowId;

  // Sécurise l’ordre : simple for..of pour garantir l’enchaînement
  (async function run() {
    for (const id of flowIds) {
      const flow = getFlux(id);
      if (!flow) continue;
      currentFlowId = id;
      try {
        if (typeof exporterWordFlux === 'function') {
          await exporterWordFlux(); // suppose une promesse ou un sync — OK dans les 2 cas
        } else {
          console.warn('exporterWordFlux() introuvable');
        }
      } catch (e) {
        console.error('Export Word échoué pour', id, e);
        toast(`Export Word échoué pour "${flow.name || id}"`, true);
      }
    }
    currentFlowId = prev;
    toast(`Export Word — ${flowIds.length} flux`);
  })();
}

function declencherImport() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        validerEtImporter(data);
      } catch(err) {
        toast('Fichier JSON invalide : ' + err.message, true);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function validerEtImporter(data) {
  if (!data || typeof data !== 'object') {
    toast('Format non reconnu', true); return;
  }

  // Vérification version
  if (data.version && data.version !== WFD_SCHEMA_VERSION) {
    if (!confirm(`Version fichier (v${data.version}) \u2260 version actuelle (v${WFD_SCHEMA_VERSION}).\nContinuer quand m\u00EAme ?`))
      return;
  }

  // Vérification organisation
  const currentOrg = localStorage.getItem('organisationName') || localStorage.getItem('nomOrganisation') || '';
  const fileOrg    = data.organisation || '';
  if (fileOrg && currentOrg && fileOrg.toLowerCase() !== currentOrg.toLowerCase()) {
    const ok = confirm(
      "ATTENTION \u2014 Conflit d'organisation :\n\n" +
      "Fichier  : \"" + fileOrg + "\"\n" +
      "Actuelle : \"" + currentOrg + "\"\n\n" +
      "Ce fichier appartient \u00E0 une autre organisation.\nContinuer quand m\u00EAme ?"
    );
    if (!ok) return;
  }

  // Stats pour la modale
  const w = data.workflow || {};
  const a = data.automations || {};
  const s = data.settings || {};
  const stats = {
    flows      : (w.wfdFlows    || []).length,
    palNodes   : (w.wfdPalNodes || []).length,
    mappings   : (w.wfdMappings || []).length,
    contacts   : (w.wfdContacts || []).length,
    automations: (a.automationsData?.automations || []).length,
    webhooks   : (a.webhooksData?.webhooks || []).length,
    settings_present: Object.values(s).some(v => v !== null),
  };

  const hasExisting = wfdFlows.length || wfdPalNodes.length || wfdMappings.length || wfdContacts.length;
  if (hasExisting) {
    afficherModalImport(data, stats, fileOrg);
  } else {
    appliquerImport(data, 'replace');
  }
}

function afficherModalImport(data, stats, fileOrg) {
  const modal = document.getElementById('modal-import');
  if (!modal) { appliquerImport(data, 'replace'); return; }

  document.getElementById('import-org-name').textContent  = fileOrg || '(non d\u00E9finie)';
  document.getElementById('import-date').textContent      = data.exportedAt ? data.exportedAt.split('T')[0] : '?';
  document.getElementById('import-from').textContent      = data.exportedFrom || '?';

  document.getElementById('import-stats').innerHTML = [
    ['\uD83D\uDD00 Flux workflow',     stats.flows],
    ['\uD83E\uDDE9 N\u0153uds palette',    stats.palNodes],
    ['\uD83D\uDDC2 Mappings',          stats.mappings],
    ['\uD83D\uDC65 Listes contacts',   stats.contacts],
    ['\u2699\uFE0F Automations',       stats.automations],
    ['\uD83D\uDD14 Webhooks',          stats.webhooks],
    ['\u2699 Settings',          stats.settings_present ? '\u2713' : '\u2014'],
  ].map(([lbl, val]) => `
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;
      padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;color:#888;">${lbl}</span>
      <span style="font-size:18px;font-weight:700;color:#fff;font-family:var(--font-mono);">${val}</span>
    </div>`).join('');

  modal.dataset.pending = JSON.stringify(data);
  modal.style.display   = 'flex';
}

function appliquerImport(data, mode) {
  const w = data.workflow || {};
  const a = data.automations || {};
  const s = data.settings || {};
  const fileOrg = data.organisation || '';

  if (mode === 'replace') {
    wfdFlows    = w.wfdFlows    || [];
    wfdPalNodes = w.wfdPalNodes || [];
    wfdMappings = w.wfdMappings || [];
    wfdContacts = w.wfdContacts || [];
  } else {
    // Fusion intelligente par id
    const fusionner = (existing, incoming) => {
      if (!incoming || !incoming.length) return existing;
      const ids = new Set(existing.map(x=>x.id));
      incoming.forEach(x => {
        if (ids.has(x.id)) {
          // Renommer le conflit
          existing.push({ ...x, id: x.id + '_' + Date.now(), name: (x.name||x.id) + ' (import\u00E9)' });
        } else {
          existing.push(x);
        }
      });
      return existing;
    };
    wfdFlows    = fusionner(wfdFlows,    w.wfdFlows);
    wfdPalNodes = fusionner(wfdPalNodes, w.wfdPalNodes);
    wfdMappings = fusionner(wfdMappings, w.wfdMappings);
    wfdContacts = fusionner(wfdContacts, w.wfdContacts);
  }

  // Toujours importer Automations et Settings (pas de conflit de merge ici)
  // (DB) automationsData, webhooksData, customActionsData — en mémoire uniquement

  const sKeys = ['teamsData','roleGroupsData','collectionsData','metadataViewsData',
    'metadonneesData','rolesData','itemsAdvancedData','savedSearchesData',
    'storagesData','appTokensData','workflowsData','categoriesData'];
  // TODO Phase D : rediriger vers DB plutôt que localStorage
  sKeys.forEach(k => { if (s[k] !== undefined && s[k] !== null) localStorage.setItem(k, JSON.stringify(s[k])); });

  // (DB) organisationName — en mémoire uniquement

  // Sauvegarder et rafraîchir
  sauvegarderEtat();
  chargerIconikData(); // Recharger wfdData depuis le nouveau localStorage

  // Mettre à jour l'affichage org
  const orgBadge = document.getElementById('orgBadge');
  if (orgBadge && fileOrg) orgBadge.textContent = fileOrg;

  peuplerPalette();
  peuplerSelectFlux();

  if (!currentFlowId && wfdFlows.length) {
    currentFlowId = wfdFlows[0].id;
    const sel = document.getElementById('wfd-flow-select');
    if (sel) sel.value = currentFlowId;
    const btnDel = document.getElementById('btn-del-flux');
    if (btnDel) btnDel.style.display = 'flex';
  }

  renderCanvas();

  const total = wfdFlows.length + wfdPalNodes.length + wfdMappings.length + wfdContacts.length;
  toast(`Import ${mode === 'replace' ? 'complet' : 'fusionné'} \u2713 \u2014 ${total} \u00E9l\u00E9ments workflow charg\u00E9s`);
}

function confirmerImport(mode) {
  const modal = document.getElementById('modal-import');
  const data  = JSON.parse(modal?.dataset.pending || '{}');
  fermerModalImport();
  appliquerImport(data, mode);
}

function fermerModalImport() {
  const modal = document.getElementById('modal-import');
  if (modal) modal.style.display = 'none';
}

// ── Templates de flux prêts à l'emploi ──────────────────────
const FLOW_TEMPLATES = {
  manual_asset_creation: {
    name: "Creer un asset complet (Manuel)",
    description: "Workflow complet selon le tutoriel officiel iconik : asset + format + file set + boucle fichiers + proxy + keyframes + metadonnees + collection + notification.",
    nodes: [
      { id:'tpl-src',   family:'watchfolder', name:'Source fichiers',          x:60,   y:200, config:{ variant:'s3', formats:'MXF, MP4, MOV' } },
      { id:'tpl-a1',    family:'action',        name:'1. Creer asset',           x:280,  y:200, config:{ actionType:'asset_create',      notes:'Retourne asset_id utilise dans toutes les etapes suivantes' } },
      { id:'tpl-a2',    family:'action',        name:'2. Creer format',          x:500,  y:200, config:{ actionType:'format_create',     notes:'Necessite asset_id. Codec, resolution, framerate...' } },
      { id:'tpl-a3',    family:'action',        name:'3. Creer file set',        x:720,  y:200, config:{ actionType:'file_set_create',   notes:'Necessite asset_id + format_id. Contient les fichiers.' } },
      { id:'tpl-loop',  family:'loop',          name:'4. Boucle fichiers',       x:940,  y:200, config:{ loopSource:'files', loopVar:'file', concurrency:1, onError:'stop' } },
      { id:'tpl-a4',    family:'action',        name:'4a. Enregistrer fichier',  x:1160, y:80,  config:{ actionType:'file_create',       notes:'Un appel par fichier : video + pistes audio separees' } },
      { id:'tpl-dec',   family:'decision',      name:'5. Proxy disponible ?',    x:1160, y:340, config:{ field:'proxy_available', conditions:[{ op:'equals', value:'true', label:'Proxy existant' },{ op:'equals', value:'false', label:'Transcoder iconik' }] } },
      { id:'tpl-a5a',   family:'action',        name:'5a. Upload proxy',         x:1380, y:220, config:{ actionType:'proxy_create',      notes:'Retourne upload_url pre-signe pour PUT du fichier proxy' } },
      { id:'tpl-a5b',   family:'action',        name:'5b. Cloturer proxy',       x:1600, y:220, config:{ actionType:'proxy_patch',       notes:'OBLIGATOIRE - statut CLOSED sinon proxy invisible dans UI' } },
      { id:'tpl-a5c',   family:'action',        name:'5c. Transcoder (iconik)',  x:1380, y:420, config:{ actionType:'transcode_create',  notes:'Format supporte par le transcoder iconik natif' } },
      { id:'tpl-a6',    family:'action',        name:'6. Generer keyframes',     x:1820, y:300, config:{ actionType:'proxy_keyframe',    notes:'Keyframe map + poster depuis proxy - visibilite dans search' } },
      { id:'tpl-a7',    family:'action',        name:'7. Ecrire metadonnees',    x:2040, y:300, config:{ actionType:'metadata_write',    notes:'Associer vue de metadonnees a l asset' } },
      { id:'tpl-a8',    family:'action',        name:'8. Ajouter a collection',  x:2260, y:300, config:{ actionType:'collection_add_asset', notes:'Placer l asset dans la collection cible' } },
      { id:'tpl-notif', family:'notification',  name:'9. Notifier equipe',       x:2480, y:300, config:{ recipients:[{ channel:'email', config:{ subject:'Asset cree : {{asset.title}}', message:'L asset {{asset.title}} est disponible dans iconik.' } }] } },
    ],
    connections: [
      { from:'tpl-src',  fromPort:'out',   to:'tpl-a1',   toPort:'in' },
      { from:'tpl-a1',   fromPort:'out',   to:'tpl-a2',   toPort:'in' },
      { from:'tpl-a2',   fromPort:'out',   to:'tpl-a3',   toPort:'in' },
      { from:'tpl-a3',   fromPort:'out',   to:'tpl-loop', toPort:'in' },
      { from:'tpl-loop', fromPort:'each',  to:'tpl-a4',   toPort:'in' },
      { from:'tpl-loop', fromPort:'done',  to:'tpl-dec',  toPort:'in' },
      { from:'tpl-dec',  fromPort:'out-0', to:'tpl-a5a',  toPort:'in' },
      { from:'tpl-dec',  fromPort:'out-1', to:'tpl-a5c',  toPort:'in' },
      { from:'tpl-a5a',  fromPort:'out',   to:'tpl-a5b',  toPort:'in' },
      { from:'tpl-a5b',  fromPort:'out',   to:'tpl-a6',   toPort:'in' },
      { from:'tpl-a5c',  fromPort:'out',   to:'tpl-a6',   toPort:'in' },
      { from:'tpl-a6',   fromPort:'out',   to:'tpl-a7',   toPort:'in' },
      { from:'tpl-a7',   fromPort:'out',   to:'tpl-a8',   toPort:'in' },
      { from:'tpl-a8',   fromPort:'out',   to:'tpl-notif',toPort:'in' },
    ]
  },

  // ── Template 2 : Ingest hybride Placeholder + Upload ──────
  ingest_hybride: {
    name: "Ingest hybride (Placeholder + Upload API)",
    description: "Workflow complet d'ingest : authentification SSO, validation formulaire, cr\u00E9ation asset placeholder, upload format, transcode proxy, notification statut. Inclut gestion des erreurs et tra\u00E7abilit\u00E9.",
    nodes: [
      { id:'ih-src',    family:'watchfolder', name:'1. Source formulaire / API',  x:60,   y:220, config:{ variant:'api', endpoint:'POST /api/ingest \u2014 formulaire + fichier' } },
      { id:'ih-qc1',   family:'qc',            name:'2. Validation formulaire',    x:280,  y:220, config:{ mode:'all', rules:[
          { category:'metadata', field:'collection_id', op:'present', failPort:'Fail', message:'Collection obligatoire' },
          { category:'metadata', field:'title',         op:'present', failPort:'Fail', message:'Titre obligatoire' },
          { category:'metadata', field:'service',       op:'in_list', value:'GPR,BJ,BMD,LC', failPort:'Fail', message:'Service non reconnu' },
          { category:'file',     field:'codec_video',   op:'present', failPort:'Warning', message:'Format fichier non v\u00E9rifi\u00E9' },
        ], outputs:[{label:'Valide',color:'#27ae60'},{label:'Invalide',color:'#e74c3c'},{label:'Warning',color:'#f39c12'}] } },
      { id:'ih-tr',     family:'transform',     name:'3. G\u00E9n\u00E9rer nom normalis\u00E9',   x:560,  y:140, config:{ target:'title', separator:'_', caseMode:'upper', maxLen:80,
          rules:[{source:'date',value:'DATE'},{source:'field',field:'service'},{source:'field',field:'project'},{source:'field',field:'title'},{source:'field',field:'type_media'},{source:'field',field:'statut'}] } },
      { id:'ih-a1',     family:'action',        name:'4. Cr\u00E9er asset placeholder', x:800,  y:140, config:{ actionType:'asset_create',     notes:'Retourne asset_id \u2014 asset vide avant upload' } },
      { id:'ih-a2',     family:'action',        name:'5. \u00C9crire m\u00E9tadonn\u00E9es',      x:1020, y:140, config:{ actionType:'metadata_write',    notes:'Projet, \u00E9mission, type, tags, collection_id' } },
      { id:'ih-a3',     family:'action',        name:'6. Ajouter \u00E0 collection',    x:1240, y:140, config:{ actionType:'collection_add_asset',notes:'collection_id issu du formulaire' } },
      { id:'ih-a4',     family:'action',        name:'7. Cr\u00E9er format original',   x:1460, y:140, config:{ actionType:'format_create',     notes:'Format "original" attach\u00E9 \u00E0 l asset' } },
      { id:'ih-a5',     family:'action',        name:'8. Cr\u00E9er file set',          x:1680, y:140, config:{ actionType:'file_set_create',   notes:'N\u00E9cessite asset_id + format_id' } },
      { id:'ih-a6',     family:'action',        name:'9. Enregistrer fichier',     x:1900, y:140, config:{ actionType:'file_create',       notes:'Checksum, taille, path relatif au storage' } },
      { id:'ih-a7',     family:'action',        name:'10. Lancer transcode proxy', x:2120, y:140, config:{ actionType:'transcode_create',  notes:'Proxy H.264 720p max 4Mb, no b-frames' } },
      { id:'ih-script', family:'script',        name:'11. Tra\u00E7abilit\u00E9 ingest',     x:2340, y:140, config:{ lang:'javascript', ports:[{label:'ok'},{label:'error'}] } },
      { id:'ih-dec',    family:'decision',      name:'12. Jobs termin\u00E9s ?',        x:2560, y:220, config:{ field:'job_status', conditions:[{op:'equals',value:'done',label:'Succ\u00E8s'},{op:'equals',value:'failed',label:'\u00C9chec'}] } },
      { id:'ih-notif1', family:'notification',  name:'13a. Notif Pr\u00EAt',            x:2780, y:100, config:{ recipients:[{ channel:'email', config:{ subject:'Asset pr\u00EAt : {{asset.title}}', message:'Votre asset est disponible dans Iconik. Statut : Pr\u00EAt pour \u00E9dition.' } }] } },
      { id:'ih-notif2', family:'notification',  name:'13b. Notif \u00C9chec',           x:2780, y:340, config:{ recipients:[{ channel:'email', config:{ subject:'\u00C9chec ingest : {{asset.title}}', message:'L ingest a \u00E9chou\u00E9. Cause : {{job.error}}. Action requise.' } }] } },
      { id:'ih-note1',  family:'postit',        name:'Auth SSO',                  x:60,   y:60,  config:{ color:'#3498db', text:'Authentification SSO/IdP\nL orchestrateur v\u00E9rifie\nl identit\u00E9 et les collections\nautoris\u00E9es avant toute action.' } },
      { id:'ih-note2',  family:'postit',        name:'Idempotence',               x:800,  y:380, config:{ color:'#e67e22', text:'Idempotence :\nV\u00E9rifier si un asset avec\nle m\u00EAme fichier source existe\navant de cr\u00E9er un doublon.' } },
    ],
    connections: [
      { from:'ih-src',    fromPort:'out',   to:'ih-qc1',   toPort:'in' },
      { from:'ih-qc1',   fromPort:'out-0', to:'ih-tr',    toPort:'in' },
      { from:'ih-qc1',   fromPort:'out-1', to:'ih-notif2',toPort:'in' },
      { from:'ih-tr',    fromPort:'out',   to:'ih-a1',    toPort:'in' },
      { from:'ih-a1',    fromPort:'out',   to:'ih-a2',    toPort:'in' },
      { from:'ih-a2',    fromPort:'out',   to:'ih-a3',    toPort:'in' },
      { from:'ih-a3',    fromPort:'out',   to:'ih-a4',    toPort:'in' },
      { from:'ih-a4',    fromPort:'out',   to:'ih-a5',    toPort:'in' },
      { from:'ih-a5',    fromPort:'out',   to:'ih-a6',    toPort:'in' },
      { from:'ih-a6',    fromPort:'out',   to:'ih-a7',    toPort:'in' },
      { from:'ih-a7',    fromPort:'out',   to:'ih-script',toPort:'in' },
      { from:'ih-script',fromPort:'out-0', to:'ih-dec',   toPort:'in' },
      { from:'ih-dec',   fromPort:'out-0', to:'ih-notif1',toPort:'in' },
      { from:'ih-dec',   fromPort:'out-1', to:'ih-notif2',toPort:'in' },
    ]
  },

  // ── Template 3 : Nomenclature & QC naming ──────────────────
  nomenclature_qc: {
    name: "QC Nomenclature (R\u00E8gle Bayard)",
    description: "Contr\u00F4le et g\u00E9n\u00E9ration du nom normalis\u00E9 selon la r\u00E8gle AAAAMMJJ_SERVICE_PROJET_TITRE_TYPE_STATUT. Valeurs normalis\u00E9es, longueur max 80 car, MAJUSCULES, pas d'espaces ni d'accents.",
    nodes: [
      { id:'nq-src',  family:'watchfolder', name:'Asset entrant',              x:60,  y:200, config:{ variant:'automation' } },
      { id:'nq-qc1',  family:'qc',        name:'1. Champs obligatoires',     x:280, y:200, config:{ mode:'all',
          rules:[
            { category:'metadata', field:'service', op:'present',  failPort:'Fail', message:'SERVICE obligatoire' },
            { category:'metadata', field:'project', op:'present',  failPort:'Fail', message:'PROJET obligatoire' },
            { category:'metadata', field:'title',   op:'present',  failPort:'Fail', message:'TITRE obligatoire' },
            { category:'metadata', field:'type_media', op:'in_list', value:'VID,AUD,IMG,PRJ,DOC', failPort:'Fail', message:'TYPE non reconnu' },
            { category:'metadata', field:'statut',  op:'in_list', value:'SRC,WRK,FIN', failPort:'Fail', message:'STATUT non reconnu' },
            { category:'metadata', field:'service', op:'in_list', value:'GPR,BJ,BMD,LC', failPort:'Fail', message:'SERVICE non reconnu' },
          ],
          outputs:[{label:'Valide',color:'#27ae60'},{label:'Invalide',color:'#e74c3c'}] } },
      { id:'nq-qc2',  family:'qc',        name:'2. QC Regex titre existant', x:500, y:100, config:{ mode:'all',
          rules:[
            { category:'metadata', field:'title', op:'regex', value:'^[0-9]{8}_[A-Z]+_[A-Z0-9_]+$', failPort:'Warning', message:'Titre ne respecte pas la nomenclature' },
            { category:'metadata', field:'title', op:'lt',    value:'81', failPort:'Fail', message:'Titre > 80 caract\u00E8res' },
          ],
          outputs:[{label:'Conforme',color:'#27ae60'},{label:'Non conforme',color:'#f39c12'},{label:'Trop long',color:'#e74c3c'}] } },
      { id:'nq-tr',   family:'transform', name:'3. G\u00E9n\u00E9rer nom normalis\u00E9',   x:720, y:100, config:{ target:'title', separator:'_', caseMode:'upper', maxLen:80,
          rules:[{source:'date'},{source:'field',field:'service'},{source:'field',field:'project'},{source:'field',field:'season',value:'S?'},{source:'field',field:'episode',value:'E?'},{source:'field',field:'title'},{source:'field',field:'type_media'},{source:'field',field:'statut'}] } },
      { id:'nq-a1',   family:'action',    name:'4. \u00C9crire titre normalis\u00E9',  x:940, y:100, config:{ actionType:'metadata_patch', notes:'Patch title avec nom g\u00E9n\u00E9r\u00E9 par Transform' } },
      { id:'nq-notif',family:'notification',name:'5. Notif non-conformit\u00E9',  x:500, y:340, config:{ recipients:[{ channel:'email', config:{ subject:'Non-conformit\u00E9 naming : {{asset.title}}', message:'Champs manquants ou valeurs non reconnues. Merci de corriger.' } }] } },
      { id:'nq-note', family:'postit',    name:'R\u00E8gle nomenclature',         x:60,  y:60,  config:{ color:'#8e44ad', text:'AAAAMMJJ_SERVICE_PROJET\n(_SAISON_EP_)TITRE_TYPE_STATUT\n\nOBLIGATOIRES: DATE SERVICE\nPROJET TITRE TYPE STATUT\nMAX 80 CAR \u00B7 MAJUSCULES' } },
    ],
    connections: [
      { from:'nq-src', fromPort:'out',   to:'nq-qc1',  toPort:'in' },
      { from:'nq-qc1', fromPort:'out-0', to:'nq-qc2',  toPort:'in' },
      { from:'nq-qc1', fromPort:'out-1', to:'nq-notif',toPort:'in' },
      { from:'nq-qc2', fromPort:'out-0', to:'nq-tr',   toPort:'in' },
      { from:'nq-qc2', fromPort:'out-1', to:'nq-tr',   toPort:'in' },
      { from:'nq-tr',  fromPort:'out',   to:'nq-a1',   toPort:'in' },
    ]
  },
};

function ouvrirTemplates() {
  const body = document.getElementById('modal-templates-body');
  if (body) {
    body.innerHTML = Object.entries(FLOW_TEMPLATES).map(([key, tpl]) => `
      <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:4px;">\uD83D\uDCCB ${tpl.name}</div>
          <div style="font-size:11px;color:#555;line-height:1.5;">${tpl.description}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            ${[...new Set(tpl.nodes.map(n=>n.family))].map(f => {
              const fam = FAMILIES[f];
              return fam ? `<span style="padding:2px 8px;border-radius:10px;font-size:10px;
                background:${fam.color}22;color:${fam.color};border:1px solid ${fam.color}44;">
                ${fam.icon} ${fam.label}</span>` : '';
            }).join('')}
          </div>
        </div>
        <button class="cfg-btn primary" style="flex-shrink:0;white-space:nowrap;"
          onclick="chargerTemplate('${key}')">Charger ce template</button>
      </div>`).join('');
  }
  document.getElementById('modal-templates').style.display = 'flex';
}

function fermerTemplates() {
  document.getElementById('modal-templates').style.display = 'none';
}

function chargerTemplate(key) {
  const tpl = FLOW_TEMPLATES[key];
  if (!tpl) return;

  if (!confirm('Creer un nouveau flux a partir du template "' + tpl.name + '" ?')) return;

  const id    = 'flux-' + Date.now();
  const nodes = tpl.nodes.map(n => ({
    ...n,
    ports: buildPortsDef(n.family, n.config || {}),
  }));

  const flux = { id, name:tpl.name, nodes, connections:[...tpl.connections] };
  wfdFlows.push(flux);
  sauvegarderEtat();

  currentFlowId = id;
  peuplerSelectFlux();
  const sel = document.getElementById('wfd-flow-select');
  if (sel) sel.value = id;
  const btnDel = document.getElementById('btn-del-flux');
  if (btnDel) btnDel.style.display = 'flex';

  fermerTemplates();
  renderCanvas();
  // Centrer la vue sur le canvas
  setTimeout(() => { offsetX=40; offsetY=40; scale=0.6; applyTransform(); }, 100);
  toast('Template charge en ' + nodes.length + ' noeuds \u2713');
}

// ── Contacts ────────────────────────────────────────────────
function ouvrirContacts() {
  if (typeof ouvrirRessources === 'function') { ouvrirRessources('contacts'); return; }
  renderListesContacts();
  document.getElementById('modal-contacts').style.display = 'flex';
}
function fermerContacts() {
  document.getElementById('modal-contacts').style.display = 'none';
}

function renderListesContacts() {
  const body = document.getElementById('modal-contacts-body');
  if (!wfdContacts.length) {
    body.innerHTML = `<div style="color:#555;font-size:13px;text-align:center;padding:24px;">
      Aucune liste cr\u00E9\u00E9e.<br>Cr\u00E9ez une liste pour regrouper vos contacts et les r\u00E9utiliser dans les n\u0153uds Notification.
    </div>`;
    return;
  }
  body.innerHTML = wfdContacts.map(l => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;
      background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;">
      <div>
        <div style="font-size:13px;color:#fff;font-weight:600;">\uD83D\uDC65 ${l.name}</div>
        <div style="font-size:11px;color:#555;margin-top:2px;font-family:var(--font-mono);">
          ${l.contacts.length} contact(s)
          ${l.contacts.slice(0,3).map(c=>c.email||c.nom).filter(Boolean).join(', ')}
          ${l.contacts.length > 3 ? '...' : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="cfg-btn" style="width:auto;padding:5px 12px;" onclick="editerListe('${l.id}')">\u00C9diter</button>
        <button class="cfg-btn danger" style="width:auto;padding:5px 10px;" onclick="supprimerListe('${l.id}')">\uD83D\uDDD1</button>
      </div>
    </div>`).join('');
}

function creerListe() {
  // Cas 1 : la modale Ressources est présente → on suit le flux existant
  let footer = document.getElementById('res-footer');
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;width:100%;">
        <input id="new-liste-name" class="cfg-input" style="flex:1;"
               placeholder="Nom de la liste (ex : Équipe Post-Prod)" autofocus>
        <button class="cfg-btn primary" onclick="confirmerCreerListe()">✓ Créer</button>
        <button class="cfg-btn" onclick="resTab('contacts')">Annuler</button>
      </div>`;
    setTimeout(() => {
      if (document.activeElement) document.activeElement.blur();
      document.getElementById('new-liste-name')?.focus({ preventScroll: true });
    }, 100);
    return;
  }

  // Cas 2 : pas de modale Ressources → fallback autonome
  // 2a) Créer la liste tout de suite avec un nom temporaire
  const l = { id:'lst-' + Date.now(), name:'Nouvelle liste', contacts:[] };
  wfdContacts.push(l);
  sauvegarderEtat();

  // 2b) Ouvrir la modale Contacts si disponible, puis l'éditeur de la liste
  if (typeof ouvrirContacts === 'function') {
    try { ouvrirContacts(); } catch(e) { /* si déjà ouverte, on ignore */ }
  }
  // 2c) Ouvrir l'éditeur de cette liste (nom modifiable en haut)
  if (typeof editerListe === 'function') {
    editerListe(l.id);
  } else {
    toast('Éditeur de liste indisponible', true);
  }
}

function confirmerCreerListe() {
  const name = document.getElementById('new-liste-name')?.value?.trim();
  if (!name) return;
  const l = { id:'lst-'+Date.now(), name, contacts:[] };
  wfdContacts.push(l);
  sauvegarderEtat();
  fermerRessources();
  setTimeout(() => editerListe(l.id), 50);
}

function supprimerListe(id) {
  if (!confirm('Supprimer cette liste de contacts ?')) return;
  wfdContacts = wfdContacts.filter(l=>l.id!==id);
  sauvegarderEtat();
  renderListesContacts();
  toast('Liste supprim\u00E9e');
}

function editerListe(id) {
  const l = wfdContacts.find(x=>x.id===id);
  if (!l) return;
  document.getElementById('modal-contacts').style.display = 'none';
  document.getElementById('modal-liste-edit').dataset.id = id;
  document.getElementById('modal-liste-title').textContent = '\uD83D\uDC65 ' + l.name;
  renderEditionListe(l);
  document.getElementById('modal-liste-edit').style.display = 'flex';
}

function renderEditionListe(l) {
  const body = document.getElementById('modal-liste-edit-body');
  body.innerHTML = `
    <div class="cfg-field">
      <label class="cfg-label">Nom de la liste</label>
      <input id="listeedit-name" class="cfg-input" value="${l.name}">
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px;">
      <span class="cfg-label">CONTACTS</span>
      <div style="display:flex;gap:6px;">
        <button class="btn-add-cond" onclick="importerCSVContacts()">\uD83D\uDCC2 Import CSV</button>
        <button class="btn-add-cond" onclick="ajouterContact()">+ Contact</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1.2fr 0.7fr 0.7fr 0.7fr 28px;
      gap:4px;align-items:center;padding:0 4px;margin-bottom:4px;">
      ${['NOM','EMAIL','TEAMS','SLACK','SMS',''].map(h=>
        `<span style="font-size:9px;color:#444;font-family:var(--font-mono);">${h}</span>`
      ).join('')}
    </div>
    <div id="listeedit-rows">
      ${l.contacts.map((c,i)=>buildContactRow(i,c)).join('')}
    </div>
    ${!l.contacts.length ? `<div style="color:#444;font-size:12px;text-align:center;padding:16px;">
      Aucun contact — cliquez "+ Contact" pour commencer</div>` : ''}`;
}

function buildContactRow(i, c) {
  const f = (cls, key, ph, type='text') =>
    `<input type="${type}" class="${cls} contact-field" data-key="${key}"
      value="${(c[key]||'').replace(/"/g,'&quot;')}" placeholder="${ph}"
      style="padding:5px 7px;background:var(--wfd-panel);color:var(--wfd-text);
        border:1px solid var(--wfd-border2);border-radius:4px;font-size:11px;outline:none;width:100%;box-sizing:border-box;">`;
  return `<div style="display:grid;grid-template-columns:1fr 1.2fr 0.7fr 0.7fr 0.7fr 28px;
    gap:4px;align-items:center;padding:4px;background:#0d0d0d;border:1px solid #222;
    border-radius:5px;margin-bottom:3px;" id="contact-row-${i}">
    ${f('','nom','Nom Prénom')}
    ${f('','email','email@example.com','email')}
    ${f('','teams','user@org.com')}
    ${f('','slack','@username')}
    ${f('','sms','+33600000000')}
    <button class="btn-del-cond" onclick="supprimerContact(${i})">\u00D7</button>
  </div>`;
}

function ajouterContact() {
  const rows = document.getElementById('listeedit-rows');
  if (!rows) return;
  const i = rows.querySelectorAll('[id^=contact-row-]').length;
  rows.insertAdjacentHTML('beforeend', buildContactRow(i, {}));
}

function supprimerContact(i) {
  document.getElementById('contact-row-'+i)?.remove();
}

function importerCSVContacts() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').filter(Boolean);
      // Détecter header
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes('nom') || firstLine.includes('email') || firstLine.includes('name');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const rows = document.getElementById('listeedit-rows');
      if (!rows) return;
      let added = 0;
      dataLines.forEach(line => {
        const cols = line.split(/[,;\t]/).map(s=>s.trim().replace(/^"|"$/g,''));
        if (!cols.length || !cols[0]) return;
        // Tentative de mapping intelligent : chercher colonne email
        let nom='', email='', teams='', slack='', sms='';
        if (hasHeader) {
          const headers = firstLine.split(/[,;\t]/).map(s=>s.trim().replace(/^"|"$/g,''));
          headers.forEach((h,idx) => {
            const val = cols[idx] || '';
            if (/email|mail/.test(h))       email  = val;
            else if (/nom|name|prénom/.test(h)) nom = val;
            else if (/teams/.test(h))        teams  = val;
            else if (/slack/.test(h))        slack  = val;
            else if (/sms|tel|phone/.test(h)) sms   = val;
          });
        } else {
          // Sans header : col0=nom, col1=email, col2=teams, col3=slack, col4=sms
          [nom, email, teams, slack, sms] = cols;
        }
        const i = rows.querySelectorAll('[id^=contact-row-]').length;
        rows.insertAdjacentHTML('beforeend', buildContactRow(i, { nom, email:email||'', teams:teams||'', slack:slack||'', sms:sms||'' }));
        added++;
      });
      toast(added + ' contact(s) import\u00E9(s)');
    };
    reader.readAsText(file);
  };
  input.click();
}

function exporterCSVContacts() {
  const id = document.getElementById('modal-liste-edit').dataset.id;
  const l  = wfdContacts.find(x=>x.id===id);
  if (!l || !l.contacts.length) { toast('Aucun contact \u00E0 exporter', true); return; }
  const header = 'Nom,Email,Teams,Slack,SMS';
  const rows   = l.contacts.map(c =>
    [c.nom,c.email,c.teams,c.slack,c.sms].map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(',')
  );
  const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = l.name.replace(/\s+/g,'-')+'-contacts.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV export\u00E9 \u2713');
}

function lireContactsDuForm() {
  const rows = document.querySelectorAll('#listeedit-rows [id^=contact-row-]');
  return [...rows].map(row => {
    const c = {};
    row.querySelectorAll('.contact-field').forEach(el => { if(el.dataset.key) c[el.dataset.key] = el.value; });
    return c;
  }).filter(c => c.email || c.nom);
}

function sauvegarderListe() {
  const id = document.getElementById('modal-liste-edit').dataset.id;
  const l  = wfdContacts.find(x=>x.id===id);
  if (!l) return;
  l.name     = document.getElementById('listeedit-name')?.value.trim() || l.name;
  l.contacts = lireContactsDuForm();
  sauvegarderEtat();
  fermerEditionListe();
  ouvrirContacts();
  toast('Liste sauvegard\u00E9e \u2014 ' + l.contacts.length + ' contact(s) \u2713');
}

function fermerEditionListe() {
  document.getElementById('modal-liste-edit').style.display = 'none';
}

// Charger une liste dans un nœud Notification
function chargerListeNotif(listeId, recipientIdx) {
  const l = wfdContacts.find(x=>x.id===listeId);
  if (!l) return;
  // Construire les adresses emails séparées par virgule
  const emails = l.contacts.map(c=>c.email).filter(Boolean).join(', ');
  const teams  = l.contacts.map(c=>c.teams).filter(Boolean).join(', ');
  const slack  = l.contacts.map(c=>c.slack).filter(Boolean).join(', ');

  // Injecter dans le champ "to" du destinataire courant si email,
  // sinon dans le champ webhook_url pour teams/slack
  const container = document.getElementById('mn-recipients') || document.getElementById('cfg-recipients');
  if (!container) return;
  const row = container.querySelector(`#recip-row-${recipientIdx}`);
  if (!row) return;
  const ch = row.querySelector('.notif-channel-sel')?.value || 'email';
  if (ch === 'email') {
    const toField = row.querySelector('[data-key="to"]');
    if (toField) toField.value = emails;
  } else if (ch === 'teams' || ch === 'slack') {
    const urlField = row.querySelector('[data-key="webhook_url"]');
    if (urlField) urlField.value = ch === 'teams' ? teams : slack;
  }
  toast('Liste "'+l.name+'" charg\u00E9e \u2014 '+l.contacts.length+' contact(s)');
}

// ── Éditeur script ──────────────────────────────────────────
let wfdScriptBuffer  = null;
let wfdScriptPartageRef = null; // script partagé en cours d'édition
let wfdScriptNodeRef = null;
let wfdScriptOriginalCode = null;   // code à l'ouverture, pour détecter modification
let wfdScriptOriginalLang = null;

function ouvrirEditeurScript(nodeId, scriptPartage) {
  // Mode script partagé (depuis Ressources)
  if (scriptPartage) {
    wfdScriptNodeRef      = null;
    wfdScriptPartageRef   = scriptPartage;
    const lang  = scriptPartage.lang || 'javascript';
    const code  = scriptPartage.code || DEFAULT_SCRIPTS[lang] || '';
    wfdScriptBuffer       = code;
    wfdScriptOriginalCode = code;
    wfdScriptOriginalLang = lang;
    document.getElementById('script-lang-sel').value = lang;
    document.getElementById('script-code-area').value = code;
    // Titre avec champ nom éditable
    document.getElementById('modal-script-title').innerHTML =
      `<input id="script-partage-name" value="${(scriptPartage.name||'').replace(/"/g,'"')}"
        style="background:transparent;border:none;border-bottom:1px solid #444;color:#fff;
               font-size:14px;font-family:var(--font-sans);outline:none;min-width:200px;"
        placeholder="Nom du script">`;
    mettreAJourPortsHint([{ label:'success' }, { label:'error' }]);
    effacerFeedbackScript();

    // Afficher la modale
    const modal = document.getElementById('modal-script-editor');
    modal.style.display = 'flex';

    // NOUVEAU : section Variables + insertion au curseur
    injectScriptVarPicker(modal);
    bindScriptVarInsertion();

    setTimeout(() => {
      if (document.activeElement) document.activeElement.blur();
      const nameEl = document.getElementById('script-partage-name');
      if (nameEl) { nameEl.focus({ preventScroll: true }); nameEl.select(); }
    }, 150);
    return;
  }

  // Mode nœud script normal
  wfdScriptPartageRef = null;
  const flux = getFluxCourant();
  const node = flux?.nodes.find(n=>n.id===(nodeId||selectedNodeId));
  const cfg  = node?.config || {};

  const lang  = document.getElementById('mn-script-lang')?.value || cfg.lang || 'javascript';
  const ports = lirePortsScript('mn-script-ports').length
    ? lirePortsScript('mn-script-ports')
    : (cfg.ports || [{ label:'success' }, { label:'error' }]);
  const code  = cfg.code || DEFAULT_SCRIPTS[lang] || '';

  wfdScriptNodeRef      = node || null;
  wfdScriptBuffer       = code;
  wfdScriptOriginalCode = code;
  wfdScriptOriginalLang = lang;

  document.getElementById('script-lang-sel').value = lang;
  document.getElementById('script-code-area').value = code;
  document.getElementById('modal-script-title').textContent =
    node ? (node.name + ' — Script') : 'Éditeur de script';

  mettreAJourPortsHint(ports);
  effacerFeedbackScript();

  // Afficher la modale
  const modal = document.getElementById('modal-script-editor');
  modal.style.display = 'flex';

  // NOUVEAU : section Variables + insertion au curseur
  injectScriptVarPicker(modal);
  bindScriptVarInsertion();

  setTimeout(() => {
    if (document.activeElement) document.activeElement.blur();
    document.getElementById('script-code-area')?.focus({ preventScroll: true });
  }, 150);

  // ================= Helpers (nouveaux) =================

  // Injecte la section “Variables” dans le panneau droit
  // Injecte la section “Variables” dans le panneau droit (robuste)
 function injectScriptVarPicker(modalEl) {
  if (!modalEl) return;

  // 0) Évite la double-injection si on rouvre l’éditeur
  if (document.getElementById('se-vars-section')) return;

  // 1) Essais directs sur des conteneurs de colonne de droite
  let side =
    modalEl.querySelector('#se-side') ||
    modalEl.querySelector('.se-right') ||
    modalEl.querySelector('.script-side') ||
    modalEl.querySelector('[data-role="script-side"]') ||
    modalEl.querySelector('.ports-side') ||
    modalEl.querySelector('.editor-side');

  // 2) Fallback “intelligent” : repérer la section SNIPPETS
  //    On cherche un libellé dont le texte contient "SNIPPETS" (insensible à la casse).
  let snippetsLabel = null;
  if (!side) {
    const labels = Array.from(modalEl.querySelectorAll('.cfg-label, .section-title, label, h3, h4'));
    snippetsLabel = labels.find(el => /snippets/i.test((el.textContent || '').trim()));
    if (snippetsLabel) {
      // Si on a trouvé "SNIPPETS", on cible son parent immédiat pour insérer avant
      side = snippetsLabel.parentElement || null;
    }
  }

  // 3) Choix du point d’injection et insertion
  const html = `
    <!-- SECTION : Variables (utilise l’overlay {…} existant) -->
    <div class="se-section" id="se-vars-section" style="margin-bottom:10px;">
      <div class="cfg-label" style="margin-bottom:6px;">Variables</div>

      <!-- IMPORTANT : list doit se terminer par -wfd-var-list pour déclencher l’overlay -->
      <input id="se-var-insert" class="cfg-input"
             list="se-wfd-var-list"
             placeholder="{asset.id}, {asset.metadata.Titre}, {collection.name}…"
             style="font-family:var(--font-mono); font-size:12px;">

      <div style="font-size:10px;color:#555;margin-top:6px;">
        Tape <code>{</code> pour ouvrir la liste. Clique pour insérer au curseur.
      </div>
    </div>

    <!-- <datalist> vide : l’overlay ne lit pas son contenu, il a juste besoin d’un id finissant par -wfd-var-list -->
    <datalist id="se-wfd-var-list"></datalist>
  `;

  if (snippetsLabel && side) {
    // Insertion juste AU-DESSUS de "SNIPPETS"
    snippetsLabel.insertAdjacentHTML('beforebegin', html);
  } else if (side) {
    // Insertion en haut de la colonne droite trouvée
    side.insertAdjacentHTML('afterbegin', html);
  } else {
    // Dernier recours : tout en haut de la modale
    modalEl.insertAdjacentHTML('afterbegin', html);
  }
}
``

  // Écoute la sélection d’une variable et insère dans l’éditeur au curseur
  function bindScriptVarInsertion() {
    const inp = document.getElementById('se-var-insert');
    if (!inp) return;

    // L’overlay (défini dans wfd-config-panel.js) positionne input.value
    // et déclenche 'input' + 'change'. On se branche sur 'change'.
    inp.addEventListener('change', () => {
      const v = inp.value && inp.value.trim();
      if (!v) return;
      insertIntoScriptAtCursor(v);
      setTimeout(() => { inp.value = ''; }, 0); // nettoyage
    });
  }

  // Insertion au curseur : Monaco -> CodeMirror -> <textarea> (fallback)
  function insertIntoScriptAtCursor(text) {
    // 1) Monaco (si exposé)
    if (window._monacoEditor && typeof _monacoEditor.getSelection === 'function') {
      const ed  = _monacoEditor;
      const sel = ed.getSelection();
      ed.executeEdits('var-pick', [{ range: sel, text, forceMoveMarkers: true }]);
      ed.focus();
      return;
    }
    // 2) CodeMirror (si exposé)
    if (window._codeMirror && typeof _codeMirror.replaceSelection === 'function') {
      _codeMirror.replaceSelection(text, 'around');
      _codeMirror.focus();
      return;
    }
    // 3) Fallback <textarea> — chez toi : #script-code-area
    const ta =
      document.getElementById('script-code-area') ||
      document.querySelector('[data-role="script-code"]') ||
      document.querySelector('.se-codearea');

    if (ta && typeof ta.selectionStart === 'number') {
      const { selectionStart:s, selectionEnd:e, value } = ta;
      ta.value = value.slice(0, s) + text + value.slice(e);
      const pos = s + text.length;
      ta.selectionStart = ta.selectionEnd = pos;
      ta.dispatchEvent(new Event('input', { bubbles:true })); // si buffer relié
      ta.focus();
    }
  }
}

function mettreAJourPortsHint(ports) {
  const hint = document.getElementById('script-ports-hint');
  if (!hint) return;
  hint.innerHTML = ports.map((p,i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:#111;border-radius:4px;cursor:pointer;"
      onclick="insererRetourPort('${p.label}')" title="Cliquer pour ins\u00E9rer return">
      <span style="width:8px;height:8px;border-radius:50%;background:${conditionColor(i)};flex-shrink:0;"></span>
      <span style="color:#ccc;flex:1;">${p.label}</span>
      <span style="color:#444;font-size:9px;">\u21B5</span>
    </div>`).join('');
}

function insererRetourPort(label) {
  const ta   = document.getElementById('script-code-area');
  const lang = document.getElementById('script-lang-sel')?.value || 'javascript';
  if (!ta) return;
  const snippet = lang === 'python'
    ? `return {"port": "${label}"}`
    : `return { port: '${label}' };`;
  const s = ta.selectionStart;
  ta.value = ta.value.slice(0,s) + snippet + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = s + snippet.length;
  ta.focus({ preventScroll: true });
}

function changerLangScript(newLang) {
  const area    = document.getElementById('script-code-area');
  const prevLang = wfdScriptOriginalLang || (newLang === 'javascript' ? 'python' : 'javascript');
  if (!area) return;

  const currentCode = area.value.trim();
  const isDefault   = !currentCode || currentCode === DEFAULT_SCRIPTS[prevLang];
  const isModified  = !isDefault && currentCode !== (wfdScriptOriginalCode||'').trim();

  if (isModified) {
    // Code modifié : proposer trois options
    afficherChoixConversion(newLang, prevLang, currentCode);
  } else {
    // Code vierge ou template non modifié : remplacer silencieusement
    area.value = DEFAULT_SCRIPTS[newLang] || '';
    wfdScriptOriginalLang = newLang;
    effacerFeedbackScript();
  }
}

function afficherChoixConversion(newLang, prevLang, code) {
  const banner = document.getElementById('script-lang-banner');
  if (!banner) return;
  banner.style.display = 'flex';
  banner.innerHTML = `
    <span style="flex:1;font-size:11px;color:#f39c12;">
      \u26A0\uFE0F Code ${prevLang === 'javascript' ? 'JavaScript' : 'Python'} existant \u2014 que faire ?
    </span>
    <button onclick="appliquerConversionLang('${newLang}','replace')"
      style="padding:4px 10px;background:#e74c3c;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:6px;">
      Remplacer par le template ${newLang === 'javascript' ? 'JS' : 'Python'}
    </button>
    <button onclick="appliquerConversionLang('${newLang}','keep')"
      style="padding:4px 10px;background:#2a2a2a;color:#aaa;border:1px solid #444;border-radius:4px;font-size:11px;cursor:pointer;margin-left:6px;">
      Garder mon code (\u00E0 adapter manuellement)
    </button>
    <button onclick="appliquerConversionLang('${prevLang}','cancel')"
      style="padding:4px 10px;background:none;color:#555;border:none;font-size:18px;cursor:pointer;line-height:1;margin-left:4px;">\u00D7</button>`;
}

function appliquerConversionLang(lang, action) {
  const area = document.getElementById('script-code-area');
  const banner = document.getElementById('script-lang-banner');
  if (banner) banner.style.display = 'none';

  document.getElementById('script-lang-sel').value = lang;

  if (action === 'replace') {
    area.value = DEFAULT_SCRIPTS[lang] || '';
  }
  // 'keep' = on laisse le code tel quel, l'utilisateur adapte manuellement
  // 'cancel' = on revient à l'ancien langage (déjà fait via setValue ci-dessus)

  wfdScriptOriginalLang = lang;
  effacerFeedbackScript();
}

function testerSyntaxeScript() {
  const code = document.getElementById('script-code-area')?.value || '';
  const lang = document.getElementById('script-lang-sel')?.value || 'javascript';
  const fb   = document.getElementById('script-feedback');
  if (!fb) return;

  if (lang === 'javascript') {
    try {
      // new Function vérifie la syntaxe JS sans exécuter
      new Function(code);
      afficherFeedback('success', '\u2713 Syntaxe JavaScript valide');
    } catch(e) {
      // Extraire numéro de ligne si disponible
      const match = e.message.match(/line (\d+)/i) || e.stack?.match(/:(\d+):(\d+)/);
      const loc   = match ? ' (ligne ~'+match[1]+')' : '';
      afficherFeedback('error', '\u2717 Erreur JS' + loc + ' : ' + e.message);
    }
  } else {
    // Python : vérifications basiques (pas d'exécution possible en navigateur)
    const lines = code.split('\n');
    const errors = [];
    lines.forEach((line, i) => {
      // Détecter les erreurs de syntaxe Python les plus communes
      if (/^\s*def\s+\w+\s*[^(]/.test(line))
        errors.push(`Ligne ${i+1} : def sans parenth\u00E8ses`);
      if (/[^=!<>]=(?!=)(?!>)/.test(line) && /print\s+[^(]/.test(line))
        errors.push(`Ligne ${i+1} : print() n\u00E9cessite des parenth\u00E8ses (Python 3)`);
      if (/^(if|for|while|def|class|with|try|except)\b/.test(line.trim()) && !line.trim().endsWith(':'))
        errors.push(`Ligne ${i+1} : bloc sans ':' en fin de ligne`);
    });
    // Vérifier présence de return
    if (!code.includes('return'))
      errors.push('Attention : aucun return trouv\u00E9 \u2014 le flux ne sera pas pilot\u00E9');

    if (errors.length === 0) {
      afficherFeedback('success', '\u2713 Aucune erreur Python d\u00E9tect\u00E9e (v\u00E9rification basique)');
    } else {
      afficherFeedback('error', errors.join('\n'));
    }
  }
}

function afficherFeedback(type, message) {
  const fb = document.getElementById('script-feedback');
  if (!fb) return;
  fb.style.display = 'block';
  fb.style.background = type === 'success' ? 'rgba(0,212,170,0.1)' : 'rgba(231,76,60,0.12)';
  fb.style.borderColor = type === 'success' ? '#00d4aa' : '#e74c3c';
  fb.style.color       = type === 'success' ? '#00d4aa' : '#e74c3c';
  fb.textContent = message;
}

function effacerFeedbackScript() {
  const fb = document.getElementById('script-feedback');
  if (fb) fb.style.display = 'none';
  const banner = document.getElementById('script-lang-banner');
  if (banner) banner.style.display = 'none';
}

function fermerEditeurScript() {
  document.getElementById('modal-script-editor').style.display = 'none';
  effacerFeedbackScript();
}

function sauvegarderScript() {
  const code = document.getElementById('script-code-area').value;
  const lang = document.getElementById('script-lang-sel').value;
  wfdScriptBuffer = code;

  if (wfdScriptPartageRef) {
    const nameEl = document.getElementById('script-partage-name');
    if (nameEl && nameEl.value.trim()) wfdScriptPartageRef.name = nameEl.value.trim();
    wfdScriptPartageRef.code = code;
    wfdScriptPartageRef.lang = lang;
    sauvegarderEtat();
    fermerEditeurScript();
    ouvrirRessources('scripts');
    toast('Script partagé sauvegardé ✓');
    return;
  }

  if (wfdScriptNodeRef) {
    wfdScriptNodeRef.config       = wfdScriptNodeRef.config || {};
    wfdScriptNodeRef.config.code  = code;
    wfdScriptNodeRef.config.lang  = lang;
    sauvegarderEtat();
    renderCanvas();
  }
  fermerEditeurScript();
  toast('Script sauvegardé ✓');
}
function scriptTabHandler(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const ta = e.target;
  const s = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = s + 2;
}

const SNIPPETS = {
  javascript: {
    history: `const now = new Date().toISOString().replace('T',' ').slice(0,19);
const line = now + ' | ' + workflowName + ' | Reussi';
metadata['Workflow History'] = line + '\n' + (metadata['Workflow History'] || '');
return { port: 'success' };`,
    metadata_write: `metadata['Nom du champ'] = 'valeur';
return { port: 'success' };`,
    condition: `if (metadata['Statut'] === 'Approuve') {
  return { port: 'success' };
} else {
  return { port: 'error' };
}`,
    log: `console.log('[' + workflowName + ']', asset.title, metadata);`,
  },
  python: {
    history: `import datetime
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
line = f"{now} | {workflow_name} | Reussi"
metadata['Workflow History'] = line + '\n' + metadata.get('Workflow History', '')
return {"port": "success"}`,
    metadata_write: `metadata['Nom du champ'] = 'valeur'
return {"port": "success"}`,
    condition: `if metadata.get('Statut') == 'Approuve':
    return {"port": "success"}
else:
    return {"port": "error"}`,
    log: `print(f"[{workflow_name}]", asset['title'], metadata)`,
  }
};

function insererSnippet(key) {
  const lang = document.getElementById('script-lang-sel')?.value || 'javascript';
  const snippet = SNIPPETS[lang]?.[key];
  if (!snippet) return;
  const ta = document.getElementById('script-code-area');
  if (!ta) return;
  const s = ta.selectionStart;
  ta.value = ta.value.slice(0,s) + (s>0?'\n':'') + snippet + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = s + snippet.length + (s>0?1:0);
  ta.focus({ preventScroll: true });
}
function updateStatus(txt) {
  document.getElementById('wfd-status').textContent = txt;
}

function toast(msg, isError=false) {
  const t = document.getElementById('wfd-toast');
  t.textContent = msg;
  t.className = 'show'+(isError?' error':'');
  clearTimeout(t._t);
  t._t = setTimeout(()=>{ t.className=''; }, 2500);
}

// ══ LOOKUP — fonctions UI ═════════════════════════════════════════════════════

// ── Créer une ligne parente ───────────────────────────────────────────────────

// ── Lookup — Vue deux colonnes API ───────────────────────────────────────────


// ── Mode focus : panneau config large, canvas réduit ─────────────────────────
let _wfdFocusMode = false;

// ── Lookup — Onglets Métier / Technique ──────────────────────────────────────
function lkValueKeyChange(input) {
  /** Met à jour le badge { } quand le champ cible change */
  const badge = input.nextElementSibling;
  if (!badge || !badge.classList.contains('lk-nested-badge')) return;
  const val = input.value || '';
  const isNested = val.includes('.') || val.includes('[');
  badge.style.visibility = isNested ? 'visible' : 'hidden';
  badge.title = isNested ? 'Ce champ construit un objet imbriqué — transformation automatique appliquée' : '';
}

function lkTypeChange(sel) {
  const colors = { string:'#555', integer:'#e67e22', float:'#e67e22', boolean:'#9b59b6' };
  sel.style.color = colors[sel.value] || '#555';
}

function lkSaveSourceFolded(folded) {
  const flux = getFluxCourant();
  if (!flux || !selectedNodeId) return;
  const node = flux.nodes.find(n => n.id === selectedNodeId);
  if (!node) return;
  node.config = node.config || {};
  node.config.lkSourceFolded = folded;
  sauvegarderEtat();
}

function lkSwitchTab(pfx, tab) {
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node = flux?.nodes?.find(n => n.id === selectedNodeId);
  if (node) {
    node.config = node.config || {};
    node.config.lkActiveTab = tab;
  }
  // Trois onglets : metier (→ champs), credits, technique
  const tabs = ['metier', 'credits', 'technique'];
  tabs.forEach(t => {
    const btn   = document.getElementById(pfx + '-lk-tab-' + t);
    const panel = document.getElementById(pfx + '-lk-tab-' + t + '-panel');
    const active = t === tab;
    if (btn) {
      btn.classList.toggle('active', active);
    }
    if (panel) panel.style.display = active ? '' : 'none';
  });
  if (tab === 'metier' && typeof lkRenderApiPanel === 'function') {
    setTimeout(lkRenderApiPanel, 0);
  }
}

// ── Cycle du type sur le badge (Texte → Entier → Booléen → Liste → Texte) ──
function lkCycleType(btn) {
  const types  = ['string','integer','boolean','list','float'];
  const labels = { string:'Texte', integer:'Entier', boolean:'Booléen', list:'Liste', float:'Décimal' };
  const classes = { string:'lk-badge-str', integer:'lk-badge-int', boolean:'lk-badge-bool', list:'lk-badge-list', float:'lk-badge-flt' };
  const row    = btn.closest('.lkr');
  const sel    = row?.querySelector('.lk-type') || row?.querySelector('input.lk-type-hidden');
  const cur    = sel ? sel.value : (btn.dataset.type || 'string');
  const next   = types[(types.indexOf(cur) + 1) % types.length];
  // Mettre à jour le badge
  Object.values(classes).forEach(c => btn.classList.remove(c));
  btn.classList.add(classes[next]);
  btn.textContent = labels[next];
  btn.dataset.type = next;
  // Mettre à jour le select caché si présent
  if (sel) sel.value = next;
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

// ── Toggle affichage du fallback ──────────────────────────────────────────────
function lkToggleFb(btn) {
  const row = btn.closest('.lkr');
  const fbRow = row?.querySelector('.lkr-fb-row');
  if (!fbRow) return;
  const visible = fbRow.style.display !== 'none';
  fbRow.style.display = visible ? 'none' : 'flex';
  btn.classList.toggle('lkr-fb-active', !visible);
  if (!visible) {
    row.querySelector('.lkr-fb-input')?.focus();
  }
}

// ── Ajouter une ligne de crédit (persons[]) ───────────────────────────────────
function lkAddPersonRow(pfx) {
  const container = document.getElementById(pfx + '-lk-person-rows');
  if (!container) return;
  // Retirer le message "aucun crédit" si présent
  const empty = container.querySelector('[style*="font-style:italic"]');
  if (empty) empty.remove();

  const roles = ['director','narrator','author','actor','producer','presenter'];
  const idx   = container.querySelectorAll('.lkr-person').length;
  const div   = document.createElement('div');
  div.className = 'lkr lkr-person';
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="lkr-main" style="grid-template-columns:1fr 20px auto auto auto auto;">
      <input class="lkr-src cfg-input lk-key lk-person-key" placeholder="Champ Iconik"
        list="${pfx}-wfd-lk-src-list">
      <span class="lkr-arrow">→</span>
      <span class="lkr-person-target">persons[]</span>
      <select class="lkr-role-sel lk-person-role">
        ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <select class="lkr-format-sel lk-person-format" title="Format de l'identifiant"
        style="font-size:10px;padding:3px 5px;border-radius:4px;border:0.5px solid #333;background:#1a2a3a;color:#888;cursor:pointer;">
        <option value="slug" selected>slug</option>
        <option value="raw">brut</option>
      </select>
      <input class="cfg-input lk-value" type="hidden" value="persons[job=director].external_id">
      <button class="lkr-del" onclick="lkRemovePersonRow(this)" title="Supprimer">×</button>
    </div>`;
  // Sync hidden value quand le select change
  div.querySelector('.lk-person-role').addEventListener('change', function() {
    div.querySelector('.lk-value').value = 'persons[job=' + this.value + '].external_id';
    if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
  });
  container.appendChild(div);
  div.querySelector('.lkr-src')?.focus();
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function lkRemovePersonRow(btn) {
  const row = btn.closest('.lkr-person');
  if (!row) return;
  const container = row.parentElement;
  row.remove();
  // Si plus de lignes, afficher le message vide
  if (!container.querySelectorAll('.lkr-person').length) {
    container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--color-text-secondary); font-size:12px; font-style:italic;">
      Aucun crédit configuré — cliquer "Ajouter un crédit" pour commencer.</div>`;
  }
  if (typeof sauvegarderConfig === 'function') sauvegarderConfig();
}

function wfdToggleFocusMode() {
  _wfdFocusMode = !_wfdFocusMode;
  const panel  = document.getElementById('wfd-config-panel');
  const canvas = document.getElementById('wfd-canvas-wrap');
  const btn    = document.getElementById('cfg-focus-btn');
  if (_wfdFocusMode) {
    panel?.classList.add('panel-focus');
    canvas?.classList.add('panel-focus-mode');
    if (btn) { btn.textContent = '⤡'; btn.title = 'Quitter le mode focus'; btn.style.color = '#7ec8e3'; }
  } else {
    panel?.classList.remove('panel-focus');
    canvas?.classList.remove('panel-focus-mode');
    if (btn) { btn.textContent = '⤢'; btn.title = 'Mode focus (canvas réduit)'; btn.style.color = '#555'; }
  }
  // Le canvas HTML efface son contenu quand sa taille CSS change —
  // on attend que le CSS soit appliqué puis on re-rend
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof renderCanvas === 'function') renderCanvas();
    });
  });
}

function lkRenderApiPanel() {
  /** Remplit le div#cfg-lk-api-panel avec la vue deux colonnes si une spec API est disponible */
  const panel = document.getElementById('cfg-lk-api-panel');
  if (!panel) return;

  // Trouver la connexion du flux courant
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const conns = typeof wfdConnexions !== 'undefined' ? wfdConnexions : [];
  // Chercher une connexion sortante avec spec API
  const conn = conns.find(c => c.apiSpec && c.direction === 'outbound');
  if (!conn || !conn.apiSpec) { panel.innerHTML = ''; return; }

  const spec = conn.apiSpec;
  const cfg  = (function() {
    const flux2 = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
    return flux2?.nodes?.find(n => n.id === selectedNodeId)?.config || {};
  })();
  const currentTargets = new Set((cfg.lkRows||[]).map(r => r.value || r.tgt || ''));
  const selectedEndpoint = cfg.lkApiEndpoint || '';

  // Endpoints disponibles
  const endpoints = spec.endpoints.filter(e => ['POST','PUT','PATCH'].includes(e.method));
  const epOpts = endpoints.map(e =>
    `<option value="${e.path}|${e.method}" ${selectedEndpoint===(e.path+'|'+e.method)?'selected':''}>${e.method} ${escHtml(e.path)}</option>`
  ).join('');

  // Champs de l'endpoint sélectionné (ou du premier POST)
  const selEp = selectedEndpoint
    ? endpoints.find(e => (e.path+'|'+e.method) === selectedEndpoint)
    : endpoints.find(e => e.method === 'POST');
  const apiFields = (selEp?.fields || []).filter(f => !f.path.includes('.') && !f.path.includes('['));

  const _lkApiFolded = cfg.lkApiFolded !== false; // plié par défaut
  panel.innerHTML = `
    <div style="background:#050510;border:1px solid #1a1a2a;border-radius:5px;margin-bottom:8px;overflow:hidden;">
      <div onclick="var _b=this.nextElementSibling,_open=_b.style.display==='none';_b.style.display=_open?'block':'none';this.querySelector('.lk-api-chevron').textContent=_open?'▾':'▸';var _n=getFluxCourant()?.nodes?.find(n=>n.id===selectedNodeId);if(_n){_n.config.lkApiFolded=!_open;sauvegarderEtat();}"
        style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;background:#080818;user-select:none;">
        <span style="font-size:11px;color:#7ec8e3;font-weight:600;">
          <span class="lk-api-chevron">${_lkApiFolded ? '▸' : '▾'}</span>
          &nbsp;Référence API — ${escHtml(conn.name||'')}
        </span>
        <div style="display:flex;gap:6px;align-items:center;" onclick="event.stopPropagation()">
          <select style="font-size:11px;padding:2px 6px;background:#0a0a14;border:1px solid #2a2a3a;border-radius:3px;color:#aaa;"
            onchange="lkSelectEndpoint(this.value)">
            <option value="">— Choisir un endpoint —</option>
            ${epOpts}
          </select>
          <button class="cfg-btn" style="font-size:10px;padding:2px 8px;border-color:#2ecc71;color:#2ecc71;"
            onclick="lkSuggestMapping()">⚡ Suggérer</button>
          <button class="cfg-btn" style="font-size:10px;padding:2px 6px;"
            onclick="document.getElementById('cfg-lk-api-panel').innerHTML=''">✕</button>
        </div>
      </div>
      <div style="display:${_lkApiFolded ? 'none' : 'block'};padding:10px 12px;">
      ${apiFields.length ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div>
          <div style="font-size:10px;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Champs mappés</div>
          ${Array.from(currentTargets).filter(t => t).map(t => `
            <div style="padding:2px 0;font-size:11px;color:#7ec8e3;font-family:var(--font-mono);">${escHtml(t)}</div>
          `).join('')}
        </div>
        <div>
          <div style="font-size:10px;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Disponibles (cliquer pour ajouter)</div>
          ${apiFields.map(f => `
            <div style="padding:2px 0;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;"
              onclick="lkAddRowFromSpec('${escHtml(f.path)}', '${f.type}', ${!!f.required}, ${JSON.stringify(f.enum||[])})">
              <span style="color:${currentTargets.has(f.path)?'#2ecc71':'#888'};font-family:var(--font-mono);">${escHtml(f.path)}</span>
              <span style="font-size:9px;color:#555;">${f.type}</span>
              ${f.required ? '<span style="font-size:9px;background:#2b0a0a;border:1px solid #4a1a1a;border-radius:2px;padding:0 3px;color:#e74c3c;">req</span>' : ''}
              ${f.type==='array' ? '<span style="font-size:9px;background:#0d2b1a;border:1px solid #1a4a2a;border-radius:2px;padding:0 3px;color:#2ecc71;">[]</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>` : '<div style="font-size:11px;color:#555;">Sélectionnez un endpoint pour voir ses champs.</div>'}
      </div><!-- /pliable -->
    </div>`;
}

function lkSelectEndpoint(value) {
  /** Change l'endpoint de référence et rafraîchit le panneau */
  const flux = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node = flux?.nodes?.find(n => n.id === selectedNodeId);
  if (node) {
    node.config = node.config || {};
    node.config.lkApiEndpoint = value;
  }
  lkRenderApiPanel();
}

function lkAddRowFromSpec(path, type, required, enumValues) {
  /** Ajoute une ligne dans la Table depuis un clic sur la liste des champs API */
  const wrap = document.getElementById('cfg-lk-rows');
  if (!wrap) return;

  // Créer une nouvelle ligne avec le champ cible pré-rempli
  const div = document.createElement('div');
  div.className = 'lk-row';
  div.style.marginBottom = '4px';
  const isList   = type === 'array';
  const rowType  = ['integer','float','boolean'].includes(type) ? type : 'string';
  const typeColors = { string:'#555', integer:'#e67e22', float:'#e67e22', boolean:'#9b59b6' };
  div.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 100px 72px auto auto auto 28px;gap:4px;align-items:center;">' +
    '<input class="cfg-input lk-key" value="" placeholder="Valeur source" list="wfd-lk-field-source">' +
    '<input class="cfg-input lk-value" value="' + escHtml(path) + '" placeholder="Champ cible">' +
    '<input class="cfg-input lk-fallback" value="" placeholder="Fallback {var}" ' +
    'style="font-size:10px;font-family:var(--font-mono);color:#f39c12;background:#0d0a00;border-color:#2a2000;">' +
    '<select class="lk-type" title="Type de la valeur cible" ' +
    'style="font-size:10px;background:#0a0a0a;border:1px solid #222;border-radius:3px;color:' + (typeColors[rowType]||'#555') + ';padding:2px 3px;cursor:pointer;" ' +
    'onchange="lkTypeChange(this)">' +
    '<option value="string"  ' + (rowType==='string' ?'selected':'') + '>str</option>' +
    '<option value="integer" ' + (rowType==='integer'?'selected':'') + '>int</option>' +
    '<option value="float"   ' + (rowType==='float'  ?'selected':'') + '>flt</option>' +
    '<option value="boolean" ' + (rowType==='boolean'?'selected':'') + '>bool</option>' +
    '</select>' +
    '<label title="Ce champ est une liste (tableau)" style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:10px;color:#555;white-space:nowrap;">' +
    '<input type="checkbox" class="lk-is-list" ' + (isList ? 'checked' : '') + ' style="cursor:pointer;"> [ ]</label>' +
    '<button onclick="lkAddSubRow(this)" title="Ajouter une traduction"' +
    ' style="background:#0d1a2a;border:1px solid #1e3a5a;border-radius:3px;color:#7ec8e3;cursor:pointer;font-size:11px;padding:2px 6px;">+ Trad.</button>' +
    '<button onclick="lkToggleChildren(this)"' +
    ' style="background:#111;border:1px solid #222;border-radius:3px;color:#555;cursor:pointer;font-size:11px;padding:2px 6px;display:none;">▼</button>' +
    '<button onclick="lkRemoveRow(this)" style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:3px;color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>' +
    '</div>' +
    '<div class="lk-children" style="margin-left:20px;margin-top:2px;display:none;"></div>';

  wrap.appendChild(div);
  // Focus sur le champ source
  div.querySelector('.lk-key')?.focus();
  // Rafraîchir le panneau API
  setTimeout(lkRenderApiPanel, 100);
}

function lkSuggestMapping() {
  /** Suggère automatiquement des correspondances entre champs Iconik et champs API */
  const flux  = typeof getFluxCourant === 'function' ? getFluxCourant() : null;
  const node  = flux?.nodes?.find(n => n.id === selectedNodeId);
  const cfg   = node?.config || {};

  const conns = typeof wfdConnexions !== 'undefined' ? wfdConnexions : [];
  const conn  = conns.find(c => c.apiSpec && c.direction === 'outbound');
  if (!conn) { alert('Aucune connexion avec spec API trouvée.'); return; }

  const selectedEndpoint = cfg.lkApiEndpoint || '';
  const endpoints = conn.apiSpec.endpoints.filter(e => ['POST','PUT','PATCH'].includes(e.method));
  const selEp = selectedEndpoint
    ? endpoints.find(e => (e.path+'|'+e.method) === selectedEndpoint)
    : endpoints.find(e => e.method === 'POST');
  if (!selEp) { alert('Sélectionnez d\'abord un endpoint.'); return; }

  const apiFields = (selEp.fields || []).filter(f => !f.path.includes('.') && !f.path.includes('['));

  // Mapping sémantique approximatif (normalisé)
  const normalize = s => (s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'');

  const wrap = document.getElementById('cfg-lk-rows');
  if (!wrap) return;

  // Champs Iconik disponibles depuis la vue MD
  const iconikFields = (wfdData?.metadata||[]).map(m => m.nom||m.name||'').filter(Boolean);
  const currentTargets = new Set([...wrap.querySelectorAll('.lk-value')].map(i => i.value));

  let added = 0;
  apiFields.forEach(apiField => {
    if (currentTargets.has(apiField.path)) return; // déjà mappé

    // Chercher un champ Iconik avec un nom similaire
    const apiNorm = normalize(apiField.path);
    const match = iconikFields.find(f => normalize(f) === apiNorm || normalize(f).includes(apiNorm) || apiNorm.includes(normalize(f)));
    if (!match) return;

    lkAddRowFromSpec(apiField.path, apiField.type, apiField.required, apiField.enum || []);
    // Remplir le champ source avec le match Iconik
    const rows = wrap.querySelectorAll('.lk-row');
    const lastRow = rows[rows.length - 1];
    if (lastRow) lastRow.querySelector('.lk-key').value = match;
    added++;
  });

  if (added) {
    toast(added + ' ligne(s) suggérée(s) — vérifiez et complétez les valeurs');
    lkRenderApiPanel();
  } else {
    toast('Aucune correspondance automatique trouvée — ajoutez manuellement', 'warn');
  }
}

function lkGetMdField(fieldName) {
  /** Retourne le champ MD Iconik correspondant au nom donné */
  const md = (typeof wfdData !== 'undefined' ? wfdData.metadata : []) || [];
  return md.find(f => f.name === fieldName || f.label === fieldName) || null;
}

function lkBuildValueWidget(keyVal, currentValue) {
  /** Construit le widget de valeur adapté au type du champ MD
   *  - Champ contraint (boolean/dropdown) : select + bouton ✏️ pour basculer en input libre
   *  - Champ libre ou valeur variable : input libre + bouton ↩ pour revenir au select
   */
  const field   = lkGetMdField(keyVal);
  const isVar   = currentValue && (currentValue.startsWith('{') || currentValue.startsWith('['));
  const type    = field?.field_type;
  const opts    = field?.options || [];
  const isConstrained = field && (type === 'boolean' || (type === 'drop_down' && opts.length));

  if (!isConstrained || isVar) {
    // Input libre (champ inconnu, type libre, ou valeur variable)
    // Trouver le datalist de variables disponible
    const listId = document.querySelector('[id$="-wfd-var-list"]')?.id || 'cfg-wfd-var-list';
    const resetBtn = isConstrained && isVar
      ? '<button type="button" onclick="lkToggleVarMode(this,false)" title="Revenir aux valeurs de la liste" ' +
        'style="background:#0d1a0d;border:1px solid #2d5a2d;border-radius:3px;color:#5dbb6b;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">↩</button>'
      : '';
    return '<div style="display:flex;gap:4px;align-items:center;width:100%;">' +
      '<input class="cfg-input lk-value" placeholder="Valeur ou {variable}" value="' + escHtml(currentValue||'') + '" style="flex:1;" list="' + listId + '">' +
      resetBtn +
      '</div>';
  }

  // Widget contraint
  let selectHtml = '';
  if (type === 'boolean') {
    const sel = (v) => currentValue === v ? 'selected' : '';
    selectHtml = '<select class="cfg-input lk-value" style="font-size:11px;flex:1;">' +
      '<option value="">— choisir —</option>' +
      '<option value="true" '  + sel('true')  + '>Vrai (true)</option>' +
      '<option value="false" ' + sel('false') + '>Faux (false)</option>' +
      '</select>';
  } else {
    const optsHtml = opts.map(o =>
      '<option value="' + escHtml(o.value) + '" ' + (currentValue===o.value?'selected':'') + '>' + escHtml(o.label) + '</option>'
    ).join('');
    selectHtml = '<select class="cfg-input lk-value" style="font-size:11px;flex:1;">' +
      '<option value="">— choisir —</option>' + optsHtml + '</select>';
  }

  const editBtn = '<button type="button" onclick="lkToggleVarMode(this,true)" title="Saisir une variable dynamique {...}" ' +
    'style="background:#0d0d1a;border:1px solid #1a1a3a;border-radius:3px;color:#7ec8e3;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">✏️</button>';

  return '<div style="display:flex;gap:4px;align-items:center;width:100%;">' +
    selectHtml + editBtn + '</div>';
}

function lkToggleVarMode(btn, toVar) {
  /** Bascule entre select contraint et input libre {variable} */
  const wrap = btn.closest('.lk-value-wrap, .um-val-wrap');
  if (!wrap) return;
  const container = btn.closest('div');
  const keyEl = wrap.closest('.lk-row, div[style*="grid"]')?.querySelector('.lk-key, .um-field-key');
  const keyVal = keyEl?.value || '';
  const currentSel = container.querySelector('select.lk-value');
  const currentInp = container.querySelector('input.lk-value');
  const currentVal = currentSel?.value || currentInp?.value || '';

  if (toVar) {
    // Basculer vers input libre avec suggestions de variables
    const cls = currentSel ? currentSel.className : 'cfg-input lk-value';
    // Trouver le datalist de variables le plus proche
    const pfx = wrap.id?.replace(/-um-fields$/, '') || 'cfg';
    const listId = document.getElementById(pfx + '-wfd-var-list') ? pfx + '-wfd-var-list'
      : (document.querySelector('[id$="-wfd-var-list"]')?.id || '');
    container.innerHTML =
      '<input class="' + cls + '" placeholder="{variable}" value="" style="flex:1;"' +
      (listId ? ' list="' + listId + '"' : '') + '>' +
      '<button type="button" onclick="lkToggleVarMode(this,false)" title="Revenir aux valeurs de la liste" ' +
      'style="background:#0d1a0d;border:1px solid #2d5a2d;border-radius:3px;color:#5dbb6b;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">↩</button>';
    container.querySelector('input')?.focus();
  } else {
    // Revenir au select
    const newHtml = lkBuildValueWidget(keyVal, '');
    container.outerHTML = '<div style="display:flex;gap:4px;align-items:center;width:100%;">' + newHtml + '</div>';
    // Remplacer proprement
    container.innerHTML = lkBuildValueWidget(keyVal, '').replace(/<div[^>]*>|<\/div>/g, '');
  }
}

function lkUpdateValueWidget(keyInput) {
  /** Met à jour le widget de valeur quand le champ source change */
  const wrap = keyInput.closest('.lk-row')?.querySelector('.lk-value-wrap');
  if (!wrap) return;
  const currentVal = lkGetRowValue(wrap);
  wrap.innerHTML = lkBuildValueWidget(keyInput.value, currentVal);
}

function lkGetRowValue(wrapOrRow) {
  /** Extrait la valeur effective d'une ligne (gère select + input variable) */
  if (!wrapOrRow) return '';
  const sel = wrapOrRow.querySelector('select.lk-value');
  const inp = wrapOrRow.querySelector('input.lk-value');
  if (sel) return sel.value || '';
  return inp?.value || '';
}

function lkAddRow(wrapId) {
  const wrap = wrapId
    ? document.getElementById(wrapId)
    : document.getElementById('mn-lk-rows') || document.getElementById('cfg-lk-rows');
  if (!wrap) return;
  const div = _lkBuildParentRow();
  wrap.appendChild(div);
  div.querySelector('.lk-key').focus({ preventScroll: true });
}

function _lkBuildParentRow(key, value, children, isList, fallback, rowType) {
  const div = document.createElement('div');
  div.className = 'lk-row';
  div.style.cssText = 'margin-bottom:4px;';
  const _listId = document.querySelector('[id$="-wfd-var-list"]')?.id || 'cfg-wfd-var-list';
  const _type = rowType || 'string';
  const _typeColors = { string:'#555', integer:'#e67e22', float:'#e67e22', boolean:'#9b59b6' };
  div.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 100px 72px auto auto auto 28px;gap:4px;align-items:center;">' +
    '<input class="cfg-input lk-key"   placeholder="Valeur source"  value="' + escHtml(key   ||'') + '" list="wfd-lk-field-source" onchange="lkUpdateValueWidget(this)">' +
    '<span class="lk-value-wrap" style="position:relative;">' + lkBuildValueWidget(key||'', value||'') + '</span>' +
    '<input class="cfg-input lk-fallback" placeholder="Fallback {var}" value="' + escHtml(fallback||'') + '" list="' + _listId + '" ' +
    'title="Si la valeur source est vide, utiliser cette variable" ' +
    'style="font-size:10px;font-family:var(--font-mono);color:#f39c12;background:#0d0a00;border-color:#2a2000;">' +
    '<select class="lk-type" title="Type de la valeur cible" onchange="lkTypeChange(this)" ' +
    'style="font-size:10px;background:#0a0a0a;border:1px solid #222;border-radius:3px;color:' + (_typeColors[_type]||'#555') + ';padding:2px 3px;cursor:pointer;">' +
    '<option value="string"  ' + (_type==='string' ?'selected':'') + '>str</option>' +
    '<option value="integer" ' + (_type==='integer'?'selected':'') + '>int</option>' +
    '<option value="float"   ' + (_type==='float'  ?'selected':'') + '>flt</option>' +
    '<option value="boolean" ' + (_type==='boolean'?'selected':'') + '>bool</option>' +
    '</select>' +
    '<label title="Ce champ est une liste (tableau)" style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:10px;color:#555;white-space:nowrap;">' +
    '<input type="checkbox" class="lk-is-list" ' + (isList ? 'checked' : '') + ' style="cursor:pointer;"> [ ]</label>' +
    '<button onclick="lkAddSubRow(this)" title="Ajouter une sous-ligne de traduction"' +
    ' style="background:#0d1a2a;border:1px solid #1e3a5a;border-radius:3px;color:#7ec8e3;' +
    'cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;">+ Trad.</button>' +
    '<button onclick="lkToggleChildren(this)" title="Afficher/Masquer les traductions"' +
    ' style="background:#111;border:1px solid #222;border-radius:3px;color:#555;' +
    'cursor:pointer;font-size:11px;padding:2px 6px;display:none;">▼</button>' +
    '<button onclick="lkRemoveRow(this)"' +
    ' style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:3px;' +
    'color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>' +
    '</div>' +
    '<div class="lk-children" style="margin-left:20px;margin-top:2px;display:none;"></div>';

  // Peupler les enfants existants
  if (children && children.length) {
    const childWrap = div.querySelector('.lk-children');
    childWrap.style.display = 'block';
    const toggleBtn = div.querySelector('[onclick="lkToggleChildren(this)"]');
    toggleBtn.style.display = 'inline-block';
    toggleBtn.style.color = '#7ec8e3';
    children.forEach(function(c) {
      childWrap.appendChild(_lkBuildChildRow(c.key || c.src || '', c.value || c.tgt || ''));
    });
  }
  return div;
}

function _lkBuildChildRow(key, value) {
  const div = document.createElement('div');
  div.className = 'lk-child-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:2px;';
  div.innerHTML =
    '<input class="cfg-input lk-key" placeholder="Si valeur..." value="' + escHtml(key  ||'') + '"' +
    ' style="font-size:11px;background:#0a0a0f;border-color:#1a1a2a;">' +
    '<input class="cfg-input lk-value" placeholder="...traduire en" value="' + escHtml(value||'') + '"' +
    ' style="font-size:11px;background:#0a0a0f;border-color:#1a1a2a;">' +
    '<button onclick="lkRemoveRow(this)"' +
    ' style="background:#1a0a0a;border:1px solid #2a1a1a;border-radius:3px;' +
    'color:#c0392b;cursor:pointer;font-size:12px;line-height:1;">×</button>';
  return div;
}

function lkAddSubRow(btn) {
  const parentRow  = btn.closest('.lk-row');
  const childWrap  = parentRow.querySelector('.lk-children');
  const toggleBtn  = parentRow.querySelector('[onclick="lkToggleChildren(this)"]');
  childWrap.style.display = 'block';
  toggleBtn.style.display = 'inline-block';
  toggleBtn.style.color = '#7ec8e3';
  const child = _lkBuildChildRow('', '');
  childWrap.appendChild(child);
  child.querySelector('.lk-key').focus({ preventScroll: true });
}

function lkToggleChildren(btn) {
  const childWrap = btn.closest('.lk-row').querySelector('.lk-children');
  const visible   = childWrap.style.display !== 'none';
  childWrap.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? '▶' : '▼';
}

function lkRemoveRow(btn) {
  btn.closest('.lk-row, .lk-child-row')?.remove();
}

// ── Charger un template de mapping dans la Table de correspondance ──────────────
function lkChargerTemplate() {
  if (!wfdMappings.length) {
    alert("Aucun template de mapping disponible.\nCréez-en un dans Ressources \u2192 Mappings.");
    return;
  }
  const existing = document.getElementById('lk-template-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.id = 'lk-template-picker';
  picker.style.cssText = 'position:fixed;z-index:9999;background:#111;border:1px solid #333;border-radius:6px;padding:8px;min-width:220px;box-shadow:0 4px 20px #000;';

  const btn = document.querySelector('[onclick="lkChargerTemplate()"]');
  if (btn) {
    const r = btn.getBoundingClientRect();
    picker.style.top  = (r.bottom + 4) + 'px';
    picker.style.left = r.left + 'px';
  }

  let html = '<div style="font-size:10px;color:#555;margin-bottom:6px;">CHOISIR UN TEMPLATE</div>';
  wfdMappings.forEach(function(m) {
    html += '<div data-mapid="' + escHtml(m.id) + '" class="lk-tpl-item" style="padding:6px 8px;cursor:pointer;border-radius:4px;color:#ccc;font-size:11px;">' +
            escHtml(m.name) + '<span style="color:#555;font-size:9px;margin-left:6px;">' + (m.rows||[]).length + ' r\u00E8gle(s)</span></div>';
  });
  html += '<div style="border-top:1px solid #222;margin-top:4px;padding-top:4px;">' +
          '<div id="lk-tpl-cancel" style="padding:4px 8px;cursor:pointer;color:#555;font-size:10px;">Annuler</div></div>';
  picker.innerHTML = html;

  picker.querySelectorAll('.lk-tpl-item').forEach(function(el) {
    el.addEventListener('mouseenter', function() { el.style.background = '#1a1a1a'; });
    el.addEventListener('mouseleave', function() { el.style.background = ''; });
    el.addEventListener('click', function() { lkAppliquerTemplate(el.dataset.mapid); });
  });
  picker.querySelector('#lk-tpl-cancel').addEventListener('click', function() { picker.remove(); });

  document.body.appendChild(picker);
  setTimeout(function() {
    document.addEventListener('click', function _close(e) {
      if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', _close); }
    });
  }, 100);
}

function lkAppliquerTemplate(mappingId) {
  document.getElementById('lk-template-picker')?.remove();
  const m = wfdMappings.find(function(x) { return x.id === mappingId; });
  if (!m) return;

  const wrap = document.getElementById('cfg-lk-rows');
  if (!wrap) return;

  wrap.innerHTML = '';
  (m.rows || []).forEach(function(row) {
    // Support ancien format {src,tgt} et nouveau format {key,value,children,list}
    const key      = row.key || row.src   || '';
    const value    = row.value || row.tgt || '';
    const children = row.children         || [];
    const isList   = row.list === true || row.list === 'true';
    const fallback = row.fallback || '';
    const rowType  = row.type || 'string';
    wrap.appendChild(_lkBuildParentRow(key, value, children, isList, fallback, rowType));
  });
  if (typeof wfdToast === 'function') wfdToast('Template "' + m.name + '" charg\u00E9 \u2713');
}


// ── Sauvegarder les lignes courantes comme template ───────────────────────────
function lkSauvegarderTemplate() {
  const wrap = document.getElementById('cfg-lk-rows');
  if (!wrap) return;

  const rows = [...wrap.querySelectorAll(':scope > .lk-row')].map(function(row) {
    const key      = row.querySelector(':scope > div > .lk-key')  ?.value || '';
    const value    = row.querySelector(':scope > div > .lk-value')?.value || '';
    const children = [...row.querySelectorAll('.lk-child-row')].map(function(child) {
      return {
        key  : child.querySelector('.lk-key')  ?.value || '',
        value: child.querySelector('.lk-value')?.value || '',
      };
    }).filter(function(c) { return c.key || c.value; });
    const isList = row.querySelector('.lk-is-list')?.checked || false;
    const rowObj = children.length ? { key, value, children } : { key, value };
    if (isList) rowObj.list = true;
    return rowObj;
  }).filter(function(r) { return r.key || r.value; });

  if (!rows.length) { alert("La table est vide."); return; }

  const existing = document.getElementById('lk-save-tpl-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'lk-save-tpl-modal';
  modal.style.cssText = 'position:fixed;z-index:9999;background:#111;border:1px solid #333;border-radius:6px;padding:12px;min-width:260px;box-shadow:0 4px 20px #000;';

  const btn = document.querySelector('[onclick="lkSauvegarderTemplate()"]');
  if (btn) {
    const r   = btn.getBoundingClientRect();
    const mw  = 280; // min-width du modal
    const left = Math.min(r.left, window.innerWidth - mw - 8);
    modal.style.top  = (r.bottom + 4) + 'px';
    modal.style.left = Math.max(8, left) + 'px';
  }

  modal.innerHTML =
    '<div style="font-size:10px;color:#555;margin-bottom:6px;">NOM DU TEMPLATE</div>' +
    '<input id="lk-save-tpl-name" class="cfg-input" style="width:100%;margin-bottom:8px;" placeholder="ex: Iconik vers VodFactory" value="Mon mapping">' +
    '<div style="display:flex;gap:6px;">' +
    '<button id="lk-save-tpl-ok" class="cfg-btn primary" style="flex:1;">\u2713 Sauvegarder</button>' +
    '<button id="lk-save-tpl-cancel" class="cfg-btn" style="flex:1;">Annuler</button>' +
    '</div>';

  document.body.appendChild(modal);

  const input = modal.querySelector('#lk-save-tpl-name');
  input.focus(); input.select();

  modal.querySelector('#lk-save-tpl-cancel').addEventListener('click', function() { modal.remove(); });
  modal.querySelector('#lk-save-tpl-ok').addEventListener('click', function() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    modal.remove();
    const ex = wfdMappings.find(function(m) { return m.name === name; });
    if (ex) { ex.rows = rows; }
    else { wfdMappings.push({ id: 'map-' + Date.now(), name: name, rows: rows }); }
    sauvegarderEtat();
    if (typeof wfdToast === 'function') wfdToast('Template "'+ name +'" sauvegard\u00E9 \u2713');
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') modal.querySelector('#lk-save-tpl-ok').click();
    if (e.key === 'Escape') modal.remove();
  });
}

// ── Auto-populer les lignes depuis un résultat Fetch ─────────────────────────
// Lit le dernier snapshot de run, trouve le résultat dont le nom correspond
// à la variable saisie, et génère une ligne par champ MD.
async function lkAutoPopulate(pfx) {
  const inputEl = document.getElementById((pfx||'cfg') + '-lk-input-var');
  const wrap    = document.getElementById((pfx||'cfg') + '-lk-rows');
  if (!inputEl || !wrap) return;

  // Extraire le nom de la variable (retirer les accolades si présentes)
  const varName = (inputEl.value || '').trim().replace(/^\{|\}$/g, '');
  if (!varName) { alert("Saisissez d'abord le nom du résultat Fetch."); return; }

  // Chercher dans le dernier snapshot de run
  let fields = [];
  try {
    const engine = window.WfdEngineInstance || window.wfdEngine;
    const flux   = getFluxCourant?.();
    if (engine && flux?.id) {
      const runs = await engine.getRunsByFlux(flux.id, 1);
      const lastRun = runs?.[0];
      if (lastRun?.nodes) {
        for (const node of lastRun.nodes) {
          if (node.nodeFamily !== 'fetch' || !node.snapshot) continue;
          const results = node.snapshot.results || {};
          // Chercher le résultat correspondant (avec ou sans _metadata)
          const mdData = results[varName + '_metadata'] || results[varName];
          if (mdData?.metadata_values) {
            fields = Object.keys(mdData.metadata_values)
              .filter(k => k !== '__separator__')
              .sort();
            break;
          }
          // Chercher dans les vars aplaties (après aplatissement automatique)
          if (results[varName]) {
            const vars = node.snapshot.vars || {};
            fields = Object.keys(vars)
              .filter(k => !['asset_id','_iconik_token','_iconik_app_id','metadata_view_id'].includes(k))
              .sort();
            break;
          }
        }
      }
    }
  } catch(e) {
    console.warn('[lkAutoPopulate]', e.message);
  }

  if (!fields.length) {
    alert("Aucun champ trouve pour ce resultat. Assurez-vous qu'un run a deja ete execute avec ce Fetch.");
  }

  // Vider les lignes existantes et générer les nouvelles
  wrap.innerHTML = '';
  fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'lk-row';
    div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:4px;';
    div.innerHTML =
      '<input class="cfg-input lk-key"   value="' + escHtml(field) + '" placeholder="Valeur source">' +
      '<input class="cfg-input lk-value" placeholder="Valeur cible">' +
      '<button onclick="lkRemoveRow(this)" style="background:#1a0a0a;border:1px solid #3a1a1a;' +
      'border-radius:3px;color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>';
    wrap.appendChild(div);
  });

  // Focus sur la première valeur cible
  wrap.querySelector('.lk-value')?.focus({ preventScroll: true });
}

function lkExport() {
  const wrap = document.getElementById('mn-lk-rows') || document.getElementById('cfg-lk-rows');
  if (!wrap) return;
  const rows = [...wrap.querySelectorAll('.lk-row')].map(row => ({
    key  : row.querySelector('.lk-key')?.value   || '',
    value: row.querySelector('.lk-value')?.value || '',
  })).filter(r => r.key || r.value);
  const json = JSON.stringify(rows, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lookup-' + Date.now() + '.json';
  a.click();
}

function lkImport() {
  const inp = document.getElementById('mn-lk-import-file') || document.getElementById('cfg-lk-import-file');
  if (inp) inp.click();
}

function lkImportFile(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let rows = [];
      if (file.name.endsWith('.csv')) {
        // Parser CSV simple : key,value par ligne
        rows = e.target.result.split('\n')
          .map(line => line.split(',').map(s => s.trim().replace(/^"|"$/g,'')))
          .filter(p => p.length >= 2 && (p[0] || p[1]))
          .map(p => ({ key: p[0], value: p[1] }));
      } else {
        // JSON : tableau [{key,value}] ou objet {key:value}
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          rows = data.map(r => typeof r === 'object'
            ? { key: r.key||r.from||r.input||'', value: r.value||r.to||r.output||'' }
            : {});
        } else {
          rows = Object.entries(data).map(([k,v]) => ({ key: k, value: String(v) }));
        }
      }
      // Injecter dans le DOM
      const wrap = document.getElementById('mn-lk-rows') || document.getElementById('cfg-lk-rows');
      if (!wrap) return;
      wrap.innerHTML = '';
      rows.forEach(r => {
        const div = document.createElement('div');
        div.className = 'lk-row';
        div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:4px;';
        div.innerHTML = `
          <input class="cfg-input lk-key"   value="${escHtml(r.key||'')}"   placeholder="ex: PAD | Bayard Audio">
          <input class="cfg-input lk-value" value="${escHtml(r.value||'')}" placeholder="ex: Bayard Audio/En attente PAD">
          <button onclick="lkRemoveRow(this)"
            style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:3px;
                   color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>`;
        wrap.appendChild(div);
      });
      toast('✓ ' + rows.length + ' lignes importées');
    } catch(err) {
      toast('Erreur import : ' + err.message);
    }
    fileInput.value = '';
  };
  reader.readAsText(file);
}


// ══ LOOKUP — fonctions UI ═════════════════════════════════════════════════════

// ── Créer une ligne parente ───────────────────────────────────────────────────
function lkGetMdField(fieldName) {
  /** Retourne le champ MD Iconik correspondant au nom donné */
  const md = (typeof wfdData !== 'undefined' ? wfdData.metadata : []) || [];
  return md.find(f => f.name === fieldName || f.label === fieldName) || null;
}

function lkBuildValueWidget(keyVal, currentValue) {
  /** Construit le widget de valeur adapté au type du champ MD
   *  - Champ contraint (boolean/dropdown) : select + bouton ✏️ pour basculer en input libre
   *  - Champ libre ou valeur variable : input libre + bouton ↩ pour revenir au select
   */
  const field   = lkGetMdField(keyVal);
  const isVar   = currentValue && (currentValue.startsWith('{') || currentValue.startsWith('['));
  const type    = field?.field_type;
  const opts    = field?.options || [];
  const isConstrained = field && (type === 'boolean' || (type === 'drop_down' && opts.length));

  if (!isConstrained || isVar) {
    // Input libre (champ inconnu, type libre, ou valeur variable)
    // Trouver le datalist de variables disponible
    const listId = document.querySelector('[id$="-wfd-var-list"]')?.id || 'cfg-wfd-var-list';
    const resetBtn = isConstrained && isVar
      ? '<button type="button" onclick="lkToggleVarMode(this,false)" title="Revenir aux valeurs de la liste" ' +
        'style="background:#0d1a0d;border:1px solid #2d5a2d;border-radius:3px;color:#5dbb6b;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">↩</button>'
      : '';
    return '<div style="display:flex;gap:4px;align-items:center;width:100%;">' +
      '<input class="cfg-input lk-value" placeholder="Valeur ou {variable}" value="' + escHtml(currentValue||'') + '" style="flex:1;" list="' + listId + '">' +
      resetBtn +
      '</div>';
  }

  // Widget contraint
  let selectHtml = '';
  if (type === 'boolean') {
    const sel = (v) => currentValue === v ? 'selected' : '';
    selectHtml = '<select class="cfg-input lk-value" style="font-size:11px;flex:1;">' +
      '<option value="">— choisir —</option>' +
      '<option value="true" '  + sel('true')  + '>Vrai (true)</option>' +
      '<option value="false" ' + sel('false') + '>Faux (false)</option>' +
      '</select>';
  } else {
    const optsHtml = opts.map(o =>
      '<option value="' + escHtml(o.value) + '" ' + (currentValue===o.value?'selected':'') + '>' + escHtml(o.label) + '</option>'
    ).join('');
    selectHtml = '<select class="cfg-input lk-value" style="font-size:11px;flex:1;">' +
      '<option value="">— choisir —</option>' + optsHtml + '</select>';
  }

  const editBtn = '<button type="button" onclick="lkToggleVarMode(this,true)" title="Saisir une variable dynamique {...}" ' +
    'style="background:#0d0d1a;border:1px solid #1a1a3a;border-radius:3px;color:#7ec8e3;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">✏️</button>';

  return '<div style="display:flex;gap:4px;align-items:center;width:100%;">' +
    selectHtml + editBtn + '</div>';
}

function lkToggleVarMode(btn, toVar) {
  /** Bascule entre select contraint et input libre {variable} */
  const wrap = btn.closest('.lk-value-wrap, .um-val-wrap');
  if (!wrap) return;
  const container = btn.closest('div');
  const keyEl = wrap.closest('.lk-row, div[style*="grid"]')?.querySelector('.lk-key, .um-field-key');
  const keyVal = keyEl?.value || '';
  const currentSel = container.querySelector('select.lk-value');
  const currentInp = container.querySelector('input.lk-value');
  const currentVal = currentSel?.value || currentInp?.value || '';

  if (toVar) {
    // Basculer vers input libre avec suggestions de variables
    const cls = currentSel ? currentSel.className : 'cfg-input lk-value';
    // Trouver le datalist de variables le plus proche
    const pfx = wrap.id?.replace(/-um-fields$/, '') || 'cfg';
    const listId = document.getElementById(pfx + '-wfd-var-list') ? pfx + '-wfd-var-list'
      : (document.querySelector('[id$="-wfd-var-list"]')?.id || '');
    container.innerHTML =
      '<input class="' + cls + '" placeholder="{variable}" value="" style="flex:1;"' +
      (listId ? ' list="' + listId + '"' : '') + '>' +
      '<button type="button" onclick="lkToggleVarMode(this,false)" title="Revenir aux valeurs de la liste" ' +
      'style="background:#0d1a0d;border:1px solid #2d5a2d;border-radius:3px;color:#5dbb6b;cursor:pointer;font-size:11px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">↩</button>';
    container.querySelector('input')?.focus();
  } else {
    // Revenir au select
    const newHtml = lkBuildValueWidget(keyVal, '');
    container.outerHTML = '<div style="display:flex;gap:4px;align-items:center;width:100%;">' + newHtml + '</div>';
    // Remplacer proprement
    container.innerHTML = lkBuildValueWidget(keyVal, '').replace(/<div[^>]*>|<\/div>/g, '');
  }
}

function lkUpdateValueWidget(keyInput) {
  /** Met à jour le widget de valeur quand le champ source change */
  const wrap = keyInput.closest('.lk-row')?.querySelector('.lk-value-wrap');
  if (!wrap) return;
  const currentVal = lkGetRowValue(wrap);
  wrap.innerHTML = lkBuildValueWidget(keyInput.value, currentVal);
}

function lkGetRowValue(wrapOrRow) {
  /** Extrait la valeur effective d'une ligne (gère select + input variable) */
  if (!wrapOrRow) return '';
  const sel = wrapOrRow.querySelector('select.lk-value');
  const inp = wrapOrRow.querySelector('input.lk-value');
  if (sel) return sel.value || '';
  return inp?.value || '';
}


function _lkBuildChildRow(key, value) {
  const div = document.createElement('div');
  div.className = 'lk-child-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:2px;';
  div.innerHTML =
    '<input class="cfg-input lk-key" placeholder="Si valeur..." value="' + escHtml(key  ||'') + '"' +
    ' style="font-size:11px;background:#0a0a0f;border-color:#1a1a2a;">' +
    '<input class="cfg-input lk-value" placeholder="...traduire en" value="' + escHtml(value||'') + '"' +
    ' style="font-size:11px;background:#0a0a0f;border-color:#1a1a2a;">' +
    '<button onclick="lkRemoveRow(this)"' +
    ' style="background:#1a0a0a;border:1px solid #2a1a1a;border-radius:3px;' +
    'color:#c0392b;cursor:pointer;font-size:12px;line-height:1;">×</button>';
  return div;
}

function lkAddSubRow(btn) {
  const parentRow  = btn.closest('.lk-row');
  const childWrap  = parentRow.querySelector('.lk-children');
  const toggleBtn  = parentRow.querySelector('[onclick="lkToggleChildren(this)"]');
  childWrap.style.display = 'block';
  toggleBtn.style.display = 'inline-block';
  toggleBtn.style.color = '#7ec8e3';
  const child = _lkBuildChildRow('', '');
  childWrap.appendChild(child);
  child.querySelector('.lk-key').focus({ preventScroll: true });
}

function lkToggleChildren(btn) {
  const childWrap = btn.closest('.lk-row').querySelector('.lk-children');
  const visible   = childWrap.style.display !== 'none';
  childWrap.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? '▶' : '▼';
}

function lkRemoveRow(btn) {
  btn.closest('.lk-row, .lk-child-row')?.remove();
}

// ── Auto-populer les lignes depuis un résultat Fetch ─────────────────────────
// Lit le dernier snapshot de run, trouve le résultat dont le nom correspond
// à la variable saisie, et génère une ligne par champ MD.
async function lkAutoPopulate(pfx) {
  const inputEl = document.getElementById((pfx||'cfg') + '-lk-input-var');
  const wrap    = document.getElementById((pfx||'cfg') + '-lk-rows');
  if (!inputEl || !wrap) return;

  // Extraire le nom de la variable (retirer les accolades si présentes)
  const varName = (inputEl.value || '').trim().replace(/^\{|\}$/g, '');
  if (!varName) { alert("Saisissez d'abord le nom du resultat Fetch."); return; }

  // Chercher dans le dernier snapshot de run
  let fields = [];
  try {
    const engine = window.WfdEngineInstance || window.wfdEngine;
    const flux   = getFluxCourant?.();
    if (engine && flux?.id) {
      const runs = await engine.getRunsByFlux(flux.id, 1);
      const lastRun = runs?.[0];
      if (lastRun?.nodes) {
        for (const node of lastRun.nodes) {
          if (node.nodeFamily !== 'fetch' || !node.snapshot) continue;
          const results = node.snapshot.results || {};
          // Chercher le résultat correspondant (avec ou sans _metadata)
          const mdData = results[varName + '_metadata'] || results[varName];
          if (mdData?.metadata_values) {
            fields = Object.keys(mdData.metadata_values)
              .filter(k => k !== '__separator__')
              .sort();
            break;
          }
          // Chercher dans les vars aplaties (après aplatissement automatique)
          if (results[varName]) {
            const vars = node.snapshot.vars || {};
            fields = Object.keys(vars)
              .filter(k => !['asset_id','_iconik_token','_iconik_app_id','metadata_view_id'].includes(k))
              .sort();
            break;
          }
        }
      }
    }
  } catch(e) {
    console.warn('[lkAutoPopulate]', e.message);
  }

  if (!fields.length) {
    alert("Aucun champ trouve pour ce resultat. Assurez-vous qu'un run a deja ete execute avec ce Fetch.");
    return;
  }

  // Vider les lignes existantes et générer les nouvelles
  wrap.innerHTML = '';
  fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'lk-row';
    div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:4px;';
    div.innerHTML =
      '<input class="cfg-input lk-key"   value="' + escHtml(field) + '" placeholder="Valeur source">' +
      '<input class="cfg-input lk-value" placeholder="Valeur cible">' +
      '<button onclick="lkRemoveRow(this)" style="background:#1a0a0a;border:1px solid #3a1a1a;' +
      'border-radius:3px;color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>';
    wrap.appendChild(div);
  });

  // Focus sur la première valeur cible
  wrap.querySelector('.lk-value')?.focus({ preventScroll: true });
}

function lkExport() {
  const wrap = document.getElementById('mn-lk-rows') || document.getElementById('cfg-lk-rows');
  if (!wrap) return;
  const rows = [...wrap.querySelectorAll('.lk-row')].map(row => ({
    key  : row.querySelector('.lk-key')?.value   || '',
    value: row.querySelector('.lk-value')?.value || '',
  })).filter(r => r.key || r.value);
  const json = JSON.stringify(rows, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lookup-' + Date.now() + '.json';
  a.click();
}

function lkImport() {
  const inp = document.getElementById('mn-lk-import-file') || document.getElementById('cfg-lk-import-file');
  if (inp) inp.click();
}

function lkImportFile(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let rows = [];
      if (file.name.endsWith('.csv')) {
        // Parser CSV simple : key,value par ligne
        rows = e.target.result.split('\n')
          .map(line => line.split(',').map(s => s.trim().replace(/^"|"$/g,'')))
          .filter(p => p.length >= 2 && (p[0] || p[1]))
          .map(p => ({ key: p[0], value: p[1] }));
      } else {
        // JSON : tableau [{key,value}] ou objet {key:value}
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          rows = data.map(r => typeof r === 'object'
            ? { key: r.key||r.from||r.input||'', value: r.value||r.to||r.output||'' }
            : {});
        } else {
          rows = Object.entries(data).map(([k,v]) => ({ key: k, value: String(v) }));
        }
      }
      // Injecter dans le DOM
      const wrap = document.getElementById('mn-lk-rows') || document.getElementById('cfg-lk-rows');
      if (!wrap) return;
      wrap.innerHTML = '';
      rows.forEach(r => {
        const div = document.createElement('div');
        div.className = 'lk-row';
        div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;margin-bottom:4px;';
        div.innerHTML = `
          <input class="cfg-input lk-key"   value="${escHtml(r.key||'')}"   placeholder="ex: PAD | Bayard Audio">
          <input class="cfg-input lk-value" value="${escHtml(r.value||'')}" placeholder="ex: Bayard Audio/En attente PAD">
          <button onclick="lkRemoveRow(this)"
            style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:3px;
                   color:#e74c3c;cursor:pointer;font-size:14px;line-height:1;">×</button>`;
        wrap.appendChild(div);
      });
      toast('✓ ' + rows.length + ' lignes importées');
    } catch(err) {
      toast('Erreur import : ' + err.message);
    }
    fileInput.value = '';
  };
  reader.readAsText(file);
}

// ══ WFD ENGINE — Intégration Designer ═══════════════════════════════════════

// ── État des flux activés (persisté dans localStorage) ──────────
function _getActiveFluxes() {
  try { return new Set(JSON.parse(localStorage.getItem('wfd_active_fluxes') || '[]')); }
  catch(_) { return new Set(); }
}

function _saveActiveFluxes(set) {
  localStorage.setItem('wfd_active_fluxes', JSON.stringify([...set]));
}

// ── Mettre à jour l'affichage du bouton toggle ───────────────────
function wfdUpdateToggleBtn() {
  const flux   = getFluxCourant();
  const btn    = document.getElementById('btn-flux-toggle');
  const runBtn = document.getElementById('btn-flux-run');
  const group  = document.getElementById('tb-engine-group');
  if (!btn) return;

  if (!flux) {
    if (group) group.style.display = 'none';
    return;
  }
  if (group) group.style.display = '';

  const actives = _getActiveFluxes();
  const isActive = actives.has(flux.id);

  if (isActive) {
    btn.textContent = '⏹ Actif';
    btn.style.borderColor = '#27ae60';
    btn.style.color       = '#27ae60';
    btn.style.background  = '#001a05';
    btn.title = 'Flux actif — cliquer pour désactiver';
  } else {
    btn.textContent = '▷ Inactif';
    btn.style.borderColor = '#555';
    btn.style.color       = '#555';
    btn.style.background  = '';
    btn.title = 'Flux inactif — cliquer pour activer';
  }
}

// ── Activer / désactiver le flux courant ─────────────────────────
function wfdToggleFlux() {
  const flux = getFluxCourant();
  if (!flux) return;

  const actives = _getActiveFluxes();
  if (actives.has(flux.id)) {
    actives.delete(flux.id);
    toast('Flux désactivé — ' + flux.name);
    // Notifier le Engine si disponible
    if (window.WfdEngineInstance) window.WfdEngineInstance.deactivateFlux(flux.id);
  } else {
    actives.add(flux.id);
    toast('Flux activé — ' + flux.name);
    if (window.WfdEngineInstance) {
      // Pousser les flux à jour avant d'activer pour éviter une version obsolète en mémoire
      window.WfdEngineInstance.loadFluxes(wfdFlows).catch(() => {}).finally(() => {
        window.WfdEngineInstance.activateFlux(flux.id);
      });
    }
  }
  _saveActiveFluxes(actives);
  wfdUpdateToggleBtn();
  peuplerSelectFlux();
}

// ── Déclenchement manuel (test) ──────────────────────────────────
async function wfdRunManual() {
  const flux = getFluxCourant();
  if (!flux) { toast('Aucun flux sélectionné'); return; }

  if (!window.WfdEngineInstance) {
    toast('Engine non initialisé — vérifiez la configuration');
    return;
  }

  const btn = document.getElementById('btn-flux-run');
  if (btn) { btn.textContent = '⏳ En cours...'; btn.disabled = true; }

  // Lancer sans await — le flux peut se suspendre (gate pause)
  // Le bouton revient immédiatement — l'état est suivi via les événements
  window.WfdEngineInstance.triggerManual(flux.id)
    .then(ctx => {
      if (!ctx) return;
      if (ctx.status === 'skipped') { toast('⏭ ' + flux.name + ' — déjà en cours'); return; }
      const emoji = ctx.status === 'success' ? '🟢' : ctx.status === 'partial' ? '🟡' : '🔴';
      toast(emoji + ' ' + flux.name + ' — ' + ctx.status);
    })
    .catch(err => toast('❌ ' + err.message));

  // Bouton revient immédiatement
  if (btn) { btn.textContent = '▶ Exécuter'; btn.disabled = false; }
  toast('▶ ' + flux.name + ' démarré');
}

// ── Afficher le log d'une exécution ─────────────────────────────
function wfdShowRunLog(ctx) {
  const status = ctx.status;
  const emoji  = status === 'success' ? '🟢' : status === 'partial' ? '🟡' : '🔴';
  const lines  = [
    emoji + ' <b>' + status.toUpperCase() + '</b> — Run ID : ' + ctx.runId,
    'Démarré : ' + (ctx.startedAt || ''),
    '',
  ];

  if (ctx.errors && ctx.errors.length) {
    lines.push('<b>Erreurs :</b>');
    ctx.errors.forEach(e => {
      const icon = e.severity === 'fatal' ? '❌' : '⚠️';
      lines.push(icon + ' [' + e.node + '] ' + e.message);
    });
    lines.push('');
  }

  if (ctx.vars && Object.keys(ctx.vars).length) {
    lines.push('<b>Variables :</b>');
    Object.entries(ctx.vars).forEach(([k, v]) => {
      if (!k.startsWith('_')) lines.push('  ' + k + ' = ' + JSON.stringify(v));
    });
  }

  // Afficher dans le panel de logs existant
  const logsEl = document.getElementById('wfd-logs-content');
  if (logsEl) {
    logsEl.innerHTML = lines.join('<br>');
    wfdOpenLogs();
  } else {
    alert(lines.join('\n').replace(/<[^>]+>/g, ''));
  }
}

// ── Hook : mettre à jour le toggle quand on change de flux ───────
const _origOnFlowChange = typeof onFlowChange === 'function' ? onFlowChange : null;
// sera appelé depuis onFlowChange via peuplerSelectFlux

