import React, { useEffect, useMemo, useState } from "react";
import { api, LeagueStatsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { Trophy, Target, CheckCircle2, Sigma, TrendingUp, BarChart3 } from "lucide-react";

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function LeaderTile({ icon, title, name, value }: { icon: React.ReactNode; title: string; name: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        {icon}
        {title}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate text-base font-extrabold text-slate-100">{name}</div>
        <div className="shrink-0 rounded-xl bg-white/5 px-2 py-1 text-sm font-extrabold text-slate-100 ring-1 ring-slate-800">{value}</div>
      </div>
    </div>
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
    api
      .leagueStats()
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

  const headline = useMemo(() => {
    if (!data) return "";
    const best = data.bestMatchday ? ` · Migliore: ${data.bestMatchday.matchday}` : "";
    const worst = data.worstMatchday ? ` · Peggiore: ${data.worstMatchday.matchday}` : "";
    return `Media punti/giornata: ${data.avgPointsPerMatchday.toFixed(2)}${best}${worst}`;
  }, [data]);

  if (!activeLeagueId) {
    return <Alert>Seleziona una lega per vedere le statistiche.</Alert>;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Statistiche lega" subtitle="Caricamento…" />
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

  const topTotal = data.topTotalPoints ?? data.bestAttack;
  const topExact = data.topExactHits ?? data.bestDefense;
  const topOutcome = data.topOutcomeHits ?? null;
  const topSumGoals = data.topSumGoalsHits ?? null;
  const topUnderOver = data.topUnderOverHits ?? null;
  const underOverOn = Boolean((data as any)?.features?.underOver25);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-white/10 shadow-sm">
        <div
          className="text-white"
          style={{
            backgroundImage:
              "radial-gradient(1200px 520px at 50% -10%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(900px 420px at 15% 35%, rgba(46,196,182,0.16), transparent 60%), radial-gradient(900px 420px at 85% 35%, rgba(239,68,68,0.16), transparent 60%), linear-gradient(180deg, #020617 0%, #0b1220 45%, #020617 100%)",
          }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Statistiche
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight">Statistiche lega</div>
                <div className="mt-1 text-sm text-slate-300">{headline}</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-rose-400/50 bg-black/40 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-black/55"
                onClick={refetch}
              >
                Aggiorna
              </button>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Statistiche lega"
          subtitle={headline}
          right={
            <Button variant="secondary" onClick={refetch}>
              Aggiorna
            </Button>
          }
        />
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {topTotal ? (
              <LeaderTile icon={<Trophy size={16} aria-hidden="true" />} title="Più punti" name={topTotal.displayName} value={topTotal.value} />
            ) : (
              <LeaderTile icon={<Trophy size={16} aria-hidden="true" />} title="Più punti" name="—" value={0} />
            )}
            {topExact ? (
              <LeaderTile icon={<Target size={16} aria-hidden="true" />} title="Più esatti" name={topExact.displayName} value={topExact.value} />
            ) : (
              <LeaderTile icon={<Target size={16} aria-hidden="true" />} title="Più esatti" name="—" value={0} />
            )}
            {topOutcome ? (
              <LeaderTile icon={<CheckCircle2 size={16} aria-hidden="true" />} title="Più 1X2" name={topOutcome.displayName} value={topOutcome.value} />
            ) : (
              <LeaderTile icon={<CheckCircle2 size={16} aria-hidden="true" />} title="Più 1X2" name="—" value={0} />
            )}
            {topSumGoals ? (
              <LeaderTile icon={<Sigma size={16} aria-hidden="true" />} title="Più somma gol" name={topSumGoals.displayName} value={topSumGoals.value} />
            ) : (
              <LeaderTile icon={<Sigma size={16} aria-hidden="true" />} title="Più somma gol" name="—" value={0} />
            )}
            {underOverOn ? (
              topUnderOver ? (
                <LeaderTile icon={<TrendingUp size={16} aria-hidden="true" />} title="Più U/O 2.5" name={topUnderOver.displayName} value={topUnderOver.value} />
              ) : (
                <LeaderTile icon={<TrendingUp size={16} aria-hidden="true" />} title="Più U/O 2.5" name="—" value={0} />
              )
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatTile label="Media punti per giornata" value={data.avgPointsPerMatchday.toFixed(2)} />
            <StatTile label="Esatti totali (lega)" value={data.exactTotal} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {data.bestMatchday ? (
              <Badge tone="green">Migliore giornata: {data.bestMatchday.matchday} · {data.bestMatchday.avgPoints.toFixed(2)} pt medi</Badge>
            ) : (
              <Badge>Migliore giornata: —</Badge>
            )}
            {data.worstMatchday ? (
              <Badge tone="rose">Peggiore giornata: {data.worstMatchday.matchday} · {data.worstMatchday.avgPoints.toFixed(2)} pt medi</Badge>
            ) : (
              <Badge>Peggiore giornata: —</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Distribuzione"
          subtitle="Quanti utenti rientrano in ciascuna fascia punti (per giornata)"
          right={<BarChart3 size={18} className="text-slate-400" aria-hidden="true" />}
        />
        <CardContent>
          {data.distribution?.length ? (
            <div className="space-y-2">
              {data.distribution.map((b) => (
                <div key={b.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                  <div className="text-sm font-semibold text-slate-100">{b.label}</div>
                  <Badge>{b.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-300">Nessun dato.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
