// APS — scripts/rendre-make.js — créé le 2026-08-10
// ================================================================
// LE RENDU : `NodeDefinition` → une app custom Make dont les modules SONT nos
// façades. Lit la base, n'ouvre jamais le code du moteur.
//
//   node scripts/rendre-make.js                 montre ce qui serait écrit
//   node scripts/rendre-make.js --ecrire        écrit dans Make
//   node scripts/rendre-make.js --app <nom>     vise une app existante
//
// Pourquoi ça existe : 12 scénarios BAYAM = 205 modules, dont 90 appels HTTP
// anonymes, parce qu'aucune app custom n'expose nos verbes. Chaque module créé
// ici remplace une poignée de ces appels par un verbe qui se nomme.
//
// ── CE QUI SE REND, ET CE QUI NE SE REND PAS ────────────────────
// Seules les FAÇADES deviennent des modules. Les Cores n'en ont pas besoin :
// `decision` est un routeur Make, `loop` un itérateur, `set_variable` et
// `transform` des outils natifs, `http_request` le module HTTP standard. Créer
// un module pour eux serait redire en moins bien ce que la cible sait déjà.
//
// ── LA SEULE TABLE SAISIE À LA MAIN, ET POURQUOI ────────────────
// Une nature comme `vueMetadonnee` dit « choisir une vue Iconik ». Quelle
// requête liste les vues ? Aucune source ne le dit : ni le schéma de config
// (qui nomme un type, pas un endpoint), ni la mesure (le handler ne liste rien,
// il reçoit un identifiant déjà choisi), ni la spec (qui déclare 953 opérations
// sans dire laquelle peuple quel champ). C'est un choix de conception, et il
// est écrit ici en toutes lettres plutôt que deviné.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');

const prisma  = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const ECRIRE  = process.argv.includes('--ecrire');
// `indexOf` rend -1 quand l'option est absente, et `argv[0]` est le chemin de
// node : sans cette garde, le rendu cherchait une app nommée « /usr/bin/node ».
const _iApp = process.argv.indexOf('--app');
const APP_VOULUE = _iApp >= 0 ? (process.argv[_iApp + 1] || null) : null;

// Nos natures → les types de Make.
const TYPE = { texte: 'text', texteLong: 'text', nombre: 'number', booleen: 'boolean',
               choix: 'select', variable: 'text', liste: 'array', couleur: 'color',
               choixOuTexte: 'text', valeurTypee: 'any' };
const AFFICHAGE = ['apercu', 'texteRepeint'];   // décor du canevas, sans objet ici

// Les listes dynamiques : quelle requête peuple quel type de champ.
const LISTES = {
  vueMetadonnee: { rpc: 'listMetadataViews',  url: '/API/metadata/v1/views/',
                   libelle: 'name', valeur: 'id', titre: 'Vues de métadonnées' },
  metadonnee:    { rpc: 'listMetadataFields', url: '/API/metadata/v1/fields/',
                   libelle: 'label', valeur: 'name', titre: 'Champs de métadonnées' },
  customAction:  { rpc: 'listCustomActions',  url: '/API/assets/v1/custom_actions/',
                   libelle: 'title', valeur: 'id', titre: 'Custom Actions' },
  exportLocation:{ rpc: 'listExportLocations', url: '/API/files/v1/storages/',
                   libelle: 'name', valeur: 'id', titre: 'Emplacements d\'export' },
};
// Ce qui désigne une ressource d'APS, pas d'Iconik : APS n'étant pas là en
// production, ces champs deviennent du texte libre et c'est signalé.
const RESSOURCES_APS = ['manifeste', 'mapping', 'endpoint', 'endpoints', 'gabarit', 'connexion'];

const T_SORTIE = { string: 'text', integer: 'number', number: 'number',
                   boolean: 'boolean', array: 'array', object: 'collection' };

