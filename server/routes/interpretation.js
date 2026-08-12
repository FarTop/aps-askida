// APS — server/routes/interpretation.js — créé le 2026-08-11
// ================================================================
// « Que deviendrait CE workflow chez CETTE cible ? »
//
//   GET /api/builder-flows/:id/interpretation?cible=make
//
// Ne produit RIEN chez la cible : c'est un plan, au sens de `terraform plan`.
// Lire et approuver d'abord, soumettre ensuite — deux gestes, pas un.
//
// La correspondance n'est pas réécrite ici : elle vient de `rendre-make.js`,
// qui est le seul endroit où elle est décidée. Une deuxième table aurait
// divergé de la première au premier changement.
// ================================================================
'use strict';
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
// Chemin relatif au fichier, pas au dossier de lancement : le serveur ne
// démarre pas toujours depuis la racine du dépôt.
const RENDU = require('../../scripts/rendre-make.js');
// Où vivent les ressources d'organisation chez la cible, et sous quelle clé.
// Comme pour la correspondance des verbes : c'est le portage qui décide, cet
// écran ne fait que lire. Le module n'écrit rien quand on le requiert.
const PORT  = require('../../scripts/porter-ressources-make.js');
// Le catalogue est le seul à savoir quels ports une étape expose — ceux d'une
// décision se calculent depuis sa configuration.
const CAT   = require('../public/builders/workflow/pivot-catalog-iconik.js');

const router = express.Router();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Les cibles. Déclarées même quand elles ne sont pas prêtes : une liste qui
// cache ce qui manque laisse croire que Make est la seule option envisagée.
const CIBLES = {
  make: { nom: 'Make', pret: true,
          decoupe: 'Make n\'a pas de sous-fonctions : un corps de boucle ne peut pas être appelé sur place, il devient un scénario à part déclenché par webhook.' },
  asl:  { nom: 'AWS Step Functions', pret: false,
          decoupe: 'ASL n\'a aucun espace de noms global : un workflow qui lit des variables d\'ambiance ne compile pas.' },
  n8n:  { nom: 'n8n', pret: false, decoupe: null },
};

// ── LA CONCORDANCE DE FORME ─────────────────────────────────────
// C'est ici que les deux architectures divergent, et le nom des étapes n'y est
// pour rien. APS est un GRAPHE : un nœud a plusieurs ports de sortie, une arête
// porte un libellé (« Aucun résultat », « Erreur »). Make est une CHAÎNE : on
// enfile des modules, un embranchement demande un Router, et une erreur n'est
// pas une arête mais un gestionnaire accroché au module.
//
// Dire « Decision → outil natif » cachait donc l'essentiel. Ce qu'il faut dire
// est : « cette question à 5 réponses devient un Router à 5 routes ».
function construitPar(core, ports) {
  const n = (ports || []).length;
  const erreurs = (ports || []).filter(p => /err|erreur|fail|timeout/i.test(p)).length;
  if (core === 'decision') {
    return { forme: 'router', dit: 'Router à ' + Math.max(n, 1) + ' route(s)',
             pourquoi: 'un embranchement APS a des ports ; Make n\'en a pas, il faut un module Router' };
  }
  if (core === 'loop') {
    return { forme: 'frontiere', dit: 'frontière de scénario',
             pourquoi: 'Make n\'a pas de sous-fonctions : le corps part en scénario appelé par webhook' };
  }
  if (erreurs) {
    return { forme: 'module+erreur',
             dit: 'un module + ' + erreurs + ' gestionnaire(s) d\'erreur',
             pourquoi: 'chez APS l\'erreur est une arête comme une autre ; chez Make c\'est une pièce accrochée au module' };
  }
  return { forme: 'module', dit: 'un module dans la suite', pourquoi: null };
}

// ── LES POST-ITS ────────────────────────────────────────────────
// Ils ne sont pas des étapes — ni comptés, ni versionnés, ni traduits. Mais ce
// sont eux qui portent le POURQUOI d'un workflow, et c'est exactement ce qui
// se perd quand un collègue reprend le travail ailleurs. Make sait les
// recevoir : `POST /scenarios/{id}/notes` accepte `{content, moduleIds}`,
// c'est-à-dire une note ACCROCHÉE à des modules.
//
// Reste à savoir à quel nœud rattacher chacun. Le canevas le dit tout seul :
// un post-it partage l'abscisse de son nœud et se pose dessous. On prend donc
// le nœud le plus proche en x, situé AU-DESSUS. Le libellé du post-it reprend
// souvent le nom du nœud — il sert de confirmation, jamais de critère unique
// (rien n'oblige un opérateur à le remplir).
function positionsDe(doc) {
  const p = (doc && doc.presentation) || {};
  const out = Object.assign({}, p.layout || {});
  Object.values(p.bodyLayout || {}).forEach(function (sous) {
    Object.assign(out, sous || {});
  });
  return out;
}

