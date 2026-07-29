// APS — admin/organisations/organisations.js — 2026-07-29
//
// Vue « organisation au sommet » (étape 6). Inverse la perspective de l'écran
// Plateformes : ici l'organisation est l'entité racine, ses plateformes et ses
// environnements sont présentés dessous. C'est le paradigme cible d'APS.
//
// Additif : ne remplace pas l'écran Plateformes (qui reste fonctionnel), on
// ajoute la vue org-centrique. Discipline : aucun inline, event listeners,
// création DOM par éléments (pas d'innerHTML avec données non échappées).

(function () {

  const TYPE_PLATFORME = { integration: 'Intégration', storage: 'Stockage', delivery: 'Livraison' };

  async function charger() {
    const hote = document.getElementById('org-list');
    hote.textContent = 'Chargement…';
    hote.className = 'org-list adm-loading';
    try {
      const r = await fetch('/api/organisations');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const orgs = await r.json();
      rendre(orgs);
    } catch (e) {
      hote.className = 'org-list adm-error';
      hote.textContent = 'Erreur de chargement : ' + e.message;
    }
  }

  function rendre(orgs) {
    const hote = document.getElementById('org-list');
    hote.className = 'org-list';
    hote.textContent = '';

    if (!orgs.length) {
      const vide = document.createElement('div');
      vide.className = 'adm-empty';
      vide.textContent = 'Aucune organisation.';
      hote.appendChild(vide);
      return;
    }

    orgs.forEach(function (org) { hote.appendChild(_carteOrg(org)); });
  }

  function _carteOrg(org) {
    const carte = document.createElement('div');
    carte.className = 'org-card';

    // En-tête : nom + compteurs, cliquable pour déplier.
    const tete = document.createElement('div');
    tete.className = 'org-card-head';

    const gauche = document.createElement('div');
    gauche.className = 'org-head-left';
    const nom = document.createElement('div');
    nom.className = 'org-card-name';
    nom.textContent = org.name;
    const meta = document.createElement('div');
    meta.className = 'org-card-meta';
    const nbP = (org.platforms || []).length;
    const nbE = (org.environments || []).length;
    const nbC = (org.connexions || []).length;
    const r = org.ressources || {};
    const nbR = (r.mappings || []).length + (r.nommages || []).length + (r.contacts || []).length;
    meta.textContent = nbP + ' plateforme' + (nbP > 1 ? 's' : '') + ' · ' +
                       nbE + ' env. · ' +
                       nbC + ' connexion' + (nbC > 1 ? 's' : '') + ' · ' +
                       nbR + ' ressource' + (nbR > 1 ? 's' : '');
    gauche.appendChild(nom);
    gauche.appendChild(meta);

    const chevron = document.createElement('span');
    chevron.className = 'org-chevron';
    chevron.textContent = '▾';

    tete.appendChild(gauche);
    tete.appendChild(chevron);

    // Corps : plateformes, connexions et ressources de l'org — le patrimoine
    // complet, lisible d'un coup d'œil.
    const corps = document.createElement('div');
    corps.className = 'org-card-body';

    // — Plateformes (avec environnements)
    corps.appendChild(_sectionTitre('Plateformes'));
    if (!(org.platforms || []).length) {
      corps.appendChild(_sectionVide('Aucune plateforme liée.'));
    } else {
      org.platforms.forEach(function (p) {
        corps.appendChild(_lignePlateforme(p, org.environments || []));
      });
    }

    // — Connexions
    corps.appendChild(_sectionTitre('Connexions'));
    const conns = org.connexions || [];
    if (!conns.length) {
      corps.appendChild(_sectionVide('Aucune connexion.'));
    } else {
      conns.forEach(function (c) { corps.appendChild(_ligneConnexion(c)); });
    }

    // — Ressources d'orchestration
    corps.appendChild(_sectionTitre('Ressources'));
    corps.appendChild(_blocRessources(org.ressources || {}));

    tete.addEventListener('click', function () {
      carte.classList.toggle('org-open');
    });

    carte.appendChild(tete);
    carte.appendChild(corps);
    return carte;
  }

  function _lignePlateforme(p, envs) {
    const ligne = document.createElement('div');
    ligne.className = 'plat-row';

    const tete = document.createElement('div');
    tete.className = 'plat-row-head';
    const nom = document.createElement('span');
    nom.className = 'plat-row-name';
    nom.textContent = p.name;
    const type = document.createElement('span');
    type.className = 'plat-row-type';
    type.textContent = TYPE_PLATFORME[p.type] || p.type;
    const etat = document.createElement('span');
    etat.className = p.isActive ? 'plat-badge-active' : 'plat-badge-inactive';
    etat.textContent = p.isActive ? 'Active' : 'Inactive';
    tete.appendChild(nom);
    tete.appendChild(type);
    tete.appendChild(etat);

    // Environnements de cette plateforme (dans l'org).
    const envsDeLaPlateforme = envs.filter(function (e) { return e.platformId === p.id; });
    const chips = document.createElement('div');
    chips.className = 'plat-envs';
    if (!envsDeLaPlateforme.length) {
      const c = document.createElement('span');
      c.className = 'env-chip env-missing';
      c.textContent = 'Aucun environnement';
      chips.appendChild(c);
    } else {
      envsDeLaPlateforme.forEach(function (e) {
        const c = document.createElement('span');
        c.className = 'env-chip env-' + (e.type || 'qa');
        c.textContent = (e.type || '').toUpperCase() || e.name;
        chips.appendChild(c);
      });
    }

    ligne.appendChild(tete);
    ligne.appendChild(chips);
    return ligne;
  }

  function _sectionTitre(txt) {
    const t = document.createElement('div');
    t.className = 'org-section-titre';
    t.textContent = txt;
    return t;
  }

  function _sectionVide(txt) {
    const v = document.createElement('div');
    v.className = 'org-empty';
    v.textContent = txt;
    return v;
  }

  function _ligneConnexion(c) {
    const ligne = document.createElement('div');
    ligne.className = 'conn-row';
    const nom = document.createElement('span');
    nom.className = 'conn-name';
    nom.textContent = c.name;
    const type = document.createElement('span');
    type.className = 'conn-type';
    type.textContent = c.type + (c.direction ? ' · ' + c.direction : '');
    const etat = document.createElement('span');
    etat.className = c.isActive ? 'conn-badge-active' : 'conn-badge-inactive';
    etat.textContent = c.isActive ? 'Active' : 'Inactive';
    ligne.appendChild(nom);
    ligne.appendChild(type);
    ligne.appendChild(etat);
    return ligne;
  }

  function _blocRessources(res) {
    const bloc = document.createElement('div');
    bloc.className = 'res-bloc';
    const familles = [
      { cle: 'mappings', label: 'Correspondances' },
      { cle: 'nommages', label: 'Nommages' },
      { cle: 'contacts', label: 'Contacts' }
    ];
    let total = 0;
    familles.forEach(function (f) {
      const items = res[f.cle] || [];
      total += items.length;
      const ligne = document.createElement('div');
      ligne.className = 'res-famille';
      const lab = document.createElement('span');
      lab.className = 'res-famille-label';
      lab.textContent = f.label;
      const cnt = document.createElement('span');
      cnt.className = 'res-famille-count';
      cnt.textContent = items.length;
      ligne.appendChild(lab);
      ligne.appendChild(cnt);
      bloc.appendChild(ligne);
    });
    if (!total) {
      return _sectionVide('Aucune ressource.');
    }
    return bloc;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', charger);
  } else {
    charger();
  }

})();
