// APS — scripts/sonde-collection.js — créé le 2026-08-12
// ================================================================
// Où vit une collection, et que porte son arborescence ?
//
//   node scripts/sonde-collection.js <collectionId>          cherche sur TOUS les environnements
//   node scripts/sonde-collection.js <collectionId> <envId>  descend l'arbre sur un seul
//
// POURQUOI. Trois environnements Iconik sont configurés (DEV | BAYARD,
// QA | ASKIDA, PROD | BAYARD) et un identifiant de collection ne dit pas
// auquel il appartient. Se tromper de plateforme en ÉCRITURE serait une faute
// difficile à défaire — on mesure d'abord.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const { IconikClient } = require('../server/engine-builder/builder-iconik-client.js');

function _plat(md) {
  const plat = {};
  Object.entries(md || {}).forEach(function ([k, c]) {
    const vs = (c && c.values) || [];
    if (vs.length) plat[k] = vs.length === 1 ? vs[0].value : vs.map(v => v.value);
  });
  return plat;
}

async function clientPour(prisma, envId) {
  const env = await prisma.environment.findFirst({ where: { id: envId } });
  if (!env || !env.appId || !env.tokenEnc) return null;
  return new IconikClient({
    baseUrl: env.baseUrl || 'https://app.iconik.io',
    appId: env.appId,
    authToken: decrypt(env.tokenEnc),
  });
}

async function decrire(client, id, prof) {
  const marge = '  '.repeat(prof);
  let col;
  try { col = await client.get('/API/assets/v1/collections/' + id + '/'); }
  catch (e) { console.log(marge + '(' + id + ' illisible — ' + e.message + ')'); return; }
  const md = await client.get('/API/metadata/v1/collections/' + id + '/').catch(() => ({}));
  const plat = _plat(md);
  console.log(marge + '📁 ' + (col.title || id) + '   [' + (plat.TypeCollection || '?') +
              ']  BayardID=' + (plat.BayardID || '—'));
  const champs = Object.keys(plat).filter(k => ['TypeCollection', 'BayardID', 'ParentID'].indexOf(k) === -1);
  console.log(marge + '   ' + (champs.length ? champs.length + ' champs : ' + champs.join(', ') : 'AUCUNE métadonnée éditoriale'));

  const contenu = await client.get('/API/assets/v1/collections/' + id + '/contents/?per_page=50').catch(() => ({}));
  for (const o of (contenu.objects || [])) {
    if (o.object_type === 'collections') await decrire(client, o.id, prof + 1);
    else console.log(marge + '   🎬 ' + (o.title || o.id) + '  (' + o.object_type + ' ' + o.id + ')');
  }
}

async function main() {
  const [colId, envId] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!colId) throw new Error('usage : node scripts/sonde-collection.js <collectionId> [envId]');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  if (!envId) {
    const envs = await prisma.environment.findMany();
    for (const e of envs) {
      const client = await clientPour(prisma, e.id);
      if (!client) { console.log('— ' + e.name + ' : pas de credentials'); continue; }
      try {
        const col = await client.get('/API/assets/v1/collections/' + colId + '/');
        console.log('✅ ' + e.name + ' (' + e.id + ') — « ' + (col.title || '?') + ' »');
      } catch (err) {
        console.log('❌ ' + e.name + ' — ' + err.message);
      }
    }
    await prisma.$disconnect();
    return;
  }

  const client = await clientPour(prisma, envId);
  if (!client) throw new Error('environnement sans credentials : ' + envId);
  await decrire(client, colId, 0);
  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
