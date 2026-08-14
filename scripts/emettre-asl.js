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

// QUI LISTE LE BUCKET. `lambda` est le défaut depuis le 2026-08-13 — c'est un
// arbitrage, et il ne s'est PAS joué au prix (0,09 $ d'écart sur 1000 runs).
// Ce qui l'a tranché : en `natif`, c'est le RÔLE de la machine d'états qui
// liste, et la console l'a dit elle-même en refusant de générer la politique
// S3 (« la politique doit être ajoutée manuellement »). Sur le bucket d'un
// client, aucune politique de notre côté ne suffit : il faut une action de son
// propriétaire, donc une négociation par client. En `lambda`, la Lambda liste
// avec les identifiants de la connexion APS — comme le fait déjà
// s3-service.js — et un nouveau client redevient une ligne en base.
// `natif` reste atteignable par --listing natif : c'est la forme validée en
// console le 2026-08-12, et la seule mesurée.
const iList   = process.argv.indexOf('--listing');
const LISTING = iList !== -1 ? String(process.argv[iList + 1] || 'lambda') : 'lambda';

const COMPTE = process.env.AWS_COMPTE || '632075073384';
const REGION = process.env.AWS_REGION || 'eu-west-3';
// LA CONNEXION EVENTBRIDGE, RÉELLE depuis le 2026-08-13. Elle a remplacé un
// UUID de zéros qui a servi de figurant pendant deux jours — la console
// acceptait la définition sans sourciller, ce qui était précisément le piège :
// un ARN bien formé et inexistant se dessine comme un vrai.
// L'UUID est attribué par AWS à la création et ne se devine pas ; il change
// donc à chaque compte client, d'où la surcharge par l'environnement.
const UUID_CONNEXION = process.env.AWS_CONNEXION_ICONIK
                    || '435ccfa9-00d5-4e94-bc14-0ddcb35bcfaf';
const ARN_CONNEXION = 'arn:aws:events:' + REGION + ':' + COMPTE
                    + ':connection/aps-iconik/' + UUID_CONNEXION;

// ── UNE CONNEXION PAR ÉTAPE, PAS UNE POUR TOUTES ────────────────
// Défaut trouvé le 2026-08-13 : tous les `http:invoke` portaient la connexion
// Iconik. Or `Partner` et `Verify` appellent l'API du PARTENAIRE de diffusion,
// avec un `connexionId` que le pivot porte depuis toujours — sur PUBLISH,
// « VODFACTORY | PREPROD | API », en bearer. Ils seraient donc partis signés
// avec le jeton d'Iconik : accepté par la console, dessiné, et refusé au run
// par un 401 qu'on aurait mis un moment à attribuer à la bonne cause.
//
// L'UUID d'une EventBridge Connection est attribué par AWS à la création : il
// ne se devine pas. Une connexion qu'on n'a pas encore créée sort donc avec un
// UUID de zéros — et se compte, plutôt que d'emprunter celui d'une autre.
const nomAws = function (nom) {
  return 'aps-' + String(nom || 'inconnue').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};
let CONNEXIONS = new Map();               // id APS → { nom, authType }
let SEQUENCES  = new Map();               // id Endpoint → steps[]
const connexionsManquantes = new Map();   // nom AWS → nom APS

// LA BASE D'URL DE L'ÉTAPE. Le pivot écrit ses adresses en relatif
// (« /api/persons ») ; le moteur les colle à l'`endpoint` de la connexion — le
// champ s'appelle `endpoint`, pas `baseUrl`, et le confondre coûte une URL
// plausible et fausse. Sans connexion, c'est Iconik, la plateforme du flux.
//
// Émis avec la base d'Iconik, l'appel partenaire visait
// « app.iconik.io/api/persons » : une adresse bien formée, acceptée par la
// console, et qui ne mène nulle part.
function baseDe(connexionId) {
  const c = connexionId && CONNEXIONS.get(connexionId);
  const b = c && c.endpoint;
  return b ? String(b).replace(/\/+$/, '') : BASE_ICONIK;
}

function arnDe(connexionId) {
  if (!connexionId) return ARN_CONNEXION;            // Iconik, la plateforme du flux
  const c = CONNEXIONS.get(connexionId);
  if (!c) return ARN_CONNEXION;
  const nom = nomAws(c.nom);
  if (nom === 'aps-iconik') return ARN_CONNEXION;
  // Surcharge par l'environnement, une variable par connexion :
  // AWS_CONNEXION_VODFACTORY_PREPROD_API=<uuid>
  const cle = 'AWS_CONNEXION_' + nom.replace(/^aps-/, '').replace(/-/g, '_').toUpperCase();
  const uuid = process.env[cle];
  if (!uuid) connexionsManquantes.set(nom, c.nom + ' (' + cle + ')');
  return 'arn:aws:events:' + REGION + ':' + COMPTE + ':connection/' + nom + '/'
       + (uuid || '00000000-0000-0000-0000-000000000000');
}
// Les endpoints du pivot sont des chemins relatifs (« /API/jobs/v1/… ») : le
// moteur natif les colle à la connexion Iconik. ASL veut une URL entière.
const BASE_ICONIK = process.env.ICONIK_BASE || 'https://app.iconik.io';

// Les ports qui ne sont NI le passage nominal NI une erreur. Chacun devient une
// branche de Choice après l'état — c'est là que le compte d'états gonfle.
const PORT_NOMINAL = /^(out|found|ok)$/;
// `fail` N'EST PAS UNE ERREUR — retiré le 2026-08-14. Seul `verify` porte ce
// port (3 arêtes dans les sept flux), et il déclare `error` À CÔTÉ : `fail` est
// un VERDICT — le partenaire a répondu, et il dit non —, `error` est l'appel
// qui n'aboutit pas. Les confondre les envoyait tous deux dans `suivantDe(…,
// PORT_ERREUR)`, qui ne rend que le premier : le Catch partait vers la branche
// d'erreur et la branche de verdict devenait injoignable, sans un mot. C'est
// l'origine des « états jamais atteints » de CALLBACK et de CHECK STATUSES,
// que j'avais pris pour un défaut de câblage du pivot — le pivot était juste.
const PORT_ERREUR  = /^(error|err|erreur|timeout)$/;

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
// `_trigger` AVEC le tiret bas : c'est le nom que le moteur pose réellement
// (wfd-engine-context.js:38). La liste disait « trigger », qui n'existe pas —
// et le contrôle « sans porteur » excusait donc une racine imaginaire.
const RACINE = /^(collection|asset|item|user|now|_trigger)\b/;

// Celles qui se CALCULENT plutôt que de se lire. Rien ne peut les poser :
// `{now}` est l'instant du run. JSONata les fournit, la table les nomme.
const RACINES_CALCULEES = { now: '$now()' };

// ── LES RACINES QUI SE TRADUISENT ───────────────────────────────
// `{trigger.Univers}` n'est PAS un chemin dans un objet nommé `trigger`. C'est
// une variable PLATE dont le nom contient un point, posée par
// `setVar(ctx, 'trigger.' + champ, …)` (wfd-engine-executor.js:222) depuis les
// métadonnées du formulaire attaché à la Custom Action. Le point trompe l'œil :
// émis tel quel, `$trigger.Univers` lirait un champ d'une variable inexistante,
// et le run rendrait vide sans que rien ne le dise.
//
// Même famille que `gabaritSous` dans le catalogue — un suffixe qui se traduit
// au lieu de se recopier. À déplacer dans le catalogue le jour où un second
// émetteur en aura besoin ; ici c'est une convention du moteur, pas d'Iconik.
const RACINES_TRADUITES = [
  // `_trigger` AVEC le tiret bas est le nom que le moteur WFD donne à la charge
  // utile (wfd-engine-context.js:38), et le pivot l'écrit tel quel —
  // `{_trigger.content.external_id}` dans les contrôles de BAYARD | CALLBACK.
  // AWS interdit ce tiret bas en tête d'un nom de variable : on l'assigne donc
  // sous `trigger`, et il faut traduire les lectures aussi. Corrigé le
  // 2026-08-14 en déclarant `verify` — la première fois qu'une de ces
  // références atteignait vraiment l'émission, le gabarit générique les ayant
  // toutes avalées jusque-là. L'Assign avait été renommé le matin même ; les
  // lectures ne l'avaient pas été, et rien ne le disait.
  { motif: /^_trigger(\.[A-Za-z0-9_.[\]]+)?$/, rendre: (m) => '$trigger' + (m[1] || '') },
  { motif: /^trigger\.([A-Za-z0-9_]+)$/,
    // `$trigger` et non `$_trigger` : le moteur WFD nomme la charge utile avec
    // un tiret bas, AWS l'interdit en tête de nom de variable. Le pivot garde
    // son vocabulaire, l'émission adopte celui de la cible.
    rendre: (m) => '$trigger._metadata.' + m[1] + '.field_values[0].value' },
];

// Le nom de VARIABLE sous lequel une étape range sa réponse. Remplace le
// `ResultPath` du temps JSONPath, et c'est le pivot de toute la conversion :
// une étape n'empile plus son résultat dans l'objet qui circule, elle
// l'assigne. L'objet d'état cesse donc de grossir à chaque appel.
//
// UNIQUE À TRAVERS TOUT LE FLUX, et pas seulement dans la portée : ASL refuse
// qu'une portée interne assigne un nom déjà pris à l'extérieur. Les
// identifiants d'étape du pivot étant uniques par construction, la règle est
// tenue sans effort — mais elle est la raison pour laquelle on ne nomme PAS
// d'après le libellé, qui se répète (« Set Metadata » trois fois sur PUBLISH).
function variableDe(e) {
  const brut = String((e && e.id) || 'r').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(brut) ? brut : 'v' + brut;
}

