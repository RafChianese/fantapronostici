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
    // DEBUG: log raw football-data response for match detail (non-production only)
    if (process.env.NODE_ENV !== "production") {
        try {
            console.log("⚽ FOOTBALL-DATA RAW MATCH DETAIL META:", {
                matchId: args.matchId,
                status: data?.status ?? data?.match?.status,
                goals: Array.isArray(data?.goals) ? data.goals.length : 0,
                bookings: Array.isArray(data?.bookings) ? data.bookings.length : 0,
                substitutions: Array.isArray(data?.substitutions) ? data.substitutions.length : 0,
                hasLineups: !!data?.homeTeam?.lineup || !!data?.awayTeam?.lineup,
            });
            console.log("⚽ FOOTBALL-DATA RAW MATCH DETAIL PAYLOAD:", JSON.stringify(data, null, 2));
        }
        catch {
            // ignore logging failures
        }
    }
    return data;
}
export async function fetchTeamDetail(args) {
    const data = await client.getTeam(args.teamId);
    return data;
}
function uniqById(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
        if (!Number.isFinite(it.id))
            continue;
        if (seen.has(it.id))
            continue;
        seen.add(it.id);
        out.push(it);
    }
    return out;
}
/**
 * Best-effort list of players for a competition.
 * If the scorers endpoint is empty (common on some plans/competitions), we fallback to team squads.
 */
export async function fetchCompetitionPlayerOptions(args) {
    const teams = await fetchCompetitionTeams({ competitionCode: args.competitionCode });
    // If squads are embedded in the teams response, use them.
    const embedded = [];
    for (const t of teams) {
        const squad = t?.squad;
        if (!Array.isArray(squad))
            continue;
        for (const p of squad) {
            const id = Number(p?.id);
            const name = typeof p?.name === "string" ? p.name.trim() : "";
            if (!Number.isFinite(id) || !name)
                continue;
            embedded.push({ id, name, teamId: Number(t.id), teamName: String(t.shortName || t.name || "").trim() || null });
        }
    }
    if (embedded.length)
        return uniqById(embedded);
    // Fallback: fetch each team detail to obtain squad.
    const teamIds = teams
        .map((t) => Number(t?.id))
        .filter((id) => Number.isFinite(id));
    const limit = 3;
    const queue = [...teamIds];
    const out = [];
    async function worker() {
        while (queue.length) {
            const teamId = queue.shift();
            if (!teamId)
                return;
            try {
                const detail = await fetchTeamDetail({ teamId });
                const teamName = String(detail?.name || detail?.shortName || "").trim() || null;
                const squad = Array.isArray(detail?.squad) ? detail.squad : [];
                for (const p of squad) {
                    const id = Number(p?.id);
                    const name = typeof p?.name === "string" ? p.name.trim() : "";
                    if (!Number.isFinite(id) || !name)
                        continue;
                    out.push({ id, name, teamId, teamName });
                }
            }
            catch {
                // ignore single team errors
            }
        }
    }
    await Promise.all(new Array(limit).fill(0).map(() => worker()));
    return uniqById(out).sort((a, b) => a.name.localeCompare(b.name, "it"));
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
export function extractLineupsFromMatchDetail(detail) {
    // football-data.org v4 /matches/{id} (on some plans) may include:
    // homeTeam.lineup, homeTeam.bench, awayTeam.lineup, awayTeam.bench
    // We normalize to the shape used by FE: [{ team, startXI, substitutes }]
    const out = [];
    const mapPlayer = (p) => {
        const id = Number(p?.id);
        const name = typeof p?.name === "string" ? p.name.trim() : "";
        if (!name)
            return null;
        return {
            id: Number.isFinite(id) ? id : null,
            name,
            number: Number.isFinite(Number(p?.shirtNumber)) ? Number(p.shirtNumber) : null,
            position: typeof p?.position === "string" ? p.position : null,
        };
    };
    const mapTeam = (t) => {
        if (!t)
            return null;
        const tid = Number(t?.id);
        return {
            id: Number.isFinite(tid) ? tid : null,
            name: typeof t?.shortName === "string" && t.shortName.trim()
                ? t.shortName.trim()
                : typeof t?.name === "string"
                    ? t.name.trim()
                    : "Team",
            logo: typeof t?.crest === "string" ? t.crest : null,
        };
    };
    const ht = detail?.homeTeam;
    const at = detail?.awayTeam;
    const homeLineup = Array.isArray(ht?.lineup) ? ht.lineup.map(mapPlayer).filter(Boolean) : [];
    const homeBench = Array.isArray(ht?.bench) ? ht.bench.map(mapPlayer).filter(Boolean) : [];
    const awayLineup = Array.isArray(at?.lineup) ? at.lineup.map(mapPlayer).filter(Boolean) : [];
    const awayBench = Array.isArray(at?.bench) ? at.bench.map(mapPlayer).filter(Boolean) : [];
    // Only return if at least one team has data.
    if (homeLineup.length || homeBench.length) {
        out.push({ team: mapTeam(ht), startXI: homeLineup, substitutes: homeBench });
    }
    if (awayLineup.length || awayBench.length) {
        out.push({ team: mapTeam(at), startXI: awayLineup, substitutes: awayBench });
    }
    return out;
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
