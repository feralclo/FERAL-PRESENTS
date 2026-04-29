"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AdminPageHeader — every workspace admin page uses this.
 *
 * Locks in: H1 typography (Inter 24px 600), eyebrow placement, action
 * alignment, mobile collapse (actions stack on a new row at < sm).
 *
 * For hero moments (FreshTenantHero, FinishSection, the future Start
 * moment) DON'T use this — use a Display-typed heading directly. This
 * is the workspace pattern.
 */

interface AdminPageHeaderProps {
  /** Optional small uppercase label above the title. Space Mono, tracked, primary-tinted. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Single-line subtitle. Use a sibling element for richer subtitles (e.g. with a live indicator). */
  subtitle?: React.ReactNode;
  /** Right-aligned action slot (typically AdminButton). On mobile this wraps below. */
  actions?: React.ReactNode;
  className?: string;
}

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.005em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
