// APS — server/routes/wfd-data.js — 2026-06-24
// Routes pour mappings, palnodes, nommages, scripts, contacts, runs

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const { getOrgContext } = require('../lib/org-context');

// Résout l'org d'une requête. Si `req` est fourni, on passe par le contexte
// (cookie/header X-Org-Id sinon repli première org) : additif, transparent pour
// WFD qui n'envoie aucun contexte -> repli -> comportement inchangé. Sans `req`
// (anciens appels), comportement d'origine préservé.
async function getDefaultOrgId(req) {
  if (req) {
    const ctx = await getOrgContext(req, prisma);
    return ctx.orgId;
  }
  const org = await prisma.organisation.findFirst();
  return org?.id;
}

async function getDefaultEnvId() {
  const env = await prisma.environment.findFirst({ where: { isDefault: true } });
  return env?.id;
}

// ── Upsert bulk générique ─────────────────────────────────────
// Appelé par _sauvegarderEtatVersServeur qui envoie { items: [...] }
// Pour chaque item : update si existe, create sinon
async function upsertBulk(model, items, buildData) {
  if (!items?.length) return { ok: true, count: 0 };
  const results = await Promise.allSettled(
    items.map(item =>
      prisma[model].upsert({
        where:  { id: item.id },
        update: buildData(item),
        create: buildData(item),
      })
    )
  );
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
  return { ok: true, count: results.length, errors: errors.length ? errors : undefined };
}

// ── Manifestes de livraison (ressource d'org, nouveau paradigme) ─────────────
const PivotManifest = require('../public/builders/workflow/pivot-manifest');

