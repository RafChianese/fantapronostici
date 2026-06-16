import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { requireAuth, requireLeagueMember, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";
import { assertPredictionsEditableForMatches, getLockInfo } from "../lib/lock.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { getMonetizationConfig } from "../lib/monetization.js";
import {
  fetchCompetitionScorers,
  fetchCompetitionTeams,
  fetchCompetitionPlayerOptions,
} from "../services/footballDataService.js";
import { fetchFixtureEvents, fetchFixtureLineups, fetchFixturesRange } from "../services/apiFootball.js";
import { AvatarPresetIdSchema } from "../lib/avatarPresets.js";
import { assertPredictableMatches, getPredictionWindow, isPredictableMatch, isPlaceholderMatch } from "../lib/predictableMatches.js";

function normTeamName(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(fc|cf|calcio|football|club)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function resolveFixtureIdForMatch(match: any): Promise<{ fixtureId: number | null; round?: string | null; leagueId?: number | null; season?: number | null }> {
  // Already present
  if (match?.apiFootballFixtureId) {
    return { fixtureId: Number(match.apiFootballFixtureId), round: match.apiRound ?? null, leagueId: match.apiLeagueId ?? null, season: match.apiSeason ?? null };
  }
  // Need API key + super settings
  if (!env.API_FOOTBALL_KEY?.trim()) return { fixtureId: null };
  const ss = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null as any);
  const leagueId = ss?.apiFootballLeagueId ?? null;
  const season = ss?.apiFootballSeason ?? null;
  const tz = ss?.apiFootballTimezone || "Europe/Rome";
  if (!leagueId || !season) return { fixtureId: null };

  // Query fixtures in a tight date window around kickoff (same day ±1)
  const kickoff = new Date(match.kickoffAt);
  const day = kickoff.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const d0 = new Date(kickoff);
  d0.setUTCDate(d0.getUTCDate() - 1);
  const d1 = new Date(kickoff);
  d1.setUTCDate(d1.getUTCDate() + 1);
  const from = d0.toISOString().slice(0, 10);
  const to = d1.toISOString().slice(0, 10);

  const rows = await fetchFixturesRange({ leagueId, season, timezone: tz, from, to }).catch(() => [] as any[]);
  if (!rows.length) return { fixtureId: null };

  const hn = normTeamName(match.homeTeam);
  const an = normTeamName(match.awayTeam);

  // Pick best candidate: name match + closest kickoff time
  let best: any = null;
  let bestScore = Infinity;
  for (const r of rows) {
    const rh = normTeamName(r?.teams?.home?.name);
    const ra = normTeamName(r?.teams?.away?.name);
    if (!rh || !ra) continue;
    const namesOk = rh === hn && ra === an;
    if (!namesOk) continue;
    const k = new Date(r?.fixture?.date);
    const diff = Math.abs(k.getTime() - kickoff.getTime());
    if (diff < bestScore) {
      bestScore = diff;
      best = r;
    }
  }

  if (!best?.fixture?.id) return { fixtureId: null };
  return { fixtureId: Number(best.fixture.id), round: best?.league?.round ?? null, leagueId, season };
}

export const meRouter = Router();




meRouter.get("/calendar", requireAuth, requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

  await ensureLeagueConfig(leagueId);

  const [rules, rawMatches, members, jollyRows] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.match.findMany({
      orderBy: [{ kickoffAt: "asc" }],
      select: {
        id: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
        homeLogo: true,
        awayLogo: true,
        kickoffAt: true,
        status: true,
        homeScore: true,
        awayScore: true,
      },
    }),
    prisma.leagueMember.findMany({
      where: { leagueId, status: "APPROVED" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.matchdayJolly.findMany({ where: { leagueId }, select: { matchId: true } }),
  ]);

  if (!rules) return res.status(500).json({ message: "Missing rules for league" });

  const matchesBase = rawMatches.filter((match) => !isPlaceholderMatch(match as any));
  const matchIds = matchesBase.map((m) => m.id);
  const predictions = matchIds.length
    ? await prisma.prediction.findMany({ where: { leagueId, matchId: { in: matchIds } } })
    : [];

  const predByUserMatch = new Map<string, any>();
  for (const p of predictions) predByUserMatch.set(`${p.userId}:${p.matchId}`, p);

  const jollySet = new Set(jollyRows.map((r) => String(r.matchId)));
  const now = Date.now();
  const matches = matchesBase.map((match) => {
    const status = String(match.status || "NOT_STARTED") as "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
    const kickoffTs = new Date(match.kickoffAt).getTime();
    const derivedStatus = status === "FINISHED" || status === "IN_PROGRESS" || status === "NOT_STARTED"
      ? status
      : Number.isFinite(kickoffTs) && kickoffTs <= now
      ? "IN_PROGRESS"
      : "NOT_STARTED";
    const isJolly = jollySet.has(String(match.id));
    const participants = members.map((m) => {
      const prediction = predByUserMatch.get(`${m.userId}:${match.id}`) || null;
      let points = 0;
      let breakdown = { exact: 0, outcome: 0, sumGoals: 0, underOver: 0 };
      let isExactLive = false;

      if (prediction && derivedStatus === "IN_PROGRESS" && match.homeScore !== null && match.awayScore !== null) {
        const live = computeLivePointsForPrediction(prediction, match, rules, isJolly);
        points = Number(live.totalPoints || 0);
        breakdown = {
          exact: Number(live.pointsExact || 0),
          outcome: Number(live.pointsOutcome || 0),
          sumGoals: Number(live.pointsSumGoals || 0),
          underOver: Number(live.pointsUnderOver || 0),
        };
        isExactLive = !!live.isExact;
      } else if (prediction && derivedStatus === "FINISHED") {
        points = Number(prediction.totalPoints ?? 0);
        breakdown = {
          exact: Number(prediction.pointsExact ?? 0),
          outcome: Number(prediction.pointsOutcome ?? 0),
          sumGoals: Number(prediction.pointsSumGoals ?? 0),
          underOver: Number(prediction.pointsUnderOver ?? 0),
        };
      }

      return {
        userId: m.user.id,
        displayName: m.user.displayName,
        avatarId: (m.user as any).avatarId ?? null,
        avatarJson: (m.user as any).avatarJson ?? null,
        prediction: prediction ? { homeGoals: prediction.homeGoals, awayGoals: prediction.awayGoals } : null,
        points,
        breakdown,
        isExactLive,
      };
    });

    participants.sort((a, b) => {
      if (a.isExactLive !== b.isExactLive) return a.isExactLive ? -1 : 1;
      if (Number(b.points) !== Number(a.points)) return Number(b.points) - Number(a.points);
      return String(a.displayName).localeCompare(String(b.displayName));
    });

    return {
      ...match,
      status: derivedStatus,
      isJolly,
      participants,
      exactLiveCount: participants.filter((p) => p.isExactLive).length,
    };
  });

  res.json({ matches });
});

meRouter.get("/live", requireAuth, requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

  await ensureLeagueConfig(leagueId);

  const [rules, liveMatches, members, jollyRows, allLeaguePredictions, competitionPoints, monetization] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.match.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: [{ kickoffAt: "asc" }],
      select: {
        id: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
        homeLogo: true,
        awayLogo: true,
        kickoffAt: true,
        status: true,
        homeScore: true,
        awayScore: true,
      },
    }),
    prisma.leagueMember.findMany({
      where: { leagueId, status: "APPROVED" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.matchdayJolly.findMany({ where: { leagueId }, select: { matchId: true } }),
    prisma.prediction.findMany({ where: { leagueId }, select: { userId: true, totalPoints: true } }),
    prisma.competitionPick.groupBy({
      by: ["userId"],
      where: { leagueId },
      _sum: { pointsAwarded: true },
    }),
    prisma.leagueMonetization.findUnique({ where: { leagueId }, include: { prizes: true } }),
  ]);

  if (!rules) return res.status(500).json({ message: "Missing rules for league" });

  const matchIds = liveMatches.map((m) => m.id);
  const predictions = matchIds.length
    ? await prisma.prediction.findMany({ where: { leagueId, matchId: { in: matchIds } } })
    : [];

  const predByUserMatch = new Map<string, any>();
  for (const p of predictions) predByUserMatch.set(`${p.userId}:${p.matchId}`, p);

  const jollySet = new Set(jollyRows.map((r) => String(r.matchId)));
  const livePointsByUser = new Map<string, number>();
  const storedLivePointsByUser = new Map<string, number>();

  const matches = liveMatches.map((match) => {
    const isJolly = jollySet.has(String(match.id));
    const participants = members.map((m) => {
      const prediction = predByUserMatch.get(`${m.userId}:${match.id}`) || null;
      const live = computeLivePointsForPrediction(prediction, match, rules, isJolly);
      livePointsByUser.set(m.user.id, (livePointsByUser.get(m.user.id) || 0) + Number(live.totalPoints || 0));
      storedLivePointsByUser.set(m.user.id, (storedLivePointsByUser.get(m.user.id) || 0) + Number(prediction?.totalPoints ?? 0));
      return {
        userId: m.user.id,
        displayName: m.user.displayName,
        avatarId: (m.user as any).avatarId ?? null,
        avatarJson: (m.user as any).avatarJson ?? null,
        prediction: prediction ? { homeGoals: prediction.homeGoals, awayGoals: prediction.awayGoals } : null,
        livePoints: live.totalPoints,
        liveBreakdown: {
          exact: live.pointsExact,
          outcome: live.pointsOutcome,
          sumGoals: live.pointsSumGoals,
          underOver: live.pointsUnderOver,
        },
        isExactLive: live.isExact,
      };
    });

    participants.sort((a, b) => {
      if (a.isExactLive !== b.isExactLive) return a.isExactLive ? -1 : 1;
      if (Number(b.livePoints) !== Number(a.livePoints)) return Number(b.livePoints) - Number(a.livePoints);
      return String(a.displayName).localeCompare(String(b.displayName));
    });

    return {
      ...match,
      isJolly,
      participants,
      exactLiveCount: participants.filter((p) => p.isExactLive).length,
    };
  });

  const officialTotalsByUser = new Map<string, number>();
  for (const p of allLeaguePredictions as any[]) {
    officialTotalsByUser.set(String(p.userId), (officialTotalsByUser.get(String(p.userId)) || 0) + Number(p.totalPoints ?? 0));
  }
  for (const row of competitionPoints as any[]) {
    const userId = String(row.userId);
    officialTotalsByUser.set(userId, (officialTotalsByUser.get(userId) || 0) + Number(row._sum?.pointsAwarded ?? 0));
  }

  const officialRows = members
    .map((m) => ({ userId: m.user.id, totalPoints: officialTotalsByUser.get(m.user.id) || 0, displayName: m.user.displayName }))
    .sort((a, b) => b.totalPoints - a.totalPoints || String(a.displayName).localeCompare(String(b.displayName)));
  const officialRankByUser = new Map<string, number>();
  officialRows.forEach((row, index) => officialRankByUser.set(row.userId, index + 1));

  const liveLeaderboard = members
    .map((m) => {
      const officialPoints = officialTotalsByUser.get(m.user.id) || 0;
      const livePoints = livePointsByUser.get(m.user.id) || 0;
      const storedLivePoints = storedLivePointsByUser.get(m.user.id) || 0;
      const liveDelta = livePoints - storedLivePoints;
      return {
        userId: m.user.id,
        displayName: m.user.displayName,
        avatarId: (m.user as any).avatarId ?? null,
        avatarJson: (m.user as any).avatarJson ?? null,
        officialPoints,
        liveDelta,
        liveTotalPoints: officialPoints + liveDelta,
        officialRank: officialRankByUser.get(m.user.id) ?? null,
      };
    })
    .sort((a, b) => {
      if (b.liveTotalPoints !== a.liveTotalPoints) return b.liveTotalPoints - a.liveTotalPoints;
      return String(a.displayName).localeCompare(String(b.displayName));
    })
    .map((row, index) => ({
      ...row,
      liveRank: index + 1,
      rankDelta: row.officialRank ? row.officialRank - (index + 1) : 0,
    }));

  const prizeCount = Array.isArray((monetization as any)?.prizes) && (monetization as any).prizes.length > 0 ? (monetization as any).prizes.length : 3;

  res.json({ matches, liveLeaderboard, prizeCount });
});

