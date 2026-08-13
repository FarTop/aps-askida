// APS — server/routes/utilisateurs.js — 2026-08-13
// Les COMPTES, et le lien d'invitation.
//
// Un compte se crée SANS mot de passe : il existe, il n'est pas activé. APS
// fabrique un jeton et rend l'URL à transmettre. La personne l'ouvre, choisit
// son mot de passe, le jeton meurt.
//
// AUCUN ENVOI D'E-MAIL, et c'est un choix. Le projet n'a pas de dépendance
// mail, et un banc d'essai n'a pas à devenir un serveur de courrier — le lien
// se copie et se transmet par le canal qu'on veut. Le jour où l'envoi
// s'impose, il s'ajoutera ICI sans rien changer au reste.
//
// CE QUI NE SORT JAMAIS D'ICI : `passwordHash`. `_versLApi` liste ce qui sort,
// plutôt que de retirer ce qui ne doit pas — une liste blanche ne laisse pas
// passer le champ qu'on ajoutera demain.
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');

function getPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Sept jours : assez pour qu'une invitation survive à une semaine de congés,
// assez peu pour qu'un lien oublié dans une conversation finisse par mourir.
const VALIDITE_JOURS = 7;

function _nouveauJeton() {
  return crypto.randomBytes(32).toString('hex');
}
function _expiration() {
  return new Date(Date.now() + VALIDITE_JOURS * 24 * 3600 * 1000);
}

function _versLApi(u, base) {
  const invite = !u.passwordHash;
  const expire = u.jetonActivationExpire && u.jetonActivationExpire.getTime() < Date.now();
  return {
    id: u.id, name: u.name, email: u.email,
    profile: u.profile, lang: u.lang, actif: u.actif,
    // Trois états, et ils se lisent d'un coup d'œil plutôt qu'en recoupant
    // trois champs : activé / invité / invitation expirée.
    etat: !invite ? 'active' : (expire ? 'expire' : 'invite'),
    invitationExpire: u.jetonActivationExpire,
    // L'URL n'est rendue que tant qu'elle sert à quelque chose.
    lienActivation: (invite && u.jetonActivation && !expire)
      ? base + '/activation.html?jeton=' + u.jetonActivation : null,
    derniereConnexion: u.derniereConnexion,
    groupes: (u.groupes || []).map(g => ({
      id: g.groupeId,
      cle: g.groupe ? g.groupe.cle : undefined,
      nom: g.groupe ? g.groupe.nom : undefined,
    })),
    createdAt: u.createdAt, updatedAt: u.updatedAt,
  };
}

// L'adresse à laquelle la personne ouvrira le lien. `APS_PUBLIC_URL` quand APS
// est exposé (aps-askida.com), l'origine de la requête sinon — un lien
// « localhost » envoyé à un collègue ne mène nulle part, autant que ça se voie.
function _base(req) {
  return process.env.APS_PUBLIC_URL || (req.protocol + '://' + req.get('host'));
}

const AVEC = { groupes: { include: { groupe: true } } };

// GET /api/utilisateurs
router.get('/', async (req, res) => {
  const prisma = getPrisma();
  try {
    const liste = await prisma.user.findMany({ include: AVEC, orderBy: { name: 'asc' } });
    res.json(liste.map(u => _versLApi(u, _base(req))));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/utilisateurs — { name, email, groupes?[], profile?, lang? }
// Crée le compte ET son invitation : un compte sans moyen d'être activé serait
// une ligne morte, il n'y a pas de raison de séparer les deux gestes.
router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name)  return res.status(400).json({ error: 'name requis' });
  if (!email) return res.status(400).json({ error: 'email requis' });
  const prisma = getPrisma();
  try {
    const propre = String(email).trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email: propre } })) {
      return res.status(409).json({ error: 'Cette adresse a déjà un compte' });
    }
    const u = await prisma.user.create({
      data: {
        name, email: propre,
        profile: req.body.profile || 'mixed',
        lang: req.body.lang || 'fr',
        jetonActivation: _nouveauJeton(),
        jetonActivationExpire: _expiration(),
        groupes: { create: (req.body.groupes || []).map(groupeId => ({ groupeId })) },
      },
      include: AVEC,
    });
    res.json(_versLApi(u, _base(req)));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// PUT /api/utilisateurs/:id — nom, profil, langue, activité, groupes.
