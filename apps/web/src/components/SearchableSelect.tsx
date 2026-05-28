import React, { useEffect, useMemo, useRef, useState } from "react";

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
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-left text-sm transition ${
          disabled ? "border-slate-800 text-slate-600" : "border-slate-800 text-slate-100 hover:bg-slate-900"
        }`}
      >
        {selected?.label || placeholder || "Seleziona…"}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="border-b border-slate-800 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Cerca…"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#2EC4B6]/40"
            />
          </div>

          <div className="max-h-64 overflow-auto p-1">
            <button
              type="button"
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-900 ${value === "" ? "bg-slate-900" : ""}`}
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
                className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-900 ${o.value === value ? "bg-emerald-950/35" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500">Nessun risultato.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
