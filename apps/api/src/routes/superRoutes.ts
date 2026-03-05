import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin, AuthedRequest } from "../middleware/authMiddleware.js";
import { ensureMonetizationConfig, getMonetizationConfig } from "../lib/monetization.js";
import { fetchFixtures, searchLeagues } from "../services/apiFootball.js";
import { env } from "../lib/env.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import {
  fetchCompetitionScorers,
  fetchCompetitionTeams,
  fetchCompetitionPlayerOptions,
} from "../services/footballDataService.js";

export const superRouter = Router();

superRouter.use(requireAuth, requireSuperAdmin);

// --- Global competition outcome (winner + top scorer) ---
// This outcome is GLOBAL across all leagues: the SuperAdmin sets it once and it is propagated.
const PutCompetitionOutcomeSchema = z.object({
  winnerTeamId: z.number().int().positive().nullable().optional(),
  winnerTeamName: z.string().trim().min(1).max(200).nullable().optional(),
  topScorerPlayerId: z.number().int().positive().nullable().optional(),
  topScorerPlayerName: z.string().trim().min(1).max(200).nullable().optional(),
  topScorer2PlayerId: z.number().int().positive().nullable().optional(),
  topScorer2PlayerName: z.string().trim().min(1).max(200).nullable().optional(),
});

async function getCompetitionProviderConfig() {
  const ss = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null as any);
  const provider = String(ss?.provider || "FOOTBALL_DATA").toUpperCase();
  const competitionCode = String(ss?.footballDataCompetitionCode || "").trim();
  const season = ss?.footballDataSeason ?? null;
  return { provider, competitionCode, season };
}

superRouter.get("/competition-outcome", async (_req, res) => {
  const { provider, competitionCode, season } = await getCompetitionProviderConfig();
  // Read current "global" outcome from the most recently updated league outcome (if any)
  const latest = await prisma.competitionOutcome.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null as any);

  let teams: any[] = [];
  let scorers: any[] = [];
  if (provider === "FOOTBALL_DATA" && competitionCode) {
    try {
      teams = await fetchCompetitionTeams({ competitionCode });
    } catch {
      teams = [];
    }
    try {
      const resp = await fetchCompetitionScorers({ competitionCode, ...(season ? { season } : {}), limit: 50 });
      scorers = Array.isArray((resp as any)?.scorers) ? (resp as any).scorers : [];
    } catch {
      scorers = [];
    }
    // Fallback: derive players from squads if scorers endpoint is empty (plan limitation)
    if (!scorers.length) {
      try {
        const players = await fetchCompetitionPlayerOptions({ competitionCode });
        scorers = players.map((p) => ({ id: p.id, name: p.name, teamName: p.teamName ?? null, goals: 0 }));
      } catch {
        scorers = [];
      }
    }
  }

  res.json({
    outcome: latest
      ? {
          winner: latest.winnerTeamExternalId
            ? { teamExternalId: latest.winnerTeamExternalId, teamName: latest.winnerTeamName }
            : null,
          topScorer: latest.topScorerPlayerExternalId
            ? { playerExternalId: latest.topScorerPlayerExternalId, playerName: latest.topScorerPlayerName }
            : null,
          topScorer2: latest.topScorer2PlayerExternalId
            ? { playerExternalId: latest.topScorer2PlayerExternalId, playerName: latest.topScorer2PlayerName }
            : null,
          resolvedAt: latest.resolvedAt ? new Date(latest.resolvedAt).toISOString() : null,
        }
      : { winner: null, topScorer: null, topScorer2: null, resolvedAt: null },
    options: {
      teams: teams
        .map((t: any) => ({ id: Number(t.id), name: String(t.shortName || t.name || "").trim(), crest: (t as any).crest ?? null }))
        .filter((t: any) => Number.isFinite(t.id) && t.name),
      scorers: scorers
        .map((s: any) => ({
          id: Number(s?.player?.id ?? s?.id),
          name: String(s?.player?.name ?? s?.name ?? "").trim(),
          teamName: String(s?.team?.name ?? s?.teamName ?? "").trim() || null,
          goals: Number(s?.goals ?? s?.numberOfGoals ?? 0) || 0,
        }))
        .filter((p: any) => Number.isFinite(p.id) && p.name),
    },
  });
});

