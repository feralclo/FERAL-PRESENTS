"use client";

import { useState, useEffect, useRef } from "react";

const TOTAL_SECONDS = 480; // 8 minutes

interface CheckoutTimerProps {
  /** Timer starts counting when this becomes true */
  active: boolean;
  /** Called once when time runs out */
  onExpire?: () => void;
}

/**
 * Checkout reservation timer.
 * Sits between the header and checkout content.
 * Clean, inline design: clock icon + "Tickets held for" + time + progress track.
 * Turns amber under 2 minutes, red when expired.
 */
export function CheckoutTimer({ active, onExpire }: CheckoutTimerProps) {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [started, setStarted] = useState(false);
  const expireFired = useRef(false);

  useEffect(() => {
    if (!active || started) return;
    setStarted(true);
  }, [active, started]);

  useEffect(() => {
    if (!started) return;

    const tick = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(tick);
          if (!expireFired.current) {
            expireFired.current = true;
            onExpire?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [started, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const time = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  const isUrgent = remaining <= 120 && remaining > 0;
  const isExpired = remaining <= 0 && started;
  const progress = started ? (remaining / TOTAL_SECONDS) * 100 : 100;

  const cls = [
    "checkout-timer",
    isUrgent ? "checkout-timer--urgent" : "",
    isExpired ? "checkout-timer--expired" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="checkout-timer__inner">
        <div className="checkout-timer__row">
          <svg className="checkout-timer__icon" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 9v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16.5 6.5l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="checkout-timer__label">
            {isExpired ? "Time\u2019s up \u2014 tickets released" : "Tickets held for"}
          </span>
          {!isExpired && (
            <span className="checkout-timer__time">{time}</span>
          )}
        </div>
        <div className="checkout-timer__track">
          <div
            className="checkout-timer__progress"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
