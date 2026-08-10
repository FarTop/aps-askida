// APS — scripts/mesure-facades.js — créé le 2026-08-10
// ================================================================
// Que fait chaque façade, en appels d'API ? Lecture STATIQUE des handlers du
// moteur natif — aucune exécution, aucun appel réseau, aucun accès base.
//
//   node scripts/mesure-facades.js
//
// Sert à dimensionner un émetteur : ce qu'un module d'app custom (Make) ou un
// état ASL devrait contenir pour chaque verbe. Range les façades en trois
// familles — logique pure (se rend en natif de la cible), HTTP générique
// (l'URL vient d'une ressource d'org, pas du code), spécifiques plateforme
// (les seules qui demandent un module dédié).
//
// PRÉCAUTION DE MÉTHODE : ne comptent que les appels ÉCRITS DANS LE FICHIER de
// la façade. Une première version descendait dans les fichiers importés et
// attribuait à `iconik.set_metadata` les 41 appels de `iconik.action` au motif
// qu'elle en importe une fonction — chiffre faux d'un ordre de grandeur.
//
// Limites connues, à corriger si le classement doit servir de source : les
// façades dont le `fetch` vit dans un fichier voisin (`http_sequence`,
// `vodfactory.partner`, `aps.registry`) sont rangées en « logique pure » à
// tort. Les deux premières relèvent du HTTP générique, la troisième des
// spécifiques.
// ================================================================
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(process.cwd(), 'server/engine-builder');

const index = fs.readFileSync(path.join(DIR, 'builder-handlers-index.js'), 'utf8');
const direct = [...index.matchAll(/Registry\.register\('([^']+)',\s*require\('\.\/([^']+)'\)\)/g)].map(m => [m[1], m[2]]);
const parVar = {};
[...index.matchAll(/const (\w+) = require\('\.\/([^']+)'\)/g)].forEach(m => { parVar[m[1]] = m[2]; });
const indirect = [...index.matchAll(/Registry\.register\('([^']+)',\s*(\w+)\)/g)].filter(m => parVar[m[2]]).map(m => [m[1], parVar[m[2]]]);
const facades = [...direct, ...indirect];

// Uniquement les appels ÉCRITS DANS LE FICHIER de la façade. Les fonctions
// importées sont listées par leur nom, sans qu'on leur attribue les appels du
// fichier dont elles viennent — c'était le biais de la première mesure.
const RE_LITTERAL = /iconikClient\.(get|post|put|patch|delete)\(\s*(`[^`]+`|'[^']+')/g;
const RE_VARIABLE = /iconikClient\.(get|post|put|patch|delete)\(\s*([A-Za-z_]\w*)/g;
const RE_IMPORTS  = /const \{([^}]+)\} = require\('\.\/(builder-[\w-]+)\.js'\)/g;

const lignes = [];
for (const [nom, fichier] of facades) {
  const src = fs.readFileSync(path.join(DIR, fichier), 'utf8');
  const litt = [...src.matchAll(RE_LITTERAL)].map(m =>
    m[1].toUpperCase() + ' ' + m[2].slice(1, -1).replace(/\$\{[^}]+\}/g, '{…}'));
  const varia = [...src.matchAll(RE_VARIABLE)].map(m => m[1].toUpperCase() + ' <url construite>');
  const httpGenerique = /globalThis\.fetch\(|await fetch\(/.test(src);
  const importes = [...src.matchAll(RE_IMPORTS)]
    .flatMap(m => m[1].split(',').map(x => x.trim()).filter(Boolean));
  lignes.push({ nom, appels: [...new Set(litt)], variables: varia.length, httpGenerique, importes });
}

const pur      = lignes.filter(l => !l.appels.length && !l.variables && !l.httpGenerique);
const generique= lignes.filter(l => l.httpGenerique && !l.appels.length);
const iconik   = lignes.filter(l => l.appels.length || (l.variables && !l.httpGenerique));

console.log('══ 1. LOGIQUE PURE — aucun appel d\'API ══');
pur.forEach(l => console.log('   ' + l.nom));
console.log('\n══ 2. HTTP GÉNÉRIQUE — l\'URL vient de la configuration, pas du code ══');
generique.forEach(l => console.log('   ' + l.nom));
console.log('\n══ 3. SPÉCIFIQUES ICONIK — ce qui deviendrait un module d\'app custom ══');
iconik.sort((a,b) => a.appels.length - b.appels.length).forEach(l => {
  const n = l.appels.length + l.variables;
  console.log(`\n   ${l.nom}  (${n} appel${n>1?'s':''})`);
  l.appels.slice(0, 6).forEach(a => console.log('      ' + a));
  if (l.appels.length > 6) console.log(`      … et ${l.appels.length - 6} autres`);
  if (l.variables) console.log(`      ${l.variables} appel(s) dont l'URL est assemblée avant l'appel`);
});
console.log('\n' + '─'.repeat(70));
console.log(`${facades.length} façades — ${pur.length} logique pure · ${generique.length} HTTP générique · ${iconik.length} spécifiques Iconik`);
