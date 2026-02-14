import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

function TrendBadge({
  value,
  format = "number",
  currencySymbol = "£",
  size = "sm",
  className,
}: {
  value: number
  format?: "percent" | "currency" | "number"
  currencySymbol?: string
  size?: "sm" | "md"
  className?: string
}) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isZero = value === 0

  const formatValue = () => {
    const abs = Math.abs(value)
    const prefix = isPositive ? "+" : isNegative ? "-" : ""
    switch (format) {
      case "percent":
        return `${prefix}${abs.toFixed(1)}%`
      case "currency":
        return `${prefix}${currencySymbol}${abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      case "number":
      default:
        return `${prefix}${abs.toLocaleString()}`
    }
  }

  const iconSize = size === "sm" ? 12 : 14
  const textClass = size === "sm" ? "text-[11px]" : "text-xs"

  if (isZero) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-mono font-medium text-muted-foreground",
          textClass,
          className
        )}
      >
        <Minus size={iconSize} strokeWidth={2} />
        <span>0</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono font-medium",
        textClass,
        isPositive && "text-success",
        isNegative && "text-destructive",
        className
      )}
    >
      {isPositive ? (
        <TrendingUp size={iconSize} strokeWidth={2} />
      ) : (
        <TrendingDown size={iconSize} strokeWidth={2} />
      )}
      <span>{formatValue()}</span>
    </span>
  )
}

export { TrendBadge }
