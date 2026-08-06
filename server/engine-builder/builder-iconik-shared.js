// APS — server/engine-builder/builder-iconik-shared.js — créé le 2026-08-05
// Helpers Iconik partagés entre plusieurs handlers façade (search, fetch...).
// Port de server/engine/wfd-engine-handlers.js : resolveByName (:551-570) et
// _extractTechnical (:585-672).
'use strict';

const BuilderContext = require('./builder-context.js');

function requireIconik(iconikClient, label) {
  if (!iconikClient) throw new Error(`Handler [${label}] : iconikClient non configuré`);
}

async function resolveByName(client, id, name, listEndpoint, nameField) {
  nameField = nameField || 'name';
  if (id) {
    try {
      const list = await client.get(listEndpoint + '?per_page=200');
      const items = list.objects || list.results || [];
      if (items.find(o => o.id === id)) return id;
    } catch (e) { /* continuer */ }
    if (!name) throw new Error('ID "' + id + '" introuvable dans cet environnement — configurez le nom pour la résolution automatique');
  }
  if (!name) return id;
  const list = await client.get(listEndpoint + '?per_page=200');
  const items = list.objects || list.results || [];
  const found = items.find(o =>
    (o[nameField] || o.name || o.title || o.label || '').toLowerCase() === name.toLowerCase()
  );
  if (!found) throw new Error('"' + name + '" introuvable dans cet environnement (ID original: ' + (id || '—') + ')');
  return found.id;
}

// Extraction des métadonnées techniques d'un asset (durée, résolution,
// codecs...) via file_sets puis formats. Non bloquant : une erreur est
// stockée, elle n'interrompt jamais le step appelant.
async function extractTechnical(assetId, varName, ctx, iconikClient) {
  if (!assetId || !iconikClient) return;

  try {
    const fileSetsRes = await iconikClient.get(`/API/files/v1/assets/${assetId}/file_sets/`);
    const fileSets     = fileSetsRes?.objects || [];
    const formatId     = fileSets[0]?.format_id;

    const _filename = fileSets[0]?.name || fileSets[0]?.original_name || '';
    if (_filename) {
      BuilderContext.setVar(ctx, varName + '_filename', _filename);
      BuilderContext.setVar(ctx, 'filename', _filename);
      const _filenameNoExt = _filename.replace(/\.[^.]+$/, '');
      BuilderContext.setVar(ctx, varName + '_filename_noext', _filenameNoExt);
      BuilderContext.setVar(ctx, 'filename_noext', _filenameNoExt);
    }

    if (!formatId) {
      BuilderContext.storeResult(ctx, varName + '_formats', { error: 'Aucun file_set trouvé' });
      return;
    }

    const fmt = await iconikClient.get(`/API/files/v1/assets/${assetId}/formats/${formatId}/`);
    const gm  = (Array.isArray(fmt.metadata) ? fmt.metadata[0] : fmt.metadata) || {};

    const components = fmt.components || [];
    const vm  = components.find(c => c.metadata?.kind_of_stream === 'Video')?.metadata   || {};
    const gmc = components.find(c => c.metadata?.kind_of_stream === 'General')?.metadata || {};
    const am  = components.find(c =>
      c.metadata?.kind_of_stream === 'Audio' || c.metadata?.channel_s
    )?.metadata || {};

    if (vm.duration) {
      const durMs = parseInt(vm.duration);
      BuilderContext.setVar(ctx, 'duration_ms', String(durMs));
      BuilderContext.setVar(ctx, 'duration',    String(Math.round(durMs / 1000)));
    }

    if (gm.format)           BuilderContext.setVar(ctx, 'container',  gm.format);
    if (gm.overall_bit_rate) BuilderContext.setVar(ctx, 'bitrate',    gm.overall_bit_rate);
    if (gm.size)             BuilderContext.setVar(ctx, 'file_size',  gm.size);
    if (gm.frame_rate)       BuilderContext.setVar(ctx, 'fps',        gm.frame_rate);

    if (vm.width)              BuilderContext.setVar(ctx, 'width',       vm.width);
    if (vm.height)             BuilderContext.setVar(ctx, 'height',      vm.height);
    const videoCodec = gmc.codecs_video || vm.format || vm.commercial_name || '';
    if (videoCodec)            BuilderContext.setVar(ctx, 'video_codec', videoCodec);
    if (vm.chroma_subsampling) BuilderContext.setVar(ctx, 'chroma',      vm.chroma_subsampling);
    if (vm.bit_depth)          BuilderContext.setVar(ctx, 'bit_depth',   vm.bit_depth);

    const vw = parseInt(vm.width  || '0');
    const vh = parseInt(vm.height || '0');
    if (vw || vh) {
      const vmax = Math.max(vw, vh);
      BuilderContext.setVar(ctx, 'video_quality', vmax >= 3840 ? 'UHD' : vmax >= 1280 ? 'HD' : 'SD');
    }

    const audioTracks = components.filter(c =>
      c.metadata?.kind_of_stream === 'Audio' || c.metadata?.channel_s
    ).length;
    if (audioTracks) BuilderContext.setVar(ctx, 'audio_tracks', String(audioTracks));
    const audioCodec = am.audio_codecs || gmc.audio_codecs || '';
    if (audioCodec)  BuilderContext.setVar(ctx, 'audio_codec', audioCodec);

    BuilderContext.storeResult(ctx, varName + '_formats', {
      formatId, components: components.length, gm, vm, gmc, am,
    });
  } catch (e) {
    BuilderContext.storeResult(ctx, varName + '_formats', { error: e.message });
  }
}

