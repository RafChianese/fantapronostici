import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Recupero password" subtitle="Inserisci la tua email per ricevere il link di reset." />
        <CardContent className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {sent ? (
            <Alert tone="success">
              Se l'email è registrata, riceverai a breve un link per reimpostare la password.
            </Alert>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Email</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={loading}
              onClick={async () => {
                setError(null);
                setSent(false);
                const v = email.trim();
                if (!isValidEmail(v)) {
                  setError("Inserisci una email valida");
                  return;
                }
                setLoading(true);
                try {
                  await api.forgotPassword(v);
                  setSent(true);
                } catch (e: any) {
                  setError(e.message || "Errore");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Invia email
            </Button>
            <Link className="text-sm text-slate-600 hover:underline" to="/login">
              Torna al login
            </Link>
          </div>

          <div className="text-xs text-slate-500">
            Nota: per l'invio email in produzione configura SendGrid (SENDGRID_API_KEY e EMAIL_FROM).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
