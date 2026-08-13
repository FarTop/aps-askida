// APS — server/lib/aps-outils.js — 2026-08-13
// ================================================================
// LE CATALOGUE DES OUTILS — ce qu'un groupe peut ouvrir.
//
// Un groupe porte une liste de clés prises ici (`Groupe.outils`). C'est tout
// ce qui définit un accès : pas de matrice, pas de niveaux, pas de « lecture /
// écriture / admin » par ressource. Un outil est ouvert ou il ne l'est pas.
//
// POURQUOI UN FICHIER ET PAS UNE TABLE. Un outil n'est pas une donnée : il
// existe parce qu'une page existe. Une table de huit lignes qui ne change que
// lorsqu'on écrit du code se désynchronise du code — on l'a déjà vu avec les
// tables Doc*, modélisées puis oubliées. Le catalogue vit donc AVEC les pages
// qu'il décrit, et une route le sert à l'écran d'administration pour que les
// deux ne divergent pas.
//
// AJOUTER UN OUTIL : une entrée ici, et c'est proposé à la case à cocher. Rien
// d'autre à faire — surtout pas de migration.
//
// `reserve: true` marque ce qui ne devrait raisonnablement appartenir qu'à
// SuperAdmin. Ce n'est PAS un verrou : l'écran le signale, il ne l'interdit
// pas. Le jour où l'on veut ouvrir les outils de développement à quelqu'un
// d'autre, il faut pouvoir le faire sans toucher au code.
// ================================================================
'use strict';

const OUTILS = [
  // ── Les builders ───────────────────────────────────────────────
  { cle: 'builder.platform', nom: 'Platform Builder', famille: 'Builders',
    aide: 'Structures, ACL, métadonnées, mapping' },
  { cle: 'builder.workflow', nom: 'Workflow Builder', famille: 'Builders',
    aide: 'Workflows, canevas, émission vers les cibles' },
  { cle: 'builder.doc',      nom: 'Documentation Builder', famille: 'Builders',
    aide: 'Kits, gabarits, chartes, exports' },

  // ── Administration ─────────────────────────────────────────────
  { cle: 'admin.organisations', nom: 'Organisations', famille: 'Administration',
    aide: 'Organisations, plateformes et environnements' },
  { cle: 'admin.platforms',     nom: 'Plateformes',   famille: 'Administration',
    aide: 'Déclarer et configurer les plateformes' },
  { cle: 'admin.connexions',    nom: 'Connexions',    famille: 'Administration',
    aide: 'Jetons, identifiants et URLs — donne accès à des SECRETS' },
  { cle: 'admin.environments',  nom: 'Environnements', famille: 'Administration',
    aide: 'Instances QA, Production, Dev' },
  { cle: 'admin.resources',     nom: 'Ressources',    famille: 'Administration',
    aide: 'Correspondances, manifestes, endpoints, nommages, chartes' },
  { cle: 'admin.users',         nom: 'Utilisateurs',  famille: 'Administration',
    aide: 'Groupes, comptes et invitations — donne le pouvoir d\'en donner',
    reserve: true },
  { cle: 'admin.infrastructure', nom: 'Infrastructure', famille: 'Administration',
    aide: 'Spécifications d\'API, opérations, serveurs MCP' },

  // ── Développement ──────────────────────────────────────────────
  // Nommés d'avance : ils n'existent pas encore, et c'est précisément pour
  // qu'un groupe puisse les avoir cochés le jour où ils arrivent.
  { cle: 'dev.outils', nom: 'Outils de développement', famille: 'Développement',
    aide: 'Capacités ad-hoc, scripts, accès direct aux données', reserve: true },
  { cle: 'dev.ia-code', nom: 'IA en mode code', famille: 'Développement',
    aide: 'Génération et exécution de code assistée', reserve: true },
];

const CLES = OUTILS.map(o => o.cle);

// Les groupes sans lesquels APS n'a plus d'administrateur. Semés à la première
// lecture, protégés contre la suppression, et volontairement peu nombreux : un
// jeu de départ se corrige à l'écran, il n'a pas à tout prévoir.
//
// Support et Admin partagent presque tout — c'est assumé. Les séparer coûte
// une ligne ici ; les fusionner coûtera une suppression à l'écran. Aucune des
// deux décisions n'a besoin d'être prise aujourd'hui.
const GROUPES_SYSTEME = [
  { cle: 'superadmin', nom: 'SuperAdmin',
    description: 'Tout, y compris les outils de développement et l\'administration des comptes.',
    outils: CLES.slice() },
  { cle: 'admin', nom: 'Admin',
    description: 'Toute l\'administration et les builders, sans les outils de développement.',
    outils: CLES.filter(c => !c.startsWith('dev.')) },
  { cle: 'support', nom: 'Support',
    description: 'Comme Admin, sans la gestion des comptes ni les secrets des connexions.',
    outils: CLES.filter(c => !c.startsWith('dev.')
                          && c !== 'admin.users'
                          && c !== 'admin.connexions') },
];

function existe(cle) { return CLES.indexOf(cle) !== -1; }

// Écarte silencieusement les clés inconnues plutôt que de refuser tout
// l'enregistrement : un outil retiré du catalogue ne doit pas rendre
// inéditables les groupes qui le portaient encore.
function nettoyer(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(String).filter(existe);
}

module.exports = { OUTILS, CLES, GROUPES_SYSTEME, existe, nettoyer };
