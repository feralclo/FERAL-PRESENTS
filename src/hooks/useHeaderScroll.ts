"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Hook to hide/show the header on scroll.
 * - Always visible when scrollY <= 100
 * - Hidden when scrolling down past 300px
 * - Visible when scrolling up
 * - 8px hysteresis prevents flickering on small scroll jitter
 */
export function useHeaderScroll() {
  const [hidden, setHidden] = useState(false);
  const lastScroll = useRef(0);
  const lastDirection = useRef<"up" | "down">("up");
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentScroll = window.scrollY;
        const delta = currentScroll - lastScroll.current;

        // Ignore tiny scroll deltas (jitter / momentum wobble)
        if (Math.abs(delta) < 8) {
          ticking.current = false;
          return;
        }

        const direction = delta > 0 ? "down" : "up";

        if (currentScroll <= 100) {
          setHidden(false);
        } else if (direction === "down" && currentScroll > 300) {
          setHidden(true);
        } else if (direction === "up") {
          setHidden(false);
        }

        lastDirection.current = direction;
        lastScroll.current = currentScroll;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
