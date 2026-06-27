-- AlterTable: add savedSearchIds to IkonTeam
ALTER TABLE "IkonTeam" ADD COLUMN IF NOT EXISTS "savedSearchIds" JSONB NOT NULL DEFAULT '[]';
