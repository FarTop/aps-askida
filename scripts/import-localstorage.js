// APS — scripts/import-localstorage.js
// Importe les données depuis un export localStorage Electron → PostgreSQL
// Usage : node scripts/import-localstorage.js ./aps-export.json

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Chiffrement AES-256 (même algo que le serveur utilisera)
function encrypt(text) {
  const APS_SECRET = process.env.APS_SECRET
  if (!text) return null
  if (!APS_SECRET) { console.warn('    ⚠ APS_SECRET non défini, valeur stockée en clair'); return text }
  const key = crypto.scryptSync(APS_SECRET, 'aps-salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: node scripts/import-localstorage.js ./aps-export.json')
    process.exit(1)
  }

  const raw = fs.readFileSync(path.resolve(filePath), 'utf8')
  const data = JSON.parse(raw)

  console.log('\n╔══════════════════════════════════════╗')
  console.log('║   APS — Import localStorage          ║')
  console.log('╚══════════════════════════════════════╝\n')

  // ─── 1. ORGANISATION ───────────────────────────────
  console.log('1/8 Organisation...')
  const orgName = data.context?.org || 'Groupe Bayard'
  const orgSlug = orgName.toLowerCase().replace(/\s+/g, '-')
  const org = await prisma.organisation.upsert({
    where: { slug: orgSlug },
    update: { name: orgName },
    create: { name: orgName, slug: orgSlug }
  })
  console.log(`    ✓ ${org.name} (${org.id})`)

  // ─── 2. PLATFORM & ENVIRONMENT ─────────────────────
  console.log('2/8 Platform & Environment...')
  const platform = await prisma.platform.upsert({
    where: { slug: 'iconik' },
    update: {},
    create: {
      name: 'Iconik',
      slug: 'iconik',
      type: 'integration',
      description: { fr: 'Iconik MAM', en: 'Iconik MAM' },
      version: '1.0.0'
    }
  })

  const envSlug = data.activeEnv || 'qa'
  const envName = data.context?.domain === 'qa' ? 'QA | ASKIDA' : envSlug.toUpperCase()
  const env = await prisma.environment.upsert({
    where: { orgId_slug: { orgId: org.id, slug: envSlug } },
    update: {},
    create: {
      orgId: org.id,
      name: envName,
      slug: envSlug,
      platformId: platform.id,
      isDefault: true
    }
  })
  console.log(`    ✓ Platform: ${platform.name} | Env: ${env.name}`)

  // ─── 3. CONNEXIONS ─────────────────────────────────
  console.log('3/8 Connexions...')
  let connCount = 0
  for (const c of data.connexions || []) {
    await prisma.connexion.upsert({
      where: { envId_name: { envId: env.id, name: c.name } },
      update: {},
      create: {
        envId: env.id,
        name: c.name,
        type: 'listener',
        direction: 'inbound',
        baseUrl: c.endpoint || null,
        authType: c.authType || null,
        authValueEnc: c.authValue ? encrypt(c.authValue) : null,
        extraConfig: { mappings: c.mappings || [] },
        isActive: true
      }
    })
    connCount++
  }
  console.log(`    ✓ ${connCount} connexion(s)`)

  // ─── 4. FLOWS ──────────────────────────────────────
  console.log('4/8 Flows...')
  let flowCount = 0
  for (const f of data.flows || []) {
    await prisma.flow.upsert({
      where: { envId_name: { envId: env.id, name: f.name } },
      update: { nodes: f.nodes || [], connections: f.connections || [] },
      create: {
        envId: env.id,
        name: f.name,
        description: f.description || null,
        nodes: f.nodes || [],
        connections: f.connections || [],
        isActive: true
      }
    })
    flowCount++
  }
  console.log(`    ✓ ${flowCount} flow(s)`)

  // ─── 5. MAPPINGS ───────────────────────────────────
  console.log('5/8 Mappings...')
  let mapCount = 0
  for (const m of data.mappings || []) {
    await prisma.mapping.upsert({
      where: { orgId_name: { orgId: org.id, name: m.name } },
      update: { rules: m.rows || [] },
      create: { orgId: org.id, name: m.name, rules: m.rows || [] }
    })
    mapCount++
  }
  console.log(`    ✓ ${mapCount} mapping(s)`)

  // ─── 6. PALNODES ───────────────────────────────────
  console.log('6/8 PalNodes...')
  let palCount = 0
  for (const p of data.palNodes || []) {
    const existing = await prisma.palNode.findFirst({
      where: { orgId: org.id, name: p.name }
    })
    if (!existing) {
      await prisma.palNode.create({
        data: { orgId: org.id, family: p.family, name: p.name, config: p.config || {} }
      })
    }
    palCount++
  }
  console.log(`    ✓ ${palCount} palNode(s)`)

  // ─── 7. NOMMAGES & SCRIPTS ─────────────────────────
  console.log('7/8 Nommages & Scripts...')
  let nomCount = 0
  for (const n of data.nommages || []) {
    await prisma.nommage.upsert({
      where: { orgId_name: { orgId: org.id, name: n.name } },
      update: { rules: n.steps || [] },
      create: { orgId: org.id, name: n.name, rules: n.steps || [] }
    })
    nomCount++
  }
  let scrCount = 0
  for (const s of data.scripts || []) {
    await prisma.script.upsert({
      where: { orgId_name: { orgId: org.id, name: s.name } },
      update: { content: s.code || '', lang: s.lang || 'javascript' },
      create: { orgId: org.id, name: s.name, lang: s.lang || 'javascript', content: s.code || '' }
    })
    scrCount++
  }
  console.log(`    ✓ ${nomCount} nommage(s), ${scrCount} script(s)`)

  // ─── 8. CONTACTS ───────────────────────────────────
  console.log('8/8 Contacts...')
  let ctcCount = 0
  for (const cl of data.contacts || []) {
    await prisma.contactList.upsert({
      where: { orgId_name: { orgId: org.id, name: cl.name } },
      update: { contacts: cl.contacts || [] },
      create: { orgId: org.id, name: cl.name, contacts: cl.contacts || [] }
    })
    ctcCount++
  }
  console.log(`    ✓ ${ctcCount} liste(s) de contacts`)

  console.log('\n✅ Import terminé avec succès !\n')
}

main()
  .catch(e => { console.error('Erreur import:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
