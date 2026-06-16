import React, { useEffect, useMemo, useState } from "react";

export type TourStep = {
  id: string;
  target?: string; // CSS selector (e.g. [data-tour="tab-leaderboard"])
  title: string;
  body: string;
};

function getTargetRect(selector?: string): DOMRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return rect;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function GuidedTour({
  open,
  steps,
  onClose,
  storageKey,
}: {
  open: boolean;
  steps: TourStep[];
  storageKey: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  // Recalc on resize/scroll for highlight positioning.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open]);

  const step = steps[idx];
  const rect = useMemo(() => getTargetRect(step?.target), [step?.target, tick]);

  // On step change, ensure the target is visible (particularly important on mobile).
  useEffect(() => {
    if (!open) return;
    if (!step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const outOfView = r.top < 80 || r.bottom > window.innerHeight - 120;
    if (outOfView) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // ignore
      }
    }
  }, [idx, open, step?.target]);

  const isLast = idx === steps.length - 1;

  if (!open || !steps.length) return null;

  const padding = 10;
  const highlight = rect
    ? {
        top: clamp(rect.top - padding, 8, window.innerHeight - 8),
        left: clamp(rect.left - padding, 8, window.innerWidth - 8),
        width: clamp(rect.width + padding * 2, 0, window.innerWidth - 16),
        height: clamp(rect.height + padding * 2, 0, window.innerHeight - 16),
      }
    : null;

  const cardStyle: React.CSSProperties = (() => {
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // On mobile, keep the card pinned (top or bottom) to avoid covering the target / bottom tabs.
      const targetNearBottom = !!rect && rect.top > window.innerHeight * 0.55;
      return targetNearBottom
        ? { top: 16, left: 16, right: 16, maxWidth: undefined }
        : { bottom: 16, left: 16, right: 16, maxWidth: undefined };
    }

    if (!rect) return { maxWidth: 420 };
    const preferredTop = rect.bottom + 16;
    const top = preferredTop + 220 < window.innerHeight ? preferredTop : Math.max(16, rect.top - 16 - 220);
    const left = clamp(rect.left, 16, window.innerWidth - 16 - 420);
    return { top, left, maxWidth: 420 };
  })();

  function finish() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="absolute inset-0 bg-black/60" />

      {highlight ? (
        <div
          className="absolute rounded-2xl ring-4 ring-rose-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      ) : null}

      <div
        className="absolute rounded-2xl bg-cyan-950/45 p-5 shadow-2xl max-h-[70vh] overflow-auto border border-cyan-100/15"
        style={cardStyle}
      >
        <div className="text-xs font-semibold text-cyan-100/60">Passo {idx + 1} / {steps.length}</div>
        <div className="mt-1 text-lg font-semibold text-white">{step.title}</div>
        <div className="mt-2 text-sm text-cyan-50/70 whitespace-pre-line">{step.body}</div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-medium text-cyan-50/70 hover:bg-slate-900"
            onClick={finish}
          >
            Salta
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-cyan-200/20 bg-cyan-950/45 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
            >
              Indietro
            </button>
            <button
              type="button"
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              onClick={() => (isLast ? finish() : setIdx((i) => Math.min(steps.length - 1, i + 1)))}
            >
              {isLast ? "Fine" : "Avanti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
