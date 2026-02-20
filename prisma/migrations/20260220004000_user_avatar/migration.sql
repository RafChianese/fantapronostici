-- Add avatar configuration to user profile
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarJson" JSONB;
