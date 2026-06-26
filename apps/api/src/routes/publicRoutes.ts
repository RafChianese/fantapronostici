import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";
import { getMonetizationConfig } from "../lib/monetization.js";
import { getLockInfo } from "../lib/lock.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { filterPredictableMatches, isPlaceholderMatch } from "../lib/predictableMatches.js";

export const publicRouter = Router();

function decimalNumber(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveLeague(req: any) {
  const leagueId =
    (req.query.leagueId as string | undefined) ||
    (typeof req.headers["x-league-id"] === "string"
      ? req.headers["x-league-id"]
      : undefined);
  const leagueCode = (req.query.leagueCode as string | undefined) || undefined;

  if (leagueId) {
    // IMPORTANT: avoid DB lookup when we already have a leagueId.
    // This endpoint is hit frequently (e.g. /lock polling). We only need the id downstream.
    return { id: leagueId } as any;
  }
  if (leagueCode) {
    const code = leagueCode.toUpperCase();
    // Small in-memory cache to reduce DB pressure.
    (globalThis as any).__LEAGUE_CODE_CACHE__ ??= new Map();
    const cache: Map<string, { league: any; exp: number }> = (globalThis as any)
      .__LEAGUE_CODE_CACHE__;
    const now = Date.now();
    const hit = cache.get(code);
    if (hit && hit.exp > now) return hit.league;
    const league = await prisma.league.findUnique({ where: { code } });
    if (league) cache.set(code, { league, exp: now + 5 * 60_000 }); // 5 minutes
    return league;
  }
  return null;
}

publicRouter.get("/leagues/resolve", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(404).json({ message: "Lega non trovata" });
  return res.json({ league });
});

publicRouter.get("/matches", async (req, res) => {
  // Safety fix (dev DBs): if all matches have matchday=1 (historical seed) but there are more than 4,
  // auto-assign matchdays in blocks of 4 matches ordered by kickoffAt.
  // This keeps the UI grouping correct and also persists the correction in DB.
  const existing = await prisma.match.findMany({
    orderBy: { kickoffAt: "asc" },
  });

  const unique = new Set(existing.map((m) => m.matchday ?? 1));
  if (existing.length > 4 && unique.size === 1 && Array.from(unique)[0] === 1) {
    // Assign 1..N based on index // 4
    await prisma.$transaction(
      existing.map((m, idx) =>
        prisma.match.update({
          where: { id: m.id },
          data: { matchday: Math.floor(idx / 4) + 1 },
        }),
      ),
    );
  }

  const allMatches = await prisma.match.findMany({
    orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }],
  });
  const matches = await filterPredictableMatches(allMatches);

  // Optional league-scoped extras (non-breaking): Partita Jolly
  const leagueId =
    typeof req.headers["x-league-id"] === "string"
      ? String(req.headers["x-league-id"])
      : undefined;
  if (leagueId) {
    await ensureLeagueConfig(leagueId);
    const rules = await prisma.rule.findUnique({ where: { leagueId } });
    if (rules?.enableJolly) {
      const jollyRows = await prisma.matchdayJolly.findMany({
        where: { leagueId },
        select: { matchId: true },
      });
      const set = new Set(jollyRows.map((r) => String(r.matchId)));
      return res.json({
        matches: matches.map((m) => ({ ...m, isJolly: set.has(String(m.id)) })),
      });
    }
    return res.json({
      matches: matches.map((m) => ({ ...m, isJolly: false })),
    });
  }

  res.json({ matches });
});