function decimalNumber(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}


function outcomeLive(home: number, away: number): "H" | "D" | "A" {
  if (home > away) return "H";
  if (home < away) return "A";
  return "D";
}

function computeAdjustedLivePoints(params: {
  mode: any;
  pointsExact: number;
  pointsOutcome: number;
  pointsSumGoals: number;
  pointsUnderOver: number;
  allowOutcomeWithExact: boolean;
  allowSumGoalsWithExact: boolean;
  allowSumGoalsWithOutcome: boolean;
  allowUnderOverWithExact?: boolean;
  allowUnderOverWithOutcome?: boolean;
  allowUnderOverWithSumGoals?: boolean;
}) {
  let ex = params.pointsExact;
  let out = params.pointsOutcome;
  let sum = params.pointsSumGoals;
  let uo = params.pointsUnderOver;

  if (params.mode === "CUMULATIVE") {
    return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
  }

  if (params.mode === "BEST_ONLY") {
    const max = Math.max(ex, out, sum, uo);
    if (max <= 0) return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
    if (ex === max) return { pointsExact: ex, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: ex };
    if (out === max) return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: out };
    if (sum === max) return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: 0, totalPoints: sum };
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
  }

  const uoWithExact = params.allowUnderOverWithExact ?? true;
  const uoWithOutcome = params.allowUnderOverWithOutcome ?? true;
  const uoWithSum = params.allowUnderOverWithSumGoals ?? true;

  if (ex > 0) {
    out = out > 0 && params.allowOutcomeWithExact ? out : 0;
    sum = sum > 0 && params.allowSumGoalsWithExact ? sum : 0;
    uo = uo > 0 && uoWithExact ? uo : 0;
    return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
  }
  if (out > 0) {
    sum = sum > 0 && params.allowSumGoalsWithOutcome ? sum : 0;
    uo = uo > 0 && uoWithOutcome ? uo : 0;
    return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: out + sum + uo };
  }
  if (sum > 0) {
    uo = uo > 0 && uoWithSum ? uo : 0;
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: sum + uo };
  }
  if (uo > 0) return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
  return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
}

