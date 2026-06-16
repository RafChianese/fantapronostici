import React from "react";
import {
  Alert as MantineAlert,
  Badge as MantineBadge,
  Button as MantineButton,
  Loader,
  Paper,
  Skeleton as MantineSkeleton,
  TextInput,
} from "@mantine/core";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  const { className = "", variant = "primary", children, ...rest } = props;

  const mantineVariant =
    variant === "primary" ? "filled" : variant === "ghost" ? "subtle" : variant === "danger" ? "filled" : "light";

  const color = variant === "danger" ? "red" : variant === "ghost" ? "gray" : "trophyGold";

  return (
    <MantineButton
      {...(rest as any)}
      variant={mantineVariant}
      color={color}
      className={`fp-button fp-button-${variant} ${className}`}
    >
      {children}
    </MantineButton>
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
) {
  const { className = "", label, id, ...rest } = props as any;

  if (label) {
    return (
      <TextInput
        id={id}
        label={label}
        classNames={{ input: `fp-field ${className}`, label: "fp-label" }}
        {...rest}
      />
    );
  }

  return <input id={id} className={`fp-field ${className}`} {...rest} />;
}

export function Card({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <Paper
      component="div"
      className={`fp-card fp-mantine-card ${className}`}
      {...(rest as any)}
    >
      {children}
    </Paper>
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
            <div className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-amber-200/70">FantaPronostici</div>
            <div className="mt-1 text-xl font-black leading-tight tracking-[-0.03em] text-slate-50">{anyProps.title}</div>
            {anyProps.subtitle ? <div className="mt-1 text-sm font-medium text-slate-200/60">{anyProps.subtitle}</div> : null}
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
  const color = tone === "green" ? "teal" : tone === "amber" ? "trophyGold" : tone === "blue" ? "blue" : tone === "rose" ? "red" : "gray";
  return (
    <MantineBadge color={color} variant="light" className={`fp-badge fp-badge-${tone}`}>
      {children}
    </MantineBadge>
  );
}

export function Spinner() {
  return <Loader size="sm" color="trophyGold" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <MantineSkeleton className={`fp-skeleton ${className}`} aria-hidden="true" />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "danger" | "success"; children: React.ReactNode }) {
  const color = tone === "danger" ? "red" : tone === "success" ? "teal" : "trophyGold";
  return (
    <MantineAlert color={color} variant="light" className={`fp-alert fp-alert-${tone}`}>
      {children}
    </MantineAlert>
  );
}
