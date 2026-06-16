import React from "react";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
  }
) {
  const { className = "", variant = "primary", ...rest } = props;
  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-black tracking-tight transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-[1px]";
  const v =
    variant === "primary"
      ? "bg-gradient-to-r from-lime-300 via-emerald-400 to-green-500 text-slate-950 shadow-[0_14px_32px_rgba(34,197,94,0.24)] hover:shadow-[0_18px_42px_rgba(34,197,94,0.34)] hover:brightness-105"
      : variant === "danger"
      ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-[0_12px_30px_rgba(244,63,94,0.22)] hover:brightness-110"
      : variant === "ghost"
      ? "bg-transparent text-slate-100/86 hover:bg-white/[0.06] hover:text-white"
      : "border border-white/10 bg-white/[0.055] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-lime-300/30 hover:bg-white/[0.085]";
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
      <span className="font-medium text-slate-100/85">{label}</span>
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
      className={`tm-glass transition-shadow duration-200 hover:border-lime-300/22 hover:shadow-[0_22px_56px_rgba(0,0,0,0.36)] ${className}`}
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
    <div className={`tm-glass-header flex items-start justify-between gap-4 p-4 pl-5 sm:p-5 sm:pl-6 ${anyProps.className || ""}`}
    >
      {anyProps.children ? (
        anyProps.children
      ) : (
        <>
          <div>
            <div className="text-lg font-black tracking-tight text-white">{anyProps.title}</div>
            {anyProps.subtitle ? <div className="mt-1 text-sm text-slate-300/70">{anyProps.subtitle}</div> : null}
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
      ? "bg-emerald-500/12 text-emerald-200 border-emerald-300/20"
      : tone === "amber"
      ? "bg-amber-500/12 text-amber-200 border-amber-300/22"
      : tone === "blue"
      ? "bg-sky-500/12 text-sky-200 border-sky-300/20"
      : tone === "rose"
      ? "bg-rose-500/12 text-rose-200 border-rose-300/20"
      : tone === "slate"
      ? "bg-emerald-950/45 text-slate-100/85 border-emerald-100/15"
      : "bg-emerald-950/45 text-slate-100/85 border-emerald-100/15";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${t}`}>{children}</span>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-lime-300/25 border-t-emerald-300" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-700/25 ${className}`} aria-hidden="true" />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "danger" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "bg-rose-500/10 border-rose-300/20 text-rose-200"
      : tone === "success"
      ? "bg-slate-700/25 border-emerald-900/60 text-emerald-200"
      : "bg-sky-500/10 border-sky-300/20 text-sky-200";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
