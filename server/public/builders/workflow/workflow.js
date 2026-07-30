// APS — builders/workflow/workflow.js — 2026-07-30
//
// Page d'accueil du Workflow Builder. Onglets Workflows | Manifestes, chacun sa
// liste, dans le contexte de l'organisation courante. On ne reprend PAS le
// passif WFD : les workflows listés seront ceux du nouveau Builder (persistance
// à venir). La présentation est déjà la bonne pour les accueillir.
//
// Discipline : aucun inline, event listeners, création DOM.

(function () {

  function activerOnglet(nom) {
    document.querySelectorAll('.wb-tab').forEach(function (t) {
      t.classList.toggle('wb-tab-actif', t.getAttribute('data-tab') === nom);
    });
    document.querySelectorAll('.wb-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== nom;
    });
  }

  function chargerWorkflows() {
    const hote = document.getElementById('wf-liste');
    _vide(hote, 'Aucun workflow pour cette organisation. Créez-en un pour commencer.');
    document.getElementById('wf-compte').textContent = '';
  }

  async function chargerManifestes() {
    const hote = document.getElementById('mf-liste');
    try {
      const r = await fetch('/api/manifests');
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: '../../admin/manifests/manifests.html',
        msgVide: 'Aucun manifeste pour cette organisation.'
      });
      const c = document.getElementById('mf-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' manifeste' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucun manifeste.');
    }
  }

  function _rendre(hote, list, opts) {
    hote.textContent = '';
    if (!list.length) { _vide(hote, opts.msgVide); return; }
    list.forEach(function (item) {
      const ligne = document.createElement('a');
      ligne.className = 'wb-item';
      ligne.href = opts.lien;

      const nom = document.createElement('span');
      nom.className = 'wb-item-nom';
      nom.textContent = item.name;
      ligne.appendChild(nom);

      if (item.niveau && item.niveau !== '*') {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        meta.textContent = item.niveau;
        ligne.appendChild(meta);
      }
      hote.appendChild(ligne);
    });
  }

  function _vide(hote, msg) {
    hote.textContent = '';
    const p = document.createElement('p');
    p.className = 'wb-muted';
    p.textContent = msg;
    hote.appendChild(p);
  }

  function init() {
    document.querySelectorAll('.wb-tab').forEach(function (t) {
      t.addEventListener('click', function () { activerOnglet(t.getAttribute('data-tab')); });
    });
    chargerWorkflows();
    chargerManifestes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