// Une référence du pivot (`{TypeCollection}`, `{search_results.objects}`)
// devient une expression JSONata. Le pivot lit dans un espace de noms global ;
// JSONata en a un aussi, désormais — `$maVariable` — ce qui rapproche
// beaucoup les deux mondes. Le `$.` de l'état qui circule a disparu.
//
// `adresser` est le résolveur de la portée (voir `adressesDe`) : c'est LUI qui
// sait si la valeur est rangée par une étape, aplatie d'un Search, ou nulle
// part. Le gabarit ne fait que découper le nom de son suffixe.
function expr(gabarit, adresser, aplatie) {
  const t = String(gabarit || '').trim();
  const m = t.match(/^\{([^{}]+)\}$/);
  const ref = m ? m[1] : t;
  if (ref.startsWith('$')) return ref;
  const propre = ref.replace(/[^A-Za-z0-9_.[\]]/g, '_');
  // Une racine qui n'est pas une donnée mais un CALCUL. `{now}` du pivot n'est
  // porté par rien et ne peut pas l'être : c'est l'instant présent. JSONata le
  // fournit en fonction intégrée. Émis en `$now`, il passait le contrôle « sans
  // porteur » (RACINE l'excuse) pour échouer au run sur une variable inconnue —
  // exactement le genre de trou que les deux filets laissent passer ensemble.
  if (RACINES_CALCULEES[propre]) return RACINES_CALCULEES[propre];
  for (let i = 0; i < RACINES_TRADUITES.length; i++) {
    const m = propre.match(RACINES_TRADUITES[i].motif);
    if (m) return RACINES_TRADUITES[i].rendre(m);
  }
  // Ce que le déclencheur pose : il l'assigne en variables à la racine, donc
  // ces noms se lisent directement, sans passer par le résolveur.
  if (RACINE.test(propre)) return '$' + propre;
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
//
// Dans les deux premiers cas le suffixe d'une référence n'est pas toujours
// recopiable : `{serieMetadata.TypeCollection}` se traduit, il ne se concatène
// pas. D'où les GABARITS, que le catalogue déclare et qu'on applique ici — un
// émetteur n'a pas à savoir comment Iconik range ses métadonnées.
function applique(gabarit, nom) { return String(gabarit).replace('{}', nom); }

function adressesDe(etapes, chemin) {
  const rangees   = new Map();               // nom → { base, gabaritSous }
  const mdParObjet = new Map();              // idEtape → { objet → { base, gabarit } }
  const mdToutes   = new Map();              // idEtape → dernier aplatisseur, tous objets

  // ── LE GARDE-FOU DU REPLI « MÉTADONNÉE APLATIE » ──────────────
  // Ajouté le 2026-08-14, après que la console AWS a signalé ce que nous
  // n'avions pas vu : `Set Bayard ID` écrivait
  //   $http_request_<Search>.ResponseBody.objects[0].metadata.generated_id
  // c'est-à-dire `generated_id` lu comme une métadonnée Iconik aplatie d'un
  // Search — alors que le plan la déclare PRODUITE par « Create ID Generator ».
  // Le repli avait fabriqué un chemin plausible et faux, dans une réponse qui
  // n'a rien à voir, et de surcroît posée par un état qui s'exécute APRÈS.
  //
  // On note donc les noms produits par une étape qui n'aplatit PAS de
  // métadonnées. Ceux-là ne peuvent pas être des champs aplatis, par
  // construction — et le repli n'a pas à les inventer.
  //
  // Nuance qui compte : les noms produits par un aplatisseur (`title`, `id`,
  // `object_type`… qu'un Search expose nus) restent éligibles au repli, sans
  // quoi on casserait la seule chose que ce repli sait bien faire.
  const produitesHorsAplatissement = new Map();   // nom → libellé de l'étape
  etapes.forEach(function (e) {
    if (CAT.aplatitMetadonnees({ facade: e.verbe, core: e.core, params: e.params || {} })) return;
    (e.produit || []).forEach(function (n) {
      const racine = String(n).split('.')[0];
      if (!produitesHorsAplatissement.has(racine)) produitesHorsAplatissement.set(racine, e.label || e.id);
    });
  });

  const courantParObjet = {};
  let courante = null;
  etapes.forEach(function (e) {
    const etape = { facade: e.verbe, core: e.core, params: e.params || {} };
    mdParObjet.set(e.id, Object.assign({}, courantParObjet));
    mdToutes.set(e.id, courante);
    // Ce que l'étape RANGE, déclaré par le catalogue. Sans `depuis`, la valeur
    // est calculée par le handler ou vient d'un autre appel : aucun JSONPath ne
    // la rend, on ne prétend pas. `depuis` VIDE est une déclaration à part
    // entière — « la réponse elle-même » — d'où le test sur le type et non sur
    // la valeur, qui écartait silencieusement les quatre sous-types de Fetch.
    CAT.variablesDe(etape).forEach(function (v) {
      if (!v || typeof v.depuis !== 'string' || rangees.has(v.nom)) return;
      rangees.set(v.nom, { base: chemin(e) + '.ResponseBody' + (v.depuis ? '.' + v.depuis : ''),
                           gabaritSous: v.gabaritSous || null });
    });
    if (CAT.aplatitMetadonnees(etape)) {
      const gabarit = CAT.gabaritMetadonneeDe(etape);
      // Une étape qui aplatit sans dire OÙ ne donne aucune adresse : mieux vaut
      // la traiter comme absente que fabriquer un chemin plausible.
      courante = gabarit ? { base: chemin(e), gabarit: gabarit } : null;
      const objet = CAT.objetDe(etape);
      if (objet && courante) courantParObjet[objet] = courante;
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
        if (!rangees.has(cle)) continue;
        const r = rangees.get(cle);
        const reste = parts.slice(i);
        if (!reste.length) return r.base;
        // Le premier segment restant passe par le gabarit quand il y en a un
        // (un champ de métadonnée ne se lit pas là où son nom le laisse croire) ;
        // le reste se recopie.
        if (r.gabaritSous) {
          return r.base + '.' + applique(r.gabaritSous, reste[0])
               + (reste.length > 1 ? '.' + reste.slice(1).join('.') : '');
        }
        return r.base + '.' + reste.join('.');
      }
      const nom = parts[0];
      // Produite ailleurs qu'ailleurs par un aplatisseur : le repli ne s'applique
      // pas. On ne sait pas OÙ la valeur se trouve dans la réponse du
      // producteur — le catalogue ne le déclare pas (`depuis` absent) — et
      // inventer un chemin serait exactement la faute qu'on vient de corriger.
      // On la rend en variable nue, ce qui la fait remonter dans « sans
      // porteur » et lever States.QueryEvaluationError au run plutôt que de
      // lire silencieusement dans la réponse d'un autre appel.
      if (o.aplatie && produitesHorsAplatissement.has(nom)) {
        if (besoins && !besoins.has(nom)) {
          besoins.set(nom, { nom: nom, objet: o.objet || null, aplatie: true,
                             produitePar: produitesHorsAplatissement.get(nom) });
        }
        return '$' + ref;
      }
      if (o.aplatie) {
        const src = (o.objet && (mdParObjet.get(idEtape) || {})[o.objet]) || mdToutes.get(idEtape);
        if (src) return src.base + '.ResponseBody.' + applique(src.gabarit, ref);
      }
      // Rien ne la pose ici. On rend le nom nu en variable — ce qui, en
      // JSONata, n'est plus un silence : lire une variable non assignée lève
      // States.QueryEvaluationError au run, là où un JSONPath vers un champ
      // absent rendait du vide sans broncher. Le contrôle « sans porteur »
      // reste utile pour le dire AVANT, mais le langage ne ment plus.
      if (besoins && !besoins.has(nom)) besoins.set(nom, { nom: nom, objet: o.objet || null, aplatie: !!o.aplatie });
      return '$' + ref;
    };
  };
}

// ── LES FONCTIONS DU PIVOT, TRADUITES ───────────────────────────
// Le pivot autorise des appels dans ses gabarits — `{filebase(item.title)}`.
// En JSONPath, aucune intrinsèque ne les rendait : l'émetteur REFUSAIT le
// gabarit entier et signalait un intraduisible. JSONata a une bibliothèque de
// chaînes, donc la plupart passent maintenant.
//
// La table reste courte et EXPLICITE : traduire au jugé une fonction qu'on n'a
// pas vérifiée produirait une URL plausible et fausse, ce qui est pire que le
// refus. Ce qui n'y figure pas continue d'être refusé et signalé.
const FONCTIONS = {
  // Retirer l'extension d'un nom de fichier. Surtout PAS `$substringBefore`,
  // qui s'arrête au PREMIER point : « saison.01.mp4 » y perdrait « 01.mp4 ».
  // Le moteur natif coupe au DERNIER point, ce que dit exactement ce motif.
  filebase: (a) => '$replace(' + a + ", /\\.[^.]*$/, '')",
  lower:    (a) => '$lowercase(' + a + ')',
  upper:    (a) => '$uppercase(' + a + ')',
  trim:     (a) => '$trim(' + a + ')',
};

// Un gabarit de texte (« /API/jobs/v1/jobs/{exportJobId}/ ») en JSONata. Une
// valeur qui contient une référence ne peut pas rester une chaîne : elle
// devient une concaténation (`'…' & $ref & '…'`). Sans ça, le sondage
// interrogeait littéralement l'URL « …/{exportJobId}/ ».
//
// Plus simple que le temps de `States.Format` : la concaténation se lit dans
// l'ordre du texte, sans table d'arguments à apparier aux trous.
function gabaritJsonata(texte, adresser, intraduisibles, ou) {
  const t = String(texte || '');
  if (!/\{[^{}]+\}/.test(t)) return { valeur: t };
  const morceaux = [];
  let refuse = false;
  let reste = t;
  let m;
  const RE = /\{([^{}]+)\}/;
  while ((m = RE.exec(reste)) !== null) {
    if (m.index > 0) morceaux.push(ASL.txt(reste.slice(0, m.index)));
    const ref = m[1].trim();
    const appel = ref.match(/^([A-Za-z_]\w*)\s*\((.*)\)$/);
    if (appel) {
      const f = FONCTIONS[appel[1]];
      if (!f) {
        refuse = true;
        intraduisibles.push({ etat: ou, port: '(gabarit)', op: 'fonction ' + ref });
      } else {
        morceaux.push(f(expr('{' + appel[2].trim() + '}', adresser, true)));
      }
    } else {
      morceaux.push(expr('{' + ref + '}', adresser, true));
    }
    reste = reste.slice(m.index + m[0].length);
  }
  if (refuse) return { valeur: t };
  if (reste) morceaux.push(ASL.txt(reste));
  // Une référence seule ne se concatène pas : on rend l'expression nue, ce qui
  // préserve son TYPE (un nombre reste un nombre).
  return { jsonata: morceaux.length === 1 ? morceaux[0] : morceaux.join(' & ') };
}

// Un champ de gabarit rendu tel qu'ASL l'attend : une chaîne nue si elle ne
// contient aucune référence, une expression `{% %}` sinon. Deux formes plutôt
// qu'une, parce qu'enrober systématiquement transformerait « /API/… » en
// expression JSONata inutile — et illisible dans la console.
function champ(texte, adresser, intraduisibles, ou) {
  const g = gabaritJsonata(texte, adresser, intraduisibles, ou);
  return g.jsonata ? ASL.jsonata(g.jsonata) : g.valeur;
}

// ── LES TRANSFORMATIONS DÉCLARÉES ───────────────────────────────
// Le partage : le CATALOGUE dit qu'il faut transformer (c'est une règle
// d'Iconik), l'ÉMETTEUR sait l'écrire dans sa cible (c'est une affaire de
// langage). Un gabarit seul ne pouvait pas porter ça — une valeur peut avoir
// besoin d'être assemblée PUIS retravaillée.
// ── LE SLUG DU MOTEUR, EN JSONATA ───────────────────────────────
// `_wfdSlugify` normalise en NFD pour retirer les accents. JSONata NE SAIT PAS
// normaliser l'Unicode — il faut donc une table. Écrite à la main elle aurait
// été fausse : elle est DÉRIVÉE de la règle du moteur (tout caractère latin
// dont NFD rend une seule lettre ASCII), puis vérifiée par balayage exhaustif
// de U+0020 à U+024F, zéro écart.
//
// Ce que la table ne contient PAS est aussi important : `œ`, `æ`, `ß`, `ł`, `đ`
// ne se décomposent pas en NFD, donc le moteur les écrase en tiret — « Sœur »
// devient « s-ur ». On reproduit ça. Un émetteur transcrit, il n'améliore pas :
// « soeur » serait plus joli et produirait un external_id différent de celui du
// moteur, sur une clé d'identité chez le partenaire.
const SLUG_TABLE = [
  ['àáâãäåāăąǎǟǡǻȁȃȧ', 'a'], ['çćĉċč', 'c'], ['èéêëēĕėęěȅȇȩ', 'e'],
  ['ìíîïĩīĭįǐȉȋ', 'i'], ['ñńņňǹ', 'n'], ['òóôõöōŏőơǒǫǭȍȏȫȭȯȱ', 'o'],
  ['ùúûüũūŭůűųưǔǖǘǚǜȕȗ', 'u'], ['ýÿŷȳ', 'y'], ['ď', 'd'], ['ĝğġģǧǵ', 'g'],
  ['ĥȟ', 'h'], ['ĵǰ', 'j'], ['ķǩ', 'k'], ['ĺļľ', 'l'], ['ŕŗřȑȓ', 'r'],
  ['śŝşšș', 's'], ['ţťț', 't'], ['ŵ', 'w'], ['źżž', 'z'],
];

function slugJsonata(e) {
  // Minuscules, PUIS retrait des signes combinants — « İ » devient en minuscule
  // « i » suivi d'un point combinant, et sans ce retrait il resterait un tiret.
  let x = '$replace($lowercase(' + e + "), /[\\u0300-\\u036f]/, '')";
  SLUG_TABLE.forEach(function (p) {
    x = '$replace(' + x + ', /[' + p[0] + ']/, ' + ASL.txt(p[1]) + ')';
  });
  x = '$replace(' + x + ", /[^a-z0-9]+/, '-')";
  return '$replace(' + x + ", /^-+|-+$/, '')";
}

const TRANSFORMATIONS = {
  // Le slug d'une valeur de liste, tel que le moteur le fabrique.
  slugAps: slugJsonata,
  // Le nom de fichier d'un export Iconik : espaces en tirets bas, puis tout ce
  // qui n'est ni alphanumérique ni `_ - /` disparaît (handler :1305). Ce n'est
  // pas cosmétique : c'est l'adresse S3 finale, celle qu'APS revérifiera par
  // listing. Livrer à un chemin et contrôler à un autre passerait inaperçu
  // jusqu'au premier fichier manquant.
  nomFichierIconik: (e) => "$replace($replace(" + e + ", /\\s+/, '_'), /[^a-zA-Z0-9_\\-\\/]/, '')",
};

// LE CORPS D'UNE REQUÊTE, dont les feuilles peuvent porter des références.
// Le catalogue décrit la forme Iconik une fois pour toutes ; ici on ne fait que
// remplacer les gabarits, à n'importe quelle profondeur.
function corpsResolu(v, adresser, intraduisibles, ou) {
  // Une feuille déclarée `{ gabarit, transforme }` : on assemble, puis on
  // applique la transformation nommée. Inconnue au tableau : on refuse et on
  // le signale, comme pour les fonctions de gabarit.
  if (v && typeof v === 'object' && !Array.isArray(v)
      && typeof v.gabarit === 'string' && typeof v.transforme === 'string') {
    const g = gabaritJsonata(v.gabarit, adresser, intraduisibles, ou);
    const f = TRANSFORMATIONS[v.transforme];
    if (!f) {
      intraduisibles.push({ etat: ou, port: '(corps)', op: 'transformation ' + v.transforme });
      return v.gabarit;
    }
    return ASL.jsonata(f(g.jsonata ? g.jsonata : ASL.txt(g.valeur)));
  }
  // Une feuille qui parle de L'ÉLÉMENT COURANT d'une boucle. Dans un Map,
  // l'entrée de chaque itération EST l'élément — d'où `$states.input`, et le
  // rang qui se lit dans l'objet de contexte.
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.element === 'string') {
    if (v.element === 'valeur') return '{% $states.input %}';
    if (v.element === 'slug')   return ASL.jsonata(TRANSFORMATIONS.slugAps('$states.input'));
    if (v.element === 'rang')   return '{% $states.context.Map.Item.Index %}';
    intraduisibles.push({ etat: ou, port: '(corps)', op: 'élément ' + v.element });
    return null;
  }
  if (typeof v === 'string') return champ(v, adresser, intraduisibles, ou);
  if (Array.isArray(v)) return v.map(x => corpsResolu(x, adresser, intraduisibles, ou));
  if (v && typeof v === 'object') {
    const o = {};
    Object.entries(v).forEach(function ([k, x]) {
      o[k] = corpsResolu(x, adresser, intraduisibles, ou);
    });
    return o;
  }
  return v;
}

