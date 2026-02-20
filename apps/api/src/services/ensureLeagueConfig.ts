import { prisma } from "../lib/prisma.js";

/**
 * Ensure that each league has a Setting and a Rule row.
 * This avoids nulls in the UI and prevents 500s when a new league is created.
 */
export async function ensureLeagueConfig(leagueId: string) {
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // +365 days

  await prisma.setting.upsert({
    where: { leagueId },
    update: {},
    create: {
      leagueId,
      lockUntil: farFuture,
      isForceLocked: false,
      tieBreak1: "EXACT",
      tieBreak2: "OUTCOME",
      tieBreak3: "SUM_GOALS",
      competitionPredictionsDeadline: null,
    },
  });

  await prisma.rule.upsert({
    where: { leagueId },
    update: {},
    create: {
      leagueId,
      pointsExact: 4,
      pointsOutcome: 2,
      pointsSumGoals: 1,
      enableUnderOver25: false,
      pointsUnderOver25: 1,
      enableMatchdayAwards: false,
      enableJolly: false,
      jollyMultiplier: 2,
      enableScorer: false,
      pointsScorer: 3,

      enableCompetitionWinner: false,
      pointsCompetitionWinner: 15,
      enableCompetitionTopScorer: false,
      pointsCompetitionTopScorer: 12,
      scoringMode: "CUMULATIVE",
      allowOutcomeWithExact: true,
      allowSumGoalsWithExact: true,
      allowSumGoalsWithOutcome: true,
    },
  });
}
