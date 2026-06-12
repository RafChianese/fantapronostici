import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronDown, ChevronUp, RotateCw, Trophy } from "lucide-react";
import { api, LiveMatch } from "../lib/api";
import { UserAvatar } from "../components/Avatar";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth";

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : String(value);
}

function fmtPoints(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  if (!src) {
    return (
      <div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/10 text-xs font-extrabold text-slate-200">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" className="h-9 w-9 rounded-full object-contain" />;
}

export default function LivePage() {
  const { activeLeagueId } = useAuth();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || matches[0] || null,
    [matches, selectedMatchId]
  );

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    api
      .live()
      .then((data) => {
        const live = Array.isArray(data?.matches) ? data.matches : [];
        setMatches(live);
        setSelectedMatchId((prev) => {
          if (prev && live.some((m) => m.id === prev)) return prev;
          return live[0]?.id ?? null;
        });
      })
      .catch((e: any) => {
        setMatches([]);
        setSelectedMatchId(null);
        setError(e?.message || "Errore nel caricamento del live");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load(false);
    const id = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(id);
  }, [activeLeagueId]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="tm-glass overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-100">
                <Activity size={14} /> Live
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-100">Partite in corso</h1>
              <p className="mt-1 text-sm text-slate-300">
                Apri un match per vedere i pronostici dei partecipanti e chi sta prendendo il risultato esatto live.
              </p>
            </div>
            <Button variant="secondary" onClick={() => load(false)} disabled={refreshing}>
              <span className="inline-flex items-center gap-2">
                <RotateCw size={16} className={refreshing ? "animate-spin" : ""} /> Aggiorna
              </span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <Card>
          <CardHeader title="Live non disponibile" subtitle={error} />
          <CardContent>
            <Button onClick={() => load(false)}>Riprova</Button>
          </CardContent>
        </Card>
      ) : matches.length === 0 ? (
        <Card>
          <CardHeader title="Nessuna partita live" subtitle="Al momento non ci sono match in corso." />
          <CardContent>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Quando una partita sarà in corso, qui vedrai la card del match e la lista dei pronostici dei partecipanti.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {matches.map((match) => {
              const selected = selectedMatch?.id === match.id;
              return (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setSelectedMatchId(match.id)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    selected
                      ? "border-rose-300/40 bg-rose-500/10 shadow-[0_20px_50px_rgba(244,63,94,0.12)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge>Giornata {match.matchday}</Badge>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-200">
                      LIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.homeLogo} name={match.homeTeam} /></div>
                      <div className="truncate text-sm font-bold text-slate-100">{match.homeTeam}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xl font-black text-slate-100">
                      {fmtScore(match.homeScore)} - {fmtScore(match.awayScore)}
                    </div>
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.awayLogo} name={match.awayTeam} /></div>
                      <div className="truncate text-sm font-bold text-slate-100">{match.awayTeam}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                    <span>{match.exactLiveCount} esatti live</span>
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      Dettaglio {selected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedMatch ? (
            <Card>
              <CardHeader
                title={`${selectedMatch.homeTeam} - ${selectedMatch.awayTeam}`}
                subtitle={`Risultato live ${fmtScore(selectedMatch.homeScore)}-${fmtScore(selectedMatch.awayScore)} · ${selectedMatch.participants.length} partecipanti`}
              />
              <CardContent>
                <div className="space-y-2">
                  {selectedMatch.participants.map((p) => {
                    const pred = p.prediction ? `${p.prediction.homeGoals}-${p.prediction.awayGoals}` : "—";
                    return (
                      <div
                        key={p.userId}
                        className={`rounded-3xl border p-3 transition ${
                          p.isExactLive
                            ? "border-yellow-200/40 bg-yellow-300/15 shadow-[0_0_35px_rgba(250,204,21,0.18)] backdrop-blur-xl"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar avatarId={p.avatarId || null} mode="full" size={42} />
                            <div className="min-w-0">
                              <div className={`truncate text-sm font-extrabold ${p.isExactLive ? "text-yellow-50" : "text-slate-100"}`}>
                                {p.displayName}
                              </div>
                              <div className="text-xs text-slate-400">Pronostico: <b className="text-slate-200">{pred}</b></div>
                            </div>
                          </div>

                          <div className="text-right">
                            {p.isExactLive ? (
                              <div className="inline-flex items-center gap-1 rounded-full border border-yellow-200/40 bg-yellow-300/20 px-2.5 py-1 text-xs font-black text-yellow-50">
                                <Trophy size={14} /> Esatto live
                              </div>
                            ) : null}
                            <div className={`mt-1 text-lg font-black ${p.isExactLive ? "text-yellow-50" : "text-slate-100"}`}>
                              +{fmtPoints(p.livePoints)} pt
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <div className="pb-2 text-center text-xs text-slate-500">
        I punteggi live sono simulati sul risultato attuale e possono cambiare fino al termine della partita.
      </div>
    </div>
  );
}
