// APS — scripts/emettre-make.js — créé le 2026-08-11
// ================================================================
// Le premier ÉMETTEUR : d'un workflow APS à un blueprint Make.
//
//   node scripts/emettre-make.js <idFlux>            écrit le blueprint, n'envoie rien
//   node scripts/emettre-make.js <idFlux> --ecrire   crée le scénario chez la cible
//   node scripts/emettre-make.js <idFlux> --ecrire --garder   ne le supprime pas
//
// ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ────────────────
// Jusqu'ici tout ce qu'on avait construit était un DICTIONNAIRE : un verbe →
// un module, une ressource → une clé. Un dictionnaire ne fait pas une phrase.
// Émettre demande de décider d'un ORDRE, de brancher des routes, de nommer des
// références entre modules — c'est ce que fait ce fichier.
//
// Il ne réinvente aucune correspondance : elles viennent de `rendre-make.js`
// (verbes, compositions) et de `porter-ressources-make.js` (clés de ressources),
// exactement comme l'écran d'interprétation les lit. Trois lecteurs, une seule
// source ; une quatrième table aurait divergé au premier changement.
//
// ── CE QU'IL NE SAIT PAS ENCORE FAIRE ───────────────────────────
// Il émet le SQUELETTE : les modules, dans l'ordre du flux, avec leurs routes,
// leurs lectures de ressources et leurs post-its. Il ne remplit pas encore les
// paramètres de chaque module — c'est le travail suivant, et il dépend des
// corps de requête que l'extracteur n'a pas tous su lire.
//
// Émettre un squelette juste avant de remplir des paramètres est délibéré : la
// forme est ce qui casse quand on se trompe d'architecture, et c'est elle qu'il
// faut prouver en premier. Un blueprint refusé par Make ne se répare pas en
// corrigeant une valeur de champ.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');
const RENDU            = require('./rendre-make.js');
const PORT             = require('./porter-ressources-make.js');

const ID      = process.argv[2];
const ECRIRE  = process.argv.includes('--ecrire');
const GARDER  = process.argv.includes('--garder');
// Les modules de notre app ne sont pas résolvables tant que l'app n'est pas
// FIGÉE chez la cible, et le figeage demande un droit que le jeton n'a pas
// (`apps commit` → 403). Ce mode les remplace par un module natif inerte pour
// prouver ce dont l'émetteur EST responsable — la forme du scénario : l'ordre,
// les aiguillages, l'imbrication, les gestionnaires d'erreur.
//
// Séparer les deux échecs vaut mieux que d'attendre le droit : si la forme est
// fausse, le droit ne l'aurait pas sauvée.
const SANS_APP = process.argv.includes('--sans-app');

const ENTRE_APPELS = 1100;
let dernier = 0;
async function ap(a, m, c, b) {
  const attente = ENTRE_APPELS - (Date.now() - dernier);
  if (attente > 0) await new Promise(r => setTimeout(r, attente));
  dernier = Date.now();
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { statut: r.status, corps: j, brut: t.slice(0, 300), ok: r.status >= 200 && r.status < 300 };
}

// ── LA POSITION D'UN MODULE ─────────────────────────────────────
// Make range ses modules sur une ligne, de 300 en 300. Ce n'est pas cosmétique :
// un blueprint sans `designer.x` s'ouvre en tas chez le lecteur, et le premier
// geste du collègue qui reprend le travail est de tout replacer à la main.
const PAS_X = 300;

// ── LA VERSION D'UN MODULE NATIF ────────────────────────────────
// Chaque module natif porte SA version, et Make refuse le blueprint quand elle
// est fausse — « Module not found 'http:ActionSendData' version '1' ». Poser 1
// partout paraissait anodin ; c'est un module introuvable sur trois.
//
// Ces valeurs sont RELEVÉES dans leurs 72 scénarios, pas supposées. Une version
// absente de cette table est un module qu'on n'a jamais vu tourner chez eux, et
// c'est un aveu utile : mieux vaut ne pas l'émettre que le deviner.
const VERSIONS = {
  'http:ActionSendData':     3,
  'util:SetVariables':       1,
  'util:SetVariable2':       1,
  'util:FunctionSleep':      1,
  'builtin:BasicRouter':     1,
  'builtin:BasicFeeder':     1,
  'builtin:BasicAggregator': 1,
  'datastore:SearchRecord':  1,
  'gateway:CustomWebHook':   1,
};

