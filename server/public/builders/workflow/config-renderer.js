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
    },

    // Liste : un sous-schéma RÉPÉTÉ. Chaque item est rendu par `descr.itemSchema`
    // avec ses chemins préfixés (conditions.0.op, conditions.1.op…). Boutons
    // « + » (ajouter) et « ✕ » par ligne. add/remove écrivent dans le modèle
    // (structurant -> re-rendu). Compose les autres natures à l'intérieur.
    liste: function (descr, model) {
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
          if (fab) corps.appendChild(fab(projete, model));
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
        model.ecrire(descr.chemin + '.' + idx,
          descr.itemDefaut ? JSON.parse(JSON.stringify(descr.itemDefaut)) : {});
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
    // Chemins structurants (re-peignent le panneau) : champs marqués `reagit`,
    // opérateurs, et listes. Pour une liste : ajout/retrait de ligne, ET les
    // champs PILOTES d'un item (opérateur/reagit) qui commandent d'autres champs
    // de l'item. Mais PAS un champ texte d'item — sinon on re-peindrait a chaque
    // frappe et on perdrait le focus. On mémorise, par liste, les noms de champs
    // pilotes de son itemSchema.
    const cheminsStructurants = {};
    const listes = [];   // { prefixe, pilotes:Set }
    (schema || []).forEach(function (d) {
      if (d.reagit || d.nature === 'operateur') cheminsStructurants[d.chemin] = true;
      if (d.nature === 'liste') {
        const pilotes = {};
        (d.itemSchema || []).forEach(function (sd) {
          if (sd.reagit || sd.nature === 'operateur') pilotes[sd.chemin] = true;
        });
        listes.push({ prefixe: d.chemin, pilotes: pilotes });
      }
    });

    function _estStructurant(chemin) {
      if (chemin == null) return true;
      if (cheminsStructurants[chemin]) return true;
      for (let i = 0; i < listes.length; i++) {
        const L = listes[i];
        // Ajout/retrait de ligne : le chemin est exactement le tableau, ou une
        // ligne entiere (prefixe.N sans champ ensuite).
        if (chemin === L.prefixe) return true;
        const m = chemin.indexOf(L.prefixe + '.') === 0
          ? chemin.slice(L.prefixe.length + 1) : null;
        if (m == null) continue;
        const seg = m.split('.');            // ex ['0'] (ligne) ou ['0','op'] (champ)
        if (seg.length === 1) return true;   // ajout/retrait de la ligne entiere
        if (seg.length >= 2 && L.pilotes[seg[1]]) return true;   // champ pilote de l'item
      }
      return false;
    }

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
      if (_estStructurant(chemin)) _peindre();
    });
    return off;
  }

  return { rendre, NATURES, _brut: _brut, _decore: _decore };

})();

if (typeof window !== 'undefined') window.ConfigRenderer = ConfigRenderer;
if (typeof module !== 'undefined') module.exports = ConfigRenderer;
