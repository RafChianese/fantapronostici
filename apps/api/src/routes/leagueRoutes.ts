import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueMember, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";

export const leagueRouter = Router();

/**
 * League statistics endpoint.
 * Scope: current league (x-league-id or query leagueId).
 */
leagueRouter.get("/stats", requireAuth, requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

  // Fetch approved members (for display names) + predictions with matchday/status.
  const [members, preds, rules] = await Promise.all([
    prisma.leagueMember.findMany({
      where: { leagueId, status: "APPROVED" },
      include: { user: { select: { id: true, displayName: true } } },
    }),
    prisma.prediction.findMany({
      where: { leagueId },
      select: {
        userId: true,
        totalPoints: true,
        pointsExact: true,
        pointsOutcome: true,
        pointsSumGoals: true,
        pointsUnderOver: true,
        match: { select: { matchday: true, status: true } },
      },
    }),
    prisma.rule.findUnique({ where: { leagueId } }),
  ]);

  const nameByUser = new Map<string, string>(members.map((m) => [m.user.id, m.user.displayName]));

  // Aggregate per-user totals + hit counts (counts are per-match, not points)
  const userAgg = new Map<
    string,
    { total: number; exact: number; outcome: number; sumGoals: number; underOver: number }
  >();
  for (const p of preds) {
    const a = userAgg.get(p.userId) || { total: 0, exact: 0, outcome: 0, sumGoals: 0, underOver: 0 };
    a.total += p.totalPoints ?? 0;
    if ((p.pointsExact ?? 0) > 0) a.exact += 1;
    if ((p.pointsOutcome ?? 0) > 0) a.outcome += 1;
    if ((p.pointsSumGoals ?? 0) > 0) a.sumGoals += 1;
    if ((rules as any)?.enableUnderOver25 && (p.pointsUnderOver ?? 0) > 0) a.underOver += 1;
    userAgg.set(p.userId, a);
  }

  // Top performers (game-appropriate naming). Keep bestAttack/bestDefense for backward compatibility.
  let topTotalPoints: null | { userId: string; displayName: string; value: number } = null;
  let topExactHits: null | { userId: string; displayName: string; value: number } = null;
  let topOutcomeHits: null | { userId: string; displayName: string; value: number } = null;
  let topSumGoalsHits: null | { userId: string; displayName: string; value: number } = null;
  let topUnderOverHits: null | { userId: string; displayName: string; value: number } = null;

  for (const [userId, a] of userAgg.entries()) {
    const displayName = nameByUser.get(userId) || "Utente";
    if (!topTotalPoints || a.total > topTotalPoints.value) topTotalPoints = { userId, displayName, value: a.total };
    if (!topExactHits || a.exact > topExactHits.value) topExactHits = { userId, displayName, value: a.exact };
    if (!topOutcomeHits || a.outcome > topOutcomeHits.value) topOutcomeHits = { userId, displayName, value: a.outcome };
    if (!topSumGoalsHits || a.sumGoals > topSumGoalsHits.value) topSumGoalsHits = { userId, displayName, value: a.sumGoals };
    if ((rules as any)?.enableUnderOver25) {
      if (!topUnderOverHits || a.underOver > topUnderOverHits.value) topUnderOverHits = { userId, displayName, value: a.underOver };
    }
  }

  const bestAttack = topTotalPoints;
  const bestDefense = topExactHits;

  // Hit totals (league)
  const exactTotal = preds.reduce((s, p) => s + ((p.pointsExact ?? 0) > 0 ? 1 : 0), 0);
  const outcomeTotal = preds.reduce((s, p) => s + ((p.pointsOutcome ?? 0) > 0 ? 1 : 0), 0);
  const sumGoalsTotal = preds.reduce((s, p) => s + ((p.pointsSumGoals ?? 0) > 0 ? 1 : 0), 0);
  const underOverTotal = (rules as any)?.enableUnderOver25 ? preds.reduce((s, p) => s + ((p.pointsUnderOver ?? 0) > 0 ? 1 : 0), 0) : 0;

  // Matchday aggregates: per user per matchday points, then compute avg per matchday
  const matchdayUserTotals = new Map<string, number>(); // key: `${md}:${userId}`
  const matchdayStatus = new Map<number, "NOT_STARTED" | "IN_PROGRESS" | "FINISHED">();

  for (const p of preds) {
    const md = Number(p.match?.matchday ?? 0);
    if (!md) continue;

    const key = `${md}:${p.userId}`;
    matchdayUserTotals.set(key, (matchdayUserTotals.get(key) || 0) + (p.totalPoints ?? 0));

    // Track matchday status (if any match in progress -> IN_PROGRESS, else if any not started -> NOT_STARTED, else FINISHED)
    const st = (p.match?.status as any) || "NOT_STARTED";
    const prev = matchdayStatus.get(md);
    if (!prev) {
      matchdayStatus.set(md, st);
    } else {
      if (prev === "IN_PROGRESS" || st === "IN_PROGRESS") matchdayStatus.set(md, "IN_PROGRESS");
      else if (prev === "NOT_STARTED" || st === "NOT_STARTED") matchdayStatus.set(md, "NOT_STARTED");
      else matchdayStatus.set(md, "FINISHED");
    }
  }

  const matchdays = Array.from(matchdayStatus.keys()).sort((a, b) => a - b);

  const matchdayTotals = new Map<number, { total: number; samples: number }>(); // samples = number of users with any prediction in md
  for (const md of matchdays) {
    matchdayTotals.set(md, { total: 0, samples: 0 });
  }

  for (const [key, total] of matchdayUserTotals.entries()) {
    const [mdStr] = key.split(":");
    const md = Number(mdStr);
    const rec = matchdayTotals.get(md);
    if (!rec) continue;
    rec.total += total;
    rec.samples += 1;
    matchdayTotals.set(md, rec);
  }

  const matchdayAverages = matchdays.map((md) => {
    const rec = matchdayTotals.get(md) || { total: 0, samples: 0 };
    const avg = rec.samples > 0 ? rec.total / rec.samples : 0;
    return { matchday: md, avgPoints: avg, totalPoints: rec.total, samples: rec.samples, status: matchdayStatus.get(md) || "NOT_STARTED" };
  });

  // League average points per matchday (finished matchdays only for stability)
  const finished = matchdayAverages.filter((m) => m.status === "FINISHED" && m.samples > 0);
  const avgPointsPerMatchday = finished.length ? finished.reduce((s, m) => s + m.avgPoints, 0) / finished.length : 0;

  // Best/worst matchday (by avg points, finished only; fallback to all)
  const baseForBestWorst = finished.length ? finished : matchdayAverages.filter((m) => m.samples > 0);
  const bestMatchday = baseForBestWorst.reduce((best, cur) => (!best || cur.avgPoints > best.avgPoints ? cur : best), null as any);
  const worstMatchday = baseForBestWorst.reduce((worst, cur) => (!worst || cur.avgPoints < worst.avgPoints ? cur : worst), null as any);

  // Score distribution: bucket matchday totals per user per matchday (finished only preferred)
  const distValues: number[] = [];
  const mdAllowed = new Set<number>((finished.length ? finished : matchdayAverages).map((m) => m.matchday));

  for (const [key, total] of matchdayUserTotals.entries()) {
    const [mdStr] = key.split(":");
    const md = Number(mdStr);
    if (!mdAllowed.has(md)) continue;
    distValues.push(total);
  }

  // Buckets: 0, 1-3, 4-6, 7-9, 10+
  const buckets = [
    { label: "0", min: 0, max: 0, count: 0 },
    { label: "1–3", min: 1, max: 3, count: 0 },
    { label: "4–6", min: 4, max: 6, count: 0 },
    { label: "7–9", min: 7, max: 9, count: 0 },
    { label: "10+", min: 10, max: 10_000, count: 0 },
  ];

  for (const v of distValues) {
    const b = buckets.find((b) => v >= b.min && v <= b.max);
    if (b) b.count += 1;
  }

  res.json({
    // Backward compatible fields
    bestAttack,
    bestDefense,

    // Preferred fields
    topTotalPoints,
    topExactHits,
    topOutcomeHits,
    topSumGoalsHits,
    topUnderOverHits,

    features: { underOver25: !!(rules as any)?.enableUnderOver25 },

    avgPointsPerMatchday,
    exactTotal,
    outcomeTotal,
    sumGoalsTotal,
    underOverTotal,
    distribution: buckets.map((b) => ({ label: b.label, count: b.count })),
    bestMatchday: bestMatchday ? { matchday: bestMatchday.matchday, avgPoints: bestMatchday.avgPoints } : null,
    worstMatchday: worstMatchday ? { matchday: worstMatchday.matchday, avgPoints: worstMatchday.avgPoints } : null,
  });
});
