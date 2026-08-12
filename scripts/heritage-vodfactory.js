// APS — scripts/heritage-vodfactory.js — créé le 2026-08-12
// ================================================================
// Poser la politique d'héritage sur la correspondance VOD Factory.
//
//   node scripts/heritage-vodfactory.js            montre, n'écrit rien
//   node scripts/heritage-vodfactory.js --ecrire   écrit
//
// POURQUOI. VOD Factory exige les mêmes attributs à CHAQUE niveau d'une série.
// Mesuré sur leur préprod le 2026-08-12 : la série « Star Trek » ne porte que
// son titre, ses neuf autres attributs sont vides, et toute la branche est
// bloquée — la saison et l'épisode répondent `parent_not_sent`. L'épisode est
// pourtant parfaitement renseigné : sa perfection ne sert à rien tant que sa
// série ne part pas.
//
// La cause est en amont d'Iconik : les vues SERIE et SAISON ne portent aucune
// métadonnée éditoriale. Il n'y a rien à récolter, donc le workflow ne « saute »
// pas une étape — il n'y a pas d'étape.
//
// ── CE QUE CETTE TABLE ARBITRE ──────────────────────────────────
// Rendre les dix champs obligatoires à chaque niveau ferait ressaisir dix
// valeurs sur chaque épisode d'un catalogue. Ne rien exiger livrerait des
// fiches vides. La résolution se fait donc à la publication, en remontant tant
// que c'est vide — et ce qui varie d'un champ à l'autre est le DROIT de
// remonter :
//
//   propre     ne remonte jamais. Chaque niveau a le sien.
//   cascade    remonte librement. Constantes de l'œuvre : hériter est la
//              vérité, pas un pis-aller.
//   signalee   remonte, mais la livraison DIT qu'elle a emprunté. Le synopsis
//              d'une série posé sur un épisode remplit le champ et livre un
//              texte qui ne le décrit pas : donnée trompeuse, pas donnée
//              manquante. On ne l'interdit pas — ça rebloquerait l'arbre — on
//              la rend visible.
//   fusion     union du niveau et de ses ancêtres. Un épisode qui déclare un
//              invité doit GARDER le casting récurrent de la série ; un simple
//              « sinon » le ferait disparaître.
//
// Conséquence pratique : dix champs à saisir UNE fois par œuvre, zéro sur une
// saison, un seul sur un épisode (la durée, qui vient du fichier vidéo).
// ================================================================
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

const ECRIRE = process.argv.includes('--ecrire');

