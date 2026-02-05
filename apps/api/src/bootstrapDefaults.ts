import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";
import { ensureLeagueConfig } from "./services/ensureLeagueConfig.js";
import { ensureMonetizationConfig } from "./lib/monetization.js";

function dt(iso: string) {
  return new Date(iso);
}

async function ensureDemoLeague() {
  const code = "DEMO";
  const existing = await prisma.league.findUnique({ where: { code } });
  if (existing) return existing;
  // Use a deterministic id so other scripts can rely on it (still valid with String PK)
  return prisma.league.create({
    data: {
      id: "league_demo",
      code,
      name: "Demo League",
    },
  });
}

/**
 * Idempotent bootstrap to make the app usable immediately after a fresh DB.
 * This runs at API startup and is safe to run multiple times.
 */
export async function bootstrapDefaults() {
  // If the DB is not reachable yet (e.g., container still starting), just fail silently.
  // The first request that needs data will work after DB becomes available.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return;
  }

  // Super Admin (global)
  await ensureMonetizationConfig();

  const superEmail = "superadmin@example.com";
  const superPassword = "Admin123!";
  const superHash = await bcrypt.hash(superPassword, 10);

  await prisma.user.upsert({
    where: { email: superEmail },
    update: {
      passwordHash: superHash,
      globalRole: "SUPER_ADMIN",
      isActive: true,
      displayName: "Super Admin",
    },
    create: {
      email: superEmail,
      displayName: "Super Admin",
      passwordHash: superHash,
      globalRole: "SUPER_ADMIN",
      isActive: true,
    },
  });

  // Demo league + league admin
  const league = await ensureDemoLeague();
  await ensureLeagueConfig(league.id);

  const adminEmail = "admin@example.com";
  const adminPassword = "Admin123!";
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const leagueAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminHash,
      globalRole: "USER",
      isActive: true,
      displayName: "Admin Lega",
    },
    create: {
      email: adminEmail,
      displayName: "Admin Lega",
      passwordHash: adminHash,
      globalRole: "USER",
      isActive: true,
    },
  });

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
    { email: "paolo@example.com", displayName: "Paolo" },
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

  // Demo matches (only if empty)
  const matchCount = await prisma.match.count();
  if (matchCount === 0) {
    const matches = [
      { group: "A", homeTeam: "Italia", awayTeam: "Germania", kickoffAt: "2026-06-11T19:00:00.000Z" },
      { group: "A", homeTeam: "Brasile", awayTeam: "Giappone", kickoffAt: "2026-06-11T22:00:00.000Z" },
      { group: "A", homeTeam: "Italia", awayTeam: "Giappone", kickoffAt: "2026-06-15T19:00:00.000Z" },
      { group: "A", homeTeam: "Germania", awayTeam: "Brasile", kickoffAt: "2026-06-15T22:00:00.000Z" },
      { group: "A", homeTeam: "Germania", awayTeam: "Giappone", kickoffAt: "2026-06-19T19:00:00.000Z" },
      { group: "A", homeTeam: "Italia", awayTeam: "Brasile", kickoffAt: "2026-06-19T22:00:00.000Z" },

      { group: "B", homeTeam: "Francia", awayTeam: "Spagna", kickoffAt: "2026-06-12T19:00:00.000Z" },
      { group: "B", homeTeam: "Inghilterra", awayTeam: "Argentina", kickoffAt: "2026-06-12T22:00:00.000Z" },
      { group: "B", homeTeam: "Francia", awayTeam: "Argentina", kickoffAt: "2026-06-16T19:00:00.000Z" },
      { group: "B", homeTeam: "Spagna", awayTeam: "Inghilterra", kickoffAt: "2026-06-16T22:00:00.000Z" },
      { group: "B", homeTeam: "Spagna", awayTeam: "Argentina", kickoffAt: "2026-06-20T19:00:00.000Z" },
      { group: "B", homeTeam: "Francia", awayTeam: "Inghilterra", kickoffAt: "2026-06-20T22:00:00.000Z" },
    ];

    for (const m of matches) {
      const externalId = `${m.group}-${m.homeTeam}-${m.awayTeam}-${m.kickoffAt}`;
      await prisma.match.create({
        data: {
          externalId,
          group: m.group,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          kickoffAt: dt(m.kickoffAt),
          status: "NOT_STARTED",
          source: "SEED",
        },
      });
    }
  }
}
