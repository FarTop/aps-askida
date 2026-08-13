// APS — server/routes/doc-templates.js — 2026-08-13
// CRUD pour DocTemplate : la forme d'un document.
//
// PARTAGÉ PAR DÉFAUT, et c'est le partage arrêté le 2026-08-10 pour
// Administration appliqué tel quel — « la description d'une API décrit un
// produit, pas un projet ». La forme d'un runbook Iconik décrit Iconik : deux
// clients réutilisent le même gabarit, seuls la charte et le contenu changent.
//
// D'où la règle de lecture, la seule chose qui distingue cette route des
// autres CRUD du dépôt : un gabarit d'org N'EST PAS visible ailleurs, mais un
// gabarit sans org est visible de PARTOUT. `whereOrg()` ne sait pas exprimer
// ça — il filtre, il ne fait pas d'union — donc la clause est écrite ici.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext } = require('../lib/org-context');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function _versLApi(t) {
  return {
    id: t.id, name: t.name, description: t.description,
    renderer: t.renderer, content: t.content,
    orgId: t.orgId, platformId: t.platformId, brandAssetId: t.brandAssetId,
    // Ce qu'un écran a besoin de savoir sans recalculer la règle ci-dessus.
    partage: !t.orgId,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  };
}

// GET /api/doc-templates — la bibliothèque : le partagé + le propre à l'org.
// `?platformId=` restreint à un outil ; un gabarit sans plateforme (compte
// rendu, note de cadrage) reste toujours visible — il ne parle d'aucun outil,
// donc aucun outil ne le cache.
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const ou = [{ orgId: null }];
    if (ctx.orgId) ou.push({ orgId: ctx.orgId });
    const where = { OR: ou };
    if (req.query.platformId) {
      where.AND = [{ OR: [{ platformId: req.query.platformId }, { platformId: null }] }];
    }
    const list = await prisma.docTemplate.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list.map(_versLApi));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/doc-templates/:id
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const t = await prisma.docTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Non trouvé' });
    res.json(_versLApi(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/doc-templates — { name, renderer, content, platformId?, brandAssetId?, partage? }
// `partage: true` crée un gabarit de bibliothèque (orgId null) ; sinon il
// appartient à l'organisation du contexte. Le défaut est le NON partagé : on ne
// verse pas dans le commun sans le dire.
router.post('/', async (req, res) => {
  const { name, renderer, content, platformId, brandAssetId, partage } = req.body;
  if (!name)     return res.status(400).json({ error: 'name requis' });
  if (!renderer) return res.status(400).json({ error: 'renderer requis' });
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    if (!partage && !ctx.orgId) return res.status(400).json({ error: 'Aucune organisation de contexte' });
    const t = await prisma.docTemplate.create({
      data: {
        orgId: partage ? null : ctx.orgId,
        platformId: platformId || null,
        brandAssetId: brandAssetId || null,
        name, renderer, description: req.body.description || null,
        content: content || {},
      },
    });
    res.json(_versLApi(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/doc-templates/:id
router.put('/:id', async (req, res) => {
  const { name, renderer, content, platformId, brandAssetId } = req.body;
  const prisma = getPrisma();
  try {
    const data = { updatedAt: new Date() };
    if (name !== undefined)         data.name = name;
    if (renderer !== undefined)     data.renderer = renderer;
    if (content !== undefined)      data.content = content;
    if (platformId !== undefined)   data.platformId = platformId || null;
    if (brandAssetId !== undefined) data.brandAssetId = brandAssetId || null;
    if (req.body.description !== undefined) data.description = req.body.description;
    const t = await prisma.docTemplate.update({ where: { id: req.params.id }, data });
    res.json(_versLApi(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/doc-templates/:id
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.docTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
