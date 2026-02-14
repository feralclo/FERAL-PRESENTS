"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuroraInputProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
}

function AuroraInput({
  className,
  label,
  error,
  id,
  ...props
}: AuroraInputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-aurora-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "h-11 w-full rounded-xl border border-aurora-border bg-aurora-surface px-4 text-sm text-aurora-text",
          "placeholder:text-aurora-text-secondary/50",
          "transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50",
          error && "border-destructive/50 focus:ring-destructive/40",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

export { AuroraInput };
export type { AuroraInputProps };
