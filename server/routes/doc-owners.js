// APS — server/routes/doc-owners.js — 2026-08-13
// CRUD pour DocOwner : les lignes de service qui possèdent gabarits et kits
// (« Formation », « Broadcast », « Transverse »…). Ressource d'organisation,
// scoping calqué sur mapping.js.
//
// Ces six-là vivaient dans `localStorage['afs:doc:owners']`, éditables depuis
// l'écran — donc des données métier dans le navigateur, ce que le principe en
// tête de schema.prisma interdit.
//
// SEMENCE À LA PREMIÈRE LECTURE : l'écran fabriquait ses six propriétaires par
// défaut quand la clé était absente (`defaultOwners()`, doc.js). On garde ce
// comportement, mais côté serveur : une organisation qui n'en a aucun reçoit
// les six, une fois. Sans ça le premier chargement afficherait une liste vide
// là où l'utilisateur voyait toujours ses services.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// « transverse » voit tous les gabarits, et l'écran refuse de le renommer ou de
// le supprimer. La règle est reprise ici : une route ne peut pas compter sur un
// bouton grisé pour protéger une donnée.
const RESERVE = 'transverse';

const PAR_DEFAUT = [
  { key: 'formation',        label: 'Formation',        mode: 'normal' },
  { key: 'broadcast',        label: 'Broadcast',        mode: 'normal' },
  { key: 'creative',         label: 'Creative',         mode: 'normal' },
  { key: 'managed_services', label: 'Managed Services', mode: 'normal' },
  { key: 'synergies',        label: 'Synergies',        mode: 'normal' },
  { key: RESERVE,            label: 'Transverse',       mode: 'super'  },
];

function _versLApi(o) {
  return { id: o.key, rowId: o.id, label: o.label, mode: o.mode };
}

// GET /api/doc-owners — les propriétaires de l'organisation du contexte
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    let owners = await prisma.docOwner.findMany({
      where: whereOrg(ctx), orderBy: { label: 'asc' },
    });
    if (!owners.length && ctx.orgId) {
      await prisma.docOwner.createMany({
        data: PAR_DEFAUT.map(o => Object.assign({ orgId: ctx.orgId }, o)),
        skipDuplicates: true,
      });
      owners = await prisma.docOwner.findMany({
        where: whereOrg(ctx), orderBy: { label: 'asc' },
      });
    }
    res.json(owners.map(_versLApi));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/doc-owners — { key?, label }
router.post('/', async (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'label requis' });
  // La clé se dérive du libellé, comme l'écran le faisait.
  const key = String(req.body.key || label).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return res.status(400).json({ error: 'clé vide' });
  if (key === RESERVE) return res.status(409).json({ error: 'Nom réservé' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const existe = await prisma.docOwner.findUnique({ where: { orgId_key: { orgId: ctx.orgId, key } } });
    if (existe) return res.status(409).json({ error: 'Propriétaire déjà existant' });
    const o = await prisma.docOwner.create({
      data: { orgId: ctx.orgId, key, label, mode: 'normal' },
    });
    res.json(_versLApi(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/doc-owners/:key — renommer. Le `mode` ne s'édite pas : `super` est
// une propriété de « transverse », pas un réglage.
router.put('/:key', async (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'label requis' });
  if (req.params.key === RESERVE) return res.status(409).json({ error: 'Transverse non renommable' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const o = await prisma.docOwner.update({
      where: { orgId_key: { orgId: ctx.orgId, key: req.params.key } },
      data: { label, updatedAt: new Date() },
    });
    res.json(_versLApi(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/doc-owners/:key
router.delete('/:key', async (req, res) => {
  if (req.params.key === RESERVE) return res.status(409).json({ error: 'Transverse non supprimable' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    await prisma.docOwner.delete({
      where: { orgId_key: { orgId: ctx.orgId, key: req.params.key } },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
