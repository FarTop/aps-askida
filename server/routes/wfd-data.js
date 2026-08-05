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
    const items = await prisma.builderFlow.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    // Même calcul que le détail (GET /builder-flows/:id) : « publié » veut dire
    // le brouillon courant EST la dernière version figée (présentation à
    // part) — étendu à la liste (4 août) pour le badge Draft/Published sans
    // ouvrir chaque workflow un par un.
    res.json(items.map(f => {
      const derniere = f.versions[0] || null;
      const publie = !!derniere &&
        JSON.stringify(_sansPresentation(f.document)) === JSON.stringify(derniere.document);
      return {
        id: f.id, name: f.name, updatedAt: f.updatedAt,
        status: publie ? 'published' : 'draft',
        publishedVersion: derniere ? derniere.version : null
      };
    }));
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

// Comptage de références (4 août) : où chaque ressource d'org (Mapping,
// Manifest, Endpoint, ArboTemplate) est-elle utilisée ? Un seul scan de tous
// les BuilderFlow de l'org, récursif dans les corps de boucle (une étape qui
// référence un Mapping/Manifest/Endpoints/gabarit peut être dans le corps
// d'un Loop, pas seulement au niveau racine) — pas un appel par ressource
// (ce serait N+1 côté client à chaque affichage de liste). AVANT
// `/builder-flows/:id` : sinon Express capture "usage" comme un id.
function _referencesDeEtapes(etapes, refs) {
  (etapes || []).forEach(function (etape) {
    const p = etape && etape.params;
    if (p) {
      if (p.mappingId)  (refs.mappings[p.mappingId]  = refs.mappings[p.mappingId]  || []);
      if (p.manifestId) (refs.manifests[p.manifestId] = refs.manifests[p.manifestId] || []);
      if (p.sequenceId) (refs.endpoints[p.sequenceId] = refs.endpoints[p.sequenceId] || []);
      if (p.templateId) (refs.arboTemplates[p.templateId] = refs.arboTemplates[p.templateId] || []);
    }
    if (etape && etape.core === 'loop' && etape.body) {
      _referencesDeEtapes(etape.body.steps, refs);
    }
  });
}

router.get('/builder-flows/usage', async (req, res) => {
  try {
    const orgId = await getDefaultOrgId(req);
    const flows = await prisma.builderFlow.findMany({
      where: { orgId },
      select: { id: true, name: true, document: true }
    });
    const refs = { mappings: {}, manifests: {}, endpoints: {}, arboTemplates: {} };
    flows.forEach(function (f) {
      // Scan local à CE flow (une map réutilisée juste pour collecter les ids
      // qu'il référence, sans compter deux fois une même référence répétée
      // sur plusieurs étapes du même flow).
      const locales = { mappings: {}, manifests: {}, endpoints: {}, arboTemplates: {} };
      _referencesDeEtapes((f.document || {}).steps, locales);
      ['mappings', 'manifests', 'endpoints', 'arboTemplates'].forEach(function (type) {
        Object.keys(locales[type]).forEach(function (id) {
          refs[type][id] = refs[type][id] || [];
          refs[type][id].push({ id: f.id, name: f.name });
        });
      });
    });
    res.json(refs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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

// Document complet d'UNE version figée — pour la restaurer dans le brouillon
// (le canevas la recharge comme n'importe quel document pivot, cf. Restaurer
// côté client) ou l'inspecter avant de la supprimer. Distinct de la liste
// ci-dessus (métadonnées seules) pour ne pas alourdir l'historique affiché.
router.get('/builder-flows/:id/versions/:version', async (req, res) => {
  try {
    const version = await prisma.builderFlowVersion.findUnique({
      where: { flowId_version: { flowId: req.params.id, version: Number(req.params.version) } }
    });
    if (!version) return res.status(404).json({ error: 'Version non trouvée' });
    res.json({ version: version.version, document: version.document, createdAt: version.createdAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Supprime UNE version figée (ménage d'historique — ex. publications faites
// par erreur). N'affecte jamais le brouillon courant (BuilderFlow.document) :
// supprimer une version, y compris la plus récente, ne fait que changer la
// version suivante que /publish attribuera et, potentiellement, laquelle est
// considérée « la dernière » pour le badge Draft/Published et le webhook
// Custom Action (toujours la dernière version restante, jamais le brouillon).
router.delete('/builder-flows/:id/versions/:version', async (req, res) => {
  try {
    await prisma.builderFlowVersion.delete({
      where: { flowId_version: { flowId: req.params.id, version: Number(req.params.version) } }
    });
    res.json({ ok: true });
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
