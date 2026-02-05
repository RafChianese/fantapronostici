import axios from "axios";
import { env } from "../lib/env.js";
const api = axios.create({
    baseURL: "https://api.football-data.org/v4",
    timeout: 10000,
});
export async function fetchCompetitionMatches(competitionId) {
    if (!env.FOOTBALL_DATA_API_TOKEN)
        throw new Error("Missing FOOTBALL_DATA_API_TOKEN");
    const res = await api.get(`/competitions/${competitionId}/matches`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN },
    });
    return res.data?.matches ?? [];
}
export function mapStatus(status) {
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
export function pickGroup(group, stage) {
    // football-data uses "GROUP_STAGE" and group like "GROUP_A"
    if (group)
        return group.replace("GROUP_", "");
    if (stage)
        return stage;
    return "N/A";
}
