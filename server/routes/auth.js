// APS — server/routes/auth.js — 2026-08-13
// ================================================================
// SE CONNECTER, SE DÉCONNECTER, SAVOIR QUI L'ON EST.
//
// Trois routes, et AUCUNE ne protège quoi que ce soit. APS reste grand ouvert :
// se connecter ne verrouille rien, ça rend seulement l'identité connaissable.
// C'est ce qui permet de vérifier le modèle d'accès EN VRAI — « voilà ce que
// j'obtiendrais » — avant de décider un jour d'appliquer quoi que ce soit.
//
// LA SESSION EST UN COOKIE SIGNÉ (JWT), pas une table. Elle ne porte qu'un
// identifiant : tout le reste — groupes, organisations, outils — se relit en
// base à chaque appel de `/moi`. Un jeton qui embarquerait les droits
// continuerait d'ouvrir des portes retirées la veille.
//
// `httpOnly` : le cookie n'est PAS lisible en JavaScript. Une page qui pourrait
// le lire pourrait le recopier ; l'identité s'obtient en demandant à `/moi`,
// jamais en inspectant le cookie.
// ================================================================
'use strict';

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const COOKIE = 'aps-session';
const DUREE  = 12 * 3600;          // 12 h : une journée de travail, pas plus.

function _secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET absent de .env');
  return s;
}

// ── Ce qu'une personne « est », recomposé à chaque fois ──────────
// Ses organisations et ses outils ne sont écrits nulle part : ils sont l'union
// de ceux de ses groupes. C'est LA règle du modèle, et elle se calcule ici,
// une seule fois, pour que personne ne la réimplémente ailleurs.
async function identiteDe(prisma, userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { groupes: { include: { groupe: {
      include: { organisations: { include: { organisation: true } } },
    } } } },
  });
  if (!u || !u.actif) return null;

  const orgs = new Map();
  const outils = new Set();
  u.groupes.forEach(function (a) {
    const g = a.groupe;
    if (!g) return;
    (g.outils || []).forEach(o => outils.add(o));
    (g.organisations || []).forEach(function (go) {
      if (go.organisation) orgs.set(go.organisation.id, go.organisation.name);
    });
  });

  return {
    id: u.id, name: u.name, email: u.email, lang: u.lang,
    groupes: u.groupes.map(a => ({
      id: a.groupeId,
      cle: a.groupe ? a.groupe.cle : undefined,
      nom: a.groupe ? a.groupe.nom : undefined,
    })).filter(g => g.cle),
    organisations: Array.from(orgs, ([id, name]) => ({ id, name })),
    outils: Array.from(outils),
    derniereConnexion: u.derniereConnexion,
  };
}

// Lit la session d'une requête. Rend `null` sans jamais lever : une session
// absente ou expirée est un cas NORMAL tant que rien n'est imposé.
function sessionDe(req) {
  const brut = _cookie(req, COOKIE);
  if (!brut) return null;
  try { return jwt.verify(brut, _secret()); } catch (_) { return null; }
}

function _cookie(req, nom) {
  const entete = req.headers.cookie || '';
  const trouve = entete.split(';').map(s => s.trim())
    .find(s => s.indexOf(nom + '=') === 0);
  return trouve ? decodeURIComponent(trouve.slice(nom.length + 1)) : null;
}

// POST /api/auth/connexion — { email, motDePasse }
router.post('/connexion', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const mdp   = String(req.body.motDePasse || '');
  if (!email || !mdp) return res.status(400).json({ error: 'Adresse et mot de passe requis' });

  const prisma = getPrisma();
  try {
    const u = await prisma.user.findUnique({ where: { email } });

    // UN SEUL MESSAGE pour les quatre cas : compte inconnu, jamais activé,
    // désactivé, mauvais mot de passe. Les distinguer dirait à un inconnu
    // quelles adresses existent.
    const refus = { error: 'Adresse ou mot de passe incorrect' };
    if (!u || !u.actif || !u.passwordHash) return res.status(401).json(refus);
    if (!await bcrypt.compare(mdp, u.passwordHash)) return res.status(401).json(refus);

    await prisma.user.update({
      where: { id: u.id }, data: { derniereConnexion: new Date() },
    });

    const jeton = jwt.sign({ sub: u.id }, _secret(), { expiresIn: DUREE });
    res.cookie
      ? res.cookie(COOKIE, jeton, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: DUREE * 1000 })
      : res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(jeton)
          + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + DUREE);

    res.json(await identiteDe(prisma, u.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/auth/deconnexion
router.post('/deconnexion', (req, res) => {
  res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// GET /api/auth/moi — qui suis-je, et qu'est-ce que j'obtiendrais.
// Rend `null` quand personne n'est connecté : ce n'est PAS une erreur
// aujourd'hui, c'est l'état normal d'APS.
router.get('/moi', async (req, res) => {
  const s = sessionDe(req);
  if (!s || !s.sub) return res.json(null);
  const prisma = getPrisma();
  try {
    res.json(await identiteDe(prisma, s.sub));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
module.exports.sessionDe = sessionDe;
module.exports.identiteDe = identiteDe;
