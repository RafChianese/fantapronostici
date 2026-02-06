import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader } from "../components/ui";
import { useAuth } from "../lib/auth";

type Row = {
  userId: string;
  displayName: string;
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
        setRows(r.leaderboard || []);
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
        {loading ? null : (
          <div className="divide-y divide-slate-100">
            {rows.map((r, idx) => (
              <div key={r.userId} className={`py-3 ${user?.id && r.userId === user.id ? "rounded-2xl bg-[#2EC4B6]/10 px-3" : ""}`}>
                {/* Mobile: 2 righe senza scroll orizzontale. Desktop: layout a colonne */}
                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                  <div className="flex items-center justify-between sm:col-span-8 sm:justify-start sm:gap-3">
                    <div className="flex items-center gap-3">
                      <Badge tone={idx === 0 ? "amber" : "gray"}>#{idx + 1}</Badge>
                      <Link className="font-medium hover:underline" to={`/users/${r.userId}`}>{r.displayName}</Link>
                    </div>
                    <div className="text-right text-sm font-semibold sm:hidden">{r.totalPoints} pt</div>
                  </div>

                  <div className="hidden sm:col-span-2 sm:block sm:text-right sm:text-sm sm:font-semibold">{r.totalPoints} pt</div>

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
            ))}
            {rows.length === 0 ? <div className="py-6 text-sm text-slate-600">Nessun partecipante attivo.</div> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
