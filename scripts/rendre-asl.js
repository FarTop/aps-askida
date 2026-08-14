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
// ── PUIS LE 2026-08-13 : JSONATA, ET UN PREMIER RUN RÉEL ────────
// Trois validations de plus, dans cet ordre :
//
//   sonde-jsonata.json   15 états. Les cinq formes dont dépend la conversion :
//                        Assign à la racine, Arguments/$states.result, Choice
//                        en Condition, $merge en ligne, et surtout un Map SANS
//                        ItemSelector dont le corps lit une variable de la
//                        portée extérieure. Acceptée et dessinée.
//   sonde-auth.json      UN appel, en lecture seule, avec une EventBridge
//                        Connection RÉELLE. C'est le premier run exécuté du
//                        chantier — et il a échoué, pour une raison qui n'a
//                        rien à voir avec la définition : la relation
//                        d'approbation du rôle n'autorisait pas
//                        states.amazonaws.com à l'endosser. Le mécanisme, lui,
//                        a fonctionné : TaskScheduled pointait bien sur la
//                        connexion.
//   PUBLISH complet      65 états en JSONata, 122 expressions, accepté sans une
//                        seule erreur. Trois choses s'y jouaient et tiennent :
//                        les Map IMBRIQUÉS (les cinq boucles du Partner vivent
//                        dans le corps de la boucle principale), les LIAISONS
//                        `$l := … ;` de la syntaxe de bloc, et `$sift` avec une
//                        lambda à deux paramètres.
//                        Le dessin apprend aussi quelque chose : un `skipIfEmpty`
//                        traduit devient un embranchement VISIBLE, là où le
//                        moteur le cache dans une condition interne. La cible
//                        rend parfois le workflow plus lisible que l'original.
//
// MAIS C'EST TOUJOURS UNE VALIDATION DE FORME. La leçon la plus chère du
// chantier Make s'applique mot pour mot : « un blueprint ACCEPTÉ n'est pas un
// blueprint VALIDE ». Ce qui reste à prouver ne se voit qu'à l'exécution : que
// l'authentification passe bout en bout, que les corps de requête partent comme
// attendu, que les chemins de lecture sont les bons. La console a dit oui à
// chaque étape de ce chantier, y compris quand l'ARN de connexion était un UUID
// de zéros et quand l'URL du partenaire pointait sur app.iconik.io.
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
  // ── DEUX VERIFY, ET LE PARAMÈTRE DÉCIDE ──────────────────────────────────
  // Arbitrage du 2026-08-14. Un `verify` dont les contrôles sont écrits dans
  // ses paramètres est un appel HTTP et rien de plus : le catalogue le déclare
  // (`CORES.verify.appel`), l'émetteur en fait un Task, et la règle du port
  // `fail` juge la réponse. C'est le cas de CALLBACK et de CHECK STATUSES.
  //
  // Un `verify` adossé à un MANIFESTE est autre chose : ses contrôles se
  // composent AU RUN, filtrés par le niveau courant (`appliesTo` contre
  // `TypeCollection`). Le catalogue ne sait pas quelles essences s'appliqueront,
  // donc aucune définition ASL ne peut poser la question. C'est de la logique —
  // donc une Lambda, au même titre que `lookup` et `deliver`.
  //
  // Le drapeau dépend donc des PARAMÈTRES, ce qui est nouveau : jusqu'ici un
  // verbe était Lambda ou ne l'était pas. Il l'est ici pour une moitié de ses
  // usages, et le plan doit le dire — sans quoi PUBLISH annoncerait un coût
  // qu'il n'a pas, et les CREER un coût qu'ils ont.
  verify: {
    dit: 'Map sur les essences',
    pourquoi: 'chaque essence se vérifie par son propre appel ; ASL itère nativement '
            + 'et recompose le tableau des résultats sans agrégateur explicite',
    source: 'doc',
    lambda: function (params) { return !!(params && params.manifestId); },
    etats: function (params) {
      if (params && params.manifestId) {
        return [{ etat: 'Task', role: 'Lambda — filtrer les essences par niveau, puis vérifier chacune' }];
      }
      return [
        { etat: 'Map',  role: 'parcourir les essences du manifeste' },
        { etat: 'Task', role: 'interroger verifyEndpoint (dans l\'ItemProcessor)' },
        { etat: 'Pass', role: 'recomposer le verdict' },
      ];
    },
  },
  // Déclaré le 2026-08-14. Il se comptait jusque-là en « gabarit générique »,
  // c'est-à-dire « appel que le catalogue n'a pas encore décrit » — et c'était
  // faux : ce n'est pas un appel qu'on n'a pas pris le temps d'écrire, c'est un
  // verbe qu'ASL seul ne peut pas rendre. La distinction compte, parce que les
  // deux compteurs ne mesurent pas le même travail : l'un du remplissage de
  // catalogue, l'autre du code à écrire, déployer et maintenir.
  //
  // Trois raisons, dont deux rédhibitoires :
  //   — c'est une RÉCURSION sur les nœuds d'un ArboTemplate : N collections
  //     créées, pas une, et N inconnu à l'émission (le gabarit vit en base) ;
  //   — `bayardIdFor` et `nextOrderNumber` lisent LA BASE D'APS (compteurs
  //     maison, via Prisma). Aucune cible ne porte cet état ;
  //   — la numérotation de fratrie interroge Iconik pour trouver le plus grand
  //     numéro existant, puis incrémente — donc une lecture, un calcul, une
  //     écriture, à chaque niveau.
  // Même famille qu'`aps.registry`, et probablement la MÊME Lambda : les deux
  // ont besoin du compteur.
  'iconik.create_tree': {
    dit: 'Lambda + stockage',
    pourquoi: 'crée N collections en descendant un gabarit d\'arborescence, et tire '
            + 'ses identifiants et ses numéros de fratrie des compteurs qui vivent '
            + 'dans la base d\'APS. Ni la récursion sur un gabarit lu en base, ni '
            + 'ces compteurs, ne se posent dans une définition ASL',
    source: 'doc',
    lambda: true,
    etats: function () {
      return [{ etat: 'Task', role: 'Lambda — arborescence complète, identifiants et numéros compris' }];
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
  // `lambda` peut dépendre des paramètres — voir `verify`, Lambda seulement
  // quand ses contrôles viennent d'un manifeste.
  const estLambda = typeof c.lambda === 'function' ? !!c.lambda(params || {}) : !!c.lambda;
  return { dit: c.dit, pourquoi: c.pourquoi,
           mesure: c.source || 'déduit de la spécification ASL',
           lambda: estLambda,
           modules: etats.map(e => ({ module: e.etat, role: e.role })),
           nombre: etats.length };
}

// ── ÉCRIRE UNE VALEUR DANS UNE EXPRESSION JSONATA ───────────────
// Les chaînes de JSONata sont entre apostrophes simples. Une valeur du pivot
// peut en contenir (« L'Épisode ») : sans échappement, la condition casse à la
// validation — et une définition refusée pour une apostrophe est le genre de
// perte de temps qui ne s'explique pas deux fois.
// Un littéral de chaîne JSONata. Corrigé le 2026-08-14 : AWS refuse `\'` —
// « INVALID_JSONATA_EXPRESSION: Unsupported escape sequence » —, alors que
// l'échappement d'une apostrophe dans une chaîne à apostrophes est la première
// chose qu'on écrit. JSONata accepte les deux délimiteurs : on choisit celui
// que le texte ne contient pas, et on n'échappe rien.
//
// Le défaut est resté invisible tant que la branche « reporté » de CALLBACK
// était injoignable — c'est le seul texte du dépôt à porter une apostrophe.
// Deux bugs qui se cachaient l'un l'autre.
function txt(x) {
  const s = String(x == null ? '' : x).replace(/\\/g, '\\\\');
  if (s.indexOf("'") === -1) return "'" + s + "'";
  if (s.indexOf('"') === -1) return '"' + s + '"';
  // Les deux à la fois : il faut bien échapper, et c'est la double qui passe.
  return '"' + s.replace(/"/g, '\\"') + '"';
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
  // ── LE VERDICT D'UN CONTRÔLE ─────────────────────────────────────────────
  // Déclaré le 2026-08-14, en même temps que l'appel de `verify` (premier
  // `appel()` porté par un Core). Sans règle de port, l'appel partait et le
  // verdict n'était pas jugé : l'aiguillage se comptait en intraduisible, et le
  // workflow prenait toujours la sortie nominale — il aurait dit « tout va
  // bien » quoi que réponde le partenaire.
  //
  // `fail` = AU MOINS UN contrôle ne passe pas. On nie la conjonction plutôt
  // que d'assembler une disjonction de négations : c'est la même chose, et ça
  // se relit dans l'ordre où l'auteur a écrit ses contrôles.
  //
  // Première règle de port à avoir besoin de l'ÉTAPE et pas seulement de son
  // résultat — les contrôles vivent dans ses paramètres. D'où l'argument
  // ajouté à `reglePort`.
  verify: {
    fail: (r, variante, etape) => {
      const p = (etape && etape.params) || {};
      // Adossé à un manifeste : c'est une Lambda (voir COMPOSITIONS.verify), et
      // son verdict se lit sur ce qu'elle rend. LE CONTRAT DE LA FONCTION EST
      // ICI, et il est court exprès : `{ total, passed, failures[],
      // checkerSummary }` — la forme exacte que pose déjà le moteur du Builder
      // (builder-handler-verify.js:146-147), pour qu'une même Lambda serve les
      // deux et qu'un lecteur n'ait pas deux modèles à tenir.
      if (p.manifestId) return '$count(' + r + '.failures) > 0';

      const controles = p.checks || [];
      if (!controles.length) return null;
      const conditions = controles.map(function (c) {
        const f = c && OPERATEURS[c.op];
        return f ? f(r + '.ResponseBody.' + c.path, c.value) : null;
      });
      // Un opérateur inconnu et c'est tout le verdict qui saute : juger la
      // moitié des contrôles laisserait passer ce que l'autre moitié refuse,
      // en donnant l'apparence d'une vérification complète.
      if (conditions.some(function (c) { return !c; })) return null;
      return '$not(' + conditions.map(function (c) { return '(' + c + ')'; }).join(' and ') + ')';
    },
  },
};

// ── LES VARIABLES QU'UN VERBE CALCULE ──────────────────────────────────────
// Un handler du moteur ne range pas seulement la réponse d'un appel : il pose
// parfois des valeurs qu'il FABRIQUE. `verify` en pose deux, et les étapes
// suivantes les lisent — les messages d'historique de CALLBACK et de STATUSES
// citent `{checkerSummary}` six fois. Sans elles, l'émission produit six
// références sans porteur, et le run lève States.QueryEvaluationError.
//
// Mécanisme déclaré ici plutôt qu'au cas par cas dans l'émetteur : c'est le
// même savoir que les règles de port — comment lire un résultat —, et il n'y a
// pas de raison qu'il vive à deux endroits.
const POSEES = {
  // ── LES ESSENCES RECONNUES ───────────────────────────────────────────────
  // Ajouté le 2026-08-14, après que la console a signalé huit variables « possibly
  // not defined » sur PUBLISH. `aps-essences` REND les URL — {variables: {...}} —
  // mais l'état ne rangeait que la réponse entière : les étapes suivantes lisaient
  // `$s3_cover_url`, que rien ne posait. Elles auraient levé au run.
  //
  // On nomme donc chaque essence déclarée. Le nom vient du manifeste, jamais
  // d'une liste figée ici : ce sont les mêmes noms que le moteur natif expose,
  // et une liste en dur diverge au premier manifeste qui en ajoute une.
  deliver: function (r, etape) {
    const p = (etape && etape.params) || {};
    const essences = (etape && etape.essences) || p.s3Mappings || [];
    const out = {};
    essences.forEach(function (x) {
      if (x && x.variable) out[x.variable] = r + '.Payload.variables.' + x.variable;
    });
    return Object.keys(out).length ? out : null;
  },

  // L'identifiant attribué. `aps-registry` rend { id, existait } ; le pivot le
  // lit sous le nom que l'étape déclare — `generated_id` par défaut.
  'aps.registry': function (r, etape) {
    const nom = ((etape && etape.params) || {}).varName || 'generated_id';
    const out = {};
    out[nom] = r + '.id';
    return out;
  },

  verify: function (r, etape) {
    const p = (etape && etape.params) || {};
    // Version Lambda : la fonction rend le résumé, on ne le recompose pas.
    if (p.manifestId) return { checkerSummary: r + '.checkerSummary' };

    const controles = p.checks || [];
    if (!controles.length) return null;

    // Une entrée par contrôle : vide s'il passe, « libellé: valeur lue » sinon.
    // Fidèle au handler (builder-handler-verify.js:147), y compris le repli sur
    // « échec » quand la valeur lue est absente — et le « OK » quand tout passe.
    const entrees = controles.map(function (c) {
      const f = c && OPERATEURS[c.op];
      if (!f) return null;
      const lu = r + '.ResponseBody.' + c.path;
      const passe = f(lu, c.value);
      return '(' + passe + ") ? '' : ($a := " + lu + '; ' + txt(c.label || c.path)
           + " & ': ' & ($exists($a) and $a != '' ? $string($a) : 'échec'))";
    });
    if (entrees.some(function (x) { return !x; })) return null;

    return {
      checkerSummary: '($e := [' + entrees.join(', ') + ']; '
                    + "$f := $filter($e, function($m) { $exists($m) and $m != '' }); "
                    + "$count($f) = 0 ? 'OK' : $join($f, ', '))",
    };
    // `checkerResult` n'est PAS posé : c'est un objet {total, passed,
    // failures[]} dont personne ne lit le détail aujourd'hui. Le composer « au
    // cas où » ferait une expression illisible dans la console pour une valeur
    // que rien ne consomme. S'il est lu un jour, le contrôle « sans porteur »
    // le dira.
  },
};

// Les variables calculées d'une étape, ou null. Même appariement que
// `reglePort` : le verbe d'abord, le core à défaut.
function variablesPosees(verbe, core, resultat, etape) {
  const f = POSEES[verbe] || POSEES[core];
  return f ? f(resultat, etape) : null;
}

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
function reglePort(verbe, core, port, resultat, variante, etape) {
  const t = PORTS[verbe] || PORTS[core];
  return t && t[port] ? t[port](resultat, variante, etape) : null;
}

module.exports = { COMPOSITIONS, FORMES, OPERATEURS, PORTS, POSEES,
                   compositionDe, conditionDe, reglePort, variablesPosees, jsonata, txt };

if (require.main === module) {
  console.log('CE QU\'UN VERBE DEVIENT EN ASL\n');
  console.log('Validé en console le 2026-08-13 : PUBLISH entier en JSONata, 65 états,');
  console.log('6 Map dont des Map imbriqués, 122 expressions — aucune erreur. Plus tôt :');
  console.log('les cinq formes JSONata (sonde-jsonata.json) et la boucle de sondage.');
  console.log('VALIDATION DE FORME. Un seul run a été exécuté à ce jour : la sonde');
  console.log('d\'authentification, et elle a échoué sur la relation d\'approbation du');
  console.log('rôle, pas sur la définition.\n');
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
