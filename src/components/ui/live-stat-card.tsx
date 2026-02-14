import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { LiveIndicator } from "@/components/ui/live-indicator"
import { TrendBadge } from "@/components/ui/trend-badge"
import { cn } from "@/lib/utils"

function LiveStatCard({
  label,
  value,
  icon: Icon,
  detail,
  live,
  trend,
  className,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  detail?: string
  live?: boolean
  trend?: { value: number; format: "percent" | "currency" | "number"; currencySymbol?: string }
  className?: string
}) {
  return (
    <Card className={cn("py-0 gap-0 group hover:border-primary/20 transition-all duration-300", className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          {live ? (
            <LiveIndicator color="success" size="sm" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 transition-all duration-300 group-hover:bg-primary/12 group-hover:ring-primary/20">
              <Icon size={15} strokeWidth={1.5} className="text-primary/70 transition-colors duration-300 group-hover:text-primary" />
            </div>
          )}
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {trend && (
            <TrendBadge
              value={trend.value}
              format={trend.format}
              currencySymbol={trend.currencySymbol}
            />
          )}
          {detail && (
            <span className="text-xs text-muted-foreground">{detail}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { LiveStatCard }
