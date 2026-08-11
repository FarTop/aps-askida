// APS — scripts/mesure-facades.js — créé le 2026-08-10, réécrit le 2026-08-10
// ================================================================
// Que fait chaque façade, en appels ? Lecture STATIQUE des handlers du moteur
// natif — aucune exécution, aucun appel réseau, aucun accès base.
//
//   node scripts/mesure-facades.js
//
// Sert à dimensionner un émetteur : ce qu'un module d'app custom (Make) ou un
// état ASL devrait contenir pour chaque verbe.
//
// ── LE CRITÈRE : D'OÙ VIENT L'URL ───────────────────────────────
// La première version classait sur « ce fichier contient-il un `fetch` », ce
// qui rangeait en « logique pure » trois façades qui appellent le réseau depuis
// un fichier voisin. Le critère juste est la PROVENANCE, parce que c'est elle
// qui décide du coût de portage :
//
//   pure        ni réseau ni base            se rend en natif de la cible
//   config      l'URL vient d'une ressource  module HTTP standard de la cible
//   code        l'URL est écrite en dur      demande un module dédié
//   état APS    dépend de la base d'APS      ne se porte PAS sans transporter
//                                            l'état (Data Store, table…)
//
// La quatrième famille n'existait pas dans la première mesure et c'est la plus
// coûteuse : `aps.registry` ne fait aucun appel d'API, il lit et écrit
// `BayardRegistry` et `ApsCounter`. Un émetteur qui l'ignore produit un verbe
// qui marche en test et perd son unicité en production.
//
// ── DEUX MÉCANISMES À NE PAS CONFONDRE ──────────────────────────
// DÉLÉGATION — un fichier en require un autre EN ENTIER et l'appelle
//   (`http_sequence` → `http_request`, `iconik.set_metadata` → `iconik.action`).
//   Les appels du délégué comptent, mais le délégant en restreint souvent la
//   portée : `iconik.set_metadata` construit une étape virtuelle figée sur
//   `metadata_patch`/`metadata_collection`, soit 2 branches des 41. Le script
//   NOMME la délégation au lieu d'additionner — additionner donnerait 41 à une
//   façade qui en emprunte deux, ce que la première version faisait.
//
// IMPORT NOMMÉ — `const { bayardIdFor } = require('./builder-iconik-shared.js')`.
//   Seuls les appels de LA FONCTION importée comptent, pas ceux de son fichier :
//   `builder-iconik-shared.js` contient des appels Iconik, mais `aps.registry`
//   n'en prend que des fonctions qui n'en font aucun.
//
// LIMITE ASSUMÉE : l'extraction du corps d'une fonction compte les accolades
// sans comprendre chaînes ni commentaires. Les littéraux gabarits (`${x}`) sont
// équilibrés donc sans effet ; une accolade orpheline dans une chaîne fausserait
// la lecture. Vérifié sur les 7 fonctions réellement importées.
// ================================================================
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(process.cwd(), 'server/engine-builder');

