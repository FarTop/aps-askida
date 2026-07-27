/**
 * pivot-resolver-table.js — Résolution d'une table de correspondance en payload
 *
 * Une table (ressource `table`, ex. bayard_vers_vodfactory) transforme des
 * métadonnées source en payload cible, ligne par ligne. Ce module reproduit
 * FIDÈLEMENT ce que le moteur WFD produit (_setNestedValue, wfd-engine-handlers),
 * pour que le WFD régénéré par le convertisseur donne le même run que l'original.
 * On ne touche pas le moteur ; on transcrit sa logique côté Builder.
 *
 * Trois cas, tels que la table réelle les emploie :
 *
 *   1. Attribut fixe — persons[job=director].external_id
 *      Une entrée par valeur. Plusieurs external_id dans une valeur-tableau →
 *      plusieurs personnes du même rôle. Format `slug` appliqué comme le moteur.
 *
 *   2. Tableau d'objets — availabilities.amazon[].starts_at / .ends_at
 *      Deux lignes visant amazon[] fusionnent par index dans la MÊME entrée :
 *      { starts_at, ends_at }. C'est le seul cas de fusion réel de la table.
 *
 *   3. Chemin simple ou pointé — title, images.amazon.cover_art
 *      Pose directe.
 */

const PivotResolverTable = (() => {

  const RE_ATTR    = /^([^[]+)\[([^=\]]+)=([^\]]+)\]\.(.+)$/;  // liste[attr=val].champ
  const RE_ARR_OBJ = /^(.+?)\[(\d*)\]\.(.+)$/;                // (chemin)[].champ, chemin pointé permis
  const RE_ARR     = /^(.+?)\[\]$/;                           // chemin[] (scalaires)

  // slugify identique au moteur (_wfdSlugify) : mêmes étapes, même résultat.
  function slugify(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function _deplier(val) {
    if (typeof val === 'string' && val.charAt(0) === '[') {
      try { return JSON.parse(val); } catch (e) { /* garder */ }
    }
    return val;
  }

  function _poserChemin(obj, chemin, val) {
    const parts = chemin.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] === undefined || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
  }

  /**
   * @param {Array<{path:string, value:*, format?:string}>} lignes
   * @returns {Object} payload
   */
  function construire(lignes) {
    const payload = {};
    // Compteur d'auto-index par liste[], pour que starts_at et ends_at d'une
    // même paire tombent dans la même entrée. Réinitialisé par liste.
    const autoIndex = Object.create(null);

    (lignes || []).forEach(function (ligne) {
      const chemin = ligne.path;
      if (!chemin) return;
      const brut = _deplier(ligne.value);
      const slug = ligne.format === 'slug';
      const conv = function (v) { return slug ? slugify(v) : v; };

      // Cas 1 : attribut fixe — une entrée par valeur.
      let m = chemin.match(RE_ATTR);
      if (m) {
        const liste = m[1], attr = m[2], val = m[3], champ = m[4];
        if (!Array.isArray(payload[liste])) payload[liste] = [];
        const items = Array.isArray(brut) ? brut : [brut];
        items.forEach(function (v) {
          const entree = {};
          entree[attr] = val;
          entree[champ] = conv(v);
          payload[liste].push(entree);
        });
        return;
      }

      // Cas 2 : tableau d'objets — fusion par index. Le chemin de liste peut
      // être pointé (availabilities.amazon) : on descend jusqu'au conteneur,
      // puis le tableau vit à sa dernière clé. `liste[]` sans index apparie les
      // champs d'une même entrée (starts_at + ends_at d'une paire de dates).
      m = chemin.match(RE_ARR_OBJ);
      if (m) {
        const cheminListe = m[1], idxStr = m[2], champ = m[3];
        // Descend jusqu'au conteneur du tableau.
        const parts = cheminListe.split('.');
        const cleTab = parts.pop();
        let cont = payload;
        parts.forEach(function (p) {
          if (cont[p] === undefined || typeof cont[p] !== 'object' || Array.isArray(cont[p])) cont[p] = {};
          cont = cont[p];
        });
        if (!Array.isArray(cont[cleTab])) cont[cleTab] = [];
        const arr = cont[cleTab];

        let idx;
        if (idxStr !== '') {
          idx = parseInt(idxStr, 10);
        } else {
          idx = autoIndex[cheminListe] === undefined ? 0 : autoIndex[cheminListe];
          if (arr[idx] && arr[idx][champ] !== undefined) idx += 1;
          autoIndex[cheminListe] = idx;
        }
        while (arr.length <= idx) arr.push({});
        arr[idx][champ] = conv(brut);
        return;
      }

      // Cas 3 : tableau de scalaires — genres[]
      m = chemin.match(RE_ARR);
      if (m) {
        const cheminListe = m[1];
        const parts = cheminListe.split('.');
        const cleTab = parts.pop();
        let cont = payload;
        parts.forEach(function (p) {
          if (cont[p] === undefined || typeof cont[p] !== 'object' || Array.isArray(cont[p])) cont[p] = {};
          cont = cont[p];
        });
        cont[cleTab] = Array.isArray(brut) ? brut.map(conv) : [conv(brut)];
        return;
      }

      // Cas 4 : chemin simple ou pointé.
      _poserChemin(payload, chemin, Array.isArray(brut) ? brut.map(conv) : conv(brut));
    });

    return payload;
  }

  return { construire, build: construire, slugify, RE_ATTR };

})();

if (typeof module !== 'undefined') module.exports = PivotResolverTable;
if (typeof window !== 'undefined') window.PivotResolverTable = PivotResolverTable;
