-- Add optional second top scorer fields to CompetitionOutcome
ALTER TABLE "CompetitionOutcome" ADD COLUMN IF NOT EXISTS "topScorer2PlayerExternalId" INTEGER;
ALTER TABLE "CompetitionOutcome" ADD COLUMN IF NOT EXISTS "topScorer2PlayerName" TEXT;
