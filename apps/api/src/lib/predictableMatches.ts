import { prisma } from "./prisma.js";

export type MatchLike = {
  id?: string;
  homeTeam?: string | null;
  awayTeam?: string | null;
  kickoffAt?: Date | string | null;
};

function normalizeTeamName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isPlaceholderMatch(match: MatchLike | null | undefined): boolean {
  if (!match) return false;
  return normalizeTeamName(match.homeTeam) === "home" && normalizeTeamName(match.awayTeam) === "away";
}

export type PredictionWindow = {
  predictionWindowStart: Date | null;
  predictionWindowEnd: Date | null;
};

export async function getPredictionWindow(): Promise<PredictionWindow> {
  const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }) as any;
  return {
    predictionWindowStart: row?.predictionWindowStart ? new Date(row.predictionWindowStart) : null,
    predictionWindowEnd: row?.predictionWindowEnd ? new Date(row.predictionWindowEnd) : null,
  };
}

export function isInPredictionWindow(match: MatchLike | null | undefined, window: PredictionWindow): boolean {
  if (!match?.kickoffAt) return true;
  const kickoff = new Date(match.kickoffAt).getTime();
  if (!Number.isFinite(kickoff)) return true;
  const start = window.predictionWindowStart?.getTime();
  const end = window.predictionWindowEnd?.getTime();
  if (typeof start === "number" && Number.isFinite(start) && kickoff < start) return false;
  if (typeof end === "number" && Number.isFinite(end) && kickoff > end) return false;
  return true;
}

export function isPredictableMatch(match: MatchLike | null | undefined, window: PredictionWindow): boolean {
  return !!match && !isPlaceholderMatch(match) && isInPredictionWindow(match, window);
}

export async function filterPredictableMatches<T extends MatchLike>(matches: T[]): Promise<T[]> {
  const window = await getPredictionWindow();
  return matches.filter((match) => isPredictableMatch(match, window));
}

export async function assertPredictableMatches(matchIds: string[]) {
  const uniqueIds = Array.from(new Set(matchIds.map(String).filter(Boolean)));
  if (!uniqueIds.length) return;

  const [matches, window] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, homeTeam: true, awayTeam: true, kickoffAt: true },
    }),
    getPredictionWindow(),
  ]);

  const typedMatches = matches as MatchLike[];
  const byId = new Map(typedMatches.map((match: MatchLike) => [String(match.id), match]));
  const blocked = uniqueIds.filter((id) => !isPredictableMatch(byId.get(id), window));

  if (blocked.length) {
    const error: any = new Error("Partita non pronosticabile.");
    error.status = 400;
    error.payload = {
      message: "Una o più partite non sono pronosticabili.",
      reason: "MATCH_NOT_PREDICTABLE",
      matchIds: blocked,
    };
    throw error;
  }
}
