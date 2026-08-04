// APS — server/engine-builder/builder-iconik-connection.js — créé le 2026-08-05
// ================================================================
// Résolution du client Iconik natif d'un run — PAS un Connexion (ressource
// générique HTTP bearer/apikey/aws_s3, utilisée par http_request/
// http_sequence/deliver/verify/wait), mais un Environment (App-ID + Auth-
// Token Iconik), comme le fait WFD via `iconikEnv` — même mécanisme,
// resource différente.
//
// `doc.workflow.environment` stocke l'ID de l'Environment, pas son nom —
// vérifié sur un vrai document (BAYARD | PUBLISH | VODFACTORY) et sur le
// select du canevas (workflow-canvas.js:913, `o.value = e.id`) : le
// commentaire de pivot-io.js ("environment: e.environment") ne dit rien du
// format, seulement le nom du champ — trompeur, corrigé ici après
// vérification directe plutôt que supposé.
//
// Aucune façade Iconik native (search/fetch/action/set_metadata/
// create_tree/resolve_ancestors/history/aps.registry) n'expose de
// connexionId propre (config-schema.js) : la résolution est donc unique par
// run, pas par étape — pas de mécanisme de repli par nœud à porter ici.
// ================================================================

'use strict';

const { decrypt } = require('../lib/crypto.js');
const { IconikClient } = require('./builder-iconik-client.js');

async function resolveIconikClient(prisma, orgId, environmentId) {
  if (!environmentId) return null;
  const env = await prisma.environment.findFirst({ where: { id: environmentId, orgId } });
  if (!env || !env.appId || !env.tokenEnc) return null;
  return new IconikClient({
    baseUrl  : env.baseUrl || 'https://app.iconik.io',
    appId    : env.appId,
    authToken: decrypt(env.tokenEnc),
  });
}

// Repli quand `workflow.environment` n'est pas configuré (ou introuvable) :
// utiliser les credentials transmis par la Custom Action Iconik elle-même
// (auth_token/app_id de l'utilisateur qui a cliqué), comme le fait WFD
// (wfd-engine-executor.js:309-311, `_buildClientFromAuth`). Priorité restant
// à l'environnement configuré quand il existe, exactement comme WFD.
function buildClientFromAuth(auth) {
  if (!auth || !auth.token) return null;
  return new IconikClient({ appId: auth.appId || '', authToken: auth.token });
}

module.exports = { resolveIconikClient, buildClientFromAuth };
