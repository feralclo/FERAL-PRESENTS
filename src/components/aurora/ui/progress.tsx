"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuroraProgressProps extends React.ComponentProps<"div"> {
  /** 0–100 percentage */
  value: number;
  /** Show percentage label */
  showLabel?: boolean;
}

function AuroraProgress({
  className,
  value,
  showLabel = false,
  ...props
}: AuroraProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-aurora-surface">
        <div
          className="aurora-capacity-bar absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-aurora-text-secondary tabular-nums">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}

export { AuroraProgress };
export type { AuroraProgressProps };
