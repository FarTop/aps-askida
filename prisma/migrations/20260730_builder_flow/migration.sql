-- Workflow du nouveau Builder (ressource d'org, document pivot en JSON).
CREATE TABLE IF NOT EXISTS "BuilderFlow" (
  "id"        TEXT NOT NULL,
  "orgId"     TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "document"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuilderFlow_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BuilderFlow_orgId_name_key') THEN
    ALTER TABLE "BuilderFlow" ADD CONSTRAINT "BuilderFlow_orgId_name_key" UNIQUE ("orgId", "name");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BuilderFlow_orgId_fkey') THEN
    ALTER TABLE "BuilderFlow" ADD CONSTRAINT "BuilderFlow_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
