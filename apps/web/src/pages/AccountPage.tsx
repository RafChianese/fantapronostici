import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";

export default function AccountPage() {
  const { user, memberships, refreshMe, activeLeagueId } = useAuth();

  const activeLeague = useMemo(() => memberships.find((m) => m.league.id === activeLeagueId)?.league, [memberships, activeLeagueId]);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOk, setProfileOk] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdOk, setPwdOk] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user?.displayName]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader title="Account" subtitle={user ? `Sei loggato come ${user.email}` : ""} />
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Ruolo globale</div>
              <div className="font-semibold">{user?.globalRole === "SUPER_ADMIN" ? "Dashboard Superadmin" : "Utente"}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Lega attiva</div>
              <div className="font-semibold">{activeLeague?.name || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Profilo" subtitle="Aggiorna il nome mostrato agli altri utenti." />
        <CardContent className="space-y-4">
          {profileError ? <Alert tone="danger">{profileError}</Alert> : null}
          {profileOk ? <Alert tone="success">Profilo aggiornato</Alert> : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Nome visualizzato</div>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Es. Mario Rossi" />
          </div>

          <Button
            disabled={savingProfile}
            onClick={async () => {
              setProfileError(null);
              setProfileOk(false);
              const dn = displayName.trim();
              if (dn.length < 2) {
                setProfileError("Il nome deve avere almeno 2 caratteri");
                return;
              }
              setSavingProfile(true);
              try {
                await api.updateProfile(dn);
                await refreshMe();
                setProfileOk(true);
              } catch (err: any) {
                setProfileError(err.message || "Errore");
              } finally {
                setSavingProfile(false);
              }
            }}
          >
            Salva profilo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Sicurezza" subtitle="Reimposta la password del tuo account." />
        <CardContent className="space-y-4">
          {pwdError ? <Alert tone="danger">{pwdError}</Alert> : null}
          {pwdOk ? <Alert tone="success">Password aggiornata</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="text-sm font-medium">Password attuale</div>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Nuova password</div>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Ripeti nuova password</div>
              <Input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
            </div>
          </div>

          <Button
            disabled={savingPwd}
            onClick={async () => {
              setPwdError(null);
              setPwdOk(false);

              if (newPassword.length < 8) {
                setPwdError("La nuova password deve avere almeno 8 caratteri");
                return;
              }
              if (newPassword !== newPassword2) {
                setPwdError("Le password non coincidono");
                return;
              }

              setSavingPwd(true);
              try {
                await api.changePassword(currentPassword, newPassword);
                setPwdOk(true);
                setCurrentPassword("");
                setNewPassword("");
                setNewPassword2("");
              } catch (err: any) {
                setPwdError(err.message || "Errore");
              } finally {
                setSavingPwd(false);
              }
            }}
          >
            Aggiorna password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Le mie leghe" subtitle="Riepilogo delle leghe a cui partecipi." />
        <CardContent className="space-y-2">
          {(memberships || []).length === 0 ? <div className="text-sm text-slate-600">Nessuna lega.</div> : null}
          {(memberships || []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="font-semibold">{m.league.name}</div>
                <div className="text-xs text-slate-500">
                  Stato: {m.status} • Ruolo: {m.role}
                </div>
              </div>
              <div className="text-xs text-slate-500">{m.league.id === activeLeagueId ? "Attiva" : ""}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
