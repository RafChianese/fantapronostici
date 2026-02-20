import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const startValue = useRef(value);

  useEffect(() => {
    const start = startValue.current;
    const end = value;
    const startTime = performance.now();

    function animate(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.floor(start + (end - start) * progress);
      setDisplay(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
    startValue.current = value;
  }, [value, duration]);

  return <span>{display}</span>;
}