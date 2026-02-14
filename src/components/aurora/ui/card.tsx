"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuroraCardProps extends React.ComponentProps<"div"> {
  glass?: boolean;
  gradientBorder?: boolean;
  glow?: boolean;
}

function AuroraCard({
  className,
  glass = true,
  gradientBorder = false,
  glow = false,
  ...props
}: AuroraCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl transition-all duration-300",
        glass ? "aurora-glass" : "bg-aurora-card border border-aurora-border",
        gradientBorder && "aurora-gradient-border",
        glow && "aurora-glow",
        className
      )}
      {...props}
    />
  );
}

function AuroraCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-5 pb-0", className)}
      {...props}
    />
  );
}

function AuroraCardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-tight tracking-tight text-aurora-text",
        className
      )}
      {...props}
    />
  );
}

function AuroraCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

function AuroraCardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center p-5 pt-0", className)}
      {...props}
    />
  );
}

export { AuroraCard, AuroraCardHeader, AuroraCardTitle, AuroraCardContent, AuroraCardFooter };
