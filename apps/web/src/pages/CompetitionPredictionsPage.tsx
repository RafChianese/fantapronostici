import React, { useEffect, useMemo, useState } from "react";
import { Trophy, Target, Save, Lock } from "lucide-react";
import { api } from "../lib/api";
import { useLoading } from "../lib/loading";
import { Alert, Badge, Button, Card, CardContent, CardHeader, Skeleton } from "../components/ui";

type TeamOpt = { id: number; name: string; crest?: string | null };
type PlayerOpt = { id: number; name: string; teamName?: string | null; goals?: number };

type Resp = {
  enabled: { winner: boolean; topScorer: boolean };
  points: { winner: number; topScorer: number };
  deadline: string | null;
  canEdit: boolean;
  picks: {
    winner: { teamExternalId: number | null; teamName: string | null; pointsAwarded: number } | null;
    topScorer: { playerExternalId: number | null; playerName: string | null; pointsAwarded: number } | null;
  };
  options: {
    teams: TeamOpt[];
    scorers: PlayerOpt[];
  };
};

function formatIt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function CompetitionPredictionsPage() {
  const { show, hide } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);

  const [data, setData] = useState<Resp | null>(null);

  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [topId, setTopId] = useState<number | null>(null);

  const enabledAny = !!data?.enabled.winner || !!data?.enabled.topScorer;

  const deadlineLabel = useMemo(() => {
    if (!data?.deadline) return "—";
    return formatIt(data.deadline);
  }, [data?.deadline]);

  const winnerOptions = useMemo(() => (data?.options.teams || []).slice().sort((a, b) => a.name.localeCompare(b.name, "it")), [data]);
  const scorerOptions = useMemo(() => {
    const list = (data?.options.scorers || []).slice();
    // show top scorers first
    list.sort((a, b) => (Number(b.goals || 0) - Number(a.goals || 0)) || a.name.localeCompare(b.name, "it"));
    return list;
  }, [data]);

  const selectedWinnerName = useMemo(() => {
    if (!winnerId) return null;
    return winnerOptions.find((t) => t.id === winnerId)?.name || null;
  }, [winnerId, winnerOptions]);

  const selectedTopName = useMemo(() => {
    if (!topId) return null;
    return scorerOptions.find((p) => p.id === topId)?.name || null;
  }, [topId, scorerOptions]);

  const load = async () => {
    try {
      show();
      setLoading(true);
      const res = (await api.competitionPredictions()) as Resp;
      setData(res);
      setWinnerId(res.picks.winner?.teamExternalId ?? null);
      setTopId(res.picks.topScorer?.playerExternalId ?? null);
    } catch (e: any) {
      setToast({ tone: "danger", msg: e?.message || "Errore" });
    } finally {
      setLoading(false);
      hide();
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await api.setCompetitionPredictions({
        ...(data.enabled.winner
          ? {
              winnerTeamId: winnerId,
              winnerTeamName: winnerId ? selectedWinnerName : null,
            }
          : {}),
        ...(data.enabled.topScorer
          ? {
              topScorerPlayerId: topId,
              topScorerPlayerName: topId ? selectedTopName : null,
            }
          : {}),
      });
      setToast({ tone: "success", msg: "Pronostici competizione salvati" });
      await load();
    } catch (e: any) {
      setToast({ tone: "danger", msg: e?.message || "Errore nel salvataggio" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Pronostici competizione</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pronostici validi per l’intera competizione (vincitore + capocannoniere), se abilitati dall’admin.
          </p>
        </div>
        {data?.deadline ? (
          <Badge tone={data.canEdit ? "blue" : "gray"}>
            {data.canEdit ? "Modificabile" : "Bloccato"}
          </Badge>
        ) : null}
      </div>

      {toast ? (
        <Alert tone={toast.tone}>
          {toast.msg}
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !data ? (
        <Alert tone="danger">Impossibile caricare i pronostici competizione.</Alert>
      ) : !enabledAny ? (
        <Alert tone="info">Questa lega non ha attivi i pronostici competizione.</Alert>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Deadline"
              subtitle={
                data.deadline
                  ? `Puoi modificare fino a: ${deadlineLabel}`
                  : "Deadline non impostata: per default coincide con la prima partita disponibile"
              }
            />
            <CardContent>
              {!data.canEdit ? (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Lock className="h-4 w-4" />
                  <span>Deadline scaduta: non puoi più modificare questi pronostici.</span>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Ricorda: la deadline è decisa dall’admin di lega.</div>
              )}
            </CardContent>
          </Card>

          {data.enabled.winner ? (
            <Card>
              <CardHeader
                title="Vincitore competizione"
                subtitle={`Se indovini la squadra campione: +${data.points.winner} punti`}
                icon={<Trophy className="h-5 w-5" />}
              />
              <CardContent>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Seleziona squadra</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    disabled={!data.canEdit || saving}
                    value={winnerId === null ? "" : String(winnerId)}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : NaN;
                      setWinnerId(Number.isFinite(v) ? v : null);
                    }}
                  >
                    <option value="">—</option>
                    {winnerOptions.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {data.picks.winner?.pointsAwarded ? (
                  <div className="mt-2 text-xs text-slate-700">
                    Punti assegnati: <span className="font-semibold">+{data.picks.winner.pointsAwarded}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {data.enabled.topScorer ? (
            <Card>
              <CardHeader
                title="Capocannoniere"
                subtitle={`Se indovini il miglior marcatore: +${data.points.topScorer} punti`}
                icon={<Target className="h-5 w-5" />}
              />
              <CardContent>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Seleziona giocatore</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    disabled={!data.canEdit || saving}
                    value={topId === null ? "" : String(topId)}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : NaN;
                      setTopId(Number.isFinite(v) ? v : null);
                    }}
                  >
                    <option value="">—</option>
                    {scorerOptions.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}{p.teamName ? ` · ${p.teamName}` : ""}{typeof p.goals === "number" ? ` (${p.goals})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {data.picks.topScorer?.pointsAwarded ? (
                  <div className="mt-2 text-xs text-slate-700">
                    Punti assegnati: <span className="font-semibold">+{data.picks.topScorer.pointsAwarded}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={!data.canEdit || saving}
              onClick={save}
              className="rounded-2xl"
            >
              <Save className="mr-2 h-4 w-4" />
              Salva
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
