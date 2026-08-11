// APS — scripts/porter-ressources-make.js — créé le 2026-08-11
// ================================================================
// Porter les ressources d'organisation vers des Data Stores Make.
//
//   node scripts/porter-ressources-make.js            montre, n'écrit rien
//   node scripts/porter-ressources-make.js --ecrire   crée/met à jour
//
// POURQUOI : sur un workflow réel, 16 des 22 écarts d'interprétation viennent
// d'un champ qui désigne une ressource d'APS — un manifeste, une
// correspondance, une séquence d'endpoints. APS n'étant pas là en production,
// ces champs deviennent une saisie libre. Les ressources doivent donc VIVRE
// chez la cible.
//
// ── CE QUI SE DÉCLARE ET CE QUI NE SE DÉCLARE PAS ───────────────
// Un Data Store qui contient du JSON opaque ne vaut pas mieux qu'un appel HTTP
// anonyme : personne ne peut lire ce qu'il porte. On déclare donc les champs
// chaque fois que la forme le permet, et on le dit quand elle ne le permet pas.
//
//   manifeste       entièrement déclaré — essences en collection nommée
//   correspondance  entièrement déclarée — {clé, type, valeur}
//   endpoint        déclaré au premier niveau, champs de sous-étape compris
//   gabarit         OPAQUE, et c'est structurel : un gabarit d'arborescence est
//                   RÉCURSIF (des enfants qui ont des enfants), une structure
//                   de données Make est plate. Rien ne peut l'exprimer.
//   registre        entièrement déclaré — l'unicité des identifiants
//
// ── UN SEUL STORE POUR QUATRE RESSOURCES, ET POURQUOI ───────────
// L'offre plafonne le stockage à 10 Mo, et ce sont les RÉSERVATIONS qui le
// remplissent, pas les données : six stores existants occupent 31 Ko et le
// budget est saturé. Créer un store par ressource était donc refusé.
//
// Plutôt que de tout jeter dans un champ JSON — ce qui aurait rendu le contenu
// illisible, exactement le défaut qu'on cherche à corriger — les quatre
// ressources partagent une structure qui déclare la RÉUNION de leurs champs,
// avec un champ `type` pour s'y retrouver. `strict: false` autorise un
// manifeste à laisser `regles` vide. Chaque champ reste donc nommé et typé.
//
// Le jour où de la place se libère, ce script sait toujours créer un store par
// ressource : il suffit de rendre `partage` faux.
//
// ── CE QU'ON NE PORTE PAS ───────────────────────────────────────
// Les CONNEXIONS. Elles portent un secret, et Make a son propre mécanisme
// (l'app custom a déjà sa connexion Iconik). Mettre un jeton dans un Data Store
// serait le sortir de son coffre pour le poser sur une étagère.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');

const ECRIRE = process.argv.includes('--ecrire');

const T = (nom, label, type, spec) => spec
  ? { name: nom, label: label, type: type, spec: spec }
  : { name: nom, label: label, type: type };

// Les cinq ressources, leur structure et la façon de transformer une ligne
// d'APS en enregistrement Make.
// La structure commune : la réunion des champs des quatre ressources.
const STORE_PARTAGE = 'APS — Ressources';
const SPEC_PARTAGEE = [
  T('type', 'Type de ressource', 'text'),
  T('nom', 'Nom', 'text'),
  T('niveau', 'Niveau', 'text'),
  T('essences', 'Essences (manifeste)', 'array', { type: 'collection', spec: [
    T('role', 'Rôle', 'text'), T('sortie', 'Variable de sortie', 'text'),
    T('cardinalite', 'Cardinalité', 'text'),
    T('verifyEndpoint', 'Endpoint de vérification', 'text'),
    T('verifyPath', 'Chemin de vérification', 'text'),
    T('appliesTo', 'Niveaux concernés', 'array', { type: 'text' }) ] }),
  T('regles', 'Règles (correspondance)', 'array', { type: 'collection', spec: [
    T('cle', 'Champ APS', 'text'), T('type', 'Type', 'text'),
    T('valeur', 'Chemin partenaire', 'text') ] }),
  T('etapes', 'Étapes (endpoint)', 'array', { type: 'collection', spec: [
    T('nom', 'Nom', 'text'), T('methode', 'Méthode', 'text'),
    T('chemin', 'Endpoint', 'text'), T('mode', 'Mode', 'text'),
    T('surErreur', 'Sur erreur', 'text'),
    T('champs', 'Champs', 'array', { type: 'collection', spec: [
      T('cle', 'Clé', 'text'), T('source', 'Source', 'text') ] }) ] }),
  T('description', 'Description (gabarit)', 'text'),
  T('config', 'Gabarit récursif (JSON brut)', 'text'),
];

