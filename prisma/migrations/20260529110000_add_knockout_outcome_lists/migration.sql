ALTER TABLE "SuperSetting"
ADD COLUMN IF NOT EXISTS "competitionOutcomeQuarterFinalistTeamsJson" JSONB,
ADD COLUMN IF NOT EXISTS "competitionOutcomeSemiFinalistTeamsJson" JSONB,
ADD COLUMN IF NOT EXISTS "competitionOutcomeFinalistTeamsJson" JSONB;
