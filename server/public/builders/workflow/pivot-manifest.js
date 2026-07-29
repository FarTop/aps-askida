/**
 * pivot-manifest.js — Structure du manifeste de livraison (nouveau paradigme)
 *
 * Le manifeste décrit CE QUI EST LIVRÉ, pas à qui. C'est un objet nommé et
 * réutilisable (« Livraison Amazon Prime — Épisode »), rangé comme les modèles
 * d'arborescence : une ressource d'organisation, référencée par un workflow via
 * `uses: { manifest: "nom" }`.
 *
 * Il rassemble en UN objet quatre rôles aujourd'hui éparpillés sur plusieurs
 * nœuds (analyse du 29/07 sur PUBLISH V2, où 6 nœuds S3 identiques déposent les
 * mêmes essences) :
 *   - OÙ TROUVER    → source (critère de sélection des essences)
 *   - QUOI DÉPOSER  → essences attendues (rôle + reconnaissance)
 *   - CE QUI EST OBLIGATOIRE → cardinalité (le garde-fou)
 *   - OÙ VA L'URL   → cible (clé de sortie une fois déposée)
 *
 * Le Packager consomme ce manifeste pour assembler le package. Le manifeste ne
 * dit rien du transport (S3, VodFactory…) : ça, c'est le workflow.
 *
 * Portabilité : la structure est déclarative (pas de service opaque), donc
 * traduisible ailleurs (Node-RED, n8n, Make) — priorité APS, portabilité en
 * bonus.
 */

const PivotManifest = (() => {

  // Cardinalité d'une essence — le garde-fou du Packager. Même concept que la
  // garde de cardinalité d'une purge : « exactement un / au moins un / au plus N ».
  const CARDINALITES = ['exactement_un', 'au_moins_un', 'optionnel', 'au_plus_n'];

  // Rôles d'essence observés dans le réel (PUBLISH V2). Extensible : le manifeste
  // ne se limite pas aux artworks — il couvre aussi audio éclatés, sous-titres
  // multiples, etc. Le rôle est libre ; ceux-ci sont les rôles connus.
  const ROLES_CONNUS = ['video', 'image', 'subtitle', 'audio', 'poster', 'artwork'];

  // ── Structure d'un manifeste ─────────────────────────────────────────────
  // {
  //   name: "Livraison Amazon Prime — Épisode",
  //   niveau: "episode",              // serie | saison | episode | unitaire | *
  //   essences: [
  //     { role: "video",    reconnu_par: [".mp4",".mov",".ts"], cardinalite: "exactement_un", sortie: "s3_video_url" },
  //     { role: "image",    reconnu_par: ["_poster",".jpg",".png"], cardinalite: "au_moins_un", sortie: "s3_image_url" },
  //     { role: "subtitle", reconnu_par: [".srt",".vtt"], cardinalite: "optionnel", sortie: "s3_srt_url" }
  //   ]
  // }

  // Valide un objet manifeste. Renvoie { ok, erreurs: [] }.
  function valider(manifeste) {
    const erreurs = [];
    const err = function (msg) { erreurs.push(msg); };

    if (!manifeste || typeof manifeste !== 'object') {
      return { ok: false, erreurs: ['manifeste absent ou invalide'] };
    }
    if (!manifeste.name || typeof manifeste.name !== 'string') {
      err('name requis (nom du manifeste)');
    }
    if (manifeste.niveau && ['serie', 'saison', 'episode', 'unitaire', '*'].indexOf(manifeste.niveau) === -1) {
      err('niveau inconnu : ' + manifeste.niveau + ' (attendu serie|saison|episode|unitaire|*)');
    }
    if (!Array.isArray(manifeste.essences) || !manifeste.essences.length) {
      err('essences requis (au moins une essence attendue)');
      return { ok: erreurs.length === 0, erreurs: erreurs };
    }

    manifeste.essences.forEach(function (e, i) {
      const p = 'essences[' + i + ']';
      if (!e.role) err(p + '.role requis');
      if (!Array.isArray(e.reconnu_par) || !e.reconnu_par.length) {
        err(p + '.reconnu_par requis (comment reconnaître l\'essence : extensions, suffixes…)');
      }
      if (!e.cardinalite) {
        err(p + '.cardinalite requise');
      } else if (CARDINALITES.indexOf(e.cardinalite) === -1) {
        err(p + '.cardinalite inconnue : ' + e.cardinalite + ' (attendu ' + CARDINALITES.join('|') + ')');
      }
      if (e.cardinalite === 'au_plus_n' && (typeof e.n !== 'number' || e.n < 1)) {
        err(p + '.n requis (>0) quand cardinalite = au_plus_n');
      }
      if (!e.sortie) err(p + '.sortie requise (clé où l\'URL déposée sera rangée)');
    });

    return { ok: erreurs.length === 0, erreurs: erreurs };
  }

  // Résume un manifeste en une phrase lisible (narratif, critère : un objet qui
  // ne sait pas se résumer cache quelque chose).
  function resumer(manifeste) {
    if (!manifeste || !Array.isArray(manifeste.essences)) return '(manifeste vide)';
    const parts = manifeste.essences.map(function (e) {
      const card = {
        exactement_un: 'exactement 1',
        au_moins_un: 'au moins 1',
        optionnel: 'optionnel',
        au_plus_n: 'au plus ' + (e.n || '?')
      }[e.cardinalite] || e.cardinalite;
      return e.role + ' (' + card + ')';
    });
    const niveau = manifeste.niveau && manifeste.niveau !== '*' ? ' au niveau ' + manifeste.niveau : '';
    return 'Livraison' + niveau + ' : ' + parts.join(', ') + '.';
  }

  return { CARDINALITES, ROLES_CONNUS, valider, resumer };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = PivotManifest;
