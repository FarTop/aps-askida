// APS — server/engine-builder/builder-essences.js — créé le 2026-08-12
// ================================================================
// RECONNAÎTRE LES ESSENCES D'UN MANIFESTE DANS UN LISTING S3.
//
// Fonction PURE : des clés S3 et des essences entrent, des variables et des
// constats de cardinalité sortent. Ni contexte, ni réseau, ni base.
//
// ── POURQUOI L'EXTRAIRE ─────────────────────────────────────────
// Cette logique vivait dans builder-handler-deliver.js, mêlée à l'écriture
// dans le contexte. Elle doit maintenant servir DEUX moteurs : celui d'APS, et
// une Lambda AWS — parce qu'ASL ne sait pas reconnaître un fichier par motif de
// nom (mesuré le 2026-08-12 : les sept `s3_*_url` sont les seules références de
// PUBLISH qu'aucun JSONPath ne peut rendre).
//
// Et ce n'est pas une commodité, c'est une CONTRAINTE DE CORRECTION. Ces
// variables composent les URL que le partenaire va lire, et qu'APS ira ensuite
// vérifier. Deux implémentations qui divergent d'un cheveu — un tri différent
// quand deux fichiers correspondent, un `-2.jpg` préféré à l'original —
// livreraient un fichier à une adresse et en contrôleraient une autre. Une
// seule implémentation, deux appelants : c'est la seule façon de garantir que
// la machine d'états AWS et le moteur natif disent la même chose.
//
// Le comportement est repris à l'identique, y compris ses deux subtilités :
//
//   LE FILTRE PAR NIVEAU d'abord (`appliesTo`) : une essence hors du niveau
//   courant n'est pas cherchée, et son nom est RENDU à l'appelant — c'est ce
//   qui permet au Lookup de distinguer « ne s'applique pas ici » d'un repli
//   cassé.
//
//   LE REPLI PAR TOKEN ensuite, pour les visuels qu'aucune essence ne
//   revendique par son `reconnu_par`. Il respecte le même filtre de niveau,
//   sans quoi il neutraliserait silencieusement le découpage du manifeste.
//
// UNE SEULE DIFFÉRENCE avec le handler d'origine, et c'est une correction :
// le token ne remplace plus une variable qu'une essence a posée, et il trie ses
// candidats comme elle. Voir le commentaire à l'endroit même.
// ================================================================
'use strict';

const TYPE_TO_NIVEAU = { 'Série': 'serie', 'Saison': 'saison', 'Episode': 'episode', 'Unitaire': 'unitaire' };
const ARTWORK_TOKENS = ['cover', 'poster', 'hero', 'box', 'season', 'episodic', 'title'];
const IMG_EXT = /\.(jpe?g|png)$/i;

// Deux fichiers correspondent au même motif ? On écarte les suffixés `-2.jpg`,
// `-3.png` : ce sont des doublons d'upload, et l'original est le bon. Repris
// tel quel du handler — ce tri décide de l'URL livrée.
function _choisir(candidats) {
  if (candidats.length <= 1) return candidats[0];
  return candidats.find(k => !k.match(/-\d+\.[^.]+$/)) || candidats[0];
}

function _cardinalite(mapping, n) {
  switch (mapping.cardinalite) {
    case 'exactement_un':
      return n !== 1 ? mapping.type + ' : attendu exactement 1, trouvé ' + n : null;
    case 'au_moins_un':
      return n < 1 ? mapping.type + ' : attendu au moins 1, trouvé ' + n : null;
    case 'au_plus_n': {
      const max = mapping.n || 1;
      return n > max ? mapping.type + ' : attendu au plus ' + max + ', trouvé ' + n : null;
    }
    default: return null;
  }
}

// `mappings`  : essences déjà mises en forme {type, filter, variable, cardinalite, appliesTo}
// `keys`      : les clés retournées par le listing S3
// `base`      : préfixe d'URL à coller devant la clé (ex. « s3://bucket/ »)
// `typeCollection` : la valeur Iconik brute (« Série »), pas le niveau normalisé
function reconnaitre(mappings, keys, base, typeCollection) {
  const niveauCourant = TYPE_TO_NIVEAU[typeCollection] || '';
  const variables   = {};
  const horsNiveau  = [];
  const cardinalite = [];

  (mappings || []).forEach(function (mapping) {
    if (!mapping || !mapping.variable) return;
    if (Array.isArray(mapping.appliesTo) && mapping.appliesTo.length
        && niveauCourant && mapping.appliesTo.indexOf(niveauCourant) === -1) {
      horsNiveau.push(mapping.variable);
      return;
    }
    const filtres = String(mapping.filter || '').split(',')
      .map(f => f.trim().toLowerCase()).filter(Boolean);
    if (!filtres.length) return;

    const candidats = (keys || []).filter(function (k) {
      const kl = String(k).toLowerCase();
      return filtres.some(f => kl.includes(f));
    });
    const retenu = _choisir(candidats);
    if (retenu) variables[mapping.variable] = base + retenu;

    const souci = _cardinalite(mapping, candidats.length);
    if (souci) cardinalite.push(souci);
  });

  ARTWORK_TOKENS.forEach(function (tok) {
    const nomVar = 's3_' + tok + '_url';
    if (horsNiveau.indexOf(nomVar) !== -1) return;
    // LE TOKEN NE COMBLE QUE LES TROUS, et trie comme une essence.
    //
    // Le handler d'origine faisait l'inverse : il écrasait ce qu'une essence
    // avait posé, avec un simple `find` — donc SANS le tri qui écarte les
    // doublons d'upload. Une essence retenait correctement
    // « friday_cover.png », le token la remplaçait par « friday_cover-2.png »,
    // et c'est cette URL-là qui partait chez le partenaire pendant qu'APS
    // vérifiait l'autre. Défaut révélé par preuve-essences.js le 2026-08-12,
    // jamais constaté en réel faute de doublon dans les jeux de test.
    //
    // Une essence déclare son `reconnu_par` : elle sait mieux que le token, qui
    // n'est qu'un repli pour les visuels qu'aucune essence ne revendique.
    if (variables[nomVar]) return;
    const candidats = (keys || []).filter(k => IMG_EXT.test(k) && String(k).toLowerCase().includes(tok));
    const hit = _choisir(candidats);
    if (hit) variables[nomVar] = base + hit;
  });

  return { variables: variables, horsNiveau: horsNiveau, cardinalite: cardinalite };
}

module.exports = { reconnaitre, TYPE_TO_NIVEAU, ARTWORK_TOKENS };
