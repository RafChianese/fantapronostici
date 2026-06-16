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

  const lockedMatchdays = Array.isArray((lock as any).lockedMatchdays)
    ? (lock as any).lockedMatchdays.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n))
    : [];
  const isPartial = !!lock.isLocked && !(lock as any).lockAll && lockedMatchdays.length > 0;

  const containerCls = lock.isLocked ? "bg-rose-50 border-rose-200" : "bg-sky-50 border-sky-200";
  const title = lock.isLocked ? (isPartial ? "LOCK PARZIALE" : "LOCK") : "OPEN";
  const subtitle = isPartial
    ? `Giornate bloccate: ${lockedMatchdays.sort((a: number, b: number) => a - b).join(", ")}`
    : showCountdown
    ? `${lock.isLocked ? "Sblocco" : "Lock"} il ${formatLocal(lock.lockUntil)}`
    : lock.isLocked
    ? "Pronostici non modificabili"
    : "Pronostici modificabili";

  return (
    <div className={`border-t ${containerCls}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0 flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-700" aria-hidden="true" />
          {lock.isLocked ? <Badge tone={isPartial ? "amber" : "rose"}>{title}</Badge> : <Badge tone="blue">{title}</Badge>}
          <div className="min-w-0 truncate text-xs text-slate-700">{subtitle}</div>
        </div>

        {showCountdown ? (
          <div className="shrink-0 rounded-2xl bg-cyan-950/35 px-3 py-1 ring-1 ring-slate-800">
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
