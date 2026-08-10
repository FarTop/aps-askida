// APS — scripts/construire-statuses.js — créé le 2026-08-10
// ================================================================
// Construit le document pivot de BAYARD | CHECK | STATUSES | VOD FACTORY,
// jusqu'ici vide (0 étape).
//
//   node scripts/construire-statuses.js [--ecrire]
//
// Sans --ecrire : affiche le document et s'arrête (aucune écriture en base).
//
// PORTAGE, pas invention : le flux existe dans WFD (Flow flux-1783521869691,
// 11 nœuds) et c'est lui qui fait foi pour les valeurs métier — expression
// cron, endpoint `/api/contents/{BayardID}/action-statuses`, les huit
// vérifications sur les quatre actions Amazon, les libellés de branche et le
// texte des historiques. Rien de tout cela n'est réinventé ici.
//
// UN ÉCART ASSUMÉ, demandé par l'utilisateur le 2026-08-10 : en cas d'échec on
// NE TOUCHE PAS à StatutPublication, on n'écrit que l'historique. WFD faisait
// l'inverse et c'était un piège — sa branche « Ready » écrivait
// StatutPublication = "Publié" alors que son propre historique annonçait
// « Prochaine tentative cette nuit ». Or la recherche du lendemain cherche
// « Posté » : une collection passée à « Publié » n'était jamais reprise. La
// tentative promise n'avait jamais lieu. Rester en « Posté » referme ça.
// ================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const FLOW_ID    = 'cmsd82euo00040hv4ohc9uuzl';
const ENV_QA     = 'cmqp7dk000002p8u50on1l3e7';
const CONN_VODF  = 'cmqp7eg4z0002q4u5q8c3gyej';   // même connexion que Verify/Partner de PUBLISH

const JAUNE = '#f1c40f';   // narration
const ROUGE = '#e74c3c';   // trou de récit / piège

// Les huit vérifications, reprises telles quelles du checker WFD. Quatre
// actions Amazon × deux contrôles : le statut vaut-il "success", et la date
// d'envoi est-elle renseignée. `{item.metadata.BayardID.0}` : la boucle aplatit
// chaque objet trouvé, et BayardID arrive d'Iconik comme un tableau à un
// élément (vérifié en direct sur QA le 2026-08-10).
const ACTIONS = [
  ['amazon_avails',   'avails'],
  ['amazon_data',     'métadonnées'],
  ['amazon_pictures', 'images'],
  ['amazon_videos',   'vidéo'],
];
const ENDPOINT_STATUSES = '/api/contents/{item.metadata.BayardID.0}/action-statuses';

const checks = ACTIONS.flatMap(([action]) => ([
  { label: action, method: 'GET', endpoint: ENDPOINT_STATUSES,
    path: `results.amazon.actions.${action}.status`,  op: 'equals',    value: 'success' },
  { label: action, method: 'GET', endpoint: ENDPOINT_STATUSES,
    path: `results.amazon.actions.${action}.sent_at`, op: 'not_empty', value: '' },
]));

