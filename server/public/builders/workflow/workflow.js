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

  async function chargerWorkflows() {
    const hote = document.getElementById('wf-liste');
    try {
      const r = await fetch('/api/builder-flows');
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: 'workflow-canvas.html?id=',
        lienParItem: true,
        outils: true,
        msgVide: 'Aucun workflow pour cette organisation. Créez-en un pour commencer.'
      });
      const c = document.getElementById('wf-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' workflow' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucun workflow pour cette organisation. Créez-en un pour commencer.');
      document.getElementById('wf-compte').textContent = '';
    }
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
      const ligne = document.createElement('div');
      ligne.className = 'wb-item';

      const lien = document.createElement('a');
      lien.className = 'wb-item-link';
      lien.href = opts.lienParItem ? opts.lien + encodeURIComponent(item.id) : opts.lien;

      const nom = document.createElement('span');
      nom.className = 'wb-item-nom';
      nom.textContent = item.name;
      lien.appendChild(nom);

      if (item.niveau && item.niveau !== '*') {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        meta.textContent = item.niveau;
        lien.appendChild(meta);
      }
      ligne.appendChild(lien);

      if (opts.outils) {
        ligne.appendChild(_outilsWorkflow(item));
      }

      hote.appendChild(ligne);
    });
  }

  // Boutons renommer / dupliquer / supprimer pour une ligne workflow. Ne
  // touchent que /api/builder-flows (les manifestes n'ont pas ces outils
  // aujourd'hui — hors périmètre de cette passe).
  function _outilsWorkflow(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'wb-outil';
    renommer.title = 'Renommer';
    renommer.textContent = '✎';
    renommer.addEventListener('click', function () { _renommer(item); });

    const dupliquer = document.createElement('button');
    dupliquer.type = 'button';
    dupliquer.className = 'wb-outil';
    dupliquer.title = 'Dupliquer';
    dupliquer.textContent = '⧉';
    dupliquer.addEventListener('click', function () { _dupliquer(item); });

    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'wb-outil wb-outil-suppr';
    supprimer.title = 'Supprimer';
    supprimer.textContent = '🗑';
    supprimer.addEventListener('click', function () { _supprimer(item); });

    outils.appendChild(renommer);
    outils.appendChild(dupliquer);
    outils.appendChild(supprimer);
    return outils;
  }

  async function _renommer(item) {
    const nouveauNom = window.prompt('Nouveau nom :', item.name);
    if (!nouveauNom || nouveauNom === item.name) return;
    try {
      const r = await fetch('/api/builder-flows/' + encodeURIComponent(item.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nouveauNom })   // pas de document -> conservé tel quel
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || ('HTTP ' + r.status)); }
      chargerWorkflows();
    } catch (e) {
      window.alert('Renommage impossible : ' + e.message);
    }
  }

  async function _dupliquer(item) {
    try {
      const r1 = await fetch('/api/builder-flows/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/builder-flows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: complet.name + ' (copie)', document: complet.document })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error(d.error || ('HTTP ' + r2.status)); }
      chargerWorkflows();
    } catch (e) {
      window.alert('Duplication impossible : ' + e.message);
    }
  }

  async function _supprimer(item) {
    if (!window.confirm('Supprimer le workflow « ' + item.name + ' » ? Cette action est irréversible.')) return;
    try {
      const r = await fetch('/api/builder-flows/' + encodeURIComponent(item.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      chargerWorkflows();
    } catch (e) {
      window.alert('Suppression impossible : ' + e.message);
    }
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
