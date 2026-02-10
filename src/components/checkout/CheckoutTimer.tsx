"use client";

import { useState, useEffect, useCallback } from "react";

const TOTAL_SECONDS = 482; // 8:02

interface CheckoutTimerProps {
  /** Timer only starts counting down when this is true */
  active: boolean;
}

/**
 * 8-minute checkout countdown timer.
 * Matches checkout/index.html lines 622-628 + JS lines 797-833 exactly.
 * Uses CSS classes from checkout-page.css — NO inline styles.
 */
export function CheckoutTimer({ active }: CheckoutTimerProps) {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [started, setStarted] = useState(false);

  // Start timer when active prop becomes true
  useEffect(() => {
    if (!active || started) return;
    setStarted(true);
  }, [active, started]);

  useEffect(() => {
    if (!started) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
  }, []);

  const isUrgent = remaining <= 120 && remaining > 0;
  const isExpired = remaining <= 0 && started;
  const fillWidth = started ? (remaining / TOTAL_SECONDS) * 100 : 100;

  const timerClasses = [
    "checkout-timer",
    isUrgent ? "checkout-timer--urgent" : "",
    isExpired ? "checkout-timer--expired" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={timerClasses} id="checkoutTimer">
      <span className="checkout-timer__label">Reservation expires</span>
      <span className="checkout-timer__time">{formatTime(remaining)}</span>
      <div className="checkout-timer__bar">
        <div
          className="checkout-timer__fill"
          style={{ width: `${fillWidth}%` }}
        />
      </div>
    </div>
  );
}
