// APS — server/routes/context.js — 2026-07-29
//
// Endpoints de LECTURE du contexte d'organisation (étape 2 du chantier
// Administration). Alimentent le sélecteur du header partagé et permettent à
// n'importe quel builder de connaître le contexte courant.
//
// Additif : ces routes sont nouvelles, ne remplacent rien. La route existante
// /api/organisation (singulier, WFD) n'est PAS touchée.

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { getOrgContext } = require('../lib/org-context');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// GET /api/organisations — liste des organisations, avec leurs plateformes.
// Sert à peupler le sélecteur. Un rôle filtré (editor/viewer) ne verra à terme
// que ses organisations ; aujourd'hui (pas d'auth) on renvoie toutes les orgs.
router.get('/organisations', async (req, res) => {
  try {
    const orgs = await prisma.organisation.findMany({
      orderBy: { name: 'asc' },
      include: {
        platforms: { include: { platform: true } },
        environments: true,
        connexions: true,
        mappings: true,
        nommages: true,
        contactLists: true
      }
    });
    // On projette une forme légère et stable pour le client (jamais de secret).
    const out = orgs.map(function (o) {
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        platforms: (o.platforms || []).map(function (op) {
          return op.platform
            ? { id: op.platform.id, name: op.platform.name, slug: op.platform.slug,
                type: op.platform.type, isActive: op.platform.isActive }
            : null;
        }).filter(Boolean),
        environments: (o.environments || []).map(function (e) {
          return { id: e.id, name: e.name, slug: e.slug, type: e.type, platformId: e.platformId };
        }),
        // Connexions : jamais de secret, juste l'identité et le type/direction.
        connexions: (o.connexions || []).map(function (c) {
          return { id: c.id, name: c.name, type: c.type, direction: c.direction, isActive: c.isActive };
        }),
        // Ressources d'orchestration : nom + nombre d'entrées, par famille.
        ressources: {
          mappings: (o.mappings || []).map(function (m) {
            return { id: m.id, name: m.name, count: Array.isArray(m.rules) ? m.rules.length : 0 };
          }),
          nommages: (o.nommages || []).map(function (n) {
            return { id: n.id, name: n.name, count: Array.isArray(n.rules) ? n.rules.length : 0 };
          }),
          contacts: (o.contactLists || []).map(function (c) {
            return { id: c.id, name: c.name, count: Array.isArray(c.contacts) ? c.contacts.length : 0 };
          })
        }
      };
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/context — contexte courant : quelle org, quel rôle, filtré ou non.
// Le client (header partagé) l'utilise pour afficher/positionner le sélecteur.
// S'appuie sur le helper : contexte explicite (X-Org-Id) sinon repli première org.
router.get('/context', async (req, res) => {
  try {
    const ctx = await getOrgContext(req, prisma);
    let org = null;
    if (ctx.orgId) {
      const o = await prisma.organisation.findUnique({
        where: { id: ctx.orgId },
        include: { platforms: { include: { platform: true } } }
      });
      if (o) {
        org = {
          id: o.id, name: o.name, slug: o.slug,
          platforms: (o.platforms || []).map(function (op) {
            return op.platform
              ? { id: op.platform.id, name: op.platform.name, slug: op.platform.slug }
              : null;
          }).filter(Boolean)
        };
      }
    }
    res.json({
      org: org,
      role: ctx.role,
      filtre: ctx.filtre,          // false pour superadmin/admin (voient tout)
      explicite: ctx.explicite     // false = repli (aucun contexte choisi)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