// UN OBJET JAVASCRIPT ÉCRIT COMME SOURCE JSONATA. Nécessaire dès qu'un objet
// doit devenir l'ARGUMENT d'une fonction — `$merge([…, {…}])` : à l'intérieur
// d'une expression on n'est plus en JSON, on est dans le langage. Les feuilles
// déjà enrobées (`{% … %}`) reperdent leur enrobage : on est déjà dedans.
function litteralJsonata(v) {
  if (typeof v === 'string') {
    const m = v.match(/^\{%\s*([\s\S]*?)\s*%\}$/);
    return m ? m[1] : ASL.txt(v);
  }
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(litteralJsonata).join(', ') + ']';
  if (typeof v === 'object') {
    return '{' + Object.entries(v)
      .map(([k, x]) => ASL.txt(k) + ': ' + litteralJsonata(x)).join(', ') + '}';
  }
  return 'null';
}

// ── LES ÉTATS D'UNE PORTÉE ──────────────────────────────────────
function etatsDe(etapes, nommer, contexte) {
  const States = {};
  const nomDe  = new Map();
  // Où chaque étape range sa réponse. Les règles de port en ont besoin :
  // reconnaître un `miss` demande de relire le résultat réel, pas une chaîne.
  const sortieDe = new Map();
  const intraduisibles = contexte.intraduisibles || (contexte.intraduisibles = []);
  // Les étapes retombées sur le gabarit générique : la mesure de ce que le
  // catalogue ne décrit pas encore. Comptées plutôt que devinées.
  const generiques = contexte.generiques || (contexte.generiques = []);
  // LE CONTRAT D'ENTRÉE DE LA PORTÉE, constaté plutôt que déclaré : chaque
  // référence qu'aucune étape d'ici ne pose s'y inscrit toute seule. C'est ce
  // que l'appelant doit projeter dans l'ItemSelector du Map — sans quoi le
  // corps de boucle lit dans le vide, ce qu'il faisait pour `TypeCollection`.
  const besoins = contexte.besoins || (contexte.besoins = new Map());
  // Le nom sous lequel un Catch range la cause de l'échec. Propre à la portée :
  // voir le commentaire au site de l'Assign.
  const varErreur = contexte.varErreur || 'erreur';
  // La variable d'une étape, calculable AVANT que son état soit bâti : une
  // référence peut viser une étape que la boucle d'émission n'a pas encore vue.
  const chemin = function (e) { return '$' + variableDe(e); };
  const resolveur = adressesDe(etapes, chemin);
  const adresserChez = function (e) { return resolveur(e.id, besoins); };
  // LES APPELS D'ABORD, LES NOMS ENSUITE. Une étape qui fait deux requêtes
  // s'étale sur deux états, et le PREMIER est celui que les arêtes entrantes
  // doivent viser. Nommer l'entrée « Set Metadata » quand elle fait un GET
  // serait un mensonge dans le dessin — or le dessin est ce que le collègue
  // lit. On calcule donc les appels avant de nommer, pour que l'entrée porte
  // son vrai rôle (« Set Metadata - relire ») et que le nom nu revienne à
  // l'étape qui agit vraiment.
  const appelsDe = new Map();
  etapes.forEach(function (e) {
    // La séquence résolue prime sur le `steps` résiduel des paramètres : sur
    // PUBLISH, le pivot en porte UN et la ressource en a SEPT.
    const params = Object.assign({}, e.params || {});
    if (params.sequenceId && SEQUENCES.has(params.sequenceId)) {
      params.steps = SEQUENCES.get(params.sequenceId);
    }
    const a = CAT.appelDe({ facade: e.verbe, core: e.core, params: params });
    if (a && a.length) appelsDe.set(e.id, a);
  });
  const libelleDe = new Map();
  etapes.forEach(function (e) {
    const base = nommer(e.label, e.id);
    libelleDe.set(e.id, base);
    const a = appelsDe.get(e.id);
    nomDe.set(e.id, a && a.length > 1 ? base + ' - ' + a[0].role : base);
  });

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
      const champ = expr((e.params || {}).field, adresserChez(e), true);
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
          // `Condition` remplace `Variable` + comparateur : la règle s'affiche
          // en toutes lettres sur l'arête dans la console, ce qu'un empilement
          // de Or/Not ne faisait pas.
          Choices.push({ Condition: ASL.jsonata(regle), Next: nomDe.get(x.vers) });
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
      // ── L'ITEMSELECTOR A DISPARU, ET C'EST LE GAIN PRINCIPAL ──────
      // Il était le contrat d'entrée du corps : il fallait projeter à la main,
      // depuis la portée parente, tout ce que le corps allait lire —
      // `traversantes` (déclaré par le plan) plus `besoinsDuCorps` (constaté à
      // l'émission, dont `TypeCollection`, que personne ne déclare jamais parce
      // que dans le moteur natif elle est d'ambiance).
      //
      // JSONata a des variables, et la doc est explicite : « Parallel branches
      // and Map iterations can access variable values from outer scopes ». Le
      // corps lit donc `$TypeCollection` directement. La projection n'a plus
      // d'objet, et avec elle disparaît toute une classe de bogues — une
      // valeur oubliée dans l'ItemSelector faisait lire du vide au corps sans
      // que rien ne le signale.
      //
      // MAIS IL FAUT ENCORE POSER CE QUE LE CORPS EMPRUNTE. Une portée interne
      // hérite des variables du dehors — encore faut-il qu'elles existent
      // dehors. `TypeCollection` est une métadonnée APLATIE : dans la portée
      // parente elle a une adresse (le résultat du Search), dans le corps elle
      // n'en a aucune. Le premier essai de cette conversion l'a signalé tout
      // seul, deux fois — le contrôle « sans porteur » a fait son travail.
      //
      // D'où un Pass qui NOMME ce que la boucle emprunte, juste avant elle. Il
      // coûte un état, et il le vaut : l'ItemSelector cachait ce contrat dans
      // un coin de la définition du Map, ce Pass l'affiche comme une étape du
      // graphe. Un lecteur voit ce qui entre dans la boucle sans déplier quoi
      // que ce soit.
      const adresser = adresserChez(e);
      const emprunts = {};
      // UNE VALEUR QUE LE PARENT NE POSE PAS NON PLUS NE S'ASSIGNE PAS. Le
      // résolveur rend le nom nu (`$ancestorPath`) quand rien ne le porte dans
      // cette portée : l'assigner produirait `ancestorPath: {% $ancestorPath %}`,
      // une variable qui se lit elle-même. Pire que faux — ça REND LE CONTRÔLE
      // AVEUGLE, puisque le Pass compte alors comme porteur. Le défaut a été
      // introduit puis rattrapé dans la même heure ; sans le contrôle il serait
      // parti en console.
      const poser = function (nom, opts) {
        const adresse = adresser(nom, opts);
        if (adresse === '$' + nom) return;               // rien dans le parent non plus
        emprunts[nom] = ASL.jsonata(adresse);
      };
      (contexte.traversantes || []).forEach(function (v) {
        poser(v, { aplatie: false });
      });
      (contexte.besoinsDuCorps || []).forEach(function (b) {
        poser(b.nom, { aplatie: b.aplatie, objet: b.objet });
      });

      const nBoucle = Object.keys(emprunts).length ? nom + ' - iterer' : nom;
      const boucle = {
        Type: 'Map',
        // SUR QUOI la boucle itère. C'était `$.items` en dur — un champ que
        // rien ne pose : le Map aurait tourné à vide, et la console n'avait
        // aucune raison de le dire. Le pivot le déclare depuis toujours
        // (`loopVariablePath`), personne ne le lui demandait.
        Items: ASL.jsonata(expr((e.params || {}).loopVariablePath || '$items',
                                adresserChez(e), false)),
        ItemProcessor: contexte.corps || { ProcessorConfig: { Mode: 'INLINE' },
                                           StartAt: 'CorpsVide', States: { CorpsVide: { Type: 'Succeed' } } },
        Next: nominal,
      };
      if (nBoucle === nom) {
        etat = boucle;                       // rien à emprunter : la boucle seule
      } else {
        // Le Pass garde le nom de l'étape, sinon les arêtes entrantes le
        // rateraient — elles visent `nom`, calculé avant qu'on sache qu'il
        // faudrait deux états.
        States[nBoucle] = boucle;
        porteur = nBoucle;
        etat = { Type: 'Pass',
                 Comment: 'CE QUE LA BOUCLE EMPRUNTE AU DEHORS. En JSONata une portée '
                        + 'interne lit les variables de la portée extérieure : il suffit '
                        + 'donc de les nommer ici. Remplace l\'ItemSelector, qui cachait '
                        + 'le même contrat dans la définition du Map.',
                 Assign: emprunts,
                 Next: nBoucle };
      }
    } else if (e.core === 'wait') {
      // La composition VALIDÉE en console : trois états qui bouclent. On pose
      // les deux compagnons ici, et l'état nommé porte l'interrogation.
      const nAttendre = nom + ' - attendre';
      const nVerdict  = nom + ' - termine';
      const vSonde    = variableDe(e) + '_sonde';
      States[nAttendre] = { Type: 'Wait',
        Seconds: Number((e.params || {}).delaySeconds) || 20, Next: nom };
      States[nVerdict] = { Type: 'Choice',
        Choices: [{ Condition: ASL.jsonata('$' + vSonde + '.ResponseBody.status = '
                     + ASL.txt(String((e.params || {}).checkValue || 'FINISHED'))),
                    Next: nominal }],
        Default: nAttendre };
      // L'URL du sondage porte l'identifiant du job d'export
      // (« /API/jobs/v1/jobs/{exportJobId}/ »). Elle partait telle quelle :
      // le sondage interrogeait littéralement une URL à accolades, sur un
      // chemin relatif de surcroît. La référence est maintenant adressée, et
      // l'assemblage confié à la concaténation JSONata.
      const cible = String((e.params || {}).endpoint || 'https://exemple.invalid');
      const url = gabaritJsonata(cible.startsWith('/') ? baseDe((e.params || {}).connexionId) + cible : cible,
                                 adresserChez(e), intraduisibles, nom);
      etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
               Arguments: { ApiEndpoint: url.jsonata ? ASL.jsonata(url.jsonata) : url.valeur,
                            Method: 'GET',
                            Authentication: { ConnectionArn: arnDe((e.params || {}).connexionId) } },
               Assign: { [vSonde]: '{% $states.result %}' },
               Next: nVerdict };
      // Surtout PAS d'entrée de portée ici : le Wait est un état du milieu du
      // flux. Une première version le posait en StartAt, ce qui rendait les
      // cinq états qui le précèdent inatteignables — le contrôle de connexité
      // l'a signalé au premier essai.
    } else {
      const compo = ASL.compositionDe(e.verbe || e.core, e.params || {});
      if (compo && compo.lambda) {
        // La fragilité laissée volontairement le 2026-08-13 a disparu d'elle-
        // même : le résultat se rangeait sous `'$.' + core`, donc deux étapes
        // `aps.registry` dans une même portée se seraient marché dessus. La
        // variable étant nommée d'après l'ÉTAPE, la collision n'est plus
        // possible.
        etat = { Type: 'Task',
                 Resource: 'arn:aws:lambda:' + REGION + ':' + COMPTE + ':function:aps-' + (e.core || 'logique'),
                 Comment: 'FONCTION À ÉCRIRE — ' + compo.pourquoi,
                 Assign: { [variableDe(e)]: '{% $states.result %}' }, Next: nominal };
      } else if (e.core === 'deliver') {
        // ASL sait LISTER un bucket (intégration native) mais pas RECONNAÎTRE
        // ce qu'il contient : associer « friday_s01_season.png » à l'essence
        // `season_box` demande de comparer des motifs, d'écarter les doublons
        // d'upload, de filtrer par niveau. Aucune intrinsèque ne fait ça. Le
        // listing seul laisserait les sept `s3_*_url` introuvables — donc le
        // workflow entier muet sur ce qu'il a livré.
        //
        // D'où DEUX compositions possibles, et le choix n'est pas esthétique :
        //
        //   natif   S3:ListObjectsV2 puis Lambda. Deux états, zéro identifiant
        //           à porter — mais le listing est signé par le RÔLE de la
        //           machine d'états, jamais par des identifiants qu'on lui
        //           passe. Un bucket qui ne nous appartient pas exige donc une
        //           action de son propriétaire.
        //   lambda  la Lambda liste elle-même, avec les identifiants de la
        //           connexion APS — exactement ce que fait s3-service.js. Un
        //           état de moins par livraison, et le modèle de connexion
        //           d'APS se transpose enfin : un nouveau client est une ligne
        //           en base, pas une négociation IAM.
        const payload = {
          essences: e.essences || (e.params && e.params.s3Mappings) || [],
          // Le niveau courant, qui décide quelles essences s'appliquent.
          // L'adresse ne se devine plus : le catalogue déclare CETTE
          // lecture (`lectures`), y compris de quel objet elle se lit — la
          // collection publiée, jamais le dernier Search venu, qui sur
          // PUBLISH cherche des assets.
          typeCollection: ASL.jsonata((function () {
            const lu = CAT.lecturesDe({ facade: e.verbe, core: e.core, params: e.params || {} })
              .find(x => x && x.nom === 'TypeCollection');
            return adresserChez(e)('TypeCollection', { aplatie: true, objet: lu ? lu.objet : null });
          })()),
        };
        const reconnaitre = {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Comment: 'aps-essences — le module builder-essences.js, tel quel. Ne PAS le '
                 + 'réécrire : ces URL sont livrées au partenaire puis vérifiées par APS, '
                 + 'deux implémentations qui divergent contrôleraient une autre adresse '
                 + 'que celle qu\'elles ont envoyée.',
          Arguments: { FunctionName: 'aps-essences', Payload: payload },
          // Le ResultSelector n'existe plus : Assign fait le tri directement,
          // et l'on garde le dépaquetage de `Payload` que l'invocation Lambda
          // impose.
          Assign: { [variableDe(e)]: '{% $states.result.Payload %}' },
          Next: nominal,
        };

        if (LISTING === 'lambda') {
          // La connexion S3 par son id : la Lambda va chercher les identifiants
          // elle-même. On ne fait JAMAIS transiter une clé par la définition —
          // une définition de machine d'états se lit en clair dans la console.
          payload.connexionId = (e.params && e.params.connexionId) || 'a-renseigner';
          payload.objectKey   = (e.params && e.params.objectKey) || '';
          reconnaitre.Comment += ' Liste AUSSI le bucket (identifiants de la connexion APS) : '
            + 'l\'intégration S3 native signe avec le rôle d\'exécution, donc elle ne sait '
            + 'pas atteindre le bucket d\'un client.';
          // Et surtout PAS de `base` : le bucket vit dans les identifiants
          // chiffrés de la connexion (s3-service.js le lit dans authValueEnc).
          // La Lambda qui tient déjà le connexionId sait donc le composer —
          // le poser ici serait une seconde source pour la même valeur.
          etat = reconnaitre;
        } else {
          const nReconnu = nom + ' - reconnaitre';
          // En natif la Lambda n'a pas la connexion : le préfixe d'URL doit
          // lui venir de la définition, faute de quoi les `s3_*_url` sortent
          // relatives. C'est un espace réservé de plus, et c'est un des coûts
          // de cette variante.
          payload.base = 's3://a-renseigner/';
          payload.listing = '{% $' + variableDe(e) + '_s3 %}';
          etat = { Type: 'Task', Resource: 'arn:aws:states:::aws-sdk:s3:listObjectsV2',
                   Arguments: { Bucket: 'a-renseigner', Prefix: 'a-renseigner' },
                   Assign: { [variableDe(e) + '_s3']: '{% $states.result %}' }, Next: nReconnu };
          porteur = nReconnu;
          States[nReconnu] = reconnaitre;
        }
      } else if (e.core === 'trigger') {
        // LE DÉCLENCHEUR POSE LES RACINES. Elles étaient supposées présentes
        // dans l'état qui circule (`$.collection.id`) sans que rien ne les y
        // mette : l'entrée du run les portait par chance, à la racine. En
        // JSONata rien n'est d'ambiance — on les assigne, une fois, ici, et
        // tout le flux les lit ensuite comme `$collection`. C'est aussi le
        // contrat d'entrée du run, enfin écrit noir sur blanc.
        etat = { Type: 'Pass',
                 Comment: 'Le déclencheur vit HORS de la machine d\'états (EventBridge ou '
                        + 'StartExecution). Cet état ne fait qu\'une chose : nommer ce que '
                        + 'l\'évènement apporte.',
                 Assign: { collection: '{% $states.input.collection %}',
                           asset:      '{% $states.input.asset %}',
                           user:       '{% $states.input.user %}',
                           // La charge utile du webhook elle-même, pas un champ
                           // de celle-ci — c'est ce que pose
                           // wfd-engine-context.js:38, sous le nom `_trigger`.
                           //
                           // ÉMISE SANS LE TIRET BAS : AWS exige qu'un nom de
                           // variable commence par une lettre, et refuse la
                           // définition entière avec INVALID_VARIABLE_NAME.
                           // Trouvé le 2026-08-14 à la première soumission
                           // réelle — la console ne l'avait jamais dit, parce
                           // qu'on n'avait jamais soumis PUBLISH.
                           trigger:    '{% $states.input %}' },
                 Next: nominal };
      } else {
        // ── L'APPEL DÉCLARÉ PAR LE CATALOGUE ──────────────────────
        // Une façade qui décrit ses requêtes (`appel()`) est émise pour de
        // vrai ; les autres retombent sur le gabarit générique plus bas, qui
        // est un aveu d'ignorance et se compte comme tel dans le rapport.
        const appels = appelsDe.get(e.id);
        if (appels && appels.length) {
          const adr = adresserChez(e);
          // Une étape peut faire PLUSIEURS requêtes — `set_metadata` relit avant
          // d'écrire, parce qu'Iconik n'accepte que PUT sur une vue. Chacune
          // devient un état, chaîné au suivant. Le dernier porte le Next final.
          // Les noms viennent du LIBELLÉ, pas de l'état d'entrée : sans quoi le
          // second s'appellerait « Set Metadata - relire - ecrire ».
          const base = libelleDe.get(e.id);
          const noms = appels.map((a, i) => (appels.length > 1 ? base + ' - ' + a.role : base));
          const vars = appels.map((a, i) => variableDe(e) + (i === 0 ? '' : '_' + a.role));

          // Rempli par le journal en mode « change » : l'écriture devient
          // conditionnelle, et l'aiguillage se pose après coup — il lui faut la
          // ligne d'avant ET la ligne qu'on s'apprête à écrire.
          let ecritureConditionnelle = null;

          appels.forEach(function (a, i) {
            const dernier = i === appels.length - 1;
            const cible = String(a.chemin || '/');
            const args = {
              ApiEndpoint: champ(cible.startsWith('/') ? baseDe((e.params || {}).connexionId) + cible : cible,
                                 adr, intraduisibles, noms[i]),
              Method: a.methode || 'GET',
              Authentication: { ConnectionArn: arnDe((e.params || {}).connexionId) },
            };
            // ── UN JOURNAL, PAS UN CHAMP ──────────────────────────────
            // La ligne s'ajoute à l'existant au lieu de le remplacer. Trois
            // choses à composer, et JSONata les fait toutes en ligne :
            //   — assembler les morceaux non vides ($join sur un tableau filtré,
            //     ce qui reproduit le `if (x) parts.push(x)` du moteur, y
            //     compris pour les morceaux qui ne sont vides QU'AU RUN) ;
            //   — coller devant (ou derrière) la valeur déjà là ;
            //   — recopier les autres champs SAUF les clés techniques ($sift).
            if (a.journal) {
              const j = a.journal;
              const k = appels.findIndex(x => x.role === j.depuis);
              const ancien = '$' + vars[k === -1 ? 0 : k] + '.ResponseBody.metadata_values';
              const morceaux = j.parties.map(function (part) {
                if (part && typeof part === 'object' && part.horodatage) {
                  // L'horodatage du moteur est en heure LOCALE ; `$now()` est en
                  // UTC. Deux heures d'écart l'été à Paris, dans une ligne que
                  // des humains relisent. Pas corrigeable proprement : le décalage
                  // dépend de la date, et JSONata n'a pas de fuseau nommé.
                  // Écart assumé et écrit, plutôt qu'un « +0200 » faux six mois
                  // sur douze.
                  return "$substring($now(), 0, 10) & '_' & $substring($now(), 11, 5)";
                }
                const g = gabaritJsonata(String(part), adr, intraduisibles, noms[i]);
                return g.jsonata ? g.jsonata : ASL.txt(g.valeur);
              });
              // ── LA SIGNATURE, POUR LE MODE « CHANGE » ─────────────────
              // Calculée AVANT d'ajouter la marque d'exécution, et sans
              // l'horodatage : ce sont précisément les deux morceaux qui
              // changent à chaque passage sans rien dire de neuf. Les garder
              // ferait qu'un contrôle nocturne se croirait différent chaque
              // nuit — soit exactement le bavardage que ce mode existe pour
              // arrêter. Même règle que le moteur du Builder.
              const morceauxSignifiants = j.parties
                .map(function (part, iPart) {
                  return (part && typeof part === 'object' && part.horodatage) ? null : morceaux[iPart];
                })
                .filter(function (m) { return m !== null; });

              if (j.marque) morceaux.push("'[' & $states.context.Execution.Name & ']'");
              const assembler = function (liste) {
                return '$join($filter([' + liste.join(', ')
                     + '], function($m) { $exists($m) and $m != \'\' }), '
                     + ASL.txt(j.separateur || ' | ') + ')';
              };
              const ligne = assembler(morceaux);
              // Liaison de variables plutôt que répétition : sans elle, la
              // ligne ET l'existant apparaissent DEUX fois chacun, une par
              // branche du ternaire. L'expression fait alors le double et
              // devient illisible dans la console — or c'est là qu'un collègue
              // ira voir ce que le workflow écrit.
              const existant = ancien + '.' + j.champ + '.field_values[0].value';
              const suite = j.ordre === 'oldest' ? "$a & '\\n' & $l" : "$l & '\\n' & $a";
              const colle = '($l := ' + ligne + '; $a := ' + existant + '; '
                          + "$exists($a) and $a != '' ? " + suite + ' : $l)';
              const conserves = j.saufPrefixe
                ? '$sift(' + ancien + ', function($v, $k) { $not($contains($k, /^'
                  + j.saufPrefixe + '/)) })'
                : ancien;
              args.RequestBody = {
                metadata_values: ASL.jsonata('$merge([' + conserves + ', {'
                  + ASL.txt(j.champ) + ': {\'field_values\': [{\'value\': ' + colle + '}]}}])'),
              };

              // Ce qu'il faut à l'aiguillage de « change », mémorisé ici parce
              // que les morceaux de ligne ne vivent que dans cette portée.
              if (j.siDifferent) {
                // La ligne précédente : la première ou la dernière selon l'ordre
                // d'insertion. `$split` sur une chaîne vide rend [''] — d'où le
                // test d'existence dans la condition plutôt qu'ici.
                const lignes = '$split($a, \'\\n\')';
                const precedente = j.ordre === 'oldest'
                  ? lignes + '[-1]'
                  : lignes + '[0]';
                // On retire de l'ANCIENNE ligne ce qu'on n'a pas mis dans la
                // nouvelle : la marque d'exécution en fin, l'horodatage en tête.
                const nettoyee = "$trim($replace($replace($p, /\\s*\\[[^\\]]*\\]\\s*$/, ''), "
                               + "/^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}:[0-9]{2}\\s*(\\|\\s*)?/, ''))";
                ecritureConditionnelle = {
                  indice: i,
                  condition: '($a := ' + existant + '; '
                           + "$exists($a) and $a != '' ? "
                           + '($p := ' + precedente + '; ' + nettoyee + ' = ' + assembler(morceauxSignifiants) + ')'
                           + ' : false)',
                };
              }
            }
            if (a.corps) {
              let corps = corpsResolu(a.corps, adr, intraduisibles, noms[i]);
              // FUSIONNER AVEC CE QU'ON VIENT DE RELIRE. C'est ce qui empêche
              // une écriture de trois champs d'effacer tous les autres. En
              // JSONPath il aurait fallu un état Pass de plus : States.JsonMerge
              // n'accepte pas d'objet littéral en argument. `$merge` le prend
              // en ligne, et sa fusion est superficielle — exactement ce que
              // fait `{ ...existing }` dans le handler du moteur.
              if (a.fusionne) {
                const j = appels.findIndex(x => x.role === a.fusionne.depuis);
                const cle = a.fusionne.champ;
                if (j !== -1 && corps && Object.prototype.hasOwnProperty.call(corps, cle)) {
                  corps = Object.assign({}, corps, {
                    [cle]: ASL.jsonata('$merge([$' + vars[j] + '.ResponseBody.' + cle
                                     + ', ' + litteralJsonata(corps[cle]) + '])'),
                  });
                }
              }
              args.RequestBody = corps;
            }
            let etatAppel = {
              Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
              Arguments: args,
              Assign: { [vars[i]]: '{% $states.result %}' },
              Next: dernier ? nominal : noms[i + 1],
            };

            // ── UN APPEL PAR ÉLÉMENT : le Map ──────────────────────────
            // Le moteur déroule une boucle for sur une liste découpée depuis
            // une variable. ASL itère nativement — un Map, et l'appel devient
            // son corps. `$states.input` y est l'élément courant.
            if (a.pourChaque) {
              const src = expr(a.pourChaque.source, adr, true);
              // Le moteur accepte les deux formes : un tableau JSON, ou une
              // chaîne à séparateur. `$type` tranche à l'exécution, comme lui.
              const liste = '$type(' + src + ") = 'array' ? " + src
                          + ' : $filter($map($split(' + src + ', '
                          + ASL.txt(a.pourChaque.separateur) + '), function($v) { $trim($v) }),'
                          + " function($v) { $v != '' })";
              // Les codes tolérés : « cette personne existe déjà » n'est pas un
              // échec. Le nom de l'erreur porte le code, donc le Catch est
              // exact — et il mène à la fin du corps, pas à la branche d'erreur.
              const nFinCorps = noms[i] + ' - suivant';
              const tolere = (a.codesToleres || []).map(c => 'States.Http.StatusCode.' + c);
              const corpsEtat = {
                Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
                Arguments: args,
                End: true,
              };
              if (tolere.length) {
                corpsEtat.End = undefined;
                corpsEtat.Next = nFinCorps;
                corpsEtat.Catch = [{
                  ErrorEquals: tolere,
                  Comment: 'Codes tolérés par le workflow — pas un échec.',
                  Next: nFinCorps,
                }];
              }
              const corpsStates = { [noms[i] + ' - appeler']: corpsEtat };
              if (tolere.length) corpsStates[nFinCorps] = { Type: 'Succeed' };
              etatAppel = {
                Type: 'Map',
                Comment: 'Un appel par valeur de « ' + a.pourChaque.source + ' ».',
                Items: ASL.jsonata(liste),
                ItemProcessor: { ProcessorConfig: { Mode: 'INLINE' },
                                 StartAt: noms[i] + ' - appeler', States: corpsStates },
                Assign: { [vars[i]]: '{% $states.result %}' },
                Next: dernier ? nominal : noms[i + 1],
              };
            }
            // `tolereAbsence` : le moteur natif enveloppe cette relecture d'un
            // try/catch nu — une vue jamais initialisée répond 404 et vaut
            // dictionnaire vide. Sans ce Catch, une cible qui lève sur 404
            // arrêterait un workflow que le moteur poursuit.
            if (a.tolereAbsence && !dernier) {
              etatAppel.Catch = [{
                ErrorEquals: ['States.ALL'],
                Assign: { [vars[i]]: '{% { "ResponseBody": {} } %}' },
                Next: noms[i + 1],
              }];
            }
            // Un appel que le catalogue n'a pas su décrire garde sa PLACE dans
            // la chaîne, marqué. Le lecteur voit qu'il se passe quelque chose
            // là, et le compteur le sait.
            if (a.nonDecrit) {
              etatAppel = {
                Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
                Comment: 'GABARIT GÉNÉRIQUE dans la séquence — ' + a.nonDecrit
                       + '. L\'appel réel est ' + (a.methode || 'POST') + ' ' + a.chemin + '.',
                Arguments: { ApiEndpoint: BASE_ICONIK + '/API/', Method: 'GET',
                             Authentication: { ConnectionArn: arnDe((e.params || {}).connexionId) } },
                Assign: { [vars[i]]: '{% $states.result %}' },
                Next: dernier ? nominal : noms[i + 1],
              };
              generiques.push({ etat: noms[i], verbe: (e.verbe || e.core) + ' › ' + a.nonDecrit });
            }

            // Sauter l'appel quand la valeur attendue manque : un Choice
            // devant, qui enjambe l'état. C'est ce que fait `skipIfEmpty`.
            if (a.sauterSi) {
              const nGarde = noms[i] + ' - a envoyer';
              const cible = expr(a.sauterSi, adr, true);
              States[nGarde] = {
                Type: 'Choice',
                Comment: 'Étape ignorée quand « ' + a.sauterSi + ' » est vide.',
                Choices: [{ Condition: ASL.jsonata('$exists(' + cible + ') and ' + cible + " != ''"),
                            Next: noms[i] }],
                Default: dernier ? nominal : noms[i + 1],
              };
              // La garde prend la place de l'appel dans le chaînage.
              if (i === 0) { etat = States[nGarde]; delete States[nGarde]; States[noms[i]] = etatAppel; }
              else {
                const precedent = States[noms[i - 1]];
                if (precedent) precedent.Next = nGarde;
                States[noms[i]] = etatAppel;
              }
              return;
            }

            if (i === 0) etat = etatAppel;
            else States[noms[i]] = etatAppel;
          });

          // ── « CHANGE » : ne pas écrire si rien n'a changé ───────────
          // Même forme que la garde `skipIfEmpty` ci-dessus — un Choice qui
          // enjambe l'écriture —, mais le test porte sur ce qu'on relit : la
          // ligne d'avant dit-elle déjà la même chose ? Si oui, on saute le PUT
          // et on sort par la sortie nominale. Se taire, c'est ne rien envoyer.
          if (ecritureConditionnelle) {
            const iEcr = ecritureConditionnelle.indice;
            // Sans point d'interrogation : AWS refuse un nom d'état hors ASCII
            // simple, et le contrôle local le dit avant elle.
            const nGarde = libelleDe.get(e.id) + ' - deja dit';
            States[nGarde] = {
              Type: 'Choice',
              Comment: 'Mode « change » : l\'écriture est sautée quand la ligne redirait '
                     + 'exactement ce que dit déjà la précédente. L\'horodatage et la marque '
                     + 'd\'exécution sont ignorés dans la comparaison — sinon la date suffirait '
                     + 'à rendre différente une phrase identique.',
              Choices: [{ Condition: ASL.jsonata(ecritureConditionnelle.condition), Next: nominal }],
              Default: noms[iEcr],
            };
            if (iEcr === 0) { etat = States[nGarde]; delete States[nGarde]; }
            else {
              // LE PREMIER APPEL N'EST PAS DANS `States` : il est gardé dans
              // `etat` et enregistré plus loin sous le nom de l'étape. Aller le
              // chercher par `States[noms[0]]` rendait `undefined`, et le
              // rebranchement ne se faisait pas — la garde restait injoignable,
              // sans un mot. C'est le contrôle de connexité qui l'a dit.
              const precedent = (iEcr - 1 === 0) ? etat : States[noms[iEcr - 1]];
              if (!precedent) throw new Error('rebranchement impossible vers ' + nGarde);
              precedent.Next = nGarde;
            }
          }

          if (appels.length > 1) porteur = noms[noms.length - 1];
        } else {
          // LE GABARIT GÉNÉRIQUE — une façade dont personne n'a encore déclaré
          // l'appel. Il ne prétend rien : GET sur la racine de l'API. Le
          // rapport les compte, c'est la mesure de ce qui reste à décrire.
          etat = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke',
                   Comment: 'GABARIT GÉNÉRIQUE — l\'appel de « ' + (e.verbe || e.core)
                          + ' » n\'est pas encore déclaré dans le catalogue.',
                   Arguments: { ApiEndpoint: BASE_ICONIK + '/API/', Method: 'GET',
                                Authentication: { ConnectionArn: arnDe((e.params || {}).connexionId) } },
                   Assign: { [variableDe(e)]: '{% $states.result %}' },
                   Next: nominal };
          generiques.push({ etat: nom, verbe: e.verbe || e.core });
        }
      }
    }

    // Ce que l'étape a rangé, pour les règles de port : l'expression qui relit
    // sa réponse. Quand elle s'étale sur plusieurs états, c'est le DERNIER qui
    // compte — un port de `set_metadata` se juge sur l'écriture, pas sur la
    // relecture qui la précède.
    const dernierEtat = porteur ? States[porteur] : etat;
    if (dernierEtat && dernierEtat.Assign) {
      const posee = Object.keys(dernierEtat.Assign)[0];
      if (posee) sortieDe.set(e.id, '$' + posee);
    }

    // 2. L'erreur : un Catch attaché, jamais un état de plus — c'est ce que la
    //    console a confirmé le 2026-08-12.
    if (erreur) {
      // SUR TOUS LES ÉTATS DE L'ÉTAPE, et sans jamais écraser un Catch déjà
      // posé. Première version : le Catch allait sur le premier état et
      // remplaçait celui de `tolereAbsence` — la relecture de métadonnées
      // partait donc en branche d'erreur sur un 404, alors qu'elle doit le
      // pardonner. Le défaut ne se voyait pas dans le graphe : les deux
      // flèches existent, elles ne mènent simplement pas au même endroit.
      const aCouvrir = [etat].concat(porteur && States[porteur] !== etat ? [States[porteur]] : []);
      aCouvrir.forEach(function (s) {
        if (!s || s.Type !== 'Task' || s.Catch) return;
        // `$states.errorOutput` remplace le ResultPath du Catch, et l'Assign
        // d'un Catch écrit dans la portée EXTÉRIEURE : la branche d'erreur sait
        // ce qui a échoué, y compris depuis le corps d'une boucle.
        // LE NOM DÉPEND DE LA PORTÉE. AWS refuse qu'une portée fille redéclare
        // une variable du parent (DUPLICATE_VARIABLE_NAME) — c'est la
        // contrepartie de l'héritage JSONata adopté le 2026-08-13 : puisque le
        // corps de boucle VOIT les variables du dehors, il ne peut plus se
        // servir des mêmes noms. Trouvé à la première soumission réelle.
        const assign = {};
        assign[varErreur] = '{% $states.errorOutput %}';
        s.Catch = [{ ErrorEquals: ['States.ALL'], Assign: assign, Next: erreur }];
      });
    }

    // 3. Les ports métier restants : un Choice APRÈS l'état. Le pivot les porte
    //    sur le nœud, ASL ne connaît que Next — d'où un état supplémentaire que
    //    la table de coûts ne prévoyait pas.
    const etatPorteur = porteur ? States[porteur] : etat;
    if (autres.length && etatPorteur.Type === 'Task') {
      const sortie = sortieDe.get(e.id) || '$states.input';
      const Choices = [];
      autres.forEach(function (x) {
        const regle = ASL.reglePort(e.verbe, e.core, x.port, sortie, LISTING, e);
        if (!regle) {
          intraduisibles.push({ etat: nom, port: x.port, op: 'port de ' + (e.verbe || e.core) });
          return;
        }
        Choices.push({ Condition: ASL.jsonata(regle), Next: nomDe.get(x.vers) });
      });
      // Aucun port reconnaissable : pas d'aiguillage du tout plutôt qu'un
      // Choice vide — un état qui tombe toujours en Default ment sur ce qu'il
      // fait, et se lit comme un embranchement réel.
      if (Choices.length) {
        // Du LIBELLÉ, pas de l'état d'entrée : sur une étape à plusieurs
        // appels, `nom` porte déjà le rôle du premier, et l'aiguillage
        // s'appelait « … - asset - quel port » alors qu'il juge le dernier.
        const nAiguillage = libelleDe.get(e.id) + ' - quel port';
        etatPorteur.Next = nAiguillage;
        States[nAiguillage] = { Type: 'Choice', Choices: Choices, Default: nominal };
      }
    }

    States[nom] = etat;
  });

  return { States: States, nomDe: nomDe };
}

