// APS — scripts/rendre-asl.js — créé le 2026-08-12
// ================================================================
// Ce qu'un verbe d'APS devient en Amazon States Language.
//
//   node scripts/rendre-asl.js        affiche la table, ne produit rien
//
// Pendant de `rendre-make.js`, et même contrat : `compositionDe(famille,
// params)` rend `{dit, pourquoi, mesure, modules[], nombre}` — l'écran
// d'interprétation ne sait pas de quelle cible il parle.
//
// ── CE QUI EST VÉRIFIÉ, ET JUSQU'OÙ ─────────────────────────────
// Le 2026-08-12, `scripts/sonde-asl.json` a été collé dans Workflow Studio
// (compte 632075073384, eu-west-3). La console a ACCEPTÉ la définition et
// redessiné le graphe. Quatre hypothèses validées d'un coup :
//
//   Task http:invoke   les deux états s'affichent « HTTP Endpoint » — appel
//                      HTTP natif, sans Lambda
//   Catch              sort de l'état comme une branche, pas comme un état
//   LA BOUCLE          `Termine → Default → Patienter` : la flèche remonte.
//                      Un sondage coûte TROIS états, quel que soit le nombre
//                      d'essais
//   Map + ItemSelector « Source de l'élément : JSON Payload » — le contrat
//                      d'entrée a bien un véhicule
//
// Puis le 2026-08-12 encore, la définition COMPLÈTE de PUBLISH (38 états,
// emettre-asl.js) a été acceptée et dessinée : S3 s'affiche « S3:
// ListObjectsV2 », les ARN de Lambda « Lambda: Invoke », le Map porte son
// corps, et la boucle de sondage tourne bien à l'intérieur.
//
// MAIS C'EST UNE VALIDATION DE FORME, PAS D'EXÉCUTION. La leçon la plus chère
// du chantier Make s'applique ici mot pour mot : « un blueprint ACCEPTÉ n'est
// pas un blueprint VALIDE ». Les ConnectionArn de la sonde sont factices, rien
// n'a tourné. Ce qui reste à prouver est donc tout ce qui se voit à
// l'exécution : que `http:invoke` sait porter l'authentification d'Iconik, que
// le corps de requête part comme attendu, que `$.job.ResponseBody.status` est
// le bon chemin de lecture. Une EventBridge Connection réelle est le prochain
// pas.
//
// ── CE QUE ASL CHANGE PAR RAPPORT À MAKE ────────────────────────
// Trois différences renversent des coûts, et c'est pour elles qu'un chiffrage
// par cible ne se déduit pas de l'autre :
//
//   ASL SAIT BOUCLER. Un sondage n'est pas déroulé : Task → Choice → Wait →
//   retour au Task. Trois états, quel que soit le nombre d'essais, là où Make
//   en imbrique une vingtaine parce qu'il n'a pas de boucle conditionnelle.
//   C'est le poste de coût le plus lourd de PUBLISH qui s'effondre.
//
//   L'ERREUR EST NATIVE. `Retry` et `Catch` s'attachent à un état : un port
//   d'erreur d'APS ne coûte pas un état de plus, contrairement au gestionnaire
//   accroché d'un module Make.
//
//   ET LES PORTS MÉTIER N'EXISTENT PAS. C'est le trou que le premier dessin
//   complet a rendu visible. Le pivot route sur des ports que le MOTEUR
//   calcule : un `deliver` sort par `miss` quand le listing S3 est vide, un
//   `search` par `empty` quand il ne trouve rien. En ASL, aucun état ne pose
//   ces valeurs — les Choice émis testent `$.port` et `$.decision`, que rien
//   ne produit, et tomberaient donc TOUJOURS en Default. Traduire un port
//   n'est pas le recopier en chaîne : c'est le réécrire en condition sur le
//   résultat réel (`$.s3.Contents` absent pour un `miss`). C'est un travail
//   PAR VERBE, et c'est ce qui sépare une machine d'états qui se dessine
//   d'une machine d'états qui décide.
//
//   MAIS ASL N'EXÉCUTE PAS DE LOGIQUE. Les intrinsèques (`States.Format`,
//   `States.ArrayGetItem`…) transforment, elles ne décident pas. Traduire une
//   table de correspondance, résoudre une politique d'héritage sur trente
//   règles, tenir un registre : rien de tout cela ne s'écrit en ASL. Il faut
//   une Lambda — donc du code à écrire, déployer et maintenir. C'est le prix
//   caché de cette cible, et il ne se voit pas en comptant des états.
// ================================================================
'use strict';

