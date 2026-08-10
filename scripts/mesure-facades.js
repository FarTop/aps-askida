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
