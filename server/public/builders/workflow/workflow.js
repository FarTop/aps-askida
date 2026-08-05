// APS — builders/workflow/workflow.js — 2026-07-30
//
// Page d'accueil du Workflow Builder. Onglets Workflows | Manifestes, chacun sa
// liste, dans le contexte de l'organisation courante. On ne reprend PAS le
// passif WFD : les workflows listés seront ceux du nouveau Builder (persistance
// à venir). La présentation est déjà la bonne pour les accueillir.
//
// Discipline : aucun inline, event listeners, création DOM.

(function () {

  // Comptage d'usage (4 août) : où chaque Manifeste/Gabarit/Correspondance/
  // Endpoints est-il référencé, parmi tous les workflows de l'org ? Une seule
  // requête, mémoïsée par la promesse elle-même (pas de cache manuel à
  // invalider) — chaque onglet qui en a besoin attend la MÊME promesse,
  // qu'il soit le premier ou le dernier à la lire. Pas raffraîchi entre deux
  // activations d'onglet dans la même visite de page (juste informatif, pas
  // une donnée qui doit être seconde-par-seconde à jour).
  const _usagePromise = fetch('/api/builder-flows/usage')
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; });

  // Recharge la liste de l'onglet à chaque activation — pas seulement au
  // chargement de la page. Sans ça, créer/modifier une ressource dans une
  // autre page (ex. arbo-canvas.html) puis revenir sur cet onglet montrait
  // la liste telle qu'elle était AVANT, tant que la page workflow.html
  // elle-même n'était pas rechargée (constaté le 3 août : un gabarit
  // fraîchement enregistré n'apparaissait pas tant qu'on ne rechargeait pas).
  function activerOnglet(nom) {
    document.querySelectorAll('.wb-tab').forEach(function (t) {
      t.classList.toggle('wb-tab-actif', t.getAttribute('data-tab') === nom);
    });
    document.querySelectorAll('.wb-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== nom;
    });
    if (nom === 'workflows') chargerWorkflows();
    else if (nom === 'manifests') chargerManifestes();
    else if (nom === 'arbos') chargerGabarits();
    else if (nom === 'mappings') chargerMappings();
    else if (nom === 'endpoints') chargerEndpoints();
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
      const [r, usageMap] = await Promise.all([fetch('/api/manifests'), _usagePromise]);
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: '../../admin/manifests/manifests.html',
        outilsManifeste: true,
        usageType: 'manifests', usageMap: usageMap,
        msgVide: 'Aucun manifeste pour cette organisation.'
      });
      const c = document.getElementById('mf-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' manifeste' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucun manifeste.');
    }
  }

  async function chargerMappings() {
    const hote = document.getElementById('mp-liste');
    try {
      const [r, usageMap] = await Promise.all([fetch('/api/mappings'), _usagePromise]);
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: '../../admin/mappings/mappings.html',
        outilsMapping: true,
        usageType: 'mappings', usageMap: usageMap,
        msgVide: 'Aucune correspondance pour cette organisation.'
      });
      const c = document.getElementById('mp-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' correspondance' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucune correspondance.');
      document.getElementById('mp-compte').textContent = '';
    }
  }

  async function chargerGabarits() {
    const hote = document.getElementById('at-liste');
    try {
      const [r, usageMap] = await Promise.all([fetch('/api/arbo-templates'), _usagePromise]);
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: 'arbo-canvas.html?id=',
        lienParItem: true,
        outilsGabarit: true,
        usageType: 'arboTemplates', usageMap: usageMap,
        msgVide: 'Aucun gabarit d\'arborescence pour l\'instant. Créez-en un pour commencer.'
      });
      const c = document.getElementById('at-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' gabarit' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucun gabarit d\'arborescence pour l\'instant. Créez-en un pour commencer.');
      document.getElementById('at-compte').textContent = '';
    }
  }

  async function chargerEndpoints() {
    const hote = document.getElementById('ep-liste');
    try {
      const [r, usageMap] = await Promise.all([fetch('/api/endpoints'), _usagePromise]);
      const list = await r.json();
      _rendre(hote, Array.isArray(list) ? list : [], {
        lien: '../../admin/endpoints/endpoints.html',
        outilsEndpoint: true,
        usageType: 'endpoints', usageMap: usageMap,
        msgVide: 'Aucun Endpoints pour cette organisation.'
      });
      const c = document.getElementById('ep-compte');
      const n = Array.isArray(list) ? list.length : 0;
      c.textContent = n + ' séquence' + (n > 1 ? 's' : '');
    } catch (e) {
      _vide(hote, 'Aucun Endpoints.');
      document.getElementById('ep-compte').textContent = '';
    }
  }

  function _rendre(hote, list, opts) {
    hote.textContent = '';
    if (!list.length) { _vide(hote, opts.msgVide); return; }
    // Ordre alphabétique par nom, pas l'ordre d'arrivée de l'API (updatedAt
    // desc) — c'est ce que l'œil cherche dans une liste de ressources.
    const trie = list.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
    });
    trie.forEach(function (item) {
      const ligne = document.createElement('div');
      ligne.className = 'wb-item';

      const lien = document.createElement('a');
      lien.className = 'wb-item-link';
      lien.href = opts.lienParItem ? opts.lien + encodeURIComponent(item.id) : opts.lien;

      const nom = document.createElement('span');
      nom.className = 'wb-item-nom';
      nom.textContent = item.name;
      lien.appendChild(nom);

      // Badge Draft/Published (Workflows uniquement, 4 août) — statut déjà
      // calculé côté API (GET /builder-flows), jamais stocké (builder-etat.md,
      // section Versionnement).
      if (opts.outils && item.status) {
        const badge = document.createElement('span');
        badge.className = 'wb-badge ' + (item.status === 'published' ? 'wb-badge-published' : 'wb-badge-draft');
        badge.textContent = item.status === 'published' ? 'Published' : 'Draft';
        lien.appendChild(badge);
      }

      if (item.niveau && item.niveau !== '*') {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        meta.textContent = item.niveau;
        lien.appendChild(meta);
      }
      if (item.description) {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        meta.textContent = item.description;
        lien.appendChild(meta);
      }
      if (opts.outilsMapping && Array.isArray(item.rows)) {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        const n = item.rows.length;
        meta.textContent = n + ' ligne' + (n > 1 ? 's' : '');
        lien.appendChild(meta);
      }
      if (opts.outilsEndpoint && Array.isArray(item.steps)) {
        const meta = document.createElement('span');
        meta.className = 'wb-item-meta';
        const n = item.steps.length;
        meta.textContent = n + ' étape' + (n > 1 ? 's' : '');
        lien.appendChild(meta);
      }
      // Usage (4 août) : discret, même style que les compteurs ci-dessus,
      // absent plutôt qu'à "0 workflow" quand la ressource n'est référencée
      // nulle part (c'est le cas courant pour une ressource neuve — l'écrire
      // partout aurait été le bruit que l'utilisateur voulait éviter). La
      // liste des workflows concernés est dans le survol (title), jamais
      // dépliée dans la cartouche.
      if (opts.usageType && opts.usageMap) {
        const refs = (opts.usageMap[opts.usageType] || {})[item.id];
        if (refs && refs.length) {
          const meta = document.createElement('span');
          meta.className = 'wb-item-meta wb-item-usage';
          meta.textContent = 'utilisé dans ' + refs.length + ' workflow' + (refs.length > 1 ? 's' : '');
          meta.title = refs.map(function (w) { return w.name; }).join('\n');
          lien.appendChild(meta);
        }
      }
      ligne.appendChild(lien);

      if (opts.outils) {
        ligne.appendChild(_outilsWorkflow(item));
      }
      if (opts.outilsGabarit) {
        ligne.appendChild(_outilsGabarit(item));
      }
      if (opts.outilsManifeste) {
        ligne.appendChild(_outilsManifeste(item));
      }
      if (opts.outilsMapping) {
        ligne.appendChild(_outilsMapping(item));
      }
      if (opts.outilsEndpoint) {
        ligne.appendChild(_outilsEndpoint(item));
      }

      hote.appendChild(ligne);
    });
  }

  // ── Export / Import JSON (4 août) ─────────────────────────────────────────
  // Génériques, partagés par les 5 types de ressources — export au niveau de
  // la ligne (télécharge le GET /:id complet), import au niveau de la page
  // (un bouton par onglet, POST vers la même API que "Nouveau X"). L'id de
  // la ressource exportée n'est jamais renvoyé au POST : réimporter crée
  // toujours une NOUVELLE ressource, jamais un écrasement silencieux d'une
  // existante — une collision de nom fait simplement échouer le POST avec le
  // message d'erreur de l'API (à charge de l'utilisateur de renommer avant
  // de réessayer), pas de fusion magique.

  function _boutonExport(item, api) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wb-outil';
    btn.title = 'Exporter (JSON)';
    btn.textContent = '⤓';
    btn.addEventListener('click', function () { _exporterJSON(item, api); });
    return btn;
  }

  async function _exporterJSON(item, api) {
    try {
      const r = await fetch(api + '/' + encodeURIComponent(item.id));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = _slug(item.name) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert('Export impossible : ' + e.message);
    }
  }

  function _slug(s) {
    return String(s || 'export').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  }

  // `construireCorps(donneesImportees)` extrait, depuis le JSON importé
  // (potentiellement un export tel quel, avec id/orgId/status en trop), juste
  // les champs que l'API de création accepte — même logique que dupliquer(),
  // qui fait déjà ce tri pour chaque type de ressource.
  function _declencherImport(api, construireCorps, recharger) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.addEventListener('change', async function () {
      const fichier = input.files[0];
      input.remove();
      if (!fichier) return;
      try {
        const texte = await fichier.text();
        const data = JSON.parse(texte);
        const corps = construireCorps(data);
        if (!corps.name) throw new Error('le fichier ne contient pas de "name"');
        const r = await fetch(api, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps)
        });
        if (!r.ok) { const d = await r.json(); throw new Error((d.error || ('HTTP ' + r.status)) + (d.details ? ' — ' + d.details.join(', ') : '')); }
        await recharger();
      } catch (e) {
        window.alert('Import impossible : ' + e.message);
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  function _initImportBouton(id, api, construireCorps, recharger) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function () { _declencherImport(api, construireCorps, recharger); });
  }

  // Boutons renommer / dupliquer / supprimer pour une ligne workflow. Ne
  // touchent que /api/builder-flows (les manifestes n'ont pas ces outils
  // aujourd'hui — hors périmètre de cette passe).
  function _outilsWorkflow(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    outils.appendChild(_boutonExport(item, '/api/builder-flows'));

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

  // Boutons renommer / dupliquer / supprimer pour un gabarit d'arborescence.
  // Même trio que les workflows, sur /api/arbo-templates.
  function _outilsGabarit(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    outils.appendChild(_boutonExport(item, '/api/arbo-templates'));

    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'wb-outil';
    renommer.title = 'Renommer';
    renommer.textContent = '✎';
    renommer.addEventListener('click', function () { _renommerGabarit(item); });

    const dupliquer = document.createElement('button');
    dupliquer.type = 'button';
    dupliquer.className = 'wb-outil';
    dupliquer.title = 'Dupliquer';
    dupliquer.textContent = '⧉';
    dupliquer.addEventListener('click', function () { _dupliquerGabarit(item); });

    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'wb-outil wb-outil-suppr';
    supprimer.title = 'Supprimer';
    supprimer.textContent = '🗑';
    supprimer.addEventListener('click', function () { _supprimerGabarit(item); });

    outils.appendChild(renommer);
    outils.appendChild(dupliquer);
    outils.appendChild(supprimer);
    return outils;
  }

  async function _renommerGabarit(item) {
    const nouveauNom = window.prompt('Nouveau nom :', item.name);
    if (!nouveauNom || nouveauNom === item.name) return;
    try {
      const r = await fetch('/api/arbo-templates/' + encodeURIComponent(item.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nouveauNom })   // pas de config -> conservée telle quelle
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || ('HTTP ' + r.status)); }
      chargerGabarits();
    } catch (e) {
      window.alert('Renommage impossible : ' + e.message);
    }
  }

  async function _dupliquerGabarit(item) {
    try {
      const r1 = await fetch('/api/arbo-templates/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/arbo-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: complet.name + ' (copie)', description: complet.description, config: complet.config })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error(d.error || ('HTTP ' + r2.status)); }
      chargerGabarits();
    } catch (e) {
      window.alert('Duplication impossible : ' + e.message);
    }
  }

  async function _supprimerGabarit(item) {
    if (!window.confirm('Supprimer le gabarit « ' + item.name + ' » ? Cette action est irréversible.')) return;
    try {
      const r = await fetch('/api/arbo-templates/' + encodeURIComponent(item.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      chargerGabarits();
    } catch (e) {
      window.alert('Suppression impossible : ' + e.message);
    }
  }

  // Boutons renommer / dupliquer / supprimer pour un manifeste. Sur
  // /api/manifests, contrairement aux autres ressources : PUT/POST valident
  // la structure complète (PivotManifest.valider — name/niveau/essences),
  // pas un simple patch tolérant l'absence de champs. Renommer/dupliquer
  // doivent donc D'ABORD relire le manifeste complet (GET /:id) pour
  // renvoyer niveau/essences inchangés, sous peine de 400.
  function _outilsManifeste(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    outils.appendChild(_boutonExport(item, '/api/manifests'));

    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'wb-outil';
    renommer.title = 'Renommer';
    renommer.textContent = '✎';
    renommer.addEventListener('click', function () { _renommerManifeste(item); });

    const dupliquer = document.createElement('button');
    dupliquer.type = 'button';
    dupliquer.className = 'wb-outil';
    dupliquer.title = 'Dupliquer';
    dupliquer.textContent = '⧉';
    dupliquer.addEventListener('click', function () { _dupliquerManifeste(item); });

    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'wb-outil wb-outil-suppr';
    supprimer.title = 'Supprimer';
    supprimer.textContent = '🗑';
    supprimer.addEventListener('click', function () { _supprimerManifeste(item); });

    outils.appendChild(renommer);
    outils.appendChild(dupliquer);
    outils.appendChild(supprimer);
    return outils;
  }

  async function _renommerManifeste(item) {
    const nouveauNom = window.prompt('Nouveau nom :', item.name);
    if (!nouveauNom || nouveauNom === item.name) return;
    try {
      const r1 = await fetch('/api/manifests/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/manifests/' + encodeURIComponent(item.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nouveauNom, niveau: complet.niveau, essences: complet.essences })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error((d.error || ('HTTP ' + r2.status)) + (d.details ? ' — ' + d.details.join(', ') : '')); }
      chargerManifestes();
    } catch (e) {
      window.alert('Renommage impossible : ' + e.message);
    }
  }

  async function _dupliquerManifeste(item) {
    try {
      const r1 = await fetch('/api/manifests/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/manifests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: complet.name + ' (copie)', niveau: complet.niveau, essences: complet.essences })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error((d.error || ('HTTP ' + r2.status)) + (d.details ? ' — ' + d.details.join(', ') : '')); }
      chargerManifestes();
    } catch (e) {
      window.alert('Duplication impossible : ' + e.message);
    }
  }

  async function _supprimerManifeste(item) {
    if (!window.confirm('Supprimer le manifeste « ' + item.name + ' » ? Cette action est irréversible.')) return;
    try {
      const r = await fetch('/api/manifests/' + encodeURIComponent(item.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      chargerManifestes();
    } catch (e) {
      window.alert('Suppression impossible : ' + e.message);
    }
  }

  // Boutons renommer / dupliquer / supprimer pour une correspondance
  // (Mapping). Contrairement aux manifestes, /api/mappings tolère un PUT
  // partiel (Prisma ignore les clés absentes) — pas besoin de relire la
  // ressource complète avant de renommer.
  function _outilsMapping(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    outils.appendChild(_boutonExport(item, '/api/mappings'));

    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'wb-outil';
    renommer.title = 'Renommer';
    renommer.textContent = '✎';
    renommer.addEventListener('click', function () { _renommerMapping(item); });

    const dupliquer = document.createElement('button');
    dupliquer.type = 'button';
    dupliquer.className = 'wb-outil';
    dupliquer.title = 'Dupliquer';
    dupliquer.textContent = '⧉';
    dupliquer.addEventListener('click', function () { _dupliquerMapping(item); });

    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'wb-outil wb-outil-suppr';
    supprimer.title = 'Supprimer';
    supprimer.textContent = '🗑';
    supprimer.addEventListener('click', function () { _supprimerMapping(item); });

    outils.appendChild(renommer);
    outils.appendChild(dupliquer);
    outils.appendChild(supprimer);
    return outils;
  }

  async function _renommerMapping(item) {
    const nouveauNom = window.prompt('Nouveau nom :', item.name);
    if (!nouveauNom || nouveauNom === item.name) return;
    try {
      const r = await fetch('/api/mappings/' + encodeURIComponent(item.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nouveauNom })   // pas de rows -> conservées telles quelles
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || ('HTTP ' + r.status)); }
      chargerMappings();
    } catch (e) {
      window.alert('Renommage impossible : ' + e.message);
    }
  }

  async function _dupliquerMapping(item) {
    try {
      const r1 = await fetch('/api/mappings/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/mappings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: complet.name + ' (copie)', rows: complet.rows })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error(d.error || ('HTTP ' + r2.status)); }
      chargerMappings();
    } catch (e) {
      window.alert('Duplication impossible : ' + e.message);
    }
  }

  async function _supprimerMapping(item) {
    if (!window.confirm('Supprimer la correspondance « ' + item.name + ' » ? Cette action est irréversible.')) return;
    try {
      const r = await fetch('/api/mappings/' + encodeURIComponent(item.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      chargerMappings();
    } catch (e) {
      window.alert('Suppression impossible : ' + e.message);
    }
  }

  // Boutons renommer / dupliquer / supprimer pour un Endpoints (séquence
  // HTTP). Même tolérance qu'un Mapping : /api/endpoints accepte un PUT
  // partiel (Prisma ignore les clés absentes) — pas besoin de relire la
  // ressource complète avant de renommer.
  function _outilsEndpoint(item) {
    const outils = document.createElement('div');
    outils.className = 'wb-item-outils';

    outils.appendChild(_boutonExport(item, '/api/endpoints'));

    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'wb-outil';
    renommer.title = 'Renommer';
    renommer.textContent = '✎';
    renommer.addEventListener('click', function () { _renommerEndpoint(item); });

    const dupliquer = document.createElement('button');
    dupliquer.type = 'button';
    dupliquer.className = 'wb-outil';
    dupliquer.title = 'Dupliquer';
    dupliquer.textContent = '⧉';
    dupliquer.addEventListener('click', function () { _dupliquerEndpoint(item); });

    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'wb-outil wb-outil-suppr';
    supprimer.title = 'Supprimer';
    supprimer.textContent = '🗑';
    supprimer.addEventListener('click', function () { _supprimerEndpoint(item); });

    outils.appendChild(renommer);
    outils.appendChild(dupliquer);
    outils.appendChild(supprimer);
    return outils;
  }

  async function _renommerEndpoint(item) {
    const nouveauNom = window.prompt('Nouveau nom :', item.name);
    if (!nouveauNom || nouveauNom === item.name) return;
    try {
      const r = await fetch('/api/endpoints/' + encodeURIComponent(item.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nouveauNom })   // pas de steps -> conservées telles quelles
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || ('HTTP ' + r.status)); }
      chargerEndpoints();
    } catch (e) {
      window.alert('Renommage impossible : ' + e.message);
    }
  }

  async function _dupliquerEndpoint(item) {
    try {
      const r1 = await fetch('/api/endpoints/' + encodeURIComponent(item.id));
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const complet = await r1.json();
      const r2 = await fetch('/api/endpoints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: complet.name + ' (copie)', steps: complet.steps })
      });
      if (!r2.ok) { const d = await r2.json(); throw new Error(d.error || ('HTTP ' + r2.status)); }
      chargerEndpoints();
    } catch (e) {
      window.alert('Duplication impossible : ' + e.message);
    }
  }

  async function _supprimerEndpoint(item) {
    if (!window.confirm('Supprimer les Endpoints « ' + item.name + ' » ? Cette action est irréversible.')) return;
    try {
      const r = await fetch('/api/endpoints/' + encodeURIComponent(item.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      chargerEndpoints();
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

  // Onglet initial depuis l'URL (#arbos, #mappings…) — permet à un lien
  // externe (ex. le fil d'Ariane d'arbo-canvas.html) d'atterrir directement
  // sur le bon onglet plutôt que de rouvrir "Workflows" par défaut à chaque
  // fois. Sans correspondance : comportement inchangé (Workflows, déjà actif
  // par défaut dans le HTML).
  const ONGLETS_VALIDES = ['workflows', 'manifests', 'arbos', 'mappings', 'endpoints'];

  function init() {
    document.querySelectorAll('.wb-tab').forEach(function (t) {
      t.addEventListener('click', function () { activerOnglet(t.getAttribute('data-tab')); });
    });

    // Import (4 août) : `construireCorps` trie, dans le JSON importé (souvent
    // un export tel quel, donc avec id/orgId/status en plus), les seuls
    // champs que le POST de création accepte — même tri que les fonctions
    // dupliquer() de chaque type, juste depuis un fichier plutôt qu'un GET.
    _initImportBouton('wf-importer', '/api/builder-flows',
      function (d) { return { name: d.name, document: d.document }; }, chargerWorkflows);
    _initImportBouton('mf-importer', '/api/manifests',
      function (d) { return { name: d.name, niveau: d.niveau, essences: d.essences }; }, chargerManifestes);
    _initImportBouton('at-importer', '/api/arbo-templates',
      function (d) { return { name: d.name, description: d.description, config: d.config }; }, chargerGabarits);
    _initImportBouton('mp-importer', '/api/mappings',
      function (d) { return { name: d.name, rows: d.rows }; }, chargerMappings);
    _initImportBouton('ep-importer', '/api/endpoints',
      function (d) { return { name: d.name, steps: d.steps }; }, chargerEndpoints);

    chargerWorkflows();
    chargerManifestes();
    chargerGabarits();
    chargerMappings();
    chargerEndpoints();

    const ongletDepuisHash = (window.location.hash || '').replace('#', '');
    if (ONGLETS_VALIDES.indexOf(ongletDepuisHash) !== -1) activerOnglet(ongletDepuisHash);

    // Retour arrière depuis arbo-canvas.html / workflow-canvas.html : le
    // navigateur peut restaurer cette page depuis son cache (bfcache) SANS
    // relancer ce script — les listes resteraient alors telles qu'elles
    // étaient avant le départ. `pageshow` avec `persisted` détecte ce cas.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      chargerWorkflows();
      chargerManifestes();
      chargerGabarits();
      chargerMappings();
      chargerEndpoints();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
