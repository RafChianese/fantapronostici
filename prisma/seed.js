import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function wipeAll() {
  // Order matters due to FK constraints
  await prisma.passwordResetToken.deleteMany({});
  await prisma.adUnlockLog.deleteMany({});
  await prisma.adUnlock.deleteMany({});
  await prisma.matchdayAward.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.leagueMember.deleteMany({});
  await prisma.rule.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.league.deleteMany({});
}

async function main() {
  // Clean slate
  await wipeAll();

  // SuperSetting (global defaults)
  await prisma.superSetting.upsert({
    where: { id: "supersetting_default" },
    update: {},
    create: {
      id: "supersetting_default",
      adsEnabled: false,
      demoAdsEnabled: true,
      unlockMinutes: 5,
      provider: "FOOTBALL_DATA",
      apiFootballLeagueId: null,
      apiFootballSeason: null,
      apiFootballTimezone: "Europe/Rome",
      footballDataCompetitionCode: null,
      footballDataSeason: null,
    },
  });

  // Only Super Admin user
  const superEmail = "superadmin@example.com";
  const superPassword = "Admin123!";
  const superHash = await bcrypt.hash(superPassword, 10);

  await prisma.user.upsert({
    where: { email: superEmail },
    update: { passwordHash: superHash, globalRole: "SUPER_ADMIN", isActive: true, displayName: "Super Admin" },
    create: { email: superEmail, displayName: "Super Admin", passwordHash: superHash, globalRole: "SUPER_ADMIN", isActive: true },
  });

  console.log("Seed completed.");
  console.log("SuperAdmin:", superEmail, "/", superPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
