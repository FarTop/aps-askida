// APS — server/routes/interpretation.js — créé le 2026-08-11
// ================================================================
// « Que deviendrait CE workflow chez CETTE cible ? »
//
//   GET /api/builder-flows/:id/interpretation?cible=make
//
// Ne produit RIEN chez la cible : c'est un plan, au sens de `terraform plan`.
// Lire et approuver d'abord, soumettre ensuite — deux gestes, pas un.
//
// La correspondance n'est pas réécrite ici : elle vient de `rendre-make.js`,
// qui est le seul endroit où elle est décidée. Une deuxième table aurait
// divergé de la première au premier changement.
// ================================================================
'use strict';
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
// Chemin relatif au fichier, pas au dossier de lancement : le serveur ne
// démarre pas toujours depuis la racine du dépôt.
const RENDU = require('../../scripts/rendre-make.js');

const router = express.Router();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Les cibles. Déclarées même quand elles ne sont pas prêtes : une liste qui
// cache ce qui manque laisse croire que Make est la seule option envisagée.
const CIBLES = {
  make: { nom: 'Make', pret: true,
          decoupe: 'Make n\'a pas de sous-fonctions : un corps de boucle ne peut pas être appelé sur place, il devient un scénario à part déclenché par webhook.' },
  asl:  { nom: 'AWS Step Functions', pret: false,
          decoupe: 'ASL n\'a aucun espace de noms global : un workflow qui lit des variables d\'ambiance ne compile pas.' },
  n8n:  { nom: 'n8n', pret: false, decoupe: null },
};

// Parcours du document pivot. On garde l'ORDRE et la PROFONDEUR : c'est la
// profondeur qui décide du découpage en scénarios.
function etapesDe(doc) {
  const out = [];
  (function visiter(liste, parent) {
    (Array.isArray(liste) ? liste : []).forEach(function (e) {
      if (!e || typeof e !== 'object' || typeof e.core !== 'string') return;
      // Les post-its ne sont pas des étapes : ni comptés comme nœuds, ni
      // versionnés, ni traduits. Les inclure gonflait le compte de 23 à 44.
      if (e.core === 'postit') return;
      out.push({ id: e.id, core: e.core, facade: e.facade || null,
                 label: e.label || e.facade || e.core, parent: parent || null });
      // Le corps d'une boucle est un SOUS-DOCUMENT `{steps, edges}`, pas une
      // liste — d'où la boucle jamais détectée tant qu'on cherchait un tableau.
      const corps = e.body && (Array.isArray(e.body) ? e.body : e.body.steps);
      if (Array.isArray(corps)) visiter(corps, e.id);
    });
  })(doc && doc.steps, null);
  return out;
}

// Les écarts d'un verbe, lus dans `NodeDefinition` — jamais dans le code du
// moteur. C'est la raison d'être de ce modèle.
function ecartsDuVerbe(nd) {
  const out = [];
  if (!nd) return [{ gravite: 'bloquant', quoi: '(verbe inconnu)',
                     pourquoi: 'aucune définition dérivée pour ce verbe' }];
  const champs = (nd.configSchema && nd.configSchema.champs) || [];
  champs.forEach(function (c) {
    if (!c.nature || c.chemin === 'label') return;
    if (RENDU.AFFICHAGE.includes(c.nature)) return;   // décor : sans conséquence
    if (RENDU.RESSOURCES_APS.includes(c.nature)) {
      out.push({ gravite: 'degrade', quoi: c.chemin,
                 pourquoi: `ressource APS « ${c.nature} » : devient une saisie libre, APS n'étant pas là en production` });
    } else if (!RENDU.TYPE[c.nature] && !RENDU.LISTES[c.nature]) {
      out.push({ gravite: 'degrade', quoi: c.chemin,
                 pourquoi: `nature « ${c.nature} » sans équivalent chez la cible` });
    }
  });
  // Plusieurs discriminants : les conditions ne peuvent plus s'inverser en
  // `nested`, tous les paramètres s'affichent d'un coup.
  const cond = champs.filter(c => c.visibleSi && c.visibleSi.termes && c.visibleSi.termes.length);
  const pivots = [...new Set(cond.flatMap(c => c.visibleSi.termes.map(t => t.champ)))];
  if (pivots.length > 1) {
    out.push({ gravite: 'degrade', quoi: pivots.join(' + '),
               pourquoi: `${pivots.length} discriminants : les ${cond.length} conditions de visibilité s'aplatissent, tous les champs s'affichent ensemble` });
  }
  ((nd.description && nd.description.requetes) || []).forEach(function (r) {
    (r.champs || []).forEach(function (c) {
      if (c.source === 'parametre' || c.source === 'constante') return;
      out.push({ gravite: 'degrade', quoi: (r.cas ? r.cas + ' · ' : '') + c.cle,
                 pourquoi: 'valeur calculée dans le moteur : non traduisible telle quelle' });
    });
  });
  return out;
}

