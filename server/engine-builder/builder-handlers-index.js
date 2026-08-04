// APS — server/engine-builder/builder-handlers-index.js — créé le 2026-08-05
// ================================================================
// builder-handlers-index.js — enregistre tous les handlers de cores/facades
// dans builder-handler-registry.js. Un seul point de câblage, complété au fil
// des tâches du plan abstract-honking-map.md (§4, §8).
// ================================================================

'use strict';

const Registry = require('./builder-handler-registry.js');

Registry.register('set_variable', require('./builder-handler-set-variable.js'));
Registry.register('decision', require('./builder-handler-decision.js'));
Registry.register('iconik.search', require('./builder-handler-iconik-search.js'));
Registry.register('iconik.fetch', require('./builder-handler-iconik-fetch.js'));
Registry.register('lookup', require('./builder-handler-lookup.js'));
Registry.register('verify', require('./builder-handler-verify.js'));

// http_sequence : core pur ET façade vodfactory.partner partagent la même
// fonction (aucune spécialisation) — cf. plan §4.
const httpSequence = require('./builder-handler-http-sequence.js');
Registry.register('http_sequence', httpSequence);
Registry.register('vodfactory.partner', httpSequence);

// history : core pur ET façade iconik.history partagent la même fonction.
const history = require('./builder-handler-history.js');
Registry.register('history', history);
Registry.register('iconik.history', history);

// deliver : core pur ET façade aws_s3.deliver partagent la même fonction.
const deliver = require('./builder-handler-deliver.js');
Registry.register('deliver', deliver);
Registry.register('aws_s3.deliver', deliver);

Registry.register('http_request', require('./builder-handler-http-request.js'));
Registry.register('aps.registry', require('./builder-handler-aps-registry.js'));
Registry.register('iconik.create_tree', require('./builder-handler-iconik-create-tree.js'));
Registry.register('iconik.action', require('./builder-handler-iconik-action.js'));
Registry.register('iconik.set_metadata', require('./builder-handler-iconik-set-metadata.js'));
Registry.register('iconik.resolve_ancestors', require('./builder-handler-iconik-resolve-ancestors.js'));
Registry.register('wait', require('./builder-handler-wait.js'));
Registry.register('transform', require('./builder-handler-transform.js'));

module.exports = Registry;
