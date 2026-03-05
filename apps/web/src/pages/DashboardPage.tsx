import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLock } from "../lib/lock";
import { AchievementsStrip } from "../components/Achievements";
import { UserAvatar } from "../components/Avatar";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";

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
  if (kind === "grey") return "bg-slate-400";
  if (kind === "green") return "bg-emerald-500";
  if (kind === "yellow") return "bg-amber-300";
  if (kind === "orange") return "bg-orange-400";
  return "bg-rose-500";
}

export default function DashboardPage() {
  const { user, memberships, activeLeagueId, setActiveLeague } = useAuth();
  const { data: lockData } = useLock();

  const approved = useMemo(() => memberships.filter((m) => m.status === "APPROVED"), [memberships]);
  const activeMembership = useMemo(
    () => approved.find((m) => m.league.id === activeLeagueId) || approved[0] || null,
    [approved, activeLeagueId]
  );

  const leagueName = activeMembership?.league?.name || "Lega";
  const leagueCode = activeMembership?.league?.code || undefined;
  const displayName = user?.displayName || "Partecipante";

  const [summary, setSummary] = useState<any>(null);
  const [leader, setLeader] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !activeLeagueId || !leagueCode) return;

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

  const totals = summary?.totals ?? { total: 0, exact: 0, outcome: 0, sumGoals: 0 };

  const items: any[] = Array.isArray(summary?.detail) ? summary.detail : [];
  const exactHits = useMemo(() => {
    return (items || []).reduce((c, d) => c + (Number(d?.points?.exact ?? 0) > 0 ? 1 : 0), 0);
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

  const matchdays = useMemo(() => Object.keys(byMatchday).map(Number).filter(Boolean).sort((a, b) => a - b), [byMatchday]);

  const matchdayMeta = useMemo(() => {
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
        const hs = it?.prediction?.homeGoals ?? it?.homeGoals;
        const as = it?.prediction?.awayGoals ?? it?.awayGoals;
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

  const currentMatchday = useMemo(() => {
    const isAllFinished = (md: number) => {
      const arr = byMatchday[md] || [];
      if (!arr.length) return true;
      return arr.every((it) => (it?.match?.status || it?.status) === "FINISHED");
    };
    const md = matchdays.find((m) => !isAllFinished(m));
    return md ?? matchdays[0] ?? 1;
  }, [matchdays, byMatchday]);

  const playedMatchdays = useMemo(() => {
    let c = 0;
    for (const md of matchdays) {
      const arr = byMatchday[md] || [];
      if (arr.some((it) => (it?.match?.status || it?.status) === "FINISHED")) c += 1;
    }
    return c;
  }, [matchdays, byMatchday]);

  const lock = lockData?.lock;
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

  const canInsert = !!nextEditableMatchday && !lock?.isLocked;

  const myPosition = useMemo(() => {
    if (!user?.id) return null;
    const idx = leader.findIndex((r) => r.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [leader, user?.id]);

  const pillMatchdays = useMemo(() => {
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
    const lastFinished = finishedBefore.slice(-4);
    const out: number[] = [...lastFinished, current];
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }, [matchdays, byMatchday, currentMatchday]);

  const lastPills = useMemo(() => {
    return pillMatchdays.map((md) => {
      const arr = byMatchday[md] || [];
      const pts = arr.reduce((s, it) => s + Number(it?.points?.total ?? 0), 0);

      const status: "IN_PROGRESS" | "NOT_STARTED" | "FINISHED" = (() => {
        if (!arr.length) return "NOT_STARTED";
        const st = (it: any) => (it?.match?.status || it?.status) as string;
        if (arr.some((it) => st(it) === "IN_PROGRESS")) return "IN_PROGRESS";
        if (arr.every((it) => st(it) === "FINISHED")) return "FINISHED";
        return "NOT_STARTED";
      })();

      const anyExact = arr.some((it) => Number(it?.points?.exact ?? 0) > 0);
      const anyOutcome = arr.some((it) => Number(it?.points?.outcome ?? 0) > 0);
      const anySum = arr.some((it) => Number(it?.points?.sumGoals ?? 0) > 0);

      let tone: "green" | "yellow" | "orange" | "red" | "grey" = "grey";
      if (status === "FINISHED") {
        if (anyExact) tone = "green";
        else if (anyOutcome) tone = "yellow";
        else if (anySum) tone = "orange";
        else tone = "red";
      }

      return { md, pts, tone, status };
    });
  }, [pillMatchdays, byMatchday]);

  const nextMeta = nextEditableMatchday ? matchdayMeta[nextEditableMatchday] : null;
  const nextTotal = Math.max(0, Number(nextMeta?.totalMatches || 0));
  const nextDone = Math.min(nextTotal, Math.max(0, Number(nextMeta?.predicted || 0)));
  const nextPct = nextTotal > 0 ? Math.round((nextDone / nextTotal) * 100) : 0;
  const nextCountdown = useCountdown(nextMeta?.firstKickoff);

  const top5 = leader.slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {approved.length > 1 ? (
        <Card>
          <CardHeader title="Lega" subtitle="Cambia lega" />
          <CardContent>
            <select
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-semibold text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/30"
              value={activeMembership?.league.id || ""}
              onChange={(e) => setActiveLeague(e.target.value)}
            >
              {approved.map((m) => (
                <option key={m.league.id} value={m.league.id}>
                  {m.league.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      {/* Next matchday hero */}
      <div className="tm-glass overflow-hidden">
        <div className="tm-stadium-hero">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Prossima giornata</div>
                <div className="mt-1 truncate text-2xl font-extrabold tracking-tight text-slate-100">
                  {nextEditableMatchday ? `Giornata ${nextEditableMatchday}` : "—"}
                </div>
                <div className="mt-2 text-sm text-slate-200">
                  {nextEditableMatchday ? (
                    <>
                      Pronostici: <b className="text-slate-100">{nextDone}</b>/{nextTotal || "—"}
                    </>
                  ) : (
                    <>Nessuna giornata pronosticabile.</>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs text-slate-300">Countdown</div>
                <div className="mt-1 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-extrabold">
                  {nextCountdown || "—"}
                </div>
              </div>
            </div>

            {nextEditableMatchday ? (
              <>
                <div className="mt-4 rounded-full bg-white/10 p-1">
                  <div className="h-2.5 rounded-full bg-rose-500/80 transition-[width]" style={{ width: `${nextPct}%` }} />
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-300">
                    {nextMeta?.firstKickoff ? (
                      <>
                        Prima partita: {new Date(nextMeta.firstKickoff).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </>
                    ) : (
                      <>Prima partita: —</>
                    )}
                  </div>
                  <Link to={`/predictions?md=${nextEditableMatchday}`}>
                    <Button disabled={!canInsert}>{canInsert ? "Inserisci pronostici" : "Pronostici bloccati"}</Button>
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Snapshot */}
      <Card>
        <CardHeader title="Il tuo profilo" subtitle={leagueName} right={<Badge tone="slate">{displayName}</Badge>} />
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-2">
              <UserAvatar avatarId={(user as any)?.avatarId} size={64} mode="full" className="rounded-2xl" />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-slate-400">Posizione</div>
                <div className="mt-0.5 text-lg font-extrabold text-slate-100">{loading ? "—" : myPosition ?? "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-slate-400">Punti</div>
                <div className="mt-0.5 text-lg font-extrabold text-slate-100">
                  {loading ? "—" : <AnimatedNumber value={Number(totals?.total ?? 0)} />}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-slate-400">Giornate</div>
                <div className="mt-0.5 text-lg font-extrabold text-slate-100">{loading ? "—" : playedMatchdays}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-slate-400">Esatti</div>
                <div className="mt-0.5 text-lg font-extrabold text-slate-100">
                  {loading ? "—" : <AnimatedNumber value={Number(exactHits ?? 0)} />}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AchievementsStrip
        input={{
          hasAnyPrediction: (items?.length ?? 0) > 0,
          hasScorerPick: Boolean((items ?? []).some((x: any) => x?.scorerPick?.playerName)),
          hasTournamentPicks: Boolean((summary as any)?.competitionPicks?.winner || (summary as any)?.competitionPicks?.topScorer),
          myRank: myPosition ?? null,
        }}
      />

      {/* Recent matchdays */}
      <Card>
        <CardHeader title="Ultime giornate" subtitle="Punti e stato" />
        <CardContent>
          {lastPills.length ? (
            <div className="flex flex-wrap gap-2">
              {lastPills.map((p) => (
                <Link
                  key={p.md}
                  to={`/predictions?md=${p.md}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
                >
                  <span className={`h-2 w-2 rounded-full ${pillTone(p.tone)}`} aria-hidden="true" />
                  G{p.md}
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-200">{p.status === "FINISHED" ? `${p.pts} pt` : p.status === "IN_PROGRESS" ? "Live" : "—"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-300">Nessuna giornata disponibile.</div>
          )}
        </CardContent>
      </Card>

      {/* Mini leaderboard */}
      <Card>
        <CardHeader
          title="Mini leaderboard"
          subtitle="Top 5"
          right={
            <Link to="/leaderboard" className="text-xs font-bold text-rose-300 hover:underline">
              Vedi tutto
            </Link>
          }
        />
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : top5.length ? (
            <div className="space-y-2">
              {top5.map((r, idx) => {
                const isMe = r.userId === user?.id;
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : String(idx + 1);
                return (
                  <div
                    key={r.userId}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                      isMe ? "border-rose-400/40 bg-rose-500/10" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-7 text-center text-sm font-extrabold">{medal}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">
                          {r.displayName || "—"}
                          {isMe ? "  (TU)" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-white/10 bg-black/20 px-2 py-1 text-sm font-extrabold text-slate-100">
                      {r.totalPoints}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-300">Nessun dato classifica.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
