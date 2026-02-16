import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoading } from "../../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input } from "../../components/ui";

type Tab = "customize" | "members" | "rules";

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("customize");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Dashboard amministratore di lega" subtitle="Gestisci partecipanti e regole" />
        <CardContent>
          <div data-tour="admin-tabs" className="flex flex-wrap gap-2">
            <Button variant={tab === "customize" ? "primary" : "ghost"} onClick={() => setTab("customize")}>Personalizza</Button>
            <Button variant={tab === "members" ? "primary" : "ghost"} onClick={() => setTab("members")}>
              Partecipanti
            </Button>
            <Button variant={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>
              Regole & Lock
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "customize" ? <CustomizeTab /> : null}
      {tab === "members" ? <MembersTab /> : null}
      {tab === "rules" ? <RulesTab /> : null}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getLeagueLogoUrl(leagueId: string) {
  const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const bucket = ((import.meta as any).env?.VITE_SUPABASE_LEAGUE_LOGO_BUCKET as string | undefined) || "league-logos";
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${leagueId}.png`;
}

function CustomizeTab() {
  const { show, hide } = useLoading();
  const { memberships, activeLeagueId, refreshMe } = useAuth();
  const league = memberships.find((m) => m.league.id === activeLeagueId)?.league;

  const [name, setName] = useState(league?.name || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [imgBust, setImgBust] = useState(0);

  useEffect(() => {
    setName(league?.name || "");
  }, [league?.name]);

  if (!league) return null;

  const inviteCode = league.code;
  const inviteLink = `${window.location.origin}/onboarding?code=${encodeURIComponent(inviteCode)}`;
  const logoUrl = getLeagueLogoUrl(league.id);
  const initials = (league.name || "L").trim().slice(0, 1).toUpperCase();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader title="Personalizza la lega" subtitle="Logo, nome e link di invito" />
        <CardContent>
          {err ? <Alert tone="danger">{err}</Alert> : null}
          {ok ? <Alert tone="success">{ok}</Alert> : null}

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                {logoPreview ? (
                  <img src={logoPreview} className="h-full w-full object-cover" alt="logo preview" />
                ) : logoUrl ? (
                  <img
                    key={imgBust}
                    src={`${logoUrl}?v=${imgBust}`}
                    className="h-full w-full object-cover"
                    alt={league.name}
                    onError={() => {
                      // if bucket not public / logo missing, fallback to initials
                      setImgBust((v) => v + 1);
                    }}
                  />
                ) : (
                  <span className="text-lg font-semibold text-slate-600">{initials}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  id="league-logo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    setErr("");
                    setOk("");
                    if (!f) return;
                    setLogoFile(f);
                    setLogoPreview(await fileToDataUrl(f));
                  }}
                />
                <Button
                  onClick={() => {
                    const el = document.getElementById("league-logo") as HTMLInputElement | null;
                    el?.click();
                  }}
                >
                  {logoPreview || logoUrl ? "Cambia logo" : "Carica logo"}
                </Button>
                {logoPreview ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview("");
                    }}
                  >
                    Rimuovi
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteCode);
                      setOk("Codice copiato");
                    } catch {
                      setOk("");
                    }
                  }}
                >
                  Copia codice
                </Button>
              </div>
            </div>

            <Input label="Nome lega" value={name} onChange={(e) => setName(e.target.value)} />

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="text-xs text-slate-500">Link invito</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="text-sm break-all flex-1">{inviteLink}</div>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteLink);
                      setOk("Link copiato");
                    } catch {
                      setOk("");
                    }
                  }}
                >
                  Copia link
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={async () => {
                setErr("");
                setOk("");
                show();
                try {
                  // 1) rename (optional)
                  if (name.trim() && name.trim() !== league.name) {
                    await api.adminUpdateLeague({ name: name.trim() });
                  }
                  // 2) upload logo (optional)
                  if (logoFile) {
                    const dataUrl = await fileToDataUrl(logoFile);
                    await api.uploadLeagueLogo(league.id, dataUrl);
                    setLogoFile(null);
                    setLogoPreview("");
                    setImgBust((v) => v + 1);
                  }
                  await refreshMe();
                  setOk("Impostazioni salvate");
                } catch (e: any) {
                  setErr(e?.message || "Errore");
                } finally {
                  hide();
                }
              }}
            >
              Salva
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Suggerimenti" subtitle="Funzioni utili per gestire la tua lega" />
        <CardContent>
          <div className="space-y-3 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="font-medium">Condividi il codice invito</div>
              <div className="text-xs text-slate-600">I partecipanti possono entrare dalla pagina Onboarding inserendo il codice.</div>
              <div className="mt-2"><Badge>{inviteCode}</Badge></div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="font-medium">Approva o rifiuta richieste</div>
              <div className="text-xs text-slate-600">Vai su “Partecipanti” per gestire gli ingressi e assegnare admin.</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="font-medium">Regole, lock e premi</div>
              <div className="text-xs text-slate-600">Configura punteggi, lock automatico e (facoltativo) quota/premi in “Regole & Lock”.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersTab() {
  const { show, hide } = useLoading();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<any[]>([]);

  const approvedAdminsCount = items.filter((m) => m.status === "APPROVED" && m.role === "ADMIN").length;

  async function load() {
    show();
    setLoading(true);
    setErr("");
    try {
      const r = await api.adminMembers();
      setItems(r.members || []);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
      hide();
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return null;

  return (
    <Card>
      <CardHeader title="Partecipanti della lega" subtitle="Approva richieste e assegna admin" />
      <CardContent>
        {err ? <Alert tone="danger">{err}</Alert> : null}
        <div className="space-y-2">
          {items.map((m) => (
            (() => {
              const isSelf = !!user && m.user?.id === user.id;
              const isOnlyAdminSelf = isSelf && m.status === "APPROVED" && m.role === "ADMIN" && approvedAdminsCount === 1;
              return (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-medium">{m.user.displayName}</div>
                <div className="text-xs text-slate-600">{m.user.email}</div>
                <div className="mt-1 flex gap-2">
                  <Badge>{m.status}</Badge>
                  <Badge>{m.role}</Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {m.status !== "APPROVED" ? (
                  <Button
                    onClick={async () => {
                      await api.adminPatchMember(m.id, { status: "APPROVED" });
                      load();
                    }}
                  >
                    Approva
                  </Button>
                ) : null}

                {!isOnlyAdminSelf && m.status !== "REJECTED" ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.adminPatchMember(m.id, { status: "REJECTED" });
                      load();
                    }}
                  >
                    Rifiuta
                  </Button>
                ) : null}

                {m.role !== "ADMIN" ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.adminPatchMember(m.id, { role: "ADMIN" });
                      load();
                    }}
                  >
                    Rendi Admin
                  </Button>
                ) : (
                  !isOnlyAdminSelf ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.adminPatchMember(m.id, { role: "MEMBER" });
                          load();
                        } catch (e: any) {
                          setErr(e?.message || "Modifica non possibile");
                        }
                      }}
                    >
                      Rendi Member
                    </Button>
                  ) : null
                )}
              </div>
            </div>
              );
            })()
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RulesTab() {
  const { show, hide } = useLoading();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rules, setRules] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  async function load() {
    show();
    setLoading(true);
    setErr("");
    try {
      const [r1, r2] = await Promise.all([api.adminRules(), api.adminSettings()]);
      setRules(r1.rules);
      setSettings(r2.settings);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
      hide();
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader title="Regole punteggi" subtitle="Modifica e ricalcolo immediato" />
        <CardContent>
          {err ? <Alert tone="danger">{err}</Alert> : null}
          {ok ? <Alert tone="success">{ok}</Alert> : null}

          {rules ? (
            <div className="space-y-3">
              <Input
                label="Punti Risultato Esatto"
                type="number"
                value={String(rules.pointsExact)}
                onChange={(e) => setRules({ ...rules, pointsExact: Number(e.target.value) })}
              />
              <Input
                label="Punti Pronostico (1X2)"
                type="number"
                value={String(rules.pointsOutcome)}
                onChange={(e) => setRules({ ...rules, pointsOutcome: Number(e.target.value) })}
              />
              <Input
                label="Punti Somma Gol"
                type="number"
                value={String(rules.pointsSumGoals)}
                onChange={(e) => setRules({ ...rules, pointsSumGoals: Number(e.target.value) })}
              />

              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <ToggleRow
                  label="Abilita Under/Over 2.5"
                  checked={!!rules.enableUnderOver25}
                  onChange={(v) => setRules({ ...rules, enableUnderOver25: v })}
                />
                <Input
                  label="Punti Under/Over 2.5"
                  type="number"
                  disabled={!rules.enableUnderOver25}
                  value={String(rules.pointsUnderOver25 ?? 1)}
                  onChange={(e) => setRules({ ...rules, pointsUnderOver25: Number(e.target.value) })}
                />
                <ToggleRow
                  label="Abilita miglior risultato di giornata (🥇)"
                  checked={!!rules.enableMatchdayAwards}
                  onChange={(v) => setRules({ ...rules, enableMatchdayAwards: v })}
                />
              </div>

              <label className="text-sm font-medium text-slate-700">Modalità punteggio</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={rules.scoringMode}
                onChange={(e) => setRules({ ...rules, scoringMode: e.target.value })}
              >
                <option value="CUMULATIVE">Cumulativo (Esatto + 1X2 + SommaGol)</option>
                <option value="BEST_ONLY">Solo punteggio più alto</option>
                <option value="MIXED">Misto (configurabile)</option>
              </select>

              {rules.scoringMode === "MIXED" ? (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <ToggleRow
                    label="Se prendo Esatto sommo anche 1X2"
                    checked={!!rules.allowOutcomeWithExact}
                    onChange={(v) => setRules({ ...rules, allowOutcomeWithExact: v })}
                  />
                  <ToggleRow
                    label="Se prendo Esatto sommo anche Somma Gol"
                    checked={!!rules.allowSumGoalsWithExact}
                    onChange={(v) => setRules({ ...rules, allowSumGoalsWithExact: v })}
                  />
                  <ToggleRow
                    label="Se prendo 1X2 sommo anche Somma Gol"
                    checked={!!rules.allowSumGoalsWithOutcome}
                    onChange={(v) => setRules({ ...rules, allowSumGoalsWithOutcome: v })}
                  />
                </div>
              ) : null}

              <Button
                onClick={async () => {
                  show();
                  try {
                    setErr("");
                    setOk("");
                    await api.adminSaveRules({
                      pointsExact: Number(rules.pointsExact),
                      pointsOutcome: Number(rules.pointsOutcome),
                      pointsSumGoals: Number(rules.pointsSumGoals),
                      enableUnderOver25: !!rules.enableUnderOver25,
                      pointsUnderOver25: Number(rules.pointsUnderOver25 ?? 1),
                      enableMatchdayAwards: !!rules.enableMatchdayAwards,
                      scoringMode: rules.scoringMode,
                      allowOutcomeWithExact: !!rules.allowOutcomeWithExact,
                      allowSumGoalsWithExact: !!rules.allowSumGoalsWithExact,
                      allowSumGoalsWithOutcome: !!rules.allowSumGoalsWithOutcome,
                    });
                    setOk("Regole salvate. Punteggi ricalcolati.");
                  } catch (e: any) {
                    setErr(e?.message || "Errore");
                  } finally {
                    hide();
                  }
                }}
              >
                Salva regole
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Lock pronostici" subtitle="Blocco automatico gestito dal calendario" />
        <CardContent>
          {settings ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-medium">Come funziona</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                  <li>
                    Il lock è <b>sempre automatico</b>: parte X minuti prima del primo match rilevante.
                  </li>
                  <li>
                    In modalità <b>giornata per giornata</b> si sblocca quando la giornata è conclusa (con fallback).
                  </li>
                  <li>
                    In modalità <b>tutti prima del torneo</b> il lock si riferisce alla prima partita della prima giornata.
                  </li>
                </ul>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700">Modalità inserimento pronostici</div>
                <div className="mt-2 grid gap-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    (settings.predictionMode || "MATCHDAY_BY_MATCHDAY") === "TOURNAMENT_PRE"
                      ? "border-slate-300 bg-white"
                      : "border-slate-200 bg-white/60"
                  }`}>
                    <input
                      type="radio"
                      name="predictionMode"
                      checked={(settings.predictionMode || "MATCHDAY_BY_MATCHDAY") === "TOURNAMENT_PRE"}
                      onChange={() => setSettings({ ...settings, predictionMode: "TOURNAMENT_PRE" })}
                    />
                    <div>
                      <div className="font-medium">Tutti prima del torneo</div>
                      <div className="text-xs text-slate-600">I partecipanti inseriscono tutti i pronostici prima dell'inizio.</div>
                    </div>
                  </label>

                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    (settings.predictionMode || "MATCHDAY_BY_MATCHDAY") === "MATCHDAY_BY_MATCHDAY"
                      ? "border-slate-300 bg-white"
                      : "border-slate-200 bg-white/60"
                  }`}>
                    <input
                      type="radio"
                      name="predictionMode"
                      checked={(settings.predictionMode || "MATCHDAY_BY_MATCHDAY") === "MATCHDAY_BY_MATCHDAY"}
                      onChange={() => setSettings({ ...settings, predictionMode: "MATCHDAY_BY_MATCHDAY" })}
                    />
                    <div>
                      <div className="font-medium">Giornata per giornata</div>
                      <div className="text-xs text-slate-600">Si pronostica la giornata in corso (se rinvii) + la prossima che deve iniziare.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700">Quando bloccare i pronostici</div>
                <div className="mt-2">
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={String(settings.lockOffsetMinutes ?? 30)}
                    onChange={(e) => setSettings({ ...settings, lockOffsetMinutes: Number(e.target.value) })}
                  >
                    <option value="60">1 ora prima</option>
                    <option value="30">30 minuti prima</option>
                    <option value="15">15 minuti prima</option>
                    <option value="0">All'inizio della partita (0 min)</option>
                  </select>
                  <div className="mt-1 text-xs text-slate-600">
                    Esempio: primo match alle 20:45 con 30 minuti → lock dalle 20:15.
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <div className="font-medium">Lock forzato</div>
                  <div className="text-xs text-slate-600">Blocca subito i pronostici indipendentemente dalla data.</div>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={!!settings.isForceLocked}
                  onChange={(e) => setSettings({ ...settings, isForceLocked: e.target.checked })}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    show();
                    try {
                      setErr("");
                      setOk("");
                      await api.adminSaveSettings({
                        isForceLocked: !!settings.isForceLocked,
                        lockOffsetMinutes: Number(settings.lockOffsetMinutes ?? 30),
                        predictionMode: settings.predictionMode || "MATCHDAY_BY_MATCHDAY",
                        tieBreak1: settings.tieBreak1,
                        tieBreak2: settings.tieBreak2,
                        tieBreak3: settings.tieBreak3,
                      });
                      await load();
                      setOk("Impostazioni lock salvate.");
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    } finally {
                      hide();
                    }
                  }}
                >
                  Salva
                </Button>

                {!settings.isForceLocked ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      show();
                      try {
                        setErr("");
                        setOk("");
                        await api.adminLockNow();
                        await load();
                        setOk("Lock forzato attivato.");
                      } catch (e: any) {
                        setErr(e?.message || "Errore");
                      } finally {
                        hide();
                      }
                    }}
                  >
                    Blocca ora (forzato)
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      show();
                      try {
                        setErr("");
                        setOk("");
                        await api.adminSaveSettings({
                          isForceLocked: false,
                          lockOffsetMinutes: Number(settings.lockOffsetMinutes ?? 30),
                          predictionMode: settings.predictionMode || "MATCHDAY_BY_MATCHDAY",
                          tieBreak1: settings.tieBreak1,
                          tieBreak2: settings.tieBreak2,
                          tieBreak3: settings.tieBreak3,
                        });
                        await load();
                        setOk("Lock forzato rimosso.");
                      } catch (e: any) {
                        setErr(e?.message || "Errore");
                      } finally {
                        hide();
                      }
                    }}
                  >
                    Rimuovi lock forzato
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader title="Criteri classifica" subtitle="Ordine di spareggio a parità di punti" />
        <CardContent>
          {settings ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                La classifica è sempre ordinata per <b>punti totali</b>. Se due utenti hanno gli stessi punti, vengono
                applicati questi criteri in ordine.
              </div>

              <TieBreakerRow
                label="1° spareggio"
                value={settings.tieBreak1 || "EXACT"}
                onChange={(v) => setSettings({ ...settings, tieBreak1: v })}
              />
              <TieBreakerRow
                label="2° spareggio"
                value={settings.tieBreak2 || "OUTCOME"}
                onChange={(v) => setSettings({ ...settings, tieBreak2: v })}
              />
              <TieBreakerRow
                label="3° spareggio"
                value={settings.tieBreak3 || "SUM_GOALS"}
                onChange={(v) => setSettings({ ...settings, tieBreak3: v })}
              />

              <Button
                onClick={async () => {
                  show();
                  try {
                    setErr("");
                    setOk("");
                    await api.adminSaveSettings({
                      // Keep lock options untouched while saving tie-breakers
                      isForceLocked: !!settings.isForceLocked,
                      lockOffsetMinutes: Number(settings.lockOffsetMinutes ?? 30),
                      predictionMode: settings.predictionMode || "MATCHDAY_BY_MATCHDAY",
                      tieBreak1: settings.tieBreak1,
                      tieBreak2: settings.tieBreak2,
                      tieBreak3: settings.tieBreak3,
                    });
                    setOk("Criteri classifica salvati.");
                  } catch (e: any) {
                    setErr(e?.message || "Errore");
                  } finally {
                    hide();
                  }
                }}
              >
                Salva criteri
              </Button>

              <div className="text-xs text-slate-600">
                Suggerimento: evita duplicati (es. tutti EXACT). In caso di duplicati, l'app usa comunque l'ordine indicato.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TieBreakerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "EXACT" | "OUTCOME" | "SUM_GOALS";
  onChange: (v: "EXACT" | "OUTCOME" | "SUM_GOALS") => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value as any)}>
        <option value="EXACT">Risultati esatti</option>
        <option value="OUTCOME">Pronostici (1X2)</option>
        <option value="SUM_GOALS">Somma gol</option>
      </select>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
