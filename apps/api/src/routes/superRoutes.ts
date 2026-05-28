import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin, AuthedRequest } from "../middleware/authMiddleware.js";
import { ensureMonetizationConfig, getMonetizationConfig } from "../lib/monetization.js";
import { fetchFixtures, searchLeagues } from "../services/apiFootball.js";
import { env } from "../lib/env.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";

export const superRouter = Router();

superRouter.use(requireAuth, requireSuperAdmin);

// --- Monetization (Rewarded Ads) ---
superRouter.get("/monetization", async (_req, res) => {
  await ensureMonetizationConfig();
  const cfg = await getMonetizationConfig();
  res.json({ config: cfg });
});

const MonetizationSchema = z.object({
  adsEnabled: z.boolean().optional(),
  demoAdsEnabled: z.boolean().optional(),
  unlockMinutes: z.number().int().min(1).max(120).optional(),
});

superRouter.put("/monetization", async (req, res) => {
  await ensureMonetizationConfig();
  const patch = MonetizationSchema.parse(req.body);
  const existing = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  const updated = await prisma.superSetting.update({
    where: { id: existing!.id },
    data: {
      ...(typeof patch.adsEnabled === "boolean" ? { adsEnabled: patch.adsEnabled } : {}),
      ...(typeof patch.demoAdsEnabled === "boolean" ? { demoAdsEnabled: patch.demoAdsEnabled } : {}),
      ...(typeof patch.unlockMinutes === "number" ? { unlockMinutes: patch.unlockMinutes } : {}),
    },
  });
  res.json({ config: { adsEnabled: updated.adsEnabled, demoAdsEnabled: updated.demoAdsEnabled, unlockMinutes: updated.unlockMinutes } });
});

superRouter.get("/monetization/stats", async (_req, res) => {
  const totalUnlocks = await prisma.adUnlockLog.count();
  const uniqueUsers = await prisma.adUnlockLog.findMany({ distinct: ["userId"], select: { userId: true } });
  const last = await prisma.adUnlockLog.findMany({
    take: 25,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });

  // average minutes
  const avg = await prisma.adUnlockLog.aggregate({ _avg: { minutes: true } });
  res.json({
    totalUnlocks,
    uniqueUsers: uniqueUsers.length,
    avgMinutes: avg._avg.minutes ?? null,
    last,
  });
});

// --- External provider configuration (football data source) ---
superRouter.get("/external-config", async (_req, res) => {
  await ensureMonetizationConfig();
  const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  res.json({
    config: {
      provider: row?.provider || "FOOTBALL_DATA",
      apiFootballLeagueId: row?.apiFootballLeagueId ?? null,
      apiFootballSeason: row?.apiFootballSeason ?? null,
      apiFootballTimezone: row?.apiFootballTimezone || "Europe/Rome",
      predictionWindowStart: row?.predictionWindowStart ?? null,
      predictionWindowEnd: row?.predictionWindowEnd ?? null,
      apiFootballKeyPresent: !!env.API_FOOTBALL_KEY?.trim(),
    },
  });
});

const ExternalConfigSchema = z.object({
  provider: z.enum(["FOOTBALL_DATA", "API_FOOTBALL"]).optional(),
  apiFootballLeagueId: z.number().int().positive().nullable().optional(),
  apiFootballSeason: z.number().int().min(2000).max(2100).nullable().optional(),
  apiFootballTimezone: z.string().min(1).nullable().optional(),
  predictionWindowStart: z.string().datetime().nullable().optional(),
  predictionWindowEnd: z.string().datetime().nullable().optional(),
}).refine((v) => {
  if (!v.predictionWindowStart || !v.predictionWindowEnd) return true;
  return new Date(v.predictionWindowStart).getTime() <= new Date(v.predictionWindowEnd).getTime();
}, { message: "La data inizio deve essere precedente o uguale alla data fine" });

