"use client";

import { useState, useEffect, useRef } from "react";

interface AuraCountdownProps {
  targetDate: string; // ISO date string
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Digit({ value, label }: { value: string; label: string }) {
  const prev = useRef(value);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (value !== prev.current) {
      setFlip(true);
      prev.current = value;
      const t = setTimeout(() => setFlip(false), 350);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-card/80 border border-border/50">
        <span
          className={`font-display text-lg font-bold tabular-nums text-foreground ${flip ? "aura-digit-change" : ""}`}
        >
          {value}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function AuraCountdown({ targetDate }: AuraCountdownProps) {
  const [remaining, setRemaining] = useState<{
    days: number;
    hours: number;
    mins: number;
    secs: number;
  } | null>(null);

  useEffect(() => {
    function calc() {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      const secs = Math.floor(diff / 1000);
      setRemaining({
        days: Math.floor(secs / 86400),
        hours: Math.floor((secs % 86400) / 3600),
        mins: Math.floor((secs % 3600) / 60),
        secs: secs % 60,
      });
    }

    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [targetDate]);

  if (!remaining) return null;

  return (
    <div className="flex items-center gap-2">
      <Digit value={pad(remaining.days)} label="Days" />
      <span className="text-muted-foreground/50 text-lg font-light pb-5">:</span>
      <Digit value={pad(remaining.hours)} label="Hrs" />
      <span className="text-muted-foreground/50 text-lg font-light pb-5">:</span>
      <Digit value={pad(remaining.mins)} label="Min" />
      <span className="text-muted-foreground/50 text-lg font-light pb-5">:</span>
      <Digit value={pad(remaining.secs)} label="Sec" />
    </div>
  );
}
