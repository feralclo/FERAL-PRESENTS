"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Minimal "Last ticket sold X min ago" social proof toast.
 * Same timing logic as the original SocialProofToast but with Tailwind styling.
 */
export function MidnightSocialProof() {
  const [visible, setVisible] = useState(false);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const shownRef = useRef(false);

  useEffect(() => {
    // Generate weighted random time
    const weights = [
      { min: 2, max: 5, weight: 0.45 },
      { min: 5, max: 12, weight: 0.35 },
      { min: 12, max: 20, weight: 0.15 },
      { min: 20, max: 35, weight: 0.05 },
    ];

    let rand = Math.random();
    let mins = 4;
    for (const w of weights) {
      if (rand < w.weight) {
        mins = w.min + Math.floor(Math.random() * (w.max - w.min));
        break;
      }
      rand -= w.weight;
    }
    setMinutesAgo(mins);

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
  }, []);

  const timeText = minutesAgo === 1 ? "1 min ago" : `${minutesAgo} min ago`;

  return (
    <div
      className={`fixed bottom-20 max-[480px]:bottom-[72px] left-6 max-[480px]:left-4 bg-[rgba(20,20,20,0.9)] backdrop-blur-[12px] border border-foreground/[0.06] px-4 max-[480px]:px-3.5 py-2.5 max-[480px]:py-2 rounded-[20px] max-[480px]:rounded-2xl z-[996] transition-all duration-500 pointer-events-none ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3"
      }`}
    >
      <span className="font-[family-name:var(--font-display)] text-xs max-[480px]:text-[11px] text-muted-foreground whitespace-nowrap">
        Last ticket sold{" "}
        <span className="text-muted-foreground font-medium">{timeText}</span>
      </span>
    </div>
  );
}
