// APS — scripts/derive-verbes.js — créé le 2026-08-10
// ================================================================
// LE CALCUL : dériver le catalogue des verbes en croisant les sources, et le
// déposer dans `NodeDefinition` — le modèle qui existe depuis l'origine et
// comptait zéro ligne.
//
//   node scripts/derive-verbes.js              lit, compare, n'écrit rien
//   node scripts/derive-verbes.js --ecrire     écrit NodeDefinition + apsMapping
//
// Rien n'est saisi ici. Chaque champ vient d'une source qui existait déjà :
//
//   identité      pivot-catalog-iconik.js   13 Cores, 11 façades : quel Core
//                                           une façade vise, ses ports, sa
//                                           `family` WFD d'origine
//   entrées       config-schema.js          les champs de chaque verbe, leurs
//                                           natures et leurs `visibleSi`
//   appels        mesure-facades.js         ce que le handler appelle, et d'où
//                                           vient l'URL (dont l'état APS)
//   contrat       ApiEndpoint (base)        la spécification de l'éditeur, pour
//                                           les appels dont le chemin est écrit
//                                           dans le code
//
// CE QUE LE CALCUL NE COUVRE PAS, et qu'il dit au lieu de le masquer :
//   — les champs CALCULÉS (une fonction, pas une déclaration) : ils ne se
//     rendent pas déclarativement chez une cible, il faut les porter à la main ;
//   — les paramètres de conception qui ne viennent d'aucun appel (le gabarit
//     d'arborescence de `iconik.create_tree`) — ils sortent des entrées, pas
//     des appels, et c'est pour ça que les deux sources sont croisées ;
//   — le découpage d'`iconik.action` : 41 appels sous un discriminant. Le calcul
//     compte, il ne tranche pas. (Iconik lui-même a tranché pareil sur son MCP :
//     un outil, un paramètre `operation`, des paramètres conditionnels.)
// ================================================================
'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const RACINE  = process.cwd();
const PUBLIC  = path.join(RACINE, 'server/public/builders/workflow');
const ECRIRE  = process.argv.includes('--ecrire');

const CAT     = require(path.join(PUBLIC, 'pivot-catalog-iconik.js'));
const SCHEMA  = require(path.join(PUBLIC, 'config-schema.js'));
const MESURE  = require(path.join(RACINE, 'scripts/mesure-facades.js'));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// ── Libellés et glyphes ─────────────────────────────────────────
// Ils vivent dans `workflow-canvas.js`, à l'intérieur d'une fonction : pas
// require-ables. Ils sont donc LUS dans le fichier plutôt que recopiés ici —
// une copie se serait désynchronisée au premier renommage, en silence.
function litteralObjet(src, nom) {
  const m = new RegExp('const ' + nom + '\\s*=\\s*(\\{[\\s\\S]*?\\n\\s*\\});').exec(src);
  if (!m) return null;
  try { return eval('(' + m[1] + ')'); } catch (_) { return null; }
}
const canevas    = fs.readFileSync(path.join(PUBLIC, 'workflow-canvas.js'), 'utf8');
const NOM_CORE   = litteralObjet(canevas, 'NOM_CORE')     || {};
const GLYPHE     = litteralObjet(canevas, 'GLYPHES_CORE') || {};
const PLATEFORME = { iconik: 'Iconik', aws_s3: 'AWS', vodfactory: 'VodFactory', aps: 'APS' };

// Même règle que la palette : `nodeLabel` s'il existe, sinon le suffixe de la
// façade mis en forme.
function libelleFacade(f) {
  if (CAT.FACADES[f] && CAT.FACADES[f].nodeLabel) return CAT.FACADES[f].nodeLabel;
  return f.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Les entrées, rendues transportables ─────────────────────────
// Un descripteur peut porter des FONCTIONS (`calcule`, `options` dynamiques…).
// JSON les perdrait en silence ; on les remplace par un marqueur et on les
// compte. Un champ calculé est précisément ce qu'une cible déclarative ne sait
// pas rendre : le dire est plus utile que de l'effacer.
function transportable(v, compteur) {
  if (typeof v === 'function') { compteur.n++; return { __calcule: true }; }
  if (Array.isArray(v)) return v.map(x => transportable(x, compteur));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = transportable(x, compteur);
    return o;
  }
  return v;
}

