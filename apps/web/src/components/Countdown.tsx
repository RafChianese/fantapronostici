import React, { useEffect, useMemo, useState } from "react";

function pad(n: number) { return String(n).padStart(2, "0"); }

export function Countdown({ lockUntilIso, nowIso, labelOpen, labelClosed, compact = false }: { lockUntilIso: string; nowIso: string; labelOpen?: string; labelClosed?: string; compact?: boolean }) {
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

  const timeStr = `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`;

  if (compact) {
    const lbl = closed ? (labelClosed ?? "Pronostici bloccati") : (labelOpen ?? "Modifiche aperte");
    return (
      <div className="flex items-center gap-2 text-xs text-slate-700">
        <span className="truncate">{lbl}</span>
        <span className="font-mono">{timeStr}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-orange-50/60">{closed ? (labelClosed ?? "Pronostici bloccati") : (labelOpen ?? "Modifiche aperte")}</div>
      <div className="font-mono text-sm">{timeStr}</div>
    </div>
  );
}
