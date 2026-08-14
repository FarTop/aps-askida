/**
 * sfn-service.js — Service AWS Step Functions du Builder — créé le 2026-08-14
 *
 * La pièce n°2 des trois qui manquaient pour qu'APS crée et lance lui-même les
 * machines d'états (la n°1 était la clé, la n°3 est le bouton « Soumettre » de
 * l'Interpréteur). Jusqu'ici l'émetteur produisait un fichier JSON que l'on
 * collait à la main dans la console AWS ; ce service ferme l'aller-retour.
 *
 * Modelé sur s3-service.js : le SDK officiel signe (rien de SigV4 à écrire à la
 * main), le service résout une connexion de l'organisation, déchiffre son
 * secret via le module crypto partagé, et n'expose jamais les credentials.
 *
 * ── OÙ VIVENT LES IDENTIFIANTS ──────────────────────────────────
 * PAS comme s3-service.js, et c'est délibéré. S3 range tout dans un JSON
 * chiffré unique ({key, secret, region, bucket}) — forme antérieure au partage
 * arrêté le 2026-08-10 dans connexion-acces.js :
 *   - le SCHÉMA appartient au produit        → Platform.authSpec
 *   - le SECRET appartient à la connexion    → Connexion.authValueEnc (chiffré)
 *   - les valeurs non secrètes               → Connexion.extraConfig.champs
 * On suit la forme courante : `compte`, `region`, `accessKeyId` et
 * `roleExecution` sont en clair dans extraConfig.champs, seul le
 * `secretAccessKey` est chiffré. Un lecteur peut donc voir de quel compte et de
 * quelle région il s'agit sans déchiffrer quoi que ce soit.
 *
 * ── ACCEPTÉ N'EST PAS VALIDE ────────────────────────────────────
 * La règle qui a servi dix fois le 2026-08-13 : la console a accepté une
 * définition dont l'ARN de connexion était un UUID de zéros. `deployer()` ne
 * prouve donc RIEN sur le fond — seul `lancer()` suivi de `etat()` le fait.
 * Ne jamais rapporter « déployé » comme un verdict d'exécution.
 */

'use strict';

const {
  SFNClient,
  CreateStateMachineCommand,
  UpdateStateMachineCommand,
  ListStateMachinesCommand,
  DescribeStateMachineCommand,
  StartExecutionCommand,
  DescribeExecutionCommand,
  GetExecutionHistoryCommand
} = require('@aws-sdk/client-sfn');
const { decrypt } = require('./crypto');

// ── Résolution de la connexion ──────────────────────────────────

// Construit un client Step Functions à partir d'une connexion (objet Prisma
// Connexion). Renvoie { client, region, compte, roleExecution } ou lève une
// erreur explicite — le message nomme le champ manquant, parce que la moitié
// des allers-retours du 2026-08-13 venaient d'un champ vide parti tel quel.
function _clientDepuisConnexion(conn) {
  if (!conn) throw new Error('connexion Step Functions introuvable');

  const champs = (conn.extraConfig && conn.extraConfig.champs) || {};
  const region        = champs.region || '';
  const compte        = champs.compte || '';
  const roleExecution = champs.roleExecution || '';
  const accessKeyId   = champs.accessKeyId || '';

  let secretAccessKey = '';
  try { secretAccessKey = decrypt(conn.authValueEnc) || ''; } catch (_) { secretAccessKey = ''; }

  if (!region)          throw new Error('région AWS manquante sur la connexion');
  if (!accessKeyId)     throw new Error('Access Key ID manquant sur la connexion');
  if (!secretAccessKey) throw new Error('Secret Access Key manquant sur la connexion');

  const client = new SFNClient({ region, credentials: { accessKeyId, secretAccessKey } });
  return { client, region, compte, roleExecution };
}

// Les champs requis renseignés ? Sert au bouton « Tester » et à l'Interpréteur,
// qui doivent pouvoir dire ce qui manque SANS tenter un appel réseau.
function diagnostic(conn) {
  try {
    const { region, compte, roleExecution } = _clientDepuisConnexion(conn);
    return { pret: !!roleExecution, region, compte, roleExecution,
             manque: roleExecution ? [] : ['Rôle d\'exécution'] };
  } catch (e) {
    return { pret: false, manque: [e.message] };
  }
}

// ── Lecture ─────────────────────────────────────────────────────

/**
 * Cherche une machine d'états par son NOM (l'API ne sait interroger que par
 * ARN ; il faut donc parcourir). Renvoie son ARN ou null.
 */
async function trouverParNom(conn, nom) {
  const { client } = _clientDepuisConnexion(conn);
  let jeton;
  do {
    const res = await client.send(new ListStateMachinesCommand({ maxResults: 100, nextToken: jeton }));
    const trouve = (res.stateMachines || []).find(function (m) { return m.name === nom; });
    if (trouve) return trouve.stateMachineArn;
    jeton = res.nextToken;
  } while (jeton);
  return null;
}

