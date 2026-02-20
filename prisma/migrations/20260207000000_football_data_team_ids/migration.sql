-- Add football-data team ids used for post-sync enrichment of shortName/crest
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "footballDataHomeTeamId" INTEGER;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "footballDataAwayTeamId" INTEGER;
