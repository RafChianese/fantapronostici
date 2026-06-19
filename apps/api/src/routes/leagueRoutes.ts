import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  requireAuth,
  requireLeagueMember,
  resolveLeagueId,
  AuthedRequest,
} from "../middleware/authMiddleware.js";
import { filterPredictableMatches } from "../lib/predictableMatches.js";

export const leagueRouter = Router();

type Winner = { userId: string; displayName: string; value: number };
type FunRecord = Record<string, number> & {
  predictedCount: number;
  predictedGoals: number;
};

async function getLeagueFinalizationSafe(leagueId: string) {
  const delegate = (prisma as any).leagueFinalization;
  if (!delegate?.findUnique) return null;
  try {
    return await delegate.findUnique({ where: { leagueId } });
  } catch (error: any) {
    // Deploy-safe fallback: if the migration was not applied yet, keep user pages alive.
    if (["P2021", "P2022"].includes(error?.code)) return null;
    throw error;
  }
}

function outcome(h: number, a: number) {
  return h > a ? "H" : h < a ? "A" : "D";
}

function isFiniteScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function buildStat(
  key: string,
  title: string,
  description: string,
  agg: Map<string, FunRecord>,
  nameByUser: Map<string, string>,
  format?: (v: number) => number,
) {
  let best = -Infinity;
  for (const [_, a] of agg.entries())
    best = Math.max(best, Number(a[key] || 0));
  if (!Number.isFinite(best) || best <= 0) return null;
  const winners = Array.from(agg.entries())
    .filter(([_, a]) => Number(a[key] || 0) === best)
    .map(([userId, a]) => ({
      userId,
      displayName: nameByUser.get(userId) || "Utente",
      value: format ? format(Number(a[key] || 0)) : Number(a[key] || 0),
    }));
  const first = winners[0];
  return {
    key,
    title,
    description,
    ...first,
    winners,
    tieCount: winners.length,
  };
}

async function computeLeaderboardRows(leagueId: string) {
  const [settings, rules, monetization, preds, comp, members, awardCounts] =
    await Promise.all([
      prisma.setting.findUnique({ where: { leagueId } }),
      prisma.rule.findUnique({ where: { leagueId } }),
      prisma.leagueMonetization.findUnique({
        where: { leagueId },
        include: { prizes: true },
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
        },
      }),
      prisma.competitionPick.groupBy({
        by: ["userId"],
        where: { leagueId },
        _sum: { pointsAwarded: true },
      }),
      prisma.leagueMember.findMany({
        where: { leagueId, status: "APPROVED" },
        include: { user: true },
      }),
      prisma.matchdayAward
        .groupBy({
          by: ["userId"],
          where: { leagueId },
          _count: { userId: true },
        })
        .catch(() => [] as any[]),
    ]);

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
    if ((rules as any)?.enableUnderOver25 && Number(p.pointsUnderOver ?? 0) > 0)
      a.underOverHits += 1;
    agg.set(p.userId, a);
  }
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
  const awardByUser = new Map<string, number>(
    (awardCounts as any[]).map((r) => [
      String(r.userId),
      Number(r._count?.userId ?? 0),
    ]),
  );
  let rows = members.map((m: any) => ({
    userId: m.user.id,
    displayName: m.user.displayName,
    avatarId: m.user.avatarId ?? null,
    avatarJson: m.user.avatarJson ?? null,
    totalPoints: agg.get(m.user.id)?.totalPoints ?? 0,
    competitionPoints: agg.get(m.user.id)?.competitionPoints ?? 0,
    exactHits: agg.get(m.user.id)?.exactHits ?? 0,
    outcomeHits: agg.get(m.user.id)?.outcomeHits ?? 0,
    sumGoalsHits: agg.get(m.user.id)?.sumGoalsHits ?? 0,
    underOverHits: (rules as any)?.enableUnderOver25
      ? (agg.get(m.user.id)?.underOverHits ?? 0)
      : 0,
    matchdayWins: (rules as any)?.enableMatchdayAwards
      ? (awardByUser.get(m.user.id) ?? 0)
      : 0,
  }));
  const tie1 = settings?.tieBreak1 ?? "EXACT";
  const tie2 = settings?.tieBreak2 ?? "OUTCOME";
  const tie3 = settings?.tieBreak3 ?? "SUM_GOALS";
  const getTieVal = (row: any, c: string) =>
    c === "EXACT"
      ? row.exactHits
      : c === "OUTCOME"
        ? row.outcomeHits
        : row.sumGoalsHits;
  rows = rows.sort((a: any, b: any) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    for (const t of [tie1, tie2, tie3]) {
      const d = getTieVal(b, t) - getTieVal(a, t);
      if (d) return d;
    }
    return String(a.displayName).localeCompare(String(b.displayName), "it");
  });
  return { rows, monetization };
}

