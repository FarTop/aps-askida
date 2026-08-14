// APS — aps-essences — fonction générée.
// ================================================================
// Liste le dépôt S3 et reconnaît quel fichier est quelle essence du manifeste.
// ASL sait LISTER un bucket — c'est une intégration native — mais pas
// RECONNAÎTRE ce qu'il contient : associer « friday_s01_season.png » à
// l'essence `season_box` demande de comparer des motifs, d'écarter les doublons
// d'upload et de filtrer par niveau. Aucune intrinsèque ne fait ça.
//
// ── CETTE FONCTION NE CONTIENT PAS LA LOGIQUE ───────────────────
// Elle l'APPELLE. `builder-essences.js` est embarqué tel quel à côté d'elle,
// copié depuis le dépôt au moment de l'émission — jamais recopié à la main,
// jamais adapté. Son propre en-tête annonce d'ailleurs qu'il doit servir « deux
// moteurs : celui d'APS, et une Lambda AWS ».
//
// Ce n'est pas une commodité, c'est une contrainte de correction, et elle est
// écrite dans le module lui-même : ces variables composent les URL livrées au
// partenaire, qu'APS ira ensuite VÉRIFIER. Deux implémentations qui divergent
// d'un cheveu — un tri différent quand deux fichiers correspondent, un
// « -2.jpg » préféré à l'original — livreraient un fichier à une adresse et en
// contrôleraient une autre. Le défaut serait invisible des deux côtés.
//
// ── CE QUE LA FONCTION FAIT, ELLE ───────────────────────────────
// Le listing, et rien d'autre : pagination S3, puis passage du résultat au
// module. Elle ne décide de rien.
//
// ── ENTRÉE ──────────────────────────────────────────────────────
//   { bucket, prefixe, essences: [...], typeCollection, region? }
//
// ── SORTIE ──────────────────────────────────────────────────────
//   { nbObjets, variables: {...}, horsNiveau: [...], cardinalite: [...] }
//   `nbObjets` sert au port `miss` de la machine d'états — voir PORTS.deliver
//   dans scripts/rendre-asl.js, variante `lambda`.
// ================================================================
'use strict';

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { reconnaitre } = require('./builder-essences.js');

exports.handler = async function (evenement) {
  const e = evenement || {};
  const bucket = e.bucket;
  if (!bucket) throw new Error('aps-essences : bucket manquant');

  const prefixe = String(e.prefixe || '').replace(/^\/+/, '');
  const client  = new S3Client({ region: e.region || process.env.AWS_REGION });

  // TOUTES les pages. Un listing tronqué ferait manquer une essence et
  // rendrait un « manquant » qui n'en est pas — le genre de faux négatif qui
  // envoie chercher un fichier présent.
  const cles = [];
  let jeton;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefixe, ContinuationToken: jeton,
    }));
    (res.Contents || []).forEach(function (o) { if (o && o.Key) cles.push(o.Key); });
    jeton = res.IsTruncated ? res.NextContinuationToken : null;
  } while (jeton);

  // La base des URL rendues. Forme longue (`s3.<region>.amazonaws.com/<bucket>`)
  // pour rester lisible dans un journal et ne dépendre d'aucun réglage de
  // style d'accès au bucket.
  const region = e.region || process.env.AWS_REGION || 'eu-west-3';
  const base = 'https://s3.' + region + '.amazonaws.com/' + bucket + '/';

  const vu = reconnaitre(e.essences || [], cles, base, e.typeCollection);

  return {
    nbObjets: cles.length,
    variables: vu.variables,
    horsNiveau: vu.horsNiveau,
    cardinalite: vu.cardinalite,
  };
};
