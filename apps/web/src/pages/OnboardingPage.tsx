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
  // Creation is intentionally minimal: name only (customization happens in Area admin)

  const [joinCode, setJoinCode] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [showCreateLeague, setShowCreateLeague] = useState(false);

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold">Entra in una lega o creane una</h1>
        <p className="mt-1 text-sm text-orange-50/60">
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
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-amber-100/15 bg-white/[0.055] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <LeagueAvatar
                      leagueId={m.league.id}
                      leagueName={m.league.name}
                      logoSrc={m.league?.branding?.logoUrl || m.league?.branding?.logoDataUrl || null}
                      size={44}
                    />
                    <div>
                      <div className="font-medium">{m.league.name}</div>
                      <div className="text-xs text-orange-50/60">Codice: {m.league.code} • Ruolo: {m.role}</div>
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
                <div key={m.id} className="rounded-xl border border-amber-100/15 bg-white/[0.055] px-4 py-3">
                  <div className="font-medium">{m.league.name}</div>
                  <div className="text-xs text-orange-50/60">Codice: {m.league.code} • Stato: {m.status}</div>
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
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      setErr(""); setMsg("");
                      const r = await api.createLeague(leagueName.trim());
                      await refreshMe();
                      setActiveLeague(r.league.id);
                      setMsg(`Lega creata! Codice: ${r.league.code}`);
                      setLeagueName("");
                      nav("/admin");
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
