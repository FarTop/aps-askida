// APS — server/routes/api-specs.js — créé le 2026-08-10
// ================================================================
// Import et lecture des spécifications d'API rattachées à une plateforme
// (Infrastructure). Deux entrées : une URL que le serveur va chercher, ou un
// contenu collé/téléversé.
//
// Le but est qu'ajouter un outil ne demande jamais d'ouvrir un fichier de
// config ni d'écrire du code : on saisit une URL, APS lit la spec et en
// extrait la liste des opérations.
//
// Ce qui est stocké :
//   ApiSpec      la spec entière (rawContent) + d'où elle vient (sourceUrl)
//   ApiEndpoint  une ligne par opération, avec ses schémas — c'est cette
//                table qui porte `apsMapping`, où se dira plus tard quelle
//                façade APS une opération devient.
//
// Ce que ça N'EST PAS : une transformation automatique en façades. Une
// opération OpenAPI décrit un appel HTTP, une façade décrit un verbe métier —
// `iconik.create_tree` n'est pas un endpoint mais une séquence. Déverser 552
// opérations produirait 552 boutons et zéro verbe. Le choix reste humain, et
// c'est l'étape suivante.
// ================================================================
'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const METHODES = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const TAILLE_MAX = 12 * 1024 * 1024;   // 12 Mo : la spec Make en fait 1,7

// Reconnaît le format à la lecture plutôt que de le demander à l'utilisateur.
function detecter(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.openapi) return { format: 'openapi', version: String(doc.openapi) };
  if (doc.swagger) return { format: 'openapi', version: String(doc.swagger) };
  if (doc.info && doc.item) return { format: 'postman', version: null };  // collection Postman
  return null;
}

// Première URL de serveur déclarée, s'il y en a une (OpenAPI 3) ou host+basePath (Swagger 2).
function baseUrlDe(doc) {
  if (Array.isArray(doc.servers) && doc.servers.length) return doc.servers[0].url || null;
  if (doc.host) return `https://${doc.host}${doc.basePath || ''}`;
  return null;
}

// Aplatit paths → opérations. Les paramètres déclarés au niveau du chemin
// s'appliquent à toutes ses méthodes : on les fusionne, sinon une opération
// perdrait ses paramètres de chemin sans qu'on comprenne pourquoi.
function operationsDe(doc) {
  const out = [];
  const paths = doc.paths || {};
  for (const [chemin, noeud] of Object.entries(paths)) {
    const communs = Array.isArray(noeud.parameters) ? noeud.parameters : [];
    for (const [methode, op] of Object.entries(noeud)) {
      if (!METHODES.includes(methode)) continue;
      if (!op || typeof op !== 'object') continue;
      const params = communs.concat(Array.isArray(op.parameters) ? op.parameters : []);
      let corps = null;
      if (op.requestBody && op.requestBody.content) {
        const premier = Object.values(op.requestBody.content)[0];
        corps = (premier && premier.schema) || null;
      }
      out.push({
        method : methode.toUpperCase(),
        path   : chemin,
        summary: { fr: op.summary || '', description: op.description || '',
                   tags: op.tags || [], operationId: op.operationId || null },
        requestSchema : (params.length || corps) ? { parameters: params, body: corps } : null,
        responseSchema: op.responses ? { codes: Object.keys(op.responses) } : null,
      });
    }
  }
  return out;
}

