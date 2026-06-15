import React, { useEffect, useState } from "react";
import { api, saveBlob } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoading } from "../../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Input } from "../../components/ui";

type Tab = "members" | "rules" | "customize";

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Area admin" subtitle="Gestisci partecipanti e impostazioni" />
        <CardContent>
          <div data-tour="admin-tabs" className="flex flex-wrap gap-2">
            <Button variant={tab === "members" ? "primary" : "ghost"} onClick={() => setTab("members")}>
              Partecipanti
            </Button>
            <Button variant={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>
              Regole & Lock
            </Button>
            <Button variant={tab === "customize" ? "primary" : "ghost"} onClick={() => setTab("customize")}>
              Personalizza
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "members" ? <MembersTab /> : null}
      {tab === "rules" ? <RulesTab /> : null}
      {tab === "customize" ? <CustomizeTab goToRules={() => setTab("rules")} /> : null}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Errore lettura file"));
    r.readAsDataURL(file);
  });
}

function CustomizeTab({ goToRules }: { goToRules: () => void }) {
  const { memberships, activeLeagueId, refreshMe } = useAuth();
  const { show, hide } = useLoading();

  const activeMembership = memberships.find((m) => m.league?.id === activeLeagueId) as any;
  const league = activeMembership?.league;

  const [name, setName] = useState<string>(league?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    setName(league?.name || "");
  }, [league?.name]);

  const logoSrc = league?.branding?.logoUrl || league?.branding?.logoDataUrl || null;

  async function uploadLogo(file: File) {
    if (!league?.id) return;
    setErr("");
    setOk("");
    setLogoBusy(true);
    show();
    try {
      const dataUrl = await fileToDataUrl(file);
      await api.uploadLeagueLogo(league.id, dataUrl);
      await refreshMe();
      setOk("Logo aggiornato");
    } catch (e: any) {
      setErr(e?.message || "Errore upload logo");
    } finally {
      setLogoBusy(false);
      hide();
    }
  }

  async function removeLogo() {
    if (!league?.id) return;
    setErr("");
    setOk("");
    setLogoBusy(true);
    show();
    try {
      await api.removeLeagueLogo(league.id);
      await refreshMe();
      setOk("Logo rimosso");
    } catch (e: any) {
      setErr(e?.message || "Errore rimozione logo");
    } finally {
      setLogoBusy(false);
      hide();
    }
  }

  if (!league) return null;

  return (
    <Card>
      <CardHeader title="Personalizza la lega" subtitle="Logo e informazioni principali" />
      <CardContent className="space-y-6">
        {err ? <Alert tone="danger">{err}</Alert> : null}
        {ok ? <Alert tone="success">{ok}</Alert> : null}

        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div
              className={`h-32 w-32 rounded-full border border-white/10 bg-white/10 overflow-hidden flex items-center justify-center ${logoBusy ? "opacity-70" : ""}`}
            >
              {logoSrc ? (
                <img src={logoSrc} alt="Logo lega" className="h-full w-full object-cover" />
              ) : (
                <div className="text-slate-400 font-semibold text-2xl">{(league.name || "L").slice(0, 2).toUpperCase()}</div>
              )}
            </div>

            {/* hidden file input */}
            <input
              id="league-logo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
                // allow re-select same file
                e.currentTarget.value = "";
              }}
            />

            {/* Camera / Edit button */}
            <label
              htmlFor="league-logo-input"
              title={logoSrc ? "Modifica logo" : "Carica logo"}
              className={`absolute -right-2 bottom-3 h-10 w-10 rounded-full border border-white/10 bg-slate-950/70 shadow-sm flex items-center justify-center cursor-pointer hover:shadow transition ${logoBusy ? "pointer-events-none opacity-60" : ""}`}
            >
              {logoSrc ? (
                // pencil
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              ) : (
                // camera
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 4L7.5 6H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-2.5L15 4H9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8"/>
                </svg>
              )}
            </label>

            {/* Remove button (X) */}
            {logoSrc ? (
              <button
                type="button"
                title="Rimuovi logo"
                onClick={removeLogo}
                className={`absolute -left-2 bottom-3 h-10 w-10 rounded-full border border-white/10 bg-slate-950/70 shadow-sm flex items-center justify-center hover:shadow transition ${logoBusy ? "pointer-events-none opacity-60" : ""}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            ) : null}
          </div>
          <div className="text-xs text-slate-400">PNG/JPG/WebP • max ~1.5MB • salvataggio automatico</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input label="Nome lega" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            className="sm:mb-[2px]"
            disabled={savingName || name.trim().length < 2 || name.trim() === league.name}
            onClick={async () => {
              setErr("");
              setOk("");
              setSavingName(true);
              show();
              try {
                await api.updateLeague(league.id, { name: name.trim() });
                await refreshMe();
                setOk("Nome aggiornato");
              } catch (e: any) {
                setErr(e?.message || "Errore aggiornamento nome");
              } finally {
                setSavingName(false);
                hide();
              }
            }}
          >
            Salva
          </Button>
        </div>

        <div className="pt-2">
          <Button className="w-full" variant="primary" onClick={goToRules}>
            Configura regolamento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MembersTab() {
  const { show, hide } = useLoading();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);

  const approvedAdminsCount = items.filter((m) => m.status === "APPROVED" && m.role === "ADMIN").length;

  async function exportPredictions() {
    setErr("");
    setExporting(true);
    show();
    try {
      const blob = await api.adminExportPredictionsCsv();
      saveBlob(blob, `pronostici-lega-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: any) {
      setErr(e?.message || "Errore durante l'esportazione dei pronostici");
    } finally {
      setExporting(false);
      hide();
    }
  }

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
      <CardHeader title="Partecipanti della lega" subtitle="Approva richieste, assegna admin ed esporta i pronostici" />
      <CardContent>
        {err ? <Alert tone="danger">{err}</Alert> : null}
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-slate-100">Export pronostici</div>
            <div className="text-sm text-slate-400">Scarica una griglia CSV apribile con Excel: utenti sulle righe, match e pronostici torneo sulle colonne.</div>
          </div>
          <Button variant="primary" onClick={exportPredictions} disabled={exporting}>
            {exporting ? "Esporto..." : "Esporta CSV"}
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((m) => (
            (() => {
              const isSelf = !!user && m.user?.id === user.id;
              const isOnlyAdminSelf = isSelf && m.status === "APPROVED" && m.role === "ADMIN" && approvedAdminsCount === 1;
              return (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-xl border border-white/10 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium">{m.user.displayName}</div>
                  {m.status === "APPROVED" ? (
                    m.predictionCheck?.required ? (
                      m.predictionCheck.complete ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-extrabold text-emerald-200" title="Ha inserito tutti i pronostici delle giornate pronosticabili">
                          ✔
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-extrabold text-rose-200" title={`Pronostici mancanti: ${m.predictionCheck.missing}`}>
                          ⚠
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-extrabold text-slate-400" title="Nessuna giornata pronosticabile al momento">
                        —
                      </span>
                    )
                  ) : null}
                </div>
                <div className="text-xs text-slate-400">{m.user.email}</div>
                <div className="mt-1 flex gap-2">
                  <Badge>{m.status}</Badge>
                  <Badge>{m.role}</Badge>
                </div>
                {m.status === "APPROVED" ? (
                  m.predictionCheck?.required ? (
                    !m.predictionCheck.complete ? (
                      <div className="mt-1 text-xs font-semibold text-rose-200">
                        Mancano {m.predictionCheck.missing} pronostici (su {m.predictionCheck.required})
                      </div>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-emerald-200">
                        Pronostici completi ({m.predictionCheck.done}/{m.predictionCheck.required})
                      </div>
                    )
                  ) : (
                    <div className="mt-1 text-xs font-semibold text-slate-400">Nessuna giornata pronosticabile</div>
                  )
                ) : null}
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
  const [matches, setMatches] = useState<any[]>([]);
  const [jolly, setJolly] = useState<any>(null);

  async function load() {
    show();
    setLoading(true);
    setErr("");
    try {
      const [r1, r2, r3, r4] = await Promise.all([api.adminRules(), api.adminSettings(), api.matches(), api.adminJolly()]);
      // TEMP: disable scorer picks (paid lineup API not available).
      setRules({
        ...(r1.rules || {}),
        enableScorer: false,
      });
      setSettings(r2.settings);
      setMatches(r3.matches || []);
      setJolly(r4);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
      hide();
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return null;

  const prizes: any[] = Array.isArray(rules?.prizesJson) ? rules.prizesJson : [];

  const entryFeeEuro = (() => {
    const cents = rules?.entryFeeCents;
    if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return "";
    return String(Math.round(cents / 100));
  })();

  return (
    <div className="space-y-6">
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* RULES */}
        <Card>
          <CardHeader title="Regole" subtitle="Punteggi e opzioni della lega" />
          <CardContent className="space-y-5">
            {/* Base scoring */}
            <Section title="Punteggi base" hint="Imposta i punti assegnati per risultato esatto, esito (1X2) e somma gol. Questi valori vengono usati per calcolare la classifica.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Esatto"
                  type="number"
                  step="0.5"
                  value={String(rules?.pointsExact ?? 0)}
                  onChange={(e) => setRules({ ...rules, pointsExact: Number(e.target.value) })}
                />
                <Input
                  label="Esito (1X2)"
                  type="number"
                  step="0.5"
                  value={String(rules?.pointsOutcome ?? 0)}
                  onChange={(e) => setRules({ ...rules, pointsOutcome: Number(e.target.value) })}
                />
                <Input
                  label="Somma gol"
                  type="number"
                  step="0.5"
                  value={String(rules?.pointsSumGoals ?? 0)}
                  onChange={(e) => setRules({ ...rules, pointsSumGoals: Number(e.target.value) })}
                />
              </div>
            </Section>

            {/* Extra features */}
            <Section title="Funzioni extra" hint="Attiva opzioni aggiuntive come Under/Over 2.5 e premio giornata. Puoi anche impostare i punti relativi.">
              <div className="space-y-3">
                <SwitchRow
                  label="Abilita Under/Over 2.5"
                  hint="Permette di pronosticare Under/Over 2.5 per ogni partita (se la feature è attiva nella lega)."
                  checked={!!rules?.enableUnderOver25}
                  onChange={(v) => setRules({ ...rules, enableUnderOver25: v })}
                />
                <div className="pl-1">
                  <Input
                    label="Punti Under/Over 2.5"
                    type="number"
                    step="0.5"
                    disabled={!rules?.enableUnderOver25}
                    value={String(rules?.pointsUnderOver25 ?? 1)}
                    onChange={(e) => setRules({ ...rules, pointsUnderOver25: Number(e.target.value) })}
                  />
                </div>

                <SwitchRow
                  label="Abilita premio giornata (🥇)"
                  hint="Assegna un badge/premio a chi ottiene il punteggio migliore nella singola giornata (se abilitato)."
                  checked={!!rules?.enableMatchdayAwards}
                  onChange={(v) => setRules({ ...rules, enableMatchdayAwards: v })}
                />

                <SwitchRow
                  label="Abilita Partita Jolly (⭐)"
                  hint="Permette di selezionare 1 partita per giornata che vale punti moltiplicati (es. x2)."
                  checked={!!rules?.enableJolly}
                  onChange={(v) => setRules({ ...rules, enableJolly: v })}
                />
                <div className="pl-1">
                  <Input
                    label="Moltiplicatore Jolly"
                    type="number"
                    disabled={!rules?.enableJolly}
                    value={String(rules?.jollyMultiplier ?? 2)}
                    onChange={(e) => setRules({ ...rules, jollyMultiplier: Number(e.target.value) })}
                  />
                </div>

                <SwitchRow
                  label="Abilita Marcatore (⚽)"
                  hint="Disabilitato: richiede API lineup a pagamento."
                  checked={false}
                  disabled
                  onChange={() => {
                    // intentionally disabled
                  }}
                />
                <div className="pl-1">
                  <Input
                    label="Punti Marcatore"
                    type="number"
                    step="0.5"
                    disabled
                    value={String((rules as any)?.pointsScorer ?? 3)}
                    onChange={() => {
                      // intentionally disabled
                    }}
                  />
                </div>

                <div className="pt-2" />

                <SwitchRow
                  label="Pronostico: Vincitore competizione (🏆)"
                  hint="Permette agli utenti di scegliere la squadra vincitrice della competizione entro la deadline."
                  checked={!!(rules as any)?.enableCompetitionWinner}
                  onChange={(v) => setRules({ ...(rules as any), enableCompetitionWinner: v })}
                />
                <div className="pl-1">
                  <Input
                    label="Punti Vincitore competizione"
                    type="number"
                    step="0.5"
                    disabled={!((rules as any)?.enableCompetitionWinner)}
                    value={String((rules as any)?.pointsCompetitionWinner ?? 15)}
                    onChange={(e) => setRules({ ...(rules as any), pointsCompetitionWinner: Number(e.target.value) })}
                  />
                </div>

                <SwitchRow
                  label="Pronostico: Capocannoniere competizione (🥅)"
                  hint="Permette agli utenti di scegliere il capocannoniere finale entro la deadline."
                  checked={!!(rules as any)?.enableCompetitionTopScorer}
                  onChange={(v) => setRules({ ...(rules as any), enableCompetitionTopScorer: v })}
                />
                <div className="pl-1">
                  <Input
                    label="Punti Capocannoniere competizione"
                    type="number"
                    step="0.5"
                    disabled={!((rules as any)?.enableCompetitionTopScorer)}
                    value={String((rules as any)?.pointsCompetitionTopScorer ?? 12)}
                    onChange={(e) => setRules({ ...(rules as any), pointsCompetitionTopScorer: Number(e.target.value) })}
                  />
                </div>

                {(rules as any)?.competitionType === "KNOCKOUT_CUP" ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                    <div className="text-sm font-extrabold text-amber-100">Pronostici fasi eliminatorie</div>
                    <div className="text-xs text-slate-400">Disponibile solo per competizioni configurate dal SuperAdmin come coppa/fasi a eliminazione.</div>
                    <SwitchRow
                      label="Pronostico: squadra che arriva ai quarti"
                      hint="L'utente sceglie una squadra tra quelle disponibili. Può essere la stessa scelta anche per semifinale/finale."
                      checked={!!(rules as any)?.enableCompetitionQuarterFinalist}
                      onChange={(v) => setRules({ ...(rules as any), enableCompetitionQuarterFinalist: v })}
                    />
                    <Input
                      label="Punti qualificata ai quarti"
                      type="number"
                      step="0.5"
                      disabled={!((rules as any)?.enableCompetitionQuarterFinalist)}
                      value={String((rules as any)?.pointsCompetitionQuarterFinalist ?? 8)}
                      onChange={(e) => setRules({ ...(rules as any), pointsCompetitionQuarterFinalist: Number(e.target.value) })}
                    />
                    <SwitchRow
                      label="Pronostico: squadra che arriva in semifinale"
                      checked={!!(rules as any)?.enableCompetitionSemiFinalist}
                      onChange={(v) => setRules({ ...(rules as any), enableCompetitionSemiFinalist: v })}
                    />
                    <Input
                      label="Punti qualificata in semifinale"
                      type="number"
                      step="0.5"
                      disabled={!((rules as any)?.enableCompetitionSemiFinalist)}
                      value={String((rules as any)?.pointsCompetitionSemiFinalist ?? 10)}
                      onChange={(e) => setRules({ ...(rules as any), pointsCompetitionSemiFinalist: Number(e.target.value) })}
                    />
                    <SwitchRow
                      label="Pronostico: squadra che arriva in finale"
                      checked={!!(rules as any)?.enableCompetitionFinalist}
                      onChange={(v) => setRules({ ...(rules as any), enableCompetitionFinalist: v })}
                    />
                    <Input
                      label="Punti finalista"
                      type="number"
                      step="0.5"
                      disabled={!((rules as any)?.enableCompetitionFinalist)}
                      value={String((rules as any)?.pointsCompetitionFinalist ?? 12)}
                      onChange={(e) => setRules({ ...(rules as any), pointsCompetitionFinalist: Number(e.target.value) })}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                    I pronostici su quarti, semifinali e finale sono disponibili solo se il SuperAdmin imposta la competizione come coppa con fasi a eliminazione.
                  </div>
                )}


              </div>
            </Section>

            {/* Scoring mode */}
            <Section title="Modalità punteggio" hint="Scegli come combinare i punteggi (cumulativo, solo il migliore, oppure misto configurabile).">
              <div className="space-y-3">
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm"
                  value={rules?.scoringMode || "CUMULATIVE"}
                  onChange={(e) => setRules({ ...rules, scoringMode: e.target.value })}
                >
                  <option value="CUMULATIVE">Cumulativo (Esatto + 1X2 + SommaGol)</option>
                  <option value="BEST_ONLY">Solo punteggio più alto</option>
                  <option value="MIXED">Misto (configurabile)</option>
                </select>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                  {rules?.scoringMode === "CUMULATIVE" ? (
                    <span>In modalità <b className="text-slate-200">Cumulativo</b> ogni categoria corretta si somma. Se Under/Over 2.5 è attivo, si somma sempre anche lui.</span>
                  ) : rules?.scoringMode === "BEST_ONLY" ? (
                    <span>In modalità <b className="text-slate-200">Solo punteggio più alto</b> viene conteggiata una sola categoria: in caso di parità la priorità è <b className="text-slate-200">Esatto → 1X2 → Somma gol → U/O 2.5</b>.</span>
                  ) : (
                    <span>In modalità <b className="text-slate-200">Mista</b> puoi decidere quali categorie si sommano. Le opzioni sotto governano anche quando <b className="text-slate-200">U/O 2.5</b> si aggiunge a Esatto, 1X2 o Somma gol.</span>
                  )}
                </div>

                {rules?.scoringMode === "MIXED" ? (
                  <div className="rounded-2xl border border-white/10 p-4 space-y-3">
                    <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      Regole modalità mista <HelpHint text="Definisci quali punti si sommano quando prendi un risultato esatto o un esito (1X2). Under/Over 2.5 resta configurabile con i tre flag dedicati qui sotto." />
                    </div>
                    <SwitchRow
                      label="Se prendo Esatto sommo anche 1X2"
                      checked={!!rules?.allowOutcomeWithExact}
                      onChange={(v) => setRules({ ...rules, allowOutcomeWithExact: v })}
                    />
                    <SwitchRow
                      label="Se prendo Esatto sommo anche Somma gol"
                      checked={!!rules?.allowSumGoalsWithExact}
                      onChange={(v) => setRules({ ...rules, allowSumGoalsWithExact: v })}
                    />
                    <SwitchRow
                      label="Se prendo 1X2 sommo anche Somma gol"
                      checked={!!rules?.allowSumGoalsWithOutcome}
                      onChange={(v) => setRules({ ...rules, allowSumGoalsWithOutcome: v })}
                    />

                    {rules?.enableUnderOver25 ? (
                      <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Under/Over 2.5 in modalità mista
                        </div>
                        <div className="text-xs text-slate-400">
                          Scegli quando i punti <b>U/O 2.5</b> si sommano al punteggio principale (Esatto / 1X2 / Somma gol).
                        </div>
                        <SwitchRow
                          label="Somma U/O 2.5 con Esatto"
                          checked={(rules as any)?.allowUnderOverWithExact !== false}
                          onChange={(v) => setRules({ ...(rules as any), allowUnderOverWithExact: v })}
                        />
                        <SwitchRow
                          label="Somma U/O 2.5 con 1X2"
                          checked={(rules as any)?.allowUnderOverWithOutcome !== false}
                          onChange={(v) => setRules({ ...(rules as any), allowUnderOverWithOutcome: v })}
                        />
                        <SwitchRow
                          label="Somma U/O 2.5 con Somma gol"
                          checked={(rules as any)?.allowUnderOverWithSumGoals !== false}
                          onChange={(v) => setRules({ ...(rules as any), allowUnderOverWithSumGoals: v })}
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">(Attiva Under/Over 2.5 per configurare queste opzioni.)</div>
                    )}
                  </div>
                ) : null}
              </div>
            </Section>

            <div className="flex items-center gap-2">
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
                      enableJolly: !!rules.enableJolly,
                      jollyMultiplier: Number(rules.jollyMultiplier ?? 2),
                      enableScorer: !!(rules as any).enableScorer,
                      pointsScorer: Number((rules as any).pointsScorer ?? 3),
                      enableCompetitionWinner: !!(rules as any).enableCompetitionWinner,
                      pointsCompetitionWinner: Number((rules as any).pointsCompetitionWinner ?? 15),
                      enableCompetitionTopScorer: !!(rules as any).enableCompetitionTopScorer,
                      pointsCompetitionTopScorer: Number((rules as any).pointsCompetitionTopScorer ?? 12),
                      enableCompetitionQuarterFinalist: (rules as any)?.competitionType === "KNOCKOUT_CUP" && !!(rules as any).enableCompetitionQuarterFinalist,
                      pointsCompetitionQuarterFinalist: Number((rules as any).pointsCompetitionQuarterFinalist ?? 8),
                      enableCompetitionSemiFinalist: (rules as any)?.competitionType === "KNOCKOUT_CUP" && !!(rules as any).enableCompetitionSemiFinalist,
                      pointsCompetitionSemiFinalist: Number((rules as any).pointsCompetitionSemiFinalist ?? 10),
                      enableCompetitionFinalist: (rules as any)?.competitionType === "KNOCKOUT_CUP" && !!(rules as any).enableCompetitionFinalist,
                      pointsCompetitionFinalist: Number((rules as any).pointsCompetitionFinalist ?? 12),
                      scoringMode: rules.scoringMode,
                      allowOutcomeWithExact: !!rules.allowOutcomeWithExact,
                      allowSumGoalsWithExact: !!rules.allowSumGoalsWithExact,
                      allowSumGoalsWithOutcome: !!rules.allowSumGoalsWithOutcome,

                      // Under/Over cumulability (MIXED)
                      allowUnderOverWithExact: (rules as any).allowUnderOverWithExact !== false,
                      allowUnderOverWithOutcome: (rules as any).allowUnderOverWithOutcome !== false,
                      allowUnderOverWithSumGoals: (rules as any).allowUnderOverWithSumGoals !== false,
                      ...(typeof rules.entryFeeCents === "number" ? { entryFeeCents: Number(rules.entryFeeCents) } : { entryFeeCents: null }),
                      prizesJson: Array.isArray(rules.prizesJson) ? rules.prizesJson : null,
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
              <span className="text-xs text-slate-400">Le modifiche ricalcolano la classifica.</span>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Monetization */}
          <Card>
            <CardHeader title="Quota & premi" subtitle="Opzionale (visibile nel regolamento)" />
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-300 flex items-center gap-2">
                Impostazioni facoltative <HelpHint text="Se lasci vuoto, nel regolamento non verrà mostrata alcuna quota/premio." />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Quota (€)"
                  type="number"
                  value={entryFeeEuro}
                  placeholder="Es. 10"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) return setRules({ ...rules, entryFeeCents: null });
                    const cents = Math.max(0, Math.round(Number(v) * 100));
                    setRules({ ...rules, entryFeeCents: Number.isFinite(cents) ? cents : null });
                  }}
                />
                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-xs text-slate-400">Posizioni a premio</div>
                  <div className="text-sm font-semibold">{prizes.length}</div>
                  <div className="text-xs text-slate-400 mt-1">Aggiungi/rimuovi sotto</div>
                </div>
              </div>

              <div className="space-y-2">
                {prizes.map((p: any, idx: number) => (
                  <div key={p.position ?? idx} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        label={`${p.position}° posto (€)`}
                        type="number"
                        value={String(Math.round(Number(p.amountCents || 0) / 100))}
                        placeholder={p.position === 1 ? "Es. 200" : ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const cents = v ? Math.max(0, Math.round(Number(v) * 100)) : 0;
                          const next = [...prizes];
                          next[idx] = { ...next[idx], amountCents: Number.isFinite(cents) ? cents : 0 };
                          setRules({ ...rules, prizesJson: next });
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="mb-[6px] h-10 w-10 rounded-xl border border-white/10 bg-slate-950/70 hover:shadow-sm transition flex items-center justify-center"
                      title="Rimuovi premio"
                      onClick={() => {
                        const next = prizes.filter((_, i) => i !== idx).map((x, i) => ({ ...x, position: i + 1 }));
                        setRules({ ...rules, prizesJson: next });
                      }}
                    >
                      {/* trash */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M7 6l1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}

                <Button
                  variant="ghost"
                  className="!px-4"
                  onClick={() => {
                    const next = [...prizes];
                    next.push({ position: next.length + 1, amountCents: 0 });
                    setRules({ ...rules, prizesJson: next });
                  }}
                >
                  + Aggiungi premio
                </Button>
              </div>

              <div className="text-xs text-slate-400">
                Suggerimento: imposta importi in € (l'app salva in centesimi).
              </div>
            </CardContent>
          </Card>

          {/* Jolly */}
          <Card>
            <CardHeader title="Partita Jolly ⭐" subtitle="Seleziona la partita per giornata (opzionale)" />
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-300">
                {rules?.enableJolly ? (
                  <>
                    Scegli una partita per ogni giornata: i punti ottenuti su quella partita vengono moltiplicati per <span className="font-semibold">x{Number(rules?.jollyMultiplier ?? 2) || 2}</span>.
                  </>
                ) : (
                  <>La Partita Jolly è disattivata nelle regole. Attivala nella sezione "Funzioni extra" per renderla effettiva.</>
                )}
              </div>

              {(() => {
                const byMd = new Map<number, any[]>();
                (matches || []).forEach((m: any) => {
                  const md = Number(m.matchday || 1);
                  byMd.set(md, [...(byMd.get(md) || []), m]);
                });
                const matchdays = Array.from(byMd.keys()).sort((a, b) => a - b);
                const selMap = new Map<number, string>();
                (jolly?.selections || []).forEach((s: any) => selMap.set(Number(s.matchday), String(s.matchId)));

                if (matchdays.length === 0) {
                  return <div className="text-xs text-slate-400">Nessuna partita disponibile.</div>;
                }

                return (
                  <div className="space-y-3">
                    {matchdays.map((md) => {
                      const list = (byMd.get(md) || []).slice().sort((a: any, b: any) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
                      const current = selMap.get(md) || "";
                      return (
                        <div key={md} className="rounded-2xl border border-white/10 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-100">Giornata {md}</div>
                            {current ? <span className="text-xs font-semibold text-amber-200">⭐ Selezionata</span> : <span className="text-xs text-slate-400">—</span>}
                          </div>

                          <select
                            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm"
                            value={current}
                            onChange={async (e) => {
                              const v = e.target.value || "";
                              show();
                              try {
                                setErr("");
                                setOk("");
                                await api.adminSetJollyForMatchday(md, v ? v : null);
                                const r = await api.adminJolly();
                                setJolly(r);
                                setOk('Partita jolly aggiornata. Classifica ricalcolata.');
                              } catch (e: any) {
                                setErr(e?.message || 'Errore');
                              } finally {
                                hide();
                              }
                            }}
                          >
                            <option value="">Nessuna (disattiva per questa giornata)</option>
                            {list.map((m: any) => {
                              const label = `${m.homeTeam} - ${m.awayTeam}`;
                              const when = (() => {
                                try {
                                  const d = new Date(m.kickoffAt);
                                  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                } catch {
                                  return '';
                                }
                              })();
                              return (
                                <option key={m.id} value={m.id}>
                                  {when ? `${when} · ` : ''}{label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="text-xs text-slate-400">
                Nota: se la feature è disattivata, la selezione non ha effetti sul punteggio (ma viene comunque salvata).
              </div>
            </CardContent>
          </Card>

          {/* Lock */}
          <Card>
            <CardHeader title="Lock pronostici" subtitle="Blocco automatico gestito dal calendario" />
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold flex items-center gap-2">
                  Come funziona <HelpHint text="Il lock è automatico: parte X minuti prima del match rilevante. In modalità 'giornata per giornata' il lock è per-matchday (solo la giornata interessata), così i rinvii non bloccano le giornate successive." />
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
                  <li>Automatico con anticipo configurabile.</li>
                  <li>Con rinvii: si blocca solo la matchday in lock, non tutta la lega.</li>
                </ul>
              </div>

              <Section
                title="Modalità inserimento pronostici"
                hint="Scegli se i partecipanti inseriscono tutti i pronostici prima dell'inizio del torneo oppure giornata per giornata."
              >
                <div className="grid gap-2">
                  <RadioCard
                    checked={(settings?.predictionMode || "MATCHDAY_BY_MATCHDAY") === "TOURNAMENT_PRE"}
                    title="Tutti prima del torneo"
                    subtitle="I partecipanti inseriscono tutti i pronostici prima dell'inizio."
                    onSelect={() => setSettings({ ...settings, predictionMode: "TOURNAMENT_PRE" })}
                  />
                  <RadioCard
                    checked={(settings?.predictionMode || "MATCHDAY_BY_MATCHDAY") === "MATCHDAY_BY_MATCHDAY"}
                    title="Giornata per giornata"
                    subtitle="Si pronostica la giornata in corso (se rinvii) + la prossima che deve iniziare."
                    onSelect={() => setSettings({ ...settings, predictionMode: "MATCHDAY_BY_MATCHDAY" })}
                  />
                </div>
              </Section>

              <Section title="Anticipo lock" hint="Quanto tempo prima del primo match rilevante bloccare i pronostici.">
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm"
                  value={String(settings?.lockOffsetMinutes ?? 30)}
                  onChange={(e) => setSettings({ ...settings, lockOffsetMinutes: Number(e.target.value) })}
                >
                  <option value="60">1 ora prima</option>
                  <option value="30">30 minuti prima</option>
                  <option value="15">15 minuti prima</option>
                  <option value="0">All'inizio della partita (0 min)</option>
                </select>
                <div className="mt-1 text-xs text-slate-400">Esempio: primo match 20:45 con 30 min → lock dalle 20:15.</div>
              </Section>

              <Section
                title="Deadline pronostici competizione"
                hint="Entro questa data/ora gli utenti possono modificare Vincitore competizione e Capocannoniere. Se vuoto, la deadline è l'inizio del primo match disponibile."
              >
                <Input
                  label="Deadline (data e ora)"
                  type="datetime-local"
                  value={(() => {
                    const iso = settings?.competitionPredictionsDeadline;
                    if (!iso) return "";
                    try {
                      return new Date(iso).toISOString().slice(0, 16);
                    } catch {
                      return "";
                    }
                  })()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return setSettings({ ...settings, competitionPredictionsDeadline: null });
                    try {
                      const d = new Date(v);
                      setSettings({ ...settings, competitionPredictionsDeadline: d.toISOString() });
                    } catch {
                      setSettings({ ...settings, competitionPredictionsDeadline: null });
                    }
                  }}
                />
                <div className="mt-1 text-xs text-slate-400">Suggerimento: imposta la deadline prima della prima giornata.</div>
              </Section>

              <Section title="Lock forzato" hint="Blocca subito i pronostici indipendentemente dal calendario. Usa questa opzione solo in emergenza.">
                <SwitchRow
                  label="Attiva lock forzato"
                  checked={!!settings?.isForceLocked}
                  onChange={(v) => setSettings({ ...settings, isForceLocked: v })}
                />
              </Section>

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
                        competitionPredictionsDeadline: settings.competitionPredictionsDeadline ?? null,
                      });
                      await load();
                      setOk("Impostazioni salvate.");
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    } finally {
                      hide();
                    }
                  }}
                >
                  Salva lock
                </Button>

                {!settings?.isForceLocked ? (
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
                    Blocca ora
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
                          competitionPredictionsDeadline: settings.competitionPredictionsDeadline ?? null,
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* TIEBREAKERS (unchanged, but with a hint) */}
      <Card>
        <CardHeader title="Criteri classifica" subtitle="Ordine di spareggio a parità di punti" />
        <CardContent>
          {settings ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-400 flex items-center gap-2">
                La classifica è ordinata per <b>punti totali</b>. A parità di punti si applicano questi criteri.
                <HelpHint text="Questi criteri vengono usati solo quando due utenti hanno gli stessi punti totali. Consiglio: scegli criteri diversi tra loro." />
              </div>

              <TieBreakerRow label="1° spareggio" value={settings.tieBreak1 || "EXACT"} onChange={(v) => setSettings({ ...settings, tieBreak1: v })} />
              <TieBreakerRow label="2° spareggio" value={settings.tieBreak2 || "OUTCOME"} onChange={(v) => setSettings({ ...settings, tieBreak2: v })} />
              <TieBreakerRow label="3° spareggio" value={settings.tieBreak3 || "SUM_GOALS"} onChange={(v) => setSettings({ ...settings, tieBreak3: v })} />

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
                      competitionPredictionsDeadline: settings.competitionPredictionsDeadline ?? null,
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
      <span className="text-slate-300">{label}</span>
      <select className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value as any)}>
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
      <span className="text-slate-300">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}


function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isMobile = typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Aiuto"
        className="h-5 w-5 rounded-full border border-white/10 bg-slate-950/70 text-slate-400 hover:shadow-sm transition inline-flex items-center justify-center"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>

      {open ? (
        isMobile ? (
          <div className="fixed inset-0 z-[80]">
            <button
              className="absolute inset-0 bg-black/40"
              aria-label="Chiudi aiuto"
              onClick={() => setOpen(false)}
            />
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-slate-950/70 p-4 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-base font-semibold text-slate-100">Info</div>
                <button type="button" className="text-sm font-semibold text-slate-400" onClick={() => setOpen(false)}>
                  Chiudi
                </button>
              </div>
              <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm text-slate-300 pr-1">
                {text}
              </div>
              <div className="h-[calc(env(safe-area-inset-bottom)+8px)]" />
            </div>
          </div>
        ) : (
          <div className="absolute z-30 top-7 right-0 w-72 rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300 shadow-lg">
            <div className="whitespace-pre-wrap">{text}</div>
            <div className="mt-2 flex justify-end">
              <button type="button" className="text-xs text-slate-400 hover:text-slate-300" onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>
          </div>
        )
      ) : null}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
        </div>
        {hint ? <HelpHint text={hint} /> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-300 flex items-start gap-2">
          <span className="break-words">{label}</span>
          {hint ? <HelpHint text={hint} /> : null}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled ? "true" : "false"}
        onClick={() => {
          if (disabled) return;
          onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          disabled
            ? "cursor-not-allowed opacity-60 bg-white/5 border-white/10"
            : checked
              ? "bg-emerald-500 border-emerald-400"
              : "bg-slate-200 border-white/10"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full shadow-sm transition ${
            checked ? "translate-x-5 bg-white" : "translate-x-1 bg-slate-950"
          }`}
        />
      </button>
    </div>
  );
}

function RadioCard({
  checked,
  title,
  subtitle,
  onSelect,
}: {
  checked: boolean;
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-2xl border p-4 transition ${
        checked ? "border-rose-400/45 bg-rose-500/10 shadow-[0_12px_30px_rgba(0,0,0,0.22)]" : "border-white/20 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-950"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? "border-rose-300 bg-rose-500/15" : "border-slate-500 bg-slate-950"}`}>
          {checked ? <div className="h-2.5 w-2.5 rounded-full bg-rose-300" /> : null}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="text-xs leading-relaxed text-slate-300">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}
