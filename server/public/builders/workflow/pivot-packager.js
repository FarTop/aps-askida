/**
 * pivot-packager.js — Le Packager (nouveau paradigme)
 *
 * Mécanisme métier qui consomme un MANIFESTE pour assembler un PACKAGE
 * cohérent à partir d'essences dispersées. Il ne connaît ni S3 ni VodFactory :
 * il raisonne en essences (vidéo, image, sous-titre, audio éclaté, subs
 * multiples…) et en cardinalité. Le transport (où déposer, à qui publier) reste
 * au workflow.
 *
 * Frontière (décidée le 24/07, confirmée le 29/07) :
 *   - le MANIFESTE décrit ce qui est livré (essences + cardinalité + sortie) ;
 *   - le PACKAGER assemble le package et VÉRIFIE la cardinalité (garde-fou) ;
 *   - le WORKFLOW publie le package à un destinataire (S3, VodFactory…).
 *
 * Ce module produit un PLAN d'assemblage et un VERDICT de cardinalité à partir
 * du manifeste et des essences réellement trouvées. Il ne fait pas d'I/O :
 * l'exécution (dépôt effectif) est branchée par le workflow. Cela le rend
 * testable et portable (Node-RED/n8n/Make consommeraient le même plan).
 */

const PivotPackager = (() => {

  // Une essence "trouvée" est un fichier candidat : { nom, url? }. Le packager
  // décide, pour chaque rôle du manifeste, quels fichiers correspondent (via
  // reconnu_par) et si la cardinalité est respectée.

  // Un fichier correspond-il à un critère de reconnaissance ? reconnu_par est
  // une liste de fragments (extensions ".mp4", suffixes "_poster"…). Match si le
  // nom contient l'un d'eux (insensible à la casse).
  function _correspond(nomFichier, reconnu_par) {
    const n = String(nomFichier || '').toLowerCase();
    return (reconnu_par || []).some(function (frag) {
      return n.indexOf(String(frag).toLowerCase()) !== -1;
    });
  }

  // Vérifie la cardinalité d'un ensemble d'essences trouvées pour un rôle.
  // Renvoie { ok, message }.
  function _verifierCardinalite(essence, nbTrouve) {
    switch (essence.cardinalite) {
      case 'exactement_un':
        return nbTrouve === 1
          ? { ok: true }
          : { ok: false, message: essence.role + ' : exactement 1 attendu, ' + nbTrouve + ' trouvé(s)' };
      case 'au_moins_un':
        return nbTrouve >= 1
          ? { ok: true }
          : { ok: false, message: essence.role + ' : au moins 1 attendu, aucun trouvé' };
      case 'optionnel':
        return { ok: true };
      case 'au_plus_n':
        return nbTrouve <= (essence.n || 0)
          ? { ok: true }
          : { ok: false, message: essence.role + ' : au plus ' + essence.n + ' attendu(s), ' + nbTrouve + ' trouvé(s)' };
      default:
        return { ok: false, message: essence.role + ' : cardinalité inconnue' };
    }
  }

  /**
   * Assemble un package à partir d'un manifeste et des fichiers candidats.
   * @param {object} manifeste  { name, essences: [{role, reconnu_par, cardinalite, sortie, n?}] }
   * @param {Array}  fichiers   liste de { nom, url? } réellement disponibles
   * @returns {{ ok, package: {role: [fichiers]}, sorties: {cle: url|urls}, violations: [] }}
   */
  function assembler(manifeste, fichiers) {
    const paquet = {};       // role -> [fichiers correspondants]
    const sorties = {};      // sortie -> url (ou liste d'urls)
    const violations = [];   // cardinalités non respectées

    const items = Array.isArray(fichiers) ? fichiers : [];

    (manifeste.essences || []).forEach(function (e) {
      const trouves = items.filter(function (f) { return _correspond(f.nom, e.reconnu_par); });
      paquet[e.role] = trouves;

      const verdict = _verifierCardinalite(e, trouves.length);
      if (!verdict.ok) violations.push(verdict.message);

      // Range la (ou les) URL(s) dans la clé de sortie déclarée par le manifeste.
      if (e.sortie) {
        const urls = trouves.map(function (f) { return f.url || f.nom; });
        sorties[e.sortie] = urls.length <= 1 ? (urls[0] || null) : urls;
      }
    });

    return {
      ok: violations.length === 0,
      package: paquet,
      sorties: sorties,
      violations: violations
    };
  }

  /**
   * Résumé lisible du verdict d'assemblage (narratif).
   */
  function resumer(resultat) {
    if (!resultat) return '(aucun assemblage)';
    if (resultat.ok) {
      const roles = Object.keys(resultat.package || {}).map(function (r) {
        return r + ' ×' + (resultat.package[r] || []).length;
      });
      return 'Package complet : ' + roles.join(', ') + '.';
    }
    return 'Package incomplet — ' + resultat.violations.join(' ; ') + '.';
  }

  return { assembler, resumer };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = PivotPackager;