// La politique, par champ SOURCE de la correspondance. Le champ destination
// (VOD Factory) est rappelé pour que la table se relise sans l'autre écran.
const POLITIQUE = {
  Titre:               { vers: 'title',              heritage: 'propre' },
  // UNE POLITIQUE PAR NIVEAU. L'arbitrage Bayard du 2026-08-12 : le synopsis
  // d'une SAISON hérite de sa série sans réserve — c'est l'usage normal — mais
  // celui d'un ÉPISODE doit être différencié, « indispensable pour une belle
  // fiche Amazon ». Le même champ ne se comporte donc pas pareil aux deux
  // étages, et une politique unique ne savait pas le dire.
  Synopsis:            { vers: 'synopsis',           heritage: { saison: 'cascade', episode: 'signalee' } },
  SynopsisCourt:       { vers: 'short_synopsis',     heritage: { saison: 'cascade', episode: 'signalee' } },
  // Propre au niveau, par arbitrage : « release date / numéro au niveau
  // saison / épisode ».
  DatedeSortie:        { vers: 'release_date',       heritage: 'propre' },
  // Héritée partout, par arbitrage : saisie une fois au niveau série.
  Classification:      { vers: 'rating',             heritage: 'cascade' },
  Studio:              { vers: 'owner',              heritage: 'cascade' },
  LangueOriginale:     { vers: 'original_language',  heritage: 'cascade' },
  Pays:                { vers: 'countries',          heritage: 'cascade' },
  Genres:              { vers: 'genres',             heritage: 'cascade' },
  // FUSION — et « hériter si vide, sinon fusionner » est la MÊME règle :
  // l'union avec un ensemble vide rend l'ensemble du parent. Un seul
  // comportement couvre les deux cas.
  //
  // Le dédoublonnage porte sur le couple (external_id, job), pas sur la
  // personne seule : quelqu'un peut être réalisateur ET scénariste — deux
  // entrées légitimes — alors qu'un réalisateur déclaré à la fois sur la série
  // et l'épisode ne doit apparaître qu'une fois.
  Realisateur:         { vers: 'persons[director]',  heritage: 'fusion' },
  Acteur:              { vers: 'persons[actor]',     heritage: 'fusion' },
  AuteurOrigine:       { vers: 'persons[creator]',   heritage: 'fusion' },
  Auteur:             { vers: 'persons[writer]',    heritage: 'fusion' },
  Producteur:          { vers: 'persons[producer]',  heritage: 'fusion' },
  // Identité et structure : écrites par le gabarit ou le workflow, jamais
  // saisies, et jamais héritées — un identifiant hérité désignerait le parent.
  BayardID:            { vers: 'external_id',        heritage: 'propre' },
  ParentID:            { vers: 'parent_external_id', heritage: 'propre' },
  NumeroEpisode:       { vers: 'rank',               heritage: 'propre' },
  TitreOriginal:       { vers: 'original_title',     heritage: 'signalee' },
  ISAN:                { vers: 'identifiers.isan',   heritage: 'propre' },
  ContenuPrime:        { vers: 'type',               heritage: 'propre' },
  // LES DROITS CASCADENT, et j'avais tort de les vouloir propres. Mon
  // objection — « hériter une fenêtre de licence publierait un contenu hors de
  // ses droits » — confondait deux choses : un champ VIDE ne dit pas « une
  // licence différente », il dit « pas de licence ». Et sans cascade rien ne
  // part : la série de test répond précisément `availability_dates_not_set`.
  //
  // Signalés plutôt que silencieux : sur une donnée juridique, savoir que la
  // fenêtre vient du parent vaut la ligne de journal.
  DatedeDebutdeDroits: { vers: 'availabilities…starts_at', heritage: 'signalee' },
  DatedeFindeDroits:   { vers: 'availabilities…ends_at',   heritage: 'signalee' },
  PaysdExploitation:   { vers: 'availabilities…country',   heritage: 'cascade' },
  // Les images sont cadrées PAR NIVEAU par Amazon lui-même : box_art pour un
  // programme, cover/poster/hero/title pour programme et saison, season_box
  // pour une saison, episodic pour un épisode. Hériter n'aurait donc pas de
  // sens — un format demandé à un niveau n'est pas demandé à l'autre.
  //
  // RESTE OUVERT : notre manifeste déclare aujourd'hui les mêmes essences pour
  // tous les niveaux (`niveau: *`). Le découpage par niveau des images demande
  // une passe à lui seul, et il ne se déduit pas de cette table-ci.
  URLBoxArt:      { vers: 'images.amazon.box_art',        heritage: 'propre' },
  URLCoverArt:    { vers: 'images.amazon.cover_art',      heritage: 'propre' },
  URLHeroArt:     { vers: 'images.amazon.hero_art',       heritage: 'propre' },
  URLPosterArt:   { vers: 'images.amazon.poster_art',     heritage: 'propre' },
  URLSeasonArt:   { vers: 'images.amazon.season_box_art', heritage: 'propre' },
  URLEpisodicArt: { vers: 'images.amazon.episodic_art',   heritage: 'propre' },
  URLTitleArt:    { vers: 'images.amazon.title_art',      heritage: 'propre' },
};

const l = (s, n) => String(s == null ? '' : s).padEnd(n);

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const m = await prisma.mapping.findFirst({ where: { name: { contains: 'VOD Factory' } } });
  if (!m) { console.log('❌ correspondance « VOD Factory » introuvable'); return prisma.$disconnect(); }

  const rules = Array.isArray(m.rules) ? m.rules : [];
  console.log('\n' + m.name + ' — ' + rules.length + ' règles\n');
  console.log(l('CHAMP SOURCE', 22) + l('DESTINATION', 30) + l('AVANT', 12) + 'APRÈS');
  console.log('─'.repeat(88));

  let touchees = 0, inconnues = [];
  const majs = rules.map(function (r) {
    const cle = r.key || r.src || '';
    const p = POLITIQUE[cle];
    if (!p) { inconnues.push(cle); return r; }
    const dire = h => !h ? '—' : typeof h === 'string' ? h
      : Object.entries(h).map(([n, v]) => n + '=' + v).join(' ');
    const avant = dire(r.heritage), apres = dire(p.heritage);
    if (avant !== apres) touchees++;
    console.log(l(cle, 22) + l(r.value || r.tgt, 34) + l(avant, 14)
      + apres + (avant === apres ? '   (inchangé)' : ''));
    return Object.assign({}, r, { heritage: p.heritage });
  });

  // Une politique qui vise un champ absent de la correspondance est un aveu
  // utile : soit la règle manque, soit le nom a changé.
  const presents = new Set(rules.map(r => r.key || r.src || ''));
  const absents = Object.keys(POLITIQUE).filter(k => !presents.has(k));
  if (absents.length) console.log('\n⚠ Politique sans règle correspondante : ' + absents.join(', '));
  if (inconnues.length) console.log('⚠ Règles sans politique : ' + inconnues.join(', '));

  console.log('\n' + touchees + ' règle(s) à modifier sur ' + rules.length + '.');
  if (!ECRIRE) { console.log('Lecture seule. Relancer avec --ecrire.'); return prisma.$disconnect(); }

  await prisma.mapping.update({ where: { id: m.id }, data: { rules: majs } });
  console.log('✅ écrit.');
  await prisma.$disconnect();
})().catch(e => { console.error('ERREUR —', e.message); process.exit(1); });
