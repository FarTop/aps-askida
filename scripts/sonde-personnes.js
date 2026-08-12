// APS — scripts/sonde-personnes.js — créé le 2026-08-12
// ================================================================
// Mesurer la forme RÉELLE des cinq métiers de personnes dans Iconik, avant
// d'écrire le dédoublonnage de la politique `fusion`.
//
//   node scripts/sonde-personnes.js                 liste envs + correspondances
//   node scripts/sonde-personnes.js <envId> <BayardID>   sonde une collection
//
// POURQUOI. L'arbitrage du 2026-08-12 dit « fusion — dédoublonnage sur
// (external_id, job) ». Le `job` est fixé par la règle de correspondance
// (`persons[director]`), mais rien ne dit ce que porte VRAIMENT le champ
// Iconik `Realisateur` : une chaîne « Nom Prénom », une liste, ou un objet.
// Deviner ici, c'est écrire un dédoublonnage qui ne dédoublonne rien.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const { IconikClient } = require('../server/engine-builder/builder-iconik-client.js');

const METIERS = ['Realisateur', 'Acteur', 'AuteurOrigine', 'Auteur', 'Producteur'];

// Forme mesurée le 2026-08-12 sur DEV | BAYARD :
//   { <champ>: { name, type, values: [ { value, label? } ] } }
// et NON `metadata_values[champ].field_values` (la forme du search) — c'est
// bien ce que lit déjà builder-handler-iconik-resolve-ancestors.js.
function _val(mv, cle) {
  const vs = mv && mv[cle] && mv[cle].values;
  if (!vs || !vs.length) return undefined;
  return vs.map(v => v.value);
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const [envId, bayardId] = args;

  if (!envId) {
    const envs = await prisma.environment.findMany({
      select: { id: true, name: true, baseUrl: true, appId: true, tokenEnc: true },
    });
    console.log('ENVIRONNEMENTS');
    envs.forEach(e => console.log('  ' + e.id + '  ' + (e.name || '—') +
      '  ' + (e.baseUrl || '(défaut)') + '  auth=' + (!!e.appId && !!e.tokenEnc)));
    const maps = await prisma.mapping.findMany({ select: { id: true, name: true } });
    console.log('\nCORRESPONDANCES');
    maps.forEach(m => console.log('  ' + m.id + '  ' + m.name));
    await prisma.$disconnect();
    return;
  }

  const env = await prisma.environment.findFirst({ where: { id: envId } });
  if (!env || !env.appId || !env.tokenEnc) throw new Error('environnement sans credentials : ' + envId);
  const client = new IconikClient({
    baseUrl: env.baseUrl || 'https://app.iconik.io',
    appId: env.appId,
    authToken: decrypt(env.tokenEnc),
  });

  const res = await client.post('/API/search/v1/search/', {
    query: bayardId ? 'metadata.BayardID:"' + bayardId + '"' : 'metadata.TypeCollection:*',
    doc_types: ['collections'],
  });
  const objets = res.objects || [];
  console.log('TROUVÉ ' + objets.length + ' collection(s)\n');

  for (const o of objets.slice(0, 25)) {
    const md = await client.get('/API/metadata/v1/collections/' + o.id + '/');
    const mv = (md && md.metadata_values) || md || {};
    console.log('── ' + (o.title || o.id));
    if (process.argv.includes('--brut')) console.log(JSON.stringify(md, null, 2).slice(0, 4000));
    console.log('   TypeCollection : ' + JSON.stringify(_val(mv, 'TypeCollection')));
    console.log('   BayardID/Parent: ' + JSON.stringify(_val(mv, 'BayardID')) + ' / ' + JSON.stringify(_val(mv, 'ParentID')));
    METIERS.forEach(m => {
      const v = _val(mv, m);
      if (v !== undefined) console.log('   ' + m.padEnd(15) + JSON.stringify(v));
    });
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + e.message); process.exit(1); });
