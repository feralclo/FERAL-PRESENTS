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

  const stateColor = isExpired
    ? "text-destructive"
    : isUrgent
      ? "text-[#f59e0b]"
      : "text-foreground/50";

  const progressBg = isExpired
    ? "midnight-timer-expired"
    : isUrgent
      ? "midnight-timer-urgent"
      : "";

  return (
    <div className="w-full">
      <div className="max-w-[1200px] mx-auto px-6 pt-4">
        <div className="max-w-[580px]">
          <div className="flex items-center gap-[7px]">
            <svg
              className={`w-[15px] h-[15px] shrink-0 ${stateColor} ${isUrgent && !isExpired ? "midnight-timer-pulse" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 9v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M16.5 6.5l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className={`font-[family-name:var(--font-sans)] text-[13px] ${stateColor} tracking-[0.1px]`}>
              {isExpired ? "Time\u2019s up \u2014 tickets released" : "Tickets held for"}
            </span>
            {!isExpired && (
              <span className={`font-[family-name:var(--font-mono)] text-[13px] font-semibold tracking-[0.5px] min-w-[40px] ${isUrgent ? "text-[#f59e0b]" : "text-foreground"}`}>
                {time}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Full-bleed track line — stretches edge-to-edge */}
      <div className="w-full h-px bg-white/[0.06] mt-3.5 relative overflow-hidden">
        <div
          className={`h-full rounded-[1px] transition-[width] duration-1000 ease-linear ${progressBg || "bg-white/20"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
