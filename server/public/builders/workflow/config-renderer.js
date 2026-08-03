/**
 * config-renderer.js — Moteur de rendu déclaratif du panneau de config
 *
 * Au lieu d'écrire du HTML à la main pour chaque nœud (WFD : 10 400 lignes),
 * on DECRIT chaque champ par sa NATURE, et ce moteur le rend comme reflet du
 * modèle de config. Les champs ne stockent rien : ils lisent et écrivent dans
 * le modèle (config-model), qui est la source de vérité. Écrire EST sauver.
 *
 * Réactivité : quand une valeur change, le moteur re-rend les champs qui en
 * DEPENDENT (ex. l'opérateur « Between » fait apparaître un second champ). Le
 * rafraîchissement suit le modèle — pas besoin de sauver ni de créer une ligne.
 *
 * Un schéma est une liste de descripteurs de champ :
 *   { nature, chemin, label, ... options propres à la nature }
 * Un descripteur peut être conditionnel via `visibleSi(model)` ou dynamique via
 * une fonction, pour les champs dépendants.
 *
 * Natures de ce premier jet : 'texte', 'variable'. Les autres (choix,
 * opérateur, liste, nombre, booléen, endpoint, connexion) s'ajoutent ensuite,
 * chacune = une façon de projeter le modèle.
 */

