// APS — server/routes/soumission.js — créé le 2026-08-14
// ================================================================
// LE SECOND GESTE. L'Interpréteur montre depuis le 2026-08-11 ce qu'un workflow
// deviendrait chez une cible — « un plan, au sens de terraform plan : lire et
// approuver d'abord, soumettre ensuite ». Le premier geste existait ; celui-ci
// manquait, et il fallait passer par la console AWS pour le poser.
//
//   POST /api/builder-flows/:id/soumission   { cible: 'asl' }
//   POST /api/builder-flows/:id/execution    { arn, entree }
//   GET  /api/executions?arn=…               statut et événements d'échec
//
// ── DÉPOSER ET LANCER SONT DEUX ACTES, PAS UN ───────────────────
// Déposer une définition ne coûte rien et ne touche personne. La LANCER appelle
// Iconik et le partenaire pour de vrai — sur PUBLISH, elle écrit. Les deux ne
// peuvent donc pas vivre derrière le même bouton, et surtout pas derrière le
// même « oui ».
//
// ── ACCEPTÉ N'EST PAS VALIDE ────────────────────────────────────
// La règle du 2026-08-13, à ne jamais laisser l'écran contredire : un dépôt
// réussi n'est pas un workflow qui marche. La réponse porte donc les contrôles
// de l'émetteur (références sans porteur, états inatteignables) même quand AWS
// a dit oui — c'est exactement le cas où la console rassure à tort.
// ================================================================
'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { getOrgContext } = require('../lib/org-context');
const SFN = require('../lib/sfn-service.js');
const Lambda = require('../lib/lambda-service.js');
const Dynamo = require('../lib/dynamodb-service.js');
const Fonctions = require('../../scripts/emettre-fonctions.js');
const { construire } = require('../../scripts/emettre-asl.js');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Le nom d'une machine d'états n'accepte ni espace ni barre verticale, et nos
// workflows s'appellent « BAYARD | PUBLISH | VODFACTORY ». On translittère
// plutôt que de demander à l'utilisateur un second nom : deux noms pour un même
// objet, c'est une correspondance à tenir à jour de tête.
function nomDeMachine(nomFlux) {
  const net = String(nomFlux || 'workflow')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accents
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 74);
  return 'APS-' + (net || 'workflow');
}

// La connexion qui porte la clé du compte. Une seule est attendue par
// organisation ; s'il y en avait plusieurs, la première active fait foi et la
// réponse le dit plutôt que de choisir en silence.
async function connexionAws(req) {
  const ctx = await getOrgContext(req, prisma);
  const ou = { authType: 'aws_sigv4', isActive: true };
  if (ctx.orgId) ou.orgId = ctx.orgId;
  const liste = await prisma.connexion.findMany({ where: ou, orderBy: { createdAt: 'asc' } });
  return { connexion: liste[0] || null, plusieurs: liste.length > 1 };
}

// ── Le plan ─────────────────────────────────────────────────────
// Ce que la soumission CRÉERA chez la cible, et ce qu'elle laissera tranquille.
// Quatre natures d'objets, et l'écran doit pouvoir les annoncer avant qu'on
// clique : une machine d'états seule ne dit rien des fonctions et des tables
// qu'elle suppose, et découvrir qu'on a créé une table en production après coup
// n'est pas une bonne surprise.

