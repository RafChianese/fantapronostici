import { FootballDataClient } from "./FootballDataClient.js";
const client = new FootballDataClient();
export async function listCompetitions() {
    const data = await client.getCompetitions();
    return (data?.competitions ?? []);
}
export async function fetchCompetitionMatches(args) {
    const data = await client.getMatches(args.competitionCode, {
        ...(args.season ? { season: args.season } : {}),
        ...(args.matchday ? { matchday: args.matchday } : {}),
        ...(args.status ? { status: args.status } : {}),
    });
    return (data?.matches ?? []);
}
export async function fetchCompetitionTeams(args) {
    const data = await client.getTeams(args.competitionCode);
    return (data?.teams ?? []);
}
export async function fetchCompetitionScorers(args) {
    const data = await client.getScorers(args.competitionCode, {
        ...(args.season ? { season: args.season } : {}),
        ...(args.limit ? { limit: args.limit } : {}),
    });
    return (data?.scorers ?? []);
}
export async function fetchCompetitionStandings(args) {
    const data = await client.getStandings(args.competitionCode, {
        ...(args.season ? { season: args.season } : {}),
    });
    return (data?.standings ?? []);
}
export function extractWinnerFromStandings(standings) {
    // Typical shape: standings[0].table[0].team
    const table = standings?.find((s) => (s?.type || "TOTAL") === "TOTAL")?.table ?? standings?.[0]?.table;
    const top = Array.isArray(table) ? table[0] : null;
    const team = top?.team;
    const id = Number(team?.id);
    return {
        teamExternalId: Number.isFinite(id) ? id : null,
        teamName: typeof team?.name === "string" ? team.name : null,
    };
}
export function extractTopScorerFromScorers(scorers) {
    const top = Array.isArray(scorers) ? scorers[0] : null;
    const player = top?.player;
    const id = Number(player?.id);
    return {
        playerExternalId: Number.isFinite(id) ? id : null,
        playerName: typeof player?.name === "string" ? player.name : (typeof top?.name === "string" ? top.name : null),
    };
}
export async function fetchMatchDetail(args) {
    const data = await client.getMatch(args.matchId);
    return data;
}
export async function fetchTeamDetail(args) {
    const data = await client.getTeam(args.teamId);
    return data;
}
export function extractScorersFromMatchDetail(detail) {
    const out = [];
    const push = (id, name) => {
        const n = typeof name === "string" ? name.trim() : "";
        if (!n)
            return;
        const pid = Number(id);
        out.push({ id: Number.isFinite(pid) ? pid : null, name: n });
    };
    const goals = detail?.goals;
    if (Array.isArray(goals)) {
        for (const g of goals) {
            // football-data has varied shapes across plans.
            push(g?.scorer?.id ?? g?.player?.id ?? g?.scorerId, g?.scorer?.name ?? g?.player?.name ?? g?.scorerName);
        }
    }
    // Fallback: some responses may embed scorers inside score.scorers
    const scorers = detail?.score?.scorers;
    if (Array.isArray(scorers)) {
        for (const s of scorers)
            push(s?.player?.id ?? s?.id, s?.player?.name ?? s?.name);
    }
    // Deduplicate by (id|name)
    const seen = new Set();
    const uniq = [];
    for (const s of out) {
        const k = `${s.id ?? "na"}:${s.name.toLowerCase()}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        uniq.push(s);
    }
    return uniq;
}
export function extractEventsFromMatchDetail(detail) {
    const events = [];
    const goals = detail?.goals;
    if (Array.isArray(goals)) {
        for (const g of goals) {
            events.push({
                type: "GOAL",
                minute: g?.minute ?? null,
                team: g?.team?.name ?? null,
                player: g?.scorer?.name ?? g?.player?.name ?? null,
                detail: g?.type ?? g?.detail ?? null,
            });
        }
    }
    const bookings = detail?.bookings;
    if (Array.isArray(bookings)) {
        for (const b of bookings) {
            events.push({
                type: "CARD",
                minute: b?.minute ?? null,
                team: b?.team?.name ?? null,
                player: b?.player?.name ?? null,
                detail: b?.card ?? b?.type ?? null,
            });
        }
    }
    const subs = detail?.substitutions;
    if (Array.isArray(subs)) {
        for (const s of subs) {
            events.push({
                type: "SUBSTITUTION",
                minute: s?.minute ?? null,
                team: s?.team?.name ?? null,
                player: s?.playerOut?.name ?? null,
                assist: s?.playerIn?.name ?? null,
                detail: null,
            });
        }
    }
    // sort by minute where possible
    events.sort((a, b) => {
        const am = Number(a?.minute);
        const bm = Number(b?.minute);
        if (!Number.isFinite(am) && !Number.isFinite(bm))
            return 0;
        if (!Number.isFinite(am))
            return 1;
        if (!Number.isFinite(bm))
            return -1;
        return am - bm;
    });
    return events;
}
export function mapFootballDataStatus(status) {
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
