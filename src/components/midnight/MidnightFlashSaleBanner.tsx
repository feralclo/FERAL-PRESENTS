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

  const valueLabel =
    discount.type === "percentage"
      ? `${discount.value}%`
      : discount.value.toString();

  return (
    <div className="midnight-flash-sale mb-6">
      <div className="midnight-flash-sale-inner">
        {/* Top row: discount value + label */}
        <div className="flex items-center justify-center gap-3">
          <span className="midnight-flash-sale-dot" />
          <div className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-mono)] text-[28px] max-[480px]:text-[24px] font-black tracking-[-0.02em] text-foreground leading-none">
              {valueLabel}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[13px] max-[480px]:text-[11px] font-bold tracking-[0.1em] uppercase text-foreground/60">
              OFF EVERYTHING
            </span>
          </div>
        </div>

        {/* Bottom row: countdown or "DISCOUNT APPLIED" */}
        {hasCountdown ? (
          <div className="flex items-center justify-center gap-3 mt-2.5">
            <span className="font-[family-name:var(--font-sans)] text-[10px] tracking-[0.1em] text-foreground/25 uppercase">
              Ends in
            </span>
            <div className="flex items-center gap-1.5">
              {countdown.days > 0 && (
                <CountdownUnit value={countdown.days} label="d" />
              )}
              <CountdownUnit value={countdown.hours} label="h" />
              <span className="font-[family-name:var(--font-mono)] text-[14px] text-foreground/20 font-bold leading-none">:</span>
              <CountdownUnit value={countdown.mins} label="m" />
              <span className="font-[family-name:var(--font-mono)] text-[14px] text-foreground/20 font-bold leading-none">:</span>
              <CountdownUnit value={countdown.secs} label="s" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] text-foreground/25 uppercase">
              Discount Applied
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="font-[family-name:var(--font-mono)] text-[18px] max-[480px]:text-[16px] font-bold tabular-nums tracking-[0.02em] text-foreground/80 leading-none">
      {String(value).padStart(2, "0")}
      <span className="text-[9px] text-foreground/25 ml-0.5 font-medium">{label}</span>
    </span>
  );
}