// ── LES COMPOSITIONS NATIVES ────────────────────────────────────
// Trois verbes n'avaient ni module rendu ni équivalent natif, et l'écran les
// disait « sans rien à écrire ». C'était vrai au sens strict — aucun module
// unique ne leur correspond — et faux au sens utile : ils s'écrivent très bien,
// en PLUSIEURS modules natifs.
//
// Le vocabulaire vient de leurs scénarios, pas d'une documentation : 72
// blueprints relus, 48 modules natifs distincts observés. On ne déclare ici que
// des modules qu'on a vus tourner chez eux.
//
// LA LEÇON DE `BAYAM | PUB | EXPORT+WAIT`. Les collègues avaient déjà résolu
// l'attente à la main, et leur solution dit ce que la cible impose : Make n'a
// pas de boucle conditionnelle, donc un sondage se DÉROULE. Leur scénario
// imbrique huit essais — http, Router à 3 routes, Sleep — avec un back-off
// écrit à la main (20, 45, 90, 180, puis 300). Une étape `Wait` d'APS y coûte
// une vingtaine de modules. Ce n'est pas une inefficacité de notre rendu, c'est
// le prix de la cible, et il doit se voir.
const COMPOSITIONS = {
  wait: {
    dit: 'chaîne déroulée',
    pourquoi: 'Make n\'a pas de boucle conditionnelle : un sondage ne boucle pas, '
            + 'il se déroule — un essai après l\'autre, imbriqués',
    mesure: 'relevé sur BAYAM | PUB | EXPORT+WAIT, qui déroule 8 essais',
    modules: function (p) {
      // `maxTries` décide de la longueur : c'est le paramètre de l'étape qui
      // fixe le coût, pas une constante de notre côté. Le dernier essai ne
      // dort pas — on ne réessaie plus après.
      const n = Math.max(1, Number(p && p.maxTries) || 8);
      const out = [];
      for (let i = 1; i <= n; i++) {
        out.push({ module: 'http:ActionSendData', role: 'interroger (essai ' + i + ')' });
        out.push({ module: 'builtin:BasicRouter', role: 'checkPath atteint ? sortir : continuer' });
        if (i < n) out.push({ module: 'util:FunctionSleep', role: 'attendre delaySeconds' });
      }
      return out;
    },
  },
  lookup: {
    dit: 'lecture + expression',
    pourquoi: 'la table de correspondance vit dans un Data Store ; la traverser '
            + 'est une expression, pas un appel',
    mesure: 'datastore:SearchRecord et util:SetVariable2 observés chez eux',
    // La lecture de la ressource est déjà comptée à part, comme préalable : la
    // redire ici la ferait compter deux fois.
    modules: function () {
      return [{ module: 'util:SetVariable2',
                role: 'choisir la règle qui correspond, dans les regles[] lues' }];
    },
  },
  verify: {
    dit: 'itération sur les essences',
    pourquoi: 'un manifeste porte plusieurs essences ; chacune se vérifie par '
            + 'son propre appel, et le verdict se recompose ensuite',
    mesure: 'builtin:BasicFeeder et builtin:BasicAggregator observés chez eux',
    modules: function () {
      return [
        { module: 'builtin:BasicFeeder',     role: 'parcourir les essences du manifeste' },
        { module: 'http:ActionSendData',     role: 'interroger verifyEndpoint' },
        { module: 'builtin:BasicAggregator', role: 'recomposer un verdict unique' },
      ];
    },
  },
};

// Ce qu'un verbe devient quand il n'a pas de module à lui. Rend `null` quand
// rien n'est déclaré — l'absence reste une absence, elle ne s'invente pas.
function compositionDe(famille, params) {
  const c = COMPOSITIONS[famille];
  if (!c) return null;
  const modules = c.modules(params || {});
  return { dit: c.dit, pourquoi: c.pourquoi, mesure: c.mesure, modules: modules,
           nombre: modules.length };
}

