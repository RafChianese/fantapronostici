-- CreateTable
CREATE TABLE "SuperSetting" (
    "id" TEXT NOT NULL,
    "adsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "demoAdsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "unlockMinutes" INTEGER NOT NULL DEFAULT 5,

    "provider" TEXT NOT NULL DEFAULT 'FOOTBALL_DATA',
    "apiFootballLeagueId" INTEGER,
    "apiFootballSeason" INTEGER,
    "apiFootballTimezone" TEXT DEFAULT 'Europe/Rome',

    "footballDataCompetitionCode" TEXT,
    "footballDataSeason" INTEGER,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUnlockLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "AdUnlockLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdUnlock_userId_key" ON "AdUnlock"("userId");

-- CreateIndex
CREATE INDEX "AdUnlock_userId_idx" ON "AdUnlock"("userId");

-- CreateIndex
CREATE INDEX "AdUnlockLog_userId_idx" ON "AdUnlockLog"("userId");

-- CreateIndex
CREATE INDEX "AdUnlockLog_createdAt_idx" ON "AdUnlockLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdUnlock" ADD CONSTRAINT "AdUnlock_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUnlockLog" ADD CONSTRAINT "AdUnlockLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
