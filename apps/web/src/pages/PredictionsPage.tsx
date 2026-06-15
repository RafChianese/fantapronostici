import React, { useEffect, useMemo, useRef, useState } from "react";
import { Lock, X, Info, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, CompetitionPredictionsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { useToast as useGlobalToast } from "../lib/toast";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input, Skeleton } from "../components/ui";
import { SearchableSelect } from "../components/SearchableSelect";
import { AnimatedNumber } from "../components/AnimatedNumber";

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
  isJolly?: boolean;
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
  pointsScorer?: number;
  totalPoints?: number;
};

type ScorerPickSummary = { matchId: string; playerName: string | null; playerExternalId: string | null };

function StatusDot({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const base = "inline-block h-2.5 w-2.5 rounded-full";
  if (s === "IN_PROGRESS" || s === "LIVE") return <span className={`${base} bg-green-500 animate-pulse`} title="In corso" />;
  if (s === "FINISHED") return <span className={`${base} bg-slate-400`} title="Finita" />;
  if (s === "POSTPONED" || s === "CANCELLED" || s === "CANCELED" || s === "SUSPENDED") return <span className={`${base} bg-orange-500`} title="Rimandata/Annullata" />;
  return <span className={`${base} bg-blue-500`} title="Non iniziata" />;
}

function PredictionsTabs({ tab, setTab }: { tab: "MATCHES" | "TOURNAMENT"; setTab: (t: "MATCHES" | "TOURNAMENT") => void }) {
  return (
    <div className="grid w-full grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <button
        className={`px-4 py-3 text-sm font-semibold transition-all ${tab === "MATCHES" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
        onClick={() => setTab("MATCHES")}
        type="button"
      >
        Partite
      </button>
      <button
        className={`px-4 py-3 text-sm font-semibold transition-all ${tab === "TOURNAMENT" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
        onClick={() => setTab("TOURNAMENT")}
        type="button"
      >
        Pronostici torneo
      </button>
    </div>
  );
}


function CompetitionPredictionsPanel() {
  const { activeLeagueId } = useAuth();
  const [data, setData] = useState<CompetitionPredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [winnerId, setWinnerId] = useState<string>("");
  const [scorerId, setScorerId] = useState<string>("");
  const [quarterId, setQuarterId] = useState<string>("");
  const [semiId, setSemiId] = useState<string>("");
  const [finalistId, setFinalistId] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.competitionPredictions();
      setData(res);
      setWinnerId(res.picks.winner?.teamExternalId ? String(res.picks.winner.teamExternalId) : "");
      setScorerId(res.picks.topScorer?.playerExternalId ? String(res.picks.topScorer.playerExternalId) : "");
      setQuarterId(res.picks.quarterFinalist?.teamExternalId ? String(res.picks.quarterFinalist.teamExternalId) : "");
      setSemiId(res.picks.semiFinalist?.teamExternalId ? String(res.picks.semiFinalist.teamExternalId) : "");
      setFinalistId(res.picks.finalist?.teamExternalId ? String(res.picks.finalist.teamExternalId) : "");
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeLeagueId) {
      setData(null);
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId]);

  const enabled = useMemo(() => {
    const d: any = data;

    const winner = Boolean(
      d?.enabled?.winner ??
        d?.enabled?.competitionWinner ??
        d?.enabled?.competition_winner ??
        d?.enabledCompetitionWinner ??
        d?.enabled_competition_winner ??
        d?.enabledWinner ??
        d?.winnerEnabled ??
        d?.competitionWinnerEnabled ??
        d?.rules?.enableCompetitionWinner ??
        d?.leagueRules?.enableCompetitionWinner
    );

    const topScorer = Boolean(
      d?.enabled?.topScorer ??
        d?.enabled?.competitionTopScorer ??
        d?.enabled?.competition_top_scorer ??
        d?.enabledCompetitionTopScorer ??
        d?.enabled_competition_top_scorer ??
        d?.enabledTopScorer ??
        d?.topScorerEnabled ??
        d?.competitionTopScorerEnabled ??
        d?.rules?.enableCompetitionTopScorer ??
        d?.leagueRules?.enableCompetitionTopScorer
    );

    const quarterFinalist = Boolean(
      d?.enabled?.quarterFinalist ??
        d?.enabled?.competitionQuarterFinalist ??
        d?.enabledQuarterFinalist ??
        d?.quarterFinalistEnabled ??
        d?.rules?.enableCompetitionQuarterFinalist ??
        d?.leagueRules?.enableCompetitionQuarterFinalist
    );

    const semiFinalist = Boolean(
      d?.enabled?.semiFinalist ??
        d?.enabled?.competitionSemiFinalist ??
        d?.enabledSemiFinalist ??
        d?.semiFinalistEnabled ??
        d?.rules?.enableCompetitionSemiFinalist ??
        d?.leagueRules?.enableCompetitionSemiFinalist
    );

    const finalist = Boolean(
      d?.enabled?.finalist ??
        d?.enabled?.competitionFinalist ??
        d?.enabledFinalist ??
        d?.finalistEnabled ??
        d?.rules?.enableCompetitionFinalist ??
        d?.leagueRules?.enableCompetitionFinalist
    );

    return { winner, topScorer, quarterFinalist, semiFinalist, finalist };
  }, [data]);

  const enabledAny = enabled.winner || enabled.topScorer || enabled.quarterFinalist || enabled.semiFinalist || enabled.finalist;
  const canEdit = !!data?.canEdit;

  const deadlineLabel = useMemo(() => {
    if (!data?.deadline) return "";
    try {
      return new Date(data.deadline).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return data.deadline;
    }
  }, [data?.deadline]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const winner = data.options.teams.find((t) => String(t.id) === winnerId);
      const scorer = data.options.scorers.find((s) => String(s.id) === scorerId);
      const quarter = data.options.teams.find((t) => String(t.id) === quarterId);
      const semi = data.options.teams.find((t) => String(t.id) === semiId);
      const finalist = data.options.teams.find((t) => String(t.id) === finalistId);

      await api.saveCompetitionPredictions({
        winnerTeamId: winnerId ? Number(winnerId) : null,
        winnerTeamName: winner?.name ?? null,
        topScorerPlayerId: scorerId ? Number(scorerId) : null,
        topScorerPlayerName: scorer?.name ?? null,
        quarterFinalistTeamId: quarterId ? Number(quarterId) : null,
        quarterFinalistTeamName: quarter?.name ?? null,
        semiFinalistTeamId: semiId ? Number(semiId) : null,
        semiFinalistTeamName: semi?.name ?? null,
        finalistTeamId: finalistId ? Number(finalistId) : null,
        finalistTeamName: finalist?.name ?? null,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tm-page-stack">
      <Card>
        <CardHeader title="Pronostici torneo" subtitle="Vincitore, fasi a eliminazione e capocannoniere" right={<Button variant="secondary" onClick={load}>Aggiorna</Button>} />
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              Caricamento…
            </div>
          ) : null}

          {!loading && error ? <Alert tone="danger">{error}</Alert> : null}

          {!loading && data && !enabledAny && !canEdit ? <Alert>In questa lega i pronostici torneo non sono attivi.</Alert> : null}

          {!loading && data && enabledAny ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 space-y-1">
                <div>
                  <b>Deadline:</b> {deadlineLabel || "(automatica)"}
                </div>
                <div>
                  <b>Modificabile:</b> {canEdit ? "Sì" : "No"}
                </div>
              </div>

              {enabled.quarterFinalist ? (
                <TeamPickSearchableSelect
                  title={`Squadra che arriva ai quarti (+${data.points.quarterFinalist ?? 8} punti)`}
                  value={quarterId}
                  onChange={setQuarterId}
                  teams={data.options.teams}
                  disabled={!canEdit || saving}
                  pointsAwarded={data.picks.quarterFinalist?.pointsAwarded}
                />
              ) : null}

              {enabled.semiFinalist ? (
                <TeamPickSearchableSelect
                  title={`Squadra che arriva in semifinale (+${data.points.semiFinalist ?? 10} punti)`}
                  value={semiId}
                  onChange={setSemiId}
                  teams={data.options.teams}
                  disabled={!canEdit || saving}
                  pointsAwarded={data.picks.semiFinalist?.pointsAwarded}
                />
              ) : null}

              {enabled.finalist ? (
                <TeamPickSearchableSelect
                  title={`Squadra che arriva in finale (+${data.points.finalist ?? 12} punti)`}
                  value={finalistId}
                  onChange={setFinalistId}
                  teams={data.options.teams}
                  disabled={!canEdit || saving}
                  pointsAwarded={data.picks.finalist?.pointsAwarded}
                />
              ) : null}

              {enabled.winner ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Vincitore torneo (+{data.points.winner} punti)</div>
                  <SearchableSelect
                    disabled={!canEdit || saving}
                    value={winnerId}
                    onChange={(v) => setWinnerId(v)}
                    placeholder="Seleziona squadra…"
                    emptyLabel="—"
                    options={data.options.teams
                      .map((t) => ({ value: String(t.id), label: t.name }))
                      .sort((a, b) => a.label.localeCompare(b.label, "it"))}
                  />
                  {data.picks.winner?.pointsAwarded ? <div className="text-xs text-slate-400">Punti assegnati: {data.picks.winner.pointsAwarded}</div> : null}
                </div>
              ) : null}

              {enabled.topScorer ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Capocannoniere (+{data.points.topScorer} punti)</div>
                  <SearchableSelect
                    disabled={!canEdit || saving || (data.options.scorers?.length ?? 0) === 0}
                    value={scorerId}
                    onChange={(v) => setScorerId(v)}
                    placeholder="Seleziona giocatore…"
                    emptyLabel="—"
                    options={data.options.scorers
                      .map((s) => ({ value: String(s.id), label: `${s.name}${s.teamName ? ` (${s.teamName})` : ""}` }))
                      .sort((a, b) => a.label.localeCompare(b.label, "it"))}
                  />
                  {(data.options.scorers?.length ?? 0) === 0 ? <Alert>Lista giocatori non disponibile per questa competizione.</Alert> : null}
                  {data.picks.topScorer?.pointsAwarded ? <div className="text-xs text-slate-400">Punti assegnati: {data.picks.topScorer.pointsAwarded}</div> : null}
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button onClick={save} disabled={!canEdit || saving}>
                  {saving ? "Salvo…" : "Salva"}
                </Button>
                {!canEdit ? <span className="text-xs text-slate-400 self-center">Scelte bloccate dopo la deadline.</span> : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamPickSearchableSelect({
  title,
  value,
  onChange,
  teams,
  disabled,
  pointsAwarded,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  teams: Array<{ id: number; name: string }>;
  disabled: boolean;
  pointsAwarded?: number | null;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <SearchableSelect
        disabled={disabled}
        value={value}
        onChange={onChange}
        placeholder="Seleziona squadra…"
        emptyLabel="—"
        options={teams
          .map((t) => ({ value: String(t.id), label: t.name }))
          .sort((a, b) => a.label.localeCompare(b.label, "it"))}
      />
      {pointsAwarded ? <div className="text-xs text-slate-400">Punti assegnati: {pointsAwarded}</div> : null}
    </div>
  );
}

function buildBreakdown(p: PredictionState, underOverEnabled: boolean) {
  const parts: string[] = [];
  if ((p.pointsExact ?? 0) > 0) parts.push(`Esatto ${p.pointsExact}`);
  if ((p.pointsOutcome ?? 0) > 0) parts.push(`1X2 ${p.pointsOutcome}`);
  if ((p.pointsSumGoals ?? 0) > 0) parts.push(`Somma ${p.pointsSumGoals}`);
  if (underOverEnabled && (p.pointsUnderOver ?? 0) > 0) parts.push(`2.5 ${(p.pointsUnderOver ?? 0)}`);
  if ((p.pointsScorer ?? 0) > 0) parts.push(`Marcatore ${p.pointsScorer}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function PredictionsPage() {
  const [searchParams] = useSearchParams();
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [matches, setMatches] = useState<Match[]>([]);
  const [preds, setPreds] = useState<Record<string, PredictionState>>({});
  const [scorerPickByMatchId, setScorerPickByMatchId] = useState<Map<string, ScorerPickSummary>>(new Map());
  const [config, setConfig] = useState<any>(null);
  // Keep a stable reference for timers/callbacks to avoid stale closures (and prevent runtime ReferenceError).
  const configRef = useRef<any>(null);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveHint, setSaveHint] = useState<string>("");
  const globalToast = useGlobalToast();
  const lastSavedToastAtRef = useRef<number>(0);

  // Simple in/out transition when switching match in match-by-match mode.
  const [matchEnter, setMatchEnter] = useState(true);
  const matchEnterTimerRef = useRef<any>(null);
  // Mobile UX: swipe left/right to change match.
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailTab, setDetailTab] = useState<"summary" | "lineups">("summary");

  const [tab, setTab] = useState<"MATCHES" | "TOURNAMENT">("MATCHES");
  const [uiMode, setUiMode] = useState<"MATCH" | "LIST">(() => {
    try {
      const v = localStorage.getItem("tm_preds_view");
      return v === "LIST" ? "LIST" : "MATCH";
    } catch {
      return "MATCH";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("tm_preds_view", uiMode);
    } catch {
      // ignore
    }
  }, [uiMode]);

  const [selectedMatchday, setSelectedMatchday] = useState<number>(1);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const quickPicks = useMemo(
    () =>
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [1, 0],
        [2, 0],
        [2, 1],
        [3, 0],
        [3, 1],
        [3, 2],
        [4, 3],
        [4, 2],
        [0, 1],
        [0, 2],
        [1, 2],
        [0, 3],
        [1, 3],
        [2, 3],
        [3, 4],
        [2, 4],
      ] as const,
    []
  );


  const autosaveTimerRef = useRef<number | null>(null);
  const predsRef = useRef<Record<string, PredictionState>>({});
  // Snapshot of the last server-synced predictions. Used to detect edits on locked matches.
  const baselinePredsRef = useRef<Record<string, { homeGoals?: number; awayGoals?: number }>>({});
  const matchByIdRef = useRef<Map<string, Match>>(new Map());
  const isLockedRef = useRef<boolean>(false);
  const autosaveInitializedRef = useRef(false);
  const initialCollapseSetRef = useRef(false);
  const hasAutoScrolledRef = useRef(false);

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
      // Update baseline snapshot (server truth) to avoid stale "locked prediction" warnings.
      const base: Record<string, { homeGoals?: number; awayGoals?: number }> = {};
      for (const pr of (p.predictions as PredictionState[])) {
        base[pr.matchId] = { homeGoals: (pr as any).homeGoals, awayGoals: (pr as any).awayGoals };
      }
      baselinePredsRef.current = base;
      const picks = ((p as any).scorerPicks || []) as ScorerPickSummary[];
      setScorerPickByMatchId(new Map(picks.map((x) => [x.matchId, x])));
      setConfig(c);
    } catch (e: any) {
      setToast({ tone: "danger", msg: e.message });
    } finally {
      setLoading(false);
      if (!silent) hide();
    }
  };

  const openDetail = async (matchId: string) => {
    setDetailOpen(true);
    setDetailMatchId(matchId);
    setDetailTab("summary");
    setDetailLoading(true);
    setDetailData(null);
    setDetailPlayerId(null);
    try {
      const d = await api.matchDetail(matchId);
      setDetailData(d);
      const sel = d?.scorer?.playerExternalId ? String(d.scorer.playerExternalId) : "";
      const m = sel.match(/^(?:afp:|fdp:)?(\d+)$/i);
      setDetailPlayerId(m ? Number(m[1]) : null);
    } catch (e: any) {
      setToast({ tone: "danger", msg: e?.message || "Errore" });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailMatchId(null);
    setDetailData(null);
    setDetailPlayerId(null);
    setDetailSaving(false);
    setDetailTab("summary");
  };

  const renderLineups = (lineups: any[]) => {
    const teams = Array.isArray(lineups) ? lineups : [];
    if (!teams.length) {
      return <div className="text-sm text-slate-400">Formazioni non disponibili.</div>;
    }

    const PlayerRow = ({ p }: { p: any }) => {
      const num = Number.isFinite(Number(p?.number)) ? String(p.number) : "";
      const pos = typeof p?.position === "string" && p.position ? p.position : "";
      return (
        <div className="flex items-center justify-between gap-3 py-1 text-sm">
          <div className="min-w-0 truncate font-medium text-slate-200">
            {num ? (
              <span className="mr-2 inline-flex w-7 justify-center rounded-md bg-white/10 px-1 py-0.5 text-xs font-bold text-slate-300">{num}</span>
            ) : null}
            <span className="truncate">{p?.name || "—"}</span>
          </div>
          <div className="shrink-0 text-xs font-semibold text-slate-400">{pos}</div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        {teams.map((t, idx) => {
          const teamName = t?.team?.name || "Team";
          const logo = t?.team?.logo || null;
          const startXI = Array.isArray(t?.startXI) ? t.startXI : [];
          const subs = Array.isArray(t?.substitutes) ? t.substitutes : [];
          return (
            <div key={idx} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2">
                {logo ? <img src={logo} alt={teamName} className="h-7 w-7 rounded-full object-contain" /> : null}
                <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{teamName}</div>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-400">Titolari</div>
                <div className="mt-1 divide-y divide-slate-100">
                  {startXI.length ? startXI.map((p: any, i: number) => <PlayerRow key={i} p={p} />) : <div className="py-2 text-sm text-slate-400">—</div>}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-400">Panchina</div>
                <div className="mt-1 divide-y divide-slate-100">
                  {subs.length ? subs.map((p: any, i: number) => <PlayerRow key={i} p={p} />) : <div className="py-2 text-sm text-slate-400">—</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderEventsSummary = (events: any[]) => {
    const items = Array.isArray(events) ? events : [];
    if (!items.length) return <div className="text-sm text-slate-400">Nessun evento disponibile.</div>;

    const normalizeMinute = (ev: any) => {
      const m = Number(ev?.minute);
      if (Number.isFinite(m)) return m;
      const elapsed = Number(ev?.time?.elapsed);
      const extra = Number(ev?.time?.extra);
      if (Number.isFinite(elapsed)) return elapsed + (Number.isFinite(extra) ? extra : 0);
      return null;
    };

    const fmtMinute = (ev: any) => {
      const m = Number(ev?.minute);
      if (Number.isFinite(m)) return `${m}'`;
      const elapsed = ev?.time?.elapsed;
      if (elapsed) return `${elapsed}${ev?.time?.extra ? `+${ev.time.extra}` : ""}'`;
      return "";
    };

    const firstHalf: any[] = [];
    const secondHalf: any[] = [];
    for (const ev of items) {
      const m = normalizeMinute(ev);
      if (m !== null && m <= 45) firstHalf.push(ev);
      else secondHalf.push(ev);
    }

    const Icon = ({ type }: { type: string }) => {
      if (type === "GOAL") return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-xs">⚽</span>;
      if (type === "CARD") return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-xs">🟨</span>;
      if (type === "SUBSTITUTION") return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/15 text-xs">🔁</span>;
      return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs">•</span>;
    };

    const Row = ({ ev, idx }: { ev: any; idx: number }) => {
      const team = ev?.team?.name || ev?.team || "";
      const player = ev?.player?.name || ev?.player || "";
      const assist = ev?.assist?.name || ev?.assist || "";
      const detail = ev?.detail || ev?.type || "";
      const right = fmtMinute(ev);
      return (
        <li key={idx} className="flex items-start justify-between gap-3 text-sm">
          <div className="flex min-w-0 gap-2">
            <Icon type={String(ev?.type || "")} />
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-200">{detail || "Evento"}</div>
              <div className="truncate text-xs text-slate-400">
                {team}{player ? ` · ${player}` : ""}{assist ? ` → ${assist}` : ""}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-xs font-semibold text-slate-400">{right}</div>
        </li>
      );
    };

    const Section = ({ title, rows }: { title: string; rows: any[] }) => (
      <div>
        <div className="text-xs font-semibold text-slate-400">{title}</div>
        <ul className="mt-2 space-y-2">
          {rows.map((ev, idx) => (
            <Row key={idx} ev={ev} idx={idx} />
          ))}
        </ul>
      </div>
    );

    return (
      <div className="space-y-5">
        {firstHalf.length ? <Section title="1 TEMPO" rows={firstHalf} /> : null}
        {secondHalf.length ? <Section title="2 TEMPO" rows={secondHalf} /> : null}
      </div>
    );
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
    let timer: any = null;
    let inflight: Promise<void> | null = null;

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

    const scheduleNext = (next?: any) => {
      if (timer) clearTimeout(timer);

      const iso = next?.lock?.lockUntil;
      const t = iso ? new Date(iso).getTime() : NaN;
      const now = Date.now();

      // Default slow cadence: reduce pressure on /api/lock and DB.
      let ms = 60_000;
      if (Number.isFinite(t)) {
        const delta = t - now;
        // If a lock boundary is near (<=2min), schedule just after it.
        if (delta > 0 && delta <= 120_000) ms = Math.max(750, delta + 350);
      }

      timer = setTimeout(() => {
        if (!cancelled) runOnce();
      }, Math.min(ms, 2_147_483_600));
    };

    const runOnce = async () => {
      if (inflight) return inflight;
      inflight = (async () => {
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
            if (next?.lock?.isLocked) { /* toast rimosso su richiesta */ }
          } else {
            // Still update config to keep countdown accurate.
            setConfig(next);
          }

          scheduleExactRefreshAt(next?.lock?.lockUntil);
          scheduleNext(next);
        } catch {
          // ignore polling errors but keep slow retry cadence
          scheduleNext(configRef.current);
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") runOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // First run + schedule
    runOnce();
    scheduleNext(configRef.current);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId]);

  const hasAnyPrediction = useMemo(() => {
    // A prediction is considered "present" only if the user has set BOTH scores for at least one match.
    return Object.values(preds).some((p) => Number.isInteger(p.homeGoals) && Number.isInteger(p.awayGoals));
  }, [preds]);

  const hasLockedPrediction = useMemo(() => {
    // Defensive: if someone re-enables inputs via devtools, block saving if any entered prediction belongs to a locked match.
    // IMPORTANT UX: do NOT warn for historical (already-saved) locked predictions.
    // Warn only if the user has *edited* a locked match compared to the last server snapshot.
    const baseline = baselinePredsRef.current;
    for (const [matchId, p] of Object.entries(preds)) {
      if (!Number.isInteger(p.homeGoals) || !Number.isInteger(p.awayGoals)) continue;
      if (!isMatchLocked(matchById.get(matchId))) continue;
      const b = baseline[matchId];
      const changed = !b || b.homeGoals !== p.homeGoals || b.awayGoals !== p.awayGoals;
      if (changed) return true;
    }
    return false;
  }, [preds, matchById, isLocked]);

  const byMatchday = useMemo(() => {
    const requestedMdRaw = searchParams.get("md");
    const requestedMd = requestedMdRaw ? Number(requestedMdRaw) : null;
    const requestedMdIsValid = typeof requestedMd === "number" && Number.isFinite(requestedMd) && requestedMd > 0;

    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const md = Number(m.matchday || 1);
      if (!map.has(md)) map.set(md, []);
      map.get(md)!.push(m);
    }
    const all = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

    const mode = (config?.leagueSettings?.predictionMode as any) || "MATCHDAY_BY_MATCHDAY";
    // If the league is configured for "Tutti prima del torneo" (lock all matchdays),
    // allow navigating/selecting ANY matchday from "I miei pronostici".
    if (mode === "TOURNAMENT_PRE" || config?.lock?.lockAll) return all;

    // If the Home "Ultime 5 giornate" dots link passed a matchday (?md=...), show exactly that matchday.
    if (requestedMdIsValid) {
      const only = all.filter(([md]) => md === requestedMd);
      return only.length ? only : all.slice(0, 1);
    }

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
  }, [matches, config?.leagueSettings?.predictionMode, searchParams]);

  // When opening a specific matchday via ?md=, ensure it's expanded and we re-run the scroll effect.
  useEffect(() => {
    const raw = searchParams.get("md");
    const md = raw ? Number(raw) : null;
    if (!(typeof md === "number" && Number.isFinite(md) && md > 0)) return;
    if (!byMatchday.length) return;

    initialCollapseSetRef.current = false;
    hasAutoScrolledRef.current = false;

    setCollapsed(() => {
      const next: Record<number, boolean> = {};
      for (const [x] of byMatchday) next[x] = x !== md;
      return next;
    });
  }, [searchParams, byMatchday]);

  const orderedMatches = useMemo(() => byMatchday.flatMap(([, ms]) => ms), [byMatchday]);

  const focusMatch = useMemo(() => {
    if (!orderedMatches.length) return null;
    const now = Date.now();
    const byKickoff = [...orderedMatches].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

    // Preferred UX: first match that still has to start. If everything has already started,
    // jump to the first live match. If the tournament/day is over, jump to the last finished match.
    const firstUpcoming = byKickoff.find((m) => m.status === "NOT_STARTED" && new Date(m.kickoffAt).getTime() > now);
    if (firstUpcoming) return firstUpcoming;

    const firstLive = byKickoff.find((m) => m.status === "IN_PROGRESS");
    if (firstLive) return firstLive;

    const lastFinished = [...byKickoff].reverse().find((m) => m.status === "FINISHED");
    return lastFinished || byKickoff[0] || null;
  }, [orderedMatches]);

  const focusMatchday = (focusMatch?.matchday ?? byMatchday[0]?.[0] ?? 1) as number;
  const firstNotFinishedMatchday = focusMatchday;

  // Selected matchday used by the "match-by-match" UI.
  useEffect(() => {
    const raw = searchParams.get("md");
    const md = raw ? Number(raw) : null;
    const mdValid = typeof md === "number" && Number.isFinite(md) && md > 0;
    const next = mdValid ? md : focusMatchday;
    setSelectedMatchday((prev) => (prev === next ? prev : next));
  }, [searchParams, focusMatchday]);

  const currentMatches = useMemo(() => {
    const entry = byMatchday.find(([md]) => md === selectedMatchday);
    return (entry?.[1] ?? []) as Match[];
  }, [byMatchday, selectedMatchday]);

  useEffect(() => {
    // Keep index in range when changing matchday or when matches reload.
    // On first load/default navigation, land directly on the first useful match.
    setCurrentIndex((i) => {
      if (focusMatch && Number(focusMatch.matchday) === Number(selectedMatchday)) {
        const focusIndex = currentMatches.findIndex((m) => m.id === focusMatch.id);
        if (focusIndex >= 0) return focusIndex;
      }
      const max = Math.max(0, currentMatches.length - 1);
      return Math.min(i, max);
    });
  }, [currentMatches, selectedMatchday, focusMatch?.id]);

  // Compute current match BEFORE any hook dependency tries to read it.
  // Dependency arrays are evaluated during render, so referencing a const
  // declared later can throw a TDZ runtime error in production builds.
  const currentMatch = currentMatches[currentIndex] ?? null;
  const currentPred = currentMatch ? preds[currentMatch.id] : undefined;
  const canEditCurrent = currentMatch ? !isMatchLocked(currentMatch) : false;

  useEffect(() => {
    // Trigger a small transition when the current match changes.
    if (matchEnterTimerRef.current) window.clearTimeout(matchEnterTimerRef.current);
    setMatchEnter(false);
    matchEnterTimerRef.current = window.setTimeout(() => setMatchEnter(true), 10);
    return () => {
      if (matchEnterTimerRef.current) window.clearTimeout(matchEnterTimerRef.current);
    };
  }, [currentMatch?.id]);

  const underOverEnabled = !!config?.features?.underOver25;

  const clamp20 = (raw: string) => {
    const v = raw.replace(/\D/g, "");
    if (v === "") return undefined;
    const n = Math.min(20, Number(v));
    return Number.isFinite(n) ? n : undefined;
  };

  const hasCompleteScore = (p?: { homeGoals?: number; awayGoals?: number }) =>
    Number.isInteger(p?.homeGoals) && Number.isInteger(p?.awayGoals);

  const scheduleAutosaveIfComplete = (p?: { homeGoals?: number; awayGoals?: number }) => {
    if (hasCompleteScore(p)) scheduleAutosave();
  };

  const setCurrentScore = (side: "home" | "away", raw: string) => {
    if (!currentMatch) return;
    const v = clamp20(raw);
    setPreds((prev) => {
      const existing = prev[currentMatch.id] ?? { matchId: currentMatch.id };
      const next =
        side === "home" ? { ...existing, homeGoals: v } : { ...existing, awayGoals: v };
      scheduleAutosaveIfComplete(next);
      return { ...prev, [currentMatch.id]: next };
    });
  };

  const setCurrentScorePair = (home: number, away: number) => {
    if (!currentMatch) return;
    setPreds((prev) => {
      const existing = prev[currentMatch.id] ?? { matchId: currentMatch.id };
      const next = { ...existing, homeGoals: home, awayGoals: away };
      return { ...prev, [currentMatch.id]: next };
    });
    scheduleAutosave();
  };

  const currentDerived = useMemo(() => {
    if (!currentMatch) return null;
    const p = currentPred;
    if (!Number.isInteger(p?.homeGoals) || !Number.isInteger(p?.awayGoals)) return null;
    const h = p!.homeGoals as number;
    const a = p!.awayGoals as number;
    const outcome = h > a ? "1" : h < a ? "2" : "X";
    const sumGoals = h + a;
    const underOver = sumGoals > 2.5 ? "Over" : "Under";
    return { outcome, sumGoals, underOver };
  }, [currentMatch, currentPred]);

  const currentReal = useMemo(() => {
    if (!currentMatch) return "—";
    return currentMatch.homeScore !== null && currentMatch.awayScore !== null ? `${currentMatch.homeScore}-${currentMatch.awayScore}` : "—";
  }, [currentMatch]);


  useEffect(() => {
    // UX: open ONLY the matchday that contains the first useful match.
    // (User can still expand/collapse manually after.)
    if (!byMatchday.length) return;
    if (initialCollapseSetRef.current) return;
    initialCollapseSetRef.current = true;
    setCollapsed(() => {
      const next: Record<number, boolean> = {};
      for (const [md] of byMatchday) next[md] = md !== focusMatchday;
      return next;
    });
  }, [byMatchday, focusMatchday]);

  useEffect(() => {
    if (loading) return;
    if (hasAutoScrolledRef.current) return;
    if (!byMatchday.length) return;

    const matchday = focusMatchday;
    if (!matchday) return;

    hasAutoScrolledRef.current = true;
    // Allow the DOM to paint before attempting to scroll.
    setTimeout(() => {
      const matchEl = focusMatch ? document.getElementById(`match-${focusMatch.id}`) : null;
      const dayEl = document.getElementById(`matchday-${matchday}`);
      (matchEl || dayEl)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [loading, byMatchday, focusMatch?.id, focusMatchday]);

  const runAutosave = async () => {
    if (autosaveInitializedRef.current === false) autosaveInitializedRef.current = true;

    const snapshot = predsRef.current;
    const matchMap = matchByIdRef.current;

    // Only save complete predictions.
    const items = Object.entries(snapshot)
      .filter(([, p]) => Number.isInteger(p.homeGoals) && Number.isInteger(p.awayGoals))
      .map(([matchId, p]) => ({ matchId, homeGoals: p.homeGoals as number, awayGoals: p.awayGoals as number }));

    if (!items.length) return;

    // IMPORTANT: do NOT include locked/finished matches in the payload.
    // Otherwise a single old prediction (e.g. previous matchday) would block saving the new ones.
    const editableItems = items.filter((it) => !isMatchLocked(matchMap.get(it.matchId)));
    if (!editableItems.length) return;

    setSaving(true);
    setSaveHint("Salvataggio…");
    try {
      await api.savePredictions(editableItems);
      setSaveHint("Salvato ✅");

      // Toast (throttled): users want certainty that the prediction was saved.
      const now = Date.now();
      if (now - lastSavedToastAtRef.current > 4500) {
        lastSavedToastAtRef.current = now;
        globalToast.push({ tone: "success", msg: "Pronostici salvati", ttlMs: 2200 });
      }
      // Reload from API to ensure UI is consistent with server.
      const p = await api.myPredictions();
      const map: Record<string, PredictionState> = {};
      for (const pr of (p.predictions as PredictionState[])) map[(pr as any).matchId] = pr;
      // Preserve local incomplete edits that were intentionally not sent to the backend yet.
      for (const [matchId, local] of Object.entries(snapshot)) {
        if (!Number.isInteger(local.homeGoals) || !Number.isInteger(local.awayGoals)) {
          map[matchId] = local as PredictionState;
        }
      }
      setPreds(map);
      // Refresh baseline after a successful save.
      const base: Record<string, { homeGoals?: number; awayGoals?: number }> = {};
      for (const pr of (p.predictions as PredictionState[])) {
        base[(pr as any).matchId] = { homeGoals: (pr as any).homeGoals, awayGoals: (pr as any).awayGoals };
      }
      baselinePredsRef.current = base;
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

      <div className="flex items-center justify-between">
        <PredictionsTabs tab={tab} setTab={setTab} />
      </div>

      {tab === "TOURNAMENT" ? <CompetitionPredictionsPanel /> : null}

      {tab === "MATCHES" ? (
        <>
          <div className="mt-2 flex items-center justify-end gap-2">
            <div className="group relative">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-200 hover:bg-white/5"
                aria-label="Info modalità"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="pointer-events-none absolute right-0 top-11 z-40 hidden w-64 rounded-2xl border border-white/10 bg-slate-950/90 p-3 text-xs text-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl group-hover:block">
                <div className="font-semibold text-slate-100">Modalità inserimento</div>
                <div className="mt-1 text-slate-300">Match per match: scorri una partita alla volta (consigliato su mobile). Lista: vedi tutte le partite della giornata.</div>
              </div>
            </div>

            <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-slate-950">
              <button
                type="button"
                className={`px-3 py-2 text-sm font-semibold transition-all ${uiMode === "MATCH" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
                onClick={() => setUiMode("MATCH")}
              >
                Match
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm font-semibold transition-all ${uiMode === "LIST" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
                onClick={() => setUiMode("LIST")}
              >
                Lista
              </button>
            </div>
          </div>

          {uiMode === "MATCH" && byMatchday.length ? (
            <Card>
              <CardHeader title="Giornata" subtitle="Seleziona la giornata su cui inserire i pronostici." />
              <CardContent>
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                  value={String(selectedMatchday)}
                  onChange={(e) => {
                    const md = Number(e.target.value);
                    setSelectedMatchday(md);
                    setCurrentIndex(0);
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("md", String(md));
                      return next;
                    });
                  }}
                >
                  {byMatchday.map(([md, ms]) => (
                    <option key={md} value={String(md)}>
                      Giornata {md} · {ms.length} partite{md === firstNotFinishedMatchday ? "  ★" : ""}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          ) : null}

          {uiMode === "MATCH" ? (
            <Card className="overflow-hidden border-white/10">
              <div
                className="text-white"
                style={{
                  backgroundImage:
                    "radial-gradient(1200px 520px at 50% -10%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(900px 420px at 15% 35%, rgba(46,196,182,0.18), transparent 60%), radial-gradient(900px 420px at 85% 35%, rgba(239,68,68,0.18), transparent 60%), linear-gradient(180deg, #020617 0%, #0b1220 45%, #020617 100%)",
                }}
              >
                <div className="px-4 py-4 sm:px-6 sm:py-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-300">Giornata {selectedMatchday}</div>
                      <div className="mt-1 text-lg font-extrabold">Indovina il risultato</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-300">
                        {currentMatch ? new Date(currentMatch.kickoffAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold">
                        {currentMatches.length ? currentIndex + 1 : 0}/{currentMatches.length}
                      </div>
                    </div>
                  </div>

                  {/* Progress dots (tap to jump) */}
                  {currentMatches.length ? (
                    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                      {currentMatches.map((m, idx) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setCurrentIndex(idx)}
                          title={`${idx + 1}. ${m.homeTeam} - ${m.awayTeam}`}
                          className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${idx === currentIndex ? "bg-rose-400 ring-2 ring-rose-300/30" : "bg-white/15 hover:bg-white/25"}`}
                        />
                      ))}
                    </div>
                  ) : null}

                  {currentMatch ? (() => {
                    const exactHitCurrent = Number(currentPred?.pointsExact ?? 0) > 0;
                    const hasMatchPointsCurrent = Number(currentPred?.totalPoints ?? 0) > 0;
                    const statusCardClass = currentMatch.status === "FINISHED"
                      ? "border border-slate-400/25 bg-[linear-gradient(180deg,rgba(148,163,184,0.18),rgba(15,23,42,0.48))] shadow-[0_18px_40px_rgba(15,23,42,0.25)]"
                      : currentMatch.status === "IN_PROGRESS"
                      ? "border border-emerald-300/30 bg-[linear-gradient(180deg,rgba(16,185,129,0.20),rgba(15,23,42,0.45))] shadow-[0_18px_40px_rgba(6,95,70,0.22)]"
                      : "border border-sky-300/25 bg-[linear-gradient(180deg,rgba(56,189,248,0.18),rgba(15,23,42,0.45))] shadow-[0_18px_40px_rgba(14,116,144,0.16)]";
                    const currentCardClass = exactHitCurrent
                      ? "border border-emerald-300/35 bg-[linear-gradient(180deg,rgba(16,185,129,0.24),rgba(15,23,42,0.42))] shadow-[0_0_0_1px_rgba(16,185,129,0.14),0_18px_40px_rgba(6,95,70,0.30)]"
                      : currentMatch.isJolly
                      ? "border border-amber-300/30 bg-[linear-gradient(180deg,rgba(251,191,36,0.20),rgba(15,23,42,0.45))] shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_18px_40px_rgba(120,53,15,0.35)]"
                      : statusCardClass;
                    return <div
                      className={`mt-4 rounded-2xl p-4 sm:p-5 transition-all duration-200 ${currentCardClass} ${matchEnter ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
                      onTouchStart={(e) => {
                        const t = e.touches?.[0];
                        if (!t) return;
                        swipeStartXRef.current = t.clientX;
                        swipeStartYRef.current = t.clientY;
                      }}
                      onTouchEnd={(e) => {
                        const startX = swipeStartXRef.current;
                        const startY = swipeStartYRef.current;
                        swipeStartXRef.current = null;
                        swipeStartYRef.current = null;
                        if (startX === null || startY === null) return;
                        const t = e.changedTouches?.[0];
                        if (!t) return;
                        const dx = t.clientX - startX;
                        const dy = t.clientY - startY;
                        // Ignore vertical scroll gestures.
                        if (Math.abs(dy) > Math.abs(dx)) return;
                        const threshold = 48;
                        if (dx <= -threshold) {
                          // swipe left => next
                          setCurrentIndex((i) => Math.min(currentMatches.length - 1, i + 1));
                        } else if (dx >= threshold) {
                          // swipe right => previous
                          setCurrentIndex((i) => Math.max(0, i - 1));
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <span>{currentMatch.status === "NOT_STARTED" ? "Non iniziata" : currentMatch.status === "IN_PROGRESS" ? "In corso" : "Terminata"}</span>
                          {currentMatch.isJolly ? (
                            <span className="inline-flex items-center gap-1 rounded-xl border border-amber-300/35 bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.12)]">
                              ⭐ Partita Jolly
                            </span>
                          ) : null}
                        </div>
                        <div className="inline-flex items-center gap-2">
                          {!canEditCurrent ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100">
                              <Lock className="h-4 w-4" aria-hidden="true" />
                              Bloccata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                              ⏳ Modificabile
                            </span>
                          )}
                        </div>
                      </div>

                      {/*
                        Mobile UX: keep team names/logos clearly visible.
                        On small screens, show teams on top and the score inputs below.
                        On >=sm, keep the 3-column layout.
                      */}

                      {/* Mobile (<sm) */}
                      <div className="mt-5 space-y-4 sm:hidden">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {currentMatch.homeLogo ? (
                                <img src={currentMatch.homeLogo} alt="" className="h-10 w-10 rounded-full bg-white/10 object-contain" />
                              ) : (
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                                  {String(currentMatch.homeTeam).slice(0, 1)}
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-base font-extrabold">{currentMatch.homeTeam}</div>
                                <div className="text-[11px] text-slate-300">Casa</div>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-base font-extrabold">{currentMatch.awayTeam}</div>
                                <div className="text-[11px] text-slate-300">Trasferta</div>
                              </div>
                              {currentMatch.awayLogo ? (
                                <img src={currentMatch.awayLogo} alt="" className="h-10 w-10 rounded-full bg-white/10 object-contain" />
                              ) : (
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                                  {String(currentMatch.awayTeam).slice(0, 1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-2">
                          <Input
                            inputMode="numeric"
                            disabled={!canEditCurrent}
                            aria-label={`Gol ${currentMatch.homeTeam}`}
                            className="!w-16 !h-14 !px-2 text-center !text-3xl !font-extrabold !bg-slate-950 !text-slate-100 !border-2 !border-white/30 hover:!border-white/60 focus:!border-rose-400 focus:!ring-2 focus:!ring-rose-400/30 shadow-lg"
                            value={currentPred?.homeGoals === undefined ? "" : String(currentPred.homeGoals)}
                            placeholder="0"
                            onChange={(e) => setCurrentScore("home", e.target.value)}
                          />
                          <span className="text-2xl font-black text-slate-200">-</span>
                          <Input
                            inputMode="numeric"
                            disabled={!canEditCurrent}
                            aria-label={`Gol ${currentMatch.awayTeam}`}
                            className="!w-16 !h-14 !px-2 text-center !text-3xl !font-extrabold !bg-slate-950 !text-slate-100 !border-2 !border-white/30 hover:!border-white/60 focus:!border-rose-400 focus:!ring-2 focus:!ring-rose-400/30 shadow-lg"
                            value={currentPred?.awayGoals === undefined ? "" : String(currentPred.awayGoals)}
                            placeholder="0"
                            onChange={(e) => setCurrentScore("away", e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Desktop/tablet (>=sm) */}
                      <div className="mt-5 hidden sm:grid grid-cols-3 items-center gap-3">
                        <div className="min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            {currentMatch.homeLogo ? (
                              <img src={currentMatch.homeLogo} alt="" className="h-10 w-10 rounded-full bg-white/10 object-contain" />
                            ) : (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                                {String(currentMatch.homeTeam).slice(0, 1)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-base font-extrabold">{currentMatch.homeTeam}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-2">
                          <Input
                            inputMode="numeric"
                            disabled={!canEditCurrent}
                            aria-label={`Gol ${currentMatch.homeTeam}`}
                            className="!w-16 !h-14 !px-2 text-center !text-3xl !font-extrabold !bg-slate-950 !text-slate-100 !border-2 !border-white/30 hover:!border-white/60 focus:!border-rose-400 focus:!ring-2 focus:!ring-rose-400/30 shadow-lg"
                            value={currentPred?.homeGoals === undefined ? "" : String(currentPred.homeGoals)}
                            placeholder="0"
                            onChange={(e) => setCurrentScore("home", e.target.value)}
                          />
                          <span className="text-2xl font-black text-slate-200">-</span>
                          <Input
                            inputMode="numeric"
                            disabled={!canEditCurrent}
                            aria-label={`Gol ${currentMatch.awayTeam}`}
                            className="!w-16 !h-14 !px-2 text-center !text-3xl !font-extrabold !bg-slate-950 !text-slate-100 !border-2 !border-white/30 hover:!border-white/60 focus:!border-rose-400 focus:!ring-2 focus:!ring-rose-400/30 shadow-lg"
                            value={currentPred?.awayGoals === undefined ? "" : String(currentPred.awayGoals)}
                            placeholder="0"
                            onChange={(e) => setCurrentScore("away", e.target.value)}
                          />
                        </div>

                        <div className="min-w-0 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-base font-extrabold">{currentMatch.awayTeam}</div>
                            </div>
                            {currentMatch.awayLogo ? (
                              <img src={currentMatch.awayLogo} alt="" className="h-10 w-10 rounded-full bg-white/10 object-contain" />
                            ) : (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                                {String(currentMatch.awayTeam).slice(0, 1)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-slate-300">Esito</div>
                          <div className="mt-0.5 font-extrabold">{currentDerived ? currentDerived.outcome : "—"}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-slate-300">Somma gol</div>
                          <div className="mt-0.5 font-extrabold">{currentDerived ? currentDerived.sumGoals : "—"}</div>
                        </div>
                        {underOverEnabled ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-slate-300">U/O 2.5</div>
                            <div className="mt-0.5 font-extrabold">{currentDerived ? currentDerived.underOver : "—"}</div>
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-slate-300">Reale</div>
                          <div className="mt-0.5 font-extrabold">{currentReal}</div>
                        </div>
                      </div>

                      {!currentDerived ? (
                        <div className="mt-2 text-xs text-slate-300">Inserisci entrambi i punteggi per vedere esito e metriche.</div>
                      ) : null}

                      <div className="mt-5">
                        <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={currentIndex <= 0}
                          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-black/40 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/55"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          Previous
                        </button>

                        <button
                          type="button"
                          disabled={currentIndex >= currentMatches.length - 1}
                          onClick={() => setCurrentIndex((i) => Math.min(currentMatches.length - 1, i + 1))}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-black/40 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/55"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                        </div>
                        <div className="mt-2 flex justify-center">
                          <div className="flex items-center gap-2 text-xs text-slate-200">
                          {saving ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                              Salvataggio…
                            </span>
                          ) : saveHint ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2">
                              <Save className="h-4 w-4" aria-hidden="true" />
                              {saveHint}
                            </span>
                          ) : null}
                        </div>
                        </div>
                      </div>

                      {currentMatch.status === "FINISHED" && currentPred ? (
                        <div className={`mt-4 rounded-2xl border px-3 py-3 text-sm ${exactHitCurrent ? "border-emerald-300/30 bg-emerald-400/10" : hasMatchPointsCurrent ? "border-sky-300/20 bg-sky-400/10" : "border-white/10 bg-white/5"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-slate-300">Punti ottenuti</div>
                              <div className="mt-1 text-lg font-extrabold text-white">
                                <AnimatedNumber value={Number(currentPred.totalPoints ?? 0)} /> pt
                              </div>
                            </div>
                            {exactHitCurrent ? (
                              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                                ✅ Risultato esatto preso
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-slate-200">{buildBreakdown(currentPred, !!config?.features?.underOver25)}</div>
                        </div>
                      ) : null}

                      {canEditCurrent ? (
                        <div className="mt-4 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(44px,1fr))]">
                          {quickPicks.map(([a, b]) => (
                            <button
                              key={`${a}-${b}`}
                              type="button"
                              className={`rounded-lg border px-2 py-1 text-xs ${currentPred?.homeGoals === a && currentPred?.awayGoals === b ? "border-rose-400 bg-rose-500/15 text-white" : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"}`}
                              onClick={() => setCurrentScorePair(a, b)}
                            >
                              {a}-{b}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>;
                  })() : (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">Nessuna partita trovata per questa giornata.</div>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {uiMode === "LIST" ? (
            <>
                    {byMatchday.length ? (
        <Card>
          <CardHeader title="Vai a giornata" subtitle="Seleziona una giornata e scorri automaticamente." />
          <CardContent>
            <div className="flex items-center gap-3">
              <select
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
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
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-300/25 bg-slate-400/10 px-3 py-2 text-sm font-semibold text-slate-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Terminata
            </span>
          ) : matchdayStatus === "IN_PROGRESS" ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
              In corso
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Non iniziata
            </span>
          );

        const cardClass =
          matchdayStatus === "FINISHED"
            ? "border-slate-500/25 bg-slate-500/10"
            : matchdayStatus === "IN_PROGRESS"
            ? "border-emerald-400/25 bg-emerald-400/10"
            : "border-sky-400/25 bg-sky-400/10";

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
                      <span className="text-slate-100 font-semibold text-base">Tutte le partite sono terminate.</span>
                    ) : matchdayStatus === "IN_PROGRESS" ? (
                      <span className="text-emerald-100 font-semibold text-base">Partite in corso.</span>
                    ) : (
                      <span className="text-sky-100 font-semibold text-base">Partite non ancora iniziate.</span>
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
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-[10px] font-bold text-slate-200">
                        {name.trim().slice(0, 1).toUpperCase()}
                      </span>
                    );
                  };

                  const activeQuick = (a: number, b: number) => p?.homeGoals === a && p?.awayGoals === b;

                  return (
                    <div key={m.id} id={`match-${m.id}`} className={`relative rounded-2xl border p-3 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md scroll-mt-24 ${
                      m.status === "FINISHED"
                        ? "border-slate-400/25 bg-slate-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        : m.status === "IN_PROGRESS"
                        ? "border-emerald-300/30 bg-emerald-400/12 shadow-[0_0_28px_rgba(16,185,129,0.08)]"
                        : "border-sky-300/25 bg-sky-400/12 shadow-[0_0_28px_rgba(56,189,248,0.06)]"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusDot status={m.status} />
                          {m.isJolly ? (
                            <span title="Partita Jolly" className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-200">⭐ Jolly</span>
                          ) : null}
                          {!canEdit ? (
                            <span
                              title={lockReason}
                              className="inline-flex items-center rounded-full border border-white/10 bg-slate-950/60 px-2 py-1"
                            >
                              <Lock className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/5"
                            onClick={() => openDetail(m.id)}
                            title="Dettaglio match"
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Dettaglio</span>
                          </button>
                          <div className="text-xs text-white/75 sm:hidden">Reale: <span className="font-semibold text-white">{real}</span></div>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-[54px_1fr_auto] items-center gap-2">
                        <div className="text-xs text-white/80">
                          <div className="font-semibold text-white">{date}</div>
                          <div className="text-white/70">{time}</div>
                        </div>

                        <div className="min-w-0">
                          {/* Mobile-first: teams stacked like Diretta */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamDot name={m.homeTeam} logo={m.homeLogo} />
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{m.homeTeam}</div>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamDot name={m.awayTeam} logo={m.awayLogo} />
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{m.awayTeam}</div>
                            </div>
                          </div>
                          <div className="mt-1 hidden text-xs text-white/65 sm:block">{d.toLocaleString()}</div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="numeric"
                            disabled={!canEdit}
                            aria-label={`Gol ${m.homeTeam}`}
                            className="!w-12 !px-2 !py-1 text-center !font-extrabold !text-slate-100 !bg-slate-950 !border-2 !border-white/10 hover:!border-white/20 focus:!border-rose-500 focus:!ring-2 focus:!ring-rose-500/30 shadow-sm"
                            value={p?.homeGoals === undefined ? "" : String(p.homeGoals)}
                            placeholder="0"
                            onChange={(e) => {
                              const v = clamp20(e.target.value);
                              setPreds((prev) => {
                                const existing = prev[m.id] ?? { matchId: m.id };
                                const next = { ...existing, homeGoals: v };
                                scheduleAutosaveIfComplete(next);
                                return { ...prev, [m.id]: next };
                              });
                            }}
                          />
                          <span className="px-1 text-xs text-slate-400">-</span>
                          <Input
                            inputMode="numeric"
                            disabled={!canEdit}
                            aria-label={`Gol ${m.awayTeam}`}
                            className="!w-12 !px-2 !py-1 text-center !font-extrabold !text-slate-100 !bg-slate-950 !border-2 !border-white/10 hover:!border-white/20 focus:!border-rose-500 focus:!ring-2 focus:!ring-rose-500/30 shadow-sm"
                            value={p?.awayGoals === undefined ? "" : String(p.awayGoals)}
                            placeholder="0"
                            onChange={(e) => {
                              const v = clamp20(e.target.value);
                              setPreds((prev) => {
                                const existing = prev[m.id] ?? { matchId: m.id };
                                const next = { ...existing, awayGoals: v };
                                scheduleAutosaveIfComplete(next);
                                return { ...prev, [m.id]: next };
                              });
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-white/85 sm:text-sm">
                        <span className="text-white/70">Risultato reale:</span> <span className="font-semibold text-white">{real}</span>
                        {m.status === "FINISHED" && p ? (
                          <span className="ml-3 text-white/75">
                            Punti: <span className="font-semibold text-white"><AnimatedNumber value={Number(p.totalPoints ?? 0)} /></span>{" "}
                            <span className="text-xs text-white/70">({buildBreakdown(p, !!config?.features?.underOver25)})</span>
                          </span>
                        ) : null}
                      </div>

                      {config?.features?.scorer && m.status === "NOT_STARTED" ? (
                        <button
                          type="button"
                          onClick={() => openDetail(m.id)}
                          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/15"
                          title="Seleziona marcatore"
                        >
                          ⚽ Seleziona marcatore
                        </button>
                      ) : null}

                      {config?.features?.scorer && scorerPickByMatchId.get(m.id)?.playerName ? (
                        <div className="mt-1 text-xs text-white/75">
                          <span className="text-white/65">Marcatore scelto:</span>{" "}
                          <span className="font-semibold text-white">{scorerPickByMatchId.get(m.id)!.playerName}</span>
                        </div>
                      ) : null}

                      {canEdit ? (
                        <div className="mt-2 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(44px,1fr))]">
                          {quick.map(([a, b]) => (
                            <button
                              key={`${a}-${b}`}
                              type="button"
                              className={`rounded-lg border px-2 py-1 text-xs ${activeQuick(a, b) ? "border-rose-500/60 bg-rose-500/10 text-rose-100" : "border-white/10 bg-slate-950/55 text-slate-100 hover:bg-white/10"}`}
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

        
            </>
          ) : null}
        </>
      ) : null}{hasLockedPrediction && !isLocked ? (
        <Alert tone="danger">
          Hai inserito almeno un pronostico su una partita bloccata (già iniziata/terminata). Rimuovi quei valori per poter salvare.
        </Alert>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-950/70 shadow-xl ring-1 ring-slate-800">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-100">Dettaglio match</div>
                {detailMatchId && matchById.get(detailMatchId) ? (
                  <div className="mt-0.5 truncate text-sm text-slate-400">
                    {matchById.get(detailMatchId)!.homeTeam} vs {matchById.get(detailMatchId)!.awayTeam}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-400 hover:bg-white/10"
                onClick={closeDetail}
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-auto px-5 py-4">
              {detailLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-1/2" />
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : !detailData ? (
                <Alert tone="danger">Impossibile caricare il dettaglio del match.</Alert>
              ) : (
                <div className="space-y-4">
                  {/* Tabs */}
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5/40 p-2">
                    <button
                      type="button"
                      onClick={() => setDetailTab("summary")}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-extrabold tracking-wide ${detailTab === "summary" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
                    >
                      RIASSUNTO
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab("lineups")}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-extrabold tracking-wide ${detailTab === "lineups" ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-white/5"}`}
                    >
                      FORMAZIONI
                    </button>
                  </div>

                  {detailTab === "summary" ? (
                    <div className="space-y-6">
                      {/* Scorer */}
                      <div className="rounded-2xl border border-white/10 bg-white/5/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">Marcatore</div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {detailData.scorerEnabled
                                ? detailData.canPickScorer
                                  ? `Se il giocatore segna: +${detailData.pointsScorer} punti`
                                  : "Non modificabile per lock o partita iniziata"
                                : "Feature non attiva in questa lega"}
                            </div>
                          </div>
                          {detailData.scorerEnabled && detailData.lineupAvailable ? (
                            <span className="text-xs font-medium text-slate-400">Giocatori: disponibili</span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Giocatori: —</span>
                          )}
                        </div>

                        {detailData.scorerEnabled && detailData.lineupAvailable ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                            <label className="block text-sm">
                              <span className="mb-1 block text-xs font-medium text-slate-300">Seleziona giocatore</span>
                              <SearchableSelect
                                disabled={!detailData.canPickScorer}
                                value={detailPlayerId === null ? "" : String(detailPlayerId)}
                                placeholder="Seleziona giocatore…"
                                emptyLabel="—"
                                onChange={(v) => {
                                  const n = v ? Number(v) : NaN;
                                  setDetailPlayerId(Number.isFinite(n) ? n : null);
                                }}
                                options={(() => {
                                  const items: Array<{ value: string; label: string }> = [];
                                  for (const t of detailData.lineups || []) {
                                    const teamName = t?.team?.name || "";
                                    for (const p of [...(t.startXI || []), ...(t.substitutes || [])]) {
                                      if (!p?.id || !p?.name) continue;
                                      const num = p?.number ? `#${p.number} ` : "";
                                      items.push({ value: String(p.id), label: `${teamName} · ${num}${p.name}` });
                                    }
                                  }
                                  const seen = new Set<string>();
                                  return items
                                    .filter((x) => {
                                      if (seen.has(x.value)) return false;
                                      seen.add(x.value);
                                      return true;
                                    })
                                    .sort((a, b) => a.label.localeCompare(b.label, "it"));
                                })()}
                              />
                            </label>

                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                disabled={!detailData.canPickScorer || detailSaving}
                                onClick={async () => {
                                  setDetailSaving(true);
                                  try {
                                    await api.setScorer(detailMatchId!, { playerId: null });
                                    setToast({ tone: "success", msg: "Marcatore rimosso" });
                                    const d = await api.matchDetail(detailMatchId!);
                                    setDetailData(d);
                                    setDetailPlayerId(null);
                                    await reloadAll({ silent: true });
                                  } catch (e: any) {
                                    setToast({ tone: "danger", msg: e?.message || "Errore" });
                                  } finally {
                                    setDetailSaving(false);
                                  }
                                }}
                              >
                                Rimuovi
                              </Button>
                              <Button
                                disabled={!detailData.canPickScorer || detailSaving || detailPlayerId === null}
                                onClick={async () => {
                                  setDetailSaving(true);
                                  try {
                                    await api.setScorer(detailMatchId!, { playerId: detailPlayerId });
                                    setToast({ tone: "success", msg: "Marcatore salvato" });
                                    const d = await api.matchDetail(detailMatchId!);
                                    setDetailData(d);
                                    await reloadAll({ silent: true });
                                  } catch (e: any) {
                                    setToast({ tone: "danger", msg: e?.message || "Errore" });
                                  } finally {
                                    setDetailSaving(false);
                                  }
                                }}
                              >
                                Salva
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-400">{detailData.scorerEnabled ? "Lista giocatori non disponibile per questo match." : ""}</div>
                        )}

                        {detailData.scorer ? (
                          <div className="mt-2 text-xs text-slate-400">
                            Selezionato: <span className="font-semibold text-slate-200">{detailData.scorer.playerName}</span>
                            {(() => {
                              const sel = String(detailData?.scorer?.playerExternalId || "");
                              const m = sel.match(/^(?:afp:|fdp:)?(\d+)$/i);
                              const pid = m ? Number(m[1]) : NaN;
                              const scorers = Array.isArray(detailData?.goalScorers) ? detailData.goalScorers : [];
                              const hit = Number.isFinite(pid) ? scorers.some((x: any) => Number(x?.id) === pid) : false;
                              if (detailData?.match?.status !== "FINISHED") return null;
                              return hit ? (
                                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">+{detailData.pointsScorer} punti</span>
                              ) : (
                                <span className="ml-2 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-400">0 punti</span>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>

                      {/* Events */}
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Eventi</div>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          {renderEventsSummary(detailData.events || [])}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Formazioni</div>
                      <div className="mt-2">{renderLineups(detailData.lineups || [])}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
