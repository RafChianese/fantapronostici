import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, Input } from "../components/ui";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCredentials, setShowCredentials] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const from = (location.state as any)?.from || "/";

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Credenziali non valide");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Accedi" subtitle="Scegli come vuoi continuare." />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={() => {
                const returnTo = window.location.origin;
                window.location.href = `${API_URL}/api/auth/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              Continua con Google
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const returnTo = window.location.origin;
                window.location.href = `${API_URL}/api/auth/oauth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              Continua con Microsoft
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-orange-50/60">
            <div className="h-px flex-1 bg-white/[0.075]" />
            <span>oppure</span>
            <div className="h-px flex-1 bg-white/[0.075]" />
          </div>

          {!showCredentials ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowCredentials(true)}
            >
              Accedi con credenziali
            </Button>
          ) : (
            <form className="space-y-3" onSubmit={submitCredentials}>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.it"
                required
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              {error ? <div className="rounded-xl border border-rose-900/60 bg-rose-950/35 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
              <Button type="submit" className="w-full" disabled={loading || !email.trim() || !password}>
                {loading ? "Accesso in corso…" : "Entra"}
              </Button>
              <div className="text-center text-xs text-orange-50/60">
                Non hai un account? <Link className="font-semibold text-rose-300 hover:text-rose-200" to="/register">Registrati</Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
