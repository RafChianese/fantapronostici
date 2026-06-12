import { useEffect, useMemo, useRef, useState } from "react";

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Number(value.toFixed(2));
  return Number.isInteger(normalized) ? 0 : 2;
}

function formatNumber(value: number, places: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (places <= 0) return String(Math.round(safeValue));
  return safeValue.toFixed(places).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(safeValue);
  const startValue = useRef(safeValue);
  const places = useMemo(() => decimalPlaces(safeValue), [safeValue]);

  useEffect(() => {
    const start = Number.isFinite(startValue.current) ? startValue.current : 0;
    const end = safeValue;
    const startTime = performance.now();

    function animate(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = start + (end - start) * progress;
      setDisplay(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplay(end);
      }
    }

    requestAnimationFrame(animate);
    startValue.current = end;
  }, [safeValue, duration]);

  return <span>{formatNumber(display, places)}</span>;
}
