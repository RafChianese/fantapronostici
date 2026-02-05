-- Add scoring mode + mixed cumulability switches to Rule

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScoringMode" AS ENUM ('CUMULATIVE', 'BEST_ONLY', 'MIXED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "scoringMode" "ScoringMode" NOT NULL DEFAULT 'CUMULATIVE';
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "allowOutcomeWithExact" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "allowSumGoalsWithExact" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "allowSumGoalsWithOutcome" BOOLEAN NOT NULL DEFAULT true;
