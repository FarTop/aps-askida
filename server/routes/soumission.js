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
const { construire } = require('../../scripts/emettre-asl.js');

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
