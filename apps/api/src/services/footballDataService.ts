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
  // Some plans embed a squad list inside competition teams.
  squad?: Array<{
    id: number;
    name: string;
    position?: string;
    shirtNumber?: number;
  }>;
};

export type FootballDataMatchDetail = {
  match?: any;
  goals?: any[];
  bookings?: any[];
  substitutions?: any[];
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

export async function fetchCompetitionScorers(args: { competitionCode: string; season?: number; limit?: number }) {
  const data = await client.getScorers(args.competitionCode, {
    ...(args.season ? { season: args.season } : {}),
    ...(args.limit ? { limit: args.limit } : {}),
  });
  return (data?.scorers ?? []) as any[];
}

export async function fetchCompetitionStandings(args: { competitionCode: string; season?: number }) {
  const data = await client.getStandings(args.competitionCode, {
    ...(args.season ? { season: args.season } : {}),
  });
  return (data?.standings ?? []) as any[];
}

export function extractWinnerFromStandings(standings: any[]): { teamExternalId: number | null; teamName: string | null } {
  // Typical shape: standings[0].table[0].team
  const table = standings?.find((s: any) => (s?.type || "TOTAL") === "TOTAL")?.table ?? standings?.[0]?.table;
  const top = Array.isArray(table) ? table[0] : null;
  const team = top?.team;
  const id = Number(team?.id);
  return {
    teamExternalId: Number.isFinite(id) ? id : null,
    teamName: typeof team?.name === "string" ? team.name : null,
  };
}

export function extractTopScorerFromScorers(scorers: any[]): { playerExternalId: number | null; playerName: string | null } {
  const top = Array.isArray(scorers) ? scorers[0] : null;
  const player = top?.player;
  const id = Number(player?.id);
  return {
    playerExternalId: Number.isFinite(id) ? id : null,
    playerName: typeof player?.name === "string" ? player.name : (typeof top?.name === "string" ? top.name : null),
  };
}

export async function fetchMatchDetail(args: { matchId: number }) {
  const data = await client.getMatch(args.matchId);
  return data as any;
}

export async function fetchTeamDetail(args: { teamId: number }) {
  const data = await client.getTeam(args.teamId);
  return data as any;
}

export type CompetitionPlayerOption = {
  id: number;
  name: string;
  teamId?: number | null;
  teamName?: string | null;
};

function uniqById<T extends { id: number }>(items: T[]) {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const it of items) {
    if (!Number.isFinite(it.id)) continue;
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/**
 * Best-effort list of players for a competition.
 * If the scorers endpoint is empty (common on some plans/competitions), we fallback to team squads.
 */
export async function fetchCompetitionPlayerOptions(args: { competitionCode: string }) {
  const teams = await fetchCompetitionTeams({ competitionCode: args.competitionCode });

  // If squads are embedded in the teams response, use them.
  const embedded: CompetitionPlayerOption[] = [];
  for (const t of teams) {
    const squad = (t as any)?.squad;
    if (!Array.isArray(squad)) continue;
    for (const p of squad) {
      const id = Number((p as any)?.id);
      const name = typeof (p as any)?.name === "string" ? (p as any).name.trim() : "";
      if (!Number.isFinite(id) || !name) continue;
      embedded.push({ id, name, teamId: Number(t.id), teamName: String(t.shortName || t.name || "").trim() || null });
    }
  }
  if (embedded.length) return uniqById(embedded);

  // Fallback: fetch each team detail to obtain squad.
  const teamIds = teams
    .map((t) => Number((t as any)?.id))
    .filter((id) => Number.isFinite(id));

  const limit = 3;
  const queue = [...teamIds];
  const out: CompetitionPlayerOption[] = [];

  async function worker() {
    while (queue.length) {
      const teamId = queue.shift();
      if (!teamId) return;
      try {
        const detail = await fetchTeamDetail({ teamId });
        const teamName = String(detail?.name || detail?.shortName || "").trim() || null;
        const squad = Array.isArray(detail?.squad) ? detail.squad : [];
        for (const p of squad) {
          const id = Number((p as any)?.id);
          const name = typeof (p as any)?.name === "string" ? (p as any).name.trim() : "";
          if (!Number.isFinite(id) || !name) continue;
          out.push({ id, name, teamId, teamName });
        }
      } catch {
        // ignore single team errors
      }
    }
  }

  await Promise.all(new Array(limit).fill(0).map(() => worker()));
  return uniqById(out).sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export function extractScorersFromMatchDetail(detail: any): Array<{ id: number | null; name: string }> {
  const out: Array<{ id: number | null; name: string }> = [];
  const push = (id: any, name: any) => {
    const n = typeof name === "string" ? name.trim() : "";
    if (!n) return;
    const pid = Number(id);
    out.push({ id: Number.isFinite(pid) ? pid : null, name: n });
  };

  const goals = (detail as any)?.goals;
  if (Array.isArray(goals)) {
    for (const g of goals) {
      // football-data has varied shapes across plans.
      push((g as any)?.scorer?.id ?? (g as any)?.player?.id ?? (g as any)?.scorerId, (g as any)?.scorer?.name ?? (g as any)?.player?.name ?? (g as any)?.scorerName);
    }
  }

  // Fallback: some responses may embed scorers inside score.scorers
  const scorers = (detail as any)?.score?.scorers;
  if (Array.isArray(scorers)) {
    for (const s of scorers) push((s as any)?.player?.id ?? (s as any)?.id, (s as any)?.player?.name ?? (s as any)?.name);
  }

  // Deduplicate by (id|name)
  const seen = new Set<string>();
  const uniq: Array<{ id: number | null; name: string }> = [];
  for (const s of out) {
    const k = `${s.id ?? "na"}:${s.name.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(s);
  }
  return uniq;
}

export function extractEventsFromMatchDetail(detail: any) {
  const events: any[] = [];
  const goals = (detail as any)?.goals;
  if (Array.isArray(goals)) {
    for (const g of goals) {
      events.push({
        type: "GOAL",
        minute: (g as any)?.minute ?? null,
        team: (g as any)?.team?.name ?? null,
        player: (g as any)?.scorer?.name ?? (g as any)?.player?.name ?? null,
        detail: (g as any)?.type ?? (g as any)?.detail ?? null,
      });
    }
  }
  const bookings = (detail as any)?.bookings;
  if (Array.isArray(bookings)) {
    for (const b of bookings) {
      events.push({
        type: "CARD",
        minute: (b as any)?.minute ?? null,
        team: (b as any)?.team?.name ?? null,
        player: (b as any)?.player?.name ?? null,
        detail: (b as any)?.card ?? (b as any)?.type ?? null,
      });
    }
  }
  const subs = (detail as any)?.substitutions;
  if (Array.isArray(subs)) {
    for (const s of subs) {
      events.push({
        type: "SUBSTITUTION",
        minute: (s as any)?.minute ?? null,
        team: (s as any)?.team?.name ?? null,
        player: (s as any)?.playerOut?.name ?? null,
        assist: (s as any)?.playerIn?.name ?? null,
        detail: null,
      });
    }
  }

  // sort by minute where possible
  events.sort((a, b) => {
    const am = Number(a?.minute);
    const bm = Number(b?.minute);
    if (!Number.isFinite(am) && !Number.isFinite(bm)) return 0;
    if (!Number.isFinite(am)) return 1;
    if (!Number.isFinite(bm)) return -1;
    return am - bm;
  });
  return events;
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
