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

// Chemins où les éditeurs déposent conventionnellement leur spécification.
// Aucun n'est garanti : celle de Make a été trouvée en tâtonnant, sa propre
// documentation ne la mentionne nulle part. Autant que ce tâtonnement soit
// dans APS plutôt que dans la tête de quelqu'un.
const CHEMINS_CONNUS = [
  '/openapi.json',            // le plus répandu — c'est celui de Make
  '/swagger.json',
  '/v3/api-docs',             // Springdoc
  '/v2/api-docs',             // Swagger 2 / Springfox
  '/api-docs',
  '/swagger/v1/swagger.json', // ASP.NET
  '/.well-known/openapi.json',
  '/openapi',
  '/spec',
];

function origineDe(u) { try { return new URL(u).origin; } catch (_) { return null; } }

// Un paramètre désigne-t-il un OBJET ? Les identifiants ne s'inventent jamais :
// une valeur fabriquée renvoie 404, et un 404 ne distingue pas « cet objet
// n'existe pas » de « cette route n'existe pas » — le test rendrait alors une
// longue liste d'échecs qui ne prouvent rien. La forme de l'appel (pagination,
// tri, filtre, énumération), elle, se remplit sans risque.
function estIdentifiant(param) {
  const nom = String((param && param.name) || '');
  const sch = (param && param.schema) || {};
  if (/(^|[_\-\[])ids?$/i.test(nom) || /Ids?$/.test(nom)) return true;
  if (String(sch.format || '').toLowerCase() === 'uuid') return true;
  if (/^(email|hash|token|uuid|guid|slug|key)$/i.test(nom)) return true;
  // Le nom ne suffit pas : `hash` et `email` désignaient bien un objet sans que
  // la spec déclare leur format. On regarde donc aussi À QUOI RESSEMBLE la
  // valeur d'exemple — un UUID ou une adresse sont des identités, quel que soit
  // le nom du paramètre.
  const ex = String(exempleBrut(param) ?? '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ex)) return true;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ex)) return true;
  return false;
}

function exempleBrut(param) {
  const sch = (param && param.schema) || {};
  if (param && param.example !== undefined) return param.example;
  if (sch.example !== undefined) return sch.example;
  if (sch.default !== undefined) return sch.default;
  if (Array.isArray(sch.enum) && sch.enum.length) return sch.enum[0];
  return undefined;
}

// Valeur d'exemple déclarée par la spec, s'il y en a une.
function exempleDe(param) {
  const v = exempleBrut(param);
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v.join(',') : String(v);
}

// Les identifiants d'une connexion ne partent QUE vers l'hôte de cette
// connexion. Sans cette garde, saisir l'URL d'un tiers dans le champ d'import
// lui enverrait le jeton du client.
function memeOrigine(a, b) {
  const oa = origineDe(a), ob = origineDe(b);
  return !!oa && !!ob && oa === ob;
}

// Accès de la plateforme, s'il existe une connexion active qui la porte.
async function accesDe(platformId) {
  const conn = await prisma.connexion.findFirst({
    where: { platformId, isActive: true },
    include: { platform: true },
  });
  if (!conn) return null;
  const { decrypt } = require('../lib/crypto.js');
  const Acces = require('../lib/connexion-acces.js');
  const calcul = Acces.acces({
    baseUrl: conn.baseUrl, authType: conn.authType, extraConfig: conn.extraConfig,
    authValue: conn.authValueEnc ? decrypt(conn.authValueEnc) : null,
    headers: (conn.extraConfig && conn.extraConfig.headers) || [],
  }, conn.platform && conn.platform.authSpec);
  return { nom: conn.name, ...calcul };
}
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

// ── Repli : reconstituer une spec depuis une documentation ────────
// Tous les éditeurs ne publient pas leur spec à un chemin devinable. Beaucoup
// hébergent en revanche une doc qui EST rendue depuis une spec : chaque page
// Markdown de Make porte, sous chaque endpoint, le fragment OpenAPI complet
// dans un bloc de code. Recoller ces fragments reconstitue la spécification.
//
// Vaut pour tout éditeur dont la doc expose des variantes `.md` et un index
// `llms.txt` — c'est une convention répandue, pas une particularité de Make.

// Fragments OpenAPI dans les blocs de code d'une page Markdown.
function fragmentsDe(texte) {
  const out = [];
  const re = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let m;
  while ((m = re.exec(texte))) {
    let doc; try { doc = JSON.parse(m[1]); } catch (_) { continue; }
    if (doc && typeof doc === 'object' && doc.paths) out.push(doc);
  }
  return out;
}

// Fusionne des fragments en une seule spec. Les chemins s'additionnent ; les
// composants aussi. Le premier fragment qui déclare `info`/`servers` les donne
// à l'ensemble — ils sont identiques d'un fragment à l'autre sur une même API.
function fusionner(fragments) {
  const spec = { openapi: '3.0.0', info: null, servers: null, components: {}, paths: {} };
  for (const f of fragments) {
    if (!spec.info && f.info) spec.info = f.info;
    if (!spec.servers && Array.isArray(f.servers)) spec.servers = f.servers;
    if (f.openapi) spec.openapi = f.openapi;
    for (const [chemin, noeud] of Object.entries(f.paths || {})) {
      spec.paths[chemin] = Object.assign(spec.paths[chemin] || {}, noeud);
    }
    for (const [cle, val] of Object.entries(f.components || {})) {
      spec.components[cle] = Object.assign(spec.components[cle] || {}, val);
    }
  }
  if (!spec.info) spec.info = { title: 'Spécification reconstituée', version: '1.0.0' };
  if (!spec.servers) delete spec.servers;
  return spec;
}

// Liens Markdown vers des pages `.md`, tels qu'un index llms.txt les liste.
function liensMarkdown(texte, hote) {
  const out = new Set();
  const re = /\((https?:\/\/[^)\s]+\.md)\)/g;
  let m;
  while ((m = re.exec(texte))) { if (!hote || m[1].startsWith(hote)) out.add(m[1]); }
  return [...out];
}

async function lireTexte(url, entetes) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { headers: entetes, signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    return await r.text();
  } catch (_) { return null; }
}

