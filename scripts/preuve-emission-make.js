// APS — scripts/preuve-emission-make.js — créé le 2026-08-11
// ================================================================
// « Peut-on émettre un scénario Make de bout en bout, par API seule ? »
//
//   node scripts/preuve-emission-make.js            regarde, n'écrit rien
//   node scripts/preuve-emission-make.js --ecrire   fait la preuve, puis nettoie
//
// POURQUOI CE FICHIER. L'écran d'interprétation dit ce qu'un workflow
// DEVIENDRAIT ; il ne dit pas si on saurait le produire. On a d'abord répondu
// en lisant la spec : `POST /connections`, `POST /scenarios`, tout y est. Mais
// la veille, `POST …/functions` avait rendu 403 et `commit` 400 — l'existence
// d'une opération dans une spécification ne prouve pas que l'offre l'autorise.
// « Un 200 n'est pas un stockage », dans l'autre sens.
//
// Ce script tranche donc sur pièces plutôt que par déduction.
//
// ── CE QU'IL FAIT, ET CE QU'IL ÉVITE ────────────────────────────
// Le scénario de preuve n'utilise QUE des modules internes à Make (des
// variables posées puis relues). Il ne touche ni Iconik, ni S3, ni le
// partenaire : une preuve d'émission ne doit rien produire dans le monde réel.
//
// Il est créé, relu, exécuté, puis SUPPRIMÉ. Le compte appartient à une
// collègue et sert la production ; y laisser des traces serait payer la preuve
// au prix d'un ménage pour quelqu'un d'autre.
//
// La partie « module de notre app + connexion » est vérifiée à part, en
// écrivant le blueprint et en le relisant — jamais en l'exécutant.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');

const ECRIRE = process.argv.includes('--ecrire');

// 60 requêtes par minute (`license.apiLimit`), comme partout ailleurs.
const ENTRE_APPELS = 1100;
let dernier = 0;
async function ap(a, m, c, b, essai) {
  const attente = ENTRE_APPELS - (Date.now() - dernier);
  if (attente > 0) await new Promise(r => setTimeout(r, attente));
  dernier = Date.now();
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (r.status === 429 && (essai || 0) < 5) {
    await new Promise(x => setTimeout(x, 5000 * ((essai || 0) + 1)));
    return ap(a, m, c, b, (essai || 0) + 1);
  }
  return { statut: r.status, corps: j, brut: t.slice(0, 300), ok: r.status >= 200 && r.status < 300 };
}

const l = (s, n) => String(s == null ? '' : s).padEnd(n);
const etapes = [];
function noter(nom, r, precision) {
  etapes.push({ nom, statut: r.statut, ok: r.ok, precision: precision || null, brut: r.brut });
  console.log((r.ok ? '✅' : '❌') + ' ' + l(nom, 38) + l(r.statut, 6)
    + (r.ok ? (precision || '') : r.brut.replace(/\s+/g, ' ').slice(0, 120)));
  return r;
}

