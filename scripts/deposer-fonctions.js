// APS — scripts/deposer-fonctions.js — créé le 2026-08-14
// ================================================================
// DÉPOSER chez la cible ce qu'un workflow réclame : les tables, leur graine,
// le rôle, les fonctions.
//
//   node scripts/deposer-fonctions.js <idFlux>              LE PLAN (défaut)
//   node scripts/deposer-fonctions.js <idFlux> --appliquer  crée ce qui manque
//
// Même règle que partout : on crée ce qui manque, on remplace le code de ce qui
// existe, on ne touche à rien d'autre. Et le plan se lit avant.
//
// ── L'ORDRE N'EST PAS ARBITRAIRE ────────────────────────────────
// Les tables d'abord, parce que le rôle référence leurs ARN ; le rôle ensuite,
// parce qu'une fonction ne se crée pas sans lui ; les fonctions en dernier. La
// GRAINE vient juste après les tables : une table créée puis laissée vide, même
// dix minutes, c'est une fenêtre pendant laquelle un run redistribuerait des
// identifiants déjà utilisés.
// ================================================================
'use strict';
require('dotenv').config();

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const Lambda = require('../server/lib/lambda-service.js');
const Dynamo = require('../server/lib/dynamodb-service.js');

const ID_AWS = 'cmsrwrp0g001pv0v4a0kjqzw7';   // AWS | ASKIDA | STEP FUNCTIONS
const ID = process.argv[2];
const APPLIQUER = process.argv.includes('--appliquer');

function titre(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

(async function () {
  if (!ID) { console.log('Usage : node scripts/deposer-fonctions.js <idFlux> [--appliquer]'); return; }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let code = 0;

  try {
    const conn = await prisma.connexion.findUnique({ where: { id: ID_AWS } });
    if (!conn) throw new Error('connexion AWS introuvable');
    const champs = (conn.extraConfig && conn.extraConfig.champs) || {};

    // On passe par l'émetteur : c'est lui qui sait ce qu'un workflow réclame,
    // et le redécider ici les ferait diverger.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-fn-'));
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath,
      [path.join(__dirname, 'emettre-fonctions.js'), ID, '--ecrire', dossier],
      { stdio: 'pipe' });

    const fonctions = fs.readdirSync(dossier)
      .filter(function (d) { return fs.statSync(path.join(dossier, d)).isDirectory(); });

    titre('Ce que ce workflow réclame');
    console.log('  compte :', champs.compte, '| région :', champs.region);
    console.log('  mode   :', APPLIQUER ? 'APPLICATION' : 'plan (rien ne sera créé)');
    if (!fonctions.length) {
      console.log('\n  ✅ aucune fonction — ce workflow est livrable tel quel.');
      await prisma.$disconnect();
      return;
    }
    console.log('  fonctions :', fonctions.join(', '));

    // Les tables ne sont réclamées que par les fonctions à état.
    const aEtat = fonctions.filter(function (f) { return f === 'aps-registry' || f === 'aps-create-tree'; });
    const tables = aEtat.length ? [Dynamo.REGISTRE, Dynamo.COMPTEUR] : [];

    // ── Les tables ──────────────────────────────────────────────
    if (tables.length) {
      titre('Les tables');
      for (const t of tables) {
        const etat = await Dynamo.decrire(conn, t);
        console.log('  ' + t.padEnd(14), etat ? (etat.etat + ' — ' + etat.elements + ' élément(s)') : 'ABSENTE');
        if (!APPLIQUER) { console.log('    → ' + (etat ? 'inchangée' : 'serait créée puis semée')); continue; }
        const r = await Dynamo.assurerTable(conn, t);
        if (r.creee) console.log('    ✅ créée');
      }

      // ── La graine ─────────────────────────────────────────────
      titre('La graine — ce qu\'APS transmet avant de se retirer');
      const registre = await prisma.bayardRegistry.findMany();
      let compteurs = [];
      try {
        compteurs = await prisma.$queryRawUnsafe('SELECT "scope","key","value","updatedAt" FROM "ApsCounter"');
      } catch (_) { /* la table peut ne pas exister encore côté APS */ }
      console.log('  registre  :', registre.length, 'identifiant(s) déjà attribué(s)');
      console.log('  compteurs :', compteurs.length, 'ligne(s)');
      if (!APPLIQUER) {
        console.log('\n  ⚠️  Sans cette graine, la cible redistribuerait des identifiants que');
        console.log('     le client utilise déjà. C\'est le point le plus coûteux à rattraper.');
      } else {
        const a = await Dynamo.semerRegistre(conn, registre);
        const b = await Dynamo.semerCompteurs(conn, compteurs);
        console.log('  ✅ registre  :', a.semees, 'semé(s),', a.deja, 'déjà là');
        console.log('  ✅ compteurs :', b.semees, 'semé(s),', b.deja, 'déjà là');
      }
    }

    // ── Le rôle ─────────────────────────────────────────────────
    titre('Le rôle d\'exécution');
    console.log('  ' + Lambda.ROLE);
    let roleArn = 'arn:aws:iam::' + champs.compte + ':role/' + Lambda.ROLE;
    if (APPLIQUER) {
      roleArn = await Lambda.assurerRole(conn, tables);
      console.log('  ✅', roleArn);
      // IAM est cohérent à terme : un rôle tout juste créé peut être refusé par
      // Lambda pendant quelques secondes. Mieux vaut attendre ici.
      console.log('  ⏳ propagation IAM…');
      await new Promise(function (r) { setTimeout(r, 10000); });
    } else {
      console.log('    → serait créé si absent, sa politique réécrite dans tous les cas');
    }

    // ── Les fonctions ───────────────────────────────────────────
    titre('Les fonctions');
    for (const f of fonctions) {
      const etat = await Lambda.decrire(conn, f);
      if (!APPLIQUER) {
        console.log('  ' + f.padEnd(18), etat ? 'présente — le code serait remplacé' : 'ABSENTE — serait créée');
        continue;
      }
      try {
        const r = await Lambda.deployer(conn, f, path.join(dossier, f), {
          roleArn: roleArn,
          variables: tables.length
            ? { APS_TABLE_REGISTRY: Dynamo.REGISTRE, APS_TABLE_COUNTER: Dynamo.COMPTEUR }
            : undefined,
        });
        console.log('  ✅ ' + f.padEnd(18) + (r.cree ? 'créée' : 'code remplacé'));
      } catch (e) {
        console.log('  ⛔ ' + f.padEnd(18) + e.name + ' : ' + e.message);
        code = 1;
      }
    }

    if (!APPLIQUER) {
      titre('Fin du plan');
      console.log('  Rien n\'a été créé. Pour soumettre : --appliquer');
    }
    fs.rmSync(dossier, { recursive: true, force: true });
  } catch (e) {
    console.error('\n⛔ ' + (e.name || 'Erreur') + ' — ' + e.message);
    code = 1;
  }

  await prisma.$disconnect();
  process.exitCode = code;
})();