const lire = f => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── Le registre : quelles façades, portées par quels fichiers ────
// Plusieurs noms partagent un fichier (`http_sequence`/`vodfactory.partner`,
// `history`/`iconik.history`, `deliver`/`aws_s3.deliver`) : ce sont des alias,
// pas des façades distinctes, et un émetteur n'en produira qu'un module.
const index = lire('builder-handlers-index.js');
const parVar = {};
[...index.matchAll(/const (\w+) = require\('\.\/([^']+)'\)/g)].forEach(m => { parVar[m[1]] = m[2]; });
const facades = [
  ...[...index.matchAll(/Registry\.register\('([^']+)',\s*require\('\.\/([^']+)'\)\)/g)].map(m => [m[1], m[2]]),
  ...[...index.matchAll(/Registry\.register\('([^']+)',\s*(\w+)\)/g)].filter(m => parVar[m[2]]).map(m => [m[1], parVar[m[2]]]),
];
const nomsDuFichier = {};
facades.forEach(([nom, f]) => { (nomsDuFichier[f] = nomsDuFichier[f] || []).push(nom); });

// ── Ce qu'un morceau de code appelle ─────────────────────────────
const RE_LITTERAL = /iconikClient\.(get|post|put|patch|delete)\(\s*(`[^`]+`|'[^']+')/g;
const RE_VARIABLE = /iconikClient\.(get|post|put|patch|delete)\(\s*([A-Za-z_]\w*)/g;

function analyser(src) {
  const litteraux = [...src.matchAll(RE_LITTERAL)].map(m =>
    m[1].toUpperCase() + ' ' + m[2].slice(1, -1).replace(/\$\{[^}]+\}/g, '{…}'));
  return {
    litteraux: [...new Set(litteraux)],
    assemblees: [...src.matchAll(RE_VARIABLE)].length,
    http: (src.match(/globalThis\.fetch\(|await fetch\(/g) || []).length,
    base: /prisma\.\w|\$queryRawUnsafe|\$executeRawUnsafe/.test(src),
  };
}

// Corps d'une fonction nommée, par appariement d'accolades.
function corpsDeFonction(src, nom) {
  const re = new RegExp('(?:^|\\n)\\s*(?:async\\s+)?function\\s+' + nom + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  const debut = src.indexOf('{', m.index + m[0].length - 1);
  if (debut < 0) return null;
  let prof = 0;
  for (let i = debut; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}' && --prof === 0) return src.slice(debut, i + 1);
  }
  return null;
}

// ── Mesure, fichier par fichier ─────────────────────────────────
// `\s*` autour du `=` : les handlers alignent leurs require en colonne, et un
// `=` précédé de plusieurs espaces faisait manquer TOUTES les délégations.
const RE_NOMMES  = /const\s+\{([^}]+)\}\s*=\s*require\('\.\/([\w-]+)\.js'\)/g;
const RE_ENTIER  = /const\s+(\w+)\s*=\s*require\('\.\/(builder-handler-[\w-]+)\.js'\)/g;

const mesures = [];
for (const fichier of Object.keys(nomsDuFichier)) {
  const src = lire(fichier);
  const direct = analyser(src);

  // Imports nommés : on descend dans LA fonction, pas dans son fichier.
  const herites = [];
  for (const m of src.matchAll(RE_NOMMES)) {
    const source = lire(m[2] + '.js');
    for (const nom of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const corps = corpsDeFonction(source, nom);
      if (!corps) continue;
      const a = analyser(corps);
      if (a.litteraux.length || a.assemblees || a.http || a.base) herites.push({ nom, ...a });
    }
  }

  // Délégations : un handler entier, requis puis appelé.
  const delegations = [];
  for (const m of src.matchAll(RE_ENTIER)) {
    if (!new RegExp('\\b' + m[1] + '\\s*\\(').test(src.replace(m[0], ''))) continue;
    delegations.push({ vers: (nomsDuFichier[m[2] + '.js'] || [m[2]])[0], fichier: m[2] + '.js' });
  }

  const litteraux  = [...new Set([...direct.litteraux, ...herites.flatMap(h => h.litteraux)])];
  const assemblees = direct.assemblees + herites.reduce((s, h) => s + h.assemblees, 0);
  const http       = direct.http + herites.reduce((s, h) => s + h.http, 0);
  const base       = direct.base || herites.some(h => h.base);

  mesures.push({ fichier, noms: nomsDuFichier[fichier], litteraux, assemblees, http, base,
                 herites, delegations });
}

// ── Classement par provenance ───────────────────────────────────
// Une façade peut relever de plusieurs familles : `verify` appelle Iconik ET
// une URL de configuration ; `iconik.create_tree` appelle Iconik ET dépend de
// la base. Les forcer dans une case unique était la seconde erreur de la
// première version. Elle est donc IMPRIMÉE une fois, dans sa famille la plus
// coûteuse à porter, les autres étant citées à côté.
const parFichier = {};
mesures.forEach(m => { parFichier[m.fichier] = m; });

function familles(m, vues) {
  const f = new Set();
  if (m.litteraux.length || m.assemblees) f.add('code');
  if (m.http) f.add('config');
  if (m.base) f.add('état APS');
  // Une délégation ne transmet pas ses appels — leur portée est restreinte par
  // l'étape virtuelle — mais elle transmet bien sa PROVENANCE : `http_sequence`
  // n'appelle rien lui-même et fait pourtant du HTTP de configuration.
  vues = vues || new Set();
  vues.add(m.fichier);
  for (const d of m.delegations) {
    const cible = parFichier[d.fichier];
    if (!cible || vues.has(d.fichier)) continue;
    familles(cible, vues).forEach(x => f.add(x));
  }
  if (!f.size) f.add('pure');
  return [...f];
}

// De la plus coûteuse à porter à la moins coûteuse.
const ORDRE = ['état APS', 'code', 'config', 'pure'];
const principale = m => ORDRE.find(c => familles(m).includes(c));

const ETIQUETTE = {
  pure       : 'LOGIQUE PURE — ni réseau ni base',
  config     : 'HTTP GÉNÉRIQUE — l\'URL vient de la configuration',
  code       : 'SPÉCIFIQUE PLATEFORME — l\'URL est écrite dans le code',
  'état APS' : 'ÉTAT APS — dépend de la base d\'APS, ne se porte pas seul',
};

// Le rapport n'est imprimé qu'en usage direct : `derive-verbes.js` require ce
// fichier pour ses mesures, il n'a que faire de son affichage.
function rapport() {
for (const cle of ['pure', 'config', 'code', 'état APS']) {
  const dedans = mesures.filter(m => principale(m) === cle);
  console.log(`\n══ ${ETIQUETTE[cle]} ══`);
  if (!dedans.length) { console.log('   (aucune)'); continue; }
  for (const m of dedans.sort((a, b) => a.litteraux.length - b.litteraux.length)) {
    const n = m.litteraux.length + m.assemblees;
    const autres = familles(m).filter(x => x !== cle);
    console.log(`\n   ${m.noms.join(' = ')}`
      + (n ? `  (${n} appel${n > 1 ? 's' : ''})` : '')
      + (autres.length ? `  [aussi : ${autres.join(', ')}]` : ''));
    m.litteraux.slice(0, 6).forEach(a => console.log('      ' + a));
    if (m.litteraux.length > 6) console.log(`      … et ${m.litteraux.length - 6} autres`);
    if (m.assemblees) console.log(`      ${m.assemblees} appel(s) dont l'URL est assemblée avant l'appel`);
    if (m.http) console.log(`      ${m.http} appel(s) HTTP dont l'URL vient de la configuration`);
    m.herites.forEach(h => {
      const q = h.litteraux.length + h.assemblees;
      // « dont » : ces appels sont DÉJÀ dans le total de la façade, la ligne
      // dit d'où ils viennent. Une délégation, elle, n'est jamais additionnée.
      console.log(`      dont via ${h.nom}() : ` + [q ? q + ' appel(s)' : '', h.base ? 'base APS' : '']
        .filter(Boolean).join(', '));
    });
    m.delegations.forEach(d => console.log(`      délègue à « ${d.vers} » — appels non additionnés, la portée est restreinte à l'étape virtuelle construite ici`));
  }
}

