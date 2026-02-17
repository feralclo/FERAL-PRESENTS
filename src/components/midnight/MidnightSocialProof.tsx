"use client";

import { useState, useEffect, useRef } from "react";

interface MidnightSocialProofProps {
  eventId: string;
}

/**
 * "Last ticket sold X min ago" social proof — powered by real order data.
 * Fetches from /api/events/[id]/recent-activity. Shows nothing if no
 * recent orders exist. Appears after popup is dismissed with staggered delay.
 */
export function MidnightSocialProof({ eventId }: MidnightSocialProofProps) {
  const [visible, setVisible] = useState(false);
  const [timeText, setTimeText] = useState<string | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/events/${eventId}/recent-activity`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (!data.last_order_at) return;

        const diffMs = Date.now() - new Date(data.last_order_at).getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins > 60) return;

        const text = diffMins <= 1 ? "just now" : `${diffMins} min ago`;
        setTimeText(text);
      })
      .catch(() => {/* silently fail */});

    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (!timeText) return;

    const pageLoadTime = Date.now();
    const MIN_DELAY = 45000;
    const POST_POPUP_DELAY = 20000;
    let popupDismissed = false;
    let popupDismissedAt = 0;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function show() {
      if (shownRef.current) return;
      shownRef.current = true;
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), 6000);
    }

    function tryShow() {
      if (shownRef.current) return;
      const elapsed = Date.now() - pageLoadTime;
      const sincePopup = popupDismissed ? Date.now() - popupDismissedAt : 0;

      if (elapsed >= MIN_DELAY && popupDismissed && sincePopup >= POST_POPUP_DELAY) {
        show();
      } else if (popupDismissed) {
        const remainingMinDelay = Math.max(0, MIN_DELAY - elapsed);
        const remainingPopupDelay = Math.max(0, POST_POPUP_DELAY - sincePopup);
        const waitFor = Math.max(remainingMinDelay, remainingPopupDelay);
        showTimer = setTimeout(show, waitFor);
      }
    }

    function onPopupDismissed() {
      if (popupDismissed) return;
      popupDismissed = true;
      popupDismissedAt = Date.now();
      tryShow();
    }

    window.addEventListener("feral_popup_dismissed", onPopupDismissed);

    const fallbackTimer = setTimeout(() => {
      if (!popupDismissed) {
        popupDismissed = true;
        popupDismissedAt = Date.now() - POST_POPUP_DELAY;
        tryShow();
      }
    }, 90000);

    return () => {
      window.removeEventListener("feral_popup_dismissed", onPopupDismissed);
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      clearTimeout(fallbackTimer);
    };
  }, [timeText]);

  if (!timeText) return null;

  return (
    <div
      className={`fixed bottom-24 max-[480px]:bottom-[88px] left-4 max-[480px]:left-3 bg-[rgba(14,14,14,0.88)] backdrop-blur-[12px] border border-foreground/[0.05] px-3.5 max-[480px]:px-3 py-2 max-[480px]:py-1.5 rounded-xl z-[996] transition-all duration-500 pointer-events-none ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2"
      }`}
    >
      <span className="font-[family-name:var(--font-display)] text-[11px] max-[480px]:text-[10px] text-muted-foreground/70 whitespace-nowrap">
        Last ticket sold{" "}
        <span className="text-muted-foreground/90 font-medium">{timeText}</span>
      </span>
    </div>
  );
}