function computeLivePointsForPrediction(prediction: { homeGoals: number; awayGoals: number } | null, match: any, rules: any, isJolly: boolean) {
  if (!prediction || match.homeScore === null || match.homeScore === undefined || match.awayScore === null || match.awayScore === undefined) {
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0, isExact: false };
  }

  const ph = Number(prediction.homeGoals);
  const pa = Number(prediction.awayGoals);
  const rh = Number(match.homeScore);
  const ra = Number(match.awayScore);

  let pointsExact = ph === rh && pa === ra ? decimalNumber(rules.pointsExact) : 0;
  let pointsOutcome = outcomeLive(ph, pa) === outcomeLive(rh, ra) ? decimalNumber(rules.pointsOutcome) : 0;
  let pointsSumGoals = ph + pa === rh + ra ? decimalNumber(rules.pointsSumGoals) : 0;
  let pointsUnderOver = 0;

  if (rules.enableUnderOver25) {
    const predOver = ph + pa > 2;
    const realOver = rh + ra > 2;
    if (predOver === realOver) pointsUnderOver = decimalNumber(rules.pointsUnderOver25);
  }

  const adjusted = computeAdjustedLivePoints({
    mode: rules.scoringMode,
    pointsExact,
    pointsOutcome,
    pointsSumGoals,
    pointsUnderOver,
    allowOutcomeWithExact: rules.allowOutcomeWithExact,
    allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
    allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
    allowUnderOverWithExact: rules.allowUnderOverWithExact,
    allowUnderOverWithOutcome: rules.allowUnderOverWithOutcome,
    allowUnderOverWithSumGoals: rules.allowUnderOverWithSumGoals,
  });

  const multiplier = isJolly ? Math.max(1, Math.floor(Number(rules.jollyMultiplier || 1))) : 1;
  const withJolly = multiplier > 1
    ? {
        pointsExact: adjusted.pointsExact * multiplier,
        pointsOutcome: adjusted.pointsOutcome * multiplier,
        pointsSumGoals: adjusted.pointsSumGoals * multiplier,
        pointsUnderOver: adjusted.pointsUnderOver * multiplier,
        totalPoints: adjusted.totalPoints * multiplier,
      }
    : adjusted;

  return { ...withJolly, isExact: ph === rh && pa === ra };
}


meRouter.use(requireAuth);