superRouter.put("/external-config", async (req, res) => {
  await ensureMonetizationConfig();
  const patch = ExternalConfigSchema.parse(req.body);
  const existing = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  const updated = await prisma.superSetting.update({
    where: { id: existing!.id },
    data: {
      ...(patch.provider ? { provider: patch.provider } : {}),
      ...(patch.apiFootballLeagueId !== undefined ? { apiFootballLeagueId: patch.apiFootballLeagueId } : {}),
      ...(patch.apiFootballSeason !== undefined ? { apiFootballSeason: patch.apiFootballSeason } : {}),
      ...(patch.apiFootballTimezone !== undefined ? { apiFootballTimezone: patch.apiFootballTimezone } : {}),
      ...(patch.predictionWindowStart !== undefined ? { predictionWindowStart: patch.predictionWindowStart ? new Date(patch.predictionWindowStart) : null } : {}),
      ...(patch.predictionWindowEnd !== undefined ? { predictionWindowEnd: patch.predictionWindowEnd ? new Date(patch.predictionWindowEnd) : null } : {}),
    },
  });
  res.json({
    config: {
      provider: updated.provider,
      apiFootballLeagueId: updated.apiFootballLeagueId ?? null,
      apiFootballSeason: updated.apiFootballSeason ?? null,
      apiFootballTimezone: updated.apiFootballTimezone || "Europe/Rome",
      predictionWindowStart: updated.predictionWindowStart ?? null,
      predictionWindowEnd: updated.predictionWindowEnd ?? null,
      apiFootballKeyPresent: !!env.API_FOOTBALL_KEY?.trim(),
    },
  });
});

// Proxy search leagues (API-Football) for SuperAdmin UI
superRouter.get("/external/leagues", async (req, res) => {
  const q = String(req.query.search || "").trim();
  const season = req.query.season ? Number(req.query.season) : undefined;
  if (!q) return res.json({ leagues: [] });
  if (!env.API_FOOTBALL_KEY?.trim()) return res.status(400).json({ message: "API_FOOTBALL_KEY mancante in .env" });
  const r = await searchLeagues(q, season);
  const leagues = r.map((x) => ({
    id: x.league.id,
    name: x.league.name,
    country: x.country.name,
    seasons: x.seasons.map((s) => ({ year: s.year, current: !!s.current })),
  }));
  res.json({ leagues });
});

// Import fixtures as "pronosticabili" (clears current matches + predictions)
superRouter.post("/external/import-fixtures", async (_req, res) => {
  await ensureMonetizationConfig();
  const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  const provider = (row?.provider || "FOOTBALL_DATA").toUpperCase();

  if (provider !== "API_FOOTBALL") {
    return res.status(400).json({ message: "Provider non supportato per import fixtures (usa API_FOOTBALL)" });
  }
  if (!env.API_FOOTBALL_KEY?.trim()) return res.status(400).json({ message: "API_FOOTBALL_KEY mancante in .env" });
  const leagueId = row?.apiFootballLeagueId ?? null;
  const season = row?.apiFootballSeason ?? null;
  const tz = row?.apiFootballTimezone || "Europe/Rome";
  if (!leagueId || !season) return res.status(400).json({ message: "Config incompleta: apiFootballLeagueId/apiFootballSeason" });

  const fixtures = await fetchFixtures({ leagueId, season, timezone: tz });

  // Reset DB: matches + predictions + awards (global)
  await prisma.$transaction([
    prisma.matchdayAward.deleteMany({}),
    prisma.prediction.deleteMany({}),
    prisma.match.deleteMany({}),
  ]);

  // Insert fixtures
  for (const f of fixtures) {
    const externalId = `af:${f.fixture.id}`;
    await prisma.match.create({
      data: {
        externalId,
        group: f.league?.name ? String(f.league.name).slice(0, 20) : "LEAGUE",
        matchday: Number((f.league.round || "").match(/(\d{1,2})\s*$/)?.[1] || 1),
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        kickoffAt: new Date(f.fixture.date),
        status: "NOT_STARTED",
        homeScore: null,
        awayScore: null,
        source: "API_FOOTBALL",
        apiFootballFixtureId: f.fixture.id,
        apiLeagueId: leagueId,
        apiSeason: season,
        apiRound: f.league.round ?? null,
      },
    });
  }

  // Recalc for each league (points stay 0 until predictions exist)
  const allLeagues = await prisma.league.findMany({ select: { id: true } });
  for (const l of allLeagues) {
    await recalcAllScoresForLeague(l.id);
  }

  res.json({ ok: true, count: fixtures.length });
});

