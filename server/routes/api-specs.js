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
// Seule dépendance ajoutée pour le YAML. Pas de parseur maison : les exemples
// d'une spec réelle contiennent du JSON échappé sur plusieurs lignes, et c'est
// exactement là qu'un parseur approximatif se casse en silence.
const yaml = require('js-yaml');

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

// ── JSON OU YAML, SANS LE DEMANDER ──────────────────────────────
// L'en-tête Accept réclamait déjà `application/yaml` ; seul le parseur
// manquait, et une spec YAML repartait sur « Contenu illisible : JSON
// attendu ». Or YAML est la sérialisation la plus répandue des OpenAPI —
// celle de VOD Factory, reçue le 2026-08-13, en est une.
//
// On tente JSON d'abord : c'est plus strict, donc un document qui y passe est
// bien du JSON, et l'ordre évite qu'un parseur YAML — permissif par nature —
// accepte n'importe quel texte et rende une chaîne au lieu d'un objet. Le
// contrôle sur le TYPE du résultat est ce qui ferme cette porte : YAML « load »
// d'une page HTML rend volontiers une chaîne, et une chaîne n'est pas une spec.
function lireSpec(texte) {
  const t = String(texte || '');
  try { return { doc: JSON.parse(t) }; } catch (_) { /* pas du JSON, on tente YAML */ }
  try {
    const doc = yaml.load(t);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { erreur: 'Le YAML est lisible mais ne décrit pas un objet' };
    }
    return { doc: doc, format: 'yaml' };
  } catch (e) {
    return { erreur: 'Ni JSON ni YAML — ' + String(e.message || e).split('\n')[0] };
  }
}

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

// Préfixe de chemin que la spec déclare, quand elle en déclare un.
//
// `servers[0].url` recouvre deux cas qu'il ne faut pas confondre, parce que
// `ApiEndpoint.path` vaut par convention le chemin depuis la base de la
// CONNEXION (le testeur compose littéralement `acces.baseUrl + path`) :
//
//   absolu   https://eu1.make.com/api/v2   la base déclarée EST celle de la
//            connexion. Le chemin reste tel quel — le préfixer appellerait
//            /api/v2/api/v2/login. C'est le cas de Make, et il ne bouge pas.
//   relatif  /API/assets/                  un préfixe SOUS la base de la
//            connexion. Iconik publie une spec par service, chacune ne portant
//            que la fin du chemin (/v1/collections/) : sans ce préfixe aucune
//            opération n'est appelable, et deux services qui déclarent tous
//            deux /v1/assets/ s'écrasent l'un l'autre à la fusion.
function prefixeDe(doc) {
  const u = baseUrlDe(doc);
  if (!u || u[0] !== '/') return '';
  return u.replace(/\/+$/, '');
}

