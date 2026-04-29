"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AdminEmptyState — the canonical "nothing here yet" pattern.
 *
 * Three flavours via the `variant` prop:
 *   - `inline` (default in a card): py-8, no icon-box border, smaller copy
 *   - `page` (full-page empty list): py-16, full pattern with primary + secondary action
 *   - `hero` (fresh-tenant moment): for the FreshTenantHero, use a dedicated
 *     component instead — this is just a normal empty state, not a moment.
 *
 * Copy rules:
 *   - Title: declarative, present tense. "No events yet." Not "You have no events."
 *   - Description: one sentence, ≤80 chars. Tells them what to do next.
 *   - Primary action: verb-led ("Create event"), not "Get started".
 */

interface AdminEmptyStateProps {
  /** Lucide icon element. Renders 24×24 inside a 48×48 primary-tinted box. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  variant?: "inline" | "page";
  className?: string;
}

export function AdminEmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = "inline",
  className,
}: AdminEmptyStateProps) {
  const padding = variant === "page" ? "py-16" : "py-10";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        padding,
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
