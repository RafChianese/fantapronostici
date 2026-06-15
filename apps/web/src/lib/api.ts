const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type GlobalRole = "USER" | "SUPER_ADMIN";
export type LeagueRole = "MEMBER" | "ADMIN";
export type MembershipStatus = "PENDING" | "APPROVED" | "REJECTED";

export type User = { id: string; email: string; displayName: string; globalRole: GlobalRole; avatarId?: string | null };

export type AvatarConfig = {
  /** Schema version (v2 full-body avatar). Optional for backward compatibility. */
  version?: 2;
  sex?: "male" | "female";
  bodyType?: "slim" | "average" | "athletic";
  skin?: "light" | "tan" | "brown" | "dark";
  eyes?: "brown" | "blue" | "green" | "gray";
  hairType?: "short" | "medium" | "long" | "curly" | "bald";
  hairColor?: "black" | "brown" | "blonde" | "red" | "gray";
  eyebrowsType?: "straight" | "arched" | "thick";
  eyebrowsColor?: "black" | "brown" | "blonde" | "red" | "gray";
  outfitType?: "tshirt" | "hoodie" | "jersey" | "tracksuit" | "dress" | "suit";
  outfitColor?: "black" | "blue" | "red" | "green" | "purple" | "orange" | "gray" | "teal" | "pink";
  /** Secondary/accent color for outfits (eg stripes/collar). */
  outfitAccentColor?: "white" | "black" | "blue" | "red" | "green" | "purple" | "orange" | "gray" | "teal" | "pink" | "yellow";
  /** Jersey personalization (displayed on kit). */
  jerseyNumber?: number; // 0..99
  jerseyName?: string; // 0..12 chars
  /** Jersey style/pattern. Optional for backward compatibility. */
  jerseyStyle?: "solid" | "stripes_v" | "stripes_h" | "sleeves";
  accessoryHat?: "none" | "cap" | "beanie";
  accessoryGlasses?: "none" | "round" | "square";
};

export type UserWithAvatar = User & { avatarJson?: AvatarConfig | null };

export type LiveParticipant = {
  userId: string;
  displayName: string;
  avatarId?: string | null;
  avatarJson?: AvatarConfig | null;
  prediction: { homeGoals: number; awayGoals: number } | null;
  livePoints: number;
  liveBreakdown?: { exact: number; outcome: number; sumGoals: number; underOver: number };
  isExactLive: boolean;
};

export type LiveMatch = {
  id: string;
  matchday: number;
  group?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  kickoffAt: string;
  status: "IN_PROGRESS";
  homeScore: number | null;
  awayScore: number | null;
  isJolly?: boolean;
  exactLiveCount: number;
  participants: LiveParticipant[];
};

export type LiveLeaderboardRow = {
  userId: string;
  displayName: string;
  avatarId?: string | null;
  avatarJson?: AvatarConfig | null;
  officialPoints: number;
  liveDelta: number;
  liveTotalPoints: number;
  officialRank?: number | null;
  liveRank: number;
  rankDelta: number;
};

export type LiveResponse = { matches: LiveMatch[]; liveLeaderboard?: LiveLeaderboardRow[] };
export type CalendarParticipant = {
  userId: string;
  displayName: string;
  avatarId?: string | null;
  avatarJson?: AvatarConfig | null;
  prediction: { homeGoals: number; awayGoals: number } | null;
  points: number;
  breakdown?: { exact: number; outcome: number; sumGoals: number; underOver: number };
  isExactLive: boolean;
};

export type CalendarMatch = {
  id: string;
  matchday: number;
  group?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  kickoffAt: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
  isJolly?: boolean;
  exactLiveCount: number;
  participants: CalendarParticipant[];
};

export type CalendarResponse = { matches: CalendarMatch[] };


export type LeagueBranding = { logoUrl?: string | null; logoDataUrl?: string | null };
export type League = { id: string; name: string; code: string; branding?: LeagueBranding | null };
export type Membership = {
  id: string;
  role: LeagueRole;
  status: MembershipStatus;
  league: League;
};

export type ScoringMode = "CUMULATIVE" | "BEST_ONLY" | "MIXED";
export type RankingCriterion = "EXACT" | "OUTCOME" | "SUM_GOALS";