const steps = [
  // ── Entrée ────────────────────────────────────────────────────
  { id: 'minuterie', core: 'trigger', label: 'Minuterie 02:00',
    intent: 'Réveiller le contrôle chaque nuit à 2h, heure de Paris.',
    params: { kind: 'schedule', timerMode: 'cron', cronExpr: '0 2 * * *', timezone: 'Europe/Paris' } },

  { id: 'collections_a_verifier', core: 'http_request', facade: 'iconik.search',
    label: 'Collections à vérifier',
    intent: 'Lister les collections que PUBLISH a marquées « Posté » et dont l\'arrivée '
          + 'chez Amazon n\'est pas encore confirmée.',
    params: {
      limit: 500,
      blocks: [{ id: 1, label: '', objectType: 'collection', parentBlock: null,
        criteria: [{ op: 'equals', join: '', field: 'StatutPublication', value: 'Posté' }] }],
      resultVar: 'search_results',
    } },

  { id: 'chaque_collection', core: 'loop', label: 'Chaque collection',
    intent: 'Traiter les collections trouvées une par une, sans qu\'une seule en échec '
          + 'interrompe la nuit.',
    // `onError` est conservé ICI et nulle part ailleurs. Le validateur le
    // refuse partout (« réglage de workflow, plus une propriété d'étape ») et
    // il a raison pour toutes les autres étapes — le moteur ne lit que
    // `workflow.onError` (builder-engine.js:151). Mais la boucle fait
    // exception : builder-executor.js:171 lit bien `p.onError`, dont le défaut
    // est 'stop'. Le retirer ferait avorter toute la nuit à la première
    // collection en échec. Règle du validateur à corriger, pas ce document.
    params: { loopVar: 'item', loopSource: 'variable',
              loopVariablePath: '{search_results.objects}', concurrency: 1, onError: 'continue_log' },
    body: {
      steps: [
        { id: 'statuts_vod_factory', core: 'verify', label: 'Statuts VOD Factory',
          intent: 'Demander à VOD Factory où en sont les quatre actions Amazon pour cette '
                + 'collection : statut « success » et date d\'envoi renseignée.',
          params: { checks, connexionId: CONN_VODF } },

        // L'ordre de ce tableau n'a aucun effet sur l'exécution (le routage se
        // fait par les arêtes) mais il décide des LIGNES du canevas : dans une
        // colonne, les étapes se posent dans l'ordre où elles sont déclarées.
        // Le chemin nominal — tout est passé, on publie — est donc écrit en
        // premier pour qu'il se lise en ligne droite tout en haut, les cas
        // dégradés en dessous.
        { id: 'marquer_publie', core: 'http_request', facade: 'iconik.set_metadata',
          label: 'Marquer Publié',
          intent: 'Acter la publication : seul cas où le statut de la collection change.',
          params: {
            target: 'collection', targetId: '{item.id}',
            fields: [
              { key: 'StatutPublication', value: 'Publié' },
              { key: 'DatedePublication', value: '{now}' },
            ],
          } },

        { id: 'histo_succes', core: 'history', facade: 'iconik.history',
          label: 'Histo Succès',
          intent: 'Écrire dans l\'historique Iconik que la publication est confirmée '
                + 'de bout en bout.',
          params: {
            target: 'collection', targetId: '{item.id}', mdField: 'StatutPrime', mdViewId: '',
            whMode: 'update', whOrder: 'newest', whWfName: 'Prime', whStatut: '✅ Succès',
            whMessage: 'Livraison Amazon Prime — ✅ Publié sur Prime · {now(Europe/Paris)} '
                     + 'Validé par VOD Factory : avails, métadonnées, images, vidéo.',
            whShowWf: true, whShowDate: true, whShowUser: false, whShowRunId: true,
          } },

        { id: 'pourquoi_ca_bloque', core: 'decision', label: 'Pourquoi ça bloque ?',
          intent: 'Distinguer une attente normale (contenu prêt, parent pas encore parti) '
                + 'd\'un vrai manque, à partir du mot renvoyé par VOD Factory.',
          params: {
            field: '{checkerSummary}',
            conditions: [
              { op: 'contains', value: 'parent_not_sent', label: 'Reporté' },
              { op: 'contains', value: 'incomplete',      label: 'Echoué'  },
              { op: 'contains', value: 'ready',           label: 'Reporté' },
            ],
            defaultLabel: 'Echoué',
          } },

        { id: 'histo_reporte', core: 'history', facade: 'iconik.history',
          label: 'Histo Reporté',
          intent: 'Consigner une attente normale : le contenu est prêt chez VOD Factory, '
                + 'la collection reste « Posté » et repassera la nuit suivante.',
          params: {
            target: 'collection', targetId: '{item.id}', mdField: 'StatutPrime', mdViewId: '',
            // `🕗 Reporté` et non `❌ Échec` : WFD portait `❌ Échec` ici, mais
            // le champ StatutPrime lui-même dit le contraire — le contrôle
            // nocturne qui tourne en production y écrit `🕗 Reporté` depuis le
            // 1er août. Une attente normale ne s'annonce pas comme un échec.
            whMode: 'update', whOrder: 'newest', whWfName: 'Prime', whStatut: '🕗 Reporté',
            whMessage: 'Livraison Amazon Prime — ⏳ En attente d\'envoi · {now(Europe/Paris)} '
                     + 'Contenu prêt chez VOD Factory, pas encore transmis à Amazon. '
                     + 'Prochaine tentative cette nuit. ⚠️ {checkerSummary}',
            whSummaryVar: '{vfStatus.body.results.amazon.actions}',
            whShowWf: true, whShowDate: true, whShowUser: false, whShowRunId: true,
          } },

        { id: 'histo_echec', core: 'history', facade: 'iconik.history',
          label: 'Histo Échec',
          intent: 'Consigner un vrai manque côté VOD Factory, en laissant la collection '
                + '« Posté » pour qu\'elle soit reprise.',
          params: {
            target: 'collection', targetId: '{item.id}', mdField: 'StatutPrime', mdViewId: '',
            whMode: 'update', whOrder: 'newest', whWfName: 'Prime', whStatut: '❌ Échec',
            whMessage: 'Livraison Amazon Prime — ❌ Échec de validation VOD Factory · '
                     + '{now(Europe/Paris)} ⚠️ {checkerSummary}',
            whSummaryVar: '{vfStatus.body.results.amazon.actions}',
            whShowWf: true, whShowDate: true, whShowUser: false, whShowRunId: true,
          } },

        // ── Post-its du corps de boucle ─────────────────────────
        { id: 'postit_04', core: 'postit', label: 'Statuts VOD Factory',
          params: { color: JAUNE, text:
            'On demande à VOD Factory où en est CETTE collection :\n'
          + 'GET /api/contents/{BayardID}/action-statuses\n\n'
          + 'Quatre actions Amazon (avails, métadonnées, images, vidéo),\n'
          + 'deux contrôles chacune : le statut vaut-il "success",\n'
          + 'et la date d\'envoi est-elle bien renseignée.' } },

        { id: 'postit_05', core: 'postit', label: 'Statuts VOD Factory',
          params: { color: ROUGE, text:
            '⚠ C\'est le SEUL nœud du dépôt qui interroge VOD Factory\n'
          + 'sur son avancement. Le « Verify » de PUBLISH interroge la même\n'
          + 'plateforme mais sur autre chose : la présence des fichiers.\n'
          + 'Deux questions différentes, deux endpoints différents.' } },

        { id: 'postit_06', core: 'postit', label: 'Pourquoi ça bloque ?',
          params: { color: JAUNE, text:
            'Les huit contrôles ne sont pas passés. On lit le mot que\n'
          + 'VOD Factory a renvoyé pour savoir si c\'est grave :\n\n'
          + '  ready            → le contenu est prêt, pas encore envoyé\n'
          + '  parent_not_sent  → le parent n\'est pas parti, on attend\n'
          + '  incomplete       → il manque quelque chose\n'
          + '  (autre)          → on ne sait pas, on le traite en échec' } },

        { id: 'postit_07', core: 'postit', label: 'Marquer Publié',
          params: { color: JAUNE, text:
            'Seul cas où l\'on touche au statut : les huit contrôles\n'
          + 'sont passés. La collection sort de la recherche et ne sera\n'
          + 'plus reprise les nuits suivantes.' } },

        { id: 'postit_08', core: 'postit', label: 'Histo Reporté',
          params: { color: JAUNE, text:
            'On ne touche PAS à StatutPublication : la collection reste\n'
          + '« Posté » et repassera demain à 2h. Seul l\'historique bouge.\n\n'
          + 'C\'est ce qui rend la phrase « prochaine tentative cette nuit »\n'
          + 'vraie. Dans WFD elle était écrite mais fausse : la branche\n'
          + 'Ready basculait en « Publié », donc la collection sortait de\n'
          + 'la recherche et la tentative n\'avait jamais lieu.' } },

        { id: 'postit_09', core: 'postit', label: 'Histo Reporté',
          params: { color: JAUNE, text:
            '« 🕗 Reporté », et non « ❌ Échec » comme le faisait WFD.\n\n'
          + 'C\'est le champ lui-même qui a tranché : le contrôle nocturne\n'
          + 'qui tourne en production écrit « 🕗 Reporté » chaque nuit\n'
          + 'depuis le 1er août. Une attente normale ne s\'annonce pas\n'
          + 'comme un échec.' } },

        { id: 'postit_10', core: 'postit', label: 'Histo Échec',
          params: { color: JAUNE, text:
            'Même principe : rien n\'est écrit dans StatutPublication.\n'
          + 'Une collection réellement cassée sera donc reprise toutes les\n'
          + 'nuits, et le dira dans son historique à chaque passage.' } },

        { id: 'postit_11', core: 'postit', label: 'Histo Échec',
          params: { color: ROUGE, text:
            '⚠ Conséquence à assumer : rien ne sort jamais de la boucle de\n'
          + 'reprise tout seul. Une collection définitivement en échec\n'
          + 'repassera chaque nuit jusqu\'à ce qu\'un humain la regarde.\n'
          + 'C\'est un choix (ne pas perdre de contenu en silence),\n'
          + 'pas un oubli.' } },
      ],
      edges: [
        // Les huit contrôles passent → on publie.
        { from: { step: 'statuts_vod_factory', port: 'ok'    }, to: { step: 'marquer_publie' } },
        // Au moins un échoue → on regarde pourquoi.
        { from: { step: 'statuts_vod_factory', port: 'fail'  }, to: { step: 'pourquoi_ca_bloque' } },
        // VOD Factory injoignable → on le consigne comme un échec.
        { from: { step: 'statuts_vod_factory', port: 'error' }, to: { step: 'histo_echec' } },

        { from: { step: 'marquer_publie', port: 'out'   }, to: { step: 'histo_succes' } },
        { from: { step: 'marquer_publie', port: 'error' }, to: { step: 'histo_succes' } },

        // Deux conditions portent le même libellé « Reporté » (ready et
        // parent_not_sent) : une seule arête pivot suffit, le routage se fait
        // par libellé (builder-handler-decision.js).
        { from: { step: 'pourquoi_ca_bloque', port: 'Reporté' }, to: { step: 'histo_reporte' } },
        { from: { step: 'pourquoi_ca_bloque', port: 'Echoué'  }, to: { step: 'histo_echec' } },
        { from: { step: 'pourquoi_ca_bloque', port: 'default' }, to: { step: 'histo_echec' } },
      ],
    } },

  // ── Post-its de niveau racine ─────────────────────────────────
  { id: 'postit_01', core: 'postit', label: 'Minuterie 02:00',
    params: { color: JAUNE, text:
      'Toutes les nuits à 2h, heure de Paris.\n'
    + 'Personne ne clique : c\'est le seul workflow du dépôt que\n'
    + 'le temps déclenche, pas un opérateur.' } },

  { id: 'postit_02', core: 'postit', label: 'Minuterie 02:00',
    params: { color: ROUGE, text:
      '⚠ Une minuterie ne désigne aucun objet. Pas de collection\n'
    + 'cliquée, pas de token de Custom Action, contexte vide au départ.\n'
    + 'Tout ce que le workflow utilise, il doit aller le chercher —\n'
    + 'c\'est la recherche juste après qui joue ce rôle.' } },

  { id: 'postit_03', core: 'postit', label: 'Collections à vérifier',
    params: { color: JAUNE, text:
      'Les collections que PUBLISH a marquées « Posté » et dont\n'
    + 'personne n\'a encore confirmé l\'arrivée chez Amazon.\n\n'
    + 'Les quatre niveaux remontent, pas seulement les épisodes :\n'
    + 'PUBLISH marque « Posté » sur Série, Saison, Épisode et Unitaire.' } },
];

