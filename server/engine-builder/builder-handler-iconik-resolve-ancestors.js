// APS — server/engine-builder/builder-handler-iconik-resolve-ancestors.js — créé le 2026-08-05
// Port de resolve_ancestors(), server/engine/wfd-engine-handlers.js:4499-4567.
// Ports du pivot : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik } = require('./builder-iconik-shared.js');

function _slug(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

async function resolveAncestors(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.resolve_ancestors');

  const p = step.params || {};
  const varName = p.varName || 'ancestorPath';

  const type     = ctx.vars?.TypeCollection || '';
  const univers  = ctx.vars?.Univers  || '';
  const bayardId = ctx.vars?.BayardID || '';
  const title    = ctx.vars?.title    || '';
  let   parentId = ctx.vars?.ParentID || '';

  const NIVEAUX = { 'Série': 0, 'Saison': 1, 'Episode': 2, 'Unitaire': 0 };
  const n = NIVEAUX[type];
  if (n === undefined) {
    BuilderContext.addError(ctx, step.id, 'resolve_ancestors : TypeCollection inconnu ou absent (' + type + ')', 'warn');
    return { port: 'error' };
  }

  const segments = [];
  if (type === 'Série')       segments.unshift(_slug(univers) + '_' + bayardId);
  else if (type === 'Saison') segments.unshift(_slug(title) + '_' + bayardId);
  else                        segments.unshift(_slug(title));

  for (let i = 0; i < n; i++) {
    if (!parentId) {
      BuilderContext.addError(ctx, step.id, 'resolve_ancestors : ParentID manquant au niveau ' + (i + 1), 'warn');
      return { port: 'error' };
    }
    let trouve;
    try {
      const res = await iconikClient.post('/API/search/v1/search/', {
        query: 'metadata.BayardID:"' + String(parentId).replace(/"/g, '\\"') + '"',
        doc_types: ['collections'],
      });
      trouve = (res.objects || [])[0];
    } catch (e) {
      BuilderContext.addError(ctx, step.id, 'resolve_ancestors : recherche ancêtre échouée — ' + e.message, 'warn');
      return { port: 'error' };
    }
    if (!trouve) {
      BuilderContext.addError(ctx, step.id, 'resolve_ancestors : aucune collection avec BayardID ' + parentId, 'warn');
      return { port: 'error' };
    }
    const md = await iconikClient.get('/API/metadata/v1/collections/' + trouve.id + '/');
    const mv = md || {};
    const aUnivers  = mv.Univers?.values?.[0]?.value  || '';
    const aBayardId = mv.BayardID?.values?.[0]?.value || '';
    const aParentId = mv.ParentID?.values?.[0]?.value || '';

    const estRacine = (i === n - 1);
    if (estRacine) segments.unshift(_slug(aUnivers) + '_' + aBayardId);
    else           segments.unshift(_slug(trouve.title) + '_' + aBayardId);
    parentId = aParentId;
  }

  BuilderContext.setVar(ctx, varName, segments.join('/'));
  return { port: 'out' };
}

module.exports = resolveAncestors;
