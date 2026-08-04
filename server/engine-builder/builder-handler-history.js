// APS — server/engine-builder/builder-handler-history.js — créé le 2026-08-05
// Port de workflow_history(), server/engine/wfd-engine-handlers.js:3233-3369.
// `essences` vient de la résolution de `params.manifestId` (Manifest.essences
// filtrées sur role && sortie), même dérivation que pivot-to-wfd.js:165-179
// (manifestId -> essences), portée ici plutôt qu'au moment de la conversion.
// Partagé par le core `history` pur et la façade `iconik.history` (même
// fonction). Ports du pivot : out | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const { requireIconik } = require('./builder-iconik-shared.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _essencesFromManifest(manifest) {
  const essences = (manifest && manifest.essences) || [];
  return essences
    .filter(e => e.role && e.sortie)
    .map(e => {
      const eh = { role: e.role, sortie: e.sortie };
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

  const targetId = r(p.targetId || ((p.target || 'asset') === 'collection' ? '{collection.id}' : '{asset_id}'), ctx)
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
    const gabarit = essencesPortee
      .map(e => '{' + e.sortie + '?' + _libelle(e.role) + ' ✅|' + _libelle(e.role) + ' ❌}')
      .join(' ');
    essenceChecklist = r(gabarit, ctx);
  }

  if (!targetId || !mdField) throw new Error('Workflow History : targetId et mdField requis');

  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10) + '_' + now.toTimeString().slice(0, 5);
  const runId   = ctx.runId || '';
  const wfName  = p.whWfName || '';
  const user    = ctx.trigger?.user || ctx.vars?.['trigger.user'] || '';

  const parts = [];
  if (p.whShowDate !== false && dateStr) parts.push(dateStr);
  if (p.whShowWf   !== false && wfName)  parts.push(wfName);
  if (p.whShowUser !== false && user)    parts.push(user);
  if (statut)  parts.push(statut);
  if (message) parts.push(message);
  if (essenceChecklist) parts.push(essenceChecklist);

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
        if (issues.length) parts.push(issues.join(', '));
      }
    } catch (_) {}
  }
  if (p.whShowRunId === true && runId) parts.push(runId.slice(0, 12));

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
    existing = current?.metadata_values || {};
  } catch (e) { /* vue non initialisée — traiter comme vide */ }

  const currentVal = (existing[mdField]?.field_values?.[0]?.value || '').trim();

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
