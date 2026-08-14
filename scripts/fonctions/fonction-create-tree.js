// APS — aps-create-tree — fonction générée.
// ================================================================
// Crée une arborescence de collections Iconik en descendant un gabarit.
//
// La plus lourde des cinq, et la seule qui ÉCRIT chez Iconik. Trois raisons
// pour lesquelles ASL ne peut pas la faire :
//   — c'est une RÉCURSION sur les nœuds d'un gabarit, dont la profondeur n'est
//     connue qu'au run (le gabarit vit dans APS et voyage en entrée) ;
//   — elle attribue des identifiants, donc elle a besoin du registre ;
//   — elle numérote les fratries, donc elle interroge Iconik, calcule, écrit.
//
// ── PORTÉE DE builder-handler-iconik-create-tree.js ─────────────
// L'ordre des gestes est conservé à l'identique, y compris les deux subtilités
// que le handler documente et qui ne se devinent pas :
//
//   ÉCRIRE SON IDENTIFIANT ET ÉCRIRE SA PARENTÉ SONT DEUX GESTES DISTINCTS.
//   Ils étaient liés dans un seul test, ce qui rendait impossible le cas « ce
//   niveau est rattaché à son parent mais ne porte pas d'identifiant propre » —
//   exactement celui d'Episode. La parenté disparaissait avec l'identifiant, et
//   PUBLISH ne pouvait plus remonter la hiérarchie.
//
//   LA PARENTÉ D'UN NIVEAU EST L'IDENTIFIANT DU DERNIER ANCÊTRE QUI EN PORTE
//   UN, jamais le sien — d'où la mise à jour de `dernierId` APRÈS l'écriture.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { gabarit, parentId, connexion: { baseUrl, connectionArn }, orgId,
//     idType, idLength, idFieldName, parentFieldName, typeFieldName,
//     metadataViewId, parentBayardId, orderFieldName, orderPad, orderSeed,
//     extraFields: [{key, value}], variables: {} }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { rootId, created[], rootBayardId, lastBayardId, count }
// ================================================================
'use strict';

const { entetesDe, clientHttp } = require('./commun-connexion.js');
const { attribuerIdentifiant, prochainNumero } = require('./commun-etat.js');
const { genererIdentifiant } = require('./builder-identifiants.js');

// Rendre un gabarit `{nom}` depuis le sac de variables. Version plate de ce que
// fait BuilderContext chez APS — une référence introuvable reste telle quelle
// plutôt que de devenir du vide, pour qu'un titre fautif se voie au lieu de
// produire une collection « Saison  ».
function substituer(variables) {
  return function (g) {
    if (typeof g !== 'string') return g;
    return g.replace(/\{([^{}]+)\}/g, function (tel, nom) {
      const v = variables[nom.trim()];
      return v === undefined || v === null ? tel : String(v);
    });
  };
}

// Le plus grand numéro déjà porté par une fratrie, plus un. Porté tel quel :
// on lit les titres des collections filles et on retient le DERNIER nombre de
// chaque titre — « Saison 01 » et « MaSérie 2024 - Saison 03 » se lisent pareil.
async function prochainNumeroFratrie(iconik, parentId, pad) {
  let max = 0;
  if (parentId) {
    try {
      const res = await iconik.post('/API/search/v1/search/', {
        query: 'parent_id:"' + parentId + '"', doc_types: ['collections'],
      });
      (res.objects || []).forEach(function (o) {
        const chiffres = String(o.title || '').match(/\d+/g);
        if (!chiffres || !chiffres.length) return;
        const n = parseInt(chiffres[chiffres.length - 1], 10);
        if (!isNaN(n) && n > max) max = n;
      });
    } catch (_) { /* numérotation depuis 1 */ }
  }
  const suivant = max + 1;
  return pad ? String(suivant).padStart(pad, '0') : String(suivant);
}