// ── La forme de la réponse ───────────────────────────────────────
// On ne gardait que les CODES de statut. Suffisant pour tester un endpoint,
// inutile pour émettre : un module d'app custom doit déclarer ce qu'il sort
// (`interface`), sinon il rend un blob anonyme — le problème même des 90 appels
// HTTP anonymes, reproduit un cran plus haut.
//
// Les `$ref` sont résolus sur quelques sauts : sans ça le schéma stocké ne dit
// rien de plus que le nom d'une définition qui vit ailleurs. La profondeur est
// bornée et les cycles coupés — une spec réelle en contient (un dossier qui
// contient des dossiers).
function resoudre(doc, noeud, profondeur, vus) {
  if (!noeud || typeof noeud !== 'object' || profondeur <= 0) return noeud;
  if (typeof noeud.$ref === 'string') {
    if (vus.has(noeud.$ref)) return { type: 'object', description: 'cycle : ' + noeud.$ref };
    const chemin = noeud.$ref.replace(/^#\//, '').split('/');
    let cible = doc;
    for (const c of chemin) { cible = cible && cible[c]; }
    if (!cible) return noeud;
    return resoudre(doc, cible, profondeur - 1, new Set([...vus, noeud.$ref]));
  }
  if (Array.isArray(noeud)) return noeud.map(x => resoudre(doc, x, profondeur - 1, vus));
  const o = {};
  for (const [k, v] of Object.entries(noeud)) o[k] = resoudre(doc, v, profondeur - 1, vus);
  return o;
}

// Les champs de premier niveau, prêts à devenir une `interface`. Quand la
// réponse enveloppe une liste (`{objects:[…]}`, la convention d'Iconik), on
// descend dedans : c'est l'objet listé qui intéresse, pas l'enveloppe.
function champsDe(schema) {
  if (!schema || typeof schema !== 'object') return [];
  let props = schema.properties;
  if (props) {
    const tableaux = Object.entries(props).filter(([, v]) => v && v.type === 'array' && v.items);
    if (tableaux.length === 1 && tableaux[0][1].items.properties) props = tableaux[0][1].items.properties;
  }
  if (!props) return [];
  return Object.entries(props).slice(0, 60).map(([nom, v]) => ({
    nom, type: (v && v.type) || 'any', format: (v && v.format) || undefined,
  }));
}

function reponseDe(doc, op) {
  if (!op.responses) return null;
  const codes = Object.keys(op.responses);
  const succes = codes.find(c => /^2\d\d$/.test(c));
  let schema = null;
  if (succes && op.responses[succes] && op.responses[succes].content) {
    const premier = Object.values(op.responses[succes].content)[0];
    if (premier && premier.schema) schema = resoudre(doc, premier.schema, 6, new Set());
  }
  const champs = champsDe(schema);
  // Le schéma résolu peut être énorme (une spec réelle enchaîne les définitions).
  // On garde toujours les champs, et le schéma seulement s'il reste raisonnable.
  const brut = schema ? JSON.stringify(schema) : '';
  return { codes, succes: succes || null, champs,
           schema: brut && brut.length <= 20000 ? schema : null,
           schemaTronque: !!(brut && brut.length > 20000) };
}

// Aplatit paths → opérations. Les paramètres déclarés au niveau du chemin
// s'appliquent à toutes ses méthodes : on les fusionne, sinon une opération
// perdrait ses paramètres de chemin sans qu'on comprenne pourquoi.
function operationsDe(doc) {
  const out = [];
  const paths = doc.paths || {};
  const prefixe = prefixeDe(doc);
  for (const [cheminBrut, noeud] of Object.entries(paths)) {
    const chemin = prefixe + cheminBrut;
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
        responseSchema: reponseDe(doc, op),
      });
    }
  }
  return out;
}

// ── Collection Postman ───────────────────────────────────────────
// Beaucoup d'éditeurs ne publient pas d'OpenAPI mais distribuent une
// collection Postman — c'est ce que VOD Factory a fourni. Le détecteur la
// reconnaissait depuis le début et l'import répondait « pas encore analysé ».
//
// Une collection dit MOINS qu'une spec : pas de schéma de réponse, pas de
// types, pas d'énumérations. Elle dit en revanche deux choses qu'une spec omet
// souvent — des exemples de corps RÉELS, et les commentaires que l'éditeur y a
// laissés (« Not required. Will be generated if empty »). On garde donc le
// corps brut tel quel, sans chercher à en inférer un schéma qui serait faux.

// Les corps d'exemple contiennent souvent des commentaires `//`, donc ne sont
// pas du JSON valide (constaté sur la collection VOD Factory : chaque champ
// est annoté). On tente le parse, et à défaut on conserve le texte — perdre
// l'annotation serait perdre l'essentiel de ce que la collection apporte.
function _corpsPostman(request) {
  const b = request && request.body;
  if (!b || !b.raw) return null;
  try { return { exemple: JSON.parse(b.raw) }; }
  catch (_) { return { exempleBrut: String(b.raw).slice(0, 4000), note: 'corps non-JSON (commentaires ou variables)' }; }
}

