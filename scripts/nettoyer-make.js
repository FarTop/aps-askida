// APS — scripts/nettoyer-make.js — créé le 2026-08-11
// ================================================================
// Retirer de chez la cible ce qu'APS y a produit.
//
//   node scripts/nettoyer-make.js            montre, n'efface rien
//   node scripts/nettoyer-make.js --ecrire   efface
//   node scripts/nettoyer-make.js --ecrire --stores   efface AUSSI les Data Stores
//
// POURQUOI CE FICHIER EXISTE. Le compte Make appartient à une collègue et sert
// la production. Une exploration qui laisse derrière elle des apps à moitié
// rendues, des connexions mortes et des scénarios en double fait payer son
// ménage à quelqu'un d'autre — et rend le compte illisible pour la personne
// qui y travaille vraiment.
//
// Ce n'est pas non plus une précaution : le rendu et l'émission sont
// idempotents et se rejouent en deux commandes. Ce qui est cher à refaire,
// ce sont les DONNÉES — 11 ressources et 124 lignes de registre, portées à
// 60 requêtes par minute. Elles sont donc épargnées par défaut, et il faut
// le demander explicitement pour y toucher.
//
// ── CE QU'ON RECONNAÎT COMME « À NOUS » ─────────────────────────
// Rien n'est deviné : une app custom rendue par APS, ses connexions (leur
// `accountName` vaut `app#<nom de l'app>`), et les scénarios qui référencent
// un de ses modules. Un scénario écrit à la main par un collègue ne porte
// aucun de nos modules — il n'est donc jamais touché.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');

const ECRIRE = process.argv.includes('--ecrire');
const STORES = process.argv.includes('--stores');

const ENTRE_APPELS = 1200;
let dernier = 0;
async function ap(a, m, c, b, essai) {
  const attente = ENTRE_APPELS - (Date.now() - dernier);
  if (attente > 0) await new Promise(r => setTimeout(r, attente));
  dernier = Date.now();
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if ((r.status === 403 || r.status === 429) && (essai || 0) < 3) {
    await new Promise(x => setTimeout(x, 5000 * ((essai || 0) + 1)));
    return ap(a, m, c, b, (essai || 0) + 1);
  }
  return { statut: r.status, corps: j, brut: t.slice(0, 200), ok: r.status >= 200 && r.status < 300 };
}

