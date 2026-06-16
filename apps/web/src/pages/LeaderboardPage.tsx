import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp, Trophy, Target, CheckCircle2, Sigma, TrendingUp, Award, Info, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { UserAvatar } from "../components/Avatar";
import { AnimatedNumber } from "../components/AnimatedNumber";

type Row = {
  userId: string;
  displayName: string;
  avatarId?: string | null;
  avatarJson?: any; // backward compat (not used in UI)
  totalPoints: number;
  exactHits: number;
  outcomeHits: number;
  sumGoalsHits: number;
  underOverHits?: number;
  matchdayWins?: number;
  competitionPoints?: number;
};

type SortValue = {
  key: "points" | "exact" | "outcome" | "sumgoals";
  dir: "desc" | "asc";
  label: string;
};

export default function LeaderboardPage() {
  const { activeLeagueId, user } = useAuth();
  const { show, hide } = useLoading();
  const [sortKey, setSortKey] = useState<"points" | "exact" | "outcome" | "sumgoals">("points");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [sortOpen, setSortOpen] = useState(false);

  const sortParam = `${sortKey}_${sortDir}`;

  const [rows, setRows] = useState<Row[]>([]);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | "">>({});
  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const idx = rows.findIndex((r) => r.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, user?.id]);

  const leaderPoints = useMemo(() => (rows.length ? Number(rows[0].totalPoints || 0) : 0), [rows]);

  const [leagueName, setLeagueName] = useState<string>("");
  const [features, setFeatures] = useState<{ underOver25: boolean; matchdayAwards: boolean }>({ underOver25: false, matchdayAwards: false });
  const [prizeCount, setPrizeCount] = useState(3);
  const [tieBreakers, setTieBreakers] = useState<string[]>([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const sortOptions: SortValue[] = useMemo(
    () => [
      { key: "points", dir: "desc", label: "Punti (ordine decrescente)" },
      { key: "points", dir: "asc", label: "Punti (ordine crescente)" },
      { key: "exact", dir: "desc", label: "Risultati esatti (ordine decrescente)" },
      { key: "exact", dir: "asc", label: "Risultati esatti (ordine crescente)" },
      { key: "outcome", dir: "desc", label: "Pronostici 1X2 (ordine decrescente)" },
      { key: "outcome", dir: "asc", label: "Pronostici 1X2 (ordine crescente)" },
      { key: "sumgoals", dir: "desc", label: "Somma gol (ordine decrescente)" },
      { key: "sumgoals", dir: "asc", label: "Somma gol (ordine crescente)" },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    show();
    setLoading(true);
    api.leaderboard(sortParam)
      .then((r) => {
        if (cancelled) return;
        const nextRows = (r.leaderboard || []) as Row[];

        // Highlight position changes (persist previous snapshot in localStorage).
        try {
          const key = `tm_leaderboard_pos_${activeLeagueId || ""}_${sortParam}`;
          const prevRaw = localStorage.getItem(key);
          const prev: Record<string, number> = prevRaw ? JSON.parse(prevRaw) : {};
          const nextPos: Record<string, number> = {};
          nextRows.forEach((row, idx) => { nextPos[row.userId] = idx + 1; });

          const d: Record<string, number> = {};
          const f: Record<string, "up" | "down" | ""> = {};
          for (const row of nextRows) {
            const p = prev[row.userId];
            const n = nextPos[row.userId];
            if (typeof p === "number" && typeof n === "number" && p !== n) {
              const delta = p - n; // positive => moved up
              d[row.userId] = delta;
              f[row.userId] = delta > 0 ? "up" : "down";
            }
          }
          setDeltas(d);
          setFlash(f);
          localStorage.setItem(key, JSON.stringify(nextPos));
          // Clear flash after a short delay.
          window.setTimeout(() => setFlash({}), 1400);
        } catch {
          // ignore storage errors
        }

        setRows(nextRows);
        setLeagueName(r?.league?.name ? String(r.league.name) : "");
        setFeatures({ underOver25: !!r?.features?.underOver25, matchdayAwards: !!r?.features?.matchdayAwards });
        const configuredPrizes = Array.isArray(r?.monetization?.prizes) ? r.monetization.prizes.length : 0;
        setPrizeCount(configuredPrizes > 0 ? configuredPrizes : 3);
        setTieBreakers(Array.isArray(r?.tieBreakers) ? r.tieBreakers.map((x: any) => String(x)) : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        hide();
      });
    return () => { cancelled = true; };
  }, [sortKey, sortDir, activeLeagueId]);

  return (
    <div className="tm-page-stack">
      <div className="overflow-hidden rounded-3xl border border-white/10 shadow-sm">
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
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  Classifica
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight">{leagueName || "Classifica generale"}</div>
                {rows.length ? <div className="mt-1 text-sm text-slate-300">Leader: {rows[0].displayName} · <b className="text-white">{rows[0].totalPoints}</b> pt</div> : null}
              </div>
              <div className="text-right">
                {myRank ? (
                  <div className="inline-flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold text-slate-300">La tua posizione</div>
                    <div className="text-lg font-extrabold">#{myRank}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card>
      {sortOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Chiudi ordinamento"
            onClick={() => setSortOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-auto rounded-t-2xl tm-glass-sheet p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold text-slate-100">Ordina per</div>
              <Button variant="ghost" onClick={() => setSortOpen(false)} aria-label="Chiudi">✕</Button>
            </div>

            <div className="space-y-2">
              {sortOptions.map((opt) => {
                const active = opt.key === sortKey && opt.dir === sortDir;
                return (
                  <button
                    key={`${opt.key}_${opt.dir}`}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                    onClick={() => {
                      setSortKey(opt.key);
                      setSortDir(opt.dir);
                      setSortOpen(false);
                    }}
                  >
                    <span className="text-sm text-slate-100">{opt.label}</span>
                    <span
                      className={`h-5 w-5 rounded-full border ${active ? "border-rose-500 bg-rose-500" : "border-white/20"}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <CardContent>
        <div className="mb-4 flex items-center justify-end gap-2">
          <div className="hidden sm:block">
            <label className="text-xs text-slate-400">Ordina</label>
            <select
              className="mt-1 w-[260px] rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
              value={sortParam}
              onChange={(e) => {
                const v = e.target.value;
                const [k, d] = v.split("_") as any;
                setSortKey(k);
                setSortDir(d);
              }}
            >
              {sortOptions.map((opt) => (
                <option key={`${opt.key}_${opt.dir}`} value={`${opt.key}_${opt.dir}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:hidden">
            <Button variant="secondary" onClick={() => setSortOpen(true)} aria-label="Ordina">
              <ArrowDownUp size={18} aria-hidden="true" />
              <span className="ml-2">Ordina</span>
            </Button>
          </div>
        </div>

        {/* Legend / metric explanation */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Info size={16} aria-hidden="true" />
              Legenda & criteri
            </div>
            {legendOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>

          {legendOpen ? (
            <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <div className="flex items-center gap-2"><Trophy size={16} aria-hidden="true" /> <b>Punti</b>: totale punti in classifica</div>
              <div className="flex items-center gap-2"><Target size={16} aria-hidden="true" /> <b>Esatti</b>: risultati esatti</div>
              <div className="flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" /> <b>1X2</b>: esito corretto</div>
              <div className="flex items-center gap-2"><Sigma size={16} aria-hidden="true" /> <b>Somma gol</b>: totale gol corretto</div>
              <div className="flex items-center gap-2"><span className="text-base" aria-hidden="true">🏆</span> <b>Bonus torneo</b>: punti da vincitore e/o capocannoniere</div>
              {features.underOver25 ? (
                <div className="flex items-center gap-2"><TrendingUp size={16} aria-hidden="true" /> <b>U/O 2.5</b>: Under (≤2) / Over (≥3)</div>
              ) : null}
              {features.matchdayAwards ? (
                <div className="flex items-center gap-2"><Award size={16} aria-hidden="true" /> <b>Premi giornata</b>: migliori punteggi di giornata</div>
              ) : null}

              {tieBreakers.length ? (
                <div className="sm:col-span-2 text-xs text-slate-300 pt-1">
                  <b>Tie-break</b> (a parità di punti): {tieBreakers.join(" → ")}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1"><Trophy size={14} aria-hidden="true" /> Punti</span>
              <span className="inline-flex items-center gap-1"><Target size={14} aria-hidden="true" /> Esatti</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} aria-hidden="true" /> 1X2</span>
              <span className="inline-flex items-center gap-1"><Sigma size={14} aria-hidden="true" /> Somma gol</span>
              {features.underOver25 ? (
                <span className="inline-flex items-center gap-1"><TrendingUp size={14} aria-hidden="true" /> U/O 2.5</span>
              ) : null}
              {features.matchdayAwards ? (
                <span className="inline-flex items-center gap-1"><Award size={14} aria-hidden="true" /> Premi</span>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1 text-slate-400">
                <span className="hidden sm:inline">Apri per dettagli</span>
                <span className="sm:hidden">Dettagli</span>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">

            {/* Desktop header */}
            <div className="hidden sm:grid sm:grid-cols-12 sm:gap-3 sm:pb-2 sm:text-[11px] sm:font-semibold sm:uppercase sm:tracking-wide sm:text-slate-300">
              <div className="sm:col-span-6">Giocatore</div>
              <div className="sm:col-span-2 sm:text-right">Punti</div>
              <div className="sm:col-span-4 sm:text-right">Metriche</div>
            </div>

            {rows.map((r, idx) => {
              const tr = flash[r.userId] || "";
              const flashCls = tr === "up" ? "tm-flash-up" : tr === "down" ? "tm-flash-down" : "";
              const delta = deltas[r.userId] || 0;
              const isPrizePosition = idx < prizeCount;
              const medal = isPrizePosition ? (idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🏅") : "";
              const medalGlow = isPrizePosition ? "tm-medal-glow" : "";
              const top3Row = isPrizePosition ? "border-yellow-200/30 bg-yellow-300/10 shadow-[0_0_35px_rgba(250,204,21,0.10)]" : "border-white/10 bg-white/5";
              const isMe = !!user?.id && r.userId === user.id;
              const gap = idx === 0 ? 0 : Math.max(0, leaderPoints - Number(r.totalPoints || 0));
              return (
              <div key={r.userId} className={`rounded-3xl border p-3 transition ${top3Row} ${isMe ? "brightness-110" : ""} ${flashCls}`}>
                <Link
                  to={`/users/${r.userId}`}
                  className="group block rounded-2xl transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
                  aria-label={`Apri il dettaglio di ${r.displayName}`}
                >
                {/* Mobile: 2 righe senza scroll orizzontale. Desktop: layout a colonne */}
                <div className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                  <div className="flex items-center justify-between sm:col-span-6 sm:justify-start sm:gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${isPrizePosition ? "border-yellow-200/30 bg-yellow-300/10 text-yellow-50" : "border-white/10 bg-slate-950/60 text-white"} ${medalGlow}`}>
                          <span className="tabular-nums">#{idx + 1}</span>
                          {medal ? <span aria-hidden="true">{medal}</span> : null}
                        </span>
                        {delta !== 0 ? (
                          <span className="text-[11px] font-semibold text-slate-300" title="Variazione posizione">
                            {delta > 0 ? "▲" : "▼"}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <UserAvatar avatarId={(r as any).avatarId || null} size={26} className={`shadow-sm ${isPrizePosition ? "tm-top3-avatar" : ""}`} />
                        <div>
                          <div className="font-medium group-hover:underline">{r.displayName}</div>
                          <div className="text-[11px] text-slate-400">Apri dettaglio e pronostici</div>
                        </div>
                        {/* Keep the row highlight for the logged user, but avoid extra labels ("Tu" / "Top"). */}
                      </div>
                    </div>
                    <div className="text-right text-sm font-extrabold sm:hidden">
                      <div className="flex flex-col items-end gap-1">
                        <div>
                          <AnimatedNumber value={r.totalPoints} /> pt
                          {idx !== 0 ? <span className="ml-2 text-xs font-semibold text-slate-300">-{gap}</span> : null}
                        </div>
                        {(r.competitionPoints ?? 0) > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                            title="Bonus pronostici torneo (vincitore e/o capocannoniere)"
                          >
                            +{r.competitionPoints} <span aria-hidden="true">🏆</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:col-span-2 sm:block sm:text-right sm:text-sm sm:font-extrabold">
                    <div className="flex flex-col items-end gap-1">
                      <div>
                        <AnimatedNumber value={r.totalPoints} /> pt
                        {idx !== 0 ? <span className="ml-2 text-[11px] font-semibold text-slate-300">-{gap}</span> : null}
                      </div>
                      {(r.competitionPoints ?? 0) > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                          title="Bonus pronostici torneo (vincitore e/o capocannoniere)"
                        >
                          +{r.competitionPoints} <span aria-hidden="true">🏆</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1 text-xs text-slate-200 sm:col-span-4 sm:justify-end sm:flex-nowrap sm:gap-x-4">
                    {/* Mobile "stack": label+value; Desktop: icon+value */}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Risultati esatti">
                      <Target size={14} aria-hidden="true" /> <span className="sm:hidden">Esatti:</span> {r.exactHits}
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Pronostici 1X2">
                      <CheckCircle2 size={14} aria-hidden="true" /> <span className="sm:hidden">1X2:</span> {r.outcomeHits}
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Somma gol">
                      <Sigma size={14} aria-hidden="true" /> <span className="sm:hidden">Somma:</span> {r.sumGoalsHits}
                    </span>
                    {features.underOver25 ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Under/Over 2.5 (≤2 Under, ≥3 Over)">
                        <TrendingUp size={14} aria-hidden="true" /> <span className="sm:hidden">U/O:</span> {(r.underOverHits ?? 0)}
                      </span>
                    ) : null}
                    {features.matchdayAwards ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Miglior risultato di giornata">
                        <Award size={14} aria-hidden="true" /> <span className="sm:hidden">Premi:</span> {(r.matchdayWins ?? 0)}
                      </span>
                    ) : null}
                  </div>
                </div>
                </Link>
              </div>
            );
            })}
            {rows.length === 0 ? <div className="py-6 text-sm text-slate-300">Nessun partecipante attivo.</div> : null}
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
