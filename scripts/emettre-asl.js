// APS — scripts/emettre-asl.js — créé le 2026-08-12
// ================================================================
// Le second ÉMETTEUR : d'un workflow APS à une définition Amazon States
// Language.
//
//   node scripts/emettre-asl.js <idFlux>            écrit la définition
//   node scripts/emettre-asl.js <idFlux> --sortie X  ailleurs que le défaut
//
// N'APPELLE PAS AWS. Il produit un fichier JSON à coller dans Workflow Studio,
// qui valide en direct. C'est une boucle de vérification meilleure que celle
// de Make : là-bas chaque essai créait un objet chez la cible qu'il fallait
// ensuite nettoyer ; ici, coller du texte suffit à obtenir le verdict.
//
// ── LA FORME D'ABORD, COMME POUR MAKE ───────────────────────────
// Il émet le SQUELETTE : les états, leur chaînage, les branchements, les
// gestionnaires d'erreur, l'imbrication du Map. Les paramètres de chaque appel
// (corps de requête, en-têtes) restent minimaux. Ce choix est délibéré et déjà
// justifié dans emettre-make.js : la forme est ce qui casse quand on se trompe
// d'architecture, et une définition refusée par AWS ne se répare pas en
// corrigeant une valeur de champ.
//
// ── CE QUE LE PIVOT A DE PLUS QUE ASL, ET QUI COÛTE ─────────────
// Un nœud du pivot a des PORTS métier — `found`/`empty`, `miss`, `ok`/`fail`.
// Un état ASL n'a que `Next` et `Catch`. Tout port qui n'est ni le passage
// nominal ni une erreur doit donc devenir un `Choice` POSÉ APRÈS l'état :
// c'est un état de plus, invisible dans le pivot, et que la table de coûts ne
// prévoyait pas. L'émetteur le compte pour de vrai.
//
// ── CE QU'IL NE SAIT PAS FAIRE ──────────────────────────────────
// Les verbes marqués `lambda` dans rendre-asl.js (`lookup`, `aps.registry`)
// sortent en Task pointant un ARN de fonction qui N'EXISTE PAS. Écrire ce code
// est un chantier à part ; poser un ARN mort et le DIRE vaut mieux que de faire
// croire à un workflow complet.
// ================================================================
'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const ASL  = require('./rendre-asl.js');
// Le catalogue sait quelles étapes APLATISSENT les métadonnées d'Iconik sous
// leur nom nu — c'est ce qui rend `TypeCollection` lisible dans un gabarit sans
// qu'aucune étape ne le déclare. En ASL rien ne s'aplatit : il faut relire la
// valeur là où elle est vraiment, dans le résultat du Search.
const CAT  = require('../server/public/builders/workflow/pivot-catalog-iconik.js');

const ID     = process.argv[2];
const iSort  = process.argv.indexOf('--sortie');
const SORTIE = iSort !== -1 ? process.argv[iSort + 1]
                            : path.join(__dirname, '..', '_journaux', 'asl-publish.json');

const COMPTE = process.env.AWS_COMPTE || '632075073384';
const REGION = process.env.AWS_REGION || 'eu-west-3';
const ARN_CONNEXION = 'arn:aws:events:' + REGION + ':' + COMPTE
                    + ':connection/aps-iconik/00000000-0000-0000-0000-000000000000';
// Les endpoints du pivot sont des chemins relatifs (« /API/jobs/v1/… ») : le
// moteur natif les colle à la connexion Iconik. ASL veut une URL entière.
const BASE_ICONIK = process.env.ICONIK_BASE || 'https://app.iconik.io';

// Les ports qui ne sont NI le passage nominal NI une erreur. Chacun devient une
// branche de Choice après l'état — c'est là que le compte d'états gonfle.
const PORT_NOMINAL = /^(out|found|ok)$/;
const PORT_ERREUR  = /^(error|err|erreur|fail|timeout)$/;

// Un nom d'état ASL doit être unique dans sa portée. On part du libellé, qui
// est ce que l'opérateur lit, et on ne retombe sur l'identifiant que s'il se
// répète — un « Set Metadata » deux fois vaut mieux que deux « http_request_7 ».
//
// EN ASCII SIMPLE, et ce n'est pas de la coquetterie. La première émission
// portait « Asset éditorial · quel port ? » : la console AWS a rendu sept
// erreurs, dont « Expected comma or closing brace » — une faute de PARSING,
// alors que le JSON était valide et que toutes les références existaient
// (contrôle exhaustif refait à la main). Le seul écart restant était le jeu de
// caractères des noms. On s'en tient donc à ce qu'AWS emploie dans ses propres
// exemples : lettres, chiffres, espaces, tirets, tirets bas.
function nommeur() {
  const pris = new Set();
  return function (label, id) {
    let base = String(label || id || 'Etat')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accents retirés
      .replace(/[^A-Za-z0-9 _-]+/g, ' ')                  // le reste devient espace
      .replace(/\s+/g, ' ').trim().slice(0, 70) || 'Etat';
    if (!pris.has(base)) { pris.add(base); return base; }
    let n = 2;
    while (pris.has(base + ' ' + n)) n++;
    pris.add(base + ' ' + n);
    return base + ' ' + n;
  };
}