router.get('/builder-flows/:id/soumission/plan', async (req, res) => {
  try {
    const flux = await prisma.builderFlow.findUnique({ where: { id: req.params.id } });
    if (!flux) return res.status(404).json({ error: 'Workflow non trouvé' });

    const { connexion } = await connexionAws(req);
    if (!connexion) return res.status(400).json({ error: 'Aucune connexion AWS active' });

    const inv = await Fonctions.inventaire(req.params.id);
    const nom = nomDeMachine(flux.name);

    // L'état RÉEL chez la cible : exister ou non change la décision, pas
    // seulement le libellé.
    const machine = await SFN.trouverParNom(connexion, nom);
    const fonctions = [];
    for (const f of inv.fonctions) {
      const etat = await Lambda.decrire(connexion, f.nom).catch(function () { return null; });
      fonctions.push({ nom: f.nom, dit: f.dit || null, connue: f.connue, existe: !!etat });
    }
    const tables = [];
    for (const t of inv.tables) {
      const etat = await Dynamo.decrire(connexion, t.nom).catch(function () { return null; });
      tables.push({ nom: t.nom, dit: t.dit || null, existe: !!etat, elements: etat ? etat.elements : 0 });
    }

    // La graine, comptée avant d'être proposée : c'est le chiffre qui fait
    // comprendre pourquoi une table vide n'est pas une table neutre.
    let graine = null;
    if (tables.length) {
      const registre = await prisma.bayardRegistry.count();
      let compteurs = 0;
      try {
        const r = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "ApsCounter"');
        compteurs = (r && r[0] && r[0].n) || 0;
      } catch (_) { /* la table peut ne pas exister */ }
      graine = { registre, compteurs };
    }

    res.json({ ok: true, machine: { nom, existe: !!machine },
               fonctions, tables, graine });
  } catch (e) {
    res.status(500).json({ error: (e && e.name ? e.name + ' — ' : '') + (e && e.message || String(e)) });
  }
});

// ── Déposer ─────────────────────────────────────────────────────

router.post('/builder-flows/:id/soumission', async (req, res) => {
  try {
    const cible = String((req.body && req.body.cible) || 'asl').toLowerCase();
    if (cible !== 'asl') {
      return res.status(400).json({ error: 'Seule la cible « asl » sait être soumise pour l\'instant' });
    }

    const flux = await prisma.builderFlow.findUnique({ where: { id: req.params.id } });
    if (!flux) return res.status(404).json({ error: 'Workflow non trouvé' });

    const { connexion, plusieurs } = await connexionAws(req);
    if (!connexion) {
      return res.status(400).json({
        error: 'Aucune connexion AWS active. Administration → Connexions, type d\'authentification « AWS Signature V4 ».' });
    }

    // L'émission passe par le MÊME code que la ligne de commande. Une seconde
    // implémentation aurait divergé de la première au premier correctif — c'est
    // la raison qui a déjà été écrite pour la table de correspondance.
    const emis = await construire(req.params.id);
    const nom  = nomDeMachine(flux.name);

    // ── CE QUE LA MACHINE SUPPOSE, DÉPOSÉ D'ABORD ─────────────
    // Une définition qui appelle une fonction absente se dépose sans broncher
    // et échoue au premier run. On crée donc ce qui manque AVANT — tables,
    // graine, rôle, fonctions — puis la machine d'états.
    //
    // L'ordre entre les trois premières n'est pas libre : le rôle référence les
    // ARN des tables, et une fonction ne se crée pas sans son rôle.
    const supports = { tables: [], graine: null, fonctions: [] };
    const inv = await Fonctions.inventaire(req.params.id);
    if (inv.fonctions.length) {
      const noms = inv.fonctions.filter(f => f.connue).map(f => f.nom);
      const tables = inv.tables.map(t => t.nom);

      for (const t of tables) {
        const r = await Dynamo.assurerTable(connexion, t);
        supports.tables.push({ nom: t, cree: r.creee });
      }

      // La graine juste après les tables : une table créée puis laissée vide,
      // même quelques minutes, c'est une fenêtre pendant laquelle un run
      // redistribuerait des identifiants que le client utilise déjà.
      if (tables.length) {
        const registre = await prisma.bayardRegistry.findMany();
        let compteurs = [];
        try {
          compteurs = await prisma.$queryRawUnsafe('SELECT "scope","key","value","updatedAt" FROM "ApsCounter"');
        } catch (_) { /* la table peut ne pas exister côté APS */ }
        const a = await Dynamo.semerRegistre(connexion, registre);
        const b = await Dynamo.semerCompteurs(connexion, compteurs);
        supports.graine = { registre: a, compteurs: b };
      }

      const roleArn = await Lambda.assurerRole(connexion, tables);
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-fn-'));
      try {
        Fonctions.ecrire(noms, dossier);
        for (const f of noms) {
          const r = await Lambda.deployer(connexion, f, path.join(dossier, f), {
            roleArn: roleArn,
            variables: tables.length
              ? { APS_TABLE_REGISTRY: Dynamo.REGISTRE, APS_TABLE_COUNTER: Dynamo.COMPTEUR }
              : undefined,
          });
          supports.fonctions.push({ nom: f, cree: r.cree });
        }
      } finally {
        fs.rmSync(dossier, { recursive: true, force: true });
      }
    }

    // CE QU'AWS EN PENSE, avant de déposer. Ses avertissements ne bloquent rien
    // et ne remontent PAS de l'API de création : sans cet appel, ils n'existent
    // que pour qui ouvre la console — or ce sont exactement ceux qui comptent,
    // puisqu'ils laissent passer le dépôt et font échouer le run.
    let avis = { diagnostics: [] };
    try { avis = await SFN.valider(connexion, emis.definition); } catch (_) { /* non bloquant */ }

    const depot = await SFN.deployer(connexion, nom, emis.definition);

    res.json({
      ok: true,
      nom: nom,
      arn: depot.arn,
      cree: depot.cree,
      etats: emis.compte(emis.definition.States),
      // Ce qu'AWS ne dira jamais, et qu'un dépôt réussi peut masquer.
      problemes: emis.problemes || [],
      sansPorteur: emis.sansPorteur || [],
      generiques: ((emis.ctx && emis.ctx.generiques) || []).length
                + (emis.corpsGeneriques || []).length,
      supports: supports,
      avisAws: avis.diagnostics,
      plusieursConnexions: plusieurs
    });
  } catch (e) {
    res.status(500).json({ error: (e && e.name ? e.name + ' — ' : '') + (e && e.message || String(e)) });
  }
});

