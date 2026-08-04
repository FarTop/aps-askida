// APS — server/engine-builder/builder-handler-registry.js — créé le 2026-08-05
// ================================================================
// builder-handler-registry.js — table de dispatch des handlers du moteur
// natif du Builder.
//
// Clé = step.facade || step.core (voir le plan abstract-honking-map.md, §4).
// Une façade qui ne spécialise pas son core (ex. iconik.history, aws_s3.deliver,
// vodfactory.partner) s'enregistre sous les deux clés, pointant vers LA MÊME
// fonction — jamais de duplication.
// ================================================================

'use strict';

// Cores déclarés dans le catalogue pivot mais explicitement hors périmètre
// v1 (pivot-schema.js CORES_DECLARES minus CORES actifs) : une étape de ce
// type doit produire une erreur claire, jamais un no-op silencieux.
const CORES_NON_IMPLEMENTES = ['qc', 'script', 'delay', 'approval', 'call_workflow'];

const _handlers = new Map();

function register(key, fn) {
  if (!key) throw new Error('builder-handler-registry: clé vide');
  _handlers.set(key, fn);
}

function get(step) {
  const key = (step && (step.facade || step.core)) || null;
  return key ? (_handlers.get(key) || null) : null;
}

function isDeclaredInactive(core) {
  return CORES_NON_IMPLEMENTES.includes(core);
}

module.exports = { register, get, isDeclaredInactive, CORES_NON_IMPLEMENTES };