const edges = [
  { from: { step: 'minuterie', port: 'out'   }, to: { step: 'collections_a_verifier' } },
  { from: { step: 'collections_a_verifier',  port: 'found' }, to: { step: 'chaque_collection' } },
  // Aucune collection en attente : c'est le cas NORMAL une nuit sans
  // publication. Pas d'arête — le run se termine, il n'y a rien à dire.
];

// ── Disposition ──────────────────────────────────────────────────
// Les post-its sont rattachés à leur nœud par leur `label` (même libellé que
// l'étape qu'ils commentent) et posés DESSOUS, empilés quand il y en a
// plusieurs. Sans ça ils arrivent tous en (0,0) et l'annotation devient
// illisible — le contraire de ce à quoi elle sert.
//
// Colonnes reprises de la convention du canevas : nœud large de 230 px, post-it
// de 200, pas de 320 en x (mêmes valeurs que la disposition de PUBLISH).
const COL_X = 320, NODE_H = 96, ECART_NOTE = 16, MARGE_LIGNE = 48;

// Hauteur d'un post-it : 200 px de large, police 12 px, interligne 1.5 → environ
// 30 caractères par ligne rendue. On mesure le texte réel plutôt que de
// supposer une taille fixe, sinon deux notes empilées se chevauchent dès que la
// première est longue.
function hauteurNote(texte) {
  const lignes = String(texte || '').split('\n')
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 30)), 0);
  return Math.max(60, 24 + lignes * 18);
}

