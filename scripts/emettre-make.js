// APS — scripts/emettre-make.js — créé le 2026-08-11
// ================================================================
// Le premier ÉMETTEUR : d'un workflow APS à un blueprint Make.
//
//   node scripts/emettre-make.js <idFlux>            écrit le blueprint, n'envoie rien
//   node scripts/emettre-make.js <idFlux> --ecrire   crée le scénario chez la cible
//   node scripts/emettre-make.js <idFlux> --ecrire --garder   ne le supprime pas
//
// ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ────────────────
// Jusqu'ici tout ce qu'on avait construit était un DICTIONNAIRE : un verbe →
// un module, une ressource → une clé. Un dictionnaire ne fait pas une phrase.
// Émettre demande de décider d'un ORDRE, de brancher des routes, de nommer des
// références entre modules — c'est ce que fait ce fichier.
//
// Il ne réinvente aucune correspondance : elles viennent de `rendre-make.js`
// (verbes, compositions) et de `porter-ressources-make.js` (clés de ressources),
// exactement comme l'écran d'interprétation les lit. Trois lecteurs, une seule
// source ; une quatrième table aurait divergé au premier changement.
//
// ── CE QU'IL NE SAIT PAS ENCORE FAIRE ───────────────────────────
// Il émet le SQUELETTE : les modules, dans l'ordre du flux, avec leurs routes,
// leurs lectures de ressources et leurs post-its. Il ne remplit pas encore les
// paramètres de chaque module — c'est le travail suivant, et il dépend des
// corps de requête que l'extracteur n'a pas tous su lire.
//
// Émettre un squelette juste avant de remplir des paramètres est délibéré : la
// forme est ce qui casse quand on se trompe d'architecture, et c'est elle qu'il
// faut prouver en premier. Un blueprint refusé par Make ne se répare pas en
// corrigeant une valeur de champ.
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { decrypt }      = require('../server/lib/crypto.js');
const Acces            = require('../server/lib/connexion-acces.js');
const RENDU            = require('./rendre-make.js');
const PORT             = require('./porter-ressources-make.js');

const ID      = process.argv[2];
const ECRIRE  = process.argv.includes('--ecrire');
const GARDER  = process.argv.includes('--garder');
// Les modules de notre app ne sont pas résolvables tant que l'app n'est pas
// FIGÉE chez la cible, et le figeage demande un droit que le jeton n'a pas
// (`apps commit` → 403). Ce mode les remplace par un module natif inerte pour
// prouver ce dont l'émetteur EST responsable — la forme du scénario : l'ordre,
// les aiguillages, l'imbrication, les gestionnaires d'erreur.
//
// Séparer les deux échecs vaut mieux que d'attendre le droit : si la forme est
// fausse, le droit ne l'aurait pas sauvée.
const SANS_APP = process.argv.includes('--sans-app');

const ENTRE_APPELS = 1100;
let dernier = 0;
async function ap(a, m, c, b) {
  const attente = ENTRE_APPELS - (Date.now() - dernier);
  if (attente > 0) await new Promise(r => setTimeout(r, attente));
  dernier = Date.now();
  const o = { method: m, headers: Object.assign({ Accept: 'application/json' }, a.headers) };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(a.baseUrl + c, o);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { statut: r.status, corps: j, brut: t.slice(0, 300), ok: r.status >= 200 && r.status < 300 };
}

// ── LA POSITION D'UN MODULE ─────────────────────────────────────
// Make range ses modules sur une ligne, de 300 en 300. Ce n'est pas cosmétique :
// un blueprint sans `designer.x` s'ouvre en tas chez le lecteur, et le premier
// geste du collègue qui reprend le travail est de tout replacer à la main.
const PAS_X = 300, PAS_Y = 180;

// ── LA VERSION D'UN MODULE NATIF ────────────────────────────────
// Chaque module natif porte SA version, et Make refuse le blueprint quand elle
// est fausse — « Module not found 'http:ActionSendData' version '1' ». Poser 1
// partout paraissait anodin ; c'est un module introuvable sur trois.
//
// Ces valeurs sont RELEVÉES dans leurs 72 scénarios, pas supposées. Une version
// absente de cette table est un module qu'on n'a jamais vu tourner chez eux, et
// c'est un aveu utile : mieux vaut ne pas l'émettre que le deviner.
const VERSIONS = {
  'http:ActionSendData':     3,
  'util:SetVariables':       1,
  'util:SetVariable2':       1,
  'util:FunctionSleep':      1,
  'builtin:BasicRouter':     1,
  'builtin:BasicFeeder':     1,
  'builtin:BasicAggregator': 1,
  'datastore:SearchRecord':  1,
  'gateway:CustomWebHook':   1,
};

// Lire une ressource par sa clé. `datastore:GetRecord` semblait le module
// évident — il n'apparaît dans AUCUN de leurs 72 scénarios, alors que
// `datastore:SearchRecord` y tourne. On émet donc celui qu'on a vu vivre
// plutôt que celui dont le nom sonne juste.
const LIRE_RESSOURCE = 'datastore:SearchRecord';

