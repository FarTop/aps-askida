// APS — scripts/sonde-make.js — créé le 2026-08-10
// ================================================================
// Relève ce que l'API Make expose à APS, à partir de la connexion enregistrée
// dans Administration › Connexions (plateforme « Make »).
//
//   node scripts/sonde-make.js
//
// LECTURE SEULE — que des GET. Aucune écriture, aucun scénario touché.
//
// Passe par server/lib/connexion-acces.js, donc par le même calcul d'URL et
// d'en-têtes que le moteur : ce que la sonde atteint, un nœud l'atteindra.
// Un 403 se distingue d'un 404 — le premier dit « portée de jeton
// insuffisante », le second « cette API n'existe pas ici ». Les confondre
// ferait conclure à tort qu'une capacité manque.
// ================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function appeler(base, headers, chemin) {
  const url = base + chemin;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
    clearTimeout(to);
    const txt = await r.text();
    let corps; try { corps = JSON.parse(txt); } catch (_) { corps = txt.slice(0, 200); }
    return { status: r.status, corps };
  } catch (e) {
    return { status: 0, corps: e.message };
  }
}

function resume(v, max = 3) {
  if (Array.isArray(v)) return `${v.length} élément(s)`;
  if (v && typeof v === 'object') return Object.keys(v).slice(0, max).join(', ') + (Object.keys(v).length > max ? '…' : '');
  return String(v).slice(0, 80);
}

(async () => {
  const conn = await prisma.connexion.findFirst({
    where: { platform: { slug: 'make' }, isActive: true },
    include: { platform: true },
  });
  if (!conn) throw new Error('Aucune connexion active rattachée à la plateforme « make »');

  const { baseUrl, headers } = Acces.acces(
    { baseUrl: conn.baseUrl, authType: conn.authType, extraConfig: conn.extraConfig,
      authValue: conn.authValueEnc ? decrypt(conn.authValueEnc) : null },
    conn.platform.authSpec,
  );
  console.log(`Connexion « ${conn.name} » → ${baseUrl}\n`);

  // ── Qui sommes-nous, et où ─────────────────────────────────────
  const moi = await appeler(baseUrl, headers, '/users/me');
  console.log(`GET /users/me  → ${moi.status}`);
  if (moi.status === 200) {
    const u = moi.corps.authUser || moi.corps.users || moi.corps;
    console.log('   ', resume(u, 8));
  }

  const orgs = await appeler(baseUrl, headers, '/organizations');
  console.log(`\nGET /organizations  → ${orgs.status}`);
  const listeOrgs = (orgs.corps && orgs.corps.organizations) || [];
  listeOrgs.forEach(o => console.log(`    #${o.id}  ${o.name}  (zone ${o.zone || '?'})`));

  const orgId = listeOrgs.length ? listeOrgs[0].id : null;

  // ── Équipes, puis scénarios ────────────────────────────────────
  let teams = [];
  if (orgId) {
    const t = await appeler(baseUrl, headers, `/teams?organizationId=${orgId}`);
    console.log(`\nGET /teams?organizationId=${orgId}  → ${t.status}`);
    teams = (t.corps && t.corps.teams) || [];
    teams.forEach(x => console.log(`    #${x.id}  ${x.name}`));
  }

  for (const team of teams) {
    const sc = await appeler(baseUrl, headers, `/scenarios?teamId=${team.id}`);
    const liste = (sc.corps && sc.corps.scenarios) || [];
    console.log(`\nGET /scenarios?teamId=${team.id}  → ${sc.status}  (${liste.length} scénario(s))`);
    liste.slice(0, 25).forEach(s =>
      console.log(`    #${s.id}  ${s.isActive ? '●' : '○'}  ${s.name}`));

    // Le blueprint est LE point qui décide : s'il est lisible, on a la
    // structure exacte d'un scénario, donc de quoi comparer avec un pivot.
    if (liste.length) {
      const bp = await appeler(baseUrl, headers, `/scenarios/${liste[0].id}/blueprint`);
      console.log(`\nGET /scenarios/${liste[0].id}/blueprint  → ${bp.status}`);
      if (bp.status === 200) {
        const b = (bp.corps && bp.corps.response && bp.corps.response.blueprint) || bp.corps.blueprint || bp.corps;
        const modules = (b && b.flow) || [];
        console.log(`    nom : ${b && b.name}`);
        console.log(`    modules : ${modules.length}`);
        modules.slice(0, 20).forEach(m => console.log(`      ${String(m.id).padStart(3)}  ${m.module}`));
      }
    }
  }

  // ── Apps custom (le sujet « façades ») ─────────────────────────
  console.log('\n── Apps custom ──');
  for (const chemin of ['/sdk/apps', `/sdk/apps?organizationId=${orgId}`, '/apps']) {
    const r = await appeler(baseUrl, headers, chemin);
    const n = (r.corps && (r.corps.apps || r.corps.appsList)) || null;
    console.log(`GET ${chemin}  → ${r.status}${n ? `  (${n.length} app(s))` : ''}`);
    if (r.status === 200 && n) n.slice(0, 15).forEach(a => console.log(`    ${a.name}  ${a.label || ''}`));
    else if (r.status !== 200) console.log('   ', resume(r.corps));
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\n💥', e.message);
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