export type LeagueRules = {
  pointsExact: number;
  pointsOutcome: number;
  pointsSumGoals: number;
  enableUnderOver25: boolean;
  pointsUnderOver25: number;
  enableMatchdayAwards: boolean;
  enableJolly?: boolean;
  jollyMultiplier?: number;
  enableScorer?: boolean;
  pointsScorer?: number;
  enableCompetitionWinner?: boolean;
  pointsCompetitionWinner?: number;
  enableCompetitionTopScorer?: boolean;
  pointsCompetitionTopScorer?: number;
  enableCompetitionQuarterFinalist?: boolean;
  pointsCompetitionQuarterFinalist?: number;
  enableCompetitionSemiFinalist?: boolean;
  pointsCompetitionSemiFinalist?: number;
  enableCompetitionFinalist?: boolean;
  pointsCompetitionFinalist?: number;
  competitionType?: "LEAGUE" | "KNOCKOUT_CUP";
  scoringMode: ScoringMode;
  allowOutcomeWithExact: boolean;
  allowSumGoalsWithExact: boolean;
  allowSumGoalsWithOutcome: boolean;

  // Under/Over cumulability (MIXED)
  allowUnderOverWithExact?: boolean;
  allowUnderOverWithOutcome?: boolean;
  allowUnderOverWithSumGoals?: boolean;

  // Optional monetization (all optional)
  entryFeeCents?: number | null;
  prizesJson?: Array<{ position: number; amountCents: number }> | null;
};

export type MatchDetailResponse = {
  match: any;
  lineupAvailable: boolean;
  lineups: any[];
  events: any[];
  scorer: { playerExternalId: string; playerName: string } | null;
  scorerEnabled: boolean;
  pointsScorer: number;
  canPickScorer: boolean;
  reason?: string;
};

export type CompetitionPredictionsResponse = {
  competitionType?: "LEAGUE" | "KNOCKOUT_CUP";
  enabled: { winner: boolean; topScorer: boolean; quarterFinalist?: boolean; semiFinalist?: boolean; finalist?: boolean };
  points: { winner: number; topScorer: number; quarterFinalist?: number; semiFinalist?: number; finalist?: number };
  deadline: string | null;
  canEdit: boolean;
  picks: {
    winner: { teamExternalId: number | null; teamName: string | null; pointsAwarded: number } | null;
    topScorer: { playerExternalId: number | null; playerName: string | null; pointsAwarded: number } | null;
    quarterFinalist?: { teamExternalId: number | null; teamName: string | null; pointsAwarded: number } | null;
    semiFinalist?: { teamExternalId: number | null; teamName: string | null; pointsAwarded: number } | null;
    finalist?: { teamExternalId: number | null; teamName: string | null; pointsAwarded: number } | null;
  };
  options: {
    teams: Array<{ id: number; name: string; crest?: string | null }>;
    scorers: Array<{ id: number; name: string; teamName?: string | null; goals?: number }>;
  };
};

export type SaveCompetitionPredictionsBody = {
  winnerTeamId: number | null;
  winnerTeamName?: string | null;
  topScorerPlayerId: number | null;
  topScorerPlayerName?: string | null;
  quarterFinalistTeamId?: number | null;
  quarterFinalistTeamName?: string | null;
  semiFinalistTeamId?: number | null;
  semiFinalistTeamName?: string | null;
  finalistTeamId?: number | null;
  finalistTeamName?: string | null;
};

export type LeagueSettings = {
  lockUntil: string; // ISO date string
  isForceLocked: boolean;
  tieBreak1: RankingCriterion;
  tieBreak2: RankingCriterion;
  tieBreak3: RankingCriterion;

  competitionPredictionsDeadline?: string | null;
};

export type RegolamentoConfigResponse = {
  league: League;
  rules: LeagueRules;
  settings: LeagueSettings;
  monetization: { entryFeeCents: number; prizes: Array<{ position: number; amountCents: number }> };
  lock: {
    lockUntil: string;
    isForceLocked: boolean;
    lockedByTime: boolean;
    /** True if any lock window is currently active. */
    isLocked: boolean;
    /** When true, lock applies to all matchdays (e.g. TOURNAMENT_PRE). */
    lockAll?: boolean;
    /** Matchdays currently locked (scoped lock). */
    lockedMatchdays?: number[];
  };
};