// `forme` reprend le vocabulaire d'ASL. `lambda: true` marque ce qui n'est PAS
// exprimable en ASL et demande du code — l'information la plus coûteuse de la
// table, donc portée par un drapeau plutôt que noyée dans une phrase.
const COMPOSITIONS = {
  wait: {
    dit: 'boucle native',
    pourquoi: 'ASL sait boucler : un sondage est un cycle Task → Choice → Wait, '
            + 'pas une chaîne déroulée — le nombre d\'essais ne change pas le nombre d\'états',
    source: 'forme validée en console le 2026-08-12',
    etats: function () {
      return [
        { etat: 'Task',   role: 'interroger l\'endpoint' },
        { etat: 'Choice', role: 'checkPath atteint ? sortir : continuer' },
        { etat: 'Wait',   role: 'attendre delaySeconds, puis revenir au Task' },
      ];
    },
  },
  lookup: {
    dit: 'Lambda',
    pourquoi: 'traduire une table de correspondance et résoudre l\'héritage entre '
            + 'niveaux n\'est pas exprimable avec les intrinsèques ASL : c\'est de '
            + 'la logique, pas de la transformation',
    source: 'doc',
    lambda: true,
    etats: function () {
      return [{ etat: 'Task', role: 'Lambda — correspondance + héritage (code à écrire)' }];
    },
  },
  verify: {
    dit: 'Map sur les essences',
    pourquoi: 'chaque essence se vérifie par son propre appel ; ASL itère nativement '
            + 'et recompose le tableau des résultats sans agrégateur explicite',
    source: 'doc',
    etats: function () {
      return [
        { etat: 'Map',  role: 'parcourir les essences du manifeste' },
        { etat: 'Task', role: 'interroger verifyEndpoint (dans l\'ItemProcessor)' },
        { etat: 'Pass', role: 'recomposer le verdict' },
      ];
    },
  },
  'aps.registry': {
    dit: 'Lambda + stockage',
    pourquoi: 'le registre et le compteur vivent dans la base d\'APS. Aucune cible ne '
            + 'les porte : il faut et le code, et une table (DynamoDB) pour l\'état',
    source: 'doc',
    lambda: true,
    etats: function () {
      return [{ etat: 'Task', role: 'Lambda — identifiant unique, adossé à une table' }];
    },
  },
};

// Ce qu'un core devient, quand il n'a pas de composition à lui. Rendu séparé
// des compositions : une forme n'est pas un coût.
const FORMES = {
  decision:     { etat: 'Choice', dit: function (n) { return 'Choice à ' + Math.max(n, 1) + ' règle(s)'; },
                  pourquoi: 'un embranchement APS a des ports ; ASL a des règles Choice — la correspondance est directe' },
  loop:         { etat: 'Map', dit: function () { return 'Map · ItemProcessor'; },
                  pourquoi: 'le corps reste DANS la machine d\'états, contrairement à Make' },
  trigger:      { etat: '—', dit: function () { return 'EventBridge ou StartExecution'; },
                  pourquoi: 'une machine d\'états n\'a pas de déclencheur interne : il vit à côté' },
  http_request: { etat: 'Task', dit: function () { return 'Task · http:invoke'; },
                  pourquoi: 'appel HTTP natif via une EventBridge Connection, sans Lambda' },
  // DEUX formes, et l'émetteur sait produire les deux (`--listing lambda`).
  // Ce n'est pas un détail d'implémentation : l'intégration S3 native signe
  // avec le RÔLE de la machine d'états, jamais avec des identifiants qu'on lui
  // passe. Elle ne peut donc pas atteindre le bucket d'un client sans que ce
  // client agisse. La variante Lambda le peut — c'est le modèle de connexion
  // d'APS, qui ne se transposait pas jusque-là. Mesuré : 41 → 38 états sur
  // PUBLISH, un de moins par Deliver, pour 0,09 $ d'écart sur 1000 runs.
  deliver:      { etat: 'Task', dit: function () { return 'Task · s3:listObjectsV2 OU Lambda'; },
                  pourquoi: 'S3 est une intégration native d\'ASL (confirmé en console : « S3: ListObjectsV2 ») — mais elle signe avec le rôle d\'exécution, donc le listing rejoint la Lambda dès qu\'il faut atteindre le bucket d\'un tiers' },
};