// GET /API/metadata/v1/{collections|assets}/{id}/ renvoie un dict PLAT
// ({Champ: {name, type, values:[{value}]}}) — PAS la forme
// {metadata_values: {Champ: {field_values:[...]}}} qu'attend le PUT, et que
// le code de relecture supposait. `reponse.metadata_values` était donc
// TOUJOURS undefined : toute relecture repartait d'un objet vide. Conséquence
// principale (trouvée le 2026-08-06 en comparant la vraie réponse Iconik au
// code) : History ne retrouvait jamais le contenu précédent du champ — son
// historique ne s'accumulait pas (chaque ligne écrasait toutes les
// précédentes) et le mode "update" ne retrouvait jamais la ligne du run en
// cours, donc la ligne "🔄 En cours" ne survivait à aucune écriture suivante.
function metadataValuesDepuisReponse(reponse) {
  if (!reponse || typeof reponse !== 'object') return {};
  if (reponse.metadata_values && typeof reponse.metadata_values === 'object') {
    return reponse.metadata_values;
  }
  const out = {};
  Object.entries(reponse).forEach(([cle, champ]) => {
    if (!champ || typeof champ !== 'object') return;
    const valeurs = champ.field_values || champ.values;
    if (!Array.isArray(valeurs)) return;
    out[cle] = {
      field_values: valeurs.map(v =>
        (v && typeof v === 'object' && 'value' in v) ? { value: v.value } : { value: v }
      ),
    };
  });
  return out;
}

// Fenêtre de rafale du compteur atomique — voir _nextOrderNumber ci-dessous.
const _ORDER_BURST_MINUTES = 5;

// Port de _nextOrderNumber(), wfd-engine-handlers.js:171-208. Compteur
// atomique (PostgreSQL INSERT ... ON CONFLICT) plutôt qu'un comptage par
// recherche Iconik — deux créations concurrentes ne doivent jamais recevoir
// le même numéro, alors que la recherche Iconik n'a pas encore indexé la
// précédente. `ApsCounter` n'est pas un modèle Prisma déclaré (créé en SQL
// brut, idempotent) — préexistant en base avant ce chantier (cf. drift trouvé
// en migrant BuilderRun/BuilderRunEvent), même table que WFD, pas une
// nouvelle création propre à ce moteur.
async function nextOrderNumber(prisma, scope, key, seed) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ApsCounter" (
      "scope" TEXT NOT NULL,
      "key"   TEXT NOT NULL,
      "value" INTEGER NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY ("scope", "key")
    )`);
  const rows = await prisma.$queryRawUnsafe(`
    INSERT INTO "ApsCounter" ("scope","key","value")
    VALUES ($1, $2, $3)
    ON CONFLICT ("scope","key")
    DO UPDATE SET
      "value" = CASE
        WHEN "ApsCounter"."updatedAt" < now() - ($4 || ' minutes')::interval
          THEN $3
        ELSE GREATEST($3, "ApsCounter"."value" + 1)
      END,
      "updatedAt" = now()
    RETURNING "value"`,
    String(scope), String(key), Number(seed) + 1, String(_ORDER_BURST_MINUTES));
  return Number(rows?.[0]?.value);
}

// Port de _bayardIdFor(), wfd-engine-handlers.js:210-244 — réutilise un
// BayardID existant pour cet objet (BayardRegistry.assetId) ou en génère un
// nouveau, garanti unique par vérification directe.
async function bayardIdFor(prisma, objectId, objectType, orgId, length, fallbackId) {
  let id = fallbackId;
  const existing = objectId ? await prisma.bayardRegistry.findFirst({ where: { assetId: objectId } }) : null;
  if (existing) return existing.bayardId;

  let attempts = 0;
  while (attempts < 10) {
    const conflict = await prisma.bayardRegistry.findUnique({ where: { bayardId: id } });
    if (!conflict) break;
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    id = String(Math.floor(min + Math.random() * (max - min + 1)));
    attempts++;
  }
  if (objectId) {
    await prisma.bayardRegistry.create({
      data: { bayardId: id, assetId: objectId, assetType: objectType, orgId },
    });
  }
  return id;
}

module.exports = { requireIconik, resolveByName, extractTechnical, metadataValuesDepuisReponse, nextOrderNumber, bayardIdFor };
