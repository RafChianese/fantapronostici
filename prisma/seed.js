import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function dt(iso) { return new Date(iso); }

async function ensureLeagueCode(code) {
  const up = code.toUpperCase();
  const existing = await prisma.league.findUnique({ where: { code: up } });
  if (existing) return existing;
  return prisma.league.create({ data: { id: "league_demo", name: "Demo League", code: up } });
}

async function main() {
  const now = new Date();
  const defaultLockUntil = dt("2026-06-10T18:00:00.000Z"); // demo: can be changed by league admin

  // Super Admin (global)
  const superEmail = "superadmin@example.com";
  const superPassword = "Admin123!";
  const superHash = await bcrypt.hash(superPassword, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: { passwordHash: superHash, globalRole: "SUPER_ADMIN", isActive: true, displayName: "Super Admin" },
    create: { email: superEmail, displayName: "Super Admin", passwordHash: superHash, globalRole: "SUPER_ADMIN", isActive: true },
  });

  // Demo league + league admin
  const league = await ensureLeagueCode("DEMO");

  // Ensure SuperAdmin is a member of the demo league so league-scoped pages work out of the box.
  await prisma.leagueMember.upsert({
    where: { leagueId_userId: { leagueId: league.id, userId: superAdmin.id } },
    update: { role: "ADMIN", status: "APPROVED" },
    create: { leagueId: league.id, userId: superAdmin.id, role: "ADMIN", status: "APPROVED" },
  });

  const adminEmail = "admin@example.com";
  const adminPassword = "Admin123!";
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const leagueAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, globalRole: "USER", isActive: true, displayName: "Admin Lega" },
    create: { email: adminEmail, displayName: "Admin Lega", passwordHash: adminHash, globalRole: "USER", isActive: true },
  });

  // League-scoped rule + setting
  await prisma.rule.upsert({
    where: { leagueId: league.id },
    update: {},
    create: {
      leagueId: league.id,
      pointsExact: 4,
      pointsOutcome: 2,
      pointsSumGoals: 1,
      enableUnderOver25: false,
      pointsUnderOver25: 1,
      enableMatchdayAwards: false,
      scoringMode: "CUMULATIVE",
      allowOutcomeWithExact: true,
      allowSumGoalsWithExact: true,
      allowSumGoalsWithOutcome: true,
    },
  });

  await prisma.setting.upsert({
    where: { leagueId: league.id },
    update: {},
    create: { leagueId: league.id, lockUntil: defaultLockUntil, isForceLocked: false },
  });

  // Membership for league admin
  await prisma.leagueMember.upsert({
    where: { leagueId_userId: { leagueId: league.id, userId: leagueAdmin.id } },
    update: { role: "ADMIN", status: "APPROVED" },
    create: { leagueId: league.id, userId: leagueAdmin.id, role: "ADMIN", status: "APPROVED" },
  });

  // Demo users
  const demoUsers = [
    { email: "mario@example.com", displayName: "Mario" },
    { email: "luisa@example.com", displayName: "Luisa" },
    { email: "giulia@example.com", displayName: "Giulia" },
    { email: "paolo@example.com", displayName: "Paola" },
    { email: "sara@example.com", displayName: "Sara" },
  ];

  for (const u of demoUsers) {
    const hash = await bcrypt.hash("Demo123!", 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, globalRole: "USER", isActive: true, displayName: u.displayName },
      create: { email: u.email, displayName: u.displayName, passwordHash: hash, globalRole: "USER", isActive: true },
    });

    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
      update: { role: "MEMBER", status: "APPROVED" },
      create: { leagueId: league.id, userId: user.id, role: "MEMBER", status: "APPROVED" },
    });
  }

  // Matches (demo dataset - 3 matchdays x 4 matches)
  // Ensure a stable mock dataset on every seed run.
  // IMPORTANT: wipe matches regardless of source (SEED/API/MANUAL)
  // so dev databases that previously synced matches don't end up with
  // extra matches all defaulting to matchday=1.
  await prisma.prediction.deleteMany({});
  await prisma.matchdayAward.deleteMany({});
  await prisma.match.deleteMany({});

  // Global SuperSetting (external provider)
  // Matches are imported only via SuperAdmin workflow (API-Football).
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

  console.log("Seed completed.");
  console.log("SuperAdmin:", superEmail, "/", superPassword);
  console.log("League Admin:", adminEmail, "/", adminPassword, "League code:", league.code);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