// Depuis une URL de documentation : soit une page qui porte des fragments,
// soit un index qui mène à ces pages. Le nombre de pages suivies est borné —
// un index peut en lister des centaines et rien ne justifie de toutes les
// parcourir pour une référence d'API.
const MAX_PAGES = 200;
async function specDepuisDoc(url, entetes) {
  const texte = await lireTexte(url, entetes);
  if (!texte) return { erreur: 'Document injoignable' };

  let fragments = fragmentsDe(texte);
  let pagesLues = 1;

  if (!fragments.length) {
    // Pas de fragment ici : c'est peut-être un index. On ne suit que les pages
    // dont l'URL évoque une référence d'API, sinon on parcourt tout le manuel.
    const hote  = origineDe(url);
    const liens = liensMarkdown(texte, hote)
      .filter(u => /(api-reference|api-documentation|reference|endpoints?)/i.test(u))
      .slice(0, MAX_PAGES);
    if (!liens.length) return { erreur: 'Aucun fragment OpenAPI ni lien de référence trouvé dans ce document' };

    // Par petits paquets : un index de 60 pages ne doit pas ouvrir 60
    // connexions simultanées chez l'éditeur.
    for (let i = 0; i < liens.length; i += 6) {
      const paquet = await Promise.all(liens.slice(i, i + 6).map(u => lireTexte(u, entetes)));
      paquet.forEach(t => { if (t) { pagesLues++; fragments = fragments.concat(fragmentsDe(t)); } });
    }
  }

  if (!fragments.length) return { erreur: `Aucun fragment OpenAPI trouvé (${pagesLues} page(s) lue(s))` };
  return { spec: fusionner(fragments), pagesLues, fragments: fragments.length };
}

