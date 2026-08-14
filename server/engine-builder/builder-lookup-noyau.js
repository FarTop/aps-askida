// APS — server/engine-builder/builder-lookup-noyau.js — créé le 2026-08-14
// ================================================================
// LE NOYAU DU LOOKUP : appliquer une correspondance à un objet.
//
// Fonction PURE : des lignes de correspondance et un objet entrent, un objet
// traduit et sa trace sortent. Ni contexte, ni réseau, ni base.
//
// ── POURQUOI L'EXTRAIRE, ET POURQUOI MAINTENANT ─────────────────
// Même geste que `builder-essences.js` le 2026-08-12, et pour la même raison :
// cette logique doit servir DEUX moteurs — celui d'APS et une Lambda AWS —, et
// deux implémentations divergentes produiraient deux charges utiles
// différentes à partir de la même correspondance. Le partenaire refuserait
// l'une et accepterait l'autre, sans que rien ne dise laquelle a raison.
//
// Le partage était déjà à moitié fait, et délibérément : `builder-correspondance.js`
// portait la FORME d'une valeur (traduire, formater) parce qu'elle doit être
// identique des deux côtés, pendant que la PROVENANCE restait dans le handler —
// « APS a un espace de noms global, une Lambda reçoit un objet plat ».
//
// Ce module tient la moitié manquante : l'ORDRE des recours, qui est le vrai
// savoir métier. Champ, puis métadonnée, puis variable, puis repli, puis
// héritage — et le constat de vide seulement après tout ça. Cet ordre n'est pas
// une commodité d'écriture : il dit qu'hériter est le DERNIER recours et jamais
// un raccourci.
//
// La provenance, elle, reste injectée : `variables` est le sac de noms de
// l'appelant, `resoudre` sa façon de rendre un gabarit. APS y passe son
// contexte ; la Lambda, un objet plat et une substitution simple.
// ================================================================
'use strict';

const Heritage = require('./builder-heritage.js');
const Corresp  = require('./builder-correspondance.js');

// Aperçu court et toujours affichable d'une valeur, pour la trace destinée à
// l'onglet Action — borné pour ne pas gonfler chaque ctxSnapshot du run.
function apercu(v) {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(x => String(x)).join(', ').slice(0, 200);
  if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 200); } catch (_) { return '[objet]'; } }
  return String(v).slice(0, 200);
}

/**
 * @param {object} o
 * @param {array}  o.rows        lignes de la correspondance
 * @param {object} o.entree      l'objet source
 * @param {object} [o.variables] le sac de noms de l'appelant
 * @param {array}  [o.ancetres]  pile posée par resolve_ancestors
 * @param {string} [o.niveau]    TypeCollection courant
 * @param {array}  [o.horsNiveau] essences écartées par Deliver à ce niveau
 * @param {function} [o.resoudre] rendre un gabarit `{…}`
 * @returns {{ mapped: object, trace: array, matched: number }}
 */
