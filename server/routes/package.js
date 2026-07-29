// APS — server/routes/package.js — 2026-07-29
//
// Expose l'exécuteur de package au Builder (moteur natif). Reçoit un manifeste,
// des fichiers (essences réelles) et une connexion S3 ; assemble, vérifie la
// cardinalité, dépose sur S3, renvoie les sorties (URLs) et le verdict.
//
// Découplage volontaire : cette route exécute un package à partir de fichiers
// FOURNIS. La collecte des essences depuis Iconik (transformer « une
// collection » en « liste de fichiers ») est un fournisseur d'entrées séparé,
// branché en amont quand le nœud Deliver sera complet. Ainsi la capacité
// d'exécution est testable seule.

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { getOrgContext } = require('../lib/org-context');
const PivotManifest = require('../public/builders/workflow/pivot-manifest');
const executor = require('../lib/package-executor');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// POST /api/package/verifier — assemble + vérifie SANS déposer (aperçu du
// verdict de cardinalité). Utile pour valider un manifeste avant livraison.
router.post('/verifier', async (req, res) => {
  try {
    const { manifeste, fichiers } = req.body || {};
    const val = PivotManifest.valider(manifeste);
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });

    const PivotPackager = require('../public/builders/workflow/pivot-packager');
    const plan = PivotPackager.assembler(manifeste, fichiers || []);
    res.json({
      ok: plan.ok,
      resume: PivotPackager.resumer(plan),
      sorties: plan.sorties,
      violations: plan.violations
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/package/executer — assemble, vérifie, et DÉPOSE réellement sur S3.
// Corps : { manifeste, fichiers: [{nom, corps?, url?, contentType?}],
//           connexionId, prefixe? }
// POST /api/package/verifier-s3 — vérifie par LISTING S3 ce qui est réellement
// présent (pilotage API : aucune manipulation média). Les essences sont
// supposées déjà poussées par la plateforme (export location Iconik). Constate
// et valide la cardinalité du manifeste sur le réel. Corps : { manifeste,
// connexionId, prefixe? }.
router.post('/verifier-s3', async (req, res) => {
  try {
    const { manifeste, connexionId, prefixe } = req.body || {};

    // 1. Valider le manifeste (structure).
    const val = PivotManifest.valider(manifeste);
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });

    // 2. Résoudre la connexion S3, filtrée par l'org du contexte.
    if (!connexionId) return res.status(400).json({ error: 'connexionId requis' });
    const ctx = await getOrgContext(req, prisma);
    const conn = await prisma.connexion.findUnique({ where: { id: connexionId } });
    if (!conn) return res.status(404).json({ error: 'connexion introuvable' });
    if (ctx.filtre && ctx.orgId && conn.orgId && conn.orgId !== ctx.orgId) {
      return res.status(403).json({ error: 'connexion hors de l\'organisation courante' });
    }

    // 3. Vérifier par listing (constat du réel + cardinalité).
    const r = await executor.verifierParListing(manifeste, conn, prefixe);
    if (!r.ok) {
      return res.status(422).json({ ok: false, error: 'package incomplet', violations: r.violations, constate: r.constate });
    }
    res.json({ ok: true, sorties: r.sorties, constate: r.constate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/package/depuis-collection — collecte les essences d'une COLLECTION
// Iconik réelle, puis assemble/vérifie (aperçu). Corps : { manifeste, envId,
// collectionId, recursif? }. Ne dépose pas — c'est l'aperçu du package tel qu'il
// serait constitué à partir du contenu réel de la collection.
router.post('/depuis-collection', async (req, res) => {
  try {
    const { manifeste, envId, collectionId, recursif } = req.body || {};
    const val = PivotManifest.valider(manifeste);
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });
    if (!envId || !collectionId) return res.status(400).json({ error: 'envId et collectionId requis' });

    // Environnement Iconik, filtré par l'org du contexte.
    const ctx = await getOrgContext(req, prisma);
    const env = await prisma.environment.findUnique({ where: { id: envId } });
    if (!env) return res.status(404).json({ error: 'environnement introuvable' });
    if (ctx.filtre && ctx.orgId && env.orgId && env.orgId !== ctx.orgId) {
      return res.status(403).json({ error: 'environnement hors de l\'organisation courante' });
    }

    // Collecte réelle depuis Iconik.
    const iconik = require('../lib/iconik-service');
    const fichiers = await iconik.collecterEssences(env, collectionId, { recursif: !!recursif });

    // Aperçu de l'assemblage (sans dépôt).
    const PivotPackager = require('../public/builders/workflow/pivot-packager');
    const plan = PivotPackager.assembler(manifeste, fichiers);
    res.json({
      ok: plan.ok,
      resume: PivotPackager.resumer(plan),
      nbFichiers: fichiers.length,
      sorties: plan.sorties,
      violations: plan.violations
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/package/livrer — CHAÎNE COMPLÈTE : collecte les essences d'une
// collection Iconik, assemble/vérifie, et DÉPOSE sur S3. Le test de bout en
// bout du nouveau paradigme. Corps : { manifeste, envId, collectionId,
// POST /api/package/livrer — vérifie qu'une livraison est complète sur S3
// (pilotage API pur). Modèle réel VodFactory : l'export location Iconik
// (déclenchée en amont par le workflow) a poussé les essences vers S3 ; cet
// endpoint CONSTATE par listing et valide la cardinalité du manifeste. Il ne
// manipule aucun octet. Corps : { manifeste, connexionId, prefixe? }.
router.post('/livrer', async (req, res) => {
  try {
    const { manifeste, connexionId, prefixe } = req.body || {};
    const val = PivotManifest.valider(manifeste);
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });
    if (!connexionId) return res.status(400).json({ error: 'connexionId requis' });

    const ctx = await getOrgContext(req, prisma);

    // Connexion S3 (à interroger), filtrée par org.
    const conn = await prisma.connexion.findUnique({ where: { id: connexionId } });
    if (!conn) return res.status(404).json({ error: 'connexion introuvable' });
    if (ctx.filtre && ctx.orgId && conn.orgId && conn.orgId !== ctx.orgId) {
      return res.status(403).json({ error: 'connexion hors de l\'organisation courante' });
    }

    // Constat du réel sur S3 + cardinalité (aucune manipulation média).
    const r = await executor.verifierParListing(manifeste, conn, prefixe);
    if (!r.ok) {
      return res.status(422).json({ ok: false, error: 'package incomplet', violations: r.violations, constate: r.constate });
    }
    res.json({ ok: true, constate: r.constate, sorties: r.sorties });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