publicRouter.get("/lock", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league)
    return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  // NOTE: getLockInfo already calls ensureLeagueConfig.
  const [rules, info] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId: league.id } }),
    getLockInfo(league.id),
  ]);
  res.json({
    lock: {
      lockUntil: info.lockUntil,
      isForceLocked: info.isForceLocked,
      lockedByTime: info.lockedByTime,
      isLocked: info.isLocked,
      // Deploy-safe extras used by the UI to lock only the relevant matchdays.
      lockAll: !!info?.auto?.lockAll,
      lockedMatchdays: (info?.auto?.lockedMatchdays || []).map((x: any) =>
        Number(x),
      ),
    },
    leagueSettings: info.leagueSettings,
    features: {
      underOver25: !!rules?.enableUnderOver25,
      matchdayAwards: !!rules?.enableMatchdayAwards,
      jolly: !!rules?.enableJolly,
      jollyMultiplier: rules?.jollyMultiplier ?? 2,
      scorer: !!(rules as any)?.enableScorer,
      scorerPoints: decimalNumber((rules as any)?.pointsScorer, 3),
      competitionWinner: !!(rules as any)?.enableCompetitionWinner,
      competitionWinnerPoints: decimalNumber(
        (rules as any)?.pointsCompetitionWinner,
        15,
      ),
      competitionTopScorer: !!(rules as any)?.enableCompetitionTopScorer,
      competitionTopScorerPoints: decimalNumber(
        (rules as any)?.pointsCompetitionTopScorer,
        12,
      ),
    },
  });
});

// Read-only: returns the rule + setting values that affect the league regulation ("Regolamento").
// It is league-scoped via x-league-id header or via leagueId/leagueCode query params.
publicRouter.get("/regolamento-config", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league)
    return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  await ensureLeagueConfig(league.id);

  const [leagueDetails, rules, settings, lockInfo, monetization, superSetting] =
    await Promise.all([
      prisma.league.findUnique({ where: { id: league.id } }),
      prisma.rule.findUnique({ where: { leagueId: league.id } }),
      prisma.setting.findUnique({ where: { leagueId: league.id } }),
      getLockInfo(league.id),
      prisma.leagueMonetization.findUnique({
        where: { leagueId: league.id },
        include: { prizes: true },
      }),
      prisma.superSetting
        .findFirst({ orderBy: { createdAt: "asc" } })
        .catch(() => null as any),
    ]);

  if (!rules || !settings)
    return res.status(500).json({ message: "Missing league config" });

  res.json({
    monetization: monetization
      ? {
          entryFeeCents: monetization.entryFeeCents,
          prizes: (monetization.prizes || []).map((p: any) => ({
            position: p.position,
            amountCents: p.amountCents,
          })),
        }
      : { entryFeeCents: 0, prizes: [] },

    league: {
      id: league.id,
      name:
        (leagueDetails as any)?.name ||
        (league as any).name ||
        "Lega selezionata",
      code: (leagueDetails as any)?.code || (league as any).code || "",
    },
    rules: {
      pointsExact: decimalNumber(rules.pointsExact),
      pointsOutcome: decimalNumber(rules.pointsOutcome),
      pointsSumGoals: decimalNumber(rules.pointsSumGoals),
      enableUnderOver25: rules.enableUnderOver25,
      pointsUnderOver25: decimalNumber(rules.pointsUnderOver25),
      enableMatchdayAwards: rules.enableMatchdayAwards,
      enableJolly: (rules as any).enableJolly ?? false,
      jollyMultiplier: (rules as any).jollyMultiplier ?? 2,
      enableScorer: (rules as any).enableScorer ?? false,
      pointsScorer: decimalNumber((rules as any).pointsScorer, 3),
      enableCompetitionWinner: (rules as any).enableCompetitionWinner ?? false,
      pointsCompetitionWinner: decimalNumber(
        (rules as any).pointsCompetitionWinner,
        15,
      ),
      enableCompetitionTopScorer:
        (rules as any).enableCompetitionTopScorer ?? false,
      pointsCompetitionTopScorer: decimalNumber(
        (rules as any).pointsCompetitionTopScorer,
        12,
      ),
      enableCompetitionQuarterFinalist:
        (rules as any).enableCompetitionQuarterFinalist ?? false,
      pointsCompetitionQuarterFinalist: decimalNumber(
        (rules as any).pointsCompetitionQuarterFinalist,
        8,
      ),
      enableCompetitionSemiFinalist:
        (rules as any).enableCompetitionSemiFinalist ?? false,
      pointsCompetitionSemiFinalist: decimalNumber(
        (rules as any).pointsCompetitionSemiFinalist,
        10,
      ),
      enableCompetitionFinalist:
        (rules as any).enableCompetitionFinalist ?? false,
      pointsCompetitionFinalist: decimalNumber(
        (rules as any).pointsCompetitionFinalist,
        12,
      ),
      competitionType: String(
        (superSetting as any)?.competitionType || "LEAGUE",
      ),
      scoringMode: rules.scoringMode,
      allowOutcomeWithExact: rules.allowOutcomeWithExact,
      allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
      allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
      allowUnderOverWithExact: (rules as any).allowUnderOverWithExact ?? true,
      allowUnderOverWithOutcome:
        (rules as any).allowUnderOverWithOutcome ?? true,
      allowUnderOverWithSumGoals:
        (rules as any).allowUnderOverWithSumGoals ?? true,
    },
    settings: {
      lockUntil: settings.lockUntil,
      isForceLocked: settings.isForceLocked,
      tieBreak1: settings.tieBreak1,
      tieBreak2: settings.tieBreak2,
      tieBreak3: settings.tieBreak3,
      competitionPredictionsDeadline:
        (settings as any).competitionPredictionsDeadline ?? null,
    },
    lock: {
      lockUntil: lockInfo.lockUntil,
      isForceLocked: lockInfo.isForceLocked,
      lockedByTime: lockInfo.lockedByTime,
      isLocked: lockInfo.isLocked,
    },
  });
});

