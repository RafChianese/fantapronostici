import React, { useEffect, useState } from "react";
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

export default function LeaderboardPage() {
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [sortKey, setSortKey] = useState<"points" | "exact" | "outcome" | "sumgoals">("points");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sortParam = `${sortKey}_${sortDir}`;
  const [rows, setRows] = useState<Row[]>([]);
  const [leagueName, setLeagueName] = useState<string>("");
  const [features, setFeatures] = useState<{ underOver25: boolean; matchdayAwards: boolean }>({ underOver25: false, matchdayAwards: false });
  const [loading, setLoading] = useState(true);

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={sortKey === "points" ? "primary" : "secondary"}
              onClick={() => {
                if (sortKey === "points") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortKey("points"); setSortDir("desc"); }
              }}
            >
              Punti {sortKey === "points" ? (sortDir === "desc" ? "▼" : "▲") : ""}
            </Button>
            <Button
              variant={sortKey === "exact" ? "primary" : "secondary"}
              onClick={() => {
                if (sortKey === "exact") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortKey("exact"); setSortDir("desc"); }
              }}
            >
              Esatti {sortKey === "exact" ? (sortDir === "desc" ? "▼" : "▲") : ""}
            </Button>
            <Button
              variant={sortKey === "outcome" ? "primary" : "secondary"}
              onClick={() => {
                if (sortKey === "outcome") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortKey("outcome"); setSortDir("desc"); }
              }}
            >
              Pronostici {sortKey === "outcome" ? (sortDir === "desc" ? "▼" : "▲") : ""}
            </Button>
            <Button
              variant={sortKey === "sumgoals" ? "primary" : "secondary"}
              onClick={() => {
                if (sortKey === "sumgoals") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortKey("sumgoals"); setSortDir("desc"); }
              }}
            >
              Somma gol {sortKey === "sumgoals" ? (sortDir === "desc" ? "▼" : "▲") : ""}
            </Button>
          </div>
        }
      />
      <CardContent>
        {loading ? null : (
          <div className="divide-y divide-slate-100">
            {rows.map((r, idx) => (
              <div key={r.userId} className="py-3">
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
