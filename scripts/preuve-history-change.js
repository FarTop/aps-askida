// APS — scripts/preuve-history-change.js — créé le 2026-08-10
// ================================================================
// Preuve du mode `whMode: 'change'` de Workflow History
// (builder-handler-history.js).
//
//   node scripts/preuve-history-change.js
//
// « change » n'écrit que si la ligne dit autre chose que la précédente. La
// comparaison ignore ce qui bouge à chaque passage sans rien apprendre : la
// date en tête de ligne et l'identifiant de run.
//
// Hors ligne : le client Iconik est un faux qui garde le champ en mémoire et
// compte les écritures. Aucun appel réseau, aucun accès base.
// ================================================================
'use strict';

const workflowHistory = require('../server/engine-builder/builder-handler-history.js');
const BuilderContext  = require('../server/engine-builder/builder-context.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
}

// Faux Iconik : conserve StatutPrime en mémoire, compte les PUT.
function fauxIconik(etat) {
  return {
    async get() { return { metadata_values: { StatutPrime: { field_values: [{ value: etat.valeur }] } } }; },
    async put(endpoint, corps) {
      etat.ecritures += 1;
      etat.valeur = corps.metadata_values.StatutPrime.field_values[0].value;
    },
  };
}

// Un passage = un run, donc un runId neuf à chaque fois (c'est le point : sans
// ça on testerait le mode 'update', pas 'change').
async function passer(etat, { mode, statut, message }) {
  const ctx = BuilderContext.createContext({});
  ctx.collection = { id: 'col-1' };
  const step = {
    id: 'histo', core: 'history', facade: 'iconik.history', label: 'Histo',
    params: {
      target: 'collection', targetId: 'col-1', mdField: 'StatutPrime',
      whMode: mode, whOrder: 'newest', whWfName: 'Prime',
      whStatut: statut, whMessage: message,
      whShowWf: true, whShowDate: true, whShowUser: false, whShowRunId: false,
    },
  };
  await workflowHistory(step, ctx, { iconikClient: fauxIconik(etat), resolved: {} });
  return ctx;
}

const lignes = (etat) => etat.valeur ? etat.valeur.split('\n').filter(l => l.trim()) : [];

(async () => {
  console.log('\n── mode « change » : trois nuits qui disent la même chose ──');
  const e = { valeur: '', ecritures: 0 };
  const msg = 'Contenu prêt chez VOD Factory, pas encore transmis. ⚠️ avails: ready';
  await passer(e, { mode: 'change', statut: '🕗 Reporté', message: msg });
  verifier('1re nuit → 1 ligne', lignes(e).length, 1);
  await passer(e, { mode: 'change', statut: '🕗 Reporté', message: msg });
  await passer(e, { mode: 'change', statut: '🕗 Reporté', message: msg });
  verifier('3 nuits identiques → toujours 1 ligne', lignes(e).length, 1);
  verifier('et 1 seule écriture Iconik (les 2 autres n\'appellent pas put)', e.ecritures, 1);

  console.log('\n── le jour où ça change ──');
  await passer(e, { mode: 'change', statut: '✅ Succès', message: 'Publié sur Prime.' });
  verifier('statut différent → nouvelle ligne', lignes(e).length, 2);
  verifier('la nouvelle est en tête (whOrder: newest)', lignes(e)[0].includes('✅ Succès'), true);
  verifier('l\'ancienne est conservée', lignes(e)[1].includes('🕗 Reporté'), true);

  console.log('\n── un message qui change, à statut égal ──');
  const e2 = { valeur: '', ecritures: 0 };
  await passer(e2, { mode: 'change', statut: '🕗 Reporté', message: 'avails: ready' });
  await passer(e2, { mode: 'change', statut: '🕗 Reporté', message: 'avails: parent_not_sent' });
  verifier('même statut, message différent → 2 lignes', lignes(e2).length, 2);

  console.log('\n── ce que « add » continue de faire (défaut inchangé) ──');
  const e3 = { valeur: '', ecritures: 0 };
  for (let i = 0; i < 3; i++) await passer(e3, { mode: 'add', statut: '🕗 Reporté', message: msg });
  verifier('3 nuits identiques en « add » → 3 lignes', lignes(e3).length, 3);
  verifier('le journal complet reste possible', e3.ecritures, 3);

  console.log('\n── « update » n\'a jamais fait ça (un run neuf = une ligne de plus) ──');
  const e4 = { valeur: '', ecritures: 0 };
  for (let i = 0; i < 3; i++) await passer(e4, { mode: 'update', statut: '🕗 Reporté', message: msg });
  verifier('3 runs distincts en « update » → 3 lignes', lignes(e4).length, 3);

  console.log(`\n${echecs === 0 ? '✅ Toutes les vérifications passent' : `❌ ${echecs} vérification(s) en échec`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch(e => { console.error('\n💥', e.message, '\n', e.stack); process.exit(1); });
