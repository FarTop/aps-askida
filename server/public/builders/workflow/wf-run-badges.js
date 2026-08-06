/**
 * wf-run-badges.js — Badges de job animés sur le canevas.
 *
 * Port fidèle de WFD (server/public/platforms/iconik/workflow/script-
 * workflow-designer.js, section "WFD JOBS — Badges animés" + son CSS
 * `.wfd-job-badge`) : un vrai élément DOM flottant par nœud (pas un
 * pseudo-élément CSS — première tentative rejetée, cf. mémoire
 * feedback-dont-improvise-named-reference), même cycle de vie
 * (apparition → déplacement/recoloration → disparition), mêmes classes/
 * durées d'animation (entering .2s / transit .35s / exiting .2s / fade
 * auto-retiré après 1.5s si l'état n'est pas "à garder"), même logique
 * couleur par statut, même contenu (un chiffre — nombre de passages sur
 * CE nœud pour le run suivi, l'équivalent de _wfdGetNodeCount côté WFD).
 *
 * Adapté à ce moteur (sondage 1.5s via wf-run-poll.js, pas de push SSE
 * comme le "live engine event" de WFD) : consomme `newEvents` de chaque
 * tick comme s'il s'agissait d'événements live — un step:start/step:done/
 * step:error = une transition de badge, exactement comme
 * _wfdHandleEngineEvent(). Le TOUT PREMIER tick reçu pour un run REJOINT
 * après coup (sélectionné dans Jobs, ou auto-suivi) contient son
 * historique COMPLET (pas seulement les événements "nouveaux depuis la
 * dernière fois") — délibérément ignoré pour l'animation (silencieux,
 * juste comptabilisé) : sans ça, rejoindre un run déjà bien avancé ferait
 * défiler tout son historique d'un coup. WFD n'a jamais ce problème : ses
 * badges n'existent QUE pour un job réellement en vol au moment où on
 * regarde, jamais rejoué après coup. EXCEPTION : un run que CE navigateur
 * vient de déclencher lui-même (▶ Run) est marqué `liveDepuisDebut` par
 * wf-run-poll.js — même son tout premier fetch est authentiquement du
 * direct (personne ne l'a manqué en cours de route), donc jamais sauté,
 * même s'il contient déjà plusieurs événements (le serveur a pu avancer
 * vite entre la réponse HTTP du trigger et ce premier sondage — un
 * échec rapide sans connexion Iconik réelle, par exemple).
 */