// GET /api/platforms/:id/specs — ce qui est déjà importé pour cet outil.
router.get('/:id/specs', async (req, res) => {
  try {
    const specs = await prisma.apiSpec.findMany({
      where: { platformId: req.params.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, format: true, version: true, baseUrl: true,
                sourceUrl: true, createdAt: true, updatedAt: true,
                _count: { select: { endpoints: true } } },
    });
    res.json(specs.map(s => ({ ...s, nbOperations: s._count.endpoints, _count: undefined })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/specs/:specId/endpoints — les opérations, filtrables et paginées.
// Une spec réelle en compte des centaines : tout renvoyer d'un coup ferait
// ramer l'écran pour rien.
router.get('/specs/:specId/endpoints', async (req, res) => {
  try {
    const q     = (req.query.q || '').trim();
    const prise = Math.min(parseInt(req.query.limit) || 200, 1000);
    const where = { specId: req.params.specId };
    if (q) {
      where.OR = [
        { path:   { contains: q, mode: 'insensitive' } },
        { method: { equals: q.toUpperCase() } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.apiEndpoint.count({ where }),
      prisma.apiEndpoint.findMany({
        where, take: prise, orderBy: [{ path: 'asc' }, { method: 'asc' }],
        select: { id: true, method: true, path: true, summary: true, apsMapping: true },
      }),
    ]);
    res.json({ total, affiches: rows.length, endpoints: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/platforms/:id/specs — importe depuis `url` OU depuis `content`.
router.post('/:id/specs', async (req, res) => {
  try {
    const plateforme = await prisma.platform.findUnique({ where: { id: req.params.id } });
    if (!plateforme) return res.status(404).json({ error: 'Plateforme non trouvée' });

    const { url } = req.body || {};
    let contenu = req.body && req.body.content;
    let source  = null;

    if (url) {
      // Le serveur va chercher la spec : le navigateur en serait empêché par
      // la politique d'origine croisée sur la plupart des éditeurs.
      let r;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        r = await fetch(url, { headers: { 'Accept': 'application/json, application/yaml, text/plain' }, signal: ctrl.signal });
        clearTimeout(to);
      } catch (e) {
        return res.status(502).json({ error: `URL injoignable — ${e.message}` });
      }
      if (!r.ok) return res.status(502).json({ error: `L'URL a répondu HTTP ${r.status}` });
      const texte = await r.text();
      if (texte.length > TAILLE_MAX) return res.status(413).json({ error: 'Spécification trop volumineuse (> 12 Mo)' });
      try { contenu = JSON.parse(texte); }
      catch (_) { return res.status(415).json({ error: 'Le contenu n\'est pas du JSON — YAML pas encore pris en charge' }); }
      source = url;
    }

    if (typeof contenu === 'string') {
      try { contenu = JSON.parse(contenu); }
      catch (_) { return res.status(415).json({ error: 'Contenu illisible : JSON attendu' }); }
    }
    if (!contenu || typeof contenu !== 'object') {
      return res.status(400).json({ error: 'Fournir soit `url`, soit `content`' });
    }

    const detecte = detecter(contenu);
    if (!detecte) return res.status(415).json({ error: 'Format non reconnu — attendu OpenAPI (openapi/swagger) ou collection Postman' });
    if (detecte.format !== 'openapi') {
      return res.status(501).json({ error: `Format « ${detecte.format} » reconnu mais pas encore analysé — seul OpenAPI l'est` });
    }

    const ops = operationsDe(contenu);
    if (!ops.length) return res.status(422).json({ error: 'Spécification lue, mais aucune opération trouvée' });

    // Réimporter remplace : une spec est un instantané de la doc de l'éditeur,
    // pas un historique. Les anciennes opérations partent avec (cascade).
    const anciennes = await prisma.apiSpec.findMany({ where: { platformId: plateforme.id }, select: { id: true } });
    if (anciennes.length) {
      await prisma.apiEndpoint.deleteMany({ where: { specId: { in: anciennes.map(s => s.id) } } });
      await prisma.apiSpec.deleteMany({ where: { id: { in: anciennes.map(s => s.id) } } });
    }

    const spec = await prisma.apiSpec.create({
      data: {
        platformId: plateforme.id,
        name: (contenu.info && contenu.info.title) || plateforme.name,
        format: 'openapi',
        version: (contenu.info && contenu.info.version) || detecte.version,
        rawContent: contenu,
        baseUrl: baseUrlDe(contenu),
        sourceUrl: source,
      },
    });

    // createMany en un seul appel : une spec réelle fait des centaines de
    // lignes, les insérer une par une prendrait des secondes.
    await prisma.apiEndpoint.createMany({
      data: ops.map(o => ({ specId: spec.id, ...o })),
    });

    res.status(201).json({
      id: spec.id, name: spec.name, format: spec.format, version: spec.version,
      baseUrl: spec.baseUrl, sourceUrl: spec.sourceUrl, nbOperations: ops.length,
      remplace: anciennes.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/specs/:specId
router.delete('/specs/:specId', async (req, res) => {
  try {
    await prisma.apiEndpoint.deleteMany({ where: { specId: req.params.specId } });
    await prisma.apiSpec.delete({ where: { id: req.params.specId } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
