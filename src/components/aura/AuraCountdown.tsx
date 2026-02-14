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
    <Badge variant="outline" className="tabular-nums font-medium text-sm px-2 py-1">
      <span>{value}</span>
      <span className="text-muted-foreground text-xs ml-0.5">{label}</span>
    </Badge>
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
    <div className="flex items-center gap-1.5">
      <Unit value={remaining.days} label="d" />
      <Unit value={remaining.hours} label="h" />
      <Unit value={remaining.mins} label="m" />
      <Unit value={remaining.secs} label="s" />
    </div>
  );
}
