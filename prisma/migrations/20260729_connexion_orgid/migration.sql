-- Connexion -> Organisation (decision A, Temps 1).
-- Ajoute orgId (nullable, transition douce : envId conserve). Remplit orgId
-- pour les connexions existantes depuis l'organisation de leur environnement
-- (Environment.orgId, deterministe). Aucune perte, aucune rupture.

-- 1. Colonne nullable
ALTER TABLE "Connexion" ADD COLUMN IF NOT EXISTS "orgId" TEXT;

-- 2. Cle etrangere vers Organisation (ON DELETE SET NULL : une org supprimee ne
--    detruit pas la connexion, coherent avec la transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Connexion_orgId_fkey'
  ) THEN
    ALTER TABLE "Connexion"
      ADD CONSTRAINT "Connexion_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organisation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Backfill : orgId = l'org de l'environnement de la connexion
UPDATE "Connexion" c
SET "orgId" = e."orgId"
FROM "Environment" e
WHERE c."envId" = e."id" AND c."orgId" IS NULL;
