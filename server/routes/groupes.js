// APS — server/routes/groupes.js — 2026-08-13
// CRUD des GROUPES. Le groupe est le rôle : il porte les organisations qu'il
// couvre et les outils qu'il ouvre, et rien d'autre.
//
// `GET /api/groupes/outils` sert le catalogue (server/lib/aps-outils.js) pour
// que l'écran propose exactement ce que le serveur accepte — deux listes
// écrites à deux endroits finissent toujours par différer.
//
// SEMENCE À LA PREMIÈRE LECTURE, comme pour les propriétaires du Doc Builder :
// une base sans aucun groupe reçoit SuperAdmin, Admin et Support. Sans ça, le
// premier écran affiche une page vide et rien ne dit par où commencer.
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const Outils = require('../lib/aps-outils');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function _versLApi(g) {
  return {
    id: g.id, cle: g.cle, nom: g.nom, description: g.description,
    outils: g.outils || [],
    systeme: g.systeme,
    organisations: (g.organisations || []).map(x => ({
      id: x.orgId, name: x.organisation ? x.organisation.name : undefined,
    })),
    membres: (g.membres || []).map(m => ({
      id: m.userId,
      name: m.user ? m.user.name : undefined,
      email: m.user ? m.user.email : undefined,
      // Un compte sans mot de passe est un compte INVITÉ : l'écran doit pouvoir
      // le montrer sans avoir à recouper deux listes.
      invite: m.user ? !m.user.passwordHash : undefined,
    })),
    createdAt: g.createdAt, updatedAt: g.updatedAt,
  };
}

const AVEC = {
  organisations: { include: { organisation: true } },
  membres: { include: { user: true } },
};

// GET /api/groupes/outils — le catalogue, avant les groupes eux-mêmes : sans
// lui l'écran ne sait pas quoi proposer.
router.get('/outils', (req, res) => {
  res.json(Outils.OUTILS);
});

// GET /api/groupes
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    let liste = await prisma.groupe.findMany({ include: AVEC, orderBy: [{ systeme: 'desc' }, { nom: 'asc' }] });
    if (!liste.length) {
      await prisma.groupe.createMany({
        data: Outils.GROUPES_SYSTEME.map(g => Object.assign({ systeme: true }, g)),
        skipDuplicates: true,
      });
      liste = await prisma.groupe.findMany({ include: AVEC, orderBy: [{ systeme: 'desc' }, { nom: 'asc' }] });
    }
    res.json(liste.map(_versLApi));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// GET /api/groupes/:id
router.get('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const g = await prisma.groupe.findUnique({ where: { id: req.params.id }, include: AVEC });
    if (!g) return res.status(404).json({ error: 'Non trouvé' });
    res.json(_versLApi(g));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/groupes — { nom, description?, outils?[], organisations?[] }
router.post('/', async (req, res) => {
  const { nom } = req.body;
  if (!nom) return res.status(400).json({ error: 'nom requis' });
  const cle = String(req.body.cle || nom).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cle) return res.status(400).json({ error: 'clé vide' });
  const prisma = getPrisma();
  try {
    if (await prisma.groupe.findUnique({ where: { cle } })) {
      return res.status(409).json({ error: 'Un groupe porte déjà cette clé' });
    }
    const g = await prisma.groupe.create({
      data: {
        cle, nom,
        description: req.body.description || null,
        outils: Outils.nettoyer(req.body.outils),
        systeme: false,
        organisations: { create: (req.body.organisations || []).map(orgId => ({ orgId })) },
      },
      include: AVEC,
    });
    res.json(_versLApi(g));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/groupes/:id — nom, description, outils, organisations.
// La CLÉ ne se modifie jamais : c'est elle qui identifie un groupe système, et
// un renommage silencieux transformerait « superadmin » en groupe ordinaire.
router.put('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const actuel = await prisma.groupe.findUnique({ where: { id: req.params.id } });
    if (!actuel) return res.status(404).json({ error: 'Non trouvé' });

    const data = { updatedAt: new Date() };
    if (req.body.nom !== undefined)         data.nom = req.body.nom;
    if (req.body.description !== undefined) data.description = req.body.description || null;
    if (req.body.outils !== undefined)      data.outils = Outils.nettoyer(req.body.outils);

    // Les organisations se remplacent en bloc : l'écran envoie la liste voulue,
    // pas un différentiel. Plus simple à écrire côté écran, et impossible à
    // désynchroniser.
    if (Array.isArray(req.body.organisations)) {
      await prisma.groupeOrganisation.deleteMany({ where: { groupeId: actuel.id } });
      for (const orgId of req.body.organisations) {
        await prisma.groupeOrganisation.create({ data: { groupeId: actuel.id, orgId } });
      }
    }

    const g = await prisma.groupe.update({
      where: { id: actuel.id }, data, include: AVEC,
    });
    res.json(_versLApi(g));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/groupes/:id — jamais un groupe système, jamais un groupe peuplé.
// Supprimer un groupe retire des accès à ses membres sans le dire : on exige
// de les avoir sortis d'abord, pour que le geste soit conscient.
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const g = await prisma.groupe.findUnique({
      where: { id: req.params.id }, include: { membres: true },
    });
    if (!g) return res.status(404).json({ error: 'Non trouvé' });
    if (g.systeme) return res.status(409).json({ error: 'Groupe système : non supprimable' });
    if (g.membres.length) {
      return res.status(409).json({
        error: g.membres.length + ' membre(s) : retirez-les d\'abord',
      });
    }
    await prisma.groupe.delete({ where: { id: g.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