meRouter.get("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, displayName: true, avatarId: true, avatarJson: true, globalRole: true, isActive: true, createdAt: true },
  });

  const memberships = await prisma.leagueMember.findMany({
    where: { userId: req.user!.id },
    include: { league: { include: { branding: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json({ user, memberships });
});


// Update profile (display name)
const UpdateProfileSchema = z.object({
  // Allow updating either displayName, avatarId, or both.
  displayName: z.string().trim().min(2).max(60).optional(),
  avatarId: AvatarPresetIdSchema.optional(),
});

meRouter.put("/profile", async (req: AuthedRequest, res) => {
  const { displayName, avatarId } = UpdateProfileSchema.parse(req.body);

  if (!displayName && !avatarId) {
    return res.status(400).json({ message: "Nessun campo da aggiornare" });
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(displayName ? { displayName } : {}),
        ...(avatarId ? { avatarId } : {}),
      },
      select: { id: true, email: true, displayName: true, avatarId: true, avatarJson: true, globalRole: true, isActive: true, createdAt: true },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
      if (target.includes("displayName")) return res.status(400).json({ message: "Nome visualizzato già in uso" });
    }
    throw e;
  }

  res.json({ user });
});

meRouter.get("/lock", async (req, res) => {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

  const info = await getLockInfo(leagueId);
  res.json({
    lock: {
      lockUntil: info.lockUntil,
      isForceLocked: info.isForceLocked,
      lockedByTime: info.lockedByTime,
      isLocked: info.isLocked,
      lockAll: !!info?.auto?.lockAll,
      lockedMatchdays: (info?.auto?.lockedMatchdays || []).map((x: any) => Number(x)),
    },
  });
});

meRouter.get("/predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;

  const allPredictions = await prisma.prediction.findMany({
    where: { userId: req.user!.id, leagueId },
    include: { match: true },
    orderBy: { match: { kickoffAt: "asc" } },
  });
  const window = await getPredictionWindow();
  const predictions = allPredictions.filter((p: any) => isPredictableMatch(p.match, window));

  // Include scorer picks so the FE can show the selected scorer on match cards.
  const matchIds = predictions.map((p) => p.matchId);
  const scorerPicks = matchIds.length
    ? await prisma.scorerPick.findMany({
        where: { userId: req.user!.id, leagueId, matchId: { in: matchIds } },
        select: { matchId: true, playerName: true, playerExternalId: true },
      })
    : [];

  res.json({ predictions, scorerPicks });
});

// Match detail (lineups + events) + scorer pick
meRouter.get("/matches/:matchId/detail", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const matchId = String(req.params.matchId || "");
  if (!matchId) return res.status(400).json({ message: "Missing matchId" });

  const [match, rules, pick] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.scorerPick.findUnique({ where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId } } }).catch(() => null as any),
  ]);
  if (!match) return res.status(404).json({ message: "Match non trovato" });
  const predictionWindow = await getPredictionWindow();
  if (!isPredictableMatch(match, predictionWindow)) {
    return res.status(400).json({ message: "Partita non pronosticabile.", reason: "MATCH_NOT_PREDICTABLE" });
  }

  const scorerEnabled = !!(rules as any)?.enableScorer;
  const pointsScorer = Number((rules as any)?.pointsScorer ?? 3) || 3;

  // Prefer API-Football for match detail (events + lineups). We cache the normalized payload on Match
  // to avoid consuming the free plan request quota (100/day).
  // If fixtureId is missing (e.g. matches were synced from football-data), we try to resolve it once
  // via a tight fixtures range query and then persist it on the Match.
  const resolved = await resolveFixtureIdForMatch(match as any);
  const fixtureId = resolved.fixtureId;

  if (fixtureId && !(match as any)?.apiFootballFixtureId) {
    // Persist resolved fixture id for future requests
    await prisma.match.update({
      where: { id: matchId },
      data: {
        apiFootballFixtureId: fixtureId,
        apiLeagueId: resolved.leagueId ?? null,
        apiSeason: resolved.season ?? null,
        apiRound: resolved.round ?? null,
      },
    }).catch(() => null);
  }

  const normalizeApiFootballEvents = (rows: any[]) => {
    const out: any[] = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const typeRaw = String(r?.type || "").toLowerCase();
      let type = "";
      if (typeRaw === "goal") type = "GOAL";
      else if (typeRaw === "card") type = "CARD";
      else if (typeRaw === "subst") type = "SUBSTITUTION";
      else type = (r?.type as any) || "";
      out.push({
        type,
        detail: r?.detail ?? null,
        team: r?.team ? { id: r.team.id ?? null, name: r.team.name ?? null, logo: r.team.logo ?? null } : null,
        player: r?.player ? { id: r.player.id ?? null, name: r.player.name ?? null } : null,
        assist: r?.assist ? { id: r.assist.id ?? null, name: r.assist.name ?? null } : null,
        time: r?.time ? { elapsed: r.time.elapsed ?? null, extra: r.time.extra ?? null } : null,
      });
    }
    return out;
  };

  const normalizeApiFootballLineups = (rows: any[]) => {
    const out: any[] = [];
    for (const t of Array.isArray(rows) ? rows : []) {
      const team = t?.team;
      const mapP = (p: any) => ({
        id: Number(p?.id) || null,
        name: String(p?.name || "").trim(),
        number: p?.number ?? null,
        position: p?.pos ?? p?.position ?? null,
      });
      const startXI = Array.isArray(t?.startXI) ? t.startXI.map(mapP).filter((p: any) => p?.name) : [];
      const substitutes = Array.isArray(t?.substitutes) ? t.substitutes.map(mapP).filter((p: any) => p?.name) : [];
      if (!team?.id || !team?.name) continue;
      out.push({
        team: { id: Number(team.id), name: String(team.name), logo: team.logo ?? null },
        startXI,
        substitutes,
      });
    }
    return out;
  };

  const buildGoalScorersFromEvents = (evs: any[]) => {
    const seen = new Set<number>();
    const out: Array<{ id: number | null; name: string }> = [];
    for (const ev of Array.isArray(evs) ? evs : []) {
      if (String(ev?.type || "") !== "GOAL") continue;
      const pid = Number(ev?.player?.id);
      const name = String(ev?.player?.name || "").trim();
      if (!Number.isFinite(pid) || !name) continue;
      if (seen.has(pid)) continue;
      seen.add(pid);
      out.push({ id: pid, name });
    }
    return out;
  };

  let lineups: any[] = [];
  let events: any[] = [];
  let goalScorers: Array<{ id: number | null; name: string }> = [];

  // --- 1) API-Football path (preferred) ---
  if (fixtureId) {
    const cached = (match as any)?.apiFootballDetailJson;
    const cachedAt = (match as any)?.apiFootballDetailFetchedAt ? new Date((match as any).apiFootballDetailFetchedAt) : null;

    // TTL strategy:
    // - FINISHED: cache basically forever (we still keep it in DB)
    // - NOT_STARTED/IN_PROGRESS: refresh every 5 minutes
    const ttlMs = match.status === "FINISHED" ? 365 * 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
    const cacheFresh = !!(cached && cachedAt && Date.now() - cachedAt.getTime() < ttlMs);

    if (cacheFresh) {
      lineups = Array.isArray((cached as any)?.lineups) ? (cached as any).lineups : [];
      events = Array.isArray((cached as any)?.events) ? (cached as any).events : [];
      goalScorers = Array.isArray((cached as any)?.goalScorers) ? (cached as any).goalScorers : [];
    } else {
      try {
        const [rawLineups, rawEvents] = await Promise.all([
          fetchFixtureLineups(fixtureId),
          fetchFixtureEvents(fixtureId),
        ]);

        lineups = normalizeApiFootballLineups(rawLineups);
        events = normalizeApiFootballEvents(rawEvents);
        goalScorers = buildGoalScorersFromEvents(events);

        // Save to DB to avoid repeated API calls (free plan is 100/day)
        const detailJson = { provider: "api-football", fixtureId, lineups, events, goalScorers };
        await prisma.match.update({
          where: { id: matchId },
          data: {
            apiFootballDetailJson: detailJson as any,
            apiFootballDetailFetchedAt: new Date(),
            // also persist goal scorers for scoring if the match is finished and we don't have them yet
            ...(match.status === "FINISHED" && !(match as any)?.goalScorersJson ? { goalScorersJson: goalScorers as any } : {}),
          },
        });
      } catch {
        // best-effort; keep empty arrays
        lineups = [];
        events = [];
        goalScorers = [];
      }
    }
  }

    // --- No football-data fallback: we rely on API-Football caching only ---

