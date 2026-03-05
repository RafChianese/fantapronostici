import React from "react";
import { Link } from "react-router-dom";
import { Alert, Card, CardContent, CardHeader } from "../components/ui";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Reset password" subtitle="Funzione temporaneamente disattivata." />
        <CardContent className="space-y-4">
          <Alert tone="info">
            Il reset password via email è stato messo in pausa.
            <div className="mt-2 text-sm">
              Usa l’accesso con <span className="font-semibold">Google</span> o <span className="font-semibold">Microsoft</span>.
            </div>
          </Alert>
          <div className="text-center text-sm text-slate-600">
            Torna al <Link className="text-rose-300 underline" to="/login">login</Link>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
