// APS — server/engine-builder/builder-scheduler.js — créé le 2026-08-10
// ================================================================
// builder-scheduler.js — Minuterie du moteur natif du Builder.
//
// Port de wfd-engine-trigger.js (scheduleTimer(), l.287-328, et le
// planificateur cron minimaliste _scheduleCron(), l.449-509). Portage et non
// réécriture : mêmes trois modes (interval / cron / oneshot), mêmes noms de
// champs de config, même garde anti-double-départ, même gestion du fuseau.
// Les deux corrections déjà acquises côté WFD sont reprises telles quelles :
//   - la vérification cron tourne toutes les 30 s, donc une échéance est
//     rencontrée DEUX fois dans la même minute — d'où `_derniereMinute` ;
//   - le fuseau configuré est réellement honoré (Intl.DateTimeFormat), il
//     était ignoré avant, l'heure lue étant celle du serveur.
//
// Ce que ce fichier N'A PAS et n'aura pas ici : la barrière de ré-entrance.
// Un `setInterval` qui réarme pendant qu'un run précédent est encore en vol
// lance un second run — c'est le comportement de WFD, conservé DÉLIBÉRÉMENT.
// Le garde-fou silencieux serait facile à écrire et masquerait précisément le
// mécanisme que le moteur natif existe pour éprouver (cf. CLAUDE.md, « le
// critère est : est-ce que ça permet de prouver un mécanisme »). La barrière
// se construit ensuite, explicitement, et se teste en la cassant exprès.
// L'ossature est déjà en base : BuilderRun porte flowId, triggerRef et
// status='running'.
//
// Un déclencheur planifié ne sème AUCUN objet dans le contexte : pas de
// collection cliquée, pas de payload Iconik, pas de token de Custom Action.
// C'est le premier cas du dépôt où le workflow doit déclarer lui-même ses
// entrées — voir le journal du 2026-08-10.
// ================================================================

'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const { executeRun } = require('./builder-engine.js');

// Le planificateur est un démon, pas une requête : il garde UN client Prisma
// pour toute la vie du processus, au lieu du client court par requête que
// suivent les routes (cf. server/routes/aps-search.js). Ouvrir un client par
// échéance fuirait une connexion à chaque tic.
let _prisma  = null;
// Un enregistrement par flow planifié : { close(), libelle }.
const _timers = new Map();

function _getPrisma() {
  if (!_prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

// ── Planificateur cron minimaliste (sans dépendance externe) ────────────────
// Port fidèle de _scheduleCron(), server/engine/wfd-engine-trigger.js:450-509,
// scindé en deux : le VÉRIFICATEUR (une passe, pure hors `fn` et l'horloge) et
// sa mise sous setInterval. WFD ne faisait qu'un bloc ; les séparer rend la
// garde anti-double-départ éprouvable sans piloter l'horloge globale du
// processus depuis un script (cf. scripts/preuve-minuterie.js) — le test
// exerce alors le vrai code au lieu d'en recopier la logique.
//
// `horloge` est le seul point d'injection : par défaut l'heure réelle.
function creerVerificateurCron(expr, fn, timezone, horloge) {
  let _derniereMinute = null;
  const _now = horloge || (() => new Date());

  function _maintenant() {
    if (!timezone) return _now();
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour12: false,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', weekday: 'short',
      }).formatToParts(_now());
      const g = (t) => { const x = p.find(o => o.type === t); return x ? x.value : null; };
      const jours = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
      return {
        getMinutes  : () => parseInt(g('minute')),
        getHours    : () => { const h = parseInt(g('hour')); return h === 24 ? 0 : h; },
        getDate     : () => parseInt(g('day')),
        getMonth    : () => parseInt(g('month')) - 1,
        getDay      : () => jours[g('weekday')],
        getFullYear : () => parseInt(g('year')),
      };
    } catch (e) {
      console.warn(`[Builder Timer] Fuseau inconnu "${timezone}", heure serveur utilisée`);
      return _now();
    }
  }

  // Un champ cron accepte '*', une liste '1,3,5', un intervalle '1-5' et un
  // pas '*/15' — ce dernier absent de WFD, mais annoncé par l'aide du panneau
  // (config-schema.js:245 donne "*/15 * * * *" en exemple). Sans lui, cette
  // expression ne correspondrait jamais et le flux ne partirait tout
  // simplement pas, en silence.
  function match(field, val) {
    if (field === '*') return true;
    return String(field).split(',').some(part => {
      const pas = part.split('/');
      if (pas.length === 2) {
        const n = parseInt(pas[1]);
        if (!n) return false;
        if (pas[0] === '*') return val % n === 0;
        const ab = pas[0].split('-');
        if (ab.length === 2) {
          const min = parseInt(ab[0]), max = parseInt(ab[1]);
          return val >= min && val <= max && (val - min) % n === 0;
        }
        return parseInt(pas[0]) === val;
      }
      if (part.indexOf('-') > -1) {
        const ab = part.split('-');
        return val >= parseInt(ab[0]) && val <= parseInt(ab[1]);
      }
      return parseInt(part) === val;
    });
  }

  function check() {
    const d     = _maintenant();
    const parts = String(expr).trim().split(/\s+/);
    if (parts.length < 5) return;
    if (match(parts[0], d.getMinutes())  &&
        match(parts[1], d.getHours())    &&
        match(parts[2], d.getDate())     &&
        match(parts[3], d.getMonth() + 1) &&
        match(parts[4], d.getDay())) {
      const cle = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
      if (cle === _derniereMinute) return;   // déjà parti dans cette minute
      _derniereMinute = cle;
      fn();
    }
  }

  return check;
}

