-- Forced tournament finalization state per league.
CREATE TABLE "LeagueFinalization" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedByUserId" TEXT,
  "message" TEXT,
  CONSTRAINT "LeagueFinalization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeagueFinalization_leagueId_key" ON "LeagueFinalization"("leagueId");
CREATE INDEX "LeagueFinalization_leagueId_idx" ON "LeagueFinalization"("leagueId");

ALTER TABLE "LeagueFinalization"
ADD CONSTRAINT "LeagueFinalization_leagueId_fkey"
FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
