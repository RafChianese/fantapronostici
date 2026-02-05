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
