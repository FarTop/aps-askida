// ==================== CHARTE GRAPHIQUE (agnostique) ====================
const CHARTE_CLIENT = {
  jaune: [200, 209, 0],      // #C8D100
  noir: [0, 0, 0],
  beige: [232, 228, 208],    // #E8E4D0
  gris: [100, 100, 100],
  bleuFonce: [13, 71, 161],
  vertEau: [0, 150, 136]
};

// Alias rétrocompatibilité
const CHARTE_BAYARD = CHARTE_CLIENT;

// ── Nom de l'organisation ──
function getNomOrganisation() {
  return localStorage.getItem('organisationName') || 'Organisation';
}

function appliquerHeaderDoc(doc, titre, sousTitre, yStart = 0) {
  doc.setFillColor(...CHARTE_CLIENT.noir);
  doc.rect(0, yStart, 210, 40, 'F');

  doc.setFillColor(...CHARTE_CLIENT.jaune);
  doc.roundedRect(15, yStart + 10, 8, 8, 2, 2, 'F');

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(titre, 28, yStart + 17);

  if (sousTitre) {
    doc.setFontSize(10);
    doc.setTextColor(...CHARTE_CLIENT.beige);
    doc.setFont(undefined, 'normal');
    doc.text(sousTitre, 28, yStart + 25);
  }

  // Nom organisation en haut à droite
  const nomOrg = getNomOrganisation();
  doc.setFontSize(8);
  doc.setTextColor(...CHARTE_CLIENT.beige);
  doc.setFont(undefined, 'normal');
  doc.text(nomOrg, 195, yStart + 8, { align: 'right' });

  doc.setFillColor(...CHARTE_CLIENT.jaune);
  doc.roundedRect(185, yStart + 28, 6, 6, 1.5, 1.5, 'F');
  doc.setFillColor(...CHARTE_CLIENT.beige);
  doc.roundedRect(193, yStart + 28, 6, 6, 1.5, 1.5, 'F');
}

// Alias rétrocompatibilité
const appliquerHeaderBayard = appliquerHeaderDoc;

function creerTableauDoc(doc, x, y, largeur, hauteur, titre, contenu) {
  doc.setFillColor(...CHARTE_CLIENT.jaune);
  doc.roundedRect(x, y, largeur, 6, 1, 1, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...CHARTE_CLIENT.noir);
  doc.setFont(undefined, 'bold');
  doc.text(titre, x + 2, y + 4);

  doc.setFillColor(...CHARTE_CLIENT.beige);
  doc.roundedRect(x, y + 6, largeur, hauteur, 1, 1, 'F');

  return y + 7;
}

// Alias rétrocompatibilité
const creerTableauBayard = creerTableauDoc;

// ==================== VARIABLES GLOBALES ====================
let teamsData          = { teams: [] };
let roleGroupsData     = { roleGroups: [] };
let groupesData        = { groupes: [] }; // alias rétrocompatibilité
let savedSearchesData  = { savedSearches: [] };
let storagesData       = { storages: [] };
let collectionsData    = { collections: [] };
let metadataViewsData  = { metadataViews: [] };
let rolesData          = { roles: [] };
let metadonneesData    = { metadonnees: [] };
let itemsAdvancedData  = { items: [] };
let workflowsData      = { workflows: [] }; // Conservé pour rétrocompatibilité
let automationsData    = { automations: [] };
let webhooksData       = { webhooks: [] };
let customActionsData  = { customActions: [] };
let categoriesData     = { categories: [] };
let appTokensData      = { appTokens: [] };

// Sélections comparaison
let selectionsComparaison = {
  groupes: [],
  collections: [],
  mdViews: [],
  metadonnees: [],
  roles: []
};

// Charger les données depuis localStorage
function chargerDonneesShared() {
  const g = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } };
  teamsData          = g('teamsData')          || { teams: [] };
  roleGroupsData     = g('roleGroupsData')     || { roleGroups: [] };
  groupesData        = g('groupesData')        || { groupes: [] };
  savedSearchesData  = g('savedSearchesData')  || { savedSearches: [] };
  storagesData       = g('storagesData')       || { storages: [] };
  collectionsData    = g('collectionsData')    || { collections: [] };
  metadataViewsData  = g('metadataViewsData')  || { metadataViews: [] };
  rolesData          = g('rolesData')          || { roles: [] };
  metadonneesData    = g('metadonneesData')    || { metadonnees: [] };
  itemsAdvancedData  = g('itemsAdvancedData')  || { items: [] };
  workflowsData      = g('workflowsData')      || { workflows: [] };
  automationsData    = g('automationsData')    || { automations: [] };
  webhooksData       = g('webhooksData')       || { webhooks: [] };
  customActionsData  = g('customActionsData')  || { customActions: [] };
  categoriesData     = g('categoriesData')     || { categories: [] };
  appTokensData      = g('appTokensData')      || { appTokens: [] };
}