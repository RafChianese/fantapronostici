-- Add lock mode to settings (manual until date/time vs automatic matchday-based lock)

DO $$ BEGIN
  CREATE TYPE "LockMode" AS ENUM ('MANUAL_UNTIL', 'AUTO_MATCHDAY_30MIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Setting"
  ADD COLUMN IF NOT EXISTS "lockMode" "LockMode" NOT NULL DEFAULT 'MANUAL_UNTIL';

-- Backfill for existing rows (if column was just added without default in some environments)
UPDATE "Setting" SET "lockMode" = 'MANUAL_UNTIL' WHERE "lockMode" IS NULL;
