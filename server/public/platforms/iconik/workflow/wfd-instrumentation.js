// ══ INSTRUMENTATION WFD ═══════════════════════════════════════════════════════
// Points de log injectés dans les fonctions clés du designer

window.addEventListener('load', function() {

// ── Wrapper renderCanvas ──────────────────────────────────────────────────────
if (typeof renderCanvas === 'undefined') return;
  const _origRenderCanvas = renderCanvas;
renderCanvas = function() {
  const flux = getFluxCourant();
  // Extraire le nom de la fonction appelante depuis la call stack
  let caller = '?';
  try {
    const stack = new Error().stack.split('\n');
    // stack[0]=Error, stack[1]=renderCanvas wrapper, stack[2]=appelant
    const line = stack[2] || stack[1] || '';
    const m = line.match(/at (\S+)/);
    caller = m ? m[1].split('.').pop() : line.trim().slice(0,40);
  } catch(e) {}
  WFDLog.render('CANVAS', 'renderCanvas() ← ' + caller, {
    fluxId   : flux?.id || null,
    fluxName : flux?.name || null,
    nodes    : flux?.nodes?.length || 0,
    selected : selectedNodeId || null,
  });
  return _origRenderCanvas.apply(this, arguments);
};

// ── Wrapper sauvegarderEtat ───────────────────────────────────────────────────
if (typeof sauvegarderEtat === 'undefined') return;
  const _origSauvegarderEtat = sauvegarderEtat;
sauvegarderEtat = function() {
  const flux = getFluxCourant();
  WFDLog.save('STATE', 'sauvegarderEtat()', {
    fluxId   : flux?.id || null,
    fluxName : flux?.name || null,
    nodes    : flux?.nodes?.map(n => ({ id:n.id, name:n.name, family:n.family })) || [],
  });
  return _origSauvegarderEtat.apply(this, arguments);
};

// ── Wrapper sauvegarderConfig ─────────────────────────────────────────────────
if (typeof sauvegarderConfig === 'undefined') return;
  const _origSauvegarderConfig = sauvegarderConfig;
sauvegarderConfig = function() {
  const flux = getFluxCourant();
  const node = flux?.nodes?.find(n => n.id === selectedNodeId);
  WFDLog.save('CONFIG', 'sauvegarderConfig() — début', {
    nodeId  : selectedNodeId,
    family  : node?.family,
    nameBefore: node?.name,
    cfgBefore : node ? JSON.parse(JSON.stringify(node.config||{})) : null,
  });
  const result = _origSauvegarderConfig.apply(this, arguments);
  // Log après
  const node2 = flux?.nodes?.find(n => n.id === selectedNodeId);
  WFDLog.save('CONFIG', 'sauvegarderConfig() — fin', {
    nodeId   : selectedNodeId,
    nameAfter: node2?.name,
    cfgAfter : node2 ? JSON.parse(JSON.stringify(node2.config||{})) : null,
  });
  return result;
};

// ── Wrapper ouvrirConfigPanel ─────────────────────────────────────────────────
if (typeof ouvrirConfigPanel === 'undefined') return;
  const _origOuvrirConfigPanel = ouvrirConfigPanel;
ouvrirConfigPanel = function(node) {
  WFDLog.event('PANEL', 'ouvrirConfigPanel() — ' + (node?.name||'?'), {
    nodeId  : node?.id,
    family  : node?.family,
    config  : node ? JSON.parse(JSON.stringify(node.config||{})) : null,
  });
  return _origOuvrirConfigPanel.apply(this, arguments);
};

// ── Wrapper creerNoeudInstant ─────────────────────────────────────────────────
if (typeof creerNoeudInstant === 'undefined') return;
  const _origCreerNoeudInstant = creerNoeudInstant;
creerNoeudInstant = function(family, name, x, y) {
  WFDLog.event('NODE', 'creerNoeudInstant() — ' + family + ' "' + name + '"', { family, name, x, y });
  return _origCreerNoeudInstant.apply(this, arguments);
};

// ── Redéfinition supprimerNoeudSelectionne (avec resync DOM) ─────────────────
supprimerNoeudSelectionne = function() {
  const flux = getFluxCourant();
  if (!flux) return;

  // Source de vérité : DOM
  const domSel = Array.from(document.querySelectorAll('.wfd-node.selected'))
    .map(el => el.id.replace('wfd-node-', '')).filter(Boolean);
  if (domSel.length > 0) selectedNodeIds = new Set(domSel);

  const toDelete = selectedNodeIds.size > 0
    ? new Set(selectedNodeIds)
    : (selectedNodeId ? new Set([selectedNodeId]) : new Set());

  if (toDelete.size === 0) return;

  const names = flux.nodes.filter(n => toDelete.has(n.id)).map(n => n.name);
  WFDLog.warn('NODE', 'supprimerNoeudSelectionne() — ' + (names.join(', ') || '?'), {
    nodeIds: [...toDelete], names,
  });

  flux.nodes       = flux.nodes.filter(n => !toDelete.has(n.id));
  flux.connections = flux.connections.filter(c => !toDelete.has(c.fromNode) && !toDelete.has(c.toNode));
  if (typeof fermerConfigPanel === 'function') fermerConfigPanel();
  sauvegarderEtat('Suppr nœud(s)');
  renderCanvas();
  selectedNodeId = null;
  selectedNodeIds.clear();
  if (typeof toast === 'function') toast(toDelete.size > 1 ? toDelete.size + ' nœuds supprimés' : 'Nœud supprimé');
};

// ── Wrapper chargerEtat ───────────────────────────────────────────────────────
if (typeof chargerEtat === 'undefined') return;
  const _origChargerEtat = chargerEtat;
chargerEtat = function() {
  WFDLog.info('STATE', 'chargerEtat() — chargement depuis localStorage');
  const result = _origChargerEtat.apply(this, arguments);
  WFDLog.info('STATE', 'chargerEtat() — OK', {
    flows : wfdFlows?.length || 0,
    pals  : wfdPalNodes?.length || 0,
  });
  return result;
};

}); // end load

// ── Capturer les erreurs JS non gérées ───────────────────────────────────────
window.addEventListener('error', e => {
  WFDLog.error('JS', e.message, {
    file  : e.filename,
    line  : e.lineno,
    col   : e.colno,
    stack : e.error?.stack?.slice(0, 300) || null,
  });
});

window.addEventListener('unhandledrejection', e => {
  WFDLog.error('PROMISE', String(e.reason), {
    stack: e.reason?.stack?.slice(0, 300) || null,
  });
});

// ── Log de démarrage ──────────────────────────────────────────────────────────
WFDLog.info('BOOT', 'Instrumentation WFD active', {
  version: '1.0',
  ts: new Date().toISOString(),
});