const ConfigRenderer = (() => {

  // Décoration d'affichage d'une variable : {brut}. Le modèle stocke TOUJOURS
  // le brut ; les accolades ne sont qu'un habillage à l'affichage, retiré à la
  // saisie. C'est ce qui tue le bug des accolades incohérentes.
  function _brut(v) { return String(v == null ? '' : v).replace(/^\{+|\}+$/g, '').trim(); }
  function _decore(v) { const b = _brut(v); return b ? '{' + b + '}' : ''; }

  function _el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  // Sélecteur de variables (étape 4, Ordre de construction — builder-etat.md,
  // « Modèle de données ») : « montrer, pas déclarer ». Un run réel et un
  // contexte de test n'existent pas encore pour un BuilderFlow (aucun pont
  // d'exécution câblé) — cette version dérive donc ce qu'il y a à montrer de
  // deux sources qui EXISTENT déjà : ce que le catalogue sait qu'une façade
  // produit à coup sûr (`CAT.variablesDe`, vérifié contre les handlers), et
  // les vrais champs de métadonnées de l'org (ConfigSources) pour les étapes
  // qui aplatissent un résultat unique — marqués "si présent" plutôt que
  // certains, honnêteté que le catalogue seul ne peut pas garantir.
  function _optionsVariables(contexte) {
    const etapes = (contexte && contexte.etapesPrecedentes) || [];
    const CAT = (typeof window !== 'undefined') ? window.PivotCatalogIconik : null;
    const src = (typeof window !== 'undefined') ? window.ConfigSources : null;
    if (!CAT || !etapes.length) return [];
    const groupes = [];
    etapes.forEach(function (etape) {
      const items = (CAT.variablesDe(etape) || []).slice();
      if (CAT.aplatitMetadonnees(etape) && src && contexte.envSlug) {
        src.metadonneesChargees(contexte.envSlug).forEach(function (c) {
          items.push({ nom: c.name, aide: c.label, incertain: true });
        });
      }
      if (items.length) groupes.push({ label: etape.label || etape.id, items: _triParNom(items, 'nom') });
    });
    return groupes;
  }

  // Tri alphabétique des listes de ressources réelles (connexions, manifestes,
  // gabarits, mappings, vues, export locations, custom actions) avant de les
  // rendre en options — jamais l'ordre d'arrivée de l'API (updatedAt). Ne
  // s'applique qu'aux listes DYNAMIQUES ; les choix fixes d'un schéma (nature
  // `choix`) gardent l'ordre déclaré, qui peut être significatif.
  function _triParNom(liste, champ) {
    return (liste || []).slice().sort(function (a, b) {
      return String((a && a[champ]) || '').localeCompare(String((b && b[champ]) || ''), 'fr', { sensitivity: 'base' });
    });
  }

  // Label + aide optionnelle. L'aide est déclarée une fois dans le schéma et
  // suit le champ partout (panneau ici ; validation/doc plus tard, même
  // source) — cf. builder-etat.md, section Panneau : "l'aide existe
  // toujours". Un fragment, pas un élément : chaque nature fait
  // `wrap.appendChild(_champLabel(descr))` sans savoir combien de nœuds ça
  // ajoute, donc ça reste transparent pour les ~15 natures existantes.
  function _champLabel(descr) {
    const frag = document.createDocumentFragment();
    const l = _el('label', 'cfg-label');
    l.textContent = descr.label || descr.chemin;
    frag.appendChild(l);
    if (descr.aide) {
      const a = _el('p', 'cfg-aide');
      a.textContent = descr.aide;
      frag.appendChild(a);
    }
    return frag;
  }

  // Chemin du champ FRÈRE d'un descripteur (même parent, autre nom) — ex.
  // 'blocks.0.criteria.2.value' -> 'blocks.0.criteria.2.field'. Sert aux
  // natures qui doivent lire un champ voisin dans le même item de liste
  // (l'opérateur et la valeur dépendent tous deux du champ choisi).
  function _cheminFrere(chemin, autreNom) {
    return String(chemin).replace(/[^.]+$/, autreNom);
  }

  // Résout la métadonnée Iconik d'un nom de champ (depuis le cache synchrone
  // de ConfigSources). Retourne null si non résolue — champ non chargé,
  // pseudo-champ (ex. __collection__) ou environnement non choisi : dans tous
  // ces cas, les natures appelantes retombent sur un comportement générique.
  function _resoudreMetadonnee(nomChamp, envSlug) {
    if (!nomChamp) return null;
    const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
    if (!src) return null;
    const liste = src.metadonneesChargees(envSlug);
    for (let i = 0; i < liste.length; i++) {
      if (liste[i].name === nomChamp) return liste[i];
    }
    return null;
  }

  // ── Natures ────────────────────────────────────────────────────────────────
  // Chaque nature sait produire son contrôle, lié au modèle par chemin.

  const NATURES = {

    // Texte simple : la valeur brute, écrite telle quelle.
    texte: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const input = _el('input', 'cfg-input');
      input.type = 'text';
      if (descr.placeholder) input.placeholder = descr.placeholder;
      const v = model.lire(descr.chemin);
      input.value = v == null ? '' : v;
      input.addEventListener('input', function () {
        model.ecrire(descr.chemin, input.value);   // écrire = sauver
      });
      wrap.appendChild(input);
      return wrap;
    },

    // Variable : on affiche {brut}, on stocke brut. La décoration est purement
    // visuelle ; à la saisie, on nettoie les accolades éventuellement tapées.
    // Sélecteur accolé : choisir une entrée écrit sa valeur ET repeint (pour
    // que les champs qui en dépendent plus loin dans le panneau réagissent) —
    // le champ texte reste ouvert pour une expression écrite à la main
    // (`{now()}`, une combinaison...), le sélecteur n'est qu'un raccourci qui
    // évite de deviner un nom de mémoire.
    variable: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const ligne = _el('div', 'cfg-variable-ligne');

      const input = _el('input', 'cfg-input cfg-variable');
      input.type = 'text';
      input.placeholder = descr.placeholder || '{variable}';
      input.value = _decore(model.lire(descr.chemin));
      input.addEventListener('input', function () {
        model.ecrire(descr.chemin, _brut(input.value));
      });
      input.addEventListener('blur', function () {
        input.value = _decore(model.lire(descr.chemin));
      });
      ligne.appendChild(input);

      const groupes = _optionsVariables(contexte);
      if (groupes.length) {
        const sel = _el('select', 'cfg-input cfg-select cfg-variable-picker');
        const vide = document.createElement('option');
        vide.value = ''; vide.textContent = '— insert —';
        sel.appendChild(vide);
        groupes.forEach(function (grp) {
          const og = document.createElement('optgroup');
          og.label = grp.label;
          grp.items.forEach(function (it) {
            const o = document.createElement('option');
            o.value = it.nom;
            o.textContent = it.nom + (it.aide ? ' — ' + it.aide : '') + (it.incertain ? ' (si présent)' : '');
            og.appendChild(o);
          });
          sel.appendChild(og);
        });
        sel.addEventListener('change', function () {
          if (!sel.value) return;
          model.ecrire(descr.chemin, sel.value);
          input.value = _decore(sel.value);
          sel.value = '';
          if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
        });
        ligne.appendChild(sel);
      }

      wrap.appendChild(ligne);
      return wrap;
    },

    // Choix : une valeur parmi N (menu déroulant). Peut PILOTER d'autres champs
    // (descripteur marqué `reagit: true` -> son changement re-rend le panneau,
    // faisant apparaître/disparaître les champs dépendants via leur visibleSi).
    // `options` est soit un tableau statique, soit une fonction (model, contexte)
    // -> tableau — pour les choix dont l'éventail dépend d'un autre champ (ex.
    // les opérateurs valides dépendent du type de la métadonnée choisie).
    // `portabilite` (optionnel, par option) : note affichée sous le menu,
    // MISE À JOUR selon l'option choisie — jamais stockée dans le modèle (le
    // générateur la déclare, le Builder l'affiche, cf. builder-etat.md
    // « Décision — le marquage de portabilité est calculé »). Conçu le 23
    // juillet pour la gestion d'erreur, jamais câblé nulle part avant le 3
    // août (id_generator, Numeric vs Timestamp-based).
    choix: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const sel = _el('select', 'cfg-input cfg-select');
      const courant = model.lire(descr.chemin);
      const options = typeof descr.options === 'function' ? (descr.options(model, contexte, descr) || []) : (descr.options || []);
      const note = _el('p', 'cfg-aide cfg-portabilite');
      note.hidden = true;

      function _majNote(valeur) {
        const opt = options.find(function (o) { return (o && o.valeur != null ? o.valeur : o) === valeur; });
        const texte = opt && opt.portabilite;
        if (texte) { note.textContent = texte; note.hidden = false; }
        else { note.hidden = true; }
      }

      options.forEach(function (opt) {
        // Une option est soit une chaîne, soit { valeur, libelle, portabilite? }.
        const valeur = (opt && opt.valeur != null) ? opt.valeur : opt;
        const libelle = (opt && opt.libelle != null) ? opt.libelle : String(valeur);
        const o = document.createElement('option');
        o.value = valeur;
        o.textContent = libelle;
        if (valeur === courant) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        model.ecrire(descr.chemin, sel.value);
        _majNote(sel.value);
      });
      wrap.appendChild(sel);
      _majNote(courant);
      wrap.appendChild(note);
      return wrap;
    },

    // Opérateur : un choix spécialisé (equals, between, contains, is_empty…).
    // Identique à `choix` dans son rendu, mais sémantiquement distinct : c'est
    // TOUJOURS un pilote (ses champs de valeur dépendent de l'opérateur choisi,
    // déclarés par visibleSi dans le schéma). Le bug WFD Date->Between disparaît
    // structurellement : la visibilité des champs from/to EST une projection du
    // modèle, pas un effet de bord à déclencher.
    operateur: function (descr, model, contexte) {
      // Réutilise le rendu de `choix` : même contrôle, marqueur de nature à part.
      const champ = NATURES.choix(descr, model, contexte);
      champ.classList.add('cfg-operateur');
      return champ;
    },

    // Liste : un sous-schéma RÉPÉTÉ. Chaque item est rendu par `descr.itemSchema`
    // avec ses chemins préfixés (conditions.0.op, conditions.1.op…). Boutons
    // « + » (ajouter) et « ✕ » par ligne. add/remove écrivent dans le modèle
    // (structurant -> re-rendu). Compose les autres natures à l'intérieur.
    liste: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field cfg-liste');
      wrap.appendChild(_champLabel(descr));

      const items = model.lire(descr.chemin);
      const n = Array.isArray(items) ? items.length : 0;

      for (let i = 0; i < n; i++) {
        const ligne = _el('div', 'cfg-liste-ligne');
        const corps = _el('div', 'cfg-liste-corps');
        (descr.itemSchema || []).forEach(function (sousDescr) {
          const projete = Object.assign({}, sousDescr, {
            chemin: descr.chemin + '.' + i + '.' + sousDescr.chemin
          });
          // visibleSi de l'item raisonne en chemins RELATIFS à l'item.
          if (typeof sousDescr.visibleSi === 'function') {
            projete.visibleSi = function (m) {
              return sousDescr.visibleSi({
                lire: function (c) { return m.lire(descr.chemin + '.' + i + '.' + c); }
              });
            };
          }
          if (!_visible(projete, model)) return;
          const fab = NATURES[projete.nature];
          if (fab) corps.appendChild(fab(projete, model, contexte));
        });
        ligne.appendChild(corps);

        const retirer = _el('button', 'cfg-liste-suppr');
        retirer.type = 'button';
        retirer.textContent = '✕';
        retirer.title = 'Remove';
        (function (idx) {
          retirer.addEventListener('click', function () { model.retirer(descr.chemin + '.' + idx); });
        })(i);
        ligne.appendChild(retirer);
        wrap.appendChild(ligne);
      }

      const ajouter = _el('button', 'cfg-liste-ajout');
      ajouter.type = 'button';
      ajouter.textContent = '+ ' + (descr.ajoutLabel || 'Add');
      ajouter.addEventListener('click', function () {
        const arr = model.lire(descr.chemin);
        const idx = Array.isArray(arr) ? arr.length : 0;
        // itemDefaut peut être une fonction (idx, arr) -> objet, pour les cas
        // où une valeur dépend de la position (ex. aps_search : `id` de bloc,
        // requis pour que parentBlock/returnBlock puissent le référencer —
        // un objet statique ne peut jamais fournir "l'index au moment de
        // l'ajout").
        const val = typeof descr.itemDefaut === 'function'
          ? descr.itemDefaut(idx, arr || [])
          : (descr.itemDefaut ? JSON.parse(JSON.stringify(descr.itemDefaut)) : {});
        model.ecrire(descr.chemin + '.' + idx, val);
      });
      wrap.appendChild(ajouter);
      return wrap;
    },

    // Nombre : input numérique. Piège connu `||` vs `??` : zéro est une valeur
    // valide, on ne la remplace pas par du vide. Stocke un Number (ou '' si vide).
    nombre: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const input = _el('input', 'cfg-input cfg-number');
      input.type = 'number';
      if (descr.min != null) input.min = descr.min;
      if (descr.max != null) input.max = descr.max;
      if (descr.pas != null) input.step = descr.pas;
      if (descr.placeholder) input.placeholder = descr.placeholder;
      const v = model.lire(descr.chemin);
      input.value = (v == null || v === '') ? '' : v;   // '' ≠ 0 : on distingue
      input.addEventListener('input', function () {
        // Champ vide -> '' (absence) ; sinon Number (0 reste 0).
        model.ecrire(descr.chemin, input.value === '' ? '' : Number(input.value));
      });
      wrap.appendChild(input);
      return wrap;
    },

    // Booléen : case à cocher. Peut PILOTER d'autres champs (marqué reagit dans
    // le schéma) — comme un choix, sa valeur commande la visibilité d'autres.
    booleen: function (descr, model) {
      const wrap = _el('div', 'cfg-field cfg-field-inline');
      const lab = _el('label', 'cfg-check');
      const box = _el('input', 'cfg-checkbox');
      box.type = 'checkbox';
      box.checked = !!model.lire(descr.chemin);
      box.addEventListener('change', function () {
        model.ecrire(descr.chemin, box.checked);
      });
      const txt = document.createElement('span');
      txt.textContent = descr.label || descr.chemin;
      lab.appendChild(box);
      lab.appendChild(txt);
      wrap.appendChild(lab);
      return wrap;
    },

    // Endpoint : méthode HTTP (choix) + URL (texte), côte à côte. Deux valeurs
    // distinctes dans le modèle : `chemin.method` et `chemin.url`.
    endpoint: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const ligne = _el('div', 'cfg-endpoint');

      const sel = _el('select', 'cfg-input cfg-select cfg-method');
      const methodes = descr.methodes || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      const mCourant = model.lire(descr.chemin + '.method') || methodes[0];
      methodes.forEach(function (mth) {
        const o = document.createElement('option');
        o.value = mth; o.textContent = mth;
        if (mth === mCourant) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { model.ecrire(descr.chemin + '.method', sel.value); });

      const url = _el('input', 'cfg-input cfg-url');
      url.type = 'text';
      url.placeholder = descr.placeholder || 'https://… or {baseUrl}/path';
      const uCourant = model.lire(descr.chemin + '.url');
      url.value = uCourant == null ? '' : uCourant;
      url.addEventListener('input', function () { model.ecrire(descr.chemin + '.url', url.value); });

      ligne.appendChild(sel);
      ligne.appendChild(url);
      wrap.appendChild(ligne);
      return wrap;
    },

    // Connexion : sélection d'une connexion RÉELLE d'Administration (async, via
    // ConfigSources, avec cache). On stocke l'id choisi. Une BILLE indique l'état
    // de connectivité, testé automatiquement au choix :
    //   vert  = testé, répond (ok pour bosser)
    //   bleu  = connectée (choisie) mais pas encore testée
    //   rouge = testé, échoue (auth rejetée ou serveur absent)
    //   gris  = inactive OU non testable par nature (ex. S3, pas de handshake
    //           HTTP simple possible pour une connexion signée)
    //
    // Corrigé le 3 août : ces deux gris se ressemblaient au point qu'une vraie
    // connexion S3 active semblait "ne pas marcher" (retour utilisateur en
    // testant) — alors que "Actif" dans l'écran Connexions (isActive, une
    // case cochée à la main) ne mentait pas du tout, il répond juste à une
    // question différente du test en direct. Un texte TOUJOURS VISIBLE
    // (pas juste une infobulle au survol) lève l'ambiguïté sans qu'il faille
    // deviner ou survoler.
    connexion: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const ligne = _el('div', 'cfg-connexion');
      const bille = _el('span', 'cfg-bille');
      bille.setAttribute('data-etat', 'vide');
      const etatTexte = _el('span', 'cfg-connexion-etat');
      etatTexte.hidden = true;
      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      ligne.appendChild(bille);
      ligne.appendChild(sel);
      ligne.appendChild(etatTexte);
      wrap.appendChild(ligne);

      function _afficherEtatTexte(texte) {
        if (!texte) { etatTexte.hidden = true; return; }
        etatTexte.textContent = texte;
        etatTexte.hidden = false;
      }

      function _tester(id) {
        if (!id) { bille.setAttribute('data-etat', 'vide'); _afficherEtatTexte(''); return; }
        bille.setAttribute('data-etat', 'test');   // en cours
        _afficherEtatTexte('');
        fetch('/api/connexions/' + encodeURIComponent(id) + '/test', { method: 'POST' })
          .then(function (r) { return r.ok ? r.json() : { ok: false, state: 'error' }; })
          .then(function (res) {
            // Map état serveur -> couleur de bille + texte visible pour les
            // deux cas qui se ressemblent en gris.
            //   vert   = ok (200, token valide, API joignable)
            //   orange = auth (API joignable mais token invalide/refusé)
            //   rouge  = injoignable / erreur serveur
            //   gris   = inactive / non testable (S3)
            let etat = 'rouge';
            if (res.state === 'ok') etat = 'vert';
            else if (res.state === 'auth') etat = 'orange';
            else if (res.state === 'inactive') { etat = 'gris'; _afficherEtatTexte('inactive'); }
            else if (res.ok === null || res.state === 'untestable') { etat = 'gris'; _afficherEtatTexte('not tested — this type has no live check'); }
            bille.setAttribute('data-etat', etat);
            if (res.message) bille.title = res.message;   // détail complet, en plus du texte visible
          })
          .catch(function () { bille.setAttribute('data-etat', 'rouge'); });
      }

      const courant = model.lire(descr.chemin);
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src) {
        src.connexions().then(function (list) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select a connection —';
          sel.appendChild(vide);
          _triParNom(list.filter(function (c) {
            if (descr.filtreType && c.type !== descr.filtreType) return false;
            if (descr.filtreDirection && c.direction !== descr.filtreDirection) return false;
            return true;
          }), 'name').forEach(function (c) {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.name + (c.type ? ' · ' + c.type : '');
            if (c.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            model.ecrire(descr.chemin, sel.value);
            _tester(sel.value);   // test AUTOMATIQUE au choix
          });
          // Une connexion déjà choisie : bille bleue (pas encore testée), puis test.
          if (courant) { bille.setAttribute('data-etat', 'connecte'); _tester(courant); }
        });
      }
      return wrap;
    },

    // Manifeste : sélection d'un manifeste de livraison RÉEL (ressource d'org,
    // via ConfigSources). On stocke l'id choisi. Pas de test (ce n'est pas une
    // connexion) — juste le choix, avec le niveau et le nombre d'essences en
    // repère.
    manifeste: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const courant = model.lire(descr.chemin);
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src) {
        src.manifests().then(function (list) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select a manifest —';
          sel.appendChild(vide);
          _triParNom(list, 'name').forEach(function (m) {
            const o = document.createElement('option');
            o.value = m.id;
            const niveau = m.niveau && m.niveau !== '*' ? ' · ' + m.niveau : '';
            o.textContent = m.name + niveau + ' (' + m.nbEssences + ')';
            if (m.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            model.ecrire(descr.chemin, sel.value);
          });
        });
      }
      return wrap;
    },

    // Gabarit d'arborescence : sélection d'un modèle RÉEL (ressource d'org,
    // via ConfigSources), même mécanique que 'manifeste'. On stocke l'id
    // choisi — le détail (les niveaux) reste sur le serveur, résolu à
    // l'exécution par create_tree(), jamais recopié dans la config du nœud.
    gabarit: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const courant = model.lire(descr.chemin);
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src) {
        src.arboTemplates().then(function (list) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select a tree template —';
          sel.appendChild(vide);
          _triParNom(list, 'name').forEach(function (t) {
            const o = document.createElement('option');
            o.value = t.id;
            o.textContent = t.name + (t.description ? ' · ' + t.description : '');
            if (t.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            model.ecrire(descr.chemin, sel.value);
          });
        });
      }
      return wrap;
    },

    // Mapping : sélection d'une table de correspondance RÉELLE (ressource
    // d'org, via ConfigSources), même mécanique que 'manifeste'/'gabarit'. On
    // stocke l'id choisi ; les rows elles-mêmes se résolvent en `lkRows` au
    // moment de la conversion pivot → WFD (pivot-to-wfd.js), jamais recopiées
    // ici. Pas encore d'écran pour CRÉER/ÉDITER les rows d'un mapping
    // (admin/ressources ne fait qu'afficher aujourd'hui) — un sélecteur vide
    // est donc attendu tant que ce chantier n'est pas fait ; signalé, pas
    // masqué.
    mapping: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const courant = model.lire(descr.chemin);
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src) {
        src.mappings().then(function (list) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select a mapping —';
          sel.appendChild(vide);
          _triParNom(list, 'name').forEach(function (m) {
            const o = document.createElement('option');
            o.value = m.id;
            o.textContent = m.name + ' (' + m.nbEntrees + ')';
            if (m.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            model.ecrire(descr.chemin, sel.value);
          });
        });
      }
      return wrap;
    },

    // Métadonnée : nom d'un champ Iconik. Reste un champ TEXTE — un champ
    // fermé casserait les pseudo-champs réels observés en production
    // (__collection__, media_type…) qui ne sont pas des IkonField. Un
    // <datalist> propose des suggestions en complément, jamais en contrainte.
    // Par défaut, toutes les métadonnées de l'environnement. Si `descr.vuePour`
    // est fourni et résout une vue choisie ailleurs dans le modèle (ex.
    // update_meta : `key` suggéré par la vue de `mdViewId`), les suggestions se
    // restreignent aux champs RÉELS de cette vue (view_fields, vérifié en
    // direct — une vue ne renvoie que ses propres champs, jamais l'exhaustif).
    // Le choix du champ ne repeint PAS à chaque frappe (perte de focus,
    // cf. 9c434f2) : seul le `blur` — la frappe terminée — redessine le
    // panneau, pour que l'opérateur et la valeur reflètent le type résolu.
    metadonnee: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const dlId = 'cfg-dl-' + Math.random().toString(36).slice(2);
      const dl = _el('datalist');
      dl.id = dlId;

      const input = _el('input', 'cfg-input cfg-metadonnee');
      input.type = 'text';
      input.setAttribute('list', dlId);
      if (descr.placeholder) input.placeholder = descr.placeholder;
      const v = model.lire(descr.chemin);
      input.value = v == null ? '' : v;
      input.addEventListener('input', function () {
        model.ecrire(descr.chemin, input.value);
      });
      input.addEventListener('blur', function () {
        if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
      });

      const envSlug = contexte && contexte.envSlug;
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      function _peuplerDatalist(liste) {
        while (dl.firstChild) dl.removeChild(dl.firstChild);
        _triParNom(liste, 'name').forEach(function (m) {
          const o = document.createElement('option');
          o.value = m.name;
          o.label = m.label && m.label !== m.name ? m.label : '';
          dl.appendChild(o);
        });
      }
      const vueId = typeof descr.vuePour === 'function' ? descr.vuePour(model) : null;
      if (src && envSlug && vueId) {
        // Restreint aux champs de la vue choisie — lecture synchrone du cache,
        // puis complétée une fois vuesMetadonnees() abouti si pas déjà chargé.
        function _champsVue() {
          return src.champsDeVue(envSlug, vueId).map(function (n) { return { name: n, label: null }; });
        }
        _peuplerDatalist(_champsVue());
        src.vuesMetadonnees(envSlug).then(function () { _peuplerDatalist(_champsVue()); });
      } else if (src && envSlug) {
        _peuplerDatalist(src.metadonneesChargees(envSlug));   // ce qui est déjà en cache
        src.metadonnees(envSlug).then(_peuplerDatalist);       // complète une fois chargé
      }

      wrap.appendChild(input);
      wrap.appendChild(dl);
      return wrap;
    },

    // Valeur typée : le contrôle de saisie s'adapte au type RÉEL de la
    // métadonnée choisie dans le champ FRÈRE (même item de liste — nommé
    // `field` par défaut, ex. aps_search ; `descr.champFrere` permet de
    // pointer un autre nom, ex. `key` pour update_meta, dont le moteur WFD
    // lit littéralement `f.key`). Vérifié sur l'environnement QA (159
    // champs) : 'Dropdown' est le nom réel des listes à choix (PAS 'Select'),
    // 'Yes/No' pour un booléen. Sinon texte (type inconnu, pseudo-champ, ou
    // environnement non résolu — fail-safe : jamais bloquant).
    valeurTypee: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const envSlug = contexte && contexte.envSlug;
      const cheminChamp = _cheminFrere(descr.chemin, descr.champFrere || 'field');
      const nomChamp = model.lire(cheminChamp);
      const md = _resoudreMetadonnee(nomChamp, envSlug);
      const uiType = md ? md.uiType : '';
      const estDropdown = uiType === 'Dropdown' || uiType === 'drop_down';

      let controle;
      if (uiType === 'Yes/No') {
        controle = _el('select', 'cfg-input cfg-select');
        const courant = model.lire(descr.chemin);
        [{ valeur: '', libelle: '—' }, { valeur: 'true', libelle: 'True' }, { valeur: 'false', libelle: 'False' }]
          .forEach(function (opt) {
            const o = document.createElement('option');
            o.value = opt.valeur; o.textContent = opt.libelle;
            if (opt.valeur === courant) o.selected = true;
            controle.appendChild(o);
          });
        controle.addEventListener('change', function () { model.ecrire(descr.chemin, controle.value); });
      } else if (estDropdown && md.valeurs.length) {
        controle = _el('select', 'cfg-input cfg-select');
        const courant = model.lire(descr.chemin);
        const vide = document.createElement('option');
        vide.value = ''; vide.textContent = '—';
        controle.appendChild(vide);
        md.valeurs.forEach(function (v) {
          const o = document.createElement('option');
          o.value = v; o.textContent = v;
          if (v === courant) o.selected = true;
          controle.appendChild(o);
        });
        controle.addEventListener('change', function () { model.ecrire(descr.chemin, controle.value); });
      } else if (uiType === 'Date') {
        controle = _el('input', 'cfg-input cfg-date');
        controle.type = 'date';
        const courant = model.lire(descr.chemin);
        controle.value = courant == null ? '' : courant;
        controle.addEventListener('input', function () { model.ecrire(descr.chemin, controle.value); });
      } else {
        controle = _el('input', 'cfg-input');
        controle.type = 'text';
        if (descr.placeholder) controle.placeholder = descr.placeholder;
        const courant = model.lire(descr.chemin);
        controle.value = courant == null ? '' : courant;
        controle.addEventListener('input', function () { model.ecrire(descr.chemin, controle.value); });
      }

      wrap.appendChild(controle);
      return wrap;
    },

    // Vue de métadonnées : sélection RÉELLE (ConfigSources.vuesMetadonnees),
    // TOUTES les vues de l'environnement, sans filtre par type d'objet — une
    // vue peut exister et être valide sans appartenir à aucune catégorie
    // (vérifié en direct sur un cas réel), donc filtrer par catégorie/type
    // cacherait des vues bien réelles. Sans environnement : liste vide,
    // jamais bloquant.
    vueMetadonnee: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const envSlug = contexte && contexte.envSlug;
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src && envSlug) {
        src.vuesMetadonnees(envSlug).then(function (liste) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— no view —';
          sel.appendChild(vide);
          const courant = model.lire(descr.chemin);
          _triParNom(liste, 'nom').forEach(function (v) {
            const o = document.createElement('option');
            o.value = v.id; o.textContent = v.nom;
            if (v.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () { model.ecrire(descr.chemin, sel.value); });
        });
      }
      return wrap;
    },

    // Export Location : sélection RÉELLE (ConfigSources.exportLocations) —
    // la cible d'un nœud `action` en mode export_location_trigger. Même
    // schéma de rendu que vueMetadonnee (async, cache, pas de test).
    exportLocation: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const envSlug = contexte && contexte.envSlug;
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src && envSlug) {
        src.exportLocations(envSlug).then(function (liste) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select an export location —';
          sel.appendChild(vide);
          const courant = model.lire(descr.chemin);
          _triParNom(liste, 'nom').forEach(function (v) {
            const o = document.createElement('option');
            o.value = v.id; o.textContent = v.nom;
            if (v.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () { model.ecrire(descr.chemin, sel.value); });
        });
      }
      return wrap;
    },

    // Custom Action : sélection RÉELLE (ConfigSources.customActions). Si
    // `descr.contextVersChemin` est fourni, le `context` de l'action choisie
    // (ASSET/COLLECTION/SEGMENT, porté par l'action elle-même côté Iconik)
    // est automatiquement écrit dans ce chemin — reproduit l'auto-remplissage
    // déjà présent dans l'ancien designer WFD (wfd-config-panel.js), pas une
    // invention : c'est Iconik qui associe une action à un type d'objet fixe.
    customAction: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const sel = _el('select', 'cfg-input cfg-select');
      const attente = document.createElement('option');
      attente.textContent = 'Loading…'; attente.disabled = true; attente.selected = true;
      sel.appendChild(attente);
      wrap.appendChild(sel);

      const envSlug = contexte && contexte.envSlug;
      const src = (typeof window !== 'undefined' && window.ConfigSources) ? window.ConfigSources : null;
      if (src && envSlug) {
        src.customActions(envSlug).then(function (liste) {
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          const vide = document.createElement('option');
          vide.value = ''; vide.textContent = descr.placeholder || '— select a custom action —';
          sel.appendChild(vide);
          const courant = model.lire(descr.chemin);
          _triParNom(liste, 'nom').forEach(function (v) {
            const o = document.createElement('option');
            o.value = v.id;
            o.textContent = v.nom + (v.disabled ? ' (disabled)' : '');
            if (v.id === courant) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            model.ecrire(descr.chemin, sel.value);
            if (descr.contextVersChemin) {
              const item = (liste || []).find(function (x) { return x.id === sel.value; });
              if (item && item.context) model.ecrire(descr.contextVersChemin, item.context);
            }
            if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
          });
        });
      }
      return wrap;
    },

    // Texte avec repaint au BLUR (pas à la frappe, même raison que
    // `metadonnee` : pas de perte de focus) — pour les champs dont dépend un
    // `apercu` ailleurs dans le panneau (ex. le slug d'un trigger -> l'URL de
    // routage affichée juste en dessous).
    texteRepeint: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const input = _el('input', 'cfg-input');
      input.type = 'text';
      if (descr.placeholder) input.placeholder = descr.placeholder;
      const v = model.lire(descr.chemin);
      input.value = v == null ? '' : v;
      input.addEventListener('input', function () { model.ecrire(descr.chemin, input.value); });
      input.addEventListener('blur', function () {
        if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
      });
      wrap.appendChild(input);
      return wrap;
    },

    // Choix ou texte : un menu de préréglages courants + une échappatoire
    // texte libre ("Personnalisé…"), repeint au blur — même mécanique que
    // `texteRepeint`. Repris tel quel d'un widget de WFD (workflow_history,
    // champ "Statut") : rationaliser le catalogue ne veut pas dire perdre les
    // facilités concrètes de l'ancien outil. Un seul champ du modèle au final
    // (`descr.chemin`) — le préréglage choisi ET le texte personnalisé
    // écrivent la même valeur, jamais un état transitoire séparé à
    // resynchroniser (contrairement à WFD, qui gardait le préréglage choisi
    // hors du modèle et ne réconciliait qu'à la sauvegarde).
    choixOuTexte: function (descr, model, contexte) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));

      const CUSTOM = '__custom__';
      const options = descr.options || [];
      const courant = model.lire(descr.chemin);
      const estPreset = options.some(function (o) { return o.valeur === (courant == null ? '' : courant); });

      const sel = _el('select', 'cfg-input cfg-select');
      options.forEach(function (opt) {
        const o = document.createElement('option');
        o.value = opt.valeur; o.textContent = opt.libelle;
        if (estPreset && opt.valeur === courant) o.selected = true;
        sel.appendChild(o);
      });
      const optCustom = document.createElement('option');
      optCustom.value = CUSTOM;
      optCustom.textContent = descr.customLibelle || '✏️ Personnalisé…';
      if (!estPreset) optCustom.selected = true;
      sel.appendChild(optCustom);

      const input2 = _el('input', 'cfg-input');
      input2.type = 'text';
      if (descr.placeholder) input2.placeholder = descr.placeholder;
      input2.value = estPreset ? '' : (courant == null ? '' : courant);
      if (estPreset) input2.classList.add('cfg-hidden');

      sel.addEventListener('change', function () {
        if (sel.value === CUSTOM) {
          input2.classList.remove('cfg-hidden');
          input2.value = '';
          input2.focus();
          return;   // n'écrit rien : le texte personnalisé écrira à la frappe
        }
        input2.classList.add('cfg-hidden');
        model.ecrire(descr.chemin, sel.value);
        if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
      });
      input2.addEventListener('input', function () { model.ecrire(descr.chemin, input2.value); });
      input2.addEventListener('blur', function () {
        if (contexte && typeof contexte._repeindre === 'function') contexte._repeindre();
      });

      wrap.appendChild(sel);
      wrap.appendChild(input2);
      return wrap;
    },

    // Aperçu : texte calculé en LECTURE SEULE, projection d'autres champs du
    // modèle (`descr.calcule(model)`) — n'écrit jamais. Ex. l'URL de routage
    // complète d'un trigger, reconstruite depuis son slug.
    apercu: function (descr, model) {
      const wrap = _el('div', 'cfg-field cfg-field-inline');
      wrap.appendChild(_champLabel(descr));
      const val = _el('span', 'cfg-apercu');
      val.textContent = (typeof descr.calcule === 'function' && descr.calcule(model)) || '—';
      wrap.appendChild(val);
      return wrap;
    }
  };

  // Un descripteur est-il visible dans l'état courant du modèle ?
  function _visible(descr, model) {
    if (typeof descr.visibleSi === 'function') return !!descr.visibleSi(model);
    return true;
  }

  /**
   * Rend un schéma dans un hôte. Le re-rendu complet ne se déclenche QUE pour
   * les changements structurants (un champ dont d'autres dépendent, marqué
   * `reagit: true` dans son descripteur) — sinon re-peindre à chaque frappe
   * détruirait le champ en cours de saisie et ferait perdre le focus. Les
   * champs simples écrivent dans le modèle sans re-peindre.
   */
  function rendre(hote, schema, model, contexte) {
    contexte = contexte || {};
    // Détecte si un chemin modifié doit re-peindre le panneau. RÉCURSIF : une
    // liste peut contenir une autre liste (ex. blocks[].criteria[] de
    // aps_search) — le mécanisme doit descendre dans itemSchema à N niveaux,
    // pas seulement au premier. Sans ça, ajouter/retirer une ligne dans une
    // liste imbriquée écrit bien la donnée (le modèle est à jour) mais ne
    // redessine jamais : "Add criterion" semblait ne rien faire.
    //
    // Un champ texte ordinaire d'un item NE re-peint PAS (sinon on perdrait le
    // focus à chaque frappe) ; l'ajout/retrait d'une ligne, ou un champ pilote
    // (reagit / operateur), re-peint TOUJOURS, à n'importe quelle profondeur.
    function _reagitAuChemin(schemaNiveau, segments) {
      if (!segments.length) return true;   // changement du conteneur lui-même
      const tete = segments[0];
      for (let i = 0; i < (schemaNiveau || []).length; i++) {
        const d = schemaNiveau[i];
        if (d.chemin !== tete) continue;
        const reste = segments.slice(1);
        if (!reste.length) {
          // Le champ lui-même a changé (rare : écriture directe sur un conteneur).
          return !!(d.reagit || d.nature === 'operateur' || d.nature === 'liste');
        }
        if (d.nature === 'liste') {
          const apresIndex = reste.slice(1);   // reste[0] = l'indice numérique de la ligne
          if (!apresIndex.length) return true;   // ajout/retrait de la ligne entière
          return _reagitAuChemin(d.itemSchema, apresIndex);   // descend dans l'item
        }
        return !!(d.reagit || d.nature === 'operateur');
      }
      return false;
    }

    function _estStructurant(chemin) {
      if (chemin == null) return true;
      return _reagitAuChemin(schema, String(chemin).split('.'));
    }

    function _peindre() {
      while (hote.firstChild) hote.removeChild(hote.firstChild);
      (schema || []).forEach(function (descr) {
        if (!_visible(descr, model)) return;
        const fab = NATURES[descr.nature];
        if (!fab) return;   // nature inconnue : ignorée (extensible)
        hote.appendChild(fab(descr, model, contexte));
      });
    }
    // Exposé aux natures qui ont besoin de redessiner sur un évènement qui
    // n'est PAS une écriture modèle structurante (ex. `metadonnee` : le champ
    // reste en texte libre à la frappe, mais son `blur` doit rafraîchir
    // l'opérateur/la valeur dépendants sans attendre un autre changement).
    contexte._repeindre = _peindre;
    _peindre();

    // Re-peindre seulement sur changement d'un chemin structurant. C'est ce qui
    // rafraîchit les champs dépendants (Date -> Between) sans casser la saisie
    // d'un champ texte ordinaire.
    const off = model.onChange(function (chemin) {
      if (_estStructurant(chemin)) _peindre();
    });
    return off;
  }

  return { rendre, NATURES, _brut: _brut, _decore: _decore };

})();

if (typeof window !== 'undefined') window.ConfigRenderer = ConfigRenderer;
if (typeof module !== 'undefined') module.exports = ConfigRenderer;
