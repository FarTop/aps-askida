// APS — server/engine-builder/builder-handler-aps-registry.js — créé le 2026-08-05
// Port de id_generator(), server/engine/wfd-engine-handlers.js:246-361 — SANS
// le bloc `apiActions` (:317-353) : mécanisme mort signalé par le catalogue
// pivot lui-même (repose sur `conn.actions`, absent du modèle Connexion ;
// jamais exposé au panneau) — id_generator() ne peut alors jamais retourner
// autre chose que le port unique ('out', ports:['out'] dans le catalogue).
'use strict';

const BuilderContext = require('./builder-context.js');
const { bayardIdFor } = require('./builder-iconik-shared.js');

async function apsRegistry(step, ctx, deps) {
  const p = step.params || {};
  const type    = p.idType   || 'numeric';
  const length  = Math.max(1, Math.min(64, parseInt(p.idLength) || 8));
  const prefix  = p.idPrefix || '';
  const varName = p.varName  || 'generated_id';

  let id = '';
  switch (type) {
    case 'numeric': {
      const min = Math.pow(10, length - 1);
      const max = Math.pow(10, length) - 1;
      id = String(Math.floor(min + Math.random() * (max - min + 1)));
      break;
    }
    case 'uuid': {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const rnd = Math.random() * 16 | 0;
        return (c === 'x' ? rnd : (rnd & 0x3 | 0x8)).toString(16);
      });
      break;
    }
    case 'hex': {
      const arr = new Array(length).fill(0).map(() => Math.floor(Math.random() * 16).toString(16));
      id = arr.join('').toUpperCase();
      break;
    }
    case 'alphanumeric': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      id = new Array(length).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
      break;
    }
    case 'prefixed': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const body = new Array(length).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
      id = prefix + body;
      break;
    }
    case 'timestamp': {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ts = now.getFullYear().toString() +
        pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
        pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
      const rnd = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
      id = ts + '-' + rnd;
      break;
    }
    default:
      id = String(Math.floor(10000000 + Math.random() * 89999999));
  }

  if (type === 'numeric') {
    const assetId    = ctx.asset?.id || ctx.vars?.asset_id || '';
    const colId      = ctx.collection?.id || ctx.vars?.collection_id || '';
    const objectId   = assetId || colId;
    const objectType = assetId ? 'asset' : (colId ? 'collection' : 'asset');
    const orgId      = ctx.vars?.orgId || 'default';
    id = await bayardIdFor(deps.prisma, objectId, objectType, orgId, length, id);
  }

  const outputType = p.outputType || 'string';
  const finalId = outputType === 'integer' ? parseInt(id, 10) : id;
  BuilderContext.setVar(ctx, varName, finalId);
  BuilderContext.storeResult(ctx, '_id_generator', { type, id: finalId, varName, outputType });

  return { port: 'out' };
}

module.exports = apsRegistry;
