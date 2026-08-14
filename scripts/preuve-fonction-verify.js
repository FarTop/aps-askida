// APS — scripts/preuve-fonction-verify.js — créé le 2026-08-14
// ================================================================
// Preuve de `aps-verify`, la fonction générée pour la cible.
//
//   node scripts/preuve-fonction-verify.js
//
// HORS LIGNE : `fetch` est remplacé par un faux qui sert des réponses connues
// et COMPTE les appels. Aucun réseau, aucun AWS, aucune base.
//
// Ce qu'on prouve, et pourquoi ces quatre-là :
//   — le filtrage par niveau, seule raison d'être de cette fonction ;
//   — une réponse par point d'entrée : c'est ce qui a fait répondre 429 au
//     partenaire le 2026-08-10, et c'est invisible dans un résultat ;
//   — les opérateurs, un par un, y compris la valeur absente ;
//   — la forme exacte du résumé, que les messages d'historique recopient.
// ================================================================
'use strict';

const { handler } = require('./fonctions/fonction-verify.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + libelle);
  if (!ok) console.log('       attendu ' + JSON.stringify(attendu) + '\n       obtenu  ' + JSON.stringify(obtenu));
}

// Faux partenaire : une réponse fixe, et un compteur d'appels par URL.
let appels = [];
function fauxFetch(reponses) {
  return async function (url) {
    appels.push(url);
    const r = reponses[url.replace(/^https?:\/\/[^/]+/, '')];
    if (!r) return { ok: false, status: 404 };
    return { ok: true, status: 200, text: async () => JSON.stringify(r) };
  };
}

const CX = { baseUrl: 'https://partenaire.test' };

(async function () {
  console.log('\n── le filtrage par niveau ' + '─'.repeat(40));
  globalThis.fetch = fauxFetch({ '/a': { statut: 'ok' } });
  appels = [];
  let res = await handler({
    connexion: CX,
    typeCollection: 'Saison',
    checks: [
      { label: 'partout',  endpoint: '/a', path: 'statut', op: 'equals', value: 'ok' },
      { label: 'episode',  endpoint: '/a', path: 'statut', op: 'equals', value: 'ok', appliesTo: ['episode'] },
      { label: 'saison',   endpoint: '/a', path: 'statut', op: 'equals', value: 'ok', appliesTo: ['saison'] },
    ],
  });
  verifier('un contrôle « episode » ne compte pas sur une Saison', res.total, 2);
  verifier('et tout passe', res.checkerSummary, 'OK');

  console.log('\n── une réponse par point d\'entrée ' + '─'.repeat(32));
  globalThis.fetch = fauxFetch({ '/x': { a: 1, b: 2 }, '/y': { c: 3 } });
  appels = [];
  await handler({
    connexion: CX,
    checks: [
      { label: 'a', endpoint: '/x', path: 'a', op: 'not_empty' },
      { label: 'b', endpoint: '/x', path: 'b', op: 'not_empty' },
      { label: 'c', endpoint: '/y', path: 'c', op: 'not_empty' },
    ],
  });
  verifier('3 contrôles sur 2 URL = 2 appels, pas 3', appels.length, 2);

  console.log('\n── les opérateurs ' + '─'.repeat(48));
  globalThis.fetch = fauxFetch({ '/v': { texte: 'Bonjour', vide: '', n: 0 } });
  const un = async (op, chemin, valeur) => (await handler({
    connexion: CX, checks: [{ label: 'l', endpoint: '/v', path: chemin, op, value: valeur }],
  })).failures.length === 0;
  verifier('equals',        await un('equals', 'texte', 'Bonjour'), true);
  verifier('not_equals',    await un('not_equals', 'texte', 'Autre'), true);
  verifier('contains',      await un('contains', 'texte', 'onjou'), true);
  verifier('starts_with',   await un('starts_with', 'texte', 'Bon'), true);
  verifier('not_empty sur une chaîne vide échoue', await un('not_empty', 'vide'), false);
  verifier('not_empty sur un champ absent échoue', await un('not_empty', 'jamais'), false);
  // Le zéro est une valeur, pas une absence. Le moteur le traite ainsi
  // (`String(0)` vaut « 0 », qui n'est pas vide) et la fonction doit suivre.
  verifier('not_empty sur 0 passe',               await un('not_empty', 'n'), true);

  console.log('\n── la forme du résumé ' + '─'.repeat(44));
  globalThis.fetch = fauxFetch({ '/z': { statut: 'pending' } });
  res = await handler({
    connexion: CX,
    checks: [
      { label: 'avails', endpoint: '/z', path: 'statut', op: 'equals', value: 'success' },
      { label: 'images', endpoint: '/z', path: 'absent', op: 'not_empty' },
    ],
  });
  verifier('deux échecs comptés', [res.total, res.passed], [2, 0]);
  verifier('résumé « libellé: valeur lue », séparés par virgule',
    res.checkerSummary, 'avails: pending, images: échec');

  console.log('\n── un point d\'entrée injoignable ' + '─'.repeat(33));
  globalThis.fetch = fauxFetch({});
  res = await handler({ connexion: CX, checks: [{ label: 'k', endpoint: '/absent', op: 'not_empty' }] });
  verifier('l\'échec HTTP est un échec de contrôle, pas une exception',
    res.checkerSummary, 'k: HTTP 404');

  console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ Toutes les vérifications passent'));
  process.exitCode = echecs ? 1 : 0;
})();
