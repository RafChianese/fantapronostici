import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { LeagueAvatar } from "../components/LeagueAvatar";

export default function OnboardingPage() {
  const { memberships, refreshMe, setActiveLeague } = useAuth();
  const nav = useNavigate();

  const approved = useMemo(() => memberships.filter((m) => m.status === "APPROVED"), [memberships]);
  const pending = useMemo(() => memberships.filter((m) => m.status === "PENDING"), [memberships]);

  const [leagueName, setLeagueName] = useState("");
  const [leagueLogoFile, setLeagueLogoFile] = useState<File | null>(null);
  const [leagueLogoPreview, setLeagueLogoPreview] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Optional monetization
  const [entryFeeEuro, setEntryFeeEuro] = useState<string>("");
  const [prizeCount, setPrizeCount] = useState<number>(0);
  const [prizeEuros, setPrizeEuros] = useState<Record<number, string>>({});

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Errore lettura file"));
      r.readAsDataURL(file);
    });
  }

  const [joinCode, setJoinCode] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [showCreateLeague, setShowCreateLeague] = useState(false);

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold">Entra in una lega o creane una</h1>
        <p className="mt-1 text-sm text-slate-600">
          Per inserire pronostici devi appartenere ad almeno una lega.
        </p>
      </div>

      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {err ? <Alert tone="danger">{err}</Alert> : null}

      {approved.length > 0 ? (
        <Card data-tour="join-league">
          <CardHeader title="Le tue leghe" subtitle="Seleziona e vai all'app" />
          <CardContent>
            <div className="space-y-2">
              {approved.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <LeagueAvatar leagueId={m.league.id} leagueName={m.league.name} size={44} />
                    <div>
                      <div className="font-medium">{m.league.name}</div>
                      <div className="text-xs text-slate-600">Codice: {m.league.code} • Ruolo: {m.role}</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setActiveLeague(m.league.id);
                      nav("/");
                    }}
                  >
                    Apri
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card>
          <CardHeader title="Richieste in attesa" subtitle="In attesa di approvazione dall'admin della lega" />
          <CardContent>
            <div className="space-y-2">
              {pending.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="font-medium">{m.league.name}</div>
                  <div className="text-xs text-slate-600">Codice: {m.league.code} • Stato: {m.status}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className={`grid gap-6 ${showCreateLeague ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
        <Card>
          <CardHeader title="Entra in una lega" subtitle="Inserisci il codice e invia richiesta" />
          <CardContent>
            <div className="space-y-3">
              <Input label="Codice lega" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Es. DEMO" />
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    setErr(""); setMsg("");
                    const r = await api.joinLeague(joinCode.trim());
                    await refreshMe();
                    setMsg(`Richiesta inviata alla lega ${r.league.name} (${r.league.code}).`);
                    setJoinCode("");
                  } catch (e: any) {
                    setErr(e?.message || "Errore");
                  }
                }}
              >
                Invia richiesta
              </Button>
            </div>
          </CardContent>
        </Card>

        {showCreateLeague ? (
          <Card data-tour="create-league">
            <CardHeader title="Crea una lega" subtitle="Diventi admin della tua nuova lega" />
            <CardContent>
              <div className="space-y-3">
                <Input label="Nome lega" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="Es. Amici del Bar" />
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    {leagueLogoPreview ? (
                      <img src={leagueLogoPreview} alt="Logo lega" className="h-12 w-12 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="h-12 w-12 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-600 font-semibold">
                        {leagueName.trim() ? leagueName.trim().slice(0, 2).toUpperCase() : "LG"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-800">Logo lega (facoltativo)</label>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setLeagueLogoFile(f);
                          if (!f) return setLeagueLogoPreview("");
                          const url = URL.createObjectURL(f);
                          setLeagueLogoPreview(url);
                        }}
                      />

                      <Button
                        variant="ghost"
                        onClick={() => logoInputRef.current?.click()}
                        className="!px-4"
                      >
                        Carica logo
                      </Button>

                      {leagueLogoFile ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setLeagueLogoFile(null);
                            setLeagueLogoPreview("");
                            if (logoInputRef.current) logoInputRef.current.value = "";
                          }}
                          className="!px-4"
                        >
                          Rimuovi
                        </Button>
                      ) : null}

                      <span className="text-xs text-slate-600">PNG/JPG/WebP • max ~1.5MB</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Quota e premi (facoltativo)</div>
                      <div className="text-xs text-slate-600">Questi valori appariranno nel regolamento e saranno modificabili in Area admin.</div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Quota di partecipazione (€)"
                      type="number"
                      value={entryFeeEuro}
                      placeholder="Es. 10"
                      onChange={(e) => setEntryFeeEuro(e.target.value)}
                    />
                    <Input
                      label="Numero posizioni a premio"
                      type="number"
                      value={String(prizeCount)}
                      min={0}
                      max={50}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(50, Number(e.target.value || 0)));
                        setPrizeCount(v);
                      }}
                    />
                  </div>

                  {prizeCount > 0 ? (
                    <div className="space-y-2">
                      {Array.from({ length: prizeCount }).map((_, idx) => {
                        const pos = idx + 1;
                        return (
                          <Input
                            key={pos}
                            label={`${pos}° posto (€)`}
                            type="number"
                            value={prizeEuros[pos] || ""}
                            placeholder={pos === 1 ? "Es. 200" : ""}
                            onChange={(e) => setPrizeEuros((p) => ({ ...p, [pos]: e.target.value }))}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      setErr(""); setMsg("");
                      const entryFee = entryFeeEuro.trim() ? Math.round(Number(entryFeeEuro) * 100) : undefined;
                      const prizes = prizeCount > 0
                        ? Array.from({ length: prizeCount }).map((_, idx) => {
                            const pos = idx + 1;
                            const amount = prizeEuros[pos]?.trim() ? Math.round(Number(prizeEuros[pos]) * 100) : 0;
                            return { position: pos, amountCents: amount };
                          })
                        : undefined;
                      const r = await api.createLeague(leagueName.trim(), {
                        ...(typeof entryFee === "number" && !Number.isNaN(entryFee) ? { entryFeeCents: Math.max(0, entryFee) } : {}),
                        ...(prizes ? { prizes } : {}),
                      });
                      // Optional logo upload (non-blocking)
                      try {
                        if (leagueLogoFile) {
                          const dataUrl = await fileToDataUrl(leagueLogoFile);
                          await api.uploadLeagueLogo(r.league.id, dataUrl);
                        }
                      } catch (e) {
                        // ignore upload errors (logo is optional)
                      }
                      await refreshMe();
                      setActiveLeague(r.league.id);
                      setMsg(`Lega creata! Codice: ${r.league.code}`);
                      setLeagueLogoFile(null);
                      setLeagueLogoPreview("");
                      setEntryFeeEuro("");
                      setPrizeCount(0);
                      setPrizeEuros({});
                      nav("/");
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    }
                  }}
                >
                  Crea lega
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="pt-2">
        <Button
          variant={showCreateLeague ? "ghost" : "primary"}
          className="w-full"
          data-tour="toggle-create-league"
          onClick={() => setShowCreateLeague((v) => !v)}
        >
          {showCreateLeague ? "Nascondi creazione lega" : "Crea la tua lega"}
        </Button>
      </div>
    </div>
  );
}
