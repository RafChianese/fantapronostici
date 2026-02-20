-- Partita Jolly (doppi punti / moltiplicatore)

ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "enableJolly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "jollyMultiplier" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS "MatchdayJolly" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "matchday" INTEGER NOT NULL,
  "matchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MatchdayJolly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchdayJolly_leagueId_matchday_key" ON "MatchdayJolly"("leagueId", "matchday");
CREATE INDEX IF NOT EXISTS "MatchdayJolly_leagueId_idx" ON "MatchdayJolly"("leagueId");
CREATE INDEX IF NOT EXISTS "MatchdayJolly_matchId_idx" ON "MatchdayJolly"("matchId");

ALTER TABLE "MatchdayJolly" ADD CONSTRAINT IF NOT EXISTS "MatchdayJolly_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchdayJolly" ADD CONSTRAINT IF NOT EXISTS "MatchdayJolly_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
