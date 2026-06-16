import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RotateCw, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import { api, LiveLeaderboardRow, LiveMatch } from "../lib/api";
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
      <div className="grid h-9 w-9 place-items-center rounded-full border border-amber-100/15 bg-white/[0.075] text-xs font-extrabold text-orange-50/85">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" className="h-9 w-9 rounded-full object-contain" />;
}

function LiveTabs({ tab, setTab }: { tab: "MATCHES" | "LEADERBOARD"; setTab: (tab: "MATCHES" | "LEADERBOARD") => void }) {
  return (
    <div className="grid w-full grid-cols-2 overflow-hidden rounded-2xl border border-amber-100/15 bg-white/[0.055] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setTab("MATCHES")}
        className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${tab === "MATCHES" ? "bg-rose-600 text-white shadow-lg" : "text-orange-50/70 hover:bg-white/[0.055]"}`}
      >
        Match live
      </button>
      <button
        type="button"
        onClick={() => setTab("LEADERBOARD")}
        className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${tab === "LEADERBOARD" ? "bg-rose-600 text-white shadow-lg" : "text-orange-50/70 hover:bg-white/[0.055]"}`}
      >
        Classifica live
      </button>
    </div>
  );
}

function RankDelta({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-xs font-black text-amber-200">
        <TrendingUp size={13} /> +{value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/20 bg-rose-400/10 px-2 py-0.5 text-xs font-black text-rose-200">
        <TrendingDown size={13} /> {value}
      </span>
    );
  }
  return <span className="rounded-full border border-amber-100/15 bg-white/[0.055] px-2 py-0.5 text-xs font-bold text-orange-50/60">=</span>;
}

export default function LivePage() {
  const { activeLeagueId } = useAuth();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboardRow[]>([]);
  const [prizeCount, setPrizeCount] = useState(3);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [tab, setTab] = useState<"MATCHES" | "LEADERBOARD">("MATCHES");
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
        setLeaderboard(Array.isArray(data?.liveLeaderboard) ? data.liveLeaderboard : []);
        setPrizeCount(Number(data?.prizeCount || 0) > 0 ? Number(data.prizeCount) : 3);
        setSelectedMatchId((prev) => {
          if (prev && live.some((m) => m.id === prev)) return prev;
          return live[0]?.id ?? null;
        });
      })
      .catch((e: any) => {
        setMatches([]);
        setLeaderboard([]);
        setPrizeCount(3);
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
    <div className="tm-page-narrow">
      <div className="flex items-center justify-between gap-3">
        <LiveTabs tab={tab} setTab={setTab} />
        <Button variant="secondary" onClick={() => load(false)} disabled={refreshing} className="shrink-0 !px-3">
          <span className="inline-flex items-center gap-2">
            <RotateCw size={16} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Aggiorna</span>
          </span>
        </Button>
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
      ) : tab === "LEADERBOARD" ? (
        leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-amber-100/15 bg-white/[0.055] p-4 text-sm text-orange-50/70">
            Classifica live non disponibile. Appena ci saranno dati live, comparirà qui.
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row) => {
              const isMoving = Number(row.rankDelta || 0) !== 0;
              const isPrizePosition = row.liveRank <= prizeCount;
              const medal = isPrizePosition ? (row.liveRank === 1 ? "🥇" : row.liveRank === 2 ? "🥈" : row.liveRank === 3 ? "🥉" : "🏅") : null;
              return (
                <div
                  key={row.userId}
                  className={`rounded-3xl border p-3 transition ${
                    isPrizePosition
                      ? "border-yellow-200/30 bg-yellow-300/10 shadow-[0_0_35px_rgba(250,204,21,0.10)]"
                      : isMoving
                      ? "border-sky-300/20 bg-sky-400/10"
                      : "border-amber-100/15 bg-white/[0.055]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl border text-sm font-black ${isPrizePosition ? "border-yellow-200/30 bg-yellow-300/10 text-yellow-50" : "border-amber-100/15 bg-[#07150f]/80 text-white"}`}>
                        {medal || row.liveRank}
                      </div>
                      <UserAvatar avatarId={row.avatarId || null} mode="full" size={42} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-white">{row.displayName}</div>
                        <div className="mt-0.5 text-xs text-orange-50/70">
                          Ufficiale: <b className="text-white">{fmtPoints(row.officialPoints)}</b>
                          {" · "}
                          Live: <b className={Number(row.liveDelta) >= 0 ? "text-amber-200" : "text-rose-200"}>{Number(row.liveDelta) >= 0 ? "+" : ""}{fmtPoints(row.liveDelta)}</b>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xl font-black text-white">{fmtPoints(row.liveTotalPoints)}</div>
                      <div className="mt-1 flex justify-end"><RankDelta value={Number(row.rankDelta || 0)} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : matches.length === 0 ? (
        <Card>
          <CardHeader title="Nessuna partita live" subtitle="Al momento non ci sono match in corso." />
          <CardContent>
            <div className="rounded-2xl border border-amber-100/15 bg-white/[0.055] p-4 text-sm text-orange-50/70">
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
                  className={`tm-match-card ${selected ? "tm-match-card-selected" : "tm-match-card-live"}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge>Giornata {match.matchday}</Badge>
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-200">
                      LIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.homeLogo} name={match.homeTeam} /></div>
                      <div className="truncate text-sm font-bold text-white">{match.homeTeam}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-100/15 bg-slate-950/50 px-3 py-2 text-xl font-black text-white">
                      {fmtScore(match.homeScore)} - {fmtScore(match.awayScore)}
                    </div>
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.awayLogo} name={match.awayTeam} /></div>
                      <div className="truncate text-sm font-bold text-white">{match.awayTeam}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-orange-50/70">
                    <span>{match.exactLiveCount} esatti live</span>
                    <span className="inline-flex items-center gap-1 text-orange-50/60">
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
                            : "border-amber-100/15 bg-white/[0.055]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar avatarId={p.avatarId || null} mode="full" size={42} />
                            <div className="min-w-0">
                              <div className={`truncate text-sm font-extrabold ${p.isExactLive ? "text-yellow-50" : "text-white"}`}>
                                {p.displayName}
                              </div>
                              <div className="text-xs text-orange-50/60">Pronostico: <b className="text-orange-50/85">{pred}</b></div>
                            </div>
                          </div>

                          <div className="text-right">
                            {p.isExactLive ? (
                              <div className="inline-flex items-center gap-1 rounded-full border border-yellow-200/40 bg-yellow-300/20 px-2.5 py-1 text-xs font-black text-yellow-50">
                                <Trophy size={14} /> Esatto live
                              </div>
                            ) : null}
                            <div className={`mt-1 text-lg font-black ${p.isExactLive ? "text-yellow-50" : "text-white"}`}>
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

      <div className="pb-2 text-center text-xs text-orange-50/60">
        I punteggi live sono simulati sul risultato attuale e possono cambiare fino al termine della partita.
      </div>
    </div>
  );
}
