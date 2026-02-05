-- Add leagues, league memberships, super admin, and league-scoped rules/settings

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE "GlobalRole" AS ENUM ('USER', 'SUPER_ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeagueRole" AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) User: replace Role with GlobalRole
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER';

-- If legacy role column exists, migrate it
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='User' AND column_name='role'
  ) THEN
    UPDATE "User"
      SET "globalRole" = CASE WHEN "role"::text = 'ADMIN' THEN 'SUPER_ADMIN' ELSE 'USER' END;
    ALTER TABLE "User" DROP COLUMN "role";
  END IF;
END $$;

-- Drop legacy enum if present
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    DROP TYPE "Role";
  END IF;
END $$;

-- 3) League + membership
CREATE TABLE IF NOT EXISTS "League" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "League_code_key" ON "League"("code");

CREATE TABLE IF NOT EXISTS "LeagueMember" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "LeagueRole" NOT NULL DEFAULT 'MEMBER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId","userId");
CREATE INDEX IF NOT EXISTS "LeagueMember_userId_idx" ON "LeagueMember"("userId");
CREATE INDEX IF NOT EXISTS "LeagueMember_leagueId_idx" ON "LeagueMember"("leagueId");

ALTER TABLE "LeagueMember" ADD CONSTRAINT IF NOT EXISTS "LeagueMember_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeagueMember" ADD CONSTRAINT IF NOT EXISTS "LeagueMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Demo league for backward compatibility (so existing DBs can migrate cleanly)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "League" WHERE "id" = 'league_demo') THEN
    INSERT INTO "League" ("id","name","code","updatedAt")
    VALUES ('league_demo','Demo League','DEMO', CURRENT_TIMESTAMP);
  END IF;
END $$;

-- 5) League-scoped rules/settings (new tables)
CREATE TABLE IF NOT EXISTS "Rule" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "pointsExact" INTEGER NOT NULL DEFAULT 4,
  "pointsOutcome" INTEGER NOT NULL DEFAULT 2,
  "pointsSumGoals" INTEGER NOT NULL DEFAULT 1,
  "scoringMode" "ScoringMode" NOT NULL DEFAULT 'CUMULATIVE',
  "allowOutcomeWithExact" BOOLEAN NOT NULL DEFAULT true,
  "allowSumGoalsWithExact" BOOLEAN NOT NULL DEFAULT true,
  "allowSumGoalsWithOutcome" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Rule_leagueId_key" ON "Rule"("leagueId");

ALTER TABLE "Rule" ADD CONSTRAINT IF NOT EXISTS "Rule_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Setting" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "lockUntil" TIMESTAMP(3) NOT NULL,
  "isForceLocked" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Setting_leagueId_key" ON "Setting"("leagueId");

ALTER TABLE "Setting" ADD CONSTRAINT IF NOT EXISTS "Setting_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure demo league has rule/setting
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Rule" WHERE "leagueId"='league_demo') THEN
    INSERT INTO "Rule" ("id","leagueId","updatedAt") VALUES ('rule_demo','league_demo', CURRENT_TIMESTAMP);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "Setting" WHERE "leagueId"='league_demo') THEN
    INSERT INTO "Setting" ("id","leagueId","lockUntil","updatedAt")
    VALUES ('setting_demo','league_demo', CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP);
  END IF;
END $$;

-- 6) Predictions become league-scoped
-- To avoid complex backfill, we assign all legacy predictions to demo league.
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;

UPDATE "Prediction" SET "leagueId"='league_demo' WHERE "leagueId" IS NULL;

-- Drop old unique constraint if exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='Prediction_userId_matchId_key'
  ) THEN
    ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_userId_matchId_key";
  END IF;
END $$;

ALTER TABLE "Prediction" ALTER COLUMN "leagueId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Prediction_userId_leagueId_matchId_key" ON "Prediction"("userId","leagueId","matchId");
CREATE INDEX IF NOT EXISTS "Prediction_leagueId_idx" ON "Prediction"("leagueId");

ALTER TABLE "Prediction" ADD CONSTRAINT IF NOT EXISTS "Prediction_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) Auto-create demo membership for existing users
INSERT INTO "LeagueMember" ("id","leagueId","userId","role","status","updatedAt")
SELECT
  'lm_' || u."id",
  'league_demo',
  u."id",
  'MEMBER',
  'APPROVED',
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "LeagueMember" lm WHERE lm."leagueId"='league_demo' AND lm."userId"=u."id"
);
