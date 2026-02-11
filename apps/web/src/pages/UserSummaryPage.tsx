import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Badge, Button, Card, CardContent, CardHeader } from "../components/ui";
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
  const [showAllMatchdays, setShowAllMatchdays] = useState(false);

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

  if (loading) return null;

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
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Pubblicità</div>
                <button className="text-sm text-slate-500 hover:underline" onClick={() => setShowAd(false)}>
                  Chiudi
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
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
                    <div id="gam-rewarded-slot" className="mt-3 flex min-h-[260px] items-center justify-center rounded-xl border border-slate-200 bg-white">
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

  const visibleMatchdays = showAllMatchdays
    ? matchdays
    : [currentMatchday, nextMatchday].filter((x): x is number => typeof x === "number");

  const TeamDot = ({ name, logo }: { name: string; logo?: string | null }) => {
    if (logo) return <img src={logo} alt={name} className="h-6 w-6 rounded-full object-contain" />;
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-700">
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  };

  const statusBadge = (s: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED") => {
    if (s === "FINISHED") return <Badge tone="green">FINITA</Badge>;
    if (s === "IN_PROGRESS") return <Badge tone="blue">IN CORSO</Badge>;
    return <Badge>NON INIZIATA</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Dettaglio: ${safeUser.displayName}`}
          subtitle={`${safeLeague.name} · Totale punti: ${safeSummary.total} (Esatto ${safeSummary.exact} · 1X2 ${safeSummary.outcome} · Somma ${safeSummary.sumGoals}${features.underOver25 ? ` · 2.5 ${safeSummary.underOver ?? 0}` : ""})`}
          right={<Link className="text-sm text-slate-600 hover:underline" to="/leaderboard">← Torna alla classifica</Link>}
        />
        <CardContent className="text-sm text-slate-600">
          Elenco partite con pronostico, risultato reale e punti ottenuti.
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Partite e punteggi"
          subtitle={showAllMatchdays ? "Stai visualizzando tutte le giornate." : "Di default vedi solo la giornata in corso e la prossima (non iniziata)."}
          right={
            <Button variant="secondary" onClick={() => setShowAllMatchdays((v) => !v)}>
              {showAllMatchdays ? "Mostra solo (corrente + prossima)" : "Mostra tutte"}
            </Button>
          }
        />
        <CardContent>
          <div className="space-y-6">
            {visibleMatchdays.map((md) => (
              <Card key={md} className="border border-slate-100">
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
                      <div key={m?.id ?? `${m?.kickoffAt}-${m?.homeTeam}`} className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {statusBadge(status)}
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
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{m?.homeTeam}</div>
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                <TeamDot name={m?.awayTeam || ""} logo={m?.awayLogo} />
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{m?.awayTeam}</div>
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