router.get('/manifests', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const items = await prisma.manifest.findMany({ where: { orgId } });
    res.json(items.map(m => ({ id: m.id, name: m.name, niveau: m.niveau, essences: m.essences })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/manifests/:id', async (req, res) => {
  try {
    const item = await prisma.manifest.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, niveau: item.niveau, essences: item.essences });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/manifests', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const { id, name, niveau, essences } = req.body;
    // Validation structurelle (un manifeste stocké doit être cohérent).
    const val = PivotManifest.valider({ name, niveau, essences: essences || [] });
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });
    const item = await prisma.manifest.upsert({
      where:  { id: id || '' },
      update: { name, niveau: niveau || null, essences: essences || [] },
      create: { id, orgId, name, niveau: niveau || null, essences: essences || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/manifests/:id', async (req, res) => {
  try {
    const { name, niveau, essences } = req.body;
    const val = PivotManifest.valider({ name, niveau, essences: essences || [] });
    if (!val.ok) return res.status(400).json({ error: 'manifeste invalide', details: val.erreurs });
    const item = await prisma.manifest.update({ where: { id: req.params.id }, data: { name, niveau: niveau || null, essences: essences || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/manifests/:id', async (req, res) => {
  try {
    await prisma.manifest.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PALNODES ──────────────────────────────────────────────────
router.get('/palnodes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.palNode.findMany({ where: { orgId } });
    res.json(items.map(p => ({ id: p.id, family: p.family, name: p.name, config: p.config })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/palnodes/:id', async (req, res) => {
  try {
    const item = await prisma.palNode.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, family: item.family, name: item.name, config: item.config });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/palnodes', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('palNode', req.body.items, i => ({ id: i.id, orgId, family: i.family, name: i.name, config: i.config || {} }));
      return res.json(r);
    }
    const { id, family, name, config } = req.body;
    const item = await prisma.palNode.upsert({
      where:  { id: id || '' },
      update: { family, name, config: config || {} },
      create: { id, orgId, family, name, config: config || {} },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/palnodes/:id', async (req, res) => {
  try {
    const { name, config } = req.body;
    const item = await prisma.palNode.update({ where: { id: req.params.id }, data: { name, config: config || {} } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/palnodes/:id', async (req, res) => {
  try {
    await prisma.palNode.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── NOMMAGES ──────────────────────────────────────────────────
router.get('/nommages', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const items = await prisma.nommage.findMany({ where: { orgId } });
    res.json(items.map(n => ({ id: n.id, name: n.name, description: '', steps: n.rules })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/nommages/:id', async (req, res) => {
  try {
    const item = await prisma.nommage.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, description: '', steps: item.rules });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/nommages', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    if (req.body.items) {
      const r = await upsertBulk('nommage', req.body.items, i => ({ id: i.id, orgId, name: i.name, rules: i.steps || [] }));
      return res.json(r);
    }
    const { id, name, steps } = req.body;
    const item = await prisma.nommage.upsert({
      where:  { id: id || '' },
      update: { name, rules: steps || [] },
      create: { id, orgId, name, rules: steps || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/nommages/:id', async (req, res) => {
  try {
    const { name, steps } = req.body;
    const item = await prisma.nommage.update({ where: { id: req.params.id }, data: { name, rules: steps || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/nommages/:id', async (req, res) => {
  try {
    await prisma.nommage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SCRIPTS ───────────────────────────────────────────────────
router.get('/scripts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    const items = await prisma.script.findMany({ where: { orgId } });
    res.json(items.map(s => ({ id: s.id, name: s.name, lang: s.lang, code: s.content, description: '' })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/scripts/:id', async (req, res) => {
  try {
    const item = await prisma.script.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, lang: item.lang, code: item.content, description: '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/scripts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId();
    if (req.body.items) {
      const r = await upsertBulk('script', req.body.items, i => ({ id: i.id, orgId, name: i.name, lang: i.lang || 'javascript', content: i.code || '' }));
      return res.json(r);
    }
    const { id, name, lang, code } = req.body;
    const item = await prisma.script.upsert({
      where:  { id: id || '' },
      update: { name, lang: lang || 'javascript', content: code || '' },
      create: { id, orgId, name, lang: lang || 'javascript', content: code || '' },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/scripts/:id', async (req, res) => {
  try {
    const { name, lang, code } = req.body;
    const item = await prisma.script.update({ where: { id: req.params.id }, data: { name, lang, content: code || '' } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/scripts/:id', async (req, res) => {
  try {
    await prisma.script.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CONTACTS ──────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const items = await prisma.contactList.findMany({ where: { orgId } });
    res.json(items.map(c => ({ id: c.id, name: c.name, contacts: c.contacts })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/contacts/:id', async (req, res) => {
  try {
    const item = await prisma.contactList.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ id: item.id, name: item.name, contacts: item.contacts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/contacts', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    if (req.body.items) {
      const r = await upsertBulk('contactList', req.body.items, i => ({ id: i.id, orgId, name: i.name, contacts: i.contacts || [] }));
      return res.json(r);
    }
    const { id, name, contacts } = req.body;
    const item = await prisma.contactList.upsert({
      where:  { id: id || '' },
      update: { name, contacts: contacts || [] },
      create: { id, orgId, name, contacts: contacts || [] },
    });
    res.status(201).json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/contacts/:id', async (req, res) => {
  try {
    const { name, contacts } = req.body;
    const item = await prisma.contactList.update({ where: { id: req.params.id }, data: { name, contacts: contacts || [] } });
    res.json(item);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contacts/:id', async (req, res) => {
  try {
    await prisma.contactList.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RUNS ─────────────────────────────────────────────────────
router.get('/runs', async (req, res) => {
  try {
    const envId  = await getDefaultEnvId();
    const flows  = await prisma.flow.findMany({ where: { envId }, select: { id: true } });
    const flowIds = flows.map(f => f.id);
    const runs   = await prisma.run.findMany({
      where:   { flowId: { in: flowIds } },
      orderBy: { startedAt: 'desc' },
      take:    500,
    });
    res.json(runs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ORGANISATION ─────────────────────────────────────────────
router.get('/organisation', async (req, res) => {
  try {
    const org = await prisma.organisation.findFirst();
    if (!org) return res.status(404).json({ error: 'Organisation non trouvée' });
    res.json({ id: org.id, name: org.name, slug: org.slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Workflows du Builder (ressource d'org, document pivot JSON) ─────────────
// NOTE : /builder-flows (pas /flows) — /api/flows est deja pris par le model
// Flow WFD existant (server/routes/flows.js), monte AVANT ce routeur. Meme
// chemin = collision silencieuse (l'ancien router gagne toujours).
router.get('/builder-flows', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const items = await prisma.builderFlow.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } });
    res.json(items.map(f => ({ id: f.id, name: f.name, updatedAt: f.updatedAt })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// La présentation (positions du canevas) n'est pas versionnée (builder-etat.md,
// section Versionnement) : déplacer un nœud n'est pas modifier un workflow.
// Exclue du gel ET de la comparaison brouillon/publié, sinon tout déplacement
// ferait croire à une divergence qui n'en est pas une.
function _sansPresentation(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { presentation, ...reste } = doc;
  return reste;
}

router.get('/builder-flows/:id', async (req, res) => {
  try {
    // orgId + nom de l'org exposés : ce workflow appartient à une org FIXE
    // (décidée à la création), le canvas doit pouvoir l'afficher en lecture
    // seule et scoper ses sélecteurs (environnement...) dessus, pas sur le
    // contexte global ambiant qui pourrait diverger.
    const item = await prisma.builderFlow.findUnique({
      where: { id: req.params.id },
      include: {
        organisation: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 }
      }
    });
    if (!item) return res.status(404).json({ error: 'Non trouvé' });
    const derniere = item.versions[0] || null;
    // « Publié » veut dire : le brouillon actuel EST la dernière version figée
    // (à la présentation près). Le statut se déduit de cette comparaison, il
    // n'est stocké nulle part (critère 2, builder-etat.md).
    const publie = !!derniere &&
      JSON.stringify(_sansPresentation(item.document)) === JSON.stringify(derniere.document);
    res.json({
      id: item.id, name: item.name, document: item.document,
      orgId: item.orgId, orgName: item.organisation ? item.organisation.name : null,
      status: publie ? 'published' : 'draft',
      publishedVersion: derniere ? derniere.version : null,
      publishedAt: derniere ? derniere.createdAt : null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Historique des versions publiées (métadonnées seulement, pas le document
// complet — évite de transporter 76 nœuds par entrée pour un simple historique).
router.get('/builder-flows/:id/versions', async (req, res) => {
  try {
    const versions = await prisma.builderFlowVersion.findMany({
      where: { flowId: req.params.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, createdAt: true }
    });
    res.json(versions);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Geste explicite qui fige le brouillon courant en nouvelle version. Append-
// only : n'écrit jamais une version existante, ne touche pas `document` (le
// brouillon continue de vivre sa vie, éditable librement après publication —
// la protection vient de la copie figée, pas d'un verrou d'édition).
router.post('/builder-flows/:id/publish', async (req, res) => {
  try {
    const flow = await prisma.builderFlow.findUnique({ where: { id: req.params.id } });
    if (!flow) return res.status(404).json({ error: 'Non trouvé' });

    const derniere = await prisma.builderFlowVersion.findFirst({
      where: { flowId: flow.id }, orderBy: { version: 'desc' }
    });
    const prochaineVersion = derniere ? derniere.version + 1 : 1;
    const document = _sansPresentation(flow.document);

    const version = await prisma.builderFlowVersion.create({
      data: { flowId: flow.id, version: prochaineVersion, document }
    });
    res.status(201).json({ version: version.version, createdAt: version.createdAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/builder-flows', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const { id, name, document } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    // Ne jamais transmettre un id falsy à Prisma : un id null/vide explicite
    // ferait rejeter le create (champ non-nullable, le défaut @default(cuid())
    // ne s'applique que si la clé est absente).
    const donneesCreation = Object.assign({ orgId, name, document: document || {} }, id ? { id } : {});
    const item = await prisma.builderFlow.upsert({
      where:  { id: id || '' },
      update: { name, document: document || {} },
      create: donneesCreation,
    });
    res.status(201).json({ id: item.id, name: item.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/builder-flows/:id', async (req, res) => {
  try {
    const { name, document } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    // N'écrase document QUE s'il est fourni : un renommage seul (name only, pas
    // de document) ne doit jamais effacer le contenu du workflow avec {}.
    const data = { name };
    if (document !== undefined) data.document = document;
    const item = await prisma.builderFlow.update({ where: { id: req.params.id }, data });
    res.json({ id: item.id, name: item.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/builder-flows/:id', async (req, res) => {
  try {
    await prisma.builderFlow.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
