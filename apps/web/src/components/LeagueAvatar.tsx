import React, { useMemo, useState } from "react";
import { getLeagueLogoUrl } from "../lib/leagueLogo";

export function LeagueAvatar({ leagueId, leagueName, logoSrc, size = 40 }: { leagueId: string; leagueName: string; logoSrc?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const url = useMemo(() => logoSrc || getLeagueLogoUrl(leagueId), [leagueId, logoSrc]);

  const initials = useMemo(() => {
    const parts = (leagueName || "").trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "L";
    const b = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] || "");
    return (a + b).toUpperCase();
  }, [leagueName]);

  const baseStyle: React.CSSProperties = { width: size, height: size };

  if (url && !broken) {
    return (
      <img
        src={url.startsWith("data:") ? url : `${url}?v=${encodeURIComponent(String(Date.now()))}`}
        alt={leagueName}
        style={baseStyle}
        className="shrink-0 rounded-full object-cover border border-cyan-100/15"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      style={baseStyle}
      className="shrink-0 rounded-full border border-cyan-100/15 bg-slate-950 flex items-center justify-center text-cyan-50/85 font-semibold"
      aria-label={leagueName}
      title={leagueName}
    >
      {initials}
    </div>
  );
}
