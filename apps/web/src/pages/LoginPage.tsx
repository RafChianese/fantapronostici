import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";


function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
export default function LoginPage() {
  const { login } = useAuth();
  const { show, hide } = useLoading();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Accesso partecipante" subtitle="Inserisci le tue credenziali per pronosticare." />
        <CardContent className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="space-y-2">
            <div className="text-sm font-medium">Email</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Password</div>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={async () => {
                setLoading(true);
                setError(null);
                show();
                try {
                  if (!isValidEmail(email)) { throw new Error("Inserisci una email valida"); }
                  await login(email.trim(), password);
                  nav("/");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setLoading(false);
                  hide();
                }
              }}
              disabled={loading}
            >
              Entra
            </Button>
            <div className="text-xs text-slate-500">Se è la prima volta, registrati oppure accedi con le credenziali fornite dall'admin della lega.</div>
          </div>
          <div className="text-sm text-slate-600">
            Se non hai ancora le credenziali, <Link className="font-medium text-[#2EC4B6] hover:underline" to="/register">Registrati</Link>.
          </div>

          <div className="pt-2">
            <div className="text-xs font-semibold text-slate-500">Oppure</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                tone="secondary"
                onClick={() => {
                  const returnTo = window.location.origin;
                  window.location.href = `${API_URL}/api/auth/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
                }}
              >
                Continua con Google
              </Button>
              <Button
                tone="secondary"
                onClick={() => {
                  const returnTo = window.location.origin;
                  window.location.href = `${API_URL}/api/auth/oauth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`;
                }}
              >
                Continua con Microsoft
              </Button>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Con OAuth non serve email di verifica né recupero password.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}