// ── COMMENT UN MODULE D'APP CUSTOM SE DÉSIGNE ───────────────────
// `apssonde28365-9782b8:iconikSearch` semblait évident — c'est la forme de
// tous les modules natifs (`aws-s3:uploadFile`, `http:ActionSendData`). Elle
// est fausse pour une app custom, qui porte un préfixe :
//
//     app#apssonde28365-9782b8:iconikAction
//
// Huit variantes essayées à l'aveugle, toutes refusées, dont `app:` — à un
// caractère près. Ce qui a tranché n'est aucune d'elles : c'est un scénario
// posé À LA MAIN dans l'éditeur puis relu par l'API. La cible sait dire ce
// qu'elle attend, à condition de le lui demander au bon endroit.
//
// J'avais imputé l'échec au droit `apps commit` manquant. C'était une
// inférence tirée d'un 403 voisin, et elle était fausse : l'app est
// parfaitement utilisable par son équipe. Le droit ne sert qu'à figer une app
// pour la distribuer — jamais à s'en servir chez soi.
const PREFIXE_APP = 'app#';

// ── LA CONFIGURATION D'UN MODULE ────────────────────────────────
// Un module d'app custom prend ses réglages dans `parameters`, PAS dans
// `mapper` — les modules natifs font l'inverse, et j'avais appliqué la règle
// des natifs à tout le monde. Le scénario posé à la main le dit sans
// ambiguïté : `{"assetId":"", "onError":"", "actionType":"export_location_trigger"}`.
//
// Les noms coïncident sans travail : `rendre-make.js` déclare chaque paramètre
// sous `c.chemin`, qui est exactement la clé du pivot. C'est le bénéfice d'un
// rendu dérivé plutôt que saisi.
//
// DEUX FAMILLES DE CHAMPS SONT ÉCARTÉES, et pour des raisons opposées :
//
//   les références de ressources — y recopier l'identifiant APS produirait une
//   valeur qui ne désigne rien chez la cible. La valeur doit venir du module
//   Data Store posé juste avant ; ce branchement reste à écrire, et un champ
//   vide se voit alors qu'un identifiant mort passe inaperçu.
//
//   `label` — c'est le nom de l'étape, déjà porté par `designer.name`. En
//   faire aussi un paramètre le ferait diverger à la première renommée.
function parametresDe(plan, etape) {
  const out = {};
  const def = (plan.definitions || {})[etape.verbe];
  const champs = (def && def.champs) || [];
  const params = etape.params || {};
  champs.forEach(function (c) {
    if (c.chemin === 'label') return;
    if (RENDU.RESSOURCES_APS.includes(c.nature)) return;
    if (RENDU.AFFICHAGE.includes(c.nature)) return;
    const v = params[c.chemin];
    if (v === undefined || v === null) return;
    out[c.chemin] = v;
  });
  return out;
}

