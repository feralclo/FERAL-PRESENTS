import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ...props
}: React.ComponentProps<"div"> & {
  value?: number
  max?: number
  indicatorClassName?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-all duration-300",
          indicatorClassName
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
