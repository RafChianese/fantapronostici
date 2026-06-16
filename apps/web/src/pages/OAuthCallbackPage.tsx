import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AuthBootstrapOverlay } from "../components/AuthBootstrapOverlay";

export default function OAuthCallbackPage() {
  const nav = useNavigate();
  const { refreshMe, authStatus, bootstrapError, retryBootstrap, logout } = useAuth();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    // We receive the token in the URL fragment to avoid server logs.
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("token");

    if (token) {
      setToken(token);
      // Bootstraps /api/me with a robust loader; avoids redirect loops on slow networks.
      setHandled(true);
      refreshMe();
      return;
    }

    nav("/login");
  }, [nav, refreshMe]);

  useEffect(() => {
    if (!handled) return;
    if (authStatus === "authed") {
      nav("/", { replace: true });
    }
    if (authStatus === "unauthed") {
      nav("/login", { replace: true });
    }
  }, [handled, authStatus, nav]);

  if (!handled) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-amber-100/15 bg-[#07150f]/90 p-6 shadow-sm">
          <div className="text-lg font-semibold">Accesso in corso…</div>
          <div className="mt-2 text-sm text-orange-50/60">
            Stiamo completando l’accesso. Se non vieni reindirizzato, torna al login.
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === "loading") {
    return (
      <AuthBootstrapOverlay
        label="Accesso in corso…"
        error={bootstrapError}
        onRetry={retryBootstrap}
        onBackToLogin={() => {
          logout();
          nav("/login", { replace: true });
        }}
      />
    );
  }

  return null;
}
