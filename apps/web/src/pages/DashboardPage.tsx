import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLock } from "../lib/lock";
import { Button, Card, CardContent, CardHeader, Skeleton, Badge } from "../components/ui";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { AchievementsStrip } from "../components/Achievements";
import { UserAvatar } from "../components/Avatar";

function getInitials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "L";
  const b = parts.length > 1 ? parts[1][0] : (parts[0]?.[1] || "G");
  return (a + b).toUpperCase();
}


type LeaderRow = { userId: string; totalPoints: number; displayName?: string | null };

function useCountdown(targetIso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const t = new Date(targetIso).getTime();
    if (!Number.isFinite(t)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetIso]);
  return useMemo(() => {
    if (!targetIso) return null;
    const t = new Date(targetIso).getTime();
    if (!Number.isFinite(t)) return null;
    const ms = t - now;
    if (ms <= 0) return null;
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`;
    return `${mm}:${pad(ss)}`;
  }, [targetIso, now]);
}

function pillTone(kind: "green" | "yellow" | "orange" | "red" | "grey") {
  // Tailwind bg classes in one place
  if (kind === "grey") return "bg-slate-400";
  if (kind === "green") return "bg-emerald-500";
  if (kind === "yellow") return "bg-amber-300";
  if (kind === "orange") return "bg-orange-400";
  return "bg-rose-500";
}

function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    // Safari <14
    // @ts-ignore
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    // @ts-ignore
    else mq.addListener(onChange);
    onChange();
    return () => {
      // @ts-ignore
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      // @ts-ignore
      else mq.removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}


export default function DashboardPage() {
  const { user, memberships, activeLeagueId, setActiveLeague } = useAuth();
  const { data: lockData } = useLock();

  const approved = useMemo(() => memberships.filter((m) => m.status === "APPROVED"), [memberships]);
  const activeMembership = useMemo(
    () => approved.find((m) => m.league.id === activeLeagueId) || approved[0] || null,
    [approved, activeLeagueId]
  );

  const [summary, setSummary] = useState<any>(null);
  const [leader, setLeader] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const leagueName = activeMembership?.league?.name || summary?.league?.name || "Lega";
  const leagueCode = activeMembership?.league?.code || summary?.league?.code || undefined;
  const displayName = user?.displayName || summary?.user?.displayName || "Partecipante";

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !activeLeagueId) return;
    if (!leagueCode) return;

    setLoading(true);
    Promise.all([api.userSummary(user.id, leagueCode), api.leaderboard("points_desc", leagueCode)])
      .then(([s, lb]) => {
        if (cancelled) return;
        setSummary(s);
        setLeader(Array.isArray(lb?.rows) ? lb.rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setLeader([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeLeagueId, leagueCode]);

  // League branding/logo is no longer shown on Home (mobile), we show the user's avatar instead.

  const totals = summary?.totals ?? { total: 0, exact: 0, outcome: 0, sumGoals: 0 };
  // XP-style micro feedback when points change.
  const [xpDelta, setXpDelta] = useState<number>(0);
  const prevTotalRef = React.useRef<number>(Number(totals?.total ?? 0));
  useEffect(() => {
    const prev = prevTotalRef.current;
    const next = Number(totals?.total ?? 0);
    if (Number.isFinite(prev) && Number.isFinite(next) && next !== prev) {
      const d = next - prev;
      if (d > 0) {
        setXpDelta(d);
        window.setTimeout(() => setXpDelta(0), 900);
      }
      prevTotalRef.current = next;
    }
  }, [totals?.total]);
  const items: any[] = Array.isArray(summary?.detail) ? summary.detail : [];
  const exactHits = useMemo(() => {
    return (items || []).reduce((c, d) => c + ((Number(d?.points?.exact ?? 0) > 0) ? 1 : 0), 0);
  }, [items]);


  const byMatchday = useMemo(() => {
    const m: Record<number, any[]> = {};
    for (const it of items) {
      const md = Number(it?.match?.matchday ?? it?.matchday ?? 0);
      if (!md) continue;
      if (!m[md]) m[md] = [];
      m[md].push(it);
    }
    return m;
  }, [items]);

  const matchdayMeta = useMemo(() => {
    // Aggregated info for quick UX blocks (progress, first kickoff).
    const meta: Record<number, { totalMatches: number; predicted: number; firstKickoff?: string }> = {};
    for (const mdStr of Object.keys(byMatchday)) {
      const md = Number(mdStr);
      const arr = byMatchday[md] || [];
      const seen = new Set<string>();
      let predicted = 0;
      let firstKickoff: string | undefined;
      for (const it of arr) {
        const matchId = String(it?.match?.id ?? it?.matchId ?? "");
        if (matchId) seen.add(matchId);
        const hs = it?.prediction?.homeGoals ?? it?.prediction?.homeScore ?? it?.prediction?.home ?? it?.homeGoals;
        const as = it?.prediction?.awayGoals ?? it?.prediction?.awayScore ?? it?.prediction?.away ?? it?.awayGoals;
        if (hs !== undefined && hs !== null && as !== undefined && as !== null) predicted += 1;
        const ko = it?.match?.kickoffAt;
        if (ko) {
          if (!firstKickoff) firstKickoff = ko;
          else if (new Date(ko).getTime() < new Date(firstKickoff).getTime()) firstKickoff = ko;
        }
      }
      meta[md] = { totalMatches: seen.size || arr.length || 0, predicted, firstKickoff };
    }
    return meta;
  }, [byMatchday]);

  const matchdays = useMemo(() => Object.keys(byMatchday).map((x) => Number(x)).filter(Boolean).sort((a,b) => a-b), [byMatchday]);

  const currentMatchday = useMemo(() => {
    const now = Date.now();
    const isAllFinished = (md: number) => {
      const arr = byMatchday[md] || [];
      if (!arr.length) return true;
      return arr.every((it) => (it?.match?.status || it?.status) === "FINISHED");
    };
    // pick first matchday that is not fully finished
    const md = matchdays.find((m) => !isAllFinished(m));
    return md ?? matchdays[0] ?? 1;
  }, [matchdays, byMatchday]);

  const currentStatus = useMemo<"IN_PROGRESS" | "NOT_STARTED" | "FINISHED">(() => {
    const arr = byMatchday[currentMatchday] || [];
    if (!arr.length) return "NOT_STARTED";
    if (arr.some((it) => (it?.match?.status || it?.status) === "IN_PROGRESS")) return "IN_PROGRESS";
    if (arr.every((it) => (it?.match?.status || it?.status) === "FINISHED")) return "FINISHED";
    // mixed NOT_STARTED/FINISHED => treat as in progress-ish; but UX requires only IN_PROGRESS vs NOT_STARTED
    return arr.some((it) => (it?.match?.status || it?.status) === "FINISHED") ? "IN_PROGRESS" : "NOT_STARTED";
  }, [byMatchday, currentMatchday]);

  const myPosition = useMemo(() => {
    if (!user?.id) return null;
    const idx = leader.findIndex((r) => r.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [leader, user?.id]);

  const playedMatchdays = useMemo(() => {
    // count matchdays with at least one finished match
    let c = 0;
    for (const md of matchdays) {
      const arr = byMatchday[md] || [];
      if (arr.some((it) => (it?.match?.status || it?.status) === "FINISHED")) c += 1;
    }
    return c;
  }, [matchdays, byMatchday]);

  const lock = lockData?.lock;
  const lockCountdown = useCountdown(lock?.lockUntil);
  const predictionMode = lockData?.leagueSettings?.predictionMode || "MATCHDAY_BY_MATCHDAY";

  const isMatchdayLocked = useMemo(() => {
    const lockAll = !!lock?.lockAll;
    const lockedSet = new Set<number>((lock?.lockedMatchdays || []) as any);
    return (md: number) => {
      if (lockAll) return true;
      if (predictionMode === "MATCHDAY_BY_MATCHDAY" && lockedSet.has(md)) return true;
      return false;
    };
  }, [lock?.lockAll, lock?.lockedMatchdays, predictionMode]);

  const nextEditableMatchday = useMemo(() => {
    const mds = matchdays.slice().sort((a, b) => a - b);
    for (const md of mds) {
      const arr = byMatchday[md] || [];
      if (!arr.length) continue;
      const anyNotStarted = arr.some((it) => (it?.match?.status || it?.status) === "NOT_STARTED");
      if (!anyNotStarted) continue;
      if (isMatchdayLocked(md)) continue;
      return md;
    }
    return null;
  }, [matchdays, byMatchday, isMatchdayLocked]);

  const hasPronosticabile = useMemo(() => {
    // Must exist at least one matchday not started and not locked-by-scope (unless lockAll)
    if (!matchdays.length) return false;
    const lockAll = !!lock?.lockAll;
    const lockedSet = new Set<number>((lock?.lockedMatchdays || []) as any);
    for (const md of matchdays) {
      const arr = byMatchday[md] || [];
      if (!arr.length) continue;
      const anyNotStarted = arr.some((it) => (it?.match?.status || it?.status) === "NOT_STARTED");
      if (!anyNotStarted) continue;
      if (lockAll) return false;
      if (predictionMode === "MATCHDAY_BY_MATCHDAY" && lockedSet.has(md)) continue;
      return true;
    }
    return false;
  }, [matchdays, byMatchday, lock?.lockAll, lock?.lockedMatchdays, predictionMode]);

  const isLocked = !!lock?.isLocked;
  const canInsert = !isLocked && hasPronosticabile;

  const isMobile = useIsMobile(768);
  const pillCount = isMobile ? 5 : 10;

  const pillMatchdays = useMemo(() => {
    // UX requirement:
    // - show the last 4 *finished* matchdays
    // - plus the current matchday (the first one that is not fully finished)
    // Example:
    //  - if md 15 is not finished => 11-12-13-14-15
    //  - if md 15 is finished and md 16 exists (NOT_STARTED) => 12-13-14-15-16

    if (!matchdays.length) return [] as number[];

    const statusOf = (md: number): "IN_PROGRESS" | "NOT_STARTED" | "FINISHED" => {
      const arr = byMatchday[md] || [];
      if (!arr.length) return "NOT_STARTED";
      const st = (it: any) => (it?.match?.status || it?.status) as string;
      if (arr.every((it) => st(it) === "FINISHED")) return "FINISHED";
      if (arr.every((it) => st(it) === "NOT_STARTED")) return "NOT_STARTED";
      return "IN_PROGRESS";
    };

    const current = currentMatchday;
    const finishedBefore = matchdays.filter((md) => md < current && statusOf(md) === "FINISHED");
    const lastFinished = finishedBefore.slice(-(pillCount - 1));

    const out: number[] = [...lastFinished, current];

    // If we don't have enough finished matchdays yet (early season), pad with next matchdays
    // so the UI always shows up to N pills.
    if (out.length < pillCount) {
      const after = matchdays.filter((md) => md > current);
      for (const md of after) {
        if (out.length >= pillCount) break;
        out.push(md);
      }
    }

    // As a final fallback, pad with earlier matchdays if still < N.
    if (out.length < pillCount) {
      const before = matchdays.filter((md) => md < current);
      for (let i = before.length - 1; i >= 0 && out.length < pillCount; i--) {
        const md = before[i];
        if (!out.includes(md)) out.unshift(md);
      }
    }

    // Keep sorted by matchday.
    return Array.from(new Set(out)).sort((a, b) => a - b).slice(-pillCount);
  }, [matchdays, byMatchday, currentMatchday, pillCount]);

  const lastPills = useMemo(() => {
    const recent = [...pillMatchdays];
    return recent.map((md) => {
      const arr = byMatchday[md] || [];
      const pts = arr.reduce((s, it) => s + Number(it?.points?.total ?? it?.points?.totalPoints ?? 0), 0);

      const status: "IN_PROGRESS" | "NOT_STARTED" | "FINISHED" = (() => {
        if (!arr.length) return "NOT_STARTED";
        const st = (it: any) => (it?.match?.status || it?.status) as string;
        if (arr.some((it) => st(it) === "IN_PROGRESS")) return "IN_PROGRESS";
        if (arr.every((it) => st(it) === "NOT_STARTED")) return "NOT_STARTED";
        if (arr.every((it) => st(it) === "FINISHED")) return "FINISHED";
        // mixed FINISHED/NOT_STARTED => still effectively in progress
        return "IN_PROGRESS";
      })();

      // points-based tone (only used when FINISHED)
      const anyExact = arr.some((it) => Number(it?.points?.exact ?? it?.pointsExact ?? 0) > 0);
      const anyOutcome = arr.some((it) => Number(it?.points?.outcome ?? it?.pointsOutcome ?? 0) > 0);
      const anySum = arr.some((it) => Number(it?.points?.sumGoals ?? it?.pointsSumGoals ?? 0) > 0);

      let tone: "green" | "yellow" | "orange" | "red" | "grey" = "grey";
      if (status === "FINISHED") {
        if (anyExact) tone = "green";
        else if (anyOutcome) tone = "yellow";
        else if (anySum) tone = "orange";
        else tone = "red";
      } else {
        // NOT_STARTED or IN_PROGRESS => always grey
        tone = "grey";
      }

      return { md, pts, tone, status };
    });
  }, [pillMatchdays, byMatchday]);

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      {/* 1) League select */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-slate-600">Lega</label>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-2 shadow-sm">
          <select
            className="w-full rounded-xl bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-100 outline-none ring-1 ring-slate-800 focus:ring-2 focus:ring-rose-500/30"
            value={activeMembership?.league.id || ""}
            onChange={(e) => setActiveLeague(e.target.value)}
          >
            {approved.map((m) => (
              <option key={m.league.id} value={m.league.id}>
                {m.league.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* League hero */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white">
            <div className="text-lg font-extrabold">{getInitials(activeMembership?.league.name || "Lega")}</div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">Lega attiva</div>
            <div className="truncate text-lg font-extrabold text-slate-900">{activeMembership?.league.name}</div>
          </div>
        </div>
      </div>

      {/* 2) Participant name */}
      <div className="mb-2 text-center">
        <div className="text-[13px] font-semibold text-slate-500">Ciao,</div>
        <div className="text-2xl font-extrabold tracking-tight text-slate-900">{displayName}</div>
      </div>

      {/* 3) User avatar (full-body) */}
      <div className="my-4 flex items-center justify-center">
        <div className="rounded-[28px] bg-slate-950/60 p-2 ring-1 ring-slate-800 shadow-sm">
          <UserAvatar avatarId={(user as any)?.avatarId} size={120} mode="full" className="rounded-3xl" />
        </div>
      </div>

      {/* 4) Personal standings card */}
      <Card className="mb-4 rounded-3xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900">La tua classifica</div>
            <Badge tone="slate">{leagueName}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-2xl bg-slate-950/60 p-3 ring-1 ring-slate-800/70">
                <div className="text-[11px] font-semibold text-slate-500">Posizione</div>
                <div className="text-lg font-extrabold text-slate-900">{myPosition ?? "—"}</div>
              </div>
              <div className="relative rounded-2xl bg-slate-950/60 p-3 ring-1 ring-slate-800/70">
                <div className="text-[11px] font-semibold text-slate-500">Punti</div>
                <div className="text-lg font-extrabold text-slate-900">
                  <AnimatedNumber value={Number(totals?.total ?? 0)} />
                </div>
                {xpDelta > 0 ? (
                  <div className="pointer-events-none absolute right-3 top-3 tm-xp-float rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-lg">
                    +{xpDelta} XP
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl bg-slate-950/60 p-3 ring-1 ring-slate-800/70">
                <div className="text-[11px] font-semibold text-slate-500">Giornate</div>
                <div className="text-lg font-extrabold text-slate-900">{playedMatchdays}</div>
              </div>
              <div className="rounded-2xl bg-slate-950/60 p-3 ring-1 ring-slate-800/70">
                <div className="text-[11px] font-semibold text-slate-500">Esatti</div>
                <div className="text-lg font-extrabold text-slate-900">
                  <AnimatedNumber value={Number(exactHits ?? 0)} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <AchievementsStrip
          input={{
            hasAnyPrediction: (items?.length ?? 0) > 0,
            hasScorerPick: Boolean((items ?? []).some((x: any) => x?.scorerPick?.playerName)),
            hasTournamentPicks: Boolean((summary as any)?.competitionPicks?.winner || (summary as any)?.competitionPicks?.topScorer),
            myRank: myPosition ?? null,
          }}
        />
      </div>

      {/* 5) Next actions (the "center of the game") - v2 hero */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-slate-800 shadow-sm">
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
                <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Prossima giornata</div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight">
                  {nextEditableMatchday ? `Giornata ${nextEditableMatchday}` : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-300">Avanzamento</div>
                <div className="mt-1 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-extrabold">
                  {nextEditableMatchday ? "Match" : "—"}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="mt-4 space-y-3">
                <div className="h-4 w-1/2 rounded bg-white/10" />
                <div className="h-10 w-full rounded-2xl bg-white/10" />
                <div className="h-3 w-2/3 rounded bg-white/10" />
              </div>
            ) : nextEditableMatchday ? (
              (() => {
                const meta = matchdayMeta[nextEditableMatchday] || { totalMatches: 0, predicted: 0, firstKickoff: undefined };
                const total = Math.max(0, Number(meta.totalMatches || 0));
                const done = Math.min(total, Math.max(0, Number(meta.predicted || 0)));
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const firstKickoff = meta.firstKickoff ? new Date(meta.firstKickoff) : null;
                return (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm font-semibold text-slate-100">
                      {total > 0 ? (
                        <>
                          ⚽ <b>{done}</b> / <b>{total}</b> partite pronosticate
                        </>
                      ) : (
                        <>Inserisci i pronostici della giornata</>
                      )}
                    </div>

                    {total > 0 ? (
                      <div className="rounded-full bg-white/10 p-1">
                        <div className="h-2.5 rounded-full bg-emerald-400 transition-[width]" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}

                    <Link to={`/predictions?md=${nextEditableMatchday}`} className="block">
                      <button
                        className="w-full rounded-2xl border border-rose-400/50 bg-black/40 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-black/55"
                        type="button"
                      >
                        Inserisci pronostici
                      </button>
                    </Link>

                    <div className="text-xs font-semibold text-slate-300">
                      {isLocked ? (
                        lockCountdown ? (
                          <>🔒 Lega in lock · Sblocco tra <b className="text-white">{lockCountdown}</b></>
                        ) : (
                          <>🔒 Lega in lock</>
                        )
                      ) : firstKickoff ? (
                        <>⏰ Prima partita: <b className="text-white">{firstKickoff.toLocaleString()}</b></>
                      ) : (
                        <>Puoi modificare fino all’inizio della prima partita</>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold text-slate-200">Nessuna giornata pronosticabile al momento.</div>
                <div className="text-xs font-semibold text-slate-300">
                  {isLocked && lockCountdown ? <>🔒 Lega in lock · Sblocco tra <b className="text-white">{lockCountdown}</b></> : <>Riprova più tardi</>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mini classifica */}
      <Card className="mb-4 rounded-3xl">
        <CardHeader title="Top 5 lega" subtitle="" right={<Link to="/leaderboard"><Button variant="secondary">Vai</Button></Link>} />
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 rounded-2xl" />
              <Skeleton className="h-10 rounded-2xl" />
              <Skeleton className="h-10 rounded-2xl" />
            </div>
          ) : leader.length ? (
            <div className="space-y-2">
              {leader.slice(0, 5).map((r, i) => {
                const isMe = r.userId === user?.id;
                const gap = i === 0 ? 0 : Math.max(0, Number(leader[0]?.totalPoints ?? 0) - Number(r.totalPoints ?? 0));
                return (
                  <div key={r.userId} className={`flex items-center justify-between rounded-2xl border px-3 py-2 ${isMe ? "border-rose-500/30 bg-rose-500/10" : "border-slate-800 bg-slate-950/50"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`grid h-8 w-8 place-items-center rounded-xl text-sm font-extrabold ${i === 0 ? "bg-amber-100 text-amber-800" : i === 1 ? "bg-slate-100 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-800" : "bg-slate-50 text-slate-700"}`}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">{isMe ? "Tu" : (r.displayName || `User ${String(r.userId).slice(0, 6)}`)}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{gap > 0 ? `-${gap} dal leader` : "Leader"}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-slate-900">{r.totalPoints}</div>
                      <div className="text-[11px] font-semibold text-slate-500">pt</div>
                    </div>
                  </div>
                );
              })}
              <div className="text-xs text-slate-500">(Nomi completi nella pagina Classifica.)</div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Classifica non disponibile.</div>
          )}
        </CardContent>
      </Card>

      {/* 6) Recent matchdays */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-bold text-slate-900">Ultime {pillCount} giornate</div>
        <Link to="/leaderboard" className="text-xs font-semibold text-slate-600 underline">
          Vedi classifica
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Array.from({ length: pillCount }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className={isMobile ? "h-12 w-12 rounded-full" : "h-14 w-14 rounded-full"} />
              <Skeleton className="h-3 w-10 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {lastPills.map((it) => (
            <div key={it.md} className="flex flex-col items-center">
              <Link
                to={`/predictions?md=${it.md}`}
                className="flex flex-col items-center"
                aria-label={`Vai alla giornata ${it.md}`}
              >
                <div
                  className={[
                    `relative flex ${isMobile ? "h-12 w-12" : "h-14 w-14"} items-center justify-center rounded-full text-sm font-extrabold text-white shadow-sm transition-transform duration-200 active:scale-95`,
                    pillTone(it.tone),
                  ].join(" ")}
                >
                  {it.status === "IN_PROGRESS" ? (
                    <span
                      className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm ring-2 ring-white animate-pulse"
                      aria-label="Giornata in corso"
                    />
                  ) : null}
                  {it.md}
                </div>
                <div className="mt-2 text-[11px] font-bold text-slate-700">{it.pts} pt</div>
              </Link>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
