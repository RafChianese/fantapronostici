import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/auth.js";
import { getMonetizationConfig } from "../lib/monetization.js";
import { getLockInfo } from "../lib/lock.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";

export const publicRouter = Router();

async function resolveLeague(req: any) {
  const leagueId = (req.query.leagueId as string | undefined) || (typeof req.headers["x-league-id"] === "string" ? req.headers["x-league-id"] : undefined);
  const leagueCode = (req.query.leagueCode as string | undefined) || undefined;

  if (leagueId) {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    return league;
  }
  if (leagueCode) {
    const league = await prisma.league.findUnique({ where: { code: leagueCode.toUpperCase() } });
    return league;
  }
  return null;
}

publicRouter.get("/leagues/resolve", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(404).json({ message: "Lega non trovata" });
  return res.json({ league });
});

publicRouter.get("/matches", async (_req, res) => {
  // Safety fix (dev DBs): if all matches have matchday=1 (historical seed) but there are more than 4,
  // auto-assign matchdays in blocks of 4 matches ordered by kickoffAt.
  // This keeps the UI grouping correct and also persists the correction in DB.
  const existing = await prisma.match.findMany({ orderBy: { kickoffAt: "asc" } });

  const unique = new Set(existing.map((m) => m.matchday ?? 1));
  if (existing.length > 4 && unique.size === 1 && Array.from(unique)[0] === 1) {
    // Assign 1..N based on index // 4
    await prisma.$transaction(
      existing.map((m, idx) =>
        prisma.match.update({ where: { id: m.id }, data: { matchday: Math.floor(idx / 4) + 1 } })
      )
    );
  }

  const matches = await prisma.match.findMany({ orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }] });
  res.json({ matches });
});

publicRouter.get("/lock", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(400).json({ message: "Missing leagueId or leagueCode" });
  await ensureLeagueConfig(league.id);
  const rules = await prisma.rule.findUnique({ where: { leagueId: league.id } });
  const info = await getLockInfo(league.id);
  res.json({
    lock: { lockUntil: info.lockUntil, isForceLocked: info.isForceLocked, lockedByTime: info.lockedByTime, isLocked: info.isLocked },
    features: { underOver25: !!rules?.enableUnderOver25, matchdayAwards: !!rules?.enableMatchdayAwards },
  });
});