const RESSOURCES = [
  {
    cle: 'manifestes', partage: true, type: 'manifeste', modele: 'manifest', titre: 'APS — Manifestes',
    opaque: null,
    spec: [
      T('nom', 'Nom', 'text'), T('niveau', 'Niveau', 'text'),
      T('essences', 'Essences', 'array', { type: 'collection', spec: [
        T('role', 'Rôle', 'text'), T('sortie', 'Variable de sortie', 'text'),
        T('cardinalite', 'Cardinalité', 'text'),
        T('verifyEndpoint', 'Endpoint de vérification', 'text'),
        T('verifyPath', 'Chemin de vérification', 'text'),
        T('appliesTo', 'Niveaux concernés', 'array', { type: 'text' }),
      ] }),
    ],
    vers: m => ({ type: 'manifeste', nom: m.name, niveau: m.niveau || '',
      essences: (m.essences || []).map(e => ({
        role: e.role || '', sortie: e.sortie || '', cardinalite: e.cardinalite || '',
        verifyEndpoint: e.verifyEndpoint || '', verifyPath: e.verifyPath || '',
        appliesTo: e.appliesTo || [] })) }),
  },
  {
    cle: 'correspondances', partage: true, type: 'correspondance', modele: 'mapping', titre: 'APS — Correspondances',
    opaque: null,
    spec: [
      T('nom', 'Nom', 'text'),
      T('regles', 'Règles', 'array', { type: 'collection', spec: [
        T('cle', 'Champ APS', 'text'), T('type', 'Type', 'text'),
        T('valeur', 'Chemin partenaire', 'text'),
      ] }),
    ],
    vers: m => ({ type: 'correspondance', nom: m.name,
      regles: (m.rules || []).map(r => ({ cle: r.key || '', type: r.type || '', valeur: r.value || '' })) }),
  },
  {
    cle: 'endpoints', partage: true, type: 'endpoint', modele: 'endpoint', titre: 'APS — Séquences d\'endpoints',
    opaque: null,
    spec: [
      T('nom', 'Nom', 'text'),
      T('etapes', 'Étapes', 'array', { type: 'collection', spec: [
        T('nom', 'Nom', 'text'), T('methode', 'Méthode', 'text'),
        T('chemin', 'Endpoint', 'text'), T('mode', 'Mode', 'text'),
        T('surErreur', 'Sur erreur', 'text'),
        T('champs', 'Champs', 'array', { type: 'collection', spec: [
          T('cle', 'Clé', 'text'), T('source', 'Source', 'text') ] }),
      ] }),
    ],
    vers: e => ({ type: 'endpoint', nom: e.name,
      etapes: (e.steps || []).map(s => ({
        nom: s.name || '', methode: s.method || '', chemin: s.endpoint || '',
        mode: s.httpMode || '', surErreur: s.onError || '',
        champs: (s.feFields || []).map(f => ({ cle: f.key || '', source: f.src || '' })) })) }),
  },
  {
    cle: 'gabarits', partage: true, type: 'gabarit', modele: 'arboTemplate', titre: 'APS — Gabarits d\'arborescence',
    // Un gabarit décrit un arbre : chaque nœud a des enfants qui ont des
    // enfants. Une structure de données Make n'a pas de récursion. On garde
    // donc la forme brute, et on l'annonce plutôt que de la maquiller.
    opaque: 'gabarit récursif : Make ne sait pas déclarer une structure qui se contient elle-même',
    spec: [
      T('nom', 'Nom', 'text'), T('description', 'Description', 'text'),
      T('config', 'Gabarit (JSON brut)', 'text'),
    ],
    vers: a => ({ type: 'gabarit', nom: a.name, description: a.description || '',
                  config: JSON.stringify(a.config || {}) }),
  },
  {
    cle: 'registre', modele: 'bayardRegistry', titre: 'APS — Registre BayardID',
    opaque: null, cleDe: r => r.assetId,
    spec: [
      T('bayardId', 'BayardID', 'text'), T('assetType', 'Type d\'objet', 'text'),
      T('attribueLe', 'Attribué le', 'text'),
    ],
    vers: r => ({ bayardId: String(r.bayardId), assetType: r.assetType || '',
                  attribueLe: (r.createdAt || new Date()).toISOString().slice(0, 10) }),
  },
];

