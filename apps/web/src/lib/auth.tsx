import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearActiveLeagueId, clearToken, getActiveLeagueId, getToken, setActiveLeagueId, setToken, type Membership, type User } from "./api";

type AuthState = {
  user: User | null;
  memberships: Membership[];
  activeLeagueId: string;
  token: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<{ ok: boolean; requiresVerification: boolean; email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  setActiveLeague: (leagueId: string) => void;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTok] = useState(getToken());
  const [activeLeagueId, setLeague] = useState(getActiveLeagueId());
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    if (!getToken()) {
      setUser(null);
      setMemberships([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me();
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
    } catch {
      clearToken();
      clearActiveLeagueId();
      setTok("");
      setLeague("");
      setUser(null);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      memberships,
      activeLeagueId,
      token,
      loading,
      login: async (email, password) => {
        const data = await api.login(email, password);
        setToken(data.token);
        setTok(data.token);
        setUser(data.user);
        // memberships loaded by refreshMe
      },
      register: async (email, displayName, password) => {
        const data = await api.register(email, displayName, password);
        // No token until email is verified.
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
      setActiveLeague: (leagueId: string) => {
        setActiveLeagueId(leagueId);
        setLeague(leagueId);
      },
      logout: () => {
        clearToken();
        clearActiveLeagueId();
        setTok("");
        setLeague("");
        setUser(null);
        setMemberships([]);
      },
    }),
    [user, memberships, activeLeagueId, token, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
