// APS — server/engine-builder/builder-handler-history.js — créé le 2026-08-05
// Port de workflow_history(), server/engine/wfd-engine-handlers.js:3233-3369.
// `essences` vient de la résolution de `params.manifestId` (Manifest.essences
// filtrées sur role && sortie), même dérivation que pivot-to-wfd.js:165-179
// (manifestId -> essences), portée ici plutôt qu'au moment de la conversion.
// Partagé par le core `history` pur et la façade `iconik.history` (même
// fonction). Ports du pivot : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik, metadataValuesDepuisReponse } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }
// Une RÉFÉRENCE (l'objet visé), tolérante au nom nu que le panneau stocke
// sans accolades — cf. BuilderContext.resolveRef.
function ref(val, ctx) { return BuilderContext.resolveRef(val, ctx); }

function _essencesFromManifest(manifest) {
  const essences = (manifest && manifest.essences) || [];
  return essences
    .filter(e => e.role && e.sortie)
    .map(e => {
      // `verifie` : cet essence a un verifyPath dans le Manifest, donc Verify
      // (builder-handler-verify.js) l'a réellement interrogé auprès du
      // Partner — sinon (ex. Title, cardinalite "optionnel") Verify ne le
      // vérifie jamais et il n'y a aucun résultat Partner à lui opposer.
      const eh = { role: e.role, sortie: e.sortie, cardinalite: e.cardinalite || '', verifie: !!e.verifyPath };
      if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
        eh.appliesTo = e.appliesTo;
      }
      return eh;
    });
}