// Les racines que le déclencheur fournit : elles vivent à la racine de l'état,
// personne n'a à les produire.
const RACINE = /^(collection|asset|item|user|now|trigger)\b/;

// Une référence du pivot (`{TypeCollection}`, `{search_results.objects}`)
// devient un JSONPath ASL. Le pivot lit dans un espace de noms global ; ASL lit
// dans l'état qui circule — d'où le `$.` de tête. Un gabarit qui contient
// autre chose qu'une référence seule n'est pas traduisible : ASL ne concatène
// pas dans une condition.
//
// `adresser` est le résolveur de la portée (voir `adressesDe`) : c'est LUI qui
// sait si la valeur est rangée par une étape, aplatie d'un Search, ou nulle
// part. Le gabarit ne fait que découper le nom de son suffixe.
function jsonPath(gabarit, adresser, aplatie) {
  const t = String(gabarit || '').trim();
  const m = t.match(/^\{([^{}]+)\}$/);
  const ref = m ? m[1] : t;
  if (ref.startsWith('$')) return ref;
  const propre = ref.replace(/[^A-Za-z0-9_.[\]]/g, '_');
  if (RACINE.test(propre)) return '$.' + propre;
  return adresser(propre, { aplatie: aplatie !== false });
}

// ── OÙ CHAQUE VALEUR VIT VRAIMENT, DANS L'ÉTAT QUI CIRCULE ──────
// Trois provenances, et les confondre fait relire une valeur à une adresse qui
// n'est pas la sienne — la faute la plus silencieuse qui soit, puisque le
// graphe reste valide et se dessine.
//
//   rangée    une étape la renvoie et le catalogue le DIT (`depuis`) :
//             `<résultat de l'étape>.ResponseBody.<champ>`
//   aplatie   une métadonnée d'objet Iconik, à relire du Search qui a ramené
//             CET objet-là — d'où l'index par type d'objet
//   sans      rien dans cette portée ne la pose. On ne devine pas : on rend le
//             nom nu ET on l'inscrit au contrat d'entrée de la portée, pour que
//             l'appelant la projette (ItemSelector) ou que le contrôle la crie
function adressesDe(etapes, chemin) {
  const rangees   = new Map();               // nom → JSONPath complet
  const mdParObjet = new Map();              // idEtape → { objet → JSONPath du Search }
  const mdToutes   = new Map();              // idEtape → dernier aplatisseur, tous objets

  const courantParObjet = {};
  let courante = null;
  etapes.forEach(function (e) {
    mdParObjet.set(e.id, Object.assign({}, courantParObjet));
    mdToutes.set(e.id, courante);
    // Ce que l'étape RANGE, déclaré par le catalogue. Sans `depuis`, la valeur
    // est calculée par le handler : aucun JSONPath ne la rend, on ne prétend pas.
    CAT.variablesDe({ facade: e.verbe, core: e.core, params: e.params || {} })
      .forEach(function (v) {
        if (v && v.depuis && !rangees.has(v.nom)) {
          rangees.set(v.nom, chemin(e) + '.ResponseBody.' + v.depuis);
        }
      });
    if (CAT.aplatitMetadonnees({ facade: e.verbe, core: e.core, params: e.params || {} })) {
      courante = chemin(e);
      const objet = CAT.objetDe({ facade: e.verbe, core: e.core, params: e.params || {} });
      if (objet) courantParObjet[objet] = courante;
    }
  });

  return function (idEtape, besoins) {
    return function (ref, opts) {
      const o = opts || {};
      // Par PRÉFIXE LE PLUS LONG : le catalogue déclare `X` et `X.objects`
      // séparément, parce que les deux existent réellement et ne se déduisent
      // pas l'un de l'autre (`{X.objects}` ne vaut PAS l'adresse de `X` suivie
      // de « .objects » — c'est le même tableau, écrit deux fois).
      const parts = String(ref).split('.');
      for (let i = parts.length; i > 0; i--) {
        const cle = parts.slice(0, i).join('.');
        if (rangees.has(cle)) {
          const reste = parts.slice(i);
          return rangees.get(cle) + (reste.length ? '.' + reste.join('.') : '');
        }
      }
      const nom = parts[0];
      if (o.aplatie) {
        const src = (o.objet && (mdParObjet.get(idEtape) || {})[o.objet]) || mdToutes.get(idEtape);
        if (src) return src + '.ResponseBody.objects[0].metadata.' + ref;
      }
      if (besoins && !besoins.has(nom)) besoins.set(nom, { nom: nom, objet: o.objet || null, aplatie: !!o.aplatie });
      return '$.' + ref;
    };
  };
}

