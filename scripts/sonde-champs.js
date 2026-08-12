// APS — scripts/sonde-champs.js — créé le 2026-08-12
// ================================================================
// Le schéma réel des champs Iconik visés par la correspondance VOD Factory :
// type, et pour les listes déroulantes les valeurs EXACTES acceptées.
//
//   node scripts/sonde-champs.js <envId>
//
// POURQUOI. Un `drop_down` refuse tout ce qui n'est pas une de ses options
// (Genres attend `av_genre_adventure`, pas « Aventure »), et un `date` refuse
// un `datetime`. Poser un jeu de valeurs sans avoir lu le schéma, c'est écrire
// des champs qui ne seront jamais lus — exactement le piège
// DatedeFinDroits/DatedeFindeDroits trouvé le 2026-08-12.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const { IconikClient } = require('../server/engine-builder/builder-iconik-client.js');

async function main() {
  const [envId] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!envId) throw new Error('usage : node scripts/sonde-champs.js <envId>');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const env = await prisma.environment.findFirst({ where: { id: envId } });
  if (!env) throw new Error('environnement inconnu');
  const client = new IconikClient({
    baseUrl: env.baseUrl || 'https://app.iconik.io',
    appId: env.appId,
    authToken: decrypt(env.tokenEnc),
  });

  // Les champs SOURCE de la correspondance « VOD Factory | Fields ».
  const m = await prisma.mapping.findFirst({ where: { name: { contains: 'VOD Factory' } } });
  const noms = (m.rules || []).map(r => (r.key || r.from || '').trim()).filter(Boolean);

  for (const nom of noms) {
    let f;
    try { f = await client.get('/API/metadata/v1/fields/' + nom + '/'); }
    catch (e) { console.log(nom.padEnd(22) + '❌ ' + e.message); continue; }
    let ligne = nom.padEnd(22) + String(f.field_type || '?').padEnd(12) +
                (f.multi ? 'multi ' : '      ');
    if (Array.isArray(f.options) && f.options.length) {
      ligne += f.options.map(o => o.value + (o.label && o.label !== o.value ? ' (' + o.label + ')' : '')).join(' | ');
    }
    console.log(ligne);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
