// APS — aps-resolve-ancestors — fonction générée.
// ================================================================
// Remonte la parenté d'une collection pour composer son chemin de dépôt, et
// rapporte au passage les métadonnées de chaque ancêtre.
//
// ── POURQUOI UNE LAMBDA ─────────────────────────────────────────
// Trois raisons, et la première suffit :
//   — le slug de chemin normalise en NFD pour retirer les accents, ce
//     qu'aucune fonction JSONata ne sait faire ;
//   — la remontée est une boucle dont la profondeur dépend du NIVEAU (0 pour
//     une Série ou un Unitaire, 1 pour une Saison, 2 pour un Épisode), et
//     chaque tour dépend du précédent — le ParentID lu devient la clé du
//     suivant ;
//   — chaque tour fait DEUX appels : une recherche par BayardID, puis la
//     lecture des métadonnées.
//
// ── DEUX SORTIES, ET LA SECONDE EST GRATUITE ────────────────────
// `ancestorPath` compose l'adresse S3. `ancetres` porte les métadonnées
// complètes de chaque niveau, que le Lookup consomme pour l'héritage. Le
// handler d'origine le note : ces métadonnées étaient DÉJÀ lues pour composer
// le chemin et jetées ensuite — les conserver n'ajoute aucun appel réseau.
//
// ── LE CHEMIN EST UN CONTRAT ────────────────────────────────────
// Il désigne où Iconik dépose ET où APS ira vérifier. `builder-textes.js` est
// donc embarqué tel quel : le même slug des deux côtés, sinon on livre à une
// adresse et on contrôle l'autre.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { typeCollection, univers, bayardId, parentId, title,
//     connexion: { baseUrl, connectionArn } }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { ancestorPath, ancetres[], complet, motif }
//   `complet` vaut faux quand la remontée s'est interrompue — un ParentID
//   manquant, un ancêtre introuvable. Le chemin partiel est rendu quand même,
//   et les ancêtres déjà lus aussi : le Lookup doit pouvoir hériter de ce qu'on
//   a, plutôt que de repartir de rien.
// ================================================================
'use strict';

const { entetesDe, clientHttp } = require('./commun-connexion.js');
const { slugChemin } = require('./builder-textes.js');
const { aplatirMetadonnees } = require('./builder-heritage.js');

// Combien de niveaux remonter. Une Série et un Unitaire sont à la racine ; une
// Saison a un parent ; un Épisode en a deux.
const NIVEAUX = { 'Série': 0, 'Saison': 1, 'Episode': 2, 'Unitaire': 0 };

exports.handler = async function (evenement) {
  const e = evenement || {};
  const type = e.typeCollection || '';
  const n = NIVEAUX[type];
  if (n === undefined) {
    return { ancestorPath: '', ancetres: [], complet: false,
             motif: 'TypeCollection inconnu ou absent (' + type + ')' };
  }

  const cx = e.connexion || {};
  const iconik = clientHttp(cx.baseUrl || 'https://app.iconik.io', await entetesDe(cx.connectionArn));

  const ancetres = [];
  const segments = [];
  let parentId = e.parentId || '';

  // Le segment du niveau COURANT. Une Série se nomme par son univers, une
  // Saison et un Épisode par leur titre — et seul l'Épisode n'a pas
  // d'identifiant dans son segment.
  if (type === 'Série')       segments.unshift(slugChemin(e.univers) + '_' + (e.bayardId || ''));
  else if (type === 'Saison') segments.unshift(slugChemin(e.title) + '_' + (e.bayardId || ''));
  else                        segments.unshift(slugChemin(e.title));

  const rendre = function (complet, motif) {
    return { ancestorPath: segments.join('/'), ancetres: ancetres,
             complet: complet, motif: motif || null };
  };

  for (let i = 0; i < n; i++) {
    if (!parentId) return rendre(false, 'ParentID manquant au niveau ' + (i + 1));

    let trouve;
    try {
      const res = await iconik.post('/API/search/v1/search/', {
        query: 'metadata.BayardID:"' + String(parentId).replace(/"/g, '\\"') + '"',
        doc_types: ['collections'],
      });
      trouve = (res.objects || [])[0];
    } catch (err) {
      return rendre(false, 'recherche ancêtre échouée — ' + err.message);
    }
    if (!trouve) return rendre(false, 'aucune collection avec BayardID ' + parentId);

    const mv = (await iconik.get('/API/metadata/v1/collections/' + trouve.id + '/')) || {};
    const lire = function (champ) {
      const c = mv[champ];
      return (c && c.values && c.values[0] && c.values[0].value) || '';
    };
    const aUnivers  = lire('Univers');
    const aBayardId = lire('BayardID');

    ancetres.push({
      id      : trouve.id,
      titre   : trouve.title || '',
      niveau  : lire('TypeCollection'),
      bayardId: aBayardId,
      metadata: aplatirMetadonnees(mv),
    });

    // La RACINE se nomme par son univers, les niveaux intermédiaires par leur
    // titre. Distinction reprise telle quelle du moteur : elle décide de
    // l'adresse, donc du fichier que le partenaire recevra.
    if (i === n - 1) segments.unshift(slugChemin(aUnivers) + '_' + aBayardId);
    else             segments.unshift(slugChemin(trouve.title) + '_' + aBayardId);

    parentId = lire('ParentID');
  }

  return rendre(true, null);
};
