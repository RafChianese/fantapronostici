-- Add preset avatar selection to user profile
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarId" TEXT;
