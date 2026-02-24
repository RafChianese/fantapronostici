import React, { useEffect, useMemo, useState } from "react";
import { api, LeagueStatsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/70 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
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

  const bestAttack = data.bestAttack;
  const bestDefense = data.bestDefense;

  return (
    <div className="space-y-6">
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
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Miglior attacco" value={bestAttack ? bestAttack.displayName : "—"} />
            <StatTile label="Punti miglior attacco" value={bestAttack ? bestAttack.value : 0} />
            <StatTile label="Miglior difesa" value={bestDefense ? bestDefense.displayName : "—"} />
            <StatTile label="Esatti miglior difesa" value={bestDefense ? bestDefense.value : 0} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
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

      <Card className="border border-slate-100">
        <CardHeader title="Distribuzione punti" subtitle="Totale punti per utente per giornata (campione su giornate considerate)" />
        <CardContent>
          {data.distribution?.length ? (
            <div className="space-y-2">
              {data.distribution.map((b) => (
                <div key={b.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
                  <div className="text-sm font-semibold text-slate-900">{b.label}</div>
                  <Badge>{b.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600">Nessun dato.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
