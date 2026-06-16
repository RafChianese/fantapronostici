import React from "react";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
  }
) {
  const { className = "", variant = "primary", ...rest } = props;
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]";
  const v =
    variant === "primary"
      ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.24)] hover:shadow-[0_14px_38px_rgba(56,189,248,0.34)] hover:brightness-110"
      : variant === "danger"
      ? "bg-rose-500 text-white shadow-[0_10px_30px_rgba(244,63,94,0.20)] hover:brightness-110"
      : variant === "ghost"
      ? "bg-transparent text-cyan-50/85 hover:bg-cyan-100/10"
      : "tm-glass text-white border border-cyan-100/15 shadow-sm hover:shadow-md hover:bg-cyan-100/10";
  return <button className={`${base} ${v} ${className}`} {...rest} />;
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  const { className = "", label, id, ...rest } = props as any;
  const inputEl = (
    <input
      id={id}
      className={`tm-field ${className}`}
      {...rest}
    />
  );

  if (!label) return inputEl;

  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-cyan-50/85">{label}</span>
      {inputEl}
    </label>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // IMPORTANT:
  // Avoid transforms on hover because on mobile browsers a "stuck" hover state can
  // create a transformed ancestor. This breaks `position: fixed` sheets/modals,
  // making them appear anchored in the middle of the page.
  return (
    <div
      className={`tm-glass shadow-[0_14px_40px_rgba(0,0,0,0.24)] transition-shadow duration-200 hover:shadow-[0_18px_48px_rgba(0,0,0,0.32)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader(
  props:
    | {
        title: string;
        subtitle?: string;
        right?: React.ReactNode;
        className?: string;
        children?: never;
      }
    | {
        title?: never;
        subtitle?: never;
        right?: never;
        className?: string;
        children: React.ReactNode;
      }
) {
  // Backward/forward compatible:
  // - Preferred: <CardHeader title="..." subtitle="..." right={...} />
  // - Legacy pages: <CardHeader className="...">...</CardHeader>
  const anyProps: any = props as any;
  return (
    <div className={`tm-glass-header flex items-start justify-between gap-4 p-4 sm:p-5 ${anyProps.className || ""}`}
    >
      {anyProps.children ? (
        anyProps.children
      ) : (
        <>
          <div>
            <div className="text-lg font-semibold text-white">{anyProps.title}</div>
            {anyProps.subtitle ? <div className="mt-1 text-sm text-cyan-50/70">{anyProps.subtitle}</div> : null}
          </div>
          {anyProps.right}
        </>
      )}
    </div>
  );
}

export function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "slate" | "green" | "amber" | "blue" | "rose";
}) {
  const t =
    tone === "green"
      ? "bg-emerald-950/40 text-emerald-200 border-emerald-900/60"
      : tone === "amber"
      ? "bg-amber-950/40 text-amber-200 border-amber-900/60"
      : tone === "blue"
      ? "bg-sky-950/40 text-sky-200 border-sky-900/60"
      : tone === "rose"
      ? "bg-rose-950/40 text-rose-200 border-rose-900/60"
      : tone === "slate"
      ? "bg-cyan-950/45 text-cyan-50/85 border-cyan-100/15"
      : "bg-cyan-950/45 text-cyan-50/85 border-cyan-100/15";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${t}`}>{children}</span>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/20 border-t-cyan-300" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-cyan-950/35 ${className}`} aria-hidden="true" />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "danger" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "bg-rose-950/35 border-rose-900/60 text-rose-200"
      : tone === "success"
      ? "bg-emerald-950/35 border-emerald-900/60 text-emerald-200"
      : "bg-sky-950/35 border-sky-900/60 text-sky-200";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