async function workflowHistory(step, ctx, deps) {
  const iconikClient = deps && deps.iconikClient;
  requireIconik(iconikClient, 'iconik.history');

  const p = step.params || {};
  const manifest = p.manifestId && deps.resolved && deps.resolved.manifests
    ? deps.resolved.manifests[p.manifestId] : null;
  const essences = manifest ? _essencesFromManifest(manifest) : (p.essences || []);

  const targetId = ref(p.targetId || ((p.target || 'asset') === 'collection' ? '{collection.id}' : '{asset_id}'), ctx)
    || ctx.vars?.asset_id || ctx.asset?.id || '';
  const mdViewId = p.mdViewId || '';
  const mdField  = p.mdField  || '';
  const mode     = p.whMode   || 'add';
  const order    = p.whOrder  || 'newest';
  const statut   = r(p.whStatut || '', ctx);
  const message  = r(p.whMessage || '', ctx);

  let essenceChecklist = '';
  if (essences.length) {
    const TYPE_TO_NIVEAU = { 'Série': 'serie', 'Saison': 'saison', 'Episode': 'episode', 'Unitaire': 'unitaire' };
    const niveauCourant  = TYPE_TO_NIVEAU[ctx.vars?.TypeCollection] || '';
    const _libelle = (role) => (role || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    const essencesPortee = essences.filter(e => {
      if (!Array.isArray(e.appliesTo) || !e.appliesTo.length || !niveauCourant) return true;
      return e.appliesTo.indexOf(niveauCourant) !== -1;
    });
    // Un essence "optionnel" absent n'est pas un échec (➖, neutre) — seul un
    // essence requis (au_moins_un/exactement_un/au_plus_n) absent est un vrai
    // ❌. Cette distinction manquait jusqu'ici : tout absent affichait ❌,
    // optionnel ou pas (retour utilisateur 2026-08-06 : Title, marqué
    // `cardinalite: "optionnel"` dans le Manifest, ne devrait pas s'afficher
    // en échec s'il est simplement absent).
    //
    // Source de vérité par essence : pour un essence VÉRIFIÉ par Verify
    // (verifyPath configuré), le ✅/❌ reflète le résultat Partner réel
    // (checkerResult), jamais la présence S3 — le listing S3 (Check
    // Collection/Check Asset) n'est qu'une optimisation technique interne
    // (éviter un ré-upload inutile), pas une confirmation qui compte pour
    // l'utilisateur ; l'afficher ici produisait un ✅ alors que le Partner
    // répondait 404 sur ce même essence (retour utilisateur 2026-08-06 :
    // "la vérif VOD Factory est celle qui importe à l'utilisateur"). Pour un
    // essence NON vérifié (ex. Title, pas de verifyPath — Partner n'est
    // jamais interrogé dessus), repli sur la présence S3, seule donnée
    // disponible.
    const checkerFailures = (ctx.results && ctx.results.checkerResult && ctx.results.checkerResult.failures) || null;
    essenceChecklist = essencesPortee.map(function (e) {
      const label = _libelle(e.role);
      if (e.verifie && checkerFailures) {
        const echoue = checkerFailures.some(function (f) { return f.label === e.role; });
        return label + (echoue ? ' ❌' : ' ✅');
      }
      // resolvePath (pas resolve()) : resolve() renvoie le `{placeholder}`
      // brut inchangé quand la variable est absente (utile pour ne pas
      // casser un texte libre), ce qui rendrait tout essence "présent" ici.
      const val = BuilderContext.resolvePath(e.sortie, ctx);
      const present = val !== undefined && val !== null && val !== '';
      if (present) return label + ' ✅';
      if (e.cardinalite === 'optionnel') return label + ' ➖';
      return label + ' ❌';
    }).join(' ');
  }

  if (!targetId || !mdField) throw new Error('Workflow History : targetId et mdField requis');

  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10) + '_' + now.toTimeString().slice(0, 5);
  const runId   = ctx.runId || '';
  const wfName  = p.whWfName || '';
  const user    = ctx.trigger?.user || ctx.vars?.['trigger.user'] || '';

  // `parts` = la ligne affichée. `partsSignifiantes` = la même chose privée de
  // ce qui change à chaque passage sans rien dire de neuf (la date, l'id de
  // run). C'est elle qui sert de signature au mode 'change' plus bas. Les deux
  // se remplissent dans le MÊME ordre, ce qui fait de la signature une
  // sous-chaîne contiguë de la ligne — la comparaison peut donc rester un
  // simple `includes`, sans reparser un format.
  const parts = [];
  const partsSignifiantes = [];
  const pousser = (v, signifiant) => {
    parts.push(v);
    if (signifiant) partsSignifiantes.push(v);
  };
  if (p.whShowDate !== false && dateStr) pousser(dateStr, false);
  if (p.whShowWf   !== false && wfName)  pousser(wfName, true);
  if (p.whShowUser !== false && user)    pousser(user, true);
  if (statut)  pousser(statut, true);
  if (message) pousser(message, true);
  if (essenceChecklist) pousser(essenceChecklist, true);

  if (p.whSummaryVar) {
    try {
      const summaryPath = p.whSummaryVar.replace(/^\{|\}$/g, '');
      let summaryObj = ctx.results;
      for (const part of summaryPath.split('.')) {
        if (summaryObj === null || summaryObj === undefined) break;
        summaryObj = summaryObj[part];
      }
      if (summaryObj && typeof summaryObj === 'object') {
        const okStatuses = ['complete', 'ready', 'sent', 'success'];
        const issues = Object.entries(summaryObj)
          .filter(([k, v]) => v && typeof v === 'object' && v.status && !okStatuses.includes(v.status))
          .map(([k, v]) => k.replace('amazon_', '') + ': ' + (v.status_details || v.status));
        if (issues.length) pousser(issues.join(', '), true);
      }
    } catch (_) {}
  }
  if (p.whShowRunId === true && runId) pousser(runId.slice(0, 12), false);

  const visibleLine = parts.join(' | ');
  const newLine = (mode === 'add' && runId)
    ? visibleLine + ' [' + runId.slice(0, 12) + ']'
    : visibleLine;

  const _whIsCol = (p.target || 'asset') === 'collection';
  const _whBase  = _whIsCol
    ? `/API/metadata/v1/collections/${targetId}/`
    : `/API/metadata/v1/assets/${targetId}/`;
  const endpoint = mdViewId ? `${_whBase}views/${mdViewId}/` : _whBase;

  let existing = {};
  try {
    const current = await iconikClient.get(endpoint);
    existing = metadataValuesDepuisReponse(current);
  } catch (e) { /* vue non initialisée — traiter comme vide */ }

  const currentVal = (existing[mdField]?.field_values?.[0]?.value || '').trim();

  // Mode 'change' (2026-08-10) : n'écrire QUE si la ligne dit autre chose que
  // la précédente. Un contrôle qui repasse toutes les nuits sur un contenu
  // bloqué répétait la même phrase indéfiniment — 17 lignes identiques
  // observées sur QA, une par nuit, sans plafond.
  //
  // Optionnel et JAMAIS le défaut : le journal reste à la main de
  // l'administrateur, qui peut vouloir la trace de chaque passage même
  // répétitif (« telle nuit, on a bien regardé »). `add` reste le comportement
  // d'origine, rien ne change pour les workflows existants.
  //
  // On compare à la ligne la PLUS RÉCENTE, dont la position dépend de whOrder.
  if (mode === 'change' && currentVal) {
    const lignes = currentVal.split('\n');
    const derniere = order === 'newest' ? lignes[0] : lignes[lignes.length - 1];
    const signature = partsSignifiantes.join(' | ');
    if (signature && derniere && derniere.includes(signature)) {
      BuilderContext.setVar(ctx, 'history_skipped', 'true');
      return { port: 'out' };   // rien à dire de neuf : aucune écriture Iconik
    }
  }

  let newVal;
  if (mode === 'update' && runId) {
    const lines = currentVal ? currentVal.split('\n') : [];
    const idx = lines.findIndex(l => l.includes('[' + runId.slice(0, 12) + ']') || l.includes(runId.slice(0, 12)));
    if (idx !== -1) {
      lines[idx] = newLine;
      newVal = lines.join('\n');
    } else {
      newVal = order === 'newest'
        ? (newLine + (currentVal ? '\n' + currentVal : ''))
        : (currentVal ? currentVal + '\n' : '') + newLine;
    }
  } else {
    newVal = order === 'newest'
      ? (newLine + (currentVal ? '\n' + currentVal : ''))
      : (currentVal ? currentVal + '\n' : '') + newLine;
  }

  const merged = {};
  Object.entries(existing).forEach(([k, v]) => {
    if (!k.startsWith('__')) merged[k] = v;
  });
  merged[mdField] = { field_values: [{ value: newVal }] };
  await iconikClient.put(endpoint, { metadata_values: merged });

  BuilderContext.storeResult(ctx, '_workflow_history', { line: newLine, field: mdField, mode });
  return { port: 'out' };
}

module.exports = workflowHistory;