/** League statistics endpoint. Scope: current league (x-league-id or query leagueId). */
leagueRouter.get(
  "/stats",
  requireAuth,
  requireLeagueMember,
  async (req: AuthedRequest, res) => {
    const leagueId = resolveLeagueId(req);
    if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

    const [members, rawMatches, rules] = await Promise.all([
      prisma.leagueMember.findMany({
        where: { leagueId, status: "APPROVED" },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      prisma.match.findMany({
        select: {
          id: true,
          matchday: true,
          status: true,
          homeScore: true,
          awayScore: true,
          homeTeam: true,
          awayTeam: true,
          kickoffAt: true,
        },
        orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }],
      }),
      prisma.rule.findUnique({ where: { leagueId } }),
    ]);
    const memberIds = (members as any[]).map((m: any) => m.user.id);
    const nameByUser = new Map<string, string>(
      (members as any[]).map((m: any) => [m.user.id, m.user.displayName]),
    );
    const matches = await filterPredictableMatches(rawMatches as any[]);
    const matchIds = new Set(matches.map((m: any) => String(m.id)));

    const preds = await prisma.prediction.findMany({
      where: {
        leagueId,
        userId: { in: memberIds },
        matchId: { in: Array.from(matchIds) },
      },
      select: {
        userId: true,
        totalPoints: true,
        pointsExact: true,
        pointsOutcome: true,
        pointsSumGoals: true,
        pointsUnderOver: true,
        homeGoals: true,
        awayGoals: true,
        match: {
          select: {
            id: true,
            matchday: true,
            status: true,
            homeScore: true,
            awayScore: true,
          },
        },
      },
    });

    const userAgg = new Map<
      string,
      {
        total: number;
        exact: number;
        outcome: number;
        pragmatic: number;
        sumGoals: number;
        underOver: number;
      }
    >();
    const funAgg = new Map<string, FunRecord>();
    const ensureFun = (userId: string) => {
      const a =
        funAgg.get(userId) ||
        ({ predictedCount: 0, predictedGoals: 0 } as FunRecord);
      funAgg.set(userId, a);
      return a;
    };

    for (const p of preds as any[]) {
      const a = userAgg.get(p.userId) || {
        total: 0,
        exact: 0,
        outcome: 0,
        pragmatic: 0,
        sumGoals: 0,
        underOver: 0,
      };
      const exact = Number(p.pointsExact ?? 0) > 0;
      const out = Number(p.pointsOutcome ?? 0) > 0;
      const sum = Number(p.pointsSumGoals ?? 0) > 0;
      const uo =
        !!(rules as any)?.enableUnderOver25 &&
        Number(p.pointsUnderOver ?? 0) > 0;
      a.total += Number(p.totalPoints ?? 0);
      if (exact) a.exact += 1;
      if (out) a.outcome += 1;
      if (out && !exact) a.pragmatic += 1;
      if (sum) a.sumGoals += 1;
      if (uo) a.underOver += 1;
      userAgg.set(p.userId, a);

      const fa = ensureFun(p.userId);
      const ph = Number(p.homeGoals),
        pa = Number(p.awayGoals);
      if (Number.isFinite(ph) && Number.isFinite(pa)) {
        fa.predictedCount += 1;
        fa.predictedGoals += ph + pa;
        if (ph + pa >= 5) fa.kamikaze = (fa.kamikaze || 0) + 1;
        if (
          (ph === 0 && pa === 0) ||
          (ph === 1 && pa === 0) ||
          (ph === 0 && pa === 1)
        )
          fa.catenacciaro = (fa.catenacciaro || 0) + 1;
        if (ph === pa) fa.conservatore = (fa.conservatore || 0) + 1;
      }
      const rh = p.match?.homeScore,
        ra = p.match?.awayScore;
      const finished =
        p.match?.status === "FINISHED" &&
        isFiniteScore(rh) &&
        isFiniteScore(ra);
      if (finished) {
        if (exact && rh === ra) fa.drawExact = (fa.drawExact || 0) + 1;
        if (exact && rh + ra >= 4) fa.bigExact = (fa.bigExact || 0) + 1;
        if (exact && rh === 0 && ra === 0) fa.zeroZero = (fa.zeroZero || 0) + 1;
        if (uo && !exact && !out && !sum)
          fa.underOverOnly = (fa.underOverOnly || 0) + 1;
        if (!exact && Math.abs(ph - rh) + Math.abs(pa - ra) === 1)
          fa.cuoreSpezzato = (fa.cuoreSpezzato || 0) + 1;
        if (ph + pa >= 4 && rh + ra <= 1)
          fa.bomberMancato = (fa.bomberMancato || 0) + 1;
      }
    }
    const byMatch = new Map<string, any[]>();
    for (const p of preds as any[]) {
      const id = String(p.match?.id || "");
      if (!id) continue;
      byMatch.set(id, [...(byMatch.get(id) || []), p]);
    }
    for (const rows of byMatch.values()) {
      for (const p of rows) {
        const others = rows.filter((x) => x.userId !== p.userId);
        const counts = { H: 0, A: 0 };
        for (const o of others) {
          const oh = Number(o.homeGoals),
            oa = Number(o.awayGoals);
          if (!Number.isFinite(oh) || !Number.isFinite(oa) || oh === oa)
            continue;
          if (oh > oa) counts.H++;
          else counts.A++;
        }
        const majority =
          counts.H > counts.A ? "H" : counts.A > counts.H ? "A" : null;
        if (!majority) continue;
        const ph = Number(p.homeGoals),
          pa = Number(p.awayGoals);
        if (!Number.isFinite(ph) || !Number.isFinite(pa) || ph === pa) continue;
        if (outcome(ph, pa) !== majority) {
          const fa = ensureFun(p.userId);
          fa.gufatore = (fa.gufatore || 0) + 1;
        }
      }
    }

    for (const [uid, fa] of funAgg.entries()) {
      if (fa.predictedCount >= 3) {
        fa.folle =
          Math.round((fa.predictedGoals / fa.predictedCount) * 100) / 100;
        fa.prudente = fa.folle;
      }
    }

    let topTotalPoints: Winner | null = null,
      topExactHits: Winner | null = null,
      topOutcomeHits: Winner | null = null,
      topSumGoalsHits: Winner | null = null,
      topUnderOverHits: Winner | null = null,
      topPragmaticHits: Winner | null = null;
    for (const [userId, a] of userAgg.entries()) {
      const displayName = nameByUser.get(userId) || "Utente";
      if (!topTotalPoints || a.total > topTotalPoints.value)
        topTotalPoints = { userId, displayName, value: a.total };
      if (!topExactHits || a.exact > topExactHits.value)
        topExactHits = { userId, displayName, value: a.exact };
      if (!topOutcomeHits || a.outcome > topOutcomeHits.value)
        topOutcomeHits = { userId, displayName, value: a.outcome };
      if (!topPragmaticHits || a.pragmatic > topPragmaticHits.value)
        topPragmaticHits = { userId, displayName, value: a.pragmatic };
      if (!topSumGoalsHits || a.sumGoals > topSumGoalsHits.value)
        topSumGoalsHits = { userId, displayName, value: a.sumGoals };
      if (
        (rules as any)?.enableUnderOver25 &&
        (!topUnderOverHits || a.underOver > topUnderOverHits.value)
      )
        topUnderOverHits = { userId, displayName, value: a.underOver };
    }
    if (topPragmaticHits && topPragmaticHits.value <= 0)
      topPragmaticHits = null;

    const exactTotal = preds.reduce(
      (s: number, p: any) => s + (Number(p.pointsExact ?? 0) > 0 ? 1 : 0),
      0,
    );
    const outcomeTotal = preds.reduce(
      (s: number, p: any) => s + (Number(p.pointsOutcome ?? 0) > 0 ? 1 : 0),
      0,
    );
    const sumGoalsTotal = preds.reduce(
      (s: number, p: any) => s + (Number(p.pointsSumGoals ?? 0) > 0 ? 1 : 0),
      0,
    );
    const underOverTotal = (rules as any)?.enableUnderOver25
      ? preds.reduce(
          (s: number, p: any) =>
            s + (Number(p.pointsUnderOver ?? 0) > 0 ? 1 : 0),
          0,
        )
      : 0;

    const matchdayUserTotals = new Map<string, number>();
    const matchdayStatus = new Map<
      number,
      "NOT_STARTED" | "IN_PROGRESS" | "FINISHED"
    >();
    for (const p of preds as any[]) {
      const md = Number(p.match?.matchday ?? 0);
      if (!md) continue;
      const key = `${md}:${p.userId}`;
      matchdayUserTotals.set(
        key,
        (matchdayUserTotals.get(key) || 0) + Number(p.totalPoints ?? 0),
      );
      const st = (p.match?.status as any) || "NOT_STARTED";
      const prev = matchdayStatus.get(md);
      if (!prev) matchdayStatus.set(md, st);
      else if (prev === "IN_PROGRESS" || st === "IN_PROGRESS")
        matchdayStatus.set(md, "IN_PROGRESS");
      else if (prev === "NOT_STARTED" || st === "NOT_STARTED")
        matchdayStatus.set(md, "NOT_STARTED");
      else matchdayStatus.set(md, "FINISHED");
    }
    const matchdays = Array.from(matchdayStatus.keys()).sort((a, b) => a - b);
    const matchdayTotals = new Map<number, { total: number; samples: number }>(
      matchdays.map((md) => [md, { total: 0, samples: 0 }]),
    );
    for (const [key, total] of matchdayUserTotals.entries()) {
      const md = Number(key.split(":")[0]);
      const r = matchdayTotals.get(md);
      if (r) {
        r.total += total;
        r.samples += 1;
      }
    }
    const matchdayAverages = matchdays.map((md) => {
      const r = matchdayTotals.get(md) || { total: 0, samples: 0 };
      return {
        matchday: md,
        avgPoints: r.samples ? r.total / r.samples : 0,
        totalPoints: r.total,
        samples: r.samples,
        status: matchdayStatus.get(md) || "NOT_STARTED",
      };
    });
    const finished = matchdayAverages.filter(
      (m) => m.status === "FINISHED" && m.samples > 0,
    );
    const avgPointsPerMatchday = finished.length
      ? finished.reduce((s, m) => s + m.avgPoints, 0) / finished.length
      : 0;
    const baseForBestWorst = finished.length
      ? finished
      : matchdayAverages.filter((m) => m.samples > 0);
    const bestMatchday = baseForBestWorst.reduce(
      (best: any, cur: any) =>
        !best || cur.avgPoints > best.avgPoints ? cur : best,
      null,
    );
    const worstMatchday = baseForBestWorst.reduce(
      (worst: any, cur: any) =>
        !worst || cur.avgPoints < worst.avgPoints ? cur : worst,
      null,
    );
    const mdAllowed = new Set<number>(
      (finished.length ? finished : matchdayAverages).map((m) => m.matchday),
    );
    const buckets = [
      { label: "0", min: 0, max: 0, count: 0 },
      { label: "1–3", min: 1, max: 3, count: 0 },
      { label: "4–6", min: 4, max: 6, count: 0 },
      { label: "7–9", min: 7, max: 9, count: 0 },
      { label: "10+", min: 10, max: 10000, count: 0 },
    ];
    for (const [key, total] of matchdayUserTotals.entries()) {
      const md = Number(key.split(":")[0]);
      if (!mdAllowed.has(md)) continue;
      const b = buckets.find((x) => total >= x.min && total <= x.max);
      if (b) b.count++;
    }

    const funStats = [
      buildStat(
        "drawExact",
        "Il re del pari",
        "Trasforma gli X in opere d'arte.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "bigExact",
        "Il profeta del gol",
        "Esatti nelle partite da almeno 4 gol reali.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "zeroZero",
        "Il ministro dello 0-0",
        "Ha capito il fascino del nulla cosmico.",
        funAgg,
        nameByUser,
      ),
      topExactHits && topExactHits.value > 0
        ? {
            key: "veggente",
            title: "Il veggente",
            description: "Più risultati esatti totali.",
            ...topExactHits,
            winners: [topExactHits],
            tieCount: 1,
          }
        : null,
      topPragmaticHits
        ? {
            key: "pragmatico",
            title: "Il pragmatico",
            description: "Prende l'1X2 senza fare troppo il fenomeno.",
            ...topPragmaticHits,
            winners: [topPragmaticHits],
            tieCount: 1,
          }
        : null,
      topSumGoalsHits && topSumGoalsHits.value > 0
        ? {
            key: "contabile",
            title: "Il contabile",
            description: "Somma i gol meglio di un commercialista.",
            ...topSumGoalsHits,
            winners: [topSumGoalsHits],
            tieCount: 1,
          }
        : null,
      (rules as any)?.enableUnderOver25
        ? buildStat(
            "underOverOnly",
            "Il miracolato",
            "A punti solo grazie all'Under/Over.",
            funAgg,
            nameByUser,
          )
        : null,
      buildStat(
        "kamikaze",
        "Il kamikaze",
        "Pronostica goleade senza paura.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "catenacciaro",
        "Il catenacciaro",
        "Vede 0-0, 1-0 e autobus parcheggiati.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "cuoreSpezzato",
        "Il cuore spezzato",
        "A un gol dalla gloria.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "gufatore",
        "Il gufatore",
        "Va contro la squadra più scelta dagli altri.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "bomberMancato",
        "Il bomber mancato",
        "Aspetta festival del gol che non arrivano mai.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "conservatore",
        "Il conservatore",
        "Pronostica pareggi come fossero certezze.",
        funAgg,
        nameByUser,
      ),
      buildStat(
        "folle",
        "Il folle",
        "Media gol pronosticati più alta.",
        funAgg,
        nameByUser,
      ),
    ].filter(Boolean);

    const prudenteVals = Array.from(funAgg.entries()).filter(
      ([_, a]) => a.predictedCount >= 3 && Number.isFinite(a.prudente),
    );
    if (prudenteVals.length) {
      const min = Math.min(...prudenteVals.map(([_, a]) => a.prudente));
      const winners = prudenteVals
        .filter(([_, a]) => a.prudente === min)
        .map(([uid, a]) => ({
          userId: uid,
          displayName: nameByUser.get(uid) || "Utente",
          value: a.prudente,
        }));
      funStats.push({
        key: "prudente",
        title: "Il prudente",
        description: "Media gol pronosticati più bassa.",
        ...winners[0],
        winners,
        tieCount: winners.length,
      } as any);
    }

    const { rows: leaderboardRows } = await computeLeaderboardRows(leagueId);
    const funAchievements = (funStats as any[])
      .filter((stat: any) => stat?.displayName && Number(stat?.value || 0) > 0)
      .slice(0, 8)
      .map((stat: any) => ({
        key: stat.key,
        title: stat.title,
        displayName: stat.displayName,
        userId: stat.userId,
        value: Number(stat.value || 0),
        description: stat.description,
      }));

    const profileCards = leaderboardRows
      .slice(0, 6)
      .map((row: any, index: number) => {
        const fun = funAgg.get(row.userId);
        const predictedCount = Number(fun?.predictedCount || 0);
        const avgPredictedGoals = predictedCount
          ? Math.round(
              (Number(fun?.predictedGoals || 0) / predictedCount) * 100,
            ) / 100
          : 0;
        const exactHits = Number(row.exactHits || 0);
        const outcomeHits = Number(row.outcomeHits || 0);
        const sumGoalsHits = Number(row.sumGoalsHits || 0);
        const totalPoints = Number(row.totalPoints || 0);
        const precision = Math.min(
          99,
          Math.round(exactHits * 8 + outcomeHits * 2),
        );
        const courage = Math.min(99, Math.round(avgPredictedGoals * 18));
        const consistency = Math.min(
          99,
          Math.round(totalPoints * 3 + sumGoalsHits * 2),
        );
        const ovr = Math.max(
          40,
          Math.min(99, Math.round((precision + courage + consistency) / 3)),
        );
        return {
          userId: row.userId,
          displayName: row.displayName,
          position: index + 1,
          totalPoints,
          ovr,
          attributes: {
            precision,
            courage,
            consistency,
            exactHits,
            avgPredictedGoals,
          },
        };
      });

    const rivalries = leaderboardRows
      .slice(0, 12)
      .map((row: any, index: number, arr: any[]) => {
        const next = arr[index + 1];
        if (!next) return null;
        const gap = Math.abs(
          Number(row.totalPoints || 0) - Number(next.totalPoints || 0),
        );
        return {
          userA: {
            userId: row.userId,
            displayName: row.displayName,
            position: index + 1,
            totalPoints: Number(row.totalPoints || 0),
          },
          userB: {
            userId: next.userId,
            displayName: next.displayName,
            position: index + 2,
            totalPoints: Number(next.totalPoints || 0),
          },
          gap,
          title: gap === 0 ? "Duello alla pari" : `Solo ${gap} pt di distanza`,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.gap - b.gap)
      .slice(0, 3);

    const latestFinishedMatchday = finished.length
      ? Math.max(...finished.map((m: any) => Number(m.matchday || 0)))
      : null;
    const latestMatchdayRows = latestFinishedMatchday
      ? Array.from(matchdayUserTotals.entries())
          .map(([key, total]) => {
            const [mdRaw, userId] = key.split(":");
            return {
              matchday: Number(mdRaw),
              userId,
              total: Number(total || 0),
            };
          })
          .filter((row) => row.matchday === latestFinishedMatchday)
          .sort((a, b) => b.total - a.total)
      : [];
    const timeline = [
      latestMatchdayRows[0]
        ? {
            type: "matchday_mvp",
            title: `MVP giornata ${latestFinishedMatchday}`,
            text: `${nameByUser.get(latestMatchdayRows[0].userId) || "Utente"} ha fatto ${latestMatchdayRows[0].total} punti nella giornata.`,
          }
        : null,
      topExactHits && topExactHits.value > 0
        ? {
            type: "exact_leader",
            title: "Radar acceso",
            text: `${topExactHits.displayName} guida la lega con ${topExactHits.value} risultati esatti.`,
          }
        : null,
      topTotalPoints && topTotalPoints.value > 0
        ? {
            type: "leader",
            title: "Leader attuale",
            text: `${topTotalPoints.displayName} è davanti a tutti con ${topTotalPoints.value} punti.`,
          }
        : null,
    ].filter(Boolean);

    const engagement = {
      achievements: funAchievements,
      profileCards,
      rivalries,
      timeline,
    };

    res.json({
      bestAttack: topTotalPoints,
      bestDefense: topExactHits,
      topTotalPoints,
      topExactHits,
      topOutcomeHits,
      topSumGoalsHits,
      topUnderOverHits,
      funStats,
      engagement,
      features: { underOver25: !!(rules as any)?.enableUnderOver25 },
      avgPointsPerMatchday,
      exactTotal,
      outcomeTotal,
      sumGoalsTotal,
      underOverTotal,
      distribution: buckets.map((b) => ({ label: b.label, count: b.count })),
      bestMatchday: bestMatchday
        ? { matchday: bestMatchday.matchday, avgPoints: bestMatchday.avgPoints }
        : null,
      worstMatchday: worstMatchday
        ? {
            matchday: worstMatchday.matchday,
            avgPoints: worstMatchday.avgPoints,
          }
        : null,
    });
  },
);

leagueRouter.get(
  "/final-result",
  requireAuth,
  requireLeagueMember,
  async (req: AuthedRequest, res) => {
    const leagueId = resolveLeagueId(req);
    if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });
    const finalization = await getLeagueFinalizationSafe(leagueId);
    const { rows, monetization } = await computeLeaderboardRows(leagueId);
    const prizes = ((monetization as any)?.prizes || [])
      .slice()
      .sort((a: any, b: any) => Number(a.position) - Number(b.position));
    const prizeCount = prizes.length
      ? Math.max(...prizes.map((p: any) => Number(p.position || 0)))
      : 1;
    const winners = rows.slice(0, prizeCount).map((row: any, idx: number) => {
      const position = idx + 1;
      const prize = prizes.find((p: any) => Number(p.position) === position);
      return { ...row, position, prizeAmountCents: prize?.amountCents ?? null };
    });
    const meIdx = rows.findIndex((r: any) => r.userId === req.user?.id);
    const myPosition = meIdx >= 0 ? meIdx + 1 : null;
    const myWinner = winners.find((w: any) => w.userId === req.user?.id);
    res.json({
      finalized: !!finalization,
      finalizedAt: finalization?.finalizedAt ?? null,
      myPosition,
      prizePosition: myWinner?.position ?? null,
      prizeAmountCents: myWinner?.prizeAmountCents ?? null,
      winners,
      leaderboardTop: rows.slice(0, Math.max(5, prizeCount)),
    });
  },
);