// Le chemin depuis la base, conformément à la convention d'ApiEndpoint.path.
// Postman écrit ses URL en absolu ; `url.path` est déjà découpé en segments,
// et ses paramètres `:id` deviennent `{id}` pour rejoindre la notation
// OpenAPI — sans quoi deux descriptions de la même API ne se compareraient
// pas.
function _cheminPostman(url) {
  if (!url) return '/';
  const segments = Array.isArray(url.path)
    ? url.path
    : String(url.raw || url).replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0].split('/').filter(Boolean);
  const chemin = '/' + segments
    .map(s => String(s).replace(/^:(.+)$/, '{$1}'))
    .join('/');
  return chemin.replace(/\/+/g, '/');
}

function _originePostman(url) {
  const brut = url && (url.raw || (typeof url === 'string' ? url : ''));
  const m = String(brut || '').match(/^([a-z]+:\/\/[^/]+)/i);
  return m ? m[1] : null;
}

function operationsDePostman(doc) {
  const out = [];
  const parcourir = function (items, dossiers) {
    (items || []).forEach(function (it) {
      if (Array.isArray(it.item)) { parcourir(it.item, dossiers.concat(it.name || [])); return; }
      const r = it.request;
      if (!r) return;
      const url = r.url || {};
      const params = (url.query || []).map(q => ({
        name: q.key, in: 'query', description: q.description || '',
        example: q.value, disabled: !!q.disabled,
      }));
      out.push({
        method : String(r.method || 'GET').toUpperCase(),
        path   : _cheminPostman(url),
        summary: { fr: it.name || '', description: (typeof r.description === 'string' ? r.description : '') || '',
                   tags: dossiers, operationId: null },
        requestSchema : (params.length || _corpsPostman(r))
          ? { parameters: params, body: _corpsPostman(r) } : null,
        // Une collection ne décrit JAMAIS ses réponses : laisser `null` plutôt
        // qu'un objet vide, pour que l'écran distingue « pas documenté » de
        // « documenté comme vide ».
        responseSchema: null,
      });
    });
  };
  parcourir(doc.item, []);
  return out;
}