// ── Schéma d'authentification déduit de la spec ───────────────────
// `securitySchemes` dit quel en-tête porte le jeton. Il ne dit PAS toujours son
// préfixe : Make déclare `apiKey` dans `Authorization`, et le « Token » qui
// précède la valeur ne vit que dans la description en prose. On le devine, et
// on le signale comme à confirmer plutôt que de le poser en silence.
function authProposee(spec) {
  const schemas = (spec.components && spec.components.securitySchemes) || {};
  const premier = Object.values(schemas)[0];
  if (!premier) return null;

  const champs = [];
  let entete = null, prefixe = '', aConfirmer = false;

  if (premier.type === 'http' && /^bearer$/i.test(premier.scheme || '')) {
    entete = 'Authorization'; prefixe = 'Bearer';
  } else if (premier.type === 'http' && /^basic$/i.test(premier.scheme || '')) {
    entete = 'Authorization'; prefixe = 'Basic';
  } else if (premier.type === 'apiKey' && premier.in === 'header') {
    entete = premier.name || 'Authorization';
    // Le préfixe ne vit que dans la prose. On cherche une portion entre
    // accents graves de la forme « Token your-api-token » : deux mots dont le
    // second est visiblement un exemple de valeur. Une regex plus lâche mordait
    // sur « ` header with the value: ` » et proposait « header » comme préfixe.
    const portions = (premier.description || '').match(/`([^`]+)`/g) || [];
    for (const brute of portions) {
      const dedans = brute.slice(1, -1).trim();
      const m = /^([A-Za-z][A-Za-z0-9-]*)\s+(\S+)$/.exec(dedans);
      if (m && /token|key|secret|your|<|\{/i.test(m[2])) { prefixe = m[1]; aConfirmer = true; break; }
    }
  } else {
    return null;   // oauth2, cookie… : hors de ce que le formulaire sait poser
  }

  champs.push({ name: 'token', label: 'Jeton d\'API', required: true, secret: true,
                help: (premier.description || '').split('\n')[0].slice(0, 160) });

  const serveurs = (spec.servers || []).map(s => s.url).filter(Boolean);
  return {
    baseUrlPattern: serveurs[0] || '',
    serveursDeclares: serveurs,
    fields: champs,
    auth: { kind: 'headers', headers: [{ name: entete, value: (prefixe ? prefixe + ' ' : '') + '{token}' }] },
    prefixeAConfirmer: aConfirmer,
  };
}

// GET /api/platforms/:id/spec-candidates — cherche la spécification là où les
// éditeurs la déposent d'habitude, à partir de l'URL de base de la connexion.
// Sonde deux bases : l'URL de l'API telle quelle, et la racine du domaine.
// Un 401/403 compte comme une trouvaille : la spec existe, elle est protégée —
// et APS a les identifiants pour la lire.
router.get('/:id/spec-candidates', async (req, res) => {
  try {
    const acces = await accesDe(req.params.id);
    if (!acces || !acces.baseUrl) {
      return res.json({ base: null, candidats: [],
        message: 'Aucune connexion active avec une URL de base pour cet outil — créez-la d\'abord dans Connexions.' });
    }
    const base    = acces.baseUrl.replace(/\/+$/, '');
    const racine  = origineDe(base);
    const bases   = racine && racine !== base ? [base, racine] : [base];

    const cibles = [];
    bases.forEach(b => CHEMINS_CONNUS.forEach(c => cibles.push(b + c)));

    const resultats = await Promise.all(cibles.map(async (url) => {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(url, { headers: acces.headers, signal: ctrl.signal });
        clearTimeout(to);
        const type = (r.headers.get('content-type') || '').toLowerCase();
        return { url, status: r.status, contentType: type };
      } catch (_) { return { url, status: 0, contentType: '' }; }
    }));

    const candidats = resultats
      .filter(x => x.status === 200 || x.status === 401 || x.status === 403)
      .map(x => ({
        url: x.url,
        status: x.status,
        verdict: x.status === 200
          ? (x.contentType.includes('json') ? 'trouvée' : 'répond, mais pas du JSON')
          : 'existe, mais protégée',
      }));

    res.json({ base, sondes: cibles.length, connexion: acces.nom, candidats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    const q      = (req.query.q || '').trim();
    const prise  = Math.min(parseInt(req.query.limit) || 200, 1000);
    // Sans décalage, tout ce qui dépassait la première page était inatteignable
    // autrement qu'en filtrant — une spec réelle en compte plusieurs centaines.
    const saut   = Math.max(parseInt(req.query.offset) || 0, 0);
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
        where, take: prise, skip: saut, orderBy: [{ path: 'asc' }, { method: 'asc' }],
        select: { id: true, method: true, path: true, summary: true, apsMapping: true },
      }),
    ]);
    res.json({ total, offset: saut, affiches: rows.length,
               restantes: Math.max(total - (saut + rows.length), 0), endpoints: rows });
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
    let reconstitue = null;

    if (url) {
      // Le serveur va chercher la spec : le navigateur en serait empêché par
      // la politique d'origine croisée sur la plupart des éditeurs.
      //
      // Les identifiants de la connexion sont joints UNIQUEMENT si l'URL est
      // sur le même hôte qu'elle. Une spec protégée devient ainsi lisible
      // (Make répond 401 sur /swagger.json), sans qu'une URL saisie à la main
      // puisse faire fuiter le jeton du client vers un tiers.
      const acces = await accesDe(plateforme.id);
      const entetes = { 'Accept': 'application/json, application/yaml, text/plain' };
      let authentifie = false;
      if (acces && memeOrigine(url, acces.baseUrl)) {
        Object.assign(entetes, acces.headers);
        authentifie = true;
      }
      let r;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        r = await fetch(url, { headers: entetes, signal: ctrl.signal });
        clearTimeout(to);
      } catch (e) {
        return res.status(502).json({ error: `URL injoignable — ${e.message}` });
      }
      if (!r.ok) {
        const indice = (r.status === 401 || r.status === 403) && !authentifie
          ? ' — spécification protégée, et aucune connexion active de cet outil ne couvre cet hôte'
          : '';
        return res.status(502).json({ error: `L'URL a répondu HTTP ${r.status}${indice}` });
      }
      const texte = await r.text();
      if (texte.length > TAILLE_MAX) return res.status(413).json({ error: 'Spécification trop volumineuse (> 12 Mo)' });
      try {
        contenu = JSON.parse(texte);
      } catch (_) {
        // Repli : ce n'est pas une spec, c'est peut-être la documentation qui
        // en est rendue. On recolle les fragments OpenAPI qu'elle contient.
        const recolle = await specDepuisDoc(url, entetes);
        if (recolle.erreur) {
          return res.status(415).json({ error: 'Le contenu n\'est pas du JSON, et la reconstitution depuis la documentation a échoué — ' + recolle.erreur });
        }
        contenu = recolle.spec;
        reconstitue = { pagesLues: recolle.pagesLues, fragments: recolle.fragments };
      }
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

    // Proposition de schéma d'authentification, jamais appliquée d'office :
    // la plateforme peut déjà en porter un, écrit à la main et meilleur (celui
    // de Make a une variable {zone} qu'aucune spec ne saurait deviner).
    const proposition = authProposee(contenu);

    res.status(201).json({
      id: spec.id, name: spec.name, format: spec.format, version: spec.version,
      baseUrl: spec.baseUrl, sourceUrl: spec.sourceUrl, nbOperations: ops.length,
      remplace: anciennes.length,
      reconstitue,
      authProposee: proposition,
      authDejaDeclare: !!plateforme.authSpec,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/platforms/:id/auth-spec — applique un schéma d'authentification.
// Geste explicite : l'import propose, l'utilisateur décide.
router.put('/:id/auth-spec', async (req, res) => {
  try {
    const spec = req.body && req.body.authSpec;
    if (!spec || typeof spec !== 'object') return res.status(400).json({ error: 'authSpec attendu' });
    const p = await prisma.platform.update({
      where: { id: req.params.id },
      data: { authSpec: spec },
    });
    res.json({ id: p.id, authSpec: p.authSpec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/specs/:specId/export — rend la spécification telle qu'importée.
// Utile pour la réinjecter ailleurs (Postman, un générateur de client, une
// autre instance d'APS) sans avoir à retrouver l'URL d'origine.
router.get('/specs/:specId/export', async (req, res) => {
  try {
    const spec = await prisma.apiSpec.findUnique({ where: { id: req.params.specId } });
    if (!spec) return res.status(404).json({ error: 'Spécification non trouvée' });
    const nom = (spec.name || 'openapi').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nom || 'openapi'}.json"`);
    res.send(JSON.stringify(spec.rawContent, null, 2));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/endpoints/:endpointId/mapping — retenir une opération, ou la
// relâcher. `ApiEndpoint.apsMapping` existait depuis l'origine et attendait
// exactement ça : dire ce qu'une opération devient côté APS. Première étape —
// on marque ; le libellé métier et la génération des façades viendront après.
router.put('/endpoints/:endpointId/mapping', async (req, res) => {
  try {
    const retenu = !!(req.body && req.body.retenu);
    const actuel = await prisma.apiEndpoint.findUnique({ where: { id: req.params.endpointId } });
    if (!actuel) return res.status(404).json({ error: 'Opération non trouvée' });
    const mapping = retenu
      ? Object.assign({}, actuel.apsMapping || {}, { retenu: true })
      : null;   // relâcher efface le marquage plutôt que d'y laisser `false`
    const maj = await prisma.apiEndpoint.update({
      where: { id: req.params.endpointId }, data: { apsMapping: mapping },
    });
    res.json({ id: maj.id, apsMapping: maj.apsMapping });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET/PUT /api/platforms/:id/test-context — valeurs nommées servant à remplir
// les paramètres pendant un test. Rangées sur la CONNEXION et non sur la
// plateforme : `teamId` n'est pas une propriété de Make, c'est une propriété
// du Make de ce client — au même titre que la zone.
router.get('/:id/test-context', async (req, res) => {
  try {
    const conn = await prisma.connexion.findFirst({ where: { platformId: req.params.id, isActive: true } });
    if (!conn) return res.json({ connexion: null, contexte: {} });
    res.json({ connexion: conn.name, contexte: (conn.extraConfig && conn.extraConfig.contexteTest) || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/test-context', async (req, res) => {
  try {
    const conn = await prisma.connexion.findFirst({ where: { platformId: req.params.id, isActive: true } });
    if (!conn) return res.status(409).json({ error: 'Aucune connexion active pour cet outil' });
    const contexte = (req.body && req.body.contexte) || {};
    const propre = {};
    Object.entries(contexte).forEach(([k, v]) => {
      const cle = String(k).trim();
      if (cle && String(v).trim()) propre[cle] = String(v).trim();
    });
    const extra = Object.assign({}, conn.extraConfig || {}, { contexteTest: propre });
    await prisma.connexion.update({ where: { id: conn.id }, data: { extraConfig: extra } });
    res.json({ connexion: conn.name, contexte: propre });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/specs/:specId/check — éprouve les opérations contre la vraie API.
//
// Ce qui est appelé, et pourquoi si peu : UNIQUEMENT des GET, et uniquement
// ceux dont le chemin ne porte aucun paramètre et dont aucun paramètre de
// requête n'est obligatoire. Le reste est écarté avec sa raison, jamais
// deviné : inventer un {scenarioId} produirait un 404 qui ne dirait rien de la
// joignabilité, et une API n'est pas un terrain où l'on tire au hasard. Aucune
// écriture n'est jamais déclenchée.
router.post('/specs/:specId/check', async (req, res) => {
  try {
    const spec = await prisma.apiSpec.findUnique({ where: { id: req.params.specId } });
    if (!spec) return res.status(404).json({ error: 'Spécification non trouvée' });
    const acces = await accesDe(spec.platformId);
    if (!acces || !acces.baseUrl) {
      return res.status(409).json({ error: 'Aucune connexion active pour cet outil — impossible d\'appeler quoi que ce soit.' });
    }

    const plafond = Math.min(parseInt(req.body && req.body.limit) || 25, 100);
    const where = { specId: spec.id, method: 'GET' };
    if (req.body && req.body.q) where.path = { contains: String(req.body.q), mode: 'insensitive' };
    // Se restreindre aux opérations retenues : c'est la vraie réponse à « se
    // rassurer avant de lancer un workflow ». Une poignée d'appels qui comptent
    // vaut mieux que 120 dont on ne saura pas quoi faire.
    if (req.body && req.body.retenues) where.apsMapping = { not: null };
    const brut = await prisma.apiEndpoint.findMany({ where, orderBy: { path: 'asc' } });
    // `/admin` et `/internal` en dernier : hors de portée d'un jeton ordinaire,
    // ils occupaient tout un échantillon trié alphabétiquement et donnaient
    // l'impression que rien ne répondait.
    const marginal = (p) => /^\/(admin|internal)\b/.test(p) ? 1 : 0;
    const candidats = brut.slice().sort((a, b) => marginal(a.path) - marginal(b.path));

    // Contexte de test : des valeurs nommées, fournies par l'utilisateur, qui
    // remplissent les paramètres. Sans lui, une API orientée ressources est
    // presque entièrement hors de portée — sur Make, 33 des 34 GET « scenario »
    // exigent un identifiant. Rien n'est jamais deviné : un paramètre sans
    // valeur au contexte écarte l'opération, avec son nom affiché.
    const conn = await prisma.connexion.findFirst({ where: { platformId: spec.platformId, isActive: true } });
    const ctx = (conn && conn.extraConfig && conn.extraConfig.contexteTest) || {};

    const testables = [], ecartes = [];
    for (const e of candidats) {
      const manquantsChemin = [];
      const chemin = e.path.replace(/\{([^}]+)\}/g, (brut, nom) => {
        if (ctx[nom] !== undefined) return encodeURIComponent(ctx[nom]);
        manquantsChemin.push(nom);
        return brut;
      });
      if (manquantsChemin.length) {
        ecartes.push({ path: e.path, raison: 'valeur absente du contexte : ' + manquantsChemin.join(', ') });
        continue;
      }
      const params = (e.requestSchema && e.requestSchema.parameters) || [];
      const requis = params.filter(p => p && p.required && p.in === 'query');

      // Un paramètre requis se sert d'abord au contexte. À défaut, et SEULEMENT
      // s'il ne désigne pas un objet, on prend l'exemple que la spec déclare :
      // ça valide la forme de l'appel sans fabriquer d'identité.
      const valeurs = {}; const exemplesUtilises = [];
      const manquantsQuery = [];
      for (const p of requis) {
        if (ctx[p.name] !== undefined) { valeurs[p.name] = ctx[p.name]; continue; }
        if (!estIdentifiant(p)) {
          const ex = exempleDe(p);
          if (ex !== undefined) { valeurs[p.name] = ex; exemplesUtilises.push(p.name); continue; }
        }
        manquantsQuery.push(p.name);
      }
      if (manquantsQuery.length) {
        ecartes.push({ path: e.path, raison: 'valeur absente du contexte : ' + manquantsQuery.join(', ') });
        continue;
      }
      // SEULEMENT les paramètres requis. Joindre en plus les facultatifs connus
      // paraissait généreux et cassait l'appel : Make refuse
      // /scenarios?teamId=…&organizationId=… (400) là où teamId seul répond 200.
      // Envoyer plus que le nécessaire n'est pas neutre, et un test doit
      // reproduire l'appel minimal, pas un appel enrichi au jugé.
      const qs = new URLSearchParams();
      requis.forEach(p => qs.set(p.name, valeurs[p.name]));
      testables.push({ ...e, exemples: exemplesUtilises,
                       cheminAppele: chemin + (qs.toString() ? '?' + qs.toString() : '') });
    }

    const lot = testables.slice(0, plafond);
    const resultats = [];
    // Par paquets de cinq : un test ne doit pas ressembler à une attaque, et
    // VOD Factory nous a répondu 429 le 2026-08-10 pour moins que ça.
    for (let i = 0; i < lot.length; i += 5) {
      const paquet = await Promise.all(lot.slice(i, i + 5).map(async (e) => {
        const debut = Date.now();
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 12000);
          const r = await fetch(acces.baseUrl + (e.cheminAppele || e.path), { method: 'GET', headers: acces.headers, signal: ctrl.signal });
          clearTimeout(to);
          const ms = Date.now() - debut;
          let nb = null;
          // Uniquement sur une réponse réussie : compter un tableau dans un
          // corps d'erreur produisait « 2 éléments » pour un 403, ce qui
          // décrit le message d'erreur, pas la donnée.
          try {
            if (!r.ok) throw new Error('sans objet');
            const corps = await r.json();
            // Combien d'éléments l'API a-t-elle rendus ? La plupart des API
            // renvoient un objet avec un unique tableau ; on le compte, faute
            // de quoi le test dirait « joignable » sans dire « et alors ».
            if (Array.isArray(corps)) nb = corps.length;
            else if (corps && typeof corps === 'object') {
              const tab = Object.values(corps).find(v => Array.isArray(v));
              if (tab) nb = tab.length;
            }
          } catch (_) { /* réponse non JSON : le code HTTP suffit */ }
          const etat = r.ok ? 'ok'
                     : (r.status === 401 || r.status === 403) ? 'auth_error'
                     : 'error';
          return { id: e.id, method: 'GET', path: e.path, appele: e.cheminAppele || e.path,
                   exemples: e.exemples || [],
                   status: etat, statusCode: r.status, responseMs: ms, count: nb };
        } catch (err) {
          const expire = /abort/i.test(err.message);
          return { id: e.id, method: 'GET', path: e.path,
                   status: expire ? 'timeout' : 'error', statusCode: null,
                   responseMs: Date.now() - debut, errorMessage: err.message };
        }
      }));
      resultats.push(...paquet);
    }

    // Historisé dans ApiCheck, le modèle prévu pour ça et resté vide jusqu'ici.
    if (resultats.length) {
      await prisma.apiCheck.createMany({
        data: resultats.map(r => ({
          endpointId: r.id, status: r.status, statusCode: r.statusCode ?? null,
          responseMs: r.responseMs ?? null, errorMessage: r.errorMessage || null,
        })),
      });
    }

    // Quelles valeurs manquent, et pour combien d'opérations. Dire « 24
    // écartées » sans dire lesquelles ajouter laisse l'utilisateur devant une
    // impasse : c'est le nom du paramètre qui débloque, pas le décompte.
    const manquants = {};
    ecartes.forEach(e => {
      const m = /valeur absente du contexte : (.+)$/.exec(e.raison);
      if (!m) return;
      m[1].split(',').map(x => x.trim()).filter(Boolean)
          .forEach(nom => { manquants[nom] = (manquants[nom] || 0) + 1; });
    });
    const aAjouter = Object.entries(manquants)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nom, n]) => ({ nom, operations: n }));

    const compte = (etat) => resultats.filter(r => r.status === etat).length;
    res.json({
      base: acces.baseUrl, connexion: acces.nom,
      testes: resultats.length,
      candidats: candidats.length,
      testablesTotal: testables.length,
      ecartes: ecartes.slice(0, 40),
      ecartesTotal: ecartes.length,
      contexte: Object.keys(ctx),
      aAjouter,
      resume: { ok: compte('ok'), auth: compte('auth_error'), erreur: compte('error'), timeout: compte('timeout') },
      resultats,
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
