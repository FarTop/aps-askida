/**
 * package-executor.js — Exécuteur de package (moteur natif du Builder)
 *
 * PILOTAGE API PUR. APS ne manipule aucun octet : il ne télécharge, n'uploade,
 * ne transcode jamais. Ces opérations, quand une plateforme cible les requiert,
 * sont déclarées et exécutées PAR la plateforme (export location Iconik, ISG,
 * VM FFMPEG…), configurées en amont. APS se borne à des appels.
 *
 * Pour Iconik/VodFactory, le flux est 100% API :
 *   1. l'export location Iconik (orchestrée en amont par le workflow) fait
 *      qu'Iconik pousse lui-même les essences vers le storage S3 ;
 *   2. l'exécuteur VÉRIFIE par LISTING S3 ce qui est réellement arrivé ;
 *   3. il applique la cardinalité du manifeste sur ce résultat réel, et range
 *      les URLs de sortie.
 *
 * Le garde-fou de cardinalité porte donc sur l'état réel constaté (ce qui est
 * présent), pas sur une intention. Le Packager (déclaratif) reste réutilisé
 * pour la logique de reconnaissance + cardinalité.
 */

'use strict';

const PivotPackager = require('../public/builders/workflow/pivot-packager');
const s3 = require('./s3-service');

/**
 * Vérifie un package par listing S3 (pilotage API — aucune manipulation média).
 * Les essences sont supposées déjà poussées sur S3 par la plateforme (export
 * location Iconik) ; l'exécuteur constate et valide.
 *
 * @param {object} manifeste    { name, essences: [...] }
 * @param {object} connexionS3  connexion S3 (Prisma) à interroger
 * @param {string} [prefixe]    préfixe (dossier) où lister
 * @returns {Promise<{ ok, sorties, violations, constate }>}
 */
async function verifierParListing(manifeste, connexionS3, prefixe) {
  // 1. Lister ce qui est réellement présent sur S3 sous le préfixe.
  const listing = await s3.lister(connexionS3, prefixe || '');
  const objets = (listing.objets || []).map(function (o) {
    // Le Packager reconnaît les rôles via le nom : on expose la clé S3 comme nom
    // et l'URL publique reconstituée comme sortie.
    return { nom: o.cle, url: _urlDe(connexionS3, o.cle) };
  });

  // 2. Assembler + vérifier la cardinalité sur le réel constaté (Packager).
  const plan = PivotPackager.assembler(manifeste, objets);

  return {
    ok: plan.ok,
    sorties: plan.sorties,
    violations: plan.violations,
    constate: objets.length
  };
}

// Reconstitue une URL lisible pour une clé S3 (pilotage : on référence, on ne
// télécharge pas). Best-effort ; l'URL réelle exacte dépend de la config bucket.
function _urlDe(conn, cle) {
  return 's3://' + cle;
}

module.exports = { verifierParListing };
