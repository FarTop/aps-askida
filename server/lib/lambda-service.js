/**
 * lambda-service.js — Déposer les fonctions chez la cible — créé le 2026-08-14
 *
 * Pendant de sfn-service.js et eventbridge-service.js, même contrat : créer ce
 * qui manque, remplacer ce qui existe, ne jamais toucher au reste.
 *
 * ── POURQUOI APS DÉPOSE DU CODE ─────────────────────────────────
 * Parce que l'Interpréteur promet de traduire un workflow vers une cible, et
 * qu'une traduction incomplète n'est pas une traduction. Ce que la cible ne
 * sait pas faire nativement, APS le lui donne — sans quoi il faudrait un
 * développeur à côté de l'outil, et l'outil ne servirait plus à rien.
 *
 * Ce qui part doit ensuite VIVRE SANS APS : c'est l'arbitrage du 2026-08-14.
 * Le jour où la mission s'arrête, le client garde des fonctions autonomes et
 * leurs tables, pas une dépendance vers un serveur qu'on aura éteint.
 *
 * ── LE RÔLE D'EXÉCUTION ─────────────────────────────────────────
 * Une Lambda ne tourne pas sans rôle. On le crée si besoin, avec le strict
 * nécessaire : écrire ses journaux, lire les deux tables, et lire le secret
 * d'une connexion EventBridge. Rien sur Iconik ni sur le partenaire — ces
 * appels-là sortent en HTTP avec le jeton de la connexion, pas avec l'identité
 * AWS.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand, GetFunctionCommand,
} = require('@aws-sdk/client-lambda');
const {
  IAMClient, GetRoleCommand, CreateRoleCommand, PutRolePolicyCommand,
} = require('@aws-sdk/client-iam');
const { decrypt } = require('./crypto');

const ROLE = 'APS-Lambda-Execution';
// Le runtime fournit le SDK AWS v3 : rien à empaqueter, donc une archive qui ne
// contient que du code d'APS — relisible par le client, ce qui compte quand la
// livraison doit lui survivre.
const RUNTIME = 'nodejs20.x';

function _identifiants(conn) {
  if (!conn) throw new Error('connexion AWS introuvable');
  const champs = (conn.extraConfig && conn.extraConfig.champs) || {};
  let secret = '';
  try { secret = decrypt(conn.authValueEnc) || ''; } catch (_) { secret = ''; }
  if (!champs.region)      throw new Error('région AWS manquante sur la connexion');
  if (!champs.accessKeyId) throw new Error('Access Key ID manquant sur la connexion');
  if (!secret)             throw new Error('Secret Access Key manquant sur la connexion');
  return {
    region: champs.region, compte: champs.compte || '',
    credentials: { accessKeyId: champs.accessKeyId, secretAccessKey: secret },
  };
}

// ── L'archive ───────────────────────────────────────────────────

// Un dossier plat en zip. Les fonctions n'ont pas de sous-dossiers : le
// handler et ses compagnons voisinent, pour que `require('./…')` résolve.
function archiver(dossier) {
  const zip = new AdmZip();
  fs.readdirSync(dossier).forEach(function (f) {
    const p = path.join(dossier, f);
    if (fs.statSync(p).isFile()) zip.addLocalFile(p);
  });
  return zip.toBuffer();
}

// ── Le rôle ─────────────────────────────────────────────────────

async function assurerRole(conn, tables) {
  const { region, compte, credentials } = _identifiants(conn);
  const iam = new IAMClient({ region, credentials });
  const arn = 'arn:aws:iam::' + compte + ':role/' + ROLE;

  try {
    await iam.send(new GetRoleCommand({ RoleName: ROLE }));
  } catch (e) {
    if (e.name !== 'NoSuchEntityException') throw e;
    await iam.send(new CreateRoleCommand({
      RoleName: ROLE,
      // Latin-1 seulement, et pas de tiret cadratin : IAM refuse — appris le
      // 2026-08-14 sur le rôle des machines d'états.
      Description: 'Role d execution des fonctions APS, cree par lambda-service.js',
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' },
                      Action: 'sts:AssumeRole' }],
      }),
    }));
  }

  // Réécrite à chaque dépôt : la liste des tables peut grandir, et une
  // politique en retard se manifeste par un AccessDenied au run, c'est-à-dire
  // au pire moment.
  const ressourcesTables = (tables || []).flatMap(function (t) {
    const base = 'arn:aws:dynamodb:' + region + ':' + compte + ':table/' + t;
    return [base, base + '/index/*'];
  });
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE, PolicyName: 'APS-Fonctions',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Sid: 'Journaux', Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: 'arn:aws:logs:' + region + ':' + compte + ':*' },
        ...(ressourcesTables.length ? [{
          Sid: 'LesDeuxTables', Effect: 'Allow',
          Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
          Resource: ressourcesTables,
        }] : []),
        // De quoi lire le secret d'une connexion EventBridge — c'est ainsi que
        // les fonctions s'authentifient chez Iconik et chez le partenaire,
        // plutôt que de recevoir un jeton dans leur charge utile.
        { Sid: 'LeSecretDesConnexions', Effect: 'Allow',
          Action: ['events:DescribeConnection'], Resource: '*' },
        { Sid: 'LireCeSecret', Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: 'arn:aws:secretsmanager:' + region + ':' + compte + ':secret:events!connection/*' },
        // Le listing S3 d'aps-essences. En lecture seule : APS ne touche pas
        // aux octets, la règle vaut aussi pour ce qu'il fait écrire aux autres.
        { Sid: 'ListerLesDepots', Effect: 'Allow',
          Action: ['s3:ListBucket', 's3:GetObject'], Resource: '*' },
      ],
    }),
  }));

  return arn;
}

// ── Déposer ─────────────────────────────────────────────────────

// Attendre qu'une fonction cesse d'être « en cours de mise à jour ». On lit son
// état plutôt que d'attendre une durée fixe : une archive de dix kilo-octets se
// stabilise en une seconde, et rien ne justifie d'en attendre dix.
async function _attendreStable(client, nom, secondes) {
  const fin = Date.now() + (secondes || 60) * 1000;
  while (Date.now() < fin) {
    try {
      const res = await client.send(new GetFunctionCommand({ FunctionName: nom }));
      const c = res.Configuration || {};
      if (c.LastUpdateStatus !== 'InProgress' && c.State !== 'Pending') return;
    } catch (e) {
      if (e.name === 'ResourceNotFoundException') return;
      throw e;
    }
    await new Promise(function (r) { setTimeout(r, 1000); });
  }
  throw new Error('aps : la fonction « ' + nom + ' » ne s\'est pas stabilisée à temps');
}

/** La fonction existe-t-elle ? Renvoie sa description ou null. */
async function decrire(conn, nom) {
  const { region, credentials } = _identifiants(conn);
  const client = new LambdaClient({ region, credentials });
  try {
    const res = await client.send(new GetFunctionCommand({ FunctionName: nom }));
    return { nom: nom, arn: res.Configuration.FunctionArn,
             runtime: res.Configuration.Runtime, modifiee: res.Configuration.LastModified };
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') return null;
    throw e;
  }
}

