import React from "react";
import { Spinner } from "./ui";

export type AuthBootstrapError =
  | { kind: "timeout"; message: string }
  | { kind: "network"; message: string };

export function AuthBootstrapOverlay({
  label = "Accesso in corso…",
  error,
  onRetry,
  onBackToLogin,
}: {
  label?: string;
  error?: AuthBootstrapError | null;
  onRetry?: () => void;
  onBackToLogin?: () => void;
}) {
  const isError = !!error;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="w-[min(92vw,460px)] rounded-2xl bg-slate-950/70 p-6 shadow-xl border border-white/10">
        <div className="flex items-center gap-3">
          {!isError ? <Spinner /> : null}
          <div className="text-base font-semibold text-slate-100">{label}</div>
        </div>

        {!isError ? (
          <div className="mt-2 text-sm text-slate-400">
            Stiamo verificando la sessione. Se la tua connessione è lenta potrebbe richiedere qualche secondo.
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/40 p-3 text-sm text-amber-200">
            {error?.message || "Non riusciamo a completare l’accesso."}
          </div>
        )}

        {isError ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={onRetry}
              type="button"
            >
              Riprova
            </button>
            <button
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900"
              onClick={onBackToLogin}
              type="button"
            >
              Torna al login
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