// --- 3) Fallback pseudo-lineups from squads ---
    // If we have cached scorers from DB (e.g. sync job), use them.
  if (!goalScorers.length && (match as any)?.goalScorersJson) {
    goalScorers = Array.isArray((match as any).goalScorersJson) ? (match as any).goalScorersJson : [];
  }


  const lineupAvailable =
    Array.isArray(lineups) &&
    lineups.some(
      (t) =>
        (Array.isArray(t?.startXI) && t.startXI.length > 0) ||
        (Array.isArray(t?.substitutes) && t.substitutes.length > 0)
    );

  // FE uses this to decide whether to show scorer picker UI.
  // We only allow picking scorer when rule is enabled and we have a fixture to resolve players from.
  const canPickScorer = scorerEnabled && !!fixtureId && lineupAvailable;

const payload = {
    match,
    lineupAvailable,
    lineups,
    events,
    goalScorers,
    scorer: pick ? { playerExternalId: pick.playerExternalId, playerName: pick.playerName } : null,
    scorerEnabled,
    pointsScorer,
    canPickScorer,
  };

  // DEBUG: log normalized response sent to FE (non-production only)
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("📦 MATCH DETAIL NORMALIZED META:", {
        matchId,
        scorerEnabled,
        lineupTeams: Array.isArray(lineups) ? lineups.length : 0,
        startXI: Array.isArray(lineups) ? lineups.reduce((acc, t: any) => acc + ((t?.startXI?.length as number) || 0), 0) : 0,
        subs: Array.isArray(lineups) ? lineups.reduce((acc, t: any) => acc + ((t?.substitutes?.length as number) || 0), 0) : 0,
        events: Array.isArray(events) ? events.length : 0,
        goalScorers: Array.isArray(goalScorers) ? goalScorers.length : 0,
      });
      console.log("📦 MATCH DETAIL NORMALIZED PAYLOAD:", JSON.stringify(payload, null, 2));
    } catch {
      // ignore logging failures
    }
  }

  res.json(payload);
});

const PutScorerSchema = z.object({
  playerId: z.number().int().positive().nullable(),
  playerName: z.string().trim().min(1).max(120).nullable().optional(),
});

