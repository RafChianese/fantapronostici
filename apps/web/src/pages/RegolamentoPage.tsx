import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, RegolamentoConfigResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { generateRegolamentoTemplate } from "../lib/regolamento";
import { Alert, Button, Card, CardContent, CardHeader, Spinner } from "../components/ui";

export default function RegolamentoPage() {
  const nav = useNavigate();
  const { activeLeagueId } = useAuth();

  const [data, setData] = useState<RegolamentoConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await api.regolamentoConfig();
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Errore nel caricamento del regolamento");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // If no league is currently selected, show empty state.
    if (!activeLeagueId) {
      setData(null);
      setLoading(false);
      return;
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId]);

  const doc = useMemo(() => {
    if (!data) return null;
    return generateRegolamentoTemplate(data.rules, data.settings);
  }, [data]);

  if (!activeLeagueId) {
    return (
      <Card>
        <CardHeader title="Regolamento" subtitle="Seleziona una lega per visualizzare il regolamento." />
        <CardContent className="space-y-4">
          <Alert>Non hai ancora selezionato una lega attiva.</Alert>
          <Button onClick={() => nav("/onboarding")}>Vai alle leghe</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Regolamento"
          subtitle={data?.league ? `Lega: ${data.league.name} (${data.league.code})` : ""}
          right={
            <Button variant="secondary" onClick={() => api.regolamentoConfig().then(setData).catch((e: any) => setError(e?.message || "Errore"))}>
              Aggiorna
            </Button>
          }
        />
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Spinner />
              Caricamento regolamento…
            </div>
          ) : null}

          {!loading && error ? <Alert tone="danger">{error}</Alert> : null}

          {!loading && !error && doc ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-xl font-semibold text-slate-900">{doc.title}</div>
                {doc.intro.map((p, idx) => (
                  <p key={idx} className="text-sm text-slate-700">
                    {p}
                  </p>
                ))}
              </div>

              {doc.sections.map((s) => (
                <section key={s.title} className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                  {s.paragraphs?.map((p, idx) => (
                    <p key={idx} className="text-sm text-slate-700">
                      {p}
                    </p>
                  ))}
                  {s.bullets?.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {s.bullets.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}

          {!loading && !error && !doc ? <Alert>Nessun dato disponibile.</Alert> : null}
        </CardContent>
      </Card>
    </div>
  );
}