// ── CONSTRUIRE, PUIS RACONTER ───────────────────────────────────
// Séparés le 2026-08-14 pour que le serveur puisse émettre lui-même — le bouton
// « Soumettre » de l'Interpréteur a besoin de la définition, pas d'un fichier et
// d'une sortie console. `construire()` ne touche NI au disque NI à la sortie
// standard ; `main()` garde tout ce qui écrit et tout ce qui raconte.
//
// Le paramètre s'appelle `ID` à dessein : il masque la constante de même nom
// lue dans argv, et le corps n'a pas eu à changer d'une ligne. Une réécriture
// de 240 lignes pour changer d'appelant aurait été une occasion de tout casser.
async function construire(ID) {
  const port = process.env.APS_PORT || 3000;
  const r = await fetch('http://localhost:' + port
          + '/api/builder-flows/' + ID + '/interpretation?cible=asl');
  const plan = await r.json();
  if (!r.ok) { console.log('❌ interprétation : ' + (plan.error || r.status)); return; }

  // Les connexions, pour savoir À QUI chaque appel s'adresse. Le pivot ne porte
  // qu'un identifiant ; le nom, lui, décide du nom de la connexion EventBridge.
  // Silencieux si l'API ne répond pas : l'émetteur retombe alors sur la
  // connexion Iconik, ce qui était le comportement d'avant.
  try {
    const rc = await fetch('http://localhost:' + port + '/api/connexions');
    const lc = await rc.json();
    (Array.isArray(lc) ? lc : (lc.items || [])).forEach(function (c) {
      CONNEXIONS.set(c.id, { nom: c.name, authType: c.authType, endpoint: c.endpoint });
    });
  } catch (_) { /* on continue sans : voir arnDe */ }

  // Les séquences d'`Endpoint`, désignées par `sequenceId`. Le pivot ne porte
  // que l'identifiant — et un `steps` résiduel qui ne compte QU'UNE étape là où
  // la ressource en a sept. On résout donc ici, avant de bâtir : le catalogue
  // ne fait pas de réseau, l'émetteur lui pose les étapes dans les paramètres.
  // Même contrat que l'argument `resolutions` de pivot-to-wfd.js.
  try {
    const re = await fetch('http://localhost:' + port + '/api/endpoints');
    const le = await re.json();
    (Array.isArray(le) ? le : (le.items || [])).forEach(function (e) {
      if (e && e.id && Array.isArray(e.steps)) SEQUENCES.set(e.id, e.steps);
    });
  } catch (_) { /* sans elles, l'étape retombe sur le gabarit générique */ }

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
    const ctxCorps = { fin: nommer('Fin du corps'), traversantes: traversantes,
                       // Le corps hérite des variables de la racine : il lui
                       // faut donc ses propres noms là où il assigne.
                       varErreur: 'erreurCorps' };
    const bati = etatsDe(p.etapes, nommer, ctxCorps);
    p._intraduisibles = ctxCorps.intraduisibles || [];
    p._generiques     = ctxCorps.generiques || [];
    besoinsDuCorps = Array.from((ctxCorps.besoins || new Map()).values())
      .filter(b => traversantes.indexOf(b.nom) === -1);
    // L'ÉLÉMENT COURANT, que l'ItemSelector fournissait sous `item`. En le
    // supprimant on a emporté ça avec : le pivot écrit `{item.id}` partout dans
    // un corps de boucle, et plus rien ne le posait. Le défaut est LATENT
    // aujourd'hui — les verbes qui lisent `item` retombent encore sur le
    // gabarit générique, qui n'émet aucun paramètre — et il se serait réveillé
    // au premier `appel()` déclaré sur `iconik.fetch`.
    //
    // Un Pass en tête de corps le nomme. Dans une portée de Map, l'entrée est
    // l'élément lui-même, donc `$states.input` suffit.
    const nItem = nommer('Element courant');
    bati.States[nItem] = {
      Type: 'Pass',
      Comment: 'L\'élément de ce tour de boucle, nommé pour que le corps le lise comme '
             + '« item » — le nom que le pivot emploie. Remplace la clé item de '
             + 'l\'ItemSelector.',
      Assign: { item: '{% $states.input %}' },
      Next: bati.nomDe.get(p.etapes[0].id),
    };
    corps = { ProcessorConfig: { Mode: 'INLINE' },
              StartAt: nItem,
              States: bati.States };
  }

  const corpsIntraduisibles = (portees.length && portees[0]._intraduisibles) || [];
  const corpsGeneriques     = (portees.length && portees[0]._generiques) || [];
  const ctx = { fin: nommer('Fin'), corps: corps, traversantes: traversantes,
                besoinsDuCorps: besoinsDuCorps };
  const bati = etatsDe(racine.etapes, nommer, ctx);

  const definition = {
    Comment: 'APS — ' + plan.flux.nom + ' — émis le ' + new Date().toISOString().slice(0, 10)
           + '. SQUELETTE : la forme, pas les paramètres. Les ARN de connexion et de '
           + 'Lambda sont des espaces réservés.',
    // JSONata pour toute la machine, plutôt qu'état par état. Le mélange est
    // permis et sert une migration progressive ; ici il n'aurait servi qu'à
    // faire cohabiter deux façons de lire la même valeur.
    QueryLanguage: 'JSONata',
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
  // Un porteur, c'est une variable qu'un `Assign` pose. RÉÉCRIT POUR JSONATA :
  // on ne cherche plus des ResultPath mais des noms de variables, et la règle
  // de portée s'est INVERSÉE. Avant, un corps de boucle ne disposait que de ce
  // que l'ItemSelector lui projetait — d'où la liste repartie de zéro. En
  // JSONata une portée interne hérite des variables du dehors, donc on passe
  // les porteurs de la racine au corps.
  //
  // Le contrôle garde tout son intérêt malgré le durcissement du langage : lire
  // une variable non assignée lève bien States.QueryEvaluationError, mais AU
  // RUN, et sur PUBLISH le run coûte des appels réels à Iconik. Le dire avant
  // de coller reste moins cher.
  const sansPorteur = [];
  (function verifier(states, depart, porteurs, ou) {
    // ── SENSIBLE À L'ORDRE, depuis le 2026-08-14 ─────────────────
    // La version d'avant demandait « un état QUELQUE PART pose-t-il ce nom ? ».
    // La réponse était oui pour `generated_id`, donc elle se taisait — pendant
    // que l'état lisait le résultat d'un appel situé PLUS LOIN dans le graphe.
    // C'est la console AWS qui l'a dit, avec une question plus forte : « sur
    // TOUS les chemins qui mènent ici, ce nom est-il déjà posé ? ».
    //
    // On calcule donc, pour chaque état, l'ensemble des variables qu'AU MOINS UN
    // chemin y ayant mené a posées : union sur les prédécesseurs, jusqu'au point
    // fixe.
    //
    // UNION ET NON INTERSECTION, et c'est mesuré, pas supposé. L'intersection
    // (« posé à coup sûr ») a d'abord été écrite : elle rendait 34 alertes là où
    // la console AWS, sur la même définition, en rendait deux. Le surplus venait
    // des Catch, qui sautent par-dessus l'état qui pose la variable — un chemin
    // d'échec réel, mais qu'AWS ne compte pas. Un contrôle plus sévère que la
    // cible n'est pas plus sûr : il devient du bruit qu'on apprend à ignorer,
    // et c'est ainsi qu'on rate la vraie alerte.
    //
    // Ce que l'union attrape, et qui est tout ce qu'on cherchait : un nom que
    // personne ne pose, et un nom posé UNIQUEMENT plus loin dans le graphe —
    // le défaut de `generated_id`.
    const assigneDe = {};
    Object.entries(states).forEach(function ([n, s]) {
      const a = new Set(Object.keys(s.Assign || {}));
      // L'Assign d'un Choice appartient à la branche choisie. L'attribuer à
      // toutes les sorties est une approximation OPTIMISTE assumée : elle peut
      // laisser passer un cas, jamais en inventer un.
      (s.Choices || []).forEach(c => Object.keys(c.Assign || {}).forEach(x => a.add(x)));
      assigneDe[n] = a;
    });

    // Les arêtes, avec ce que CHACUNE apporte. Une arête de Catch n'apporte que
    // l'Assign du Catch : quand l'état échoue, son propre Assign n'a pas eu
    // lieu. Confondre les deux ferait croire la branche d'erreur mieux servie
    // qu'elle ne l'est.
    const aretes = [];
    Object.entries(states).forEach(function ([n, s]) {
      const suite = [];
      if (s.Next) suite.push(s.Next);
      if (s.Default) suite.push(s.Default);
      (s.Choices || []).forEach(c => c.Next && suite.push(c.Next));
      suite.forEach(v => aretes.push({ de: n, vers: v, apporte: assigneDe[n] }));
      (s.Catch || []).forEach(function (c) {
        if (c.Next) aretes.push({ de: n, vers: c.Next, apporte: new Set(Object.keys(c.Assign || {})) });
      });
    });

    // Atteignables : le reste est déjà signalé par le contrôle de connexité, et
    // le compter ici doublerait le bruit sur un même défaut.
    const atteints = new Set();
    (function marcher(n) {
      if (!n || atteints.has(n) || !states[n]) return;
      atteints.add(n);
      aretes.filter(a => a.de === n).forEach(a => marcher(a.vers));
    })(depart);

    // Vide au départ, l'union ne fait que croître : le calcul converge, et le
    // nombre de tours est borné par le nombre de noms.
    const avant = {};
    Object.keys(states).forEach(n => { avant[n] = new Set(); });
    avant[depart] = new Set(porteurs);

    for (let tour = 0, bouge = true; bouge && tour < 500; tour++) {
      bouge = false;
      aretes.forEach(function (a) {
        if (!atteints.has(a.de)) return;
        const cible = avant[a.vers];
        if (!cible) return;
        const ajouter = function (x) { if (!cible.has(x)) { cible.add(x); bouge = true; } };
        avant[a.de].forEach(ajouter);
        a.apporte.forEach(ajouter);
      });
    }

    // Toute chaîne `{% … %}` est une expression : on y relève les `$nom`.
    // `$states` est réservé et toujours disponible ; `$` seul est le contexte
    // courant, pas une variable. Les fonctions (`$count(`, `$exists(`) se
    // reconnaissent à leur parenthèse ouvrante et ne sont pas des lectures.
    const lues = [];
    const parcourir = function (v) {
      if (typeof v === 'string') {
        const m = v.match(/^\{%\s*([\s\S]*?)\s*%\}$/);
        if (!m) return;
        // Les paramètres d'une lambda JSONata (`function($v) { … }`) sont
        // déclarés PAR l'expression : ils ne viennent d'aucun Assign, et les
        // compter comme lectures faisait crier le contrôle 21 fois sur le seul
        // `$v` du découpage de liste. Un faux positif use un contrôle aussi
        // sûrement qu'un faux négatif l'aveugle.
        // Deux façons d'être local à l'expression, et les deux comptent :
        // le paramètre d'une lambda `function($v)`, et la liaison `$l := …`.
        const locales = new Set();
        (m[1].match(/function\s*\(([^)]*)\)/g) || []).forEach(function (f) {
          (f.match(/\$[A-Za-z_]\w*/g) || []).forEach(x => locales.add(x.slice(1)));
        });
        (m[1].match(/\$([A-Za-z_]\w*)\s*:=/g) || []).forEach(function (b) {
          locales.add(b.replace(/\s*:=$/, '').slice(1));
        });
        (m[1].match(/\$[A-Za-z_]\w*/g) || []).forEach(function (ref) {
          const nom = ref.slice(1);
          if (nom === 'states' || locales.has(nom)) return;
          if (new RegExp('\\' + ref + '\\s*\\(').test(m[1])) return;   // appel de fonction
          lues.push({ nom: nom, ou: v });
        });
        return;
      }
      if (Array.isArray(v)) return v.forEach(parcourir);
      if (v && typeof v === 'object') {
        Object.entries(v).forEach(function ([k, x]) {
          if (k === 'ItemProcessor') return;          // portée fille, vérifiée à part
          parcourir(x);
        });
      }
    };
    // État par état, et non plus portée par portée : c'est ce qui permet de
    // confronter chaque lecture à ce qui est posé À CET ENDROIT du graphe.
    const jamaisPosees = new Set();
    Object.values(assigneDe).forEach(s => s.forEach(x => jamaisPosees.add(x)));
    aretes.forEach(a => a.apporte.forEach(x => jamaisPosees.add(x)));
    porteurs.forEach(x => jamaisPosees.add(x));

    Object.entries(states).forEach(function ([n, s]) {
      if (!atteints.has(n)) return;
      lues.length = 0;
      parcourir(s);
      lues.forEach(function (l) {
        if (RACINE.test(l.nom) || avant[n].has(l.nom)) return;
        // Deux diagnostics, pas un : « personne ne le pose nulle part » est un
        // trou du modèle ; « posé, mais pas encore ici » est une erreur de
        // chaînage. Les confondre ferait chercher au mauvais endroit.
        sansPorteur.push(jamaisPosees.has(l.nom)
          ? ou + ' : « $' + l.nom + ' » — posé ailleurs, mais par AUCUN chemin menant à « ' + n
            + ' » (lecture avant écriture)'
          : ou + ' : « $' + l.nom + ' » — rien ne pose « ' + l.nom + ' »');
      });
    });

    // La portée fille hérite de ce qui est acquis À L'ENTRÉE du Map, plus ce
    // que le Map lui-même assigne — pas de l'union de toute la portée mère.
    Object.entries(states).forEach(function ([n, s]) {
      if (!s.ItemProcessor || !atteints.has(n)) return;
      const herite = new Set(avant[n]);
      assigneDe[n].forEach(x => herite.add(x));
      verifier(s.ItemProcessor.States, s.ItemProcessor.StartAt, Array.from(herite), 'corps de boucle');
    });
  })(definition.States, definition.StartAt, [], 'racine');

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

  return { plan, definition, ctx, compte, problemes, sansPorteur,
           traversantes, besoinsDuCorps, corpsIntraduisibles, corpsGeneriques };
}