// Lire une ressource par sa clé. `datastore:GetRecord` semblait le module
// évident — il n'apparaît dans AUCUN de leurs 72 scénarios, alors que
// `datastore:SearchRecord` y tourne. On émet donc celui qu'on a vu vivre
// plutôt que celui dont le nom sonne juste.
const LIRE_RESSOURCE = 'datastore:SearchRecord';

// ── COMMENT UN MODULE D'APP CUSTOM SE DÉSIGNE ───────────────────
// `apssonde28365-9782b8:iconikSearch` semblait évident — c'est la forme de
// tous les modules natifs (`aws-s3:uploadFile`, `http:ActionSendData`). Elle
// est fausse pour une app custom, qui porte un préfixe :
//
//     app#apssonde28365-9782b8:iconikAction
//
// Huit variantes essayées à l'aveugle, toutes refusées, dont `app:` — à un
// caractère près. Ce qui a tranché n'est aucune d'elles : c'est un scénario
// posé À LA MAIN dans l'éditeur puis relu par l'API. La cible sait dire ce
// qu'elle attend, à condition de le lui demander au bon endroit.
//
// J'avais imputé l'échec au droit `apps commit` manquant. C'était une
// inférence tirée d'un 403 voisin, et elle était fausse : l'app est
// parfaitement utilisable par son équipe. Le droit ne sert qu'à figer une app
// pour la distribuer — jamais à s'en servir chez soi.
const PREFIXE_APP = 'app#';

// ── LA CONFIGURATION D'UN MODULE ────────────────────────────────
// Un module d'app custom prend ses réglages dans `parameters`, PAS dans
// `mapper` — les modules natifs font l'inverse, et j'avais appliqué la règle
// des natifs à tout le monde. Le scénario posé à la main le dit sans
// ambiguïté : `{"assetId":"", "onError":"", "actionType":"export_location_trigger"}`.
//
// Les noms coïncident sans travail : `rendre-make.js` déclare chaque paramètre
// sous `c.chemin`, qui est exactement la clé du pivot. C'est le bénéfice d'un
// rendu dérivé plutôt que saisi.
//
// DEUX FAMILLES DE CHAMPS SONT ÉCARTÉES, et pour des raisons opposées :
//
//   les références de ressources — y recopier l'identifiant APS produirait une
//   valeur qui ne désigne rien chez la cible. La valeur doit venir du module
//   Data Store posé juste avant ; ce branchement reste à écrire, et un champ
//   vide se voit alors qu'un identifiant mort passe inaperçu.
//
//   `label` — c'est le nom de l'étape, déjà porté par `designer.name`. En
//   faire aussi un paramètre le ferait diverger à la première renommée.
function parametresDe(plan, etape) {
  const out = {};
  const def = (plan.definitions || {})[etape.verbe];
  const champs = (def && def.champs) || [];
  const params = etape.params || {};
  champs.forEach(function (c) {
    if (c.chemin === 'label') return;
    if (RENDU.RESSOURCES_APS.includes(c.nature)) return;
    if (RENDU.AFFICHAGE.includes(c.nature)) return;
    const v = params[c.chemin];
    if (v === undefined || v === null) return;
    out[c.chemin] = v;
  });
  return out;
}

