import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-mono font-bold uppercase",
  {
    variants: {
      size: {
        sm: "h-8 w-8 text-[10px]",
        default: "h-10 w-10 text-xs",
        lg: "h-12 w-12 text-sm",
      },
      tier: {
        default: "bg-muted text-muted-foreground ring-1 ring-border",
        primary: "bg-primary/10 text-primary ring-1 ring-primary/25",
        gold: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25",
        green: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25",
      },
    },
    defaultVariants: {
      size: "default",
      tier: "default",
    },
  }
)

function Avatar({
  className,
  size,
  tier,
  initials,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof avatarVariants> & {
    initials: string
  }) {
  return (
    <div
      data-slot="avatar"
      className={cn(avatarVariants({ size, tier }), className)}
      {...props}
    >
      {initials}
    </div>
  )
}

export { Avatar, avatarVariants }
