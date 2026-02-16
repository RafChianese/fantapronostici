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
    let interval: any = null;
    let timer: any = null;

    const scheduleExact = (iso?: string) => {
      if (timer) clearTimeout(timer);
      if (!iso) return;
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return;
      const ms = t - Date.now();
      if (ms <= 0) return;
      // refresh shortly after expected lock time
      timer = setTimeout(() => {
        if (!cancelled) refresh();
      }, Math.min(ms + 350, 2_147_483_600));
    };

    (async () => {
      try {
        await refresh();
      } catch {
        // ignore
      }
    })();

    interval = setInterval(async () => {
      try {
        const next = (await api.publicConfig()) as LockResponse;
        if (cancelled) return;

        const prev = dataRef.current;
        const prevLocked = !!prev?.lock?.isLocked;
        const nextLocked = !!next?.lock?.isLocked;

        // Only update React state if something relevant actually changed.
        // This avoids heavy rerenders (and losing in-progress edits) while we poll.
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
          // Update the ref immediately too, so the next poll doesn't see stale state.
          dataRef.current = next;
        }

        // Reload the predictions page only when the lock state actually changes.
        // This guarantees the UI cannot keep editing across the lock boundary,
        // without reloading on every poll.
        try {
          const stored = sessionStorage.getItem(lockStateKey);
          const storedLocked = stored === "1";
          const storedIsValid = stored === "1" || stored === "0";
          const lockChanged = storedIsValid ? storedLocked !== nextLocked : prevLocked !== nextLocked;

          // Persist the new state so a reload while locked doesn't cause another reload loop.
          sessionStorage.setItem(lockStateKey, nextLocked ? "1" : "0");

          if (lockChanged) {
            // Prevent back-to-back reload storms (edge cases / flaky time sync)
            const last = Number(sessionStorage.getItem(lastReloadAtKey) || "0");
            const now = Date.now();
            const allow = !Number.isFinite(last) || now - last > 5_000;
            if (allow) {
              sessionStorage.setItem(lastReloadAtKey, String(now));
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

        scheduleExact(next?.lock?.lockUntil);
      } catch {
        // ignore polling errors
      }
    }, 10_000);

    scheduleExact(dataRef.current?.lock?.lockUntil);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (timer) clearTimeout(timer);
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
