// APS — activation.js — 2026-08-13
//
// La page que reçoit une personne invitée. Trois états, un seul visible à la
// fois : le lien est bon (formulaire), il ne l'est plus (refus), c'est fait.
//
// ELLE NE DIT JAMAIS POURQUOI un lien est refusé au-delà de ce qui aide à
// agir. « Invalide ou expiré » couvre les deux, et c'est volontaire : distinguer
// « ce jeton n'existe pas » de « ce jeton a expiré » renseignerait quelqu'un qui
// en essaie au hasard.
(function () {
  'use strict';

  const jeton = new URLSearchParams(window.location.search).get('jeton') || '';

  function $(id) { return document.getElementById(id); }

  function montrer(quoi) {
    $('ac-chargement').hidden = quoi !== 'chargement';
    $('ac-refus').hidden      = quoi !== 'refus';
    $('ac-formulaire').hidden = quoi !== 'formulaire';
    $('ac-fini').hidden       = quoi !== 'fini';
  }

  function dire(texte, ton) {
    const m = $('ac-message');
    m.textContent = texte || '';
    if (ton) m.setAttribute('data-ton', ton); else m.removeAttribute('data-ton');
  }

  async function verifier() {
    if (!jeton) { montrer('refus'); return; }
    try {
      const r = await fetch('/api/utilisateurs/activation/' + encodeURIComponent(jeton));
      if (!r.ok) { montrer('refus'); return; }
      const u = await r.json();
      $('ac-bienvenue').textContent =
        'Bonjour ' + u.name + '. Ce compte est rattaché à ' + u.email + '.';
      montrer('formulaire');
      $('ac-mdp').focus();
    } catch (e) {
      // Un réseau coupé n'est pas un lien mort : on le dit autrement, sinon la
      // personne renonce alors que son lien est bon.
      $('ac-chargement').textContent =
        'Impossible de joindre APS. Vérifiez votre connexion et rechargez la page.';
      montrer('chargement');
    }
  }

  async function envoyer(e) {
    e.preventDefault();
    const a = $('ac-mdp').value;
    const b = $('ac-mdp2').value;
    if (a.length < 12) { dire('Au moins 12 caractères.', 'erreur'); $('ac-mdp').focus(); return; }
    if (a !== b)       { dire('Les deux saisies diffèrent.', 'erreur'); $('ac-mdp2').focus(); return; }

    const bouton = $('ac-valider');
    bouton.disabled = true;
    dire('Enregistrement…');
    try {
      const r = await fetch('/api/utilisateurs/activation/' + encodeURIComponent(jeton), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motDePasse: a }),
      });
      const corps = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        // 404 = le jeton a expiré ou servi PENDANT que la page était ouverte.
        // Le formulaire n'a plus de sens, on bascule sur le refus.
        if (r.status === 404) { montrer('refus'); return; }
        dire(corps.error || ('Erreur ' + r.status), 'erreur');
        bouton.disabled = false;
        return;
      }
      montrer('fini');
    } catch (e2) {
      dire('Enregistrement impossible : ' + e2.message, 'erreur');
      bouton.disabled = false;
    }
  }

  function init() {
    $('ac-formulaire').addEventListener('submit', envoyer);
    verifier();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