// Import fixtures (clears existing matches + predictions) based on configured provider
superRouter.post("/external/import", async (_req, res) => {
  await ensureMonetizationConfig();
  const s = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  const provider = (s?.provider || "FOOTBALL_DATA").toUpperCase();

  if (provider !== "API_FOOTBALL") {
    return res.status(400).json({ message: "Import supportato solo per provider API_FOOTBALL" });
  }
  if (!env.API_FOOTBALL_KEY?.trim()) {
    return res.status(400).json({ message: "API_FOOTBALL_KEY mancante in .env" });
  }
  if (!s?.apiFootballLeagueId || !s?.apiFootballSeason) {
    return res.status(400).json({ message: "Config incompleta: apiFootballLeagueId/apiFootballSeason" });
  }

  const fixtures = await fetchFixtures({
    leagueId: s.apiFootballLeagueId,
    season: s.apiFootballSeason,
    timezone: s.apiFootballTimezone || "Europe/Rome",
  });

  // Reset all game data (global) to avoid mixing competitions
  await prisma.$transaction([
    prisma.matchdayAward.deleteMany({}),
    prisma.prediction.deleteMany({}),
    prisma.match.deleteMany({}),
  ]);

  for (const row of fixtures) {
    await prisma.match.create({
      data: {
        externalId: `af:${row.fixture.id}`,
        group: row.league?.name ? String(row.league.name).slice(0, 20) : "API",
        matchday: row.league?.round ? Number(String(row.league.round).match(/(\d{1,2})\s*$/)?.[1] || 1) : 1,
        homeTeam: row.teams.home.name,
        awayTeam: row.teams.away.name,
        kickoffAt: new Date(row.fixture.date),
        status: row.fixture.status.short === "FT" ? "FINISHED" : row.fixture.status.short === "NS" ? "NOT_STARTED" : "IN_PROGRESS",
        homeScore: row.goals.home,
        awayScore: row.goals.away,
        source: "API_FOOTBALL",
        apiFootballFixtureId: row.fixture.id,
        apiLeagueId: s.apiFootballLeagueId,
        apiSeason: s.apiFootballSeason,
        apiRound: row.league?.round ?? null,
      },
    });
  }

  // Recalc points for every league (if any)
  const leagues = await prisma.league.findMany({ select: { id: true } });
  for (const l of leagues) {
    await recalcAllScoresForLeague(l.id);
  }

  res.json({ ok: true, imported: fixtures.length });
});

superRouter.get("/leagues", async (_req, res) => {
  const leagues = await prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: true } },
    },
  });
  res.json({ leagues });
});

superRouter.get("/leagues/:id", async (req, res) => {
  const league = await prisma.league.findUnique({
    where: { id: req.params.id },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "desc" } },
      rules: true,
      settings: true,
    },
  });
  if (!league) return res.status(404).json({ message: "Not found" });
  res.json({ league });
});

const PatchMemberSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

superRouter.patch("/leagues/:leagueId/members/:memberId", async (req: AuthedRequest, res) => {
  const { status, role } = PatchMemberSchema.parse(req.body);
  const member = await prisma.leagueMember.findFirst({
    where: { id: req.params.memberId, leagueId: req.params.leagueId },
  });
  if (!member) return res.status(404).json({ message: "Not found" });

  const updated = await prisma.leagueMember.update({
    where: { id: member.id },
    data: { ...(status ? { status } : {}), ...(role ? { role } : {}) },
  });
  res.json({ member: updated });
});

const PatchUserSchema = z.object({
  isActive: z.boolean().optional(),
  globalRole: z.enum(["USER", "SUPER_ADMIN"]).optional(),
});

superRouter.patch("/users/:id", async (req, res) => {
  const { isActive, globalRole } = PatchUserSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: "Not found" });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ...(typeof isActive === "boolean" ? { isActive } : {}), ...(globalRole ? { globalRole } : {}) },
  });
  res.json({ user: { id: updated.id, email: updated.email, displayName: updated.displayName, globalRole: updated.globalRole, isActive: updated.isActive } });
});
