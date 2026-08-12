// APS — server/engine-builder/builder-handler-iconik-resolve-ancestors.js — créé le 2026-08-05
// Port de resolve_ancestors(), server/engine/wfd-engine-handlers.js:4499-4567.
// Ports du pivot : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik } = require('./builder-iconik-shared.js');
const { aplatirMetadonnees } = require('./builder-heritage.js');

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
  let   parentId = ctx.vars?.ParentID || '';

  // `title` n'est PAS une variable nue du contexte : le nœud Search ne pose
  // que la forme préfixée (`<resultVar>.title`, cf. builder-handler-iconik-
  // search.js — seules les MÉTADONNÉES sont exposées sous leur nom nu, et le
  // titre est un champ système). Lire `ctx.vars.title` seul donnait donc
  // toujours une chaîne vide, d'où un segment de chemin amputé de son nom :
  // « Galactica_17500196/_40209885 » au lieu de
  // « Galactica_17500196/Saison_01_40209885 » (constaté le 2026-08-06 sur la
  // première publication d'une Saison). Invisible au niveau Série, qui
  // compose son segment à partir de `Univers`, une vraie métadonnée. Aurait
  // été pire au niveau Episode, dont le segment est le SEUL slug du titre :
  // il aurait été entièrement vide. Même méprise que le repli mort
  // `{collectionCheck.title}` corrigé le même jour dans la correspondance.
  // `search_results` est le resultVar par défaut de la façade iconik.search —
  // même convention de nommage que TypeCollection/Univers/BayardID/ParentID
  // déjà codés en dur ici.
  const title = ctx.vars?.title
             || ctx.vars?.['search_results.title']
             || ctx.collection?.title
             || ctx.asset?.title
             || '';

  const NIVEAUX = { 'Série': 0, 'Saison': 1, 'Episode': 2, 'Unitaire': 0 };
  const n = NIVEAUX[type];
  if (n === undefined) {
    BuilderContext.addError(ctx, step.id, 'resolve_ancestors : TypeCollection inconnu ou absent (' + type + ')', 'warn');
    return { port: 'error' };
  }

  // La PILE DES ANCÊTRES, du parent direct au plus lointain. Ce nœud lisait
  // déjà les métadonnées complètes de chaque ancêtre pour composer le chemin
  // S3 (il n'en gardait que Univers/BayardID/ParentID, et jetait le reste) :
  // la remontée de l'héritage n'ajoute donc AUCUN appel réseau, elle conserve
  // ce qui était déjà là. Consommée par le Lookup (builder-heritage.js).
  const ancetres = [];

  // Posée sur TOUS les chemins de sortie, y compris `error` : une remontée
  // interrompue à mi-chemin (ParentID manquant sur un ancêtre) a tout de même
  // récolté les niveaux déjà lus, et le Lookup doit pouvoir hériter d'eux
  // plutôt que de repartir de rien. Clé préfixée `_` : hors variables
  // publiques, même convention que `_lk_trace_`.
  const poser = function () { BuilderContext.storeResult(ctx, '_ancetres', ancetres); };

  const segments = [];
  if (type === 'Série')       segments.unshift(_slug(univers) + '_' + bayardId);
  else if (type === 'Saison') segments.unshift(_slug(title) + '_' + bayardId);
  else                        segments.unshift(_slug(title));

  for (let i = 0; i < n; i++) {
    if (!parentId) {
      BuilderContext.addError(ctx, step.id, 'resolve_ancestors : ParentID manquant au niveau ' + (i + 1), 'warn');
      poser();
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
      poser();
      return { port: 'error' };
    }
    if (!trouve) {
      BuilderContext.addError(ctx, step.id, 'resolve_ancestors : aucune collection avec BayardID ' + parentId, 'warn');
      poser();
      return { port: 'error' };
    }
    const md = await iconikClient.get('/API/metadata/v1/collections/' + trouve.id + '/');
    const mv = md || {};
    const aUnivers  = mv.Univers?.values?.[0]?.value  || '';
    const aBayardId = mv.BayardID?.values?.[0]?.value || '';
    const aParentId = mv.ParentID?.values?.[0]?.value || '';

    ancetres.push({
      id      : trouve.id,
      titre   : trouve.title || '',
      niveau  : mv.TypeCollection?.values?.[0]?.value || '',
      bayardId: aBayardId,
      metadata: aplatirMetadonnees(mv),
    });

    const estRacine = (i === n - 1);
    if (estRacine) segments.unshift(_slug(aUnivers) + '_' + aBayardId);
    else           segments.unshift(_slug(trouve.title) + '_' + aBayardId);
    parentId = aParentId;
  }

  BuilderContext.setVar(ctx, varName, segments.join('/'));
  poser();
  return { port: 'out' };
}

module.exports = resolveAncestors;
