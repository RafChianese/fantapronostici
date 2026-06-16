import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RotateCw, Trophy } from "lucide-react";
import { api, CalendarMatch } from "../lib/api";
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

function fmtDate(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "Data da definire";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  if (!src) {
    return (
      <div className="grid h-9 w-9 place-items-center rounded-full border border-emerald-100/15 bg-emerald-100/10 text-xs font-extrabold text-emerald-50/85">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" className="h-9 w-9 rounded-full object-contain" />;
}

function StatusBadge({ status }: { status: CalendarMatch["status"] }) {
  if (status === "IN_PROGRESS") {
    return <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-200">Live</span>;
  }
  if (status === "FINISHED") {
    return <span className="rounded-full border border-slate-300/20 bg-slate-400/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-50/85">Terminata</span>;
  }
  return <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-sky-200">Prossima</span>;
}

function FilterTabs({ filter, setFilter }: { filter: "NEXT" | "ALL" | "LIVE" | "FINISHED"; setFilter: (f: "NEXT" | "ALL" | "LIVE" | "FINISHED") => void }) {
  const items: Array<{ key: "NEXT" | "ALL" | "LIVE" | "FINISHED"; label: string }> = [
    { key: "NEXT", label: "Prossime" },
    { key: "LIVE", label: "Live" },
    { key: "FINISHED", label: "Terminate" },
    { key: "ALL", label: "Tutte" },
  ];
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-emerald-100/15 bg-emerald-100/5 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => setFilter(it.key)}
          className={`rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:text-sm ${filter === it.key ? "bg-rose-600 text-white shadow-lg" : "text-emerald-50/70 hover:bg-emerald-100/5"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const { activeLeagueId } = useAuth();
  const [matches, setMatches] = useState<CalendarMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"NEXT" | "ALL" | "LIVE" | "FINISHED">("NEXT");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    api
      .calendar()
      .then((data) => {
        const rows = Array.isArray(data?.matches) ? data.matches : [];
        setMatches(rows);
        setSelectedMatchId((prev) => {
          if (prev && rows.some((m) => m.id === prev)) return prev;
          const firstLive = rows.find((m) => m.status === "IN_PROGRESS");
          const firstNext = rows.find((m) => m.status === "NOT_STARTED");
          return firstLive?.id ?? firstNext?.id ?? rows[0]?.id ?? null;
        });
      })
      .catch((e: any) => {
        setMatches([]);
        setSelectedMatchId(null);
        setError(e?.message || "Errore nel caricamento del calendario");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load(false);
  }, [activeLeagueId]);

  const visibleMatches = useMemo(() => {
    if (filter === "ALL") return matches;
    if (filter === "LIVE") return matches.filter((m) => m.status === "IN_PROGRESS");
    if (filter === "FINISHED") return matches.filter((m) => m.status === "FINISHED").slice(-12).reverse();
    return matches.filter((m) => m.status !== "FINISHED").slice(0, 5);
  }, [matches, filter]);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || visibleMatches[0] || null,
    [matches, selectedMatchId, visibleMatches]
  );

  return (
    <div className="tm-page-narrow">
      <div className="flex items-center justify-between gap-3">
        <FilterTabs filter={filter} setFilter={setFilter} />
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
          <CardHeader title="Calendario non disponibile" subtitle={error} />
          <CardContent>
            <Button onClick={() => load(false)}>Riprova</Button>
          </CardContent>
        </Card>
      ) : visibleMatches.length === 0 ? (
        <Card>
          <CardHeader title="Nessuna partita" subtitle="Non ci sono match per il filtro selezionato." />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleMatches.map((match) => {
              const selected = selectedMatch?.id === match.id;
              return (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setSelectedMatchId(match.id)}
                  className={`tm-match-card ${selected ? "tm-match-card-selected" : match.status === "IN_PROGRESS" ? "tm-match-card-live" : match.status === "FINISHED" ? "tm-match-card-finished" : "tm-match-card-next"}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge>Giornata {match.matchday}</Badge>
                    <StatusBadge status={match.status} />
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.homeLogo} name={match.homeTeam} /></div>
                      <div className="truncate text-sm font-bold text-white">{match.homeTeam}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-100/15 bg-slate-950/50 px-3 py-2 text-xl font-black text-white">
                      {fmtScore(match.homeScore)} - {fmtScore(match.awayScore)}
                    </div>
                    <div className="min-w-0 text-center">
                      <div className="mx-auto mb-2 flex justify-center"><TeamLogo src={match.awayLogo} name={match.awayTeam} /></div>
                      <div className="truncate text-sm font-bold text-white">{match.awayTeam}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-emerald-50/70">
                    <span>{fmtDate(match.kickoffAt)}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-100/60">
                      Pronostici {selected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
                subtitle={`${fmtDate(selectedMatch.kickoffAt)} · ${selectedMatch.participants.length} partecipanti`}
                right={<StatusBadge status={selectedMatch.status} />}
              />
              <CardContent>
                <div className="space-y-2">
                  {selectedMatch.participants.map((p) => {
                    const pred = p.prediction ? `${p.prediction.homeGoals}-${p.prediction.awayGoals}` : "—";
                    const isGold = selectedMatch.status === "IN_PROGRESS" && p.isExactLive;
                    return (
                      <div
                        key={p.userId}
                        className={`rounded-3xl border p-3 transition ${
                          isGold ? "border-yellow-200/40 bg-yellow-300/15 shadow-[0_0_35px_rgba(250,204,21,0.18)] backdrop-blur-xl" : "border-emerald-100/15 bg-emerald-100/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar avatarId={p.avatarId || null} mode="full" size={42} />
                            <div className="min-w-0">
                              <div className={`truncate text-sm font-extrabold ${isGold ? "text-yellow-50" : "text-white"}`}>{p.displayName}</div>
                              <div className="text-xs text-emerald-100/60">Pronostico: <b className="text-emerald-50/85">{pred}</b></div>
                            </div>
                          </div>
                          <div className="text-right">
                            {isGold ? (
                              <div className="inline-flex items-center gap-1 rounded-full border border-yellow-200/40 bg-yellow-300/20 px-2.5 py-1 text-xs font-black text-yellow-50">
                                <Trophy size={14} /> Esatto live
                              </div>
                            ) : null}
                            {selectedMatch.status !== "NOT_STARTED" ? (
                              <div className={`mt-1 text-lg font-black ${isGold ? "text-yellow-50" : "text-white"}`}>+{fmtPoints(p.points)} pt</div>
                            ) : null}
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
    </div>
  );
}
