import React, { useMemo } from "react";
import { useLock } from "../lib/lock";
import { Badge } from "./ui";
import { Countdown } from "./Countdown";
import { Lock } from "lucide-react";

function formatLocal(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

export function LockBanner() {
  const { data } = useLock();

  const lock = data?.lock;
  const nowIso = useMemo(() => new Date().toISOString(), [lock?.lockUntil, lock?.isLocked, lock?.isForceLocked]);

  if (!lock) return null;

  const lockUntilMs = new Date(lock.lockUntil).getTime();
  const isFutureLock = Number.isFinite(lockUntilMs) && lockUntilMs > Date.now();

  const showCountdown = isFutureLock;

  const containerCls = lock.isLocked ? "bg-rose-50 border-rose-200" : "bg-sky-50 border-sky-200";
  const title = lock.isLocked ? "LOCK" : "OPEN";
  const subtitle = showCountdown ? `${lock.isLocked ? "Sblocco" : "Lock"} il ${formatLocal(lock.lockUntil)}` : (lock.isLocked ? "Pronostici non modificabili" : "Pronostici modificabili");

  return (
    <div className={`border-t ${containerCls}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0 flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-700" aria-hidden="true" />
          {lock.isLocked ? <Badge tone="rose">{title}</Badge> : <Badge tone="blue">{title}</Badge>}
          <div className="min-w-0 truncate text-xs text-slate-700">{subtitle}</div>
        </div>

        {showCountdown ? (
          <div className="shrink-0 rounded-2xl bg-white/70 px-3 py-1">
            <div className="whitespace-nowrap">
              <Countdown
                lockUntilIso={lock.lockUntil}
                nowIso={nowIso}
                labelOpen={lock.isLocked ? "Sblocco tra" : "Lock tra"}
                labelClosed={lock.isLocked ? "Pronostici bloccati" : "Pronostici bloccati"}
                compact
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
