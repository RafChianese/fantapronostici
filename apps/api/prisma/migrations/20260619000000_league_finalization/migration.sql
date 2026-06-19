-- Optional finalization state for forced tournament end
CREATE TABLE IF NOT EXISTS "LeagueFinalization" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedByUserId" TEXT,
    "message" TEXT,

    CONSTRAINT "LeagueFinalization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeagueFinalization_leagueId_key" ON "LeagueFinalization"("leagueId");
CREATE INDEX IF NOT EXISTS "LeagueFinalization_leagueId_idx" ON "LeagueFinalization"("leagueId");

DO $$ BEGIN
  ALTER TABLE "LeagueFinalization"
  ADD CONSTRAINT "LeagueFinalization_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
