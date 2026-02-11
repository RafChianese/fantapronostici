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

        const prevLocked = !!dataRef.current?.lock?.isLocked;
        const nextLocked = !!next?.lock?.isLocked;

        setData(next);

        // If lock just became active, force a full reload to avoid any chance of editing with stale state.
        if (!prevLocked && nextLocked) {
          const markerKey = "tm_lock_reload_marker";
          const marker = `${safeIso(next.lock.lockUntil)}_${next.lock.isForceLocked ? "force" : "time"}`;
          const prevMarker = sessionStorage.getItem(markerKey);
          if (prevMarker !== marker) {
            sessionStorage.setItem(markerKey, marker);
            push({ tone: "danger", msg: "Lock appena attivato: aggiornamento…", ttlMs: 1800 });
            // Slight delay so the toast can render before reload.
            setTimeout(() => window.location.reload(), 200);
          }
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
