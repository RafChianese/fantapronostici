import React, { useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input, Skeleton } from "../components/ui";

type Match = {
  id: string;
  group: string;
  matchday: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
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
  const [saveHint, setSaveHint] = useState<string>("");
  const [toast, setToast] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);
  const predsRef = useRef<Record<string, PredictionState>>({});
  const matchByIdRef = useRef<Map<string, Match>>(new Map());
  const isLockedRef = useRef<boolean>(false);
  const autosaveInitializedRef = useRef(false);
  const initialCollapseSetRef = useRef(false);

  const isLocked = !!config?.lock?.isLocked;

  const reloadAll = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    try {
      if (!silent) show();
      setLoading(true);
      const [m, p, c] = await Promise.all([api.matches(), api.myPredictions(), api.publicConfig()]);
      setMatches(m.matches);
      const map: Record<string, PredictionState> = {};
      for (const pr of (p.predictions as PredictionState[])) map[pr.matchId] = pr;
      setPreds(map);
      setConfig(c);
    } catch (e: any) {
      setToast({ tone: "danger", msg: e.message });
    } finally {
      setLoading(false);
      if (!silent) hide();
    }
  };

  const matchById = useMemo(() => {
    const m = new Map<string, Match>();
    for (const it of matches) m.set(it.id, it);
    return m;
  }, [matches]);

  useEffect(() => { matchByIdRef.current = matchById; }, [matchById]);
  useEffect(() => { predsRef.current = preds; }, [preds]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  const isMatchLocked = (m: Match | undefined) => {
    if (!m) return true;

    const lock = config?.lock as any;
    const mode = (config?.leagueSettings?.predictionMode as any) || "MATCHDAY_BY_MATCHDAY";

    // Forced lock blocks everything.
    if (lock?.isForceLocked) return true;

    // Always block once a match has started.
    if (m.status !== "NOT_STARTED") return true;

    if (mode === "TOURNAMENT_PRE") {
      // In tournament-pre, when the lock triggers it blocks ALL editing (even future matchdays).
      return !!lock?.isLocked;
    }

    // Matchday-by-matchday: lock is scoped to the matchdays currently in lock window.
    const locked = new Set<number>((lock?.lockedMatchdays || []).map((x: any) => Number(x)));
    return locked.has(Number(m.matchday || 1));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reloadAll();
    })();
    return () => { cancelled = true; };
  }, [activeLeagueId]);

  // Keep lock state fresh. Important UX: when lock becomes active, immediately refresh the page data so inputs
  // get disabled and any in-flight local edits are overwritten by server state.
  useEffect(() => {
    if (!activeLeagueId) return;

    let cancelled = false;
    let interval: any = null;
    let timer: any = null;

    const scheduleExactRefreshAt = (iso: string | undefined | null) => {
      if (timer) clearTimeout(timer);
      if (!iso) return;
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return;
      const ms = t - Date.now();
      // If lock is in the future, schedule a refresh a tiny bit after the deadline.
      if (ms > 0) timer = setTimeout(() => reloadAll({ silent: true }), Math.min(ms + 350, 2_147_483_600));
    };

    const makeSig = (c: any) => {
      const l = c?.lock || {};
      const mds = Array.isArray(l.lockedMatchdays) ? [...l.lockedMatchdays].map(Number).sort((a,b)=>a-b).join(",") : "";
      return [!!l.isLocked, !!l.isForceLocked, !!l.lockAll, mds].join("|");
    };

    // Initial scheduling based on current config.
    scheduleExactRefreshAt(config?.lock?.lockUntil);
    let lastSig = makeSig(config);

    interval = setInterval(async () => {
      try {
        const next = await api.publicConfig();
        if (cancelled) return;

        const nextSig = makeSig(next);
        const changed = nextSig !== lastSig;
        lastSig = nextSig;

        // Refresh only when the lock state truly changes (isLocked OR locked matchdays/scope).
        if (changed) {
          setConfig(next);
          await reloadAll({ silent: true });
          if (next?.lock?.isLocked) setToast({ tone: "danger", msg: "Lock aggiornato: pagina aggiornata." });
        } else {
          // Still update config to keep countdown accurate.
          setConfig(next);
        }

        // Re-schedule exact refresh (manual lockUntil) if it changes.
        scheduleExactRefreshAt(next?.lock?.lockUntil);
      } catch {
        // ignore polling errors
      }
    }, 10_000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const all = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

    const mode = (config?.leagueSettings?.predictionMode as any) || "MATCHDAY_BY_MATCHDAY";
    if (mode === "TOURNAMENT_PRE") return all;

    const now = Date.now();
    const isFinished = (ms: Match[]) => ms.length > 0 && ms.every((x) => x.status === "FINISHED");
    const started = (ms: Match[]) => ms.some((x) => x.status !== "NOT_STARTED" || new Date(x.kickoffAt).getTime() <= now);

    const ongoing = all.find(([_, ms]) => started(ms) && !isFinished(ms))?.[0] ?? null;
    const upcoming = matches
      .filter((m) => m.status === "NOT_STARTED" && new Date(m.kickoffAt).getTime() > now)
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0]?.matchday ?? null;

    const visible = Array.from(new Set([ongoing, upcoming].filter((x): x is number => typeof x === "number" && Number.isFinite(x))));
    if (!visible.length) return all.slice(0, 1);
    return all.filter(([md]) => visible.includes(md));
  }, [matches, config?.leagueSettings?.predictionMode]);

  const firstNotFinishedMatchday = useMemo(() => {
    const target = byMatchday.find(([, ms]) => !(ms.length > 0 && ms.every((x) => x.status === "FINISHED")));
    return (target?.[0] ?? byMatchday[0]?.[0] ?? 1) as number;
  }, [byMatchday]);

  useEffect(() => {
    // UX: open ONLY the first matchday that is not finished. Everything else starts collapsed.
    // (User can still expand/collapse manually after.)
    if (!byMatchday.length) return;
    if (initialCollapseSetRef.current) return;
    initialCollapseSetRef.current = true;
    setCollapsed(() => {
      const next: Record<number, boolean> = {};
      for (const [md] of byMatchday) next[md] = md !== firstNotFinishedMatchday;
      return next;
    });
  }, [byMatchday, firstNotFinishedMatchday]);

  const hasAutoScrolledRef = useRef(false);

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

  const runAutosave = async () => {
    if (autosaveInitializedRef.current === false) autosaveInitializedRef.current = true;

    const snapshot = predsRef.current;
    const matchMap = matchByIdRef.current;

    // Only save complete predictions.
    const items = Object.entries(snapshot)
      .filter(([, p]) => Number.isInteger(p.homeGoals) && Number.isInteger(p.awayGoals))
      .map(([matchId, p]) => ({ matchId, homeGoals: p.homeGoals as number, awayGoals: p.awayGoals as number }));

    if (!items.length) return;

    const lockedItems = items.filter((it) => isMatchLocked(matchMap.get(it.matchId)));
    if (lockedItems.length) {
      setToast({
        tone: "danger",
        msg: "Non puoi salvare pronostici su partite bloccate (lock lega o partita già iniziata/terminata).",
      });
      return;
    }

    setSaving(true);
    setSaveHint("Salvataggio…");
    try {
      await api.savePredictions(items);
      setSaveHint("Salvato ✅");
      // Reload from API to ensure UI is consistent with server.
      const p = await api.myPredictions();
      const map: Record<string, PredictionState> = {};
      for (const pr of (p.predictions as PredictionState[])) map[(pr as any).matchId] = pr;
      setPreds(map);
    } catch (e: any) {
      setSaveHint("");
      if (e.data?.reason) setToast({ tone: "danger", msg: `Errore: ${e.message} (${e.data.reason}).` });
      else setToast({ tone: "danger", msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveHint((h) => (h === "Salvato ✅" ? "" : h)), 1500);
    }
  };

  const scheduleAutosave = () => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      runAutosave();
    }, 900);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader title="I miei pronostici" subtitle="Caricamento…" />
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 rounded-2xl bg-slate-200/60 animate-pulse" />
                <div className="h-10 rounded-2xl bg-slate-200/60 animate-pulse" />
              </div>
              <div className="h-4 w-2/3 rounded bg-slate-200/60 animate-pulse" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Partite" subtitle="" />
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200/60 animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


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
            saveHint ? <span className="text-xs font-medium text-slate-600">{saveHint}</span> : null
          }
        />
        <CardContent>
          {isLocked ? (
            <Alert tone="danger">
              Pronostici bloccati.
            </Alert>
          ) : (
            <div className="text-sm text-slate-600">
              Puoi inserire e modificare i pronostici finché la finestra è aperta.
            </div>
          )}
        </CardContent>
      </Card>

      {byMatchday.length ? (
        <Card>
          <CardHeader title="Vai a giornata" subtitle="Seleziona una giornata e scorri automaticamente." />
          <CardContent>
            <div className="flex items-center gap-3">
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue={String(firstNotFinishedMatchday)}
                onChange={(e) => {
                  const md = Number(e.target.value);
                  // Open the selected matchday for convenience.
                  setCollapsed((prev) => ({ ...prev, [md]: false }));
                  setTimeout(() => {
                    const el = document.getElementById(`matchday-${md}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 0);
                }}
              >
                {byMatchday.map(([md, ms]) => (
                  <option
                    key={md}
                    value={String(md)}
                    style={md === firstNotFinishedMatchday ? { color: "#0f766e", fontWeight: 700 } : undefined}
                  >
                    Giornata {md} · {ms.length} partite{md === firstNotFinishedMatchday ? "  ★" : ""}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                  const lockedForThisMatch = isMatchLocked(m);
                  const canEdit = !lockedForThisMatch;
                  const lockReason =
                    m.status !== "NOT_STARTED"
                      ? "Non modificabile: partita iniziata/terminata"
                      : (config?.lock as any)?.isForceLocked
                      ? "Non modificabile: lock forzato"
                      : ((config?.leagueSettings?.predictionMode as any) === "TOURNAMENT_PRE" && (config?.lock as any)?.isLocked)
                      ? "Non modificabile: lock torneo"
                      : "Non modificabile: lock giornata";
                  
                  const real = m.homeScore !== null && m.awayScore !== null ? `${m.homeScore}-${m.awayScore}` : "—";

                  const d = new Date(m.kickoffAt);
                  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

                  const clamp20 = (raw: string) => {
                    const v = raw.replace(/\D/g, "");
                    if (v === "") return undefined;
                    const n = Math.min(20, Number(v));
                    return Number.isFinite(n) ? n : undefined;
                  };

                  const quick = [
                    [0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
                    [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 3], [4, 2],
                    [0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3], [3, 4], [2, 4],
                  ] as const;

                  const setScore = (home: number | undefined, away: number | undefined) => {
                    setPreds((prev) => {
                      const existing = prev[m.id] ?? { matchId: m.id };
                      const next = { ...existing, homeGoals: home, awayGoals: away };
                      return { ...prev, [m.id]: next };
                    });
                    // autosave (debounced)
                    scheduleAutosave();
                  };

                  const TeamDot = ({ name, logo }: { name: string; logo?: string | null }) => {
                    if (logo) {
                      return <img src={logo} alt={name} className="h-6 w-6 rounded-full object-contain" />;
                    }
                    return (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-700">
                        {name.trim().slice(0, 1).toUpperCase()}
                      </span>
                    );
                  };

                  const activeQuick = (a: number, b: number) => p?.homeGoals === a && p?.awayGoals === b;

                  return (
                    <div key={m.id} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white/70 p-3 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {statusBadge(m.status)}
                          {!canEdit ? (
                            <span
                              title={lockReason}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2 py-1"
                            >
                              <Lock className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 sm:hidden">Reale: <span className="font-medium text-slate-700">{real}</span></div>
                      </div>

                      {!canEdit ? <div className="pointer-events-none absolute inset-0 bg-white/25" /> : null}

                      <div className="mt-2 grid grid-cols-[54px_1fr_auto] items-center gap-2">
                        <div className="text-xs text-slate-600">
                          <div className="font-semibold">{date}</div>
                          <div className="text-slate-500">{time}</div>
                        </div>

                        <div className="min-w-0">
                          {/* Mobile-first: teams stacked like Diretta */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamDot name={m.homeTeam} logo={m.homeLogo} />
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{m.homeTeam}</div>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamDot name={m.awayTeam} logo={m.awayLogo} />
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{m.awayTeam}</div>
                            </div>
                          </div>
                          <div className="mt-1 hidden text-xs text-slate-500 sm:block">
                            {d.toLocaleString()} · Reale: <span className="font-medium text-slate-700">{real}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="numeric"
                            disabled={!canEdit}
                            className="!w-12 !px-2 !py-1 text-center"
                            value={p?.homeGoals === undefined ? "" : String(p.homeGoals)}
                            placeholder="0"
                            onChange={(e) => {
                              const v = clamp20(e.target.value);
                              setPreds((prev) => {
                                const existing = prev[m.id] ?? { matchId: m.id };
                                const next = { ...existing, homeGoals: v };
                                return { ...prev, [m.id]: next };
                              });
                              scheduleAutosave();
                            }}
                          />
                          <span className="px-1 text-xs text-slate-400">-</span>
                          <Input
                            inputMode="numeric"
                            disabled={!canEdit}
                            className="!w-12 !px-2 !py-1 text-center"
                            value={p?.awayGoals === undefined ? "" : String(p.awayGoals)}
                            placeholder="0"
                            onChange={(e) => {
                              const v = clamp20(e.target.value);
                              setPreds((prev) => {
                                const existing = prev[m.id] ?? { matchId: m.id };
                                const next = { ...existing, awayGoals: v };
                                return { ...prev, [m.id]: next };
                              });
                              scheduleAutosave();
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-slate-600 sm:text-sm">
                        <span className="text-slate-500">Risultato reale:</span> <span className="font-medium">{real}</span>
                        {m.status === "FINISHED" && p ? (
                          <span className="ml-3 text-slate-500">
                            Punti: <span className="font-semibold text-slate-800">{p.totalPoints}</span>{" "}
                            <span className="text-xs">({buildBreakdown(p, !!config?.features?.underOver25)})</span>
                          </span>
                        ) : null}
                      </div>

                      {canEdit ? (
                        <div className="mt-2 grid grid-cols-7 gap-1">
                          {quick.map(([a, b]) => (
                            <button
                              key={`${a}-${b}`}
                              type="button"
                              className={`rounded-lg border px-2 py-1 text-xs ${activeQuick(a, b) ? "border-[#2EC4B6] bg-[#2EC4B6]/10 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                              onClick={() => setScore(a, b)}
                            >
                              {a}-{b}
                            </button>
                          ))}
                        </div>
                      ) : null}
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
    </div>
  );
}
