import React from "react";
import { Button, Card, CardContent, CardHeader } from "../components/ui";
export default function LoginPage() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title="Accedi" subtitle="Scegli come vuoi continuare." />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          <div className="text-xs text-slate-500">
            Accesso solo con OAuth (Google/Microsoft).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}