/**
 * org-context-selector.js — Sélecteur de contexte d'organisation (partagé)
 *
 * Composant autonome, inclus par n'importe quelle page (header du Builder
 * aujourd'hui, autres pages demain). Affiche « Organisation : [ ... ▾] » et,
 * au choix, pose le contexte pour que TOUS les builders le consomment.
 *
 * Le choix vit dans un COOKIE `aps-org-id` (pas de localStorage) : le serveur
 * le reçoit automatiquement et le helper org-context le lit. Le cookie ne
 * contient qu'un id de sélection — jamais de donnée métier ; la source de vérité
 * reste la base. Migration future vers une session serveur = un seul point à
 * changer (le helper), le sélecteur ne bouge pas.
 *
 * Usage : placer un conteneur `<div data-role="org-context"></div>` dans le
 * header, puis charger ce script. Il se monte tout seul.
 *
 * Rôle : si le contexte serveur indique `filtre: false` (superadmin/admin), on
 * ajoute une option « Toutes » — ces rôles ne sont jamais forcés de choisir.
 */

(function () {

  const COOKIE = 'aps-org-id';

  function _poserCookie(nom, valeur) {
    // 1 an, sur tout le site. SameSite=Lax : suffisant pour une préférence.
    const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
    document.cookie = nom + '=' + encodeURIComponent(valeur) +
      '; path=/; expires=' + exp + '; SameSite=Lax';
  }
  function _effacerCookie(nom) {
    document.cookie = nom + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  }

  async function _monter(hote) {
    let orgs = [], ctx = null;
    try {
      const [ro, rc] = await Promise.all([
        fetch('/api/organisations'),
        fetch('/api/context')
      ]);
      orgs = ro.ok ? await ro.json() : [];
      ctx = rc.ok ? await rc.json() : null;
    } catch (e) {
      return;   // silencieux : le sélecteur est optionnel, ne casse pas la page
    }
    if (!orgs.length) return;

    const wrap = document.createElement('div');
    wrap.className = ' octx';

    const lbl = document.createElement('span');
    lbl.className = 'octx-label';
    lbl.textContent = 'Organisation';

    const sel = document.createElement('select');
    sel.className = 'octx-select';

    const nonFiltre = ctx && ctx.filtre === false;
    // superadmin/admin : option « Toutes » (jamais forcés de choisir).
    if (nonFiltre) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Toutes';
      sel.appendChild(o);
    }
    orgs.forEach(function (org) {
      const o = document.createElement('option');
      o.value = org.id;
      o.textContent = org.name;
      sel.appendChild(o);
    });

    // Position initiale : l'org courante si le contexte est explicite, sinon
    // « Toutes » pour un rôle non filtré, sinon la première.
    if (ctx && ctx.explicite && ctx.org) sel.value = ctx.org.id;
    else if (nonFiltre) sel.value = '';
    else if (ctx && ctx.org) sel.value = ctx.org.id;

    sel.addEventListener('change', function () {
      if (sel.value) _poserCookie(COOKIE, sel.value);
      else _effacerCookie(COOKIE);   // « Toutes » = pas de contexte imposé
      // Recharger pour que toutes les vues consomment le nouveau contexte.
      window.location.reload();
    });

    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    hote.appendChild(wrap);
  }

  function _init() {
    const hote = document.querySelector('[data-role="org-context"]');
    if (hote) _monter(hote);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
