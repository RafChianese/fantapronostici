import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPasswordPage() {
  const q = useQuery();
  const nav = useNavigate();
  const [email, setEmail] = useState(q.get("email") || "");
  const [token, setToken] = useState(q.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Reimposta password" subtitle="Inserisci la nuova password." />
        <CardContent className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {ok ? <Alert tone="success">Password aggiornata. Ora puoi accedere.</Alert> : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Email</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Token</div>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="token ricevuto via email" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Nuova password</div>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Ripeti nuova password</div>
            <Input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={loading}
              onClick={async () => {
                setError(null);
                setOk(false);
                const e = email.trim();
                const t = token.trim();
                if (!e || !t) {
                  setError("Email e token sono obbligatori");
                  return;
                }
                if (newPassword.length < 8) {
                  setError("La password deve avere almeno 8 caratteri");
                  return;
                }
                if (newPassword !== newPassword2) {
                  setError("Le password non coincidono");
                  return;
                }
                setLoading(true);
                try {
                  await api.resetPassword(e, t, newPassword);
                  setOk(true);
                  setTimeout(() => nav("/login"), 800);
                } catch (err: any) {
                  setError(err.message || "Errore");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Salva nuova password
            </Button>
            <Link className="text-sm text-slate-600 hover:underline" to="/login">
              Torna al login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}