meRouter.put("/matches/:matchId/scorer", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const matchId = String(req.params.matchId || "");
  if (!matchId) return res.status(400).json({ message: "Missing matchId" });

  const data = PutScorerSchema.parse(req.body);
  const [match, rules] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.rule.findUnique({ where: { leagueId } }),
  ]);
  if (!match) return res.status(404).json({ message: "Match non trovato" });
  const predictionWindow = await getPredictionWindow();
  if (!isPredictableMatch(match, predictionWindow)) {
    return res.status(400).json({ message: "Partita non pronosticabile.", reason: "MATCH_NOT_PREDICTABLE" });
  }

  if (!((rules as any)?.enableScorer)) {
    return res.status(400).json({ message: "Funzionalità marcatore non attiva", reason: "SCORER_DISABLED" });
  }

  // Editable gate (lock + started)
  try {
    await assertPredictionsEditableForMatches(leagueId, [matchId]);
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json(e.payload ?? { message: e.message });
    return res.status(400).json({ message: "Non modificabile" });
  }

  if (match.status !== "NOT_STARTED") {
    return res.status(400).json({ message: "Non modificabile: partita iniziata/terminata", reason: "MATCH_STARTED" });
  }

  const resolved = await resolveFixtureIdForMatch(match as any);
  const fixtureId = resolved.fixtureId;

  if (fixtureId && !(match as any)?.apiFootballFixtureId) {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        apiFootballFixtureId: fixtureId,
        apiLeagueId: resolved.leagueId ?? null,
        apiSeason: resolved.season ?? null,
        apiRound: resolved.round ?? null,
      },
    }).catch(() => null);
  }
  if (!fixtureId) {
    return res.status(400).json({ message: "Rosa non disponibile per questo match (manca fixtureId)", reason: "NO_FIXTURE" });
  }

  // Clear
  if (data.playerId === null) {
    await prisma.scorerPick.deleteMany({ where: { userId: req.user!.id, leagueId, matchId } });
    await recalcAllScoresForLeague(leagueId);
    return res.json({ ok: true, scorer: null });
  }

  const allPlayers: { id: number; name: string }[] = [];

  // Preferred: API-Football lineups (cached on Match when available)
  if (fixtureId) {
    let lineups: any[] = [];
    const cached = (match as any)?.apiFootballDetailJson;
    if (cached && Array.isArray((cached as any)?.lineups)) {
      lineups = (cached as any).lineups;
    } else {
      try {
        const raw = await fetchFixtureLineups(fixtureId);
        lineups = Array.isArray(raw) ? raw : [];
      } catch {
        lineups = [];
      }
    }
    for (const t of Array.isArray(lineups) ? lineups : []) {
      const startXI = Array.isArray(t?.startXI) ? t.startXI : [];
      const subs = Array.isArray(t?.substitutes) ? t.substitutes : [];
      for (const p of [...startXI, ...subs]) {
        const id = Number(p?.id);
        const name = String(p?.name || "").trim();
        if (Number.isFinite(id) && name) allPlayers.push({ id, name });
      }
    }
  }

  if (!allPlayers.length) {
    return res.status(400).json({ message: "Lista giocatori non disponibile per questo match", reason: "NO_SQUAD" });
  }
  const pid = Number(data.playerId);
  const hit = allPlayers.find((x) => Number(x.id) === pid);
  if (!hit) {
    return res.status(400).json({ message: "Giocatore non valido (non presente nella rosa)", reason: "INVALID_PLAYER" });
  }

  const playerExternalId = `afp:${pid}`;
  const playerName = String(data.playerName || hit.name).trim().slice(0, 120);

  const pick = await prisma.scorerPick.upsert({
    where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId } },
    create: { userId: req.user!.id, leagueId, matchId, playerExternalId, playerName },
    update: { playerExternalId, playerName },
  });

  await recalcAllScoresForLeague(leagueId);
  res.json({ ok: true, scorer: { playerExternalId: pick.playerExternalId, playerName: pick.playerName } });
});

const PredictionInput = z.object({
  matchId: z.string().min(1),
  homeGoals: z.number().int().min(0).max(99),
  awayGoals: z.number().int().min(0).max(99),
});
const PutPredictionsSchema = z.object({
  // FE should prevent empty saves, but we also guard on BE to avoid hard failures.
  predictions: z.array(PredictionInput).min(0).max(400),
});

meRouter.put("/predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;

  const { predictions } = PutPredictionsSchema.parse(req.body);

  try {
    await assertPredictableMatches(predictions.map((p) => p.matchId));
    await assertPredictionsEditableForMatches(
      leagueId,
      predictions.map((p) => p.matchId)
    );
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json(e.payload ?? { message: e.message });
    throw e;
  }

  if (!predictions.length) {
    return res.status(400).json({ message: "Nessun pronostico da salvare.", reason: "EMPTY_PREDICTIONS" });
  }

  const upserts = predictions.map((p) =>
    prisma.prediction.upsert({
      where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId: p.matchId } },
      create: { userId: req.user!.id, leagueId, matchId: p.matchId, homeGoals: p.homeGoals, awayGoals: p.awayGoals },
      update: { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
    })
  );

  await prisma.$transaction(upserts);

  // Recalc for this league (in case match already finished / or rules changed)
  await recalcAllScoresForLeague(leagueId);

  return res.json({ ok: true });
});

// Rewarded-ad unlock (client-side simulated by default): unlock viewing other users' predictions.
// Unlock is GLOBAL (valid across all leagues).
meRouter.get("/ad-unlock", async (req: AuthedRequest, res) => {
  const row = await prisma.adUnlock.findUnique({ where: { userId: req.user!.id } });
  const now = new Date();
  const isUnlocked = !!row && row.expiresAt.getTime() > now.getTime();
  res.json({ unlocked: isUnlocked, expiresAt: row?.expiresAt ?? null });
});

meRouter.post("/ad-unlock", async (req: AuthedRequest, res) => {
  const cfg = await getMonetizationConfig();
  const now = new Date();
  const minutes = Math.max(1, Math.min(120, cfg.unlockMinutes || 5));
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

  const row = await prisma.adUnlock.upsert({
    where: { userId: req.user!.id },
    update: { expiresAt },
    create: { userId: req.user!.id, expiresAt },
  });

  // Log unlock for stats
  await prisma.adUnlockLog.create({ data: { userId: req.user!.id, minutes } });

  res.json({ unlocked: true, expiresAt: row.expiresAt });
});



