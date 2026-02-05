import { prisma } from "./prisma.js";
import type { ScoringMode } from "@prisma/client";
import { recomputeMatchdayAwardsForLeague } from "./matchdayAwards.js";

function outcome(home: number, away: number): "H" | "D" | "A" {
  if (home > away) return "H";
  if (home < away) return "A";
  return "D";
}

function computeAdjustedPoints(params: {
  mode: ScoringMode;
  pointsExact: number;
  pointsOutcome: number;
  pointsSumGoals: number;
  pointsUnderOver: number;
  allowOutcomeWithExact: boolean;
  allowSumGoalsWithExact: boolean;
  allowSumGoalsWithOutcome: boolean;
}) {
  const { mode } = params;
  let ex = params.pointsExact;
  let out = params.pointsOutcome;
  let sum = params.pointsSumGoals;
  let uo = params.pointsUnderOver;

  if (mode === "CUMULATIVE") {
    return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
  }

  if (mode === "BEST_ONLY") {
    const max = Math.max(ex, out, sum, uo);
    if (max <= 0) return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
    // Deterministic priority if tie: EXACT > OUTCOME > SUM_GOALS > UNDER/OVER
    if (ex === max) return { pointsExact: ex, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: ex };
    if (out === max) return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: out };
    if (sum === max) return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: 0, totalPoints: sum };
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
  }

  // MIXED: allow fine-grained cumulability between categories.
  // Under/Over (if enabled) is always cumulative with the effective categories.
  if (ex > 0) {
    out = out > 0 && params.allowOutcomeWithExact ? out : 0;
    sum = sum > 0 && params.allowSumGoalsWithExact ? sum : 0;
    return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
  }
  if (out > 0) {
    sum = sum > 0 && params.allowSumGoalsWithOutcome ? sum : 0;
    return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: out + sum + uo };
  }
  if (sum > 0) {
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: sum + uo };
  }
  // Under/Over only
  if (uo > 0) {
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
  }
  return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
}

async function getRulesOrThrow(leagueId: string) {
  const rules = await prisma.rule.findUnique({ where: { leagueId } });
  if (!rules) throw new Error("Missing Rule row for league (seed your DB).");
  return rules;
}

export async function recalcAllScoresForLeague(leagueId: string) {
  const [rules, matches, predictions] = await Promise.all([
    getRulesOrThrow(leagueId),
    prisma.match.findMany(),
    prisma.prediction.findMany({ where: { leagueId } }),
  ]);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const updates: { id: string; pointsExact: number; pointsOutcome: number; pointsSumGoals: number; pointsUnderOver: number; totalPoints: number }[] = [];

  for (const p of predictions) {
    const m = matchById.get(p.matchId);
    if (!m || m.status !== "FINISHED" || m.homeScore === null || m.awayScore === null) {
      updates.push({ id: p.id, pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 });
      continue;
    }

    let pointsExact = 0,
      pointsOutcome = 0,
      pointsSumGoals = 0,
      pointsUnderOver = 0;

    if (p.homeGoals === m.homeScore && p.awayGoals === m.awayScore) pointsExact = rules.pointsExact;
    if (outcome(p.homeGoals, p.awayGoals) === outcome(m.homeScore, m.awayScore)) pointsOutcome = rules.pointsOutcome;
    if (p.homeGoals + p.awayGoals === m.homeScore + m.awayScore) pointsSumGoals = rules.pointsSumGoals;

    if (rules.enableUnderOver25) {
      const predOver = p.homeGoals + p.awayGoals > 2;
      const realOver = m.homeScore + m.awayScore > 2;
      if (predOver === realOver) pointsUnderOver = rules.pointsUnderOver25;
    }

    const adjusted = computeAdjustedPoints({
      mode: rules.scoringMode,
      pointsExact,
      pointsOutcome,
      pointsSumGoals,
      pointsUnderOver,
      allowOutcomeWithExact: rules.allowOutcomeWithExact,
      allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
      allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
    });

    updates.push({ id: p.id, ...adjusted });
  }

  if (updates.length === 0) return;


  await prisma.$transaction(updates.map((u) => prisma.prediction.update({ where: { id: u.id }, data: u })));

  // Refresh matchday awards (if enabled)
  await recomputeMatchdayAwardsForLeague(leagueId);
}

export async function recalcScoresForMatchAcrossLeagues(matchId: string) {
  // When a match result updates, we need to recalc predictions for ALL leagues.
  const leagues = await prisma.league.findMany({ select: { id: true } });
  for (const l of leagues) {
    await recalcScoresForMatchForLeague(l.id, matchId);
  }
}

export async function recalcScoresForMatchForLeague(leagueId: string, matchId: string) {
  const [rules, match, predictions] = await Promise.all([
    getRulesOrThrow(leagueId),
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.prediction.findMany({ where: { leagueId, matchId } }),
  ]);

  if (!match) return;

  const updates: { id: string; pointsExact: number; pointsOutcome: number; pointsSumGoals: number; pointsUnderOver: number; totalPoints: number }[] = [];

  for (const p of predictions) {
    if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) {
      updates.push({ id: p.id, pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 });
      continue;
    }

    let pointsExact = 0,
      pointsOutcome = 0,
      pointsSumGoals = 0,
      pointsUnderOver = 0;

    if (p.homeGoals === match.homeScore && p.awayGoals === match.awayScore) pointsExact = rules.pointsExact;
    if (outcome(p.homeGoals, p.awayGoals) === outcome(match.homeScore, match.awayScore)) pointsOutcome = rules.pointsOutcome;
    if (p.homeGoals + p.awayGoals === match.homeScore + match.awayScore) pointsSumGoals = rules.pointsSumGoals;

    if (rules.enableUnderOver25) {
      const predOver = p.homeGoals + p.awayGoals > 2;
      const realOver = match.homeScore + match.awayScore > 2;
      if (predOver === realOver) pointsUnderOver = rules.pointsUnderOver25;
    }

    const adjusted = computeAdjustedPoints({
      mode: rules.scoringMode,
      pointsExact,
      pointsOutcome,
      pointsSumGoals,
      pointsUnderOver,
      allowOutcomeWithExact: rules.allowOutcomeWithExact,
      allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
      allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
    });

    updates.push({ id: p.id, ...adjusted });
  }

  if (updates.length === 0) return;
  await prisma.$transaction(updates.map((u) => prisma.prediction.update({ where: { id: u.id }, data: u })));

  // Refresh awards for this matchday only (if enabled)
  await recomputeMatchdayAwardsForLeague(leagueId, match.matchday);
}
