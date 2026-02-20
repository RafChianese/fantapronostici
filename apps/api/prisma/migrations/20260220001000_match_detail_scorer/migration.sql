-- Step 2: Match detail + scorer selection

-- Add cached goal scorers on Match
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "goalScorersJson" JSONB;

-- Add scorer points on Prediction (breakdown)
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "pointsScorer" INTEGER NOT NULL DEFAULT 0;

-- New table: ScorerPick (independent from score prediction)
CREATE TABLE IF NOT EXISTS "ScorerPick" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "playerExternalId" TEXT NOT NULL,
  "playerName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScorerPick_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ScorerPick" ADD CONSTRAINT "ScorerPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScorerPick" ADD CONSTRAINT "ScorerPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScorerPick" ADD CONSTRAINT "ScorerPick_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique constraint (one pick per user+league+match)
DO $$ BEGIN
  ALTER TABLE "ScorerPick" ADD CONSTRAINT "ScorerPick_userId_leagueId_matchId_key" UNIQUE ("userId", "leagueId", "matchId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "ScorerPick_leagueId_idx" ON "ScorerPick"("leagueId");
CREATE INDEX IF NOT EXISTS "ScorerPick_matchId_idx" ON "ScorerPick"("matchId");

-- Add scorer feature toggles on Rule
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "enableScorer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "pointsScorer" INTEGER NOT NULL DEFAULT 3;
