// APS — lambda/aps-essences/index.js — créé le 2026-08-12
// ================================================================
// LA PREMIÈRE DES TROIS FONCTIONS QU'ASL RÉCLAME.
//
// AWS Step Functions sait lister un bucket (`aws-sdk:s3:listObjectsV2`, natif)
// mais pas RECONNAÎTRE ce qu'il contient : associer « friday_s01_season.png »
// à l'essence `season_box` d'un manifeste demande de comparer des motifs de
// nom, d'écarter les doublons d'upload, de filtrer par niveau. Aucune
// intrinsèque ASL ne fait cela — mesuré le 2026-08-12, les sept `s3_*_url`
// sont les seules références de PUBLISH qu'aucun JSONPath ne rend.
//
// ── CE QUE CETTE FONCTION N'EST PAS ─────────────────────────────
// Elle ne réimplémente RIEN. Elle appelle `builder-essences.js`, le module que
// le moteur natif utilise déjà. C'est tout l'intérêt : ces variables composent
// les URL que le partenaire lira et qu'APS ira ensuite vérifier. Deux
// implémentations qui divergent d'un cheveu livreraient à une adresse ce
// qu'elles contrôleraient à une autre — et le défaut serait invisible jusqu'au
// jour où un doublon d'upload traîne dans le bucket.
//
// ── L'ÉTAT ASL QUI L'APPELLE ────────────────────────────────────
//   {
//     "Type": "Task",
//     "Resource": "arn:aws:states:::lambda:invoke",
//     "Parameters": {
//       "FunctionName": "aps-essences",
//       "Payload": {
//         "essences.$":       "$.manifeste.essences",
//         "listing.$":        "$.s3",
//         "base":             "s3://mon-bucket/",
//         "typeCollection.$": "$.<search>.ResponseBody.objects[0].metadata.TypeCollection"
//       }
//     },
//     "ResultSelector": { "variables.$": "$.Payload.variables" },
//     "ResultPath": "$.essences"
//   }
//
// ── PAQUETAGE ───────────────────────────────────────────────────
// `builder-essences.js` n'a AUCUNE dépendance — ni npm, ni contexte, ni base.
// Le paquet de déploiement se réduit donc à ce fichier et à lui :
//
//   mkdir -p paquet && cp lambda/aps-essences/index.js paquet/
//   cp server/engine-builder/builder-essences.js paquet/
//   (ajuster le require en './builder-essences.js') && cd paquet && zip -r ../aps-essences.zip .
//
// Le require pointe ici vers le dépôt, pour que la preuve hors ligne exerce le
// MÊME fichier que le moteur — une copie figée dans ce dossier divergerait au
// premier correctif.
// ================================================================
'use strict';

const { reconnaitre } = require('../../server/engine-builder/builder-essences.js');

exports.handler = async function (event) {
  const e = event || {};

  // Le listing arrive tel que `listObjectsV2` le rend : `{Contents:[{Key}],
  // KeyCount}`. On accepte aussi une liste de clés déjà extraites — un état
  // Pass peut l'avoir fait en amont, et refuser cette forme obligerait à
  // ajouter un état pour rien.
  const keys = Array.isArray(e.keys) ? e.keys
             : ((e.listing && e.listing.Contents) || []).map(o => o && o.Key).filter(Boolean);

  const r = reconnaitre(e.essences || [], keys, e.base || '', e.typeCollection || '');

  // `cardinaliteRespectee` en clair : ASL sait tester un booléen dans un
  // Choice, il ne sait pas mesurer la longueur d'un tableau. Rendre le verdict
  // déjà tranché évite un état de plus, et évite surtout qu'il soit tranché
  // deux fois — une fois ici, une fois dans une condition écrite à la main.
  return {
    variables: r.variables,
    horsNiveau: r.horsNiveau,
    cardinalite: r.cardinalite,
    cardinaliteRespectee: r.cardinalite.length === 0,
    trouvees: Object.keys(r.variables).length,
  };
};
