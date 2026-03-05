-- Add global competition outcome fields to SuperSetting
ALTER TABLE "SuperSetting"
  ADD COLUMN IF NOT EXISTS "competitionOutcomeWinnerTeamExternalId" INTEGER,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeWinnerTeamName" TEXT,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeTopScorerPlayerExternalId" INTEGER,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeTopScorerPlayerName" TEXT,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeSecondTopScorerPlayerExternalId" INTEGER,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeSecondTopScorerPlayerName" TEXT,
  ADD COLUMN IF NOT EXISTS "competitionOutcomeResolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "competitionPlayerOptionsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "competitionPlayerOptionsFetchedAt" TIMESTAMP(3);
