"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Hook to hide/show the header on scroll.
 * Matches original main.js lines 278-305 exactly:
 * - Always visible when scrollY <= 100
 * - Hidden when scrolling down past 300px
 * - Visible when scrolling up
 */
export function useHeaderScroll() {
  const [hidden, setHidden] = useState(false);
  const lastScroll = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentScroll = window.scrollY;

        if (currentScroll > 100) {
          if (currentScroll > lastScroll.current && currentScroll > 300) {
            setHidden(true);
          } else {
            setHidden(false);
          }
        } else {
          setHidden(false);
        }

        lastScroll.current = currentScroll;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