const l = (s, n) => String(s == null ? '' : s).padEnd(n);

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const cx = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const acces = Acces.construireAcces({
    baseUrl: cx.baseUrl, extraConfig: cx.extraConfig,
    authValue: cx.authValueEnc ? decrypt(cx.authValueEnc) : null }, cx.platform.authSpec);
  const equipe = Number((cx.extraConfig.contexteTest || {}).teamId) || 411248;

  // 1. Les apps custom.
  const ra = await ap(acces, 'GET', '/sdk/apps');
  const apps = (ra.corps && (ra.corps.appsSdk || ra.corps.apps)) || [];

  // 2. Les scénarios qui portent un de leurs modules. On LIT le blueprint
  //    plutôt que de se fier au nom : un nom se change, une référence non.
  const rs = await ap(acces, 'GET', `/scenarios?teamId=${equipe}`);
  const scenarios = [];
  for (const s of ((rs.corps && rs.corps.scenarios) || [])) {
    const b = await ap(acces, 'GET', `/scenarios/${s.id}/blueprint`);
    const bp = b.corps && b.corps.response && b.corps.response.blueprint;
    if (!bp) continue;
    let porte = false;
    (function v(f) { (f || []).forEach(function (m) {
      if (apps.some(a => String(m.module).startsWith('app#' + a.name + ':'))) porte = true;
      (m.routes || []).forEach(r => v(r.flow)); if (m.onerror) v(m.onerror); }); })(bp.flow);
    if (porte) scenarios.push(s);
  }

  // 3. Les connexions de ces apps.
  const rc = await ap(acces, 'GET', `/connections?teamId=${equipe}`);
  const connexions = ((rc.corps && rc.corps.connections) || [])
    .filter(c => apps.some(a => String(c.accountName) === 'app#' + a.name));

  // 4. Les Data Stores portés par APS — épargnés sauf demande explicite.
  const rd = await ap(acces, 'GET', `/data-stores?teamId=${equipe}`);
  const stores = ((rd.corps && rd.corps.dataStores) || []).filter(s => /^APS —/.test(s.name));

  console.log('\n── CE QUI SERAIT RETIRÉ ───────────────────────────────────────\n');
  console.log('APPS       ' + (apps.length ? apps.map(a => a.name).join(', ') : '—'));
  console.log('SCÉNARIOS  ' + (scenarios.length
    ? scenarios.map(s => s.id + ' « ' + s.name + ' »').join('\n           ') : '—'));
  console.log('CONNEXIONS ' + (connexions.length
    ? connexions.map(c => c.id + ' ' + c.accountName).join('\n           ') : '—'));
  console.log('\nDATA STORES ' + (stores.length
    ? stores.map(s => s.id + ' « ' + s.name + ' » ' + s.records + ' lignes').join('\n            ') : '—'));
  console.log(STORES ? '   → SERONT EFFACÉS (--stores)'
                     : '   → épargnés ; leurs données sont longues à reporter');

  if (!ECRIRE) { console.log('\nLecture seule. Relancer avec --ecrire.'); return prisma.$disconnect(); }

  console.log('\n── EFFACEMENT ─────────────────────────────────────────────────\n');
  // L'ordre compte : un scénario retient sa connexion, une connexion retient
  // son app. À l'envers, chaque suppression rendrait 406.
  for (const s of scenarios) {
    const r = await ap(acces, 'DELETE', `/scenarios/${s.id}`);
    console.log((r.ok ? '🧹' : '❌') + ' scénario  ' + l(s.id, 10) + s.name + (r.ok ? '' : '  ' + r.brut));
  }
  for (const c of connexions) {
    const r = await ap(acces, 'DELETE', `/connections/${c.id}`);
    console.log((r.ok ? '🧹' : '❌') + ' connexion ' + l(c.id, 10) + c.accountName + (r.ok ? '' : '  ' + r.brut));
  }
  for (const a of apps) {
    // Une app PUBLIQUE ne se supprime pas — « Can't delete public app ». Il
    // faut la reprivatiser d'abord. Le cas n'est pas théorique : on passe une
    // app en public en cherchant à la rendre utilisable, et on ne pense plus
    // à défaire ce qu'on a fait pour diagnostiquer.
    // Tenté sans condition : `GET /sdk/apps` ne rend PAS le drapeau `public`
    // (il faut la fiche détaillée), donc tester dessus revenait à ne jamais
    // reprivatiser. Sur une app déjà privée, l'appel est sans effet.
    const p = await ap(acces, 'POST', `/sdk/apps/${a.name}/${a.version}/private`, {});
    if (p.ok) console.log('   ' + l(a.name, 24) + 'repassée en privé');
    const r = await ap(acces, 'DELETE', `/sdk/apps/${a.name}/${a.version}`);
    console.log((r.ok ? '🧹' : '❌') + ' app       ' + l(a.name, 24) + (r.ok ? '' : r.brut));
  }
  if (STORES) for (const s of stores) {
    const r = await ap(acces, 'DELETE', `/data-stores?teamId=${equipe}&ids[]=${s.id}&confirmed=true`);
    console.log((r.ok ? '🧹' : '❌') + ' store     ' + l(s.id, 10) + s.name + (r.ok ? '' : '  ' + r.brut));
  }

  console.log('\nRefaire tout ça : `rendre-make.js --ecrire --neuve` puis `emettre-make.js <flux> --ecrire`.');
  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
