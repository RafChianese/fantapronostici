import React, { useEffect, useMemo, useState } from "react";
import { api, LeagueStatsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";

function TeamLogo({ name, logo }: { name: string; logo?: string | null }) {
  if (logo) return <img src={logo} alt={name} className="h-6 w-6 rounded-full object-contain" />;
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-700">
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function TopList({ title, rows, metricLabel }: { title: string; rows: any[]; metricLabel: (r: any) => string }) {
  return (
    <Card className="border border-slate-100">
      <CardHeader title={title} subtitle="Top 3" />
      <CardContent className="space-y-2">
        {rows?.length ? (
          rows.map((r, idx) => (
            <div key={r.userId || idx} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  <span className="mr-2 text-slate-400">#{idx + 1}</span>
                  {r.displayName}
                </div>
              </div>
              <Badge tone="blue">{metricLabel(r)}</Badge>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-600">Nessun dato.</div>
        )}
      </CardContent>
    </Card>
  );
}

function MatchList({ title, rows, empty }: { title: string; rows: any[]; empty: string }) {
  return (
    <Card className="border border-slate-100">
      <CardHeader title={title} subtitle="Basato sulle partite finite con almeno 3 pronostici" />
      <CardContent className="space-y-3">
        {rows?.length ? (
          rows.map((m: any) => {
            const ko = m?.kickoffAt ? new Date(m.kickoffAt) : null;
            const when = ko
              ? `${ko.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })} · ${ko.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
              : "";
            const total = m?.totals?.total ?? 0;
            const outcomeRate = Math.round(((m?.rates?.outcome ?? 0) * 100));
            const exactRate = Math.round(((m?.rates?.exact ?? 0) * 100));

            return (
              <div key={m.matchId} className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-600">Giornata {m.matchday} · {when}</div>
                  <Badge>{total} pronostici</Badge>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo name={m.homeTeam} logo={m.homeLogo} />
                    <div className="truncate text-sm font-semibold text-slate-900">{m.homeTeam}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{m.result?.home}-{m.result?.away}</div>
                  <div className="flex items-center justify-end gap-2 min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{m.awayTeam}</div>
                    <TeamLogo name={m.awayTeam} logo={m.awayLogo} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={outcomeRate >= 60 ? "green" : outcomeRate >= 40 ? "amber" : "rose"}>1X2 corretti: {outcomeRate}%</Badge>
                  <Badge tone={exactRate >= 25 ? "green" : exactRate >= 15 ? "amber" : "gray"}>Esatti: {exactRate}%</Badge>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-sm text-slate-600">{empty}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [data, setData] = useState<LeagueStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = () => {
    setLoading(true);
    setError(null);
    show();
    api.leagueStats()
      .then((d) => setData(d))
      .catch((e: any) => setError(e?.message || "Errore nel caricamento delle statistiche"))
      .finally(() => {
        setLoading(false);
        hide();
      });
  };

  useEffect(() => {
    if (!activeLeagueId) {
      setLoading(false);
      setData(null);
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId]);

  const summary = data?.summary;

  const headline = useMemo(() => {
    if (!summary) return "";
    const next = summary.nextMatchday ? ` · Prossima: ${summary.nextMatchday}` : "";
    return `Giornata corrente: ${summary.currentMatchday}${next}`;
  }, [summary]);

  if (!activeLeagueId) {
    return (
      <Alert>
        Seleziona una lega per vedere le statistiche.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Statistiche" subtitle="Caricamento…" />
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Alert>Nessun dato.</Alert>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Statistiche lega"
          subtitle={`${data.league.name} · ${headline}`}
          right={<Button variant="secondary" onClick={refetch}>Aggiorna</Button>}
        />
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
              <div className="text-xs text-slate-500">Partecipanti</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.participants ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
              <div className="text-xs text-slate-500">Pronostici totali</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.predictions ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
              <div className="text-xs text-slate-500">Partite</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.matches ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
              <div className="text-xs text-slate-500">Giornate</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.matchdays ?? 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopList title="Top punti" rows={data.leaderboards.topTotal} metricLabel={(r) => `${r.totalPoints} pt`} />
        <TopList title="Top esatti" rows={data.leaderboards.topExact} metricLabel={(r) => `${r.exactHits} hit`} />
        <TopList title="Top 1X2" rows={data.leaderboards.topOutcome} metricLabel={(r) => `${r.outcomeHits} hit`} />
        <TopList title="Top somma gol" rows={data.leaderboards.topSumGoals} metricLabel={(r) => `${r.sumGoalsHits} hit`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MatchList title="Partite più difficili" rows={data.matches.hardest} empty="Non ci sono ancora abbastanza partite finite." />
        <MatchList title="Partite più facili" rows={data.matches.easiest} empty="Non ci sono ancora abbastanza partite finite." />
      </div>
    </div>
  );
}
