import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { UserAvatar } from "../components/Avatar";
import { AnimatedNumber } from "../components/AnimatedNumber";

type Row = {
  userId: string;
  displayName: string;
  avatarJson?: any;
  totalPoints: number;
  exactHits: number;
  outcomeHits: number;
  sumGoalsHits: number;
  underOverHits?: number;
  matchdayWins?: number;
};

type SortValue = {
  key: "points" | "exact" | "outcome" | "sumgoals";
  dir: "desc" | "asc";
  label: string;
};

export default function LeaderboardPage() {
  const { activeLeagueId, user } = useAuth();
  const { show, hide } = useLoading();
  const [sortKey, setSortKey] = useState<"points" | "exact" | "outcome" | "sumgoals">("points");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [sortOpen, setSortOpen] = useState(false);

  const sortParam = `${sortKey}_${sortDir}`;

  const [rows, setRows] = useState<Row[]>([]);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | "">>({});
  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const idx = rows.findIndex((r) => r.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, user?.id]);

  const [leagueName, setLeagueName] = useState<string>("");
  const [features, setFeatures] = useState<{ underOver25: boolean; matchdayAwards: boolean }>({ underOver25: false, matchdayAwards: false });
  const [loading, setLoading] = useState(true);

  const sortOptions: SortValue[] = useMemo(
    () => [
      { key: "points", dir: "desc", label: "Punti (ordine decrescente)" },
      { key: "points", dir: "asc", label: "Punti (ordine crescente)" },
      { key: "exact", dir: "desc", label: "Risultati esatti (ordine decrescente)" },
      { key: "exact", dir: "asc", label: "Risultati esatti (ordine crescente)" },
      { key: "outcome", dir: "desc", label: "Pronostici 1X2 (ordine decrescente)" },
      { key: "outcome", dir: "asc", label: "Pronostici 1X2 (ordine crescente)" },
      { key: "sumgoals", dir: "desc", label: "Somma gol (ordine decrescente)" },
      { key: "sumgoals", dir: "asc", label: "Somma gol (ordine crescente)" },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    show();
    setLoading(true);
    api.leaderboard(sortParam)
      .then((r) => {
        if (cancelled) return;
        const nextRows = (r.leaderboard || []) as Row[];

        // Highlight position changes (persist previous snapshot in localStorage).
        try {
          const key = `tm_leaderboard_pos_${activeLeagueId || ""}_${sortParam}`;
          const prevRaw = localStorage.getItem(key);
          const prev: Record<string, number> = prevRaw ? JSON.parse(prevRaw) : {};
          const nextPos: Record<string, number> = {};
          nextRows.forEach((row, idx) => { nextPos[row.userId] = idx + 1; });

          const d: Record<string, number> = {};
          const f: Record<string, "up" | "down" | ""> = {};
          for (const row of nextRows) {
            const p = prev[row.userId];
            const n = nextPos[row.userId];
            if (typeof p === "number" && typeof n === "number" && p !== n) {
              const delta = p - n; // positive => moved up
              d[row.userId] = delta;
              f[row.userId] = delta > 0 ? "up" : "down";
            }
          }
          setDeltas(d);
          setFlash(f);
          localStorage.setItem(key, JSON.stringify(nextPos));
          // Clear flash after a short delay.
          window.setTimeout(() => setFlash({}), 1400);
        } catch {
          // ignore storage errors
        }

        setRows(nextRows);
        setLeagueName(r?.league?.name ? String(r.league.name) : "");
        setFeatures({ underOver25: !!r?.features?.underOver25, matchdayAwards: !!r?.features?.matchdayAwards });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        hide();
      });
    return () => { cancelled = true; };
  }, [sortKey, sortDir, activeLeagueId]);

  return (
    <Card>
      <CardHeader
        title="Classifica generale"
        subtitle={leagueName ? `Lega: ${leagueName}` : "Seleziona una lega per vedere la classifica."}
        right={
          <div className="flex flex-col items-end gap-2">
            {myRank ? <Badge tone="green">La tua posizione: #{myRank}</Badge> : null}
            <Button variant="secondary" onClick={() => setSortOpen(true)} aria-label="Ordina">
              <span className="text-lg" aria-hidden="true">⇅</span>
              <span className="ml-2 hidden sm:inline">Ordina</span>
          </Button>
          </div>
        }
      />

      {sortOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Chiudi ordinamento"
            onClick={() => setSortOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold">Ordina per</div>
              <Button variant="ghost" onClick={() => setSortOpen(false)} aria-label="Chiudi">✕</Button>
            </div>

            <div className="divide-y divide-slate-100">
              {sortOptions.map((opt) => {
                const active = opt.key === sortKey && opt.dir === sortDir;
                return (
                  <button
                    key={`${opt.key}_${opt.dir}`}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                    onClick={() => {
                      setSortKey(opt.key);
                      setSortDir(opt.dir);
                      setSortOpen(false);
                    }}
                  >
                    <span className="text-sm text-slate-900">{opt.label}</span>
                    <span
                      className={`h-5 w-5 rounded-full border ${active ? "border-[#2EC4B6] bg-[#2EC4B6]" : "border-slate-300"}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r, idx) => {
              const tr = flash[r.userId] || "";
              const flashCls = tr === "up" ? "tm-flash-up" : tr === "down" ? "tm-flash-down" : "";
              const delta = deltas[r.userId] || 0;
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
              const medalTone = idx === 0 ? "amber" : idx === 1 ? "blue" : idx === 2 ? "rose" : "gray";
              const medalGlow = idx <= 2 ? "tm-medal-glow" : "";
              return (
              <div key={r.userId} className={`py-3 ${user?.id && r.userId === user.id ? "rounded-2xl bg-[#2EC4B6]/10 px-3" : ""} ${flashCls}`}>
                {/* Mobile: 2 righe senza scroll orizzontale. Desktop: layout a colonne */}
                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                  <div className="flex items-center justify-between sm:col-span-8 sm:justify-start sm:gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${idx <= 2 ? "border-[#2EC4B6]/30 bg-white" : "border-slate-200 bg-slate-50"} ${medalGlow}`}>
                          <span className="tabular-nums">#{idx + 1}</span>
                          {medal ? <span aria-hidden="true">{medal}</span> : null}
                        </span>
                        {delta !== 0 ? (
                          <span className="text-[11px] font-semibold text-slate-700" title="Variazione posizione">
                            {delta > 0 ? "▲" : "▼"}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={r.userId} avatar={r.avatarJson || null} size={26} className="shadow-sm" />
                        <Link className="font-medium hover:underline" to={`/users/${r.userId}`}>{r.displayName}</Link>
                        {idx <= 2 ? <Badge tone={medalTone}>Top {idx + 1}</Badge> : null}
                      </div>
                    </div>
                    <div className="text-right text-sm font-extrabold sm:hidden">
                      <AnimatedNumber value={r.totalPoints} /> pt
                    </div>
                  </div>

                  <div className="hidden sm:col-span-2 sm:block sm:text-right sm:text-sm sm:font-extrabold">
                    <AnimatedNumber value={r.totalPoints} /> pt
                  </div>

                  <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1 text-xs text-slate-700 sm:col-span-2 sm:justify-end sm:flex-nowrap sm:gap-x-3">
                    <span className="whitespace-nowrap" title="Risultati esatti">🎯 {r.exactHits}</span>
                    <span className="whitespace-nowrap" title="Pronostici 1X2">✅ {r.outcomeHits}</span>
                    <span className="whitespace-nowrap" title="Somma gol">Σ {r.sumGoalsHits}</span>
                    {features.underOver25 ? (
                      <span className="whitespace-nowrap" title="Under/Over 2.5 (somma gol > 2 = Over; ≤ 2 = Under)">⚖️ {(r.underOverHits ?? 0)}</span>
                    ) : null}
                    {features.matchdayAwards ? (
                      <span className="whitespace-nowrap" title="Miglior risultato di giornata (🥇)">🥇 {(r.matchdayWins ?? 0)}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
            })}
            {rows.length === 0 ? <div className="py-6 text-sm text-slate-600">Nessun partecipante attivo.</div> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
