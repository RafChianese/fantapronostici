import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, Skeleton, Badge } from "../components/ui";

type Dist = { label: string; count: number };
type Stats = {
  bestAttack: null | { userId: string; displayName: string; value: number };
  bestDefense: null | { userId: string; displayName: string; value: number };
  avgPointsPerMatchday: number;
  exactTotal: number;
  distribution: Dist[];
  bestMatchday: null | { matchday: number; avgPoints: number };
  worstMatchday: null | { matchday: number; avgPoints: number };
};

function BarChart({ data }: { data: Dist[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div className="w-12 text-xs font-semibold text-slate-600">{d.label}</div>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-10 text-right text-xs font-bold text-slate-800">{d.count}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function LeagueStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .leagueStats()
      .then((r: any) => {
        if (cancelled) return;
        setStats(r as Stats);
      })
      .catch(() => {
        if (cancelled) return;
        setStats(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    if (!stats) return null;
    return (
      <div className="grid gap-3">
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-slate-900">Miglior attacco</div>
              <Badge className="bg-slate-100 text-slate-800">Totale punti</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {stats.bestAttack ? (
              <div className="flex items-baseline justify-between">
                <div className="text-base font-bold text-slate-900">{stats.bestAttack.displayName}</div>
                <div className="text-xl font-extrabold text-slate-900">{stats.bestAttack.value}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">Dati non disponibili</div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-slate-900">Miglior difesa</div>
              <Badge className="bg-slate-100 text-slate-800">Risultati esatti</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {stats.bestDefense ? (
              <div className="flex items-baseline justify-between">
                <div className="text-base font-bold text-slate-900">{stats.bestDefense.displayName}</div>
                <div className="text-xl font-extrabold text-slate-900">{stats.bestDefense.value}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">Dati non disponibili</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Media punti</div>
              <div className="text-xs font-semibold text-slate-500">per giornata</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-900">{stats.avgPointsPerMatchday.toFixed(1)}</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Esatti totali</div>
              <div className="text-xs font-semibold text-slate-500">in lega</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-900">{stats.exactTotal}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-sm font-extrabold text-slate-900">Distribuzione punteggi</div>
            <div className="text-xs font-semibold text-slate-500">punteggio per utente/giornata</div>
          </CardHeader>
          <CardContent>
            <BarChart data={stats.distribution || []} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Miglior giornata</div>
            </CardHeader>
            <CardContent>
              {stats.bestMatchday ? (
                <div>
                  <div className="text-xs font-semibold text-slate-500">Matchday {stats.bestMatchday.matchday}</div>
                  <div className="text-2xl font-extrabold text-slate-900">{stats.bestMatchday.avgPoints.toFixed(1)}</div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">—</div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Peggior giornata</div>
            </CardHeader>
            <CardContent>
              {stats.worstMatchday ? (
                <div>
                  <div className="text-xs font-semibold text-slate-500">Matchday {stats.worstMatchday.matchday}</div>
                  <div className="text-2xl font-extrabold text-slate-900">{stats.worstMatchday.avgPoints.toFixed(1)}</div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">—</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }, [stats]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <div className="mb-3">
        <div className="text-lg font-extrabold text-slate-900">Statistiche di lega</div>
        <div className="text-sm font-semibold text-slate-500">Panoramica rapida</div>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-3xl">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-36 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-24 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        cards
      ) : (
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-sm font-extrabold text-slate-900">Nessun dato</div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">Non ci sono ancora abbastanza pronostici per calcolare le statistiche.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
