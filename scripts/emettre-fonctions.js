// APS — scripts/emettre-fonctions.js — créé le 2026-08-14
// ================================================================
// LE TROISIÈME ÉMETTEUR. Make reçoit des scénarios, AWS des machines d'états —
// et ce que ni l'un ni l'autre ne sait faire, il faut le LEUR DONNER.
//
//   node scripts/emettre-fonctions.js <idFlux>              l'inventaire
//   node scripts/emettre-fonctions.js <idFlux> --ecrire <dir>  écrit le code
//
// N'APPELLE RIEN. Il inventorie ce qu'un workflow réclame chez la cible, et
// rend le code qui le fournit.
//
// ── POURQUOI CE FICHIER EXISTE : LA LIVRAISON DOIT SURVIVRE ─────
// Arbitrage du 2026-08-14, et c'est lui qui commande tout le reste. Une
// première version faisait rappeler APS par la fonction : une seule source de
// vérité pour les identifiants, c'était séduisant. C'est faux au regard du
// métier — le jour où la mission s'arrête, un workflow qui a besoin d'APS pour
// tourner s'arrête avec elle. On n'aurait pas livré un processus, on aurait
// livré une dépendance.
//
// Donc : ce qui part chez le client doit être AUTONOME. Le code ET l'état.
// APS sème, puis se retire.
//
// ── PAS DE CODE SUR MESURE PAR WORKFLOW ─────────────────────────
// Trois des quatre fonctions n'ont aucune logique propre à un workflow : leur
// comportement entier est dicté par une ressource qu'APS possède déjà et que
// l'utilisateur édite dans ses écrans — un Manifeste, une Correspondance. Elles
// sont donc GÉNÉRIQUES, et ce qui change voyage en ENTRÉE du Task ASL, pas dans
// le corps de la fonction.
//
// La conséquence est ce qui rend l'idée tenable : un manifeste modifié ne
// demande aucun redéploiement, et un défaut se corrige à un seul endroit. Une
// fonction par workflow aurait multiplié les copies par le nombre de flux, et
// figé dans du code ce que l'utilisateur croit modifier dans une fiche.
//
// ── L'ÉTAT, LUI, NE SE GÉNÉRALISE PAS ───────────────────────────
// APS tient DEUX états, de natures différentes — les confondre était mon erreur
// de départ :
//
//   BayardRegistry   bayardId unique → assetId. Un REGISTRE, pas un compteur :
//                    il rend le même identifiant si l'objet en a déjà un, et
//                    évite les collisions. C'est ce qui rend l'attribution
//                    idempotente, donc rejouable.
//   ApsCounter       (scope, key) → value, avec fenêtre de rafale. La
//                    numérotation de fratrie de create_tree.
//
// Les deux partent en DynamoDB, et les deux DOIVENT ÊTRE SEMÉS avec ce qu'APS
// détient : une table qui repart de zéro redistribuerait des identifiants que
// le client utilise déjà. C'est le dernier service qu'APS rend avant de sortir.
// ── AUCUN PAQUET À EMBARQUER ────────────────────────────────────
// Le runtime Lambda nodejs20.x fournit le SDK AWS v3 : les fonctions le
// requièrent sans que rien ne soit à installer ni à empaqueter. Une archive ne
// contient donc que du code d'APS — ce qui la rend relisible par le client,
// point qui compte quand la livraison doit lui survivre.
// ================================================================
'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const ID = process.argv[2];
const iEcr = process.argv.indexOf('--ecrire');
const SORTIE = iEcr !== -1 ? process.argv[iEcr + 1] : null;

