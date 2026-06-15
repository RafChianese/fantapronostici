import React from "react";
import { Spinner } from "./ui";

export function FullScreenLoaderOverlay({
  label = "Caricamento…",
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-5 py-4 shadow-xl border border-white/10">
        <Spinner />
        <span className="text-sm font-medium text-slate-100">{label}</span>
      </div>
    </div>
  );
}
