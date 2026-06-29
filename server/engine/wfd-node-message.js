// ================================================================
// wfd-node-message.js — Handler nœud "Message"
//
// Remplace : Set Variable erreurs + Calculer Statut + Notification
//
// Le nœud Message :
//   1. Calcule le statut final (success/partial/failed)
//   2. Compose le message selon les règles définies
//   3. Envoie via les canaux configurés (Teams, Slack, Email)
// ================================================================

'use strict';

const WfdContext = (typeof require !== 'undefined')
  ? require('./wfd-engine-context.js')
  : window.WfdContext;

async function handleMessage(node, ctx, client) {
  const cfg = node.config || {};

  // ── 1. Finaliser le statut ─────────────────────────────────
  const status = ctx.errors.some(e => e.severity === 'fatal')
    ? 'failed'
    : ctx.errors.length > 0 ? 'partial' : 'success';

  ctx.status = status;

  // ── 2. Vérifier les règles spécifiques ────────────────────
  // Une règle peut surcharger le message selon le port d'entrée
  // Le contexte stocke le dernier nœud + port qui a déclenché
  const matchedRule = matchRule(cfg.rules || [], ctx);

  // ── 3. Composer le message ─────────────────────────────────
  const composed = matchedRule
    ? composeFromRule(matchedRule, ctx)
    : composeMessage(cfg, ctx, status);

  // ── 3. Envoyer sur chaque canal ────────────────────────────
  const recipients = cfg.recipients || [];
  const results    = [];

  for (const r of recipients) {
    if (!r.enabled && r.enabled !== undefined) continue;
    try {
      await sendToChannel(r, composed, ctx);
      results.push({ channel: r.channel, ok: true });
    } catch (err) {
      results.push({ channel: r.channel, ok: false, error: err.message });
      // Erreur d'envoi = warn, pas fatal
      WfdContext.addError(ctx, node.name, `Envoi ${r.channel} échoué : ${err.message}`, 'warn');
    }
  }

  ctx.vars._lastMessage = composed;
  return { port: 0 };
}

// ── Composer le message selon le statut et les erreurs ──────────
function composeMessage(cfg, ctx, status) {
  const emoji = status === 'success' ? '🟢' : status === 'partial' ? '🟡' : '🔴';

  // Titre : résoudre le template ou utiliser un défaut
  const titleTemplate = cfg.title || '{asset.title}';
  const title = emoji + ' ' + WfdContext.resolve(titleTemplate, ctx);

  // Corps : template personnalisé ou généré automatiquement
  let body = '';
  if (cfg.bodyTemplate) {
    body = WfdContext.resolve(cfg.bodyTemplate, ctx);
  } else {
    // Corps automatique selon le statut
    body = buildAutoBody(ctx, status);
  }

  return { title, body, status, color: statusColor(status) };
}

// ── Corps automatique ────────────────────────────────────────────
function buildAutoBody(ctx, status) {
  const lines = [];

  if (ctx.asset?.title)              lines.push(`Asset : ${ctx.asset.title}`);
  if (ctx.vars?.targetColPath)       lines.push(`Destination : ${ctx.vars.targetColPath}`);
  if (ctx.results?.collection?.name) lines.push(`Collection : ${ctx.results.collection.name}`);

  if (ctx.errors.length > 0) {
    lines.push('');
    lines.push('Détails :');
    ctx.errors.forEach(e => {
      const icon = e.severity === 'fatal' ? '❌' : '⚠️';
      lines.push(`${icon} ${e.node} — ${e.message}`);
    });
  }

  return lines.join('\n');
}

// ── Envoyer sur un canal ─────────────────────────────────────────
async function sendToChannel(recipient, composed, ctx) {
  const ch  = recipient.channel || 'teams';
  const cfg = recipient.config  || {};

  switch (ch) {
    case 'teams' : return sendTeams(cfg, composed);
    case 'slack' : return sendSlack(cfg, composed);
    case 'email' : return sendEmail(cfg, composed);
    default      : throw new Error(`Canal inconnu : ${ch}`);
  }
}

// ── Teams (Power Automate Workflows) ────────────────────────────
async function sendTeams(cfg, msg) {
  const url = cfg.webhook_url || '';
  if (!url) throw new Error('Teams : webhook_url manquant');

  const card = {
    type   : 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body   : [
      { type:'TextBlock', text: msg.title, weight:'Bolder', size:'Medium', wrap:true,
        color: msg.status === 'success' ? 'Good'
             : msg.status === 'failed'  ? 'Attention' : 'Warning' },
      ...(msg.body ? [{ type:'TextBlock', text: msg.body, wrap:true }] : []),
    ],
  };

  const payload = {
    type       : 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl : null,
      content    : card,
    }],
  };

  await httpPost(url, payload);
}

// ── Slack (Block Kit) ────────────────────────────────────────────
async function sendSlack(cfg, msg) {
  const url = cfg.webhook_url || '';
  if (!url) throw new Error('Slack : webhook_url manquant');

  const payload = {
    channel : cfg.channel  || '',
    username: cfg.username || 'WFD Bot',
    attachments: [{
      color : msg.color,
      blocks: [
        { type:'section', text:{ type:'mrkdwn', text: `*${msg.title}*` } },
        ...(msg.body ? [{ type:'section', text:{ type:'mrkdwn', text: msg.body } }] : []),
      ],
    }],
  };

  await httpPost(url, payload);
}

// ── Email (placeholder — nodemailer à implémenter si besoin) ─────
async function sendEmail(cfg, msg) {
  // À implémenter avec nodemailer
  throw new Error('Email non encore implémenté dans le WFD Engine');
}

// ── Couleur selon statut ─────────────────────────────────────────
function statusColor(status) {
  return status === 'success' ? '#27ae60'
       : status === 'failed'  ? '#e74c3c'
       :                        '#f39c12'; // partial
}

// ── POST HTTP générique ──────────────────────────────────────────
function httpPost(url, payload) {
  const https = require('https');
  const http  = require('http');
  const body  = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port    : u.port || (u.protocol === 'https:' ? 443 : 80),
      path    : u.pathname + u.search,
      method  : 'POST',
      headers : { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(d);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Export ────────────────────────────────────────────────────────
const WfdNodeMessage = { handleMessage, composeMessage, composeFromRule };
if (typeof module !== 'undefined') module.exports = WfdNodeMessage;
if (typeof window !== 'undefined') window.WfdNodeMessage = WfdNodeMessage;

// ── Matcher une règle spécifique ────────────────────────────────
function matchRule(rules, ctx) {
  if (!rules || !rules.length) return null;
  // Vérifier si le dernier nœud en erreur correspond à une règle
  const lastError = ctx.errors[ctx.errors.length - 1];
  if (!lastError) return null;

  for (const rule of rules) {
    if (!rule.srcId) continue;
    // Matcher par nom de nœud (le srcId côté Engine = nom du nœud)
    if (lastError.node === rule.message || ctx._lastErrorNodeId === rule.srcId) {
      return rule;
    }
  }
  return null;
}

// ── Composer depuis une règle spécifique ────────────────────────
function composeFromRule(rule, ctx) {
  const status = rule.status || 'failed';
  const emoji  = status === 'success' ? '🟢' : status === 'partial' ? '🟡' : '🔴';
  const msg    = WfdContext.resolve(rule.message || '', ctx);
  return {
    title : emoji + ' ' + (ctx.asset?.title || ''),
    body  : msg || buildAutoBody(ctx, status),
    status,
    color : statusColor(status),
  };
}
