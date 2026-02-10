import React, { useEffect, useState } from "react";
import { api, RegolamentoPayload } from "../lib/api";
import { Alert, Card, CardContent, CardHeader, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";

export default function RegolamentoPage() {
  const { activeLeagueId } = useAuth();
  const [data, setData] = useState<{ leagueName: string; regolamento: RegolamentoPayload } | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await api.regolamento();
        if (!mounted) return;
        setData({ leagueName: res.league.name, regolamento: res.regolamento });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Errore nel caricamento del regolamento");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [activeLeagueId]);

  if (!activeLeagueId) {
    return (
      <Card>
        <CardHeader title="Regolamento" subtitle="Seleziona una lega per visualizzare il regolamento." />
        <CardContent>
          <Alert tone="info">
            Nessuna lega attiva. Vai in <Link className="font-semibold text-[#2EC4B6] hover:underline" to="/onboarding">Leghe</Link> e selezionane una.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader title="Regolamento" subtitle="Caricamento…" />
        <CardContent className="flex items-center gap-3">
          <Spinner />
          <div className="text-sm text-slate-700">Sto generando il regolamento in base alle regole della lega…</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="Regolamento" subtitle="Impossibile caricare il regolamento" />
        <CardContent>
          <Alert tone="danger">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { regolamento } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Regolamento"
          subtitle={`Generato automaticamente per: ${data.leagueName}`}
        />
        <CardContent>
          <div className="text-sm text-slate-600">
            Ultimo aggiornamento: {new Date(regolamento.generatedAtISO).toLocaleString("it-IT")}
          </div>
        </CardContent>
      </Card>

      {regolamento.sections.map((s, idx) => (
        <Card key={`${idx}-${s.title}`}>
          <CardHeader title={s.title} />
          <CardContent>
            {s.paragraphs?.length ? (
              <div className="space-y-2">
                {s.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
            {s.bullets?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