// Read-only: returns the rule + setting values that affect the league regulation ("Regolamento").
// It is league-scoped via x-league-id header or via leagueId/leagueCode query params.
publicRouter.get("/regolamento-config", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  await ensureLeagueConfig(league.id);

  const [rules, settings, lockInfo] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId: league.id } }),
    prisma.setting.findUnique({ where: { leagueId: league.id } }),
    getLockInfo(league.id),
  ]);

  if (!rules || !settings) return res.status(500).json({ message: "Missing league config" });

  res.json({
    league: { id: league.id, name: league.name, code: league.code },
    rules: {
      pointsExact: rules.pointsExact,
      pointsOutcome: rules.pointsOutcome,
      pointsSumGoals: rules.pointsSumGoals,
      enableUnderOver25: rules.enableUnderOver25,
      pointsUnderOver25: rules.pointsUnderOver25,
      enableMatchdayAwards: rules.enableMatchdayAwards,
      scoringMode: rules.scoringMode,
      allowOutcomeWithExact: rules.allowOutcomeWithExact,
      allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
      allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
    },
    settings: {
      lockUntil: settings.lockUntil,
      isForceLocked: settings.isForceLocked,
      tieBreak1: settings.tieBreak1,
      tieBreak2: settings.tieBreak2,
      tieBreak3: settings.tieBreak3,
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
  if (!league) return res.status(400).json({ message: "Missing leagueId or leagueCode" });

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
  const [settings, rules] = await Promise.all([
    prisma.setting.findUnique({ where: { leagueId: league.id } }),
    prisma.rule.findUnique({ where: { leagueId: league.id } }),
  ]);
  if (!rules) return res.status(500).json({ message: "Missing rules for league" });

  // Points breakdown is normalized in DB (non-counting categories are zeroed).
  // Therefore hit counters can be computed directly from positive per-category points.

  // Aggregate predictions per user to compute totals + hit counts.
  const preds = await prisma.prediction.findMany({
    where: { leagueId: league.id },
    select: { userId: true, totalPoints: true, pointsExact: true, pointsOutcome: true, pointsSumGoals: true, pointsUnderOver: true },
  });

  const agg = new Map<
    string,
    { totalPoints: number; exactHits: number; outcomeHits: number; sumGoalsHits: number; underOverHits: number }
  >();

  for (const p of preds) {
    const a = agg.get(p.userId) || { totalPoints: 0, exactHits: 0, outcomeHits: 0, sumGoalsHits: 0, underOverHits: 0 };
    a.totalPoints += p.totalPoints ?? 0;
    if ((p.pointsExact ?? 0) > 0) a.exactHits += 1;
    if ((p.pointsOutcome ?? 0) > 0) a.outcomeHits += 1;
    if ((p.pointsSumGoals ?? 0) > 0) a.sumGoalsHits += 1;
    if (rules.enableUnderOver25 && (p.pointsUnderOver ?? 0) > 0) a.underOverHits += 1;
    agg.set(p.userId, a);
  }

  const awardCounts = rules.enableMatchdayAwards
    ? await prisma.matchdayAward.groupBy({
        by: ["userId"],
        where: { leagueId: league.id },
        _count: { userId: true },
      })
    : [];
  const awardByUser = new Map<string, number>(awardCounts.map((r) => [r.userId, r._count.userId]));

  const members = await prisma.leagueMember.findMany({
    where: { leagueId: league.id, status: "APPROVED" },
    include: { user: true },
  });

  let rows = members.map((m) => ({
    userId: m.user.id,
    displayName: m.user.displayName,
    totalPoints: agg.get(m.user.id)?.totalPoints ?? 0,
    exactHits: agg.get(m.user.id)?.exactHits ?? 0,
    outcomeHits: agg.get(m.user.id)?.outcomeHits ?? 0,
    sumGoalsHits: agg.get(m.user.id)?.sumGoalsHits ?? 0,
    underOverHits: rules.enableUnderOver25 ? agg.get(m.user.id)?.underOverHits ?? 0 : 0,
    matchdayWins: rules.enableMatchdayAwards ? awardByUser.get(m.user.id) ?? 0 : 0,
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
      return row.sumGoalsHits;
    };

    const byName = (a: any, b: any) => a.displayName.localeCompare(b.displayName);

    const cmpPoints = (dir: "asc" | "desc") => (a: any, b: any) => {
      const s = dir === "asc" ? 1 : -1;
      if (a.totalPoints !== b.totalPoints) return (a.totalPoints - b.totalPoints) * s;
      const d1 = (getTieVal(a, tie1) - getTieVal(b, tie1)) * s;
      if (d1 !== 0) return d1;
      const d2 = (getTieVal(a, tie2) - getTieVal(b, tie2)) * s;
      if (d2 !== 0) return d2;
      const d3 = (getTieVal(a, tie3) - getTieVal(b, tie3)) * s;
      if (d3 !== 0) return d3;
      return byName(a, b);
    };

    const cmpMetric = (key: "exactHits" | "outcomeHits" | "sumGoalsHits", dir: "asc" | "desc") => (a: any, b: any) => {
      const s = dir === "asc" ? 1 : -1;
      if (a[key] !== b[key]) return (a[key] - b[key]) * s;
      // secondary: points (same direction for coherence)
      if (a.totalPoints !== b.totalPoints) return (a.totalPoints - b.totalPoints) * s;
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
    features: { underOver25: !!rules.enableUnderOver25, matchdayAwards: !!rules.enableMatchdayAwards },
    tieBreakers: { tieBreak1: settings?.tieBreak1 ?? "EXACT", tieBreak2: settings?.tieBreak2 ?? "OUTCOME", tieBreak3: settings?.tieBreak3 ?? "SUM_GOALS" },
    leaderboard: rows,
  });
});

// Read-only: league statistics (insights).
// League-scoped via x-league-id header or via leagueId/leagueCode query params.
publicRouter.get("/stats", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  await ensureLeagueConfig(league.id);

  const [members, matches, rules] = await Promise.all([
    prisma.leagueMember.findMany({
      where: { leagueId: league.id, status: "APPROVED" },
      include: { user: true },
    }),
    prisma.match.findMany({ orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }] }),
    prisma.rule.findUnique({ where: { leagueId: league.id } }),
  ]);

  const matchdays = Array.from(new Set(matches.map((m) => m.matchday ?? 1))).sort((a, b) => a - b);
  const now = Date.now();

  const isFinished = (m: any) => {
    if (m?.status === "FINISHED") return true;
    const ko = new Date(m?.kickoffAt).getTime();
    return Number.isFinite(ko) ? ko < now - 4 * 60 * 60 * 1000 : false;
  };

  const currentMatchday = (() => {
    const md = matchdays.find((md) => matches.some((m) => (m.matchday ?? 1) === md && !isFinished(m)));
    return md ?? matchdays[0] ?? 1;
  })();

  const isNotStarted = (m: any) => {
    if (m?.status === "NOT_STARTED") return true;
    const ko = new Date(m?.kickoffAt).getTime();
    return Number.isFinite(ko) ? ko > now : false;
  };

  const nextMatchday = (() => {
    const after = matchdays.filter((m) => m > currentMatchday);
    const md = after.find((md) => matches.filter((m) => (m.matchday ?? 1) === md).every(isNotStarted));
    return md ?? null;
  })();

  const predictionCounts = await prisma.prediction.count({ where: { leagueId: league.id } });

  // Aggregate correctness per match (only finished matches with score)
  const finished = matches.filter((m) => (m.homeScore ?? null) !== null && (m.awayScore ?? null) !== null && isFinished(m));
  const finishedIds = finished.map((m) => m.id);
  const preds = finishedIds.length
    ? await prisma.prediction.findMany({
        where: { leagueId: league.id, matchId: { in: finishedIds } },
        select: { matchId: true, homeGoals: true, awayGoals: true },
      })
    : [];

  const matchById = new Map(finished.map((m) => [m.id, m]));

  const outcome = (h: number, a: number) => (h > a ? "1" : h < a ? "2" : "X");

  const aggByMatch = new Map<
    string,
    { total: number; exact: number; outcome: number; sumGoals: number; underOver: number }
  >();

  for (const p of preds) {
    const m: any = matchById.get(p.matchId);
    if (!m) continue;
    const a = aggByMatch.get(p.matchId) || { total: 0, exact: 0, outcome: 0, sumGoals: 0, underOver: 0 };
    a.total += 1;

    const ph = p.homeGoals;
    const pa = p.awayGoals;
    const rh = m.homeScore as number;
    const ra = m.awayScore as number;
    if (ph === rh && pa === ra) a.exact += 1;
    if (outcome(ph, pa) === outcome(rh, ra)) a.outcome += 1;
    if (ph + pa === rh + ra) a.sumGoals += 1;
    if (rules?.enableUnderOver25) {
      const pu = ph + pa >= 3;
      const ru = rh + ra >= 3;
      if (pu === ru) a.underOver += 1;
    }
    aggByMatch.set(p.matchId, a);
  }

  const matchStats = Array.from(aggByMatch.entries())
    .map(([matchId, a]) => {
      const m: any = matchById.get(matchId);
      const total = a.total || 1;
      return {
        matchId,
        matchday: m.matchday ?? 1,
        kickoffAt: m.kickoffAt,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeLogo: (m as any).homeLogo ?? null,
        awayLogo: (m as any).awayLogo ?? null,
        result: { home: m.homeScore, away: m.awayScore },
        totals: a,
        rates: {
          exact: a.exact / total,
          outcome: a.outcome / total,
          sumGoals: a.sumGoals / total,
          underOver: rules?.enableUnderOver25 ? a.underOver / total : 0,
        },
      };
    })
    .filter((x) => x.totals.total >= 3) // avoid noisy results with too few predictions
    .sort((a, b) => a.rates.outcome - b.rates.outcome);

  const hardestMatches = matchStats.slice(0, 3);
  const easiestMatches = matchStats.slice().reverse().slice(0, 3);

  // Top players by total points and by hit categories (using existing leaderboard aggregation logic)
  const leaderboard = await prisma.prediction.findMany({
    where: { leagueId: league.id },
    select: { userId: true, totalPoints: true, pointsExact: true, pointsOutcome: true, pointsSumGoals: true, pointsUnderOver: true },
  });

  const perUser = new Map<string, { totalPoints: number; exactHits: number; outcomeHits: number; sumGoalsHits: number; underOverHits: number }>();
  for (const p of leaderboard) {
    const a = perUser.get(p.userId) || { totalPoints: 0, exactHits: 0, outcomeHits: 0, sumGoalsHits: 0, underOverHits: 0 };
    a.totalPoints += p.totalPoints ?? 0;
    if ((p.pointsExact ?? 0) > 0) a.exactHits += 1;
    if ((p.pointsOutcome ?? 0) > 0) a.outcomeHits += 1;
    if ((p.pointsSumGoals ?? 0) > 0) a.sumGoalsHits += 1;
    if (rules?.enableUnderOver25 && (p.pointsUnderOver ?? 0) > 0) a.underOverHits += 1;
    perUser.set(p.userId, a);
  }

  const memberById = new Map(members.map((m) => [m.userId, m.user]));
  const rows = Array.from(perUser.entries()).map(([userId, a]) => ({
    userId,
    displayName: memberById.get(userId)?.displayName ?? "Utente",
    ...a,
  }));

  const topTotal = rows.slice().sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);
  const topExact = rows.slice().sort((a, b) => b.exactHits - a.exactHits).slice(0, 3);
  const topOutcome = rows.slice().sort((a, b) => b.outcomeHits - a.outcomeHits).slice(0, 3);
  const topSumGoals = rows.slice().sort((a, b) => b.sumGoalsHits - a.sumGoalsHits).slice(0, 3);

  res.json({
    league: { id: league.id, name: league.name, code: league.code },
    summary: {
      participants: members.length,
      matches: matches.length,
      matchdays: matchdays.length,
      predictions: predictionCounts,
      currentMatchday,
      nextMatchday,
    },
    leaderboards: {
      topTotal,
      topExact,
      topOutcome,
      topSumGoals,
    },
    matches: {
      hardest: hardestMatches,
      easiest: easiestMatches,
    },
  });
});

