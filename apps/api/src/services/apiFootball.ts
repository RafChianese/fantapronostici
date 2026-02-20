import { apiFootballClient } from "./ApiFootballClient.js";

export type ApiFootballLeague = {
  league: { id: number; name: string; type: string; logo?: string };
  country: { name: string; code?: string; flag?: string };
  seasons: { year: number; start?: string; end?: string; current?: boolean }[];
};

export async function getStatus() {
  return apiFootballClient.status();
}

export async function searchLeagues(query: string, season?: number) {
  return apiFootballClient.leagues({ search: query, season }) as Promise<ApiFootballLeague[]>;
}

export async function listLeagues(params: { season?: number; search?: string; country?: string }) {
  return apiFootballClient.leagues({ season: params.season, search: params.search, country: params.country }) as Promise<ApiFootballLeague[]>;
}

export type ApiFootballFixtureRow = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long?: string };
  };
  league: {
    id: number;
    name: string;
    season: number;
    round?: string;
  };
  teams: {
    home: { id: number; name: string; logo?: string };
    away: { id: number; name: string; logo?: string };
  };
  goals: { home: number | null; away: number | null };
};

export async function fetchFixtures(params: { leagueId: number; season: number; timezone?: string; round?: string; status?: string }) {
  return apiFootballClient.fixturesAllPages({
    league: params.leagueId,
    season: params.season,
    timezone: params.timezone ?? "Europe/Rome",
    round: params.round,
    status: params.status,
  }) as Promise<ApiFootballFixtureRow[]>;
}

export type ApiFootballLineupPlayer = {
  id: number;
  name: string;
  number?: number | null;
  pos?: string | null;
};

export type ApiFootballLineupTeam = {
  team: { id: number; name: string; logo?: string };
  startXI: ApiFootballLineupPlayer[];
  substitutes: ApiFootballLineupPlayer[];
};

export async function fetchFixtureLineups(fixtureId: number) {
  const rows = (await apiFootballClient.fixtureLineups({ fixture: fixtureId })) as any[];
  // Normalize to our shape
  const out: ApiFootballLineupTeam[] = [];
  for (const r of rows || []) {
    const team = r?.team;
    const mapPlayer = (p: any): ApiFootballLineupPlayer | null => {
      const pl = p?.player || p;
      const id = Number(pl?.id);
      const name = String(pl?.name || "").trim();
      if (!Number.isFinite(id) || !name) return null;
      return { id, name, number: pl?.number ?? null, pos: pl?.pos ?? null };
    };
    const startXI = Array.isArray(r?.startXI) ? r.startXI.map(mapPlayer).filter(Boolean) : [];
    const substitutes = Array.isArray(r?.substitutes) ? r.substitutes.map(mapPlayer).filter(Boolean) : [];
    if (!team?.id || !team?.name) continue;
    out.push({
      team: { id: Number(team.id), name: String(team.name), logo: team.logo ?? undefined },
      startXI: startXI as any,
      substitutes: substitutes as any,
    });
  }
  return out;
}

export type ApiFootballEvent = {
  time: { elapsed?: number | null; extra?: number | null };
  team: { id: number; name: string; logo?: string };
  player?: { id?: number | null; name?: string | null };
  assist?: { id?: number | null; name?: string | null };
  type?: string | null;
  detail?: string | null;
  comments?: string | null;
};

export async function fetchFixtureEvents(fixtureId: number) {
  const rows = (await apiFootballClient.fixtureEvents({ fixture: fixtureId })) as any[];
  const out: ApiFootballEvent[] = [];
  for (const r of rows || []) {
    const team = r?.team;
    const time = r?.time || {};
    if (!team?.id || !team?.name) continue;
    out.push({
      time: { elapsed: time?.elapsed ?? null, extra: time?.extra ?? null },
      team: { id: Number(team.id), name: String(team.name), logo: team.logo ?? undefined },
      player: r?.player ? { id: r.player.id ?? null, name: r.player.name ?? null } : undefined,
      assist: r?.assist ? { id: r.assist.id ?? null, name: r.assist.name ?? null } : undefined,
      type: r?.type ?? null,
      detail: r?.detail ?? null,
      comments: r?.comments ?? null,
    });
  }
  return out;
}

export function mapApiFootballStatus(short: string) {
  const s = String(short || "").toUpperCase();
  if (s === "NS") return "NOT_STARTED";
  if (s === "FT" || s === "AET" || s === "PEN") return "FINISHED";
  if (s === "CANC" || s === "PST") return "NOT_STARTED";
  return "IN_PROGRESS";
}

export function parseMatchdayFromRound(round?: string): number {
  if (!round) return 1;
  const r = String(round);
  // Regular Season - 18
  const m = r.match(/(?:-|\s)(\d{1,3})\s*$/);
  if (m) return Math.max(1, Number(m[1]));
  // Group Stage - Group A - 1
  const m2 = r.match(/\b(\d{1,3})\b/);
  if (m2) return Math.max(1, Number(m2[1]));
  return 1;
}

// Deterministic mapping for knockout rounds when no numeric round is available.
export function knockoutMatchdayKey(round?: string): number {
  const r = String(round || "").toLowerCase();
  if (!r) return 1;
  if (r.includes("final")) return 200;
  if (r.includes("semi")) return 190;
  if (r.includes("quarter")) return 180;
  if (r.includes("round of 16") || r.includes("16")) return 170;
  if (r.includes("round of 32") || r.includes("32")) return 160;
  return 150;
}

export function computeMatchday(round?: string): number {
  const n = parseMatchdayFromRound(round);
  if (n !== 1 || /\d/.test(String(round || ""))) return n;
  return knockoutMatchdayKey(round);
}
