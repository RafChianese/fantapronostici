import React, { useEffect, useMemo, useState } from "react";
import { Trophy, X } from "lucide-react";
import { Button } from "./ui";
import { FinalResultResponse } from "../lib/api";

function formatPrize(cents?: number | null) {
  if (typeof cents !== "number") return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function FinalCelebrationModal({
  leagueId,
  userId,
  result,
  forceOpen = false,
  onClose,
}: {
  leagueId: string;
  userId: string;
  result: FinalResultResponse | null;
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const myWinner = useMemo(
    () => result?.winners?.find((w) => w.userId === userId) || null,
    [result, userId],
  );
  const storageKey = result?.finalizedAt
    ? `fp_final_celebration_seen_${leagueId}_${userId}_${result.finalizedAt}`
    : "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!result?.finalized || !myWinner || !storageKey) return;
    if (forceOpen) {
      setOpen(true);
      return;
    }
    const seen = localStorage.getItem(storageKey);
    if (!seen) setOpen(true);
  }, [result?.finalized, myWinner?.userId, storageKey, forceOpen]);

  if (!result?.finalized || !myWinner || !open) return null;

  const prize = formatPrize(myWinner.prizeAmountCents);
  const close = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setOpen(false);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-slate-950/90 text-white backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 42 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-[-10%] h-3 w-2 animate-[tm-confetti_3.5s_linear_infinite] rounded-sm bg-cyan-200/80"
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 12) * 0.18}s`,
              transform: `rotate(${i * 17}deg)`,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/10 p-2"
      >
        <X size={20} />
      </button>
      <div className="flex min-h-screen items-center justify-center p-5">
        <div className="relative max-w-md rounded-[2rem] border border-amber-200/25 bg-white/10 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-amber-300/20 ring-1 ring-amber-200/30">
            <Trophy className="h-14 w-14 text-amber-100" />
          </div>
          <div className="mt-5 text-sm font-black uppercase tracking-[0.22em] text-amber-100">
            Torneo concluso
          </div>
          <h2 className="mt-2 text-3xl font-black tracking-tight">
            Complimenti!
          </h2>
          <p className="mt-3 text-lg text-cyan-50/85">
            Hai chiuso il torneo al{" "}
            <b className="text-white">{myWinner.position}° posto</b>.
          </p>
          {prize ? (
            <p className="mt-2 text-2xl font-black text-amber-100">
              Premio: {prize}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-cyan-50/65">
            La tua leggenda entra ufficialmente negli annali della lega.
          </p>
          <Button className="mt-6 w-full" onClick={close}>
            Festeggia
          </Button>
        </div>
      </div>
    </div>
  );
}
