// APS — scripts/preuve-verify-memo.js — créé le 2026-08-10
// ================================================================
// Preuve de la mémoire par endpoint du nœud Verify
// (builder-handler-verify.js).
//
//   node scripts/preuve-verify-memo.js
//
// Plusieurs contrôles interrogent souvent la même url pour en lire des champs
// différents. Verify appelait une fois PAR CONTRÔLE : 8 appels identiques par
// collection sur le manifeste VOD Factory, 64 par passage de STATUSES, assez
// pour déclencher un 429 côté partenaire (constaté en réel le 2026-08-10).
//
// Hors ligne : `globalThis.fetch` est remplacé par un faux qui compte les
// appels. Aucun réseau, aucun accès base.
// ================================================================
'use strict';

const verify = require('../server/engine-builder/builder-handler-verify.js');
const BuilderContext = require('../server/engine-builder/builder-context.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
}

// Les huit contrôles réels de STATUSES : quatre actions × (statut, date d'envoi),
// toutes sur la même url.
const URL_STATUSES = '/api/contents/12345/action-statuses';
const CHECKS = ['amazon_avails', 'amazon_data', 'amazon_pictures', 'amazon_videos'].flatMap(a => ([
  { label: a, method: 'GET', endpoint: URL_STATUSES, path: `results.amazon.actions.${a}.status`,  op: 'equals',    value: 'success' },
  { label: a, method: 'GET', endpoint: URL_STATUSES, path: `results.amazon.actions.${a}.sent_at`, op: 'not_empty', value: '' },
]));

const DEPS = {
  resolved: { connexions: { c1: { endpoint: 'https://exemple.invalid', authType: 'bearer', authValue: 'x' } } },
};

function poserFetch(reponse) {
  const appels = [];
  globalThis.fetch = async (url) => {
    appels.push(url);
    return { ok: reponse.ok, status: reponse.status, text: async () => JSON.stringify(reponse.body || {}) };
  };
  return appels;
}

async function lancer(reponse, checks) {
  const appels = poserFetch(reponse);
  const ctx = BuilderContext.createContext({});
  const step = { id: 'v', core: 'verify', label: 'V', params: { checks: checks || CHECKS, connexionId: 'c1' } };
  const res = await verify(step, ctx, DEPS);
  return { appels, ctx, port: res.port };
}

(async () => {
  console.log('\n── 8 contrôles sur la même url ──');
  const reponseOk = { ok: true, status: 200, body: { results: { amazon: { actions: {
    amazon_avails:   { status: 'ready', sent_at: '' },
    amazon_data:     { status: 'ready', sent_at: '' },
    amazon_pictures: { status: 'ready', sent_at: '' },
    amazon_videos:   { status: 'ready', sent_at: '' },
  } } } } };
  const a = await lancer(reponseOk);
  verifier('un seul appel réseau au lieu de huit', a.appels.length, 1);
  verifier('port de sortie inchangé', a.port, 'fail');
  verifier('les 8 contrôles sont bien évalués',
    (a.ctx.results.checkerResult || {}).total, 8);
  verifier('les 8 échecs sont bien rapportés',
    (a.ctx.results.checkerResult || {}).failures.length, 8);
  verifier('le résumé cite le statut réel',
    a.ctx.vars.checkerSummary.includes('ready'), true);

  console.log('\n── une url en erreur : chaque contrôle garde son échec ──');
  const b = await lancer({ ok: false, status: 404 });
  verifier('un seul appel réseau', b.appels.length, 1);
  verifier('8 échecs quand même (un par contrôle)',
    (b.ctx.results.checkerResult || {}).failures.length, 8);
  verifier('chacun porte le code HTTP',
    b.ctx.vars.checkerSummary.split(', ').every(s => s.includes('HTTP 404')), true);

  console.log('\n── deux urls distinctes : un appel chacune ──');
  const deuxUrls = [
    { label: 'a', method: 'GET', endpoint: '/api/un', path: 'x', op: 'not_empty', value: '' },
    { label: 'b', method: 'GET', endpoint: '/api/un', path: 'y', op: 'not_empty', value: '' },
    { label: 'c', method: 'GET', endpoint: '/api/deux', path: 'z', op: 'not_empty', value: '' },
  ];
  const c = await lancer({ ok: true, status: 200, body: { x: 1, y: 2, z: 3 } }, deuxUrls);
  verifier('2 appels pour 3 contrôles', c.appels.length, 2);
  verifier('urls distinctes appelées une fois chacune',
    c.appels.map(u => u.replace('https://exemple.invalid', '')).sort(), ['/api/deux', '/api/un']);
  verifier('tous les contrôles passent', (c.ctx.results.checkerResult || {}).failures.length, 0);
  verifier('port ok', c.port, 'ok');

  console.log(`\n${echecs === 0 ? '✅ Toutes les vérifications passent' : `❌ ${echecs} vérification(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch(e => { console.error('\n💥', e.message, '\n', e.stack); process.exit(1); });
