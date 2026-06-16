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
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [busy, setBusy] = useState(false);

  const pwdOk = password.trim().length >= 8;
  const pwdMatch = password2 === password;

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
              {nameErr ? <div className="text-xs text-rose-200">{nameErr}</div> : null}
            </div>
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.com" />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 caratteri" />
            <Input label="Conferma password" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="Ripeti la password" />

            <div className="text-xs text-orange-50/60">
              La password deve avere almeno <span className={pwdOk ? "font-semibold text-emerald-200" : "font-semibold text-slate-700"}>8 caratteri</span>.
              {password2 ? (
                <span className={pwdMatch ? "ml-2 text-emerald-200" : "ml-2 text-rose-200"}>
                  {pwdMatch ? "✓ Le password coincidono" : "Le password non coincidono"}
                </span>
              ) : null}
            </div>

            <Button
              className="w-full"
              disabled={busy}
              onClick={async () => {
                try {
                  setErr("");
                  setNameErr("");
                  if (!pwdOk) throw new Error("La password deve avere almeno 8 caratteri");
                  if (!pwdMatch) throw new Error("Le password non coincidono");
                  if (!isValidEmail(email)) { throw new Error("Inserisci una email valida"); }
                  setBusy(true);
                  const out = await register(email.trim().toLowerCase(), displayName.trim(), password);
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
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Creazione account…" : "Registrati"}
            </Button>

            <div className="text-center text-sm text-orange-50/60">
              Hai già un account? <Link className="text-rose-300 underline" to="/login">Accedi</Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}