async function main() {
  if (!ID) { console.log('Usage : node scripts/emettre-asl.js <idFlux> [--sortie fichier]'); return; }
  const { plan, definition, ctx, compte, problemes, sansPorteur,
          traversantes, besoinsDuCorps, corpsIntraduisibles, corpsGeneriques } = await construire(ID);

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

  // CE QUE LE CATALOGUE NE DÉCRIT PAS ENCORE. La mesure la plus utile du
  // chantier : chaque ligne est un appel HTTP que la définition n'ose pas
  // écrire, et qu'elle remplace par un GET sur la racine de l'API. Compté
  // plutôt qu'estimé — au 2026-08-13 on partait de 18.
  const gen = (ctx.generiques || []).concat(corpsGeneriques);
  if (gen.length) {
    const parVerbe = {};
    gen.forEach(g => (parVerbe[g.verbe] = (parVerbe[g.verbe] || 0) + 1));
    console.log('\n' + gen.length + ' état(s) sur GABARIT GÉNÉRIQUE — appel non déclaré au catalogue');
    Object.entries(parVerbe).sort((a, b) => b[1] - a[1])
      .forEach(([v, n]) => console.log('   ' + String(n).padStart(2) + ' × ' + v));
  } else {
    console.log('\n✅ aucun gabarit générique : tous les appels sont déclarés.');
  }

  if (connexionsManquantes.size) {
    console.log('\n⚠ ' + connexionsManquantes.size + ' connexion(s) EventBridge à CRÉER — l\'ARN');
    console.log('  émis porte un UUID de zéros, la définition sera acceptée et le run');
    console.log('  échouera à l\'appel. AWS attribue l\'UUID à la création :');
    connexionsManquantes.forEach(function (apsNom, awsNom) {
      console.log('   ' + awsNom.padEnd(30) + apsNom);
    });
  }

  const nonTrad = (ctx.intraduisibles || []).concat(corpsIntraduisibles);
  if (nonTrad.length) {
    console.log('\n⚠ ' + nonTrad.length + ' aiguillage(s) NON traduits — la branche est omise,');
    console.log('  jamais émise au jugé : un Choice qui trie faux est pire qu\'un manque.');
    nonTrad.forEach(x => console.log('   ' + x.etat + ' · port « ' + x.port + ' » · ' + x.op));
  }
  if (besoinsDuCorps.length || traversantes.length) {
    console.log('\nCE QUE LE CORPS DE BOUCLE EMPRUNTE — assigné juste avant le Map');
    traversantes.forEach(v => console.log('   ' + v.padEnd(20) + 'déclaré traversant par le plan'));
    besoinsDuCorps.forEach(b => console.log('   ' + b.nom.padEnd(20)
      + 'constaté à l\'émission' + (b.objet ? ' — lu de « ' + b.objet + ' »' : '')));
  }
  if (sansPorteur.length) {
    console.log('\n⚠ ' + sansPorteur.length + ' référence(s) SANS PORTEUR — la console dira oui,');
    console.log('  et le run lèvera States.QueryEvaluationError. Le langage ne ment plus,');
    console.log('  mais il ne le dit qu\'au run, et un run de PUBLISH appelle Iconik :');
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

// Requis comme bibliothèque, ce fichier ne doit RIEN faire — sinon le serveur
// émettrait une définition au démarrage, à chaque démarrage.
if (require.main === module) {
  main().catch(e => { console.error('ERREUR — ' + (e && e.stack || e)); process.exit(1); });
}

module.exports = { construire };