exports.handler = async function (evenement) {
  const e = evenement || {};
  const gabarit = e.gabarit;
  if (!gabarit) throw new Error('aps-create-tree : aucun gabarit fourni');

  const variables = Object.assign({}, e.variables || {});
  const r = substituer(variables);

  const cx = e.connexion || {};
  const iconik = clientHttp(cx.baseUrl || 'https://app.iconik.io', await entetesDe(cx.connectionArn));

  const orgId    = e.orgId || 'default';
  const idType   = e.idType || 'numeric';
  const idLength = Math.max(1, Math.min(64, parseInt(e.idLength, 10) || 8));
  const champId     = e.idFieldName     || 'BayardID';
  const champParent = e.parentFieldName || 'ParentID';
  const champType   = e.typeFieldName   || 'TypeCollection';
  const vueParDefaut = r(e.metadataViewId || '');

  const champOrdre = String(e.orderFieldName || '').trim();
  const padOrdre   = Math.max(0, Math.min(6, parseInt(e.orderPad, 10) || 0));
  const graineOrdre = parseInt(r(String(e.orderSeed || '0')), 10) || 0;

  const champsSup = (e.extraFields || [])
    .filter(function (f) { return f && f.key; })
    .map(function (f) { return { key: f.key, value: r(f.value || '') }; });

  const creees = [];
  let dernierId = r(e.parentBayardId || '') || null;

  async function creerNiveau(noeud, parentIconikId, racine) {
    let valeurOrdre = null;
    if (champOrdre && racine) {
      try {
        const n = await prochainNumero(champOrdre, String(parentIconikId || 'racine'), graineOrdre);
        valeurOrdre = padOrdre ? String(n).padStart(padOrdre, '0') : String(n);
        variables[champOrdre] = valeurOrdre;
      } catch (_) { /* champ et titre sans numéro */ }
    }

    let valeurNumero = null;
    if (noeud.numberField) {
      const pad = Math.max(0, Math.min(6, parseInt(noeud.numberPad, 10) || 0));
      try {
        valeurNumero = await prochainNumeroFratrie(iconik, parentIconikId, pad);
        variables[noeud.numberField] = valeurNumero;
      } catch (_) { /* échec numérotation par niveau */ }
    }

    const titre = r(noeud.name || 'Sans nom');
    const col = await iconik.post('/API/assets/v1/collections/', {
      title: titre, parent_id: parentIconikId || undefined,
    });
    if (!col.id) throw new Error('Échec création collection « ' + titre + ' »');

    let idIci = null;
    const champs = {};
    champsSup.forEach(function (f) { champs[f.key] = { field_values: [{ value: f.value }] }; });
    if (noeud.collectionType) {
      champs[champType] = { field_values: [{ value: r(noeud.collectionType) }] };
    }

    // Compatibilité : un gabarit ancien n'a pas `writeParentId` — on retombe
    // alors sur `generateId`, soit exactement l'ancien couplage.
    const ecrireParent = noeud.writeParentId !== undefined ? !!noeud.writeParentId : !!noeud.generateId;

    if (noeud.generateId) {
      const attribue = await attribuerIdentifiant({
        objectId: col.id, objectType: 'collection', orgId: orgId,
        fabriquer: function () { return genererIdentifiant(idType, idLength, ''); },
      });
      idIci = attribue.id;
      champs[champId] = { field_values: [{ value: idIci }] };
    }
    // AVANT la mise à jour de `dernierId` : la parenté d'un niveau est
    // l'identifiant du dernier ancêtre qui en porte un, jamais le sien.
    if (ecrireParent && dernierId) {
      champs[champParent] = { field_values: [{ value: dernierId }] };
    }
    if (idIci) dernierId = idIci;

    if (champOrdre && valeurOrdre !== null) champs[champOrdre] = { field_values: [{ value: valeurOrdre }] };
    if (noeud.numberField && valeurNumero !== null) {
      champs[noeud.numberField] = { field_values: [{ value: valeurNumero }] };
    }

    // La vue par NIVEAU, pas une seule pour tout l'arbre : chaque type Iconik a
    // ses propres champs, et écrire un niveau Saison avec la vue Série ferait
    // silencieusement disparaître NumeroSaison.
    const vue = r(noeud.metadataViewId || '') || vueParDefaut;
    if (vue && Object.keys(champs).length) {
      await iconik.put('/API/metadata/v1/collections/' + col.id + '/views/' + vue + '/',
                       { metadata_values: champs });
    }

    creees.push({ id: col.id, title: titre, parentIconikId: parentIconikId,
                  bayardId: idIci, collectionType: noeud.collectionType || null });

    for (const enfant of (noeud.children || [])) await creerNiveau(enfant, col.id, false);
    return col;
  }

  const racine = await creerNiveau(gabarit, r(e.parentId || ''), true);

  const avecId = creees.filter(function (c) { return c.bayardId; });
  return {
    rootId: racine.id,
    created: creees,
    count: creees.length,
    rootBayardId: avecId.length ? avecId[0].bayardId : '',
    lastBayardId: avecId.length ? avecId[avecId.length - 1].bayardId : '',
  };
};