// ── LE CORPS DE LA REQUÊTE ──────────────────────────────────────
// Sans lui, un module déclare ses champs et poste à vide : une coquille.
// Chaque champ extrait du handler dit d'où il vient, et se traduit :
//
//   paramètre + défaut  →  {{ifempty(parameters.X, "def")}}
//   paramètre seul      →  {{parameters.X}}
//   constante           →  la valeur, telle quelle
//   calcul              →  RIEN, et c'est signalé — mieux vaut un champ absent
//                          qu'un champ faux
function valeurMake(c) {
  if (c.source === 'constante') {
    if (/^\[.*\]$|^\{.*\}$/.test(String(c.valeur))) { try { return JSON.parse(c.valeur); } catch (_) { return c.valeur; } }
    if (c.valeur === 'true') return true;
    if (c.valeur === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(c.valeur)) return Number(c.valeur);
    return c.valeur;
  }
  if (c.source !== 'parametre') return undefined;
  // Un défaut qui est lui-même une variable du moteur (`{asset.id}`) n'a pas de
  // sens chez la cible : c'est l'opérateur qui remplira le champ.
  const d = c.defaut && !/^['"`]?\{/.test(String(c.defaut)) ? String(c.defaut).replace(/^['"`]|['"`]$/g, '') : null;
  return d ? `{{ifempty(parameters.${c.nom}, "${d}")}}` : `{{parameters.${c.nom}}}`;
}

// Le chemin du handler porte `{…}` là où une valeur s'insère, et la mesure a
// lu QUELLE variable la remplit — `${aid}` vient de `p.assetId`. On substitue
// dans l'ordre. Une devinette produisait un PATCH sur le mauvais objet.
function urlMake(chemin, segments, ecarts, verbe) {
  let i = 0;
  return chemin.replace(/\{…\}/g, () => {
    const s = (segments || [])[i++];
    if (s && s.source === 'parametre') return `{{parameters.${s.nom}}}`;
    ecarts.push([verbe, chemin, 'segment d\'URL non résolu' + (s && s.code ? ` (${s.code})` : '')]);
    return '{{parameters.id}}';
  });
}

function apiDe(v, ecarts) {
  const reqs = (v.description.requetes || []);
  const bati = r => {
    const body = {}; let perdus = 0;
    (r.champs || []).forEach(c => {
      const val = valeurMake(c);
      if (val === undefined) { perdus++; ecarts.push([v.family, r.cas ? r.cas + '.' + c.cle : c.cle, `champ calculé (${c.source}) — non rendu`]); return; }
      body[c.cle] = val;
    });
    return { url: urlMake(r.chemin, r.segments, ecarts, v.family), method: r.methode,
             body, response: { output: '{{body}}' }, perdus };
  };
  if (!reqs.length) {
    const a = (v.description.appels || [])[0];
    return a ? { url: urlMake(a.chemin, [], ecarts, v.family), method: a.methode,
                 response: { output: '{{body}}' } } : null;
  }
  if (reqs.length === 1) { const r = bati(reqs[0]); delete r.perdus; return r; }

  // Plusieurs requêtes recouvrent DEUX formes qu'il ne faut pas confondre — les
  // confondre coûtait deux appels sur trois à `create_tree` :
  //
  //   alternatives  chaque requête porte la branche du `switch` qui la produit
  //                 (`cas`). Une seule s'exécute, selon le discriminant. C'est
  //                 `iconik.action` et ses 31 branches.
  //   séquence      aucune ne porte de branche : elles s'enchaînent toutes, dans
  //                 l'ordre. C'est `create_tree` — chercher, créer, écrire.
  //
  // Make rend les deux avec un tableau d'`api` ; seule la présence d'une
  // `condition` les distingue.
  const avecCas = reqs.filter(r => r.cas);
  if (!avecCas.length) {
    ecarts.push([v.family, '(api)', `séquence de ${reqs.length} requêtes — l'enchaînement des résultats n'est pas câblé`]);
    return reqs.map(r => { const b = bati(r); delete b.perdus; return b; });
  }
  const disc = (v.configSchema.champs || []).find(c => Array.isArray(c.options)
    && avecCas.some(r => c.options.some(o => o.valeur === r.cas)));
  if (!disc) {
    ecarts.push([v.family, '(api)', `${avecCas.length} branches sans discriminant déclaré — rendues en séquence`]);
    return reqs.map(r => { const b = bati(r); delete b.perdus; return b; });
  }
  return avecCas.map(r => {
    const b = bati(r); delete b.perdus;
    return Object.assign({ condition: `{{parameters.${disc.chemin} === "${r.cas}"}}` }, b);
  });
}

async function ap(a, m, c, b) {
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { statut: r.status, corps: j, brut: t.slice(0, 200), ok: r.status >= 200 && r.status < 300 };
}

// Make impose l'alphanumérique pur, initiale alphabétique, 3 caractères mini.
const technique = f => f.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');

// Un module qui rend plusieurs objets est une recherche, sinon une action.
const typeDe = v => (v.configSchema.ports || []).some(p => /found|empty/.test(p)) ? 9 : 4;

function vraiPour(t, valeur) {
  switch (t.operateur) {
    case 'egal': case 'parmi':      return t.valeurs.includes(valeur);
    case 'different': case 'hors':  return !t.valeurs.includes(valeur);
    case 'renseigne':               return true;    // une option choisie remplit toujours
    default:                        return false;
  }
}
const visiblePour = (c, valeur) => !c || !c.termes || !c.termes.length ? true
  : (c.liaison === 'ou' ? c.termes.some(t => vraiPour(t, valeur)) : c.termes.every(t => vraiPour(t, valeur)));

// Un champ → un paramètre Make, ou une raison de ne pas le rendre.
function parametre(c, ecarts, verbe) {
  if (AFFICHAGE.includes(c.nature)) { ecarts.push([verbe, c.chemin, 'décor de canevas']); return null; }
  if (LISTES[c.nature]) {
    const l = LISTES[c.nature];
    return { name: c.chemin, type: 'select', label: c.label || c.chemin,
             options: { store: `rpc://${l.rpc}` } };
  }
  if (RESSOURCES_APS.includes(c.nature)) {
    ecarts.push([verbe, c.chemin, `ressource APS « ${c.nature} » → texte libre`]);
    return { name: c.chemin, type: 'text', label: c.label || c.chemin,
             help: 'Référence de ressource APS — saisie libre hors d\'APS' };
  }
  const t = TYPE[c.nature];
  if (!t) { ecarts.push([verbe, c.chemin, `nature « ${c.nature} » sans équivalent`]); return null; }
  const p = { name: c.chemin, type: t, label: c.label || c.chemin };
  if (c.nature === 'texteLong') p.multiline = true;
  if (Array.isArray(c.options) && c.options.length) {
    p.options = c.options.map(o => ({ label: o.libelle || String(o.valeur), value: o.valeur }));
  }
  if (c.placeholder) p.help = c.placeholder;
  return p;
}

