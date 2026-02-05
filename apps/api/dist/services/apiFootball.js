import { apiFootballClient } from "./ApiFootballClient.js";
export async function getStatus() {
    return apiFootballClient.status();
}
export async function searchLeagues(query, season) {
    return apiFootballClient.leagues({ search: query, season });
}
export async function listLeagues(params) {
    return apiFootballClient.leagues({ season: params.season, search: params.search, country: params.country });
}
export async function fetchFixtures(params) {
    return apiFootballClient.fixturesAllPages({
        league: params.leagueId,
        season: params.season,
        timezone: params.timezone ?? "Europe/Rome",
        round: params.round,
        status: params.status,
    });
}
export function mapApiFootballStatus(short) {
    const s = String(short || "").toUpperCase();
    if (s === "NS")
        return "NOT_STARTED";
    if (s === "FT" || s === "AET" || s === "PEN")
        return "FINISHED";
    if (s === "CANC" || s === "PST")
        return "NOT_STARTED";
    return "IN_PROGRESS";
}
export function parseMatchdayFromRound(round) {
    if (!round)
        return 1;
    const r = String(round);
    // Regular Season - 18
    const m = r.match(/(?:-|\s)(\d{1,3})\s*$/);
    if (m)
        return Math.max(1, Number(m[1]));
    // Group Stage - Group A - 1
    const m2 = r.match(/\b(\d{1,3})\b/);
    if (m2)
        return Math.max(1, Number(m2[1]));
    return 1;
}
// Deterministic mapping for knockout rounds when no numeric round is available.
export function knockoutMatchdayKey(round) {
    const r = String(round || "").toLowerCase();
    if (!r)
        return 1;
    if (r.includes("final"))
        return 200;
    if (r.includes("semi"))
        return 190;
    if (r.includes("quarter"))
        return 180;
    if (r.includes("round of 16") || r.includes("16"))
        return 170;
    if (r.includes("round of 32") || r.includes("32"))
        return 160;
    return 150;
}
export function computeMatchday(round) {
    const n = parseMatchdayFromRound(round);
    if (n !== 1 || /\d/.test(String(round || "")))
        return n;
    return knockoutMatchdayKey(round);
}