// ── TRADUIRE UNE RÉFÉRENCE DU PIVOT EN EXPRESSION MAKE ──────────
// APS écrit `{collection.id}` ; Make écrit `{{1.collection_id}}` — le nombre
// désignant le MODULE qui a produit la valeur. Traduire demande donc de savoir
// d'où vient chaque variable, et c'est là que le workflow se fait mesurer.
//
// Sur PUBLISH : 16 références distinctes, dont 7 traçables — le déclencheur ou
// une étape amont qui déclare un `resultVar`. Les 9 autres (`exportJobId`,
// `now`, sept `s3_*_url`) ne sont produites par AUCUNE étape déclarée. Ce sont
// des variables d'ambiance, et le moteur d'APS les tolère parce qu'il a un
// espace de noms global.
//
// Make n'en a pas. ASL non plus. Une référence orpheline n'est donc pas un
// détail d'émission : c'est une dépendance invisible du workflow, qui ne
// survivra à aucun portage. On les laisse telles quelles et on les COMPTE —
// les traduire au jugé produirait un scénario qui a l'air complet et qui lit
// des valeurs vides.
function traducteurDe(plan) {
  // Quelle étape produit quelle variable.
  const parVariable = new Map();
  // Le CHAMP à lire chez la cible, quand il ne se confond pas avec « la
  // première sortie du module ».
  const champProduit = new Map();
  (plan.groupes || []).flatMap(g => g.etapes).forEach(function (e) {
    const p = e.params || {};
    ['resultVar', 'lkOutputVar', 'varName'].forEach(function (k) {
      if (p[k]) parVariable.set(String(p[k]), e.id);
    });
    // `produit` vient du catalogue, via le plan : ce que l'étape est CONNUE
    // pour poser, au-delà des trois champs de configuration ci-dessus. C'est
    // par lui que les sorties de Deliver (`s3_cover_url`…) cessent d'être des
    // orphelines — leur nom est dans le manifeste, il fallait le remonter.
    (e.produit || []).forEach(function (nom) {
      if (!nom || parVariable.has(String(nom))) return;
      parVariable.set(String(nom), e.id);
      // Une étape qui pose PLUSIEURS variables nommées les expose sous ces
      // noms-là : `{s3_cover_url}` se lit `{{42.s3_cover_url}}`, pas « premier
      // champ du module ». Sans cette précision, la référence désignait le bon
      // module et le mauvais champ — une erreur plus sournoise que l'absence,
      // parce qu'elle a l'air résolue.
      champProduit.set(String(nom), String(nom));
    });
  });

  // À quel scénario appartient chaque étape : une référence qui traverse la
  // frontière ne peut PAS devenir une référence de module.
  const groupeDe = new Map();
  (plan.groupes || []).forEach(function (g, i) {
    (g.etapes || []).forEach(e => groupeDe.set(e.id, i));
  });

  // Make a ses propres constantes. `now` en est une, et la traduire vaut mieux
  // que la déclarer orpheline.
  const CONSTANTES = { now: '{{now}}' };

  const orphelines = new Map();
  const traversantes = new Map();
  const sansChamp = new Map();
  const fonctions = new Map();
  return {
    orphelines: orphelines,
    traversantes: traversantes,
    sansChamp: sansChamp,
    fonctions: fonctions,
    // `moduleDe` est rempli au fil du parcours : une étape productrice est
    // toujours posée avant celles qui la consomment, l'ordre du flux le
    // garantit.
    traduire: function (valeur, moduleDe, idDeclencheur) {
      if (typeof valeur !== 'string') return valeur;
      // Nommée et récursive : une référence peut en contenir une autre —
      // `{filebase(item.title)}` est une fonction dont l'argument est une
      // référence ordinaire. Un callback anonyme ne pouvait pas se rappeler.
      const resoudre = function (tout, ref) {
        // UN APPEL DE FONCTION N'EST PAS UNE VARIABLE. `{filebase(item.title)}`
        // était compté « sans origine déclarée » alors que `item.title` est
        // parfaitement produit : ce qui manque n'est pas la donnée, c'est
        // l'équivalent de `filebase` chez la cible. Confondre les deux fait
        // chercher une étape productrice qui n'a jamais eu à exister, et masque
        // le vrai travail — porter la fonction. On les compte donc à part.
        const appel = ref.match(/^([a-zA-Z_][\w]*)\s*\((.*)\)$/);
        if (appel) {
          fonctions.set(appel[1], (fonctions.get(appel[1]) || 0) + 1);
          const dedans = resoudre('{' + appel[2] + '}', appel[2]);
          return appel[1] + '(' + dedans + ')';
        }
        const racine = ref.split(/[.[]/)[0];
        const reste = ref.slice(racine.length);
        // Le déclencheur : Iconik poste sa charge utile au webhook, qui est le
        // module 1. `{collection.id}` devient `{{1.collection.id}}`.
        if (/^(collection|asset|item|user)$/.test(racine) && idDeclencheur) {
          return '{{' + idDeclencheur + '.' + ref + '}}';
        }
        if (CONSTANTES[racine] && !reste) return CONSTANTES[racine];

        const etape = parVariable.get(racine);
        const m = etape && moduleDe.get(etape);
        if (m) {
          // Une référence NUE — `{{38}}` — ne désigne rien : Make attend un
          // champ. APS range tout le résultat dans une variable, la cible veut
          // savoir lequel de ses champs on lit. À défaut de le savoir, on prend
          // la première sortie DÉCLARÉE du module, qui est l'information la
          // plus proche qu'on ait.
          if (reste) return '{{' + m.id + reste + '}}';
          if (champProduit.has(racine)) return '{{' + m.id + '.' + champProduit.get(racine) + '}}';
          const sorties = (plan.interfaces || {})[m.module] || [];
          const champ = sorties.length ? '.' + sorties[0] : '';
          if (!champ) sansChamp.set(ref, (sansChamp.get(ref) || 0) + 1);
          return '{{' + m.id + champ + '}}';
        }

        // Produite ailleurs, mais dans un AUTRE scénario. Make n'a pas de
        // référence inter-scénarios : la valeur doit voyager dans la charge
        // utile de l'appel webhook. Ce n'est pas une variable manquante, c'est
        // un paramètre d'entrée qui n'a pas encore été déclaré.
        if (etape !== undefined && groupeDe.has(etape)) {
          traversantes.set(ref, (traversantes.get(ref) || 0) + 1);
          return tout;
        }
        orphelines.set(ref, (orphelines.get(ref) || 0) + 1);
        return tout;                       // laissée telle quelle, et comptée
      };
      return valeur.replace(/\{([^{}"':]+)\}/g, resoudre);
    },
  };
}

// Une configuration est un arbre : chaînes, tableaux, objets imbriqués. La
// traduction descend partout — un `{collection.id}` enfoui dans un critère de
// recherche compte autant que celui posé en surface.
function traduireTout(v, trad, moduleDe, idDecl) {
  if (!trad) return v;
  if (typeof v === 'string') return trad.traduire(v, moduleDe, idDecl);
  if (Array.isArray(v)) return v.map(x => traduireTout(x, trad, moduleDe, idDecl));
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach(k => { o[k] = traduireTout(v[k], trad, moduleDe, idDecl); });
    return o;
  }
  return v;
}

// ── L'ÉMETTEUR ──────────────────────────────────────────────────
// `plan` est la sortie de la route d'interprétation : les mêmes groupes, les
// mêmes étapes, les mêmes lectures. Émettre depuis le PLAN et non depuis le
// document pivot est délibéré — ce qu'on émet est alors exactement ce que
// l'écran a montré et que quelqu'un a approuvé.
function emettre(plan, groupe, rang) {
  let id = 1;
  const trad = plan.traducteur;

  const parId = new Map((groupe.etapes || []).map(e => [e.id, e]));
  const sortantes = new Map();
  const aUnAntecedent = new Set();
  (plan.aretes || []).forEach(function (a) {
    if (!parId.has(a.de) || !parId.has(a.vers)) return;   // hors de ce scénario
    if (!sortantes.has(a.de)) sortantes.set(a.de, []);
    sortantes.get(a.de).push(a);
    aUnAntecedent.add(a.vers);
  });

  // Une étape peut valoir plusieurs modules ; on garde donc, pour chacune, le
  // module qui la REPRÉSENTE — c'est lui que les post-its viendront viser.
  const moduleDe = new Map();
  // Chez Make, un module vit à UN seul endroit de l'arbre. Deux branches qui
  // retombent sur la même étape ne peuvent donc pas la partager : la seconde
  // pose un jalon qui dit où aller. Le taire produirait un scénario qui a
  // l'air complet et qui a perdu une branche.
  const deja = new Set();
  // La prochaine ligne libre au niveau le plus haut : une composante détachée
  // ne doit pas se poser sur l'entrée.
  let ligneLibre = 0;

  // Les cases occupées, pour que rien ne se pose sur rien. C'est le prix d'une
  // mise en page qui cherche la ligne la plus PROCHE plutôt que la suivante.
  const occupe = new Set();
  function libre(x, ligne) { return !occupe.has(x + ',' + ligne); }
  function ligneProche(x, depuis) {
    let l = depuis;
    while (!libre(x, l)) l++;
    return l;
  }

  function poser(flow, x, ligne, module, nom, extra) {
    occupe.add(x + ',' + ligne);
    const m = Object.assign({ id: id++, module: module,
                              version: VERSIONS[module] || 1,
                              parameters: {}, mapper: {},
                              metadata: { designer: { x: x, y: ligne * PAS_Y, name: nom } } }, extra || {});
    flow.push(m);
    return m;
  }

  // ── LE PARCOURS ───────────────────────────────────────────────
  // APS est un GRAPHE, Make une CHAÎNE : on ne peut donc pas poser les étapes
  // dans l'ordre d'une liste, il faut SUIVRE les arêtes et refermer chaque
  // branche là où elle vit. Trois traductions se jouent ici :
  //
  //   plusieurs ports    → un Router, une route par port, la suite DEDANS
  //   un port d'erreur   → `onerror`, une pièce accrochée au module
  //   une étape partagée → un jalon, parce que Make ne sait pas la partager
  //
  // C'est la partie qui casse si l'architecture est mal comprise, et c'est
  // pour ça qu'elle passe avant le remplissage des paramètres.
  //
  // ── LA MISE EN PAGE, ET POURQUOI ELLE EST LOCALE ──────────────
  // Chaque appel rend le nombre de LIGNES qu'occupe sa branche, sa propre
  // ligne comprise. C'est ce qui permet de poser une branche JUSTE SOUS la
  // précédente, au plus près de son embranchement.
  //
  // La première version allouait les lignes sur un compteur global : chaque
  // branche descendait d'un cran de plus que la précédente, où qu'elle se
  // trouve horizontalement. Résultat, un peigne à très longues dents — des
  // traits qui plongent sur trois écrans pour rejoindre un module posé tout
  // en haut. Les scénarios écrits à la main chez eux ne font pas ça : leurs
  // routes tiennent en quatre voies serrées autour de leur Router.
  function chainer(flow, depart, x, ligne) {
    let idEtape = depart;
    let hauteur = 1;                 // la branche occupe au moins sa ligne
    const aErreurs = [];             // gestionnaires, posés en dernier
    let routeur = null;              // l'embranchement qui clôt l'épine

    while (idEtape) {
      const e = parId.get(idEtape);
      if (!e) break;
      if (deja.has(idEtape)) {
        poser(flow, x, ligne, 'util:SetVariable2', '↩ rejoint « ' + e.label + ' »');
        break;
      }
      deja.add(idEtape);

      // 1. Les lectures de ressources, AVANT le module qui s'en sert : chez
      //    Make une valeur ne se lit qu'en aval de ce qui la produit.
      (e.prealables || []).forEach(function (p) {
        poser(flow, x, ligne, LIRE_RESSOURCE, 'Lire ' + (p.nom || p.cle), { mapper: { key: p.cle } });
        x += PAS_X;
      });

      // 2. L'étape.
      const sorties = sortantes.get(idEtape) || [];
      const erreurs = sorties.filter(a => /err|erreur|fail|timeout/i.test(a.port));
      const suites  = sorties.filter(a => !erreurs.includes(a));
      let principal;

      if (e.composition) {
        // Un agrégateur DOIT désigner l'itérateur qu'il referme — son « source
        // node ». Sans lui, Make refuse d'enregistrer le scénario : « Array
        // aggregator — Source node is not set », et l'erreur ne se voit qu'au
        // moment de sauver, pas à la création par API. Un blueprint accepté
        // n'est donc pas un blueprint valide.
        //
        // La paire vit dans la même composition : le Feeder qu'on vient de
        // poser est celui que l'agrégateur referme.
        let premier = null, feeder = null;
        e.composition.modules.forEach(function (c) {
          const extra = /Aggregator$/.test(c.module) && feeder
            ? { parameters: { feeder: feeder.id } } : undefined;
          const m = poser(flow, x, ligne, c.module, e.label + ' — ' + c.role, extra);
          if (/Feeder$/.test(c.module)) feeder = m;
          x += PAS_X;
          if (!premier) premier = m;
        });
        principal = premier;
      } else if (RENDU.NATIFS[e.verbe]) {
        // Un équivalent natif l'emporte sur tout : la cible a déjà l'objet, et
        // il fait mieux qu'un module de notre app. Le webhook est le cas qui
        // compte — sans lui, le scénario n'a pas de point d'entrée et Iconik ne
        // peut pas le démarrer.
        const nat = RENDU.NATIFS[e.verbe];
        principal = poser(flow, x, ligne, nat.module, e.label,
          nat.besoin === 'hook' && plan.idHook
            ? { parameters: { hook: plan.idHook, maxResults: 1 } } : undefined);
        x += PAS_X;
      } else if (e.module) {
        // Le CLICHÉ DU SCHÉMA, dans `metadata.parameters`. Un module posé à la
        // main dans l'éditeur le porte ; les nôtres, écrits par API, n'avaient
        // que leur position. Airtable montre le même écart :
        //
        //   airtable   metadata : expect, restore, designer, interface, parameters
        //   nous       metadata : designer
        //
        // C'est la dernière différence structurelle qui reste entre un module
        // qui fonctionne dans l'éditeur et le nôtre. L'hypothèse est que
        // l'éditeur s'appuie sur ce cliché pour savoir ce que le module
        // attend — sa connexion comprise — et qu'à défaut il l'appelle nu.
        principal = poser(flow, x, ligne,
          SANS_APP ? 'util:SetVariable2' : PREFIXE_APP + plan.app + ':' + e.module,
          e.label + (SANS_APP ? ' [' + e.module + ']' : ''),
          // La configuration va dans `mapper`, la connexion SEULE reste dans
          // `parameters` — c'est la forme d'Airtable, et c'est ce qu'impose le
          // partage statique/mappable côté module.
          { mapper: traduireTout(parametresDe(plan, e), trad, moduleDe, plan.idDeclencheur),
            parameters: {},
            metadata: { designer: { x: x, y: ligne * PAS_Y, name: e.label },
                        expect: (plan.schemas || {})[e.module] || [] } });
        // La connexion se pose DANS `parameters`, sous `__IMTCONN__`. Sans
        // elle, le module est là, nommé, configuré — et appelle Iconik en
        // anonyme. C'est le pire des trois états : il a l'air complet.
        if (!SANS_APP && plan.idConnexion) principal.parameters.__IMTCONN__ = plan.idConnexion;
        x += PAS_X;
      } else if (e.core === 'loop') {
        // Frontière de scénario : on pose l'APPEL, pas le corps — le corps est
        // un autre scénario, déclenché par webhook.
        principal = poser(flow, x, ligne, 'http:ActionSendData', e.label + ' — appeler le sous-scénario');
        x += PAS_X;
      } else if (e.core !== 'decision') {
        // Rien à écrire. Un jalon nommé plutôt qu'un trou : un manque
        // silencieux est indétectable à la relecture.
        principal = poser(flow, x, ligne, 'util:SetVariable2', '⚠ ' + e.label + ' — à construire');
        x += PAS_X;
      }

      // 3. Un port d'erreur devient un gestionnaire accroché au module, pas une
      //    arête — c'est LA différence de forme entre les deux architectures.
      //
      //    Mais il se pose PLUS TARD, et c'est tout sauf un détail : dans ce
      //    workflow, `out` et `error` visent souvent la même étape suivante.
      //    Traiter l'erreur d'abord la lui faisait prendre, et tout le chemin
      //    nominal se retrouvait imbriqué sous « sur erreur » — un scénario
      //    dont l'épine dorsale était la gestion d'erreur. Le chemin heureux
      //    passe donc en premier, et l'erreur récupère ce qui reste.
      if (principal && erreurs.length) aErreurs.push({ sur: principal, aretes: erreurs, x: x });

      // 4. La suite. Un seul successeur continue la chaîne ; plusieurs
      //    demandent un Router, et chaque route porte le nom de son port.
      if (e.core === 'decision' || suites.length > 1) {
        // Pour une décision, le Router EST l'étape et porte son nom. Pour une
        // étape ordinaire qui a plusieurs suites, il n'est qu'un aiguillage
        // ajouté par la cible : le dire évite deux modules du même nom, dont
        // l'un n'existe pas dans le workflow source.
        const rt = poser(flow, x, ligne, 'builtin:BasicRouter',
          e.core === 'decision' ? e.label : e.label + ' — aiguillage');
        moduleDe.set(idEtape, principal || rt);
        routeur = { rt: rt, suites: suites, x: x };
        // À la création, une route n'accepte QUE `flow` : ni `metadata`, ni
        // `filter` (« should NOT have additional properties », deux fois).
        // Leurs propres scénarios le confirment — 53 Routers relus, aucune
        // route filtrée à ce niveau.
        //
        // Le nom du port n'a donc nulle part où se poser… sauf dans le premier
        // module de la branche. On l'y écrit, parce que perdre le libellé
        // reviendrait à livrer un embranchement à cinq routes indiscernables :
        // c'est précisément ce qui rend un workflow illisible pour celui qui le
        // reprend. La CONDITION, elle, reste à écrire — une route sans filtre
        // passe toujours, et c'est un manque à afficher, pas à taire.
        break;                        // tout ce qui suit vit dans les routes
      }
      moduleDe.set(idEtape, principal);
      idEtape = suites.length ? suites[0].vers : null;
    }

    // Les routes. La première prolonge la ligne de son Router ; les suivantes
    // se posent immédiatement SOUS ce que la précédente occupe.
    if (routeur) {
      routeur.rt.routes = routeur.suites.map(function (a, i) {
        const sous = [];
        const h = chainer(sous, a.vers, routeur.x + PAS_X,
                          i === 0 ? ligne : ligne + hauteur);
        hauteur = i === 0 ? Math.max(hauteur, h) : hauteur + h;
        if (sous.length) {
          const d = sous[0].metadata.designer;
          d.name = '« ' + a.port + ' » ' + d.name;
        }
        return { flow: sous };
      });
      if (!routeur.rt.routes.length) routeur.rt.routes = [{ flow: [] }];
    }

    // Puis les gestionnaires d'erreur. Ils sont traités EN DERNIER — le chemin
    // heureux choisit ses étapes en premier — mais posés au plus PRÈS de leur
    // module, sur la première ligne libre sous lui.
    //
    // Les renvoyer au bas de la branche, comme le faisait la version d'avant,
    // donnait un peigne à très longues dents : un trait qui plonge sur trois
    // écrans pour relier un module et son gestionnaire, alors que les deux
    // parlent de la même étape. Ce qui se lit ensemble doit se voir ensemble.
    aErreurs.forEach(function (d) {
      d.sur.onerror = d.sur.onerror || [];
      d.aretes.forEach(function (a) {
        const l = ligneProche(d.x, ligne + 1);
        const h = chainer(d.sur.onerror, a.vers, d.x, l);
        hauteur = Math.max(hauteur, l - ligne + h);
      });
    });

    return hauteur;
  }

  const flow = [];
  // L'entrée : ce qu'aucune arête n'atteint. Une composante détachée serait
  // sinon purement perdue, alors qu'elle existe dans le workflow.
  const entrees = (groupe.etapes || []).filter(e => !aUnAntecedent.has(e.id));
  (entrees.length ? entrees : (groupe.etapes || []).slice(0, 1))
    .forEach(function (e) { ligneLibre += chainer(flow, e.id, 0, ligneLibre); });
  (groupe.etapes || []).forEach(function (e) {
    if (!deja.has(e.id)) ligneLibre += chainer(flow, e.id, 0, ligneLibre);
  });

  // 3. Les post-its, accrochés aux modules qui portent leurs étapes.
  const notes = [];
  (groupe.etapes || []).forEach(function (e) {
    (e.notes || []).forEach(function (n) {
      const m = moduleDe.get(e.id);
      if (m) notes.push({ content: n.texte, moduleIds: [m.id] });
    });
  });

  return {
    blueprint: {
      name: plan.flux.nom + (rang ? ' — ' + groupe.nom : ''),
      flow: flow,
      metadata: { instant: false, version: 1,
                  scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true },
                  designer: { orphans: [] } },
    },
    notes: notes,
  };
}

const l = (s, n) => String(s == null ? '' : s).padEnd(n);

(async () => {
  if (!ID) { console.log('Usage : node scripts/emettre-make.js <idFlux> [--ecrire]'); return; }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  // Le plan vient de la route : même calcul, même ordre, mêmes lectures que
  // l'écran. On n'émet pas depuis une seconde lecture du pivot.
  const port = process.env.APS_PORT || 3000;
  const r = await fetch(`http://localhost:${port}/api/builder-flows/${ID}/interpretation?cible=make&postits=1`);
  const plan = await r.json();
  if (!r.ok) { console.log('❌ interprétation : ' + (plan.error || r.status)); return prisma.$disconnect(); }

  // Le nom technique de l'app porte le préfixe des modules.
  const nd = await prisma.nodeDefinition.findFirst({
    where: { description: { path: ['rendus', 'make', 'app'], not: null } } });
  plan.app = (nd && nd.description.rendus.make.app) || 'apssonde28365-9782b8';

  // Les champs déclarés par chaque verbe. Ils viennent de `NodeDefinition`, où
  // ils sont DÉRIVÉS du moteur — pas du plan, qui décrit un workflow et non un
  // vocabulaire.
  const defs = await prisma.nodeDefinition.findMany();
  plan.definitions = {};
  defs.forEach(function (d) {
    plan.definitions[d.family] = { champs: (d.configSchema && d.configSchema.champs) || [] };
  });

  console.log('\n' + plan.flux.nom + ' → ' + plan.cible.nom);
  console.log(plan.aptitude.titre + ' — ' + plan.verdict.etapes + ' étapes, '
    + plan.verdict.modules + ' modules attendus, ' + plan.verdict.scenarios + ' scénario(s)\n');

  // ── LA CONNEXION À LIER ───────────────────────────────────────
  // On la RÉSOUT plutôt que de l'inscrire en dur : une connexion Make porte un
  // identifiant numérique qui change d'un compte à l'autre. Le lien stable est
  // son `accountType`, qui vaut `app#<nom de l'app>` — le même préfixe que les
  // modules.
  //
  // Cette résolution est le pendant exact des clés de Data Store : APS ne
  // transporte pas le secret, il désigne la connexion qui le porte chez la
  // cible.
  const cxMake = await prisma.connexion.findFirst({
    where: { name: { contains: 'MAKE | LUXIRIS | API' } }, include: { platform: true } });
  const accesMake = Acces.construireAcces({
    baseUrl: cxMake.baseUrl, extraConfig: cxMake.extraConfig,
    authValue: cxMake.authValueEnc ? decrypt(cxMake.authValueEnc) : null }, cxMake.platform.authSpec);
  const equipeMake = Number((cxMake.extraConfig.contexteTest || {}).teamId) || 411248;

  // Attention aux deux champs, qui disent l'inverse de ce que leurs noms
  // suggèrent : `accountName` porte le TYPE (`app#apssonde…`, `telegram`,
  // `azure`), et `accountType` porte le mode d'authentification (`basic`,
  // `oauth`). Les intervertir faisait dire « aucune connexion » alors qu'elle
  // venait d'être créée et vérifiée.
  const rc = await ap(accesMake, 'GET', `/connections?teamId=${equipeMake}`);
  const attendu = PREFIXE_APP + plan.app;
  // La PLUS RÉCENTE quand il y en a plusieurs. Une connexion ratée ne se
  // supprime pas toujours (406 tant qu'un scénario la référence), et prendre
  // la première venue faisait rebrancher les scénarios neufs sur l'ancienne,
  // celle dont les identifiants n'étaient pas stockés.
  const mienne = ((rc.corps && rc.corps.connections) || [])
    .filter(c => String(c.accountName) === attendu)
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  plan.idConnexion = mienne ? mienne.id : null;
  console.log('Connexion  : ' + (mienne
    ? mienne.id + ' « ' + mienne.accountName + ' »'
    : '⚠ AUCUNE pour ' + attendu + ' — les modules appelleront en anonyme') + '\n');

  // ── LE DÉCLENCHEUR ────────────────────────────────────────────
  // Un scénario Make doit commencer par un déclencheur. Le webhook en est un,
  // il n'a aucune connexion à authentifier, et Iconik sait déjà y poster —
  // c'est exactement ce que fait une Custom Action.
  //
  // Le hook est RÉUTILISÉ par son nom : le recréer à chaque émission changerait
  // son URL, et l'URL est justement ce qu'on aura collé dans Iconik. Un
  // déclencheur qui change d'adresse à chaque publication ne déclenche plus
  // rien.
  // Le schéma déclaré de chaque module utilisé, lu chez la cible plutôt que
  // reconstruit : c'est exactement ce que l'éditeur recopie dans le blueprint
  // quand un humain pose un module.
  plan.schemas = {};
  plan.interfaces = {};
  const utilises = [...new Set((plan.groupes || []).flatMap(g => g.etapes)
    .map(e => e.module).filter(Boolean))];
  for (const nom of utilises) {
    const r = await ap(accesMake, 'GET', `/sdk/apps/${plan.app}/1/modules/${nom}/expect`);
    plan.schemas[nom] = Array.isArray(r.corps) ? r.corps : [];
    // Les SORTIES déclarées, pour savoir quel champ lire quand une référence
    // ne pointe rien de précis.
    const ri = await ap(accesMake, 'GET', `/sdk/apps/${plan.app}/1/modules/${nom}/interface`);
    plan.interfaces[PREFIXE_APP + plan.app + ':' + nom] =
      (Array.isArray(ri.corps) ? ri.corps : []).map(c => c.name).filter(Boolean);
  }
  console.log('Schémas    : ' + utilises.length + ' modules lus');

  const nomHook = 'APS | ' + plan.flux.nom;
  // La limite explicite n'est pas du zèle : `/hooks` pagine à 50, l'équipe en
  // a 59, et la réutilisation par nom ne trouvait donc jamais le nôtre — un
  // hook de plus à chaque émission, avec une URL neuve à chaque fois. Le
  // symptôme exact que la réutilisation devait empêcher.
  const rh = await ap(accesMake, 'GET', `/hooks?teamId=${equipeMake}&pg%5Blimit%5D=500`);
  let hook = ((rh.corps && rh.corps.hooks) || []).find(h => h.name === nomHook);
  if (!hook && ECRIRE) {
    // `method`, `headers` et `stringify` sont REQUIS, alors que le schéma de la
    // spec ne les marque pas comme tels. Ils décident de ce que le webhook
    // ajoute au corps reçu ; `false` partout donne le corps brut, qui est ce
    // qu'Iconik envoie et ce que les scénarios BAYAM utilisent.
    const c = await ap(accesMake, 'POST', '/hooks',
      { name: nomHook, teamId: equipeMake, typeName: 'gateway-webhook',
        method: false, headers: false, stringify: false });
    hook = c.corps && c.corps.hook;
    if (!hook) console.log('⚠️  hook non créé — ' + c.brut);
  }
  plan.idHook = hook ? hook.id : null;
  console.log('Déclencheur : ' + (hook
    ? hook.id + '  ' + (hook.url || 'https://hook.eu2.make.com/' + hook.udid)
    : '⚠ aucun — le scénario n\'aura pas de point d\'entrée'));

  // Le déclencheur est le module 1 du premier scénario : c'est lui qui porte la
  // charge utile d'Iconik.
  plan.idDeclencheur = 1;
  plan.traducteur = traducteurDe(plan);

  const sorties = (plan.groupes || []).map((g, i) => emettre(plan, g, plan.groupes.length > 1 ? i + 1 : 0));

  const trav = [...plan.traducteur.traversantes.entries()].sort((a, b) => b[1] - a[1]);
  if (trav.length) {
    console.log('\n↔ ' + trav.length + ' référence(s) FRANCHISSANT une frontière de scénario :');
    trav.forEach(([r, n]) => console.log('   {' + r + '}  ×' + n));
    console.log('   Produites dans un scénario, lues dans un autre. Make n\'a pas de');
    console.log('   référence inter-scénarios : elles doivent voyager dans la charge');
    console.log('   utile de l\'appel webhook, en paramètres d\'entrée déclarés.');
  }
  const sc = [...plan.traducteur.sansChamp.entries()];
  if (sc.length) {
    console.log('\n◦ ' + sc.length + ' référence(s) sans champ ni sortie déclarée :');
    sc.forEach(([r, n]) => console.log('   {' + r + '}  ×' + n
      + '  → module désigné, champ inconnu'));
  }
  const fns = [...plan.traducteur.fonctions.entries()].sort((a, b) => b[1] - a[1]);
  if (fns.length) {
    console.log('\nƒ ' + fns.length + ' fonction(s) d\'expression à porter chez la cible :');
    fns.forEach(([f, n]) => console.log('   ' + f + '()  ×' + n));
    console.log('   Leur ARGUMENT est résolu ; la fonction elle-même n\'a pas');
    console.log('   d\'équivalent déclaré. Ce n\'est pas une donnée manquante,');
    console.log('   c\'est une expression à traduire — deux travaux différents.');
  }
  const orph = [...plan.traducteur.orphelines.entries()].sort((a, b) => b[1] - a[1]);
  if (orph.length) {
    console.log('\n⚠ ' + orph.length + ' référence(s) sans origine déclarée — laissées telles quelles :');
    orph.forEach(([r, n]) => console.log('   {' + r + '}  ×' + n));
    console.log('   AUCUNE étape ne les produit. Le moteur d\'APS les tolère grâce à');
    console.log('   son espace de noms global ; Make n\'en a pas, ASL non plus.');
  }
  // Le flux est un ARBRE dès qu'il y a un Router : l'afficher à plat le
  // redirait faux, et c'est justement la forme qu'on cherche à vérifier.
  // Un blueprint est un ARBRE : `flow.length` ne compte que le premier niveau.
  // Comparer ce nombre au total émis donnait « 5/5 gardés » sur un scénario de
  // 65 modules — un contrôle qui affiche toujours vert parce qu'il compare deux
  // choses différentes. Pire qu'aucun contrôle.
  function compter(flow) {
    return (flow || []).reduce(function (n, m) {
      return n + 1 + compter(m.onerror)
               + (m.routes || []).reduce((s, r) => s + compter(r.flow), 0); }, 0);
  }
  function afficher(flow, prof) {
    (flow || []).forEach(function (m) {
      console.log('   ' + '  '.repeat(prof) + l(m.id, 4) + l(m.module, 34) + ' '
        + (m.metadata.designer.name || ''));
      if (m.onerror && m.onerror.length) {
        console.log('   ' + '  '.repeat(prof) + '     ↳ sur erreur :');
        afficher(m.onerror, prof + 3);
      }
      (m.routes || []).forEach(function (r) {
        console.log('   ' + '  '.repeat(prof) + '     route « '
          + ((r.metadata && r.metadata.designer && r.metadata.designer.name) || '—') + ' »');
        afficher(r.flow, prof + 3);
      });
    });
  }
  sorties.forEach(function (s) {
    console.log('── ' + s.blueprint.name + ' — ' + compter(s.blueprint.flow) + ' modules, '
      + s.notes.length + ' post-it(s)');
    afficher(s.blueprint.flow, 0);
  });

  // Les deux comptes ne sont PAS censés coïncider, et les présenter comme un
  // contrôle serait mentir : le plan compte ce que les étapes coûtent, l'émis
  // ajoute ce que la FORME impose — les aiguillages qu'un graphe demande à une
  // chaîne, et les reprises qu'un module non partageable oblige à poser.
  const total = sorties.reduce((n, s) => n + compter(s.blueprint.flow), 0);
  console.log('\nModules émis : ' + total + '   ·   coût des étapes annoncé par le plan : '
    + plan.verdict.modules);
  console.log('L\'écart est la forme elle-même : aiguillages et reprises, que le plan ne compte pas.');

  if (!ECRIRE) { console.log('\nLecture seule. Relancer avec --ecrire pour créer chez la cible.'); return prisma.$disconnect(); }

  // ── L'ENVOI ───────────────────────────────────────────────────
  const acces = accesMake, equipe = equipeMake;

  console.log('');
  const crees = [];
  for (const s of sorties) {
    // `confirmed=true` répond OUI à une question que l'API pose en clair :
    // « ces apps ne sont pas encore installées ; les installer les rendra
    // disponibles pour toute l'organisation ». C'est une écriture qui déborde
    // du scénario, et Make refuse de la faire dans notre dos — il a raison.
    // On la déclare donc explicitement plutôt que de la subir.
    const c = await ap(acces, 'POST', '/scenarios?confirmed=true', {
      teamId: equipe, name: s.blueprint.name,
      blueprint: JSON.stringify(s.blueprint),
      scheduling: JSON.stringify({ type: 'indefinitely', interval: 900 }) });
    const id = c.ok && c.corps && c.corps.scenario && c.corps.scenario.id;
    console.log((c.ok ? '✅' : '❌') + ' ' + l(s.blueprint.name, 46) + (id ? 'scénario ' + id : ''));
    if (!id) {
      // Le refus en entier. Tronquer le message d'une validation revient à
      // jeter la seule information qui dise QUOI corriger.
      const su = (c.corps && c.corps.suberrors) || [];
      console.log('   ' + ((c.corps && c.corps.detail) || c.brut));
      su.forEach(x => console.log('   · ' + x.message));
    }
    if (!id) continue;
    crees.push(id);

    // Relire : un 200 à la création ne dit pas ce qui a été gardé.
    const relu = await ap(acces, 'GET', `/scenarios/${id}/blueprint`);
    const bp = relu.corps && relu.corps.response && relu.corps.response.blueprint;
    const attendus = compter(s.blueprint.flow);
    const gardes = bp ? compter(bp.flow) : 0;
    console.log('   relecture : ' + gardes + '/' + attendus + ' modules gardés'
      + (gardes === attendus ? '' : '  ⚠ écart'));

    for (const n of s.notes) {
      const rn = await ap(acces, 'POST', `/scenarios/${id}/notes`, n);
      if (!rn.ok) { console.log('   ❌ post-it — ' + rn.brut.slice(0, 100)); break; }
    }
    if (s.notes.length) console.log('   ' + s.notes.length + ' post-it(s) posés');
  }

  if (!GARDER) {
    console.log('');
    for (const id of crees) {
      const d = await ap(acces, 'DELETE', `/scenarios/${id}`);
      console.log((d.ok ? '🧹' : '❌') + ' scénario ' + id + ' retiré');
    }
    console.log('\nRien n\'a été laissé chez la cible. Relancer avec --garder pour conserver.');
  }

  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
