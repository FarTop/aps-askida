// APS — server/engine-builder/builder-handler-lookup.js — créé le 2026-08-05
// Port de lookup(), server/engine/wfd-engine-handlers.js:927-1160 (+
// _setNestedValue:933-992, _isUnresolvedPlaceholder). `rows` vient de la
// résolution de `params.mappingId` (Mapping.rules), portée depuis
// pivot-to-wfd.js:88-91 (mappingId -> lkRows) plutôt que d'une conversion
// préalable. Ports du pivot : found | not_found.
'use strict';

const BuilderContext = require('./builder-context.js');
const Heritage       = require('./builder-heritage.js');
const Corresp        = require('./builder-correspondance.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

// Aperçu court et toujours affichable d'une valeur, pour la trace destinée à
// l'onglet Action — borné pour ne pas gonfler chaque ctxSnapshot du run.
function _apercu(v) {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(x => String(x)).join(', ').slice(0, 200);
  if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 200); } catch (_) { return '[objet]'; } }
  return String(v).slice(0, 200);
}

async function lookup(step, ctx, deps) {
  const p = step.params || {};
  const inputVar = p.lkInputVar || '';
  const mapping  = p.mappingId && deps && deps.resolved && deps.resolved.mappings
    ? deps.resolved.mappings[p.mappingId] : null;
  const rows     = (mapping && mapping.rules) || p.lkRows || [];
  const target   = r(p.lkOutputVar || '_lookup_result', ctx);
  const fallback = p.lkFallback;

  const inputStr = inputVar.replace(/^\{|\}$/g, '');
  const inputRaw = BuilderContext.resolvePath(inputStr, ctx)
                ?? ctx.results?.[inputStr]
                ?? r(inputVar, ctx);
  const isObject = inputRaw && typeof inputRaw === 'object' && !Array.isArray(inputRaw);

  if (isObject) {
    const mapped  = {};
    const trace   = [];
    let   matched = 0;

    // L'HÉRITAGE ENTRE NIVEAUX. La pile d'ancêtres est posée par
    // iconik.resolve_ancestors, en amont sur le chemin nominal du PUBLISH
    // (« Collections Parentes » → Check Collection → … → Lookup). Quand elle
    // est absente — nœud non exécuté, workflow sans arborescence — toute
    // politique retombe sur `propre` et le Lookup se comporte exactement comme
    // avant : rien à hériter, rien ne change.
    const ancetres = ctx.results?._ancetres || [];
    const niveau   = ctx.vars?.TypeCollection || '';

    rows.forEach(row => {
      const fromKey  = (row.key || row.from || row.src || '').trim();
      const toKey    = (row.value || row.to || row.tgt || '').trim();
      const children = row.children || [];
      if (!fromKey || !toKey) return;

      // `origine` : d'OÙ la valeur a réellement été tirée. Tracé au fil des
      // replis successifs plutôt que déduit après coup — c'est la seule
      // façon de dire honnêtement « champ », « métadonnée », « variable » ou
      // « repli », et de montrer le CONTENU résolu plutôt que le nom de la
      // variable (demande utilisateur du 2026-08-06 : l'onglet Action doit
      // montrer ce que le nœud a fait, pas répéter son gabarit).
      let val, origine = null;
      if (fromKey.includes('{') || fromKey.includes('://') || fromKey.includes('{{')) {
        val = r(fromKey, ctx);
        origine = 'expression';
      } else {
        val = inputRaw[fromKey];
        if (val !== undefined) origine = 'champ';
      }

      if (val === undefined && inputRaw.metadata_values) {
        const fv = inputRaw.metadata_values[fromKey]?.field_values;
        if (fv?.length) { val = fv.length === 1 ? fv[0].value : fv.map(f => f.value); origine = 'métadonnée'; }
      }

      if (val === undefined) {
        val = ctx.vars?.[fromKey];
        if (val !== undefined) origine = 'variable';
      }

      const valeurDirecte = val;
      let repliUtilise = false;
      if ((val === undefined || val === null || val === '') && row.fallback) {
        const fbKey = row.fallback.replace(/^\{|\}$/g, '');
        val = ctx.vars?.[fbKey] ?? r(row.fallback, ctx);
        repliUtilise = true;
        origine = 'repli';
      }

      // ── HÉRITAGE ENTRE NIVEAUX ────────────────────────────────────
      // Après le repli, avant le constat de vide : hériter est le DERNIER
      // recours d'une valeur absente, jamais un raccourci qui court-circuite
      // ce que le niveau courant ou son repli avaient à dire. Sauf `fusion`,
      // qui n'est pas un recours mais une union — elle s'applique même quand
      // le niveau porte déjà sa propre valeur (un épisode qui déclare un
      // invité doit GARDER le casting récurrent de sa série).
      //
      // Un repli non résolu compte ici comme vide : `{maVariable}` resté tel
      // quel ne dit rien de plus qu'une absence, et refuser d'hériter par
      // égard pour une variable qui n'existe pas rebloquerait la branche pour
      // une faute de frappe. S'il n'y a rien à hériter non plus, le constat
      // `non_resolu` d'origine est rendu intact juste en dessous.
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
            // `signalee` n'est pas `cascade` : le synopsis d'une série posé
            // sur un épisode remplit le champ et livre un texte qui ne le
            // décrit pas — donnée trompeuse, pas donnée manquante. On ne
            // l'interdit pas (ça rebloquerait l'arbre), on la rend visible.
            signale  : politique === 'signalee',
          };
        }
      }

      if (Corresp.estPlaceholderNonResolu(val)) {
        // HORS PÉRIMÈTRE ≠ REPLI CASSÉ. Un unitaire n'a pas de visuel de
        // saison, un épisode pas de visuel de série : la variable manque parce
        // que le manifeste a écarté cette essence à ce niveau, pas parce que
        // quelqu'un s'est trompé de nom. Le niveau est déclaré UNE fois, dans
        // le manifeste — le Lookup ne le redéclare pas, il lit ce que Deliver
        // a écarté (`_hors_niveau`). Sans cette distinction, un run parfait
        // affichait trois lignes rouges et donnait l'air d'être cassé.
        const nomVar = String(val).trim().replace(/^\{|\}$/g, '');
        if ((ctx.results?._hors_niveau || []).indexOf(nomVar) !== -1) {
          trace.push({
            de: fromKey, vers: toKey, statut: 'hors_niveau', origine: null,
            repli: row.fallback || null, heritage: politique,
            motif: 'ne s\'applique pas au niveau ' + (niveau || '?') + ' — le manifeste ne déclare pas cette essence ici',
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
      // métadonnées Iconik sous leur nom nu dans les variables, et une
      // variable est une chaîne : deux genres arrivent en
      // `'["av_genre_comedy","av_genre_adventure"]'`, pas en tableau. Le
      // formatage `slug` connaissait déjà cette forme et la déballait pour lui
      // seul ; la traduction, elle, cherchait la chaîne ENTIÈRE dans la table
      // et ne la trouvait évidemment jamais. Un seul genre passait (chaîne
      // simple, traduite), deux genres partaient non traduits et VOD Factory
      // refusait tout l'envoi (« The selected genres.0 is invalid », constaté
      // le 2026-08-12). On déballe donc UNE FOIS, ici, pour tout l'aval.
      val = Heritage.deballerJson(val);

      const valeurAvantTraduction = val;
      // Traduction et mise en forme vivent dans builder-correspondance.js :
      // fonctions pures, partagées avec la Lambda que réclame AWS Step
      // Functions. Ce qui touche à la PROVENANCE d'une valeur reste ici (APS a
      // un espace de noms global, une Lambda reçoit un objet plat) ; ce qui
      // touche à sa FORME doit être identique des deux côtés, sinon la même
      // correspondance produirait deux payloads différents.
      const _t = Corresp.traduire(val, children);
      val = _t.valeur;
      const traduction = _t.traduction;
      val = Corresp.formater(val, row);

      Corresp.rangerA(mapped, toKey, val);
      matched++;
      trace.push({
        de: fromKey, vers: toKey, statut: 'ok', origine: origine,
        repli: repliUtilise ? (row.fallback || null) : null,
        valeurSource: _apercu(repliUtilise ? valeurAvantTraduction : valeurDirecte),
        traduction: traduction ? { de: _apercu(traduction.de), vers: traduction.vers } : null,
        valeurFinale: _apercu(val),
        // L'emprunt est tracé au moment où il a lieu, pas déduit après coup —
        // c'est la seule façon de dire de QUEL niveau la valeur vient. Sans
        // cette trace, `signalee` ne vaudrait pas mieux que `cascade` : on
        // livrerait vingt épisodes avec le même synopsis sans que personne ne
        // le sache.
        heritage: emprunt,
      });
    });

    // Trace de ce que CE nœud a réellement fait, ligne par ligne — consommée
    // par l'onglet Action (run-panel.js). Clé préfixée `_` : exclue des
    // variables publiques, et repérable par id de step (plusieurs Lookup
    // possibles dans un même run).
    BuilderContext.storeResult(ctx, '_lk_trace_' + step.id, trace);

    // Le RÉCAPITULATIF DES EMPRUNTS, à part de la trace ligne à ligne : c'est
    // lui que le compte rendu de livraison (iconik.history) consomme pour dire
    // « ce champ ne vient pas de ce niveau ». Sans lui, `signalee` ne vaudrait
    // pas mieux que `cascade` — la politique existerait dans la correspondance
    // sans jamais rien signaler à personne.
    BuilderContext.storeResult(ctx, '_emprunts', trace
      .filter(t => t.heritage && (t.heritage.signale || (t.heritage.apports || []).length))
      .map(t => ({
        champ    : t.de,
        vers     : t.vers,
        politique: t.heritage.politique,
        depuis   : t.heritage.depuis || null,
        titre    : t.heritage.titre || '',
        signale  : !!t.heritage.signale,
        apports  : t.heritage.apports || null,
      })));
    BuilderContext.storeResult(ctx, target, mapped);
    BuilderContext.setVar(ctx, target, JSON.stringify(mapped));
    Object.entries(mapped).forEach(([k, v]) => {
      if (!k.includes('.') && !k.includes('[') && typeof v !== 'object') {
        BuilderContext.setVar(ctx, k, String(v ?? ''));
      }
    });

    return { port: matched > 0 ? 'found' : 'not_found' };
  }

  const input = String(inputRaw ?? '');
  const def   = fallback != null ? r(String(fallback), ctx) : input;
  const match = rows.find(row => {
    const from = (row.key || row.from || '').trim();
    return r(from, ctx) === input || from === input;
  });
  const output = match ? r((match.value || match.to || ''), ctx) : def;
  BuilderContext.setVar(ctx, target, output);
  return { port: match ? 'found' : 'not_found' };
}

module.exports = lookup;
