import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { LeagueAvatar } from "../components/LeagueAvatar";
import { UserAvatar } from "../components/Avatar";
import { AVATARS } from "../config/avatars";

export default function AccountPage() {
  const { user, memberships, refreshMe, activeLeagueId } = useAuth();
  const toast = useToast();

  const activeLeague = useMemo(() => memberships.find((m) => m.league.id === activeLeagueId)?.league, [memberships, activeLeagueId]);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOk, setProfileOk] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Avatar preset
  const [avatarId, setAvatarId] = useState<string>("avatar_01");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarOk, setAvatarOk] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Password section removed: access is OAuth-only.

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
    setAvatarId((user as any)?.avatarId || "avatar_01");
  }, [user?.displayName, (user as any)?.avatarId]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {activeLeague ? (
        <Card>
          <CardHeader title="Lega attiva" subtitle="Questa è la lega selezionata per pronostici e classifica." />
          <CardContent className="flex items-center gap-3">
            <LeagueAvatar league={activeLeague as any} size={44} />
            <div className="min-w-0">
              <div className="font-semibold text-white truncate">{activeLeague.name}</div>
              <div className="text-xs text-cyan-100/60">Codice: {activeLeague.code}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                await api.updateProfile({ displayName: dn });
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
        <CardHeader title="Avatar" subtitle="Scegli uno tra gli avatar disponibili." />
        <CardContent className="space-y-4">
          {avatarError ? <Alert tone="danger">{avatarError}</Alert> : null}
          {avatarOk ? <Alert tone="success">Avatar aggiornato</Alert> : null}

          <div className="flex items-center gap-4 rounded-2xl border border-cyan-100/15 bg-cyan-950/35 p-4">
            <UserAvatar avatarId={avatarId} size={96} mode="full" className="shadow" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Anteprima</div>
              <div className="text-xs text-cyan-100/60">Seleziona un avatar qui sotto e salva.</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {AVATARS.map((a) => {
              const active = a.id === (avatarId as any);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatarId(a.id)}
                  className={`rounded-2xl p-2 ring-2 transition ${active ? "ring-sky-500" : "ring-transparent hover:ring-slate-200"}`}
                >
                  <div className="h-20 w-full overflow-hidden rounded-xl bg-cyan-100/5 ring-1 ring-slate-800">
                    <img src={a.src} alt={a.label} className="h-full w-full object-contain" loading="lazy" />
                  </div>
                </button>
              );
            })}
          </div>

          <Button
            disabled={savingAvatar || !user}
            onClick={async () => {
              if (!user) return;
              setAvatarError(null);
              setAvatarOk(false);
              setSavingAvatar(true);
              try {
                await api.updateProfile({ avatarId });
                await refreshMe();
                setAvatarOk(true);
                toast.success("Avatar aggiornato");
              } catch (err: any) {
                setAvatarError(err.message || "Errore");
              } finally {
                setSavingAvatar(false);
              }
            }}
          >
            Salva avatar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