// ── CE QU'UN CHAMP DEVIENT, UNE FOIS LA RESSOURCE PORTÉE ────────
// La nature d'un champ (côté `NodeDefinition`) désigne une ressource ; le
// portage décide sous quelle CLÉ elle vit chez la cible. Les deux doivent se
// rejoindre quelque part, et cet endroit est ici : c'est le portage qui fixe la
// forme de la clé (`type + ':' + id`), donc c'est lui qui l'annonce. L'écran
// d'interprétation la LIT — une seconde table aurait divergé de la première au
// premier changement, comme la correspondance des verbes l'a déjà montré.
//
// `connexion` est absente, et volontairement : voir « CE QU'ON NE PORTE PAS ».
// Une nature absente de cette table n'est donc pas un oubli, c'est une réponse.
const RESOLUTION = {
  manifeste: { type: 'manifeste',      modele: 'manifest' },
  mapping:   { type: 'correspondance', modele: 'mapping' },
  endpoint:  { type: 'endpoint',       modele: 'endpoint' },
  endpoints: { type: 'endpoint',       modele: 'endpoint' },
  gabarit:   { type: 'gabarit',        modele: 'arboTemplate',
               reserve: 'le gabarit arrive en JSON brut — il est récursif et une '
                      + 'structure Make est plate ; il faudra le parser à la lecture' },
};

// La clé d'une ressource dans le store partagé. Le préfixe de type n'est pas
// décoratif : deux ressources de types différents pourraient partager un
// identifiant.
function cleDe(nature, id) {
  const r = RESOLUTION[nature];
  return r ? r.type + ':' + id : null;
}

// L'offre plafonne à 60 requêtes par minute (`license.apiLimit`). Le registre
// en compte 124 : sans frein, le portage se fait couper au tiers et rend des
// « 0 sur 124 » qu'on prend pour un bug de forme. On espace, et on réessaie sur
// un 429 plutôt que d'abandonner la ligne.
const ENTRE_APPELS = 1100;
let dernier = 0;
async function ap(a, m, c, b, essai) {
  const attente = ENTRE_APPELS - (Date.now() - dernier);
  if (attente > 0) await new Promise(r => setTimeout(r, attente));
  dernier = Date.now();
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (r.status === 429 && (essai || 0) < 5) {
    await new Promise(x => setTimeout(x, 5000 * ((essai || 0) + 1)));
    return ap(a, m, c, b, (essai || 0) + 1);
  }
  return { statut: r.status, corps: j, brut: t.slice(0, 200), ok: r.status >= 200 && r.status < 300 };
}

