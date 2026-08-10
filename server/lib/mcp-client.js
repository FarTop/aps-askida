// APS — server/lib/mcp-client.js — créé le 2026-08-10
// ================================================================
// Client MCP minimal — juste ce qu'il faut pour DEMANDER À UN SERVEUR CE QU'IL
// SAIT FAIRE. C'est la même question que pose l'onglet API à une spécification
// OpenAPI, posée à l'autre canal d'acquisition.
//
// Différence avec l'API : ici, la découverte est DANS le protocole. Pas d'URL
// de spec à chercher, pas de repli sur la documentation, pas de format à
// reconnaître — on se connecte, le serveur annonce ses outils.
//
// Le protocole est du JSON-RPC 2.0 sur HTTP. Une poignée de main d'abord
// (`initialize`), puis `tools/list`. Le transport « streamable HTTP » peut
// répondre soit en JSON, soit en flux d'évènements (`data: {...}`) — on lit
// les deux, faute de quoi la moitié des serveurs semblerait muette.
//
// Ce client ne sait QUE lire. Appeler un outil (`tools/call`) écrirait chez le
// tiers, et ça ne se fera jamais depuis un bouton global — même discipline que
// le test des endpoints, qui s'en tient aux GET.
// ================================================================

'use strict';

const VERSION_PROTOCOLE = '2025-06-18';

// Une réponse peut arriver en JSON simple ou encadrée en évènements SSE.
function _extraireReponse(texte) {
  const brut = String(texte || '').trim();
  if (!brut) return null;
  if (brut.startsWith('{')) {
    try { return JSON.parse(brut); } catch (_) { return null; }
  }
  // Flux d'évènements : on retient le dernier `data:` analysable.
  let dernier = null;
  for (const ligne of brut.split('\n')) {
    const l = ligne.trim();
    if (!l.startsWith('data:')) continue;
    const charge = l.slice(5).trim();
    if (!charge || charge === '[DONE]') continue;
    try { dernier = JSON.parse(charge); } catch (_) { /* trame partielle */ }
  }
  return dernier;
}

async function _appeler(url, entetes, corps, sessionId) {
  const h = Object.assign({
    'Content-Type': 'application/json',
    // Les deux, sans quoi un serveur en transport streamable refuse.
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': VERSION_PROTOCOLE,
  }, entetes || {});
  if (sessionId) h['Mcp-Session-Id'] = sessionId;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(corps), signal: ctrl.signal });
  } finally { clearTimeout(to); }

  const texte = await r.text();
  return { statut: r.status, session: r.headers.get('mcp-session-id') || null, corps: _extraireReponse(texte), texte };
}

// Poignée de main puis inventaire. Retourne { outils, serveur } ou { erreur }.
async function listerOutils(url, entetes) {
  if (!url) return { erreur: 'Aucune URL de serveur MCP' };

  const init = await _appeler(url, entetes, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: VERSION_PROTOCOLE,
      capabilities: {},
      clientInfo: { name: 'APS — Askida Platform Studio', version: '0.1.0' },
    },
  });

  if (init.statut === 401 || init.statut === 403) {
    return { erreur: `Authentification refusée (HTTP ${init.statut}) — jeton MCP invalide ou portée insuffisante` };
  }
  if (!init.corps || init.corps.error) {
    const d = init.corps && init.corps.error ? init.corps.error.message : `HTTP ${init.statut}`;
    return { erreur: `Poignée de main refusée — ${d}`, brut: init.texte.slice(0, 300) };
  }

  const session = init.session;
  const serveur = (init.corps.result && init.corps.result.serverInfo) || null;

  // Notification obligatoire : certains serveurs refusent `tools/list` avant.
  try {
    await _appeler(url, entetes, { jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  } catch (_) { /* sans réponse attendue */ }

  // Pagination par curseur, comme le prévoit le protocole.
  const outils = [];
  let curseur;
  for (let page = 0; page < 20; page++) {
    const rep = await _appeler(url, entetes, {
      jsonrpc: '2.0', id: 2 + page, method: 'tools/list',
      params: curseur ? { cursor: curseur } : {},
    }, session);
    if (!rep.corps || rep.corps.error) {
      const d = rep.corps && rep.corps.error ? rep.corps.error.message : `HTTP ${rep.statut}`;
      return { erreur: `Inventaire refusé — ${d}`, serveur };
    }
    const res = rep.corps.result || {};
    (res.tools || []).forEach(t => outils.push(t));
    curseur = res.nextCursor;
    if (!curseur) break;
  }

  return { outils, serveur, session };
}

module.exports = { listerOutils, VERSION_PROTOCOLE };
