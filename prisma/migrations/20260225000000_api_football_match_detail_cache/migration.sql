-- Cache API-Football match detail (lineups + events) on Match to reduce external API calls

ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "apiFootballDetailJson" JSONB;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "apiFootballDetailFetchedAt" TIMESTAMP(3);
