import React from "react";
import { Button } from "./ui";

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Errore imprevisto",
    };
  }

  componentDidCatch(error: unknown) {
    // Keep the app usable on mobile instead of leaving a blank background.
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary]", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="relative z-[1] mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4 py-10 text-white">
        <div className="w-full rounded-3xl border border-cyan-100/20 bg-slate-950/90 p-5 text-center shadow-2xl">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">Oops</div>
          <h1 className="mt-2 text-2xl font-black">Qualcosa non ha caricato correttamente</h1>
          <p className="mt-2 text-sm text-cyan-50/70">
            Ho intercettato l’errore per evitare la schermata vuota. Ricarica la pagina o torna alla home.
          </p>
          {this.state.message ? (
            <p className="mt-3 rounded-2xl bg-black/30 p-3 text-xs text-cyan-50/60">{this.state.message}</p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => window.location.assign("/")}>Torna alla home</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>Ricarica</Button>
          </div>
        </div>
      </div>
    );
  }
}