// Les paramètres d'un verbe, conditions INVERSÉES en `nested` quand elles
// tiennent toutes à un même champ.
function parametresDe(v, ecarts) {
  const champs = (v.configSchema.champs || []).filter(c => c.chemin !== 'label');
  const cond   = champs.filter(c => c.visibleSi && c.visibleSi.termes && c.visibleSi.termes.length);
  const pivots = [...new Set(cond.flatMap(c => c.visibleSi.termes.map(t => t.champ)))];

  if (pivots.length !== 1) {
    if (pivots.length > 1) ecarts.push([v.family, pivots.join('+'), 'plusieurs discriminants — conditions aplaties']);
    return champs.map(c => parametre(c, ecarts, v.family)).filter(Boolean);
  }
  const disc = champs.find(c => c.chemin === pivots[0]);
  if (!disc || !Array.isArray(disc.options) || !disc.options.length) {
    return champs.map(c => parametre(c, ecarts, v.family)).filter(Boolean);
  }
  const out = [];
  for (const c of champs) {
    if (c === disc) {
      const p = parametre(c, ecarts, v.family);
      if (!p) continue;
      p.options = disc.options.map(o => {
        const nested = cond.filter(x => visiblePour(x.visibleSi, o.valeur))
                           .map(x => parametre(x, ecarts, v.family)).filter(Boolean);
        const opt = { label: o.libelle || String(o.valeur), value: o.valeur };
        if (nested.length) opt.nested = nested;
        return opt;
      });
      out.push(p);
      continue;
    }
    if (cond.includes(c)) continue;              // vit désormais dans un `nested`
    const p = parametre(c, ecarts, v.family);
    if (p) out.push(p);
  }
  return out;
}

