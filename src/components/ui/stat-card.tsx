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
      <Card className="py-0 gap-0">
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
    <Card className="py-0 gap-0">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
            <Icon size={14} strokeWidth={1.5} className="text-muted-foreground/70" />
          </div>
        </div>
        <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  )
}

export { StatCard }
