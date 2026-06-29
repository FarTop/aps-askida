// APS — server/lib/crypto.js
// Module partagé de chiffrement/déchiffrement AES-256-CBC
// Utilisé par connexions.js, environments.js et wfd-engine-express.js

'use strict';

const crypto = require('crypto');

function encrypt(text) {
  if (!text) return null;
  const key    = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decrypt(text) {
  if (!text) return '';
  try {
    const key      = crypto.scryptSync(process.env.APS_SECRET, 'aps-salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch { return ''; }
}

module.exports = { encrypt, decrypt };
