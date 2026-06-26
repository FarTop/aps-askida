require('dotenv').config();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function decrypt(text) {
  if (!text) return '';
  try {
    const key = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch(e) { return ''; }
}

async function run() {
  const envs = await prisma.environment.findMany();
  for (const env of envs) {
    const token = decrypt(env.tokenEnc);
    const r = await fetch(`${env.baseUrl}/API/metadata/v1/views/?per_page=1`, {
      headers: { 'App-ID': env.appId, 'Auth-Token': token, 'Accept': 'application/json' }
    });
    console.log(env.type, env.name, '→ status:', r.status, r.headers.get('content-type'));
  }
  await prisma.$disconnect();
}
run().catch(console.error);
