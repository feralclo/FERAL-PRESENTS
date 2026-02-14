"use client";

import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AuroraCounterProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

function AuroraCounter({
  value,
  min = 0,
  max = 10,
  onChange,
  disabled = false,
  className,
}: AuroraCounterProps) {
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const triggerAnimation = useCallback(() => {
    setAnimating(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setAnimating(false), 400);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const increment = useCallback(() => {
    if (disabled || value >= max) return;
    onChange(value + 1);
    triggerAnimation();
  }, [disabled, value, max, onChange, triggerAnimation]);

  const decrement = useCallback(() => {
    if (disabled || value <= min) return;
    onChange(value - 1);
    triggerAnimation();
  }, [disabled, value, min, onChange, triggerAnimation]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 rounded-xl border border-aurora-border bg-aurora-surface overflow-hidden",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || value <= min}
        className={cn(
          "flex h-10 w-10 items-center justify-center text-lg font-medium transition-colors",
          "hover:bg-aurora-card active:scale-95",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          "text-aurora-text-secondary"
        )}
        aria-label="Decrease quantity"
      >
        -
      </button>
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center text-sm font-semibold tabular-nums text-aurora-text",
          animating && "aurora-spring"
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={disabled || value >= max}
        className={cn(
          "flex h-10 w-10 items-center justify-center text-lg font-medium transition-colors",
          "hover:bg-aurora-card active:scale-95",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          "text-aurora-text-secondary"
        )}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

export { AuroraCounter };
export type { AuroraCounterProps };
