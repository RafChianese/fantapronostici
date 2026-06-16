import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: string };

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  emptyLabel,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [panel, setPanel] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "bottom" | "top";
  } | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      // NOTE: options panel is rendered in a portal (document.body).
      // Prevent false outside-click when clicking inside the portal.
      // We stopPropagation on the panel, but keep this as a safety net.
      const target = e.target as HTMLElement | null;
      if (target && (target.closest?.('[data-searchable-select-panel="true"]') || target.closest?.('[data-searchable-select-root="true"]'))) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Compute floating panel position (portal) so it doesn't get clipped near the page bottom.
  useEffect(() => {
    if (!open) {
      setPanel(null);
      return;
    }
    function compute() {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - r.bottom;
      const spaceAbove = r.top;
      const want = 360; // desired panel height
      const placement: "bottom" | "top" = spaceBelow >= 220 || spaceBelow >= spaceAbove ? "bottom" : "top";
      const maxHeight = Math.max(180, Math.min(want, placement === "bottom" ? spaceBelow - 12 : spaceAbove - 12));
      const top = placement === "bottom" ? r.bottom + 8 : Math.max(8, r.top - 8 - maxHeight);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
      setPanel({ top, left, width: r.width, maxHeight, placement });
    }

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-searchable-select-root="true">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-xl border bg-slate-950/90 px-3 py-2 text-left text-sm transition ${
          disabled ? "border-amber-100/15 text-orange-50/60" : "border-amber-100/20 text-white hover:bg-slate-900/95"
        }`}
      >
        {selected?.label || placeholder || "Seleziona…"}
      </button>

      {open && panel
        ? createPortal(
            <div className="fixed inset-0 z-50" aria-hidden="true">
              <div className="absolute inset-0" onMouseDown={() => setOpen(false)} onTouchStart={() => setOpen(false)} />

              <div
                data-searchable-select-panel="true"
                className="absolute overflow-hidden rounded-2xl border border-amber-100/20 bg-slate-950 shadow-2xl ring-1 ring-amber-200/10"
                style={{ top: panel.top, left: panel.left, width: panel.width }}
                role="listbox"
                aria-label="Selettore"
                onMouseDown={(e) => {
                  // Prevent document mousedown handler from closing before option click.
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
              >
                <div className="border-b border-amber-100/15 p-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    placeholder="Cerca…"
                    className="w-full rounded-xl border border-amber-100/20 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-orange-50/60 outline-none focus:ring-2 focus:ring-amber-300/30"
                  />
                </div>

                <div className="overflow-auto p-1" style={{ maxHeight: panel.maxHeight }}>
                  <button
                    type="button"
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-slate-800 ${value === "" ? "bg-slate-700" : ""}`}
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    {emptyLabel || "—"}
                  </button>
                  {filtered.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-slate-800 ${o.value === value ? "bg-slate-800" : ""}`}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                  {filtered.length === 0 ? <div className="px-3 py-4 text-sm text-orange-50/60">Nessun risultato.</div> : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
