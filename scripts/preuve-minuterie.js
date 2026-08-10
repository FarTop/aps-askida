// APS — scripts/preuve-minuterie.js — créé le 2026-08-10
// ================================================================
// Preuve de la minuterie du moteur natif (server/engine-builder/
// builder-scheduler.js), portée depuis WFD.
//
//   node scripts/preuve-minuterie.js
//
// Deux volets :
//   A. Le planificateur cron, à sec — table de vérité sur l'expression, le
//      fuseau et la garde anti-double-départ. Aucun accès base, aucun run.
//   B. Bout en bout — crée un BuilderFlow JETABLE avec une minuterie
//      one-shot à quelques secondes, le publie, l'active, appelle reload(),
//      attend l'échéance, puis vérifie qu'une ligne BuilderRun existe avec
//      triggerType='timer'. Tout est supprimé en sortie, y compris en cas
//      d'échec.
//
// Sûr par construction : le document jetable n'a QU'UN trigger, aucune étape
// d'action. Rien n'est appelé chez Iconik, S3 ou le partenaire — contrairement
// à preuve-execution.js, ce script-ci est bien un test à sec.
// ================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const scheduler = require('../server/engine-builder/builder-scheduler.js');

let echecs = 0;
function verifier(libelle, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}${ok ? '' : `  — attendu ${attendu}, obtenu ${obtenu}`}`);
}

// ── Volet A — le vérificateur cron, à sec ────────────────────────
// Exerce le VRAI `creerVerificateurCron` (builder-scheduler.js) en lui
// injectant une horloge, plutôt que de réimplémenter le matcher — un test qui
// recopie le code qu'il teste ne prouve rien. Chaque cas rejoue une suite de
// sondes successives, exactement comme le setInterval de 30 s en production.
function voletA() {
  console.log('\n── A. Vérificateur cron (à sec, horloge injectée) ──');

  function comptePourExpression(expr, timezone, horloges) {
    let tirs = 0;
    let i = 0;
    const check = scheduler.creerVerificateurCron(
      expr, () => { tirs++; }, timezone, () => new Date(horloges[i]),
    );
    for (i = 0; i < horloges.length; i++) check();
    return tirs;
  }

  // Une échéance rencontrée deux fois dans la même minute ne doit partir
  // qu'une fois (la sonde tourne toutes les 30 s).
  verifier('cron "0 2 * * *" — deux sondes dans la même minute → 1 seul tir',
    comptePourExpression('0 2 * * *', null, ['2026-08-10T02:00:05', '2026-08-10T02:00:35']), 1);

  verifier('cron "0 2 * * *" — deux jours de suite → 2 tirs',
    comptePourExpression('0 2 * * *', null, ['2026-08-10T02:00:05', '2026-08-11T02:00:05']), 2);

  verifier('cron "0 2 * * *" — heure qui ne correspond pas → 0 tir',
    comptePourExpression('0 2 * * *', null, ['2026-08-10T03:00:05']), 0);

  // Jours de semaine : 2026-08-10 est un lundi, 2026-08-15 un samedi.
  verifier('cron "0 9 * * 1-5" — lundi → 1 tir',
    comptePourExpression('0 9 * * 1-5', null, ['2026-08-10T09:00:05']), 1);
  verifier('cron "0 9 * * 1-5" — samedi → 0 tir',
    comptePourExpression('0 9 * * 1-5', null, ['2026-08-15T09:00:05']), 0);

  // Le pas `*/n` est absent de WFD mais donné en exemple par l'aide du
  // panneau (config-schema.js:245) : sans lui l'expression ne partirait
  // jamais, en silence.
  verifier('cron "*/15 * * * *" — minutes 0/15/30/45 → 4 tirs',
    comptePourExpression('*/15 * * * *', null,
      ['2026-08-10T10:00:05', '2026-08-10T10:15:05', '2026-08-10T10:30:05', '2026-08-10T10:45:05']), 4);
  verifier('cron "*/15 * * * *" — minute 7 → 0 tir',
    comptePourExpression('*/15 * * * *', null, ['2026-08-10T10:07:05']), 0);

  // Le fuseau est réellement honoré (il était ignoré avant la correction
  // reprise de WFD) : 08:00 UTC vaut 10:00 à Paris en août (UTC+2), donc une
  // échéance "0 10 * * *" doit partir sur cette heure-là et pas sur 10:00 UTC.
  verifier('cron "0 10 * * *" en Europe/Paris — 08:00Z → 1 tir',
    comptePourExpression('0 10 * * *', 'Europe/Paris', ['2026-08-10T08:00:05Z']), 1);
  verifier('cron "0 10 * * *" en Europe/Paris — 10:00Z → 0 tir',
    comptePourExpression('0 10 * * *', 'Europe/Paris', ['2026-08-10T10:00:05Z']), 0);

  // Une expression malformée ne doit jamais partir « au hasard ».
  verifier('expression incomplète "0 2 *" → 0 tir',
    comptePourExpression('0 2 *', null, ['2026-08-10T02:00:05']), 0);
}

// ── Volet B — bout en bout, sur un flow jetable ──────────────────
async function voletB() {
  console.log('\n── B. Bout en bout (flow jetable, one-shot) ──');

  const org = await prisma.organisation.findFirst();
  if (!org) throw new Error('Aucune Organisation en base');

  const dansNSecondes = (n) => new Date(Date.now() + n * 1000).toISOString();

  // Document minimal : un trigger planifié, rien d'autre. Le run doit
  // démarrer et se terminer sans toucher à quoi que ce soit d'externe.
  const document = {
    pivot: '1.0',
    form: 'canonical',
    workflow: { name: 'ZZ PREUVE MINUTERIE', intent: '', status: 'draft', version: 1 },
    steps: [{
      id: 'trigger-preuve-1',
      core: 'trigger',
      label: 'Minuterie de preuve',
      params: { kind: 'schedule', timerMode: 'oneshot', oneshotDatetime: dansNSecondes(3) },
    }],
    edges: [],
  };

  const flow = await prisma.builderFlow.create({
    data: { orgId: org.id, name: 'ZZ PREUVE MINUTERIE — supprimable', document, active: true },
  });

  try {
    // 1. Non publié : reload() ne doit RIEN planifier (règle « jamais un
    //    brouillon », identique au webhook Custom Action).
    await scheduler.reload();
    verifier('non publié → aucune planification',
      scheduler.etat().some(e => e.flowId === flow.id), false);

    // 2. Publié + actif : la planification apparaît.
    await prisma.builderFlowVersion.create({ data: { flowId: flow.id, version: 1, document } });
    await scheduler.reload();
    const planifie = scheduler.etat().find(e => e.flowId === flow.id);
    verifier('publié + actif → planifié', !!planifie, true);
    if (planifie) console.log(`     ↳ ${planifie.planification}`);

    // 3. Désactivé : la planification disparaît.
    await prisma.builderFlow.update({ where: { id: flow.id }, data: { active: false } });
    await scheduler.reload();
    verifier('désactivé → déplanifié',
      scheduler.etat().some(e => e.flowId === flow.id), false);

    // 4. Réactivé avec une échéance proche : le run doit réellement partir.
    const doc2 = JSON.parse(JSON.stringify(document));
    doc2.steps[0].params.oneshotDatetime = dansNSecondes(3);
    await prisma.builderFlow.update({ where: { id: flow.id }, data: { active: true, document: doc2 } });
    await prisma.builderFlowVersion.update({
      where: { flowId_version: { flowId: flow.id, version: 1 } }, data: { document: doc2 },
    });
    await scheduler.reload();
    console.log('     ⏳ attente de l\'échéance (6 s)…');
    await new Promise(r => setTimeout(r, 6000));

    const runs = await prisma.builderRun.findMany({ where: { flowId: flow.id } });
    verifier('échéance atteinte → 1 BuilderRun créé', runs.length, 1);
    if (runs.length) {
      verifier('triggerType = "timer"', runs[0].triggerType, 'timer');
      verifier('triggerRef = "oneshot"', runs[0].triggerRef, 'oneshot');
      verifier('flowVersion = version publiée', runs[0].flowVersion, 1);
      verifier('statut du run', runs[0].status, 'success');
      // Le point qui compte pour la suite : une minuterie ne sème aucun objet.
      const vars = runs[0].vars || {};
      const semees = Object.keys(vars).filter(k => ['collection_id', 'asset_id', 'metadata_view_id'].includes(k));
      verifier('aucun objet semé dans le contexte (contrat d\'entrée)', semees.length, 0);
    }
  } finally {
    scheduler.stop();
    await prisma.builderRunEvent.deleteMany({ where: { run: { flowId: flow.id } } });
    await prisma.builderRun.deleteMany({ where: { flowId: flow.id } });
    await prisma.builderFlowVersion.deleteMany({ where: { flowId: flow.id } });
    await prisma.builderFlow.delete({ where: { id: flow.id } });
    console.log('     🧹 flow jetable supprimé');
  }
}

(async () => {
  voletA();
  await voletB();
  console.log(`\n${echecs === 0 ? '✅ Toutes les vérifications passent' : `❌ ${echecs} vérification(s) en échec`}\n`);
  await prisma.$disconnect();
  process.exit(echecs === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\n💥', e.message, '\n', e.stack);
  try { scheduler.stop(); await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
