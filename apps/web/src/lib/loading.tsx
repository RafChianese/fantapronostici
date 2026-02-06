import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type LoadingCtx = {
  isLoading: boolean;
  show: () => void;
  hide: () => void;
};

const Ctx = createContext<LoadingCtx | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const show = useCallback(() => setCount((c) => c + 1), []);
  const hide = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  const value = useMemo(
    () => ({ isLoading: count > 0, show, hide }),
    [count, show, hide]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLoading() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLoading must be used within LoadingProvider");
  return v;
}