// Le rendu ne s'exécute qu'en usage direct. Les fonctions de correspondance,
// elles, sont partagées : la route d'interprétation les réutilise pour dire ce
// QUI SERAIT produit, sans jamais réécrire la même table deux fois.
if (require.main === module) (async () => {
  const cx = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const acces = Acces.construireAcces({
    baseUrl: cx.baseUrl, extraConfig: cx.extraConfig,
    authValue: cx.authValueEnc ? decrypt(cx.authValueEnc) : null }, cx.platform.authSpec);

  const verbes = (await prisma.nodeDefinition.findMany({ orderBy: { sortOrder: 'asc' } }))
    .filter(v => String(v.group || '').startsWith('plateforme:'));

  const ecarts = [], plan = [];
  for (const v of verbes) {
    const params = parametresDe(v, ecarts);
    const appel  = (v.description.appels || []).find(a => a.sortie && a.sortie.length);
    plan.push({ v, nom: technique(v.family), typeId: typeDe(v), params, appel, api: apiDe(v, ecarts),
                interface: appel ? appel.sortie.map(c => ({ name: c.nom, type: T_SORTIE[c.type] || 'any', label: c.nom })) : [] });
  }

  // Les RPC nécessaires : uniquement ceux qu'un champ réclame vraiment.
  const naturesVues = new Set(verbes.flatMap(v => (v.configSchema.champs || []).map(c => c.nature)));
  const rpcs = Object.entries(LISTES).filter(([n]) => naturesVues.has(n));

  const l = (s, n) => String(s).padEnd(n);
  console.log(`\n${verbes.length} façades à rendre · ${rpcs.length} RPC nécessaires\n`);
  console.log(l('VERBE', 26) + l('MODULE', 24) + l('TYPE', 9) + l('PARAMS', 8) + l('NESTED', 8) + l('REQUÊTES', 12) + 'SORTIE');
  console.log('─'.repeat(88));
  for (const p of plan) {
    // `options` vaut soit une liste de choix, soit `{store:'rpc://…'}` pour une
    // liste dynamique — seule la première porte des `nested`.
    const nested = p.params.reduce((s, x) =>
      s + (Array.isArray(x.options) ? x.options.filter(o => o.nested).length : 0), 0);
    console.log(l(p.v.family, 26) + l(p.nom, 24) + l(p.typeId === 9 ? 'search' : 'action', 9)
      + l(p.params.length, 8) + l(nested || '—', 8)
      + l(Array.isArray(p.api)
            ? p.api.length + (p.api[0] && p.api[0].condition ? ' altern.' : ' en suite')
            : p.api ? '1' : '—', 12)
      + (p.interface.length ? p.interface.length + ' champs' : '—'));
  }
  if (ecarts.length) {
    console.log(`\nÉcarts (${ecarts.length}) — ce qui ne se rend pas tel quel :`);
    ecarts.forEach(([v, c, r]) => console.log('   ' + l(v, 24) + l(c, 22) + r));
  }

  if (!ECRIRE) { console.log('\nLecture seule. Relancer avec --ecrire.'); return prisma.$disconnect(); }

  // ── Écriture ────────────────────────────────────────────────
  const apps = await ap(acces, 'GET', '/sdk/apps');
  const liste = (apps.corps.appsSdk || apps.corps.apps || []);
  const app = APP_VOULUE ? liste.find(a => a.name === APP_VOULUE) : liste[0];
  if (!app) { console.log('❌ aucune app custom — en créer une d\'abord'); return prisma.$disconnect(); }
  const A = `/sdk/apps/${app.name}/${app.version}`;
  console.log(`\nApp : ${app.name} v${app.version}\n`);

  for (const [nature, r] of rpcs) {
    const existe = await ap(acces, 'GET', `${A}/rpcs/${r.rpc}`);
    if (!existe.ok) await ap(acces, 'POST', `${A}/rpcs`, { name: r.rpc, label: r.titre });
    const api = await ap(acces, 'PUT', `${A}/rpcs/${r.rpc}/api`, {
      url: r.url, method: 'GET',
      response: { iterate: '{{body.objects}}',
                  output: { label: `{{item.${r.libelle}}}`, value: `{{item.${r.valeur}}}` } } });
    console.log((api.ok ? '✅' : '❌') + ` rpc ${l(r.rpc, 22)} ${r.url}` + (api.ok ? '' : ' — ' + api.brut));
  }

  for (const p of plan) {
    const existe = await ap(acces, 'GET', `${A}/modules/${p.nom}`);
    if (!existe.ok) {
      const c = await ap(acces, 'POST', `${A}/modules`,
        { name: p.nom, label: p.v.label.fr, typeId: p.typeId, description: p.v.family });
      if (!c.ok) { console.log(`❌ ${l(p.v.family, 26)} création — ${c.brut}`); continue; }
    }
    const rp = await ap(acces, 'PUT', `${A}/modules/${p.nom}/parameters`, p.params);
    let ra = { ok: true }, ri = { ok: true };
    if (p.api) ra = await ap(acces, 'PUT', `${A}/modules/${p.nom}/api`, p.api);
    if (p.interface.length) ri = await ap(acces, 'PUT', `${A}/modules/${p.nom}/interface`, p.interface);
    const tout = rp.ok && ra.ok && ri.ok;
    console.log((tout ? '✅' : '❌') + ' ' + l(p.v.family, 26) + l(p.nom, 24)
      + `${p.params.length} params` + (p.interface.length ? ` · ${p.interface.length} sorties` : '')
      + (tout ? '' : ` — params ${rp.statut} api ${ra.statut || '—'} interface ${ri.statut || '—'}`));

    if (tout) {
      const d = Object.assign({}, p.v.description, {
        rendus: Object.assign({}, p.v.description.rendus, {
          make: { app: app.name, version: app.version, module: p.nom, le: new Date().toISOString() } }) });
      await prisma.nodeDefinition.update({ where: { family: p.v.family }, data: { description: d } });
    }
  }
  console.log('\nNoms techniques mémorisés dans NodeDefinition.description.rendus.make');
  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });

module.exports = {
  TYPE, AFFICHAGE, LISTES, RESSOURCES_APS, T_SORTIE, COMPOSITIONS, compositionDe,
  technique, typeDe, parametre, parametresDe, apiDe, valeurMake, visiblePour,
};