// La sonde tourne toutes les 30 s — c'est ce qui impose la garde
// anti-double-départ ci-dessus, une échéance à la minute étant rencontrée deux
// fois. Cadence reprise telle quelle de WFD.
function _scheduleCron(expr, fn, timezone) {
  const t = setInterval(creerVerificateurCron(expr, fn, timezone), 30000);
  if (t.unref) t.unref();
  return t;
}

// ── Exécution d'une échéance ─────────────────────────────────────
// Toujours la dernière version PUBLIÉE, jamais le brouillon — même règle que
// le webhook Custom Action (server/routes/builder-engine.js:151). Un
// déclenchement automatique ne doit pas exécuter un document en cours
// d'édition. Le document est relu à CHAQUE échéance et non capturé à la
// planification : republier prend effet à la prochaine échéance sans qu'on
// ait à replanifier.
async function _tirer(flowId, mode) {
  const prisma = _getPrisma();
  try {
    const flow = await prisma.builderFlow.findUnique({
      where: { id: flowId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!flow) { console.warn(`[Builder Timer] Flow ${flowId} disparu — échéance ignorée`); return; }
    if (!flow.active) return;                 // dépublié : silencieux, c'est volontaire
    const version = flow.versions[0];
    if (!version) {
      console.warn(`[Builder Timer] "${flow.name}" non publié — échéance ignorée`);
      return;
    }

    // Payload délibérément vide : une minuterie ne désigne aucun objet.
    // `_timer`/`_mode`/`_firedAt` reprennent les noms de WFD (scheduleTimer,
    // l.294) pour qu'un document porté depuis WFD lise la même chose.
    const triggerPayload = { _timer: true, _mode: mode, _firedAt: new Date().toISOString() };

    await executeRun(version.document, {
      orgId: flow.orgId,
      flowId: flow.id,
      flowVersion: version.version,
      triggerPayload,
      triggerType: 'timer',
      triggerRef: mode,
      prisma,
    });
  } catch (err) {
    console.error(`[Builder Timer] Erreur sur le flow ${flowId} :`, err.message);
  }
}

// ── Planification d'un flow ──────────────────────────────────────
// Port de scheduleTimer(), wfd-engine-trigger.js:287.
function _planifier(flow, cfg) {
  _departifier(flow.id);   // replanifier sans nettoyer laisserait deux échéances actives
  const mode = cfg.timerMode || 'cron';

  const tirer = () => { _tirer(flow.id, mode); };

  if (mode === 'interval') {
    const units = { minutes: 60000, hours: 3600000, days: 86400000 };
    const ms    = (parseInt(cfg.intervalVal) || 30) * (units[cfg.intervalUnit] || 60000);
    const t     = setInterval(tirer, ms);
    if (t.unref) t.unref();
    _timers.set(flow.id, {
      close: () => clearInterval(t),
      libelle: `interval ${cfg.intervalVal || 30} ${cfg.intervalUnit || 'minutes'}`,
    });

  } else if (mode === 'cron') {
    const expr = cfg.cronExpr || '0 9 * * 1-5';
    const t    = _scheduleCron(expr, tirer, cfg.timezone);
    _timers.set(flow.id, {
      close: () => clearInterval(t),
      libelle: `cron "${expr}" (${cfg.timezone || 'heure serveur'})`,
    });

  } else if (mode === 'oneshot') {
    const target = cfg.oneshotDatetime ? new Date(cfg.oneshotDatetime).getTime() : 0;
    const delay  = target - Date.now();
    if (!(delay > 0)) {
      console.warn(`[Builder Timer] "${flow.name}" — one-shot ignoré, date absente ou passée`);
      return;
    }
    const t = setTimeout(tirer, delay);
    if (t.unref) t.unref();
    _timers.set(flow.id, {
      close: () => clearTimeout(t),
      libelle: `one-shot dans ${Math.round(delay / 1000)} s`,
    });
  } else {
    console.warn(`[Builder Timer] "${flow.name}" — timerMode inconnu "${mode}", ignoré`);
    return;
  }

  console.log(`[Builder Timer] ${_timers.get(flow.id).libelle} — "${flow.name}"`);
}

function _departifier(flowId) {
  const t = _timers.get(flowId);
  if (!t) return;
  try { t.close(); } catch (_) {}
  _timers.delete(flowId);
}

// Le trigger planifié est un Core pur, sans façade : `kind: 'schedule'` sur
// l'étape `core: 'trigger'` (config-schema.js:229-263). Une planification n'est
// pas propre à Iconik — elle n'a rien à faire dans la façade `iconik.trigger`,
// qui décrit des évènements de plateforme.
function _configPlanifiee(document) {
  const steps = (document && document.steps) || [];
  const trigger = steps.find(s => s.core === 'trigger');
  if (!trigger) return null;
  const p = trigger.params || {};
  return p.kind === 'schedule' ? p : null;
}

// ── Rechargement complet ─────────────────────────────────────────
// Relit la base et replanifie tout. Appelé au démarrage et après tout
// changement susceptible de modifier une planification (publication,
// activation/désactivation, édition du document). Recharger en bloc plutôt que
// de patcher flow par flow : c'est idempotent, et une planification orpheline
// (flow supprimé) disparaît toute seule.
async function reload() {
  const prisma = _getPrisma();
  const flows = await prisma.builderFlow.findMany({
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  const vus = new Set();
  for (const flow of flows) {
    // La version PUBLIÉE fait foi, pour la planification comme pour
    // l'exécution. Lire le rythme dans le brouillon aurait été plus souple,
    // mais incohérent sur deux plans : `_tirer` refuse de toute façon
    // d'exécuter un flow non publié (on planifierait un no-op bavard), et le
    // canevas enregistre automatiquement — chaque frappe aurait rearmé la
    // minuterie, qu'un `setInterval` sans cesse réinitialisé n'atteint jamais.
    // Conséquence assumée : modifier une planification prend effet à la
    // publication. Pour éprouver un flux planifié sans publier, le
    // déclenchement manuel reste ouvert (POST /api/builder-engine/trigger/:id).
    const version = flow.versions[0];
    const cfg = version && _configPlanifiee(version.document);
    if (!cfg) continue;
    if (!flow.active) {
      console.log(`[Builder Timer] "${flow.name}" désactivé — non planifié`);
      continue;
    }
    vus.add(flow.id);
    _planifier(flow, cfg);
  }

  // Tout ce qui était planifié et ne l'est plus (minuterie retirée, flow
  // désactivé ou supprimé) doit être arrêté.
  for (const flowId of [..._timers.keys()]) {
    if (!vus.has(flowId)) _departifier(flowId);
  }

  return { planifies: _timers.size };
}

async function start() {
  const { planifies } = await reload();
  console.log(`[Builder Timer] ${planifies} flow(s) planifié(s)`);
  return planifies;
}

function stop() {
  for (const flowId of [..._timers.keys()]) _departifier(flowId);
}

// État lisible, pour un futur volet d'admin ou un diagnostic en ligne de
// commande — le planificateur est sinon complètement invisible.
function etat() {
  return [..._timers.entries()].map(([flowId, t]) => ({ flowId, planification: t.libelle }));
}

// `creerVerificateurCron` est exporté pour scripts/preuve-minuterie.js : il
// permet d'éprouver l'expression cron ET la garde anti-double-départ sur le
// vrai code, sans attendre une échéance réelle ni piloter l'horloge du
// processus. Aucun appelant en production.
module.exports = { start, stop, reload, etat, creerVerificateurCron };
