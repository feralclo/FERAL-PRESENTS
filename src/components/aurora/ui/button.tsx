"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "xl";

interface AuroraButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  glow?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
  secondary:
    "bg-aurora-surface text-aurora-text border border-aurora-border hover:bg-aurora-card",
  ghost:
    "text-aurora-text-secondary hover:text-aurora-text hover:bg-aurora-surface",
  outline:
    "border border-aurora-border text-aurora-text hover:bg-aurora-surface",
  destructive:
    "bg-destructive text-destructive-foreground hover:brightness-110",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2.5",
  xl: "h-14 px-8 text-lg rounded-xl gap-3",
};

function AuroraButton({
  className,
  variant = "primary",
  size = "md",
  glow = false,
  disabled,
  ...props
}: AuroraButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-aurora-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        "aurora-press",
        variantClasses[variant],
        sizeClasses[size],
        glow && variant === "primary" && "aurora-glow-accent",
        className
      )}
      disabled={disabled}
      {...props}
    />
  );
}

export { AuroraButton };
export type { AuroraButtonProps };
