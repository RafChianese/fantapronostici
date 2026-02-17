import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function VerifyEmailPage() {
  const q = useQuery();
  const nav = useNavigate();
  const toast = useToast();
  const { verifyEmail, resendVerification } = useAuth();

  const [email, setEmail] = useState(q.get("email") || "");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Verifica email" subtitle="Inserisci il codice inviato via email (valido 10 minuti)." />
        <CardContent className="space-y-4">
          {err ? <Alert tone="danger">{err}</Alert> : null}
          {resent ? <Alert tone="success">Codice inviato. Controlla la posta in arrivo (e lo spam).</Alert> : null}

          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.com" />
          <Input
            label="Codice (6 cifre)"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
            }}
            placeholder="123456"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setErr(null);
                setResent(false);
                const em = email.trim();
                if (!em) {
                  setErr("Inserisci una email valida");
                  return;
                }
                if (code.length !== 6) {
                  setErr("Inserisci un codice a 6 cifre");
                  return;
                }
                setBusy(true);
                try {
                  await verifyEmail(em, code);
                  toast.push({ tone: "success", msg: "Email verificata!" });
                  nav("/onboarding");
                } catch (e: any) {
                  setErr(e?.message || "Codice non valido o scaduto");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verifica
            </Button>

            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setErr(null);
                setResent(false);
                const em = email.trim();
                if (!em) {
                  setErr("Inserisci una email valida");
                  return;
                }
                setBusy(true);
                try {
                  await resendVerification(em);
                  setResent(true);
                  toast.push({ tone: "info", msg: "Nuovo codice inviato" });
                } catch {
                  // For privacy the BE always returns ok, but keep a safe UX.
                  setResent(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reinvia codice
            </Button>
          </div>

          <div className="text-sm text-slate-600">
            Hai già verificato? <Link className="text-slate-900 underline" to="/login">Accedi</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
