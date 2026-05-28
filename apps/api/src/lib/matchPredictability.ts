import { prisma } from "./prisma.js";

export type PredictabilityWindow = {
  predictionWindowStart?: Date | string | null;
  predictionWindowEnd?: Date | string | null;
} | null | undefined;

type MatchLike = {
  homeTeam?: string | null;
  awayTeam?: string | null;
  kickoffAt?: Date | string | null;
};

function cleanTeamName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isPlaceholderMatch(match: MatchLike | null | undefined) {
  if (!match) return true;
  return cleanTeamName(match.homeTeam) === "home" && cleanTeamName(match.awayTeam) === "away";
}

export function isMatchInsidePredictionWindow(match: MatchLike | null | undefined, window: PredictabilityWindow) {
  if (!match?.kickoffAt) return false;
  const kickoff = new Date(match.kickoffAt).getTime();
  if (!Number.isFinite(kickoff)) return false;

  const startRaw = window?.predictionWindowStart ?? null;
  const endRaw = window?.predictionWindowEnd ?? null;
  const start = startRaw ? new Date(startRaw).getTime() : null;
  const end = endRaw ? new Date(endRaw).getTime() : null;

  if (start !== null && Number.isFinite(start) && kickoff < start) return false;
  if (end !== null && Number.isFinite(end) && kickoff > end) return false;
  return true;
}

export function isPredictableMatch(match: MatchLike | null | undefined, window: PredictabilityWindow) {
  return !isPlaceholderMatch(match) && isMatchInsidePredictionWindow(match, window);
}

export async function getPredictionWindow() {
  return prisma.superSetting.findFirst({
    orderBy: { createdAt: "asc" },
    select: { predictionWindowStart: true, predictionWindowEnd: true },
  }).catch(() => null as any);
}

export async function assertMatchesPredictable(matchIds: string[]) {
  const ids = Array.from(new Set(matchIds.map(String).filter(Boolean)));
  if (!ids.length) return;

  const [matches, predictionWindow] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: ids } },
      select: { id: true, homeTeam: true, awayTeam: true, kickoffAt: true },
    }),
    getPredictionWindow(),
  ]);

  const byId = new Map(matches.map((m) => [String(m.id), m]));
  const invalid = ids.find((id) => !isPredictableMatch(byId.get(id), predictionWindow));

  if (invalid) {
    const err: any = new Error("Match non pronosticabile.");
    err.status = 400;
    err.payload = { message: "Match non pronosticabile.", reason: "MATCH_NOT_PREDICTABLE", matchId: invalid };
    throw err;
  }
}
