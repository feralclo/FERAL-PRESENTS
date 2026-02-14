"use client";

import { useBranding } from "@/hooks/useBranding";

export function AuroraFooter() {
  const branding = useBranding();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-aurora-border/50 bg-aurora-bg">
      <div className="mx-auto max-w-5xl px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-aurora-text-secondary">
        <span>
          &copy; {year}{" "}
          {branding.copyright_text ||
            `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Online
        </span>
      </div>
    </footer>
  );
}