router.get('/builder-flows/:id/interpretation', async (req, res) => {
  try {
    const cle = String(req.query.cible || 'make').toLowerCase();
    const cible = CIBLES[cle];
    if (!cible) return res.status(400).json({ error: 'Cible inconnue : ' + cle });

    const flux = await prisma.builderFlow.findUnique({ where: { id: req.params.id } });
    if (!flux) return res.status(404).json({ error: 'Workflow non trouvé' });

    const etapes = etapesDe(flux.document);
    const defs = await prisma.nodeDefinition.findMany();
    const parFamille = new Map(defs.map(d => [d.family, d]));

    // Découpage en scénarios. La seule couture qu'on sache justifier aujourd'hui
    // est le corps de boucle ; elle est donc la seule appliquée, et sa RAISON
    // voyage avec elle plutôt qu'en note de bas de page.
    const groupes = [{ nom: 'Scénario 1', role: 'entrée', raison: null, etapes: [] }];
    const groupeDe = new Map();
    etapes.forEach(function (e) {
      let g;
      if (e.parent) {
        if (!groupeDe.has(e.parent)) {
          groupes.push({ nom: 'Scénario ' + (groupes.length + 1), role: 'corps de boucle',
                         raison: cible.decoupe, appelePar: 'Scénario 1', etapes: [] });
          groupeDe.set(e.parent, groupes.length - 1);
        }
        g = groupes[groupeDe.get(e.parent)];
      } else { g = groupes[0]; }

      const nd = parFamille.get(e.facade || e.core);
      const ecarts = ecartsDuVerbe(nd);
      const rendu = nd && nd.description && nd.description.rendus && nd.description.rendus.make;
      // « Outil natif » ne veut PAS dire « pas de façade ». `verify` et `wait`
      // sont des Cores qui appellent le réseau ; `lookup` est pur mais porte une
      // référence de correspondance. Aucun des trois ne se rend en outil natif
      // de Make. Écrire « natif » sur eux revenait à annoncer une traduction
      // gratuite tout en listant, deux lignes plus bas, ce qu'elle perdrait.
      const provenance = (nd && nd.description && nd.description.provenance) || [];
      const porteRessourceAps = ((nd && nd.configSchema && nd.configSchema.champs) || [])
        .some(c => RENDU.RESSOURCES_APS.includes(c.nature));
      const natif = !e.facade
        && (!provenance.length || provenance.every(p => p === 'pure'))
        && !porteRessourceAps;
      g.etapes.push({
        id: e.id, label: e.label, verbe: e.facade || e.core,
        module: rendu ? rendu.module : null,
        natif: natif,
        // Ni module dédié, ni équivalent natif : personne ne s'en occupe pour
        // l'instant, et c'est ce qu'il faut dire.
        orphelin: !rendu && !natif,
        etat: ecarts.some(x => x.gravite === 'bloquant') ? 'bloquant'
            : ecarts.length ? 'degrade' : 'traduit',
        ecarts,
      });
    });

    const toutes = groupes.flatMap(g => g.etapes);
    res.json({
      flux: { id: flux.id, nom: flux.name },
      cible: { cle, nom: cible.nom, pret: cible.pret },
      ciblesDisponibles: Object.entries(CIBLES).map(([k, v]) => ({ cle: k, nom: v.nom, pret: v.pret })),
      verdict: {
        etapes: toutes.length,
        traduites: toutes.filter(e => e.etat === 'traduit').length,
        degradees: toutes.filter(e => e.etat === 'degrade').length,
        bloquantes: toutes.filter(e => e.etat === 'bloquant').length,
        scenarios: groupes.length,
      },
      groupes,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
