"use client";

import { useState, useEffect } from "react";

interface CountdownResult {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  passed: boolean;
}

function calcRemaining(target: Date): CountdownResult {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, mins: 0, secs: 0, passed: true };
  }
  const totalSecs = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSecs / 86400),
    hours: Math.floor((totalSecs % 86400) / 3600),
    mins: Math.floor((totalSecs % 3600) / 60),
    secs: totalSecs % 60,
    passed: false,
  };
}

export function useCountdown(targetDate: Date): CountdownResult {
  const [countdown, setCountdown] = useState<CountdownResult>(() =>
    calcRemaining(targetDate)
  );

  useEffect(() => {
    // If already passed, no need to tick
    if (targetDate.getTime() <= Date.now()) {
      setCountdown({ days: 0, hours: 0, mins: 0, secs: 0, passed: true });
      return;
    }

    const interval = setInterval(() => {
      const result = calcRemaining(targetDate);
      setCountdown(result);
      if (result.passed) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}
