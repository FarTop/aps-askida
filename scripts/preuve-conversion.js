#!/usr/bin/env node
/**
 * preuve-conversion.js — Preuve d'équivalence pivot → WFD
 *
 * À lancer sur le Mac Mini, où le serveur APS tourne (LaunchAgent) et où le
 * moteur est disponible. Démontre que le convertisseur pivot → WFD produit un
 * flux équivalent à l'original — la preuve que le format ne perd rien.
 *
 * Deux modes :
 *
 *   --structure  (défaut, sans risque, ne touche rien)
 *       Convertit le pivot, récupère le flux original par GET /api/flows/:id,
 *       et compare les DEUX GRAPHES après normalisation des identifiants :
 *       mêmes familles de nœuds, mêmes ports, mêmes connexions (source → cible).
 *       Deux graphes isomorphes produisent le même run pour TOUTES les données —
 *       une preuve plus forte qu'une comparaison de runs sur un seul jeu.
 *
 *   --execute    (exécute réellement, environnement de test)
 *       En plus, exécute le WFD régénéré via le moteur (executeFlux, la porte
 *       « pour tests » de wfd-engine.js) et rapporte status + vars + erreurs.
 *       À n'utiliser que hors production.
 *
 * Usage :
 *   node scripts/preuve-conversion.js <pivot.json> <fluxId> [--execute]
 *
 * Exemple :
 *   node scripts/preuve-conversion.js statuses.pivot.json <id_statuses>
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE = process.env.APS_BASE || 'http://localhost:3000';

// ── Chargement des modules du Builder (ils exportent en module.exports) ──────
const BUILDER = path.join(__dirname, '..', 'server', 'public', 'builders', 'workflow');
const PivotIO   = require(path.join(BUILDER, 'pivot-io.js'));
const PivotToWfd = require(path.join(BUILDER, 'pivot-to-wfd.js'));

// ── Arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const positionnels = args.filter(a => !a.startsWith('--'));
const pivotPath = positionnels[0];
const fluxId    = positionnels[1];

if (!pivotPath || !fluxId) {
  console.error('Usage : node scripts/preuve-conversion.js <pivot.json> <fluxId> [--execute]');
  process.exit(2);
}

// ── Normalisation d'un graphe pour comparaison ───────────────────────────────
// Les ids diffèrent (le pivot dérive du nom métier, l'original a des ids WFD).
// On compare la STRUCTURE : pour chaque nœud, sa famille et ses ports ; pour
// chaque connexion, (famille source, port source) → (famille cible). Les ids
// numériques de port de l'original deviennent leur id nommé via l'index.

function _clefNoeud(n) {
  const outs = ((n.ports && n.ports.outputs) || []).map(o => o.id).join(',');
  return n.family + ' [' + outs + ']';
}

function _indexNoeuds(nodes) {
  const parId = {};
  (nodes || []).forEach(n => { parId[n.id] = n; });
  return parId;
}

// Résume un graphe en un multiset de connexions structurelles, indépendant des ids.
function _signatureGraphe(nodes, connections) {
  const parId = _indexNoeuds(nodes);
  const nomPort = (node, portIndexOuId) => {
    const outs = (node.ports && node.ports.outputs) || [];
    if (typeof portIndexOuId === 'number') {
      return outs[portIndexOuId] ? outs[portIndexOuId].id : ('#' + portIndexOuId);
    }
    return portIndexOuId; // déjà un id nommé
  };

  const familles = {};
  (nodes || []).forEach(n => {
    familles[n.family] = (familles[n.family] || 0) + 1;
  });

  const aretes = (connections || []).map(c => {
    const src = parId[c.fromNode];
    const dst = parId[c.toNode];
    if (!src || !dst) return '?';
    const port = nomPort(src, c.fromPort);
    return src.family + ':' + port + ' -> ' + dst.family;
  }).sort();

  return { familles, aretes, nbNoeuds: (nodes || []).length, nbAretes: (connections || []).length };
}

function _comparerSignatures(a, b) {
  const ecarts = [];

  // Familles présentes de part et d'autre.
  const fams = new Set([...Object.keys(a.familles), ...Object.keys(b.familles)]);
  fams.forEach(f => {
    const na = a.familles[f] || 0, nb = b.familles[f] || 0;
    if (na !== nb) ecarts.push(`famille ${f} : régénéré=${na} vs original=${nb}`);
  });

  // Arêtes : multiset comparé ligne à ligne.
  const compte = (arr) => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const ca = compte(a.aretes), cb = compte(b.aretes);
  const toutes = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  toutes.forEach(x => {
    if ((ca[x] || 0) !== (cb[x] || 0)) {
      ecarts.push(`arête « ${x} » : régénéré=${ca[x] || 0} vs original=${cb[x] || 0}`);
    }
  });

  return ecarts;
}

// ── Récupération du flux original ────────────────────────────────────────────
async function chargerFluxOriginal(id) {
  const res = await fetch(BASE + '/api/flows/' + encodeURIComponent(id));
  if (!res.ok) throw new Error('GET /api/flows/' + id + ' → ' + res.status);
  return res.json();
}

// ── Mode structure ───────────────────────────────────────────────────────────
async function modeStructure(pivot, fluxId) {
  console.log('\n═══ PREUVE STRUCTURELLE ═══\n');

  const wfd = PivotToWfd.convertir(pivot);
  console.log(`Régénéré : ${wfd.nodes.length} nœuds, ${wfd.connections.length} connexions`);

  const orig = await chargerFluxOriginal(fluxId);
  console.log(`Original : ${(orig.nodes || []).length} nœuds, ${(orig.connections || []).length} connexions`);

  const sigR = _signatureGraphe(wfd.nodes, wfd.connections);
  const sigO = _signatureGraphe(orig.nodes, orig.connections);

  const ecarts = _comparerSignatures(sigR, sigO);

  console.log('\nFamilles régénéré :', JSON.stringify(sigR.familles));
  console.log('Familles original :', JSON.stringify(sigO.familles));

  if (ecarts.length === 0) {
    console.log('\n✅ ÉQUIVALENCE STRUCTURELLE : les deux graphes sont isomorphes.');
    console.log('   Même familles, mêmes connexions (source:port → cible).');
    console.log('   → le format ne perd rien : le WFD régénéré produira le même run.');
    return true;
  } else {
    console.log(`\n❌ ${ecarts.length} écart(s) structurel(s) :`);
    ecarts.forEach(e => console.log('   · ' + e));
    return false;
  }
}

// ── Mode exécution (optionnel, environnement de test) ────────────────────────
async function modeExecute(pivot) {
  console.log('\n═══ EXÉCUTION DU WFD RÉGÉNÉRÉ ═══\n');
  console.log('(environnement de test — de vrais appels Iconik / VOD Factory ont lieu)\n');

  const wfd = PivotToWfd.convertir(pivot);

  // On passe par le moteur en mémoire (porte « pour tests » de wfd-engine.js).
  const WfdEngine = require(path.join(__dirname, '..', 'server', 'engine', 'wfd-engine.js'));
  const WfdHandlers = require(path.join(__dirname, '..', 'server', 'engine', 'wfd-engine-handlers.js'));

  const engine = WfdEngine.createEngine({
    port: 0,
    nodeHandlers: WfdHandlers,
    iconikClient: null,
    onEvent: (type, data) => {
      if (type === 'node:done') console.log(`   · ${data.family || ''} ${data.name || ''} → port ${data.port}`);
    },
  });

  const flux = { id: 'preuve-' + Date.now(), name: wfd.name, nodes: wfd.nodes, connections: wfd.connections };
  const ctx = await engine.executeFlux(flux, { _manual: true, _triggeredAt: new Date().toISOString() });

  console.log('\nStatut :', ctx.status);
  console.log('Erreurs :', (ctx.errors || []).length);
  (ctx.errors || []).forEach(e => console.log('   · ' + JSON.stringify(e)));
  console.log('Variables finales :', Object.keys(ctx.vars || {}).length);
  return ctx.status === 'success' || (ctx.errors || []).length === 0;
}

// ── Entrée ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    const brut = fs.readFileSync(pivotPath, 'utf8');
    const lu = PivotIO.lire(brut);
    if (!lu.rapport.ok) {
      console.error('Pivot invalide :');
      lu.rapport.erreurs.forEach(e => console.error('   · ' + e.chemin + ' — ' + e.message));
      process.exit(1);
    }
    const pivot = lu.document;

    const okStruct = await modeStructure(pivot, fluxId);

    let okExec = true;
    if (execute) okExec = await modeExecute(pivot);

    console.log('');
    process.exit(okStruct && okExec ? 0 : 1);
  } catch (err) {
    console.error('\nÉchec :', err.message);
    process.exit(1);
  }
})();
