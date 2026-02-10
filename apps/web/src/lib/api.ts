const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type GlobalRole = "USER" | "SUPER_ADMIN";
export type LeagueRole = "MEMBER" | "ADMIN";
export type MembershipStatus = "PENDING" | "APPROVED" | "REJECTED";

export type User = { id: string; email: string; displayName: string; globalRole: GlobalRole };
export type League = { id: string; name: string; code: string };
export type Membership = {
  id: string;
  role: LeagueRole;
  status: MembershipStatus;
  league: League;
};

export type RegolamentoSection = { title: string; paragraphs?: string[]; bullets?: string[] };
export type RegolamentoPayload = { title: string; generatedAtISO: string; sections: RegolamentoSection[] };

export function getToken() {
  return localStorage.getItem("tm_token") || "";
}
export function setToken(token: string) {
  localStorage.setItem("tm_token", token);
}
export function clearToken() {
  localStorage.removeItem("tm_token");
}

export function getActiveLeagueId() {
  return localStorage.getItem("tm_league_id") || "";
}
export function setActiveLeagueId(id: string) {
  localStorage.setItem("tm_league_id", id);
}
export function clearActiveLeagueId() {
  localStorage.removeItem("tm_league_id");
}

async function request(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const leagueId = getActiveLeagueId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (leagueId) headers["x-league-id"] = leagueId;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response (e.g., HTML error). Keep raw text for debugging.
      data = { message: text };
    }
  }

  if (!res.ok) {
    const message = data?.message || `HTTP ${res.status}`;
    const err: any = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    request(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, displayName: string, password: string) =>
    request(`/api/auth/register`, { method: "POST", body: JSON.stringify({ email, displayName, password }) }),

  forgotPassword: (email: string) =>
    request(`/api/auth/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email: string, token: string, newPassword: string) =>
    request(`/api/auth/reset-password`, { method: "POST", body: JSON.stringify({ email, token, newPassword }) }),

  // me
  me: () => request(`/api/me`),
  changePassword: (currentPassword: string, newPassword: string) =>
    request(`/api/me/password`, { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
  updateProfile: (displayName: string) =>
    request(`/api/me/profile`, { method: "PUT", body: JSON.stringify({ displayName }) }),
  adUnlockStatus: () => request(`/api/me/ad-unlock`),
  adUnlock: () => request(`/api/me/ad-unlock`, { method: "POST" }),
  myPredictions: () => request(`/api/me/predictions`),
  savePredictions: (predictions: { matchId: string; homeGoals: number; awayGoals: number }[]) =>
    request(`/api/me/predictions`, { method: "PUT", body: JSON.stringify({ predictions }) }),
  lock: (leagueId?: string, leagueCode?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : leagueCode ? `?leagueCode=${encodeURIComponent(leagueCode)}` : "";
    return request(`/api/lock${q}`);
  },
  // dashboard helper (uses league header x-league-id)
  publicConfig: () => request(`/api/lock`),

  regolamento: (): Promise<{ league: League; regolamento: RegolamentoPayload }> => request(`/api/regolamento`),


  // leagues
  myLeagues: () => request(`/api/leagues/mine`),
  createLeague: (name: string) => request(`/api/leagues`, { method: "POST", body: JSON.stringify({ name }) }),
  joinLeague: (code: string) => request(`/api/leagues/join`, { method: "POST", body: JSON.stringify({ code }) }),

  // public (league-scoped)
  matches: () => request(`/api/matches`),
  // leaderboard(sort?, leagueCode?)
  leaderboard: (a?: string, b?: string) => {
    const params = new URLSearchParams();
    // Backward compatible: if first argument looks like a sort value, treat it as such.
    const knownSorts = new Set(["points","name","points_desc","points_asc","exact_desc","exact_asc","outcome_desc","outcome_asc","sumgoals_desc","sumgoals_asc"]); 
    const sort = a && knownSorts.has(a) ? a : b;
    const leagueCode = a && !knownSorts.has(a) ? a : undefined;
    if (leagueCode) params.set("leagueCode", leagueCode);
    if (sort) params.set("sort", sort);
    const q = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/leaderboard${q}`);
  },
  userSummary: (userId: string, leagueCode?: string) => {
    const q = leagueCode ? `?leagueCode=${encodeURIComponent(leagueCode)}` : "";
    return request(`/api/users/${userId}/summary${q}`);
  },

  // league admin
  adminMembers: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/members${q}`);
  },
  adminPatchMember: (memberId: string, patch: { status?: MembershipStatus; role?: LeagueRole }, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/members/${memberId}${q}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  adminRules: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/rules${q}`);
  },
  adminSaveRules: (rules: any, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/rules${q}`, { method: "PUT", body: JSON.stringify(rules) });
  },
  adminSettings: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/settings${q}`);
  },
  adminSaveSettings: (settings: any, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/settings${q}`, { method: "PUT", body: JSON.stringify(settings) });
  },
  adminLockNow: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/lock-now${q}`, { method: "POST" });
  },
  adminSetMatchResult: (id: string, payload: any) => request(`/api/admin/matches/${id}/result`, { method: "PUT", body: JSON.stringify(payload) }),
  adminSync: () => request(`/api/admin/sync`, { method: "POST" }),

  // SuperAdmin - football-data.org v4 (global)
  adminFootballDataStatus: () => request(`/api/admin/football-data/status`),
  adminFootballDataCompetitions: (params: { search?: string; area?: string }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.area) q.set("area", params.area);
    const s = q.toString();
    return request(`/api/admin/football-data/competitions${s ? `?${s}` : ""}`);
  },
  adminFootballDataSelect: (competitionCode: string, season?: number | null) =>
    request(`/api/admin/settings/football-data/select`, { method: "POST", body: JSON.stringify({ competitionCode, season: season ?? null }) }),
  adminFootballDataSelected: () => request(`/api/admin/settings/football-data/selected`),
  adminFootballDataImportFixtures: () => request(`/api/admin/football-data/import-fixtures`, { method: "POST" }),
  adminFootballDataSyncResults: (matchday?: number) => {
    const q = matchday ? `?matchday=${encodeURIComponent(String(matchday))}` : "";
    return request(`/api/admin/football-data/sync-results${q}`, { method: "POST" });
  },

  // super admin
  superLeagues: () => request(`/api/super/leagues`),
  superLeagueDetail: (id: string) => request(`/api/super/leagues/${id}`),
  superPatchMember: (leagueId: string, memberId: string, patch: any) =>
    request(`/api/super/leagues/${leagueId}/members/${memberId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // super admin monetization
  superMonetization: () => request(`/api/super/monetization`),
  superSaveMonetization: (config: { adsEnabled?: boolean; demoAdsEnabled?: boolean; unlockMinutes?: number }) =>
    request(`/api/super/monetization`, { method: "PUT", body: JSON.stringify(config) }),
  superMonetizationStats: () => request(`/api/super/monetization/stats`),

  // super admin - external football provider
  superExternalConfig: () => request(`/api/super/external-config`),
  superSaveExternalConfig: (patch: any) => request(`/api/super/external-config`, { method: "PUT", body: JSON.stringify(patch) }),
  superSearchExternalLeagues: (search: string, season?: number) => {
    const params = new URLSearchParams();
    params.set("search", search);
    if (season) params.set("season", String(season));
    return request(`/api/super/external/leagues?${params.toString()}`);
  },
  superImportFixtures: () => request(`/api/super/external/import-fixtures`, { method: "POST" }),
};

export function apiUrl() {
  return API_URL;
}
