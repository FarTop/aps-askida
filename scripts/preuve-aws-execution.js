// APS — scripts/preuve-aws-execution.js — créé le 2026-08-14
// ================================================================
// La PREUVE que la chaîne AWS tient debout de bout en bout, depuis APS et sans
// passer par la console. Elle échoue depuis le 2026-08-13 sur un seul point :
// la relation d'approbation du rôle `APS-StepFunctions-Execution` n'autorisait
// pas `states.amazonaws.com` à l'endosser. L'erreur ne surgit qu'au LANCEMENT,
// jamais au dépôt — d'où ce script, qui va jusqu'au bout.
//
//   node scripts/preuve-aws-execution.js              lit et diagnostique
//   node scripts/preuve-aws-execution.js --corriger   répare la relation d'approbation
//   node scripts/preuve-aws-execution.js --lancer     dépose la sonde et l'exécute
//
// Les trois s'enchaînent : `--lancer` fait tout ce que fait `--corriger`.
//
// ── POURQUOI CETTE SONDE-LÀ ─────────────────────────────────────
// `scripts/sonde-auth.json` : trois états, UN appel en lecture seule sur
// /API/users/v1/users/current/, l'ARN RÉEL de la connexion `aps-iconik`. Elle
// ne laisse rien derrière elle, et si elle rate c'est l'IAM et rien d'autre.
//
// Ne PAS lui substituer `sonde-jsonata.json` ni `sonde-asl.json` : leurs ARN de
// connexion sont l'UUID de zéros, elles existent pour faire valider une FORME
// par la console, pas pour s'exécuter. Ni `_journaux/asl-publish.json` (65
// états), jamais soumise : un échec y serait ambigu. On isole la variable.
//
// ── ACCEPTÉ N'EST PAS VALIDE ────────────────────────────────────
// La règle du 2026-08-13. Un dépôt réussi ne prouve rien : la console avait dit
// oui à une définition dont l'ARN de connexion était un UUID de zéros. Seul un
// statut d'exécution SUCCEEDED est un verdict.
// ================================================================
'use strict';
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const fs   = require('fs');
const path = require('path');
const SFN  = require('../server/lib/sfn-service.js');
const { decrypt } = require('../server/lib/crypto.js');
const { IAMClient, GetRoleCommand, UpdateAssumeRolePolicyCommand,
        CreateRoleCommand, PutRolePolicyCommand } = require('@aws-sdk/client-iam');

const ID_CONNEXION = 'cmsrwrp0g001pv0v4a0kjqzw7';   // AWS | ASKIDA | STEP FUNCTIONS
const NOM_MACHINE  = 'APS-sonde-formes';
const SONDE        = path.join(__dirname, 'sonde-auth.json');

const args     = process.argv.slice(2);
const corriger = args.includes('--corriger') || args.includes('--lancer');
const lancer   = args.includes('--lancer');

function titre(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

// La politique d'approbation attendue. La condition sur aws:SourceAccount est
// la parade AWS au « problème du député confus » : sans elle, n'importe quelle
// machine d'états d'un autre compte pourrait demander à endosser ce rôle.
function politiqueAttendue(compte) {
  return {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'states.amazonaws.com' },
      Action: 'sts:AssumeRole',
      Condition: { StringEquals: { 'aws:SourceAccount': compte } }
    }]
  };
}

// Ce que le rôle doit POUVOIR FAIRE, par opposition à qui peut l'endosser. Un
// `http:invoke` ne part pas sans les trois : appeler un point HTTP, retirer les
// identifiants de la connexion EventBridge, et lire le secret que cette
// connexion a fabriqué dans Secrets Manager. Reprise du document 2 de
// `_journaux/iam-politiques-a-appliquer-2026-08-13.md`, réduit à ce dont le
// RÔLE a besoin — le reste de ce document concerne notre propre identité.
function politiqueDExecution(compte, region) {
  return {
    Version: '2012-10-17',
    Statement: [
      { Sid: 'AppelerDesApisHttp', Effect: 'Allow',
        Action: 'states:InvokeHTTPEndpoint', Resource: '*' },
      { Sid: 'RetirerLesIdentifiantsDesConnexions', Effect: 'Allow',
        Action: 'events:RetrieveConnectionCredentials',
        Resource: 'arn:aws:events:' + region + ':' + compte + ':connection/*' },
      { Sid: 'LireLesSecretsQueLesConnexionsFabriquent', Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        Resource: 'arn:aws:secretsmanager:' + region + ':' + compte + ':secret:events!connection/*' },
      // Anticipé : les verbes marqués `lambda` dans rendre-asl.js sortiront en
      // Task pointant une fonction `aps-*`. Rien ne les invoque encore.
      { Sid: 'AppelerNosLambdas', Effect: 'Allow',
        Action: 'lambda:InvokeFunction',
        Resource: 'arn:aws:lambda:' + region + ':' + compte + ':function:aps-*' }
    ]
  };
}

