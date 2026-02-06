import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { Countdown } from "../components/Countdown";

type Match = {
  id: string;
  group: string;
  matchday: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
};

type PredictionState = {
  id?: string;
  matchId: string;
  // During editing, goals may be undefined (user hasn't entered anything yet).
  homeGoals?: number;
  awayGoals?: number;
  // Scoring breakdown returned by API (may be missing until computed)
  pointsExact?: number;
  pointsOutcome?: number;
  pointsSumGoals?: number;
  pointsUnderOver?: number;
  totalPoints?: number;
};

function statusBadge(s: Match["status"]) {
  if (s === "FINISHED") return <Badge tone="green">FINITA</Badge>;
  if (s === "IN_PROGRESS") return <Badge tone="blue">IN CORSO</Badge>;
  return <Badge>NON INIZIATA</Badge>;
}

function buildBreakdown(p: PredictionState, underOverEnabled: boolean) {
  const parts: string[] = [];
  if ((p.pointsExact ?? 0) > 0) parts.push(`Esatto ${p.pointsExact}`);
  if ((p.pointsOutcome ?? 0) > 0) parts.push(`1X2 ${p.pointsOutcome}`);
  if ((p.pointsSumGoals ?? 0) > 0) parts.push(`Somma ${p.pointsSumGoals}`);
  if (underOverEnabled && (p.pointsUnderOver ?? 0) > 0) parts.push(`2.5 ${(p.pointsUnderOver ?? 0)}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function DashboardPage() {
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [matches, setMatches] = useState<Match[]>([]);
  const [preds, setPreds] = useState<Record<string, PredictionState>>({});
  const [config, setConfig] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);

  const isLocked = !!config?.lock?.isLocked;

  const matchById = useMemo(() => {
    const m = new Map<string, Match>();
    for (const it of matches) m.set(it.id, it);
    return m;
  }, [matches]);

  const isMatchLocked = (m: Match | undefined) => {
    if (!m) return true;
    // A match is "locked" for editing if the league window is locked OR the match already started.
    return isLocked || m.status !== "NOT_STARTED";
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        show();
        setLoading(true);
        const [m, p, c] = await Promise.all([api.matches(), api.myPredictions(), api.publicConfig()]);
        if (cancelled) return;
        setMatches(m.matches);
        const map: Record<string, PredictionState> = {};
        for (const pr of (p.predictions as PredictionState[])) map[pr.matchId] = pr;
        setPreds(map);
        setConfig(c);
      } catch (e: any) {
        setToast({ tone: "danger", msg: e.message });
      } finally {
        if (!cancelled) setLoading(false);
        hide();
      }
    })();
    return () => { cancelled = true; };
  }, [activeLeagueId]);

  const hasAnyPrediction = useMemo(() => {
    // A prediction is considered "present" only if the user has set BOTH scores for at least one match.
    return Object.values(preds).some((p) => Number.isInteger(p.homeGoals) && Number.isInteger(p.awayGoals));
  }, [preds]);

  const hasLockedPrediction = useMemo(() => {
    // Defensive: if someone re-enables inputs via devtools, block saving if any entered prediction belongs to a locked match.
    for (const [matchId, p] of Object.entries(preds)) {
      if (!Number.isInteger(p.homeGoals) || !Number.isInteger(p.awayGoals)) continue;
      if (isMatchLocked(matchById.get(matchId))) return true;
    }
    return false;
  }, [preds, matchById, isLocked]);

  const byMatchday = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const md = Number(m.matchday || 1);
      if (!map.has(md)) map.set(md, []);
      map.get(md)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [matches]);

  useEffect(() => {
    // Default behavior: if a matchday is fully finished, show it collapsed (accordion style).
    // Keep user toggles stable across refreshes of the same data.
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const [md, ms] of byMatchday) {
        if (typeof next[md] === "boolean") continue;
        const allFinished = ms.length > 0 && ms.every((x) => x.status === "FINISHED");
        next[md] = allFinished;
      }
      return next;
    });
  }, [byMatchday]);

  const dirtyCount = useMemo(() => 0, [preds]); // simple UI: we always allow saving

  const hasAutoScrolledRef = React.useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasAutoScrolledRef.current) return;
    if (!byMatchday.length) return;

    const target = byMatchday.find(([, ms]) => !(ms.length > 0 && ms.every((x) => x.status === "FINISHED"))) || byMatchday[0];
    const matchday = target?.[0];
    if (!matchday) return;

    hasAutoScrolledRef.current = true;
    // Allow the DOM to paint before attempting to scroll.
    setTimeout(() => {
      const el = document.getElementById(`matchday-${matchday}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [loading, byMatchday]);

  if (loading) return null;


  if (!config || !config.lock) {
    return (
      <div className="space-y-4">
        {toast ? <Alert tone={toast.tone}>{toast.msg}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <Alert tone={toast.tone}>{toast.msg}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="I miei pronostici"
          subtitle="Inserisci un pronostico (risultato esatto). Puoi modificare finché la finestra è aperta."
          right={
            config?.lock ? (
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border px-3 py-2 ${isLocked ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <Countdown
                    lockUntilIso={config?.lock?.lockUntil ? new Date(config?.lock?.lockUntil).toISOString() : new Date().toISOString()}
                    nowIso={new Date().toISOString()}
                    labelOpen="Modifiche aperte (chiusura tra)"
                    labelClosed="Pronostici bloccati"
                  />
                </div>
              </div>
            ) : null
          }
        />
        <CardContent>
          {isLocked ? (
            <Alert tone="danger">
              Pronostici bloccati. Se necessario l'admin può sbloccare o aggiornare la data di lock.
            </Alert>
          ) : (
            <div className="text-sm text-slate-600">
              Modifiche aperte fino a: <span className="font-medium">{config?.lock?.lockUntil ? new Date(config?.lock?.lockUntil).toLocaleString() : "—"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {byMatchday.map(([matchday, ms]) => {
        const allFinished = ms.length > 0 && ms.every((x) => x.status === "FINISHED");
        const anyInProgress = ms.some((x) => x.status === "IN_PROGRESS");
        const allNotStarted = ms.length > 0 && ms.every((x) => x.status === "NOT_STARTED");
        const matchdayStatus: Match["status"] = allFinished ? "FINISHED" : anyInProgress ? "IN_PROGRESS" : allNotStarted ? "NOT_STARTED" : "IN_PROGRESS";

        const isCollapsed = (collapsed[matchday] ?? allFinished) === true;

        const statusPill =
          matchdayStatus === "FINISHED" ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Terminata
            </span>
          ) : matchdayStatus === "IN_PROGRESS" ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
              In corso
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Non iniziata
            </span>
          );

        const cardClass =
          matchdayStatus === "FINISHED"
            ? "bg-emerald-50 border-emerald-200"
            : matchdayStatus === "IN_PROGRESS"
            ? "bg-sky-50 border-sky-200"
            : "bg-amber-50 border-amber-200";

        return (
          <div key={matchday} id={`matchday-${matchday}`}>
            <Card className={cardClass}>
            <CardHeader
              title={`Giornata ${matchday}`}
              subtitle={`${ms.length} partite`}
              right={
                <div className="flex items-center gap-2">
                  {statusPill}
                  <Button
                    variant="ghost"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [matchday]: !isCollapsed }))}
                  >
                    {isCollapsed ? "Espandi" : "Comprimi"}
                  </Button>
                </div>
              }
            />
            {isCollapsed ? (
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {matchdayStatus === "FINISHED" ? (
                      <span className="text-emerald-800 font-semibold text-base">Tutte le partite sono terminate.</span>
                    ) : matchdayStatus === "IN_PROGRESS" ? (
                      <span className="text-sky-800 font-semibold text-base">Partite in corso.</span>
                    ) : (
                      <span className="text-amber-800 font-semibold text-base">Partite non ancora iniziate.</span>
                    )}
                  </div>
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-3">
                {ms.map((m) => {
              const p = preds[m.id];
              const canEdit = !isLocked && m.status === "NOT_STARTED";
              const real = m.homeScore !== null && m.awayScore !== null ? `${m.homeScore}-${m.awayScore}` : "—";
              return (
                <div key={m.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">{statusBadge(m.status)}</div>
                      <div className="text-base font-semibold">
                        {m.homeTeam} <span className="text-slate-400">vs</span> {m.awayTeam}
                      </div>
                      <div className="text-xs text-slate-500">{new Date(m.kickoffAt).toLocaleString()}</div>
                      <div className="text-sm text-slate-600">
                        Risultato reale: <span className="font-medium">{real}</span>
                        {m.status === "FINISHED" && p ? (
                          <span className="ml-3 text-slate-500">
                            Punti: <span className="font-semibold">{p.totalPoints}</span>{" "}
                            <span className="text-xs">({buildBreakdown(p, !!config?.features?.underOver25)})</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <Input
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={p?.homeGoals === undefined ? "" : String(p.homeGoals)}
                          placeholder="0"
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "");
                            setPreds((prev) => {
                              const existing = prev[m.id] ?? { matchId: m.id };
                              const next = { ...existing, homeGoals: v === "" ? undefined : Number(v) };
                              if (next.homeGoals === undefined && next.awayGoals === undefined) {
                                const { [m.id]: _removed, ...rest } = prev;
                                return rest;
                              }
                              return { ...prev, [m.id]: next };
                            });
                          }}
                        />
                      </div>
                      <div className="text-sm text-slate-500">-</div>
                      <div className="w-20">
                        <Input
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={p?.awayGoals === undefined ? "" : String(p.awayGoals)}
                          placeholder="0"
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "");
                            setPreds((prev) => {
                              const existing = prev[m.id] ?? { matchId: m.id };
                              const next = { ...existing, awayGoals: v === "" ? undefined : Number(v) };
                              if (next.homeGoals === undefined && next.awayGoals === undefined) {
                                const { [m.id]: _removed, ...rest } = prev;
                                return rest;
                              }
                              return { ...prev, [m.id]: next };
                            });
                          }}
                        />
                      </div>
                      {!canEdit ? <Badge tone="gray">Lock</Badge> : null}
                    </div>
                  </div>
                </div>
              );
                })}
              </CardContent>
            )}
            </Card>
          </div>
        );
      })}

      {hasLockedPrediction && !isLocked ? (
        <Alert tone="danger">
          Hai inserito almeno un pronostico su una partita bloccata (già iniziata/terminata). Rimuovi quei valori per poter salvare.
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={async () => {
            setSaving(true);
            setToast(null);
            try {
              const items = Object.entries(preds)
                .filter(([, p]) => Number.isInteger(p.homeGoals) && Number.isInteger(p.awayGoals))
                .map(([matchId, p]) => ({
                  matchId,
                  homeGoals: p.homeGoals as number,
                  awayGoals: p.awayGoals as number,
                }));

              if (!items.length) {
                setToast({ tone: "danger", msg: "Inserisci almeno un pronostico prima di salvare." });
                return;
              }

              const lockedItems = items.filter((it) => isMatchLocked(matchById.get(it.matchId)));
              if (lockedItems.length) {
                setToast({
                  tone: "danger",
                  msg:
                    "Non puoi salvare pronostici su partite bloccate (lock lega o partita già iniziata/terminata). Rimuovi quei valori e riprova.",
                });
                return;
              }
              await api.savePredictions(items);
              setToast({ tone: "success", msg: "Pronostici salvati ✅" });
              // refresh predictions (and points if any)
              const p = await api.myPredictions();
              const map: Record<string, PredictionState> = {};
              for (const pr of (p.predictions as PredictionState[])) map[(pr as any).matchId] = pr;
              setPreds(map);
            } catch (e: any) {
              if (e.data?.reason) {
                setToast({ tone: "danger", msg: `Errore: ${e.message} (${e.data.reason}).` });
              } else {
                setToast({ tone: "danger", msg: e.message });
              }
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || isLocked || !hasAnyPrediction || hasLockedPrediction}
        >
          {saving ? "Salvataggio…" : "Salva pronostici"}
        </Button>
      </div>
    </div>
  );
}
