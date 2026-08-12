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

const ID     = process.argv[2];
const iSort  = process.argv.indexOf('--sortie');
const SORTIE = iSort !== -1 ? process.argv[iSort + 1]
                            : path.join(__dirname, '..', '_journaux', 'asl-publish.json');

const COMPTE = process.env.AWS_COMPTE || '632075073384';
const REGION = process.env.AWS_REGION || 'eu-west-3';
const ARN_CONNEXION = 'arn:aws:events:' + REGION + ':' + COMPTE
                    + ':connection/aps-iconik/00000000-0000-0000-0000-000000000000';

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

// ── LES ÉTATS D'UNE PORTÉE ──────────────────────────────────────
function etatsDe(etapes, nommer, contexte) {
  const States = {};
  const nomDe  = new Map();
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
    let etat;
    if (e.core === 'decision') {
      etat = {
        Type: 'Choice',
        Choices: (autres.concat((suites.get(e.id) || []).filter(x => PORT_NOMINAL.test(x.port))))
          .filter(x => x.port !== 'default')
          .map(function (x) {
            return { Variable: '$.decision', StringEquals: x.port, Next: nomDe.get(x.vers) };
          }),
        Default: (function () {
          const d = (suites.get(e.id) || []).find(x => x.port === 'default');
          return d ? nomDe.get(d.vers) : FIN;
        })(),
      };
      States[nom] = etat;
      return;                                        // un Choice n'a pas de Next
    }

    if (e.core === 'loop') {
      etat = {
        Type: 'Map',
        ItemsPath: '$.items',
        ItemSelector: Object.assign({ 'item.$': '$$.Map.Item.Value' },
          (contexte.traversantes || []).reduce(function (acc, v) {
            acc[v + '.$'] = '$.' + v; return acc;
          }, {})),
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
      etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
               Parameters: { ApiEndpoint: String((e.params || {}).endpoint || 'https://exemple.invalid'),
                             Method: 'GET',
                             Authentication: { ConnectionArn: ARN_CONNEXION } },
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
        etat = { Type: 'Task', Resource: 'arn:aws:states:::aws-sdk:s3:listObjectsV2',
                 Parameters: { Bucket: 'a-renseigner', Prefix: 'a-renseigner' },
                 ResultPath: '$.s3', Next: nominal };
      } else if (e.core === 'trigger') {
        etat = { Type: 'Pass',
                 Comment: 'Le déclencheur vit HORS de la machine d\'états (EventBridge ou StartExecution)',
                 Next: nominal };
      } else {
        etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
                 Parameters: { ApiEndpoint: 'https://app.iconik.io/API/', Method: 'GET',
                               Authentication: { ConnectionArn: ARN_CONNEXION } },
                 ResultPath: '$.' + (e.id || 'r').replace(/[^A-Za-z0-9]/g, '_'),
                 Next: nominal };
      }
    }

    // 2. L'erreur : un Catch attaché, jamais un état de plus — c'est ce que la
    //    console a confirmé le 2026-08-12.
    if (erreur && etat.Type === 'Task') {
      etat.Catch = [{ ErrorEquals: ['States.ALL'], ResultPath: '$.erreur', Next: erreur }];
    }

    // 3. Les ports métier restants : un Choice APRÈS l'état. Le pivot les porte
    //    sur le nœud, ASL ne connaît que Next — d'où un état supplémentaire que
    //    la table de coûts ne prévoyait pas.
    if (autres.length && etat.Type === 'Task') {
      const nAiguillage = nom + ' - quel port';
      etat.Next = nAiguillage;
      States[nAiguillage] = {
        Type: 'Choice',
        Choices: autres.map(function (x) {
          return { Variable: '$.port', StringEquals: x.port, Next: nomDe.get(x.vers) };
        }),
        Default: nominal,
      };
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
  let corps = null, traversantes = [];
  if (portees.length) {
    const p = portees[0];
    traversantes = (p.entrees && p.entrees.traversantes) || [];
    const ctxCorps = { fin: nommer('Fin du corps'), traversantes: traversantes };
    const bati = etatsDe(p.etapes, nommer, ctxCorps);
    corps = { ProcessorConfig: { Mode: 'INLINE' },
              StartAt: bati.nomDe.get(p.etapes[0].id),
              States: bati.States };
  }

  const ctx = { fin: nommer('Fin'), corps: corps, traversantes: traversantes };
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
  if (problemes.length) {
    console.log('\n⚠ ' + problemes.length + ' problème(s) de cohérence AVANT de coller :');
    problemes.slice(0, 12).forEach(p => console.log('   ' + p));
  } else {
    console.log('\n✅ cohérence interne : tous les Next, Choices, Default et Catch');
    console.log('   pointent sur des états déclarés. La console reste juge du reste.');
  }
}

main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