(function () {
  'use strict';

  const root = document.querySelector('.bd-canvas-root');
  if (!root) return;

  const badges = {};    // stepId -> élément DOM du badge actif
  const passages = {};  // stepId -> nombre de passages vus sur ce run (contenu du badge)
  const enErreur = {};  // stepId -> un step:error est arrivé depuis le dernier step:start (hasWarn WFD)
  let runIdActuel = null;
  let premierTickDuRun = true;

  function _hote() {
    return document.querySelector('.cnv-nodes');
  }

  function _noeud(host, stepId) {
    return host ? host.querySelector('.bd-node-canvas[data-step-id="' + CSS.escape(stepId) + '"]') : null;
  }

  // --nx/--ny (node-renderer.js) sont la position "logique" du nœud, dans
  // le même conteneur non transformé (.cnv-nodes) que le badge — hérite
  // donc automatiquement du pan/zoom de .cnv-surface sans recalcul manuel,
  // contrairement à WFD (offsetLeft/offsetTop, positions en left/top direct
  // côté nœud, pas de transform CSS à ce niveau-là).
  function _positionner(badge, nodeEl) {
    const nx = parseFloat(nodeEl.style.getPropertyValue('--nx')) || 0;
    const ny = parseFloat(nodeEl.style.getPropertyValue('--ny')) || 0;
    const largeur = nodeEl.offsetWidth || 230;
    badge.style.left = (nx + largeur / 2 - 12) + 'px';
    badge.style.top  = (ny - 20) + 'px';
  }

  function _supprimerEl(stepId) {
    const badge = badges[stepId];
    if (!badge) return;
    badge.classList.add('exiting');
    setTimeout(function () { if (badge.parentNode) badge.parentNode.removeChild(badge); }, 200);
    delete badges[stepId];
  }

  function _supprimer(stepId, delai) {
    setTimeout(function () { _supprimerEl(stepId); }, delai || 0);
  }

  function _afficher(stepId, etat) {
    const host = _hote();
    const nodeEl = _noeud(host, stepId);
    if (!nodeEl) return; // hors de la portée actuellement rendue (ex. corps de boucle fermé)
    _supprimerEl(stepId); // toujours repartir d'un badge frais, même principe que WFD _wfdShowBadge
    const badge = document.createElement('div');
    badge.className = 'bd-job-badge ' + etat + ' entering';
    _positionner(badge, nodeEl);
    badge.textContent = String(passages[stepId] || 1);
    host.appendChild(badge);
    badges[stepId] = badge;
    setTimeout(function () { badge.classList.remove('entering'); }, 200);
  }

  function _deplacer(stepId, etat, rester) {
    const badge = badges[stepId];
    if (!badge) { _afficher(stepId, etat); return; }
    const nodeEl = _noeud(_hote(), stepId);
    if (nodeEl) _positionner(badge, nodeEl);
    badge.className = 'bd-job-badge ' + etat + ' transit';
    badge.textContent = String(passages[stepId] || 1);
    setTimeout(function () { if (badge.parentNode) badge.classList.remove('transit'); }, 350);
    if (!rester) _supprimer(stepId, 1500);
  }

  function _traiterEvenement(ev) {
    if (!ev.stepId) return; // 'start'/'end' du run lui-même, hors-sujet ici
    const stepId = ev.stepId;
    if (ev.type === 'step:start') {
      passages[stepId] = (passages[stepId] || 0) + 1;
      enErreur[stepId] = false;
      _afficher(stepId, 'running');
    } else if (ev.type === 'step:error') {
      enErreur[stepId] = true;
      _deplacer(stepId, ev.severity === 'fatal' ? 'error' : 'warn', true);
    } else if (ev.type === 'step:done') {
      // step:error a déjà fixé l'état final affiché (reste, "rester:true")
      // — même garde que WFD (prevStatus !== 'error' avant de bouger).
      if (enErreur[stepId]) return;
      const succes = ev.port !== null;
      _deplacer(stepId, succes ? 'success' : 'error', !succes);
    }
  }

  function _toutEffacer() {
    Object.keys(badges).forEach(function (id) {
      const b = badges[id];
      if (b && b.parentNode) b.parentNode.removeChild(b);
    });
    Object.keys(badges).forEach(function (id) { delete badges[id]; });
    Object.keys(passages).forEach(function (id) { delete passages[id]; });
    Object.keys(enErreur).forEach(function (id) { delete enErreur[id]; });
  }

  // Survit à un rendu structurel du canevas (edit/undo/navigation de
  // portée démonte tous les .bd-node-canvas ET nos badges, frères dans le
  // même conteneur .cnv-nodes) — repositionne simplement ce qui est encore
  // actif, jamais de nouvelle animation d'entrée (ce n'est pas une
  // transition de statut, juste un rendu qui a bougé le décor). Même
  // principe que WfRunOverlay.reappliquer(), câblé au même endroit
  // (workflow-canvas.js, rendreDepuisModele()).
  function reappliquer(nodesHost) {
    Object.keys(badges).forEach(function (stepId) {
      const nodeEl = _noeud(nodesHost, stepId);
      const badge = badges[stepId];
      if (!nodeEl || !badge) { _supprimerEl(stepId); return; }
      nodesHost.appendChild(badge);
      badge.classList.remove('entering', 'exiting', 'transit');
      _positionner(badge, nodeEl);
    });
  }

  root.addEventListener('aps:run-tick', function (e) {
    const d = e.detail;
    if (d.runId !== runIdActuel) {
      runIdActuel = d.runId;
      premierTickDuRun = true;
      _toutEffacer();
    }
    // wf-run-poll.js émet un tick SYNCHRONE vide (`run: null`) dès l'appel
    // à suivre(), avant même le premier fetch réel — ne pas le compter
    // comme "le premier tick" (il ne porte aucune vraie donnée), sinon le
    // VRAI premier tick (qui porte l'historique complet) arrive avec le
    // drapeau déjà consommé et se retrouve animé par erreur.
    if (!d.run) return;
    // `liveDepuisDebut` (posé par jobs-logs-panel.js UNIQUEMENT pour un run
    // que CE navigateur vient de déclencher lui-même) : même le tout
    // premier fetch est authentiquement du direct — le serveur a juste eu
    // le temps d'avancer de quelques étapes entre la réponse du trigger et
    // ce premier sondage (déclenchement + échec rapide sans Iconik réel,
    // par exemple), mais personne n'a "raté" ces événements en cours de
    // route. Ne sauter le premier tick QUE pour un run rejoint après coup
    // (sélectionné dans Jobs, ou auto-suivi) — voir en-tête du fichier.
    if (premierTickDuRun && !d.liveDepuisDebut) {
      premierTickDuRun = false;
      return; // historique complet du premier VRAI tick — jamais animé (cf. en-tête)
    }
    premierTickDuRun = false;
    (d.newEvents || []).forEach(_traiterEvenement);
  });

  root.addEventListener('aps:flow-ready', function () {
    runIdActuel = null;
    premierTickDuRun = true;
    _toutEffacer();
  });

  window.WfRunBadges = { reappliquer: reappliquer };

})();