// ── CE QUE CHAQUE FONCTION EST ──────────────────────────────────
// Déclaré ici et pas déduit du code : un lecteur doit pouvoir savoir ce que la
// cible recevra sans lire quatre fichiers de source.
const FONCTIONS = {
  'aps-verify': {
    verbe: 'verify',
    dit: 'vérifie chaque essence d\'un manifeste chez le partenaire',
    piloteePar: 'Manifeste (essences, verifyEndpoint, verifyPath)',
    etat: null,
    rend: '{ total, passed, failures[], checkerSummary }',
    // Le contrat est celui du moteur du Builder (builder-handler-verify.js) —
    // même forme des deux côtés, un seul modèle à tenir en tête.
    source: 'fonction-verify.js',
    compagnons: ['scripts/fonctions/commun-connexion.js'],
  },
  'aps-essences': {
    verbe: 'deliver',
    dit: 'liste le dépôt et reconnaît quel fichier est quelle essence',
    piloteePar: 'Manifeste (essences, motifs de nom, cardinalité)',
    etat: null,
    rend: '{ nbObjets, variables{}, horsNiveau[], cardinalite[] }',
    source: 'fonction-essences.js',
    // EMBARQUÉ DEPUIS LE DÉPÔT, pas recopié. Le module est pur et son en-tête
    // annonce lui-même qu'il sert « deux moteurs : celui d'APS, et une Lambda
    // AWS ». Le copier à l'émission garantit qu'il ne peut pas diverger : ces
    // variables composent les URL livrées au partenaire, qu'APS ira ensuite
    // vérifier — deux implémentations différentes livreraient à une adresse et
    // contrôleraient l'autre.
    compagnons: ['server/engine-builder/builder-essences.js'],
  },
  'aps-lookup': {
    verbe: 'lookup',
    dit: 'applique une table de correspondance et résout l\'héritage',
    piloteePar: 'Correspondance (lignes, règles d\'héritage)',
    etat: null,
    rend: 'l\'objet traduit',
    source: 'fonction-lookup.js',
    // Le noyau a ete EXTRAIT du handler le 2026-08-14 pour cet usage, et le
    // handler d'APS appelle desormais le meme code — verifie par
    // scripts/preuve-heritage.js. Les trois modules voyagent ensemble.
    compagnons: ['server/engine-builder/builder-lookup-noyau.js',
                 'server/engine-builder/builder-heritage.js',
                 'server/engine-builder/builder-correspondance.js'],
  },
  'aps-create-tree': {
    verbe: 'iconik.create_tree',
    dit: 'cree N collections en descendant un gabarit d arborescence',
    piloteePar: 'ArboTemplate (les niveaux), plus les compteurs pour numeroter',
    etat: ['aps-registry', 'aps-counter'],
    rend: '{ rootId, created[], count, rootBayardId, lastBayardId }',
    source: 'fonction-create-tree.js',
    compagnons: ['server/engine-builder/builder-identifiants.js',
                 'scripts/fonctions/commun-connexion.js',
                 'scripts/fonctions/commun-etat.js'],
  },
  'aps-registry': {
    verbe: 'registry',
    dit: 'attribue un identifiant unique et le retient',
    piloteePar: 'rien — c\'est de l\'état, pas de la configuration',
    etat: ['aps-registry', 'aps-counter'],
    rend: '{ id, existait }',
    source: 'fonction-registry.js',
    // Le FORMAT doit etre identique des deux cotes : le handler d'origine
    // signale avoir deja produit des formats etrangers entre create_tree et
    // aps.registry sur le MEME champ Iconik. Extrait le 2026-08-14.
    compagnons: ['server/engine-builder/builder-identifiants.js',
                 'scripts/fonctions/commun-etat.js'],
  },
};

// Les tables, et pourquoi cette clé-là. Une table mal clée se découvre en
// production, quand le premier doublon arrive.
const TABLES = {
  'aps-registry': {
    dit: 'registre des identifiants attribués',
    cle: 'bayardId (partition)',
    index: 'assetId — pour rendre le MÊME identifiant à un objet déjà connu ; '
         + 'sans cet index l\'attribution cesse d\'être idempotente et un '
         + 'workflow rejoué fabrique un second identifiant pour le même objet',
    sourceDeLaGraine: 'BayardRegistry, filtré sur l\'organisation',
  },
  'aps-counter': {
    dit: 'compteurs de numérotation (fratrie d\'une arborescence)',
    cle: 'scope + key (partition + tri)',
    index: null,
    sourceDeLaGraine: 'ApsCounter',
  },
};

