'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { decrypt } = require('../server/lib/crypto.js');
const Acces = require('../server/lib/connexion-acces.js');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let d = 0;
async function ap(a, m, c) {
  const w = 1100 - (Date.now() - d); if (w > 0) await new Promise(r => setTimeout(r, w)); d = Date.now();
  const r = await fetch(a.baseUrl + c, { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { corps: j };
}
(async () => {
  const cx = await prisma.connexion.findFirst({ where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const acces = Acces.construireAcces({ baseUrl: cx.baseUrl, extraConfig: cx.extraConfig,
    authValue: cx.authValueEnc ? decrypt(cx.authValueEnc) : null }, cx.platform.authSpec);
  const equipe = 411248;
  const s = await ap(acces, 'GET', `/scenarios?teamId=${equipe}`);
  const cible = new Set(['http:ActionSendData','util:SetVariables','util:SetVariable2','builtin:BasicRouter',
    'builtin:BasicFeeder','builtin:BasicAggregator','util:FunctionSleep','datastore:GetRecord',
    'datastore:SearchRecord','gateway:CustomWebHook']);
  const vus = new Map();
  for (const x of (s.corps.scenarios || [])) {
    const b = await ap(acces, 'GET', `/scenarios/${x.id}/blueprint`);
    const bp = b.corps && b.corps.response && b.corps.response.blueprint;
    if (!bp) continue;
    (function v(f) { (f||[]).forEach(m => {
      if (cible.has(m.module)) { if (!vus.has(m.module)) vus.set(m.module, new Set()); vus.get(m.module).add(m.version); }
      (m.routes||[]).forEach(r=>v(r.flow)); if (m.onerror) v(m.onerror);
    }); })(bp.flow);
  }
  console.log('\nVERSIONS OBSERVÉES');
  [...vus.entries()].sort().forEach(([m,vs])=>console.log('  '+m.padEnd(28)+[...vs].join(', ')));
  console.log('\nJamais vus : ' + [...cible].filter(c=>!vus.has(c)).join(', '));
  await prisma.$disconnect();
})();
