-- APS — 2026-08-13 — Le groupe est le rôle
--
-- SQL brut, pas `prisma migrate dev` : ApsCounter existe en base sans modèle
-- et serait détruit (cf. reference_prisma_db_drift).
--
-- `User` et `Permission` sont VIDES (vérifié) : rien à reprendre, les colonnes
-- se retirent et se remplacent directement.
--
-- Ce que ce fichier acte :
--   · une personne n'a plus UNE organisation ni UN rôle — elle a des groupes ;
--   · un groupe porte les organisations qu'il couvre et les outils qu'il ouvre ;
--   · un compte peut exister SANS mot de passe : c'est l'état « invité ».

BEGIN;

-- ── User : ce qui décidait des droits s'en va ──────────────────────────
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_orgId_fkey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "orgId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- Un compte invité n'a pas encore choisi son mot de passe.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "actif"                 boolean NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "jetonActivation"       text;
ALTER TABLE "User" ADD COLUMN "jetonActivationExpire" timestamp;
ALTER TABLE "User" ADD COLUMN "derniereConnexion"     timestamp;

CREATE UNIQUE INDEX "User_jetonActivation_key" ON "User"("jetonActivation");

-- ── Groupe : le rôle, les organisations couvertes, les outils ouverts ──
CREATE TABLE "Groupe" (
  "id"          text      NOT NULL PRIMARY KEY,
  "cle"         text      NOT NULL,
  "nom"         text      NOT NULL,
  "description" text,
  "outils"      text[]    NOT NULL DEFAULT '{}',
  "systeme"     boolean   NOT NULL DEFAULT false,
  "createdAt"   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Groupe_cle_key" ON "Groupe"("cle");

-- ── Les deux liaisons, nues : le rôle EST le groupe, rien à qualifier ──
CREATE TABLE "GroupeOrganisation" (
  "id"        text      NOT NULL PRIMARY KEY,
  "groupeId"  text      NOT NULL,
  "orgId"     text      NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "GroupeOrganisation" ADD CONSTRAINT "GroupeOrganisation_groupeId_fkey"
  FOREIGN KEY ("groupeId") REFERENCES "Groupe"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "GroupeOrganisation" ADD CONSTRAINT "GroupeOrganisation_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organisation"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE UNIQUE INDEX "GroupeOrganisation_groupeId_orgId_key"
  ON "GroupeOrganisation"("groupeId", "orgId");

CREATE TABLE "GroupeUtilisateur" (
  "id"        text      NOT NULL PRIMARY KEY,
  "groupeId"  text      NOT NULL,
  "userId"    text      NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "GroupeUtilisateur" ADD CONSTRAINT "GroupeUtilisateur_groupeId_fkey"
  FOREIGN KEY ("groupeId") REFERENCES "Groupe"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "GroupeUtilisateur" ADD CONSTRAINT "GroupeUtilisateur_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE UNIQUE INDEX "GroupeUtilisateur_groupeId_userId_key"
  ON "GroupeUtilisateur"("groupeId", "userId");

COMMIT;
