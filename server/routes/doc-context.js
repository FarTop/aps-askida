// APS — server/routes/doc-context.js — 2026-08-13
// L'ÉTAT DE TRAVAIL du Doc Builder : quel propriétaire, quels jeux de données
// cochés, quel gabarit actif, et si le projet est clôturé.
//
// C'est `DocKitContext`, et ce modèle attendait depuis le début : il porte
// `orgId + envKey` en clé unique, `ownerId`, `templateId`, `datasets`, `status`,
// `locked/lockedAt/lockedReason` — champ pour champ l'objet `kit` que doc.js
// rangeait dans `localStorage['afs:doc:kits']`, indexé par une clé
// « plateforme|org|domaine » qu'il fabriquait à la main. La clé fabriquée EST
// `envKey`.
//
// `envKey` passe en corps ou en requête, jamais en segment d'URL : il contient
// des barres verticales, et un chemin encodé se relit mal dans un journal.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function _versLApi(c) {
  if (!c) return null;
  return {
    envKey: c.envKey,
    ownerId: c.ownerId, templateId: c.templateId,
    datasets: c.datasets || {},
    status: c.status, locked: c.locked,
    lockedAt: c.lockedAt, lockedReason: c.lockedReason,
    updatedAt: c.updatedAt,
  };
}

// GET /api/doc-context?envKey=iconik|ASKIDA|app.iconik.io
// Rend `null` quand le contexte n'existe pas encore : c'est à l'écran de poser
// ses valeurs par défaut, comme il le faisait. Une route qui inventerait un
// contexte à la lecture le créerait pour chaque coup d'œil.
router.get('/', async (req, res) => {
  const envKey = String(req.query.envKey || '');
  if (!envKey) return res.status(400).json({ error: 'envKey requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const c = await prisma.docKitContext.findUnique({
      where: { orgId_envKey: { orgId: ctx.orgId, envKey } },
    });
    res.json(_versLApi(c));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/doc-context — { envKey, ownerId?, templateId?, datasets?, status?,
//                          locked?, lockedAt?, lockedReason? }
// Upsert : l'écran ne distingue pas « créer » de « mettre à jour », il
// enregistre l'état courant. La route colle à ce geste plutôt que d'imposer un
// POST puis des PUT.
router.put('/', async (req, res) => {
  const envKey = String(req.body.envKey || '');
  if (!envKey) return res.status(400).json({ error: 'envKey requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const champs = {
      ownerId:      req.body.ownerId      ?? null,
      templateId:   req.body.templateId   ?? null,
      datasets:     req.body.datasets     ?? {},
      status:       req.body.status       ?? null,
      locked:       req.body.locked       === true,
      lockedAt:     req.body.lockedAt     ? new Date(req.body.lockedAt) : null,
      lockedReason: req.body.lockedReason ?? null,
    };
    const c = await prisma.docKitContext.upsert({
      where:  { orgId_envKey: { orgId: ctx.orgId, envKey } },
      create: Object.assign({ orgId: ctx.orgId, envKey }, champs),
      update: Object.assign({ updatedAt: new Date() }, champs),
    });
    res.json(_versLApi(c));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/doc-context?envKey=… — le bouton « réinitialiser » de l'écran.
router.delete('/', async (req, res) => {
  const envKey = String(req.query.envKey || req.body.envKey || '');
  if (!envKey) return res.status(400).json({ error: 'envKey requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    await prisma.docKitContext.deleteMany({ where: { orgId: ctx.orgId, envKey } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
