import { env } from "../lib/env.js";

type Envelope<T> = {
  response: T;
  errors?: any;
  results?: number;
  paging?: { current: number; total: number };
};

type CacheEntry = { expiresAt: number; value: any };

export class ApiFootballClient {
  private baseUrl: string;
  private timeoutMs: number;
  private cacheTtlMs: number;
  private cache = new Map<string, CacheEntry>();

  constructor() {
    this.baseUrl = String(env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
    this.timeoutMs = Number(env.API_FOOTBALL_TIMEOUT_MS || 15000);
    this.cacheTtlMs = Number(env.API_FOOTBALL_CACHE_TTL_MS || 10 * 60 * 1000);
  }

  isKeyPresent() {
    return !!env.API_FOOTBALL_KEY?.trim();
  }

  private getHeaders() {
    const key = env.API_FOOTBALL_KEY?.trim();
    if (!key) throw new Error("Missing API_FOOTBALL_KEY");
    return {
      "x-apisports-key": key,
      Accept: "application/json",
    } as Record<string, string>;
  }

  private cacheKey(path: string, params: Record<string, any>) {
    const u = new URL(this.baseUrl + path);
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  }

  private async requestEnvelope<T>(path: string, params: Record<string, string | number | boolean | undefined | null>) {
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
        let json: Envelope<T> | null = null;
        try {
          json = text ? (JSON.parse(text) as Envelope<T>) : null;
        } catch {
          // keep null
        }

        if (!res.ok) {
          const msg = json && (json as any)?.message ? String((json as any).message) : text.slice(0, 500);
          const err: any = new Error(`API-FOOTBALL HTTP ${res.status}: ${msg || "Request failed"}`);
          err.status = res.status;
          err.body = json || { message: msg };
          throw err;
        }

        if (json && (json as any)?.errors && Object.keys((json as any).errors).length > 0) {
          throw new Error(`API-FOOTBALL errors: ${JSON.stringify((json as any).errors).slice(0, 500)}`);
        }

        return json as Envelope<T>;
      } finally {
        clearTimeout(t);
      }
    }
  }

  private async get<T>(path: string, params: Record<string, string | number | boolean | undefined | null>, opts?: { cache?: boolean }) {
    const urlKey = this.cacheKey(path, params);
    const useCache = !!opts?.cache;
    if (useCache) {
      const hit = this.cache.get(urlKey);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    }
    const envl = await this.requestEnvelope<T>(path, params);
    const data = (envl ? envl.response : (null as any)) as T;
    if (useCache) this.cache.set(urlKey, { value: data, expiresAt: Date.now() + this.cacheTtlMs });
    return data;
  }

  // --- API methods ---
  leagues(params: { season?: number; search?: string; country?: string; id?: number }) {
    return this.get<any[]>("/leagues", {
      season: params.season,
      search: params.search,
      country: params.country,
      id: params.id,
    }, { cache: true });
  }

  fixtures(params: { league: number; season: number; round?: string; status?: string; timezone?: string; from?: string; to?: string; page?: number }) {
    return this.get<any[]>("/fixtures", {
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

  fixtureLineups(params: { fixture: number }) {
    return this.get<any[]>("/fixtures/lineups", { fixture: params.fixture }, { cache: true });
  }

  fixtureEvents(params: { fixture: number }) {
    // Events can change while a match is live, but for our use (detail + finished scoring)
    // a short-lived cache is fine and helps rate limits.
    return this.get<any[]>("/fixtures/events", { fixture: params.fixture }, { cache: true });
  }

  async fixturesAllPages(params: { league: number; season: number; round?: string; status?: string; timezone?: string }) {
    const out: any[] = [];
    let page = 1;
    let total = 1;
    do {
      const envl = await this.requestEnvelope<any[]>("/fixtures", {
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
    return this.get<any>("/status", {}, { cache: false });
  }
}

export const apiFootballClient = new ApiFootballClient();