function postitsDe(doc, idsEtapes) {
  const pos = positionsDe(doc);
  const notes = [];
  (function visiter(liste) {
    (Array.isArray(liste) ? liste : []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      if (e.core === 'postit') {
        const mien = pos[e.id];
        let sur = null, meilleur = Infinity;
        if (mien) {
          idsEtapes.forEach(function (id) {
            const q = pos[id];
            if (!q || q.y >= mien.y) return;              // le nœud est au-dessus
            const d = Math.abs(q.x - mien.x) + Math.abs(q.y - mien.y) * 0.05;
            if (d < meilleur) { meilleur = d; sur = id; }
          });
        }
        notes.push({ id: e.id, sur: sur,
                     titre: e.label || null,
                     texte: (e.params && e.params.text) || '',
                     couleur: (e.params && e.params.color) || null });
        return;
      }
      const corps = e.body && (Array.isArray(e.body) ? e.body : e.body.steps);
      if (Array.isArray(corps)) visiter(corps);
    });
  })(doc && doc.steps);
  return notes;
}

// ── L'ORDRE DE LECTURE ──────────────────────────────────────────
// Le document range les étapes dans l'ordre où elles ont été CRÉÉES. Un nœud
// ajouté après coup se retrouve donc en fin de liste, même s'il agit au
// quatrième rang — et l'écran devient illisible à mesure qu'on édite.
//
// On les remet donc dans l'ordre du FLUX : on part de ce qui n'a pas
// d'antécédent (le déclencheur), on suit les arêtes, et on visite les branches
// dans l'ordre des ports. Ce n'est pas cosmétique : un scénario cible EST une
// suite, cet ordre est celui qu'il faudra produire.
//
// Ce qu'aucune arête n'atteint est mis à la fin, dans l'ordre du document, et
// signalé — un nœud injoignable est une information, pas un détail de tri.
function ordonnerParFlux(etapes, aretes) {
  if (!etapes.length) return etapes;
  const parId = new Map(etapes.map(e => [e.id, e]));
  const sortantes = new Map();
  const aUnAntecedent = new Set();
  aretes.forEach(function (a) {
    if (!parId.has(a.de) || !parId.has(a.vers)) return;
    if (!sortantes.has(a.de)) sortantes.set(a.de, []);
    sortantes.get(a.de).push(a);
    aUnAntecedent.add(a.vers);
  });

  // Combien d'étapes une branche entraîne derrière elle.
  function portee(depart) {
    const vus = new Set(), pile = [depart];
    while (pile.length) {
      const id = pile.pop();
      if (vus.has(id) || !parId.has(id)) continue;
      vus.add(id);
      (sortantes.get(id) || []).forEach(a => pile.push(a.vers));
    }
    return vus.size;
  }

  // LES IMPASSES D'ABORD. Un parcours en profondeur naïf descend la première
  // branche jusqu'au bout : sur « Programme ? », la route « Série » entraîne
  // tout le workflow, et la route « Par défaut » — deux nœuds — se retrouvait
  // seize positions plus loin. On visite donc les branches de la plus COURTE à
  // la plus longue : une impasse se lit près de son embranchement, et le chemin
  // principal se lit ensuite d'un trait. À portée égale, l'ordre des ports
  // tranche (« Succès » avant « Erreur »).
  etapes.forEach(function (e) {
    const liste = sortantes.get(e.id);
    if (!liste || liste.length < 2) return;
    let ports = [];
    try { ports = CAT.portsDe(e.etape) || []; } catch (_) { ports = []; }
    const taille = new Map();
    liste.forEach(a => { if (!taille.has(a.vers)) taille.set(a.vers, portee(a.vers)); });
    liste.sort(function (x, y) {
      const d = taille.get(x.vers) - taille.get(y.vers);
      if (d) return d;
      const i = ports.indexOf(x.port), j = ports.indexOf(y.port);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    });
  });

  const vus = new Set(), ordre = [];
  // Déclaration, pas expression : une expression de fonction nommée n'expose
  // son nom qu'à elle-même, et l'appel d'après ne la voyait pas.
  function visiter(id) {
    if (vus.has(id) || !parId.has(id)) return;
    vus.add(id);
    ordre.push(parId.get(id));
    (sortantes.get(id) || []).forEach(a => visiter(a.vers));
  }
  etapes.filter(e => !aUnAntecedent.has(e.id)).forEach(e => visiter(e.id));
  // Un cycle ou une composante détachée n'a pas d'entrée : on la prend telle
  // qu'elle vient plutôt que de l'oublier.
  etapes.forEach(function (e) {
    if (vus.has(e.id)) return;
    e.injoignable = true;
    vus.add(e.id);
    ordre.push(e);
  });
  return ordre;
}