publicRouter.get("/leaderboard", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league)
    return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  const sortRaw = String(req.query.sort || "points");

  // Supported:
  // - points_desc (default), points_asc
  // - exact_desc / exact_asc
  // - outcome_desc / outcome_asc
  // - sumgoals_desc / sumgoals_asc
  // Backward compatible: points | name
  const sort = sortRaw === "points" ? "points_desc" : sortRaw;

  // Ensure league settings + rules exist (tie-breakers + scoring mode)
  await ensureLeagueConfig(league.id);
  const [settings, rules, monetization] = await Promise.all([
    prisma.setting.findUnique({ where: { leagueId: league.id } }),
    prisma.rule.findUnique({ where: { leagueId: league.id } }),
    prisma.leagueMonetization.findUnique({
      where: { leagueId: league.id },
      include: { prizes: true },
    }),
  ]);
  if (!rules)
    return res.status(500).json({ message: "Missing rules for league" });

  // Points breakdown is normalized in DB (non-counting categories are zeroed).
  // Therefore hit counters can be computed directly from positive per-category points.

  // Aggregate predictions per user to compute totals + hit counts.
  const preds = await prisma.prediction.findMany({
    where: { leagueId: league.id },
    select: {
      userId: true,
      totalPoints: true,
      pointsExact: true,
      pointsOutcome: true,
      pointsSumGoals: true,
      pointsUnderOver: true,
    },
  });

  const agg = new Map<
    string,
    {
      totalPoints: number;
      competitionPoints: number;
      exactHits: number;
      outcomeHits: number;
      sumGoalsHits: number;
      underOverHits: number;
    }
  >();

  for (const p of preds) {
    const a = agg.get(p.userId) || {
      totalPoints: 0,
      competitionPoints: 0,
      exactHits: 0,
      outcomeHits: 0,
      sumGoalsHits: 0,
      underOverHits: 0,
    };
    a.totalPoints += Number(p.totalPoints ?? 0);
    if (Number(p.pointsExact ?? 0) > 0) a.exactHits += 1;
    if (Number(p.pointsOutcome ?? 0) > 0) a.outcomeHits += 1;
    if (Number(p.pointsSumGoals ?? 0) > 0) a.sumGoalsHits += 1;
    if (rules.enableUnderOver25 && Number(p.pointsUnderOver ?? 0) > 0)
      a.underOverHits += 1;
    agg.set(p.userId, a);
  }

  // Competition predictions (winner/top scorer) add extra points.
  const comp = await prisma.competitionPick.groupBy({
    by: ["userId"],
    where: { leagueId: league.id },
    _sum: { pointsAwarded: true },
  });
  for (const row of comp as any[]) {
    const uid = String(row.userId);
    const pts = Number(row._sum?.pointsAwarded ?? 0);
    const a = agg.get(uid) || {
      totalPoints: 0,
      competitionPoints: 0,
      exactHits: 0,
      outcomeHits: 0,
      sumGoalsHits: 0,
      underOverHits: 0,
    };
    a.competitionPoints = pts;
    a.totalPoints += pts;
    agg.set(uid, a);
  }

  const awardCounts = rules.enableMatchdayAwards
    ? await prisma.matchdayAward.groupBy({
        by: ["userId"],
        where: { leagueId: league.id },
        _count: { userId: true },
      })
    : [];
  const awardByUser = new Map<string, number>(
    awardCounts.map((r) => [r.userId, r._count.userId]),
  );

  const members = await prisma.leagueMember.findMany({
    where: { leagueId: league.id, status: "APPROVED" },
    include: { user: true },
  });


  const recentBaseMatches = await prisma.match.findMany({
    where: { status: { in: ["FINISHED" as any, "IN_PROGRESS" as any] } },
    orderBy: { kickoffAt: "desc" },
    take: 30,
  });
  const recentMatches = recentBaseMatches.filter((m) => !isPlaceholderMatch(m as any)).slice(0, 5);
  const recentMatchIds = recentMatches.map((m) => m.id);
  const memberIds = members.map((m) => m.user.id);
  const recentPredictions = recentMatchIds.length
    ? await prisma.prediction.findMany({
        where: { leagueId: league.id, matchId: { in: recentMatchIds }, userId: { in: memberIds } },
        select: {
          userId: true,
          matchId: true,
          homeGoals: true,
          awayGoals: true,
          pointsExact: true,
          pointsOutcome: true,
          pointsSumGoals: true,
          pointsUnderOver: true,
          totalPoints: true,
        },
      })
    : [];
  const recentPredByUserMatch = new Map<string, any>();
  for (const p of recentPredictions) recentPredByUserMatch.set(`${p.userId}:${p.matchId}`, p);

  function recentTone(match: any, pred: any): "green" | "yellow" | "orange" | "cyan" | "red" | "blue" | "grey" {
    if (match.status === "IN_PROGRESS") return "blue";
    if (!pred) return "grey";
    if (Number(pred.pointsExact ?? 0) > 0) return "green";
    if (Number(pred.pointsOutcome ?? 0) > 0) return "yellow";
    if (Number(pred.pointsSumGoals ?? 0) > 0) return "orange";
    if (rules.enableUnderOver25 && Number(pred.pointsUnderOver ?? 0) > 0) return "cyan";
    return "red";
  }

  function recentMatchesForUser(userId: string) {
    return recentMatches.map((m) => {
      const pred = recentPredByUserMatch.get(`${userId}:${m.id}`);
      return {
        matchId: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoffAt: m.kickoffAt.toISOString(),
        status: m.status,
        prediction: pred ? { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals } : null,
        real: typeof m.homeScore === "number" && typeof m.awayScore === "number" ? { home: m.homeScore, away: m.awayScore } : null,
        points: {
          exact: decimalNumber(pred?.pointsExact),
          outcome: decimalNumber(pred?.pointsOutcome),
          sumGoals: decimalNumber(pred?.pointsSumGoals),
          underOver: decimalNumber(pred?.pointsUnderOver),
          total: decimalNumber(pred?.totalPoints),
        },
        tone: recentTone(m, pred),
      };
    });
  }

  let rows = members.map((m) => ({
    userId: m.user.id,
    displayName: m.user.displayName,
    avatarId: (m.user as any).avatarId ?? null,
    avatarJson: (m.user as any).avatarJson ?? null,
    totalPoints: agg.get(m.user.id)?.totalPoints ?? 0,
    competitionPoints: agg.get(m.user.id)?.competitionPoints ?? 0,
    exactHits: agg.get(m.user.id)?.exactHits ?? 0,
    outcomeHits: agg.get(m.user.id)?.outcomeHits ?? 0,
    sumGoalsHits: agg.get(m.user.id)?.sumGoalsHits ?? 0,
    underOverHits: rules.enableUnderOver25
      ? (agg.get(m.user.id)?.underOverHits ?? 0)
      : 0,
    matchdayWins: rules.enableMatchdayAwards
      ? (awardByUser.get(m.user.id) ?? 0)
      : 0,
    recentMatches: recentMatchesForUser(m.user.id),
  }));

  // Sorting
  if (sort === "name") {
    // kept for backward compatibility
    rows = rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } else {
    const tie1 = settings?.tieBreak1 ?? "EXACT";
    const tie2 = settings?.tieBreak2 ?? "OUTCOME";
    const tie3 = settings?.tieBreak3 ?? "SUM_GOALS";

    const getTieVal = (row: any, c: string) => {
      if (c === "EXACT") return row.exactHits;
      if (c === "OUTCOME") return row.outcomeHits;
      if (c === "UNDER_OVER") return row.underOverHits;
      return row.sumGoalsHits;
    };

    const byName = (a: any, b: any) =>
      a.displayName.localeCompare(b.displayName);

    const cmpPoints = (dir: "asc" | "desc") => (a: any, b: any) => {
      const s = dir === "asc" ? 1 : -1;
      if (a.totalPoints !== b.totalPoints)
        return (a.totalPoints - b.totalPoints) * s;
      const d1 = (getTieVal(a, tie1) - getTieVal(b, tie1)) * s;
      if (d1 !== 0) return d1;
      const d2 = (getTieVal(a, tie2) - getTieVal(b, tie2)) * s;
      if (d2 !== 0) return d2;
      const d3 = (getTieVal(a, tie3) - getTieVal(b, tie3)) * s;
      if (d3 !== 0) return d3;
      return byName(a, b);
    };

    const cmpMetric =
      (
        key: "exactHits" | "outcomeHits" | "sumGoalsHits",
        dir: "asc" | "desc",
      ) =>
      (a: any, b: any) => {
        const s = dir === "asc" ? 1 : -1;
        if (a[key] !== b[key]) return (a[key] - b[key]) * s;
        // secondary: points (same direction for coherence)
        if (a.totalPoints !== b.totalPoints)
          return (a.totalPoints - b.totalPoints) * s;
        return byName(a, b);
      };

    const sorter =
      sort === "points_asc"
        ? cmpPoints("asc")
        : sort === "points_desc"
          ? cmpPoints("desc")
          : sort === "exact_asc"
            ? cmpMetric("exactHits", "asc")
            : sort === "exact_desc"
              ? cmpMetric("exactHits", "desc")
              : sort === "outcome_asc"
                ? cmpMetric("outcomeHits", "asc")
                : sort === "outcome_desc"
                  ? cmpMetric("outcomeHits", "desc")
                  : sort === "sumgoals_asc"
                    ? cmpMetric("sumGoalsHits", "asc")
                    : sort === "sumgoals_desc"
                      ? cmpMetric("sumGoalsHits", "desc")
                      : cmpPoints("desc"); // default

    rows = rows.sort(sorter);
  }

  res.json({
    league: { id: league.id, name: league.name, code: league.code },
    features: {
      underOver25: !!rules.enableUnderOver25,
      matchdayAwards: !!rules.enableMatchdayAwards,
    },
    monetization: {
      entryFeeCents: monetization?.entryFeeCents ?? 0,
      prizes: (monetization?.prizes || []).map((p: any) => ({
        position: p.position,
        amountCents: p.amountCents,
      })),
    },
    tieBreakers: {
      tieBreak1: settings?.tieBreak1 ?? "EXACT",
      tieBreak2: settings?.tieBreak2 ?? "OUTCOME",
      tieBreak3: settings?.tieBreak3 ?? "SUM_GOALS",
    },
    leaderboard: rows,
  });
});