console.log('\n' + '─'.repeat(70));
const alias = facades.length - mesures.length;
console.log(`${facades.length} noms de façade pour ${mesures.length} implémentations (${alias} alias).`);
console.log('Rangées par leur provenance la plus coûteuse à porter :');
for (const cle of ORDRE) {
  const n = mesures.filter(m => principale(m) === cle).length;
  const aussi = mesures.filter(m => principale(m) !== cle && familles(m).includes(cle)).length;
  console.log(`   ${String(n).padStart(2)} × ${cle}` + (aussi ? `  (+${aussi} qui en relèvent aussi)` : ''));
}
console.log(`   ${mesures.filter(m => m.delegations.length).length} × dont la provenance vient d'une délégation`);
}

if (require.main === module) rapport();

module.exports = { mesures, facades, nomsDuFichier, familles, principale, rapport };

// ── LE CORPS DES REQUÊTES ───────────────────────────────────────
// Un module d'app custom qui déclare ses paramètres mais n'envoie rien est une
// coquille : `iconikSearch` avait ses 8 champs et postait à vide. Le corps est
// donc à extraire, et il l'est parce que les handlers l'écrivent presque
// toujours en clair, sur un motif régulier :
//
//   title: r(p.title || '{asset.id}', ctx)   un paramètre, avec un défaut
//   object_type: p.objectType || 'assets'    idem, sans résolution
//   status: 'ACTIVE'                         une constante
//   format_id: fid                           une variable locale — NON dérivable
//
// `r(x, ctx)` est le résolveur de variables du moteur ; chez une cible, c'est
// la saisie de l'opérateur. Une variable locale, en revanche, vient d'un calcul
// antérieur dans le handler : elle est signalée, jamais devinée.
// Le littéral doit suivre IMMÉDIATEMENT la virgule. Sans cette garde, un appel
// dont le second argument est une variable faisait avancer l'apparieur jusqu'à
// une accolade sans rapport — deux corps extraits étaient du bruit.
function litteralApres(src, i) {
  const suite = src.slice(i);
  const m = /^\s*\{/.exec(suite);
  if (!m) return null;
  const d = i + m[0].length - 1;
  let prof = 0;
  for (let j = d; j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}' && --prof === 0) return src.slice(d, j + 1);
  }
  return null;
}

