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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeagueMember_leagueId_fkey') THEN
    ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeagueMember_userId_fkey') THEN
    ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Rule_leagueId_fkey') THEN
    ALTER TABLE "Rule" ADD CONSTRAINT "Rule_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS "Setting" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "lockUntil" TIMESTAMP(3) NOT NULL,
  "isForceLocked" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Setting_leagueId_key" ON "Setting"("leagueId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Setting_leagueId_fkey') THEN
    ALTER TABLE "Setting" ADD CONSTRAINT "Setting_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- 6) Predictions become league-scoped
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;

DO $$ BEGIN
  -- If migrating an existing database with legacy predictions, create a minimal "legacy" league
  -- only when needed to satisfy NOT NULL + FK constraints (no demo data in fresh installs).
  IF EXISTS (SELECT 1 FROM "Prediction" WHERE "leagueId" IS NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM "League" WHERE "id" = 'league_legacy') THEN
      INSERT INTO "League" ("id","name","code","updatedAt")
      VALUES ('league_legacy','Legacy League','LEGACY', CURRENT_TIMESTAMP);
    END IF;

    UPDATE "Prediction" SET "leagueId"='league_legacy' WHERE "leagueId" IS NULL;

    -- Ensure rule/setting for the legacy league
    IF NOT EXISTS (SELECT 1 FROM "Rule" WHERE "leagueId"='league_legacy') THEN
      INSERT INTO "Rule" ("id","leagueId","updatedAt") VALUES ('rule_legacy','league_legacy', CURRENT_TIMESTAMP);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "Setting" WHERE "leagueId"='league_legacy') THEN
      INSERT INTO "Setting" ("id","leagueId","lockUntil","updatedAt")
      VALUES ('setting_legacy','league_legacy', CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP);
    END IF;

    -- Create approved memberships for users that already have predictions, so the app can show their data.
    INSERT INTO "LeagueMember" ("id","leagueId","userId","role","status","updatedAt")
    SELECT
      'lm_legacy_' || p."userId",
      'league_legacy',
      p."userId",
      'MEMBER',
      'APPROVED',
      CURRENT_TIMESTAMP
    FROM (SELECT DISTINCT "userId" FROM "Prediction") p
    WHERE NOT EXISTS (
      SELECT 1 FROM "LeagueMember" lm
      WHERE lm."leagueId"='league_legacy' AND lm."userId"=p."userId"
    );
  END IF;
END $$;




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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Prediction_leagueId_fkey') THEN
    ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

