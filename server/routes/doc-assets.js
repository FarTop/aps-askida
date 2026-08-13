// APS — server/routes/doc-assets.js — 2026-08-13
// CRUD pour DocAsset : les ressources graphiques d'une organisation — charte,
// logo, fontes, icônes. Ressource d'org, scoping calqué sur mapping.js.
//
// POURQUOI CETTE RESSOURCE EXISTE. Les exports de WFD portaient leur charte EN
// DUR, et la représentation ne ressemblait pas à la vraie. Une charte écrite
// dans le code d'un exporteur ne se corrige que par un commit, et chaque
// nouveau rendu refait la faute. Ici elle devient une donnée qu'un écran
// corrige — et `DocTemplate.brandAssetId` dit quel gabarit s'en sert.
//
// CETTE ROUTE NE TRANSPORTE PAS D'OCTETS. `storagePath` désigne où le fichier
// vit ; le dépôt et la lecture des binaires sont un autre sujet (et le principe
// « APS ne touche pas aux octets » vaut pour les médias, pas pour une fonte —
// mais rien ne presse). Une charte se décrit d'abord : nom, type, mime, chemin,
// plus `meta` pour ce qui ne se modélise pas encore (couleurs, graisses).
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const TYPES = ['icon', 'font', 'brand', 'logo', 'image'];

function _versLApi(a) {
  return {
    id: a.id, name: a.name, type: a.type, mimeType: a.mimeType,
    storagePath: a.storagePath, meta: a.meta,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}

// GET /api/doc-assets — `?type=brand` pour ne demander que les chartes
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const where = whereOrg(ctx) || {};
    if (req.query.type) where.type = String(req.query.type);
    const list = await prisma.docAsset.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list.map(_versLApi));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/doc-assets/:id
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const a = await prisma.docAsset.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: 'Non trouvé' });
    res.json(_versLApi(a));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/doc-assets — { name, type, mimeType, storagePath, meta? }
router.post('/', async (req, res) => {
  const { name, type, mimeType, storagePath, meta } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: 'type doit être : ' + TYPES.join(' | ') });
  }
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const a = await prisma.docAsset.create({
      data: {
        orgId: ctx.orgId, name, type,
        mimeType: mimeType || 'application/octet-stream',
        storagePath: storagePath || '',
        meta: meta || null,
      },
    });
    res.json(_versLApi(a));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/doc-assets/:id
router.put('/:id', async (req, res) => {
  const { name, type, mimeType, storagePath, meta } = req.body;
  if (type !== undefined && !TYPES.includes(type)) {
    return res.status(400).json({ error: 'type doit être : ' + TYPES.join(' | ') });
  }
  const prisma = getPrisma();
  try {
    const data = { updatedAt: new Date() };
    if (name !== undefined)        data.name = name;
    if (type !== undefined)        data.type = type;
    if (mimeType !== undefined)    data.mimeType = mimeType;
    if (storagePath !== undefined) data.storagePath = storagePath;
    if (meta !== undefined)        data.meta = meta;
    const a = await prisma.docAsset.update({ where: { id: req.params.id }, data });
    res.json(_versLApi(a));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/doc-assets/:id — refusé tant qu'un gabarit s'en sert : une charte
// qui disparaît sous un gabarit, c'est le rendu faux de WFD par un autre chemin.
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const usages = await prisma.docTemplate.count({ where: { brandAssetId: req.params.id } });
    if (usages) {
      return res.status(409).json({ error: usages + ' gabarit(s) utilisent cette ressource' });
    }
    await prisma.docAsset.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
