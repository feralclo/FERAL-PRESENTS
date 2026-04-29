"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AdminCard — the canonical admin container.
 *
 * Recipe: `border border-border/40 bg-card rounded-lg`. Padding is applied to
 * `AdminCardContent` (px-5 py-4 default) so we don't double-pad. Use this for
 * everything: KPI tiles, form sections, list items, info panels.
 *
 * Hover effects are opt-in via the `interactive` prop — admin cards generally
 * don't lift on hover (it's a workspace, not a marketing page). Only enable it
 * when the whole card is a link target.
 */

export interface AdminCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, applies a subtle border-color shift on hover (use only when the card is a link). */
  interactive?: boolean;
  /** Visual treatment override. `accent` adds a thin primary-tinted border; default is neutral. */
  tone?: "default" | "accent" | "warning" | "destructive";
}

export const AdminCard = React.forwardRef<HTMLDivElement, AdminCardProps>(
  function AdminCard({ className, interactive, tone = "default", ...props }, ref) {
    return (
      <div
        ref={ref}
        data-tone={tone}
        className={cn(
          "rounded-lg border bg-card transition-colors duration-200",
          tone === "default" && "border-border/40",
          tone === "accent" && "border-primary/20",
          tone === "warning" && "border-warning/30",
          tone === "destructive" && "border-destructive/30",
          interactive && "hover:border-primary/30",
          className
        )}
        {...props}
      />
    );
  }
);

export const AdminCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AdminCardHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-start justify-between gap-3 px-5 pt-4 pb-3",
        className
      )}
      {...props}
    />
  );
});

export const AdminCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function AdminCardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn(
        "text-[15px] font-semibold leading-tight text-foreground",
        className
      )}
      {...props}
    />
  );
});

export const AdminCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AdminCardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn("mt-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
});

export const AdminCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AdminCardContent({ className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("px-5 py-4", className)} {...props} />
  );
});

export const AdminCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AdminCardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3",
        className
      )}
      {...props}
    />
  );
});

/**
 * AdminPanel — heavier surface for sticky sidebars, hero moments, the
 * canvas form pane. Bigger radius, deeper shadow, more padding.
 */
export const AdminPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AdminPanel({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-border/60 bg-card p-6 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.4)]",
        className
      )}
      {...props}
    />
  );
});