superRouter.put("/competition-outcome", async (req, res) => {
  const body = PutCompetitionOutcomeSchema.parse(req.body);
  const { provider, competitionCode, season } = await getCompetitionProviderConfig();
  const now = new Date();

  const leagues = await prisma.league.findMany({ select: { id: true } });
  // propagate outcome to ALL leagues
  for (const l of leagues) {
    await prisma.competitionOutcome.upsert({
      where: { leagueId: l.id },
      create: {
        leagueId: l.id,
        provider: provider === "FOOTBALL_DATA" ? "FOOTBALL_DATA" : provider,
        competitionCode: competitionCode || null,
        ...(season ? { season: Number(season) } : {}),
        winnerTeamExternalId: body.winnerTeamId ?? null,
        winnerTeamName: body.winnerTeamName ?? null,
        topScorerPlayerExternalId: body.topScorerPlayerId ?? null,
        topScorerPlayerName: body.topScorerPlayerName ?? null,
        topScorer2PlayerExternalId: body.topScorer2PlayerId ?? null,
        topScorer2PlayerName: body.topScorer2PlayerName ?? null,
        resolvedAt: now,
      },
      update: {
        provider: provider === "FOOTBALL_DATA" ? "FOOTBALL_DATA" : provider,
        competitionCode: competitionCode || null,
        ...(season ? { season: Number(season) } : { season: null }),
        winnerTeamExternalId: body.winnerTeamId ?? null,
        winnerTeamName: body.winnerTeamName ?? null,
        topScorerPlayerExternalId: body.topScorerPlayerId ?? null,
        topScorerPlayerName: body.topScorerPlayerName ?? null,
        topScorer2PlayerExternalId: body.topScorer2PlayerId ?? null,
        topScorer2PlayerName: body.topScorer2PlayerName ?? null,
        resolvedAt: now,
      },
    });
  }

  // Apply awarded points to picks for each league, based on its rules.
  const rules = await prisma.rule.findMany({
    where: {
      OR: [{ enableCompetitionWinner: true }, { enableCompetitionTopScorer: true }],
    },
    select: {
      leagueId: true,
      enableCompetitionWinner: true,
      pointsCompetitionWinner: true,
      enableCompetitionTopScorer: true,
      pointsCompetitionTopScorer: true,
    },
  });

  const winnerId = body.winnerTeamId ?? null;
  const scorer1 = body.topScorerPlayerId ?? null;
  const scorer2 = body.topScorer2PlayerId ?? null;

  for (const r of rules) {
    if (r.enableCompetitionWinner && winnerId) {
      await prisma.competitionPick.updateMany({ where: { leagueId: r.leagueId, type: "WINNER" }, data: { pointsAwarded: 0 } });
      await prisma.competitionPick.updateMany({
        where: { leagueId: r.leagueId, type: "WINNER", teamExternalId: winnerId },
        data: { pointsAwarded: r.pointsCompetitionWinner ?? 15 },
      });
    }

    if (r.enableCompetitionTopScorer && (scorer1 || scorer2)) {
      await prisma.competitionPick.updateMany({ where: { leagueId: r.leagueId, type: "TOP_SCORER" }, data: { pointsAwarded: 0 } });
      const ids = [scorer1, scorer2].filter((x) => typeof x === "number" && Number.isFinite(x)) as number[];
      if (ids.length) {
        await prisma.competitionPick.updateMany({
          where: { leagueId: r.leagueId, type: "TOP_SCORER", playerExternalId: { in: ids } },
          data: { pointsAwarded: r.pointsCompetitionTopScorer ?? 12 },
        });
      }
    }
  }

  // Recalc leaderboards (competition pick points affect totals)
  for (const l of leagues) {
    await recalcAllScoresForLeague(l.id);
  }

  res.json({ ok: true });
});

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
      apiFootballKeyPresent: !!env.API_FOOTBALL_KEY?.trim(),
    },
  });
});

const ExternalConfigSchema = z.object({
  provider: z.enum(["FOOTBALL_DATA", "API_FOOTBALL"]).optional(),
  apiFootballLeagueId: z.number().int().positive().nullable().optional(),
  apiFootballSeason: z.number().int().min(2000).max(2100).nullable().optional(),
  apiFootballTimezone: z.string().min(1).nullable().optional(),
});

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
    },
  });
  res.json({
    config: {
      provider: updated.provider,
      apiFootballLeagueId: updated.apiFootballLeagueId ?? null,
      apiFootballSeason: updated.apiFootballSeason ?? null,
      apiFootballTimezone: updated.apiFootballTimezone || "Europe/Rome",
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