function appliquer(o) {
  const rows       = (o && o.rows) || [];
  const entree     = (o && o.entree) || {};
  const variables  = (o && o.variables) || {};
  const ancetres   = (o && o.ancetres) || [];
  const niveau     = (o && o.niveau) || '';
  const horsNiveau = (o && o.horsNiveau) || [];
  const resoudre   = (o && o.resoudre) || function (g) { return g; };

  const mapped  = {};
  const trace   = [];
  let   matched = 0;

  rows.forEach(function (row) {
    const fromKey  = (row.key || row.from || row.src || '').trim();
    const toKey    = (row.value || row.to || row.tgt || '').trim();
    const children = row.children || [];
    if (!fromKey || !toKey) return;

    // `origine` : d'OÙ la valeur a réellement été tirée. Tracé au fil des
    // replis successifs plutôt que déduit après coup — c'est la seule façon de
    // dire honnêtement « champ », « métadonnée », « variable » ou « repli », et
    // de montrer le CONTENU résolu plutôt que le nom de la variable.
    let val, origine = null;
    if (fromKey.includes('{') || fromKey.includes('://') || fromKey.includes('{{')) {
      val = resoudre(fromKey);
      origine = 'expression';
    } else {
      val = entree[fromKey];
      if (val !== undefined) origine = 'champ';
    }

    if (val === undefined && entree.metadata_values) {
      const fv = entree.metadata_values[fromKey] && entree.metadata_values[fromKey].field_values;
      if (fv && fv.length) { val = fv.length === 1 ? fv[0].value : fv.map(f => f.value); origine = 'métadonnée'; }
    }

    if (val === undefined) {
      val = variables[fromKey];
      if (val !== undefined) origine = 'variable';
    }

    const valeurDirecte = val;
    let repliUtilise = false;
    if ((val === undefined || val === null || val === '') && row.fallback) {
      const fbKey = row.fallback.replace(/^\{|\}$/g, '');
      val = variables[fbKey] !== undefined ? variables[fbKey] : resoudre(row.fallback);
      repliUtilise = true;
      origine = 'repli';
    }

    // ── HÉRITAGE ENTRE NIVEAUX ────────────────────────────────────
    // Après le repli, avant le constat de vide : hériter est le DERNIER recours
    // d'une valeur absente, jamais un raccourci qui court-circuite ce que le
    // niveau courant ou son repli avaient à dire. Sauf `fusion`, qui n'est pas
    // un recours mais une union — elle s'applique même quand le niveau porte
    // déjà sa propre valeur (un épisode qui déclare un invité doit GARDER le
    // casting récurrent de sa série).
    //
    // Un repli non résolu compte ici comme vide : `{maVariable}` resté tel quel
    // ne dit rien de plus qu'une absence, et refuser d'hériter par égard pour
    // une variable qui n'existe pas rebloquerait la branche pour une faute de
    // frappe.
    const politique = Heritage.politiquePour(row.heritage, niveau);
    const _vide     = function (v) { return Heritage.estVide(v) || Corresp.estPlaceholderNonResolu(v); };
    let   emprunt   = null;

    if (politique === 'fusion') {
      const f = Heritage.fusionner(_vide(val) ? undefined : val, fromKey, ancetres);
      if (f.valeurs.length) {
        val = f.valeurs;
        if (f.apports.length) {
          emprunt = { politique: 'fusion', apports: f.apports, signale: false };
          if (!origine) origine = 'héritage';
        }
      }
    } else if ((politique === 'cascade' || politique === 'signalee') && _vide(val)) {
      const t = Heritage.chercherChezAncetres(fromKey, ancetres);
      if (t) {
        val = t.valeur;
        origine = 'héritage';
        emprunt = {
          politique: politique,
          depuis   : t.depuis.niveau || t.depuis.titre || '(ancêtre)',
          titre    : t.depuis.titre || '',
          // `signalee` n'est pas `cascade` : le synopsis d'une série posé sur un
          // épisode remplit le champ et livre un texte qui ne le décrit pas —
          // donnée trompeuse, pas donnée manquante. On ne l'interdit pas (ça
          // rebloquerait l'arbre), on la rend visible.
          signale  : politique === 'signalee',
        };
      }
    }

    if (Corresp.estPlaceholderNonResolu(val)) {
      // HORS PÉRIMÈTRE ≠ REPLI CASSÉ. Un unitaire n'a pas de visuel de saison,
      // un épisode pas de visuel de série : la variable manque parce que le
      // manifeste a écarté cette essence à ce niveau, pas parce que quelqu'un
      // s'est trompé de nom. Sans cette distinction, un run parfait affichait
      // trois lignes rouges et donnait l'air d'être cassé.
      const nomVar = String(val).trim().replace(/^\{|\}$/g, '');
      if (horsNiveau.indexOf(nomVar) !== -1) {
        trace.push({
          de: fromKey, vers: toKey, statut: 'hors_niveau', origine: null,
          repli: row.fallback || null, heritage: politique,
          motif: 'ne s\'applique pas au niveau ' + (niveau || '?')
               + ' — le manifeste ne déclare pas cette essence ici',
        });
        return;
      }
      trace.push({
        de: fromKey, vers: toKey, statut: 'non_resolu', origine: origine,
        repli: row.fallback || null, heritage: politique,
        motif: 'repli non résolu — la variable ' + String(val) + " n'existe pas dans ce contexte",
      });
      return;
    }
    if (val === undefined || val === null || val === '') {
      const _remonte = (politique === 'cascade' || politique === 'signalee' || politique === 'fusion');
      trace.push({
        de: fromKey, vers: toKey, statut: 'vide', origine: null,
        repli: row.fallback || null, heritage: politique,
        motif: _remonte
          ? (ancetres.length
              ? 'source absente, et aucun des ' + ancetres.length + ' ancêtres ne porte ce champ'
              : 'source absente, et aucun ancêtre à remonter')
          : (row.fallback
              ? (repliUtilise ? 'source absente, et le repli est vide' : 'source absente')
              : 'source absente (aucun repli défini)'),
      });
      return;
    }

    // UNE VALEUR MULTIPLE ARRIVE SÉRIALISÉE. Le nœud Search expose les
    // métadonnées Iconik sous leur nom nu dans les variables, et une variable
    // est une chaîne : deux genres arrivent en
    // `'["av_genre_comedy","av_genre_adventure"]'`, pas en tableau. On déballe
    // UNE FOIS, ici, pour tout l'aval — sans quoi la traduction cherche la
    // chaîne entière dans la table et ne la trouve jamais (VOD Factory a refusé
    // tout un envoi pour ça le 2026-08-12).
    val = Heritage.deballerJson(val);

    const valeurAvantTraduction = val;
    const _t = Corresp.traduire(val, children);
    val = _t.valeur;
    const traduction = _t.traduction;
    val = Corresp.formater(val, row);

    Corresp.rangerA(mapped, toKey, val);
    matched++;
    trace.push({
      de: fromKey, vers: toKey, statut: 'ok', origine: origine,
      repli: repliUtilise ? (row.fallback || null) : null,
      valeurSource: apercu(repliUtilise ? valeurAvantTraduction : valeurDirecte),
      traduction: traduction ? { de: apercu(traduction.de), vers: traduction.vers } : null,
      valeurFinale: apercu(val),
      // L'emprunt est tracé au moment où il a lieu, pas déduit après coup —
      // c'est la seule façon de dire de QUEL niveau la valeur vient. Sans cette
      // trace, `signalee` ne vaudrait pas mieux que `cascade` : on livrerait
      // vingt épisodes avec le même synopsis sans que personne ne le sache.
      heritage: emprunt,
    });
  });

  return { mapped: mapped, trace: trace, matched: matched };
}

// Le récapitulatif des emprunts, tiré de la trace. À part de la trace ligne à
// ligne : c'est lui que le compte rendu de livraison consomme pour dire « ce
// champ ne vient pas de ce niveau ».
function empruntsDe(trace) {
  return (trace || [])
    .filter(t => t.heritage && (t.heritage.signale || (t.heritage.apports || []).length))
    .map(t => ({
      champ    : t.de,
      vers     : t.vers,
      politique: t.heritage.politique,
      depuis   : t.heritage.depuis || null,
      titre    : t.heritage.titre || '',
      signale  : !!t.heritage.signale,
      apports  : t.heritage.apports || null,
    }));
}

module.exports = { appliquer, empruntsDe, apercu };
