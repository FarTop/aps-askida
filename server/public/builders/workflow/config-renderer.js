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

  function _champLabel(descr) {
    const l = _el('label', 'cfg-label');
    l.textContent = descr.label || descr.chemin;
    return l;
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
    variable: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
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
      wrap.appendChild(input);
      return wrap;
    },

    // Choix : une valeur parmi N (menu déroulant). Peut PILOTER d'autres champs
    // (descripteur marqué `reagit: true` -> son changement re-rend le panneau,
    // faisant apparaître/disparaître les champs dépendants via leur visibleSi).
    choix: function (descr, model) {
      const wrap = _el('div', 'cfg-field');
      wrap.appendChild(_champLabel(descr));
      const sel = _el('select', 'cfg-input cfg-select');
      const courant = model.lire(descr.chemin);
      (descr.options || []).forEach(function (opt) {
        // Une option est soit une chaîne, soit { valeur, libelle }.
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
      });
      wrap.appendChild(sel);
      return wrap;
    },

    // Opérateur : un choix spécialisé (equals, between, contains, is_empty…).
    // Identique à `choix` dans son rendu, mais sémantiquement distinct : c'est
    // TOUJOURS un pilote (ses champs de valeur dépendent de l'opérateur choisi,
    // déclarés par visibleSi dans le schéma). Le bug WFD Date->Between disparaît
    // structurellement : la visibilité des champs from/to EST une projection du
    // modèle, pas un effet de bord à déclencher.
    operateur: function (descr, model) {
      // Réutilise le rendu de `choix` : même contrôle, marqueur de nature à part.
      const champ = NATURES.choix(descr, model);
      champ.classList.add('cfg-operateur');
      return champ;
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
  function rendre(hote, schema, model) {
    // Ensemble des chemins dont le changement doit re-peindre le panneau : les
    // champs marqués `reagit`, ET tout opérateur (pilote par nature).
    const cheminsStructurants = {};
    (schema || []).forEach(function (d) {
      if (d.reagit || d.nature === 'operateur') cheminsStructurants[d.chemin] = true;
    });

    function _peindre() {
      while (hote.firstChild) hote.removeChild(hote.firstChild);
      (schema || []).forEach(function (descr) {
        if (!_visible(descr, model)) return;
        const fab = NATURES[descr.nature];
        if (!fab) return;   // nature inconnue : ignorée (extensible)
        hote.appendChild(fab(descr, model));
      });
    }
    _peindre();

    // Re-peindre seulement sur changement d'un chemin structurant. C'est ce qui
    // rafraîchit les champs dépendants (Date -> Between) sans casser la saisie
    // d'un champ texte ordinaire.
    const off = model.onChange(function (chemin) {
      if (chemin == null || cheminsStructurants[chemin]) _peindre();
    });
    return off;
  }

  return { rendre, NATURES, _brut: _brut, _decore: _decore };

})();

if (typeof window !== 'undefined') window.ConfigRenderer = ConfigRenderer;
if (typeof module !== 'undefined') module.exports = ConfigRenderer;
