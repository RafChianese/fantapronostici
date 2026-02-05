import { env } from "../lib/env.js";
export class ApiFootballClient {
    baseUrl;
    timeoutMs;
    cacheTtlMs;
    cache = new Map();
    constructor() {
        this.baseUrl = String(env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
        this.timeoutMs = Number(env.API_FOOTBALL_TIMEOUT_MS || 15000);
        this.cacheTtlMs = Number(env.API_FOOTBALL_CACHE_TTL_MS || 10 * 60 * 1000);
    }
    isKeyPresent() {
        return !!env.API_FOOTBALL_KEY?.trim();
    }
    getHeaders() {
        const key = env.API_FOOTBALL_KEY?.trim();
        if (!key)
            throw new Error("Missing API_FOOTBALL_KEY");
        return {
            "x-apisports-key": key,
            Accept: "application/json",
        };
    }
    cacheKey(path, params) {
        const u = new URL(this.baseUrl + path);
        Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .forEach(([k, v]) => u.searchParams.set(k, String(v)));
        return u.toString();
    }
    async requestEnvelope(path, params) {
        const urlKey = this.cacheKey(path, params);
        const url = new URL(urlKey);
        const maxRetries = 4;
        let attempt = 0;
        let backoff = 500;
        while (true) {
            attempt += 1;
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                console.log(`[api-football] GET ${url.pathname}${url.search}`);
                const res = await fetch(url.toString(), {
                    headers: this.getHeaders(),
                    signal: controller.signal,
                });
                // Retry on 429 with simple backoff
                if (res.status === 429 && attempt <= maxRetries) {
                    const retryAfter = Number(res.headers.get("retry-after") || "0") || 0;
                    const wait = Math.max(retryAfter * 1000, backoff);
                    console.warn(`[api-football] 429 rate limited, retrying in ${wait}ms (attempt ${attempt}/${maxRetries})`);
                    await new Promise((r) => setTimeout(r, wait));
                    backoff *= 2;
                    continue;
                }
                const text = await res.text().catch(() => "");
                let json = null;
                try {
                    json = text ? JSON.parse(text) : null;
                }
                catch {
                    // keep null
                }
                if (!res.ok) {
                    const msg = json && json?.message ? String(json.message) : text.slice(0, 500);
                    const err = new Error(`API-FOOTBALL HTTP ${res.status}: ${msg || "Request failed"}`);
                    err.status = res.status;
                    err.body = json || { message: msg };
                    throw err;
                }
                if (json && json?.errors && Object.keys(json.errors).length > 0) {
                    throw new Error(`API-FOOTBALL errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
                }
                return json;
            }
            finally {
                clearTimeout(t);
            }
        }
    }
    async get(path, params, opts) {
        const urlKey = this.cacheKey(path, params);
        const useCache = !!opts?.cache;
        if (useCache) {
            const hit = this.cache.get(urlKey);
            if (hit && hit.expiresAt > Date.now())
                return hit.value;
        }
        const envl = await this.requestEnvelope(path, params);
        const data = (envl ? envl.response : null);
        if (useCache)
            this.cache.set(urlKey, { value: data, expiresAt: Date.now() + this.cacheTtlMs });
        return data;
    }
    // --- API methods ---
    leagues(params) {
        return this.get("/leagues", {
            season: params.season,
            search: params.search,
            country: params.country,
            id: params.id,
        }, { cache: true });
    }
    fixtures(params) {
        return this.get("/fixtures", {
            league: params.league,
            season: params.season,
            round: params.round,
            status: params.status,
            timezone: params.timezone,
            from: params.from,
            to: params.to,
            page: params.page,
        });
    }
    async fixturesAllPages(params) {
        const out = [];
        let page = 1;
        let total = 1;
        do {
            const envl = await this.requestEnvelope("/fixtures", {
                league: params.league,
                season: params.season,
                round: params.round,
                status: params.status,
                timezone: params.timezone,
                page,
            });
            const arr = Array.isArray(envl?.response) ? envl.response : [];
            out.push(...arr);
            total = Number(envl?.paging?.total || 1) || 1;
            page += 1;
        } while (page <= total);
        return out;
    }
    status() {
        return this.get("/status", {}, { cache: false });
    }
}
export const apiFootballClient = new ApiFootballClient();
