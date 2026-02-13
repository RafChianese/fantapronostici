import React, { useMemo, useState } from "react";
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
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-800"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setLeagueLogoFile(f);
                        if (!f) return setLeagueLogoPreview("");
                        const url = URL.createObjectURL(f);
                        setLeagueLogoPreview(url);
                      }}
                    />
                    <div className="mt-1 text-xs text-slate-600">Consigliato: immagine quadrata (PNG/JPG).</div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      setErr(""); setMsg("");
                      const r = await api.createLeague(leagueName.trim());
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