// Le scénario de preuve : deux modules internes, aucune sortie vers le monde.
// `util:SetVariables` puis `util:SetVariable2` — les deux vus dans les
// blueprints réels de l'équipe, donc rien d'exotique.
function blueprintDePreuve() {
  return {
    name: 'APS — PREUVE ÉMISSION (temporaire)',
    flow: [
      { id: 1, module: 'util:SetVariables', version: 1,
        parameters: {},
        mapper: { scope: 'roundtrip',
                  variables: [{ name: 'aps_preuve', value: 'emission-par-api' }] },
        metadata: { designer: { x: 0, y: 0, name: 'Poser une variable' } } },
      { id: 2, module: 'util:SetVariable2', version: 1,
        parameters: {},
        mapper: { name: 'aps_echo', scope: 'roundtrip', value: '{{1.aps_preuve}}' },
        metadata: { designer: { x: 300, y: 0, name: 'La relire' } } },
    ],
    metadata: { instant: false, version: 1,
                scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true },
                designer: { orphans: [] } },
  };
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const cx = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const acces = Acces.construireAcces({
    baseUrl: cx.baseUrl, extraConfig: cx.extraConfig,
    authValue: cx.authValueEnc ? decrypt(cx.authValueEnc) : null }, cx.platform.authSpec);
  const equipe = Number((cx.extraConfig.contexteTest || {}).teamId) || 411248;

  // ── CE QU'ON A SOUS LA MAIN ───────────────────────────────────
  console.log('\n── ÉTAT DES LIEUX ─────────────────────────────────────────────\n');

  const apps = await ap(acces, 'GET', '/sdk/apps');
  const app  = ((apps.corps && (apps.corps.appsSdk || apps.corps.apps)) || [])[0];
  console.log('app custom        ' + (app ? app.name + ' v' + app.version : '— aucune'));

  // Une app peut déclarer une connexion ; la nôtre n'en a jamais déclaré, car
  // `rendre-make.js` ne pousse que modules et RPC. Sans elle, aucun module de
  // l'app ne peut s'authentifier — et aucune instance ne peut être créée.
  let cnxApp = null;
  if (app) {
    const r = await ap(acces, 'GET', `/sdk/apps/${app.name}/connections`);
    cnxApp = ((r.corps && (r.corps.appConnections || r.corps.connections)) || [])[0] || null;
    console.log('connexion déclarée ' + (cnxApp ? cnxApp.name + ' (' + cnxApp.type + ')'
      : '— AUCUNE : les modules de l\'app ne peuvent pas s\'authentifier'));
  }

  const inst = await ap(acces, 'GET', `/connections?teamId=${equipe}`);
  const instances = (inst.corps && inst.corps.connections) || [];
  const miennes = instances.filter(x => cnxApp && String(x.accountType) === String(cnxApp.name));
  console.log('instances         ' + instances.length + ' dans l\'équipe, dont '
    + miennes.length + ' pour notre app');

  const s = await ap(acces, 'GET', `/scenarios?teamId=${equipe}`);
  console.log('scénarios         ' + (((s.corps && s.corps.scenarios) || []).length));

  if (!ECRIRE) {
    console.log('\nLecture seule. Relancer avec --ecrire pour faire la preuve.');
    return prisma.$disconnect();
  }

  // ── LA CONNEXION ──────────────────────────────────────────────
  // Le point qui décide de tout. Si créer une connexion demande un humain
  // devant un navigateur, alors « émettre » n'est pas vrai — il reste un geste
  // manuel au milieu de la chaîne. La connexion de l'app est de type `basic`
  // (`appId` + `token`), pas OAuth : rien n'exige de consentement.
  //
  // Les identifiants viennent d'APS et correspondent champ pour champ. On
  // prend la plateforme de test (ASKIDA), jamais celle d'un client.
  console.log('\n── LA CONNEXION ───────────────────────────────────────────────\n');

  const src = await prisma.connexion.findFirst({
    where: { name: { contains: 'ICONIK | ASKIDA | API' } } });
  let idCnx = miennes.length ? miennes[0].id : null;

  // Une app privée jamais figée n'expose pas de manifeste de connexion — c'est
  // l'hypothèse la plus probable derrière le « Failed to load manifest » que
  // rend la création. Le figeage se demande donc AVANT, et son échec explique
  // le suivant plutôt que de le laisser inexpliqué.
  //
  // (Le 400 de la veille était une lecture trop rapide : il manquait le
  // paramètre `notify`. Une fois fourni, la vraie réponse apparaît — 403.)
  if (app && !idCnx) {
    noter('POST …/commit (figer l\'app)',
      await ap(acces, 'POST', `/sdk/apps/${app.name}/${app.version}/commit`, { notify: false }));
  }

  if (!idCnx && src && cnxApp) {
    const r = noter('POST /connections', await ap(acces, 'POST', `/connections?teamId=${equipe}`, {
      accountName: 'APS — PREUVE (temporaire)',
      accountType: cnxApp.name,
      appId: (src.extraConfig && src.extraConfig.champs && src.extraConfig.champs.appId) || '',
      token: src.authValueEnc ? decrypt(src.authValueEnc) : '' }));
    idCnx = r.ok && r.corps && r.corps.connection && r.corps.connection.id;
  }
  if (idCnx) {
    // Créée n'est pas valide : la vérifier est la seule façon de le savoir.
    noter('POST …/test (vérification)', await ap(acces, 'POST', `/connections/${idCnx}/test`));
  }

  // ── LA PREUVE ─────────────────────────────────────────────────
  console.log('\n── ÉMISSION D\'UN SCÉNARIO DE PREUVE ───────────────────────────\n');

  const bp = blueprintDePreuve();
  // Le blueprint voyage en CHAÎNE, pas en objet — c'est le point le plus
  // facile à rater, et il ne se devine pas depuis le schéma.
  const cree = noter('POST /scenarios', await ap(acces, 'POST', '/scenarios', {
    teamId: equipe, name: bp.name, blueprint: JSON.stringify(bp), scheduling: JSON.stringify({ type: 'indefinitely', interval: 900 }) }));

  const id = cree.ok && cree.corps && cree.corps.scenario && cree.corps.scenario.id;
  if (!id) {
    console.log('\nLa création a échoué : la suite n\'aurait aucun sens.');
    return prisma.$disconnect();
  }
  console.log('   scénario ' + id + '\n');

  // Relire ce qu'on a écrit. Un 200 à la création ne dit pas ce qui a été gardé.
  const relu = await ap(acces, 'GET', `/scenarios/${id}/blueprint`);
  const rbp  = relu.corps && relu.corps.response && relu.corps.response.blueprint;
  noter('GET  …/blueprint (relecture)', relu,
    rbp ? (rbp.flow || []).length + ' modules relus, attendus ' + bp.flow.length : 'aucun blueprint');

  // Un scénario ne tourne pas tant qu'il n'est pas ACTIVÉ : le premier essai
  // rendait 422 « Scenario is not activated », que j'ai d'abord pris pour un
  // refus de la cible. C'était l'ordre des gestes, pas une permission.
  noter('POST …/start (activation)', await ap(acces, 'POST', `/scenarios/${id}/start`));
  noter('POST …/run (exécution)', await ap(acces, 'POST', `/scenarios/${id}/run`, { responsive: true }));
  noter('POST …/stop (désactivation)', await ap(acces, 'POST', `/scenarios/${id}/stop`));

  // Les post-its : mesurés hier comme portables, jamais essayés.
  noter('POST …/notes (post-it)', await ap(acces, 'POST', `/scenarios/${id}/notes`,
    { content: 'Post-it émis par APS — preuve d\'émission.' }));

  // Le module de NOTRE app, avec sa connexion. Écrit puis relu, jamais exécuté :
  // il appellerait Iconik pour de vrai.
  if (app && idCnx) {
    const mods = await ap(acces, 'GET', `/sdk/apps/${app.name}/${app.version}/modules`);
    const premier = ((mods.corps && mods.corps.appModules) || [])[0];
    if (premier) {
      const avec = JSON.parse(JSON.stringify(bp));
      avec.flow.push({ id: 3, module: `${app.name}:${premier.name}`, version: 1,
                       parameters: { __IMTCONN__: idCnx }, mapper: {},
                       metadata: { designer: { x: 600, y: 0, name: 'Module APS' } } });
      const maj = noter('PATCH /scenarios/{id} (module app)',
        await ap(acces, 'PATCH', `/scenarios/${id}`, { blueprint: JSON.stringify(avec) }),
        'module ' + premier.name);
      if (maj.ok) {
        const r2 = await ap(acces, 'GET', `/scenarios/${id}/blueprint`);
        const f2 = r2.corps && r2.corps.response && r2.corps.response.blueprint;
        const garde = f2 && (f2.flow || []).find(m => m.parameters && m.parameters.__IMTCONN__);
        noter('GET  …/blueprint (relecture 2)', r2,
          f2 ? (f2.flow || []).length + ' modules · connexion gardée : ' + (garde ? 'oui' : 'NON') : '');
      }
    }
  } else {
    console.log('⏭  module de l\'app non essayé — pas de connexion utilisable');
  }

  // ── LE MÉNAGE ─────────────────────────────────────────────────
  // Le compte sert la production et appartient à une collègue : une preuve qui
  // laisse des traces fait payer son ménage à quelqu'un d'autre.
  console.log('');
  noter('DELETE /scenarios/{id}', await ap(acces, 'DELETE', `/scenarios/${id}`));
  if (idCnx && !miennes.length) {
    noter('DELETE /connections/{id}', await ap(acces, 'DELETE', `/connections/${idCnx}`));
  }

  console.log('\n── VERDICT ────────────────────────────────────────────────────\n');
  etapes.forEach(e => console.log((e.ok ? '✅' : '❌') + ' ' + l(e.nom, 38) + e.statut));
  const ko = etapes.filter(e => !e.ok);
  console.log('\n' + (ko.length ? ko.length + ' opération(s) refusée(s) — la chaîne n\'est PAS complète'
                                : 'Chaîne complète : émettre un scénario ne demande aucun geste dans Make.'));

  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
