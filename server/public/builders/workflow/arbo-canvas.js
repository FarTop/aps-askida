// APS — builders/workflow/arbo-canvas.js — 2026-08-03
//
// Éditeur de gabarit d'arborescence (ArboTemplate), dans le Builder plutôt que
// dans le Designer de platforms/iconik/viewer/ — cf. discussion : une
// ressource du Builder s'édite dans le Builder, comme les Manifestes.
//
// Un gabarit est un ARBRE strict (un nœud a un seul parent) : pas de canevas
// à positions/arêtes libres comme workflow-canvas, une liste imbriquée
// suffit — l'indentation EST la hiérarchie, rien à déduire d'un tracé.
//
// Forme d'un nœud, identique à ce que create_tree() (wfd-engine-handlers.js)
// lit : { name, collectionType, generateId, children: [...] }. `generateId`
// est le badge historique du Designer : ce niveau reçoit un identifiant
// unique, ET porte le Parent ID du dernier ancêtre qui a aussi ce badge —
// pas forcément son parent direct. Reproduit tel quel pour l'instant (cf.
// discussion du 3 août sur la parenté) ; l'aide affichée à l'écran le dit
// explicitement plutôt que de le laisser surprendre à l'exécution.
//
// Discipline : aucun inline, event listeners, création DOM.

