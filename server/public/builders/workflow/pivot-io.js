/**
 * pivot-io.js — Lecteur et écrivain du format pivot
 *
 * `lire()` accepte un texte ou un objet et rend un document utilisable, avec
 * le rapport de validation. `ecrire()` sérialise dans un ordre de clés stable :
 * deux enregistrements du même workflow produisent le même texte, donc des
 * différences lisibles d'une version à l'autre.
 *
 * La forme canonique est ce qu'on stocke et versionne. La forme d'échange est
 * une projection résolue, datée, qui se lit sans le catalogue — c'est elle
 * qu'on livre à un tiers. `projeter()` en pose la charpente ; la résolution des
 * ports et des ressources attend le paquet Iconik, qui les déclare.
 */

const PivotIO = (() => {

  const estNode = (typeof module !== 'undefined' && typeof require !== 'undefined');
  const S = estNode ? require('./pivot-schema.js')   : window.PivotSchema;
  const V = estNode ? require('./pivot-validate.js') : window.PivotValidate;

  const VERSION_FORMAT = '1.0';

  // ── Ordonnancement ────────────────────────────────────────────────────────
  // Les clés connues d'abord, dans l'ordre déclaré ; les autres ensuite, triées.
  // Une clé inattendue n'est donc jamais perdue à l'écriture — elle se voit.

  function _ordonner(objet, ordre) {
    if (!objet || typeof objet !== 'object' || Array.isArray(objet)) return objet;
    const sortie = {};
    ordre.forEach(function (cle) {
      if (objet[cle] !== undefined) sortie[cle] = objet[cle];
    });
    Object.keys(objet).sort().forEach(function (cle) {
      if (sortie[cle] === undefined && objet[cle] !== undefined) sortie[cle] = objet[cle];
    });
    return sortie;
  }

  function _ordonnerArete(arete) {
    return _ordonner(arete, S.ORDRE_ARETE);
  }

  function _ordonnerEtape(etape) {
    const e = _ordonner(etape, S.ORDRE_ETAPE);
    if (e.body) {
      e.body = {
        steps: (e.body.steps || []).map(_ordonnerEtape),
        edges: (e.body.edges || []).map(_ordonnerArete)
      };
    }
    return e;
  }

  function _ordonnerDocument(doc) {
    const d = _ordonner(doc, S.ORDRE_RACINE);
    if (d.workflow) d.workflow = _ordonner(d.workflow, S.ORDRE_WORKFLOW);
    if (Array.isArray(d.steps)) d.steps = d.steps.map(_ordonnerEtape);
    if (Array.isArray(d.edges)) d.edges = d.edges.map(_ordonnerArete);
    return d;
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  function lire(entree) {
    let doc;

    if (typeof entree === 'string') {
      try {
        doc = JSON.parse(entree);
      } catch (e) {
        return {
          document: null,
          rapport: { ok: false, erreurs: [{ chemin: '', message: 'texte illisible — ' + e.message }], avertissements: [] }
        };
      }
    } else {
      // Copie : la lecture ne modifie jamais ce qu'on lui donne.
      doc = entree ? JSON.parse(JSON.stringify(entree)) : entree;
    }

    const rapport = V.valider(doc);
    return { document: doc, rapport: rapport };
  }

  // ── Écriture ──────────────────────────────────────────────────────────────
  // Refuse d'écrire un document invalide plutôt que de produire un fichier que
  // personne ne saura relire. Les avertissements, eux, ne bloquent pas.

  function ecrire(doc, options) {
    const opt = options || {};
    const rapport = V.valider(doc);

    if (!rapport.ok && !opt.forcer) {
      const e = new Error('document pivot invalide : ' + rapport.erreurs.length + ' erreur(s)');
      e.rapport = rapport;
      throw e;
    }

    const ordonne = _ordonnerDocument(doc);
    return {
      texte: JSON.stringify(ordonne, null, 2) + '\n',
      document: ordonne,
      rapport: rapport
    };
  }

  // ── Document neuf ─────────────────────────────────────────────────────────

  function creer(entete) {
    const e = entete || {};
    return {
      pivot: VERSION_FORMAT,
      form: 'canonical',
      workflow: {
        id: e.id || '',
        name: e.name || '',
        intent: e.intent || '',
        platform: e.platform || '',
        environment: e.environment || '',
        version: 1,
        status: 'draft'
      },
      steps: [],
      edges: [],
      presentation: { versioned: false, layout: {} }
    };
  }

  // ── Projection vers la forme d'échange ────────────────────────────────────
  // Livrer le catalogue avec le format serait fragile : il évolue, et périmerait
  // les fichiers déjà remis. Une projection résolue est stable et datée.
  //
  // Incomplète tant que le paquet Iconik n'est pas écrit : les ports se déduisent
  // de la déclaration du core, les ressources doivent être dépliées. La charpente
  // est ici pour que l'appelant ne construise pas la sienne en attendant.

  function projeter(doc, resolveur) {
    const lu = lire(doc);
    if (!lu.rapport.ok) {
      const e = new Error('document pivot invalide : projection impossible');
      e.rapport = lu.rapport;
      throw e;
    }

    const sortie = _ordonnerDocument(lu.document);
    sortie.form = 'exchange';
    sortie.projectedAt = new Date().toISOString();

    if (!resolveur) {
      sortie.resolved = false;
      return sortie;
    }

    // Le résolveur porte deux savoirs que le pivot ne stocke pas : les ports
    // déclarés par chaque core, et le contenu des ressources désignées.
    // Contrainte relevée sur le moteur : deux cibles partageant un même couple
    // attribut/valeur (`persons[job=director]`) doivent fusionner dans une seule
    // entrée, pas s'empiler — la fusion appartient au résolveur, pas à WFD.
    sortie.resolved = true;
    if (typeof resolveur.ports === 'function') {
      const marquer = function (etapes) {
        (etapes || []).forEach(function (etape) {
          etape.ports = resolveur.ports(etape);
          if (etape.body) marquer(etape.body.steps);
        });
      };
      marquer(sortie.steps);
    }
    if (typeof resolveur.ressources === 'function') {
      sortie.resources = resolveur.ressources(sortie);
    }
    return sortie;
  }

  return {
    VERSION_FORMAT,
    lire, read: lire,
    ecrire, write: ecrire,
    creer, create: creer,
    projeter, project: projeter
  };

})();

if (typeof module !== 'undefined') module.exports = PivotIO;
if (typeof window !== 'undefined') window.PivotIO = PivotIO;
