// APS — scripts/infra-vodfactory.js — créé le 2026-08-12
// ================================================================
// Poser VOD Factory dans Infrastructure : la plateforme, son schéma
// d'authentification, et la connexion MCP qui permet d'inventorier ses outils.
//
//   node scripts/infra-vodfactory.js            montre, n'écrit rien
//   node scripts/infra-vodfactory.js --ecrire   écrit
//
// Puis, pour l'inventaire lui-même (le mécanisme existe depuis le 2026-08-10) :
//   curl -X POST http://localhost:3000/api/platforms/<id>/mcp/inventaire
//
// ── LE PARTAGE, RAPPELÉ ─────────────────────────────────────────
//   Administration › Plateformes   l'outil existe, son type
//   Administration › Connexions    l'accès : URL réelle, secret chiffré
//   Infrastructure                 ce qu'il SAIT FAIRE : opérations, schémas
//
// ── POURQUOI LA PRÉPROD, ET PAS LEUR MCP DE PRODUCTION ──────────
// La doc ne documente QUE `https://otto-partner.vodfactory.com/mcp`, qui est
// la production. Mesuré le 2026-08-12 : notre jeton de préprod y est refusé
// (401), et le serveur MCP de la PRÉPROD existe pourtant bel et bien —
// `<baseUrl preprod>/mcp` répond et annonce 37 outils. On pointe donc là.
// Ce n'est pas qu'une précaution de principe : la liste contient
// `delete_content` (« This action is irreversible ») et
// `send_content_to_partners`. Explorer un catalogue de production avec ça à
// portée n'a aucune raison d'être.
//
// ── CE QUE L'INVENTAIRE A DÉJÀ APPRIS ───────────────────────────
// Le serveur expose 37 outils là où le PDF en documente 24, et leurs schémas
// d'entrée portent des contraintes que le PDF ne donne nulle part :
//
//   type            enum program|serie|season|episode|magazine|tv_show
//                   → `magazine` EXISTE, alors que la doc p.7 n'annonce que
//                     quatre valeurs. Notre correspondance avait été ajustée
//                     sur cette liste incomplète.
//   rating          enum [0,10,12,16,18], type integer
//                   → le référentiel que /api/ratings ne sert pas (404).
//   genres          « Max 3 for Amazon »
//   title           max 150 · synopsis max 400 · shortSynopsis max 150
//   originalTitle   max 150 · owner max 150 · frontUrl max 250
//   duration        en SECONDES
//   videoQuality    enum UHD|4K|HD|SD
//
// Aucune de ces contraintes n'est vérifiée par APS aujourd'hui. C'est
// exactement la matière que `auditer-correspondance-vodfactory.js` allait
// chercher endpoint par endpoint — ici elle est déclarée, et lisible par une
// machine.
// ================================================================
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { encrypt, decrypt } = require('../server/lib/crypto.js');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const ECRIRE     = process.argv.includes('--ecrire');
const CONN_REST  = 'cmqp7eg4z0002q4u5q8c3gyej';   // VODFACTORY | PREPROD | API
const NOM_PLAT   = 'VOD Factory';
const NOM_MCP    = 'VODFACTORY | PREPROD | MCP';

const AUTH_SPEC = {
  docs: 'https://otto-partner.vodfactory.com/api/documentation',
  auth: { kind: 'headers', headers: [{ name: 'Authorization', value: 'Bearer {token}' }] },
  fields: [{ name: 'token', label: 'Bearer token', secret: true, required: true,
             help: 'Jeton personnel fourni par VOD Factory' }],
};

async function main() {
  const rest = await prisma.connexion.findUnique({ where: { id: CONN_REST } });
  if (!rest) throw new Error('connexion REST VOD Factory introuvable');

  const urlMcp = (rest.baseUrl || '').replace(/\/+$/, '') + '/mcp';
  let plateforme = await prisma.platform.findFirst({ where: { name: NOM_PLAT } });
  let mcp        = await prisma.connexion.findFirst({ where: { name: NOM_MCP } });

  console.log('Plateforme     : ' + NOM_PLAT + (plateforme ? '  (existe, ' + plateforme.id + ')' : '  (à créer)'));
  console.log('Connexion MCP  : ' + NOM_MCP + (mcp ? '  (existe)' : '  (à créer)'));
  console.log('URL MCP        : ' + urlMcp);
  console.log('Rattachements  : ' + NOM_PLAT + ' ← les connexions VODFACTORY existantes');
  console.log(ECRIRE ? '\n⚠  MODE ÉCRITURE' : '\nMode lecture seule — relancer avec --ecrire pour appliquer');
  if (!ECRIRE) { await prisma.$disconnect(); return; }

  if (!plateforme) {
    plateforme = await prisma.platform.create({
      data: {
        name: NOM_PLAT, slug: 'vodfactory', type: 'Distribution VOD', version: '1.3.0',
        description: { fr: 'Agrégateur de distribution VOD (Amazon, Free, Molotov, Betv…)',
                       en: 'VOD distribution aggregator (Amazon, Free, Molotov, Betv…)' },
        authSpec: AUTH_SPEC,
      },
    });
  } else {
    plateforme = await prisma.platform.update({ where: { id: plateforme.id }, data: { authSpec: AUTH_SPEC } });
  }

  // La connexion MCP reprend le jeton de la connexion REST : même API, même
  // porteur. `authType: 'bearer'` est OBLIGATOIRE — sans lui, accesMcpDe ne
  // joint aucun en-tête et le serveur répond 401 (le piège déjà rencontré sur
  // le MCP Iconik le 2026-08-10).
  const donneesMcp = {
    orgId: rest.orgId, envId: rest.envId, platformId: plateforme.id,
    name: NOM_MCP, type: 'mcp', direction: 'outbound',
    baseUrl: urlMcp, authType: 'bearer',
    authValueEnc: encrypt(decrypt(rest.authValueEnc)),
    extraConfig: { champs: {}, description: 'Serveur MCP de préprod — la doc ne documente que celui de production.' },
    isActive: true,
  };
  mcp = mcp
    ? await prisma.connexion.update({ where: { id: mcp.id }, data: donneesMcp })
    : await prisma.connexion.create({ data: donneesMcp });

  // Rattacher les connexions VOD Factory existantes à la plateforme — c'est ce
  // rattachement qui fait que le formulaire Connexions sait quels champs
  // afficher, et qu'Infrastructure sait de quel outil elle parle.
  const orphelines = await prisma.connexion.findMany({
    where: { name: { startsWith: 'VODFACTORY' }, platformId: null },
  });
  for (const c of orphelines) {
    await prisma.connexion.update({ where: { id: c.id }, data: { platformId: plateforme.id } });
  }

  console.log('\n✅ plateforme ' + plateforme.id);
  console.log('✅ connexion MCP ' + mcp.id);
  console.log('✅ ' + orphelines.length + ' connexion(s) rattachée(s)');
  console.log('\nInventorier ses outils :');
  console.log('  curl -s -X POST http://localhost:3000/api/platforms/' + plateforme.id + '/mcp/inventaire');

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