(function () {

  let arbre = null;
  let templateId = null;   // null = nouveau gabarit, pas encore enregistré

  function nouveauNoeud() {
    return { name: '', collectionType: '', generateId: false, numberField: '', numberPad: 2, children: [] };
  }

  // Retire un nœud de l'arbre en cherchant son parent par référence — pas
  // besoin d'identifiants clients : les objets nœuds restent les mêmes entre
  // deux rendus (rendreArbre() reparcourt la même structure, n'en recrée pas
  // de copie), donc l'égalité de référence suffit.
  function retirerNoeud(cible) {
    function chercher(noeud) {
      const enfants = noeud.children || [];
      const i = enfants.indexOf(cible);
      if (i >= 0) { enfants.splice(i, 1); return true; }
      return enfants.some(chercher);
    }
    chercher(arbre);
  }

  function rendreArbre() {
    const hote = document.getElementById('at-arbre');
    hote.textContent = '';
    hote.appendChild(rendreNoeud(arbre, true));
  }

  function rendreNoeud(noeud, estRacine) {
    const wrap = document.createElement('div');
    wrap.className = 'at-noeud';

    const corps = document.createElement('div');
    corps.className = 'at-noeud-corps';

    if (estRacine) {
      const etq = document.createElement('span');
      etq.className = 'at-racine-etiquette';
      etq.textContent = 'Racine';
      corps.appendChild(etq);
    }

    const titre = document.createElement('input');
    titre.className = 'at-champ-titre';
    titre.type = 'text';
    titre.placeholder = 'Titre — ex. Saison {NumeroSaison}';
    titre.value = noeud.name || '';
    titre.addEventListener('input', function () { noeud.name = titre.value; });
    corps.appendChild(titre);

    const type = document.createElement('input');
    type.className = 'at-champ-type';
    type.type = 'text';
    type.placeholder = 'Type (optionnel)';
    type.setAttribute('list', 'at-types-suggestions');
    type.value = noeud.collectionType || '';
    type.addEventListener('input', function () { noeud.collectionType = type.value; });
    corps.appendChild(type);

    const badge = document.createElement('label');
    badge.className = 'at-badge-id';
    badge.setAttribute('data-actif', noeud.generateId ? '1' : '0');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!noeud.generateId;
    cb.addEventListener('change', function () {
      noeud.generateId = cb.checked;
      badge.setAttribute('data-actif', cb.checked ? '1' : '0');
    });
    badge.appendChild(cb);
    badge.appendChild(document.createTextNode('Génère un ID'));
    corps.appendChild(badge);

    // Numérotation : sur N'IMPORTE QUEL niveau (pas réservée à la racine,
    // contrairement à l'ancien réglage de workflow orderFieldName). Le champ
    // de métadonnée devient disponible dans le titre via {NomDuChamp}, ex.
    // "Saison {NumeroSaison}" — même convention que "Génère un ID".
    const badgeNum = document.createElement('label');
    badgeNum.className = 'at-badge-id';
    badgeNum.setAttribute('data-actif', noeud.numberField ? '1' : '0');
    const cbNum = document.createElement('input');
    cbNum.type = 'checkbox';
    cbNum.checked = !!noeud.numberField;
    corps.appendChild((function () {
      badgeNum.appendChild(cbNum);
      badgeNum.appendChild(document.createTextNode('Numérote ce niveau'));
      return badgeNum;
    })());

    const champNumWrap = document.createElement('span');
    champNumWrap.className = 'at-num-champs';
    champNumWrap.hidden = !noeud.numberField;

    const champNumNom = document.createElement('input');
    champNumNom.className = 'at-champ-numchamp';
    champNumNom.type = 'text';
    champNumNom.placeholder = 'Nom du champ — ex. NumeroSaison';
    champNumNom.value = noeud.numberField || '';
    champNumNom.addEventListener('input', function () { noeud.numberField = champNumNom.value; });
    champNumWrap.appendChild(champNumNom);

    const champNumPad = document.createElement('input');
    champNumPad.className = 'at-champ-numpad';
    champNumPad.type = 'number';
    champNumPad.min = '0';
    champNumPad.max = '6';
    champNumPad.placeholder = 'chiffres';
    champNumPad.title = 'Nombre de chiffres (ex. 2 -> 02)';
    champNumPad.value = (noeud.numberPad === undefined || noeud.numberPad === null || noeud.numberPad === '') ? '2' : noeud.numberPad;
    champNumPad.addEventListener('input', function () { noeud.numberPad = champNumPad.value === '' ? '' : parseInt(champNumPad.value, 10); });
    champNumWrap.appendChild(champNumPad);

    cbNum.addEventListener('change', function () {
      badgeNum.setAttribute('data-actif', cbNum.checked ? '1' : '0');
      champNumWrap.hidden = !cbNum.checked;
      if (!cbNum.checked) { noeud.numberField = ''; }
      else if (!noeud.numberPad && noeud.numberPad !== 0) { noeud.numberPad = 2; champNumPad.value = '2'; }
    });

    corps.appendChild(champNumWrap);

    const outils = document.createElement('div');
    outils.className = 'at-noeud-outils';

    const ajEnfant = document.createElement('button');
    ajEnfant.type = 'button';
    ajEnfant.className = 'at-outil';
    ajEnfant.textContent = '+ enfant';
    ajEnfant.addEventListener('click', function () {
      noeud.children = noeud.children || [];
      noeud.children.push(nouveauNoeud());
      rendreArbre();
    });
    outils.appendChild(ajEnfant);

    const suppr = document.createElement('button');
    suppr.type = 'button';
    suppr.className = 'at-outil at-outil-suppr';
    suppr.textContent = '🗑';
    suppr.title = estRacine ? 'La racine ne se supprime pas' : 'Supprimer ce niveau (et ses enfants)';
    if (estRacine) {
      suppr.disabled = true;
    } else {
      suppr.addEventListener('click', function () {
        const nbEnfants = (noeud.children || []).length;
        if (nbEnfants && !window.confirm('Supprimer ce niveau et ses ' + nbEnfants + ' enfant(s) ?')) return;
        retirerNoeud(noeud);
        rendreArbre();
      });
    }
    outils.appendChild(suppr);

    corps.appendChild(outils);
    wrap.appendChild(corps);

    if (noeud.children && noeud.children.length) {
      const enfants = document.createElement('div');
      enfants.className = 'at-noeud-enfants';
      noeud.children.forEach(function (enfant) {
        enfants.appendChild(rendreNoeud(enfant, false));
      });
      wrap.appendChild(enfants);
    }

    return wrap;
  }

  function _etat(texte, genre) {
    const etat = document.getElementById('at-etat');
    etat.textContent = texte;
    if (genre) etat.setAttribute('data-etat', genre); else etat.removeAttribute('data-etat');
  }

  async function enregistrer() {
    const nom = document.getElementById('at-nom').value.trim();
    if (!nom) { window.alert('Le gabarit a besoin d\'un nom.'); return; }
    const desc = document.getElementById('at-desc').value.trim();
    const body = { name: nom, description: desc || null, config: arbre };
    try {
      const url    = templateId ? '/api/arbo-templates/' + encodeURIComponent(templateId) : '/api/arbo-templates';
      const method = templateId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || ('HTTP ' + r.status)); }
      const sauve = await r.json();
      templateId = sauve.id;
      // L'URL suit l'id obtenu : recharger la page après un premier
      // enregistrement continue d'éditer LE MÊME gabarit, pas d'en recréer un.
      window.history.replaceState(null, '', 'arbo-canvas.html?id=' + encodeURIComponent(templateId));
      _etat('Enregistré', 'enregistre');
      window.setTimeout(function () { _etat(''); }, 2500);
    } catch (e) {
      _etat('Erreur : ' + e.message, 'erreur');
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (id) {
      templateId = id;
      try {
        const r = await fetch('/api/arbo-templates/' + encodeURIComponent(id));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        document.getElementById('at-nom').value  = data.name || '';
        document.getElementById('at-desc').value = data.description || '';
        arbre = (data.config && typeof data.config === 'object' && !Array.isArray(data.config))
          ? data.config : nouveauNoeud();
        if (!arbre.children) arbre.children = [];
      } catch (e) {
        window.alert('Chargement du gabarit impossible : ' + e.message);
        arbre = nouveauNoeud();
        templateId = null;
      }
    } else {
      arbre = nouveauNoeud();
    }

    rendreArbre();
    document.getElementById('at-save').addEventListener('click', enregistrer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
