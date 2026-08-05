-- Dépublier/republier un BuilderFlow sans toucher a son Trigger ni le
-- supprimer : independant du statut brouillon/publie (calcule, jamais
-- stocke) -- repond a "ce flow doit-il encore repondre au vrai webhook
-- Iconik ?", filtre uniquement dans /api/builder-engine/action/:slug.
ALTER TABLE "BuilderFlow" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