// ── L'ÉMETTEUR ──────────────────────────────────────────────────
// `plan` est la sortie de la route d'interprétation : les mêmes groupes, les
// mêmes étapes, les mêmes lectures. Émettre depuis le PLAN et non depuis le
// document pivot est délibéré — ce qu'on émet est alors exactement ce que
// l'écran a montré et que quelqu'un a approuvé.
function emettre(plan, groupe, rang) {
  let id = 1;

  const parId = new Map((groupe.etapes || []).map(e => [e.id, e]));
  const sortantes = new Map();
  const aUnAntecedent = new Set();
  (plan.aretes || []).forEach(function (a) {
    if (!parId.has(a.de) || !parId.has(a.vers)) return;   // hors de ce scénario
    if (!sortantes.has(a.de)) sortantes.set(a.de, []);
    sortantes.get(a.de).push(a);
    aUnAntecedent.add(a.vers);
  });

  // Une étape peut valoir plusieurs modules ; on garde donc, pour chacune, le
  // module qui la REPRÉSENTE — c'est lui que les post-its viendront viser.
  const moduleDe = new Map();
  // Chez Make, un module vit à UN seul endroit de l'arbre. Deux branches qui
  // retombent sur la même étape ne peuvent donc pas la partager : la seconde
  // pose un jalon qui dit où aller. Le taire produirait un scénario qui a
  // l'air complet et qui a perdu une branche.
  const deja = new Set();
  // Les gestionnaires d'erreur, mis de côté le temps que le chemin nominal
  // ait choisi ses étapes.
  const differes = [];

  function poser(flow, x, module, nom, extra) {
    const m = Object.assign({ id: id++, module: module,
                              version: VERSIONS[module] || 1,
                              parameters: {}, mapper: {},
                              metadata: { designer: { x: x, y: 0, name: nom } } }, extra || {});
    flow.push(m);
    return m;
  }

  // ── LE PARCOURS ───────────────────────────────────────────────
  // APS est un GRAPHE, Make une CHAÎNE : on ne peut donc pas poser les étapes
  // dans l'ordre d'une liste, il faut SUIVRE les arêtes et refermer chaque
  // branche là où elle vit. Trois traductions se jouent ici :
  //
  //   plusieurs ports    → un Router, une route par port, la suite DEDANS
  //   un port d'erreur   → `onerror`, une pièce accrochée au module
  //   une étape partagée → un jalon, parce que Make ne sait pas la partager
  //
  // C'est la partie qui casse si l'architecture est mal comprise, et c'est
  // pour ça qu'elle passe avant le remplissage des paramètres.
  function chainer(flow, depart, x) {
    let idEtape = depart;
    while (idEtape) {
      const e = parId.get(idEtape);
      if (!e) return;
      if (deja.has(idEtape)) {
        poser(flow, x, 'util:SetVariable2', '↩ rejoint « ' + e.label + ' »');
        return;
      }
      deja.add(idEtape);

      // 1. Les lectures de ressources, AVANT le module qui s'en sert : chez
      //    Make une valeur ne se lit qu'en aval de ce qui la produit.
      (e.prealables || []).forEach(function (p) {
        poser(flow, x, LIRE_RESSOURCE, 'Lire ' + (p.nom || p.cle), { mapper: { key: p.cle } });
        x += PAS_X;
      });

      // 2. L'étape.
      const sorties = sortantes.get(idEtape) || [];
      const erreurs = sorties.filter(a => /err|erreur|fail|timeout/i.test(a.port));
      const suites  = sorties.filter(a => !erreurs.includes(a));
      let principal;

      if (e.composition) {
        let premier = null;
        e.composition.modules.forEach(function (c) {
          const m = poser(flow, x, c.module, e.label + ' — ' + c.role);
          x += PAS_X;
          if (!premier) premier = m;
        });
        principal = premier;
      } else if (e.module) {
        principal = poser(flow, x,
          SANS_APP ? 'util:SetVariable2' : PREFIXE_APP + plan.app + ':' + e.module,
          e.label + (SANS_APP ? ' [' + e.module + ']' : ''),
          { parameters: parametresDe(plan, e) });
        // La connexion se pose DANS `parameters`, sous `__IMTCONN__`. Sans
        // elle, le module est là, nommé, configuré — et appelle Iconik en
        // anonyme. C'est le pire des trois états : il a l'air complet.
        if (!SANS_APP && plan.idConnexion) principal.parameters.__IMTCONN__ = plan.idConnexion;
        x += PAS_X;
      } else if (e.core === 'loop') {
        // Frontière de scénario : on pose l'APPEL, pas le corps — le corps est
        // un autre scénario, déclenché par webhook.
        principal = poser(flow, x, 'http:ActionSendData', e.label + ' — appeler le sous-scénario');
        x += PAS_X;
      } else if (e.core !== 'decision') {
        // Rien à écrire. Un jalon nommé plutôt qu'un trou : un manque
        // silencieux est indétectable à la relecture.
        principal = poser(flow, x, 'util:SetVariable2', '⚠ ' + e.label + ' — à construire');
        x += PAS_X;
      }

      // 3. Un port d'erreur devient un gestionnaire accroché au module, pas une
      //    arête — c'est LA différence de forme entre les deux architectures.
      //
      //    Mais il se pose PLUS TARD, et c'est tout sauf un détail : dans ce
      //    workflow, `out` et `error` visent souvent la même étape suivante.
      //    Traiter l'erreur d'abord la lui faisait prendre, et tout le chemin
      //    nominal se retrouvait imbriqué sous « sur erreur » — un scénario
      //    dont l'épine dorsale était la gestion d'erreur. Le chemin heureux
      //    passe donc en premier, et l'erreur récupère ce qui reste.
      if (principal && erreurs.length) differes.push({ sur: principal, aretes: erreurs, x: x });

      // 4. La suite. Un seul successeur continue la chaîne ; plusieurs
      //    demandent un Router, et chaque route porte le nom de son port.
      if (e.core === 'decision' || suites.length > 1) {
        // Pour une décision, le Router EST l'étape et porte son nom. Pour une
        // étape ordinaire qui a plusieurs suites, il n'est qu'un aiguillage
        // ajouté par la cible : le dire évite deux modules du même nom, dont
        // l'un n'existe pas dans le workflow source.
        const rt = poser(flow, x, 'builtin:BasicRouter',
          e.core === 'decision' ? e.label : e.label + ' — aiguillage');
        moduleDe.set(idEtape, principal || rt);
        // À la création, une route n'accepte QUE `flow` : ni `metadata`, ni
        // `filter` (« should NOT have additional properties », deux fois).
        // Leurs propres scénarios le confirment — 53 Routers relus, aucune
        // route filtrée à ce niveau.
        //
        // Le nom du port n'a donc nulle part où se poser… sauf dans le premier
        // module de la branche. On l'y écrit, parce que perdre le libellé
        // reviendrait à livrer un embranchement à cinq routes indiscernables :
        // c'est précisément ce qui rend un workflow illisible pour celui qui le
        // reprend. La CONDITION, elle, reste à écrire — une route sans filtre
        // passe toujours, et c'est un manque à afficher, pas à taire.
        rt.routes = suites.map(function (a) {
          const sous = [];
          chainer(sous, a.vers, x + PAS_X);
          if (sous.length) {
            const d = sous[0].metadata.designer;
            d.name = '« ' + a.port +' » ' + d.name;
          }
          return { flow: sous };
        });
        if (!rt.routes.length) rt.routes = [{ flow: [] }];
        return;                       // tout ce qui suit vit dans les routes
      }
      moduleDe.set(idEtape, principal);
      idEtape = suites.length ? suites[0].vers : null;
    }
  }

  const flow = [];
  // L'entrée : ce qu'aucune arête n'atteint. Une composante détachée serait
  // sinon purement perdue, alors qu'elle existe dans le workflow.
  const entrees = (groupe.etapes || []).filter(e => !aUnAntecedent.has(e.id));
  (entrees.length ? entrees : (groupe.etapes || []).slice(0, 1))
    .forEach(e => chainer(flow, e.id, 0));
  // Puis seulement les gestionnaires d'erreur. Ils peuvent en produire d'autres
  // à leur tour, d'où la file plutôt qu'une boucle sur une liste figée.
  while (differes.length) {
    const d = differes.shift();
    d.sur.onerror = d.sur.onerror || [];
    d.aretes.forEach(a => chainer(d.sur.onerror, a.vers, d.x));
  }
  (groupe.etapes || []).forEach(function (e) {
    if (!deja.has(e.id)) chainer(flow, e.id, 0);
  });

  // 3. Les post-its, accrochés aux modules qui portent leurs étapes.
  const notes = [];
  (groupe.etapes || []).forEach(function (e) {
    (e.notes || []).forEach(function (n) {
      const m = moduleDe.get(e.id);
      if (m) notes.push({ content: n.texte, moduleIds: [m.id] });
    });
  });

  return {
    blueprint: {
      name: plan.flux.nom + (rang ? ' — ' + groupe.nom : ''),
      flow: flow,
      metadata: { instant: false, version: 1,
                  scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true },
                  designer: { orphans: [] } },
    },
    notes: notes,
  };
}