// Un gabarit de texte (« /API/jobs/v1/jobs/{exportJobId}/ ») en ASL. Une valeur
// qui contient une référence ne peut pas rester une chaîne : elle devient un
// champ `<clé>.$` porté par `States.Format`, dont les `{}` sont les trous.
// Sans ça, le sondage interrogeait littéralement l'URL « …/{exportJobId}/ ».
function gabaritAsl(texte, adresser, intraduisibles, ou) {
  const t = String(texte || '');
  if (!/\{[^{}]+\}/.test(t)) return { valeur: t };
  const args = [];
  let refuse = false;
  const format = t.replace(/\{([^{}]+)\}/g, function (_, ref) {
    // Un appel de fonction n'est pas une adresse : `filebase(item.title)`
    // demande un calcul, et ASL ne calcule pas. On le dit plutôt que d'émettre
    // une URL qui aurait l'air juste.
    if (/^[A-Za-z_]\w*\s*\(/.test(ref.trim())) {
      refuse = true;
      intraduisibles.push({ etat: ou, port: '(gabarit)', op: 'fonction ' + ref.trim() });
      return '{' + ref + '}';
    }
    args.push(jsonPath('{' + ref + '}', adresser, true));
    return '{}';
  });
  if (refuse) return { valeur: t };
  const litteral = format.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return { intrinseque: "States.Format('" + litteral + "', " + args.join(', ') + ')' };
}

// ── LES ÉTATS D'UNE PORTÉE ──────────────────────────────────────
function etatsDe(etapes, nommer, contexte) {
  const States = {};
  const nomDe  = new Map();
  // Où chaque étape range sa réponse. Les règles de port en ont besoin :
  // reconnaître un `miss` demande de relire le résultat réel, pas une chaîne.
  const sortieDe = new Map();
  const intraduisibles = contexte.intraduisibles || (contexte.intraduisibles = []);
  // LE CONTRAT D'ENTRÉE DE LA PORTÉE, constaté plutôt que déclaré : chaque
  // référence qu'aucune étape d'ici ne pose s'y inscrit toute seule. C'est ce
  // que l'appelant doit projeter dans l'ItemSelector du Map — sans quoi le
  // corps de boucle lit dans le vide, ce qu'il faisait pour `TypeCollection`.
  const besoins = contexte.besoins || (contexte.besoins = new Map());
  // Le ResultPath d'une étape, calculable AVANT que son état soit bâti : une
  // référence peut viser une étape que la boucle d'émission n'a pas encore vue.
  const chemin = function (e) { return '$.' + String(e.id || 'r').replace(/[^A-Za-z0-9]/g, '_'); };
  const resolveur = adressesDe(etapes, chemin);
  const adresserChez = function (e) { return resolveur(e.id, besoins); };
  etapes.forEach(e => nomDe.set(e.id, nommer(e.label, e.id)));

  // Successeurs par étape et par port, reconstruits depuis `depuis` (le plan
  // porte les PRÉDÉCESSEURS de chaque étape).
  const suites = new Map();
  etapes.forEach(function (e) {
    (e.depuis || []).forEach(function (d) {
      // `deId`, PAS `de` : ce dernier est le libellé, et deux étapes peuvent
      // porter le même. La première version appariait dessus et ne trouvait
      // jamais rien — tous les états sortaient chaînés vers la fin.
      const src = d.deId || d.de;
      if (!nomDe.has(src)) return;                  // vient d'une autre portée
      if (!suites.has(src)) suites.set(src, []);
      suites.get(src).push({ port: d.port || 'out', vers: e.id });
    });
  });

  const suivantDe = function (id, filtre) {
    const s = (suites.get(id) || []).filter(x => filtre.test(x.port));
    return s.length ? nomDe.get(s[0].vers) : null;
  };
  const autresPorts = function (id) {
    return (suites.get(id) || []).filter(x => !PORT_NOMINAL.test(x.port) && !PORT_ERREUR.test(x.port));
  };

  // Fin de portée : un état terminal explicite plutôt qu'un `End: true` semé
  // partout — le graphe se relit, et une branche oubliée se voit.
  const FIN = contexte.fin;
  States[FIN] = { Type: 'Succeed' };

  etapes.forEach(function (e) {
    const nom     = nomDe.get(e.id);
    const nominal = suivantDe(e.id, PORT_NOMINAL) || FIN;
    const erreur  = suivantDe(e.id, PORT_ERREUR);
    const autres  = autresPorts(e.id);

    // 1. Le cœur de l'étape.
    // Une étape peut s'étaler sur PLUSIEURS états (un deliver liste puis
    // reconnaît). `porteur` désigne celui qui porte le Next final — c'est lui
    // que l'aiguillage de port doit rediriger, pas le premier de la chaîne.
    let etat;
    let porteur = null;
    if (e.core === 'decision') {
      // LA VRAIE CONDITION, pas une chaîne. Une décision du pivot porte son
      // champ et ses conditions (op + valeur) ; ASL sait les exprimer. Émettre
      // `$.decision == "Série"` produisait un aiguillage qui ne décide rien —
      // rien ne pose `$.decision`. Chaque condition est appariée à son port par
      // son `label`, qui EST le nom du port.
      const champ = jsonPath((e.params || {}).field, adresserChez(e), true);
      const conds = ((e.params || {}).conditions) || [];
      const Choices = [];
      (autres.concat((suites.get(e.id) || []).filter(x => PORT_NOMINAL.test(x.port))))
        .filter(x => x.port !== 'default')
        .forEach(function (x) {
          const c = conds.find(y => (y.label || '') === x.port);
          const regle = c ? ASL.conditionDe(c.op, champ, c.value) : null;
          if (!regle) {
            intraduisibles.push({ etat: nom, port: x.port, op: c ? c.op : '(condition absente)' });
            return;
          }
          Choices.push(Object.assign({}, regle, { Next: nomDe.get(x.vers) }));
        });
      etat = {
        Type: 'Choice',
        Choices: Choices,
        Default: (function () {
          const d = (suites.get(e.id) || []).find(x => x.port === 'default');
          return d ? nomDe.get(d.vers) : FIN;
        })(),
      };
      States[nom] = etat;
      return;                                        // un Choice n'a pas de Next
    }

    if (e.core === 'loop') {
      // L'ItemSelector EST le contrat d'entrée du corps. Deux sources, et la
      // seconde manquait entièrement : ce que le plan déclare traversant (une
      // variable nommée, lue dans les paramètres du corps) ET ce que le corps
      // s'est révélé lire en étant émis — au premier rang `TypeCollection`, que
      // personne ne déclare jamais parce que dans le moteur natif elle est
      // d'ambiance. Le corps la lisait donc à `$.TypeCollection`, dans un état
      // où rien ne l'avait posée.
      //
      // L'adresse se calcule ICI, dans la portée parente, et c'est tout
      // l'intérêt : le corps n'a pas à savoir d'où la valeur vient.
      const adresser = adresserChez(e);
      const projetees = {};
      (contexte.traversantes || []).forEach(function (v) {
        projetees[v + '.$'] = adresser(v, { aplatie: false });
      });
      (contexte.besoinsDuCorps || []).forEach(function (b) {
        projetees[b.nom + '.$'] = adresser(b.nom, { aplatie: b.aplatie, objet: b.objet });
      });
      etat = {
        Type: 'Map',
        // SUR QUOI la boucle itère. C'était `$.items` en dur — un champ que
        // rien ne pose : le Map aurait tourné à vide, et la console n'avait
        // aucune raison de le dire. Le pivot le déclare depuis toujours
        // (`loopVariablePath`), personne ne le lui demandait.
        ItemsPath: jsonPath((e.params || {}).loopVariablePath || '$.items',
                            adresserChez(e), false),
        ItemSelector: Object.assign({ 'item.$': '$$.Map.Item.Value' }, projetees),
        ItemProcessor: contexte.corps || { ProcessorConfig: { Mode: 'INLINE' },
                                           StartAt: 'CorpsVide', States: { CorpsVide: { Type: 'Succeed' } } },
        Next: nominal,
      };
    } else if (e.core === 'wait') {
      // La composition VALIDÉE en console : trois états qui bouclent. On pose
      // les deux compagnons ici, et l'état nommé porte l'interrogation.
      const nAttendre = nom + ' - attendre';
      const nVerdict  = nom + ' - termine';
      States[nAttendre] = { Type: 'Wait',
        Seconds: Number((e.params || {}).delaySeconds) || 20, Next: nom };
      States[nVerdict] = { Type: 'Choice',
        Choices: [{ Variable: '$.sonde.ResponseBody.status',
                    StringEquals: String((e.params || {}).checkValue || 'FINISHED'),
                    Next: nominal }],
        Default: nAttendre };
      // L'URL du sondage porte l'identifiant du job d'export
      // (« /API/jobs/v1/jobs/{exportJobId}/ »). Elle partait telle quelle :
      // le sondage interrogeait littéralement une URL à accolades, sur un
      // chemin relatif de surcroît. La référence est maintenant adressée, et
      // l'assemblage confié à `States.Format`.
      const cible = String((e.params || {}).endpoint || 'https://exemple.invalid');
      const url = gabaritAsl(cible.startsWith('/') ? BASE_ICONIK + cible : cible,
                             adresserChez(e), intraduisibles, nom);
      const params = { Method: 'GET', Authentication: { ConnectionArn: ARN_CONNEXION } };
      if (url.intrinseque) params['ApiEndpoint.$'] = url.intrinseque;
      else                 params.ApiEndpoint     = url.valeur;
      etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
               Parameters: params,
               ResultPath: '$.sonde', Next: nVerdict };
      // Surtout PAS d'entrée de portée ici : le Wait est un état du milieu du
      // flux. Une première version le posait en StartAt, ce qui rendait les
      // cinq états qui le précèdent inatteignables — le contrôle de connexité
      // l'a signalé au premier essai.
    } else {
      const compo = ASL.compositionDe(e.verbe || e.core, e.params || {});
      if (compo && compo.lambda) {
        etat = { Type: 'Task',
                 Resource: 'arn:aws:lambda:' + REGION + ':' + COMPTE + ':function:aps-' + (e.core || 'logique'),
                 Comment: 'FONCTION À ÉCRIRE — ' + compo.pourquoi,
                 ResultPath: '$.' + (e.core || 'resultat'), Next: nominal };
      } else if (e.core === 'deliver') {
        // DEUX états, et c'est structurel. ASL sait LISTER un bucket
        // (intégration native) mais pas RECONNAÎTRE ce qu'il contient :
        // associer « friday_s01_season.png » à l'essence `season_box` demande
        // de comparer des motifs, d'écarter les doublons d'upload, de filtrer
        // par niveau. Aucune intrinsèque ne fait ça. Le listing seul laisserait
        // les sept `s3_*_url` introuvables — donc le workflow entier muet sur
        // ce qu'il a livré.
        const nReconnu = nom + ' - reconnaitre';
        etat = { Type: 'Task', Resource: 'arn:aws:states:::aws-sdk:s3:listObjectsV2',
                 Parameters: { Bucket: 'a-renseigner', Prefix: 'a-renseigner' },
                 ResultPath: '$.s3', Next: nReconnu };
        porteur = nReconnu;
        States[nReconnu] = {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Comment: 'aps-essences — le module builder-essences.js, tel quel. Ne PAS le '
                 + 'réécrire : ces URL sont livrées au partenaire puis vérifiées par APS, '
                 + 'deux implémentations qui divergent contrôleraient une autre adresse '
                 + 'que celle qu\'elles ont envoyée.',
          Parameters: {
            FunctionName: 'aps-essences',
            Payload: {
              'listing.$': '$.s3',
              essences: e.essences || (e.params && e.params.s3Mappings) || [],
              base: 's3://a-renseigner/',
              // Le niveau courant, qui décide quelles essences s'appliquent.
              // L'adresse ne se devine plus : le catalogue déclare CETTE
              // lecture (`lectures`), y compris de quel objet elle se lit — la
              // collection publiée, jamais le dernier Search venu, qui sur
              // PUBLISH cherche des assets.
              'typeCollection.$': (function () {
                const lu = CAT.lecturesDe({ facade: e.verbe, core: e.core, params: e.params || {} })
                  .find(x => x && x.nom === 'TypeCollection');
                return adresserChez(e)('TypeCollection',
                  { aplatie: true, objet: lu ? lu.objet : null });
              })(),
            },
          },
          ResultSelector: { 'variables.$': '$.Payload.variables',
                            'cardinaliteRespectee.$': '$.Payload.cardinaliteRespectee' },
          ResultPath: '$.essences',
          Next: nominal,
        };
      } else if (e.core === 'trigger') {
        etat = { Type: 'Pass',
                 Comment: 'Le déclencheur vit HORS de la machine d\'états (EventBridge ou StartExecution)',
                 Next: nominal };
      } else {
        etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
                 Parameters: { ApiEndpoint: BASE_ICONIK + '/API/', Method: 'GET',
                               Authentication: { ConnectionArn: ARN_CONNEXION } },
                 ResultPath: chemin(e),
                 Next: nominal };
      }
    }

    if (etat && etat.ResultPath) sortieDe.set(e.id, etat.ResultPath);

    // 2. L'erreur : un Catch attaché, jamais un état de plus — c'est ce que la
    //    console a confirmé le 2026-08-12.
    if (erreur && etat.Type === 'Task') {
      etat.Catch = [{ ErrorEquals: ['States.ALL'], ResultPath: '$.erreur', Next: erreur }];
    }

    // 3. Les ports métier restants : un Choice APRÈS l'état. Le pivot les porte
    //    sur le nœud, ASL ne connaît que Next — d'où un état supplémentaire que
    //    la table de coûts ne prévoyait pas.
    const etatPorteur = porteur ? States[porteur] : etat;
    if (autres.length && etatPorteur.Type === 'Task') {
      const sortie = sortieDe.get(e.id) || '$';
      const Choices = [];
      autres.forEach(function (x) {
        const regle = ASL.reglePort(e.verbe, e.core, x.port, sortie);
        if (!regle) {
          intraduisibles.push({ etat: nom, port: x.port, op: 'port de ' + (e.verbe || e.core) });
          return;
        }
        Choices.push(Object.assign({}, regle, { Next: nomDe.get(x.vers) }));
      });
      // Aucun port reconnaissable : pas d'aiguillage du tout plutôt qu'un
      // Choice vide — un état qui tombe toujours en Default ment sur ce qu'il
      // fait, et se lit comme un embranchement réel.
      if (Choices.length) {
        const nAiguillage = nom + ' - quel port';
        etatPorteur.Next = nAiguillage;
        States[nAiguillage] = { Type: 'Choice', Choices: Choices, Default: nominal };
      }
    }

    States[nom] = etat;
  });

  return { States: States, nomDe: nomDe };
}