function compositionDe(famille, params) {
  const c = COMPOSITIONS[famille];
  if (!c) return null;
  const etats = c.etats(params || {});
  return { dit: c.dit, pourquoi: c.pourquoi,
           mesure: c.source || 'déduit de la spécification ASL',
           lambda: !!c.lambda,
           modules: etats.map(e => ({ module: e.etat, role: e.role })),
           nombre: etats.length };
}

// ── ÉCRIRE UNE VALEUR DANS UNE EXPRESSION JSONATA ───────────────
// Les chaînes de JSONata sont entre apostrophes simples. Une valeur du pivot
// peut en contenir (« L'Épisode ») : sans échappement, la condition casse à la
// validation — et une définition refusée pour une apostrophe est le genre de
// perte de temps qui ne s'explique pas deux fois.
function txt(x) {
  return "'" + String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
// Une expression régulière du pivot devient un littéral regex JSONata (`/…/`).
// On ne touche pas au motif : le traduire serait deviner.
function rx(x) { return '/' + String(x == null ? '' : x).replace(/\//g, '\\/') + '/'; }

// ── LES OPÉRATEURS D'UNE DÉCISION ───────────────────────────────
// Le pivot en connaît vingt (builder-handler-decision.js:18-37).
//
// RÉÉCRITE EN JSONATA le 2026-08-13. La version JSONPath n'avait que des
// comparateurs nommés et `StringMatches`, dont le seul joker est `*` : deux
// opérateurs sur vingt restaient intraduisibles, et les autres s'exprimaient
// par des empilements de `Or`/`Not` illisibles dans le dessin de la console.
// JSONata rend une condition qui SE LIT — et `$contains` acceptant un littéral
// regex, **`matches_regex` cesse d'être hors de portée**. La table ne renvoie
// plus une structure mais le texte d'une expression ; c'est l'appelant qui
// l'enrobe de `{% %}`.
const OPERATEURS = {
  equals:        (v, x) => v + ' = ' + txt(x),
  not_equals:    (v, x) => v + ' != ' + txt(x),
  contains:      (v, x) => '$contains(' + v + ', ' + txt(x) + ')',
  not_contains:  (v, x) => '$not($contains(' + v + ', ' + txt(x) + '))',
  starts_with:   (v, x) => '$substring(' + v + ', 0, $length(' + txt(x) + ')) = ' + txt(x),
  ends_with:     (v, x) => '$substring(' + v + ', $length(' + v + ') - $length(' + txt(x) + ')) = ' + txt(x),
  not_starts_with: (v, x) => '$not(' + OPERATEURS.starts_with(v, x) + ')',
  not_ends_with:   (v, x) => '$not(' + OPERATEURS.ends_with(v, x) + ')',
  gt:            (v, x) => '$number(' + v + ') > '  + Number(x),
  gte:           (v, x) => '$number(' + v + ') >= ' + Number(x),
  lt:            (v, x) => '$number(' + v + ') < '  + Number(x),
  lte:           (v, x) => '$number(' + v + ') <= ' + Number(x),
  // « Absent » et « vide » se disent d'un seul tenant, là où JSONPath demandait
  // un `Or` de deux règles.
  is_empty:      (v)    => '$not($exists(' + v + ')) or ' + v + ' = ' + txt(''),
  absent:        (v)    => '$not($exists(' + v + ')) or ' + v + ' = ' + txt(''),
  not_empty:     (v)    => '$exists(' + v + ') and ' + v + ' != ' + txt(''),
  present:       (v)    => '$exists(' + v + ') and ' + v + ' != ' + txt(''),
  in_list:       (v, x) => v + ' in [' + String(x).split(',').map(y => txt(y.trim())).join(', ') + ']',
  not_in_list:   (v, x) => '$not(' + v + ' in [' + String(x).split(',').map(y => txt(y.trim())).join(', ') + '])',
  // Ce que JSONPath ne savait pas faire. `$contains` accepte un littéral regex.
  matches_regex:     (v, x) => '$contains(' + v + ', ' + rx(x) + ')',
  not_matches_regex: (v, x) => '$not($contains(' + v + ', ' + rx(x) + '))',
};

// ── LES PORTS MÉTIER, TRADUITS EN CONDITIONS ────────────────────
// C'est le trou qu'a révélé le premier dessin complet, le 2026-08-12 : un
// Choice qui teste `$.port` ne décide rien, puisque rien ne pose `$.port`.
// Chez APS c'est le MOTEUR qui calcule le port — un `deliver` sort par `miss`
// quand le listing S3 est vide. Chez ASL il faut le relire du résultat réel.
//
// `resultat` est l'expression JSONata sous laquelle l'émetteur relit la réponse
// de l'étape (`$maVariable`) ; les fonctions rendent le TEXTE de la condition.
const PORTS = {
  deliver: {
    // listObjectsV2 renvoie KeyCount : le compte est déjà là, inutile de
    // fouiller Contents. Quand c'est la Lambda qui liste (variante `lambda`,
    // la seule qui sache atteindre le bucket d'un client), il n'y a plus de
    // résultat S3 du tout : le compte vient de la Lambda elle-même.
    miss: (r, variante) => variante === 'lambda'
      ? r + '.nbObjets = 0'
      : r + '.KeyCount = 0',
  },
  'iconik.search': {
    // `$count` sur une valeur absente rend 0 : un seul test couvre « aucun
    // résultat » et « pas de tableau du tout », là où JSONPath demandait de
    // sonder la présence de `objects[0]`.
    empty: (r) => '$count(' + r + '.ResponseBody.objects) = 0',
  },
  'iconik.fetch': {
    not_found: (r) => '$not($exists(' + r + '.ResponseBody))',
  },
  http_sequence: {
    err: (r) => '$not($exists(' + r + '.ResponseBody))',
  },
};

// Rend le texte d'une condition, ou null si l'opérateur n'a pas d'équivalent.
function conditionDe(op, variable, valeur) {
  const f = OPERATEURS[op];
  return f ? f(variable, valeur) : null;
}

// L'enrobage `{% %}` d'ASL, posé au dernier moment. Isolé ici pour que les
// tables ci-dessus restent du texte composable : une condition de port peut
// ainsi être combinée à une autre avant d'être enrobée.
function jsonata(expr) { return '{% ' + expr + ' %}'; }

// Cherche par FAÇADE puis par CORE : une étape porte « aws_s3.deliver », la
// table connaît « deliver ». Les deux entrées sont légitimes — une façade peut
// vouloir sa propre règle, sinon celle du core suffit.
function reglePort(verbe, core, port, resultat, variante) {
  const t = PORTS[verbe] || PORTS[core];
  return t && t[port] ? t[port](resultat, variante) : null;
}

module.exports = { COMPOSITIONS, FORMES, OPERATEURS, PORTS,
                   compositionDe, conditionDe, reglePort, jsonata, txt };

if (require.main === module) {
  console.log('CE QU\'UN VERBE DEVIENT EN ASL\n');
  console.log('Formes validées en console le 2026-08-12 (sonde-asl.json) : http:invoke,');
  console.log('Catch, la BOUCLE de sondage, Map + ItemSelector. Validation de FORME —');
  console.log('rien n\'a encore tourné.\n');
  Object.entries(COMPOSITIONS).forEach(function ([nom, c]) {
    const etats = c.etats({});
    console.log('  ' + nom.padEnd(14) + c.dit.padEnd(22) + etats.length + ' état(s)'
              + (c.lambda ? '   ⚠ DEMANDE UNE LAMBDA' : ''));
    etats.forEach(e => console.log('      ' + e.etat.padEnd(8) + e.role));
  });
  console.log('\nFORMES');
  Object.entries(FORMES).forEach(function ([nom, f]) {
    console.log('  ' + nom.padEnd(14) + f.dit(2));
  });
  const lambdas = Object.entries(COMPOSITIONS).filter(([, c]) => c.lambda).map(([n]) => n);
  console.log('\n⚠ ' + lambdas.length + ' verbe(s) hors de portée d\'ASL seul : ' + lambdas.join(', '));
  console.log('  Du code à écrire, déployer et maintenir — le prix caché de cette');
  console.log('  cible, invisible dans un décompte d\'états.');
}
