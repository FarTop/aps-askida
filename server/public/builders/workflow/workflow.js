// APS — builders/workflow/workflow.js — 2026-07-30
//
// Page d'accueil du Workflow Builder. Incarne la descendance : on est dans le
// Builder de l'ORGANISATION courante (contexte), on y voit ses workflows et ses
// manifestes. Créer se fait dans cette org (le contexte porte l'org active).
//
// Discipline : aucun inline, event listeners, création DOM.

(function () {

  // Workflows de l'org : pas encore de route de listing (la persistance vient
  // juste après — page d'accueil d'abord). État vide propre en attendant.
  async function chargerWorkflows() {
    const hote = document.getElementById('wf-liste');
    try {
      const r = await fetch('/api/flows');
      if (!r.ok) throw new Error('indisponible');
      const list = await r.json();
      _rendreListe(hote, list, 'workflow-canvas.html?id=', 'Aucun workflow pour cette organisation.');
    } catch (e) {
      _vide(hote, 'Aucun workflow pour cette organisation.');
    }
  }

  async function chargerManifestes() {
    const hote = document.getElementById('mf-liste');
    try {
      const r = await fetch('/api/manifests');
      const list = await r.json();
      _rendreListe(hote, list, '../../admin/manifests/manifests.html', 'Aucun manifeste pour cette organisation.');
    } catch (e) {
      _vide(hote, 'Aucun manifeste.');
    }
  }

  function _rendreListe(hote, list, lienBase, msgVide) {
    hote.textContent = '';
    if (!Array.isArray(list) || !list.length) { _vide(hote, msgVide); return; }
    list.forEach(function (item) {
      const ligne = document.createElement('a');
      ligne.className = 'bd-liste-item';
      ligne.href = lienBase.indexOf('?') !== -1 ? lienBase + encodeURIComponent(item.id) : lienBase;
      const nom = document.createElement('span');
      nom.className = 'bd-liste-nom';
      nom.textContent = item.name;
      ligne.appendChild(nom);
      if (item.niveau && item.niveau !== '*') {
        const meta = document.createElement('span');
        meta.className = 'bd-liste-meta';
        meta.textContent = item.niveau;
        ligne.appendChild(meta);
      }
      hote.appendChild(ligne);
    });
  }

  function _vide(hote, msg) {
    hote.textContent = '';
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = msg;
    hote.appendChild(p);
  }

  function init() {
    chargerWorkflows();
    chargerManifestes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
