import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Badge, Card, CardContent, CardHeader, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { showNativeRewardedAd } from "../lib/nativeAds";

export default function UserSummaryPage() {
  const { id } = useParams();
  const { activeLeagueId } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adRequired, setAdRequired] = useState(false);
  const [unlockMinutes, setUnlockMinutes] = useState<number>(5);
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState(15);
  const [demoAdsEnabled, setDemoAdsEnabled] = useState(true);

  const refetch = () => {
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
      .finally(() => setLoading(false));
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

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-600"><Spinner /> Caricamento…</div>;

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
        <CardHeader title="Partite e punteggi" subtitle="Per ogni match: pronostico, risultato reale e punti (raggruppati per giornata)." />
        <CardContent>
          <div className="space-y-6">
            {matchdays.map((md) => (
              <div key={md} className="rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="font-semibold">Giornata {md}</div>
                  <div className="text-xs text-slate-500">{byMatchday[String(md)]?.length ?? 0} partite</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {byMatchday[String(md)]?.map((it: any) => (
                    <div key={it?.match?.id ?? `${it?.match?.kickoffAt}-${it?.match?.homeTeam}`} className="px-4 py-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium">{it.match.homeTeam} <span className="text-slate-400">vs</span> {it.match.awayTeam}</div>
                          <div className="text-sm text-slate-500">{new Date(it.match.kickoffAt).toLocaleString()}</div>
                          <div className="text-sm text-slate-600">
                            Pronostico: <span className="font-medium">{it.prediction ? `${it.prediction.homeGoals}-${it.prediction.awayGoals}` : "—"}</span>{" "}
                            · Reale: <span className="font-medium">{it.real ? `${it.real.home}-${it.real.away}` : "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge tone={(it?.points?.total ?? 0) > 0 ? "green" : "gray"}>{it?.points?.total ?? 0} pt</Badge>
                          <div className="text-xs text-slate-500">{buildBreakdown(it?.points)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {safeItems.length === 0 ? <div className="py-6 text-sm text-slate-600">Nessuna partita.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
