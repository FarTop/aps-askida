// APS — scripts/auditer-correspondance-vodfactory.js — créé le 2026-08-12
// ================================================================
// Confronter la correspondance « VOD Factory | Fields » aux référentiels
// RÉELS du partenaire, champ par champ.
//
//   node scripts/auditer-correspondance-vodfactory.js
//
// POURQUOI. Les deux défauts trouvés le 2026-08-12 — cinq genres traduits vers
// des codes inexistants, un `type: magazine` que le partenaire ne connaît pas —
// avaient la même cause : une table écrite de mémoire, jamais confrontée à la
// liste officielle. Aucun des deux ne se voyait à la lecture ; les deux se
// voyaient en une requête.
//
// Ce script ne corrige rien. Il pose la question à la source et affiche
// l'écart, pour chaque champ dont les valeurs sont fermées :
//
//   Genres            GET /api/amazon/genres     432 codes
//   LangueOriginale   GET /api/languages         163 codes
//   Pays              GET /api/countries         249 codes
//   PaysdExploitation GET /api/countries         (même référentiel)
//   ContenuPrime      doc partenaire p.7         liste fermée de 4, pas d'endpoint
//   Classification    aucun référentiel exposé   (404 sur /ratings) — à vérifier à la main
//
// Il vérifie DEUX choses distinctes, et c'est la seconde qui a mordu :
//   • ce que la table PRODUIT est-il un code réel ?
//   • ce que le champ Iconik peut ÉMETTRE est-il couvert par la table ou
//     valide tel quel ? (une option de liste déroulante sans entrée dans la
//     table part telle quelle — c'est ainsi que « Unitaire » est passé.)
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const { IconikClient } = require('../server/engine-builder/builder-iconik-client.js');

const CONNEXION_VF = 'cmqp7eg4z0002q4u5q8c3gyej';   // VODFACTORY | PREPROD | API
const ENV_QA       = 'cmqp7dk000002p8u50on1l3e7';   // QA | ASKIDA

// champ Iconik → référentiel partenaire. `codes` null = pas d'endpoint, liste
// écrite depuis la doc.
const A_AUDITER = [
  { champ: 'Genres',            url: '/api/amazon/genres' },
  { champ: 'LangueOriginale',   url: '/api/languages' },
  { champ: 'Pays',              url: '/api/countries' },
  { champ: 'PaysdExploitation', url: '/api/countries' },
  { champ: 'ContenuPrime',      codes: ['program', 'serie', 'season', 'episode'],
    source: 'doc partenaire p.7 (liste fermée, aucun endpoint)' },
  { champ: 'Classification',    codes: null,
    source: 'aucun référentiel exposé — /api/ratings et /api/amazon/ratings répondent 404' },
];

// Chaque référentiel nomme son identifiant à SA façon : les genres et les
// langues exposent `code`, les pays n'en ont pas et portent `iso_3166_2` /
// `iso_3166_3`. Lire aveuglément `.code` rendait un ensemble vide, et un
// ensemble vide déclare tout invalide — la première version de ce script a
// ainsi accusé les huit pays d'être inconnus alors qu'ils passent en réel.
// Un audit qui se trompe dans ce sens-là est pire que pas d'audit : il fait
// corriger ce qui marche.
function _identifiants(x) {
  return [x.code, x.value, x.id, x.iso_3166_3, x.iso_3166_2].filter(Boolean).map(String);
}

async function refPartenaire(baseUrl, token, url, cache) {
  if (cache[url]) return cache[url];
  const r = await fetch(baseUrl + url + '?per_page=1000', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  });
  const j = await r.json();
  const arr = j.results || j.data || [];
  const set = new Set();
  arr.forEach(x => _identifiants(x).forEach(v => set.add(v)));
  if (!set.size) throw new Error('référentiel ' + url + ' : aucun identifiant reconnu dans ' + JSON.stringify(arr[0] || {}));
  cache[url] = set;
  return set;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const cx  = await prisma.connexion.findUnique({ where: { id: CONNEXION_VF } });
  const env = await prisma.environment.findFirst({ where: { id: ENV_QA } });
  const m   = await prisma.mapping.findFirst({ where: { name: { contains: 'VOD Factory' } } });
  if (!cx || !env || !m) throw new Error('connexion, environnement ou correspondance introuvable');

  const token  = decrypt(cx.authValueEnc);
  const iconik = new IconikClient({
    baseUrl: env.baseUrl || 'https://app.iconik.io', appId: env.appId, authToken: decrypt(env.tokenEnc),
  });
  const cache = {};
  let alertes = 0;

  console.log('Correspondance : ' + m.name);
  console.log('Partenaire     : ' + cx.baseUrl + '\n');

  for (const spec of A_AUDITER) {
    const regle = (m.rules || []).find(r => (r.key || r.from) === spec.champ);
    if (!regle) { console.log('── ' + spec.champ + ' : aucune règle\n'); continue; }

    let codes = null;
    if (spec.url)            codes = await refPartenaire(cx.baseUrl, token, spec.url, cache);
    else if (spec.codes)     codes = new Set(spec.codes);

    console.log('── ' + spec.champ + '  →  ' + (regle.value || regle.to) +
                '   [' + (spec.url || spec.source) + ']');

    if (!codes) { console.log('   ⚠ non vérifiable automatiquement — ' + spec.source + '\n'); continue; }

    // Compteur PROPRE À CE CHAMP : un total cumulé rendait « rien à signaler »
    // faux pour tous les blocs suivant le premier écart.
    const avant = alertes;

    // 1. Ce que la table produit existe-t-il ?
    (regle.children || []).forEach(function (c) {
      if (!codes.has(c.value)) { console.log('   ❌ table : ' + c.key + ' → ' + c.value + '  (code inconnu du partenaire)'); alertes++; }
    });

    // 2. Ce que le champ Iconik peut émettre est-il couvert ?
    let options = [];
    try {
      const f = await iconik.get('/API/metadata/v1/fields/' + spec.champ + '/');
      options = f.options || [];
    } catch (_) {}
    options.forEach(function (o) {
      const trad = (regle.children || []).find(c => c.key === o.value || c.key === o.label);
      if (trad) return;                 // couverte par la table
      if (codes.has(o.value)) return;   // valide telle quelle
      console.log('   ❌ option Iconik « ' + o.value + ' »' + (o.label ? ' (' + o.label + ')' : '') +
                  ' : aucune traduction, et inconnue du partenaire');
      alertes++;
    });

    // 3. Le repli peut-il produire une valeur non couverte ?
    if (regle.fallback === '{TypeCollection}') {
      ['Série', 'Saison', 'Episode', 'Unitaire'].forEach(function (t) {
        const trad = (regle.children || []).find(c => c.key === t);
        if (!trad && !codes.has(t)) { console.log('   ❌ repli {TypeCollection} = « ' + t + ' » : aucune traduction'); alertes++; }
      });
    }

    if (alertes === avant) console.log('   ✅ rien à signaler');
    console.log('');
  }

  console.log(alertes ? '⚠ ' + alertes + ' point(s) à corriger' : '✅ aucun écart détecté');
  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