// Parcours du document pivot. On garde la PROFONDEUR — c'est elle qui décide du
// découpage en scénarios — et on réordonne chaque portée par son flux.
function etapesDe(doc) {
  const portees = new Map();          // parent (ou null) -> { etapes, aretes }
  function portee(cle) {
    if (!portees.has(cle)) portees.set(cle, { etapes: [], aretes: [] });
    return portees.get(cle);
  }
  (function visiter(sousDoc, parent) {
    const liste = (sousDoc && sousDoc.steps) || [];
    const p = portee(parent);
    ((sousDoc && sousDoc.edges) || []).forEach(function (a) {
      if (a && a.from && a.to) p.aretes.push({ de: a.from.step, port: a.from.port || 'out', vers: a.to.step });
    });
    liste.forEach(function (e) {
      if (!e || typeof e !== 'object' || typeof e.core !== 'string') return;
      // Les post-its ne sont pas des étapes : ni comptés, ni versionnés, ni
      // traduits. Les inclure gonflait le compte de 23 à 44.
      if (e.core === 'postit') return;
      p.etapes.push({ id: e.id, core: e.core, facade: e.facade || null,
                      label: e.label || e.facade || e.core, parent: parent || null,
                      etape: e });
      // Le corps d'une boucle est un SOUS-DOCUMENT `{steps, edges}`, pas une
      // liste — d'où la boucle jamais détectée tant qu'on cherchait un tableau.
      if (e.body) visiter(Array.isArray(e.body) ? { steps: e.body } : e.body, e.id);
    });
  })(doc, null);

  const out = [];
  portees.forEach(function (p, cle) {
    const ordonnees = ordonnerParFlux(p.etapes, p.aretes);
    if (cle === null) out.unshift.apply(out, ordonnees);
    else out.push.apply(out, ordonnees);
  });
  return out;
}

// ── LE STATUT D'UN ÉCART ────────────────────────────────────────
// Une gravité ne dit pas quoi faire. Vingt-deux écarts du même orange laissent
// croire à vingt-deux obstacles, alors qu'il y en a deux. Chacun porte donc la
// VOIE à prendre :
//
//   à câbler       on sait comment, c'est du travail — et depuis que les
//                  ressources vivent dans un Data Store, on sait DANS QUOI :
//                  un module de lecture en amont, une clé, une valeur mappée.
//   à provisionner rien à câbler : une connexion se crée une fois chez la
//                  cible, avec son secret. Ce n'est pas de la traduction.
//   à relire       la limite est NOTRE analyse, pas la cible.
//   à trancher     une décision de conception, en amont.
//   bloquant       rien ne passe.
//   à construire   l'étape n'a rien à écrire chez la cible.
const STATUTS = {
  a_construire:   { libelle: 'à construire',   consequence: 'ecrire' },
  a_provisionner: { libelle: 'à provisionner', consequence: 'tourner' },
  a_cabler:       { libelle: 'à câbler',       consequence: 'fausser' },
  a_relire:       { libelle: 'à relire',       consequence: 'fausser' },
  a_trancher:     { libelle: 'à trancher',     consequence: 'lire' },
  bloquant:       { libelle: 'bloquant',       consequence: 'ecrire' },
};

// ── LE STATUT DIT QUOI FAIRE, LA CONSÉQUENCE DIT CE QUE ÇA COÛTE ─
// Deux axes, et l'écran n'en montrait qu'un. « à câbler », « à relire », « à
// provisionner » répondent tous à « qu'est-ce que j'ai à faire » — la question
// de celui qui fait le travail. Personne ne répondait à « est-ce que ça va
// marcher », qui est la question de celui qui décide. Ce sont des questions
// différentes : deux écarts peuvent demander le même geste et ne pas coûter la
// même chose du tout.
//
// L'ordre ci-dessous est celui de la gravité, et le verdict prend le PIRE
// présent — un scénario qu'on ne sait pas écrire ne se rattrape pas en
// corrigeant la lisibilité d'un verbe.
const CONSEQUENCES = {
  ecrire:  { rang: 3, libelle: 'empêche d\'écrire',
             dit: 'l\'étape n\'a rien à écrire chez la cible' },
  tourner: { rang: 2, libelle: 'empêche de tourner',
             dit: 'ça s\'écrit, mais le scénario ne s\'exécutera pas' },
  fausser: { rang: 1, libelle: 'fausse le résultat',
             dit: 'ça tourne sans erreur, et produit le mauvais résultat' },
  lire:    { rang: 0, libelle: 'n\'empêche rien',
             dit: 'ça tourne juste ; c\'est la lecture qui souffre' },
};

