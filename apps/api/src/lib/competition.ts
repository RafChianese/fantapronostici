import { prisma } from "./prisma.js";
import {
  fetchCompetitionMatches,
  fetchCompetitionScorers,
  fetchCompetitionStandings,
  extractTopScorerFromScorers,
  extractWinnerFromStandings,
} from "../services/footballDataService.js";

function allFinished(matches: Array<{ status?: string }>) {
  if (!matches.length) return false;
  return matches.every((m) => String((m as any)?.status || "").toUpperCase() === "FINISHED");
}

/**
 * Resolve competition outcome via football-data.org and apply awarded points to league picks.
 * Safe to call repeatedly.
 */
export async function resolveAndApplyCompetitionOutcome(args: { competitionCode: string; season?: number | null }) {
  const competitionCode = args.competitionCode;
  const season = args.season ?? null;

  // Only leagues that enabled at least one competition prediction.
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
  if (!rules.length) return { ok: true, message: "No leagues with competition predictions enabled." };

  // Check if competition is finished.
  const matches = await fetchCompetitionMatches({ competitionCode, ...(season ? { season } : {}) });
  if (!allFinished(matches as any)) {
    // Not finished yet. Do not resolve.
    return { ok: true, message: "Competition not finished yet." };
  }

  // Resolve winner + top scorer (best effort).
  let winner: { teamExternalId: number | null; teamName: string | null } = { teamExternalId: null, teamName: null };
  let topScorer: { playerExternalId: number | null; playerName: string | null } = { playerExternalId: null, playerName: null };

  try {
    const standings = await fetchCompetitionStandings({ competitionCode, ...(season ? { season } : {}) });
    winner = extractWinnerFromStandings(standings);
  } catch (e: any) {
    console.warn("[competition] standings error", e?.message || e);
  }

  try {
    const scorers = await fetchCompetitionScorers({ competitionCode, ...(season ? { season } : {}), limit: 50 });
    topScorer = extractTopScorerFromScorers(scorers);
  } catch (e: any) {
    console.warn("[competition] scorers error", e?.message || e);
  }

  // If nothing resolved, we still cache a resolvedAt marker to avoid tight loops.
  const now = new Date();

  for (const r of rules) {
    // Cache outcome per league (even if partially missing)
    await prisma.competitionOutcome.upsert({
      where: { leagueId: r.leagueId },
      create: {
        leagueId: r.leagueId,
        provider: "FOOTBALL_DATA",
        competitionCode,
        ...(season ? { season: Number(season) } : {}),
        winnerTeamExternalId: winner.teamExternalId ?? null,
        winnerTeamName: winner.teamName ?? null,
        topScorerPlayerExternalId: topScorer.playerExternalId ?? null,
        topScorerPlayerName: topScorer.playerName ?? null,
        resolvedAt: now,
      },
      update: {
        provider: "FOOTBALL_DATA",
        competitionCode,
        ...(season ? { season: Number(season) } : { season: null }),
        winnerTeamExternalId: winner.teamExternalId ?? null,
        winnerTeamName: winner.teamName ?? null,
        topScorerPlayerExternalId: topScorer.playerExternalId ?? null,
        topScorerPlayerName: topScorer.playerName ?? null,
        resolvedAt: now,
      },
    });

    // Apply awarded points to picks for this league.
    // Winner
    if (r.enableCompetitionWinner && winner.teamExternalId) {
      await prisma.competitionPick.updateMany({
        where: {
          leagueId: r.leagueId,
          type: "WINNER",
        },
        data: {
          pointsAwarded: 0,
        },
      });
      await prisma.competitionPick.updateMany({
        where: { leagueId: r.leagueId, type: "WINNER", teamExternalId: winner.teamExternalId },
        data: { pointsAwarded: Number(r.pointsCompetitionWinner ?? 15) },
      });
    }

    // Top scorer
    if (r.enableCompetitionTopScorer && topScorer.playerExternalId) {
      await prisma.competitionPick.updateMany({
        where: {
          leagueId: r.leagueId,
          type: "TOP_SCORER",
        },
        data: {
          pointsAwarded: 0,
        },
      });
      await prisma.competitionPick.updateMany({
        where: { leagueId: r.leagueId, type: "TOP_SCORER", playerExternalId: topScorer.playerExternalId },
        data: { pointsAwarded: Number(r.pointsCompetitionTopScorer ?? 12) },
      });
    }
  }

  return { ok: true, message: "Competition outcome resolved and applied." };
}
