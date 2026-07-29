/**
 * package-executor.js — Exécuteur de package (moteur natif du Builder)
 *
 * Fait le pont entre le PACKAGER (déclaratif, produit un plan + un verdict de
 * cardinalité) et le SERVICE S3 (I/O réelles). C'est la première brique
 * d'orchestration du moteur natif : elle EXÉCUTE ce que le Packager a planifié.
 *
 * Chaîne : manifeste + fichiers réels  →  Packager (assemble + vérifie)  →
 *          si cardinalité OK, dépôt S3 de chaque essence  →  sorties (URLs).
 *
 * Garde-fou : si le Packager signale une violation de cardinalité, on N'EXÉCUTE
 * PAS le dépôt (on ne livre pas un package incomplet). Le verdict est renvoyé
 * tel quel, lisible.
 *
 * Indépendant du moteur WFD. Le Packager (module client) est réutilisé tel quel
 * côté serveur (JS pur, requirable). Le service S3 fait le dépôt réel.
 */

'use strict';

const PivotPackager = require('../public/builders/workflow/pivot-packager');
const s3 = require('./s3-service');

/**
 * Exécute un package : assemble selon le manifeste, vérifie la cardinalité, et
 * dépose chaque essence sur S3 si tout est conforme.
 *
 * @param {object} manifeste  { name, essences: [...] }
 * @param {Array}  fichiers   [{ nom, corps|url, contentType? }] essences réelles
 * @param {object} connexionS3  connexion S3 (Prisma) où déposer
 * @param {string} [prefixe]  préfixe de destination dans le bucket (dossier)
 * @returns {Promise<{ ok, sorties, violations, deposes }>}
 */
async function executer(manifeste, fichiers, connexionS3, prefixe) {
  // 1. Assemblage + vérification de cardinalité (le Packager, déclaratif).
  const plan = PivotPackager.assembler(manifeste, fichiers);

  // 2. Garde-fou : package incomplet -> on ne dépose rien.
  if (!plan.ok) {
    return { ok: false, sorties: {}, violations: plan.violations, deposes: [] };
  }

  // 3. Dépôt réel de chaque essence trouvée, essence par essence.
  const deposes = [];
  const sorties = {};
  const base = (prefixe || '').replace(/^\/+|\/+$/g, '');

  for (const essence of (manifeste.essences || [])) {
    const trouves = plan.package[essence.role] || [];
    const urls = [];
    for (const f of trouves) {
      // Le corps peut être fourni directement (Buffer/string) ; sinon, si seule
      // une url source est donnée, on considère le fichier déjà déposé ailleurs
      // (cas de transfert géré en amont). Ici on dépose ce qui a un corps.
      if (f.corps != null) {
        const cle = base ? base + '/' + f.nom : f.nom;
        const r = await s3.deposer(connexionS3, cle, f.corps, f.contentType);
        deposes.push({ role: essence.role, nom: f.nom, url: r.url });
        urls.push(r.url);
      } else if (f.url) {
        urls.push(f.url);   // déjà disponible, on range l'URL telle quelle
      }
    }
    if (essence.sortie) {
      sorties[essence.sortie] = urls.length <= 1 ? (urls[0] || null) : urls;
    }
  }

  return { ok: true, sorties: sorties, violations: [], deposes: deposes };
}

module.exports = { executer };
