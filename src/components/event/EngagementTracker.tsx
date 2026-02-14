"use client";

import { useEffect, useRef } from "react";
import { useTraffic } from "@/hooks/useTraffic";
import { isEditorPreview } from "./ThemeEditorBridge";

/**
 * Invisible component that tracks scroll depth and time on page.
 * Matches existing feral-traffic.js engagement tracking.
 * Disabled in editor preview mode to avoid polluting analytics.
 */
export function EngagementTracker() {
  const { trackEngagement } = useTraffic();
  const scrollFired = useRef<Record<string, boolean>>({});
  const timeFired = useRef<Record<string, boolean>>({});

  useEffect(() => {
    // Don't track in editor preview mode
    if (isEditorPreview()) return;

    // Scroll depth tracking
    function handleScroll() {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = (scrollTop / docHeight) * 100;

      if (pct >= 25 && !scrollFired.current["25"]) {
        scrollFired.current["25"] = true;
        trackEngagement("scroll_25");
      }
      if (pct >= 50 && !scrollFired.current["50"]) {
        scrollFired.current["50"] = true;
        trackEngagement("scroll_50");
      }
      if (pct >= 75 && !scrollFired.current["75"]) {
        scrollFired.current["75"] = true;
        trackEngagement("scroll_75");
      }
      if (pct >= 100 && !scrollFired.current["100"]) {
        scrollFired.current["100"] = true;
        trackEngagement("scroll_100");
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Time on page tracking
    const timers = [
      { ms: 10000, key: "10s", type: "time_10s" as const },
      { ms: 30000, key: "30s", type: "time_30s" as const },
      { ms: 60000, key: "60s", type: "time_60s" as const },
      { ms: 120000, key: "120s", type: "time_120s" as const },
    ];

    const timeoutIds = timers.map((t) =>
      setTimeout(() => {
        if (!timeFired.current[t.key]) {
          timeFired.current[t.key] = true;
          trackEngagement(t.type);
        }
      }, t.ms)
    );

    return () => {
      window.removeEventListener("scroll", handleScroll);
      timeoutIds.forEach(clearTimeout);
    };
  }, [trackEngagement]);

  return null;
}