// PAS le mot de passe : il n'appartient qu'à la personne, et se change par le
// lien d'activation. Un administrateur qui pourrait l'écrire pourrait se faire
// passer pour elle.
router.put('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    const data = { updatedAt: new Date() };
    if (req.body.name !== undefined)    data.name = req.body.name;
    if (req.body.profile !== undefined) data.profile = req.body.profile;
    if (req.body.lang !== undefined)    data.lang = req.body.lang;
    if (req.body.actif !== undefined)   data.actif = req.body.actif === true;

    if (Array.isArray(req.body.groupes)) {
      await prisma.groupeUtilisateur.deleteMany({ where: { userId: req.params.id } });
      for (const groupeId of req.body.groupes) {
        await prisma.groupeUtilisateur.create({ data: { userId: req.params.id, groupeId } });
      }
    }
    const u = await prisma.user.update({ where: { id: req.params.id }, data, include: AVEC });
    res.json(_versLApi(u, _base(req)));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/utilisateurs/:id/inviter — refaire un lien.
// Sert dans deux cas qui n'en font qu'un : l'invitation a expiré, ou le lien
// s'est perdu. Réinviter INVALIDE le précédent — c'est le point : un lien qui
// traîne dans une conversation ne doit pas rester utilisable.
router.post('/:id/inviter', async (req, res) => {
  const prisma = getPrisma();
  try {
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        jetonActivation: _nouveauJeton(),
        jetonActivationExpire: _expiration(),
        updatedAt: new Date(),
      },
      include: AVEC,
    });
    res.json(_versLApi(u, _base(req)));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/utilisateurs/:id/reinitialiser — reprendre la main sur un compte
// déjà activé : on efface le mot de passe et on refait une invitation. La
// personne repasse par le même chemin que la première fois.
router.post('/:id/reinitialiser', async (req, res) => {
  const prisma = getPrisma();
  try {
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        passwordHash: null,
        jetonActivation: _nouveauJeton(),
        jetonActivationExpire: _expiration(),
        updatedAt: new Date(),
      },
      include: AVEC,
    });
    res.json(_versLApi(u, _base(req)));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// DELETE /api/utilisateurs/:id
router.delete('/:id', async (req, res) => {
  const prisma = getPrisma();
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// ── ACTIVATION — les deux seules routes PUBLIQUES d'ici ──────────
// Elles ne disent JAMAIS à qui appartient un jeton inconnu, et ne distinguent
// pas « jeton faux » de « jeton expiré » autrement que par ce que la personne
// doit savoir pour agir.

// GET /api/utilisateurs/activation/:jeton — le lien est-il encore bon ?
router.get('/activation/:jeton', async (req, res) => {
  const prisma = getPrisma();
  try {
    const u = await prisma.user.findUnique({ where: { jetonActivation: req.params.jeton } });
    if (!u || !u.jetonActivationExpire || u.jetonActivationExpire.getTime() < Date.now()) {
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }
    // Le prénom et l'adresse, pour que la personne sache quel compte elle
    // active — rien d'autre ne sort d'une route publique.
    res.json({ name: u.name, email: u.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

// POST /api/utilisateurs/activation/:jeton — { motDePasse }
router.post('/activation/:jeton', async (req, res) => {
  const mdp = String(req.body.motDePasse || '');
  // Douze caractères, et rien d'autre comme règle. Les exigences de casse et de
  // symboles produisent des mots de passe plus courts et plus prévisibles ;
  // la longueur est la seule contrainte qui aide vraiment.
  if (mdp.length < 12) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 12 caractères' });
  }
  const prisma = getPrisma();
  try {
    const u = await prisma.user.findUnique({ where: { jetonActivation: req.params.jeton } });
    if (!u || !u.jetonActivationExpire || u.jetonActivationExpire.getTime() < Date.now()) {
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await bcrypt.hash(mdp, 10),
        // Le jeton meurt avec son usage : un lien d'activation ne sert qu'une
        // fois, même s'il n'a pas expiré.
        jetonActivation: null,
        jetonActivationExpire: null,
        updatedAt: new Date(),
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { await prisma.$disconnect(); }
});

module.exports = router;
