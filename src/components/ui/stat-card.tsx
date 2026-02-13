import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"

/**
 * Shared stat card used across admin pages.
 *
 * - `default`  — Icon in a rounded box (top-right), large value. For 4-col grids.
 * - `compact`  — Icon inline with label, smaller value. For 6-col grids.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  size = "default",
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  detail?: string
  size?: "default" | "compact"
}) {
  if (size === "compact") {
    return (
      <Card className="py-0 gap-0 hover:border-primary/20 transition-all duration-300">
        <CardContent className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon size={13} strokeWidth={1.5} className="shrink-0" />
            {label}
          </p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {detail && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 transition-all duration-300 group-hover:bg-primary/12 group-hover:ring-primary/20">
            <Icon size={15} strokeWidth={1.5} className="text-primary/70 transition-colors duration-300 group-hover:text-primary" />
          </div>
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  )
}

export { StatCard }
