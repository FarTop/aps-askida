// APS — scripts/monter-connexions-eventbridge.js — créé le 2026-08-14
// ================================================================
// Recrée dans le compte AWS courant les connexions EventBridge dont les
// machines d'états ont besoin pour appeler Iconik et le partenaire. Elles ont
// été saisies à la main dans la console le 2026-08-13 — deux essais chacune —
// et le déménagement vers le compte dédié du 2026-08-14 les a rendues
// inaccessibles. C'est précisément le genre de corvée qu'APS doit absorber.
//
//   node scripts/monter-connexions-eventbridge.js              LE PLAN (défaut)
//   node scripts/monter-connexions-eventbridge.js --appliquer  soumet
//
// ── DEUX GESTES, PAS UN ─────────────────────────────────────────
// Le défaut n'écrit rien : il montre ce qui serait fait, secrets masqués. C'est
// la promesse affichée en tête de wf-interpreter.js — « un plan, au sens de
// terraform plan. Lire et approuver d'abord, soumettre ensuite ». Rien
// n'obligeait à l'appliquer ici ; tout y invitait.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────
// Il ne touche pas aux définitions de machines d'états. Les ARN de connexion y
// sont écrits en dur (via l'environnement) — le script imprime en sortie les
// lignes de .env à mettre à jour, il ne les écrit pas à ta place : un .env
// réécrit par un script est un .env qu'on ne relit plus.
// ================================================================
'use strict';
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const EB = require('../server/lib/eventbridge-service.js');

const ID_AWS = 'cmsrwrp0g001pv0v4a0kjqzw7';   // AWS | ASKIDA | STEP FUNCTIONS

// Le nom de la connexion EventBridge est repris à l'identique de celui du
// 2026-08-13 : les définitions déjà émises le portent dans leurs ARN.
const CIBLES = [
  { nom: 'aps-iconik',
    idSource: 'cmsnkjk6l00006qv4hugje8as',        // ICONIK | ASKIDA | API
    variable: 'AWS_CONNEXION_ICONIK',
    description: 'Iconik — App-ID + Auth-Token. Derivee de la fiche APS par monter-connexions-eventbridge.js' },
  { nom: 'aps-vodfactory-preprod-api',
    idSource: 'cmqp7eg4z0002q4u5q8c3gyej',        // VODFACTORY | PREPROD | API
    variable: 'AWS_CONNEXION_VODFACTORY_PREPROD_API',
    description: 'VOD Factory preprod — jeton porteur. Derivee de la fiche APS par monter-connexions-eventbridge.js' }
];

const appliquer = process.argv.includes('--appliquer');

function titre(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

(async function () {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let code = 0;

  try {
    const connAws = await prisma.connexion.findUnique({ where: { id: ID_AWS } });
    if (!connAws) throw new Error('connexion AWS ' + ID_AWS + ' introuvable');
    const champs = (connAws.extraConfig && connAws.extraConfig.champs) || {};

    titre('Le compte visé');
    console.log('  compte :', champs.compte || '(absent)');
    console.log('  région :', champs.region || '(absente)');
    console.log('  mode   :', appliquer ? 'SOUMISSION' : 'plan (rien ne sera écrit)');

    const aRegler = [];

    for (const cible of CIBLES) {
      titre(cible.nom);

      const source = await prisma.connexion.findUnique({
        where: { id: cible.idSource }, include: { platform: true }
      });
      if (!source) { console.log('  ⛔ fiche source introuvable — ignorée'); code = 1; continue; }

      console.log('  dérivée de :', source.name);

      let params;
      try {
        params = EB.parametresDepuisConnexion(source, source.platform && source.platform.authSpec);
      } catch (e) {
        console.log('  ⛔', e.message); code = 1; continue;
      }

      const vue = EB.masquer(params);
      console.log('  clé d\'API  :', vue.nomCle, '=', vue.valeurCle);
      vue.entetes.forEach(function (h) { console.log('  en-tête    :', h.cle, '=', h.valeur, '(confidentiel)'); });
      console.log('  URL visée  :', vue.baseUrl);

      // L'état actuel côté AWS. Il fait partie du plan : remplacer une connexion
      // existante n'est pas la même décision que d'en créer une.
      let existante = null;
      try {
        existante = await EB.decrire(connAws, cible.nom);
        console.log('  dans AWS   :', existante ? (existante.etat + ' — ' + existante.arn) : 'absente');
      } catch (e) {
        console.log('  dans AWS   : indéterminé —', e.name + ' : ' + e.message);
        if (/AccessDenied/.test(e.name || '')) {
          console.log('               (events:DescribeConnection refusé — droits pas encore élargis)');
        }
        code = 1;
        continue;
      }

      if (!appliquer) {
        console.log('  → ' + (existante ? 'serait REMPLACÉE' : 'serait CRÉÉE'));
        continue;
      }

      try {
        const res = await EB.deployer(connAws, cible.nom, params, cible.description);
        console.log('  ✅ ' + (res.cree ? 'créée' : 'remplacée') + ' :', res.arn);
        aRegler.push({ variable: cible.variable, uuid: res.uuid });
      } catch (e) {
        console.log('  ⛔', e.name + ' : ' + e.message);
        code = 1;
      }
    }

    if (aRegler.length) {
      titre('À reporter dans .env');
      console.log('  (l\'UUID est attribué par AWS et ne se devine pas)\n');
      console.log('  AWS_COMPTE=' + (champs.compte || ''));
      console.log('  AWS_REGION=' + (champs.region || ''));
      aRegler.forEach(function (l) { console.log('  ' + l.variable + '=' + l.uuid); });
      console.log('\n  Puis réémettre les définitions : node scripts/emettre-asl.js <idFlux>');
    } else if (!appliquer) {
      titre('Fin du plan');
      console.log('  Rien n\'a été écrit. Pour soumettre : --appliquer');
    }
  } catch (e) {
    console.error('\n⛔ ' + (e.name || 'Erreur') + ' — ' + e.message);
    code = 1;
  }

  await prisma.$disconnect();
  process.exitCode = code;
})();
