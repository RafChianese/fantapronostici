-- CreateEnum
CREATE TYPE "CompetitionPickType" AS ENUM ('WINNER', 'TOP_SCORER');

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "enableCompetitionWinner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "pointsCompetitionWinner" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "enableCompetitionTopScorer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "pointsCompetitionTopScorer" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "competitionPredictionsDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetitionPick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "type" "CompetitionPickType" NOT NULL,
    "teamExternalId" INTEGER,
    "teamName" TEXT,
    "playerExternalId" INTEGER,
    "playerName" TEXT,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetitionOutcome" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOOTBALL_DATA',
    "competitionCode" TEXT,
    "season" INTEGER,
    "winnerTeamExternalId" INTEGER,
    "winnerTeamName" TEXT,
    "topScorerPlayerExternalId" INTEGER,
    "topScorerPlayerName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionPick_userId_leagueId_type_key" ON "CompetitionPick"("userId", "leagueId", "type");
CREATE INDEX IF NOT EXISTS "CompetitionPick_leagueId_idx" ON "CompetitionPick"("leagueId");
CREATE INDEX IF NOT EXISTS "CompetitionPick_userId_idx" ON "CompetitionPick"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionOutcome_leagueId_key" ON "CompetitionOutcome"("leagueId");

-- AddForeignKey
ALTER TABLE "CompetitionPick" ADD CONSTRAINT IF NOT EXISTS "CompetitionPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPick" ADD CONSTRAINT IF NOT EXISTS "CompetitionPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionOutcome" ADD CONSTRAINT IF NOT EXISTS "CompetitionOutcome_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