// League statistics (current league)
export type LeagueStatsResponse = {
  // Backward compatible fields (deprecated in UI)
  bestAttack: { userId: string; displayName: string; value: number } | null;
  bestDefense: { userId: string; displayName: string; value: number } | null;

  // Preferred fields
  topTotalPoints?: { userId: string; displayName: string; value: number } | null;
  topExactHits?: { userId: string; displayName: string; value: number } | null;
  topOutcomeHits?: { userId: string; displayName: string; value: number } | null;
  topSumGoalsHits?: { userId: string; displayName: string; value: number } | null;
  topUnderOverHits?: { userId: string; displayName: string; value: number } | null;

  features?: { underOver25: boolean };

  avgPointsPerMatchday: number;

  // League totals (hit counts, not points)
  exactTotal: number;
  outcomeTotal?: number;
  sumGoalsTotal?: number;
  underOverTotal?: number;

  distribution: Array<{ label: string; count: number }>;
  bestMatchday: { matchday: number; avgPoints: number } | null;
  worstMatchday: { matchday: number; avgPoints: number } | null;
};

export function getToken() {
  return localStorage.getItem("tm_token") || "";
}
export function setToken(token: string) {
  localStorage.setItem("tm_token", token);
  // Notify listeners (AuthProvider) even when we don't have direct access to React state here.
  window.dispatchEvent(new Event("tm_auth_changed"));
}
export function clearToken() {
  localStorage.removeItem("tm_token");
  window.dispatchEvent(new Event("tm_auth_changed"));
}

export function getActiveLeagueId() {
  return localStorage.getItem("tm_league_id") || "";
}
export function setActiveLeagueId(id: string) {
  localStorage.setItem("tm_league_id", id);
  window.dispatchEvent(new Event("tm_auth_changed"));
}
export function clearActiveLeagueId() {
  localStorage.removeItem("tm_league_id");
  window.dispatchEvent(new Event("tm_auth_changed"));
}

