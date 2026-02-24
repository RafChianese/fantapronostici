import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearActiveLeagueId,
  clearToken,
  getActiveLeagueId,
  getToken,
  setActiveLeagueId,
  setToken,
  type Membership,
  type UserWithAvatar as User,
} from "./api";
import type { AuthBootstrapError } from "../components/AuthBootstrapOverlay";

type AuthState = {
  user: User | null;
  memberships: Membership[];
  activeLeagueId: string;
  token: string;
  /** 3-state guard: loading (unknown), authed, unauthed */
  authStatus: "loading" | "authed" | "unauthed";
  /** Only present when bootstrapping /api/me failed due to timeout/network */
  bootstrapError: AuthBootstrapError | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string
  ) => Promise<{ ok: boolean; requiresVerification: boolean; email: string; token?: string; user?: User }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  setActiveLeague: (leagueId: string) => void;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTok] = useState(getToken());
  const [activeLeagueId, setLeague] = useState(getActiveLeagueId());
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [authStatus, setAuthStatus] = useState<"loading" | "authed" | "unauthed">(token ? "loading" : "unauthed");
  const [bootstrapError, setBootstrapError] = useState<AuthBootstrapError | null>(null);

  function hardLogout() {
    clearToken();
    clearActiveLeagueId();
    setTok("");
    setLeague("");
    setUser(null);
    setMemberships([]);
    setBootstrapError(null);
    setAuthStatus("unauthed");
  }

  async function bootstrapMe() {
    const tok = getToken();
    if (!tok) {
      setUser(null);
      setMemberships([]);
      setBootstrapError(null);
      setAuthStatus("unauthed");
      return;
    }

    setAuthStatus("loading");
    setBootstrapError(null);

    // Retry with light backoff, but with a global time budget (so we don't keep users waiting forever).
    const budgetMs = 20_000;
    const backoffs = [0, 1000, 3000];
    const started = Date.now();
    let lastErr: any = null;

    for (let i = 0; i < backoffs.length; i++) {
      const delay = backoffs[i];
      if (delay) await new Promise((r) => setTimeout(r, delay));

      const elapsed = Date.now() - started;
      const remaining = budgetMs - elapsed;
      if (remaining <= 0) break;

      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), remaining);

      try {
        const data = await api.me({ signal: ctrl.signal });
        window.clearTimeout(t);

        setUser(data.user);
        setMemberships(data.memberships || []);

        // Auto-pick an approved league if not set
        const current = getActiveLeagueId();
        if (!current) {
          const approved = (data.memberships || []).find((m: Membership) => m.status === "APPROVED");
          if (approved) {
            setActiveLeagueId(approved.league.id);
            setLeague(approved.league.id);
          }
        }

        setAuthStatus("authed");
        setBootstrapError(null);
        return;
      } catch (e: any) {
        window.clearTimeout(t);
        lastErr = e;

        // If backend explicitly says unauthorized, logout and redirect to /login (one time).
        const status = e?.status;
        if (status === 401 || status === 403) {
          hardLogout();
          return;
        }

        // For network / timeout / CORS / fetch abort we do NOT clear the token.
        // We'll keep the user in a "bootstrapping" state with a manual retry CTA.
      }
    }

    const isAbort = lastErr?.name === "AbortError";
    setBootstrapError({
      kind: isAbort ? "timeout" : "network",
      message: isAbort
        ? "La verifica della sessione sta impiegando troppo tempo (rete lenta o server non raggiungibile)."
        : "Problema di rete durante la verifica della sessione. Controlla la connessione e riprova.",
    });
    setAuthStatus("loading");
  }

  async function refreshMe() {
    await bootstrapMe();
  }

  useEffect(() => {
    // Keep React state in sync with localStorage changes (OAuth callback, multi-tab, etc.)
    const onAuthChanged = () => {
      setTok(getToken());
      setLeague(getActiveLeagueId());
    };
    window.addEventListener("storage", onAuthChanged);
    window.addEventListener("tm_auth_changed", onAuthChanged);
    return () => {
      window.removeEventListener("storage", onAuthChanged);
      window.removeEventListener("tm_auth_changed", onAuthChanged);
    };
  }, []);

  useEffect(() => {
    // When token changes, bootstrap the session.
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      memberships,
      activeLeagueId,
      token,
      authStatus,
      bootstrapError,
      login: async (email, password) => {
        const data = await api.login(email, password);
        setToken(data.token);
        setTok(data.token);
        setUser(data.user);
        // memberships loaded by refreshMe
      },
      register: async (email, displayName, password) => {
        const data = await api.register(email, displayName, password);
        // Email verification is currently disabled; backend may return token directly.
        if (data?.token) {
          setToken(data.token);
          setTok(data.token);
          if (data.user) setUser(data.user);
        }
        return data;
      },
      verifyEmail: async (email: string, code: string) => {
        const data = await api.verifyEmail(email, code);
        setToken(data.token);
        setTok(data.token);
        setUser(data.user);
      },
      resendVerification: async (email: string) => {
        await api.resendVerification(email);
      },
      refreshMe,
      retryBootstrap: async () => {
        await bootstrapMe();
      },
      setActiveLeague: (leagueId: string) => {
        setActiveLeagueId(leagueId);
        setLeague(leagueId);
      },
      logout: () => {
        hardLogout();
      },
    }),
    [user, memberships, activeLeagueId, token, authStatus, bootstrapError]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