// Le service autorisé y est-il déjà ? On lit la politique telle qu'AWS la rend
// (JSON encodé en URL) sans présumer de sa forme : Principal.Service peut être
// une chaîne ou un tableau, et il peut y avoir plusieurs Statement.
function autoriseStepFunctions(politique) {
  const statements = [].concat(politique.Statement || []);
  return statements.some(function (s) {
    if (!s || s.Effect !== 'Allow') return false;
    const actions  = [].concat(s.Action || []);
    const services = [].concat((s.Principal && s.Principal.Service) || []);
    return services.indexOf('states.amazonaws.com') !== -1 &&
           actions.some(function (a) { return a === 'sts:AssumeRole' || a === 'sts:*'; });
  });
}

(async function () {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let code = 0;

  try {
    // ── 1. La connexion ─────────────────────────────────────────
    titre('La connexion');
    const conn = await prisma.connexion.findUnique({ where: { id: ID_CONNEXION } });
    if (!conn) throw new Error('connexion ' + ID_CONNEXION + ' introuvable en base');

    const diag = SFN.diagnostic(conn);
    console.log('  nom        :', conn.name);
    console.log('  active     :', conn.isActive ? 'oui' : 'NON');
    console.log('  compte     :', diag.compte || '(absent)');
    console.log('  région     :', diag.region || '(absente)');
    console.log('  rôle       :', diag.roleExecution || '(absent)');
    if (!diag.pret) {
      console.log('\n  ⛔ ' + diag.manque.join(', '));
      console.log('     → Administration → Connexions → « ' + conn.name + ' »');
      process.exitCode = 1;
      await prisma.$disconnect();
      return;
    }
    console.log('  identifiants : présents (secret chiffré en base)');

    const champs = (conn.extraConfig && conn.extraConfig.champs) || {};
    const creds  = { accessKeyId: champs.accessKeyId, secretAccessKey: decrypt(conn.authValueEnc) };
    const nomRole = String(diag.roleExecution).split('/').pop();

    // ── 2. La relation d'approbation ────────────────────────────
    titre('La relation d\'approbation du rôle');
    const iam = new IAMClient({ region: diag.region, credentials: creds });
    console.log('  rôle       :', nomRole);

    // Trois états à ne pas confondre, et c'est la confusion du 2026-08-13 :
    // le rôle peut être ABSENT, présent mais MAL APPROUVÉ, ou bon. AWS répond
    // la même chose à l'exécution dans les deux premiers cas — « le principal
    // n'est pas autorisé à endosser le rôle fourni » —, si bien qu'on a passé
    // la soirée à réécrire la relation d'approbation d'un rôle qui n'existait
    // pas. On distingue ici, avant de lancer quoi que ce soit.
    let existe = false, ok = false;
    try {
      const res = await iam.send(new GetRoleCommand({ RoleName: nomRole }));
      existe = true;
      const brut = res.Role && res.Role.AssumeRolePolicyDocument;
      const politique = JSON.parse(decodeURIComponent(brut || '{}'));
      ok = autoriseStepFunctions(politique);
      console.log('  existe     : ✅ oui');
      console.log('  approuve states.amazonaws.com :', ok ? '✅ oui' : '❌ non');
      if (!ok) console.log('  politique lue :', JSON.stringify(politique));
    } catch (e) {
      if (e && e.name === 'NoSuchEntityException') {
        console.log('  existe     : ❌ NON — aucun rôle de ce nom dans le compte');
      } else {
        console.log('  ⚠️  lecture impossible :', e.name + ' — ' + e.message);
        code = 1;
      }
    }

    if (!ok && corriger) {
      try {
        if (!existe) {
          await iam.send(new CreateRoleCommand({
            RoleName: nomRole,
            // IAM n'accepte ici que de l'ASCII imprimable et du latin-1. Les
            // accents passent, le tiret cadratin non : il a coute un essai.
            Description: 'Role d\'execution des machines d\'etats APS, cree par preuve-aws-execution.js',
            AssumeRolePolicyDocument: JSON.stringify(politiqueAttendue(diag.compte))
          }));
          console.log('  ✅ rôle créé');
        } else {
          await iam.send(new UpdateAssumeRolePolicyCommand({
            RoleName: nomRole,
            PolicyDocument: JSON.stringify(politiqueAttendue(diag.compte))
          }));
          console.log('  ✅ relation d\'approbation réécrite');
        }
        // Idempotent : réécrit la politique en place, qu'elle existe ou non.
        await iam.send(new PutRolePolicyCommand({
          RoleName: nomRole, PolicyName: 'APS-Execution',
          PolicyDocument: JSON.stringify(politiqueDExecution(diag.compte, diag.region))
        }));
        console.log('  ✅ politique d\'exécution posée (APS-Execution)');
        // IAM est cohérent à terme : un rôle tout juste créé peut être refusé
        // quelques secondes. Mieux vaut attendre ici que rendre un verdict faux.
        console.log('  ⏳ propagation IAM…');
        await new Promise(function (r) { setTimeout(r, 10000); });
        ok = true;
      } catch (e) {
        console.log('  ⛔ échec :', e.name + ' — ' + e.message);
        if (/AccessDenied/.test(e.name || '')) {
          console.log('     Lire le motif : « no permissions boundary allows » → élargir la');
          console.log('     frontière ; « no identity-based policy allows » → compléter le jeu.');
        }
        code = 1;
      }
    } else if (!ok) {
      console.log('  → relancer avec --corriger pour ' + (existe ? 'la réécrire' : 'créer le rôle'));
    }

    if (!lancer) {
      titre('Fin (lecture seule)');
      console.log('  Pour aller au verdict : node scripts/preuve-aws-execution.js --lancer');
      await prisma.$disconnect();
      process.exitCode = code;
      return;
    }

    // Lancer avec un rôle inutilisable ne prouve rien : on connaît déjà la
    // réponse d'AWS, et l'échec ressemblerait à s'y méprendre à un défaut de la
    // définition. Le premier essai du 2026-08-14 est tombé dans ce trou.
    if (!ok) {
      titre('Arrêt avant le lancement');
      console.log('  Le rôle n\'est pas utilisable. Une exécution échouerait pour cette');
      console.log('  raison-là, et masquerait tout le reste. Rien n\'a été lancé.');
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }

    // ── 3. Le dépôt ─────────────────────────────────────────────
    titre('Le dépôt de la sonde');
    const definition = JSON.parse(fs.readFileSync(SONDE, 'utf8'));
    const depot = await SFN.deployer(conn, NOM_MACHINE, definition);
    console.log('  ' + (depot.cree ? 'créée' : 'remplacée') + ' :', depot.arn);
    console.log('  (accepté n\'est pas valide — ceci ne prouve encore rien)');

    // ── 4. Le verdict ───────────────────────────────────────────
    titre('L\'exécution');
    const exec = await SFN.lancer(conn, depot.arn, {});
    console.log('  lancée :', exec.arn);

    let etat;
    for (let i = 0; i < 60; i++) {
      await new Promise(function (r) { setTimeout(r, 1000); });
      etat = await SFN.etat(conn, exec.arn);
      if (etat.statut !== 'RUNNING') break;
    }

    console.log('  statut :', etat.statut);
    if (etat.statut === 'SUCCEEDED') {
      console.log('  sortie :', etat.sortie);
      titre('✅ VERDICT — la chaîne tient de bout en bout');
      console.log('  APS a déposé et exécuté une machine d\'états sans la console.');
    } else {
      console.log('  erreur :', etat.erreur || '(sans nom)');
      console.log('  cause  :', etat.cause || '(sans détail)');
      const evs = await SFN.historique(conn, exec.arn, { recentDabord: true, max: 20 });
      const echecs = evs.filter(function (e) { return /Failed|Aborted|TimedOut/.test(e.type); });
      if (echecs.length) {
        titre('Les événements d\'échec');
        echecs.slice(0, 5).forEach(function (e) {
          console.log('  ' + e.type + (e.etat ? ' [' + e.etat + ']' : ''));
          if (e.erreur) console.log('    erreur :', e.erreur);
          if (e.cause)  console.log('    cause  :', String(e.cause).slice(0, 400));
        });
      }
      code = 1;
    }
  } catch (e) {
    console.error('\n⛔ ' + (e.name || 'Erreur') + ' — ' + e.message);
    code = 1;
  }

  await prisma.$disconnect();
  process.exitCode = code;
})();
