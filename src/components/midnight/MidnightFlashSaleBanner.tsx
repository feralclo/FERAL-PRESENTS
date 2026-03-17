"use client";

import { useMemo, useEffect } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import type { DiscountDisplay } from "./discount-utils";

interface MidnightFlashSaleBannerProps {
  discount: DiscountDisplay;
  expiresAt: string | null;
  onExpired?: () => void;
}

export function MidnightFlashSaleBanner({
  discount,
  expiresAt,
  onExpired,
}: MidnightFlashSaleBannerProps) {
  const targetDate = useMemo(
    () => (expiresAt ? new Date(expiresAt) : null),
    [expiresAt]
  );

  const countdown = useCountdown(targetDate ?? new Date(0));
  const hasCountdown = !!targetDate && !countdown.passed;

  // Notify parent when countdown expires
  useEffect(() => {
    if (targetDate && countdown.passed) {
      onExpired?.();
    }
  }, [countdown.passed, targetDate, onExpired]);

  const label =
    discount.type === "percentage"
      ? `${discount.value}% OFF`
      : `${discount.value} OFF`;

  // Format countdown — show hours:mins:secs if under 24h, otherwise days + hours
  const timeDisplay = hasCountdown
    ? countdown.days > 0
      ? `${countdown.days}d ${pad(countdown.hours)}h ${pad(countdown.mins)}m`
      : `${pad(countdown.hours)}:${pad(countdown.mins)}:${pad(countdown.secs)}`
    : null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Left: sale label */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="midnight-flash-sale-dot" />
          <div className="min-w-0">
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[0.06em] text-foreground">
              {label}
            </span>
            <span className="ml-2 font-[family-name:var(--font-sans)] text-[11px] text-foreground/40">
              EVERYTHING
            </span>
          </div>
        </div>

        {/* Right: countdown or "APPLIED" */}
        {timeDisplay ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-[family-name:var(--font-sans)] text-[10px] tracking-[0.08em] text-foreground/30 uppercase">
              Ends in
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-bold tabular-nums tracking-[0.04em] text-foreground/70">
              {timeDisplay}
            </span>
          </div>
        ) : (
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.1em] text-foreground/30 uppercase shrink-0">
            Applied
          </span>
        )}
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