// ── Les `visibleSi`, lues au lieu d'être supposées ──────────────
// On a longtemps tenu pour acquis que ces conditions étaient « toutes des
// conditions de valeur, donc exprimables déclarativement ». Ce sont des
// FONCTIONS : sémantiquement des comparaisons, syntaxiquement du code. Une
// cible déclarative (le `nested` de Make, un Choice ASL) ne peut rien en faire
// tant qu'on n'a pas extrait la condition.
//
// On lit donc la source de chaque prédicat, on en tire les termes, puis — et
// c'est le seul contrôle qui vaille — on vérifie qu'il ne RESTE rien d'autre
// que de la ponctuation logique. Une condition dont le résidu n'est pas vide
// est déclarée non extractible, jamais devinée.
// Trois formes, dans cet ordre — la comparaison, l'appartenance, la présence.
// L'appartenance était la grande absente : `['a','b'].indexOf(m.lire('x')) >= 0`
// est tout aussi déclaratif qu'une égalité, et représentait 11 des 12
// conditions que la première passe déclarait illisibles.
const FORMES = [
  { nom: 'comparaison',
    re: /\(?\s*m\.lire\('([^']+)'\)\s*(?:\|\|\s*'([^']*)'\s*)?\)?\s*(===|!==)\s*'([^']*)'/g,
    lire: m => ({ champ: m[1], defaut: m[2] === undefined ? null : m[2],
                  operateur: m[3] === '===' ? 'egal' : 'different', valeurs: [m[4]] }) },
  { nom: 'appartenance',
    re: /\[([^\]]*)\]\.indexOf\(\s*m\.lire\('([^']+)'\)\s*\)\s*(>=\s*0|!==\s*-1|===\s*-1|<\s*0)/g,
    lire: m => ({ champ: m[2], defaut: null,
                  operateur: /===\s*-1|<\s*0/.test(m[3]) ? 'hors' : 'parmi',
                  valeurs: (m[1].match(/'([^']*)'/g) || []).map(s => s.slice(1, -1)) }) },
  { nom: 'presence',
    re: /(!{0,2})\s*m\.lire\('([^']+)'\)/g,
    lire: m => ({ champ: m[2], defaut: null,
                  operateur: m[1] === '!' ? 'vide' : 'renseigne', valeurs: [] }) },
];

function conditionDe(fn) {
  const src = String(fn);
  const corps = (src.slice(src.indexOf('{') + 1, src.lastIndexOf('}')) || '').trim();
  const termes = [];
  let residu = corps;
  for (const forme of FORMES) {
    for (const m of residu.matchAll(new RegExp(forme.re.source, 'g'))) {
      termes.push(Object.assign({ forme: forme.nom }, forme.lire(m)));
    }
    residu = residu.replace(new RegExp(forme.re.source, 'g'), '');
  }
  // Ce qui doit rester d'une condition entièrement lue : `return`, les
  // connecteurs, la ponctuation. Tout le reste est du code qu'on ne sait pas
  // traduire, et qu'on déclare tel quel plutôt que de le deviner.
  residu = residu.replace(/return|&&|\|\||[()\s;!]/g, '');
  return { termes, extractible: termes.length > 0 && residu === '',
           liaison: /\|\|/.test(corps) && /&&/.test(corps) ? 'mixte'
                  : /&&/.test(corps) ? 'et' : /\|\|/.test(corps) ? 'ou' : 'simple',
           residu: residu || null };
}

function entreesDe(core, facade) {
  let descripteurs;
  try { descripteurs = SCHEMA.pour({ core, facade }) || []; }
  catch (e) { return { champs: [], calcules: 0, erreur: e.message }; }

  // Les conditions sont lues AVANT la mise en forme transportable, qui
  // remplacerait les fonctions par un marqueur.
  const conditions = [];
  const voir = (v, chemin) => {
    if (Array.isArray(v)) return v.forEach(x => voir(x, chemin));
    if (!v || typeof v !== 'object') return;
    if (typeof v.visibleSi === 'function') {
      conditions.push(Object.assign({ chemin: v.chemin || chemin || null }, conditionDe(v.visibleSi)));
    }
    Object.entries(v).forEach(([k, x]) => { if (k !== 'visibleSi') voir(x, v.chemin || chemin); });
  };
  descripteurs.forEach(d => voir(d, null));

  const compteur = { n: 0 };
  const champs = transportable(descripteurs, compteur);
  // `calcules` ne compte plus les `visibleSi` : ce sont deux problèmes
  // distincts, et les mélanger gonflait le chiffre de 50 sur 73.
  return { champs, conditions,
           calcules: compteur.n - conditions.length,
           conditionnels: conditions.length,
           conditionsExtractibles: conditions.filter(c => c.extractible).length };
}

