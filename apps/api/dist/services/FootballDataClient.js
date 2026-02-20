import axios from "axios";
import { env } from "../lib/env.js";
export class FootballDataClient {
    api;
    cache = new Map();
    nextAllowedAt = 0; // naive throttle (10 req/min free)
    constructor() {
        this.api = axios.create({
            baseURL: "https://api.football-data.org/v4",
            timeout: 15000,
        });
    }
    get key() {
        return (env.FOOTBALL_DATA_API_KEY || "").trim();
    }
    cacheGet(k) {
        const e = this.cache.get(k);
        if (!e)
            return null;
        if (Date.now() > e.expiresAt) {
            this.cache.delete(k);
            return null;
        }
        return e.value;
    }
    cacheSet(k, v, ttlMs) {
        this.cache.set(k, { value: v, expiresAt: Date.now() + ttlMs });
    }
    async throttleIfNeeded() {
        // Free plan: 10 requests/minute. We keep a simple 6s spacing.
        const minSpacingMs = 6200;
        const now = Date.now();
        const wait = Math.max(0, this.nextAllowedAt - now);
        if (wait > 0)
            await new Promise((r) => setTimeout(r, wait));
        this.nextAllowedAt = Date.now() + minSpacingMs;
    }
    async request(method, url, params, opts) {
        if (!this.key) {
            const msg = "FOOTBALL_DATA_API_KEY mancante in apps/api/.env";
            console.error("[football-data]", msg);
            throw new Error(msg);
        }
        const cacheKey = method === "GET" ? `${url}?${new URLSearchParams(params || {}).toString()}` : "";
        if (opts?.cacheTtlMs && cacheKey) {
            const hit = this.cacheGet(cacheKey);
            if (hit)
                return hit;
        }
        await this.throttleIfNeeded();
        const maxRetries = 2;
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[football-data] ${method} ${url}`);
                const res = await this.api.request({
                    method,
                    url,
                    params,
                    headers: {
                        "X-Auth-Token": this.key,
                    },
                });
                if (opts?.cacheTtlMs && cacheKey)
                    this.cacheSet(cacheKey, res.data, opts.cacheTtlMs);
                return res.data;
            }
            catch (e) {
                lastErr = e;
                const status = e?.response?.status;
                const msg = e?.response?.data?.message || e?.message || String(e);
                console.error("[football-data] error", status, msg);
                if (status === 429 && attempt < maxRetries) {
                    const resetSec = Number(e?.response?.headers?.["x-requestcounter-reset"] || "5");
                    const backoffMs = Math.min(15000, Math.max(2000, resetSec * 1000));
                    await new Promise((r) => setTimeout(r, backoffMs));
                    continue;
                }
                break;
            }
        }
        throw new Error(this.formatError(lastErr));
    }
    formatError(e) {
        const status = e?.response?.status;
        const data = e?.response?.data;
        const msg = data?.message || e?.message || "Errore football-data.org";
        return status ? `football-data.org (${status}): ${msg}` : msg;
    }
    // --- API methods ---
    async getCompetitions() {
        // Static-ish, safe to cache.
        return this.request("GET", "/competitions", undefined, { cacheTtlMs: 10 * 60 * 1000 });
    }
    async getStatus() {
        // No dedicated "status" endpoint; we surface request headers via a lightweight call.
        // We'll call /competitions (cached off) to get headers in error cases.
        return this.request("GET", "/competitions", undefined, { cacheTtlMs: 60 * 1000 });
    }
    async getCompetition(competitionCode) {
        return this.request("GET", `/competitions/${competitionCode}`, undefined, { cacheTtlMs: 10 * 60 * 1000 });
    }
    async getMatches(competitionCode, params) {
        return this.request("GET", `/competitions/${competitionCode}/matches`, params);
    }
    async getTeams(competitionCode) {
        // Teams change rarely during a season; cache to avoid wasting requests.
        return this.request("GET", `/competitions/${competitionCode}/teams`, undefined, { cacheTtlMs: 10 * 60 * 1000 });
    }
    async getScorers(competitionCode, params) {
        // Scorers can change often; cache briefly.
        return this.request("GET", `/competitions/${competitionCode}/scorers`, params, { cacheTtlMs: 5 * 60 * 1000 });
    }
    async getStandings(competitionCode, params) {
        // Standings update often; cache briefly.
        return this.request("GET", `/competitions/${competitionCode}/standings`, params, { cacheTtlMs: 5 * 60 * 1000 });
    }
    async getMatch(matchId) {
        // Match details are safe to cache briefly.
        return this.request("GET", `/matches/${matchId}`, undefined, { cacheTtlMs: 60 * 1000 });
    }
    async getTeam(teamId) {
        // Used only as fallback when squads are not embedded in competition teams.
        return this.request("GET", `/teams/${teamId}`, undefined, { cacheTtlMs: 10 * 60 * 1000 });
    }
}
