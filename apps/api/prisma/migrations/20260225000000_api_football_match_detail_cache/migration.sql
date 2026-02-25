-- Add cached API-Football match detail payload (lineups + events)
ALTER TABLE "Match"
ADD COLUMN IF NOT EXISTS "apiFootballDetailJson" JSONB,
ADD COLUMN IF NOT EXISTS "apiFootballDetailFetchedAt" TIMESTAMP(3);
