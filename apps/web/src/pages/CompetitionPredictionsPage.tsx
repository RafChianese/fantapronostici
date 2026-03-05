import React, { useEffect, useMemo, useState } from "react";
import { api, CompetitionPredictionsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, CardContent, CardHeader, Spinner } from "../components/ui";

export default function CompetitionPredictionsPage() {
  const { activeLeagueId } = useAuth();
  const [data, setData] = useState<CompetitionPredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [winnerId, setWinnerId] = useState<string>("");
  const [scorerId, setScorerId] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.competitionPredictions();
      setData(res);
      setWinnerId(res.picks.winner?.teamExternalId ? String(res.picks.winner.teamExternalId) : "");
      setScorerId(res.picks.topScorer?.playerExternalId ? String(res.picks.topScorer.playerExternalId) : "");
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeLeagueId) {
      setData(null);
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId]);

  const enabledAny = !!data?.enabled?.winner || !!data?.enabled?.topScorer;

  const deadlineLabel = useMemo(() => {
    if (!data?.deadline) return "";
    try {
      return new Date(data.deadline).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return data.deadline;
    }
  }, [data?.deadline]);

  const canEdit = !!data?.canEdit;

  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const winner = data.options.teams.find((t) => String(t.id) === winnerId);
      const scorer = data.options.scorers.find((s) => String(s.id) === scorerId);

      const res = await api.saveCompetitionPredictions({
        winnerTeamId: winnerId ? Number(winnerId) : null,
        winnerTeamName: winner?.name ?? null,
        topScorerPlayerId: scorerId ? Number(scorerId) : null,
        topScorerPlayerName: scorer?.name ?? null,
      });
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Pronostici competizione" subtitle="Vincitore e capocannoniere" right={<Button variant="secondary" onClick={load}>Aggiorna</Button>} />
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Spinner />
              Caricamento…
            </div>
          ) : null}

          {!loading && error ? <Alert tone="danger">{error}</Alert> : null}

          {!loading && data && !enabledAny ? (
            <Alert>In questa lega i pronostici competizione non sono attivi.</Alert>
          ) : null}

          {!loading && data && enabledAny ? (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300 space-y-1">
                <div>
                  <b>Deadline:</b> {deadlineLabel || "(automatica)"}
                </div>
                <div>
                  <b>Modificabile:</b> {canEdit ? "Sì" : "No"}
                </div>
              </div>

              {data.enabled.winner ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">Vincitore competizione (+{data.points.winner} punti)</div>
                  <select
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    disabled={!canEdit || saving}
                    value={winnerId}
                    onChange={(e) => setWinnerId(e.target.value)}
                  >
                    <option value="">Seleziona squadra…</option>
                    {data.options.teams.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {data.picks.winner?.pointsAwarded ? (
                    <div className="text-xs text-slate-600">Punti assegnati: {data.picks.winner.pointsAwarded}</div>
                  ) : null}
                </div>
              ) : null}

              {data.enabled.topScorer ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">Capocannoniere (+{data.points.topScorer} punti)</div>
                  <select
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    disabled={!canEdit || saving}
                    value={scorerId}
                    onChange={(e) => setScorerId(e.target.value)}
                  >
                    <option value="">Seleziona giocatore…</option>
                    {data.options.scorers.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}{s.teamName ? ` (${s.teamName})` : ""}
                      </option>
                    ))}
                  </select>
                  {data.picks.topScorer?.pointsAwarded ? (
                    <div className="text-xs text-slate-600">Punti assegnati: {data.picks.topScorer.pointsAwarded}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button onClick={save} disabled={!canEdit || saving}>
                  {saving ? "Salvo…" : "Salva"}
                </Button>
                {!canEdit ? <span className="text-xs text-slate-500 self-center">Scelte bloccate dopo la deadline.</span> : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
