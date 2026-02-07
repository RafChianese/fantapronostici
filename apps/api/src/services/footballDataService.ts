import { FootballDataClient } from "./FootballDataClient.js";

export type FootballDataCompetition = {
  id: number;
  code?: string;
  name: string;
  type?: string;
  emblem?: string;
  area?: { name?: string; code?: string; flag?: string };
  currentSeason?: { startDate?: string; endDate?: string; currentMatchday?: number; startDateYear?: number; id?: number; };
  seasons?: Array<{ startDate: string; endDate: string; currentMatchday?: number }>; // shape varies
};

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string;
  group?: string;
  // football-data v4 match endpoints always include team id + name,
  // but may omit crest/shortName depending on subscription/endpoint.
  homeTeam: { id: number; name: string; shortName?: string; crest?: string };
  awayTeam: { id: number; name: string; shortName?: string; crest?: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

export type FootballDataTeam = {
  id: number;
  name: string;
  shortName?: string;
  crest?: string;
};

const client = new FootballDataClient();

export async function listCompetitions() {
  const data = await client.getCompetitions();
  return (data?.competitions ?? []) as FootballDataCompetition[];
}

export async function fetchCompetitionMatches(args: { competitionCode: string; season?: number; matchday?: number; status?: string }) {
  const data = await client.getMatches(args.competitionCode, {
    ...(args.season ? { season: args.season } : {}),
    ...(args.matchday ? { matchday: args.matchday } : {}),
    ...(args.status ? { status: args.status } : {}),
  });
  return (data?.matches ?? []) as FootballDataMatch[];
}

export async function fetchCompetitionTeams(args: { competitionCode: string }) {
  const data = await client.getTeams(args.competitionCode);
  return (data?.teams ?? []) as FootballDataTeam[];
}

export function mapFootballDataStatus(status: string) {
  switch (status) {
    case "FINISHED":
      return "FINISHED";
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "IN_PROGRESS";
    default:
      return "NOT_STARTED";
  }
}
