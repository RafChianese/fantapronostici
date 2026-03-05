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
      ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm hover:shadow-md hover:brightness-[1.02]"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-500"
      : variant === "ghost"
      ? "bg-transparent text-slate-200 hover:bg-slate-800/70"
      : "bg-slate-900 text-slate-100 border border-slate-800 shadow-sm hover:shadow-md hover:bg-slate-800/80";
  return <button className={`${base} ${v} ${className}`} {...rest} />;
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  const { className = "", label, id, ...rest } = props as any;
  const inputEl = (
    <input
      id={id}
      className={`w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-rose-500/35 ${className}`}
      {...rest}
    />
  );

  if (!label) return inputEl;

  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-200">{label}</span>
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
      className={`rounded-2xl border border-slate-800/70 bg-gradient-to-b from-slate-950 to-slate-900/70 shadow-sm transition-shadow duration-200 hover:shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 p-4 sm:p-5 bg-gradient-to-r from-slate-950 to-slate-900/70">
      <div>
        <div className="text-lg font-semibold text-slate-100">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-400">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "blue" | "rose" }) {
  const t =
    tone === "green"
      ? "bg-emerald-950/40 text-emerald-200 border-emerald-900/60"
      : tone === "amber"
      ? "bg-amber-950/40 text-amber-200 border-amber-900/60"
      : tone === "blue"
      ? "bg-sky-950/40 text-sky-200 border-sky-900/60"
      : tone === "rose"
      ? "bg-rose-950/40 text-rose-200 border-rose-900/60"
      : "bg-slate-900/70 text-slate-200 border-slate-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${t}`}>{children}</span>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-rose-500" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-800/60 ${className}`} aria-hidden="true" />;
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