async function request(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const leagueId = getActiveLeagueId();

  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
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

async function download(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const leagueId = getActiveLeagueId();
  const headers: Record<string, string> = {
    ...(opts.headers as any),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (leagueId) headers["x-league-id"] = leagueId;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: any = new Error(text || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    request(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, displayName: string, password: string) =>
    request(`/api/auth/register`, { method: "POST", body: JSON.stringify({ email, displayName, password }) }),

  verifyEmail: (email: string, code: string) =>
    request(`/api/auth/verify-email`, { method: "POST", body: JSON.stringify({ email, code }) }),
  resendVerification: (email: string) =>
    request(`/api/auth/resend-verification`, { method: "POST", body: JSON.stringify({ email }) }),

  forgotPassword: (email: string) =>
    request(`/api/auth/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email: string, token: string, newPassword: string) =>
    request(`/api/auth/reset-password`, { method: "POST", body: JSON.stringify({ email, token, newPassword }) }),

  // me
  // Optional signal is used by the auth bootstrapper to implement timeouts/retries.
  me: (opts?: { signal?: AbortSignal }) =>
    request(`/api/me`, { signal: opts?.signal }) as Promise<{ user: UserWithAvatar; memberships: Membership[] }>,
  changePassword: (currentPassword: string, newPassword: string) =>
    request(`/api/me/password`, { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
  updateProfile: (payload: { displayName?: string; avatarId?: string | null }) =>
    request(`/api/me/profile`, { method: "PUT", body: JSON.stringify(payload) }),
  adUnlockStatus: () => request(`/api/me/ad-unlock`),
  adUnlock: () => request(`/api/me/ad-unlock`, { method: "POST" }),
  myPredictions: () => request(`/api/me/predictions`),
  matchDetail: (matchId: string) => request(`/api/me/matches/${encodeURIComponent(matchId)}/detail`) as Promise<MatchDetailResponse>,
  setScorer: (matchId: string, payload: { playerId: number | null; playerName?: string | null }) =>
    request(`/api/me/matches/${encodeURIComponent(matchId)}/scorer`, { method: "PUT", body: JSON.stringify(payload) }),
  live: () => request(`/api/me/live`) as Promise<LiveResponse>,
  calendar: () => request(`/api/me/calendar`) as Promise<CalendarResponse>,
  competitionPredictions: () => request(`/api/me/competition-predictions`) as Promise<CompetitionPredictionsResponse>,
  saveCompetitionPredictions: (body: SaveCompetitionPredictionsBody) =>
    request(`/api/me/competition-predictions`, { method: "PUT", body: JSON.stringify(body) }) as Promise<CompetitionPredictionsResponse>,
  savePredictions: (predictions: { matchId: string; homeGoals: number; awayGoals: number }[]) =>
    request(`/api/me/predictions`, { method: "PUT", body: JSON.stringify({ predictions }) }),
  lock: (leagueId?: string, leagueCode?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : leagueCode ? `?leagueCode=${encodeURIComponent(leagueCode)}` : "";
    return request(`/api/lock${q}`);
  },
  // dashboard helper (uses league header x-league-id)
  publicConfig: () => request(`/api/lock`),

  // league public rules+settings (used by "Regolamento")
  regolamentoConfig: () => request(`/api/regolamento-config`) as Promise<RegolamentoConfigResponse>,

  // leagues
  myLeagues: () => request(`/api/leagues/mine`),
  createLeague: (name: string, opts?: { entryFeeCents?: number; prizes?: Array<{ position: number; amountCents: number }> }) =>
    request(`/api/leagues`, { method: "POST", body: JSON.stringify({ name, ...(opts || {}) }) }),
  updateLeague: (leagueId: string, patch: { name?: string }) =>
    request(`/api/leagues/${leagueId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  uploadLeagueLogo: (leagueId: string, dataUrl: string) => request(`/api/leagues/${leagueId}/logo`, { method: "POST", body: JSON.stringify({ dataUrl }) }),
  removeLeagueLogo: (leagueId: string) => request(`/api/leagues/${leagueId}/logo`, { method: "DELETE" }),
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
  adminExportPredictionsCsv: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return download(`/api/admin/exports/predictions.csv${q}`);
  },
  adminRules: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/rules${q}`);
  },
  adminSaveRules: (rules: any, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/rules${q}`, { method: "PUT", body: JSON.stringify(rules) });
  },
  // jolly (admin)
  adminJolly: (leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/jolly${q}`);
  },
  adminSaveJollySettings: (payload: { enableJolly: boolean; jollyMultiplier: number }, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/jolly/settings${q}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  adminSetJollyForMatchday: (matchday: number, matchId: string | null, leagueId?: string) => {
    const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
    return request(`/api/admin/jolly/${matchday}${q}`, { method: "PUT", body: JSON.stringify({ matchId }) });
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

  // push
  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request(`/api/push/subscribe`, { method: "POST", body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) =>
    request(`/api/push/unsubscribe`, { method: "POST", body: JSON.stringify({ endpoint }) }),
  pushTest: () => request(`/api/push/test`, { method: "POST" }),

  // super admin monetization
  superMonetization: () => request(`/api/super/monetization`),
  superSaveMonetization: (config: { adsEnabled?: boolean; demoAdsEnabled?: boolean; unlockMinutes?: number }) =>
    request(`/api/super/monetization`, { method: "PUT", body: JSON.stringify(config) }),
  superMonetizationStats: () => request(`/api/super/monetization/stats`),

  // super admin - external football provider
  superExternalConfig: () => request(`/api/super/external-config`),
  superSaveExternalConfig: (patch: any) => request(`/api/super/external-config`, { method: "PUT", body: JSON.stringify(patch) }),

  // super admin - global competition outcome (winner + top scorer)
  superCompetitionOutcome: () => request(`/api/super/competition-outcome`),
  superSaveCompetitionOutcome: (payload: {
    winnerTeamId?: number | null;
    winnerTeamName?: string | null;
    topScorerPlayerId?: number | null;
    topScorerPlayerName?: string | null;
    secondTopScorerPlayerId?: number | null;
    secondTopScorerPlayerName?: string | null;
    quarterFinalistTeams?: Array<{ id: number; name: string }>;
    semiFinalistTeams?: Array<{ id: number; name: string }>;
    finalistTeams?: Array<{ id: number; name: string }>;
  }) => request(`/api/super/competition-outcome`, { method: "PUT", body: JSON.stringify(payload) }),
  superSearchExternalLeagues: (search: string, season?: number) => {
    const params = new URLSearchParams();
    params.set("search", search);
    if (season) params.set("season", String(season));
    return request(`/api/super/external/leagues?${params.toString()}`);
  },
  superImportFixtures: () => request(`/api/super/external/import-fixtures`, { method: "POST" }),
  // league stats
  leagueStats: () => request(`/api/league/stats`) as Promise<LeagueStatsResponse>,
};

export function apiUrl() {
  return API_URL;
}