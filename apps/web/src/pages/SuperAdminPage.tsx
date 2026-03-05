import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { FullScreenLoaderOverlay } from "../components/FullScreenLoaderOverlay";
import { Alert, Button, Card, CardContent, CardHeader, Badge, Input } from "../components/ui";
import { SearchableSelect } from "../components/SearchableSelect";

export default function SuperAdminPage() {
  const { show, hide } = useLoading();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  const [monetization, setMonetization] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [external, setExternal] = useState<any | null>(null);
  const [footballData, setFootballData] = useState<any | null>(null);
  const [compOutcome, setCompOutcome] = useState<any | null>(null);
  const [compSaving, setCompSaving] = useState(false);
  const [winnerId, setWinnerId] = useState<string>("");
  const [scorer1Id, setScorer1Id] = useState<string>("");
  const [scorer2Id, setScorer2Id] = useState<string>("");

  async function load() {
    show();
    setLoading(true);
    setErr("");
    try {
      const r = await api.superLeagues();
      setLeagues(r.leagues || []);
      const m = await api.superMonetization();
      setMonetization(m.config);
      const e = await api.superExternalConfig();
      setExternal(e.config);
      const fd = await api.adminFootballDataSelected();
      setFootballData(fd.selected);
      const co = await api.superCompetitionOutcome();
      setCompOutcome(co);
      setWinnerId(co?.outcome?.winner?.teamExternalId ? String(co.outcome.winner.teamExternalId) : "");
      setScorer1Id(co?.outcome?.topScorer?.playerExternalId ? String(co.outcome.topScorer.playerExternalId) : "");
      setScorer2Id(co?.outcome?.secondTopScorer?.playerExternalId ? String(co.outcome.secondTopScorer.playerExternalId) : "");
      const s = await api.superMonetizationStats();
      setStats(s);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
      hide();
    }
  }

  async function openLeague(id: string) {
    const r = await api.superLeagueDetail(id);
    setSelected(r.league);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader title="Monetizzazione (Rewarded Ads)" subtitle="Configurazione globale: solo SuperAdmin" />
        <CardContent>
          {err ? <Alert tone="danger">{err}</Alert> : null}
          {!monetization ? null : (
            <MonetizationPanel
              config={monetization}
              stats={stats}
              onSave={async (patch) => {
                try {
                  setErr("");
                  const r = await api.superSaveMonetization(patch);
                  setMonetization(r.config);
                  const s = await api.superMonetizationStats();
                  setStats(s);
                } catch (e: any) {
                  setErr(e?.message || "Errore");
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader title="football-data.org" subtitle="Workflow: seleziona competizione → importa partite → calcola giornata" />
        <CardContent>
          {!footballData ? null : (
            <FootballDataPanel
              selected={footballData}
              onChanged={async () => {
                const r = await api.adminFootballDataSelected();
                setFootballData(r.selected);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader title="Calcola giornata" subtitle="Sincronizza risultati reali da football-data.org e ricalcola punteggi/badge" />
        <CardContent>{!footballData ? null : <FootballDataSyncPanel />}</CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader
          title="Esito pronostici torneo (globale)"
          subtitle="Imposta vincitore e capocannonieri globali (validi per tutte le leghe). In caso di pari merito puoi scegliere anche un 2° capocannoniere."
        />
        <CardContent className="space-y-4">
          {!compOutcome ? <div className="text-sm text-slate-600">Caricamento…</div> : null}
          {err ? <Alert tone="danger">{err}</Alert> : null}

          {compOutcome ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Squadra vincente (globale)</div>
                  <SearchableSelect
                    value={winnerId}
                    onChange={setWinnerId}
                    placeholder="Seleziona squadra…"
                    options={(compOutcome.options?.teams || [])
                      .map((t: any) => ({ value: String(t.id), label: t.name }))
                      .sort((a: any, b: any) => a.label.localeCompare(b.label, "it"))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Capocannoniere #1 (globale)</div>
                  <SearchableSelect
                    value={scorer1Id}
                    onChange={setScorer1Id}
                    placeholder="Seleziona giocatore…"
                    options={(compOutcome.options?.scorers || [])
                      .map((p: any) => ({ value: String(p.id), label: `${p.name}${p.teamName ? ` (${p.teamName})` : ""}` }))
                      .sort((a: any, b: any) => a.label.localeCompare(b.label, "it"))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Capocannoniere #2 (opzionale)</div>
                      <div className="text-xs text-slate-500">Usalo solo se vuoi considerare un 2° top scorer (pari merito).</div>
                    </div>
                    {scorer2Id ? (
                      <Button variant="secondary" onClick={() => setScorer2Id("")}>Rimuovi</Button>
                    ) : null}
                  </div>
                  <SearchableSelect
                    value={scorer2Id}
                    onChange={setScorer2Id}
                    placeholder="Seleziona giocatore…"
                    options={(compOutcome.options?.scorers || [])
                      .map((p: any) => ({ value: String(p.id), label: `${p.name}${p.teamName ? ` (${p.teamName})` : ""}` }))
                      .sort((a: any, b: any) => a.label.localeCompare(b.label, "it"))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  disabled={compSaving}
                  onClick={async () => {
                    try {
                      setErr("");
                      setCompSaving(true);
                      const team = (compOutcome.options?.teams || []).find((t: any) => String(t.id) === winnerId);
                      const s1 = (compOutcome.options?.scorers || []).find((p: any) => String(p.id) === scorer1Id);
                      const s2 = (compOutcome.options?.scorers || []).find((p: any) => String(p.id) === scorer2Id);

                      await api.superSaveCompetitionOutcome({
                        winnerTeamId: winnerId ? Number(winnerId) : null,
                        winnerTeamName: team?.name ?? null,
                        topScorerPlayerId: scorer1Id ? Number(scorer1Id) : null,
                        topScorerPlayerName: s1?.name ?? null,
                        secondTopScorerPlayerId: scorer2Id ? Number(scorer2Id) : null,
                        secondTopScorerPlayerName: s2?.name ?? null,
                      });

                      const refreshed = await api.superCompetitionOutcome();
                      setCompOutcome(refreshed);
                      setWinnerId(refreshed?.outcome?.winner?.teamExternalId ? String(refreshed.outcome.winner.teamExternalId) : "");
                      setScorer1Id(refreshed?.outcome?.topScorer?.playerExternalId ? String(refreshed.outcome.topScorer.playerExternalId) : "");
                      setScorer2Id(refreshed?.outcome?.secondTopScorer?.playerExternalId ? String(refreshed.outcome.secondTopScorer.playerExternalId) : "");
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    } finally {
                      setCompSaving(false);
                    }
                  }}
                >
                  {compSaving ? "Salvo…" : "Salva esito globale"}
                </Button>

                {compOutcome?.outcome?.resolvedAt ? (
                  <span className="text-xs text-slate-500">Ultimo salvataggio: {new Date(compOutcome.outcome.resolvedAt).toLocaleString("it-IT")}</span>
                ) : (
                  <span className="text-xs text-slate-500">Non ancora impostato.</span>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Area Admin - Leghe" subtitle="Gestisci leghe e admin" />
        <CardContent>
          {err ? <Alert tone="danger">{err}</Alert> : null}
          <div className="space-y-2">
            {leagues.map((l) => (
              <button
                key={l.id}
                className="w-full rounded-xl border border-slate-800 px-4 py-3 text-left hover:bg-slate-900/40"
                onClick={() => openLeague(l.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{l.name}</div>
                  <Badge>{l.code}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-600">Membri: {l._count?.members ?? 0}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Dettaglio lega" subtitle="Approva membri e assegna admin" />
        <CardContent>
          {!selected ? (
            <div className="text-sm text-slate-600">Seleziona una lega a sinistra.</div>
          ) : (
            <LeagueDetail league={selected} onChanged={async () => { await openLeague(selected.id); await load(); }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonetizationPanel({
  config,
  stats,
  onSave,
}: {
  config: any;
  stats: any;
  onSave: (patch: { adsEnabled?: boolean; demoAdsEnabled?: boolean; unlockMinutes?: number }) => Promise<void>;
}) {
  const [local, setLocal] = useState({
    adsEnabled: !!config.adsEnabled,
    demoAdsEnabled: !!config.demoAdsEnabled,
    unlockMinutes: Number(config.unlockMinutes || 5),
  });

  useEffect(() => {
    setLocal({
      adsEnabled: !!config.adsEnabled,
      demoAdsEnabled: !!config.demoAdsEnabled,
      unlockMinutes: Number(config.unlockMinutes || 5),
    });
  }, [config]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-800 p-3">
          <div>
            <div className="font-medium">Ads abilitati</div>
            <div className="text-xs text-slate-600">Se OFF, i pronostici sono visibili senza sblocco</div>
          </div>
          <input
            type="checkbox"
            checked={local.adsEnabled}
            onChange={(e) => setLocal((x) => ({ ...x, adsEnabled: e.target.checked }))}
            className="h-5 w-5"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-800 p-3">
          <div>
            <div className="font-medium">Fallback demo</div>
            <div className="text-xs text-slate-600">Se ON, usa il countdown demo quando Ad Manager non è disponibile</div>
          </div>
          <input
            type="checkbox"
            checked={local.demoAdsEnabled}
            onChange={(e) => setLocal((x) => ({ ...x, demoAdsEnabled: e.target.checked }))}
            className="h-5 w-5"
          />
        </div>

        <div className="rounded-xl border border-slate-800 p-3">
          <div className="font-medium">Durata sblocco (minuti)</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={120}
              value={local.unlockMinutes}
              onChange={(e) => setLocal((x) => ({ ...x, unlockMinutes: Number(e.target.value) }))}
              className="w-28 rounded-lg border border-slate-800 px-3 py-2"
            />
            <Button onClick={() => onSave({ ...local })}>Salva</Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-800 p-3">
          <div className="font-medium">Statistiche</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-slate-900/40 p-2">
              <div className="text-xs text-slate-600">Unlock totali</div>
              <div className="font-semibold">{stats?.totalUnlocks ?? 0}</div>
            </div>
            <div className="rounded-lg bg-slate-900/40 p-2">
              <div className="text-xs text-slate-600">Utenti unici</div>
              <div className="font-semibold">{stats?.uniqueUsers ?? 0}</div>
            </div>
            <div className="rounded-lg bg-slate-900/40 p-2">
              <div className="text-xs text-slate-600">Media minuti</div>
              <div className="font-semibold">{stats?.avgMinutes ? Math.round(stats.avgMinutes) : "-"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 p-3">
          <div className="font-medium">Ultimi sblocchi</div>
          <div className="mt-2 space-y-2">
            {(stats?.last || []).slice(0, 8).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{r.user?.displayName || r.user?.email || r.userId}</div>
                  <div className="text-xs text-slate-600">{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <Badge>{r.minutes}m</Badge>
              </div>
            ))}
            {(!stats?.last || stats.last.length === 0) ? <div className="text-sm text-slate-600">Nessun dato.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FootballDataPanel({ selected, onChanged }: { selected: any; onChanged: () => Promise<void> }) {
  const [season, setSeason] = useState<string>(selected.season ? String(selected.season) : "");
  const [area, setArea] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [comps, setComps] = useState<any[]>([]);
  const [chosen, setChosen] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function doSearch() {
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const r = await api.adminFootballDataCompetitions({ search: search.trim() || undefined, area: area.trim() || undefined });
      setComps(Array.isArray(r.competitions) ? r.competitions : []);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  const seasonNum = season.trim() ? Number(season.trim()) : null;

  return (
    <div className="space-y-4">
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">Season (opz.)</div>
          <input
            type="number"
            className="w-40 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="es. 2024"
          />
        </label>
        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">Area (opz.)</div>
          <input className="w-44 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Italy / Europe" />
        </label>
        <label className="space-y-1 text-sm flex-1 min-w-[200px]">
          <div className="text-xs text-slate-600">Search (opz.)</div>
          <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serie A, Champions, Worldcup..." />
        </label>
        <Button disabled={loading} onClick={doSearch}>Cerca</Button>
      </div>

      <div className="text-xs text-slate-600">
        Selezionata: {selected.competitionCode ? `${selected.competitionCode}${selected.season ? ` (${selected.season})` : ""}` : "nessuna"} · API key: {selected.footballDataKeyPresent ? "OK" : "mancante"}
      </div>

      {comps.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {comps.slice(0, 12).map((c: any) => {
            const code = c.code;
            const name = c.name;
            const areaName = c.area?.name || "";
            return (
              <button
                key={code}
                className={`rounded-xl border p-3 text-left hover:bg-slate-900/40 ${chosen?.code === code ? "border-slate-900" : "border-slate-800"}`}
                onClick={() => setChosen({ code, name, area: areaName })}
              >
                <div className="font-medium">{name}</div>
                <div className="text-xs text-slate-600">{areaName} · Code: {code}</div>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!chosen}
          onClick={async () => {
            try {
              if (!chosen) return;
              setErr("");
              setOk("");
              await api.adminFootballDataSelect(chosen.code, seasonNum);
              await onChanged();
              setOk("Competizione selezionata.");
            } catch (e: any) {
              setErr(e?.message || "Errore");
            }
          }}
        >
          Seleziona competizione
        </Button>
        <Button
          onClick={async () => {
            try {
              setErr("");
              setOk("");
              const r = await api.adminFootballDataImportFixtures();
              setOk(`Partite importate: ${r.imported ?? 0}`);
            } catch (e: any) {
              setErr(e?.message || "Errore");
            }
          }}
        >
          Importa partite
        </Button>
      </div>
    </div>
  );
}

function FootballDataSyncPanel() {
  const [matchday, setMatchday] = useState<string>("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-3">
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">Matchday (opz.)</div>
          <input className="w-40 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2" value={matchday} onChange={(e) => setMatchday(e.target.value)} placeholder="es. 1" />
        </label>
        <Button
          disabled={loading}
          onClick={async () => {
            try {
              setLoading(true);
              setErr("");
              setOk("");
              const md = matchday.trim() ? Number(matchday.trim()) : undefined;
              const r = await api.adminFootballDataSyncResults(md);
              setOk(`Sync completato. Aggiornate: ${r.updated ?? 0}`);
            } catch (e: any) {
              setErr(e?.message || "Errore");
            } finally {
              setLoading(false);
            }
          }}
        >
          Calcola giornata
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              setErr("");
              const s = await api.adminFootballDataStatus();
              setOk(s?.note ? String(s.note) : "OK");
            } catch (e: any) {
              setErr(e?.message || "Errore");
            }
          }}
        >
          Stato quota
        </Button>
      </div>
      <div className="text-xs text-slate-600">I risultati vengono sincronizzati automaticamente da football-data.org. La modifica manuale è disabilitata per queste partite.</div>
    </div>
  );
}

function ExternalProviderPanel({ config, onChanged }: { config: any; onChanged: () => Promise<void> }) {
  const [local, setLocal] = useState({
    provider: String(config.provider || "FOOTBALL_DATA"),
    apiFootballLeagueId: config.apiFootballLeagueId ?? 135,
    apiFootballSeason: config.apiFootballSeason ?? 2025,
    apiFootballTimezone: config.apiFootballTimezone || "Europe/Rome",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [search, setSearch] = useState("Serie A");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    setLocal({
      provider: String(config.provider || "FOOTBALL_DATA"),
      apiFootballLeagueId: config.apiFootballLeagueId ?? 135,
      apiFootballSeason: config.apiFootballSeason ?? 2025,
      apiFootballTimezone: config.apiFootballTimezone || "Europe/Rome",
    });
  }, [config]);

  return (
    <div className="space-y-4">
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">Provider</div>
          <select
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={local.provider}
            onChange={(e) => setLocal((x) => ({ ...x, provider: e.target.value }))}
          >
            <option value="API_FOOTBALL">API-Football (api-football.com)</option>
            <option value="FOOTBALL_DATA">football-data.org (legacy)</option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">League ID (API-Football)</div>
          <input
            type="number"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={local.apiFootballLeagueId}
            onChange={(e) => setLocal((x) => ({ ...x, apiFootballLeagueId: Number(e.target.value) }))}
          />
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-xs text-slate-600">Season (es. 2025 per 2025/26)</div>
          <input
            type="number"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={local.apiFootballSeason}
            onChange={(e) => setLocal((x) => ({ ...x, apiFootballSeason: Number(e.target.value) }))}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm md:col-span-2">
          <div className="text-xs text-slate-600">Timezone</div>
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={local.apiFootballTimezone}
            onChange={(e) => setLocal((x) => ({ ...x, apiFootballTimezone: e.target.value }))}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button
            onClick={async () => {
              try {
                setErr("");
                setOk("");
                await api.superSaveExternalConfig({
                  provider: local.provider,
                  apiFootballLeagueId: local.apiFootballLeagueId,
                  apiFootballSeason: local.apiFootballSeason,
                  apiFootballTimezone: local.apiFootballTimezone,
                });
                await onChanged();
                setOk("Configurazione salvata.");
              } catch (e: any) {
                setErr(e?.message || "Errore");
              }
            }}
          >
            Salva config
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 p-3">
        <div className="text-sm font-medium">Trova League ID (ricerca)</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Es. Serie A, Champions..."
          />
          <Button
            onClick={async () => {
              try {
                setErr("");
                const r = await api.superSearchExternalLeagues(search, local.apiFootballSeason);
                setSearchResults(r.leagues || []);
              } catch (e: any) {
                setErr(e?.message || "Errore");
              }
            }}
          >
            Cerca
          </Button>
        </div>
        {searchResults.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {searchResults.slice(0, 6).map((l: any) => (
              <button
                key={l.id}
                className="rounded-xl border border-slate-800 p-3 text-left hover:bg-slate-900/40"
                onClick={() => setLocal((x) => ({ ...x, apiFootballLeagueId: l.id }))}
              >
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-slate-600">{l.country} · ID: {l.id}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              setErr("");
              setOk("");
              await api.superImportFixtures();
              setOk("Partite importate. Vai su Pronostici: le vedrai subito.");
            } catch (e: any) {
              setErr(e?.message || "Errore");
            }
          }}
        >
          Importa partite
        </Button>
        {!config.apiFootballKeyPresent ? (
          <Badge>API_FOOTBALL_KEY mancante in .env</Badge>
        ) : (
          <Badge>API_FOOTBALL_KEY OK</Badge>
        )}
      </div>
    </div>
  );
}

function LeagueDetail({ league, onChanged }: { league: any; onChanged: () => void }) {
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"members" | "rules">("members");

  // Per-league config panels (rules + lock) for the selected league.
  // Useful both for SuperAdmin oversight and for keeping settings truly league-scoped.
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [ok, setOk] = useState("");
  const [rules, setRules] = useState<any | null>(null);
  const [settings, setSettings] = useState<any | null>(null);

  async function loadCfg() {
    setLoadingCfg(true);
    setErr("");
    setOk("");
    try {
      const [r1, r2] = await Promise.all([api.adminRules(league.id), api.adminSettings(league.id)]);
      setRules(r1.rules);
      setSettings(r2.settings);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoadingCfg(false);
    }
  }

  useEffect(() => {
    // Load config when the panel mounts / league changes.
    loadCfg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id]);

  return (
    <div className="space-y-3">
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <div className="rounded-xl border border-slate-800 p-3">
        <div className="font-medium">{league.name}</div>
        <div className="text-xs text-slate-600">Code: {league.code} • ID: {league.id}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "members" ? "primary" : "ghost"} onClick={() => setTab("members")}>
          Partecipanti
        </Button>
        <Button variant={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>
          Regole & Lock
        </Button>
      </div>

      {tab === "members" ? (
        <div className="space-y-2">
          {(league.members || []).map((m: any) => (
            <div key={m.id} className="rounded-xl border border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.user.displayName}</div>
                  <div className="text-xs text-slate-600">{m.user.email}</div>
                </div>
                <div className="flex gap-2">
                  <Badge>{m.status}</Badge>
                  <Badge>{m.role}</Badge>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    try {
                      setErr("");
                      await api.superPatchMember(league.id, m.id, { status: "APPROVED" });
                      onChanged();
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    }
                  }}
                  variant="ghost"
                >
                  Approva
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      setErr("");
                      await api.superPatchMember(league.id, m.id, { status: "REJECTED" });
                      onChanged();
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    }
                  }}
                  variant="ghost"
                >
                  Rifiuta
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      setErr("");
                      await api.superPatchMember(league.id, m.id, { role: m.role === "ADMIN" ? "MEMBER" : "ADMIN" });
                      onChanged();
                    } catch (e: any) {
                      setErr(e?.message || "Errore");
                    }
                  }}
                  variant="ghost"
                >
                  Toggle Admin
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Regole punteggi" subtitle="Per singola lega" />
            <CardContent>
              {loadingCfg ? <Spinner /> : null}
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

                  <div className="rounded-xl border border-slate-800 p-3">
                    <div className="font-medium">Modalità punteggio</div>
                    <div className="mt-2">
                      <select
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                        value={rules.scoringMode}
                        onChange={(e) => setRules({ ...rules, scoringMode: e.target.value })}
                      >
                        <option value="CUMULATIVE">CUMULATIVE</option>
                        <option value="BEST_ONLY">BEST_ONLY</option>
                        <option value="MIXED">MIXED</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={!!rules.allowOutcomeWithExact}
                        onChange={(e) => setRules({ ...rules, allowOutcomeWithExact: e.target.checked })}
                      />
                      <span>Outcome valido con Exact</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={!!rules.allowSumGoalsWithExact}
                        onChange={(e) => setRules({ ...rules, allowSumGoalsWithExact: e.target.checked })}
                      />
                      <span>Somma gol valida con Exact</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={!!rules.allowSumGoalsWithOutcome}
                        onChange={(e) => setRules({ ...rules, allowSumGoalsWithOutcome: e.target.checked })}
                      />
                      <span>Somma gol valida con Outcome</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={!!rules.enableMatchdayAwards}
                        onChange={(e) => setRules({ ...rules, enableMatchdayAwards: e.target.checked })}
                      />
                      <span>Badge miglior giornata</span>
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-800 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Under/Over 2.5</div>
                        <div className="text-xs text-slate-600">Bonus punti opzionale</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={!!rules.enableUnderOver25}
                        onChange={(e) => setRules({ ...rules, enableUnderOver25: e.target.checked })}
                        className="h-5 w-5"
                      />
                    </div>
                    <div className="mt-2">
                      <Input
                        label="Punti Under/Over 2.5"
                        type="number"
                        value={String(rules.pointsUnderOver25 ?? 1)}
                        onChange={(e) => setRules({ ...rules, pointsUnderOver25: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      try {
                        setErr("");
                        setOk("");
                        const r = await api.adminSaveRules(rules, league.id);
                        setRules(r.rules);
                        setOk("Regole salvate.");
                      } catch (e: any) {
                        setErr(e?.message || "Errore");
                      }
                    }}
                  >
                    Salva regole
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Nessuna regola trovata.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Lock pronostici" subtitle="Scadenza per singola lega" />
            <CardContent>
              {loadingCfg ? <Spinner /> : null}
              {settings ? (
                <div className="space-y-3">
                  <Input
                    label="Lock fino a (data e ora)"
                    type="datetime-local"
                    value={(() => {
                      const d = new Date(settings.lockUntil);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    })()}
                    onChange={(e) => {
                      const iso = new Date(e.target.value).toISOString();
                      setSettings({ ...settings, lockUntil: iso });
                    }}
                  />

                  <div className="flex items-center justify-between rounded-xl border border-slate-800 p-3">
                    <div>
                      <div className="font-medium">Lock forzato</div>
                      <div className="text-xs text-slate-600">Blocca tutto immediatamente</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!settings.isForceLocked}
                      onChange={(e) => setSettings({ ...settings, isForceLocked: e.target.checked })}
                      className="h-5 w-5"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={async () => {
                        try {
                          setErr("");
                          setOk("");
                          const r = await api.adminSaveSettings(
                            {
                              lockUntil: settings.lockUntil,
                              isForceLocked: !!settings.isForceLocked,
                              tieBreak1: settings.tieBreak1,
                              tieBreak2: settings.tieBreak2,
                              tieBreak3: settings.tieBreak3,
                            },
                            league.id
                          );
                          setSettings(r.settings);
                          setOk("Impostazioni salvate.");
                        } catch (e: any) {
                          setErr(e?.message || "Errore");
                        }
                      }}
                    >
                      Salva lock
                    </Button>
                    {!settings.isForceLocked ? (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            setErr("");
                            setOk("");
                            await api.adminLockNow(league.id);
                            setOk("Lock immediato attivato.");
                            await loadCfg();
                          } catch (e: any) {
                            setErr(e?.message || "Errore");
                          }
                        }}
                      >
                        Lock subito
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            setErr("");
                            setOk("");
                            const r = await api.adminSaveSettings(
                              {
                                lockUntil: settings.lockUntil,
                                isForceLocked: false,
                                tieBreak1: settings.tieBreak1,
                                tieBreak2: settings.tieBreak2,
                                tieBreak3: settings.tieBreak3,
                              },
                              league.id
                            );
                            setSettings(r.settings);
                            setOk("Lock rimosso.");
                          } catch (e: any) {
                            setErr(e?.message || "Errore");
                          }
                        }}
                      >
                        Rimuovi lock
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Nessuna impostazione trovata.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}


function ResultsSyncPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [matches, setMatches] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await api.matches();
      setMatches(r.matches || []);
    } catch (e: any) {
      setErr(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;

  return (
    <div>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              setErr(""); setOk("");
              await api.adminSync();
              setOk("Sync avviata.");
              load();
            } catch (e: any) {
              setErr(e?.message || "Errore");
            }
          }}
        >
          Forza Sync API
        </Button>
      </div>

      <div className="space-y-3">
        {matches.map((m) => (
          <SuperMatchRow key={m.id} match={m} onSaved={() => { setOk("Risultato salvato."); load(); }} />
        ))}
      </div>
    </div>
  );
}

function SuperMatchRow({ match, onSaved }: { match: any; onSaved: () => void }) {
  const [home, setHome] = useState(match.homeScore ?? "");
  const [away, setAway] = useState(match.awayScore ?? "");
  const [status, setStatus] = useState(match.status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">{match.homeTeam} - {match.awayTeam}</div>
          <div className="text-xs text-slate-600">{new Date(match.kickoffAt).toLocaleString()}</div>
          <div className="mt-1 flex gap-2">
            <Badge>{status}</Badge>
            <Badge>{match.source}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <div className="text-xs text-slate-600">Stato</div>
            <select className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="NOT_STARTED">NON_INIZIATA</option>
              <option value="IN_PROGRESS">IN_CORSO</option>
              <option value="FINISHED">FINITA</option>
            </select>
          </label>

          <Input style={{ width: 96 }} label="Casa" type="number" value={String(home)} onChange={(e) => setHome(e.target.value)} />
          <Input style={{ width: 96 }} label="Ospite" type="number" value={String(away)} onChange={(e) => setAway(e.target.value)} />

          <Button
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true); setErr("");
                await api.adminSetMatchResult(match.id, {
                  status,
                  homeScore: home === "" ? null : Number(home),
                  awayScore: away === "" ? null : Number(away),
                });
                onSaved();
              } catch (e: any) {
                setErr(e?.message || "Errore");
              } finally {
                setSaving(false);
              }
            }}
          >
            Salva
          </Button>
        </div>
      </div>
      {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}
    </div>
  );
}
