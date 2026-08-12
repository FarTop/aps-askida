// APS — lambda/aps-lookup/index.js — créé le 2026-08-12
// ================================================================
// LA DEUXIÈME DES TROIS FONCTIONS QU'ASL RÉCLAME.
//
// Traduire une correspondance et résoudre l'héritage entre niveaux n'est pas
// exprimable avec les intrinsèques d'ASL : `States.Format` transforme, elle ne
// décide pas. Trente règles, quatre politiques d'héritage, une table de
// traduction par champ — c'est de la logique.
//
// ── ELLE NE RÉIMPLÉMENTE RIEN ───────────────────────────────────
// Elle appelle `builder-correspondance.js` et `builder-heritage.js`, les deux
// modules que le moteur natif utilise déjà. Le premier décide de la FORME des
// valeurs (traduction, type, slug, chemin de rangement), le second du DROIT de
// remonter l'arbre. Aucun n'a de dépendance : le paquet de déploiement se
// réduit à ces trois fichiers.
//
// ── CE QUI CHANGE PAR RAPPORT AU MOTEUR ─────────────────────────
// La LECTURE, et elle seule. APS lit dans un espace de noms global — champ de
// l'objet, métadonnée aplatie, variable d'ambiance, repli. Une Lambda reçoit un
// objet plat que l'état ASL a composé. C'est exactement la ligne de partage
// posée dans builder-correspondance.js : la provenance diverge, la forme non.
//
// ── L'ÉTAT ASL QUI L'APPELLE ────────────────────────────────────
//   "Parameters": {
//     "FunctionName": "aps-lookup",
//     "Payload": {
//       "regles":   [ … Mapping.rules … ],
//       "source.$": "$.<search>.ResponseBody.objects[0].metadata",
//       "ancetres.$": "$.ancetres",
//       "niveau.$":   "$.<search>.ResponseBody.objects[0].metadata.TypeCollection"
//     }
//   }
// ================================================================
'use strict';

const Corresp  = require('../../server/engine-builder/builder-correspondance.js');
const Heritage = require('../../server/engine-builder/builder-heritage.js');

exports.handler = async function (event) {
  const e       = event || {};
  const regles  = e.regles || [];
  const source  = e.source || {};
  const ancetres = e.ancetres || [];
  const niveau  = e.niveau || '';

  const payload  = {};
  const emprunts = [];
  const vides    = [];

  regles.forEach(function (row) {
    const de   = (row.key || row.from || row.src || '').trim();
    const vers = (row.value || row.to || row.tgt || '').trim();
    if (!de || !vers) return;

    let val = source[de];

    // Même ordre que le moteur : le repli d'abord, l'héritage ensuite. Hériter
    // est le dernier recours d'une valeur absente, jamais un raccourci qui
    // court-circuite ce que le niveau avait à dire.
    if ((val === undefined || val === null || val === '') && row.fallback) {
      val = source[String(row.fallback).replace(/^\{|\}$/g, '')];
    }

    const politique = Heritage.politiquePour(row.heritage, niveau);
    const vide = Heritage.estVide(val) || Corresp.estPlaceholderNonResolu(val);

    if (politique === 'fusion') {
      const f = Heritage.fusionner(vide ? undefined : val, de, ancetres);
      if (f.valeurs.length) {
        val = f.valeurs;
        if (f.apports.length) emprunts.push({ champ: de, politique: 'fusion', apports: f.apports, signale: false });
      }
    } else if ((politique === 'cascade' || politique === 'signalee') && vide) {
      const t = Heritage.chercherChezAncetres(de, ancetres);
      if (t) {
        val = t.valeur;
        emprunts.push({ champ: de, politique: politique, depuis: t.depuis.niveau || '',
                        titre: t.depuis.titre || '', signale: politique === 'signalee' });
      }
    }

    if (Heritage.estVide(val) || Corresp.estPlaceholderNonResolu(val)) { vides.push(de); return; }

    val = Heritage.deballerJson(val);
    val = Corresp.traduire(val, row.children || []).valeur;
    val = Corresp.formater(val, row);
    Corresp.rangerA(payload, vers, val);
  });

  // `signales` à part : ce sont eux, et eux seuls, que le compte rendu de
  // livraison affiche. Pour un champ en cascade, hériter EST la vérité de
  // l'œuvre — l'écrire à chaque ligne noierait ce qui compte.
  return {
    payload: payload,
    emprunts: emprunts,
    signales: emprunts.filter(x => x.signale).map(x => x.champ + ' ← ' + x.depuis),
    vides: vides,
    champsRemplis: Object.keys(payload).length,
  };
};
