/**
 * config-model.js — Modèle de configuration d'un nœud (source de vérité unique)
 *
 * Résout d'un coup les trois bugs vécus dans WFD, qui n'étaient qu'UN problème :
 * chaque champ y gérait son propre état, artisanalement et sans cohérence.
 *
 *   1. Accolades incohérentes ({var} tantôt inclus, tantôt non) : ici le modèle
 *      stocke TOUJOURS la valeur brute. La décoration {var} est un détail
 *      d'AFFICHAGE, appliqué au rendu, jamais stocké. Une règle, pas deux.
 *   2. Champs dépendants qui ne se rafraîchissent pas (Date -> Between = 2
 *      champs) : écrire dans le modèle NOTIFIE, le panneau réagit et re-rend
 *      les champs dépendants. Pas besoin de sauver ni de créer une ligne.
 *   3. Sauvegarde qui ne prend pas du premier coup : il n'y a PLUS de sauvegarde
 *      séparée. Écrire dans le modèle EST sauver — le modèle est l'état.
 *
 * Même pattern que le canevas : un modèle au centre, le rendu comme reflet,
 * mutations par un point unique. Le modèle ne connaît ni le DOM ni le rendu.
 *
 * Les valeurs sont adressées par CHEMIN pointé ('conditions.0.op'), pour porter
 * des structures imbriquées (listes de conditions, étapes de séquence…).
 */

const ConfigModel = (() => {

  function creer(paramsInitiaux) {
    // Copie profonde des params de départ (on ne mute pas l'étape source).
    let data = paramsInitiaux ? JSON.parse(JSON.stringify(paramsInitiaux)) : {};
    const abonnes = [];

    function _notifier(chemin) {
      abonnes.forEach(function (fn) { fn(chemin); });
    }
    function onChange(fn) { abonnes.push(fn); return function () {
      const i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1);
    }; }

    // Lecture par chemin pointé. Retourne undefined si absent.
    function lire(chemin) {
      if (!chemin) return data;
      const parts = String(chemin).split('.');
      let cur = data;
      for (let i = 0; i < parts.length; i++) {
        if (cur == null) return undefined;
        cur = cur[parts[i]];
      }
      return cur;
    }

    // Écriture par chemin pointé. Crée les conteneurs intermédiaires au besoin
    // (objet ou tableau selon que la clé suivante est un indice numérique).
    // Écrire EST sauver : la source de vérité, c'est ce modèle.
    function ecrire(chemin, valeur) {
      const parts = String(chemin).split('.');
      let cur = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        const suivante = parts[i + 1];
        const veutTableau = /^\d+$/.test(suivante);
        if (cur[k] == null || typeof cur[k] !== 'object') {
          cur[k] = veutTableau ? [] : {};
        }
        cur = cur[k];
      }
      cur[parts[parts.length - 1]] = valeur;
      _notifier(chemin);
    }

    // Supprime une clé / un élément (pour retirer une ligne de liste, etc.).
    function retirer(chemin) {
      const parts = String(chemin).split('.');
      let cur = data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null) return;
        cur = cur[parts[i]];
      }
      if (cur == null) return;
      const last = parts[parts.length - 1];
      if (Array.isArray(cur) && /^\d+$/.test(last)) cur.splice(parseInt(last, 10), 1);
      else delete cur[last];
      _notifier(chemin);
    }

    // Instantané des params (ce qui sera transcrit dans l'étape pivot).
    function params() { return JSON.parse(JSON.stringify(data)); }

    // Remplace tout le contenu (changement de nœud sélectionné).
    function remplacer(nouveaux) {
      data = nouveaux ? JSON.parse(JSON.stringify(nouveaux)) : {};
      _notifier(null);
    }

    return { onChange, lire, ecrire, retirer, params, remplacer };
  }

  return { creer };

})();

if (typeof window !== 'undefined') window.ConfigModel = ConfigModel;
if (typeof module !== 'undefined') module.exports = ConfigModel;
