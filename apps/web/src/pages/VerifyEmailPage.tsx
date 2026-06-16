import React from "react";
import { Link } from "react-router-dom";
import { Alert, Card, CardContent, CardHeader } from "../components/ui";

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Verifica email" subtitle="Funzione temporaneamente disattivata." />
        <CardContent className="space-y-4">
          <Alert tone="info">
            Per evitare problemi di invio email (es. Outlook), la verifica email e il recupero password sono stati messi in pausa.
            <div className="mt-2 text-sm">
              Usa l’accesso con <span className="font-semibold">Google</span> o <span className="font-semibold">Microsoft</span> dalla pagina login.
            </div>
          </Alert>

          <div className="text-center text-sm text-orange-50/60">
            Torna al <Link className="text-rose-300 underline" to="/login">login</Link>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