// La phrase du haut. Elle répond aux deux questions dans l'ordre où on se les
// pose : est-ce que je peux y aller, et est-ce que ça marchera.
//
// Un scénario qui livre au mauvais endroit sans lever d'erreur est PIRE qu'un
// scénario qui s'arrête : « fonctionnel » veut donc dire « produit le bon
// résultat », jamais « ne plante pas ».
const APTITUDES = {
  ecrire:  { cle: 'non_emettable', titre: 'Pas émettable en l\'état',
             phrase: 'Une étape au moins n\'a rien à écrire chez la cible : le scénario produit serait incomplet.' },
  tourner: { cle: 'ne_tournera_pas', titre: 'Émettable, ne tournera pas',
             phrase: 'Le scénario s\'écrit et Make l\'acceptera, mais il ne s\'exécutera pas en l\'état.' },
  fausser: { cle: 'resultat_faux', titre: 'Émettable et exécutable — résultat faux',
             phrase: 'Le scénario tournera sans lever d\'erreur, et ne produira pas le bon résultat.' },
  lire:    { cle: 'fidele', titre: 'Émettable, exécutable, fidèle',
             phrase: 'Rien n\'empêche ni ne fausse ; ce qui reste ne coûte qu\'à la lecture.' },
  aucune:  { cle: 'fidele', titre: 'Émettable, exécutable, fidèle',
             phrase: 'Aucun écart relevé sur ce workflow.' },
};

function aptitudeDe(ecarts) {
  let pire = null;
  ecarts.forEach(function (x) {
    const c = CONSEQUENCES[x.consequence];
    if (c && (!pire || c.rang > CONSEQUENCES[pire].rang)) pire = x.consequence;
  });
  const a = APTITUDES[pire || 'aucune'];
  return { cle: a.cle, titre: a.titre, phrase: a.phrase, pire: pire || null };
}

// ── UNE RÉFÉRENCE DE RESSOURCE ──────────────────────────────────
// Ces champs valaient à eux seuls 16 des 22 écarts, tous du même orange et tous
// disant la même chose : « APS n'est pas là en production, ça devient une saisie
// libre ». Ce n'est plus vrai — les ressources ont été portées, et une clé
// connue vaut mieux qu'un aveu d'impuissance. Trois choses ont changé.
//
// 1. UN CHAMP VIDE N'EST PAS UN ÉCART. On lisait le schéma du VERBE, jamais la
//    configuration de l'ÉTAPE : `aws_s3.deliver` déclare un manifeste, donc les
//    trois Deliver de PUBLISH en comptaient un — alors que deux d'entre eux
//    n'en désignent aucun. Il n'y a rien à câbler pour une référence que
//    l'étape ne fait pas.
//
// 2. UNE CONNEXION N'EST PAS UNE DONNÉE. Elle n'a délibérément pas été portée :
//    elle porte un secret, et le mettre dans un Data Store reviendrait à le
//    sortir de son coffre pour le poser sur une étagère. Chez Make une
//    connexion est native et attachée au module. Ce n'est pas du câblage, c'est
//    un provisionnement — d'où un statut à part.
//
// 3. LE RESTE A UNE CLÉ. On peut nommer le store, la clé exacte, et la
//    ressource qu'elle désigne. Ce qui reste à faire n'est plus « trouver
//    comment », c'est « insérer le module de lecture ».
function ecartDeRessource(c, etape, noms) {
  const valeur = ((etape && etape.params) || {})[c.chemin];
  if (valeur === undefined || valeur === null || valeur === '') return null;

  if (c.nature === 'connexion') {
    // `filtreType` est le seul indice STRUCTURÉ de la plateforme visée — une
    // seule connexion en porte un aujourd'hui (`aws_s3`). Le reste ne se
    // devine pas : les libellés disent « falls back to the flow's platform »,
    // mais lire une intention dans un libellé anglais, c'est reconstruire une
    // donnée à partir de son affichage.
    const app = c.filtreType ? ' « ' + c.filtreType + ' »' : '';
    return { gravite: 'degrade', statut: 'a_provisionner', quoi: c.chemin,
             pourquoi: 'une connexion' + app + ' ne se transporte pas : elle porte un '
                     + 'secret, et chez la cible elle est native, attachée au module',
             voie: 'créer la connexion chez la cible une fois, à la main' };
  }

  const r = PORT.RESOLUTION[c.nature];
  if (!r) {
    return { gravite: 'degrade', statut: 'a_cabler', quoi: c.chemin,
             pourquoi: `ressource APS « ${c.nature} » : aucune règle de portage`,
             voie: 'déclarer la ressource dans scripts/porter-ressources-make.js' };
  }
  const cle = PORT.cleDe(c.nature, valeur);
  const nom = noms.get(cle) || null;
  // Le texte ne redit PAS le store ni la clé : la colonne d'à côté les affiche
  // déjà, en toutes lettres, sur la ligne du module de lecture. Une phrase qui
  // répète la colonne voisine fait deux fois le bruit et une fois l'information.
  return {
    gravite: 'degrade', statut: 'a_cabler', quoi: c.chemin,
    pourquoi: nom ? 'ressource portée chez la cible — « ' + nom + ' » se lit dans un Data Store'
                  : 'référence sans correspondance dans APS : la clé ne pointe sur rien, '
                  + 'ici comme chez la cible',
    voie: 'lire l\'enregistrement en amont et mapper la valeur'
        + (r.reserve ? ' — ' + r.reserve : ''),
    // La forme structurée voyage avec le texte : c'est elle qui permet de
    // prédire le module de lecture, plus bas.
    ressource: { store: PORT.STORE_PARTAGE, cle, nom, pour: c.chemin,
                 reserve: r.reserve || null, existe: !!nom },
  };
}

