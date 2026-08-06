// APS — server/engine-builder/builder-handler-aps-registry.js — créé le 2026-08-05
// Port de id_generator(), server/engine/wfd-engine-handlers.js:246-361 — SANS
// le bloc `apiActions` (:317-353) : mécanisme mort signalé par le catalogue
// pivot lui-même (repose sur `conn.actions`, absent du modèle Connexion ;
// jamais exposé au panneau) — id_generator() ne peut alors jamais retourner
// autre chose que le port unique ('out', ports:['out'] dans le catalogue).
'use strict';

const BuilderContext = require('./builder-context.js');
const { bayardIdFor, genererIdentifiant } = require('./builder-iconik-shared.js');

async function apsRegistry(step, ctx, deps) {
  const p = step.params || {};
  const type    = p.idType   || 'numeric';
  const length  = Math.max(1, Math.min(64, parseInt(p.idLength) || 8));
  const prefix  = p.idPrefix || '';
  const varName = p.varName  || 'generated_id';

  // Fabrique PARTAGÉE avec create_tree (builder-iconik-shared.js) : les deux
  // nœuds produisaient des formats étrangers l'un à l'autre sur le MÊME champ
  // Iconik.
  let id = genererIdentifiant(type, length, prefix);

  // Registre pour TOUS les types, plus seulement 'numeric'. C'était la moitié
  // manquante de la décision du 2026-07-29 : « calcul lisible (timestamp+aléa)
  // MAIS relation Iconik↔APS stockée dans le registre BayardRegistry ». Seul
  // le calcul avait été implémenté — un identifiant timestamp n'était donc
  // enregistré nulle part, et rien ne garantissait qu'un même objet retrouve
  // le sien. Le registre n'est pas une entrave à la portabilité : c'est une
  // table de correspondance exportable vers un orchestrateur tiers, et le
  // FORMAT reste calculable partout sans elle.
  const assetId    = ctx.asset?.id || ctx.vars?.asset_id || '';
  const colId      = ctx.collection?.id || ctx.vars?.collection_id || '';
  const objectId   = assetId || colId;
  const objectType = assetId ? 'asset' : (colId ? 'collection' : 'asset');
  const orgId      = ctx.vars?.orgId || 'default';
  id = await bayardIdFor(deps.prisma, objectId, objectType, orgId, length, id,
    function () { return genererIdentifiant(type, length, prefix); });

  const outputType = p.outputType || 'string';
  const finalId = outputType === 'integer' ? parseInt(id, 10) : id;
  BuilderContext.setVar(ctx, varName, finalId);
  BuilderContext.storeResult(ctx, '_id_generator', { type, id: finalId, varName, outputType });

  return { port: 'out' };
}

module.exports = apsRegistry;
