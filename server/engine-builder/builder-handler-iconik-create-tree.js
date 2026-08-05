// APS — server/engine-builder/builder-handler-iconik-create-tree.js — créé le 2026-08-05
// Port de create_tree(), server/engine/wfd-engine-handlers.js:1760-1930 (+
// _prochainNumeroFratrie:1727-1747). Le template est lu depuis
// `deps.resolved.trees[params.templateId]` (résolu en bloc par
// builder-resolver.js au démarrage du run) plutôt que d'une requête Prisma
// ad hoc dans le handler — petit nettoyage volontaire par rapport à WFD
// (wfd-engine-handlers.js:1766-1776, `arboTemplate.findUnique` dans le
// handler lui-même), sémantiquement identique, juste centralisé comme toutes
// les autres ressources d'org. Port unique déclaré par le catalogue pivot :
// ports: ['out', 'error'].
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik, bayardIdFor, nextOrderNumber } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

async function _prochainNumeroFratrie(iconikClient, parentIconikId, pad) {
  let max = 0;
  if (parentIconikId) {
    try {
      const result = await iconikClient.post('/API/search/v1/search/', {
        query: 'parent_id:"' + parentIconikId + '"',
        doc_types: ['collections'],
      });
      (result.objects || []).forEach(o => {
        const chiffres = String(o.title || '').match(/\d+/g);
        if (!chiffres || !chiffres.length) return;
        const n = parseInt(chiffres[chiffres.length - 1], 10);
        if (!isNaN(n) && n > max) max = n;
      });
    } catch (e) { /* numérotation depuis 1 */ }
  }
  const suivant = max + 1;
  return pad ? String(suivant).padStart(pad, '0') : String(suivant);
}

async function createTree(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.create_tree');

  const p = step.params || {};
  const templateId = p.templateId;
  if (!templateId) throw new Error('Créer arborescence : aucun template sélectionné');

  const templateRow = deps.resolved && deps.resolved.trees ? deps.resolved.trees[templateId] : null;
  if (!templateRow) throw new Error('Template "' + templateId + '" introuvable');
  const tpl = templateRow.config;

  const rootParentId = r(p.parentId || '{collection.id}', ctx);
  // Vue de repli, pour la racine et tout niveau qui ne déclare pas la
  // sienne. UNE SEULE vue au niveau de l'étape ne suffit pas dès qu'un
  // gabarit imbrique des types différents (ex. Créer Série pose aussi un
  // placeholder Saison + Episode) : chaque type Iconik a ses propres champs
  // de vue (VUE|SERIE|COLLECTION n'a pas NumeroSaison/NumeroEpisode, par
  // exemple), donc écrire un niveau Saison/Episode avec la vue Série ferait
  // silencieusement disparaître ces champs. `nodeDef.metadataViewId`
  // (Tree Builder, arbo-canvas.js) permet de la surcharger par niveau.
  const viewIdParDefaut = r(p.metadataViewId || '', ctx);
  const orgId         = ctx.vars?.orgId || 'default';
  const idLength      = Math.max(1, Math.min(64, parseInt(p.idLength) || 8));
  const idFieldName     = p.idFieldName     || 'BayardID';
  const parentFieldName = p.parentFieldName || 'ParentID';
  const typeFieldName   = p.typeFieldName   || 'TypeCollection';
  const parentSeedId = r(p.parentBayardId || '', ctx);
  const orderField = (p.orderFieldName || '').trim();
  const orderPad   = Math.max(0, Math.min(6, parseInt(p.orderPad) || 0));
  const orderSeed  = parseInt(r(p.orderSeed || '0', ctx)) || 0;
  const extraFields = (p.extraFields || [])
    .filter(f => f.key)
    .map(f => ({ key: f.key, value: r(f.value || '', ctx) }));

  const created = [];
  let lastGeneratedId = parentSeedId || null;

  async function creerNiveau(nodeDef, parentIconikId, isRoot) {
    let orderValue = null;
    if (orderField && isRoot) {
      try {
        const n = await nextOrderNumber(deps.prisma, orderField, String(parentIconikId || 'racine'), orderSeed);
        orderValue = orderPad ? String(n).padStart(orderPad, '0') : String(n);
        BuilderContext.setVar(ctx, orderField, orderValue);
      } catch (e) { /* champ et titre sans numéro */ }
    }

    let numeroValue = null;
    if (nodeDef.numberField) {
      const pad = Math.max(0, Math.min(6, parseInt(nodeDef.numberPad) || 0));
      try {
        numeroValue = await _prochainNumeroFratrie(iconikClient, parentIconikId, pad);
        BuilderContext.setVar(ctx, nodeDef.numberField, numeroValue);
      } catch (e) { /* échec numérotation par niveau */ }
    }

    const title = r(nodeDef.name || 'Sans nom', ctx);

    const col = await iconikClient.post('/API/assets/v1/collections/', {
      title, parent_id: parentIconikId || undefined,
    });
    if (!col.id) throw new Error('Échec création collection "' + title + '"');

    let generatedHere = null;
    const fields = {};

    extraFields.forEach(f => { fields[f.key] = { field_values: [{ value: f.value }] }; });

    if (nodeDef.collectionType) {
      fields[typeFieldName] = { field_values: [{ value: r(nodeDef.collectionType, ctx) }] };
    }

    if (nodeDef.generateId) {
      const seedId = String(Math.floor(Math.pow(10, idLength - 1) + Math.random() * (Math.pow(10, idLength) * 0.9)));
      generatedHere = await bayardIdFor(deps.prisma, col.id, 'collection', orgId, idLength, seedId);
      fields[idFieldName] = { field_values: [{ value: generatedHere }] };
      if (lastGeneratedId) fields[parentFieldName] = { field_values: [{ value: lastGeneratedId }] };
      lastGeneratedId = generatedHere;
    }

    if (orderField && orderValue !== null) {
      fields[orderField] = { field_values: [{ value: orderValue }] };
    }
    if (nodeDef.numberField && numeroValue !== null) {
      fields[nodeDef.numberField] = { field_values: [{ value: numeroValue }] };
    }

    const viewIdNiveau = r(nodeDef.metadataViewId || '', ctx) || viewIdParDefaut;
    if (viewIdNiveau && Object.keys(fields).length) {
      await iconikClient.put(`/API/metadata/v1/collections/${col.id}/views/${viewIdNiveau}/`, { metadata_values: fields });
    }

    created.push({ id: col.id, title, parentIconikId, bayardId: generatedHere, collectionType: nodeDef.collectionType || null });

    for (const child of (nodeDef.children || [])) {
      await creerNiveau(child, col.id, false);
    }
    return col;
  }

  const rootCol = await creerNiveau(tpl, rootParentId, true);

  const generatedOnly = created.filter(c => c.bayardId);
  const rootBayardId = generatedOnly.length ? generatedOnly[0].bayardId : '';
  const lastBayardId = generatedOnly.length ? generatedOnly[generatedOnly.length - 1].bayardId : '';

  const storeAs = p.storeAs || 'arbo';
  BuilderContext.storeResult(ctx, storeAs, { rootId: rootCol.id, created, rootBayardId, lastBayardId });
  BuilderContext.setVar(ctx, storeAs + '.rootId', rootCol.id);
  BuilderContext.setVar(ctx, storeAs + '.count', String(created.length));
  BuilderContext.setVar(ctx, storeAs + '.rootBayardId', rootBayardId);
  BuilderContext.setVar(ctx, storeAs + '.lastBayardId', lastBayardId);

  return { port: 'out' };
}

module.exports = createTree;
