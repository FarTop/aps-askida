-- APS — 2026-08-13 — Le Doc Builder se range sous les principes d'Administration
--
-- Appliqué en SQL BRUT, et pas par `prisma migrate dev` : la table ApsCounter
-- existe en base sans modèle dans schema.prisma, et `migrate dev` la
-- détruirait (cf. reference_prisma_db_drift). Même procédure que pour
-- Platform.authSpec le 2026-08-10.
--
-- Les cinq tables Doc* sont VIDES (vérifié le 2026-08-13) : aucun backfill
-- n'est nécessaire, et une colonne NOT NULL peut être ajoutée directement.
--
-- Le partage appliqué, arrêté le 2026-08-10 pour Administration :
--   ce qu'un document DÉCRIT  → la plateforme, partagé   (DocTemplate)
--   à quoi il RESSEMBLE       → l'organisation           (DocAsset, déjà bon)
--   POUR QUI on l'assemble    → l'organisation           (DocKit)

BEGIN;

-- ── DocKit : quitte Project (modèle mort, 0 ligne) pour l'organisation ──
ALTER TABLE "DocKit" DROP CONSTRAINT IF EXISTS "DocKit_projectId_fkey";
ALTER TABLE "DocKit" DROP COLUMN IF EXISTS "projectId";

ALTER TABLE "DocKit" ADD COLUMN "orgId"      text NOT NULL;
ALTER TABLE "DocKit" ADD COLUMN "platformId" text;

ALTER TABLE "DocKit" ADD CONSTRAINT "DocKit_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organisation"(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "DocKit" ADD CONSTRAINT "DocKit_platformId_fkey"
  FOREIGN KEY ("platformId") REFERENCES "Platform"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "DocKit_orgId_idx" ON "DocKit"("orgId");

-- ── DocTemplate : deux identifiants orphelins deviennent des relations ──
-- `orgId` et `brandAssetId` existaient SANS contrainte : rien ne garantissait
-- qu'ils pointent quoi que ce soit. Le second porte le lien gabarit → charte,
-- celui qui empêche de refaire la faute des exports WFD (charte écrite dans le
-- code de l'exporteur, et pas fidèle).
ALTER TABLE "DocTemplate" ADD COLUMN "platformId" text;

ALTER TABLE "DocTemplate" ADD CONSTRAINT "DocTemplate_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organisation"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "DocTemplate" ADD CONSTRAINT "DocTemplate_brandAssetId_fkey"
  FOREIGN KEY ("brandAssetId") REFERENCES "DocAsset"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "DocTemplate" ADD CONSTRAINT "DocTemplate_platformId_fkey"
  FOREIGN KEY ("platformId") REFERENCES "Platform"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "DocTemplate_orgId_idx"      ON "DocTemplate"("orgId");
CREATE INDEX "DocTemplate_platformId_idx" ON "DocTemplate"("platformId");

COMMIT;

-- ── DocOwner : les lignes de service sortent du localStorage ────────────
-- Ajouté le même jour, après relecture de l'écran : les propriétaires sont en
-- CRUD complet dans l'UI (ajout, renommage, suppression) et vivaient dans
-- `afs:doc:owners`. Ce sont des données, elles vont en base.
BEGIN;

CREATE TABLE "DocOwner" (
  "id"        text        NOT NULL PRIMARY KEY,
  "orgId"     text        NOT NULL,
  "key"       text        NOT NULL,
  "label"     text        NOT NULL,
  "mode"      text        NOT NULL DEFAULT 'normal',
  "createdAt" timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "DocOwner" ADD CONSTRAINT "DocOwner_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organisation"(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "DocOwner_orgId_key_key" ON "DocOwner"("orgId", "key");

COMMIT;