/** Liste les machines d'états du compte : [{ nom, arn, type, creee }]. */
async function lister(conn) {
  const { client } = _clientDepuisConnexion(conn);
  const sortie = [];
  let jeton;
  do {
    const res = await client.send(new ListStateMachinesCommand({ maxResults: 100, nextToken: jeton }));
    (res.stateMachines || []).forEach(function (m) {
      sortie.push({ nom: m.name, arn: m.stateMachineArn, type: m.type, creee: m.creationDate });
    });
    jeton = res.nextToken;
  } while (jeton);
  return sortie;
}

/** Définition et rôle actuels d'une machine d'états, par ARN. */
async function decrire(conn, arn) {
  const { client } = _clientDepuisConnexion(conn);
  const res = await client.send(new DescribeStateMachineCommand({ stateMachineArn: arn }));
  return {
    nom: res.name, arn: res.stateMachineArn, type: res.type, statut: res.status,
    roleArn: res.roleArn, definition: res.definition
  };
}

// ── Écriture ────────────────────────────────────────────────────

/**
 * Dépose une définition sous un nom : crée si elle n'existe pas, remplace
 * sinon. C'est ce que fera le bouton « Soumettre » de l'Interpréteur.
 *
 * @param {object} conn        connexion Step Functions (Prisma)
 * @param {string} nom         nom de la machine d'états
 * @param {object|string} definition  définition ASL (objet ou JSON déjà sérialisé)
 * @param {object} [options]   { roleArn, type: 'STANDARD'|'EXPRESS' }
 * @returns {Promise<{ arn, cree }>}  `cree` distingue création et remplacement
 */
async function deployer(conn, nom, definition, options) {
  const opts = options || {};
  const { client, roleExecution } = _clientDepuisConnexion(conn);
  const roleArn = opts.roleArn || roleExecution;
  if (!roleArn) throw new Error('ARN du rôle d\'exécution manquant');

  const texte = typeof definition === 'string' ? definition : JSON.stringify(definition);
  const existant = await trouverParNom(conn, nom);

  if (existant) {
    await client.send(new UpdateStateMachineCommand({
      stateMachineArn: existant, definition: texte, roleArn: roleArn
    }));
    return { arn: existant, cree: false };
  }

  const res = await client.send(new CreateStateMachineCommand({
    name: nom, definition: texte, roleArn: roleArn, type: opts.type || 'STANDARD'
  }));
  return { arn: res.stateMachineArn, cree: true };
}

// ── Exécution ───────────────────────────────────────────────────

/**
 * Lance une exécution. C'est ICI que la relation d'approbation du rôle se
 * vérifie : l'erreur « The principal states.amazonaws.com is not authorized to
 * assume the provided role » ne surgit qu'au lancement, jamais au dépôt.
 */
async function lancer(conn, arnMachine, entree, nomExecution) {
  const { client } = _clientDepuisConnexion(conn);
  const res = await client.send(new StartExecutionCommand({
    stateMachineArn: arnMachine,
    name: nomExecution || undefined,
    input: JSON.stringify(entree === undefined ? {} : entree)
  }));
  return { arn: res.executionArn, demarree: res.startDate };
}

/** État d'une exécution : RUNNING | SUCCEEDED | FAILED | TIMED_OUT | ABORTED. */
async function etat(conn, arnExecution) {
  const { client } = _clientDepuisConnexion(conn);
  const res = await client.send(new DescribeExecutionCommand({ executionArn: arnExecution }));
  return {
    statut: res.status, demarree: res.startDate, terminee: res.stopDate,
    entree: res.input, sortie: res.output,
    erreur: res.error || null, cause: res.cause || null
  };
}

/**
 * Historique d'une exécution, réduit à ce qui se lit : l'état concerné, le type
 * d'événement, et le détail d'échec quand il y en a un. C'est la matière du
 * retour du run dans le Builder — l'équivalent des badges de nœuds du moteur
 * natif, côté AWS.
 */
async function historique(conn, arnExecution, options) {
  const opts = options || {};
  const { client } = _clientDepuisConnexion(conn);
  const evenements = [];
  let jeton;
  do {
    const res = await client.send(new GetExecutionHistoryCommand({
      executionArn: arnExecution, maxResults: 100, nextToken: jeton,
      reverseOrder: !!opts.recentDabord, includeExecutionData: opts.avecDonnees !== false
    }));
    (res.events || []).forEach(function (ev) {
      const detail = ev.executionFailedEventDetails || ev.taskFailedEventDetails ||
                     ev.lambdaFunctionFailedEventDetails || ev.stateEnteredEventDetails ||
                     ev.stateExitedEventDetails || null;
      evenements.push({
        id: ev.id, type: ev.type, quand: ev.timestamp,
        etat: (detail && detail.name) || null,
        erreur: (detail && detail.error) || null,
        cause: (detail && detail.cause) || null
      });
    });
    jeton = res.nextToken;
  } while (jeton && evenements.length < (opts.max || 1000));
  return evenements;
}

module.exports = {
  diagnostic, trouverParNom, lister, decrire,
  deployer, lancer, etat, historique
};
