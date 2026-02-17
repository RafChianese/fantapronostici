import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, Skeleton, Badge } from "../components/ui";

type Info = { label: string; value: React.ReactNode; hint?: string };

function InfoRow({ label, value, hint }: Info) {
  
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <SectionTitle
        title="Statistiche di lega"
        subtitle="Indicatori calcolati sui pronostici e sui risultati disponibili (solo giornate concluse per le medie)."
      />

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-3xl">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        cards
      ) : (
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-sm font-extrabold text-slate-900">
              Statistiche non disponibili
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Verifica che la lega abbia pronostici e risultati registrati.
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">
              Riprova più tardi o cambia lega dal selettore.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LeagueStatsPage() { return null; }