// Les écarts d'un verbe, lus dans `NodeDefinition` — jamais dans le code du
// moteur. C'est la raison d'être de ce modèle.
function ecartsDuVerbe(nd, etape, noms) {
  const out = [];
  if (!nd) return [{ gravite: 'bloquant', statut: 'bloquant', quoi: '(verbe inconnu)',
                     pourquoi: 'aucune définition dérivée pour ce verbe',
                     voie: 'dériver le catalogue (scripts/derive-verbes.js)' }];
  const champs = (nd.configSchema && nd.configSchema.champs) || [];
  champs.forEach(function (c) {
    if (!c.nature || c.chemin === 'label') return;
    if (RENDU.AFFICHAGE.includes(c.nature)) return;   // décor : sans conséquence
    if (RENDU.RESSOURCES_APS.includes(c.nature)) {
      const e = ecartDeRessource(c, etape, noms);
      if (e) out.push(e);
    } else if (!RENDU.TYPE[c.nature] && !RENDU.LISTES[c.nature]) {
      out.push({ gravite: 'degrade', statut: 'a_trancher', quoi: c.chemin,
                 pourquoi: `nature « ${c.nature} » sans équivalent chez la cible`,
                 voie: 'choisir un type de remplacement, ou retirer le champ' });
    }
  });
  // Plusieurs discriminants : les conditions ne peuvent plus s'inverser en
  // `nested`, tous les paramètres s'affichent d'un coup.
  const cond = champs.filter(c => c.visibleSi && c.visibleSi.termes && c.visibleSi.termes.length);
  const pivots = [...new Set(cond.flatMap(c => c.visibleSi.termes.map(t => t.champ)))];
  if (pivots.length > 1) {
    out.push({ gravite: 'degrade', statut: 'a_trancher', quoi: pivots.join(' + '),
               pourquoi: `${pivots.length} discriminants : les ${cond.length} conditions de visibilité s'aplatissent, tous les champs s'affichent ensemble`,
               voie: 'scinder le verbe en amont — aucun mécanisme de la cible ne rendra ça lisible' });
  }
  ((nd.description && nd.description.requetes) || []).forEach(function (r) {
    (r.champs || []).forEach(function (c) {
      if (c.source === 'parametre' || c.source === 'constante') return;
      // « Non traduisible » était faux : une concaténation de chaîne s'exprime
      // très bien chez la cible. C'est l'extracteur de `mesure-facades.js` qui
      // n'a pas su la lire. La phrase change, et le statut avec.
      out.push({ gravite: 'degrade', statut: 'a_relire', quoi: (r.cas ? r.cas + ' · ' : '') + c.cle,
                 pourquoi: 'valeur assemblée dans le moteur, que notre analyse n\'a pas su extraire',
                 voie: 'étendre l\'extraction, ou écrire l\'expression à la main' });
    });
  });
  return out;
}