// ── Les appels, appariés à la spécification ─────────────────────
// Forme canonique : la query part, et tout paramètre de chemin devient `{}`.
// `/API/assets/v1/assets/{…}/` (mesuré) et `/API/assets/v1/assets/{asset_id}/`
// (déclaré) sont le même appel — sans cette normalisation, aucun ne s'apparie.
function canonique(chemin) {
  return String(chemin).split('?')[0].replace(/\{[^}]*\}/g, '{}');
}

// Un appel mesuré et une opération déclarée peuvent désigner la même chose sans
// s'écrire pareil. Trois cas, rencontrés en réel, nommés plutôt que confondus :
//
//   exact      même méthode, même chemin canonique.
//   figé       notre code écrit en dur un segment que la spec paramètre :
//              PUT /API/metadata/v1/collections/{}/views/{}/  (nous)
//              PUT /API/metadata/v1/{object_type}/{object_id}/views/{view_id}/
//              C'est bien le même appel — `collections` EST une valeur
//              d'`object_type`. On l'accepte, en le disant, et en préférant
//              toujours l'opération qui fige le moins de segments : sans ça
//              `/assets/relation_types/` s'apparierait à `/assets/{asset_id}/`.
//   partiel    le chemin mesuré est un préfixe, parce que le handler le
//              construit par concaténation. Ce n'est PAS un appariement : on
//              signale qu'un appel existe sans savoir lequel.
function apparier(methode, chemin, index) {
  const cible = canonique(chemin);
  const exact = index.parCle.get(methode + ' ' + cible);
  if (exact) return { op: exact, mode: 'exact' };

  const seg = cible.split('/');
  let meilleur = null, meilleurScore = Infinity;
  for (const op of index.parArite.get(methode + ':' + seg.length) || []) {
    const autres = canonique(op.path).split('/');
    let score = 0, compatible = true;
    for (let i = 0; i < seg.length; i++) {
      if (seg[i] === autres[i]) continue;
      if (autres[i] === '{}' && seg[i] !== '') { score++; continue; }   // segment figé chez nous
      compatible = false; break;
    }
    if (compatible && score < meilleurScore) { meilleur = op; meilleurScore = score; }
  }
  if (meilleur) return { op: meilleur, mode: 'figé', segments: meilleurScore };

  const prefixe = (index.tous || []).find(o => o.method === methode && canonique(o.path).startsWith(cible));
  if (prefixe) return { op: null, mode: 'partiel' };
  return { op: null, mode: 'absent' };
}

async function chargerSpec() {
  const specs = await prisma.apiSpec.findMany({
    where: { format: 'openapi' },
    select: { id: true, platformId: true, name: true },
  });
  const ops = await prisma.apiEndpoint.findMany({
    where: { specId: { in: specs.map(s => s.id) } },
    select: { id: true, specId: true, method: true, path: true, summary: true, requestSchema: true },
  });
  const parCle = new Map(), parArite = new Map();
  for (const o of ops) {
    const c = canonique(o.path);
    const cle = o.method + ' ' + c;
    if (!parCle.has(cle)) parCle.set(cle, o);
    const a = o.method + ':' + c.split('/').length;
    if (!parArite.has(a)) parArite.set(a, []);
    parArite.get(a).push(o);
  }
  return { specs, ops, parCle, parArite, tous: ops };
}

