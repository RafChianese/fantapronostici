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

function InfoRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        {hint ? <div className="text-[11px] font-medium text-slate-400">{hint}</div> : null}
      </div>
      <div className="shrink-0 text-right text-base font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="text-lg font-extrabold text-slate-900">{title}</div>
      {subtitle ? <div className="text-sm font-semibold text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function BarChart({ data }: { data: Dist[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div className="w-14 text-xs font-semibold text-slate-600">{d.label}</div>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-800 transition-all"
                style={{ width: `${pct}%` }}
              />
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
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Performance partecipanti</div>
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-slate-900">Miglior attacco</div>
              <Badge className="bg-slate-100 text-slate-800">Totale punti</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {stats.bestAttack ? (
              <div className="space-y-2">
                <InfoRow
                  label="Partecipante"
                  value={stats.bestAttack.displayName}
                  hint="Chi ha totalizzato più punti complessivi"
                />
                <InfoRow label="Punti totali" value={`${stats.bestAttack.value}`} />
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
              <div className="space-y-2">
                <InfoRow
                  label="Partecipante"
                  value={stats.bestDefense.displayName}
                  hint="Chi ha indovinato più risultati esatti"
                />
                <InfoRow label="Risultati esatti" value={`${stats.bestDefense.value}`} />
              </div>
            ) : (
              <div className="text-sm text-slate-600">Dati non disponibili</div>
            )}
          </CardContent>
        </Card>

        <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Indicatori generali della lega</div>
        <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Analisi giornate</div>
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Media punti</div>
              <div className="text-xs font-semibold text-slate-500">
                Per utente / giornata (solo giornate concluse)
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-900">
                {Number(stats.avgPointsPerMatchday || 0).toFixed(1)}
                <span className="ml-1 text-sm font-bold text-slate-500">pt</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="pb-2">
              <div className="text-sm font-extrabold text-slate-900">Risultati esatti</div>
              <div className="text-xs font-semibold text-slate-500">
                Totale in lega (somma di tutti i partecipanti)
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-900">{stats.exactTotal}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Distribuzione punteggi per giornata</div>
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-sm font-extrabold text-slate-900">Distribuzione punteggi</div>
            <div className="text-xs font-semibold text-slate-500">
              Quante volte i partecipanti hanno fatto quel range di punti in una giornata
            </div>
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
                  <div className="text-xs font-semibold text-slate-500">
                    Giornata {stats.bestMatchday.matchday}
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">
                    {stats.bestMatchday.avgPoints.toFixed(1)}
                    <span className="ml-1 text-sm font-bold text-slate-500">pt</span>
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-400">
                    Media punti per utente (solo match finiti)
                  </div>
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
                  <div className="text-xs font-semibold text-slate-500">
                    Giornata {stats.worstMatchday.matchday}
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">
                    {stats.worstMatchday.avgPoints.toFixed(1)}
                    <span className="ml-1 text-sm font-bold text-slate-500">pt</span>
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-400">
                    Media punti per utente (solo match finiti)
                  </div>
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
      <SectionTitle
        title="Statistiche di lega"
        subtitle="Indicatori calcolati sui pronostici e sui risultati disponibili (solo giornate concluse per le medie)."
      />

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-3xl">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        cards
      ) : (
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-sm font-extrabold text-slate-900">Statistiche non disponibili</div>
            <div className="text-xs font-semibold text-slate-500">
              Verifica che la lega abbia pronostici e risultati registrati.
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">Riprova più tardi o cambia lega dal selettore.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
