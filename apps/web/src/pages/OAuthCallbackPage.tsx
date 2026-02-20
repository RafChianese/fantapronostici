import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../lib/api";

export default function OAuthCallbackPage() {
  const nav = useNavigate();

  useEffect(() => {
    // We receive the token in the URL fragment to avoid server logs.
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("token");

    if (token) {
      setToken(token);
      // Full reload so AuthProvider picks up the token from storage.
      window.location.replace("/");
      return;
    }

    nav("/login");
  }, [nav]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">Accesso in corso…</div>
        <div className="mt-2 text-sm text-slate-600">Stiamo completando l’accesso. Se non vieni reindirizzato, torna al login.</div>
      </div>
    </div>
  );
}