// --- Competition predictions (winner + top scorer) ---
const PutCompetitionPredictionsSchema = z.object({
  winnerTeamId: z.number().int().positive().nullable().optional(),
  winnerTeamName: z.string().trim().min(1).max(200).nullable().optional(),
  topScorerPlayerId: z.number().int().positive().nullable().optional(),
  topScorerPlayerName: z.string().trim().min(1).max(200).nullable().optional(),
  quarterFinalistTeamId: z.number().int().positive().nullable().optional(),
  quarterFinalistTeamName: z.string().trim().min(1).max(200).nullable().optional(),
  semiFinalistTeamId: z.number().int().positive().nullable().optional(),
  semiFinalistTeamName: z.string().trim().min(1).max(200).nullable().optional(),
  finalistTeamId: z.number().int().positive().nullable().optional(),
  finalistTeamName: z.string().trim().min(1).max(200).nullable().optional(),
});

meRouter.get("/competition-predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  await ensureLeagueConfig(leagueId);

  const [rules, settings, picks, superSetting] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.setting.findUnique({ where: { leagueId } }),
    prisma.competitionPick.findMany({ where: { leagueId, userId: req.user!.id } }),
    prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null as any),
  ]);

  const deadline = settings?.competitionPredictionsDeadline
    ? new Date(settings.competitionPredictionsDeadline)
    : (await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } }))?.kickoffAt ?? null;
  const deadlineMs = deadline ? new Date(deadline).getTime() : NaN;
  const canEdit = !deadline || !Number.isFinite(deadlineMs) ? true : Date.now() < deadlineMs;

  const competitionType = String((superSetting as any)?.competitionType || "LEAGUE");
  const isKnockoutCup = competitionType === "KNOCKOUT_CUP";
  const enableWinner = !!(rules as any)?.enableCompetitionWinner;
  const enableTop = !!(rules as any)?.enableCompetitionTopScorer;
  const enableQuarter = isKnockoutCup && !!(rules as any)?.enableCompetitionQuarterFinalist;
  const enableSemi = isKnockoutCup && !!(rules as any)?.enableCompetitionSemiFinalist;
  const enableFinalist = isKnockoutCup && !!(rules as any)?.enableCompetitionFinalist;

  const provider = String(superSetting?.provider || "FOOTBALL_DATA").toUpperCase();
  const competitionCode = String(superSetting?.footballDataCompetitionCode || "").trim();
  const season = superSetting?.footballDataSeason ?? null;

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

    // Best-effort fallback: if scorers endpoint returns empty, use cached/derived squad players.
    if (!scorers.length) {
      const cache = await prisma.competitionOutcome.findUnique({ where: { leagueId } }).catch(() => null as any);
      const fresh = cache?.playerOptionsFetchedAt
        ? Date.now() - new Date(cache.playerOptionsFetchedAt).getTime() < 24 * 60 * 60 * 1000
        : false;

      if (fresh && cache?.playerOptionsJson) {
        scorers = Array.isArray(cache.playerOptionsJson) ? cache.playerOptionsJson : [];
      } else {
        try {
          const players = await fetchCompetitionPlayerOptions({ competitionCode });
          scorers = players.map((p) => ({ id: p.id, name: p.name, teamName: p.teamName ?? null, goals: 0 }));

          await prisma.competitionOutcome.upsert({
            where: { leagueId },
            create: {
              leagueId,
              provider: "FOOTBALL_DATA",
              competitionCode,
              ...(season ? { season: Number(season) } : {}),
              playerOptionsJson: players as any,
              playerOptionsFetchedAt: new Date(),
            },
            update: {
              provider: "FOOTBALL_DATA",
              competitionCode,
              ...(season ? { season: Number(season) } : { season: null }),
              playerOptionsJson: players as any,
              playerOptionsFetchedAt: new Date(),
            },
          });
        } catch {
          scorers = [];
        }
      }
    }
  }

  const pickWinner = picks.find((p: any) => p.type === "WINNER") || null;
  const pickTop = picks.find((p: any) => p.type === "TOP_SCORER") || null;
  const pickQuarter = picks.find((p: any) => p.type === "QUARTER_FINALIST") || null;
  const pickSemi = picks.find((p: any) => p.type === "SEMI_FINALIST") || null;
  const pickFinalist = picks.find((p: any) => p.type === "FINALIST") || null;

  res.json({
    competitionType,
    enabled: { winner: enableWinner, topScorer: enableTop, quarterFinalist: enableQuarter, semiFinalist: enableSemi, finalist: enableFinalist },
    points: {
      winner: decimalNumber((rules as any)?.pointsCompetitionWinner, 15),
      topScorer: decimalNumber((rules as any)?.pointsCompetitionTopScorer, 12),
      quarterFinalist: decimalNumber((rules as any)?.pointsCompetitionQuarterFinalist, 8),
      semiFinalist: decimalNumber((rules as any)?.pointsCompetitionSemiFinalist, 10),
      finalist: decimalNumber((rules as any)?.pointsCompetitionFinalist, 12),
    },
    deadline: deadline ? new Date(deadline).toISOString() : null,
    canEdit,
    picks: {
      winner: pickWinner
        ? { teamExternalId: pickWinner.teamExternalId, teamName: pickWinner.teamName, pointsAwarded: decimalNumber(pickWinner.pointsAwarded) }
        : null,
      topScorer: pickTop
        ? { playerExternalId: pickTop.playerExternalId, playerName: pickTop.playerName, pointsAwarded: decimalNumber(pickTop.pointsAwarded) }
        : null,
      quarterFinalist: pickQuarter ? { teamExternalId: pickQuarter.teamExternalId, teamName: pickQuarter.teamName, pointsAwarded: decimalNumber(pickQuarter.pointsAwarded) } : null,
      semiFinalist: pickSemi ? { teamExternalId: pickSemi.teamExternalId, teamName: pickSemi.teamName, pointsAwarded: decimalNumber(pickSemi.pointsAwarded) } : null,
      finalist: pickFinalist ? { teamExternalId: pickFinalist.teamExternalId, teamName: pickFinalist.teamName, pointsAwarded: decimalNumber(pickFinalist.pointsAwarded) } : null,
    },
    options: {
      teams: teams
        .map((t: any) => ({ id: Number(t.id), name: String(t.shortName || t.name || "").trim(), crest: (t as any).crest ?? null }))
        .filter((t: any) => Number.isFinite(t.id) && t.name),
      scorers: scorers
        .map((s: any) => ({
          id: Number(s?.player?.id ?? s?.id),
          name: String(s?.player?.name ?? s?.name ?? "").trim(),
          teamName: String(s?.team?.name ?? "").trim() || null,
          goals: Number(s?.goals ?? s?.numberOfGoals ?? 0) || 0,
        }))
        .filter((p: any) => Number.isFinite(p.id) && p.name),
    },
  });
});