function baseUrlDePostman(doc) {
  let trouvee = null;
  const parcourir = function (items) {
    (items || []).forEach(function (it) {
      if (trouvee) return;
      if (Array.isArray(it.item)) { parcourir(it.item); return; }
      if (it.request && it.request.url) trouvee = _originePostman(it.request.url);
    });
  };
  parcourir(doc.item);
  return trouvee;
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

// Fusionne des fragments — ou des specs entières — en une seule. Les chemins
// s'additionnent ; les composants aussi. Le premier qui déclare `info`/`servers`
// les donne à l'ensemble : sur une même API les fragments les répètent à
// l'identique.
//
// Une source qui déclare un préfixe RELATIF voit ses chemins absolutisés ici, et
// non à la lecture des opérations : après fusion, plus rien ne dirait de quel
// service vient tel chemin. Dès qu'au moins une source a été préfixée, la spec
// assemblée ne peut plus porter de `servers` — le préfixe est déjà dans les
// chemins, le garder le compterait deux fois.
function fusionner(fragments) {
  const spec = { openapi: '3.0.0', info: null, servers: null, components: {}, paths: {} };
  let prefixee = false;
  for (const f of fragments) {
    if (!spec.info && f.info) spec.info = f.info;
    if (!spec.servers && Array.isArray(f.servers)) spec.servers = f.servers;
    if (f.openapi) spec.openapi = f.openapi;
    const prefixe = prefixeDe(f);
    if (prefixe) prefixee = true;
    for (const [chemin, noeud] of Object.entries(f.paths || {})) {
      const cle = prefixe + chemin;
      spec.paths[cle] = Object.assign(spec.paths[cle] || {}, noeud);
    }
    for (const [cle, val] of Object.entries(f.components || {})) {
      spec.components[cle] = Object.assign(spec.components[cle] || {}, val);
    }
  }
  if (!spec.info) spec.info = { title: 'Spécification reconstituée', version: '1.0.0' };
  if (!spec.servers || prefixee) delete spec.servers;
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

// Liens sortants d'une page HTML, ramenés en URLs absolues de même origine.
function liensHtml(texte, base) {
  const out = new Set();
  const origine = origineDe(base);
  const re = /(?:href|src)\s*=\s*["']([^"'#\s][^"']*)["']/gi;
  let m;
  while ((m = re.exec(texte))) {
    let u; try { u = new URL(m[1], base).toString(); } catch (_) { continue; }
    if (origine && !u.startsWith(origine)) continue;
    out.add(u.split('#')[0]);
  }
  return [...out];
}

// Une troisième forme d'index, où il n'y a rien à recoller : les liens mènent à
// des specs ENTIÈRES. Iconik n'en publie pas une mais quinze — une par service
// (/docs/assets/spec/, /docs/search/spec/…) — et sa page swagger.html les
// liste. Chacune ne déclare que la fin de ses chemins (/v1/collections/), son
// service vivant dans `servers` : c'est `fusionner` qui les absolutise, sinon
// six chemins de santé identiques d'un service à l'autre écraseraient tout.
const MAX_DOCS = 40;
async function specsLiees(url, texte, entetes) {
  const base = url.split('#')[0];
  const candidats = liensHtml(texte, base)
    .filter(u => u.replace(/\/$/, '') !== base.replace(/\/$/, ''))
    .filter(u => /(\/spec\/?$|swagger|openapi|api-docs)/i.test(u))
    .filter(u => !/\.(css|js|png|jpe?g|gif|svg|ico|woff2?)$/i.test(u))
    .slice(0, MAX_DOCS);

  const docs = [];
  for (let i = 0; i < candidats.length; i += 6) {
    const paquet = await Promise.all(candidats.slice(i, i + 6).map(u => lireTexte(u, entetes)));
    for (const t of paquet) {
      if (!t || t.length > TAILLE_MAX) continue;
      let d; try { d = JSON.parse(t); } catch (_) { continue; }
      // Un lien peut mener à n'importe quel JSON (un manifeste d'icônes en est
      // un) : n'est retenu que ce qui se reconnaît comme spécification.
      if (d && typeof d === 'object' && d.paths && detecter(d)) docs.push(d);
    }
  }
  return docs;
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

    // Par petits paquets : un index de 60 pages ne doit pas ouvrir 60
    // connexions simultanées chez l'éditeur.
    for (let i = 0; i < liens.length; i += 6) {
      const paquet = await Promise.all(liens.slice(i, i + 6).map(u => lireTexte(u, entetes)));
      paquet.forEach(t => { if (t) { pagesLues++; fragments = fragments.concat(fragmentsDe(t)); } });
    }
  }

  // Rien à recoller : les liens mènent peut-être à des specs entières.
  if (!fragments.length) {
    const docs = await specsLiees(url, texte, entetes);
    if (docs.length) {
      const spec = fusionner(docs);
      // Chaque document nomme son service, aucun ne nomme l'ensemble. Titre
      // laissé vide : l'import retombe alors sur le nom de la plateforme, qui
      // est le seul nom juste pour l'assemblage.
      const titres = new Set(docs.map(d => (d.info && d.info.title) || '').filter(Boolean));
      if (titres.size > 1) spec.info = Object.assign({}, spec.info, { title: '' });
      return { spec, pagesLues: 1 + docs.length, documents: docs.length };
    }
  }

  if (!fragments.length) return { erreur: `Ni fragment OpenAPI, ni spécification liée (${pagesLues} page(s) lue(s))` };
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
      // JSON, puis YAML, et seulement ensuite la reconstitution depuis la
      // documentation. L'ordre compte : beaucoup d'éditeurs servent leur spec
      // en YAML à une URL — la traiter comme une page de doc à recoller
      // produirait une spec partielle là où le fichier entier était servi.
      const lu = lireSpec(texte);
      if (lu.doc) {
        contenu = lu.doc;
      } else {
        // Repli : ce n'est pas une spec, c'est peut-être la documentation qui
        // en est rendue. On recolle les fragments OpenAPI qu'elle contient.
        const recolle = await specDepuisDoc(url, entetes);
        if (recolle.erreur) {
          return res.status(415).json({ error: 'Le contenu n\'est ni du JSON ni du YAML, et la reconstitution depuis la documentation a échoué — ' + recolle.erreur });
        }
        contenu = recolle.spec;
        reconstitue = { pagesLues: recolle.pagesLues, fragments: recolle.fragments,
                        documents: recolle.documents };
      }
      source = url;
    }

    if (typeof contenu === 'string') {
      // Le fichier arrive maintenant en TEXTE BRUT depuis l'écran : le
      // navigateur n'a pas de parseur YAML (pas d'étape de construction dans
      // ce dépôt), donc c'est ici que se décide le format — un seul endroit
      // qui sait lire, plutôt que deux qui doivent rester d'accord.
      if (contenu.length > TAILLE_MAX) {
        return res.status(413).json({ error: 'Spécification trop volumineuse (> 12 Mo)' });
      }
      const lu = lireSpec(contenu);
      if (!lu.doc) return res.status(415).json({ error: 'Contenu illisible : ' + lu.erreur });
      contenu = lu.doc;
    }
    if (!contenu || typeof contenu !== 'object') {
      return res.status(400).json({ error: 'Fournir soit `url`, soit `content`' });
    }

    const detecte = detecter(contenu);
    if (!detecte) return res.status(415).json({ error: 'Format non reconnu — attendu OpenAPI (openapi/swagger) ou collection Postman' });

    const estPostman = detecte.format === 'postman';
    const ops = estPostman ? operationsDePostman(contenu) : operationsDe(contenu);
    if (!ops.length) return res.status(422).json({ error: 'Spécification lue, mais aucune opération trouvée' });

    // Réimporter remplace : une spec est un instantané de la doc de l'éditeur,
    // pas un historique. Les anciennes opérations partent avec (cascade).
    //
    // Mais `apsMapping` n'appartient PAS à l'éditeur — c'est notre annotation :
    // les opérations retenues à la main, et la façade que chacune sert. La
    // perdre à chaque rafraîchissement de spec serait détruire notre travail
    // pour recopier celui d'un tiers. On la remet en place, appariée par
    // méthode + chemin ; ce qui a disparu de la spec disparaît avec elle.
    // Ne remplacer QUE les specs du même canal : l'inventaire MCP est une
    // spec `format: 'mcp'` de la même plateforme, et rafraîchir l'API n'a
    // aucune raison de l'effacer. Il a sa propre route pour ça.
    // OpenAPI et Postman sont deux DESCRIPTIONS de la même API, donc un seul
    // et même canal : la seconde importée remplace la première. Les avoir en
    // parallèle afficherait deux fois les mêmes opérations, décrites
    // inégalement. C'est aussi le comportement voulu en pratique — une
    // collection tient lieu de description en attendant la vraie spec, et
    // s'efface d'elle-même quand celle-ci arrive. Le canal `mcp` reste
    // intact : il a sa propre route.
    const anciennes = await prisma.apiSpec.findMany({
      where: { platformId: plateforme.id, format: { in: ['openapi', 'postman'] } }, select: { id: true } });
    const annotations = new Map();
    if (anciennes.length) {
      const ids = anciennes.map(s => s.id);
      const marquees = await prisma.apiEndpoint.findMany({
        where: { specId: { in: ids }, apsMapping: { not: null } },
        select: { method: true, path: true, apsMapping: true },
      });
      marquees.forEach(e => annotations.set(e.method + ' ' + e.path, e.apsMapping));
      // Les tests d'endpoint pointent vers les opérations : sans les retirer
      // d'abord, la contrainte de clé étrangère interdit le remplacement. Ça
      // ne se voyait pas tant qu'aucune opération n'avait jamais été testée.
      const vieux = await prisma.apiEndpoint.findMany({ where: { specId: { in: ids } }, select: { id: true } });
      if (vieux.length) {
        await prisma.apiCheck.deleteMany({ where: { endpointId: { in: vieux.map(e => e.id) } } });
      }
      await prisma.apiEndpoint.deleteMany({ where: { specId: { in: ids } } });
      await prisma.apiSpec.deleteMany({ where: { id: { in: ids } } });
    }

    const spec = await prisma.apiSpec.create({
      data: {
        platformId: plateforme.id,
        name: (contenu.info && (contenu.info.title || contenu.info.name)) || plateforme.name,
        format: detecte.format,
        version: (contenu.info && contenu.info.version) || detecte.version,
        rawContent: contenu,
        baseUrl: estPostman ? baseUrlDePostman(contenu) : baseUrlDe(contenu),
        sourceUrl: source,
      },
    });

    // createMany en un seul appel : une spec réelle fait des centaines de
    // lignes, les insérer une par une prendrait des secondes.
    await prisma.apiEndpoint.createMany({
      data: ops.map(o => Object.assign({ specId: spec.id }, o,
        annotations.has(o.method + ' ' + o.path)
          ? { apsMapping: annotations.get(o.method + ' ' + o.path) } : {})),
    });
    const conservees = ops.filter(o => annotations.has(o.method + ' ' + o.path)).length;

    // Proposition de schéma d'authentification, jamais appliquée d'office :
    // la plateforme peut déjà en porter un, écrit à la main et meilleur (celui
    // de Make a une variable {zone} qu'aucune spec ne saurait deviner).
    const proposition = authProposee(contenu);

    res.status(201).json({
      id: spec.id, name: spec.name, format: spec.format, version: spec.version,
      baseUrl: spec.baseUrl, sourceUrl: spec.sourceUrl, nbOperations: ops.length,
      remplace: anciennes.length,
      annotationsConservees: conservees, annotationsPerdues: annotations.size - conservees,
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
    const actuel = await prisma.apiEndpoint.findUnique({ where: { id: req.params.endpointId } });
    if (!actuel) return res.status(404).json({ error: 'Opération non trouvée' });

    const corps = req.body || {};
    const retenu = corps.retenu !== undefined ? !!corps.retenu : !!(actuel.apsMapping);
    // Le libellé se modifie sans toucher au marquage, et inversement : renommer
    // un verbe ne doit pas le relâcher.
    // Marquage seul : « cette opération m'intéresse pour le test ciblé ».
    // Une version du 2026-08-10 permettait d'y composer des verbes à la main
    // (même libellé = même verbe, plus un ordre) — retirée le jour même : la
    // correspondance verbe → appels se dérive des handlers du moteur et des
    // blueprints Make, elle n'a pas à être saisie ici. Infrastructure récolte
    // et éprouve ; elle ne compose pas.
    const mapping = retenu ? Object.assign({}, actuel.apsMapping || {}, { retenu: true }) : null;
    const maj = await prisma.apiEndpoint.update({
      where: { id: req.params.endpointId }, data: { apsMapping: mapping },
    });
    res.json({ id: maj.id, apsMapping: maj.apsMapping });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MCP : l'autre canal d'acquisition ────────────────────────────
// Même question que l'onglet API — qu'est-ce que cet outil sait faire ? — posée
// à un serveur MCP. La découverte étant dans le protocole, il n'y a ni URL de
// spec à chercher ni format à reconnaître : on se connecte, il répond.
//
// Les outils sont rangés dans les MÊMES tables que les opérations d'API
// (`ApiSpec` de format `mcp`, une ligne `ApiEndpoint` par outil). C'est un
// léger abus — un outil MCP n'est pas un endpoint HTTP — mais les champs
// coïncident (nom, description, schéma d'entrée) et tout ce qui est déjà bâti
// autour suit : liste paginée, filtre, marquage, export.
async function accesMcpDe(platformId) {
  const conn = await prisma.connexion.findFirst({
    where: { platformId, isActive: true, type: 'mcp' },
    include: { platform: true },
  });
  if (!conn) return null;
  const { decrypt } = require('../lib/crypto.js');
  const Acces = require('../lib/connexion-acces.js');
  const secret = conn.authValueEnc ? decrypt(conn.authValueEnc) : null;

  // Une plateforme ne déclare qu'UN schéma d'authentification, celui de son
  // API. MCP est un autre protocole avec sa propre convention : Make attend le
  // jeton dans l'URL, d'autres serveurs attendent un Bearer. On ne reprend donc
  // du schéma que les CHAMPS — de quoi interpoler `{token}` et `{zone}` dans
  // l'URL — jamais ses en-têtes, qui parleraient pour l'autre protocole.
  const specChamps = conn.platform && conn.platform.authSpec
    ? { fields: conn.platform.authSpec.fields || [] } : { fields: [{ name: 'token', secret: true }] };

  const calcul = Acces.construireAcces({
    baseUrl: conn.baseUrl, extraConfig: conn.extraConfig, authValue: secret,
  }, specChamps);

  // En-tête d'authentification seulement si la connexion le demande
  // explicitement — le jeton est sinon déjà dans l'URL.
  if (conn.authType === 'bearer' && secret) calcul.headers['Authorization'] = 'Bearer ' + secret;
  ((conn.extraConfig && conn.extraConfig.headers) || []).forEach(h => {
    if (h && h.key) calcul.headers[h.key] = h.value;
  });
  return { nom: conn.name, ...calcul };
}

// POST /api/platforms/:id/mcp/inventaire — interroge le serveur et enregistre.
router.post('/:id/mcp/inventaire', async (req, res) => {
  try {
    const plateforme = await prisma.platform.findUnique({ where: { id: req.params.id } });
    if (!plateforme) return res.status(404).json({ error: 'Plateforme non trouvée' });

    const acces = await accesMcpDe(plateforme.id);
    if (!acces || !acces.baseUrl) {
      return res.status(409).json({ error: 'Aucune connexion active de type « mcp » pour cet outil — créez-la dans Administration › Connexions, avec l\'URL du serveur MCP.' });
    }

    const Mcp = require('../lib/mcp-client.js');
    const r = await Mcp.listerOutils(acces.baseUrl, acces.headers);
    if (r.erreur) return res.status(502).json({ error: r.erreur, brut: r.brut });
    if (!r.outils.length) return res.status(422).json({ error: 'Le serveur répond mais n\'annonce aucun outil' });

    // Un serveur MCP est un instantané, comme une spec : on remplace.
    const anciennes = await prisma.apiSpec.findMany({
      where: { platformId: plateforme.id, format: 'mcp' }, select: { id: true },
    });
    if (anciennes.length) {
      await prisma.apiEndpoint.deleteMany({ where: { specId: { in: anciennes.map(x => x.id) } } });
      await prisma.apiSpec.deleteMany({ where: { id: { in: anciennes.map(x => x.id) } } });
    }

    const spec = await prisma.apiSpec.create({
      data: {
        platformId: plateforme.id,
        name: (r.serveur && r.serveur.name) || (plateforme.name + ' — MCP'),
        format: 'mcp',
        version: (r.serveur && r.serveur.version) || null,
        rawContent: { serverInfo: r.serveur || null, tools: r.outils },
        baseUrl: acces.baseUrl,
        sourceUrl: acces.baseUrl,
      },
    });

    await prisma.apiEndpoint.createMany({
      data: r.outils.map(t => ({
        specId: spec.id,
        // `TOOL` plutôt qu'un verbe HTTP : ce n'en est pas un, et l'écran doit
        // le dire au lieu de laisser croire à un GET.
        method: 'TOOL',
        path: t.name,
        summary: { fr: t.title || t.name, description: t.description || '',
                   tags: [], operationId: t.name },
        requestSchema: t.inputSchema || null,
        responseSchema: t.outputSchema || null,
      })),
    });

    res.status(201).json({
      id: spec.id, name: spec.name, version: spec.version,
      serveur: r.serveur, nbOutils: r.outils.length, remplace: anciennes.length,
    });
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
