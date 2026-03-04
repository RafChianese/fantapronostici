-- Add Under/Over cumulability flags for MIXED scoring mode
ALTER TABLE "Rule"
  ADD COLUMN IF NOT EXISTS "allowUnderOverWithExact" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowUnderOverWithOutcome" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowUnderOverWithSumGoals" BOOLEAN NOT NULL DEFAULT true;
