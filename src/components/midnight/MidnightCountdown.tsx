"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface MidnightCountdownProps {
  eventDate: string;
}

/**
 * Countdown timer for events within 14 days.
 * Updates every minute. Switches to primary color within 24 hours.
 */
export function MidnightCountdown({ eventDate }: MidnightCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(null);

  useEffect(() => {
    function calc() {
      const now = Date.now();
      const target = new Date(eventDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      // Only show within 14 days
      const days = Math.floor(diff / 86400000);
      if (days > 14) {
        setTimeLeft(null);
        return;
      }

      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setTimeLeft({ days, hours, minutes });
    }

    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [eventDate]);

  if (!timeLeft) return null;

  const isUrgent = timeLeft.days === 0;
  const parts: string[] = [];
  if (timeLeft.days > 0) parts.push(`${timeLeft.days}d`);
  parts.push(`${timeLeft.hours}h`);
  parts.push(`${timeLeft.minutes}m`);

  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "font-[family-name:var(--font-mono)] text-[11px] max-[480px]:text-[10px] tracking-[0.08em] uppercase tabular-nums",
        isUrgent ? "text-primary" : "text-foreground/40",
      )}>
        {parts.join(" ")}
      </span>
      <span className={cn(
        "font-[family-name:var(--font-sans)] text-[9px] max-[480px]:text-[8px] tracking-[0.1em] uppercase",
        isUrgent ? "text-primary/60" : "text-foreground/25",
      )}>
        until doors
      </span>
    </div>
  );
}
