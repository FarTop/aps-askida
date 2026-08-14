// APS — aps-verify — fonction générée, portée depuis
// server/engine-builder/builder-handler-verify.js (2026-08-05).
// ================================================================
// Vérifie chez le partenaire ce qu'il a RÉELLEMENT reçu, essence par essence.
// S3 dit « le fichier est parti » ; cette fonction dit « il est arrivé ».
//
// ── PORTÉE, PAS RÉÉCRITE ────────────────────────────────────────
// Les opérateurs, le filtrage par niveau, la mémorisation par point d'entrée et
// la forme du résumé sont ceux du moteur du Builder, à l'identique. Deux
// implémentations qui divergent seraient le pire cas : le moteur natif
// validerait un workflow que la cible exécute autrement, et personne ne le
// verrait avant la production.
//
// ── AUTONOME : C'EST TOUT L'OBJET ───────────────────────────────
// Rien ici n'appelle APS. Le jour où la mission s'arrête, cette fonction
// continue de tourner chez le client avec ce qu'elle a. Sa configuration —
// quelles essences, quel point d'entrée, quel chemin lire — arrive en ENTRÉE,
// depuis la définition de la machine d'états. Un manifeste modifié dans APS se
// traduit par une nouvelle soumission, pas par un redéploiement de code.
//
// ── L'AUTHENTIFICATION ──────────────────────────────────────────
// Une Lambda n'a pas accès aux connexions EventBridge comme un Task HTTP natif.
// Passer le jeton dans la charge utile le rendrait lisible dans la définition
// ET dans l'historique de chaque exécution — exclu. On lit donc le secret que
// la connexion EventBridge fabrique elle-même dans Secrets Manager : un seul
// magasin d'identifiants, celui que la soumission crée de toute façon, et rien
// à faire tourner en plus le jour où le jeton change.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { checks: [{ label, endpoint, method, path, op, value, appliesTo[] }],
//     typeCollection: 'Série' | 'Saison' | 'Episode' | 'Unitaire',
//     connexion: { baseUrl, connectionArn } }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { total, passed, failures[], checkerSummary }
//   Même forme que builder-handler-verify.js:146-147, pour qu'un lecteur n'ait
//   qu'un seul modèle à tenir en tête.
// ================================================================
'use strict';

// Les en-têtes viennent de commun-connexion.js : le même code sert à
// aps-create-tree, et un secret lu de deux façons différentes serait le
// genre d'écart qui ne se voit qu'en production.
const { entetesDe } = require('./commun-connexion.js');

// Lire un chemin pointé, indices entre crochets compris. Identique au moteur :
// un chemin qui ne résout pas rend `undefined`, jamais une erreur — c'est le
// contrôle qui décide si l'absence est un échec, pas le lecteur.
function parChemin(obj, chemin) {
  if (!obj || !chemin) return undefined;
  return String(chemin).split('.').reduce(function (o, k) {
    if (o === null || o === undefined) return undefined;
    const m = k.match(/^(.+)\[(\d+)\]$/);
    if (m) { const t = o[m[1]]; return t ? t[parseInt(m[2], 10)] : undefined; }
    return o[k];
  }, obj);
}

const NIVEAU_PAR_TYPE = {
  'Série': 'serie', 'Saison': 'saison', 'Episode': 'episode', 'Unitaire': 'unitaire',
};

exports.handler = async function (evenement) {
  const e = evenement || {};
  const controles = Array.isArray(e.checks) ? e.checks : [];
  if (!controles.length) {
    return { total: 0, passed: 0, failures: [], checkerSummary: 'OK' };
  }

  // Le filtrage par NIVEAU, et c'est la raison d'être de cette fonction : le
  // manifeste dit à quels niveaux chaque essence s'applique, et seul le run
  // sait quel niveau tourne. Aucune définition ASL ne peut poser la question.
  const niveau = NIVEAU_PAR_TYPE[e.typeCollection] || '';
  const portee = controles.filter(function (c) {
    if (!Array.isArray(c.appliesTo) || !c.appliesTo.length || !niveau) return true;
    return c.appliesTo.indexOf(niveau) !== -1;
  });

  const cx = e.connexion || {};
  const base = String(cx.baseUrl || '').replace(/\/$/, '');
  const entetes = Object.assign(
    { 'Content-Type': 'application/json', Accept: 'application/json' },
    await entetesDe(cx.connectionArn)
  );

  // UNE RÉPONSE PAR POINT D'ENTRÉE, pas une par contrôle. Le manifeste VOD
  // Factory a huit vérifications qui tapent toutes la même URL : sans cette
  // mémoire, une collection coûtait huit appels identiques, et huit collections
  // en coûtaient soixante-quatre — assez pour que le partenaire réponde 429
  // quand deux runs s'enchaînent (constaté en réel le 2026-08-10). La portée
  // est UN appel : comparer un état à un instant donné ne demande pas de relire
  // la même URL deux fois.
  const reponses = new Map();
  async function lire(methode, point) {
    const cle = methode + ' ' + point;
    if (reponses.has(cle)) return reponses.get(cle);
    let issue;
    try {
      const res = await fetch(base + point, { method: methode, headers: entetes });
      if (!res.ok) {
        issue = { ok: false, error: 'HTTP ' + res.status };
      } else {
        const texte = await res.text();
        let corps; try { corps = JSON.parse(texte); } catch (_) { corps = texte; }
        issue = { ok: true, body: corps };
      }
    } catch (err) {
      issue = { ok: false, error: err.message };
    }
    reponses.set(cle, issue);
    return issue;
  }

  const echecs = [];
  for (const c of portee) {
    const point   = String(c.endpoint || '');
    const methode = String(c.method || 'GET').toUpperCase();
    const libelle = c.label || point;

    const issue = await lire(methode, point);
    if (!issue.ok) { echecs.push({ label: libelle, error: issue.error }); continue; }

    const corps = issue.body;
    const op = c.op || 'equals';
    const attendu = c.value === undefined || c.value === null ? '' : String(c.value);
    // Le repli sur `.results` vient du moteur : certains partenaires enveloppent
    // leur réponse, et le chemin du manifeste est écrit sans l'enveloppe.
    let lu = c.path ? parChemin(corps, c.path) : corps;
    if ((lu === undefined || lu === null || lu === '') && corps && corps.results !== undefined) {
      lu = c.path ? parChemin(corps.results, c.path) : corps.results;
    }
    const luTexte = lu === null || lu === undefined ? '' : String(lu);

    let passe = false;
    if (op === 'equals')            passe = luTexte === attendu;
    else if (op === 'not_equals')   passe = luTexte !== attendu;
    else if (op === 'not_empty')    passe = luTexte !== '' && lu !== null && lu !== undefined;
    else if (op === 'contains')     passe = luTexte.indexOf(attendu) !== -1;
    else if (op === 'starts_with')  passe = luTexte.indexOf(attendu) === 0;

    if (!passe) echecs.push({ label: libelle, path: c.path, expected: attendu, actual: luTexte, op: op });
  }

  return {
    total: portee.length,
    passed: portee.length - echecs.length,
    failures: echecs,
    checkerSummary: echecs.length
      ? echecs.map(function (f) { return (f.label || f.path) + ': ' + (f.error || f.actual || 'échec'); }).join(', ')
      : 'OK',
  };
};
