/**
 * node-renderer.js — Rendu d'un nœud du canevas depuis une étape pivot
 *
 * Module DÉDIÉ, séparé de workflow-canvas.js. Leçon de WFD : un fichier qui
 * accumule tout (canvas + config + rendu) devient si lourd que chaque patch
 * risque une régression ailleurs. Ici, une préoccupation = un module. Ce
 * fichier ne sait QUE dessiner un nœud ; il ignore le pan/zoom, les volets, le
 * bandeau. workflow-canvas.js l'appelle, il ne contient pas sa logique.
 *
 * Un nœud dit ce qu'il fait et ce qu'il touche, PAS comment il est implémenté :
 * titre + type + badge + variable de stockage + ports. Le bruit technique
 * (UUID, endpoint, méthode HTTP) vit dans le panneau Config, jamais sur le nœud.
 *
 * Entrée : une étape pivot + le catalogue. Sortie : un élément DOM positionné.
 */

const NodeRenderer = (() => {

  const CAT = (typeof window !== 'undefined') ? window.PivotCatalogIconik : null;

  // Badge par type : glyphe + couleur. COSMÉTIQUE PROVISOIRE — la session
  // « make-up » affinera icônes et teintes. La couleur du badge est le SEUL
  // point de couleur du corps du nœud (discipline anti « sapin de Noël ») ;
  // elle encode le type d'un coup d'œil.
  const BADGE = {
    trigger:       { g: '⏱', c: '#16a085' },
    timer:         { g: '⏱', c: '#16a085' },
    decision:      { g: '◇', c: '#5a6570' },
    loop:          { g: '↻', c: '#3498db' },
    checker:       { g: '✓', c: '#5a6570' },
    verify:        { g: '✓', c: '#5a6570' },
    wait:          { g: '⏸', c: '#5a6570' },
    set_var:       { g: '=', c: '#5a6570' },
    set_variable:  { g: '=', c: '#5a6570' },
    transform:     { g: '⇄', c: '#5a6570' },
    lookup:        { g: '⌕', c: '#5a6570' },
    http_request:  { g: '↗', c: '#8e44ad' },
    fetch:         { g: '↓', c: '#8e44ad' },
    search:        { g: '⌕', c: '#8e44ad' },
    update_meta:   { g: '✎', c: '#8e44ad' },
    create_tree:   { g: '🌲', c: '#8e44ad' },
    http_sequence: { g: '≫', c: '#2980b9' },
    aps_search:    { g: '⌕', c: '#8e44ad' },
    workflow_history: { g: '▤', c: '#5a6570' },
    history:       { g: '▤', c: '#5a6570' },
    aws_s3:        { g: '⇥', c: '#e67e22' },
    deliver:       { g: '⇥', c: '#e67e22' }
  };
  const BADGE_DEFAUT = { g: '·', c: '#5a6570' };

  // Nom de plateforme lisible depuis une façade (iconik.fetch -> Iconik).
  const PLATEFORME = { iconik: 'Iconik', aws_s3: 'AWS S3', vodfactory: 'VOD Factory', aps: 'APS' };

  function _typeLisible(etape) {
    if (etape.facade) {
      const parts = etape.facade.split('.');
      return parts[1].replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
    }
    // Core : nom depuis la famille, capitalisé.
    return (etape.core || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function _plateformeDe(etape) {
    if (!etape.facade) return null;
    return PLATEFORME[etape.facade.split('.')[0]] || null;
  }

  function _badgeDe(etape) {
    const fam = CAT ? CAT.familleWfd(etape) : etape.core;
    return BADGE[fam] || BADGE[etape.core] || BADGE_DEFAUT;
  }

  // Un élément simple avec classe et texte.
  function _el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /**
   * Rend un nœud depuis une étape pivot. Le nœud est positionné en absolu selon
   * `pos` (coordonnées de la surface du canevas). Retourne l'élément.
   *
   * @param {Object} etape  étape pivot
   * @param {{x:number,y:number}} pos
   * @param {Object} [opts] { sourceDistante: '{var}' } — raffinement futur
   */
  function rendre(etape, pos, opts) {
    const o = opts || {};
    const node = _el('div', 'bd-node-canvas');
    node.setAttribute('data-step-id', etape.id || '');
    node.style.setProperty('--nx', (pos && pos.x || 0) + 'px');
    node.style.setProperty('--ny', (pos && pos.y || 0) + 'px');

    // En-tête : badge + titre + type (+ plateforme si façade)
    const head = _el('div', 'nc-head');
    const badge = _el('div', 'nc-badge');
    const b = _badgeDe(etape);
    badge.textContent = b.g;
    badge.style.setProperty('--badge-color', b.c);
    head.appendChild(badge);

    const id = _el('div', 'nc-id');
    id.appendChild(_el('div', 'nc-title', etape.label || etape.id || '—'));
    const type = _el('div', 'nc-type', _typeLisible(etape));
    const plat = _plateformeDe(etape);
    if (plat) type.appendChild(_el('span', 'nc-plat', plat));
    id.appendChild(type);
    head.appendChild(id);

    // Boucle avec un corps déjà posé : indicateur "N steps" visible sans
    // avoir à double-cliquer pour vérifier si le Loop a du contenu.
    if (etape.core === 'loop') {
      const n = (etape.body && etape.body.steps && etape.body.steps.length) || 0;
      if (n > 0) head.appendChild(_el('div', 'nc-loop-badge', n + ' step' + (n > 1 ? 's' : '')));
    }

    node.appendChild(head);

    // Corps : variable de stockage (toujours), source distante (optionnelle).
    const store = _varStockage(etape);
    const src = o.sourceDistante || null;
    if (store || src) {
      const body = _el('div', 'nc-body');
      if (store) {
        const l = _el('div', 'nc-var');
        l.appendChild(_el('span', 'nc-arrow', '→'));
        l.appendChild(document.createTextNode(' ' + store));
        body.appendChild(l);
      }
      if (src) {
        const l = _el('div', 'nc-var nc-src');
        l.appendChild(_el('span', 'nc-arrow', '←'));
        l.appendChild(document.createTextNode(' ' + src));
        body.appendChild(l);
      }
      node.appendChild(body);
    }

    // Ports : entrée à gauche, sorties à droite, libellés + pastilles colorées.
    node.appendChild(_ports(etape));

    return node;
  }

  // La variable de stockage déclarée par l'étape, si elle en produit une.
  function _varStockage(etape) {
    const p = etape.params || {};
    const v = p.resultVar || p.storeAs || p.resultBlock || p.var;
    if (!v) return null;
    return '{' + String(v).replace(/^\{+|\}+$/g, '') + '}';
  }

  function _ports(etape) {
    const wrap = _el('div', 'nc-ports');
    const inRow = _el('div', 'nc-prow');
    const pin = _el('span', 'nc-pin');
    pin.setAttribute('data-port', 'in');
    pin.appendChild(_el('span', 'nc-dot'));
    pin.appendChild(_el('span', 'nc-plbl', 'Entrée'));
    inRow.appendChild(pin);
    wrap.appendChild(inRow);

    const outs = CAT ? CAT.portsWfd(etape) : [];
    outs.forEach(function (port) {
      const row = _el('div', 'nc-prow');
      const pout = _el('span', 'nc-pout');
      pout.setAttribute('data-port', port.id);
      const dot = _el('span', 'nc-dot');
      dot.style.setProperty('--port-color', port.color || '#95a5a6');
      pout.appendChild(dot);
      pout.appendChild(_el('span', 'nc-plbl', port.label || port.id));
      row.appendChild(pout);
      wrap.appendChild(row);
    });
    return wrap;
  }

  return { rendre, render: rendre, _badgeDe, _typeLisible };

})();

if (typeof window !== 'undefined') window.NodeRenderer = NodeRenderer;
if (typeof module !== 'undefined') module.exports = NodeRenderer;
