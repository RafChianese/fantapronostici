import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, FinalResultResponse, LeagueStatsResponse } from "../lib/api";
import { Activity, Award, Bell, BookOpen, Clapperboard, Flame, Newspaper, Percent, Skull, Snowflake, Sparkles, Star, TrendingUp, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useLock } from "../lib/lock";
import { AchievementsStrip } from "../components/Achievements";
import { UserAvatar } from "../components/Avatar";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton, Spinner } from "../components/ui";

type LeaderRow = { userId: string; totalPoints: number; displayName?: string | null };
type PrizeInfo = { position: number; amountCents?: number | null };

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
    const dd = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    // If more than 24 hours away, show compact days+hours (eg: "1g 5h").
    if (dd >= 1) return `${dd}g ${hh}h`;
    if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`;
    return `${mm}:${pad(ss)}`;
  }, [targetIso, now]);
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
  const [competitionPred, setCompetitionPred] = useState<any>(null);
  const [leader, setLeader] = useState<LeaderRow[]>([]);
  const [prizes, setPrizes] = useState<PrizeInfo[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [leagueStats, setLeagueStats] = useState<LeagueStatsResponse | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResultResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeLeaderRow = (r: any): LeaderRow => {
    // Backward/forward compatible mapping (camelCase or snake_case)
    const userId = String(r?.userId ?? r?.user_id ?? r?.id ?? "");
    const totalPoints = Number(r?.totalPoints ?? r?.total_points ?? r?.points ?? 0);
    const displayName = (r?.displayName ?? r?.display_name ?? r?.name ?? r?.email ?? null) as any;
    return { userId, totalPoints, displayName };
  };

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !activeLeagueId || !leagueCode) return;

    setLoading(true);
    Promise.allSettled([
      api.userSummary(user.id, leagueCode),
      // Leaderboard uses league header; keep leagueCode only for userSummary.
      api.leaderboard("points_desc"),
      api.matches(),
      api.competitionPredictions(),
      api.leagueStats(),
      api.leagueFinalResult(),
    ])
      .then((results) => {
        if (cancelled) return;
        const [summaryRes, leaderboardRes, matchesRes, competitionRes, statsRes, finalRes] = results;

        const s = summaryRes.status === "fulfilled" ? summaryRes.value : null;
        const lb = leaderboardRes.status === "fulfilled" ? leaderboardRes.value : null;
        const m = matchesRes.status === "fulfilled" ? matchesRes.value : null;
        const cp = competitionRes.status === "fulfilled" ? competitionRes.value : null;
        const stats = statsRes.status === "fulfilled" ? statsRes.value : null;
        const finalData = finalRes.status === "fulfilled" ? finalRes.value : null;

        setSummary(s);
        const raw = (lb?.leaderboard ?? lb?.rows ?? []) as any[];
        setLeader(Array.isArray(raw) ? raw.map(normalizeLeaderRow).filter((x) => x.userId) : []);
        const rawPrizes = Array.isArray(lb?.monetization?.prizes) ? lb.monetization.prizes : [];
        setPrizes(
          rawPrizes
            .map((p: any) => ({ position: Number(p?.position || 0), amountCents: p?.amountCents ?? null }))
            .filter((p: PrizeInfo) => p.position > 0)
            .sort((a: PrizeInfo, b: PrizeInfo) => a.position - b.position)
        );
        setMatches(Array.isArray(m?.matches) ? m.matches : []);
        setCompetitionPred(cp ?? null);
        setLeagueStats(stats);
        setFinalResult(finalData);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setLeader([]);
        setPrizes([]);
        setMatches([]);
        setCompetitionPred(null);
        setLeagueStats(null);
        setFinalResult(null);
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
  const recentMatchesScrollRef = useRef<HTMLDivElement | null>(null);

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

  const recentMatchPills = useMemo(() => {
    return (items || [])
      .filter((it: any) => {
        const status = it?.match?.status || it?.status;
        return status === "FINISHED" || status === "IN_PROGRESS";
      })
      .slice()
      .sort((a: any, b: any) => {
        const ak = new Date(a?.match?.kickoffAt || a?.kickoffAt || 0).getTime();
        const bk = new Date(b?.match?.kickoffAt || b?.kickoffAt || 0).getTime();
        return ak - bk;
      })
      .slice(-10)
      .map((it: any) => {
        const status = String(it?.match?.status || it?.status || "NOT_STARTED");
        const total = Number(it?.points?.total ?? 0);
        const exact = Number(it?.points?.exact ?? 0);
        const outcome = Number(it?.points?.outcome ?? 0);
        const sumGoals = Number(it?.points?.sumGoals ?? 0);
        const underOver = Number(it?.points?.underOver ?? 0);
        let tone: "green" | "yellow" | "orange" | "cyan" | "red" | "blue" = "blue";
        if (status === "IN_PROGRESS") tone = "blue";
        if (status === "FINISHED") {
          if (exact > 0) tone = "green";
          else if (outcome > 0) tone = "yellow";
          else if (sumGoals > 0) tone = "orange";
          else if (underOver > 0) tone = "cyan";
          else tone = "red";
        }
        return {
          id: String(it?.match?.id ?? it?.matchId ?? ""),
          md: Number(it?.match?.matchday ?? it?.matchday ?? 0),
          home: String(it?.match?.homeTeam ?? it?.homeTeam ?? ""),
          away: String(it?.match?.awayTeam ?? it?.awayTeam ?? ""),
          status,
          total,
          tone,
        };
      })
      .filter((x: any) => x.id);
  }, [items]);

  useEffect(() => {
    const el = recentMatchesScrollRef.current;
    if (!el || recentMatchPills.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recentMatchPills.length]);

  const allMatchesMeta = useMemo(() => {
    const seen = new Set<string>();
    let predicted = 0;
    let firstKickoff: string | undefined;

    for (const it of items || []) {
      const matchId = String(it?.match?.id ?? it?.matchId ?? "");
      if (matchId) seen.add(matchId);

      const hs = it?.prediction?.homeGoals ?? it?.homeGoals;
      const as = it?.prediction?.awayGoals ?? it?.awayGoals;
      if (hs !== undefined && hs !== null && as !== undefined && as !== null) predicted += 1;

      const ko = it?.match?.kickoffAt;
      const status = it?.match?.status || it?.status;
      if (ko && status === "NOT_STARTED") {
        if (!firstKickoff) firstKickoff = ko;
        else if (new Date(ko).getTime() < new Date(firstKickoff).getTime()) firstKickoff = ko;
      }
    }

    return { totalMatches: seen.size || (items || []).length || 0, predicted, firstKickoff };
  }, [items]);

  const isTournamentPreMode = predictionMode === "TOURNAMENT_PRE";
  const nextMeta = nextEditableMatchday ? matchdayMeta[nextEditableMatchday] : null;
  const progressMeta = isTournamentPreMode ? allMatchesMeta : nextMeta;
  const nextTotal = Math.max(0, Number(progressMeta?.totalMatches || 0));
  const nextDone = Math.min(nextTotal, Math.max(0, Number(progressMeta?.predicted || 0)));
  const nextPct = nextTotal > 0 ? Math.round((nextDone / nextTotal) * 100) : 0;
  const nextCountdown = useCountdown(progressMeta?.firstKickoff);


const tournamentMeta = useMemo(() => {
  const d: any = competitionPred;
  if (!d) return { enabled: false, total: 0, done: 0, pct: 0 };

  const enableWinner = Boolean(
    d?.enabled?.winner ??
    d?.enabled?.competitionWinner ??
    d?.enabledCompetitionWinner ??
    d?.winnerEnabled ??
    d?.competitionWinnerEnabled ??
    d?.rules?.enableCompetitionWinner ??
    d?.leagueRules?.enableCompetitionWinner
  );
  const enableTopScorer = Boolean(
    d?.enabled?.topScorer ??
    d?.enabled?.competitionTopScorer ??
    d?.enabledCompetitionTopScorer ??
    d?.topScorerEnabled ??
    d?.competitionTopScorerEnabled ??
    d?.rules?.enableCompetitionTopScorer ??
    d?.leagueRules?.enableCompetitionTopScorer
  );
  const enableQuarterFinalist = Boolean(
    d?.enabled?.quarterFinalist ??
    d?.enabled?.competitionQuarterFinalist ??
    d?.enabledQuarterFinalist ??
    d?.quarterFinalistEnabled ??
    d?.rules?.enableCompetitionQuarterFinalist ??
    d?.leagueRules?.enableCompetitionQuarterFinalist
  );
  const enableSemiFinalist = Boolean(
    d?.enabled?.semiFinalist ??
    d?.enabled?.competitionSemiFinalist ??
    d?.enabledSemiFinalist ??
    d?.semiFinalistEnabled ??
    d?.rules?.enableCompetitionSemiFinalist ??
    d?.leagueRules?.enableCompetitionSemiFinalist
  );
  const enableFinalist = Boolean(
    d?.enabled?.finalist ??
    d?.enabled?.competitionFinalist ??
    d?.enabledFinalist ??
    d?.finalistEnabled ??
    d?.rules?.enableCompetitionFinalist ??
    d?.leagueRules?.enableCompetitionFinalist
  );

  const total =
    (enableQuarterFinalist ? 1 : 0) +
    (enableSemiFinalist ? 1 : 0) +
    (enableFinalist ? 1 : 0) +
    (enableWinner ? 1 : 0) +
    (enableTopScorer ? 1 : 0);

  const hasQuarterFinalist = Boolean(d?.picks?.quarterFinalist?.teamExternalId ?? d?.picks?.quarterFinalist?.teamId);
  const hasSemiFinalist = Boolean(d?.picks?.semiFinalist?.teamExternalId ?? d?.picks?.semiFinalist?.teamId);
  const hasFinalist = Boolean(d?.picks?.finalist?.teamExternalId ?? d?.picks?.finalist?.teamId);
  const hasWinner = Boolean(d?.picks?.winner?.teamExternalId ?? d?.picks?.winner?.teamId);
  const hasTop = Boolean(d?.picks?.topScorer?.playerExternalId ?? d?.picks?.topScorer?.playerId);
  const done =
    (enableQuarterFinalist && hasQuarterFinalist ? 1 : 0) +
    (enableSemiFinalist && hasSemiFinalist ? 1 : 0) +
    (enableFinalist && hasFinalist ? 1 : 0) +
    (enableWinner && hasWinner ? 1 : 0) +
    (enableTopScorer && hasTop ? 1 : 0);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { enabled: total > 0, total, done, pct };
}, [competitionPred]);

  const recentFinishedMatches = useMemo(() => {
    const arr = Array.isArray(matches) ? matches : [];
    return arr
      .filter((m) => m?.status === "FINISHED")
      .slice()
      .sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime())
      .slice(0, 2);
  }, [matches]);

  const lastFinishedMatchday = useMemo(() => {
    const arr = Array.isArray(matches) ? matches : [];
    const by = new Map<number, any[]>();
    for (const m of arr) {
      const md = Number(m?.matchday || 0);
      if (!md) continue;
      if (!by.has(md)) by.set(md, []);
      by.get(md)!.push(m);
    }
    const finished = Array.from(by.entries())
      .filter(([, ms]) => ms.length > 0 && ms.every((x) => x?.status === "FINISHED"))
      .map(([md]) => md)
      .sort((a, b) => b - a);
    return finished[0] ?? null;
  }, [matches]);

  const prizePositions = useMemo(() => new Set(prizes.map((p) => p.position)), [prizes]);
  const prizeByPosition = useMemo(() => new Map(prizes.map((p) => [p.position, p])), [prizes]);
  const maxPrizePosition = prizes.reduce((max, p) => Math.max(max, p.position), 0);
  const miniLeaderboardLimit = Math.max(5, Math.min(10, maxPrizePosition || 0));
  const top5 = leader.slice(0, miniLeaderboardLimit);
  const formatPrize = (amount?: number | null) =>
    typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? (amount / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })
      : null;

  const finishedMatchesCount = useMemo(() => matches.filter((m) => m?.status === "FINISHED").length, [matches]);
  const remainingMatchesCount = useMemo(() => matches.filter((m) => m?.status !== "FINISHED").length, [matches]);

  const winnerProbabilities = useMemo(() => {
    if (!leader.length) return [] as Array<LeaderRow & { probability: number; gap: number }>;
    const maxPoints = Math.max(...leader.map((r) => Number(r.totalPoints || 0)), 0);
    const matchesLeft = Math.max(remainingMatchesCount, 1);
    const comebackWindow = Math.max(18, matchesLeft * 4);
    const scored = leader.slice(0, Math.min(8, leader.length)).map((r, idx) => {
      const gap = Math.max(0, maxPoints - Number(r.totalPoints || 0));
      const formBoost = Math.max(0, 8 - idx) * 2.4;
      const score = Math.max(1, comebackWindow - gap + formBoost);
      return { ...r, gap, score };
    });
    const total = scored.reduce((sum, r) => sum + r.score, 0) || 1;
    return scored.map((r) => ({ ...r, probability: Math.max(1, Math.round((r.score / total) * 100)) }));
  }, [leader, remainingMatchesCount]);

  const myGrade = useMemo(() => {
    const total = Number(totals?.total || 0);
    const predicted = Math.max(1, items.length);
    const avg = total / predicted;
    const exact = Number(exactHits || 0);
    const positionBoost = myPosition ? Math.max(0, 8 - myPosition) * 0.18 : 0;
    const vote = Math.max(4, Math.min(10, 5 + avg * 0.55 + exact * 0.08 + positionBoost));
    let title = "In rodaggio";
    let text = "Sta prendendo le misure alla lega. Il potenziale c'è, ora servono colpi pesanti.";
    if (vote >= 8.5) {
      title = "Veggente di giornata";
      text = "Prestazione da alta classifica: precisione, sangue freddo e qualche colpo da applausi.";
    } else if (vote >= 7) {
      title = "Molto solido";
      text = "Giornata concreta: pochi fuochi d'artificio, ma tanti punti utili alla causa.";
    } else if (vote < 5.5) {
      title = "Rivedibile";
      text = "Qualche pronostico sembra arrivato da un universo parallelo. Serve una reazione.";
    }
    return { vote: vote.toFixed(1), title, text, exact };
  }, [totals?.total, items.length, exactHits, myPosition]);

  const tgLeague = useMemo(() => {
    type TgTone = "rose" | "cyan" | "emerald" | "amber" | "slate";
    type TgNews = { title: string; text: string; tone: TgTone; icon?: string; badge?: string };
    const news: TgNews[] = [];
    const seen = new Set<string>();
    const add = (item: TgNews) => {
      const key = `${item.title}|${item.text}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      news.push(item);
    };

    const leaderRow = leader[0];
    const second = leader[1];
    const third = leader[2];
    const last = leader[leader.length - 1];
    const myRow = user?.id ? leader.find((r) => r.userId === user.id) : null;
    const prizeCut = Math.max(0, maxPrizePosition || prizes.length || 0);
    const prizeRows = prizeCut ? leader.slice(0, prizeCut) : [];
    const funStats = Array.isArray((leagueStats as any)?.funStats) ? (leagueStats as any).funStats : [];
    const rivalries = Array.isArray((leagueStats as any)?.engagement?.rivalries) ? (leagueStats as any).engagement.rivalries : [];
    const profiles = Array.isArray((leagueStats as any)?.engagement?.profileCards) ? (leagueStats as any).engagement.profileCards : [];

    if (finalResult?.finalized) {
      const winner = finalResult.winners?.[0] || finalResult.leaderboardTop?.[0] || leaderRow;
      add({ title: "Verdetto ufficiale", text: winner ? `${winner.displayName || "Il vincitore"} alza il trofeo: classifica congelata e festa autorizzata.` : "La lega è conclusa: classifica finale disponibile.", tone: "emerald", icon: "🏆", badge: "Finale" });
    }

    if (leaderRow && second) {
      const gap12 = Math.max(0, Number(leaderRow.totalPoints || 0) - Number(second.totalPoints || 0));
      if (gap12 <= 5) {
        add({ title: "Corsa al titolo", text: `${leaderRow.displayName || "Il leader"} è davanti, ma ${second.displayName || "il secondo"} è a soli ${gap12} punti: basta un esatto per ribaltare tutto.`, tone: "rose", icon: "🔥", badge: "Live" });
      } else if (gap12 >= 15) {
        add({ title: "Tentativo di fuga", text: `${leaderRow.displayName || "Il leader"} prova lo strappo con ${gap12} punti di vantaggio su ${second.displayName || "il secondo"}.`, tone: "emerald", icon: "🚀", badge: "Break" });
      } else {
        add({ title: "Podio compatto", text: third ? `Tra primo e terzo ballano ${Math.max(0, Number(leaderRow.totalPoints || 0) - Number(third.totalPoints || 0))} punti: zona alta ancora apertissima.` : `${second.displayName || "Il secondo"} resta in scia a ${gap12} punti.`, tone: "cyan", icon: "📊", badge: "Classifica" });
      }
    } else if (leaderRow) {
      add({ title: "Primo bollettino", text: `${leaderRow.displayName || "Il leader"} guida la lega con ${leaderRow.totalPoints} punti.`, tone: "cyan", icon: "🎙️", badge: "Flash" });
    }

    if (myRow && leaderRow) {
      const gap = Math.max(0, Number(leaderRow.totalPoints || 0) - Number(myRow.totalPoints || 0));
      if (myRow.userId === leaderRow.userId) add({ title: "Pressione addosso", text: `${displayName} è davanti a tutti: ora ogni pronostico pesa doppio.`, tone: "amber", icon: "👑", badge: "Tu" });
      else add({ title: "Missione rimonta", text: `${displayName} è ${myPosition ? `#${myPosition}` : "in classifica"}: la vetta dista ${gap} punti.`, tone: gap <= 10 ? "rose" : "slate", icon: "🎯", badge: "Focus" });
    }

    if (prizeCut && prizeRows.length) {
      const names = prizeRows.map((r) => r.displayName || "Partecipante").slice(0, 3).join(", ");
      add({ title: "Zona premio calda", text: `Al momento la zona premio coinvolge ${names}${prizeRows.length > 3 ? " e altri" : ""}. Dietro si prepara l'assalto.`, tone: "amber", icon: "💰", badge: "Premi" });
    }

    if (recentFinishedMatches[0]) {
      const m: any = recentFinishedMatches[0];
      add({ title: "Ultimo match aggiornato", text: `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}: nuova benzina per la classifica.`, tone: "cyan", icon: "⚽", badge: "Risultato" });
    }

    const hot = profiles.slice().sort((a: any, b: any) => Number(b?.attributes?.precision || b?.totalPoints || 0) - Number(a?.attributes?.precision || a?.totalPoints || 0))[0];
    if (hot?.displayName) add({ title: "Uomo in forma", text: `${hot.displayName} è il nome caldo del momento: precisione e punti stanno facendo rumore.`, tone: "emerald", icon: "📈", badge: "Forma" });

    if (last && leader.length > 1) add({ title: "Zona crisi", text: `${last.displayName || "L'ultimo"} deve cambiare marcia: il torneo concede ancora occasioni per risalire.`, tone: "slate", icon: "🧊", badge: "Flop" });

    const rivalry = rivalries[0];
    if (rivalry) {
      const a = rivalry.a?.displayName || rivalry.home?.displayName || rivalry.userA?.displayName;
      const b = rivalry.b?.displayName || rivalry.away?.displayName || rivalry.userB?.displayName;
      if (a && b) add({ title: "Duello acceso", text: `${a} contro ${b}: rivalità da seguire fino all'ultimo risultato.`, tone: "rose", icon: "🥊", badge: "Derby" });
    }

    const fun = funStats[0];
    const funWinner = fun?.winner || fun?.winners?.[0];
    if (fun?.title && funWinner?.displayName) add({ title: "Statistica curiosa", text: `${funWinner.displayName} si prende il titolo "${fun.title}". Spogliatoio in fermento.`, tone: "cyan", icon: "🧠", badge: "Curiosità" });

    if (remainingMatchesCount > 0 && remainingMatchesCount <= 5) {
      add({ title: "Rush finale", text: `Mancano solo ${remainingMatchesCount} match: vietato sbagliare, ogni pallino può valere una stagione.`, tone: "rose", icon: "⏱️", badge: "Final rush" });
    } else if (finishedMatchesCount > 0) {
      add({ title: "Bilancio torneo", text: `${finishedMatchesCount} match giocati, ${remainingMatchesCount} ancora da vivere: la classifica è tutt'altro che scritta.`, tone: "slate", icon: "📅", badge: "Report" });
    }

    if (!news.length) add({ title: "Lega in riscaldamento", text: "Appena arrivano risultati e pronostici, il TG avrà molto da raccontare.", tone: "slate", icon: "🎙️", badge: "Stand-by" });
    return news.slice(0, 6);
  }, [leader, user?.id, displayName, myPosition, finishedMatchesCount, remainingMatchesCount, leagueStats, recentFinishedMatches, finalResult, maxPrizePosition, prizes.length]);

  const finalDocumentary = useMemo(() => {
    if (!finalResult?.finalized) return null;
    const winner = finalResult.winners?.[0] || finalResult.leaderboardTop?.[0];
    const topExact = leagueStats?.topExactHits;
    const bestDay = leagueStats?.bestMatchday;
    return {
      winner,
      chapters: [
        winner ? `Capitolo finale: ${winner.displayName} chiude davanti a tutti e diventa il volto della lega.` : "Capitolo finale: il torneo è concluso e la classifica è ufficiale.",
        topExact ? `Il cecchino del torneo è ${topExact.displayName}, con ${topExact.value} risultati esatti.` : "La corsa agli esatti ha deciso molte sfide interne.",
        bestDay ? `La giornata ${bestDay.matchday} è stata la più spettacolare: media ${bestDay.avgPoints.toFixed(2)} punti.` : "Ogni giornata ha lasciato il suo segno sulla classifica.",
      ],
    };
  }, [finalResult, leagueStats]);

  const notificationCenter = useMemo(() => {
    const list: Array<{ title: string; text: string; tone: "rose" | "amber" | "cyan" | "emerald" | "slate" }> = [];
    const leaderRow = leader[0];
    const myRow = user?.id ? leader.find((r) => r.userId === user.id) : null;
    const prizeCut = maxPrizePosition || prizes.length || 3;

    if (myRow && myPosition && prizeCut > 0) {
      if (myPosition <= prizeCut) {
        list.push({ title: "Sei in zona premio", text: `Posizione #${myPosition}: al momento sei dentro le posizioni premiate.`, tone: "emerald" });
      } else {
        list.push({ title: "Zona premio nel mirino", text: `Ti mancano ${myPosition - prizeCut} posizioni per entrare nella zona premi.`, tone: "amber" });
      }
    }
    if (recentFinishedMatches[0]) {
      const m = recentFinishedMatches[0];
      list.push({ title: "Ultimo risultato aggiornato", text: `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`, tone: "cyan" });
    }
    if (nextEditableMatchday && canInsert) {
      list.push({ title: "Pronostici aperti", text: `Puoi ancora compilare la giornata ${nextEditableMatchday}.`, tone: "cyan" });
    }
    if (!list.length) list.push({ title: "Nessuna notifica urgente", text: "Appena succede qualcosa nella lega, lo vedrai qui.", tone: "slate" });
    return list.slice(0, 5);
  }, [leader, user?.id, myPosition, maxPrizePosition, prizes.length, recentFinishedMatches, nextEditableMatchday, canInsert]);

  const momentum = useMemo(() => {
    const cards = (leagueStats as any)?.engagement?.profileCards || [];
    if (Array.isArray(cards) && cards.length >= 2) {
      const hot = cards.slice().sort((a: any, b: any) => Number(b?.attributes?.precision || 0) - Number(a?.attributes?.precision || 0))[0];
      const cold = cards.slice().sort((a: any, b: any) => Number(a?.attributes?.precision || 0) - Number(b?.attributes?.precision || 0))[0];
      return {
        hot: hot ? { name: hot.displayName, value: Number(hot?.attributes?.precision || 0), text: "precisione più alta nelle statistiche disponibili" } : null,
        cold: cold ? { name: cold.displayName, value: Number(cold?.attributes?.precision || 0), text: "deve ritrovare continuità" } : null,
      };
    }
    const myPts = lastPills.filter((p) => p.status === "FINISHED").slice(-3).reduce((s, p) => s + Number(p.pts || 0), 0);
    return {
      hot: { name: displayName, value: myPts, text: "punti nelle ultime giornate visibili" },
      cold: null,
    };
  }, [leagueStats, lastPills, displayName]);

  const mvpFlop = useMemo(() => {
    const cards = (leagueStats as any)?.engagement?.profileCards || [];
    if (Array.isArray(cards) && cards.length) {
      const sorted = cards.slice().sort((a: any, b: any) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0));
      const mvp = sorted[0];
      const flop = sorted[sorted.length - 1];
      return {
        mvp: mvp ? { name: mvp.displayName, value: Number(mvp.totalPoints || 0), text: "sta trascinando la lega" } : null,
        flop: flop && flop.userId !== mvp?.userId ? { name: flop.displayName, value: Number(flop.totalPoints || 0), text: "serve una scossa per risalire" } : null,
      };
    }
    return {
      mvp: leader[0] ? { name: leader[0].displayName || "Leader", value: leader[0].totalPoints, text: "miglior punteggio totale" } : null,
      flop: leader.length > 1 ? { name: leader[leader.length - 1].displayName || "Partecipante", value: leader[leader.length - 1].totalPoints, text: "ultimo in classifica, ma il torneo è lungo" } : null,
    };
  }, [leagueStats, leader]);

  const predictionTwin = useMemo(() => {
    const rows = leader.filter((r) => r.userId && r.totalPoints !== null && r.totalPoints !== undefined);
    const me = user?.id ? rows.find((r) => r.userId === user.id) : null;
    const others = me ? rows.filter((r) => r.userId !== me.userId) : [];

    if (!me || !others.length) {
      return { twin: null as any, nemesis: null as any, affinity: 0, ready: false };
    }

    const byDistance = others
      .map((r) => ({ ...r, distance: Math.abs(Number(r.totalPoints || 0) - Number(me.totalPoints || 0)) }))
      .sort((a, b) => a.distance - b.distance);

    const twin = byDistance[0] || null;
    const nemesis = others
      .slice()
      .sort((a, b) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0))
      .find((r) => Number(r.totalPoints || 0) >= Number(me.totalPoints || 0)) || byDistance[byDistance.length - 1] || null;

    const maxSpread = Math.max(1, ...rows.map((r) => Math.abs(Number(r.totalPoints || 0) - Number(me.totalPoints || 0))));
    const affinity = twin ? Math.max(18, Math.round(100 - (Number(twin.distance || 0) / maxSpread) * 72)) : 0;

    return { twin, nemesis, affinity, ready: true };
  }, [leader, user?.id]);

  const Orb = ({ p }: { p: { md: number; pts: number; tone: string; status: string } }) => {
    const ringColor =
      p.tone === "green"
        ? "rgba(16,185,129,0.9)"
        : p.tone === "yellow"
          ? "rgba(251,191,36,0.9)"
          : p.tone === "orange"
            ? "rgba(251,146,60,0.9)"
            : p.tone === "red"
              ? "rgba(244,63,94,0.9)"
              : "rgba(148,163,184,0.7)";
    const fill = p.status === "FINISHED" ? "rgba(0,0,0,0.12)" : p.status === "IN_PROGRESS" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
    const label = p.status === "FINISHED" ? String(p.pts) : p.status === "IN_PROGRESS" ? "LIVE" : "—";
    return (
      <Link
        to={`/predictions?md=${p.md}`}
        className="group relative grid h-[48px] w-[48px] sm:h-[68px] sm:w-[68px] place-items-center rounded-full border border-cyan-100/15 bg-cyan-100/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:bg-cyan-100/10"
        style={{ boxShadow: `0 10px 40px rgba(0,0,0,0.35), inset 0 0 0 2px ${ringColor}` }}
        aria-label={`Giornata ${p.md}`}
      >
        <div className="absolute inset-[4px] sm:inset-[6px] rounded-full" style={{ background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.14), ${fill} 55%, rgba(0,0,0,0.25))` }} />
        <div className="relative z-[1] text-center">
          <div className="text-[10px] sm:text-[11px] font-bold text-cyan-50/70">G{p.md}</div>
          <div className={`mt-0.5 text-[15px] sm:text-base font-extrabold ${p.status === "IN_PROGRESS" ? "text-rose-200" : "text-white"}`}>{label}</div>
        </div>
      </Link>
    );
  };


  const MatchOrb = ({ p }: { p: { id: string; md: number; home: string; away: string; status: string; total: number; tone: string } }) => {
    const ringColor =
      p.tone === "green"
        ? "rgba(16,185,129,0.95)"
        : p.tone === "yellow"
          ? "rgba(251,191,36,0.95)"
          : p.tone === "orange"
            ? "rgba(251,146,60,0.95)"
            : p.tone === "cyan"
              ? "rgba(34,211,238,0.95)"
              : p.tone === "red"
                ? "rgba(244,63,94,0.95)"
                : "rgba(59,130,246,0.85)";
    const home = p.home.slice(0, 3).toUpperCase();
    const away = p.away.slice(0, 3).toUpperCase();
    const label = p.status === "IN_PROGRESS" ? "LIVE" : Number.isInteger(p.total) ? String(p.total) : p.total.toFixed(1);
    return (
      <Link
        to={p.md ? `/predictions?md=${p.md}` : "/predictions"}
        className="group relative grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full border border-cyan-100/15 bg-cyan-100/5 transition hover:-translate-y-0.5 hover:bg-cyan-100/10 sm:h-[70px] sm:w-[70px]"
        style={{ boxShadow: `0 12px 38px rgba(0,0,0,0.35), inset 0 0 0 2px ${ringColor}` }}
        title={`${p.home} - ${p.away}`}
        aria-label={`${p.home} contro ${p.away}`}
      >
        <div className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.16),rgba(255,255,255,0.04)_48%,rgba(0,0,0,0.28))]" />
        <div className="relative z-[1] text-center leading-none">
          <div className="text-[9px] font-black tracking-tight text-cyan-50/85 sm:text-[10px]">{home}</div>
          <div className={`my-1 text-[13px] font-extrabold sm:text-[15px] ${p.status === "IN_PROGRESS" ? "text-blue-100" : "text-white"}`}>{label}</div>
          <div className="text-[9px] font-black tracking-tight text-cyan-50/85 sm:text-[10px]">{away}</div>
        </div>
      </Link>
    );
  };

  if (loading && !summary && leader.length === 0 && matches.length === 0) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center justify-center px-4">
        <div className="tm-glass flex flex-col items-center gap-4 rounded-3xl px-8 py-7 text-center">
          <Spinner />
          <div>
            <div className="text-sm font-extrabold text-white">Caricamento home</div>
            <div className="mt-1 text-xs text-cyan-50/70">Sto recuperando classifica, pronostici e partite.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {approved.length > 1 ? (
        <Card>
          <CardHeader title="Lega" subtitle="Cambia lega" />
          <CardContent>
            <select
              className="w-full rounded-xl border border-cyan-100/15 bg-cyan-950/35 px-3 py-3 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-rose-500/30"
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
                <div className="text-xs font-bold uppercase tracking-wide text-cyan-50/70">{isTournamentPreMode ? "Pronostici partite" : "Prossima giornata"}</div>
                <div className="mt-1 truncate text-2xl font-extrabold tracking-tight text-white">
                  {nextEditableMatchday ? (isTournamentPreMode ? "Tutte le partite" : `Giornata ${nextEditableMatchday}`) : "—"}
                </div>
                <div className="mt-2 text-sm text-cyan-50/85">
                  {nextEditableMatchday ? (
                    <>
                      Pronostici inseriti: <b className="text-white">{nextDone}</b>/{nextTotal || "—"}
                    </>
                  ) : (
                    <>Nessuna giornata pronosticabile.</>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs text-cyan-50/70">Countdown</div>
                <div className="mt-1 inline-flex items-center rounded-xl border border-cyan-100/15 bg-cyan-100/5 px-3 py-2 text-sm font-extrabold">
                  {nextCountdown || "—"}
                </div>
              </div>
            </div>

            {nextEditableMatchday ? (
              <>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="rounded-full bg-cyan-100/10 p-1">
                      <div className="h-2.5 rounded-full bg-rose-500/80 transition-[width]" style={{ width: `${nextPct}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-cyan-50/70">
                      Mancano <b className="text-white">{Math.max(0, nextTotal - nextDone)}</b> match
                    </div>
                  </div>
{/* Compact progress rings: matchday + tournament (if enabled) */}
<div className="flex items-center gap-2">
  <div
    className="relative grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full border border-cyan-100/15 bg-cyan-100/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
    style={{ background: `conic-gradient(rgba(225,29,72,0.95) ${nextPct}%, rgba(255,255,255,0.08) 0)` }}
    title={isTournamentPreMode ? "Pronostici tutte le partite" : "Pronostici giornata"}
  >
    <div className="grid h-[58px] w-[58px] place-items-center rounded-full border border-cyan-100/15 bg-slate-950/50">
      <div className="text-center">
        <div className="text-base font-extrabold text-white">
          {nextDone}/{nextTotal || "—"}
        </div>
        <div className="text-[10px] font-semibold text-cyan-100/60">match</div>
      </div>
    </div>
  </div>

  {tournamentMeta.total > 0 ? (
    <div
      className="relative grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full border border-cyan-100/15 bg-cyan-100/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ background: `conic-gradient(rgba(251,191,36,0.9) ${tournamentMeta.pct}%, rgba(255,255,255,0.08) 0)` }}
      title="Pronostici torneo"
    >
      <div className="grid h-[58px] w-[58px] place-items-center rounded-full border border-cyan-100/15 bg-slate-950/50">
        <div className="text-center">
          <div className="text-base font-extrabold text-white">
            {tournamentMeta.done}/{tournamentMeta.total}
          </div>
          <div className="text-[10px] font-semibold text-cyan-100/60">torneo</div>
        </div>
      </div>
    </div>
  ) : null}
</div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-cyan-50/70">
                    {progressMeta?.firstKickoff ? (
                      <>
                        Prima partita: {new Date(progressMeta.firstKickoff).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </>
                    ) : (
                      <>Prima partita: —</>
                    )}
                  </div>
                  <Link to={isTournamentPreMode ? "/predictions" : `/predictions?md=${nextEditableMatchday}`}>
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
            <div className="shrink-0 rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-2">
              <UserAvatar avatarId={(user as any)?.avatarId} size={64} mode="full" className="rounded-2xl" />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-3">
                <div className="text-[11px] font-semibold text-cyan-100/60">Posizione</div>
                <div className="mt-0.5 text-lg font-extrabold text-white">{loading ? "—" : myPosition ?? "—"}</div>
              </div>
              <div className="rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-3">
                <div className="text-[11px] font-semibold text-cyan-100/60">Punti</div>
                <div className="mt-0.5 text-lg font-extrabold text-white">
                  {loading ? "—" : <AnimatedNumber value={Number(totals?.total ?? 0)} />}
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-3">
                <div className="text-[11px] font-semibold text-cyan-100/60">Giornate</div>
                <div className="mt-0.5 text-lg font-extrabold text-white">{loading ? "—" : playedMatchdays}</div>
              </div>
              <div className="rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-3">
                <div className="text-[11px] font-semibold text-cyan-100/60">Esatti</div>
                <div className="mt-0.5 text-lg font-extrabold text-white">
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

      {/* WOW League Intelligence */}
      <Card>
        <CardHeader
          title="TG della lega"
          subtitle="Commento automatico generato dai dati della classifica"
          right={<Newspaper className="h-5 w-5 text-rose-200" aria-hidden="true" />}
        />
        <CardContent>
          <div className="rounded-3xl border border-rose-200/20 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.20),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-200/25 bg-rose-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-rose-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Edizione flash
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {tgLeague.map((item, idx) => (
                <div key={idx} className={`rounded-2xl border p-3 ${
                  item.tone === "rose" ? "border-rose-200/25 bg-rose-500/10" :
                  item.tone === "emerald" ? "border-emerald-200/25 bg-emerald-500/10" :
                  item.tone === "amber" ? "border-amber-200/25 bg-amber-500/10" :
                  item.tone === "cyan" ? "border-cyan-200/25 bg-cyan-500/10" :
                  "border-cyan-100/15 bg-cyan-100/5"
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-black/25 text-lg" aria-hidden="true">{item.icon || "🎙️"}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-black text-white">{item.title}</div>
                        {item.badge ? <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-50/80">{item.badge}</span> : null}
                      </div>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-cyan-50/78">{item.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader
            title="Pagella automatica"
            subtitle="Voto dinamico sul tuo rendimento"
            right={<Star className="h-5 w-5 text-amber-200" aria-hidden="true" />}
          />
          <CardContent>
            <div className="rounded-3xl border border-amber-200/25 bg-amber-300/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-100/70">{myGrade.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-cyan-50/80">{myGrade.text}</div>
                </div>
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-amber-200/35 bg-black/30 text-2xl font-black text-white">
                  {myGrade.vote}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-cyan-50/75">
                <span className="rounded-full border border-cyan-100/15 bg-cyan-100/5 px-2 py-1">{Number(totals?.total || 0)} punti</span>
                <span className="rounded-full border border-cyan-100/15 bg-cyan-100/5 px-2 py-1">{myGrade.exact} esatti</span>
                <span className="rounded-full border border-cyan-100/15 bg-cyan-100/5 px-2 py-1">#{myPosition || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Probabilità vittoria"
            subtitle="Stima live basata su punti e partite residue"
            right={<Percent className="h-5 w-5 text-cyan-200" aria-hidden="true" />}
          />
          <CardContent>
            {winnerProbabilities.length ? (
              <div className="space-y-2">
                {winnerProbabilities.slice(0, 5).map((r, idx) => (
                  <div key={r.userId} className="rounded-2xl border border-cyan-100/15 bg-cyan-100/5 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-extrabold text-white">{idx + 1}. {r.displayName || "—"}</div>
                      <div className="text-sm font-black text-cyan-100">{r.probability}%</div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-300/80" style={{ width: `${Math.min(100, r.probability)}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-cyan-50/55">Distacco dalla vetta: {r.gap} pt</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-cyan-50/70">Servono dati classifica per calcolare la stima.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Centro notifiche"
            subtitle="Avvisi automatici sulla tua lega"
            right={<Bell className="h-5 w-5 text-cyan-200" aria-hidden="true" />}
          />
          <CardContent>
            <div className="space-y-2">
              {notificationCenter.map((n, idx) => (
                <div
                  key={`${n.title}-${idx}`}
                  className={`rounded-2xl border p-3 ${
                    n.tone === "emerald"
                      ? "border-emerald-200/25 bg-emerald-400/10"
                      : n.tone === "amber"
                        ? "border-amber-200/25 bg-amber-300/10"
                        : n.tone === "rose"
                          ? "border-rose-200/25 bg-rose-400/10"
                          : n.tone === "cyan"
                            ? "border-cyan-200/25 bg-cyan-300/10"
                            : "border-cyan-100/15 bg-cyan-100/5"
                  }`}
                >
                  <div className="text-sm font-black text-white">{n.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-cyan-50/70">{n.text}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Momento forma"
            subtitle="Chi è caldo e chi deve reagire"
            right={<Activity className="h-5 w-5 text-emerald-200" aria-hidden="true" />}
          />
          <CardContent>
            <div className="grid gap-2">
              {momentum.hot ? (
                <div className="rounded-3xl border border-emerald-200/25 bg-emerald-400/10 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-100/80"><Flame className="h-4 w-4" /> In forma</div>
                  <div className="mt-2 text-lg font-black text-white">{momentum.hot.name}</div>
                  <div className="text-sm text-cyan-50/75">{momentum.hot.value} · {momentum.hot.text}</div>
                </div>
              ) : null}
              {momentum.cold ? (
                <div className="rounded-3xl border border-cyan-100/15 bg-cyan-100/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-100/70"><Snowflake className="h-4 w-4" /> In cerca di svolta</div>
                  <div className="mt-2 text-lg font-black text-white">{momentum.cold.name}</div>
                  <div className="text-sm text-cyan-50/75">{momentum.cold.value} · {momentum.cold.text}</div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="MVP / Flop"
            subtitle="Il termometro della lega"
            right={<Award className="h-5 w-5 text-amber-200" aria-hidden="true" />}
          />
          <CardContent>
            <div className="grid gap-2">
              {mvpFlop.mvp ? (
                <div className="rounded-3xl border border-amber-200/25 bg-amber-300/10 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-100/80"><Star className="h-4 w-4" /> MVP</div>
                  <div className="mt-2 text-lg font-black text-white">{mvpFlop.mvp.name}</div>
                  <div className="text-sm text-cyan-50/75">{mvpFlop.mvp.value} punti · {mvpFlop.mvp.text}</div>
                </div>
              ) : null}
              {mvpFlop.flop ? (
                <div className="rounded-3xl border border-rose-200/20 bg-rose-400/10 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-rose-100/75"><Skull className="h-4 w-4" /> Flop ironico</div>
                  <div className="mt-2 text-lg font-black text-white">{mvpFlop.flop.name}</div>
                  <div className="text-sm text-cyan-50/75">{mvpFlop.flop.value} punti · {mvpFlop.flop.text}</div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-1">
        <Card>
          <CardHeader
            title="Gemello pronosticatore"
            subtitle="Affinità e rivalità generate dai dati"
            right={<Users className="h-5 w-5 text-cyan-200" aria-hidden="true" />}
          />
          <CardContent>
            {predictionTwin.twin ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-cyan-200/25 bg-cyan-300/10 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-cyan-100/70">Ti assomiglia</div>
                  <div className="mt-2 text-lg font-black text-white">{predictionTwin.twin.displayName || "Partecipante"}</div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300/80" style={{ width: `${Math.min(100, Math.max(0, predictionTwin.affinity || 0))}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-cyan-50/70">Affinità stimata: {Math.round(predictionTwin.affinity || 0)}%</div>
                </div>
                <div className="rounded-3xl border border-rose-200/20 bg-rose-400/10 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-rose-100/70">Nemesi</div>
                  <div className="mt-2 text-lg font-black text-white">{predictionTwin.nemesis?.displayName || "La classifica"}</div>
                  <div className="mt-1 text-sm leading-relaxed text-cyan-50/75">Il riferimento da superare o da tenere lontano nelle prossime giornate.</div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-cyan-100/15 bg-cyan-100/5 p-4 text-sm leading-relaxed text-cyan-50/75">
                Il gemello pronosticatore verrà mostrato appena la lega avrà almeno due partecipanti con punteggio confrontabile. Nel frattempo qui resta spazio pulito, senza messaggi tecnici.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {finalDocumentary ? (
        <Card>
          <CardHeader
            title="Documentario del torneo"
            subtitle="La storia automatica della lega conclusa"
            right={<Clapperboard className="h-5 w-5 text-purple-200" aria-hidden="true" />}
          />
          <CardContent>
            <div className="rounded-3xl border border-purple-200/25 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_45%),rgba(15,23,42,0.82)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-purple-100">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> La storia di {leagueName}
              </div>
              <div className="space-y-3">
                {finalDocumentary.chapters.map((chapter, idx) => (
                  <div key={idx} className="rounded-2xl border border-cyan-100/15 bg-black/20 p-3 text-sm leading-relaxed text-cyan-50/85">
                    <span className="mr-2 font-black text-white">{idx + 1}.</span>{chapter}
                  </div>
                ))}
              </div>
              {finalDocumentary.winner ? (
                <div className="mt-4 rounded-2xl border border-amber-200/35 bg-amber-300/10 p-3 text-center">
                  <div className="text-xs font-black uppercase tracking-wide text-amber-100/70">Campione</div>
                  <div className="mt-1 text-xl font-black text-white">🏆 {finalDocumentary.winner.displayName}</div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Recent matchdays */}
      <Card>
        <CardHeader title="Ultime giornate" subtitle="Punti e stato" />
        <CardContent>
          {lastPills.length ? (
            <div className="flex w-full items-center justify-between gap-1.5 sm:flex sm:flex-wrap sm:justify-start sm:gap-2">
              {lastPills.map((p) => (
                <Orb key={p.md} p={p as any} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-cyan-50/70">Nessuna giornata disponibile.</div>
          )}
        </CardContent>
      </Card>

      {/* Ultime partite */}
      <Card>
        <CardHeader title="Ultime partite" subtitle="Esito del tuo pronostico sugli ultimi match" />
        <CardContent>
          {recentMatchPills.length ? (
            <div ref={recentMatchesScrollRef} className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {recentMatchPills.map((p) => (
                <MatchOrb key={p.id} p={p as any} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-cyan-50/70">Nessuna partita giocata o live disponibile.</div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-cyan-50/70">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Esatto</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> 1X2</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> Somma</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-300" /> U/O 2.5</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Zero</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Live</span>
          </div>
        </CardContent>
      </Card>

      {/* Ultimi risultati */}
      <Card>
        <CardHeader
          title="Ultimi risultati"
          subtitle="Le ultime partite concluse"
          right={
            <Link
              to={lastFinishedMatchday ? `/predictions?md=${lastFinishedMatchday}` : "/predictions"}
              className="text-xs font-bold text-rose-300 hover:underline"
            >
              Vedi partite
            </Link>
          }
        />
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : recentFinishedMatches.length ? (
            <div className="space-y-2">
              {recentFinishedMatches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-100/15 bg-cyan-100/5 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {m.homeLogo ? (
                          <img src={m.homeLogo} alt="" className="h-7 w-7 rounded-full bg-cyan-100/10 object-contain" />
                        ) : (
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-cyan-100/10 text-xs font-bold text-cyan-50/85">{String(m.homeTeam || "H").slice(0, 1)}</div>
                        )}
                        <div className="min-w-0 truncate text-sm font-semibold text-white">{m.homeTeam}</div>
                      </div>
                      <div className="shrink-0 text-base font-extrabold text-white">{m.homeScore ?? "—"}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {m.awayLogo ? (
                          <img src={m.awayLogo} alt="" className="h-7 w-7 rounded-full bg-cyan-100/10 object-contain" />
                        ) : (
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-cyan-100/10 text-xs font-bold text-cyan-50/85">{String(m.awayTeam || "A").slice(0, 1)}</div>
                        )}
                        <div className="min-w-0 truncate text-sm font-semibold text-white">{m.awayTeam}</div>
                      </div>
                      <div className="shrink-0 text-base font-extrabold text-white">{m.awayScore ?? "—"}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-cyan-100/60">
                      <span className="truncate">{m.group ? String(m.group) : ""}</span>
                      <span className="shrink-0">FT · {new Date(m.kickoffAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-cyan-50/70">Nessun risultato disponibile.</div>
          )}
        </CardContent>
      </Card>

      {/* Mini leaderboard */}
      <Card>
        <CardHeader
          title="Mini leaderboard"
          subtitle={prizes.length ? `Prime ${top5.length} posizioni · ${prizes.length} premi censiti dall'admin` : "Top 5"}
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
                const position = idx + 1;
                const isMe = r.userId === user?.id;
                const isPrizePosition = prizePositions.has(position);
                const prize = prizeByPosition.get(position);
                const prizeLabel = formatPrize(prize?.amountCents);
                const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : String(position);
                return (
                  <Link
                    key={r.userId}
                    to={`/users/${r.userId}`}
                    className={`group block rounded-2xl border px-3 py-2 transition hover:-translate-y-0.5 hover:border-rose-400/40 hover:bg-cyan-100/10 focus:outline-none focus:ring-2 focus:ring-rose-400/40 ${
                      isMe
                        ? "border-rose-400/45 bg-rose-500/10"
                        : isPrizePosition
                          ? "border-amber-200/35 bg-amber-300/10"
                          : "border-cyan-100/15 bg-cyan-100/5"
                    }`}
                    aria-label={`Apri il dettaglio di ${r.displayName || "questo partecipante"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-7 text-center text-sm font-extrabold">{medal}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white group-hover:text-white">
                            {r.displayName || "—"}
                            {isMe ? "  (TU)" : ""}
                          </div>
                          <div className="text-[11px] text-cyan-100/60">Tocca per vedere statistiche e pronostici torneo</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isPrizePosition ? (
                          <div className="hidden rounded-xl border border-amber-200/35 bg-amber-300/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100 sm:block">
                            Premio{prizeLabel ? ` · ${prizeLabel}` : ""}
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-cyan-100/15 bg-black/20 px-2 py-1 text-sm font-extrabold text-white">
                          {r.totalPoints}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-cyan-50/70">Nessun dato classifica.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
