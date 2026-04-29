"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * AdminBadge — status pills, metadata chips.
 *
 * `variant="status"` accepts a `status` prop and maps to the canonical
 * status colour table (admin-ux-design.md Section 4.4). For everything
 * else use the semantic variants directly.
 *
 * Always Space Mono — status pills should feel like labels on equipment,
 * not marketing badges.
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border-border/60 bg-foreground/[0.04] text-foreground/75",
        primary:
          "border-primary/25 bg-primary/[0.06] text-primary",
        success:
          "border-success/30 bg-success/[0.06] text-success",
        warning:
          "border-warning/30 bg-warning/[0.06] text-warning",
        destructive:
          "border-destructive/30 bg-destructive/[0.06] text-destructive",
        info:
          "border-info/30 bg-info/[0.06] text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const STATUS_TO_VARIANT: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  draft: "default",
  live: "success",
  past: "default",
  cancelled: "destructive",
  archived: "default",
  action_needed: "warning",
  pending: "warning",
};

export interface AdminBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Show a small leading dot (matches the live indicator pattern). Auto-pulses on success. */
  dot?: boolean;
}

export function AdminBadge({
  className,
  variant,
  dot = false,
  children,
  ...props
}: AdminBadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {variant === "success" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

/** Status pill — pass a domain status string ("draft", "live", "cancelled"…) and we map to the canonical variant. */
export function AdminStatusBadge({
  status,
  className,
  dot,
}: {
  status: string;
  className?: string;
  dot?: boolean;
}) {
  const variant = STATUS_TO_VARIANT[status] ?? "default";
  return (
    <AdminBadge variant={variant} className={className} dot={dot ?? variant === "success"}>
      {status.replace(/_/g, " ")}
    </AdminBadge>
  );
}