async function porter() {
  // Le client n'est ouvert qu'à l'exécution : ce fichier est aussi REQUIS par
  // la route d'interprétation, pour sa table de résolution, et une connexion
  // ouverte au chargement d'un module qu'on ne fait que lire est une fuite.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const cx = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const acces = Acces.construireAcces({
    baseUrl: cx.baseUrl, extraConfig: cx.extraConfig,
    authValue: cx.authValueEnc ? decrypt(cx.authValueEnc) : null }, cx.platform.authSpec);
  const equipe = Number((cx.extraConfig.contexteTest || {}).teamId) || 411248;

  const l = (s, n) => String(s).padEnd(n);
  console.log('\n' + l('RESSOURCE', 20) + l('LIGNES', 8) + l('CHAMPS', 8) + 'FORME');
  console.log('─'.repeat(76));
  const plan = [];
  for (const r of RESSOURCES) {
    const lignes = await prisma[r.modele].findMany();
    plan.push({ r, lignes });
    console.log(l(r.cle, 20) + l(lignes.length, 8) + l(r.spec.length, 8)
      + (r.opaque ? 'OPAQUE — ' + r.opaque : 'déclarée'));
  }
  console.log('\nNon porté : les connexions — elles portent un secret, et Make a\n'
    + 'son propre mécanisme (l\'app custom a déjà sa connexion Iconik).');

  if (!ECRIRE) { console.log('\nLecture seule. Relancer avec --ecrire.'); return prisma.$disconnect(); }

  const existants = await ap(acces, 'GET', `/data-stores?teamId=${equipe}`);
  const parNom = new Map(((existants.corps && existants.corps.dataStores) || []).map(s => [s.name, s]));

  // Le store partagé : on ÉLARGIT celui qui existe déjà plutôt que d'en créer
  // un — le budget de réservation est saturé, et une réservation ne se récupère
  // qu'en la reprenant.
  let partage = parNom.get(STORE_PARTAGE) || parNom.get('APS — Manifestes');
  if (partage) {
    const d = await ap(acces, 'GET', `/data-stores/${partage.id}`);
    const idStruct = d.corps && d.corps.dataStore && d.corps.dataStore.datastructureId;
    if (idStruct) {
      const rs = await ap(acces, 'PATCH', `/data-structures/${idStruct}`,
        { name: STORE_PARTAGE, spec: SPEC_PARTAGEE });
      console.log((rs.ok ? '✅' : '❌') + ' structure élargie  ' + idStruct
        + (rs.ok ? ` · ${SPEC_PARTAGEE.length} champs` : ' — ' + rs.brut));
      if (!rs.ok) return prisma.$disconnect();
    }
    if (partage.name !== STORE_PARTAGE) {
      await ap(acces, 'PATCH', `/data-stores/${partage.id}`, { name: STORE_PARTAGE });
    }
  } else {
    console.log('❌ aucun store à élargir — en créer un demande de la place');
    return prisma.$disconnect();
  }
  console.log('   store partagé     ' + partage.id + ' « ' + STORE_PARTAGE + ' »\n');

  for (const { r, lignes } of plan) {
    let store = r.partage ? partage : parNom.get(r.titre);
    if (!store) {
      const rs = await ap(acces, 'POST', '/data-structures',
        { teamId: equipe, name: r.titre, strict: false, spec: r.spec });
      if (!rs.ok) { console.log('❌ ' + l(r.cle, 20) + 'structure — ' + rs.brut); continue; }
      const rd = await ap(acces, 'POST', '/data-stores', {
        name: r.titre, teamId: equipe,
        datastructureId: rs.corps.dataStructure.id, maxSizeMB: 1 });
      if (!rd.ok) { console.log('❌ ' + l(r.cle, 20) + 'store — ' + rd.brut); continue; }
      store = rd.corps.dataStore;
    }

    // La clé porte le type quand le store est partagé : deux ressources de
    // types différents pourraient sinon partager un identifiant.
    let ok = 0, ko = 0, dernierEchec = null;
    for (const ligne of lignes) {
      const brute = String(r.cleDe ? r.cleDe(ligne) : ligne.id);
      const cle = r.partage ? r.type + ':' + brute : brute;
      const donnees = r.vers(ligne);
      // Les deux verbes n'ont PAS le même corps, et la spec le dit à peine :
      // le POST enveloppe (`{key, data}`), le PUT non — son corps EST
      // l'enregistrement. Envelopper au PUT rendait « paramètre bayardId
      // manquant » sur les seules clés déjà existantes.
      let res = await ap(acces, 'POST', `/data-stores/${store.id}/data`, { key: cle, data: donnees });
      if (!res.ok) {
        res = await ap(acces, 'PUT',
          `/data-stores/${store.id}/data/${encodeURIComponent(cle)}`, donnees);
      }
      if (res.ok) ok++; else { ko++; dernierEchec = res.brut; }
    }
    console.log((ko ? '⚠️ ' : '✅ ') + l(r.cle, 20) + `store ${store.id} · ${ok}/${lignes.length}`
      + (ko ? ` · ${ko} en échec — ${dernierEchec}` : ''));
  }

  await prisma.$disconnect();
}

// Exécuté seulement en ligne de commande. Requis comme module, ce fichier ne
// doit RIEN écrire chez la cible — il n'expose que ce qu'il a décidé.
if (require.main === module) {
  porter().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
}

module.exports = { STORE_PARTAGE, RESOLUTION, cleDe, porter };