// Place un ensemble d'étapes : colonnes par profondeur dans le graphe, lignes
// par ordre d'apparition, puis les notes sous leur nœud.
function disposer(listeEtapes, listeAretes, x0, y0) {
  const mecaniques = listeEtapes.filter(s => s.core !== 'postit');
  const notes      = listeEtapes.filter(s => s.core === 'postit');

  // Profondeur = plus long chemin depuis une entrée, pour qu'un nœud rejoint
  // par deux branches se pose APRÈS les deux et non au milieu.
  const cibles = new Set(listeAretes.map(e => e.to.step));
  const prof = new Map(mecaniques.map(s => [s.id, cibles.has(s.id) ? -1 : 0]));
  for (let passe = 0; passe < mecaniques.length; passe++) {
    let bouge = false;
    for (const e of listeAretes) {
      const pd = prof.get(e.from.step), pa = prof.get(e.to.step);
      if (pd == null || pa == null || pd < 0) continue;
      if (pa < pd + 1) { prof.set(e.to.step, pd + 1); bouge = true; }
    }
    if (!bouge) break;
  }
  mecaniques.forEach(s => { if (prof.get(s.id) < 0) prof.set(s.id, 0); });

  // Notes rattachées par libellé, dans l'ordre où elles sont déclarées.
  const notesDe = new Map();
  for (const n of notes) {
    const cible = mecaniques.find(s => s.label === n.label);
    if (!cible) continue;
    if (!notesDe.has(cible.id)) notesDe.set(cible.id, []);
    notesDe.get(cible.id).push(n);
  }

  const colonnes = new Map();
  mecaniques.forEach(s => {
    const c = prof.get(s.id);
    if (!colonnes.has(c)) colonnes.set(c, []);
    colonnes.get(c).push(s);
  });

  // Hauteur qu'occupe un nœud avec sa pile de notes.
  const encombrement = (s) => NODE_H + (notesDe.get(s.id) || [])
    .reduce((h, n) => h + ECART_NOTE + hauteurNote(n.params.text), 0);

  // Une ligne doit tenir le plus encombrant de tous les nœuds qui l'occupent,
  // sinon la pile de notes d'une colonne recouvre le nœud de la ligne d'après.
  const nbLignes = Math.max(...[...colonnes.values()].map(v => v.length));
  const hauteurLigne = [];
  for (let l = 0; l < nbLignes; l++) {
    let h = NODE_H;
    for (const col of colonnes.values()) if (col[l]) h = Math.max(h, encombrement(col[l]));
    hauteurLigne.push(h + MARGE_LIGNE);
  }
  const yDeLigne = hauteurLigne.map((_, l) => y0 + hauteurLigne.slice(0, l).reduce((a, b) => a + b, 0));

  const layout = {};
  for (const [c, col] of colonnes) {
    col.forEach((s, l) => {
      const x = x0 + c * COL_X, y = yDeLigne[l];
      layout[s.id] = { x, y };
      let yn = y + NODE_H + ECART_NOTE;
      for (const n of (notesDe.get(s.id) || [])) {
        layout[n.id] = { x, y: yn };
        yn += hauteurNote(n.params.text) + ECART_NOTE;
      }
    });
  }
  // Une note dont le libellé ne désigne aucun nœud ne doit pas retomber en
  // (0,0) sans qu'on le voie : on la range à part, visiblement à l'écart.
  notes.forEach((n, i) => { if (!layout[n.id]) layout[n.id] = { x: x0, y: y0 - 320 - i * 120 }; });
  return layout;
}