publicRouter.get("/users/:id/summary", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league)
    return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  await ensureLeagueConfig(league.id);
  const rules = await prisma.rule.findUnique({
    where: { leagueId: league.id },
  });

  const userId = req.params.id;

  // Viewing other users' predictions is gated behind a short "rewarded ad" window.
  // We require authentication here so we can verify unlock state.
  const authHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  if (!token) return res.status(401).json({ message: "Non autenticato" });
  let viewerId: string;
  try {
    viewerId = verifyToken(token).sub;
  } catch {
    return res.status(401).json({ message: "Token non valido" });
  }

  const isSelf = viewerId === userId;
  if (!isSelf) {
    const cfg = await getMonetizationConfig();
    // If ads are disabled globally, allow viewing without unlock.
    if (cfg.adsEnabled) {
      const row = await prisma.adUnlock.findUnique({
        where: { userId: viewerId },
      });
      const now = new Date();
      const ok = !!row && row.expiresAt.getTime() > now.getTime();
      if (!ok) {
        return res.status(403).json({
          code: "AD_REQUIRED",
          message:
            "Guarda una pubblicità per visualizzare i pronostici degli altri utenti",
          unlockMinutes: cfg.unlockMinutes,
          demoAdsEnabled: cfg.demoAdsEnabled,
        });
      }
    }
  }

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId } },
    include: { user: true },
  });
  if (!member || member.status !== "APPROVED")
    return res.status(404).json({ message: "User not in league" });

  const allSummaryMatches = await prisma.match.findMany({
    orderBy: { kickoffAt: "asc" },
  });
  const matches = await filterPredictableMatches(allSummaryMatches);
  const [preds, competitionPicks] = await Promise.all([
    prisma.prediction.findMany({ where: { leagueId: league.id, userId } }),
    prisma.competitionPick.findMany({
      where: { leagueId: league.id, userId },
      orderBy: { createdAt: "asc" },
      select: {
        type: true,
        teamExternalId: true,
        teamName: true,
        playerExternalId: true,
        playerName: true,
        pointsAwarded: true,
      },
    }),
  ]);
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));

  const detail = matches.map((m) => {
    const p = predByMatch.get(m.id);
    const real =
      m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null
        ? { home: m.homeScore, away: m.awayScore }
        : null;
    return {
      match: m,
      prediction: p ? { homeGoals: p.homeGoals, awayGoals: p.awayGoals } : null,
      real,
      points: p
        ? {
            exact: Number(p.pointsExact ?? 0),
            outcome: Number(p.pointsOutcome ?? 0),
            sumGoals: Number(p.pointsSumGoals ?? 0),
            underOver: Number(p.pointsUnderOver ?? 0),
            total: Number(p.totalPoints ?? 0),
          }
        : { exact: 0, outcome: 0, sumGoals: 0, underOver: 0, total: 0 },
    };
  });

  const tournamentPicks = (competitionPicks as any[]).map((pick) => ({
    type: pick.type,
    teamExternalId: pick.teamExternalId ?? null,
    teamName: pick.teamName ?? null,
    playerExternalId: pick.playerExternalId ?? null,
    playerName: pick.playerName ?? null,
    pointsAwarded: Number(pick.pointsAwarded ?? 0),
  }));

  const tournamentTotal = tournamentPicks.reduce(
    (sum, pick) => sum + Number(pick.pointsAwarded || 0),
    0,
  );

  const totals = detail.reduce(
    (acc, d) => {
      acc.exact += d.points.exact;
      acc.outcome += d.points.outcome;
      acc.sumGoals += d.points.sumGoals;
      acc.underOver += d.points.underOver;
      acc.total += d.points.total;
      return acc;
    },
    { exact: 0, outcome: 0, sumGoals: 0, underOver: 0, total: 0 },
  );
  totals.total += tournamentTotal;

  res.json({
    league: { id: league.id, code: league.code, name: league.name },
    features: {
      underOver25: !!rules?.enableUnderOver25,
      matchdayAwards: !!rules?.enableMatchdayAwards,
      jolly: !!rules?.enableJolly,
      jollyMultiplier: rules?.jollyMultiplier ?? 2,
    },
    user: {
      id: member.user.id,
      displayName: member.user.displayName,
      email: member.user.email,
      avatarId: (member.user as any).avatarId ?? null,
      avatarJson: (member.user as any).avatarJson ?? null,
    },
    detail,
    tournamentPicks,
    totals,
  });
});