/**
 * Crée la fonction ou remplace son code.
 * @param {object} conn     connexion AWS (Prisma)
 * @param {string} nom      nom de la fonction (aps-…)
 * @param {string} dossier  dossier contenant index.js et ses compagnons
 * @param {object} [opts]   { roleArn, variables: {}, timeout }
 */
async function deployer(conn, nom, dossier, opts) {
  const o = opts || {};
  const { region, credentials } = _identifiants(conn);
  const client = new LambdaClient({ region, credentials });
  const code = archiver(dossier);

  const existante = await decrire(conn, nom);
  if (existante) {
    // AWS refuse deux mises à jour concurrentes sur une même fonction —
    // ResourceConflictException, « an update is in progress ». Ce n'est pas une
    // erreur mais un état transitoire : une fonction reste « en cours » quelques
    // secondes après chaque dépôt. On attend qu'elle se stabilise entre les
    // deux appels plutôt que de faire échouer toute la soumission.
    await _attendreStable(client, nom);
    await client.send(new UpdateFunctionCodeCommand({ FunctionName: nom, ZipFile: code }));
    if (o.variables) {
      await _attendreStable(client, nom);
      await client.send(new UpdateFunctionConfigurationCommand({
        FunctionName: nom, Environment: { Variables: o.variables },
      }));
    }
    await _attendreStable(client, nom);
    return { arn: existante.arn, cree: false };
  }

  const res = await client.send(new CreateFunctionCommand({
    FunctionName: nom,
    Runtime: RUNTIME,
    Role: o.roleArn,
    Handler: 'index.handler',
    Code: { ZipFile: code },
    // Généreux à dessein : aps-create-tree crée N collections en série, et
    // aps-verify interroge le partenaire essence par essence. Les trois
    // secondes par défaut ne suffiraient à ni l'une ni l'autre.
    Timeout: o.timeout || 120,
    MemorySize: 512,
    Environment: o.variables ? { Variables: o.variables } : undefined,
    Description: 'Fonction APS deposee par lambda-service.js',
  }));
  return { arn: res.FunctionArn, cree: true };
}

module.exports = { assurerRole, decrire, deployer, ROLE, RUNTIME };
