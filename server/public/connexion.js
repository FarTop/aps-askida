// APS — connexion.js — 2026-08-13
//
// Se connecter, et voir tout de suite ce que ça donne. Le résumé affiché après
// coup n'est pas décoratif : c'est la vérification. « Vous êtes connecté »
// seul ne dit pas si les groupes sont bien ceux qu'on croit.
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function dire(texte, ton) {
    const m = $('cx-message');
    m.textContent = texte || '';
    if (ton) m.setAttribute('data-ton', ton); else m.removeAttribute('data-ton');
  }

  function resumer(moi) {
    const groupes = (moi.groupes || []).map(g => g.nom).join(', ') || 'aucun groupe';
    const orgs    = (moi.organisations || []).map(o => o.name).join(', ') || 'aucune organisation';
    const outils  = (moi.outils || []).length;
    return moi.name + ' — ' + groupes + '. Accès à ' + orgs + ', et à '
         + outils + ' outil' + (outils > 1 ? 's' : '') + '.';
  }

  async function envoyer(e) {
    e.preventDefault();
    const bouton = $('cx-valider');
    bouton.disabled = true;
    dire('Vérification…');
    try {
      const r = await fetch('/api/auth/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: $('cx-email').value.trim(),
          motDePasse: $('cx-mdp').value,
        }),
      });
      const corps = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        dire(corps.error || ('Erreur ' + r.status), 'erreur');
        bouton.disabled = false;
        $('cx-mdp').value = '';
        $('cx-mdp').focus();
        return;
      }
      $('cx-resume').textContent = resumer(corps);
      $('cx-formulaire').hidden = true;
      $('cx-fait').hidden = false;
    } catch (e2) {
      dire('Impossible de joindre APS : ' + e2.message, 'erreur');
      bouton.disabled = false;
    }
  }

  // Déjà connecté ? On ne redemande pas — on montre où l'on en est.
  async function init() {
    $('cx-formulaire').addEventListener('submit', envoyer);
    try {
      const r = await fetch('/api/auth/moi');
      const moi = r.ok ? await r.json() : null;
      if (moi) {
        $('cx-resume').textContent = resumer(moi);
        $('cx-formulaire').hidden = true;
        $('cx-fait').hidden = false;
        return;
      }
    } catch (_) {}
    $('cx-email').focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