async function main() {
  if (!ID) { console.log('Usage : node scripts/emettre-asl.js <idFlux> [--sortie fichier]'); return; }
  const port = process.env.APS_PORT || 3000;
  const r = await fetch('http://localhost:' + port
          + '/api/builder-flows/' + ID + '/interpretation?cible=asl');
  const plan = await r.json();
  if (!r.ok) { console.log('❌ interprétation : ' + (plan.error || r.status)); return; }

  const nommer = nommeur();
  const racine = plan.groupes[0];
  const portees = plan.groupes.slice(1);

  // Le corps de boucle d'abord : le Map de la racine doit pouvoir le porter.
  // Et il en ressort MAINTENANT ce qu'il lui faut recevoir — un contrat
  // d'entrée constaté à l'émission, que le plan seul ne pouvait pas voir : il
  // recense les références des PARAMÈTRES, or `TypeCollection` n'apparaît dans
  // aucun paramètre. C'est le handler qui la lit.
  let corps = null, traversantes = [], besoinsDuCorps = [];
  if (portees.length) {
    const p = portees[0];
    traversantes = (p.entrees && p.entrees.traversantes) || [];
    const ctxCorps = { fin: nommer('Fin du corps'), traversantes: traversantes };
    const bati = etatsDe(p.etapes, nommer, ctxCorps);
    p._intraduisibles = ctxCorps.intraduisibles || [];
    besoinsDuCorps = Array.from((ctxCorps.besoins || new Map()).values())
      .filter(b => traversantes.indexOf(b.nom) === -1);
    corps = { ProcessorConfig: { Mode: 'INLINE' },
              StartAt: bati.nomDe.get(p.etapes[0].id),
              States: bati.States };
  }

  const corpsIntraduisibles = (portees.length && portees[0]._intraduisibles) || [];
  const ctx = { fin: nommer('Fin'), corps: corps, traversantes: traversantes,
                besoinsDuCorps: besoinsDuCorps };
  const bati = etatsDe(racine.etapes, nommer, ctx);

  const definition = {
    Comment: 'APS — ' + plan.flux.nom + ' — émis le ' + new Date().toISOString().slice(0, 10)
           + '. SQUELETTE : la forme, pas les paramètres. Les ARN de connexion et de '
           + 'Lambda sont des espaces réservés.',
    StartAt: bati.nomDe.get(racine.etapes[0].id),
    States: bati.States,
  };

  // ── Contrôle local, avant de coller ────────────────────────────
  // Ce qu'on peut vérifier soi-même, on le vérifie : un Next qui pointe dans le
  // vide est une faute que la console signalerait, mais qu'il vaut mieux ne pas
  // lui soumettre. Elle reste juge du reste.
  const problemes = [];

  // LA CONNEXITÉ, et pas seulement les références. Le premier contrôle ne
  // vérifiait que « la cible existe-t-elle » — il a donc validé un graphe où
  // les 21 états menaient tous à « Fin » en un saut, puisque « Fin » existe.
  // Un graphe peut être parfaitement cohérent et parfaitement absurde. On
  // marche donc le graphe depuis StartAt : ce qui n'est pas atteint est signalé.
  (function atteignables(states, depart, ou) {
    const vus = new Set();
    const pile = [depart];
    while (pile.length) {
      const n = pile.pop();
      if (!n || vus.has(n) || !states[n]) continue;
      vus.add(n);
      const s = states[n];
      [s.Next, s.Default].forEach(x => x && pile.push(x));
      (s.Choices || []).forEach(c => c.Next && pile.push(c.Next));
      (s.Catch || []).forEach(c => c.Next && pile.push(c.Next));
      if (s.ItemProcessor) atteignables(s.ItemProcessor.States, s.ItemProcessor.StartAt, 'corps de boucle');
    }
    const perdus = Object.keys(states).filter(n => !vus.has(n));
    if (perdus.length) {
      problemes.push(ou + ' : ' + perdus.length + ' état(s) jamais atteint(s) depuis « ' + depart
                   + ' » — ' + perdus.slice(0, 6).join(', ') + (perdus.length > 6 ? '…' : ''));
    }
  })(definition.States, definition.StartAt, 'racine');

  (function controler(states, ou) {
    const noms = new Set(Object.keys(states));
    Object.entries(states).forEach(function ([nom, s]) {
      const cibles = [];
      if (s.Next) cibles.push(s.Next);
      (s.Choices || []).forEach(c => cibles.push(c.Next));
      if (s.Default) cibles.push(s.Default);
      (s.Catch || []).forEach(c => cibles.push(c.Next));
      cibles.forEach(function (c) {
        if (!noms.has(c)) problemes.push(ou + ' : « ' + nom + ' » pointe sur « ' + c + " », qui n'existe pas");
      });
      if (s.Type === 'Task' && !s.Next && !s.End) {
        problemes.push(ou + ' : « ' + nom + ' » n\'a ni Next ni End');
      }
      if (s.ItemProcessor) controler(s.ItemProcessor.States, 'corps de boucle');
    });
  })(definition.States, 'racine');

  // ── TOUTE RÉFÉRENCE A-T-ELLE UN PORTEUR ? ─────────────────────
  // Le contrôle qui manquait, et il est du même genre que la connexité : un
  // JSONPath vers un champ que rien ne pose est PARFAITEMENT valide pour AWS —
  // la définition est acceptée, dessinée, et le run échoue en States.Runtime
  // (ou pire, lit vide sans broncher). Personne ne peut le voir en relisant le
  // graphe : c'est exactement ce qui est arrivé à `TypeCollection` et à
  // `exportJobId`, restés introuvables pendant que la console disait oui.
  //
  // Un porteur, c'est un ResultPath posé dans la portée, une racine du
  // déclencheur, ou — dans un corps de boucle — une clé projetée par
  // l'ItemSelector. Rien d'autre ne remplit l'état.
  const sansPorteur = [];
  (function verifier(states, porteurs, ou) {
    const dispo = new Set(porteurs);
    Object.values(states).forEach(function (s) {
      if (typeof s.ResultPath === 'string') {
        const m = s.ResultPath.match(/^\$\.([A-Za-z0-9_]+)/);
        if (m) dispo.add(m[1]);
      }
    });
    const lues = [];
    const chemins = function (v) {
      if (typeof v === 'string') {
        if (v.startsWith('$$')) return;
        if (v.startsWith('States.')) {
          (v.match(/\$\.[A-Za-z0-9_]+/g) || []).forEach(x => lues.push(x));
          return;
        }
        if (v.startsWith('$.')) lues.push(v);
        return;
      }
      if (Array.isArray(v)) return v.forEach(chemins);
      if (v && typeof v === 'object') {
        Object.entries(v).forEach(function ([k, x]) {
          if (k === 'ItemProcessor') return;          // portée fille, vérifiée à part
          // Dans un ResultSelector, `$` désigne le RÉSULTAT de la tâche, pas
          // l'état qui circule : `$.Payload` y est parfaitement légitime.
          // Confondre les deux racines faisait accuser quatre adresses justes.
          if (k === 'ResultSelector') return;
          if (k.endsWith('.$') || k === 'Variable' || k === 'ItemsPath') chemins(x);
          else if (x && typeof x === 'object') chemins(x);
        });
      }
    };
    Object.values(states).forEach(chemins);
    lues.forEach(function (p) {
      const nom = p.slice(2).split(/[.[]/)[0];
      if (!nom || dispo.has(nom) || RACINE.test(nom)) return;
      sansPorteur.push(ou + ' : « ' + p + ' » — rien dans cette portée ne pose « ' + nom + ' »');
    });
    Object.values(states).forEach(function (s) {
      if (!s.ItemProcessor) return;
      const projetees = Object.keys(s.ItemSelector || {}).map(k => k.replace(/\.\$$/, ''));
      verifier(s.ItemProcessor.States, projetees, 'corps de boucle');
    });
  })(definition.States, [], 'racine');

  // Un nom hors ASCII simple est refusé par la console AWS — mesuré le
  // 2026-08-12. On le signale AVANT de faire coller quoi que ce soit.
  (function nomsSurs(states, ou) {
    Object.keys(states).forEach(function (n) {
      if (!/^[A-Za-z0-9 _-]+$/.test(n)) problemes.push(ou + ' : nom d\'état hors ASCII simple — « ' + n + ' »');
      if (n.length > 80) problemes.push(ou + ' : nom d\'état de plus de 80 caractères — « ' + n + ' »');
      const s = states[n];
      if (s.ItemProcessor) nomsSurs(s.ItemProcessor.States, 'corps de boucle');
    });
  })(definition.States, 'racine');

  const compte = function (states) {
    return Object.values(states).reduce(function (n, s) {
      return n + 1 + (s.ItemProcessor ? compte(s.ItemProcessor.States) : 0);
    }, 0);
  };

  fs.writeFileSync(SORTIE, JSON.stringify(definition, null, 2) + '\n', 'utf8');

  console.log('Workflow  : ' + plan.flux.nom);
  console.log('Cible     : ' + plan.cible.nom);
  console.log('États émis: ' + compte(definition.States)
            + '   ·   annoncé par le plan : ' + plan.verdict.modules);
  console.log('Lambdas   : ' + JSON.stringify(Object.entries(definition.States)
    .filter(([, s]) => s.Resource && /lambda/.test(s.Resource)).map(([n]) => n)));
  console.log('Fichier   : ' + SORTIE);
  // ── D'OÙ CHAQUE RÉFÉRENCE VIENDRAIT, CHEZ ASL ─────────────────
  // Trois familles, et les confondre ferait promettre une traduction qui
  // n'existe pas :
  //
  //   lisible    l'étape range sa réponse sous un ResultPath : la référence est
  //              un JSONPath dans l'état qui circule
  //   aplatie    une métadonnée Iconik (TypeCollection, BayardID) qu'un Search
  //              expose sous son nom nu. Le catalogue ne peut pas les nommer
  //              d'avance — elles dépendent de l'organisation — mais elles sont
  //              DÉRIVABLES : `<résultat du search>.ResponseBody.objects[0]
  //              .metadata.<nom>`
  //   calculée   une valeur que le HANDLER fabrique (`s3_cover_url` sort d'un
  //              listing S3 reconnu par motif de nom). Aucun JSONPath ne la
  //              rend : c'est de la logique, donc une Lambda
  const familles = { lisible: [], aplatie: [], calculee: [] };
  {
    const toutes = plan.groupes.flatMap(g => g.etapes);
    const parVar = new Map();
    toutes.forEach(e => (e.produit || []).forEach(n => parVar.has(n) || parVar.set(n, e)));
    const lues = new Set();
    const voir = function (v) {
      if (typeof v === 'string') {
        const re = /\{([^{}"':]+)\}/g; let m;
        while ((m = re.exec(v))) {
          const dedans = m[1].replace(/^[a-zA-Z_]\w*\(|\)$/g, '');
          lues.add(dedans.split(/[.[]/)[0]);
        }
        return;
      }
      if (Array.isArray(v)) return v.forEach(voir);
      if (v && typeof v === 'object') return Object.values(v).forEach(voir);
    };
    toutes.forEach(function (e) {
      voir(e.params || {});
      // Un champ de décision s'écrit souvent SANS accolades : il échappait au
      // relevé, et c'est ainsi que TypeCollection et BayardID sont passés
      // inaperçus dans la première mesure.
      const f = (e.params || {}).field;
      if (f) lues.add(String(f).replace(/^\{|\}$/g, '').split(/[.[]/)[0]);
    });
    const RACINE = /^(collection|asset|item|user|now|trigger)$/;
    lues.forEach(function (r) {
      if (!r || RACINE.test(r)) return;
      const e = parVar.get(r);
      if (!e) { familles.aplatie.push(r); return; }
      // Une variable déclarée par une essence de manifeste est FABRIQUÉE par le
      // handler, pas rangée telle quelle par l'appel.
      (/^s3_.*_url$/.test(r) ? familles.calculee : familles.lisible).push(r + ' ← ' + e.label);
    });
  }
  console.log('\nD\'OÙ VIENNENT LES RÉFÉRENCES, CHEZ ASL');
  console.log('   ' + familles.lisible.length + ' lisible(s) — un JSONPath dans l\'état qui circule');
  console.log('   ' + familles.aplatie.length + ' aplatie(s)  — métadonnée d\'un Search, dérivable de son résultat');
  familles.aplatie.forEach(r => console.log('        ' + r));
  console.log('   ' + familles.calculee.length + ' calculée(s) — fabriquée par le handler : demande une Lambda');
  familles.calculee.slice(0, 3).forEach(r => console.log('        ' + r));
  if (familles.calculee.length > 3) console.log('        … et ' + (familles.calculee.length - 3) + ' autre(s)');

  const nonTrad = (ctx.intraduisibles || []).concat(corpsIntraduisibles);
  if (nonTrad.length) {
    console.log('\n⚠ ' + nonTrad.length + ' aiguillage(s) NON traduits — la branche est omise,');
    console.log('  jamais émise au jugé : un Choice qui trie faux est pire qu\'un manque.');
    nonTrad.forEach(x => console.log('   ' + x.etat + ' · port « ' + x.port + ' » · ' + x.op));
  }
  if (besoinsDuCorps.length || traversantes.length) {
    console.log('\nCE QUE LE CORPS DE BOUCLE REÇOIT — l\'ItemSelector du Map');
    traversantes.forEach(v => console.log('   ' + v.padEnd(20) + 'déclaré traversant par le plan'));
    besoinsDuCorps.forEach(b => console.log('   ' + b.nom.padEnd(20)
      + 'constaté à l\'émission' + (b.objet ? ' — lu de « ' + b.objet + ' »' : '')));
  }
  if (sansPorteur.length) {
    console.log('\n⚠ ' + sansPorteur.length + ' référence(s) SANS PORTEUR — la console dira oui,');
    console.log('  le run lira du vide. C\'est de la logique de handler, pas une adresse :');
    sansPorteur.slice(0, 10).forEach(p => console.log('   ' + p));
  }
  if (problemes.length) {
    console.log('\n⚠ ' + problemes.length + ' problème(s) de cohérence AVANT de coller :');
    problemes.slice(0, 12).forEach(p => console.log('   ' + p));
  } else {
    console.log('\n✅ cohérence interne : tous les Next, Choices, Default et Catch');
    console.log('   pointent sur des états déclarés. La console reste juge du reste.');
  }
}

main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
