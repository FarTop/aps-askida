-- Sequence de requetes HTTP nommee : ressource d'org (calquee sur Manifest/Mapping).
CREATE TABLE IF NOT EXISTS "Endpoint" (
  "id"        TEXT NOT NULL,
  "orgId"     TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "steps"     JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Endpoint_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Endpoint_orgId_name_key') THEN
    ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_orgId_name_key" UNIQUE ("orgId", "name");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Endpoint_orgId_fkey') THEN
    ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
