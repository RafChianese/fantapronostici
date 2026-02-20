-- Add cached player options for competition top scorer selection
ALTER TABLE "CompetitionOutcome" ADD COLUMN IF NOT EXISTS "playerOptionsJson" JSONB;
ALTER TABLE "CompetitionOutcome" ADD COLUMN IF NOT EXISTS "playerOptionsFetchedAt" TIMESTAMP(3);
