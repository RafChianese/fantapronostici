import React, { useEffect, useMemo, useState } from "react";
import { api, type AvatarConfig } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { LeagueAvatar } from "../components/LeagueAvatar";
import { UserAvatar, normalizeAvatar } from "../components/Avatar";

export default function AccountPage() {
  const { user, memberships, refreshMe, activeLeagueId } = useAuth();
  const toast = useToast();

  const activeLeague = useMemo(() => memberships.find((m) => m.league.id === activeLeagueId)?.league, [memberships, activeLeagueId]);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOk, setProfileOk] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Avatar
  const [avatar, setAvatar] = useState<AvatarConfig>({});
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarOk, setAvatarOk] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

  useEffect(() => {
    // Initialize editor with stored avatar (if any)
    setAvatar((user as any)?.avatarJson || {});
  }, [(user as any)?.avatarJson]);

  // Push notifications
  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushOk, setPushOk] = useState<string | null>(null);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
        <CardHeader title="Avatar" subtitle="Personalizza il tuo avatar (visibile in classifica)." />
        <CardContent className="space-y-4">
          {avatarError ? <Alert tone="danger">{avatarError}</Alert> : null}
          {avatarOk ? <Alert tone="success">Avatar aggiornato</Alert> : null}

          {user ? (
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <UserAvatar userId={user.id} avatar={avatar} size={64} className="shadow" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">Anteprima</div>
                <div className="mt-0.5 text-xs text-slate-600">Le combinazioni sono salvate nel tuo profilo.</div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldSelect
              label="Sesso"
              value={avatar.sex || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, sex: v as any }))}
              options={[
                { value: "male", label: "Maschile" },
                { value: "female", label: "Femminile" },
              ]}
            />
            <FieldSelect
              label="Pelle"
              value={avatar.skin || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, skin: v as any }))}
              options={[
                { value: "light", label: "Chiara" },
                { value: "tan", label: "Media" },
                { value: "brown", label: "Scura" },
                { value: "dark", label: "Molto scura" },
              ]}
            />
            <FieldSelect
              label="Occhi"
              value={avatar.eyes || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, eyes: v as any }))}
              options={[
                { value: "brown", label: "Marroni" },
                { value: "blue", label: "Blu" },
                { value: "green", label: "Verdi" },
                { value: "gray", label: "Grigi" },
              ]}
            />
            <FieldSelect
              label="Capelli"
              value={avatar.hairType || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, hairType: v as any }))}
              options={[
                { value: "short", label: "Corti" },
                { value: "medium", label: "Medi" },
                { value: "long", label: "Lunghi" },
                { value: "curly", label: "Ricci" },
                { value: "bald", label: "Calvo" },
              ]}
            />
            <FieldSelect
              label="Colore capelli"
              value={avatar.hairColor || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, hairColor: v as any }))}
              options={[
                { value: "black", label: "Neri" },
                { value: "brown", label: "Castani" },
                { value: "blonde", label: "Biondi" },
                { value: "red", label: "Rossi" },
                { value: "gray", label: "Grigi" },
              ]}
            />
            <FieldSelect
              label="Vestito"
              value={avatar.outfitType || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, outfitType: v as any }))}
              options={[
                { value: "tshirt", label: "T-shirt" },
                { value: "hoodie", label: "Felpa" },
                { value: "jersey", label: "Maglia" },
                { value: "suit", label: "Completo" },
              ]}
            />
            <FieldSelect
              label="Colore vestito"
              value={avatar.outfitColor || ""}
              onChange={(v) => setAvatar((p) => ({ ...p, outfitColor: v as any }))}
              options={[
                { value: "black", label: "Nero" },
                { value: "blue", label: "Blu" },
                { value: "red", label: "Rosso" },
                { value: "green", label: "Verde" },
                { value: "purple", label: "Viola" },
                { value: "orange", label: "Arancione" },
                { value: "gray", label: "Grigio" },
              ]}
            />
          </div>

          <Button
            disabled={savingAvatar || !user}
            onClick={async () => {
              if (!user) return;
              setAvatarError(null);
              setAvatarOk(false);
              setSavingAvatar(true);
              try {
                // Normalize before saving (ensures all keys are valid/consistent)
                const normalized = normalizeAvatar(user.id, avatar);
                await api.updateProfile({ displayName: displayName.trim() || user.displayName, avatar: normalized });
                await refreshMe();
                setAvatarOk(true);
              } catch (e: any) {
                setAvatarError(e?.message || "Errore");
              } finally {
                setSavingAvatar(false);
              }
            }}
          >
            Salva avatar
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
        <CardHeader title="Notifiche push" subtitle="Ricevi promemoria e aggiornamenti direttamente dal browser." />
        <CardContent className="space-y-4">
          {pushError ? <Alert tone="danger">{pushError}</Alert> : null}
          {pushOk ? <Alert tone="success">{pushOk}</Alert> : null}

          {!VAPID_PUBLIC_KEY ? (
            <Alert tone="info">Le notifiche push non sono configurate su questo ambiente.</Alert>
          ) : null}

          <Button
            disabled={pushBusy || !VAPID_PUBLIC_KEY}
            onClick={async () => {
              setPushError(null);
              setPushOk(null);
              if (!VAPID_PUBLIC_KEY) {
                setPushError("Notifiche push non disponibili: manca la chiave pubblica VAPID.");
                return;
              }
              if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
                setPushError("Questo browser non supporta le notifiche push.");
                return;
              }

              setPushBusy(true);
              try {
                const perm = await Notification.requestPermission();
                if (perm !== "granted") {
                  setPushError("Permesso notifiche negato.");
                  return;
                }

                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });

                const json: any = sub.toJSON();
                if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
                  throw new Error("Subscription non valida");
                }

                await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
                const r = await api.pushTest();

                if (r?.skipped) {
                  setPushOk("Notifiche abilitate. (Test non disponibile: VAPID non configurato sul server)");
                } else {
                  setPushOk("Notifiche abilitate! Ti abbiamo inviato una notifica di test.");
                }
                toast.push({ tone: "success", msg: "Notifiche push configurate" });
              } catch (e: any) {
                setPushError(e?.message || "Errore durante la configurazione");
                toast.push({ tone: "danger", msg: "Errore notifiche push" });
              } finally {
                setPushBusy(false);
              }
            }}
          >
            Attiva e invia test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Le mie leghe" subtitle="Riepilogo delle leghe a cui partecipi." />
        <CardContent className="space-y-2">
          {(memberships || []).length === 0 ? <div className="text-sm text-slate-600">Nessuna lega.</div> : null}
          {(memberships || []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border p-3">
              <div className="flex items-center gap-3">
                <LeagueAvatar leagueId={m.league.id} leagueName={m.league.name} size={40} />
                <div>
                <div className="font-semibold">{m.league.name}</div>
                <div className="text-xs text-slate-500">
                  Stato: {m.status} • Ruolo: {m.role}
                </div>
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

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-800">{label}</div>
      <select
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">(default)</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