meRouter.put("/competition-predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const body = PutCompetitionPredictionsSchema.parse(req.body);

  await ensureLeagueConfig(leagueId);
  const [rules, settings, superSetting] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.setting.findUnique({ where: { leagueId } }),
    prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null as any),
  ]);

  const deadline = settings?.competitionPredictionsDeadline
    ? new Date(settings.competitionPredictionsDeadline)
    : (await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } }))?.kickoffAt ?? null;

  if (deadline) {
    const ms = new Date(deadline).getTime();
    if (Number.isFinite(ms) && Date.now() >= ms) {
      return res.status(400).json({ message: "Deadline scaduta: pronostici competizione bloccati", reason: "DEADLINE" });
    }
  }

  const competitionType = String((superSetting as any)?.competitionType || "LEAGUE");
  const isKnockoutCup = competitionType === "KNOCKOUT_CUP";
  const enableWinner = !!(rules as any)?.enableCompetitionWinner;
  const enableTop = !!(rules as any)?.enableCompetitionTopScorer;
  const enableQuarter = isKnockoutCup && !!(rules as any)?.enableCompetitionQuarterFinalist;
  const enableSemi = isKnockoutCup && !!(rules as any)?.enableCompetitionSemiFinalist;
  const enableFinalist = isKnockoutCup && !!(rules as any)?.enableCompetitionFinalist;

  if (enableWinner) {
    if (body.winnerTeamId === null) {
      await prisma.competitionPick.deleteMany({ where: { leagueId, userId: req.user!.id, type: "WINNER" } });
    } else if (typeof body.winnerTeamId === "number") {
      await prisma.competitionPick.upsert({
        where: { userId_leagueId_type: { userId: req.user!.id, leagueId, type: "WINNER" } },
        create: {
          userId: req.user!.id,
          leagueId,
          type: "WINNER",
          teamExternalId: body.winnerTeamId,
          teamName: body.winnerTeamName ?? null,
        },
        update: { teamExternalId: body.winnerTeamId, teamName: body.winnerTeamName ?? null },
      });
    }
  }

  if (enableTop) {
    if (body.topScorerPlayerId === null) {
      await prisma.competitionPick.deleteMany({ where: { leagueId, userId: req.user!.id, type: "TOP_SCORER" } });
    } else if (typeof body.topScorerPlayerId === "number") {
      await prisma.competitionPick.upsert({
        where: { userId_leagueId_type: { userId: req.user!.id, leagueId, type: "TOP_SCORER" } },
        create: {
          userId: req.user!.id,
          leagueId,
          type: "TOP_SCORER",
          playerExternalId: body.topScorerPlayerId,
          playerName: body.topScorerPlayerName ?? null,
        },
        update: { playerExternalId: body.topScorerPlayerId, playerName: body.topScorerPlayerName ?? null },
      });
    }
  }


  async function upsertTeamPick(enabled: boolean, type: any, teamId: number | null | undefined, teamName: string | null | undefined) {
    if (!enabled) return;
    if (teamId === null) {
      await prisma.competitionPick.deleteMany({ where: { leagueId, userId: req.user!.id, type } });
    } else if (typeof teamId === "number") {
      await prisma.competitionPick.upsert({
        where: { userId_leagueId_type: { userId: req.user!.id, leagueId, type } },
        create: { userId: req.user!.id, leagueId, type, teamExternalId: teamId, teamName: teamName ?? null },
        update: { teamExternalId: teamId, teamName: teamName ?? null },
      });
    }
  }

  await upsertTeamPick(enableQuarter, "QUARTER_FINALIST", body.quarterFinalistTeamId, body.quarterFinalistTeamName ?? null);
  await upsertTeamPick(enableSemi, "SEMI_FINALIST", body.semiFinalistTeamId, body.semiFinalistTeamName ?? null);
  await upsertTeamPick(enableFinalist, "FINALIST", body.finalistTeamId, body.finalistTeamName ?? null);

  const picks = await prisma.competitionPick.findMany({ where: { leagueId, userId: req.user!.id } });
  res.json({ picks });
});

// Change password (logged-in)
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
});

meRouter.put("/password", async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.isActive) return res.status(401).json({ message: "Utente non valido" });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ message: "Password attuale non corretta" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return res.json({ ok: true });
});