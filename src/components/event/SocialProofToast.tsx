"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Minimal "Last ticket sold X min ago" social proof toast.
 *
 * Timing rules:
 * - Never shows before 45 seconds after page load
 * - Waits for the DiscountPopup to be dismissed (listens for `feral_popup_dismissed`)
 * - After popup dismisses, waits an additional 20 seconds before showing
 * - Visible for 6 seconds, then fades out
 */
export function SocialProofToast() {
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
    const MIN_DELAY = 45000; // 45 seconds minimum from page load
    const POST_POPUP_DELAY = 20000; // 20 seconds after popup dismisses
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
        // Popup has been dismissed — schedule for whichever is later
        const remainingMinDelay = Math.max(0, MIN_DELAY - elapsed);
        const remainingPopupDelay = Math.max(0, POST_POPUP_DELAY - sincePopup);
        const waitFor = Math.max(remainingMinDelay, remainingPopupDelay);
        showTimer = setTimeout(show, waitFor);
      }
      // If popup hasn't been dismissed yet, we wait for the event
    }

    function onPopupDismissed() {
      if (popupDismissed) return;
      popupDismissed = true;
      popupDismissedAt = Date.now();
      tryShow();
    }

    window.addEventListener("feral_popup_dismissed", onPopupDismissed);

    // Fallback: if popup event never fires (e.g., popup component not rendered),
    // show after 90 seconds regardless
    const fallbackTimer = setTimeout(() => {
      if (!popupDismissed) {
        popupDismissed = true;
        popupDismissedAt = Date.now() - POST_POPUP_DELAY; // skip the post-popup delay
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

  const timeText =
    minutesAgo === 1 ? "1 min ago" : `${minutesAgo} min ago`;

  return (
    <div className={`social-proof${visible ? " social-proof--visible" : ""}`}>
      <span className="social-proof__text">
        Last ticket sold <span className="social-proof__time">{timeText}</span>
      </span>
    </div>
  );
}
