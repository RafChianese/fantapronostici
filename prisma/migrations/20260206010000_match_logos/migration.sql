-- Add optional team logos to Match for mobile-friendly UI
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeLogo" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayLogo" TEXT;
