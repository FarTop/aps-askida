// APS — server/routes/builder-engine.js — créé le 2026-08-05
// Déclenchement du moteur natif du Builder (server/engine-builder/). Distinct
// du mount /wfd de WFD — suit la convention /api/* normale, org-scopée via
// org-context.js (contrairement à /wfd, non filtré par choix historique).
// Voir le plan abstract-honking-map.md, §7.
'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { getOrgContext, whereOrg } = require('../lib/org-context');
const { executeRun } = require('../engine-builder/builder-engine.js');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// POST /api/builder-engine/trigger/:flowId — déclenchement manuel.
// Body : { payload?: object, version?: number }.
// Sans `version` : exécute le brouillon courant (`BuilderFlow.document`).
// Avec `version` : exécute cette BuilderFlowVersion figée (ex: pour rejouer
// exactement ce qui a été publié, indépendamment des modifications du
// brouillon depuis).
router.post('/trigger/:flowId', async (req, res) => {
  const prisma = getPrisma();
  try {
    const ctx = await getOrgContext(req, prisma);
    const flow = await prisma.builderFlow.findUnique({
      where: { id: req.params.flowId, ...whereOrg(ctx) },
    });
    if (!flow) return res.status(404).json({ error: 'BuilderFlow non trouvé' });

    let document = flow.document;
    let flowVersion = null;
    if (req.body && req.body.version != null) {
      const version = await prisma.builderFlowVersion.findUnique({
        where: { flowId_version: { flowId: flow.id, version: Number(req.body.version) } },
      });
      if (!version) return res.status(404).json({ error: `Version ${req.body.version} non trouvée` });
      document = version.document;
      flowVersion = version.version;
    }

    const result = await executeRun(document, {
      orgId: flow.orgId,
      flowId: flow.id,
      flowVersion,
      triggerPayload: (req.body && req.body.payload) || {},
      triggerType: 'manual',
      triggerRef: null,
      prisma,
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// ── Normalisation du payload Iconik (Custom Action) ──────────────
// Port de normalizeIconikPayload(), server/engine/wfd-engine-trigger.js:518-569.
function _isCustomActionPayload(raw) {
  return !!(
    (raw.auth_token && (raw.asset_ids !== undefined || raw.object_id)) ||
    (raw.collection_ids !== undefined && raw.context === 'COLLECTION')
  );
}

function _normalizeIconikPayload(raw) {
  const data = raw.data || {};
  const meta = raw.metadata_values || data.metadata_values || {};
  const isCustomAction = _isCustomActionPayload(raw);

  const assetId = (Array.isArray(raw.asset_ids) && raw.asset_ids.length ? raw.asset_ids[0] : null)
    || raw.object_id || raw.asset_id || '';
  const contextType = raw.context || raw.object_type || 'asset';
  const viewId = raw.metadata_view_id || raw.view_id || '';
  const collectionId = (Array.isArray(raw.collection_ids) && raw.collection_ids.length ? raw.collection_ids[0] : null)
    || raw.collection_id || data.collection_id || '';

  return {
    asset: { id: assetId, type: contextType },
    collection: { id: collectionId },
    event: {
      type: (raw.realm || '') + '.' + (raw.operation || ''),
      realm: raw.realm || '', operation: raw.operation || '',
      date: raw.date_created || new Date().toISOString(), viewId,
    },
    user: { id: raw.user_id || '' },
    ...(isCustomAction ? {
      _iconikAuth: { token: raw.auth_token, appId: raw.app_id || '' },
      auth_token: raw.auth_token, app_id: raw.app_id || '',
      metadata_view_id: viewId,
    } : {}),
    _metadata: meta,
    _raw: raw,
  };
}

// Port de _dispatchCustomAction(), server/engine/wfd-engine-express.js:644-663.
// Contexte COLLECTION : la collection cliquée EST le contexte du run, aucun
// fan-out vers ses assets enfants (comportement volontaire, cf. mémoire
// project-vodfactory-publish-trigger-scope). Contexte ASSET : un run par
// asset_id.
async function _dispatchCustomAction(raw, flow, version, prisma, slug) {
  const context = (raw.context || raw.object_type || 'ASSET').toUpperCase();

  if (context === 'COLLECTION') {
    const collectionId = (Array.isArray(raw.collection_ids) ? raw.collection_ids[0] : null) || raw.object_id || '';
    await _runOne(flow, version, _normalizeIconikPayload({
      ...raw, collection_ids: [collectionId], object_type: 'COLLECTION', context: 'COLLECTION',
    }), prisma, slug);
  } else {
    const assetIds = Array.isArray(raw.asset_ids) && raw.asset_ids.length
      ? raw.asset_ids : (raw.object_id ? [raw.object_id] : []);
    for (const assetId of assetIds) {
      await _runOne(flow, version, _normalizeIconikPayload({ ...raw, asset_ids: [assetId] }), prisma, slug);
    }
  }
}

async function _runOne(flow, version, triggerPayload, prisma, slug) {
  await executeRun(version.document, {
    orgId: flow.orgId, flowId: flow.id, flowVersion: version.version,
    triggerPayload, triggerType: 'custom_action', triggerRef: slug,
    prisma,
  });
}

// POST /api/builder-engine/action/:slug — webhook Custom Action Iconik.
// Ne peut pas être org-scopé en entrée (Iconik n'a aucune notion d'orgId
// APS) — recherche parmi TOUS les orgs. Exécute toujours la dernière
// BuilderFlowVersion PUBLIÉE, jamais le brouillon — 409 si rien n'est publié
// pour ce flow. Répond immédiatement (Iconik attend une réponse rapide,
// comme WFD) puis exécute en tâche de fond ; le résultat s'observe ensuite
// via GET /api/builder-runs.
router.post('/action/:slug', async (req, res) => {
  const slug = req.params.slug;
  const prisma = getPrisma();
  try {
    const flows = await prisma.builderFlow.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    // Trois façons de viser le même flow dans l'URL webhook, de la plus
    // lisible à la plus robuste : `wfdSlug` (nom court choisi à la main,
    // ex. "createserie" — hérité du champ WFD du même nom, gardé tel quel
    // par traçabilité, pas une dépendance à WFD), `customActionId` (l'UUID
    // qu'Iconik génère pour le Custom Action), ou l'id du BuilderFlow
    // lui-même. Iconik n'imposant qu'UNE url par Custom Action, mettre le
    // slug lisible dans l'url est la config la plus simple à relire.
    function _slugsDuTrigger(trigger) {
      const p = (trigger && trigger.params) || {};
      const out = [];
      if (p.wfdSlug) out.push(String(p.wfdSlug).trim());
      if (trigger && trigger.facade === 'iconik.trigger' && p.customActionId) out.push(String(p.customActionId).trim());
      return out;
    }

    const matches = flows
      .map(f => ({ flow: f, version: f.versions[0] || null }))
      .filter(({ flow, version }) => {
        if (!version) return false;
        const trigger = (version.document.steps || []).find(s => s.core === 'trigger');
        if (!trigger) return false;
        return _slugsDuTrigger(trigger).indexOf(slug) !== -1 || flow.id === slug;
      });

    if (!matches.length) {
      // Distinguer "aucun flow ne correspond" de "le flow existe mais n'a
      // jamais été publié" — un webhook ne doit jamais exécuter un brouillon.
      // Le brouillon (flow.document) est comparé ici uniquement pour ce
      // diagnostic, jamais pour exécuter quoi que ce soit.
      const flowNonPublie = flows.find(f => {
        if (f.versions[0]) return false; // a une version publiée → aurait matché plus haut si pertinent
        if (f.id === slug) return true;
        const trigger = (f.document.steps || []).find(s => s.core === 'trigger');
        return trigger ? _slugsDuTrigger(trigger).indexOf(slug) !== -1 : false;
      });
      if (flowNonPublie) {
        return res.status(409).json({ error: `BuilderFlow "${flowNonPublie.name}" non publié — aucune version disponible pour un déclenchement webhook` });
      }
      return res.status(404).json({ error: `Aucun BuilderFlow publié pour le slug "${slug}"` });
    }

    res.json({ received: true, flows: matches.length });

    const payload = req.body || {};
    const dispatched = matches.map(({ flow, version }) =>
      _dispatchCustomAction(payload, flow, version, prisma, slug)
        .catch(err => console.error(`[Builder Engine] Erreur run "${flow.name}" :`, err.message))
    );
    // Le prisma partagé ne doit se déconnecter qu'une fois tous les runs de
    // fond terminés — surtout PAS dans un `finally` synchrone après res.json().
    Promise.allSettled(dispatched).finally(() => prisma.$disconnect());
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    await prisma.$disconnect();
  }
});

module.exports = router;