// Le NOM des ressources référencées. Une clé seule (`manifeste:cms78isly…`) ne
// se relit pas ; « Livraison VOD Factory | PRIME » se relit. Et l'absence est
// une information à part entière : une clé qui ne pointe sur rien dans APS ne
// pointera sur rien chez la cible non plus.
//
// On ne vérifie PAS la présence de la ligne chez Make. C'est un plan : il se
// calcule hors ligne, et la cible se vérifie au moment de soumettre — sans
// compter que le compte est plafonné à 60 requêtes par minute.
async function nomsDesRessources() {
  const noms = new Map();
  const vus = new Set();
  for (const nature of Object.keys(PORT.RESOLUTION)) {
    const r = PORT.RESOLUTION[nature];
    if (vus.has(r.type)) continue;            // `endpoint` et `endpoints` visent le même
    vus.add(r.type);
    if (!prisma[r.modele]) continue;
    const lignes = await prisma[r.modele].findMany({ select: { id: true, name: true } });
    lignes.forEach(l => noms.set(r.type + ':' + l.id, l.name));
  }
  return noms;
}

// ── CE QUE LA LECTURE COÛTE EN MODULES ──────────────────────────
// Une app custom ne peut PAS lire un Data Store depuis son `api` : les Data
// Stores sont natifs Make. Le montage réel est donc *module Data Store → notre
// module*, et il ne se joue pas dans l'app mais dans le SCÉNARIO. Chaque
// référence de ressource ajoute donc un module EN AMONT de l'étape qui s'en
// sert — c'est la forme du scénario qui change, pas seulement un libellé.
//
// Mais pas une par étape : lue une fois, la valeur reste disponible en aval du
// scénario. On dédoublonne donc par scénario et par clé — sur PUBLISH, le même
// manifeste sert quatre étapes et ne se lit qu'une. Les suivantes REPRENNENT,
// et disent de qui.
function prevoirLectures(groupes) {
  groupes.forEach(function (g) {
    const deja = new Map();                   // clé -> libellé de l'étape qui l'a lue
    g.etapes.forEach(function (e) {
      e.prealables = [];
      e.reprises   = [];
      (e.ecarts || []).forEach(function (x) {
        if (!x.ressource) return;
        const r = x.ressource;
        if (deja.has(r.cle)) { e.reprises.push({ cle: r.cle, de: deja.get(r.cle), pour: r.pour }); return; }
        deja.set(r.cle, e.label);
        e.prealables.push({ module: 'Data Store — Get a record', store: r.store,
                            cle: r.cle, nom: r.nom, pour: r.pour,
                            reserve: r.reserve, existe: r.existe });
      });
    });
  });
}

