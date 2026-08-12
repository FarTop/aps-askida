// APS — server/routes/hooks.js — créé le 2026-08-12
// ================================================================
// Réception de webhooks TIERS — un partenaire nous appelle, avec SON payload.
//
//   POST /api/hooks/:slug
//
// POURQUOI UNE ROUTE À PART. Le seul point d'entrée webhook existant,
// `POST /api/builder-engine/action/:slug`, est spécifique à Iconik : il passe
// par _dispatchCustomAction, qui lit `context`, `asset_ids`, `collection_ids`
// et normalise en payload Custom Action. Un callback partenaire n'a rien de
// tout cela — celui de VOD Factory porte `{content:{external_id}, partner,
// action, status}`. Il tomberait sur le défaut `ASSET` avec une liste d'ids
// vide, et AUCUN run ne partirait. Greffer l'aiguillage dans
// _dispatchCustomAction rendrait les deux illisibles.
//
// Cette route ne comprend RIEN au corps reçu : elle le transmet tel quel au
// workflow, qui le lit par chemin (`{_trigger.content.external_id}`,
// `{_trigger.status}`…) — BuilderContext.resolvePath sait déjà descendre dans
// `_trigger`, aucune modification du moteur n'a été nécessaire. C'est ce qui
// la rend utilisable par n'importe quel partenaire : VOD Factory aujourd'hui,
// Mediawan, Canal+ ou M6 demain, sans une ligne de plus ici.
//
// AUTHENTIFICATION. Optionnelle et par workflow : si le trigger déclare
// `hookSecret`, l'appel doit porter la même valeur dans `X-APS-Hook-Secret`
// (ou `?secret=`). Sans `hookSecret` déclaré, la route reste ouverte — c'est
// le comportement d'un webhook public, assumé, et le seul possible tant qu'un
// partenaire ne peut pas envoyer d'en-tête. VOD Factory permet des en-têtes
// personnalisés (doc p.19) : question posée, à activer dès leur réponse.
// ================================================================
'use strict';

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { executeRun } = require('../engine-builder/builder-engine.js');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Le slug déclaré par le trigger d'un workflow. Même champ que le webhook
// Iconik (`wfdSlug`), pour qu'un seul nom serve aux deux mécanismes et qu'un
// opérateur n'ait pas à retenir laquelle des deux conventions s'applique.
function _slugDuTrigger(trigger) {
  const p = (trigger && trigger.params) || {};
  return p.wfdSlug ? String(p.wfdSlug).trim() : '';
}

router.post('/:slug', async (req, res) => {
  const slug   = req.params.slug;
  const prisma = getPrisma();
  try {
    const flows = await prisma.builderFlow.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    // Exactement la même exigence que le webhook Iconik : actif ET publié. Un
    // webhook n'exécute JAMAIS un brouillon — personne n'est là pour constater
    // qu'un travail en cours est parti chez un partenaire.
    const cibles = flows.filter(function (f) {
      if (!f.active || !f.versions[0]) return false;
      const trigger = (f.versions[0].document.steps || []).find(s => s.core === 'trigger');
      return !!trigger && (_slugDuTrigger(trigger) === slug || f.id === slug);
    });

    if (!cibles.length) {
      await prisma.$disconnect();
      return res.status(404).json({ error: 'Aucun BuilderFlow publié et actif pour le slug "' + slug + '"' });
    }

    // Secret vérifié AVANT de répondre 200 : un appel non authentifié ne doit
    // pas repartir avec un accusé de réception.
    const attendus = cibles.map(function (f) {
      const trigger = (f.versions[0].document.steps || []).find(s => s.core === 'trigger');
      return ((trigger && trigger.params) || {}).hookSecret || '';
    }).filter(Boolean);

    if (attendus.length) {
      const fourni = req.get('X-APS-Hook-Secret') || (req.query && req.query.secret) || '';
      if (attendus.indexOf(fourni) === -1) {
        await prisma.$disconnect();
        return res.status(401).json({ error: 'secret de webhook absent ou invalide' });
      }
    }

    // Réponse immédiate, exécution en tâche de fond : le callback VOD Factory
    // est best-effort et sans nouvelle tentative (doc p.20) — le faire attendre
    // la fin d'un run qui appelle Iconik et le partenaire serait le meilleur
    // moyen de provoquer le timeout qu'on cherche à éviter.
    res.json({ received: true, flows: cibles.length });

    const payload = req.body || {};
    const lances = cibles.map(function (f) {
      const version = f.versions[0];
      return executeRun(version.document, {
        orgId: f.orgId,
        flowId: f.id,
        flowVersion: version.version,
        triggerPayload: payload,
        triggerType: 'webhook',
        triggerRef: slug,
        prisma,
      }).catch(err => console.error('[Hooks] Erreur run "' + f.name + '" :', err.message));
    });

    // Le prisma partagé ne se déconnecte qu'une fois TOUS les runs de fond
    // terminés — surtout pas dans un `finally` synchrone après res.json().
    Promise.allSettled(lances).finally(() => prisma.$disconnect());
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    await prisma.$disconnect();
  }
});

module.exports = router;
