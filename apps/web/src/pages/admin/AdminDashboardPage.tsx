import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoading } from "../../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input } from "../../components/ui";

type Tab = "members" | "rules";

function isoToLocalDatetime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function localDatetimeToIso(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return d.toISOString();
}

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Dashboard amministratore di lega" subtitle="Gestisci partecipanti e regole" />
        <CardContent>
          <div data-tour="admin-tabs" className="flex flex-wrap gap-2">
            <Button variant={tab === "members" ? "primary" : "ghost"} onClick={() => setTab("members")}>
              Partecipanti
            </Button>
            <Button variant={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>
              Regole & Lock
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "members" ? <MembersTab /> : null}
      {tab === "rules" ? <RulesTab /> : null}
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
        <CardHeader title="Lock pronostici" subtitle="Manuale o Automatico (matchday)" />
        <CardContent>
          {settings ? (
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700">Modalità lock</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={settings.lockMode || "MANUAL"}
                onChange={(e) => setSettings({ ...settings, lockMode: e.target.value })}
              >
                <option value="MANUAL">Manuale (lockUntil)</option>
                <option value="AUTO">Automatico (AUTO matchday)</option>
              </select>

              <label className="text-sm font-medium text-slate-700">Modalità inserimento pronostici</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={settings.predictionMode || "MATCHDAY_BY_MATCHDAY"}
                onChange={(e) => setSettings({ ...settings, predictionMode: e.target.value })}
              >
                <option value="MATCHDAY_BY_MATCHDAY">Giornata per giornata</option>
                <option value="TOURNAMENT_PRE">Tutti prima del torneo</option>
              </select>

              <Input
                label="Anticipo lock automatico (minuti)"
                type="number"
                min={0}
                max={120}
                disabled={(settings.lockMode || "MANUAL") !== "AUTO"}
                value={String(settings.lockOffsetMinutes ?? 30)}
                onChange={(e) => setSettings({ ...settings, lockOffsetMinutes: Number(e.target.value) })}
              />

              <Input
                label="Lock fino a (data e ora)"
                type="datetime-local"
                disabled={(settings.lockMode || "MANUAL") === "AUTO"}
                value={isoToLocalDatetime(settings.lockUntil)}
                onChange={(e) => setSettings({ ...settings, lockUntil: localDatetimeToIso(e.target.value) })}
              />

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
                        lockUntil: settings.lockUntil,
                        isForceLocked: !!settings.isForceLocked,
                        lockMode: settings.lockMode || "MANUAL",
                        lockOffsetMinutes: Number(settings.lockOffsetMinutes ?? 30),
                        predictionMode: settings.predictionMode || "MATCHDAY_BY_MATCHDAY",
                        tieBreak1: settings.tieBreak1,
                        tieBreak2: settings.tieBreak2,
                        tieBreak3: settings.tieBreak3,
                      });
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
                        setOk("Lock immediato attivato.");
                      } catch (e: any) {
                        setErr(e?.message || "Errore");
                      } finally {
                        hide();
                      }
                    }}
                  >
                    Lock subito
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
                          lockUntil: settings.lockUntil,
                          isForceLocked: false,
                          lockMode: settings.lockMode || "MANUAL",
                          lockOffsetMinutes: Number(settings.lockOffsetMinutes ?? 30),
                          predictionMode: settings.predictionMode || "MATCHDAY_BY_MATCHDAY",
                          tieBreak1: settings.tieBreak1,
                          tieBreak2: settings.tieBreak2,
                          tieBreak3: settings.tieBreak3,
                        });
                        await load();
                        setOk("Lock rimosso.");
                      } catch (e: any) {
                        setErr(e?.message || "Errore");
                      } finally {
                        hide();
                      }
                    }}
                  >
                    Sblocca
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
                      lockUntil: settings.lockUntil,
                      isForceLocked: !!settings.isForceLocked,
                      lockMode: settings.lockMode || "MANUAL",
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
