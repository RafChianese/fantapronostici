import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";
import { UserAvatar } from "../components/Avatar";
import { useAuth } from "../lib/auth";
import { showNativeRewardedAd } from "../lib/nativeAds";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMatchday, setSelectedMatchday] = useState<number | "all">("all");

  const refetch = () => {
    show();
    setLoading(true);
    setError(null);
    setAdRequired(false);
    api.userSummary(id!)
      .then((d) => {
        setData(d);
      })
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
    // Preload unlock status (optional UX)
    api.adUnlockStatus()
      .then((s: any) => {
        if (cancelled) return;
        setUnlockExpiresAt(s?.expiresAt ? new Date(s.expiresAt).toISOString() : null);
      })
      .catch(() => {
        // ignore
      });

    setTimeout(() => {
      if (cancelled) return;
      refetch();
    }, 0);
    return () => { cancelled = true; };
  }, [id, activeLeagueId]);

  useEffect(() => {
    if (!showAd) return;

    // Demo: countdown immediato.
    // Reale (GAM/GPT): avvia il countdown solo dopo il render dello slot (o fallback se GPT non è disponibile).
    setAdSecondsLeft(15);

    let interval: any = null;
    let fallbackTimer: any = null;
    let started = false;

    const startCountdown = () => {
      if (started) return;
      started = true;
      interval = setInterval(() => {
        setAdSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
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

      // Fallback: se GPT non è disponibile o manca adUnit, non bloccare l'utente all'infinito.
      fallbackTimer = setTimeout(() => startCountdown(), 2000);

      if (w?.googletag && adUnit) {
        w.googletag.cmd = w.googletag.cmd || [];
        w.googletag.cmd.push(() => {
          const slotId = "gam-rewarded-slot";

          // Start countdown only after slot render attempt (filled or empty).
          try {
            w.googletag.pubads().addEventListener?.("slotRenderEnded", (e: any) => {
              if (e?.slot && typeof e.slot.getSlotElementId === "function" && e.slot.getSlotElementId() === slotId) {
                startCountdown();
              }
            });
          } catch {
            // ignore
          }

          // Avoid duplicate slot definitions
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
    } catch {
      // ignore
    }

    return () => {
      if (interval) clearInterval(interval);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [showAd, demoAdsEnabled]);

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
  

  // --- Statistiche (gamification) ---
  const finishedItems = safeItems
    .filter((it: any) => !!it?.prediction && !!it?.real)
    .slice()
    .sort((a: any, b: any) => new Date(a?.match?.kickoffAt).getTime() - new Date(b?.match?.kickoffAt).getTime());

  const isExactHit = (it: any) => {
    if (!it?.prediction || !it?.real) return false;
    return Number(it.prediction.homeGoals) == Number(it.real.home) && Number(it.prediction.awayGoals) == Number(it.real.away);
  };

  const isOutcomeHit = (it: any) => {
    if (!it?.prediction || !it?.real) return false;
    const ph = Number(it.prediction.homeGoals);
    const pa = Number(it.prediction.awayGoals);
    const rh = Number(it.real.home);
    const ra = Number(it.real.away);
    const p = ph === pa ? 0 : ph > pa ? 1 : -1;
    const r = rh === ra ? 0 : rh > ra ? 1 : -1;
    return p === r;
  };

  const totalFinished = finishedItems.length;
  const exactHits = finishedItems.filter(isExactHit).length;
  const outcomeHits = finishedItems.filter(isOutcomeHit).length;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const pctExact = pct(exactHits, totalFinished);
  const pctOutcome = pct(outcomeHits, totalFinished);

  const streakFromEnd = (fn) => {
    let s = 0;
    for (let i = finishedItems.length - 1; i >= 0; i--) {
      if (fn(finishedItems[i])) s += 1;
      else break;
    }
    return s;
  };

  const streakOutcome = streakFromEnd(isOutcomeHit);
  const streakExact = streakFromEnd(isExactHit);

  const pointsByMatchday = matchdays.reduce((acc: Record<number, number>, md) => {
    const items = byMatchday[String(md)] ?? [];
    const tot = items.reduce((s: number, it: any) => s + Number(it?.points?.total ?? 0), 0);
    acc[md] = tot;
    return acc;
  }, {} as any);

  const bestMatchday = (() => {
    let bestMd: number | null = null;
    let bestPts = -Infinity;
    for (const md of matchdays) {
      const v = pointsByMatchday[md] ?? 0;
      if (v > bestPts) {
        bestPts = v;
        bestMd = md;
      }
    }
    return { md: bestMd, pts: Number.isFinite(bestPts) ? bestPts : 0 };
  })();

  const cumulativeSeries = (() => {
    let run = 0;
    return matchdays.map((md) => {
      run += Number(pointsByMatchday[md] ?? 0);
      return { md, y: run };
    });
  })();

  const renderMiniChart = (series: { md: number; y: number }[]) => {
    if (!series.length) return null;
    const w = 320;
    const h = 90;
    const pad = 10;
    const ys = series.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = maxY - minY || 1;

    const xStep = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
    const xy = series.map((p, i) => {
      const x = pad + i * xStep;
      const y = pad + (h - pad * 2) * (1 - (p.y - minY) / span);
      return { x, y };
    });

    const d = xy
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Andamento punti">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-slate-700" />
        ))}
      </svg>
    );
  };
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
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              onClick={async () => {
                // Native (Capacitor) flow: show rewarded ad full-screen, then unlock.
                // Web flow: open modal with GPT slot/demo countdown.
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
                } catch {
                  // ignore and fallback to modal
                }
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
                    <div className="opacity-80">
                      Demo attiva: simulazione di una pubblicità con countdown.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 font-medium">Spazio pubblicitario</div>
                    <div className="opacity-80">
                      Se hai integrato Google Ad Manager (GPT), qui verrà renderizzato lo slot configurato.
                    </div>
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

  // API shape: { league, user, detail: [...], totals }
  const safeLeague = data?.league ?? { name: "Lega" };
  const safeUser = data?.user ?? { displayName: "Utente" };
  const safeItems: any[] = Array.isArray(data?.detail) ? data.detail : [];
  const features = data?.features ?? { underOver25: false, matchdayAwards: false };
  const safeSummary = data?.totals ?? { total: 0, exact: 0, outcome: 0, sumGoals: 0, underOver: 0 };

  const buildBreakdown = (pts: any) => {
    const parts: string[] = [];
    if ((pts?.exact ?? 0) > 0) parts.push(`Esatto ${pts.exact}`);
    if ((pts?.outcome ?? 0) > 0) parts.push(`1X2 ${pts.outcome}`);
    if ((pts?.sumGoals ?? 0) > 0) parts.push(`Somma ${pts.sumGoals}`);
    if (!!features.underOver25 && (pts?.underOver ?? 0) > 0) parts.push(`2.5 ${pts.underOver}`);
    return parts.length ? parts.join(" · ") : "—";
  };

  const byMatchday = safeItems.reduce((acc: Record<string, any[]>, it: any) => {
    const md = String(it?.match?.matchday ?? 1);
    (acc[md] ??= []).push(it);
    return acc;
  }, {});

  const matchdays = Object.keys(byMatchday)
    .map((s) => Number(s))
    .sort((a, b) => a - b);

  const getStatus = (it: any): "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" => {
    const raw = String(it?.match?.status || "NOT_STARTED");
    if (raw === "FINISHED" || raw === "IN_PROGRESS" || raw === "NOT_STARTED") return raw as any;
    return "NOT_STARTED";
  };

  const nowTs = Date.now();
  const isAllFinished = (md: number) => {
    const items = byMatchday[String(md)] ?? [];
    if (!items.length) return true;
    return items.every((it: any) => {
      const s = getStatus(it);
      if (s === "FINISHED") return true;
      // Fallback: if status missing, infer from kickoffAt (very conservative)
      const ko = new Date(it?.match?.kickoffAt).getTime();
      return Number.isFinite(ko) ? ko < nowTs - 4 * 60 * 60 * 1000 : false;
    });
  };

  const isAllNotStarted = (md: number) => {
    const items = byMatchday[String(md)] ?? [];
    if (!items.length) return false;
    return items.every((it: any) => {
      const s = getStatus(it);
      if (s === "NOT_STARTED") return true;
      const ko = new Date(it?.match?.kickoffAt).getTime();
      return Number.isFinite(ko) ? ko > nowTs : false;
    });
  };

  const currentMatchday = (() => {
    const md = matchdays.find((m) => !isAllFinished(m));
    return md ?? matchdays[0] ?? 1;
  })();

  const nextMatchday = (() => {
    const after = matchdays.filter((m) => m > currentMatchday);
    // "Prossima" = prima giornata successiva NON ancora iniziata.
    const md = after.find((m) => isAllNotStarted(m));
    return md ?? null;
  })();

  useEffect(() => {
    const mdParam = Number(searchParams.get("md") || 0);
    if (mdParam && matchdays.includes(mdParam)) {
      setSelectedMatchday(mdParam);
      return;
    }
    setSelectedMatchday(currentMatchday || matchdays[0] || "all");
  }, [searchParams, currentMatchday, matchdays]);

  const visibleMatchdays = selectedMatchday === "all"
    ? matchdays
    : [selectedMatchday].filter((x): x is number => typeof x === "number");

  const selectedMatchdayLabel = selectedMatchday === "all" ? "Tutte le giornate" : `Giornata ${selectedMatchday}`;

  const TeamDot = ({ name, logo }: { name: string; logo?: string | null }) => {
    if (logo) return <img src={logo} alt={name} className="h-6 w-6 rounded-full object-contain" />;
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-300">
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  };

  const StatusDot = ({ status }: { status: string }) => {
    const s = String(status || "").toUpperCase();
    const base = "inline-block h-2.5 w-2.5 rounded-full";
    if (s === "IN_PROGRESS" || s === "LIVE") return <span className={`${base} bg-green-500 animate-pulse`} title="In corso" />;
    if (s === "FINISHED") return <span className={`${base} bg-slate-400`} title="Finita" />;
    return <span className={`${base} bg-blue-500`} title="Non iniziata" />;
  };

  // --- Mini dashboard (Step 3): statistiche + andamento punti ---
  const finished = safeItems
    .filter((it: any) => !!it?.prediction && !!it?.real && getStatus(it) === "FINISHED")
    .slice()
    .sort((a: any, b: any) => new Date(a?.match?.kickoffAt || 0).getTime() - new Date(b?.match?.kickoffAt || 0).getTime());

  const isExactHit = (it: any) => {
    const pr = it?.prediction;
    const r = it?.real;
    if (!pr || !r) return false;
    return Number(pr.homeGoals) == Number(r.home) && Number(pr.awayGoals) == Number(r.away);
  };

  const outcomeOf = (h: number, a: number) => (h > a ? "1" : h < a ? "2" : "X");

  const isOutcomeHit = (it: any) => {
    const pr = it?.prediction;
    const r = it?.real;
    if (!pr || !r) return false;
    const o1 = outcomeOf(Number(pr.homeGoals), Number(pr.awayGoals));
    const o2 = outcomeOf(Number(r.home), Number(r.away));
    return o1 === o2;
  };

  const finishedCount = finished.length;
  const exactHits = finished.filter(isExactHit).length;
  const outcomeHits = finished.filter(isOutcomeHit).length;

  const pctExact = finishedCount ? Math.round((exactHits / finishedCount) * 100) : 0;
  const pctOutcome = finishedCount ? Math.round((outcomeHits / finishedCount) * 100) : 0;

  const streakFromEnd = (fn: (it: any) => boolean) => {
    let s = 0;
    for (let i = finished.length - 1; i >= 0; i--) {
      if (fn(finished[i])) s += 1;
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
  let cum = 0;
  const chartSeries = mdSeries.map((s) => {
    cum += s.pts;
    return { label: `G${s.md}`, y: cum };
  });

  const bestMatchday = mdSeries.reduce(
    (acc, it) => (it.pts > acc.pts ? it : acc),
    mdSeries[0] ?? { md: 1, pts: 0 }
  );

  const renderMiniChart = () => {
    if (chartSeries.length < 2) {
      return <div className="text-xs text-slate-500">Nessun andamento disponibile.</div>;
    }
    const w = 100;
    const h = 60;
    const pad = 6;
    const ys = chartSeries.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const xStep = (w - pad * 2) / (chartSeries.length - 1);
    const scaleY = (y: number) => {
      if (maxY === minY) return h / 2;
      const t = (y - minY) / (maxY - minY);
      return pad + (h - pad * 2) * (1 - t);
    };
    const pts = chartSeries.map((p, i) => ({ x: pad + i * xStep, y: scaleY(p.y) }));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2.2} className="text-teal-600" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.2} className="text-teal-600" fill="currentColor" />
          ))}
        </svg>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{chartSeries[0].label}</span>
          <span>{chartSeries[chartSeries.length - 1].label}</span>
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Dettaglio: ${safeUser.displayName}`}
          subtitle={`${safeLeague.name} · Totale punti: ${safeSummary.total} (Esatto ${safeSummary.exact} · 1X2 ${safeSummary.outcome} · Somma ${safeSummary.sumGoals}${features.underOver25 ? ` · 2.5 ${safeSummary.underOver ?? 0}` : ""})`}
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
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-600">% Esatti</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{pctExact}%</div>
              <div className="mt-1 text-xs text-slate-500">Su {finishedCount} partite finite</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-600">% 1X2</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{pctOutcome}%</div>
              <div className="mt-1 text-xs text-slate-500">Su {finishedCount} partite finite</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-600">Streak 1X2</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{streakOutcome}</div>
              <div className="mt-1 text-xs text-slate-500">Consecutivi corretti</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-600">Miglior giornata</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">G{bestMatchday.md}</div>
              <div className="mt-1 text-xs text-slate-500">{bestMatchday.pts} punti</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Andamento punti</div>
                  <div className="text-xs text-slate-500">Totale cumulativo per giornata</div>
                </div>
                <Badge tone="gray">Streak esatti {streakExact}</Badge>
              </div>
              <div className="mt-2 text-slate-100">{renderMiniChart()}</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-sm font-semibold text-slate-100">Sintesi</div>
              <div className="mt-1 text-xs text-slate-600">
                Esatti: <b>{exactHits}</b> · 1X2: <b>{outcomeHits}</b> · Partite finite: <b>{finishedCount}</b>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Nota: le percentuali si basano solo sulle partite terminate con risultato disponibile.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Partite e punteggi"
          subtitle={`Visualizzazione: ${selectedMatchdayLabel}`}
          right={
            <div className="flex items-center gap-2">
              <select
                className="min-w-[180px] rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:ring-2 focus:ring-rose-500/30"
                value={selectedMatchday === "all" ? "all" : String(selectedMatchday)}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = v === "all" ? "all" : Number(v);
                  setSelectedMatchday(next as any);
                  const sp = new URLSearchParams(searchParams);
                  if (v === "all") sp.delete("md");
                  else sp.set("md", v);
                  setSearchParams(sp, { replace: true });
                }}
              >
                <option value="all">Tutte le giornate</option>
                {matchdays.map((md) => (
                  <option key={md} value={md}>
                    Giornata {md}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vista attiva</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{selectedMatchdayLabel}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Giornata corrente</div>
              <div className="mt-1 text-sm font-bold text-slate-100">Giornata {currentMatchday}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prossima giornata</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{nextMatchday ? `Giornata ${nextMatchday}` : "—"}</div>
            </div>
          </div>
          <div className="space-y-6">
            {visibleMatchdays.map((md) => (
              <Card key={md} className="border border-slate-800">
                <CardHeader
                  title={`Giornata ${md}`}
                  subtitle={`${byMatchday[String(md)]?.length ?? 0} partite`}
                />
                <CardContent className="space-y-3">
                  {byMatchday[String(md)]?.map((it: any) => {
                    const m = it?.match;
                    const kickoff = m?.kickoffAt ? new Date(m.kickoffAt) : null;
                    const date = kickoff
                      ? `${String(kickoff.getDate()).padStart(2, "0")}.${String(kickoff.getMonth() + 1).padStart(2, "0")}`
                      : "";
                    const time = kickoff
                      ? `${String(kickoff.getHours()).padStart(2, "0")}:${String(kickoff.getMinutes()).padStart(2, "0")}`
                      : "";

                    const pr = it?.prediction ? `${it.prediction.homeGoals}-${it.prediction.awayGoals}` : "—";
                    const real = it?.real ? `${it.real.home}-${it.real.away}` : "—";
                    const pts = it?.points?.total ?? 0;
                    const status = getStatus(it);

                    return (
                      <div key={m?.id ?? `${m?.kickoffAt}-${m?.homeTeam}`} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <StatusDot status={status} />
                          </div>
                          <Badge tone={pts > 0 ? "green" : "gray"}>{pts} pt</Badge>
                        </div>

                        <div className="mt-2 grid grid-cols-[54px_1fr] items-center gap-2">
                          <div className="text-xs text-slate-600">
                            <div className="font-semibold">{date}</div>
                            <div className="text-slate-500">{time}</div>
                          </div>

                          <div className="min-w-0">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <TeamDot name={m?.homeTeam || ""} logo={m?.homeLogo} />
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{m?.homeTeam}</div>
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                <TeamDot name={m?.awayTeam || ""} logo={m?.awayLogo} />
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{m?.awayTeam}</div>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              Pronostico: <span className="font-medium">{pr}</span>
                              <span className="mx-2 text-slate-400">·</span>
                              Reale: <span className="font-medium">{real}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{buildBreakdown(it?.points)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(!byMatchday[String(md)] || byMatchday[String(md)].length === 0) ? (
                    <div className="py-3 text-sm text-slate-600">Nessuna partita.</div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {safeItems.length === 0 ? <div className="py-6 text-sm text-slate-600">Nessuna partita.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
