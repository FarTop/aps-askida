// APS — server/engine-builder/builder-correspondance.js — créé le 2026-08-12
// ================================================================
// APPLIQUER UNE RÈGLE DE CORRESPONDANCE À UNE VALEUR DÉJÀ LUE.
//
// Fonctions PURES : une valeur entre, une valeur sort. Ni contexte, ni réseau,
// ni base — comme builder-essences.js et builder-heritage.js.
//
// ── LE PARTAGE, ET POURQUOI IL S'ARRÊTE LÀ ──────────────────────
// Le Lookup fait deux choses de nature différente :
//
//   LIRE      d'où vient la valeur — champ de l'objet, métadonnée, variable
//             d'ambiance, repli, ancêtre. Cela dépend du moteur : APS a un
//             espace de noms global, une Lambda reçoit un objet plat. Reste
//             donc chez l'appelant.
//   TRANSFORMER  ce qu'on en fait — traduire par la table, forcer en liste,
//             convertir le type, réduire en slug, ranger au bon chemin. Cela
//             ne dépend de RIEN. C'est ici.
//
// Le partage suit cette ligne parce que c'est la seule qui tienne : tout ce qui
// touche à la provenance diverge d'un moteur à l'autre, tout ce qui touche à la
// FORME de la valeur doit être identique — sinon APS et AWS enverraient au
// partenaire deux payloads différents depuis la même correspondance.
// ================================================================
'use strict';

function estPlaceholderNonResolu(v) {
  return typeof v === 'string' && /^\{[A-Za-z_][A-Za-z0-9_.]*\}$/.test(v.trim());
}

// Range une valeur au chemin demandé, en créant ce qu'il faut. Le chemin n'est
// pas qu'un nom : `persons[job=director].external_id` décrit une LISTE d'objets
// à laquelle on ajoute une entrée par valeur — c'est ce qui permet à une
// correspondance de produire le format d'un partenaire sans code dédié.
function rangerA(obj, chemin, val) {
  const arrAttrMatch = chemin.match(/^([^[]+)\[([^=\]]+)=([^\]]+)\]\.(.+)$/);
  if (arrAttrMatch) {
    const listKey = arrAttrMatch[1], attrKey = arrAttrMatch[2];
    const attrVal = arrAttrMatch[3], fieldKey = arrAttrMatch[4];
    if (!Array.isArray(obj[listKey])) obj[listKey] = [];
    let items = val;
    if (typeof val === 'string' && val.startsWith('[')) {
      try { items = JSON.parse(val); } catch (e) {}
    }
    items = Array.isArray(items) ? items : [items];
    items.forEach(function (v) {
      const entry = {};
      entry[attrKey] = attrVal;
      entry[fieldKey] = v;
      obj[listKey].push(entry);
    });
    return;
  }
  const arrMatch = chemin.match(/^([^.[]+)\[\]$/);
  if (arrMatch) { obj[arrMatch[1]] = Array.isArray(val) ? val : [val]; return; }

  const arrObjMatch = chemin.match(/^([^.[]+)\[(\d*)\]\.(.+)$/);
  if (arrObjMatch) {
    const listKey = arrObjMatch[1];
    const idx = arrObjMatch[2] !== '' ? parseInt(arrObjMatch[2]) : 0;
    if (!Array.isArray(obj[listKey])) obj[listKey] = [];
    while (obj[listKey].length <= idx) obj[listKey].push({});
    rangerA(obj[listKey][idx], arrObjMatch[3], val);
    return;
  }
  const dotIdx = chemin.indexOf('.');
  if (dotIdx > 0) {
    const head = chemin.slice(0, dotIdx);
    if (!obj[head] || typeof obj[head] !== 'object' || Array.isArray(obj[head])) obj[head] = {};
    rangerA(obj[head], chemin.slice(dotIdx + 1), val);
    return;
  }
  obj[chemin] = val;
}

// La table de traduction d'une règle, appliquée ÉLÉMENT PAR ÉLÉMENT : une
// liste de genres se traduit genre par genre. Un élément absent de la table
// est transmis tel quel — c'est typiquement un libellé que personne n'a encore
// traduit, et le taire vaudrait mieux que l'inventer.
function traduire(val, children) {
  if (!children || !children.length) return { valeur: val, traduction: null };
  const _un = function (v) {
    const s = String(v);
    const child = children.find(c => (c.key || c.src || '').trim() === s);
    return child ? { de: s, vers: (child.value || child.tgt || '').trim() } : { de: s, vers: null };
  };
  if (Array.isArray(val)) {
    const paires = val.map(_un);
    const sortie = paires.map((p, i) => (p.vers !== null ? p.vers : val[i]));
    const traduits = paires.filter(p => p.vers !== null);
    return { valeur: sortie,
             traduction: { de: paires.map(p => p.de).join(', '),
                           vers: traduits.length ? sortie.join(', ') : null } };
  }
  const p = _un(val);
  return { valeur: p.vers !== null ? p.vers : val, traduction: p };
}

function slugifier(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Type et format, dans l'ordre du handler d'origine : la conversion de type
// AVANT le slug. L'inverse produirait « 12 » là où le partenaire attend 12.
function formater(val, row) {
  let v = val;
  if (row.list === true || row.list === 'true' || row.type === 'list') {
    v = Array.isArray(v) ? v : [v];
  }
  const t = row.type || 'string';
  if (t === 'integer' && !Array.isArray(v)) {
    const n = parseInt(String(v), 10); v = isNaN(n) ? v : n;
  } else if (t === 'float' && !Array.isArray(v)) {
    const f = parseFloat(String(v)); v = isNaN(f) ? v : f;
  } else if (t === 'boolean' && !Array.isArray(v)) {
    v = (v === 'true' || v === true || v === 1 || v === '1');
  }
  if (row._format === 'slug') {
    if (Array.isArray(v)) v = v.map(slugifier);
    else if (typeof v === 'string' && v.startsWith('[')) {
      try { v = JSON.stringify(JSON.parse(v).map(slugifier)); } catch (e) { v = slugifier(v); }
    } else v = slugifier(String(v));
  }
  return v;
}

module.exports = { estPlaceholderNonResolu, rangerA, traduire, slugifier, formater };
