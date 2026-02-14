"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "live" | "low-stock" | "sold-out" | "vip" | "success";

interface AuroraBadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant;
  pulse?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "bg-aurora-surface text-aurora-text-secondary border-aurora-border",
  live:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "low-stock":
    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "sold-out":
    "bg-red-500/15 text-red-400 border-red-500/30",
  vip:
    "bg-primary/15 text-primary border-primary/30",
  success:
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function AuroraBadge({
  className,
  variant = "default",
  pulse = false,
  ...props
}: AuroraBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        pulse && "aurora-pulse",
        className
      )}
      {...props}
    />
  );
}

export { AuroraBadge };
export type { AuroraBadgeProps, BadgeVariant };
