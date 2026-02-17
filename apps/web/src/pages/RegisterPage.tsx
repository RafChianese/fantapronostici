import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";


function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
export default function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [nameErr, setNameErr] = useState("");

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Registrazione" subtitle="Crea un account per partecipare alle leghe" />
        <CardContent>
          {err ? <Alert tone="danger">{err}</Alert> : null}

          <div className="space-y-3">
            <div className="space-y-1">
              <Input
                label="Nome visualizzato"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setNameErr("");
                }}
                placeholder="Es. Mario Rossi"
              />
              {nameErr ? <div className="text-xs text-rose-700">{nameErr}</div> : null}
            </div>
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.com" />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 caratteri" />

            <Button
              className="w-full"
              onClick={async () => {
                try {
                  setErr("");
                  setNameErr("");
                  if (!isValidEmail(email)) { throw new Error("Inserisci una email valida"); }
                  const out = await register(email.trim(), displayName.trim(), password);
                  if (out?.requiresVerification) {
                    nav(`/verify-email?email=${encodeURIComponent(out.email)}`);
                  } else {
                    nav("/onboarding");
                  }
                } catch (e: any) {
                  const msg = e?.message || "Errore";
                  if (typeof msg === "string" && msg.toLowerCase().includes("nome")) {
                    setNameErr(msg);
                  } else {
                    setErr(msg);
                  }
                }
              }}
            >
              Registrati
            </Button>

            <div className="text-center text-sm text-slate-600">
              Hai già un account? <Link className="text-slate-900 underline" to="/login">Accedi</Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}