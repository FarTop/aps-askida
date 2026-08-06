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
 * dernière fois") — filtré par ÂGE plutôt que sauté en bloc (cf.
 * `SEUIL_RECENT_MS` plus bas) : un run VRAIMENT ancien (sélectionné dans
 * Jobs depuis longtemps déjà fini) ne rejoue pas son historique, mais un
 * run qui vient tout juste de se produire — typiquement un vrai webhook
 * Iconik plus rapide que notre fenêtre de détection (sondage Jobs 4s +
 * wf-run-poll 1.5s, cf. jobs-logs-panel.js) — n'est plus invisible pour
 * autant : trouvé le 6 août sur un vrai run PUBLISH v2 déclenché par
 * Custom Action, terminé en 5,3s, donc entièrement capté dans ce "premier
 * tick" et donc entièrement (et à tort) muet côté badges avant ce correctif,
 * alors que la surbrillance des arêtes (alimentée séparément par
 * WfRunStatus.calculer() sur CHAQUE tick, jamais concernée par ce filtre)
 * s'affichait correctement. WFD n'a jamais ce problème : ses badges
 * n'existent QUE pour un job réellement en vol au moment où on regarde,
 * jamais rejoué après coup. EXCEPTION toujours valable : un run que CE
 * navigateur vient de déclencher lui-même (▶ Run) est marqué
 * `liveDepuisDebut` par wf-run-poll.js — même son tout premier fetch est
 * authentiquement du direct, aucun filtre d'âge à lui appliquer.
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

  // Fenêtre de détection connue : sondage Jobs 4s (jobs-logs-panel.js,
  // pire cas si le tick tombe juste après le début d'une accalmie) +
  // cadence wf-run-poll 1.5s + un chargement de page à froid (plusieurs
  // fetch séquentiels avant que Jobs ne parte : context, builder-flow,
  // versions, environments, runs — mesuré ~10-12s en conditions réelles
  // le 6 août, cas typique quand on ouvre le canevas APRÈS avoir cliqué la
  // Custom Action dans Iconik, pas avant) — un événement plus récent que
  // ça, même reçu dans le "premier tick" d'un run rejoint après coup, vient
  // très probablement de se produire pendant qu'on n'avait pas encore
  // commencé à regarder, pas d'un historique manqué depuis longtemps.
  const SEUIL_RECENT_MS = 20000;

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
  //
  // Un nœud hors de la portée actuellement rendue (ex. on vient d'entrer
  // dans le corps d'une Loop dont le badge est sur le nœud Loop lui-même,
  // au niveau racine) ne doit PAS effacer le badge — juste le laisser
  // détaché en mémoire (`badges[stepId]` conservé) pour qu'il réapparaisse
  // tel quel au retour à cette portée. Le supprimer ici (comportement
  // d'avant ce correctif) cassait la traçabilité : le VRAI step:done de ce
  // nœud, arrivant plus tard, ne trouvait alors plus de badge existant et
  // retombait sur le repli `_afficher()` de `_deplacer()` — un badge
  // "success" flambant neuf, réapparaissant à un moment sans rapport avec
  // le déroulé réel (retour utilisateur 2026-08-06 : "je vois un badge
  // réapparaître sur la Loop" après la fin du run dans les Logs).
  function reappliquer(nodesHost) {
    Object.keys(badges).forEach(function (stepId) {
      const badge = badges[stepId];
      const nodeEl = _noeud(nodesHost, stepId);
      if (!nodeEl) return; // hors de la portée actuellement rendue — badge conservé, pas effacé
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
      // Historique du premier VRAI tick — filtré par âge, pas sauté en
      // bloc (cf. en-tête et SEUIL_RECENT_MS) : seuls les événements assez
      // récents pour être quasi certainement survenus pendant qu'on
      // n'avait pas encore commencé à sonder sont animés.
      const maintenant = Date.now();
      (d.newEvents || []).forEach(function (ev) {
        if (maintenant - new Date(ev.at).getTime() <= SEUIL_RECENT_MS) _traiterEvenement(ev);
      });
      return;
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
