"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/hooks/useBranding";

export function AuraFooter() {
  const branding = useBranding();

  return (
    <footer className="mt-12">
      <Separator className="opacity-20" />
      <div className="mx-auto max-w-2xl px-5 sm:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {branding?.copyright_text ||
              `\u00A9 ${new Date().getFullYear()} ${branding?.org_name || "FERAL PRESENTS"}. All Rights Reserved.`}
          </p>
          <Badge variant="outline" className="gap-1.5 text-[10px] text-muted-foreground border-border/40">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-aura-success opacity-75 aura-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aura-success" />
            </span>
            Online
          </Badge>
        </div>
      </div>
    </footer>
  );
}
