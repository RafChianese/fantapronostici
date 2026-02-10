import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, Button, Spinner } from "../components/ui";

type RegulationResponse = {
  league: { id: string; name: string; code: string };
  regulation: { markdown: string };
};

export default function RulesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RegulationResponse | null>(null);

  async function fetchRules() {
    setLoading(true);
    setError(null);
    try {
      const res = (await api.rules()) as RegulationResponse;
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Errore nel caricamento del regolamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRules();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Regolamento</h1>
        <Button variant="secondary" onClick={fetchRules}>
          Aggiorna
        </Button>
      </div>

      <div className="mt-4">
        <Card>
          {loading ? (
            <div className="flex items-center gap-3 p-4">
              <Spinner />
              <div className="text-sm text-slate-700">Caricamento regolamento…</div>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="text-sm font-semibold text-red-600">{error}</div>
              <div className="mt-3">
                <Button onClick={fetchRules}>Riprova</Button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {data?.league?.name ? (
                <div className="mb-3 text-xs text-slate-500">Lega: {data.league.name}</div>
              ) : null}
              <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                {data?.regulation?.markdown || "Regolamento non disponibile"}
              </pre>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Il regolamento è generato automaticamente in base alle regole configurate dall’amministratore della lega.
      </div>
    </div>
  );
}
