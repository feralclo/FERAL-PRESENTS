import { useEffect, useState, useRef } from "react";

/**
 * Animated number counter hook.
 * Counts from 0 to `target` over `duration` ms using ease-out cubic easing.
 */
export function useCountUp(
  target: number,
  duration = 1200,
  enabled = true
): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target <= 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}