const l = (s, n) => String(s == null ? '' : s).padEnd(n);

(async () => {
  if (!ID) { console.log('Usage : node scripts/emettre-make.js <idFlux> [--ecrire]'); return; }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  // Le plan vient de la route : même calcul, même ordre, mêmes lectures que
  // l'écran. On n'émet pas depuis une seconde lecture du pivot.
  const port = process.env.APS_PORT || 3000;
  const r = await fetch(`http://localhost:${port}/api/builder-flows/${ID}/interpretation?cible=make&postits=1`);
  const plan = await r.json();
  if (!r.ok) { console.log('❌ interprétation : ' + (plan.error || r.status)); return prisma.$disconnect(); }

  // Le nom technique de l'app porte le préfixe des modules.
  const nd = await prisma.nodeDefinition.findFirst({
    where: { description: { path: ['rendus', 'make', 'app'], not: null } } });
  plan.app = (nd && nd.description.rendus.make.app) || 'apssonde28365-9782b8';

  // Les champs déclarés par chaque verbe. Ils viennent de `NodeDefinition`, où
  // ils sont DÉRIVÉS du moteur — pas du plan, qui décrit un workflow et non un
  // vocabulaire.
  const defs = await prisma.nodeDefinition.findMany();
  plan.definitions = {};
  defs.forEach(function (d) {
    plan.definitions[d.family] = { champs: (d.configSchema && d.configSchema.champs) || [] };
  });

  console.log('\n' + plan.flux.nom + ' → ' + plan.cible.nom);
  console.log(plan.aptitude.titre + ' — ' + plan.verdict.etapes + ' étapes, '
    + plan.verdict.modules + ' modules attendus, ' + plan.verdict.scenarios + ' scénario(s)\n');

  // ── LA CONNEXION À LIER ───────────────────────────────────────
  // On la RÉSOUT plutôt que de l'inscrire en dur : une connexion Make porte un
  // identifiant numérique qui change d'un compte à l'autre. Le lien stable est
  // son `accountType`, qui vaut `app#<nom de l'app>` — le même préfixe que les
  // modules.
  //
  // Cette résolution est le pendant exact des clés de Data Store : APS ne
  // transporte pas le secret, il désigne la connexion qui le porte chez la
  // cible.
  const cxMake = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const accesMake = Acces.construireAcces({
    baseUrl: cxMake.baseUrl, extraConfig: cxMake.extraConfig,
    authValue: cxMake.authValueEnc ? decrypt(cxMake.authValueEnc) : null }, cxMake.platform.authSpec);
  const equipeMake = Number((cxMake.extraConfig.contexteTest || {}).teamId) || 411248;

  // Attention aux deux champs, qui disent l'inverse de ce que leurs noms
  // suggèrent : `accountName` porte le TYPE (`app#apssonde…`, `telegram`,
  // `azure`), et `accountType` porte le mode d'authentification (`basic`,
  // `oauth`). Les intervertir faisait dire « aucune connexion » alors qu'elle
  // venait d'être créée et vérifiée.
  const rc = await ap(accesMake, 'GET', `/connections?teamId=${equipeMake}`);
  const attendu = PREFIXE_APP + plan.app;
  const mienne = ((rc.corps && rc.corps.connections) || [])
    .find(c => String(c.accountName) === attendu);
  plan.idConnexion = mienne ? mienne.id : null;
  console.log('Connexion  : ' + (mienne
    ? mienne.id + ' « ' + mienne.accountName + ' »'
    : '⚠ AUCUNE pour ' + attendu + ' — les modules appelleront en anonyme') + '\n');

  const sorties = (plan.groupes || []).map((g, i) => emettre(plan, g, plan.groupes.length > 1 ? i + 1 : 0));
  // Le flux est un ARBRE dès qu'il y a un Router : l'afficher à plat le
  // redirait faux, et c'est justement la forme qu'on cherche à vérifier.
  // Un blueprint est un ARBRE : `flow.length` ne compte que le premier niveau.
  // Comparer ce nombre au total émis donnait « 5/5 gardés » sur un scénario de
  // 65 modules — un contrôle qui affiche toujours vert parce qu'il compare deux
  // choses différentes. Pire qu'aucun contrôle.
  function compter(flow) {
    return (flow || []).reduce(function (n, m) {
      return n + 1 + compter(m.onerror)
               + (m.routes || []).reduce((s, r) => s + compter(r.flow), 0); }, 0);
  }
  function afficher(flow, prof) {
    (flow || []).forEach(function (m) {
      console.log('   ' + '  '.repeat(prof) + l(m.id, 4) + l(m.module, 34) + ' '
        + (m.metadata.designer.name || ''));
      if (m.onerror && m.onerror.length) {
        console.log('   ' + '  '.repeat(prof) + '     ↳ sur erreur :');
        afficher(m.onerror, prof + 3);
      }
      (m.routes || []).forEach(function (r) {
        console.log('   ' + '  '.repeat(prof) + '     route « '
          + ((r.metadata && r.metadata.designer && r.metadata.designer.name) || '—') + ' »');
        afficher(r.flow, prof + 3);
      });
    });
  }
  sorties.forEach(function (s) {
    console.log('── ' + s.blueprint.name + ' — ' + compter(s.blueprint.flow) + ' modules, '
      + s.notes.length + ' post-it(s)');
    afficher(s.blueprint.flow, 0);
  });

  // Les deux comptes ne sont PAS censés coïncider, et les présenter comme un
  // contrôle serait mentir : le plan compte ce que les étapes coûtent, l'émis
  // ajoute ce que la FORME impose — les aiguillages qu'un graphe demande à une
  // chaîne, et les reprises qu'un module non partageable oblige à poser.
  const total = sorties.reduce((n, s) => n + compter(s.blueprint.flow), 0);
  console.log('\nModules émis : ' + total + '   ·   coût des étapes annoncé par le plan : '
    + plan.verdict.modules);
  console.log('L\'écart est la forme elle-même : aiguillages et reprises, que le plan ne compte pas.');

  if (!ECRIRE) { console.log('\nLecture seule. Relancer avec --ecrire pour créer chez la cible.'); return prisma.$disconnect(); }

  // ── L'ENVOI ───────────────────────────────────────────────────
  const acces = accesMake, equipe = equipeMake;

  console.log('');
  const crees = [];
  for (const s of sorties) {
    const c = await ap(acces, 'POST', '/scenarios', {
      teamId: equipe, name: s.blueprint.name,
      blueprint: JSON.stringify(s.blueprint),
      scheduling: JSON.stringify({ type: 'indefinitely', interval: 900 }) });
    const id = c.ok && c.corps && c.corps.scenario && c.corps.scenario.id;
    console.log((c.ok ? '✅' : '❌') + ' ' + l(s.blueprint.name, 46) + (id ? 'scénario ' + id : ''));
    if (!id) {
      // Le refus en entier. Tronquer le message d'une validation revient à
      // jeter la seule information qui dise QUOI corriger.
      const su = (c.corps && c.corps.suberrors) || [];
      console.log('   ' + ((c.corps && c.corps.detail) || c.brut));
      su.forEach(x => console.log('   · ' + x.message));
    }
    if (!id) continue;
    crees.push(id);

    // Relire : un 200 à la création ne dit pas ce qui a été gardé.
    const relu = await ap(acces, 'GET', `/scenarios/${id}/blueprint`);
    const bp = relu.corps && relu.corps.response && relu.corps.response.blueprint;
    const attendus = compter(s.blueprint.flow);
    const gardes = bp ? compter(bp.flow) : 0;
    console.log('   relecture : ' + gardes + '/' + attendus + ' modules gardés'
      + (gardes === attendus ? '' : '  ⚠ écart'));

    for (const n of s.notes) {
      const rn = await ap(acces, 'POST', `/scenarios/${id}/notes`, n);
      if (!rn.ok) { console.log('   ❌ post-it — ' + rn.brut.slice(0, 100)); break; }
    }
    if (s.notes.length) console.log('   ' + s.notes.length + ' post-it(s) posés');
  }

  if (!GARDER) {
    console.log('');
    for (const id of crees) {
      const d = await ap(acces, 'DELETE', `/scenarios/${id}`);
      console.log((d.ok ? '🧹' : '❌') + ' scénario ' + id + ' retiré');
    }
    console.log('\nRien n\'a été laissé chez la cible. Relancer avec --garder pour conserver.');
  }

  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
