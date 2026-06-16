import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "danger";

export type ToastInput = {
  tone: ToastTone;
  msg: string;
  ttlMs?: number;
};

export type ToastItem = ToastInput & { id: string };

type ToastContextValue = {
  push: (t: ToastInput) => void;
};

const Ctx = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, any>>({});

  const push = useCallback((t: ToastInput) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ttlMs = t.ttlMs ?? 4500;
    const item: ToastItem = { ...t, id, ttlMs };
    setItems((prev) => [item, ...prev].slice(0, 3));
    timersRef.current[id] = setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      delete timersRef.current[id];
    }, ttlMs);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[92vw] max-w-sm flex-col gap-2">
        {items.map((t) => {
          const cls =
            t.tone === "danger"
              ? "bg-rose-600 text-white"
              : t.tone === "success"
              ? "bg-amber-600 text-white"
              : "bg-slate-900 text-white";
          return (
            <div key={t.id} className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm shadow-lg ${cls}`}>
              {t.msg}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
