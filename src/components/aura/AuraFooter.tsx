"use client";

import { useBranding } from "@/hooks/useBranding";

export function AuraFooter() {
  const branding = useBranding();

  return (
    <footer className="border-t border-border/20 py-6 mt-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {branding?.copyright_text || `© ${new Date().getFullYear()} ${branding?.org_name || "FERAL PRESENTS"}. All Rights Reserved.`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-aura-success opacity-75 aura-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aura-success" />
            </span>
            Online
          </div>
        </div>
      </div>
    </footer>
  );
}
