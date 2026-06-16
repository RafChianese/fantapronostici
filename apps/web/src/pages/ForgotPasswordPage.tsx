import React from "react";
import { Link } from "react-router-dom";
import { Alert, Card, CardContent, CardHeader } from "../components/ui";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Recupero password" subtitle="Funzione temporaneamente disattivata." />
        <CardContent className="space-y-4">
          <Alert tone="info">
            Il recupero password via email è stato messo in pausa per evitare problemi di consegna (es. Outlook).
            <div className="mt-2 text-sm">
              Consiglio: usa l’accesso con <span className="font-semibold">Google</span> o <span className="font-semibold">Microsoft</span>.
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
