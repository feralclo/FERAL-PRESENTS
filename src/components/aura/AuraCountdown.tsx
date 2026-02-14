"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface AuraCountdownProps {
  targetDate: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold tabular-nums leading-none">{String(value).padStart(2, "0")}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

export function AuraCountdown({ targetDate }: AuraCountdownProps) {
  const [remaining, setRemaining] = useState<TimeRemaining | null>(null);
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    function calc() {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        setPassed(true);
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      setRemaining({
        days: Math.floor(totalSecs / 86400),
        hours: Math.floor((totalSecs % 86400) / 3600),
        mins: Math.floor((totalSecs % 3600) / 60),
        secs: totalSecs % 60,
      });
    }

    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [targetDate]);

  if (passed) {
    return <Badge variant="secondary">Event started</Badge>;
  }

  if (!remaining) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-2.5">
      <Unit value={remaining.days} label="days" />
      <span className="text-muted-foreground/40">:</span>
      <Unit value={remaining.hours} label="hrs" />
      <span className="text-muted-foreground/40">:</span>
      <Unit value={remaining.mins} label="min" />
      <span className="text-muted-foreground/40">:</span>
      <Unit value={remaining.secs} label="sec" />
    </div>
  );
}