// Découpe les paires de premier niveau d'un littéral, sans JSON.parse (ce n'est
// pas du JSON : il y a des appels de fonction dedans).
function pairesDe(litteral) {
  const corps = litteral.slice(1, -1);
  const out = []; let prof = 0, debut = 0;
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    if ('{(['.includes(c)) prof++;
    else if ('})]'.includes(c)) prof--;
    else if (c === ',' && prof === 0) { out.push(corps.slice(debut, i)); debut = i + 1; }
  }
  out.push(corps.slice(debut));
  return out.map(s => s.trim()).filter(Boolean);
}

// Une valeur par défaut n'est pas toujours une chaîne : `p.permissions ||
// ['read']`, `p.priority || 50`, `p.filter || {}`. La première version n'en
// acceptait que de chaînes et rejetait onze champs parfaitement lisibles.
const DEFAUT = "(?:'[^']*'|\"[^\"]*\"|`[^`]*`|\\[[^\\]]*\\]|\\{[^}]*\\}|-?\\d+(?:\\.\\d+)?|true|false)";
const FORMES_VALEUR = [
  // r(p.X || défaut, ctx)  — paramètre résolu à l'exécution
  { re: new RegExp("^r\\(\\s*p\\.(\\w+)\\s*(?:\\|\\|\\s*(" + DEFAUT + ")\\s*)?,\\s*ctx\\s*\\)$"),
    lire: m => ({ source: 'parametre', nom: m[1], defaut: m[2] || null, resolu: true }) },
  // p.X || défaut  — paramètre brut
  { re: new RegExp("^p\\.(\\w+)\\s*(?:\\|\\|\\s*(" + DEFAUT + "))?$"),
    lire: m => ({ source: 'parametre', nom: m[1], defaut: m[2] || null, resolu: false }) },
  // p.X !== undefined ? p.X : défaut  — un défaut qui n'écrase pas `false`
  { re: new RegExp("^p\\.(\\w+)\\s*!==\\s*undefined\\s*\\?\\s*p\\.\\1\\s*:\\s*(" + DEFAUT + ")$"),
    lire: m => ({ source: 'parametre', nom: m[1], defaut: m[2], resolu: false }) },
  // … || undefined  — le champ est OMIS s'il est vide, ce n'est pas un défaut
  { re: new RegExp("^r\\(\\s*p\\.(\\w+)\\s*(?:\\|\\|\\s*" + DEFAUT + "\\s*)?,\\s*ctx\\s*\\)\\s*\\|\\|\\s*undefined$"),
    lire: m => ({ source: 'parametre', nom: m[1], defaut: null, resolu: true, facultatif: true }) },
];

