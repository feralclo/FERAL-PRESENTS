"use client";

import { cn } from "@/lib/utils";

interface CurrencyIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Currency icon — a sharp, edgy diamond/gem with inner facets.
 * Uses currentColor so it inherits text color from parent.
 *
 * Future: tenants will choose their own icon via admin settings.
 */
export function CurrencyIcon({ size = 16, className, style }: CurrencyIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      style={style}
    >
      {/* Outer diamond shape */}
      <path
        d="M12 2L22 9L12 22L2 9L12 2Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Top facet lines */}
      <path
        d="M2 9H22"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Inner facets */}
      <path
        d="M7 2.5L5 9L12 22L19 9L17 2.5"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeOpacity={0.5}
      />
    </svg>
  );
}
