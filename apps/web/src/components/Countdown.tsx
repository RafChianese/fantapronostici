import React, { useEffect, useMemo, useState } from "react";

function pad(n: number) { return String(n).padStart(2, "0"); }

export function Countdown({ lockUntilIso, nowIso, labelOpen, labelClosed }: { lockUntilIso: string; nowIso: string; labelOpen?: string; labelClosed?: string }) {
  const lockUntil = useMemo(() => new Date(lockUntilIso).getTime(), [lockUntilIso]);
  const [now, setNow] = useState(() => new Date(nowIso).getTime());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, lockUntil - now);
  const closed = diff === 0;
  const seconds = Math.floor(diff / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="text-sm font-medium text-slate-700 sm:text-xs sm:font-normal sm:text-slate-600">{closed ? (labelClosed ?? "Pronostici bloccati") : (labelOpen ?? "Modifiche aperte")}</div>
      <div className="font-mono text-lg leading-none sm:text-sm">
        {d > 0 ? `${d}d ` : ""}{pad(h)}:{pad(m)}:{pad(s)}
      </div>
    </div>
  );
}
