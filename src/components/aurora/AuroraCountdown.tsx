"use client";

import { useState, useEffect, useCallback } from "react";

interface AuroraCountdownProps {
  targetDate: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(target: string): TimeLeft {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="aurora-glass rounded-xl px-3 py-2 min-w-[56px] text-center">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-aurora-text">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="mt-1.5 text-[10px] uppercase tracking-wider text-aurora-text-secondary">
        {label}
      </span>
    </div>
  );
}

export function AuroraCountdown({ targetDate }: AuroraCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(targetDate)
  );

  const update = useCallback(() => {
    setTimeLeft(calculateTimeLeft(targetDate));
  }, [targetDate]);

  useEffect(() => {
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [update]);

  const isOver =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0;

  if (isOver) return null;

  return (
    <div className="flex items-center gap-3">
      <Digit value={timeLeft.days} label="Days" />
      <span className="text-xl font-bold text-aurora-text-secondary mt-[-16px]">:</span>
      <Digit value={timeLeft.hours} label="Hours" />
      <span className="text-xl font-bold text-aurora-text-secondary mt-[-16px]">:</span>
      <Digit value={timeLeft.minutes} label="Mins" />
      <span className="text-xl font-bold text-aurora-text-secondary mt-[-16px]">:</span>
      <Digit value={timeLeft.seconds} label="Secs" />
    </div>
  );
}
