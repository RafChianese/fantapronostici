import React, { useEffect, useMemo, useState } from "react";
import { api, type AvatarConfig } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { LeagueAvatar } from "../components/LeagueAvatar";
import { UserAvatar, normalizeAvatar } from "../components/Avatar";

type AvatarTab = "pelle" | "capelli" | "sopracciglia" | "occhi" | "maglia";

const COLOR_OPTIONS = {
  skin: ["light", "tan", "brown", "dark"] as const,
  hair: ["black", "brown", "blonde", "red", "gray"] as const,
  eyes: ["brown", "blue", "green", "gray"] as const,
  outfit: ["black", "blue", "red", "green", "purple", "orange", "gray"] as const,
};

function Tile({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition ${active ? "ring-slate-900 shadow" : "ring-slate-200 hover:ring-slate-300"}`}
    >
      {children}
    </button>
  );
}

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
  const [avatarTab, setAvatarTab] = useState<AvatarTab>("pelle");
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <UserAvatar userId={user.id} avatar={avatar} size={86} className="shadow" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">Personalizza avatar</div>
                    <div className="mt-0.5 text-xs text-slate-600">Scegli stile e colori, poi salva.</div>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <FieldSelect
                    label="Sesso"
                    value={avatar.sex || ""}
                    onChange={(v) => setAvatar((p) => ({ ...p, sex: v as any }))}
                    options={[
                      { value: "male", label: "Maschile" },
                      { value: "female", label: "Femminile" },
                    ]}
                  />
                </div>
              </div>

              {/* Tabs like the reference UI */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${avatarTab === "pelle" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"}`} onClick={() => setAvatarTab("pelle")}>
                  Pelle
                </button>
                <button type="button" className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${avatarTab === "capelli" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"}`} onClick={() => setAvatarTab("capelli")}>
                  Capelli
                </button>
                <button type="button" className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${avatarTab === "sopracciglia" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"}`} onClick={() => setAvatarTab("sopracciglia")}>
                  Sopracciglia
                </button>
                <button type="button" className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${avatarTab === "occhi" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"}`} onClick={() => setAvatarTab("occhi")}>
                  Occhi
                </button>
                <button type="button" className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${avatarTab === "maglia" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-300"}`} onClick={() => setAvatarTab("maglia")}>
                  Maglia
                </button>
              </div>

              {/* Panels */}
              <div className="mt-4">
                {avatarTab === "pelle" ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700">Tonalità pelle</div>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.skin.map((k) => (
                        <Tile key={k} active={(avatar.skin || "") === k} onClick={() => setAvatar((p) => ({ ...p, skin: k as any }))}>
                          <div className={`h-7 w-7 rounded-lg ${
                            k === "light" ? "bg-[#F6D2B8]" : k === "tan" ? "bg-[#E5B28C]" : k === "brown" ? "bg-[#C6895E]" : "bg-[#8D5A3C]"
                          }`} />
                        </Tile>
                      ))}
                    </div>
                  </div>
                ) : null}

                {avatarTab === "capelli" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldSelect
                        label="Stile"
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
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Colore</div>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.hair.map((k) => (
                            <Tile key={k} active={(avatar.hairColor || "") === k} onClick={() => setAvatar((p) => ({ ...p, hairColor: k as any }))}>
                              <div className={`h-7 w-7 rounded-lg ${
                                k === "black" ? "bg-[#111827]" : k === "brown" ? "bg-[#4B2E1E]" : k === "blonde" ? "bg-[#E7C46B]" : k === "red" ? "bg-[#B45309]" : "bg-[#9CA3AF]"
                              }`} />
                            </Tile>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {avatarTab === "sopracciglia" ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700">Colore sopracciglia</div>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.hair.map((k) => (
                        <Tile key={k} active={(avatar.eyebrowsColor || "") === k} onClick={() => setAvatar((p) => ({ ...p, eyebrowsColor: k as any }))}>
                          <div className={`h-7 w-7 rounded-lg ${
                            k === "black" ? "bg-[#111827]" : k === "brown" ? "bg-[#4B2E1E]" : k === "blonde" ? "bg-[#E7C46B]" : k === "red" ? "bg-[#B45309]" : "bg-[#9CA3AF]"
                          }`} />
                        </Tile>
                      ))}
                    </div>
                    <div className="text-xs text-slate-600">(Se non scegli nulla, usa il colore capelli.)</div>
                  </div>
                ) : null}

                {avatarTab === "occhi" ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700">Colore occhi</div>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.eyes.map((k) => (
                        <Tile key={k} active={(avatar.eyes || "") === k} onClick={() => setAvatar((p) => ({ ...p, eyes: k as any }))}>
                          <div className={`h-7 w-7 rounded-lg ${
                            k === "brown" ? "bg-[#5A3E2B]" : k === "blue" ? "bg-[#2D6CDF]" : k === "green" ? "bg-[#2E8B57]" : "bg-[#6B7280]"
                          }`} />
                        </Tile>
                      ))}
                    </div>
                  </div>
                ) : null}

                {avatarTab === "maglia" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldSelect
                        label="Tipo"
                        value={avatar.outfitType || ""}
                        onChange={(v) => setAvatar((p) => ({ ...p, outfitType: v as any }))}
                        options={[
                          { value: "tshirt", label: "T-shirt" },
                          { value: "hoodie", label: "Felpa" },
                          { value: "jersey", label: "Maglia" },
                          { value: "suit", label: "Completo" },
                        ]}
                      />
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Colore</div>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.outfit.map((k) => (
                            <Tile key={k} active={(avatar.outfitColor || "") === k} onClick={() => setAvatar((p) => ({ ...p, outfitColor: k as any }))}>
                              <div className={`h-7 w-7 rounded-lg ${
                                k === "black" ? "bg-[#111827]" : k === "blue" ? "bg-[#2563EB]" : k === "red" ? "bg-[#DC2626]" : k === "green" ? "bg-[#16A34A]" : k === "purple" ? "bg-[#7C3AED]" : k === "orange" ? "bg-[#F97316]" : "bg-[#6B7280]"
                              }`} />
                            </Tile>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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
