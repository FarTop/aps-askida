/**
 * org-context.js — Contexte d'organisation (fondation du chantier Administration)
 *
 * Résout « dans quelle organisation travaille-t-on, et ce rôle est-il filtré ».
 * Conçu ADDITIF : tant qu'aucun contexte explicite n'est fourni, on retombe sur
 * le comportement actuel (première organisation), donc WFD et l'existant ne
 * bougent pas. Le contexte explicite viendra du sélecteur du header partagé.
 *
 * PRINCIPE RÔLE (décidé avec Farid) : le contexte FILTRE ce qu'on voit, mais le
 * filtre est gouverné par le rôle. `superadmin` et `admin` ne sont JAMAIS
 * filtrés (ils voient tout, ne sont jamais forcés de choisir une org/plateforme) ;
 * `editor`/`viewer` sont filtrés par leur contexte.
 *
 * IMPORTANT — aujourd'hui il n'y a pas encore d'authentification (pas de req.user).
 * En l'absence de rôle fourni, on considère le comportement NON FILTRÉ (comme
 * un superadmin), ce qui préserve EXACTEMENT le comportement actuel : WFD voit
 * tout, sans org imposée. Quand l'auth arrivera, elle fournira le vrai rôle et
 * le filtrage éditeur/viewer s'appliquera — sans rien changer ici.
 *
 * Le helper ne crée pas sa propre instance Prisma : on la lui passe, pour rester
 * découplé et réutilisable par n'importe quelle route.
 */

// Rôles qui ne sont jamais filtrés (voient tout).
const ROLES_NON_FILTRES = ['superadmin', 'admin'];

/**
 * Lit le contexte d'organisation d'une requête.
 *
 * Sources d'un contexte EXPLICITE (par ordre de priorité) :
 *   - en-tête `X-Org-Id` (ce que le sélecteur du header enverra)
 *   - query param `?orgId=...`
 * Rôle (place réservée pour l'auth future) :
 *   - en-tête `X-User-Role` (sinon : non filtré, cf. ci-dessus)
 *
 * @param {object} req      requête Express
 * @param {object} prisma   instance Prisma
 * @returns {Promise<{orgId: string|undefined, role: string, filtre: boolean, explicite: boolean}>}
 */
async function getOrgContext(req, prisma) {
  const role = _roleDe(req);
  const filtre = !ROLES_NON_FILTRES.includes(role);

  // Contexte explicite fourni par le client ?
  const explicite = _orgExplicite(req);
  if (explicite) {
    return { orgId: explicite, role: role, filtre: filtre, explicite: true };
  }

  // Repli : première organisation (comportement actuel, WFD intouché).
  const org = await prisma.organisation.findFirst();
  return { orgId: org && org.id, role: role, filtre: filtre, explicite: false };
}

/**
 * Construit un `where` Prisma filtré par l'org du contexte, SAUF pour les rôles
 * non filtrés (superadmin/admin) où l'on ne restreint pas. Pratique pour les
 * routes qui listent des ressources rattachées à une org.
 *
 * @returns {object} un fragment `where` (`{}` si non filtré ou pas d'org)
 */
function whereOrg(ctx, champ) {
  const cle = champ || 'orgId';
  if (!ctx || !ctx.filtre || !ctx.orgId) return {};
  const w = {}; w[cle] = ctx.orgId; return w;
}

// ── internes ────────────────────────────────────────────────────────────────

function _orgExplicite(req) {
  if (!req) return null;
  const h = req.headers && (req.headers['x-org-id'] || req.headers['X-Org-Id']);
  if (h) return String(h);
  if (req.query && req.query.orgId) return String(req.query.orgId);
  // Cookie aps-org-id (pose par le selecteur du header). Lu a la main pour ne
  // pas dependre de cookie-parser ni toucher au montage Express.
  const c = _cookie(req, 'aps-org-id');
  if (c) return String(c);
  return null;
}

// Lit un cookie par son nom depuis l'en-tete Cookie (sans dependance).
function _cookie(req, nom) {
  const brut = req.headers && (req.headers.cookie || req.headers.Cookie);
  if (!brut) return null;
  const parts = String(brut).split(';');
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq < 0) continue;
    const k = parts[i].slice(0, eq).trim();
    if (k === nom) return decodeURIComponent(parts[i].slice(eq + 1).trim());
  }
  return null;
}

function _roleDe(req) {
  const h = req && req.headers && (req.headers['x-user-role'] || req.headers['X-User-Role']);
  // Pas d'auth aujourd'hui -> non filtré (superadmin implicite), WFD intouché.
  return h ? String(h) : 'superadmin';
}

module.exports = { getOrgContext, whereOrg, ROLES_NON_FILTRES };
