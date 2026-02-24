import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { useToast } from "./toast";

export type LockResponse = {
  lock: {
    lockUntil: string;
    isForceLocked: boolean;
    lockedByTime: boolean;
    isLocked: boolean;
    lockAll?: boolean;
    lockedMatchdays?: number[];
  };
  leagueSettings?: {
    lockMode?: "MANUAL" | "AUTO";
    lockOffsetMinutes?: number;
    predictionMode?: "MATCHDAY_BY_MATCHDAY" | "TOURNAMENT_PRE";
  };
  features?: {
    underOver25?: boolean;
    matchdayAwards?: boolean;
  };
};

type LockCtx = {
  data: LockResponse | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<LockCtx | null>(null);

function safeIso(d: any) {
  try {
    const t = new Date(d).toISOString();
    return t;
  } catch {
    return new Date().toISOString();
  }
}

export function LockProvider({ children }: { children: React.ReactNode }) {
  const { activeLeagueId } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<LockResponse | null>(null);

  // Session-scoped state to avoid reload loops: when the page reloads while locked,
  // the first poll would otherwise see "prevLocked=false" and reload again.
  const lockStateKey = "tm_lock_state_v1";
  const lastReloadAtKey = "tm_lock_last_reload_at_v1";

  const dataRef = useRef<LockResponse | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(async () => {
    if (!activeLeagueId) {
      setData(null);
      return;
    }
    const next = (await api.publicConfig()) as LockResponse;
    setData(next);
    // Keep a stable marker of the last known lock state across reloads.
    try {
      sessionStorage.setItem(lockStateKey, next?.lock?.isLocked ? "1" : "0");
    } catch {
      // ignore
    }
  }, [activeLeagueId]);

  useEffect(() => {
    let cancelled = false;
    let timer: any = null;
    let inflight: Promise<void> | null = null;

    const schedule = (next?: LockResponse | null) => {
      if (timer) clearTimeout(timer);

      // Goal: avoid calling /api/lock every 10s. Instead, refresh:
      // - once on mount/league change
      // - shortly after the next known lock boundary (lockUntil)
      // - otherwise on a slow cadence (60s)
      // - also when the tab becomes visible again
      const iso = next?.lock?.lockUntil;
      const t = iso ? new Date(iso).getTime() : NaN;
      const now = Date.now();

      // Default slow cadence.
      let ms = 60_000;

      if (Number.isFinite(t)) {
        const delta = t - now;
        // If there's a lock boundary in the next 2 minutes, schedule exactly there (+350ms).
        if (delta > 0 && delta <= 120_000) ms = Math.max(750, delta + 350);
      }

      timer = setTimeout(() => {
        if (!cancelled) runOnce();
      }, Math.min(ms, 2_147_483_600));
    };

    const runOnce = async () => {
      if (!activeLeagueId) {
        setData(null);
        return;
      }
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const next = (await api.publicConfig()) as LockResponse;
          if (cancelled) return;

          const prev = dataRef.current;
          const prevLocked = !!prev?.lock?.isLocked;
          const nextLocked = !!next?.lock?.isLocked;

          // Only update React state if something relevant actually changed.
          const prevMds = (prev?.lock as any)?.lockedMatchdays ?? [];
          const nextMds = (next?.lock as any)?.lockedMatchdays ?? [];
          const sameMds =
            Array.isArray(prevMds) &&
            Array.isArray(nextMds) &&
            prevMds.length === nextMds.length &&
            [...prevMds].sort().every((v: any, i: number) => Number(v) === Number([...nextMds].sort()[i]));

          const sameLock =
            !!prev &&
            prev.lock.isLocked === next.lock.isLocked &&
            prev.lock.lockUntil === next.lock.lockUntil &&
            prev.lock.isForceLocked === next.lock.isForceLocked &&
            prev.lock.lockedByTime === next.lock.lockedByTime &&
            (prev.lock as any).lockAll === (next.lock as any).lockAll &&
            sameMds &&
            (prev.leagueSettings?.lockMode ?? null) === (next.leagueSettings?.lockMode ?? null) &&
            (prev.leagueSettings?.lockOffsetMinutes ?? null) === (next.leagueSettings?.lockOffsetMinutes ?? null) &&
            (prev.leagueSettings?.predictionMode ?? null) === (next.leagueSettings?.predictionMode ?? null);

          if (!sameLock) {
            setData(next);
            dataRef.current = next;
          } else {
            // Still update ref to keep schedule accurate
            dataRef.current = next;
          }

          // Reload the predictions page only when the lock state actually changes.
          try {
            const stored = sessionStorage.getItem(lockStateKey);
            const storedLocked = stored === "1";
            const storedIsValid = stored === "1" || stored === "0";
            const lockChanged = storedIsValid ? storedLocked !== nextLocked : prevLocked !== nextLocked;

            sessionStorage.setItem(lockStateKey, nextLocked ? "1" : "0");

            if (lockChanged) {
              const last = Number(sessionStorage.getItem(lastReloadAtKey) || "0");
              const now2 = Date.now();
              const allow = !Number.isFinite(last) || now2 - last > 5_000;
              if (allow) {
                sessionStorage.setItem(lastReloadAtKey, String(now2));
                const path = window.location.pathname;
                const isPredictionsPage = path === "/"; // "I miei pronostici"
                if (isPredictionsPage) {
                  push({ tone: "info", msg: "Lock aggiornato: ricarico i pronostici…", ttlMs: 1600 });
                  setTimeout(() => window.location.reload(), 150);
                }
              }
            }
          } catch {
            // ignore
          }

          schedule(next);
        } catch {
          // ignore polling errors, but keep a slow retry cadence
          schedule(dataRef.current);
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") runOnce();
    };

    document.addEventListener("visibilitychange", onVisibility);

    // First fetch + schedule
    runOnce();
    schedule(dataRef.current);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeLeagueId, push, refresh]);

  const value = useMemo(() => ({ data, refresh }), [data, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLock must be used within LockProvider");
  return ctx;
}