function valeurDe(val) {
  for (const f of FORMES_VALEUR) {
    const m = f.re.exec(val);
    if (m) return f.lire(m);
  }
  // Une chaîne constante est une chaîne ENTIÈRE, pas le début d'une
  // concaténation : `'parent_id:"' + parentIconikId + '"'` commence et finit
  // par une apostrophe et n'est pourtant pas une constante. Sans cette garde,
  // le rendu envoyait le code source de la concaténation comme valeur — une
  // valeur FAUSSE, ce qui est pire qu'une valeur absente.
  const chaine = /^'((?:[^'\\]|\\.)*)'$|^"((?:[^"\\]|\\.)*)"$|^`((?:[^`\\$]|\\.)*)`$/.exec(val);
  if (chaine) return { source: 'constante', valeur: chaine[1] ?? chaine[2] ?? chaine[3] };
  if (/^(true|false|-?\d+(?:\.\d+)?)$/.test(val)) return { source: 'constante', valeur: val };
  // Un tableau ou un objet littéral : lu pour de vrai, apostrophes tolérées.
  // S'il ne se lit pas, c'est qu'il contient du code — on ne le rend pas.
  if (/^[[{]/.test(val)) {
    try { return { source: 'constante', valeur: JSON.parse(val.replace(/'/g, '"')) }; }
    catch (_) { return { source: 'expression', code: val.replace(/\s+/g, ' ').slice(0, 60) }; }
  }
  if (/^[A-Za-z_]\w*$/.test(val)) return { source: 'locale', nom: val };
  if (/^[A-Za-z_]\w*\s*\|\|\s*undefined$/.test(val))
    return { source: 'locale', nom: val.split('|')[0].trim(), facultatif: true };
  return { source: 'expression', code: val.replace(/\s+/g, ' ').slice(0, 60) };
}

// Une variable locale vient souvent d'un paramètre, une ligne plus haut :
// `const aid = r(p.assetId || '{asset.id}', ctx);`. La résoudre d'un cran suffit
// à rendre lisibles dix champs de plus ; au-delà, c'est un vrai calcul.
function resoudreLocale(src, nom) {
  const m = new RegExp("const\\s+" + nom + "\\s*=\\s*([^;\\n]+);").exec(src);
  if (!m) return null;
  const v = valeurDe(m[1].trim());
  return v.source === 'parametre' ? v : null;
}

function champDe(paire, src) {
  const i = paire.indexOf(':');
  if (i < 0) return null;
  const cle = paire.slice(0, i).trim().replace(/^['"]|['"]$/g, '');
  if (!/^\w+$/.test(cle)) return null;
  const v = valeurDe(paire.slice(i + 1).trim());
  if (v.source === 'locale') {
    const r = resoudreLocale(src, v.nom);
    if (r) return Object.assign({ cle, via: v.nom }, r, v.facultatif ? { facultatif: true } : {});
  }
  return Object.assign({ cle }, v);
}

function corpsDe(src) {
  const out = [];
  const re = /iconikClient\.(post|put|patch)\(\s*(`[^`]*`|'[^']*')\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    const lit = litteralApres(src, m.index + m[0].length);
    if (!lit) continue;
    // La branche du `switch` qui porte l'appel : c'est elle qui relie une
    // valeur du discriminant (`actionType`) à SA requête. Sans ce lien, les 31
    // corps d'`iconik.action` sont un tas indistinct, et une cible qui sait
    // conditionner ses requêtes ne peut rien en faire.
    const avant = src.slice(0, m.index);
    const dernierCas = avant.lastIndexOf("case '");
    const cas = dernierCas >= 0
      ? (/^case '([^']+)'/.exec(avant.slice(dernierCas)) || [])[1] || null : null;
    // Les segments interpolés du chemin : `${aid}` nomme la variable qui les
    // remplit, et cette variable vient elle-même d'un paramètre. Les lire évite
    // de deviner — le rendu produisait `{{parameters.id}}` pour tout le monde,
    // donc un PATCH sur le mauvais objet.
    const brut = m[2].slice(1, -1);
    const segments = [...brut.matchAll(/\$\{([^}]+)\}/g)].map(x => {
      const nom = x[1].trim();
      const r = /^[A-Za-z_]\w*$/.test(nom) ? resoudreLocale(src, nom) : null;
      return r ? Object.assign({ via: nom }, r) : { source: 'expression', code: nom };
    });
    out.push({ methode: m[1].toUpperCase(),
               chemin: brut.replace(/\$\{[^}]+\}/g, '{…}'),
               cas, segments,
               champs: pairesDe(lit).map(p => champDe(p, src)).filter(Boolean) });
  }
  return out;
}

module.exports.corpsDe = corpsDe;
