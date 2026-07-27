/**
 * pivot-catalog-iconik.js — Paquet de plateforme Iconik
 *
 * Ce que pivot-schema.js laissait au catalogue : les ports de chaque Core et le
 * dépliage de chaque façade. Rien n'est inventé ici — chaque entrée décrit ce
 * que wfd-engine-handlers.js exécute déjà, vérifié sur les six flows de
 * production et sur la table WfdHandlers (33 familles + loop hors executor).
 *
 * Le paquet répond à deux questions que le format seul ne peut trancher :
 *   — quels ports une étape expose (donc quelles arêtes sont valides) ;
 *   — vers quel Core une façade se déplie, et par quel `httpMode`.
 *
 * Un port unique implicite se nomme `out`. Les familles qui branchent déclarent
 * leurs ports. `decision` est le seul dont les ports se calculent depuis la
 * configuration : `out-0`..`out-N` selon les conditions, plus `default`.
 */

const PivotCatalogIconik = (() => {

  // ── Les 12 Core : ports fixes, ou règle de calcul ────────────────────────
  // `ports` liste les sorties. `dynamicPorts` signale que la liste se calcule
  // depuis la config — le validateur de contenu l'appellera plutôt que de lire
  // une liste figée.

  const CORES = {
    trigger:       { ports: ['out'] },
    decision:      { ports: ['default'], dynamicPorts: 'conditions' },
    loop:          { ports: ['out'], hasBody: true },
    verify:        { ports: ['ok', 'fail', 'error'] },
    wait:          { ports: ['out', 'timeout', 'error'] },
    set_variable:  { ports: ['out'] },
    transform:     { ports: ['out'] },
    lookup:        { ports: ['found', 'not_found'] },
    http_request:  { ports: ['out', 'error'] },
    http_sequence: { ports: ['out', 'err'] },
    history:       { ports: ['out', 'error'] },
    deliver:       { ports: ['out', 'miss', 'error'] }
  };

  // Sorties d'une décision dans le format : les libellés de ses conditions,
  // plus le défaut. Choix B — le pivot route par libellé, lisible pour un
  // designer ; c'est le convertisseur pivot → WFD qui rétablit la fidélité au
  // moteur en traduisant chaque libellé vers son index (`out-0`..`out-N`) selon
  // l'ordre des conditions. L'index ne paraît jamais dans le format.
  function portsDecision(etape) {
    const conds = ((etape.params || {}).conditions) || [];
    const p = conds.map(function (cond, i) {
      return (cond && cond.label) ? cond.label : ('out-' + i);
    });
    if (p.indexOf('default') === -1) p.push('default');
    return p;
  }

  // Décoration des ports pour la régénération WFD : label et couleur, que le
  // pivot ne stocke pas. Propriétés stables de la famille, relevées sur les
  // flows de production. Le validateur, lui, ne consulte que les id ci-dessus ;
  // seul le convertisseur pivot → WFD lit cette table. Les deux préoccupations
  // restent séparées : « ce port est-il valide ? » d'un côté, « à quoi
  // ressemble-t-il dans WFD ? » de l'autre.
  const DECOR = {
    trigger:       { out: ['Suite', '#27ae60'] },
    loop:          { out: ['Suite', '#27ae60'] },
    verify:        { ok: ['Tout validé', '#27ae60'], fail: ['Échec', '#e74c3c'], error: ['Erreur HTTP', '#e67e22'] },
    wait:          { out: ['Condition remplie', '#27ae60'], timeout: ['Timeout', '#e67e22'], error: ['Erreur', '#e74c3c'] },
    set_variable:  { out: ['Suite', '#27ae60'] },
    transform:     { out: ['Suite', '#27ae60'] },
    lookup:        { found: ['Trouvé', '#27ae60'], not_found: ['Non trouvé', '#e74c3c'] },
    http_request:  { out: ['Succès', '#27ae60'], error: ['Erreur', '#e74c3c'] },
    http_sequence: { out: ['Succès', '#27ae60'], err: ['Échec', '#e74c3c'] },
    history:       { out: ['Écrit', '#1abc9c'], error: ['Erreur', '#e74c3c'] },
    deliver:       { out: ['Succès', '#ff9900'], miss: ['Non trouvé', '#e67e22'], error: ['Erreur', '#e74c3c'] }
  };

  // Décoration des ports de façade, quand elle diffère de son Core.
  const DECOR_FACADE = {
    'iconik.search': { found: ['Résultats trouvés', '#8e44ad'], empty: ['Aucun résultat', '#e67e22'], error: ['Erreur', '#e74c3c'] },
    'aws_s3.deliver': { out: ['Succès', '#ff9900'], miss: ['Non trouvé', '#e67e22'], error: ['Erreur', '#e74c3c'] }
  };

  const COULEUR_DECISION = ['#2ecc71', '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];

  // ── Les façades : Core visé, mode HTTP, ports (hérités ou spécialisés) ────
  // `httpMode` reprend l'axe de handleHttpRequest : simple | action | foreach |
  // verify. `family` est le nom WFD d'origine, pour tracer d'où vient la façade.

  const FACADES = {
    'iconik.trigger': {
      core: 'trigger', family: 'trigger',
      presets: {
        custom_action: { field: 'customActionId' },
        schedule:      { note: 'un cron sans plateforme est un trigger Core pur, sans façade' }
      }
    },

    'iconik.fetch': {
      core: 'http_request', family: 'fetch', httpMode: 'simple',
      ports: ['out', 'error']
    },

    'iconik.search': {
      core: 'http_request', family: 'aps_search', httpMode: 'simple',
      // La famille la plus fréquente (20 usages), sans handler dédié : elle
      // passe par handleHttpRequest, donc c'est bien une façade, pas un Core.
      ports: ['found', 'empty', 'error'],
      modes: ['retrieve', 'presence']
    },

    'iconik.action': {
      core: 'http_request', family: 'action', httpMode: 'action',
      // Le mode action lit sa cible depuis la connexion (_handleHttpAction).
      ports: ['out', 'error'],
      presets: {
        export_location: { note: 'déclenche une export location Iconik' }
      }
    },

    'iconik.set_metadata': {
      core: 'http_request', family: 'update_meta', httpMode: 'simple',
      ports: ['out', 'error'],
      modes: ['fields', 'view']
    },

    'iconik.create_tree': {
      core: 'http_request', family: 'create_tree', httpMode: 'foreach',
      // Appelle le registre et le compteur en interne : c'est ce qui rend les
      // services requis déductibles, donc non stockés dans le pivot.
      ports: ['out', 'error'],
      services: ['aps.registry', 'aps.counter']
    },

    'aws_s3.deliver': {
      core: 'deliver', family: 'aws_s3',
      ports: ['out', 'miss', 'error']
    },

    'vodfactory.partner': {
      core: 'http_sequence', family: 'http_sequence',
      ports: ['out', 'err']
    },

    'aps.registry': {
      core: 'http_request', family: 'id_generator', httpMode: 'simple',
      // Un service s'invoque comme une façade : « façade » veut dire paquet de
      // plateforme, et APS est une plateforme parmi d'autres, pas seulement Iconik.
      ports: ['out', 'error'],
      isService: true
    }
  };

  // ── Interrogation ─────────────────────────────────────────────────────────

  // Les ports d'une étape, résolus. C'est ici que « déduit de la déclaration et
  // de la configuration » devient concret.
  function portsDe(etape) {
    if (!etape || !etape.core) return [];

    if (etape.facade && FACADES[etape.facade] && FACADES[etape.facade].ports) {
      return FACADES[etape.facade].ports.slice();
    }

    const core = CORES[etape.core];
    if (!core) return [];
    if (core.dynamicPorts === 'conditions') return portsDecision(etape);
    return core.ports.slice();
  }

  // Les services qu'une étape entraîne, pour les déduire au niveau du workflow
  // sans jamais les y stocker.
  function servicesDe(etape) {
    const out = [];
    if (etape && etape.facade) {
      const f = FACADES[etape.facade];
      if (f && f.services) f.services.forEach(function (s) { out.push(s); });
      if (f && f.isService) out.push(etape.facade);
    }
    return out;
  }

  function facadeConnue(nom)  { return Object.prototype.hasOwnProperty.call(FACADES, nom); }
  function coreConnu(nom)     { return Object.prototype.hasOwnProperty.call(CORES, nom); }

  // ── Pour le convertisseur pivot → WFD ─────────────────────────────────────

  // La famille WFD que le moteur attend. Une façade porte son nom d'origine
  // (`aws_s3.deliver` → `aws_s3`) ; un Core pur garde son nom, sauf les quelques
  // renommages entre le vocabulaire du catalogue et celui du moteur.
  const FAMILLE_MOTEUR = {
    verify: 'checker', wait: 'wait_for', set_variable: 'set_var',
    history: 'workflow_history', deliver: 'aws_s3'
  };

  function familleWfd(etape) {
    if (etape.facade && FACADES[etape.facade]) return FACADES[etape.facade].family;
    return FAMILLE_MOTEUR[etape.core] || etape.core;
  }

  // Les ports au format WFD : objets { id, label, color }, dans l'ordre. Pour
  // une décision, les libellés du pivot deviennent `out-0`..`out-N` — c'est ici
  // que s'opère la traduction du choix B. Le défaut ferme la liste.
  function portsWfd(etape) {
    if (etape.core === 'decision') {
      const conds = ((etape.params || {}).conditions) || [];
      const outs = conds.map(function (cond, i) {
        return { id: 'out-' + i, label: (cond && cond.label) || ('Branche ' + i),
                 color: COULEUR_DECISION[i % COULEUR_DECISION.length] };
      });
      outs.push({ id: 'default', label: 'Par défaut', color: '#95a5a6' });
      return outs;
    }

    const decor = (etape.facade && DECOR_FACADE[etape.facade]) || DECOR[etape.core] || {};
    return portsDe(etape).map(function (id) {
      const d = decor[id];
      return { id: id, label: d ? d[0] : id, color: d ? d[1] : '#95a5a6' };
    });
  }

  // L'index WFD (`fromPort` numérique) des ports d'où part un libellé de pivot.
  // Pour une décision, un libellé porté par plusieurs conditions renvoie
  // plusieurs index — c'est le fan-out : STATUSES a deux conditions `Reporté`,
  // donc une arête pivot depuis `Reporté` devient deux connexions WFD.
  function indexPort(etape, portPivot) {
    if (etape.core === 'decision') {
      const conds = ((etape.params || {}).conditions) || [];
      const idx = [];
      conds.forEach(function (cond, i) {
        if (cond && cond.label === portPivot) idx.push(i);
      });
      if (portPivot === 'default') idx.push(conds.length);
      return idx;
    }
    const i = portsDe(etape).indexOf(portPivot);
    return i === -1 ? [] : [i];
  }

  return {
    CORES, FACADES,
    portsDe, ports: portsDe,
    servicesDe, services: servicesDe,
    facadeConnue, coreConnu,
    portsDecision,
    familleWfd, portsWfd, indexPort
  };

})();

if (typeof module !== 'undefined') module.exports = PivotCatalogIconik;
if (typeof window !== 'undefined') window.PivotCatalogIconik = PivotCatalogIconik;
