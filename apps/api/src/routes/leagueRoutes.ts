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
  const [members, preds] = await Promise.all([
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
        match: { select: { matchday: true, status: true } },
      },
    }),
  ]);

  const nameByUser = new Map<string, string>(members.map((m) => [m.user.id, m.user.displayName]));

  // Aggregate per-user totals + exact count
  const userAgg = new Map<string, { total: number; exact: number }>();
  for (const p of preds) {
    const a = userAgg.get(p.userId) || { total: 0, exact: 0 };
    a.total += p.totalPoints ?? 0;
    if ((p.pointsExact ?? 0) > 0) a.exact += 1;
    userAgg.set(p.userId, a);
  }

  // Best attack = highest total points (football metaphor)
  let bestAttack: null | { userId: string; displayName: string; value: number } = null;
  // Best defense = highest exact hits (precision)
  let bestDefense: null | { userId: string; displayName: string; value: number } = null;

  for (const [userId, a] of userAgg.entries()) {
    const displayName = nameByUser.get(userId) || "Utente";
    if (!bestAttack || a.total > bestAttack.value) bestAttack = { userId, displayName, value: a.total };
    if (!bestDefense || a.exact > bestDefense.value) bestDefense = { userId, displayName, value: a.exact };
  }

  // Exact results total (league)
  const exactTotal = preds.reduce((s, p) => s + ((p.pointsExact ?? 0) > 0 ? 1 : 0), 0);

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
    bestAttack,
    bestDefense,
    avgPointsPerMatchday,
    exactTotal,
    distribution: buckets.map((b) => ({ label: b.label, count: b.count })),
    bestMatchday: bestMatchday ? { matchday: bestMatchday.matchday, avgPoints: bestMatchday.avgPoints } : null,
    worstMatchday: worstMatchday ? { matchday: worstMatchday.matchday, avgPoints: worstMatchday.avgPoints } : null,
  });
});