// ── Le calcul ───────────────────────────────────────────────────
(async () => {
  const index = await chargerSpec();
  const { specs, ops } = index;
  const plateformes = await prisma.platform.findMany({ select: { id: true, name: true } });
  const idPlateforme = n => (plateformes.find(p => p.name.toLowerCase() === String(n).toLowerCase()) || {}).id || null;

  // Mesure par nom de façade (une implémentation peut porter plusieurs noms).
  const parNom = new Map();
  MESURE.mesures.forEach(m => m.noms.forEach(n => parNom.set(n, m)));

  const verbes = [];

  // 1. Les 13 Cores — génériques, sans plateforme.
  for (const core of Object.keys(CAT.CORES)) {
    const m = parNom.get(core);
    verbes.push({
      family: core, platformId: null, groupe: 'core',
      label: { fr: NOM_CORE[core] || core, en: NOM_CORE[core] || core },
      icon: GLYPHE[core] || null,
      core, facade: null,
      ports: (CAT.CORES[core].ports || []).slice(),
      portsDynamiques: !!CAT.CORES[core].dynamicPorts,
      mesure: m || null,
      entrees: entreesDe(core, null),
    });
  }

  // 2. Les 11 façades — chacune vise un Core, déclaré par le catalogue.
  for (const [facade, f] of Object.entries(CAT.FACADES)) {
    const m = parNom.get(facade);
    const prefixe = facade.split('.')[0];
    verbes.push({
      family: facade, platformId: idPlateforme(PLATEFORME[prefixe] || prefixe),
      groupe: 'plateforme:' + (PLATEFORME[prefixe] || prefixe),
      label: { fr: libelleFacade(facade), en: libelleFacade(facade) },
      icon: GLYPHE[f.core] || null,
      core: f.core, facade,
      ports: (f.ports || CAT.CORES[f.core] && CAT.CORES[f.core].ports || []).slice(),
      portsDynamiques: false,
      familyWfd: f.family || null, service: !!f.isService,
      mesure: m || null,
      entrees: entreesDe(f.core, facade),
    });
  }

  // 3. Appariement des appels avec la spécification.
  let totalAppels = 0;
  const modes = { exact: 0, 'figé': 0, partiel: 0, absent: 0 };
  const mappingParOp = new Map();
  for (const v of verbes) {
    v.appels = [];
    if (!v.mesure) continue;
    for (const a of v.mesure.litteraux) {
      totalAppels++;
      const [methode, ...reste] = a.split(' ');
      const chemin = reste.join(' ');
      const r = apparier(methode, chemin, index);
      modes[r.mode]++;
      if (r.op) {
        if (!mappingParOp.has(r.op.id)) mappingParOp.set(r.op.id, new Set());
        mappingParOp.get(r.op.id).add(v.family);
      }
      v.appels.push({ methode, chemin, appariement: r.mode,
                      segmentsFiges: r.segments || 0,
                      endpointId: r.op ? r.op.id : null,
                      cheminDeclare: r.op ? r.op.path : null,
                      resume: r.op && r.op.summary ? (r.op.summary.fr || r.op.summary.description || null) : null });
    }
    v.assemblees = v.mesure.assemblees;
    v.http       = v.mesure.http;
    v.etatAps    = v.mesure.base;
    v.provenance = MESURE.familles(v.mesure);
    v.delegue    = v.mesure.delegations.map(d => d.vers);
    v.handler    = v.mesure.fichier;
  }

  // ── Rapport ───────────────────────────────────────────────────
  console.log(`\nSpécifications en base : ${specs.length} — ${ops.length} opérations`);
  console.log(`Catalogue : ${Object.keys(CAT.CORES).length} Cores + ${Object.keys(CAT.FACADES).length} façades = ${verbes.length} verbes\n`);

  const l = (s, n) => String(s).padEnd(n);
  console.log(l('VERBE', 26) + l('CORE', 15) + l('CHAMPS', 8) + l('COND', 6) + l('CALC', 6) + l('APPELS', 8) + 'PROVENANCE');
  console.log('─'.repeat(100));
  for (const v of verbes) {
    const nApp = (v.appels || []).length + (v.assemblees || 0);
    const app  = nApp ? `${(v.appels || []).filter(a => a.endpointId).length}/${nApp}` : '—';
    console.log(l(v.family, 26) + l(v.core, 15)
      + l(v.entrees.champs.length, 8) + l(v.entrees.conditionnels || 0, 6)
      + l(v.entrees.calcules || 0, 6) + l(app, 8)
      + ((v.provenance || ['—']).join('+')) + (v.delegue && v.delegue.length ? ' → ' + v.delegue.join(',') : ''));
  }

  const calculs = verbes.reduce((s, v) => s + (v.entrees.calcules || 0), 0);
  const conds   = verbes.reduce((s, v) => s + (v.entrees.conditionnels || 0), 0);
  const extrac  = verbes.reduce((s, v) => s + (v.entrees.conditionsExtractibles || 0), 0);
  console.log('─'.repeat(100));
  console.log(`Appels à chemin écrit : ${totalAppels} — ${modes.exact} exacts, ${modes['figé']} `
    + `à segment figé, ${modes.partiel} partiels (chemin construit par concaténation), `
    + `${modes.absent} sans opération déclarée.`);
  console.log(`Entrées : ${verbes.reduce((s, v) => s + v.entrees.champs.length, 0)} champs, `
    + `dont ${calculs} CALCULÉS (une fonction, à porter à la main).`);
  console.log(`Conditions de visibilité : ${extrac}/${conds} extraites en termes déclaratifs `
    + `(champ, opérateur, valeur) — rendables en \`nested\`.`);
  const rebelles = verbes.flatMap(v => (v.entrees.conditions || [])
    .filter(c => !c.extractible).map(c => `${v.family}.${c.chemin || '?'} → ${c.residu || 'aucun terme lu'}`));
  if (rebelles.length) {
    console.log(`Conditions non extractibles (${rebelles.length}) :`);
    rebelles.slice(0, 8).forEach(r => console.log('   ' + r));
    if (rebelles.length > 8) console.log(`   … et ${rebelles.length - 8} autres`);
  }
  const manquants = verbes.flatMap(v => (v.appels || [])
    .filter(a => a.appariement === 'absent').map(a => `${a.methode} ${a.chemin}`));
  if (manquants.length) {
    console.log(`Appels que la spécification ne déclare pas (${[...new Set(manquants)].length}) :`);
    [...new Set(manquants)].forEach(r => console.log('   ' + r));
  }
  const app  = (a, n) => String(a).padEnd(n);
  const figes = verbes.flatMap(v => (v.appels || []).filter(a => a.appariement === 'figé'));
  if (figes.length) {
    console.log(`Segments figés dans le code, paramétrés dans la spec (${figes.length}) — 3 exemples :`);
    figes.slice(0, 3).forEach(a => console.log('   ' + app(a.methode + ' ' + a.chemin, 52) + ' ↔ ' + a.cheminDeclare));
  }
  console.log(`Verbes dépendant de l'état d'APS : `
    + verbes.filter(v => v.etatAps).map(v => v.family).join(', '));
  const orphelins = verbes.filter(v => !v.mesure).map(v => v.family);
  if (orphelins.length) console.log(`Sans handler mesuré (rendu par le Core seul) : ${orphelins.join(', ')}`);

  if (!ECRIRE) {
    console.log('\nLecture seule. Relancer avec --ecrire pour déposer le catalogue.');
    return prisma.$disconnect();
  }

  // ── Écriture ──────────────────────────────────────────────────
  let ecrits = 0;
  for (let i = 0; i < verbes.length; i++) {
    const v = verbes[i];
    const donnees = {
      platformId: v.platformId,
      label: v.label,
      description: {
        provenance: v.provenance || [],
        appels: v.appels || [],
        appelsAssembles: v.assemblees || 0,
        appelsConfigures: v.http || 0,
        etatAps: !!v.etatAps,
        delegue: v.delegue || [],
        familyWfd: v.familyWfd || null,
        service: !!v.service,
        derivePar: 'scripts/derive-verbes.js',
        deriveLe: new Date().toISOString(),
      },
      icon: v.icon,
      group: v.groupe,
      configSchema: {
        core: v.core, facade: v.facade,
        ports: v.ports, portsDynamiques: v.portsDynamiques,
        champs: v.entrees.champs,
        champsCalcules: v.entrees.calcules || 0,
        champsConditionnels: v.entrees.conditionnels || 0,
      },
      engineHandler: v.handler || null,
      sortOrder: i,
    };
    await prisma.nodeDefinition.upsert({
      where: { family: v.family },
      update: donnees,
      create: Object.assign({ family: v.family }, donnees),
    });
    ecrits++;
  }

  // Retour vers la spécification : une opération sait quelle façade elle sert.
  // `apsMapping` portait déjà `retenu` (marquage manuel dans Infrastructure) —
  // on le complète, on ne l'écrase pas.
  let marquees = 0;
  for (const [opId, familles] of mappingParOp.entries()) {
    const actuel = (ops.find(o => o.id === opId) || {}).apsMapping || {};
    await prisma.apiEndpoint.update({
      where: { id: opId },
      data: { apsMapping: Object.assign({}, actuel, { facades: [...familles] }) },
    });
    marquees++;
  }

  console.log(`\n✅ ${ecrits} NodeDefinition déposées · ${marquees} opérations reliées à leur façade.`);
  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
