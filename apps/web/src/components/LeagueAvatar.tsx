import React, { useMemo, useState } from "react";
import { getLeagueLogoUrl } from "../lib/leagueLogo";

export function LeagueAvatar({ leagueId, leagueName, size = 40 }: { leagueId: string; leagueName: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const url = useMemo(() => getLeagueLogoUrl(leagueId), [leagueId]);

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
        src={`${url}?v=${encodeURIComponent(String(Date.now()))}`}
        alt={leagueName}
        style={baseStyle}
        className="shrink-0 rounded-full object-cover border border-slate-200"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      style={baseStyle}
      className="shrink-0 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-600 font-semibold"
      aria-label={leagueName}
      title={leagueName}
    >
      {initials}
    </div>
  );
}
