"use client";

import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RepPageErrorProps {
  icon: LucideIcon;
  title?: string;
  message: string;
  onRetry: () => void;
}

/**
 * Shared error state for rep portal pages.
 * Icon + message + retry button — replaces 6 copy-pasted variants.
 */
export function RepPageError({ icon: Icon, title = "Something went wrong", message, onRetry }: RepPageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
        <Icon size={22} className="text-destructive" />
      </div>
      <p className="text-sm text-foreground font-medium mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw size={12} />
        Try again
      </Button>
    </div>
  );
}