router.get('/builder-flows/:id/interpretation', async (req, res) => {
  try {
    const cle = String(req.query.cible || 'make').toLowerCase();
    const cible = CIBLES[cle];
    if (!cible) return res.status(400).json({ error: 'Cible inconnue : ' + cle });

    const flux = await prisma.builderFlow.findUnique({ where: { id: req.params.id } });
    if (!flux) return res.status(404).json({ error: 'Workflow non trouvé' });

    const etapes = etapesDe(flux.document);
    // Les arêtes, racine et corps de boucle confondus : c'est le graphe qu'on
    // veut montrer, pas une liste ordonnée.
    const aretes = [];
    (function recolter(doc) {
      (doc && doc.edges || []).forEach(function (a) {
        if (!a || !a.from || !a.to) return;
        aretes.push({ de: a.from.step, port: a.from.port || 'out', vers: a.to.step });
      });
      (doc && doc.steps || []).forEach(function (e) {
        if (e && e.body) recolter(Array.isArray(e.body) ? { steps: e.body } : e.body);
      });
    })(flux.document);
    const defs = await prisma.nodeDefinition.findMany();
    const parFamille = new Map(defs.map(d => [d.family, d]));
    const noms = await nomsDesRessources();

    // Les manifestes RÉFÉRENCÉS, par id. Seul contenu de ressource dont le plan
    // ait besoin : c'est lui qui nomme les sorties de Deliver (`essences[].sortie`).
    // Les autres ressources ne servent ici que par leur nom, déjà chargé.
    const manifestes = {};
    {
      const ids = new Set();
      etapes.forEach(function (e) {
        const id = e.etape && e.etape.params && e.etape.params.manifestId;
        if (id) ids.add(id);
      });
      if (ids.size) {
        const lignes = await prisma.manifest.findMany({ where: { id: { in: [...ids] } } });
        lignes.forEach(m => { manifestes[m.id] = m; });
      }
    }

    // Découpage en scénarios. La seule couture qu'on sache justifier aujourd'hui
    // est le corps de boucle ; elle est donc la seule appliquée, et sa RAISON
    // voyage avec elle plutôt qu'en note de bas de page.
    const groupes = [{ nom: 'Scénario 1', role: 'entrée', raison: null, etapes: [] }];
    const groupeDe = new Map();
    etapes.forEach(function (e) {
      let g;
      if (e.parent) {
        if (!groupeDe.has(e.parent)) {
          groupes.push({ nom: 'Scénario ' + (groupes.length + 1), role: 'corps de boucle',
                         raison: cible.decoupe, appelePar: 'Scénario 1', etapes: [] });
          groupeDe.set(e.parent, groupes.length - 1);
        }
        g = groupes[groupeDe.get(e.parent)];
      } else { g = groupes[0]; }

      const nd = parFamille.get(e.facade || e.core);
      const ecarts = ecartsDuVerbe(nd, e.etape, noms);
      const rendu = nd && nd.description && nd.description.rendus && nd.description.rendus.make;
      // « Outil natif » ne veut PAS dire « pas de façade ». `verify` et `wait`
      // sont des Cores qui appellent le réseau ; `lookup` est pur mais porte une
      // référence de correspondance. Aucun des trois ne se rend en outil natif
      // de Make. Écrire « natif » sur eux revenait à annoncer une traduction
      // gratuite tout en listant, deux lignes plus bas, ce qu'elle perdrait.
      const provenance = (nd && nd.description && nd.description.provenance) || [];
      const porteRessourceAps = ((nd && nd.configSchema && nd.configSchema.champs) || [])
        .some(c => RENDU.RESSOURCES_APS.includes(c.nature));
      const natif = !e.facade
        && (!provenance.length || provenance.every(p => p === 'pure'))
        && !porteRessourceAps;
      // Les ports réels de l'étape : le catalogue sait les calculer, y compris
      // ceux d'une décision qui dépendent de sa configuration.
      let ports = [];
      try { ports = CAT.portsDe(e.etape) || []; } catch (_) { ports = []; }
      // D'où vient l'étape. Deux nœuds peuvent porter le MÊME libellé — une
      // copie et son original — et rien ne les distinguait à l'écran. Ce qui
      // les sépare est justement ce à quoi ils sont reliés.
      const depuis = aretes.filter(a => a.vers === e.id).map(function (a) {
        const src = etapes.find(x => x.id === a.de);
        return { de: src ? src.label : a.de, port: a.port };
      });
      // Ni module dédié, ni équivalent natif. C'était jusqu'ici un simple texte
      // gris — « aucun module » — qui ne produisait AUCUN écart, donc ne
      // comptait nulle part : l'écran annonçait « 0 bloquantes » alors que
      // trois étapes de PUBLISH n'avaient rien à écrire, et `Wait` figurait
      // même parmi les « traduites ». Un manque qui ne pèse rien est un manque
      // qu'on ne verra pas.
      //
      // Le mot « déclaré » n'est pas de trop : c'est NOTRE catalogue qui est
      // muet, pas la cible qui est incapable. `wait` ressemble beaucoup à
      // `util:FunctionSleep`, et `lookup` à `datastore:SearchRecord` — tous
      // deux vus dans les scénarios réels de l'équipe.
      // Une composition n'est pas un module, mais ce n'est pas rien : c'est une
      // suite de modules natifs, et elle s'écrit. Un verbe qui en a une cesse
      // donc d'être orphelin — « rien à écrire » était vrai au sens strict
      // (aucun module unique) et faux au sens utile.
      const compo = RENDU.compositionDe(e.facade || e.core, (e.etape && e.etape.params) || {});
      const orphelin = !rendu && !natif && !compo;
      if (orphelin) {
        ecarts.unshift({ gravite: 'bloquant', statut: 'a_construire', quoi: e.facade || e.core,
                         pourquoi: 'aucun module ni équivalent natif déclaré pour ce verbe : '
                                 + 'il n\'y a rien à écrire dans le scénario',
                         voie: 'rendre un module dans l\'app custom, ou déclarer '
                             + 'l\'outil natif de la cible qui en tient lieu' });
      }
      // La conséquence se déduit du statut : elle ne se saisit nulle part, sans
      // quoi deux écarts de même statut finiraient par ne plus coûter la même
      // chose selon qui a rempli le champ.
      ecarts.forEach(function (x) {
        const st = STATUTS[x.statut];
        x.consequence = st ? st.consequence : 'fausser';
      });

      g.etapes.push({
        id: e.id, label: e.label, verbe: e.facade || e.core, depuis: depuis,
        injoignable: !!e.injoignable,
        core: e.core, ports: ports,
        // La composition l'emporte sur la forme générique : « chaîne déroulée
        // de 23 modules » dit infiniment plus que « un module dans la suite ».
        construit: compo ? { forme: 'composition', dit: compo.dit + ' · ' + compo.nombre + ' modules',
                             pourquoi: compo.pourquoi }
                         : construitPar(e.core, ports),
        module: rendu ? rendu.module : null,
        // La configuration de l'étape voyage avec le plan : c'est elle que
        // l'émetteur recopie dans les `parameters` du module. Sans elle, il
        // n'émettrait qu'un squelette — des modules justes, vides de tout
        // réglage.
        params: (e.etape && e.etape.params) || {},
        // CE QUE L'ÉTAPE PRODUIT, nommé. Un émetteur ne peut traduire une
        // référence qu'à condition de savoir quelle étape la pose : ni Make ni
        // ASL n'ont d'espace de noms global, donc une variable dont personne
        // ne se déclare l'auteur est intraduisible par construction.
        // Le catalogue le sait déjà pour la plupart des verbes ; Deliver avait
        // besoin de son manifeste pour nommer ses sorties (`s3_*_url`), d'où
        // `manifestes` passé ici.
        produit: CAT.variablesDe(e.etape || e, { manifests: manifestes }).map(v => v.nom),
        composition: compo,
        natif: natif,
        orphelin: orphelin,
        // L'état suit la CONSÉQUENCE, plus la gravité : une étape qu'on ne sait
        // pas écrire ou qui ne tournera pas est bloquante, quoi qu'en dise son
        // libellé.
        etat: ecarts.some(x => x.consequence === 'ecrire' || x.consequence === 'tourner')
                ? 'bloquant'
            : ecarts.length ? 'degrade' : 'traduit',
        ecarts,
      });
    });

    // Les post-its ne partent que si on le demande : c'est une option, pas un
    // défaut, et elle n'a pas à encombrer l'écran.
    const veutNotes = String(req.query.postits || '') === '1';
    const notes = veutNotes ? postitsDe(flux.document, etapes.map(e => e.id)) : [];
    if (veutNotes) {
      const parEtape = new Map();
      notes.forEach(function (n) {
        if (!n.sur) return;
        if (!parEtape.has(n.sur)) parEtape.set(n.sur, []);
        parEtape.get(n.sur).push(n);
      });
      groupes.forEach(g => g.etapes.forEach(function (e) {
        e.notes = parEtape.get(e.id) || [];
      }));
    }

    prevoirLectures(groupes);
    const toutes = groupes.flatMap(g => g.etapes);
    const lectures = toutes.reduce((n, e) => n + (e.prealables || []).length, 0);
    res.json({
      flux: { id: flux.id, nom: flux.name },
      cible: { cle, nom: cible.nom, pret: cible.pret },
      ciblesDisponibles: Object.entries(CIBLES).map(([k, v]) => ({ cle: k, nom: v.nom, pret: v.pret })),
      statuts: Object.entries(STATUTS).map(function (kv) {
        return { cle: kv[0], libelle: kv[1].libelle, consequence: kv[1].consequence,
                 nombre: toutes.reduce(function (n, e) {
                   return n + (e.ecarts || []).filter(x => x.statut === kv[0]).length; }, 0) };
      }).filter(x => x.nombre),
      // Le même relevé, vu par l'autre bout : ce que ça coûte, plutôt que ce
      // qu'il y a à faire. Les deux listes portent les mêmes écarts.
      consequences: Object.entries(CONSEQUENCES)
        .sort((a, b) => b[1].rang - a[1].rang)
        .map(function (kv) {
          return { cle: kv[0], libelle: kv[1].libelle, dit: kv[1].dit,
                   nombre: toutes.reduce(function (n, e) {
                     return n + (e.ecarts || []).filter(x => x.consequence === kv[0]).length; }, 0) };
        }).filter(x => x.nombre),
      aptitude: aptitudeDe(toutes.flatMap(e => e.ecarts || [])),
      verdict: {
        etapes: toutes.length,
        traduites: toutes.filter(e => e.etat === 'traduit').length,
        degradees: toutes.filter(e => e.etat === 'degrade').length,
        bloquantes: toutes.filter(e => e.etat === 'bloquant').length,
        scenarios: groupes.length,
        // Les lectures de ressource ne sont pas des étapes du workflow : ce
        // sont des modules que la CIBLE exige en plus. Les compter à part est
        // la seule façon honnête de le dire — les mêler aux étapes ferait
        // croire que le workflow en compte davantage qu'il n'en a.
        lectures: lectures,
        // Le coût réel en modules chez la cible. 28 étapes ne font pas 28
        // modules : une seule attente en vaut une vingtaine à elle seule, et
        // c'est exactement ce que les collègues ont payé à la main. Sans ce
        // chiffre, « 2 scénarios » laisse croire à quelque chose de petit.
        modules: toutes.reduce(function (n, e) {
          return n + (e.composition ? e.composition.nombre : 1)
                   + (e.prealables || []).length; }, 0),
      },
      groupes,
      aretes,
      notes: { demandees: veutNotes, total: notes.length,
               orphelines: notes.filter(n => !n.sur).length },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
