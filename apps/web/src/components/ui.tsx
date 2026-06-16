import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  const { className = "", variant = "primary", ...rest } = props;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold tracking-[-0.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300/35";
  const v =
    variant === "primary"
      ? "bg-gradient-to-r from-lime-300 via-emerald-400 to-emerald-500 text-[#06130f] shadow-[0_14px_34px_rgba(34,197,94,0.20)] hover:brightness-105"
      : variant === "danger"
      ? "bg-red-500 text-white shadow-[0_14px_34px_rgba(239,68,68,0.18)] hover:bg-red-400"
      : variant === "ghost"
      ? "bg-transparent text-orange-50/82 hover:bg-white/[0.07] hover:text-orange-50"
      : "border border-amber-100/16 bg-white/[0.055] text-orange-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_26px_rgba(0,0,0,0.18)] hover:border-amber-200/25 hover:bg-white/[0.085]";
  return <button className={`${base} ${v} ${className}`} {...rest} />;
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  const { className = "", label, id, ...rest } = props as any;
  const inputEl = <input id={id} className={`fp-field ${className}`} {...rest} />;

  if (!label) return inputEl;

  return (
    <label className="block space-y-1.5 text-sm">
      <span className="fp-label">{label}</span>
      {inputEl}
    </label>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div
      className={`fp-card transition-shadow duration-200 hover:shadow-[0_22px_58px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)] ${className}`}
      {...rest}
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
  const anyProps: any = props as any;
  return (
    <div className={`fp-card-header flex items-start justify-between gap-4 p-4 sm:p-5 ${anyProps.className || ""}`}>
      {anyProps.children ? (
        anyProps.children
      ) : (
        <>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-lime-200/70">FantaPronostici</div>
            <div className="mt-1 text-xl font-black leading-tight tracking-[-0.03em] text-orange-50">{anyProps.title}</div>
            {anyProps.subtitle ? <div className="mt-1 text-sm font-medium text-orange-50/60">{anyProps.subtitle}</div> : null}
          </div>
          {anyProps.right ? <div className="shrink-0">{anyProps.right}</div> : null}
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
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : tone === "amber"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
      : tone === "blue"
      ? "border-blue-300/25 bg-blue-400/10 text-blue-100"
      : tone === "rose"
      ? "border-red-300/25 bg-red-400/10 text-red-100"
      : tone === "slate"
      ? "border-orange-100/16 bg-white/[0.055] text-orange-50/85"
      : "border-orange-100/16 bg-white/[0.055] text-orange-50/85";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${t}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-lime-200/20 border-t-lime-300" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-white/[0.075] ${className}`} aria-hidden="true" />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "danger" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-red-300/25 bg-red-500/10 text-red-100"
      : tone === "success"
      ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}