function titre(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

// Ce qu'un flux réclame : on lit la définition ASL émise plutôt que le pivot.
// C'est l'émetteur ASL qui décide ce qui devient une Lambda — le redécider ici
// ferait diverger les deux au premier arbitrage, comme la table de
// correspondance de Make l'a déjà appris.
function fonctionsRequises(definition) {
  const requises = new Set();
  (function parcourir(states) {
    Object.values(states || {}).forEach(function (s) {
      // Deux formes d'invocation, et il faut lire les deux : l'ARN direct
      // (Resource) et l'integration de service (Arguments.FunctionName). La
      // seconde manquait, et `aps-essences` — la fonction de `deliver` —
      // n'apparaissait donc dans aucun inventaire.
      const m = String(s.Resource || '').match(/function:(aps-[a-z0-9-]+)/);
      if (m) requises.add(m[1]);
      const fn = s.Arguments && s.Arguments.FunctionName;
      if (typeof fn === 'string' && /^aps-/.test(fn)) requises.add(fn);
      if (s.ItemProcessor) parcourir(s.ItemProcessor.States);
    });
  })(definition.States);
  return Array.from(requises);
}

(async function () {
  if (!ID) {
    console.log('Usage : node scripts/emettre-fonctions.js <idFlux> [--ecrire <dossier>]');
    return;
  }
  const { construire } = require('./emettre-asl.js');
  const emis = await construire(ID);

  const requises = fonctionsRequises(emis.definition);

  titre('Ce que ce workflow réclame chez la cible');
  console.log('  workflow :', emis.plan.flux.nom);
  if (!requises.length) {
    console.log('  ✅ aucune fonction — tout est exprimable en ASL natif.');
    console.log('     Ce workflow est livrable tel quel, sans rien d\'autre à déployer.');
    return;
  }

  const tablesRequises = new Set();
  requises.forEach(function (nom) {
    const f = FONCTIONS[nom];
    if (!f) { console.log('  ⚠️ ', nom, '— fonction inconnue de cet émetteur'); return; }
    console.log('\n  ' + nom);
    console.log('    ' + f.dit);
    console.log('    pilotée par : ' + f.piloteePar);
    console.log('    rend        : ' + f.rend);
    (f.etat || []).forEach(function (t) { tablesRequises.add(t); });
  });

  if (tablesRequises.size) {
    titre('Les tables — ce qui doit survivre à la mission');
    tablesRequises.forEach(function (nom) {
      const t = TABLES[nom];
      console.log('\n  ' + nom + '   (' + t.dit + ')');
      console.log('    clé    : ' + t.cle);
      if (t.index) console.log('    index  : ' + t.index);
      console.log('    graine : ' + t.sourceDeLaGraine);
    });
    console.log('\n  ⚠️  UNE TABLE VIDE N\'EST PAS UNE TABLE NEUTRE. Si le client porte');
    console.log('     déjà des identifiants attribués par APS, une table qui repart de');
    console.log('     zéro les redistribuera. Semer fait partie de la soumission.');
  }

  if (!SORTIE) {
    titre('Fin de l\'inventaire');
    console.log('  Rien n\'a été écrit. Pour rendre le code : --ecrire <dossier>');
    return;
  }

  titre('Écriture');
  fs.mkdirSync(SORTIE, { recursive: true });
  requises.forEach(function (nom) {
    const f = FONCTIONS[nom];
    if (!f) return;
    const src = path.join(__dirname, 'fonctions', f.source);
    if (!fs.existsSync(src)) {
      console.log('  ⚠️ ', nom, '— source pas encore écrite (' + f.source + ')');
      return;
    }
    // Un dossier par fonction : le déploiement en fera une archive, et les
    // compagnons doivent voisiner le handler pour que `require('./…')` résolve.
    const dossier = path.join(SORTIE, nom);
    fs.mkdirSync(dossier, { recursive: true });
    fs.copyFileSync(src, path.join(dossier, 'index.js'));
    console.log('  ✅', path.join(dossier, 'index.js'));
    (f.compagnons || []).forEach(function (rel) {
      const depuis = path.join(__dirname, '..', rel);
      if (!fs.existsSync(depuis)) { console.log('  ⛔ compagnon introuvable :', rel); return; }
      const vers = path.join(dossier, path.basename(rel));
      fs.copyFileSync(depuis, vers);
      console.log('     ↳', path.basename(rel), '— embarqué depuis', rel);
    });
  });
})().catch(function (e) {
  console.error('ERREUR — ' + (e && e.stack || e));
  process.exit(1);
});