const loop = steps.find(s => s.core === 'loop');
const presentation = {
  layout: disposer(steps, edges, 40, 60),
  versioned: false,
  bodyLayout: { [loop.id]: disposer(loop.body.steps, loop.body.edges, 40, 60) },
};

const document = {
  pivot: '1.0',
  form: 'canonical',
  workflow: {
    id: FLOW_ID,
    name: 'BAYARD | CHECK | STATUSES | VOD FACTORY',
    intent: 'Confirmer chaque nuit que ce que PUBLISH a envoyé est bien arrivé chez Amazon, '
          + 'via VOD Factory — et ne rien marquer « Publié » tant que ce n\'est pas prouvé.',
    status: 'draft',
    version: 1,
    platform: '',
    environment: ENV_QA,
    onError: 'continue_log',
  },
  steps,
  edges,
  presentation,
};

(async () => {
  const mecaniques = steps.filter(s => s.core !== 'postit');
  const corps = steps.find(s => s.core === 'loop').body.steps;
  console.log(`Document construit : ${mecaniques.length} étapes racine `
    + `(dont une boucle de ${corps.filter(s => s.core !== 'postit').length} étapes), `
    + `${steps.filter(s => s.core === 'postit').length + corps.filter(s => s.core === 'postit').length} post-its, `
    + `${checks.length} vérifications.`);

  if (!process.argv.includes('--ecrire')) {
    console.log('\n(essai à blanc — relancer avec --ecrire pour enregistrer)\n');
    console.log(JSON.stringify(document, null, 2));
    await prisma.$disconnect();
    return;
  }

  const avant = await prisma.builderFlow.findUnique({ where: { id: FLOW_ID } });
  if (!avant) throw new Error(`BuilderFlow ${FLOW_ID} introuvable`);
  // Garde-fou : on n'écrase que le vide, ou une version antérieure de CE
  // document (mêmes identifiants d'étape). Un document rédigé à la main dans
  // le canevas ne doit jamais être remplacé par une relance de script.
  const etapesAvant = (avant.document || {}).steps || [];
  const idsNotres   = new Set(steps.map(s => s.id));
  const estANous    = etapesAvant.length > 0 && etapesAvant.every(s => idsNotres.has(s.id));
  if (etapesAvant.length > 0 && !(estANous && process.argv.includes('--forcer'))) {
    throw new Error(`Le flow porte déjà ${etapesAvant.length} étape(s) — refus d'écraser.`
      + (estANous ? ' Relancer avec --forcer pour régénérer ce même document.'
                  : ' Le document en base n\'a pas été produit par ce script.'));
  }

  await prisma.builderFlow.update({ where: { id: FLOW_ID }, data: { document } });
  console.log(`✅ Écrit dans "${avant.name}" (${FLOW_ID}). Brouillon, non publié, non actif.`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\n💥', e.message);
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
