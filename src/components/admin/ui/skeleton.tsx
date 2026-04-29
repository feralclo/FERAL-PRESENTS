"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AdminSkeleton — the loading-state building block.
 *
 * Use to compose `*PageSkeleton` components that match the populated layout.
 * Visual: subtle foreground tint with a calm pulse — no shimmer (the legacy
 * `capacity-shimmer` keyframe is too marketing for admin).
 *
 * Sizes are passed via Tailwind classes — pass `h-4 w-32` for a text line,
 * `h-10 w-full` for an input, `h-24 w-full rounded-lg` for a card. Don't
 * over-engineer with size variants.
 */

interface AdminSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `circle` for avatars; default is the rounded rectangle shape. */
  variant?: "default" | "circle";
}

export function AdminSkeleton({
  className,
  variant = "default",
  ...props
}: AdminSkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-foreground/[0.04] motion-safe:animate-pulse",
        variant === "circle" ? "rounded-full" : "rounded-md",
        className
      )}
      {...props}
    />
  );
}
