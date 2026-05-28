import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { UserAvatar } from "../components/Avatar";
import { useAuth } from "../lib/auth";
import { showNativeRewardedAd } from "../lib/nativeAds";

type SummaryItem = {
  match?: any;
  prediction?: { homeGoals?: number; awayGoals?: number } | null;
  real?: { home: number; away: number } | null;
  points?: { exact?: number; outcome?: number; sumGoals?: number; underOver?: number; total?: number } | null;
};

export default function UserSummaryPage() {
  const { id } = useParams();
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adRequired, setAdRequired] = useState(false);
  const [unlockMinutes, setUnlockMinutes] = useState<number>(5);
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState(15);
  const [demoAdsEnabled, setDemoAdsEnabled] = useState(true);
  const [selectedMatchday, setSelectedMatchday] = useState<string>("ALL");

  const refetch = () => {
    show();
    setLoading(true);
    setError(null);
    setAdRequired(false);
    api.userSummary(id!)
      .then((d) => setData(d))
      .catch((e: any) => {
        setData(null);
        if (e?.status === 403 && e?.data?.code === "AD_REQUIRED") {
          setAdRequired(true);
          if (typeof e?.data?.unlockMinutes === "number") setUnlockMinutes(e.data.unlockMinutes);
          if (typeof e?.data?.demoAdsEnabled === "boolean") setDemoAdsEnabled(!!e.data.demoAdsEnabled);
          setError(e?.data?.message || e?.message || "Accesso bloccato");
        } else {
          setError(e?.message || "Errore nel caricamento del dettaglio");
        }
      })
      .finally(() => {
        setLoading(false);
        hide();
      });
  };

  useEffect(() => {
    let cancelled = false;
    api.adUnlockStatus()
      .then((s: any) => {
        if (cancelled) return;
        setUnlockExpiresAt(s?.expiresAt ? new Date(s.expiresAt).toISOString() : null);
      })
      .catch(() => {});

    setTimeout(() => {
      if (!cancelled) refetch();
    }, 0);
    return () => {
      cancelled = true;
    };
  }, [id, activeLeagueId]);

  useEffect(() => {
    if (!showAd) return;

    setAdSecondsLeft(15);
    let interval: any = null;
    let fallbackTimer: any = null;
    let started = false;

    const startCountdown = () => {
      if (started) return;
      started = true;
      interval = setInterval(() => setAdSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    };

    if (demoAdsEnabled) {
      startCountdown();
      return () => {
        if (interval) clearInterval(interval);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    }

    try {
      const w = window as any;
      const adUnit = (import.meta as any).env?.VITE_GAM_AD_UNIT as string | undefined;
      const sizeStr = ((import.meta as any).env?.VITE_GAM_SIZE as string | undefined) || "300x250";
      const size = sizeStr
        .split("x")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n));

      fallbackTimer = setTimeout(() => startCountdown(), 2000);

      if (w?.googletag && adUnit) {
        w.googletag.cmd = w.googletag.cmd || [];
        w.googletag.cmd.push(() => {
          const slotId = "gam-rewarded-slot";
          try {
            w.googletag.pubads().addEventListener?.("slotRenderEnded", (e: any) => {
              if (e?.slot && typeof e.slot.getSlotElementId === "function" && e.slot.getSlotElementId() === slotId) {
                startCountdown();
              }
            });
          } catch {}

          const defined = (w.googletag.pubads && w.googletag.pubads().getSlots ? w.googletag.pubads().getSlots() : [])
            .some((s: any) => typeof s?.getSlotElementId === "function" && s.getSlotElementId() === slotId);

          if (!defined) {
            w.googletag
              .defineSlot(adUnit, size.length === 2 ? [size[0], size[1]] : [300, 250], slotId)
              ?.addService(w.googletag.pubads());
            w.googletag.pubads().enableSingleRequest?.();
            w.googletag.enableServices?.();
          }

          w.googletag.display?.(slotId);
        });
      }
    } catch {}

    return () => {
      if (interval) clearInterval(interval);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [showAd, demoAdsEnabled]);

  const safeLeague = data?.league ?? { name: "Lega" };
  const safeUser = data?.user ?? { displayName: "Utente" };
  const safeItems: SummaryItem[] = Array.isArray(data?.detail) ? data.detail : [];
  const features = data?.features ?? { underOver25: false, matchdayAwards: false };
  const safeSummary = data?.totals ?? { total: 0, exact: 0, outcome: 0, sumGoals: 0, underOver: 0 };

  const buildBreakdown = (pts: any) => {
    const parts: string[] = [];
    if ((pts?.exact ?? 0) > 0) parts.push(`Esatto ${pts.exact}`);
    if ((pts?.outcome ?? 0) > 0) parts.push(`1X2 ${pts.outcome}`);
    if ((pts?.sumGoals ?? 0) > 0) parts.push(`Somma gol ${pts.sumGoals}`);
    if (!!features.underOver25 && (pts?.underOver ?? 0) > 0) parts.push(`U/O 2.5 ${pts.underOver}`);
    return parts.length ? parts.join(" · ") : "Nessun punto";
  };

  const outcomeOf = (home: number, away: number) => (home > away ? "1" : home < away ? "2" : "X");
  const getStatus = (it: SummaryItem): "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" => {
    const raw = String(it?.match?.status || "NOT_STARTED");
    if (raw === "FINISHED" || raw === "IN_PROGRESS" || raw === "NOT_STARTED") return raw as any;
    return "NOT_STARTED";
  };

  const byMatchday = useMemo(() => {
    return safeItems.reduce((acc: Record<number, SummaryItem[]>, it: SummaryItem) => {
      const md = Number(it?.match?.matchday ?? 1);
      (acc[md] ??= []).push(it);
      return acc;
    }, {});
  }, [safeItems]);

  const matchdays = useMemo(() => Object.keys(byMatchday).map(Number).sort((a, b) => a - b), [byMatchday]);
  const nowTs = Date.now();

  const isAllFinished = (md: number) => {
    const items = byMatchday[md] ?? [];
    if (!items.length) return true;
    return items.every((it) => {
      const s = getStatus(it);
      if (s === "FINISHED") return true;
      const ko = new Date(it?.match?.kickoffAt).getTime();
      return Number.isFinite(ko) ? ko < nowTs - 4 * 60 * 60 * 1000 : false;
    });
  };

  const defaultMatchday = useMemo(() => {
    const current = matchdays.find((md) => !isAllFinished(md));
    return String(current ?? matchdays[matchdays.length - 1] ?? 1);
  }, [matchdays]);

  useEffect(() => {
    setSelectedMatchday((prev) => {
      if (prev === "ALL") return prev;
      if (matchdays.includes(Number(prev))) return prev;
      return defaultMatchday;
    });
  }, [defaultMatchday, matchdays.join(",")]);

  const visibleMatchdays = selectedMatchday === "ALL" ? matchdays : matchdays.filter((md) => String(md) === selectedMatchday);

  const finishedItems = safeItems
    .filter((it) => !!it?.prediction && !!it?.real && getStatus(it) === "FINISHED")
    .slice()
    .sort((a, b) => new Date(a?.match?.kickoffAt || 0).getTime() - new Date(b?.match?.kickoffAt || 0).getTime());

  const isExactHit = (it: SummaryItem) => {
    const p = it?.prediction;
    const r = it?.real;
    return !!p && !!r && Number(p.homeGoals) === Number(r.home) && Number(p.awayGoals) === Number(r.away);
  };
  const isOutcomeHit = (it: SummaryItem) => {
    const p = it?.prediction;
    const r = it?.real;
    return !!p && !!r && outcomeOf(Number(p.homeGoals), Number(p.awayGoals)) === outcomeOf(Number(r.home), Number(r.away));
  };

  const finishedCount = finishedItems.length;
  const exactHits = finishedItems.filter(isExactHit).length;
  const outcomeHits = finishedItems.filter(isOutcomeHit).length;
  const pctExact = finishedCount ? Math.round((exactHits / finishedCount) * 100) : 0;
  const pctOutcome = finishedCount ? Math.round((outcomeHits / finishedCount) * 100) : 0;

  const streakFromEnd = (fn: (it: SummaryItem) => boolean) => {
    let s = 0;
    for (let i = finishedItems.length - 1; i >= 0; i -= 1) {
      if (fn(finishedItems[i])) s += 1;
      else break;
    }
    return s;
  };

  const streakOutcome = streakFromEnd(isOutcomeHit);
  const streakExact = streakFromEnd(isExactHit);

  const pointsByMatchday = new Map<number, number>();
  for (const it of safeItems) {
    const md = Number(it?.match?.matchday ?? 1);
    const pts = Number(it?.points?.total ?? 0);
    pointsByMatchday.set(md, (pointsByMatchday.get(md) ?? 0) + (Number.isFinite(pts) ? pts : 0));
  }
  const mdSeries = matchdays.map((md) => ({ md, pts: pointsByMatchday.get(md) ?? 0 }));
  const bestMatchday = mdSeries.reduce((acc, it) => (it.pts > acc.pts ? it : acc), mdSeries[0] ?? { md: 1, pts: 0 });
  const chartSeries = mdSeries.map((s, idx) => ({ label: `G${s.md}`, y: mdSeries.slice(0, idx + 1).reduce((tot, x) => tot + x.pts, 0) }));

  const renderMiniChart = () => {
    if (chartSeries.length < 2) return <div className="text-xs text-slate-500">Nessun andamento disponibile.</div>;
    const w = 100;
    const h = 60;
    const pad = 6;
    const ys = chartSeries.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const xStep = (w - pad * 2) / (chartSeries.length - 1);
    const scaleY = (y: number) => (maxY === minY ? h / 2 : pad + (h - pad * 2) * (1 - (y - minY) / (maxY - minY)));
    const pts = chartSeries.map((p, i) => ({ x: pad + i * xStep, y: scaleY(p.y) }));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2.2} className="text-teal-600" />
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.2} className="text-teal-600" fill="currentColor" />)}
        </svg>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{chartSeries[0].label}</span>
          <span>{chartSeries[chartSeries.length - 1].label}</span>
        </div>
      </div>
    );
  };

  const TeamDot = ({ name, logo }: { name: string; logo?: string | null }) => {
    if (logo) return <img src={logo} alt={name} className="h-7 w-7 rounded-full object-contain" />;
    return <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-300">{name.trim().slice(0, 1).toUpperCase()}</span>;
  };

  const StatusPill = ({ status }: { status: string }) => {
    if (status === "FINISHED") return <Badge tone="gray">Terminata</Badge>;
    if (status === "IN_PROGRESS") return <Badge tone="green">In corso</Badge>;
    return <Badge tone="gray">Non iniziata</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader title="Partecipante" subtitle="Caricamento…" />
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Pronostici" subtitle="" />
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (adRequired) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Pronostici protetti"
            subtitle={error || "Guarda una pubblicità per visualizzare i pronostici degli altri utenti."}
            right={<Link className="text-sm text-slate-600 hover:underline" to="/leaderboard">← Torna alla classifica</Link>}
          />
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">
              Al termine della pubblicità, la visualizzazione sarà sbloccata per <b>{unlockMinutes} minuti</b>.
              {unlockExpiresAt ? <span className="ml-1">Sblocco attuale fino alle {new Date(unlockExpiresAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.</span> : null}
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              onClick={async () => {
                try {
                  if (!demoAdsEnabled) {
                    const r = await showNativeRewardedAd();
                    if (r?.shown) {
                      const u: any = await api.adUnlock();
                      setUnlockExpiresAt(u?.expiresAt ? new Date(u.expiresAt).toISOString() : null);
                      refetch();
                      return;
                    }
                  }
                } catch {}
                setShowAd(true);
              }}
            >
              Guarda la pubblicità
            </button>
          </CardContent>
        </Card>

        {showAd ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-slate-950 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Pubblicità</div>
                <button className="text-sm text-slate-500 hover:underline" onClick={() => setShowAd(false)}>
                  Chiudi
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-300">
                {demoAdsEnabled ? (
                  <>
                    <div className="mb-2 font-medium">[DEMO] Spazio pubblicitario</div>
                    <div className="opacity-80">Demo attiva: simulazione di una pubblicità con countdown.</div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 font-medium">Spazio pubblicitario</div>
                    <div className="opacity-80">Se hai integrato Google Ad Manager (GPT), qui verrà renderizzato lo slot configurato.</div>
                    <div id="gam-rewarded-slot" className="mt-3 flex min-h-[260px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
                      <div className="text-xs text-slate-500">Slot GAM</div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-slate-600">Tempo rimanente: <b>{adSecondsLeft}s</b></div>
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${adSecondsLeft === 0 ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-slate-200 text-slate-500"}`}
                  disabled={adSecondsLeft !== 0}
                  onClick={async () => {
                    try {
                      const r: any = await api.adUnlock();
                      setUnlockExpiresAt(r?.expiresAt ? new Date(r.expiresAt).toISOString() : null);
                      setShowAd(false);
                      refetch();
                    } catch (e: any) {
                      setShowAd(false);
                      setError(e?.message || "Errore nello sblocco");
                    }
                  }}
                >
                  Sblocca
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-slate-600">Nessun dato.</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Dettaglio: ${safeUser.displayName}`}
          subtitle={`${safeLeague.name} · Totale punti: ${safeSummary.total} (Esatto ${safeSummary.exact} · 1X2 ${safeSummary.outcome} · Somma ${safeSummary.sumGoals}${features.underOver25 ? ` · U/O 2.5 ${safeSummary.underOver ?? 0}` : ""})`}
          right={<Link className="text-sm text-slate-600 hover:underline" to="/leaderboard">← Torna alla classifica</Link>}
        />
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
            <UserAvatar avatarId={(safeUser as any).avatarId || null} size={60} mode="full" className="shadow-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{safeUser.displayName}</div>
              <div className="mt-0.5 text-xs text-slate-600">{safeLeague.name}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[11px] font-medium text-slate-600">% Esatti</div><div className="mt-1 text-2xl font-semibold text-slate-100">{pctExact}%</div><div className="mt-1 text-xs text-slate-500">Su {finishedCount} partite finite</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[11px] font-medium text-slate-600">% 1X2</div><div className="mt-1 text-2xl font-semibold text-slate-100">{pctOutcome}%</div><div className="mt-1 text-xs text-slate-500">Su {finishedCount} partite finite</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[11px] font-medium text-slate-600">Streak 1X2</div><div className="mt-1 text-2xl font-semibold text-slate-100">{streakOutcome}</div><div className="mt-1 text-xs text-slate-500">Consecutivi corretti</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[11px] font-medium text-slate-600">Miglior giornata</div><div className="mt-1 text-2xl font-semibold text-slate-100">G{bestMatchday.md}</div><div className="mt-1 text-xs text-slate-500">{bestMatchday.pts} punti</div></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-slate-100">Andamento punti</div><div className="text-xs text-slate-500">Totale cumulativo per giornata</div></div><Badge tone="gray">Streak esatti {streakExact}</Badge></div>
              <div className="mt-2 text-slate-100">{renderMiniChart()}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-sm font-semibold text-slate-100">Sintesi</div>
              <div className="mt-1 text-xs text-slate-600">Esatti: <b>{exactHits}</b> · 1X2: <b>{outcomeHits}</b> · Partite finite: <b>{finishedCount}</b></div>
              <div className="mt-2 text-xs text-slate-500">Nota: le percentuali si basano solo sulle partite terminate con risultato disponibile.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Pronostici per giornata"
          subtitle={selectedMatchday === "ALL" ? "Stai visualizzando tutte le giornate." : `Stai visualizzando la giornata ${selectedMatchday}.`}
          right={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="min-w-[210px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={selectedMatchday}
                onChange={(e) => setSelectedMatchday(e.target.value)}
              >
                {matchdays.map((md) => (
                  <option key={md} value={String(md)}>
                    Giornata {md} · {byMatchday[md]?.length ?? 0} partite{String(md) === defaultMatchday ? " · corrente" : ""}
                  </option>
                ))}
                <option value="ALL">Tutte le giornate</option>
              </select>
              <Button variant="secondary" onClick={() => setSelectedMatchday(defaultMatchday)}>Vai alla giornata corrente</Button>
            </div>
          }
        />
        <CardContent>
          <div className="space-y-6">
            {visibleMatchdays.map((md) => (
              <div key={md} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-100">Giornata {md}</div>
                    <div className="text-xs text-slate-500">{byMatchday[md]?.length ?? 0} partite · {pointsByMatchday.get(md) ?? 0} punti</div>
                  </div>
                  {String(md) === defaultMatchday ? <Badge tone="green">Corrente</Badge> : null}
                </div>

                {(byMatchday[md] ?? []).map((it) => {
                  const m = it?.match;
                  const kickoff = m?.kickoffAt ? new Date(m.kickoffAt) : null;
                  const date = kickoff ? kickoff.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "";
                  const time = kickoff ? kickoff.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
                  const pr = it?.prediction ? `${it.prediction.homeGoals}-${it.prediction.awayGoals}` : "—";
                  const real = it?.real ? `${it.real.home}-${it.real.away}` : "—";
                  const pts = Number(it?.points?.total ?? 0);
                  const exactHit = Number(it?.points?.exact ?? 0) > 0;
                  const status = getStatus(it);
                  const shell = exactHit
                    ? "border-emerald-500/35 bg-emerald-500/10"
                    : pts > 0
                    ? "border-sky-500/25 bg-sky-500/10"
                    : "border-slate-800 bg-slate-950/60";

                  return (
                    <div key={m?.id ?? `${m?.kickoffAt}-${m?.homeTeam}`} className={`rounded-2xl border p-4 ${shell}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusPill status={status} />
                          {m?.group ? <Badge tone="gray">{String(m.group)}</Badge> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={exactHit ? "green" : pts > 0 ? "green" : "gray"}>{pts} pt</Badge>
                          {exactHit ? <span className="text-xs font-semibold text-emerald-300">Pronostico esatto ✅</span> : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2"><TeamDot name={m?.homeTeam || ""} logo={m?.homeLogo} /><div className="truncate text-sm font-semibold text-slate-100">{m?.homeTeam}</div></div>
                          <div className="flex items-center gap-2"><TeamDot name={m?.awayTeam || ""} logo={m?.awayLogo} /><div className="truncate text-sm font-semibold text-slate-100">{m?.awayTeam}</div></div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">Pronostico</div>
                          <div className="mt-1 text-2xl font-extrabold text-slate-100">{pr}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Reale</div>
                          <div className="mt-1 text-lg font-bold text-slate-200">{real}</div>
                        </div>
                        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                          <div className="flex items-center justify-between"><span className="text-slate-400">Data</span><span className="font-medium text-slate-100">{date} · {time}</span></div>
                          <div className="flex items-center justify-between"><span className="text-slate-400">Punti match</span><span className="font-semibold text-slate-100">{pts}</span></div>
                          <div className="flex items-start justify-between gap-3"><span className="text-slate-400">Breakdown</span><span className="text-right text-slate-200">{buildBreakdown(it?.points)}</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {safeItems.length === 0 ? <div className="py-6 text-sm text-slate-600">Nessuna partita.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
