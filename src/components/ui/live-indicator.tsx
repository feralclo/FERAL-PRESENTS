import * as React from "react"
import { cn } from "@/lib/utils"

const COLORS = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  primary: "bg-primary",
} as const

function LiveIndicator({
  color = "success",
  size = "sm",
  label,
  className,
}: {
  color?: keyof typeof COLORS
  size?: "sm" | "md"
  label?: string
  className?: string
}) {
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"
  const pingSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative inline-flex">
        <span
          className={cn(
            "absolute inline-flex rounded-full opacity-75 animate-ping",
            pingSize,
            COLORS[color]
          )}
        />
        <span
          className={cn("relative inline-flex rounded-full", dotSize, COLORS[color])}
        />
      </span>
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </span>
  )
}

export { LiveIndicator }
