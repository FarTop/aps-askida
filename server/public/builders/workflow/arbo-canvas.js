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

  // Vues de métadonnées réelles de l'environnement choisi dans le sélecteur
  // "Vues depuis" — jamais enregistrées avec le gabarit (ArboTemplate n'est
  // pas scopé par environnement), juste de quoi peupler le champ "Vue
  // (override)" de chaque niveau SANS aller-retour manuel vers Iconik. Vide
  // tant qu'aucun environnement n'est choisi ou que le chargement n'a pas
  // abouti — le champ retombe alors sur une liste vide, jamais bloquant.
  let vuesDisponibles = [];

  function nouveauNoeud() {
    return { name: '', collectionType: '', generateId: false, numberField: '', numberPad: 2, metadataViewId: '', children: [] };
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

    // Un <input type="number"> ne peut PAS afficher "01" — le navigateur
    // efface le zéro devant dès qu'on tape ou qu'on quitte le champ, ce
    // n'est pas un bug de ce fichier, c'est le fonctionnement natif du
    // contrôle. Le champ attend un COMPTE de chiffres (2 -> "01","02"…), pas
    // le motif lui-même — d'où l'aperçu à côté (champNumApercu), qui montre
    // tout de suite le résultat réel plutôt que de laisser deviner.
    const champNumPad = document.createElement('input');
    champNumPad.className = 'at-champ-numpad';
    champNumPad.type = 'number';
    champNumPad.min = '0';
    champNumPad.max = '6';
    champNumPad.placeholder = 'chiffres';
    champNumPad.title = 'Combien de chiffres au total (2 -> 01, 02… 3 -> 001, 002…)';
    champNumPad.value = (noeud.numberPad === undefined || noeud.numberPad === null || noeud.numberPad === '') ? '2' : noeud.numberPad;
    champNumWrap.appendChild(champNumPad);

    const champNumApercu = document.createElement('span');
    champNumApercu.className = 'at-champ-numapercu';
    function _majApercuNum() {
      const pad = parseInt(champNumPad.value, 10);
      const n = !isNaN(pad) && pad > 0 ? String(1).padStart(pad, '0') : '1';
      champNumApercu.textContent = '→ ' + n;
    }
    _majApercuNum();
    champNumWrap.appendChild(champNumApercu);

    champNumPad.addEventListener('input', function () {
      noeud.numberPad = champNumPad.value === '' ? '' : parseInt(champNumPad.value, 10);
      _majApercuNum();
    });

    cbNum.addEventListener('change', function () {
      badgeNum.setAttribute('data-actif', cbNum.checked ? '1' : '0');
      champNumWrap.hidden = !cbNum.checked;
      if (!cbNum.checked) { noeud.numberField = ''; }
      else if (!noeud.numberPad && noeud.numberPad !== 0) { noeud.numberPad = 2; champNumPad.value = '2'; _majApercuNum(); }
    });

    corps.appendChild(champNumWrap);

    // Vue de métadonnées propre à CE niveau — surcharge la vue par défaut de
    // l'étape Create Tree. Nécessaire dès que ce niveau n'a pas le même type
    // que la racine du gabarit (ex. le placeholder Saison imbriqué dans
    // Arborescence Serie a besoin de VUE|SAISON|COLLECTION pour que
    // NumeroSaison s'écrive — la vue Série ne connaît pas ce champ). Vide =
    // hérite de la vue de l'étape, comme avant ce champ.
    //
    // Sélection RÉELLE (vuesDisponibles, peuplée depuis le sélecteur "Vues
    // depuis" en tête de page), pas un id à retaper à la main — impossible de
    // filtrer par type d'objet (le lien vue<->catégorie<->type est facultatif
    // côté Iconik, cf. config-sources.js), donc la liste COMPLÈTE plutôt
    // qu'un filtre qui cacherait des vues bien réelles.
    const champVue = document.createElement('select');
    champVue.className = 'at-champ-vue';
    const optionVide = document.createElement('option');
    optionVide.value = '';
    optionVide.textContent = vuesDisponibles.length ? '— hérite de l\'étape —' : '— choisir un environnement ci-dessus —';
    champVue.appendChild(optionVide);
    vuesDisponibles.forEach(function (v) {
      const o = document.createElement('option');
      o.value = v.id; o.textContent = v.nom;
      if (v.id === noeud.metadataViewId) o.selected = true;
      champVue.appendChild(o);
    });
    // La vue déjà enregistrée sur le nœud peut ne pas exister dans la liste
    // courante (environnement pas encore choisi, ou vue d'un autre environnement) —
    // on ne la perd pas silencieusement : une option la représente quand même.
    if (noeud.metadataViewId && !vuesDisponibles.some(function (v) { return v.id === noeud.metadataViewId; })) {
      const o = document.createElement('option');
      o.value = noeud.metadataViewId; o.textContent = noeud.metadataViewId + ' (hors liste)';
      o.selected = true;
      champVue.appendChild(o);
    }
    champVue.addEventListener('change', function () { noeud.metadataViewId = champVue.value; });
    corps.appendChild(champVue);

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

  // Dernier environnement choisi pour prévisualiser les vues — préférence
  // d'affichage légère (pas de donnée métier), autorisée en localStorage
  // (CLAUDE.md, section Sync/versioning : localStorage réservé à l'état de
  // session UI).
  const CLE_ENV = 'aps-arbo-canvas-env-slug';

  async function _peuplerEnvironnements() {
    const sel = document.getElementById('at-env-select');
    if (!sel) return;
    let liste = [];
    try {
      const r = await fetch('/api/environments');
      liste = r.ok ? await r.json() : [];
    } catch (e) { /* liste vide, non bloquant */ }
    liste = (Array.isArray(liste) ? liste : []).slice()
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }); });

    liste.forEach(function (e) {
      const o = document.createElement('option');
      o.value = e.slug; o.textContent = e.name;
      sel.appendChild(o);
    });

    const memorise = window.localStorage.getItem(CLE_ENV);
    if (memorise && liste.some(function (e) { return e.slug === memorise; })) {
      sel.value = memorise;
      _chargerVues(memorise);
    }

    sel.addEventListener('change', function () {
      window.localStorage.setItem(CLE_ENV, sel.value);
      _chargerVues(sel.value);
    });
  }

  function _chargerVues(envSlug) {
    if (!envSlug || !window.ConfigSources) { vuesDisponibles = []; rendreArbre(); return; }
    window.ConfigSources.vuesMetadonnees(envSlug).then(function (liste) {
      vuesDisponibles = Array.isArray(liste) ? liste : [];
      rendreArbre();
    }).catch(function () { vuesDisponibles = []; rendreArbre(); });
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
    _peuplerEnvironnements();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
