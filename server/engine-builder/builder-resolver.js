// APS — server/engine-builder/builder-resolver.js — créé le 2026-08-05
// ================================================================
// builder-resolver.js — Résolution des ressources d'org (Mapping/Manifest/
// Endpoint/ArboTemplate) référencées par un document pivot, EN BLOC, au
// démarrage du run — pas paresseusement par étape. Voir le plan
// abstract-honking-map.md, §5.
//
// Remplace le `options.resolutions` pré-chargé côté navigateur par
// pivot-to-wfd.js : ici la résolution se fait côté serveur, directement en
// base, une fois par run (le référencement ne change jamais en cours de
// run — une boucle itère sur des ITEMS, jamais sur quelle ressource un step
// pointe).
//
// Reste un simple fetch id→ligne : la dérivation métier (manifestId ->
// s3Mappings/checks/essences, mappingId -> lkRows, sequenceId -> steps) vit
// dans chaque handler (builder-handler-lookup.js, etc.), pas ici — même
// séparation que pivot-to-wfd.js (_config()) vs son appelant.
// ================================================================

'use strict';

const { decrypt } = require('../lib/crypto.js');

// Collecte récursive des ids référencés par params.{mappingId,manifestId,
// sequenceId,templateId,connexionId} — descend dans step.body.steps pour les
// boucles. Même règle que _referencesDeEtapes (server/routes/wfd-data.js:368-381)
// pour les 4 premiers ; `connexionId` ajouté ici (pas dans wfd-data.js, qui ne
// s'occupe que du comptage d'usage affiché dans le Builder) car verify/deliver/
// http_sequence/wait en ont réellement besoin pour construire leurs requêtes —
// même ressource générique que Lookup/Manifest/Endpoint, résolue une fois au
// démarrage du run pour les mêmes raisons (échouer vite, un seul aller-retour).
function _collectRefs(steps, ids) {
  (steps || []).forEach((step) => {
    const p = step && step.params;
    if (p) {
      if (p.mappingId)   ids.mappingId.add(p.mappingId);
      if (p.manifestId)  ids.manifestId.add(p.manifestId);
      if (p.sequenceId)  ids.sequenceId.add(p.sequenceId);
      if (p.templateId)  ids.templateId.add(p.templateId);
      if (p.connexionId) ids.connexionId.add(p.connexionId);
    }
    if (step && step.core === 'loop' && step.body) {
      _collectRefs(step.body.steps, ids);
    }
  });
}

// Même forme que `connexionsFmt` dans wfd-engine-express.js:159-172 —
// `endpoint`/`authValue` plutôt que `baseUrl`/`authValueEnc` bruts, pour que
// les handlers portés (checker, aws_s3, handleHttpSequence) n'aient pas à
// connaître le nom des colonnes chiffrées.
//
// DIVERGENCE ASSUMÉE vs WFD : `headers` (extraConfig.headers, des en-têtes
// HTTP additionnels) est inclus ici alors que le loader WFD
// (wfd-engine-express.js:159-172) ne le transporte jamais jusqu'à
// handleHttpRequest — un gap non documenté, jamais justifié par un journal,
// contredit par connexions.js (route de test de connexion) qui, elle,
// applique bien extraConfig.headers. Inclus ici comme un vrai superset (une
// connexion sans header configuré se comporte identiquement) plutôt que
// reproduit tel quel.
function _formatConnexion(c) {
  return {
    id: c.id, name: c.name, type: c.type, direction: c.direction,
    endpoint: c.baseUrl, authType: c.authType,
    authValue: decrypt(c.authValueEnc),
    headers: (c.extraConfig && c.extraConfig.headers) || [],
    extraConfig: c.extraConfig || {},
    isActive: c.isActive,
  };
}

function _byId(rows) {
  const map = Object.create(null);
  for (const r of rows) map[r.id] = r;
  return map;
}

async function resolveRunResources(doc, prisma, orgId) {
  const ids = {
    mappingId  : new Set(),
    manifestId : new Set(),
    sequenceId : new Set(),
    templateId : new Set(),
    connexionId: new Set(),
  };
  _collectRefs((doc && doc.steps) || [], ids);

  const [mappings, manifests, endpoints, trees, connexions] = await Promise.all([
    ids.mappingId.size
      ? prisma.mapping.findMany({ where: { id: { in: [...ids.mappingId] }, orgId } })
      : [],
    ids.manifestId.size
      ? prisma.manifest.findMany({ where: { id: { in: [...ids.manifestId] }, orgId } })
      : [],
    ids.sequenceId.size
      ? prisma.endpoint.findMany({ where: { id: { in: [...ids.sequenceId] }, orgId } })
      : [],
    // ArboTemplate n'a pas de colonne orgId (schema.prisma) — résolution par
    // id seul, cross-org, comme le fait déjà create_tree() dans WFD
    // (wfd-engine-handlers.js:1766-1776). Gap préexistant, pas corrigé ici.
    ids.templateId.size
      ? prisma.arboTemplate.findMany({ where: { id: { in: [...ids.templateId] } } })
      : [],
    // Connexion est mi-migrée orgId/envId (cf. CLAUDE.md, notes "Temps 1/2/3")
    // — résolution par id seul, comme les routes existantes (connexions.js).
    ids.connexionId.size
      ? prisma.connexion.findMany({ where: { id: { in: [...ids.connexionId] } } })
      : [],
  ]);

  return {
    mappings  : _byId(mappings),
    manifests : _byId(manifests),
    endpoints : _byId(endpoints),
    trees     : _byId(trees),
    connexions: _byId(connexions.map(_formatConnexion)),
  };
}

module.exports = { resolveRunResources };