publicRouter.get("/users/:id/summary", async (req, res) => {
  const league = await resolveLeague(req);
  if (!league) return res.status(400).json({ message: "Missing leagueId or leagueCode" });

  await ensureLeagueConfig(league.id);
  const rules = await prisma.rule.findUnique({ where: { leagueId: league.id } });

  const userId = req.params.id;

  // Viewing other users' predictions is gated behind a short "rewarded ad" window.
  // We require authentication here so we can verify unlock state.
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
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
      const row = await prisma.adUnlock.findUnique({ where: { userId: viewerId } });
      const now = new Date();
      const ok = !!row && row.expiresAt.getTime() > now.getTime();
      if (!ok) {
        return res.status(403).json({
          code: "AD_REQUIRED",
          message: "Guarda una pubblicità per visualizzare i pronostici degli altri utenti",
          unlockMinutes: cfg.unlockMinutes,
          demoAdsEnabled: cfg.demoAdsEnabled,
        });
      }
    }
  }

  const member = await prisma.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: league.id, userId } }, include: { user: true } });
  if (!member || member.status !== "APPROVED") return res.status(404).json({ message: "User not in league" });

  const matches = await prisma.match.findMany({ orderBy: { kickoffAt: "asc" } });
  const preds = await prisma.prediction.findMany({ where: { leagueId: league.id, userId } });
  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));

  const detail = matches.map((m) => {
    const p = predByMatch.get(m.id);
    const real = m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null ? { home: m.homeScore, away: m.awayScore } : null;
    return {
      match: m,
      prediction: p ? { homeGoals: p.homeGoals, awayGoals: p.awayGoals } : null,
      real,
      points: p
        ? { exact: p.pointsExact, outcome: p.pointsOutcome, sumGoals: p.pointsSumGoals, underOver: p.pointsUnderOver, total: p.totalPoints }
        : { exact: 0, outcome: 0, sumGoals: 0, underOver: 0, total: 0 },
    };
  });

  const totals = detail.reduce(
    (acc, d) => {
      acc.exact += d.points.exact;
      acc.outcome += d.points.outcome;
      acc.sumGoals += d.points.sumGoals;
      acc.underOver += d.points.underOver;
      acc.total += d.points.total;
      return acc;
    },
    { exact: 0, outcome: 0, sumGoals: 0, underOver: 0, total: 0 }
  );

  res.json({
    league: { id: league.id, code: league.code, name: league.name },
    features: { underOver25: !!rules?.enableUnderOver25, matchdayAwards: !!rules?.enableMatchdayAwards },
    user: { id: member.user.id, displayName: member.user.displayName, email: member.user.email },
    detail,
    totals,
  });
});