// ── Lancer ──────────────────────────────────────────────────────

router.post('/builder-flows/:id/execution', async (req, res) => {
  try {
    const arn = String((req.body && req.body.arn) || '');
    if (!arn) return res.status(400).json({ error: 'ARN de machine d\'états manquant' });

    const { connexion } = await connexionAws(req);
    if (!connexion) return res.status(400).json({ error: 'Aucune connexion AWS active' });

    const lance = await SFN.lancer(connexion, arn, (req.body && req.body.entree) || {});
    res.json({ ok: true, arn: lance.arn, demarree: lance.demarree });
  } catch (e) {
    res.status(500).json({ error: (e && e.name ? e.name + ' — ' : '') + (e && e.message || String(e)) });
  }
});

// ── Suivre ──────────────────────────────────────────────────────
// Interrogé, pas poussé : une exécution ASL n'a pas d'équivalent du flux
// d'événements du moteur natif. L'écran repasse tant que le statut est RUNNING.

router.get('/executions', async (req, res) => {
  try {
    const arn = String(req.query.arn || '');
    if (!arn) return res.status(400).json({ error: 'ARN d\'exécution manquant' });

    const { connexion } = await connexionAws(req);
    if (!connexion) return res.status(400).json({ error: 'Aucune connexion AWS active' });

    const etat = await SFN.etat(connexion, arn);
    const reponse = { ok: true, statut: etat.statut, demarree: etat.demarree,
                      terminee: etat.terminee, sortie: etat.sortie,
                      erreur: etat.erreur, cause: etat.cause, echecs: [] };

    // Les événements ne se lisent QUE sur un échec : sur une exécution longue,
    // l'historique complet est volumineux et ne dit rien qu'on ne sache déjà.
    if (etat.statut && etat.statut !== 'RUNNING' && etat.statut !== 'SUCCEEDED') {
      const evs = await SFN.historique(connexion, arn, { recentDabord: true, max: 40 });
      reponse.echecs = evs.filter(function (e) { return /Failed|Aborted|TimedOut/.test(e.type); })
                          .slice(0, 8);
    }
    res.json(reponse);
  } catch (e) {
    res.status(500).json({ error: (e && e.name ? e.name + ' — ' : '') + (e && e.message || String(e)) });
  }
});

module.exports = router;
