import React, { useMemo } from "react";
import { useLock } from "../lib/lock";
import { Badge, Button } from "./ui";
import { Countdown } from "./Countdown";

function formatLocal(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

export function LockBanner() {
  const { data, refresh } = useLock();

  const lock = data?.lock;
  const nowIso = useMemo(() => new Date().toISOString(), [lock?.lockUntil, lock?.isLocked, lock?.isForceLocked]);

  if (!lock) return null;

  const lockUntilMs = new Date(lock.lockUntil).getTime();
  const isFutureLock = Number.isFinite(lockUntilMs) && lockUntilMs > Date.now();

  const showCountdown = isFutureLock;

  const containerCls = lock.isLocked
    ? "bg-rose-50 border-rose-200"
    : "bg-sky-50 border-sky-200";

  const title = lock.isLocked ? "Pronostici bloccati" : "Finestra pronostici aperta";

  const subtitle = lock.isLocked
    ? lock.isForceLocked
      ? "Lock manuale attivo. Non puoi modificare i pronostici."
      : "Il tempo per modificare i pronostici è scaduto."
    : showCountdown
    ? `Il lock partirà il ${formatLocal(lock.lockUntil)}.`
    : "Puoi inserire e modificare i pronostici finché la finestra è aperta.";

  return (
    <div className={`border-t ${containerCls}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {lock.isLocked ? <Badge tone="rose">LOCK</Badge> : <Badge tone="blue">OPEN</Badge>}
          </div>
          <div className="mt-1 text-xs text-slate-700">{subtitle}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showCountdown ? (
            <div className="rounded-2xl bg-white/70 px-3 py-2">
              <Countdown
                lockUntilIso={lock.lockUntil}
                nowIso={nowIso}
                labelOpen={lock.isLocked ? "Sblocco tra" : "Lock tra"}
                labelClosed={lock.isLocked ? "Pronostici bloccati" : "Pronostici bloccati"}
              />
            </div>
          ) : null}
          <Button variant="secondary" onClick={() => refresh()}>
            Aggiorna
          </Button>
        </div>
      </div>
    </div>
  );
}
