import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, CardContent, CardHeader, Input } from "../components/ui";

export default function AdminLoginPage() {
  const { adminLogin } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Accesso admin" subtitle="Dashboard per utenti, regole e risultati." />
        <CardContent className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="space-y-2">
            <div className="text-sm font-medium">Email</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
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
                try {
                  await adminLogin(email, password);
                  nav("/admin");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              Entra come admin
            </Button>
            <div className="text-xs text-slate-500">Demo: admin@example.com / Admin123!</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
